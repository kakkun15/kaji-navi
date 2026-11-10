if(restore()){ $('item').value = item; recalc(); }
else { $('item').value = item; setItem(item, false); }
// 初めて開いた人には、最初に開始の集中力を聞く(画面読み取りつきの版は読み取りで入るので聞かない)
if(!cfgSaved && !$('rdStart')) openCfg();
window.__navi = { get s(){ return s; }, get qs(){ return qs; }, get G(){ return G; }, get cfg(){ return cfg; }, get item(){ return item; }, get net(){ return net; },
  get hist(){ return hist; }, get busy(){ return busy; }, startAct, commitReels, get pend(){ return pend; },
  // 外から局面を書き換える(戻すで戻せる)。fn(s) の中で s を直接いじる
  mut(fn){ snap(); fn(s); pend = null; if($('reelM').classList.contains('show')) $('reelM').classList.remove('show'); save(); recalc(); },
  reset(F){ s = GM.newState(G); if(Number.isFinite(F)) s.F = F; hist = []; pend = null; save(); recalc(); },
  // 画面で見た打ち始めの集中力を覚える
  setStartFocus(f){ if(cfg.focus === f) return; cfg = { focus: f, off: cfg.off, input: cfg.input, size: cfg.size }; saveCfg(); G = mkG(item); net = loadNet(item); renderCfg(); },
  setHs(h){ if((s.hs | 0) === h) return; snap(); s.hs = h; save(); recalc(); },
  get power(){ return power; }, get lastCalc(){ return lastCalc; },
  setVoiceRate, get voiceRate(){ return voiceRate; }, get vel(){ return VC.el ? { rate: VC.el.playbackRate, pitch: VC.el.preservesPitch, src: !!VC.el.src } : null; },
  recalc, closeReels, say: vSay, moveText, get voiceOn(){ return voiceOn; }, get vlog(){ return VC.log; }, get vhow(){ return VC.how; } };
