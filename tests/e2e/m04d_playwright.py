"""M04-D: real Chromium navigation, exact-copy, source-location, privacy, and fallback E2E."""
import os
from playwright.sync_api import sync_playwright, expect

ROOT = os.getenv('E2E_BASE_URL','http://127.0.0.1:8765')


def run():
    with sync_playwright() as p:
        browser=p.chromium.launch(headless=True, executable_path=os.getenv('CHROMIUM_PATH') or None,
                                  args=['--no-sandbox','--disable-dev-shm-usage'])
        context=browser.new_context(viewport={'width':1440,'height':900},service_workers='block')
        # Isolate clipboard contract from OS permissions and inspect exact copied bytes in-page.
        context.add_init_script('''
          Object.defineProperty(navigator, 'clipboard', { configurable: true,
            value: {writeText: async value => {window.__clipboardText=value;}} });
        ''')
        page=context.new_page()
        errors,remote=[],[]
        page.on('pageerror',lambda error:errors.append(str(error)))
        page.on('request',lambda request:remote.append(request.url) if not request.url.startswith(ROOT) else None)
        page.goto(ROOT+'/?engine=v03&virtual=1',wait_until='load')
        source=page.locator('#jsonInput')
        original='{"a/b":[{"m~n":9007199254740993}],"a":1,"a":2}'
        source.fill(original)
        page.locator('#parseBtn').click()
        expect(page.locator('#status')).to_contain_text('无损解析成功',timeout=20000)
        expect(page.locator('#pointerNav')).to_be_visible()
        expect(page.locator('#nodeDetails')).to_be_visible()
        expect(page.locator('#nodeDetails .node-details-pointer')).to_contain_text('根节点')
        # Deep JSON Pointer reveal atomically expands ancestors, selects node and locates exact token.
        page.locator('#pointerInput').fill('/a~1b/0/m~0n')
        page.locator('#navigatePointerBtn').click()
        expect(page.locator('#pointerFeedback')).to_contain_text('已定位行',timeout=20000)
        expect(page.locator('#nodeDetails .node-details-pointer')).to_contain_text('/a~1b/0/m~0n')
        expect(page.locator('.virtual-tree-row[data-node-id="3"]')).to_have_attribute('aria-selected','true',timeout=20000)
        page.locator('#copyPointerBtn').click()
        expect(page.locator('#pointerFeedback')).to_contain_text('已复制')
        assert page.evaluate('window.__clipboardText')=='/a~1b/0/m~0n'
        page.locator('#copyRawBtn').click()
        expect(page.locator('#pointerFeedback')).to_contain_text('已复制')
        assert page.evaluate('window.__clipboardText')=='9007199254740993'
        page.locator('#locateSourceBtn').click()
        selected=source.evaluate('(el) => el.value.slice(el.selectionStart,el.selectionEnd)')
        assert selected=='9007199254740993',selected
        # Duplicate key path is ambiguous; selecting the actual occurrence by node ID remains possible.
        page.locator('#pointerInput').fill('/a')
        page.locator('#navigatePointerBtn').click()
        expect(page.locator('#pointerFeedback')).to_contain_text('AMBIGUOUS_MEMBER',timeout=20000)
        page.locator('.virtual-tree-row[data-node-id="5"]').click()
        expect(page.locator('#nodeDetails .node-details-pointer')).to_contain_text('歧义',timeout=20000)
        expect(page.locator('#copyPointerBtn')).to_be_disabled()
        page.locator('#copyRawBtn').click()
        expect(page.locator('#pointerFeedback')).to_contain_text('已复制')
        assert page.evaluate('window.__clipboardText')=='2'
        # Values over old GET_SOURCE_SLICE 64KiB cap are copied directly from verified source span.
        large='{"payload":"'+'a'*90000+'"}'
        source.fill(large)
        page.locator('#parseBtn').click()
        expect(page.locator('#status')).to_contain_text('无损解析成功',timeout=20000)
        expect(page.locator('#nodeDetails .node-details-preview')).to_contain_text('预览截断',timeout=20000)
        page.locator('#copyRawBtn').click()
        expect(page.locator('#pointerFeedback')).to_contain_text('已复制',timeout=20000)
        assert page.evaluate('window.__clipboardText')==large
        # Reset and mode switch invalidate detail selections.
        source.fill('[false]')
        assert page.locator('#nodeDetails').is_hidden()
        page.locator('#parseBtn').click()
        expect(page.locator('#status')).to_contain_text('无损解析成功',timeout=20000)
        page.locator('#virtualTreeMode').uncheck()
        assert page.locator('#pointerNav').is_hidden()
        assert page.locator('#nodeDetails').is_hidden()
        assert not errors, f'Page errors: {errors}'
        assert not remote, f'Unexpected network: {remote}'
        print('M04-D Chromium PASS: pointer reveal, duplicate ambiguity, exact copy, source span, 90k raw, stale reset, privacy')
        browser.close()


if __name__=='__main__':
    run()
