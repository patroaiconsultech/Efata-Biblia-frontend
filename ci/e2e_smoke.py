#!/usr/bin/env python3
"""Native login browser smoke against the production Node server and synthetic API.
No external provider, production billing, or actual PostgreSQL in this CI gate.
"""
from __future__ import annotations
import json
import os
import subprocess
import sys
import threading
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.error import URLError
from urllib.parse import urlparse
from urllib.request import urlopen
from playwright.sync_api import sync_playwright, expect

ROOT = Path(__file__).resolve().parent.parent
APP_URL = "http://127.0.0.1:18080"
API_URL = "http://127.0.0.1:19001"
VERSE = "Texto bíblico sintético, exclusivo do teste de interface."
CALLS: list[tuple[str, str]] = []
CSRF = "a" * 64


class FixtureApi(BaseHTTPRequestHandler):
    def log_message(self, *_args) -> None:
        pass

    def respond(self, status: int, payload: object, *, cookie=False) -> None:
        body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        if cookie:
            # HTTP-only fixture; production cookie is __Host- Secure.
            self.send_header("Set-Cookie", "bible_smoke_session=opaque; Path=/; HttpOnly; SameSite=Lax")
        self.end_headers()
        self.wfile.write(body)

    def logged_in(self) -> bool:
        return "bible_smoke_session=opaque" in (self.headers.get("Cookie") or "")

    def context(self):
        return {"authenticated": True, "user_id": "test-user", "tenant_id": "test-tenant",
                "role": "member", "auth_method": "native_session", "csrf_token": CSRF}

    def do_GET(self):
        path = urlparse(self.path).path
        CALLS.append(("GET", path))
        if path == "/api/readiness": return self.respond(200, {"ready": True})
        if path == "/api/auth/status": return self.respond(200, {
            "status": "authentication_required", "mode": "native_session",
            "registration_enabled": False, "password_reset_enabled": False})
        if path == "/api/auth/session":
            if not self.logged_in():
                return self.respond(401, {"detail": {"code": "BIBLE_SESSION_REQUIRED"}})
            return self.respond(200, self.context())
        if not self.logged_in():
            return self.respond(401, {"detail": {"code": "BIBLE_SESSION_REQUIRED"}})
        if path == "/api/auth/me": return self.respond(200, self.context())
        if path == "/api/works": return self.respond(200, [{"work_id": "work_gen", "title": "Gênesis"}])
        if path == "/api/works/work_gen/chapters/1":
            return self.respond(200, {"work_id": "work_gen", "chapter": 1,
                "units": [{"text_unit_id": "tu_work_gen_1_1", "verse": 1, "text": VERSE}]})
        if path == "/api/progress": return self.respond(200, {"items": []})
        if path == "/api/journal": return self.respond(200, {"items": []})
        if path == "/api/bookmarks": return self.respond(200, {"text_unit_ids": []})
        if path == "/api/highlights": return self.respond(200, {"items": []})
        if path == "/api/faith-preferences/me": return self.respond(200, {"preference": None})
        if path == "/api/billing/plans": return self.respond(200, {"checkout_enabled": False, "items": []})
        if path == "/api/billing/me": return self.respond(200, {"entitlements": [], "checkouts": []})
        if path == "/api/search": return self.respond(200, {"results": []})
        return self.respond(404, {"detail": {"code": "UNEXPECTED_FIXTURE_PATH"}})

    def do_POST(self):
        path = urlparse(self.path).path
        CALLS.append(("POST", path))
        if path == "/api/auth/login":
            data = json.loads(self.rfile.read(int(self.headers["Content-Length"])))
            if data.get("email") != "reader@example.org" or data.get("password") != "secure-demo-password-2026":
                return self.respond(401, {"detail": {"code": "BIBLE_LOGIN_INVALID"}})
            return self.respond(200, self.context(), cookie=True)
        if path == "/api/auth/logout":
            if not self.logged_in() or self.headers.get("X-CSRF-Token") != CSRF:
                return self.respond(403, {"detail": {"code": "BIBLE_CSRF_INVALID"}})
            return self.respond(200, {"authenticated": False}, cookie=False)
        return self.respond(503, {"detail": {"code": "NO_CHECKOUT_IN_SMOKE"}})


def wait_for_frontend(process, seconds=20):
    deadline = time.monotonic() + seconds
    while time.monotonic() < deadline:
        if process.poll() is not None:
            raise RuntimeError(f"Native frontend terminated with exit code {process.returncode}")
        try:
            with urlopen(APP_URL + "/", timeout=1) as result:
                if result.status == 200: return
        except (URLError, TimeoutError):
            time.sleep(.15)
    raise TimeoutError("Node frontend did not become ready")


def main():
    if not (ROOT / "dist/index.html").exists() or not (ROOT / "dist/app/index.html").exists():
        raise RuntimeError("No bundle: run npm ci && npm run build")
    api = ThreadingHTTPServer(("127.0.0.1", 19001), FixtureApi)
    api.daemon_threads = True
    threading.Thread(target=api.serve_forever, daemon=True).start()
    process = subprocess.Popen(
        ["node", "server.mjs"], cwd=ROOT,
        env={**os.environ, "PORT": "18080", "BIBLE_API_ORIGIN": API_URL,
             "EFATA_PUBLIC_INDEXING_ENABLED": "false"},
        stdout=subprocess.DEVNULL, stderr=subprocess.PIPE, text=True,
    )
    try:
        wait_for_frontend(process)
        with sync_playwright() as playwright:
            browser = playwright.chromium.launch(headless=True)
            try:
                page = browser.new_page(viewport={"width": 1360, "height": 900})
                js_errors = []
                page.on("pageerror", lambda error: js_errors.append(str(error)))
                page.goto(APP_URL + "/", wait_until="domcontentloaded")
                expect(page.get_by_role("heading", name="Há uma Palavra que encontra a tua vida.")).to_be_visible()
                page.goto(APP_URL + "/app/", wait_until="domcontentloaded")
                expect(page.get_by_role("heading", name="Entrar")).to_be_visible()
                page.get_by_label("E-mail").fill("reader@example.org")
                page.get_by_label("Senha").fill("secure-demo-password-2026")
                page.get_by_role("button", name="Entrar", exact=True).click()
                expect(page.get_by_role("heading", name="Encontre espaço para a Palavra")).to_be_visible()
                expect(page.get_by_text(VERSE).first).to_be_visible()
                page.get_by_role("button", name="Planos", exact=True).click()
                expect(page.get_by_text("Pagamentos ainda não habilitados")).to_be_visible()
                assert not any(method == "POST" and path == "/api/billing/checkouts"
                               for method, path in CALLS), "Billing never called"
                assert any(method == "POST" and path == "/api/auth/login" for method, path in CALLS)
                assert any(method == "GET" and path == "/api/auth/session" for method, path in CALLS)
                assert not js_errors, js_errors
                print("BIBLE_NATIVE_LOGIN_BROWSER_SMOKE_PASS")
            finally:
                browser.close()
    finally:
        process.terminate()
        try: process.communicate(timeout=5)
        except subprocess.TimeoutExpired:
            process.kill()
            process.communicate()
        api.shutdown()
        api.server_close()


if __name__ == "__main__":
    main()
