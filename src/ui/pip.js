// ---- 小窓(PC の Chrome・Edge。いつも最前面に出る。ゲームの上に重ねて、どの技でどこを打つかを見る) ----
let pipW = null;
const PIP_CSS = `:root{--k:1}
body{margin:0;background:#0f1115;color:#f4f6f9;font:calc(15px * var(--k))/1.35 system-ui,"Hiragino Sans","Yu Gothic UI",sans-serif;padding:6px 8px;user-select:none}
.nm{font-size:calc(24px * var(--k));font-weight:800;color:#ff9447;line-height:1.15}.tg{font-size:calc(18px * var(--k));font-weight:800;margin-left:6px}
.st{display:flex;align-items:center;gap:6px;flex-wrap:wrap;font-size:calc(13px * var(--k));color:#adb6c5;font-weight:700;margin:2px 0 5px}.st b{color:#f4f6f9;font-size:calc(15px * var(--k))}
.bd{display:grid;gap:5px;margin-bottom:6px}.c{border:2px solid #566074;border-radius:8px;background:#20242c;text-align:center;padding:1px 2px 2px}
.c .t{display:flex;align-items:baseline;justify-content:center;gap:6px;flex-wrap:wrap}
.c .v{font-size:calc(22px * var(--k));font-weight:800;font-variant-numeric:tabular-nums;line-height:1.15}.c .zn{font-size:calc(13px * var(--k));color:#adb6c5;font-weight:700;font-variant-numeric:tabular-nums;line-height:1.15}.c .l{font-size:calc(13px * var(--k));color:#adb6c5;font-weight:700}
.c.in{border-color:#3fd98b}.c.in .v{color:#3fd98b}.c.ov{border-color:#ff6b6b}
.c.hit{border-color:#ff7a14;background:#5a2a08;box-shadow:0 0 0 2px #ff7a14}.c.hit .l{color:#ffb070}
.c.lit{outline:2px solid #ffcf5c}.c.pick{cursor:pointer;outline:3px dashed #ffcf5c}.c.gap{visibility:hidden}
button{font:inherit;font-weight:800;width:100%;min-height:44px;border-radius:8px;border:1px solid #b84d00;background:#ff7a14;color:#fff;cursor:pointer;font-size:calc(16px * var(--k))}
.row{display:flex;gap:6px}.row button+button{flex:none;width:auto;padding:0 12px}
.lw{background:#5a1414;border:2px solid #ff6b6b;color:#fff;font-size:calc(14px * var(--k));font-weight:800;border-radius:8px;padding:2px 8px;margin:2px 0 5px}
.hs{font-size:calc(13px * var(--k));font-weight:800;border:1px solid #566074;border-radius:6px;padding:1px 8px;cursor:pointer;color:#adb6c5;background:#20242c}
.hs.hs1{color:#0f1115;background:#5fd3ff;border-color:#5fd3ff;box-shadow:0 0 10px rgba(95,211,255,.6)}.hs.hs2{color:#0f1115;background:#ff9a3c;border-color:#ff9a3c}
.pw{display:grid;grid-template-columns:minmax(0,1fr) 124px;gap:8px;align-items:start}.pw.one{grid-template-columns:1fr}
.hy .ah{font-size:13px;color:#adb6c5;font-weight:700;margin-bottom:3px;text-align:center}
.hyr{display:flex;flex-direction:column;gap:4px}.hb{border:2px solid;border-radius:8px;background:#20242c;padding:1px 3px;text-align:center}
.hb .hr{display:flex;flex-wrap:wrap;justify-content:center;align-items:baseline;column-gap:5px}
.hb .hv{font-size:calc(17px * var(--k));font-weight:800;font-variant-numeric:tabular-nums;line-height:1.15;white-space:nowrap}.hb .hl{font-size:13px;font-weight:800;color:#ffcf5c;font-variant-numeric:tabular-nums;white-space:nowrap}
.hb .hn{font-size:13px;color:#adb6c5;font-weight:700;line-height:1.2;letter-spacing:-.03em;font-feature-settings:'palt';display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}
.hy.lit .hn{-webkit-line-clamp:1}
.ck{font-size:calc(13px * var(--k));font-weight:800;color:#ffd166;margin:0 0 5px}
.sw{background:#20242c;border:1px solid #566074;color:#adb6c5;white-space:nowrap;padding:0 10px;font-size:calc(14px * var(--k))}.sw.on{border:2px solid #ff7ad1;color:#f4f6f9}
.dl{font-size:calc(13px * var(--k));font-weight:700;color:#adb6c5;margin:0 0 4px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.dl b{color:#f4f6f9;margin-right:6px}
.ih{font-size:calc(17px * var(--k));font-weight:800;color:#ff9447;margin:0 0 5px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.ih.ret{color:#58a6ff}.ih small{font-size:calc(13px * var(--k));color:#adb6c5;margin-left:6px}
.ch{display:grid;gap:4px;margin:0 0 6px}.chp{min-height:44px;padding:0 2px;background:#20242c;border:1px solid #566074;color:#f4f6f9;line-height:1.1;font-size:calc(13px * var(--k))}
.chp b{display:block;font-size:calc(16px * var(--k));font-variant-numeric:tabular-nums}.chp.cur{border:2px solid #ff7a14;box-shadow:0 0 0 2px rgba(255,122,20,.45)}.ret .chp.cur{border-color:#58a6ff;box-shadow:0 0 0 2px rgba(88,166,255,.45)}.chp.rc{border-style:dashed;border-color:#58a6ff}.chp.done b{color:#3fd98b}.chp:disabled{opacity:.4}
.pv{display:grid;gap:5px;margin:0 0 6px}.pv button{min-height:48px;padding:0;font-size:calc(19px * var(--k));font-variant-numeric:tabular-nums;background:#090b0e;border:1px solid #3c4353;color:#f4f6f9}
.pv button.zn{background:#123a26;border-color:#3fd98b;color:#d9ffe9}.pv button.c{border-color:rgba(255,122,209,.5)}.pv button.top{border:2px solid #ff9447}
.pv button.ov{color:#ff6b6b;text-decoration:line-through}.pv button.on{box-shadow:0 0 0 2px #f4f6f9}
.no{background:#272c36;border-color:#566074;color:#f4f6f9}
.bd.aim .c:not(.hit){opacity:.4;filter:saturate(.55)}.bd.aim .c.hit{border-width:3px;animation:aimP 1.2s ease-in-out infinite}
@keyframes aimP{0%,100%{box-shadow:0 0 0 2px #ff7a14}50%{box-shadow:0 0 0 5px rgba(255,122,20,.6),0 0 14px rgba(255,122,20,.6)}}
body.hsfx::after{content:'';position:fixed;inset:0;pointer-events:none;z-index:9;background:radial-gradient(ellipse at 50% 45%,rgba(255,150,40,0) 50%,rgba(255,130,30,.2) 82%,rgba(255,110,20,.36) 100%);box-shadow:inset 0 0 26px rgba(255,140,40,.55);animation:hsHaze 2.6s ease-in-out infinite}
@keyframes hsHaze{0%,100%{opacity:.55}50%{opacity:1}}
@media (prefers-reduced-motion:reduce){.bd.aim .c.hit,body.hsfx::after{animation:none}}`;
async function openPip(){
  if(pipW){ pipW.focus(); return; }
  try{ pipW = await documentPictureInPicture.requestWindow({ width: 380, height: 420 }); }catch(e){ return; }
  const st = pipW.document.createElement('style'); st.textContent = PIP_CSS; pipW.document.head.appendChild(st);
  pipW.document.title = '鍛冶ナビ';
  pipW.addEventListener('pagehide', () => { pipW = null; });
  renderPip();
}
// 小窓の右の早見: 今の温度で、伸びが同じ技をまとめて、弱い順に上から並べる(最小〜最大。光ったマスがある時は光ったマスの伸びも)
const HY_COL = ['#8fb8ff', '#5fd3c4', '#8fe36b', '#ffd24a', '#ff9a3d', '#ff6b6b', '#ff7ad1'];
function hayamiHtml(){
  if(!G || !s || s.temp <= 0) return '';
  const lit = typeof s.lit === 'number' && G.trait === 'hikari', seen = new Set(), grp = new Map();
  for(const a of G.acts){
    const t = a.t; if(!t.area || t.hs || seen.has(t.id)) continue; seen.add(t.id);
    const r = C.rolls(t.id, s.temp, C.powerMult(G.trait, s.temp, false, s.first)); if(!r || !r.length) continue;
    const lo = Math.min(...r), hi = Math.max(...r), k = lo + '-' + hi;
    if(!grp.has(k)){
      const rl = lit ? C.rolls(t.id, s.temp, C.powerMult(G.trait, s.temp, true, s.first)) : null;
      grp.set(k, { lo, hi, ll: rl && rl.length ? Math.min(...rl) : null, lh: rl && rl.length ? Math.max(...rl) : null, names: [] });
    }
    grp.get(k).names.push(t.name.replace(/打ち$/, ''));
  }
  const L = [...grp.values()].sort((a, b) => a.lo - b.lo || a.hi - b.hi);
  if(!L.length) return '';
  const blocks = L.map((g, k) => {
    const c = HY_COL[Math.round(k * (HY_COL.length - 1) / Math.max(1, L.length - 1))];
    return `<div class="hb" style="border-color:${c}"><div class="hr"><span class="hv" style="color:${c}">${g.lo}〜${g.hi}</span>`
      + (lit && g.ll !== null ? `<span class="hl">光${g.ll}〜${g.lh}</span>` : '') + `</div><div class="hn">${g.names.join('・')}</div></div>`;
  }).join('');
  return `<div class="hy${lit ? ' lit' : ''}"><div class="ah">早見 ${s.temp}℃</div><div class="hyr">${blocks}</div></div>`;
}
// 小窓の入力: 叩いた後の値・戻りの値を小窓だけで入れる(本画面の入れ方がリールでもボタンで入れる)。確定は本画面と同じ pickVal → commitReels。
// 「会心が出た」スイッチも本画面と同じ物(direct.js の critSw)
function pipInput(d){
  const ret = !!pend.ret, tgs = pend.per.map(p => p.j).sort((a, b) => a - b);
  if(!ret && !tgs.includes(pend.cur)) pend.cur = tgs.find(i => !(pend.filled && pend.filled[i])) ?? tgs[0];
  const j = ret ? pend.per[0].j : pend.cur, p = pend.per.find(x => x.j === j);
  if(!p || !p.its) return '';
  const n = tgs.length, k = tgs.indexOf(j) + 1;
  const title = ret ? `<div class="ih ret">戻り ${posName(j)}<small>${s.v[j]} → 減った後(点線は予想)</small></div>`
    : `<div class="ih">${pend.a.t.name} ${posName(j)}<small>${n > 1 ? `${k}/${n}・` : ''}今 ${s.v[j]} → 叩いた後</small></div>`;
  // マスの並び: 何マスの時は叩くマス(押すと選び直せる)、戻りは減ったマス(違ったら押して選び直す)
  const cells = ret ? G.active.slice().sort((a, b) => a - b) : n > 1 ? tgs : [];
  const ch = cells.length ? `<div class="ch" style="grid-template-columns:repeat(${cells.length},1fr)">` + cells.map(i => {
      const f = !ret && pend.filled && pend.filled[i], q = pend.per.find(x => x.j === i);
      const v = ret ? s.v[i] : f ? q.its[pend.sel[i]].w : '?';
      return `<button class="chp${i === j ? ' cur' : ''}${f ? ' done' : ''}${ret && i === pend.retPred ? ' rc' : ''}" data-j="${i}">${posName(i)}<b>${v}</b></button>`; }).join('') + '</div>' : '';
  const nv = p.its.length, cols = nv <= 15 ? 5 : nv <= 24 ? 6 : 7;
  const mode = valMode(pend, p);
  const vals = valBtns(p, 'pv', pend, mode).replace('<div class="pv">', `<div class="pv" style="grid-template-columns:repeat(${cols},1fr)">`);
  const ok = !ret && n > 1 ? `<button id="pOk"${tgs.every(i => pend.filled && pend.filled[i]) ? '' : ' disabled style="opacity:.45"'}>決定</button>` : '';
  const sw = mode ? `<button class="sw${mode === 'c' ? ' on' : ''}" id="pSw" role="switch" aria-checked="${mode === 'c'}" style="flex:none;width:auto">会心が出た</button>` : '';
  return `<div class="pin${ret ? ' ret' : ''}">${title}${ch}${vals}<div class="row"><button class="no" id="pCancel" style="flex:1">やめる</button>${sw}${ok ? ok.replace('<button id="pOk"', '<button id="pOk" style="flex:1;width:auto"') : ''}</div></div>`;
}
function renderPip(){
  if(!pipW || !G || !s) return;
  const d = pipW.document, a = qs && qs[0] && qs[0].a, picking = Array.isArray(s.lit);
  d.documentElement.style.setProperty('--k', String(sizeK()));
  // 商材の選ぶ欄・ほかの手・今の会心! は小窓には出さない(本画面には残す)。押す物は残しておく(隠す)
  const hidden = `<div hidden><select class="it" id="pItem" aria-label="商材">${$('item').innerHTML}</select>${critCells().length ? '<button id="pCrit">今の会心!</button>' : ''}<div class="alts">${
    qs && qs[0] && a && !picking && !s.dead && !busy && !(s.hs === 1 && qs[0].hsPick) ? qs.slice(1, 3).map((x, k) => `<button class="alt" data-k="${k + 1}">${actName(x.a)} ${tgName(x.a)} <b>${pct(x.q2 !== undefined ? x.q2 : x.q)}</b></button>`).join('') : ''}</div></div>`;
  const wire = () => {
    const pi = d.getElementById('pItem'); pi.value = item;
    pi.onchange = () => { $('item').value = pi.value; setItem(pi.value, false); };
    d.querySelectorAll('.alt').forEach(b => b.onclick = () => startAct(qs[+b.dataset.k].a));
    const pc = d.getElementById('pCrit'); if(pc) pc.onclick = () => pressCrit();
  };
  d.body.classList.toggle('hsfx', (s.hs | 0) === 2);
  if(pend && pend.per && pend.per.length){
    d.body.innerHTML = pipInput(d) + hidden; wire();
    d.querySelectorAll('.pv button').forEach(b => b.onclick = () => pickVal(pend.ret ? pend.per[0].j : pend.cur, +b.dataset.k));
    d.querySelectorAll('.chp[data-j]').forEach(b => b.onclick = () => { const i = +b.dataset.j;
      if(pend.ret){ if(i !== pend.per[0].j){ setRetCell(i); renderRet(); } return; }
      setCur(i); });
    d.getElementById('pCancel').onclick = () => closeReels();
    const sw = d.getElementById('pSw'); if(sw) sw.onclick = () => { critSw = critOn(pend.a, pend.cur) ? null : critKey(pend.a, pend.cur); renderFoot(); };
    const ok = d.getElementById('pOk'); if(ok) ok.onclick = () => { if(pend && pend.per.every(p => pend.filled && pend.filled[p.j])) commitReels(); };
    return;
  }
  const tg = a && a.t.area && !picking ? a.tg : [];
  let head;
  if(picking) head = '<div class="nm">光ったマスを選ぶ</div>';
  else if(s.dead) head = '<div class="nm" style="color:#ff6b6b">ゾーンを超えた</div>';
  else if(busy || !qs) head = '<div class="nm" style="color:#adb6c5">計算中…</div>';
  else if(!a) head = '<div class="nm">仕上げる</div>';
  else head = `<div><span class="nm">${a.t.name}</span><span class="tg">${tgName(a)}</span></div>`;
  const cols = [0, 1].filter(c => G.cells.some((z, i) => z && i % 2 === c));
  let h = `<div class="bd${tg.length && !s.dead ? ' aim' : ''}" style="grid-template-columns:repeat(${cols.length},1fr)">`;
  for(const r of rowList()) for(const c of cols){
    const i = 2*r + c, z = G.cells[i];
    if(!z){ h += '<div class="c gap"></div>'; continue; }
    const v = s.v[i], cls = ['c', v > z[1] ? 'ov' : v >= z[0] ? 'in' : '', tg.includes(i) ? 'hit' : '', s.lit === i ? 'lit' : '', picking && s.lit.includes(i) ? 'pick' : ''].join(' ');
    h += `<div class="${cls}" data-i="${i}"><div class="t"><span class="l">${posName(i)}${tg.includes(i) ? '◀' : ''}</span><span class="v">${v}</span></div><div class="zn">${pipBel(i, z)}</div></div>`;
  }
  h += '</div>';
  const lw = a && !picking && qs ? litWarn(a) : '';
  const hsv = s.hs | 0;
  // 必殺は帯にせず、温度・集中力の行の小さい印(押すと なし → たまった → 効果中)
  const hsMark = `<span class="hs${hsv ? ' hs' + hsv : ''}" id="pHs" role="button" aria-label="必殺の状態を切り替える">必殺:${HS_LABEL[hsv]}</span>`;
  // 会心にしたマスの印(必殺の後・「会心が出た」で入れた後)
  const critRow = critLine();
  // 叩く手のじか入れ(入れ方: ボタン): 「打った」の代わりに値ボタンを出す(値を押す = 打った+結果)。何マスの技は1マス目から
  const X = a && a.t.area && isBtn() && !picking && !busy && qs && !s.dead ? previewOf(a) : null;
  let btn = '', wide = false;
  if(X){
    const p = X.per.find(x => x.j === X.cur), mode = valMode(X, p), nv = p.its.filter(x => mode === 'n' ? x.tag !== 'c' : mode === 'c' ? x.tag !== 'n' : true).length;
    wide = nv > 10 || X.per.length > 1;       // 値が多い時・何マスの技は早見をしまって、横いっぱいに並べる(420px に収める)
    btn = (X.per.length > 1 ? `<div class="dl"><b>${posName(X.cur)}</b>叩いた後の値を押す</div>` : '')
      + valBtns(p, 'pv', X, mode).replace('<div class="pv">', `<div class="pv" id="pDv" style="grid-template-columns:repeat(${wide ? 7 : 5},1fr)">`)
      + (mode ? `<div class="row" style="justify-content:flex-end"><button class="sw${mode === 'c' ? ' on' : ''}" id="pSw" role="switch" aria-checked="${mode === 'c'}" style="width:auto">会心が出た</button></div>` : '');
  }
  else if(a && !picking && !busy && qs && !s.dead) btn = `<div class="row"><button id="pGo">打った</button>${!a.t.area && chainN > 1 ? `<button id="pChain">×${chainN}</button>` : ''}</div>`;
  const main = head + (lw ? `<div class="lw">${lw}</div>` : '') + `<div class="st"><span>温度 <b>${s.temp}</b>℃</span><span>集中力 <b>${s.F}</b></span>${hsMark}</div>` + critRow + h + btn;
  const hy = wide ? '' : hayamiHtml();      // 早見は右に並べる(下だと見にくい)
  d.body.innerHTML = `<div class="pw${hy ? '' : ' one'}"><div class="pm">${main}</div>${hy}</div>` + hidden;
  wire();
  const go = d.getElementById('pGo'); if(go) go.onclick = () => startAct(a);
  if(X){
    d.querySelectorAll('#pDv button').forEach(b => b.onclick = () => directPick(X, X.cur, +b.dataset.k));
    const sw = d.getElementById('pSw'); if(sw) sw.onclick = () => { critSw = critOn(X.a, X.cur) ? null : critKey(X.a, X.cur); renderFoot(); };
  }
  d.getElementById('pHs').onclick = () => $('hsB').click();     // 本画面の「必殺」と同じ(なし → たまった → 効果中)
  const ch = d.getElementById('pChain'); if(ch) ch.onclick = () => applyChain(a, chainN);
  if(picking) d.querySelectorAll('.c.pick').forEach(e => e.onclick = () => pickLit(+e.dataset.i));
}
