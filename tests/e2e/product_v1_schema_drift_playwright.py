"""PRODUCT-03 Chromium E2E: truthful observational drift, local files and evidence."""
import os
from playwright.sync_api import sync_playwright, expect

BASE = os.environ.get('E2E_BASE_URL', 'http://127.0.0.1:8765')


def run():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True, executable_path=os.getenv('CHROMIUM_PATH') or None,
                                    args=['--no-sandbox', '--disable-dev-shm-usage'])
        context = browser.new_context(viewport={'width':1440, 'height':900}, service_workers='block')
        page = context.new_page()
        errors, remote = [], []
        page.on('pageerror', lambda e: errors.append(str(e)))
        page.on('request', lambda r: remote.append(r.url) if not r.url.startswith(BASE) else None)
        page.goto(BASE+'/', wait_until='load')
        page.locator('[data-demo="drift"]').click()
        expect(page.locator('#status')).to_contain_text('Inspection complete', timeout=20000)
        expect(page.locator('#driftDisclosure')).to_have_attribute('open', '', timeout=20000)
        expect(page.locator('#driftResults [data-rule="SCHEMA.TYPE_VARIANCE"]')).to_have_count(2, timeout=20000)
        expect(page.locator('#driftResults [data-rule="SCHEMA.MISSING_FIELD"]')).to_have_count(2)
        expect(page.locator('#driftResults [data-rule="SCHEMA.NULL_VARIANCE"]')).to_have_count(2)
        expect(page.locator('#driftResults')).to_contain_text('5')
        assert page.locator('#jsonInput').input_value().startswith('[{"price"')
        type_card=page.locator('#driftResults [data-rule="SCHEMA.TYPE_VARIANCE"]').first
        type_card.locator('.drift-locate').first.click()
        expected=page.locator('#jsonInput').evaluate('(el)=>el.value.slice(el.selectionStart,el.selectionEnd)')
        assert expected in ['"19.5"','null','19.5','"US"','"EU"','"JP"'],expected
        # Different sample files remain local and can be source-highlighted without swapping primary document.
        primary='{"price":12.5,"active":true}'
        page.locator('#jsonInput').fill(primary)
        page.locator('#parseBtn').click()
        expect(page.locator('#status')).to_contain_text('Inspection complete', timeout=20000)
        page.locator('#driftDisclosure summary').click()
        page.locator('#driftFiles').set_input_files([
            {'name':'sample-a.json','mimeType':'application/json','buffer':b'{"price":"12.5","active":false}'},
            {'name':'sample-b.json','mimeType':'application/json','buffer':b'{"active":true}'}
        ])
        expect(page.locator('#driftFileInfo')).to_contain_text('sample-a.json')
        page.locator('#driftRunBtn').click()
        expect(page.locator('#driftResults [data-rule="SCHEMA.TYPE_VARIANCE"]')).to_have_count(1, timeout=20000)
        expect(page.locator('#driftResults [data-rule="SCHEMA.MISSING_FIELD"]')).to_have_count(1)
        expect(page.locator('#driftResults')).to_contain_text('3')
        refs=page.locator('#driftResults [data-rule="SCHEMA.TYPE_VARIANCE"] .drift-locate')
        assert refs.count()>0
        # Click an explicitly related uploaded sample reference.
        found=False
        for index in range(refs.count()):
            if 'sample-1' in refs.nth(index).inner_text():
                refs.nth(index).click();found=True;break
        assert found, 'expected a source-linked example from the first additional sample'
        expect(page.locator('#driftEvidence')).to_be_visible()
        assert page.locator('#driftEvidenceSource').input_value() == '{"price":"12.5","active":false}'
        assert page.locator('#jsonInput').input_value()==primary
        # Invalid supplemental JSON reports error and does not replace the primary AST.
        page.locator('#driftFiles').set_input_files([
            {'name':'bad.json','mimeType':'application/json','buffer':b'{"broken":}'}
        ])
        expect(page.locator('#driftFileInfo')).to_contain_text('bad.json')
        page.locator('#driftRunBtn').click()
        expect(page.locator('#driftFeedback')).to_contain_text('SAMPLE_INVALID',timeout=20000)
        assert page.locator('#jsonInput').input_value()==primary
        # Invalid UTF-8 never silently undergoes replacement-decoding.
        page.locator('#driftFiles').set_input_files([
            {'name':'broken-encoding.json','mimeType':'application/json','buffer':b'\xc3\x28'}
        ])
        expect(page.locator('#driftFeedback')).to_contain_text('INVALID_UTF8',timeout=20000)
        # At insufficient eligible records, show distributions but no anomaly verdict.
        page.locator('#jsonInput').fill('[{"x":1},{"x":"1"}]')
        page.locator('#parseBtn').click()
        expect(page.locator('#status')).to_contain_text('Inspection complete',timeout=20000)
        page.locator('#driftDisclosure summary').click()
        page.locator('#driftRunBtn').click()
        expect(page.locator('#driftResults')).to_contain_text('Fewer than 3 eligible objects',timeout=20000)
        assert page.locator('#driftResults .drift-card').count()==0
        # Language switch preserves JSON and the observational wording.
        page.locator('#languageSelect').select_option('zh')
        expect(page.locator('#driftResults')).to_contain_text('合格样本不足 3 条')
        assert page.locator('#jsonInput').input_value()=='[{"x":1},{"x":"1"}]'
        # Editing invalidates every old field observation; no leaking stale example.
        page.locator('#jsonInput').fill('{"ok":true}')
        assert page.locator('#driftResults').count()==0
        assert not errors, f'Browser errors: {errors}'
        assert not remote, f'Unexpected external requests: {remote}'
        print('PRODUCT-03 Chromium PASS: demo, truthful types/missing/null, multi-file evidence, stale, UTF-8, i18n, privacy')
        browser.close()


if __name__ == '__main__':
    run()
