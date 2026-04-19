from __future__ import annotations

import base64
import hashlib
import hmac
import json
import time
import urllib.error
import urllib.parse
import urllib.request
import uuid
from datetime import datetime, timedelta

from flask import Flask, jsonify, request

from firebase_store import (
    create_item,
    create_license,
    create_user,
    delete_license,
    delete_item,
    ensure_defaults,
    generate_license_keys,
    get_item,
    get_settings,
    list_collection,
    list_users,
    set_settings,
    toggle_user_ban,
    update_license,
    update_item,
)


app = Flask(__name__)


DATE_FORMAT = "%Y-%m-%d %H:%M:%S"


def now_str() -> str:
    return time.strftime(DATE_FORMAT)


def parse_dt(value: str | None) -> datetime | None:
    text = str(value or "").strip()
    if not text:
        return None
    try:
        return datetime.strptime(text, DATE_FORMAT)
    except ValueError:
        return None


def format_dt(value: datetime | None) -> str:
    return value.strftime(DATE_FORMAT) if value else ""


def find_admin_by_telegram_id(telegram_id: str) -> dict:
    target = str(telegram_id or "").strip()
    if not target:
        return {}
    return next((item for item in list_collection("admins") if str(item.get("telegram_id", "")).strip() == target), {})


def normalize_login_email(value: str | None) -> str:
    return str(value or "").strip().lower()


def hash_password(value: str) -> str:
    text = str(value or "")
    if not text:
        return ""
    return hashlib.sha256(text.encode("utf-8")).hexdigest()


def verify_password(value: str, hashed: str) -> bool:
    text = str(value or "")
    current_hash = str(hashed or "").strip()
    if not text or not current_hash:
        return False
    return hmac.compare_digest(hash_password(text), current_hash)


def sanitize_admin_record(record: dict) -> dict:
    clean = dict(record or {})
    clean.pop("password_hash", None)
    clean.pop("login_password", None)
    return clean


def find_admin_by_email(email: str) -> dict:
    target = normalize_login_email(email)
    if not target:
        return {}
    return next((item for item in list_collection("admins") if normalize_login_email(item.get("login_email", "")) == target), {})


def admin_access_by_id(item_id: str, seen: set[str] | None = None) -> dict:
    record = get_item("admins", str(item_id).strip())
    if not record:
        return {"active": False, "reason": "not_admin", "record": {}}
    return _admin_access_from_record(record, seen)


def _admin_access_from_record(record: dict, seen: set[str] | None = None) -> dict:
    seen = seen or set()
    if not record:
        return {"active": False, "reason": "not_admin", "record": {}}
    record_id = str(record.get("id", "")).strip()
    if record_id in seen:
        return {"active": False, "reason": "parent_loop", "record": record}
    seen.add(record_id)
    normalized = normalize_admin_record(record)
    if normalized != record and record_id:
        update_item("admins", record_id, normalized)
        normalized["id"] = record_id
    if normalized.get("status") != "active":
        return {"active": False, "reason": normalized.get("status", "inactive"), "record": sanitize_admin_record(normalized)}
    parent_id = str(normalized.get("parent_admin_id", "")).strip()
    if parent_id:
        parent = get_item("admins", parent_id)
        if parent:
            parent_access = _admin_access_from_record(parent, seen)
            if not parent_access.get("active"):
                normalized["status"] = "expired"
                update_item("admins", str(normalized["id"]), normalized)
                return {"active": False, "reason": "parent_inactive", "record": sanitize_admin_record(normalized)}
    return {"active": True, "reason": "active", "record": sanitize_admin_record(normalized)}


def log_activity(admin_id: str, action: str, metadata: dict | None = None) -> str:
    payload = {
        "admin_id": str(admin_id or "").strip(),
        "action": str(action or "").strip(),
        "date": now_str(),
        "metadata": metadata or {},
    }
    return create_item("activity_logs", payload)


def list_activity_logs(admin_id: str | None = None, action: str | None = None) -> list[dict]:
    items = list_collection("activity_logs")
    if admin_id:
        items = [item for item in items if str(item.get("admin_id", "")) == str(admin_id)]
    if action:
        items = [item for item in items if str(item.get("action", "")) == str(action)]
    items.sort(key=lambda item: str(item.get("date", "")), reverse=True)
    return items


def normalize_admin_record(payload: dict) -> dict:
    now = datetime.now()
    current = dict(payload)
    custom_days = int(current.get("custom_days", current.get("plan_days", 0)) or 0)
    subscription_price = float(current.get("subscription_price", current.get("price", 0)) or 0)
    starts_at = parse_dt(current.get("starts_at") or current.get("start_date"))
    expires_at = parse_dt(current.get("expires_at") or current.get("expiry_date"))
    raw_status = str(current.get("status", "active") or "active").strip().lower()
    status = "suspended" if raw_status in {"suspended", "disabled", "banned"} else "active"
    if not starts_at:
        starts_at = now
    days_left = 9999 if status == "active" else 0
    telegram_id = str(current.get("telegram_chat_id", current.get("telegram_id", ""))).strip()
    plan_id = str(current.get("plan_id", "")).strip()
    login_email = normalize_login_email(current.get("login_email", ""))
    password_hash = str(current.get("password_hash", "")).strip()
    login_password = str(current.get("login_password", "")).strip()
    if login_password:
        password_hash = hash_password(login_password)
    return {
        **current,
        "telegram_id": telegram_id,
        "telegram_chat_id": telegram_id,
        "name": str(current.get("name", "")).strip(),
        "username": str(current.get("username", "")).strip(),
        "parent_admin_id": str(current.get("parent_admin_id", "")).strip(),
        "panel_role": str(current.get("panel_role", "admin") or "admin").strip(),
        "plan_id": plan_id,
        "plan_name": str(current.get("plan_name", "Lifetime Access") or "Lifetime Access").strip(),
        "subscription_price": subscription_price,
        "custom_days": max(custom_days, 0),
        "starts_at": format_dt(starts_at),
        "start_date": format_dt(starts_at),
        "expires_at": format_dt(expires_at),
        "expiry_date": format_dt(expires_at),
        "days_left": days_left,
        "remaining_days": days_left,
        "status": status,
        "balance": float(current.get("balance", 0) or 0),
        "notes": str(current.get("notes", "")).strip(),
        "login_email": login_email,
        "password_hash": password_hash,
    }


