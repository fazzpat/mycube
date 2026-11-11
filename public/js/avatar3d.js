/* Original MyCube chibi paper-doll avatars. Native 48x64, integer blit, part-colored ink. */
export const AV_W = 48;
export const AV_H = 64;
export const AV_GROUND_Y = 61;
export const AV_HEAD_TOP = 1;
const AV_SEAT_DROP = 8;
const CX = 24;

export function facingIndex8(facing, dirX, dirY) {
  let dx = 0, dy = 1;
  if (facing && (facing.x !== undefined || facing.z !== undefined || facing.y !== undefined)) {
    dx = facing.x || 0;
    dy = facing.z !== undefined ? facing.z : (facing.y || 0);
  } else {
    dx = dirX || 0;
    dy = dirY || 0;
  }
  if (dx === 0 && dy === 0) dy = 1;
  let ang = Math.atan2(dy, dx);
  if (ang < 0) ang += Math.PI * 2;
  return Math.round(ang / (Math.PI / 4)) & 7;
}

function hexToRgb(hex) {
  const n = parseInt(String(hex).replace("#", ""), 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}
function mix(a, b, t) {
  return {
    r: Math.round(a.r + (b.r - a.r) * t),
    g: Math.round(a.g + (b.g - a.g) * t),
    b: Math.round(a.b + (b.b - a.b) * t),
  };
}
function rgb(r, g, b) { return { r, g, b }; }
function mute(hex) {
  // Keep catalog colors lively with only a touch of warmth.
  const c = hexToRgb(hex);
  const sun = rgb(255, 236, 210);
  return mix(c, sun, 0.06);
}

const INK = rgb(42, 28, 24);
const TEAR = rgb(150, 186, 210);

function partOutlineColor(color) {
  // 1px selective outline: a darker, more saturated shade of the part's own fill.
  const c = color || INK;
  const avg = (c.r + c.g + c.b) / 3;
  const sat = 1.4;
  const dark = 0.40;
  return {
    r: Math.max(0, Math.min(255, Math.round((avg + (c.r - avg) * sat) * dark))),
    g: Math.max(0, Math.min(255, Math.round((avg + (c.g - avg) * sat) * dark))),
    b: Math.max(0, Math.min(255, Math.round((avg + (c.b - avg) * sat) * dark))),
  };
}

function tones(hex, warm = false) {
  const b = typeof hex === "string" ? (warm ? hexToRgb(hex) : mute(hex)) : hex;
  const hi = mix(b, rgb(255, 248, 230), warm ? 0.32 : 0.26);
  const sh = mix(b, rgb(70, 38, 32), warm ? 0.22 : 0.24);
  return { mid: b, hi, sh };
}

function normalizeAvatar(raw = {}) {
  const a = { ...raw };
  if (a.top === "techwear") a.top = "jacket";
  if (a.top === "ledhoodie") a.top = "hoodie";
  if (a.bottom === "neonpants") a.bottom = "jeans";
  if (a.shoes === "glow") a.shoes = "white";
  if (a.shoes === "cyber") a.shoes = "black";
  if (a.accessory === "visor" || a.accessory === "goggles") { a.glasses = true; a.accessory = "none"; }
  if (a.accessory === "tattoo") a.accessory = "none";
  if (a.hair === "neon") a.hair = "spiky";
  return {
    skin: a.skin || "#f1c27d",
    hair: a.hair || "short",
    hairColor: a.hairColor || "#2b1d16",
    shirt: a.shirt || "#ff7a59",
    glasses: Boolean(a.glasses),
    top: a.top || "tshirt",
    bottom: a.bottom || "jeans",
    bottomColor: a.bottomColor || "#3d4f7c",
    shoes: a.shoes || "white",
    accessory: a.accessory || "none",
    headphoneColor: a.headphoneColor || "#2a2a2e",
    outer: a.outer || "none",
  };
}

function viewOfDir(dir) {
  switch (dir) {
    case 0: return { key: "se", flip: false };
    case 1: return { key: "s", flip: false };
    case 2: return { key: "se", flip: true };
    case 3: return { key: "e", flip: true };
    case 4: return { key: "ne", flip: true };
    case 5: return { key: "n", flip: false };
    case 6: return { key: "ne", flip: false };
    case 7: return { key: "e", flip: false };
    default: return { key: "se", flip: false };
  }
}

function makeBuf() { return new Array(AV_W * AV_H).fill(null); }

function plot(buf, x, y, color, kind, depth = 0) {
  x = x | 0; y = y | 0;
  if (x < 0 || y < 0 || x >= AV_W || y >= AV_H || !color) return;
  const i = y * AV_W + x;
  const cur = buf[i];
  if (cur && (cur.depth || 0) > depth) return;
  buf[i] = { color, kind, depth };
}

function plotInside(buf, x, y, color, kind, depth = 0) {
  // Highlights must stay inside an existing fill so they never become silhouette pixels.
  x = x | 0; y = y | 0;
  if (x < 0 || y < 0 || x >= AV_W || y >= AV_H) return;
  const cur = buf[y * AV_W + x];
  if (!cur || cur.kind === "ink" || cur.kind === "sticker" || cur.kind === "shadow") return;
  plot(buf, x, y, color, kind, depth);
}

function shadeAt(pal, lx, ly) {
  // Flat 2-3 tone cel bands. Light from above, no diagonal smears.
  if (!pal || !pal.hi) return pal;
  if (ly < -0.4) return pal.hi;
  if (ly > 0.46) return pal.sh;
  return pal.mid;
}

function shadeSide(pal, lx, ly) {
  // Base, one highlight on the upper-left, one shadow on the right. Never a crown highlight U.
  if (!pal || !pal.hi) return pal;
  const lit = -0.62 * lx - 0.22 * ly;
  if (lit > 0.38) return pal.hi;
  if (lit < -0.22) return pal.sh;
  return pal.mid;
}

function egg(buf, cx, cy, rx, ry, pal, kind, depth = 0, opts = {}) {
  // Vertical egg: smooth oval, slightly wider below the middle. No square corners.
  const rxi = Math.ceil(rx) + 2, ryi = Math.ceil(ry) + 2;
  const flat = opts.shade === "flat" || !pal?.hi;
  const widenBot = opts.widen == null ? 0.10 : opts.widen;
  const flatten = opts.flatten == null ? 0.22 : opts.flatten;
  for (let y = -ryi; y <= ryi; y++) {
    for (let x = -rxi; x <= rxi; x++) {
      const ny = y / ry;
      let rxUse = rx;
      if (flatten && ny < -0.28) {
        const t = Math.min(1, (-ny - 0.28) / 0.72);
        rxUse = rx * (1 + t * flatten);
      }
      const widen = 1 + Math.max(0, ny) * widenBot;
      const nx = x / (rxUse * widen);
      if (nx * nx + ny * ny > 1) continue;
      const col = flat ? (pal.mid || pal) : shadeSide(pal, nx, ny);
      plot(buf, Math.round(cx + x), Math.round(cy + y), col, kind, depth);
    }
  }
}

function eggBelow(buf, cx, cy, rx, ry, minY, pal, kind, depth, opts = {}) {
  const rxi = Math.ceil(rx) + 2, ryi = Math.ceil(ry) + 2;
  const flat = opts.shade === "flat" || !pal?.hi;
  const widenBot = opts.widen == null ? 0.10 : opts.widen;
  const flatten = opts.flatten == null ? 0.22 : opts.flatten;
  for (let y = -ryi; y <= ryi; y++) {
    const py = Math.round(cy + y);
    if (py < minY) continue;
    for (let x = -rxi; x <= rxi; x++) {
      const ny = y / ry;
      let rxUse = rx;
      if (flatten && ny < -0.28) {
        const t = Math.min(1, (-ny - 0.28) / 0.72);
        rxUse = rx * (1 + t * flatten);
      }
      const widen = 1 + Math.max(0, ny) * widenBot;
      const nx = x / (rxUse * widen);
      if (nx * nx + ny * ny > 1) continue;
      const col = flat ? (pal.mid || pal) : shadeSide(pal, nx, ny);
      plot(buf, Math.round(cx + x), py, col, kind, depth);
    }
  }
}

function squish(buf, cx, cy, rx, ry, pal, kind, depth = 0, opts = {}) {
  // Soft rounded-square marshmallow / bean. n>2 gives squarish corners without hard edges.
  const n = opts.power || 2.55;
  const rxi = Math.ceil(rx) + 2, ryi = Math.ceil(ry) + 2;
  const flat = opts.shade === "flat" || !pal?.hi;
  const minY = opts.minY == null ? -999 : opts.minY;
  for (let y = -ryi; y <= ryi; y++) {
    const py = Math.round(cy + y);
    if (py < minY) continue;
    for (let x = -rxi; x <= rxi; x++) {
      const nx = Math.abs(x / rx), ny = Math.abs(y / ry);
      if ((nx ** n) + (ny ** n) > 1) continue;
      const col = flat ? (pal.mid || pal) : shadeSide(pal, x / (rx || 1), y / (ry || 1));
      plot(buf, Math.round(cx + x), py, col, kind, depth);
    }
  }
}

function ellipse(buf, cx, cy, rx, ry, pal, kind, depth = 0, opts = {}) {
  const rxi = Math.ceil(rx) + 1, ryi = Math.ceil(ry) + 1;
  const cut = opts.cut || 1;
  const flat = opts.shade === "flat" || !pal?.hi;
  for (let y = -ryi; y <= ryi; y++) {
    for (let x = -rxi; x <= rxi; x++) {
      const nx = x / rx, ny = y / ry;
      const d = nx * nx + ny * ny;
      if (d > cut) continue;
      const col = flat ? (pal.mid || pal) : shadeAt(pal, nx, ny);
      plot(buf, Math.round(cx + x), Math.round(cy + y), col, kind, depth);
    }
  }
}

function circle(buf, cx, cy, r, pal, kind, depth, opts) {
  ellipse(buf, cx, cy, r, r, pal, kind, depth, opts);
}

function rect(buf, x0, y0, x1, y1, pal, kind, depth, round = 0, opts = {}) {
  const minx = Math.min(x0, x1), maxx = Math.max(x0, x1);
  const miny = Math.min(y0, y1), maxy = Math.max(y0, y1);
  const cx = (minx + maxx) / 2, cy = (miny + maxy) / 2;
  const hw = (maxx - minx) / 2 || 1, hh = (maxy - miny) / 2 || 1;
  const flat = opts.shade === "flat" || !pal?.hi;
  for (let y = miny; y <= maxy; y++) {
    for (let x = minx; x <= maxx; x++) {
      if (round > 0) {
        const dx = Math.max(0, Math.abs(x - cx) - (hw - round));
        const dy = Math.max(0, Math.abs(y - cy) - (hh - round));
        if (dx * dx + dy * dy > round * round) continue;
      }
      const col = flat ? (pal.mid || pal) : shadeAt(pal, (x - cx) / hw, (y - cy) / hh);
      plot(buf, x, y, col, kind, depth);
    }
  }
}

function capsule(buf, x0, y0, x1, y1, r, pal, kind, depth) {
  const dx = x1 - x0, dy = y1 - y0;
  const len = Math.hypot(dx, dy) || 1;
  const n = Math.ceil(len) + 1;
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    // Flat mid stamps so a limb does not pick up scalloped or diagonal bands.
    ellipse(buf, x0 + dx * t, y0 + dy * t, r, r, pal, kind, depth, { shade: "flat" });
  }
}

function inkAround(tmp) {
  const next = tmp.slice();
  const dirs = [[1, 0], [-1, 0], [0, 1], [0, -1]];
  for (let y = 0; y < AV_H; y++) {
    for (let x = 0; x < AV_W; x++) {
      const i = y * AV_W + x;
      if (tmp[i]) continue;
      let n = null;
      for (const [dx, dy] of dirs) {
        const xx = x + dx, yy = y + dy;
        if (xx < 0 || yy < 0 || xx >= AV_W || yy >= AV_H) continue;
        const c = tmp[yy * AV_W + xx];
        if (c && c.kind !== "ink" && c.kind !== "sticker" && c.kind !== "shadow") { n = c; break; }
      }
      if (!n) continue;
      next[i] = { color: mix(n.color || INK, rgb(48, 28, 24), 0.48), kind: "ink", depth: (n.depth || 0) + 0.4 };
    }
  }
  return next;
}

function stampSpike(dest, cx, cy, len, half, ang, pal, kind, depth, rounded = false) {
  const tmp = makeBuf();
  const ca = Math.cos(ang), sa = Math.sin(ang);
  const pad = Math.ceil(Math.abs(len) + Math.abs(half)) + 2;
  for (let y = -pad; y <= pad; y++) {
    for (let x = -pad; x <= pad; x++) {
      const along = x * ca + y * sa;
      const perp = -x * sa + y * ca;
      let inside = false;
      if (along < 0) {
        const br = rounded ? half * 1.08 : half;
        inside = along * along + perp * perp <= br * br;
      } else if (along <= len) {
        const t = along / (len || 1);
        const w = rounded
          ? half * (1 - t * t * 0.7) + 0.35
          : half * (1 - Math.pow(t, 1.2)) + 0.22 * (1 - t);
        inside = Math.abs(perp) <= w;
      }
      if (!inside) continue;
      let col = pal.mid || pal;
      if (pal.hi && along < len * 0.4 && perp < -half * 0.1) col = pal.hi;
      else if (pal.sh && perp > half * 0.42) col = pal.sh;
      plot(tmp, Math.round(cx + x), Math.round(cy + y), col, kind, depth);
    }
  }
  const inked = inkAround(tmp);
  for (let i = 0; i < inked.length; i++) {
    const p = inked[i];
    if (!p) continue;
    const x = i % AV_W, y = (i / AV_W) | 0;
    if (p.kind === "ink") {
      const cur = dest[i];
      if (cur && cur.kind !== "hair" && cur.kind !== "hair-cap" && cur.kind !== "hair-lock" && cur.kind !== "hair-bun" && cur.kind !== "ink" && (cur.depth || 0) > depth) continue;
      // Let a clump's outline cut a dark groove through neighboring hair.
      dest[i] = { color: p.color, kind: "ink", depth: depth + 0.4 };
    } else {
      plot(dest, x, y, p.color, p.kind, depth);
    }
  }
}

function teardrop(buf, cx, cy, rx, ry, ang, pal, kind, depth) {
  // Rounded clump pointing along ang (radians, 0 = right, -PI/2 = up).
  const ca = Math.cos(ang), sa = Math.sin(ang);
  const rxi = Math.ceil(Math.abs(rx) + Math.abs(ry)) + 2;
  for (let y = -rxi; y <= rxi; y++) {
    for (let x = -rxi; x <= rxi; x++) {
      const lx = x * ca + y * sa;
      const ly = -x * sa + y * ca;
      const nx = lx / rx, ny = ly / ry;
      // pointed tip in +lx
      const tip = nx > 0 ? nx * nx * 1.15 + ny * ny : nx * nx * 0.75 + ny * ny;
      if (tip > 1) continue;
      const col = pal.hi ? shadeAt(pal, nx, ny) : pal;
      plot(buf, Math.round(cx + x), Math.round(cy + y), col, kind, depth);
    }
  }
}

function flipBuf(src, flip) {
  if (!flip) return src;
  const out = makeBuf();
  for (let y = 0; y < AV_H; y++) {
    for (let x = 0; x < AV_W; x++) {
      out[y * AV_W + (AV_W - 1 - x)] = src[y * AV_W + x];
    }
  }
  return out;
}

function shiftBuf(buf, dy) {
  if (!dy) return buf;
  const out = makeBuf();
  for (let y = 0; y < AV_H; y++) {
    const ny = y + dy;
    if (ny < 0 || ny >= AV_H) continue;
    for (let x = 0; x < AV_W; x++) out[ny * AV_W + x] = buf[y * AV_W + x];
  }
  return out;
}

function lowestKindY(buf, pred) {
  for (let y = AV_H - 1; y >= 0; y--) {
    for (let x = 0; x < AV_W; x++) {
      const p = buf[y * AV_W + x];
      if (p && pred(p)) return y;
    }
  }
  return -1;
}

function plantOnGround(buf) {
  const sole = lowestKindY(buf, (p) => {
    const k = p.kind || "";
    return k.startsWith("shoe") || k.startsWith("sole") || k.startsWith("boot");
  });
  const body = lowestKindY(buf, (p) => p.kind !== "ink" && p.kind !== "sticker" && p.kind !== "shadow");
  const y = sole >= 0 ? sole : body;
  if (y < 0 || y === AV_GROUND_Y) return buf;
  return shiftBuf(buf, AV_GROUND_Y - y);
}

function addInkOutline(buf) {
  const next = buf.slice();
  const dirs = [[1, 0], [-1, 0], [0, 1], [0, -1]];
  for (let y = 0; y < AV_H; y++) {
    for (let x = 0; x < AV_W; x++) {
      const i = y * AV_W + x;
      if (buf[i]) continue;
      let n = null;
      for (const [dx, dy] of dirs) {
        const xx = x + dx, yy = y + dy;
        if (xx < 0 || yy < 0 || xx >= AV_W || yy >= AV_H) continue;
        const c = buf[yy * AV_W + xx];
        if (c && c.kind !== "ink" && c.kind !== "sticker" && c.kind !== "shadow") { n = c; break; }
      }
      if (!n) continue;
      next[i] = { color: partOutlineColor(n.color || INK), kind: "ink", depth: 80 };
    }
  }
  // Fills that touch the canvas border have no room for an outward ink pixel.
  // Recolor those edge fills so a clipped ear or puff never shows a raw light silhouette.
  for (let y = 0; y < AV_H; y++) {
    for (let x = 0; x < AV_W; x++) {
      if (x > 0 && y > 0 && x < AV_W - 1 && y < AV_H - 1) continue;
      const i = y * AV_W + x;
      const p = buf[i];
      if (!p || p.kind === "ink" || p.kind === "sticker" || p.kind === "shadow") continue;
      next[i] = { color: partOutlineColor(p.color || INK), kind: "ink", depth: 80 };
    }
  }
  return next;
}


