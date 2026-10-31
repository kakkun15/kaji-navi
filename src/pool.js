// 鍛冶ナビ 並列の読み(PC 向けの「最強」)。
// PC のスレッドの数だけ Worker を立て、打てる手を手分けして読む。
//   1段目: 打てる手を全部、1手読みで採点(手分け)
//   2段目: 上位 N2 手を、打った後の局面ごとにもう一度1手読みして(2手読み)採点し直す(1手ずつ手分け)
// Worker の中身は、ページに埋め込んだ core.js・game.js・value.js(build.py が data-src を付けて埋め込む)とこのファイルの下半分。
(function (root) {
  'use strict';
  const isWorker = typeof WorkerGlobalScope !== 'undefined' && self instanceof WorkerGlobalScope;

  function seeded(a) { return function () { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
  function toNet(j, featLen, G) {
    const n = { sizes: j.sizes, L: j.L.map(l => ({ n: l.n, m: l.m, W: Float32Array.from(l.W), b: Float32Array.from(l.b) })) };
    n.ver = j.sizes[0] === featLen(G, 1) ? 1 : j.sizes[0] === featLen(G, 3) ? 3 : 2;
    return n;
  }

  // ---------------- Worker の側 ----------------
  if (isWorker) {
    const GAME = self.KajiGame, V = self.KajiValue;
    const nets = {}, Gs = {};
    self.onmessage = (e) => {
      const m = e.data;
      if (m.type === 'net') { nets[m.key] = { j: m.net, n: null }; return; }
      if (m.type === 'job') {
        const gk = JSON.stringify(m.cfg);
        const G = Gs[gk] || (Gs[gk] = GAME.setup(m.cfg));
        const N = nets[m.cfg.item]; if (!N.n) N.n = toNet(N.j, V.featLen, G);
        const acts = GAME.legalActs(G, m.s), out = [];
        const opt = Object.assign({}, m.opt, { rnd: seeded(m.opt.seed + 7919 * (m.idx[0] + 1)), buf: new Float32Array(V.featLen(G, N.n.ver)) });
        for (const i of m.idx) {
          const a = acts[i];
          out.push([i, m.phase === 1 ? V.actValue(N.n, G, m.s, a, opt) : V.act2Value(N.n, G, m.s, a, opt)]);
        }
        self.postMessage({ id: m.id, out });
        return;
      }
      if (m.type === 'part') {          // 最強の2段目の一部(1つの手の、枝の一部)
        const gk = JSON.stringify(m.cfg);
        const G = Gs[gk] || (Gs[gk] = GAME.setup(m.cfg));
        const N = nets[m.cfg.item]; if (!N.n) N.n = toNet(N.j, V.featLen, G);
        const acts = GAME.legalActs(G, m.s), out = [];
        for (const t of m.tasks) {
          const opt = Object.assign({}, m.opt, { rnd: seeded(m.opt.seed + 7919 * (t.i + 1) + 104729 * t.lo), buf: new Float32Array(V.featLen(G, N.n.ver)) });
          out.push([t.k, V.act2Part(N.n, G, m.s, acts[t.i], opt, t)]);
        }
        self.postMessage({ id: m.id, out });
        return;
      }
      if (m.type === 'game') {          // 性能テスト: 1局まるごと打つ(bench.html)
        const G = GAME.setup(m.cfg);
        const N = nets[m.cfg.item]; if (N && !N.n) N.n = toNet(N.j, V.featLen, G);
        const res = playGame(GAME, V, N ? N.n : null, G, m);
        self.postMessage({ id: m.id, res });
      }
    };
    // 性能テストの1局。種が同じなら、理想値・伸び・会心の乱数は打ち方によらず同じ並びになる(打った回数が同じ間は)
    function playGame(GAME, V, net, G, m) {
      const r = seeded(m.seed * 100003 + m.g), rc = seeded(m.seed * 31 + m.g);
      const s = GAME.newState(G), ideal = G.cells.map(z => z ? z[0] + Math.floor(r() * (z[1] - z[0] + 1)) : null);
      const sp = m.search, opt = Object.assign({}, sp, { rnd: seeded(m.seed * 7 + m.g), buf: net ? new Float32Array(V.featLen(G, net.ver)) : null });
      let charged = false, moves = 0; const t0 = Date.now();
      if (m.hs === 'start') { s.hs = 1; charged = true; }
      for (let k = 0; k < 80 && !s.dead; k++) {
        let best;
        if (sp.rule) best = { a: self.KajiRule0.policy(G, s) };          // 許容誤差0の商材の仮の打ち方(rule0.js)
        else if (s.hs) best = V.evalActsHS(net, G, s, opt)[0];
        else if (sp.depth === 3) { const qs = V.evalActs3(net, G, s, opt); best = qs.reduce((a, b) => b.q2 > a.q2 ? b : a); }
        else if (sp.depth === 2) { const qs = V.evalActs2(net, G, s, opt); best = qs.reduce((a, b) => b.q2 > a.q2 ? b : a); }
        else { const qs = V.evalActs(net, G, s, opt); best = qs.reduce((a, b) => b.q > a.q ? b : a); }
        if (!best.a) break;
        GAME.play(G, s, best.a, ideal, r); moves++;
        if (Array.isArray(s.lit)) s.lit = s.lit[Math.floor(r() * s.lit.length)];
        const u = rc();
        if (m.hs === 'mid' && !charged && best.a.t.area && u < 0.1) { s.hs = 1; charged = true; }
      }
      const j = GAME.judge(G, s, ideal);
      return { great: j.great ? 1 : 0, over: j.over ? 1 : 0, under: !j.reached && !j.over ? 1 : 0, F: s.F, moves, ms: Date.now() - t0 };
    }
    return;
  }

  // ---------------- ページの側 ----------------
  const GAME = root.KajiGame, V = root.KajiValue;
  function workerSource() {
    const get = n => { const el = document.querySelector(`script[data-src="${n}"]`); return el ? el.textContent : null; };
    const parts = ['core.js', 'game.js', 'value.js', 'pool.js'].map(get);
    const r0 = get('rule0.js');                         // 無いページ(古い build)でも動くように、これだけは任意
    return parts.every(x => x) ? parts.concat(r0 ? [r0] : []).join('\n;\n') : null;
  }
  const Pool = {
    workers: [], ready: false, size: 0, sentNet: {}, seq: 0, wait: new Map(), queue: [], idle: [],
    // n: 立てる Worker の数(既定: スレッド数 − 2、最大 24)
    start(n) {
      if (this.ready) return true;
      const src = workerSource(); if (!src || typeof Worker === 'undefined') return false;
      const url = URL.createObjectURL(new Blob([src], { type: 'text/javascript' }));
      n = n || Math.max(1, Math.min(24, (navigator.hardwareConcurrency || 4) - 2));
      for (let i = 0; i < n; i++) {
        const w = new Worker(url);
        w.onmessage = (e) => { const cb = this.wait.get(e.data.id); this.wait.delete(e.data.id); this.idle.push(w); this.pump(); if (cb) cb(e.data); };
        w.onerror = (e) => { console.error('pool worker', e.message); };
        this.workers.push(w); this.idle.push(w);
      }
      this.size = n; this.ready = true; return true;
    },
    stop() { for (const w of this.workers) w.terminate(); this.workers = []; this.idle = []; this.ready = false; this.sentNet = {}; this.wait.clear(); this.queue = []; },
    setNet(key, j) { if (this.sentNet[key] === j) return; for (const w of this.workers) w.postMessage({ type: 'net', key, net: j }); this.sentNet[key] = j; },
    run(msg) { return new Promise(res => { msg.id = ++this.seq; this.wait.set(msg.id, res); this.queue.push(msg); this.pump(); }); },
    pump() { while (this.idle.length && this.queue.length) { const w = this.idle.pop(), m = this.queue.shift(); w.postMessage(m); } },
    // 待っている仕事を取り消す。keep を渡すと、その札(tag)の仕事は残す(先に計算している局面のうち、本当に要る物だけ続ける)
    cancelQueued(keep) {
      const rest = [];
      for (const m of this.queue) { if (keep !== undefined && m.tag === keep) { rest.push(m); continue; } const cb = this.wait.get(m.id); this.wait.delete(m.id); if (cb) cb({ id: m.id, out: [], cancelled: true }); }
      this.queue = rest;
    },
    // 最強の読み。返り値は evalActs2 と同じ形 [{ a, q, q2 }](やめるも入る)
    async evalMax(cfg, s, opt) {
      const G = GAME.setup(cfg), acts = GAME.legalActs(G, s);
      const sc = { cfg, s: JSON.parse(JSON.stringify(s)), tag: opt.tag };
      let cancelled = false;
      const chk = r => { if (r.cancelled) cancelled = true; return r; };
      // 1段目: 手を Worker の数の数倍に割って配る
      const chunks = [], per = Math.max(1, Math.ceil(acts.length / (this.size * 3)));
      for (let i = 0; i < acts.length; i += per) chunks.push([...Array(Math.min(per, acts.length - i)).keys()].map(k => i + k));
      const q = new Array(acts.length).fill(0);
      await Promise.all(chunks.map(idx => this.run(Object.assign({ type: 'job', phase: 1, idx, opt: { K: opt.K, overPen: opt.overPen, seed: opt.seed } }, sc))
        .then(chk).then(r => { for (const [i, v] of r.out) q[i] = v; })));
      if (cancelled) return null;
      const res = acts.map((a, i) => ({ a, q: q[i] }));
      res.push({ a: null, q: GAME.stopProb(G, s), q2: GAME.stopProb(G, s) });
      // 2段目: 上位 N2 手を1手ずつ配る
      const srt = res.filter(x => x.a).sort((x, y) => y.q - x.q);
      const cut = opt.margin && srt.length ? srt[0].q - opt.margin : -Infinity;   // 1位から margin より下は2手読みしない
      const top = srt.slice(0, opt.N2).filter(x => x.q >= cut);
      const o2 = { K: opt.Ki || 8, K2: opt.K2, overPen: opt.overPen, leafPen: opt.leafPen, seed: opt.seed };
      if (opt.split === false) {     // 前の配り方: 1つの手を1つの Worker に
        await Promise.all(top.map(x => this.run(Object.assign({ type: 'job', phase: 2, idx: [acts.indexOf(x.a)], opt: o2 }, sc))
          .then(chk).then(r => { for (const [, v] of r.out) x.q2 = v; })));
      } else {
        // 手を枝(結果・引く回数)ごとに細かく割って、Worker 全部に配る(1つの手が終わるのを待たずに済む)
        const tasks = [];
        top.forEach((x, k) => {
          const i = acts.indexOf(x.a), nb = V.act2Parts(G, s, x.a, o2), c = Math.max(1, Math.ceil(nb / Math.max(1, Math.round(this.size * (opt.splitMul || 6) / top.length))));
          for (let lo = 0; lo < nb; lo += c) tasks.push({ k, i, lo, hi: Math.min(nb, lo + c), pen: lo === 0 });
        });
        const acc = top.map(() => ({ sum: 0, wsum: 0, pen: 0 }));
        await Promise.all(tasks.map(t => this.run(Object.assign({ type: 'part', tasks: [t], opt: o2 }, sc))
          .then(chk).then(r => { for (const [k, v] of r.out) { acc[k].sum += v.sum; acc[k].wsum += v.wsum; acc[k].pen += v.pen; } })));
        top.forEach((x, k) => { const A = acc[k]; x.q2 = (A.wsum > 0 ? A.sum / A.wsum : 0) - A.pen; });
      }
      if (cancelled) return null;       // 取り消された(先に計算していた局面が要らなくなった)
      for (const x of res) if (x.q2 === undefined) x.q2 = -1;
      return res;
    },
    // 性能テストの1局
    game(m) { return this.run(Object.assign({ type: 'game' }, m)).then(r => r.res); },
  };
  root.KajiPool = Pool;
})(typeof self !== 'undefined' ? self : globalThis);
