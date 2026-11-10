$('reset').onclick = askReset;
if('documentPictureInPicture' in window){ $('pipB').hidden = false; $('pipRow').hidden = false; $('pipB').onclick = () => { $('setM').classList.remove('show'); openPip(); }; }
// ---- 設定(⚙): 声・計算の強さ・大きさ・最初の値・使う技・小窓・戻りの記録・最初から・説明 ----
function renderSize(){ $('sizeSeg').querySelectorAll('button').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.v === (cfg.size || 'm')))); }
function openSet(){ renderSize(); renderRetLogB(); $('setM').classList.add('show'); }
$('gearB').onclick = openSet;
$('setClose').onclick = () => $('setM').classList.remove('show');
$('setM').onclick = $('setClose').onclick;
$('sizeSeg').addEventListener('click', e => { const b = e.target.closest('button'); if(!b) return; cfg.size = SIZE_K[b.dataset.v] ? b.dataset.v : 'm'; saveCfg(); applySize(); renderSize(); renderPip(); requestAnimationFrame(fitFoot); });
$('undo').onclick = () => { if(!hist.length){ toast('これ以上は戻せない'); return; } s = hist.pop(); const u = s._u; delete s._u; pend = null; save(); recalc(); toast('戻した: ' + u); };
$('item').innerHTML = ITEM_ORDER.filter(k => GM.ITEMS[k]).map(k => `<option value="${k}">${GM.ITEMS[k].name}${W[k] ? '' : GM.ITEMS[k].T === 0 ? '(仮の計算)' : '(準備中)'}</option>`).join('');
$('item').onchange = e => setItem(e.target.value, false);
