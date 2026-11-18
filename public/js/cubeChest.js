/* Cube Chest — placeable storage furniture, shared helpers, and iso art. */

import { outerwearById } from "./storeCatalog.js";
import { outfitById } from "./outfits.js";

export const CUBE_CHEST_TYPE = "cubechest";
export const CUBE_CHEST_NAME = "Cube Chest";
export const CUBE_CHEST_PRICE = 36;
export const CUBE_CHEST_CAP = 64;
export const PERSONAL_INV_CAP = 9;
export const DEFAULT_CHEST_TABS = { a: "Stash", b: "Keepsakes" };

export function emptyChestStore() {
  return { items: [], tabs: { a: DEFAULT_CHEST_TABS.a, b: DEFAULT_CHEST_TABS.b } };
}

export function sanitizeTabName(name, fallback = "Tab") {
  const s = String(name || "").replace(/\s+/g, " ").trim().slice(0, 16);
  return s || fallback;
}

export function normalizeChestStore(raw = {}) {
  const tabs = {
    a: sanitizeTabName(raw.tabs?.a, DEFAULT_CHEST_TABS.a),
    b: sanitizeTabName(raw.tabs?.b, DEFAULT_CHEST_TABS.b),
  };
  const items = Array.isArray(raw.items) ? raw.items.map(normalizeChestItem).filter(Boolean) : [];
  return { items: items.slice(0, CUBE_CHEST_CAP), tabs };
}

export function normalizeChestItem(it) {
  if (!it || it.id == null || it.id === "") return null;
  const kind = it.kind === "pet" ? "pet" : it.kind === "prop" ? "prop" : it.kind === "outerwear" ? "outerwear" : null;
  if (!kind) return null;
  const tag = it.tag === "a" || it.tag === "b" ? it.tag : "";
  const item = String(it.item || it.catalogId || "").slice(0, 40);
  if (!item) return null;
  return {
    id: String(it.id).slice(0, 48),
    kind,
    catalogId: it.catalogId ? String(it.catalogId).slice(0, 40) : null,
    slot: String(it.slot || (kind === "pet" ? "pet" : kind === "prop" ? "prop" : "torso")).slice(0, 16),
    item,
    label: String(it.label || item).slice(0, 32),
    tag,
  };
}

export function filterChestItems(items, tab) {
  const list = Array.isArray(items) ? items : [];
  if (!tab || tab === "all") return list;
  if (tab === "outerwear") return list.filter((i) => i.kind === "outerwear");
  if (tab === "pets") return list.filter((i) => i.kind === "pet");
  if (tab === "props") return list.filter((i) => i.kind === "prop");
  if (tab === "a" || tab === "b") return list.filter((i) => i.tag === tab);
  return list;
}

function stockSlot(stock, fallback) {
  if (!stock) return fallback;
  if (stock.slot === "hat") return "head";
  if (stock.slot === "cloak") return "torso";
  if (stock.slot === "pants") return "legs";
  return stock.slot || fallback;
}

export function listUnequippedCollection(user) {
  const col = user?.collection || {};
  const gear = user?.gear || {};
  const items = [];
  const seenProp = new Set();
  for (const o of col.outerwear || []) {
    const stock = outerwearById(o.catalogId) || outfitById(o.catalogId);
    const slot = stockSlot(stock, o.slot);
    if (!slot) continue;
    const propItem = stock?.item?.prop || (typeof stock?.item === "string" && slot === "prop" ? stock.item : null);
    const equipped = slot === "prop"
      ? Boolean(user.heldProp && propItem && propItem === user.heldProp)
      : (gear[slot] === o.catalogId);
    if (equipped) {
      if (slot === "prop" && propItem) seenProp.add(propItem);
      continue;
    }
    const itemKey = slot === "prop" ? (propItem || o.item?.prop) : o.catalogId;
    if (slot === "prop" && itemKey) seenProp.add(itemKey);
    if (!itemKey) continue;
    items.push({
      id: o.id || o.catalogId,
      catalogId: o.catalogId,
      kind: slot === "prop" ? "prop" : "outerwear",
      slot,
      item: itemKey,
      label: o.label || stock?.label || o.catalogId,
      tag: "",
    });
  }
  for (const pet of col.pets || []) {
    if (user.activePet === pet.item) continue;
    items.push({
      id: pet.id || pet.item,
      kind: "pet",
      slot: "pet",
      item: pet.item,
      catalogId: null,
      label: pet.label || pet.item,
      tag: "",
    });
  }
  for (const prop of col.props || []) {
    if (!prop.item || user.heldProp === prop.item || seenProp.has(prop.item)) continue;
    items.push({
      id: prop.id || prop.item,
      kind: "prop",
      slot: "prop",
      item: prop.item,
      catalogId: null,
      label: prop.label || prop.item,
      tag: "",
    });
  }
  return items;
}

