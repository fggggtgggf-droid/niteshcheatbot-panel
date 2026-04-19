from __future__ import annotations

import importlib.util
import json
import os
import sys
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer


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


class HealthHandler(BaseHTTPRequestHandler):
    def do_GET(self):
        payload = {"status": "ok", "service": "telegram-bot"}
        body = json.dumps(payload).encode("utf-8")
        self.send_response(200)
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


if __name__ == "__main__":
    server = start_health_server()
    try:
        module.asyncio.run(module.run_bot())
    finally:
        server.shutdown()
        server.server_close()
