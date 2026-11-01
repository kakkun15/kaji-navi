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
  async function create(wgsl, j, G, dev) {
    if (!dev) { const ad = await navigator.gpu.requestAdapter({ powerPreference: 'high-performance' }); dev = await ad.requestDevice(); }
    if (G.cells.length !== 6 || G.trait !== 'hikari' || j.sizes.length !== 4 || j.sizes[0] !== 111) throw new Error('GPU 最強はひだね(111×H×H×1)だけ');
    const H = j.sizes[1];
    const mod = dev.createShaderModule({ code: wgsl });
    const info = await mod.getCompilationInfo(); const errs = info.messages.filter(m => m.type === 'error');
    if (errs.length) throw new Error('WGSL: ' + errs.map(m => m.lineNum + ' ' + m.message).join(' / '));
    const pipe = await dev.createComputePipelineAsync({ layout: 'auto', compute: { module: mod, entryPoint: 'main' } });
    const NW = new Float32Array(H * 111 + H + H * H + H + H + 1); let o = 0;
    for (const l of j.L) { NW.set(l.W, o); o += l.W.length; NW.set(l.b, o); o += l.b.length; }
    const buf = (a, u) => { const b = dev.createBuffer({ size: Math.max(16, Math.ceil(a.byteLength / 16) * 16), usage: u | GPUBufferUsage.COPY_DST }); dev.queue.writeBuffer(b, 0, a); return b; };
    const S = GPUBufferUsage.STORAGE;
    const bNW = buf(NW, S);
    const acts = G.acts, A = new Uint32Array(acts.length * 6);
    acts.forEach((x, i) => { A[i * 6] = x.t.ix; A[i * 6 + 1] = x.tg.length; x.tg.forEach((c, k) => A[i * 6 + 2 + k] = c); });
    const bA = buf(A, S);
    const toolCrit = CORE.critRate('tataku', { temp: 1000, trait: G.trait, lit: false, first: true, level: G.level, hammer: G.hammer, star: G.star }) * 100;
    const bP = dev.createBuffer({ size: 32, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
    let cap = 0, bCH = null, bO = null, bR = null, bg = null;
    const ensure = n => {
      if (n <= cap) return;
      cap = Math.max(n, 256);
      for (const b of [bCH, bO, bR]) if (b) b.destroy();
      bCH = dev.createBuffer({ size: cap * SW * 4, usage: S | GPUBufferUsage.COPY_DST });
      const outN = cap * (acts.length + 1) * 4;
      bO = dev.createBuffer({ size: outN, usage: S | GPUBufferUsage.COPY_SRC });
      bR = dev.createBuffer({ size: outN, usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST });
      bg = dev.createBindGroup({ layout: pipe.getBindGroupLayout(0), entries: [bP, bCH, bA, bNW, bO].map((b, i) => ({ binding: i, resource: { buffer: b } })) });
    };
    let chain = Promise.resolve();
    // 子の局面 children の、手ごとの1手読みの値(打てない手は -1)とやめる確率
    async function evalChildren(children, K, overPen, seed) {
      const n = children.length; ensure(n);
      const ab = new ArrayBuffer(n * SW * 4), I = new Int32Array(ab), F = new Float32Array(ab);
      children.forEach((c, i) => packState(G, c, I, F, i * SW));
      dev.queue.writeBuffer(bCH, 0, ab);
      const pb = new ArrayBuffer(32), pu = new Uint32Array(pb), pf = new Float32Array(pb);
      pu[0] = n; pu[1] = acts.length; pu[2] = K; pu[3] = seed >>> 0; pf[4] = overPen; pf[5] = toolCrit; pu[6] = H; pu[7] = 111;
      dev.queue.writeBuffer(bP, 0, pb);
      const tot = n * (acts.length + 1);
      const e = dev.createCommandEncoder(), p = e.beginComputePass(); p.setPipeline(pipe); p.setBindGroup(0, bg); p.dispatchWorkgroups(Math.ceil(tot / 64)); p.end();
      e.copyBufferToBuffer(bO, 0, bR, 0, tot * 4); dev.queue.submit([e.finish()]);
      await bR.mapAsync(GPUMapMode.READ, 0, tot * 4);
      const out = new Float32Array(bR.getMappedRange(0, tot * 4).slice(0)); bR.unmap();
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
      const nA = acts.length, out = children.length ? await evalChildren(children, opt.Ki || opt.K || 12, opt.overPen || 0, (opt.seed * 2654435761) >>> 0) : new Float32Array(0);
      const best = children.map((_, i) => { let m = 0; const b = i * (nA + 1); for (let k = 0; k <= nA; k++) if (out[b + k] > m) m = out[b + k]; return m; });
      for (const p of plans) { let sum = 0; for (const [i, w] of p.terms) sum += w * best[i]; p.x.q2 = (p.wsum > 0 ? sum / p.wsum : 0) - p.pen; }
      for (const x of res) if (x.q2 === undefined) x.q2 = -1;
      res.children = children.length;
      return res;
    }
    const evalMax = (s, opt, net) => { const p = chain.then(() => evalMaxRaw(s, opt, net)); chain = p.catch(() => {}); return p; };
    return { evalMax, evalChildren, dev, acts };
  }
  root.KajiGPUMax = { create, packState };
})(typeof window !== 'undefined' ? window : globalThis);
