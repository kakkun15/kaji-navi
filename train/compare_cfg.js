// 条件(Lv・ハンマー・★・開始の集中力)を変えて打った成績。重みの代わりに scripted で規則の打ち手。
// node compare_cfg.js <商材> <重み|scripted> <局数> <種>   環境変数 LV HAM STAR FOC
'use strict';
const fs = require('fs');
const GAME = require('../src/game.js'), V = require('../src/value.js');
const { scripted, seeded } = require('./scripted.js');
const [item, wfile, N = 300, SEED = 900] = process.argv.slice(2).map((x, i) => i < 2 ? x : +x);
const cfg = { item, level: +(process.env.LV || 75), hammer: process.env.HAM || 'hikari', star: +(process.env.STAR || 3), focus: +(process.env.FOC || 242) };
const G = GAME.setup(cfg);
let net = null;
if (wfile !== 'scripted') {
  const j = JSON.parse(fs.readFileSync(wfile));
  net = { sizes: j.sizes, L: j.L.map(l => ({ n: l.n, m: l.m, W: Float32Array.from(l.W), b: Float32Array.from(l.b) })) };
  net.ver = j.sizes[0] === V.featLen(G, 1) ? 1 : j.sizes[0] === V.featLen(G, 3) ? 3 : 2;
}
const st = { great: 0, over: 0, under: 0, errfail: 0 };
const t0 = Date.now();
for (let g = 0; g < N; g++) {
  const r = seeded(SEED * 100003 + g);
  const s = GAME.newState(G), ideal = G.cells.map(z => z ? z[0] + Math.floor(r() * (z[1] - z[0] + 1)) : null);
  const opt = { K: 12, rnd: seeded(SEED * 7 + g), buf: net && new Float32Array(V.featLen(G, net.ver)) };
  for (let k = 0; k < 80 && !s.dead; k++) {
    let a;
    if (net) { const qs = V.evalActs(net, G, s, opt); a = qs.reduce((x, y) => y.q > x.q ? y : x).a; }
    else a = scripted(G, s);
    if (!a) break;
    GAME.play(G, s, a, ideal, r);
  }
  const jj = GAME.judge(G, s, ideal);
  if (jj.great) st.great++; else if (jj.over) st.over++; else if (!jj.reached) st.under++; else st.errfail++;
}
for (const k in st) st[k] = +(st[k] / N).toFixed(3);
console.log(JSON.stringify({ ...cfg, w: require('path').basename(wfile), N, ...st, sec: ((Date.now() - t0) / N / 1000).toFixed(2) }));
