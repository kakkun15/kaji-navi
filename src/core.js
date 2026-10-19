// 鍛冶ナビ 計算の核: 技・威力・会心率・地金特性。
// 仕様と出典は docs/仕様.md。ブラウザでも Node でも動く(ブラウザでは window.KajiCore)。
(function (root) {
  'use strict';

  // ---- 技 ---------------------------------------------------------------
  // pow: 威力の倍率(y)。aim: ねらい系(会心ボーナス+600%)。dT: 温度の変化。
  // area: 叩く範囲。'one' 1マス / 'col' 縦2 / 'row' 横2 / 'diag' 左下と右上 / 'sq' 2×2 / 'rand' ランダム4回 / null 叩かない
  const TECHS = [
    { id: 'tataku',   name: 'たたく',         lv: 1,  mp: 5,  pow: 1,   area: 'one',  dT: -50 },
    { id: 'jouge',    name: '上下打ち',       lv: 2,  mp: 8,  pow: 1.2, area: 'col',  dT: -50 },
    { id: 'tekagen',  name: 'てかげん打ち',   lv: 3,  mp: 10, pow: 0.5, area: 'one',  dT: -50 },
    { id: 'nibai',    name: '2倍打ち',        lv: 5,  mp: 8,  pow: 2,   area: 'one',  dT: -50 },
    { id: 'karyoku',  name: '火力上げ',       lv: 7,  mp: 10, pow: 0,   area: null,   dT: 300 },
    { id: 'yonren',   name: '4連打ち',        lv: 11, mp: 12, pow: 1.2, area: 'sq',   dT: -50 },
    { id: 'midare',   name: 'みだれ打ち',     lv: 13, mp: 7,  pow: 0.8, area: 'rand', dT: -50 },
    { id: 'sanbai',   name: '3倍打ち',        lv: 16, mp: 11, pow: 3,   area: 'one',  dT: -50 },
    { id: 'nerai',    name: 'ねらい打ち',     lv: 23, mp: 16, pow: 1,   area: 'one',  dT: -50, aim: true },
    { id: 'chouyon',  name: '超4連打ち',      lv: 27, mp: 18, pow: 2,   area: 'sq',   dT: -50 },
    { id: 'hiyashi',  name: '冷やし込み',     lv: 33, mp: 12, pow: 0,   area: null,   dT: -300 },
    { id: 'naname',   name: 'ななめ打ち',     lv: 38, mp: 7,  pow: 1.2, area: 'diag', dT: -50 },
    { id: 'neppuu',   name: '熱風おろし',     lv: 47, mp: 6,  pow: 2.5, area: 'one',  dT: -150 },
    { id: 'jgnerai',  name: '上下ねらい打ち', lv: 52, mp: 25, pow: 1.2, area: 'col',  dT: -50, aim: true },
    { id: 'jakunerai',name: '弱ねらい打ち',   lv: 75, mp: 20, pow: 0.5, area: 'one',  dT: -50, aim: true },
    { id: 'sayuu',    name: '左右打ち',       lv: 80, mp: 8,  pow: 1.2, area: 'row',  dT: -50 },
  ];
  TECHS.forEach((t, i) => { t.ix = i; });
  const TECH = Object.fromEntries(TECHS.map(t => [t.id, t]));

  // ---- 威力 -------------------------------------------------------------
  // 1000℃の「たたく」の7通り。
  const N_LIST = [12, 13, 14, 15, 16, 17, 18];
  const TEMP_CAP = 2000;

  // ceil(n × y)。y は 0.5 / 0.8 / 1 / 1.2 / 2 / 2.5 / 3 なので、10倍した整数で計算して小数の誤差を避ける。
  function basePower(n, pow) {
    const y10 = Math.round(pow * 10);
    let v = Math.ceil(n * y10 / 10);
    // n=15 の倍率1.2 と 0.8 だけは、式(18・12)より1大きい19・13になる。
    // 出典: ドラクエ10.jp「鍛冶職人の温度別数値」の表(全温度で一致。docs/仕様.md 4)。
    if (n === 15 && (y10 === 12 || y10 === 8) && CORE.fix15) v += 1;
    return v;
  }
  // 温度の係数 (0.5 + 0.0005x) = (1000 + x) / 2000。
  function tempScale(v, temp) {
    const x = Math.min(TEMP_CAP, Math.max(0, temp));
    return Math.ceil(v * (1000 + x) / 2000);
  }
  // 1回の伸びの7通り(会心でない時)。mult はたたき変化・光ったマスの倍率(1 / 2 / 0.5)。
  // 同じ(技・温度・倍率)の7通りは何度も聞かれるので、覚えておいて同じ配列を返す(メモ化)。返した配列は書き換えないこと
  const ROLLS_MEMO = new Map();
  function rolls(techId, temp, mult) {
    const t = TECH[techId]; if (!t) return null;
    const m = mult || 1, mc = m === 1 ? 0 : m === 2 ? 1 : m === 0.5 ? 2 : 3;
    if (mc === 3) return rollsRaw(techId, temp, mult);
    const key = ((t.ix * 8192 + temp) * 4 + mc) * 2 + (CORE.fix15 ? 1 : 0);      // 数の鍵(文字列を作らない)
    let r = ROLLS_MEMO.get(key);
    if (r === undefined) { r = rollsRaw(techId, temp, mult); if (ROLLS_MEMO.size > 20000) ROLLS_MEMO.clear(); ROLLS_MEMO.set(key, r); }
    return r;
  }
  function rollsRaw(techId, temp, mult) {
    const t = TECH[techId];
    if (!t || !t.area) return null;
    const m = mult || 1;
    return N_LIST.map(n => {
      const v = tempScale(basePower(n, t.pow), temp);
      return m === 1 ? v : Math.ceil(v * m);
    });
  }

  // ---- 地金特性 ---------------------------------------------------------
  // 'none' なし / 'shuchu' 集中力変化 / 'tataki' たたき変化 / 'hikari' 威力会心率上昇 / 'modori' メーター減少
  // first: 1手目(開始直後)は特性が乗らない。
  function tempKind(temp) {
    if (temp > 0 && temp % 400 === 0) return 400;
    if (temp > 0 && temp % 200 === 0) return 200;
    return 0;
  }
  // 威力の倍率(たたき変化・光ったマス)
  function powerMult(trait, temp, lit, first) {
    if (first) return 1;
    const k = tempKind(temp);
    if (trait === 'tataki') return k === 400 ? 2 : k === 200 ? 0.5 : 1;
    if (trait === 'hikari' && lit && k) return 2;
    return 1;
  }
  // 集中力の消費
  function cost(techId, temp, trait, first) {
    const t = TECH[techId];
    if (!t) return 0;
    if (trait !== 'shuchu' || first) return t.mp;
    const k = tempKind(temp);
    if (k === 400) return Math.max(1, Math.round(t.mp * 0.5));
    if (k === 200) return Math.round(t.mp * 1.5);
    return t.mp;
  }

  // ---- 会心率 -----------------------------------------------------------
  const HAMMERS = {
    dou:      { name: '銅',       base: 1.0 },
    tetsu:    { name: '鉄',       base: 1.5 },
    gin:      { name: '銀',       base: 2.0 },
    platinum: { name: 'プラチナ', base: 2.5 },
    chou:     { name: '超',       base: 3.0 },
    kiseki:   { name: '奇跡',     base: 3.3 },
    hikari:   { name: '光',       base: 3.6 },
  };
  const STAR_BONUS = [0, 0.1, 0.2, 1.0];
  const KOTSU = 1.0;          // 「コツをつかんでいる」 [S5]「らしい」
  const AIM_BONUS = 6;        // ねらい系 +600% [S5]
  const TURN_BONUS = 4;       // 集中力変化の会心ターン +400% [S5]

  function skillCrit(level) {
    return (level >= 10 ? 0.1 : 0) + (level >= 20 ? 0.2 : 0) + (level >= 30 ? 0.3 : 0);
  }
  // 道具会心率(%)
  function toolCrit(level, hammer, star) {
    const h = HAMMERS[hammer];
    return skillCrit(level) + KOTSU + (h ? h.base + STAR_BONUS[star | 0] : 0);
  }
  // 会心率(0〜1)
  function critRate(techId, o) {
    const t = TECH[techId];
    if (!t || !t.area) return 0;
    let bonus = 0;
    if (t.aim) bonus += AIM_BONUS;
    if (!o.first) {
      const k = tempKind(o.temp);
      if (o.trait === 'shuchu' && k === 200) bonus += TURN_BONUS;
      if (o.trait === 'hikari' && o.lit && k) bonus += CORE.litBonus;
    }
    return Math.min(1, toolCrit(o.level, o.hammer, o.star) * (1 + bonus) / 100);
  }

  // ---- 1回叩いた結果 ----------------------------------------------------
  // 今の値 v のマスを叩いた時に出うる値。理想値が分からないので、会心は「2倍」と「ゾーン内で止まる」の両方を出す。
  function hitValues(v, rs, zone) {
    const normal = [...new Set(rs.map(r => v + r))];
    const crit = new Set();
    for (const r of rs) {
      const to = v + 2 * r;
      if (to < zone[0] || v >= zone[1]) crit.add(to);         // ゾーンに届かない(または既に超えている)なら2倍
      else for (let x = Math.max(v + 1, zone[0]); x <= Math.min(to, zone[1]); x++) crit.add(x);
      if (to > zone[1] && v < zone[0]) { /* 理想値で必ず止まるので超えない */ }
    }
    return { normal, crit: [...crit].sort((a, b) => a - b) };
  }

  // ---- 誤差 -------------------------------------------------------------
  function massError(v, ideal, zone) {
    const d = Math.abs(v - ideal);
    if (v >= zone[0] && v <= zone[1]) return Math.min(d, 4);
    return Math.max(d, 9);
  }
  // 大成功の誤差合計(マス数から) [S3]
  const GREAT_BY_MASSES = { 2: 0, 3: 2, 4: 3, 5: 5, 6: 7, 7: 9 };

  // ---- 集中力の上限 -----------------------------------------------------
  // ハンマーの集中度(開始時に足される)。
  const HAMMER_FOCUS = { dou: 0, tetsu: 10, gin: 15, platinum: 25, chou: 35, kiseki: 50, hikari: 45 };

  const CORE = {
    TECHS, TECH, N_LIST, HAMMERS, STAR_BONUS, HAMMER_FOCUS, GREAT_BY_MASSES,
    fix15: true,
    litBonus: 4,
    basePower, tempScale, rolls, tempKind, powerMult, cost,
    skillCrit, toolCrit, critRate, hitValues, massError,
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = CORE;
  else root.KajiCore = CORE;
})(typeof window !== 'undefined' ? window : globalThis);
