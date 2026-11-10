# 入力の流れの作り直し(下の帯のじか入れ・「会心が出た」・戻り・光ったマス・戻すの名前・入れ方の設定・ほかの手を全部)。
# python3 tests/t_rebuild.py   スクショは OUT(既定 /tmp)に出す。作り直す前の版(git show e66e4b9:dist/app.html)と同じ局面で結果を比べる
import os, json, subprocess, tempfile
from playwright.sync_api import sync_playwright
OUT = os.environ.get('OUT', '/tmp')
ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
URL = 'file://' + os.path.join(ROOT, 'dist', 'app.html')
TMP = tempfile.mkdtemp()
# 比べる元: 作り直す前の版(#36 の前。上の段を2行にした e66e4b9)。main は作り直しの後なので比べる元にならない
REF = 'e66e4b9'
def git_show(path): return subprocess.run(['git', 'show', REF + ':' + path], cwd=ROOT, capture_output=True, check=True).stdout.decode('utf-8')
MAIN_HTML = git_show('dist/app.html'); open(os.path.join(TMP, 'main_app.html'), 'w', encoding='utf-8').write(MAIN_HTML)
MAIN_URL = 'file://' + os.path.join(TMP, 'main_app.html')
ng = []
def chk(name, ok):
    print(('OK ' if ok else 'NG ') + name)
    if not ok: ng.append(name)
def idle(pg):
    pg.wait_for_function('window.__navi && !window.__navi.busy && (window.__navi.qs || Array.isArray(window.__navi.s.lit) || window.__navi.s.dead || (window.__navi.pend && window.__navi.pend.ret))'); pg.wait_for_timeout(120)
INIT = "if(!sessionStorage.getItem('x')){ sessionStorage.setItem('x','1'); localStorage.clear(); localStorage.setItem('kajiNaviCfgV2', '%s'); localStorage.setItem('kajiNaviPowerV1','normal'); localStorage.setItem('kajiNaviVoiceV1','0'); localStorage.setItem('kajiNaviV1', JSON.stringify({item:'hidane'})); }"
PIP_STUB = """Object.defineProperty(window, 'documentPictureInPicture', { configurable: true, value: { requestWindow: async ({width, height}) => {
  const f = document.createElement('iframe'); f.id = 'pipF'; f.style.cssText = `position:fixed;right:0;top:0;width:${width}px;height:${height}px;z-index:99999;border:0`;
  document.body.appendChild(f); await new Promise(r => setTimeout(r, 50)); return f.contentWindow; } } });"""
def page(b, w=390, h=844, cfg=None, url=URL, mobile=True, extra=''):
    ctx = b.new_context(viewport={'width': w, 'height': h}, has_touch=mobile, is_mobile=mobile, device_scale_factor=2)
    ctx.add_init_script(INIT % json.dumps(cfg or {'focus': 251}) + extra)
    pg = ctx.new_page(); errs = []; pg.on('pageerror', lambda e: errs.append(str(e)))
    pg.goto(url); pg.wait_for_function('window.__navi && window.__navi.s'); idle(pg)
    pg.select_option('#item', 'hidane'); pg.wait_for_function('window.__navi.item === "hidane"'); idle(pg)
    return ctx, pg, errs
def mut(pg, js): pg.evaluate(f"__navi.mut({js})"); idle(pg)
def best(pg): return pg.evaluate("(() => { const a = __navi.qs && __navi.qs[0] && __navi.qs[0].a; return a ? a.t.id + ':' + a.tg.join(',') : String(a); })()")
def state(pg): return pg.evaluate("(() => { const s = __navi.s; return { v: s.v, bel: s.bel, temp: s.temp, F: s.F, lit: s.lit, hs: s.hs | 0, dead: !!s.dead }; })()")
def same(a, b):
    if any(a[k] != b[k] for k in ['v', 'temp', 'F', 'lit', 'hs', 'dead']): return False
    return all(abs(x - y) < 1e-12 for ra, rb in zip(a['bel'], b['bel']) for x, y in zip(ra, rb))
def vals(pg): return pg.evaluate("[...document.querySelectorAll('#dVals button')].map(b => +b.textContent)")
def press(pg, w): pg.click(f'#dVals button:text-is("{w}")'); pg.wait_for_timeout(120)
def lit_first(pg):
    if pg.evaluate('Array.isArray(__navi.s.lit)'): pg.evaluate("document.querySelector('#board .cell.pick').click()"); idle(pg)
