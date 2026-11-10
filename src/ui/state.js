const C = KajiCore, GM = KajiGame, V = KajiValue, W = window.KAJI_WEIGHTS || {};
const ITEM_ORDER = ['lamp', 'hidane', 'pot', 'hammer', 'pan', 'orb', 'needle'];
const SEARCH = { lamp: { depth: 2, K: 6, N2: 3, K2: 4 } };       // ランプだけ軽い2手読み(1000局で +4pt)
const $ = id => document.getElementById(id);
const STORE = 'kajiNaviV1', CFG_STORE = 'kajiNaviCfgV1';
// 条件は「開始の集中力」だけ。ハンマーは光の鍛冶ハンマー★3 で決め打ち。
// 打てる技は集中力から決める: 253 以上(光★3 の Lv80)なら左右打ちまで、それより下は弱ねらい打ちまで
const CFG_STORE2 = 'kajiNaviCfgV2';
// off: 使わない(覚えていない)技の id。たたくは外せない。みだれ打ちは一覧に出さず、いつも外す
// input: 叩いた後の値の入れ方('btn' ボタン = 下の帯にじかに値ボタン・既定 / 'reel' シートのリール)。
//   保存には、リールを選び直した人だけ input:'reel2' と書く。前の版の 'reel'・'btn'・無しは全部ボタンにする
// size: 文字の大きさ('s' 小・'m' 中(既定)・'l' 大)。古い保存には無いので中にする
let cfg = { focus: 245, off: null, input: 'btn', size: 'm' }, cfgSaved = false;
const SIZE_K = { s: 0.9, m: 1, l: 1.25 };     // cfgSaved: 開始の集中力を一度でも決めたか(初めての人には最初に聞く)
const TECH_LIST = C.TECHS.filter(t => t.id !== 'midare');
try{
  const j2 = JSON.parse(localStorage.getItem(CFG_STORE2) || 'null');
  if(j2 && j2.focus >= 1){ cfg.focus = j2.focus | 0; cfgSaved = true; if(Array.isArray(j2.off)) cfg.off = j2.off.filter(id => C.TECH[id] && id !== 'tataku'); if(j2.input === 'reel2') cfg.input = 'reel'; if(SIZE_K[j2.size]) cfg.size = j2.size; }
  else {      // 前の版の保存(職人Lv・ハンマー)から引き継ぐ
    const j = JSON.parse(localStorage.getItem(CFG_STORE) || 'null');
    if(j && j.level >= 75){ cfg.focus = 243 + 2 * (j.level - 75) + (j.fadj | 0); cfgSaved = true; }
  }
}catch(e){}
// 技を選んだことが無い時は、前と同じく集中力から決める(253 未満なら左右打ち(Lv80)を外す)
function offList(){ return cfg.off || (cfg.focus >= 253 ? [] : ['sayuu']); }
function saveCfg(){ cfgSaved = true; try{ const o = cfg.off ? { focus: cfg.focus, off: cfg.off } : { focus: cfg.focus }; if(cfg.input === 'reel') o.input = 'reel2'; if(cfg.size && cfg.size !== 'm') o.size = cfg.size; localStorage.setItem(CFG_STORE2, JSON.stringify(o)); }catch(e){} }
// 大きさ: 盤面の値などを calc(... * var(--k)) で大きくする(小窓にも同じ値を渡す)
function sizeK(){ return SIZE_K[cfg.size] || 1; }
function applySize(){ document.documentElement.style.setProperty('--k', String(sizeK())); }
applySize();
const isBtn = () => cfg.input !== 'reel';
function mkG(key){ const off = offList();
  return GM.setup({ item: key, level: cfg.focus >= 253 ? 80 : 79, hammer: 'hikari', star: 3, focus: cfg.focus,
    techs: TECH_LIST.filter(t => !off.includes(t.id)).map(t => t.id) }); }

let item = 'lamp', G = null, net = null, s = null, hist = [];
let qs = null, pend = null, busy = false, calcId = 0;

// ---- 乱数(読みの引き直しを毎回同じにする) ----
function seeded(a){ return function(){ a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a);
  t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
function loadNet(key){
  const j = (power === 'maxTest' && W[key + '_test']) || W[key]; if(!j) return null;
  const n = { sizes: j.sizes, L: j.L.map(l => ({ n: l.n, m: l.m, W: Float32Array.from(l.W), b: Float32Array.from(l.b) })) };
  n.ver = j.sizes[0] === V.featLen(G, 1) ? 1 : j.sizes[0] === V.featLen(G, 3) ? 3 : 2;
  return n;
}
function setItem(key, keepState){
  item = key;
  G = mkG(key);
  net = loadNet(key);
  if(!keepState){ s = GM.newState(G); hist = []; pend = null; }
  save(); recalc();
}

// ---- 保存(この端末だけ) ----
function save(){ try{ localStorage.setItem(STORE, JSON.stringify({ item, s, hist: hist.slice(-40) })); }catch(e){} }
function restore(){
  try{
    const j = JSON.parse(localStorage.getItem(STORE) || 'null');
    if(j && GM.ITEMS[j.item] && j.s){ item = j.item; G = mkG(item); net = loadNet(item); s = j.s; hist = j.hist || [];
      if(s.ret){ s.v[s.ret.j] = Math.max(0, s.ret.from - 14); s.ret = null; }   // 戻りの値を入れる途中で閉じていたら平均で減らす
      return true; }
  }catch(e){}
  return false;
}
// 戻る地点を残す。label は「戻す」を押した時に出す名前。光ったマスの選び直しは次の手を入れるまで(litCand)
function snap(label){ const c = JSON.parse(JSON.stringify(s)); c._u = label || '1手'; hist.push(c); if(hist.length > 60) hist.shift(); s.litCand = null; tlogAdd(label); }
// テスト中の記録(s.tlog)。戻すと一緒に戻る。最後に結果のボタンでメモに書く
function tlogAdd(label){
  if(!isTest()) return;
  const b = qs && qs[0], q = b ? (b.q2 !== undefined ? b.q2 : b.q) : null;
  (s.tlog = s.tlog || []).push({ t: Date.now(), label: label || '1手', T: s.temp, F: s.F, v: s.v.slice(), lit: s.lit, hs: s.hs | 0,
    rec: b ? (b.a ? actName(b.a) + (tgName(b.a) ? ' ' + tgName(b.a) : '') : '仕上げ') : null, q: q === null ? null : Math.round(q * 1000) / 10 });
}
function pickLit(i){ const c = s.lit; snap('光ったマスの選択'); s.litCand = c; s.lit = i; save(); recalc(); }
let toastT = null;
function toast(t){ const e = $('toast'); e.textContent = t; e.classList.add('show'); clearTimeout(toastT); toastT = setTimeout(() => e.classList.remove('show'), 2000); }
