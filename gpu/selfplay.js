// GPU 学習室: 自己対戦の中身。Node でも Worker でも動く(GAME・V は先に読み込んでおく)。
// 1手読み(value.js の evalActs)を「葉の局面の一覧 + 係数」に分ける。葉の見積もりは外(GPU)でまとめて計算し、
// 戻ってきたら 手の値 = 定数 + Σ 係数 × max(やめる確率, sigmoid(ネットの出力)) で組み立てる。
// 中身は value.js の actValue・terminalOr と同じ(足す順番だけ違うので、答えは 1e-6 ほどずれる)。
(function (root) {
  'use strict';
  const isNode = typeof module !== 'undefined' && module.exports;
  const GAME = isNode ? require('../src/game.js') : root.KajiGame;
  const V = isNode ? require('../src/value.js') : root.KajiValue;

  // train/scripted.js の seeded と同じ数の並び。状態 f.s を外から読み書きできる
  function rng(seed) {
    const f = function () {
      let a = f.s | 0; a = a + 0x6D2B79F5 | 0; f.s = a;
      let t = Math.imul(a ^ a >>> 15, 1 | a);
      t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
    f.s = seed;
    return f;
  }

  // 葉の入れ物(1局ぶん。手を選ぶたびに空にする)
  function makeLeaves(D) {
    const L = { D, cap: 1024, n: 0 };
    L.X = new Float32Array(L.cap * D); L.sp = new Float32Array(L.cap); L.act = new Int32Array(L.cap); L.w = new Float64Array(L.cap);
    return L;
  }
  function grow(L) {
    const cap = L.cap * 2, X = new Float32Array(cap * L.D), sp = new Float32Array(cap), act = new Int32Array(cap), w = new Float64Array(cap);
    X.set(L.X); sp.set(L.sp); act.set(L.act); w.set(L.w);
    Object.assign(L, { cap, X, sp, act, w });
  }
  function leafTerm(G, s2, w, L, ai, ver) {
    if (s2.dead) return 0;
    if (!GAME.hasLegal(G, s2)) return w * GAME.stopProb(G, s2);
    if (L.n === L.cap) grow(L);
    const i = L.n++;
    V.features(G, s2, L.X.subarray(i * L.D, i * L.D + L.D), ver);
    L.sp[i] = GAME.stopProb(G, s2); L.act[i] = ai; L.w[i] = w;
    return 0;
  }
  function afterTerm(G, s2, w, L, ai, ver) {
    if (Array.isArray(s2.lit)) {
      const cand = s2.lit; let c = 0;
      for (const x of cand) { s2.lit = x; c += leafTerm(G, s2, w / cand.length, L, ai, ver); }
      s2.lit = null;
      return c;
    }
    return leafTerm(G, s2, w, L, ai, ver);
  }
  // value.js の actValue と同じ。返すのは定数の部分(葉は L に足す)
  function actPlan(G, s, a, opt, L, ai, ver) {
    const K = opt.K || 12, rnd = opt.rnd;
    if (!a.t.area) {
      const s2 = GAME.cloneState(s);
      GAME.afterAct(G, s2, a, null);
      return afterTerm(G, s2, 1, L, ai, ver);
    }
    const per = a.tg.map(j => {
      const { rs, cr } = GAME.hitParams(G, s, a.t, j);
      return { j, outs: GAME.massOutcomes(G.cells[j], s.v[j], s.bel[j], rs, cr) };
    });
    let pen = 0;
    if (opt.overPen) {
      let ok = 1;
      for (const { j, outs } of per) { let o2 = 0; for (const o of outs) if (o.w > G.cells[j][1]) o2 += o.p; ok *= 1 - o2; }
      pen = opt.overPen * (1 - ok);
    }
    let c = 0;
    if (per.length === 1) {
      for (const o of per[0].outs) {
        const s2 = GAME.cloneState(s);
        s2.v[per[0].j] = o.w; s2.bel[per[0].j] = o.bel;
        if (GAME.overDead(G, per[0].j, o.w)) s2.dead = true;
        if (!s2.dead) { GAME.afterAct(G, s2, a, null); c += afterTerm(G, s2, o.p, L, ai, ver); }
      }
      return c - pen;
    }
    for (let k = 0; k < K; k++) {
      const s2 = GAME.cloneState(s);
      for (const { j, outs } of per) {
        let u = rnd(), o = outs[outs.length - 1];
        for (const x of outs) { u -= x.p; if (u <= 0) { o = x; break; } }
        s2.v[j] = o.w; s2.bel[j] = o.bel;
        if (GAME.overDead(G, j, o.w)) s2.dead = true;
      }
      if (!s2.dead) { GAME.afterAct(G, s2, a, null); c += afterTerm(G, s2, 1 / K, L, ai, ver); }
    }
    return c - pen;
  }
  // value.js の evalActs と同じ並び(最後が「やめる」)
  function planActs(G, s, opt, L, ver) {
    L.n = 0;
    const acts = [], c = [];
    for (const a of GAME.legalActs(G, s)) { c.push(actPlan(G, s, a, opt, L, acts.length, ver)); acts.push(a); }
    acts.push(null); c.push(GAME.stopProb(G, s));
    return { acts, c };
  }
  // z: 葉ごとのネットの出力(シグモイドの前)
  function resolve(P, L, z) {
    const q = P.c.slice();
    for (let i = 0; i < L.n; i++) {
      const v = 1 / (1 + Math.exp(-z[i])), sp = L.sp[i];
      q[L.act[i]] += L.w[i] * (sp > v ? sp : v);
    }
    return P.acts.map((a, i) => ({ a, q: q[i] }));
  }
  // 1手読みの値の一覧。葉があれば L を yield して z を受け取る
  function* evalActsG(G, s, opt, L, ver) {
    const P = planActs(G, s, opt, L, ver);
    const z = L.n ? yield L : null;
    return resolve(P, L, z);
  }
  const randIdeal = (G, r) => G.cells.map(z => z ? z[0] + Math.floor(r() * (z[1] - z[0] + 1)) : null);

  // 学習の自己対戦(train.js / lab/trainer.js の playGame と同じ)。out.f / out.y に (特徴, 目標) を足す
  function* trainGame(G, r, eps, lam, ver, out) {
    const L = makeLeaves(V.featLen(G, ver));
    const s = GAME.newState(G), ideal = randIdeal(G, r);
    const opt = { K: 12, rnd: r }, traj = [];
    for (let step = 0; step < 80 && !s.dead; step++) {
      const qs = yield* evalActsG(G, s, opt, L, ver);
      let best = qs[0]; for (const x of qs) if (x.q > best.q) best = x;
      let pick = best;
      if (eps > 0 && r() < eps) { const top = qs.slice().sort((a, b) => b.q - a.q).slice(0, 5); pick = top[Math.floor(r() * top.length)]; }
      traj.push({ f: V.features(G, s, null, ver), q: best.q, greedy: pick === best });
      if (!pick.a) break;
      GAME.play(G, s, pick.a, ideal, r);
    }
    const j = GAME.judge(G, s, ideal);
    let g = GAME.stopProb(G, s);
    for (let t = traj.length - 1; t >= 0; t--) {
      const x = traj[t], tg = x.greedy ? (1 - lam) * x.q + lam * g : x.q;
      out.f.push(x.f); out.y.push(tg); g = tg;
    }
    return j.great ? 1 : 0;
  }
  // 局面をばらまく(train.js の sampleState と同じ)
  function sampleState(G, r) {
    const s = GAME.newState(G);
    if (r() < 0.05) return s;
    s.first = false;
    const u = r();
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
  // ばらまいた局面1つ: 目標は1手読みの一番良い値(K=8)
  function* sampledPos(G, r, ver, out) {
    const L = makeLeaves(V.featLen(G, ver));
    const s = sampleState(G, r);
    const qs = yield* evalActsG(G, s, { K: 8, rnd: r }, L, ver);
    let b = 0; for (const x of qs) b = Math.max(b, x.q);
    out.f.push(V.features(G, s, null, ver)); out.y.push(b);
    return 0;
  }
  // 成績の1局(lab/trainer.js の eval と同じ: 1手読み・罰 overPen・種 seed*100003+g、読みの乱数 seed*7+g)
  function* evalGame(G, seed, g, overPen, ver) {
    const L = makeLeaves(V.featLen(G, ver));
    const r = rng(seed * 100003 + g), s = GAME.newState(G), ideal = randIdeal(G, r);
    const opt = { K: 12, overPen, rnd: rng(seed * 7 + g) };
    for (let k = 0; k < 80 && !s.dead; k++) {
      const qs = yield* evalActsG(G, s, opt, L, ver);
      let b = qs[0]; for (const x of qs) if (x.q > b.q) b = x;
      if (!b.a) break;
      GAME.play(G, s, b.a, ideal, r);
    }
    const j = GAME.judge(G, s, ideal);
    return { great: j.great ? 1 : 0, over: j.over ? 1 : 0, reached: j.reached ? 1 : 0 };
  }

  // たくさんの生成器を同時に進める。葉はまとめて evalBatch(X, n) → Promise<z> に渡す
  // make(k) は k 番目の生成器を作る(total 個)。conc 個ずつ同時に回す
  async function runMany(total, conc, make, evalBatch, D) {
    const results = new Array(total);
    let next = 0;
    const live = [];
    const start = k => { const g = make(k); live.push({ k, g, r: g.next() }); };
    while (next < total && live.length < conc) start(next++);
    while (live.length) {
      // 終わった物を片づけて、次を足す
      for (let i = live.length - 1; i >= 0; i--) {
        if (live[i].r.done) { results[live[i].k] = live[i].r.value; live.splice(i, 1); if (next < total) start(next++); }
      }
      // (足した物がすぐ終わる場合のため、もう一度)
      if (live.some(x => x.r.done)) continue;
      if (!live.length) break;
      let n = 0; for (const x of live) n += x.r.value.n;
      const X = new Float32Array(n * D); let o = 0;
      for (const x of live) { const L = x.r.value; X.set(L.X.subarray(0, L.n * D), o * D); x.o = o; o += L.n; }
      const z = await evalBatch(X, n);
      for (const x of live) { const L = x.r.value; x.r = x.g.next(z.subarray(x.o, x.o + L.n)); }
    }
    return results;
  }

  const SP = { rng, makeLeaves, planActs, resolve, evalActsG, trainGame, sampledPos, sampleState, evalGame, runMany };
  if (isNode) module.exports = SP; else root.KajiSP = SP;
})(typeof self !== 'undefined' ? self : globalThis);
