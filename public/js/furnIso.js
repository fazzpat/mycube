/* Isometric furniture sprites — edges stay parallel to the floor-tile grid.
   Rotation is only the 4 axis directions: 0 = +Y (SW), 1 = +X (SE), 2 = -Y (NE), 3 = -X (NW). */
import { drawCoffeeMaker } from "./coffeeMaker.js";
import { heldItemStamp } from "./heldItems.js";
import { drawRecordPlayer, TYPE as RECORD_PLAYER } from "./recordPlayer.js";
import { drawChessTableSmall, drawChessStool, CHESS_STOOL_TYPE } from "./chessTable.js";
import { drawStove } from "./stove.js";
import { drawPoolTable } from "./billiards.js";
import { blanketLocal, pillowLocal, foldLocal, BLANKET_LIFT, BLANKET_THICK, PILLOW_THICK } from "./bed.js";
import { isSeatType } from "./seats.js";

const TW = 64;
const TH = 32;
const I = 0.125;

const TILES = {
  rug: [2, 2], plant: [1, 1], podplant: [1, 1], lamp: [1, 1], table: [2, 1],
  coffeetable: [2, 1], couch: [2, 1], capsulecouch: [2, 1], bed: [1, 2],
  tv: [2, 1], holotv: [2, 1], fridge: [1, 1], kitchenette: [2, 1], chair: [1, 1],
  hoverchair: [1, 1], bookshelf: [2, 1], chesstable: [1, 1], chessstool: [1, 1], punchbag: [1, 1],
  heavybag: [1, 1], benchpress: [2, 1], treadmill: [1, 2], cubics: [1, 1],
  clothescab: [1, 1], coffeemachine: [1, 1], stove: [1, 1], recordplayer: [1, 1], djdeck: [2, 1], sodavending: [1, 1],
  neonsign: [1, 1], pinball: [1, 1], rack: [1, 1], mannequin: [1, 1],
  petpen: [2, 1], cage: [1, 1], counter: [2, 1], pooltable: [2, 2],
};

const BODY_H = {
  rug: 4, plant: 36, podplant: 38, lamp: 48, table: 18, coffeetable: 14, counter: 20,
  couch: 26, capsulecouch: 26, chair: 24, hoverchair: 32, bed: 14, tv: 60, holotv: 60,
  fridge: 44, kitchenette: 24, bookshelf: 42, chesstable: 14, chessstool: 14, punchbag: 46, heavybag: 46,
  benchpress: 22, treadmill: 30, cubics: 64, pinball: 40, clothescab: 42, coffeemachine: 48, stove: 40, recordplayer: 40,
  djdeck: 18, sodavending: 46, neonsign: 46, rack: 36, mannequin: 42, petpen: 22, cage: 24, pooltable: 18,
};

export const FURN_SHEET_TYPES = [
  "rug", "plant", "podplant", "lamp", "neonsign", "table", "coffeetable", "counter",
  "chair", "hoverchair", "couch", "capsulecouch", "bed", "tv", "holotv", "fridge",
  "kitchenette", "bookshelf", "clothescab", "chesstable", "coffeemachine", "stove", "recordplayer", "cubics",
  "pinball", "djdeck", "sodavending", "punchbag", "benchpress", "treadmill",
  "rack", "mannequin", "petpen", "cage", "pooltable",
];

export function normalizeFurnRot(rot) {
  const n = Number(rot);
  if (!Number.isFinite(n)) return 0;
  if (Math.abs(n) >= 45) {
    const deg = ((n % 360) + 360) % 360;
    return Math.round(deg / 90) % 4;
  }
  return ((Math.round(n) % 4) + 4) % 4;
}

export function snapFacingToAxis(facing) {
  const dx = Number(facing?.x) || 0;
  const dz = Number(facing?.z ?? facing?.y) || 0;
  if (dx === 0 && dz === 0) return { x: 0, z: 1 };
  if (Math.abs(dx) >= Math.abs(dz)) return { x: dx >= 0 ? 1 : -1, z: 0 };
  return { x: 0, z: dz >= 0 ? 1 : -1 };
}

export function furnTileDims(type, rot = 0) {
  const r = normalizeFurnRot(rot);
  const iso = (typeof window !== "undefined" && window.HouseIso) || {};
  if (typeof iso.dims === "function") {
    const d = iso.dims(type, r);
    if (d && d.w && d.h) return { w: d.w, h: d.h };
  }
  const [w, h] = TILES[type] || [1, 1];
  return r % 2 === 1 ? { w: h, h: w } : { w, h };
}

export function furnBodyHeight(type) {
  return BODY_H[type] || 24;
}

export function furnSpriteMetrics(type, rot = 0, opts = {}) {
  const { w, h } = furnTileDims(type, rot);
  const bodyH = furnBodyHeight(type);
  const pad = 2;
  // Extra left pad so an open fridge door isn't clipped, without shifting the body.
  const doorPad = (type === "fridge" && opts && opts.open) ? 30 : 0;
  const ox = pad + h * (TW / 2) + doorPad;
  const oy = pad + bodyH;
  const width = pad * 2 + (w + h) * (TW / 2) + doorPad;
  const height = pad * 2 + (w + h) * (TH / 2) + bodyH;
  return { w: width, h: height, ox, oy, tw: w, th: h, bodyH, pad, doorPad };
}

export function furnBlitPos(tx, ty, type, rot, toScreen, opts) {
  const m = furnSpriteMetrics(type, rot, opts);
  const top = toScreen(tx, ty);
  const sx = (top.sx ?? top.x) - m.ox;
  const sy = (top.sy ?? top.y) - m.oy;
  return { sx, sy, w: m.w, h: m.h, ox: m.ox, oy: m.oy, tw: m.tw, th: m.th, bodyH: m.bodyH };
}

