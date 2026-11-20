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
  if (t - now < 3 * 3600e3) t.setDate(t.getDate() + 1);   // 3時間を切っていたら次の日
  return t;
}
const END = TEST ? new Date(Date.now() + 8 * 60e3) : deadline();
const T0 = Date.now(), TOTAL = END - T0;
// 締め切りから逆算: 最後の比べに残す時間
const EVAL_RESERVE = TEST ? 4 * 60e3 : Math.min(2 * 3600e3, TOTAL * 0.15);
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

async function judgeItem(item, final) {
  const cands = cfgs[item].map(c => W(`w_${item}_${c.tag}_best.json`)).filter(f => fs.existsSync(path.join(ROOT, f)));
  if (CUR[item]) cands.push(W(CUR[item]));
  const r = report.items[item] = { cands: {}, note: '' };
  const N1 = TEST ? 20 : 1000, N2 = TEST ? 6 : 400, N3 = TEST ? 4 : 300;
  // ふるい: ふつう(1手読み)
  for (const f of cands) { status(`${item} のふるい ${f}`); const e = await evalW(item, f, N1, 960, 1); r.cands[f] = { normal: e.great }; log(`ふつう ${item} ${f} ${e.great} (${e.n}局・種960)`); saveReport(); }
  const order = cands.slice().sort((a, b) => r.cands[b].normal - r.cands[a].normal);
  const top = order.filter(f => f !== W(CUR[item] || '')).slice(0, 2);
  if (CUR[item]) top.push(W(CUR[item]));
  // 強(2手読み・上位4手・2手目8通り)
  const strong = {};
  for (const f of top) { status(`${item} の強の比べ ${f}`); const e = await evalW(item, f, N2, 961, 2, { N2: '4', K2: '8' }); strong[f] = e; r.cands[f].strong = e.great; log(`強 ${item} ${f} ${e.great} (${e.n}局・種961)`); saveReport(); }
  const best = top.slice().sort((a, b) => strong[b].great - strong[a].great)[0];
  r.best = best;
  if (CUR[item] && best !== W(CUR[item])) { r.vsCur = pair(strong[W(CUR[item])].kinds, strong[best].kinds); log(`強で今の重みと比べ ${item}: ${JSON.stringify(r.vsCur)}`); }
  // 最強(上位12手・2手目24通り)で、勝った重みと今の重み(あれば)。いとは今の重みが無いので勝った重みだけ
  if (final) {
    const fs3 = [best].concat(CUR[item] && best !== W(CUR[item]) ? [W(CUR[item])] : []);
    const m = {};
    for (const f of fs3) { status(`${item} の最強の比べ ${f}`); const e = await evalW(item, f, N3, 962, 2, { N2: '12', K2: '24', K: '12' }); m[f] = e; r.cands[f].max = e.great; log(`最強 ${item} ${f} ${e.great} (${e.n}局・種962)`); saveReport(); }
    if (fs3.length === 2) r.vsCurMax = pair(m[fs3[1]].kinds, m[fs3[0]].kinds);
  }
  // 勝った重みを残す(今の重みのままなら残さない)
  if (!CUR[item] || best !== W(CUR[item])) { fs.copyFileSync(path.join(ROOT, best), path.join(OUT, `w_${item}_best.json`)); r.saved = `night/w_${item}_best.json`; }
  saveReport();
}

function writeMd() {
  const L = ['# 夜の学習の結果', '', `始めた ${new Date(T0).toLocaleString('ja-JP')} / 終わった ${new Date().toLocaleString('ja-JP')} / 並べた数 ${NW}`, ''];
  for (const [item, r] of Object.entries(report.items)) {
    L.push(`## ${item}`, '', '| 重み | ふつう(1000局・種960) | 強(400局・種961) | 最強(300局・種962) |', '|---|---|---|---|');
    for (const [f, x] of Object.entries(r.cands)) L.push(`| ${path.basename(f)}${f === r.best ? ' ★' : ''} | ${x.normal ?? ''} | ${x.strong ?? ''} | ${x.max ?? ''} |`);
    if (r.vsCur) L.push('', `強で今の重みと同じ局: 今だけ大成功 ${r.vsCur.onlyA} / 新しいのだけ ${r.vsCur.onlyB} / z ${r.vsCur.z}`);
    if (r.vsCurMax) L.push(`最強で今の重みと同じ局: 今だけ大成功 ${r.vsCurMax.onlyA} / 新しいのだけ ${r.vsCurMax.onlyB} / z ${r.vsCurMax.z}`);
    L.push('', r.saved ? `残した重み: ${r.saved}` : '今の重みのまま(新しいのは勝てなかった)', '');
  }
  fs.writeFileSync(path.join(OUT, 'report.md'), L.join('\n'));
}

(async () => {
  log(`始める。締め切り ${END.toLocaleString('ja-JP')}・並べる数 ${NW}・Lv${LEVEL}・集中力${FOCUS}${TEST ? '(動作確認)' : ''}`);
  // 1. オーブと、ほかの商材を並べて始める。オーブの時間が来たらオーブだけ止めて、空いた所にほかの商材を足す
  const others = [];
  const order = ['ito', 'hidane', 'jueki', 'ito', 'ito', 'hidane', 'jueki', 'ito', 'ito', 'hidane', 'jueki', 'ito', 'ito', 'jueki', 'ito', 'ito', 'ito', 'ito'];
  const used = { ito: 0, hidane: 0, jueki: 0 };
  for (const it of order) { const c = cfgs[it][used[it]++]; if (c) others.push({ item: it, cfg: c }); }
  const orbJobs = cfgs.orb.map(cfg => ({ item: 'orb', cfg }));
  for (const j of orbJobs.slice(0, NW)) startJob(j);
  let next = 0;
  while (kids.size < NW && next < others.length) startJob(others[next++]);
  while (Date.now() < ORB_END && kids.size) { status(`オーブとほか(${kids.size} 本を学習中)`); await sleep(TEST ? 5e3 : 60e3); }
  stopItem('orb'); await sleep(3000); log('虹色のオーブの学習を止めた');
  while (kids.size < NW && next < others.length) startJob(others[next++]);
  if (next < others.length) log(`並べる数が足りないので回さない: ${others.slice(next).map(j => j.item + '_' + j.cfg.tag).join(' ')}`);
  // 2. いと・ひだね・樹液を締め切りまで
  while (Date.now() < TRAIN_END && kids.size) { status(`いと・ひだね・樹液(${kids.size} 本を学習中)`); await sleep(TEST ? 5e3 : 60e3); }
  killAll(); await sleep(3000); log('学習を止めた');
  // 3. 比べ(いとを最後に最強でも)
  for (const it of ['orb', 'hidane', 'jueki']) { try { await judgeItem(it, false); } catch (e) { log(`比べで失敗 ${it} ${e.stack}`); } writeMd(); }
  try { await judgeItem('ito', true); } catch (e) { log(`比べで失敗 ito ${e.stack}`); }
  writeMd();
  status('終わった。report.md を見る');
  log('終わった');
})();
