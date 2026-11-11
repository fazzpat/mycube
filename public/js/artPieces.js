/* Tile-sized pixel-art paintings for MyCube.
   Native size matches one floor-tile face in the 2D iso room:
   isoRoom.js uses TW = 64, TH = 32, so a 1-unit wall square is 32 x 32. */

import { ART_PIXELS } from "./artPixels.js";

export const FLOOR_TILE_PX = 32;
export const ART_SIZE = FLOOR_TILE_PX;
export const ART_TILE_SPAN = 1;
export const ART_WORLD_UP = FLOOR_TILE_PX;
export const ART_HANG_UP = 22;
export const ART_FRAME = 3;

export const ART_PIECES = [
  { type: "art_ocean", name: "Sunset Harbor", description: "A gold sun dropping into a dithered harbor, with a tiny sailboat on the tide.", price: 20 },
  { type: "art_peaks", name: "Snowy Peaks", description: "Snow-capped mountains and close pines standing over a white field.", price: 22 },
  { type: "art_nightwood", name: "Midnight Pines", description: "A starry night forest with a crescent moon and two firefly lights.", price: 24 },
  { type: "art_mesa", name: "Red Mesa", description: "Sunlit red buttes and a pair of cacti on warm desert sand.", price: 18 },
  { type: "art_farm", name: "Hillside Barn", description: "Rolling green hills, a red barn, and a wooden fence in the yard.", price: 20 },
  { type: "art_skyline", name: "Dusk Skyline", description: "A city of lit windows silhouetted against a purple-gold dusk.", price: 26 },
  { type: "art_blocks", name: "Color Blocks", description: "A geometric color-block study in cream, coke red, gold, navy, and teal.", price: 16 },
  { type: "art_gridsun", name: "Grid Sun", description: "A synthwave half-sun resting on a receding magenta grid.", price: 22 },
  { type: "art_swirl", name: "Tide Swirl", description: "A spiral of seafoam and deep water curling toward the center.", price: 18 },
  { type: "art_bloom", name: "Dither Bloom", description: "A Bayer-dithered magenta-to-teal bloom with a gold medallion.", price: 16 },
];

export const ART_TYPES = ART_PIECES.map((p) => p.type);
export const PAINTING_IDS = ART_TYPES.slice();

export function artByType(type) {
  return ART_PIECES.find((p) => p.type === type) || null;
}

export function isPixelArt(type) {
  return Boolean(artByType(type));
}

export const isPainting = isPixelArt;

export function artCatalogEntry(piece) {
  return { name: piece.name, price: piece.price, w: 1, h: 1, blocks: false, surface: "wall" };
}

export const PAINTING_CATALOG = Object.fromEntries(
  ART_PIECES.map((p) => [p.type, artCatalogEntry(p)]),
);

export function registerArtCatalog(houseIso) {
  if (!houseIso?.CATALOG) return;
  for (const piece of ART_PIECES) {
    houseIso.CATALOG[piece.type] = artCatalogEntry(piece);
    if (Array.isArray(houseIso.WALL_ART) && !houseIso.WALL_ART.includes(piece.type)) {
      houseIso.WALL_ART.push(piece.type);
    }
  }
}

export function paintingSrc(type) {
  return isPixelArt(type) ? `/img/art/${type}.png` : "";
}

export function paintingThumbHtml(type) {
  const item = artByType(type);
  if (!item) return "";
  return `<canvas class="furn-svg painting-thumb" width="32" height="32" data-art-thumb="${type}" style="image-rendering:pixelated;width:40px;height:40px"></canvas>`;
}

export function installPaintings(houseIso) {
  registerArtCatalog(houseIso);
  if (!houseIso) return;
  const orig = houseIso.furnitureSVG;
  if (typeof orig === "function") {
    houseIso.furnitureSVG = (type) => {
      if (isPixelArt(type)) return paintingThumbHtml(type);
      return orig(type);
    };
  }
  if (typeof document !== "undefined") {
    queueMicrotask(() => {
      document.querySelectorAll("canvas[data-art-thumb]").forEach((c) => paintArtThumb(c, c.dataset.artThumb));
    });
  }
  if (typeof window !== "undefined") {
    window.__paintingsReady = paintingsReady;
    window.__paintingCatalog = PAINTING_CATALOG;
  }
}

export function renderArtPixels(type) {
  const pixels = ART_PIXELS[type];
  if (!pixels) return { width: ART_SIZE, height: ART_SIZE, pixels: [] };
  return { width: ART_SIZE, height: ART_SIZE, pixels };
}

export function uniqueColors(type) {
  const { pixels } = renderArtPixels(type);
  return [...new Set(pixels.filter((c) => c && c !== "#00000000"))];
}

