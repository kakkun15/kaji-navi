# 「会心が出た」スイッチ: 2マスの技で、片方だけオンにして値を入れると、そのマスだけ会心として見当が絞られる。小窓からも同じ。python3 tests/t_crit.py
# (前の「今の会心!」は画面に出さない。main と同じ結果になるかは tests/t_rebuild.py)
import os, json
from playwright.sync_api import sync_playwright
with sync_playwright() as p:
    b = p.chromium.launch(executable_path='/opt/pw-browsers/chromium'); errs = []
    ctx = b.new_context(viewport={'width': 1000, 'height': 900})
    ctx.add_init_script("if(!sessionStorage.getItem('x')){ sessionStorage.setItem('x','1'); localStorage.clear(); localStorage.setItem('kajiNaviCfgV2', JSON.stringify({focus:253})); localStorage.setItem('kajiNaviPowerV1','normal'); }")
    pg = ctx.new_page(); pg.on('pageerror', lambda e: errs.append(str(e)))
    pg.goto('file://' + os.path.abspath(os.path.join(os.path.dirname(__file__), '..', 'dist', 'app.html')))
    pg.wait_for_function('window.__navi && window.__navi.qs')
    pg.select_option('#item', 'hidane'); pg.wait_for_function('window.__navi.item==="hidane" && !window.__navi.busy && window.__navi.qs')
    BASE = "__navi.mut(s => { s.first = false; s.temp = 1250; s.F = 200; s.lit = null; s.v = [150, 200, 170, 200, 170, 110]; })"
    START = "(() => { const a = __navi.G.acts.find(x => x.t.id === 'naname' && x.tg.includes(1)); __navi.startAct(a); })()"
    cand = lambda j: pg.evaluate(f"__navi.s.bel[{j}].filter(x => x > 1e-9).length")
    pg.evaluate(BASE); pg.wait_for_function('!window.__navi.busy && window.__navi.qs')
    # 2マスの技(ななめ打ち): 1マス目は会心オン、2マス目はオフ
    pg.evaluate(START)
    tg = pg.evaluate("__navi.pend.per.map(p => p.j).sort((a, b) => a - b)"); print('叩くマス', tg, '/ 今の会心!', pg.locator('#critB').is_visible())
    off = pg.evaluate("[...document.querySelectorAll('#dVals button')].map(b => +b.textContent)")
    pg.click('#critSw'); on = pg.evaluate("[...document.querySelectorAll('#dVals button')].map(b => +b.textContent)")
    print('オフの値', off, '/ オンの値', on, '/ スイッチ', pg.get_attribute('#critSw', 'aria-checked'))
    pg.locator('#dVals button').last.click()
    print('次のマスではオフに戻る', pg.get_attribute('#critSw', 'aria-checked'), '/ 今のマス', pg.evaluate('__navi.pend.cur'))
    pg.locator('#dVals button').nth(1).click(); pg.click('#dOk')
    if pg.evaluate('Array.isArray(__navi.s.lit)'): pg.evaluate('__navi.mut(s => { s.lit = s.lit[0]; })')
    pg.wait_for_function('!window.__navi.busy && window.__navi.qs')
    print(f'会心で入れたマス {tg[0]}: 見当の候補 {cand(tg[0])} / もう片方 {tg[1]}: {cand(tg[1])} / 印', pg.evaluate('JSON.stringify(__navi.s.critMark)'))
    # 小窓
    pg.click('#gearB'); pg.click('#pipB'); pg.wait_for_timeout(500)
    if pg.evaluate("!!(window.documentPictureInPicture && documentPictureInPicture.window)"):
        D = "documentPictureInPicture.window.document"
        pg.evaluate(BASE); pg.wait_for_function('!window.__navi.busy && window.__navi.qs'); pg.evaluate(START); pg.wait_for_timeout(200)
        pg.evaluate(f"{D}.getElementById('pSw').click()"); pg.wait_for_timeout(200)
        print('小窓のスイッチ', pg.evaluate(f"{D}.getElementById('pSw').getAttribute('aria-checked')"), '/ 本画面も', pg.get_attribute('#critSw', 'aria-checked'))
        pg.evaluate(f"[...{D}.querySelectorAll('.pv button')].pop().click()"); pg.wait_for_timeout(150)
        pg.evaluate(f"{D}.querySelectorAll('.pv button')[1].click()"); pg.wait_for_timeout(150)
        pg.evaluate(f"{D}.getElementById('pOk').click()"); pg.wait_for_timeout(300)
        if pg.evaluate('Array.isArray(__navi.s.lit)'): pg.evaluate('__navi.mut(s => { s.lit = s.lit[0]; })')
        pg.wait_for_function('!window.__navi.busy && window.__navi.qs')
        print(f'小窓で会心にしたマス {tg[0]}: 候補 {cand(tg[0])} / もう片方 {tg[1]}: {cand(tg[1])}')
    print('errors', errs); b.close()