function hexToRgb(hex) {
  const n = parseInt(String(hex).replace("#", ""), 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}
function shade(hex, amt) {
  const { r, g, b } = hexToRgb(hex);
  const c = (v) => Math.max(0, Math.min(255, v + amt));
  return "#" + ((1 << 24) + (c(r) << 16) + (c(g) << 8) + c(b)).toString(16).slice(1);
}

function pal(base, lights, extra = {}) {
  const dim = lights ? 0 : -36;
  return {
    top: shade(base, (lights ? 28 : 8) + dim),
    left: shade(base, -8 + dim),
    right: shade(base, -28 + dim),
    outline: shade(base, -72),
    base,
    ...Object.fromEntries(Object.entries(extra).map(([k, v]) => [k, lights ? v : shade(v, -36)])),
  };
}

function pt(x, y, lift = 0) {
  return { x: (x - y) * (TW / 2), y: (x + y) * (TH / 2) - lift };
}
function diamond(x, y, w, h, lift = 0) {
  return { N: pt(x, y, lift), E: pt(x + w, y, lift), S: pt(x + w, y + h, lift), W: pt(x, y + h, lift) };
}
function path(ctx, pts) {
  ctx.beginPath();
  ctx.moveTo(pts[0].x, pts[0].y);
  for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
  ctx.closePath();
}
function fillPts(ctx, pts, fill, stroke) {
  if (!pts || !pts.length) return;
  path(ctx, pts);
  if (fill) { ctx.fillStyle = fill; ctx.fill(); }
  if (stroke) {
    ctx.strokeStyle = stroke;
    ctx.lineWidth = 1;
    ctx.lineJoin = "miter";
    ctx.stroke();
  }
}

function shadow(ctx, x, y, w, h, a = 0.32) {
  const d = diamond(x, y, w, h, 0);
  ctx.globalAlpha = a;
  fillPts(ctx, [d.N, d.E, d.S, d.W], "#000", null);
  ctx.globalAlpha = 1;
}

function box(ctx, x, y, w, h, lift, height, colors) {
  if (height <= 0 || w <= 0 || h <= 0) {
    const d = diamond(x, y, w, h, lift);
    fillPts(ctx, [d.N, d.E, d.S, d.W], colors.top, colors.outline);
    return;
  }
  const b = diamond(x, y, w, h, lift);
  const t = diamond(x, y, w, h, lift + height);
  fillPts(ctx, [b.W, b.S, t.S, t.W], colors.left, colors.outline);
  fillPts(ctx, [b.E, b.S, t.S, t.E], colors.right, colors.outline);
  fillPts(ctx, [t.N, t.E, t.S, t.W], colors.top, colors.outline);
}

function faceCorners(x, y, w, h, lift, height, which) {
  const b = diamond(x, y, w, h, lift);
  const t = diamond(x, y, w, h, lift + height);
  if (which === "+y") return [b.W, b.S, t.S, t.W];
  if (which === "+x") return [b.E, b.S, t.S, t.E];
  if (which === "-y") return [b.N, b.E, t.E, t.N];
  return [b.N, b.W, t.W, t.N];
}

function visibleFront(rot) {
  const r = normalizeFurnRot(rot);
  if (r === 0) return "+y";
  if (r === 1) return "+x";
  return null;
}

function lerp2(a, b, t) {
  return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
}

function faceRect(ctx, corners, u0, v0, u1, v1, fill, stroke) {
  const [bl, br, tr, tl] = corners;
  const p = (u, v) => lerp2(lerp2(bl, br, u), lerp2(tl, tr, u), v);
  fillPts(ctx, [p(u0, v0), p(u1, v0), p(u1, v1), p(u0, v1)], fill, stroke);
}

function faceImage(ctx, corners, u0, v0, u1, v1, img) {
  if (!img) return;
  const [bl, br, tr, tl] = corners;
  const p = (u, v) => lerp2(lerp2(bl, br, u), lerp2(tl, tr, u), v);
  const A = p(u0, v0), B = p(u1, v0), D = p(u0, v1);
  ctx.save();
  ctx.imageSmoothingEnabled = false;
  ctx.beginPath();
  const C = p(u1, v1);
  ctx.moveTo(A.x, A.y); ctx.lineTo(B.x, B.y); ctx.lineTo(C.x, C.y); ctx.lineTo(D.x, D.y); ctx.closePath();
  ctx.clip();
  ctx.transform(B.x - A.x, B.y - A.y, D.x - A.x, D.y - A.y, A.x, A.y);
  ctx.drawImage(img, 0, 0, img.width, img.height, 0, 0, 1, 1);
  ctx.restore();
}

const TV_SCREEN_UV = { u0: 0.05, v0: 0.08, u1: 0.95, v1: 0.90 };

function tvLayout(tw, th, rot = 0) {
  const full = insetBox(tw, th);
  const standH = 10;
  const bodyH = 44;
  const r = normalizeFurnRot(rot);
  // Thin panel centered on the console top (horizontally and in depth).
  const x0 = I, y0 = I, fw = tw - 2 * I, fh = th - 2 * I;
  const depth = Math.min(0.16, (r % 2 === 0 ? fh : fw) * 0.5);
  const panel = r % 2 === 0
    ? { x: x0, y: y0 + (fh - depth) / 2, w: fw, h: depth }
    : { x: x0 + (fw - depth) / 2, y: y0, w: depth, h: fh };
  const pad = 0.05;
  const body = r % 2 === 0
    ? { x: panel.x + pad, y: panel.y, w: Math.max(0.2, panel.w - pad * 2), h: panel.h }
    : { x: panel.x, y: panel.y + pad, w: panel.w, h: Math.max(0.2, panel.h - pad * 2) };
  return { full, standH, bodyH, body };
}

function tvFrontCorners(tw, th, rot) {
  const L = tvLayout(tw, th, rot);
  const front = visibleFront(rot);
  if (!front) return null;
  return faceCorners(L.body.x, L.body.y, L.body.w, L.body.h, L.standH, L.bodyH, front);
}

function uvQuad(corners, uv) {
  const [bl, br, tr, tl] = corners;
  const p = (u, v) => lerp2(lerp2(bl, br, u), lerp2(tl, tr, u), v);
  return [p(uv.u0, uv.v0), p(uv.u1, uv.v0), p(uv.u1, uv.v1), p(uv.u0, uv.v1)];
}

export function tvScreenQuad(tw, th, rot) {
  const fc = tvFrontCorners(tw, th, rot);
  if (!fc) return null;
  return uvQuad(fc, TV_SCREEN_UV);
}

export function tvScreenQuadSprite(type, rot) {
  const m = furnSpriteMetrics(type, rot);
  const q = tvScreenQuad(m.tw, m.th, rot);
  if (!q) return null;
  return q.map((p) => ({ x: p.x + m.ox, y: p.y + m.oy }));
}

function backRect(tw, th, rot, depth) {
  const x0 = I, y0 = I, w = tw - 2 * I, h = th - 2 * I;
  const d = Math.min(depth, (rot % 2 === 0 ? h : w) * 0.5);
  if (rot === 0) return { x: x0, y: y0, w, h: d };
  if (rot === 1) return { x: x0, y: y0, w: d, h };
  if (rot === 2) return { x: x0, y: y0 + h - d, w, h: d };
  return { x: x0 + w - d, y: y0, w: d, h };
}

function frontRect(tw, th, rot, depth) {
  return backRect(tw, th, (normalizeFurnRot(rot) + 2) % 4, depth);
}

function seatRect(tw, th, rot, backDepth) {
  const x0 = I, y0 = I, w = tw - 2 * I, h = th - 2 * I;
  const d = Math.min(backDepth, (rot % 2 === 0 ? h : w) * 0.5);
  if (rot === 0) return { x: x0, y: y0 + d, w, h: h - d };
  if (rot === 1) return { x: x0 + d, y: y0, w: w - d, h };
  if (rot === 2) return { x: x0, y: y0, w, h: h - d };
  return { x: x0, y: y0, w: w - d, h };
}

function midSplit(rect, rot) {
  if (rot % 2 === 0) {
    return [
      { x: rect.x, y: rect.y, w: rect.w / 2, h: rect.h },
      { x: rect.x + rect.w / 2, y: rect.y, w: rect.w / 2, h: rect.h },
    ];
  }
  return [
    { x: rect.x, y: rect.y, w: rect.w, h: rect.h / 2 },
    { x: rect.x, y: rect.y + rect.h / 2, w: rect.w, h: rect.h / 2 },
  ];
}

function glyph(ctx, x, y, text, color, size = 6) {
  ctx.fillStyle = color;
  ctx.font = `bold ${size}px monospace`;
  ctx.textBaseline = "middle";
  ctx.fillText(text, x, y);
}

function faceGlyph(ctx, corners, text, color, u0, v0, u1, v1, gap = 0.15) {
  const glyphs = {
    C: ["#####","#    ","#    ","#    ","#####"],
    U: ["#   #","#   #","#   #","#   #","#####"],
    B: ["#### ","#   #","#### ","#   #","#### "],
    I: ["###"," # "," # "," # ","###"],
    E: ["#####","#    ","#### ","#    ","#####"],
    S: [" ####","#    "," ### ","    #","#### "],
  };
  const letters = String(text).split("");
  const slot = (1 - gap * (letters.length - 1) / letters.length) / letters.length;
  letters.forEach((ch, i) => {
    const rows = glyphs[ch];
    if (!rows) return;
    const lu0 = i * (slot + gap / letters.length);
    const lu1 = lu0 + slot;
    const rowsN = rows.length, colsN = rows[0].length;
    for (let r = 0; r < rowsN; r++) {
      for (let c = 0; c < colsN; c++) {
        if (rows[r][c] !== "#") continue;
        const pu0 = u0 + (lu0 + (c / colsN) * (lu1 - lu0)) * (u1 - u0);
        const pu1 = u0 + (lu0 + ((c + 1) / colsN) * (lu1 - lu0)) * (u1 - u0);
        const pv1 = v1 - (r / rowsN) * (v1 - v0);
        const pv0 = v1 - ((r + 1) / rowsN) * (v1 - v0);
        faceRect(ctx, corners, pu0, pv0, pu1, pv1, color, null);
      }
    }
  });
}

const cache = new Map();
function sprite(key, w, h, draw) {
  let s = cache.get(key);
  if (s) return s;
  const c = (typeof document !== "undefined") ? document.createElement("canvas") : null;
  if (!c) return { c: null, w, h };
  c.width = Math.max(1, Math.ceil(w));
  c.height = Math.max(1, Math.ceil(h));
  const ctx = c.getContext("2d");
  ctx.imageSmoothingEnabled = false;
  draw(ctx, c.width, c.height);
  s = { c, w: c.width, h: c.height };
  cache.set(key, s);
  return s;
}

function insetBox(tw, th) {
  return { x: I, y: I, w: tw - 2 * I, h: th - 2 * I };
}

const ISO_DRAW = {
  TW, TH, I, box, pal, shade, shadow, diamond, fillPts, pt, insetBox,
  frontRect, backRect, visibleFront, faceCorners, faceRect, normalizeFurnRot,
};

function couchPal(kind, lights) {
  const studio = kind === "capsulecouch";
  const base = studio ? "#b41828" : "#9a1420";
  return pal(base, lights, { cushion: studio ? "#e83848" : "#d42838", pip: "#ffd0d4" });
}

function drawSeatBase(ctx, tw, th, rot, lights, kind) {
  const p = couchPal(kind, lights);
  const legs = pal("#5a3a28", lights);
  const seatH = 10;
  const backD = 0.28;
  const full = insetBox(tw, th);
  shadow(ctx, full.x, full.y, full.w, full.h, 0.34);
  const leg = 0.12;
  const spots = [
    [full.x + 0.04, full.y + 0.04],
    [full.x + full.w - leg - 0.04, full.y + 0.04],
    [full.x + 0.04, full.y + full.h - leg - 0.04],
    [full.x + full.w - leg - 0.04, full.y + full.h - leg - 0.04],
  ];
  for (const [lx, ly] of spots) box(ctx, lx, ly, leg, leg, 0, 4, legs);
  const seat = seatRect(tw, th, rot, backD);
  box(ctx, seat.x, seat.y, seat.w, seat.h, 4, seatH, {
    top: p.cushion, left: p.left, right: p.right, outline: p.outline,
  });
  const halves = midSplit(seat, rot);
  for (const c of halves) {
    box(ctx, c.x + 0.03, c.y + 0.03, Math.max(0.1, c.w - 0.06), Math.max(0.1, c.h - 0.06), 4 + seatH, 2, {
      top: lights ? p.pip : shade(p.pip, -30), left: p.left, right: p.right, outline: p.outline,
    });
  }
}

function drawSeatBack(ctx, tw, th, rot, lights, kind) {
  const p = couchPal(kind, lights);
  const backH = 22;
  const backD = 0.28;
  const back = backRect(tw, th, rot, backD);
  box(ctx, back.x, back.y, back.w, back.h, 4, backH, p);
  const front = visibleFront(rot);
  if (front) {
    const fc = faceCorners(back.x, back.y, back.w, back.h, 4, backH, front);
    faceRect(ctx, fc, 0.12, 0.2, 0.88, 0.85, lights ? shade(p.cushion, 18) : shade(p.cushion, -20), p.outline);
  }
}

function drawSeat(ctx, tw, th, rot, lights, kind, part = "all") {
  if (part !== "back") drawSeatBase(ctx, tw, th, rot, lights, kind);
  if (part !== "base") drawSeatBack(ctx, tw, th, rot, lights, kind);
}

function drawEggRings(ctx, tw, th, lights) {
  const cx = tw / 2, cy = th / 2;
  for (let z = 6; z <= 28; z += 2) {
    const t = (z - 6) / 22;
    const egg = 1 - Math.abs(t - 0.42) * 1.35;
    const rw = Math.max(0.18, 0.38 * egg);
    const rh = Math.max(0.18, 0.38 * egg);
    const col = t < 0.55
      ? (lights ? shade("#fff8ec", -Math.round(t * 20)) : shade("#c8c0b4", -20))
      : (lights ? shade("#e8e0d0", -10) : shade("#a8a090", -20));
    const d = diamond(cx - rw, cy - rh, rw * 2, rh * 2, z);
    fillPts(ctx, [d.N, d.E, d.S, d.W], col, shade("#5a5048", lights ? 0 : -30));
  }
}

function drawChair(ctx, tw, th, rot, lights, hover, part = "all") {
  const full = insetBox(tw, th);
  if (hover) {
    // Symmetric shell: draw the whole egg in the base layer. A clipped front
    // lip read as a flat lid, so the sitter is raised onto the cushion instead.
    if (part === "front") return;
    shadow(ctx, full.x, full.y, full.w, full.h, 0.3);
    const base = pal("#8a8e92", lights);
    box(ctx, full.x + 0.18, full.y + 0.18, full.w - 0.36, full.h - 0.36, 0, 4, base);
    drawEggRings(ctx, tw, th, lights);
    const seat = pal("#3a3040", lights);
    box(ctx, full.x + 0.22, full.y + 0.22, full.w - 0.44, full.h - 0.44, 8, 6, seat);
    return;
  }
  const p = pal("#c48850", lights, { seat: "#d4a060" });
  const legs = pal("#5a3a22", lights);
  if (part !== "back") {
    shadow(ctx, full.x, full.y, full.w, full.h, 0.3);
    const leg = 0.12;
    const spots = [
      [full.x + 0.06, full.y + 0.06],
      [full.x + full.w - leg - 0.06, full.y + 0.06],
      [full.x + 0.06, full.y + full.h - leg - 0.06],
      [full.x + full.w - leg - 0.06, full.y + full.h - leg - 0.06],
    ];
    for (const [lx, ly] of spots) box(ctx, lx, ly, leg, leg, 0, 6, legs);
    const backD = 0.26;
    const seat = seatRect(tw, th, rot, backD);
    box(ctx, seat.x, seat.y, seat.w, seat.h, 6, 8, p);
  }
  if (part !== "base") {
    const backD = 0.26;
    const back = backRect(tw, th, rot, backD);
    box(ctx, back.x, back.y, back.w, back.h, 6, 20, p);
  }
}

function drawTable(ctx, tw, th, rot, lights, kind) {
  const full = insetBox(tw, th);
  const wood = kind === "counter" || kind === "kitchenette" ? "#6a4630" : "#8a5a32";
  const p = pal(wood, lights, { top: kind === "kitchenette" ? "#8a8f96" : "#c4a078" });
  const legs = pal("#4a3a2a", lights);
  shadow(ctx, full.x, full.y, full.w, full.h, 0.28);
  const lift = kind === "coffeetable" ? 0 : 0;
  const topH = kind === "coffeetable" ? 10 : (kind === "counter" || kind === "kitchenette" ? 16 : 14);
  const leg = 0.14;
  const inset = 0.08;
  const spots = [
    [full.x + inset, full.y + inset],
    [full.x + full.w - leg - inset, full.y + inset],
    [full.x + inset, full.y + full.h - leg - inset],
    [full.x + full.w - leg - inset, full.y + full.h - leg - inset],
  ];
  for (const [lx, ly] of spots) box(ctx, lx, ly, leg, leg, 0, topH - 2, legs);
  box(ctx, full.x, full.y, full.w, full.h, topH - 3, 3, {
    top: lights ? p.top : shade(p.top, -30),
    left: p.left, right: p.right, outline: p.outline,
  });
  if (kind === "kitchenette") {
    const front = visibleFront(rot);
    if (front) {
      const fc = faceCorners(full.x, full.y, full.w, full.h, 0, topH, front);
      faceRect(ctx, fc, 0.1, 0.15, 0.45, 0.85, lights ? "#d8c6a8" : "#6a5a48", p.outline);
      faceRect(ctx, fc, 0.55, 0.15, 0.9, 0.85, lights ? "#c4b49a" : "#5a4a38", p.outline);
    }
  }
}

function drawRug(ctx, tw, th, lights) {
  const full = { x: 0.06, y: 0.06, w: tw - 0.12, h: th - 0.12 };
  const p = pal("#b02030", lights, { gold: "#e8c878", inner: "#9a2030" });
  const d = diamond(full.x, full.y, full.w, full.h, 0);
  fillPts(ctx, [d.N, d.E, d.S, d.W], p.base, p.gold);
  const inner = diamond(full.x + 0.18, full.y + 0.18, full.w - 0.36, full.h - 0.36, 1);
  fillPts(ctx, [inner.N, inner.E, inner.S, inner.W], lights ? "#9a1824" : shade("#9a1824", -30), p.gold);
  const core = diamond(tw / 2 - 0.12, th / 2 - 0.12, 0.24, 0.24, 2);
  fillPts(ctx, [core.N, core.E, core.S, core.W], p.gold, null);
}

function drawBed(ctx, tw, th, rot, lights) {
  const r = normalizeFurnRot(rot);
  const cover = blanketLocal(r);
  const pillow = pillowLocal(r);
  const fold = foldLocal(r);
  const blanket = pal(lights ? "#4a7ab0" : "#2a4a68", lights, { fold: "#6a96c4", hem: "#3a6494" });
  const pillowPal = pal("#fff8f0", lights, { top: lights ? "#fffdf8" : "#d0ccc4" });
  // Just a flat blanket on the floor — no frame, no headboard — plus one pillow on top.
  shadow(ctx, cover.x, cover.y, cover.w, cover.h, 0.26);
  box(ctx, cover.x, cover.y, cover.w, cover.h, BLANKET_LIFT, BLANKET_THICK, blanket);
  // Soft hem / edge on the top face so the fabric reads as a stitched rectangle.
  box(ctx, cover.x + 0.04, cover.y + 0.04, cover.w - 0.08, cover.h - 0.08, BLANKET_LIFT + BLANKET_THICK, 0.6, {
    top: lights ? shade(blanket.base, 18) : shade(blanket.base, -16),
    left: blanket.left, right: blanket.right, outline: blanket.hem,
  });
  box(ctx, fold.x, fold.y, fold.w, fold.h, BLANKET_LIFT + BLANKET_THICK + 0.6, 1.6, {
    top: lights ? blanket.fold : shade(blanket.fold, -30),
    left: blanket.left,
    right: blanket.right,
    outline: blanket.outline,
  });
  box(ctx, pillow.x, pillow.y, pillow.w, pillow.h, BLANKET_LIFT + BLANKET_THICK, PILLOW_THICK, {
    top: pillowPal.top,
    left: shade("#efe6d4", lights ? -8 : -28),
    right: shade("#efe6d4", lights ? -22 : -40),
    outline: shade("#6b4a32", 20),
  });
}

function drawCabinet(ctx, tw, th, rot, lights, height, color, faceFn) {
  const full = insetBox(tw, th);
  const p = pal(color, lights);
  shadow(ctx, full.x, full.y, full.w, full.h, 0.3);
  box(ctx, full.x, full.y, full.w, full.h, 0, height, p);
  const front = visibleFront(rot);
  if (front && faceFn) {
    const fc = faceCorners(full.x, full.y, full.w, full.h, 0, height, front);
    faceFn(ctx, fc, p, lights);
  }
}

function drawPlant(ctx, tw, th, lights, pod) {
  const full = insetBox(tw, th);
  shadow(ctx, full.x, full.y, full.w, full.h, 0.25);
  const pot = pal(pod ? "#6a7a6a" : "#b86a3a", lights, { rim: pod ? "#8aaa88" : "#d48850" });
  const pw = 0.42, ph = 0.42;
  const px = (tw - pw) / 2, py = (th - ph) / 2;
  box(ctx, px, py, pw, ph, 0, 8, pot);
  box(ctx, px - 0.04, py - 0.04, pw + 0.08, ph + 0.08, 8, 2, {
    top: lights ? pot.rim : shade(pot.rim, -30), left: pot.left, right: pot.right, outline: pot.outline,
  });
  const leaves = lights
    ? ["#2a6a38", "#3d7a4a", "#5a9a48", "#3a5a28"]
    : ["#1a4a2a", "#2a4a20", "#3a5a20", "#1a3a18"];
  const cx = tw / 2, cy = th / 2;
  const blobs = [
    [cx - 0.22, cy - 0.08, 0.28, 0.22, 14],
    [cx + 0.02, cy - 0.18, 0.26, 0.24, 18],
    [cx - 0.06, cy + 0.02, 0.22, 0.2, 22],
    [cx - 0.14, cy - 0.2, 0.2, 0.18, 26],
    [cx + 0.04, cy - 0.04, 0.18, 0.16, 30],
  ];
  blobs.forEach((b, i) => {
    const d = diamond(b[0], b[1], b[2], b[3], b[4]);
    fillPts(ctx, [d.N, d.E, d.S, d.W], leaves[i % leaves.length], "#1a2a14");
  });
}

function drawLamp(ctx, tw, th, lights, lava) {
  const full = insetBox(tw, th);
  const wood = pal("#8a6a40", lights);
  shadow(ctx, full.x, full.y, full.w, full.h, 0.25);
  const bw = 0.36, bh = 0.36;
  const bx = (tw - bw) / 2, by = (th - bh) / 2;
  box(ctx, bx, by, bw, bh, 0, 6, wood);
  if (lava) {
    const glass = pal(lights ? "#d8e8e0" : "#6a7870", lights);
    box(ctx, bx + 0.06, by + 0.06, bw - 0.12, bh - 0.12, 6, 32, glass);
    if (lights) {
      const blobs = [[0.1, 12, "#e85a2a"], [0.08, 20, "#f4a020"], [0.1, 28, "#e85a2a"]];
      for (const [s, z, c] of blobs) {
        const d = diamond(tw / 2 - s, th / 2 - s, s * 2, s * 2, z);
        fillPts(ctx, [d.N, d.E, d.S, d.W], c, null);
      }
    }
    box(ctx, bx, by, bw, bh, 38, 3, wood);
    return;
  }
  const pole = pal("#c4a070", lights);
  box(ctx, tw / 2 - 0.06, th / 2 - 0.06, 0.12, 0.12, 6, 26, pole);
  const shadeC = pal(lights ? "#f4e0a8" : "#6a5a40", lights);
  box(ctx, bx - 0.08, by - 0.08, bw + 0.16, bh + 0.16, 32, 10, shadeC);
  if (lights) {
    ctx.globalAlpha = 0.18;
    const glow = diamond(I, I, tw - 2 * I, th - 2 * I, 0);
    fillPts(ctx, [glow.N, glow.E, glow.S, glow.W], "#ffc850", null);
    ctx.globalAlpha = 1;
  }
}

function drawTV(ctx, tw, th, rot, lights, on, holo, screen) {
  const L = tvLayout(tw, th, rot);
  const wood = pal(holo ? "#3a3a44" : "#6b4a2c", lights);
  const woodDark = pal(holo ? "#2a2a32" : "#4a3220", lights);
  const bezel = pal("#1a1c20", lights);
  const uv = TV_SCREEN_UV;
  shadow(ctx, L.full.x, L.full.y, L.full.w, L.full.h, 0.3);
  const leg = 0.12, inset = 0.08;
  const spots = [
    [L.full.x + inset, L.full.y + inset],
    [L.full.x + L.full.w - leg - inset, L.full.y + inset],
    [L.full.x + inset, L.full.y + L.full.h - leg - inset],
    [L.full.x + L.full.w - leg - inset, L.full.y + L.full.h - leg - inset],
  ];
  for (const [lx, ly] of spots) box(ctx, lx, ly, leg, leg, 0, L.standH - 2, woodDark);
  box(ctx, L.full.x, L.full.y, L.full.w, L.full.h, 2, L.standH - 2, wood);
  box(ctx, L.full.x - 0.02, L.full.y - 0.02, L.full.w + 0.04, L.full.h + 0.04, L.standH, 2, pal(holo ? "#4a4a54" : "#8a5a32", lights));
  const front = visibleFront(rot);
  if (front) {
    const sc = faceCorners(L.full.x, L.full.y, L.full.w, L.full.h, 2, L.standH - 2, front);
    faceRect(ctx, sc, 0.08, 0.18, 0.46, 0.82, lights ? "#4a3220" : "#2a1c14", wood.outline);
    faceRect(ctx, sc, 0.54, 0.18, 0.92, 0.82, lights ? "#4a3220" : "#2a1c14", wood.outline);
    faceRect(ctx, sc, 0.28, 0.36, 0.34, 0.62, lights ? "#c4a35a" : "#6a5a30", null);
    faceRect(ctx, sc, 0.74, 0.36, 0.80, 0.62, lights ? "#c4a35a" : "#6a5a30", null);
  }
  const neckW = Math.min(L.body.w, L.body.h) * 0.28;
  box(ctx, L.body.x + (L.body.w - neckW) / 2, L.body.y + (L.body.h - neckW) / 2, neckW, neckW, L.standH + 2, 3, bezel);
  box(ctx, L.body.x, L.body.y, L.body.w, L.body.h, L.standH, L.bodyH, bezel);
  const r = normalizeFurnRot(rot);
  if (front) {
    const fc = faceCorners(L.body.x, L.body.y, L.body.w, L.body.h, L.standH, L.bodyH, front);
    faceRect(ctx, fc, 0.02, 0.03, 0.98, 0.97, lights ? "#14161a" : "#0c0c0e", bezel.outline);
    const lit = on && lights;
    const screenQ = uvQuad(fc, uv);
    faceRect(ctx, fc, uv.u0, uv.v0, uv.u1, uv.v1, lit ? "#0a1020" : "#09090c", "#111");
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(screenQ[0].x, screenQ[0].y);
    for (let i = 1; i < screenQ.length; i++) ctx.lineTo(screenQ[i].x, screenQ[i].y);
    ctx.closePath();
    ctx.clip();
    if (screen && lit) {
      faceImage(ctx, fc, uv.u0, uv.v0, uv.u1, uv.v1, screen);
    } else if (lit) {
      faceRect(ctx, fc, uv.u0, uv.v0, uv.u1, uv.v1, holo ? "#1a2840" : "#152238", null);
    }
    if (lights) {
      ctx.globalAlpha = lit ? 0.18 : 0.08;
      faceRect(ctx, fc, uv.u0 + 0.04, uv.v0 + 0.06, uv.u0 + 0.28, uv.v1 - 0.08, "#e8f0ff", null);
      ctx.globalAlpha = lit ? 0.10 : 0.05;
      faceRect(ctx, fc, uv.u0 + 0.06, uv.v0 + 0.04, uv.u1 - 0.08, uv.v0 + 0.16, "#ffffff", null);
      ctx.globalAlpha = 1;
    }
    ctx.restore();
    faceRect(ctx, fc, 0.46, 0.015, 0.54, 0.04, lights ? "#2a2c30" : "#161616", null);
    faceRect(ctx, fc, 0.88, 0.015, 0.93, 0.04, on && lights ? "#3d8a3a" : "#622", null);
  } else {
    const back = r === 2 ? "-y" : "-x";
    const fc = faceCorners(L.body.x, L.body.y, L.body.w, L.body.h, L.standH, L.bodyH, back);
    faceRect(ctx, fc, 0.08, 0.08, 0.92, 0.92, lights ? "#2a2c32" : "#16181c", bezel.outline);
    faceRect(ctx, fc, 0.18, 0.22, 0.82, 0.30, lights ? "#1a1c20" : "#0c0c0e", null);
    faceRect(ctx, fc, 0.46, 0.08, 0.54, 0.18, "#1a1a1e", null);
  }
}

export function tvGlowColor() {
  return "rgba(120, 180, 255, 0.22)";
}

function drawFridge(ctx, tw, th, rot, lights, open) {
  const full = insetBox(tw, th);
  const height = 40;
  const p = pal("#e8e4dc", lights);
  shadow(ctx, full.x, full.y, full.w, full.h, 0.3);
  box(ctx, full.x, full.y, full.w, full.h, 0, height, p);
  const front = visibleFront(rot);
  if (!front) return;
  const fc = faceCorners(full.x, full.y, full.w, full.h, 0, height, front);
  if (!open) {
    faceRect(ctx, fc, 0.1, 0.52, 0.9, 0.94, lights ? "#f4f0e8" : "#a8a49c", p.outline);
    faceRect(ctx, fc, 0.1, 0.08, 0.9, 0.46, lights ? "#f4f0e8" : "#a8a49c", p.outline);
    faceRect(ctx, fc, 0.78, 0.28, 0.86, 0.4, lights ? "#c4a35a" : "#888", p.outline);
    return;
  }
  // Open: lit interior, shelves of snacks, door swung to the screen-left (hinged left).
  // Interior stays warm even when the room lights are off.
  const wall = lights ? "#f3e6c4" : "#e8d6a0";
  const inner = lights ? "#fff6d8" : "#ffe9b0";
  const shelf = lights ? "#d8c49a" : "#c4b078";
  const lamp = lights ? "#fffceb" : "#fff4c8";
  faceRect(ctx, fc, 0.08, 0.06, 0.92, 0.94, wall, p.outline);
  faceRect(ctx, fc, 0.14, 0.10, 0.86, 0.90, inner, null);
  faceRect(ctx, fc, 0.22, 0.09, 0.78, 0.15, lamp, null);
  for (const v of [0.34, 0.58, 0.82]) {
    faceRect(ctx, fc, 0.14, v, 0.86, v + 0.045, shelf, p.outline);
  }
  paintFridgeGoods(ctx, fc, lights);
  paintFridgeDoor(ctx, fc, p, lights);
}


function stampHeldOnFace(ctx, fc, kind, u, vShelf, lights) {
  const stamp = heldItemStamp(kind, { lights });
  if (!stamp?.c) return;
  const [bl, br, tr, tl] = fc;
  const at = (uu, vv) => lerp2(lerp2(bl, br, uu), lerp2(tl, tr, uu), vv);
  const p = at(u, vShelf);
  const w = stamp.w, h = stamp.h;
  const targetH = 9;
  const s = Math.min(1, targetH / h);
  const dw = Math.max(1, Math.round(w * s)), dh = Math.max(1, Math.round(h * s));
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(stamp.c, 0, 0, w, h, Math.round(p.x - dw / 2), Math.round(p.y - dh + 1), dw, dh);
}

function paintFridgeGoods(ctx, fc, lights) {
  const ink = "#2a1c14";
  // Top shelf: milk, pizza box, egg carton
  faceRect(ctx, fc, 0.18, 0.18, 0.32, 0.34, lights ? "#f4f0e8" : "#e8e0d0", ink);
  faceRect(ctx, fc, 0.18, 0.18, 0.32, 0.22, lights ? "#3a7ab8" : "#2a5a88", ink);
  faceRect(ctx, fc, 0.36, 0.22, 0.58, 0.34, lights ? "#e8c878" : "#c4a050", ink);
  faceRect(ctx, fc, 0.40, 0.24, 0.54, 0.30, lights ? "#c43a32" : "#8a2018", null);
  faceRect(ctx, fc, 0.62, 0.26, 0.82, 0.34, lights ? "#f8f4e8" : "#d8d0c0", ink);
  faceRect(ctx, fc, 0.65, 0.28, 0.70, 0.32, lights ? "#f0e0b0" : "#d0c090", ink);
  faceRect(ctx, fc, 0.72, 0.28, 0.78, 0.32, lights ? "#f0e0b0" : "#d0c090", ink);
  // Mid shelf: CUBE SODA cans (same art as the held can) and water bottles
  stampHeldOnFace(ctx, fc, "soda", 0.26, 0.58, lights);
  stampHeldOnFace(ctx, fc, "soda", 0.44, 0.58, lights);
  faceRect(ctx, fc, 0.50, 0.40, 0.60, 0.58, lights ? "#7ec8e8" : "#3a8ab0", ink);
  faceRect(ctx, fc, 0.52, 0.38, 0.58, 0.42, lights ? "#2a6aa8" : "#1a4a88", ink);
  faceRect(ctx, fc, 0.64, 0.40, 0.74, 0.58, lights ? "#7ec8e8" : "#3a8ab0", ink);
  faceRect(ctx, fc, 0.66, 0.38, 0.72, 0.42, lights ? "#2a6aa8" : "#1a4a88", ink);
  // Bottom shelf: drumstick on a plate, leftover carton
  faceRect(ctx, fc, 0.20, 0.74, 0.48, 0.82, lights ? "#e8e0d0" : "#c4b8a8", ink);
  faceRect(ctx, fc, 0.28, 0.66, 0.42, 0.78, lights ? "#c47832" : "#8a4a1c", ink);
  faceRect(ctx, fc, 0.36, 0.64, 0.46, 0.70, lights ? "#f0e0c0" : "#c4b090", ink);
  faceRect(ctx, fc, 0.58, 0.68, 0.80, 0.82, lights ? "#d8e8f0" : "#88a0b0", ink);
}

function paintFridgeDoor(ctx, fc, p, lights) {
  const [bl, br, tr, tl] = fc;
  const leftIsU0 = (bl.x + tl.x) <= (br.x + tr.x);
  const hingeB = leftIsU0 ? bl : br;
  const hingeT = leftIsU0 ? tl : tr;
  const faceW = Math.hypot(br.x - bl.x, br.y - bl.y) || 28;
  const doorW = faceW * 0.92;
  // Swing further left (and a little toward the camera) so the inner face is visible.
  let dx = -1, dy = 0.28;
  const len = Math.hypot(dx, dy) || 1;
  dx = (dx / len) * doorW;
  dy = (dy / len) * doorW;
  const outB = { x: hingeB.x + dx, y: hingeB.y + dy };
  const outT = { x: hingeT.x + dx, y: hingeT.y + dy };
  const inner = lights ? "#f6efe2" : "#e8dcc8";
  const innerDk = lights ? "#d8ccb4" : "#b8a890";
  const gasket = lights ? "#c4d8e0" : "#88a0a8";
  fillPts(ctx, [hingeB, outB, outT, hingeT], inner, p.outline);
  // Inner door shelf / gasket lines
  const uLerp = (a, b, t) => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
  const row = (v) => {
    const L = uLerp(hingeB, hingeT, v);
    const R = uLerp(outB, outT, v);
    fillPts(ctx, [
      uLerp(L, R, 0.12), uLerp(L, R, 0.88),
      { x: uLerp(L, R, 0.88).x, y: uLerp(L, R, 0.88).y + 1.2 },
      { x: uLerp(L, R, 0.12).x, y: uLerp(L, R, 0.12).y + 1.2 },
    ], gasket, p.outline);
  };
  row(0.28);
  row(0.55);
  row(0.78);
  // Door edge thickness on the free side
  const thick = 3;
  const nx = dx / doorW * thick, ny = dy / doorW * thick;
  fillPts(ctx, [
    outB, { x: outB.x + nx, y: outB.y + ny },
    { x: outT.x + nx, y: outT.y + ny }, outT,
  ], innerDk, p.outline);
}

function drawChessTable(ctx, tw, th, rot, lights) {
  const full = insetBox(tw, th);
  const p = pal("#5a3a28", lights);
  const legs = pal("#3a2818", lights);
  shadow(ctx, full.x, full.y, full.w, full.h, 0.3);
  const leg = 0.14;
  const inset = 0.1;
  const spots = [
    [full.x + inset, full.y + inset],
    [full.x + full.w - leg - inset, full.y + inset],
    [full.x + inset, full.y + full.h - leg - inset],
    [full.x + full.w - leg - inset, full.y + full.h - leg - inset],
  ];
  for (const [lx, ly] of spots) box(ctx, lx, ly, leg, leg, 0, 12, legs);
  box(ctx, full.x, full.y, full.w, full.h, 12, 3, p);
  const n = 8;
  const m = 0.16;
  const bw = (full.w - m * 2) / n;
  const bh = (full.h - m * 2) / n;
  const light = lights ? "#efe6d4" : "#8a8070";
  const dark = lights ? "#3a2a20" : "#1a1410";
  // Board stays square on the 2x2 top, squares follow the iso axes. rot just
  // swaps the check pattern's "near" side so seats still face an edge.
  const flip = rot === 1 || rot === 2;
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      const ii = flip ? n - 1 - i : i;
      const col = (ii + j) % 2 ? light : dark;
      const x = full.x + m + i * bw;
      const y = full.y + m + j * bh;
      const d = diamond(x, y, bw, bh, 15);
      fillPts(ctx, [d.N, d.E, d.S, d.W], col, null);
    }
  }
  const rim = diamond(full.x + m, full.y + m, full.w - m * 2, full.h - m * 2, 15);
  fillPts(ctx, [rim.N, rim.E, rim.S, rim.W], null, lights ? "#2a2030" : "#111");
}


