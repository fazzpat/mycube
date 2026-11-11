import assert from "node:assert/strict";
import {
  reservedWallSlots, doorSlot, switchSlot, windowSlots, isReservedWallSlot,
} from "../public/js/wallLayout.js";
import {
  chessSeatTiles, chessSeatPose, canPlaceChessAt, migrateChessTable, chessBoardMetrics,
} from "../public/js/chessTable.js";

let passed = 0;
function check(label, ok, detail) {
  if (!ok) {
    console.error("FAIL", label, detail || "");
    process.exitCode = 1;
    return;
  }
  passed += 1;
  console.log("ok  ", label);
}

for (const n of [6, 8, 10]) {
  const door = doorSlot(n);
  const sw = switchSlot(n);
  const wins = windowSlots(n);
  const reserved = reservedWallSlots(n);
  check(`Door sits at the far-right end of the back wall (n=${n})`, door === n - 1);
  check(`Switch sits in the slot beside the door (n=${n})`, sw === n - 2);
  check(`Door and switch are reserved on the back wall (n=${n})`, reserved.back.has(door) && reserved.back.has(sw));
  check(`Window does not overlap the door or switch (n=${n})`, !wins.includes(door) && !wins.includes(sw), JSON.stringify({ wins, door, sw }));
  check(`Left wall has no reserved door/switch slots (n=${n})`, reserved.left.size === 0);
  check(`isReservedWallSlot covers door and switch (n=${n})`, isReservedWallSlot("back", door, n) && isReservedWallSlot("back", sw, n) && !isReservedWallSlot("left", 3, n));
}

const metrics = chessBoardMetrics();
check("Chess tabletop is one floor tile with a smaller board", metrics.table === 1 && metrics.board === 0.72 && metrics.square === 0.09 && metrics.board < metrics.table - 0.2);

const tiles = chessSeatTiles(1, 3, 0);
check("Rot 0 seats sit on opposite adjacent tiles", tiles.length === 2 && tiles[0].x === 1 && tiles[0].y === 4 && tiles[1].x === 1 && tiles[1].y === 2, JSON.stringify(tiles));
const tiles1 = chessSeatTiles(1, 3, 1);
check("Rot 1 seats sit on opposite adjacent tiles along x", tiles1[0].x === 2 && tiles1[0].y === 3 && tiles1[1].x === 0 && tiles1[1].y === 3, JSON.stringify(tiles1));

const p0 = chessSeatPose({ x: 1, y: 3, rot: 0 }, 0);
const p1 = chessSeatPose({ x: 1, y: 3, rot: 0 }, 1);
const dot = p0.facing.x * p1.facing.x + p0.facing.z * p1.facing.z;
check("Seated players face each other across the table", dot < -0.9 && Math.abs(p0.x - p1.x) < 0.01 && Math.abs((p0.y + 0.5) - (3 + 1.22)) < 0.02, JSON.stringify({ p0, p1, dot }));

check("A 1x1 chess table fits at (1,3) in a 6x6 room", canPlaceChessAt(1, 3, 0, 6, () => true));
check("A chess table at (0,0) rot 0 is rejected because a seat is out of bounds", canPlaceChessAt(0, 0, 0, 6, () => true) === false);
check("A chess table against the left wall cannot rotate to put a seat out of bounds", canPlaceChessAt(0, 3, 1, 6, () => true) === false);
check("Placement is rejected when a seat tile is occupied", canPlaceChessAt(1, 3, 0, 6, (x, y) => !(x === 1 && y === 4)) === false);

const moved = migrateChessTable({ x: 0, y: 0, rot: 0 }, 6, () => true);
check("An old 2x2 corner table migrates to a place with in-bounds seats", Boolean(moved) && canPlaceChessAt(moved.x, moved.y, moved.rot, 6, () => true), JSON.stringify(moved));

const blocked = new Set(["1,3", "1,4", "1,2"]);
const movedBusy = migrateChessTable({ x: 1, y: 3, rot: 0 }, 6, (x, y) => !blocked.has(x + "," + y));
check("Migration skips the old footprint when those tiles are no longer free", Boolean(movedBusy) && !blocked.has(movedBusy.x + "," + movedBusy.y), JSON.stringify(movedBusy));

if (process.exitCode) {
  console.error(`furniture-layout: ${passed} passed, then failed`);
  process.exit(1);
}
console.log(`furniture-layout: ${passed} passed`);
