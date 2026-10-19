// 鍛冶ナビ ゲームの再現: 局面・打てる手・手を打った結果・理想値の見当・大成功の確率。
// 仕組みは docs/仕様.md。威力・会心率は core.js。
(function (root) {
  'use strict';
  const CORE = (typeof module !== 'undefined' && module.exports) ? require('./core.js') : root.KajiCore;

  // ---- 商材 -------------------------------------------------------------
  // 盤面は横2列。cells[i] は i = 2*行 + 列 のマスのゾーン [下限, 上限]、使わないマスは null。
  // ゾーンは利用者がゲーム画面で確かめた値。T は大成功の誤差合計(docs/仕様.md 7)。
  const ITEMS = {
    lamp:   { name: 'まおうの錬金ランプ', trait: 'shuchu', T: 3,
              cells: [[200, 208], [250, 256], [250, 256], [200, 208]] },
    hidane: { name: '超ようせいのひだね', trait: 'hikari', T: 7,
              cells: [[180, 190], [250, 258], [210, 216], [250, 258], [210, 216], [145, 155]] },
    hammer: { name: '光の鍛冶ハンマー', trait: 'hikari', T: 5,
              cells: [[120, 126], [180, 186], [236, 245], [140, 149], [160, 170], null] },
    pan:    { name: '光のフライパン', trait: 'hikari', T: 9,
              cells: [[92, 102], [110, 120], [134, 146], [158, 164], [158, 164], [92, 102], [92, 102], null] },
  };

  const START_TEMP = 1000;
  const TEMP_MAX = 2200;              // 火力上げで上げられる上限(これより上は威力が増えないので使わない)

  // ---- 叩く範囲 ---------------------------------------------------------
  // 技の範囲ごとの、叩けるマスの組。4連打ち(2×2)だけは、使うマスの段の中なら空いたマスを含んでもよい(空いたマスは叩かない)。
  function areaSets(item) {
    const n = item.cells.length, rows = n / 2;
    const on = i => i >= 0 && i < n && item.cells[i] !== null;
    const usedRows = [];
    for (let r = 0; r < rows; r++) if (on(2 * r) || on(2 * r + 1)) usedRows.push(r);
    const r0 = Math.min(...usedRows), r1 = Math.max(...usedRows);
    const out = { one: [], col: [], row: [], diag: [], sq: [] };
    for (let i = 0; i < n; i++) if (on(i)) out.one.push([i]);
    for (let r = 0; r + 1 < rows; r++) {
      for (let c = 0; c < 2; c++) if (on(2 * r + c) && on(2 * r + 2 + c)) out.col.push([2 * r + c, 2 * r + 2 + c]);
      if (on(2 * r + 1) && on(2 * r + 2)) out.diag.push([2 * r + 1, 2 * r + 2]);     // 右上と左下
      if (r >= r0 && r + 1 <= r1) {
        const g = [2 * r, 2 * r + 1, 2 * r + 2, 2 * r + 3].filter(on);
        if (g.length) out.sq.push(g);
      }
    }
    for (let r = 0; r < rows; r++) if (on(2 * r) && on(2 * r + 1)) out.row.push([2 * r, 2 * r + 1]);
    return out;
  }

  // ---- 局面 -------------------------------------------------------------
  // cfg: { item(キー), level, hammer, star, focus(開始の集中力), techs(使う技の id。無ければ Lv で決める) }
  function setup(cfg) {
    const item = ITEMS[cfg.item];
    const active = [];
    item.cells.forEach((z, i) => { if (z) active.push(i); });
    const techs = (cfg.techs || CORE.TECHS.filter(t => t.lv <= cfg.level && t.id !== 'midare').map(t => t.id))
      .map(id => CORE.TECH[id]);
    const sets = areaSets(item);
    // 打てる手の一覧(温度と集中力で毎回しぼる)
    const acts = [];
    for (const t of techs) {
      if (!t.area) { acts.push({ t, tg: [] }); continue; }
      for (const g of sets[t.area] || []) acts.push({ t, tg: g });
    }
    return Object.assign({}, cfg, { def: item, T: item.T, trait: item.trait, active, acts, cells: item.cells });
  }

  // 理想値の見当: ゾーンの値ごとの確率(初めは一様)
  function uniformBelief(z) { const w = z[1] - z[0] + 1; return new Array(w).fill(1 / w); }

  function newState(G) {
    return {
      v: G.cells.map(z => z ? 0 : null),          // 今の値
      bel: G.cells.map(z => z ? uniformBelief(z) : null),
      temp: START_TEMP,
      F: G.focus,
      first: true,                                  // まだ1手も打っていない(地金特性が乗らない)
      lit: null,                                    // 光っているマス(威力会心率上昇)
      dead: false,                                  // どこかのマスがゾーンを超えた
      hs: 0,                                        // 必殺(ヘパイトスの炎): 0 なし / 1 チャージ済み / 2 使った後(次に叩く技は必ず会心)
    };
  }
  function cloneState(s) {
    return { v: s.v.slice(), bel: s.bel.map(b => b && b.slice()), temp: s.temp, F: s.F,
             first: s.first, lit: s.lit, dead: s.dead, hs: s.hs | 0 };
  }

  // ---- 必殺(ヘパイトスの炎) ---------------------------------------------
  // 鍛冶の途中にランダムでチャージされ、1回の鍛冶で1回だけ使える。集中力は使わず、温度は −50。
  // 使うと、次に叩く技は当たったマスがすべて会心になる。火力上げ・冷やし込みでは効果は消えない。
  // チャージが来る確率は公表されていないので、計算ではチャージを起こさない(画面で「チャージが来た」と入れた時だけ使う)。
  const HS_TECH = { id: 'hissatsu', name: 'ヘパイトスの炎', lv: 0, mp: 0, pow: 0, area: null, dT: -50, hs: true };
  const HS_ACT = { t: HS_TECH, tg: [] };

  // ---- 手 ---------------------------------------------------------------
  function costOf(G, s, t) { return t.hs ? 0 : CORE.cost(t.id, s.temp, G.trait, s.first); }
  function legalActs(G, s) {
    if (s.dead) return [];
    const out = [];
    for (const a of G.acts) {
      const c = costOf(G, s, a.t);
      if (c > s.F) continue;
      const nt = s.temp + a.t.dT;
      if (nt <= 0 || nt > TEMP_MAX) continue;
      out.push(a);
    }
    if (s.hs === 1 && s.temp - 50 > 0) out.push(HS_ACT);
    return out;
  }
  // 打てる手が1つでもあるか(legalActs の早く終わる版。一覧は作らない)
  function hasLegal(G, s) {
    if (s.dead) return false;
    if (s.hs === 1 && s.temp - 50 > 0) return true;
    for (const a of G.acts) {
      if (costOf(G, s, a.t) > s.F) continue;
      const nt = s.temp + a.t.dT;
      if (nt <= 0 || nt > TEMP_MAX) continue;
      return true;
    }
    return false;
  }
  // マス j を技 t で叩く時の、伸びの7通りと会心率
  function hitParams(G, s, t, j) {
    const lit = s.lit === j;
    const mult = CORE.powerMult(G.trait, s.temp, lit, s.first);
    const rs = CORE.rolls(t.id, s.temp, mult);
    const cr = s.hs === 2 ? 1 : CORE.critRate(t.id, { temp: s.temp, trait: G.trait, lit, first: s.first,
                                     level: G.level, hammer: G.hammer, star: G.star });
    return { rs, cr };
  }

  // 1マスを叩いた結果の一覧 [{ w: 新しい値, p: 確率, crit, bel: 新しい見当 }]
  // 会心は、理想値 I が今の値より上なら min(今+2r, I) で止まり、I 以下なら動かない。
  function massOutcomes(z, v, bel, rs, cr) {
    const out = new Map();
    const add = (w, p, crit, likeOfI) => {
      const key = w + (crit ? 'c' : 'n');
      let o = out.get(key);
      if (!o) { o = { w, p: 0, crit, post: crit ? new Array(bel.length).fill(0) : null }; out.set(key, o); }
      o.p += p;
      if (crit) for (let k = 0; k < bel.length; k++) o.post[k] += likeOfI[k];
    };
    const pr = 1 / rs.length;
    if (cr < 1) for (const r of rs) add(v + r, pr * (1 - cr), false, null);     // 必殺の後(会心率1)は会心の結果だけ
    if (cr > 0) {
      for (const r of rs) {
        // 理想値ごとに止まる先が違うので、止まる先ごとにまとめる
        const groups = new Map();
        for (let k = 0; k < bel.length; k++) {
          if (bel[k] === 0) continue;
          const I = z[0] + k;
          const w = I > v ? Math.min(v + 2 * r, I) : v;
          let g = groups.get(w);
          if (!g) { g = new Array(bel.length).fill(0); groups.set(w, g); }
          g[k] += bel[k];
        }
        // 見当に入っていない(ゾーンの外まで届く)場合: 理想値はゾーン内なので、v+2r がゾーン下限より下なら全部その値
        for (const [w, g] of groups) {
          let m = 0; for (const x of g) m += x;
          const like = g.map(x => x * pr * cr);
          add(w, m * pr * cr, true, like);
        }
      }
    }
    const res = [];
    for (const o of out.values()) {
      let post;
      if (o.crit) {
        let m = 0; for (const x of o.post) m += x;
        post = o.post.map(x => x / m);
      } else post = bel;
      res.push({ w: o.w, p: o.p, crit: o.crit, bel: post });
    }
    return res;
  }

  // 手を打った後の温度・集中力・光ったマスの決め方(叩いた結果を盤面に入れた後に呼ぶ)
  function afterAct(G, s, a, rnd) {
    s.F -= costOf(G, s, a.t);
    s.temp += a.t.dT;
    if (a.t.hs) s.hs = 2;
    else if (s.hs === 2 && a.t.area) s.hs = 0;
    s.first = false;
    s.lit = null;
    if (G.trait === 'hikari' && s.temp > 0 && s.temp % 200 === 0) {
      const cand = G.active.filter(i => s.v[i] < G.cells[i][0]);
      if (cand.length) s.lit = rnd ? cand[Math.floor(rnd() * cand.length)] : cand;   // rnd 無しなら候補の一覧を返す
    }
  }

  // 本当の理想値 ideal を使って1手打つ(試合の進行・試験用)。結果の観察(会心か、伸び)も返す
  function play(G, s, a, ideal, rnd) {
    const obs = [];
    if (a.t.area) {
      for (const j of a.tg) {
        const z = G.cells[j], v = s.v[j];
        const { rs, cr } = hitParams(G, s, a.t, j);
        const r = rs[Math.floor(rnd() * rs.length)];
        const crit = rnd() < cr;
        let w;
        if (crit) w = ideal[j] > v ? Math.min(v + 2 * r, ideal[j]) : v;
        else w = v + r;
        obs.push({ j, v, w, crit, rs, cr });
        s.v[j] = w;
        if (w > z[1]) s.dead = true;
      }
      // 見当を更新(会心の時だけ情報がある)
      for (const o of obs) if (o.crit) s.bel[o.j] = critPosterior(G.cells[o.j], o.v, o.w, s.bel[o.j], o.rs);
    }
    afterAct(G, s, a, rnd);
    return obs;
  }
  // 会心で v → w になった時の見当
  function critPosterior(z, v, w, bel, rs) {
    const post = bel.map((p, k) => {
      if (!p) return 0;
      const I = z[0] + k;
      let like = 0;
      for (const r of rs) if ((I > v ? Math.min(v + 2 * r, I) : v) === w) like++;
      return p * like;
    });
    const m = post.reduce((a, b) => a + b, 0);
    return m > 0 ? post.map(x => x / m) : bel;
  }

  // ---- 大成功の確率(今やめた場合) ----------------------------------------
  // マスごとの誤差の分布を掛け合わせ、合計が T 以下の確率
  function massErrDist(z, v, bel) {
    const d = [0, 0, 0, 0, 0];
    for (let k = 0; k < bel.length; k++) if (bel[k]) d[Math.min(4, Math.abs(z[0] + k - v))] += bel[k];
    return d;
  }
  function stopProb(G, s) {
    if (s.dead) return 0;
    let dist = [1];
    for (const i of G.active) {
      const z = G.cells[i], v = s.v[i];
      if (v < z[0] || v > z[1]) return 0;
      const d = massErrDist(z, v, s.bel[i]);
      const nd = new Array(Math.min(G.T, dist.length - 1 + 4) + 1).fill(0);
      for (let a = 0; a < dist.length; a++) if (dist[a]) for (let e = 0; e <= 4; e++) if (a + e <= G.T) nd[a + e] += dist[a] * d[e];
      dist = nd;
    }
    return dist.reduce((a, b) => a + b, 0);
  }
  // 本当の理想値での誤差の合計と大成功か(試合の採点)
  function judge(G, s, ideal) {
    let err = 0, reached = true;
    for (const i of G.active) {
      const z = G.cells[i];
      if (s.v[i] < z[0] || s.v[i] > z[1]) reached = false;
      err += CORE.massError(s.v[i], ideal[i], z);
    }
    return { great: reached && err <= G.T, reached, over: s.dead, err };
  }

  const GAME = { HS_ACT, hasLegal, ITEMS, START_TEMP, TEMP_MAX, areaSets, setup, newState, cloneState, legalActs, costOf,
                 hitParams, massOutcomes, afterAct, play, critPosterior, massErrDist, stopProb, judge };
  if (typeof module !== 'undefined' && module.exports) module.exports = GAME;
  else root.KajiGame = GAME;
})(typeof window !== 'undefined' ? window : globalThis);
