// 蒸留の生徒側: 先生データ(distill_gen.js の jsonl)を、今の見積もりから始めて真似させる。
// node distill_train.js <前の重み> <出力の重み> <jsonl...>
// 環境変数: LR(既定 5e-4)、EP(最大の周回。既定 40)。1割を確かめ用に取り分け、そこの誤差が一番小さい時の重みを残す。
'use strict';
const fs = require('fs');
const V = require('../src/value.js');
const { seeded } = require('./scripted.js');
const [INIT, OUT, ...FILES] = process.argv.slice(2);
const j = JSON.parse(fs.readFileSync(INIT));
const net = { sizes: j.sizes, L: j.L.map(l => ({ n: l.n, m: l.m, W: Float32Array.from(l.W), b: Float32Array.from(l.b) })) };
const rnd = seeded(12345);

// データ。局ごとに続けて書かれているので、確かめ用は「まとまり」で取る(同じ局の局面が両方に入らないように)
let rows = [];
for (const f of FILES) for (const line of fs.readFileSync(f, 'utf8').split('\n')) if (line.trim()) rows.push(JSON.parse(line));
const X = [], Y = [], HX = [], HY = [];
rows.forEach((r, i) => { const hold = Math.floor(i / 200) % 10 === 9; (hold ? HX : X).push(Float32Array.from(r.f)); (hold ? HY : Y).push(r.y); });
rows = null;
console.log(`train ${Y.length} hold ${HY.length}`);

function lossOn(XX, YY) {
  let s = 0;
  for (let n = 0; n < YY.length; n++) { const p = V.sigmoid(V.forward(net, XX[n])), y = YY[n]; s += -(y * Math.log(p + 1e-9) + (1 - y) * Math.log(1 - p + 1e-9)) + (y * Math.log(y + 1e-9) + (1 - y) * Math.log(1 - y + 1e-9)); }
  return s / YY.length;          // 目標そのものの揺れを引いた値(0 なら完全に真似できている)
}
function mae(XX, YY) { let s = 0; for (let n = 0; n < YY.length; n++) s += Math.abs(V.sigmoid(V.forward(net, XX[n])) - YY[n]); return s / YY.length; }

const adam = net.L.map(l => ({ mW: new Float32Array(l.W.length), vW: new Float32Array(l.W.length), mb: new Float32Array(l.b.length), vb: new Float32Array(l.b.length) }));
let adamT = 0;
function epoch(lr) {
  const N = Y.length, B = 128, idx = Array.from({ length: N }, (_, i) => i), L = net.L;
  for (let i = N - 1; i > 0; i--) { const k = Math.floor(rnd() * (i + 1)); [idx[i], idx[k]] = [idx[k], idx[i]]; }
  for (let b0 = 0; b0 < N; b0 += B) {
    const gW = L.map(l => new Float32Array(l.W.length)), gb = L.map(l => new Float32Array(l.b.length));
    const bs = Math.min(B, N - b0);
    for (let q = 0; q < bs; q++) {
      const n = idx[b0 + q], acts = V.forward(net, X[n], true);
      let delta = new Float32Array([V.sigmoid(acts[acts.length - 1][0]) - Y[n]]);
      for (let l = L.length - 1; l >= 0; l--) {
        const { n: ni, m, W } = L[l], a = acts[l], prev = l > 0 ? new Float32Array(ni) : null;
        for (let jj = 0; jj < m; jj++) {
          const d = delta[jj]; if (!d) continue;
          gb[l][jj] += d; const off = jj * ni;
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
  net._wz = undefined; // 速い版(wasm)は重みの写しを持つので、変えたら作り直させる
}
const save = f => fs.writeFileSync(f, JSON.stringify({ sizes: net.sizes, src: 'distill', L: net.L.map(l => ({ n: l.n, m: l.m, W: Array.from(l.W, x => +x.toPrecision(5)), b: Array.from(l.b, x => +x.toPrecision(5)) })) }));

const LR = +(process.env.LR || 5e-4), EP = +(process.env.EP || 40);
let best = lossOn(HX, HY), bad = 0;
console.log(`ep 0 hold ${best.toFixed(5)} mae ${mae(HX, HY).toFixed(4)} (前の重みのまま)`);
save(OUT);
for (let ep = 1; ep <= EP; ep++) {
  epoch(ep > 20 ? LR / 3 : LR);
  const h = lossOn(HX, HY);
  console.log(`ep ${ep} train ${lossOn(X, Y).toFixed(5)} hold ${h.toFixed(5)} mae ${mae(HX, HY).toFixed(4)}${h < best ? ' *' : ''}`);
  if (h < best) { best = h; bad = 0; save(OUT); } else if (++bad >= 6) break;
}
console.log('saved', OUT, 'hold', best.toFixed(5));
