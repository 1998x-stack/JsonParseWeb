"""Real Chromium M03 smoke/regression. Run against local python HTTP server (PORT=8765)."""
import os
import mimetypes
from pathlib import Path
from urllib.parse import urlsplit, unquote
from playwright.sync_api import sync_playwright, expect

ROOT = os.getenv("E2E_BASE_URL", "http://127.0.0.1:8765")
PROJECT = Path(__file__).resolve().parents[2]


def run():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True, executable_path=os.environ.get("CHROMIUM_PATH"), args=["--no-sandbox", "--disable-dev-shm-usage"])
        context = browser.new_context(service_workers="block")
        def serve(route):
            url = urlsplit(route.request.url)
            path = (PROJECT / unquote(url.path).lstrip("/")).resolve()
            if path == PROJECT or path.is_dir():
                path = PROJECT / "index.html"
            if not path.is_relative_to(PROJECT) or not path.is_file():
                route.fulfill(status=404, body="Not found")
                return
            kind = "text/javascript" if path.suffix == ".mjs" else mimetypes.guess_type(str(path))[0] or "text/plain"
            route.fulfill(status=200, content_type=kind, body=path.read_bytes())
        if os.getenv("E2E_STATIC_ROUTED") == "1":
            context.route("**/*", serve)
        page = context.new_page()
        errors, remote_requests = [], []
        page.on("pageerror", lambda e: errors.append(str(e)))
        page.on("request", lambda req: remote_requests.append(req.url) if not req.url.startswith(ROOT) else None)
        page.goto(ROOT+"/?engine=v03", wait_until="load")
        expect(page.locator("#losslessMode")).to_be_checked()
        page.locator("#jsonInput").fill('{"id":9007199254740993,"id":1.00}')
        page.locator("#parseBtn").click()
        expect(page.locator("#status")).to_contain_text("无损解析成功",timeout=12000)
        expect(page.locator("#warnings")).to_contain_text("DUPLICATE_KEY")
        page.locator("#jsonDisplay details").first.wait_for()
        expect(page.locator("#jsonDisplay")).to_contain_text("9007199254740993")
        expect(page.locator("#jsonDisplay")).to_contain_text("1.00")
        page.locator("#formatBtn").click()
        expect(page.locator("#status")).to_contain_text("无损解析成功")
        assert "9007199254740993" in page.locator("#jsonInput").input_value()
        assert "1.00" in page.locator("#jsonInput").input_value()
        # XSS must remain literal text, not produce image/script DOM nodes.
        page.locator("#jsonInput").fill('{"payload":"<img src=x onerror=alert(1)>"}')
        page.locator("#parseBtn").click()
        expect(page.locator("#status")).to_contain_text("无损解析成功")
        expect(page.locator("#jsonDisplay")).to_contain_text("<img src=x onerror=alert(1)>")
        assert page.locator("#jsonDisplay img").count()==0
        # Stale revisions may not overwrite final document.
        for n in range(15):
            page.locator("#jsonInput").fill('{"revision":'+str(n)+'}')
            page.locator("#parseBtn").click()
        expect(page.locator("#status")).to_contain_text("无损解析成功",timeout=12000)
        expect(page.locator("#jsonDisplay")).to_contain_text("14")
        # Worker-level bytes decoder must reject malformed UTF-8.
        page.locator("#fileInput").set_input_files({"name":"invalid.json","mimeType":"application/json","buffer":b'\xc3\x28'})
        expect(page.locator("#warnings")).to_contain_text("INVALID_UTF8",timeout=12000)
        # Legacy fallback stays functional.
        page.locator("#losslessMode").uncheck()
        page.locator("#jsonInput").fill('{"ok":true}')
        page.locator("#parseBtn").click()
        expect(page.locator("#status")).to_contain_text("解析成功",timeout=12000)
        assert not errors, f"JS errors: {errors}"
        assert not remote_requests, f"unexpected external requests: {remote_requests}"
        print("M03 Browser E2E PASS: numeric fidelity, duplicates, format, XSS, edits, strict import, fallback, privacy")
        browser.close()


if __name__ == '__main__':
    run()
