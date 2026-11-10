// ---- 声(ずんだもん・VOICEVOX)。推奨手を読み上げる ----
// スマホ(とくに iPhone)は、画面に触った時でないと音を出せない。最初に触った時に音の出口(Web Audio)を開けておき、
// その後は計算が終わったら(触っていなくても)流せるようにする。マナーモードでも鳴るよう audioSession を playback にする
const VOICE_KEY = 'kajiNaviVoiceV1', RATE_KEY = 'kajiNaviVoiceRateV1';
let voiceOn = true, voiceRate = 1.15;          // 声の速さ(収録が 1.15 なので 1.15 がそのまま)
try{ const v = localStorage.getItem(VOICE_KEY); if(v !== null) voiceOn = v === '1'; }catch(e){}
try{ const r = parseFloat(localStorage.getItem(RATE_KEY)); if(r >= 0.6 && r <= 2.5) voiceRate = r; }catch(e){}
const CLIP_BASE = 1.15;
// 計算の強さ。最強は PC のスレッドを全部使って、上位12手を2手先まで読む(pool.js)
const POWER_KEY = 'kajiNaviPowerV1';
let power = 'normal';
try{ const p = localStorage.getItem(POWER_KEY); if(p === 'max' || p === 'strong' || p === 'maxGpu') power = p; else if(p === 'maxTest') power = 'max'; }catch(e){}   // 最強(テスト中)と記録は 2026-11-07 に外した(試しの重みを入れていない)
// 最強(テスト中): 最強と同じ読みで、重みだけ試しの物(W[商材+'_test'])にする。試しの重みがある商材だけ選べる
function isTest(){ return power === 'maxTest' && !!W[item + '_test']; }
// 超える確率の罰(value.js の overPen)。1 で、同じ局どうしの比べで 大成功はそのまま・超えて失敗が
// ランプ 11.7→0.0%(600局)、ひだね 7.7→0.3%(300局)。ゾーンの外で終わる局(超え+届かず)も減った
const OVER_PEN = 1;
// 商材ごとの罰。ひだねは 0.6: 1手読み・同じ局 2000局(種960・961)で 罰1 72.45% / 0.6 73.3%
// (片方だけ大成功 8局 / 25局)。超えて失敗は 0.5% → 0.8% と少しだけ増える
const OVER_PEN_MAP = { hidane: 0.6, pot: 0.6, orb: 0 };   // 虹色のオーブは超えても戻りで戻せるので、超える罰は無し
function overPen(){ return OVER_PEN_MAP[item] ?? OVER_PEN; }
// 集中力の余裕(value.js の focusMargin): 打った後の局面の集中力を F−m と少なめに見積もる(届かずで火種0個を減らす)。
// ひだね: 1手読み・同じ局 4000局(種960〜963・Lv80・集中力253): m=10 で 大成功 80.30→80.20%(z −0.1)・届かず+超え 3.45→2.30%(z 3.3)。
// m=15 は大成功 77.95%(z −2.9)に落ちる。
// 2手読みの強(1000局・種960・Lv79・集中力251)では m=10 で 大成功 84.8→83.1%(z −1.1)・失敗 2.1→1.7% と得にならないので、ふつう(1手読み)だけ
const FOCUS_MARGIN_MAP = { hidane: 10 };
function focusMargin(){ return power === 'normal' ? (FOCUS_MARGIN_MAP[item] ?? 0) : 0; }
// 開幕の決め打ち: 全マス0でこの温度の時は、計算(最強)を待たずに火力上げを先頭に出す。
// ひだねは 1000・1300・1900(マスが光らない温度)。1600 は光ったマスで答えが変わるので計算する
// (最強の2手読みで、右下が光ったら熱風おろし(右下)、左の列なら3倍打ち、右上・右中なら火力上げ)
const OPEN_BOOK = { hidane: [1000, 1300, 1900] };
// 最強を使わない商材。ランプは利用者の PC の性能テスト(300局・種700)で ふつう(軽い2手読み)69.3% / 最強 71.0%、
// 片方だけ大成功 48局 / 53局(差なし)・超えて失敗 3局 / 10局。最強にしても上がらないので、ふつうの読みのまま
const MAX_SKIP = { lamp: true };
const MAXOPT = { K: 12, Ki: 12, N2: 12, K2: 24, seed: 12345 };
// 強(スマホ向け): 最強と同じ2手読みを、上位4手・2手目8通りに絞る(打ち切りの margin は使わない)。
// ひだねの79局面(1スレッド)で最強と比べて: 2052ms → 664ms・推奨の一致 92.4%・1手あたりの損 0.046pt。
// 前のスマホ用の最強(margin 0.05・K2 12)は 1576ms・89.9%・0.158pt、ふつう(1手読み)は 7ms・60.8%・0.670pt だった(2026-10-27)
const STRONGOPT = { K: 12, Ki: 12, N2: 4, K2: 8, seed: 12345 };
let lastCalc = null;      // { ms, threads }
