function playRate(){ return Math.max(0.5, Math.min(2.5, voiceRate / ((typeof AR_CLIP_INFO !== 'undefined' && AR_CLIP_INFO.speed) || CLIP_BASE))); }
function setVoiceRate(r){ if(!(r >= 0.6 && r <= 2.5)) return; voiceRate = r; try{ localStorage.setItem(RATE_KEY, String(r)); }catch(e){} const el = $('vRate'); if(el) el.value = String(r); }
const VC = { ctx: null, buf: new Map(), src: null, el: null, seq: 0, primed: false, saidKey: null, chain: null, log: [] };
const SILENT_WAV = 'data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQAAAAA=';
function vUnlock(){
  try{ if(navigator.audioSession) navigator.audioSession.type = 'playback'; }catch(e){}
  try{
    if(!VC.ctx){ const AC = window.AudioContext || window.webkitAudioContext; if(AC) VC.ctx = new AC(); }
    if(VC.ctx){
      if(VC.ctx.state !== 'running') VC.ctx.resume().catch(() => {});
      const b = VC.ctx.createBuffer(1, 1, 22050), src = VC.ctx.createBufferSource();
      src.buffer = b; src.connect(VC.ctx.destination); src.start(0);
    }
  }catch(e){}
  // 予備: audio 要素も触った時に1回鳴らしておく(Web Audio で流せなかった時に使う)
  try{ if(!VC.el){ VC.el = new Audio(); VC.el.playsInline = true; } if(!VC.primed){ VC.el.src = SILENT_WAV; const p = VC.el.play(); if(p && p.catch) p.catch(() => {}); VC.primed = true; } }catch(e){}
}
['pointerdown', 'touchend', 'click', 'keydown'].forEach(ev => document.addEventListener(ev, vUnlock, { passive: true, capture: true }));
function clipBytes(text){ const b = atob(AR_CLIPS[text]), u = new Uint8Array(b.length); for(let i = 0; i < b.length; i++) u[i] = b.charCodeAt(i); return u; }
function clipBuf(text){
  if(VC.buf.has(text)) return VC.buf.get(text);
  const u = clipBytes(text);
  const p = new Promise((res, rej) => { try{ const r = VC.ctx.decodeAudioData(u.buffer, res, rej); if(r && r.then) r.then(res, rej); }catch(e){ rej(e); } });
  VC.buf.set(text, p); p.catch(() => VC.buf.delete(text));
  return p;
}
function vStop(){
  VC.seq++;
  try{ if(VC.src){ VC.src.stop(); VC.src = null; } }catch(e){}
  try{ if(VC.el && !VC.el.paused) VC.el.pause(); }catch(e){}
  try{ if(window.speechSynthesis && (speechSynthesis.speaking || speechSynthesis.pending)) speechSynthesis.cancel(); }catch(e){}
}
async function vSay(text){
  VC.log.push(text); if(VC.log.length > 40) VC.log.shift();
  if(!voiceOn) return;
  vStop();
  const seq = VC.seq, clip = typeof AR_CLIPS !== 'undefined' && AR_CLIPS[text], pr = playRate();
  // 速さを変える時は、まず audio 要素(声の高さを変えずに速くできる)。最初に触った時に鳴らしてあるのでスマホでも流せる
  if(clip && VC.el && Math.abs(pr - 1) > 0.01){
    try{
      const old = VC.url; VC.url = URL.createObjectURL(new Blob([clipBytes(text)], { type: 'audio/mpeg' })); if(old) URL.revokeObjectURL(old);
      VC.el.src = VC.url; VC.el.preservesPitch = true; VC.el.webkitPreservesPitch = true;
      VC.el.defaultPlaybackRate = pr; VC.el.playbackRate = pr;
      await VC.el.play(); VC.el.playbackRate = pr; VC.how = 'audio'; return;
    }catch(e){}
    if(seq !== VC.seq) return;
  }
  if(clip && VC.ctx){
    try{
      if(VC.ctx.state !== 'running') await VC.ctx.resume();
      const b = await clipBuf(text);
      if(seq !== VC.seq) return;
      const src = VC.ctx.createBufferSource(); src.buffer = b; src.playbackRate.value = pr; src.connect(VC.ctx.destination); src.start(0); VC.src = src;
      VC.how = 'webaudio'; return;
    }catch(e){}
  }
  if(seq !== VC.seq) return;
  if(clip && VC.el){
    try{
      const old = VC.url; VC.url = URL.createObjectURL(new Blob([clipBytes(text)], { type: 'audio/mpeg' })); if(old) URL.revokeObjectURL(old);
      VC.el.src = VC.url; VC.el.defaultPlaybackRate = pr; VC.el.playbackRate = pr; await VC.el.play(); VC.how = 'audio'; return;
    }catch(e){}
  }
  // 録った声(ずんだもん)が無い文は読まない(ブラウザの合成音声は使わない。利用者がずんだもん以外の声を嫌がった)
}
// 読み上げの文(収録した文と同じ言い方)
const YOMI = { tataku: 'たたく', jouge: 'じょうげうち', tekagen: 'てかげんうち', nibai: 'にばいうち', karyoku: 'かりょくあげ',
  yonren: 'よんれんうち', sanbai: 'さんばいうち', nerai: 'ねらいうち', chouyon: 'ちょうよんれんうち', hiyashi: 'ひやしこみ',
  naname: 'ななめうち', neppuu: 'ねっぷうおろし', jgnerai: 'じょうげねらいうち', jakunerai: 'じゃくねらいうち', sayuu: 'さゆううち',
  hissatsu: 'ひっさつ' };
