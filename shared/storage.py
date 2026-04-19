from __future__ import annotations

import os
import sqlite3
from contextlib import contextmanager
from pathlib import Path
from typing import Any, Iterator


BASE_DIR = Path(__file__).resolve().parent.parent
DATA_DIR = BASE_DIR / "data"
DB_PATH = DATA_DIR / "app.db"


def init_db() -> None:
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    with sqlite3.connect(DB_PATH) as connection:
        connection.execute(
            """
            CREATE TABLE IF NOT EXISTS users (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                telegram_id INTEGER UNIQUE NOT NULL,
                first_name TEXT NOT NULL,
                username TEXT,
                language_code TEXT,
                is_banned INTEGER NOT NULL DEFAULT 0,
                notes TEXT DEFAULT '',
                role TEXT NOT NULL DEFAULT 'user',
                balance REAL NOT NULL DEFAULT 0,
                created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
            )
            """
        )
        connection.execute(
            """
            CREATE TABLE IF NOT EXISTS settings (
                key TEXT PRIMARY KEY,
                value TEXT NOT NULL
            )
            """
        )
        connection.execute(
            """
            CREATE TABLE IF NOT EXISTS categories (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL,
                description TEXT DEFAULT '',
                sort_order INTEGER NOT NULL DEFAULT 0,
                is_active INTEGER NOT NULL DEFAULT 1
            )
            """
        )
        connection.execute(
            """
            CREATE TABLE IF NOT EXISTS products (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                category_id INTEGER NOT NULL,
                name TEXT NOT NULL,
                description TEXT DEFAULT '',
                video_url TEXT DEFAULT '',
                price_chart TEXT DEFAULT '',
                hwid_reset_limit INTEGER NOT NULL DEFAULT 0,
                maintenance_mode INTEGER NOT NULL DEFAULT 0,
                is_recommended INTEGER NOT NULL DEFAULT 0,
                features TEXT DEFAULT '',
                media TEXT DEFAULT '',
                sort_order INTEGER NOT NULL DEFAULT 0,
                is_active INTEGER NOT NULL DEFAULT 1,
                FOREIGN KEY (category_id) REFERENCES categories (id)
            )
            """
        )
        connection.execute(
            """
            CREATE TABLE IF NOT EXISTS plans (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                product_id INTEGER NOT NULL,
                name TEXT NOT NULL,
                price REAL NOT NULL DEFAULT 0,
                duration_days INTEGER NOT NULL DEFAULT 1,
                stock INTEGER NOT NULL DEFAULT 0,
                reseller_price REAL NOT NULL DEFAULT 0,
                hwid_reset_limit INTEGER NOT NULL DEFAULT 0,
                sort_order INTEGER NOT NULL DEFAULT 0,
                is_active INTEGER NOT NULL DEFAULT 1,
                FOREIGN KEY (product_id) REFERENCES products (id)
            )
            """
        )
        connection.execute(
            """
            CREATE TABLE IF NOT EXISTS product_actions (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                product_id INTEGER NOT NULL,
                label TEXT NOT NULL,
                url TEXT NOT NULL,
                sort_order INTEGER NOT NULL DEFAULT 0,
                is_active INTEGER NOT NULL DEFAULT 1,
                FOREIGN KEY (product_id) REFERENCES products (id)
            )
            """
        )
        connection.execute(
            """
            CREATE TABLE IF NOT EXISTS license_keys (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                product_id INTEGER NOT NULL,
                plan_id INTEGER NOT NULL,
                license_key TEXT NOT NULL,
                status TEXT NOT NULL DEFAULT 'available',
                hwid_reset_limit INTEGER NOT NULL DEFAULT 0,
                reseller_price REAL NOT NULL DEFAULT 0,
                created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (product_id) REFERENCES products (id),
                FOREIGN KEY (plan_id) REFERENCES plans (id)
            )
            """
        )
        connection.execute(
            """
            CREATE TABLE IF NOT EXISTS buttons (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                label TEXT NOT NULL,
                action_type TEXT NOT NULL,
                text TEXT DEFAULT '',
                video_url TEXT DEFAULT '',
                link_url TEXT DEFAULT '',
                sort_order INTEGER NOT NULL DEFAULT 0,
                is_active INTEGER NOT NULL DEFAULT 1
            )
            """
        )
        connection.execute(
            """
            CREATE TABLE IF NOT EXISTS admins (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                telegram_id INTEGER UNIQUE NOT NULL,
                added_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
            )
            """
        )

        ensure_columns(connection)
        seed_defaults(connection)
        connection.commit()


