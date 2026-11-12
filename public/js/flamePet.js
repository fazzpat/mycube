/* Flame Ball pet: a small cute fireball with eyes and tiny feet,
   a bobbing walk, and a flickering flame. Kept out of avatar3d.js. */
const PET_W = 32, PET_H = 30, PET_GROUND_Y = 27;

const FLAME = { core: rgb(255, 232, 140), mid: rgb(255, 140, 48), deep: rgb(212, 64, 24), tip: rgb(255, 90, 36), ink: rgb(42, 22, 16) };
const EYE = rgb(32, 20, 16);
const WHITE = rgb(255, 248, 230);
const FOOT = { mid: rgb(180, 70, 28), sh: rgb(120, 40, 16) };

function rgb(r, g, b) { return { r, g, b }; }

function plot(buf, x, y, color, kind, depth = 10) {
  x = x | 0; y = y | 0;
  if (x < 0 || y < 0 || x >= PET_W || y >= PET_H || !color) return;
  const i = y * PET_W + x;
  const cur = buf[i];
  if (cur && (cur.depth || 0) > depth) return;
  const c = color.mid ? color.mid : color;
  buf[i] = { r: c.r, g: c.g, b: c.b, a: 255, slot: kind, depth };
}

function fillEllipse(buf, cx, cy, rx, ry, color, kind, depth) {
  const rxi = Math.ceil(rx) + 1, ryi = Math.ceil(ry) + 1;
  for (let y = -ryi; y <= ryi; y++) {
    for (let x = -rxi; x <= rxi; x++) {
      const d = (x / (rx || 1)) ** 2 + (y / (ry || 1)) ** 2;
      if (d > 1) continue;
      plot(buf, Math.round(cx + x), Math.round(cy + y), color, kind, depth);
    }
  }
}

/** Draw a flame-ball into a pet sprite buffer. */
export function drawFlamePet(buf, opts = {}) {
  const key = opts.key || "s";
  const sit = Boolean(opts.sit);
  const walkStep = opts.walkStep | 0;
  const blink = opts.blink || "open";
  const bob = (opts.bob | 0) + (opts.walking && !sit ? (walkStep ? -1 : 0) : 0);
  const flicker = (opts.frame | 0) % 4;
  const cx = key === "e" ? 17 : 16;
  const ground = PET_GROUND_Y;
  const bodyY = (sit ? 19 : 18) + bob;
  const rx = sit ? 7.4 : 6.8;
  const ry = sit ? 6.6 : 6.2;

  // Tiny feet
  const liftL = walkStep && !sit ? 2 : 0;
  const liftR = walkStep && !sit ? 0 : (sit ? 0 : 1);
  if (key === "e") {
    fillEllipse(buf, cx + 3, ground - liftL, 2.2, 1.4, FOOT.mid, "foot", 6);
    fillEllipse(buf, cx - 1, ground - liftR, 2.2, 1.4, FOOT.sh, "foot", 6);
  } else if (key !== "n") {
    fillEllipse(buf, cx - 4, ground - liftL, 2.3, 1.5, FOOT.mid, "foot", 6);
    fillEllipse(buf, cx + 4, ground - liftR, 2.3, 1.5, FOOT.mid, "foot", 6);
  } else {
    fillEllipse(buf, cx - 3, ground - liftL, 2.0, 1.3, FOOT.sh, "foot", 6);
    fillEllipse(buf, cx + 3, ground - liftR, 2.0, 1.3, FOOT.sh, "foot", 6);
  }

  // Body: warm orb
  fillEllipse(buf, cx, bodyY, rx, ry, FLAME.mid, "flame", 10);
  fillEllipse(buf, cx, bodyY + 0.6, rx * 0.62, ry * 0.58, FLAME.core, "flame-core", 11);

  // Flickering licks above the ball
  const tips = flicker === 0
    ? [[0, -8], [-3, -6], [3, -6], [-5, -4], [5, -4]]
    : flicker === 1
      ? [[0, -9], [-2, -7], [4, -6], [-5, -3], [3, -5]]
      : flicker === 2
        ? [[1, -8], [-4, -7], [3, -7], [-3, -4], [5, -5]]
        : [[-1, -8], [-3, -6], [2, -7], [-5, -5], [4, -4]];
  for (const [dx, dy] of tips) {
    const px = cx + dx, py = bodyY - ry + 1 + dy;
    fillEllipse(buf, px, py, 1.8, 2.2, dy < -7 ? FLAME.tip : FLAME.mid, "lick", 9);
    plot(buf, Math.round(px), Math.round(py - 2), FLAME.tip, "lick", 9);
  }

  // Eyes (skip on true back)
  if (key !== "n") {
    const eyeY = bodyY - 0.6;
    const eyeSep = key === "e" ? 0 : 2.6;
    const eyes = key === "e"
      ? [[cx + 2.4, eyeY]]
      : [[cx - eyeSep, eyeY], [cx + eyeSep, eyeY]];
    for (const [ex, ey] of eyes) {
      if (blink === "closed" || blink === "half") {
        plot(buf, Math.round(ex - 1), Math.round(ey), EYE, "eye", 20);
        plot(buf, Math.round(ex), Math.round(ey), EYE, "eye", 20);
        plot(buf, Math.round(ex + 1), Math.round(ey), EYE, "eye", 20);
      } else {
        fillEllipse(buf, ex, ey, 1.5, 1.7, WHITE, "eye", 20);
        plot(buf, Math.round(ex), Math.round(ey), EYE, "eye", 21);
        plot(buf, Math.round(ex - 1), Math.round(ey - 1), WHITE, "eye-hi", 22);
      }
    }
  }
  return buf;
}

export function installFlamePet(setPetKindDrawer) {
  if (typeof setPetKindDrawer === "function") setPetKindDrawer("flame", drawFlamePet);
}

if (typeof window !== "undefined") window.__drawFlamePet = drawFlamePet;

export default { drawFlamePet, installFlamePet };
