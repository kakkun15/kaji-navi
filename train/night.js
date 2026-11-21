// 夜の学習をまとめて回す(PC で放っておく用)。node train/night.js
// 1. 虹色のオーブ(戻りのルールを直した後)を学び直す → 2. 超あまつゆのいと・超ようせいのひだね・超かがやきの樹液を並べて学ぶ
// 3. 締め切りの前に、できた重みを「ふつう(1手読み)」でふるいにかけ、上位を「強(2手読み)」で今の重みと比べる。
//    あまつゆのいとは、最後に「最強」でも今の重み(あれば)と比べる。
// 結果は train/night/ に書く(status.txt・report.md・report.json・勝った重み w_<商材>_best.json)。
// 環境変数: DEADLINE(締め切り。ISO か "HH:MM"。既定 次の 20:00)、WORKERS(並べる数。既定 コア数−1)、
//          TEST=1(動作確認用に、局数と時間をうんと小さくする)
'use strict';
const fs = require('fs'), path = require('path'), os = require('os'), { spawn } = require('child_process');
const ROOT = path.join(__dirname, '..'), OUT = path.join(__dirname, 'night');
fs.mkdirSync(OUT, { recursive: true });
const TEST = !!process.env.TEST;
const NW = Math.max(1, +(process.env.WORKERS || os.cpus().length - 1));
const LEVEL = process.env.LEVEL || '79', FOCUS = process.env.FOCUS || '251';

function deadline() {
  const d = process.env.DEADLINE;
  if (d && d.includes('T')) return new Date(d);
  const now = new Date(), t = new Date(now);
  const [h, m] = (d || '20:00').split(':').map(Number);
  t.setHours(h, m || 0, 0, 0);
  if (t <= now) t.setDate(t.getDate() + 1);   // 過ぎていたら次の日
  return t;
}
const END = TEST ? new Date(Date.now() + 8 * 60e3) : deadline();
const T0 = Date.now(), TOTAL = END - T0;
// 締め切りから逆算: 最後の比べに残す時間
// 比べ(ふつうで足切り → 最強で決勝)に残す時間。途中から入れ直しても同じ時刻に学習を止めるよう、締め切りから決めた分だけ引く
const EVAL_RESERVE = TEST ? 4 * 60e3 : +(process.env.EVALMIN || 105) * 60e3;
const TRAIN_END = END - EVAL_RESERVE;
const ORB_END = T0 + (TRAIN_END - T0) * 0.25;            // 学習の時間のうち 1/4 をオーブに

const log = (...a) => { const s = `[${new Date().toLocaleString('ja-JP')}] ` + a.join(' '); console.log(s); fs.appendFileSync(path.join(OUT, 'log.txt'), s + '\n'); };
const status = (s) => fs.writeFileSync(path.join(OUT, 'status.txt'),
  `今: ${s}\n始めた: ${new Date(T0).toLocaleString('ja-JP')}\n学習の終わり: ${new Date(TRAIN_END).toLocaleString('ja-JP')}\n締め切り: ${END.toLocaleString('ja-JP')}\n並べる数: ${NW}\n`);

