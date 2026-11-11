/* One-tile chess table with two stools tucked on opposite adjacent tiles. */

export const CHESS_TABLE_TILES = [1, 1];
export const CHESS_SEAT_TUCK = 0.22;
export const CHESS_TABLE_SIZE = 1;
export const CHESS_BOARD = 0.72;
export const CHESS_SQUARE = 0.09;
export const CHESS_STOOL_TYPE = "chessstool";

function normalizeRot(rot) {
  const n = Number(rot);
  if (!Number.isFinite(n)) return 0;
  if (Math.abs(n) >= 45) {
    const deg = ((n % 360) + 360) % 360;
    return Math.round(deg / 90) % 4;
  }
  return ((Math.round(n) % 4) + 4) % 4;
}

export function chessBoardMetrics() {
  return { square: CHESS_SQUARE, board: CHESS_BOARD, table: CHESS_TABLE_SIZE };
}

/** Person coordinates (avatars are drawn at x+0.5, y+0.5). */
export function chessSeatPose(furn, seatNum) {
  const rot = normalizeRot(furn.rot);
  const tx = Number(furn.x) || 0;
  const ty = Number(furn.y) || 0;
  const seat = seatNum === 1 ? 1 : 0;
  const tuck = CHESS_SEAT_TUCK;
  if (rot === 0) {
    return seat === 0
      ? { x: tx, y: ty + 0.5 + tuck, facing: { x: 0, z: -1 } }
      : { x: tx, y: ty - 0.5 - tuck, facing: { x: 0, z: 1 } };
  }
  if (rot === 1) {
    return seat === 0
      ? { x: tx + 0.5 + tuck, y: ty, facing: { x: -1, z: 0 } }
      : { x: tx - 0.5 - tuck, y: ty, facing: { x: 1, z: 0 } };
  }
  if (rot === 2) {
    return seat === 0
      ? { x: tx, y: ty - 0.5 - tuck, facing: { x: 0, z: 1 } }
      : { x: tx, y: ty + 0.5 + tuck, facing: { x: 0, z: -1 } };
  }
  return seat === 0
    ? { x: tx - 0.5 - tuck, y: ty, facing: { x: 1, z: 0 } }
    : { x: tx + 0.5 + tuck, y: ty, facing: { x: -1, z: 0 } };
}

export function chessSeatTiles(x, y, rot) {
  const f = { x, y, rot };
  return [0, 1].map((seat) => {
    const p = chessSeatPose(f, seat);
    return { x: Math.floor(p.x + 0.5), y: Math.floor(p.y + 0.5) };
  });
}

export function canPlaceChessAt(x, y, rot, size, isFree) {
  const n = size || 6;
  if (!Number.isInteger(x) || !Number.isInteger(y)) return false;
  if (x < 0 || y < 0 || x >= n || y >= n) return false;
  if (isFree && !isFree(x, y)) return false;
  for (const t of chessSeatTiles(x, y, rot)) {
    if (t.x < 0 || t.y < 0 || t.x >= n || t.y >= n) return false;
    if (isFree && !isFree(t.x, t.y)) return false;
  }
  return true;
}

export function migrateChessTable(item, size, isFree) {
  const n = size || 6;
  const rot0 = normalizeRot(item.rot);
  const rots = [rot0, (rot0 + 1) % 4, (rot0 + 3) % 4, (rot0 + 2) % 4];
  const origins = [];
  for (const dy of [0, 1, -1, 2, -2]) {
    for (const dx of [0, 1, -1, 2, -2]) origins.push([item.x + dx, item.y + dy]);
  }
  const seen = new Set();
  for (const rot of rots) {
    for (const [x, y] of origins) {
      const key = x + "," + y + ":" + rot;
      if (seen.has(key)) continue;
      seen.add(key);
      if (canPlaceChessAt(x, y, rot, n, isFree)) return { x, y, rot };
    }
  }
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      for (const rot of rots) {
        if (canPlaceChessAt(x, y, rot, n, isFree)) return { x, y, rot };
      }
    }
  }
  return null;
}

