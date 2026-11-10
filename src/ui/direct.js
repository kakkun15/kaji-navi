// ---- じか入れ(入れ方: ボタン): シートを開かず、下の帯にじかに値ボタンを出す。値を押す = 打った+結果 ----
// 中身は今までの startAct → pend → pickVal / commitReels をそのまま使う(外から startAct(a) → commitReels(vals) と呼ばれても同じ)
// 入れ途中(pend がある・ボタンの入れ方)。無ければ null
function livePend(){ return isBtn() && pend && pend.per && pend.per.length ? pend : null; }
function sameAct(a, b){ return !!a && !!b && a.t.id === b.t.id && a.tg.join() === b.tg.join(); }
// まだ押していない推奨の叩く手: 値の候補だけ作る(pend にはしない。最初の値を押した時に startAct する)
function previewOf(a){ return initBtn(mkPend(a)); }

// 「会心が出た」スイッチ: オフが既定。局面・技・マスが変わればオフに戻る(鍵が合わなくなる)
let critSw = null;
function critKey(a, j){ return [s.F, s.temp, s.v.join(','), a.t.id, a.tg.join(','), j].join('|'); }
function critOn(a, j){ return critSw !== null && critSw === critKey(a, j); }
// 値ボタンに出す値: 'n' 会心でなくても出る値だけ(オフ)/ 'c' 会心で出うる値だけ(オン)/ '' 全部(スイッチは出さない:
// 必殺の効果中など会心の値しか無い時・会心の値が無い時・戻り)
function valMode(X, p){
  if(X.ret) return '';
  const n = p.its.some(x => x.tag !== 'c'), c = p.its.some(x => x.tag !== 'n');
  return n && c ? (critOn(X.a, p.j) ? 'c' : 'n') : '';
}
// 値を押した。まだ打っていなければ、ここで startAct してから値を入れる
function directPick(X, j, k){
  if(pend !== X){ const on = critOn(X.a, j); startAct(X.a); if(!pend) return; if(on) critSw = critKey(pend.a, j); }
  pickVal(j, k);
}
// 入れ途中のマスを選び直す(盤面の叩くマス・小窓のマス)。前に「会心が出た」で入れたマスはオンに戻す
function setCur(i){
  if(!pend || pend.ret || !pend.a.tg.includes(i)) return;
  pend.cur = i; critSw = pend.crit && pend.crit[i] ? critKey(pend.a, i) : null;
  if(isBtn()) render(); else renderPip();
}
// 下の帯の ②値ボタン ③「戻す」か「やめる」・「会心が出た」・(何マスが全部入ったら)「決定」
function renderDirect(X){
  const tgs = X.per.map(p => p.j).sort((a, b) => a - b), multi = tgs.length > 1, j = X.cur, p = X.per.find(x => x.j === j), mode = valMode(X, p);
  const lab = $('dLab'), dv = $('dVals'), sw = $('critSw'), live = X === pend;
  lab.innerHTML = `<b>${posName(j)}</b>叩いた後の値を押す` + (multi ? `<span>${tgs.indexOf(j) + 1}/${tgs.length}</span>` : ''); lab.hidden = false;
  dv.innerHTML = valBtnsIn(p, X, mode); dv.hidden = false;
  dv.querySelectorAll('button').forEach(b => b.onclick = () => directPick(X, j, +b.dataset.k));
  sw.hidden = !mode; sw.setAttribute('aria-checked', String(mode === 'c'));
  sw.onclick = () => { critSw = mode === 'c' ? null : critKey(X.a, j); renderFoot(); };
  $('undo').hidden = live; $('dCancel').hidden = !live; $('dCancel').onclick = () => closeReels();
  const ok = $('dOk'); ok.hidden = !(live && multi && tgs.every(i => X.filled[i])); ok.onclick = () => commitReels();
}
// 戻り(虹色のオーブ): 青い帯+大見出し、値ボタン5つ(押したら確定)。減ったマスの選び直しは盤面のマスを押す(edit.js)
function renderRetFoot(P){
  const p = P.per[0], j = p.j, lab = $('dLab'), dv = $('dVals');
  document.querySelector('.foot').classList.add('ret');
  $('rec').innerHTML = `<div class="bigh">戻り ${posName(j)}</div>`;
  lab.innerHTML = `減った後の値を押す<span>違うマスは盤面を押す</span>`; lab.hidden = false;
  dv.innerHTML = valBtnsIn(p, P, ''); dv.hidden = false;
  dv.querySelectorAll('button').forEach(b => b.onclick = () => pickVal(j, +b.dataset.k));
  $('go').hidden = true; $('undo').hidden = true; $('dCancel').hidden = false; $('dCancel').onclick = () => closeReels();
}
// 光ったマス選び: 候補のマスのボタンをゲームと同じ並び(2列)で出す。盤面のマスを押しても選べる
function renderLitBtns(){
  const cand = s.lit, cols = [0, 1].filter(c => G.cells.some((z, i) => z && i % 2 === c)), e = $('dLit');
  let h = '';
  for(const r of rowList()){
    if(!cols.some(c => cand.includes(2*r + c))) continue;
    for(const c of cols){ const i = 2*r + c; h += cand.includes(i) ? `<button type="button" data-i="${i}"><small>${posName(i)}</small><b>${s.v[i]}</b></button>` : '<span></span>'; }
  }
  e.style.gridTemplateColumns = `repeat(${cols.length},1fr)`; e.innerHTML = h; e.hidden = false;
  e.querySelectorAll('button').forEach(b => b.onclick = () => pickLit(+b.dataset.i));
}
// 「戻す」に、押すと何が戻るかを小さく出す(履歴の _u。名前の無い履歴は「戻す」だけ)
function renderUndo(){
  const u = hist.length ? hist[hist.length - 1]._u : '', t = u && u !== '1手' ? u.replace(/の結果$/, '').replace('光ったマス', '光') : '';
  $('undo').innerHTML = t ? `戻す<small>${t}</small>` : '戻す';
}
// ---- ほかの手を全部: 打てる手を見込み順に並べて、押したらその手を入れる(qs に打てる手が全部入っている時だけ) ----
function allActsOk(){ try{ return !!qs && qs.filter(x => x.a).length >= GM.legalActs(G, s).length; }catch(e){ return false; } }
function openAll(){
  if(!allActsOk()) return;
  // 2手先まで読んだ手(q2)を先に、残りは1手読みの見込み(q)の順
  const deep = x => x.q2 !== undefined && x.q2 >= 0, qv = x => deep(x) ? x.q2 : x.q, noPct = s.hs === 1 && qs[0].hsPick;
  const L = qs.filter(x => x.a).sort((x, y) => (deep(y) - deep(x)) || qv(y) - qv(x));
  $('allL').innerHTML = L.map((x, k) => `<button type="button" data-k="${k}"><span>${x.a.t.area ? miniMap(x.a.tg) : ''}<b>${x.a.t.name}</b> ${tgName(x.a)}</span>${noPct ? '' : `<span class="p">${pct(qv(x))}</span>`}</button>`).join('');
  $('allL').querySelectorAll('button').forEach(b => b.onclick = () => { $('allM').classList.remove('show'); startAct(L[+b.dataset.k].a); });
  $('allM').classList.add('show');
}
$('allClose').onclick = () => $('allM').classList.remove('show');
$('allM').onclick = $('allClose').onclick;
