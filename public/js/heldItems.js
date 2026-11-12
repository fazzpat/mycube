/* Held snack and drink sprites, drawn as an overlay on the avatar's hand.
   Avatar body / face / walk-cycle drawing stays in avatar3d.js. */
export const HELD_KINDS = ["pizza", "soda", "chicken", "water", "coffee"];
export const PROP_KINDS = ["balloon", "skateboard", "guitar"];
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
export const FOOD_KINDS = ["pizza", "chicken"];
export const SIP_MS = 1000;
export const SIP_COUNT = 6;
export const BITE_COUNT = 4;
export const BITE_MS = 2000;
export const BITE_GAP_MS = 850;
export const BITE_FIRST_MS = 1300;
export const BITE_TAIL_MS = 400;

export function heldKindOf(held) {
  if (!held) return null;
  const k = typeof held === "string" ? held : held.kind;
  if (k === "sandwich") return "pizza";
  if (k === "mug") return "coffee";
  if (k === "drink") return "soda";
  if (HELD_KINDS.includes(k)) return k;
  if (PROP_KINDS.includes(k)) return k;
  return null;
}

export function isHeldPropKind(kind) {
  const k = typeof kind === "string" ? kind : kind?.kind;
  return PROP_KINDS.includes(k);
}

export function isDrink(kind) {
  const k = heldKindOf(kind) || (typeof kind === "string" ? kind : kind?.kind);
  return DRINK_KINDS.includes(k) || DRINK_KINDS.includes(heldKindOf(k));
}

export function isFood(kind) {
  const k = heldKindOf(kind);
  return FOOD_KINDS.includes(k);
}

/** Lifetime of a held item on the server and client, kept in sync. */
export function heldEatDurationMs(kind) {
  const k = heldKindOf(kind);
  if (isFood(k)) return BITE_FIRST_MS + BITE_COUNT * BITE_MS + (BITE_COUNT - 1) * BITE_GAP_MS + BITE_TAIL_MS;
  if (k === "coffee") return 50000;
  if (k === "soda" || k === "water") return 45000;
  return 6000;
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

const IDLE_ANIM = { active: false, t: 0, lift: 0, face: false, action: null, index: 0, eaten: 0, done: false };

/** Deterministic drink sips (6–10s gaps, ~1s each) and four slow food bites. */
export function sipAnim(held, username, now, { walking = false } = {}) {
  const kind = heldKindOf(held);
  if (!kind) return { ...IDLE_ANIM };
  const startedAt = typeof held === "object" ? Number(held.startedAt) || 0 : 0;
  if (!startedAt) return { ...IDLE_ANIM };
  const elapsed = now - startedAt;
  if (elapsed < 0) return { ...IDLE_ANIM };

  if (isFood(kind)) {
    let t0 = BITE_FIRST_MS;
    for (let i = 0; i < BITE_COUNT; i++) {
      if (elapsed >= t0 && elapsed < t0 + BITE_MS) {
        const t = (elapsed - t0) / BITE_MS;
        const lift = walking ? 0 : biteLift(t);
        const eaten = i + (t >= 0.40 ? 1 : 0);
        return {
          active: !walking && lift > 0,
          t, lift,
          face: !walking && lift >= 0.55,
          action: "bite",
          index: i,
          eaten,
          done: false,
        };
      }
      if (elapsed < t0) {
        return { ...IDLE_ANIM, action: "bite", index: i, eaten: i };
      }
      t0 += BITE_MS + BITE_GAP_MS;
    }
    return { ...IDLE_ANIM, action: "bite", index: BITE_COUNT, eaten: BITE_COUNT, done: true };
  }

  if (!isDrink(kind) || walking) return { ...IDLE_ANIM };
  let s = hash32(startedAt + "|" + (username || "") + "|" + kind);
  let t0 = 0;
  const limit = Math.min(elapsed + 1, 180000);
  let index = -1;
  while (t0 <= limit) {
    s = nextRand(s);
    t0 += 6000 + (s % 4001);
    index += 1;
    if (elapsed >= t0 && elapsed < t0 + SIP_MS) {
      const t = (elapsed - t0) / SIP_MS;
      const lift = sipLift(t);
      return { active: true, t, lift, face: lift >= 0.55, action: "sip", index, eaten: 0, done: false };
    }
    if (t0 > elapsed) break;
  }
  return { ...IDLE_ANIM, action: "sip" };
}

export function sipLift(t) {
  if (t < 0.22) return t / 0.22;
  if (t < 0.78) return 1;
  return Math.max(0, (1 - t) / 0.22);
}

/** Slower raise, a clear pause at the mouth, then a slower lower. */
export function biteLift(t) {
  if (t < 0.30) return t / 0.30;
  if (t < 0.75) return 1;
  return Math.max(0, (1 - t) / 0.25);
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
  const cream = "#fff4e8";
  const cube = "#f0d24a";
  const cubeDk = "#c4a050";
  // Hand-sized open can: about as wide as the water bottle, a little taller than the hand.
  // No wordmark at this size — just a cream stripe and a tiny cube.
  plot(grid, 12, 13, silverLt);
  plot(grid, 11, 14, silver);
  plot(grid, 13, 14, silver);
  plot(grid, 12, 15, silverDk);
  fill(grid, 10, 16, 14, 16, silver);
  fill(grid, 11, 15, 13, 15, silver);
  plot(grid, 10, 16, silverDk);
  plot(grid, 14, 16, silverLt);
  fill(grid, 10, 16, 12, 16, hole);
  plot(grid, 13, 16, cube);
  fill(grid, 10, 17, 14, 22, red);
  fill(grid, 10, 17, 10, 22, redDk);
  fill(grid, 14, 17, 14, 22, redLt);
  fill(grid, 11, 19, 13, 19, cream);
  plot(grid, 12, 19, cube);
  plot(grid, 13, 19, cubeDk);
  fill(grid, 11, 23, 13, 23, silver);
}

const SHOW_W = 32;
const SHOW_H = 40;
const CUBE_GLYPH5 = {
  C: [".###.", "#....", "#....", "#....", ".###."],
  U: ["#...#", "#...#", "#...#", "#...#", ".###."],
  B: ["####.", "#...#", "####.", "#...#", "####."],
  E: ["#####", "#....", "####.", "#....", "#####"],
};
const SODA_GLYPH5 = {
  S: [".###", "#...", ".##.", "...#", "###."],
  O: [".##.", "#..#", "#..#", "#..#", ".##."],
  D: ["###.", "#..#", "#..#", "#..#", "###."],
  A: [".##.", "#..#", "####", "#..#", "#..#"],
};

function plotOn(grid, w, h, x, y, color) {
  if (x < 0 || y < 0 || x >= w || y >= h) return;
  grid[y * w + x] = color;
}
function fillOn(grid, w, h, x0, y0, x1, y1, color) {
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) plotOn(grid, w, h, x, y, color);
}
function plotWord(grid, w, h, glyphs, word, x, y, color, gap) {
  let cx = x;
  for (const ch of word) {
    const g = glyphs[ch];
    if (!g) continue;
    for (let row = 0; row < g.length; row++) {
      for (let col = 0; col < g[row].length; col++) {
        if (g[row][col] === "#") plotOn(grid, w, h, cx + col, y + row, color);
      }
    }
    cx += (g[0] ? g[0].length : 0) + gap;
  }
}