function rowList(){ return [...new Set(G.active.map(j => Math.floor(j / 2)))].sort((a, b) => a - b); }
function rowNm(r){ const rs = rowList(), k = rs.indexOf(r); return rs.length === 2 ? ['上', '下'][k] : rs.length === 3 ? ['上', '中', '下'][k] : rs.length === 1 ? '' : (k + 1) + '段目の'; }
function voicePlace(a){
  const t = a.t, tg = a.tg;
  if(!tg.length) return '';
  if(tg.length === 1) return posName(tg[0]);
  const rs = [...new Set(tg.map(i => Math.floor(i / 2)))], cs = [...new Set(tg.map(i => i % 2))], all = rowList();
  if(t.area === 'sq') return all.length > 2 ? rs.map(rowNm).join('と') + 'の段' : '';
  if(t.area === 'col') return (cs[0] === 0 ? '左' : '右') + 'の列' + (all.length > 2 ? '、' + rs.map(rowNm).join('と') : '');
  if(t.area === 'row') return (rowNm(rs[0]) || '') + 'の段';
  if(t.area === 'diag'){ const r = tg.find(i => i % 2 === 1), l = tg.find(i => i % 2 === 0); return posName(r) + 'と' + posName(l); }
  return tg.map(posName).join('と');
}
function moveText(a, n){ const p = voicePlace(a); return (YOMI[a.t.id] || a.t.name) + (p ? '、' + p : '') + (n > 1 ? `、${n}回` : ''); }
// 推奨が出たら読み上げる。同じ局面・同じ手は繰り返さない。火力上げが続く時も1手ずつ読む(回数は言わない)
function announce(force){
  if(!voiceOn || (window.NR && window.NR.on)) return;         // 画面読み取り中(自分用)は、読み取り側が読み上げる
  let text = null;
  const a = qs && qs[0] && qs[0].a;
  if(Array.isArray(s.lit)) text = '光ったマスを選んで';
  else if(s.dead || !qs) return;
  else if(!a) text = '全部入った。仕上げ';
  else text = moveText(a, 1);           // 回数は言わない(2回打った所で別の手に変わることがある。1手ずつ読む)
  const key = text + '|' + [s.temp, s.F, s.v.join(','), String(s.lit)].join('/');
  if(!force && key === VC.saidKey) return;
  VC.saidKey = key;
  VC.chain = null;
  vSay(text);
}
function renderVoice(){ $('vBt').textContent = voiceOn ? 'オン' : 'オフ'; $('vB').className = 'stat vbtn ' + (voiceOn ? 'on' : 'off'); }