function shadeUnderChin(buf) {
  // Soft contact shadow on the shirt just below the overlapping chin/jaw.
  const next = buf.slice();
  for (let y = 1; y < AV_H; y++) {
    for (let x = 0; x < AV_W; x++) {
      const p = buf[y * AV_W + x];
      if (!isFill(p) || !isTorsoish(p.kind)) continue;
      let under = false, dist = 99;
      for (let dy = 1; dy <= 2; dy++) {
        const n = buf[(y - dy) * AV_W + x];
        if (n && isFill(n) && /^(skin-head|skin-jaw|skin-face|ear)/.test(n.kind || "")) {
          under = true;
          dist = dy;
          break;
        }
      }
      if (!under) continue;
      const t = dist === 1 ? 0.34 : 0.18;
      const col = mix(p.color || INK, rgb(40, 24, 20), t);
      next[y * AV_W + x] = { color: col, kind: "collar", depth: Math.max(p.depth || 0, 28) };
    }
  }
  return next;
}

function addContactShade(buf) {
  // Subtle darker pixels at the bottom of the torso and feet to help them sit on the floor.
  const next = buf.slice();
  for (let x = 0; x < AV_W; x++) {
    let yHit = -1;
    for (let y = AV_H - 1; y >= 0; y--) {
      const p = buf[y * AV_W + x];
      if (!isFill(p)) continue;
      const k = p.kind || "";
      if (isTorsoish(k) || /^(shoe|sole|boot)/.test(k)) { yHit = y; break; }
    }
    if (yHit < 0) continue;
    const p = next[yHit * AV_W + x];
    if (!p || !p.color) continue;
    next[yHit * AV_W + x] = { ...p, color: mix(p.color, rgb(36, 22, 16), 0.22) };
  }
  return next;
}

function addStickerOutline(buf) {
  // White sticker outlines are retired. Characters use a 1px part-colored ink outline only.
  return buf;
}

function fillToward(buf, x, y, dx, dy, max = 6) {
  for (let i = 1; i <= max; i++) {
    const xx = x + dx * i, yy = y + dy * i;
    if (xx < 0 || yy < 0 || xx >= AV_W || yy >= AV_H) return false;
    const c = buf[yy * AV_W + xx];
    if (!c || c.kind === "shadow") continue;
    if (c.kind === "sticker" || c.kind === "ink") continue;
    return true;
  }
  return false;
}

function isFill(p) {
  return p && p.kind !== "sticker" && p.kind !== "ink" && p.kind !== "shadow";
}

function isHeadish(kind) {
  const k = kind || "";
  return /^(skin-head|skin-jaw|skin-face|ear|hair|hat|glasses|lens|eye|blush|clip|heart|hp-|part)/.test(k);
}

function isTorsoish(kind) {
  const k = kind || "";
  return /^(skin-body|top|hood|pouch|placket|collar|lapel|vneck|zip|midriff|quilt|var-|letter|graphic|number|piping|chain|belt|pants|skirt|cuff|cargo|sleeve|flare|stripe)/.test(k);
}

function shaveOpenEdgeStickers(buf, edge) {
  // Drop the white outline on the open edge of a floating part (jaw underside or collar top).
  const next = buf.slice();
  for (let y = 0; y < AV_H; y++) {
    for (let x = 0; x < AV_W; x++) {
      const i = y * AV_W + x;
      const p = buf[i];
      if (!p || p.kind !== "sticker") continue;
      let up = false, down = false;
      for (let yy = y - 1; yy >= 0; yy--) {
        if (isFill(buf[yy * AV_W + x])) { up = true; break; }
      }
      for (let yy = y + 1; yy < AV_H; yy++) {
        if (isFill(buf[yy * AV_W + x])) { down = true; break; }
      }
      if (edge === "bottom" && up && !down) next[i] = null;
      if (edge === "top" && down && !up) next[i] = null;
    }
  }
  return next;
}

function stripInnerStickers(buf) {
  // Drop white pixels trapped in 1-2px gaps (the U around torso, collar, and shoes).
  const next = buf.slice();
  for (let y = 0; y < AV_H; y++) {
    for (let x = 0; x < AV_W; x++) {
      const i = y * AV_W + x;
      const p = buf[i];
      if (!p || p.kind !== "sticker") continue;
      const ns = fillToward(buf, x, y, 0, -1) && fillToward(buf, x, y, 0, 1);
      const ew = fillToward(buf, x, y, -1, 0) && fillToward(buf, x, y, 1, 0);
      if (ns || ew) next[i] = null;
    }
  }
  return next;
}

function stripNeckGapStickers(buf) {
  // If a tiny seam opens between head and torso, keep it empty of leftover stickers.
  const headBottom = new Array(AV_W).fill(-1);
  const torsoTop = new Array(AV_W).fill(99);
  for (let y = 0; y < AV_H; y++) {
    for (let x = 0; x < AV_W; x++) {
      const p = buf[y * AV_W + x];
      if (!isFill(p)) continue;
      if (isHeadish(p.kind) && y > headBottom[x]) headBottom[x] = y;
      if (isTorsoish(p.kind) && y < torsoTop[x]) torsoTop[x] = y;
    }
  }
  const next = buf.slice();
  for (let x = 0; x < AV_W; x++) {
    let hb = -1, tt = 99;
    for (let k = -2; k <= 2; k++) {
      const xx = x + k;
      if (xx < 0 || xx >= AV_W) continue;
      if (headBottom[xx] > hb) hb = headBottom[xx];
      if (torsoTop[xx] < tt) tt = torsoTop[xx];
    }
    if (hb < 0 || tt >= 99 || tt <= hb) continue;
    for (let y = hb + 1; y < tt; y++) {
      const i = y * AV_W + x;
      // Keep the 1px dark chin and torso-crown ink; only leftover stickers are cleared.
      if (next[i] && next[i].kind === "sticker") next[i] = null;
    }
  }
  return next;
}

function shaveTorsoCrownOutlines(buf) {
  // Keep shoulder ink; only clear stray collar ink in the 2px above the torso fill.
  const next = buf.slice();
  for (let x = 0; x < AV_W; x++) {
    let top = -1;
    for (let y = 0; y < AV_H; y++) {
      const p = buf[y * AV_W + x];
      if (isFill(p) && isTorsoish(p.kind)) { top = y; break; }
    }
    if (top < 0) continue;
    for (let y = Math.max(0, top - 2); y < top; y++) {
      const i = y * AV_W + x;
      if (next[i] && (next[i].kind === "sticker" || next[i].kind === "ink")) next[i] = null;
    }
  }
  return next;
}

function buildPalette(av) {
  const skin = tones(av.skin, true);
  const shirt = tones(av.shirt);
  const pants = tones(av.bottomColor);
  const hair = tones(av.hairColor, true);
  const shoe = shoePal(av.shoes);
  const acc = tones(av.headphoneColor || av.shirt || "#2a2a2e");
  const sole = (av.shoes === "gum" || av.shoes === "white") ? tones("#b08958", true) : tones("#1e1a18");
  return { skin, shirt, pants, hair, shoe, acc, sole, gold: tones("#c9a25a", true) };
}

/* ---------- geometry per view ---------- */
function headGeom(key) {
  // Big near-circle head, about half the figure height. Chin still overlaps the collar (~y=39).
  // Leave ~10px above the skull so buns, spikes, and a big afro puff can sit on the crown.
  if (key === "e") return { cx: 25, cy: 24.8, rx: 13.8, ry: 13.8 };
  if (key === "se") return { cx: 21.8, cy: 24.6, rx: 14.3, ry: 14.3 };
  if (key === "ne") return { cx: 23.6, cy: 24.6, rx: 14.4, ry: 14.4 };
  return { cx: 24, cy: 24.6, rx: 14.5, ry: 14.5 };
}

function neckX(view, upper) {
  const t = torsoBox(view.key);
  let x = t.cx;
  if (view.flip) x = AV_W - 1 - x;
  return x;
}

function shiftBufXY(buf, dx, dy) {
  dx = Math.round(dx || 0);
  dy = Math.round(dy || 0);
  if (!dx && !dy) return buf;
  const out = makeBuf();
  for (let y = 0; y < AV_H; y++) {
    const ny = y + dy;
    if (ny < 0 || ny >= AV_H) continue;
    for (let x = 0; x < AV_W; x++) {
      const nx = x + dx;
      if (nx < 0 || nx >= AV_W) continue;
      out[ny * AV_W + nx] = buf[y * AV_W + x];
    }
  }
  return out;
}

function blitBuf(dest, src) {
  // Painter's algorithm: later layers fully cover earlier ones.
  // Depth is only used while drawing inside a single layer, so a torso
  // ink pixel (depth 80) must never punch through the face (depth 40).
  for (let i = 0; i < src.length; i++) {
    if (src[i]) dest[i] = src[i];
  }
}

export function dirDelta(from, to) {
  let d = ((to - from) % 8 + 8) % 8;
  if (d > 4) d -= 8;
  return d;
}

export function stepDir(from, to, prefer = 1) {
  let d = dirDelta(from, to);
  if (d === 4 || d === -4) d = prefer >= 0 ? 4 : -4;
  if (d === 0) return ((from % 8) + 8) % 8;
  return (from + (d > 0 ? 1 : -1) + 8) % 8;
}

export function clampHeadDir(bodyDir, headDir, prefer = 1) {
  bodyDir = ((bodyDir % 8) + 8) % 8;
  headDir = ((headDir % 8) + 8) % 8;
  const d = dirDelta(bodyDir, headDir);
  if (Math.abs(d) <= 1) return headDir;
  return stepDir(bodyDir, headDir, prefer);
}

function resolvedDirs(flags) {
  const walk = Boolean(flags.walking) && !flags.sitting;
  const base = (walk && (flags.dirX || flags.dirY))
    ? facingIndex8(null, flags.dirX, flags.dirY)
    : facingIndex8(flags.facing, flags.dirX, flags.dirY);
  const bodyDir = flags.bodyDir != null ? ((flags.bodyDir % 8) + 8) % 8 : base;
  const headDir = clampHeadDir(bodyDir, flags.headDir != null ? flags.headDir : bodyDir);
  return { bodyDir, headDir, walk, base };
}


function drawJawLine(buf, g, pal, upper) {
  // 1px darker-skin contour on the lower silhouette only. Never paint a second
  // row (that read as a strap across the face). The chin stays a smooth curve.
  const cx = g.cx, cy = g.cy + upper + 0.4, rx = g.rx, ry = g.ry;
  const jaw = mix(pal.skin.sh || pal.skin.mid || pal.skin, rgb(52, 30, 24), 0.36);
  const y0 = Math.floor(cy + ry * 0.20);
  const y1 = Math.ceil(cy + ry + 2);
  const x0 = Math.floor(cx - rx - 2), x1 = Math.ceil(cx + rx + 2);
  const out = [[0, 1], [1, 1], [-1, 1], [1, 0], [-1, 0]];
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      if (x < 0 || y < 0 || x >= AV_W || y >= AV_H) continue;
      const p = buf[y * AV_W + x];
      if (!p || !/^skin-head|^skin-face|^ear/.test(p.kind || "")) continue;
      let outward = false;
      for (const [dx, dy] of out) {
        const xx = x + dx, yy = y + dy;
        if (xx < 0 || yy < 0 || xx >= AV_W || yy >= AV_H) { outward = true; break; }
        const n = buf[yy * AV_W + xx];
        if (!n || n.kind === "ink" || n.kind === "sticker" || n.kind === "shadow") { outward = true; break; }
      }
      if (!outward) continue;
      plot(buf, x, y, jaw, "skin-jaw", 51);
    }
  }
}

function drawHead(buf, key, pal, upper, emote) {
  const g = headGeom(key);
  const cy = g.cy + upper;
  const flat = { shade: "flat" };
  // True circle (rx == ry, no flatten) so the jaw and cheeks stay a smooth curve.
  ellipse(buf, g.cx, cy + 0.4, g.rx, g.ry, pal.skin, "skin-head", 40, flat);
  drawJawLine(buf, g, pal, upper);
  if (key === "s") {
    ellipse(buf, g.cx - g.rx + 1, cy + 2.2, 2.8, 3.4, pal.skin, "ear", 35, flat);
    ellipse(buf, g.cx + g.rx - 1, cy + 2.2, 2.8, 3.4, pal.skin, "ear", 35, flat);
  } else if (key === "se") {
    ellipse(buf, g.cx - g.rx + 1.4, cy + 2.2, 2.7, 3.3, pal.skin, "ear", 35, flat);
    ellipse(buf, g.cx + g.rx - 0.6, cy + 1.8, 2.6, 3.1, pal.skin, "ear", 34, flat);
  } else if (key === "e") {
    ellipse(buf, g.cx - 2, cy + 1.8, 2.7, 3.3, pal.skin, "ear", 34, flat);
  } else if (key === "n") {
    ellipse(buf, g.cx - g.rx + 1, cy + 2.2, 2.8, 3.4, pal.skin, "ear", 35, flat);
    ellipse(buf, g.cx + g.rx - 1, cy + 2.2, 2.8, 3.4, pal.skin, "ear", 35, flat);
  } else if (key === "ne") {
    ellipse(buf, g.cx - g.rx + 0.6, cy + 1.8, 2.6, 3.1, pal.skin, "ear", 34, flat);
    ellipse(buf, g.cx + g.rx - 1.4, cy + 2.2, 2.7, 3.3, pal.skin, "ear", 35, flat);
  }
}

function clearFaceWindow(buf, key, pal, upper) {
  if (key === "n" || key === "ne") return;
  const g = headGeom(key);
  const cy = g.cy + upper;
  const flat = { shade: "flat" };
  ellipse(buf, g.cx + (key === "e" ? 2.4 : 0), cy + g.ry * 0.28, g.rx * (key === "e" ? 0.74 : 0.80), g.ry * 0.58, pal.skin, "skin-face", 48, flat);
}

function drawFace(buf, key, pal, upper, emote) {
  if (key === "n" || key === "ne") return;
  const g = headGeom(key);
  const cy = g.cy + upper;
  const crying = emote === "cry";
  const anchors = eyeAnchors(key, upper, false);
  if (crying) {
    for (const a of anchors) {
      rect(buf, a.x - 0.5, a.y + 4, a.x + 0.5, a.y + 9, TEAR, "tear", 55);
    }
  }
  if (emote === "laugh") {
    ellipse(buf, key === "e" ? g.cx + 4 : g.cx, cy + g.ry * 0.54, 1.6, 1.2, rgb(90, 40, 40), "mouth", 54, { shade: "flat" });
  } else if (emote === "cry") {
    ellipse(buf, key === "e" ? g.cx + 4 : g.cx, cy + g.ry * 0.55, 1.2, 0.8, rgb(120, 70, 70), "mouth", 54, { shade: "flat" });
  }
}

function eyeAnchors(key, upper, flip) {
  if (key === "n" || key === "ne") return [];
  const g = headGeom(key);
  // Lower half of the big head; 3/4 keeps a dominant near-side eye.
  const eyeY = g.cy + upper + g.ry * 0.36;
  let pts;
  if (key === "e") pts = [{ x: g.cx + 4.4, y: eyeY }];
  else if (key === "se") pts = [{ x: g.cx - 4.2, y: eyeY }, { x: g.cx + 8.4, y: eyeY }];
  else pts = [{ x: g.cx - 7.4, y: eyeY }, { x: g.cx + 7.4, y: eyeY }];
  if (flip) pts = pts.map((p) => ({ x: AV_W - 1 - p.x, y: p.y }));
  return pts;
}

// ~5x7 tall rounded ovals, very dark brown/black.
const EYE_INK = rgb(22, 14, 12);
const EYE_HI = rgb(255, 255, 255);
const BLUSH = rgb(232, 150, 156);
const EYE_OPEN = [
  [-1, -3], [0, -3], [1, -3],
  [-2, -2], [-1, -2], [0, -2], [1, -2], [2, -2],
  [-2, -1], [-1, -1], [0, -1], [1, -1], [2, -1],
  [-2,  0], [-1,  0], [0,  0], [1,  0], [2,  0],
  [-2,  1], [-1,  1], [0,  1], [1,  1], [2,  1],
  [-2,  2], [-1,  2], [0,  2], [1,  2], [2,  2],
  [-1,  3], [0,  3], [1,  3],
];
const EYE_HALF = [
  [-1, -1], [0, -1], [1, -1],
  [-2,  0], [-1,  0], [0,  0], [1,  0], [2,  0],
  [-2,  1], [-1,  1], [0,  1], [1,  1], [2,  1],
];
const EYE_CLOSED = [
  [-3, -1], [-2, 0], [-1, 1], [0, 1], [1, 1], [2, 0], [3, -1],
];

function stampEye(buf, cx, cy, blink) {
  const x = Math.round(cx), y = Math.round(cy);
  const mode = blink || "open";
  const pat = mode === "closed" ? EYE_CLOSED : mode === "half" ? EYE_HALF : EYE_OPEN;
  for (const [dx, dy] of pat) plot(buf, x + dx, y + dy, EYE_INK, "eye", 54);
  if (mode === "open") {
    // 2px white highlight at top-left, 1px sparkle at bottom-right.
    plotInside(buf, x - 1, y - 2, EYE_HI, "eye-hi", 55);
    plotInside(buf, x, y - 2, EYE_HI, "eye-hi", 55);
    plotInside(buf, x, y - 1, rgb(150, 200, 230), "eye-blue", 55);
    plotInside(buf, x + 1, y + 2, EYE_HI, "eye-spark", 55);
  }
}