function sliceFront(x, y, w, h, rot, depth) {
  const r = normalizeFurnRot(rot);
  const d = Math.min(depth, ((r % 2 === 0 ? h : w) * 0.9) || depth);
  if (r === 0) return { x, y: y + h - d, w, h: d };
  if (r === 1) return { x: x + w - d, y, w: d, h };
  if (r === 2) return { x, y, w, h: d };
  return { x, y, w: d, h };
}

/** A front-facing ledge covering body-front U range [u0, u1], so it can match the screen width. */
function sliceFrontRange(x, y, w, h, rot, depth, u0, u1) {
  const r = normalizeFurnRot(rot);
  const d = Math.min(depth, ((r % 2 === 0 ? h : w) * 0.9) || depth);
  const a = Math.max(0, Math.min(u0, u1));
  const b = Math.min(1, Math.max(u0, u1));
  const span = Math.max(0.01, b - a);
  if (r === 0) return { x: x + a * w, y: y + h - d, w: span * w, h: d };
  if (r === 1) return { x: x + w - d, y: y + a * h, w: d, h: span * h };
  if (r === 2) return { x: x + a * w, y: y, w: span * w, h: d };
  return { x: x, y: y + a * h, w: d, h: span * h };
}

function panelTopFrontEdge(rect, rot, lift) {
  const r = normalizeFurnRot(rot);
  const t = diamond(rect.x, rect.y, rect.w, rect.h, lift);
  if (r === 0) return { left: t.W, right: t.S };
  if (r === 1) return { left: t.E, right: t.S };
  if (r === 2) return { left: t.N, right: t.E };
  return { left: t.N, right: t.W };
}