def admin_access_record(telegram_id: str, seen: set[str] | None = None) -> dict:
    record = next((item for item in list_collection("admins") if str(item.get("telegram_id", "")).strip() == str(telegram_id).strip()), None)
    if not record:
        return {"active": False, "reason": "not_admin", "record": {}}
    return _admin_access_from_record(record, seen)


def match_owner_plan(admin_record: dict) -> dict:
    plans = [item for item in list_collection("owner_plans") if int(item.get("is_active", 1) or 1) == 1]
    plan_id = str(admin_record.get("plan_id", "")).strip()
    if plan_id:
        plan = get_item("owner_plans", plan_id)
        if plan:
            return plan
    plan_name = str(admin_record.get("plan_name", "")).strip().lower()
    custom_days = int(admin_record.get("custom_days", 30) or 30)
    for plan in plans:
        if str(plan.get("name", "")).strip().lower() == plan_name and int(plan.get("days", 0) or 0) == custom_days:
            return plan
    for plan in plans:
        if int(plan.get("days", 0) or 0) == custom_days:
            return plan
    return {}


def active_super_admins() -> list[dict]:
    items = []
    for item in list_collection("admins"):
        normalized = normalize_admin_record(item)
        normalized["id"] = str(item.get("id", ""))
        if str(normalized.get("panel_role", "admin")) != "admin":
            continue
        access = admin_access_by_id(str(normalized.get("id", "")))
        if access.get("active"):
            items.append(access.get("record") or normalized)
    return items


def primary_admin_contact() -> dict:
    items = active_super_admins()
    if not items:
        return {"username": "", "telegram_id": "", "name": "Admin"}
    first = items[0]
    return {
        "username": str(first.get("username", "")).strip(),
        "telegram_id": str(first.get("telegram_id", "")).strip(),
        "name": str(first.get("name", "")).strip() or "Admin",
    }


def json_body() -> dict:
    payload = request.get_json(silent=True)
    return payload if isinstance(payload, dict) else {}


def website_base_url() -> str:
    origin = request.headers.get("Origin") or request.headers.get("Referer") or ""
    origin = origin.strip().rstrip("/")
    if origin:
        if origin.endswith("/"):
            origin = origin[:-1]
        return origin
    return request.host_url.rstrip("/")


def cashfree_base_url() -> str:
    settings = get_settings()
    environment = str(settings.get("cashfree_environment", "production") or "production").strip().lower()
    return "https://sandbox.cashfree.com" if environment == "sandbox" else "https://api.cashfree.com"


def cashfree_headers() -> dict:
    settings = get_settings()
    return {
        "Content-Type": "application/json",
        "x-api-version": "2025-01-01",
        "x-client-id": str(settings.get("cashfree_app_id", "")).strip(),
        "x-client-secret": str(settings.get("cashfree_secret_key", "")).strip(),
        "x-request-id": str(uuid.uuid4()),
    }


def cashfree_request(method: str, resource: str, payload: dict | None = None) -> dict:
    data = None
    if payload is not None:
        data = json.dumps(payload).encode("utf-8")
    req = urllib.request.Request(
        f"{cashfree_base_url()}{resource}",
        data=data,
        headers=cashfree_headers(),
        method=method,
    )
    with urllib.request.urlopen(req, timeout=30) as response:
        raw = response.read().decode("utf-8")
        return json.loads(raw) if raw else {}


def create_cashfree_order_for_admin(admin_record: dict, plan: dict) -> dict:
    for item in list_collection("payment_requests"):
        if str(item.get("type", "")) != "panel_renew":
            continue
        if str(item.get("admin_id", "")) != str(admin_record.get("id", "")).strip():
            continue
        if str(item.get("status", "")) not in {"pending", "submitted", "gateway_created"}:
            continue
        update_item("payment_requests", str(item.get("id", "")), {"status": "cancelled", "updated_at": now_str()})
    order_id = f"panel_{str(admin_record.get('id', 'admin'))}_{int(time.time())}"
    amount = float(plan.get("price", 0) or 0)
    telegram_id = str(admin_record.get("telegram_id", "")).strip()
    callback_url = f"{website_base_url()}/renew/callback?order_id={urllib.parse.quote(order_id)}"
    customer_phone = "".join(ch for ch in telegram_id if ch.isdigit())[-10:] or "9999999999"
    if len(customer_phone) < 10:
        customer_phone = customer_phone.rjust(10, "9")
    payload = {
        "order_id": order_id,
        "order_amount": amount,
        "order_currency": "INR",
        "customer_details": {
            "customer_id": f"tg_{telegram_id or admin_record.get('id', '0')}",
            "customer_name": str(admin_record.get("name", "Super Admin") or "Super Admin")[:60],
            "customer_email": f"admin{telegram_id or admin_record.get('id', '0')}@panel.local",
            "customer_phone": customer_phone,
        },
        "order_meta": {
            "return_url": f"{callback_url}&cf_order_id={{order_id}}",
        },
        "order_note": f"Membership renewal for {admin_record.get('name') or telegram_id}",
    }
    response = cashfree_request("POST", "/pg/orders", payload)
    request_id = create_item(
        "payment_requests",
        {
            "type": "panel_renew",
            "telegram_id": telegram_id,
            "admin_id": str(admin_record.get("id", "")).strip(),
            "plan_id": str(plan.get("id", "")).strip(),
            "product_id": "",
            "renew_days": int(plan.get("days", admin_record.get("custom_days", 30)) or 30),
            "plan_name": str(plan.get("name", admin_record.get("plan_name", "Renewal"))),
            "amount": amount,
            "status": "gateway_created",
            "upi_ref": "",
            "gateway": "cashfree",
            "gateway_order_id": order_id,
            "created_at": now_str(),
            "updated_at": now_str(),
        },
    )
    log_activity(str(admin_record.get("id", "")), "renew_order_created", {"plan_id": plan.get("id", ""), "gateway_order_id": order_id})
    create_item(
        "gateway_orders",
        {
            "order_id": order_id,
            "gateway": "cashfree",
            "payment_request_id": request_id,
            "admin_id": str(admin_record.get("id", "")).strip(),
            "plan_id": str(plan.get("id", "")).strip(),
            "status": str(response.get("order_status", "ACTIVE") or "ACTIVE"),
            "created_at": now_str(),
        },
    )
    return {
        **response,
        "request_id": request_id,
        "order_id": order_id,
        "admin_id": str(admin_record.get("id", "")).strip(),
    }


