// ---- 推奨手 ----
// 学習した見積もりが無い、許容誤差0の商材(光のさいほう針)は、仮の打ち方(rule0.js)で何回も打ってためして推奨を出す
function useRule(){ return !net && G && G.T === 0 && !!window.KajiRule0; }
// ---- 先に計算しておく(2026-11-01): 結果の決まっている手(火力上げ・冷やし込み)を打った後の局面と、光ったマスの候補ごとの局面を、
// 待っている間に最強で読んでおく。押した時・光ったマスが決まった時に、もう答えが出ている。読みの中身は同じ(同じ局面なら同じ答え)
const PRE = new Map(); PRE.hit = 0;
function usePool(){ return power !== 'normal' && !MAX_SKIP[item] && !s.hs && window.KajiPool && KajiPool.start(); }
function preKey(st){ return [item, power, overPen(), focusMargin(), G.focus, (G.techs || []).join(','), V.stateKey(st, G)].join('#'); }
// ---- 最強(GPU)(2026-11-01): 最強の2段目を GPU でまとめて読む(gpumax.js)。CPU の最強と同じ読み(乱数の引き方だけ違う)。
// ひだねだけ。WebGPU が無い・失敗した時は CPU の最強で読む
let GPUM = null, GPUM_KEY = '';
const GPU_ITEMS = ['hidane', 'pot'];     // GPU 最強が使える商材(6マス・光かたたき変化)
function gpuOk(){ return typeof navigator !== 'undefined' && !!navigator.gpu && !!window.KajiGPUMax && !!window.KAJI_GPU_WGSL && GPU_ITEMS.includes(item) && !!W[item]; }
function gpuMax(){
  if(!gpuOk()) return Promise.resolve(null);
  const k = [item, G.focus, (G.techs || []).join(',')].join('#');
  if(GPUM && GPUM_KEY === k) return GPUM;
  GPUM_KEY = k;
  GPUM = KajiGPUMax.create(window.KAJI_GPU_WGSL, W[item], G).catch(e => { console.error('GPU 最強', e); toast('GPU が使えなかったので、CPU の最強で読む'); return null; });
  return GPUM;
}
function maxFor(st, key){
  const e = PRE.get(key); if(e){ PRE.hit++; return e; }
  if(power === 'maxGpu' && gpuOk()){
    const o = Object.assign({}, MAXOPT, { overPen: overPen(), focusMargin: focusMargin() }), st2 = GM.cloneState(st), nt = net;
    const cpu = () => (KajiPool.start(), KajiPool.setNet(item, W[item]), KajiPool.evalMax({ item, level: G.level, hammer: G.hammer, star: G.star, focus: G.focus, techs: G.techs }, st2, Object.assign({}, o, { tag: key }))).then(r => { if(r) r.sort((a, b) => b.q2 - a.q2); return r; });
    // GPU が止まった(Windows の GPU のリセットなど)時は、次から作り直すことにして、この局面は CPU の最強で読む
    const p = gpuMax().then(g => g ? g.evalMax(st2, o, nt).then(r => { r.sort((a, b) => b.q2 - a.q2); return r; })
        .catch(e => { console.error('GPU 最強', e); if(GPUM_KEY) { GPUM = null; GPUM_KEY = null; toast('GPU が止まったので CPU で読む'); } return cpu(); })
      : cpu())
      .then(r => { if(!r) PRE.delete(key); return r; });
    PRE.set(key, p); if(PRE.size > 64) PRE.delete(PRE.keys().next().value);
    return p;
  }
  const cfgW = { item, level: G.level, hammer: G.hammer, star: G.star, focus: G.focus, techs: G.techs };
  KajiPool.setNet(item, isTest() ? W[item + '_test'] : W[item]);
  const p = KajiPool.evalMax(cfgW, GM.cloneState(st), Object.assign({}, power === 'strong' ? STRONGOPT : MAXOPT, { overPen: overPen(), focusMargin: focusMargin(), tag: key }))
    .then(r => { if(!r){ PRE.delete(key); return null; } r.sort((a, b) => b.q2 - a.q2); return r; });
  PRE.set(key, p); if(PRE.size > 64) PRE.delete(PRE.keys().next().value);
  return p;
}
function prefetch(st){
  if(!usePool() || st.dead || st.hs) return;
  if(Array.isArray(st.lit)){ for(const c of st.lit){ const t = GM.cloneState(st); t.lit = c; prefetch(t); } return; }
  if(st.temp <= 0 || !GM.hasLegal(G, st)) return;
  if(OPEN_BOOK[item] && OPEN_BOOK[item].includes(st.temp) && G.active.every(i => st.v[i] === 0)) return;   // 開幕の決め打ちは読まない
  maxFor(st, preKey(st));
}
function recalc(){
  qs = null; render();
  if(s.dead || Array.isArray(s.lit) || (!net && !useRule())) { if(!net && !useRule()) $('msg').textContent = 'この商材の計算はまだ無い'; if(Array.isArray(s.lit)){ announce(false); try{ prefetch(s); }catch(e){} } return; }
  busy = true; const id = ++calcId;
  setTimeout(() => {
    if(id !== calcId) return;
    if(useRule()){
      const res = KajiRule0.recommend(G, s, { n: 80, rnd: seeded(12345) });
      if(id !== calcId) return;
      lastCalc = null; finishCalc(id, res); return;
    }
    const sp = SEARCH[item] || { depth: 1 };
    const opt = { K: sp.K || 12, N2: sp.N2, K2: sp.K2, overPen: overPen(), focusMargin: focusMargin(), rnd: seeded(12345), buf: new Float32Array(V.featLen(G, net.ver)) };
    let res;
    if(!s.hs && OPEN_BOOK[item] && OPEN_BOOK[item].includes(s.temp) && G.active.every(i => s.v[i] === 0)){
      res = V.evalActs(net, G, s, opt); res.sort((a, b) => b.q - a.q);
      const k = res.find(x => x.a && x.a.t.id === 'karyoku');
      if(k){ res.splice(res.indexOf(k), 1); res.unshift(k); lastCalc = null; finishCalc(id, res); return; }
    }
    if(usePool()){
      // 最強: Worker に手分けして読ませる(待っている間も画面は動く)。先に計算してあればそれを使う(答えは同じ)
      const t0 = performance.now(), key = preKey(s);
      KajiPool.cancelQueued(key);           // 先に計算していた別の局面は取り消す(この局面の分は続ける)
      maxFor(s, key).then(r => {
        if(id !== calcId) return;
        if(!r){ recalc(); return; }        // 取り消された時はやり直す
        lastCalc = { ms: performance.now() - t0, threads: KajiPool.size, pre: PRE.hit };
        finishCalc(id, r.map(x => Object.assign({}, x)));
      });
      return;
    }
    if(s.hs){ res = V.evalActsHS(net, G, s, opt); }          // 必殺がからむ時は専用の読み(並べ替え済み)
    else if(sp.depth === 2){ res = V.evalActs2(net, G, s, opt); res.sort((a, b) => b.q2 - a.q2); }
    else { res = V.evalActs(net, G, s, opt); res.sort((a, b) => b.q - a.q); }
    if(id !== calcId) return;
    lastCalc = null;
    finishCalc(id, res);
  }, 30);
}
function finishCalc(id, res){
  {
    // 「仕上げる」が一番良い手と同じ見込みなら、仕上げる(打っても変わらないのに集中力を使うだけなので)。
    // 温度だけの技に加えて、叩く技も(2026-11-03: 全マス理想値ぴったり・見込み100% で、てかげん打ちを出していた。誤差7まで大成功なので叩いても100%のまま)。
    // 叩く技は、仕上げる見込みが 0 より大きい時だけ(全部0%の時に何もせずにやめないように)
    const qv = x => x.q2 !== undefined ? x.q2 : x.q, stop = res.find(x => !x.a);
    if(stop && res[0] !== stop && res[0].a && (!res[0].a.t.area || qv(stop) > 0) && qv(stop) >= qv(res[0]) - 1e-6){ res.splice(res.indexOf(stop), 1); res.unshift(stop); }
    // 余った集中力で火力上げ・冷やし込みを打つだけで、結局どこも叩かずに終わるなら、ここで仕上げる
    // 見込みがほぼ100%なのに火力上げ・冷やし込み(会心待ち)が1位なら、同じくらいの叩く技を先に出す(手数が増えて遅いので。2026-11-07)
    else if(res[0] && res[0].a && !res[0].a.t.area && qv(res[0]) >= 0.995 && res.find(x => x.a && x.a.t.area && qv(x) >= qv(res[0]) - 0.005)){
      const h = res.find(x => x.a && x.a.t.area && qv(x) >= qv(res[0]) - 0.005); res.splice(res.indexOf(h), 1); res.unshift(h);
    }
    else if(net && !s.hs) res = V.trimIdle(net, G, s, res, { overPen: overPen(), focusMargin: focusMargin(), buf: new Float32Array(V.featLen(G, net.ver)) });
    qs = res; busy = false; chainN = 0; render();
    // 一番良い手が火力上げ・冷やし込み(結果が決まっている)なら、打った後の局面を先に読んでおく
    try{ const b0 = res[0] && res[0].a; if(b0 && !b0.t.area && !b0.t.hs){ const t = GM.cloneState(s); GM.afterAct(G, t, b0, null); prefetch(t); } }catch(e){}
    if(window.__naviOnCalc) try{ window.__naviOnCalc(); }catch(e){}
    const b = res[0] && res[0].a;
    // 温度だけの技は、続けて何回打つかを数えてから読み上げる(「かりょくあげ、2回」)
    if(b && !b.t.area && !s.hs) setTimeout(() => { if(id !== calcId) return; chainN = calcChain(b); if(id === calcId){ renderFoot(); announce(false); } }, 20);
    else announce(false);
  }
}