export function chestOpenPad(open) {
  // Extra canvas so upward beams and sparkles are not clipped at default zoom.
  return open ? { side: 36, top: 64 } : { side: 0, top: 0 };
}

function lerp(a, b, t) {
  return a + (b - a) * t;
}

function stickerGrid(iso, ctx, fc, colors, ink, rows = 2, cols = 2, inset = 0.12) {
  const { faceRect } = iso;
  const uw = (1 - inset * 2) / cols;
  const vh = (1 - inset * 2) / rows;
  let i = 0;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const u0 = inset + c * uw + 0.03;
      const v0 = inset + r * vh + 0.03;
      const u1 = inset + (c + 1) * uw - 0.03;
      const v1 = inset + (r + 1) * vh - 0.03;
      faceRect(ctx, fc, u0, v0, u1, v1, colors[i % colors.length], ink);
      i++;
    }
  }
}

function star(ctx, x, y, size, color) {
  ctx.fillStyle = color;
  const s = Math.max(1, size);
  ctx.fillRect(Math.round(x) - s, Math.round(y), s * 2 + 1, 1);
  ctx.fillRect(Math.round(x), Math.round(y) - s, 1, s * 2 + 1);
  if (s >= 2) {
    ctx.fillRect(Math.round(x) - 1, Math.round(y) - 1, 3, 3);
  }
}

