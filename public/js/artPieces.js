/* Tile-sized pixel-art paintings for MyCube.
   Native size matches one floor-tile face in the 2D iso room:
   isoRoom.js uses TW = 64, TH = 32, so a 1-unit wall square is 32 x 32. */

export const FLOOR_TILE_PX = 32; // TW / 2 === TH
export const ART_SIZE = FLOOR_TILE_PX;
export const ART_TILE_SPAN = 1;
export const ART_WORLD_UP = FLOOR_TILE_PX;
export const ART_HANG_UP = 22;
export const ART_FRAME = 3;

export const ART_PIECES = [
  { type: "art_shore", name: "Golden Shore", description: "A sunset melting into the ocean, with a gold sun and a dithered tide.", price: 20 },
  { type: "art_peaks", name: "Stillwater Peaks", description: "Snow-capped mountains standing over a quiet, reflecting lake.", price: 22 },
  { type: "art_mesa", name: "Night Mesa", description: "A starry desert night with a crescent moon, dunes, and a cactus.", price: 24 },
  { type: "art_blocks", name: "Color Blocks", description: "A geometric color-block study in cream, coke red, gold, and navy.", price: 18 },
  { type: "art_tide", name: "Synth Tide", description: "A retro-synth sun sinking over a wavy neon grid.", price: 26 },
  { type: "art_splash", name: "Pixel Splash", description: "A mosaic of colorful splatters on a dark canvas.", price: 20 },
];

export const ART_TYPES = ART_PIECES.map((p) => p.type);

export function artByType(type) {
  return ART_PIECES.find((p) => p.type === type) || null;
}

export function isPixelArt(type) {
  return Boolean(artByType(type));
}

export const isPainting = isPixelArt;
export const PAINTING_IDS = ART_TYPES.slice();
export const PAINTING_CATALOG = Object.fromEntries(
  ART_PIECES.map((p) => [p.type, artCatalogEntry(p)]),
);

export function artCatalogEntry(piece) {
  return { name: piece.name, price: piece.price, w: 1, h: 1, blocks: false, surface: "wall" };
}

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
  return isPixelArt(type) ? `/art/${type}.png` : "";
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
}

const BAYER2 = [[0, 2], [3, 1]];

function makePixels() {
  const pixels = new Array(ART_SIZE * ART_SIZE).fill("#00000000");
  const set = (x, y, color) => {
    if (x < 0 || y < 0 || x >= ART_SIZE || y >= ART_SIZE || !color) return;
    pixels[y * ART_SIZE + x] = color;
  };
  const get = (x, y) => {
    if (x < 0 || y < 0 || x >= ART_SIZE || y >= ART_SIZE) return null;
    return pixels[y * ART_SIZE + x];
  };
  const fill = (x, y, w, h, color) => {
    for (let yy = y; yy < y + h; yy++) {
      for (let xx = x; xx < x + w; xx++) set(xx, yy, color);
    }
  };
  return { pixels, set, get, fill };
}

function drawFrame(buf) {
  const ink = "#2a1c10";
  const woodHi = "#c4a070";
  const wood = "#8a5a2b";
  const woodLo = "#5a3a18";
  const gold = "#d4b46a";
  const goldLo = "#a07a38";
  const s = ART_SIZE - 1;
  buf.fill(0, 0, ART_SIZE, 3, ink);
  buf.fill(0, ART_SIZE - 3, ART_SIZE, 3, ink);
  buf.fill(0, 0, 3, ART_SIZE, ink);
  buf.fill(ART_SIZE - 3, 0, 3, ART_SIZE, ink);
  for (let i = 1; i <= s - 1; i++) {
    buf.set(i, 1, woodHi);
    buf.set(1, i, woodHi);
    buf.set(i, s - 1, woodLo);
    buf.set(s - 1, i, woodLo);
  }
  buf.set(1, 1, woodHi);
  buf.set(s - 1, s - 1, woodLo);
  buf.set(1, s - 1, wood);
  buf.set(s - 1, 1, wood);
  for (let i = 2; i <= s - 2; i++) {
    buf.set(i, 2, gold);
    buf.set(2, i, gold);
    buf.set(i, s - 2, goldLo);
    buf.set(s - 2, i, goldLo);
  }
  for (let i = 4; i <= 27; i += 5) {
    buf.set(i, 1, wood);
    buf.set(1, i, wood);
  }
  buf.set(15, 1, ink);
  buf.set(16, 1, ink);
}