function stampBlush(buf, cx, cy, side) {
  const x = Math.round(cx), y = Math.round(cy) + 5;
  const dir = side >= 0 ? 1 : -1;
  plot(buf, x + dir, y, BLUSH, "blush", 50);
  plot(buf, x + dir * 2, y, BLUSH, "blush", 50);
  plot(buf, x + dir, y + 1, BLUSH, "blush", 50);
}

function drawEyes(buf, key, upper, flip, flags, emote) {
  if (key === "n" || key === "ne") return;
  const closedEmote = emote === "laugh" || emote === "dance";
  const blink = closedEmote ? "closed" : (flags.blink || "open");
  const lookX = closedEmote ? 0 : (flags.lookX || 0);
  const lookY = closedEmote ? 0 : (flags.lookY || 0);
  const anchors = eyeAnchors(key, upper, flip);
  const g = headGeom(key);
  const midX = flip ? AV_W - 1 - g.cx : g.cx;
  for (const a of anchors) {
    stampEye(buf, a.x + lookX, a.y + lookY, blink);
    stampBlush(buf, a.x, a.y, a.x >= midX ? 1 : -1);
  }
}

function hairScale(g) {
  return { sx: g.rx / 12.6, sy: g.ry / 12.0 };
}

function hairClumps(style, key) {
  const up = -Math.PI / 2;
  const styles = {
    short: [
      { dx: 0, dy: -6.2, len: 8.2, half: 3.0, ang: up },
      { dx: -4.2, dy: -5.4, len: 7.4, half: 2.8, ang: up - 0.48 },
      { dx: 4.2, dy: -5.4, len: 7.4, half: 2.8, ang: up + 0.48 },
      { dx: -7.6, dy: -2.8, len: 6.4, half: 2.6, ang: up - 0.95 },
      { dx: 7.6, dy: -2.8, len: 6.4, half: 2.6, ang: up + 0.95 },
      { dx: -9.0, dy: 0.8, len: 5.2, half: 2.5, ang: Math.PI },
      { dx: 9.0, dy: 0.8, len: 5.2, half: 2.5, ang: 0 },
    ],
    spiky: [
      { dx: 0, dy: -6.5, len: 10.2, half: 2.5, ang: up },
      { dx: -3.6, dy: -6.0, len: 9.2, half: 2.4, ang: up - 0.32 },
      { dx: 3.6, dy: -6.0, len: 9.2, half: 2.4, ang: up + 0.32 },
      { dx: -7.0, dy: -4.2, len: 8.0, half: 2.3, ang: up - 0.7 },
      { dx: 7.0, dy: -4.2, len: 8.0, half: 2.3, ang: up + 0.7 },
      { dx: -9.2, dy: -1.2, len: 6.2, half: 2.3, ang: up - 1.15 },
      { dx: 9.2, dy: -1.2, len: 6.2, half: 2.3, ang: up + 1.15 },
      { dx: -9.4, dy: 2.0, len: 4.8, half: 2.2, ang: Math.PI },
      { dx: 9.4, dy: 2.0, len: 4.8, half: 2.2, ang: 0 },
    ],
    bangs: [
      { dx: 0, dy: -6.0, len: 8.0, half: 2.8, ang: up },
      { dx: -4.4, dy: -5.2, len: 7.2, half: 2.6, ang: up - 0.5 },
      { dx: 4.4, dy: -5.2, len: 7.2, half: 2.6, ang: up + 0.5 },
      { dx: -8.4, dy: -2.4, len: 6.0, half: 2.4, ang: up - 1.0 },
      { dx: 8.4, dy: -2.4, len: 6.0, half: 2.4, ang: up + 1.0 },
      { dx: -9.2, dy: 1.2, len: 5.0, half: 2.3, ang: Math.PI },
      { dx: 9.2, dy: 1.2, len: 5.0, half: 2.3, ang: 0 },
      { dx: -3.4, dy: -1.0, len: 5.8, half: 2.1, ang: Math.PI * 0.58, fringe: true },
      { dx: 0.6, dy: -1.4, len: 5.2, half: 2.0, ang: Math.PI * 0.5, fringe: true },
      { dx: 4.0, dy: -1.0, len: 5.8, half: 2.1, ang: Math.PI * 0.42, fringe: true },
    ],
    curly: [
      { dx: 0, dy: -6.4, len: 6.6, half: 3.4, ang: up, rounded: true },
      { dx: -5.2, dy: -5.4, len: 6.2, half: 3.2, ang: up - 0.55, rounded: true },
      { dx: 5.2, dy: -5.4, len: 6.2, half: 3.2, ang: up + 0.55, rounded: true },
      { dx: -8.6, dy: -2.0, len: 5.4, half: 3.0, ang: up - 1.05, rounded: true },
      { dx: 8.6, dy: -2.0, len: 5.4, half: 3.0, ang: up + 1.05, rounded: true },
      { dx: -9.2, dy: 2.2, len: 4.8, half: 2.8, ang: Math.PI, rounded: true },
      { dx: 9.2, dy: 2.2, len: 4.8, half: 2.8, ang: 0, rounded: true },
    ],
    bun: [
      { dx: 0, dy: -5.6, len: 7.0, half: 2.8, ang: up },
      { dx: -4.6, dy: -4.6, len: 6.2, half: 2.5, ang: up - 0.55 },
      { dx: 4.6, dy: -4.6, len: 6.2, half: 2.5, ang: up + 0.55 },
      { dx: -8.4, dy: -1.4, len: 5.0, half: 2.4, ang: up - 1.05 },
      { dx: 8.4, dy: -1.4, len: 5.0, half: 2.4, ang: up + 1.05 },
    ],
    long: [
      { dx: 0, dy: -6.2, len: 8.0, half: 2.9, ang: up },
      { dx: -4.2, dy: -5.4, len: 7.2, half: 2.7, ang: up - 0.5 },
      { dx: 4.2, dy: -5.4, len: 7.2, half: 2.7, ang: up + 0.5 },
      { dx: -7.8, dy: -2.6, len: 6.2, half: 2.5, ang: up - 0.95 },
      { dx: 7.8, dy: -2.6, len: 6.2, half: 2.5, ang: up + 0.95 },
      { dx: -9.0, dy: 0.8, len: 5.0, half: 2.4, ang: Math.PI },
      { dx: 9.0, dy: 0.8, len: 5.0, half: 2.4, ang: 0 },
    ],
    undercut: [
      { dx: 0, dy: -6.6, len: 9.6, half: 2.6, ang: up },
      { dx: -3.8, dy: -6.0, len: 8.6, half: 2.4, ang: up - 0.36 },
      { dx: 3.8, dy: -6.0, len: 8.6, half: 2.4, ang: up + 0.36 },
      { dx: -6.8, dy: -3.8, len: 7.0, half: 2.2, ang: up - 0.75 },
      { dx: 6.8, dy: -3.8, len: 7.0, half: 2.2, ang: up + 0.75 },
    ],
    frosted: [
      { dx: 0, dy: -6.6, len: 11.0, half: 2.4, ang: up, frost: true },
      { dx: -3.4, dy: -6.0, len: 10.0, half: 2.3, ang: up - 0.3, frost: true },
      { dx: 3.4, dy: -6.0, len: 10.0, half: 2.3, ang: up + 0.3, frost: true },
      { dx: -6.8, dy: -4.0, len: 8.4, half: 2.2, ang: up - 0.68, frost: true },
      { dx: 6.8, dy: -4.0, len: 8.4, half: 2.2, ang: up + 0.68, frost: true },
      { dx: -9.0, dy: -1.0, len: 6.0, half: 2.1, ang: up - 1.15, frost: true },
      { dx: 9.0, dy: -1.0, len: 6.0, half: 2.1, ang: up + 1.15, frost: true },
    ],
    buzz: [
      { dx: 0, dy: -5.0, len: 3.2, half: 3.6, ang: up, rounded: true },
      { dx: -5.4, dy: -3.2, len: 2.6, half: 3.0, ang: up - 0.7, rounded: true },
      { dx: 5.4, dy: -3.2, len: 2.6, half: 3.0, ang: up + 0.7, rounded: true },
    ],
    swoop: [
      { dx: 0, dy: -5.8, len: 7.4, half: 2.8, ang: up },
      { dx: -4.0, dy: -5.0, len: 6.6, half: 2.5, ang: up - 0.45 },
      { dx: 4.6, dy: -5.2, len: 7.0, half: 2.6, ang: up + 0.4 },
      { dx: -8.2, dy: -2.0, len: 5.4, half: 2.4, ang: up - 1.0 },
      { dx: 8.6, dy: -1.6, len: 5.2, half: 2.3, ang: 0 },
      { dx: -1.2, dy: 0.2, len: 7.8, half: 2.3, ang: Math.PI * 0.62, fringe: true },
      { dx: 2.8, dy: 0.6, len: 8.4, half: 2.4, ang: Math.PI * 0.42, fringe: true },
      { dx: 6.0, dy: 1.0, len: 7.0, half: 2.1, ang: Math.PI * 0.28, fringe: true },
    ],
    cornrows: [
      { dx: -3.6, dy: -6.2, len: 6.6, half: 1.3, ang: up },
      { dx: 0, dy: -6.4, len: 7.0, half: 1.3, ang: up },
      { dx: 3.6, dy: -6.2, len: 6.6, half: 1.3, ang: up },
      { dx: -6.6, dy: -4.0, len: 5.4, half: 1.2, ang: up - 0.35 },
      { dx: 6.6, dy: -4.0, len: 5.4, half: 1.2, ang: up + 0.35 },
      { dx: -8.4, dy: 0.4, len: 4.0, half: 1.3, ang: Math.PI },
      { dx: 8.4, dy: 0.4, len: 4.0, half: 1.3, ang: 0 },
    ],
    shaggy: [
      { dx: 0, dy: -6.0, len: 8.0, half: 2.6, ang: up },
      { dx: -3.0, dy: -5.8, len: 9.2, half: 2.2, ang: up - 0.22 },
      { dx: 4.2, dy: -5.4, len: 8.6, half: 2.4, ang: up + 0.38 },
      { dx: -6.8, dy: -3.4, len: 7.4, half: 2.3, ang: up - 0.8 },
      { dx: 7.6, dy: -2.8, len: 6.8, half: 2.2, ang: up + 0.9 },
      { dx: -9.0, dy: 0.6, len: 5.6, half: 2.3, ang: Math.PI },
      { dx: 9.2, dy: 1.2, len: 5.8, half: 2.4, ang: 0 },
      { dx: -2.6, dy: -0.4, len: 5.6, half: 2.0, ang: Math.PI * 0.58, fringe: true },
      { dx: 3.4, dy: 0.2, len: 5.0, half: 1.9, ang: Math.PI * 0.4, fringe: true },
    ],
    ponytail: [
      { dx: -4.2, dy: -3.6, len: 4.4, half: 2.2, ang: up - 0.7 },
      { dx: 4.2, dy: -3.6, len: 4.4, half: 2.2, ang: up + 0.7 },
      { dx: -7.6, dy: -0.6, len: 4.2, half: 2.1, ang: up - 1.1 },
      { dx: 7.6, dy: -0.6, len: 4.2, half: 2.1, ang: up + 1.1 },
    ],
    spacebuns: [
      { dx: -5.4, dy: -3.2, len: 4.0, half: 2.2, ang: up - 0.8 },
      { dx: 5.4, dy: -3.2, len: 4.0, half: 2.2, ang: up + 0.8 },
      { dx: -8.0, dy: 0.2, len: 4.2, half: 2.2, ang: Math.PI },
      { dx: 8.0, dy: 0.2, len: 4.2, half: 2.2, ang: 0 },
    ],
    straightbangs: [
      { dx: 0, dy: -6.0, len: 7.6, half: 2.8, ang: up },
      { dx: -4.4, dy: -5.2, len: 6.8, half: 2.5, ang: up - 0.5 },
      { dx: 4.4, dy: -5.2, len: 6.8, half: 2.5, ang: up + 0.5 },
      { dx: -8.2, dy: -2.2, len: 5.6, half: 2.4, ang: up - 1.0 },
      { dx: 8.2, dy: -2.2, len: 5.6, half: 2.4, ang: up + 1.0 },
      { dx: -4.4, dy: -0.4, len: 6.0, half: 2.0, ang: Math.PI * 0.55, fringe: true },
      { dx: 0, dy: -0.8, len: 5.6, half: 2.0, ang: Math.PI * 0.5, fringe: true },
      { dx: 4.4, dy: -0.4, len: 6.0, half: 2.0, ang: Math.PI * 0.45, fringe: true },
    ],
    afropuff: [
      { dx: 0, dy: -7.4, len: 8.4, half: 4.6, ang: up, rounded: true },
      { dx: -5.4, dy: -6.0, len: 7.2, half: 4.0, ang: up - 0.55, rounded: true },
      { dx: 5.4, dy: -6.0, len: 7.2, half: 4.0, ang: up + 0.55, rounded: true },
      { dx: -8.4, dy: -2.2, len: 5.6, half: 3.4, ang: up - 1.05, rounded: true },
      { dx: 8.4, dy: -2.2, len: 5.6, half: 3.4, ang: up + 1.05, rounded: true },
    ],
    bobclips: [
      { dx: 0, dy: -5.8, len: 7.0, half: 3.0, ang: up },
      { dx: -4.8, dy: -4.8, len: 6.6, half: 2.8, ang: up - 0.55 },
      { dx: 4.8, dy: -4.8, len: 6.6, half: 2.8, ang: up + 0.55 },
      { dx: -8.6, dy: -1.0, len: 7.2, half: 2.6, ang: Math.PI * 0.85 },
      { dx: 8.6, dy: -1.0, len: 7.2, half: 2.6, ang: Math.PI * 0.15 },
      { dx: -3.0, dy: -0.6, len: 5.0, half: 2.0, ang: Math.PI * 0.55, fringe: true },
      { dx: 3.0, dy: -0.6, len: 5.0, half: 2.0, ang: Math.PI * 0.45, fringe: true },
    ],
  };
  let clumps = styles[style] || styles.short;
  if (key === "e") {
    clumps = clumps.map((c) => ({ ...c, dx: c.dx * 0.52 + 2.2, dy: c.dy }));
  } else if (key === "se" || key === "ne") {
    clumps = clumps.map((c) => ({ ...c, dx: c.dx * 0.9 - 1, dy: c.dy }));
  }
  if (key === "n" || key === "ne") {
    clumps = clumps.filter((c) => !c.fringe);
    if (!["buzz", "cornrows", "ponytail", "spacebuns", "afropuff"].includes(style)) {
      clumps = clumps.concat([
        { dx: -3.2, dy: 1.4, len: 7.0, half: 2.8, ang: Math.PI * 0.5 },
        { dx: 3.2, dy: 1.4, len: 7.0, half: 2.8, ang: Math.PI * 0.5 },
        { dx: 0, dy: 0.6, len: 6.4, half: 3.0, ang: Math.PI * 0.5 },
      ]);
    }
  }
  return clumps;
}

function drawHairUnderHat(buf, av, key, pal, g, cy) {
  // Tight scalp only — nothing tall enough to poke through the crown of the hat.
  const { sx, sy } = hairScale(g);
  ellipse(buf, g.cx, cy - 2.4, g.rx * 0.92, g.ry * 0.55, pal.hair, "hair-cap", 44, { shade: "flat" });
  const style = av.hair;
  const showSides = ["shaggy", "long", "straightbangs", "bobclips", "swoop", "ponytail"].includes(style);
  if (showSides) {
    for (const c of hairClumps(style, key)) {
      if (c.fringe) continue;
      const side = Math.abs(Math.cos(c.ang)) > 0.72 && c.dy > -3.2;
      if (!side) continue;
      stampSpike(buf, g.cx + c.dx * sx, cy + c.dy * sy, Math.min(c.len * sy, 6.4), c.half * sx, c.ang, pal.hair, "hair", 45, Boolean(c.rounded));
    }
  }
  if (["straightbangs", "swoop", "bobclips", "shaggy", "long"].includes(style) && key !== "n" && key !== "ne") {
    for (const c of hairClumps(style, key)) {
      if (!c.fringe) continue;
      stampSpike(buf, g.cx + c.dx * sx, cy + c.dy * sy, c.len * sy, c.half * sx, c.ang, pal.hair, "hair", 45, Boolean(c.rounded));
    }
  }
}

