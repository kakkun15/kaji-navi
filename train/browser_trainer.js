// ブラウザ(鍛冶ナビの公開ページ)で動く学習。自己対戦と成績は Worker で手分け、重みの更新はページで。train.js と同じ中身。
// 使い方: 公開ページ(dist/app.html)を開いて、このファイルの中身をページで実行する。window.KAJI_TRAIN_ITEM で商材(既定 hidane)。TR.api.trainRun で学ぶ
(() => {
  const get = n => document.querySelector(`script[data-src="${n}"]`).textContent;
  const LIB = ['core.js', 'game.js', 'value.js'].map(get).join('\n;\n');
  const WK = String.raw`
const GAME = self.KajiGame, V = self.KajiValue;
function seeded(a) { return function () { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
let G = null, net = null, D = 0;
function sampleState(r) {
  const s = GAME.newState(G);
  if (r() < 0.05) return s;
  s.first = false; const u = r();
  for (const i of G.active) {
    const z = G.cells[i], x = r();
    if (x < 0.15 + 0.5 * u) s.v[i] = z[0] + Math.floor(r() * (z[1] - z[0] + 1));
    else if (x < 0.25 + 0.6 * u) s.v[i] = Math.max(0, z[0] - 1 - Math.floor(r() * 45));
    else s.v[i] = Math.max(0, Math.floor(z[0] * (r() * (0.3 + 0.7 * u))));
    if (r() < 0.25) {
      const I = z[0] + Math.floor(r() * (z[1] - z[0] + 1)), before = Math.max(0, s.v[i] - Math.floor(r() * 30));
      const rs = [12, 13, 14, 15, 16, 17, 18].map(n => Math.ceil(n * (0.6 + r() * 0.5))), rr = rs[Math.floor(r() * 7)];
      const w = I > before ? Math.min(before + 2 * rr, I) : before;
      if (w <= z[1]) { s.v[i] = w; s.bel[i] = GAME.critPosterior(z, before, w, s.bel[i], rs); }
    }
  }
  s.temp = 50 * (1 + Math.floor(r() * (u < 0.3 ? 44 : 30)));
  s.F = Math.floor(G.focus * Math.min(1, Math.max(0, (1 - u) * 1.1 + (r() - 0.5) * 0.5)));
  if (G.trait === 'hikari' && s.temp % 200 === 0) { const c = G.active.filter(i => s.v[i] < G.cells[i][0]); if (c.length) s.lit = c[Math.floor(r() * c.length)]; }
  return s;
}
function playGame(r, eps, lam, collect) {
  const s = GAME.newState(G), ideal = G.cells.map(z => z ? z[0] + Math.floor(r() * (z[1] - z[0] + 1)) : null);
  const opt = { K: 12, rnd: r, buf: new Float32Array(D) }, traj = [];
  for (let step = 0; step < 80 && !s.dead; step++) {
    const qs = V.evalActs(net, G, s, opt);
    let best = qs[0]; for (const x of qs) if (x.q > best.q) best = x;
    let pick = best;
    if (eps > 0 && r() < eps) { const top = qs.slice().sort((a, b) => b.q - a.q).slice(0, 5); pick = top[Math.floor(r() * top.length)]; }
    if (collect) traj.push({ f: V.features(G, s, null, net.ver), q: best.q, greedy: pick === best });
    if (!pick.a) break;
    GAME.play(G, s, pick.a, ideal, r);
  }
  const j = GAME.judge(G, s, ideal);
  if (collect) { let g = GAME.stopProb(G, s); for (let t = traj.length - 1; t >= 0; t--) { const x = traj[t]; const tg = x.greedy ? (1 - lam) * x.q + lam * g : x.q; collect(x.f, tg); g = tg; } }
  return j;
}
self.onmessage = e => {
  const m = e.data;
  if (m.type === 'init') { G = GAME.setup(m.cfg); D = V.featLen(G, 2); return; }
  if (m.type === 'net') { net = { sizes: m.sizes, L: m.L.map(l => ({ n: l.n, m: l.m, W: new Float32Array(l.W), b: new Float32Array(l.b) })), ver: 2 }; return; }
  if (m.type === 'gen') {
    const r = seeded(m.seed), X = [], Y = []; let great = 0;
    const col = (f, y) => { X.push(f); Y.push(y); };
    for (let g = 0; g < m.games; g++) great += playGame(r, m.eps, m.lam, col).great ? 1 : 0;
    const opt = { K: 8, rnd: r, buf: new Float32Array(D) };
    for (let k = 0; k < m.sampled; k++) { const s = sampleState(r); let b = 0; for (const x of V.evalActs(net, G, s, opt)) b = Math.max(b, x.q); X.push(V.features(G, s, null, 2)); Y.push(b); }
    const XF = new Float32Array(X.length * D); X.forEach((f, i) => XF.set(f, i * D));
    self.postMessage({ id: m.id, X: XF, Y: new Float32Array(Y), great }, [XF.buffer]);
    return;
  }
  if (m.type === 'eval') {     // 1手読み(罰0.6)で決まった種の局を打つ。res は局ごとの 0/1
    const out = [];
    for (let g = m.g0; g < m.g0 + m.n; g++) {
      const r = seeded(m.seed * 100003 + g), s = GAME.newState(G), ideal = G.cells.map(z => z ? z[0] + Math.floor(r() * (z[1] - z[0] + 1)) : null);
      const opt = { K: 12, overPen: 0.6, rnd: seeded(m.seed * 7 + g), buf: new Float32Array(D) };
      for (let k = 0; k < 80 && !s.dead; k++) { const qs = V.evalActs(net, G, s, opt); let b = qs[0]; for (const x of qs) if (x.q > b.q) b = x; if (!b.a) break; GAME.play(G, s, b.a, ideal, r); if (Array.isArray(s.lit)) s.lit = s.lit[Math.floor(r() * s.lit.length)]; }
      out.push(GAME.judge(G, s, ideal).great ? 1 : 0);
    }
    self.postMessage({ id: m.id, out });
  }
};`;
  const url = URL.createObjectURL(new Blob([LIB + '\n;\n' + WK], { type: 'text/javascript' }));
  const NW = Math.max(1, (navigator.hardwareConcurrency || 4) - 1);
  const V = window.KajiValue;
  const TR = window.TR = { log: [], status: 'idle', results: {} };
  const log = s => { TR.log.push(new Date().toLocaleTimeString() + ' ' + s); TR.status = s; };
  const workers = []; let seq = 0; const wait = new Map(), idle = [], queue = [];
  const pump = () => { while (idle.length && queue.length) { const w = idle.pop(), m = queue.shift(); w.postMessage(m); } };
  for (let i = 0; i < NW; i++) { const w = new Worker(url); w.onmessage = e => { const cb = wait.get(e.data.id); wait.delete(e.data.id); idle.push(w); pump(); cb(e.data); }; w.onerror = e => log('worker error ' + e.message); workers.push(w); idle.push(w); }
  const run = m => new Promise(res => { m.id = ++seq; wait.set(m.id, res); queue.push(m); pump(); });
  const bcast = m => workers.forEach(w => w.postMessage(m));
  const copyNet = j => ({ sizes: j.sizes.slice(), L: j.L.map(l => ({ n: l.n, m: l.m, W: Float32Array.from(l.W), b: Float32Array.from(l.b) })), ver: 2 });
  const sendNet = net => bcast({ type: 'net', sizes: net.sizes, L: net.L.map(l => ({ n: l.n, m: l.m, W: Array.from(l.W), b: Array.from(l.b) })) });
  function seeded(a) { return function () { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
  // ---- 重みの更新(train.js の trainOn と同じ: Adam・交差エントロピー・バッチ256) ----
  function trainOn(net, adam, X, Y, D, epochs, lr, rnd) {
    const N = Y.length, B = 256, idx = Array.from({ length: N }, (_, i) => i), L = net.L; let loss = 0, cnt = 0;
    for (let ep = 0; ep < epochs; ep++) {
      for (let i = N - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [idx[i], idx[j]] = [idx[j], idx[i]]; }
      for (let b0 = 0; b0 < N; b0 += B) {
        const gW = L.map(l => new Float32Array(l.W.length)), gb = L.map(l => new Float32Array(l.b.length)), bs = Math.min(B, N - b0);
        for (let q = 0; q < bs; q++) {
          const n = idx[b0 + q], x = X.subarray(n * D, n * D + D), y = Y[n];
          const acts = V.forward(net, x, true), p = V.sigmoid(acts[acts.length - 1][0]);
          loss += -(y * Math.log(p + 1e-9) + (1 - y) * Math.log(1 - p + 1e-9)); cnt++;
          let delta = new Float32Array([p - y]);
          for (let l = L.length - 1; l >= 0; l--) {
            const { n: ni, m, W } = L[l], a = acts[l], prev = l > 0 ? new Float32Array(ni) : null;
            for (let j = 0; j < m; j++) { const d = delta[j]; if (!d) continue; gb[l][j] += d; const off = j * ni; for (let k = 0; k < ni; k++) { gW[l][off + k] += d * a[k]; if (prev) prev[k] += d * W[off + k]; } }
            if (prev) { for (let k = 0; k < ni; k++) prev[k] *= (1 - a[k] * a[k]); delta = prev; }
          }
        }
        adam.t++; const b1 = 0.9, b2 = 0.999, c1 = 1 - b1 ** adam.t, c2 = 1 - b2 ** adam.t;
        for (let l = 0; l < L.length; l++) { const A = adam.s[l];
          for (let k = 0; k < L[l].W.length; k++) { const g = gW[l][k] / bs; A.mW[k] = b1 * A.mW[k] + (1 - b1) * g; A.vW[k] = b2 * A.vW[k] + (1 - b2) * g * g; L[l].W[k] -= lr * (A.mW[k] / c1) / (Math.sqrt(A.vW[k] / c2) + 1e-8); }
          for (let k = 0; k < L[l].b.length; k++) { const g = gb[l][k] / bs; A.mb[k] = b1 * A.mb[k] + (1 - b1) * g; A.vb[k] = b2 * A.vb[k] + (1 - b2) * g * g; L[l].b[k] -= lr * (A.mb[k] / c1) / (Math.sqrt(A.vb[k] / c2) + 1e-8); } }
      }
    }
    net._wz = undefined; return loss / cnt;
  }
  // 成績: 同じ種の局を手分けして打つ(局ごとの 0/1)
  async function evalNet(net, seed, n) { sendNet(net); const per = 20, jobs = []; for (let g = 0; g < n; g += per) jobs.push(run({ type: 'eval', seed, g0: g, n: Math.min(per, n - g) })); return [].concat(...(await Promise.all(jobs)).map(r => r.out)); }
  // 学習の1本: cfg = { name, iters, games, sampled, lam, lrMul, seed }
  async function trainRun(init, c) {
    const net = copyNet(init), adam = { t: 0, s: net.L.map(l => ({ mW: new Float32Array(l.W.length), vW: new Float32Array(l.W.length), mb: new Float32Array(l.b.length), vb: new Float32Array(l.b.length) })) };
    const D = net.sizes[0], rnd = seeded(c.seed * 7919 + 1), buf = [];
    for (let it = 1; it <= c.iters; it++) {
      const t0 = performance.now(); sendNet(net);
      const per = Math.ceil(c.games / NW), sper = Math.ceil(c.sampled / NW), jobs = [];
      for (let w = 0; w < NW; w++) jobs.push(run({ type: 'gen', seed: c.seed * 1000003 + it * 1009 + w, games: per, sampled: sper, eps: 0.1, lam: c.lam }));
      const rs = await Promise.all(jobs);
      let n = 0; for (const r of rs) n += r.Y.length;
      const X = new Float32Array(n * D), Y = new Float32Array(n); let o = 0, gw = 0;
      for (const r of rs) { X.set(r.X, o * D); Y.set(r.Y, o); o += r.Y.length; gw += r.great; }
      buf.push([X, Y]); if (buf.length > 3) buf.shift();
      const N = buf.reduce((a, b) => a + b[1].length, 0), AX = new Float32Array(N * D), AY = new Float32Array(N); o = 0;
      for (const [x, y] of buf) { AX.set(x, o * D); AY.set(y, o); o += y.length; }
      const t1 = performance.now();
      const loss = trainOn(net, adam, AX, AY, D, 3, (it < 5 ? 2e-3 : 1e-3) * c.lrMul, rnd);
      log(`${c.name} it ${it}/${c.iters} 自己対戦 ${(gw / (per * NW) * 100).toFixed(1)}% 局面 ${N} loss ${loss.toFixed(4)} 集め ${((t1 - t0) / 1000).toFixed(0)}s 学習 ${((performance.now() - t1) / 1000).toFixed(0)}s`);
      await new Promise(r => setTimeout(r, 0));
    }
    return net;
  }
  const avgNets = ns => { const a = copyNet(ns[0]); a.L.forEach((l, li) => { for (const key of ['W', 'b']) for (let k = 0; k < l[key].length; k++) { let s = 0; for (const n of ns) s += n.L[li][key][k]; l[key][k] = s / ns.length; } }); return a; };
  const pack = net => ({ sizes: net.sizes, L: net.L.map(l => ({ n: l.n, m: l.m, W: Array.from(l.W, x => +x.toPrecision(6)), b: Array.from(l.b, x => +x.toPrecision(6)) })) });
  TR.api = { run, bcast, sendNet, copyNet, evalNet, trainRun, avgNets, pack, NW, log };
  bcast({ type: 'init', cfg: { item: window.KAJI_TRAIN_ITEM || 'hidane', level: 80, hammer: 'hikari', star: 3, focus: 253 } });
  log(`準備できた Worker ${NW}`);
})();
