"""Chromium M04-E: lossless table, 2D windows, 100k AST nodes, privacy, rollback."""
import os
from playwright.sync_api import sync_playwright, expect

ROOT=os.environ.get('E2E_BASE_URL','http://127.0.0.1:8765')

def run():
    with sync_playwright() as p:
        browser=p.chromium.launch(headless=True,executable_path=os.environ.get('CHROMIUM_PATH') or None,
                                  args=['--no-sandbox','--disable-dev-shm-usage'])
        context=browser.new_context(viewport={'width':1440,'height':900},service_workers='block')
        context.add_init_script('''Object.defineProperty(navigator,'clipboard',{configurable:true,
          value:{writeText:async value=>{window.__clipboardText=value;}}});''')
        page=context.new_page()
        errors,remote=[],[]
        page.on('pageerror',lambda error:errors.append(str(error)))
        page.on('request',lambda req:remote.append(req.url) if not req.url.startswith(ROOT) else None)
        page.goto(ROOT+'/?engine=v03&virtual=1',wait_until='load')
        source=page.locator('#jsonInput')
        source.fill('[{"id":9007199254740993,"id":1.00,"v":null},{"id":-0},{}]')
        page.locator('#parseBtn').click()
        expect(page.locator('#status')).to_contain_text('无损解析成功',timeout=20000)
        page.locator('[data-view="table"]').click()
        grid=page.locator('.virtual-table-viewport')
        expect(grid).to_be_visible(timeout=15000)
        expect(page.locator('.virtual-table-status')).to_contain_text('3 行 × 3 列')
        expect(page.locator('.virtual-table-heading')).to_have_count(3)
        assert page.locator('.virtual-table-heading').all_text_contents()==['id','id (#2)','v']
        first=page.locator('.virtual-table-row[aria-rowindex="2"]')
        expect(first).to_contain_text('9007199254740993')
        expect(first).to_contain_text('1.00')
        expect(first).to_contain_text('null')
        second=page.locator('.virtual-table-row[aria-rowindex="3"]')
        expect(second).to_contain_text('-0')
        expect(second.locator('.is-missing')).to_have_count(2)
        first.locator('[data-cell-node]').first.click()
        expect(page.locator('.node-details-meta')).to_contain_text('number',timeout=15000)
        page.locator('#copyRawBtn').click()
        assert page.evaluate('window.__clipboardText')=='9007199254740993'
        assert '9007199254740993' in source.input_value()
        wide='[{' + ','.join(f'"k{i}":{i}' for i in range(500)) + '}]'
        source.fill(wide);page.locator('#parseBtn').click()
        expect(page.locator('#status')).to_contain_text('无损解析成功',timeout=20000)
        page.locator('[data-view="table"]').click()
        expect(page.locator('.virtual-table-status')).to_contain_text('1 行 × 500 列',timeout=15000)
        assert page.locator('.virtual-table-heading').count()<=16
        grid.evaluate('(e)=>e.scrollLeft=e.scrollWidth')
        expect(page.locator('.virtual-table-heading').last).to_contain_text('k499',timeout=15000)
        expect(page.locator('.virtual-table-row[aria-rowindex="2"]')).to_contain_text('499')
        assert page.locator('.virtual-table-heading').count()<=16
        source.fill('['+','.join('0' for _ in range(99999))+']')
        page.locator('#parseBtn').click()
        expect(page.locator('#status')).to_contain_text('无损解析成功',timeout=30000)
        page.locator('[data-view="table"]').click()
        expect(page.locator('.virtual-table-status')).to_contain_text('99999 行',timeout=20000)
        assert page.locator('.virtual-table-row').count()<=48
        grid.evaluate('(e)=>e.scrollTop=e.scrollHeight')
        expect(page.locator('.virtual-table-row[aria-rowindex="100000"]')).to_be_visible(timeout=20000)
        assert page.locator('.virtual-table-row').count()<=48
        assert page.locator('[role="gridcell"]').count()<=800
        page.locator('#virtualTreeMode').uncheck()
        assert page.locator('.virtual-table-viewport').count()==0
        source.fill('[false]');page.locator('#parseBtn').click()
        expect(page.locator('#status')).to_contain_text('无损解析成功',timeout=20000)
        assert not errors, f'Page errors: {errors}'
        assert not remote, f'Unexpected network requests: {remote}'
        print('M04-E PASS: fidelity, sparse/duplicate/null, 500 columns, 100k nodes, viewport bounds, privacy')
        browser.close()

if __name__=='__main__':run()