// ---- 学習の組み合わせ ----
// it: train.js の回数(大きくしておき、時間で止める)。g/s: 1回の自己対戦の局数・ばらまく局面の数
const W = n => path.join('train', n);
const cfgs = {
  orb: [
    { tag: 'n1', init: W('w_orb_best.json'), env: { LR: '0.5' } },
    { tag: 'n2', init: W('w_orb_best.json'), env: { LR: '0.5', TDEPTH: '2' } },
    { tag: 'n3', init: W('w_hidane_h128_best.json'), env: {} },
    { tag: 'n4', init: W('w_orb_best.json'), env: { LR: '0.3', TDEPTH: '2', TFRAC: '0.4' } },
    { tag: 'n5', init: W('w_orb_best.json'), env: { LR: '0.8', LAMBDA: '0.8' } },
    { tag: 'n6', init: W('w_hidane_h128_best.json'), env: { TDEPTH: '2' } },
  ],
  ito: [
    { tag: 'n1', init: W('w_hidane_h128_best.json'), env: {} },
    { tag: 'n2', init: W('w_hidane_h128_best.json'), env: { TDEPTH: '2' } },
    { tag: 'n3', init: W('w_pot_best.json'), env: {} },                    // ツボ(同じ倍半の地金・6マス)から
    { tag: 'n4', init: W('w_pot_best.json'), env: { TDEPTH: '2' } },
    { tag: 'n5', init: W('w_hidane_h128_best.json'), env: { LAMBDA: '0.8' } },
    { tag: 'n6', init: W('w_hidane_h128_best.json'), env: { TDEPTH: '2', TFRAC: '0.4' } },
    { tag: 'n7', init: W('w_pot_best.json'), env: { LR: '0.6' } },
    { tag: 'n8', init: W('w_hidane_h128_best.json'), env: { TDEPTH: '2', LR: '0.6' } },
    { tag: 'n9', init: W('w_hidane_h128_best.json'), env: { TDEPTH: '2' }, seed: 31 },
    { tag: 'n10', init: W('w_pot_best.json'), env: { TDEPTH: '2' }, seed: 32 },
    { tag: 'n11', init: W('w_hidane_h128_best.json'), env: {}, seed: 33 },
    { tag: 'n12', init: W('w_pot_best.json'), env: { TDEPTH: '2', TFRAC: '0.4' }, seed: 34 },
  ],
  hidane: [
    { tag: 'n1', init: W('w_hidane_h128_best.json'), env: { LR: '0.3', TDEPTH: '2' } },
    { tag: 'n2', init: W('w_hidane_h128_best.json'), env: { LR: '0.3' } },
    { tag: 'n3', init: W('w_hidane_h128_best.json'), env: { LR: '0.2', TDEPTH: '2', TFRAC: '0.4' } },
  ],
  jueki: [
    { tag: 'n1', init: W('w_hidane_h128_best.json'), env: {} },
    { tag: 'n2', init: W('w_hidane_h128_best.json'), env: { TDEPTH: '2' } },
    { tag: 'n3', init: W('w_hidane_h128_best.json'), env: { LAMBDA: '0.8' } },
  ],
};
const CUR = { orb: 'w_orb_best.json', hidane: 'w_hidane_h128_best.json', ito: null, jueki: null };   // 今の重み(無い商材は null)
const PEN = { orb: '0', hidane: '0.6', ito: '0.6', jueki: '0.6' };

// ---- 子プロセス ----
const kids = new Set();
function run(args, env, tag) {
  return new Promise(res => {
    const c = spawn(process.execPath, args, { cwd: ROOT, env: Object.assign({}, process.env, env), stdio: ['ignore', 'pipe', 'pipe'] });
    kids.add(c);
    let out = '';
    c.stdout.on('data', d => { out += d; if (tag) fs.appendFileSync(path.join(OUT, `train_${tag}.txt`), d); });
    c.stderr.on('data', d => fs.appendFileSync(path.join(OUT, 'err.txt'), `[${tag || args[1]}] ` + d));
    c.on('exit', code => { kids.delete(c); res({ code, out }); });
    c._tag = tag;
  });
}
const killAll = () => { for (const c of kids) try { c.kill(); } catch (e) {} };
process.on('SIGINT', () => { killAll(); process.exit(1); });
const sleep = ms => new Promise(r => setTimeout(r, ms));