function canvasX(ctx, x) {
  const tr = ctx.getTransform();
  return x * tr.a + tr.e;
}

function fromCanvasX(ctx, cx) {
  const tr = ctx.getTransform();
  return (cx - tr.e) / (tr.a || 1);
}

function canvasPoint(ctx, p) {
  const tr = ctx.getTransform();
  return { x: p.x * tr.a + p.y * tr.c + tr.e, y: p.x * tr.b + p.y * tr.d + tr.f };
}

/** Inclusive pixel columns of a filled front-face rect that match `isColor`. */
function rasterFaceBounds(ctx, corners, u0, v0, u1, v1, isColor) {
  const [bl, br, tr, tl] = corners;
  const p = (u, v) => lerp2(lerp2(bl, br, u), lerp2(tl, tr, u), v);
  const pts = [p(u0, v0), p(u1, v0), p(u1, v1), p(u0, v1)].map((q) => canvasPoint(ctx, q));
  const x0 = Math.max(0, Math.floor(Math.min(...pts.map((q) => q.x)) - 1));
  const x1 = Math.min(ctx.canvas.width - 1, Math.ceil(Math.max(...pts.map((q) => q.x)) + 1));
  const y0 = Math.max(0, Math.floor(Math.min(...pts.map((q) => q.y)) - 1));
  const y1 = Math.min(ctx.canvas.height - 1, Math.ceil(Math.max(...pts.map((q) => q.y)) + 1));
  if (x1 < x0 || y1 < y0) return null;
  const img = ctx.getImageData(x0, y0, x1 - x0 + 1, y1 - y0 + 1);
  const d = img.data;
  let L = Infinity, R = -Infinity;
  for (let y = 0; y < img.height; y++) {
    for (let x = 0; x < img.width; x++) {
      const i = (y * img.width + x) * 4;
      if (d[i + 3] < 200) continue;
      if (!isColor(d[i], d[i + 1], d[i + 2])) continue;
      const cx = x0 + x;
      if (cx < L) L = cx;
      if (cx > R) R = cx;
    }
  }
  if (!Number.isFinite(L)) return null;
  return { L, R, C: (L + R) / 2 };
}

