// ---- 手を打つ ----
function startAct(a){
  if(!a) return;
  if(!a.t.area){            // 火力上げ・冷やし込み: 結果は決まっている
    snap(a.t.name); s.lastHit = null; GM.afterAct(G, s, a, null); save(); if(!askRet()) recalc(); return;     // 次の手を入れたら「今の会心!」は消す
  }
  prepAct(a);
  openReels();
}
// 叩く前の局面で、マスごとに出うる結果を求めておく(温度・光ったマスは叩く前の物)
function prepAct(a){
  const per = a.tg.map(j => {
    const { rs, cr } = GM.hitParams(G, s, a.t, j);
    return { j, outs: GM.massOutcomes(G.cells[j], s.v[j], s.bel[j], rs, cr) };
  });
  pend = { a, per, sel: {} };
}
// 下の固定欄の高さに合わせて、盤面が隠れないよう余白を取る
function fitFoot(){ const f = document.querySelector('.foot'); if(f){ document.querySelector('main').style.paddingBottom = (f.offsetHeight + 16) + 'px'; document.documentElement.style.setProperty('--footH', f.offsetHeight + 'px'); } }
function reelItems(outs, z){
  const m = new Map();
  for(const o of outs){ const x = m.get(o.w) || { w: o.w, n: 0, c: 0 }; if(o.crit) x.c += o.p; else x.n += o.p; m.set(o.w, x); }
  const its = [...m.values()].sort((a, b) => a.w - b.w).map(x => ({ w: x.w, tag: x.n > 0 && x.c > 0 ? 'a' : x.c > 0 ? 'c' : 'n', p: x.n + x.c, ov: x.w > z[1] }));
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
// keep: 入れ方を切り替えた時。押した(filled)マスの値はそのまま残す
function openReels(keep){
  const sh = $('reelM').querySelector('.sheet');
  sh.classList.toggle('ret', !!pend.ret); $('reelBig').hidden = !pend.ret;
  $('reelOk').hidden = false; $('reelOk').disabled = false;
  $('reelM').classList.add('show'); renderInTog();
  if(pend.ret){ renderRet(); return; }
  const kept = i => keep && pend.filled && pend.filled[i] && Number.isFinite(pend.sel[i]);
  if(isBtn()){
    // ボタン: 候補はリールと同じ。sel は最初はリールと同じ所(外から一部のマスだけ入れられても困らないように)、filled が押したマス
    for(const p of pend.per){ const ri = reelItems(p.outs, G.cells[p.j]); p.its = ri.its; if(!kept(p.j)) pend.sel[p.j] = ri.start; }
    if(!keep || !pend.filled) pend.filled = {};
    const tgs = pend.per.map(p => p.j).sort((a, b) => a - b);
    if(!keep || !tgs.includes(pend.cur)) pend.cur = tgs.find(i => !pend.filled[i]) ?? tgs[0];
    renderBtns(); return;
  }
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
// 値のボタン(5列)。会心の値もふつうの値と1つの並びに混ぜる(小さい順)。ゾーン内は緑・会心でしか出ない値は縁を薄いピンク・
// 一番出やすい値(会心でない中で確率が一番高く、並んでいない時)を橙の縁取り。小窓も同じ物を使う(cls: 並びの class)
function valBtns(p, cls){
  const z = G.cells[p.j], its = p.its.map((x, k) => ({ x, k })), ns = its.filter(o => o.x.tag !== 'c');
  const mx = Math.max(0, ...ns.map(o => o.x.p)), tops = ns.filter(o => o.x.p >= mx - 1e-12), top = ns.length > 1 && tops.length === 1 ? tops[0].k : -1;
  const done = pend.filled && pend.filled[p.j];
  const b = o => `<button type="button" class="${o.x.tag}${o.x.ov ? ' ov' : z && o.x.w >= z[0] ? ' zn' : ''}${o.k === top ? ' top' : ''}${done && pend.sel[p.j] === o.k ? ' on' : ''}" data-k="${o.k}">${o.x.w}</button>`;
  return `<div class="${cls || 'vbs'}">${its.map(b).join('')}</div>`;
}
// 値を押した時(本画面のボタン・小窓のボタンの両方から)。1マスなら決まる。何マスの時は次のマスへ(全部入れたら「決定」)
function pickVal(j, k){
  if(!pend) return;
  pend.sel[j] = k;
  if(pend.ret){ commitReels(); return; }
  (pend.filled = pend.filled || {})[j] = true;
  const tgs = pend.per.map(p => p.j).sort((a, b) => a - b);
  if(tgs.length === 1){ commitReels(); return; }
  const nx = tgs.find(i => i > j && !pend.filled[i]); const n2 = nx !== undefined ? nx : tgs.find(i => !pend.filled[i]);
  if(n2 !== undefined) pend.cur = n2;
  if(isBtn()) renderBtns();
  else { const el = $('rl' + j); if(el){ el.scrollTop = k * 44; mark(j); } renderPip(); }    // リールの人が小窓で入れた時は、本画面のリールも合わせる
}
function renderBtns(){
  const tgs = pend.per.map(p => p.j).sort((a, b) => a - b), multi = tgs.length > 1, j = pend.cur, p = pend.per.find(x => x.j === j);
  $('reelT').textContent = multi ? `${pend.a.t.name}: ${posName(tgs[0])}から` : `${pend.a.t.name}: ${posName(j)}`;
  let h = '';
  if(multi) h += miniBoard(tgs, j, i => {
    if(!tgs.includes(i)) return { v: s.v[i] };
    const q = pend.per.find(x => x.j === i); return pend.filled[i] ? { v: q.its[pend.sel[i]].w, cls: 'done' } : { v: '?' };
  });
  h += `<div class="vbh"><b>${posName(j)}</b> 今 ${s.v[j]} → 叩いた後</div>` + valBtns(p);
  $('reels').innerHTML = h;
  $('reels').querySelectorAll('.mb[data-j]').forEach(b => b.onclick = () => { pend.cur = +b.dataset.j; renderBtns(); });
  $('reels').querySelectorAll('.vbs button').forEach(b => b.onclick = () => pickVal(j, +b.dataset.k));
  $('reelOk').hidden = !multi; $('reelOk').disabled = !tgs.every(i => pend.filled[i]);
  renderPip();
}
function mark(j){
  const el = $('rl' + j), p = pend && pend.per.find(x => x.j === j); if(!el || !p) return;
  const k = Math.max(0, Math.min(p.its.length - 1, Math.round(el.scrollTop / 44)));
  pend.sel[j] = k;
  el.querySelectorAll('button').forEach(b => b.classList.toggle('on', +b.dataset.k === k));
  const t = p.its[k].tag, e = $('rt' + j);
  e.textContent = t === 'c' ? ' 会心' : t === 'a' ? ' 会心?' : ''; e.className = t;
}
function closeReels(){
  // 戻りの値を入れずに閉じた時は、平均(14)で減らしておく(あとで盤面のマスを押して直せる)
  if(pend && pend.ret){ const { j, from } = s.ret || {}; if(s.ret){ s.v[j] = Math.max(0, from - 14); s.ret = null; toast(`${posName(j)}を −14 で入れた。違えばマスを押して直す`); } pend = null; $('reelM').classList.remove('show'); $('reelT').textContent = REEL_T; save(); recalc(); return; }
  $('reelM').classList.remove('show'); pend = null; $('reelT').textContent = REEL_T; renderPip();
}
