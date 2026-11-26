// 主持端（投影幕）
// 正確答案只存在這台電腦，公布答案那一刻才寫進資料庫，學生沒辦法事先偷看
import { db, ref, onValue, set, update, get, remove, serverTimestamp, off, now, COLORS, SHAPES, LETTERS, esc, $ } from "./common.js";

const app = $("#app");
let quiz = JSON.parse(localStorage.getItem("cq_quiz") || "null");
let pin = null;
let players = {};
let qi = -1, qStart = 0, ended = false;
let answers = {};
let timer = null, ansRef = null;
let screen = "";
let primary = null; // 空白鍵／Enter 觸發的主要按鈕

const G = (p = "") => ref(db, `games/${pin}${p ? "/" + p : ""}`);
const saveGame = () => localStorage.setItem("cq_game", JSON.stringify({ pin }));
const joinBase = () => location.href.replace(/host\.html.*$/, "").replace(/[?#].*$/, "");
const sortedPlayers = () => Object.entries(players).sort((a, b) => (b[1].score || 0) - (a[1].score || 0));
const nPlayers = () => Object.keys(players).length;

document.addEventListener("keydown", (e) => {
  if (e.target.tagName === "INPUT") return;
  if ((e.key === " " || e.key === "Enter" || e.key === "ArrowRight") && primary) { e.preventDefault(); primary(); }
});

/* ---------- 題庫載入 ---------- */
function parseCSV(text) {
  const rows = []; let row = [], f = "", q = false;
  text = text.replace(/^﻿/, "");
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) {
      if (c === '"') { if (text[i + 1] === '"') { f += '"'; i++; } else q = false; }
      else f += c;
    } else if (c === '"') q = true;
    else if (c === ",") { row.push(f); f = ""; }
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(f); rows.push(row); row = []; f = "";
    } else f += c;
  }
  if (f || row.length) { row.push(f); rows.push(row); }
  return rows.filter((r) => r.some((x) => x.trim()));
}

