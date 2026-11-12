/* Shared sitting helpers: cushion height, a short sit ease, and a tiny idle bob.
   Avatar pose stays owned by avatar3d.js; these only offset and layer furniture. */

export const SIT_EASE_MS = 200;

export const SEAT_TYPES = ["chair", "hoverchair", "couch", "capsulecouch", "chesstable"];

export function isSeatType(type) {
  return SEAT_TYPES.includes(type);
}

/** Pixel lift of the cushion top, matching the furniture sprites in furnIso / chessTable. */
export function seatCushionLift(type) {
  if (type === "chair") return 14;       // seat lift 6 + height 8
  if (type === "hoverchair") return 14;  // seat lift 8 + height 6
  if (type === "couch" || type === "capsulecouch") return 16; // 4 + 10 + cushion 2
  if (type === "chesstable") return 12;  // stool cushion ~11.6
  return 0;
}

/** Tile-space shift of the sitter toward the front of the seat (was 0.08, which left people perched on the lip). */
export function seatForward(type) {
  if (type === "hoverchair") return 0;
  if (type === "chair") return 0.02;
  if (type === "couch" || type === "capsulecouch") return 0.02;
  return 0;
}

export function sitEaseT(startedAt, now) {
  if (startedAt == null) return 1;
  const t = Math.max(0, Math.min(1, (now - startedAt) / SIT_EASE_MS));
  return t * t * (3 - 2 * t);
}

export function sitBob(now) {
  return Math.round(Math.sin((now || 0) / 420) * 1);
}

/** Depth of the backrest's tile edge so a near-camera back draws in front of the sitter. */
export function seatBackDepth(f, tw, th) {
  const r = ((Number(f.rot) % 4) + 4) % 4;
  const x = Number(f.x) || 0;
  const y = Number(f.y) || 0;
  const w = tw || 1, h = th || 1;
  // Same mid-point the furniture sprite uses. Sitters sit at mid + 0.08, so a
  // far backrest stays behind them and a camera-near backrest draws in front.
  const mid = x + y + (w + h) / 2 + 0.2;
  if (r === 0 || r === 1) return mid - 0.15;
  return mid + 0.25;
}

export default {
  SIT_EASE_MS, SEAT_TYPES, isSeatType, seatCushionLift, seatForward, sitEaseT, sitBob, seatBackDepth,
};
