// ---- テスト中の記録をメモに書く(Chrome・Edge: 選んだフォルダに自動で書く。選べない時はこの端末に残す) ----
const TDB = { get(k){ return new Promise(res => { try{ const o = indexedDB.open('kajiNaviTest', 1); o.onupgradeneeded = () => o.result.createObjectStore('kv');
  o.onsuccess = () => { const r = o.result.transaction('kv').objectStore('kv').get(k); r.onsuccess = () => res(r.result); r.onerror = () => res(null); }; o.onerror = () => res(null); }catch(e){ res(null); } }); },
  set(k, v){ return new Promise(res => { try{ const o = indexedDB.open('kajiNaviTest', 1); o.onupgradeneeded = () => o.result.createObjectStore('kv');
  o.onsuccess = () => { const t = o.result.transaction('kv', 'readwrite'); t.objectStore('kv').put(v, k); t.oncomplete = () => res(true); t.onerror = () => res(false); }; o.onerror = () => res(false); }catch(e){ res(false); } }); } };
let tDir = null;
TDB.get('dir').then(h => { if(h){ tDir = h; renderTres(); } });
async function dirOk(ask){
  if(!tDir) return false;
  try{ let p = await tDir.queryPermission({ mode: 'readwrite' }); if(p !== 'granted' && ask) p = await tDir.requestPermission({ mode: 'readwrite' }); return p === 'granted'; }catch(e){ return false; }
}
async function pickDir(){
  if(!window.showDirectoryPicker){ toast('保存先は Chrome か Edge で選べる'); return false; }
  try{ tDir = await showDirectoryPicker({ id: 'kajiNaviLog', mode: 'readwrite' }); await TDB.set('dir', tDir); renderTres(); return true; }catch(e){ return false; }
}
async function appendFile(name, text){
  const fh = await tDir.getFileHandle(name, { create: true }), old = await (await fh.getFile()).text();
  const w = await fh.createWritable(); await w.write(old + text); await w.close();
}
function renderTres(){
  const on = isTest(); $('tres').hidden = !on; if(!on) return;
  $('tresN').textContent = ((s && s.tlog) ? s.tlog.length : 0) + '手';
  $('tresDir').textContent = tDir ? tDir.name : '未設定';
}
const pad = n => String(n).padStart(2, '0');
function memoText(res){
  const d = new Date(), L = s.tlog || [], b = qs && qs[0], q = b ? (b.q2 !== undefined ? b.q2 : b.q) : null;
  const head = `=== ${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())} ${GM.ITEMS[item].name} 最強(テスト中) 結果: ${res} ===\n`
    + `重み: ${(W[item + '_test'] && W[item + '_test'].src) || '試しの重み'} / 最初の集中力 ${cfg.focus} / ${L.length}手\n`;
  const lines = L.map((x, k) => `${String(k + 1).padStart(2)}. ${x.T}℃ 集中力${x.F} [${x.v.join(',')}]${x.lit !== null && x.lit !== undefined ? ' 光:' + (Array.isArray(x.lit) ? '選ぶ前' : posName(x.lit)) : ''}${x.hs ? ' 必殺' + x.hs : ''} 推奨 ${x.rec || '-'}${x.q !== null ? '(' + x.q + '%)' : ''} → ${x.label}`);
  return head + lines.join('\n') + `\n最後: ${s.temp}℃ 集中力${s.F} [${s.v.join(',')}]${q !== null ? ' 最後の見込み ' + (q * 100).toFixed(1) + '%' : ''}\n\n`;
}
async function finishTest(res){
  const d = new Date(), day = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const memo = memoText(res), rec = JSON.stringify({ at: d.toISOString(), item, power: 'maxTest', weights: (W[item + '_test'] && W[item + '_test'].src) || null, focus: cfg.focus, result: res, final: { T: s.temp, F: s.F, v: s.v }, moves: s.tlog || [] }) + '\n';
  let saved = false;
  if(!tDir) await pickDir();
  if(tDir && await dirOk(true)){ try{ await appendFile(`鍛冶ナビ記録_${day}.txt`, memo); await appendFile('鍛冶ナビ記録.jsonl', rec); saved = true; }catch(e){ saved = false; } }
  if(!saved){ try{ localStorage.setItem('kajiNaviTestLog', (localStorage.getItem('kajiNaviTestLog') || '') + rec); }catch(e){} }
  toast(saved ? `記録した(${res})。次の局へ` : `保存先に書けなかったので、この端末に残した(${res})`);
  doReset();
}
$('tresPick').onclick = () => pickDir();
document.querySelectorAll('#tres .tres-b button').forEach(bt => bt.onclick = () => finishTest(bt.dataset.r));
