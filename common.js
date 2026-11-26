// 共用：Firebase 連線、伺服器時間、顏色形狀、跳脫字元
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
  getDatabase, ref, onValue, set, update, get, push, remove, serverTimestamp, off,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js";
import { firebaseConfig } from "./config.js";

export const db = getDatabase(initializeApp(firebaseConfig));
export { ref, onValue, set, update, get, push, remove, serverTimestamp, off };

// 以伺服器時間為準，避免每支手機時鐘不同
let offset = 0;
onValue(ref(db, ".info/serverTimeOffset"), (s) => { offset = s.val() || 0; });
export const now = () => Date.now() + offset;

export const COLORS = ["#e21b3c", "#1368ce", "#d89e00", "#26890c", "#864cbf", "#0aa3a3"];
export const SHAPES = ["▲", "◆", "●", "■", "★", "⬟"];
export const LETTERS = "ABCDEF";

export const esc = (s) => String(s ?? "").replace(/[&<>"']/g,
  (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

export const $ = (sel) => document.querySelector(sel);
