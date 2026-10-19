// 学んだ見積もりで1局打ち、手と結果を出す。node trace_net.js <商材> <重み> <局の番号>...
'use strict';
const fs = require('fs');
const GAME = require('../src/game.js'), V = require('../src/value.js');
const { seeded } = require('./scripted.js');
const [item, wfile, ...gs] = process.argv.slice(2);
const j = JSON.parse(fs.readFileSync(wfile));
const G = GAME.setup({ item, level: 75, hammer: 'hikari', star: 3, focus: 242 });
const net = { sizes: j.sizes, L: j.L.map(l => ({ n: l.n, m: l.m, W: Float32Array.from(l.W), b: Float32Array.from(l.b) })) };
net.ver = j.sizes[0] === V.featLen(G, 1) ? 1 : 2;
for (const gStr of gs) {
  const g = +gStr, SEED = 500;
  const r = seeded(SEED * 100003 + g);
  const s = GAME.newState(G), ideal = G.cells.map(z => z ? z[0] + Math.floor(r() * (z[1] - z[0] + 1)) : null);
  const opt = { K: 12, rnd: seeded(SEED * 7 + g), buf: new Float32Array(V.featLen(G, net.ver)) };
  console.log('game', g, 'ideal', JSON.stringify(ideal));
  for (let k = 0; k < 80 && !s.dead; k++) {
    const qs = V.evalActs(net, G, s, opt);
    const ord = qs.slice().sort((a, b) => b.q - a.q);
    const best = ord[0];
    const vNow = V.valueOf(net, G, s, opt.buf);
    if (!best.a) { console.log('  stop', best.q.toFixed(3)); break; }
    const t0 = s.temp, F0 = s.F, lit = s.lit;
    const obs = GAME.play(G, s, best.a, ideal, r);
    const alt = ord.slice(1, 3).map(x => (x.a ? x.a.t.name + x.a.tg.join('') : 'stop') + ' ' + x.q.toFixed(3)).join(' | ');
    console.log(`  ${t0}℃ F${F0}${lit !== null ? ' lit' + lit : ''} v=${vNow.toFixed(3)} ${best.a.t.name}${best.a.tg.join('')} q=${best.q.toFixed(3)} -> ${JSON.stringify(s.v)} ${obs.map(o => o.crit ? 'C' + o.j : '').join('')} ${s.dead ? 'DEAD' : ''}   [${alt}]`);
  }
  console.log(' ', JSON.stringify(GAME.judge(G, s, ideal)));
}
