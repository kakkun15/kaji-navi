// 鍛冶ナビ 最強の2段目を GPU で見積もるための「葉の一覧」作り(2026-11-01)。
// act2Part(value.js)と同じ読みを、ネットを呼ばずに「見積もる局面(葉)の特徴」と「組み立て方」に分ける。
// Worker で葉を作り → ページで GPU がまとめて見積もり → ページで組み立てる。乱数が同じなら act2Part と同じ答えになる(差は float のみ)。
(function (root) {
  'use strict';
  const isNode = typeof module !== 'undefined' && module.exports;
  const GAME = isNode ? require('../src/game.js') : root.KajiGame;
  const V = isNode ? require('../src/value.js') : root.KajiValue;

  // 伸びる入れ物
  function Buf(T, n) { return { T, a: new T(n), n: 0 }; }
  function push(b, v) { if (b.n === b.a.length) { const x = new b.T(b.a.length * 2); x.set(b.a); b.a = x; } b.a[b.n++] = v; }
  function pushF(b, f) { while (b.n + f.length > b.a.length) { const x = new b.T(b.a.length * 2); x.set(b.a); b.a = x; } b.a.set(f, b.n); b.n += f.length; }

  // 1つの手(a)の枝 part = { lo, hi, pen } を、葉の一覧にする。
  // out: 葉(X 特徴・sp やめる確率・act 局面の中の手の番号・w 係数)と、局面(plan)ごとの [葉の始まり, 手の数, 定数の始まり, 重み]
  function act2Plan(G, s, a, opt, part, ver, out) {
    const D = V.featLen(G, ver), rnd = opt.rnd;
    const lopt = Object.assign({}, opt, { K: opt.leafK || opt.K, overPen: opt.leafPen !== undefined ? opt.leafPen : opt.overPen });
    const seen = new Map();          // 同じ局面は1回だけ(act2Part の置き換え表と同じ)
    const fbuf = new Float32Array(D);
    // 局面 s2 を重み wt で足す(1手読みの一番良い値 × wt)
    const addState = (s2, wt) => {
      if (s2.dead) return;
      if (Array.isArray(s2.lit)) { const cand = s2.lit; for (const c of cand) { s2.lit = c; addState(s2, wt / cand.length); } s2.lit = cand; return; }
      const key = V.stateKey(s2), k = seen.get(key);
      if (k !== undefined) { out.pw.a[k] += wt; return; }
      seen.set(key, out.pw.n);
      push(out.pl, out.sp.n); push(out.pc, out.c.n);
      // value.js の evalActs と同じ並び(最後が「やめる」)。葉は value.js の terminalOr と同じ
      const acts = GAME.legalActs(G, s2);
      for (let ai = 0; ai < acts.length; ai++) push(out.c, actPlan(G, s2, acts[ai], lopt, ai, out, fbuf, ver));
      push(out.c, GAME.stopProb(G, s2));
      push(out.pn, acts.length + 1); push(out.pw, wt);
    };
    let wsum = 0;
    if (!a.t.area) { const s2 = GAME.cloneState(s); GAME.afterAct(G, s2, a, null); addState(s2, 1); wsum = 1; }
    else if (a.tg.length === 1) {
      const j = a.tg[0], { rs, cr } = GAME.hitParams(G, s, a.t, j), outs = GAME.massOutcomes(G.cells[j], s.v[j], s.bel[j], rs, cr);
      for (let k = part.lo; k < Math.min(part.hi, outs.length); k++) {
        const o = outs[k]; wsum += o.p;
        if (GAME.overDead(G, j, o.w)) continue;
        const s2 = GAME.cloneState(s); s2.v[j] = o.w; s2.bel[j] = o.bel;
        GAME.afterAct(G, s2, a, null); addState(s2, o.p);
      }
    } else {
      const per = a.tg.map(j => { const { rs, cr } = GAME.hitParams(G, s, a.t, j); return { j, outs: GAME.massOutcomes(G.cells[j], s.v[j], s.bel[j], rs, cr) }; });
      for (let k = part.lo; k < part.hi; k++) {
        const s2 = GAME.cloneState(s);
        for (const { j, outs } of per) {
          let u = rnd(), o = outs[outs.length - 1];
          for (const y of outs) { u -= y.p; if (u <= 0) { o = y; break; } }
          s2.v[j] = o.w; s2.bel[j] = o.bel; if (GAME.overDead(G, j, o.w)) s2.dead = true;
        }
        wsum += 1;
        if (!s2.dead) { GAME.afterAct(G, s2, a, null); addState(s2, 1); }
      }
    }
    let pen = 0;
    if (part.pen && opt.overPen && a.t.area) {
      let ok = 1;
      for (const j of a.tg) { const { rs, cr } = GAME.hitParams(G, s, a.t, j); let o2 = 0; for (const o of GAME.massOutcomes(G.cells[j], s.v[j], s.bel[j], rs, cr)) if (o.w > G.cells[j][1]) o2 += o.p; ok *= 1 - o2; }
      pen = opt.overPen * (1 - ok);
    }
    return { wsum, pen };
  }
  // value.js の actValue と同じ(葉は terminalOr: 死んでいれば0、打てる手が無ければやめる確率、ほかはネット)。返すのは定数の部分
  function actPlan(G, s, a, opt, ai, out, fbuf, ver) {
    const K = opt.K || 12, rnd = opt.rnd;
    const leaf = (s2, w) => {
      if (s2.dead) return 0;
      if (!GAME.hasLegal(G, s2)) return w * GAME.stopProb(G, s2);
      V.features(G, s2, fbuf, ver); pushF(out.leaf, fbuf);
      push(out.sp, GAME.stopProb(G, s2)); push(out.la, ai); push(out.lw, w);
      return 0;
    };
    const after = (s2, w) => {
      if (Array.isArray(s2.lit)) { const cand = s2.lit; let c = 0; for (const x of cand) { s2.lit = x; c += leaf(s2, w / cand.length); } s2.lit = null; return c; }
      return leaf(s2, w);
    };
    if (!a.t.area) { const s2 = GAME.cloneState(s); GAME.afterAct(G, s2, a, null); return after(s2, 1); }
    const per = a.tg.map(j => { const { rs, cr } = GAME.hitParams(G, s, a.t, j); return { j, outs: GAME.massOutcomes(G.cells[j], s.v[j], s.bel[j], rs, cr) }; });
    let pen = 0;
    if (opt.overPen) { let ok = 1; for (const { j, outs } of per) { let o2 = 0; for (const o of outs) if (o.w > G.cells[j][1]) o2 += o.p; ok *= 1 - o2; } pen = opt.overPen * (1 - ok); }
    let c = 0;
    if (per.length === 1) {
      for (const o of per[0].outs) {
        const s2 = GAME.cloneState(s); s2.v[per[0].j] = o.w; s2.bel[per[0].j] = o.bel;
        if (GAME.overDead(G, per[0].j, o.w)) s2.dead = true;
        if (!s2.dead) { GAME.afterAct(G, s2, a, null); c += after(s2, o.p); }
      }
      return c - pen;
    }
    for (let k = 0; k < K; k++) {
      const s2 = GAME.cloneState(s);
      for (const { j, outs } of per) {
        let u = rnd(), o = outs[outs.length - 1];
        for (const x of outs) { u -= x.p; if (u <= 0) { o = x; break; } }
        s2.v[j] = o.w; s2.bel[j] = o.bel; if (GAME.overDead(G, j, o.w)) s2.dead = true;
      }
      if (!s2.dead) { GAME.afterAct(G, s2, a, null); c += after(s2, 1 / K); }
    }
    return c - pen;
  }
  function newOut(D) {
    return { D, leaf: Buf(Float32Array, 4096 * D), sp: Buf(Float32Array, 4096), la: Buf(Int32Array, 4096), lw: Buf(Float64Array, 4096),
      c: Buf(Float64Array, 1024), pl: Buf(Int32Array, 256), pc: Buf(Int32Array, 256), pn: Buf(Int32Array, 256), pw: Buf(Float64Array, 256) };
  }
  // 送るために切りそろえる
  function packOut(o) { const t = b => b.a.slice(0, b.n); return { D: o.D, X: t(o.leaf), sp: t(o.sp), la: t(o.la), lw: t(o.lw), c: t(o.c), pl: t(o.pl), pc: t(o.pc), pn: t(o.pn), pw: t(o.pw) }; }
  // 組み立て: z は葉ごとのネットの出力(シグモイドの前)。返すのは Σ 重み × 局面の一番良い値
  function resolvePack(P, z, z0) {
    let sum = 0;
    const np = P.pw.length, nl = P.sp.length;
    for (let p = 0; p < np; p++) {
      const l0 = P.pl[p], l1 = p + 1 < np ? P.pl[p + 1] : nl, c0 = P.pc[p], na = P.pn[p];
      const q = P.c.slice(c0, c0 + na);
      for (let i = l0; i < l1; i++) { const v = 1 / (1 + Math.exp(-z[z0 + i])), sp = P.sp[i]; q[P.la[i]] += P.lw[i] * (sp > v ? sp : v); }
      let m = 0; for (let k = 0; k < na; k++) if (q[k] > m) m = q[k];
      sum += P.pw[p] * m;
    }
    return sum;
  }
  const LP = { act2Plan, newOut, packOut, resolvePack };
  if (isNode) module.exports = LP; else root.KajiLeafPlan = LP;
})(typeof self !== 'undefined' ? self : globalThis);
