/* Held snack and drink sprites, drawn as an overlay on the avatar's hand.
   Avatar body / face / walk-cycle drawing stays in avatar3d.js. */
export const HELD_KINDS = ["pizza", "soda", "chicken", "water", "coffee"];
export const FRIDGE_ITEMS = [
  { id: "pizza", name: "Pizza", sub: "slice" },
  { id: "soda", name: "Soda", sub: "can" },
  { id: "chicken", name: "Chicken", sub: "leg" },
  { id: "water", name: "Water", sub: "bottle" },
];
export const HELD_LABELS = {
  pizza: "pizza slice",
  soda: "soda",
  chicken: "chicken leg",
  water: "water bottle",
  coffee: "coffee",
};
export const DRINK_KINDS = ["soda", "water", "coffee", "drink", "mug"];
export const SIP_MS = 1000;

export function heldKindOf(held) {
  if (!held) return null;
  const k = typeof held === "string" ? held : held.kind;
  if (k === "sandwich") return "pizza";
  if (k === "mug") return "coffee";
  if (k === "drink") return "soda";
  if (HELD_KINDS.includes(k)) return k;
  return null;
}

export function isDrink(kind) {
  const k = heldKindOf(kind) || (typeof kind === "string" ? kind : kind?.kind);
  return DRINK_KINDS.includes(k) || DRINK_KINDS.includes(heldKindOf(k));
}

export function heldItemLabel(kind) {
  const k = heldKindOf(kind);
  return HELD_LABELS[k] || k || "item";
}

export function hash32(s) {
  let h = 2166136261;
  const str = String(s);
  for (let i = 0; i < str.length; i++) h = Math.imul(h ^ str.charCodeAt(i), 16777619);
  return h >>> 0;
}

function nextRand(s) {
  return Math.imul(s ^ (s >>> 16), 0x7feb352d) >>> 0;
}

/** Deterministic sip windows: first sip 6–10s after grab, then every 6–10s, each ~1s. */
export function sipAnim(held, username, now, { walking = false } = {}) {
  const kind = heldKindOf(held);
  if (!kind || !isDrink(kind) || walking) return { active: false, t: 0, lift: 0, face: false };
  const startedAt = typeof held === "object" ? Number(held.startedAt) || 0 : 0;
  if (!startedAt) return { active: false, t: 0, lift: 0, face: false };
  const elapsed = now - startedAt;
  if (elapsed < 0) return { active: false, t: 0, lift: 0, face: false };
  let s = hash32(startedAt + "|" + (username || "") + "|" + kind);
  let t0 = 0;
  const limit = Math.min(elapsed + 1, 180000);
  while (t0 <= limit) {
    s = nextRand(s);
    t0 += 6000 + (s % 4001);
    if (elapsed >= t0 && elapsed < t0 + SIP_MS) {
      const t = (elapsed - t0) / SIP_MS;
      const lift = sipLift(t);
      return { active: true, t, lift, face: lift >= 0.55 };
    }
    if (t0 > elapsed) break;
  }
  return { active: false, t: 0, lift: 0, face: false };
}

export function sipLift(t) {
  if (t < 0.22) return t / 0.22;
  if (t < 0.78) return 1;
  return Math.max(0, (1 - t) / 0.22);
}

export function steamFrameAt(now = Date.now()) {
  return Math.floor(now / 160) % 6;
}

const ITEM_W = 24;
const ITEM_H = 28;
const cache = new Map();

function makeCanvas(w, h) {
  if (typeof document === "undefined") return null;
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  return c;
}

function px(ctx, x, y, color, w = 1, h = 1) {
  if (!color) return;
  ctx.fillStyle = color;
  ctx.fillRect(x | 0, y | 0, w, h);
}

function plot(grid, x, y, color) {
  if (x < 0 || y < 0 || x >= ITEM_W || y >= ITEM_H) return;
  grid[y * ITEM_W + x] = color;
}

