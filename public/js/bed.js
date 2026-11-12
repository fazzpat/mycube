/* Single bed: a 1x2 floor blanket with one pillow, plus a lie-down pose.
   The sleeper is aligned by visible pixels to the blanket's top-face centroid. */
export const BED_TYPE = "bed";
export const BED_NAME = "Bed";
export const BED_PRICE = 45;
export const BED_TILES = [1, 2];

export const BLANKET_INSET = 0.06;
export const BLANKET_LIFT = 0;
export const BLANKET_THICK = 5;
export const PILLOW_DEPTH = 0.34;
export const PILLOW_SIDE = 0.08;
export const PILLOW_END = 0.05;
export const PILLOW_THICK = 5;

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

/** Local tile-space rectangle of the blanket, shared by the sprite and the lie pose. */
export function blanketLocal(rot = 0) {
  const { w, h } = bedDims(rot);
  return {
    x: BLANKET_INSET,
    y: BLANKET_INSET,
    w: w - 2 * BLANKET_INSET,
    h: h - 2 * BLANKET_INSET,
    lift: BLANKET_LIFT,
    thick: BLANKET_THICK,
    top: BLANKET_LIFT + BLANKET_THICK,
  };
}

/** White pillow at the head end, resting on the blanket. */
export function pillowLocal(rot = 0) {
  const r = normalizeBedRot(rot);
  const b = blanketLocal(r);
  const d = PILLOW_DEPTH, s = PILLOW_SIDE, e = PILLOW_END;
  if (r === 0) return { x: b.x + s, y: b.y + e, w: b.w - s * 2, h: d };
  if (r === 1) return { x: b.x + e, y: b.y + s, w: d, h: b.h - s * 2 };
  if (r === 2) return { x: b.x + s, y: b.y + b.h - e - d, w: b.w - s * 2, h: d };
  return { x: b.x + b.w - e - d, y: b.y + s, w: d, h: b.h - s * 2 };
}

/** A soft fold just below the pillow, still on the blanket. */
export function foldLocal(rot = 0) {
  const r = normalizeBedRot(rot);
  const b = blanketLocal(r);
  const d = 0.10, s = 0.05;
  const start = PILLOW_END + PILLOW_DEPTH + 0.02;
  if (r === 0) return { x: b.x + s, y: b.y + start, w: b.w - s * 2, h: d };
  if (r === 1) return { x: b.x + start, y: b.y + s, w: d, h: b.h - s * 2 };
  if (r === 2) return { x: b.x + s, y: b.y + b.h - start - d, w: b.w - s * 2, h: d };
  return { x: b.x + b.w - start - d, y: b.y + s, w: d, h: b.h - s * 2 };
}

function xy(toScreen, x, y, lift = 0) {
  const s = toScreen(x, y);
  const sx = s.sx != null ? s.sx : s.x;
  const sy = (s.sy != null ? s.sy : s.y) - lift;
  return { sx, sy };
}

/** Four corners of the blanket's raised top face, in world screen space (N,E,S,W). */
export function blanketTopQuad(furn, toScreen) {
  const r = normalizeBedRot(furn.rot);
  const b = blanketLocal(r);
  const ox = Number(furn.x) || 0;
  const oy = Number(furn.y) || 0;
  const top = b.top;
  return {
    N: xy(toScreen, ox + b.x, oy + b.y, top),
    E: xy(toScreen, ox + b.x + b.w, oy + b.y, top),
    S: xy(toScreen, ox + b.x + b.w, oy + b.y + b.h, top),
    W: xy(toScreen, ox + b.x, oy + b.y + b.h, top),
    lift: top,
  };
}

export function quadCentroid(q) {
  const pts = [q.N, q.E, q.S, q.W];
  return {
    sx: (pts[0].sx + pts[1].sx + pts[2].sx + pts[3].sx) / 4,
    sy: (pts[0].sy + pts[1].sy + pts[2].sy + pts[3].sy) / 4,
  };
}

/** Head-end tile and foot-end tile, plus a pose aimed along the blanket. */
export function liePose(furn) {
  const r = normalizeBedRot(furn.rot);
  const x = Number(furn.x) || 0;
  const y = Number(furn.y) || 0;
  let hx, hy, fx, fy, facing;
  if (r === 0) { hx = x; hy = y; fx = x; fy = y + 1; facing = { x: 0, z: 1 }; }
  else if (r === 1) { hx = x; hy = y; fx = x + 1; fy = y; facing = { x: 1, z: 0 }; }
  else if (r === 2) { hx = x; hy = y + 1; fx = x; fy = y; facing = { x: 0, z: -1 }; }
  else { hx = x + 1; hy = y; fx = x; fy = y; facing = { x: -1, z: 0 }; }
  const along = 0.22;
  const head = {
    x: hx + 0.5 + facing.x * (along - 0.5),
    y: hy + 0.5 + facing.z * (along - 0.5),
  };
  const foot = { x: fx + 0.5, y: fy + 0.5 };
  const dims = bedDims(r);
  return {
    x: x + dims.w / 2,
    y: y + dims.h / 2,
    facing,
    head,
    foot,
    rot: r,
  };
}