function drawHair(buf, av, key, pal, upper, hatOn) {
  const g = headGeom(key);
  const cy = g.cy + upper;
  const { sx, sy } = hairScale(g);
  if (hatOn) {
    drawHairUnderHat(buf, av, key, pal, g, cy);
  } else {
  const style = av.hair;
  // Tight scalp for special styles so buns/puff can sit separately on top. No connecting cap.
  if (style === "spacebuns") {
    // Scalp only — stays above the forehead so no hair color lands on the face.
    ellipse(buf, g.cx, cy - g.ry * 0.52, g.rx * 0.82, g.ry * 0.30, pal.hair, "hair-cap", 44, { shade: "flat" });
  } else if (style === "afropuff") {
    ellipse(buf, g.cx, cy - g.ry * 0.16, g.rx * 0.72, g.ry * 0.36, pal.hair, "hair-cap", 44, { shade: "flat" });
  } else {
    // Helmet cap hugs the skull so there is no gap between hair and head.
    ellipse(buf, g.cx, cy - 0.6, g.rx * 1.02, g.ry * 0.90, pal.hair, "hair-cap", 44, { shade: "flat" });
    for (const c of hairClumps(style, key)) {
      stampSpike(buf, g.cx + c.dx * sx, cy + c.dy * sy, c.len * sy, c.half * sx, c.ang, pal.hair, "hair", 45, Boolean(c.rounded));
    }
  }
  } // end no-hat cap/clumps
  if (!hatOn && av.hair === "bun") {
    const bx = (key === "e" ? 4 : 11) * sx;
    stampSpike(buf, g.cx - (key === "e" ? 0 : bx), cy + 2 * sy, 3.2 * sy, 3.2 * sx, Math.PI, pal.hair, "hair-bun", 46, true);
    stampSpike(buf, g.cx + bx, cy + 2 * sy, 3.2 * sy, 3.2 * sx, 0, pal.hair, "hair-bun", 46, true);
  }
  if (av.hair === "long" || av.hair === "straightbangs") {
    // Locks fall behind the shoulders, not off the skull.
    if (key === "e") {
      stampSpike(buf, g.cx - g.rx * 0.42, cy + g.ry * 0.28, 16, 3.4, Math.PI * 0.52, pal.hair, "hair-lock", 43, true);
    } else {
      const lx = g.rx * 0.78;
      stampSpike(buf, g.cx - lx, cy + g.ry * 0.22, 16, 3.5, Math.PI * 0.55, pal.hair, "hair-lock", 43, true);
      stampSpike(buf, g.cx + lx, cy + g.ry * 0.22, 16, 3.5, Math.PI * 0.45, pal.hair, "hair-lock", 43, true);
    }
  }
  if (!hatOn && av.hair === "frosted") {
    const tip = { hi: rgb(255, 248, 220), mid: rgb(243, 229, 194), sh: rgb(210, 190, 150) };
    for (const c of hairClumps("frosted", key)) {
      const tx = g.cx + c.dx * sx + Math.cos(c.ang) * (c.len * sy * 0.62);
      const ty = cy + c.dy * sy + Math.sin(c.ang) * (c.len * sy * 0.62);
      stampSpike(buf, tx, ty, c.len * sy * 0.42, Math.max(1.4, c.half * sx * 0.7), c.ang, tip, "hair-tip", 46, false);
    }
  }
  if (!hatOn && av.hair === "spacebuns") {
    const rad = 3.2;
    // Perch on the crown, fully above the forehead. Keep a 1px margin at the top for ink.
    const skullTop = cy - g.ry;
    const by = Math.max(rad + 1.2, skullTop - rad + 2.0);
    function bun(bx, by0, kind) {
      egg(buf, bx, by0, rad, rad, pal.hair, kind, 47, { widen: 0 });
      const ink = mix(pal.hair.mid || pal.hair, rgb(32, 18, 16), 0.55);
      for (let a = 0; a < 16; a++) {
        const ang = (a / 16) * Math.PI * 2;
        plot(buf, Math.round(bx + Math.cos(ang) * (rad + 0.2)), Math.round(by0 + Math.sin(ang) * (rad + 0.2)), ink, "hair-bun-ink", 48);
      }
    }
    if (key === "e") {
      bun(g.cx + 2.4, by + 0.3, "hair-bun");
      bun(g.cx - 5.6, by, "hair-bun-far");
    } else {
      const sep = (key === "se" || key === "ne" ? 7.4 : 8.6) * (g.rx / 12.6);
      bun(g.cx - sep, by, "hair-bun");
      bun(g.cx + sep, by, "hair-bun");
      // Skin part only on the scalp between the buns, never down the face.
      const partTop = Math.max(skullTop + 1, by + 1);
      const partBot = cy - g.ry * 0.42;
      if (partBot > partTop) rect(buf, g.cx - 1.0, partTop, g.cx + 1.0, partBot, pal.skin, "part", 49);
    }
  }
  if (av.hair === "ponytail") {
    const tie = rgb(36, 22, 28);
    const tieHi = rgb(110, 64, 74);
    let tx, ty, ang;
    if (key === "e") {
      tx = g.cx - g.rx * 0.42; ty = cy - g.ry * 0.58; ang = Math.PI * 0.82;
    } else if (key === "n" || key === "ne") {
      tx = g.cx + (key === "ne" ? -2 : 2); ty = cy - g.ry * 0.64; ang = -Math.PI / 2 + 0.2;
    } else if (key === "se") {
      tx = g.cx - g.rx * 0.32; ty = cy - g.ry * 0.64; ang = -Math.PI / 2 - 0.65;
    } else {
      // Front: tie on the crown, tail hangs down behind the head (not a horn).
      tx = g.cx + g.rx * 0.16; ty = cy - g.ry * 0.55; ang = Math.PI * 0.72;
    }
    if (hatOn) {
      // Exit from under the back of the hat, never up through the crown.
      if (key === "n" || key === "ne") {
        ty = cy - g.ry * 0.12;
        ang = Math.PI * 0.62;
      } else if (key === "e") {
        ty = cy - g.ry * 0.22;
        ang = Math.PI * 0.82;
      } else if (key === "se") {
        ty = cy - g.ry * 0.22;
        ang = Math.PI * 0.72;
      } else {
        ty = cy - g.ry * 0.22;
        ang = -Math.PI / 2 + 1.15;
      }
    }
    const tailDepth = (!hatOn && key === "s") ? 36 : 46;
    stampSpike(buf, tx, ty, key === "s" && !hatOn ? 15 : 13, 3.1, ang, pal.hair, "hair-tail", tailDepth, true);
    stampSpike(buf, tx, ty, key === "s" && !hatOn ? 12 : 10, 2.2, ang + 0.18, pal.hair, "hair-tail", tailDepth, true);
    ellipse(buf, tx, ty, 2.5, 2.1, tie, "hair-tie", 48, { shade: "flat" });
    plot(buf, Math.round(tx), Math.round(ty) - 1, tieHi, "hair-tie", 49);
  }
  if (!hatOn && av.hair === "afropuff") {
    const px = g.cx + (key === "e" ? 1.4 : 0);
    // Big round fluffy puff sitting on the crown, wider than the head, top kept in-sprite.
    const skullTop = cy - g.ry;
    const pry = 11.6;
    const prx = key === "e" ? 12.2 : 16.2;
    const py = Math.max(pry + 1.3, skullTop + 1.0);
    egg(buf, px, py, prx, pry, pal.hair, "hair-puff", 46, { widen: 0.04, flatten: 0.06 });
    const n = 18;
    for (let i = 0; i < n; i++) {
      const ang = (i / n) * Math.PI * 2 - Math.PI / 2;
      const bx = px + Math.cos(ang) * (prx * 0.86);
      const by = py + Math.sin(ang) * (pry * 0.86);
      const r = 2.6 + (i % 3) * 0.6;
      ellipse(buf, bx, by, r * 1.15, r, pal.hair, "hair-puff", 47);
    }
    const hi = pal.hair.hi || pal.hair;
    ellipse(buf, px - prx * 0.30, py - pry * 0.32, 4.2, 3.6, hi, "hair-puff-hi", 48, { shade: "flat" });
    ellipse(buf, px - prx * 0.06, py - pry * 0.50, 3.2, 2.8, hi, "hair-puff-hi", 48, { shade: "flat" });
    ellipse(buf, px + prx * 0.24, py - pry * 0.20, 3.0, 2.6, hi, "hair-puff-hi", 48, { shade: "flat" });
    ellipse(buf, g.cx, skullTop + 3.2, 5.6, 1.8, pal.hair.sh || pal.hair, "hair-band", 49, { shade: "flat" });
  }
  if (av.hair === "bobclips") {
    const pink = rgb(255, 90, 160);
    const cyan = rgb(80, 200, 255);
    function clip(x, y, col) {
      const cx0 = Math.round(x), cy0 = Math.round(y);
      plot(buf, cx0, cy0, col, "clip", 48);
      plot(buf, cx0 + 1, cy0, col, "clip", 48);
      plot(buf, cx0, cy0 + 1, col, "clip", 48);
      plot(buf, cx0 + 1, cy0 + 1, col, "clip", 48);
      plotInside(buf, cx0 + 1, cy0 - 1, rgb(255, 255, 255), "clip-hi", 49);
    }
    if (key === "n" || key === "ne") {
      clip(g.cx - g.rx * 0.52, cy - 1, pink);
      clip(g.cx + g.rx * 0.48, cy - 1, cyan);
    } else if (key === "e") {
      clip(g.cx + g.rx * 0.44, cy + 1.4, pink);
    } else {
      clip(g.cx - g.rx * 0.54, cy + 1.4, pink);
      clip(g.cx + g.rx * 0.50, cy + 1.4, cyan);
    }
  }
  if (!hatOn && av.hair === "buzz") {
    ellipse(buf, g.cx, cy - 2.6, g.rx * 0.90, g.ry * 0.56, pal.hair.sh || pal.hair, "hair-buzz", 44, { shade: "flat" });
  }
}

function drawHat(buf, av, key, pal, upper) {
  const g = headGeom(key);
  const cy = g.cy + upper;
  // Sit on the skull, not floating above it.
  const crown = cy - g.ry + 2.0;
  const acc = pal.acc;
  const kind = av.accessory;
  if (kind === "beanie") {
    ellipse(buf, g.cx, crown + 5.0, g.rx * 1.04, 7.6, acc, "hat", 55);
    ellipse(buf, g.cx, crown + 2.4, g.rx * 0.80, 4.0, acc, "hat", 56);
    ellipse(buf, g.cx, crown + 8.4, g.rx * 1.06, 2.2, acc.sh || acc, "hat-cuff", 57);
    circle(buf, g.cx + (key === "e" ? 1 : 0), crown - 1.0, 2.0, acc, "hat-pom", 58);
  } else if (kind === "cap" || kind === "trucker" || kind === "fitted") {
    const tight = kind === "fitted";
    const capRy = tight ? 5.0 : 5.6;
    ellipse(buf, g.cx, crown + 4.2, g.rx * (tight ? 0.98 : 1.02), capRy, acc, "hat", 55);
    if (kind === "trucker" && key !== "n") {
      ellipse(buf, g.cx + (key === "e" ? 2.4 : 0), crown + 4.6, g.rx * 0.64, 3.4, acc.hi || acc, "hat-panel", 56);
    }
    const brimH = tight ? 1.25 : 1.6;
    const brimY = crown + capRy + 1.5;
    if (key === "e") {
      ellipse(buf, g.cx + 8.4, brimY - 0.2, 6.8, brimH + 0.15, acc, "hat-brim", 57);
    } else if (key === "se") {
      ellipse(buf, g.cx + 5.6, brimY, 7.2, brimH, acc, "hat-brim", 57);
    } else if (key === "ne") {
      ellipse(buf, g.cx - 5.2, brimY, 6.0, brimH * 0.85, acc, "hat-brim", 54);
    } else if (key === "n") {
      ellipse(buf, g.cx, crown + capRy + 0.5, g.rx * 0.86, 1.15, acc.sh || acc, "hat-back", 54);
    } else {
      // Front: brim toward the camera, a wide thin bill under the crown.
      ellipse(buf, g.cx, brimY, g.rx * 0.98, brimH, acc, "hat-brim", 57);
    }
    if (kind === "fitted") {
      plotInside(buf, Math.round(g.cx + (key === "e" ? 2 : 0)), Math.round(crown + 2.8), rgb(255, 240, 200), "hat-logo", 58);
    }
  } else if (kind === "bucket") {
    ellipse(buf, g.cx, crown + 4.4, g.rx * 0.98, 5.2, acc, "hat", 55);
    ellipse(buf, g.cx, crown + 8.6, g.rx * 1.30, 2.5, acc, "hat-brim", 56);
    ellipse(buf, g.cx, crown + 7.6, g.rx * 1.00, 1.2, acc.sh || acc, "hat-brim-in", 56, { shade: "flat" });
  }
}

function drawHairPeeks(buf, av, key, pal, upper) {
  // Bangs and forehead fringe belong in front of the hat brim, never on the crown.
  if (key === "n" || key === "ne") return;
  const style = av.hair;
  if (!["straightbangs", "swoop", "bobclips", "shaggy", "long"].includes(style)) return;
  const g = headGeom(key);
  const cy = g.cy + upper;
  const { sx, sy } = hairScale(g);
  for (const c of hairClumps(style, key)) {
    if (!c.fringe) continue;
    stampSpike(buf, g.cx + c.dx * sx, cy + c.dy * sy, c.len * sy, c.half * sx, c.ang, pal.hair, "hair-peek", 62, Boolean(c.rounded));
  }
  if (style === "bobclips") {
    const pink = rgb(255, 90, 160), cyan = rgb(80, 200, 255);
    if (key === "e") plot(buf, Math.round(g.cx + g.rx * 0.44), Math.round(cy + 1.4), pink, "clip", 63);
    else {
      plot(buf, Math.round(g.cx - g.rx * 0.54), Math.round(cy + 1.4), pink, "clip", 63);
      plot(buf, Math.round(g.cx + g.rx * 0.50), Math.round(cy + 1.4), cyan, "clip", 63);
    }
  }
}

function ring(buf, cx, cy, rx, ry, color, kind, depth) {
  const rxi = Math.ceil(rx) + 1, ryi = Math.ceil(ry) + 1;
  for (let y = -ryi; y <= ryi; y++) {
    for (let x = -rxi; x <= rxi; x++) {
      const d = (x / rx) * (x / rx) + (y / ry) * (y / ry);
      if (d > 1.08 || d < 0.62) continue;
      plot(buf, Math.round(cx + x), Math.round(cy + y), color, kind, depth);
    }
  }
}

function drawGlasses(buf, av, key, upper) {
  if (key === "n" || key === "ne") return;
  const tinted = av && (av.accessory === "shades");
  const frame = tinted ? rgb(40, 24, 48) : rgb(48, 36, 32);
  const lens = tinted ? rgb(72, 40, 80) : null;
  const anchors = eyeAnchors(key, upper, false);
  for (const a of anchors) {
    if (lens) ellipse(buf, a.x, a.y, 3.2, 3.6, lens, "lens", 55, { shade: "flat" });
    ring(buf, a.x, a.y, 4.0, 4.4, frame, "glasses", 56);
    if (tinted) plot(buf, Math.round(a.x) - 1, Math.round(a.y) - 2, rgb(255, 230, 240), "lens-hi", 57);
  }
  if (anchors.length === 2) {
    const left = anchors[0].x < anchors[1].x ? anchors[0] : anchors[1];
    const right = anchors[0].x < anchors[1].x ? anchors[1] : anchors[0];
    rect(buf, left.x + 3, left.y, right.x - 3, right.y, frame, "glasses", 56);
  }
}

function drawHeadphones(buf, av, key, pal, upper) {
  const g = headGeom(key);
  const cy = g.cy + upper;
  const acc = pal.acc;
  ellipse(buf, g.cx, cy - g.ry + 1.6, g.rx * 0.72, 3.4, acc, "hp-band", 58);
  if (key !== "e") {
    circle(buf, g.cx - g.rx + 1, cy + 2.0, 3.6, acc, "hp-cup", 58);
    circle(buf, g.cx + g.rx - 1, cy + 2.0, 3.6, acc, "hp-cup", 58);
  } else {
    circle(buf, g.cx - 2, cy + 1.6, 3.6, acc, "hp-cup", 58);
  }
}

/* Body / clothes / limbs */
function torsoBox(key, sit) {
  // Short squishy bean. The chin overlaps the top of the torso by a few pixels
  // so the round head sits on the shoulders, layered in front of the shirt.
  // Wider than it is tall, tucked onto the boots (~y=52).
  const y0 = 36;
  const h = 16;
  if (key === "e") return { cx: 25, y0, hw: 10.8, h };
  if (key === "se") return { cx: 22.6, y0, hw: 12.0, h };
  if (key === "ne") return { cx: 23.8, y0, hw: 12.1, h };
  return { cx: 24, y0, hw: 12.8, h };
}

