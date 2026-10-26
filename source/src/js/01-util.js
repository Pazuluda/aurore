/* ===================== utilitaires ===================== */
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));

class Raw { constructor(s) { this.s = s; } toString() { return this.s; } }
const raw = (s) => new Raw(String(s));
const ESC = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ESC[c]);
function renderVal(v) {
  if (v == null || v === false || v === true) return "";
  if (v instanceof Raw) return v.s;
  if (Array.isArray(v)) return v.map(renderVal).join("");
  return esc(v);
}
function html(strings, ...vals) {
  let out = strings[0];
  for (let i = 0; i < vals.length; i++) out += renderVal(vals[i]) + strings[i + 1];
  return new Raw(out);
}
function setHTML(el, content) { el.innerHTML = content instanceof Raw ? content.s : renderVal(content); }

const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const lerp = (a, b, t) => a + (b - a) * t;

function fmtTime(sec) {
  if (!isFinite(sec) || sec < 0) sec = 0;
  sec = Math.floor(sec);
  const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s = sec % 60;
  return h ? `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}` : `${m}:${String(s).padStart(2, "0")}`;
}
function fmtLong(sec) {
  sec = Math.round(sec || 0);
  const h = Math.floor(sec / 3600), m = Math.round((sec % 3600) / 60);
  if (h >= 1) return m ? `${h} h ${m} min` : `${h} h`;
  if (m >= 1) return `${m} min`;
  return `${sec} s`;
}
function fmtBytes(b) {
  if (b >= 1e9) return (b / 1e9).toFixed(1).replace(".", ",") + " Go";
  if (b >= 1e6) return Math.round(b / 1e6) + " Mo";
  return Math.max(1, Math.round(b / 1e3)) + " Ko";
}
const plural = (n, one, many) => `${n.toLocaleString("fr-FR")} ${n > 1 ? many : one}`;

function norm(s) {
  return String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/\s+/g, " ").trim();
}
function sortKey(s) { return norm(s).replace(/^(the|le|la|les|l')\s*/, ""); }
const collator = new Intl.Collator("fr", { sensitivity: "base", numeric: true });
const cmp = (a, b) => collator.compare(a, b);

function hash(str) {
  let h1 = 0x811c9dc5, h2 = 0x01000193;
  for (let i = 0; i < str.length; i++) {
    const c = str.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 16777619);
    h2 = Math.imul(h2 ^ c, 2246822519);
  }
  return ((h1 >>> 0).toString(36) + (h2 >>> 0).toString(36));
}
function debounce(fn, ms) { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; }
function shuffleArr(a) { for (let i = a.length - 1; i > 0; i--) { const j = (Math.random() * (i + 1)) | 0; [a[i], a[j]] = [a[j], a[i]]; } return a; }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const store = {
  get(k, d) { try { const v = localStorage.getItem("aurore:" + k); return v == null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { try { localStorage.setItem("aurore:" + k, JSON.stringify(v)); } catch { /* stockage indisponible */ } },
};
const isTouch = () => matchMedia("(hover: none)").matches;
const UA = navigator.userAgent || "";
const IS_IOS = /iPhone|iPad|iPod/.test(UA) || (/Macintosh/.test(UA) && navigator.maxTouchPoints > 1);
const IS_MOBILE = IS_IOS || /Android/i.test(UA);
const isStandalone = () => matchMedia("(display-mode: standalone)").matches || navigator.standalone === true;
const APP_URL = ""; /* adresse de la version installable, renseignée au build */
const IN_FRAME = (() => { try { return window.top !== window.self; } catch { return true; } })();
const isPhone = () => matchMedia("(max-width: 760px)").matches;
