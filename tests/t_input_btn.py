# 叩いた後の値の入れ方(リール = シート / ボタン = 下の帯にじか入れ)・戻り・手直しの見当・「最初から」。python3 tests/t_input_btn.py
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
def act(pg, tid, j):   # 技 tid でマス j を含む手を打つ(リール: シートが開く / ボタン: 下の帯に値ボタン)
    pg.evaluate("([t, j]) => __navi.startAct(__navi.G.acts.find(x => x.t.id === t && x.tg.includes(j)))", [tid, j])

def run(b, mode):
    errs = []
    ctx = b.new_context(viewport={'width': 390, 'height': 844}, has_touch=True, is_mobile=True, device_scale_factor=2)
    cfg = {'focus': 253, 'input': 'reel2'} if mode == 'reel' else {'focus': 253}
    ctx.add_init_script("if(!sessionStorage.getItem('x')){ sessionStorage.setItem('x','1'); localStorage.clear(); localStorage.setItem('kajiNaviCfgV2', '%s'); localStorage.setItem('kajiNaviPowerV1','normal'); }" % json.dumps(cfg))
    pg = ctx.new_page(); pg.on('pageerror', lambda e: errs.append(str(e)))
    pg.goto(URL); pg.wait_for_function('window.__navi && window.__navi.qs')
    chk(f'[{mode}] 設定の入れ方', pg.evaluate('__navi.cfg.input') == mode)
    pg.select_option('#item', 'hidane'); pg.wait_for_function('window.__navi.item==="hidane"'); idle(pg)
    base = "s => { s.first = false; s.temp = 1250; s.F = 200; s.lit = null; s.v = [150, 200, 170, 200, 170, 110]; }"
    pg.evaluate(f"__navi.mut({base})"); idle(pg)

    # --- 1マス(たたく 左上) ---
    act(pg, 'tataku', 0); pg.wait_for_timeout(200)
    if mode == 'btn':
        chk('[btn] 1マス: シートは開かず、下の帯に値ボタン', not shown(pg) and pg.evaluate('!!__navi.pend') and pg.is_visible('#dVals'))
        chk('[btn] 1マス: 決定ボタンは出ない・やめるが出る', not pg.is_visible('#dOk') and not pg.is_visible('#reelOk') and pg.is_visible('#dCancel'))
        hs = pg.evaluate("[...document.querySelectorAll('#dVals button')].map(b => b.getBoundingClientRect().height)")
        chk(f'[btn] ボタンの高さ 44px 以上({min(hs):.0f}px・{len(hs)}個)', min(hs) >= 44)
        pg.screenshot(path=f'{OUT}/input_btn_one.png')
        k = pg.evaluate("(() => { const p = __navi.pend.per[0]; return p.its.findIndex(x => x.tag !== 'c'); })()")
        w = pg.evaluate(f"__navi.pend.per[0].its[{k}].w")
        pg.click(f'#dVals button[data-k="{k}"]'); pg.wait_for_timeout(200)
    else:
        chk(f'[{mode}] 1マス: シートが開く', shown(pg))
        # 外(暗い所)を触っても閉じない
        pg.touchscreen.tap(195, 30); pg.wait_for_timeout(200)
        chk(f'[{mode}] 外を触っても閉じない', shown(pg) and pg.evaluate('!!__navi.pend'))
        chk('[reel] シートの上の切り替えは出ない', not pg.is_visible('#inTog'))
        w = pg.evaluate("__navi.pend.per[0].its[__navi.pend.sel[0]].w")
        pg.screenshot(path=f'{OUT}/input_reel_one.png')
        pg.click('#reelOk'); pg.wait_for_timeout(200)
    chk(f'[{mode}] 1マス: 押したら確定して閉じる(左上 {w})', not shown(pg) and pg.evaluate('__navi.pend') is None and pg.evaluate('__navi.s.v[0]') == w)
    idle(pg)

    # --- 何マス(超4連打ち 上の4マス) ---
    pg.evaluate(f"__navi.mut({base})"); idle(pg)
    act(pg, 'chouyon', 0); pg.wait_for_timeout(200)
    tg = pg.evaluate("__navi.pend.per.map(p => p.j).sort((a, b) => a - b)")
    if mode == 'btn':
        CUR = "document.querySelector('#board .cell.cur').dataset.i"
        nk = lambda j, m: pg.evaluate(f"__navi.pend.per.find(p => p.j === {j}).its.map((x, k) => [x, k]).filter(o => o[0].tag !== 'c')[{m}][1]")   # 会心でなくても出る値の m 番目
        chk(f'[btn] 何マス: 盤面の最初のマス {tg[0]} が光る', pg.evaluate(CUR) == str(tg[0]))
        chk('[btn] 何マス: 全部入れるまで決定は出ない', not pg.is_visible('#dOk'))
        picked = {}
        for n, j in enumerate(tg):
            chk(f'[btn] 何マス: {n + 1}つ目は {j} へ自動で進む', int(pg.evaluate(CUR)) == j)
            k = nk(j, n % 2)
            picked[j] = pg.evaluate(f"__navi.pend.per.find(p => p.j === {j}).its[{k}].w")
            pg.click(f'#dVals button[data-k="{k}"]'); pg.wait_for_timeout(100)
        chk('[btn] 何マス: 全部埋まったら決定が出る', pg.is_visible('#dOk') and pg.evaluate('!!__navi.pend'))
        # 盤面の叩くマスを押して入れ直す
        pg.click(f'#board .cell[data-i="{tg[0]}"]'); pg.wait_for_timeout(100)
        chk('[btn] 何マス: マスを押すとそのマスへ飛ぶ', pg.evaluate(CUR) == str(tg[0]) and not pg.is_visible('#numM'))
        k = nk(tg[0], 2)
        picked[tg[0]] = pg.evaluate(f"__navi.pend.per.find(p => p.j === {tg[0]}).its[{k}].w")
        pg.click(f'#dVals button[data-k="{k}"]'); pg.wait_for_timeout(100)
        chk('[btn] 何マス: 入れ直しても決定前は確定しない', pg.evaluate('!!__navi.pend') and pg.evaluate(f'__navi.s.v[{tg[0]}]') == 150)
        chk(f'[btn] 何マス: 盤面に「今の値 → 入れた値」', pg.inner_text(f'#board .cell[data-i="{tg[0]}"] .v').replace(' ', '') == f'150→{picked[tg[0]]}')
        pg.screenshot(path=f'{OUT}/input_btn_multi.png')
        pg.click('#dOk'); pg.wait_for_timeout(200)
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

    # --- 「最初から」: 確認なし・「戻す」で元の局に戻る ---
    n0 = pg.evaluate('__navi.hist.length'); v0 = pg.evaluate('JSON.stringify(__navi.s.v)')
    dlg = []; pg.on('dialog', lambda d: (dlg.append(d.message), d.accept()))
    pg.click('#reset'); idle(pg)
    chk(f'[{mode}] 最初から: 確認なしで始め直す', not dlg and pg.evaluate('__navi.s.first') and n0 > 0)
    pg.click('#undo'); idle(pg)
    chk(f'[{mode}] 最初から: 戻すで元の局に戻る', pg.evaluate('JSON.stringify(__navi.s.v)') == v0 and pg.evaluate('__navi.hist.length') == n0)
    pg.click('#reset'); idle(pg)
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
    btn = mode == 'btn'
    chk(f'[{mode}] 戻り: ' + ('下の帯に出る(シートは開かない)' if btn else 'シートが出る'), shown(pg) != btn and pg.evaluate('!!(__navi.pend && __navi.pend.ret)'))
    pred = pg.evaluate('__navi.pend.retPred')
    big = pg.inner_text('#rec .bigh' if btn else '#reelBig')
    blue = "document.querySelector('.foot').classList.contains('ret')" if btn else "document.querySelector('#reelM .sheet').classList.contains('ret')"
    chk(f'[{mode}] 戻り: 青い帯と大見出し「{big}」', pg.evaluate(blue) and big.startswith('戻り '))
    chk(f'[{mode}] 戻り: 盤面が新しい値', pg.inner_text(f'#board .cell[data-i="{hj}"] .v') == str(hv))
    chk(f'[{mode}] 戻り: 予想のマス {pred} が選ばれている', pg.evaluate("document.querySelector('#board .cell.retc').dataset.i" if btn else "document.querySelector('#reels .mb.cur').dataset.j") == str(pred)
        and (not btn or pg.locator(f'#board .cell[data-i="{pred}"] .lbl i.pred').count() == 1))
    other = pg.evaluate(f"__navi.G.active.find(i => i !== {pred})")
    ov = pg.evaluate(f'__navi.s.v[{other}]')
    pg.click(f'#board .cell[data-i="{other}"]' if btn else f'#reels .mb[data-j="{other}"]'); pg.wait_for_timeout(150)
    ws = pg.evaluate("__navi.pend.per[0].its.map(x => x.w)")
    chk(f'[{mode}] 戻り: マスを選び直すと候補が出直す({ov} → {ws})', pg.evaluate('__navi.pend.per[0].j') == other and ws == sorted(max(0, ov - d) for d in range(12, 17)) and not pg.is_visible('#numM'))
    if not btn:
        pg.touchscreen.tap(195, 30); pg.wait_for_timeout(150)
        chk(f'[{mode}] 戻り: 外を触っても閉じない', shown(pg))
    pg.screenshot(path=f'{OUT}/input_{mode}_ret.png')
    if btn:
        chk(f'[btn] 戻り: 値は5つのボタン', pg.locator('#dVals button').count() == 5 and not pg.is_visible('#critSw') and not pg.is_visible('#undo'))
        pg.click('#dVals button[data-k="1"]'); w = ws[1]
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
    pg.click('#dCancel' if btn else '#reelCancel'); pg.wait_for_timeout(150)
    chk(f'[{mode}] 戻り: やめると −14 とトースト「{pg.inner_text("#toast")}」', pg.evaluate(f'__navi.s.v[{pred}]') == fr - 14 and '−14' in pg.inner_text('#toast'))
    idle(pg)
    # 外から commitReels
    ret_case(); pred = pg.evaluate('__navi.pend.retPred')
    pg.evaluate(f"__navi.commitReels({{ {pred}: 33 }})"); pg.wait_for_timeout(150)
    chk(f'[{mode}] 戻り: commitReels で確定', not shown(pg) and pg.evaluate(f'__navi.s.v[{pred}]') == 33 and pg.evaluate("JSON.parse(localStorage.getItem('kajiNaviRetLog')).length") == 2)
    # 設定: 記録のコピーは残る・入れ方は設定のシートで選ぶ(最初の集中力のシートの欄は出さない)
    pg.wait_for_timeout(2100); pg.click('#gearB'); pg.wait_for_timeout(150)
    chk(f'[{mode}] 設定: 入れ方「{pg.inner_text("#inSeg button[aria-pressed=true]")}」', not pg.is_visible('#cfIn') and pg.get_attribute('#inSeg button[aria-pressed="true"]', 'data-v') == mode)
    chk(f'[{mode}] 設定: 記録のコピー「{pg.inner_text("#retLogB")}」', '2件' in pg.inner_text('#retLogB'))
    pg.click('#setClose')
    chk(f'[{mode}] .tres は隠れている', not pg.is_visible('#tres'))
    chk(f'[{mode}] エラー無し {errs}', not errs)
    ctx.close()

