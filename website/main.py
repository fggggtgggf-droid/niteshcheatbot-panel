from __future__ import annotations

import importlib.util
import os
import sys
from pathlib import Path

from flask import send_from_directory


ROOT_DIR = Path(__file__).resolve().parent
API_DIR = ROOT_DIR / "api"
API_PATH = API_DIR / "index.py"
DIST_DIR = ROOT_DIR / "dist"

if str(API_DIR) not in sys.path:
    sys.path.insert(0, str(API_DIR))

spec = importlib.util.spec_from_file_location("website_api_index", API_PATH)
if spec is None or spec.loader is None:
    raise RuntimeError("Unable to load website API app.")

module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)
app = module.app


@app.get("/")
def serve_root():
    return send_from_directory(DIST_DIR, "index.html")


@app.get("/<path:path>")
def serve_frontend(path: str):
    target = DIST_DIR / path
    if target.exists() and target.is_file():
        return send_from_directory(DIST_DIR, path)
    return send_from_directory(DIST_DIR, "index.html")


if __name__ == "__main__":
    port = int(os.environ.get("PORT", "5000"))
    app.run(host="0.0.0.0", port=port, debug=False)
