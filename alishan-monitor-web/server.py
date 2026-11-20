import json
import os
import threading
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.error import HTTPError
from urllib.request import Request, urlopen

HEALTH = "https://alishanapp-server.onrender.com/healthz"
PAGE = Path(__file__).with_name("index.html").read_bytes()
WORDMARK = Path(__file__).with_name("wordmark.png").read_bytes()
HISTORY = "https://suqkfvfrfqtrviqjjaty.supabase.co/rest/v1/rpc/alishan_monitor_history"


def history():
    key = os.environ.get("SUPABASE_PUBLISHABLE_KEY")
    if not key:
        raise RuntimeError("Monitor history configuration is missing.")
    with urlopen(Request(HISTORY, headers={"apikey": key}), timeout=10) as response:
        rows = json.loads(response.read(65536))
        if not isinstance(rows, list):
            raise ValueError("Invalid monitor history.")
        return rows
lock = threading.Lock()
cached = None
last_check = float("-inf")


def probe():
    global cached, last_check
    with lock:
        if time.monotonic() - last_check < 60:
            return cached
        start = time.monotonic()
        try:
            with urlopen(HEALTH, timeout=20) as response:
                kind = "ok" if response.status == 200 and json.loads(response.read(4096)).get("status") == "ok" else "unexpected"
        except HTTPError as error:
            kind = f"http-{error.code}"
        except (OSError, ValueError, AttributeError):
            kind = "unreachable"
        last_check = time.monotonic()
        cached = {"id": int(time.time() * 1000), "kind": kind, "ms": round((last_check - start) * 1000)}
        return cached


class Dashboard(BaseHTTPRequestHandler):
    def do_GET(self):
        if self.path == "/":
            status, mime, body = 200, "text/html; charset=utf-8", PAGE
        elif self.path == "/wordmark.png":
            status, mime, body = 200, "image/png", WORDMARK
        elif self.path == "/api/history":
            mime = "application/json"
            try:
                status, body = 200, json.dumps(history()).encode()
            except (OSError, ValueError, RuntimeError):
                status, body = 503, b'{"error":"Scheduled history is temporarily unavailable."}'
        elif self.path == "/api/health":
            status, mime, body = 200, "application/json", json.dumps(probe()).encode()
        elif self.path == "/healthz":
            status, mime, body = 200, "application/json", b'{"status":"ok"}'
        else:
            status, mime, body = 404, "text/plain", b"Not found"
        self.send_response(status)
        self.send_header("Content-Type", mime)
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.send_header("X-Content-Type-Options", "nosniff")
        self.send_header("X-Frame-Options", "DENY")
        self.end_headers()
        self.wfile.write(body)


if __name__ == "__main__":
    ThreadingHTTPServer(("0.0.0.0", int(os.environ.get("PORT", "8765"))), Dashboard).serve_forever()
