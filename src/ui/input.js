// ---- 手を打つ ----
function startAct(a){
  if(!a) return;
  if(!a.t.area){            // 火力上げ・冷やし込み: 結果は決まっている
    snap(a.t.name); s.lastHit = null; if(isBtn()){ pend = null; critSw = null; } GM.afterAct(G, s, a, null); save(); if(!askRet()) recalc(); return;
  }
  prepAct(a);
  openReels();
}
// 叩く前の局面で、マスごとに出うる結果を求めておく(温度・光ったマスは叩く前の物)
function mkPend(a){
  const per = a.tg.map(j => {
    const { rs, cr } = GM.hitParams(G, s, a.t, j);
    return { j, outs: GM.massOutcomes(G.cells[j], s.v[j], s.bel[j], rs, cr) };
  });
  return { a, per, sel: {} };
}
function prepAct(a){ pend = mkPend(a); critSw = null; }
// ボタンで入れる用意: 候補(its)はリールと同じ。sel は最初はリールと同じ所(外から一部のマスだけ入れられても困らないように)、
// filled が押したマス、cur が今入れるマス。keep: 入れ方を切り替えた時。押した(filled)マスの値はそのまま残す
function initBtn(X, keep){
  const kept = i => keep && X.filled && X.filled[i] && Number.isFinite(X.sel[i]);
  for(const p of X.per){ const ri = reelItems(p.outs, G.cells[p.j]); p.its = ri.its; if(!kept(p.j)) X.sel[p.j] = ri.start; }
  if(!keep || !X.filled) X.filled = {};
  const tgs = X.per.map(p => p.j).sort((a, b) => a - b);
  if(!keep || !tgs.includes(X.cur)) X.cur = tgs.find(i => !X.filled[i]) ?? tgs[0];
  return X;
}
// 下の固定欄の高さに合わせて、盤面が隠れないよう余白を取る。
// じか入れの入れ途中に、今入れるマス(何マスの技)・減ったマス(戻り)が下の帯に隠れていたら、見える所まで送る(終わったら上へ戻す)
let footScrolled = false;
function fitFoot(){
  const f = document.querySelector('.foot'); if(!f) return;
  document.querySelector('main').style.paddingBottom = (f.offsetHeight + 16) + 'px'; document.documentElement.style.setProperty('--footH', f.offsetHeight + 'px');
  const c = !isBtn() ? null : livePend() ? document.querySelector('#board .cell.cur, #board .cell.retc') : !$('dVals').hidden ? document.querySelector('#board .cell.cur, #board .cell.hit') : null;
  if(c){ const over = c.getBoundingClientRect().bottom + 6 - f.getBoundingClientRect().top; if(over > 0){ window.scrollBy(0, over); footScrolled = true; } }
  else if(footScrolled){ footScrolled = false; window.scrollTo(0, 0); }
}
function reelItems(outs, z){
  const m = new Map();
  for(const o of outs){ const x = m.get(o.w) || { w: o.w, n: 0, c: 0 }; if(o.crit) x.c += o.p; else x.n += o.p; m.set(o.w, x); }
  // tag: 'n' 会心でないと出ない値・'c' 会心でしか出ない値・'a' どちらでも出る値。pc: そのうち会心の分の確率
  const its = [...m.values()].sort((a, b) => a.w - b.w).map(x => ({ w: x.w, tag: x.n > 0 && x.c > 0 ? 'a' : x.c > 0 ? 'c' : 'n', p: x.n + x.c, pc: x.c, ov: x.w > z[1] }));
  // 最初に合わせる値: 会心でない値の真ん中(一番出やすい)
  const ns = its.filter(x => x.tag !== 'c'); const base = ns.length ? ns : its;
  return { its, start: its.indexOf(base[Math.floor((base.length - 1) / 2)]) };
}
// リール1つ分(1マス)
function reelHtml(p, vis){
  return `<div class="rcell"><div class="rl">${posName(p.j)}<b id="rt${p.j}"></b></div><div class="reel" id="rl${p.j}" style="height:${44*vis}px;padding:${22*(vis-1)}px 0">`
       + p.its.map((x, k) => `<button class="${x.tag}${x.ov ? ' ov' : ''}" data-k="${k}">${x.w}</button>`).join('') + '</div></div>';
}
function wireReel(p){
  const el = $('rl' + p.j); if(!el) return;
  el.scrollTop = pend.sel[p.j] * 44;
  let tm = null;
  el.addEventListener('scroll', () => { mark(p.j); clearTimeout(tm); tm = setTimeout(() => mark(p.j), 120); }, { passive: true });
  el.querySelectorAll('button').forEach(b => b.onclick = () => { el.scrollTo({ top: +b.dataset.k * 44, behavior: 'smooth' }); });
  mark(p.j);
}
const REEL_T = '叩いた後の値';
// 入れ方の切り替え(シートの上の端)の今の方を示す
function renderInTog(){ $('inTog').querySelectorAll('span').forEach(e => e.classList.toggle('on', e.dataset.v === (isBtn() ? 'btn' : 'reel'))); }
// じか入れ(ボタン)の時はシートを開かず、下の帯と盤面に出す(direct.js)。リールの時だけシート。keep: 入れ方を切り替えた時
function openReels(keep){
  if(isBtn()){ $('reelM').classList.remove('show'); if(!pend.ret) initBtn(pend, keep); render(); return; }
  const sh = $('reelM').querySelector('.sheet');
  sh.classList.toggle('ret', !!pend.ret); $('reelBig').hidden = !pend.ret;
  $('reelOk').hidden = false; $('reelOk').disabled = false;
  $('reelM').classList.add('show'); renderInTog();
  if(pend.ret){ renderReelCrit(); renderRet(); return; }
  const kept = i => keep && pend.filled && pend.filled[i] && Number.isFinite(pend.sel[i]);
  $('reelT').textContent = `${pend.a.t.name}: 合わせて「決定」`;
  const rows = G.cells.length / 2, tgs = pend.per.map(p => p.j);
  const usedRows = [...Array(rows).keys()].filter(r => G.cells[2*r] || G.cells[2*r+1]);
  const cols = [0, 1].filter(c => G.cells.some((z, i) => z && i % 2 === c));
  const vis = usedRows.length >= 3 ? 3 : 5;
  let h = '';
  for(const r of usedRows){
    h += `<div class="rrow" style="grid-template-columns:repeat(${cols.length},1fr)">`;
    for(const c of cols){
      const i = 2*r + c, z = G.cells[i];
      if(!z){ h += '<div class="rcell gap"></div>'; continue; }
      if(!tgs.includes(i)){ h += `<div class="rcell still"><div class="rl">${posName(i)}</div><b>${s.v[i]}</b></div>`; continue; }
      const p = pend.per.find(x => x.j === i), ri = reelItems(p.outs, z);
      p.its = ri.its; if(!kept(i)) pend.sel[i] = ri.start;
      h += reelHtml(p, vis);
    }
    h += '</div>';
  }
  $('reels').innerHTML = h;
  for(const p of pend.per) wireReel(p);
  renderReelCrit();
  renderPip();
}
// 小さい盤面(ゲームと同じ並び i = 2*行 + 列)。sel: 押せるマス、cur: 光らせるマス、lab(i): { v, cls, tag }
function miniBoard(sel, cur, lab){
  const rows = G.cells.length / 2, usedRows = [...Array(rows).keys()].filter(r => G.cells[2*r] || G.cells[2*r+1]);
  const cols = [0, 1].filter(c => G.cells.some((z, i) => z && i % 2 === c));
  let h = '<div class="mboard">';
  for(const r of usedRows){
    h += `<div class="mrow" style="grid-template-columns:repeat(${cols.length},1fr)">`;
    for(const c of cols){
      const i = 2*r + c;
      if(!G.cells[i]){ h += '<div class="mb gap"></div>'; continue; }
      const L = lab(i), on = sel.includes(i);
      h += `<button type="button" class="mb${on ? '' : ' still'}${i === cur ? ' cur' : ''}${L.cls ? ' ' + L.cls : ''}" data-j="${i}"${on ? '' : ' disabled'}><small>${posName(i)}${L.tag || ''}</small><b>${L.v}</b></button>`;
    }
    h += '</div>';
  }
  return h + '</div>';
}
// 値のボタン(5列・小さい順)。ゾーン内は緑・超える値は赤の取り消し線・一番出やすい値が1つに決まる時だけ橙の縁。小窓も同じ物を使う。
// X: 入れている物(pend か、まだ押していない推奨の手)。mode: 'n' 会心でなくても出る値だけ / 'c' 会心で出うる値だけ / '' 全部
function valBtnsIn(p, X, mode){
  const z = G.cells[p.j], its = p.its.map((x, k) => ({ x, k })).filter(o => mode === 'n' ? o.x.tag !== 'c' : mode === 'c' ? o.x.tag !== 'n' : true);
  const ns = mode === 'c' ? its : its.filter(o => o.x.tag !== 'c'), pv = o => mode === 'c' ? o.x.pc : o.x.p;
  const mx = Math.max(0, ...ns.map(pv)), tops = ns.filter(o => pv(o) >= mx - 1e-12), top = ns.length > 1 && tops.length === 1 ? tops[0].k : -1;
  const done = X.filled && X.filled[p.j];
  return its.map(o => `<button type="button" class="${o.x.ov ? 'ov' : z && o.x.w >= z[0] ? 'zn' : ''}${o.k === top ? ' best' : ''}${done && X.sel[p.j] === o.k ? ' on' : ''}" data-k="${o.k}">${o.x.w}</button>`).join('');
}
function valBtns(p, cls, X, mode){ return `<div class="${cls || 'vbs'}">${valBtnsIn(p, X, mode)}</div>`; }
// 値を押した時(下の帯・小窓の両方から)。1マスなら決まる。何マスの時は次のマスへ(全部入れたら「決定」)。
// 「会心が出た」がオンだったマスは pend.crit に覚えて、確定の時に会心として絞る(commitReels)
function pickVal(j, k){
  if(!pend) return;
  pend.sel[j] = k;
  if(pend.ret){ commitReels(); return; }
  (pend.filled = pend.filled || {})[j] = true;
  (pend.crit = pend.crit || {})[j] = critOn(pend.a, j); critSw = null;
  const tgs = pend.per.map(p => p.j).sort((a, b) => a - b);
  if(tgs.length === 1){ commitReels(); return; }
  const nx = tgs.find(i => i > j && !pend.filled[i]); const n2 = nx !== undefined ? nx : tgs.find(i => !pend.filled[i]);
  if(n2 !== undefined) pend.cur = n2;
  if(isBtn()) render();
  else { const el = $('rl' + j); if(el){ el.scrollTop = k * 44; mark(j); } renderPip(); }    // リールの人が小窓で入れた時は、本画面のリールも合わせる
}
function mark(j){
  const el = $('rl' + j), p = pend && pend.per.find(x => x.j === j); if(!el || !p) return;
  const k = Math.max(0, Math.min(p.its.length - 1, Math.round(el.scrollTop / 44)));
  pend.sel[j] = k;
  el.querySelectorAll('button').forEach(b => b.classList.toggle('on', +b.dataset.k === k));
  const t = p.its[k].tag, e = $('rt' + j);
  e.textContent = t === 'c' ? ' 会心' : t === 'a' ? ' 会心?' : ''; e.className = t;
}
// quiet: 確定の途中から呼ぶ時(すぐ後で recalc が描く)
function closeReels(quiet){
  // 戻りの値を入れずに閉じた時は、平均(14)で減らしておく(あとで盤面のマスを押して直せる)
  if(pend && pend.ret){ const { j, from } = s.ret || {}; if(s.ret){ s.v[j] = Math.max(0, from - 14); s.ret = null; toast(`${posName(j)}を −14 で入れた。違えばマスを押して直す`); } pend = null; $('reelM').classList.remove('show'); $('reelT').textContent = REEL_T; save(); recalc(); return; }
  $('reelM').classList.remove('show'); pend = null; critSw = null; $('reelT').textContent = REEL_T;
  if(quiet !== true && isBtn()) render(); else renderPip();
}