def ensure_columns(connection: sqlite3.Connection) -> None:
    columns = {
        "users": {
            "role": "TEXT NOT NULL DEFAULT 'user'",
            "balance": "REAL NOT NULL DEFAULT 0",
        },
        "products": {
            "hwid_reset_limit": "INTEGER NOT NULL DEFAULT 0",
            "maintenance_mode": "INTEGER NOT NULL DEFAULT 0",
            "is_recommended": "INTEGER NOT NULL DEFAULT 0",
            "features": "TEXT DEFAULT ''",
            "media": "TEXT DEFAULT ''",
        },
        "plans": {
            "stock": "INTEGER NOT NULL DEFAULT 0",
            "reseller_price": "REAL NOT NULL DEFAULT 0",
            "hwid_reset_limit": "INTEGER NOT NULL DEFAULT 0",
        },
    }
    for table, table_columns in columns.items():
        existing = {
            row[1] for row in connection.execute(f"PRAGMA table_info({table})").fetchall()
        }
        for column, definition in table_columns.items():
            if column not in existing:
                connection.execute(
                    f"ALTER TABLE {table} ADD COLUMN {column} {definition}"
                )


def seed_defaults(connection: sqlite3.Connection) -> None:
    settings_count = connection.execute("SELECT COUNT(*) FROM settings").fetchone()[0]
    if settings_count == 0:
        defaults = {
            "welcome_text": """GOLDEN SELLER BOT

Yo {name}, Welcome Back!!

WHY CHOOSE US

Genuine Digital Goods
Instant Auto Delivery
Secure Payments
Unbeatable Prices
Real 24/7 Support

--------------------
Let's get you a product!""",
            "shop_header_text": "Choose a product",
            "profile_text": """YOUR PROFILE
Name: {name}
Username: {username}
User ID: {telegram_id}
Member Since: {created_at}
Account Type: Regular
Total Orders: 0""",
            "orders_text": """MY ORDERS (last 10)
No orders yet.""",
            "refer_text": """Refer & Earn

Invite friends using your link.
Your Referral Link:
{ref_link}

Your Stats:
Total Referred: 0
Total Bonuses Earned: 0
Used: 0""",
            "support_text": "Support ke liye admin se contact karein.",
            "how_to_use_text": """1. Shop open karo
2. Product choose karo
3. Payment complete karo
4. Delivery lo""",
            "feedback_text": "Feedback ke liye apna message admin ko bhej sakte ho.",
            "pay_proof_text": "Payment proof bhejne ke liye screenshot support ko forward karein.",
            "id_help_text": "Apna product/account ID bhejo, team usko verify kar degi.",
            "brand_name": "Golden Seller",
            "brand_logo_url": "",
            "telegram_support_link": "https://t.me/your_support",
            "whatsapp_support_link": "https://wa.me/0000000000",
        }
        connection.executemany(
            "INSERT INTO settings (key, value) VALUES (?, ?)",
            list(defaults.items()),
        )

    category_count = connection.execute("SELECT COUNT(*) FROM categories").fetchone()[0]
    if category_count == 0:
        categories = [
            "Starter Bundle",
            "Creator Pack",
            "Premium Tools",
            "E-Sign Bundle",
            "iOS Suite",
            "Prime Pro",
            "Team Orange",
            "Team Blue",
            "Silent Tools (Brutal)",
            "Silent Tools (Safe)",
        ]
        for idx, name in enumerate(categories, start=1):
            connection.execute(
                "INSERT INTO categories (name, description, sort_order) VALUES (?, ?, ?)",
                (name, "Digital toolkit bundle", idx),
            )
            category_id = connection.execute("SELECT last_insert_rowid()").fetchone()[0]
            connection.execute(
                "INSERT INTO products (category_id, name, description, price_chart, sort_order) VALUES (?, ?, ?, ?, ?)",
                (
                    category_id,
                    name,
                    "Includes curated assets, guides, and support.",
                    "Price chart available after plan selection.",
                    idx,
                ),
            )
            product_id = connection.execute("SELECT last_insert_rowid()").fetchone()[0]
            connection.executemany(
                "INSERT INTO plans (product_id, name, price, duration_days, sort_order, stock) VALUES (?, ?, ?, ?, ?, ?)",
                [
                    (product_id, "1 Day", 79, 1, 1, 10),
                    (product_id, "7 Days", 345, 7, 2, 5),
                ],
            )


@contextmanager




def get_connection() -> Iterator[sqlite3.Connection]:
    init_db()
    connection = sqlite3.connect(DB_PATH)
    connection.row_factory = sqlite3.Row
    try:
        yield connection
        connection.commit()
    finally:
        connection.close()


