// 必殺がたまった後の打ち方を比べる(同じ局・同じチャージの時)。手数と大成功率。
// node train/sim_hsfast.js <重み> <局数> <種> [始め]   環境変数 LEVEL・FOCUS(既定 80・253)、OVERPEN(既定 0.6)
// 打ち方: base(今) / big(寄せる手の消費を気にしない) / heat2(先に火力上げ2回) / heat2big(両方)
// チャージは「叩いた後に10%」(sim_hs.js の mid と同じ)。必殺なしの局も一緒に打つ。結果は train/res_hsfast_<打ち方>_<種>_<始め>.txt
'use strict';
const fs = require('fs');
const GAME = require('../src/game.js'), V = require('../src/value.js');
const { seeded } = require('./scripted.js');
const [wfile, N = 100, SEED = 300, START = 0] = process.argv.slice(2).map((x, i) => i === 0 ? x : +x);
const j = JSON.parse(fs.readFileSync(wfile));
const G = GAME.setup({ item: 'hidane', level: +(process.env.LEVEL || 80), hammer: 'hikari', star: 3, focus: +(process.env.FOCUS || 253) });
const net = { sizes: j.sizes, L: j.L.map(l => ({ n: l.n, m: l.m, W: Float32Array.from(l.W), b: Float32Array.from(l.b) })), ver: 2 };
const STY = { base: {}, big: { hsCostW: 0 }, heat2: { heat: 2 }, heat2big: { heat: 2, hsCostW: 0 } };
const names = (process.env.STY || 'base,big,heat2,heat2big').split(',');
function playOne(g, sty) {
  const r = seeded(SEED * 100003 + g), rc = seeded(SEED * 31 + g);
  const s = GAME.newState(G), ideal = G.cells.map(z => z ? z[0] + Math.floor(r() * (z[1] - z[0] + 1)) : null);
  const opt = Object.assign({ K: 12, overPen: +(process.env.OVERPEN || 0.6), rnd: seeded(SEED * 7 + g), buf: new Float32Array(V.featLen(G, 2)) }, sty);
  let charged = -1, fired = -1, hits = 0, heats = 0, moves = 0;
  for (let step = 0; step < 80 && !s.dead; step++) {
    const qs = s.hs ? V.evalActsHS(net, G, s, opt) : V.evalActs(net, G, s, opt);
    const best = s.hs ? qs[0] : qs.reduce((a, b) => b.q > a.q ? b : a);
    if (!best.a) break;
    if (s.hs === 1) { moves++; if (best.a.t.area) hits++; if (best.a.t.id === 'karyoku') { heats++; if (opt.hsHeatLeft > 0) opt.hsHeatLeft--; } }
    if (best.a.t.hs) fired = step;
    GAME.play(G, s, best.a, ideal, r);
    if (Array.isArray(s.lit)) s.lit = s.lit[Math.floor(r() * s.lit.length)];
    const u = rc();
    if (charged < 0 && best.a.t.area && u < 0.1) { s.hs = 1; charged = step; opt.hsHeatLeft = sty.heat || 0; }
  }
  return { g: GAME.judge(G, s, ideal).great ? 1 : 0, ch: charged >= 0 ? 1 : 0, fi: fired >= 0 ? 1 : 0, moves, hits, heats };
}
const out = {}; for (const n of names) out[n] = [];
const t0 = Date.now();
for (let g = START; g < START + N; g++) for (const n of names) out[n].push(playOne(g, STY[n]));
for (const n of names) {
  const L = out[n], ch = L.filter(x => x.ch && x.fi);
  const avg = k => (ch.reduce((a, x) => a + x[k], 0) / Math.max(1, ch.length)).toFixed(2);
  console.log(JSON.stringify({ sty: n, N, great: +(L.reduce((a, x) => a + x.g, 0) / N).toFixed(4), charged: L.filter(x => x.ch).length, fired: ch.length, moves: +avg('moves'), hits: +avg('hits'), heats: +avg('heats') }));
  fs.writeFileSync(`${__dirname}/res_hsfast_${n}_${SEED}_${START}.txt`, L.map(x => [x.g, x.ch, x.fi, x.moves, x.hits, x.heats].join(',')).join('\n'));
}
console.log('sec/局(4通り)', ((Date.now() - t0) / N / 1000).toFixed(1));
