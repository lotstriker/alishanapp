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


def backup_health():
    token = os.environ.get("MONITOR_BACKUP_TOKEN")
    if not token:
        return None
    request = Request(HEALTH.rsplit("/", 1)[0] + "/internal/monitor/backup",
                      headers={"Authorization": "Bearer " + token})
    with urlopen(request, timeout=10) as response:
        value = json.loads(response.read(4096))
    if not isinstance(value.get("enabled"), bool) or not isinstance(value.get("checkedAt"), str):
        raise ValueError("Invalid backup signal")
    return {key: value.get(key) for key in ("enabled", "frequencyHours", "lastBackupAt", "nextDueAt", "checkedAt")}


def operations_health():
    token = os.environ.get("MONITOR_BACKUP_TOKEN")
    if not token:
        return None
    request = Request(HEALTH.rsplit("/", 1)[0] + "/internal/monitor/operations",
                      headers={"Authorization": "Bearer " + token})
    with urlopen(request, timeout=10) as response:
        value = json.loads(response.read(32768))
    if not isinstance(value.get("routes"), list) or not isinstance(value.get("pages"), list):
        raise ValueError("Invalid operations signal")
    return value


class Collector:
    def __init__(self, interval=1200):
        self.interval = interval
        self.lock = threading.Lock()
        self.run_lock = threading.Lock()
        self.app = None
        self.database = None
        self.rows = []
        self.backup = None
        self.backup_error = False
        self.operations = None
        self.operations_error = False
        self.failures = 0
        self.events = []
        self.previous_state = None
        self.last_start = float("-inf")

    def collect(self):
        with self.run_lock:
            if time.monotonic() - self.last_start < 60:
                return
            self.last_start = time.monotonic()
            started = time.monotonic()
            try:
                with urlopen(HEALTH, timeout=20) as response:
                    healthy = response.status == 200 and json.loads(response.read(4096)).get("status") == "ok"
                    kind = "ok" if healthy else "unexpected"
            except HTTPError as error:
                kind = f"http-{error.code}"
            except TimeoutError:
                kind = "timeout"
            except (OSError, ValueError, AttributeError):
                kind = "unreachable"
            app = {"id": int(time.time() * 1000), "kind": kind, "ms": round((time.monotonic() - started) * 1000)}
            rows = None
            try:
                rows = history()
                database = {"state": "reachable", "at": int(time.time() * 1000)}
            except RuntimeError:
                database = {"state": "unavailable", "at": int(time.time() * 1000)}
            except (OSError, ValueError):
                database = {"state": "unknown", "at": int(time.time() * 1000)}
            backup, backup_error = None, False
            try:
                backup = backup_health()
            except (OSError, ValueError, AttributeError):
                backup_error = True
            operations, operations_error = None, False
            try:
                operations = operations_health()
            except (OSError, ValueError, AttributeError):
                operations_error = True
            with self.lock:
                if operations is not None:
                    self.operations = operations
                self.operations_error = operations_error
                if backup is not None:
                    self.backup = backup
                self.backup_error = backup_error
                self.app, self.database = app, database
                if rows is not None:
                    self.rows = rows
                self.failures = 0 if kind == "ok" else self.failures + 1
                state = self.overview()["appState"]
                if state == "unavailable" or (state == "reachable" and self.previous_state in ("verifying", "unavailable")):
                    if state != self.previous_state:
                        self.events = [{"at": app["id"], "state": state}] + self.events[:19]
                self.previous_state = state

    def overview(self, now=None):
        now = time.time() * 1000 if now is None else now
        stale = not self.app or now - self.app["id"] > (self.interval + 480) * 1000
        corroborated = False
        if self.database and self.database["state"] == "reachable" and self.rows and self.app:
            from datetime import datetime
            try:
                latest = self.rows[0]
                timestamp = datetime.fromisoformat(latest["at"].replace("Z", "+00:00")).timestamp() * 1000
                corroborated = latest["kind"] != "ok" and 0 <= now - timestamp <= (self.interval + 480) * 1000
            except (ValueError, TypeError, KeyError, AttributeError):
                pass
        state = "unknown" if stale else "reachable" if not self.failures else (
            "unavailable" if self.failures >= 2 and corroborated else "verifying")
        return {"appState": state, "app": self.app, "database": self.database,
                "stale": stale, "consecutiveFailures": self.failures, "events": self.events,
                "scheduledCount": len(self.rows), "backup": self.backup, "backupError": self.backup_error, "operations": self.operations, "operationsError": self.operations_error, "egress": {"state": "unavailable"}}

    def loop(self, stop):
        while not stop.is_set():
            self.collect()
            stop.wait(self.interval)


collector = Collector()


class Dashboard(BaseHTTPRequestHandler):
    def do_GET(self):
        if self.path == "/":
            status, mime, body = 200, "text/html; charset=utf-8", PAGE
        elif self.path == "/wordmark.png":
            status, mime, body = 200, "image/png", WORDMARK
        elif self.path == "/api/history":
            mime = "application/json"
            try:
                with collector.lock:
                    if not collector.database or collector.database["state"] != "reachable":
                        raise RuntimeError("Scheduled history unavailable")
                    status, body = 200, json.dumps(collector.rows).encode()
            except (OSError, ValueError, RuntimeError):
                status, body = 503, b'{"error":"Scheduled history is temporarily unavailable."}'
        elif self.path == "/api/health":
            collector.collect()
            status, mime, body = 200, "application/json", json.dumps(collector.app).encode()
        elif self.path == "/v2/overview":
            with collector.lock:
                status, mime, body = 200, "application/json", json.dumps(collector.overview()).encode()
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
    stop = threading.Event()
    threading.Thread(target=collector.loop, args=(stop,), daemon=True).start()
    ThreadingHTTPServer(("0.0.0.0", int(os.environ.get("PORT", "8765"))), Dashboard).serve_forever()
