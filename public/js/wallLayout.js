/* Built-in wall features: window, entry door, and light switch.
   The visible right-hand wall is the "back" wall (iso +X). The door sits
   at that wall's far-right end and scales with the room size. */

export function doorWall() {
  return "back";
}

export function doorSlot(n) {
  const size = Math.max(4, n || 6);
  return size - 1;
}

export function switchSlot(n) {
  const size = Math.max(4, n || 6);
  return Math.max(0, size - 2);
}

export function windowSlots(n) {
  const size = Math.max(4, n || 6);
  const winX = -size * 0.18;
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
  back.add(doorSlot(n));
  back.add(switchSlot(n));
  return { back, left: new Set() };
}

export function switchFloorTile(n) {
  return { x: switchSlot(n), y: 0 };
}

export function doorFloorTile(n) {
  return { x: doorSlot(n), y: 0 };
}

export function isReservedWallSlot(wall, slot, size) {
  const w = wall === "left" || wall === "z" ? "left" : "back";
  const s = Math.round(Number(slot));
  return reservedWallSlots(size)[w].has(s);
}

export function windowCenterOffset(n) {
  return -(Math.max(4, n || 6) * 0.18);
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
