// 必殺の後(確定会心)の理想値の見当 critBelief の試験。
const GAME = require('../src/game.js');
let ng = 0; const ok = (c, m) => { if (!c) { ng++; console.log('NG', m); } };
const same = (a, b) => a.length === b.length && a.every((x, i) => Math.abs(x - b[i]) < 1e-9);

const G = GAME.setup({ item: 'hidane', level: 80, hammer: 'hikari', star: 3, focus: 253 });
const s = GAME.newState(G); s.temp = 900; s.F = 94; s.hs = 2; s.first = false;
const chouyon = G.acts.find(a => a.t.id === 'chouyon').t;
const z = G.cells[0];                                   // [180,190]
const v = 170, { rs, cr } = GAME.hitParams(G, s, chouyon, 0);
ok(cr === 1, '必殺の後は会心率 1');
const uni = GAME.newState(G).bel[0];
const at = k => uni.map((_, i) => i === k ? 1 : 0);

// 1) 理想値で止まった(どの伸びでもゾーンまで届く所から): 理想値は w ちょうど
const v2 = 178, w = 185;
const b1 = GAME.critBelief(z, v2, w, uni, rs);
ok(Math.abs(b1.reduce((a, x) => a + x, 0) - 1) < 1e-9, '合計 1');
ok(b1[w - z[0]] > 0, '理想値 w が候補に残る');
// 2) 今の見当と合う時は、これまでの critPosterior と同じ
ok(same(b1, GAME.critPosterior(z, v2, w, uni, rs)), 'critPosterior と一致');
// 3) 見当が間違って 0 になっていても(理想値の候補に無い)、やり直して w を拾う
const wrong = uni.map((x, k) => k === w - z[0] ? 0 : x); const m = wrong.reduce((a, x) => a + x, 0);
const b3 = GAME.critBelief(z, v2, w, wrong.map(x => x / m), rs);
ok(Math.abs(b3.reduce((a, x) => a + x, 0) - 1) < 1e-9 && b3[w - z[0]] > 0, '見当が合わなくても戻してやり直す');
// 4) どの理想値でも出ない値(ゾーン内): その値を理想値とみなす
// (v=186 の会心は、理想値が 186 以下なら動かず、上なら理想値まで上がる。下の 183 に下がることはない)
ok(GAME.critPosterior(z, 186, 183, uni, rs) === uni, '183 はどの理想値でも出ない(試験の前提)');
const b4 = GAME.critBelief(z, 186, 183, uni, rs);
ok(b4[183 - z[0]] === 1 && b4.reduce((a, x) => a + x, 0) === 1, '合う理想値が無い時は w を理想値とする');
// 5) ゾーンの外の値: 見当はそのまま
const b5 = GAME.critBelief(z, 170, 300, uni, rs);
ok(same(b5, uni), 'ゾーンの外なら見当はそのまま');
// 6) 理想値を既に超えているマス(叩いても動かない): w = v なら理想値は v 以下に絞られる
const b6 = GAME.critBelief(z, 186, 186, uni, rs);
ok(b6.every((p, k) => z[0] + k <= 186 || p === 0) && b6.reduce((a, x) => a + x, 0) > 0.999, '動かない時は理想値が v 以下');

console.log(ng ? `NG ${ng}` : 'ALL OK');
process.exit(ng ? 1 : 0);
