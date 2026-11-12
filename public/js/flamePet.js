/* Flame Ball pet: a solid rounded ember/coal with cute oval eyes,
   a tiny walking feet, a soft pulsing glow, and drifting flame sparks. */
const PET_W = 32, PET_H = 30, PET_GROUND_Y = 27;

const COAL = { mid: rgb(86, 32, 18), sh: rgb(48, 18, 10), ink: rgb(28, 12, 8), hi: rgb(120, 46, 22) };
const EMBER = { mid: rgb(230, 86, 28), hi: rgb(255, 150, 48), core: rgb(255, 210, 110), lick: rgb(255, 120, 36) };
const EYE = rgb(22, 12, 10);
const WHITE = rgb(255, 248, 230);
const FOOT = { mid: rgb(70, 26, 14), sh: rgb(42, 16, 10) };
const SPARK = { hi: rgb(255, 220, 120), mid: rgb(255, 140, 40), sh: rgb(220, 70, 18) };

function rgb(r, g, b) { return { r, g, b }; }

function plot(buf, x, y, color, kind, depth = 10, a = 255) {
  x = x | 0; y = y | 0;
  if (x < 0 || y < 0 || x >= PET_W || y >= PET_H || !color) return;
  const i = y * PET_W + x;
  const cur = buf[i];
  if (cur && (cur.depth || 0) > depth) return;
  const c = color.mid ? color.mid : color;
  buf[i] = { r: c.r, g: c.g, b: c.b, a, slot: kind, depth };
}

function fillEllipse(buf, cx, cy, rx, ry, color, kind, depth, a = 255) {
  const rxi = Math.ceil(rx) + 1, ryi = Math.ceil(ry) + 1;
  for (let y = -ryi; y <= ryi; y++) {
    for (let x = -rxi; x <= rxi; x++) {
      const d = (x / (rx || 1)) ** 2 + (y / (ry || 1)) ** 2;
      if (d > 1) continue;
      plot(buf, Math.round(cx + x), Math.round(cy + y), color, kind, depth, a);
    }
  }
}

function shadeEmber(nx, ny, pulse) {
  // Dark coal shell with a glowing orange-red core, slightly brighter on pulse.
  const d = Math.sqrt(nx * nx + ny * ny);
  const core = Math.max(0, 1 - d / 0.72);
  const heat = core * (0.82 + 0.18 * pulse);
  if (heat > 0.62) return EMBER.core;
  if (heat > 0.32) return EMBER.hi;
  if (heat > 0.12) return EMBER.mid;
  if (ny > 0.45) return COAL.sh;
  if (ny < -0.35) return COAL.hi;
  return COAL.mid;
}

