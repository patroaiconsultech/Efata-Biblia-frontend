#!/usr/bin/env python3
"""Production-bundle browser smoke: isolated API fixture, no external service and no billing."""
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

try:
    from playwright.sync_api import sync_playwright, expect
except ImportError as exc:
    raise SystemExit("Install the pinned Playwright Python dependency before running browser smoke") from exc

ROOT = Path(__file__).resolve().parent.parent
APP_URL = "http://127.0.0.1:18080"
API_URL = "http://127.0.0.1:19001"
VERSE = "Texto bíblico sintético, exclusivo do teste de interface."
CALLS: list[tuple[str, str]] = []
PLANS = {
    "checkout_enabled": False,
    "items": [
        {
            "code": "smoke_premium",
            "name": "Plano de teste",
            "price_brl": "9.90",
            "access_days": 30,
            "features": ["Recurso sintético de teste"],
        }
    ],
}
CHAPTER = {
    "work_id": "work_gen",
    "chapter": 1,
    "units": [
        {
            "text_unit_id": "tu_work_gen_1_1",
            "verse": 1,
            "text": VERSE,
        }
    ],
}
WORKS = [{"work_id": "work_gen", "title": "Gênesis"}]


class FixtureApi(BaseHTTPRequestHandler):
    def log_message(self, *_args: object) -> None:
        pass

    def respond(self, status: int, payload: object) -> None:
        body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Access-Control-Allow-Origin", APP_URL)
        self.send_header("Access-Control-Allow-Headers", "Content-Type, Authorization, X-Request-ID, X-Tenant-ID, X-User-ID, X-Role")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS")
        self.end_headers()
        self.wfile.write(body)

    def do_OPTIONS(self) -> None:
        self.respond(200, {})

    def do_GET(self) -> None:
        path = urlparse(self.path).path
        CALLS.append(("GET", path))
        if path == "/api/works":
            return self.respond(200, WORKS)
        if path == "/api/works/work_gen/chapters/1":
            return self.respond(200, CHAPTER)
        if path == "/api/search":
            return self.respond(200, {
                "results": [{
                    "text_unit_id": "tu_work_gen_1_1",
                    "reference": "Gênesis 1:1",
                    "text": VERSE,
                    "source_version": "TEST_ONLY",
                }]
            })
        if path == "/api/billing/plans":
            return self.respond(200, PLANS)
        return self.respond(404, {"detail": {"code": "UNEXPECTED_FIXTURE_API", "message": path}})

    def do_POST(self) -> None:
        path = urlparse(self.path).path
        CALLS.append(("POST", path))
        self.respond(503, {"detail": {"code": "NO_CHECKOUT_IN_SMOKE"}})


def wait_for_frontend(process: subprocess.Popen, seconds: float = 20.0) -> None:
    deadline = time.monotonic() + seconds
    while time.monotonic() < deadline:
        if process.poll() is not None:
            raise RuntimeError(f"Vite preview terminated unexpectedly (exit {process.returncode})")
        try:
            with urlopen(APP_URL + "/", timeout=1) as response:
                if response.status == 200:
                    return
        except (URLError, TimeoutError):
            time.sleep(0.15)
    raise TimeoutError("Vite preview failed to become ready")


def run() -> None:
    if not (ROOT / "dist/index.html").is_file() or not (ROOT / "dist/app/index.html").is_file():
        raise RuntimeError("Landing and app bundle absent: run VITE_API_BASE_URL=http://127.0.0.1:19001 npm run build")
    api = ThreadingHTTPServer(("127.0.0.1", 19001), FixtureApi)
    api.daemon_threads = True
    thread = threading.Thread(target=api.serve_forever, daemon=True)
    thread.start()
    vite_bin = ROOT / "node_modules/.bin/vite"
    if not vite_bin.is_file():
        raise RuntimeError("Vite unavailable: run npm ci first")
    preview = subprocess.Popen(
        [str(vite_bin), "preview", "--host", "127.0.0.1", "--port", "18080", "--strictPort"],
        cwd=ROOT,
        stdout=subprocess.DEVNULL,
        stderr=subprocess.PIPE,
        text=True,
    )
    try:
        wait_for_frontend(preview)
        with sync_playwright() as playwright:
            browser = playwright.chromium.launch(headless=True)
            try:
                page = browser.new_page(viewport={"width": 1440, "height": 900})
                exceptions: list[str] = []
                page.on("pageerror", lambda error: exceptions.append(str(error)))
                page.goto(APP_URL + "/", wait_until="domcontentloaded")
                expect(page.get_by_role("heading", name="Há uma Palavra que encontra a tua vida.")).to_be_visible()
                assert page.locator('link[rel="canonical"]').get_attribute("href") == "https://efata777.com/"
                assert page.get_by_role("main").count() == 1
                page.goto(APP_URL + "/app/", wait_until="domcontentloaded")
                expect(page.get_by_role("heading", name="Encontre espaço para a Palavra")).to_be_visible()
                expect(page.get_by_text(VERSE).first).to_be_visible()
                assert page.get_by_role("button", name="☆ Favoritar").first.is_disabled(), "Anonymous reader must be read-only"
                assert page.get_by_role("button", name="OIDC não configurado").is_disabled(), "Production auth must be fail-closed"

                page.get_by_role("button", name="Planos", exact=True).click()
                expect(page.get_by_role("heading", name="Planos da Bíblia Sagrada")).to_be_visible()
                expect(page.get_by_text("Pagamentos ainda não habilitados")).to_be_visible()
                assert page.get_by_role("button", name="Em preparação").is_disabled(), "Checkout must stay disabled"

                page.get_by_role("button", name="Busca", exact=True).click()
                page.get_by_role("textbox", name="Termo de busca").fill("princípio")
                page.get_by_role("button", name="Buscar", exact=True).click()
                expect(page.get_by_text("Gênesis 1:1")).to_be_visible()
                page.get_by_role("button", name="Abrir no leitor").click()
                expect(page.get_by_role("heading", name="Encontre espaço para a Palavra")).to_be_visible()
                expect(page.get_by_text(VERSE).first).to_be_visible()

                if exceptions:
                    raise AssertionError("Browser exceptions: " + "; ".join(exceptions))
                if any(method == "POST" and path == "/api/billing/checkouts" for method, path in CALLS):
                    raise AssertionError("Checkout endpoint was called during read-only smoke")
                required = {
                    "/api/works",
                    "/api/works/work_gen/chapters/1",
                    "/api/billing/plans",
                    "/api/search",
                }
                observed = {path for _, path in CALLS}
                missing = required - observed
                if missing:
                    raise AssertionError(f"Expected API calls missing: {sorted(missing)}")
                print("BIBLE_FRONTEND_BROWSER_SMOKE_PASS: reader, search, plans, no checkout, anonymous safety")
            finally:
                browser.close()
    finally:
        preview.terminate()
        try:
            preview.communicate(timeout=5)
        except subprocess.TimeoutExpired:
            preview.kill()
            preview.communicate()
        api.shutdown()
        api.server_close()


if __name__ == "__main__":
    try:
        run()
    except Exception as error:
        print(f"BIBLE_FRONTEND_BROWSER_SMOKE_FAIL: {error}", file=sys.stderr)
        raise
