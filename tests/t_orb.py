# 虹色のオーブの戻り: まとめての途中の戻りで止まる・推奨の理由の戻りの1言・超える値の見た目・盤面の超えた・次の戻りの表示・戻りの帯の見出し。
# python3 tests/t_orb.py   スクショは OUT(既定 /tmp)に出す。推奨は重みで変わるので、局面は「その手が推奨になる物」を探して使う
import os, json
from playwright.sync_api import sync_playwright
OUT = os.environ.get('OUT', '/tmp')
ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
URL = 'file://' + os.path.join(ROOT, 'dist', 'app.html')
ng = []
def chk(name, ok):
    print(('OK ' if ok else 'NG ') + name)
    if not ok: ng.append(name)
def idle(pg):
    pg.wait_for_function('window.__navi && !window.__navi.busy && (window.__navi.qs || Array.isArray(window.__navi.s.lit) || window.__navi.s.dead || (window.__navi.pend && window.__navi.pend.ret))'); pg.wait_for_timeout(150)
INIT = "if(!sessionStorage.getItem('x')){ sessionStorage.setItem('x','1'); localStorage.clear(); localStorage.setItem('kajiNaviCfgV2', '%s'); localStorage.setItem('kajiNaviPowerV1','normal'); localStorage.setItem('kajiNaviVoiceV1','0'); localStorage.setItem('kajiNaviWhyOpen','%s'); localStorage.setItem('kajiNaviV1', JSON.stringify({item:'orb'})); }"
def page(b, w, h, cfg, why='1'):
    ctx = b.new_context(viewport={'width': w, 'height': h}, has_touch=True, is_mobile=True, device_scale_factor=2)
    ctx.add_init_script(INIT % (json.dumps(cfg), why))
    pg = ctx.new_page(); errs = []; pg.on('pageerror', lambda e: errs.append(str(e)))
    pg.goto(URL); pg.wait_for_function('window.__navi && window.__navi.s'); idle(pg)
    pg.select_option('#item', 'orb'); pg.wait_for_function('window.__navi.item === "orb"'); idle(pg)
    return ctx, pg, errs
def put(pg, t, v, F):
    pg.evaluate("(a) => __navi.mut(s => { s.temp = a[0]; s.v = a[1].slice(); s.first = false; s.F = a[2]; s.lit = null; s.hs = 0; })", [t, v, F]); idle(pg); pg.wait_for_timeout(150)
def best(pg): return pg.evaluate("(() => { const a = __navi.qs && __navi.qs[0] && __navi.qs[0].a; return a ? a.t.id + ':' + a.tg.join(',') : 'stop'; })()")
def why(pg): return pg.evaluate("(document.querySelector('#rec .why') || {}).innerText || ''")
def nr(pg): return pg.evaluate("(document.querySelector('#rec .nr') || {}).innerText || ''")
# want(pg) が真になる局面を探す(候補の局面 × 集中力)
def find(pg, cands, want):
    for t, v in cands:
        for F in [120, 200, 60]:
            put(pg, t, v, F)
            if want(pg): return (t, v, F)
    return None
NUMS = "() => ({ b: Math.max(...[...document.querySelectorAll('#board .cell .v')].map(c => c.getBoundingClientRect().bottom)), f: document.querySelector('.foot').getBoundingClientRect().top })"
# 値ボタンがはみ出していない(横の端・ボタンの中身)
FIT = "() => [...document.querySelectorAll('#dVals button')].every(b => { const r = b.getBoundingClientRect(); return r.right <= innerWidth + 0.5 && r.left >= -0.5 && b.scrollWidth <= b.clientWidth + 1; })"
AMB = 'rgb(255, 207, 92)'