def row_to_dict(row: sqlite3.Row | None) -> dict[str, Any] | None:
    if row is None:
        return None
    return dict(row)


def rows_to_dicts(rows: list[sqlite3.Row]) -> list[dict[str, Any]]:
    return [dict(row) for row in rows]


def upsert_user(
    telegram_id: int,
    first_name: str,
    username: str | None,
    language_code: str | None,
) -> None:
    with get_connection() as connection:
        connection.execute(
            """
            INSERT INTO users (telegram_id, first_name, username, language_code, updated_at)
            VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)
            ON CONFLICT(telegram_id) DO UPDATE SET
                first_name = excluded.first_name,
                username = excluded.username,
                language_code = excluded.language_code,
                updated_at = CURRENT_TIMESTAMP
            """,
            (telegram_id, first_name, username, language_code),
        )


def get_user_by_telegram_id(telegram_id: int):
    with get_connection() as connection:
        return connection.execute(
            "SELECT * FROM users WHERE telegram_id = ?",
            (telegram_id,),
        ).fetchone()


def list_users(search: str | None = None, status: str | None = None) -> list[dict[str, Any]]:
    query = "SELECT * FROM users"
    conditions: list[str] = []
    params: list[Any] = []
    if search:
        conditions.append("(first_name LIKE ? OR username LIKE ? OR telegram_id LIKE ?)")
        search_value = f"%{search}%"
        params.extend([search_value, search_value, search_value])
    if status == "active":
        conditions.append("is_banned = 0")
    elif status == "banned":
        conditions.append("is_banned = 1")
    if conditions:
        query += " WHERE " + " AND ".join(conditions)
    query += " ORDER BY updated_at DESC"
    with get_connection() as connection:
        rows = connection.execute(query, params).fetchall()
        return rows_to_dicts(rows)


def update_user(
    user_id: int,
    first_name: str,
    username: str | None,
    notes: str,
    role: str,
    balance: float,
) -> None:
    with get_connection() as connection:
        connection.execute(
            """
            UPDATE users
            SET first_name = ?, username = ?, notes = ?, role = ?, balance = ?, updated_at = CURRENT_TIMESTAMP
            WHERE id = ?
            """,
            (first_name, username, notes, role, balance, user_id),
        )


def toggle_user_ban(user_id: int) -> None:
    with get_connection() as connection:
        connection.execute(
            """
            UPDATE users
            SET is_banned = CASE WHEN is_banned = 1 THEN 0 ELSE 1 END,
                updated_at = CURRENT_TIMESTAMP
            WHERE id = ?
            """,
            (user_id,),
        )


def get_settings() -> dict[str, str]:
    with get_connection() as connection:
        rows = connection.execute("SELECT key, value FROM settings").fetchall()
        return {row["key"]: row["value"] for row in rows}


def set_settings(new_settings: dict[str, str]) -> None:
    with get_connection() as connection:
        connection.executemany(
            """
            INSERT INTO settings (key, value)
            VALUES (?, ?)
            ON CONFLICT(key) DO UPDATE SET value = excluded.value
            """,
            list(new_settings.items()),
        )


def list_categories(active_only: bool = False) -> list[dict[str, Any]]:
    query = "SELECT * FROM categories"
    if active_only:
        query += " WHERE is_active = 1"
    query += " ORDER BY sort_order ASC, id ASC"
    with get_connection() as connection:
        return rows_to_dicts(connection.execute(query).fetchall())


def create_category(name: str, description: str, sort_order: int, is_active: int) -> int:
    with get_connection() as connection:
        connection.execute(
            """
            INSERT INTO categories (name, description, sort_order, is_active)
            VALUES (?, ?, ?, ?)
            """,
            (name, description, sort_order, is_active),
        )
        return int(connection.execute("SELECT last_insert_rowid()").fetchone()[0])


def update_category(category_id: int, payload: dict[str, Any]) -> None:
    fields = ["name", "description", "sort_order", "is_active"]
    updates = {key: payload[key] for key in fields if key in payload}
    if not updates:
        return
    set_clause = ", ".join([f"{key} = ?" for key in updates])
    params = list(updates.values()) + [category_id]
    with get_connection() as connection:
        connection.execute(
            f"UPDATE categories SET {set_clause} WHERE id = ?",
            params,
        )


def delete_category(category_id: int) -> None:
    with get_connection() as connection:
        connection.execute("DELETE FROM categories WHERE id = ?", (category_id,))