with sync_playwright() as p:
    b = p.chromium.launch(executable_path='/opt/pw-browsers/chromium')
    for m in ['reel', 'btn']: run(b, m)
    # 前の保存(input 無し・'reel'・'btn')は全部ボタン。設定でリールにすると 'reel2' で保存される
    for old in [{'focus': 250, 'off': ['sayuu']}, {'focus': 250, 'off': ['sayuu'], 'input': 'reel'}, {'focus': 250, 'off': ['sayuu'], 'input': 'btn'}]:
        ctx = b.new_context(viewport={'width': 390, 'height': 844}, has_touch=True, is_mobile=True)
        ctx.add_init_script("if(!sessionStorage.getItem('x')){ sessionStorage.setItem('x','1'); localStorage.clear(); localStorage.setItem('kajiNaviCfgV2', '%s'); }" % json.dumps(old))
        pg = ctx.new_page(); pg.goto(URL); pg.wait_for_function('window.__navi && window.__navi.qs')
        chk(f'前の保存 {old} はボタン', pg.evaluate('__navi.cfg.input') == 'btn' and pg.evaluate('__navi.cfg.off') == ['sayuu'] and pg.evaluate('__navi.cfg.focus') == 250)
        ctx.close()
    ctx = b.new_context(viewport={'width': 390, 'height': 844}, has_touch=True, is_mobile=True)
    ctx.add_init_script("if(!sessionStorage.getItem('x')){ sessionStorage.setItem('x','1'); localStorage.clear(); localStorage.setItem('kajiNaviCfgV2', JSON.stringify({focus:250, off:['sayuu']})); }")
    pg = ctx.new_page(); pg.goto(URL); pg.wait_for_function('window.__navi && window.__navi.qs')
    pg.click('#gearB'); pg.click('#inSeg button[data-v="reel"]'); pg.click('#setClose')
    sv = pg.evaluate("JSON.parse(localStorage.getItem('kajiNaviCfgV2'))")
    chk(f'設定でリールにすると保存される {sv}', sv.get('input') == 'reel2' and sv.get('focus') == 250 and sv.get('off') == ['sayuu'] and pg.evaluate('__navi.cfg.input') == 'reel')
    pg.evaluate("__navi.startAct(__navi.G.acts.find(x => x.t.area))"); pg.wait_for_timeout(200)
    chk('リールにした後はシートとリール', shown(pg) and pg.locator('#reels .reel').count() > 0)
    pg.evaluate('__navi.closeReels()')
    pg.evaluate('__navi.setStartFocus(251)')
    chk('setStartFocus でも入れ方は残る', pg.evaluate('__navi.cfg.input') == 'reel' and pg.evaluate("JSON.parse(localStorage.getItem('kajiNaviCfgV2')).input") == 'reel2')
    pg.click('#gearB'); pg.click('#inSeg button[data-v="btn"]'); pg.click('#setClose')
    chk('ボタンに戻すと保存から消える', 'input' not in pg.evaluate("JSON.parse(localStorage.getItem('kajiNaviCfgV2'))") and pg.evaluate('__navi.cfg.input') == 'btn')
    b.close()
print('ALL OK' if not ng else f'NG {len(ng)}: {ng}')
