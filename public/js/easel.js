/* Easel furniture + compact custom pixel-artworks.
   Paintings are 16x16 (phone-friendly) and upscale 2x into the 32x32 wall frame. */

export const EASEL_TYPE = "easel";
export const EASEL_NAME = "Easel";
export const EASEL_PRICE = 26;
export const EASEL_GRID = 16;
export const EASEL_WALL_SIZE = 32;
export const EASEL_ART_PREFIX = "art_easel_";
export const EASEL_MAX_ARTWORKS = 24;
export const EASEL_TITLE_MAX = 24;
export const EASEL_PALETTE_MAX = 64;
export const EASEL_CANVAS_BG = "#f4efe6";
export const EASEL_FRAME = "#8b5a2b";
export const EASEL_FRAME_INK = "#3a2418";
export const EASEL_CATALOG = { name: EASEL_NAME, price: EASEL_PRICE, w: 1, h: 1, blocks: true };

/** 16 studio colors, plus a custom picker in the paint UI. */
export const EASEL_PALETTE = [
  "#1a1410", "#2a2a2e", "#6b7280", "#f4efe6",
  "#ffffff", "#c43a3a", "#ef476f", "#ff7a59",
  "#f4c15d", "#6a8a3a", "#19c37d", "#20b2aa",
  "#3d5aa0", "#6c7bff", "#8a5ad4", "#8b5a2b",
];

const HEX = /^#([0-9a-fA-F]{6})$/;

export function isEaselArt(type) {
  return typeof type === "string" && type.startsWith(EASEL_ART_PREFIX) && type.length > EASEL_ART_PREFIX.length;
}

export function easelArtId(type) {
  return isEaselArt(type) ? type.slice(EASEL_ART_PREFIX.length) : "";
}

export function easelArtType(id) {
  return EASEL_ART_PREFIX + String(id || "");
}

export function canonColor(raw) {
  const s = String(raw || "").trim();
  if (!HEX.test(s)) return null;
  return "#" + s.slice(1).toLowerCase();
}

export function emptyCells(color = EASEL_CANVAS_BG) {
  const c = canonColor(color) || EASEL_CANVAS_BG;
  return Array(EASEL_GRID * EASEL_GRID).fill(c);
}

export function cloneCells(cells) {
  return Array.isArray(cells) ? cells.slice() : emptyCells();
}

export function sanitizeTitle(raw) {
  const t = String(raw || "").replace(/\s+/g, " ").trim().slice(0, EASEL_TITLE_MAX);
  return t || "Untitled";
}

export function artworkHash(data) {
  if (!data) return "";
  if (typeof data === "string") return data.slice(0, 24);
  const cells = data.cells || data.p || "";
  const pal = Array.isArray(data.palette) ? data.palette.join() : "";
  return String(data.w || "") + "x" + String(data.h || "") + ":" + pal.length + ":" + String(cells).length + ":" + String(cells).slice(0, 18);
}

function cellsToPalette(cells) {
  const palette = [];
  const indexOf = new Map();
  const idx = [];
  for (const raw of cells) {
    const c = canonColor(raw) || EASEL_CANVAS_BG;
    let i = indexOf.get(c);
    if (i == null) {
      i = palette.length;
      palette.push(c);
      indexOf.set(c, i);
    }
    idx.push(i);
  }
  return { palette, idx };
}

function packIndices(idx) {
  if (typeof Buffer !== "undefined" && typeof Buffer.from === "function") {
    return Buffer.from(Uint8Array.from(idx)).toString("base64");
  }
  if (typeof btoa === "function") {
    let s = "";
    for (const n of idx) s += String.fromCharCode(n & 255);
    return btoa(s);
  }
  throw new Error("no base64");
}

function unpackIndices(b64, len) {
  let bytes;
  if (typeof Buffer !== "undefined" && typeof Buffer.from === "function") {
    bytes = Buffer.from(String(b64 || ""), "base64");
  } else if (typeof atob === "function") {
    const s = atob(String(b64 || ""));
    bytes = new Uint8Array(s.length);
    for (let i = 0; i < s.length; i++) bytes[i] = s.charCodeAt(i);
  } else {
    return null;
  }
  if (bytes.length !== len) return null;
  return Array.from(bytes);
}