/**
 * Axis-aligned bbox of non-transparent sprite pixels after the lying transform
 * (translate(headSx, headSy), rotate(angle), draw at (-avW/2, -headDrawY)).
 */
export function visibleLieBBox(imageData, angle, headSx, headSy, avW, avH, headDrawY, alphaMin = 16) {
  if (!imageData || !imageData.data) return null;
  const cos = Math.cos(angle), sin = Math.sin(angle);
  const data = imageData.data;
  const w = imageData.width, h = imageData.height;
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity, n = 0;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (data[(y * w + x) * 4 + 3] < alphaMin) continue;
      const lx = x - avW / 2;
      const ly = y - headDrawY;
      const sx = headSx + lx * cos - ly * sin;
      const sy = headSy + lx * sin + ly * cos;
      if (sx < minX) minX = sx;
      if (sy < minY) minY = sy;
      if (sx > maxX) maxX = sx;
      if (sy > maxY) maxY = sy;
      n += 1;
    }
  }
  if (!n) return null;
  return { minX, minY, maxX, maxY, cx: (minX + maxX) / 2, cy: (minY + maxY) / 2, n, w: maxX - minX, h: maxY - minY };
}

function imageDataOf(src, avW, avH) {
  if (!src) return null;
  if (src.data && src.width != null) return src;
  if (typeof src.getContext === "function") {
    try {
      return src.getContext("2d").getImageData(0, 0, avW || src.width, avH || src.height);
    } catch {
      return null;
    }
  }
  return null;
}

/**
 * Screen-space pose for drawing a full-size standing sprite lying on the blanket.
 * After translate(headSx, headSy) and rotate(angle), draw the sprite at
 * (-avW/2, -headDrawY). If an avatar canvas or ImageData is provided, the
 * visible-pixel bbox is shifted so its center matches the blanket top-face
 * centroid (the previous check used the floor-tile center and a geometric
 * mid-body, which left the sleeper hanging off the front edge).
 */
export function lieDrawPose(furn, toScreen, opts = {}) {
  const headTop = opts.headTop != null ? opts.headTop : 9;
  const groundY = opts.groundY != null ? opts.groundY : 69;
  const headDrawY = headTop + (opts.headPad != null ? opts.headPad : 1);
  const avW = opts.avW != null ? opts.avW : 72;
  const avH = opts.avH != null ? opts.avH : 72;
  const bodyLen = groundY - headDrawY;
  const half = bodyLen / 2;
  const pose = liePose(furn);
  const head = xy(toScreen, pose.head.x, pose.head.y);
  const foot = xy(toScreen, pose.foot.x, pose.foot.y);
  const quad = blanketTopQuad(furn, toScreen);
  const center = quadCentroid(quad);
  const angle = Math.atan2(foot.sy - head.sy, foot.sx - head.sx) - Math.PI / 2;
  // Start with the geometric mid-body on the blanket centroid, then correct
  // by the visible-pixel bbox if we have the sprite.
  let headSx = center.sx + half * Math.sin(angle);
  let headSy = center.sy - half * Math.cos(angle);
  let bbox = null;
  const img = imageDataOf(opts.avatar || opts.imageData, avW, avH);
  if (img) {
    bbox = visibleLieBBox(img, angle, headSx, headSy, avW, avH, headDrawY);
    if (bbox) {
      headSx += center.sx - bbox.cx;
      headSy += center.sy - bbox.cy;
      bbox = visibleLieBBox(img, angle, headSx, headSy, avW, avH, headDrawY);
    }
  }
  const avCx = bbox ? bbox.cx : (headSx - half * Math.sin(angle));
  const avCy = bbox ? bbox.cy : (headSy + half * Math.cos(angle));
  return {
    angle,
    headSx,
    headSy,
    centerSx: center.sx,
    centerSy: center.sy,
    avCx,
    avCy,
    dx: avCx - center.sx,
    dy: avCy - center.sy,
    half,
    bodyLen,
    headDrawY,
    quad,
    bbox,
    rot: pose.rot,
    facing: pose.facing,
    head: pose.head,
    foot: pose.foot,
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

export default {
  BED_TYPE, BED_NAME, BED_PRICE, BED_TILES,
  BLANKET_INSET, BLANKET_LIFT, BLANKET_THICK,
  bedDims, bedTiles, blanketLocal, pillowLocal, foldLocal,
  blanketTopQuad, quadCentroid, visibleLieBBox,
  liePose, lieDrawPose, migrateBed, bedZeds, drawBedZeds,
};
