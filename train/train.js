// 局面の見積もり(value.js のネット)を自己対戦で学ばせる。Node 専用。
// node train.js <商材> <回数> [自己対戦の局数] [ばらまく局面の数] [種] [前の重み]
// 1回ごとに: 今のネットで1手先読みして打つ → 各局面の「一番良い手の値」を目標に学ぶ(価値反復)。
// 環境変数 LEVEL・FOCUS(学ぶ条件。既定 75・242)、LR(学習率の倍率。既定1。続きから学ぶ時は小さくする)
'use strict';
const fs = require('fs');
const GAME = require('../src/game.js'), V = require('../src/value.js');
function seeded(a) { return function () { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a);
  t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }

const [item, ITERS = 30, GAMES = 400, SAMPLED = 3000, SEED = 1, INIT] = process.argv.slice(2).map((x, i) => i === 0 || i === 5 ? x : +x);
const CFG = { item, level: +(process.env.LEVEL || 75), hammer: 'hikari', star: 3, focus: +(process.env.FOCUS || 242) };
const LR_MUL = +(process.env.LR || 1);
const G = GAME.setup(CFG);
const rnd = seeded(SEED * 7919 + 1);
let net = INIT ? load(INIT) : V.makeNet([V.featLen(G, +(process.env.FVER || 2)), +(process.env.HID || 64), +(process.env.HID || 64), 1], rnd);
net.ver = net.sizes[0] === V.featLen(G, 1) ? 1 : net.sizes[0] === V.featLen(G, 3) ? 3 : 2;
const D = V.featLen(G, net.ver);
const TAG = process.env.TAG || '';
const OUT = `${__dirname}/w_${item}${TAG}.json`;
const LOG = `${__dirname}/log_${item}${TAG}.txt`;
const log = (...a) => { const s = a.join(' '); console.log(s); fs.appendFileSync(LOG, s + '\n'); };

function save(net, file) { fs.writeFileSync(file, JSON.stringify({ sizes: net.sizes, L: net.L.map(l => ({ n: l.n, m: l.m, W: Array.from(l.W), b: Array.from(l.b) })) })); }
function load(file) { const j = JSON.parse(fs.readFileSync(file)); return { sizes: j.sizes, L: j.L.map(l => ({ n: l.n, m: l.m, W: Float32Array.from(l.W), b: Float32Array.from(l.b) })) }; }

const randIdeal = r => G.cells.map(z => z ? z[0] + Math.floor(r() * (z[1] - z[0] + 1)) : null);

// ---- 手を選ぶ ----
function choose(qs, eps, r) {
  let best = qs[0];
  for (const x of qs) if (x.q > best.q) best = x;
  if (eps > 0 && r() < eps) {
    const top = qs.slice().sort((a, b) => b.q - a.q).slice(0, 5);
    return { pick: top[Math.floor(r() * top.length)], best };
  }
  return { pick: best, best };
}

// ---- 1局打つ(局面と目標を集める) ----
function playGame(r, eps, collect) {
  const s = GAME.newState(G), ideal = randIdeal(r);
  const opt = { K: 12, rnd: r, buf: new Float32Array(D) };
  const traj = [];
  for (let step = 0; step < 80; step++) {
    if (s.dead) break;
    const qs = V.evalActs(net, G, s, opt);
    const { pick, best } = choose(qs, eps, r);
    if (collect) traj.push({ f: V.features(G, s, null, net.ver), q: best.q, greedy: pick === best });
    if (!pick.a) break;                          // やめる
    GAME.play(G, s, pick.a, ideal, r);
  }
  const j = GAME.judge(G, s, ideal);
  if (collect) {
    // λ収益: 先読みの値と、実際の結果を混ぜる(先読みの値だけだと楽観に偏るため)。寄り道した手の前では切る
    // 最後の局面の「やめた時の大成功の確率」(見当から正確に出る)。0/1 の結果より揺れが小さい
    let g = GAME.stopProb(G, s);
    for (let t = traj.length - 1; t >= 0; t--) {
      const x = traj[t];
      const target = x.greedy ? (1 - LAMBDA) * x.q + LAMBDA * g : x.q;
      collect(x.f, target);
      g = target;
    }
  }
  return j;
}
const LAMBDA = +(process.env.LAMBDA || 0.7);

