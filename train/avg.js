// 同じ重みから続けて学んだ重みを平均する(打つ時の重さは1本と同じ)。
// node train/avg.js <出力> <重み1> <重み2> ...
'use strict';
const fs = require('fs');
const [out, ...ins] = process.argv.slice(2);
const js = ins.map(f => JSON.parse(fs.readFileSync(f)));
const avg = a => a[0].map((_, k) => a.reduce((s, x) => s + x[k], 0) / a.length);
const res = { sizes: js[0].sizes, L: js[0].L.map((l, i) => ({ n: l.n, m: l.m, W: avg(js.map(j => j.L[i].W)), b: avg(js.map(j => j.L[i].b)) })) };
fs.writeFileSync(out, JSON.stringify(res));
console.log(`${ins.length} 本を平均 → ${out}`);
