# 叩いた後の値の入れ方(リール / ボタン)・戻りのシート・手直しの見当・「最初から」の確認。python3 tests/t_input_btn.py
# スマホ縦(390x844・タッチ)で、リールとボタンの両方を試す。スクショは OUT(既定 /tmp)に出す
import os, json
from playwright.sync_api import sync_playwright
OUT = os.environ.get('OUT', '/tmp')
URL = 'file://' + os.path.abspath(os.path.join(os.path.dirname(__file__), '..', 'dist', 'app.html'))
ng = []
def chk(name, ok):
    print(('OK ' if ok else 'NG ') + name)
    if not ok: ng.append(name)

def idle(pg): pg.wait_for_function('window.__navi && !window.__navi.busy && (window.__navi.qs || Array.isArray(window.__navi.s.lit) || window.__navi.s.dead)')
def shown(pg): return pg.evaluate("document.getElementById('reelM').classList.contains('show')")
def act(pg, tid, j):   # 技 tid でマス j を含む手を打つ(シートが開く)
    pg.evaluate("([t, j]) => __navi.startAct(__navi.G.acts.find(x => x.t.id === t && x.tg.includes(j)))", [tid, j])

def run(b, mode):
    errs = []
    ctx = b.new_context(viewport={'width': 390, 'height': 844}, has_touch=True, is_mobile=True, device_scale_factor=2)
    cfg = {'focus': 253} if mode == 'reel' else {'focus': 253, 'input': 'btn'}
    ctx.add_init_script("if(!sessionStorage.getItem('x')){ sessionStorage.setItem('x','1'); localStorage.clear(); localStorage.setItem('kajiNaviCfgV2', '%s'); localStorage.setItem('kajiNaviPowerV1','normal'); }" % json.dumps(cfg))
    pg = ctx.new_page(); pg.on('pageerror', lambda e: errs.append(str(e)))
    pg.goto(URL); pg.wait_for_function('window.__navi && window.__navi.qs')
    chk(f'[{mode}] 設定の入れ方', pg.evaluate('__navi.cfg.input') == mode)
    pg.select_option('#item', 'hidane'); pg.wait_for_function('window.__navi.item==="hidane"'); idle(pg)
    base = "s => { s.first = false; s.temp = 1250; s.F = 200; s.lit = null; s.v = [150, 200, 170, 200, 170, 110]; }"
    pg.evaluate(f"__navi.mut({base})"); idle(pg)

    # --- 1マス(たたく 左上) ---
    act(pg, 'tataku', 0); pg.wait_for_timeout(200)
    chk(f'[{mode}] 1マス: シートが開く', shown(pg))
    # 外(暗い所)を触っても閉じない
    pg.touchscreen.tap(195, 30); pg.wait_for_timeout(200)
    chk(f'[{mode}] 外を触っても閉じない', shown(pg) and pg.evaluate('!!__navi.pend'))
    if mode == 'btn':
        chk('[btn] 1マス: 決定ボタンは出ない', not pg.is_visible('#reelOk'))
        hs = pg.evaluate("[...document.querySelectorAll('#reels .vbs button')].map(b => b.getBoundingClientRect().height)")
        chk(f'[btn] ボタンの高さ 44px 以上({min(hs):.0f}px・{len(hs)}個)', min(hs) >= 44)
        pg.screenshot(path=f'{OUT}/input_btn_one.png')
        k = pg.evaluate("(() => { const p = __navi.pend.per[0]; return p.its.findIndex(x => x.tag !== 'c'); })()")
        w = pg.evaluate(f"__navi.pend.per[0].its[{k}].w")
        pg.click(f'#reels .vbs button[data-k="{k}"]'); pg.wait_for_timeout(200)
    else:
        w = pg.evaluate("__navi.pend.per[0].its[__navi.pend.sel[0]].w")
        pg.screenshot(path=f'{OUT}/input_reel_one.png')
        pg.click('#reelOk'); pg.wait_for_timeout(200)
    chk(f'[{mode}] 1マス: 押したら確定して閉じる(左上 {w})', not shown(pg) and pg.evaluate('__navi.s.v[0]') == w)
    idle(pg)

    # --- 何マス(超4連打ち 上の4マス) ---
    pg.evaluate(f"__navi.mut({base})"); idle(pg)
    act(pg, 'chouyon', 0); pg.wait_for_timeout(200)
    tg = pg.evaluate("__navi.pend.per.map(p => p.j).sort((a, b) => a - b)")
    if mode == 'btn':
        chk(f'[btn] 何マス: 最初のマス {tg[0]} が光る', pg.evaluate("document.querySelector('#reels .mb.cur').dataset.j") == str(tg[0]))
        chk('[btn] 何マス: 全部入れるまで決定は押せない', pg.is_disabled('#reelOk'))
        picked = {}
        for n, j in enumerate(tg):
            cur = int(pg.evaluate("document.querySelector('#reels .mb.cur').dataset.j"))
            chk(f'[btn] 何マス: {n + 1}つ目は {j} へ自動で進む', cur == j)
            k = pg.evaluate(f"__navi.pend.per.find(p => p.j === {j}).its.findIndex(x => x.tag !== 'c')") + n % 2
            picked[j] = pg.evaluate(f"__navi.pend.per.find(p => p.j === {j}).its[{k}].w")
            pg.click(f'#reels .vbs button[data-k="{k}"]'); pg.wait_for_timeout(100)
        chk('[btn] 何マス: 全部埋まったら決定が押せる', not pg.is_disabled('#reelOk') and shown(pg))
        # 盤面のマスを押して入れ直す
        pg.click(f'#reels .mb[data-j="{tg[0]}"]'); pg.wait_for_timeout(100)
        chk('[btn] 何マス: マスを押すとそのマスへ飛ぶ', pg.evaluate("document.querySelector('#reels .mb.cur').dataset.j") == str(tg[0]))
        k = pg.evaluate(f"__navi.pend.per.find(p => p.j === {tg[0]}).its.findIndex(x => x.tag !== 'c')") + 2
        picked[tg[0]] = pg.evaluate(f"__navi.pend.per.find(p => p.j === {tg[0]}).its[{k}].w")
        pg.click(f'#reels .vbs button[data-k="{k}"]'); pg.wait_for_timeout(100)
        chk('[btn] 何マス: 入れ直しても決定前は確定しない', shown(pg) and pg.evaluate(f'__navi.s.v[{tg[0]}]') == 150)
        pg.screenshot(path=f'{OUT}/input_btn_multi.png')
    else:
        picked = {j: pg.evaluate(f"(() => {{ const p = __navi.pend.per.find(p => p.j === {j}); return p.its[__navi.pend.sel[{j}]].w; }})()") for j in tg}
        pg.screenshot(path=f'{OUT}/input_reel_multi.png')
    pg.click('#reelOk'); pg.wait_for_timeout(200)
    chk(f'[{mode}] 何マス: 決定で入る {picked}', not shown(pg) and all(pg.evaluate(f'__navi.s.v[{j}]') == v for j, v in picked.items()))
    idle(pg)

    # --- 外から commitReels({...}) ---
    pg.evaluate(f"__navi.mut({base})"); idle(pg)
    act(pg, 'chouyon', 0); pg.wait_for_timeout(100)
    vals = {j: 150 + j for j in tg}
    pg.evaluate(f"__navi.commitReels({json.dumps({str(k): v for k, v in vals.items()})})"); pg.wait_for_timeout(200)
    chk(f'[{mode}] commitReels で確定', not shown(pg) and pg.evaluate('__navi.pend') is None and all(pg.evaluate(f'__navi.s.v[{j}]') == v for j, v in vals.items()))
    idle(pg)

    # --- 手直しで見当がリセット ---
    pg.evaluate("__navi.mut(s => { const z = __navi.G.cells[0]; s.lit = null; s.bel[0] = s.bel[0].map((_, q) => q === 3 ? 1 : 0); })"); idle(pg)
    pg.click('#board .cell[data-i="0"]'); pg.fill('#numI', '160'); pg.click('#numOk'); idle(pg)
    bel = pg.evaluate('__navi.s.bel[0]')
    chk(f'[{mode}] 手直しで見当が一様に戻る(候補 {sum(1 for x in bel if x > 1e-9)}/{len(bel)})', pg.evaluate('__navi.s.v[0]') == 160 and max(bel) - min(bel) < 1e-12)

    # --- 「最初から」の確認 ---
    n0 = pg.evaluate('__navi.hist.length')
    pg.once('dialog', lambda d: d.dismiss()); pg.click('#reset'); pg.wait_for_timeout(200)
    chk(f'[{mode}] 最初から: やめたら消えない', pg.evaluate('__navi.hist.length') == n0 and not pg.evaluate('__navi.s.first'))
    msg = []
    pg.once('dialog', lambda d: (msg.append(d.message), d.accept())); pg.click('#reset'); idle(pg)
    chk(f'[{mode}] 最初から: はいで始め直す({msg[0] if msg else "確認なし"})', bool(msg) and pg.evaluate('__navi.s.first'))
    pg.evaluate('__navi.reset(250)'); idle(pg)
    chk(f'[{mode}] 外からの reset は確認なし', pg.evaluate('__navi.s.F') == 250)

    # --- 戻り(虹色のオーブ) ---
    pg.select_option('#item', 'orb'); pg.wait_for_function('window.__navi.item==="orb"'); idle(pg)
    def ret_case():
        pg.evaluate("__navi.mut(s => { const G = __navi.G; s.first = false; s.temp = 450; s.F = 200; s.lit = null; for(const i of G.active){ const z = G.cells[i]; s.v[i] = Math.floor(z[0] * 0.7) + i; } })"); idle(pg)
        j = pg.evaluate("__navi.G.active[0]"); v = pg.evaluate(f'__navi.s.v[{j}]') + 7
        act(pg, 'tataku', j); pg.evaluate(f"__navi.commitReels({{ {j}: {v} }})"); pg.wait_for_timeout(200)
        return j, v
    hj, hv = ret_case()
    chk(f'[{mode}] 戻り: シートが出る', shown(pg) and pg.evaluate('!!(__navi.pend && __navi.pend.ret)'))
    pred = pg.evaluate('__navi.pend.retPred')
    big = pg.inner_text('#reelBig')
    chk(f'[{mode}] 戻り: 青いシートと大見出し「{big}」', pg.evaluate("document.querySelector('#reelM .sheet').classList.contains('ret')") and big.startswith('戻り '))
    chk(f'[{mode}] 戻り: 後ろの盤面が新しい値', pg.inner_text(f'#board .cell[data-i="{hj}"] .v') == str(hv))
    chk(f'[{mode}] 戻り: 予想のマス {pred} が選ばれている', pg.evaluate("document.querySelector('#reels .mb.cur').dataset.j") == str(pred))
    other = pg.evaluate(f"__navi.G.active.find(i => i !== {pred})")
    ov = pg.evaluate(f'__navi.s.v[{other}]')
    pg.click(f'#reels .mb[data-j="{other}"]'); pg.wait_for_timeout(150)
    ws = pg.evaluate("__navi.pend.per[0].its.map(x => x.w)")
    chk(f'[{mode}] 戻り: マスを選び直すと候補が出直す({ov} → {ws})', pg.evaluate('__navi.pend.per[0].j') == other and ws == sorted(max(0, ov - d) for d in range(12, 17)))
    pg.touchscreen.tap(195, 30); pg.wait_for_timeout(150)
    chk(f'[{mode}] 戻り: 外を触っても閉じない', shown(pg))
    pg.screenshot(path=f'{OUT}/input_{mode}_ret.png')
    if mode == 'btn':
        chk(f'[btn] 戻り: 値は5つのボタン', pg.locator('#reels .vbs button').count() == 5)
        pg.click('#reels .vbs button[data-k="1"]'); w = ws[1]
    else:
        w = pg.evaluate("__navi.pend.per[0].its[__navi.pend.sel[__navi.pend.per[0].j]].w"); pg.click('#reelOk')
    pg.wait_for_timeout(200)
    log = pg.evaluate("JSON.parse(localStorage.getItem('kajiNaviRetLog') || '[]')")
    last = log[-1] if log else {}
    chk(f'[{mode}] 戻り: 選んだマスに入る({other} = {w})', not shown(pg) and pg.evaluate(f'__navi.s.v[{other}]') == w and pg.evaluate(f'__navi.s.v[{pred}]') > w - 100)
    chk(f'[{mode}] 戻り: 記録 {json.dumps(last, ensure_ascii=False)}', last.get('pred') == pred and last.get('pick') == other and last.get('after') == w and len(last.get('before', [])) == 6 and last.get('before')[other] == ov and last.get('temp') == 400)
    idle(pg)
    # やめる: 平均の −14 とトースト
    ret_case(); pred = pg.evaluate('__navi.pend.retPred'); fr = pg.evaluate(f'__navi.s.v[{pred}]')
    pg.click('#reelCancel'); pg.wait_for_timeout(150)
    chk(f'[{mode}] 戻り: やめると −14 とトースト「{pg.inner_text("#toast")}」', pg.evaluate(f'__navi.s.v[{pred}]') == fr - 14 and '−14' in pg.inner_text('#toast'))
    idle(pg)
    # 外から commitReels
    ret_case(); pred = pg.evaluate('__navi.pend.retPred')
    pg.evaluate(f"__navi.commitReels({{ {pred}: 33 }})"); pg.wait_for_timeout(150)
    chk(f'[{mode}] 戻り: commitReels で確定', not shown(pg) and pg.evaluate(f'__navi.s.v[{pred}]') == 33 and pg.evaluate("JSON.parse(localStorage.getItem('kajiNaviRetLog')).length") == 2)
    # 設定画面: 入れ方と記録のコピー
    pg.click('#cfgB2'); pg.wait_for_timeout(150)
    chk(f'[{mode}] 設定: 入れ方の選択', pg.evaluate(f"document.querySelector('#cfIn button[data-v=\"{mode}\"]').getAttribute('aria-pressed')") == 'true')
    chk(f'[{mode}] 設定: 記録のコピー「{pg.inner_text("#retLogB")}」', '2件' in pg.inner_text('#retLogB'))
    pg.click('#cfgCancel')
    chk(f'[{mode}] .tres は隠れている', not pg.is_visible('#tres'))
    chk(f'[{mode}] エラー無し {errs}', not errs)
    ctx.close()