// CSV 欄位：題號,題目,A,B,C,D,正解,秒數,圖片（正解可寫 A 或 A,C）
function csvToQuiz(text, title, images) {
  const rows = parseCSV(text);
  const head = rows.shift().map((h) => h.trim());
  const col = (n) => head.indexOf(n);
  const opt = ["A", "B", "C", "D", "E", "F"].map(col).filter((x) => x >= 0);
  const questions = rows.map((r) => {
    const choices = opt.map((k) => (r[k] || "").trim()).filter(Boolean);
    const correct = (r[col("正解")] || "").toUpperCase().split(/[,，、\s]+/).filter(Boolean).map((L) => LETTERS.indexOf(L)).filter((x) => x >= 0);
    let img = (r[col("圖片")] || "").trim();
    if (img && !/^https:\/\//.test(img)) img = images[img] || "";
    return { q: (r[col("題目")] || "").trim(), scene: col("情境") >= 0 ? (r[col("情境")] || "").trim() : "", choices, correct, time: +(r[col("秒數")] || 20) || 20, img };
  }).filter((x) => x.q && x.choices.length >= 2);
  return { title, questions };
}

async function loadFiles(files) {
  files = [...files];
  const images = {};
  for (const f of files) if (f.type.startsWith("image/")) images[f.name] = URL.createObjectURL(f);
  const main = files.find((f) => /\.(json|csv)$/i.test(f.name));
  if (!main) throw new Error("請選 .json 或 .csv 題庫檔");
  const text = await main.text();
  const title = main.name.replace(/\.(json|csv)$/i, "");
  const q = /\.json$/i.test(main.name) ? JSON.parse(text) : csvToQuiz(text, title, images);
  if (!q.questions?.length) throw new Error("題庫裡沒有題目");
  const bad = q.questions.findIndex((x) => !x.correct?.length);
  if (bad >= 0) throw new Error(`第 ${bad + 1} 題沒有設定正解`);
  quiz = q;
  const local = q.questions.some((x) => x.img?.startsWith("blob:"));
  if (local) localStorage.removeItem("cq_quiz"); else localStorage.setItem("cq_quiz", JSON.stringify(q));
}

/* ---------- 首頁 ---------- */
function showHome(msg = "") {
  screen = "home"; primary = null;
  const old = JSON.parse(localStorage.getItem("cq_game") || "null");
  app.innerHTML = `
    <div class="center">
      <div class="big">課堂搶答・主持</div>
      <label class="drop" id="drop">
        <input type="file" id="file" accept=".json,.csv,image/*" multiple hidden>
        <div class="big" style="font-size:1.4em">點這裡選題庫檔，或把檔案拖進來</div>
        <div class="hint">.json，或 .csv（可連同圖片檔一起選）</div>
      </label>
      <div class="err">${esc(msg)}</div>
      ${quiz ? `
        <div class="big" style="font-size:1.6em">📋 ${esc(quiz.title)}（${quiz.questions.length} 題）</div>
        <div class="qlist">${quiz.questions.map((x, i) => `${i + 1}. ${esc(x.q)}${x.img ? " 🖼" : ""}`).join("<br>")}</div>
        <button class="btn" id="go" style="font-size:1.5em">開新遊戲 ▶</button>` : ""}
      ${old?.pin ? `<button class="btn ghost" id="resume">回到上一場（PIN ${esc(old.pin)}）</button>` : ""}
    </div>`;
  const drop = $("#drop");
  $("#file").onchange = async (e) => { try { await loadFiles(e.target.files); showHome(); } catch (ex) { showHome(ex.message); } };
  drop.ondragover = (e) => { e.preventDefault(); drop.classList.add("over"); };
  drop.ondragleave = () => drop.classList.remove("over");
  drop.ondrop = async (e) => { e.preventDefault(); try { await loadFiles(e.dataTransfer.files); showHome(); } catch (ex) { showHome(ex.message); } };
  if (quiz) { $("#go").onclick = newGame; primary = newGame; }
  if (old?.pin) $("#resume").onclick = () => resume(old.pin);
}

/* ---------- 開局 ---------- */
async function newGame() {
  primary = null;
  for (let k = 0; k < 10; k++) {
    pin = String(100000 + Math.floor(Math.random() * 900000));
    if (!(await get(G("cur"))).exists()) break;
  }
  await set(G(), { created: serverTimestamp(), title: quiz.title, cur: { state: "lobby", total: quiz.questions.length } });
  saveGame();
  qi = -1;
  listenPlayers();
  preload();
  showLobby();
}

// 在等候室就先把所有圖片載好，出題時才不會空白
const preloaded = [];
function preload() {
  for (const q of quiz.questions) if (q.img) { const im = new Image(); im.src = q.img; preloaded.push(im); }
}

function listenPlayers() {
  onValue(G("players"), (s) => {
    players = s.val() || {};
    if (screen === "lobby") renderChips();
    if (screen === "question") renderCount();
  });
}

async function resume(p) {
  pin = p;
  const cur = (await get(G("cur"))).val();
  if (!cur || !quiz) { localStorage.removeItem("cq_game"); return showHome(!quiz ? "請先載入同一份題庫再回到上一場" : "上一場已不存在"); }
  listenPlayers();
  preload();
  await new Promise((r) => setTimeout(r, 400));
  qi = cur.i ?? -1;
  if (cur.state === "lobby") showLobby();
  else if (cur.state === "question") { qStart = cur.qStart; runQuestion(); }
  else if (cur.state === "end") showEnd();
  else showBoard();
}

/* ---------- 等候室 ---------- */
function showLobby() {
  screen = "lobby";
  const url = joinBase();
  app.innerHTML = `
    <div class="topbar"><b>${esc(quiz.title)}</b><span><button class="btn ghost" id="quit">結束</button></span></div>
    <div class="lobby">
      <div class="joinbox">
        <div>手機掃描 QR code，或打開</div>
        <div class="url">${esc(url.replace(/^https?:\/\//, ""))}</div>
        <div id="qr"></div>
        <div>遊戲 PIN</div>
        <div class="pin">${pin}</div>
      </div>
      <div>
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px">
          <div class="big"><span id="np">0</span> 人已加入</div>
          <button class="btn" id="start" style="font-size:1.4em">開始 ▶</button>
        </div>
        <div class="hint" style="margin-bottom:10px">點名字可以把人移出</div>
        <div class="chips" id="chips"></div>
      </div>
    </div>`;
  try {
    const qr = qrcode(0, "M"); qr.addData(`${url}?pin=${pin}`); qr.make();
    $("#qr").innerHTML = qr.createSvgTag({ scalable: true, margin: 2 });
  } catch { }
  $("#start").onclick = () => nextQuestion();
  $("#quit").onclick = finish;
  primary = () => nextQuestion();
  renderChips();
}

function renderChips() {
  const el = $("#chips"); if (!el) return;
  $("#np").textContent = nPlayers();
  el.innerHTML = "";
  for (const [pid, p] of Object.entries(players)) {
    const c = document.createElement("div");
    c.className = "chip"; c.textContent = p.name; c.title = "點一下移出";
    c.onclick = () => remove(G(`players/${pid}`));
    el.appendChild(c);
  }
}

/* ---------- 出題 ---------- */
async function nextQuestion() {
  primary = null;
  qi++;
  if (qi >= quiz.questions.length) return finish();
  const q = quiz.questions[qi];
  await update(G("cur"), { state: "question", i: qi, n: q.choices.length, time: q.time, qStart: serverTimestamp(), correct: null });
  qStart = (await get(G("cur/qStart"))).val();
  runQuestion();
}

function runQuestion() {
  screen = "question"; ended = false; answers = {};
  const q = quiz.questions[qi];
  app.innerHTML = `
    <div class="topbar"><span>第 ${qi + 1} / ${quiz.questions.length} 題</span><span>PIN ${pin}</span><button class="btn ghost" id="skip">直接結束本題</button></div>
    <div class="qhead">${q.scene ? `<div class="scene">${esc(q.scene)}</div>` : ""}${esc(q.q)}</div>
    <div class="qbody">
      <div class="timer" id="tm">${q.time}</div>
      <div class="qimg">${q.img ? `<img src="${esc(q.img)}" alt="">` : ""}</div>
      <div class="counter"><b id="na">0</b>已作答</div>
    </div>
    <div class="choices">${q.choices.map((c, i) => `
      <div class="choice" style="background:${COLORS[i]}"><span class="shape">${SHAPES[i]}</span><span>${esc(c)}</span></div>`).join("")}
    </div>`;
  $("#skip").onclick = endQuestion;
  primary = null;
  ansRef = G(`answers/${qi}`);
  onValue(ansRef, (s) => { answers = s.val() || {}; renderCount(); });
  const T = q.time * 1000;
  timer = setInterval(() => {
    const left = Math.max(0, Math.ceil((T - (now() - qStart)) / 1000));
    const el = $("#tm"); if (el) el.textContent = left;
    if (left <= 0) endQuestion();
  }, 200);
}

function renderCount() {
  const el = $("#na"); if (!el) return;
  const n = Object.keys(answers).filter((pid) => players[pid]).length;
  el.textContent = n;
  if (n > 0 && n >= nPlayers()) setTimeout(endQuestion, 600); // 全員答完提早結束
}

async function endQuestion() {
  if (ended) return; ended = true;
  clearInterval(timer);
  // 給晚到的作答一點時間
  await new Promise((r) => setTimeout(r, 700));
  answers = (await get(G(`answers/${qi}`))).val() || {};
  if (ansRef) off(ansRef);
  const q = quiz.questions[qi], T = q.time * 1000;
  const counts = Array(q.choices.length).fill(0);
  const res = {};
  for (const [pid, p] of Object.entries(players)) {
    const a = answers[pid];
    let ok = false, pts = 0;
    if (a) {
      counts[a.c] = (counts[a.c] || 0) + 1;
      const el = Math.max(0, a.t - qStart);
      ok = q.correct.includes(a.c) && el <= T + 2000;
      if (ok) pts = Math.round(1000 * (1 - Math.min(el, T) / T / 2)); // 秒答 1000，最後一刻 500
    }
    const streak = ok ? (p.streak || 0) + 1 : 0;
    res[pid] = { ok, pts, answered: !!a, c: a ? a.c : null, score: (p.score || 0) + pts, streak };
  }
  const order = Object.entries(res).sort((a, b) => b[1].score - a[1].score);
  const upd = {};
  order.forEach(([pid, r], k) => {
    upd[`players/${pid}/score`] = r.score;
    upd[`players/${pid}/streak`] = r.streak;
    upd[`players/${pid}/last`] = { i: qi, ok: r.ok, pts: r.pts, answered: r.answered, rank: k + 1 };
  });
  upd["cur/state"] = "reveal";
  upd["cur/correct"] = q.correct;
  await update(G(), upd);
  showReveal(counts);
}

function showReveal(counts) {
  screen = "reveal";
  const q = quiz.questions[qi];
  const max = Math.max(1, ...counts);
  const total = counts.reduce((a, b) => a + b, 0);
  const right = q.correct.reduce((a, c) => a + (counts[c] || 0), 0);
  app.innerHTML = `
    <div class="topbar"><span>第 ${qi + 1} / ${quiz.questions.length} 題</span><span>答對 ${right} / ${nPlayers()} 人（${nPlayers() ? Math.round(right / nPlayers() * 100) : 0}%）</span><button class="btn" id="nx">排行榜 ▶</button></div>
    <div class="qhead">${q.scene ? `<div class="scene">${esc(q.scene)}</div>` : ""}${esc(q.q)}</div>
    <div class="qbody">
      <div class="bars">${counts.map((n, i) => `
        <div class="bar ${q.correct.includes(i) ? "" : "dim"}">
          <div class="lab">${n}</div>
          <div class="fill" style="height:${(n / max) * 85}%;background:${COLORS[i]}"></div>
          <div class="lab">${SHAPES[i]}${q.correct.includes(i) ? " ✓" : ""}</div>
        </div>`).join("")}
      </div>
      ${q.img ? `<div class="qimg" style="flex:.8"><img src="${esc(q.img)}" alt=""></div>` : ""}
    </div>
    <div class="choices">${q.choices.map((c, i) => `
      <div class="choice ${q.correct.includes(i) ? "" : "dim"}" style="background:${COLORS[i]}"><span class="shape">${SHAPES[i]}</span><span>${esc(c)}</span><span class="cnt">${q.correct.includes(i) ? "✓" : ""}</span></div>`).join("")}
    </div>`;
  $("#nx").onclick = showBoard;
  primary = showBoard;
}

/* ---------- 排行榜 ---------- */
async function showBoard() {
  screen = "board";
  await update(G("cur"), { state: "leaderboard" });
  const last = qi >= quiz.questions.length - 1;
  const top = sortedPlayers().slice(0, 5);
  app.innerHTML = `
    <div class="topbar"><span>第 ${qi + 1} / ${quiz.questions.length} 題</span><span></span>
      <button class="btn" id="nx">${last ? "最終結果 🏆" : "下一題 ▶"}</button></div>
    <div class="center">
      <div class="big">排行榜</div>
      <div class="board">${top.map(([, p], k) => `
        <div class="row ${k === 0 ? "first" : ""}"><span>${k + 1}. ${esc(p.name)}${p.streak > 2 ? ` 🔥${p.streak}` : ""}</span><span>${p.score || 0}</span></div>`).join("")}
      </div>
    </div>`;
  const go = last ? finish : nextQuestion;
  $("#nx").onclick = go; primary = go;
}

/* ---------- 結束 ---------- */
async function finish() {
  primary = null;
  await update(G("cur"), { state: "end" });
  showEnd();
}

function showEnd() {
  screen = "end";
  const s = sortedPlayers();
  const pod = (k, h) => s[k] ? `<div class="pod" style="height:${h}%"><div class="nm">${esc(s[k][1].name)}</div><div class="sc">${s[k][1].score || 0} 分</div><div class="rk">${["🥇", "🥈", "🥉"][k]}</div></div>` : "";
  app.innerHTML = `
    <div class="topbar"><b>${esc(quiz.title)}</b><span>
      <button class="btn" id="csv">匯出作答紀錄 CSV</button>
      <button class="btn ghost" id="home">回首頁</button></span></div>
    <div class="center">
      <div class="podium">${pod(1, 70)}${pod(0, 100)}${pod(2, 50)}</div>
      <div class="hint">${s.length} 位參加</div>
    </div>`;
  $("#csv").onclick = exportCSV;
  $("#home").onclick = () => { localStorage.removeItem("cq_game"); off(G("players")); pin = null; showHome(); };
}

async function exportCSV() {
  const all = (await get(G("answers"))).val() || {};
  const qs = quiz.questions;
  const cell = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  const head = ["名次", "暱稱", "總分", ...qs.flatMap((_, i) => [`Q${i + 1}作答`, `Q${i + 1}對錯`])];
  const lines = [head.map(cell).join(",")];
  sortedPlayers().forEach(([pid, p], k) => {
    const r = [k + 1, p.name, p.score || 0];
    qs.forEach((q, i) => {
      const a = all[i]?.[pid];
      r.push(a ? LETTERS[a.c] : "", a ? (q.correct.includes(a.c) ? "O" : "X") : "");
    });
    lines.push(r.map(cell).join(","));
  });
  const n = nPlayers() || 1;
  const rate = ["", "答對率", ""];
  qs.forEach((q, i) => {
    const ok = Object.entries(all[i] || {}).filter(([pid, a]) => players[pid] && q.correct.includes(a.c)).length;
    rate.push("", `${Math.round(ok / n * 100)}%`);
  });
  lines.push(rate.map(cell).join(","));
  lines.push("", ["題號", "題目", "正解"].map(cell).join(","));
  qs.forEach((q, i) => lines.push([`Q${i + 1}`, q.q, q.correct.map((c) => `${LETTERS[c]}. ${q.choices[c]}`).join(" / ")].map(cell).join(",")));
  const blob = new Blob(["﻿" + lines.join("\r\n")], { type: "text/csv;charset=utf-8" });
  const a = document.createElement("a");
  const d = new Date();
  a.href = URL.createObjectURL(blob);
  a.download = `${quiz.title}_作答紀錄_${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}.csv`;
  a.click();
}

showHome();
