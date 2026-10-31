# 「今の会心!」: 2マスの技を打った後、片方を会心にすると、そのマスだけ見当が絞られる。小窓からも同じ。python3 tests/t_crit.py
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
    pg.evaluate("__navi.mut(s => { s.first = false; s.temp = 1250; s.F = 200; s.lit = null; s.v = [150, 200, 170, 200, 170, 110]; })")
    pg.wait_for_function('!window.__navi.busy && window.__navi.qs')
    print('打つ前 会心ボタン', pg.locator('#critB').is_visible())
    # 2マスの技(ななめ打ち)を打って、結果を入れる
    pg.evaluate("(() => { const a = __navi.G.acts.find(x => x.t.id === 'naname' && x.tg.includes(1)); __navi.startAct(a); })()")
    tg = pg.evaluate("__navi.pend.per.map(p => p.j)"); print('叩くマス', tg)
    vals = {j: pg.evaluate(f"__navi.s.v[{j}]") + 40 for j in tg}   # 会心っぽい伸び(+40)
    pg.evaluate(f"__navi.commitReels({json.dumps({str(k): v for k, v in vals.items()})})")
    print('温度', pg.evaluate('__navi.s.temp'), '光', pg.evaluate('JSON.stringify(__navi.s.lit)'))
    if pg.evaluate('Array.isArray(__navi.s.lit)'): pg.evaluate('__navi.mut(s => { s.lit = s.lit[0]; })')
    pg.wait_for_function('!window.__navi.busy && window.__navi.qs')
    j0 = tg[0]
    before = pg.evaluate(f"__navi.s.bel[{j0}].filter(x => x > 1e-9).length")
    other = pg.evaluate(f"JSON.stringify(__navi.s.bel[{tg[1]}])")
    print('入れた後 会心ボタン', pg.locator('#critB').is_visible())
    pg.click('#critB'); print('マスを選ぶ欄', pg.locator('#critP').is_visible(), pg.inner_text('#critP'))
    pg.click(f'#critP button[data-j="{j0}"]'); pg.wait_for_function('!window.__navi.busy && window.__navi.qs')
    after = pg.evaluate(f"__navi.s.bel[{j0}].filter(x => x > 1e-9).length")
    print(f'会心にしたマス {j0}: 見当の候補 {before} → {after} / もう片方は変わらない', other == pg.evaluate(f"JSON.stringify(__navi.s.bel[{tg[1]}])"))
    # 戻す
    pg.click('#undo'); pg.wait_for_timeout(200)
    print('戻した後 候補', pg.evaluate(f"__navi.s.bel[{j0}].filter(x => x > 1e-9).length"), '/ ボタン', pg.locator('#critB').is_visible())
    # 小窓
    pg.click('#pipB'); pg.wait_for_timeout(500)
    if pg.evaluate("!!(window.documentPictureInPicture && documentPictureInPicture.window)"):
        D = "documentPictureInPicture.window.document"
        print('小窓のボタン', pg.evaluate(f"{D}.getElementById('pCrit') && {D}.getElementById('pCrit').innerText"))
        pg.evaluate(f"{D}.getElementById('pCrit').click()"); pg.wait_for_timeout(200)
        print('小窓の選ぶ欄', pg.evaluate(f"[...{D}.querySelectorAll('.cb')].map(x => x.innerText)"))
        pg.evaluate(f"{D}.querySelector('.cb[data-j=\"{tg[1]}\"]').click()"); pg.wait_for_function('!window.__navi.busy && window.__navi.qs'); pg.wait_for_timeout(200)
        print('小窓で会心にした後 残りのボタン', pg.evaluate(f"{D}.getElementById('pCrit') && {D}.getElementById('pCrit').innerText"), '/ 候補', pg.evaluate(f"__navi.s.bel[{tg[1]}].filter(x => x > 1e-9).length"))
    print('errors', errs); b.close()
