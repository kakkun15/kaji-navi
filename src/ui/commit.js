// 戻りの地金: 温度が200の倍数になって1マスが減った時、実際の値を入れてもらう(12〜16 減る。最初は真ん中の14)
const RETLOG = 'kajiNaviRetLog', RETLOG_MAX = 500;
function retOuts(j){ const from = s.v[j], outs = []; for(let d = GM.RET_MAX; d >= GM.RET_MIN; d--){ const w = Math.max(0, from - d); if(!outs.some(o => o.w === w)) outs.push({ w, p: 1, crit: false, bel: s.bel[j] }); } return outs; }
// 減ったマスを j にする(s.v[j] は減る前の値)。値の候補を作り直し、平均(−14)に合わせる
function setRetCell(j){
  const p = { j, outs: retOuts(j) }; p.its = reelItems(p.outs, G.cells[j]).its;
  const k = p.its.findIndex(x => x.w === Math.max(0, s.v[j] - 14));
  pend.per = [p]; pend.a.tg = [j]; pend.sel = { [j]: k >= 0 ? k : Math.floor((p.its.length - 1) / 2) };
  s.ret = { j, from: s.v[j] };
}
function askRet(){
  if(!s.ret) return false;
  const { j, from } = s.ret;
  s.v[j] = from;                       // 入れるまでは減る前の値で見せる(「やめる」なら平均で減らした値にする)
  pend = { a: { t: { name: '戻り' }, tg: [j] }, per: [], sel: {}, ret: true, retPred: j };
  setRetCell(j);
  qs = null; render();                 // 後ろの盤面を今の値で描き直す
  openReels();
  if(voiceOn) vSay('もどり、' + posName(j));
  return true;
}
function renderRet(){
  const p = pend.per[0], j = p.j, btn = isBtn();
  $('reelBig').textContent = `戻り ${posName(j)}`;
  $('reelT').textContent = btn ? '減った後の値を押す' : '減った後の値を合わせて「決定」';
  let h = `<div class="vbh">減ったマス(違ったら押して選び直す)</div>`
    + miniBoard(G.active, j, i => ({ v: s.v[i], tag: i === pend.retPred ? '<em>予想</em>' : '' }))
    + `<div class="vbh"><b>${posName(j)}</b> ${s.v[j]} → 減った後(12〜16 減る)</div>`;
  h += btn ? valBtns(p) : `<div class="rrow" style="grid-template-columns:1fr">${reelHtml(p, 5)}</div>`;
  $('reels').innerHTML = h;
  $('reels').querySelectorAll('.mb[data-j]').forEach(b => b.onclick = () => { const i = +b.dataset.j; if(i === pend.per[0].j) return; setRetCell(i); renderRet(); });
  if(btn) $('reels').querySelectorAll('.vbs button').forEach(b => b.onclick = () => pickVal(j, +b.dataset.k));
  else wireReel(p);
  $('reelOk').hidden = btn; $('reelOk').disabled = false;
  renderPip();
}
// vals: 外から実際の値を渡す時(画面読み取りなど){マスの番号: 値}。リールの候補に無い値でもそのまま入れる。画面のボタンからはイベントが来るので使わない
function commitReels(vals){
  if(!pend) return;
  if(pend.ret){        // 戻りの値: 温度・集中力は打った時に済んでいる。値だけ入れる
    const p = pend.per[0], ov = vals && vals.constructor === Object ? vals : null;
    const w = ov && Number.isFinite(ov[p.j]) ? ov[p.j] : p.its[pend.sel[p.j]].w;
    // 戻りの記録(減るマスの決まりを確かめる用): 予想したマス・選んだマス・減る前の盤面・減った後の値・温度
    try{ const L = retLog(); L.push({ at: new Date().toISOString(), item, pred: pend.retPred, pick: p.j, before: s.v.slice(), after: w, temp: s.temp });
      localStorage.setItem(RETLOG, JSON.stringify(L.slice(-RETLOG_MAX))); }catch(e){}
    s.v[p.j] = w; s.ret = null;
    pend = null; closeReels(); save(); recalc(); return;
  }
  snap(pend.a.t.name + 'の結果');
  const a = pend.a, ov = vals && vals.constructor === Object ? vals : null;
  // 「今の会心!」用に、叩く前の値・見当を残す(会心だったと後から言われたら、ここから絞り直す)
  s.lastHit = { name: a.t.name, cells: pend.per.map(p => ({ j: p.j, v0: s.v[p.j], bel0: s.bel[p.j].slice(), rs: GM.hitParams(G, s, a.t, p.j).rs })) };
  const hsCrit = s.hs === 2;      // 必殺の後に叩いたマスは全部会心。会心かどうか見分けられなくても、会心として理想値を絞る
  for(const p of pend.per){
    const w = ov && Number.isFinite(ov[p.j]) ? ov[p.j] : p.its[pend.sel[p.j]].w, z = G.cells[p.j];
    if(hsCrit){
      s.bel[p.j] = GM.critBelief(z, s.v[p.j], w, s.bel[p.j], GM.hitParams(G, s, a.t, p.j).rs);
    } else {
      // 選んだ値になる結果(会心あり・なし)を確率で混ぜて、理想値の見込みを更新する
      const hit = p.outs.filter(o => o.w === w);
      let tot = 0; const bel = new Array(s.bel[p.j].length).fill(0);
      for(const o of hit){ tot += o.p; for(let q = 0; q < bel.length; q++) bel[q] += o.p * o.bel[q]; }
      if(tot > 0) s.bel[p.j] = bel.map(x => x / tot);
    }
    s.v[p.j] = w;
    const lc = s.lastHit.cells.find(c => c.j === p.j); if(lc){ lc.w = w; lc.done = hsCrit; }
    if(GM.overDead(G, p.j, w)) s.dead = true;
  }
  GM.afterAct(G, s, a, null);      // 集中力・温度。光るマスは候補の一覧になる(盤面で選ぶ)
  if(hsCrit) markCrit(pend.per.map(p => p.j));
  closeReels(); save();
  if(!askRet()) recalc();
}
