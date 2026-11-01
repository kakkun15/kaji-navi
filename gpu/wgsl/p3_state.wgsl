struct State {
  v: array<i32, 6>,
  bel: array<array<f32, 11>, 6>,
  temp: i32,
  F: i32,
  first: u32,
  last: i32,
  lit: i32,
  lit_mask: u32,
  dead: u32,
}

struct Act {
  ix: u32,
  ncell: u32,
  cells: array<u32, 4>,
}

const Z0: array<i32, 6> = array<i32, 6>(180, 250, 210, 250, 210, 145);
const ZW: array<i32, 6> = array<i32, 6>(11, 9, 7, 9, 7, 11);
const T_GREAT: i32 = 7;
const TEMP_MAX: i32 = 2200;

const MP: array<i32, 16> = array<i32, 16>(
  5, 8, 10, 8, 10, 12, 7, 11, 16, 18, 12, 7, 6, 25, 20, 8
);
const DT: array<i32, 16> = array<i32, 16>(
  -50, -50, -50, -50, 300, -50, -50, -50, -50, -50, -300, -50, -150, -50, -50, -50
);

fn stop_prob(s: ptr<function, State>) -> f32 {
  if ((*s).dead != 0u) { return 0.0; }
  var dist: array<f32, 8>;
  for (var i: i32 = 0; i < 8; i = i + 1) { dist[i] = 0.0; }
  dist[0] = 1.0;
  var dlen: i32 = 1;
  for (var i: i32 = 0; i < 6; i = i + 1) {
    let v: i32 = (*s).v[i];
    let lo: i32 = Z0[i];
    let hi: i32 = Z0[i] + ZW[i] - 1;
    if (v < lo || v > hi) { return 0.0; }
    var d: array<f32, 5>;
    for (var e: i32 = 0; e < 5; e = e + 1) { d[e] = 0.0; }
    for (var k: i32 = 0; k < ZW[i]; k = k + 1) {
      let b: f32 = (*s).bel[i][k];
      if (b != 0.0) {
        var diff: i32 = Z0[i] + k - v;
        if (diff < 0) { diff = -diff; }
        var e: i32 = diff;
        if (e > 4) { e = 4; }
        d[e] = d[e] + b;
      }
    }
    var nd: array<f32, 8>;
    for (var e: i32 = 0; e < 8; e = e + 1) { nd[e] = 0.0; }
    var newlen: i32 = dlen - 1 + 4;
    if (newlen > T_GREAT) { newlen = T_GREAT; }
    newlen = newlen + 1;
    for (var a: i32 = 0; a < dlen; a = a + 1) {
      if (dist[a] != 0.0) {
        for (var e: i32 = 0; e <= 4; e = e + 1) {
          if (a + e <= T_GREAT) { nd[a + e] = nd[a + e] + dist[a] * d[e]; }
        }
      }
    }
    for (var e: i32 = 0; e < newlen; e = e + 1) { dist[e] = nd[e]; }
    dlen = newlen;
  }
  var sum: f32 = 0.0;
  for (var a: i32 = 0; a < dlen; a = a + 1) { sum = sum + dist[a]; }
  return sum;
}

fn is_legal(s: ptr<function, State>, a: Act) -> bool {
  if ((*s).dead != 0u) { return false; }
  let last: i32 = (*s).last;
  if (last >= 0) {
    if ((last == 4 && a.ix == 10u) || (last == 10 && a.ix == 4u)) { return false; }
  }
  let ix: i32 = i32(a.ix);
  if (MP[ix] > (*s).F) { return false; }
  let nt: i32 = (*s).temp + DT[ix];
  if (nt <= 0 || nt > TEMP_MAX) { return false; }
  return true;
}

fn has_legal(s: ptr<function, State>, acts: ptr<storage, array<Act>, read>, nacts: u32) -> bool {
  for (var i: u32 = 0u; i < nacts; i = i + 1u) {
    if (is_legal(s, (*acts)[i])) { return true; }
  }
  return false;
}

fn after_act(s: ptr<function, State>, a: Act) {
  let ix: i32 = i32(a.ix);
  (*s).F = (*s).F - MP[ix];
  (*s).last = ix;
  (*s).temp = (*s).temp + DT[ix];
  (*s).first = 0u;
  (*s).lit = -1;
  if ((*s).temp > 0 && ((*s).temp % 200) == 0) {
    var mask: u32 = 0u;
    for (var i: i32 = 0; i < 6; i = i + 1) {
      if ((*s).v[i] < Z0[i]) { mask = mask | (1u << u32(i)); }
    }
    (*s).lit_mask = mask;
  } else {
    (*s).lit_mask = 0u;
  }
}

fn over_dead(j: u32, w: i32) -> bool {
  return w > Z0[j] + ZW[j] - 1;
}
