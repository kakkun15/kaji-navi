# 必殺を「効果中」にしたら1ターン進む(温度 −50・戻すで戻る)。ボタンでも setHs(2) でも同じ
#   python3 tests/t_hs_turn.py
import pathlib, json
from playwright.sync_api import sync_playwright
URL = 'file://' + str(pathlib.Path(__file__).resolve().parent.parent / 'dist' / 'app.html')
ng = []
def chk(n, ok, x=''):
    print(('OK ' if ok else 'NG ') + n + ('' if ok else ' ' + str(x)))
    if not ok: ng.append(n)
def idle(pg): pg.wait_for_function('window.__navi && !__navi.busy && (__navi.qs || Array.isArray(__navi.s.lit) || __navi.s.dead)', timeout=60000); pg.wait_for_timeout(100)
SET = "__navi.mut(s => { s.first=false; s.temp=1450; s.F=150; s.lit=null; s.hs=1; s.dead=false; s.lastHit=null; s.v=[120,150,140,150,140,90]; })"
with sync_playwright() as p:
    b = p.chromium.launch(executable_path='/opt/pw-browsers/chromium')
    for how in ('button', 'api'):
        pg = b.new_page(viewport={'width': 390, 'height': 844})
        pg.add_init_script("if(!localStorage.getItem('kajiNaviCfgV2')){ localStorage.setItem('kajiNaviCfgV2', JSON.stringify({focus:251})); localStorage.setItem('kajiNaviVoiceV1','0'); }")
        pg.goto(URL); idle(pg); pg.select_option('#item', 'hidane'); idle(pg); pg.evaluate(SET); idle(pg)
        n0 = pg.evaluate('__navi.hist.length')
        if how == 'button': pg.click('#hsB')
        else: pg.evaluate('__navi.setHs(2)')
        idle(pg)
        st = pg.evaluate('({T:__navi.s.temp, F:__navi.s.F, hs:__navi.s.hs, n:__navi.hist.length, u:__navi.hist[__navi.hist.length-1]._u})')
        chk(f'{how}: 効果中で温度 −50・集中力そのまま・履歴に1手', st['T'] == 1400 and st['F'] == 150 and st['hs'] == 2 and st['n'] == n0 + 1 and st['u'] == 'ヘパイトスの炎', st)
        if how == 'api':
            pg.evaluate('__navi.setHs(2)'); idle(pg)
            chk('api: もう一度 setHs(2) でも進まない', pg.evaluate('__navi.s.temp') == 1400)
        pg.click('#undo'); idle(pg)
        chk(f'{how}: 戻すで元に戻る', pg.evaluate('__navi.s.temp') == 1450 and pg.evaluate('__navi.s.hs') == 1)
    b.close()
print('ALL OK' if not ng else f'NG {len(ng)}: {ng}')