// 学習を1本始める
const jobKids = new Map();   // tag → 子プロセスの promise
function startJob({ item, cfg }) {
  const g = TEST ? 6 : 400, sm = TEST ? 40 : 3000, evn = TEST ? '30' : '400';
  const tag = `${item}_${cfg.tag}`;
  // 前に止めた続き: 途中の重みがあればそこから始める。前の _best は _best0 に写して、最後の比べに入れる
  const cur = W(`w_${item}_${cfg.tag}.json`), bst = path.join(ROOT, W(`w_${item}_${cfg.tag}_best.json`));
  if (fs.existsSync(path.join(ROOT, cur))) {
    if (fs.existsSync(bst)) fs.copyFileSync(bst, bst.replace('_best.json', '_best0.json'));
    cfg = Object.assign({}, cfg, { init: cur });
  }
  log(`学習を始める ${tag} ${cfg.init} ${JSON.stringify(cfg.env)}`);
  const p = run(['train/train.js', item, '9999', String(g), String(sm), String(cfg.seed || (1 + jobKids.size)), cfg.init],
    Object.assign({ TAG: '_' + cfg.tag, LEVEL, FOCUS, EVN: evn }, cfg.env), tag);
  jobKids.set(tag, p);
  return p;
}
function stopItem(item) { for (const c of kids) if (c._tag && c._tag.startsWith(item + '_')) try { c.kill(); } catch (e) {} }
// ---- 比べ(compare.js を局の範囲で分けて並べる) ----
async function evalW(item, wfile, n, seed, depth, opts) {
  const per = Math.ceil(n / NW), tasks = [];
  const tmp = path.join(OUT, 'kinds'); fs.mkdirSync(tmp, { recursive: true });
  for (let k = 0; k < NW && k * per < n; k++) {
    const kf = path.join(tmp, `${item}_${path.basename(wfile)}_${seed}_${depth}_${k}.txt`);
    tasks.push(run(['train/compare.js', item, wfile, String(Math.min(per, n - k * per)), String(seed), String(depth)],
      Object.assign({ START: String(k * per), KINDS: kf, OVERPEN: PEN[item], LEVEL, FOCUS }, opts || {})).then(() => fs.existsSync(kf) ? fs.readFileSync(kf, 'utf8') : ''));
  }
  const kinds = (await Promise.all(tasks)).join('');
  const c = ch => kinds.split('').filter(x => x === ch).length;
  return { n: kinds.length, great: +(c('g') / Math.max(1, kinds.length)).toFixed(4), kinds };
}
// 同じ局の比べ(片方だけ大成功の数と z)
function pair(a, b) {
  let x = 0, y = 0;
  for (let i = 0; i < Math.min(a.length, b.length); i++) { if (a[i] === 'g' && b[i] !== 'g') x++; if (a[i] !== 'g' && b[i] === 'g') y++; }
  return { onlyA: x, onlyB: y, z: +((y - x) / Math.sqrt(Math.max(1, x + y))).toFixed(2) };
}

const report = { started: new Date(T0).toISOString(), deadline: END.toISOString(), workers: NW, items: {} };
const saveReport = () => fs.writeFileSync(path.join(OUT, 'report.json'), JSON.stringify(report, null, 1));

// ふつう(1手読み)で全部の候補を足切りする
async function screenItem(item) {
  const cands = [].concat(...cfgs[item].map(c => [W(`w_${item}_${c.tag}_best.json`), W(`w_${item}_${c.tag}_best0.json`)])).filter(f => fs.existsSync(path.join(ROOT, f)));
  if (CUR[item]) cands.push(W(CUR[item]));
  const r = report.items[item] = { cands: {}, note: '' };
  for (const f of cands) { status(`${item} のふるい ${f}`); const e = await evalW(item, f, TEST ? 20 : 1000, 960, 1); r.cands[f] = { normal: e.great }; log(`ふつう ${item} ${f} ${e.great} (${e.n}局・種960)`); saveReport(); }
  return cands.sort((a, b) => r.cands[b].normal - r.cands[a].normal);
}
// 最強(上位12手・2手目24通り)で決勝。今の重みがあれば一緒に。締め切りが近ければ打ち切る
async function finalItem(item, order, nTop) {
  const r = report.items[item];
  if (!order.length) return;
  const top = order.filter(f => f !== W(CUR[item] || '')).slice(0, nTop);
  if (CUR[item]) top.push(W(CUR[item]));
  const N3 = TEST ? 4 : +(process.env.MAXN || 300), m = {};
  for (const f of top) {
    if (Date.now() > END.getTime() - (TEST ? 0 : 8 * 60e3)) { log(`締め切りが近いので最強の比べを打ち切る ${item} ${f}`); break; }
    status(`${item} の最強の比べ ${f}`); const t0 = Date.now();
    const e = await evalW(item, f, N3, 962, 2, { N2: '12', K2: '24', K: '12' }); m[f] = e; r.cands[f].max = e.great;
    log(`最強 ${item} ${f} ${e.great} (${e.n}局・種962・${Math.round((Date.now() - t0) / 60e3)}分)`); saveReport();
  }
  const done = Object.keys(m);
  // 決める: 最強で比べられた中の一番。最強が1つも無ければ、ふつうの一番
  let best = done.length ? done.sort((a, b) => m[b].great - m[a].great)[0] : order[0];
  const cw = CUR[item] && W(CUR[item]);
  if (cw && m[cw] && m[best].great <= m[cw].great) best = cw;   // 同じなら今の重みのまま
  r.best = best;
  if (CUR[item] && m[W(CUR[item])] && best !== W(CUR[item])) { r.vsCurMax = pair(m[W(CUR[item])].kinds, m[best].kinds); log(`最強で今の重みと比べ ${item}: ${JSON.stringify(r.vsCurMax)}`); }
  if (!CUR[item] || best !== W(CUR[item])) { fs.copyFileSync(path.join(ROOT, best), path.join(OUT, `w_${item}_best.json`)); r.saved = `night/w_${item}_best.json`; }
  saveReport();
}

