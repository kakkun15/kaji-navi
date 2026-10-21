// 蒸留の先生データを作る。今の見積もりで打った局の途中の局面を、重い2手読みで採点して書き出す。
// node distill_gen.js <商材> <重み> <局数> <種> <出力.jsonl>
// 環境変数: K N2 K2(2手読みの重さ。既定 12/4/8)、EVERY(何手ごとに採点するか。既定1)、
//   OVERPEN(超える罰。既定0。鍛冶ナビと同じ 1 にすると、罰を入れて手を選び、点数はその手の大成功の見込み(罰を足し戻す))
// 条件は1局ごとに Lv75〜80・開始の集中力 230〜275 からばらす(Lv が上がっても使えるように)。
'use strict';
const fs = require('fs');
const GAME = require('../src/game.js'), V = require('../src/value.js');
const { seeded } = require('./scripted.js');
const [item, wfile, N = 100, SEED = 1, OUT] = process.argv.slice(2).map((x, i) => (i < 2 || i === 4) ? x : +x);
const j = JSON.parse(fs.readFileSync(wfile));
const net = { sizes: j.sizes, L: j.L.map(l => ({ n: l.n, m: l.m, W: Float32Array.from(l.W), b: Float32Array.from(l.b) })) };
const G0 = GAME.setup({ item, level: 75, hammer: 'hikari', star: 3, focus: 242 });
net.ver = j.sizes[0] === V.featLen(G0, 1) ? 1 : j.sizes[0] === V.featLen(G0, 3) ? 3 : 2;
const K = +(process.env.K || 12), N2 = +(process.env.N2 || 4), K2 = +(process.env.K2 || 8), EVERY = +(process.env.EVERY || 1);
const EPS = +(process.env.EPS || 0.1), OVERPEN = +(process.env.OVERPEN || 0);
// その手でどこかのマスがゾーンを超える確率 × OVERPEN(value.js の act2Value と同じ罰)
function penOf(G, s, a) {
  if (!OVERPEN || !a || !a.t.area) return 0;
  let ok = 1;
  for (const j of a.tg) { const { rs, cr } = GAME.hitParams(G, s, a.t, j); let o2 = 0; for (const o of GAME.massOutcomes(G.cells[j], s.v[j], s.bel[j], rs, cr)) if (o.w > G.cells[j][1]) o2 += o.p; ok *= 1 - o2; }
  return OVERPEN * (1 - ok);
}
const r = seeded(SEED * 104729 + 17);
const t0 = Date.now(); let nState = 0;
for (let g = 0; g < N; g++) {
  const level = 75 + Math.floor(r() * 6), focus = 230 + Math.floor(r() * 46);
  const G = GAME.setup({ item, level, hammer: 'hikari', star: 3, focus });
  const s = GAME.newState(G), ideal = G.cells.map(z => z ? z[0] + Math.floor(r() * (z[1] - z[0] + 1)) : null);
  const opt = { K, N2, K2, overPen: OVERPEN, rnd: r, buf: new Float32Array(V.featLen(G, net.ver)) };
  const lines = [];
  for (let k = 0; k < 80 && !s.dead; k++) {
    const acts = GAME.legalActs(G, s);
    if (!acts.length) break;
    let pick;
    if (k % EVERY === 0) {
      // 先生: 重い2手読みの一番良い値 = この局面の値
      const qs = V.evalActs2(net, G, s, opt);
      let best = qs[0]; for (const x of qs) if (x.q2 > best.q2) best = x;
      lines.push(JSON.stringify({ f: Array.from(V.features(G, s, null, net.ver), x => +x.toFixed(5)), y: +Math.min(1, Math.max(0, best.q2 + penOf(G, s, best.a))).toFixed(5), lv: level, F: s.F }));
      nState++;
      pick = best;
      // 寄り道(いろいろな局面を集めるため)。1手読みの上位5手から選ぶ
      if (r() < EPS) { const top = qs.slice().sort((a, b) => b.q - a.q).slice(0, 5); pick = top[Math.floor(r() * top.length)]; }
    } else {
      const qs = V.evalActs(net, G, s, opt);
      pick = qs.reduce((a, b) => b.q > a.q ? b : a);
    }
    if (!pick.a) break;
    GAME.play(G, s, pick.a, ideal, r);
  }
  fs.appendFileSync(OUT, lines.length ? lines.join('\n') + '\n' : '');
  if ((g + 1) % 5 === 0) console.log(`game ${g + 1}/${N} states ${nState} ${((Date.now() - t0) / 1000).toFixed(0)}s`);
}
console.log(`done states ${nState} ${((Date.now() - t0) / 1000).toFixed(0)}s`);