/** Larger CUBE SODA can for the fridge picker icon and closeup. Not used in-hand. */
function paintSodaLabelGrid() {
  const w = SHOW_W, h = SHOW_H;
  const grid = new Array(w * h).fill(null);
  const red = "#c4282a";
  const redDk = "#8a1818";
  const redLt = "#e85050";
  const silver = "#d0d4d8";
  const silverDk = "#8a8e94";
  const silverLt = "#f4f6f8";
  const hole = "#1a1410";
  const holeRim = "#3a3230";
  const cream = "#fff4e8";
  const cube = "#f0d24a";
  const cubeDk = "#c4a050";
  const badge = "#6a1018";
  const ink = "#2a1c14";
  // Pull tab
  plotOn(grid, w, h, 16, 2, silverLt);
  plotOn(grid, w, h, 15, 3, silver);
  plotOn(grid, w, h, 17, 3, silver);
  plotOn(grid, w, h, 14, 4, silver);
  plotOn(grid, w, h, 18, 4, silver);
  plotOn(grid, w, h, 16, 4, silverLt);
  plotOn(grid, w, h, 15, 5, silverDk);
  plotOn(grid, w, h, 16, 5, silver);
  plotOn(grid, w, h, 17, 5, silver);
  // Silver lid with dark opening and a gold cube
  fillOn(grid, w, h, 5, 7, 26, 10, silver);
  fillOn(grid, w, h, 6, 6, 25, 6, silver);
  fillOn(grid, w, h, 5, 7, 5, 10, silverDk);
  fillOn(grid, w, h, 26, 7, 26, 10, silverLt);
  fillOn(grid, w, h, 9, 7, 15, 9, hole);
  fillOn(grid, w, h, 9, 7, 15, 7, holeRim);
  plotOn(grid, w, h, 20, 8, cube);
  plotOn(grid, w, h, 21, 8, cube);
  plotOn(grid, w, h, 20, 9, cube);
  plotOn(grid, w, h, 21, 9, cubeDk);
  plotOn(grid, w, h, 19, 9, cubeDk);
  // Red body and dark-red badge — wide enough for 5px CUBE letters.
  fillOn(grid, w, h, 3, 11, 28, 35, red);
  fillOn(grid, w, h, 3, 11, 3, 35, redDk);
  fillOn(grid, w, h, 28, 11, 28, 35, redLt);
  fillOn(grid, w, h, 4, 36, 27, 36, silver);
  fillOn(grid, w, h, 5, 37, 26, 37, silverDk);
  fillOn(grid, w, h, 4, 13, 27, 32, badge);
  // CUBE 5x5 with 1px gaps (23px) at x=4; SODA 4x5 with 1px gaps (19px) centered under it.
  plotWord(grid, w, h, CUBE_GLYPH5, "CUBE", 4, 15, cream, 1);
  plotWord(grid, w, h, SODA_GLYPH5, "SODA", 6, 25, cream, 1);
  // Outline
  const out = grid.slice();
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (grid[y * w + x]) continue;
      let n = false;
      for (let dy = -1; dy <= 1 && !n; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const nx = x + dx, ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
          if (grid[ny * w + nx]) n = true;
        }
      }
      if (n) out[y * w + x] = ink;
    }
  }
  return { grid: out, w, h };
}

