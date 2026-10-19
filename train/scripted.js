// 学び始めの足がかりにする、単純な規則の打ち手(学習用。アプリでは使わない)。
'use strict';
const GAME = require('../src/game.js');

function scripted(G, s, W) {
  W = W || { exact: 8, land: 2, over: 40, prog: 1 };
  const acts = GAME.legalActs(G, s);
  const open = G.active.filter(i => s.v[i] < G.cells[i][0]);
  if (!open.length) return null;                       // 全部ゾーンに入ったらやめる
  // 残りが多いうちは温度を上げてから打つ(威力は2000℃まで温度に比例して伸びる)
  let needSum = 0; for (const i of open) needSum += G.cells[i][0] - s.v[i];
  const heat0 = acts.find(a => a.t.id === 'karyoku');
  if (heat0 && s.temp + 300 <= 2200 && G.active.every(i => s.v[i] === 0) && needSum > (W.openNeed || 1000)) return heat0;
  let best = null, bestS = 0;
  for (const a of acts) {
    if (!a.t.area) continue;
    if (a.tg.some(j => s.v[j] >= G.cells[j][0])) continue;   // ゾーンに入ったマスは叩かない
    let sc = 0;
    for (const j of a.tg) {
      const z = G.cells[j], v = s.v[j], need = z[0] - v;
      const { rs, cr } = GAME.hitParams(G, s, a.t, j);
      let prog = 0, over = 0, landN = 0, exact = 0;
      for (const r of rs) {
        const w = v + r;
        prog += Math.min(w, z[0]) - v;
        if (w > z[1]) over++;
        else if (w >= z[0]) landN++;
        if (v + 2 * r >= z[0]) exact++;               // 会心なら理想値で止まる(ゾーンに届く時)
      }
      const n = rs.length;
      sc += W.prog * (prog / n) / Math.max(10, need) * 10 * (1 - cr)
          + W.exact * cr * exact / n
          + W.land * (1 - cr) * landN / n
          - W.over * (1 - cr) * over / n;
    }
    const c = GAME.costOf(G, s, a.t) + Math.max(0, -a.t.dT) / 30;   // 温度の下がりも消費とみなす(火力上げ 10 で 300℃)
    sc /= Math.max(3, c);
    if (sc > bestS) { bestS = sc; best = a; }
  }
  if (best && s.temp > 250) return best;
  // 打つ手が無い・温度が低い時は火力上げ
  const heat = acts.find(a => a.t.id === 'karyoku');
  if (heat && s.temp <= (W.heatT || 700)) return heat;
  return best;
}

function seeded(a) { return function () { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a);
  t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }

if (require.main === module) {
  const item = process.argv[2] || 'lamp', N = +process.argv[3] || 1000;
  const G = GAME.setup({ item, level: 75, hammer: 'hikari', star: 3, focus: 242 });
  const st = { great: 0, over: 0, under: 0, errfail: 0 };
  for (let g = 0; g < N; g++) {
    const r = seeded(99 * 100003 + g);
    const s = GAME.newState(G), ideal = G.cells.map(z => z ? z[0] + Math.floor(r() * (z[1] - z[0] + 1)) : null);
    for (let k = 0; k < 80 && !s.dead; k++) { const a = scripted(G, s); if (!a) break; GAME.play(G, s, a, ideal, r); }
    const j = GAME.judge(G, s, ideal);
    if (j.great) st.great++; else if (j.over) st.over++; else if (!j.reached) st.under++; else st.errfail++;
  }
  for (const k in st) st[k] = +(st[k] / N).toFixed(3);
  console.log(item, JSON.stringify(st));
}
module.exports = { scripted, seeded };
