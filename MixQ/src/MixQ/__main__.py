import threading
import webview  # Briefcase provides this in web mode
import time

# Import your Flask app from app.py
from MixQ.app import app  # ← This assumes your Flask 'app' object is defined in app.py

def start_flask():
    # Run Flask on localhost only (webview connects locally)
    app.run(
        host='0.0.0.0',
        port=8085,                # You chose 8085 - good
        debug=False,              # No debug in bundled app
        use_reloader=False        # Avoid reload issues in thread
    )

if __name__ == "__main__":
    # Start Flask in background thread
    flask_thread = threading.Thread(target=start_flask, daemon=True)
    flask_thread.start()

    # Give Flask a moment to start (optional but helps reliability)
    time.sleep(1.5)

    # Open embedded web view pointing to Flask
    webview.create_window(
        title="MixQ",
        url="http://127.0.0.1:8085",
        width=1200,
        height=800,
        resizable=True,
        fullscreen=False
    )
    webview.start()

