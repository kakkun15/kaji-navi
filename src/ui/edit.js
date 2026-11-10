// ---- 光ったマス・手直し ----
$('board').addEventListener('click', e => {
  const c = e.target.closest('.cell'); if(!c || c.classList.contains('gap')) return;
  const i = +c.dataset.i;
  if(Array.isArray(s.lit)){ if(s.lit.includes(i)) pickLit(i); return; }
  askNum(`${posName(i)}の値`, s.v[i], v => { snap(`${posName(i)}の値の手直し`);
    // 必殺の効果中に値が増えた = 必殺の後のひと打ち(必ず会心)。ゾーン内なら理想値とみなし、必殺は使い終わり(2026-11-03)。
    // 複数マスの技の結果を1マスずつ直すこともあるので、次に集中力が減る(次の手を打つ)までは、ほかのマスの手直しも同じに扱う
    const z = G.cells[i], hsHit = (s.hs | 0) === 2 || s.hsEditF === s.F;
    if(hsHit && v > s.v[i] && v >= z[0] && v <= z[1]){ s.bel[i] = s.bel[i].map((_, q) => z[0] + q === v ? 1 : 0); s.hs = 0; s.hsEditF = s.F; markCrit([i], true); }
    // 値を直したら、前の値から絞った理想値の見当は当てにならないので、ゾーン全体の一様に戻す
    else if(v !== s.v[i]){ const n = z[1] - z[0] + 1; s.bel[i] = new Array(n).fill(1 / n);
      const lc = s.lastHit && s.lastHit.cells.find(c => c.j === i); if(lc && Number.isFinite(lc.w)) lc.w = v; }   // 「今の会心!」は直した値で絞る
    s.v[i] = v; s.dead = GM.overDead(G, i, v); s.first = false; save(); recalc(); });
});
$('stTemp').onclick = () => askNum('温度(℃)', s.temp, v => { snap('温度の手直し'); s.temp = Math.round(v / 50) * 50; s.first = s.first && s.temp === 1000; s.lit = null; s.last = null;
  if(G.trait === 'hikari' && !s.first && s.temp % 200 === 0){ const c = G.active.filter(i => s.v[i] < G.cells[i][0]); if(c.length) s.lit = c; }
  save(); recalc(); });
$('stFocus').onclick = () => askNum('今の集中力', s.F, v => { snap('集中力の手直し'); s.F = v; save(); recalc(); });
let numCb = null;
function askNum(t, v, cb){ $('numT').textContent = t; $('numI').value = v; numCb = cb; $('numM').classList.add('show'); setTimeout(() => $('numI').select(), 50); }
$('numOk').onclick = () => { const v = parseInt($('numI').value, 10); $('numM').classList.remove('show'); if(Number.isFinite(v) && v >= 0 && numCb) numCb(v); numCb = null; };
$('numCancel').onclick = () => { $('numM').classList.remove('show'); numCb = null; };
$('numM').onclick = $('numCancel').onclick;
$('reelOk').onclick = commitReels;
// シートの上の端の「リール ⇄ ボタン」: その場で入れ方を変えて保存する(cfg.input)
$('inTog').onclick = () => { cfg.input = isBtn() ? 'reel' : 'btn'; saveCfg(); if(pend) openReels(true); else renderInTog(); };
$('reelCancel').onclick = closeReels;
// 入力のシートは外(暗い所)を触っても閉じない(押し間違いで入れた値が消えないように)。閉じるのは「やめる」だけ
