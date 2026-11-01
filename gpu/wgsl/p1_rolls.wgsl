// 技テーブル(JS の TECHS と同じ順・同じ意味)
// pow10: round(pow * 10), area: 叩くか(1/0), aim: ねらい系(1/0)
const POW10: array<i32, 16> = array<i32, 16>(
  10, 12,  5, 20,  0, 12,  8, 30,
  10, 20,  0, 12, 25, 12,  5, 12
);
const AREA: array<i32, 16> = array<i32, 16>(
  1, 1, 1, 1, 0, 1, 1, 1,
  1, 1, 0, 1, 1, 1, 1, 1
);
const AIM: array<i32, 16> = array<i32, 16>(
  0, 0, 0, 0, 0, 0, 0, 0,
  1, 0, 0, 0, 0, 1, 1, 0
);

const TEMP_CAP: i32 = 2000;

fn base_power(n: i32, y10: i32) -> i32 {
  var v: i32 = (n * y10 + 9) / 10;          // ceil(n * y10 / 10)
  if (n == 15 && (y10 == 12 || y10 == 8)) {
    v = v + 1;
  }
  return v;
}

fn temp_scale(v: i32, temp: i32) -> i32 {
  let x: i32 = clamp(temp, 0, TEMP_CAP);
  return (v * (1000 + x) + 1999) / 2000;    // ceil(v * (1000+x) / 2000)
}

// mult_code: 0 -> 倍率1, 1 -> 倍率2, 2 -> 倍率0.5
fn rolls7(ix: u32, temp: i32, mult_code: u32) -> array<i32, 7> {
  let y10: i32 = POW10[ix];
  var out: array<i32, 7>;
  for (var i: i32 = 0; i < 7; i = i + 1) {
    let n: i32 = 12 + i;                    // N_LIST = 12..18
    let v: i32 = temp_scale(base_power(n, y10), temp);
    var r: i32;
    if (mult_code == 1u) {
      r = v * 2;
    } else if (mult_code == 2u) {
      r = (v + 1) / 2;                      // ceil(v * 0.5)
    } else {
      r = v;
    }
    out[i] = r;
  }
  return out;
}

fn temp_kind(temp: i32) -> i32 {
  if (temp > 0 && temp % 400 == 0) { return 400; }
  if (temp > 0 && temp % 200 == 0) { return 200; }
  return 0;
}

// 0 -> 倍率1, 1 -> 倍率2
fn power_mult_code(temp: i32, lit: bool, first: bool) -> u32 {
  if (first) { return 0u; }
  if (lit && temp_kind(temp) != 0) { return 1u; }
  return 0u;
}

fn crit_rate(ix: u32, temp: i32, lit: bool, first: bool, tool_crit: f32) -> f32 {
  if (AREA[ix] == 0) { return 0.0; }
  var bonus: i32 = 0;
  if (AIM[ix] == 1) { bonus = bonus + 6; }
  if (!first && lit && temp_kind(temp) != 0) { bonus = bonus + 4; }
  return min(1.0, tool_crit * f32(1 + bonus) / 100.0);
}
