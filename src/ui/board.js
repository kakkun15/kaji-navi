// ---- 表示 ----
const KIND = { shuchu: { 400: '消費半分', 200: '会心ターン' }, tataki: { 400: '威力2倍', 200: '威力半分' }, hikari: { 400: '光る', 200: '光る' }, modori: { 400: '戻り', 200: '戻り' }, none: {} };
const HS_LABEL = ['なし', 'たまった', '効果中'];
const HS_NOTE = ['たまったら押す', '使ったら押す', '叩いたら自動で なし'];
// 光ったマスがあるのに、推奨の手がそこを叩かない時の注意(光っている方をつい叩く打ち間違いを減らす)
function litWarn(a){
  if(!a || !a.t.area || typeof s.lit !== 'number' || s.dead) return '';
  return a.tg.includes(s.lit) ? '' : `⚠ 光ってない方:${tgName(a)}(光ってるのは ${posName(s.lit)})`;
}
// ---- 今の会心!: 直前に叩いたマスが会心だった(画面で見分けられなかった時に手で教える) ----
let critPick = false;
function critCells(){ return s && s.lastHit && !pend && !Array.isArray(s.lit) ? s.lastHit.cells.filter(c => !c.done && Number.isFinite(c.w)) : []; }
function applyCrit(j){
  const c = critCells().find(x => x.j === j); if(!c) return;
  snap(`${posName(j)}は会心だった`);
  const z = G.cells[j], k = s.lastHit.cells.find(x => x.j === j);
  s.bel[j] = GM.critBelief(z, c.v0, c.w, c.bel0, c.rs); k.done = true; markCrit([j]);
  critPick = false; save(); recalc(); toast(`${posName(j)}を会心として理想値を絞った`);
}
function pressCrit(){
  const cs = critCells(); if(!cs.length) return;
  if(cs.length === 1){ applyCrit(cs[0].j); return; }
  critPick = !critPick; render();
}
function renderCrit(){
  const cs = critCells(), b = $('critB'), p = $('critP');
  b.hidden = !cs.length; if(!cs.length) critPick = false;
  p.hidden = !critPick; $('critRow').hidden = !cs.length;
  if(critPick) p.innerHTML = '会心:' + cs.map(c => `<button data-j="${c.j}">${posName(c.j)}</button>`).join('') + '<button data-j="-1" style="color:var(--ink);border-color:var(--line)">やめる</button>';
  p.querySelectorAll('button').forEach(x => x.onclick = () => { const j = +x.dataset.j; if(j < 0){ critPick = false; render(); } else applyCrit(j); });
}
// 会心だったマスの印(小窓に小さく出す)。次に集中力が減る(次の手を打つ)まで出す。add: 前の印に足す(2026-11-03)
function markCrit(cells, add){
  const old = add && s.critMark && s.critMark.F === s.F ? s.critMark.cells : [];
  s.critMark = { cells: [...new Set(old.concat(cells))], F: s.F };
}
function critLine(){
  const m = s.critMark; if(!m || m.F !== s.F || !m.cells.length) return '';
  // any: 複数マスの技で「かいしんの てごたえ！」が出た(どのマスかは分からない)
  return `<div class="ck">会心 ${m.cells.map(j => { const z = G.cells[j], nz = s.bel[j].map((p, q) => p > 1e-9 ? z[0] + q : null).filter(x => x !== null);
    return posName(j) + (nz.length === 1 ? `(理想値 ${nz[0]})` : ''); }).join(m.any ? 'か' : '・')}</div>`;
}
// 小窓のマスの下の行: 理想値が絞れていれば「理想値 ○」、そうでなければゾーン(2026-11-03)
function pipBel(i, z){
  const nz = s.bel[i].map((p, q) => p > 1e-9 ? z[0] + q : null).filter(x => x !== null);
  return nz.length && nz.length < s.bel[i].length ? (nz.length === 1 ? `理想値 ${nz[0]}` : `理想値 ${nz[0]}〜${nz[nz.length-1]}`) : `${z[0]}〜${z[1]}`;
}
// 必殺: なしの間は温度の横の小さい印。たまった・効果中の時だけ、盤面の上の色の帯にする(同じボタンを移す)
function renderHs(){ const h = s.hs | 0, b = $('hsB'); $('hsBt').textContent = HS_LABEL[h]; $('hsBn').textContent = HS_NOTE[h]; b.className = 'hsb' + (h ? ' hs' + h : '');
  const to = h ? $('hsRow') : $('hsSlot'); if(b.parentNode !== to) to.appendChild(b); $('hsRow').hidden = !h; }