function isCrtGlass(r, g, b) {
  // Front CRT fill / wash / highlight, not the neon-green Tetris side or marquee.
  if (g < 160) return false;
  if (g <= r + 20) return false;
  if (b > 160) return false;
  // Tetris / marquee neon is near #39ff14 (very high G, low R)
  if (g >= 240 && r <= 80 && b <= 50) return false;
  return true;
}

/** Tiny joystick + two 2–3px buttons in one iso-aligned row, group mid at midX, y on the edge. */
function paintTinyControlRow(ctx, edgeLeft, edgeRight, midX, lights) {
  const dx = edgeRight.x - edgeLeft.x;
  const slope = Math.abs(dx) < 0.001 ? 0 : (edgeRight.y - edgeLeft.y) / dx;
  const midY = edgeLeft.y + (midX - edgeLeft.x) * slope;
  const ball = 3, btn = 2, gap = 2;
  const total = ball + gap + btn + gap + btn;
  // Round in canvas-pixel space so the inclusive midpoint lands on the raster screen center.
  const x0 = fromCanvasX(ctx, Math.round(canvasX(ctx, midX) - (total - 1) / 2));
  const yAt = (x) => Math.round(midY + (x - midX) * slope);
  const shaft = lights ? "#4a4a52" : "#2a2a30";
  const red = lights ? "#e82838" : "#4a1820";
  const yellow = lights ? "#f4c15d" : "#4a3a18";
  // All three sit ON the ledge in one row; shaft hangs 2px down so the ball stays off the CRT.
  const jy = yAt(x0 + 1);
  ctx.fillStyle = shaft;
  ctx.fillRect(x0 + 1, jy + 1, 1, 2);
  ctx.fillStyle = red;
  ctx.fillRect(x0, jy - 2, 3, 3);
  const rx = x0 + ball + gap;
  ctx.fillStyle = red;
  ctx.fillRect(rx, yAt(rx) - 1, 2, 2);
  const yx = rx + btn + gap;
  ctx.fillStyle = yellow;
  ctx.fillRect(yx, yAt(yx) - 1, 2, 2);
}

function alongFront(rect, rot, t, inset, size) {
  const r = normalizeFurnRot(rot);
  const u = Math.max(0, Math.min(1, t));
  if (r === 0) return { x: rect.x + 0.08 + u * Math.max(0, rect.w - 0.16 - size), y: rect.y + rect.h - inset - size, w: size, h: size };
  if (r === 1) return { x: rect.x + rect.w - inset - size, y: rect.y + 0.08 + u * Math.max(0, rect.h - 0.16 - size), w: size, h: size };
  if (r === 2) return { x: rect.x + 0.08 + u * Math.max(0, rect.w - 0.16 - size), y: rect.y + inset, w: size, h: size };
  return { x: rect.x + inset, y: rect.y + 0.08 + u * Math.max(0, rect.h - 0.16 - size), w: size, h: size };
}

/** Place an item by its center, 0-1 along the front, so a control group can be centered. */
function alongFrontCenter(rect, rot, u, inset, size) {
  const r = normalizeFurnRot(rot);
  const t = Math.max(0, Math.min(1, u));
  const span = r % 2 === 0 ? Math.max(0, rect.w - 0.16) : Math.max(0, rect.h - 0.16);
  const mid = 0.08 + t * span;
  if (r === 0) return { x: rect.x + mid - size / 2, y: rect.y + rect.h - inset - size, w: size, h: size };
  if (r === 1) return { x: rect.x + rect.w - inset - size, y: rect.y + mid - size / 2, w: size, h: size };
  if (r === 2) return { x: rect.x + mid - size / 2, y: rect.y + inset, w: size, h: size };
  return { x: rect.x + inset, y: rect.y + mid - size / 2, w: size, h: size };
}

function paintTetrisSide(ctx, corners, lights) {
  if (!corners) return;
  const bg = lights ? "#141418" : "#0a0a0c";
  const ink = lights ? "#050805" : "#000000";
  const hi = lights ? "#b8ff6a" : "#2a4a28";
  const mid = lights ? "#39ff14" : "#1c5a28";
  const lo = lights ? "#1ebd3a" : "#143820";
  faceRect(ctx, corners, 0, 0, 1, 1, bg, null);
  // 4x12 cell pattern of stacked O/T/L/S/I squares (row 0 = top of art area).
  // Leave a band at the bottom for vent slots.
  const filled = new Set([
    // O
    "1,0", "2,0", "1,1", "2,1",
    // L
    "0,2", "0,3", "0,4", "1,4",
    // T
    "1,5", "0,6", "1,6", "2,6",
    // S
    "1,7", "2,7", "0,8", "1,8",
    // I
    "3,3", "3,4", "3,5", "3,6",
    // O
    "2,9", "3,9", "2,10", "3,10",
    // extra square to finish the stack
    "0,10",
  ]);
  const cols = 4, rows = 12;
  const u0 = 0.12, u1 = 0.88, v0 = 0.20, v1 = 0.96;
  const gap = 0.10;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      if (!filled.has(c + "," + r)) continue;
      const cu0 = u0 + (c / cols) * (u1 - u0);
      const cu1 = u0 + ((c + 1) / cols) * (u1 - u0);
      const cv1 = v1 - (r / rows) * (v1 - v0);
      const cv0 = v1 - ((r + 1) / rows) * (v1 - v0);
      const du = (cu1 - cu0) * gap;
      const dv = (cv1 - cv0) * gap;
      faceRect(ctx, corners, cu0, cv0, cu1, cv1, ink, null);
      faceRect(ctx, corners, cu0 + du, cv0 + dv, cu1 - du, cv1 - dv, mid, null);
      // tiny highlight on the top-left of each square
      faceRect(ctx, corners, cu0 + du, cv1 - dv - (cv1 - cv0 - dv * 2) * 0.35, cu0 + du + (cu1 - cu0 - du * 2) * 0.45, cv1 - dv, hi, null);
      if (!lights) faceRect(ctx, corners, cu0 + du, cv0 + dv, cu1 - du, cv1 - dv, lo, null);
    }
  }
  if (lights) {
    ctx.globalAlpha = 0.16;
    faceRect(ctx, corners, 0.08, 0.18, 0.92, 0.98, "#39ff14", null);
    ctx.globalAlpha = 1;
  }
  // Vertical vent slots near the bottom of the side panel.
  const vent = lights ? "#0a0a0c" : "#050506";
  const ventEdge = lights ? "#3a3a42" : "#1a1a1e";
  for (const u of [0.20, 0.42, 0.64]) {
    faceRect(ctx, corners, u, 0.03, u + 0.12, 0.17, ventEdge, null);
    faceRect(ctx, corners, u + 0.03, 0.05, u + 0.09, 0.15, vent, null);
  }
}

function paintCubicsGlyphs(ctx, corners, text, color, u0, v0, u1, v1, gap = 0.08) {
  const glyphs = {
    C: ["###","#  ","#  ","#  ","###"],
    U: ["# #","# #","# #","# #","###"],
    B: ["## ","# #","## ","# #","## "],
    I: ["###"," # "," # "," # ","###"],
    E: ["###","#  ","## ","#  ","###"],
    S: ["###","#  ","###","  #","###"],
  };
  const letters = String(text).split("");
  const slot = (1 - gap * (letters.length - 1) / Math.max(1, letters.length)) / letters.length;
  letters.forEach((ch, i) => {
    const rows = glyphs[ch];
    if (!rows) return;
    const lu0 = i * (slot + gap / letters.length);
    const lu1 = lu0 + slot;
    const rowsN = rows.length, colsN = rows[0].length;
    for (let r = 0; r < rowsN; r++) {
      for (let c = 0; c < colsN; c++) {
        if (rows[r][c] !== "#") continue;
        const pu0 = u0 + (lu0 + (c / colsN) * (lu1 - lu0)) * (u1 - u0);
        const pu1 = u0 + (lu0 + ((c + 1) / colsN) * (lu1 - lu0)) * (u1 - u0);
        const pv1 = v1 - (r / rowsN) * (v1 - v0);
        const pv0 = v1 - ((r + 1) / rowsN) * (v1 - v0);
        faceRect(ctx, corners, pu0, pv0, pu1, pv1, color, null);
      }
    }
  });
}

function cabinetFoot(full, rot, size) {
  const r = normalizeFurnRot(rot);
  const slackX = Math.max(0, full.w - size);
  const slackY = Math.max(0, full.h - size);
  // Park the cabinet at the back of the tile so a stool can sit in front.
  let x = full.x + slackX / 2;
  let y = full.y + slackY / 2;
  if (r === 0) y = full.y;
  else if (r === 1) x = full.x;
  else if (r === 2) y = full.y + slackY;
  else x = full.x + slackX;
  return { x, y, w: size, h: size };
}

