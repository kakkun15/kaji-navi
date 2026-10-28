// ブラウザ(鍛冶ナビの公開ページ)で実行: GPU のネットが CPU(value.js)と同じ答えか。
// 前に gpunet.js を読み込んでおく。結果は文字で返す。
(async () => {
  const V = window.KajiValue, GPU = window.KajiGPU, out = [];
  const ctx = window.__kctx || (window.__kctx = await GPU.device());
  let a = 9; const r = () => { a = (a * 1103515245 + 12345) % 2147483648; return a / 2147483648; };
  // 1) 見積もり: 今の重みの形(111×128×128×1)と 111×256×256×256×1
  for (const sz of [[111, 128, 128, 1], [111, 256, 256, 256, 1]]) {
    const net = GPU.makeNet(sz, r), g = GPU.GNet(ctx, net, { cap: 8192 });
    const n = 5000, X = new Float32Array(n * 111).map(() => r() * 2 - 1);
    const z = await g.infer(X, n);
    let md = 0; for (let i = 0; i < n; i++) md = Math.max(md, Math.abs(z[i] - V.forward(net, X.subarray(i * 111, i * 111 + 111), true).at(-1)[0]));
    out.push(`見積もり ${sz.join('x')} ${n}個 最大の差 ${md.toExponential(2)}`);
  }
  // 2) 学習: 同じバッチを20回。CPU の Adam(train.js と同じ式)と損失を比べる
  const sz = [111, 32, 32, 1], BT = 256, net = GPU.makeNet(sz, r), g = GPU.GNet(ctx, net, { cap: 1024, batch: BT });
  const cpu = { sizes: sz, L: net.L.map(l => ({ n: l.n, m: l.m, W: Float32Array.from(l.W), b: Float32Array.from(l.b) })) };
  const ad = cpu.L.map(l => ({ mW: new Float32Array(l.W.length), vW: new Float32Array(l.W.length), mb: new Float32Array(l.b.length), vb: new Float32Array(l.b.length) }));
  const res = [];
  for (let t = 1; t <= 20; t++) {
    const X = new Float32Array(BT * 111).map(() => r() * 2 - 1), Y = new Float32Array(BT).map(() => r());
    const lg = await g.trainStep(X, Y, 2e-3, true);
    // CPU
    const L = cpu.L, gW = L.map(l => new Float32Array(l.W.length)), gb = L.map(l => new Float32Array(l.b.length)); let ls = 0;
    for (let q = 0; q < BT; q++) {
      const acts = V.forward(cpu, X.subarray(q * 111, q * 111 + 111), true), p = V.sigmoid(acts.at(-1)[0]), y = Y[q];
      ls += -(y * Math.log(p + 1e-9) + (1 - y) * Math.log(1 - p + 1e-9));
      let delta = new Float32Array([p - y]);
      for (let l = L.length - 1; l >= 0; l--) {
        const { n: ni, m, W } = L[l], aa = acts[l], prev = l > 0 ? new Float32Array(ni) : null;
        for (let j = 0; j < m; j++) { const d = delta[j]; gb[l][j] += d; for (let k = 0; k < ni; k++) { gW[l][j * ni + k] += d * aa[k]; if (prev) prev[k] += d * W[j * ni + k]; } }
        if (prev) { for (let k = 0; k < ni; k++) prev[k] *= 1 - aa[k] * aa[k]; delta = prev; }
      }
    }
    const c1 = 1 - 0.9 ** t, c2 = 1 - 0.999 ** t;
    for (let l = 0; l < L.length; l++) for (const [P, G, M, Vv] of [[L[l].W, gW[l], ad[l].mW, ad[l].vW], [L[l].b, gb[l], ad[l].mb, ad[l].vb]])
      for (let k = 0; k < P.length; k++) { const gg = G[k] / BT; M[k] = 0.9 * M[k] + 0.1 * gg; Vv[k] = 0.999 * Vv[k] + 0.001 * gg * gg; P[k] -= 2e-3 * (M[k] / c1) / (Math.sqrt(Vv[k] / c2) + 1e-8); }
    res.push([lg, ls / BT]);
  }
  const w = await g.readNet(); let md = 0;
  for (let l = 0; l < w.L.length; l++) for (let k = 0; k < w.L[l].W.length; k++) md = Math.max(md, Math.abs(w.L[l].W[k] - cpu.L[l].W[k]));
  out.push(`学習 20回 損失 GPU ${res.at(-1)[0].toFixed(5)} / CPU ${res.at(-1)[1].toFixed(5)}(1回目 ${res[0][0].toFixed(5)} / ${res[0][1].toFixed(5)}) 重みの最大の差 ${md.toExponential(2)}`);
  // 3) 速さ: 256×3 の学習(バッチ4096)
  {
    const big = GPU.GNet(ctx, GPU.makeNet([111, 256, 256, 256, 1], r), { cap: 65536, batch: 4096 });
    const X = new Float32Array(4096 * 111).map(() => r()), Y = new Float32Array(4096).map(() => r());
    await big.trainStep(X, Y, 1e-3, true);
    let t0 = performance.now(); for (let i = 0; i < 50; i++) big.trainStep(X, Y, 1e-3, false); await big.trainStep(X, Y, 1e-3, true);
    const ts = (performance.now() - t0) / 51;
    const XI = new Float32Array(65536 * 111).map(() => r()); await big.infer(XI, 65536);
    t0 = performance.now(); for (let i = 0; i < 10; i++) await big.infer(XI, 65536); const ti = (performance.now() - t0) / 10;
    out.push(`速さ 256x3 学習 ${ts.toFixed(2)}ms/回(4096局面 → ${(4096 / ts / 1000).toFixed(2)}M局面/秒) 見積もり ${(65536 / ti / 1000).toFixed(2)}M局面/秒(読み戻し込み)`);
  }
  return out.join('\n');
})();