function drawTorso(buf, av, key, pal, upper, sit, squash = 0) {
  const t = torsoBox(key, sit);
  const y0 = t.y0 + upper;
  // Pin the collar under the chin; squash widens and shortens the bean without breaking the overlap.
  const h = t.h * (1 - squash * 0.65);
  const cy = y0 + h * 0.50;
  const rx = (t.hw + (av.top === "oversized" ? 0.6 : 0)) * (1 + squash);
  const ry = h * 0.50;
  const topPal = pal.shirt;
  const shorts = av.bottom === "shorts";
  const skirt = av.bottom === "skirt";
  // One soft marshmallow: skin, then shirt, then a pants band at the bottom.
  squish(buf, t.cx, cy, rx, ry, pal.skin, "skin-body", 18);
  squish(buf, t.cx, cy, rx, ry, topPal, "top", 22);
  if (av.top === "babytee" || av.top === "crophoodie") {
    squish(buf, t.cx, cy, rx, ry, pal.skin, "midriff", 23, { minY: y0 + h * 0.62 });
  }
  const hemT = shorts ? 0.78 : skirt ? 0.68 : (av.top === "babytee" || av.top === "crophoodie" ? 0.72 : 0.58);
  squish(buf, t.cx, cy, rx, ry, pal.pants, skirt ? "skirt" : "pants", 24, { minY: y0 + h * hemT });
  // Subtle darker hem across the oval, not a light collar arc.
  const hemY = Math.round(y0 + h * hemT);
  for (let x = Math.round(t.cx - rx); x <= Math.round(t.cx + rx); x++) {
    const p = buf[hemY * AV_W + x];
    if (p && (p.kind === "pants" || p.kind === "skirt")) {
      plot(buf, x, hemY, pal.pants.sh || pal.pants.mid, "cuff", 25);
    }
  }

  if (av.top === "hoodie" || av.top === "ziphoodie" || av.top === "crophoodie") {
    ellipse(buf, t.cx, y0 + h * 0.62, rx * 0.62, 2.2, { hi: topPal.sh, mid: topPal.sh, sh: mix(topPal.sh, INK, 0.2) }, "pouch", 26);
    if (av.top === "ziphoodie") {
      rect(buf, t.cx - 0.6, y0 + 3, t.cx + 0.6, y0 + h * hemT - 1, pal.gold, "zip", 27);
    }
  }
  if (av.top === "jacket") {
    if (key !== "n") {
      rect(buf, t.cx - 1, y0 + 3, t.cx + 1, y0 + h * hemT - 1, pal.skin, "placket", 26);
      rect(buf, t.cx - 1.8, y0 + 3, t.cx - 0.6, y0 + h * hemT - 1, topPal.sh, "lapel", 27);
      rect(buf, t.cx + 0.6, y0 + 3, t.cx + 1.8, y0 + h * hemT - 1, topPal.sh, "lapel", 27);
    }
  }
  if (av.top === "bandtee") {
    const gx = key === "e" ? t.cx + 2 : t.cx;
    ellipse(buf, gx, y0 + 6, 2.6, 2.6, pal.gold, "graphic", 26);
  }
  if (av.top === "velour") {
    rect(buf, t.cx - 0.5, y0 + 4, t.cx + 0.5, y0 + h * hemT - 1, rgb(255, 240, 250), "stripe", 26);
  }
  if (av.top === "varsity") {
    ellipse(buf, t.cx, y0 + 6, 2.2, 2.2, pal.gold, "letter", 26);
  }
  if (av.top === "truckertee") {
    const gx = key === "e" ? t.cx + 2 : t.cx;
    rect(buf, gx - 3, y0 + 5, gx + 3, y0 + 8, rgb(255, 255, 255), "graphic", 26, 1);
  }
  if (av.top === "puffer") {
    for (let i = 0; i < 2; i++) {
      const qy = y0 + 4 + i * 3.2;
      for (let x = Math.round(t.cx - rx + 1); x <= Math.round(t.cx + rx - 1); x++) {
        const p = buf[Math.round(qy) * AV_W + x];
        if (p && p.kind === "top") plot(buf, x, Math.round(qy), topPal.sh || topPal.mid, "quilt", 26);
      }
    }
  }
  if (av.top === "polo" && key !== "n") {
    rect(buf, t.cx - 1, y0 + 3, t.cx + 1, y0 + 6, pal.skin, "placket", 26);
  }
  if (av.top === "jersey") {
    if (key !== "n") {
      rect(buf, t.cx - 1.6, y0 + 2, t.cx + 1.6, y0 + 5, pal.skin, "vneck", 25);
    }
    const gx = key === "e" ? t.cx + 2 : t.cx;
    rect(buf, gx - 2, y0 + 6, gx + 2, y0 + 9, rgb(255, 250, 240), "number", 26, 1);
  }
  if (av.accessory === "chain" && key !== "n") {
    ellipse(buf, t.cx, y0 + 4, 3.2, 1.8, pal.gold, "chain", 27);
  }
  if (av.accessory === "belt") {
    for (let x = Math.round(t.cx - rx); x <= Math.round(t.cx + rx); x++) {
      const p = buf[hemY * AV_W + x];
      if (p && (p.kind === "pants" || p.kind === "skirt" || p.kind === "cuff")) {
        plot(buf, x, hemY, pal.gold.mid || pal.gold, "belt", 27);
      }
    }
  }
}

function drawLegs(buf, av, key, pal, pose) {
  const sit = pose.sit;
  const t = torsoBox(key, sit);
  const hipY = t.y0 + t.h - 1;
  const ground = AV_GROUND_Y;
  const shorts = av.bottom === "shorts";
  const pants = pal.pants;
  if (sit) {
    // Tucked stubby legs, feet still near the ground.
    if (key === "e") {
      capsule(buf, t.cx, hipY, t.cx + 10, hipY + 4, 3.2, pants, "pants", 12);
      ellipse(buf, t.cx + 13, ground - 2, 5, 3.2, pal.shoe, "shoe", 14);
      ellipse(buf, t.cx + 13, ground, 5, 1.6, pal.sole, "sole", 13);
    } else {
      capsule(buf, t.cx - 5, hipY, t.cx - 8, hipY + 6, 3.4, pants, "pants", 12);
      capsule(buf, t.cx + 5, hipY, t.cx + 8, hipY + 6, 3.4, pants, "pants", 12);
      ellipse(buf, t.cx - 9, ground - 2, 5, 3.2, pal.shoe, "shoe", 14);
      ellipse(buf, t.cx + 9, ground - 2, 5, 3.2, pal.shoe, "shoe", 14);
      ellipse(buf, t.cx - 9, ground, 5, 1.6, pal.sole, "sole", 13);
      ellipse(buf, t.cx + 9, ground, 5, 1.6, pal.sole, "sole", 13);
    }
    return;
  }
  const L = pose.left, R = pose.right;
  function leg(side, foot) {
    const hipX = t.cx + side * (key === "e" ? 1.5 : 4.2);
    const footX = hipX + foot.dx;
    const footY = ground - foot.lift;
    const midY = (hipY + footY) / 2 + 1;
    const pantR = 3.3;
    const pantEnd = shorts ? hipY + 6 : footY - 5;
    if (shorts) capsule(buf, hipX, pantEnd, footX, footY - 5, 2.5, pal.skin, "leg", 9);
    capsule(buf, hipX, hipY, hipX + foot.dx * 0.35, pantEnd, pantR, pants, "pants", 10);
    if (av.bottom === "cargo" && !shorts) {
      ellipse(buf, hipX + side * 2.2, hipY + 6, 2.4, 2.2, pants, "cargo", 11);
    }
    if (av.bottom === "joggers") {
      ellipse(buf, footX, footY - 5.5, 3.2, 2, pants, "cuff", 11);
    }
    // Chunky boot / sneaker
    ellipse(buf, footX, footY - 2.2, 5.2, 3.4, pal.shoe, "shoe", 14);
    ellipse(buf, footX + (key === "e" ? 1.5 : 0), footY - 0.2, 5.4, 1.8, pal.sole, "sole", 13);
    if (av.shoes === "skate") {
      rect(buf, footX - 2, footY - 3, footX + 2, footY - 2, pal.gold, "shoe-stripe", 15);
    }
  }
  // Far leg first
  if (key === "e") {
    leg(0, R);
    // Near-side single visible leg mostly; still draw both slightly offset
    leg(0.2, L);
  } else {
    leg(-1, L);
    leg(1, R);
  }
}

function drawArms(buf, av, key, pal, upper, pose) {
  const t = torsoBox(key, pose.sit);
  const y0 = t.y0 + upper;
  const long = av.top === "hoodie" || av.top === "jacket";
  const sleevePal = pal.shirt;
  const skin = pal.skin;
  function arm(side, kind, near) {
    const sx = t.cx + side * (key === "e" ? 3 : t.hw - 0.5);
    const sy = y0 + 3;
    let ex = sx + side * 5, ey = sy + (long ? 13 : 11);
    let hand = { x: ex, y: ey };
    if (kind === "wave" || kind === "cheer") {
      ex = sx + side * 2;
      ey = y0 - 8;
      hand = { x: ex + side, y: ey - 2 };
    } else if (kind === "dance") {
      ex = sx + side * 3;
      ey = y0 - 6 + (side > 0 ? -2 : 1);
      hand = { x: ex, y: ey - 1 };
    } else if (kind === "phone" || kind.startsWith("phone")) {
      ex = t.cx + (key === "e" ? 6 : 5);
      ey = y0 + 2;
      hand = { x: ex + 1, y: ey + 2 };
    } else if (kind === "hold" || kind === "punch") {
      ex = t.cx + side * 6;
      ey = y0 + 8;
      hand = { x: ex, y: ey };
    } else if (kind === "sit") {
      ex = sx + side * 4;
      ey = y0 + 10;
      hand = { x: ex, y: ey };
    } else if (kind === "clap") {
      ex = t.cx + side * 2;
      ey = y0 + 6;
      hand = { x: t.cx + side * 1.5, y: ey };
    } else if (kind === "shrug") {
      ex = sx + side * 7;
      ey = y0 + 1;
      hand = { x: ex, y: ey };
    } else if (typeof pose.armSwing === "number") {
      ex = sx + side * (4 + pose.armSwing * side);
      ey = sy + 11 - Math.abs(pose.armSwing);
      hand = { x: ex, y: ey + 1 };
    }
    const depth = near ? 30 : 8;
    // Sleeve
    const midX = (sx + hand.x) / 2, midY = (sy + hand.y) / 2;
    capsule(buf, sx, sy, long ? hand.x : midX, long ? (hand.y + midY) / 2 : midY, 3.6, sleevePal, "sleeve", depth);
    if (!long) capsule(buf, midX, midY, hand.x, hand.y, 3.0, skin, "arm", depth + 1);
    // Mitten hand
    circle(buf, hand.x, hand.y, 3.5, skin, "hand", depth + 2);
    if (av.accessory === "wristband" && near) {
      circle(buf, (hand.x + sx) / 2, (hand.y + sy) / 2 + 2, 2.2, pal.gold, "wrist", depth + 3);
    }
    return hand;
  }

  const aKind = pose.armKind || "idle";
  const oneHanded = aKind === "wave" || aKind.startsWith("phone") || aKind === "hold" || aKind === "punch";
  if (key === "e") {
    const hand = arm(1, aKind, true);
    return { near: hand };
  }
  const farKind = oneHanded ? "idle" : (aKind === "dance" || aKind === "cheer" || aKind === "clap" || aKind === "shrug" ? aKind : "idle");
  arm(-1, farKind, false);
  const near = arm(1, aKind, true);
  return { near };
}

function drawProp(buf, flags, hand, key, pose) {
  if (!hand) return;
  const held = flags.heldItem?.kind || flags.heldProp || (typeof flags.heldItem === "string" ? flags.heldItem : "");
  if (pose.armKind && String(pose.armKind).startsWith("phone") || flags.usingPhone) {
    const pal = tones("#3a3430");
    rect(buf, hand.x - 1, hand.y - 6, hand.x + 3, hand.y + 1, pal, "phone", 60, 1);
    const screen = rgb(160, 196, 170);
    rect(buf, hand.x - 0, hand.y - 5, hand.x + 2, hand.y - 1, screen, "phone-screen", 61);
    return;
  }
  if (!held) return;
  if (held === "soda" || held === "coffee" || held === "drink" || held === "mug") {
    const cup = held === "coffee" || held === "mug" ? tones("#6a4030", true) : tones("#8a2e2a");
    rect(buf, hand.x - 1, hand.y - 5, hand.x + 2, hand.y + 1, cup, "cup", 60, 1);
  }
}

function armKindFromFlags(flags, frame) {
  if (flags.sitting) return "sit";
  if (flags.actionEmote === "wave") return "wave";
  if (flags.actionEmote === "dance" || flags.actionEmote === "cheer") return "dance";
  if (flags.actionEmote === "clap") return "clap";
  if (flags.actionEmote === "shrug") return "shrug";
  if (flags.actionEmote === "cry") return "cry";
  if (flags.actionEmote === "laugh") return "laugh";
  if (flags.boxing) return "punch";
  if (flags.usingPhone) return (frame % 3 === 1) ? "phone1" : "phone";
  const held = flags.heldItem?.kind || flags.heldItem || flags.heldProp;
  if (held) return "hold";
  if (flags.gym) return "hold";
  if (flags.walking) return "walk";
  return "idle";
}

function shoeStyleOf(id) {
  if (id === "black" || id === "hightop") return id;
  if (id === "red" || id === "gum" || id === "skate" || id === "boots" || id === "checker") return id;
  return "white";
}

function shoePal(id) {
  const style = shoeStyleOf(id);
  if (style === "black") return { upper: tones("#2a2624", true), sole: tones("#d8d0c4", true), accent: tones("#efe6d6", true), lace: rgb(230, 220, 210) };
  if (style === "red") return { upper: tones("#c43632", true), sole: tones("#efe6d6", true), accent: tones("#f4f0e6", true), lace: rgb(250, 246, 236) };
  if (style === "gum") return { upper: tones("#e8d4b0", true), sole: tones("#c47a32", true), accent: tones("#5a3a24", true), lace: rgb(90, 60, 40) };
  if (style === "skate") return { upper: tones("#3a5a8a", true), sole: tones("#e8d8a8", true), accent: tones("#f0c43a", true), lace: rgb(240, 230, 200) };
  if (style === "hightop") return { upper: tones("#1c1a1a", true), sole: tones("#f2f0ea", true), accent: tones("#c43632", true), lace: rgb(230, 220, 210) };
  if (style === "boots") return { upper: tones("#c4a056", true), sole: tones("#3a2a1c", true), accent: tones("#5a3a20", true), lace: rgb(60, 40, 24) };
  if (style === "checker") return { upper: tones("#1a1a1a", true), sole: tones("#efe6d6", true), accent: tones("#f4efe4", true), lace: rgb(244, 239, 228) };
  return { upper: tones("#f4efe6", true), sole: tones("#6a7a8a", true), accent: tones("#3a6aaa", true), lace: rgb(90, 80, 70) };
}

function drawMitten(buf, cx, cy, pal, side = 1) {
  // Round palm with a 2-3 tone cel ramp so it reads as a sphere, not a flat hexagon.
  ellipse(buf, cx, cy, 4.0, 3.9, pal.skin, "hand", 32);
  const tx = cx + (side >= 0 ? 2.7 : -2.7);
  ellipse(buf, tx, cy - 0.8, 2.0, 2.2, pal.skin, "thumb", 33);
  const hi = pal.skin.hi || pal.skin.mid || pal.skin;
  plot(buf, Math.round(cx - 1), Math.round(cy - 2), hi, "hand-hi", 34);
  plot(buf, Math.round(cx), Math.round(cy - 2), hi, "hand-hi", 34);
}

function plotCheck(buf, x, y, on, pal) {
  const col = on ? pal.upper.mid : pal.accent.mid;
  plot(buf, x, y, col, "shoe", 14);
}

function drawShoe(buf, cx, cy, key, style, pal, side) {
  // cy is the sole line. Chunky showcase shoes: thick sole, toe cap, shine.
  const profile = key === "e";
  const back = key === "n" || key === "ne";
  const high = style === "hightop" || style === "boots";
  const ankle = high ? 9 : 7.5;
  const len = profile ? 13 : (back ? 10 : 11);
  const dir = profile ? (side >= 0 ? 1 : -1) : 0;
  const toeX = cx + (profile ? dir * (len * 0.28) : 0);
  const midY = cy - ankle * 0.48;
  const flat = { shade: "flat" };
  const capPal = { hi: pal.upper.hi, mid: mix(pal.upper.mid, rgb(255, 250, 240), 0.22), sh: pal.upper.mid };
  // Upper
  ellipse(buf, cx + dir * 1.2, midY, len * 0.48, ankle * 0.48, pal.upper, "shoe", 14, flat);
  if (high) ellipse(buf, cx, cy - ankle + 2.0, 4.4, 3.8, pal.upper, "shoe-ankle", 15, flat);
  // Visible toe cap
  if (!back) ellipse(buf, toeX, cy - 4.2, profile ? 5.2 : 6.2, 3.6, capPal, "toe-cap", 15, flat);
  // Thick contrasting sole (about 3px platform)
  ellipse(buf, cx + dir * 0.8, cy - 1.6, len * 0.52, 2.6, pal.sole, "sole", 16, flat);
  rect(buf, cx - len * 0.5, cy - 3, cx + len * 0.5, cy, pal.sole.mid, "sole", 16, 1);
  rect(buf, cx - len * 0.48, cy - 1, cx + len * 0.48, cy, pal.sole.sh || pal.sole.mid, "sole-lip", 17, 1);
  // Accent stripe / swoosh
  if (style === "checker" && !profile) {
    for (let y = -4; y <= 1; y++) {
      for (let x = -4; x <= 4; x++) {
        if (x * x + (y + 1) * (y + 1) > 16) continue;
        plotCheck(buf, Math.round(cx + x), Math.round(cy - 4 + y), ((x + y) & 1) === 0, pal);
      }
    }
  } else if (style !== "boots" && style !== "checker") {
    const sx = cx + (profile ? dir * 2.2 : side * 1.4);
    ellipse(buf, sx, cy - 5.0, 4.2, 1.4, pal.accent, "swoosh", 17, flat);
  }
  if (style === "skate") {
    rect(buf, cx - 4, cy - 3, cx + 4, cy - 2, pal.accent, "sole-stripe", 17);
  }
  if (style === "boots") {
    rect(buf, cx - 4, cy - 6, cx + 4, cy - 5, pal.accent, "boot-welt", 17);
  }
  if (style === "hightop") {
    ellipse(buf, cx, cy - ankle + 1.6, 4.6, 1.4, pal.accent, "collar", 16, flat);
  }
  // Laces (not slip-ons)
  if (style !== "checker") {
    const lx = Math.round(cx), ly = Math.round(cy - (high ? 7 : 5.5));
    plot(buf, lx - 1, ly, pal.lace, "lace", 18);
    plot(buf, lx + 1, ly, pal.lace, "lace", 18);
    plot(buf, lx, ly - 1, pal.lace, "lace", 18);
    if (high) {
      plot(buf, lx - 1, ly - 2, pal.lace, "lace", 18);
      plot(buf, lx + 1, ly - 2, pal.lace, "lace", 18);
    }
  }
  // Highlight shine on the toe / vamp
  const hx = Math.round(toeX - (profile ? 0 : 2));
  const hy = Math.round(cy - 6);
  plotInside(buf, hx, hy, rgb(255, 252, 245), "shine", 19);
  plotInside(buf, hx + 1, hy, rgb(255, 252, 245), "shine", 19);
  plotInside(buf, hx, hy - 1, rgb(255, 252, 245), "shine", 19);
}

