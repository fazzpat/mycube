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
  // Triangle slice pointing up-right, crust along the bottom-left hypotenuse.
  const rows = [
    [10, 10, cheese],
    [9, 12, cheese],
    [8, 14, cheese],
    [7, 16, cheese],
    [6, 17, cheese],
    [6, 18, crust],
  ];
  // Fill a right-triangle: tip at (14, 4), base from (4, 16) to (19, 16), crust under base.
  for (let y = 4; y <= 16; y++) {
    const t = (y - 4) / 12;
    const x0 = Math.round(14 - t * 10);
    const x1 = Math.round(14 + t * 6);
    for (let x = x0; x <= x1; x++) plot(grid, x, y, (x + y) % 5 === 0 ? cheeseLt : cheese);
  }
  for (let y = 17; y <= 19; y++) {
    const t = (y - 17) / 3;
    const x0 = Math.round(4 - t);
    const x1 = Math.round(20 + t);
    for (let x = x0; x <= x1; x++) plot(grid, x, y, y === 19 ? crustDk : crust);
  }
  // Pepperoni
  const peps = [[11, 8], [8, 12], [14, 12], [11, 14]];
  for (const [cx, cy] of peps) {
    plot(grid, cx, cy, pep);
    plot(grid, cx + 1, cy, pep);
    plot(grid, cx, cy + 1, pep);
    plot(grid, cx + 1, cy + 1, pepDk);
  }
  plot(grid, 13, 10, basil);
  plot(grid, 9, 10, basil);
}

function drawSoda(grid) {
  const red = "#c4282a";
  const redDk = "#8a1818";
  const redLt = "#e85050";
  const silver = "#d0d4d8";
  const silverDk = "#8a8e94";
  const hi = "#fff8f0";
  fill(grid, 8, 6, 15, 7, silver);
  fill(grid, 9, 5, 14, 5, silver);
  fill(grid, 10, 4, 13, 4, silverDk);
  plot(grid, 11, 3, silver);
  plot(grid, 12, 3, silver);
  fill(grid, 8, 8, 15, 18, red);
  fill(grid, 8, 8, 8, 18, redDk);
  fill(grid, 15, 8, 15, 18, redLt);
  fill(grid, 9, 10, 10, 16, hi);
  fill(grid, 8, 19, 15, 20, silver);
  fill(grid, 9, 21, 14, 21, silverDk);
  // Label stripe
  fill(grid, 9, 12, 14, 14, hi);
  fill(grid, 10, 13, 13, 13, red);
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
  fill(grid, 10, 3, 13, 5, cap);
  fill(grid, 10, 3, 13, 3, capLt);
  fill(grid, 9, 6, 14, 6, ring);
  fill(grid, 9, 7, 14, 21, bot);
  fill(grid, 8, 8, 8, 20, botDk);
  fill(grid, 15, 8, 15, 20, bot);
  fill(grid, 9, 10, 14, 18, water);
  fill(grid, 10, 8, 11, 19, hi);
  fill(grid, 9, 21, 14, 22, botDk);
  // Shoulder
  fill(grid, 10, 7, 13, 8, ring);
}

