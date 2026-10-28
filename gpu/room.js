// GPU 学習室: 鍛冶ナビの公開ページ(dist/app.html)の中で動かす。画面をこの学習室に置き換える。
// 前に window.KajiGPU(gpunet.js)と window.__kspSrc(selfplay.js の中身)を用意しておく。
// 自己対戦は Worker(CPU の全スレッド − 1)、葉の見積もりと学習は GPU、学習に使う局面は RAM にためる。
// 使い方: await KajiRoom.start({ 設定 })。止める: KajiRoom.stop()。中身: KajiRoom.S
(function () {
  'use strict';
  const V = window.KajiValue, GAME = window.KajiGame, GPU = window.KajiGPU;
  const RAW = 'https://raw.githubusercontent.com/kakkun15/kaji-navi/main/';
  const DEF = {
    item: 'hidane', level: 80, focus: 253,
    sizes: [111, 256, 256, 256, 1],   // 学ぶネット
    teacher: 'train/w_hidane_h128_best.json',
    warm: 3,              // 最初の何回は今の重み(先生)で自己対戦して、その目標を学ぶ
    iters: 1000,          // 回数(止めるまで)
    games: 4000, sampled: 30000, eps: 0.1, lam: 0.7,
    conc: 32,             // Worker ごとに同時に進める局
    batch: 1024, lr: 1e-3, lrMin: 2e-4, replay: 9,   // 1つの局面を平均何回学ぶか
    cap: 3000000,         // RAM にためる局面の数(111×4バイト = 444B/局面)
    window: 1200000,      // 学ぶ時に使う新しい方の局面の数
    evalEvery: 2, evalGames: 2000, evalSeed: 990, overPen: 0.6,
  };
  const S = { cfg: null, run: false, it: 0, hist: [], log: [], t0: 0, leaves: 0, gpuBusy: 0, base: null, best: -1 };
  const log = s => { const l = new Date().toLocaleTimeString() + ' ' + s; S.log.push(l); if (S.log.length > 400) S.log.shift(); UI.log(l); };

  // ---- 保存(IndexedDB) ----
  const DB = {
    open() { return this.p || (this.p = new Promise((res, rej) => { const q = indexedDB.open('kajiGPU', 1); q.onupgradeneeded = () => q.result.createObjectStore('kv'); q.onsuccess = () => res(q.result); q.onerror = () => rej(q.error); })); },
    async put(k, v) { const d = await this.open(); return new Promise((res, rej) => { const t = d.transaction('kv', 'readwrite'); t.objectStore('kv').put(v, k); t.oncomplete = res; t.onerror = () => rej(t.error); }); },
    async get(k) { const d = await this.open(); return new Promise((res, rej) => { const q = d.transaction('kv').objectStore('kv').get(k); q.onsuccess = () => res(q.result); q.onerror = () => rej(q.error); }); },
  };
  const pack = net => ({ sizes: net.sizes, L: net.L.map(l => ({ n: l.n, m: l.m, W: Array.from(l.W, x => +x.toPrecision(6)), b: Array.from(l.b, x => +x.toPrecision(6)) })) });

  // ---- RAM の局面置き場(輪) ----
  function Replay(cap, D) {
    const CH = 250000, chunks = [], ys = [];
    let n = 0, head = 0;   // n: 入っている数、head: 次に書く所
    for (let c = 0; c < Math.ceil(cap / CH); c++) { chunks.push(new Float32Array(CH * D)); ys.push(new Float32Array(CH)); }
    return {
      get n() { return n; }, get bytes() { return chunks.length * CH * (D + 1) * 4; },
      push(X, Y) {
        for (let i = 0; i < Y.length; i++) {
          const c = Math.floor(head / CH), o = head % CH;
          chunks[c].set(X.subarray(i * D, i * D + D), o * D); ys[c][o] = Y[i];
          head = (head + 1) % cap; if (n < cap) n++;
        }
      },
      // 新しい方 win 個から bs 個を選んで X・Y に入れる
      sample(bs, win, X, Y, r) {
        const w = Math.min(win, n);
        for (let q = 0; q < bs; q++) {
          const back = 1 + Math.floor(r() * w), p = (head - back + cap) % cap, c = Math.floor(p / CH), o = p % CH;
          X.set(chunks[c].subarray(o * D, o * D + D), q * D); Y[q] = ys[c][o];
        }
      },
    };
  }

  // ---- Worker ----
  const WK = String.raw`
const GAME = self.KajiGame, V = self.KajiValue, SP = self.KajiSP;
let G = null, D = 0, rid = 0; const pend = new Map();
const evalBatch = (X, n) => new Promise(res => { const id = ++rid; pend.set(id, res); self.postMessage({ t: 'req', id, X, n }, [X.buffer]); });
self.onmessage = async e => {
  const m = e.data;
  if (m.t === 'z') { const f = pend.get(m.id); pend.delete(m.id); f(m.z); return; }
  if (m.t === 'init') { G = GAME.setup(m.cfg); D = V.featLen(G, 2); return; }
  if (m.t === 'gen') {
    const r = SP.rng(m.seed), out = { f: [], y: [] }, total = m.games + m.sampled;
    const res = await SP.runMany(total, m.conc, k => k < m.games ? SP.trainGame(G, r, m.eps, m.lam, 2, out) : SP.sampledPos(G, r, 2, out), evalBatch, D);
    let great = 0; for (let k = 0; k < m.games; k++) great += res[k];
    const X = new Float32Array(out.y.length * D); out.f.forEach((f, i) => X.set(f, i * D));
    const Y = Float32Array.from(out.y);
    self.postMessage({ t: 'done', jid: m.jid, X, Y, great, games: m.games }, [X.buffer, Y.buffer]);
    return;
  }
  if (m.t === 'eval') {
    const res = await SP.runMany(m.n, m.conc, k => SP.evalGame(G, m.seed, m.g0 + k, m.overPen, 2), evalBatch, D);
    self.postMessage({ t: 'done', jid: m.jid, res });
  }
};`;
  let workers = [], jobs = new Map(), jseq = 0, Q = [], busy = false, genNet = null;
  function makeWorkers(cfg) {
    const get = n => document.querySelector('script[data-src="' + n + '"]').textContent;
    const lib = ['core.js', 'game.js', 'value.js'].map(get).join('\n;\n') + '\n;\n' + window.__kspSrc + '\n;\n' + WK;
    const url = URL.createObjectURL(new Blob([lib], { type: 'text/javascript' }));
    const NW = Math.max(1, (navigator.hardwareConcurrency || 4) - 1);
    for (let i = 0; i < NW; i++) {
      const w = new Worker(url);
      w.onmessage = e => {
        const m = e.data;
        if (m.t === 'req') { Q.push({ w, id: m.id, X: m.X, n: m.n }); pump(); }
        else if (m.t === 'done') { const f = jobs.get(m.jid); jobs.delete(m.jid); f(m); }
      };
      w.onerror = e => log('Worker のエラー: ' + e.message);
      w.postMessage({ t: 'init', cfg: { item: cfg.item, level: cfg.level, hammer: 'hikari', star: 3, focus: cfg.focus } });
      workers.push(w);
    }
  }
  // 葉の見積もりを GPU でまとめて
  async function pump() {
    if (busy || !Q.length) return;
    busy = true;
    const t0 = performance.now();
    while (Q.length) {
      const take = []; let n = 0;
      while (Q.length && (n + Q[0].n <= genNet.cap || !take.length)) { const q = Q.shift(); take.push(q); n += q.n; }
      if (n > genNet.cap) {      // 1つが大きすぎる時
        const q = take[0], z = await genNet.infer(q.X, q.n); q.w.postMessage({ t: 'z', id: q.id, z }, [z.buffer]);
      } else {
        const z = await genNet.inferRaw(take.map(q => q.X), n);
        let o = 0;
        for (const q of take) { const zz = z.slice(o, o + q.n); o += q.n; q.w.postMessage({ t: 'z', id: q.id, z: zz }, [zz.buffer]); }
      }
      S.leaves += n;
    }
    S.gpuBusy += performance.now() - t0;
    busy = false;
  }
  const job = (w, m) => new Promise(res => { m.jid = ++jseq; jobs.set(m.jid, res); w.postMessage(m); });
  async function gen(cfg, seed) {
    const NW = workers.length, rs = await Promise.all(workers.map((w, i) => job(w, {
      t: 'gen', seed: seed * 1009 + i, games: Math.ceil(cfg.games / NW), sampled: Math.ceil(cfg.sampled / NW), eps: cfg.eps, lam: cfg.lam, conc: cfg.conc })));
    let great = 0, games = 0; for (const r of rs) { great += r.great; games += r.games; }
    return { rs, selfplay: great / games };
  }
  async function evalGames(cfg, n, seed) {
    const NW = workers.length, per = Math.ceil(n / NW), ps = [];
    for (let i = 0; i < NW; i++) { const g0 = i * per, k = Math.min(per, n - g0); if (k > 0) ps.push(job(workers[i], { t: 'eval', seed, g0, n: k, overPen: cfg.overPen, conc: cfg.conc })); }
    const res = [].concat(...(await Promise.all(ps)).map(r => r.res));
    return { res, great: res.reduce((a, b) => a + b.great, 0) / res.length };
  }

  // ---- 温度×集中力の見込みの地図 ----
  const HM = { temps: [], Fs: [] };
  for (let t = 2000; t >= 50; t -= 50) HM.temps.push(t);
  for (let F = 252; F >= 0; F -= 6) HM.Fs.push(F);
  function heatInput(G) {
    const D = V.featLen(G, 2), X = new Float32Array(HM.temps.length * HM.Fs.length * D), sp = [];
    let k = 0;
    for (const F of HM.Fs) for (const t of HM.temps) {
      const s = GAME.newState(G); s.first = false;
      for (const i of G.active) s.v[i] = Math.max(0, G.cells[i][0] - 18);   // どのマスもゾーンの少し手前
      s.temp = t; s.F = F;
      V.features(G, s, X.subarray(k * D, k * D + D), 2); sp.push(GAME.stopProb(G, s)); k++;
    }
    return { X, n: k, sp };
  }
  async function heat(net, H) { const z = await net.infer(H.X, H.n); return Array.from(z, (x, i) => Math.max(H.sp[i], 1 / (1 + Math.exp(-x)))); }

  // ---- 画面 ----
  const UI = {
    init() {
      document.title = '鍛冶ナビ GPU 学習室';
      const css = `
:root{--bg:#0e1116;--panel:#161b23;--line:#283041;--fg:#e9edf4;--sub:#8e9ab0;--a:#ff8a3d;--b:#5cc8ff;--ok:#6be38a;--mono:ui-monospace,"Cascadia Mono",Consolas,monospace}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--fg);font-family:system-ui,"Yu Gothic UI","Hiragino Sans",sans-serif}
.wrap{max-width:1180px;margin:0 auto;padding:18px 16px 40px}
h1{font-size:18px;margin:0 0 4px;letter-spacing:.04em}h1 b{color:var(--a)}
.st{color:var(--sub);font-size:13px;margin-bottom:14px;font-family:var(--mono)}
.tiles{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:10px;margin-bottom:12px}
.t{background:var(--panel);border:1px solid var(--line);border-radius:10px;padding:10px 12px}
.t .k{font-size:11px;color:var(--sub)}.t .v{font-size:22px;font-weight:700;font-family:var(--mono);margin-top:2px}
.t .bar{height:5px;background:#222a36;border-radius:3px;margin-top:6px;overflow:hidden}.t .bar i{display:block;height:100%;background:var(--a);width:0;transition:width .6s}
.grid{display:grid;grid-template-columns:1.3fr 1fr;gap:12px}@media(max-width:860px){.grid{grid-template-columns:1fr}}
.p{background:var(--panel);border:1px solid var(--line);border-radius:10px;padding:12px}
.p h2{font-size:13px;margin:0 0 8px;color:var(--sub);font-weight:600}
canvas{width:100%;display:block}
.hm{display:grid;grid-template-columns:1fr 1fr;gap:8px}.hm div{font-size:11px;color:var(--sub);text-align:center}
.lg{font-family:var(--mono);font-size:11.5px;color:#b9c3d6;height:190px;overflow:auto;white-space:pre-wrap;line-height:1.5}
.key{display:flex;gap:14px;font-size:11.5px;color:var(--sub);margin-top:4px}.key i{display:inline-block;width:10px;height:3px;border-radius:2px;vertical-align:middle;margin-right:5px}
button{background:#232b38;color:var(--fg);border:1px solid var(--line);border-radius:8px;padding:6px 12px;font:inherit;font-size:12px;cursor:pointer}`;
      document.head.insertAdjacentHTML('beforeend', '<style>' + css + '</style>');
      document.body.innerHTML = `<div class="wrap">
<h1>鍛冶ナビ <b>GPU 学習室</b> — 超ようせいのひだね</h1>
<div class="st" id="st">準備中…</div>
<div class="tiles">
 <div class="t"><div class="k">世代</div><div class="v" id="v-it">0</div></div>
 <div class="t"><div class="k">成績(1手読み・同じ局)</div><div class="v" id="v-ev">—</div></div>
 <div class="t"><div class="k">GPU 葉の見積もり/秒</div><div class="v" id="v-gps">—</div><div class="bar"><i id="b-gpu"></i></div></div>
 <div class="t"><div class="k">CPU Worker</div><div class="v" id="v-cpu">—</div></div>
 <div class="t"><div class="k">RAM の局面</div><div class="v" id="v-ram">—</div><div class="bar"><i id="b-ram"></i></div></div>
 <div class="t"><div class="k">経過</div><div class="v" id="v-time">0:00</div></div>
</div>
<div class="grid">
 <div class="p"><h2>大成功率の移り変わり</h2><canvas id="c1" height="230"></canvas>
  <div class="key"><span><i style="background:var(--a)"></i>学習中のネット(成績)</span><span><i style="background:var(--b)"></i>今の重み(同じ局)</span><span><i style="background:#8e9ab0"></i>自己対戦</span></div></div>
 <div class="p"><h2>温度 × 集中力 の見込み(全マスがゾーンの少し手前の局面)</h2>
  <div class="hm"><div><canvas id="h0" width="40" height="43" style="image-rendering:pixelated;height:180px"></canvas>今の重み</div><div><canvas id="h1" width="40" height="43" style="image-rendering:pixelated;height:180px"></canvas>学習中</div></div>
  <div class="key"><span>横: 温度 2000 → 50℃</span><span>縦: 集中力 252 → 0</span><span>色: 見込み 0% <span style="display:inline-block;width:70px;height:8px;background:linear-gradient(90deg,#10131a,#3b2a8c,#c2417a,#ff9a3d,#fff3b0);vertical-align:middle"></span> 100%</span></div></div>
 <div class="p"><h2>損失(学習の誤差)</h2><canvas id="c2" height="150"></canvas></div>
 <div class="p"><h2>記録 <button id="bt-stop">止める</button> <button id="bt-dl">重みを保存</button></h2><div class="lg" id="lg"></div></div>
</div></div>`;
      document.getElementById('bt-stop').onclick = () => { S.run = false; log('止める(今の回が終わったら)'); };
      document.getElementById('bt-dl').onclick = async () => { const b = await DB.get('best') || await DB.get('latest'); if (!b) return; const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([JSON.stringify(b.net)])); a.download = 'w_hidane_gpu.json'; a.click(); };
    },
    log(l) { const e = document.getElementById('lg'); if (!e) return; e.textContent += l + '\n'; e.scrollTop = e.scrollHeight; },
    set(id, v) { const e = document.getElementById(id); if (e) e.textContent = v; },
    bar(id, f) { const e = document.getElementById(id); if (e) e.style.width = Math.max(0, Math.min(100, f * 100)) + '%'; },
    line(id, series, opt) {
      const c = document.getElementById(id); if (!c) return;
      const W = c.clientWidth * devicePixelRatio, H = c.height * devicePixelRatio; c.width = W; const g = c.getContext('2d');
      g.setTransform(1, 0, 0, 1, 0, 0); g.clearRect(0, 0, W, H);
      const pts = series.flatMap(s => s.d.filter(p => p[1] === p[1]));
      if (!pts.length) return;
      let x0 = Math.min(...pts.map(p => p[0])), x1 = Math.max(...pts.map(p => p[0])), y0 = Math.min(...pts.map(p => p[1])), y1 = Math.max(...pts.map(p => p[1]));
      if (opt && opt.pct) { y0 = Math.floor(y0 * 100 - 1) / 100; y1 = Math.ceil(y1 * 100 + 1) / 100; }
      if (x1 === x0) x1 = x0 + 1; if (y1 === y0) { y1 += 0.01; y0 -= 0.01; }
      const L = 44 * devicePixelRatio, B = 18 * devicePixelRatio, X = x => L + (x - x0) / (x1 - x0) * (W - L - 8), Y = y => (H - B) - (y - y0) / (y1 - y0) * (H - B - 8);
      g.font = (10 * devicePixelRatio) + 'px ui-monospace,monospace'; g.fillStyle = '#8e9ab0'; g.strokeStyle = '#283041'; g.lineWidth = 1;
      for (let k = 0; k <= 4; k++) { const y = y0 + (y1 - y0) * k / 4, py = Y(y); g.beginPath(); g.moveTo(L, py); g.lineTo(W, py); g.stroke(); g.fillText(opt && opt.pct ? (y * 100).toFixed(1) + '%' : y.toFixed(4), 2, py + 3); }
      g.fillText('世代 ' + x1, W - 70 * devicePixelRatio, H - 3);
      for (const s of series) {
        const d = s.d.filter(p => p[1] === p[1]); if (!d.length) continue;
        g.strokeStyle = s.c; g.lineWidth = (s.w || 2) * devicePixelRatio; g.setLineDash(s.dash ? [5 * devicePixelRatio, 4 * devicePixelRatio] : []);
        g.beginPath(); d.forEach((p, i) => i ? g.lineTo(X(p[0]), Y(p[1])) : g.moveTo(X(p[0]), Y(p[1]))); g.stroke();
        g.fillStyle = s.c; for (const p of d) { g.beginPath(); g.arc(X(p[0]), Y(p[1]), 2.4 * devicePixelRatio, 0, 7); g.fill(); }
      }
      g.setLineDash([]);
    },
    heat(id, vals) {
      const c = document.getElementById(id); if (!c || !vals) return;
      const g = c.getContext('2d'), w = HM.temps.length, h = HM.Fs.length, img = g.createImageData(w, h);
      const stops = [[0, [16, 19, 26]], [0.3, [59, 42, 140]], [0.55, [194, 65, 122]], [0.8, [255, 154, 61]], [1, [255, 243, 176]]];
      vals.forEach((v, i) => {
        let a = stops[0], b = stops[stops.length - 1];
        for (let k = 0; k + 1 < stops.length; k++) if (v >= stops[k][0] && v <= stops[k + 1][0]) { a = stops[k]; b = stops[k + 1]; break; }
        const f = (v - a[0]) / Math.max(1e-9, b[0] - a[0]);
        for (let q = 0; q < 3; q++) img.data[i * 4 + q] = a[1][q] + (b[1][q] - a[1][q]) * f;
        img.data[i * 4 + 3] = 255;
      });
      g.putImageData(img, 0, 0);
    },
    draw() {
      const h = S.hist;
      UI.line('c1', [
        { d: h.map(x => [x.it, x.ev]), c: '#ff8a3d', w: 2.5 },
        { d: h.map(x => [x.it, x.ev === x.ev ? S.base : NaN]), c: '#5cc8ff', dash: 1 },
        { d: h.map(x => [x.it, x.sp]), c: '#8e9ab0', w: 1.5 },
      ], { pct: 1 });
      UI.line('c2', [{ d: h.map(x => [x.it, x.loss]), c: '#6be38a' }]);
    },
  };
  // 時計(タブが裏でも動く: setInterval は1秒に1回まで落ちるが、表示だけなのでよい)
  function tick() {
    if (!S.t0) return;
    const sec = (performance.now() - S.t0) / 1000;
    UI.set('v-time', `${Math.floor(sec / 3600)}:${String(Math.floor(sec / 60) % 60).padStart(2, '0')}`);
    const dt = (performance.now() - (S.tl || S.t0)) / 1000;
    if (dt > 1.5) {
      UI.set('v-gps', ((S.leaves - (S.ll || 0)) / dt / 1e6).toFixed(2) + 'M');
      UI.bar('b-gpu', (S.gpuBusy - (S.gl || 0)) / (dt * 1000));
      S.ll = S.leaves; S.gl = S.gpuBusy; S.tl = performance.now();
    }
  }

  async function start(over) {
    if (S.run) return 'もう動いている';
    const cfg = S.cfg = Object.assign({}, DEF, over || {});
    UI.init();
    UI.set('st', 'GPU を準備中…');
    try { S.wake = await navigator.wakeLock.request('screen'); } catch (e) { }
    const ctx = window.__kctx || (window.__kctx = await GPU.device());
    const G = GAME.setup({ item: cfg.item, level: cfg.level, hammer: 'hikari', star: 3, focus: cfg.focus }), D = V.featLen(G, 2);
    if (cfg.sizes[0] !== D) throw new Error('入力の長さが違う ' + D);
    const tj = await fetch(RAW + cfg.teacher).then(r => r.json());
    const teacher = GPU.GNet(ctx, tj, { cap: 262144 });
    // 学ぶネット: 続きがあればそれから
    let sj = null, resume = await DB.get('latest');
    if (resume && cfg.resume !== false && JSON.stringify(resume.net.sizes) === JSON.stringify(cfg.sizes)) { sj = resume.net; S.it = resume.it; S.hist = resume.hist || []; S.base = resume.base; S.best = resume.best ?? -1; log(`続きから: 世代 ${S.it}`); }
    else { let a = cfg.seed || 12345; const r = () => { a = (a * 1103515245 + 12345) % 2147483648; return a / 2147483648; }; sj = GPU.makeNet(cfg.sizes, r); S.it = 0; S.hist = []; }
    const student = GPU.GNet(ctx, sj, { cap: 262144, batch: cfg.batch });
    if (!workers.length) makeWorkers(cfg);
    UI.set('v-cpu', workers.length + ' 本');
    const rep = S.rep || (S.rep = Replay(cfg.cap, D));
    UI.set('v-ram', '0'); log(`RAM の局面置き場 ${(rep.bytes / 1e9).toFixed(2)} GB(${cfg.cap.toLocaleString()} 局面)`);
    log(`GPU ${ctx.info.vendor || ''} ${ctx.info.architecture || ''} / Worker ${workers.length} 本 / 学ぶネット ${cfg.sizes.join('×')}`);
    const H = heatInput(G);
    UI.heat('h0', await heat(teacher, H));
    UI.heat('h1', await heat(student, H));
    S.run = true; S.t0 = performance.now(); S.tick = setInterval(tick, 1000);
    // 今の重みの成績(同じ局)
    if (S.base == null) { genNet = teacher; UI.set('st', '今の重みの成績を測っている…'); const e = await evalGames(cfg, cfg.evalGames, cfg.evalSeed); S.base = e.great; log(`今の重み(128×2) ${cfg.evalGames}局(種 ${cfg.evalSeed}) ${(e.great * 100).toFixed(2)}%`); }
    UI.draw();
    let rr = 777 + S.it; const rnd = () => { rr = (rr * 1103515245 + 12345) % 2147483648; return rr / 2147483648; };
    const XB = new Float32Array(cfg.batch * D), YB = new Float32Array(cfg.batch);
    while (S.run && S.it < cfg.iters) {
      if (window.KajiGPUlost) { log('GPU が止まった: ' + window.KajiGPUlost); break; }
      S.it++;
      const t0 = performance.now(), warm = S.it <= cfg.warm;
      genNet = warm ? teacher : student;
      UI.set('st', `世代 ${S.it}: 自己対戦中(${warm ? '今の重みで' : '学習中のネットで'})…`);
      const g = await gen(cfg, (cfg.seed || 1) * 100000 + S.it);
      let nNew = 0; for (const r of g.rs) { rep.push(r.X, r.Y); nNew += r.Y.length; }
      const t1 = performance.now();
      UI.set('v-ram', (rep.n / 1e6).toFixed(2) + 'M'); UI.bar('b-ram', rep.n / cfg.cap);
      // 学習
      UI.set('st', `世代 ${S.it}: 学習中…`);
      const steps = Math.ceil(nNew * cfg.replay * (warm ? 2 : 1) / cfg.batch);
      const lr = Math.max(cfg.lrMin, cfg.lr * Math.pow(0.5, Math.max(0, S.it - cfg.warm) / 40));
      let ls = 0, lc = 0;
      for (let k = 0; k < steps; k++) {
        rep.sample(cfg.batch, cfg.window, XB, YB, rnd);
        const want = k % 25 === 24 || k === steps - 1;
        const l = await student.trainStep(XB, YB, lr, want);
        if (want) { ls += l; lc++; }
      }
      const t2 = performance.now();
      const rec = { it: S.it, sp: g.selfplay, loss: ls / lc, ev: NaN, n: nNew, gen: (t1 - t0) / 1000, train: (t2 - t1) / 1000, lr, warm };
      // 成績
      if (S.it % cfg.evalEvery === 0 || S.it === cfg.warm) {
        genNet = student; UI.set('st', `世代 ${S.it}: 成績を測っている…`);
        const e = await evalGames(cfg, cfg.evalGames, cfg.evalSeed); rec.ev = e.great;
        if (e.great > S.best) { S.best = e.great; const net = await student.readNet(); await DB.put('best', { it: S.it, ev: e.great, net: pack(net), cfg }); rec.best = 1; }
      }
      S.hist.push(rec);
      UI.heat('h1', await heat(student, H));
      const net = await student.readNet();
      await DB.put('latest', { it: S.it, net: pack(net), hist: S.hist, base: S.base, best: S.best, cfg });
      await DB.put('log', S.log.slice(-400));
      UI.set('v-it', S.it);
      if (rec.ev === rec.ev) UI.set('v-ev', `${(rec.ev * 100).toFixed(1)}%`);
      UI.draw();
      log(`世代 ${S.it}${warm ? '(先生)' : ''} 自己対戦 ${(g.selfplay * 100).toFixed(1)}% 局面 +${nNew} 損失 ${rec.loss.toFixed(4)} 学習率 ${lr.toExponential(1)} 自己対戦 ${rec.gen.toFixed(0)}s 学習 ${rec.train.toFixed(1)}s${rec.ev === rec.ev ? ` 成績 ${(rec.ev * 100).toFixed(2)}%(今の重み ${(S.base * 100).toFixed(2)}%)${rec.best ? ' ★' : ''}` : ''}`);
    }
    S.run = false; clearInterval(S.tick);
    UI.set('st', `止まった(世代 ${S.it})`);
    return 'done';
  }
  window.KajiRoom = { start, stop() { S.run = false; }, S, DB, DEF, evalGames, workersRef: () => workers };
})();
