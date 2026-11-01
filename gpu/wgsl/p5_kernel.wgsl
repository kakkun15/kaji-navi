// GPU 最強: 部品①〜④をつなぐ本体(Claude 作、2026-11-01)。
// 子の局面(2段目の「打った後の局面」)ごと × 手ごとに、value.js の actValue(1手読みの値)を計算する。
// 葉は value.js の terminalOr と同じ(死んでいれば0、打てる手が無ければやめる確率、ほかは max(やめる確率, sigmoid(ネット)))。
// 複数マスの手の K 通りの引き方は GPU の乱数(CPU とは別の並び)。1マスの手は結果を全部数えるので CPU と同じ答え。

struct Params { n_child: u32, n_act: u32, k: u32, seed: u32, over_pen: f32, tool_crit: f32, h: u32, d_in: u32 }
@group(0) @binding(0) var<uniform> P: Params;
@group(0) @binding(1) var<storage, read> CH: array<u32>;        // 子の局面(1つ 79 語)
@group(0) @binding(2) var<storage, read> ACTS: array<Act>;
@group(0) @binding(3) var<storage, read> NW: array<f32>;        // ネットの重み W1(h×111) b1(h) W2(h×h) b2(h) W3(h) b3(1)
@group(0) @binding(4) var<storage, read_write> OQ: array<f32>;  // 子 × 手 の値(打てない手は -1)。子ごとの最後の1つはやめる確率

const SW: u32 = 79u;
fn load_state(i: u32) -> State {
  var s: State; let o = i * SW;
  for (var k = 0u; k < 6u; k++) { s.v[k] = bitcast<i32>(CH[o + k]); for (var q = 0u; q < 11u; q++) { s.bel[k][q] = bitcast<f32>(CH[o + 6u + k * 11u + q]); } }
  s.temp = bitcast<i32>(CH[o + 72u]); s.F = bitcast<i32>(CH[o + 73u]); s.first = CH[o + 74u]; s.last = bitcast<i32>(CH[o + 75u]);
  s.lit = bitcast<i32>(CH[o + 76u]); s.lit_mask = CH[o + 77u]; s.dead = CH[o + 78u];
  return s;
}

// ---- 乱数(PCG) ----
var<private> rng: u32;
fn rand() -> f32 { rng = rng * 747796405u + 2891336453u; var w = ((rng >> ((rng >> 28u) + 4u)) ^ rng) * 277803737u; w = (w >> 22u) ^ w; return f32(w) / 4294967296.0; }

// ---- ネット(tanh・tanh・線形) ----
const HMAX: u32 = 256u;
fn net_value(f: ptr<function, array<f32, 111>>) -> f32 {
  let H = P.h; let D = P.d_in;
  var h1: array<f32, HMAX>; var h2: array<f32, HMAX>;
  let oW1 = 0u; let ob1 = H * D; let oW2 = ob1 + H; let ob2 = oW2 + H * H; let oW3 = ob2 + H; let ob3 = oW3 + H;
  for (var j = 0u; j < H; j++) { var z = NW[ob1 + j]; let r = oW1 + j * D; for (var k = 0u; k < D; k++) { z += NW[r + k] * (*f)[k]; } h1[j] = tanh(clamp(z, -15.0, 15.0)); }
  for (var j = 0u; j < H; j++) { var z = NW[ob2 + j]; let r = oW2 + j * H; for (var k = 0u; k < H; k++) { z += NW[r + k] * h1[k]; } h2[j] = tanh(clamp(z, -15.0, 15.0)); }
  var z = NW[ob3]; for (var k = 0u; k < H; k++) { z += NW[oW3 + k] * h2[k]; }
  return z;
}
fn leaf_val(s: ptr<function, State>) -> f32 {
  if ((*s).dead != 0u) { return 0.0; }
  if (!has_legal(s, &ACTS, P.n_act)) { return stop_prob(s); }
  let sp = stop_prob(s);
  var f: array<f32, 111>; features(s, &f);
  let v = 1.0 / (1.0 + exp(-clamp(net_value(&f), -30.0, 30.0)));
  return max(sp, v);
}
// 打った後の局面の値 × w(光るマスが決まっていなければ候補で平均)
fn after_term(s: ptr<function, State>, w: f32) -> f32 {
  let m = (*s).lit_mask;
  if (m == 0u) { return w * leaf_val(s); }
  var sum = 0.0; var n = 0.0;
  for (var c = 0u; c < 6u; c++) {
    if ((m & (1u << c)) == 0u) { continue; }
    var t = *s; t.lit = i32(c); t.lit_mask = 0u; sum += leaf_val(&t); n += 1.0;
  }
  return w * sum / n;
}

var<private> outs: array<array<Outcome, 32>, 4>;
var<private> nouts: array<u32, 4>;

fn act_value(s: ptr<function, State>, a: Act) -> f32 {
  if (a.ncell == 0u) { var t = *s; after_act(&t, a); return after_term(&t, 1.0); }
  for (var c = 0u; c < a.ncell; c++) {
    let j = a.cells[c]; let lit = (*s).lit == i32(j); let first = (*s).first != 0u;
    let rs = rolls7(a.ix, (*s).temp, power_mult_code((*s).temp, lit, first));
    let cr = crit_rate(a.ix, (*s).temp, lit, first, P.tool_crit);
    var o: array<Outcome, 32>;
    nouts[c] = mass_outcomes(Z0[j], ZW[j], (*s).v[j], (*s).bel[j], rs, cr, &o);
    outs[c] = o;
  }
  var pen = 0.0;
  if (P.over_pen > 0.0) {
    var ok = 1.0;
    for (var c = 0u; c < a.ncell; c++) {
      let z1 = Z0[a.cells[c]] + ZW[a.cells[c]] - 1; var o2 = 0.0;
      for (var q = 0u; q < nouts[c]; q++) { if (outs[c][q].w > z1) { o2 += outs[c][q].p; } }
      ok *= 1.0 - o2;
    }
    pen = P.over_pen * (1.0 - ok);
  }
  var acc = 0.0;
  if (a.ncell == 1u) {
    let j = a.cells[0];
    for (var q = 0u; q < nouts[0]; q++) {
      let o = outs[0][q];
      if (over_dead(j, o.w)) { continue; }
      var t = *s; t.v[j] = o.w; t.bel[j] = o.bel; after_act(&t, a); acc += after_term(&t, o.p);
    }
    return acc - pen;
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
    if (!dead) { after_act(&t, a); acc += after_term(&t, 1.0 / f32(K)); }
  }
  return acc - pen;
}

@compute @workgroup_size(64)
fn main(@builtin(global_invocation_id) g: vec3u) {
  let n_out = P.n_act + 1u;
  let id = g.x; if (id >= P.n_child * n_out) { return; }
  let ci = id / n_out; let ai = id % n_out;
  var s = load_state(ci);
  if (ai == P.n_act) { OQ[id] = stop_prob(&s); return; }
  let a = ACTS[ai];
  if (!is_legal(&s, a)) { OQ[id] = -1.0; return; }
  rng = P.seed ^ (id * 2654435761u + 12345u);
  OQ[id] = act_value(&s, a);
}
