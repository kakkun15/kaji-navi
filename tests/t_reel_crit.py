# リールのシートの「会心が出た」が、ボタンの入れ方の「会心が出た」と同じ見当になるか。低い画面では必殺を帯にしないか。
#   python3 tests/t_reel_crit.py
import json, pathlib
from playwright.sync_api import sync_playwright
URL = 'file://' + str(pathlib.Path(__file__).resolve().parent.parent / 'dist' / 'app.html')
ONE = "__navi.mut(s => { s.first=false; s.temp=2050; s.F=181; s.lit=null; s.hs=0; s.dead=false; s.lastHit=null; s.v=[172,55,55,27,0,0]; })"
ng = []
def chk(n, ok, x=''):
    print(('OK ' if ok else 'NG ') + n + ('' if ok else ' ' + str(x)))
    if not ok: ng.append(n)
def idle(pg): pg.wait_for_function('window.__navi && !__navi.busy && (__navi.qs || Array.isArray(__navi.s.lit) || __navi.s.dead)', timeout=60000); pg.wait_for_timeout(100)
def start(b, inp, h=844):
    pg = b.new_page(viewport={'width': 390, 'height': h}); pg.add_init_script("if(!localStorage.getItem('kajiNaviCfgV2')){ localStorage.setItem('kajiNaviCfgV2', JSON.stringify(%s)); localStorage.setItem('kajiNaviVoiceV1','0'); }" % json.dumps({'focus': 251, **({'input': 'reel2'} if inp == 'reel' else {})}))
    pg.goto(URL); idle(pg); pg.select_option('#item', 'hidane'); idle(pg); pg.evaluate(ONE); idle(pg); return pg
with sync_playwright() as p:
    b = p.chromium.launch(executable_path='/opt/pw-browsers/chromium')
    # ボタン: 会心オンで 183
    pg = start(b, 'btn'); pg.click('#critSw'); pg.click('#dVals button:text-is("183")'); idle(pg)
    belB = pg.evaluate('JSON.stringify(__navi.s.bel[0])'); vB = pg.evaluate('__navi.s.v[0]')
    # ボタン: 会心オフで 183
    pg = start(b, 'btn'); pg.click('#dVals button:text-is("183")'); idle(pg); belN = pg.evaluate('JSON.stringify(__navi.s.bel[0])')
    # リール: シートで 183 に合わせ、会心が出た をオン
    pg = start(b, 'reel'); pg.click('#go'); pg.wait_for_selector('#reelM.show')
    k = pg.evaluate("__navi.pend.per[0].its.findIndex(x => x.w === 183 && x.tag !== 'n')")
    pg.evaluate(f"(() => {{ const el = document.getElementById('rl0'); el.scrollTop = {k} * 44; }})()"); pg.wait_for_timeout(400)
    chk('リール: 会心が出た が出る', pg.is_visible('#reelCrit .critsw'))
    pg.click('#reelCrit .critsw'); pg.click('#reelOk'); idle(pg)
    belR = pg.evaluate('JSON.stringify(__navi.s.bel[0])')
    chk('リール+会心オン = ボタン+会心オン', belR == belB and pg.evaluate('__navi.s.v[0]') == vB == 183, (belR[:80], belB[:80]))
    chk('会心オンとオフは違う見当', belB != belN)
    # リール: オフのままなら ボタンのオフと同じ
    pg = start(b, 'reel'); pg.click('#go'); pg.wait_for_selector('#reelM.show')
    pg.evaluate(f"(() => {{ const el = document.getElementById('rl0'); el.scrollTop = {k} * 44; }})()"); pg.wait_for_timeout(400); pg.click('#reelOk'); idle(pg)
    chk('リール+会心オフ = ボタン+会心オフ', pg.evaluate('JSON.stringify(__navi.s.bel[0])') == belN)
    # 低い画面: 必殺は帯にしない(温度の横のまま色が付く)。高い画面は帯
    for h, band in ((640, False), (844, True)):
        pg = start(b, 'btn', h); pg.evaluate(ONE.replace('s.hs=0', 's.hs=1')); idle(pg)
        chk(f'高さ{h}: 必殺の帯は{"出る" if band else "出ない"}', pg.evaluate("!document.getElementById('hsRow').hidden") == band and pg.evaluate("document.getElementById('hsB').classList.contains('hs1')"))
    b.close()
print('ALL OK' if not ng else f'NG {len(ng)}: {ng}')
