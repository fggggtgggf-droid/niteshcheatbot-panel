from __future__ import annotations

import asyncio
import importlib.util
import json
import os
import sys
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

from telegram import BotCommand
from telegram import Update as TelegramUpdate


ROOT_DIR = os.path.dirname(os.path.abspath(__file__))
BOT_DIR = os.path.join(ROOT_DIR, "telegram bot")
BOT_PATH = os.path.join(BOT_DIR, "bot.py")

if BOT_DIR not in sys.path:
    sys.path.insert(0, BOT_DIR)

spec = importlib.util.spec_from_file_location("panel_bot_app", BOT_PATH)
if spec is None or spec.loader is None:
    raise RuntimeError("Unable to load Telegram bot runner.")

module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)

BOT_APP = None
BOT_LOOP = None
WEBHOOK_PATH = None
REMOTE_WEBHOOK_MODE = bool(os.environ.get("RAILWAY_PUBLIC_DOMAIN") or os.environ.get("RENDER_EXTERNAL_URL"))


class HealthHandler(BaseHTTPRequestHandler):
    def do_GET(self):
        payload = {"status": "ok", "service": "telegram-bot"}
        body = json.dumps(payload).encode("utf-8")
        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_POST(self):
        global BOT_APP, BOT_LOOP, WEBHOOK_PATH
        if not REMOTE_WEBHOOK_MODE or not WEBHOOK_PATH or self.path != WEBHOOK_PATH:
            self.send_response(404)
            self.end_headers()
            return
        if BOT_APP is None or BOT_LOOP is None:
            self.send_response(503)
            self.end_headers()
            return
        try:
            content_length = int(self.headers.get("Content-Length", "0") or 0)
            payload = self.rfile.read(content_length)
            data = json.loads(payload.decode("utf-8") or "{}")
            update = TelegramUpdate.de_json(data, BOT_APP.bot)
            future = asyncio.run_coroutine_threadsafe(BOT_APP.process_update(update), BOT_LOOP)
            future.result(timeout=20)
            self.send_response(200)
            self.end_headers()
            self.wfile.write(b"ok")
        except Exception as exc:
            body = json.dumps({"status": "error", "message": str(exc)}).encode("utf-8")
            self.send_response(500)
            self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)

    def log_message(self, format, *args):
        return


def start_health_server() -> ThreadingHTTPServer:
    port = int(os.environ.get("PORT", "10000"))
    server = ThreadingHTTPServer(("0.0.0.0", port), HealthHandler)
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    print(f"Health server listening on port {port}", flush=True)
    return server


async def run_webhook_bot() -> None:
    global BOT_APP, BOT_LOOP, WEBHOOK_PATH
    BOT_LOOP = asyncio.get_running_loop()
    BOT_APP = module.build_application()
    await BOT_APP.initialize()
    await BOT_APP.start()

    public_domain = (os.environ.get("RAILWAY_PUBLIC_DOMAIN") or os.environ.get("RENDER_EXTERNAL_URL") or "").strip()
    if not public_domain:
        raise RuntimeError("Remote webhook mode requires a public domain.")
    if not public_domain.startswith("http://") and not public_domain.startswith("https://"):
        public_domain = f"https://{public_domain}"

    token = module.bot_token()
    WEBHOOK_PATH = f"/telegram-webhook/{token}"
    webhook_url = f"{public_domain.rstrip('/')}{WEBHOOK_PATH}"

    print(f"Configuring Telegram webhook: {webhook_url}", flush=True)
    await BOT_APP.bot.delete_webhook(drop_pending_updates=True)
    await BOT_APP.bot.set_webhook(url=webhook_url, drop_pending_updates=True)
    await BOT_APP.bot.set_my_commands(
        [
            BotCommand("start", "Open bot menu"),
            BotCommand("shop", "Open premium shop"),
            BotCommand("orders", "View my orders"),
            BotCommand("profile", "View my profile"),
            BotCommand("deposit", "Add wallet balance"),
            BotCommand("support", "Open support"),
        ]
    )

    reminder_task = asyncio.create_task(module.run_reminder_loop(BOT_APP))
    try:
        await asyncio.Event().wait()
    finally:
        reminder_task.cancel()
        try:
            await BOT_APP.bot.delete_webhook()
        except Exception:
            pass
        await BOT_APP.stop()
        await BOT_APP.shutdown()


if __name__ == "__main__":
    server = start_health_server()
    try:
        if REMOTE_WEBHOOK_MODE:
            asyncio.run(run_webhook_bot())
        else:
            module.asyncio.run(module.run_bot())
    finally:
        server.shutdown()
        server.server_close()
