from __future__ import annotations

import json
import time
import urllib.error
import urllib.request
from typing import Any


BASE_URL = "https://nitesh-hack-selling-bot-tg-default-rtdb.firebaseio.com"


DEFAULT_SETTINGS = {
    "admin_password": "wind",
    "owner_password": "dev",
    "brand_name": "REVERSE",
    "brand_logo_url": "",
    "telegram_support_link": "https://t.me/your_support",
    "whatsapp_support_link": "https://wa.me/0000000000",
    "welcome_text": "GOLDEN SELLER BOT\n\nYo {name}, Welcome Back!!",
    "shop_header_text": "Choose a product",
    "profile_text": "YOUR PROFILE\nName: {name}\nUsername: {username}\nUser ID: {telegram_id}\nMember Since: {created_at}",
    "orders_text": "MY ORDERS (last 10)\nNo orders yet.",
    "refer_text": "Refer & Earn\n\nYour Referral Link:\n{ref_link}",
    "support_text": "Support ke liye admin se contact karein.",
    "how_to_use_text": "1. Shop open karo\n2. Product choose karo\n3. Payment complete karo\n4. Delivery lo",
    "feedback_text": "Feedback ke liye apna message admin ko bhej sakte ho.",
    "pay_proof_text": "Payment proof bhejne ke liye screenshot support ko forward karein.",
    "id_help_text": "Apna product/account ID bhejo, team usko verify kar degi.",
    "bot_username": "NS_seller_bot_bot",
    "bot_token": "8685359931:AAG47W9yToeKoNf53dsOLZuiwH92lyU0rqs",
    "payment_upi_id": "",
    "payment_qr": "",
    "payment_mode_upi": "1",
    "payment_mode_gateway": "0",
    "cashfree_app_id": "",
    "cashfree_secret_key": "",
    "cashfree_environment": "production",
    "ui_primary_color": "#ff315f",
    "ui_accent_color": "#ff7a18",
    "ui_surface_color": "#121016",
    "ui_surface_alt_color": "#1a141d",
    "button_bg_color": "#ff315f",
    "button_text_color": "#fff5f7",
    "button_hover_color": "#ff5d86",
    "button_disabled_color": "#534049",
    "bot_card_title": "SELLER BOT",
    "bot_card_tagline": "Premium access control panel",
}

DEFAULT_BUTTONS = [
    {"label": "Shop Now", "action_type": "builtin", "builtin_action": "shop_now", "sort_order": 10, "is_active": 1},
    {"label": "My Orders", "action_type": "builtin", "builtin_action": "my_orders", "sort_order": 20, "is_active": 1},
    {"label": "Profile", "action_type": "builtin", "builtin_action": "profile", "sort_order": 30, "is_active": 1},
    {"label": "Pay Proof", "action_type": "builtin", "builtin_action": "pay_proof", "sort_order": 40, "is_active": 1},
    {"label": "Feedback", "action_type": "builtin", "builtin_action": "feedback", "sort_order": 50, "is_active": 1},
    {"label": "How to Use", "action_type": "builtin", "builtin_action": "how_to_use", "sort_order": 60, "is_active": 1},
    {"label": "Support", "action_type": "builtin", "builtin_action": "support", "sort_order": 70, "is_active": 1},
    {"label": "ID & LVL ID", "action_type": "builtin", "builtin_action": "id_help", "sort_order": 80, "is_active": 1},
    {"label": "Refer & Earn", "action_type": "builtin", "builtin_action": "refer_earn", "sort_order": 90, "is_active": 1},
    {"label": "Deposit Now", "action_type": "builtin", "builtin_action": "deposit_now", "sort_order": 100, "is_active": 1},
]

DEFAULT_OWNER_PLANS = [
    {"name": "Starter 30 Days", "days": 30, "price": 499, "sort_order": 10, "is_active": 1},
    {"name": "Pro 60 Days", "days": 60, "price": 899, "sort_order": 20, "is_active": 1},
    {"name": "Elite 90 Days", "days": 90, "price": 1299, "sort_order": 30, "is_active": 1},
]