export function drawCubeChest(ctx, tw, th, rot, lights, opts = {}, iso) {
  const { box, pal, shadow, insetBox, visibleFront, faceCorners, faceRect, normalizeFurnRot, fillPts, pt } = iso;
  const full = insetBox(tw, th);
  const open = Boolean(opts.open);
  const lidT = open ? Math.max(0, Math.min(1, (opts.lid ?? 7) / 7)) : 0;
  const shine = open ? ((opts.shine ?? 0) % 8) : 0;
  const bodyH = 15;
  const wood = pal("#5a3a22", lights, { gold: "#e8c44a", ink: "#2a1810" });
  const gold = pal("#e0b43a", lights);
  const r = normalizeFurnRot(rot);

  shadow(ctx, full.x, full.y, full.w, full.h, 0.32);
  box(ctx, full.x, full.y, full.w, full.h, 0, bodyH, wood);

  const bands = [
    pal("#d82a32", true).base,
    pal("#2a5ae0", true).base,
    pal("#22b84a", true).base,
    pal("#f0c428", true).base,
    pal("#f4f0e8", true).base,
    pal("#f07818", true).base,
  ];
  const ink = wood.ink || "#2a1810";
  const fronts = [];
  if (r === 0) fronts.push("+y");
  else if (r === 1) fronts.push("+x");
  else if (r === 2) fronts.push("-y");
  else fronts.push("-x");
  // Always decorate the two visible side faces when we can see them.
  const vis = r === 0 || r === 1 ? [visibleFront(r), r === 0 ? "+x" : "+y"] : ["-y", "-x"];
  for (const side of vis) {
    if (!side) continue;
    const fc = faceCorners(full.x, full.y, full.w, full.h, 0, bodyH, side);
    if (!fc) continue;
    faceRect(ctx, fc, 0.08, 0.10, 0.92, 0.92, lights ? "#6a4428" : "#3a2818", ink);
    stickerGrid(iso, ctx, fc, bands, ink, 2, 2, 0.16);
  }

  const front = visibleFront(r);
  if (front && lidT < 0.45) {
    const fc = faceCorners(full.x, full.y, full.w, full.h, 0, bodyH, front);
    faceRect(ctx, fc, 0.42, 0.48, 0.58, 0.78, gold.top, ink);
    faceRect(ctx, fc, 0.38, 0.42, 0.62, 0.52, gold.right, ink);
  }

  // Gold trim around the lid seam.
  const seam = pal("#c9a24a", lights);
  box(ctx, full.x - 0.02, full.y - 0.02, full.w + 0.04, full.h + 0.04, bodyH - 1, 2, seam);

  if (lidT > 0.2) {
    // Dark wood well so the light pouring out has contrast, plus a warm gold floor.
    box(ctx, full.x + 0.08, full.y + 0.08, full.w - 0.16, full.h - 0.16, bodyH - 1, 2, {
      top: lights ? "#7a4a12" : "#5a3410",
      left: lights ? "#a86a18" : "#7a4a12",
      right: lights ? "#5a340c" : "#3a2008",
      outline: "#c9a24a",
    });
    box(ctx, full.x + 0.22, full.y + 0.22, full.w - 0.44, full.h - 0.44, bodyH + 1, 0, {
      top: lights ? "#ffe9a0" : "#f0c050",
      left: "#ffe9a0",
      right: "#ffd060",
      outline: "#fff4c4",
    });
  }

  const lidDepth = lerp(full.h, 0.14, lidT);
  const lidHeight = lerp(8, 18, lidT);
  const lidPal = pal("#f4efe4", lights, { edge: "#3a7adc" });
  box(ctx, full.x, full.y, full.w, lidDepth, bodyH, lidHeight, {
    top: lights ? "#fffaf0" : "#e8dcc0",
    left: bands[1],
    right: bands[0],
    outline: ink,
  });
  // Colored lid top tiles so it reads as a cube even when closed.
  if (lidT < 0.55) {
    const mid = 0.12;
    box(ctx, full.x + mid, full.y + mid, (full.w - mid * 2) / 2 - 0.02, (full.h - mid * 2) / 2 - 0.02, bodyH + lidHeight, 0, { top: bands[4], left: bands[4], right: bands[4], outline: ink });
    box(ctx, full.x + full.w / 2 + 0.02, full.y + mid, (full.w - mid * 2) / 2 - 0.02, (full.h - mid * 2) / 2 - 0.02, bodyH + lidHeight, 0, { top: bands[3], left: bands[3], right: bands[3], outline: ink });
    box(ctx, full.x + mid, full.y + full.h / 2 + 0.02, (full.w - mid * 2) / 2 - 0.02, (lidDepth > full.h / 2 ? (lidDepth - mid * 2) / 2 - 0.02 : 0.08), bodyH + lidHeight, 0, { top: bands[2], left: bands[2], right: bands[2], outline: ink });
    box(ctx, full.x + full.w / 2 + 0.02, full.y + full.h / 2 + 0.02, (full.w - mid * 2) / 2 - 0.02, (lidDepth > full.h / 2 ? (lidDepth - mid * 2) / 2 - 0.02 : 0.08), bodyH + lidHeight, 0, { top: bands[5], left: bands[5], right: bands[5], outline: ink });
  }

  if (lidT < 0.2) {
    // Closed latch on the near edge of the lid.
    const latchW = 0.18, latchH = 0.12;
    box(ctx, full.x + (full.w - latchW) / 2, full.y + full.h - latchH - 0.04, latchW, latchH, bodyH + lidHeight, 2, gold);
  }

  if (lidT < 0.28) return;

  const mouth = pt(full.x + full.w / 2, full.y + full.h * 0.42, bodyH + 3);
  const strength = Math.min(1, (lidT - 0.28) / 0.72);
  const pulse = 0.78 + 0.22 * Math.sin((shine / 8) * Math.PI * 2);
  const rise = (shine % 8) * 1.6;

  ctx.save();

  // Warm bloom that pours up out of the open well. Keep it tight enough
  // that the fanning beams still read as distinct rays.
  const blooms = [
    { a: 0.32 * strength * pulse, rx: 28, ry: 34, dy: -16, c: "rgba(255, 196, 60, 1)" },
    { a: 0.40 * strength * pulse, rx: 18, ry: 26, dy: -12, c: "rgba(255, 226, 110, 1)" },
    { a: 0.55 * strength, rx: 12, ry: 16, dy: -6, c: "rgba(255, 248, 200, 1)" },
  ];
  for (const b of blooms) {
    ctx.globalAlpha = b.a;
    ctx.fillStyle = b.c;
    ctx.beginPath();
    ctx.ellipse(mouth.x, mouth.y + b.dy, b.rx, b.ry, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  // Beams fanning upward from inside the well — wide wash plus a sharp core.
  const rays = 7;
  for (let i = 0; i < rays; i++) {
    const mid = (rays - 1) / 2;
    const ang = -Math.PI / 2 + (i - mid) * 0.28 + ((shine % 4) - 1.5) * 0.016;
    const len = (48 + Math.abs(i - mid) * 4 + (shine % 3) * 3) * (0.88 + 0.2 * pulse) * (0.8 + 0.2 * strength);
    const x0 = mouth.x;
    const y0 = mouth.y + 2;
    const wash = 0.09;
    const core = 0.028;
    const tipX = x0 + Math.cos(ang) * len;
    const tipY = y0 + Math.sin(ang) * len;
    ctx.globalAlpha = (i === mid ? 0.72 : 0.5) * strength * pulse;
    ctx.fillStyle = i % 2 === 0 ? "rgba(255, 220, 90, 1)" : "rgba(255, 242, 180, 1)";
    ctx.beginPath();
    ctx.moveTo(x0 + Math.cos(ang - wash) * 3, y0 + Math.sin(ang - wash) * 2);
    ctx.lineTo(tipX, tipY);
    ctx.lineTo(x0 + Math.cos(ang + wash) * 3, y0 + Math.sin(ang + wash) * 2);
    ctx.closePath();
    ctx.fill();
    ctx.globalAlpha = 0.85 * strength * pulse;
    ctx.fillStyle = "rgba(255, 255, 240, 1)";
    ctx.beginPath();
    ctx.moveTo(x0 + Math.cos(ang - core) * 2, y0 + Math.sin(ang - core) * 1);
    ctx.lineTo(x0 + Math.cos(ang) * (len * 0.92), y0 + Math.sin(ang) * (len * 0.92));
    ctx.lineTo(x0 + Math.cos(ang + core) * 2, y0 + Math.sin(ang + core) * 1);
    ctx.closePath();
    ctx.fill();
  }

  // Bright core sitting in the mouth of the chest, drawn after the beams
  // so the light clearly originates inside and pours outward.
  ctx.globalAlpha = 0.95 * strength;
  ctx.fillStyle = "rgba(255, 252, 230, 1)";
  ctx.beginPath();
  ctx.ellipse(mouth.x, mouth.y + 1, 9, 6, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalAlpha = 0.8 * strength * pulse;
  ctx.fillStyle = "rgba(255, 236, 140, 1)";
  ctx.beginPath();
  ctx.ellipse(mouth.x, mouth.y - 3, 6, 8, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalAlpha = 1;

  const stars = [
    [mouth.x - 14, mouth.y - 16, 2],
    [mouth.x + 16, mouth.y - 22, 2],
    [mouth.x - 6, mouth.y - 30, 2],
    [mouth.x + 4, mouth.y - 12, 2],
    [mouth.x + 20, mouth.y - 8, 1],
    [mouth.x - 20, mouth.y - 6, 1],
    [mouth.x + 10, mouth.y - 38, 2],
    [mouth.x - 18, mouth.y - 28, 1],
    [mouth.x + 1, mouth.y - 46, 2],
    [mouth.x - 8, mouth.y - 20, 1],
  ];
  for (let i = 0; i < stars.length; i++) {
    if ((shine + i) % 4 === 0) continue;
    const [sx, sy0, sz] = stars[i];
    const sy = sy0 - rise * (0.6 + (i % 3) * 0.2);
    const col = (shine + i) % 2 === 0 ? "#fffce6" : "#ffd56a";
    ctx.globalAlpha = 0.7 * strength + 0.3 * pulse;
    star(ctx, sx, sy, sz + ((shine + i) % 3 === 0 ? 1 : 0), col);
  }
  ctx.globalAlpha = 1;
  ctx.restore();
}
