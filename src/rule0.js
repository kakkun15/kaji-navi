// 許容誤差 0 の商材(光のさいほう針など)の仮の打ち方。学習した見積もりが無い間に使う。
// 考え方: 会心は理想値を越えない(理想値で止まるか、2倍進んで手前に止まる)。会心でない手だけが理想値を越える。
//   だから「会心でなくても理想値を越えない所まで寄せる」→「会心で理想値に止める(ねらい打ちで会心率を上げる)」。
//   理想値で止まったマス(見当が1点になったマス)は「決まった」として、もう叩かない。
// 推奨の見込み%は、この打ち方で最後まで打つのを何回もためした平均(モンテカルロ)。
(function (root) {
  'use strict';
  const GAME = typeof module !== 'undefined' && module.exports ? require('./game.js') : root.KajiGame;

  function locked(G, s, j) {
    const z = G.cells[j], k = s.v[j] - z[0];
    return k >= 0 && k < s.bel[j].length && s.bel[j][k] > 0.999;
  }
  // 理想値が w より下である確率(会心でない手で w になったら、理想値を越えている = もう大成功にならない)
  function passed(z, w, bel) { let p = 0; for (let k = 0; k < bel.length; k++) if (z[0] + k < w) p += bel[k]; return p; }

  // 1手の採点。W: 重み
  const W0 = { lock: 10, risk: 30, gain: 1, tempW: 30, tempDisc: 0.95 };   // さいほう針で 500局ずつ比べて決めた(大成功 37%)
  function scoreAct(G, s, a, W) {
    let gain = 0, risk = 0, plock = 0, need = 0;
    for (const j of a.tg) {
      const z = G.cells[j], v = s.v[j], bel = s.bel[j];
      const { rs, cr } = GAME.hitParams(G, s, a.t, j);
      for (const o of GAME.massOutcomes(z, v, bel, rs, cr)) {
        if (o.crit) { if (o.w >= z[0] && o.w <= z[1] && o.w > v) plock += o.p; }
        else risk += o.p * passed(z, o.w, bel);
        gain += o.p * (Math.min(o.w, z[0]) - v);
      }
      need += Math.max(10, z[0] - v);
    }
    const n = a.tg.length;
    const cost = GAME.costOf(G, s, a.t) + Math.max(0, -a.t.dT) / W.tempW;
    return { sc: (W.gain * gain / need + W.lock * plock / n - W.risk * risk / n) / Math.max(3, cost), risk: risk / n, plock: plock / n };
  }

  // 叩く手の中で一番良い採点
  function bestArea(G, s, W) {
    let best = null, bs = -1e9;
    for (const a of GAME.legalActs(G, s)) {
      if (!a.t.area) continue;
      if (a.tg.some(j => locked(G, s, j))) continue;                  // 決まったマスは叩かない
      const r = scoreAct(G, s, a, W);
      if (r.sc > bs) { bs = r.sc; best = a; }
    }
    return { a: best, sc: bs };
  }
  function policy(G, s, W) {
    W = W || W0;
    if (s.dead) return null;
    const open = G.active.filter(j => !locked(G, s, j));
    if (!open.length) return null;                                   // 全部決まった
    const acts = GAME.legalActs(G, s);
    if (!acts.length) return null;
    const now = bestArea(G, s, W);
    // 遠いうち(ゾーン下限まで W.far 以上あるマスがある)は温度を高く保つ(威力は温度にほぼ比例する)
    const heat = acts.find(a => a.t.id === 'karyoku');
    const far = open.some(j => G.cells[j][0] - s.v[j] > (W.far || 120));
    if (heat && far && s.temp <= (W.heatT || 1500) && GAME.costOf(G, s, heat.t) + (W.heatKeep || 40) < s.F) return heat;
    // 温度の手(火力上げ・冷やし込み)は、打った後の一番良い叩く手の採点で比べる(1〜2回まで先を見る)
    let pick = now.a, ps = now.sc;
    for (const t of acts) {
      if (t.t.area) continue;
      let s2 = GAME.cloneState(s), c = 0, a2 = t;
      for (let k = 0; k < (W.tempLook || 2); k++) {
        if (GAME.costOf(G, s2, a2.t) > s2.F - 6) break;
        c += GAME.costOf(G, s2, a2.t); GAME.afterAct(G, s2, a2, null);
        const b = bestArea(G, s2, W);
        const sc = b.sc * (W.tempDisc || 0.85) - c / Math.max(20, s.F) * (W.tempCost || 1);
        if (sc > ps * (W.tempMargin || 1.1) + 1e-9 && b.a) { ps = sc; pick = t; }
        a2 = GAME.legalActs(G, s2).find(x => x.t.id === t.t.id); if (!a2) break;
      }
    }
    return pick || null;
  }

  // 見当から理想値を1つ引く
  function sampleIdeal(G, s, r) {
    return G.cells.map((z, i) => {
      if (!z) return null;
      const b = s.bel[i]; let u = r(), k = 0;
      for (; k < b.length - 1; k++) { u -= b[k]; if (u <= 0) break; }
      return z[0] + k;
    });
  }
  // この局面から仮の打ち方で最後まで打った時の大成功の割合
  function rollout(G, s0, n, r, W) {
    let ok = 0;
    for (let g = 0; g < n; g++) {
      const s = GAME.cloneState(s0), ideal = sampleIdeal(G, s, r);
      if (Array.isArray(s.lit)) s.lit = s.lit[Math.floor(r() * s.lit.length)];
      for (let k = 0; k < 60 && !s.dead; k++) { const a = policy(G, s, W); if (!a) break; GAME.play(G, s, a, ideal, r); }
      if (GAME.judge(G, s, ideal).great) ok++;
    }
    return ok / n;
  }
  // 推奨の一覧(鍛冶ナビの evalActs と同じ形 { a, q })。打てる手ごとに1手打って、その後を仮の打ち方でためす
  function evalActsRule(G, s, opt) {
    opt = opt || {};
    const n = opt.n || 24, r = opt.rnd || Math.random, pick = policy(G, s);
    const out = [];
    for (const a of GAME.legalActs(G, s)) {
      if (a.t.area && a.tg.some(j => locked(G, s, j))) continue;
      let sum = 0;
      for (let g = 0; g < n; g++) {
        const s2 = GAME.cloneState(s), ideal = sampleIdeal(G, s2, r);
        if (Array.isArray(s2.lit)) s2.lit = s2.lit[Math.floor(r() * s2.lit.length)];
        GAME.play(G, s2, a, ideal, r);
        for (let k = 0; k < 60 && !s2.dead; k++) { const b = policy(G, s2); if (!b) break; GAME.play(G, s2, b, ideal, r); }
        if (GAME.judge(G, s2, ideal).great) sum++;
      }
      out.push({ a, q: sum / n + (a === pick ? 1e-6 : 0) });
    }
    out.push({ a: null, q: GAME.stopProb(G, s) });
    return out;
  }

  // アプリ用(速い方): 推奨は仮の打ち方の手そのもの。見込み%は、その手を打ってから最後まで打つのを n 回ためした平均。
  // 次点は、叩く手の採点で次に良い2手(同じようにためす。回数は半分)。推奨の手は動かさない(ためす回数が少ないと順位がぶれるので)
  function recommend(G, s, opt) {
    opt = opt || {};
    const n = opt.n || 80, r = opt.rnd || Math.random, pick = policy(G, s);
    const tryAct = (a, m) => {
      let sum = 0;
      for (let g = 0; g < m; g++) {
        const s2 = GAME.cloneState(s), ideal = sampleIdeal(G, s2, r);
        if (Array.isArray(s2.lit)) s2.lit = s2.lit[Math.floor(r() * s2.lit.length)];
        GAME.play(G, s2, a, ideal, r);
        for (let k = 0; k < 60 && !s2.dead; k++) { const b = policy(G, s2); if (!b) break; GAME.play(G, s2, b, ideal, r); }
        if (GAME.judge(G, s2, ideal).great) sum++;
      }
      return sum / m;
    };
    const stop = { a: null, q: GAME.stopProb(G, s) };
    if (!pick) return [stop];
    const out = [{ a: pick, q: Math.max(tryAct(pick, n), 1e-4) }];
    const others = [];
    for (const a of GAME.legalActs(G, s)) {
      if (a === pick || !a.t.area || a.tg.some(j => locked(G, s, j))) continue;
      others.push({ a, sc: scoreAct(G, s, a, W0).sc });
    }
    others.sort((x, y) => y.sc - x.sc);
    for (const o of others.slice(0, 2)) out.push({ a: o.a, q: Math.min(tryAct(o.a, n >> 1), out[0].q - 1e-4) });
    out.push(stop);
    return out;
  }

  const RULE0 = { policy, rollout, evalActsRule, recommend, locked, scoreAct, W0 };
  if (typeof module !== 'undefined' && module.exports) module.exports = RULE0;
  else root.KajiRule0 = RULE0;
})(typeof window !== 'undefined' ? window : globalThis);
