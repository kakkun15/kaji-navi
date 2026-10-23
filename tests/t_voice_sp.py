from playwright.sync_api import sync_playwright
import sys
url = sys.argv[1] if len(sys.argv)>1 else 'file://' + __import__('os').path.abspath(__import__('os').path.join(__import__('os').path.dirname(__file__), '..', 'dist', 'app.html'))
with sync_playwright() as p:
    b=p.chromium.launch(executable_path='/opt/pw-browsers/chromium', args=['--autoplay-policy=user-gesture-required']); errs=[]
    ctx=b.new_context(viewport={'width':390,'height':844}, device_scale_factor=2, has_touch=True, is_mobile=True)
    ctx.add_init_script("if(!localStorage.getItem('kajiNaviCfgV2')) localStorage.setItem('kajiNaviCfgV2', JSON.stringify({focus:245}))")  # 前に使ったことがある人(初回の質問を出さない)
    pg=ctx.new_page(); pg.on('pageerror', lambda e: errs.append(str(e))); pg.on('console', lambda m: m.type=='error' and errs.append(m.text))
    pg.goto(url); pg.wait_for_function('window.__navi && window.__navi.qs'); pg.wait_for_timeout(800)
    print('触る前', pg.evaluate("JSON.stringify({log: __navi.vlog, how: __navi.vhow})"))
    def wait():
        pg.wait_for_function('window.__navi.qs || Array.isArray(window.__navi.s.lit) || window.__navi.s.dead'); pg.wait_for_timeout(1200)
    pg.select_option('#item','hidane'); wait()
    pg.tap('#vB'); pg.wait_for_timeout(200); pg.tap('#vB'); wait()   # オフ→オン(触った)
    print('触った後', pg.evaluate("JSON.stringify({log: __navi.vlog, how: __navi.vhow})"))
    for k in range(6):
        if pg.evaluate("Array.isArray(__navi.s.lit)"):
            i=pg.evaluate("__navi.s.lit[0]"); pg.tap(f'.cell[data-i="{i}"]'); wait(); continue
        if pg.evaluate("!document.getElementById('chainB').hidden"): pg.tap('#chainB'); wait(); continue
        pg.tap('#go'); pg.wait_for_timeout(400)
        if pg.evaluate("document.getElementById('reelM').classList.contains('show')"): pg.tap('#reelOk')
        wait()
    st = pg.evaluate("JSON.stringify({log: __navi.vlog, how: __navi.vhow, ctx: (window.__navi && 1)})")
    print('打った後', st)
    print('収録の無い文', pg.evaluate("JSON.stringify(__navi.vlog.filter(t => !AR_CLIPS[t]))"))
    print('errors', errs); b.close()
