// GPU 最強(ページ側、2026-11-01)。最強の2段目(打った後の局面ごとの1手読み)を、部品①〜⑤の WGSL で GPU にまとめて計算する。
// 1段目(全部の手をざっと読む)は CPU(数ms)。2段目の「子の局面」の作り方は value.js の act2Value と同じ(同じ局面はまとめる)。
// 使い方: const g = await KajiGPUMax.create(wgslText, netJson, G); const res = await g.evalMax(s, opt)  // res は pool.js の evalMax と同じ形
(function (root) {
  'use strict';
  const GAME = root.KajiGame, V = root.KajiValue, CORE = root.KajiCore;
  const SW = 79;
  function seeded(a) { return function () { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
  function packState(G, s, I, F, o) {
    for (let k = 0; k < 6; k++) { I[o + k] = s.v[k]; const b = s.bel[k]; for (let q = 0; q < 11; q++) F[o + 6 + k * 11 + q] = q < b.length ? b[q] : 0; }
    I[o + 72] = s.temp; I[o + 73] = s.F; I[o + 74] = s.first ? 1 : 0; I[o + 75] = s.last ? CORE.TECH[s.last].ix : -1;
    I[o + 76] = typeof s.lit === 'number' ? s.lit : -1; I[o + 77] = 0; I[o + 78] = s.dead ? 1 : 0;
  }
  // 行列の掛け算(gpu/gpunet.js の MM と同じ。C = act(A·Bᵀ + bias))
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
  let row0 = wg.y * 64u + wg.z * 65535u * 64u; let col0 = wg.x * 64u;
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
      if (p.mode == 0u) { C[i * p.N + j] = tanh(clamp(s + X[j], -15.0, 15.0)); } else { C[i * p.N + j] = s + X[j]; }
    }
  }
}`;
  async function create(wgsl, j, G, dev) {
    if (!dev) { const ad = await navigator.gpu.requestAdapter({ powerPreference: 'high-performance' }); dev = await ad.requestDevice({ requiredLimits: { maxStorageBufferBindingSize: ad.limits.maxStorageBufferBindingSize, maxBufferSize: ad.limits.maxBufferSize } }); }
    if (G.cells.length !== 6 || G.trait !== 'hikari' || j.sizes.length !== 4 || j.sizes[0] !== 111) throw new Error('GPU 最強はひだね(111×H×H×1)だけ');
    const H = j.sizes[1];
    const mod = dev.createShaderModule({ code: wgsl });
    const info = await mod.getCompilationInfo(); const errs = info.messages.filter(m => m.type === 'error');
    if (errs.length) throw new Error('WGSL: ' + errs.map(m => m.lineNum + ' ' + m.message).join(' / '));
    const C = GPUShaderStage.COMPUTE, RO = { type: 'read-only-storage' }, RW = { type: 'storage' };
    const bgl = dev.createBindGroupLayout({ entries: [{ binding: 0, visibility: C, buffer: { type: 'uniform' } }, { binding: 1, visibility: C, buffer: RO }, { binding: 2, visibility: C, buffer: RO },
      { binding: 3, visibility: C, buffer: RW }, { binding: 4, visibility: C, buffer: RW }, { binding: 5, visibility: C, buffer: RW }, { binding: 6, visibility: C, buffer: RW },
      { binding: 7, visibility: C, buffer: RO }, { binding: 8, visibility: C, buffer: RW }] });
    const layout = dev.createPipelineLayout({ bindGroupLayouts: [bgl] });
    const [pCount, pEmit, pComb] = await Promise.all(['count', 'emit', 'combine'].map(e => dev.createComputePipelineAsync({ layout, compute: { module: mod, entryPoint: e } })));
    const mmMod = dev.createShaderModule({ code: MM }), pMM = await dev.createComputePipelineAsync({ layout: 'auto', compute: { module: mmMod, entryPoint: 'main' } });
    const S = GPUBufferUsage.STORAGE, CD = GPUBufferUsage.COPY_DST, CS = GPUBufferUsage.COPY_SRC;
    const mk = (n, u) => dev.createBuffer({ size: Math.max(16, Math.ceil(n * 4 / 16) * 16), usage: u });
    const upl = (a, u) => { const b = mk(a.length, u | CD); dev.queue.writeBuffer(b, 0, a); return b; };
    const Wb = j.L.map(l => upl(Float32Array.from(l.W), S)), Bb = j.L.map(l => upl(Float32Array.from(l.b), S));
    const acts = G.acts, A = new Uint32Array(acts.length * 6);
    acts.forEach((x, i) => { A[i * 6] = x.t.ix; A[i * 6 + 1] = x.tg.length; x.tg.forEach((c, k) => A[i * 6 + 2 + k] = c); });
    const bA = upl(A, S);
    const toolCrit = CORE.critRate('tataku', { temp: 1000, trait: G.trait, lit: false, first: true, level: G.level, hammer: G.hammer, star: G.star }) * 100;
    const bP = dev.createBuffer({ size: 32, usage: GPUBufferUsage.UNIFORM | CD });
    const mmU = [0, 1, 2].map(() => dev.createBuffer({ size: 48, usage: GPUBufferUsage.UNIFORM | CD }));
    const nA = acts.length;
    let capC = 0, capL = 0, bCH, bCNT, bCST, bOQ, rCNT, rOQ, bX, bLWS, bH1, bH2, bZ, bg = null, mmBG = null;
    const sizeC = n => {
      if (n <= capC) return; capC = Math.max(n, 512);
      for (const b of [bCH, bCNT, bCST, bOQ, rCNT, rOQ]) if (b) b.destroy();
      const T = capC * (nA + 1) + 1;
      bCH = mk(capC * SW, S | CD); bCNT = mk(T, S | CD | CS); bCST = mk(T, S); bOQ = mk(T, S | CS);
      rCNT = mk(T, GPUBufferUsage.MAP_READ | CD); rOQ = mk(T, GPUBufferUsage.MAP_READ | CD); bg = null;
    };
    const sizeL = L => {
      if (L <= capL) return; capL = Math.max(Math.ceil(L * 1.3), 65536);
      for (const b of [bX, bLWS, bH1, bH2, bZ]) if (b) b.destroy();
      bX = mk(capL * 111, S); bLWS = mk(capL * 2, S); bH1 = mk(capL * H, S); bH2 = mk(capL * H, S); bZ = mk(capL, S); bg = null;
    };
    const bindAll = () => {
      bg = dev.createBindGroup({ layout: bgl, entries: [bP, bCH, bA, bCNT, bCST, bX, bLWS, bZ, bOQ].map((b, i) => ({ binding: i, resource: { buffer: b } })) });
      const io = [[bX, bH1], [bH1, bH2], [bH2, bZ]];
      mmBG = io.map(([a, c], l) => dev.createBindGroup({ layout: pMM.getBindGroupLayout(0), entries: [mmU[l], a, Wb[l], Bb[l], c].map((b, i) => ({ binding: i, resource: { buffer: b } })) }));
    };
    const disp = (pass, pipe, g, n) => { pass.setPipeline(pipe); pass.setBindGroup(0, g); pass.dispatchWorkgroups(Math.ceil(n / 64)); };
    let chain = Promise.resolve(), stats = {};
    // 子の局面 children の、手ごとの1手読みの値(打てない手は -1)と、最後にやめる確率
    async function evalChildren(children, K, overPen, seed) {
      const n = children.length; sizeC(n);
      const ab = new ArrayBuffer(n * SW * 4), I = new Int32Array(ab), F = new Float32Array(ab);
      children.forEach((c, i) => packState(G, c, I, F, i * SW));
      dev.queue.writeBuffer(bCH, 0, ab);
      const pb = new ArrayBuffer(32), pu = new Uint32Array(pb), pf = new Float32Array(pb);
      pu[0] = n; pu[1] = nA; pu[2] = K; pu[3] = seed >>> 0; pf[4] = overPen; pf[5] = toolCrit;
      dev.queue.writeBuffer(bP, 0, pb);
      const T = n * (nA + 1);
      if (!capL) sizeL(1);
      if (!bg) bindAll();
      // 1) 葉の数
      let e = dev.createCommandEncoder(), ps = e.beginComputePass(); disp(ps, pCount, bg, T); ps.end();
      e.copyBufferToBuffer(bCNT, 0, rCNT, 0, T * 4); dev.queue.submit([e.finish()]);
      await rCNT.mapAsync(GPUMapMode.READ, 0, T * 4);
      const cnt = new Uint32Array(rCNT.getMappedRange(0, T * 4)), off = new Uint32Array(T + 1);
      let L = 0; for (let i = 0; i < T; i++) { off[i] = L; L += cnt[i]; } off[T] = L; rCNT.unmap();
      sizeL(L); if (!bg) bindAll();
      dev.queue.writeBuffer(bCNT, 0, off);
      // 2) 葉を書く → 3) ネット(まとめて) → 4) 組み立て
      const mmP = (u, M, N, Kd, mode) => { const a = new ArrayBuffer(48), U = new Uint32Array(a); U.set([M, N, Kd, Kd, 1, 1, Kd, mode]); dev.queue.writeBuffer(u, 0, a); };
      mmP(mmU[0], L, H, 111, 0); mmP(mmU[1], L, H, H, 0); mmP(mmU[2], L, 1, H, 1);
      e = dev.createCommandEncoder(); ps = e.beginComputePass(); disp(ps, pEmit, bg, T); ps.end();
      const rowsWG = Math.ceil(L / 64), gy = Math.min(rowsWG, 65535), gz = Math.ceil(rowsWG / 65535);
      for (const [l, N] of [[0, H], [1, H], [2, 1]]) { const p = e.beginComputePass(); p.setPipeline(pMM); p.setBindGroup(0, mmBG[l]); if (L) p.dispatchWorkgroups(Math.ceil(N / 64), gy, gz); p.end(); }
      ps = e.beginComputePass(); disp(ps, pComb, bg, T); ps.end();
      e.copyBufferToBuffer(bOQ, 0, rOQ, 0, T * 4); dev.queue.submit([e.finish()]);
      await rOQ.mapAsync(GPUMapMode.READ, 0, T * 4);
      const out = new Float32Array(rOQ.getMappedRange(0, T * 4).slice(0)); rOQ.unmap();
      stats = { children: n, leaves: L };
      return out;
    }
    // 最強の読み(pool.js の evalMax と同じ形で返す)
    async function evalMaxRaw(s, opt, net) {
      const o1 = { K: opt.K || 12, overPen: opt.overPen, rnd: seeded(opt.seed), buf: new Float32Array(111) };
      const res = V.evalActs(net, G, s, o1);              // 1段目(CPU)。最後が「やめる」
      for (const x of res) if (!x.a) x.q2 = x.q;
      const top = res.filter(x => x.a).sort((a, b) => b.q - a.q).slice(0, opt.N2);
      // 2段目の子の局面を集める(act2Value と同じ作り方)
      const keyIx = new Map(), children = [], plans = [];
      const addChild = (s2, wt, terms) => {
        if (s2.dead) return;
        if (Array.isArray(s2.lit)) { const cand = s2.lit; for (const c of cand) { const t = GAME.cloneState(s2); t.lit = c; addChild(t, wt / cand.length, terms); } return; }
        const key = V.stateKey(s2); let i = keyIx.get(key);
        if (i === undefined) { i = children.length; keyIx.set(key, i); children.push(GAME.cloneState(s2)); }
        terms.push([i, wt]);
      };
      top.forEach((x, ti) => {
        const a = x.a, rnd = seeded(opt.seed + 7919 * (ti + 1)), terms = []; let wsum = 0;
        if (!a.t.area) { const s2 = GAME.cloneState(s); GAME.afterAct(G, s2, a, null); addChild(s2, 1, terms); wsum = 1; }
        else if (a.tg.length === 1) {
          const j = a.tg[0], { rs, cr } = GAME.hitParams(G, s, a.t, j);
          for (const o of GAME.massOutcomes(G.cells[j], s.v[j], s.bel[j], rs, cr)) {
            wsum += o.p; if (GAME.overDead(G, j, o.w)) continue;
            const s2 = GAME.cloneState(s); s2.v[j] = o.w; s2.bel[j] = o.bel; GAME.afterAct(G, s2, a, null); addChild(s2, o.p, terms);
          }
        } else {
          const per = a.tg.map(j => { const { rs, cr } = GAME.hitParams(G, s, a.t, j); return { j, outs: GAME.massOutcomes(G.cells[j], s.v[j], s.bel[j], rs, cr) }; });
          for (let k = 0; k < (opt.K2 || 8); k++) {
            const s2 = GAME.cloneState(s);
            for (const { j, outs } of per) { let u = rnd(), o = outs[outs.length - 1]; for (const y of outs) { u -= y.p; if (u <= 0) { o = y; break; } } s2.v[j] = o.w; s2.bel[j] = o.bel; if (GAME.overDead(G, j, o.w)) s2.dead = true; }
            wsum += 1; if (!s2.dead) { GAME.afterAct(G, s2, a, null); addChild(s2, 1, terms); }
          }
        }
        let pen = 0;
        if (opt.overPen && a.t.area) { let ok = 1; for (const j of a.tg) { const { rs, cr } = GAME.hitParams(G, s, a.t, j); let o2 = 0; for (const o of GAME.massOutcomes(G.cells[j], s.v[j], s.bel[j], rs, cr)) if (o.w > G.cells[j][1]) o2 += o.p; ok *= 1 - o2; } pen = opt.overPen * (1 - ok); }
        plans.push({ x, terms, wsum, pen });
      });
      const out = children.length ? await evalChildren(children, opt.Ki || opt.K || 12, opt.overPen || 0, (opt.seed * 2654435761) >>> 0) : new Float32Array(0);
      const best = children.map((_, i) => { let m = 0; const b = i * (nA + 1); for (let k = 0; k <= nA; k++) if (out[b + k] > m) m = out[b + k]; return m; });
      for (const p of plans) { let sum = 0; for (const [i, w] of p.terms) sum += w * best[i]; p.x.q2 = (p.wsum > 0 ? sum / p.wsum : 0) - p.pen; }
      for (const x of res) if (x.q2 === undefined) x.q2 = -1;
      res.children = children.length; res.leaves = stats.leaves;
      return res;
    }
    const evalMax = (s, opt, net) => { const p = chain.then(() => evalMaxRaw(s, opt, net)); chain = p.catch(() => {}); return p; };
    return { evalMax, evalChildren, dev, acts, get stats() { return stats; } };
  }
  root.KajiGPUMax = { create, packState };
})(typeof window !== 'undefined' ? window : globalThis);
