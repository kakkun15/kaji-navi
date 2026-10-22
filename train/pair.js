// 同じ局どうしの比べ(符号検定)。compare.js が書く res_*.txt(局ごとに 1=大成功 / 0)を2組渡す。
// node pair.js <Aの res...> -- <Bの res...>   (同じ順に並べる。種ごとにファイルが分かれていてよい)
// |z| が 2 を超えれば、はっきりした差。
'use strict';
const fs = require('fs');
const args = process.argv.slice(2), cut = args.indexOf('--');
if (cut < 1 || args.length - 1 - cut !== cut) { console.log('node pair.js <A...> -- <B...>(同じ数)'); process.exit(1); }
const A = args.slice(0, cut).map(f => fs.readFileSync(f, 'utf8').trim()).join('');
const B = args.slice(cut + 1).map(f => fs.readFileSync(f, 'utf8').trim()).join('');
if (A.length !== B.length) { console.log('局数が違う', A.length, B.length); process.exit(1); }
let a = 0, b = 0, ga = 0, gb = 0;
for (let i = 0; i < A.length; i++) { ga += A[i] === '1'; gb += B[i] === '1'; if (A[i] === '1' && B[i] === '0') a++; if (A[i] === '0' && B[i] === '1') b++; }
const z = a + b ? (b - a) / Math.sqrt(a + b) : 0;
console.log(`${A.length}局  A ${(ga / A.length * 100).toFixed(2)}%  B ${(gb / B.length * 100).toFixed(2)}%  Aだけ大成功 ${a}  Bだけ ${b}  z ${z.toFixed(2)}`);
