/* Built-in wall features: window, entry door, and light switch.
   The door sits in the middle of the left wall (iso -X) and scales with
   room size. The window stays on the back wall. */

export function doorWall() {
  return "left";
}

export function doorSlot(n) {
  const size = Math.max(4, n || 6);
  return Math.round((size - 1) / 2);
}

export function switchSlot(n) {
  return Math.max(0, doorSlot(n) - 1);
}

export function windowSlots(n) {
  const size = Math.max(4, n || 6);
  const winX = 0;
  const out = [];
  for (let s = 0; s < size; s++) {
    const cx = s + 0.5 - size / 2;
    if (Math.abs(cx - winX) < 1.05) out.push(s);
  }
  return out;
}

export function reservedWallSlots(size) {
  const n = Math.max(4, size || 6);
  const back = new Set(windowSlots(n));
  const left = new Set([doorSlot(n), switchSlot(n)]);
  return { back, left };
}

export function switchFloorTile(n) {
  return { x: 0, y: switchSlot(n) };
}

export function doorFloorTile(n) {
  return { x: 0, y: doorSlot(n) };
}

export function isReservedWallSlot(wall, slot, size) {
  const w = wall === "left" || wall === "z" ? "left" : "back";
  const s = Math.round(Number(slot));
  return reservedWallSlots(size)[w].has(s);
}

export function windowCenterOffset(n) {
  void n;
  return 0;
}

export function installWallLayout(iso) {
  if (!iso) return iso;
  iso.doorWall = doorWall;
  iso.doorSlot = doorSlot;
  iso.switchSlot = switchSlot;
  iso.windowSlots = windowSlots;
  iso.reservedWallSlots = reservedWallSlots;
  iso.isReservedWallSlot = isReservedWallSlot;
  iso.windowCenterOffset = windowCenterOffset;
  iso.switchFloorTile = switchFloorTile;
  return iso;
}
