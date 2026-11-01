fn features(s: ptr<function, State>, out: ptr<function, array<f32, 111>>) {
  var idx: u32 = 0u;
  var need_sum: f32 = 0.0;
  var open: i32 = 0;

  let temp: i32 = (*s).temp;
  let temp_capped: i32 = min(2000, temp);
  let t_scale: f32 = f32(1000 + temp_capped) / 2000.0;

  for (var i: i32 = 0; i < 6; i = i + 1) {
    let z0: i32 = Z0[i];
    let z1: i32 = Z0[i] + ZW[i] - 1;
    let v: i32 = (*s).v[i];
    let w: i32 = ZW[i];
    let wf: f32 = f32(w);

    var need: i32 = z0 - v;
    if (need < 0) { need = 0; }
    need_sum = need_sum + f32(need);
    if (need > 0) { open = open + 1; }

    // 累積和 (サイズは ZW の最大 11 に対してインデックス 0..w を使うので 12)
    var cum: array<f32, 12>;
    cum[0] = 0.0;
    for (var q: i32 = 0; q < w; q = q + 1) {
      cum[q + 1] = cum[q] + (*s).bel[i][q];
    }

    var e_err: f32 = 0.0;
    var p_up: f32 = 0.0;
    var p_at: f32 = 0.0;
    var m1: f32 = 0.0;
    var m2: f32 = 0.0;
    for (var q: i32 = 0; q < w; q = q + 1) {
      let p: f32 = (*s).bel[i][q];
      if (p == 0.0) { continue; }
      let I: i32 = z0 + q;
      var d: i32 = I - v;
      if (d < 0) { d = -d; }
      if (d > 4) { d = 4; }
      e_err = e_err + p * f32(d);
      if (I > v) { p_up = p_up + p; }
      if (I == v) { p_at = p_at + p; }
      let qf: f32 = f32(q);
      m1 = m1 + p * qf;
      m2 = m2 + p * qf * qf;
    }
    var sd_var: f32 = m2 - m1 * m1;
    if (sd_var < 0.0) { sd_var = 0.0; }
    let sd: f32 = sqrt(sd_var);

    let in_zone: bool = (v >= z0) && (v <= z1);

    (*out)[idx] = f32(need) / 100.0; idx = idx + 1u;
    (*out)[idx] = f32(min(need, 60)) / 60.0; idx = idx + 1u;
    (*out)[idx] = f32(need) / (15.0 * t_scale) / 4.0; idx = idx + 1u;
    (*out)[idx] = select(0.0, 1.0, in_zone); idx = idx + 1u;
    if (in_zone) {
      (*out)[idx] = e_err / 4.0;
    } else {
      (*out)[idx] = 1.0;
    }
    idx = idx + 1u;
    (*out)[idx] = p_up; idx = idx + 1u;
    (*out)[idx] = p_at; idx = idx + 1u;
    var a: f32 = f32(v - z0) / wf;
    if (a < -3.0) { a = -3.0; }
    (*out)[idx] = a; idx = idx + 1u;
    var b: f32 = f32(z1 - v) / 20.0;
    if (b > 3.0) { b = 3.0; }
    if (b < -3.0) { b = -3.0; }
    (*out)[idx] = b; idx = idx + 1u;
    (*out)[idx] = m1 / wf; idx = idx + 1u;
    (*out)[idx] = sd / wf; idx = idx + 1u;
    (*out)[idx] = select(0.0, 1.0, (*s).lit == i); idx = idx + 1u;

    let is_lit: bool = ((*s).lit == i);
    let is_first: bool = ((*s).first != 0u);
    let mc: u32 = power_mult_code(temp, is_lit, is_first);

    for (var ti: i32 = 0; ti < 2; ti = ti + 1) {
      var ix: u32 = 0u;
      if (ti == 1) { ix = 2u; }
      let rs: array<i32, 7> = rolls7(ix, temp, mc);

      var safe: i32 = 0;
      var ex: f32 = 0.0;
      var lo: i32 = v - z0 + 1;
      if (lo < 0) { lo = 0; }
      let top: i32 = w - 1;

      for (var ri: i32 = 0; ri < 7; ri = ri + 1) {
        let r: i32 = rs[ri];
        if (v + r <= z1) { safe = safe + 1; }
        var hi: i32 = v + 2 * r - z0;
        if (hi > top) { hi = top; }
        if (hi >= lo) {
          ex = ex + (cum[hi + 1] - cum[lo]);
        }
      }
      (*out)[idx] = f32(safe) / 7.0; idx = idx + 1u;
      (*out)[idx] = ex / 7.0; idx = idx + 1u;
    }
  }

  // 全体特徴 (15 個)
  let kind: i32 = select(temp_kind(temp), 0, (*s).first != 0u);
  (*out)[idx] = f32(temp) / 1000.0; idx = idx + 1u;
  (*out)[idx] = t_scale; idx = idx + 1u;
  (*out)[idx] = select(0.0, 1.0, kind == 400); idx = idx + 1u;
  (*out)[idx] = select(0.0, 1.0, kind == 200); idx = idx + 1u;
  (*out)[idx] = (f32(temp % 200) / 50.0) / 4.0; idx = idx + 1u;
  (*out)[idx] = select(0.0, 1.0, (*s).first != 0u); idx = idx + 1u;
  (*out)[idx] = f32((*s).F) / 100.0; idx = idx + 1u;
  (*out)[idx] = f32(min((*s).F, 60)) / 60.0; idx = idx + 1u;
  (*out)[idx] = stop_prob(s); idx = idx + 1u;
  (*out)[idx] = f32(open) / 6.0; idx = idx + 1u;
  (*out)[idx] = need_sum / 500.0; idx = idx + 1u;
  (*out)[idx] = need_sum / f32(max(1, (*s).F)) / 5.0; idx = idx + 1u;
  (*out)[idx] = select(0.0, 1.0, (*s).lit >= 0); idx = idx + 1u;
  (*out)[idx] = (f32(temp) / 50.0) / 40.0; idx = idx + 1u;
  (*out)[idx] = 1.0;
}