function renderCfg(){
  $('powTest').hidden = !W[item + '_test']; $('powGpu').hidden = !gpuOk(); renderTres();
  $('cfgB2v').textContent = cfg.focus;
  const n = TECH_LIST.length, on = n - offList().length;
  $('techBv').textContent = `${on}/${n}`; $('techB').classList.toggle('cut', on < n);
}
function render(){
  renderCfg(); renderHs(); renderCrit();
  $('temp').textContent = s.temp; $('focus').textContent = s.F;
  const k = s.first ? 0 : C.tempKind(s.temp), lab = (KIND[G.trait] || {})[k];
  $('kind').textContent = lab || ''; $('kind').className = 'k' + (lab ? ' on' : ''); $('kind').style.display = lab ? '' : 'none'; $('stTemp').classList.toggle('kd', !!lab);
  const rows = G.cells.length / 2, best = qs && qs[0] && qs[0].a, tg = best && best.t.area ? best.tg : [];
  const picking = Array.isArray(s.lit);
  let h = '';
  for(let r = 0; r < rows; r++){
    const cols = [0, 1].filter(c => G.cells.some((z, i) => z && i % 2 === c));
    h += `<div class="brow" style="grid-template-columns:repeat(${cols.length},1fr)">`;
    for(const c of cols){
      const i = 2*r + c, z = G.cells[i];
      if(!z){ h += '<div class="cell gap"></div>'; continue; }
      const v = s.v[i], top = Math.max(z[1] * 1.08, v + 1);
      const cls = ['cell', v > z[1] ? 'over' : v >= z[0] ? 'in' : '', tg.includes(i) ? 'hit' : '', s.lit === i ? 'litc' : '',
                   picking && s.lit.includes(i) ? 'pick' : ''].join(' ');
      const tags = (tg.includes(i) ? '<i>叩く</i>' : '') + (s.lit === i ? '<i class="lit">光</i>' : '');
      const b = s.bel[i], nz = b.map((p, q) => p > 1e-9 ? z[0] + q : null).filter(x => x !== null);
      const bel = nz.length && nz.length < b.length ? (nz.length === 1 ? `理想値 ${nz[0]}` : `理想値 ${nz[0]}〜${nz[nz.length-1]}`) : '';
      // 棒の下の1行: 「180〜190・あと8〜18」(理想値が絞れたら理想値の表示に替える)
      const need = `${z[0]}〜${z[1]}・` + (v < z[0] ? `あと${z[0] - v}〜${z[1] - v}` : v <= z[1] ? 'ゾーン内' : '超えた');
      h += `<div class="${cls}" data-i="${i}"><div class="lbl">${posName(i)}${tags}</div><div class="v">${v}</div>`
         + `<div class="z"><span>${z[0]}</span><span>${z[1]}</span></div><div class="bar"><span class="f" style="width:${Math.min(100, v/top*100)}%"></span>`
         + `<span class="zn" style="left:${z[0]/top*100}%;width:${(z[1]-z[0])/top*100}%"></span></div><div class="bel">${bel || `<span class="need">${need}</span>`}</div></div>`;
    }
    h += '</div>';
  }
  $('board').innerHTML = h;
  // 叩くマスを強調して、ほかのマス(光ったマスも)を薄くする。必殺の効果中は盤面の縁に橙のモヤ(2026-11-03)
  $('board').classList.toggle('aim', tg.length > 0 && !picking && !s.dead);
  $('board').classList.toggle('hsfx', (s.hs | 0) === 2);
  renderFoot();
}
function actName(a){ return a ? a.t.name : 'ここでやめる(仕上げ)'; }
// マスの呼び名(ゲーム画面の位置。使っている段だけで数える: 2段なら 上・下、3段なら 上・中・下)
function posName(i){
  const rs = [...new Set(G.active.map(j => Math.floor(j / 2)))].sort((a, b) => a - b), k = rs.indexOf(Math.floor(i / 2));
  const row = rs.length === 2 ? ['上', '下'][k] : rs.length === 3 ? ['上', '中', '下'][k] : rs.length === 1 ? '' : (k + 1) + '段目';
  return (i % 2 === 0 ? '左' : '右') + row;
}
function tgName(a){ return a && a.tg.length ? a.tg.map(posName).join('・') : ''; }
function pct(x){ return (x * 100).toFixed(x > 0.995 || x < 0.005 ? 0 : 1) + '%'; }
// 叩くマスの小さい図(盤面と同じ並び。叩くマスだけ塗る)
function miniMap(tg){
  const rs = rowList(), cols = [0, 1].filter(c => G.cells.some((z, i) => z && i % 2 === c));
  let h = `<span class="mm" style="grid-template-columns:repeat(${cols.length},9px)">`;
  for(const r of rs) for(const c of cols){ const i = 2*r + c; h += `<i class="${!G.cells[i] ? 'gap' : tg.includes(i) ? 'on' : ''}"></i>`; }
  return h + '</span>';
}
