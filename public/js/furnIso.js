/* Isometric furniture sprites — edges stay parallel to the floor-tile grid.
   Rotation is only the 4 axis directions: 0 = +Y (SW), 1 = +X (SE), 2 = -Y (NE), 3 = -X (NW). */
const TW = 64;
const TH = 32;
const I = 0.125;

const TILES = {
  rug: [2, 2], plant: [1, 1], podplant: [1, 1], lamp: [1, 1], table: [2, 1],
  coffeetable: [2, 1], couch: [2, 1], capsulecouch: [2, 1], bed: [2, 3],
  tv: [2, 1], holotv: [2, 1], fridge: [1, 1], kitchenette: [2, 1], chair: [1, 1],
  hoverchair: [1, 1], bookshelf: [2, 1], chesstable: [2, 2], punchbag: [1, 1],
  heavybag: [1, 1], benchpress: [2, 1], treadmill: [1, 2], cubics: [1, 1],
  clothescab: [1, 1], coffeemachine: [1, 1], djdeck: [2, 1], sodavending: [1, 1],
  neonsign: [1, 1], pinball: [1, 1], rack: [1, 1], mannequin: [1, 1],
  petpen: [2, 1], cage: [1, 1], counter: [2, 1],
};

const BODY_H = {
  rug: 4, plant: 36, podplant: 38, lamp: 48, table: 18, coffeetable: 14, counter: 20,
  couch: 26, capsulecouch: 26, chair: 24, hoverchair: 32, bed: 18, tv: 26, holotv: 26,
  fridge: 44, kitchenette: 24, bookshelf: 42, chesstable: 16, punchbag: 46, heavybag: 46,
  benchpress: 22, treadmill: 30, cubics: 44, pinball: 40, clothescab: 42, coffeemachine: 26,
  djdeck: 18, sodavending: 46, neonsign: 46, rack: 36, mannequin: 42, petpen: 22, cage: 24,
};