function stickerSprite(draw) {
  const buf = makeBuf();
  draw(buf);
  return addInkOutline(buf);
}

function walkPose(frame, walking, sit) {
  if (sit) {
    return {
      sit: true,
      left: { dx: -3, lift: 0 }, right: { dx: 3, lift: 0 },
      armKind: "sit", armSwing: 0, bob: 0, squash: 0.08,
      handL: { dx: 1, dy: 2 }, handR: { dx: 1, dy: 2 },
    };
  }
  if (!walking) {
    const bobH = (frame % 16) < 8 ? 0 : 1;
    return {
      sit: false,
      left: { dx: -1, lift: 0 }, right: { dx: 1, lift: 0 },
      armSwing: 0, bob: 0, squash: 0,
      handL: { dx: 0, dy: bobH },
      handR: { dx: 0, dy: 1 - bobH },
    };
  }
  const f = ((frame % 8) + 8) % 8;
  const table = [
    { left: { dx: 2, lift: 0 }, right: { dx: -2, lift: 0 }, bob: 1, squash: 0.14, armSwing: 2 },
    { left: { dx: 1, lift: 0 }, right: { dx: -1, lift: 3 }, bob: 0, squash: 0.04, armSwing: 3 },
    { left: { dx: 0, lift: 0 }, right: { dx: 2, lift: 4 }, bob: -1, squash: -0.08, armSwing: 3 },
    { left: { dx: -1, lift: 0 }, right: { dx: 3, lift: 1 }, bob: 0, squash: 0.04, armSwing: 2 },
    { left: { dx: -2, lift: 0 }, right: { dx: 2, lift: 0 }, bob: 1, squash: 0.14, armSwing: -2 },
    { left: { dx: -1, lift: 3 }, right: { dx: 1, lift: 0 }, bob: 0, squash: 0.04, armSwing: -3 },
    { left: { dx: 2, lift: 4 }, right: { dx: 0, lift: 0 }, bob: -1, squash: -0.08, armSwing: -3 },
    { left: { dx: 3, lift: 1 }, right: { dx: -1, lift: 0 }, bob: 0, squash: 0.04, armSwing: -2 },
  ];
  const p = table[f];
  return {
    sit: false, ...p,
    handL: { dx: p.armSwing, dy: Math.abs(p.armSwing) > 2 ? -1 : 0 },
    handR: { dx: p.armSwing, dy: Math.abs(p.armSwing) > 2 ? -1 : 0 },
  };
}

function handClearance(t, side, squash = 0) {
  // Palm radius 4 plus 1px ink, so the mitten can touch the torso edge but not sit inside it.
  // Follow walk squash so a wider or narrower bean does not leave a gap or tuck the hand in.
  const hw = t.hw * (1 + (squash || 0));
  return t.cx + side * (hw + 5.2);
}

function handPose(kind, side, pose, t, upper, key, frame) {
  const squash = pose.squash || 0;
  const cuffX = t.cx + side * t.hw * (1 + squash);
  const cuffY = t.y0 + upper + 4;
  let hx = handClearance(t, side, squash);
  let hy = t.y0 + upper + t.h * 0.70;
  if (kind === "wave" || kind === "cheer") {
    if (side > 0 || kind === "cheer") { hx = t.cx + side * 13; hy = (t.y0 + upper) - 8; }
  } else if (kind === "dance") {
    hx = t.cx + side * 10;
    hy = (t.y0 + upper) - 11 + (side > 0 ? -2 : 0);
  } else if (kind === "phoneTap") {
    hx = t.cx + (key === "e" ? 8 : 8); hy = t.y0 + upper + 0 + ((frame % 3) === 1 ? -2 : 0);
  } else if (kind === "phone" || (kind && String(kind).startsWith("phone"))) {
    if (side > 0) { hx = t.cx + (key === "e" ? 7 : 6); hy = t.y0 + upper + 3; }
    else { hx = t.cx + (key === "e" ? 9 : 8); hy = t.y0 + upper + 1 + ((frame % 3) === 1 ? -1 : 0); }
  } else if (kind === "hold" || kind === "punch") {
    hx = t.cx + side * 8;
    hy = t.y0 + upper + 8;
  } else if (kind === "sit") {
    hx = t.cx + side * 6;
    hy = t.y0 + upper + 11;
  } else if (kind === "clap") {
    hx = t.cx + side * 3;
    hy = t.y0 + upper + 7;
  } else if (kind === "shrug") {
    hx = t.cx + side * 9;
    hy = t.y0 + upper + 2;
  } else if (kind === "cry") {
    hx = t.cx + side * 7;
    hy = t.y0 + upper + 1;
  } else if (kind === "laugh") {
    hx = t.cx + side * 7;
    hy = t.y0 + upper + 9;
  }
  const hand = side < 0 ? pose.handL : pose.handR;
  const special = kind === "wave" || kind === "dance" || kind === "cheer" || kind === "phone" || String(kind || "").startsWith("phone") || kind === "cry" || kind === "hold" || kind === "punch" || kind === "clap" || kind === "shrug";
  if (hand && !special) {
    // Walk motion is a small vertical bob. Hands stay seated at the torso edge.
    hy += hand.dy || 0;
    hx = handClearance(t, side, squash);
  }
  return { x: hx, y: hy, cuffX, cuffY };
}

function drawCuffs(buf, av, key, pal, upper, sit) {
  // Pockets and stripes only — the oval silhouette is already drawn in drawTorso.
  const t = torsoBox(key, sit);
  const y0 = t.y0 + upper;
  const pants = pal.pants;
  const shorts = av.bottom === "shorts";
  const skirt = av.bottom === "skirt";
  const hemT = shorts ? 0.78 : skirt ? 0.68 : 0.58;
  const pocketY = y0 + t.h * Math.min(0.86, hemT + 0.16);
  if (av.bottom === "cargo" || shorts) {
    ellipse(buf, t.cx - t.hw + 2.2, pocketY, 2.0, 1.8, pants, "cargo", 26, { shade: "flat" });
    ellipse(buf, t.cx + t.hw - 2.2, pocketY, 2.0, 1.8, pants, "cargo", 26, { shade: "flat" });
  }
  if (av.bottom === "track") {
    const stripe = rgb(255, 240, 160);
    const y1 = y0 + t.h * hemT + 1;
    const y2 = y0 + t.h - 2;
    for (let y = Math.round(y1); y <= Math.round(y2); y++) {
      const L = buf[y * AV_W + Math.round(t.cx - t.hw + 2)];
      const R = buf[y * AV_W + Math.round(t.cx + t.hw - 2)];
      if (L && (L.kind === "pants" || L.kind === "skirt")) plot(buf, Math.round(t.cx - t.hw + 2), y, stripe, "stripe", 26);
      if (R && (R.kind === "pants" || R.kind === "skirt")) plot(buf, Math.round(t.cx + t.hw - 2), y, stripe, "stripe", 26);
    }
  }
}

function drawSparkles(buf, x, y, phase) {
  const pts = [
    [0, -6], [6, -3], [-6, -2], [4, 2], [-5, 3], [0, 5],
  ];
  const col = phase % 2 === 0 ? rgb(255, 252, 220) : rgb(255, 220, 90);
  for (let i = 0; i < pts.length; i++) {
    if ((phase + i) % 3 === 2) continue;
    const [dx, dy] = pts[i];
    plot(buf, Math.round(x + dx), Math.round(y + dy - (phase % 3)), col, "sparkle", 75);
    plot(buf, Math.round(x + dx + 1), Math.round(y + dy - (phase % 3)), col, "sparkle", 75);
  }
}

function headMotion(frame, walk, sit, bodyUpper = 0) {
  // Head stays seated on the shoulders and shares the body's bounce. No independent float.
  return { y: bodyUpper || 0, x: 0 };
}

function composeAvatar(av, flags, frame) {
  const { bodyDir, headDir, walk } = resolvedDirs(flags);
  const bodyView = viewOfDir(bodyDir);
  const headView = viewOfDir(headDir);
  const pal = buildPalette(av);
  const shoes = shoePal(av.shoes);
  const sit = Boolean(flags.sitting);
  const pose = walkPose(frame, walk, sit);
  pose.armKind = armKindFromFlags(flags, frame);
  const breathe = (!walk && !sit) ? ((frame % 16) < 8 ? 0 : -1) : 0;
  const bob = walk ? (pose.bob || 0) : 0;
  const upper = sit ? AV_SEAT_DROP : (bob + breathe);
  const motion = headMotion(frame, walk, sit, upper);
  const headUpper = motion.y;
  const emote = flags.actionEmote || "";
  const hatOn = av.accessory === "cap" || av.accessory === "beanie" || av.accessory === "trucker" || av.accessory === "bucket" || av.accessory === "fitted";
  const bk = bodyView.key;

  let body = makeBuf();
  drawTorso(body, av, bk, pal, upper, sit, pose.squash || 0);
  drawCuffs(body, av, bk, pal, upper, sit);
  if (bodyView.flip) body = flipBuf(body, true);
  body = addInkOutline(body);

  let head = makeBuf();
  const hk = headView.key;
  if (hk === "n" || hk === "ne") {
    drawHair(head, av, hk, pal, headUpper, hatOn);
    drawHead(head, hk, pal, headUpper, emote);
    drawHair(head, av, hk, pal, headUpper, hatOn);
  } else {
    drawHead(head, hk, pal, headUpper, emote);
    drawHair(head, av, hk, pal, headUpper, hatOn);
    clearFaceWindow(head, hk, pal, headUpper);
    drawFace(head, hk, pal, headUpper, emote);
  }
  if (av.glasses || av.accessory === "shades") drawGlasses(head, av, hk, headUpper);
  if (hatOn) drawHat(head, av, hk, pal, headUpper);
  if (hatOn) drawHairPeeks(head, av, hk, pal, headUpper);
  if (av.accessory === "headphones") drawHeadphones(head, av, hk, pal, headUpper);
  if (emote === "heart") {
    const g = headGeom(hk);
    ellipse(head, g.cx + 8, g.cy + headUpper - 8, 2, 2, rgb(220, 80, 90), "heart", 70, { shade: "flat" });
    ellipse(head, g.cx + 11, g.cy + headUpper - 8, 2, 2, rgb(220, 80, 90), "heart", 70, { shade: "flat" });
  }
  if (headView.flip) head = flipBuf(head, true);
  drawEyes(head, hk, headUpper, headView.flip, flags, emote);
  const dx = neckX(bodyView, upper) - neckX(headView, headUpper) + (headView.flip ? -motion.x : motion.x);
  if (dx) head = shiftBufXY(head, dx, 0);
  head = addInkOutline(head);

  const t = torsoBox(bk, sit);
  const aKind = pose.armKind || "idle";
  const leftKind = aKind === "wave" || aKind === "hold" || aKind === "punch" ? "idle"
    : (String(aKind).startsWith("phone") ? "phoneTap" : aKind);
  const leftHand = handPose(leftKind, -1, pose, t, upper, bk, frame);
  const rightHand = handPose(aKind, 1, pose, t, upper, bk, frame);
  function flipX(x) { return bodyView.flip ? AV_W - 1 - x : x; }

  const footGap = 2;
  const cuffBottom = (av.bottom === "shorts" ? t.y0 + upper + t.h + 1 : 50 + (sit ? 2 : 0));
  function footPos(side, foot) {
    const baseX = bk === "e"
      ? t.cx + (side > 0 ? 6.0 : -4.4) + (foot.dx || 0) * 0.6
      : t.cx + side * 5.2 + (foot.dx || 0);
    const soleY = AV_GROUND_Y - (foot.lift || 0);
    return { x: flipX(baseX), y: soleY, lift: foot.lift || 0, side };
  }
  const farFoot = footPos(-1, pose.left);
  const nearFoot = footPos(1, pose.right);
  const farHand = { x: flipX(leftHand.x), y: leftHand.y, side: -1 };
  const nearHand = { x: flipX(rightHand.x), y: rightHand.y, side: 1 };

  function footSpr(fp) {
    return stickerSprite((buf) => drawShoe(buf, fp.x, fp.y, bk, shoeStyleOf(av.shoes), shoes, bodyView.flip ? -fp.side : fp.side));
  }
  function handSpr(hp, holdPhone, tapPhone) {
    return stickerSprite((buf) => {
      drawMitten(buf, hp.x, hp.y, pal, hp.side);
      if (holdPhone) {
        const ph = tones("#3a3430");
        rect(buf, hp.x - 1, hp.y - 6, hp.x + 3, hp.y + 1, ph, "phone", 60, 1);
        rect(buf, hp.x, hp.y - 5, hp.x + 2, hp.y - 1, rgb(160, 196, 170), "phone-screen", 61);
      }
      if (tapPhone) {
        // already positioned higher in handPose when frame ticks
      }
    });
  }

  const holdingPhone = Boolean(flags.usingPhone) || (aKind && String(aKind).startsWith("phone"));
  const layers = [];
  const backView = bk === "n" || bk === "ne";
  const fFoot = footSpr(farFoot);
  const nFoot = footSpr(nearFoot);
  const fHand = handSpr(farHand, false, holdingPhone);
  const nHand = handSpr(nearHand, holdingPhone, false);
  if (backView) layers.push(fFoot, body, head, nFoot, fHand, nHand);
  else layers.push(fFoot, fHand, body, head, nFoot, nHand);

  const out = makeBuf();
  for (const layer of layers) blitBuf(out, layer);
  const cleaned = addContactShade(shadeUnderChin(stripNeckGapStickers(stripInnerStickers(out))));

  const pop = Number(flags.shoePop);
  if (pop >= 0 && pop < 480) {
    const phase = Math.floor(pop / 80);
    drawSparkles(out, nearFoot.x, nearFoot.y - 5, phase);
    drawSparkles(out, farFoot.x, farFoot.y - 5, phase + 1);
  }

  const planted = [farFoot, nearFoot].filter((f) => (f.lift || 0) <= 1);
  const shadows = (planted.length ? planted : [farFoot, nearFoot]).map((f) => ({
    x: f.x, y: AV_GROUND_Y + 1.3, rx: 6.5, ry: 2.0,
  }));
  return { buf: plantOnGround(cleaned), shadows };
}

