// selfplay.js が value.js の 1手読みと同じ答えを出すか。node gpu/test/sp.test.js
const GAME = require('../../src/game.js'), V = require('../../src/value.js'), SP = require('../selfplay.js'), fs = require('fs');
const j = JSON.parse(fs.readFileSync(__dirname + '/../../train/w_hidane_h128_best.json'));
const net = { sizes: j.sizes, L: j.L.map(l => ({ n: l.n, m: l.m, W: Float32Array.from(l.W), b: Float32Array.from(l.b) })), ver: 2 };
const G = GAME.setup({ item: 'hidane', level: 80, hammer: 'hikari', star: 3, focus: 253 }), D = V.featLen(G, 2);
const cpu = (X, n) => { const z = new Float32Array(n); for (let i = 0; i < n; i++) z[i] = V.forward(net, X.subarray(i * D, i * D + D)); return Promise.resolve(z); };
(async () => {
  // 1) 局面ごとの値
  let maxd = 0, cnt = 0; const r = SP.rng(5);
  for (let k = 0; k < 300; k++) {
    const s = SP.sampleState(G, r), seed = 1000 + k;
    const a = V.evalActs(net, G, s, { K: 12, overPen: 0.6, rnd: SP.rng(seed), buf: new Float32Array(D) });
    const L = SP.makeLeaves(D), P = SP.planActs(G, s, { K: 12, overPen: 0.6, rnd: SP.rng(seed) }, L, 2);
    const z = await cpu(L.X, L.n), b = SP.resolve(P, L, z);
    if (a.length !== b.length) throw 'len';
    for (let i = 0; i < a.length; i++) { maxd = Math.max(maxd, Math.abs(a[i].q - b[i].q)); cnt++; }
  }
  console.log('values', cnt, 'max diff', maxd.toExponential(2));
  // 2) 成績の局(lab/trainer.js の eval と同じ打ち方)
  const N = 60, seed = 960, ref = [];
  for (let g = 0; g < N; g++) {
    const r = SP.rng(seed * 100003 + g), s = GAME.newState(G), ideal = G.cells.map(z => z ? z[0] + Math.floor(r() * (z[1] - z[0] + 1)) : null);
    const opt = { K: 12, overPen: 0.6, rnd: SP.rng(seed * 7 + g), buf: new Float32Array(D) };
    for (let k = 0; k < 80 && !s.dead; k++) { const qs = V.evalActs(net, G, s, opt); let b = qs[0]; for (const x of qs) if (x.q > b.q) b = x; if (!b.a) break; GAME.play(G, s, b.a, ideal, r); }
    ref.push(GAME.judge(G, s, ideal).great ? 1 : 0);
  }
  const got = (await SP.runMany(N, 16, g => SP.evalGame(G, seed, g, 0.6, 2), cpu, D)).map(x => x.great);
  const same = ref.filter((x, i) => x === got[i]).length;
  console.log('games', N, 'same', same, 'ref', ref.join(''), 'got', got.join(''));
  // 3) 学習の自己対戦が動くか
  const out = { f: [], y: [] }, rr = SP.rng(77);
  const w = await SP.runMany(20, 8, k => k < 10 ? SP.trainGame(G, rr, 0.1, 0.7, 2, out) : SP.sampledPos(G, rr, 2, out), cpu, D);
  console.log('train pos', out.y.length, 'mean y', (out.y.reduce((a, b) => a + b, 0) / out.y.length).toFixed(3));
  if (maxd > 1e-4 || same < N - 1) { console.log('NG'); process.exit(1); } console.log('OK');
})();
