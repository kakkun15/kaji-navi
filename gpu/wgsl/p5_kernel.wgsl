// GPU 最強: 部品①〜④をつなぐ本体(Claude 作、2026-11-01)。
// 子の局面(2段目の「打った後の局面」)ごと × 手ごとに、value.js の actValue(1手読みの値)を計算する。
// 3段に分ける: count(葉の数を数える)→ emit(葉の特徴を GPU の中に書く)→ ネットはまとめて行列で(別の部品)→ combine(組み立て)。
// 葉は value.js の terminalOr と同じ(死んでいれば0、打てる手が無ければやめる確率、ほかは max(やめる確率, sigmoid(ネット)))。
// 複数マスの手の K 通りの引き方は GPU の乱数(CPU とは別の並び。count と emit は同じ並び)。1マスの手は結果を全部数えるので CPU と同じ答え。

struct Params { n_child: u32, n_act: u32, k: u32, seed: u32, over_pen: f32, tool_crit: f32, pad0: u32, pad1: u32 }
@group(0) @binding(0) var<uniform> P: Params;
@group(0) @binding(1) var<storage, read> CH: array<u32>;          // 子の局面(1つ 79 語)
@group(0) @binding(2) var<storage, read> ACTS: array<Act>;
@group(0) @binding(3) var<storage, read_write> CNT: array<u32>;   // (子 × (手+1)) ごとの葉の数 → emit では始まりの位置
@group(0) @binding(4) var<storage, read_write> CST: array<f32>;   // (子 × (手+1)) ごとの定数の部分(打てない手は -1e30)
@group(0) @binding(5) var<storage, read_write> X: array<f32>;     // 葉の特徴(1つ 111)
@group(0) @binding(6) var<storage, read_write> LW: array<f32>;    // 葉の係数
@group(0) @binding(7) var<storage, read_write> LSP: array<f32>;   // 葉のやめる確率
@group(0) @binding(8) var<storage, read> Z: array<f32>;           // 葉のネットの出力(combine で使う)
@group(0) @binding(9) var<storage, read_write> OQ: array<f32>;    // 答え: (子 × (手+1))。打てない手は -1、最後はやめる確率

const SW: u32 = 79u;
fn load_state(i: u32) -> State {
  var s: State; let o = i * SW;
  for (var k = 0u; k < 6u; k++) { s.v[k] = bitcast<i32>(CH[o + k]); for (var q = 0u; q < 11u; q++) { s.bel[k][q] = bitcast<f32>(CH[o + 6u + k * 11u + q]); } }
  s.temp = bitcast<i32>(CH[o + 72u]); s.F = bitcast<i32>(CH[o + 73u]); s.first = CH[o + 74u]; s.last = bitcast<i32>(CH[o + 75u]);
  s.lit = bitcast<i32>(CH[o + 76u]); s.lit_mask = CH[o + 77u]; s.dead = CH[o + 78u];
  return s;
}

var<private> rng: u32;
fn rand() -> f32 { rng = rng * 747796405u + 2891336453u; var w = ((rng >> ((rng >> 28u) + 4u)) ^ rng) * 277803737u; w = (w >> 22u) ^ w; return f32(w) / 4294967296.0; }

var<private> MODE: u32;      // 0: 数える / 1: 書く
var<private> base: u32;
var<private> cnt: u32;
var<private> cst: f32;

fn leaf(s: ptr<function, State>, w: f32) {
  if ((*s).dead != 0u) { return; }
  if (!has_legal(s, &ACTS, P.n_act)) { cst += w * stop_prob(s); return; }
  if (MODE == 1u) {
    let li = base + cnt;
    var f: array<f32, 111>; features(s, &f);
    for (var k = 0u; k < 111u; k++) { X[li * 111u + k] = f[k]; }
    LW[li] = w; LSP[li] = f[104];          // 特徴の 104 番目がやめる確率(stop_prob)
  }
  cnt += 1u;
}
fn after_term(s: ptr<function, State>, w: f32) {
  let m = (*s).lit_mask;
  if (m == 0u) { leaf(s, w); return; }
  let n = f32(countOneBits(m));
  for (var c = 0u; c < 6u; c++) {
    if ((m & (1u << c)) == 0u) { continue; }
    var t = *s; t.lit = i32(c); t.lit_mask = 0u; leaf(&t, w / n);
  }
}