def apply_plan_renewal(admin_record: dict, plan: dict, source: str) -> dict:
    renew_days = int(plan.get("days", admin_record.get("custom_days", 30)) or 30)
    start_from = parse_dt(admin_record.get("expires_at")) or datetime.now()
    if start_from < datetime.now():
        start_from = datetime.now()
    new_expiry = start_from + timedelta(days=max(renew_days, 1))
    updated = normalize_admin_record(
        {
            **admin_record,
            "plan_id": str(plan.get("id", admin_record.get("plan_id", ""))).strip(),
            "plan_name": str(plan.get("name", admin_record.get("plan_name", "Renewed Plan"))),
            "subscription_price": float(plan.get("price", admin_record.get("subscription_price", 0)) or 0),
            "custom_days": renew_days,
            "starts_at": admin_record.get("starts_at") or now_str(),
            "expires_at": format_dt(new_expiry),
            "status": "active",
        }
    )
    update_item("admins", str(admin_record.get("id", "")), updated)
    log_activity(str(admin_record.get("id", "")), "membership_renewed", {"source": source, "plan_id": plan.get("id", ""), "days": renew_days})
    if str(updated.get("telegram_id", "")).strip():
        send_telegram_message(
            str(updated.get("telegram_id", "")),
            f"Membership renewed successfully.\nPlan: {updated.get('plan_name')}\nDays Left: {updated.get('days_left')}\nExpiry: {updated.get('expires_at')}",
        )
    return updated


def bootstrap_super_admin_account(plan: dict) -> dict:
    payload = normalize_admin_record(
        {
            "telegram_id": "",
            "telegram_chat_id": "",
            "name": "Super Admin",
            "username": "",
            "parent_admin_id": "",
            "panel_role": "admin",
            "plan_id": str(plan.get("id", "")).strip(),
            "plan_name": str(plan.get("name", "Membership Plan")).strip(),
            "subscription_price": float(plan.get("price", 0) or 0),
            "custom_days": int(plan.get("days", 30) or 30),
            "status": "inactive",
            "notes": "Bootstrapped from website membership flow",
        }
    )
    admin_id = create_item("admins", payload)
    log_activity(admin_id, "admin_bootstrapped", {"plan_id": plan.get("id", ""), "source": "membership_checkout"})
    return {"id": admin_id, **get_item("admins", admin_id)}


def finalize_cashfree_order(order_id: str) -> dict:
    order = cashfree_request("GET", f"/pg/orders/{urllib.parse.quote(str(order_id))}")
    status = str(order.get("order_status", "") or "").upper()
    gateway_record = next((item for item in list_collection("gateway_orders") if str(item.get("order_id", "")) == str(order_id)), {})
    if gateway_record:
        update_item("gateway_orders", str(gateway_record.get("id", "")), {"status": status, "updated_at": now_str(), "gateway_payload": order})
    payment_request = next((item for item in list_collection("payment_requests") if str(item.get("gateway_order_id", "")) == str(order_id)), {})
    if status == "PAID" and payment_request:
        admin_record = get_item("admins", str(payment_request.get("admin_id", "")))
        plan = get_item("owner_plans", str(payment_request.get("plan_id", "")))
        if admin_record and plan and str(payment_request.get("status", "")) != "approved":
            apply_plan_renewal(admin_record, plan, "cashfree")
            update_item(
                "payment_requests",
                str(payment_request.get("id", "")),
                {
                    "status": "approved",
                    "updated_at": now_str(),
                    "gateway_payment_status": status,
                    "gateway_payload": order,
                },
            )
    elif payment_request:
        update_item(
            "payment_requests",
            str(payment_request.get("id", "")),
            {"status": "gateway_created", "updated_at": now_str(), "gateway_payment_status": status, "gateway_payload": order},
        )
    return order


def _telegram_request(method: str, payload: dict) -> bool:
    token = str(get_settings().get("bot_token", "")).strip()
    if not token:
        return False
    req = urllib.request.Request(
        f"https://api.telegram.org/bot{token}/{method}",
        data=json.dumps(payload).encode("utf-8"),
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=20) as response:
            data = json.loads(response.read().decode("utf-8"))
            return bool(data.get("ok"))
    except Exception:
        return False


def send_telegram_message(chat_id: str, text: str) -> bool:
    return _telegram_request("sendMessage", {"chat_id": str(chat_id), "text": text, "disable_web_page_preview": True})


def send_telegram_media(chat_id: str, media_type: str, media: str, caption: str) -> bool:
    if media_type == "photo":
        return _telegram_request("sendPhoto", {"chat_id": str(chat_id), "photo": media, "caption": caption})
    if media_type == "video":
        return _telegram_request("sendVideo", {"chat_id": str(chat_id), "video": media, "caption": caption})
    if media_type == "sticker":
        return _telegram_request("sendSticker", {"chat_id": str(chat_id), "sticker": media})
    return send_telegram_message(chat_id, caption)


@app.get("/api/health")
def health():
    return jsonify({"status": "ok"})


@app.get("/api/system-status")
def system_status():
    active_admins = active_super_admins()
    return jsonify(
        {
            "bot_enabled": len(active_admins) > 0,
            "active_super_admins": len(active_admins),
            "maintenance_message": "Bot is temporarily in maintenance mode. Please contact admin.",
        }
    )


@app.post("/api/login")
def login():
    payload = json_body()
    password = str(payload.get("password", "") or "")
    email = normalize_login_email(payload.get("email", ""))
    role = str(payload.get("role", "admin") or "admin").strip().lower()
    config = get_settings()
    if role == "owner":
        success = password == str(config.get("owner_password", "dev") or "dev")
        return jsonify({"success": success, "role": role if success else ""})

    admin_record = find_admin_by_email(email) if email else {}
    if admin_record and verify_password(password, admin_record.get("password_hash", "")):
        access = admin_access_by_id(str(admin_record.get("id", "")))
        return jsonify(
            {
                "success": True,
                "role": "admin",
                "admin_id": str(admin_record.get("id", "")).strip(),
                "login_email": email,
                "active": bool(access.get("active")),
            }
        )

    expected = str(config.get("admin_password", "wind") or "wind")
    if password == expected:
        return jsonify({"success": True, "role": "admin", "admin_id": "", "login_email": email})

    return jsonify({"success": False, "role": ""})