function drawCoffee(grid, steamFrame, lights) {
  const mug = "#f4eee0";
  const mugDk = "#d4c8b4";
  const mugSh = "#b8a890";
  const coffee = "#4a2814";
  const coffeeLt = "#6a4030";
  const handle = "#e8e0d0";
  const handleDk = "#a89880";
  // Cup body
  fill(grid, 6, 12, 16, 21, mug);
  fill(grid, 7, 11, 15, 11, mug);
  fill(grid, 6, 12, 6, 21, mugDk);
  fill(grid, 16, 13, 16, 20, mug);
  fill(grid, 7, 21, 15, 22, mugSh);
  // Coffee surface
  fill(grid, 7, 12, 15, 14, coffee);
  fill(grid, 8, 12, 12, 12, coffeeLt);
  // Handle on the right
  fill(grid, 17, 14, 19, 14, handle);
  fill(grid, 19, 15, 20, 18, handle);
  fill(grid, 17, 19, 19, 19, handle);
  plot(grid, 20, 14, handleDk);
  plot(grid, 20, 19, handleDk);
  // Steam wisps
  const cols = lights ? ["#ffffff", "#f0ece4", "#d8d0c4"] : ["#c8c4bc", "#a8a49c", "#888480"];
  const wisps = [
    { x: 9, y: 10, delay: 0 },
    { x: 12, y: 10, delay: 2 },
    { x: 15, y: 9, delay: 4 },
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
  pizza: { x: 12, y: 18 },
  soda: { x: 12, y: 18 },
  chicken: { x: 16, y: 8 },
  water: { x: 12, y: 18 },
  coffee: { x: 11, y: 20 },
};
// Rim / lip of drinks, so a sip lifts the opening to the mouth instead of the grip.
const LIP = {
  soda: { x: 12, y: 5 },
  water: { x: 12, y: 6 },
  coffee: { x: 11, y: 11 },
};

export function drawHeldItemSprite(kind, opts = {}) {
  const k = heldKindOf(kind) || kind;
  if (!HELD_KINDS.includes(k)) return null;
  const flip = Boolean(opts.flip);
  const lights = opts.lights !== false;
  const steamFrame = k === "coffee" ? ((opts.steamFrame ?? 0) % 6) : 0;
  const key = k + ":" + (flip ? 1 : 0) + ":" + steamFrame + ":" + (lights ? 1 : 0);
  const hit = cache.get(key);
  if (hit) return hit;
  const c = makeCanvas(ITEM_W, ITEM_H);
  const grip = { ...GRIP[k] };
  const lip = { ...(LIP[k] || GRIP[k]) };
  if (!c) {
    const spr = { c: null, w: ITEM_W, h: ITEM_H, gx: grip.x, gy: grip.y, lx: lip.x, ly: lip.y, kind: k };
    cache.set(key, spr);
    return spr;
  }
  const ctx = c.getContext("2d");
  ctx.imageSmoothingEnabled = false;
  const grid = paintItem(k, steamFrame, lights);
  if (flip) {
    const flipped = new Array(ITEM_W * ITEM_H).fill(null);
    for (let y = 0; y < ITEM_H; y++) {
      for (let x = 0; x < ITEM_W; x++) flipped[y * ITEM_W + (ITEM_W - 1 - x)] = grid[y * ITEM_W + x];
    }
    blitGrid(ctx, flipped, 0, 0);
    grip.x = ITEM_W - 1 - grip.x;
    lip.x = ITEM_W - 1 - lip.x;
    const spr = { c, w: ITEM_W, h: ITEM_H, gx: grip.x, gy: grip.y, lx: lip.x, ly: lip.y, kind: k };
    cache.set(key, spr);
    return spr;
  }
  blitGrid(ctx, grid, 0, 0);
  const spr = { c, w: ITEM_W, h: ITEM_H, gx: grip.x, gy: grip.y, lx: lip.x, ly: lip.y, kind: k };
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

export function paintFridgeThumbs(root = typeof document !== "undefined" ? document : null) {
  if (!root) return;
  const thumbs = root.querySelectorAll ? root.querySelectorAll("[data-fridge-thumb]") : [];
  thumbs.forEach((canvas) => {
    const kind = canvas.getAttribute("data-fridge-thumb");
    const spr = drawHeldItemSprite(kind, { lights: true, steamFrame: 2 });
    if (!spr || !spr.c) return;
    const w = canvas.width || 40;
    const h = canvas.height || 40;
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    ctx.imageSmoothingEnabled = false;
    ctx.clearRect(0, 0, w, h);
    const scale = Math.floor(Math.min(w / spr.w, h / spr.h) * 0.95) || 1;
    const dw = spr.w * scale, dh = spr.h * scale;
    ctx.drawImage(spr.c, 0, 0, spr.w, spr.h, ((w - dw) / 2) | 0, ((h - dh) / 2) | 0, dw, dh);
  });
}

if (typeof window !== "undefined") {
  window.__drawHeldItemSprite = drawHeldItemSprite;
  window.__sipAnim = sipAnim;
  window.__drawSipFaceOverlay = drawSipFaceOverlay;
  window.__paintFridgeThumbs = paintFridgeThumbs;
  window.__heldKindOf = heldKindOf;
}

export default {
  HELD_KINDS, FRIDGE_ITEMS, heldKindOf, isDrink, heldItemLabel, sipAnim, sipLift,
  steamFrameAt, drawHeldItemSprite, drawSipFaceOverlay, paintFridgeThumbs,
};