def start(pg, tid, tg): pg.evaluate("([t, g]) => __navi.startAct(__navi.G.acts.find(x => x.t.id === t && x.tg.join() === g))", [tid, ','.join(map(str, tg))]); pg.wait_for_timeout(150)
ST = lambda T, F, v, lit='null': "s => { s.first = false; s.temp = %d; s.F = %d; s.lit = %s; s.hs = 0; s.dead = false; s.lastHit = null; s.litCand = null; s.v = %s; const G = __navi.G; s.bel = G.cells.map(z => z ? new Array(z[1] - z[0] + 1).fill(1 / (z[1] - z[0] + 1)) : []); }" % (T, F, lit, json.dumps(v))
HIT1 = ST(2050, 181, [172, 55, 55, 27, 0, 0])              # 推奨: 弱ねらい打ち 左上(値4つ)
HIT7 = ST(1850, 200, [120, 150, 130, 150, 130, 90])        # 推奨: たたく 右中(値7つ)
HIT4 = ST(1400, 220, [100, 120, 100, 120, 60, 40], '3')    # 推奨: 超4連打ち 中と下の段
FIRE = ST(1250, 200, [0, 0, 0, 0, 0, 0])                   # 推奨: 火力上げ
CR = ST(1700, 200, [172, 240, 200, 240, 200, 140])         # 叩いた後も光らない温度(会心の比べ用)
LIT = ST(1400, 180, [172, 55, 55, 27, 0, 0], '[1,2,3,4,5]')
ORB = "s => { const G = __navi.G; s.first = false; s.temp = 450; s.F = 200; s.lit = null; for(const i of G.active){ const z = G.cells[i]; s.v[i] = Math.floor(z[0] * 0.7) + i; } }"
LAYOUT = """() => { const vis = e => { const r = e.getBoundingClientRect(), cs = getComputedStyle(e); return r.width > 0 && r.height > 0 && cs.visibility !== 'hidden' && cs.display !== 'none' && !e.closest('[hidden]'); };
  const nm = e => e.id || String(e.className) || e.tagName;
  const small = [...document.querySelectorAll('button,select')].filter(vis).filter(b => b.getBoundingClientRect().height < 44).map(nm);
  const tiny = [...document.querySelectorAll('body *')].filter(vis).filter(e => [...e.childNodes].some(n => n.nodeType === 3 && n.textContent.trim()) && parseFloat(getComputedStyle(e).fontSize) < 13).map(nm);
  const out = [...document.querySelectorAll('.foot *, .top *, #board *, .modal.show *')].filter(vis).filter(e => { const r = e.getBoundingClientRect(); return r.left < -0.5 || r.right > innerWidth + 0.5 || e.scrollWidth > e.clientWidth + 1 && getComputedStyle(e).overflowX === 'visible' && e.tagName === 'BUTTON'; }).map(nm);
  return { small, tiny, out, wide: document.documentElement.scrollWidth > innerWidth }; }"""
def layout(pg, name):
    r = pg.evaluate(LAYOUT)
    chk(f'{name}: はみ出し・44px 未満のボタン・13px 未満の文字が無い {r if any(r.values()) else ""}', not any(r.values()))
def shot(pg, name): pg.wait_for_timeout(200); pg.screenshot(path=f'{OUT}/{name}.png')

