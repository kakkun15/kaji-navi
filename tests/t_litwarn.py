# 光ったマスがあるのに推奨がそこを叩かない時の注意(本画面・小窓)と、小窓の必殺の切り替え。python3 tests/t_litwarn.py
import os
from playwright.sync_api import sync_playwright
OUT = os.environ.get('OUT', '/tmp')
with sync_playwright() as p:
    b = p.chromium.launch(executable_path='/opt/pw-browsers/chromium'); errs = []
    ctx = b.new_context(viewport={'width': 1100, 'height': 900})
    ctx.add_init_script("if(!sessionStorage.getItem('x')){ sessionStorage.setItem('x','1'); localStorage.clear(); localStorage.setItem('kajiNaviCfgV2', JSON.stringify({focus:253})); localStorage.setItem('kajiNaviPowerV1','normal'); }")
    pg = ctx.new_page(); pg.on('pageerror', lambda e: errs.append(str(e)))
    pg.goto('file://' + os.path.abspath(os.path.join(os.path.dirname(__file__), '..', 'dist', 'app.html')))
    pg.wait_for_function('window.__navi && window.__navi.qs')
    pg.select_option('#item', 'hidane'); pg.wait_for_function('window.__navi.item==="hidane" && !window.__navi.busy && window.__navi.qs')
    # 光ったマスがある局面をいくつか作り、注意が出る条件と表示が合うか
    ok = bad = shown = 0; kfirst = None
    MUT = None
    for k in range(40):
        MUT = """k => __navi.mut(s => { const G = __navi.G; let a = 17 + k * 7919; const r = () => (a = (a * 1103515245 + 12345) % 2147483648) / 2147483648;
          s.first = false; s.temp = 200 * (2 + Math.floor(r() * 7)); s.F = 60 + Math.floor(r() * 150);
          for (const i of G.active) { const z = G.cells[i]; s.v[i] = Math.floor(z[0] * (0.4 + r() * 0.55)); }
          const c = G.active.filter(i => s.v[i] < G.cells[i][0]); s.lit = c[Math.floor(r() * c.length)]; })"""
        pg.evaluate(MUT, k)
        pg.wait_for_function('!window.__navi.busy && window.__navi.qs')
        need = pg.evaluate("(() => { const a = __navi.qs[0].a, s = __navi.s; return !!(a && a.t.area && typeof s.lit === 'number' && !a.tg.includes(s.lit)); })()")
        has = pg.locator('#rec .lw').count() > 0
        if need == has: ok += 1
        else: bad += 1
        if has:
            shown += 1
            if shown == 1:
                kfirst = k
                print('注意の文:', pg.inner_text('#rec .lw'))
                pg.locator('.card').first.screenshot(path=f'{OUT}/litwarn_main.png') if pg.locator('.card').count() else pg.screenshot(path=f'{OUT}/litwarn_main.png')
    print(f'局面40: 一致 {ok} / ずれ {bad} / 注意が出た {shown}')
    # 小窓(Document Picture-in-Picture)
    has_pip = pg.evaluate("'documentPictureInPicture' in window")
    print('小窓あり', has_pip)
    if has_pip and shown:
        pg.click('#pipB'); pg.wait_for_timeout(500)
        pw = pg.evaluate("!!documentPictureInPicture.window")
        print('小窓が開いた', pw)
        if pw:
            pg.evaluate(MUT, kfirst); pg.wait_for_function('!window.__navi.busy && window.__navi.qs'); pg.wait_for_timeout(200)
            pp = [x for x in ctx.pages if x != pg]
            if pp:
                pp[0].screenshot(path=f'{OUT}/litwarn_pip.png')
                pp[0].set_viewport_size({'width': 360, 'height': 900}); pg.wait_for_timeout(200); pp[0].screenshot(path=f'{OUT}/litwarn_pip_narrow.png')
            txt = pg.evaluate("documentPictureInPicture.window.document.body.innerText")
            print('小窓の注意', '⚠' in txt, '/ 必殺の行', [l for l in txt.split('\n') if l.startswith('必殺')])
            for _ in range(3):
                pg.evaluate("documentPictureInPicture.window.document.getElementById('pHs').click()"); pg.wait_for_timeout(200)
                print('  押した → s.hs', pg.evaluate("__navi.s.hs|0"), '本画面', pg.inner_text('#hsBt'), '小窓', pg.evaluate("documentPictureInPicture.window.document.getElementById('pHs').innerText"))
            alts = pg.evaluate("[...documentPictureInPicture.window.document.querySelectorAll('.alt')].map(b => b.innerText)")
            main = pg.evaluate("[...document.querySelectorAll('#alts button')].map(b => b.innerText)")
            print('小窓のほかの手', alts, '/ 本画面', main, '/ 同じ', [x.replace('\n',' ') for x in alts] == [x.replace('\n',' ') for x in main])
            want = pg.evaluate("__navi.qs[1].a.t.name")
            pg.evaluate("documentPictureInPicture.window.document.querySelector('.alt').click()"); pg.wait_for_timeout(300)
            print('ほかの手を押した → 打った手', want, '/ 結果入力が開いた', pg.evaluate("!!__navi.pend"), '/ 温度', pg.evaluate("__navi.s.temp"))
    print('errors', errs); b.close()
