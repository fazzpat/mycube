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
  return open ? { side: 18, top: 26 } : { side: 0, top: 0 };
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
    const glow = lights ? "#fff6c4" : "#ffe9a0";
    const inner = lights ? "#fffceb" : "#ffe08a";
    box(ctx, full.x + 0.08, full.y + 0.08, full.w - 0.16, full.h - 0.16, bodyH - 1, 2, {
      top: inner, left: glow, right: glow, outline: "#c9a24a",
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

  if (lidT < 0.35) return;

  const origin = pt(full.x + full.w / 2, full.y + full.h / 2, bodyH + 2);
  const strength = Math.min(1, (lidT - 0.35) / 0.65);
  const pulse = 0.7 + 0.3 * Math.sin((shine / 8) * Math.PI * 2);

  // Soft halo behind / around the opening.
  ctx.save();
  const rings = [
    { a: 0.22 * strength * pulse, r: 28, c: "rgba(255, 236, 140, 1)" },
    { a: 0.18 * strength, r: 20, c: "rgba(180, 230, 255, 1)" },
    { a: 0.16 * strength * pulse, r: 14, c: "rgba(220, 170, 255, 1)" },
  ];
  for (const ring of rings) {
    ctx.globalAlpha = ring.a;
    ctx.fillStyle = ring.c;
    ctx.beginPath();
    ctx.ellipse(origin.x, origin.y - 4, ring.r, ring.r * 0.7, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;

  // Light rays shooting outward.
  const rays = 6;
  for (let i = 0; i < rays; i++) {
    const ang = -Math.PI / 2 + (i - (rays - 1) / 2) * 0.38 + (shine % 2) * 0.04;
    const len = 22 + (i % 3) * 4 + (shine % 3);
    const spread = 0.09;
    const x1 = origin.x + Math.cos(ang - spread) * 3;
    const y1 = origin.y + Math.sin(ang - spread) * 2;
    const x2 = origin.x + Math.cos(ang + spread) * 3;
    const y2 = origin.y + Math.sin(ang + spread) * 2;
    const x3 = origin.x + Math.cos(ang) * len;
    const y3 = origin.y + Math.sin(ang) * len;
    ctx.globalAlpha = 0.28 * strength * pulse;
    ctx.fillStyle = i % 2 ? "rgba(255, 248, 200, 1)" : "rgba(200, 240, 255, 1)";
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x3, y3);
    ctx.lineTo(x2, y2);
    ctx.closePath();
    ctx.fill();
  }
  ctx.globalAlpha = 1;

  const stars = [
    [origin.x - 16, origin.y - 14, 2],
    [origin.x + 15, origin.y - 18, 2],
    [origin.x - 8, origin.y - 22, 1],
    [origin.x + 6, origin.y - 10, 2],
    [origin.x + 18, origin.y - 6, 1],
    [origin.x - 18, origin.y - 4, 1],
  ];
  for (let i = 0; i < stars.length; i++) {
    if ((shine + i) % 5 === 0) continue;
    const [sx, sy, sz] = stars[i];
    const col = (shine + i) % 2 === 0 ? "#fffce6" : "#d8ffff";
    ctx.globalAlpha = 0.55 * strength + 0.45;
    star(ctx, sx, sy, sz, col);
  }
  ctx.globalAlpha = 1;
  ctx.restore();
}