function bufToCanvas(buf, shadows) {
  const c = document.createElement("canvas");
  c.width = AV_W;
  c.height = AV_H;
  const ctx = c.getContext("2d");
  ctx.imageSmoothingEnabled = false;
  const img = ctx.createImageData(AV_W, AV_H);
  for (let i = 0; i < buf.length; i++) {
    const p = buf[i];
    if (!p) continue;
    const o = i * 4;
    img.data[o] = p.color.r;
    img.data[o + 1] = p.color.g;
    img.data[o + 2] = p.color.b;
    img.data[o + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  ctx.globalCompositeOperation = "destination-over";
  ctx.fillStyle = "rgba(28, 16, 12, 0.32)";
  const list = shadows && shadows.length ? shadows : [{ x: AV_W / 2, y: AV_GROUND_Y + 1.3, rx: 11, ry: 2.3 }];
  for (const sh of list) {
    ctx.beginPath();
    ctx.ellipse(sh.x, sh.y, sh.rx || 6.5, sh.ry || 2.0, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  return { c, w: AV_W, h: AV_H };
}

const cache = new Map();

export function drawAvatarSprite(avatar = {}, flags = {}, frame = 0) {
  const av = normalizeAvatar(avatar);
  const walk = Boolean(flags.walking) && !flags.sitting;
  const { bodyDir, headDir } = resolvedDirs(flags);
  const held = flags.heldItem?.kind || flags.heldProp || (typeof flags.heldItem === "string" ? flags.heldItem : "");
  const phase = walk ? (frame % 8) : (flags.usingPhone ? (frame % 3) : (frame % 16));
  const blink = flags.blink || "open";
  const lookX = flags.lookX || 0;
  const lookY = flags.lookY || 0;
  const pop = flags.shoePop == null || flags.shoePop < 0 ? -1 : Math.floor(flags.shoePop / 80);
  const key = "chibi:" + JSON.stringify(av) + ":" + bodyDir + ":" + headDir + ":" + Boolean(flags.sitting) + ":" + walk + ":" + phase + ":" + Boolean(flags.usingPhone) + ":" + Boolean(flags.boxing) + ":" + (flags.actionEmote || "") + ":" + held + ":" + Boolean(flags.gym) + ":" + blink + ":" + lookX + ":" + lookY + ":" + pop;
  const hit = cache.get(key);
  if (hit) return hit;
  const composed = composeAvatar(av, flags, frame);
  const buf = composed.buf || composed;
  const spr = bufToCanvas(buf, composed.shadows);
  cache.set(key, spr);
  return spr;
}

export const AVATAR_SHEET_LOOKS = [
  { label: "spiky blond", skin: "#f0c9a8", hair: "spiky", hairColor: "#e6d3a4", shirt: "#c45c4a", top: "tshirt", bottom: "jeans", bottomColor: "#3d4f7c", shoes: "white", accessory: "none" },
  { label: "emo fringe", skin: "#e6b589", hair: "bangs", hairColor: "#2a2422", shirt: "#3a3634", top: "jacket", bottom: "jeans", bottomColor: "#2a2624", shoes: "black", accessory: "headphones", headphoneColor: "#3a3634" },
  { label: "afro", skin: "#8d5524", hair: "curly", hairColor: "#2b1d16", shirt: "#6a8a5a", top: "hoodie", bottom: "joggers", bottomColor: "#3a3634", shoes: "red", accessory: "chain" },
  { label: "purple buns", skin: "#c8894e", hair: "bun", hairColor: "#6a4a70", shirt: "#c47a8a", top: "hoodie", bottom: "jeans", bottomColor: "#3d4f7c", shoes: "gum", accessory: "none" },
  { label: "wild grey", skin: "#d8a56a", hair: "spiky", hairColor: "#8a8490", shirt: "#5a6a9a", top: "jacket", bottom: "cargo", bottomColor: "#4a4a42", shoes: "white", accessory: "none", glasses: true },
  { label: "long dark", skin: "#e6b589", hair: "long", hairColor: "#2b1d16", shirt: "#5c4d7d", top: "jacket", bottom: "jeans", bottomColor: "#2a2624", shoes: "black", glasses: true },
  { label: "band tee", skin: "#e6b589", hair: "spiky", hairColor: "#2b1d16", shirt: "#3a3634", top: "bandtee", bottom: "shorts", bottomColor: "#b89a5a", shoes: "skate", accessory: "trucker", headphoneColor: "#6a4030" },
  { label: "undercut", skin: "#c8894e", hair: "undercut", hairColor: "#2b1d16", shirt: "#4a5a4a", top: "hoodie", bottom: "cargo", bottomColor: "#6b7280", shoes: "skate", accessory: "wristband" },
];

export function paintAvatarSheet(canvas, looks, scale = 4) {
  looks = looks && looks.length ? looks : AVATAR_SHEET_LOOKS;
  const dirs = [
    { d: 1, label: "Front" },
    { d: 0, label: "3/4" },
    { d: 7, label: "Side" },
    { d: 5, label: "Back" },
  ];
  const pad = 16, cap = 18, gap = 14;
  const cw = AV_W * scale, ch = AV_H * scale;
  const cols = dirs.length;
  const rows = looks.length;
  canvas.width = pad * 2 + cols * cw + (cols - 1) * gap + 80;
  canvas.height = pad * 2 + rows * (ch + cap) + (rows - 1) * gap + 8;
  const ctx = canvas.getContext("2d");
  ctx.imageSmoothingEnabled = false;
  ctx.fillStyle = "#f4efe4";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.font = "12px Verdana, sans-serif";
  looks.forEach((look, r) => {
    const y = pad + r * (ch + cap + gap);
    ctx.fillStyle = "#2a1c16";
    ctx.fillText(look.label || "", 8, y + 14);
    dirs.forEach((dir, c) => {
      const x = pad + 80 + c * (cw + gap);
      const spr = drawAvatarSprite(look, { facing: { x: Math.cos(dir.d * Math.PI / 4), z: Math.sin(dir.d * Math.PI / 4) } }, 0);
      ctx.drawImage(spr.c, 0, 0, spr.w, spr.h, x, y, cw, ch);
      if (r === 0) {
        ctx.fillStyle = "#2a1c16";
        ctx.fillText(dir.label, x + cw / 2 - 14, y - 4);
      }
    });
  });
}

export function paintStoreThumb(canvas, kind, item, base) {
  const w = canvas.width = canvas.width || 48, h = canvas.height = canvas.height || 48;
  const ctx = canvas.getContext("2d");
  ctx.imageSmoothingEnabled = false;
  ctx.fillStyle = "#efe6d4";
  ctx.fillRect(0, 0, w, h);
  if (kind === "pets") {
    const name = typeof item === "string" ? item : (item?.item || item?.kind || "cat");
    if (typeof window !== "undefined" && typeof window.__paintPetThumb === "function") {
      return window.__paintPetThumb(canvas, name);
    }
    return false;
  }
  const av = { ...(base || {}), ...(item || {}) };
  const spr = drawAvatarSprite(av, { facing: { x: 1, z: 1 } }, 0);
  const scale = Math.max(1, Math.floor(Math.min((w - 4) / spr.w, (h - 4) / spr.h)));
  const dw = spr.w * scale, dh = spr.h * scale;
  ctx.drawImage(spr.c, 0, 0, spr.w, spr.h, Math.floor((w - dw) / 2), Math.floor((h - dh) / 2) + 1, dw, dh);
  return true;
}

function hashId(id) {
  let h = 2166136261;
  const s = String(id || "");
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

const animClocks = new Map();
const animOverrides = new Map();

export function setChibiAnimOverride(id, state) {
  if (!id) return;
  if (!state) animOverrides.delete(id);
  else animOverrides.set(id, { ...state });
}

export function getChibiAnim(id) {
  if (animOverrides.has(id)) return { ...animOverrides.get(id) };
  const s = animClocks.get(id);
  return s ? { blink: s.blink, lookX: s.lookX, lookY: s.lookY, bodyDir: s.bodyDir, headDir: s.headDir } : null;
}

function blinkPhase(elapsed, doubleBlink) {
  const B = 120, GAP = 90;
  const run = (t) => {
    if (t < 0 || t >= B) return "open";
    if (t < 40) return "half";
    if (t < 80) return "closed";
    return "half";
  };
  const first = run(elapsed);
  if (first !== "open") return first;
  if (doubleBlink) return run(elapsed - (B + GAP));
  return "open";
}

function glanceTarget(info) {
  const self = info.self || null;
  const others = info.others || [];
  if (!self || !others.length) return null;
  const wall = info.wallTime || Date.now();
  const selfName = self.username || self.id || self.name;
  let best = null, score = Infinity;
  for (const o of others) {
    const name = o.username || o.id || o.name;
    if (!name || name === selfName) continue;
    const ox = o.x ?? o.tileX, oy = o.y ?? o.tileY;
    if (ox == null || oy == null || self.x == null || self.y == null) continue;
    const dist = Math.hypot(ox - self.x, oy - self.y);
    let chatting = Boolean(o.bubble && o.bubbleUntil && o.bubbleUntil > wall);
    if (!chatting && Array.isArray(o.bubbles)) chatting = o.bubbles.some((b) => b && b.until > wall);
    const s = chatting ? dist - 100 : dist;
    if (chatting || dist <= 3.2) {
      if (s < score) { score = s; best = { x: ox, y: oy, chatting, name }; }
    }
  }
  if (!best && info.lastSay && wall - (info.lastSay.at || 0) < 4000 && info.lastSay.username !== selfName) {
    const o = others.find((p) => (p.username || p.id) === info.lastSay.username);
    if (o && o.x != null) best = { x: o.x, y: o.y, chatting: true, name: o.username };
  }
  return best;
}

export function tickChibiAnim(id, now, info = {}) {
  if (animOverrides.has(id)) {
    const o = animOverrides.get(id);
    return {
      blink: o.blink || "open",
      lookX: o.lookX || 0,
      lookY: o.lookY || 0,
      bodyDir: o.bodyDir != null ? o.bodyDir : (info.targetDir ?? 1),
      headDir: o.headDir != null ? o.headDir : (o.bodyDir != null ? o.bodyDir : (info.targetDir ?? 1)),
    };
  }
  const h = hashId(id);
  let s = animClocks.get(id);
  if (!s) {
    const startDir = info.targetDir != null ? info.targetDir : 1;
    s = {
      bodyDir: startDir,
      headDir: startDir,
      targetDir: startDir,
      catchAt: 0,
      prefer: (h & 1) ? 1 : -1,
      lookX: 0,
      lookY: 0,
      nextLook: now + 400 + (h % 1800),
      glanceUntil: 0,
      glanceDir: null,
      blink: "open",
      blinkAt: 0,
      double: false,
      nextBlink: now + 600 + (h % 2200),
    };
    animClocks.set(id, s);
  }

  const walk = Boolean(info.walking);
  const target = info.targetDir != null ? ((info.targetDir % 8) + 8) % 8 : s.targetDir;
  if (target !== s.targetDir) {
    s.targetDir = target;
    // Head steps first; body will catch up shortly.
    if (s.bodyDir !== s.targetDir) {
      s.headDir = stepDir(s.bodyDir, s.targetDir, s.prefer);
      s.catchAt = now + 80 + (h % 41);
    } else {
      s.headDir = s.bodyDir;
      s.catchAt = 0;
    }
  }

  if (!walk && s.bodyDir === s.headDir && s.bodyDir === s.targetDir) {
    const glance = glanceTarget(info);
    if (glance && (now >= s.nextLook || s.glanceUntil > now)) {
      const toward = facingIndex8(null, glance.x - info.self.x, glance.y - info.self.y);
      s.glanceDir = toward;
      s.headDir = clampHeadDir(s.bodyDir, toward, s.prefer);
      const sx = (glance.x - info.self.x) - (glance.y - info.self.y);
      s.lookX = sx > 0.15 ? 1 : sx < -0.15 ? -1 : 0;
      s.lookY = 0;
      if (now >= s.nextLook) {
        s.glanceUntil = now + 900 + (h % 700);
        s.nextLook = s.glanceUntil + 1600 + (h % 2400);
      }
    } else if (s.glanceUntil && now >= s.glanceUntil) {
      s.headDir = s.bodyDir;
      s.glanceDir = null;
      s.glanceUntil = 0;
      s.lookX = 0;
      s.lookY = 0;
    } else if (now >= s.nextLook) {
      const r = (hashId(id + ":" + Math.floor(now)) % 10);
      if (r <= 2) { s.lookX = 0; s.lookY = 0; s.headDir = s.bodyDir; }
      else if (r <= 4) { s.lookX = -1; s.lookY = 0; s.headDir = clampHeadDir(s.bodyDir, s.bodyDir - 1, s.prefer); }
      else if (r <= 6) { s.lookX = 1; s.lookY = 0; s.headDir = clampHeadDir(s.bodyDir, s.bodyDir + 1, s.prefer); }
      else { s.lookX = r === 8 ? -1 : r === 9 ? 1 : 0; s.lookY = -1; }
      s.nextLook = now + 1600 + (hashId(id + "look" + s.nextLook) % 2800);
    }
  } else if (walk) {
    const dx = info.dirX || 0, dy = info.dirY || 0;
    const sx = dx - dy;
    s.lookX = sx > 0.15 ? 1 : sx < -0.15 ? -1 : 0;
    s.lookY = 0;
    s.glanceUntil = 0;
  }

  if (s.catchAt && now >= s.catchAt && s.bodyDir !== s.headDir) {
    s.bodyDir = s.headDir;
    if (s.bodyDir !== s.targetDir) {
      s.headDir = stepDir(s.bodyDir, s.targetDir, s.prefer);
      s.catchAt = now + 80 + (hashId(id + ":" + s.bodyDir) % 41);
    } else {
      s.catchAt = 0;
    }
  } else if (s.bodyDir !== s.targetDir && !s.catchAt) {
    s.headDir = stepDir(s.bodyDir, s.targetDir, s.prefer);
    s.catchAt = now + 80 + (h % 41);
  }

  s.headDir = clampHeadDir(s.bodyDir, s.headDir, s.prefer);

  let blink = "open";
  if (s.blinkAt && now >= s.blinkAt) {
    blink = blinkPhase(now - s.blinkAt, s.double);
    const span = s.double ? 120 + 90 + 120 : 120;
    if (now - s.blinkAt >= span) {
      s.blinkAt = 0;
      blink = "open";
    }
  } else if (now >= s.nextBlink) {
    s.blinkAt = now;
    s.double = (hashId(id + ":" + Math.floor(now)) % 100) < 22;
    s.nextBlink = now + 2500 + (hashId(id + "nb" + s.nextBlink) % 3501);
    blink = "half";
  }
  s.blink = blink;

  return { blink: s.blink, lookX: s.lookX || 0, lookY: s.lookY || 0, bodyDir: s.bodyDir, headDir: s.headDir };
}

export function paintBlinkStrip(canvas, look, scale = 5) {
  look = look || AVATAR_SHEET_LOOKS[0];
  const frames = [
    { label: "open", blink: "open", lookX: 0, lookY: 0 },
    { label: "look L", blink: "open", lookX: -1, lookY: 0 },
    { label: "look R", blink: "open", lookX: 1, lookY: 0 },
    { label: "look up", blink: "open", lookX: 0, lookY: -1 },
    { label: "half", blink: "half", lookX: 0, lookY: 0 },
    { label: "closed", blink: "closed", lookX: 0, lookY: 0 },
    { label: "half 2", blink: "half", lookX: 0, lookY: 0 },
    { label: "open 2", blink: "open", lookX: 0, lookY: 0 },
  ];
  const pad = 16, cap = 16, gap = 10;
  const cw = AV_W * scale, ch = AV_H * scale;
  canvas.width = pad * 2 + frames.length * cw + (frames.length - 1) * gap;
  canvas.height = pad * 2 + ch + cap;
  const ctx = canvas.getContext("2d");
  ctx.imageSmoothingEnabled = false;
  ctx.fillStyle = "#f4efe4";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.font = "11px Verdana, sans-serif";
  ctx.fillStyle = "#2a1c16";
  frames.forEach((f, i) => {
    const x = pad + i * (cw + gap);
    const spr = drawAvatarSprite(look, { facing: { x: 0, z: 1 }, blink: f.blink, lookX: f.lookX, lookY: f.lookY, bodyDir: 1, headDir: 1 }, 0);
    ctx.drawImage(spr.c, 0, 0, spr.w, spr.h, x, pad + cap, cw, ch);
    ctx.fillText(f.label, x + 6, pad + 12);
  });
}

export function paintTurnStrip(canvas, look, scale = 5) {
  look = look || AVATAR_SHEET_LOOKS[0];
  // 180 turn from south to north, head leads by one step.
  const frames = [];
  let body = 1, head = 1;
  frames.push({ label: "idle S", body, head });
  const target = 5;
  while (body !== target) {
    head = stepDir(body, target, 1);
    frames.push({ label: "head " + head, body, head });
    body = head;
    frames.push({ label: "body " + body, body, head });
  }
  const pad = 16, cap = 16, gap = 8;
  const cw = AV_W * scale, ch = AV_H * scale;
  canvas.width = pad * 2 + frames.length * cw + (frames.length - 1) * gap;
  canvas.height = pad * 2 + ch + cap;
  const ctx = canvas.getContext("2d");
  ctx.imageSmoothingEnabled = false;
  ctx.fillStyle = "#f4efe4";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.font = "10px Verdana, sans-serif";
  ctx.fillStyle = "#2a1c16";
  frames.forEach((f, i) => {
    const x = pad + i * (cw + gap);
    const spr = drawAvatarSprite(look, { bodyDir: f.body, headDir: f.head, blink: "open", lookX: 0, lookY: 0 }, 0);
    ctx.drawImage(spr.c, 0, 0, spr.w, spr.h, x, pad + cap, cw, ch);
    ctx.fillText(f.label, x + 2, pad + 12);
  });
}

export function paintHeadComboSheet(canvas, look, scale = 3) {
  look = look || AVATAR_SHEET_LOOKS[0];
  const pad = 14, cap = 14, gap = 8, lab = 36;
  const cw = AV_W * scale, ch = AV_H * scale;
  const cols = 3, rows = 8;
  canvas.width = lab + pad * 2 + cols * cw + (cols - 1) * gap;
  canvas.height = pad * 2 + cap + rows * (ch + cap) + (rows - 1) * gap;
  const ctx = canvas.getContext("2d");
  ctx.imageSmoothingEnabled = false;
  ctx.fillStyle = "#f4efe4";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.font = "11px Verdana, sans-serif";
  const headOff = [-1, 0, 1];
  const labels = ["-45", "aligned", "+45"];
  labels.forEach((lb, i) => {
    ctx.fillStyle = "#2a1c16";
    ctx.fillText(lb, lab + pad + i * (cw + gap) + 8, pad + 10);
  });
  for (let body = 0; body < 8; body++) {
    const y = pad + cap + body * (ch + cap + gap);
    ctx.fillStyle = "#2a1c16";
    ctx.fillText("B" + body, 6, y + ch / 2);
    headOff.forEach((off, i) => {
      const head = (body + off + 8) % 8;
      const spr = drawAvatarSprite(look, { bodyDir: body, headDir: head, blink: "open" }, 0);
      const x = lab + pad + i * (cw + gap);
      ctx.drawImage(spr.c, 0, 0, spr.w, spr.h, x, y, cw, ch);
    });
  }
}

export function paintWalkStrip(canvas, look, scale = 5) {
  look = look || AVATAR_SHEET_LOOKS[0];
  const dirs = [
    { label: "Front", body: 1 },
    { label: "3/4", body: 0 },
    { label: "Side", body: 7 },
    { label: "Back", body: 5 },
  ];
  const frames = 8;
  const pad = 16, cap = 16, gap = 8, lab = 48;
  const cw = AV_W * scale, ch = AV_H * scale;
  canvas.width = lab + pad * 2 + frames * cw + (frames - 1) * gap;
  canvas.height = pad * 2 + dirs.length * (ch + cap) + (dirs.length - 1) * gap;
  const ctx = canvas.getContext("2d");
  ctx.imageSmoothingEnabled = false;
  ctx.fillStyle = "#f4efe4";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.font = "11px Verdana, sans-serif";
  ctx.fillStyle = "#2a1c16";
  dirs.forEach((d, r) => {
    const y = pad + r * (ch + cap + gap);
    ctx.fillText(d.label, 8, y + ch / 2);
    for (let f = 0; f < frames; f++) {
      const x = lab + pad + f * (cw + gap);
      const spr = drawAvatarSprite(look, { walking: true, bodyDir: d.body, headDir: d.body, blink: "open", dirX: Math.cos(d.body * Math.PI / 4), dirY: Math.sin(d.body * Math.PI / 4) }, f);
      ctx.drawImage(spr.c, 0, 0, spr.w, spr.h, x, y + cap, cw, ch);
      if (r === 0) ctx.fillText("f" + f, x + 8, y + 12);
    }
  });
}

export function paintShoeLineup(canvas, scale = 5) {
  const styles = ["white", "black", "red", "gum", "skate", "hightop", "boots", "checker"];
  const labels = { white: "runner", black: "black", red: "red", gum: "gum", skate: "skate", hightop: "hi-top", boots: "boots", checker: "slip-on" };
  const dirs = [{ label: "Front", body: 1 }, { label: "Side", body: 7 }];
  const base = { ...AVATAR_SHEET_LOOKS[0], hair: "spiky", hairColor: "#2b1d16", top: "tshirt", shirt: "#c45c4a" };
  const pad = 16, cap = 16, gap = 10, lab = 56;
  const cw = AV_W * scale, ch = AV_H * scale;
  canvas.width = lab + pad * 2 + styles.length * cw + (styles.length - 1) * gap;
  canvas.height = pad * 2 + dirs.length * (ch + cap) + (dirs.length - 1) * gap;
  const ctx = canvas.getContext("2d");
  ctx.imageSmoothingEnabled = false;
  ctx.fillStyle = "#f4efe4";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.font = "11px Verdana, sans-serif";
  ctx.fillStyle = "#2a1c16";
  dirs.forEach((d, r) => {
    const y = pad + r * (ch + cap + gap);
    ctx.fillText(d.label, 8, y + ch / 2);
    styles.forEach((sh, i) => {
      const x = lab + pad + i * (cw + gap);
      const spr = drawAvatarSprite({ ...base, shoes: sh }, { bodyDir: d.body, headDir: d.body, blink: "open" }, 0);
      ctx.drawImage(spr.c, 0, 0, spr.w, spr.h, x, y + cap, cw, ch);
      if (r === 0) ctx.fillText(labels[sh] || sh, x + 2, y + 12);
    });
  });
}


export function paintBobbleStrip(canvas, look, scale = 5) {
  look = look || AVATAR_SHEET_LOOKS[0];
  const frames = 8;
  const pad = 16, cap = 18, gap = 8, lab = 48;
  const cw = AV_W * scale, ch = AV_H * scale;
  const rows = [
    { label: "Walk", walking: true },
    { label: "Idle", walking: false },
  ];
  canvas.width = lab + pad * 2 + frames * cw + (frames - 1) * gap;
  canvas.height = pad * 2 + rows.length * (ch + cap) + gap;
  const ctx = canvas.getContext("2d");
  ctx.imageSmoothingEnabled = false;
  ctx.fillStyle = "#f4efe4";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.font = "11px Verdana, sans-serif";
  ctx.fillStyle = "#2a1c16";
  rows.forEach((row, r) => {
    const y = pad + r * (ch + cap + gap);
    ctx.fillText(row.label, 8, y + ch / 2);
    for (let f = 0; f < frames; f++) {
      const x = lab + pad + f * (cw + gap);
      const spr = drawAvatarSprite(look, { walking: row.walking, bodyDir: 1, headDir: 1, blink: "open" }, f);
      ctx.drawImage(spr.c, 0, 0, spr.w, spr.h, x, y + cap, cw, ch);
      if (r === 0) ctx.fillText("f" + f, x + 8, y + 12);
    }
  });
}

export const HAIRCUT_LOOKS = [
  { label: "Frosted tips", hair: "frosted", hairColor: "#2b1d16" },
  { label: "Buzz cut", hair: "buzz", hairColor: "#2b1d16" },
  { label: "Swoop emo", hair: "swoop", hairColor: "#222222" },
  { label: "Cornrows", hair: "cornrows", hairColor: "#2b1d16" },
  { label: "Shaggy skater", hair: "shaggy", hairColor: "#6b3a2a" },
  { label: "High pony", hair: "ponytail", hairColor: "#d4a017" },
  { label: "Space buns", hair: "spacebuns", hairColor: "#7b4f9c" },
  { label: "Straight bangs", hair: "straightbangs", hairColor: "#2b1d16" },
  { label: "Afro puff", hair: "afropuff", hairColor: "#2b1d16" },
  { label: "Bob + clips", hair: "bobclips", hairColor: "#6b3a2a" },
];

export function paintHaircutSheet(canvas, scale = 5) {
  const looks = HAIRCUT_LOOKS;
  const dirs = [
    { label: "Front", body: 1 },
    { label: "3/4", body: 0 },
    { label: "Side", body: 7 },
    { label: "Back", body: 5 },
  ];
  const pad = 16, cap = 16, gap = 10, lab = 48;
  const cw = AV_W * scale, ch = AV_H * scale;
  canvas.width = lab + pad * 2 + looks.length * cw + (looks.length - 1) * gap;
  canvas.height = pad * 2 + dirs.length * (ch + cap) + (dirs.length - 1) * gap;
  const ctx = canvas.getContext("2d");
  ctx.imageSmoothingEnabled = false;
  ctx.fillStyle = "#f4efe4";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.font = "11px Verdana, sans-serif";
  ctx.fillStyle = "#2a1c16";
  const base = { skin: "#f0c9a8", shirt: "#6c7bff", top: "tshirt", bottom: "jeans", bottomColor: "#3d4f7c", shoes: "white", accessory: "none" };
  dirs.forEach((d, r) => {
    const y = pad + r * (ch + cap + gap);
    ctx.fillText(d.label, 8, y + cap + ch / 2);
    looks.forEach((h, i) => {
      const x = lab + pad + i * (cw + gap);
      const spr = drawAvatarSprite({ ...base, hair: h.hair, hairColor: h.hairColor }, { bodyDir: d.body, headDir: d.body, blink: "open" }, 0);
      ctx.drawImage(spr.c, 0, 0, spr.w, spr.h, x, y + cap, cw, ch);
      if (r === 0) ctx.fillText(h.label, x, y + 12);
    });
  });
}

export function paintClothesCatalog(canvas, items, scale = 4) {
  const pad = 14, cap = 28, gap = 10;
  const cw = AV_W * scale, ch = AV_H * scale;
  const cols = 8;
  const rows = Math.ceil(items.length / cols);
  canvas.width = pad * 2 + cols * cw + (cols - 1) * gap;
  canvas.height = pad * 2 + rows * (ch + cap) + (rows - 1) * gap;
  const ctx = canvas.getContext("2d");
  ctx.imageSmoothingEnabled = false;
  ctx.fillStyle = "#f4efe4";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.font = "10px Verdana, sans-serif";
  ctx.fillStyle = "#2a1c16";
  const base = { skin: "#f0c9a8", hair: "spiky", hairColor: "#2b1d16", shirt: "#6c7bff", top: "tshirt", bottom: "jeans", bottomColor: "#3d4f7c", shoes: "white", accessory: "none" };
  items.forEach((it, i) => {
    const c = i % cols, r = Math.floor(i / cols);
    const x = pad + c * (cw + gap);
    const y = pad + r * (ch + cap + gap);
    const spr = drawAvatarSprite({ ...base, ...(it.item || {}) }, { bodyDir: 1, headDir: 1, blink: "open" }, 0);
    ctx.drawImage(spr.c, 0, 0, spr.w, spr.h, x, y + cap, cw, ch);
    ctx.fillText(it.label || it.id, x, y + 12);
  });
}


export function paintHairHatFit(canvas, scale = 3) {
  const hairs = HAIRCUT_LOOKS;
  const hats = [
    { accessory: "none", label: "No hat" },
    { accessory: "beanie", label: "Beanie" },
    { accessory: "cap", label: "Cap" },
    { accessory: "fitted", label: "Fitted" },
    { accessory: "bucket", label: "Bucket" },
    { accessory: "trucker", label: "Trucker" },
  ];
  const dirs = [
    { label: "Front", body: 1 },
    { label: "3/4", body: 0 },
    { label: "Side", body: 7 },
    { label: "Back", body: 5 },
  ];
  const pad = 12, cap = 14, gap = 6, lab = 58, section = 18;
  const cw = AV_W * scale, ch = AV_H * scale;
  const rows = hats.length * dirs.length;
  canvas.width = lab + pad * 2 + hairs.length * cw + (hairs.length - 1) * gap;
  canvas.height = pad * 2 + hats.length * section + rows * (ch + cap + gap);
  const ctx = canvas.getContext("2d");
  ctx.imageSmoothingEnabled = false;
  ctx.fillStyle = "#f4efe4";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.font = "11px Verdana, sans-serif";
  const base = { skin: "#f0c9a8", shirt: "#6c7bff", top: "tshirt", bottom: "jeans", bottomColor: "#3d4f7c", shoes: "white" };
  let y = pad;
  hats.forEach((hat) => {
    ctx.fillStyle = "#2a1c16";
    ctx.fillText(hat.label + " · all 10 haircuts × 4 views", 8, y + 12);
    y += section;
    dirs.forEach((d, r) => {
      ctx.fillStyle = "#2a1c16";
      ctx.fillText(d.label, 6, y + cap + ch / 2);
      hairs.forEach((h, i) => {
        const x = lab + pad + i * (cw + gap);
        const spr = drawAvatarSprite({ ...base, hair: h.hair, hairColor: h.hairColor, accessory: hat.accessory === "none" ? "none" : hat.accessory }, { bodyDir: d.body, headDir: d.body, blink: "open" }, 0);
        ctx.imageSmoothingEnabled = false;
        ctx.drawImage(spr.c, 0, 0, spr.w, spr.h, x, y + cap, cw, ch);
        if (r === 0) ctx.fillText(h.label, x, y + 10);
      });
      y += ch + cap + gap;
    });
  });
}


export function countNearWhiteEdgePixels(canvas, minR = 230, minG = 220, minB = 200) {
  if (!canvas) return 0;
  const ctx = canvas.getContext("2d");
  const w = canvas.width, h = canvas.height;
  const d = ctx.getImageData(0, 0, w, h).data;
  const opaque = (x, y) => {
    if (x < 0 || y < 0 || x >= w || y >= h) return false;
    return d[(y * w + x) * 4 + 3] > 20;
  };
  let n = 0;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (!opaque(x, y)) continue;
      const edge = !opaque(x - 1, y) || !opaque(x + 1, y) || !opaque(x, y - 1) || !opaque(x, y + 1);
      if (!edge) continue;
      const i = (y * w + x) * 4;
      if (d[i] >= minR && d[i + 1] >= minG && d[i + 2] >= minB) n++;
    }
  }
  return n;
}

export function avatarHasCleanOutline(av, flags = {}, frame = 0) {
  const spr = drawAvatarSprite(av, flags, frame);
  return countNearWhiteEdgePixels(spr.c) === 0;
}

export function inspectAvatarGeometry(avatar = {}, flags = {}, frame = 0) {
  const av = normalizeAvatar(avatar);
  const composed = composeAvatar(av, flags, frame);
  const buf = composed.buf || composed;
  let headTop = AV_H, skullBot = -1, torsoTop = AV_H, torsoBot = -1, footY = -1;
  let torsoLeft = AV_W, torsoRight = -1, figLeft = AV_W, figRight = -1, figTop = AV_H, figBot = -1;
  for (let y = 0; y < AV_H; y++) {
    for (let x = 0; x < AV_W; x++) {
      const p = buf[y * AV_W + x];
      if (!isFill(p)) continue;
      if (x < figLeft) figLeft = x;
      if (x > figRight) figRight = x;
      if (y < figTop) figTop = y;
      if (y > figBot) figBot = y;
      if (/^skin-head|^skin-jaw|^skin-face/.test(p.kind) && y > skullBot) skullBot = y;
      if (isTorsoish(p.kind)) {
        if (y < torsoTop) torsoTop = y;
        if (y > torsoBot) torsoBot = y;
        if (x < torsoLeft) torsoLeft = x;
        if (x > torsoRight) torsoRight = x;
      }
      if (/^(shoe|sole|toe)/.test(p.kind) && y > footY) footY = y;
    }
  }
  // Crown hair (buns, puffs, a high pony) counts in the head; hanging locks below the chin do not.
  for (let y = 0; y <= (skullBot < 0 ? AV_H - 1 : skullBot); y++) {
    for (let x = 0; x < AV_W; x++) {
      const p = buf[y * AV_W + x];
      if (!isFill(p)) continue;
      if (isHeadish(p.kind) && y < headTop) headTop = y;
    }
  }
  const headBot = skullBot;
  const headH = headBot >= 0 ? headBot - headTop + 1 : 0;
  const bodyH = (footY >= 0 ? footY : figBot) - (headTop < AV_H ? headTop : figTop) + 1;
  const torsoW = torsoRight >= 0 ? torsoRight - torsoLeft + 1 : 0;
  const torsoH = torsoBot >= 0 ? torsoBot - torsoTop + 1 : 0;
  const gap = (torsoTop < AV_H && headBot >= 0) ? torsoTop - headBot - 1 : 99;
  const headsTall = headH ? bodyH / headH : 0;
  const headShare = bodyH ? headH / bodyH : 0;
  return {
    headTop, headBot, torsoTop, torsoBot, footY, figTop, figBot,
    headH, bodyH, torsoW, torsoH, gap, headsTall, headShare,
    seated: gap <= -1 && gap >= -6,
    squishy: torsoW > torsoH,
    compact: headsTall >= 1.5 && headsTall <= 1.95 && headShare >= 0.48,
  };
}

export function inspectHandClearance(avatar = {}, flags = {}, frame = 0) {
  // Count mitten fill pixels that land on the torso. Idle and walk hands must stay outside.
  const av = normalizeAvatar(avatar);
  const { bodyDir } = resolvedDirs(flags);
  const bodyView = viewOfDir(bodyDir);
  const pal = buildPalette(av);
  const sit = Boolean(flags.sitting);
  const walk = Boolean(flags.walking) && !sit;
  const pose = walkPose(frame, walk, sit);
  pose.armKind = armKindFromFlags(flags, frame);
  const breathe = (!walk && !sit) ? ((frame % 16) < 8 ? 0 : -1) : 0;
  const bob = walk ? (pose.bob || 0) : 0;
  const upper = sit ? AV_SEAT_DROP : (bob + breathe);
  const bk = bodyView.key;
  let body = makeBuf();
  drawTorso(body, av, bk, pal, upper, sit, pose.squash || 0);
  drawCuffs(body, av, bk, pal, upper, sit);
  if (bodyView.flip) body = flipBuf(body, true);
  body = addInkOutline(body);
  const t = torsoBox(bk, sit);
  const aKind = pose.armKind || "idle";
  const leftKind = aKind === "wave" || aKind === "hold" || aKind === "punch" ? "idle"
    : (String(aKind).startsWith("phone") ? "phoneTap" : aKind);
  const leftHand = handPose(leftKind, -1, pose, t, upper, bk, frame);
  const rightHand = handPose(aKind, 1, pose, t, upper, bk, frame);
  function flipX(x) { return bodyView.flip ? AV_W - 1 - x : x; }
  const hands = [
    { x: flipX(leftHand.x), y: leftHand.y, side: -1 },
    { x: flipX(rightHand.x), y: rightHand.y, side: 1 },
  ];
  let overlap = 0, samples = [];
  for (const hp of hands) {
    const spr = makeBuf();
    drawMitten(spr, hp.x, hp.y, pal, hp.side);
    for (let i = 0; i < spr.length; i++) {
      const h = spr[i], b = body[i];
      if (!isFill(h) || !isFill(b) || !isTorsoish(b.kind)) continue;
      overlap++;
      if (samples.length < 4) samples.push({ x: i % AV_W, y: (i / AV_W) | 0, hand: h.kind, body: b.kind });
    }
  }
  return { overlap, ok: overlap === 0, samples };
}



if (typeof window !== "undefined") {
  window.__paintAvatarSheet = paintAvatarSheet;
  window.__paintStoreThumb = paintStoreThumb;
  window.__drawAvatarSprite = drawAvatarSprite;
  window.__tickChibiAnim = tickChibiAnim;
  window.__setChibiAnimOverride = setChibiAnimOverride;
  window.__getChibiAnim = getChibiAnim;
  window.__paintBlinkStrip = paintBlinkStrip;
  window.__paintTurnStrip = paintTurnStrip;
  window.__paintHeadComboSheet = paintHeadComboSheet;
  window.__paintWalkStrip = paintWalkStrip;
  window.__paintShoeLineup = paintShoeLineup;
  window.__paintBobbleStrip = paintBobbleStrip;
  window.__paintHaircutSheet = paintHaircutSheet;
  window.__countNearWhiteEdgePixels = countNearWhiteEdgePixels;
  window.__inspectAvatarGeometry = inspectAvatarGeometry;
  window.__inspectHandClearance = inspectHandClearance;
  window.__paintHairHatFit = paintHairHatFit;
  window.__paintClothesCatalog = paintClothesCatalog;
}

export default { drawAvatarSprite, paintAvatarSheet, paintStoreThumb, facingIndex8, tickChibiAnim, setChibiAnimOverride, getChibiAnim, AV_W, AV_H, AV_GROUND_Y, AV_HEAD_TOP, AVATAR_SHEET_LOOKS };
