# 画面整理(上の段2行・設定・必殺の印・マスのゾーン表示・下の帯の値ボタン・入れ方の切り替え・大きさ・小窓だけで入れる)。
# python3 tests/t_ui_tidy.py   スクショは OUT(既定 /tmp)に出す
import os, json
from playwright.sync_api import sync_playwright
OUT = os.environ.get('OUT', '/tmp')
URL = 'file://' + os.path.abspath(os.path.join(os.path.dirname(__file__), '..', 'dist', 'app.html'))
ng = []
def chk(name, ok):
    print(('OK ' if ok else 'NG ') + name)
    if not ok: ng.append(name)
def idle(pg): pg.wait_for_function('window.__navi && !window.__navi.busy && (window.__navi.qs || Array.isArray(window.__navi.s.lit) || window.__navi.s.dead)'); pg.wait_for_timeout(100)
BASE = "s => { s.first = false; s.temp = 2050; s.F = 181; s.lit = null; s.hs = 0; s.dead = false; s.lastHit = null; s.v = [172, 55, 55, 27, 0, 0]; }"
INIT = "if(!sessionStorage.getItem('x')){ sessionStorage.setItem('x','1'); localStorage.clear(); localStorage.setItem('kajiNaviCfgV2', '%s'); localStorage.setItem('kajiNaviPowerV1','normal'); localStorage.setItem('kajiNaviVoiceV1','0'); localStorage.setItem('kajiNaviV1', JSON.stringify({item:'hidane'})); }"
# 外のスクリプトが頼っている id(前の版の画面にあった物)。動きで出し入れする物(detB・relitB・小窓の p*)は別に見る
IDS = ['alts', 'board', 'cfF', 'cfIn', 'cfT', 'cfgB2', 'cfgB2v', 'cfgCancel', 'cfgM', 'cfgOk', 'chainB', 'critB', 'critP', 'focus', 'go', 'hsB', 'hsBn', 'hsBt',
       'item', 'kind', 'msg', 'numCancel', 'numI', 'numM', 'numOk', 'numT', 'pipB', 'powGpu', 'powTest', 'power', 'rec', 'reelBig', 'reelCancel', 'reelM', 'reelOk',
       'reelT', 'reels', 'relit', 'reset', 'retLogB', 'stFocus', 'stTemp', 'techB', 'techBv', 'temp', 'toast', 'tres', 'tresDir', 'tresN', 'tresPick', 'undo', 'vB', 'vBt', 'vRate']
SMALL = """() => { const vis = e => { const r = e.getBoundingClientRect(), cs = getComputedStyle(e); return r.width > 0 && r.height > 0 && cs.visibility !== 'hidden' && cs.display !== 'none' && !e.closest('[hidden]'); };
  const small = [...document.querySelectorAll('button,select,[role=button]')].filter(vis).filter(b => b.getBoundingClientRect().height < 44).map(b => b.id || b.className);
  const tiny = [...document.querySelectorAll('body *')].filter(vis).filter(e => [...e.childNodes].some(n => n.nodeType === 3 && n.textContent.trim()) && parseFloat(getComputedStyle(e).fontSize) <= 12).map(e => e.className || e.tagName);
  return { small, tiny }; }"""
PIP_STUB = """Object.defineProperty(window, 'documentPictureInPicture', { configurable: true, value: { requestWindow: async ({width, height}) => {
  const f = document.createElement('iframe'); f.id = 'pipF'; f.style.cssText = `position:fixed;right:0;top:0;width:${width}px;height:${height}px;z-index:99999;border:0`;
  document.body.appendChild(f); await new Promise(r => setTimeout(r, 50)); return f.contentWindow; } } });"""

