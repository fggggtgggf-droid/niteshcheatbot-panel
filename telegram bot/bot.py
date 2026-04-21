from __future__ import annotations

import asyncio
import base64
import html
import json
import logging
import os
import re
import socket
import time
import urllib.parse
import urllib.request
from io import BytesIO

import qrcode
from telegram import (
    BotCommand,
    InlineKeyboardButton,
    InlineKeyboardMarkup,
    KeyboardButton,
    MenuButtonCommands,
    ReplyKeyboardMarkup,
    Update,
)
from telegram.ext import (
    Application,
    CallbackQueryHandler,
    CommandHandler,
    ContextTypes,
    MessageHandler,
    filters,
)


DEFAULT_PUBLIC_PANEL_URL = "https://niteshcheatbot.vercel.app"
PUBLIC_PANEL_URL = os.getenv("PUBLIC_PANEL_URL", DEFAULT_PUBLIC_PANEL_URL).rstrip("/")
REMOTE_PLATFORM = bool(os.getenv("RAILWAY_ENVIRONMENT") or os.getenv("RENDER") or os.getenv("PORT"))
API_BASE = os.getenv(
    "PANEL_API_BASE",
    f"{PUBLIC_PANEL_URL}/api" if REMOTE_PLATFORM else "http://127.0.0.1:5000/api",
).rstrip("/")

logging.basicConfig(
    format="%(asctime)s | %(name)s | %(levelname)s | %(message)s",
    level=logging.INFO,
)
LOGGER = logging.getLogger(__name__)
_CACHE: dict[str, dict] = {}
_INSTANCE_LOCK: socket.socket | None = None
EMOJI_RE = re.compile(
    "["
    "\U0001F300-\U0001FAFF"
    "\U00002700-\U000027BF"
    "\U000024C2-\U0001F251"
    "\u2600-\u26FF"
    "]+",
    flags=re.UNICODE,
)


def bot_token() -> str:
    token = os.getenv("TELEGRAM_BOT_TOKEN")
    if not token:
        token = settings().get("bot_token", "")
    if not token:
        raise RuntimeError("TELEGRAM_BOT_TOKEN missing.")
    return token


def api_get(path: str):
    with urllib.request.urlopen(f"{API_BASE}{path}", timeout=12) as response:
        return json.loads(response.read().decode("utf-8"))


def api_send(path: str, method: str, payload: dict | None = None):
    data = json.dumps(payload or {}).encode("utf-8")
    request = urllib.request.Request(
        f"{API_BASE}{path}",
        data=data if method in {"POST", "PUT", "PATCH"} else None,
        headers={"Content-Type": "application/json"},
        method=method,
    )
    with urllib.request.urlopen(request, timeout=12) as response:
        result = json.loads(response.read().decode("utf-8"))
    _CACHE.clear()
    return result


def cached_api_get(path: str, ttl: float = 2.0):
    cache_key = f"{path}:{ttl}"
    current_time = time.time()
    entry = _CACHE.get(cache_key)
    if entry and current_time < float(entry.get("expires_at", 0)):
        return entry.get("value")
    value = api_get(path)
    _CACHE[cache_key] = {"value": value, "expires_at": current_time + ttl}
    return value


def settings():
    return cached_api_get("/runtime-settings", ttl=4.0)


def media_input(media: str, fallback_name: str = "upload.jpg"):
    if hasattr(media, "read"):
        try:
            media.seek(0)
        except Exception:
            pass
        return media
    text = str(media or "").strip()
    if text.startswith("data:") and ";base64," in text:
        meta, encoded = text.split(",", 1)
        mime = meta.split(";", 1)[0].replace("data:", "").strip().lower()
        ext = "jpg"
        if mime.endswith("png"):
            ext = "png"
        elif mime.endswith("webp"):
            ext = "webp"
        elif mime.endswith("gif"):
            ext = "gif"
        elif mime.endswith("mp4"):
            ext = "mp4"
        stream = BytesIO(base64.b64decode(encoded))
        stream.name = fallback_name if "." in fallback_name else f"{fallback_name}.{ext}"
        stream.seek(0)
        return stream
    return text


def get_wallet_balance(telegram_id: int) -> float:
    try:
        data = api_get(f"/wallet/{urllib.parse.quote(str(telegram_id))}")
        return float(data.get("balance", 0) or 0)
    except Exception:
        return 0.0


def list_users():
    return cached_api_get("/users", ttl=4.0)


def get_user_by_telegram_id(telegram_id: int):
    try:
        user = cached_api_get(f"/users/by-telegram/{urllib.parse.quote(str(telegram_id))}", ttl=2.0)
        return user or None
    except Exception:
        for user in list_users():
            if str(user.get("telegram_id", "")) == str(telegram_id):
                return user
        return None


def is_captcha_verified(user: dict | None) -> bool:
    return bool(int((user or {}).get("captcha_verified", 0) or 0))


def list_admin_ids() -> list[str]:
    admins = cached_api_get("/admins", ttl=3.0)
    return [str(admin.get("telegram_id", "")).strip() for admin in admins if str(admin.get("telegram_id", "")).strip()]


def get_admin_access(telegram_id: int) -> dict:
    try:
        return cached_api_get(f"/admins/access/{urllib.parse.quote(str(telegram_id))}", ttl=2.0)
    except Exception:
        return {"active": False, "reason": "lookup_failed", "record": {}}


def admin_contact() -> dict:
    try:
        return cached_api_get("/admin-contact", ttl=5.0)
    except Exception:
        return {"username": "", "telegram_id": "", "name": "Admin"}


def is_owner(telegram_id: int) -> bool:
    access = get_admin_access(telegram_id)
    record = access.get("record") or {}
    return bool(access.get("active")) and str(record.get("panel_role", "admin")) == "owner"


def is_admin(telegram_id: int) -> bool:
    access = get_admin_access(telegram_id)
    return bool(access.get("active"))


def list_admin_records():
    return cached_api_get("/admins", ttl=3.0)


def list_owner_plans():
    return cached_api_get("/owner-plans", ttl=6.0)


def current_admin_record(telegram_id: int) -> dict:
    return get_admin_access(telegram_id).get("record") or {}


def sync_admin_profile(user) -> None:
    try:
        access = get_admin_access(user.id)
        record = access.get("record") or {}
        if not record or not record.get("id"):
            return
        payload = {}
        username = str(getattr(user, "username", "") or "").strip()
        first_name = str(getattr(user, "first_name", "") or "").strip()
        if username and username != str(record.get("username", "")).strip():
            payload["username"] = username
        if first_name and first_name != str(record.get("name", "")).strip():
            payload["name"] = first_name
        if payload:
            api_send(f"/admins/{record.get('id')}", "PATCH", payload)
    except Exception:
        return


def system_status() -> dict:
    try:
        return cached_api_get("/system-status", ttl=5.0)
    except Exception:
        return {"bot_enabled": True, "active_super_admins": 0, "maintenance_message": "Bot status unavailable."}


def user_bot_available(telegram_id: int) -> bool:
    if is_owner(telegram_id) or is_admin(telegram_id):
        return True
    return bool(system_status().get("bot_enabled", False))


def list_buttons():
    items = [button for button in cached_api_get("/buttons", ttl=3.0) if int(button.get("is_active", 1)) == 1]
    items.sort(key=lambda item: int(item.get("sort_order", 0)))
    return items


def filter_buttons(placement: str, product_id: str | None = None):
    result = []
    for button in list_buttons():
        btn_place = str(button.get("placement", "main") or "main")
        if btn_place != placement:
            continue
        target_product = str(button.get("target_product_id", "")).strip()
        if placement == "product" and target_product and str(product_id or "") != target_product:
            continue
        result.append(button)
    return result


def list_products():
    return [product for product in cached_api_get("/products", ttl=3.0) if int(product.get("is_active", 1)) == 1]


def list_plans(product_id: str | None = None):
    query = f"?product_id={urllib.parse.quote(str(product_id))}" if product_id else ""
    return [plan for plan in cached_api_get(f"/plans{query}", ttl=3.0) if int(plan.get("is_active", 1)) == 1]


def list_orders(telegram_id: int):
    return api_get(f"/orders?telegram_id={urllib.parse.quote(str(telegram_id))}")


def list_product_actions(product_id: str):
    return [
        action
        for action in cached_api_get(f"/product-actions?product_id={urllib.parse.quote(str(product_id))}", ttl=3.0)
        if int(action.get("is_active", 1)) == 1
    ]


def split_media_urls(product: dict) -> list[str]:
    media_text = str(product.get("media", "") or "")
    urls = [line.strip() for line in media_text.split("\n") if line.strip()]
    return urls


def get_product_media_url(product: dict) -> str:
    direct = str(product.get("video_url", "") or "").strip()
    if direct:
        return direct
    media_urls = split_media_urls(product)
    return media_urls[0] if media_urls else ""


def wallet_text(telegram_id: int) -> str:
    return f"Wallet Balance: Rs {int(get_wallet_balance(telegram_id))}"


def highlighted_label(label: str) -> str:
    clean = EMOJI_RE.sub("", str(label or "")).replace("•", " ").strip()
    clean = re.sub(r"[✦✧✩✪✫✬✭✮✯✰★☆❖❈❉❊❋◆◇◈◉⬥⬦♦]", " ", clean)
    clean = re.sub(r"[`~_=|]+", " ", clean)
    clean = re.sub(r"\s+", " ", clean)
    clean = re.sub(r"^[^\w]+", "", clean, flags=re.UNICODE)
    clean = re.sub(r"[^\w]+$", "", clean, flags=re.UNICODE)
    return clean.strip()


def clean_button_text(label: str) -> str:
    clean = str(label or "").replace("â€¢", " ").strip()
    clean = re.sub(r"[âœ¦âœ§âœ©âœªâœ«âœ¬âœ­âœ®âœ¯âœ°â˜…â˜†â–âˆâ‰âŠâ‹â—†â—‡â—ˆâ—‰â¬¥â¬¦â™¦]+", " ", clean)
    clean = re.sub(r"[`~_=|]+", " ", clean)
    clean = re.sub(r"\s+", " ", clean)
    return clean.strip()