function fill(grid, x0, y0, x1, y1, color) {
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) plot(grid, x, y, color);
}

function outline(grid, ink) {
  const out = grid.slice();
  for (let y = 0; y < ITEM_H; y++) {
    for (let x = 0; x < ITEM_W; x++) {
      if (grid[y * ITEM_W + x]) continue;
      let n = false;
      for (let dy = -1; dy <= 1 && !n; dy++) {
        for (let dx = -1; dx <= 1 && !n; dx++) {
          if (!dx && !dy) continue;
          const nx = x + dx, ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= ITEM_W || ny >= ITEM_H) continue;
          if (grid[ny * ITEM_W + nx]) n = true;
        }
      }
      if (n) out[y * ITEM_W + x] = ink;
    }
  }
  return out;
}

function blitGrid(ctx, grid, ox, oy) {
  for (let y = 0; y < ITEM_H; y++) {
    for (let x = 0; x < ITEM_W; x++) {
      const c = grid[y * ITEM_W + x];
      if (c) px(ctx, ox + x, oy + y, c);
    }
  }
}

function drawPizza(grid) {
  const crust = "#c4893a";
  const crustDk = "#8a5a22";
  const cheese = "#f0d24a";
  const cheeseLt = "#fff0a0";
  const pep = "#c43a32";
  const pepDk = "#8a2018";
  const basil = "#3a8a3a";
  // Floppy slice held by the crust: tip droops down-right, away from the face
  // (flip mirrors it to the other side). Never points up into the head.
  for (let y = 8; y <= 21; y++) {
    const t = (y - 8) / 13;
    const cx = 12 + Math.round(t * t * 8);
    const half = Math.max(1, Math.round(5.2 * (1 - t) + 0.6));
    const isCrust = y <= 10;
    for (let x = cx - half; x <= cx + half; x++) {
      if (isCrust) plot(grid, x, y, y === 8 ? crustDk : crust);
      else plot(grid, x, y, (x + y) % 5 === 0 ? cheeseLt : cheese);
    }
    if (isCrust) {
      plot(grid, cx - half - 1, y, crustDk);
      plot(grid, cx + half + 1, y, crust);
    }
  }
  const peps = [[13, 12], [16, 15], [14, 17], [18, 18]];
  for (const [cx, cy] of peps) {
    plot(grid, cx, cy, pep);
    plot(grid, cx + 1, cy, pep);
    plot(grid, cx, cy + 1, pepDk);
  }
  plot(grid, 15, 13, basil);
  plot(grid, 17, 16, basil);
}

const SODA_GLYPH = {
  C: ["###", "#..", "###"],
  U: ["#.#", "#.#", "###"],
  B: ["##.", "###", "##."],
  E: ["###", "##.", "###"],
  S: [".##", "#.#", "##."],
  O: ["###", "#.#", "###"],
  D: ["##.", "#.#", "##."],
  A: [".#.", "###", "#.#"],
};

function plotGlyph(grid, ch, x, y, color) {
  const g = SODA_GLYPH[ch];
  if (!g) return;
  for (let row = 0; row < g.length; row++) {
    for (let col = 0; col < g[row].length; col++) {
      if (g[row][col] === "#") plot(grid, x + col, y + row, color);
    }
  }
}