def _request(path: str, method: str = "GET", payload: Any = None) -> Any:
    url = f"{BASE_URL}/{path}.json"
    data = None
    headers = {"Content-Type": "application/json"}
    if payload is not None:
        data = json.dumps(payload).encode("utf-8")
    request = urllib.request.Request(url, data=data, headers=headers, method=method)
    try:
        with urllib.request.urlopen(request, timeout=20) as response:
            raw = response.read().decode("utf-8")
            return json.loads(raw) if raw else None
    except urllib.error.HTTPError as exc:
        body = exc.read().decode("utf-8", errors="ignore")
        raise RuntimeError(f"Firebase request failed: {exc.code} {body}") from exc


def ensure_defaults() -> None:
    current = _request("settings") or {}
    merged = {**DEFAULT_SETTINGS, **current}
    _request("settings", "PUT", merged)
    buttons = _request("buttons") or {}
    existing_by_builtin = {
        str(item.get("builtin_action", "")).strip()
        for item in buttons.values()
        if isinstance(item, dict) and str(item.get("action_type", "")) == "builtin"
    }
    if not buttons:
        for item in DEFAULT_BUTTONS:
            create_item("buttons", {**item, "placement": "main"})
    else:
        for item in DEFAULT_BUTTONS:
            builtin = str(item.get("builtin_action", "")).strip()
            if builtin and builtin not in existing_by_builtin:
                create_item("buttons", {**item, "placement": "main"})
    owner_plans = _request("owner_plans") or {}
    existing_owner_plan_keys = {
        f"{str(item.get('name', '')).strip().lower()}|{int(item.get('days', 0) or 0)}|{float(item.get('price', 0) or 0)}"
        for item in owner_plans.values()
        if isinstance(item, dict)
    }
    for item in DEFAULT_OWNER_PLANS:
        plan_key = f"{str(item.get('name', '')).strip().lower()}|{int(item.get('days', 0) or 0)}|{float(item.get('price', 0) or 0)}"
        if plan_key not in existing_owner_plan_keys:
            create_item("owner_plans", item)


def _collection(name: str) -> dict[str, dict[str, Any]]:
    return _request(name) or {}


def list_collection(name: str) -> list[dict[str, Any]]:
    data = _collection(name)
    items = []
    for key, value in data.items():
        if isinstance(value, dict):
            item = dict(value)
            item["id"] = value.get("id", key)
            items.append(item)
    items.sort(key=lambda item: str(item.get("id", "")), reverse=False)
    return items


def get_item(name: str, item_id: str) -> dict[str, Any]:
    return _request(f"{name}/{item_id}") or {}


def create_item(name: str, payload: dict[str, Any]) -> str:
    item_id = str(int(time.time() * 1000))
    doc = {"id": item_id, **payload}
    _request(f"{name}/{item_id}", "PUT", doc)
    return item_id


def update_item(name: str, item_id: str, payload: dict[str, Any]) -> None:
    existing = _request(f"{name}/{item_id}") or {"id": item_id}
    existing.update(payload)
    existing["id"] = item_id
    _request(f"{name}/{item_id}", "PUT", existing)


def delete_item(name: str, item_id: str) -> None:
    _request(f"{name}/{item_id}", "DELETE")


def get_settings() -> dict[str, str]:
    ensure_defaults()
    return _request("settings") or DEFAULT_SETTINGS.copy()


def set_settings(payload: dict[str, str]) -> None:
    current = get_settings()
    current.update(payload)
    _request("settings", "PUT", current)


def list_users(search: str | None = None, status: str | None = None) -> list[dict[str, Any]]:
    users = list_collection("users")
    if search:
        token = search.lower()
        users = [
            user
            for user in users
            if token in str(user.get("first_name", "")).lower()
            or token in str(user.get("username", "")).lower()
            or token in str(user.get("telegram_id", ""))
        ]
    if status == "active":
        users = [user for user in users if int(user.get("is_banned", 0)) == 0]
    if status == "banned":
        users = [user for user in users if int(user.get("is_banned", 0)) == 1]
    return users


def create_user(payload: dict[str, Any]) -> str:
    telegram_id = str(payload.get("telegram_id", "")).strip()
    if telegram_id:
        for user in list_collection("users"):
            if str(user.get("telegram_id", "")) == telegram_id:
                update_item(
                    "users",
                    str(user["id"]),
                    {
                        "first_name": payload.get("first_name", user.get("first_name", "User")),
                        "username": payload.get("username", user.get("username", "")),
                        "role": payload.get("role", user.get("role", "user")),
                        "balance": float(payload.get("balance", user.get("balance", 0))),
                        "notes": payload.get("notes", user.get("notes", "")),
                    },
                )
                return str(user["id"])
    defaults = {
        "telegram_id": payload.get("telegram_id", ""),
        "first_name": payload.get("first_name", "User"),
        "username": payload.get("username", ""),
        "notes": payload.get("notes", ""),
        "role": payload.get("role", "user"),
        "balance": float(payload.get("balance", 0)),
        "is_banned": int(payload.get("is_banned", 0)),
        "created_at": payload.get("created_at", time.strftime("%Y-%m-%d %H:%M:%S")),
    }
    return create_item("users", defaults)