// ---- 局面をばらまく(終盤から序盤まで広く) ----
function sampleState(r) {
  const s = GAME.newState(G);
  if (r() < 0.05) return s;                       // 開始の局面
  s.first = false;
  const u = r();                                  // 進み具合
  for (const i of G.active) {
    const z = G.cells[i];
    const x = r();
    if (x < 0.15 + 0.5 * u) s.v[i] = z[0] + Math.floor(r() * (z[1] - z[0] + 1));        // ゾーン内
    else if (x < 0.25 + 0.6 * u) s.v[i] = Math.max(0, z[0] - 1 - Math.floor(r() * 45));  // ゾーンの手前
    else s.v[i] = Math.max(0, Math.floor(z[0] * (r() * (0.3 + 0.7 * u))));
    // 会心の結果で見当がしぼられた局面も混ぜる
    if (r() < 0.25) {
      const I = z[0] + Math.floor(r() * (z[1] - z[0] + 1));
      const before = Math.max(0, s.v[i] - Math.floor(r() * 30));
      const rs = [12, 13, 14, 15, 16, 17, 18].map(n => Math.ceil(n * (0.6 + r() * 0.5)));
      const rr = rs[Math.floor(r() * 7)];
      const w = I > before ? Math.min(before + 2 * rr, I) : before;
      if (w <= z[1]) { s.v[i] = w; s.bel[i] = GAME.critPosterior(z, before, w, s.bel[i], rs); }
    }
  }
  // 温度と集中力(進むほど下がりがち)
  s.temp = 50 * (1 + Math.floor(r() * (u < 0.3 ? 44 : 30)));
  s.F = Math.floor(G.focus * Math.min(1, Math.max(0, (1 - u) * 1.1 + (r() - 0.5) * 0.5)));
  if (G.trait === 'hikari' && s.temp % 200 === 0) {
    const cand = G.active.filter(i => s.v[i] < G.cells[i][0]);
    if (cand.length) s.lit = cand[Math.floor(r() * cand.length)];
  }
  return s;
}

// ---- 学習(Adam・交差エントロピー) ----
function makeAdam(net) { return net.L.map(l => ({ mW: new Float32Array(l.W.length), vW: new Float32Array(l.W.length), mb: new Float32Array(l.b.length), vb: new Float32Array(l.b.length) })); }
let adam = makeAdam(net), adamT = 0;
function trainOn(X, Y, epochs, lr) {
  const N = Y.length, B = 256, idx = Array.from({ length: N }, (_, i) => i);
  const L = net.L;
  let lossSum = 0, cnt = 0;
  for (let ep = 0; ep < epochs; ep++) {
    for (let i = N - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [idx[i], idx[j]] = [idx[j], idx[i]]; }
    for (let b0 = 0; b0 < N; b0 += B) {
      const gW = L.map(l => new Float32Array(l.W.length)), gb = L.map(l => new Float32Array(l.b.length));
      const bs = Math.min(B, N - b0);
      for (let q = 0; q < bs; q++) {
        const n = idx[b0 + q], x = X[n], y = Y[n];
        const acts = V.forward(net, x, true);
        const z = acts[acts.length - 1][0], p = V.sigmoid(z);
        lossSum += -(y * Math.log(p + 1e-9) + (1 - y) * Math.log(1 - p + 1e-9)); cnt++;
        let delta = new Float32Array([p - y]);
        for (let l = L.length - 1; l >= 0; l--) {
          const { n: ni, m, W } = L[l], a = acts[l];
          const prev = l > 0 ? new Float32Array(ni) : null;
          for (let j = 0; j < m; j++) {
            const d = delta[j]; if (!d) continue;
            gb[l][j] += d;
            const off = j * ni;
            for (let k = 0; k < ni; k++) { gW[l][off + k] += d * a[k]; if (prev) prev[k] += d * W[off + k]; }
          }
          if (prev) { for (let k = 0; k < ni; k++) prev[k] *= (1 - a[k] * a[k]); delta = prev; }
        }
      }
      adamT++;
      const b1 = 0.9, b2 = 0.999, c1 = 1 - Math.pow(b1, adamT), c2 = 1 - Math.pow(b2, adamT);
      for (let l = 0; l < L.length; l++) {
        const A = adam[l];
        for (let k = 0; k < L[l].W.length; k++) { const g = gW[l][k] / bs; A.mW[k] = b1 * A.mW[k] + (1 - b1) * g; A.vW[k] = b2 * A.vW[k] + (1 - b2) * g * g; L[l].W[k] -= lr * (A.mW[k] / c1) / (Math.sqrt(A.vW[k] / c2) + 1e-8); }
        for (let k = 0; k < L[l].b.length; k++) { const g = gb[l][k] / bs; A.mb[k] = b1 * A.mb[k] + (1 - b1) * g; A.vb[k] = b2 * A.vb[k] + (1 - b2) * g * g; L[l].b[k] -= lr * (A.mb[k] / c1) / (Math.sqrt(A.vb[k] / c2) + 1e-8); }
      }
    }
  }
  net._wz = undefined; // 速い版(wasm)は重みの写しを持つので、変えたら作り直させる
  return lossSum / cnt;
}