@app.get("/api/activity-logs")
def activity_logs_get():
    return jsonify(list_activity_logs(admin_id=request.args.get("admin_id"), action=request.args.get("action")))


@app.get("/api/settings")
def settings_get():
    data = dict(get_settings())
    data.pop("admin_password", None)
    data.pop("owner_password", None)
    data.pop("bot_token", None)
    data.pop("cashfree_secret_key", None)
    return jsonify(data)


@app.get("/api/runtime-settings")
def runtime_settings_get():
    return jsonify(dict(get_settings()))


@app.put("/api/settings")
def settings_update():
    payload = {}
    for key, value in json_body().items():
        if key in {"payment_mode_upi", "payment_mode_gateway"}:
            payload[str(key)] = "1" if int(value or 0) else "0"
        else:
            payload[str(key)] = str(value)
    set_settings(payload)
    return jsonify({"status": "ok"})


@app.post("/api/admin-password")
def admin_password_update():
    payload = json_body()
    new_password = str(payload.get("password", "")).strip()
    if len(new_password) < 3:
        return jsonify({"error": "Password too short"}), 400
    set_settings({"admin_password": new_password})
    return jsonify({"status": "ok"})


@app.get("/api/admin-contact")
def admin_contact_get():
    return jsonify(primary_admin_contact())


@app.post("/api/bot-events/start-check")
def bot_start_check():
    payload = json_body()
    telegram_id = str(payload.get("telegram_id", "")).strip()
    if not telegram_id:
        return jsonify({"allow": False, "reason": "missing_telegram_id"}), 400
    cooldown_seconds = int(payload.get("cooldown", 8) or 8)
    now_ts = int(time.time())
    item_id = f"start_{telegram_id}"
    existing = get_item("bot_runtime", item_id) or {}
    last_ts = int(existing.get("last_ts", 0) or 0)
    if last_ts and now_ts - last_ts < cooldown_seconds:
        return jsonify({"allow": False, "reason": "cooldown", "remaining": cooldown_seconds - (now_ts - last_ts)})
    update_item("bot_runtime", item_id, {"id": item_id, "telegram_id": telegram_id, "last_ts": now_ts, "updated_at": now_str()})
    return jsonify({"allow": True, "cooldown": cooldown_seconds})


@app.post("/api/admins/link-chat")
def admins_link_chat():
    payload = json_body()
    telegram_id = str(payload.get("telegram_id", "")).strip()
    admin_id = str(payload.get("admin_id", "")).strip()
    access = admin_access_by_id(admin_id) if admin_id else admin_access_record(telegram_id)
    record = access.get("record") or {}
    if not record and telegram_id:
        created_id = create_item(
            "admins",
            normalize_admin_record(
                {
                    "telegram_id": telegram_id,
                    "telegram_chat_id": telegram_id,
                    "name": "Panel Admin",
                    "username": "",
                    "panel_role": "admin",
                    "plan_name": "Lifetime Access",
                    "status": "active",
                }
            ),
        )
        log_activity(created_id, "admin_created_from_profile_link", {"telegram_id": telegram_id})
        access = admin_access_by_id(created_id)
        record = access.get("record") or {}
    if not record:
        return jsonify({"success": False, "error": "Unable to attach Telegram Chat ID right now."})
    update_item(
        "admins",
        str(record.get("id", "")),
        normalize_admin_record({**record, "telegram_id": telegram_id, "telegram_chat_id": telegram_id}),
    )
    access = admin_access_by_id(str(record.get("id", "")))
    log_activity(str(record.get("id", "")), "telegram_link", {"telegram_id": telegram_id})
    return jsonify({"success": True, **access})


@app.post("/api/admins/unlink-chat")
def admins_unlink_chat():
    payload = json_body()
    telegram_id = str(payload.get("telegram_id", "")).strip()
    admin_id = str(payload.get("admin_id", "")).strip()
    record = get_item("admins", admin_id) if admin_id else find_admin_by_telegram_id(telegram_id)
    if record:
        update_item(
            "admins",
            str(record.get("id", "")),
            normalize_admin_record({**record, "telegram_id": "", "telegram_chat_id": ""}),
        )
        log_activity(str(record.get("id", "")), "telegram_unlink", {"telegram_id": telegram_id})
    return jsonify({"status": "ok"})


@app.post("/api/cashfree/create-order")
def cashfree_create_order():
    payload = json_body()
    telegram_id = str(payload.get("telegram_id", "")).strip()
    admin_id = str(payload.get("admin_id", "")).strip()
    plan_id = str(payload.get("plan_id", "")).strip()
    plan = get_item("owner_plans", plan_id)
    if not plan:
        return jsonify({"error": "Plan not found"}), 404
    access = admin_access_by_id(admin_id) if admin_id else (admin_access_record(telegram_id) if telegram_id else {"record": {}})
    record = access.get("record") or {}
    if not record:
        record = bootstrap_super_admin_account(plan)
    settings = get_settings()
    if not str(settings.get("cashfree_app_id", "")).strip() or not str(settings.get("cashfree_secret_key", "")).strip():
        return jsonify({"error": "Cashfree credentials missing"}), 400
    try:
        response = create_cashfree_order_for_admin(record, plan)
        return jsonify(
            {
                "status": "created",
                "gateway": "cashfree",
                "order_id": response.get("order_id", ""),
                "request_id": response.get("request_id", ""),
                "admin_id": response.get("admin_id", str(record.get("id", "")).strip()),
                "payment_session_id": response.get("payment_session_id", ""),
                "order_status": response.get("order_status", "ACTIVE"),
                "environment": get_settings().get("cashfree_environment", "production"),
                "amount": float(plan.get("price", 0) or 0),
            }
        )
    except urllib.error.HTTPError as exc:
        detail = exc.read().decode("utf-8", errors="ignore")
        return jsonify({"error": "Cashfree order creation failed", "detail": detail}), 502
    except Exception as exc:
        return jsonify({"error": "Cashfree order creation failed", "detail": str(exc)}), 502


@app.get("/api/cashfree/verify-order/<order_id>")
def cashfree_verify_order(order_id: str):
    try:
        order = finalize_cashfree_order(order_id)
        return jsonify({"status": "ok", "order": order})
    except urllib.error.HTTPError as exc:
        detail = exc.read().decode("utf-8", errors="ignore")
        return jsonify({"error": "Cashfree verification failed", "detail": detail}), 502
    except Exception as exc:
        return jsonify({"error": "Cashfree verification failed", "detail": str(exc)}), 502