def sanitize_heading(text: str) -> str:
    clean = EMOJI_RE.sub("", str(text or "")).strip()
    clean = re.sub(r"[✦✧✩✪✫✬✭✮✯✰★☆❖❈❉❊❋◆◇◈◉⬥⬦♦]+", " ", clean)
    clean = re.sub(r"[─━│┃┄┅┆┇┈┉┊┋╌╍╎╏═║╔╗╚╝╠╣╦╩╬┌┐└┘├┤┬┴┼]+", " ", clean)
    clean = re.sub(r"[`~_=|]+", " ", clean)
    clean = re.sub(r"\s+", " ", clean)
    return clean.strip()


def button_label(button: dict) -> str:
    builtin_map = {
        "shop_now": "Shop Now",
        "my_orders": "My Orders",
        "profile": "Profile",
        "pay_proof": "Pay Proof",
        "feedback": "Feedback",
        "how_to_use": "How to Use",
        "support": "Support",
        "id_help": "ID & LVL ID",
        "refer_earn": "Refer & Earn",
        "deposit_now": "Deposit Now",
        "all_history": "All History",
    }
    raw_label = str(button.get("label", "") or "").strip()
    if raw_label:
        return clean_button_text(raw_label)
    builtin_action = str(button.get("builtin_action", "") or "").strip()
    if builtin_action in builtin_map:
        return builtin_map[builtin_action]
    return clean_button_text(raw_label)


def current_user_role(telegram_id: int) -> str:
    user = get_user_by_telegram_id(telegram_id) or {}
    role = str(user.get("role", "user") or "user").strip().lower()
    return role if role in {"user", "reseller", "admin"} else "user"


def role_text(telegram_id: int) -> str:
    role = current_user_role(telegram_id)
    return f"Status: {'Reseller' if role == 'reseller' else 'User'}"


def safe_template(template: str, values: dict, fallback: str) -> str:
    source = str(template or "").strip() or fallback
    try:
        rendered = source.format(**values)
    except Exception:
        rendered = fallback.format(**values)
    return str(rendered or "").strip()


def referral_summary(telegram_id: int) -> dict:
    try:
        return api_get(f"/referrals/{urllib.parse.quote(str(telegram_id))}")
    except Exception:
        return {}


def plan_price_for_user(plan: dict, telegram_id: int) -> float:
    reseller_price = float(plan.get("reseller_price", 0) or 0)
    if current_user_role(telegram_id) == "reseller" and reseller_price > 0:
        return reseller_price
    return float(plan.get("price", 0) or 0)


def admin_contact_line() -> str:
    contact = admin_contact()
    username = str(contact.get("username", "")).strip()
    if username:
        return f"Contact Admin: @{username}"
    telegram_id = str(contact.get("telegram_id", "")).strip()
    if telegram_id:
        return f"Contact Admin ID: {telegram_id}"
    return "Contact Admin for assistance."


def support_lines(app_settings: dict) -> list[str]:
    items = [str(app_settings.get("support_text", "") or "").strip()]
    telegram_link = str(app_settings.get("telegram_support_link", "") or "").strip()
    whatsapp_link = str(app_settings.get("whatsapp_support_link", "") or "").strip()
    if telegram_link:
        items.append(f"Telegram: {telegram_link}")
    if whatsapp_link:
        items.append(f"WhatsApp: {whatsapp_link}")
    return [item for item in items if item]


def payment_settings() -> dict:
    try:
        return cached_api_get("/payment-settings", ttl=4.0)
    except Exception:
        return {"qr": "", "upi_id": ""}


def build_upi_uri(upi_id: str, amount: int) -> str:
    app_settings = settings()
    params = {
        "pa": str(upi_id or "").strip(),
        "pn": app_settings.get("brand_name", "Seller Bot"),
        "am": f"{float(amount):.2f}",
        "tn": f"Wallet Deposit Rs {int(amount)}",
        "cu": "INR",
    }
    return f"upi://pay?{urllib.parse.urlencode(params)}"


def generated_upi_qr(upi_id: str, amount: int) -> str:
    upi_uri = build_upi_uri(upi_id, amount)
    return f"https://api.qrserver.com/v1/create-qr-code/?size=720x720&data={urllib.parse.quote(upi_uri, safe='')}"


def generated_upi_qr_image(upi_id: str, amount: int):
    upi_uri = build_upi_uri(upi_id, amount)
    qr = qrcode.QRCode(version=None, box_size=12, border=3)
    qr.add_data(upi_uri)
    qr.make(fit=True)
    image = qr.make_image(fill_color="black", back_color="white")
    stream = BytesIO()
    image.save(stream, format="PNG")
    stream.name = f"upi-{amount}.png"
    stream.seek(0)
    return stream


def acquire_single_instance_lock() -> None:
    global _INSTANCE_LOCK
    if _INSTANCE_LOCK is not None:
        return
    lock_socket = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    lock_socket.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
    try:
        lock_socket.bind(("127.0.0.1", 48763))
        lock_socket.listen(1)
        _INSTANCE_LOCK = lock_socket
    except OSError as exc:
        lock_socket.close()
        raise RuntimeError("Another bot instance is already running.") from exc


def build_reply_keyboard(telegram_id: int) -> ReplyKeyboardMarkup:
    rows = [
        [KeyboardButton("Shop"), KeyboardButton("My Orders")],
        [KeyboardButton("Profile"), KeyboardButton("Deposit Now")],
        [KeyboardButton("Support"), KeyboardButton("Menu")],
    ]
    if is_admin(telegram_id):
        rows.append([KeyboardButton("Admin Panel")])
    if is_owner(telegram_id):
        rows.append([KeyboardButton("Owner Panel")])
    return ReplyKeyboardMarkup(rows, resize_keyboard=True, one_time_keyboard=False)


def main_button_callback(action: str) -> str:
    for button in list_buttons():
        if str(button.get("builtin_action", "") or "").strip() == action:
            return f"btn:{button['id']}"
    fallback_map = {
        "shop_now": "shop_now",
        "my_orders": "my_orders_view",
        "deposit_now": "deposit_now",
        "all_history": "history:menu",
    }
    return fallback_map.get(action, "back:menu")


def build_main_menu() -> InlineKeyboardMarkup:
    rows = []
    current_row = []
    for button in filter_buttons("main"):
        action_type = str(button.get("action_type", "")).strip()
        builtin_action = str(button.get("builtin_action", "")).strip()
        callback_data = main_button_callback(builtin_action) if action_type == "builtin" else f"btn:{button['id']}"
        current_row.append(InlineKeyboardButton(button_label(button), callback_data=callback_data))
        if len(current_row) == 2:
            rows.append(current_row)
            current_row = []
    if current_row:
        rows.append(current_row)
    return InlineKeyboardMarkup(rows)


def build_products_menu() -> InlineKeyboardMarkup:
    rows = []
    current = []
    for product in list_products():
        current.append(InlineKeyboardButton(highlighted_label(product["name"]), callback_data=f"prod:{product['id']}"))
        if len(current) == 2:
            rows.append(current)
            current = []
    if current:
        rows.append(current)
    for button in filter_buttons("shop"):
        rows.append([InlineKeyboardButton(button_label(button), callback_data=f"btn:{button['id']}")])
    rows.append([InlineKeyboardButton("Back to Menu", callback_data="back:menu")])
    return InlineKeyboardMarkup(rows)


def build_product_menu(product_id: str) -> InlineKeyboardMarkup:
    rows = []
    for action in list_product_actions(product_id):
        rows.append([InlineKeyboardButton(highlighted_label(action["label"]), url=action["url"])])
    for button in filter_buttons("product", product_id=product_id):
        rows.append([InlineKeyboardButton(button_label(button), callback_data=f"btn:{button['id']}")])
    rows.append([InlineKeyboardButton("Buy This Now", callback_data=f"plans:{product_id}")])
    rows.append([InlineKeyboardButton("Back to Shop", callback_data="shop_now")])
    return InlineKeyboardMarkup(rows)


def build_plan_menu(product_id: str, telegram_id: int) -> InlineKeyboardMarkup:
    rows = []
    for plan in list_plans(product_id):
        price = int(plan_price_for_user(plan, telegram_id))
        label = f"{plan['name']} - Rs {price}"
        if int(plan.get("stock", 0)) <= 0:
            label = f"{label} - Out of Stock"
        rows.append([InlineKeyboardButton(highlighted_label(label), callback_data=f"plan:{plan['id']}")])
    rows.append([InlineKeyboardButton("Back to Shop", callback_data="shop_now")])
    return InlineKeyboardMarkup(rows)


def deposit_limits() -> tuple[int, int]:
    pay_settings = payment_settings()
    minimum = int(pay_settings.get("min_deposit", 100) or 100)
    maximum = int(pay_settings.get("max_deposit", 5000) or 5000)
    if maximum < minimum:
        maximum = minimum
    return minimum, maximum


async def send_captcha_prompt(message, context: ContextTypes.DEFAULT_TYPE, user_id: int) -> None:
    challenge = str(1000 + int(time.time()) % 9000)
    context.user_data["captcha_expected"] = challenge
    await message.reply_text(
        "\n".join(
            [
                "🤖 <b>Captcha Verification</b>",
                "",
                "Please type the number you see below:",
                "",
                f"👉 <b>Captcha code - </b> <code>{challenge}</code>",
                "",
                "(Write this number and reply)",
            ]
        ),
        parse_mode="HTML",
    )


def premium_card(title: str, lines: list[str]) -> str:
    app_settings = settings()
    card_title = sanitize_heading(str(app_settings.get("bot_card_title", "") or "").strip())
    if not card_title:
        card_title = sanitize_heading(str(app_settings.get("brand_name", "SELLER BOT") or "SELLER BOT").strip())
    tagline = sanitize_heading(str(app_settings.get("bot_card_tagline", "") or "").strip())
    safe_title = sanitize_heading(str(title or "").strip())
    header = []
    if card_title:
        header.append(f"<b>{html.escape(card_title)}</b>")
    if safe_title and safe_title.lower() not in {card_title.lower(), "main menu"}:
        header.append(f"<b>{html.escape(safe_title)}</b>")
    if tagline:
        header.append(html.escape(tagline))
    body = [html.escape(str(line)) for line in lines if str(line).strip()]
    content = header + ([""] if header and body else []) + body
    return "\n".join(content)