with sync_playwright() as p:
    b = p.chromium.launch(executable_path='/opt/pw-browsers/chromium')
    for (w, h, size) in [(390, 844, 'm'), (390, 640, 'l')]:
        tag = f'{w}x{h} {size}'
        ctx, pg, errs = page(b, w, h, {'focus': 251, 'size': size})

        # ---- まとめて: 途中で200の倍数に当たる時は、そこで止めて戻りの帯を出す ----
        st = find(pg, [(400, [70, 154, 72, 155, 71, 42]), (1000, [30, 40, 30, 40, 30, 20]), (400, [60, 100, 90, 100, 90, 60])],
                  lambda pg: pg.is_visible('#chainB'))
        chk(f'[{tag}] まとめての局面が見つかる {st}', st is not None)
        if st:
            n = int(pg.inner_text('#chainB').split('\n')[0].lstrip('×')); t0 = pg.evaluate('__navi.s.temp')
            dT = pg.evaluate('__navi.qs[0].a.t.dT'); temps = [t0 + dT * (k + 1) for k in range(n)]
            hit = [x for x in temps if x % 200 == 0]
            chk(f'[{tag}] まとめての回数は最初の戻りの温度まで(×{n} {temps})', not hit or hit[0] == temps[-1])
            if hit: chk(f'[{tag}] 理由の文: {hit[0]}℃にする → 戻り「{why(pg)}」', why(pg).startswith(f'{hit[0]}℃にする → 戻り: ') and '12〜16減る(約' in why(pg))
            pg.screenshot(path=f'{OUT}/orb_{h}_chain.png')
            pg.click('#chainB'); idle(pg)
            if hit:
                j = pg.evaluate('__navi.pend && __navi.pend.ret ? __navi.pend.per[0].j : -1'); fr = pg.evaluate(f'__navi.s.v[{j}]')
                chk(f'[{tag}] まとめて: {hit[0]}℃で止まって戻りの帯(温度 {pg.evaluate("__navi.s.temp")})', pg.evaluate('__navi.s.temp') == hit[0] and j >= 0
                    and pg.evaluate("document.querySelector('.foot').classList.contains('ret')"))
                big = pg.inner_text('#rec .bigh')
                chk(f'[{tag}] 戻りの帯の見出しに減る前の値「{big}」', big.replace('\n', ' ').endswith(f'{fr}→'))
                vs = pg.evaluate("[...document.querySelectorAll('#dVals button')].map(b => ({ w: +b.textContent, pv: b.classList.contains('pv') }))")
                chk(f'[{tag}] 戻りのボタンは減った後の値・予想(14減)が濃い {vs}', [x['w'] for x in vs] == [fr - 16 + k for k in range(5)] and [x['w'] for x in vs if x['pv']] == [fr - 14])
                pg.screenshot(path=f'{OUT}/orb_{h}_chain_ret.png')
                pg.click('#dVals button.pv'); idle(pg)
                chk(f'[{tag}] 戻りを入れたら推奨し直す(値 {fr - 14}・温度 {hit[0]})', pg.evaluate(f'__navi.s.v[{j}]') == fr - 14 and pg.evaluate('!__navi.pend') and pg.evaluate('__navi.s.temp') == hit[0] and not pg.evaluate('__navi.s.ret'))
            else:
                chk(f'[{tag}] まとめて: 戻りが無ければ最後まで', pg.evaluate('__navi.s.temp') == temps[-1])

        # ---- 叩いた後の温度が200の倍数: 「この後 600℃で戻り: 左上が12〜16減る(約81〜85)」 ----
        st = find(pg, [(650, [97, 88, 87, 95, 118, 82]), (1050, [80, 120, 100, 120, 100, 70]), (850, [70, 130, 100, 130, 100, 70])],
                  lambda pg: pg.evaluate("!!(__navi.qs[0].a && __navi.qs[0].a.t.area && (__navi.s.temp + __navi.qs[0].a.t.dT) % 200 === 0)"))
        chk(f'[{tag}] 叩いた後に戻りの局面が見つかる {st}', st is not None)
        if st:
            T = st[0] + pg.evaluate('__navi.qs[0].a.t.dT')
            chk(f'[{tag}] 理由の文「{why(pg)}」', f'この後 {T}℃で戻り: ' in why(pg) and '12〜16減る(約' in why(pg))
            chk(f'[{tag}] 次の戻り「{nr(pg)}」', nr(pg).startswith(f'次の戻り {T}℃・'))
            pg.screenshot(path=f'{OUT}/orb_{h}_why_ret.png')

        # ---- わざと超える手: 超える値は黄色(取り消し線なし)・「戻り後 約○○」・盤面の超えたマスは「+4・戻りで減る」 ----
        st = find(pg, [(850, [66, 152, 72, 123, 109, 52]), (1250, [90, 150, 118, 120, 118, 88]), (650, [90, 151, 118, 144, 118, 88])],
                  lambda pg: pg.evaluate("[...document.querySelectorAll('#dVals button.ov')].length > 0"))
        chk(f'[{tag}] 超える値の局面が見つかる {st}', st is not None)
        if st:
            bt = pg.evaluate("[...document.querySelectorAll('#dVals button.ov')].map(b => ({ my: b.classList.contains('my'), ra: b.dataset.ra || '', w: +b.textContent, c: getComputedStyle(b).color, d: getComputedStyle(b).textDecorationLine }))")
            chk(f'[{tag}] 超える値は黄色・取り消し線なし {bt[0]}', all(x['my'] and x['c'] == AMB and x['d'] == 'none' for x in bt))
            ra = [x for x in bt if x['ra']]
            chk(f'[{tag}] 次の戻りで減る見込みなら「戻り後 約○○」(14減) {[x["ra"] for x in ra]}', all(x['ra'].replace('\n', ' ') == f'戻り後 約{x["w"] - 14}' for x in ra))
            chk(f'[{tag}] 値ボタンの文字(textContent)は値だけ', pg.evaluate("[...document.querySelectorAll('#dVals button')].every(b => /^\\d+$/.test(b.textContent))"))
            chk(f'[{tag}] 値ボタンがはみ出さない', pg.evaluate(FIT))
            if st[0] == 850: chk(f'[{tag}] わざと超える: 理由の文「{why(pg)}」', why(pg).startswith('わざと超える。') and why(pg).count('わざと') == 1)
            pg.screenshot(path=f'{OUT}/orb_{h}_over_vals.png')
        put(pg, 850, [66, 152, 72, 123, 109, 52], 120)
        c1 = pg.evaluate("(() => { const c = document.querySelector('#board .cell[data-i=\"1\"]'); return { cls: c.className, need: c.querySelector('.need').innerText, col: getComputedStyle(c.querySelector('.v')).color }; })()")
        n1 = nr(pg)
        chk(f'[{tag}] 盤面の超えたマス(次の戻りで減る) {c1}', 'movr' in c1['cls'] and c1['need'] == '+4・戻りで減る' and c1['col'] == AMB)
        chk(f'[{tag}] 次の戻りの行「{n1}」', n1.startswith('次の戻り ') and n1.endswith('・右上'))
        put(pg, 400, [70, 154, 72, 155, 71, 42], 120)
        c1 = pg.evaluate("(() => { const c = document.querySelector('#board .cell[data-i=\"1\"]'); return { need: c.querySelector('.need').innerText, col: getComputedStyle(c.querySelector('.v')).color }; })()")
        c3 = pg.evaluate("document.querySelector('#board .cell[data-i=\"3\"] .need').innerText")
        chk(f'[{tag}] 超えたマスでも減らないなら「140〜148・+6」だけ {c1} / 減る方は「{c3}」', c1['need'] == '140〜148・+6' and c1['col'] == AMB and c3 == '+7・戻りで減る')

        # ---- 熱風おろしで200の倍数をまたぐ: 「1400℃の戻りをまたぐ」 ----
        st = find(pg, [(1500, [72, 142, 58, 140, 60, 64]), (1100, [72, 142, 58, 140, 60, 64]), (900, [72, 142, 58, 140, 60, 64])],
                  lambda pg: best(pg).startswith('neppuu:'))
        if st:
            M = (st[0] - 1) // 200 * 200; nt = st[0] - 150
            if M > nt: chk(f'[{tag}] 熱風おろし: 理由の文「{why(pg)}」・次の戻り「{nr(pg)}」', why(pg).endswith(f'{M}℃の戻りをまたぐ') and nr(pg).startswith(f'次の戻り {nt // 200 * 200}℃'))
            pg.screenshot(path=f'{OUT}/orb_{h}_neppuu.png')
        else: print('(熱風おろしが推奨の局面は見つからなかった。飛ばす)')

        # ---- 詳細をたたんだ時(既定)も次の戻りは出る・盤面の数字が下の帯に隠れない ----
        if pg.get_attribute('#detB', 'aria-expanded') == 'true': pg.click('#detB'); pg.wait_for_timeout(100)      # 詳細をたたむ(既定と同じ)
        for t, v, F in [(400, [70, 154, 72, 155, 71, 42], 120), (850, [66, 152, 72, 123, 109, 52], 120), (650, [97, 88, 87, 95, 118, 82], 120), (1300, [80, 100, 90, 100, 90, 60], 200)]:
            put(pg, t, v, F); r = pg.evaluate(NUMS)
            chk(f'[{tag}] たたんだ時 {t}℃: 次の戻りが見える「{nr(pg)}」・数字が隠れない {r}・値ボタンがはみ出さない', pg.is_visible('#rec .nr') and r['b'] <= r['f'] and pg.evaluate(FIT))
        pg.screenshot(path=f'{OUT}/orb_{h}_fold.png')
        chk(f'[{tag}] エラー無し {errs}', not errs); ctx.close()

    # ---- オーブ以外は今のまま(次の戻りの行・黄色は出ない) ----
    ctx, pg, errs = page(b, 390, 844, {'focus': 251})
    pg.select_option('#item', 'hidane'); pg.wait_for_function('window.__navi.item === "hidane"'); idle(pg)
    for t, v in [(1100, [0, 0, 0, 0, 0, 0]), (850, [170, 240, 200, 240, 200, 140])]:
        put(pg, t, v, 200)
        chk(f'ひだね {t}℃: 次の戻りの行・黄色・戻り後 は出ない', pg.evaluate("!document.querySelector('#rec .nr') && !document.querySelector('.vbs button.my, .vbs button[data-ra], #board .cell.movr')"))
    chk(f'ひだね: エラー無し {errs}', not errs); ctx.close()
    b.close()
print('ALL OK' if not ng else f'NG {len(ng)}: {ng}')