function inner(buf) {
  const o = ART_FRAME;
  const n = ART_SIZE - ART_FRAME * 2;
  const set = (x, y, c) => buf.set(x + o, y + o, c);
  const dither = (x, y, a, b, t) => {
    const thr = (BAYER2[y & 1][x & 1] + 0.5) / 4;
    set(x, y, t >= thr ? b : a);
  };
  const fill = (x, y, w, h, c) => {
    for (let yy = y; yy < y + h; yy++) {
      for (let xx = x; xx < x + w; xx++) set(xx, yy, c);
    }
  };
  return { set, dither, fill, n };
}

function drawShore(buf) {
  const { set, dither, n } = inner(buf);
  const sky = ["#2a1040", "#6a2048", "#c43a4a", "#e87830", "#f4c15d"];
  for (let y = 0; y < 16; y++) {
    const t = y / 15;
    const i = Math.min(sky.length - 2, Math.floor(t * (sky.length - 1)));
    const local = t * (sky.length - 1) - i;
    for (let x = 0; x < n; x++) dither(x, y, sky[i], sky[i + 1], local);
  }
  const cx = 13, cy = 13;
  for (let y = cy - 4; y <= cy + 4; y++) {
    for (let x = cx - 4; x <= cx + 4; x++) {
      const d2 = (x - cx) * (x - cx) + (y - cy) * (y - cy);
      if (d2 <= 10) set(x, y, d2 <= 5 ? "#fff4c0" : "#f4c15d");
      else if (d2 <= 14) dither(x, y, "#f4c15d", "#e87830", 0.45);
    }
  }
  for (let x = 0; x < n; x++) set(x, 16, "#9a3412");
  const water = ["#1d3557", "#23486c", "#2a5a80", "#1d3557"];
  for (let y = 17; y < n; y++) {
    const band = water[(y - 17) % water.length];
    const next = water[(y - 16) % water.length];
    for (let x = 0; x < n; x++) set(x, y, ((x + y * 3) % 7 === 0) ? next : band);
  }
  for (let y = 17; y < n; y++) {
    const spread = 3 + ((y - 17) >> 1);
    for (let x = cx - spread; x <= cx + spread; x++) {
      if (x < 0 || x >= n) continue;
      const mid = Math.abs(x - cx) < 2 && ((y + x) & 1) === 0;
      dither(x, y, "#2a5a80", mid ? "#fff4c0" : "#f4c15d", mid ? 0.8 : 0.35 + (y % 2) * 0.15);
    }
  }
  set(21, 15, "#efe6d8");
  set(21, 16, "#2a1c10");
  set(20, 16, "#efe6d8");
  set(5, 6, "#2a1c10");
  set(6, 6, "#2a1c10");
  set(4, 7, "#2a1c10");
  set(18, 5, "#2a1c10");
  set(19, 5, "#2a1c10");
}