export function encodeArtwork({ title, cells, w = EASEL_GRID, h = EASEL_GRID } = {}) {
  const ww = Number(w) || EASEL_GRID;
  const hh = Number(h) || EASEL_GRID;
  const list = Array.isArray(cells) ? cells.slice(0, ww * hh) : emptyCells();
  while (list.length < ww * hh) list.push(EASEL_CANVAS_BG);
  const { palette, idx } = cellsToPalette(list.map((c) => canonColor(c) || EASEL_CANVAS_BG));
  return {
    v: 1,
    w: ww,
    h: hh,
    title: sanitizeTitle(title),
    palette,
    cells: packIndices(idx),
  };
}

export function decodeArtwork(data) {
  if (!data || typeof data !== "object") return null;
  const w = Number(data.w);
  const h = Number(data.h);
  if (w !== EASEL_GRID || h !== EASEL_GRID) return null;
  if (!Array.isArray(data.palette) || data.palette.length < 1 || data.palette.length > EASEL_PALETTE_MAX) return null;
  const palette = data.palette.map((c) => canonColor(c));
  if (palette.some((c) => !c)) return null;
  const idx = unpackIndices(data.cells, w * h);
  if (!idx) return null;
  const cells = idx.map((i) => palette[i] || EASEL_CANVAS_BG);
  return { w, h, title: sanitizeTitle(data.title), palette, cells };
}

export function validateArtwork(raw, { count = 0 } = {}) {
  if (count >= EASEL_MAX_ARTWORKS) {
    return { ok: false, error: "You already have " + EASEL_MAX_ARTWORKS + " paintings. Take one off the wall or keep it in your inventory first." };
  }
  const decoded = decodeArtwork(typeof raw === "object" && raw.cells && raw.palette ? raw : encodeArtwork(raw || {}));
  if (!decoded) return { ok: false, error: "That painting could not be saved." };
  if (decoded.cells.length !== EASEL_GRID * EASEL_GRID) return { ok: false, error: "Paintings must be " + EASEL_GRID + "×" + EASEL_GRID + "." };
  const data = encodeArtwork(decoded);
  if (data.palette.length > EASEL_PALETTE_MAX) return { ok: false, error: "Too many unique colors." };
  return { ok: true, artwork: { title: data.title, data } };
}

/** Upscale 16x16 cells to a 32x32 framed picture for the wall. */
export function wallPixelsFromArtwork(art) {
  const decoded = art?.cells && !art.palette ? { w: art.w || EASEL_GRID, h: art.h || EASEL_GRID, cells: art.cells }
    : decodeArtwork(art?.data || art);
  const src = decoded?.cells || emptyCells();
  const sw = decoded?.w || EASEL_GRID;
  const sh = decoded?.h || EASEL_GRID;
  const size = EASEL_WALL_SIZE;
  const frame = 2;
  const inner = size - frame * 2;
  const out = Array(size * size).fill(EASEL_FRAME_INK);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const edge = x === 0 || y === 0 || x === size - 1 || y === size - 1;
      const innerEdge = x < frame || y < frame || x >= size - frame || y >= size - frame;
      if (edge) {
        out[y * size + x] = EASEL_FRAME_INK;
      } else if (innerEdge) {
        out[y * size + x] = EASEL_FRAME;
      } else {
        const sx = Math.min(sw - 1, Math.floor(((x - frame) / inner) * sw));
        const sy = Math.min(sh - 1, Math.floor(((y - frame) / inner) * sh));
        out[y * size + x] = src[sy * sw + sx] || EASEL_CANVAS_BG;
      }
    }
  }
  return { width: size, height: size, pixels: out };
}

export function paintCells(ctx, cells, w, h, x = 0, y = 0, scale = 1) {
  if (!ctx) return;
  ctx.imageSmoothingEnabled = false;
  const list = cells || emptyCells();
  for (let py = 0; py < h; py++) {
    for (let px = 0; px < w; px++) {
      const c = list[py * w + px];
      if (!c) continue;
      ctx.fillStyle = c;
      ctx.fillRect(x + px * scale, y + py * scale, scale, scale);
    }
  }
}

