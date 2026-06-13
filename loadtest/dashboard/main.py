"""Entry point: serve the dashboard on http://127.0.0.1:8765 and open a browser.

Run via either:
    loadtest/.venv/Scripts/python -m dashboard.main      (cwd = loadtest/)
    loadtest/.venv/Scripts/python loadtest/dashboard/main.py
"""

from __future__ import annotations

import os
import sys
import threading
import webbrowser

HERE = os.path.dirname(os.path.abspath(__file__))   # .../loadtest/dashboard
ROOT = os.path.dirname(HERE)                          # .../loadtest
if ROOT not in sys.path:
    sys.path.insert(0, ROOT)

HOST = "127.0.0.1"
PORT = int(os.environ.get("LOADTEST_DASHBOARD_PORT", "8765"))


def _open_browser() -> None:
    try:
        webbrowser.open(f"http://{HOST}:{PORT}")
    except Exception:  # noqa: BLE001
        pass


def main() -> None:
    import uvicorn
    from dashboard.api import app, UI_DIST

    if not os.path.isdir(UI_DIST):
        print("WARNING: ui/dist not found — build the UI first:")
        print("  npm install --prefix loadtest/ui && npm run build --prefix loadtest/ui")
        print("Serving the API only.\n")

    print("=" * 60)
    print("  Dawa load-test dashboard")
    print(f"  http://{HOST}:{PORT}")
    print("=" * 60)

    # Open the browser shortly after the server starts.
    threading.Timer(1.0, _open_browser).start()
    uvicorn.run(app, host=HOST, port=PORT, log_level="info")


if __name__ == "__main__":
    main()