function drawPeaks(buf) {
  const { set, dither, fill, n } = inner(buf);
  for (let y = 0; y < 17; y++) {
    const t = y / 16;
    for (let x = 0; x < n; x++) dither(x, y, "#d8eef8", "#8ec6e0", t * 0.7);
  }
  const far = [16, 15, 14, 13, 12, 11, 11, 12, 13, 14, 13, 12, 11, 10, 11, 12, 13, 14, 15, 14, 13, 14, 15, 16, 16, 16];
  for (let x = 0; x < n; x++) {
    for (let y = far[x]; y < 17; y++) set(x, y, y === far[x] ? "#6a7a8a" : "#4a5a6a");
  }
  const left = { x: 7, top: 3, half: 7 };
  for (let y = left.top; y < 17; y++) {
    const w = Math.floor(((y - left.top) / (17 - left.top)) * left.half);
    for (let x = left.x - w; x <= left.x + w; x++) {
      if (x < 0 || x >= n) continue;
      const snow = y < left.top + 4 && Math.abs(x - left.x) <= Math.max(0, 3 - (y - left.top));
      if (snow) set(x, y, (x + y) & 1 ? "#f4f8fc" : "#dce6f0");
      else set(x, y, x < left.x ? "#3d4a3a" : "#2a3a32");
    }
  }
  const right = { x: 18, top: 2, half: 8 };
  for (let y = right.top; y < 17; y++) {
    const w = Math.floor(((y - right.top) / (17 - right.top)) * right.half);
    for (let x = right.x - w; x <= right.x + w; x++) {
      if (x < 0 || x >= n) continue;
      const snow = y < right.top + 5 && Math.abs(x - right.x) <= Math.max(0, 4 - (y - right.top));
      if (snow) set(x, y, (x + y) & 1 ? "#ffffff" : "#e8eef4");
      else set(x, y, x < right.x ? "#4a5a4a" : "#2e3c34");
    }
  }
  for (const px of [2, 4, 11, 23, 24]) {
    for (let k = 0; k < 4; k++) {
      const w = k === 3 ? 0 : 2 - Math.floor(k / 2);
      const y = 14 + k;
      for (let x = px - w; x <= px + w; x++) {
        if (x >= 0 && x < n) set(x, y, k === 3 ? "#3a2410" : (x + y) & 1 ? "#2a4a32" : "#1a3224");
      }
    }
  }
  for (let y = 17; y < n; y++) {
    for (let x = 0; x < n; x++) dither(x, y, "#3a6a8a", "#5a8aaa", (y - 17) / (n - 18));
  }
  for (let y = 17; y < n; y++) {
    const srcY = 16 - (y - 17);
    if (srcY < 0) continue;
    for (let x = 0; x < n; x++) {
      if ((x + y) & 1) continue;
      const src = buf.get(x + ART_FRAME, srcY + ART_FRAME);
      if (!src || src === "#00000000") continue;
      const dim = src === "#ffffff" || src === "#f4f8fc" || src === "#e8eef4" || src === "#dce6f0" ? "#a0c0d0" : "#2a4a5a";
      set(x, y, dim);
    }
  }
  for (let x = 0; x < n; x++) set(x, 17, (x % 3 === 0) ? "#6b4a2b" : "#3a6a8a");
}

function drawMesa(buf) {
  const { set, dither, fill, n } = inner(buf);
  for (let y = 0; y < n; y++) {
    const t = Math.min(1, y / 15);
    for (let x = 0; x < n; x++) dither(x, y, "#0d1b33", "#1a2744", t * 0.85);
  }
  const stars = [
    [2, 1, "#f4e8c0"], [5, 3, "#f4e8c0"], [8, 2, "#9be7ff"], [11, 4, "#f4e8c0"],
    [14, 1, "#f4e8c0"], [17, 3, "#9be7ff"], [20, 2, "#f4e8c0"], [23, 4, "#f4e8c0"],
    [3, 6, "#f4e8c0"], [7, 7, "#f4e8c0"], [12, 6, "#9be7ff"], [16, 8, "#f4e8c0"],
    [21, 6, "#f4e8c0"], [24, 8, "#f4e8c0"], [1, 9, "#f4e8c0"], [9, 10, "#f4e8c0"],
    [19, 9, "#9be7ff"], [6, 11, "#f4e8c0"], [13, 11, "#f4e8c0"], [22, 11, "#f4e8c0"],
  ];
  for (const [x, y, c] of stars) {
    set(x, y, c);
    if (c === "#9be7ff") {
      if (x > 0) set(x - 1, y, "#3a5a80");
      if (x + 1 < n) set(x + 1, y, "#3a5a80");
      if (y > 0) set(x, y - 1, "#3a5a80");
      if (y + 1 < 16) set(x, y + 1, "#3a5a80");
    }
  }
  const mx = 20, my = 6;
  for (let y = my - 3; y <= my + 3; y++) {
    for (let x = mx - 3; x <= mx + 3; x++) {
      const d2 = (x - mx) * (x - mx) + (y - my) * (y - my);
      const cut = (x - (mx + 1)) * (x - (mx + 1)) + (y - (my - 1)) * (y - (my - 1));
      if (d2 <= 8 && cut > 5) set(x, y, d2 <= 3 ? "#fff8d8" : "#e8d48a");
    }
  }
  const duneA = [20, 19, 18, 17, 16, 16, 15, 15, 16, 16, 17, 18, 18, 17, 16, 16, 17, 18, 19, 19, 18, 17, 17, 18, 19, 20];
  const duneB = [23, 22, 21, 21, 20, 19, 19, 20, 20, 19, 18, 18, 19, 20, 21, 21, 20, 19, 19, 20, 21, 22, 22, 21, 22, 23];
  for (let x = 0; x < n; x++) {
    for (let y = duneA[x]; y < n; y++) {
      set(x, y, y === duneA[x] ? "#c4a06a" : (y < duneA[x] + 2 ? "#8a5a32" : "#6b4220"));
    }
  }
  for (let x = 0; x < n; x++) {
    for (let y = duneB[x]; y < n; y++) {
      if (y === duneB[x]) set(x, y, "#a07a48");
      else dither(x, y, "#6b4220", "#4a2e14", (y - duneB[x]) / 6);
    }
  }
  const cx = 6;
  fill(cx, 12, 2, 11, "#2a4a32");
  fill(cx - 2, 15, 2, 2, "#2a4a32");
  fill(cx - 2, 15, 1, 5, "#1a3224");
  fill(cx + 2, 16, 2, 2, "#2a4a32");
  fill(cx + 3, 16, 1, 4, "#3d6a40");
  set(cx, 12, "#3d6a40");
  set(cx + 1, 13, "#1a3224");
  set(cx, 18, "#1a3224");
  set(cx + 1, 20, "#3d6a40");
}

