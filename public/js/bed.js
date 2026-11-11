/* Single bed: 1x2 footprint, lie-down pose, and a graceful shrink from the old 2x3 size. */
export const BED_TYPE = "bed";
export const BED_NAME = "Bed";
export const BED_PRICE = 45;
export const BED_TILES = [1, 2];

export function normalizeBedRot(rot) {
  const n = Number(rot);
  if (!Number.isFinite(n)) return 0;
  return ((Math.round(n) % 4) + 4) % 4;
}

export function bedDims(rot = 0) {
  const r = normalizeBedRot(rot);
  return r % 2 === 1 ? { w: 2, h: 1 } : { w: 1, h: 2 };
}

export function bedTiles(x, y, rot = 0) {
  const { w, h } = bedDims(rot);
  const out = [];
  for (let dy = 0; dy < h; dy++) for (let dx = 0; dx < w; dx++) out.push({ x: x + dx, y: y + dy });
  return out;
}

/** Headboard tile and foot tile (integer origins) plus a pose on the pillow. */
export function liePose(furn) {
  const r = normalizeBedRot(furn.rot);
  const x = Number(furn.x) || 0;
  const y = Number(furn.y) || 0;
  let hx, hy, fx, fy, facing;
  if (r === 0) { hx = x; hy = y; fx = x; fy = y + 1; facing = { x: 0, z: 1 }; }
  else if (r === 1) { hx = x; hy = y; fx = x + 1; fy = y; facing = { x: 1, z: 0 }; }
  else if (r === 2) { hx = x; hy = y + 1; fx = x; fy = y; facing = { x: 0, z: -1 }; }
  else { hx = x + 1; hy = y; fx = x; fy = y; facing = { x: -1, z: 0 }; }
  const head = { x: hx + 0.5, y: hy + 0.5 };
  const foot = { x: fx + 0.5, y: fy + 0.5 };
  const t = 0.28;
  return {
    x: head.x + (foot.x - head.x) * t,
    y: head.y + (foot.y - head.y) * t,
    facing,
    head,
    foot,
    rot: r,
  };
}

export function migrateBed(furn, size, canPlace) {
  const r0 = normalizeBedRot(furn.rot);
  const x0 = Math.round(Number(furn.x) || 0);
  const y0 = Math.round(Number(furn.y) || 0);
  if (canPlace(x0, y0, r0)) return { ...furn, x: x0, y: y0, rot: r0 };
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      for (const rot of [r0, 0, 1, 2, 3]) {
        if (canPlace(x, y, rot)) return { ...furn, x, y, rot };
      }
    }
  }
  return { ...furn, x: x0, y: y0, rot: r0 };
}

export function bedZeds(startedAt, now = Date.now()) {
  const t = Math.max(0, (now - (startedAt || now)) / 1000);
  const out = [];
  for (let i = 0; i < 3; i++) {
    const phase = (t * 0.55 + i * 0.33) % 1.6;
    const a = Math.max(0, 1 - phase / 1.5);
    if (a <= 0.05) continue;
    out.push({
      x: (i - 1) * 6 + Math.sin((t + i) * 2.1) * 2,
      y: -8 - phase * 14,
      a,
      s: 8 + i * 2,
    });
  }
  return out;
}

export function drawBedZeds(ctx, x, y, zeds, lights = true) {
  if (!zeds || !zeds.length) return;
  ctx.save();
  ctx.font = "bold 10px sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  for (const z of zeds) {
    ctx.globalAlpha = (lights ? 0.95 : 0.7) * z.a;
    ctx.fillStyle = lights ? "#5a4060" : "#c8b8d8";
    ctx.font = `bold ${z.s}px sans-serif`;
    ctx.fillText("z", x + z.x, y + z.y);
  }
  ctx.restore();
}

export default { BED_TYPE, BED_NAME, BED_PRICE, BED_TILES, bedDims, bedTiles, liePose, migrateBed, bedZeds, drawBedZeds };
