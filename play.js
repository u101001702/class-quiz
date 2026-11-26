// 學生手機端
import { db, ref, onValue, set, get, push, serverTimestamp, off, now, COLORS, SHAPES, esc, $ } from "./common.js";

const app = $("#app");
const KEY = "cq_me";
let me = JSON.parse(localStorage.getItem(KEY) || "null"); // {pin, pid, name}
let cur = null;     // games/<pin>/cur
let mine = null;    // games/<pin>/players/<pid>
let answered = {};  // 題號 → 選項
let tick = null;
let refs = [];

const P = (p) => ref(db, `games/${me.pin}/${p}`);

function showJoin(msg = "") {
  detach();
  const pin = new URLSearchParams(location.search).get("pin") || me?.pin || "";
  app.innerHTML = `
    <div class="center">
      <div class="big">課堂搶答</div>
      <form class="card" id="f">
        <input id="pin" inputmode="numeric" maxlength="6" placeholder="遊戲 PIN" value="${esc(pin)}" autocomplete="off">
        <input id="nm" maxlength="12" placeholder="暱稱" value="${esc(me?.name || "")}" autocomplete="off">
        <button class="btn" type="submit">加入</button>
        <div class="err" id="err">${esc(msg)}</div>
      </form>
    </div>`;
  $(pin ? "#nm" : "#pin").focus();
  $("#f").onsubmit = async (e) => {
    e.preventDefault();
    const pinV = $("#pin").value.trim(), name = $("#nm").value.trim();
    const err = (t) => { $("#err").textContent = t; btn.disabled = false; };
    const btn = $("#f button"); btn.disabled = true;
    if (!/^\d{6}$/.test(pinV)) return err("PIN 是 6 位數字");
    if (!name) return err("請輸入暱稱");
    try {
      const g = await get(ref(db, `games/${pinV}/cur`));
      if (!g.exists()) return err("找不到這場遊戲，請確認 PIN");
      if (g.val().state === "end") return err("這場遊戲已經結束");
      const ps = (await get(ref(db, `games/${pinV}/players`))).val() || {};
      if (Object.values(ps).some((p) => p.name === name)) return err("這個暱稱有人用了，換一個");
      const pRef = push(ref(db, `games/${pinV}/players`));
      await set(pRef, { name, score: 0, joined: serverTimestamp() });
      me = { pin: pinV, pid: pRef.key, name };
      localStorage.setItem(KEY, JSON.stringify(me));
      answered = {};
      attach();
    } catch (ex) { err("連線失敗，請再試一次"); console.error(ex); }
  };
}

function detach() { refs.forEach((r) => off(r)); refs = []; clearInterval(tick); cur = mine = null; }

function attach() {
  detach();
  const rc = P("cur"), rp = P(`players/${me.pid}`);
  refs = [rc, rp];
  onValue(rc, async (s) => {
    cur = s.val();
    if (!cur) return showJoin("遊戲已關閉");
    // 重新整理後，確認這題是否已作答
    if (cur.state === "question" && !(cur.i in answered)) {
      const a = await get(P(`answers/${cur.i}/${me.pid}`));
      if (a.exists()) answered[cur.i] = a.val().c;
    }
    render();
  });
  onValue(rp, (s) => {
    const had = mine;
    mine = s.val();
    if (!mine && had) { localStorage.removeItem(KEY); me = null; return showJoin("你已被移出遊戲"); }
    if (!mine && !had) { return; }
    render();
  });
  // 首次確認自己還在
  get(rp).then((s) => { if (!s.exists()) { localStorage.removeItem(KEY); const p = me.pin; me = { pin: p }; showJoin(""); } });
}

function status(extra = "") {
  return `<div class="status"><span>${esc(me.name)}</span><span>${extra}</span><span>${mine?.score ?? 0} 分</span></div>`;
}

function render() {
  clearInterval(tick);
  if (!cur || !mine) return;
  const st = cur.state;
  if (st === "lobby") {
    app.innerHTML = `${status()}<div class="center"><div class="big">你已加入！</div><div class="muted">看大螢幕，等老師開始</div><div class="spinner"></div></div>`;
  } else if (st === "question") {
    const i = cur.i;
    const left = () => cur.time - (now() - cur.qStart) / 1000;
    if (i in answered) {
      app.innerHTML = `${status(`第 ${i + 1} 題`)}<div class="center"><div class="big">已作答</div><div class="muted">等其他同學…</div><div class="spinner"></div></div>`;
    } else if (left() <= 0) {
      app.innerHTML = `${status(`第 ${i + 1} 題`)}<div class="center"><div class="big">時間到</div></div>`;
    } else {
      const n = cur.n;
      let h = "";
      for (let c = 0; c < n; c++) h += `<button class="ans" data-c="${c}" style="background:${COLORS[c]}">${SHAPES[c]}</button>`;
      app.innerHTML = `${status(`第 ${i + 1} 題 <span id="tl"></span>`)}<div class="answers ${n <= 2 ? "n2" : ""}">${h}</div>`;
      app.querySelectorAll(".ans").forEach((b) => b.onclick = () => answer(i, +b.dataset.c));
      const upd = () => { const l = left(); if (l <= 0) render(); else $("#tl").textContent = `· ${Math.ceil(l)} 秒`; };
      upd(); tick = setInterval(upd, 250);
    }
  } else if (st === "reveal" || st === "leaderboard") {
    const L = mine.last && mine.last.i === cur.i ? mine.last : null;
    let cls = "bad", title = "沒有作答", sub = "";
    if (L?.ok) { cls = "ok"; title = "答對了！"; sub = `+${L.pts} 分${mine.streak > 1 ? `　🔥 連對 ${mine.streak} 題` : ""}`; }
    else if (L?.answered) { title = "答錯了"; }
    app.innerHTML = `${status(`第 ${cur.i + 1} 題`)}<div class="center ${cls}"><div class="huge">${L?.ok ? "✓" : "✗"}</div><div class="big">${title}</div><div>${sub}</div>${L ? `<div class="big">第 ${L.rank} 名</div>` : ""}</div>`;
    document.body.className = "play";
    if (navigator.vibrate) navigator.vibrate(L?.ok ? 80 : [60, 60, 60]);
  } else if (st === "end") {
    const L = mine.last;
    app.innerHTML = `${status()}<div class="center"><div class="big">遊戲結束</div>${L ? `<div class="huge">第 ${L.rank} 名</div>` : ""}<div class="big">${mine.score} 分</div><button class="linkbtn" id="again">加入其他遊戲</button></div>`;
    $("#again").onclick = () => { localStorage.removeItem(KEY); me = null; showJoin(); };
  }
}

async function answer(i, c) {
  if (i in answered) return;
  answered[i] = c;
  render();
  try { await set(P(`answers/${i}/${me.pid}`), { c, t: serverTimestamp() }); }
  catch (ex) { delete answered[i]; render(); alert("送出失敗，請再按一次"); }
}

if (me?.pid && me.pin === (new URLSearchParams(location.search).get("pin") || me.pin)) attach();
else showJoin();