function drawBlocks(buf) {
  const { set, fill, n } = inner(buf);
  const cream = "#efe6d8", ink = "#2a1c16", red = "#c43a4a", gold = "#f4c15d", navy = "#2a3a6a", pale = "#f7f1e6";
  fill(0, 0, n, n, cream);
  const vbars = [0, 8, 9, 16, 17, 25];
  const hbars = [0, 6, 7, 15, 16, 21, 25];
  const panes = [
    { x: 1, y: 1, w: 7, h: 5, c: red },
    { x: 10, y: 1, w: 6, h: 5, c: pale },
    { x: 18, y: 1, w: 7, h: 5, c: navy },
    { x: 1, y: 8, w: 7, h: 7, c: pale },
    { x: 10, y: 8, w: 6, h: 7, c: gold },
    { x: 18, y: 8, w: 7, h: 7, c: red },
    { x: 1, y: 17, w: 7, h: 4, c: navy },
    { x: 10, y: 17, w: 6, h: 4, c: pale },
    { x: 18, y: 17, w: 7, h: 4, c: gold },
    { x: 1, y: 22, w: 7, h: 3, c: gold },
    { x: 10, y: 22, w: 6, h: 3, c: red },
    { x: 18, y: 22, w: 7, h: 3, c: pale },
  ];
  for (const p of panes) fill(p.x, p.y, p.w, p.h, p.c);
  for (const x of vbars) fill(x, 0, 1, n, ink);
  for (const y of hbars) fill(0, y, n, 1, ink);
}

function drawTide(buf) {
  const { set, dither, n } = inner(buf);
  const sky = ["#1a0a2a", "#2a1040", "#4a1a5a", "#7a2468", "#c43a7a", "#e87830"];
  for (let y = 0; y < 13; y++) {
    const idx = Math.min(sky.length - 2, Math.floor((y / 12) * (sky.length - 1)));
    const a = sky[idx], b = sky[idx + 1];
    for (let x = 0; x < n; x++) {
      if (y >= 10) set(x, y, y === 10 ? "#c43a7a" : y === 11 ? "#e87830" : "#f4a04a");
      else dither(x, y, a, b, 0.45);
    }
  }
  const cx = 13, cy = 12;
  for (let y = 0; y < 13; y++) {
    for (let x = 0; x < n; x++) {
      const d2 = (x - cx) * (x - cx) + (y - cy) * (y - cy);
      if (d2 <= 20) set(x, y, d2 <= 8 ? "#fff0a0" : "#f4c15d");
    }
  }
  for (const y of [9, 11]) {
    for (let x = cx - 6; x <= cx + 6; x++) {
      const d2 = (x - cx) * (x - cx) + (y - cy) * (y - cy);
      if (d2 <= 20) set(x, y, y === 9 ? "#c43a7a" : "#7a2468");
    }
  }
  for (let x = 0; x < n; x++) set(x, 13, "#f4c15d");
  for (let y = 14; y < n; y++) {
    for (let x = 0; x < n; x++) dither(x, y, "#140820", "#2a1048", 0.35);
  }
  for (const y of [14, 15, 17, 20, 24]) {
    if (y >= n) continue;
    for (let x = 0; x < n; x++) set(x, y, (x & 1) ? "#7c5cff" : "#c45cff");
  }
  for (let i = -5; i <= 5; i++) {
    if (i === 0) continue;
    const botX = cx + i * 3;
    for (let y = 14; y < n; y++) {
      const t = (y - 14) / Math.max(1, n - 15);
      const x = Math.round(cx + (botX - cx) * t);
      if (x >= 0 && x < n) set(x, y, "#7c5cff");
    }
  }
  for (let y = 14; y < n; y++) set(cx, y, "#c45cff");
}