export function drawChessTableSmall(ctx, tw, th, rot, lights, iso) {
  const { box, pal, shadow, insetBox, diamond, fillPts } = iso;
  const full = insetBox(tw, th);
  const p = pal("#5a3a28", lights);
  const legs = pal("#3a2818", lights);
  shadow(ctx, full.x, full.y, full.w, full.h, 0.3);
  const leg = 0.12;
  const inset = 0.08;
  const spots = [
    [full.x + inset, full.y + inset],
    [full.x + full.w - leg - inset, full.y + inset],
    [full.x + inset, full.y + full.h - leg - inset],
    [full.x + full.w - leg - inset, full.y + full.h - leg - inset],
  ];
  for (const [lx, ly] of spots) box(ctx, lx, ly, leg, leg, 0, 10, legs);
  box(ctx, full.x, full.y, full.w, full.h, 10, 3, p);
  const n = 8;
  const m = 0.14;
  const bw = (full.w - m * 2) / n;
  const bh = (full.h - m * 2) / n;
  const light = lights ? "#efe6d4" : "#8a8070";
  const dark = lights ? "#3a2a20" : "#1a1410";
  const flip = rot === 1 || rot === 2;
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      const ii = flip ? n - 1 - i : i;
      const col = (ii + j) % 2 ? light : dark;
      const x = full.x + m + i * bw;
      const y = full.y + m + j * bh;
      const d = diamond(x, y, bw, bh, 13);
      fillPts(ctx, [d.N, d.E, d.S, d.W], col, null);
    }
  }
  const rim = diamond(full.x + m, full.y + m, full.w - m * 2, full.h - m * 2, 13);
  fillPts(ctx, [rim.N, rim.E, rim.S, rim.W], null, lights ? "#2a2030" : "#111");
}

export function drawChessStool(ctx, tw, th, rot, lights, iso) {
  const { box, pal, shadow } = iso;
  void rot;
  const s = 0.36;
  const x = (tw - s) / 2;
  const y = (th - s) / 2;
  shadow(ctx, x, y, s, s, 0.28);
  const legs = pal("#3a2818", lights);
  const seat = pal("#6b4a2c", lights);
  const cushion = pal("#8a5a32", lights);
  const leg = 0.08;
  const inset = 0.03;
  const spots = [
    [x + inset, y + inset],
    [x + s - leg - inset, y + inset],
    [x + inset, y + s - leg - inset],
    [x + s - leg - inset, y + s - leg - inset],
  ];
  for (const [lx, ly] of spots) box(ctx, lx, ly, leg, leg, 0, 8, legs);
  box(ctx, x, y, s, s, 8, 2.2, seat);
  box(ctx, x + 0.04, y + 0.04, s - 0.08, s - 0.08, 10.2, 1.4, cushion);
}

export function installChessLayout(iso) {
  if (!iso) return iso;
  const origCan = iso.canPlace;
  const origOcc = iso.occupiedSet;
  iso.chessSeatTiles = chessSeatTiles;
  iso.chessSeatPose = chessSeatPose;
  iso.chessBoardMetrics = chessBoardMetrics;
  iso.occupiedSet = function occupiedSet(furniture, ignoreId) {
    const set = origOcc.call(iso, furniture, ignoreId);
    for (const f of furniture || []) {
      if (ignoreId && f.id === ignoreId) continue;
      if (f.type !== "chesstable") continue;
      for (const t of chessSeatTiles(f.x, f.y, f.rot)) set.add(t.x + "," + t.y);
    }
    return set;
  };
  iso.canPlace = function canPlace(furniture, type, x, y, size, rot, ignoreId) {
    if (!origCan.call(iso, furniture, type, x, y, size, rot, ignoreId)) return false;
    const n = size || iso.GRID || 6;
    const used = iso.occupiedSet(furniture, ignoreId);
    const tiles = (iso.tilesFor ? iso.tilesFor(type, x, y, rot) : [{ x, y }]).slice();
    if (type === "chesstable") tiles.push(...chessSeatTiles(x, y, rot));
    for (const t of tiles) {
      if (t.x < 0 || t.y < 0 || t.x >= n || t.y >= n) return false;
      if (used.has(t.x + "," + t.y)) return false;
    }
    return true;
  };
  return iso;
}
