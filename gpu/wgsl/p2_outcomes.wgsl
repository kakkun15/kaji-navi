struct Outcome {
  w: i32,
  p: f32,
  crit: u32,
  bel: array<f32, 11>,
}

fn mass_outcomes(z0: i32, zw: i32, v: i32, bel: array<f32, 11>, rs: array<i32, 7>, cr: f32,
                 out: ptr<function, array<Outcome, 32>>) -> u32 {
  var keys_w: array<i32, 32>;
  var keys_c: array<u32, 32>;
  var p_acc: array<f32, 32>;
  var post_acc: array<array<f32, 11>, 32>;
  var count: u32 = 0u;

  let pr: f32 = 1.0 / 7.0;

  // ふつうの伸び (cr < 1)
  if (cr < 1.0) {
    let p: f32 = pr * (1.0 - cr);
    for (var i: i32 = 0; i < 7; i = i + 1) {
      let w: i32 = v + rs[i];
      var found: i32 = -1;
      for (var j: u32 = 0u; j < count; j = j + 1u) {
        if (keys_c[j] == 0u && keys_w[j] == w) { found = i32(j); break; }
      }
      if (found >= 0) {
        p_acc[u32(found)] = p_acc[u32(found)] + p;
      } else if (count < 32u) {
        let idx = count;
        keys_w[idx] = w;
        keys_c[idx] = 0u;
        p_acc[idx] = p;
        for (var k: u32 = 0u; k < 11u; k = k + 1u) { post_acc[idx][k] = 0.0; }
        count = count + 1u;
      }
    }
  }

  // 会心 (cr > 0): r ごとに w でまとめ、最初に出た順で out に合流
  if (cr > 0.0) {
    for (var i: i32 = 0; i < 7; i = i + 1) {
      let r: i32 = rs[i];
      var g_w: array<i32, 11>;
      var g_val: array<array<f32, 11>, 11>;
      var g_count: u32 = 0u;
      for (var k: i32 = 0; k < zw; k = k + 1) {
        if (bel[k] == 0.0) { continue; }
        let I: i32 = z0 + k;
        var w: i32;
        if (I > v) { w = min(v + 2 * r, I); } else { w = v; }
        var found: i32 = -1;
        for (var j: u32 = 0u; j < g_count; j = j + 1u) {
          if (g_w[j] == w) { found = i32(j); break; }
        }
        if (found < 0) {
          found = i32(g_count);
          g_w[g_count] = w;
          for (var kk: u32 = 0u; kk < 11u; kk = kk + 1u) { g_val[g_count][kk] = 0.0; }
          g_count = g_count + 1u;
        }
        g_val[u32(found)][k] = g_val[u32(found)][k] + bel[k];
      }
      for (var gj: u32 = 0u; gj < g_count; gj = gj + 1u) {
        let w: i32 = g_w[gj];
        var m: f32 = 0.0;
        for (var kk: u32 = 0u; kk < 11u; kk = kk + 1u) { m = m + g_val[gj][kk]; }
        var found: i32 = -1;
        for (var j: u32 = 0u; j < count; j = j + 1u) {
          if (keys_c[j] == 1u && keys_w[j] == w) { found = i32(j); break; }
        }
        if (found < 0) {
          if (count >= 32u) { continue; }
          found = i32(count);
          keys_w[count] = w;
          keys_c[count] = 1u;
          p_acc[count] = 0.0;
          for (var kk: u32 = 0u; kk < 11u; kk = kk + 1u) { post_acc[count][kk] = 0.0; }
          count = count + 1u;
        }
        let idx = u32(found);
        p_acc[idx] = p_acc[idx] + m * pr * cr;
        for (var kk: u32 = 0u; kk < 11u; kk = kk + 1u) {
          post_acc[idx][kk] = post_acc[idx][kk] + g_val[gj][kk] * pr * cr;
        }
      }
    }
  }

  // 出力(挿入順のまま)
  for (var i: u32 = 0u; i < count; i = i + 1u) {
    (*out)[i].w = keys_w[i];
    (*out)[i].p = p_acc[i];
    (*out)[i].crit = keys_c[i];
    if (keys_c[i] == 1u) {
      var m: f32 = 0.0;
      for (var kk: u32 = 0u; kk < 11u; kk = kk + 1u) { m = m + post_acc[i][kk]; }
      for (var kk: u32 = 0u; kk < 11u; kk = kk + 1u) { (*out)[i].bel[kk] = post_acc[i][kk] / m; }
    } else {
      for (var kk: u32 = 0u; kk < 11u; kk = kk + 1u) { (*out)[i].bel[kk] = bel[kk]; }
    }
  }
  return count;
}