function drawSplash(buf) {
  const { set, dither, fill, n } = inner(buf);
  fill(0, 0, n, n, "#161018");
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      if (x % 5 === 4 || y % 5 === 4) set(x, y, "#2a1c24");
    }
  }
  const tiles = [
    [0, 0, "#c43a4a"], [5, 0, "#d4684a"], [10, 0, "#6a2040"], [15, 0, "#c43a4a"], [20, 0, "#3a1a28"],
    [0, 5, "#2a3a6a"], [5, 5, "#4d7cff"], [10, 5, "#f4c15d"], [15, 5, "#2a3a6a"], [20, 5, "#20b2aa"],
    [0, 10, "#f4c15d"], [5, 10, "#c43a4a"], [10, 10, "#efe6d8"], [15, 10, "#e87830"], [20, 10, "#7c5cff"],
    [0, 15, "#20b2aa"], [5, 15, "#3ecf8e"], [10, 15, "#2a4a32"], [15, 15, "#4d7cff"], [20, 15, "#f4c15d"],
    [0, 20, "#7c5cff"], [5, 20, "#c43a7a"], [10, 20, "#c43a4a"], [15, 20, "#efe6d8"], [20, 20, "#20b2aa"],
  ];
  for (const [tx, ty, c] of tiles) {
    for (let y = ty; y < ty + 4 && y < n; y++) {
      for (let x = tx; x < tx + 4 && x < n; x++) {
        if (x % 5 === 4 || y % 5 === 4) continue;
        const edge = x === tx || y === ty || x === tx + 3 || y === ty + 3;
        if (edge) dither(x, y, c, "#161018", 0.35);
        else set(x, y, c);
      }
    }
  }
  const splats = [
    { x: 7, y: 3, r: 3, c: "#efe6d8" },
    { x: 18, y: 8, r: 3, c: "#c43a4a" },
    { x: 4, y: 14, r: 2, c: "#f4c15d" },
    { x: 13, y: 18, r: 3, c: "#4d7cff" },
    { x: 21, y: 16, r: 2, c: "#3ecf8e" },
    { x: 9, y: 21, r: 2, c: "#e87830" },
  ];
  for (const s of splats) {
    for (let y = s.y - s.r; y <= s.y + s.r; y++) {
      for (let x = s.x - s.r; x <= s.x + s.r; x++) {
        if (x < 0 || y < 0 || x >= n || y >= n) continue;
        const d2 = (x - s.x) * (x - s.x) + (y - s.y) * (y - s.y) + ((x * 3 + y * 5) % 3);
        if (d2 <= s.r * s.r - 1) set(x, y, s.c);
        else if (d2 <= s.r * s.r + 1) dither(x, y, s.c, "#161018", 0.5);
      }
    }
  }
  for (const [x, y] of [[2, 8], [12, 2], [24, 12], [16, 23], [3, 22], [22, 3]]) {
    set(x, y, "#efe6d8");
    if (y + 1 < n) set(x, y + 1, "#c4a070");
  }
}

const DRAWERS = {
  art_shore: drawShore,
  art_peaks: drawPeaks,
  art_mesa: drawMesa,
  art_blocks: drawBlocks,
  art_tide: drawTide,
  art_splash: drawSplash,
};

export function renderArtPixels(type) {
  const buf = makePixels();
  const drawer = DRAWERS[type];
  if (drawer) drawer(buf);
  else buf.fill(0, 0, ART_SIZE, ART_SIZE, "#efe6d8");
  drawFrame(buf);
  return { width: ART_SIZE, height: ART_SIZE, pixels: buf.pixels };
}

export function uniqueColors(type) {
  const { pixels } = renderArtPixels(type);
  return [...new Set(pixels.filter((c) => c && c !== "#00000000"))];
}

export function paintArt(ctx, type, x = 0, y = 0, scale = 1) {
  const { width, height, pixels } = renderArtPixels(type);
  const s = Math.max(1, scale | 0);
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

function lerp(a, b, t) {
  return { sx: a.sx + (b.sx - a.sx) * t, sy: a.sy + (b.sy - a.sy) * t };
}

/* quad order matches isoRoom wallArtQuad: [bottom-t0, bottom-t1, top-t1, top-t0]. v=0 is the top of the sprite. */
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
  };
}