with sync_playwright() as p:
    b = p.chromium.launch(executable_path='/opt/pw-browsers/chromium')
    ctx, pg, errs = page(b)
    mctx, mp, merrs = page(b, cfg={'focus': 251}, url=MAIN_URL)

    # ---------- id と __navi の項目が main から減っていない ----------
    body = git_show('src/app.html'); body = body[body.index('<body>'):body.index('<script src="core.js">')]
    import re
    ids = sorted(set(re.findall(r'id="([A-Za-z0-9_]+)"', body)))
    miss = pg.evaluate("ids => ids.filter(i => !document.getElementById(i))", ids)
    chk(f'main の id {len(ids)}個が全部ある(無い: {miss})', len(ids) > 50 and not miss)
    src = open(os.path.join(ROOT, 'src', 'app.html'), encoding='utf-8').read()
    chk('SELF-PANEL は main の中・SELF-SCRIPTS は最後の script の後', src.index('<!--SELF-PANEL-->') < src.index('</main>') and src.rindex('</script>') < src.index('<!--SELF-SCRIPTS-->'))
    k0 = mp.evaluate("Object.keys(__navi)"); k1 = pg.evaluate("Object.keys(__navi)")
    chk(f'__navi の項目 {len(k0)}個が全部ある(無い: {[k for k in k0 if k not in k1]})', all(k in k1 for k in k0))

    # ---------- じか入れ: 1マス(値1回で確定) ----------
    mut(pg, HIT1); n0 = pg.evaluate('__navi.hist.length')
    chk(f'1マス: 推奨 {best(pg)} で、打ったは出ず値ボタンが出る', best(pg) == 'jakunerai:0' and not pg.is_visible('#go') and pg.is_visible('#dVals') and pg.is_visible('#undo') and pg.is_visible('#critSw') and pg.evaluate('__navi.pend') is None)
    chk('1マス: シートは開かない・今の会心!は出ない', not pg.is_visible('#reelM') and not pg.is_visible('#critB'))
    layout(pg, '390x844 1マス'); shot(pg, 'phone_hit1')
    ws = vals(pg); press(pg, ws[1]); idle(pg)
    chk(f'1マス: 値を1回押したら確定({ws[1]})', pg.evaluate('__navi.s.v[0]') == ws[1] and pg.evaluate('__navi.pend') is None and pg.evaluate('__navi.hist.length') == n0 + 1 and pg.evaluate('__navi.s.temp') == 2000)
    lit_first(pg)
    # 戻す: 何が戻るかが出る
    chk(f'戻すに名前が出る「{pg.inner_text("#undo")}」', pg.inner_text('#undo').split('\n') == ['戻す', '光の選択'])
    pg.click('#undo'); idle(pg); chk(f'1回戻すと「{pg.inner_text("#undo")}」', pg.inner_text('#undo').split('\n') == ['戻す', '弱ねらい打ち'] and pg.evaluate('Array.isArray(__navi.s.lit)'))
    pg.click('#undo'); idle(pg); chk('もう1回で叩く前', pg.evaluate('__navi.s.v[0]') == 172 and pg.inner_text('#undo') == '戻す')

    # ---------- じか入れ: 何マス ----------
    pg.wait_for_timeout(2100); mut(pg, HIT4); tg = [2, 3, 4, 5]
    chk(f'何マス: 推奨 {best(pg)}・最初のマスが光る', best(pg) == 'chouyon:2,3,4,5' and pg.evaluate("document.querySelector('#board .cell.cur').dataset.i") == '2' and pg.is_visible('#undo') and not pg.is_visible('#dOk'))
    got = {}
    for n, j in enumerate(tg):
        cur = pg.evaluate("document.querySelector('#board .cell.cur').dataset.i"); lab = pg.inner_text('#dLab').replace('\n', ' ')
        chk(f'何マス: {n + 1}つ目は {j}「{lab}」', cur == str(j) and f'{n + 1}/4' in lab)
        ws = vals(pg); got[j] = ws[n % len(ws)]; press(pg, got[j])
        if n == 0:
            chk('何マス: 1つ目を押すと入れ途中(やめるが出る・戻すは隠れる・まだ確定しない)', pg.evaluate('!!__navi.pend') and pg.is_visible('#dCancel') and not pg.is_visible('#undo') and pg.evaluate('__navi.s.v[2]') == 100)
            chk('何マス: 盤面に「今の値 → 入れた値」', pg.inner_text('#board .cell[data-i="2"] .v').replace(' ', '') == f'100→{got[2]}')
        if n == 1: layout(pg, '390x844 何マス'); shot(pg, 'phone_hit4')
        if n < 3: chk(f'何マス: {n + 1}つ入れた所では決定は出ない', not pg.is_visible('#dOk'))
    chk('何マス: 全部入ったら決定が出る', pg.is_visible('#dOk') and pg.evaluate('!!__navi.pend'))
    layout(pg, '390x844 何マス(決定)'); shot(pg, 'phone_hit4_done')
    pg.click('#board .cell[data-i="3"]'); pg.wait_for_timeout(100)
    chk('何マス: 盤面の叩くマスを押すと、そのマスへ戻る(手直しの入力は開かない)', pg.evaluate('__navi.pend.cur') == 3 and not pg.is_visible('#numM'))
    pg.click('#board .cell[data-i="0"]'); pg.wait_for_timeout(100)
    chk('何マス: 入れ途中は叩かないマスを押しても何も起きない', pg.evaluate('__navi.pend.cur') == 3 and not pg.is_visible('#numM'))
    ws = vals(pg); got[3] = ws[-1]; press(pg, got[3])
    chk('何マス: 入れ直しても決定前は確定しない', pg.evaluate('__navi.s.v[3]') == 120 and pg.is_visible('#dOk'))
    pg.click('#dOk'); idle(pg)
    chk(f'何マス: 決定で入る {got}', pg.evaluate('__navi.pend') is None and all(pg.evaluate(f'__navi.s.v[{j}]') == w for j, w in got.items()) and pg.evaluate('__navi.s.temp') == 1350)
    chk(f'戻すに名前「{pg.inner_text("#undo")}」', pg.inner_text('#undo').split('\n') == ['戻す', '超4連打ち'])
    # やめる: 推奨に戻る
    mut(pg, HIT4); press(pg, vals(pg)[0]); pg.click('#dCancel'); pg.wait_for_timeout(150)
    chk('何マス: やめると推奨に戻る(何も入らない)', pg.evaluate('__navi.pend') is None and pg.evaluate('__navi.s.v') == [100, 120, 100, 120, 60, 40] and pg.is_visible('#undo') and pg.is_visible('#dVals') and best(pg) == 'chouyon:2,3,4,5')

    # ---------- 結果の無い手 ----------
    mut(pg, FIRE); pg.wait_for_timeout(300)
    chk(f'結果の無い手: 推奨 {best(pg)} は「打った」', best(pg) == 'karyoku:' and pg.is_visible('#go') and pg.inner_text('#go') == '打った' and not pg.is_visible('#dVals') and not pg.is_visible('#critSw') and pg.is_visible('#undo'))
    layout(pg, '390x844 結果の無い手'); shot(pg, 'phone_fire')
    pg.click('#go'); idle(pg)
    chk('結果の無い手: 1回押したら入る', pg.evaluate('__navi.s.temp') > 1250 and pg.evaluate('__navi.pend') is None)

    # ---------- ほかの手 ----------
    mut(pg, HIT1); pg.click('#detB'); pg.wait_for_timeout(100)
    alt = pg.evaluate("(() => { const a = __navi.qs[1].a; return [a.t.id, a.tg, !!a.t.area]; })()")
    pg.click('#alts button[data-k="1"]'); pg.wait_for_timeout(150)
    if alt[2]:
        chk(f'ほかの手 {alt}: その手のじか入れに切り替わる', pg.evaluate('__navi.pend && __navi.pend.a.t.id') == alt[0] and pg.is_visible('#dVals') and pg.is_visible('#dCancel'))
        pg.click('#dCancel'); pg.wait_for_timeout(100)
        chk('ほかの手: やめると推奨に戻る', pg.evaluate('__navi.pend') is None and pg.inner_text('#rec .nm') == '弱ねらい打ち')
    # ほかの手を全部
    na = pg.evaluate("__navi.qs.filter(x => x.a).length")
    chk('ほかの手を全部: 詳細の中にある', pg.is_visible('#allB'))
    pg.click('#allB'); pg.wait_for_timeout(150)
    rows = pg.evaluate("[...document.querySelectorAll('#allL button')].map(b => b.innerText.replace(/\\s+/g, ' ').trim())")
    pcs = [float(r.split(' ')[-1].rstrip('%')) for r in rows]
    chk(f'ほかの手を全部: 打てる手 {na}手が見込み順({rows[0]} … {rows[-1]})', len(rows) == na and na > 20 and pcs == sorted(pcs, reverse=True))
    layout(pg, '390x844 全部の手')
    k = next(i for i, r in enumerate(rows) if r.startswith('冷やし込み') or r.startswith('火力上げ'))
    pg.click(f'#allL button[data-k="{k}"]'); idle(pg)
    chk(f'ほかの手を全部: 押したらその手が入る({rows[k]} → {pg.evaluate("__navi.s.temp")}℃)', pg.evaluate('__navi.s.temp') != 2050 and pg.evaluate('__navi.s.v[0]') == 172 and not pg.is_visible('#allM'))
    pg.click('#detB') if pg.is_visible('#detB') and pg.evaluate("document.getElementById('detB').getAttribute('aria-expanded')") == 'true' else None

    # ---------- 会心スイッチ: main の「値を入れる → 今の会心!」と同じ ----------
    def new_hit(tid, tgs, picks):       # picks: {マス: (値, 会心オンか)}。じか入れで入れる
        mut(pg, CR); start(pg, tid, tgs)
        for j in sorted(tgs):
            w, on = picks[j]
            if on: pg.click('#critSw'); pg.wait_for_timeout(80)
            press(pg, w)
        if len(tgs) > 1: pg.click('#dOk')
        idle(pg); return state(pg)
    def main_hit(tid, tgs, picks):      # main: 値を入れる → 会心のマスは「今の会心!」
        mut(mp, CR); start(mp, tid, tgs)
        mp.evaluate(f"__navi.commitReels({json.dumps({str(j): picks[j][0] for j in tgs})})"); idle(mp)
        for j in sorted(tgs):
            if not picks[j][1]: continue
            mp.click('#critB'); mp.wait_for_timeout(80)
            if mp.is_visible('#critP'): mp.click(f'#critP button[data-j="{j}"]')
            idle(mp)
        return state(mp)
    mut(pg, CR); start(pg, 'tataku', [0])
    offv = vals(pg); tags = pg.evaluate("__navi.pend.per[0].its.map(x => [x.w, x.tag])")
    chk(f'会心オフ: 会心でなくても出る値だけ {offv}', offv == [w for w, t in tags if t != 'c'] and pg.get_attribute('#critSw', 'aria-checked') == 'false')
    pg.click('#critSw'); pg.wait_for_timeout(80); onv = vals(pg)
    chk(f'会心オン: 会心で出うる値だけ {onv}・ピンクの縁', onv == [w for w, t in tags if t != 'n'] and onv != offv and pg.get_attribute('#critSw', 'aria-checked') == 'true'
        and pg.evaluate("getComputedStyle(document.getElementById('critSw')).borderTopColor") == 'rgb(255, 122, 209)')
    layout(pg, '390x844 会心オン')
    pg.click('#critSw'); pg.wait_for_timeout(80)
    chk('会心: もう一度押すとオフ(縁は元の色)', vals(pg) == offv and pg.evaluate("getComputedStyle(document.getElementById('critSw')).borderTopColor") != 'rgb(255, 122, 209)')
    pg.click('#dCancel'); pg.wait_for_timeout(100)
    for w in [onv[0], onv[len(onv) // 2], onv[-1]]:
        a = new_hit('tataku', [0], {0: (w, True)}); m = main_hit('tataku', [0], {0: (w, True)})
        nz = sum(1 for x in a['bel'][0] if x > 1e-9)
        chk(f'会心オンで {w}: main の「値 → 今の会心!」と同じ(左上の見当 {nz}通り)', same(a, m) and a['v'][0] == w)
        chk(f'会心オンで {w}: 戻す1回で叩く前', (pg.click('#undo'), idle(pg), pg.evaluate('__navi.s.v[0]'))[2] == 172)
    for w in [offv[0], offv[-1]]:
        a = new_hit('tataku', [0], {0: (w, False)}); m = main_hit('tataku', [0], {0: (w, False)})
        chk(f'会心オフで {w}: main で値だけ入れた時と同じ', same(a, m) and a['v'][0] == w)
    # 2マス: 片方だけ会心
    mut(pg, CR); start(pg, 'naname', [1, 2]); o1 = vals(pg); pg.click('#critSw'); pg.wait_for_timeout(80); c1 = vals(pg); press(pg, c1[-1])
    chk('2マス: 次のマスではスイッチがオフに戻る', pg.get_attribute('#critSw', 'aria-checked') == 'false' and pg.evaluate('__navi.pend.cur') == 2)
    o2 = vals(pg); press(pg, o2[1])
    pg.click('#board .cell[data-i="1"]'); pg.wait_for_timeout(100)
    chk('2マス: 会心で入れたマスへ戻るとオンで出る', pg.get_attribute('#critSw', 'aria-checked') == 'true' and vals(pg) == c1)
    pg.click('#dCancel'); pg.wait_for_timeout(100)
    picks = {1: (c1[-1], True), 2: (o2[1], False)}
    a = new_hit('naname', [1, 2], picks); m = main_hit('naname', [1, 2], picks)
    chk(f'2マス(右上だけ会心 {picks}): main と同じ', same(a, m))
    picks = {1: (o1[2], False), 2: (o2[0], False)}
    a = new_hit('naname', [1, 2], picks); m = main_hit('naname', [1, 2], picks)
    chk(f'2マス(会心なし {picks}): main と同じ', same(a, m))
    # 推奨の手(まだ打っていない所)からオンで入れる
    mut(pg, HIT1); pg.click('#critSw'); pg.wait_for_timeout(80); shot(pg, 'phone_hit1_crit'); w = vals(pg)[-1]; press(pg, w); idle(pg); lit_first(pg); a = state(pg)
    mut(mp, HIT1); mp.evaluate("document.getElementById('go').click()"); mp.evaluate(f"__navi.commitReels({{0: {w}}})"); idle(mp); lit_first(mp); mp.click('#critB'); idle(mp); m = state(mp)
    chk(f'推奨の手を会心オンで {w}: main と同じ', same(a, m) and a['v'][0] == w)
    # 必殺の効果中: スイッチは出さず、会心の値だけ
    mut(pg, CR); pg.evaluate('__navi.setHs(2)'); idle(pg); start(pg, 'tataku', [0])
    tags = pg.evaluate("__navi.pend.per[0].its.map(x => [x.w, x.tag])")
    chk(f'必殺の効果中: スイッチは出ない・会心の値だけ {vals(pg)}', not pg.is_visible('#critSw') and vals(pg) == [w for w, t in tags] and all(t == 'c' for w, t in tags))
    w = vals(pg)[-1]; press(pg, w); idle(pg); a = state(pg)
    mut(mp, CR); mp.evaluate('__navi.setHs(2)'); idle(mp); start(mp, 'tataku', [0]); mp.evaluate(f"__navi.commitReels({{0: {w}}})"); idle(mp)
    chk('必殺の効果中: main と同じ', same(a, state(mp)))
    chk(f'エラー無し {errs} {merrs}', not errs and not merrs)

    # ---------- 光ったマスを下の帯から選ぶ ----------
    mut(pg, LIT)
    btns = pg.evaluate("[...document.querySelectorAll('#dLit button')].map(b => [+b.dataset.i, b.innerText.replace(/\\s+/g, ' '), Math.round(b.getBoundingClientRect().left), Math.round(b.getBoundingClientRect().top)])")
    chk(f'光ったマス: 候補5つのボタン(マス名と今の値)・押せない橙ボタンは出ない {[x[1] for x in btns]}', [x[0] for x in btns] == [1, 2, 3, 4, 5] and btns[0][1] == '右上 55' and not pg.is_visible('#go') and pg.is_visible('#undo'))
    chk('光ったマス: ゲームと同じ並び(2列)', all((x[2] > 195) == (x[0] % 2 == 1) for x in btns) and btns[1][3] == btns[2][3] and btns[3][3] == btns[4][3] and btns[0][3] < btns[1][3] < btns[3][3])
    layout(pg, '390x844 光ったマス'); shot(pg, 'phone_lit')
    pg.click('#dLit button[data-i="4"]'); idle(pg)
    chk('光ったマス: 下の帯のボタンで選べる', pg.evaluate('__navi.s.lit') == 4)
    mut(pg, LIT); pg.click('#board .cell[data-i="2"]'); idle(pg)
    chk('光ったマス: 盤面のマスを押しても選べる', pg.evaluate('__navi.s.lit') == 2)

    # ---------- 戻り(虹色のオーブ) ----------
    pg.select_option('#item', 'orb'); pg.wait_for_function('window.__navi.item === "orb"'); idle(pg)
    def ret_case():
        mut(pg, ORB); j = pg.evaluate("__navi.G.active[0]")
        pg.evaluate(f"(() => {{ __navi.startAct(__navi.G.acts.find(x => x.t.id === 'tataku' && x.tg.includes({j}))); __navi.commitReels({{ {j}: __navi.s.v[{j}] + 7 }}); }})()"); pg.wait_for_timeout(200)
    pg.evaluate("localStorage.removeItem('kajiNaviRetLog')"); ret_case()
    pred = pg.evaluate('__navi.pend.retPred'); big = pg.inner_text('#rec .bigh')
    chk(f'戻り: 青い帯+大見出し「{big}」・値ボタン5つ・シートは開かない', pg.evaluate("document.querySelector('.foot').classList.contains('ret')") and big.startswith('戻り ') and len(vals(pg)) == 5 and not pg.is_visible('#reelM') and not pg.is_visible('#critSw'))
    chk('戻り: 盤面の予想のマスに印', pg.locator(f'#board .cell[data-i="{pred}"] .lbl i.pred').count() == 1 and pg.evaluate("document.querySelector('#board .cell.retc').dataset.i") == str(pred))
    layout(pg, '390x844 戻り'); shot(pg, 'phone_ret')
    other = pg.evaluate(f"__navi.G.active.find(i => i !== {pred})"); ov = pg.evaluate(f'__navi.s.v[{other}]')
    pg.click(f'#board .cell[data-i="{other}"]'); pg.wait_for_timeout(150)
    chk('戻り: 盤面のマスを押して選び直す', pg.evaluate('__navi.pend.per[0].j') == other and vals(pg) == sorted(max(0, ov - d) for d in range(12, 17)) and pg.inner_text('#rec .bigh') != big)
    w = vals(pg)[3]; press(pg, w); idle(pg)
    last = pg.evaluate("JSON.parse(localStorage.getItem('kajiNaviRetLog') || '[]')")[-1]
    chk(f'戻り: 値を押したら確定({other} = {w})・記録は前と同じ形 {sorted(last.keys())}', pg.evaluate(f'__navi.s.v[{other}]') == w and pg.evaluate('__navi.pend') is None
        and sorted(last.keys()) == ['after', 'at', 'before', 'item', 'pick', 'pred', 'temp'] and last['pred'] == pred and last['pick'] == other and last['after'] == w and last['before'][other] == ov)
    ret_case(); pred = pg.evaluate('__navi.pend.retPred'); fr = pg.evaluate(f'__navi.s.v[{pred}]')
    pg.click('#dCancel'); pg.wait_for_timeout(150)
    chk(f'戻り: やめると −14 とトースト「{pg.inner_text("#toast")}」', pg.evaluate(f'__navi.s.v[{pred}]') == fr - 14 and '−14' in pg.inner_text('#toast') and pg.evaluate("JSON.parse(localStorage.getItem('kajiNaviRetLog')).length") == 1)
    idle(pg); pg.select_option('#item', 'hidane'); idle(pg)
    pg.wait_for_timeout(2100)
    # 入れ途中に温度を直す: 入れかけをやめてから直せる
    mut(pg, HIT4); press(pg, vals(pg)[0]); pg.click('#stTemp'); pg.wait_for_timeout(100)
    chk('入れ途中に温度を押す: 入れかけをやめて、直す入力が開く', pg.evaluate('__navi.pend') is None and pg.is_visible('#numM'))
    pg.click('#numCancel'); mut(pg, HIT1); pg.click('#gearB'); pg.wait_for_timeout(150)
    chk('設定: 入れ方はボタン', pg.get_attribute('#inSeg button[aria-pressed="true"]', 'data-v') == 'btn')
    layout(pg, '390x844 設定'); shot(pg, 'phone_set'); pg.click('#setClose')
    chk(f'エラー無し {errs}', not errs)
    ctx.close()

    # ---------- 外からの流れ: じか入れ・リールの両方の設定で main と同じ局面になる ----------
    for mode, cfg in [('ボタン', {'focus': 251}), ('リール', {'focus': 251, 'input': 'reel2'})]:
        ctx, pg, errs = page(b, cfg=cfg)
        sheet = lambda: pg.evaluate("document.getElementById('reelM').classList.contains('show')")
        res = []
        for q in [pg, mp]:
            mut(q, HIT1); q.evaluate("document.getElementById('go').click()"); q.wait_for_timeout(100)
            ok = q.evaluate("!!__navi.pend && __navi.pend.a === __navi.qs[0].a")
            q.evaluate("__navi.commitReels({0: 183})"); idle(q); lit_first(q); res.append((ok, state(q)))
        chk(f'[{mode}] #go click → commitReels({{0: 183}}): main と同じ', res[0][0] and res[1][0] and same(res[0][1], res[1][1]) and res[0][1]['v'][0] == 183)
        mut(pg, HIT1); pg.evaluate("document.getElementById('go').click()"); pg.wait_for_timeout(100)
        chk(f'[{mode}] #go の後のシート', sheet() == (mode == 'リール') and pg.is_visible('#dVals') == (mode == 'ボタン'))
        pg.evaluate('__navi.closeReels()'); pg.wait_for_timeout(100)
        chk(f'[{mode}] closeReels で入れる前に戻る', pg.evaluate('__navi.pend') is None and not sheet() and pg.evaluate('__navi.s.v[0]') == 172)
        for vv in [{0: 120, 1: 141}, {0: 123, 1: 150, 2: 131, 3: 161}, {}]:      # 一部だけ・候補に無い値・全部おまかせ
            res = []
            for q in [pg, mp]:
                mut(q, HIT7); start(q, 'yonren', [0, 1, 2, 3]); q.evaluate(f"__navi.commitReels({json.dumps({str(k): v for k, v in vv.items()})})"); idle(q); lit_first(q); res.append(state(q))
            chk(f'[{mode}] startAct(4連打ち) → commitReels({vv}): main と同じ {res[0]["v"]}', same(res[0], res[1]) and all(res[0]['v'][k] == v for k, v in vv.items()))
        res = []
        for q in [pg, mp]:
            mut(q, FIRE); q.evaluate("__navi.startAct(__navi.qs[0].a)"); idle(q); lit_first(q); res.append(state(q))
        chk(f'[{mode}] startAct(火力上げ): main と同じ', same(res[0], res[1]) and res[0]['temp'] > 1250)
        mut(pg, LIT); pg.evaluate("document.querySelector('#board .cell[data-i=\"3\"]').click()"); idle(pg)
        chk(f'[{mode}] 光ったマスは盤面の .cell を押す', pg.evaluate('__navi.s.lit') == 3)
        mut(pg, HIT1); pg.click('#hsB'); idle(pg)
        chk(f'[{mode}] #hsB を押す', pg.evaluate('__navi.s.hs') == 1)
        if mode == 'リール':
            mut(pg, HIT1)
            chk('[リール] 推奨の叩く手は「打った」(下の帯に値ボタンは出ない)', pg.is_visible('#go') and not pg.is_visible('#dVals') and not pg.is_visible('#critSw'))
            pg.click('#go'); pg.wait_for_timeout(200)
            chk('[リール] 打った → シートのリール(切り替えは出ない)', sheet() and pg.locator('#reels .reel').count() == 1 and not pg.is_visible('#inTog'))
            pg.click('#reelCancel')
            mut(pg, LIT); chk('[リール] 光ったマスのボタンは下の帯に出る', pg.locator('#dLit button').count() == 5 and not pg.is_visible('#go'))
        chk(f'[{mode}] エラー無し {errs}', not errs)
        ctx.close()
    # main で何手か打った保存(古い保存として読ませる)
    mut(mp, CR); start(mp, 'tataku', [0]); mp.evaluate("__navi.commitReels({0: 181})"); idle(mp); mp.click('#critB'); idle(mp)
    OLD_SAVE = mp.evaluate("localStorage.getItem('kajiNaviV1')"); OLD_V = mp.evaluate('__navi.s.v'); OLD_BEL = mp.evaluate('__navi.s.bel')
    mctx.close()

    # ---------- 古い保存を読める ----------
    for old, want in [({'focus': 245, 'off': None, 'input': 'reel'}, 'btn'), ({'focus': 245}, 'btn'), ({'focus': 245, 'input': 'btn', 'size': 'l'}, 'btn'), ({'focus': 245, 'input': 'reel2'}, 'reel')]:
        ctx = b.new_context(viewport={'width': 390, 'height': 844}); errs = []
        ctx.add_init_script("if(!sessionStorage.getItem('x')){ sessionStorage.setItem('x','1'); localStorage.clear(); localStorage.setItem('kajiNaviCfgV2', %s); localStorage.setItem('kajiNaviV1', %s); }" % (json.dumps(json.dumps(old)), json.dumps(OLD_SAVE)))
        pg = ctx.new_page(); pg.on('pageerror', lambda e: errs.append(str(e))); pg.goto(URL); pg.wait_for_function('window.__navi && window.__navi.qs')
        chk(f'古い保存 {json.dumps(old)} → 入れ方 {want}・集中力 245・main で打った局面もそのまま', pg.evaluate('__navi.cfg.input') == want and pg.evaluate('__navi.cfg.focus') == 245 and pg.evaluate('__navi.s.v') == OLD_V
            and pg.evaluate('__navi.s.bel') == OLD_BEL and pg.evaluate('__navi.hist.length') > 0 and not errs and not pg.is_visible('#cfgM'))
        pg.click('#undo'); pg.wait_for_function('window.__navi.qs')
        chk(f'古い保存: 前の履歴で戻せる {errs}', not errs)
        ctx.close()

    # ---------- 390x640(文字 大) ----------
    ctx, pg, errs = page(b, 390, 640, {'focus': 251, 'size': 'l'})
    NUMS = "() => ({ b: Math.max(...[...document.querySelectorAll('#board .cell .v')].map(c => c.getBoundingClientRect().bottom)), f: document.querySelector('.foot').getBoundingClientRect().top })"
    for nm, st in [('値4つ', HIT1), ('値7つ', HIT7)]:
        mut(pg, st); r = pg.evaluate(NUMS)
        chk(f'390x640 大 1マス({nm}・会心オフ): 6マスの数字が下の帯に隠れない {r}', pg.evaluate('scrollY') == 0 and r['b'] <= r['f'])
        layout(pg, f'390x640 大 1マス({nm})')
        if nm == '値4つ': shot(pg, 'short_big_hit1')
    hs = pg.evaluate("[...document.querySelectorAll('#dVals button')].map(b => b.getBoundingClientRect().height)")
    chk(f'390x640: 値ボタンは 44px 以上({min(hs)})', min(hs) >= 44)
    pg.click('#critSw'); pg.wait_for_timeout(80); layout(pg, '390x640 大 会心オン'); pg.click('#critSw')
    mut(pg, HIT4); layout(pg, '390x640 大 何マス')
    for k in range(4): press(pg, vals(pg)[k])
    layout(pg, '390x640 大 何マス(決定)')
    seen = pg.evaluate("(() => { const c = document.querySelector('#board .cell.cur').getBoundingClientRect(), f = document.querySelector('.foot').getBoundingClientRect(); return c.bottom <= f.top; })()")
    chk('390x640 大 何マス: 今入れるマスが下の帯に隠れない(自動で送る)', seen)
    pg.click('#dOk'); idle(pg); pg.wait_for_timeout(200)
    chk('390x640 大 何マス: 終わったら上へ戻る', pg.evaluate('scrollY') == 0)
    mut(pg, LIT); layout(pg, '390x640 大 光ったマス'); r = pg.evaluate(NUMS); chk(f'390x640 大 光ったマス: 6マスの数字が隠れない {r}', r['b'] <= r['f'])
    mut(pg, FIRE); pg.wait_for_timeout(300); layout(pg, '390x640 大 結果の無い手')
    pg.click('#gearB'); pg.wait_for_timeout(150); layout(pg, '390x640 大 設定')
    cl = pg.evaluate("(() => { const r = document.getElementById('setClose').getBoundingClientRect(); return r.top >= 0 && r.bottom <= innerHeight; })()")
    chk('390x640 大 設定: 閉じるが見えている', cl); pg.click('#setClose')
    chk(f'エラー無し {errs}', not errs); ctx.close()

    # ---------- 小窓 380x420 ----------
    ctx, pg, errs = page(b, 1280, 800, None, URL, False, PIP_STUB)
    pg.click('#gearB'); pg.click('#pipB'); pg.wait_for_timeout(300)
    D = "document.getElementById('pipF').contentDocument"
    PL = f"""() => {{ const d = {D}, w = d.defaultView, vis = e => {{ const r = e.getBoundingClientRect(), cs = w.getComputedStyle(e); return r.width > 0 && r.height > 0 && cs.visibility !== 'hidden' && cs.display !== 'none' && !e.closest('[hidden]'); }};
      const nm = e => e.id || String(e.className) || e.tagName;
      return {{ small: [...d.querySelectorAll('button,select')].filter(vis).filter(b => b.getBoundingClientRect().height < 44).map(nm),
        tiny: [...d.querySelectorAll('body *')].filter(vis).filter(e => [...e.childNodes].some(n => n.nodeType === 3 && n.textContent.trim()) && parseFloat(w.getComputedStyle(e).fontSize) < 13).map(nm),
        out: [...d.querySelectorAll('body *')].filter(vis).filter(e => e.getBoundingClientRect().right > 380.5).map(nm), tall: d.documentElement.scrollHeight > 420 ? d.documentElement.scrollHeight : 0 }}; }}"""
    def pl(name):
        pg.wait_for_timeout(150); r = pg.evaluate(PL)
        chk(f'小窓 {name}: 420px に収まる・はみ出し・44px 未満のボタン・13px 未満の文字が無い {r if any(r.values()) else ""}', not any(r.values()))
    pv = lambda: pg.evaluate(f"[...{D}.querySelectorAll('.pv button')].map(b => +b.textContent)")
    pclick = lambda w: (pg.evaluate(f"[...{D}.querySelectorAll('.pv button')].find(b => +b.textContent === {w}).click()"), pg.wait_for_timeout(120))
    mut(pg, HIT1); pl('1マス')
    chk(f'小窓 1マス: 打ったは出ず値ボタン {pv()}・会心スイッチ', pg.evaluate(f"!{D}.getElementById('pGo') && !!{D}.getElementById('pSw')") and pv() == vals(pg))
    pg.wait_for_timeout(200); pg.locator('#pipF').screenshot(path=f'{OUT}/pip_hit1.png')
    pg.evaluate(f"{D}.getElementById('pSw').click()"); pg.wait_for_timeout(150)
    chk('小窓: 会心スイッチは本画面と同じ物', pg.get_attribute('#critSw', 'aria-checked') == 'true' and pv() == vals(pg) and pg.evaluate(f"{D}.getElementById('pSw').getAttribute('aria-checked')") == 'true')
    pl('1マス 会心オン'); w = pv()[-1]; pclick(w); idle(pg); lit_first(pg); a = state(pg)
    chk(f'小窓 1マス: 会心オンで値を1回押したら確定({w}・見当 {sum(1 for x in a["bel"][0] if x > 1e-9)}通り)', a['v'][0] == w and pg.evaluate('__navi.pend') is None and pg.evaluate('__navi.s.lastHit.cells[0].done') is True)
    mut(pg, HIT7); pl('1マス 値7つ'); mut(pg, HIT4); pl('何マス(押す前)')
    w = pv()[1]; pclick(w)
    chk('小窓 何マス: 1つ目を押すと入れ途中・次のマスへ', pg.evaluate('!!__navi.pend && __navi.pend.cur') == 3 and pg.inner_text('#board .cell[data-i="2"] .v').replace(' ', '') == f'100→{w}')
    pl('何マス(入れ途中)')
    for k in range(3): pclick(pv()[0])
    pl('何マス(決定)'); pg.evaluate(f"{D}.getElementById('pOk').click()"); idle(pg)
    chk('小窓 何マス: 決定で入る', pg.evaluate('__navi.pend') is None and pg.evaluate('__navi.s.v[2]') == w)
    lit_first(pg); pl('叩いた後'); chk('小窓: 今の会心! の行は出ない', pg.evaluate(f"{D}.querySelectorAll('.cr').length") == 0 and '今の会心' not in pg.evaluate(f"{D}.body.innerText"))
    mut(pg, FIRE); pg.wait_for_timeout(300); pl('結果の無い手'); chk('小窓 結果の無い手: 打った', pg.evaluate(f"!!{D}.getElementById('pGo')"))
    mut(pg, LIT); pl('光ったマス')
    chk(f'エラー無し {errs}', not errs); ctx.close()
    b.close()
print('ALL OK' if not ng else f'NG {len(ng)}: {ng}')