function writeMd() {
  const L = ['# 夜の学習の結果', '', `始めた ${new Date(T0).toLocaleString('ja-JP')} / 終わった ${new Date().toLocaleString('ja-JP')} / 並べた数 ${NW}`, ''];
  for (const [item, r] of Object.entries(report.items)) {
    L.push(`## ${item}`, '', '| 重み | ふつう(1000局・種960) | 最強(300局・種962) |', '|---|---|---|');
    for (const [f, x] of Object.entries(r.cands)) L.push(`| ${path.basename(f)}${f === r.best ? ' ★' : ''} | ${x.normal ?? ''} | ${x.max ?? ''} |`);
    if (r.vsCurMax) L.push('', `最強で今の重みと同じ局: 今だけ大成功 ${r.vsCurMax.onlyA} / 新しいのだけ ${r.vsCurMax.onlyB} / z ${r.vsCurMax.z}`);
    L.push('', r.saved ? `残した重み: ${r.saved}` : '今の重みのまま(新しいのは勝てなかった)', '');
  }
  fs.writeFileSync(path.join(OUT, 'report.md'), L.join('\n'));
}

(async () => {
  log(`始める。締め切り ${END.toLocaleString('ja-JP')}・並べる数 ${NW}・Lv${LEVEL}・集中力${FOCUS}${TEST ? '(動作確認)' : ''}`);
  // オーブといとが大事・樹液は後回し(2026-11-21 利用者)。オーブ6本・いと10本・ひだね3本を締め切りまで並べる
  const jobs = cfgs.orb.map(cfg => ({ item: 'orb', cfg }))
    .concat(cfgs.ito.slice(0, 10).map(cfg => ({ item: 'ito', cfg })))
    .concat(cfgs.hidane.map(cfg => ({ item: 'hidane', cfg })));
  if (Date.now() < TRAIN_END) for (const j of jobs.slice(0, NW)) startJob(j);
  else log('学習の時間はもう過ぎているので、比べだけする');
  if (jobs.length > NW) log(`並べる数が足りないので回さない: ${jobs.slice(NW).map(j => j.item + '_' + j.cfg.tag).join(' ')}`);
  while (Date.now() < TRAIN_END && kids.size) { status(`オーブ・いと・ひだね(${kids.size} 本を学習中)`); await sleep(TEST ? 5e3 : 60e3); }
  killAll(); await sleep(3000); log('学習を止めた');
  // 3. 比べ: まず全部ふつうで足切り(速い)→ 大事な順(いと・オーブ・ひだね)に最強で決勝。樹液はふつうだけ
  const ord = {};
  for (const it of ['ito', 'orb', 'hidane', 'jueki']) { try { ord[it] = await screenItem(it); } catch (e) { log(`ふるいで失敗 ${it} ${e.stack}`); } writeMd(); }
  for (const [it, n] of [['ito', 3], ['orb', 2], ['hidane', 1]]) { try { if (ord[it]) await finalItem(it, ord[it], n); } catch (e) { log(`最強の比べで失敗 ${it} ${e.stack}`); } writeMd(); }
  try { if (ord.jueki && ord.jueki.length) { report.items.jueki.best = ord.jueki[0]; fs.copyFileSync(path.join(ROOT, ord.jueki[0]), path.join(OUT, 'w_jueki_best.json')); report.items.jueki.saved = 'night/w_jueki_best.json(ふつうだけで選んだ)'; saveReport(); } } catch (e) {}
  writeMd();
  status('終わった。report.md を見る');
  log('終わった');
})();
