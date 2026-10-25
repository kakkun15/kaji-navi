# 公開用に、src の各ページへ計算のファイル(core.js・game.js・value.js)と学習済みの重みを埋め込んで dist/ に出す。
#   python3 build.py
import pathlib, json
root = pathlib.Path(__file__).parent
src = root / 'src'
out = root / 'dist'; out.mkdir(exist_ok=True)

# 商材ごとに使う重み(train/ の中)。無ければ次の候補を使う
WEIGHTS = {
    'lamp':   ['w_lamp_v3_best.json'],
    'hidane': ['w_hidane_h128_best.json'],
    'hammer': ['w_hammer_v3c_best.json', 'w_hammer_v3_best.json', 'w_hammer.json'],
    'pan':    ['w_pan_v3c_best.json', 'w_pan_v3b_best.json', 'w_pan_v3_best.json'],
    'orb':    ['w_orb_best.json', 'w_orba1_best.json'],   # 虹色のオーブ: ひだねの重みから戻りの地金で学び直し(2026-10-25)
    'needle': ['w_needle_r0_best.json'],     # 光のさいほう針: rule0.js をお手本に学習(2026-10-21)
}

def rounded(x):
    return float('%.5g' % x)

def weights_js():
    obj = {}
    for key, cands in WEIGHTS.items():
        for name in cands:
            p = root / 'train' / name
            if p.exists():
                j = json.loads(p.read_text())
                obj[key] = {'sizes': j['sizes'], 'src': name,
                            'L': [{'n': l['n'], 'm': l['m'], 'W': [rounded(v) for v in l['W']], 'b': [rounded(v) for v in l['b']]} for l in j['L']]}
                break
    return 'window.KAJI_WEIGHTS = ' + json.dumps(obj, separators=(',', ':')) + ';'

parts = {
    'core.js': (src / 'core.js').read_text(),
    'game.js': (src / 'game.js').read_text(),
    'value.js': (src / 'value.js').read_text(),
    'pool.js': (src / 'pool.js').read_text(),       # PC 向けの並列の読み(Worker)
    'rule0.js': (src / 'rule0.js').read_text(),     # 許容誤差0の商材の仮の打ち方(光のさいほう針)
    'voice.js': (src / 'voice.js').read_text(),     # ずんだもんの声(VOICEVOX:ずんだもん)
}
wjs = None
for p in src.glob('*.html'):
    h = p.read_text()
    for name, code in parts.items():
        h = h.replace(f'<script src="{name}"></script>', f'<script data-src="{name}">\n' + code + '\n</script>')
    if '<script src="weights.js"></script>' in h:
        if wjs is None:
            wjs = weights_js()
        h = h.replace('<script src="weights.js"></script>', '<script>\n' + wjs + '\n</script>')
    (out / p.name).write_text(h)
    print('built', out / p.name, len(h))
(out / '_headers').write_text('/*\n  X-Robots-Tag: noindex, nofollow\n')
(out / 'robots.txt').write_text('User-agent: *\nDisallow: /\n')