@app.post("/api/cashfree/webhook")
def cashfree_webhook():
    raw_body = request.get_data(as_text=True)
    payload = request.get_json(silent=True) or {}
    headers = {
        "x-webhook-signature": request.headers.get("x-webhook-signature", ""),
        "x-webhook-timestamp": request.headers.get("x-webhook-timestamp", ""),
        "x-webhook-version": request.headers.get("x-webhook-version", ""),
    }
    create_item(
        "gateway_webhooks",
        {
            "gateway": "cashfree",
            "headers": headers,
            "payload": payload,
            "raw_body": raw_body,
            "created_at": now_str(),
        },
    )
    order_id = str(payload.get("data", {}).get("order", {}).get("order_id", "")).strip()
    event_type = str(payload.get("type", "")).strip().upper()
    if order_id and event_type == "PAYMENT_SUCCESS_WEBHOOK":
        try:
            finalize_cashfree_order(order_id)
        except Exception:
            pass
    return jsonify({"status": "ok"})


@app.get("/api/payment-settings")
def payment_settings_get():
    settings = get_settings()
    return jsonify(
        {
            "qr": settings.get("payment_qr", ""),
            "upi_id": settings.get("payment_upi_id", ""),
            "min_deposit": int(settings.get("payment_min_deposit", "100") or 100),
            "max_deposit": int(settings.get("payment_max_deposit", "5000") or 5000),
            "use_upi": int(settings.get("payment_mode_upi", "1") or 1),
            "use_gateway": int(settings.get("payment_mode_gateway", "0") or 0),
        }
    )


@app.put("/api/payment-settings")
def payment_settings_update():
    payload = json_body()
    set_settings(
        {
            "payment_qr": str(payload.get("qr", "")).strip(),
            "payment_upi_id": str(payload.get("upi_id", "")).strip(),
            "payment_min_deposit": str(int(payload.get("min_deposit", 100) or 100)),
            "payment_max_deposit": str(int(payload.get("max_deposit", 5000) or 5000)),
            "payment_mode_upi": "1" if int(payload.get("use_upi", 1) or 1) else "0",
            "payment_mode_gateway": "1" if int(payload.get("use_gateway", 0) or 0) else "0",
        }
    )
    return jsonify({"status": "ok"})


@app.get("/api/users")
def users_get():
    return jsonify(list_users(request.args.get("q"), request.args.get("status")))


@app.post("/api/users")
def users_create():
    return jsonify({"id": create_user(json_body())})


@app.patch("/api/users/<item_id>")
def users_update(item_id: str):
    payload = json_body()
    if "balance" in payload:
        payload["balance"] = float(payload.get("balance") or 0)
    if "is_banned" in payload:
        payload["is_banned"] = int(payload.get("is_banned") or 0)
    update_item("users", item_id, payload)
    return jsonify({"status": "ok"})


@app.post("/api/users/<item_id>/toggle-ban")
def users_toggle_ban(item_id: str):
    toggle_user_ban(item_id)
    return jsonify({"status": "ok"})


@app.get("/api/wallet/<telegram_id>")
def wallet_get(telegram_id: str):
    user = next((item for item in list_collection("users") if str(item.get("telegram_id")) == str(telegram_id)), None)
    return jsonify({"balance": float(user.get("balance", 0) if user else 0)})


@app.get("/api/categories")
def categories_get():
    return jsonify([])


@app.get("/api/products")
def products_get():
    return jsonify(list_collection("products"))


@app.post("/api/products")
def products_create():
    payload = json_body()
    payload["sort_order"] = int(payload.get("sort_order") or 0)
    payload["is_active"] = int(payload.get("is_active") or 1)
    payload["maintenance_mode"] = int(payload.get("maintenance_mode") or 0)
    payload["is_recommended"] = int(payload.get("is_recommended") or 0)
    payload["hwid_reset_limit"] = int(payload.get("hwid_reset_limit") or 0)
    return jsonify({"id": create_item("products", payload)})


@app.put("/api/products/<item_id>")
def products_update(item_id: str):
    update_item("products", item_id, json_body())
    return jsonify({"status": "ok"})


@app.delete("/api/products/<item_id>")
def products_delete(item_id: str):
    delete_item("products", item_id)
    return jsonify({"status": "ok"})


@app.get("/api/plans")
def plans_get():
    product_id = request.args.get("product_id")
    plans = list_collection("plans")
    if product_id:
        plans = [plan for plan in plans if str(plan.get("product_id")) == str(product_id)]
    return jsonify(plans)


@app.post("/api/plans")
def plans_create():
    payload = json_body()
    payload["price"] = float(payload.get("price") or 0)
    payload["duration_days"] = int(payload.get("duration_days") or 1)
    payload["stock"] = int(payload.get("stock") or 0)
    payload["reseller_price"] = float(payload.get("reseller_price") or 0)
    payload["hwid_reset_limit"] = int(payload.get("hwid_reset_limit") or 0)
    payload["sort_order"] = int(payload.get("sort_order") or 0)
    payload["is_active"] = int(payload.get("is_active") or 1)
    return jsonify({"id": create_item("plans", payload)})


@app.put("/api/plans/<item_id>")
def plans_update(item_id: str):
    update_item("plans", item_id, json_body())
    return jsonify({"status": "ok"})


@app.delete("/api/plans/<item_id>")
def plans_delete(item_id: str):
    delete_item("plans", item_id)
    return jsonify({"status": "ok"})


@app.get("/api/product-actions")
def product_actions_get():
    product_id = request.args.get("product_id")
    items = list_collection("product_actions")
    if product_id:
        items = [item for item in items if str(item.get("product_id")) == str(product_id)]
    return jsonify(items)


@app.post("/api/product-actions")
def product_actions_create():
    payload = json_body()
    payload["sort_order"] = int(payload.get("sort_order") or 0)
    payload["is_active"] = int(payload.get("is_active") or 1)
    return jsonify({"id": create_item("product_actions", payload)})


@app.put("/api/product-actions/<item_id>")
def product_actions_update(item_id: str):
    update_item("product_actions", item_id, json_body())
    return jsonify({"status": "ok"})


@app.delete("/api/product-actions/<item_id>")
def product_actions_delete(item_id: str):
    delete_item("product_actions", item_id)
    return jsonify({"status": "ok"})


