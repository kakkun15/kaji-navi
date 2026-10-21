// 仮の打ち方(src/rule0.js)の成績。node train/sim_rule0.js <商材> <局数> <種> [重みの JSON]
const GAME = require('../src/game.js'), R = require('../src/rule0.js'), { seeded } = require('./scripted.js');
const [item = 'needle', N = 1000, SEED = 1, WJ] = process.argv.slice(2);
const W = Object.assign({}, R.W0, WJ ? JSON.parse(WJ) : {});
const G = GAME.setup({ item, level: 76, hammer: 'hikari', star: 3, focus: 245 });
const st = { great: 0, over: 0, under: 0, errfail: 0 }; let moves = 0;
for (let g = 0; g < +N; g++) {
  const r = seeded(+SEED * 100003 + g);
  const s = GAME.newState(G), ideal = G.cells.map(z => z ? z[0] + Math.floor(r() * (z[1] - z[0] + 1)) : null);
  for (let k = 0; k < 80 && !s.dead; k++) { const a = R.policy(G, s, W); if (!a) break; GAME.play(G, s, a, ideal, r); moves++; }
  const j = GAME.judge(G, s, ideal);
  if (j.great) st.great++; else if (j.over) st.over++; else if (!j.reached) st.under++; else st.errfail++;
}
for (const k in st) st[k] = +(st[k] / N).toFixed(3);
console.log(item, JSON.stringify(W), JSON.stringify(st), '平均手数', (moves / N).toFixed(1));
