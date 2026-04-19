from __future__ import annotations

import importlib.util
import os
import sys


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


if __name__ == "__main__":
    module.asyncio.run(module.run_bot())