@app.get("/api/licenses")
def licenses_get():
    product_id = request.args.get("product_id")
    plan_id = request.args.get("plan_id")
    items = list_collection("licenses")
    if product_id:
        items = [item for item in items if str(item.get("product_id")) == str(product_id)]
    if plan_id:
        items = [item for item in items if str(item.get("plan_id")) == str(plan_id)]
    return jsonify(items)


@app.post("/api/licenses/generate")
def licenses_generate():
    return jsonify({"keys": generate_license_keys(json_body())})


@app.post("/api/licenses")
def licenses_create():
    payload = json_body()
    payload["hwid_reset_limit"] = int(payload.get("hwid_reset_limit") or 0)
    payload["reseller_price"] = float(payload.get("reseller_price") or 0)
    return jsonify({"id": create_license(payload)})


@app.put("/api/licenses/<item_id>")
def licenses_update(item_id: str):
    payload = json_body()
    payload["hwid_reset_limit"] = int(payload.get("hwid_reset_limit") or 0)
    payload["reseller_price"] = float(payload.get("reseller_price") or 0)
    update_license(item_id, payload)
    return jsonify({"status": "ok"})


@app.delete("/api/licenses/<item_id>")
def licenses_delete(item_id: str):
    delete_license(item_id)
    return jsonify({"status": "ok"})


@app.get("/api/buttons")
def buttons_get():
    return jsonify(list_collection("buttons"))


@app.post("/api/buttons")
def buttons_create():
    payload = json_body()
    payload["sort_order"] = int(payload.get("sort_order") or 0)
    payload["is_active"] = int(payload.get("is_active") or 1)
    payload["placement"] = str(payload.get("placement", "main") or "main")
    payload["target_product_id"] = str(payload.get("target_product_id", "")).strip()
    return jsonify({"id": create_item("buttons", payload)})


@app.put("/api/buttons/<item_id>")
def buttons_update(item_id: str):
    payload = json_body()
    if "placement" in payload:
        payload["placement"] = str(payload.get("placement", "main") or "main")
    if "target_product_id" in payload:
        payload["target_product_id"] = str(payload.get("target_product_id", "")).strip()
    update_item("buttons", item_id, payload)
    return jsonify({"status": "ok"})


@app.delete("/api/buttons/<item_id>")
def buttons_delete(item_id: str):
    delete_item("buttons", item_id)
    return jsonify({"status": "ok"})


@app.get("/api/payment-requests")
def payment_requests_get():
    items = list_collection("payment_requests")
    status = request.args.get("status")
    telegram_id = str(request.args.get("telegram_id", "")).strip()
    if status:
        items = [item for item in items if str(item.get("status")) == status]
    if telegram_id:
        items = [item for item in items if str(item.get("telegram_id", "")).strip() == telegram_id]
    return jsonify(items)


@app.post("/api/payment-requests")
def payment_requests_create():
    payload = json_body()
    amount = float(payload.get("amount") or 0)
    request_type = str(payload.get("type", "wallet_topup") or "wallet_topup")
    user = next((item for item in list_collection("users") if str(item.get("telegram_id", "")).strip() == str(payload.get("telegram_id", "")).strip()), {})
    request_id = create_item(
        "payment_requests",
        {
            "type": request_type,
            "telegram_id": str(payload.get("telegram_id", "")).strip(),
            "username": str(payload.get("username", user.get("username", ""))).strip(),
            "first_name": str(payload.get("first_name", user.get("first_name", ""))).strip(),
            "user_balance": float(user.get("balance", 0) or 0),
            "product_id": str(payload.get("product_id", "")).strip(),
            "plan_id": str(payload.get("plan_id", "")).strip(),
            "admin_id": str(payload.get("admin_id", "")).strip(),
            "renew_days": int(payload.get("renew_days", 0) or 0),
            "plan_name": str(payload.get("plan_name", "")).strip(),
            "amount": amount,
            "status": "pending",
            "upi_ref": "",
            "created_at": now_str(),
            "updated_at": now_str(),
        },
    )
    return jsonify({"id": request_id})


@app.post("/api/payment-requests/<item_id>/mark-paid")
def payment_requests_mark_paid(item_id: str):
    payload = json_body()
    update_item(
        "payment_requests",
        item_id,
        {"status": "submitted", "upi_ref": str(payload.get("upi_ref", "")).strip(), "updated_at": now_str()},
    )
    return jsonify({"status": "ok"})


@app.post("/api/payment-requests/<item_id>/cancel")
def payment_requests_cancel(item_id: str):
    update_item(
        "payment_requests",
        item_id,
        {"status": "cancelled", "admin_note": "Cancelled by user", "updated_at": now_str()},
    )
    return jsonify({"status": "ok"})


@app.post("/api/payment-requests/<item_id>/reject")
def payment_requests_reject(item_id: str):
    payload = json_body()
    update_item(
        "payment_requests",
        item_id,
        {"status": "rejected", "admin_note": str(payload.get("note", "Rejected by admin")), "updated_at": now_str()},
    )
    return jsonify({"status": "ok"})


@app.post("/api/payment-requests/<item_id>/approve")
def payment_requests_approve(item_id: str):
    req_item = get_item("payment_requests", item_id)
    if not req_item:
        return jsonify({"error": "Payment request not found"}), 404
    telegram_id = str(req_item.get("telegram_id", "")).strip()
    request_type = str(req_item.get("type", "wallet_topup"))
    if request_type == "wallet_topup":
        user = next((item for item in list_collection("users") if str(item.get("telegram_id")) == telegram_id), None)
        if not user:
            return jsonify({"error": "User not found"}), 404
        current_balance = float(user.get("balance", 0) or 0)
        new_balance = current_balance + float(req_item.get("amount", 0) or 0)
        update_item("users", str(user["id"]), {"balance": new_balance})
        update_item("payment_requests", item_id, {"status": "approved", "updated_at": now_str()})
        if telegram_id:
            send_telegram_message(telegram_id, f"Deposit approved.\nNew wallet balance: Rs {int(new_balance)}")
        return jsonify({"status": "ok", "balance": new_balance})
    if request_type == "panel_renew":
        admin_id = str(req_item.get("admin_id", "")).strip()
        admin_record = get_item("admins", admin_id)
        if not admin_record:
            return jsonify({"error": "Admin record not found"}), 404
        plan = get_item("owner_plans", str(req_item.get("plan_id", "")).strip()) or {
            "id": str(req_item.get("plan_id", "")).strip(),
            "name": str(req_item.get("plan_name", admin_record.get("plan_name", "Renewal"))),
            "days": int(req_item.get("renew_days", admin_record.get("custom_days", 30)) or 30),
            "price": float(req_item.get("amount", admin_record.get("subscription_price", 0)) or 0),
        }
        updated = apply_plan_renewal(admin_record, plan, "manual_approval")
        update_item("payment_requests", item_id, {"status": "approved", "updated_at": now_str()})
        if telegram_id:
            send_telegram_message(telegram_id, f"Panel renew approved.\nNew expiry: {updated.get('expires_at', '-')}")
        return jsonify({"status": "ok", "expires_at": updated.get("expires_at", "")})
    return jsonify({"error": "Unsupported request type"}), 400


