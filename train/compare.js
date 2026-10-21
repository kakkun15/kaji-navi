// 学んだ見積もりで打った成績。node compare.js <商材> <重み> <局数> <種> [1|2(先読みの深さ)]
// 環境変数 OVERPEN(超える罰。既定0 = ネットだけの強さ。鍛冶ナビと同じに打たせるなら 1)
'use strict';
const fs = require('fs');
const GAME = require('../src/game.js'), V = require('../src/value.js');
const { seeded } = require('./scripted.js');
const [item, wfile, N = 500, SEED = 500, DEPTH = 1] = process.argv.slice(2).map((x, i) => i < 2 ? x : +x);
const j = JSON.parse(fs.readFileSync(wfile));
const G = GAME.setup({ item, level: 75, hammer: 'hikari', star: 3, focus: 242 });
const net = { sizes: j.sizes, L: j.L.map(l => ({ n: l.n, m: l.m, W: Float32Array.from(l.W), b: Float32Array.from(l.b) })) };
net.ver = j.sizes[0] === V.featLen(G, 1) ? 1 : j.sizes[0] === V.featLen(G, 3) ? 3 : 2;
const st = { great: 0, over: 0, under: 0, errfail: 0 }; const res = [];
const t0 = Date.now();
for (let g = 0; g < N; g++) {
  const r = seeded(SEED * 100003 + g);
  const s = GAME.newState(G), ideal = G.cells.map(z => z ? z[0] + Math.floor(r() * (z[1] - z[0] + 1)) : null);
  const opt = { K: +(process.env.K || 12), N2: +(process.env.N2 || 4), K2: +(process.env.K2 || 8), overPen: +(process.env.OVERPEN || 0), rnd: seeded(SEED * 7 + g), buf: new Float32Array(V.featLen(G, net.ver)) };
  for (let k = 0; k < 80 && !s.dead; k++) {
    let best;
    if (DEPTH === 2) { const qs = V.evalActs2(net, G, s, opt); best = qs.reduce((a, b) => b.q2 > a.q2 ? b : a); }
    else { const qs = V.evalActs(net, G, s, opt); best = qs.reduce((a, b) => b.q > a.q ? b : a); }
    if (!best.a) break;
    GAME.play(G, s, best.a, ideal, r);
  }
  const jj = GAME.judge(G, s, ideal);
  res.push(jj.great ? 1 : 0);
  if (jj.great) st.great++; else if (jj.over) st.over++; else if (!jj.reached) st.under++; else st.errfail++;
}
for (const k in st) st[k] = +(st[k] / N).toFixed(3);
console.log(JSON.stringify({ item, wfile, N, SEED, DEPTH, ...st, sec: ((Date.now() - t0) / N / 1000).toFixed(2) }));
fs.writeFileSync(`${__dirname}/res_${item}_${require('path').basename(wfile)}_${SEED}_${DEPTH}${process.env.OVERPEN ? '_p' + process.env.OVERPEN : ''}.txt`, res.join(''));