with sync_playwright() as p:
    b = p.chromium.launch(executable_path='/opt/pw-browsers/chromium')
    # ---------- スマホ縦 ----------
    errs = []
    ctx = b.new_context(viewport={'width': 390, 'height': 844}, has_touch=True, is_mobile=True, device_scale_factor=2)
    ctx.add_init_script(INIT % json.dumps({'focus': 251}))
    pg = ctx.new_page(); pg.on('pageerror', lambda e: errs.append(str(e)))
    pg.goto(URL); pg.wait_for_function('window.__navi && window.__navi.qs'); idle(pg)
    pg.select_option('#item', 'hidane'); pg.wait_for_function('window.__navi.item === "hidane"'); idle(pg)
    miss = pg.evaluate("ids => ids.filter(i => !document.getElementById(i))", IDS)
    chk(f'前の id が全部ある(無い: {miss})', not miss)
    pg.evaluate(f"__navi.mut({BASE})"); idle(pg)
    # 1. 上の段は2行
    tops = pg.evaluate("['item','stTemp','hsB','stFocus','gearB'].map(i => { const r = document.getElementById(i).getBoundingClientRect(); return [i, Math.round(r.top), Math.round(r.bottom), Math.round(r.right)]; })")
    chk(f'上の段が2行(商材・最初から・設定 / 温度・必殺・集中力) {tops}', len({t[1] for t in tops}) == 2 and tops[0][1] == tops[4][1] and tops[1][1] == tops[3][1] and max(t[3] for t in tops) <= 390)
    inset = pg.evaluate("['vB','cfgB2','techB','pipB','power','vRate','retLogB'].filter(i => !document.getElementById(i).closest('#setM'))")
    chk(f'声・最初の値・使う技・小窓・計算の強さ・声の速さ・記録は設定の中(外: {inset})', not inset)
    chk('最初からは上の段', pg.evaluate("!!document.getElementById('reset').closest('.top')"))
    chk('説明文も ⚙ の中', pg.evaluate("!!document.querySelector('#setM .note') && !document.querySelector('main .note')"))
    bb = pg.evaluate("() => ({ b: Math.max(...[...document.querySelectorAll('#board .cell')].map(c => c.getBoundingClientRect().bottom)), f: document.querySelector('.foot').getBoundingClientRect().top })")
    chk(f'6マスが下の帯に隠れない {bb}', bb['b'] <= bb['f'])
    sm = pg.evaluate(SMALL); chk(f'44px 未満のボタン・12px 以下の文字が無い {sm}', not sm['small'] and not sm['tiny'])
    pg.click('#gearB'); pg.wait_for_timeout(150)
    sm = pg.evaluate(SMALL); chk(f'設定も 44px 未満のボタン・12px 以下の文字が無い {sm}', not sm['small'] and not sm['tiny'])
    pg.click('#vB'); chk('⚙ の声のボタンで切り替わる', pg.evaluate('__navi.voiceOn') is True); pg.click('#vB')
    pg.click('#cfgB2'); pg.wait_for_timeout(100); chk('⚙ の「最初の値を変える」で集中力のシート', pg.is_visible('#cfF')); pg.click('#cfgCancel')
    pg.click('#setClose'); pg.wait_for_timeout(100)
    # 2. 必殺: なしは印、たまった・効果中は帯
    chk('必殺なしは温度の横の印', pg.evaluate("document.getElementById('hsB').parentNode.id") == 'hsSlot' and not pg.is_visible('#hsRow'))
    pg.click('#hsB'); idle(pg)
    chk('押すと たまった の帯', pg.evaluate("__navi.s.hs") == 1 and pg.evaluate("document.getElementById('hsB').parentNode.id") == 'hsRow' and pg.is_visible('#hsRow') and pg.inner_text('#hsBt') == 'たまった')
    bb = pg.evaluate("() => ({ b: Math.max(...[...document.querySelectorAll('#board .cell')].map(c => c.getBoundingClientRect().bottom)), f: document.querySelector('.foot').getBoundingClientRect().top })")
    nb = pg.evaluate("() => ({ b: Math.max(...[...document.querySelectorAll('#board .cell .v')].map(c => c.getBoundingClientRect().bottom)), f: document.querySelector('.foot').getBoundingClientRect().top })")
    chk(f'帯が出ても6マスの数字は隠れない {nb}', nb['b'] <= nb['f'])
    pg.screenshot(path=f'{OUT}/ui_hs1.png')
    pg.click('#hsB'); idle(pg); chk('効果中', pg.evaluate("__navi.s.hs") == 2 and pg.inner_text('#hsBt') == '効果中')
    pg.click('#hsB'); idle(pg); chk('なしに戻ると印', pg.evaluate("__navi.s.hs") == 0 and pg.evaluate("document.getElementById('hsB').parentNode.id") == 'hsSlot')
    # 4. マスのゾーン表示
    line = pg.inner_text('#board .cell[data-i="0"] .bel')
    chk(f'棒の下の1行「{line}」', line == '180〜190・あと8〜18' and not pg.is_visible('#board .cell[data-i="0"] .z'))
    pg.evaluate("__navi.mut(s => { s.bel[0] = s.bel[0].map((_, q) => q === 5 ? 1 : 0); })"); idle(pg)
    bl = pg.inner_text('#board .cell[data-i="0"] .bel')
    chk(f'理想値が絞れたら理想値の表示「{bl}」', bl == '理想値 185')
    pg.evaluate(f"__navi.mut({BASE})"); idle(pg)
    pg.click('#detB'); pg.wait_for_timeout(100)
    chk(f'詳細の行にゾーンの重複が無い「{pg.inner_text("#rec .why")}」', 'ゾーン 180' not in pg.inner_text('#rec .why'))
    pg.click('#detB')
    # 5. 下の帯の値ボタン(じか入れ)
    pg.evaluate("__navi.startAct(__navi.G.acts.find(a => a.t.id === 'yonren' && a.tg.length === 4))"); pg.wait_for_timeout(200)
    lab = pg.inner_text('#dLab').replace('\n', ' ')
    chk(f'シートは開かず、下の帯に入れるマスの行「{lab}」', not pg.evaluate("document.getElementById('reelM').classList.contains('show')") and lab.startswith('左上') and '1/4' in lab)
    ws = pg.evaluate("[...document.querySelectorAll('#dVals button')].map(b => +b.textContent)")
    cols = pg.evaluate("getComputedStyle(document.getElementById('dVals')).gridTemplateColumns.split(' ').length")
    hs = pg.evaluate("[...document.querySelectorAll('#dVals button')].map(b => b.getBoundingClientRect().height)")
    nc = pg.evaluate("__navi.pend.per.find(p => p.j === 0).its.filter(x => x.tag !== 'c').map(x => x.w)")
    chk(f'会心でなくても出る値だけ・小さい順・5〜7列・44px 以上 {ws}', ws == sorted(ws) and ws == nc and cols == (5 if len(ws) <= 5 else min(7, -(-len(ws) // -(-len(ws) // 7)))) and min(hs) >= 44)
    zn = pg.evaluate("[...document.querySelectorAll('#dVals button')].map(b => [+b.textContent, b.classList.contains('zn'), b.classList.contains('ov')])")
    chk(f'ゾーン内は緑(zn)・超えるは ov', all(z == (180 <= w <= 190) and o == (w > 190) for w, z, o in zn))
    pg.screenshot(path=f'{OUT}/ui_btn4.png')
    # 入れ方の切り替え(設定のシート。入れ途中でもその場で替わる・保存)
    pg.locator('#dVals button').first.click(); pg.wait_for_timeout(100)
    filled = pg.evaluate("__navi.pend.per.find(p => p.j === 0).its[__navi.pend.sel[0]].w")
    pg.click('#gearB'); pg.click('#inSeg button[data-v="reel"]'); pg.click('#setClose'); pg.wait_for_timeout(200)
    chk('設定でリールにするとその場でシートのリール・保存', pg.locator('#reels .reel').count() == 4 and pg.evaluate('__navi.cfg.input') == 'reel' and pg.evaluate("JSON.parse(localStorage.getItem('kajiNaviCfgV2')).input") == 'reel2' and not pg.is_visible('#dVals') and not pg.is_visible('#inTog'))
    chk(f'押した値はリールに残る({filled})', pg.evaluate("__navi.pend.per.find(p => p.j === 0).its[__navi.pend.sel[0]].w") == filled)
    pg.evaluate('__navi.closeReels()')
    pg.click('#gearB'); pg.click('#inSeg button[data-v="btn"]'); pg.click('#setClose'); pg.wait_for_timeout(200)
    chk('ボタンに戻すと保存から消える', pg.evaluate('__navi.cfg.input') == 'btn' and 'input' not in pg.evaluate("JSON.parse(localStorage.getItem('kajiNaviCfgV2'))"))
    # 3. 今の会心! は出さない(部品は残っている)。会心は値を入れる時の「会心が出た」(tests/t_rebuild.py)
    pg.evaluate("__navi.mut(s => { s.temp = 1850; })"); idle(pg)
    pg.evaluate("__navi.startAct(__navi.G.acts.find(a => a.t.id === 'tataku' && a.tg[0] === 1))"); pg.wait_for_timeout(150)
    pg.locator('#dVals button').nth(2).click(); idle(pg)
    if pg.evaluate('Array.isArray(__navi.s.lit)'): pg.locator('#board .cell.pick').first.click(); idle(pg)
    chk('叩いた後も今の会心!は出ない(部品はある)', not pg.is_visible('#critB') and not pg.is_visible('#critRow') and pg.evaluate("!!document.getElementById('critB') && !!document.getElementById('critP') && !!document.getElementById('critRow')"))
    # 7. 大きさ
    v0 = pg.evaluate("parseFloat(getComputedStyle(document.querySelector('#board .cell .v')).fontSize)")
    n0 = pg.evaluate("parseFloat(getComputedStyle(document.querySelector('.note')).fontSize)")
    pg.click('#gearB'); pg.click('#sizeSeg button[data-v="l"]'); pg.click('#setClose'); pg.wait_for_timeout(100)
    v1 = pg.evaluate("parseFloat(getComputedStyle(document.querySelector('#board .cell .v')).fontSize)")
    n1 = pg.evaluate("parseFloat(getComputedStyle(document.querySelector('.note')).fontSize)")
    g1 = pg.evaluate("parseFloat(getComputedStyle(document.getElementById('go')).fontSize)")
    chk(f'大: 盤面の値 {v0} → {v1}・打ったボタン {g1}・説明文はそのまま {n0} → {n1}', abs(v1 - v0 * 1.25) < 0.6 and abs(g1 - 19 * 1.25) < 0.6 and n0 == n1)
    pg.reload(); pg.wait_for_function('window.__navi && window.__navi.qs')
    chk('大きさは保存される', pg.evaluate("__navi.cfg.size") == 'l' and pg.evaluate("JSON.parse(localStorage.getItem('kajiNaviCfgV2')).size") == 'l')
    pg.click('#gearB'); pg.click('#sizeSeg button[data-v="s"]'); pg.click('#setClose'); pg.wait_for_timeout(100)
    chk('小は 0.9', abs(pg.evaluate("parseFloat(getComputedStyle(document.querySelector('#board .cell .v')).fontSize)") - v0 * 0.9) < 0.6)
    pg.click('#gearB'); pg.click('#sizeSeg button[data-v="m"]'); pg.click('#setClose')
    chk('中は保存に書かない(古い形のまま)', 'size' not in pg.evaluate("JSON.parse(localStorage.getItem('kajiNaviCfgV2'))"))
    chk(f'エラー無し {errs}', not errs)
    ctx.close()
    # 古い保存(size 無し・壊れた size)は中
    for sv in [{'focus': 250}, {'focus': 250, 'size': 'xx'}]:
        ctx = b.new_context(viewport={'width': 390, 'height': 844}); ctx.add_init_script(INIT % json.dumps(sv)); pg = ctx.new_page(); pg.goto(URL); pg.wait_for_function('window.__navi && window.__navi.qs')
        chk(f'古い保存 {sv} は中', pg.evaluate('__navi.cfg.size') == 'm' and pg.evaluate("getComputedStyle(document.documentElement).getPropertyValue('--k').trim()") == '1')
        ctx.close()

    # ---------- 小窓(380x420)だけで入れる ----------
    for mode in ['reel', 'btn']:
        errs = []
        ctx = b.new_context(viewport={'width': 1280, 'height': 800})
        ctx.add_init_script(INIT % json.dumps({'focus': 251, 'input': 'reel2'} if mode == 'reel' else {'focus': 251}) + PIP_STUB)
        pg = ctx.new_page(); pg.on('pageerror', lambda e: errs.append(str(e)))
        pg.goto(URL); pg.wait_for_function('window.__navi && window.__navi.qs'); idle(pg)
        pg.select_option('#item', 'hidane'); pg.wait_for_function('window.__navi.item === "hidane"'); idle(pg)
        pg.click('#gearB'); pg.click('#pipB'); pg.wait_for_timeout(300)
        D = "document.getElementById('pipF').contentDocument"
        H = lambda: pg.evaluate(f"{D}.documentElement.scrollHeight")
        pg.evaluate(f"__navi.mut({BASE})"); idle(pg); pg.wait_for_timeout(100)
        chk(f'[{mode}] 小窓: 収まる({H()})・商材とほかの手とねらいは出さない', H() <= 420 and pg.evaluate(f"!{D}.querySelector('#pItem').offsetParent && !{D}.querySelector('.why')"))
        if mode == 'reel': pg.evaluate(f"{D}.getElementById('pGo').click()"); pg.wait_for_timeout(200)
        else: chk('[btn] 小窓: 叩く手は「打った」を出さず、最初から値のボタン', pg.evaluate(f"!{D}.getElementById('pGo')") and not pg.evaluate('!!__navi.pend'))
        chk(f'[{mode}] 小窓: ' + ('打った → ' if mode == 'reel' else '') + f'値のボタン({H()})', pg.evaluate(f"{D}.querySelectorAll('.pv button').length") > 0 and H() <= 420)
        if mode == 'btn': pg.locator('#pipF').screenshot(path=f'{OUT}/ui_pip_input.png')
        w = pg.evaluate(f"(() => {{ const b = {D}.querySelectorAll('.pv button')[2]; const w = +b.textContent; b.click(); return w; }})()"); idle(pg)
        chk(f'[{mode}] 小窓: 1マスは押したら決まる({w})', not pg.evaluate('!!__navi.pend') and pg.evaluate('__navi.s.v[0]') == w)
        pg.evaluate(f"__navi.mut({BASE})"); idle(pg)
        pg.evaluate("__navi.startAct(__navi.G.acts.find(a => a.t.id === 'yonren' && a.tg.length === 4))"); pg.wait_for_timeout(200)
        got = []
        for k in range(4):
            cur = pg.evaluate('__navi.pend.cur')
            got.append([cur, pg.evaluate(f"(() => {{ const b = [...{D}.querySelectorAll('.pv button')].filter(b => !b.classList.contains('ov')).pop() || {D}.querySelector('.pv button'); b.click(); return +b.textContent; }})()")])
            pg.wait_for_timeout(100)
            chk(f'[{mode}] 小窓: 4連 {k+1}マス目 収まる({H()})', H() <= 420)
        chk(f'[{mode}] 小窓: 4連は順に {got}', [g[0] for g in got] == [0, 1, 2, 3])
        if mode == 'reel': chk('[reel] 小窓で入れた値が本画面のリールにも', pg.evaluate("__navi.pend.per.every(p => p.its[__navi.pend.sel[p.j]].w === " + json.dumps({str(g[0]): g[1] for g in got}) + "[p.j])"))
        pg.evaluate(f"{D}.getElementById('pOk').click()"); pg.wait_for_timeout(200)
        chk(f'[{mode}] 小窓: 決定で入る', not pg.evaluate('!!__navi.pend') and pg.evaluate('[0,1,2,3].map(i => __navi.s.v[i])') == [g[1] for g in got])
        idle(pg)
        # 叩いた後: 会心は1行
        if pg.evaluate('Array.isArray(__navi.s.lit)'): pg.evaluate(f"{D}.querySelector('.c.pick').click()"); idle(pg)
        chk(f'[{mode}] 小窓: 叩いた後 今の会心! の行は出ない({H()})', pg.evaluate(f"{D}.querySelectorAll('.cr').length") == 0 and pg.evaluate(f"!({D}.getElementById('pCrit') && {D}.getElementById('pCrit').offsetParent)") and H() <= 420)
        # 戻り(虹色のオーブ)
        pg.select_option('#item', 'orb'); idle(pg)
        pg.evaluate("__navi.mut(s => { const G = __navi.G; s.first = false; s.temp = 450; s.F = 200; s.lit = null; for(const i of G.active){ const z = G.cells[i]; s.v[i] = Math.floor(z[0] * 0.7) + i; } })"); idle(pg)
        j = pg.evaluate("__navi.G.active[0]")
        pg.evaluate(f"(() => {{ __navi.startAct(__navi.G.acts.find(x => x.t.id === 'tataku' && x.tg.includes({j}))); __navi.commitReels({{ {j}: __navi.s.v[{j}] + 7 }}); }})()"); pg.wait_for_timeout(200)
        chk(f'[{mode}] 小窓: 戻りの値ボタン({H()})', pg.evaluate('!!(__navi.pend && __navi.pend.ret)') and pg.evaluate(f"{D}.querySelectorAll('.pv button').length") == 5 and H() <= 420)
        if mode == 'btn': pg.locator('#pipF').screenshot(path=f'{OUT}/ui_pip_ret.png')
        pred = pg.evaluate('__navi.pend.retPred'); other = pg.evaluate(f"__navi.G.active.find(i => i !== {pred})"); ov = pg.evaluate(f'__navi.s.v[{other}]')
        pg.evaluate(f"{D}.querySelector('.chp[data-j=\"{other}\"]').click()"); pg.wait_for_timeout(100)
        pg.evaluate(f"{D}.querySelectorAll('.pv button')[0].click()"); pg.wait_for_timeout(200)
        chk(f'[{mode}] 小窓: 戻りのマスを選び直して入れる', not pg.evaluate('!!__navi.pend') and pg.evaluate(f'__navi.s.v[{other}]') == max(0, ov - 16))
        pg.select_option('#item', 'hidane'); idle(pg)
        chk(f'[{mode}] エラー無し {errs}', not errs)
        ctx.close()
    b.close()
print('ALL OK' if not ng else f'NG {len(ng)}: {ng}')