function stoolFoot(bx, by, bw, bh, rot, size) {
  const r = normalizeFurnRot(rot);
  const s = size;
  const gap = 0.03;
  if (r === 0) return { x: bx + 0.02, y: by + bh + gap, w: s, h: s };
  if (r === 1) return { x: bx + bw + gap, y: by + 0.02, w: s, h: s };
  if (r === 2) return { x: bx + bw - s - 0.02, y: by - s - gap, w: s, h: s };
  return { x: bx - s - gap, y: by + bh - s - 0.02, w: s, h: s };
}

function drawArcadeStool(ctx, x, y, w, h, lights) {
  const seat = pal("#3a3a42", lights);
  const rim = pal("#2a2a30", lights);
  const leg = pal("#e8e8ee", lights);
  const foot = pal("#d0d0d6", lights);
  const lw = Math.min(w, h) * 0.16;
  // White tripod: three legs plus a tiny hub.
  const legs = [
    [x + w * 0.42, y + h * 0.08],
    [x + w * 0.08, y + h * 0.70],
    [x + w * 0.74, y + h * 0.62],
  ];
  for (const [lx, ly] of legs) box(ctx, lx, ly, lw, lw, 0, 8, leg);
  box(ctx, x + w * 0.36, y + h * 0.36, w * 0.28, h * 0.28, 0, 2, foot);
  box(ctx, x + 0.02, y + 0.02, w - 0.04, h - 0.04, 8, 2.4, rim);
  box(ctx, x + 0.05, y + 0.05, w - 0.10, h - 0.10, 10.4, 1.6, seat);
}

/** Axis-aligned pixel letters so CUBICS stays readable after iso shear. */
function paintUprightGlyphs(ctx, corners, text, color, u0 = 0, v0 = 0, u1 = 1, v1 = 1) {
  const glyphs = {
    C: ["###","#  ","#  ","#  ","###"],
    U: ["# #","# #","# #","# #","###"],
    B: ["## ","# #","## ","# #","## "],
    I: ["###"," # "," # "," # ","###"],
    S: ["###","#  ","###","  #","###"],
  };
  const [bl, br, tr, tl] = corners;
  const p = (u, v) => lerp2(lerp2(bl, br, u), lerp2(tl, tr, u), v);
  const mid = p((u0 + u1) / 2, (v0 + v1) / 2);
  const topL = p(u0, v1), topR = p(u1, v1);
  const slope = (topR.y - topL.y) / Math.max(1, topR.x - topL.x);
  const letters = String(text).split("");
  const letterW = 3, letterH = 5, gap = 1;
  const totalW = letters.length * letterW + Math.max(0, letters.length - 1) * gap;
  const startX = Math.round(mid.x - totalW / 2);
  // Sit a pixel below center so the 5-row glyphs stay inside the slanted sign.
  const startY = Math.round(mid.y - letterH / 2 + 1);
  ctx.fillStyle = color;
  letters.forEach((ch, i) => {
    const rows = glyphs[ch];
    if (!rows) return;
    const ox = startX + i * (letterW + gap);
    for (let r = 0; r < rows.length; r++) {
      for (let c = 0; c < rows[r].length; c++) {
        if (rows[r][c] !== "#") continue;
        const x = ox + c;
        const y = startY + r + Math.round((x - mid.x) * slope);
        ctx.fillRect(x, y, 1, 1);
      }
    }
  });
}

/** Classic upright cabinet for the Cubics game (id stays cubics). */
function drawRetroArcade(ctx, tw, th, rot, lights, flicker = 0) {
  const area = { x: 0.04, y: 0.04, w: tw - 0.08, h: th - 0.08 };
  const body = cabinetFoot(area, rot, 0.66);
  const bx = body.x, by = body.y, bw = body.w, bh = body.h;
  const BODY = 52;
  const MARQUEE_H = 12;
  const r = normalizeFurnRot(rot);
  const front = visibleFront(rot);
  const sideWhich = front === "+y" ? "+x" : front === "+x" ? "+y" : null;
  const bodyPal = pal("#1a1a1e", lights, { top: "#3a3a42", left: "#242428", right: "#121214" });
  // Force charcoal face contrast so the black cabinet doesn't read as a blob.
  if (lights) {
    bodyPal.top = "#3a3a44";
    bodyPal.left = "#26262c";
    bodyPal.right = "#101014";
    bodyPal.outline = "#050508";
  } else {
    bodyPal.top = "#24242a";
    bodyPal.left = "#18181c";
    bodyPal.right = "#0c0c10";
    bodyPal.outline = "#000000";
  }
  shadow(ctx, area.x, area.y, area.w, area.h, 0.36);
  box(ctx, bx, by, bw, bh, 0, BODY, bodyPal);

  const paintSides = sideWhich
    ? [sideWhich]
    : ["+y", "+x"];
  for (const which of paintSides) {
    paintTetrisSide(ctx, faceCorners(bx, by, bw, bh, 0, BODY, which), lights);
  }

  const neon = lights ? "#39ff14" : "#1a4a22";
  const neonHi = lights ? "#b8ff6a" : "#2a5a30";
  const screenOn = lights
    ? (flicker === 0 ? "#3ee01a" : flicker === 1 ? "#34c816" : "#4af026")
    : "#14381a";
  const bezel = lights ? "#0c0c10" : "#08080a";
  const outline = bodyPal.outline;

  if (front) {
    const fc = faceCorners(bx, by, bw, bh, 0, BODY, front);
    // Lower front: coin door, under the control ledge
    faceRect(ctx, fc, 0.08, 0.00, 0.92, 0.26, lights ? "#16161a" : "#0c0c0e", outline);
    faceRect(ctx, fc, 0.28, 0.03, 0.72, 0.22, lights ? "#2a2a32" : "#16161a", outline);
    // Neon-green trim around the door
    faceRect(ctx, fc, 0.28, 0.03, 0.72, 0.05, neon, null);
    faceRect(ctx, fc, 0.28, 0.20, 0.72, 0.22, neon, null);
    faceRect(ctx, fc, 0.42, 0.09, 0.58, 0.16, lights ? "#f4c15d" : "#3a3018", null);
    if (lights) faceRect(ctx, fc, 0.44, 0.105, 0.56, 0.14, "#ffe08a", null);
    // Coin return
    faceRect(ctx, fc, 0.62, 0.07, 0.70, 0.14, lights ? "#1a1a1e" : "#0c0c10", outline);

    // Big CRT bezel + glossy green screen, fully visible below the marquee
    faceRect(ctx, fc, 0.07, 0.40, 0.93, 0.98, bezel, outline);
    faceRect(ctx, fc, 0.13, 0.46, 0.87, 0.93, screenOn, null);
    if (lights) {
      ctx.globalAlpha = flicker === 1 ? 0.14 : 0.22;
      faceRect(ctx, fc, 0.13, 0.46, 0.87, 0.93, "#9aff70", null);
      ctx.globalAlpha = 1;
      // Glossy rounded-CRT highlight
      faceRect(ctx, fc, 0.18, 0.78, 0.48, 0.90, "#e8ffe0", null);
      ctx.globalAlpha = 0.45;
      faceRect(ctx, fc, 0.20, 0.70, 0.36, 0.80, "#ffffff", null);
      ctx.globalAlpha = 1;
    }
  }

  // Control ledge: a front apron + a shallow lip, snapped to the rasterized
  // CRT so both sides have the same overhang and the control mid hits the
  // screen's center column. A deep iso box is not used — its top diamond
  // always overshoots to one side of the front face.
  const SCREEN_U0 = 0.13, SCREEN_U1 = 0.87;
  const GLASS_V0 = 0.46, GLASS_V1 = 0.93;
  const LEDGE_PAD_PX = 1; // equal 1px overhang past the CRT on both sides
  const panelLift = 13;
  const panelH = 6;
  const lipH = 3;
  const which = front || (r === 2 ? "-y" : r === 3 ? "-x" : r === 1 ? "+x" : "+y");
  const sfc = faceCorners(bx, by, bw, bh, 0, BODY, which);
  const [sbl, sbr, str, stl] = sfc;
  const facePt = (u, v) => lerp2(lerp2(sbl, sbr, u), lerp2(stl, str, u), v);
  const vTop = (panelLift + panelH) / BODY;
  const fl = facePt(0, vTop), fr = facePt(1, vTop);
  const slope = Math.abs(fr.x - fl.x) < 0.001 ? 0 : (fr.y - fl.y) / (fr.x - fl.x);
  const yAt = (x) => fl.y + (x - fl.x) * slope;
  const glass = rasterFaceBounds(ctx, sfc, SCREEN_U0, GLASS_V0, SCREEN_U1, GLASS_V1, isCrtGlass);
  let ledL, ledR, midX;
  if (glass) {
    ledL = fromCanvasX(ctx, glass.L - LEDGE_PAD_PX);
    ledR = fromCanvasX(ctx, glass.R + LEDGE_PAD_PX);
    midX = fromCanvasX(ctx, glass.C);
  } else {
    const sl = facePt(SCREEN_U0, (GLASS_V0 + GLASS_V1) / 2);
    const sr = facePt(SCREEN_U1, (GLASS_V0 + GLASS_V1) / 2);
    const lo = Math.min(sl.x, sr.x), hi = Math.max(sl.x, sr.x);
    ledL = lo - LEDGE_PAD_PX;
    ledR = hi + LEDGE_PAD_PX;
    midX = (lo + hi) / 2;
  }
  const apronFill = lights ? "#1a1a20" : "#101014";
  const lipFill = lights ? "#2c2c34" : "#1a1a20";
  const cLedL = Math.round(canvasX(ctx, ledL));
  const cLedR = Math.round(canvasX(ctx, ledR));
  const lo = Math.min(cLedL, cLedR), hi = Math.max(cLedL, cLedR);
  const ox = ctx.getTransform().e, oy = ctx.getTransform().f;
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  for (let cx = lo; cx <= hi; cx++) {
    const cy = Math.round(yAt(cx - ox) + oy);
    ctx.fillStyle = lipFill;
    ctx.fillRect(cx, cy - lipH, 1, lipH);
    ctx.fillStyle = neon;
    ctx.fillRect(cx, cy, 1, 1);
    ctx.fillStyle = apronFill;
    ctx.fillRect(cx, cy + 1, 1, panelH - 1);
  }
  ctx.restore();
  const edgeLeft = { x: fromCanvasX(ctx, lo), y: yAt(fromCanvasX(ctx, lo)) - lipH / 2 };
  const edgeRight = { x: fromCanvasX(ctx, hi), y: yAt(fromCanvasX(ctx, hi)) - lipH / 2 };
  paintTinyControlRow(ctx, edgeLeft, edgeRight, midX, lights);

  // Smaller, less overhanging marquee on top; CUBICS stays one readable line.
  // Keep a little width so the six letters still fit; shrink height and forward depth.
  const mqPad = 0.10;
  const mq = sliceFront(bx - mqPad, by - mqPad, bw + mqPad * 2, bh + mqPad * 2, r, 0.28);
  const mqPal = pal("#141418", lights);
  if (lights) {
    mqPal.top = "#3a3a44";
    mqPal.left = "#242428";
    mqPal.right = "#101014";
    mqPal.outline = "#050508";
  } else {
    mqPal.top = "#222226";
    mqPal.left = "#161618";
    mqPal.right = "#0a0a0c";
    mqPal.outline = "#000000";
  }
  if (lights) {
    ctx.globalAlpha = flicker === 0 ? 0.22 : flicker === 1 ? 0.14 : 0.28;
    const glow = diamond(mq.x - 0.08, mq.y - 0.08, mq.w + 0.16, mq.h + 0.16, BODY + MARQUEE_H * 0.5);
    fillPts(ctx, [glow.N, glow.E, glow.S, glow.W], "#39ff14", null);
    ctx.globalAlpha = 1;
  }
  box(ctx, mq.x, mq.y, mq.w, mq.h, BODY, MARQUEE_H, mqPal);
  if (front) {
    const mc = faceCorners(mq.x, mq.y, mq.w, mq.h, BODY, MARQUEE_H, front);
    faceRect(ctx, mc, 0.03, 0.08, 0.97, 0.92, lights ? "#0a0a0c" : "#060608", mqPal.outline);
    // Neon-green sign plate with iso-aligned dark letters — readable at phone zoom.
    faceRect(ctx, mc, 0.06, 0.14, 0.94, 0.86, neon, null);
    if (lights) faceRect(ctx, mc, 0.06, 0.78, 0.94, 0.86, neonHi, null);
    const word = lights ? "#06140a" : "#0a180c";
    paintUprightGlyphs(ctx, mc, "CUBICS", word, 0.06, 0.14, 0.94, 0.86);
  }

  // Little arcade stool at the front-left, kept inside the 1x1 tile.
  const st = stoolFoot(bx, by, bw, bh, r, 0.24);
  if (st.x >= 0 && st.y >= 0 && st.x + st.w <= 1 && st.y + st.h <= 1) {
    drawArcadeStool(ctx, st.x, st.y, st.w, st.h, lights);
  }
}

