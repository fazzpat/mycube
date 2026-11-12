import { canonHex } from "./hexColor.js";

function hexToRgb(hex) {
  const h = canonHex(hex) || "#ff4d6d";
  return {
    r: parseInt(h.slice(1, 3), 16),
    g: parseInt(h.slice(3, 5), 16),
    b: parseInt(h.slice(5, 7), 16),
  };
}

function rgbToHex(r, g, b) {
  const n = (v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, "0");
  return `#${n(r)}${n(g)}${n(b)}`;
}

function rgbToHsv(r, g, b) {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  const d = max - min;
  let h = 0;
  if (d) {
    if (max === r) h = ((g - b) / d) % 6;
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h *= 60;
    if (h < 0) h += 360;
  }
  return { h, s: max ? d / max : 0, v: max };
}

function hsvToRgb(h, s, v) {
  const c = v * s;
  const x = c * (1 - Math.abs((h / 60) % 2 - 1));
  const m = v - c;
  let r = 0, g = 0, b = 0;
  if (h < 60) { r = c; g = x; }
  else if (h < 120) { r = x; g = c; }
  else if (h < 180) { g = c; b = x; }
  else if (h < 240) { g = x; b = c; }
  else if (h < 300) { r = x; b = c; }
  else { r = c; b = x; }
  return { r: (r + m) * 255, g: (g + m) * 255, b: (b + m) * 255 };
}

function hsvToHex(h, s, v) {
  const { r, g, b } = hsvToRgb(h, s, v);
  return rgbToHex(r, g, b);
}

const DISC = 132;
const SLIDER_H = 18;

let pop = null;
let discCv = null;
let discCache = null;
let sliderCv = null;
let hsv = { h: 0, s: 1, v: 1 };
let onLive = null;
let onClose = null;
let closeTimer = 0;
let openedAt = 0;

function ensurePop() {
  if (pop) return pop;
  pop = document.createElement("div");
  pop.id = "color-wheel-pop";
  pop.className = "color-wheel-pop hidden";
  pop.dataset.testid = "color-wheel";
  pop.setAttribute("role", "dialog");
  pop.setAttribute("aria-label", "Color wheel");
  pop.innerHTML = `
    <div class="color-wheel-head">
      <span class="color-wheel-preview" data-testid="color-wheel-preview"></span>
      <button type="button" class="color-wheel-ok" data-testid="color-wheel-ok" aria-label="Done">✓</button>
    </div>
    <canvas class="color-wheel-disc" data-testid="color-wheel-disc" width="${DISC}" height="${DISC}"></canvas>
    <canvas class="color-wheel-brightness" data-testid="color-wheel-brightness" width="${DISC}" height="${SLIDER_H}"></canvas>
  `;
  document.body.appendChild(pop);
  discCv = pop.querySelector(".color-wheel-disc");
  sliderCv = pop.querySelector(".color-wheel-brightness");
  pop.querySelector(".color-wheel-ok").addEventListener("click", (e) => {
    e.preventDefault();
    e.stopPropagation();
    closeColorWheel();
  });
  bindDrag(discCv, setFromDisc);
  bindDrag(sliderCv, setFromSlider);
  document.addEventListener("pointerdown", (e) => {
    if (!isColorWheelOpen()) return;
    if (Date.now() - openedAt < 200) return;
    const t = e.target;
    if (t?.closest?.("#color-wheel-pop") || t?.closest?.(".color-wheel-swatch")) return;
    closeColorWheel();
  }, true);
  return pop;
}

function bindDrag(el, handler) {
  const move = (e) => {
    if (!el.hasPointerCapture?.(e.pointerId) && el._down !== e.pointerId) return;
    handler(e);
  };
  const up = (e) => {
    el._down = null;
    try { el.releasePointerCapture?.(e.pointerId); } catch {}
    el.removeEventListener("pointermove", move);
    el.removeEventListener("pointerup", up);
    el.removeEventListener("pointercancel", up);
  };
  el.addEventListener("pointerdown", (e) => {
    e.preventDefault();
    e.stopPropagation();
    el._down = e.pointerId;
    try { el.setPointerCapture?.(e.pointerId); } catch {}
    el.addEventListener("pointermove", move);
    el.addEventListener("pointerup", up);
    el.addEventListener("pointercancel", up);
    handler(e);
  });
}