// ---- 成績(先読みだけ・同じ種の局) ----
function evaluate(n, seed) {
  const st = { great: 0, over: 0, under: 0, errfail: 0 };
  for (let g = 0; g < n; g++) {
    const r = seeded(seed * 100003 + g);
    const j = playGame(r, 0, null);
    if (j.great) st.great++; else if (j.over) st.over++; else if (!j.reached) st.under++; else st.errfail++;
  }
  for (const k in st) st[k] = +(st[k] / n).toFixed(3);
  return st;
}

// ---- 最初の見積もり: お手本(scripted.js)で最後まで打った結果を覚えさせる ----
const { scripted } = require('./scripted.js');
function sampleIdealFrom(s, r) {
  return G.cells.map((z, i) => {
    if (!z) return null;
    const b = s.bel[i]; let u = r();
    for (let k = 0; k < b.length; k++) { u -= b[k]; if (u <= 0) return z[0] + k; }
    return z[1];
  });
}
function scriptedOutcome(s0, r) {
  const s = GAME.cloneState(s0), ideal = sampleIdealFrom(s0, r);
  for (let k = 0; k < 80 && !s.dead; k++) { const a = scripted(G, s); if (!a) break; GAME.play(G, s, a, ideal, r); }
  return GAME.judge(G, s, ideal).great ? 1 : 0;
}
if (process.env.PRE) {
  const NPRE = +process.env.PRE;
  const X = [], Y = [];
  for (let k = 0; k < NPRE; k++) {
    let s;
    if (k % 2 === 0) s = sampleState(rnd);
    else {
      // お手本の対局の途中の局面(少し揺らす)
      s = GAME.newState(G); const ideal = randIdeal(rnd); const stop = Math.floor(rnd() * 30);
      for (let q = 0; q < stop && !s.dead; q++) {
        const acts = GAME.legalActs(G, s); if (!acts.length) break;
        const a = rnd() < 0.15 ? acts[Math.floor(rnd() * acts.length)] : scripted(G, s);
        if (!a) break; GAME.play(G, s, a, ideal, rnd);
      }
      if (s.dead) continue;
    }
    // 今やめる確率と、お手本で続けた結果の良い方
    const y = Math.max(GAME.stopProb(G, s), (scriptedOutcome(s, rnd) + scriptedOutcome(s, rnd)) / 2);
    X.push(V.features(G, s, null, net.ver)); Y.push(y);
  }
  const loss = trainOn(X, Y, 8, 2e-3);
  save(net, OUT);
  log(`pre n ${Y.length} mean ${(Y.reduce((a, b) => a + b, 0) / Y.length).toFixed(3)} loss ${loss.toFixed(4)} ${JSON.stringify(evaluate(300, 99))}`);
}

let bufX = [], bufY = [], bestGreat = -1;
for (let it = 1; it <= ITERS; it++) {
  const t0 = Date.now();
  const X = [], Y = [];
  const collect = (f, y) => { X.push(f); Y.push(y); };
  let gw = 0;
  for (let g = 0; g < GAMES; g++) { const j = playGame(rnd, 0.1, collect); gw += j.great; }
  const opt = { K: 8, rnd, buf: new Float32Array(D) };
  for (let k = 0; k < SAMPLED; k++) {
    const s = sampleState(rnd);
    const qs = V.evalActs(net, G, s, opt);
    let best = 0; for (const x of qs) best = Math.max(best, x.q);
    X.push(V.features(G, s, null, net.ver)); Y.push(best);
  }
  // 直近3回分を残して学ぶ
  bufX.push(X); bufY.push(Y);
  if (bufX.length > 3) { bufX.shift(); bufY.shift(); }
  const AX = [].concat(...bufX), AY = [].concat(...bufY);
  const loss = trainOn(AX, AY, 3, (it < 5 ? 2e-3 : 1e-3) * LR_MUL);
  save(net, OUT);
  let ev = '';
  if (it % 3 === 0 || it === ITERS) {
    const e = evaluate(400, 99); ev = JSON.stringify(e);
    if (e.great > bestGreat) { bestGreat = e.great; save(net, OUT.replace('.json', '_best.json')); ev += ' *best'; }
  }
  log(`it ${it} selfplay ${(gw / GAMES).toFixed(3)} n ${AY.length} loss ${loss.toFixed(4)} ${((Date.now() - t0) / 1000).toFixed(0)}s ${ev}`);
}