function drawArcade(ctx, tw, th, rot, lights, kind) {
  const color = kind === "pinball" ? "#8a1520" : "#2a3040";
  const h = kind === "pinball" ? 28 : 40;
  drawCabinet(ctx, tw, th, rot, lights, h, color, (c, fc, p) => {
    if (kind === "pinball") {
      faceRect(c, fc, 0.1, 0.45, 0.9, 0.92, lights ? "#0a1828" : "#111", p.outline);
      if (lights) {
        faceRect(c, fc, 0.16, 0.7, 0.34, 0.84, "#c4a35a", null);
        faceRect(c, fc, 0.4, 0.66, 0.58, 0.8, "#c43a4a", null);
        faceRect(c, fc, 0.2, 0.52, 0.8, 0.6, "#f4c15d", null);
      }
      faceRect(c, fc, 0.12, 0.1, 0.88, 0.38, "#c4182d", p.outline);
    } else {
      faceRect(c, fc, 0.12, 0.48, 0.88, 0.92, lights ? "#0a1820" : "#0a0c10", p.outline);
      if (lights) {
        faceRect(c, fc, 0.18, 0.72, 0.34, 0.86, "#3d7a4a", null);
        faceRect(c, fc, 0.4, 0.68, 0.56, 0.82, "#ff5a6a", null);
        faceRect(c, fc, 0.22, 0.55, 0.7, 0.64, "#f4c15d", null);
      }
      faceRect(c, fc, 0.18, 0.12, 0.82, 0.4, "#1a1c22", p.outline);
    }
  });
}

function drawVending(ctx, tw, th, rot, lights) {
  drawCabinet(ctx, tw, th, rot, lights, 42, "#d8d0c4", (c, fc, p) => {
    faceRect(c, fc, 0.08, 0.82, 0.92, 0.96, lights ? "#c4182d" : "#6a1820", p.outline);
    faceGlyph(c, fc, "CUBE", lights ? "#f4efe4" : "#ddd", 0.16, 0.84, 0.84, 0.95);
    faceRect(c, fc, 0.12, 0.48, 0.88, 0.78, lights ? "#8ec8e8" : "#334", p.outline);
    const cans = [
      [0.16, 0.14, 0.42, 0.42, lights ? "#c4182d" : "#444"],
      [0.48, 0.14, 0.74, 0.42, lights ? "#f4c15d" : "#444"],
      [0.16, 0.0, 0.42, 0.28, lights ? "#3d7a4a" : "#444"],
      [0.48, 0.0, 0.74, 0.28, lights ? "#3a6aaa" : "#444"],
    ];
    for (const k of cans) faceRect(c, fc, k[0], k[1], k[2], k[3], k[4], p.outline);
  });
}

function drawBookshelf(ctx, tw, th, rot, lights, clothes) {
  const h = 38;
  const color = clothes ? "#6b4a32" : "#8b5a2b";
  drawCabinet(ctx, tw, th, rot, lights, h, color, (c, fc, p) => {
    const rows = 3;
    for (let r = 0; r < rows; r++) {
      const v0 = 0.08 + r * 0.3, v1 = v0 + 0.26;
      faceRect(c, fc, 0.08, v0, 0.92, v1, lights ? "#3a2818" : "#22180e", p.outline);
      const cols = clothes ? ["#7c5cff", "#ff7a59", "#3a8f5a", "#c4a070"] : ["#6c5cff", "#e05656", "#3a8f5a", "#c44536", "#4d7cff"];
      const n = clothes ? 2 : 5;
      for (let i = 0; i < n; i++) {
        const u0 = 0.12 + i * ((0.8) / n);
        const u1 = u0 + 0.8 / n - 0.04;
        faceRect(c, fc, u0, v0 + 0.04, u1, v1 - 0.04, lights ? cols[i % cols.length] : shade(cols[i % cols.length], -30), p.outline);
      }
    }
  });
}

function drawCoffee(ctx, tw, th, rot, lights) {
  const full = insetBox(tw, th);
  const p = pal("#8a8478", lights);
  shadow(ctx, full.x + 0.15, full.y + 0.15, full.w - 0.3, full.h - 0.3, 0.28);
  const m = { x: full.x + 0.18, y: full.y + 0.18, w: full.w - 0.36, h: full.h - 0.36 };
  box(ctx, m.x, m.y, m.w, m.h, 0, 20, p);
  const front = visibleFront(rot);
  if (front) {
    const fc = faceCorners(m.x, m.y, m.w, m.h, 0, 20, front);
    faceRect(ctx, fc, 0.2, 0.45, 0.8, 0.85, lights ? "#3a1020" : "#220", p.outline);
    faceRect(ctx, fc, 0.3, 0.12, 0.7, 0.35, "#1a1220", p.outline);
    if (lights) faceRect(ctx, fc, 0.55, 0.62, 0.68, 0.74, "#c43a4a", null);
  }
}

function drawGym(ctx, tw, th, rot, lights, kind) {
  const full = insetBox(tw, th);
  const metal = pal("#5a564e", lights);
  const pad = pal("#1a1228", lights);
  shadow(ctx, full.x, full.y, full.w, full.h, 0.28);
  if (kind === "punchbag" || kind === "heavybag") {
    const hook = pal("#44544a", lights);
    box(ctx, tw / 2 - 0.05, th / 2 - 0.05, 0.1, 0.1, 36, 8, hook);
    const bag = pal("#6a2030", lights);
    const bw = 0.4, bh = 0.4;
    box(ctx, (tw - bw) / 2, (th - bh) / 2, bw, bh, 8, 28, bag);
    box(ctx, (tw - bw) / 2 + 0.04, (th - bh) / 2 + 0.04, bw - 0.08, bh - 0.08, 20, 4, {
      top: lights ? "#c4a8a0" : "#665", left: bag.left, right: bag.right, outline: bag.outline,
    });
    return;
  }
  if (kind === "treadmill") {
    box(ctx, full.x, full.y, full.w, full.h, 0, 8, pal("#1a1c22", lights));
    const belt = seatRect(tw, th, rot, 0.22);
    box(ctx, belt.x, belt.y, belt.w, belt.h, 8, 2, pal("#111114", lights));
    const console = frontRect(tw, th, rot, 0.22);
    box(ctx, console.x, console.y, console.w, console.h, 8, 20, metal);
    const face = visibleFront(rot);
    if (face) {
      // outer face of the console (away from the belt) when the machine faces the camera
      const fc = faceCorners(console.x, console.y, console.w, console.h, 8, 20, face);
      faceRect(ctx, fc, 0.12, 0.15, 0.88, 0.55, lights ? "#3a3a40" : "#222", metal.outline);
    }
    // screen toward the runner is on the inner face; when the console is near, that inner
    // face is hidden, so also mark a screen on the visible top of the console.
    const top = { x: console.x + 0.04, y: console.y + 0.04, w: Math.max(0.08, console.w - 0.08), h: Math.max(0.08, console.h - 0.08) };
    box(ctx, top.x, top.y, top.w, top.h, 26, 2, pal(lights ? "#082028" : "#111", true));
    if (lights) box(ctx, top.x + top.w * 0.3, top.y + top.h * 0.3, top.w * 0.4, top.h * 0.4, 28, 1, pal("#c4a35a", true));
    return;
  }
  // bench press
  box(ctx, full.x, full.y, full.w, full.h, 0, 8, pad);
  const barD = 0.2;
  const rack = backRect(tw, th, rot, barD);
  // actually racks at both ends of the width
  const ends = midSplit(full, rot === 0 || rot === 2 ? 1 : 0);
  // posts at the two far corners of the short sides
  const post = 0.12;
  if (rot % 2 === 0) {
    box(ctx, full.x, full.y, post, post, 8, 14, metal);
    box(ctx, full.x + full.w - post, full.y, post, post, 8, 14, metal);
    box(ctx, full.x, full.y, full.w, post, 20, 3, pal("#889090", lights));
  } else {
    box(ctx, full.x, full.y, post, post, 8, 14, metal);
    box(ctx, full.x, full.y + full.h - post, post, post, 8, 14, metal);
    box(ctx, full.x, full.y, post, full.h, 20, 3, pal("#889090", lights));
  }
  void rack;
}

function drawDeck(ctx, tw, th, rot, lights) {
  const full = insetBox(tw, th);
  const p = pal("#2a2428", lights);
  shadow(ctx, full.x, full.y, full.w, full.h, 0.28);
  box(ctx, full.x, full.y, full.w, full.h, 0, 12, p);
  const top = diamond(full.x, full.y, full.w, full.h, 12);
  fillPts(ctx, [top.N, top.E, top.S, top.W], lights ? "#3a3438" : "#221e22", p.outline);
  const halves = midSplit(full, rot);
  for (const c of halves) {
    const d = 0.16;
    const plat = diamond(c.x + c.w / 2 - d, c.y + c.h / 2 - d, d * 2, d * 2, 13);
    fillPts(ctx, [plat.N, plat.E, plat.S, plat.W], "#121214", lights ? "#c0c4c8" : "#555");
    const hub = diamond(c.x + c.w / 2 - 0.04, c.y + c.h / 2 - 0.04, 0.08, 0.08, 14);
    fillPts(ctx, [hub.N, hub.E, hub.S, hub.W], lights ? "#d8dce0" : "#666", null);
  }
}

function drawRack(ctx, tw, th, rot, lights) {
  const full = insetBox(tw, th);
  const metal = pal("#5a564e", lights);
  shadow(ctx, full.x, full.y, full.w, full.h, 0.25);
  const post = 0.1;
  box(ctx, full.x, full.y, post, post, 0, 32, metal);
  box(ctx, full.x + full.w - post, full.y, post, post, 0, 32, metal);
  box(ctx, full.x, full.y + full.h - post, post, post, 0, 32, metal);
  box(ctx, full.x + full.w - post, full.y + full.h - post, post, post, 0, 32, metal);
  const colors = lights ? ["#c43a4a", "#3d4f7c", "#2a2a2e"] : ["#423", "#234", "#223"];
  [10, 18, 26].forEach((z, i) => {
    box(ctx, full.x, full.y, full.w, full.h, z, 2, metal);
    const u = 0.15 + (i % 2) * 0.2;
    box(ctx, full.x + u, full.y + 0.15, 0.35, 0.4, z + 2, 8, pal(colors[i], true));
  });
}