function setFromDisc(e) {
  const r = discCv.getBoundingClientRect();
  const cx = r.left + r.width / 2;
  const cy = r.top + r.height / 2;
  const dx = e.clientX - cx;
  const dy = e.clientY - cy;
  const rad = Math.min(r.width, r.height) / 2 - 2;
  const dist = Math.sqrt(dx * dx + dy * dy);
  hsv.h = (Math.atan2(dy, dx) * 180 / Math.PI + 360) % 360;
  hsv.s = Math.max(0, Math.min(1, dist / rad));
  emitLive();
  paintWheel();
}

function setFromSlider(e) {
  const r = sliderCv.getBoundingClientRect();
  hsv.v = Math.max(0, Math.min(1, (e.clientX - r.left) / r.width));
  emitLive();
  paintWheel();
}

function emitLive() {
  const hex = hsvToHex(hsv.h, hsv.s, hsv.v);
  const preview = pop?.querySelector(".color-wheel-preview");
  if (preview) preview.style.background = hex;
  onLive?.(hex);
}

function paintDiscCache() {
  if (discCache && discCache.size === DISC) return;
  discCache = document.createElement("canvas");
  discCache.width = DISC;
  discCache.height = DISC;
  const ctx = discCache.getContext("2d");
  const img = ctx.createImageData(DISC, DISC);
  const cx = DISC / 2, cy = DISC / 2, rad = DISC / 2 - 2;
  for (let y = 0; y < DISC; y++) {
    for (let x = 0; x < DISC; x++) {
      const dx = x - cx, dy = y - cy;
      const dist = Math.sqrt(dx * dx + dy * dy);
      const i = (y * DISC + x) * 4;
      if (dist > rad) {
        img.data[i + 3] = 0;
        continue;
      }
      const h = (Math.atan2(dy, dx) * 180 / Math.PI + 360) % 360;
      const s = dist / rad;
      const { r, g, b } = hsvToRgb(h, s, 1);
      img.data[i] = r;
      img.data[i + 1] = g;
      img.data[i + 2] = b;
      img.data[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
}

function paintWheel() {
  if (!discCv || !sliderCv) return;
  paintDiscCache();
  const dctx = discCv.getContext("2d");
  dctx.clearRect(0, 0, DISC, DISC);
  dctx.drawImage(discCache, 0, 0);
  const rad = DISC / 2 - 2;
  const hx = DISC / 2 + Math.cos(hsv.h * Math.PI / 180) * hsv.s * rad;
  const hy = DISC / 2 + Math.sin(hsv.h * Math.PI / 180) * hsv.s * rad;
  dctx.beginPath();
  dctx.arc(hx, hy, 6, 0, Math.PI * 2);
  dctx.strokeStyle = "#fff";
  dctx.lineWidth = 2;
  dctx.stroke();
  dctx.beginPath();
  dctx.arc(hx, hy, 6, 0, Math.PI * 2);
  dctx.strokeStyle = "#1a1020";
  dctx.lineWidth = 1;
  dctx.stroke();

  const sctx = sliderCv.getContext("2d");
  const grad = sctx.createLinearGradient(0, 0, DISC, 0);
  const dark = hsvToHex(hsv.h, hsv.s, 0);
  const light = hsvToHex(hsv.h, hsv.s, 1);
  grad.addColorStop(0, dark);
  grad.addColorStop(1, light);
  sctx.clearRect(0, 0, DISC, SLIDER_H);
  sctx.fillStyle = grad;
  sctx.fillRect(0, 0, DISC, SLIDER_H);
  const sx = hsv.v * (DISC - 1);
  sctx.fillStyle = "#fff";
  sctx.fillRect(sx - 2, 0, 4, SLIDER_H);
  sctx.strokeStyle = "#1a1020";
  sctx.strokeRect(sx - 2, 0.5, 4, SLIDER_H - 1);
}

function placePopover(anchor, avoid, within) {
  const w = pop.offsetWidth || 164;
  const h = pop.offsetHeight || 210;
  const a = anchor.getBoundingClientRect();
  const row = anchor.closest(".swatch-row, .swatch-colors, .edit-decor-row, .creator-tab-panels");
  const leftCol = document.querySelector(".edit-char-overlay:not(.hidden) .creator-left, .creator-window.is-rail-layout .creator-left");
  const inventory = document.querySelector("#edit-inventory:not(.hidden)");
  const preview = document.querySelector(".edit-char-overlay:not(.hidden) .edit-char-preview-wrap, .edit-char-overlay:not(.hidden) #creator-preview, #ward-preview");
  const choices = [...document.querySelectorAll(".edit-char-overlay:not(.hidden) .creator-tab-panels .choice")];
  const boxEl = leftCol || within || document.body;
  const box = boxEl.getBoundingClientRect();
  const pad = 8;
  // For the room wheel, sit just above the inventory so it does not cover option tiles.
  const clampBox = inventory && !leftCol
    ? { left: pad, top: pad, right: window.innerWidth - pad, bottom: inventory.getBoundingClientRect().top - 8 }
    : { left: Math.max(pad, box.left + pad), top: Math.max(pad, box.top + pad), right: Math.min(window.innerWidth - pad, box.right - pad), bottom: Math.min(window.innerHeight - pad, box.bottom - pad) };
  const avoidRects = [...(avoid || []), preview, inventory, ...choices].filter(Boolean).map((el) => el.getBoundingClientRect());
  const rowR = (row || anchor).getBoundingClientRect();
  const overlaps = (r, rects) => rects.some((b) => r.left < b.right - 4 && r.right > b.left + 4 && r.top < b.bottom - 4 && r.bottom > b.top + 4);
  const candidates = [
    { left: rowR.left, top: rowR.bottom + 8 },
    { left: clampBox.left, top: rowR.bottom + 8 },
    { left: rowR.left, top: rowR.top - 8 - h },
    { left: clampBox.left, top: rowR.top - 8 - h },
    { left: clampBox.left, top: clampBox.bottom - h },
    { left: a.left - w - 8, top: a.top },
  ];
  if (inventory && !leftCol) {
    const ir = inventory.getBoundingClientRect();
    candidates.unshift(
      { left: ir.right - w - 12, top: ir.top - 8 - h },
      { left: ir.left + 12, top: ir.top - 8 - h },
    );
  }
  let best = null, score = -1e9;
  for (const c of candidates) {
    const left = Math.min(Math.max(c.left, clampBox.left), Math.max(clampBox.left, clampBox.right - w));
    const top = Math.min(Math.max(c.top, clampBox.top), Math.max(clampBox.top, clampBox.bottom - h));
    const r = { left, top, right: left + w, bottom: top + h };
    const inBox = r.right <= clampBox.right + 1 && r.bottom <= clampBox.bottom + 1 && r.left >= clampBox.left - 1 && r.top >= clampBox.top - 1;
    const s = (overlaps(r, avoidRects) ? -1000 : 200) + (inBox ? 80 : -20);
    if (s > score) { score = s; best = r; }
  }
  pop.style.left = Math.round(best.left) + "px";
  pop.style.top = Math.round(best.top) + "px";
}

export function isColorWheelOpen() {
  return Boolean(pop && !pop.classList.contains("hidden"));
}

export function closeColorWheel() {
  if (!isColorWheelOpen()) return;
  pop.classList.add("hidden");
  const cb = onClose;
  onLive = null;
  onClose = null;
  cb?.();
}

export function openColorWheel({ anchor, color, onLive: live, onClose: closed, avoid, within } = {}) {
  ensurePop();
  if (closeTimer) clearTimeout(closeTimer);
  onLive = live || null;
  onClose = closed || null;
  const hex = canonHex(color) || "#ff4d6d";
  const rgb = hexToRgb(hex);
  hsv = rgbToHsv(rgb.r, rgb.g, rgb.b);
  pop.classList.remove("hidden");
  openedAt = Date.now();
  paintWheel();
  const preview = pop.querySelector(".color-wheel-preview");
  if (preview) preview.style.background = hex;
  placePopover(anchor, avoid, within);
  requestAnimationFrame(() => placePopover(anchor, avoid, within));
}

export function setColorWheelHex(hex) {
  const next = canonHex(hex);
  if (!next || !isColorWheelOpen()) return null;
  const rgb = hexToRgb(next);
  hsv = rgbToHsv(rgb.r, rgb.g, rgb.b);
  paintWheel();
  emitLive();
  return next;
}

if (typeof window !== "undefined") {
  window.__setColorWheel = setColorWheelHex;
  window.__closeColorWheel = closeColorWheel;
}