function drawSoda(grid) {
  const red = "#c4282a";
  const redDk = "#8a1818";
  const redLt = "#e85050";
  const silver = "#d0d4d8";
  const silverDk = "#8a8e94";
  const silverLt = "#f4f6f8";
  const hole = "#1a1410";
  const holeRim = "#3a3230";
  const label = "#fff4e8";
  const ink = "#2a1c14";
  const cube = "#f0d24a";
  const cubeDk = "#c4a050";
  // Stout open can: wide enough for a CUBE SODA wordmark, still shy of head width.
  // Body x=5..18, lid above, pull tab on top.
  // Pull tab (ring + stem) above the lid, over the rivet.
  plot(grid, 13, 3, silver);
  plot(grid, 14, 3, silverLt);
  plot(grid, 12, 4, silver);
  plot(grid, 15, 4, silver);
  plot(grid, 13, 5, silverLt);
  plot(grid, 14, 5, silver);
  plot(grid, 13, 6, silverDk);
  plot(grid, 14, 6, silver);
  // Silver lid ellipse with a dark drink opening and a rivet.
  fill(grid, 6, 7, 17, 9, silver);
  fill(grid, 7, 6, 16, 6, silver);
  fill(grid, 8, 5, 11, 5, silverDk);
  fill(grid, 6, 7, 6, 9, silverDk);
  fill(grid, 17, 7, 17, 9, silverLt);
  fill(grid, 7, 7, 11, 8, hole);
  fill(grid, 7, 7, 11, 7, holeRim);
  plot(grid, 13, 7, silverDk);
  plot(grid, 14, 7, silverLt);
  plot(grid, 13, 8, silver);
  // Tiny cube logo on the lid, next to the opening.
  plot(grid, 15, 8, cube);
  plot(grid, 16, 8, cubeDk);
  plot(grid, 15, 9, cubeDk);
  // Red body — leave a band below the label for the cupping hand.
  fill(grid, 5, 10, 18, 24, red);
  fill(grid, 5, 10, 5, 24, redDk);
  fill(grid, 18, 10, 18, 24, redLt);
  fill(grid, 6, 25, 17, 25, silver);
  fill(grid, 7, 26, 16, 26, silverDk);
  // Dark-red label, cream letters: CUBE then SODA, both stacked so they stay legible.
  const badge = "#6a1018";
  fill(grid, 6, 11, 17, 23, badge);
  plotGlyph(grid, "C", 7, 11, label);
  plotGlyph(grid, "U", 11, 11, label);
  plotGlyph(grid, "B", 7, 14, label);
  plotGlyph(grid, "E", 11, 14, label);
  plotGlyph(grid, "S", 7, 18, label);
  plotGlyph(grid, "O", 11, 18, label);
  plotGlyph(grid, "D", 7, 21, label);
  plotGlyph(grid, "A", 11, 21, label);
}

function drawChicken(grid) {
  const bone = "#f0e0c0";
  const boneDk = "#c4b090";
  const meat = "#c47832";
  const meatLt = "#e8a050";
  const meatDk = "#8a4a1c";
  const skin = "#d49040";
  // Bone handle at top-right
  fill(grid, 15, 4, 18, 5, bone);
  fill(grid, 16, 3, 19, 4, bone);
  plot(grid, 19, 5, boneDk);
  plot(grid, 15, 3, boneDk);
  fill(grid, 14, 6, 17, 8, bone);
  // Meat body
  fill(grid, 6, 9, 16, 18, meat);
  fill(grid, 7, 8, 15, 8, meat);
  fill(grid, 8, 19, 14, 19, meat);
  fill(grid, 5, 11, 5, 16, meatDk);
  fill(grid, 7, 10, 12, 12, meatLt);
  fill(grid, 8, 14, 11, 14, meatDk);
  fill(grid, 9, 16, 12, 16, meatDk);
  plot(grid, 13, 11, skin);
  plot(grid, 14, 13, skin);
}

function drawWater(grid) {
  const cap = "#2a6aa8";
  const capLt = "#4a8ac8";
  const bot = "#7ec8e8";
  const botDk = "#3a8ab0";
  const water = "#c8eef8";
  const hi = "#f4fffe";
  const ring = "#d8e8f0";
  // Compact bottle: ~5px body, ~13px tall with cap.
  fill(grid, 11, 6, 13, 7, cap);
  fill(grid, 11, 6, 13, 6, capLt);
  fill(grid, 10, 8, 14, 8, ring);
  fill(grid, 10, 9, 14, 18, bot);
  fill(grid, 10, 9, 10, 18, botDk);
  fill(grid, 11, 10, 13, 16, water);
  fill(grid, 11, 9, 11, 17, hi);
  fill(grid, 10, 19, 14, 19, botDk);
}