def list_products(category_id: int | None = None, active_only: bool = False) -> list[dict[str, Any]]:
    query = "SELECT * FROM products"
    params: list[Any] = []
    conditions: list[str] = []
    if category_id is not None:
        conditions.append("category_id = ?")
        params.append(category_id)
    if active_only:
        conditions.append("is_active = 1")
    if conditions:
        query += " WHERE " + " AND ".join(conditions)
    query += " ORDER BY sort_order ASC, id ASC"
    with get_connection() as connection:
        return rows_to_dicts(connection.execute(query, params).fetchall())


def create_product(
    category_id: int,
    name: str,
    description: str,
    video_url: str,
    price_chart: str,
    hwid_reset_limit: int,
    maintenance_mode: int,
    is_recommended: int,
    features: str,
    media: str,
    sort_order: int,
    is_active: int,
) -> int:
    with get_connection() as connection:
        connection.execute(
            """
            INSERT INTO products (
                category_id, name, description, video_url, price_chart,
                hwid_reset_limit, maintenance_mode, is_recommended, features, media,
                sort_order, is_active
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                category_id,
                name,
                description,
                video_url,
                price_chart,
                hwid_reset_limit,
                maintenance_mode,
                is_recommended,
                features,
                media,
                sort_order,
                is_active,
            ),
        )
        return int(connection.execute("SELECT last_insert_rowid()").fetchone()[0])


def update_product(product_id: int, payload: dict[str, Any]) -> None:
    fields = [
        "category_id",
        "name",
        "description",
        "video_url",
        "price_chart",
        "hwid_reset_limit",
        "maintenance_mode",
        "is_recommended",
        "features",
        "media",
        "sort_order",
        "is_active",
    ]
    updates = {key: payload[key] for key in fields if key in payload}
    if not updates:
        return
    set_clause = ", ".join([f"{key} = ?" for key in updates])
    params = list(updates.values()) + [product_id]
    with get_connection() as connection:
        connection.execute(
            f"UPDATE products SET {set_clause} WHERE id = ?",
            params,
        )


def delete_product(product_id: int) -> None:
    with get_connection() as connection:
        connection.execute("DELETE FROM products WHERE id = ?", (product_id,))


def list_plans(product_id: int | None = None, active_only: bool = False) -> list[dict[str, Any]]:
    query = "SELECT * FROM plans"
    params: list[Any] = []
    conditions: list[str] = []
    if product_id is not None:
        conditions.append("product_id = ?")
        params.append(product_id)
    if active_only:
        conditions.append("is_active = 1")
    if conditions:
        query += " WHERE " + " AND ".join(conditions)
    query += " ORDER BY sort_order ASC, id ASC"
    with get_connection() as connection:
        return rows_to_dicts(connection.execute(query, params).fetchall())


def create_plan(
    product_id: int,
    name: str,
    price: float,
    duration_days: int,
    stock: int,
    reseller_price: float,
    hwid_reset_limit: int,
    sort_order: int,
    is_active: int,
) -> int:
    with get_connection() as connection:
        connection.execute(
            """
            INSERT INTO plans (
                product_id, name, price, duration_days, stock, reseller_price, hwid_reset_limit,
                sort_order, is_active
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                product_id,
                name,
                price,
                duration_days,
                stock,
                reseller_price,
                hwid_reset_limit,
                sort_order,
                is_active,
            ),
        )
        return int(connection.execute("SELECT last_insert_rowid()").fetchone()[0])


def update_plan(plan_id: int, payload: dict[str, Any]) -> None:
    fields = [
        "product_id",
        "name",
        "price",
        "duration_days",
        "stock",
        "reseller_price",
        "hwid_reset_limit",
        "sort_order",
        "is_active",
    ]
    updates = {key: payload[key] for key in fields if key in payload}
    if not updates:
        return
    set_clause = ", ".join([f"{key} = ?" for key in updates])
    params = list(updates.values()) + [plan_id]
    with get_connection() as connection:
        connection.execute(
            f"UPDATE plans SET {set_clause} WHERE id = ?",
            params,
        )


def delete_plan(plan_id: int) -> None:
    with get_connection() as connection:
        connection.execute("DELETE FROM plans WHERE id = ?", (plan_id,))


def list_product_actions(product_id: int | None = None) -> list[dict[str, Any]]:
    query = "SELECT * FROM product_actions"
    params: list[Any] = []
    if product_id is not None:
        query += " WHERE product_id = ?"
        params.append(product_id)
    query += " ORDER BY sort_order ASC, id ASC"
    with get_connection() as connection:
        return rows_to_dicts(connection.execute(query, params).fetchall())


def create_product_action(
    product_id: int,
    label: str,
    url: str,
    sort_order: int,
    is_active: int,
) -> int:
    with get_connection() as connection:
        connection.execute(
            """
            INSERT INTO product_actions (product_id, label, url, sort_order, is_active)
            VALUES (?, ?, ?, ?, ?)
            """,
            (product_id, label, url, sort_order, is_active),
        )
        return int(connection.execute("SELECT last_insert_rowid()").fetchone()[0])