@app.post("/api/panel-renew-requests")
def panel_renew_requests_create():
    payload = json_body()
    telegram_id = str(payload.get("telegram_id", "")).strip()
    access = admin_access_record(telegram_id)
    record = access.get("record") or {}
    if not record:
        return jsonify({"error": "Admin record not found"}), 404
    pending = [
        item
        for item in list_collection("payment_requests")
        if str(item.get("type")) == "panel_renew"
        and str(item.get("admin_id")) == str(record.get("id"))
        and str(item.get("status")) in {"pending", "submitted"}
    ]
    if pending:
        return jsonify({"error": "Renew request already pending"}), 409
    selected_plan_id = str(payload.get("plan_id", "")).strip()
    plan = get_item("owner_plans", selected_plan_id) if selected_plan_id else match_owner_plan(record)
    renew_days = int(plan.get("days", record.get("custom_days", 30)) or 30)
    amount = float(plan.get("price", 0) or 0)
    request_id = create_item(
        "payment_requests",
        {
            "type": "panel_renew",
            "telegram_id": telegram_id,
            "admin_id": str(record.get("id", "")).strip(),
            "plan_id": str(plan.get("id", "")).strip(),
            "product_id": "",
            "renew_days": renew_days,
            "plan_name": str(plan.get("name", record.get("plan_name", "Renewal"))),
            "amount": amount,
            "status": "pending",
            "upi_ref": "",
            "created_at": now_str(),
            "updated_at": now_str(),
        },
    )
    return jsonify({"id": request_id, "amount": amount, "renew_days": renew_days, "plan_name": str(plan.get("name", record.get("plan_name", "Renewal")))})


@app.post("/api/orders/purchase-with-wallet")
def purchase_with_wallet():
    payload = json_body()
    telegram_id = str(payload.get("telegram_id", "")).strip()
    plan_id = str(payload.get("plan_id", "")).strip()
    if not telegram_id or not plan_id:
        return jsonify({"error": "telegram_id and plan_id required"}), 400
    user = next((item for item in list_collection("users") if str(item.get("telegram_id")) == telegram_id), None)
    if not user:
        return jsonify({"error": "User not found"}), 404
    plan = next((item for item in list_collection("plans") if str(item.get("id")) == plan_id), None)
    if not plan:
        return jsonify({"error": "Plan not found"}), 404
    price = float(plan.get("price", 0) or 0)
    balance = float(user.get("balance", 0) or 0)
    if balance < price:
        return jsonify({"error": "Insufficient balance", "balance": balance, "price": price}), 409
    licenses = [
        item
        for item in list_collection("licenses")
        if str(item.get("plan_id")) == plan_id and str(item.get("status")) == "available"
    ]
    if not licenses:
        return jsonify({"error": "Out of stock"}), 409
    license_item = licenses[0]
    update_item("users", str(user["id"]), {"balance": balance - price})
    update_license(
        str(license_item["id"]),
        {"status": "sold", "sold_to_telegram_id": telegram_id, "sold_at": now_str()},
    )
    order_id = create_item(
        "orders",
        {
            "telegram_id": telegram_id,
            "payment_request_id": "",
            "payment_mode": "wallet",
            "product_id": str(plan.get("product_id", "")),
            "plan_id": plan_id,
            "license_id": str(license_item["id"]),
            "license_key": str(license_item.get("license_key", "")),
            "account_username": str(license_item.get("account_username", "")),
            "account_password": str(license_item.get("account_password", "")),
            "pin_code": str(license_item.get("pin_code", "")),
            "key_type": str(license_item.get("key_type", "pin")),
            "status": "active",
            "amount": price,
            "reset_limit": int(license_item.get("hwid_reset_limit", 0) or 0),
            "reset_used": 0,
            "created_at": now_str(),
        },
    )
    return jsonify({"status": "ok", "order_id": order_id, "new_balance": balance - price})


@app.get("/api/orders")
def orders_get():
    telegram_id = request.args.get("telegram_id")
    items = list_collection("orders")
    if telegram_id:
        items = [item for item in items if str(item.get("telegram_id")) == str(telegram_id)]
    return jsonify(items)


@app.get("/api/reset-requests")
def reset_requests_get():
    items = list_collection("reset_requests")
    status = request.args.get("status")
    if status:
        items = [item for item in items if str(item.get("status")) == status]
    return jsonify(items)


@app.post("/api/reset-requests")
def reset_requests_create():
    payload = json_body()
    order_id = str(payload.get("order_id", "")).strip()
    order = get_item("orders", order_id)
    if not order:
        return jsonify({"error": "Order not found"}), 404
    reset_limit = int(order.get("reset_limit", 0) or 0)
    reset_used = int(order.get("reset_used", 0) or 0)
    if reset_used >= reset_limit:
        return jsonify({"error": "Reset limit finished"}), 400
    pending = [
        item
        for item in list_collection("reset_requests")
        if str(item.get("order_id")) == order_id and str(item.get("status")) == "pending"
    ]
    if pending:
        return jsonify({"error": "Already pending"}), 409
    request_id = create_item(
        "reset_requests",
        {"order_id": order_id, "telegram_id": str(order.get("telegram_id", "")), "status": "pending", "created_at": now_str(), "updated_at": now_str()},
    )
    return jsonify({"id": request_id})


