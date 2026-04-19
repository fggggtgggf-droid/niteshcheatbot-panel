from __future__ import annotations

import importlib.util
import os
import sys


ROOT_DIR = os.path.dirname(os.path.abspath(__file__))
BACKEND_DIR = os.path.join(ROOT_DIR, "backend")
BACKEND_APP_PATH = os.path.join(BACKEND_DIR, "app.py")

if BACKEND_DIR not in sys.path:
    sys.path.insert(0, BACKEND_DIR)

spec = importlib.util.spec_from_file_location("panel_backend_app", BACKEND_APP_PATH)
if spec is None or spec.loader is None:
    raise RuntimeError("Unable to load backend app for Railway startup.")

module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)
app = module.app


if __name__ == "__main__":
    port = int(os.environ.get("PORT", "5000"))
    app.run(host="0.0.0.0", port=port, debug=False)
