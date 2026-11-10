// 推奨手のねらいを1行で(何のための手か・打つとどうなるか)。数字はゲームの再現(叩く前の局面)から
function whyText(a){
  const t = a.t;
  if(t.hs) return '';
  if(!t.area){
    const T = s.temp + t.dT * Math.max(1, chainN), k = C.tempKind(T);
    const eff = G.trait === 'hikari' && k ? '届いていないマスが1つ光る(威力2倍・会心が出やすい)'
      : G.trait === 'shuchu' && k === 200 ? '会心が出やすい温度' : G.trait === 'shuchu' && k === 400 ? '集中力の消費が半分の温度'
      : G.trait === 'tataki' && k === 400 ? '威力2倍の温度'
      : G.trait === 'modori' && k ? (() => { const j = GM.retTarget(G, s); return j >= 0 ? `戻り: ${posName(j)}が 12〜16 減る` : '戻り(減るマスは無い)'; })()
      : t.dT > 0 ? '温度を上げて、叩いた時の伸びを大きくする' : '温度を下げて、伸びを小さくする(超えないように)';
    return `${T}℃にする → ${eff}`;
  }
  const per = a.tg.map(j => { const { rs, cr } = GM.hitParams(G, s, t, j); return { j, lo: Math.min(...rs), hi: Math.max(...rs), cr }; });
  const crTxt = x => `会心${Math.round(x.cr * 100)}%`;
  if(per.length > 1){
    const lit = per.some(x => x.j === s.lit) ? '光ったマスも入れて、' : '';
    return `${lit}${per.length}マスまとめて伸ばす(${per.map(x => `${posName(x.j)} +${x.lo}〜${x.hi}`).join('・')})`;
  }
  const x = per[0], v = s.v[x.j], z = G.cells[x.j], a1 = v + x.lo, a2 = v + x.hi;
  const lit = x.j === s.lit ? '光ったマス(威力2倍)。' : '';
  const goal = t.aim ? `${crTxt(x)}で理想値ぴったりに止める`
    : a2 < z[0] ? (t.pow >= 2 || lit ? 'まだ遠い。大きく伸ばす' : 'ゾーンに近づける')
    : v >= z[0] ? 'ゾーンの中で理想値に寄せる'
    : a1 >= z[0] && a2 <= z[1] ? 'ここでゾーンに入れる'
    : a2 > z[1] ? (t.pow < 1 ? '弱く打って、超えないように少しだけ伸ばす' : `ゾーンに入れる(超える目もある。${crTxt(x)}なら止まる)`)
    : 'ゾーンに入れる(少し届かない目もある)';
  return `${lit}${goal}。ふつうは ${v} → ${a1}〜${a2}`;
}
function renderFoot(){
  const go = $('go'), msg = $('msg'), foot = document.querySelector('.foot');
  msg.className = 'msg'; msg.textContent = '';
  $('chainB').hidden = true;
  $('alts').innerHTML = '';
  // じか入れの部品(direct.js)はいったん全部しまって、出す所で出す
  go.hidden = false; $('undo').hidden = false;
  for(const id of ['dLab', 'dVals', 'dLit', 'dCancel', 'dOk', 'critSw']) $(id).hidden = true;
  foot.classList.remove('ret', 'dmulti'); foot.classList.toggle('dir', isBtn()); renderUndo();
  const rl = $('relit');
  rl.hidden = !(s.litCand && !Array.isArray(s.lit) && !s.dead && !pend);
  if(!rl.hidden){
    rl.innerHTML = `光ったマス: <b>${posName(s.lit)}</b><button id="relitB">選び直す</button>`;
    $('relitB').onclick = () => { const c = s.litCand; snap('光ったマスの選び直し'); s.lit = c; save(); recalc(); };
  }
  requestAnimationFrame(fitFoot); queueMicrotask(renderPip);
  const P = livePend();                   // じか入れの入れ途中(何マス・ほかの手・戻り)
  if(P && P.ret){ renderRetFoot(P); return; }
  if(Array.isArray(s.lit)){
    $('rec').innerHTML = '<span class="nm">光ったマスを選ぶ</span>';
    go.textContent = '上のマスを押す'; go.disabled = true; go.hidden = true; renderLitBtns(); return;
  }
  if(s.dead){ $('rec').innerHTML = '<span class="nm" style="color:var(--bad)">ゾーンを超えた</span>'; go.textContent = '最初から'; go.disabled = false; go.onclick = askReset; return; }
  if(busy || !qs){ $('rec').innerHTML = '<span class="tg">計算中…</span>'; go.textContent = '計算中…'; go.disabled = true; return; }
  const best = qs[0];
  go.disabled = false;
  // #go は隠していても、押されたら今までどおり推奨の手を打つ(外から click される)
  if(best.a){ go.textContent = '打った'; go.onclick = () => startAct(best.a); } else { go.textContent = '次の局へ'; go.onclick = askReset; }
  if(P && !sameAct(P.a, best.a)){         // 推奨でない手を入れている途中
    $('rec').innerHTML = `<span>${miniMap(P.a.tg)}<span class="nm">${P.a.t.name}</span> <span class="tg">${tgName(P.a)}</span></span>`;
    go.hidden = true; renderDirect(P); return;
  }
  if(!best.a){
    $('rec').innerHTML = `<span><span class="nm">仕上げる</span></span><span class="p">大成功の見込み <b>${pct(best.q)}</b></span>`;
    msg.textContent = best.idleCut ? 'もう叩く所が無い。ここで仕上げる。' : 'ここで仕上げるのが一番。'; return;
  }
  const c = GM.costOf(G, s, best.a.t);
  if(!lastCalc && power !== 'normal' && MAX_SKIP[item]) msg.textContent = 'この商材は最強にしても変わらない。ふつうの読みで出している。';
  if(s.hs === 2) msg.textContent = '必殺の効果中。次に叩いたマスは全部会心。';
  else if(s.hs === 1 && best.a.t.hs) msg.textContent = 'ここで必殺。集中力は減らない。';
  else if(s.hs === 1 && best.hsPick) msg.textContent = '必殺はまだ使わない。4マスを先に寄せる。';
  const why = whyText(best.a);
  $('rec').innerHTML = `<span>${best.a.t.area ? miniMap(best.a.tg) : ''}<span class="nm">${best.a.t.name}</span> <span class="tg">${tgName(best.a)}</span></span>`
    + `<span class="p">消費${c} / 見込み <b>${s.hs === 1 && best.hsPick && best.a.t.area ? '寄せ中' : pct(best.q2 !== undefined ? best.q2 : best.q)}</b></span>`
    + `<button class="det" id="detB" aria-expanded="${whyOpen}">${whyOpen ? '詳細 ▴' : '詳細 ▾'}</button>`
    + (why ? `<div class="why">${why}</div>` : '')
    + (litWarn(best.a) ? `<div class="lw">${litWarn(best.a)}</div>` : '');
  $('detB').onclick = () => setDet(!whyOpen);
  // 必殺を温存して寄せている間は、ほかの手の%(温存の分を数えていない)を出さない
  if(!(s.hs === 1 && best.hsPick)) $('alts').innerHTML = qs.slice(1, 3).map((x, k) => `<button data-k="${k+1}">${actName(x.a)} ${tgName(x.a)} ${pct(x.q2 !== undefined ? x.q2 : x.q)}</button>`).join('');
  $('alts').querySelectorAll('button').forEach(b => b.onclick = () => startAct(qs[+b.dataset.k].a));
  if(allActsOk()){ $('alts').insertAdjacentHTML('beforeend', '<button id="allB">ほかの手を全部</button>'); $('allB').onclick = openAll; }
  // 叩く手のじか入れ: 橙の「打った」は出さず、値ボタンを出す(値を押す = 打った+結果)
  if(isBtn() && best.a.t.area){ go.hidden = true; renderDirect(P || previewOf(best.a)); return; }
  // 火力上げ・冷やし込みが続けて推奨される時は、まとめて入れるボタンを出す(打つたびに押し直さなくてよい)
  const cb = $('chainB');
  if(!best.a.t.area && chainN > 1){ cb.hidden = false; cb.innerHTML = `×${chainN}<br>まとめて`; cb.onclick = () => applyChain(best.a, chainN); }
}
// 今の推奨(温度だけの技)が、打った後も続けて推奨される回数(最大6)。1手読みでなぞる
// 「詳細」(ねらいの1行と、ほかの手の候補)は、たたんでおく。開いたかどうかは覚えておく
let whyOpen = false;
try{ whyOpen = localStorage.getItem('kajiNaviWhyOpen') === '1'; }catch(e){}
function setDet(open){
  whyOpen = open; try{ localStorage.setItem('kajiNaviWhyOpen', open ? '1' : '0'); }catch(e){}
  document.querySelector('.foot').classList.toggle('fold', !open);
  const b = $('detB'); if(b){ b.textContent = open ? '詳細 ▴' : '詳細 ▾'; b.setAttribute('aria-expanded', open); }
  if(typeof fitFoot === 'function') fitFoot();
}
document.querySelector('.foot').classList.toggle('fold', !whyOpen);
let chainN = 0;
function calcChain(a){
  let t = GM.cloneState(s), k = 0;
  const rule = useRule();
  const opt = rule ? null : { K: 8, overPen: overPen(), focusMargin: focusMargin(), rnd: seeded(777), buf: new Float32Array(V.featLen(G, net.ver)) };
  while(k < 6){
    GM.afterAct(G, t, a, null); k++;
    if(Array.isArray(t.lit) || t.F < GM.costOf(G, t, a.t)) break;
    if(rule){ const b = KajiRule0.policy(G, t); if(!b || b.t.id !== a.t.id) break; continue; }
    const r = V.evalActs(net, G, t, opt); r.sort((x, y) => y.q - x.q);
    if(!r[0].a || r[0].a.t.id !== a.t.id) break;
  }
  return k;
}
function applyChain(a, n){
  snap(`${a.t.name}×${n}`); s.lastHit = null;
  for(let k = 0; k < n && !Array.isArray(s.lit); k++){ if(GM.costOf(G, s, a.t) > s.F) break; GM.afterAct(G, s, a, null); }
  save(); recalc();
}
