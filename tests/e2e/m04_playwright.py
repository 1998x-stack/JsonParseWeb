"""M04-C real Chromium regression: virtual 100k tree, focus, epochs, fallback, privacy."""
import os
from playwright.sync_api import sync_playwright, expect

ROOT=os.getenv('E2E_BASE_URL','http://127.0.0.1:8765')


def run():
    with sync_playwright() as playwright:
        browser=playwright.chromium.launch(headless=True, executable_path=os.getenv('CHROMIUM_PATH') or None, args=['--no-sandbox','--disable-dev-shm-usage'])
        context=browser.new_context(viewport={'width':1440,'height':900}, service_workers='block')
        page=context.new_page()
        errors=[]
        remotes=[]
        page.on('pageerror', lambda error: errors.append(str(error)))
        page.on('request', lambda request: remotes.append(request.url) if not request.url.startswith(ROOT) else None)
        page.goto(ROOT+'/?engine=v03&virtual=1',wait_until='load')
        expect(page.locator('#losslessMode')).to_be_checked()
        expect(page.locator('#virtualTreeMode')).to_be_checked()
        source=page.locator('#jsonInput')
        tree=page.locator('.virtual-tree-viewport')
        rows=page.locator('.virtual-tree-row[role=treeitem]')
        source.fill('{"a":{"b":[1,2,3]},"c":false}')
        page.locator('#parseBtn').click()
        expect(page.locator('#status')).to_contain_text('无损解析成功',timeout=20000)
        expect(rows).to_have_count(3,timeout=20000)
        expect(tree).to_have_attribute('role','tree')
        expect(page.locator('#jsonDisplay .virtual-tree-count')).to_contain_text('3 / 3')
        a=page.locator('.virtual-tree-row[data-node-id="1"]')
        expect(a).to_have_attribute('aria-expanded','false')
        a.locator('button[data-action=toggle]').click()
        expect(page.locator('#jsonDisplay .virtual-tree-count')).to_contain_text('4 / 4')
        expect(a).to_have_attribute('aria-expanded','true')
        # Click the nested b array, then ArrowLeft moves to visible parent a.
        page.locator('.virtual-tree-row[data-node-id="2"]').click()
        tree.press('ArrowLeft')
        expect(page.locator('.virtual-tree-row[data-node-id="1"]')).to_have_attribute('aria-selected','true')
        a.locator('button[data-action=toggle]').click()
        expect(page.locator('#jsonDisplay .virtual-tree-count')).to_contain_text('3 / 3')
        # Long precision literals remain unchanged and HTML is not interpreted.
        source.fill('{"id":9007199254740993,"html":"<img src=x onerror=alert(1)>"}')
        page.locator('#parseBtn').click()
        expect(page.locator('#status')).to_contain_text('无损解析成功',timeout=20000)
        expect(page.locator('#jsonDisplay')).to_contain_text('9007199254740993')
        assert page.locator('#jsonDisplay img').count()==0
        # Virtualized 100k AST nodes: last row is navigable with few mounted DOM elements.
        source.fill('['+','.join(['0']*99999)+']')
        page.locator('#parseBtn').click()
        expect(page.locator('#status')).to_contain_text('无损解析成功',timeout=30000)
        expect(page.locator('#jsonDisplay .virtual-tree-count')).to_contain_text('/ 100000',timeout=30000)
        assert rows.count() <= 400, rows.count()
        tree.evaluate('(element) => { element.scrollTop=element.scrollHeight; element.dispatchEvent(new Event("scroll")); }')
        expect(page.locator('.virtual-tree-row[data-node-id="99999"]')).to_be_visible(timeout=30000)
        assert rows.count() <= 400, rows.count()
        tree.focus()
        tree.press('End')
        expect(page.locator('.virtual-tree-row[data-node-id="99999"]')).to_have_attribute('aria-selected','true',timeout=15000)
        active=tree.get_attribute('aria-activedescendant')
        assert active is not None and page.locator('[id="'+active+'"]').count()==1
        tree.press('Home')
        expect(page.locator('.virtual-tree-row[data-node-id="0"]')).to_have_attribute('aria-selected','true',timeout=15000)
        root=page.locator('.virtual-tree-row[data-node-id="0"]')
        root.locator('button[data-action=toggle]').click()
        expect(page.locator('#jsonDisplay .virtual-tree-count')).to_contain_text('1 / 1',timeout=15000)
        assert rows.count()==1
        root.locator('button[data-action=toggle]').click()
        expect(page.locator('#jsonDisplay .virtual-tree-count')).to_contain_text('/ 100000',timeout=15000)
        assert rows.count() <= 400
        # M03 compatibility fallback is still available on the same valid document.
        page.locator('#virtualTreeMode').uncheck()
        expect(page.locator('#jsonDisplay details').first).to_be_visible(timeout=15000)
        assert page.locator('.virtual-tree-viewport').count()==0
        # A fresh parse can return to the virtual view without stale row reuse.
        page.locator('#virtualTreeMode').check()
        source.fill('[false]')
        page.locator('#parseBtn').click()
        expect(page.locator('#jsonDisplay .virtual-tree-count')).to_contain_text('2 / 2',timeout=15000)
        expect(page.locator('#jsonDisplay')).to_contain_text('false')
        assert not errors, f'Browser JS errors: {errors}'
        assert not remotes, f'External requests: {remotes}'
        browser.close()
        print('M04-C browser PASS: 100k windowed tree, expand/collapse, focus, stale edits, fallback, privacy')


if __name__=='__main__':
    run()
