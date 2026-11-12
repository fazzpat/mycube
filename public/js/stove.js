/* 1x1 kitchen range: four burners, oven door, knobs, and a large pot.
   Tapping toggles a small flame under the pot and steam from the lid. */

export const STOVE_TYPE = "stove";
export const STOVE_NAME = "Stove";
export const STOVE_PRICE = 30;
export const STOVE_TILES = [1, 1];
export const STEAM_FRAMES = 6;
export const FLAME_FRAMES = 5;

export function steamFrameAt(now = Date.now()) {
  return Math.floor(now / 180) % STEAM_FRAMES;
}

export function flameFrameAt(now = Date.now()) {
  return Math.floor(now / 110) % FLAME_FRAMES;
}

function potCell(rot) {
  const r = ((Number(rot) % 4) + 4) % 4;
  // Near-left burner of the visible front, so the pot sits toward the camera.
  if (r === 0) return { u: 0.30, v: 0.70 };
  if (r === 1) return { u: 0.70, v: 0.30 };
  if (r === 2) return { u: 0.70, v: 0.30 };
  return { u: 0.30, v: 0.70 };
}

function drawBurner(ctx, x, y, size, lift, metal, ink, iso) {
  const { box, shade } = iso;
  const s = size;
  box(ctx, x - s / 2, y - s / 2, s, s, lift, 1.2, metal);
  box(ctx, x - s * 0.28, y - s * 0.28, s * 0.56, s * 0.56, lift + 1.2, 0.6, {
    top: shade(metal.base || "#3a3a40", -20),
    left: metal.left,
    right: metal.right,
    outline: ink,
  });
}

function frontOffset(rot, amount) {
  const r = ((Number(rot) % 4) + 4) % 4;
  if (r === 0) return { x: 0, y: amount };
  if (r === 1) return { x: amount, y: 0 };
  if (r === 2) return { x: 0, y: -amount };
  return { x: -amount, y: 0 };
}

function drawFlameLick(ctx, x, y, lift, h, w, colors, iso) {
  const { diamond, fillPts } = iso;
  const core = diamond(x - w * 0.35, y - w * 0.35, w * 0.7, w * 0.7, lift + h);
  fillPts(ctx, [core.N, core.E, core.S, core.W], colors[0], null);
  const mid = diamond(x - w * 0.55, y - w * 0.55, w * 1.1, w * 1.1, lift + h * 0.5);
  fillPts(ctx, [mid.N, mid.E, mid.S, mid.W], colors[1], null);
  const base = diamond(x - w * 0.7, y - w * 0.7, w * 1.4, w * 1.4, lift + 0.8);
  fillPts(ctx, [base.N, base.E, base.S, base.W], colors[2], null);
}

function drawFlame(ctx, x, y, lift, lights, frame, rot, iso) {
  const phase = ((frame % FLAME_FRAMES) + FLAME_FRAMES) % FLAME_FRAMES;
  const colors = lights
    ? ["#fff3b0", "#ff9a2a", "#e84818"]
    : ["#ffe070", "#ff8a20", "#d04010"];
  // Push the licks out from under the near rim so a small flame is visible around the pot.
  const fwd = frontOffset(rot, 0.16);
  const side = frontOffset((rot + 1) % 4, 0.10);
  const heights = [3.6 + (phase % 3) * 1.2, 2.6 + ((phase + 1) % 3) * 1.0, 3.0 + ((phase + 2) % 3) * 0.9];
  const spots = [
    { x: x + fwd.x, y: y + fwd.y, h: heights[0], w: 0.09 },
    { x: x + fwd.x * 0.7 + side.x, y: y + fwd.y * 0.7 + side.y, h: heights[1], w: 0.07 },
    { x: x + fwd.x * 0.7 - side.x, y: y + fwd.y * 0.7 - side.y, h: heights[2], w: 0.07 },
  ];
  ctx.save();
  ctx.globalAlpha = lights ? 0.95 : 1;
  for (const s of spots) drawFlameLick(ctx, s.x, s.y, lift, s.h, s.w, colors, iso);
  ctx.restore();
}

function drawSteam(ctx, x, y, lift, lights, frame, iso) {
  const { diamond, fillPts, shade } = iso;
  const colors = lights
    ? ["#ffffff", "#f4efe6", "#e0d8cc"]
    : [shade("#f4efe6", -20), shade("#e0d8cc", -20), shade("#c8c0b4", -16)];
  for (let i = 0; i < 5; i++) {
    const phase = (frame + i * 2) % STEAM_FRAMES;
    const rise = 5 + phase * 3.8 + (i % 2) * 2.0;
    const wobble = ((i % 2 === 0) ? 1 : -1) * (0.025 + phase * 0.016);
    const s = Math.max(0.04, 0.13 - phase * 0.014);
    const a = (1 - phase / (STEAM_FRAMES + 0.5)) * (lights ? 0.9 : 0.7);
    if (a < 0.12) continue;
    ctx.globalAlpha = a;
    const d = diamond(x + wobble - s / 2, y - s / 2, s, s, lift + rise);
    fillPts(ctx, [d.N, d.E, d.S, d.W], colors[i % colors.length], null);
  }
  ctx.globalAlpha = 1;
}

