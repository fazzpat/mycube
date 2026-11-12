import { drawAvatarSprite, paintAvatarSheet, paintStoreThumb, AVATAR_SHEET_LOOKS, AV_W, AV_H, AV_GROUND_Y, AV_HEAD_TOP, facingIndex8, tickChibiAnim, setChibiAnimOverride, getChibiAnim, mouthPhase, heldItemHandAnchor, heldItemFaceAnchor } from "./avatar3d.js";
import { heldKindOf, drawHeldItemSprite, sipAnim, steamFrameAt as heldSteamFrameAt, drawSipFaceOverlay } from "./heldItems.js";
import { drawPetSprite as drawPetPixel, paintPetSheet, paintPetThumb, PET_W, PET_H, PET_GROUND_Y } from "./petSprites.js";
import { programAt } from "./cubechannel.js";
import { getTvScreen, tvChannelName } from "./tvChannels.js";
import {
  normalizeFurnRot, snapFacingToAxis, furnTileDims, furnSpriteMetrics, furnBlitPos,
  drawFurnitureSprite, drawChessStoolSprite, paintFurnitureSheet, hitFurnitureAt, FURN_SHEET_TYPES, tvGlowColor, tvScreenQuadSprite,
} from "./furnIso.js";
import { doorSlot as layoutDoorSlot, switchSlot as layoutSwitchSlot, windowSlots as layoutWindowSlots } from "./wallLayout.js";
import { DEFAULT_DECOR, normalizeDecor, legacyAliases, floorColorHex, wallColorPal, drawWindowScenery, shadeHex } from "./roomDecor.js";
import { chessSeatPose, chessBoardMetrics } from "./chessTable.js";
import { steamFrameAt } from "./coffeeMaker.js";
import { steamFrameAt as stoveSteamFrameAt, flameFrameAt } from "./stove.js";
import { CUE_RACK_TYPE, drawCueRackOnWall, cueRackQuad } from "./billiards.js";
import { lieDrawPose, bedZeds, drawBedZeds } from "./bed.js";
import { isSeatType, seatCushionLift, sitEaseT, sitBob, seatBackDepth } from "./seats.js";
import {
  TYPE as RECORD_TYPE, spinFrameAt, notesAt, drawNotes, platterOffset, paintListenHint,
  isRecordListening,
} from "./recordPlayer.js";
import { isPainting, drawPaintingOnWall, preloadPaintings, ART_TILE_SPAN, ART_WORLD_UP, ART_HANG_UP, ART_SIZE } from "./artPieces.js";
preloadPaintings();
/* 2D isometric pixel room renderer — 2000s house style, HouseRoom3D API. */
const TW = 64;
const TH = 32;
const WALL_H = 88;
const FOLLOW_ZOOM_DEFAULT = 2;
const USER_ZOOM_MIN = 0.5; // half the previous 1x floor, so a 10x10 cube fits on a 375px phone
const USER_ZOOM_MAX = 4;
const USER_ZOOM_ABS_MIN = 0.35;
const TAP_SLOP = 8;

function isPhoneView() {
  if (typeof window === "undefined") return false;
  return window.innerWidth <= 820;
}

function clampUserZoom(z, minZ = USER_ZOOM_MIN) {
  const n = Number(z);
  if (!Number.isFinite(n)) return FOLLOW_ZOOM_DEFAULT;
  const lo = Number.isFinite(minZ) ? minZ : USER_ZOOM_MIN;
  return Math.max(lo, Math.min(USER_ZOOM_MAX, n));
}

function snapZoom(z) {
  // Kept for older callers; camera uses continuous zoom from ~0.5x–4x.
  return clampUserZoom(z);
}

function hexToRgb(hex) {
  const n = parseInt(String(hex).replace("#", ""), 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}

function shade(hex, amt) {
  const { r, g, b } = hexToRgb(hex);
  const c = (v) => Math.max(0, Math.min(255, v + amt));
  return "#" + ((1 << 24) + (c(r) << 16) + (c(g) << 8) + c(b)).toString(16).slice(1);
}

function mix(a, b, t) {
  const A = hexToRgb(a), B = hexToRgb(b);
  const c = (x, y) => Math.round(x + (y - x) * t);
  return "#" + ((1 << 24) + (c(A.r, B.r) << 16) + (c(A.g, B.g) << 8) + c(A.b, B.b)).toString(16).slice(1);
}

const NEON = {
  mag: "#c43a4a",
  cyan: "#6a6258",
  purp: "#6b4a32",
  acid: "#c4a35a",
  metal: "#3a3834",
  metal2: "#5a564e",
  metal3: "#8a8478",
  ink: "#2a1c16",
  glow: "#f4c15d",
};

const WALL_COLORS = {
  "paint-cream": { base: "#efe4d2", grout: "#d4c4a8", cap: "#c4b090", skirt: "#e4d6c0", trim: "#c8b498", accent: "#f0c45a", cyber: false },
  "paint-sage": { base: "#c5d8b8", grout: "#9ab48c", cap: "#6a8a62", skirt: "#b8ccac", trim: "#8aaa7a", accent: "#7ec05a", cyber: false },
  "paint-blush": { base: "#f0c8c4", grout: "#d4a09c", cap: "#c48884", skirt: "#e8b8b4", trim: "#d49894", accent: "#f0a0a0", cyber: false },
  "paint-slate": { base: "#c8d0e0", grout: "#9aa4b8", cap: "#7a8498", skirt: "#b8c0d0", trim: "#8a94a8", accent: "#8aa0d0", cyber: false },
  "stars-mint": { base: "#c5d8b8", grout: "#9ab48c", cap: "#6a8a62", skirt: "#b8ccac", trim: "#8aaa7a", accent: "#7ec05a", cyber: false },
  "dots-peach": { base: "#f0c8c4", grout: "#d4a09c", cap: "#c48884", skirt: "#e8b8b4", trim: "#d49894", accent: "#f0a0a0", cyber: false },
  "stripes-lilac": { base: "#c8d0e0", grout: "#9aa4b8", cap: "#7a8498", skirt: "#b8c0d0", trim: "#8a94a8", accent: "#8aa0d0", cyber: false },
};

const FLOOR_KIND = { wood: "wood", tile: "tile", carpet: "carpet" };

function makeCanvas(w, h) {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const ctx = c.getContext("2d");
  ctx.imageSmoothingEnabled = false;
  return { c, ctx };
}

function px(ctx, x, y, w, h, color) {
  ctx.fillStyle = color;
  ctx.fillRect(x | 0, y | 0, Math.max(1, w | 0), Math.max(1, h | 0));
}

function pset(ctx, x, y, color) {
  ctx.fillStyle = color;
  ctx.fillRect(x | 0, y | 0, 1, 1);
}

function fillPoly(ctx, pts, fill, stroke, lineW = 1) {
  if (!pts || !pts.length) return;
  ctx.beginPath();
  ctx.moveTo(pts[0].sx, pts[0].sy);
  for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].sx, pts[i].sy);
  ctx.closePath();
  if (fill) { ctx.fillStyle = fill; ctx.fill(); }
  if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = lineW; ctx.stroke(); }
}

function wallPt(wall, t, up) {
  if (wall === "back") {
    const p = tileToScreen(t, 0);
    return { sx: p.sx, sy: p.sy - up };
  }
  const p = tileToScreen(0, t);
  return { sx: p.sx, sy: p.sy - up };
}

function addOutline(ctx, w, h, color = "#5a3a28") {
  const img = ctx.getImageData(0, 0, w, h);
  const d = img.data;
  const out = ctx.createImageData(w, h);
  out.data.set(d);
  const o = out.data;
  const rgb = hexToRgb(color);
  const solid = (i) => d[i * 4 + 3] > 180;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      if (solid(i)) continue;
      let n = false;
      if (x > 0 && solid(i - 1)) n = true;
      else if (x + 1 < w && solid(i + 1)) n = true;
      else if (y > 0 && solid(i - w)) n = true;
      else if (y + 1 < h && solid(i + w)) n = true;
      if (!n) continue;
      const p = i * 4;
      o[p] = rgb.r; o[p + 1] = rgb.g; o[p + 2] = rgb.b; o[p + 3] = 255;
    }
  }
  ctx.putImageData(out, 0, 0);
}

const ART_U0 = 0.18, ART_U1 = 0.82, ART_V0 = 30, ART_V1 = 58;
function wallArtQuad(wall, slot) {
  const t0 = slot + ART_U0, t1 = slot + ART_U1;
  return [
    wallPt(wall, t0, ART_V0),
    wallPt(wall, t1, ART_V0),
    wallPt(wall, t1, ART_V1),
    wallPt(wall, t0, ART_V1),
  ];
}
function pixelArtQuad(wall, slot) {
  const t0 = slot, t1 = slot + ART_TILE_SPAN;
  const v0 = ART_HANG_UP, v1 = ART_HANG_UP + ART_WORLD_UP;
  // Same corner order as wallArtQuad: bottom-t0, bottom-t1, top-t1, top-t0
  return [
    wallPt(wall, t0, v0),
    wallPt(wall, t1, v0),
    wallPt(wall, t1, v1),
    wallPt(wall, t0, v1),
  ];
}
function artQuadFor(type, wall, slot) {
  if (type === CUE_RACK_TYPE) return cueRackQuad(wall, slot, wallPt);
  return isPainting(type) ? pixelArtQuad(wall, slot) : wallArtQuad(wall, slot);
}
function artMetrics(type, wall, slot) {
  const wname = (wall === "z" || wall === "left") ? "left" : "back";
  const q = artQuadFor(type, wname, slot | 0);
  const [bl, br, tr, tl] = q;
  return {
    type,
    wall: wname,
    slot: slot | 0,
    tileSpan: isPainting(type) ? ART_TILE_SPAN : (ART_U1 - ART_U0),
    upHeight: isPainting(type) ? ART_WORLD_UP : (ART_V1 - ART_V0),
    screenSpan: Math.hypot(br.sx - bl.sx, br.sy - bl.sy),
    verticalEdge: Math.hypot(tl.sx - bl.sx, tl.sy - bl.sy),
    artSize: isPainting(type) ? ART_SIZE : null,
    pixelArt: isPainting(type),
  };
}
function quadBounds(pts) {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const p of pts) {
    minX = Math.min(minX, p.sx); maxX = Math.max(maxX, p.sx);
    minY = Math.min(minY, p.sy); maxY = Math.max(maxY, p.sy);
  }
  return { minX, minY, maxX, maxY, w: maxX - minX, h: maxY - minY };
}

function tileToScreen(tx, ty) {
  return { sx: (tx - ty) * (TW / 2), sy: (tx + ty) * (TH / 2) };
}

function screenToTile(sx, sy) {
  return { x: sy / TH + sx / TW, y: sy / TH - sx / TW };
}

const spriteCache = new Map();
function sprite(key, w, h, draw) {
  let s = spriteCache.get(key);
  if (s) return s;
  const { c, ctx } = makeCanvas(w, h);
  draw(ctx, w, h);
  s = { c, w, h };
  spriteCache.set(key, s);
  return s;
}

function drawDiamond(ctx, cx, cy, fill, edge) {
  ctx.beginPath();
  ctx.moveTo(cx, cy);
  ctx.lineTo(cx + TW / 2, cy + TH / 2);
  ctx.lineTo(cx, cy + TH);
  ctx.lineTo(cx - TW / 2, cy + TH / 2);
  ctx.closePath();
  ctx.fillStyle = fill;
  ctx.fill();
  if (edge) {
    ctx.strokeStyle = edge;
    ctx.lineWidth = 1;
    ctx.stroke();
  }
}

function floorTileSprite(pattern, colorId, lights, variant) {
  const key = "floor:" + pattern + ":" + colorId + ":" + lights + ":" + variant;
  return sprite(key, TW + 2, TH + 2, (ctx) => {
    const dim = lights ? 0 : -36;
    const cx = TW / 2 + 1, cy = 1;
    const base = floorColorHex(colorId);
    const edge = shade(base, dim - 40);
    if (pattern === "grid" || pattern === "tile") {
      const a = shade(variant % 2 ? shade(base, 10) : shade(base, -8), dim);
      drawDiamond(ctx, cx, cy, a, shade(base, dim - 36));
      ctx.strokeStyle = shade(base, dim - 28);
      ctx.beginPath();
      ctx.moveTo(cx, cy + TH / 2);
      ctx.lineTo(cx + TW / 4, cy + TH / 4);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(cx, cy + TH / 2);
      ctx.lineTo(cx - TW / 4, cy + TH / 4);
      ctx.stroke();
    } else if (pattern === "checker") {
      const a = shade((variant % 2) ? shade(base, 16) : shade(base, -22), dim);
      drawDiamond(ctx, cx, cy, a, edge);
    } else if (pattern === "carpet") {
      const a = shade(variant % 3 === 0 ? base : (variant % 3 === 1 ? shade(base, -12) : shade(base, 10)), dim);
      drawDiamond(ctx, cx, cy, a, shade(base, dim - 40));
      ctx.strokeStyle = shade(base, dim + 28);
      ctx.beginPath();
      ctx.moveTo(cx, cy + 6);
      ctx.lineTo(cx + TW / 2 - 8, cy + TH / 2);
      ctx.lineTo(cx, cy + TH - 6);
      ctx.lineTo(cx - TW / 2 + 8, cy + TH / 2);
      ctx.closePath();
      ctx.stroke();
      pset(ctx, cx, cy + TH / 2, shade(base, dim + 30));
    } else if (pattern === "marble") {
      drawDiamond(ctx, cx, cy, shade(base, dim + 8), edge);
      ctx.strokeStyle = shade(base, dim + 28);
      ctx.beginPath();
      ctx.moveTo(cx - TW / 3, cy + TH * 0.35);
      ctx.quadraticCurveTo(cx, cy + TH * 0.2, cx + TW / 3, cy + TH * 0.4);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(cx - TW / 4, cy + TH * 0.65);
      ctx.quadraticCurveTo(cx + 4, cy + TH * 0.55, cx + TW / 5, cy + TH * 0.75);
      ctx.stroke();
    } else if (pattern === "stone") {
      const a = shade(variant % 3 === 0 ? base : (variant % 3 === 1 ? shade(base, -14) : shade(base, 8)), dim);
      drawDiamond(ctx, cx, cy, a, edge);
      ctx.strokeStyle = shade(base, dim - 30);
      ctx.beginPath();
      ctx.moveTo(cx - 8, cy + TH * 0.4);
      ctx.lineTo(cx + 4, cy + TH * 0.55);
      ctx.stroke();
      pset(ctx, cx + 6, cy + TH * 0.45, shade(base, dim - 20));
    } else {
      // wood planks
      const woods = [base, shade(base, 12), shade(base, -12), shade(base, 22)];
      drawDiamond(ctx, cx, cy, shade(woods[variant % 4], dim), shade(base, dim - 40));
      ctx.strokeStyle = shade(base, dim - 28);
      ctx.lineWidth = 1;
      for (let i = 1; i <= 2; i++) {
        const t = i / 3;
        ctx.beginPath();
        ctx.moveTo(cx - (1 - t) * TW / 2, cy + t * TH);
        ctx.lineTo(cx + t * TW / 2, cy + t * TH);
        ctx.stroke();
      }
      pset(ctx, cx - 6, cy + TH / 2, shade(base, dim + 28));
    }
  });
}

