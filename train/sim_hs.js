// 必殺(ヘパイトスの炎)の効き目を測る。同じ局(種)で「必殺なし」と「チャージが来た」を比べる。
// node sim_hs.js <商材> <重み> <局数> <種> <start|mid>
//   start: 打ち始めにチャージ済み / mid: 叩いた後に10%でチャージ(1局1回まで)
// 環境変数: OVERPEN(既定0)・LEVEL・FOCUS(既定 79・245)、HSHEAT=0 で下ごしらえに火力上げを入れない(前の動き)、
//   RES=<ファイル>(必殺ありの局ごとの結果 1/0 を書く。pair.js で比べる)
// 1手読み。チャージ中・効果中は evalActsHS(value.js)。
'use strict';
const fs = require('fs');
const GAME = require('../src/game.js'), V = require('../src/value.js');
const { seeded } = require('./scripted.js');
const [item, wfile, N = 100, SEED = 300, MODE = 'start'] = process.argv.slice(2).map((x, i) => (i < 2 || i === 4) ? x : +x);
const j = JSON.parse(fs.readFileSync(wfile));
const G = GAME.setup({ item, level: +(process.env.LEVEL || 79), hammer: 'hikari', star: 3, focus: +(process.env.FOCUS || 245) });
const net = { sizes: j.sizes, L: j.L.map(l => ({ n: l.n, m: l.m, W: Float32Array.from(l.W), b: Float32Array.from(l.b) })) };
net.ver = j.sizes[0] === V.featLen(G, 1) ? 1 : j.sizes[0] === V.featLen(G, 3) ? 3 : 2;

function playOne(g, useHs) {
  const r = seeded(SEED * 100003 + g), rc = seeded(SEED * 31 + g);        // rc: チャージの乱数(打ち方に左右されない)
  const s = GAME.newState(G), ideal = G.cells.map(z => z ? z[0] + Math.floor(r() * (z[1] - z[0] + 1)) : null);
  const opt = { K: 12, overPen: +(process.env.OVERPEN || 0), hsHeat: process.env.HSHEAT !== '0', rnd: seeded(SEED * 7 + g), buf: new Float32Array(V.featLen(G, net.ver)) };
  let charged = false, fired = -1, step = 0;
  if (useHs && MODE === 'start') { s.hs = 1; charged = true; }
  for (; step < 80 && !s.dead; step++) {
    const qs = s.hs ? V.evalActsHS(net, G, s, opt) : V.evalActs(net, G, s, opt);
    const best = s.hs ? qs[0] : qs.reduce((a, b) => b.q > a.q ? b : a);
    if (!best.a) break;
    if (best.a.t.hs) fired = step;
    GAME.play(G, s, best.a, ideal, r);
    if (Array.isArray(s.lit)) s.lit = s.lit[Math.floor(r() * s.lit.length)];
    const u = rc();
    if (useHs && MODE === 'mid' && !charged && best.a.t.area && u < 0.1) { s.hs = 1; charged = true; }
  }
  return { great: GAME.judge(G, s, ideal).great ? 1 : 0, charged, fired, left: s.hs };
}
const t0 = Date.now();
let a = 0, b = 0, onlyB = 0, onlyA = 0, nch = 0, nfire = 0, nleft = 0; const resB = [];
for (let g = 0; g < N; g++) {
  const x = playOne(g, false), y = playOne(g, true);
  a += x.great; b += y.great; resB.push(y.great); if (y.great && !x.great) onlyB++; if (x.great && !y.great) onlyA++;
  if (y.charged) { nch++; if (y.fired >= 0) nfire++; if (y.left === 1) nleft++; }
}
console.log(JSON.stringify({ item, MODE, N, SEED, none: +(a / N).toFixed(3), hs: +(b / N).toFixed(3), onlyHs: onlyB, onlyNone: onlyA,
  charged: nch, fired: nfire, unused: nleft, sec: ((Date.now() - t0) / N / 1000).toFixed(1) }));
if (process.env.RES) fs.writeFileSync(process.env.RES, resB.join(''));
