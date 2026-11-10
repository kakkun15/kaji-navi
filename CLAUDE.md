# 鍛冶ナビ(kaji-navi): 作業の手引き(短い版)

細かい数字・理由・これまでの経緯は `docs/経緯.md`(長い)。**必要な所だけ grep で読む**(全部読まない)。

## 目標と決まり
- 今の目標: 超ようせいのひだね(`hidane`)の大成功率を上げる。ほかの商材は頼まれた時だけ。**計算(重み・読み)の改善は一区切り**(利用者が決めた)。
- 利用者への返事: くだけた日本語で短く。案を並べず1つすすめる。表を使う。数字には局数と種を付ける。作る前に要件を質問で詰める。
- 利用者の損益: 大成功 +30万・成功 −40万・失敗 −60万。大成功率が一番大事。手数・待ち時間・回り道は嫌う(時間が何より大事)。
- 守ること: みだれ打ちは使わない・ゲームへの自動入力は作らない・元作者(mgr-pages / KajiTool)のコードは入れない。
- **画面読み取りのコード・中身は GitHub に一切書かない**(コード・CLAUDE.md・コミット文・PR の説明も)。自分用は PC(`D:\kaji-navi`)だけ。
- GitHub に PC の細かいスペックは書かない(部品名まで)。

## ファイル
- `src/`: アプリ。直すのは src だけ。計算は `game.js` ゲームの決まり・`core.js` 伸びと誤差・`value.js` 読みとネット・`gpumax.js` GPU 最強・`pool.js` Worker と性能テストの局・`voice.js` 声・`wgsl/` GPU 最強の部品。
- 画面は `app.html`(HTML の骨組みと `/*#include 名前*/` の行)・`app.css`(見た目)・`ui/*.js`。build.py が include の行をファイルの中身に置き換える。`ui/*.js` は**1つの関数の中へ上から順につながる**(変数は全部共有。並びは app.html の include の順):
  `state` 設定と保存・局面 / `board` 盤面の描画・今の会心! / `foot` 下の帯(推奨・詳細・まとめて)/ `pip` 小窓 / `opts` 声の設定値・計算の強さ・罰 / `voice` 声 / `calc` 計算の段取り(Worker・先読み・GPU・`recalc`・`finishCalc`)/ `input` 値の入力(`startAct`・リール・値ボタン)/ `commit` 戻りと確定(`askRet`・`commitReels`)/ `edit` 光ったマス・手直し / `cfg` 最初の集中力と使う技のシート・必殺・最初から / `testlog` テスト中の記録 / `settings` 設定のシート・戻す・商材 / `api` 起動と `window.__navi`。
- `dist/`: `python3 build.py` が作る(読まない)。`train/w_*.json`: 重み(読まない)。
- `train/`: 学習・成績の道具。`tests/`: 試験。
- 早見表は `kakkun15/kaji-hayami`、性能テストは `kakkun15/kaji-bench` に分けた(2026-11-07)。GPU の学習室は消した(最強(GPU)の部品は `src/wgsl/`)。
- `src/value.js` は大きいので名前で grep して周りだけ読む(`evalActs`・`act2Value`・`evalActsHS`)。`OVER_PEN_MAP`・`MAXOPT` は `src/ui/opts.js`。

## ひだねの要点
- 6マス(`i = 2*行 + 列`)。ゾーン [180,190] [250,258] [210,216] [250,258] [210,216] [145,155]。誤差合計 7 以下で大成功。ゾーン内の誤差は最大 4。
- 光: 200℃ の倍数で届いていないマスが1つ光る(威力2倍・会心率+400%)。候補が1マスなら選ばせない。
- 叩く技は温度 −50(熱風おろし −150)。50℃ で叩いて 0℃ で終わるのは正しい。会心で理想値が今の値以下なら動かない(Miss)。
- 罰(超える確率×罰)0.6。超える手を弾くと損(2000局で 損益 +14.1万 → +13.3万/局)。集中力の余裕 m=10 は ふつう(1手読み)だけ。
- 計算の強さ: ふつう(1手読み)/ 強 / 最強 / 最強(GPU)。「最強(テスト中)」と記録は 2026-11-07 に外した。

## 試してだめだったこと(やり直さない。詳しくは docs/経緯.md)
3手読み・読みを広げる・ロールアウト・MCTS / 隠れ層64・特徴量ver3・蒸留・GPU 学習室・続けて学ぶ(頭打ち) / 超4連打ちの決め打ち・開幕の火力上げ×4 /
火力上げ先行・候補を増やす(見込みの比べで良く見えても打たせると下がる) / 回り道の損 / 超える手を弾く /
**必殺がたまったらまず火力上げ(2026-11-07)**: 400局(種990・mid・Lv79・集中力251・罰0.6)で 必殺あり 96.3% → 88.7%(片方だけ大成功 しない方が多い)。

## コマンド(リポジトリの直下から)
- `python3 build.py` → `node tests/core.test.js`(ALL OK)。
- 成績: `OVERPEN=0.6 LEVEL=79 FOCUS=251 node train/compare.js hidane train/w_hidane_h128_best.json 1000 <種> [1|2]`(種 960〜963)。比べ: `node train/pair.js <A> -- <B>`(|z|>2)。
- 必殺: `node train/sim_hs.js hidane <重み> 400 990 mid`。負け方: `node train/loss.js`。
- Playwright: `p.chromium.launch(executable_path='/opt/pw-browsers/chromium')`(`playwright install` はしない)。

## はまりどころ
- 重みを書き換えたら `net._wz = undefined`。`pkill -f` は `^` から。コア数は `nproc`。コンテナは消えるので残す物は push。
- PR を作るのは `gh api repos/kakkun15/kaji-navi/pulls --input <json>`(`gh pr create` は止まる)。マージは利用者。