function drawMannequin(ctx, tw, th, lights) {
  const full = insetBox(tw, th);
  const stand = pal("#5a564e", lights);
  const skin = pal("#d8c4a8", lights);
  const cloth = pal("#2a2a2e", lights);
  const pants = pal("#3d4f7c", lights);
  shadow(ctx, full.x, full.y, full.w, full.h, 0.25);
  const c = 0.16;
  box(ctx, tw / 2 - c / 2, th / 2 - c / 2, c, c, 0, 4, stand);
  box(ctx, tw / 2 - 0.1, th / 2 - 0.1, 0.2, 0.2, 4, 14, pants);
  box(ctx, tw / 2 - 0.14, th / 2 - 0.14, 0.28, 0.28, 18, 12, cloth);
  box(ctx, tw / 2 - 0.1, th / 2 - 0.1, 0.2, 0.2, 30, 8, skin);
}

function drawPen(ctx, tw, th, lights, cage) {
  const full = insetBox(tw, th);
  const metal = pal("#5a564e", lights);
  const floor = pal(cage ? "#3a3834" : "#1a1820", lights);
  shadow(ctx, full.x, full.y, full.w, full.h, 0.25);
  box(ctx, full.x, full.y, full.w, full.h, 0, 4, floor);
  const post = 0.08;
  const h = cage ? 18 : 16;
  const corners = [
    [full.x, full.y],
    [full.x + full.w - post, full.y],
    [full.x, full.y + full.h - post],
    [full.x + full.w - post, full.y + full.h - post],
  ];
  for (const [x, y] of corners) box(ctx, x, y, post, post, 4, h, metal);
  box(ctx, full.x, full.y, full.w, full.h, 4 + h, 2, metal);
  if (cage) {
    const n = 4;
    for (let i = 1; i < n; i++) {
      const t = i / n;
      box(ctx, full.x + (full.w - post) * t, full.y, post, post, 4, h, metal);
      box(ctx, full.x, full.y + (full.h - post) * t, post, post, 4, h, metal);
    }
  }
}

function paintPiece(ctx, type, rot, lights, on, open, opts = {}) {
  const { tw, th } = furnSpriteMetrics(type, rot);
  const r = normalizeFurnRot(rot);
  switch (type) {
    case "rug": drawRug(ctx, tw, th, lights); break;
    case "plant":
    case "podplant": drawPlant(ctx, tw, th, lights, type === "podplant"); break;
    case "lamp": drawLamp(ctx, tw, th, lights, false); break;
    case "neonsign": drawLamp(ctx, tw, th, lights, true); break;
    case "couch":
    case "capsulecouch": drawSeat(ctx, tw, th, r, lights, type, opts.part || "all"); break;
    case "chair":
    case "hoverchair": drawChair(ctx, tw, th, r, lights, type === "hoverchair", opts.part || "all"); break;
    case "table":
    case "coffeetable":
    case "counter":
    case "kitchenette": drawTable(ctx, tw, th, r, lights, type); break;
    case "bed": drawBed(ctx, tw, th, r, lights); break;
    case "tv":
    case "holotv": drawTV(ctx, tw, th, r, lights, on, type === "holotv", opts.screen); break;
    case "fridge": drawFridge(ctx, tw, th, r, lights, open); break;
    case "chesstable": drawChessTableSmall(ctx, tw, th, r, lights, ISO_DRAW); break;
    case "chessstool": drawChessStool(ctx, tw, th, r, lights, ISO_DRAW); break;
    case "cubics": drawRetroArcade(ctx, tw, th, r, lights, opts.flicker || 0); break;
    case "pinball": drawArcade(ctx, tw, th, r, lights, type); break;
    case "sodavending": drawVending(ctx, tw, th, r, lights); break;
    case "bookshelf":
    case "clothescab": drawBookshelf(ctx, tw, th, r, lights, type === "clothescab"); break;
    case "coffeemachine": drawCoffeeMaker(ctx, tw, th, r, lights, opts, ISO_DRAW); break;
    case "stove": drawStove(ctx, tw, th, r, lights, opts, ISO_DRAW); break;
    case "pooltable": drawPoolTable(ctx, tw, th, r, lights, opts, ISO_DRAW); break;
    case "recordplayer": drawRecordPlayer(ctx, tw, th, r, lights, { ...opts, on }, ISO_DRAW); break;
    case "punchbag":
    case "heavybag":
    case "benchpress":
    case "treadmill": drawGym(ctx, tw, th, r, lights, type); break;
    case "djdeck": drawDeck(ctx, tw, th, r, lights); break;
    case "rack": drawRack(ctx, tw, th, r, lights); break;
    case "mannequin": drawMannequin(ctx, tw, th, lights); break;
    case "petpen":
    case "cage": drawPen(ctx, tw, th, lights, type === "cage"); break;
    default: {
      const full = insetBox(tw, th);
      const p = pal("#6d7c8a", lights);
      shadow(ctx, full.x, full.y, full.w, full.h, 0.28);
      box(ctx, full.x, full.y, full.w, full.h, 0, 16, p);
    }
  }
}

export function drawFurnitureSprite(type, opts = {}) {
  if (type === "shopkeeper") return null;
  const lights = opts.lights !== false;
  const rot = normalizeFurnRot(opts.rot);
  const on = Boolean(opts.on);
  const open = Boolean(opts.open);
  const brewing = Boolean(opts.brewing);
  const steamFrame = (type === "coffeemachine" || type === "stove") ? (opts.steamFrame ?? 0) : 0;
  const flameFrame = type === "stove" ? (opts.flameFrame ?? 0) : 0;
  const spinFrame = type === "recordplayer" ? (opts.spinFrame ?? 0) : 0;
  const vinyl = type === "recordplayer" ? (opts.vinyl || "") : "";
  const flicker = type === "cubics" ? (opts.flicker ?? 0) : 0;
  const part = opts.part || "all";
  const screen = opts.screen || null;
  const key = "iso-furn:" + type + ":" + rot + ":" + lights + ":" + on + ":" + open + ":" + (opts.sku || "") + ":" + part + (type === "coffeemachine" ? (":brew" + brewing + ":st" + steamFrame) : "") + (type === "stove" ? (":on" + on + ":st" + steamFrame + ":fl" + flameFrame) : "") + (type === "recordplayer" ? (":v" + vinyl + ":sp" + spinFrame + ":on" + on) : "") + (type === "cubics" ? (":fk" + flicker) : "");
  const m = furnSpriteMetrics(type, rot, { open });
  const body = sprite(key, m.w, m.h, (ctx) => {
    ctx.save();
    ctx.translate(m.ox, m.oy);
    paintPiece(ctx, type, rot, lights, on, open, { brewing, steamFrame, flameFrame, sku: opts.sku, spinFrame, vinyl, flicker, on, part });
    ctx.restore();
  });
  if (!screen || !on || (type !== "tv" && type !== "holotv")) return body;
  // Fresh canvas per draw so two TVs (or a preview sheet) cannot share pixels.
  const s = document.createElement("canvas");
  s.width = body.c.width;
  s.height = body.c.height;
  const ctx = s.getContext("2d");
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(body.c, 0, 0);
  ctx.save();
  ctx.translate(m.ox, m.oy);
  const fc = tvFrontCorners(m.tw, m.th, rot);
  if (fc) faceImage(ctx, fc, TV_SCREEN_UV.u0, TV_SCREEN_UV.v0, TV_SCREEN_UV.u1, TV_SCREEN_UV.v1, screen);
  ctx.restore();
  return { c: s, w: body.w, h: body.h };
}

export function drawChessStoolSprite(opts = {}) {
  return drawFurnitureSprite(CHESS_STOOL_TYPE, opts);
}

export function paintFurnitureSheet(canvas, scale = 2) {
  const types = FURN_SHEET_TYPES;
  const rots = [0, 1, 2, 3];
  const labels = ["SW  +Y", "SE  +X", "NE  -Y", "NW  -X"];
  let cellW = 0, cellH = 0;
  for (const t of types) {
    for (const r of rots) {
      const m = furnSpriteMetrics(t, r);
      cellW = Math.max(cellW, m.w);
      cellH = Math.max(cellH, m.h);
    }
  }
  const s = Math.max(1, scale | 0);
  const nameW = 110;
  const pad = 10;
  const header = 28;
  const w = nameW + rots.length * (cellW * s + pad) + pad;
  const h = header + types.length * (cellH * s + pad) + pad;
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  ctx.imageSmoothingEnabled = false;
  ctx.fillStyle = "#1a1612";
  ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = "#efe6d4";
  ctx.font = "bold 14px sans-serif";
  ctx.fillText("Furniture · 4 edge-facing orientations", 12, 18);
  ctx.font = "11px sans-serif";
  rots.forEach((r, i) => {
    const x = nameW + i * (cellW * s + pad);
    ctx.fillStyle = "#c4a070";
    ctx.fillText("rot " + r + "  " + labels[i], x, 24);
  });
  types.forEach((t, row) => {
    const y = header + row * (cellH * s + pad);
    ctx.fillStyle = "#d8d0c4";
    ctx.font = "11px sans-serif";
    ctx.fillText(t, 10, y + cellH * s / 2);
    rots.forEach((r, col) => {
      const spr = drawFurnitureSprite(t, { lights: true, rot: r, on: true });
      if (!spr?.c) return;
      const x = nameW + col * (cellW * s + pad);
      // floor diamond under each piece, so alignment is obvious
      const m = furnSpriteMetrics(t, r);
      ctx.save();
      ctx.translate(x, y);
      ctx.scale(s, s);
      ctx.translate(m.ox, m.oy);
      const d = diamond(0, 0, m.tw, m.th, 0);
      ctx.globalAlpha = 0.45;
      fillPts(ctx, [d.N, d.E, d.S, d.W], "#8a5a32", "#c4a070");
      // inner tile edges
      ctx.globalAlpha = 0.35;
      ctx.strokeStyle = "#2a1c14";
      ctx.lineWidth = 1;
      for (let tx = 1; tx < m.tw; tx++) {
        const a = pt(tx, 0, 0), b = pt(tx, m.th, 0);
        ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
      }
      for (let ty = 1; ty < m.th; ty++) {
        const a = pt(0, ty, 0), b = pt(m.tw, ty, 0);
        ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
      }
      ctx.globalAlpha = 1;
      ctx.restore();
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(spr.c, x, y, spr.w * s, spr.h * s);
    });
  });
  return canvas;
}

export function hitFurnitureAt(f, sx, sy, screenToTile) {
  if (!f || f.wall) return false;
  const r = normalizeFurnRot(f.rot);
  const { w, h } = furnTileDims(f.type, r);
  const bodyH = furnBodyHeight(f.type);
  for (let lift = 0; lift <= bodyH; lift += 2) {
    const t = screenToTile(sx, sy + lift);
    const lx = t.x - f.x, ly = t.y - f.y;
    if (lx >= 0 && ly >= 0 && lx < w && ly < h) return true;
  }
  return false;
}

if (typeof window !== "undefined") {
  window.__paintFurnitureSheet = paintFurnitureSheet;
  window.__drawFurnitureSprite = drawFurnitureSprite;
  window.__normalizeFurnRot = normalizeFurnRot;
}
