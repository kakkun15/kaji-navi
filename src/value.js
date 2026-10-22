// 鍛冶ナビ 局面の見積もり: 局面の特徴 → 小さなニューラルネット → 大成功の確率。
// 推奨手は「打てる手を全部試し、打った後の見積もりの期待値が一番高い手」(1手先読み)。
(function (root) {
  'use strict';
  const isNode = typeof module !== 'undefined' && module.exports;
  const CORE = isNode ? require('./core.js') : root.KajiCore;
  const GAME = isNode ? require('./game.js') : root.KajiGame;

  // ---- 局面の特徴 -------------------------------------------------------
  const PER_MASS = 16, GLOBAL = 15;
  // ver 1: 最初の版(マスごと12・全体14)。ver 2: 超えない確率・ぴったり止まる確率などを足した版
  // ver 3: 光ったマス(威力会心率上昇)向けに、次の200℃の倍数で光った時に仕上げられる見込みをマスごとに4つ足した版
function featLen(G, ver) { return ver === 1 ? G.active.length * 12 + 14 : G.active.length * (PER_MASS + (ver >= 3 ? 4 : 0)) + GLOBAL; }
  let CUM = new Float64Array(32);
  function features(G, s, out, ver) {
    ver = ver || 2;
    const f = out || new Float32Array(featLen(G, ver));
    let k = 0, needSum = 0, open = 0;
    const tScale = (1000 + Math.min(2000, s.temp)) / 2000;      // 威力の温度係数
    for (const i of G.active) {
      const z = G.cells[i], v = s.v[i], b = s.bel[i], w = z[1] - z[0] + 1;
      const need = Math.max(0, z[0] - v);
      needSum += need; if (need > 0) open++;
      // 理想値の見当から: 今やめた時の誤差の期待値・理想値が今より上の確率・今がちょうど理想値の確率・見当の広がり
      let eErr = 0, pUp = 0, pAt = 0, m1 = 0, m2 = 0;
      // 累積和(下の「ぴったり止まる確率」を、伸びごとに見当を全部なめずに引き算で出すため)
      const cum = CUM.length > b.length ? CUM : (CUM = new Float64Array(b.length + 1));
      cum[0] = 0; for (let q = 0; q < b.length; q++) cum[q + 1] = cum[q] + b[q];
      for (let q = 0; q < b.length; q++) {
        const p = b[q]; if (!p) continue;
        const I = z[0] + q;
        eErr += p * Math.min(4, Math.abs(I - v));
        if (I > v) pUp += p;
        if (I === v) pAt += p;
        m1 += p * (I - z[0]); m2 += p * (I - z[0]) * (I - z[0]);
      }
      const sd = Math.sqrt(Math.max(0, m2 - m1 * m1));
      const inZ = v >= z[0] && v <= z[1] ? 1 : 0;
      f[k++] = need / 100;
      f[k++] = Math.min(need, 60) / 60;
      f[k++] = need / (15 * tScale) / 4;                         // 残りを「たたく」何回分か
      f[k++] = inZ;
      f[k++] = inZ ? eErr / 4 : 1;
      f[k++] = pUp;
      f[k++] = pAt;
      f[k++] = ver === 1 ? (v - z[0]) / w : Math.max(-3, (v - z[0]) / w);
      f[k++] = ver === 1 ? (z[1] - v) / 20 : Math.min(3, (z[1] - v) / 20);   // 超えるまでの余裕
      f[k++] = m1 / w;
      f[k++] = sd / w;
      f[k++] = s.lit === i ? 1 : 0;
      // 今の温度で「たたく」「てかげん打ち」を打った時: 会心でなくても超えない確率・会心ならぴったり止まる確率
      if (ver >= 2) for (const id of ['tataku', 'tekagen']) {
        const rs = CORE.rolls(id, s.temp, CORE.powerMult(G.trait, s.temp, s.lit === i, s.first));
        let safe = 0, ex = 0;
        const lo = Math.max(0, v - z[0] + 1), top = b.length - 1;
        for (const r of rs) {
          if (v + r <= z[1]) safe++;
          const hi = Math.min(top, v + 2 * r - z[0]);
          if (hi >= lo) ex += cum[hi + 1] - cum[lo];
        }
        f[k++] = safe / rs.length;
        f[k++] = ex / rs.length;
      }
      // ver 3: 次の200℃の倍数(打つたびに50℃下がる)で、このマスが光った時に ねらい打ち・弱ねらい打ち で
      // ぴったり止まる確率と、会心でなくても超えない確率。光らない地金では、その温度の会心ターンの見込みとして使う
      if (ver >= 3) {
        const tNext = s.temp % 200 === 0 && !s.first ? s.temp : s.temp - (s.temp % 200);
        for (const id of ['nerai', 'jakunerai']) {
          let ex = 0, safe = 0;
          if (tNext > 0 && G.def && CORE.TECH[id] && G.level >= CORE.TECH[id].lv) {
            const lit = G.trait === 'hikari';
            const rs = CORE.rolls(id, tNext, CORE.powerMult(G.trait, tNext, lit, false));
            const cr = CORE.critRate(id, { temp: tNext, trait: G.trait, lit, first: false, level: G.level, hammer: G.hammer, star: G.star });
            for (const r of rs) {
              if (v + r <= z[1]) safe++;
              let e = 0; for (let q = 0; q < b.length; q++) { const I = z[0] + q; if (I > v && I <= v + 2 * r) e += b[q]; }
              ex += cr * e;
            }
            ex /= rs.length; safe /= rs.length;
          }
          f[k++] = ex; f[k++] = safe;
        }
      }
    }
    const kind = s.first ? 0 : CORE.tempKind(s.temp);
    f[k++] = s.temp / 1000;
    f[k++] = tScale;
    f[k++] = kind === 400 ? 1 : 0;
    f[k++] = kind === 200 ? 1 : 0;
    f[k++] = ((s.temp % 200) / 50) / 4;                          // 次の200の倍数まで何打か
    f[k++] = s.first ? 1 : 0;
    f[k++] = s.F / 100;
    f[k++] = Math.min(s.F, 60) / 60;
    f[k++] = GAME.stopProb(G, s);
    f[k++] = open / G.active.length;
    f[k++] = needSum / 500;
    f[k++] = needSum / Math.max(1, s.F) / 5;
    f[k++] = s.lit !== null ? 1 : 0;
    if (ver >= 2) f[k++] = s.temp / 50 / 40;                     // あと何打で温度が尽きるか
    f[k++] = 1;
    return f;
  }

  // ---- ニューラルネット(全結合・tanh・出力はシグモイド) ------------------
  function makeNet(sizes, rnd) {
    const L = [];
    for (let l = 0; l + 1 < sizes.length; l++) {
      const n = sizes[l], m = sizes[l + 1], W = new Float32Array(n * m), b = new Float32Array(m);
      const sc = Math.sqrt(1 / n);
      for (let q = 0; q < W.length; q++) W[q] = (rnd() * 2 - 1) * sc * 1.7;
      L.push({ n, m, W, b });
    }
    return { sizes, L };
  }
  // WebAssembly(SIMD)の版。隠れ層2つ(同じ幅、4の倍数)のネットだけ。中身は src/mlp.wat(4つずつまとめて掛け算、tanh は連分数の近似)。
  // JS 版より10倍ほど速い(ひだねの128幅で 65us → 5.6us。2行ずつ計算して入力の読み込みを使い回し、tanh も4つずつ)。答えの差は 1e-5 ほど。使えない時(古いブラウザ等)は JS 版
  const MLP_WASM = 'AGFzbQEAAAABHwNgAn9/AGAHf39/f39/fwBgC39/f39/f39/f39/AX0CCgEBZQNtZW0CAAEDBAMAAQIHBwEDbWxwAAIK5AQD2QEDAX8EewF/QQAhAgJAA0AgAiABTw0BIAAgAkECdGohByAH/QAEAEM9Cp/A/RP96QFDPQqfQP0T/egBIQMgAyAD/eYBIQQgA0PA9wNI/RMgBEMAWodG/RMgBEMAAL1D/RMgBP3kAf3mAf3kAf3mAf3kAf3mASEFQ8D3A0j9EyAEQwCic0f9EyAEQwDgREX9EyAEQwAA4EH9E/3mAf3kAf3mAf3kAf3mAf3kASEGIAcgBSAG/ecBQwAAgL/9E/3pAUMAAIA//RP96AH9CwQAIAJBBGohAgwACwsLzgIFAn8CewJ/AXsCfyABQQJ0IQ9BACEHAkADQCAHIAJPDQEgAyAHIA9saiELQwAAAAD9EyEJIAdBAWogAkkEQCALIA9qIQxDAAAAAP0TIQpBACEIAkADQCAIIA9PDQEgACAIav0ABAAhDSAJIAsgCGr9AAQAIA395gH95AEhCSAKIAwgCGr9AAQAIA395gH95AEhCiAIQRBqIQgMAAsLIAUgB0EBakECdGogBCAHQQFqQQJ0aioCACAK/R8AIAr9HwGSIAr9HwIgCv0fA5KSkjgCAAVBACEIAkADQCAIIA9PDQEgCSALIAhq/QAEACAAIAhq/QAEAP3mAf3kASEJIAhBEGohCAwACwsLIAUgB0ECdGogBCAHQQJ0aioCACAJ/R8AIAn9HwGSIAn9HwIgCf0fA5KSkjgCACAHQQJqIQcMAAsLIAYEQCAFIAIQAAsLNwAgACABIAIgAyAEIAlBARABIAkgAiACIAUgBiAKQQEQASAKIAJBASAHIAggCUEAEAEgCSoCAAs=';
  function wasmNet(net) {
    if (net._wz !== undefined) return net._wz;
    net._wz = null;
    try {
      const S = net.sizes;
      if (typeof WebAssembly === 'undefined' || S.length !== 4 || S[1] !== S[2] || S[1] % 4 || S[3] !== 1) return null;
      const D = S[0], H = S[1], D4 = (D + 3) & ~3;
      const bytes = typeof atob === 'function' ? Uint8Array.from(atob(MLP_WASM), c => c.charCodeAt(0)) : Buffer.from(MLP_WASM, 'base64');
      const need = (D4 + H * D4 + H + H * H + H + H + 4 + H + H + 64) * 4;
      const mem = new WebAssembly.Memory({ initial: Math.ceil(need / 65536) + 1 });
      const fn = new WebAssembly.Instance(new WebAssembly.Module(bytes), { e: { mem } }).exports.mlp;
      const F = new Float32Array(mem.buffer);
      let p = 0; const al = n => { const a = p; p += (n + 3) & ~3; return a; };
      const x = al(D4), W1 = al(H * D4), b1 = al(H), W2 = al(H * H), b2 = al(H), W3 = al(H), b3 = al(4), h1 = al(H), h2 = al(H);
      const L = net.L;
      for (let j = 0; j < H; j++) for (let q = 0; q < D; q++) F[W1 + j * D4 + q] = L[0].W[j * D + q];
      F.set(L[0].b, b1); F.set(L[1].W, W2); F.set(L[1].b, b2); F.set(L[2].W, W3); F.set(L[2].b, b3);
      const ok = fn(x * 4, D4, H, W1 * 4, b1 * 4, W2 * 4, b2 * 4, W3 * 4, b3 * 4, h1 * 4, h2 * 4);
      if (!Number.isFinite(ok)) return null;
      net._wz = { F, fn, D, args: [x * 4, D4, H, W1 * 4, b1 * 4, W2 * 4, b2 * 4, W3 * 4, b3 * 4, h1 * 4, h2 * 4], xo: x };
    } catch (e) { net._wz = null; }
    return net._wz;
  }
  // 速い版(学習以外の評価用): WebAssembly が使えればそれ、だめなら JS(入れ物を使い回し、4つずつ回す)
  function forwardFast(net, x) {
    const z = net.noWasm ? null : wasmNet(net);
    if (z) {
      const F = z.F, o = z.xo, D = z.D;
      for (let q = 0; q < D; q++) F[o + q] = x[q];
      const A = z.args;
      return z.fn(A[0], A[1], A[2], A[3], A[4], A[5], A[6], A[7], A[8], A[9], A[10]);
    }
    const L = net.L, nl = L.length;
    let bufs = net._fb;
    if (!bufs) { bufs = net._fb = L.map(l => new Float32Array(l.m)); }
    let a = x;
    for (let l = 0; l < nl; l++) {
      const { n, m, W, b } = L[l], o = bufs[l], last = l + 1 === nl, n4 = n - (n & 3);
      for (let j = 0; j < m; j++) {
        const off = j * n;
        let z0 = b[j], z1 = 0, z2 = 0, z3 = 0, q = 0;
        for (; q < n4; q += 4) { z0 += W[off + q] * a[q]; z1 += W[off + q + 1] * a[q + 1]; z2 += W[off + q + 2] * a[q + 2]; z3 += W[off + q + 3] * a[q + 3]; }
        for (; q < n; q++) z0 += W[off + q] * a[q];
        const z = z0 + z1 + z2 + z3;
        o[j] = last ? z : Math.tanh(z);
      }
      a = o;
    }
    return a[0];
  }
  function forward(net, x, keep) {
    if (!keep) return forwardFast(net, x);
    let a = x;
    const acts = keep ? [x] : null;
    for (let l = 0; l < net.L.length; l++) {
      const { n, m, W, b } = net.L[l], o = new Float32Array(m);
      for (let j = 0; j < m; j++) {
        let z = b[j];
        const off = j * n;
        for (let q = 0; q < n; q++) z += W[off + q] * a[q];
        o[j] = l + 1 < net.L.length ? Math.tanh(z) : z;
      }
      a = o;
      if (keep) acts.push(o);
    }
    return keep ? acts : a[0];
  }
  const sigmoid = z => 1 / (1 + Math.exp(-z));
  function valueOf(net, G, s, buf) {
    if (s.dead) return 0;
    const sp = GAME.stopProb(G, s);
    const v = sigmoid(forward(net, features(G, s, buf, net.ver)));
    return Math.max(sp, v);                    // やめることはいつでもできる
  }

  // ---- 1手先読み --------------------------------------------------------
  // 手 a を打った後の見積もりの期待値。1マスの手は結果を全部数え、複数マスの手は K 通り引いて平均する。
  function actValue(net, G, s, a, opt) {
    const K = opt.K || 12, rnd = opt.rnd, buf = opt.buf, leaf = opt.leaf || terminalOr;
    const evalAfter = (s2) => {
      // 光ったマスは打った後に決まる。候補ごとに平均する
      if (Array.isArray(s2.lit)) {
        const cand = s2.lit; let sum = 0;
        for (const c of cand) { s2.lit = c; sum += leaf(net, G, s2, buf); }
        s2.lit = null;
        return sum / cand.length;
      }
      return leaf(net, G, s2, buf);
    };
    if (!a.t.area) {
      const s2 = GAME.cloneState(s);
      GAME.afterAct(G, s2, a, null);
      return evalAfter(s2);
    }
    // マスごとの結果の一覧
    const per = a.tg.map(j => {
      const { rs, cr } = GAME.hitParams(G, s, a.t, j);
      return { j, outs: GAME.massOutcomes(G.cells[j], s.v[j], s.bel[j], rs, cr) };
    });
    // 超えない方を重く見る(opt.overPen): この手でどこかのマスがゾーンを超える確率 × overPen を引く。
    // 大成功の見込みだけで選ぶと、超えるかもしれない手でも見込みが少し高ければ選ぶ。利用者は超えるのを避けたい
    let pen = 0;
    if (opt.overPen) {
      let ok = 1;
      for (const { j, outs } of per) { let o2 = 0; for (const o of outs) if (o.w > G.cells[j][1]) o2 += o.p; ok *= 1 - o2; }
      pen = opt.overPen * (1 - ok);
    }
    if (per.length === 1) {
      let sum = 0;
      for (const o of per[0].outs) {
        const s2 = GAME.cloneState(s);
        s2.v[per[0].j] = o.w; s2.bel[per[0].j] = o.bel;
        if (o.w > G.cells[per[0].j][1]) s2.dead = true;
        if (!s2.dead) { GAME.afterAct(G, s2, a, null); sum += o.p * evalAfter(s2); }
      }
      return sum - pen;
    }
    let sum = 0;
    for (let k = 0; k < K; k++) {
      const s2 = GAME.cloneState(s);
      for (const { j, outs } of per) {
        let u = rnd(), o = outs[outs.length - 1];
        for (const x of outs) { u -= x.p; if (u <= 0) { o = x; break; } }
        s2.v[j] = o.w; s2.bel[j] = o.bel;
        if (o.w > G.cells[j][1]) s2.dead = true;
      }
      if (!s2.dead) { GAME.afterAct(G, s2, a, null); sum += evalAfter(s2); }
    }
    return sum / K - pen;
  }
  // 打つ手が無い局面は、今やめた時の確率
  function terminalOr(net, G, s, buf) {
    if (s.dead) return 0;
    if (!GAME.hasLegal(G, s)) return GAME.stopProb(G, s);
    return valueOf(net, G, s, buf);
  }
  // 全部の手の値。stop は今やめる
  // 「やめる」は最後に置く。同点なら打つ手が選ばれる(見積もりが全部0の時に、何もせずにやめる癖がつかないように)
  function evalActs(net, G, s, opt) {
    const res = [];
    for (const a of GAME.legalActs(G, s)) res.push({ a, q: actValue(net, G, s, a, opt) });
    res.push({ a: null, q: GAME.stopProb(G, s) });
    return res;
  }

  // 2手先読み: 1手先読みで上位 N 手だけ、打った後の局面でもう一度1手先読みして、その一番良い値の期待値で比べ直す
  // 手 a の2手読みの値(打った後の局面ごとに1手先読みの一番良い値を取り、その期待値)。並列の読み(pool.js)からも呼ぶ
  function act2Value(net, G, s, a, opt) {
    const K2 = opt.K2 || 8, rnd = opt.rnd;
    // 置き換え表(トランスポジションテーブル): 同じ局面の1手読みは1回だけ計算して使い回す。
    // 2手読みでは、打った後の局面が同じになることが1〜2割ある(同じ結果を引いた時・会心でない伸びが同じ時など)
    const tt = opt.tt || (opt.tt = new Map());
    const best1 = (s2) => {
      if (s2.dead) return 0;
      if (Array.isArray(s2.lit)) {
        const cand = s2.lit; let sum = 0;
        for (const c of cand) { s2.lit = c; sum += best1(s2); }
        s2.lit = cand; return sum / cand.length;
      }
      const key = stateKey(s2);
      const hit = tt.get(key); if (hit !== undefined) return hit;
      const qs = evalActs(net, G, s2, opt);
      let m = 0; for (const x of qs) if (x.q > m) m = x.q;
      if (tt.size > 200000) tt.clear();
      tt.set(key, m);
      return m;
    };
    let sum = 0, wsum = 0;
    if (!a.t.area) { const s2 = GAME.cloneState(s); GAME.afterAct(G, s2, a, null); sum = best1(s2); wsum = 1; }
    else if (a.tg.length === 1) {
      const j = a.tg[0], { rs, cr } = GAME.hitParams(G, s, a.t, j);
      for (const o of GAME.massOutcomes(G.cells[j], s.v[j], s.bel[j], rs, cr)) {
        wsum += o.p;
        if (o.w > G.cells[j][1]) continue;
        const s2 = GAME.cloneState(s); s2.v[j] = o.w; s2.bel[j] = o.bel;
        GAME.afterAct(G, s2, a, null); sum += o.p * best1(s2);
      }
    } else {
      const per = a.tg.map(j => { const { rs, cr } = GAME.hitParams(G, s, a.t, j); return { j, outs: GAME.massOutcomes(G.cells[j], s.v[j], s.bel[j], rs, cr) }; });
      for (let k = 0; k < K2; k++) {
        const s2 = GAME.cloneState(s);
        for (const { j, outs } of per) {
          let u = rnd(), o = outs[outs.length - 1];
          for (const y of outs) { u -= y.p; if (u <= 0) { o = y; break; } }
          s2.v[j] = o.w; s2.bel[j] = o.bel; if (o.w > G.cells[j][1]) s2.dead = true;
        }
        wsum += 1;
        if (!s2.dead) { GAME.afterAct(G, s2, a, null); sum += best1(s2); }
      }
    }
    // 超える確率の罰(actValue と同じ。2手読みの1手目にも掛ける)
    let pen = 0;
    if (opt.overPen && a.t.area) {
      let ok = 1;
      for (const j of a.tg) { const { rs, cr } = GAME.hitParams(G, s, a.t, j); let o2 = 0; for (const o of GAME.massOutcomes(G.cells[j], s.v[j], s.bel[j], rs, cr)) if (o.w > G.cells[j][1]) o2 += o.p; ok *= 1 - o2; }
      pen = opt.overPen * (1 - ok);
    }
    return (wsum > 0 ? sum / wsum : 0) - pen;
  }
  // 局面の鍵(置き換え表用)。値・温度・集中力・光ったマス・1手目か・必殺・理想値の見当(会心でしぼられた物)
  function stateKey(s) {
    let k = s.v.join(',') + '|' + s.temp + '|' + s.F + '|' + s.lit + '|' + (s.first ? 1 : 0) + '|' + (s.hs | 0);
    for (const b of s.bel) { if (!b) continue; let uni = true; for (const x of b) if (Math.abs(x - b[0]) > 1e-12) { uni = false; break; } k += '|' + (uni ? 'u' : b.map(x => x.toFixed(5)).join(',')); }
    return k;
  }
  // 3手読みの1手分: 打った後の局面ごとに2手読み(opt.c の設定)をして、その一番良い値の期待値。超えた時の罰は1手目にも掛ける
  function act3Value(net, G, s, a, opt) {
    const co = Object.assign({}, opt, opt.c || {}, { rnd: opt.rnd, buf: opt.buf });
    const best2 = (s2) => {
      if (s2.dead) return 0;
      if (Array.isArray(s2.lit)) { const cand = s2.lit; let sum = 0; for (const c of cand) { s2.lit = c; sum += best2(s2); } s2.lit = cand; return sum / cand.length; }
      if (!GAME.legalActs(G, s2).length) return GAME.stopProb(G, s2);
      const qs = evalActs2(net, G, s2, co);
      let m = 0; for (const x of qs) if (x.q2 > m) m = x.q2;
      return m;
    };
    const K3 = opt.K3 || 6, rnd = opt.rnd;
    let sum = 0, wsum = 0, pen = 0;
    if (!a.t.area) { const s2 = GAME.cloneState(s); GAME.afterAct(G, s2, a, null); return best2(s2); }
    const per = a.tg.map(j => { const { rs, cr } = GAME.hitParams(G, s, a.t, j); return { j, outs: GAME.massOutcomes(G.cells[j], s.v[j], s.bel[j], rs, cr) }; });
    if (opt.overPen) { let ok = 1; for (const { j, outs } of per) { let o2 = 0; for (const o of outs) if (o.w > G.cells[j][1]) o2 += o.p; ok *= 1 - o2; } pen = opt.overPen * (1 - ok); }
    if (per.length === 1) {
      const { j, outs } = per[0];
      for (const o of outs) { wsum += o.p; if (o.w > G.cells[j][1]) continue; const s2 = GAME.cloneState(s); s2.v[j] = o.w; s2.bel[j] = o.bel; GAME.afterAct(G, s2, a, null); sum += o.p * best2(s2); }
    } else {
      for (let k = 0; k < K3; k++) {
        const s2 = GAME.cloneState(s);
        for (const { j, outs } of per) { let u = rnd(), o = outs[outs.length - 1]; for (const y of outs) { u -= y.p; if (u <= 0) { o = y; break; } } s2.v[j] = o.w; s2.bel[j] = o.bel; if (o.w > G.cells[j][1]) s2.dead = true; }
        wsum += 1; if (!s2.dead) { GAME.afterAct(G, s2, a, null); sum += best2(s2); }
      }
    }
    return (wsum > 0 ? sum / wsum : 0) - pen;
  }
  // 3手読み: 1手読みの上位 N3 手だけ act3Value で比べ直す(q2 に入れる)
  function evalActs3(net, G, s, opt) {
    const q1 = evalActs(net, G, s, opt);
    const top = q1.slice().sort((a, b) => b.q - a.q).slice(0, opt.N3 || 4).filter(x => x.a);
    for (const x of top) x.q2 = act3Value(net, G, s, x.a, opt);
    for (const x of q1) if (x.q2 === undefined) x.q2 = x.a ? -1 : x.q;
    return q1;
  }
  function evalActs2(net, G, s, opt) {
    const q1 = evalActs(net, G, s, opt);
    const N = opt.N2 || 4;
    const order = q1.slice().sort((a, b) => b.q - a.q);
    const top = order.slice(0, N).filter(x => x.a);
    for (const x of top) x.q2 = act2Value(net, G, s, x.a, opt);
    for (const x of q1) if (x.q2 === undefined) x.q2 = x.a ? -1 : x.q;   // やめるは確定値
    return q1;
  }

  // ---- 必殺(ヘパイトスの炎)がからむ局面 ------------------------------------
  // 見積もりのネットは必殺を知らない(学習していない)ので、必殺が残っている局面は、必殺を使い切るところまで読んでから
  // ネットで採点する。学習し直さなくても、必殺の分の上積みが入る。
  //   hs=2(効果中): 次に叩く手は必ず会心。叩く手を全部ためして一番良い値。火力上げ・冷やし込み(効果は残る)の後に叩く分は
  //                 depth が残っていればもう1段読む。
  //   hs=1(チャージ済み): 「使わずにネットの値」と「今使った時の値(hs=2)」の良い方。温存して寄せてから使う分は、
  //                 1手読みの葉でこれを使うと入る(寄せた後の局面で「今使った時」を採点するので)。
  function hsVal(net, G, s, buf, depth, opt) {
    if (s.dead) return 0;
    if (!s.hs) return terminalOr(net, G, s, buf);
    if (s.hs === 1) {
      const base = terminalOr(net, G, s, buf);
      if (s.temp - 50 <= 0) return base;
      const s2 = GAME.cloneState(s);
      GAME.afterAct(G, s2, GAME.HS_ACT, null);
      return Math.max(base, hsVal(net, G, s2, buf, depth, opt));
    }
    // hs === 2
    let best = GAME.stopProb(G, s);
    const sub = Object.assign({}, opt, { K: opt.Khs || 6, leaf: (n, g, s2, b) => s2.hs === 2 ? (depth > 0 ? hsVal(n, g, s2, b, depth - 1, opt) : terminalOr(n, g, s2, b)) : terminalOr(n, g, s2, b) });
    for (const a of GAME.legalActs(G, s)) {
      if (!a.t.area && depth <= 0) continue;
      const q = actValue(net, G, s, a, sub);
      if (q > best) best = q;
    }
    return best;
  }
  // 必殺が残っている局面の手の値。hs=0 なら evalActs と同じ。
  // hs=1: まず安く(葉はネットだけ。ただし「今使う」は効果中の読みで)採点し、上位 N 手だけ、葉で「その後に使った時」も読み直す
  // ---- チャージ済みの時の下ごしらえ ----
  // 必殺の後の超4連打ち(無ければ4連打ち)は、当たった4マスとも会心。会心は理想値で止まるので、
  // 「今の値 + 2×(一番小さい伸び) ≥ 理想値の上の見当」まで寄せておけば、使った後の1打で4マスとも理想値ぴったりになる。
  // だからチャージ済みの間は、超4連打ちの形の4マスをその手前(ゾーンには入れない)まで寄せ、揃ったら使う。
  // 寄せる手は、ふつうの伸び(会心でない時)では形のマスがゾーンに入らない手に限る。
  function hsSqTech(G) {
    for (const id of ['chouyon', 'yonren']) { const a = G.acts.find(x => x.t.id === id); if (a) return a.t; }
    return null;
  }
  function belRange(z, b) { let lo = null, hi = null; for (let q = 0; q < b.length; q++) if (b[q] > 1e-9) { if (lo === null) lo = z[0] + q; hi = z[0] + q; } return [lo, hi]; }
  // 温度 T で使った後の超4連打ちで、マス i を必ず理想値まで運べる一番低い値
  function hsLow(G, s, sq, i, T) {
    const rs = CORE.rolls(sq.id, T, CORE.powerMult(G.trait, T, false, false));
    return belRange(G.cells[i], s.bel[i])[1] - 2 * rs[0];
  }
  function hsGroup(G, s, sq) {
    let best = null, bs = -1;
    for (const a of G.acts) {
      if (a.t !== sq) continue;
      // 届いていないマスのゾーンの幅。寄せ始めた形を途中で乗り換えないよう、進んでいるマスほど重く数える
      let sc = 0;
      for (const i of a.tg) if (s.v[i] < G.cells[i][0]) sc += (G.cells[i][1] - G.cells[i][0] + 1) * (1 + 3 * s.v[i] / G.cells[i][0]);
      if (sc > bs) { bs = sc; best = a.tg; }
    }
    return bs > 0 ? best : null;
  }
  // 'fire'(今使う)・寄せる手・null(ふつうに比べて決める)
  function hsSetup(G, s, opt) {
    const sq = hsSqTech(G); if (!sq || s.temp - 50 <= 0) return null;
    const grp = hsGroup(G, s, sq); if (!grp) return null;
    const Tf = s.temp - 50, cSq = GAME.costOf(G, Object.assign({}, s, { temp: Tf, first: false }), sq);
    // 形の外の届いていないマスを仕上げるのに残しておく集中力の目安(1集中力で約3.5伸びる + 1マス8)
    let reserve = 0;
    for (const i of G.active) if (!grp.includes(i) && s.v[i] < G.cells[i][0]) reserve += (G.cells[i][0] - s.v[i]) / (opt.hsPerF || 3.5) + 8;
    const notReady = grp.filter(i => s.v[i] < G.cells[i][0] && s.v[i] < hsLow(G, s, sq, i, Tf));
    if (!notReady.length) return 'fire';
    if (s.F - cSq < reserve + 6) return null;      // 寄せる余裕が無い。使うかどうかはふつうに比べて決める
    let best = null, bv = 0;
    for (const a of GAME.legalActs(G, s)) {
      if (!a.t.area || a.t.aim || a.t.hs) continue;
      const c = GAME.costOf(G, s, a.t), T2 = s.temp + a.t.dT - 50;
      if (T2 <= 0) continue;
      const s2 = Object.assign({}, s, { temp: T2, first: false });
      if (s.F - c - GAME.costOf(G, s2, sq) < reserve) continue;
      let sc = 0, ok = true;
      for (const i of a.tg) {
        const z = G.cells[i], { rs } = GAME.hitParams(G, s, a.t, i);
        if (s.v[i] + rs[rs.length - 1] > z[1]) { ok = false; break; }            // ふつうの伸びで超えうる
        if (grp.includes(i)) {
          if (s.v[i] >= z[0]) continue;
          if (s.v[i] + rs[rs.length - 1] >= z[0]) { ok = false; break; }         // ふつうの伸びでゾーンに入りうる
          const lo = hsLow(G, s, sq, i, T2), gap = v => Math.max(0, lo - v);
          let pr = 0; for (const r of rs) pr += gap(s.v[i]) - gap(s.v[i] + r);
          sc += pr / rs.length;
        } else {
          let pr = 0; for (const r of rs) pr += Math.min(r, Math.max(0, z[0] - s.v[i]));
          sc += 0.2 * pr / rs.length;
        }
      }
      if (!ok) continue;
      sc -= 0.5 * c;
      if (sc > bv) { bv = sc; best = a; }
    }
    // 火力上げ: 温度を上げると使った後の超4連打ちの伸びが大きくなり、寄せる残りが減る(叩かずに届くマスも出る)。
    // 叩く手と同じ物差し(使う時の温度での残りの減り − 0.5×消費)で比べる。opt.hsHeat === false で前の動き
    const kar = opt.hsHeat === false ? null : GAME.legalActs(G, s).find(a => a.t.id === 'karyoku');
    if (kar) {
      const c = GAME.costOf(G, s, kar.t), T2 = s.temp + kar.t.dT - 50;
      if (s.F - c - GAME.costOf(G, Object.assign({}, s, { temp: T2, first: false }), sq) >= reserve) {
        const gap = T => { let g = 0; for (const i of notReady) g += Math.max(0, hsLow(G, s, sq, i, T) - s.v[i]); return g; };
        const sc = gap(Tf) - gap(T2) - 0.5 * c;
        if (sc > bv) { bv = sc; best = kar; }
      }
    }
    return best;                   // 寄せる手が無ければ、ふつうに比べる(使う手も候補に入っている)
  }

  function evalActsHS(net, G, s, opt) {
    if (!s.hs) return evalActs(net, G, s, opt);
    const leafHS = (n, g, s2, b) => s2.hs ? hsVal(n, g, s2, b, s2.hs === 2 ? 1 : 0, opt) : terminalOr(n, g, s2, b);
    // 同点なら叩く手を先に(火力上げで効果を持ち越しても同じ値になる時は、今叩く)
    const byQ = (a, b) => (b.q - a.q) || ((b.a && b.a.t.area ? 1 : 0) - (a.a && a.a.t.area ? 1 : 0));
    if (s.hs === 2) return evalActs(net, G, s, Object.assign({}, opt, { leaf: leafHS })).sort(byQ);
    const cheap = (n, g, s2, b) => s2.hs === 2 ? hsVal(n, g, s2, b, 1, opt) : terminalOr(n, g, s2, b);
    const res = evalActs(net, G, s, Object.assign({}, opt, { leaf: cheap }));
    const deep = Object.assign({}, opt, { K: opt.Khs || 6, leaf: leafHS });
    if (opt.hsSetupOff) {          // 下ごしらえを使わない時は、上位 N 手を「その後に使った時」まで読み直して比べる
      const top = res.filter(x => x.a && !x.a.t.hs).sort((a, b) => b.q - a.q).slice(0, opt.Nhs || 5);
      for (const x of top) x.q = Math.max(x.q, actValue(net, G, s, x.a, deep));
    }
    res.sort(byQ);
    // 下ごしらえ: 揃ったら使う・寄せる手があれば寄せる。決めた手を先頭に置く(hsPick)
    const d = opt.hsSetupOff ? null : hsSetup(G, s, opt);
    let pick = null;
    if (d === 'fire') pick = res.find(x => x.a && x.a.t.hs);
    else if (d) pick = res.find(x => x.a === d) || null;
    if (pick && pick !== res[0]) {
      if (!(pick.a && pick.a.t.area)) {} else pick.q = Math.max(pick.q, actValue(net, G, s, pick.a, deep));
      res.splice(res.indexOf(pick), 1); res.unshift(pick); pick.hsPick = true;
    }
    // 使った後(−50℃)に叩けない温度で使うことになったら、先に火力上げ(使ってから火力上げするのと集中力は同じ。順番が分かりやすい)
    if (opt.hsHeat !== false && res[0] && res[0].a && res[0].a.t.hs && s.temp - 100 <= 0) {
      const k = res.find(x => x.a && x.a.t.id === 'karyoku');
      if (k) { k.q = Math.max(k.q, res[0].q); res.splice(res.indexOf(k), 1); res.unshift(k); k.hsPick = true; }
    }
    return res;
  }

  // 余った集中力で温度だけの手(火力上げ・冷やし込み)を打ち続けて、結局どこも叩かずに終わるのを防ぐ。
  // 一番良い手が温度だけの手の時、その後を1手読みでなぞり(最大 maxN 手)、叩く手が出てくる前に
  // 「仕上げる」になる・打てる手が無くなるなら、その温度の手は無駄なので「仕上げる」を先頭にする。
  // 光る地金(威力会心率上昇)で 200 の倍数に止まってマスが光る時は、叩く意味があるのでそのまま。
  function trimIdle(net, G, s, res, opt) {
    const top = res[0];
    if (!top || !top.a || top.a.t.area || top.a.t.hs || s.hs) return res;
    const stop = res.find(x => !x.a); if (!stop) return res;
    // なぞる時の乱数は別に持つ(本番の読みの乱数の並びを変えないため)
    let sd = 99991; const rnd = () => { sd = (sd * 1103515245 + 12345) >>> 0; return sd / 4294967296; };
    const o1 = { K: 8, overPen: opt.overPen, rnd, buf: opt.buf };
    let t = GAME.cloneState(s), a = top.a;
    for (let k = 0; k < (opt.idleN || 8); k++) {
      if (GAME.costOf(G, t, a.t) > t.F) break;
      GAME.afterAct(G, t, a, null);
      if (Array.isArray(t.lit)) return res;                  // マスが光る: 叩く意味がある
      if (!GAME.hasLegal(G, t)) break;
      const qs = evalActs(net, G, t, o1);
      let b = qs[0]; for (const x of qs) if (x.q > b.q || (x.q === b.q && x.a && !b.a)) b = x;
      if (!b.a) break;
      if (b.a.t.area) return res;                            // 後で叩く: 温度の手に意味がある
      a = b.a;
    }
    res.splice(res.indexOf(stop), 1); res.unshift(stop); stop.idleCut = true;
    return res;
  }

  const VALUE = { trimIdle, act2Value, act3Value, evalActs3, hsVal, evalActsHS, PER_MASS, GLOBAL, featLen, features, makeNet, forward, sigmoid, valueOf, actValue, evalActs, evalActs2, terminalOr };
  if (isNode) module.exports = VALUE;
  else root.KajiValue = VALUE;
})(typeof window !== 'undefined' ? window : globalThis);