var<private> outs: array<array<Outcome, 32>, 4>;
var<private> nouts: array<u32, 4>;

fn act_walk(s: ptr<function, State>, a: Act) {
  if (a.ncell == 0u) { var t = *s; after_act(&t, a); after_term(&t, 1.0); return; }
  for (var c = 0u; c < a.ncell; c++) {
    let j = a.cells[c]; let lit = (*s).lit == i32(j); let first = (*s).first != 0u;
    let rs = rolls7(a.ix, (*s).temp, power_mult_code((*s).temp, lit, first));
    let cr = crit_rate(a.ix, (*s).temp, lit, first, P.tool_crit);
    var o: array<Outcome, 32>;
    nouts[c] = mass_outcomes(Z0[j], ZW[j], (*s).v[j], (*s).bel[j], rs, cr, &o);
    outs[c] = o;
  }
  if (P.over_pen > 0.0) {
    var ok = 1.0;
    for (var c = 0u; c < a.ncell; c++) {
      let z1 = Z0[a.cells[c]] + ZW[a.cells[c]] - 1; var o2 = 0.0;
      for (var q = 0u; q < nouts[c]; q++) { if (outs[c][q].w > z1) { o2 += outs[c][q].p; } }
      ok *= 1.0 - o2;
    }
    cst -= P.over_pen * (1.0 - ok);
  }
  if (a.ncell == 1u) {
    let j = a.cells[0];
    for (var q = 0u; q < nouts[0]; q++) {
      let o = outs[0][q];
      if (over_dead(j, o.w)) { continue; }
      var t = *s; t.v[j] = o.w; t.bel[j] = o.bel; after_act(&t, a); after_term(&t, o.p);
    }
    return;
  }
  let K = P.k;
  for (var k = 0u; k < K; k++) {
    var t = *s; var dead = false;
    for (var c = 0u; c < a.ncell; c++) {
      let j = a.cells[c]; var u = rand(); var pick = nouts[c] - 1u;
      for (var q = 0u; q < nouts[c]; q++) { u -= outs[c][q].p; if (u <= 0.0) { pick = q; break; } }
      let o = outs[c][pick];
      t.v[j] = o.w; t.bel[j] = o.bel; if (over_dead(j, o.w)) { dead = true; }
    }
    if (!dead) { after_act(&t, a); after_term(&t, 1.0 / f32(K)); }
  }
}

fn run(id: u32) {
  let n_out = P.n_act + 1u;
  let ci = id / n_out; let ai = id % n_out;
  var s = load_state(ci);
  cnt = 0u; cst = 0.0;
  if (ai == P.n_act) { cst = stop_prob(&s); return; }
  let a = ACTS[ai];
  if (!is_legal(&s, a)) { cst = -1e30; return; }
  rng = P.seed ^ (id * 2654435761u + 12345u);
  act_walk(&s, a);
}

@compute @workgroup_size(64)
fn count(@builtin(global_invocation_id) g: vec3u) {
  let id = g.x; if (id >= P.n_child * (P.n_act + 1u)) { return; }
  MODE = 0u; run(id); CNT[id] = cnt;
}
@compute @workgroup_size(64)
fn emit(@builtin(global_invocation_id) g: vec3u) {
  let id = g.x; if (id >= P.n_child * (P.n_act + 1u)) { return; }
  MODE = 1u; base = CNT[id]; run(id); CST[id] = cst;
}
@compute @workgroup_size(64)
fn combine(@builtin(global_invocation_id) g: vec3u) {
  let n_out = P.n_act + 1u;
  let id = g.x; if (id >= P.n_child * n_out) { return; }
  let c = CST[id];
  if (c < -1e29) { OQ[id] = -1.0; return; }
  var q = c;
  for (var li = CNT[id]; li < CNT[id + 1u]; li++) {      // CNT は emit の前に CPU で累積和(長さ 全体+1)にしてある
    let v = 1.0 / (1.0 + exp(-clamp(Z[li], -30.0, 30.0)));
    q += LW[li] * max(LSP[li], v);
  }
  OQ[id] = q;
}
