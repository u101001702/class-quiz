# GAME-005 課堂即時搶答（Kahoot 替代，50 人以上）

- 建立：2026-11-27

## 是什麼
Kahoot 免費版只能 40 人，這是自己架的替代品：投影幕出題、學生用手機作答、依速度計分、排行榜、匯出作答紀錄。
- 網頁：GitHub Pages（靜態）
- 即時同步：Firebase Realtime Database（免費方案同時 100 連線）

## 檔案
- `index.html` + `play.js`：學生手機端（網址根目錄，QR code 指這裡）
- `host.html` + `host.js`：主持端（投影用）
- `common.js`：Firebase 連線、伺服器時間
- `config.js`：Firebase 設定（公開沒關係）
- `tools/kahoot2quiz.py`：Kahoot 網址 → `quizzes/*.json`
- `quizzes/`：題庫（**含正解，不推上 GitHub**，已在 .gitignore）

## 安全設計
正確答案只在主持電腦上，每題公布時才寫進資料庫，學生無法事先看到。

## 題庫格式
JSON：`{title, questions:[{q, choices[], correct[索引], time 秒, img 網址}]}`
CSV：`題號,題目,A,B,C,D,正解,秒數,圖片`（正解填字母；圖片填 https 網址，或填檔名並在主持端連同圖片一起選）