function glyph(ctx, x, y, text, color) {
  ctx.fillStyle = color;
  ctx.font = "5px monospace";
  ctx.fillText(text, x, y);
}

function wallStrip(wallStyle, side, col, lights, hasWindow, hasDoor, sign) {
  const key = "wall:" + wallStyle + ":" + side + ":" + col + ":" + lights + ":" + hasWindow + ":" + hasDoor + ":" + (sign || "");
  const w = TW / 2 + 8;
  const h = WALL_H + TH / 2 + 4;
  return sprite(key, w, h, (ctx) => {
    const pal = WALL_COLORS[wallStyle] || WALL_COLORS["paint-cream"];
    const dim = lights ? 0 : -50;
    const base = shade(pal.base, dim);
    const trim = lights ? pal.trim : shade(pal.trim, -80);
    const accent = lights ? pal.accent : shade(pal.accent, -80);
    const top = 2;
    const bot = 2 + WALL_H;
    ctx.beginPath();
    if (side === "z") {
      ctx.moveTo(TW / 2, top);
      ctx.lineTo(TW / 2 + TW / 2, top + TH / 2);
      ctx.lineTo(TW / 2 + TW / 2, bot + TH / 2);
      ctx.lineTo(TW / 2, bot);
    } else {
      ctx.moveTo(8, top + TH / 2);
      ctx.lineTo(8 + TW / 2, top);
      ctx.lineTo(8 + TW / 2, bot);
      ctx.lineTo(8, bot + TH / 2);
    }
    ctx.closePath();
    ctx.fillStyle = side === "z" ? shade(base, 12) : shade(base, -8);
    ctx.fill();
    ctx.strokeStyle = trim;
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.strokeStyle = shade(base, 30);
    const midY = top + 14 + (col % 3) * 2;
    ctx.beginPath();
    if (side === "z") {
      ctx.moveTo(TW / 2 + 2, midY);
      ctx.lineTo(TW / 2 + TW / 2 - 2, midY + TH / 2 - 1);
    } else {
      ctx.moveTo(10, midY + TH / 2 - 1);
      ctx.lineTo(8 + TW / 2 - 2, midY);
    }
    ctx.stroke();
    if (hasDoor) {
      const dx = side === "z" ? TW / 2 + 4 : 12;
      px(ctx, dx, bot - 22, 8, 22, "#0a0b12");
      ctx.strokeStyle = trim;
      ctx.strokeRect(dx, bot - 22, 8, 22);
    } else if (hasWindow) {
      const wx = side === "z" ? TW / 2 + 5 : 13;
      const wy = top + 10;
      px(ctx, wx, wy, 7, 9, "#000");
      px(ctx, wx + 1, wy + 1, 5, 3, "#101010");
      ctx.strokeStyle = accent;
      ctx.strokeRect(wx, wy, 7, 9);
    }
    if (sign && lights) {
      const sx = side === "z" ? TW / 2 + 3 : 11;
      px(ctx, sx, top + 6, 10, 5, "#f4efe4");
      glyph(ctx, sx + 1, top + 10, sign, "#2a1c16");
    }
  });
}

function furnSize(type, rot = 0) {
  const m = furnSpriteMetrics(type, rot);
  return [m.w, m.h];
}

function facingIndex(facing, dirX, dirY) {
  let dx = 0, dy = 1;
  if (facing && (facing.x !== undefined || facing.z !== undefined)) {
    dx = facing.x || 0;
    dy = facing.z !== undefined ? facing.z : (facing.y || 0);
  } else if (dirX !== undefined) {
    dx = dirX || 0;
    dy = dirY || 0;
  }
  if (dx === 0 && dy === 0) dy = 1;
  if (Math.abs(dx) > Math.abs(dy)) return dx > 0 ? 0 : 2;
  return dy < 0 ? 1 : 3;
}


const shoePopAtMap = new Map();
const lastShoeOf = new Map();
function shoePopAt(id, shoes, now) {
  const prev = lastShoeOf.get(id);
  if (prev !== shoes) {
    if (prev != null && shoes) shoePopAtMap.set(id, now);
    lastShoeOf.set(id, shoes);
  }
  const start = shoePopAtMap.get(id);
  if (start == null) return -1;
  const dt = now - start;
  if (dt > 480) { shoePopAtMap.delete(id); return -1; }
  return dt;
}


function drawPetSprite(kind, frame, walking, sit, facing, blink, wag, bob) {
  return drawPetPixel(kind, { walking, sit, facing, dir: facing ? facingIndex8(facing) : undefined, blink, wag: wag || 0, bob: bob || 0 }, frame);
}

function facingVec(facing) {
  let fx = facing?.x || 0, fz = facing?.z || 0;
  const len = Math.hypot(fx, fz);
  if (len < 1e-6) return { fx: 1, fz: 0 };
  return { fx: fx / len, fz: fz / len };
}

function tileKey(x, y) { return Math.round(x) + "," + Math.round(y); }

function tileIsFree(x, y, gridSize, blocked, occupied) {
  const tx = Math.round(x), ty = Math.round(y);
  if (tx < 0 || ty < 0 || tx >= gridSize || ty >= gridSize) return false;
  const k = tx + "," + ty;
  return !blocked.has(k) && !(occupied && occupied.has(k));
}

// Sit on a free tile beside the owner's feet (try the visible side, then
// other adjacent sides, then the nearest free tile). Never sit on furniture.
export function petSitTarget(ox, oy, facing, opts = {}) {
  const { fx, fz } = facingVec(facing);
  const rx = -fz, ry = fx;
  const side = (rx + ry) >= 0 ? 1 : -1;
  const front = (fx + fz) < 0 ? 0.08 : 0.20;
  const SIDE = 0.40;
  const gridSize = opts.gridSize || 6;
  const blocked = opts.blocked || new Set();
  const occupied = opts.occupied || new Set();
  const ownerKey = tileKey(ox, oy);
  const occ = new Set(occupied);
  occ.add(ownerKey);
  const ideal = { x: ox + rx * side * SIDE + fx * front, y: oy + ry * side * SIDE + fz * front };
  const adj = [
    [Math.round(ox + rx * side), Math.round(oy + ry * side)],
    [Math.round(ox + fx), Math.round(oy + fz)],
    [Math.round(ox - rx * side), Math.round(oy - ry * side)],
    [Math.round(ox - fx), Math.round(oy - fz)],
    [Math.round(ox + 1), Math.round(oy)],
    [Math.round(ox), Math.round(oy + 1)],
    [Math.round(ox - 1), Math.round(oy)],
    [Math.round(ox), Math.round(oy - 1)],
    [Math.round(ox + 1), Math.round(oy + 1)],
    [Math.round(ox + 1), Math.round(oy - 1)],
    [Math.round(ox - 1), Math.round(oy + 1)],
    [Math.round(ox - 1), Math.round(oy - 1)],
  ];
  const seen = new Set();
  function poseOnTile(tx, ty) {
    const dx = ox - tx, dy = oy - ty;
    const len = Math.hypot(dx, dy) || 1;
    const pull = Math.min(0.28, len * 0.5);
    return { x: tx + (dx / len) * pull, y: ty + (dy / len) * pull };
  }
  for (const [tx, ty] of adj) {
    const k = tx + "," + ty;
    if (seen.has(k)) continue;
    seen.add(k);
    if (!tileIsFree(tx, ty, gridSize, blocked, occ)) continue;
    return poseOnTile(tx, ty);
  }
  const nearest = globalThis.HouseIso?.nearestFreeTile?.(ox, oy, blocked, gridSize, occ);
  if (nearest) return poseOnTile(nearest.x, nearest.y);
  if (tileIsFree(ideal.x, ideal.y, gridSize, blocked, occ)) return ideal;
  return { x: ox, y: oy };
}

export function petFollowTarget(ox, oy, facing, gridSize = 6, opts = {}) {
  const blocked = opts.blocked || new Set();
  const occupied = opts.occupied || new Set();
  const { fx, fz } = facingVec(facing);
  const ideal = {
    x: Math.max(0, Math.min(gridSize - 0.05, ox - fx * 0.55)),
    y: Math.max(0, Math.min(gridSize - 0.05, oy - fz * 0.55)),
  };
  if (tileIsFree(ideal.x, ideal.y, gridSize, blocked, occupied)) return ideal;
  const tx = Math.round(ideal.x), ty = Math.round(ideal.y);
  for (const [dx, dy] of [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]]) {
    if (tileIsFree(tx + dx, ty + dy, gridSize, blocked, occupied)) {
      return { x: tx + dx, y: ty + dy };
    }
  }
  const nearest = globalThis.HouseIso?.nearestFreeTile?.(ideal.x, ideal.y, blocked, gridSize, occupied);
  if (nearest) return nearest;
  if (tileIsFree(ox, oy, gridSize, blocked, occupied)) return { x: ox, y: oy };
  const atOwner = globalThis.HouseIso?.nearestFreeTile?.(ox, oy, blocked, gridSize, occupied);
  return atOwner || { x: ox, y: oy };
}

export function petSitFacing(facing) {
  const dir = facingIndex8(facing || { x: 1, z: 1 });
  if (dir === 4) return { x: 1, z: 0 };
  if (dir === 5 || dir === 6) return { x: 0, z: 1 };
  return facing || { x: 1, z: 1 };
}


export function createAvatarPreview(container, opts = {}) {
  const transparent = Boolean(opts.transparent);
  container.innerHTML = "";
  container.style.position = "relative";
  container.style.imageRendering = "pixelated";
  const canvas = document.createElement("canvas");
  canvas.style.cssText = "width:100%;height:100%;image-rendering:pixelated;display:block;background:transparent";
  container.appendChild(canvas);
  let avatar = {};
  let facing = { x: 1, z: 1 };
  let dirIndex = 1;
  const DIRS = [
    { x: 0, z: 1 }, { x: 1, z: 1 }, { x: 1, z: 0 }, { x: 1, z: -1 },
    { x: 0, z: -1 }, { x: -1, z: -1 }, { x: -1, z: 0 }, { x: -1, z: 1 },
  ];
  function setDir(i) {
    dirIndex = ((i % DIRS.length) + DIRS.length) % DIRS.length;
    facing = DIRS[dirIndex];
  }
  let raf = 0, alive = true;

  const minScale = Number(opts.minScale) > 0 ? Number(opts.minScale) : 2;
  let cssW = 160, cssH = 180, dpr = 1, drawScale = 2;

  function resize() {
    cssW = container.clientWidth || 160;
    cssH = container.clientHeight || 180;
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.max(1, Math.floor(cssW * dpr));
    canvas.height = Math.max(1, Math.floor(cssH * dpr));
    canvas.style.width = cssW + "px";
    canvas.style.height = cssH + "px";
    // Scale from the 48x64 figure (ignore sprite padding) so 3-4x fits a ~45% column.
    const fit = Math.floor(Math.min(cssW / 48, cssH / 64));
    drawScale = Math.max(minScale, fit);
  }

  function render(now) {
    if (!alive) return;
    const c = canvas.getContext("2d");
    const w = canvas.width, h = canvas.height;
    c.imageSmoothingEnabled = false;
    if (transparent) c.clearRect(0, 0, w, h);
    else {
      c.fillStyle = "#efe6d4";
      c.fillRect(0, 0, w, h);
    }
    const scale = drawScale * dpr;
    const frame = Math.floor((now || 0) / 96) % 16;
    const targetDir = facingIndex8(facing);
    const anim = tickChibiAnim("preview", now || 0, { walking: false, targetDir, self: { x: 0, y: 0, username: "preview" }, others: [] });
    const pop = shoePopAt("preview", avatar && avatar.shoes, now || 0);
    const spr = drawAvatarSprite(avatar, { facing, walking: false, ...anim, shoePop: pop }, frame);
    const dx = Math.floor((w - spr.w * scale) / 2);
    const dy = Math.floor((h - spr.h * scale) / 2);
    c.drawImage(spr.c, 0, 0, spr.w, spr.h, dx, dy, spr.w * scale, spr.h * scale);
    raf = requestAnimationFrame(render);
  }

  canvas.addEventListener("click", () => setDir(dirIndex + 1));
  canvas.style.cursor = "pointer";
  canvas.title = "Rotate";
  resize();
  const ro = typeof ResizeObserver === "function" ? new ResizeObserver(() => resize()) : null;
  try { ro?.observe(container); } catch {}
  raf = requestAnimationFrame(render);
  return {
    setAvatar(a) { avatar = a || {}; },
    setPose() {},
    cycleFacing() { setDir(dirIndex + 1); },
    setFacing(f) { if (f) facing = f; },
    resize,
    dispose() { alive = false; cancelAnimationFrame(raf); try { ro?.disconnect(); } catch {} container.innerHTML = ""; },
  };
}

