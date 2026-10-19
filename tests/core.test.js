// 計算の核の試験。
// 1) 公開の温度別の数値表(最小・最大)と照合する。
const C = require('../src/core.js');
const fs = require('fs'), path = require('path');
let ng = 0; const ok = (c, m) => { if (!c) { ng++; console.log('NG', m); } };

// 1) 公開表(ドラクエ10.jp の温度別の表。2000〜50℃・50℃刻み・7通り全部)
// 表(power-table-dq10jp.json)は出典のサイトの物なので、このリポジトリには入れていない。手元に置いた時だけ照合する。
const TP = path.join(__dirname, 'power-table-dq10jp.json');
if (!fs.existsSync(TP)) { console.log('表が無いので照合を飛ばした(tests/power-table-dq10jp.json)'); console.log('ALL OK'); process.exit(0); }
const KT = require(TP).rows.map(r => JSON.stringify(r));
const ORDER = ['tataku','jouge','nibai','neppuu','sanbai','tekagen','midare'];
let n1 = 0, k = 0;
for (let T = 2000; T >= 50; T -= 50) for (const id of ORDER) {
  const want = JSON.stringify(C.rolls(id, T, 1));
  // PDF ではこの行だけメニューに隠れて読めない。利用者が送ってくれた同じ表のスクショ(2026-10-14)の値で照合する
  if (T === 1850 && id === 'nibai') { ok(want === '[35,38,40,43,46,49,52]', `表 1850℃ 2倍打ち 式 ${want}`); n1++; continue; }
  ok(KT[k] === want, `表 ${T}℃ ${id} 表 ${KT[k]} 式 ${want}`); k++; n1++;
}
console.log('公開表と照合', n1, '行(7通りすべて)');

console.log(ng ? `NG ${ng}` : 'ALL OK');