@app.post("/api/reset-requests/<item_id>/approve")
def reset_requests_approve(item_id: str):
    req_item = get_item("reset_requests", item_id)
    if not req_item:
        return jsonify({"error": "Reset request not found"}), 404
    order_id = str(req_item.get("order_id", ""))
    order = get_item("orders", order_id)
    if not order:
        return jsonify({"error": "Order not found"}), 404
    reset_used = int(order.get("reset_used", 0) or 0) + 1
    update_item("orders", order_id, {"reset_used": reset_used})
    update_item("reset_requests", item_id, {"status": "approved", "updated_at": now_str()})
    telegram_id = str(req_item.get("telegram_id", "")).strip()
    if telegram_id:
        send_telegram_message(telegram_id, f"HWID Reset approved.\nOrder: {order_id}")
    return jsonify({"status": "ok"})


@app.post("/api/reset-requests/<item_id>/reject")
def reset_requests_reject(item_id: str):
    update_item("reset_requests", item_id, {"status": "rejected", "updated_at": now_str()})
    req_item = get_item("reset_requests", item_id)
    telegram_id = str(req_item.get("telegram_id", "")).strip()
    if telegram_id:
        send_telegram_message(telegram_id, f"HWID Reset rejected.\nOrder: {req_item.get('order_id', '-')}")
    return jsonify({"status": "ok"})


@app.post("/api/announcements/broadcast")
def announcements_broadcast():
    payload = json_body()
    message = str(payload.get("message", "")).strip()
    media_type = str(payload.get("media_type", "text")).strip()
    media = str(payload.get("media", "")).strip()
    if not message and media_type == "text":
        return jsonify({"error": "Message required"}), 400
    users = [item for item in list_collection("users") if str(item.get("telegram_id", "")).strip()]
    sent = 0
    for user in users:
        chat_id = str(user.get("telegram_id"))
        ok = send_telegram_media(chat_id, media_type, media, message)
        if ok:
            sent += 1
    create_item("announcements", {"message": message, "media_type": media_type, "media": media, "sent_count": sent, "created_at": now_str()})
    return jsonify({"status": "ok", "sent_count": sent, "total": len(users)})


@app.get("/api/admins")
def admins_get():
    return jsonify([sanitize_admin_record(normalize_admin_record(item) | {"id": str(item.get("id", "") )}) for item in list_collection("admins")])


@app.post("/api/admins")
def admins_create():
    payload = json_body()
    plan_id = str(payload.get("plan_id", "")).strip()
    if plan_id:
        plan = get_item("owner_plans", plan_id)
        if plan:
            payload["plan_name"] = plan.get("name", payload.get("plan_name", "Owner Plan"))
            payload["custom_days"] = int(plan.get("days", payload.get("custom_days", 30)) or 30)
            payload["subscription_price"] = float(plan.get("price", payload.get("subscription_price", 0)) or 0)
    admin_id = create_item("admins", normalize_admin_record(payload))
    log_activity(admin_id, "admin_created", {"telegram_id": payload.get("telegram_id", ""), "parent_admin_id": payload.get("parent_admin_id", "")})
    return jsonify({"id": admin_id})


@app.patch("/api/admins/<item_id>")
def admins_update(item_id: str):
    existing = get_item("admins", item_id)
    if not existing:
        return jsonify({"error": "Admin not found"}), 404
    payload = json_body()
    if payload.get("action") == "renew":
        extra_days = int(payload.get("extra_days", 30) or 30)
        start_from = parse_dt(existing.get("expires_at")) or datetime.now()
        if start_from < datetime.now():
            start_from = datetime.now()
        payload["starts_at"] = existing.get("starts_at") or now_str()
        payload["expires_at"] = format_dt(start_from + timedelta(days=max(extra_days, 1)))
        payload["status"] = "active"
    if "plan_id" in payload and str(payload.get("plan_id", "")).strip():
        plan = get_item("owner_plans", str(payload.get("plan_id")).strip())
        if plan:
            payload["plan_name"] = plan.get("name", payload.get("plan_name", "Owner Plan"))
            payload["custom_days"] = int(plan.get("days", payload.get("custom_days", 30)) or 30)
            payload["subscription_price"] = float(plan.get("price", payload.get("subscription_price", 0)) or 0)
    merged = dict(existing)
    merged.update(payload)
    update_item("admins", item_id, normalize_admin_record(merged))
    log_activity(item_id, "admin_updated", payload)
    return jsonify({"status": "ok"})


@app.delete("/api/admins/<item_id>")
def admins_delete(item_id: str):
    log_activity(item_id, "admin_deleted", {"deleted_at": now_str()})
    delete_item("admins", item_id)
    return jsonify({"status": "ok"})


@app.get("/api/admins/access/<telegram_id>")
def admins_access(telegram_id: str):
    return jsonify(admin_access_record(telegram_id))


@app.get("/api/admins/access-by-id/<item_id>")
def admins_access_by_id_route(item_id: str):
    return jsonify(admin_access_by_id(item_id))


@app.get("/api/owner-plans")
def owner_plans_get():
    items = list_collection("owner_plans")
    items.sort(key=lambda item: int(item.get("sort_order", 0) or 0))
    return jsonify(items)


@app.post("/api/owner-plans")
def owner_plans_create():
    payload = json_body()
    payload["name"] = str(payload.get("name", "Plan")).strip()
    payload["days"] = int(payload.get("days", 30) or 30)
    payload["price"] = float(payload.get("price", 0) or 0)
    payload["sort_order"] = int(payload.get("sort_order", 0) or 0)
    payload["is_active"] = int(payload.get("is_active", 1) or 1)
    return jsonify({"id": create_item("owner_plans", payload)})


@app.put("/api/owner-plans/<item_id>")
def owner_plans_update(item_id: str):
    payload = json_body()
    if "days" in payload:
        payload["days"] = int(payload.get("days", 30) or 30)
    if "price" in payload:
        payload["price"] = float(payload.get("price", 0) or 0)
    if "sort_order" in payload:
        payload["sort_order"] = int(payload.get("sort_order", 0) or 0)
    if "is_active" in payload:
        payload["is_active"] = int(payload.get("is_active", 1) or 1)
    update_item("owner_plans", item_id, payload)
    return jsonify({"status": "ok"})


@app.delete("/api/owner-plans/<item_id>")
def owner_plans_delete(item_id: str):
    delete_item("owner_plans", item_id)
    return jsonify({"status": "ok"})


@app.get("/api/resellers")
def resellers_get():
    return jsonify([user for user in list_collection("users") if user.get("role") == "reseller"])


if __name__ == "__main__":
    ensure_defaults()
    app.run(host="127.0.0.1", port=5000, debug=True)