def premium_card_html(title: str, lines: list[str]) -> str:
    app_settings = settings()
    card_title = sanitize_heading(str(app_settings.get("bot_card_title", "") or "").strip())
    if not card_title:
        card_title = sanitize_heading(str(app_settings.get("brand_name", "SELLER BOT") or "SELLER BOT").strip())
    tagline = sanitize_heading(str(app_settings.get("bot_card_tagline", "") or "").strip())
    safe_title = sanitize_heading(str(title or "").strip())
    header = []
    if card_title:
        header.append(f"<b>{html.escape(card_title)}</b>")
    if safe_title and safe_title.lower() not in {card_title.lower(), "main menu"}:
        header.append(f"<b>{html.escape(safe_title)}</b>")
    if tagline:
        header.append(html.escape(tagline))
    body = [str(line) for line in lines if str(line).strip()]
    content = header + ([""] if header and body else []) + body
    return "\n".join(content)


def plain_main_menu_text(telegram_id: int, brand_name: str, welcome_text_value: str) -> str:
    app_settings = settings()
    user = get_user_by_telegram_id(telegram_id) or {}
    role = "Reseller" if current_user_role(telegram_id) == "reseller" else "User"
    balance = int(get_wallet_balance(telegram_id))
    replacements = {
        "brand_name": str(brand_name or "").strip() or "SELLER BOT",
        "welcome_text": str(welcome_text_value or "").strip(),
        "role": role,
        "status": role,
        "balance": balance,
        "first_name": user.get("first_name", "User"),
        "username": user.get("username", ""),
        "telegram_id": telegram_id,
    }
    replacements["role_line"] = safe_template(
        str(app_settings.get("status_text_template", "") or ""),
        replacements,
        "Status: {role}",
    )
    replacements["wallet_line"] = safe_template(
        str(app_settings.get("wallet_text_template", "") or ""),
        replacements,
        "Wallet Balance: Rs {balance}",
    )
    rendered = safe_template(
        str(app_settings.get("start_message_template", "") or ""),
        replacements,
        "{brand_name}\n{welcome_text}\n{role_line}\n{wallet_line}",
    )
    return "\n".join(line.rstrip() for line in rendered.splitlines() if line.strip())


def purchase_success_text(order: dict, telegram_id: int) -> str:
    lines = [
        "🎉 <b>Congratulations, purchase completed successfully.</b>",
        "",
        f"Status: {html.escape(current_user_role(telegram_id).title())}",
        wallet_text(telegram_id),
        f"Order ID: <code>{html.escape(str(order.get('id', order.get('order_id', '-'))))}</code>",
        f"Plan: {html.escape(str(order.get('plan_name', order.get('plan_id', '-'))))}",
        f"Valid For: {html.escape(str(order.get('duration_label', order.get('duration_days', '-'))))}",
        "",
        "<b>License Details</b>",
    ]
    key_type = str(order.get("key_type", "pin") or "pin").strip().lower()
    if key_type == "credentials":
        username = str(order.get("account_username", "") or "").strip()
        password = str(order.get("account_password", "") or "").strip()
        if username:
            lines.append(f"Username: <code>{html.escape(username)}</code>")
        if password:
            lines.append(f"Password: <code>{html.escape(password)}</code>")
    else:
        pin_code = str(order.get("pin_code", "") or order.get("license_key", "") or "-").strip()
        lines.append(f"Key: <code>{html.escape(pin_code)}</code>")
    if str(order.get("license_key", "") or "").strip() and key_type == "credentials":
        lines.append(f"License: <code>{html.escape(str(order.get('license_key')))}</code>")
    lines.append("")
    lines.append("Tap and hold the code to copy.")
    return "\n".join(lines)


async def send_inactive_admin_notice(message, telegram_id: int) -> None:
    access = get_admin_access(telegram_id)
    record = access.get("record") or {}
    await message.reply_text(
        premium_card(
            "ADMIN ACCESS PAUSED",
            [
                f"Status: {record.get('status', access.get('reason', 'inactive'))}",
                "Your admin access is currently paused.",
                admin_contact_line(),
            ],
        ),
        parse_mode="HTML",
    )


async def send_maintenance_notice(message) -> None:
    status = system_status()
    await message.reply_text(
        premium_card(
            "BOT IN MAINTENANCE",
            [
                status.get("maintenance_message", "Bot is temporarily unavailable."),
                admin_contact_line(),
                "Please try again later.",
            ],
        ),
        parse_mode="HTML",
    )


async def delete_previous(query):
    try:
        await query.message.delete()
    except Exception:
        pass


async def send_admin_alert(context: ContextTypes.DEFAULT_TYPE, text: str) -> None:
    for chat_id in list_admin_ids():
        try:
            await context.bot.send_message(chat_id=chat_id, text=text)
        except Exception:
            continue


async def send_admin_alert_with_markup(context: ContextTypes.DEFAULT_TYPE, text: str, markup: InlineKeyboardMarkup | None = None) -> None:
    for chat_id in list_admin_ids():
        try:
            await context.bot.send_message(chat_id=chat_id, text=text, reply_markup=markup)
        except Exception:
            continue


def deposit_method_rows(needed: int = 0) -> list[list[InlineKeyboardButton]]:
    rows: list[list[InlineKeyboardButton]] = []
    if needed > 0:
        rows.append([InlineKeyboardButton(f"Add Rs {needed} Now", callback_data=f"deposit_method_upi:{needed}")])
    rows.append([InlineKeyboardButton("Pay via UPI", callback_data="deposit_method_upi")])
    rows.append([InlineKeyboardButton("Back to Menu", callback_data="back:menu")])
    return rows


def deposit_prompt_text(user_id: int, needed: int = 0) -> str:
    pay_settings = payment_settings()
    upi_id = str(pay_settings.get("upi_id", "")).strip()
    minimum, maximum = deposit_limits()
    lines = [wallet_text(user_id)]
    if needed > 0:
        lines.append(f"Need Rs {needed} more to complete this purchase.")
    if upi_id:
        lines.append("💳 Choose your deposit method below.")
        lines.append(f"UPI ID: <code>{html.escape(upi_id)}</code>")
        lines.append(f"⚠ Minimum: Rs {minimum}")
        lines.append(f"⚠ Maximum: Rs {maximum}")
        lines.append("Tap Pay via UPI and continue.")
    else:
        lines.extend(
            [
                "Deposit is under maintenance right now.",
                admin_contact_line(),
            ]
        )
    return premium_card_html("DEPOSIT NOW", lines)


def deposit_amount_prompt_text(user_id: int, needed: int = 0) -> str:
    minimum, maximum = deposit_limits()
    lines = [wallet_text(user_id)]
    if needed > 0:
        lines.append(f"Required to continue: Rs {needed}")
    lines.append("Enter the amount you want to deposit")
    lines.append("in INR.")
    lines.append(f"Warning: Minimum Rs {minimum}")
    lines.append(f"Warning: Maximum Rs {maximum}")
    lines.append("Type the amount and send.")
    return premium_card("Deposit via UPI", lines)


async def send_deposit_checkout_message(message, user_id: int, amount: int, request_id: str) -> None:
    pay_settings = payment_settings()
    upi_id = str(pay_settings.get("upi_id", "")).strip()
    static_qr = str(pay_settings.get("qr", "")).strip()
    qr_source = generated_upi_qr_image(upi_id, amount) if upi_id else static_qr
    lines = [
        wallet_text(user_id),
        f"Amount: Rs {int(amount)}",
    ]
    if upi_id:
        lines.append(f"UPI ID: <code>{html.escape(upi_id)}</code>")
        lines.append("✅ Pay this exact amount using the QR or UPI ID.")
        lines.append("🧾 Then tap I Have Paid and submit your UTR.")
    else:
        lines.append("Admin QR is configured.")
        lines.append("✅ Pay this amount, then tap I Have Paid.")
    markup = InlineKeyboardMarkup(
        [
            [InlineKeyboardButton("I Have Paid", callback_data=f"deposit_paid:{request_id}")],
            [InlineKeyboardButton("Cancel", callback_data=f"deposit_cancel:{request_id}")],
        ]
    )
    caption = premium_card_html("PAYMENT CHECKOUT", lines)
    if qr_source:
        try:
            await message.reply_photo(photo=media_input(qr_source, "upi-qr.jpg"), caption=caption, parse_mode="HTML", reply_markup=markup)
            return
        except Exception:
            pass
    fallback_lines = list(lines)
    if upi_id:
        fallback_lines.append("If QR is not visible, pay manually using the UPI ID above.")
    await message.reply_text(premium_card_html("PAYMENT CHECKOUT", fallback_lines), parse_mode="HTML", reply_markup=markup)


def build_owner_panel_markup() -> InlineKeyboardMarkup:
    return InlineKeyboardMarkup(
        [
            [InlineKeyboardButton("Admin Access", callback_data="owner:admins"), InlineKeyboardButton("Plans", callback_data="owner:plans")],
            [InlineKeyboardButton("Expiring Soon", callback_data="owner:expiring")],
        ]
    )


