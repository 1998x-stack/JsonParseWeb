"""PRODUCT-04 real Chromium: report disclosure + local-only network/storage proof.
Requires a local HTTP server on E2E_BASE_URL. Synthetic marker only.
"""
import json
import os
from pathlib import Path
from playwright.sync_api import sync_playwright, expect

BASE = os.getenv('E2E_BASE_URL', 'http://127.0.0.1:8765')
MARKER = 'DO_NOT_LEAK_PRODUCT04_R4JQ8'
SOURCE = '{"'+MARKER+'":1,"'+MARKER+'":2,"id":9007199254740993}'


def run():
    with sync_playwright() as playwright:
        browser=playwright.chromium.launch(headless=True, executable_path=os.getenv('CHROMIUM_PATH') or None,
            args=['--no-sandbox','--disable-dev-shm-usage'])
        context=browser.new_context(viewport={'width':1280,'height':900},service_workers='block',accept_downloads=True)
        context.grant_permissions(['clipboard-read','clipboard-write'])
        page=context.new_page()
        errors, requests = [], []
        page.on('pageerror',lambda exc: errors.append(str(exc)))
        page.on('request',lambda req: requests.append({'url':req.url,'post':req.post_data or ''}))
        page.goto(BASE+'/',wait_until='load')
        expect(page.locator('#reportPanel')).to_be_hidden()
        page.locator('#jsonInput').fill(SOURCE)
        page.locator('#parseBtn').click()
        expect(page.locator('#status')).to_contain_text('Inspection complete',timeout=20000)
        expect(page.locator('#reportPanel')).to_be_visible()
        expect(page.locator('#issuesPanel')).to_contain_text('2')
        # Without the preview, export and copy are disabled.
        expect(page.locator('#reportDownloadBtn')).to_be_disabled()
        expect(page.locator('#reportCopyBtn')).to_be_disabled()
        page.locator('#reportBuildBtn').click()
        expect(page.locator('#reportFeedback')).to_contain_text('Privacy-first report ready',timeout=20000)
        safe=page.locator('#reportPreview').text_content()
        parsed=json.loads(safe)
        assert parsed['privacyMode']=='redacted'
        assert parsed['inspection']['total']==2
        assert MARKER not in safe
        assert '9007199254740993' not in safe
        assert 'rawExcerpt' not in safe
        expect(page.locator('#reportCopyBtn')).to_be_enabled()
        page.locator('#reportCopyBtn').click()
        copied=page.evaluate('navigator.clipboard.readText()')
        assert copied==safe
        assert MARKER not in copied
        # Detailed mode is genuinely opt-in; review confirmation is a separate action.
        page.locator('#reportDetailed').check()
        expect(page.locator('#reportDownloadBtn')).to_be_disabled()
        page.locator('#reportBuildBtn').click()
        expect(page.locator('#reportFeedback')).to_contain_text('Sensitive report ready',timeout=20000)
        detailed=page.locator('#reportPreview').inner_text()
        assert MARKER in detailed
        expect(page.locator('#reportDownloadBtn')).to_be_disabled()
        expect(page.locator('#reportReviewed')).to_be_visible()
        page.locator('#reportReviewed').check()
        expect(page.locator('#reportDownloadBtn')).to_be_enabled()
        with page.expect_download() as outcome:
            page.locator('#reportDownloadBtn').click()
        download=outcome.value
        assert download.suggested_filename == 'jsonparse-inspection.json'
        assert MARKER in Path(download.path()).read_text(encoding='utf-8')
        # Changing report mode requires a new preview and new confirmation.
        page.locator('#reportFormat').select_option('markdown')
        expect(page.locator('#reportDownloadBtn')).to_be_disabled()
        page.locator('#reportBuildBtn').click()
        expect(page.locator('#reportFeedback')).to_contain_text('Sensitive report ready')
        page.locator('#reportReviewed').check()
        assert page.locator('#reportPreview').inner_text().startswith('# JsonParseWeb')
        # Updating source invalidates the complete preview and old report actions.
        page.locator('#jsonInput').fill('{"ok":true}')
        expect(page.locator('#reportPanel')).to_be_hidden()
        expect(page.locator('#reportDownloadBtn')).to_have_count(0)
        # Privacy policy is a navigable same-origin document, with no external scripts.
        page.goto(BASE+'/privacy.html',wait_until='load')
        expect(page.locator('h1')).to_contain_text('Local processing')
        # Inspect requests and persistent browser stores. Blob downloads do not make network uploads.
        leaked=[r for r in requests if MARKER in (r['url']+r['post'])]
        assert not leaked, leaked
        external=[r for r in requests if not r['url'].startswith(BASE) and not r['url'].startswith('blob:')]
        assert not external, external
        persistence=page.evaluate('''async () => ({
          local:Object.keys(localStorage),session:Object.keys(sessionStorage),
          cookies:document.cookie, idb:typeof indexedDB.databases==='function' ? (await indexedDB.databases()).map(x=>x.name) : [],
          caches:await caches.keys()
        })''')
        assert persistence == {'local':[],'session':[],'cookies':'','idb':[],'caches':[]},persistence
        assert not errors,errors
        print('PRODUCT-04 Chromium PASS: safe report, deliberate detailed opt-in, local download/copy, stale clearing, network & storage proof')
        browser.close()


if __name__=='__main__':
    run()