with sync_playwright() as p:
    b = p.chromium.launch(executable_path='/opt/pw-browsers/chromium')
    for m in ['reel', 'btn']: run(b, m)
    # 古い保存(input 無し)はリール。設定でボタンにすると保存される
    ctx = b.new_context(viewport={'width': 390, 'height': 844}, has_touch=True, is_mobile=True)
    ctx.add_init_script("if(!sessionStorage.getItem('x')){ sessionStorage.setItem('x','1'); localStorage.clear(); localStorage.setItem('kajiNaviCfgV2', JSON.stringify({focus:250, off:['sayuu']})); }")
    pg = ctx.new_page(); pg.goto(URL); pg.wait_for_function('window.__navi && window.__navi.qs')
    chk('古い保存はリール', pg.evaluate('__navi.cfg.input') == 'reel' and pg.evaluate('__navi.cfg.off') == ['sayuu'])
    pg.click('#cfgB2'); pg.click('#cfIn button[data-v="btn"]'); pg.click('#cfgOk'); pg.wait_for_timeout(100)
    sv = pg.evaluate("JSON.parse(localStorage.getItem('kajiNaviCfgV2'))")
    chk(f'ボタンにすると保存される {sv}', sv.get('input') == 'btn' and sv.get('focus') == 250 and sv.get('off') == ['sayuu'])
    pg.evaluate('__navi.setStartFocus(251)')
    chk('setStartFocus でも入れ方は残る', pg.evaluate('__navi.cfg.input') == 'btn')
    b.close()
print('ALL OK' if not ng else f'NG {len(ng)}: {ng}')
