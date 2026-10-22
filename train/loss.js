// 負け方の集計(1手読み)。node loss.js <商材> <重み> <局数> <種>
// 環境変数: LEVEL・FOCUS(既定 80・253)、OVERPEN(既定 0.6)。
// 大成功・誤差で失敗・届かず・超え ごとに、残り集中力・会心の回数・ねらい系の打数・理想値が分かったマスの数などを出す。
'use strict';
const fs = require('fs');
const GAME = require('../src/game.js'), V = require('../src/value.js');
const { seeded } = require('./scripted.js');
const [item, wfile, N = 1000, SEED = 960] = process.argv.slice(2).map((x, i) => i < 2 ? x : +x);
const j = JSON.parse(fs.readFileSync(wfile));
const G = GAME.setup({ item, level: +(process.env.LEVEL || 80), hammer: 'hikari', star: 3, focus: +(process.env.FOCUS || 253) });
const net = { sizes: j.sizes, L: j.L.map(l => ({ n: l.n, m: l.m, W: Float32Array.from(l.W), b: Float32Array.from(l.b) })) };
net.ver = j.sizes[0] === V.featLen(G, 1) ? 1 : j.sizes[0] === V.featLen(G, 3) ? 3 : 2;
const PEN = +(process.env.OVERPEN || 0.6);
const AIM = new Set(['nerai', 'jakunerai', 'jgnerai']);
const groups = {};
for (let g = 0; g < N; g++) {
  const r = seeded(SEED * 100003 + g);
  const s = GAME.newState(G), ideal = G.cells.map(z => z ? z[0] + Math.floor(r() * (z[1] - z[0] + 1)) : null);
  const opt = { K: 12, overPen: PEN, rnd: seeded(SEED * 7 + g), buf: new Float32Array(V.featLen(G, net.ver)) };
  let crit = 0, aim = 0, aimCrit = 0, firstIn = null;
  for (let k = 0; k < 80 && !s.dead; k++) {
    const qs = V.evalActs(net, G, s, opt);
    const best = qs.reduce((a, b) => b.q > a.q ? b : a);
    if (!best.a) break;
    for (const o of GAME.play(G, s, best.a, ideal, r)) {
      if (o.crit) crit++;
      if (AIM.has(best.a.t.id)) { aim++; if (o.crit) aimCrit++; }
    }
    if (firstIn === null && G.active.every(i => s.v[i] >= G.cells[i][0])) firstIn = s.F;
  }
  const jj = GAME.judge(G, s, ideal);
  const k = jj.great ? '大成功' : jj.over ? '超え' : !jj.reached ? '届かず' : '誤差で失敗';
  const known = G.active.filter(i => Math.max(...s.bel[i]) > 0.99).length;
  (groups[k] = groups[k] || []).push({ F: s.F, crit, aim, aimCrit, known, firstIn, err: jj.err });
}
const avg = (a, f) => (a.reduce((x, y) => x + f(y), 0) / a.length).toFixed(2);
const med = a => { const b = a.slice().sort((x, y) => x - y); return b.length ? b[b.length >> 1] : '-'; };
console.log(`${item} Lv${G.level} 集中力${G.focus} 罰${PEN} ${N}局`);
for (const [k, a] of Object.entries(groups)) {
  console.log(`${k} ${(a.length / N * 100).toFixed(1)}% | 終わりの集中力 中央値 ${med(a.map(x => x.F))} | 全マスがゾーンに入った時の集中力 中央値 ${med(a.filter(x => x.firstIn !== null).map(x => x.firstIn))}` +
    ` | 会心 ${avg(a, x => x.crit)} | ねらい系 ${avg(a, x => x.aim)} → 会心 ${avg(a, x => x.aimCrit)} | 理想値が分かったマス ${avg(a, x => x.known)}`);
  if (k === '誤差で失敗') { const c = {}; for (const x of a) c[x.err] = (c[x.err] || 0) + 1; console.log('  誤差合計', JSON.stringify(c)); }
}