async def start(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    if not update.effective_user or not update.message:
        return
    user = update.effective_user
    if is_admin(user.id) or is_owner(user.id):
        sync_admin_profile(user)
    current_user = get_user_by_telegram_id(user.id)
    referral_source = ""
    if context.args and (not current_user or not str(current_user.get("referred_by_telegram_id", "")).strip()):
        first_arg = str(context.args[0] or "").strip()
        if first_arg.startswith("ref_"):
            referred_by = first_arg.replace("ref_", "", 1).strip()
            if referred_by and referred_by != str(user.id):
                referral_source = referred_by
    api_send(
        "/users",
        "POST",
        {
            "telegram_id": user.id,
            "first_name": user.first_name or "Friend",
            "username": user.username or "",
            "role": "user",
            **({"referred_by_telegram_id": referral_source} if referral_source else {}),
        },
    )
    current_user = get_user_by_telegram_id(user.id)
    if current_user and int(current_user.get("is_banned", 0)) == 1:
        await update.message.reply_text("You are blocked by admin.")
        return
    if not is_admin(user.id) and not is_owner(user.id) and not is_captcha_verified(current_user):
        await send_captcha_prompt(update.message, context, user.id)
        return
    if not user_bot_available(user.id):
        await send_maintenance_notice(update.message)
        return
    admin_access = get_admin_access(user.id)
    app_settings = settings()
    text = app_settings.get("welcome_text", "Welcome {name}!").format(
        name=html.escape(user.first_name or "Friend"),
        brand_name=app_settings.get("brand_name", "Brand"),
    )
    text = plain_main_menu_text(user.id, app_settings.get("brand_name", "SELLER BOT"), text)
    if admin_access.get("record") and not admin_access.get("active"):
        await send_inactive_admin_notice(update.message, user.id)
        return
    last_start_message_id = context.user_data.get("last_start_message_id")
    if last_start_message_id:
        try:
            await context.bot.delete_message(chat_id=user.id, message_id=last_start_message_id)
        except Exception:
            pass
    sent = await update.message.reply_text(text, reply_markup=build_main_menu())
    context.user_data["last_start_message_id"] = sent.message_id


async def shop_command(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    if not update.effective_user or not update.message:
        return
    await update.message.reply_text(
        premium_card("PREMIUM SHOP", [wallet_text(update.effective_user.id), "Tap any product below to continue."]),
        parse_mode="HTML",
        reply_markup=build_products_menu(),
    )


async def orders_command(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    if not update.effective_user or not update.message:
        return
    user_id = update.effective_user.id
    orders = sorted(list_orders(user_id), key=lambda item: str(item.get("id", "")), reverse=True)
    if not orders:
        await update.message.reply_text(
            premium_card("MY ORDERS", [wallet_text(user_id), "No orders yet."]),
            parse_mode="HTML",
            reply_markup=build_reply_keyboard(user_id),
        )
        return
    lines = [wallet_text(user_id)]
    for item in orders[:10]:
        lines.append(f"📦 #{item.get('id')} • {item.get('status', '-')}")
        lines.append(f"💸 Rs {int(float(item.get('amount', 0) or 0))}")
    await update.message.reply_text(
        premium_card("MY ORDERS", lines),
        parse_mode="HTML",
        reply_markup=build_reply_keyboard(user_id),
    )


async def profile_command(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    if not update.effective_user or not update.message:
        return
    user = get_user_by_telegram_id(update.effective_user.id) or {}
    await update.message.reply_text(
        premium_card(
            "MY PROFILE",
            [
                f"👤 Name: {user.get('first_name', 'User')}",
                f"✨ Username: @{user.get('username')}" if user.get("username") else "✨ Username: -",
                f"🆔 User ID: {update.effective_user.id}",
                role_text(update.effective_user.id),
                f"💰 Wallet Balance: Rs {int(user.get('balance', 0) or 0)}",
                f"📅 Joined On: {user.get('created_at', '-')}",
            ],
        ),
        parse_mode="HTML",
        reply_markup=build_reply_keyboard(update.effective_user.id),
    )


async def deposit_command(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    if not update.effective_user or not update.message:
        return
    pay_settings = payment_settings()
    if str(pay_settings.get("upi_id", "")).strip() or str(pay_settings.get("qr", "")).strip():
        await update.message.reply_text(
            deposit_prompt_text(update.effective_user.id),
            parse_mode="HTML",
            reply_markup=InlineKeyboardMarkup(deposit_method_rows()),
        )
    else:
        await update.message.reply_text(
            premium_card(
                "DEPOSIT MAINTENANCE",
                [
                    "Deposit abhi maintenance mein hai.",
                    admin_contact_line(),
                ],
            ),
            parse_mode="HTML",
        )


async def support_command(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    if not update.effective_user or not update.message:
        return
    app_settings = settings()
    await update.message.reply_text(
        "\n".join(support_lines(app_settings)) or "Support details not configured yet.",
        reply_markup=build_reply_keyboard(update.effective_user.id),
    )


async def menu_command(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    if not update.effective_user or not update.message:
        return
    app_settings = settings()
    await update.message.reply_text(
        plain_main_menu_text(
            update.effective_user.id,
            app_settings.get("brand_name", "SELLER BOT"),
            app_settings.get("welcome_text", "Welcome {name}!").format(
                name=html.escape(update.effective_user.first_name or "Friend"),
                brand_name=app_settings.get("brand_name", "Brand"),
            ),
        ),
        reply_markup=build_main_menu(),
    )


async def purchase_command(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    await shop_command(update, context)


async def admin_panel(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    if not update.effective_user or not update.message:
        return
    if not is_admin(update.effective_user.id):
        await update.message.reply_text("Admin only command.")
        return
    await update.message.reply_text(
        "Admin commands:\n"
        "/pending_payments\n"
        "/pending_resets\n"
        "/announce <message>\n"
        "/setproductvideo <product_id> (reply to video)\n"
        "/setqr (reply to QR image)",
    )


async def pending_payments(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    if not update.effective_user or not update.message:
        return
    if not is_admin(update.effective_user.id):
        await update.message.reply_text("Admin only command.")
        return
    pending = [item for item in api_get("/payment-requests") if str(item.get("status")) == "submitted"]
    if not pending:
        await update.message.reply_text("No submitted payment requests.")
        return
    for item in pending[:15]:
        text = (
            f"Payment Request #{item.get('id')}\n"
            f"Type: {item.get('type', 'wallet_topup')}\n"
            f"User: {item.get('telegram_id')}\n"
            f"Amount: Rs {item.get('amount')}\n"
            f"UPI Ref: {item.get('upi_ref', '-')}"
        )
        await update.message.reply_text(
            text,
            reply_markup=InlineKeyboardMarkup(
                [
                    [
                        InlineKeyboardButton("Approve", callback_data=f"admin_pay_approve:{item.get('id')}"),
                        InlineKeyboardButton("Reject", callback_data=f"admin_pay_reject:{item.get('id')}"),
                    ]
                ]
            ),
        )


async def pending_resets(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    if not update.effective_user or not update.message:
        return
    if not is_admin(update.effective_user.id):
        await update.message.reply_text("Admin only command.")
        return
    pending = [item for item in api_get("/reset-requests") if str(item.get("status")) == "pending"]
    if not pending:
        await update.message.reply_text("No pending reset requests.")
        return
    for item in pending[:15]:
        await update.message.reply_text(
            f"Reset Request #{item.get('id')}\nOrder: {item.get('order_id')}\nUser: {item.get('telegram_id')}",
            reply_markup=InlineKeyboardMarkup(
                [
                    [
                        InlineKeyboardButton("Approve", callback_data=f"admin_reset_approve:{item.get('id')}"),
                        InlineKeyboardButton("Reject", callback_data=f"admin_reset_reject:{item.get('id')}"),
                    ]
                ]
            ),
        )


async def announce(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    if not update.effective_user or not update.message:
        return
    if not is_admin(update.effective_user.id):
        await update.message.reply_text("Admin only command.")
        return
    text = " ".join(context.args or []).strip()
    if not text:
        await update.message.reply_text("Usage: /announce <message>")
        return
    response = api_send("/announcements/broadcast", "POST", {"message": text, "media_type": "text", "media": ""})
    await update.message.reply_text(f"Broadcast sent to {response.get('sent_count')}/{response.get('total')}")


async def setproductvideo(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    if not update.effective_user or not update.message:
        return
    if not is_admin(update.effective_user.id):
        await update.message.reply_text("Admin only command.")
        return
    if not context.args or not update.message.reply_to_message or not update.message.reply_to_message.video:
        await update.message.reply_text("Usage: /setproductvideo <product_id> (reply to video)")
        return
    product_id = context.args[0]
    file_id = update.message.reply_to_message.video.file_id
    api_send(f"/products/{product_id}", "PUT", {"video_url": file_id})
    await update.message.reply_text("Product video updated.")


async def setqr(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    if not update.effective_user or not update.message:
        return
    if not is_admin(update.effective_user.id):
        await update.message.reply_text("Admin only command.")
        return
    if not update.message.reply_to_message or not update.message.reply_to_message.photo:
        await update.message.reply_text("Usage: /setqr (reply to QR image)")
        return
    file_id = update.message.reply_to_message.photo[-1].file_id
    current_settings = payment_settings()
    api_send("/payment-settings", "PUT", {"qr": file_id, "upi_id": str(current_settings.get("upi_id", "")).strip()})
    await update.message.reply_text("Payment QR updated.")


async def on_media_message(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    if not update.message or not update.effective_user:
        return
    if not is_admin(update.effective_user.id) and not is_owner(update.effective_user.id):
        return
    message = update.message
    media_type = ""
    file_id = ""
    if message.photo:
        media_type = "photo"
        file_id = message.photo[-1].file_id
    elif message.video:
        media_type = "video"
        file_id = message.video.file_id
    elif message.animation:
        media_type = "video"
        file_id = message.animation.file_id
    elif message.document:
        media_type = "document"
        file_id = message.document.file_id
    elif message.sticker:
        media_type = "sticker"
        file_id = message.sticker.file_id
    if not file_id:
        return
    awaiting_media = str(context.user_data.get("awaiting_setting_media", "") or "").strip()
    if awaiting_media == "payment_qr":
        current_settings = payment_settings()
        api_send(
            "/payment-settings",
            "PUT",
            {
                "qr": file_id,
                "upi_id": str(current_settings.get("upi_id", "")).strip(),
            },
        )
        context.user_data["awaiting_setting_media"] = ""
        await message.reply_text("Payment QR updated from Telegram bot.")
        return
    await message.reply_text(
        f"Media helper ready\nType: {media_type}\nFile ID:\n{file_id}\n\nUse this file_id in Announcement / Product Media / Custom Buttons."
    )


async def on_text(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    if not update.message or not update.effective_user:
        return
    if is_admin(update.effective_user.id) or is_owner(update.effective_user.id):
        sync_admin_profile(update.effective_user)
    if not user_bot_available(update.effective_user.id):
        await send_maintenance_notice(update.message)
        return
    admin_access = get_admin_access(update.effective_user.id)
    if admin_access.get("record") and not admin_access.get("active"):
        await send_inactive_admin_notice(update.message, update.effective_user.id)
        return
    pending_request = context.user_data.get("awaiting_upi_ref_for")
    if pending_request:
        ref = (update.message.text or "").strip()
        if not ref:
            await update.message.reply_text("Payment reference send karo.")
            return
        api_send(f"/payment-requests/{pending_request}/mark-paid", "POST", {"upi_ref": ref})
        context.user_data["awaiting_upi_ref_for"] = ""
        await update.message.reply_text("Payment submitted. Admin approval ke baad wallet update hoga.")
        user = get_user_by_telegram_id(update.effective_user.id) or {}
        await send_admin_alert_with_markup(
            context,
            premium_card(
                "NEW DEPOSIT REQUEST",
                [
                    f"Request ID: {pending_request}",
                    f"User ID: {update.effective_user.id}",
                    f"Username: @{user.get('username') or '-'}",
                    f"Wallet: Rs {int(user.get('balance', 0) or 0)}",
                    f"UTR: {ref}",
                ],
            ),
            InlineKeyboardMarkup(
                [[
                    InlineKeyboardButton("Approve", callback_data=f"admin_pay_approve:{pending_request}"),
                    InlineKeyboardButton("Reject", callback_data=f"admin_pay_reject:{pending_request}"),
                ]]
            ),
        )
        return

    expected_captcha = str(context.user_data.get("captcha_expected", "") or "").strip()
    if expected_captcha and not is_admin(update.effective_user.id) and not is_owner(update.effective_user.id):
        answer = (update.message.text or "").strip()
        if answer != expected_captcha:
            await update.message.reply_text("Wrong captcha. Please send the correct number.")
            return
        current_user = get_user_by_telegram_id(update.effective_user.id) or {}
        if current_user.get("id"):
            api_send(
                f"/users/{current_user.get('id')}",
                "PATCH",
                {"captcha_verified": 1, "captcha_passed_at": time.strftime("%Y-%m-%d %H:%M:%S")},
            )
        context.user_data["captcha_expected"] = ""
        await update.message.reply_text("Captcha verified successfully. Now type /start again.")
        return

    if context.user_data.get("awaiting_custom_deposit_amount") == "1":
        raw_amount = (update.message.text or "").strip()
        if not raw_amount.isdigit():
            suggested = str(context.user_data.get("suggested_deposit_amount", "") or "").strip()
            hint = f" Example: {suggested}" if suggested else " Example: 250"
            await update.message.reply_text(f"Valid amount bhejo.{hint}")
            return
        amount = int(raw_amount)
        minimum, maximum = deposit_limits()
        if amount < minimum or amount > maximum:
            await update.message.reply_text(f"Amount Rs {minimum} se Rs {maximum} ke beech bhejo.")
            return
        req = api_send(
            "/payment-requests",
            "POST",
            {
                "type": "wallet_topup",
                "telegram_id": str(update.effective_user.id),
                "username": str(update.effective_user.username or ""),
                "first_name": str(update.effective_user.first_name or "User"),
                "amount": amount,
                "product_id": "",
                "plan_id": "",
            },
        )
        context.user_data["awaiting_custom_deposit_amount"] = ""
        context.user_data["suggested_deposit_amount"] = ""
        await send_deposit_checkout_message(update.message, update.effective_user.id, amount, str(req.get("id", "")))
        return

    if context.user_data.get("awaiting_admin_announcement") == "1" and is_admin(update.effective_user.id):
        announce_text = (update.message.text or "").strip()
        if announce_text:
            response = api_send("/announcements/broadcast", "POST", {"message": announce_text, "media_type": "text", "media": ""})
            await update.message.reply_text(f"Broadcast sent: {response.get('sent_count')}/{response.get('total')}")
        context.user_data["awaiting_admin_announcement"] = ""
        return

    awaiting_setting = str(context.user_data.get("awaiting_admin_setting", "") or "").strip()
    if awaiting_setting and is_admin(update.effective_user.id):
        value = (update.message.text or "").strip()
        if not value:
            await update.message.reply_text("Empty value save nahi ho sakta.")
            return
        if awaiting_setting == "payment_upi_id":
            current_settings = payment_settings()
            api_send(
                "/payment-settings",
                "PUT",
                {
                    "qr": str(current_settings.get("qr", "")).strip(),
                    "upi_id": value,
                },
            )
            await update.message.reply_text("UPI ID updated from bot.")
        else:
            api_send("/settings", "PUT", {awaiting_setting: value})
            await update.message.reply_text("Customization updated from bot.")
        context.user_data["awaiting_admin_setting"] = ""
        return

    text = (update.message.text or "").strip().lower()
    if text == "shop":
        await update.message.reply_text(
            premium_card("PREMIUM SHOP", [settings().get("shop_header_text", "Choose a product"), wallet_text(update.effective_user.id)]),
            parse_mode="HTML",
            reply_markup=build_products_menu(),
        )
        return
    if text == "my orders":
        orders = sorted(list_orders(update.effective_user.id), key=lambda item: str(item.get("id", "")), reverse=True)[:10]
        if not orders:
            await update.message.reply_text("No orders yet.", reply_markup=build_products_menu())
            return
        lines = [wallet_text(update.effective_user.id)]
        rows = []
        for item in orders:
            reset_limit = int(item.get("reset_limit", 0) or 0)
            reset_used = int(item.get("reset_used", 0) or 0)
            lines.append(f"Order {item.get('id')} | {item.get('status','-')} | Reset {reset_used}/{reset_limit}")
            if reset_limit > reset_used:
                rows.append([InlineKeyboardButton(f"Reset {item.get('id')}", callback_data=f"resetask:{item.get('id')}")])
        rows.append([InlineKeyboardButton("Back to Shop", callback_data="shop_now")])
        await update.message.reply_text("\n".join(lines), reply_markup=InlineKeyboardMarkup(rows))
        return
    if text == "profile":
        user = get_user_by_telegram_id(update.effective_user.id) or {}
        await update.message.reply_text(
          premium_card(
              "MY PROFILE",
              [
                  f"👤 Name: {user.get('first_name', 'User')}",
                  f"🔖 Username: @{user.get('username')}" if user.get("username") else "🔖 Username: -",
                  f"🆔 User ID: {update.effective_user.id}",
                  role_text(update.effective_user.id),
                  f"💰 Wallet: Rs {int(user.get('balance', 0) or 0)}",
                  f"📅 Joined: {user.get('created_at', '-')}",
              ],
          ),
          parse_mode="HTML",
        )
        return
    if text == "deposit now":
        pay_settings = payment_settings()
        if str(pay_settings.get("upi_id", "")).strip() or str(pay_settings.get("qr", "")).strip():
            await update.message.reply_text(
                deposit_prompt_text(update.effective_user.id),
                parse_mode="HTML",
                reply_markup=InlineKeyboardMarkup(deposit_method_rows()),
            )
        else:
            await update.message.reply_text(
                premium_card(
                    "DEPOSIT MAINTENANCE",
                    [
                        "Deposit abhi maintenance mein hai.",
                        admin_contact_line(),
                    ],
                ),
                parse_mode="HTML",
            )
        return
    if text == "support":
        app_settings = settings()
        await update.message.reply_text("\n".join(support_lines(app_settings)) or "Support details not configured yet.")
        return
    if text == "menu":
        app_settings = settings()
        await update.message.reply_text(
            plain_main_menu_text(
                update.effective_user.id,
                app_settings.get("brand_name", "SELLER BOT"),
                app_settings.get("welcome_text", "Welcome {name}!").format(
                    name=html.escape(update.effective_user.first_name or "Friend"),
                    brand_name=app_settings.get("brand_name", "Brand"),
                ),
            ),
            parse_mode="HTML",
            reply_markup=build_main_menu(),
        )
        return
    if text == "admin panel" and is_admin(update.effective_user.id):
        await update.message.reply_text(
            "Admin Panel",
            reply_markup=InlineKeyboardMarkup(
                [
                    [InlineKeyboardButton("Users", callback_data="adm:users"), InlineKeyboardButton("Products", callback_data="adm:products")],
                    [InlineKeyboardButton("Licenses", callback_data="adm:licenses"), InlineKeyboardButton("Payments", callback_data="adm:payments")],
                    [InlineKeyboardButton("Resets", callback_data="adm:resets"), InlineKeyboardButton("Broadcast", callback_data="adm:broadcast")],
                    [InlineKeyboardButton("Customization", callback_data="adm:customization")],
                ]
            ),
        )
        return
    if text == "owner panel" and is_owner(update.effective_user.id):
        await update.message.reply_text("Owner Panel", reply_markup=build_owner_panel_markup())
        return
    if text == "owner panel":
        await update.message.reply_text("Owner access required.")
        return
    if text == "admin panel":
        access = get_admin_access(update.effective_user.id)
        record = access.get("record") or {}
        await update.message.reply_text(
            f"Admin access not active.\nStatus: {record.get('status', access.get('reason', 'inactive'))}\n"
            f"{admin_contact_line()}",
        )
        return


async def show_deposit_prompt(query, user_id: int, needed: int = 0):
    pay_settings = payment_settings()
    qr = str(pay_settings.get("qr", "")).strip()
    upi_id = str(pay_settings.get("upi_id", "")).strip()
    markup = InlineKeyboardMarkup(deposit_method_rows(needed))
    await delete_previous(query)
    if qr or upi_id:
        await query.message.reply_text(deposit_prompt_text(user_id, needed), parse_mode="HTML", reply_markup=markup)
    else:
        await query.message.reply_text(
            premium_card(
                "DEPOSIT MAINTENANCE",
                [
                    "Deposit abhi maintenance mein hai.",
                    admin_contact_line(),
                ],
            ),
            parse_mode="HTML",
            reply_markup=InlineKeyboardMarkup([[InlineKeyboardButton("Back to Menu", callback_data="back:menu")]]),
        )


async def on_button_click(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    query = update.callback_query
    if not query or not query.from_user:
        return
    await query.answer(cache_time=0)
    if is_admin(query.from_user.id) or is_owner(query.from_user.id):
        sync_admin_profile(query.from_user)
    current_user = get_user_by_telegram_id(query.from_user.id)
    if current_user and int(current_user.get("is_banned", 0)) == 1:
        await query.message.reply_text("You are banned.")
        return
    if not is_admin(query.from_user.id) and not is_owner(query.from_user.id) and not is_captcha_verified(current_user):
        await query.message.reply_text(
            premium_card(
                "CAPTCHA REQUIRED",
                ["Please type /start and complete captcha verification first."],
            ),
            parse_mode="HTML",
        )
        return
    if not user_bot_available(query.from_user.id):
        await query.message.reply_text(
            premium_card(
                "BOT IN MAINTENANCE",
                [
                    system_status().get("maintenance_message", "Bot is temporarily unavailable."),
                    admin_contact_line(),
                ],
            ),
            parse_mode="HTML",
        )
        return
    app_settings = settings()
    data = query.data or ""

    if data.startswith("adm:"):
        if not is_admin(query.from_user.id):
            access = get_admin_access(query.from_user.id)
            record = access.get("record") or {}
            await query.message.reply_text(
                f"Admin access not active.\nStatus: {record.get('status', access.get('reason', 'inactive'))}\nExpiry: {record.get('expires_at', '-')}"
            )
            return
        if data == "adm:users":
            users = list_users()[:20]
            lines = [f"Total users: {len(list_users())}"]
            lines.extend([f"- {u.get('first_name','User')} ({u.get('telegram_id','-')}) | {u.get('role','user')}" for u in users])
            await query.message.reply_text("\n".join(lines))
            return
        if data == "adm:products":
            products = list_products()
            await query.message.reply_text("\n".join([f"- {p.get('name')} ({p.get('id')})" for p in products]) or "No products")
            return
        if data == "adm:licenses":
            licenses = api_get("/licenses")
            available = len([k for k in licenses if str(k.get("status")) == "available"])
            sold = len([k for k in licenses if str(k.get("status")) == "sold"])
            await query.message.reply_text(f"Licenses total: {len(licenses)}\nAvailable: {available}\nSold: {sold}")
            return
        if data == "adm:payments":
            pending = [i for i in api_get("/payment-requests") if str(i.get("status")) == "submitted"]
            if not pending:
                await query.message.reply_text("No submitted payment requests.")
                return
            for item in pending[:15]:
                await query.message.reply_text(
                    f"Payment #{item.get('id')}\nUser: {item.get('telegram_id')}\nUsername: @{item.get('username') or '-'}\nBalance: Rs {int(float(item.get('user_balance', 0) or 0))}\nAmount: Rs {item.get('amount')}\nRef: {item.get('upi_ref','-')}",
                    reply_markup=InlineKeyboardMarkup(
                        [[InlineKeyboardButton("Approve", callback_data=f"admin_pay_approve:{item.get('id')}"), InlineKeyboardButton("Reject", callback_data=f"admin_pay_reject:{item.get('id')}")]]
                    ),
                )
            return
        if data == "adm:resets":
            pending = [i for i in api_get("/reset-requests") if str(i.get("status")) == "pending"]
            if not pending:
                await query.message.reply_text("No pending reset requests.")
                return
            for item in pending[:15]:
                await query.message.reply_text(
                    f"Reset #{item.get('id')}\nOrder: {item.get('order_id')}\nUser: {item.get('telegram_id')}",
                    reply_markup=InlineKeyboardMarkup(
                        [[InlineKeyboardButton("Approve", callback_data=f"admin_reset_approve:{item.get('id')}"), InlineKeyboardButton("Reject", callback_data=f"admin_reset_reject:{item.get('id')}")]]
                    ),
                )
            return
        if data == "adm:broadcast":
            context.user_data["awaiting_admin_announcement"] = "1"
            await query.message.reply_text("Send announcement text now.")
            return
        if data == "adm:customization":
            await query.message.reply_text(
                "Bot Customization",
                reply_markup=InlineKeyboardMarkup(
                    [
                        [InlineKeyboardButton("Set Welcome Text", callback_data="cfg:welcome_text"), InlineKeyboardButton("Set Shop Header", callback_data="cfg:shop_header_text")],
                        [InlineKeyboardButton("Set Support Text", callback_data="cfg:support_text"), InlineKeyboardButton("Set UPI ID", callback_data="cfg:payment_upi_id")],
                        [InlineKeyboardButton("Set QR From Next Image", callback_data="cfg:payment_qr")],
                    ]
                ),
            )
            return

    if data.startswith("cfg:"):
        if not is_admin(query.from_user.id):
            await query.message.reply_text("Admin only.")
            return
        setting_key = data.split(":", 1)[1]
        if setting_key == "payment_qr":
            context.user_data["awaiting_setting_media"] = "payment_qr"
            await query.message.reply_text("Now send the QR image to this bot.")
            return
        context.user_data["awaiting_admin_setting"] = setting_key
        await query.message.reply_text("Now send the new value.")
        return

    if data.startswith("owner:"):
        if not is_owner(query.from_user.id):
            await query.message.reply_text("Owner only.")
            return
        if data == "owner:admins":
            admins = list_admin_records()
            if not admins:
                await query.message.reply_text("No admin access records yet.")
                return
            for item in admins[:15]:
                label = item.get("name") or item.get("telegram_id") or "Admin"
                text = (
                    f"{label}\n"
                    f"TG: {item.get('telegram_id', '-')}\n"
                    f"Role: {item.get('panel_role', 'admin')}\n"
                    f"Status: {item.get('status', '-')}\n"
                    f"Days left: {item.get('days_left', 0)}\n"
                    f"Expiry: {item.get('expires_at', '-')}"
                )
                await query.message.reply_text(
                    text,
                    reply_markup=InlineKeyboardMarkup(
                        [
                            [
                                InlineKeyboardButton("+30", callback_data=f"owner_renew30:{item.get('id')}"),
                                InlineKeyboardButton("+90", callback_data=f"owner_renew90:{item.get('id')}"),
                            ],
                            [
                                InlineKeyboardButton("Activate", callback_data=f"owner_activate:{item.get('id')}"),
                                InlineKeyboardButton("Suspend", callback_data=f"owner_suspend:{item.get('id')}"),
                            ],
                        ]
                    ),
                )
            return
        if data == "owner:plans":
            plans = list_owner_plans()
            await query.message.reply_text(
                "\n".join([f"- {plan.get('name')} | {plan.get('days')} days | Rs {plan.get('price')}" for plan in plans]) or "No plans yet."
            )
            return
        if data == "owner:expiring":
            admins = [item for item in list_admin_records() if int(item.get("days_left", 0) or 0) <= 2]
            await query.message.reply_text(
                "\n".join(
                    [f"- {item.get('name') or item.get('telegram_id')} | {item.get('status')} | {item.get('days_left', 0)} day(s) left" for item in admins]
                )
                or "No expiring admins."
            )
            return

    if data.startswith("admin_"):
        if not is_admin(query.from_user.id):
            await query.message.reply_text("Admin access expired or inactive.")
            return
        if data.startswith("admin_pay_approve:"):
            api_send(f"/payment-requests/{data.split(':',1)[1]}/approve", "POST", {})
            await query.message.reply_text("Payment approved.")
            return
        if data.startswith("admin_pay_reject:"):
            api_send(f"/payment-requests/{data.split(':',1)[1]}/reject", "POST", {})
            await query.message.reply_text("Payment rejected.")
            return
        if data.startswith("admin_reset_approve:"):
            api_send(f"/reset-requests/{data.split(':',1)[1]}/approve", "POST", {})
            await query.message.reply_text("Reset approved.")
            return
        if data.startswith("admin_reset_reject:"):
            api_send(f"/reset-requests/{data.split(':',1)[1]}/reject", "POST", {})
            await query.message.reply_text("Reset rejected.")
            return

    if data == "panelrenew:start":
        await query.message.reply_text(
            premium_card(
                "NO RENEWAL REQUIRED",
                [
                    "Admin membership purchase removed.",
                    "Panel will keep working normally.",
                    admin_contact_line(),
                ],
            ),
            parse_mode="HTML",
        )
        return

    if data.startswith("owner_"):
        if not is_owner(query.from_user.id):
            await query.message.reply_text("Owner only.")
            return
        action, admin_id = data.split(":", 1)
        if action == "owner_renew30":
            api_send(f"/admins/{admin_id}", "PATCH", {"action": "renew", "extra_days": 30})
            await query.message.reply_text("Admin renewed for 30 days.")
            return
        if action == "owner_renew90":
            api_send(f"/admins/{admin_id}", "PATCH", {"action": "renew", "extra_days": 90})
            await query.message.reply_text("Admin renewed for 90 days.")
            return
        if action == "owner_activate":
            api_send(f"/admins/{admin_id}", "PATCH", {"status": "active"})
            await query.message.reply_text("Admin activated.")
            return
        if action == "owner_suspend":
            api_send(f"/admins/{admin_id}", "PATCH", {"status": "suspended"})
            await query.message.reply_text("Admin suspended.")
            return

    if data == "shop_now":
        await delete_previous(query)
        await query.message.reply_text(
            premium_card("PREMIUM SHOP", [app_settings.get("shop_header_text", "Choose a product"), wallet_text(query.from_user.id)]),
            parse_mode="HTML",
            reply_markup=build_products_menu(),
        )
        return

    if data == "back:menu":
        welcome_line = app_settings.get("welcome_text", "Welcome {name}!").format(
            name=html.escape(query.from_user.first_name or "Friend"),
            brand_name=app_settings.get("brand_name", "Brand"),
        )
        await delete_previous(query)
        await query.message.reply_text(
            plain_main_menu_text(query.from_user.id, app_settings.get("brand_name", "SELLER BOT"), welcome_line),
            reply_markup=build_main_menu(),
        )
        return

    if data == "history:menu":
        lines = [role_text(query.from_user.id), wallet_text(query.from_user.id), "Choose the history you want to view."]
        await delete_previous(query)
        await query.message.reply_text(
            premium_card("ALL HISTORY", lines),
            parse_mode="HTML",
            reply_markup=InlineKeyboardMarkup(
                [
                    [InlineKeyboardButton("Deposit History", callback_data="history:deposits")],
                    [InlineKeyboardButton("Selling History", callback_data="history:sales")],
                    [InlineKeyboardButton("Back to Menu", callback_data="back:menu")],
                ]
            ),
        )
        return

    if data == "history:deposits":
        payments = sorted(
            api_get(f"/payment-requests?telegram_id={urllib.parse.quote(str(query.from_user.id))}"),
            key=lambda item: str(item.get("id", "")),
            reverse=True,
        )
        lines = [role_text(query.from_user.id), wallet_text(query.from_user.id)]
        if payments:
            lines.extend(
                [
                    f"Deposit #{item.get('id')} | {item.get('status', '-')} | Rs {int(float(item.get('amount', 0) or 0))}"
                    for item in payments[:12]
                ]
            )
        else:
            lines.append("No deposit history yet.")
        await delete_previous(query)
        await query.message.reply_text(
            premium_card("DEPOSIT HISTORY", lines),
            parse_mode="HTML",
            reply_markup=InlineKeyboardMarkup([[InlineKeyboardButton("Back to History", callback_data="history:menu")], [InlineKeyboardButton("Back to Menu", callback_data="back:menu")]]),
        )
        return

    if data == "history:sales":
        orders = sorted(list_orders(query.from_user.id), key=lambda item: str(item.get("id", "")), reverse=True)
        lines = [role_text(query.from_user.id), wallet_text(query.from_user.id)]
        if orders:
            lines.extend(
                [
                    f"Sale #{item.get('id')} | {item.get('status', '-')} | Rs {int(float(item.get('amount', 0) or 0))}"
                    for item in orders[:12]
                ]
            )
        else:
            lines.append("No selling history yet.")
        await delete_previous(query)
        await query.message.reply_text(
            premium_card("SELLING HISTORY", lines),
            parse_mode="HTML",
            reply_markup=InlineKeyboardMarkup([[InlineKeyboardButton("Back to History", callback_data="history:menu")], [InlineKeyboardButton("Back to Menu", callback_data="back:menu")]]),
        )
        return

    if data == "deposit_now":
        await show_deposit_prompt(query, query.from_user.id)
        return

    if data == "deposit_method_upi":
        context.user_data["awaiting_custom_deposit_amount"] = "1"
        context.user_data["suggested_deposit_amount"] = ""
        await delete_previous(query)
        await query.message.reply_text(
            deposit_amount_prompt_text(query.from_user.id),
            parse_mode="HTML",
        )
        return

    if data.startswith("deposit_method_upi:"):
        needed = int(data.split(":", 1)[1])
        context.user_data["awaiting_custom_deposit_amount"] = "1"
        context.user_data["suggested_deposit_amount"] = str(needed)
        await delete_previous(query)
        await query.message.reply_text(
            deposit_amount_prompt_text(query.from_user.id, needed),
            parse_mode="HTML",
        )
        return

    if data == "deposit_custom":
        context.user_data["awaiting_custom_deposit_amount"] = "1"
        context.user_data["suggested_deposit_amount"] = ""
        await query.message.reply_text(
            premium_card(
                "CUSTOM DEPOSIT",
                [
                    "✍ Send the exact amount you want to deposit.",
                    "Example: 250",
                ],
            ),
            parse_mode="HTML",
        )
        return

    if data.startswith("deposit_paid:"):
        request_id = data.split(":", 1)[1]
        context.user_data["awaiting_upi_ref_for"] = request_id
        await query.message.reply_text(
            premium_card(
                "SEND UTR",
                [
                    "🧾 Payment complete? Now send your transaction ID / UTR.",
                    "Example: 123456789012",
                ],
            ),
            parse_mode="HTML",
        )
        return

    if data.startswith("deposit_cancel:"):
        request_id = data.split(":", 1)[1]
        try:
            api_send(f"/payment-requests/{request_id}/cancel", "POST", {})
        except Exception:
            pass
        context.user_data["awaiting_upi_ref_for"] = ""
        await query.message.reply_text(
            premium_card("DEPOSIT CANCELLED", ["❌ Your deposit request has been cancelled."]),
            parse_mode="HTML",
        )
        return

    if data.startswith("prod:"):
        product_id = data.split(":", 1)[1]
        product = next((item for item in list_products() if str(item["id"]) == product_id), None)
        if not product:
            await query.message.reply_text("Product not found.")
            return
        lines = [f"🎯 Product: {product['name']}", role_text(query.from_user.id), wallet_text(query.from_user.id)]
        if int(product.get("is_recommended", 0)) == 1:
            lines.append("✅ Developer Pick")
        features = [line.strip() for line in str(product.get("features", "")).split("\n") if line.strip()]
        lines.extend([f"⚡ {item}" for item in features[:8]])
        await delete_previous(query)
        await query.message.reply_text(
            premium_card("PRODUCT PREVIEW", lines),
            parse_mode="HTML",
            reply_markup=build_product_menu(product_id),
        )
        return

    if data.startswith("plans:"):
        product_id = data.split(":", 1)[1]
        await delete_previous(query)
        await query.message.reply_text(
            premium_card("SELECT YOUR PLAN", [role_text(query.from_user.id), wallet_text(query.from_user.id), "💎 Pick the duration you want to buy."]),
            parse_mode="HTML",
            reply_markup=build_plan_menu(product_id, query.from_user.id),
        )
        return

    if data.startswith("buywallet:"):
        plan_id = data.split(":", 1)[1]
        try:
            result = api_send("/orders/purchase-with-wallet", "POST", {"telegram_id": str(query.from_user.id), "plan_id": str(plan_id)})
            await delete_previous(query)
            await query.message.reply_text(
                purchase_success_text(result.get("order") or result, query.from_user.id),
                parse_mode="HTML",
                reply_markup=InlineKeyboardMarkup(
                    [
                        [InlineKeyboardButton("Back to Shop", callback_data="shop_now")],
                        [InlineKeyboardButton("Back to Menu", callback_data="back:menu")],
                    ]
                ),
            )
        except Exception:
            await query.message.reply_text("Purchase failed. Insufficient balance or out of stock.")
        return

    if data.startswith("plan:"):
        plan_id = data.split(":", 1)[1]
        plan = next((item for item in list_plans() if str(item["id"]) == plan_id), None)
        if not plan:
            await query.message.reply_text("Plan not found.")
            return
        if int(plan.get("stock", 0)) <= 0:
            await query.message.reply_text("Out of stock.")
            return
        product = next((item for item in list_products() if str(item["id"]) == str(plan.get("product_id"))), None)
        price = int(plan_price_for_user(plan, query.from_user.id))
        balance = int(get_wallet_balance(query.from_user.id))
        needed = max(0, price - balance)
        caption = premium_card(
            "BUY THIS NOW",
            [
                f"🎯 Product: {product.get('name', 'Product') if product else 'Product'}",
                f"📦 Plan: {plan.get('name', '-')}",
                role_text(query.from_user.id),
                f"💸 Price: Rs {price}",
                f"💼 Wallet: Rs {balance}",
                f"📊 Stock: {int(plan.get('stock', 0))}",
            ],
        )
        if needed > 0:
            caption = f"{caption}\n\n✅ Need Rs {needed} more. Tap Deposit Now to continue."
            buttons = [[InlineKeyboardButton("Deposit Now", callback_data="deposit_now")], [InlineKeyboardButton("Back to Shop", callback_data="shop_now")]]
        else:
            buttons = [[InlineKeyboardButton("Buy From Wallet", callback_data=f"buywallet:{plan_id}")], [InlineKeyboardButton("Back to Shop", callback_data="shop_now")]]
        await delete_previous(query)
        media_url = get_product_media_url(product or {})
        if media_url:
            try:
                await query.message.reply_video(video=media_url, caption=caption, parse_mode="HTML", reply_markup=InlineKeyboardMarkup(buttons))
            except Exception:
                try:
                    await query.message.reply_photo(photo=media_url, caption=caption, parse_mode="HTML", reply_markup=InlineKeyboardMarkup(buttons))
                except Exception:
                    await query.message.reply_text(caption, parse_mode="HTML", reply_markup=InlineKeyboardMarkup(buttons))
        else:
            await query.message.reply_text(caption, parse_mode="HTML", reply_markup=InlineKeyboardMarkup(buttons))
        return

    if data.startswith("resetask:"):
        order_id = data.split(":", 1)[1]
        await query.message.reply_text(
            "Send reset request?",
            reply_markup=InlineKeyboardMarkup(
                [
                    [InlineKeyboardButton("Confirm Reset", callback_data=f"resetconfirm:{order_id}")],
                    [InlineKeyboardButton("Cancel", callback_data="my_orders_view")],
                ]
            ),
        )
        return

    if data.startswith("resetconfirm:"):
        order_id = data.split(":", 1)[1]
        try:
            created = api_send("/reset-requests", "POST", {"order_id": order_id})
        except Exception:
            await query.message.reply_text("Reset request failed. Limit reached or already pending.")
            return
        await query.message.reply_text("Reset request sent to admin.")
        await send_admin_alert(context, f"New reset request\nID: {created.get('id')}\nOrder: {order_id}\nUser: {query.from_user.id}")
        return

    if data == "my_orders_view":
        orders = sorted(list_orders(query.from_user.id), key=lambda item: str(item.get("id", "")), reverse=True)[:10]
        if not orders:
            await delete_previous(query)
            await query.message.reply_text(
                f"No orders yet.\n{wallet_text(query.from_user.id)}",
                reply_markup=InlineKeyboardMarkup(
                    [
                        [InlineKeyboardButton("Back to Shop", callback_data="shop_now")],
                        [InlineKeyboardButton("Back to Menu", callback_data="back:menu")],
                    ]
                ),
            )
            return
        lines = [wallet_text(query.from_user.id)]
        keyboard_rows = []
        for item in orders:
            reset_limit = int(item.get("reset_limit", 0) or 0)
            reset_used = int(item.get("reset_used", 0) or 0)
            lines.append(
                f"Order {item.get('id')} | {item.get('status', '-')}\n"
                f"Key: {item.get('license_key', '-')}\n"
                f"Reset: {reset_used}/{reset_limit}"
            )
            if reset_limit > reset_used:
                keyboard_rows.append([InlineKeyboardButton(f"Reset {item.get('id')}", callback_data=f"resetask:{item.get('id')}")])
        keyboard_rows.extend(
            [
                [InlineKeyboardButton("Back to Shop", callback_data="shop_now")],
                [InlineKeyboardButton("Back to Menu", callback_data="back:menu")],
            ]
        )
        await delete_previous(query)
        await query.message.reply_text("\n\n".join(lines), reply_markup=InlineKeyboardMarkup(keyboard_rows))
        return

    if data.startswith("btn:"):
        button_id = data.split(":", 1)[1]
        custom = next((item for item in list_buttons() if str(item["id"]) == button_id), None)
        if not custom:
            await query.message.reply_text("Button not found.")
            return
        if custom.get("action_type") == "builtin":
            action = str(custom.get("builtin_action", "")).strip()
            if action == "shop_now":
                await delete_previous(query)
                await query.message.reply_text(
                    premium_card("PREMIUM SHOP", [app_settings.get("shop_header_text", "Choose a product"), wallet_text(query.from_user.id)]),
                    parse_mode="HTML",
                    reply_markup=build_products_menu(),
                )
                return
            if action == "my_orders":
                orders = sorted(list_orders(query.from_user.id), key=lambda item: str(item.get("id", "")), reverse=True)[:10]
                if not orders:
                    await delete_previous(query)
                    await query.message.reply_text(
                        f"No orders yet.\n{wallet_text(query.from_user.id)}",
                        reply_markup=InlineKeyboardMarkup(
                            [
                                [InlineKeyboardButton("Back to Shop", callback_data="shop_now")],
                                [InlineKeyboardButton("Back to Menu", callback_data="back:menu")],
                            ]
                        ),
                    )
                    return
                lines = [wallet_text(query.from_user.id)]
                keyboard_rows = []
                for item in orders:
                    reset_limit = int(item.get("reset_limit", 0) or 0)
                    reset_used = int(item.get("reset_used", 0) or 0)
                    lines.append(
                        f"Order {item.get('id')} | {item.get('status', '-')}\n"
                        f"Key: {item.get('license_key', '-')}\n"
                        f"Reset: {reset_used}/{reset_limit}"
                    )
                    if reset_limit > reset_used:
                        keyboard_rows.append([InlineKeyboardButton(f"Reset {item.get('id')}", callback_data=f"resetask:{item.get('id')}")])
                keyboard_rows.extend(
                    [
                        [InlineKeyboardButton("Back to Shop", callback_data="shop_now")],
                        [InlineKeyboardButton("Back to Menu", callback_data="back:menu")],
                    ]
                )
                await delete_previous(query)
                await query.message.reply_text("\n\n".join(lines), reply_markup=InlineKeyboardMarkup(keyboard_rows))
                return
            if action == "deposit_now":
                await show_deposit_prompt(query, query.from_user.id)
                return
            if action == "all_history":
                lines = [role_text(query.from_user.id), wallet_text(query.from_user.id), "Choose the history you want to view."]
                await query.message.reply_text(
                    premium_card("ALL HISTORY", lines),
                    parse_mode="HTML",
                    reply_markup=InlineKeyboardMarkup(
                        [
                            [InlineKeyboardButton("Deposit History", callback_data="history:deposits")],
                            [InlineKeyboardButton("Selling History", callback_data="history:sales")],
                            [InlineKeyboardButton("Back to Menu", callback_data="back:menu")],
                        ]
                    ),
                )
                return
            if action == "profile":
                user = get_user_by_telegram_id(query.from_user.id) or {}
                await delete_previous(query)
                await query.message.reply_text(
                    premium_card(
                        "MY PROFILE",
                        [
                            f"👤 Name: {user.get('first_name', 'User')}",
                            f"✨ Username: @{user.get('username')}" if user.get("username") else "✨ Username: -",
                            f"🆔 User ID: {query.from_user.id}",
                            role_text(query.from_user.id),
                            f"💰 Wallet Balance: Rs {int(user.get('balance', 0) or 0)}",
                            f"📅 Joined On: {user.get('created_at', '-')}",
                        ],
                    ),
                    parse_mode="HTML",
                    reply_markup=InlineKeyboardMarkup([[InlineKeyboardButton("Back to Menu", callback_data="back:menu")]]),
                )
                return
            if action == "refer_earn":
                summary = referral_summary(query.from_user.id)
                ref_link = str(summary.get("ref_link", "") or "").strip()
                share_text = str(summary.get("share_text", "") or app_settings.get("referral_share_text", "") or "").strip()
                share_url = ""
                if ref_link:
                    share_url = (
                        "https://t.me/share/url?url="
                        + urllib.parse.quote(ref_link, safe="")
                        + "&text="
                        + urllib.parse.quote(share_text or ref_link, safe="")
                    )
                rows = []
                if share_url:
                    rows.append([InlineKeyboardButton("Share Referral Link", url=share_url)])
                rows.append([InlineKeyboardButton("Back to Menu", callback_data="back:menu")])
                await query.message.reply_text(
                    "\n\n".join(
                        [
                            str(app_settings.get("refer_text", "") or "Refer & Earn").format(ref_link=ref_link),
                            f"Total Referrals: {int(summary.get('total_referred', 0) or 0)}",
                            f"Completed Rewards: {int(summary.get('completed_referrals', 0) or 0)}",
                            f"Pending Referrals: {int(summary.get('pending_referrals', 0) or 0)}",
                            f"Total Earned: Rs {int(float(summary.get('total_earned', 0) or 0))}",
                            f"Reward Per Referral: Rs {int(float(summary.get('reward_amount', 0) or 0))}",
                        ]
                    ),
                    reply_markup=InlineKeyboardMarkup(rows),
                )
                return
            if action == "pay_proof":
                await query.message.reply_text(app_settings.get("pay_proof_text", ""))
                return
            if action == "feedback":
                await query.message.reply_text(app_settings.get("feedback_text", ""))
                return
            if action == "how_to_use":
                await query.message.reply_text(app_settings.get("how_to_use_text", ""))
                return
            if action == "support":
                await query.message.reply_text("\n".join(support_lines(app_settings)) or "Support details not configured yet.")
                return
            if action == "id_help":
                await query.message.reply_text(app_settings.get("id_help_text", ""))
                return
        if custom.get("action_type") == "video" and custom.get("video_url"):
            await query.message.reply_video(video=custom["video_url"], caption=custom.get("text", ""))
            return
        if custom.get("action_type") == "link" and custom.get("link_url"):
            markup = InlineKeyboardMarkup([[InlineKeyboardButton("Open Link", url=custom["link_url"])]])
            await query.message.reply_text(custom.get("text", "Open link"), reply_markup=markup)
            return
        await query.message.reply_text(custom.get("text", "Custom button"))


def build_application() -> Application:
    app = Application.builder().token(bot_token()).concurrent_updates(True).build()
    app.add_handler(CommandHandler("start", start))
    app.add_handler(CommandHandler("menu", menu_command))
    app.add_handler(CommandHandler("shop", shop_command))
    app.add_handler(CommandHandler("purchase", purchase_command))
    app.add_handler(CommandHandler("orders", orders_command))
    app.add_handler(CommandHandler("profile", profile_command))
    app.add_handler(CommandHandler("deposit", deposit_command))
    app.add_handler(CommandHandler("support", support_command))
    app.add_handler(CallbackQueryHandler(on_button_click))
    app.add_handler(MessageHandler(filters.PHOTO | filters.VIDEO | filters.ANIMATION | filters.Document.ALL | filters.Sticker.ALL, on_media_message))
    app.add_handler(MessageHandler(filters.TEXT & ~filters.COMMAND, on_text))
    return app


async def run_reminder_loop(app: Application) -> None:
    last_notice_by_admin: dict[str, str] = {}
    last_global_status = {"enabled": None}

    while True:
        try:
            current_status = system_status()
            enabled = bool(current_status.get("bot_enabled", False))
            if last_global_status["enabled"] is None:
                last_global_status["enabled"] = enabled
            elif enabled and last_global_status["enabled"] is False:
                for user in list_users():
                    chat_id = str(user.get("telegram_id", "")).strip()
                    if not chat_id:
                        continue
                    try:
                        await app.bot.send_message(
                            chat_id=chat_id,
                            text="Bot is now live again.\nAll features are available now.",
                        )
                    except Exception:
                        continue
                last_global_status["enabled"] = enabled
            else:
                last_global_status["enabled"] = enabled
            today_key = time.strftime("%Y-%m-%d")
            for admin in list_admin_records():
                chat_id = str(admin.get("telegram_id", "")).strip()
                if not chat_id:
                    continue
                days_left = int(admin.get("days_left", 0) or 0)
                status = str(admin.get("status", "") or "")
                should_notify = status == "expired" or days_left <= 2
                notice_key = f"{today_key}:{status}:{days_left}"
                if should_notify and last_notice_by_admin.get(chat_id) != notice_key:
                    text = (
                        f"Panel renewal alert\n"
                        f"Status: {status or 'active'}\n"
                        f"Days left: {days_left}\n"
                        f"Expiry: {admin.get('expires_at', '-')}\n"
                        f"Contact owner to renew your panel access."
                    )
                    try:
                        await app.bot.send_message(chat_id=chat_id, text=text)
                        last_notice_by_admin[chat_id] = notice_key
                    except Exception:
                        continue
        except Exception as exc:
            LOGGER.warning("Reminder loop error: %s", exc)
        await asyncio.sleep(3600)


async def run_bot() -> None:
    acquire_single_instance_lock()
    LOGGER.info("Starting Telegram bot polling...")
    app = build_application()
    await app.initialize()
    await app.start()
    await app.bot.set_chat_menu_button(menu_button=MenuButtonCommands())
    await app.bot.set_my_commands(
        [
            BotCommand("start", "Open bot menu"),
            BotCommand("menu", "Open main menu"),
            BotCommand("shop", "Open premium shop"),
            BotCommand("purchase", "Start purchase flow"),
            BotCommand("orders", "View my orders"),
            BotCommand("profile", "View my profile"),
            BotCommand("deposit", "Add wallet balance"),
            BotCommand("support", "Open support"),
        ]
    )
    await app.updater.start_polling(drop_pending_updates=True)

    reminder_task = asyncio.create_task(run_reminder_loop(app))
    try:
        await asyncio.Event().wait()
    finally:
        reminder_task.cancel()
        await app.updater.stop()
        await app.stop()
        await app.shutdown()


if __name__ == "__main__":
    asyncio.run(run_bot())
