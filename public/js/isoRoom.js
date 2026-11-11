import { drawAvatarSprite, paintAvatarSheet, paintStoreThumb, AVATAR_SHEET_LOOKS, AV_W, AV_H, AV_GROUND_Y, facingIndex8 } from "./avatar3d.js";
import { drawPetSprite as drawPetPixel, paintPetSheet, paintPetThumb, PET_W, PET_H, PET_GROUND_Y } from "./petSprites.js";
import { programAt } from "./cubechannel.js";
import {
  normalizeFurnRot, snapFacingToAxis, furnTileDims, furnSpriteMetrics, furnBlitPos,
  drawFurnitureSprite, paintFurnitureSheet, hitFurnitureAt, FURN_SHEET_TYPES,
} from "./furnIso.js";
/* 2D isometric pixel room renderer — 2000s house style, HouseRoom3D API. */
const TW = 64;
const TH = 32;
const WALL_H = 88;
const FOLLOW_ZOOM_DEFAULT = 2;
const ZOOMS = [1, 2, 3];

function isPhoneView() {
  if (typeof window === "undefined") return false;
  return window.innerWidth <= 820;
}

function snapZoom(z) {
  const n = Number(z) || 1;
  let best = 1, d = Infinity;
  for (const v of ZOOMS) {
    const dd = Math.abs(v - n);
    if (dd < d) { best = v; d = dd; }
  }
  return best;
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
  "paint-cream": { base: "#b4b8c0", grout: "#5a5e64", cap: "#2a2c30", skirt: "#4a4e54", trim: "#3a3c40", accent: "#c4a35a", cyber: false },
  "paint-sage": { base: "#8a9a86", grout: "#5a6a56", cap: "#2a3228", skirt: "#3a4a36", trim: "#4a5a46", accent: "#6a8a4a", cyber: false },
  "paint-blush": { base: "#c4a8a6", grout: "#8a6a68", cap: "#4a3230", skirt: "#6a4a48", trim: "#5a3a38", accent: "#c48a80", cyber: false },
  "paint-slate": { base: "#8a8e9a", grout: "#5a5e6a", cap: "#2a2c34", skirt: "#3a3e4a", trim: "#3a3e4a", accent: "#6a7a9a", cyber: false },
  "stars-mint": { base: "#8a9a86", grout: "#5a6a56", cap: "#2a3228", skirt: "#3a4a36", trim: "#4a5a46", accent: "#6a8a4a", cyber: false },
  "dots-peach": { base: "#c4a8a6", grout: "#8a6a68", cap: "#4a3230", skirt: "#6a4a48", trim: "#5a3a38", accent: "#c48a80", cyber: false },
  "stripes-lilac": { base: "#8a8e9a", grout: "#5a5e6a", cap: "#2a2c34", skirt: "#3a3e4a", trim: "#3a3e4a", accent: "#6a7a9a", cyber: false },
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

function addOutline(ctx, w, h, color = "#0a0612") {
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

function floorTileSprite(kind, lights, variant) {
  const key = "floor:" + kind + ":" + lights + ":" + variant;
  return sprite(key, TW + 2, TH + 2, (ctx) => {
    const dim = lights ? 0 : -36;
    const cx = TW / 2 + 1, cy = 1;
    if (kind === "tile") {
      const a = shade(variant % 2 ? "#b4b8c0" : "#a8acb4", dim);
      drawDiamond(ctx, cx, cy, a, shade("#6d727a", dim));
      ctx.strokeStyle = shade("#8a8e96", dim);
      ctx.beginPath();
      ctx.moveTo(cx, cy + TH / 2);
      ctx.lineTo(cx + TW / 4, cy + TH / 4);
      ctx.stroke();
    } else if (kind === "carpet") {
      const a = shade(variant % 3 === 0 ? "#9a2030" : (variant % 3 === 1 ? "#8a1c2a" : "#a42836"), dim);
      drawDiamond(ctx, cx, cy, a, shade("#5a1018", dim));
      ctx.strokeStyle = shade("#d4a04a", dim);
      ctx.beginPath();
      ctx.moveTo(cx, cy + 6);
      ctx.lineTo(cx + TW / 2 - 8, cy + TH / 2);
      ctx.lineTo(cx, cy + TH - 6);
      ctx.lineTo(cx - TW / 2 + 8, cy + TH / 2);
      ctx.closePath();
      ctx.stroke();
      pset(ctx, cx, cy + TH / 2, shade("#e8c878", dim));
    } else {
      const woods = ["#8a5a32", "#9a6840", "#7a4e2a", "#a07048"];
      drawDiamond(ctx, cx, cy, shade(woods[variant % 4], dim), shade("#4a2e18", dim));
      ctx.strokeStyle = shade("#5a3818", dim);
      ctx.lineWidth = 1;
      for (let i = 1; i <= 2; i++) {
        const t = i / 3;
        ctx.beginPath();
        ctx.moveTo(cx - (1 - t) * TW / 2, cy + t * TH);
        ctx.lineTo(cx + t * TW / 2, cy + t * TH);
        ctx.stroke();
      }
      pset(ctx, cx - 6, cy + TH / 2, shade("#c4a070", dim));
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

function drawPetSprite(kind, frame, walking, sit, facing) {
  return drawPetPixel(kind, { walking, sit, facing, dir: facing ? facingIndex8(facing) : undefined }, frame);
}

export function createAvatarPreview(container) {
  container.innerHTML = "";
  container.style.position = "relative";
  container.style.imageRendering = "pixelated";
  const canvas = document.createElement("canvas");
  canvas.style.cssText = "width:100%;height:100%;image-rendering:pixelated;display:block";
  container.appendChild(canvas);
  let avatar = {};
  let facing = { x: 1, z: 1 };
  let raf = 0, alive = true;

  function resize() {
    const w = container.clientWidth || 160;
    const h = container.clientHeight || 180;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.max(1, Math.floor(w * dpr));
    canvas.height = Math.max(1, Math.floor(h * dpr));
    canvas.style.width = w + "px";
    canvas.style.height = h + "px";
  }

  function render(now) {
    if (!alive) return;
    const c = canvas.getContext("2d");
    const w = canvas.width, h = canvas.height;
    c.imageSmoothingEnabled = false;
    c.fillStyle = "#efe6d4";
    c.fillRect(0, 0, w, h);
    const scale = Math.max(2, Math.floor(Math.min(w / (AV_W + 8), h / (AV_H + 8))));
    const frame = Math.floor((now || 0) / 400) % 2;
    const spr = drawAvatarSprite(avatar, { facing, walking: false }, frame);
    const dx = Math.floor((w - spr.w * scale) / 2);
    const dy = Math.floor((h - spr.h * scale) / 2);
    c.drawImage(spr.c, 0, 0, spr.w, spr.h, dx, dy, spr.w * scale, spr.h * scale);
    raf = requestAnimationFrame(render);
  }

  resize();
  raf = requestAnimationFrame(render);
  return {
    setAvatar(a) { avatar = a || {}; },
    setPose() {},
    resize,
    dispose() { alive = false; cancelAnimationFrame(raf); container.innerHTML = ""; },
  };
}

export function createRoom3D(container) {
  container.innerHTML = "";
  container.style.position = "relative";
  container.style.overflow = "hidden";
  container.style.background = "#000";

  const canvas = document.createElement("canvas");
  canvas.className = "iso-room";
  canvas.style.cssText = "position:absolute;inset:0;width:100%;height:100%;image-rendering:pixelated;image-rendering:crisp-edges;z-index:1;touch-action:none";
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
  let lightsOn = true;
  let furniture = [];
  let wallArt = [];
  let uses = {};
  let tvs = {};
  let chess = {};
  let arcade = {};
  let people = [];
  let npcs = [];
  let ghost = null;
  let wallGhost = null;
  let highlightId = null;
  let followName = null;
  let camMode = "follow";
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
  let pinchStart = 0, pinchZoom0 = 1;
  let onTileClick = null, onTileHover = null, onFurnitureClick = null;
  let onSwitchClick = null, onWallClick = null, onWallHover = null;
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
  function originAt(now) {
    return { ox: viewW / (2 * zoom) - camX, oy: viewH / (2 * zoom) - camY + bobY(now) };
  }
  function fitRoomCamera() {
    const b = roomWorldBounds();
    camX = (b.minX + b.maxX) / 2;
    camY = (b.minY + b.maxY) / 2 + 4;
    const sx = viewW / Math.max(1, b.w + 16);
    const sy = viewH / Math.max(1, b.h + 16);
    const fit = Math.min(sx, sy);
    zoom = fit >= 1 ? 1 : Math.max(0.45, fit);
  }
  function followCamera() {
    const name = followName || (people[0] && people[0].username);
    const p = people.find((x) => x.username === name) || people[0];
    const t = p ? tileToScreen((p.x ?? 0) + 0.5, (p.y ?? 0) + 0.5) : tileToScreen(gridSize / 2, gridSize / 2);
    camX += (t.sx - camX) * 0.18;
    camY += (t.sy - AV_H / 2 - camY) * 0.18;
    zoom = snapZoom(userZoom);
  }
  function applyCamera() {
    if (!isPhoneView() || camMode === "room") {
      fitRoomCamera();
      if (!isPhoneView()) {
        const b = roomWorldBounds();
        const sx = Math.floor(viewW / Math.max(1, b.w + 8));
        const sy = Math.floor(viewH / Math.max(1, b.h + 8));
        zoom = Math.max(1, Math.min(3, Math.min(sx, sy) || 1));
      }
    } else {
      followCamera();
    }
    if (overlay && overlay.style) overlay.style.setProperty("--iso-zoom", String(zoom));
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
      if (userZoom < 1.15) userZoom = FOLLOW_ZOOM_DEFAULT;
    }
    lastPhone = phone;
    if (phone && camMode === "follow" && userZoom < 1.15) userZoom = FOLLOW_ZOOM_DEFAULT;
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
  function doorSlot() { return Math.round(gridSize * 0.22 - 0.5 + gridSize / 2); }
  function switchSlot() { return Math.round(gridSize * 0.22 - 0.7 - 0.5 + gridSize / 2); }
  function lightSwitchPos() {
    const p = wallPt("left", switchSlot() + 0.38, 42);
    return { sx: p.sx - 4, sy: p.sy - 5, w: 8, h: 11 };
  }
  function wallSlotWorld(wall, slot) {
    const s = Math.max(0, Math.min(gridSize - 1, slot | 0));
    const wname = (wall === "z" || wall === "left") ? "left" : "back";
    const b = quadBounds(wallArtQuad(wname, s));
    return { sx: b.minX, sy: b.minY, w: b.w, h: b.h, wall: wname, slot: s };
  }

  function collectDrawList(now) {
    const list = [];
    for (const f of furniture) {
      const type = f.type;
      const rot = normalizeFurnRot(f.rot);
      const m = furnSpriteMetrics(type, rot);
      const pos = furnBlitPos(f.x, f.y, type, rot, tileToScreen);
      const tv = tvs[f.id] || {};
      const spr = drawFurnitureSprite(type, {
        lights: lightsOn,
        rot,
        on: type === "tv" || type === "holotv" ? Boolean(tv.on) : Boolean(uses[f.id]?.on),
        open: type === "fridge" ? Boolean(uses[f.id]?.open) : false,
        sku: f.sku,
      });
      list.push({ kind: "furn", id: f.id, type, depth: f.x + f.y + (m.tw + m.th) / 2 + 0.2, sx: pos.sx, sy: pos.sy, w: pos.w, h: pos.h, spr, raw: f });
    }
    for (const npc of npcs) {
      const foot = footOf(npc.x, npc.y);
      const spr = drawAvatarSprite(npc.avatar || {}, { facing: { x: 1, z: 1 } }, 0);
      list.push({ kind: "npc", id: npc.id, type: "shopkeeper", depth: npc.x + npc.y + 0.4, sx: foot.sx - AV_W / 2, sy: foot.sy - AV_GROUND_Y, w: AV_W, h: AV_H, spr, raw: npc });
    }
    for (const p of people) {
      const st = personState.get(p.username) || p;
      const x = st.x ?? p.x, y = st.y ?? p.y;
      const walking = Boolean(st.walking || p.walking);
      const frame = Math.floor(now / 96) % 8;
      const rawFacing = p.facing || st.facing;
      const flags = {
        sitting: p.sitting, walking, facing: p.sitting ? snapFacingToAxis(rawFacing) : rawFacing, dirX: st.dirX, dirY: st.dirY,
        usingPhone: p.usingPhone, boxing: p.boxing, actionEmote: p.actionEmote,
        heldItem: p.heldItem, heldProp: p.heldProp, gym: p.gym,
      };
      const spr = drawAvatarSprite(p.avatar || {}, flags, frame);
      const foot = tileToScreen(x + 0.5, y + 0.5);
      list.push({ kind: "person", id: p.username, type: "person", depth: x + y + 0.45, sx: foot.sx - AV_W / 2, sy: foot.sy - AV_GROUND_Y, w: AV_W, h: AV_H, spr, raw: p, tileX: x, tileY: y });
      if (p.activePet) {
        const sit = !walking && !p.sitting;
        const facing = p.facing || st.facing || { x: 1, z: 0 };
        const fx = facing.x || 0, fz = facing.z || 0;
        const rx = -fz, ry = fx;
        const plen = Math.hypot(rx, ry) || 1;
        const pst = st.petX != null ? { x: st.petX, y: st.petY } : { x: x + (rx / plen) * 0.45, y: y + (ry / plen) * 0.45 };
        const pf = tileToScreen(pst.x + 0.5, pst.y + 0.5);
        const hover = false;
        const pspr = drawPetSprite(p.activePet, frame, walking || hover, sit && !hover, facing);
        list.push({ kind: "pet", id: p.username + "-pet", type: "pet", depth: pst.x + pst.y + 0.35, sx: pf.sx - PET_W / 2, sy: pf.sy - PET_GROUND_Y, w: PET_W, h: PET_H, spr: pspr });
      }
    }
    if (ghost) {
      const rot = normalizeFurnRot(ghost.rot);
      const m = furnSpriteMetrics(ghost.type, rot);
      const pos = furnBlitPos(ghost.tx, ghost.ty, ghost.type, rot, tileToScreen);
      const spr = drawFurnitureSprite(ghost.type, { lights: lightsOn, rot });
      list.push({ kind: "ghost", depth: ghost.tx + ghost.ty + (m.tw + m.th) / 2 + 0.9, sx: pos.sx, sy: pos.sy, w: pos.w, h: pos.h, spr, alpha: 0.55 });
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
    const down = (p) => ({ sx: p.sx, sy: p.sy + SLAB });
    fillPoly(ctx, [a, b, down(b), down(a)], "#5a4030", "#2a1c14");
    fillPoly(ctx, [b, c, down(c), down(b)], "#6e4e38", "#2a1c14");
    ctx.strokeStyle = "#1a120c";
    ctx.beginPath();
    ctx.moveTo(down(a).sx, down(a).sy);
    ctx.lineTo(down(b).sx, down(b).sy);
    ctx.lineTo(down(c).sx, down(c).sy);
    ctx.stroke();
  }

  function drawWalls() {
    const n = gridSize;
    const pal = WALL_COLORS[wallpaper] || WALL_COLORS["paint-cream"];
    const dim = lightsOn ? 0 : -36;
    const base = shade(pal.base, dim);
    const grout = shade(pal.grout || "#6d727a", dim);
    const cap = pal.cap || "#2a2c30";
    const skirt = shade(pal.skirt || "#4a4e54", dim);
    const cyber = Boolean(pal.cyber);
    const WT = 0.22;
    const doorS = doorSlot();
    const doorT0 = doorS + 0.12, doorT1 = doorS + 0.88;
    const doorH = Math.round(WALL_H * 0.72);

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
      if (wall === "left") {
        fillPoly(ctx, [inner(0, 0), inner(doorT0, 0), inner(doorT0, WALL_H), inner(0, WALL_H)], mid, grout);
        fillPoly(ctx, [inner(doorT0, doorH), inner(doorT1, doorH), inner(doorT1, WALL_H), inner(doorT0, WALL_H)], mid, grout);
        fillPoly(ctx, [inner(doorT1, 0), inner(n, 0), inner(n, WALL_H), inner(doorT1, WALL_H)], mid, grout);
        fillPoly(ctx, [inner(doorT0, 0), inner(doorT1, 0), inner(doorT1, doorH), inner(doorT0, doorH)], lightsOn ? "#1a1410" : "#0c0a08", cap);
        // door frame
        fillPoly(ctx, [inner(doorT0 - 0.06, 0), inner(doorT0, 0), inner(doorT0, doorH), inner(doorT0 - 0.06, doorH)], shade(cap, 20), "#111");
        fillPoly(ctx, [inner(doorT1, 0), inner(doorT1 + 0.06, 0), inner(doorT1 + 0.06, doorH), inner(doorT1, doorH)], shade(cap, 20), "#111");
        fillPoly(ctx, [inner(doorT0 - 0.06, doorH), inner(doorT1 + 0.06, doorH), inner(doorT1 + 0.06, doorH + 4), inner(doorT0 - 0.06, doorH + 4)], shade(cap, 10), "#111");
      } else {
        fillPoly(ctx, [inner(0, 0), inner(n, 0), inner(n, WALL_H), inner(0, WALL_H)], mid, grout);
      }
      // Square wall tiles with visible grout: paint grout field, then tile faces.
      const rows = 3;
      const skirtH = 7, capH = 6;
      const usable = WALL_H - skirtH - capH;
      const rowH = usable / rows;
      const tileA = shade(base, 12);
      const tileB = shade(base, -8);
      for (let i = 0; i < n; i++) {
        for (let r = 0; r < rows; r++) {
          const u0 = skirtH + r * rowH + 0.8;
          const u1 = skirtH + (r + 1) * rowH - 0.8;
          const t0 = i + 0.06, t1 = i + 1 - 0.06;
          if (wall === "left" && t0 < doorT1 && t1 > doorT0 && u0 < doorH) continue;
          const fill = (i + r) % 2 ? tileA : tileB;
          fillPoly(ctx, [inner(t0, u0), inner(t1, u0), inner(t1, u1), inner(t0, u1)], fill, grout);
        }
      }
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

    wallPlane("left");
    wallPlane("back");
    const c0 = wallPt("back", 0, 0), c1 = wallPt("back", 0, WALL_H);
    ctx.strokeStyle = "#1a1c20";
    ctx.beginPath(); ctx.moveTo(c0.sx, c0.sy); ctx.lineTo(c1.sx, c1.sy); ctx.stroke();

    // window on reserved back slots
    const winSlots = [];
    for (let s = 0; s < n; s++) {
      const cx = s + 0.5 - n / 2;
      if (Math.abs(cx - n * 0.18) < 1.05) winSlots.push(s);
    }
    if (winSlots.length) {
      const t0 = winSlots[0] + 0.18, t1 = winSlots[winSlots.length - 1] + 0.82;
      const v0 = 28, v1 = 70;
      const pts = [wallPt("back", t0, v0), wallPt("back", t1, v0), wallPt("back", t1, v1), wallPt("back", t0, v1)];
      fillPoly(ctx, pts, "#000000", "#2a2c30");
      const mid = (t0 + t1) / 2;
      const m0 = wallPt("back", mid, v0), m1 = wallPt("back", mid, v1);
      const h0 = wallPt("back", t0, (v0 + v1) / 2), h1 = wallPt("back", t1, (v0 + v1) / 2);
      ctx.strokeStyle = "#3a3c40";
      ctx.beginPath(); ctx.moveTo(m0.sx, m0.sy); ctx.lineTo(m1.sx, m1.sy); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(h0.sx, h0.sy); ctx.lineTo(h1.sx, h1.sy); ctx.stroke();
      fillPoly(ctx, pts, null, "#2a2c30");
      // sill
      fillPoly(ctx, [wallPt("back", t0 - 0.06, v0 - 2), wallPt("back", t1 + 0.06, v0 - 2), wallPt("back", t1 + 0.06, v0 + 2), wallPt("back", t0 - 0.06, v0 + 2)], shade(cap, 18), "#111");
    }

    const sw = lightSwitchPos();
    px(ctx, sw.sx, sw.sy, sw.w, sw.h, lightsOn ? "#d8d0c4" : "#8a8478");
    ctx.strokeStyle = "#2a2c30";
    ctx.strokeRect(sw.sx + 0.5, sw.sy + 0.5, sw.w - 1, sw.h - 1);
    px(ctx, sw.sx + 2, sw.sy + 2, 4, 6, lightsOn ? "#f0e8d0" : "#555");

    for (const art of wallArt) {
      const wall = (art.wall === "z" || art.wall === "left") ? "left" : "back";
      const q = wallArtQuad(wall, art.slot);
      const typ = String(art.type || "");
      if (typ.includes("neon") || typ.includes("poster")) {
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
      const q = wallArtQuad(wall, wallGhost.slot);
      ctx.globalAlpha = 0.45;
      fillPoly(ctx, q, wallGhost.ok === false ? "#ff2b2b" : "#7ac8ff", "#fff");
      ctx.globalAlpha = 1;
    }
  }

  function render(now) {
    if (!alive) return;
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
    const kind = FLOOR_KIND[floorStyle] || "panel";
    for (let y = 0; y < gridSize; y++) {
      for (let x = 0; x < gridSize; x++) {
        const p = tileToScreen(x, y);
        const spr = floorTileSprite(kind, lightsOn, (x + y) + x * 3);
        blit(spr, p.sx - TW / 2 - 1, p.sy - 1);
        if (hoverTile && hoverTile.x === x && hoverTile.y === y) {
          drawTileShadow(ctx, x, y, "hover");
        }
        if (moveTarget && moveTarget.x === x && moveTarget.y === y) {
          drawTileShadow(ctx, x, y, "target");
        }
      }
    }
    drawFloorSlab();
    drawWalls();
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
      blit(it.spr, it.sx, it.sy, it.alpha ?? 1);
    }
    ctx.restore();
    requestAnimationFrame(render);
  }

  function hitAt(cx, cy) {
    const now = performance.now();
    const wpt = worldFromClient(cx, cy, now);
    const floor = pickFloorTile(wpt.sx, wpt.sy);
    const sw = lightSwitchPos();
    if (wpt.sx >= sw.sx && wpt.sx <= sw.sx + sw.w && wpt.sy >= sw.sy && wpt.sy <= sw.sy + sw.h) {
      return { kind: "switch", floor };
    }
    for (const art of wallArt) {
      const pos = wallSlotWorld(art.wall, art.slot);
      if (wpt.sx >= pos.sx && wpt.sx <= pos.sx + (pos.w || 22) && wpt.sy >= pos.sy && wpt.sy <= pos.sy + (pos.h || 18)) {
        return { kind: "wall", wall: pos.wall, slot: pos.slot, art, floor };
      }
    }
    const list = collectDrawList(now);
    for (let i = list.length - 1; i >= 0; i--) {
      const it = list[i];
      if (it.kind === "ghost" || it.kind === "person" || it.kind === "pet") continue;
      if (wpt.sx >= it.sx && wpt.sx <= it.sx + it.w && wpt.sy >= it.sy && wpt.sy <= it.sy + it.h) {
        if (it.kind === "furn" && it.raw && !hitFurnitureAt(it.raw, wpt.sx, wpt.sy, screenToTile)) continue;
        if (it.kind === "furn" || it.kind === "npc") {
          const interactive = typeof isFurnInteractive === "function" ? isFurnInteractive(it.type, it.raw) : true;
          if (!interactive) continue;
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

  function handleTap(ev) {
    const hit = hitAt(ev.clientX, ev.clientY);
    if (!hit) return;
    if (hit.kind === "switch") { onSwitchClick?.(); return; }
    if (hit.kind === "wall") { onWallClick?.(hit.wall, hit.slot); return; }
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
    canvas.setPointerCapture?.(e.pointerId);
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.size === 2) {
      const pts = [...pointers.values()];
      pinchStart = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
      pinchZoom0 = userZoom;
    } else {
      panStart = { x: e.clientX, y: e.clientY, camX, camY, t: performance.now() };
    }
  });
  canvas.addEventListener("pointermove", (e) => {
    if (pointers.has(e.pointerId)) pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.size === 2 && pinchStart) {
      const pts = [...pointers.values()];
      const d = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
      userZoom = snapZoom(pinchZoom0 * (d / Math.max(8, pinchStart)));
      return;
    }
    if (panStart && !isPhoneView()) {
      camX = panStart.camX - (e.clientX - panStart.x) / zoom;
      camY = panStart.camY - (e.clientY - panStart.y) / zoom;
    }
    handleHover(e);
  });
  function endPtr(e) {
    const start = panStart;
    pointers.delete(e.pointerId);
    if (pointers.size < 2) pinchStart = 0;
    if (pointers.size === 0) {
      const dt = start ? performance.now() - start.t : 0;
      const dist = start ? Math.hypot(e.clientX - start.x, e.clientY - start.y) : 0;
      panStart = null;
      if (dist < 12 && dt < 500) handleTap(e);
    }
  }
  canvas.addEventListener("pointerup", endPtr);
  canvas.addEventListener("pointercancel", endPtr);
  canvas.addEventListener("wheel", (e) => {
    if (!isPhoneView()) return;
    e.preventDefault();
    const dir = e.deltaY > 0 ? -1 : 1;
    const i = Math.max(0, Math.min(2, ZOOMS.indexOf(snapZoom(userZoom)) + dir));
    userZoom = ZOOMS[i];
    if (camMode !== "follow") setCamMode("follow");
  }, { passive: false });

  function setCamMode(mode) {
    camMode = mode === "room" ? "room" : "follow";
    if (camMode === "follow" && isPhoneView() && userZoom < 1.15) userZoom = FOLLOW_ZOOM_DEFAULT;
    applyCamera();
    return camMode;
  }

  function findFurnMesh(id) {
    const f = furniture.find((x) => x.id === id);
    if (!f) return null;
    return { userData: { ...f, type: f.type, boardSquare: 0.125, tableSize: 1.7 } };
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
      Object.assign(st, { sitting: p.sitting, usingPhone: p.usingPhone, boxing: p.boxing, actionEmote: p.actionEmote, heldItem: p.heldItem, heldProp: p.heldProp, activePet: p.activePet, avatar: p.avatar, username: p.username });
    }
    for (const k of [...personState.keys()]) if (!seen.has(k)) personState.delete(k);
    people = list.map((p) => {
      const st = personState.get(p.username);
      if (!st) return p;
      st.x = p.x;
      st.y = p.y;
      st.walking = Boolean(p.walking);
      st.dirX = p.dirX || 0;
      st.dirY = (p.dirZ ?? p.dirY) || 0;
      const facing = p.facing || { x: 1, z: 0 };
      const rx = -(facing.z || 0), ry = facing.x || 0;
      const plen = Math.hypot(rx, ry) || 1;
      const wantX = st.x + (rx / plen) * 0.45;
      const wantY = st.y + (ry / plen) * 0.45;
      st.petX = (st.petX ?? wantX) + (wantX - (st.petX ?? wantX)) * 0.2;
      st.petY = (st.petY ?? wantY) + (wantY - (st.petY ?? wantY)) * 0.2;
      return p;
    });
  }

  if (isPhoneView()) {
    camMode = "follow";
    userZoom = FOLLOW_ZOOM_DEFAULT;
  } else {
    camMode = "room";
    zoom = 1;
  }
  resize();
  requestAnimationFrame(render);

  const api = {
    ready: true,
    overlay,
    resize,
    setStyle(wp, fl) { if (wp) wallpaper = wp; if (fl) floorStyle = fl; },
    setGridSize(n) { gridSize = Math.max(4, Math.min(12, n || 6)); applyCamera(); },
    setFurniture(list) { furniture = (list || []).map((f) => ({ ...f, rot: normalizeFurnRot(f.rot) })); },
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
    fridgeOpen(id) { return Boolean(uses[id]?.open); },
    setUses(u) { uses = u || {}; },
    setChessMap(m) { chess = m || {}; },
    setTvs(m) { tvs = m || {}; },
    setWallArt(list) { wallArt = list || []; },
    setWallGhost(type, wall, slot, ok) { wallGhost = type ? { type, wall, slot, ok } : null; },
    setArcade(m) { arcade = m || {}; },
    getArcade() { return arcade; },
    setServerTime(t) { serverTime0 = t || Date.now(); serverAt = performance.now(); },
    tvProgram() { return programAt(nowServer()); },
    nowServer,
    findFurnMesh,
    getWallArt() { return wallArt.slice(); },
    petSitting(name) {
      const p = people.find((x) => x.username === name);
      const st = personState.get(name);
      if (!p?.activePet) return false;
      return st ? !st.walking : !p.walking;
    },
    bagSwinging(id) { const u = uses[id]; return Boolean(u && (u.hit || u.swing || u.move || (u.lastHitAt && (Date.now() - u.lastHitAt) < 2500))); },
    personFlags(name) {
      const p = people.find((x) => x.username === name);
      if (!p) return null;
      const st = personState.get(name) || {};
      return {
        boxing: p.boxing || st.boxing || Object.values(uses || {}).some((u) => u && u.type === "punchbag" && u.user === name), sitting: p.sitting, heldItem: p.heldItem, gym: p.gym, facing: p.sitting ? snapFacingToAxis(p.facing) : p.facing,
        actionEmote: p.actionEmote, walking: Boolean(st.walking || p.walking), usingPhone: p.usingPhone,
        sculpted: false, paperDoll: true, pixel: true,
      };
    },
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
      const x = (st?.x ?? p.x) + 0.5, y = (st?.y ?? p.y) + 0.5;
      const foot = tileToScreen(x, y);
      const c = clientFromWorld(foot.sx, foot.sy - AV_GROUND_Y + 8);
      const f = clientFromWorld(foot.sx, foot.sy);
      const rect = container.getBoundingClientRect();
      return { x: c.x - rect.left, y: c.y - rect.top, footY: f.y - rect.top, visible: c.visible };
    },
    visualZoom() { return zoom; },
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
    projectWorld(tx, ty) {
      const p = tileToScreen(tx, ty);
      return clientFromWorld(p.sx, p.sy);
    },
    onFurnitureClick(fn) { onFurnitureClick = fn; },
    onSwitchClick(fn) { onSwitchClick = fn; },
    onWallClick(fn) { onWallClick = fn; },
    onWallHover(fn) { onWallHover = fn; },
    simulateWallClick(wall, slot) { onWallClick?.(wall, slot); },
    setFollowName(name) { followName = name || null; },
    setCamMode,
    toggleCamMode() { return setCamMode(camMode === "follow" ? "room" : "follow"); },
    camState() {
      return {
        mode: isPhoneView() ? camMode : "room",
        zoom: (!isPhoneView() || camMode === "room") ? 1 : snapZoom(userZoom),
        phone: isPhoneView(),
        follow: followName,
        target: { x: camX, y: 0, z: camY },
      };
    },
    chessBoardInfo(id) {
      const m = findFurnMesh(id);
      if (!m || m.userData.type !== "chesstable") return null;
      return { square: 0.125, board: 1, table: 1.7 };
    },
    setZoom(z) {
      userZoom = snapZoom(z);
      if (isPhoneView() && camMode === "follow") zoom = userZoom;
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
    setPlacing(type) { placing = type; if (!type) ghost = null; },
    simulateTileClick(tx, ty) { onTileClick?.(tx, ty); },
    simulateFurnitureClick(id, type, extra) { onFurnitureClick?.(id, type, extra || {}); },
    simulateSwitchClick() { onSwitchClick?.(); },
    clear() {
      furniture = []; wallArt = []; arcade = {}; people = []; npcs = [];
      personState.clear(); ghost = null; wallGhost = null;
    },
    dispose() { alive = false; container.innerHTML = ""; },
  };
  window.HouseRoom3D = api;
  return api;
}

export default { createRoom3D, createAvatarPreview, paintAvatarSheet, paintStoreThumb, paintPetSheet, paintFurnitureSheet, AVATAR_SHEET_LOOKS, PET_W, PET_H, FURN_SHEET_TYPES };

