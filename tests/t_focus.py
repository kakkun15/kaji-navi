# 条件は「開始の集中力」だけ(光★3 決め打ち)。前の版の保存(Lv・ハンマー)から引き継げるか、集中力で左右打ちが出るか
from playwright.sync_api import sync_playwright
with sync_playwright() as p:
    b=p.chromium.launch(); errs=[]
    ctx=b.new_context(viewport={'width':390,'height':844})
    ctx.add_init_script("if(!sessionStorage.getItem('x')){ sessionStorage.setItem('x','1'); localStorage.removeItem('kajiNaviCfgV2'); localStorage.setItem('kajiNaviCfgV1', JSON.stringify({level:76, hammer:'hikari', star:3, fadj:0})); localStorage.removeItem('kajiNaviV1'); }")
    pg=ctx.new_page(); pg.on('pageerror', lambda e: errs.append(str(e)))
    pg.goto('file://' + __import__('os').path.abspath(__import__('os').path.join(__import__('os').path.dirname(__file__), '..', 'dist', 'app.html'))); pg.wait_for_function('window.__navi && window.__navi.qs')
    techs = "[...new Set(__navi.G.acts.map(a=>a.t.id))].join(',')"
    print('前の保存(Lv76)から', pg.evaluate("JSON.stringify(__navi.cfg)"), 's.F', pg.evaluate("__navi.s.F"), '左右打ち', 'sayuu' in pg.evaluate(techs))
    pg.click('#cfgB'); pg.fill('#cfF','253'); pg.click('#cfgOk'); pg.wait_for_timeout(300)
    print('253 にした', pg.evaluate("JSON.stringify(__navi.cfg)"), 's.F', pg.evaluate("__navi.s.F"), '左右打ち', 'sayuu' in pg.evaluate(techs), pg.inner_text('#cfgNote'))
    pg.reload(); pg.wait_for_function('window.__navi && window.__navi.qs')
    print('再読み込み後', pg.evaluate("JSON.stringify(__navi.cfg)"), 's.F', pg.evaluate("__navi.s.F"))
    pg.click('#cfgB'); pg.screenshot(path='/tmp/focus_sheet.png')
    print('errors', errs); b.close()