export function paintArtworkThumb(canvas, art, scale) {
  if (!canvas) return;
  const wall = wallPixelsFromArtwork(art);
  const s = scale || Math.max(1, Math.floor(Math.min(canvas.width, canvas.height) / wall.width) || 2);
  const ctx = canvas.getContext("2d");
  ctx.imageSmoothingEnabled = false;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  const ox = Math.floor((canvas.width - wall.width * s) / 2);
  const oy = Math.floor((canvas.height - wall.height * s) / 2);
  paintCells(ctx, wall.pixels, wall.width, wall.height, ox, oy, s);
}

export function artworkThumbHtml(type, title = "") {
  const label = escapeHtml(title || "Painting");
  return `<canvas class="furn-svg painting-thumb" width="32" height="32" data-easel-thumb="${escapeHtml(type)}" data-easel-title="${label}" style="image-rendering:pixelated;width:40px;height:40px"></canvas>`;
}

function escapeHtml(s) {
  return String(s || "").replace(/[&<>"']/g, (ch) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  }[ch]));
}

export function easelThumbSvg() {
  const ink = "#2a1810";
  return `<svg class="furn-svg" width="56" height="80" viewBox="0 0 56 80" aria-hidden="true">
    <ellipse cx="28" cy="74" rx="16" ry="4" fill="#2a1810" opacity=".18"/>
    <path d="M18 70 L24 22 L28 18 L32 22 L38 70" fill="none" stroke="${ink}" stroke-width="3" stroke-linejoin="round"/>
    <path d="M28 22 L28 70" stroke="#6b4228" stroke-width="2"/>
    <rect x="14" y="24" width="28" height="28" fill="#c4a06a" stroke="${ink}" stroke-width="2"/>
    <rect x="17" y="27" width="22" height="22" fill="#f4efe6" stroke="${ink}" stroke-width="1"/>
    <rect x="20" y="32" width="8" height="6" fill="#c43a3a"/>
    <rect x="30" y="36" width="6" height="8" fill="#3d5aa0"/>
    <rect x="16" y="52" width="24" height="4" fill="#8b5a2b" stroke="${ink}" stroke-width="1.5"/>
  </svg>`;
}

export function floodFill(cells, w, h, x, y, color) {
  const next = cloneCells(cells);
  const target = next[y * w + x];
  const fill = canonColor(color) || EASEL_CANVAS_BG;
  if (target === fill) return next;
  const stack = [[x, y]];
  while (stack.length) {
    const [cx, cy] = stack.pop();
    if (cx < 0 || cy < 0 || cx >= w || cy >= h) continue;
    const i = cy * w + cx;
    if (next[i] !== target) continue;
    next[i] = fill;
    stack.push([cx + 1, cy], [cx - 1, cy], [cx, cy + 1], [cx, cy - 1]);
  }
  return next;
}

export function publicArtwork(art) {
  if (!art) return null;
  const type = art.type || easelArtType(art.id);
  const data = art.data || art;
  const decoded = decodeArtwork(data);
  if (!decoded && !data?.cells) return null;
  return {
    id: art.id || easelArtId(type),
    type,
    title: sanitizeTitle(art.title || decoded?.title),
    data: decoded ? encodeArtwork(decoded) : data,
  };
}

export function registerEaselCatalog(houseIso) {
  if (!houseIso?.CATALOG) return;
  houseIso.CATALOG[EASEL_TYPE] = { ...EASEL_CATALOG };
}

export default {
  EASEL_TYPE, EASEL_NAME, EASEL_PRICE, EASEL_GRID, EASEL_WALL_SIZE, EASEL_ART_PREFIX,
  EASEL_MAX_ARTWORKS, EASEL_TITLE_MAX, EASEL_PALETTE, EASEL_CATALOG, EASEL_CANVAS_BG,
  isEaselArt, easelArtId, easelArtType, canonColor, emptyCells, cloneCells, sanitizeTitle,
  encodeArtwork, decodeArtwork, validateArtwork, wallPixelsFromArtwork, paintCells,
  paintArtworkThumb, artworkThumbHtml, easelThumbSvg, floodFill, publicArtwork,
  registerEaselCatalog, artworkHash,
};