def toggle_user_ban(item_id: str) -> None:
    user = _request(f"users/{item_id}") or {}
    user["is_banned"] = 0 if int(user.get("is_banned", 0)) else 1
    update_item("users", item_id, user)


def _adjust_plan_stock(plan_id: str, delta: int) -> None:
    plan_id = str(plan_id or "").strip()
    if not plan_id:
        return
    plan = _request(f"plans/{plan_id}") or {"id": plan_id}
    current_stock = int(plan.get("stock", 0) or 0)
    plan["stock"] = max(0, current_stock + int(delta))
    update_item("plans", plan_id, plan)


def _normalize_license_payload(payload: dict[str, Any]) -> dict[str, Any]:
    key_type = str(payload.get("key_type", "pin") or "pin")
    username = str(payload.get("account_username", "")).strip()
    password = str(payload.get("account_password", "")).strip()
    pin_code = str(payload.get("pin_code", "")).strip()
    if key_type == "username_password":
        license_key = f"{username}:{password}".strip(":")
    else:
        license_key = pin_code or str(payload.get("license_key", "")).strip()
    return {
        "product_id": str(payload.get("product_id", "")).strip(),
        "plan_id": str(payload.get("plan_id", "")).strip(),
        "license_key": license_key,
        "key_type": key_type,
        "account_username": username,
        "account_password": password,
        "pin_code": pin_code,
        "status": str(payload.get("status", "available") or "available"),
        "hwid_reset_limit": int(payload.get("hwid_reset_limit", 0) or 0),
        "reseller_price": float(payload.get("reseller_price", 0) or 0),
        "created_at": str(payload.get("created_at", "")) or time.strftime("%Y-%m-%d %H:%M:%S"),
    }


def create_license(payload: dict[str, Any]) -> str:
    record = _normalize_license_payload(payload)
    item_id = create_item("licenses", record)
    if record["status"] == "available":
        _adjust_plan_stock(record["plan_id"], 1)
    return item_id


def update_license(item_id: str, payload: dict[str, Any]) -> None:
    existing = _request(f"licenses/{item_id}") or {"id": item_id}
    before_available = str(existing.get("status", "available")) == "available"
    before_plan_id = str(existing.get("plan_id", "")).strip()

    merged = dict(existing)
    merged.update(payload)
    record = _normalize_license_payload(merged)
    record["id"] = item_id
    _request(f"licenses/{item_id}", "PUT", record)

    after_available = str(record.get("status", "available")) == "available"
    after_plan_id = str(record.get("plan_id", "")).strip()
    if before_available:
        _adjust_plan_stock(before_plan_id, -1)
    if after_available:
        _adjust_plan_stock(after_plan_id, 1)


def delete_license(item_id: str) -> None:
    existing = _request(f"licenses/{item_id}") or {}
    if str(existing.get("status", "available")) == "available":
        _adjust_plan_stock(str(existing.get("plan_id", "")), -1)
    _request(f"licenses/{item_id}", "DELETE")


def generate_license_keys(payload: dict[str, Any]) -> list[str]:
    quantity = max(1, min(int(payload.get("quantity", 1)), 100))
    plan_id = str(payload.get("plan_id", "")).strip()
    keys: list[str] = []
    for index in range(quantity):
        key = f"KEY-{int(time.time() * 1000)}-{index + 1}"
        record = {
            "product_id": payload.get("product_id", ""),
            "plan_id": payload.get("plan_id", ""),
            "license_key": key,
            "status": "available",
            "hwid_reset_limit": int(payload.get("hwid_reset_limit", 0)),
            "reseller_price": float(payload.get("reseller_price", 0)),
            "created_at": time.strftime("%Y-%m-%d %H:%M:%S"),
        }
        create_item("licenses", record)
        keys.append(key)
    if plan_id:
        _adjust_plan_stock(plan_id, quantity)
    return keys