export const FURN_SHEET_TYPES = [
  "rug", "plant", "podplant", "lamp", "neonsign", "table", "coffeetable", "counter",
  "chair", "hoverchair", "couch", "capsulecouch", "bed", "tv", "holotv", "fridge",
  "kitchenette", "bookshelf", "clothescab", "chesstable", "coffeemachine", "cubics",
  "pinball", "djdeck", "sodavending", "punchbag", "benchpress", "treadmill",
  "rack", "mannequin", "petpen", "cage",
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

export function furnSpriteMetrics(type, rot = 0) {
  const { w, h } = furnTileDims(type, rot);
  const bodyH = furnBodyHeight(type);
  const pad = 2;
  const ox = pad + h * (TW / 2);
  const oy = pad + bodyH;
  const width = pad * 2 + (w + h) * (TW / 2);
  const height = pad * 2 + (w + h) * (TH / 2) + bodyH;
  return { w: width, h: height, ox, oy, tw: w, th: h, bodyH, pad };
}

export function furnBlitPos(tx, ty, type, rot, toScreen) {
  const m = furnSpriteMetrics(type, rot);
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

function faceGlyph(ctx, corners, text, color, u0, v0, u1, v1) {
  const glyphs = {
    C: ["#####","#    ","#    ","#    ","#####"],
    U: ["#   #","#   #","#   #","#   #","#####"],
    B: ["#### ","#   #","#### ","#   #","#### "],
    E: ["#####","#    ","#### ","#    ","#####"],
  };
  const letters = String(text).split("");
  const gap = 0.15;
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

function drawSeat(ctx, tw, th, rot, lights, kind) {
  const studio = kind === "capsulecouch";
  const base = studio ? "#b41828" : "#9a1420";
  const p = pal(base, lights, { cushion: studio ? "#e83848" : "#d42838", pip: "#ffd0d4" });
  const legs = pal("#5a3a28", lights);
  const seatH = 10;
  const backH = 22;
  const backD = 0.28;
  const full = insetBox(tw, th);
  shadow(ctx, full.x, full.y, full.w, full.h, 0.34);
  // short legs at the four corners
  const leg = 0.12;
  const spots = [
    [full.x + 0.04, full.y + 0.04],
    [full.x + full.w - leg - 0.04, full.y + 0.04],
    [full.x + 0.04, full.y + full.h - leg - 0.04],
    [full.x + full.w - leg - 0.04, full.y + full.h - leg - 0.04],
  ];
  for (const [lx, ly] of spots) box(ctx, lx, ly, leg, leg, 0, 4, legs);
  const seat = seatRect(tw, th, rot, backD);
  const back = backRect(tw, th, rot, backD);
  box(ctx, seat.x, seat.y, seat.w, seat.h, 4, seatH, {
    top: p.cushion, left: p.left, right: p.right, outline: p.outline,
  });
  // two cushions along the width
  const halves = midSplit(seat, rot);
  for (const c of halves) {
    box(ctx, c.x + 0.03, c.y + 0.03, Math.max(0.1, c.w - 0.06), Math.max(0.1, c.h - 0.06), 4 + seatH, 2, {
      top: lights ? p.pip : shade(p.pip, -30), left: p.left, right: p.right, outline: p.outline,
    });
  }
  box(ctx, back.x, back.y, back.w, back.h, 4, backH, p);
  const front = visibleFront(rot);
  if (front) {
    const fc = faceCorners(back.x, back.y, back.w, back.h, 4, backH, front);
    faceRect(ctx, fc, 0.12, 0.2, 0.88, 0.85, lights ? shade(p.cushion, 18) : shade(p.cushion, -20), p.outline);
  }
}

function drawChair(ctx, tw, th, rot, lights, hover) {
  const full = insetBox(tw, th);
  shadow(ctx, full.x, full.y, full.w, full.h, 0.3);
  if (hover) {
    const p = pal("#efe6d4", lights, { seat: "#3a3040" });
    const base = pal("#8a8e92", lights);
    box(ctx, full.x + 0.18, full.y + 0.18, full.w - 0.36, full.h - 0.36, 0, 4, base);
    // stacked diamonds for the egg, edges stay on the grid axes
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
    const seat = pal("#3a3040", lights);
    box(ctx, full.x + 0.22, full.y + 0.22, full.w - 0.44, full.h - 0.44, 8, 6, seat);
    return;
  }
  const p = pal("#c48850", lights, { seat: "#d4a060" });
  const legs = pal("#5a3a22", lights);
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
  const back = backRect(tw, th, rot, backD);
  box(ctx, seat.x, seat.y, seat.w, seat.h, 6, 8, p);
  box(ctx, back.x, back.y, back.w, back.h, 6, 20, p);
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
  const full = insetBox(tw, th);
  const frame = pal("#6b4a32", lights);
  const sheet = pal("#d8c8b0", lights, { pillow: "#efe6d4" });
  shadow(ctx, full.x, full.y, full.w, full.h, 0.3);
  box(ctx, full.x, full.y, full.w, full.h, 0, 8, frame);
  const inset = 0.08;
  box(ctx, full.x + inset, full.y + inset, full.w - inset * 2, full.h - inset * 2, 8, 4, sheet);
  const pillowD = 0.42;
  const head = backRect(tw, th, rot, pillowD);
  box(ctx, head.x + 0.05, head.y + 0.05, Math.max(0.2, head.w - 0.1), Math.max(0.2, head.h - 0.1), 12, 4, {
    top: lights ? sheet.pillow : shade(sheet.pillow, -30),
    left: shade("#efe6d4", -20),
    right: shade("#efe6d4", -40),
    outline: frame.outline,
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

function drawTV(ctx, tw, th, rot, lights, on, holo) {
  const full = insetBox(tw, th);
  const stand = pal("#3a3228", lights);
  const body = pal("#2a2a2e", lights);
  shadow(ctx, full.x, full.y, full.w, full.h, 0.3);
  box(ctx, full.x + 0.1, full.y + 0.1, full.w - 0.2, full.h - 0.2, 0, 6, stand);
  const unit = { x: full.x, y: full.y, w: full.w, h: full.h };
  box(ctx, unit.x, unit.y, unit.w, unit.h, 6, 18, body);
  const front = visibleFront(rot);
  if (front) {
    const fc = faceCorners(unit.x, unit.y, unit.w, unit.h, 6, 18, front);
    const scr = on && lights ? (holo ? "#1a2840" : "#152238") : "#101014";
    faceRect(ctx, fc, 0.1, 0.18, 0.9, 0.88, scr, "#1a1a1c");
    if (on && lights) {
      faceRect(ctx, fc, 0.14, 0.55, 0.9, 0.82, "#3a6aaa", null);
      faceRect(ctx, fc, 0.14, 0.28, 0.42, 0.5, "#c4a070", null);
      faceRect(ctx, fc, 0.48, 0.28, 0.86, 0.5, "#6a9a50", null);
    }
  }
}

function drawFridge(ctx, tw, th, rot, lights, open) {
  drawCabinet(ctx, tw, th, rot, lights, 40, "#e8e4dc", (c, fc, p) => {
    if (open) {
      faceRect(c, fc, 0.08, 0.08, 0.92, 0.92, "#2a2a28", p.outline);
      return;
    }
    faceRect(c, fc, 0.1, 0.52, 0.9, 0.94, lights ? "#f4f0e8" : "#a8a49c", p.outline);
    faceRect(c, fc, 0.1, 0.08, 0.9, 0.46, lights ? "#f4f0e8" : "#a8a49c", p.outline);
    faceRect(c, fc, 0.78, 0.28, 0.86, 0.4, lights ? "#c4a35a" : "#888", p.outline);
  });
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

function paintPiece(ctx, type, rot, lights, on, open) {
  const { tw, th } = furnSpriteMetrics(type, rot);
  const r = normalizeFurnRot(rot);
  switch (type) {
    case "rug": drawRug(ctx, tw, th, lights); break;
    case "plant":
    case "podplant": drawPlant(ctx, tw, th, lights, type === "podplant"); break;
    case "lamp": drawLamp(ctx, tw, th, lights, false); break;
    case "neonsign": drawLamp(ctx, tw, th, lights, true); break;
    case "couch":
    case "capsulecouch": drawSeat(ctx, tw, th, r, lights, type); break;
    case "chair":
    case "hoverchair": drawChair(ctx, tw, th, r, lights, type === "hoverchair"); break;
    case "table":
    case "coffeetable":
    case "counter":
    case "kitchenette": drawTable(ctx, tw, th, r, lights, type); break;
    case "bed": drawBed(ctx, tw, th, r, lights); break;
    case "tv":
    case "holotv": drawTV(ctx, tw, th, r, lights, on, type === "holotv"); break;
    case "fridge": drawFridge(ctx, tw, th, r, lights, open); break;
    case "chesstable": drawChessTable(ctx, tw, th, r, lights); break;
    case "cubics":
    case "pinball": drawArcade(ctx, tw, th, r, lights, type); break;
    case "sodavending": drawVending(ctx, tw, th, r, lights); break;
    case "bookshelf":
    case "clothescab": drawBookshelf(ctx, tw, th, r, lights, type === "clothescab"); break;
    case "coffeemachine": drawCoffee(ctx, tw, th, r, lights); break;
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
  const key = "iso-furn:" + type + ":" + rot + ":" + lights + ":" + on + ":" + open + ":" + (opts.sku || "");
  const m = furnSpriteMetrics(type, rot);
  return sprite(key, m.w, m.h, (ctx) => {
    ctx.save();
    ctx.translate(m.ox, m.oy);
    paintPiece(ctx, type, rot, lights, on, open);
    ctx.restore();
  });
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