function gridBBoxAny(grid, w, h) {
  let x0 = w, y0 = h, x1 = -1, y1 = -1;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (!grid[y * w + x]) continue;
      if (x < x0) x0 = x;
      if (y < y0) y0 = y;
      if (x > x1) x1 = x;
      if (y > y1) y1 = y;
    }
  }
  if (x1 < 0) return { x: 0, y: 0, w: 0, h: 0 };
  return { x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1 };
}

export function sodaLabelStamp() {
  const painted = paintSodaLabelGrid();
  const box = gridBBoxAny(painted.grid, painted.w, painted.h);
  const c = makeCanvas(painted.w, painted.h);
  if (!c) return { c: null, w: painted.w, h: painted.h, box, kind: "soda" };
  const ctx = c.getContext("2d");
  ctx.imageSmoothingEnabled = false;
  for (let y = 0; y < painted.h; y++) {
    for (let x = 0; x < painted.w; x++) {
      const col = painted.grid[y * painted.w + x];
      if (!col) continue;
      ctx.fillStyle = col;
      ctx.fillRect(x, y, 1, 1);
    }
  }
  const crop = document.createElement("canvas");
  crop.width = box.w;
  crop.height = box.h;
  const cctx = crop.getContext("2d");
  cctx.imageSmoothingEnabled = false;
  cctx.drawImage(c, box.x, box.y, box.w, box.h, 0, 0, box.w, box.h);
  return { c: crop, w: box.w, h: box.h, box, kind: "soda" };
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
  // Mug ~25% larger than the first compact pass, still smaller than the face.
  fill(grid, 7, 12, 15, 19, mug);
  fill(grid, 8, 11, 14, 11, mug);
  fill(grid, 7, 12, 7, 19, mugDk);
  fill(grid, 8, 20, 14, 20, mugSh);
  fill(grid, 8, 12, 14, 14, coffee);
  fill(grid, 8, 12, 11, 12, coffeeLt);
  fill(grid, 16, 13, 17, 13, handle);
  fill(grid, 17, 14, 18, 17, handle);
  fill(grid, 16, 18, 17, 18, handle);
  plot(grid, 18, 14, handleDk);
  plot(grid, 18, 17, handleDk);
  // Steam wisps, scaled up with the taller cup.
  const cols = lights ? ["#ffffff", "#f0ece4", "#d8d0c4"] : ["#c8c4bc", "#a8a49c", "#888480"];
  const wisps = [
    { x: 8, y: 10, delay: 0 },
    { x: 11, y: 10, delay: 2 },
    { x: 14, y: 9, delay: 4 },
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

function applyBites(grid, kind, eaten) {
  const n = Math.max(0, Math.min(BITE_COUNT, Number(eaten) || 0));
  if (!n) return grid;
  if (n >= BITE_COUNT) {
    for (let i = 0; i < grid.length; i++) grid[i] = null;
    return grid;
  }
  if (kind === "pizza") {
    // Each bite takes more of the drooping tip; the crust handle stays in the hand.
    const cutY = [22, 18, 15, 12][Math.min(3, n)];
    for (let y = 0; y < ITEM_H; y++) {
      for (let x = 0; x < ITEM_W; x++) {
        if (!grid[y * ITEM_W + x]) continue;
        const along = (y - 8) / 13;
        const side = x - (12 + Math.round(Math.max(0, along) * Math.max(0, along) * 8));
        if (y >= cutY || (along > 1 - n * 0.24 && side > 2 - n)) grid[y * ITEM_W + x] = null;
      }
    }
    return grid;
  }
  if (kind === "chicken") {
    // Meat shrinks away from the bone handle, leaving a smaller drumstick.
    const cutY = [20, 17, 14, 11][Math.min(3, n)];
    for (let y = 0; y < ITEM_H; y++) {
      for (let x = 0; x < ITEM_W; x++) {
        if (!grid[y * ITEM_W + x]) continue;
        const bone = y <= 8 && x >= 14;
        if (bone) continue;
        if (y >= cutY || (n >= 2 && x <= 5 + n && y >= 12)) grid[y * ITEM_W + x] = null;
      }
    }
  }
  return grid;
}


function drawBalloon(grid) {
  const red = "#e24a4a", hi = "#f07070", dk = "#a03030", str = "#d8d0c4";
  const cx = 12, cy = 9;
  for (let y = -6; y <= 6; y++) {
    for (let x = -5; x <= 5; x++) {
      const d = (x / 5) * (x / 5) + (y / 6.2) * (y / 6.2);
      if (d <= 1) plot(grid, cx + x, cy + y, d < 0.35 && x < 0 && y < 0 ? hi : (d > 0.82 ? dk : red));
    }
  }
  plot(grid, cx, cy + 7, dk);
  plot(grid, cx - 1, cy + 8, dk);
  plot(grid, cx + 1, cy + 8, dk);
  for (let i = 0; i < 10; i++) {
    const x = cx + ((i % 3) - 1);
    plot(grid, x, cy + 9 + i, str);
  }
}

function drawSkateboard(grid) {
  const deck = "#6b3a2a", grip = "#2a2422", mid = "#8a5a32", truck = "#c0c4c8", wheel = "#1a1a22", stripe = "#f0c63a";
  for (let x = 3; x <= 20; x++) {
    plot(grid, x, 16, deck);
    plot(grid, x, 17, grip);
    plot(grid, x, 18, deck);
  }
  plot(grid, 2, 17, deck);
  plot(grid, 21, 17, deck);
  for (const x of [5, 6, 7, 16, 17, 18]) plot(grid, x, 17, mid);
  for (let x = 6; x <= 17; x++) plot(grid, x, 17, stripe);
  for (const tx of [6, 17]) {
    plot(grid, tx, 19, truck);
    plot(grid, tx - 1, 20, wheel);
    plot(grid, tx + 1, 20, wheel);
  }
}

function drawGuitar(grid) {
  const body = "#c48432", dk = "#8a4a1c", neck = "#6b3a2a", fret = "#d9a04a", head = "#5a3a20";
  for (let y = 12; y <= 20; y++) {
    for (let x = 5; x <= 15; x++) {
      const cx = 10, cy = 16, rx = 5.2, ry = 4.2;
      if (((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 <= 1) plot(grid, x, y, y < 14 || x < 7 ? fret : body);
    }
  }
  for (let y = 3; y <= 12; y++) {
    plot(grid, 10, y, neck);
    plot(grid, 11, y, neck);
  }
  plot(grid, 9, 3, head);
  plot(grid, 10, 2, head);
  plot(grid, 11, 2, head);
  plot(grid, 12, 3, head);
  plot(grid, 10, 16, dk);
}

function paintItem(kind, steamFrame, lights, eaten = 0) {
  const grid = new Array(ITEM_W * ITEM_H).fill(null);
  if (kind === "pizza") drawPizza(grid);
  else if (kind === "soda") drawSoda(grid);
  else if (kind === "chicken") drawChicken(grid);
  else if (kind === "water") drawWater(grid);
  else if (kind === "coffee") drawCoffee(grid, steamFrame, lights);
  else if (kind === "balloon") drawBalloon(grid);
  else if (kind === "skateboard") drawSkateboard(grid);
  else if (kind === "guitar") drawGuitar(grid);
  if (eaten) applyBites(grid, kind, eaten);
  return outline(grid, "#2a1c14");
}

const GRIP = {
  pizza: { x: 13, y: 10 },
  soda: { x: 12, y: 21 },
  chicken: { x: 16, y: 8 },
  water: { x: 12, y: 16 },
  coffee: { x: 11, y: 18 },
  balloon: { x: 12, y: 20 },
  skateboard: { x: 12, y: 17 },
  guitar: { x: 10, y: 18 },
};
// Rim / lip of drinks, so a sip lifts the opening to the mouth instead of the grip.
const LIP = {
  soda: { x: 11, y: 15 },
  water: { x: 12, y: 7 },
  coffee: { x: 11, y: 11 },
  pizza: { x: 17, y: 16 },
  chicken: { x: 10, y: 16 },
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
  let x0 = ITEM_W, y0 = ITEM_H, x1 = -1, y1 = -1, filled = 0;
  for (let y = 0; y < ITEM_H; y++) {
    for (let x = 0; x < ITEM_W; x++) {
      if (!grid[y * ITEM_W + x]) continue;
      filled += 1;
      if (x < x0) x0 = x;
      if (y < y0) y0 = y;
      if (x > x1) x1 = x;
      if (y > y1) y1 = y;
    }
  }
  if (x1 < 0) return { x: 0, y: 0, w: 0, h: 0, filled: 0 };
  return { x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1, filled };
}

/** Content box of the item itself (no cupping hand). Useful for tests and thumbs. */
export function heldItemContentBox(kind, opts = {}) {
  const k = heldKindOf(kind) || kind;
  if (!HELD_KINDS.includes(k)) return { x: 0, y: 0, w: 0, h: 0 };
  const grid = paintItem(k, opts.steamFrame ?? 0, opts.lights !== false, opts.eaten || 0);
  return gridBBox(grid);
}

export function drawHeldItemSprite(kind, opts = {}) {
  const k = heldKindOf(kind) || kind;
  if (!HELD_KINDS.includes(k) && !PROP_KINDS.includes(k)) return null;
  const flip = Boolean(opts.flip);
  const lights = opts.lights !== false;
  const withHand = opts.hand !== false;
  const skin = toHex(opts.skin);
  const steamFrame = k === "coffee" ? ((opts.steamFrame ?? 0) % 6) : 0;
  const eaten = Math.max(0, Math.min(BITE_COUNT, Number(opts.eaten) || 0));
  const key = k + ":" + (flip ? 1 : 0) + ":" + steamFrame + ":" + (lights ? 1 : 0) + ":" + (withHand ? skin : "nohand") + ":b" + eaten;
  const hit = cache.get(key);
  if (hit) return hit;
  const c = makeCanvas(ITEM_W, ITEM_H);
  const grip = { ...GRIP[k] };
  const lip = { ...(LIP[k] || GRIP[k]) };
  const grid = paintItem(k, steamFrame, lights, eaten);
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
    const labeled = kind === "soda" ? sodaLabelStamp() : null;
    const spr = labeled && labeled.c ? labeled : drawHeldItemSprite(kind, { lights: true, steamFrame: 2, hand: false });
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
    // Showcase stamp is already cropped to its box.
    const cropped = Boolean(labeled && labeled.c);
    const sx = cropped ? 0 : Math.max(0, box.x - pad);
    const sy = cropped ? 0 : Math.max(0, box.y - pad);
    const sw = cropped ? spr.w : Math.min(spr.w - sx, box.w + pad * 2);
    const sh = cropped ? spr.h : Math.min(spr.h - sy, box.h + pad * 2);
    const scale = Math.max(1, Math.floor(Math.min(w / sw, h / sh) * 0.9));
    const dw = sw * scale, dh = sh * scale;
    ctx.drawImage(spr.c, sx, sy, sw, sh, ((w - dw) / 2) | 0, ((h - dh) / 2) | 0, dw, dh);
  });
}

if (typeof window !== "undefined") {
  window.__drawHeldItemSprite = drawHeldItemSprite;
  window.__heldItemStamp = heldItemStamp;
  window.__sodaLabelStamp = sodaLabelStamp;
  window.__sipAnim = sipAnim;
  window.__drawSipFaceOverlay = drawSipFaceOverlay;
  window.__paintFridgeThumbs = paintFridgeThumbs;
  window.__heldKindOf = heldKindOf;
}

export default {
  HELD_KINDS, FRIDGE_ITEMS, FOOD_KINDS, heldKindOf, isDrink, isFood, heldItemLabel, sipAnim, sipLift, biteLift,
  heldEatDurationMs, BITE_COUNT, BITE_MS, BITE_FIRST_MS, BITE_GAP_MS, SIP_COUNT,
  steamFrameAt, drawHeldItemSprite, heldItemContentBox, heldItemStamp, sodaLabelStamp, drawSipFaceOverlay, paintFridgeThumbs,
};
