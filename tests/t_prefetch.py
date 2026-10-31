# 先に計算しておく(最強): 火力上げの後と、光ったマスが決まった後に、計算済みの答えがすぐ出るか。答えが先読みなしと同じか。python3 tests/t_prefetch.py
import os, time
from playwright.sync_api import sync_playwright
with sync_playwright() as p:
    b = p.chromium.launch(executable_path='/opt/pw-browsers/chromium'); errs = []
    ctx = b.new_context(viewport={'width': 1000, 'height': 900})
    ctx.add_init_script("if(!sessionStorage.getItem('x')){ sessionStorage.setItem('x','1'); localStorage.clear(); localStorage.setItem('kajiNaviCfgV2', JSON.stringify({focus:253})); localStorage.setItem('kajiNaviPowerV1','max'); }")
    pg = ctx.new_page(); pg.on('pageerror', lambda e: errs.append(str(e)))
    pg.goto('file://' + os.path.abspath(os.path.join(os.path.dirname(__file__), '..', 'dist', 'app.html')))
    pg.wait_for_function('window.__navi && window.__navi.qs', timeout=60000)
    pg.select_option('#item', 'hidane'); pg.wait_for_function('window.__navi.item==="hidane" && !window.__navi.busy && window.__navi.qs', timeout=60000)
    best = lambda: pg.evaluate("(() => { const a = __navi.qs[0].a; return a ? a.t.name + ':' + a.tg.join(',') + ' ' + (__navi.qs[0].q2 ?? __navi.qs[0].q).toFixed(5) : 'stop'; })()")
    # 火力上げが推奨される局面を探す
    found = False
    for k in range(30):
        pg.evaluate("""k => __navi.mut(s => { let a = 31 + k * 977; const r = () => (a = (a * 1103515245 + 12345) % 2147483648) / 2147483648; const G = __navi.G;
          s.first = false; s.temp = 50 * (20 + Math.floor(r() * 16)); if (s.temp % 200 === 0) s.temp += 50; s.F = 120 + Math.floor(r() * 120); s.lit = null;
          for (const i of G.active) s.v[i] = Math.floor(G.cells[i][0] * (0.3 + r() * 0.5)); })""", k)
        pg.wait_for_function('!window.__navi.busy && window.__navi.qs', timeout=60000)
        if pg.evaluate("!!(__navi.qs[0].a && !__navi.qs[0].a.t.area)"): found = True; break
    print('火力上げ・冷やし込みが推奨の局面', found, best())
    if found:
        pg.wait_for_timeout(6000)       # 裏で先に読む時間
        t = time.time(); pg.evaluate("__navi.startAct(__navi.qs[0].a)")
        if pg.evaluate("Array.isArray(__navi.s.lit)"): print('  (打った後に光った → 1つ目のマスを選ぶ)'); t = time.time(); pg.evaluate("__navi.mut(s => { s.lit = s.lit[0]; })")
        pg.wait_for_function('!window.__navi.busy && window.__navi.qs', timeout=60000)
        print(f'押してから答えまで {int((time.time()-t)*1000)}ms / 先読みが当たった', pg.evaluate("__navi.lastCalc && __navi.lastCalc.pre"), '/ 推奨', best())
    # 光ったマス
    pg.evaluate("""__navi.mut(s => { const G = __navi.G; s.first = false; s.temp = 1400; s.F = 150; for (const i of G.active) s.v[i] = Math.floor(G.cells[i][0] * 0.6); s.lit = G.active.slice(); })""")
    pg.wait_for_timeout(9000)
    t = time.time(); pg.evaluate("__navi.mut(s => { s.lit = s.lit[2]; })"); pg.wait_for_function('!window.__navi.busy && window.__navi.qs', timeout=60000)
    print(f'光ったマスを決めてから答えまで {int((time.time()-t)*1000)}ms / 推奨', best())
    print('errors', errs); b.close()