export function createRoom3D(container, opts = {}) {
  const backdrop = Boolean(opts.backdrop);
  container.innerHTML = "";
  container.style.position = backdrop ? "absolute" : "relative";
  container.style.overflow = "hidden";
  container.style.background = "#000";
  if (backdrop) {
    container.style.inset = "0";
    container.style.width = "100%";
    container.style.height = "100%";
  }

  const canvas = document.createElement("canvas");
  canvas.className = "iso-room";
  canvas.style.cssText = "position:absolute;inset:0;width:100%;height:100%;image-rendering:pixelated;image-rendering:crisp-edges;z-index:1;touch-action:none" + (backdrop ? ";pointer-events:none" : "");
  container.appendChild(canvas);
  const overlay = document.createElement("div");
  overlay.className = "iso-overlay bubble-layer";
  overlay.id = "bubble-layer";
  overlay.style.cssText = "position:absolute;inset:0;z-index:2;pointer-events:none";
  container.appendChild(overlay);

  const ctx = canvas.getContext("2d");
  let viewW = 800, viewH = 500, dpr = 1;
  let gridSize = 6;
  let wallpaper = "paint-cream";
  let floorStyle = "wood";
  let decor = { ...DEFAULT_DECOR };
  let lightsOn = true;
  let furniture = [];
  let wallArt = [];
  let uses = {};
  let tvs = {};
  let recordPlayers = {};
  let chess = {};
  let arcade = {};
  let people = [];
  let npcs = [];
  let ghost = null;
  let petGhost = null;
  let placedPets = [];
  let wallGhost = null;
  let highlightId = null;
  let followName = null;
  let camMode = "follow";
  function followZoomForStage() {
    if (!isPhoneView() || viewH >= 400) return FOLLOW_ZOOM_DEFAULT;
    const t = Math.max(0, Math.min(1, (400 - viewH) / 160));
    return Math.round((FOLLOW_ZOOM_DEFAULT - t * 0.55) * 100) / 100;
  }
  let userZoom = FOLLOW_ZOOM_DEFAULT;
  let zoom = 1;
  let camX = 0, camY = 0;
  let placing = null;
  let alive = true;
  let serverTime0 = Date.now();
  let serverAt = performance.now();
  let hoverTile = null;
  let moveTarget = null;
  let isFurnInteractive = null;
  let panStart = null;
  const pointers = new Map();
  let pinchStart = 0, pinchZoom0 = 1, pinchCamX = 0, pinchCamY = 0;
  let pinchAnchor = null;
  let zoomTarget = 1;
  let followPaused = false;
  let editViewShiftX = 0, editViewShiftY = 0;
  let autoFit = !isPhoneView();
  let panLocked = false;
  let grab = null;
  let onGrabStart = null, onGrabMove = null, onGrabEnd = null;
  let velX = 0, velY = 0;
  let lastTapAt = 0, lastTapX = 0, lastTapY = 0;
  let didPinch = false;
  let movedThisGesture = false;
  let onTileClick = null, onTileHover = null, onFurnitureClick = null, onPetClick = null;
  let onSwitchClick = null, onSwitchTap = null, onWallClick = null, onWallHover = null;
  const personState = new Map();

  function nowServer() {
    return serverTime0 + (performance.now() - serverAt);
  }
  function bobY(now) {
    return Math.sin((now || performance.now()) / 900) * 1.2;
  }

  function tileDiamond(tx, ty) {
    const p = tileToScreen(tx, ty);
    return [
      { sx: p.sx, sy: p.sy },
      { sx: p.sx + TW / 2, sy: p.sy + TH / 2 },
      { sx: p.sx, sy: p.sy + TH },
      { sx: p.sx - TW / 2, sy: p.sy + TH / 2 },
    ];
  }

  function drawTileShadow(ctx, tx, ty, kind) {
    const pts = tileDiamond(tx, ty);
    if (kind === "place-ok") {
      fillPoly(ctx, pts, "rgba(62, 207, 142, 0.38)", "rgba(46, 180, 110, 0.95)");
      return;
    }
    if (kind === "place-bad") {
      fillPoly(ctx, pts, "rgba(255, 50, 50, 0.42)", "rgba(220, 30, 30, 0.95)");
      return;
    }
    const pulse = kind === "target" ? 0.22 + Math.sin(performance.now() / 180) * 0.06 : 0.28;
    fillPoly(ctx, pts, kind === "target" ? `rgba(20, 12, 8, ${0.34 + pulse * 0.15})` : "rgba(18, 10, 8, 0.30)", kind === "target" ? "rgba(40, 24, 16, 0.55)" : "rgba(20, 12, 10, 0.4)");
  }

  function pickFloorTile(sx, sy) {
    const t = screenToTile(sx, sy);
    const n = gridSize;
    if (t.x >= 0 && t.x < n && t.y >= 0 && t.y < n) {
      return { x: Math.floor(t.x), y: Math.floor(t.y) };
    }
    // Just-off-edge snaps to the nearest in-bounds tile. Phones get a wider slack.
    const slack = isPhoneView() ? 0.85 : 0.45;
    if (t.x >= -slack && t.x < n + slack && t.y >= -slack && t.y < n + slack) {
      return {
        x: Math.max(0, Math.min(n - 1, Math.floor(Math.max(0, Math.min(n - 0.0001, t.x))))),
        y: Math.max(0, Math.min(n - 1, Math.floor(Math.max(0, Math.min(n - 0.0001, t.y))))),
      };
    }
    return null;
  }

  function roomWorldBounds() {
    const n = gridSize;
    const pts = [tileToScreen(0, 0), tileToScreen(n, 0), tileToScreen(0, n), tileToScreen(n, n)];
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    for (const p of pts) {
      minX = Math.min(minX, p.sx - TW / 2);
      maxX = Math.max(maxX, p.sx + TW / 2);
      minY = Math.min(minY, p.sy - WALL_H);
      maxY = Math.max(maxY, p.sy + TH);
    }
    return { minX, maxX, minY, maxY, w: maxX - minX, h: maxY - minY };
  }
  function minUserZoom() {
    const b = roomWorldBounds();
    const gutter = 80;
    const fit = Math.min(
      viewW / Math.max(1, b.w + gutter),
      viewH / Math.max(1, b.h + gutter)
    );
    const floor = Number.isFinite(fit) ? fit : USER_ZOOM_MIN;
    // About half the old 1x minimum, or lower if a large room still cannot fit with margin.
    return Math.min(USER_ZOOM_MIN, Math.max(USER_ZOOM_ABS_MIN, floor));
  }
  function clampZoom(z) {
    return clampUserZoom(z, minUserZoom());
  }
  function originAt(now) {
    return {
      ox: viewW / (2 * zoom) - camX + (editViewShiftX || 0) / zoom,
      oy: viewH / (2 * zoom) - camY + bobY(now) + (editViewShiftY || 0) / zoom,
    };
  }
  function fitRoomCamera() {
    const b = roomWorldBounds();
    camX = (b.minX + b.maxX) / 2;
    camY = (b.minY + b.maxY) / 2 + 4;
    const sx = viewW / Math.max(1, b.w + 16);
    const sy = viewH / Math.max(1, b.h + 16);
    const fit = Math.min(sx, sy);
    if (backdrop) zoom = Math.max(0.45, Math.min(fit * 0.92, 2.8));
    else zoom = fit >= 1 ? 1 : Math.max(0.45, fit);
  }
  function personWalking() {
    const name = followName || (people[0] && people[0].username);
    const st = name && personState.get(name);
    const p = people.find((x) => x.username === name) || people[0];
    return Boolean(st?.walking || p?.walking);
  }
  function followCamera() {
    if (personWalking()) followPaused = false;
    if (followPaused) return;
    const name = followName || (people[0] && people[0].username);
    const p = people.find((x) => x.username === name) || people[0];
    const t = p ? tileToScreen((p.x ?? 0) + 0.5, (p.y ?? 0) + 0.5) : tileToScreen(gridSize / 2, gridSize / 2);
    camX += (t.sx - camX) * 0.18;
    camY += (t.sy - AV_H / 2 - camY) * 0.18;
  }
  function camLimits() {
    const b = roomWorldBounds();
    const z = Math.max(0.2, zoom);
    const halfW = viewW / (2 * z);
    const halfH = viewH / (2 * z);
    const axis = (min, max, half) => {
      const room = max - min;
      const view = half * 2;
      const mid = (min + max) / 2;
      if (room <= view) {
        // Zoomed out: keep the whole room on screen with a small gutter, and only
        // pan within the leftover space so it cannot be lost off an edge.
        const leftover = (view - room) / 2;
        const gutter = Math.min(leftover, 12 / z);
        const slack = Math.max(0, leftover - gutter);
        return [mid - slack, mid + slack];
      }
      // Zoomed in: allow a little peek past an edge, but never lose the room.
      const edge = Math.min(80, Math.max(24, room * 0.2));
      return [min + half - edge, max - half + edge];
    };
    const [minX, maxX] = axis(b.minX, b.maxX, halfW);
    const [minY, maxY] = axis(b.minY, b.maxY, halfH);
    return { minX, maxX, minY, maxY };
  }
  function clampCamTo(x, y) {
    const L = camLimits();
    return {
      x: Math.min(L.maxX, Math.max(L.minX, x)),
      y: Math.min(L.maxY, Math.max(L.minY, y)),
    };
  }
  function clampCamSoft() {
    const c = clampCamTo(camX, camY);
    camX += (c.x - camX) * 0.22;
    camY += (c.y - camY) * 0.22;
  }
  function clampCamHard() {
    const c = clampCamTo(camX, camY);
    camX = c.x;
    camY = c.y;
  }
  function roomFitsInView() {
    const b = roomWorldBounds();
    const z = Math.max(0.2, zoom);
    return b.w <= viewW / z + 0.5 && b.h <= viewH / z + 0.5;
  }
  function zoomAtClient(clientX, clientY, nextZoom, now = performance.now()) {
    const world = worldFromClient(clientX, clientY, now);
    zoom = nextZoom;
    const rect = canvas.getBoundingClientRect();
    const ox = (clientX - rect.left) / zoom - world.sx;
    const oy = (clientY - rect.top) / zoom - world.sy;
    camX = viewW / (2 * zoom) - ox;
    camY = viewH / (2 * zoom) - oy + bobY(now);
    clampCamHard();
  }
  function setUserZoomAt(z, clientX, clientY, immediate = false) {
    const next = clampZoom(z);
    autoFit = false;
    if (camMode === "room" && isPhoneView()) {
      camMode = "follow";
      followPaused = true;
    }
    if (clientX != null && clientY != null) {
      zoomAtClient(clientX, clientY, immediate ? next : zoom);
    }
    userZoom = next;
    zoomTarget = next;
    if (immediate) zoom = next;
  }
  function applyCamera() {
    const fitting = (isPhoneView() && camMode === "room") || (!isPhoneView() && autoFit);
    if (fitting) {
      fitRoomCamera();
      zoomTarget = zoom;
      velX = velY = 0;
    } else {
      zoom += (zoomTarget - zoom) * 0.28;
      if (Math.abs(zoomTarget - zoom) < 0.004) zoom = zoomTarget;
      if (isPhoneView() && camMode === "follow") followCamera();
      if (followPaused || !isPhoneView()) {
        camX += velX;
        camY += velY;
        velX *= 0.88;
        velY *= 0.88;
        if (Math.hypot(velX, velY) < 0.04) { velX = 0; velY = 0; }
        clampCamSoft();
      } else if (roomFitsInView()) {
        // Follow the player, but never let a zoomed-out room slide offscreen.
        clampCamHard();
      }
    }
    // Keep names/bubbles readable at min zoom; they still grow with a close-up.
    if (overlay && overlay.style) overlay.style.setProperty("--iso-zoom", String(Math.max(0.85, zoom)));
  }
  function clientFromWorld(sx, sy, now) {
    const { ox, oy } = originAt(now);
    const x = (ox + sx) * zoom;
    const y = (oy + sy) * zoom;
    const rect = canvas.getBoundingClientRect();
    return { x: rect.left + x, y: rect.top + y, visible: x >= 0 && y >= 0 && x <= viewW && y <= viewH };
  }
  function worldFromClient(cx, cy, now) {
    const rect = canvas.getBoundingClientRect();
    const { ox, oy } = originAt(now);
    return { sx: (cx - rect.left) / zoom - ox, sy: (cy - rect.top) / zoom - oy };
  }
  let lastPhone = isPhoneView();
  function resize() {
    viewW = container.clientWidth || 800;
    viewH = container.clientHeight || 500;
    dpr = Math.min(window.devicePixelRatio || 1, isPhoneView() ? 1.5 : 2);
    canvas.width = Math.max(1, Math.floor(viewW * dpr));
    canvas.height = Math.max(1, Math.floor(viewH * dpr));
    canvas.style.width = viewW + "px";
    canvas.style.height = viewH + "px";
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.imageSmoothingEnabled = false;
    const phone = isPhoneView();
    if (phone && !lastPhone) {
      camMode = "follow";
      followPaused = false;
      autoFit = false;
      if (userZoom <= FOLLOW_ZOOM_DEFAULT + 0.001) {
        const z = followZoomForStage();
        userZoom = z;
        zoomTarget = z;
        zoom = z;
      }
    }
    lastPhone = phone;
    if (phone && camMode === "follow" && userZoom <= FOLLOW_ZOOM_DEFAULT + 0.001 && !followPaused) {
      const z = followZoomForStage();
      userZoom = z;
      zoomTarget = z;
    }
    applyCamera();
  }
  function footOf(tx, ty) {
    return tileToScreen(tx + 0.5, ty + 0.5);
  }
  function blit(spr, x, y, alpha = 1) {
    if (!spr) return;
    if (alpha !== 1) ctx.globalAlpha = alpha;
    ctx.drawImage(spr.c, Math.round(x), Math.round(y));
    if (alpha !== 1) ctx.globalAlpha = 1;
  }
  function doorSlot() { return layoutDoorSlot(gridSize); }
  function switchSlot() { return layoutSwitchSlot(gridSize); }
  function lightSwitchQuad() {
    const s = switchSlot();
    const t0 = s + 0.58, t1 = s + 0.96;
    const u0 = 36, u1 = 58;
    return [
      wallPt("left", t0, u1),
      wallPt("left", t1, u1),
      wallPt("left", t1, u0),
      wallPt("left", t0, u0),
    ];
  }
  function lightSwitchPos() {
    const q = lightSwitchQuad();
    const xs = q.map((p) => p.sx), ys = q.map((p) => p.sy);
    const minX = Math.min(...xs), maxX = Math.max(...xs);
    const minY = Math.min(...ys), maxY = Math.max(...ys);
    return { sx: minX - 1, sy: minY - 1, w: maxX - minX + 2, h: maxY - minY + 2, quad: q };
  }
  function pointInPoly(pt, poly) {
    let n = 0;
    for (let i = 0; i < poly.length; i++) {
      const a = poly[i], b = poly[(i + 1) % poly.length];
      if (((a.sy > pt.sy) !== (b.sy > pt.sy)) && (pt.sx < (b.sx - a.sx) * (pt.sy - a.sy) / ((b.sy - a.sy) || 1e-6) + a.sx)) n++;
    }
    return n % 2 === 1;
  }
  function wallSlotWorld(wall, slot, type) {
    const s = Math.max(0, Math.min(gridSize - 1, slot | 0));
    const wname = (wall === "z" || wall === "left") ? "left" : "back";
    const b = quadBounds(artQuadFor(type, wname, s));
    return { sx: b.minX, sy: b.minY, w: b.w, h: b.h, wall: wname, slot: s };
  }


  function hashStr(str) {
    let h = 2166136261;
    const s = String(str || "");
    for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
    return h >>> 0;
  }
  function pathLen(path) {
    let L = 0;
    for (let i = 1; i < path.length; i++) L += Math.hypot(path[i].x - path[i - 1].x, path[i].y - path[i - 1].y);
    return L;
  }
  function pointAlong(path, dist) {
    if (!path || !path.length) return { x: 0, y: 0 };
    if (path.length === 1 || dist <= 0) return { x: path[0].x, y: path[0].y };
    let left = dist;
    for (let i = 1; i < path.length; i++) {
      const seg = Math.hypot(path[i].x - path[i - 1].x, path[i].y - path[i - 1].y);
      if (left <= seg || i === path.length - 1) {
        const t = seg ? Math.min(1, left / (seg || 1)) : 1;
        return { x: path[i - 1].x + (path[i].x - path[i - 1].x) * t, y: path[i - 1].y + (path[i].y - path[i - 1].y) * t };
      }
      left -= seg;
    }
    const last = path[path.length - 1];
    return { x: last.x, y: last.y };
  }
  function petWalkBlocked() {
    return (globalThis.HouseIso?.blockedSet(furniture) || new Set());
  }
  function snapPetHome(pet, blocked) {
    const hx = Math.round(pet.x), hy = Math.round(pet.y);
    if (tileIsFree(hx, hy, gridSize, blocked, null)) return { x: hx, y: hy };
    return globalThis.HouseIso?.nearestFreeTile?.(hx, hy, blocked, gridSize) || { x: hx, y: hy };
  }
  function placedWanderDest(pet, blocked, home) {
    const seed = hashStr(pet.id || pet.item);
    const dirs = [[1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0], [-1, -1], [0, -1], [1, -1]];
    const order = [];
    for (let i = 0; i < 8; i++) order.push(dirs[(seed + i) % 8]);
    const extra = new Set(); // stay unique vs home only
    for (const dist of [1 + (seed % 2), 1, 2]) {
      for (const [dx, dy] of order) {
        const tx = Math.max(0, Math.min(gridSize - 1, home.x + dx * dist));
        const ty = Math.max(0, Math.min(gridSize - 1, home.y + dy * dist));
        if (!tileIsFree(tx, ty, gridSize, blocked, null)) continue;
        if (tx === home.x && ty === home.y) continue;
        const path = globalThis.HouseIso?.pathfind(home, { x: tx, y: ty }, blocked, gridSize);
        if (path && path.length) return { x: tx, y: ty, path };
      }
    }
    return { x: home.x, y: home.y, path: [home] };
  }
  function placedPetAnim(pet, now) {
    const blocked = petWalkBlocked();
    const home = snapPetHome(pet, blocked);
    const seed = hashStr(pet.id || pet.item);
    const period = 8000;
    const t = (now + (seed % period)) % period;
    const dest = placedWanderDest(pet, blocked, home);
    const outPath = dest.path && dest.path.length ? dest.path : [home, dest];
    const backPath = outPath.slice().reverse();
    const walkOut = 1600, sitAway = 4600, walkBack = 6200;
    const faceTo = (ax, ay, bx, by) => {
      const fx = Math.sign(bx - ax) || 0;
      const fy = Math.sign(by - ay) || 0;
      return { x: fx, z: fy };
    };
    if (t < walkOut && outPath.length > 1) {
      const u = t / walkOut;
      const pt = pointAlong(outPath, pathLen(outPath) * u);
      return { x: pt.x, y: pt.y, walking: true, sit: false, facing: faceTo(home.x, home.y, dest.x, dest.y) };
    }
    if (t < sitAway) {
      return { x: dest.x, y: dest.y, walking: false, sit: true, facing: faceTo(home.x, home.y, dest.x, dest.y) };
    }
    if (t < walkBack && backPath.length > 1) {
      const u = (t - sitAway) / (walkBack - sitAway);
      const pt = pointAlong(backPath, pathLen(backPath) * u);
      return { x: pt.x, y: pt.y, walking: true, sit: false, facing: faceTo(dest.x, dest.y, home.x, home.y) };
    }
    return { x: home.x, y: home.y, walking: false, sit: true, facing: { x: 1, z: 0 } };
  }
  function collectDrawList(now) {
    const list = [];
    for (const f of furniture) {
      const type = f.type;
      const rot = normalizeFurnRot(f.rot);
      const fridgeOpen = type === "fridge" && Boolean(uses[f.id]?.open);
      const m = furnSpriteMetrics(type, rot, { open: fridgeOpen });
      const pos = furnBlitPos(f.x, f.y, type, rot, tileToScreen, { open: fridgeOpen });
      const tv = tvs[f.id] || {};
      const rec = recordPlayers[f.id] || {};
      const isTv = type === "tv" || type === "holotv";
      const isRec = type === "recordplayer" || type === RECORD_TYPE;
      const tvOn = isTv && Boolean(tv.on);
      const recOn = isRec && Boolean(rec.on);
      let screen = null;
      let glow = false;
      if (tvOn) {
        const { ox, oy } = originAt(now);
        const vx = (ox + pos.sx) * zoom, vy = (oy + pos.sy) * zoom;
        const onScreen = vx < viewW + 8 && vy < viewH + 8 && vx + pos.w * zoom > -8 && vy + pos.h * zoom > -8;
        if (onScreen) {
          screen = getTvScreen(tv.channel || 0, nowServer(), tv.changedAt || 0);
          glow = lightsOn;
        }
      }
      const spr = drawFurnitureSprite(type, {
        lights: lightsOn,
        rot,
        on: isTv ? tvOn : isRec ? recOn : Boolean(uses[f.id]?.on),
        open: type === "fridge" ? Boolean(uses[f.id]?.open) : false,
        sku: f.sku,
        brewing: type === "coffeemachine" && uses[f.id]?.phase === "brew",
        steamFrame: type === "coffeemachine" ? steamFrameAt(now) : (type === "stove" ? stoveSteamFrameAt(now) : 0),
        flameFrame: type === "stove" ? flameFrameAt(now) : 0,
        spinFrame: isRec && recOn ? spinFrameAt(nowServer(), rec.startedAt) : 0,
        vinyl: isRec ? (rec.vinyl || null) : null,
        flicker: type === "cubics" ? Math.floor(now / 220) % 3 : 0,
        screen,
      });
      const recNotes = isRec && recOn ? notesAt(f.id, rec, nowServer()) : null;
      const screenQuad = (isTv && tvOn && glow) ? tvScreenQuadSprite(type, rot) : null;
      const baseDepth = f.x + f.y + (m.tw + m.th) / 2 + 0.2;
      if (isSeatType(type) && type !== "chesstable" && type !== "hoverchair") {
        const baseSpr = drawFurnitureSprite(type, { lights: lightsOn, rot, on: false, open: false, sku: f.sku, part: "base" });
        const frontSpr = drawFurnitureSprite(type, { lights: lightsOn, rot, on: false, open: false, sku: f.sku, part: "back" });
        list.push({ kind: "furn", id: f.id, type, depth: baseDepth - 0.05, sx: pos.sx, sy: pos.sy, w: pos.w, h: pos.h, spr: baseSpr, raw: f, part: "base" });
        list.push({ kind: "furn", id: f.id, type, depth: seatBackDepth(f, m.tw, m.th), sx: pos.sx, sy: pos.sy, w: pos.w, h: pos.h, spr: frontSpr, raw: f, part: "back" });
      } else {
        list.push({ kind: "furn", id: f.id, type, depth: baseDepth, sx: pos.sx, sy: pos.sy, w: pos.w, h: pos.h, spr, raw: f, glow: Boolean(screenQuad), screenQuad, recNotes, recOn });
      }
      if (type === "chesstable") {
        for (const seat of [0, 1]) {
          const pose = chessSeatPose(f, seat);
          const stool = drawChessStoolSprite({ lights: lightsOn, rot: 0 });
          const spos = furnBlitPos(pose.x, pose.y, "chessstool", 0, tileToScreen);
          list.push({ kind: "stool", id: f.id + "-stool-" + seat, type: "chessstool", depth: pose.x + pose.y + 0.15, sx: spos.sx, sy: spos.sy, w: spos.w, h: spos.h, spr: stool, raw: f });
        }
      }
    }
    for (const npc of npcs) {
      const foot = footOf(npc.x, npc.y);
      const spr = drawAvatarSprite(npc.avatar || {}, { facing: { x: 1, z: 1 } }, 0);
      list.push({ kind: "npc", id: npc.id, type: "shopkeeper", depth: npc.x + npc.y + 0.4, sx: foot.sx - AV_W / 2, sy: foot.sy - AV_GROUND_Y, w: AV_W, h: AV_H, spr, raw: npc });
    }
    for (const p of people) {
      const st = personState.get(p.username) || p;
      const sittingNow = Boolean(p.sitting || st.sitting);
      let x = st.x ?? p.x, y = st.y ?? p.y;
      if (st.sitEaseAt != null) {
        const te = sitEaseT(st.sitEaseAt, now);
        const fromX = st.sitFromX ?? x, fromY = st.sitFromY ?? y;
        const toX = st.targetX ?? p.x, toY = st.targetY ?? p.y;
        x = fromX + (toX - fromX) * te;
        y = fromY + (toY - fromY) * te;
        if (te >= 1) {
          st.sitEaseAt = null;
          st.x = toX;
          st.y = toY;
        } else {
          st.x = x;
          st.y = y;
        }
      }
      const walking = Boolean(st.walking || p.walking);
      const frame = Math.floor(now / 96) % 8;
      const rawFacing = p.facing || st.facing;
      const face = p.sitting ? snapFacingToAxis(rawFacing) : rawFacing;
      const targetDir = (walking && (st.dirX || st.dirY))
        ? facingIndex8(null, st.dirX, st.dirY)
        : facingIndex8(face, st.dirX, st.dirY);
      const lastSay = (typeof window !== "undefined" && window.__lastSays && window.__lastSays.length)
        ? window.__lastSays[window.__lastSays.length - 1]
        : null;
      const anim = tickChibiAnim(p.username, now, {
        walking, dirX: st.dirX || 0, dirY: st.dirY || 0, targetDir,
        self: { username: p.username, x, y },
        others: people.map((o) => {
          const ost = personState.get(o.username) || o;
          return { username: o.username, x: ost.x ?? o.x, y: ost.y ?? o.y, bubble: o.bubble, bubbleUntil: o.bubbleUntil, bubbles: o.bubbles };
        }),
        lastSay,
        wallTime: Date.now(),
      });
      const lying = Boolean(p.lying || st.lying);
      const flags = {
        sitting: p.sitting && !lying, walking: walking && !lying, facing: face, dirX: st.dirX, dirY: st.dirY,
        usingPhone: p.usingPhone && !lying, boxing: p.boxing, actionEmote: p.actionEmote,
        heldItem: lying ? null : p.heldItem, heldProp: p.heldProp, gym: p.gym,
        blink: lying ? "closed" : anim.blink, lookX: anim.lookX, lookY: anim.lookY,
        bodyDir: anim.bodyDir, headDir: anim.headDir,
        shoePop: shoePopAt(p.username, (p.avatar || {}).shoes, now),
        mouth: mouthPhase(p.talkText, p.talkAt, Date.now()),
      };
      const spr = drawAvatarSprite(p.avatar || {}, flags, frame);
      st.figTop = spr.top;
      const foot = tileToScreen(x + 0.5, y + 0.5);
      let depth = x + y + 0.45;
      if (p.sitting) {
        for (const f of furniture) {
          const fr = normalizeFurnRot(f.rot);
          const dims = furnTileDims(f.type, fr);
          if (x < f.x - 0.5 || y < f.y - 0.5 || x >= f.x + dims.w || y >= f.y + dims.h) continue;
          const fd = f.x + f.y + (dims.w + dims.h) / 2 + 0.2;
          if (fd + 0.08 > depth) depth = fd + 0.08;
        }
      }
      const personItem = { kind: "person", id: p.username, type: "person", depth, sx: foot.sx - AV_W / 2, sy: foot.sy - AV_GROUND_Y, w: AV_W, h: AV_H, spr, raw: p, tileX: x, tileY: y };
      if (sittingNow && !lying) {
        const seat = furniture.find((f) => f.id === (p.stationId || st.stationId) && isSeatType(f.type))
          || furniture.find((f) => {
            if (!isSeatType(f.type)) return false;
            const fr = normalizeFurnRot(f.rot);
            const dims = furnTileDims(f.type, fr);
            return x >= f.x - 0.75 && y >= f.y - 0.75 && x < f.x + dims.w + 0.25 && y < f.y + dims.h + 0.25;
          });
        const lift = seat ? seatCushionLift(seat.type) : 0;
        const te = sitEaseT(st.sitEaseAt, now);
        personItem.sy -= lift * te;
        if (te >= 1) personItem.sy += sitBob(now);
      }
      if (lying) {
        const bed = furniture.find((f) => f.id === (p.stationId || st.stationId) && f.type === "bed");
        const draw = lieDrawPose(bed || { x, y, rot: 0 }, tileToScreen, { headTop: AV_HEAD_TOP, groundY: AV_GROUND_Y, avatar: spr.c, avW: AV_W, avH: AV_H });
        const bedM = bed ? furnSpriteMetrics(bed.type, normalizeFurnRot(bed.rot)) : null;
        const bedDepth = bed ? (bed.x + bed.y + (bedM.tw + bedM.th) / 2 + 0.2) : depth;
        personItem.lie = { angle: draw.angle, headSx: draw.headSx, headSy: draw.headSy, zeds: bedZeds(p.lyingAt || st.lyingAt, Date.now()) };
        // Draw entirely above the bed (on top of the blanket), full standing scale.
        personItem.depth = bedDepth + 0.16;
        personItem.sx = draw.headSx - AV_W / 2;
        personItem.sy = draw.headSy - AV_HEAD_TOP;
      }
      const heldKind = heldKindOf(p.heldItem);
      if (heldKind && !flags.usingPhone) {
        const anchor = heldItemHandAnchor(p.avatar || {}, flags, frame);
        const face = heldItemFaceAnchor(p.avatar || {}, flags, frame);
        const sip = sipAnim(p.heldItem, p.username, Date.now(), { walking });
        const steam = heldKind === "coffee" ? heldSteamFrameAt(Date.now()) : 0;
        const item = drawHeldItemSprite(heldKind, { steamFrame: steam, flip: anchor.flip, lights: lightsOn, skin: face?.skin || (p.avatar || {}).skin });
        personItem.held = { item, anchor, face, sip };
      }
      list.push(personItem);
      if (p.activePet) {
        const sit = Boolean(st.petSit);
        const petWalking = Boolean(st.petWalking);
        const facing = st.petFacing || p.facing || st.facing || { x: 1, z: 0 };
        const pst = st.petX != null ? { x: st.petX, y: st.petY } : { x, y };
        const pf = tileToScreen(pst.x + 0.5, pst.y + 0.5);
        const petAnim = tickChibiAnim(p.username + "-pet", now, { walking: petWalking, targetDir: facingIndex8(facing) });
        const wag = sit ? (Math.sin(now / 160) > 0.2 ? 1 : Math.sin(now / 160) < -0.2 ? -1 : 0) : 0;
        const bob = sit && Math.sin(now / 480) > 0.15 ? -1 : 0;
        const pspr = drawPetSprite(p.activePet, frame, petWalking, sit, facing, petAnim.blink, wag, bob);
        list.push({ kind: "pet", id: p.username + "-pet", type: "pet", depth: pst.x + pst.y + 0.35, sx: pf.sx - PET_W / 2, sy: pf.sy - PET_GROUND_Y, w: PET_W, h: PET_H, spr: pspr, raw: { id: p.username + "-pet", item: p.activePet, owner: p.username, following: true } });
      }
    }
    const petFrame = Math.floor(now / 96) % 8;
    for (const pet of placedPets) {
      const anim = placedPetAnim(pet, now);
      const pf = tileToScreen(anim.x + 0.5, anim.y + 0.5);
      const petAnim = tickChibiAnim((pet.id || pet.item) + "-placed", now, { walking: anim.walking, targetDir: facingIndex8(anim.facing) });
      const wag = anim.sit ? (Math.sin(now / 160) > 0.2 ? 1 : Math.sin(now / 160) < -0.2 ? -1 : 0) : 0;
      const bob = anim.sit && Math.sin(now / 480) > 0.15 ? -1 : 0;
      const pspr = drawPetSprite(pet.item, petFrame, anim.walking, anim.sit, anim.facing, petAnim.blink, wag, bob);
      list.push({ kind: "pet", id: pet.id, type: "pet", depth: anim.x + anim.y + 0.3, sx: pf.sx - PET_W / 2, sy: pf.sy - PET_GROUND_Y, w: PET_W, h: PET_H, spr: pspr, raw: { ...pet, following: false, x: anim.x, y: anim.y } });
    }
    if (petGhost) {
      const pf = tileToScreen(petGhost.tx + 0.5, petGhost.ty + 0.5);
      const pspr = drawPetSprite(petGhost.item, petFrame, false, false, { x: 1, z: 0 }, "open", 0, 0);
      list.push({ kind: "ghost", depth: petGhost.tx + petGhost.ty + 0.9, sx: pf.sx - PET_W / 2, sy: pf.sy - PET_GROUND_Y, w: PET_W, h: PET_H, spr: pspr, alpha: petGhost.ok ? 0.7 : 0.4, tx: petGhost.tx, ty: petGhost.ty, pet: true });
    }
    if (ghost) {
      const rot = normalizeFurnRot(ghost.rot);
      const m = furnSpriteMetrics(ghost.type, rot);
      const pos = furnBlitPos(ghost.tx, ghost.ty, ghost.type, rot, tileToScreen);
      const spr = drawFurnitureSprite(ghost.type, { lights: lightsOn, rot });
      list.push({ kind: "ghost", depth: ghost.tx + ghost.ty + (m.tw + m.th) / 2 + 0.9, sx: pos.sx, sy: pos.sy, w: pos.w, h: pos.h, spr, alpha: ghost.ok ? 0.7 : 0.4, tx: ghost.tx, ty: ghost.ty });
      if (ghost.type === "chesstable") {
        for (const seat of [0, 1]) {
          const pose = chessSeatPose({ x: ghost.tx, y: ghost.ty, rot }, seat);
          const stool = drawChessStoolSprite({ lights: lightsOn, rot: 0 });
          const spos = furnBlitPos(pose.x, pose.y, "chessstool", 0, tileToScreen);
          list.push({ kind: "ghost", depth: pose.x + pose.y + 0.85, sx: spos.sx, sy: spos.sy, w: spos.w, h: spos.h, spr: stool, alpha: 0.55 });
        }
      }
    }
    list.sort((a, b) => a.depth - b.depth);
    return list;
  }

  function drawFloorSlab() {
    const n = gridSize;
    const SLAB = 10;
    const a = tileToScreen(0, n);
    const b = tileToScreen(n, n);
    const c = tileToScreen(n, 0);
    const fc = floorColorHex(decor.floorColor || "honey");
    const down = (p) => ({ sx: p.sx, sy: p.sy + SLAB });
    fillPoly(ctx, [a, b, down(b), down(a)], shade(fc, -18), shade(fc, -48));
    fillPoly(ctx, [b, c, down(c), down(b)], shade(fc, -6), shade(fc, -48));
    ctx.strokeStyle = shade(fc, -40);
    ctx.beginPath();
    ctx.moveTo(down(a).sx, down(a).sy);
    ctx.lineTo(down(b).sx, down(b).sy);
    ctx.lineTo(down(c).sx, down(c).sy);
    ctx.stroke();
  }

  function drawWalls(now = 0) {
    const n = gridSize;
    const pal = wallColorPal(decor.wallColor || "cream");
    const dim = lightsOn ? 0 : -36;
    const base = shade(pal.base, dim);
    const grout = shade(pal.grout || "#6d727a", dim);
    const cap = pal.cap || "#2a2c30";
    const skirt = shade(pal.skirt || "#4a4e54", dim);
    const cyber = Boolean(pal.cyber);
    const WT = 0.22;
    const doorS = doorSlot();
    const doorT0 = doorS + 0.08, doorT1 = doorS + 0.92;
    const doorH = Math.round(WALL_H * 0.78);

    function outer(wall, t, up) {
      if (wall === "back") {
        const p = tileToScreen(t, -WT);
        return { sx: p.sx, sy: p.sy - up };
      }
      const p = tileToScreen(-WT, t);
      return { sx: p.sx, sy: p.sy - up };
    }

    function wallPlane(wall) {
      const mid = wall === "back" ? shade(base, 8) : shade(base, -10);
      const inner = (t, up) => wallPt(wall, t, up);
      fillPoly(ctx, [inner(0, 0), inner(n, 0), inner(n, WALL_H), inner(0, WALL_H)], mid, grout);
      const rows = 3;
      const skirtH = 7, capH = 6;
      const usable = WALL_H - skirtH - capH;
      const rowH = usable / rows;
      const tileA = shade(base, 12);
      const tileB = shade(base, -8);
      const pattern = decor.wallPattern || "tiles";
      const skipDoor = (t0, t1, u0) => wall === "left" && t0 < doorT1 && t1 > doorT0 && u0 < doorH;
      if (pattern === "tiles" || pattern === "plain" && false) {
        for (let i = 0; i < n; i++) {
          for (let r = 0; r < rows; r++) {
            const u0 = skirtH + r * rowH + 0.8;
            const u1 = skirtH + (r + 1) * rowH - 0.8;
            const t0 = i + 0.06, t1 = i + 1 - 0.06;
            if (skipDoor(t0, t1, u0)) continue;
            const fill = (i + r) % 2 ? tileA : tileB;
            fillPoly(ctx, [inner(t0, u0), inner(t1, u0), inner(t1, u1), inner(t0, u1)], fill, grout);
          }
        }
      } else if (pattern === "stripes") {
        const cols = n * 2;
        for (let i = 0; i < cols; i++) {
          const t0 = i * (n / cols) + 0.04, t1 = (i + 1) * (n / cols) - 0.04;
          if (skipDoor(t0, t1, skirtH)) continue;
          const fill = i % 2 ? shade(base, 10) : shade(base, -12);
          fillPoly(ctx, [inner(t0, skirtH + 1), inner(t1, skirtH + 1), inner(t1, WALL_H - capH - 1), inner(t0, WALL_H - capH - 1)], fill, null);
        }
      } else if (pattern === "brick") {
        const br = 4, bc = n * 2;
        const bh = usable / br, bw = n / bc;
        for (let r = 0; r < br; r++) {
          const off = (r % 2) ? bw / 2 : 0;
          for (let i = -1; i <= bc; i++) {
            const t0 = i * bw + off + 0.04, t1 = (i + 1) * bw + off - 0.04;
            const u0 = skirtH + r * bh + 0.6, u1 = skirtH + (r + 1) * bh - 0.6;
            if (t1 <= 0 || t0 >= n) continue;
            if (skipDoor(Math.max(0, t0), Math.min(n, t1), u0)) continue;
            fillPoly(ctx, [inner(Math.max(0, t0), u0), inner(Math.min(n, t1), u0), inner(Math.min(n, t1), u1), inner(Math.max(0, t0), u1)], (i + r) % 2 ? tileA : tileB, grout);
          }
        }
      } else if (pattern === "floral" || pattern === "dots") {
        for (let i = 0; i < n; i++) {
          for (let r = 0; r < 3; r++) {
            const t = i + 0.5, u = skirtH + 8 + r * (usable / 3);
            if (skipDoor(t - 0.2, t + 0.2, u - 4)) continue;
            const cx = inner(t, u);
            if (pattern === "dots") {
              ctx.fillStyle = shade(base, -28);
              ctx.beginPath(); ctx.arc(cx.sx, cx.sy, 2.2, 0, Math.PI * 2); ctx.fill();
            } else {
              ctx.fillStyle = shade(base, -30);
              ctx.beginPath(); ctx.arc(cx.sx, cx.sy, 2.6, 0, Math.PI * 2); ctx.fill();
              ctx.fillStyle = shade(base, 18);
              ctx.beginPath(); ctx.arc(cx.sx, cx.sy, 1.1, 0, Math.PI * 2); ctx.fill();
            }
          }
        }
      } else if (pattern === "woodpanel") {
        for (let i = 0; i < n; i++) {
          const t0 = i + 0.06, t1 = i + 1 - 0.06;
          if (skipDoor(t0, t1, skirtH)) continue;
          fillPoly(ctx, [inner(t0, skirtH + 1), inner(t1, skirtH + 1), inner(t1, WALL_H - capH - 1), inner(t0, WALL_H - capH - 1)], i % 2 ? tileA : shade(base, -4), shade(base, -36));
        }
      }
      // plain: just the base fill, no extra pattern
      // skirting board
      if (wall === "left") {
        fillPoly(ctx, [inner(0, 0), inner(doorT0, 0), inner(doorT0, 7), inner(0, 7)], skirt, cap);
        fillPoly(ctx, [inner(doorT1, 0), inner(n, 0), inner(n, 7), inner(doorT1, 7)], skirt, cap);
      } else {
        fillPoly(ctx, [inner(0, 0), inner(n, 0), inner(n, 7), inner(0, 7)], skirt, cap);
      }
      // cube thickness: outer faces + top cap
      fillPoly(ctx, [inner(0, WALL_H), outer(wall, 0, WALL_H), outer(wall, 0, 0), inner(0, 0)], shade(base, -42), cap);
      fillPoly(ctx, [inner(n, WALL_H), outer(wall, n, WALL_H), outer(wall, n, 0), inner(n, 0)], shade(base, -28), cap);
      fillPoly(ctx, [outer(wall, 0, 0), outer(wall, n, 0), outer(wall, n, WALL_H), outer(wall, 0, WALL_H)], shade(base, -36), cap);
      fillPoly(ctx, [inner(0, WALL_H), inner(n, WALL_H), outer(wall, n, WALL_H), outer(wall, 0, WALL_H)], cap, "#111");
      fillPoly(ctx, [inner(0, WALL_H), inner(n, WALL_H), inner(n, WALL_H - 5), inner(0, WALL_H - 5)], shade(cap, 22), "#111");
      if (cyber && lightsOn) {
        ctx.strokeStyle = pal.trim;
        ctx.lineWidth = 1;
        let a = inner(0, 8), b = inner(n, 8);
        if (wall === "left") { a = inner(0, 8); b = inner(doorT0, 8); ctx.beginPath(); ctx.moveTo(a.sx, a.sy); ctx.lineTo(b.sx, b.sy); ctx.stroke(); a = inner(doorT1, 8); b = inner(n, 8); }
        ctx.beginPath(); ctx.moveTo(a.sx, a.sy); ctx.lineTo(b.sx, b.sy); ctx.stroke();
        a = inner(0, WALL_H - 6); b = inner(n, WALL_H - 6);
        ctx.beginPath(); ctx.moveTo(a.sx, a.sy); ctx.lineTo(b.sx, b.sy); ctx.stroke();
      }
    }

    function drawEntryDoor() {
      const inner = (t, up) => wallPt("left", t, up);
      const style = decor.doorStyle || "wood";
      const dim = lightsOn ? 0 : -28;
      const palettes = {
        wood: { frame: "#3a2418", body: "#6b3e22", lite: "#8a5630", dark: "#4a2a16", knob: "#d4b46a" },
        modern: { frame: "#3a3a40", body: "#efe8dc", lite: "#fff6ea", dark: "#d4ccc0", knob: "#c0c4c8" },
        metal: { frame: "#2a2c30", body: "#8a9098", lite: "#b0b4b8", dark: "#5a6068", knob: "#d0d4d8" },
        glass: { frame: "#3a444c", body: "#8ab8c8", lite: "#c8e4ee", dark: "#5a8898", knob: "#d0d4d8" },
        arch: { frame: "#3a2418", body: "#7a4a28", lite: "#9a6840", dark: "#5a3018", knob: "#d4b46a" },
        shutter: { frame: "#2a2c30", body: "#6a6e74", lite: "#8a8e94", dark: "#4a4e54", knob: "#d0d4d8" },
      };
      const dpal = palettes[style] || palettes.wood;
      const frameC = shade(dpal.frame, dim);
      const wood = shade(dpal.body, dim);
      const woodLite = shade(dpal.lite, dim);
      const woodDark = shade(dpal.dark, dim);
      const knob = shade(dpal.knob, dim);
      const fw = 0.055;
      const topH = style === "arch" ? doorH + 8 : doorH + 4;
      fillPoly(ctx, [inner(doorT0 - fw, 0), inner(doorT1 + fw, 0), inner(doorT1 + fw, topH), inner(doorT0 - fw, topH)], frameC, "#111");
      if (style === "arch") {
        const steps = 6;
        const pts = [];
        for (let i = 0; i <= steps; i++) {
          const t = i / steps;
          const tt = doorT0 + t * (doorT1 - doorT0);
          const rise = Math.sin(t * Math.PI) * 8;
          pts.push(inner(tt, doorH + rise));
        }
        fillPoly(ctx, [inner(doorT0, 0), ...pts, inner(doorT1, 0)], wood, "#1a100c");
      } else {
        fillPoly(ctx, [inner(doorT0, 0), inner(doorT1, 0), inner(doorT1, doorH), inner(doorT0, doorH)], wood, "#1a100c");
      }
      const p0 = doorT0 + 0.12, p1 = doorT1 - 0.12;
      if (style === "glass") {
        const mid = (doorT0 + doorT1) / 2;
        fillPoly(ctx, [inner(doorT0 + 0.06, 6), inner(mid - 0.04, 6), inner(mid - 0.04, doorH - 6), inner(doorT0 + 0.06, doorH - 6)], woodLite, frameC);
        fillPoly(ctx, [inner(mid + 0.04, 6), inner(doorT1 - 0.06, 6), inner(doorT1 - 0.06, doorH - 6), inner(mid + 0.04, doorH - 6)], woodLite, frameC);
      } else if (style === "shutter") {
        for (let i = 0; i < 6; i++) {
          const u0 = 4 + i * ((doorH - 8) / 6);
          const u1 = u0 + (doorH - 8) / 6 - 1.2;
          fillPoly(ctx, [inner(p0, u0), inner(p1, u0), inner(p1, u1), inner(p0, u1)], i % 2 ? woodLite : woodDark, frameC);
        }
      } else if (style === "metal") {
        fillPoly(ctx, [inner(p0, 8), inner(p1, 8), inner(p1, doorH - 8), inner(p0, doorH - 8)], woodDark, frameC);
        fillPoly(ctx, [inner(p0 + 0.08, doorH * 0.46), inner(p1 - 0.08, doorH * 0.46), inner(p1 - 0.08, doorH * 0.54), inner(p0 + 0.08, doorH * 0.54)], knob, frameC);
      } else if (style === "modern") {
        fillPoly(ctx, [inner(p0, 8), inner(p1, 8), inner(p1, doorH - 8), inner(p0, doorH - 8)], woodLite, null);
      } else {
        fillPoly(ctx, [inner(p0, doorH * 0.52), inner(p1, doorH * 0.52), inner(p1, doorH * 0.88), inner(p0, doorH * 0.88)], woodDark, "#1a100c");
        fillPoly(ctx, [inner(p0 + 0.04, doorH * 0.56), inner(p1 - 0.04, doorH * 0.56), inner(p1 - 0.04, doorH * 0.84), inner(p0 + 0.04, doorH * 0.84)], woodLite, null);
        fillPoly(ctx, [inner(p0, doorH * 0.10), inner(p1, doorH * 0.10), inner(p1, doorH * 0.42), inner(p0, doorH * 0.42)], woodDark, "#1a100c");
        fillPoly(ctx, [inner(p0 + 0.04, doorH * 0.14), inner(p1 - 0.04, doorH * 0.14), inner(p1 - 0.04, doorH * 0.38), inner(p0 + 0.04, doorH * 0.38)], woodLite, null);
      }
      if (style !== "metal") {
        const kt0 = doorT0 + 0.08, kt1 = doorT0 + 0.16;
        const kh0 = doorH * 0.44, kh1 = doorH * 0.52;
        fillPoly(ctx, [inner(kt0, kh0), inner(kt1, kh0), inner(kt1, kh1), inner(kt0, kh1)], knob, "#2a2010");
        const kmid = wallPt("left", (kt0 + kt1) / 2, (kh0 + kh1) / 2);
        ctx.fillStyle = lightsOn ? shade(knob, 30) : shade(knob, -20);
        ctx.beginPath();
        ctx.arc(kmid.sx, kmid.sy, 1.6, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    function drawLightSwitch() {
      const q = lightSwitchQuad();
      const plate = lightsOn ? "#d8d0c4" : "#8a8478";
      const edge = "#2a2c30";
      fillPoly(ctx, q, plate, edge);
      // rocker inset, following the wall skew
      const lerp = (a, b, t) => ({ sx: a.sx + (b.sx - a.sx) * t, sy: a.sy + (b.sy - a.sy) * t });
      const [tl, tr, br, bl] = q;
      const p = (u, v) => lerp(lerp(bl, br, u), lerp(tl, tr, u), v);
      const inset = [p(0.22, 0.18), p(0.78, 0.18), p(0.78, 0.82), p(0.22, 0.82)];
      fillPoly(ctx, inset, lightsOn ? "#b8b0a4" : "#5a5850", edge);
      if (lightsOn) {
        fillPoly(ctx, [p(0.28, 0.48), p(0.72, 0.48), p(0.72, 0.78), p(0.28, 0.78)], "#f0e8d0", edge);
      } else {
        fillPoly(ctx, [p(0.28, 0.22), p(0.72, 0.22), p(0.72, 0.52), p(0.28, 0.52)], "#3a3834", edge);
      }
    }

    wallPlane("left");
    wallPlane("back");
    const c0 = wallPt("back", 0, 0), c1 = wallPt("back", 0, WALL_H);
    ctx.strokeStyle = "#1a1c20";
    ctx.beginPath(); ctx.moveTo(c0.sx, c0.sy); ctx.lineTo(c1.sx, c1.sy); ctx.stroke();

    drawEntryDoor();

    // window on reserved back slots (centered; door lives on the left wall)
    const winSlots = layoutWindowSlots(n);
    if (winSlots.length) {
      const t0 = winSlots[0] + 0.18, t1 = winSlots[winSlots.length - 1] + 0.82;
      const v0 = 28, v1 = 70;
      const pts = [wallPt("back", t0, v0), wallPt("back", t1, v0), wallPt("back", t1, v1), wallPt("back", t0, v1)];
      fillPoly(ctx, pts, "#000000", "#2a2c30");
      drawWindowScenery(ctx, pts, decor.windowView || "day", now, lightsOn);
      const mid = (t0 + t1) / 2;
      const m0 = wallPt("back", mid, v0), m1 = wallPt("back", mid, v1);
      const h0 = wallPt("back", t0, (v0 + v1) / 2), h1 = wallPt("back", t1, (v0 + v1) / 2);
      ctx.strokeStyle = "#3a2c24";
      ctx.lineWidth = 1.4;
      ctx.beginPath(); ctx.moveTo(m0.sx, m0.sy); ctx.lineTo(m1.sx, m1.sy); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(h0.sx, h0.sy); ctx.lineTo(h1.sx, h1.sy); ctx.stroke();
      fillPoly(ctx, pts, null, "#2a2c30");
      // sill
      fillPoly(ctx, [wallPt("back", t0 - 0.06, v0 - 2), wallPt("back", t1 + 0.06, v0 - 2), wallPt("back", t1 + 0.06, v0 + 2), wallPt("back", t0 - 0.06, v0 + 2)], shade(cap, 18), "#111");
    }

    drawLightSwitch();

    for (const art of wallArt) {
      const wall = (art.wall === "z" || art.wall === "left") ? "left" : "back";
      const typ = String(art.type || "");
      const q = artQuadFor(typ, wall, art.slot);
      if (typ === CUE_RACK_TYPE) {
        drawCueRackOnWall(ctx, wall, art.slot, lightsOn, { wallPt, fillPoly });
        if (highlightId && art.id === highlightId) fillPoly(ctx, q, null, "#d4b46a", 2);
      } else if (isPainting(typ)) {
        drawPaintingOnWall(ctx, typ, q, { dim: lightsOn ? 1 : 0.42 });
        if (highlightId && art.id === highlightId) fillPoly(ctx, q, null, "#d4b46a", 2);
      } else if (typ.includes("neon") || typ.includes("poster")) {
        fillPoly(ctx, q, typ.includes("neon") ? "#c43a4a" : "#3a5a7a", "#2a2c30");
        const inner = [
          wallPt(wall, art.slot + 0.28, 36),
          wallPt(wall, art.slot + 0.72, 36),
          wallPt(wall, art.slot + 0.72, 52),
          wallPt(wall, art.slot + 0.28, 52),
        ];
        fillPoly(ctx, inner, typ.includes("neon") ? "#efe0c0" : "#efe0c0", null);
      } else if (typ.includes("hang") || typ.includes("record")) {
        const b = quadBounds(q);
        const cx = (b.minX + b.maxX) / 2, cy = (b.minY + b.maxY) / 2;
        const ang = wall === "back" ? -0.45 : 0.45;
        ctx.fillStyle = "#3a2a18";
        ctx.beginPath(); ctx.ellipse(cx, cy, 12, 8.5, ang, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = lightsOn ? "#e6c35c" : "#8a7030";
        ctx.beginPath(); ctx.ellipse(cx, cy, 10, 7, ang, 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = lightsOn ? "#f4e0a0" : "#6a5420";
        ctx.beginPath(); ctx.ellipse(cx, cy, 10, 7, ang, 0, Math.PI * 2); ctx.stroke();
        ctx.fillStyle = "#2a1c10";
        ctx.beginPath(); ctx.ellipse(cx, cy, 2.5, 2, 0, 0, Math.PI * 2); ctx.fill();
      } else {
        const palettes = typ.includes("sunset") ? ["#c45a3a", "#f0d0a0"]
          : typ.includes("starry") ? ["#1a2040", "#d8c878"]
          : typ.includes("pop") ? ["#e04a6a", "#f4e8d0"]
          : typ.includes("mona") ? ["#6a5a40", "#d4c4a0"]
          : typ.includes("cubism") ? ["#4a6a8a", "#d0b070"]
          : typ.includes("poster") ? ["#3a5a7a", "#efe0c0"]
          : ["#5a6a4a", "#efe0c0"];
        fillPoly(ctx, q, palettes[1], "#2a2c30");
        const inner = [
          wallPt(wall, art.slot + 0.28, 36),
          wallPt(wall, art.slot + 0.72, 36),
          wallPt(wall, art.slot + 0.72, 52),
          wallPt(wall, art.slot + 0.28, 52),
        ];
        fillPoly(ctx, inner, palettes[0], null);
      }
    }
    if (wallGhost) {
      const wall = (wallGhost.wall === "z" || wallGhost.wall === "left") ? "left" : "back";
      const q = artQuadFor(wallGhost.type, wall, wallGhost.slot);
      if (wallGhost.type === CUE_RACK_TYPE && wallGhost.ok !== false) {
        ctx.globalAlpha = 0.55;
        drawCueRackOnWall(ctx, wall, wallGhost.slot, lightsOn, { wallPt, fillPoly });
        ctx.globalAlpha = 1;
      } else if (isPainting(wallGhost.type) && wallGhost.ok !== false) {
        drawPaintingOnWall(ctx, wallGhost.type, q, { alpha: 0.55, dim: lightsOn ? 1 : 0.5 });
      } else {
        ctx.globalAlpha = 0.45;
        fillPoly(ctx, q, wallGhost.ok === false ? "#ff2b2b" : "#7ac8ff", "#fff");
        ctx.globalAlpha = 1;
      }
    }
  }

  let lastPetStep = 0;
  function stepPets(now) {
    const dt = lastPetStep ? Math.min(0.05, (now - lastPetStep) / 1000) : 0;
    lastPetStep = now;
    const blocked = petWalkBlocked();
    const occupied = new Set();
    for (const p of people) {
      const ost = personState.get(p.username) || p;
      occupied.add(Math.round(ost.x ?? p.x) + "," + Math.round(ost.y ?? p.y));
    }
    // Keep placed pets off furniture if a piece landed on their tile.
    for (const pet of placedPets) {
      const hx = Math.round(pet.x), hy = Math.round(pet.y);
      if (tileIsFree(hx, hy, gridSize, blocked, null)) continue;
      const n = globalThis.HouseIso?.nearestFreeTile?.(hx, hy, blocked, gridSize);
      if (n) { pet.x = n.x; pet.y = n.y; }
    }
    for (const p of people) {
      const st = personState.get(p.username);
      if (!st) continue;
      if (!(p.activePet || st.activePet)) {
        st.petSit = false;
        st.petWalking = false;
        st.petPath = null;
        continue;
      }
      const ox = st.x, oy = st.y;
      const walking = Boolean(st.walking);
      const facing = p.facing || st.facing || { x: 1, z: 0 };
      const occ = new Set(occupied);
      occ.delete(Math.round(ox) + "," + Math.round(oy));
      const want = walking
        ? petFollowTarget(ox, oy, facing, gridSize, { blocked, occupied: occ })
        : petSitTarget(ox, oy, facing, { blocked, occupied: occ, gridSize, sitting: p.sitting || st.sitting });
      if (st.petX == null) { st.petX = ox; st.petY = oy; }
      // If the pet is already inside a blocked tile, hop to the nearest free one.
      if (!tileIsFree(st.petX, st.petY, gridSize, blocked, null)) {
        const n = globalThis.HouseIso?.nearestFreeTile?.(st.petX, st.petY, blocked, gridSize);
        if (n) { st.petX = n.x; st.petY = n.y; st.petPath = null; }
      }
      const gk = tileKey(want.x, want.y);
      if (!st.petPath || st.petPathGoal !== gk) {
        const path = globalThis.HouseIso?.pathfind({ x: st.petX, y: st.petY }, { x: want.x, y: want.y }, blocked, gridSize);
        st.petPath = path && path.length ? path.slice() : null;
        st.petPathGoal = gk;
      }
      const speed = walking ? 3.15 : 3.35;
      const dxWant = want.x - st.petX, dyWant = want.y - st.petY;
      if (!st.petPath || !st.petPath.length) {
        if (Math.hypot(dxWant, dyWant) < 0.08 && tileIsFree(want.x, want.y, gridSize, blocked, null)) {
          st.petX = want.x;
          st.petY = want.y;
        }
        st.petWalking = false;
        st.petSit = !walking;
      } else {
        const next = st.petPath[0];
        const dx = next.x - st.petX, dy = next.y - st.petY;
        const dist = Math.hypot(dx, dy);
        if (dist < 0.08) {
          st.petX = next.x;
          st.petY = next.y;
          st.petPath.shift();
          if (!st.petPath.length) {
            if (tileIsFree(want.x, want.y, gridSize, blocked, null)) {
              st.petX = want.x;
              st.petY = want.y;
            }
            st.petWalking = false;
            st.petSit = !walking;
          } else {
            st.petWalking = true;
            st.petSit = false;
          }
        } else if (dt > 0) {
          const step = Math.min(dist, speed * dt);
          st.petX += (dx / dist) * step;
          st.petY += (dy / dist) * step;
          st.petWalking = true;
          st.petSit = false;
        } else {
          st.petWalking = true;
          st.petSit = false;
        }
      }
      st.petFacing = st.petWalking
        ? { x: want.x - st.petX, z: want.y - st.petY }
        : (walking ? facing : petSitFacing(facing));
    }
  }

  function render(now) {
    if (!alive) return;
    stepPets(now);
    if (moveTarget && people.length) {
      const name = followName || (people[0] && people[0].username);
      const st = personState.get(name) || people.find((p) => p.username === name);
      if (st) {
        const x = st.x ?? st.targetX, y = st.y ?? st.targetY;
        const walking = Boolean(st.walking);
        if (!walking && x != null && Math.hypot((x) - (moveTarget.x + 0), (y) - (moveTarget.y + 0)) < 0.45) {
          moveTarget = null;
        }
      }
    }
    applyCamera();
    ctx.imageSmoothingEnabled = false;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = "#000";
    ctx.fillRect(0, 0, viewW, viewH);
    const { ox, oy } = originAt(now);
    ctx.save();
    ctx.translate(ox * zoom, oy * zoom);
    ctx.scale(zoom, zoom);
    const floorPat = decor.floorPattern || "wood";
    const floorCol = decor.floorColor || "honey";
    for (let y = 0; y < gridSize; y++) {
      for (let x = 0; x < gridSize; x++) {
        const p = tileToScreen(x, y);
        const spr = floorTileSprite(floorPat, floorCol, lightsOn, (x + y) + x * 3);
        blit(spr, p.sx - TW / 2 - 1, p.sy - 1);
        if (hoverTile && hoverTile.x === x && hoverTile.y === y) {
          drawTileShadow(ctx, x, y, "hover");
        }
        if (moveTarget && moveTarget.x === x && moveTarget.y === y) {
          drawTileShadow(ctx, x, y, "target");
        }
        if (ghost && x >= ghost.tx && y >= ghost.ty) {
          const dims = furnTileDims(ghost.type, normalizeFurnRot(ghost.rot));
          if (x < ghost.tx + dims.w && y < ghost.ty + dims.h) {
            drawTileShadow(ctx, x, y, ghost.ok ? "place-ok" : "place-bad");
          }
        }
        if (petGhost && petGhost.tx === x && petGhost.ty === y) {
          drawTileShadow(ctx, x, y, petGhost.ok ? "place-ok" : "place-bad");
        }
      }
    }
    drawFloorSlab();
    drawWalls(now);
    const list = collectDrawList(now);
    for (const it of list) {
      if (highlightId && it.id === highlightId && it.raw) {
        const r = normalizeFurnRot(it.raw.rot);
        const { w, h } = furnTileDims(it.raw.type, r);
        const a = tileToScreen(it.raw.x, it.raw.y);
        const b = tileToScreen(it.raw.x + w, it.raw.y);
        const c = tileToScreen(it.raw.x + w, it.raw.y + h);
        const d = tileToScreen(it.raw.x, it.raw.y + h);
        fillPoly(ctx, [a, b, c, d], "rgba(212, 180, 106, 0.28)", "#d4b46a");
      }
      if (it.kind === "person" && it.lie) {
        const { angle, headSx, headSy, zeds } = it.lie;
        ctx.save();
        ctx.translate(headSx, headSy);
        ctx.rotate(angle);
        // Full standing scale, on top of the bed. No shrink, no cover overlay.
        ctx.drawImage(it.spr.c, -AV_W / 2, -AV_HEAD_TOP - 1);
        ctx.restore();
        if (zeds) drawBedZeds(ctx, headSx, headSy - 10, zeds, lightsOn);
      } else if (it.kind === "person" && it.held && it.held.item) {

        const { item, anchor, face, sip } = it.held;
        const lift = sip?.lift || 0;
        const hx = it.sx + anchor.x;
        const hy = it.sy + anchor.y;
        let mx = hx, my = hy - 14;
        if (face?.mouth) { mx = it.sx + face.mouth.x; my = it.sy + face.mouth.y + 1; }
        else if (face?.head) { mx = it.sx + face.head.x; my = it.sy + face.head.y + 6; }
        const gx = item.gx || 0, gy = item.gy || 0;
        const lx = item.lx ?? gx, ly = item.ly ?? gy;
        const ix = (hx - gx) * (1 - lift) + (mx - lx) * lift;
        const iy = (hy - gy) * (1 - lift) + (my - ly) * lift;
        const behind = Boolean(anchor.behind) && lift < 0.4;
        if (behind) blit(item, ix, iy);
        blit(it.spr, it.sx, it.sy, it.alpha ?? 1);
        if (sip?.face) {
          const ov = drawSipFaceOverlay(face);
          if (ov) blit(ov, it.sx, it.sy);
        }
        if (!behind) blit(item, ix, iy);
      } else {
        blit(it.spr, it.sx, it.sy, it.alpha ?? 1);
      }
      if (it.recNotes?.length) {
        const off = platterOffset(it.raw?.rot);
        drawNotes(ctx, it.sx + off.x, it.sy + off.y, it.recNotes, lightsOn);
      }
      if (it.glow && it.screenQuad && it.screenQuad.length >= 4) {
        // Subtle ambient only, clipped to the TV screen parallelogram.
        ctx.save();
        ctx.beginPath();
        const q = it.screenQuad;
        ctx.moveTo(it.sx + q[0].x, it.sy + q[0].y);
        for (let i = 1; i < q.length; i++) ctx.lineTo(it.sx + q[i].x, it.sy + q[i].y);
        ctx.closePath();
        ctx.clip();
        ctx.fillStyle = "rgba(120, 180, 255, 0.10)";
        ctx.fill();
        ctx.restore();
      }
    }
    ctx.restore();
    const playingRec = furniture.find((f) => (f.type === "recordplayer" || f.type === RECORD_TYPE) && recordPlayers[f.id]?.on);
    if (playingRec && !isRecordListening()) {
      const proj = (function () {
        const rot = normalizeFurnRot(playingRec.rot);
        const pos = furnBlitPos(playingRec.x, playingRec.y, playingRec.type, rot, tileToScreen);
        const off = platterOffset(rot);
        return clientFromWorld(pos.sx + off.x, pos.sy + off.y - 8);
      })();
      paintListenHint(playingRec.id, proj && proj.visible !== false ? { x: proj.x, y: proj.y, w: 0, h: 0 } : null);
    } else {
      paintListenHint(null);
    }
    requestAnimationFrame(render);
  }

  function hitAt(cx, cy) {
    const now = performance.now();
    const wpt = worldFromClient(cx, cy, now);
    const floor = pickFloorTile(wpt.sx, wpt.sy);
    const sw = lightSwitchPos();
    if (pointInPoly(wpt, sw.quad) || (wpt.sx >= sw.sx && wpt.sx <= sw.sx + sw.w && wpt.sy >= sw.sy && wpt.sy <= sw.sy + sw.h)) {
      return { kind: "switch", floor };
    }
    for (const art of wallArt) {
      const pos = wallSlotWorld(art.wall, art.slot, art.type);
      if (wpt.sx >= pos.sx && wpt.sx <= pos.sx + (pos.w || 22) && wpt.sy >= pos.sy && wpt.sy <= pos.sy + (pos.h || 18)) {
        return { kind: "wall", wall: pos.wall, slot: pos.slot, art, floor };
      }
    }
    const list = collectDrawList(now);
    for (let i = list.length - 1; i >= 0; i--) {
      const it = list[i];
      if (it.kind === "person" || it.kind === "stool") continue;
      if (it.kind === "ghost") {
        if (!placing) continue;
        if (wpt.sx >= it.sx && wpt.sx <= it.sx + it.w && wpt.sy >= it.sy && wpt.sy <= it.sy + it.h) {
          return { kind: "ghost", id: it.id, floor, tx: it.tx, ty: it.ty, pet: it.pet };
        }
        continue;
      }
      if (it.kind === "pet") {
        if (wpt.sx >= it.sx && wpt.sx <= it.sx + it.w && wpt.sy >= it.sy && wpt.sy <= it.sy + it.h) {
          return { kind: "pet", id: it.id, pet: it.raw, floor };
        }
        continue;
      }
      if (wpt.sx >= it.sx && wpt.sx <= it.sx + it.w && wpt.sy >= it.sy && wpt.sy <= it.sy + it.h) {
        if (it.kind === "furn" && it.raw && !hitFurnitureAt(it.raw, wpt.sx, wpt.sy, screenToTile)) continue;
        if (it.kind === "furn" || it.kind === "npc") {
          const interactive = typeof isFurnInteractive === "function" ? isFurnInteractive(it.type, it.raw) : true;
          if (!interactive && !placing) continue;
          return { ...it, floor };
        }
        return { ...it, floor };
      }
    }
    // Prefer a just-off-edge floor snap over treating the click as a wall.
    if (floor) return { kind: "tile", x: floor.x, y: floor.y, floor };
    const raw = screenToTile(wpt.sx, wpt.sy);
    if (raw.y < -0.45 && raw.x >= -0.2 && raw.x < gridSize + 0.2) {
      return { kind: "wall", wall: "back", slot: Math.max(0, Math.min(gridSize - 1, Math.floor(raw.x))) };
    }
    if (raw.x < -0.45 && raw.y >= -0.2 && raw.y < gridSize + 0.2) {
      return { kind: "wall", wall: "left", slot: Math.max(0, Math.min(gridSize - 1, Math.floor(raw.y))) };
    }
    return null;
  }

  function grabHitFrom(hit) {
    if (!placing || !hit) return null;
    if (hit.kind === "ghost") return hit;
    if (hit.kind === "furn" || hit.kind === "npc") return hit;
    if (hit.kind === "pet" && hit.pet && !hit.pet.following) return hit;
    if (hit.kind === "wall" && hit.art) return hit;
    return null;
  }

  function handleTap(ev) {

    const hit = hitAt(ev.clientX, ev.clientY);
    if (!hit) return;
    if (hit.kind === "switch") { (onSwitchTap || onSwitchClick)?.(); return; }
    if (hit.kind === "wall") { onWallClick?.(hit.wall, hit.slot, hit.art); return; }
    if (hit.kind === "pet") { onPetClick?.(hit.pet || { id: hit.id }); return; }
    if (hit.kind === "furn" || hit.kind === "npc") { onFurnitureClick?.(hit.id, hit.type, hit.raw || {}); return; }
    if (hit.kind === "tile") onTileClick?.(hit.x, hit.y);
  }

  function handleHover(ev) {
    const now = performance.now();
    const wpt = worldFromClient(ev.clientX, ev.clientY, now);
    const floor = pickFloorTile(wpt.sx, wpt.sy);
    hoverTile = floor;
    if (floor) onTileHover?.(floor.x, floor.y);
    const hit = hitAt(ev.clientX, ev.clientY);
    if (hit?.kind === "wall") onWallHover?.(hit.wall, hit.slot);
  }

  canvas.addEventListener("pointerdown", (e) => {
    const over = document.elementFromPoint(e.clientX, e.clientY);
    if (over && over.closest && over.closest("#chat-dock, .chat-frame, #phone-btn, #emote-wheel-btn, #chat-send, #chat-input, #edit-inventory, #shop-toggle, .shop-toggle, #item-rotate, #edit-room-btn, #edit-char-overlay")) {
      return;
    }
    try { canvas.setPointerCapture?.(e.pointerId); } catch {}
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    velX = velY = 0;
    if (pointers.size === 2) {
      const pts = [...pointers.values()];
      pinchStart = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
      pinchZoom0 = userZoom || zoom;
      pinchCamX = camX; pinchCamY = camY;
      pinchAnchor = { x: (pts[0].x + pts[1].x) / 2, y: (pts[0].y + pts[1].y) / 2 };
      didPinch = true;
      panStart = null;
      grab = null;
    } else {
      didPinch = false;
      movedThisGesture = false;
      grab = null;
      const hit = placing ? hitAt(e.clientX, e.clientY) : null;
      const gh = grabHitFrom(hit);
      if (gh) {
        grab = { hit: gh, x: e.clientX, y: e.clientY, moved: false };
        panStart = null;
        onGrabStart?.(gh);
      } else {
        panStart = { x: e.clientX, y: e.clientY, camX, camY, t: performance.now() };
      }
    }
  });
  canvas.addEventListener("pointermove", (e) => {
    if (pointers.has(e.pointerId)) pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.size >= 2 && pinchStart) {
      const pts = [...pointers.values()];
      const d = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
      const midX = (pts[0].x + pts[1].x) / 2;
      const midY = (pts[0].y + pts[1].y) / 2;
      const next = pinchZoom0 * (d / Math.max(8, pinchStart));
      setUserZoomAt(next, midX, midY, true);
      followPaused = true;
      didPinch = true;
      return;
    }
    if (grab && pointers.size === 1 && !didPinch) {
      const dx = e.clientX - grab.x;
      const dy = e.clientY - grab.y;
      if (Math.hypot(dx, dy) >= TAP_SLOP || grab.moved) {
        grab.moved = true;
        movedThisGesture = true;
        onGrabMove?.(e.clientX, e.clientY, grab.hit);
      }
      return;
    }
    if (panStart && pointers.size === 1 && !didPinch && !panLocked) {
      const dx = e.clientX - panStart.x;
      const dy = e.clientY - panStart.y;
      if (Math.hypot(dx, dy) >= TAP_SLOP) {
        movedThisGesture = true;
        followPaused = true;
        autoFit = false;
        if (isPhoneView() && camMode === "room") camMode = "follow";
        camX = panStart.camX - dx / Math.max(0.2, zoom);
        camY = panStart.camY - dy / Math.max(0.2, zoom);
        clampCamHard();
      }
    }
    if (!didPinch) handleHover(e);
  });
  function maybeRecenterTap(e) {
    const now = performance.now();
    const dt = now - lastTapAt;
    const dist = Math.hypot(e.clientX - lastTapX, e.clientY - lastTapY);
    lastTapAt = now; lastTapX = e.clientX; lastTapY = e.clientY;
    if (dt > 80 && dt < 340 && dist < 28) {
      recenterView();
      return true;
    }
    return false;
  }
  function endPtr(e) {
    const known = pointers.has(e.pointerId);
    const start = panStart;
    pointers.delete(e.pointerId);
    if (pointers.size < 2) pinchStart = 0;
    if (pointers.size === 0) {
      const dt = start ? performance.now() - start.t : 0;
      const dist = start ? Math.hypot(e.clientX - start.x, e.clientY - start.y) : 0;
      if (!known && !start) return;
      if (start && movedThisGesture && !didPinch && !panLocked && dt > 0) {
        const inv = 1000 / Math.max(16, dt);
        velX = -(e.clientX - start.x) / Math.max(0.2, zoom) * (16 / Math.max(16, dt)) * 0.85;
        velY = -(e.clientY - start.y) / Math.max(0.2, zoom) * (16 / Math.max(16, dt)) * 0.85;
      }
      const grabbed = grab;
      grab = null;
      panStart = null;
      const pinched = didPinch;
      didPinch = false;
      const moved = movedThisGesture;
      movedThisGesture = false;
      if (grabbed) {
        if (grabbed.moved) onGrabEnd?.(e.clientX, e.clientY, grabbed.hit);
        else handleTap(e);
        return;
      }
      // Two fingers never issue a walk/tap.
      if (!pinched && start && dist < TAP_SLOP && dt < 500) {
        if (maybeRecenterTap(e)) return;
        handleTap(e);
      }
    }
  }
  canvas.addEventListener("pointerup", endPtr);
  canvas.addEventListener("pointercancel", endPtr);
  canvas.addEventListener("wheel", (e) => {
    e.preventDefault();
    const factor = Math.exp(-e.deltaY * 0.0018);
    const base = zoomTarget || userZoom || zoom || 1;
    setUserZoomAt(base * factor, e.clientX, e.clientY, false);
    if (isPhoneView() && camMode !== "follow") camMode = "follow";
    followPaused = true;
  }, { passive: false });

  function recenterView() {
    followPaused = false;
    autoFit = !isPhoneView();
    velX = velY = 0;
    if (isPhoneView()) {
      camMode = "room";
    } else {
      camMode = "room";
      autoFit = true;
    }
    applyCamera();
    return camMode;
  }

  function setCamMode(mode) {
    camMode = mode === "room" ? "room" : "follow";
    followPaused = false;
    velX = velY = 0;
    if (camMode === "room") {
      autoFit = true;
      fitRoomCamera();
      zoomTarget = zoom;
    } else {
      autoFit = false;
      if (isPhoneView() && userZoom < 1.15) {
        userZoom = FOLLOW_ZOOM_DEFAULT;
        zoomTarget = FOLLOW_ZOOM_DEFAULT;
        zoom = FOLLOW_ZOOM_DEFAULT;
      } else {
        zoomTarget = clampZoom(userZoom || zoom || FOLLOW_ZOOM_DEFAULT);
        userZoom = zoomTarget;
      }
    }
    applyCamera();
    return camMode;
  }

  function findFurnMesh(id) {
    const f = furniture.find((x) => x.id === id);
    if (!f) return null;
    const metrics = f.type === "chesstable" ? chessBoardMetrics() : { square: 0.125, table: 1.7 };
    return { userData: { ...f, type: f.type, boardSquare: metrics.square, tableSize: metrics.table } };
  }

  function interpolatePeople(list) {
    const seen = new Set();
    for (const p of list) {
      seen.add(p.username);
      let st = personState.get(p.username);
      if (!st) {
        st = { x: p.x, y: p.y, walking: false, dirX: 0, dirY: 0, petX: p.x, petY: p.y };
        personState.set(p.username, st);
      }
      st.targetX = p.x;
      st.targetY = p.y;
      st.facing = p.facing;
      if (p.sitting && !st.sitting) {
        st.sitEaseAt = (typeof performance !== "undefined" && performance.now) ? performance.now() : Date.now();
        st.sitFromX = st.x ?? p.x;
        st.sitFromY = st.y ?? p.y;
      }
      if (!p.sitting) st.sitEaseAt = null;
      Object.assign(st, { sitting: p.sitting, lying: p.lying, lyingAt: p.lyingAt, usingPhone: p.usingPhone, boxing: p.boxing, actionEmote: p.actionEmote, heldItem: p.heldItem, heldProp: p.heldProp, activePet: p.activePet, avatar: p.avatar, username: p.username, stationId: p.stationId });
    }
    for (const k of [...personState.keys()]) if (!seen.has(k)) personState.delete(k);
    people = list.map((p) => {
      const st = personState.get(p.username);
      if (!st) return p;
      if (st.sitEaseAt == null) {
        st.x = p.x;
        st.y = p.y;
      }
      st.walking = Boolean(p.walking);
      st.dirX = p.dirX || 0;
      st.dirY = (p.dirZ ?? p.dirY) || 0;
      if (st.petX == null) { st.petX = st.x; st.petY = st.y; }
      return p;
    });
  }

  if (backdrop || !isPhoneView()) {
    camMode = "room";
    zoom = 1;
    zoomTarget = 1;
    autoFit = true;
  } else {
    camMode = "follow";
    userZoom = FOLLOW_ZOOM_DEFAULT;
    zoom = FOLLOW_ZOOM_DEFAULT;
    zoomTarget = FOLLOW_ZOOM_DEFAULT;
    autoFit = false;
  }
  resize();
  requestAnimationFrame(render);

  const api = {
    ready: true,
    overlay,
    resize,
    setStyle(wp, fl) {
      if (wp) wallpaper = wp;
      if (fl) floorStyle = fl;
      decor = normalizeDecor({ wallpaper, floorStyle, ...decor });
    },
    setDecor(next) {
      decor = normalizeDecor(next || {}, decor);
      const alias = legacyAliases(decor);
      wallpaper = alias.wallpaper;
      floorStyle = alias.floorStyle;
    },
    getDecor() { return { ...decor }; },
    setGridSize(n) { gridSize = Math.max(4, Math.min(12, n || 6)); applyCamera(); },
    setFurniture(list) { furniture = (list || []).map((f) => ({ ...f, rot: normalizeFurnRot(f.rot) })); },
    setPlacedPets(list) { placedPets = (list || []).map((p) => ({ ...p })); },
    getPlacedPets() { return (placedPets || []).map((p) => ({ ...p })); },
    setPetGhost(item, tx, ty, ok) {
      petGhost = item == null ? null : { item, tx, ty, ok: Boolean(ok) };
    },
    getPetGhost() { return petGhost ? { ...petGhost } : null; },
    onPetClick(fn) { onPetClick = fn; },
    projectPet(id) {
      const it = collectDrawList(performance.now()).find((x) => x.kind === "pet" && x.id === id);
      if (!it) return null;
      const c = clientFromWorld(it.sx + it.w / 2, it.sy);
      return { x: c.x, y: c.y, visible: c.visible };
    },

    addFurniture(f) { furniture = furniture.concat([{ ...f, rot: normalizeFurnRot(f.rot) }]); },
    getFurniture() { return furniture.slice(); },
    setGhost(type, tx, ty, ok, rot) {
      if (!type) { ghost = null; return; }
      if (typeof type === "object") { ghost = type; return; }
      ghost = { type, tx, ty, ok: ok !== false, rot: normalizeFurnRot(rot) };
    },

    getGhost() { return ghost; },
    getWallGhost() { return wallGhost; },
    highlightFurniture(id) { highlightId = id || null; },
    projectFurniture(id) {
      const f = furniture.find((x) => x.id === id);
      if (!f) return null;
      const rot = normalizeFurnRot(f.rot);
      const m = furnSpriteMetrics(f.type, rot);
      const mid = tileToScreen(f.x + m.tw / 2, f.y + m.th / 2);
      return clientFromWorld(mid.sx, mid.sy - m.bodyH / 2);
    },
    setLights(on) { lightsOn = on !== false; },
    lightsOn() { return lightsOn; },
    tvOn(id) { return Boolean(tvs[id]?.on); },
    tvChannel(id) { return tvs[id]?.on ? (tvs[id].channel || 0) : -1; },
    tvChannelName(id) { return tvs[id]?.on ? tvChannelName(tvs[id].channel || 0) : ""; },
    fridgeOpen(id) { return Boolean(uses[id]?.open); },
    setUses(u) { uses = u || {}; },
    setChessMap(m) { chess = m || {}; },
    setTvs(m) { tvs = m || {}; },
    setRecordPlayers(m) { recordPlayers = m || {}; },
    recordOn(id) { return Boolean(recordPlayers[id]?.on); },
    recordVinyl(id) { return recordPlayers[id]?.on ? (recordPlayers[id].vinyl || null) : null; },
    recordState(id) { return recordPlayers[id] ? { ...recordPlayers[id] } : { on: false, vinyl: null }; },
    recordNotes(id) {
      const rec = recordPlayers[id];
      return rec?.on ? notesAt(id, rec, nowServer()) : [];
    },
    setWallArt(list) { wallArt = list || []; },
    setWallGhost(type, wall, slot, ok) { wallGhost = type ? { type, wall, slot, ok } : null; },
    setArcade(m) { arcade = m || {}; },
    getArcade() { return arcade; },
    setServerTime(t) { serverTime0 = t || Date.now(); serverAt = performance.now(); },
    tvProgram() { return programAt(nowServer()); },
    nowServer,
    findFurnMesh,
    getWallArt() { return wallArt.slice(); },
    artMetrics(type, wall, slot) { return artMetrics(type, wall, slot); },
    tileSize() { return { tw: TW, th: TH, floorTilePx: TH }; },
    petSitting(name) {
      const p = people.find((x) => x.username === name);
      const st = personState.get(name);
      if (!p?.activePet && !st?.activePet) return false;
      return Boolean(st?.petSit);
    },
    petPose(name) {
      const p = people.find((x) => x.username === name);
      const st = personState.get(name);
      if (!p?.activePet && !st?.activePet) return null;
      return {
        sitting: Boolean(st?.petSit),
        x: st?.petX ?? null,
        y: st?.petY ?? null,
        following: Boolean((st?.walking || p?.walking) && !st?.petSit),
        walking: Boolean(st?.petWalking),
      };
    },
    petSitTarget,
    petFollowTarget,
    placedPetAnim,
    bagSwinging(id) { const u = uses[id]; return Boolean(u && (u.hit || u.swing || u.move || (u.lastHitAt && (Date.now() - u.lastHitAt) < 2500))); },
    personFlags(name) {
      const p = people.find((x) => x.username === name);
      if (!p) return null;
      const st = personState.get(name) || {};
      return {
        boxing: p.boxing || st.boxing || Object.values(uses || {}).some((u) => u && u.type === "punchbag" && u.user === name), sitting: p.sitting, lying: p.lying, heldItem: p.heldItem, gym: p.gym, facing: p.sitting ? snapFacingToAxis(p.facing) : p.facing,
        actionEmote: p.actionEmote, walking: Boolean(st.walking || p.walking), usingPhone: p.usingPhone,
        sculpted: false, paperDoll: true, pixel: true,
        eyes: getChibiAnim(name),
      };
    },
    setEyeOverride(name, state) { setChibiAnimOverride(name, state || null); },
    personTile(name) {
      const st = personState.get(name);
      const p = people.find((x) => x.username === name);
      if (st) return { x: st.x, y: st.y };
      if (p) return { x: p.x, y: p.y };
      return null;
    },
    projectTile(tx, ty) {
      const p = footOf(tx, ty);
      return clientFromWorld(p.sx, p.sy - 2);
    },
    projectHead(name) {
      const st = personState.get(name);
      const p = people.find((x) => x.username === name);
      if (!st && !p) return null;
      const lying = Boolean(st?.lying || p?.lying);
      if (lying) {
        const bed = furniture.find((f) => f.id === (p?.stationId || st?.stationId) && f.type === "bed");
        const draw = lieDrawPose(bed || { x: st?.x ?? p.x, y: st?.y ?? p.y, rot: 0 }, tileToScreen, { headTop: AV_HEAD_TOP, groundY: AV_GROUND_Y, avW: AV_W, avH: AV_H });
        const c = clientFromWorld(draw.headSx, draw.headSy - 12);
        const f = clientFromWorld(draw.headSx, draw.headSy + 8);
        const rect = container.getBoundingClientRect();
        return { x: c.x - rect.left, y: c.y - rect.top, footY: f.y - rect.top, visible: c.visible };
      }
      const x = (st?.x ?? p.x) + 0.5, y = (st?.y ?? p.y) + 0.5;
      const foot = tileToScreen(x, y);
      // Sit the name tag just above the visible hair/head, not the empty canvas pad.
      const top = (st?.figTop != null) ? st.figTop : (AV_HEAD_TOP || 2);
      const c = clientFromWorld(foot.sx, foot.sy - AV_GROUND_Y + top);
      const f = clientFromWorld(foot.sx, foot.sy);
      const rect = container.getBoundingClientRect();
      return { x: c.x - rect.left, y: c.y - rect.top, footY: f.y - rect.top, visible: c.visible };
    },
    /* Viewport-space box of the visible figure, including a little room for the name tag. */
    personBox(name) {
      const st = personState.get(name);
      const p = people.find((x) => x.username === name);
      if (!st && !p) return null;
      const x = (st?.x ?? p.x) + 0.5, y = (st?.y ?? p.y) + 0.5;
      const foot = tileToScreen(x, y);
      const top = (st?.figTop != null) ? st.figTop : (AV_HEAD_TOP || 2);
      const namePad = 16;
      const tl = clientFromWorld(foot.sx - AV_W / 2, foot.sy - AV_GROUND_Y + top - namePad);
      const br = clientFromWorld(foot.sx + AV_W / 2, foot.sy + 4);
      const left = Math.min(tl.x, br.x), right = Math.max(tl.x, br.x);
      const topY = Math.min(tl.y, br.y), botY = Math.max(tl.y, br.y);
      return { x: left, y: topY, w: right - left, h: botY - topY, left, top: topY, right, bottom: botY };
    },
    setEditViewShift(x, y) {
      editViewShiftX = x || 0;
      editViewShiftY = y || 0;
      return { x: editViewShiftX, y: editViewShiftY };
    },
    getEditViewShift() { return { x: editViewShiftX, y: editViewShiftY }; },
    visualZoom() { return zoom; },
    zoomRange() { return { min: minUserZoom(), max: USER_ZOOM_MAX, zoom, userZoom }; },
    roomInView(pad = 4) {
      const now = performance.now();
      const rect = canvas.getBoundingClientRect();
      const b = roomWorldBounds();
      const corners = [[b.minX, b.minY], [b.maxX, b.minY], [b.minX, b.maxY], [b.maxX, b.maxY]];
      const pts = corners.map(([sx, sy]) => clientFromWorld(sx, sy, now));
      const left = Math.min(...pts.map((p) => p.x));
      const right = Math.max(...pts.map((p) => p.x));
      const top = Math.min(...pts.map((p) => p.y));
      const bottom = Math.max(...pts.map((p) => p.y));
      const margin = {
        l: left - rect.left,
        r: rect.right - right,
        t: top - rect.top,
        b: rect.bottom - bottom,
      };
      return {
        ok: margin.l >= -pad && margin.r >= -pad && margin.t >= -pad && margin.b >= -pad,
        margin,
        zoom,
        size: gridSize,
        view: { w: viewW, h: viewH },
      };
    },
    syncPeople(list) { interpolatePeople(list || []); },
    setNpcs(list) { npcs = list || []; },
    onTileClick(fn) { onTileClick = fn; },
    onTileHover(fn) { onTileHover = fn; },
    setFurnInteractive(fn) { isFurnInteractive = fn || null; },
    setMoveTarget(tx, ty) { moveTarget = (tx == null || ty == null) ? null : { x: tx | 0, y: ty | 0 }; },
    getMoveTarget() { return moveTarget ? { ...moveTarget } : null; },
    getHoverTile() { return hoverTile ? { ...hoverTile } : null; },
    pickFloorTileAt(cx, cy) {
      const wpt = worldFromClient(cx, cy, performance.now());
      return pickFloorTile(wpt.sx, wpt.sy);
    },
    pickHitAt(cx, cy) { return hitAt(cx, cy); },
    onGrabStart(fn) { onGrabStart = fn; },
    onGrabMove(fn) { onGrabMove = fn; },
    onGrabEnd(fn) { onGrabEnd = fn; },
    projectWorld(tx, ty) {
      const p = tileToScreen(tx, ty);
      return clientFromWorld(p.sx, p.sy);
    },
    onFurnitureClick(fn) { onFurnitureClick = fn; },
    onSwitchClick(fn) { onSwitchClick = fn; },
    onSwitchTap(fn) { onSwitchTap = fn; },
    lightState() { return { room: lightsOn, lamps: lightsOn }; },
    doorSlot() { return doorSlot(); },
    switchSlot() { return switchSlot(); },
    doorWall() { return "left"; },
    onWallClick(fn) { onWallClick = fn; },
    onWallHover(fn) { onWallHover = fn; },
    simulateWallClick(wall, slot) { onWallClick?.(wall, slot); },
    setFollowName(name) { followName = name || null; },
    setCamMode,
    toggleCamMode() { return setCamMode(camMode === "follow" ? "room" : "follow"); },
    camState() {
      return {
        mode: isPhoneView() ? camMode : "room",
        zoom: (!isPhoneView() || camMode === "room") ? 1 : zoom,
        phone: isPhoneView(),
        follow: followName,
        paused: Boolean(followPaused),
        target: { x: camX, y: 0, z: camY },
      };
    },
    chessBoardInfo(id) {
      const m = findFurnMesh(id);
      if (!m || m.userData.type !== "chesstable") return null;
      return chessBoardMetrics();
    },
    setZoom(z) {
      const next = clampZoom(z);
      userZoom = next;
      zoomTarget = next;
      if (isPhoneView() && camMode === "follow") zoom = next;
    },
    tapAt(x, y) { handleTap({ clientX: x, clientY: y }); },
    roomFitsView() {
      const now = performance.now();
      const rect = canvas.getBoundingClientRect();
      const b = roomWorldBounds();
      const pad = 3;
      const pts = [[b.minX, b.maxY], [b.maxX, b.maxY], [b.minX, b.minY], [b.maxX, b.minY]];
      const saved = { camX, camY, zoom, camMode, userZoom };
      fitRoomCamera();
      const clipped = [];
      for (const [sx, sy] of pts) {
        const c = clientFromWorld(sx, sy, now);
        const ok = c.x >= rect.left - pad && c.x <= rect.right + pad && c.y >= rect.top - pad && c.y <= rect.bottom + pad;
        if (!ok) clipped.push({ x: c.x, y: c.y });
      }
      camX = saved.camX; camY = saved.camY; zoom = saved.zoom; camMode = saved.camMode; userZoom = saved.userZoom;
      return { ok: clipped.length === 0, clipped, rect: { left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom, width: rect.width, height: rect.height } };
    },
    setPlacing(type) { placing = type; if (!type) { ghost = null; grab = null; } },
    setPanLocked(on) { panLocked = Boolean(on); if (panLocked) { panStart = null; velX = velY = 0; } },
    recenterView,
    simulateTileClick(tx, ty) { onTileClick?.(tx, ty); },
    simulateFurnitureClick(id, type, extra) { onFurnitureClick?.(id, type, extra || {}); },
    simulateSwitchClick() { onSwitchClick?.(); },
    clear() {
      furniture = []; wallArt = []; arcade = {}; people = []; npcs = [];
      personState.clear(); ghost = null; wallGhost = null;
    },
    dispose() { alive = false; container.innerHTML = ""; },
  };
  if (!backdrop) window.HouseRoom3D = api;
  return api;
}

export function createEmptyRoomBackdrop(container) {
  return createRoom3D(container, { backdrop: true });
}

export default { createRoom3D, createEmptyRoomBackdrop, createAvatarPreview, paintAvatarSheet, paintStoreThumb, paintPetSheet, paintFurnitureSheet, AVATAR_SHEET_LOOKS, PET_W, PET_H, FURN_SHEET_TYPES };

