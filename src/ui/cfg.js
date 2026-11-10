// ---- 自分の条件 ----
let offDraft = [];
function renderTechs(){
  $('cfT').innerHTML = TECH_LIST.map(t => {
    const off = offDraft.includes(t.id), fix = t.id === 'tataku';
    return `<button type="button" data-id="${t.id}" class="${off ? 'off' : ''}"${fix ? ' disabled' : ''} aria-pressed="${!off}">${t.name}<small>Lv${t.lv}</small></button>`;
  }).join('');
}
$('cfT').addEventListener('click', e => {
  const b = e.target.closest('button'); if(!b || b.disabled) return;
  const id = b.dataset.id, k = offDraft.indexOf(id);
  if(k >= 0) offDraft.splice(k, 1); else offDraft.push(id);
  renderTechs();
});
// 入れ方(リール / ボタン)。「決める」で保存する
let inDraft = 'reel';
function renderIn(){ $('cfIn').querySelectorAll('button').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.v === inDraft))); }
$('cfIn').addEventListener('click', e => { const b = e.target.closest('button'); if(!b) return; inDraft = b.dataset.v === 'btn' ? 'btn' : 'reel'; renderIn(); });
// 戻りの記録をコピー(JSON)
function retLog(){ try{ const a = JSON.parse(localStorage.getItem(RETLOG) || '[]'); return Array.isArray(a) ? a : []; }catch(e){ return []; } }
function renderRetLogB(){ $('retLogB').textContent = `戻りの記録をコピー(${retLog().length}件)`; }
$('retLogB').onclick = async () => {
  const t = JSON.stringify(retLog());
  let ok = false;
  try{ await navigator.clipboard.writeText(t); ok = true; }catch(e){
    try{ const ta = document.createElement('textarea'); ta.value = t; ta.style.position = 'fixed'; ta.style.opacity = '0'; document.body.appendChild(ta); ta.select(); ok = document.execCommand('copy'); ta.remove(); }catch(e2){ ok = false; }
  }
  toast(ok ? `戻りの記録をコピーした(${retLog().length}件)` : 'コピーできなかった');
};
function openCfg(){ $('cfF').value = cfg.focus; offDraft = offList().slice(); inDraft = cfg.input === 'btn' ? 'btn' : 'reel'; renderIn(); renderRetLogB(); renderTechs(); $('cfgM').classList.add('show'); setTimeout(() => $('cfF').select(), 50); }
$('cfgB2').onclick = openCfg;
// 使う技のボタン: 同じ画面を開いて、技の一覧まで送る
$('techB').onclick = () => { openCfg(); setTimeout(() => { $('cfT').scrollIntoView({ block: 'start' }); $('cfF').blur(); }, 80); };
$('cfgCancel').onclick = () => { $('cfgM').classList.remove('show'); if(!cfgSaved) saveCfg(); };   // 初めての時にやめたら、今の値のまま次から聞かない
$('cfgM').onclick = $('cfgCancel').onclick;
$('cfgOk').onclick = () => {
  const f = parseInt($('cfF').value, 10);
  if(!(f >= 1 && f <= 999)) return;
  const fresh = !hist.length && s.first;                  // まだ打っていなければ、新しい集中力で始め直す
  cfg = { focus: f, off: offDraft.slice(), input: inDraft, size: cfg.size }; saveCfg();
  $('cfgM').classList.remove('show');
  G = mkG(item); net = loadNet(item);
  if(fresh) s = GM.newState(G);
  save(); recalc();
};

// ---- スマホ: 鍛冶の間は画面を消さない(対応していない所では何もしない) ----
let wake = null;
async function keepAwake(){
  try{ if(!wake && navigator.wakeLock && document.visibilityState === 'visible'){ wake = await navigator.wakeLock.request('screen'); wake.addEventListener('release', () => { wake = null; }); } }catch(e){ wake = null; }
}
document.addEventListener('pointerdown', keepAwake, { passive: true });
document.addEventListener('visibilitychange', () => { if(document.visibilityState === 'visible') keepAwake(); });

$('vB').onclick = () => {
  voiceOn = !voiceOn; try{ localStorage.setItem(VOICE_KEY, voiceOn ? '1' : '0'); }catch(e){}
  renderVoice();
  if(voiceOn){ VC.saidKey = null; VC.chain = null; announce(true); } else vStop();
};
renderVoice();
$('vRate').value = String(voiceRate);
$('power').value = power;
$('power').onchange = e => { const v = e.target.value; power = v === 'max' || v === 'strong' || v === 'maxTest' || v === 'maxGpu' ? v : 'normal'; try{ localStorage.setItem(POWER_KEY, power); }catch(e2){} if(power !== 'normal' && window.KajiPool) KajiPool.start(); net = loadNet(item); recalc(); };
$('vRate').onchange = e => { setVoiceRate(+e.target.value); VC.saidKey = null; announce(true); };
// 必殺の状態を手で切り替える(なし → たまった → 効果中 → なし)。戻すで戻せる
$('critB').onclick = () => pressCrit();
$('hsB').onclick = () => { if(pend) return; snap(); s.hs = ((s.hs | 0) + 1) % 3; save(); recalc(); };

function doReset(){ s = GM.newState(G); hist = []; pend = null; save(); recalc(); }
// 画面の「最初から」は確かめてから(押し間違いで局が消えないように)。外から呼ぶ reset は確かめない
// 画面の「最初から」: 確認は出さない。今の局を「戻す」の履歴に積んでおくので、押し間違えても「戻す」1回で戻る
function askReset(){ if(!hist.length && !s.dead){ doReset(); return; } snap('最初から'); const h = hist; doReset(); hist = h; save(); toast('最初からにした。「戻す」で元の局'); }
