// GPU 学習室: ネット(全結合・tanh・出力はシグモイドの前の値)を WebGPU で動かす。ブラウザ専用。
// 重みの形は value.js と同じ: L[l] = { n(入力), m(出力), W[j*n + k], b[j] }。
// infer(X, count) … まとめて見積もり(シグモイドの前の値)。
// trainStep(X, Y) … 交差エントロピー・Adam を1回(train.js の trainOn と同じ式。バッチは大きい)。
(function (root) {
  'use strict';
  const MM = `
struct P { M:u32, N:u32, K:u32, asi:u32, ask:u32, bsk:u32, bsj:u32, mode:u32, scale:f32, p0:u32, p1:u32, p2:u32 };
@group(0) @binding(0) var<uniform> p: P;
@group(0) @binding(1) var<storage, read> A: array<f32>;
@group(0) @binding(2) var<storage, read> B: array<f32>;
@group(0) @binding(3) var<storage, read> X: array<f32>;
@group(0) @binding(4) var<storage, read_write> C: array<f32>;
var<workgroup> tA: array<f32, 1024>;
var<workgroup> tB: array<f32, 1024>;
@compute @workgroup_size(16, 16)
fn main(@builtin(workgroup_id) wg: vec3u, @builtin(local_invocation_id) lid: vec3u, @builtin(local_invocation_index) li: u32) {
  let row0 = wg.y * 64u; let col0 = wg.x * 64u;
  var acc: array<f32, 16>;
  for (var k0 = 0u; k0 < p.K; k0 += 16u) {
    for (var e = 0u; e < 4u; e++) {
      let idx = li + e * 256u;
      let r = idx / 16u; let k = idx % 16u; let gi = row0 + r; let gk = k0 + k;
      var va = 0.0; if (gi < p.M && gk < p.K) { va = A[gi * p.asi + gk * p.ask]; }
      tA[idx] = va;
      let kb = idx / 64u; let c = idx % 64u; let gj = col0 + c; let gkb = k0 + kb;
      var vb = 0.0; if (gkb < p.K && gj < p.N) { vb = B[gkb * p.bsk + gj * p.bsj]; }
      tB[idx] = vb;
    }
    workgroupBarrier();
    for (var kk = 0u; kk < 16u; kk++) {
      var a: array<f32, 4>; var b: array<f32, 4>;
      for (var u = 0u; u < 4u; u++) { a[u] = tA[(lid.y * 4u + u) * 16u + kk]; b[u] = tB[kk * 64u + lid.x * 4u + u]; }
      for (var u = 0u; u < 4u; u++) { for (var v = 0u; v < 4u; v++) { acc[u * 4u + v] += a[u] * b[v]; } }
    }
    workgroupBarrier();
  }
  for (var u = 0u; u < 4u; u++) {
    let i = row0 + lid.y * 4u + u;
    if (i >= p.M) { continue; }
    for (var v = 0u; v < 4u; v++) {
      let j = col0 + lid.x * 4u + v;
      if (j >= p.N) { continue; }
      let s = acc[u * 4u + v];
      var o = 0.0;
      if (p.mode == 0u) { o = tanh(clamp(s + X[j], -15.0, 15.0)); }
      else if (p.mode == 1u) { o = s + X[j]; }
      else if (p.mode == 2u) { let q = X[i * p.N + j]; o = s * (1.0 - q * q); }
      else { o = s * p.scale; }
      C[i * p.N + j] = o;
    }
  }
}`;
  // 出力の差(シグモイド − 目標)と損失
  const OUTK = `
struct P { n:u32, a:u32, b:u32, c:u32 };
@group(0) @binding(0) var<uniform> p: P;
@group(0) @binding(1) var<storage, read> Z: array<f32>;
@group(0) @binding(2) var<storage, read> Y: array<f32>;
@group(0) @binding(3) var<storage, read_write> Dl: array<f32>;
@group(0) @binding(4) var<storage, read_write> Ls: array<f32>;
@compute @workgroup_size(256)
fn main(@builtin(global_invocation_id) g: vec3u) {
  let i = g.x; if (i >= p.n) { return; }
  let z = clamp(Z[i], -30.0, 30.0); let q = 1.0 / (1.0 + exp(-z)); let y = Y[i];
  Dl[i] = q - y;
  Ls[i] = -(y * log(q + 1e-9) + (1.0 - y) * log(1.0 - q + 1e-9));
}`;
  const ADAMK = `
struct P { n:u32, a:u32, b:u32, c:u32 };
struct H { lr:f32, c1:f32, c2:f32, d:f32 };
@group(0) @binding(0) var<uniform> p: P;
@group(0) @binding(1) var<uniform> h: H;
@group(0) @binding(2) var<storage, read> Gr: array<f32>;
@group(0) @binding(3) var<storage, read_write> W: array<f32>;
@group(0) @binding(4) var<storage, read_write> Mm: array<f32>;
@group(0) @binding(5) var<storage, read_write> Vv: array<f32>;
@compute @workgroup_size(256)
fn main(@builtin(global_invocation_id) g: vec3u) {
  let i = g.x; if (i >= p.n) { return; }
  let gr = Gr[i];
  let m = 0.9 * Mm[i] + 0.1 * gr; let v = 0.999 * Vv[i] + 0.001 * gr * gr;
  Mm[i] = m; Vv[i] = v;
  W[i] = W[i] - h.lr * (m / h.c1) / (sqrt(v / h.c2) + 1e-8);
}`;
  const S = GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST | GPUBufferUsage.COPY_SRC;

  async function device() {
    if (!navigator.gpu) throw new Error('WebGPU が使えない');
    const ad = await navigator.gpu.requestAdapter({ powerPreference: 'high-performance' });
    if (!ad) throw new Error('GPU が見つからない');
    const dev = await ad.requestDevice({ requiredLimits: { maxStorageBufferBindingSize: ad.limits.maxStorageBufferBindingSize, maxBufferSize: ad.limits.maxBufferSize } });
    dev.lost.then(i => { root.KajiGPUlost = i.message || 'lost'; });
    const pipe = code => dev.createComputePipeline({ layout: 'auto', compute: { module: dev.createShaderModule({ code }), entryPoint: 'main' } });
    return { dev, ad, mm: pipe(MM), outk: pipe(OUTK), adamk: pipe(ADAMK), info: ad.info || {} };
  }

  function GNet(ctx, j, opt) {
    const { dev } = ctx; opt = opt || {};
    const sizes = j.sizes.slice(), NL = sizes.length - 1;
    const buf = (n, u = S) => dev.createBuffer({ size: Math.max(16, Math.ceil(n * 4 / 16) * 16), usage: u });
    const W = [], Bb = [];
    for (let l = 0; l < NL; l++) {
      const n = sizes[l], m = sizes[l + 1];
      W.push(buf(n * m)); Bb.push(buf(m));
      dev.queue.writeBuffer(W[l], 0, Float32Array.from(j.L[l].W)); dev.queue.writeBuffer(Bb[l], 0, Float32Array.from(j.L[l].b));
    }
    const uni = () => dev.createBuffer({ size: 48, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
    const bg = (pipe, bufs) => dev.createBindGroup({ layout: pipe.getBindGroupLayout(0), entries: bufs.map((b, i) => ({ binding: i, resource: { buffer: b } })) });
    const mmU = (u, M, N, K, asi, ask, bsk, bsj, mode, scale) => {
      const a = new ArrayBuffer(48), U = new Uint32Array(a), F = new Float32Array(a);
      U.set([M, N, K, asi, ask, bsk, bsj, mode]); F[8] = scale || 0; dev.queue.writeBuffer(u, 0, a);
    };
    const disp = (ps, pipe, g, M, N) => { ps.setPipeline(pipe); ps.setBindGroup(0, g); ps.dispatchWorkgroups(Math.ceil(N / 64), Math.ceil(M / 64)); };

    // ---- 見積もり(まとめて) ----
    const cap = opt.cap || 262144;
    const IA = [buf(cap * sizes[0])]; for (let l = 1; l <= NL; l++) IA.push(buf(cap * sizes[l]));
    const IU = [], IG = [];
    for (let l = 0; l < NL; l++) { IU.push(uni()); IG.push(bg(ctx.mm, [IU[l], IA[l], W[l], Bb[l], IA[l + 1]])); }
    const rb = [buf(cap, GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST), buf(cap, GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST)];
    let rbi = 0, chain = Promise.resolve();
    // parts: [Float32Array, ...] を順に並べた count 個。答えは count 個の Float32Array
    function inferRaw(parts, count) {
      const run = async () => {
        let o = 0;
        for (const x of parts) { dev.queue.writeBuffer(IA[0], o * 4, x.buffer, x.byteOffset, x.byteLength); o += x.length; }
        const e = dev.createCommandEncoder(), ps = e.beginComputePass();
        for (let l = 0; l < NL; l++) { mmU(IU[l], count, sizes[l + 1], sizes[l], sizes[l], 1, 1, sizes[l], l < NL - 1 ? 0 : 1); disp(ps, ctx.mm, IG[l], count, sizes[l + 1]); }
        ps.end();
        const R = rb[rbi]; rbi ^= 1;
        e.copyBufferToBuffer(IA[NL], 0, R, 0, Math.ceil(count * 4 / 16) * 16);
        dev.queue.submit([e.finish()]);
        await R.mapAsync(GPUMapMode.READ, 0, Math.ceil(count * 4 / 16) * 16);
        const z = new Float32Array(R.getMappedRange(0, Math.ceil(count * 4 / 16) * 16).slice(0, count * 4));
        R.unmap();
        return z;
      };
      const p = chain.then(run); chain = p.catch(() => {}); return p;
    }
    // 大きい時は cap ごとに分ける
    async function infer(X, count) {
      const D = sizes[0];
      if (count <= cap) return inferRaw([X.subarray(0, count * D)], count);
      const out = new Float32Array(count);
      for (let s = 0; s < count; s += cap) { const n = Math.min(cap, count - s); out.set(await inferRaw([X.subarray(s * D, (s + n) * D)], n), s); }
      return out;
    }

    // ---- 学習 ----
    const BT = opt.batch || 1024;
    let T = null;
    function trainInit() {
      const A = [buf(BT * sizes[0])]; for (let l = 1; l <= NL; l++) A.push(buf(BT * sizes[l]));
      const Dl = []; for (let l = 1; l <= NL; l++) Dl.push(buf(BT * sizes[l]));     // Dl[l-1] は層 l-1 の出力の差
      const Y = buf(BT), LS = buf(BT), ones = buf(BT); dev.queue.writeBuffer(ones, 0, new Float32Array(BT).fill(1));
      const GW = W.map((_, l) => buf(sizes[l] * sizes[l + 1])), GB = Bb.map((_, l) => buf(sizes[l + 1]));
      const zeros = n => { const b = buf(n); return b; };
      const MW = W.map((_, l) => zeros(sizes[l] * sizes[l + 1])), VW = W.map((_, l) => zeros(sizes[l] * sizes[l + 1]));
      const MB = Bb.map((_, l) => zeros(sizes[l + 1])), VB = Bb.map((_, l) => zeros(sizes[l + 1]));
      const H = uni();
      const ops = [];   // 順に流す: [pipe, bindgroup, wx, wy] (wx, wy はワークグループの数)
      const U = () => uni();
      // 前向き
      for (let l = 0; l < NL; l++) { const u = U(); mmU(u, BT, sizes[l + 1], sizes[l], sizes[l], 1, 1, sizes[l], l < NL - 1 ? 0 : 1); ops.push([ctx.mm, bg(ctx.mm, [u, A[l], W[l], Bb[l], A[l + 1]]), Math.ceil(sizes[l + 1] / 64), Math.ceil(BT / 64)]); }
      // 出力の差
      { const u = U(); dev.queue.writeBuffer(u, 0, new Uint32Array([BT, 0, 0, 0])); ops.push([ctx.outk, bg(ctx.outk, [u, A[NL], Y, Dl[NL - 1], LS]), Math.ceil(BT / 256), 1]); }
      // 後ろ向き
      for (let l = NL - 1; l >= 0; l--) {
        const n = sizes[l], m = sizes[l + 1], D = Dl[l];
        { const u = U(); mmU(u, m, n, BT, 1, m, n, 1, 3, 1 / BT); ops.push([ctx.mm, bg(ctx.mm, [u, D, A[l], A[l], GW[l]]), Math.ceil(n / 64), Math.ceil(m / 64)]); }
        { const u = U(); mmU(u, m, 1, BT, 1, m, 1, 0, 3, 1 / BT); ops.push([ctx.mm, bg(ctx.mm, [u, D, ones, ones, GB[l]]), 1, Math.ceil(m / 64)]); }
        if (l > 0) { const u = U(); mmU(u, BT, n, m, m, 1, n, 1, 2, 0); ops.push([ctx.mm, bg(ctx.mm, [u, D, W[l], A[l], Dl[l - 1]]), Math.ceil(n / 64), Math.ceil(BT / 64)]); }
      }
      // Adam(勾配がそろってから重みを変える)
      for (let l = 0; l < NL; l++) {
        for (const [P, G, M, Vv] of [[W[l], GW[l], MW[l], VW[l]], [Bb[l], GB[l], MB[l], VB[l]]]) {
          const n = P.size / 4, u = U(); dev.queue.writeBuffer(u, 0, new Uint32Array([n, 0, 0, 0]));
          ops.push([ctx.adamk, bg(ctx.adamk, [u, H, G, P, M, Vv]), Math.ceil(n / 256), 1]);
        }
      }
      const lossRb = buf(BT, GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST);
      T = { A, Y, H, ops, LS, lossRb, t: 0, busyLoss: false, lastLoss: NaN };
    }
    // X: BT×D、Y: BT。lr は学習率。wantLoss なら損失を読む(少し待つ)
    async function trainStep(X, Yv, lr, wantLoss) {
      if (!T) trainInit();
      T.t++;
      const c1 = 1 - Math.pow(0.9, T.t), c2 = 1 - Math.pow(0.999, T.t);
      dev.queue.writeBuffer(T.A[0], 0, X.buffer, X.byteOffset, X.byteLength);
      dev.queue.writeBuffer(T.Y, 0, Yv.buffer, Yv.byteOffset, Yv.byteLength);
      dev.queue.writeBuffer(T.H, 0, new Float32Array([lr, c1, c2, 0]));
      const e = dev.createCommandEncoder();
      for (const [pipe, g, wx, wy] of T.ops) { const ps = e.beginComputePass(); ps.setPipeline(pipe); ps.setBindGroup(0, g); ps.dispatchWorkgroups(wx, wy); ps.end(); }
      if (wantLoss) e.copyBufferToBuffer(T.LS, 0, T.lossRb, 0, BT * 4);
      dev.queue.submit([e.finish()]);
      if (wantLoss) {
        await T.lossRb.mapAsync(GPUMapMode.READ);
        const L = new Float32Array(T.lossRb.getMappedRange().slice(0)); T.lossRb.unmap();
        let s = 0; for (const x of L) s += x; T.lastLoss = s / BT;
      }
      return T.lastLoss;
    }
    const idle = () => dev.queue.onSubmittedWorkDone();
    // 重みを読み出す(value.js の形)
    async function readNet() {
      const out = { sizes: sizes.slice(), L: [] };
      for (let l = 0; l < NL; l++) {
        const n = sizes[l], m = sizes[l + 1], r1 = buf(n * m, GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST), r2 = buf(m, GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST);
        const e = dev.createCommandEncoder(); e.copyBufferToBuffer(W[l], 0, r1, 0, W[l].size); e.copyBufferToBuffer(Bb[l], 0, r2, 0, Bb[l].size); dev.queue.submit([e.finish()]);
        await r1.mapAsync(GPUMapMode.READ); await r2.mapAsync(GPUMapMode.READ);
        out.L.push({ n, m, W: new Float32Array(r1.getMappedRange().slice(0, n * m * 4)), b: new Float32Array(r2.getMappedRange().slice(0, m * 4)) });
        r1.destroy(); r2.destroy();
      }
      return out;
    }
    function setNet(j2) { for (let l = 0; l < NL; l++) { dev.queue.writeBuffer(W[l], 0, Float32Array.from(j2.L[l].W)); dev.queue.writeBuffer(Bb[l], 0, Float32Array.from(j2.L[l].b)); } }
    return { sizes, infer, inferRaw, trainStep, readNet, setNet, idle, cap, BT, get steps() { return T ? T.t : 0; } };
  }
  // 大きいネットの最初の重み(value.js の makeNet と同じ散らし方)
  function makeNet(sizes, rnd) {
    const L = [];
    for (let l = 0; l + 1 < sizes.length; l++) {
      const n = sizes[l], m = sizes[l + 1], W = new Float32Array(n * m), b = new Float32Array(m), sc = Math.sqrt(1 / n);
      for (let q = 0; q < W.length; q++) W[q] = (rnd() * 2 - 1) * sc * 1.7;
      L.push({ n, m, W, b });
    }
    return { sizes, L };
  }
  root.KajiGPU = { device, GNet, makeNet };
})(typeof window !== 'undefined' ? window : globalThis);