export function drawStove(ctx, tw, th, rot, lights, opts, iso) {
  const {
    box, pal, shadow, insetBox, visibleFront, faceCorners, faceRect, shade,
  } = iso;
  const on = Boolean(opts?.on);
  const steamFrame = ((opts?.steamFrame ?? 0) % STEAM_FRAMES + STEAM_FRAMES) % STEAM_FRAMES;
  const flameFrame = ((opts?.flameFrame ?? 0) % FLAME_FRAMES + FLAME_FRAMES) % FLAME_FRAMES;
  const r = ((Number(rot) % 4) + 4) % 4;

  const full = insetBox(tw, th);
  const body = { x: full.x + 0.05, y: full.y + 0.05, w: full.w - 0.10, h: full.h - 0.10 };
  const steel = pal("#6a6e74", lights, { top: "#9aa0a8" });
  const black = pal("#2a2c30", lights, { top: "#3a3c42" });
  const ink = steel.outline;
  shadow(ctx, body.x, body.y, body.w, body.h, 0.3);
  const cookH = 16;
  box(ctx, body.x, body.y, body.w, body.h, 0, cookH, steel);
  // Dark cooktop
  box(ctx, body.x + 0.04, body.y + 0.04, body.w - 0.08, body.h - 0.08, cookH, 1.6, black);

  const burners = [
    { u: 0.28, v: 0.28 },
    { u: 0.72, v: 0.28 },
    { u: 0.28, v: 0.72 },
    { u: 0.72, v: 0.72 },
  ];
  const metal = pal("#4a4e54", lights);
  for (const b of burners) {
    const x = body.x + 0.04 + b.u * (body.w - 0.08);
    const y = body.y + 0.04 + b.v * (body.h - 0.08);
    drawBurner(ctx, x, y, 0.22, cookH + 1.6, metal, ink, iso);
  }

  const potAt = potCell(r);
  const px = body.x + 0.04 + potAt.u * (body.w - 0.08);
  const py = body.y + 0.04 + potAt.v * (body.h - 0.08);
  const potLift = cookH + 2.4;

  if (on) {
    // Warm glow under the pot, stronger with the lights off so the flame still reads.
    const { diamond, fillPts } = iso;
    ctx.save();
    ctx.globalAlpha = lights ? 0.28 : 0.55;
    const glow = diamond(px - 0.16, py - 0.16, 0.32, 0.32, potLift - 0.4);
    fillPts(ctx, [glow.N, glow.E, glow.S, glow.W], lights ? "#ffb050" : "#ff8a30", null);
    ctx.restore();
  }

  // Large pot on the chosen burner.
  const pot = pal(lights ? "#4a5560" : "#2a3238", lights, { lid: lights ? "#6a7480" : "#3a4248", shin: "#c8d0d6" });
  const pw = 0.34, ph = 0.34;
  box(ctx, px - pw / 2, py - ph / 2, pw, ph, potLift, 8, pot);
  box(ctx, px - pw / 2 - 0.03, py - ph / 2 - 0.03, pw + 0.06, ph + 0.06, potLift + 8, 1.8, {
    top: lights ? pot.lid : shade(pot.lid, -10),
    left: pot.left,
    right: pot.right,
    outline: pot.outline,
  });
  // Lid knob
  box(ctx, px - 0.04, py - 0.04, 0.08, 0.08, potLift + 9.8, 2.2, pal("#d8dde2", lights));
  // A little handle sticking out toward the near-right.
  const hx = px + pw * 0.42, hy = py - ph * 0.05;
  box(ctx, hx, hy, 0.10, 0.08, potLift + 4, 1.4, pal("#c4c8cc", lights));

  if (on) {
    drawFlame(ctx, px, py, potLift, lights, flameFrame, r, iso);
    drawSteam(ctx, px, py, potLift + 12, lights, steamFrame, iso);
  }

  const front = visibleFront(r);
  if (front) {
    const fc = faceCorners(body.x, body.y, body.w, body.h, 0, cookH, front);
    // Oven door and window
    faceRect(ctx, fc, 0.10, 0.10, 0.90, 0.72, lights ? "#3a3c42" : "#222428", ink);
    const glass = on && !lights ? "#3a2010" : (lights ? "#1a1c22" : "#101114");
    faceRect(ctx, fc, 0.20, 0.18, 0.80, 0.58, glass, ink);
    if (on) {
      // Faint oven glow in the window.
      faceRect(ctx, fc, 0.28, 0.28, 0.72, 0.50, lights ? "#6a3818" : "#c06020", null);
    }
    faceRect(ctx, fc, 0.36, 0.62, 0.64, 0.68, lights ? "#8a8e94" : "#5a5e64", ink);
    // Four knobs along the bottom rail
    for (const u of [0.18, 0.38, 0.62, 0.82]) {
      faceRect(ctx, fc, u - 0.06, 0.78, u + 0.06, 0.94, lights ? "#2a2c30" : "#1a1c20", ink);
      faceRect(ctx, fc, u - 0.03, 0.82, u + 0.03, 0.90, lights ? (on ? "#e8a030" : "#c4c8cc") : (on ? "#c07020" : "#6a6e74"), null);
    }
  }
}

export default {
  STOVE_TYPE, STOVE_NAME, STOVE_PRICE, STOVE_TILES,
  steamFrameAt, flameFrameAt, drawStove,
};