/** Draw the ember into a pet sprite buffer. */
export function drawFlamePet(buf, opts = {}) {
  const key = opts.key || "s";
  const sit = Boolean(opts.sit);
  const walkStep = opts.walkStep | 0;
  const blink = opts.blink || "open";
  const bob = (opts.bob | 0) + (opts.walking && !sit ? (walkStep ? -1 : 0) : 0);
  const frame = opts.frame | 0;
  const pulse = 0.5 + 0.5 * Math.sin((frame / 8) * Math.PI * 2);
  const cx = key === "e" ? 17 : 16;
  const ground = PET_GROUND_Y;
  const bodyY = (sit ? 19 : 18) + bob;
  const rx = sit ? 7.2 : 6.6;
  const ry = sit ? 6.4 : 6.0;

  // Tiny feet
  const liftL = walkStep && !sit ? 2 : 0;
  const liftR = walkStep && !sit ? 0 : (sit ? 0 : 1);
  if (key === "e") {
    fillEllipse(buf, cx + 3, ground - liftL, 2.1, 1.3, FOOT.mid, "foot", 6);
    fillEllipse(buf, cx - 1, ground - liftR, 2.1, 1.3, FOOT.sh, "foot", 6);
  } else if (key !== "n") {
    fillEllipse(buf, cx - 3.6, ground - liftL, 2.2, 1.4, FOOT.mid, "foot", 6);
    fillEllipse(buf, cx + 3.6, ground - liftR, 2.2, 1.4, FOOT.mid, "foot", 6);
  } else {
    fillEllipse(buf, cx - 2.8, ground - liftL, 1.9, 1.2, FOOT.sh, "foot", 6);
    fillEllipse(buf, cx + 2.8, ground - liftR, 1.9, 1.2, FOOT.sh, "foot", 6);
  }

  // Solid rounded ember / coal body
  const rxi = Math.ceil(rx) + 1, ryi = Math.ceil(ry) + 1;
  for (let y = -ryi; y <= ryi; y++) {
    for (let x = -rxi; x <= rxi; x++) {
      const nx = x / (rx || 1), ny = y / (ry || 1);
      if (nx * nx + ny * ny > 1) continue;
      plot(buf, Math.round(cx + x), Math.round(bodyY + y), shadeEmber(nx, ny, pulse), "flame", 10);
    }
  }
  // Darker ember cracks with a little inner heat
  const cracks = [
    [-2, -1, 3, 1], [1, 0, 2, 1], [-1, 2, 3, 0], [2, 1, 1, 2],
  ];
  for (const [ox, oy, len, dir] of cracks) {
    for (let i = 0; i <= len; i++) {
      const px = cx + ox + (dir ? 0 : i - 1);
      const py = bodyY + oy + (dir ? i - 1 : 0);
      plot(buf, Math.round(px), Math.round(py), COAL.ink, "crack", 12);
      if (i > 0 && i < len) plot(buf, Math.round(px + (dir ? 1 : 0)), Math.round(py + (dir ? 0 : 1)), EMBER.mid, "crack-glow", 11);
    }
  }
  // Inner core glow (pulses)
  const coreR = 2.4 + pulse * 0.5;
  fillEllipse(buf, cx, bodyY + 0.4, coreR, coreR * 0.85, pulse > 0.6 ? EMBER.core : EMBER.hi, "flame-core", 13);

  // A small flame lick on top at most, slight flicker
  const lickH = 2 + ((frame % 4) === 1 ? 1 : 0);
  const lickX = cx + ((frame % 4) === 2 ? 1 : (frame % 4) === 0 ? -1 : 0);
  fillEllipse(buf, lickX, bodyY - ry - 0.2, 1.4, 1.8 + lickH * 0.15, EMBER.lick, "lick", 9);
  plot(buf, Math.round(lickX), Math.round(bodyY - ry - lickH), EMBER.core, "lick", 9);

  // Cute vertical oval eyes (dark with a white highlight). Skip on true back.
  if (key !== "n") {
    const eyeY = bodyY - 0.8;
    const eyes = key === "e"
      ? [[cx + 2.2, eyeY]]
      : [[cx - 2.4, eyeY], [cx + 2.4, eyeY]];
    for (const [ex, ey] of eyes) {
      if (blink === "closed" || blink === "half") {
        plot(buf, Math.round(ex - 1), Math.round(ey), EYE, "eye", 20);
        plot(buf, Math.round(ex), Math.round(ey), EYE, "eye", 20);
        plot(buf, Math.round(ex + 1), Math.round(ey), EYE, "eye", 20);
      } else {
        // Vertical oval, ~2px wide and ~4px tall
        fillEllipse(buf, ex, ey, 1.15, 2.15, EYE, "eye", 20);
        plot(buf, Math.round(ex), Math.round(ey - 1), WHITE, "eye-hi", 22);
      }
    }
  }

  // Small flame sparks that pop, drift up, and fade over the 8-frame cycle.
  const sparks = sparkLayout(cx, bodyY - ry, frame, key);
  for (const s of sparks) {
    plot(buf, s.x, s.y, s.col, "spark", 8, s.a);
    if (s.a > 180) plot(buf, s.x, s.y - 1, SPARK.hi, "spark", 8, Math.max(40, s.a - 80));
  }
  return buf;
}

function sparkLayout(cx, topY, frame, key) {
  const phase = ((frame % 8) + 8) % 8;
  const seeds = [
    { id: 0, x0: -4, born: 0, life: 5 },
    { id: 1, x0: 3, born: 2, life: 5 },
    { id: 2, x0: 0, born: 4, life: 5 },
    { id: 3, x0: 5, born: 6, life: 4 },
  ];
  const out = [];
  for (const s of seeds) {
    const age = (phase - s.born + 8) % 8;
    if (age >= s.life) continue;
    const t = age / s.life;
    const drift = (s.id % 2 === 0 ? -1 : 1) * t * 2;
    const side = key === "e" ? 1 : 1;
    const x = Math.round(cx + s.x0 * side + drift);
    const y = Math.round(topY - 1 - t * 5);
    const a = Math.round(230 * (1 - t * t));
    const col = t < 0.35 ? SPARK.hi : (t < 0.7 ? SPARK.mid : SPARK.sh);
    if (a > 30) out.push({ x, y, col, a });
  }
  return out;
}

/** Additive radial halo drawn in room space, around the sprite's body. */
export function drawFlameGlow(ctx, sx, sy, frame = 0, lightsOn = true) {
  if (!ctx) return;
  const cx = sx + PET_W / 2;
  const cy = sy + PET_GROUND_Y - 9;
  const pulse = 0.85 + 0.15 * Math.sin((frame / 8) * Math.PI * 2);
  const amp = (lightsOn ? 0.20 : 0.55) * pulse;
  const r = lightsOn ? 14 : 19;
  const g = ctx.createRadialGradient(cx, cy, 1.5, cx, cy, r);
  g.addColorStop(0, `rgba(255, 180, 70, ${amp})`);
  g.addColorStop(0.4, `rgba(255, 90, 24, ${amp * 0.42})`);
  g.addColorStop(1, "rgba(255, 40, 0, 0)");
  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.ellipse(cx, cy, r, r * 0.88, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

export function installFlamePet(setPetKindDrawer) {
  if (typeof setPetKindDrawer === "function") setPetKindDrawer("flame", drawFlamePet);
}

if (typeof window !== "undefined") {
  window.__drawFlamePet = drawFlamePet;
  window.__drawFlameGlow = drawFlameGlow;
}

export default { drawFlamePet, drawFlameGlow, installFlamePet };
