/* Decorative billiards set: a 2x2 pool table and a wall-mounted cue rack. */

export const POOL_TABLE_TYPE = "pooltable";
export const POOL_TABLE_NAME = "Pool Table";
export const POOL_TABLE_PRICE = 60;
export const POOL_TABLE_TILES = [2, 2];

export const CUE_RACK_TYPE = "cuerack";
export const CUE_RACK_NAME = "Cue Rack";
export const CUE_RACK_PRICE = 20;

export const CUE_COUNT = 4;

// Wall placement, a bit taller than a painting so the four cues read as long sticks.
export const CUE_U0 = 0.10;
export const CUE_U1 = 0.90;
export const CUE_V0 = 6;
export const CUE_V1 = 64;

const BALL_COLORS = [
  "#f0e6c8", // cue (white) drawn separately
  "#f0c01c", // 1 yellow
  "#1c4ad8", // 2 blue
  "#d42828", // 3 red
  "#4a1c8a", // 4 purple
  "#d86810", // 5 orange
  "#1c7a28", // 6 green
  "#6a1028", // 7 maroon
  "#141414", // 8 black
  "#f0c01c",
  "#1c4ad8",
  "#d42828",
  "#4a1c8a",
  "#d86810",
  "#1c7a28",
];

function shadeHex(hex, amt, lights = true) {
  const n = Math.max(-180, Math.min(180, amt + (lights ? 0 : -36)));
  const h = hex.replace("#", "");
  const v = parseInt(h.length === 3 ? h.split("").map((c) => c + c).join("") : h, 16);
  const r = Math.max(0, Math.min(255, ((v >> 16) & 255) + n));
  const g = Math.max(0, Math.min(255, ((v >> 8) & 255) + n));
  const b = Math.max(0, Math.min(255, (v & 255) + n));
  return "#" + ((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1);
}

function lengthAlongX(rot) {
  const r = ((Number(rot) % 4) + 4) % 4;
  return r === 1 || r === 3;
}

function ballGrid(alongX) {
  // Triangle rack at the foot, cue ball at the head. 10 object balls + cue.
  const rows = [[0], [-0.55, 0.55], [-1.1, 0, 1.1], [-1.65, -0.55, 0.55, 1.65]];
  const foot = 0.72;
  const balls = [];
  let i = 1;
  rows.forEach((row, ri) => {
    const along = foot - ri * 0.085;
    for (const across of row) {
      balls.push({ along, across, color: BALL_COLORS[i % BALL_COLORS.length], kind: i === 8 ? "eight" : "obj", i });
      i += 1;
    }
  });
  balls.push({ along: 0.28, across: 0, color: "#fffaf0", kind: "cue", i: 0 });
  return balls.map((b) => alongX
    ? { u: b.along, v: 0.5 + b.across * 0.13, color: b.color, kind: b.kind }
    : { u: 0.5 + b.across * 0.13, v: b.along, color: b.color, kind: b.kind });
}

function drawPocket(ctx, x, y, lift, lights, iso) {
  const { box, pal } = iso;
  const s = 0.18;
  box(ctx, x - s / 2, y - s / 2, s, s, lift, 1.2, pal(lights ? "#1a1214" : "#0c0a0c", lights, { top: "#2a1c1c" }));
}

function drawBall(ctx, x, y, lift, color, lights, kind, iso) {
  const { box, pal, shade } = iso;
  const s = kind === "cue" ? 0.12 : 0.10;
  const top = lights ? shadeHex(color, 28, true) : shadeHex(color, 8, false);
  box(ctx, x - s / 2, y - s / 2, s, s, lift, 2.2, pal(color, lights, { top }));
  // Tiny highlight so they read as spheres, not crates.
  box(ctx, x - s * 0.18, y - s * 0.22, s * 0.28, s * 0.22, lift + 2.2, 0.4, pal("#ffffff", lights));
}

export function drawPoolTable(ctx, tw, th, rot, lights, opts, iso) {
  const { box, pal, shadow, insetBox, shade } = iso;
  const r = ((Number(rot) % 4) + 4) % 4;
  const alongX = lengthAlongX(r);
  const full = insetBox(tw, th);
  const body = { x: full.x + 0.04, y: full.y + 0.04, w: full.w - 0.08, h: full.h - 0.08 };
  const wood = pal(lights ? "#6b4228" : "#3a2418", lights, { top: lights ? "#8a5a32" : "#4a301c" });
  const rail = pal(lights ? "#5a3620" : "#2e1c12", lights, { top: lights ? "#7a4a28" : "#3e2818" });
  const felt = pal(lights ? "#1c7a3a" : "#0e3a1c", lights, { top: lights ? "#2a9a4a" : "#145028" });
  const tableH = 12;

  shadow(ctx, body.x, body.y, body.w, body.h, 0.34);
  // Legs at the four corners, slightly inset.
  const leg = 0.16;
  const legPal = pal("#3a2418", lights);
  const spots = [
    [body.x + 0.06, body.y + 0.06],
    [body.x + body.w - leg - 0.06, body.y + 0.06],
    [body.x + 0.06, body.y + body.h - leg - 0.06],
    [body.x + body.w - leg - 0.06, body.y + body.h - leg - 0.06],
  ];
  for (const [lx, ly] of spots) box(ctx, lx, ly, leg, leg, 0, tableH - 1, legPal);

  box(ctx, body.x, body.y, body.w, body.h, tableH - 1, 2.2, wood);
  // Felt inset inside the rail.
  const inset = 0.10;
  box(ctx, body.x + inset, body.y + inset, body.w - inset * 2, body.h - inset * 2, tableH + 1.2, 0.8, felt);
  // Wooden rail ring on top of the felt edge.
  box(ctx, body.x, body.y, body.w, body.h, tableH + 2.0, 1.6, rail);

  // Recut the felt on top so the rail is only a border.
  const feltInset = 0.12;
  box(ctx, body.x + feltInset, body.y + feltInset, body.w - feltInset * 2, body.h - feltInset * 2, tableH + 3.4, 0.5, felt);

  const pocketLift = tableH + 3.0;
  const corners = [
    [body.x + 0.07, body.y + 0.07],
    [body.x + body.w - 0.07, body.y + 0.07],
    [body.x + 0.07, body.y + body.h - 0.07],
    [body.x + body.w - 0.07, body.y + body.h - 0.07],
  ];
  for (const [px, py] of corners) drawPocket(ctx, px, py, pocketLift, lights, iso);
  if (alongX) {
    drawPocket(ctx, body.x + body.w / 2, body.y + 0.06, pocketLift, lights, iso);
    drawPocket(ctx, body.x + body.w / 2, body.y + body.h - 0.06, pocketLift, lights, iso);
  } else {
    drawPocket(ctx, body.x + 0.06, body.y + body.h / 2, pocketLift, lights, iso);
    drawPocket(ctx, body.x + body.w - 0.06, body.y + body.h / 2, pocketLift, lights, iso);
  }

  // Diamond sights on the rails.
  const sight = pal(lights ? "#e8d2a0" : "#8a7450", lights);
  const marks = alongX
    ? [
        [0.30, 0.03], [0.70, 0.03], [0.30, 0.97], [0.70, 0.97],
        [0.03, 0.30], [0.03, 0.70], [0.97, 0.30], [0.97, 0.70],
      ]
    : [
        [0.03, 0.30], [0.03, 0.70], [0.97, 0.30], [0.97, 0.70],
        [0.30, 0.03], [0.70, 0.03], [0.30, 0.97], [0.70, 0.97],
      ];
  for (const [u, v] of marks) {
    const sx = body.x + u * body.w, sy = body.y + v * body.h;
    box(ctx, sx - 0.03, sy - 0.03, 0.06, 0.06, tableH + 3.7, 0.5, sight);
  }

  const ballLift = tableH + 4.2;
  for (const b of ballGrid(alongX)) {
    const x = body.x + feltInset + b.u * (body.w - feltInset * 2);
    const y = body.y + feltInset + b.v * (body.h - feltInset * 2);
    drawBall(ctx, x, y, ballLift, b.color, lights, b.kind, iso);
  }
}

export function cueRackQuad(wall, slot, wallPt) {
  const t0 = slot + CUE_U0, t1 = slot + CUE_U1;
  return [
    wallPt(wall, t0, CUE_V0),
    wallPt(wall, t1, CUE_V0),
    wallPt(wall, t1, CUE_V1),
    wallPt(wall, t0, CUE_V1),
  ];
}

export function drawCueRackOnWall(ctx, wall, slot, lights, helpers) {
  const { wallPt, fillPoly } = helpers;
  const ink = lights ? "#2a1c12" : "#14100c";
  const board = lights ? "#6b4228" : "#3a2418";
  const boardHi = lights ? "#8a5a32" : "#4a301c";
  const shaft = lights ? "#d8b07a" : "#8a6a40";
  const shaftHi = lights ? "#f0d4a0" : "#a08050";
  const wrap = lights ? "#3a2418" : "#24180e";
  const tip = lights ? "#3a6ad8" : "#244a98";
  const ferrule = lights ? "#f4efe4" : "#b0a898";
  const chalk = lights ? "#3a7ad0" : "#245090";

  const strip = (u0, u1, v0, v1, fill, stroke = ink) => {
    fillPoly(ctx, [
      wallPt(wall, slot + u0, v0),
      wallPt(wall, slot + u1, v0),
      wallPt(wall, slot + u1, v1),
      wallPt(wall, slot + u0, v1),
    ], fill, stroke);
  };

  // Wooden backboard and two holding brackets.
  strip(0.12, 0.88, 8, 62, board, ink);
  strip(0.16, 0.84, 14, 18, boardHi, ink);
  strip(0.16, 0.84, 46, 50, boardHi, ink);

  const us = [0.26, 0.42, 0.58, 0.74];
  us.forEach((u, i) => {
    const lean = (i - 1.5) * 0.012;
    const u0 = u - 0.035 + lean, u1 = u + 0.035 + lean;
    // Butt
    strip(u0 - 0.01, u1 + 0.01, 10, 18, wrap, ink);
    // Wrap / grip
    strip(u0, u1, 18, 28, lights ? "#5a3a24" : "#3a2418", ink);
    // Shaft
    strip(u0 + 0.008, u1 - 0.008, 28, 54, shaft, ink);
    strip(u0 + 0.016, u1 - 0.004, 30, 44, shaftHi, null);
    // Ferrule + blue tip
    strip(u0 + 0.01, u1 - 0.01, 54, 57, ferrule, ink);
    strip(u0 + 0.014, u1 - 0.014, 57, 60, tip, ink);
  });

  // Chalk cube on the bottom rail.
  strip(0.70, 0.84, 9, 16, chalk, ink);
  strip(0.73, 0.81, 12, 15, lights ? "#7ab0f0" : "#3a68a0", null);
}

export default {
  POOL_TABLE_TYPE, POOL_TABLE_NAME, POOL_TABLE_PRICE, POOL_TABLE_TILES,
  CUE_RACK_TYPE, CUE_RACK_NAME, CUE_RACK_PRICE, CUE_COUNT,
  CUE_U0, CUE_U1, CUE_V0, CUE_V1,
  drawPoolTable, drawCueRackOnWall, cueRackQuad,
};