function drawCoffee(grid, steamFrame, lights) {
  const mug = "#f4eee0";
  const mugDk = "#d4c8b4";
  const mugSh = "#b8a890";
  const coffee = "#4a2814";
  const coffeeLt = "#6a4030";
  const handle = "#e8e0d0";
  const handleDk = "#a89880";
  // Compact mug: ~7px cup plus a 2px handle, shorter than the head.
  fill(grid, 8, 13, 14, 19, mug);
  fill(grid, 9, 12, 13, 12, mug);
  fill(grid, 8, 13, 8, 19, mugDk);
  fill(grid, 9, 19, 13, 20, mugSh);
  fill(grid, 9, 13, 13, 14, coffee);
  fill(grid, 9, 13, 11, 13, coffeeLt);
  fill(grid, 15, 14, 16, 14, handle);
  fill(grid, 16, 15, 17, 17, handle);
  fill(grid, 15, 18, 16, 18, handle);
  plot(grid, 17, 15, handleDk);
  plot(grid, 17, 17, handleDk);
  // Steam wisps
  const cols = lights ? ["#ffffff", "#f0ece4", "#d8d0c4"] : ["#c8c4bc", "#a8a49c", "#888480"];
  const wisps = [
    { x: 9, y: 11, delay: 0 },
    { x: 11, y: 11, delay: 2 },
    { x: 13, y: 10, delay: 4 },
  ];
  const frame = ((steamFrame % 6) + 6) % 6;
  for (let i = 0; i < wisps.length; i++) {
    const wisp = wisps[i];
    const phase = (frame + wisp.delay) % 6;
    const x = wisp.x + ((phase % 2) ? 1 : 0) - (phase > 3 ? 1 : 0);
    const y = wisp.y - phase;
    const aCol = cols[Math.min(cols.length - 1, Math.floor(phase / 2))];
    if (phase < 5) {
      plot(grid, x, y, aCol);
      if (phase < 3) plot(grid, x + 1, y - 1, aCol);
      if (phase === 0 || phase === 1) plot(grid, x - 1, y, cols[0]);
    }
  }
}

function paintItem(kind, steamFrame, lights) {
  const grid = new Array(ITEM_W * ITEM_H).fill(null);
  if (kind === "pizza") drawPizza(grid);
  else if (kind === "soda") drawSoda(grid);
  else if (kind === "chicken") drawChicken(grid);
  else if (kind === "water") drawWater(grid);
  else if (kind === "coffee") drawCoffee(grid, steamFrame, lights);
  return outline(grid, "#2a1c14");
}

const GRIP = {
  pizza: { x: 13, y: 10 },
  soda: { x: 12, y: 24 },
  chicken: { x: 16, y: 8 },
  water: { x: 12, y: 16 },
  coffee: { x: 11, y: 17 },
};
// Rim / lip of drinks, so a sip lifts the opening to the mouth instead of the grip.
const LIP = {
  soda: { x: 9, y: 7 },
  water: { x: 12, y: 7 },
  coffee: { x: 11, y: 12 },
};

const DEFAULT_SKIN = "#f0c9a8";