def update_product_action(action_id: int, payload: dict[str, Any]) -> None:
    fields = ["product_id", "label", "url", "sort_order", "is_active"]
    updates = {key: payload[key] for key in fields if key in payload}
    if not updates:
        return
    set_clause = ", ".join([f"{key} = ?" for key in updates])
    params = list(updates.values()) + [action_id]
    with get_connection() as connection:
        connection.execute(
            f"UPDATE product_actions SET {set_clause} WHERE id = ?",
            params,
        )


def delete_product_action(action_id: int) -> None:
    with get_connection() as connection:
        connection.execute("DELETE FROM product_actions WHERE id = ?", (action_id,))


def generate_license_keys(
    product_id: int,
    plan_id: int,
    quantity: int,
    hwid_reset_limit: int,
    reseller_price: float,
) -> list[str]:
    keys: list[str] = []
    with get_connection() as connection:
        for _ in range(quantity):
            key = f"KEY-{os.urandom(6).hex().upper()}"
            connection.execute(
                """
                INSERT INTO license_keys (product_id, plan_id, license_key, hwid_reset_limit, reseller_price)
                VALUES (?, ?, ?, ?, ?)
                """,
                (product_id, plan_id, key, hwid_reset_limit, reseller_price),
            )
            keys.append(key)
    return keys


def list_license_keys(product_id: int | None = None, plan_id: int | None = None) -> list[dict[str, Any]]:
    query = "SELECT * FROM license_keys"
    params: list[Any] = []
    conditions: list[str] = []
    if product_id is not None:
        conditions.append("product_id = ?")
        params.append(product_id)
    if plan_id is not None:
        conditions.append("plan_id = ?")
        params.append(plan_id)
    if conditions:
        query += " WHERE " + " AND ".join(conditions)
    query += " ORDER BY id DESC"
    with get_connection() as connection:
        return rows_to_dicts(connection.execute(query, params).fetchall())


def list_buttons(active_only: bool = False) -> list[dict[str, Any]]:
    query = "SELECT * FROM buttons"
    if active_only:
        query += " WHERE is_active = 1"
    query += " ORDER BY sort_order ASC, id ASC"
    with get_connection() as connection:
        return rows_to_dicts(connection.execute(query).fetchall())


def create_button(
    label: str,
    action_type: str,
    text: str,
    video_url: str,
    link_url: str,
    sort_order: int,
    is_active: int,
) -> int:
    with get_connection() as connection:
        connection.execute(
            """
            INSERT INTO buttons (label, action_type, text, video_url, link_url, sort_order, is_active)
            VALUES (?, ?, ?, ?, ?, ?, ?)
            """,
            (label, action_type, text, video_url, link_url, sort_order, is_active),
        )
        return int(connection.execute("SELECT last_insert_rowid()").fetchone()[0])


def update_button(button_id: int, payload: dict[str, Any]) -> None:
    fields = [
        "label",
        "action_type",
        "text",
        "video_url",
        "link_url",
        "sort_order",
        "is_active",
    ]
    updates = {key: payload[key] for key in fields if key in payload}
    if not updates:
        return
    set_clause = ", ".join([f"{key} = ?" for key in updates])
    params = list(updates.values()) + [button_id]
    with get_connection() as connection:
        connection.execute(
            f"UPDATE buttons SET {set_clause} WHERE id = ?",
            params,
        )


def delete_button(button_id: int) -> None:
    with get_connection() as connection:
        connection.execute("DELETE FROM buttons WHERE id = ?", (button_id,))


def list_admins() -> list[dict[str, Any]]:
    with get_connection() as connection:
        return rows_to_dicts(
            connection.execute("SELECT * FROM admins ORDER BY id ASC").fetchall()
        )


def add_admin(telegram_id: int) -> int:
    with get_connection() as connection:
        connection.execute(
            "INSERT OR IGNORE INTO admins (telegram_id) VALUES (?)",
            (telegram_id,),
        )
        return int(connection.execute("SELECT last_insert_rowid()").fetchone()[0])


def remove_admin(admin_id: int) -> None:
    with get_connection() as connection:
        connection.execute("DELETE FROM admins WHERE id = ?", (admin_id,))


def is_admin(telegram_id: int) -> bool:
    with get_connection() as connection:
        row = connection.execute(
            "SELECT 1 FROM admins WHERE telegram_id = ?",
            (telegram_id,),
        ).fetchone()
        return row is not None
