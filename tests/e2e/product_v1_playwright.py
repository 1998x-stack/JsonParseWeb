"""PRODUCT-01/02 Chromium gate. Run against local static HTTP server at 127.0.0.1:8765."""
import os
from playwright.sync_api import sync_playwright, expect

BASE=os.environ.get('E2E_BASE_URL','http://127.0.0.1:8765')


def run():
    with sync_playwright() as p:
        browser=p.chromium.launch(headless=True,executable_path=os.getenv('CHROMIUM_PATH') or None,
                                  args=['--no-sandbox','--disable-dev-shm-usage'])
        context=browser.new_context(viewport={'width':1440,'height':900},service_workers='block')
        context.add_init_script('''Object.defineProperty(navigator,'clipboard',{
          configurable:true,value:{writeText:async text=>{window.__copied=text;}}});''')
        page=context.new_page()
        errors,remote=[],[]
        page.on('pageerror',lambda e:errors.append(str(e)))
        page.on('request',lambda r:remote.append(r.url) if not r.url.startswith(BASE) else None)
        page.goto(BASE+'/',wait_until='load')
        expect(page.locator('#heroHeading')).to_contain_text('Your JSON is valid')
        assert page.locator('html').get_attribute('lang')=='en'
        assert page.locator('#losslessMode').is_checked()
        assert page.locator('#virtualTreeMode').is_checked()
        # First-run without registration: an actual finding, not a fake static badge.
        page.locator('#trySampleHero').click()
        expect(page.locator('#status')).to_contain_text('Inspection complete',timeout=20000)
        expect(page.locator('#issuesPanel [data-rule="JSON.UNSAFE_INTEGER"]')).to_have_count(1)
        expect(page.locator('#issuesPanel')).to_contain_text('9007199254740993')
        assert page.locator('#jsonInput').input_value()=='{"orderId":9007199254740993,"status":"paid"}'
        page.locator('#issuesPanel .issue-copy').first.click()
        page.wait_for_function('window.__copied === \"9007199254740993\"')
        page.locator('#issuesPanel .issue-locate').first.click()
        page.wait_for_function('document.querySelector(\"#jsonInput\").value.substring(document.querySelector(\"#jsonInput\").selectionStart,document.querySelector(\"#jsonInput\").selectionEnd) === \"9007199254740993\"')
        # Escaped duplicate names are colliding after JSON string decoding.
        page.locator('[data-demo="escaped"]').click()
        expect(page.locator('#status')).to_contain_text('Inspection complete',timeout=20000)
        issue=page.locator('#issuesPanel [data-rule="JSON.DUPLICATE_KEY"]')
        expect(issue).to_have_count(1)
        assert '\\u0061' in page.locator('#jsonInput').input_value()
        issue.locator('.issue-locate').click()
        assert page.locator('#jsonInput').evaluate('(el)=>el.value.substring(el.selectionStart,el.selectionEnd)') == '"\\u0061"'
        issue.locator('.issue-copy').click()
        page.wait_for_function('(expected) => window.__copied === expected', arg='"\\u0061"')
        # No silently changed exact source on format.
        page.locator('#formatBtn').click()
        expect(page.locator('#status')).to_contain_text('Inspection complete',timeout=20000)
        assert '\\u0061' in page.locator('#jsonInput').input_value()
        # Language switch keeps source and switches user-visible findings.
        page.locator('#languageSelect').select_option('zh')
        expect(page.locator('#issuesPanel')).to_contain_text('重复对象属性')
        assert '\\u0061' in page.locator('#jsonInput').input_value()
        page.locator('#languageSelect').select_option('en')
        expect(page.locator('#issuesPanel')).to_contain_text('Duplicate object property')
        # JSON-looking HTML must remain inert text and no elements injected.
        page.locator('#jsonInput').fill('{"payload":"<img src=x onerror=alert(1)>"}')
        page.locator('#parseBtn').click()
        expect(page.locator('#status')).to_contain_text('Inspection complete',timeout=20000)
        expect(page.locator('#issuesPanel')).to_contain_text('No findings from enabled checks')
        assert page.locator('#jsonDisplay img').count()==0
        # Legacy escape hatch remains; never silently convert from Worker to Number.
        page.locator('#advancedEngines summary').click()
        page.locator('#losslessMode').uncheck()
        page.locator('#jsonInput').fill('{"ok":true}')
        page.locator('#parseBtn').click()
        expect(page.locator('#status')).to_contain_text('解析成功',timeout=12000)
        assert not errors,errors
        assert not remote,remote
        print('PRODUCT-01/02 Chromium PASS: first value, evidence, escaped keys, exact copy, i18n, XSS, fallback, privacy')
        browser.close()


if __name__=='__main__':run()