function toHex(c) {
  if (!c) return DEFAULT_SKIN;
  if (typeof c === "string") {
    if (c.charAt(0) === "#" && (c.length === 7 || c.length === 4)) {
      if (c.length === 4) return "#" + c[1] + c[1] + c[2] + c[2] + c[3] + c[3];
      return c;
    }
    const m = c.match(/(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/);
    if (m) {
      const h = (v) => Number(v).toString(16).padStart(2, "0");
      return "#" + h(m[1]) + h(m[2]) + h(m[3]);
    }
    return DEFAULT_SKIN;
  }
  if (c.r != null) {
    const h = (v) => Math.max(0, Math.min(255, v | 0)).toString(16).padStart(2, "0");
    return "#" + h(c.r) + h(c.g) + h(c.b);
  }
  return DEFAULT_SKIN;
}

function shadeHex(hex, amt) {
  const n = parseInt(String(hex).replace("#", ""), 16);
  const c = (v) => Math.max(0, Math.min(255, v + amt));
  const r = c((n >> 16) & 255), g = c((n >> 8) & 255), b = c(n & 255);
  return "#" + ((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1);
}

function plotIfEmpty(grid, x, y, color) {
  if (x < 0 || y < 0 || x >= ITEM_W || y >= ITEM_H) return;
  if (grid[y * ITEM_W + x]) return;
  grid[y * ITEM_W + x] = color;
}

/** A few skin-tone pixels wrapping the front of the item, matching the holder. */
function drawCuppingHand(grid, kind, skin) {
  const mid = toHex(skin);
  const dk = shadeHex(mid, -28);
  const ink = "#2a1c14";
  const g = GRIP[kind] || { x: 12, y: 16 };
  const gx = g.x, gy = g.y;
  const finger = (x, y, col) => plot(grid, x, y, col);
  // Outline even when it sits on the item, so pale fingers read on light sprites.
  const edge = (x, y) => plot(grid, x, y, ink);
  const edgeEmpty = (x, y) => plotIfEmpty(grid, x, y, ink);
  if (kind === "pizza") {
    // Fingers pinch the crust at the top of the floppy slice.
    for (const [x, y, col] of [
      [gx - 2, gy, mid], [gx - 1, gy, mid], [gx + 1, gy, mid], [gx + 2, gy, mid],
      [gx - 2, gy + 1, dk], [gx - 1, gy + 1, mid], [gx + 1, gy + 1, dk], [gx + 2, gy + 1, mid],
      [gx - 3, gy - 1, mid], [gx - 2, gy - 1, mid], [gx - 3, gy, dk],
    ]) finger(x, y, col);
    for (const [x, y] of [[gx - 2, gy - 1], [gx - 1, gy - 1], [gx + 1, gy - 1], [gx + 2, gy - 1], [gx + 3, gy], [gx - 3, gy - 2], [gx - 2, gy - 2], [gx - 4, gy - 1]]) edge(x, y);
    return;
  }
  if (kind === "chicken") {
    // Fingers around the bone handle.
    for (const [x, y, col] of [
      [gx - 1, gy, mid], [gx, gy, mid], [gx + 1, gy, mid],
      [gx - 1, gy + 1, dk], [gx, gy + 1, mid], [gx + 1, gy + 1, dk],
      [gx - 2, gy - 1, mid], [gx - 2, gy, dk],
    ]) finger(x, y, col);
    for (const [x, y] of [[gx - 1, gy - 1], [gx, gy - 1], [gx + 1, gy - 1], [gx + 2, gy], [gx - 3, gy - 1], [gx - 2, gy - 2], [gx + 2, gy + 1]]) edge(x, y);
    return;
  }
  // Cylindrical drinks: two distinct fingers across the front, thumb on the left.
  for (const [x, y, col] of [
    [gx - 1, gy, mid], [gx, gy, mid], [gx + 1, gy, mid], [gx + 2, gy, mid],
    [gx - 1, gy + 1, dk], [gx, gy + 1, mid], [gx + 1, gy + 1, dk], [gx + 2, gy + 1, mid],
    [gx - 3, gy - 2, mid], [gx - 2, gy - 2, mid],
    [gx - 3, gy - 1, mid], [gx - 2, gy - 1, dk],
    [gx - 3, gy, dk],
  ]) finger(x, y, col);
  for (const [x, y] of [[gx - 1, gy - 1], [gx, gy - 1], [gx + 1, gy - 1], [gx + 2, gy - 1], [gx + 3, gy], [gx + 3, gy + 1]]) edge(x, y);
  for (const [x, y] of [[gx - 3, gy - 3], [gx - 2, gy - 3], [gx - 4, gy - 2], [gx - 4, gy - 1], [gx - 4, gy]]) edgeEmpty(x, y);
}

function gridBBox(grid) {
  let x0 = ITEM_W, y0 = ITEM_H, x1 = -1, y1 = -1;
  for (let y = 0; y < ITEM_H; y++) {
    for (let x = 0; x < ITEM_W; x++) {
      if (!grid[y * ITEM_W + x]) continue;
      if (x < x0) x0 = x;
      if (y < y0) y0 = y;
      if (x > x1) x1 = x;
      if (y > y1) y1 = y;
    }
  }
  if (x1 < 0) return { x: 0, y: 0, w: 0, h: 0 };
  return { x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1 };
}

/** Content box of the item itself (no cupping hand). Useful for tests and thumbs. */
export function heldItemContentBox(kind, opts = {}) {
  const k = heldKindOf(kind) || kind;
  if (!HELD_KINDS.includes(k)) return { x: 0, y: 0, w: 0, h: 0 };
  const grid = paintItem(k, opts.steamFrame ?? 0, opts.lights !== false);
  return gridBBox(grid);
}

export function drawHeldItemSprite(kind, opts = {}) {
  const k = heldKindOf(kind) || kind;
  if (!HELD_KINDS.includes(k)) return null;
  const flip = Boolean(opts.flip);
  const lights = opts.lights !== false;
  const withHand = opts.hand !== false;
  const skin = toHex(opts.skin);
  const steamFrame = k === "coffee" ? ((opts.steamFrame ?? 0) % 6) : 0;
  const key = k + ":" + (flip ? 1 : 0) + ":" + steamFrame + ":" + (lights ? 1 : 0) + ":" + (withHand ? skin : "nohand");
  const hit = cache.get(key);
  if (hit) return hit;
  const c = makeCanvas(ITEM_W, ITEM_H);
  const grip = { ...GRIP[k] };
  const lip = { ...(LIP[k] || GRIP[k]) };
  const grid = paintItem(k, steamFrame, lights);
  if (withHand) drawCuppingHand(grid, k, skin);
  let out = grid;
  if (flip) {
    out = new Array(ITEM_W * ITEM_H).fill(null);
    for (let y = 0; y < ITEM_H; y++) {
      for (let x = 0; x < ITEM_W; x++) out[y * ITEM_W + (ITEM_W - 1 - x)] = grid[y * ITEM_W + x];
    }
    grip.x = ITEM_W - 1 - grip.x;
    lip.x = ITEM_W - 1 - lip.x;
  }
  const box = gridBBox(out);
  const sig = hash32(out.map((p) => p || "").join(","));
  if (!c) {
    const spr = { c: null, w: ITEM_W, h: ITEM_H, gx: grip.x, gy: grip.y, lx: lip.x, ly: lip.y, kind: k, box, skin, sig };
    cache.set(key, spr);
    return spr;
  }
  const ctx = c.getContext("2d");
  ctx.imageSmoothingEnabled = false;
  blitGrid(ctx, out, 0, 0);
  const spr = { c, w: ITEM_W, h: ITEM_H, gx: grip.x, gy: grip.y, lx: lip.x, ly: lip.y, kind: k, box, skin, sig };
  cache.set(key, spr);
  return spr;
}

const HAPPY_LID = [
  [-3, 1], [-2, 0], [-1, -1], [0, -1], [1, -1], [2, 0], [3, 1],
  [-3, 2], [-2, 1], [-1, 0], [0, 0], [1, 0], [2, 1], [3, 2],
];
const SIP_MOUTH = [
  [0, -1], [2, -1],
  [-1, 0], [1, 0], [3, 0],
  [0, 1], [1, 1], [2, 1],
];

function cssRgb(c) {
  if (!c) return "rgb(232,180,140)";
  if (typeof c === "string") return c;
  return "rgb(" + (c.r | 0) + "," + (c.g | 0) + "," + (c.b | 0) + ")";
}

/** Overlay canvas (same size as the avatar sprite) with closed ^ ^ eyes and a cute sip mouth. */
export function drawSipFaceOverlay(face) {
  if (!face || !face.visible || !face.eyes || !face.eyes.length) return null;
  const w = face.w || 72;
  const h = face.h || 72;
  const c = makeCanvas(w, h);
  if (!c) return { c: null, w, h };
  const ctx = c.getContext("2d");
  ctx.imageSmoothingEnabled = false;
  const skin = cssRgb(face.skin);
  const ink = "#160e0c";
  for (const eye of face.eyes) {
    const ex = Math.round(eye.x);
    const ey = Math.round(eye.y);
    px(ctx, ex - 3, ey - 3, skin, 7, 8);
    for (const [dx, dy] of HAPPY_LID) px(ctx, ex + dx, ey + dy, ink);
  }
  if (face.mouth) {
    const mx = Math.round(face.mouth.x);
    const my = Math.round(face.mouth.y);
    px(ctx, mx - 3, my - 2, skin, 8, 5);
    for (const [dx, dy] of SIP_MOUTH) px(ctx, mx + dx - 1, my + dy, ink);
  }
  return { c, w, h };
}

/** Cropped item canvas (no cupping hand) for fridge shelves and thumbs. */
export function heldItemStamp(kind, opts = {}) {
  const spr = drawHeldItemSprite(kind, { ...opts, hand: false });
  if (!spr) return null;
  const box = spr.box && spr.box.w ? spr.box : { x: 0, y: 0, w: spr.w, h: spr.h };
  if (!spr.c || typeof document === "undefined") return { ...spr, box };
  const c = document.createElement("canvas");
  c.width = box.w;
  c.height = box.h;
  const ctx = c.getContext("2d");
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(spr.c, box.x, box.y, box.w, box.h, 0, 0, box.w, box.h);
  return { c, w: box.w, h: box.h, box, kind: spr.kind };
}

export function paintFridgeThumbs(root = typeof document !== "undefined" ? document : null) {
  if (!root) return;
  const thumbs = root.querySelectorAll ? root.querySelectorAll("[data-fridge-thumb]") : [];
  thumbs.forEach((canvas) => {
    const kind = canvas.getAttribute("data-fridge-thumb");
    const spr = drawHeldItemSprite(kind, { lights: true, steamFrame: 2, hand: false });
    if (!spr || !spr.c) return;
    const w = canvas.width || 40;
    const h = canvas.height || 40;
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    ctx.imageSmoothingEnabled = false;
    ctx.clearRect(0, 0, w, h);
    const box = spr.box && spr.box.w ? spr.box : { x: 0, y: 0, w: spr.w, h: spr.h };
    const pad = 1;
    const sx = Math.max(0, box.x - pad), sy = Math.max(0, box.y - pad);
    const sw = Math.min(spr.w - sx, box.w + pad * 2), sh = Math.min(spr.h - sy, box.h + pad * 2);
    const scale = Math.max(1, Math.floor(Math.min(w / sw, h / sh) * 0.9));
    const dw = sw * scale, dh = sh * scale;
    ctx.drawImage(spr.c, sx, sy, sw, sh, ((w - dw) / 2) | 0, ((h - dh) / 2) | 0, dw, dh);
  });
}

if (typeof window !== "undefined") {
  window.__drawHeldItemSprite = drawHeldItemSprite;
  window.__heldItemStamp = heldItemStamp;
  window.__sipAnim = sipAnim;
  window.__drawSipFaceOverlay = drawSipFaceOverlay;
  window.__paintFridgeThumbs = paintFridgeThumbs;
  window.__heldKindOf = heldKindOf;
}

export default {
  HELD_KINDS, FRIDGE_ITEMS, heldKindOf, isDrink, heldItemLabel, sipAnim, sipLift,
  steamFrameAt, drawHeldItemSprite, heldItemContentBox, heldItemStamp, drawSipFaceOverlay, paintFridgeThumbs,
};