export function paintArt(ctx, type, x = 0, y = 0, scale = 1) {
  const { width, height, pixels } = renderArtPixels(type);
  const s = scale;
  ctx.imageSmoothingEnabled = false;
  for (let py = 0; py < height; py++) {
    for (let px = 0; px < width; px++) {
      const c = pixels[py * width + px];
      if (!c || c === "#00000000") continue;
      ctx.fillStyle = c;
      ctx.fillRect(x + px * s, y + py * s, s, s);
    }
  }
}

const canvasCache = new Map();

export function getArtCanvas(type, doc = (typeof document !== "undefined" ? document : null)) {
  if (canvasCache.has(type)) return canvasCache.get(type);
  if (!doc) return null;
  const c = doc.createElement("canvas");
  c.width = ART_SIZE;
  c.height = ART_SIZE;
  const ctx = c.getContext("2d");
  ctx.imageSmoothingEnabled = false;
  paintArt(ctx, type);
  canvasCache.set(type, c);
  return c;
}

export function paintArtThumb(canvas, type, scale) {
  if (!canvas) return;
  const s = scale || Math.max(1, Math.floor(Math.min(canvas.width, canvas.height) / ART_SIZE) || 2);
  const ctx = canvas.getContext("2d");
  ctx.imageSmoothingEnabled = false;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  const ox = Math.floor((canvas.width - ART_SIZE * s) / 2);
  const oy = Math.floor((canvas.height - ART_SIZE * s) / 2);
  paintArt(ctx, type, ox, oy, s);
}

export function preloadPaintings(onLoad) {
  if (typeof document === "undefined") return;
  for (const id of ART_TYPES) {
    getArtCanvas(id);
    onLoad?.(id);
  }
}

export function paintingsReady() {
  return ART_TYPES.every((id) => Boolean(ART_PIXELS[id] && ART_PIXELS[id].length === ART_SIZE * ART_SIZE));
}

function lerp(a, b, t) {
  return { sx: a.sx + (b.sx - a.sx) * t, sy: a.sy + (b.sy - a.sy) * t };
}

export function wallQuadPoint(q, u, v) {
  const top = lerp(q[3], q[2], u);
  const bot = lerp(q[0], q[1], u);
  return lerp(top, bot, v);
}

function hexToRgb(hex) {
  const n = parseInt(String(hex).replace("#", ""), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

export function drawPaintingOnWall(ctx, type, quad, opts = {}) {
  if (!quad || quad.length < 4) return;
  const alpha = opts.alpha ?? 1;
  const dim = opts.dim ?? 1;
  const { width: w, height: h, pixels } = renderArtPixels(type);
  if (!pixels.length) return;
  ctx.save();
  ctx.imageSmoothingEnabled = false;
  ctx.globalAlpha = alpha;
  const padU = 0.35 / w;
  const padV = 0.35 / h;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const hex = pixels[y * w + x];
      if (!hex || hex === "#00000000") continue;
      let [r, g, b] = hexToRgb(hex);
      if (dim < 1) {
        r = Math.round(r * dim);
        g = Math.round(g * dim);
        b = Math.round(b * dim);
      }
      const u0 = x / w - padU, u1 = (x + 1) / w + padU;
      const v0 = y / h - padV, v1 = (y + 1) / h + padV;
      const p00 = wallQuadPoint(quad, u0, v0);
      const p10 = wallQuadPoint(quad, u1, v0);
      const p11 = wallQuadPoint(quad, u1, v1);
      const p01 = wallQuadPoint(quad, u0, v1);
      ctx.beginPath();
      ctx.moveTo(p00.sx, p00.sy);
      ctx.lineTo(p10.sx, p10.sy);
      ctx.lineTo(p11.sx, p11.sy);
      ctx.lineTo(p01.sx, p01.sy);
      ctx.closePath();
      ctx.fillStyle = `rgb(${r},${g},${b})`;
      ctx.fill();
    }
  }
  ctx.restore();
}

if (typeof window !== "undefined") {
  window.ArtPieces = {
    ART_PIECES,
    ART_TYPES,
    ART_SIZE,
    FLOOR_TILE_PX,
    ART_TILE_SPAN,
    ART_WORLD_UP,
    ART_HANG_UP,
    PAINTING_CATALOG,
    isPixelArt,
    isPainting,
    artByType,
    renderArtPixels,
    paintArt,
    paintArtThumb,
    getArtCanvas,
    registerArtCatalog,
    installPaintings,
    uniqueColors,
    drawPaintingOnWall,
    preloadPaintings,
    paintingsReady,
  };
  window.__paintingsReady = paintingsReady;
  window.__paintingCatalog = PAINTING_CATALOG;
}
