import { BED_TILES, BED_NAME, BED_PRICE, bedDims, bedTiles, liePose, migrateBed } from "../public/js/bed.js";

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

check("Bed is named Bed and costs 45", BED_NAME === "Bed" && BED_PRICE === 45);
check("Footprint is 1x2 (two floor squares, lengthwise)", BED_TILES[0] === 1 && BED_TILES[1] === 2);

check("Rot 0 and 2 stay 1x2", bedDims(0).w === 1 && bedDims(0).h === 2 && bedDims(2).w === 1 && bedDims(2).h === 2);
check("Rot 1 and 3 swap to 2x1", bedDims(1).w === 2 && bedDims(1).h === 1 && bedDims(3).w === 2 && bedDims(3).h === 1);

const t0 = bedTiles(2, 3, 0);
check("Rot 0 occupies (2,3) and (2,4)", t0.length === 2 && t0[0].x === 2 && t0[0].y === 3 && t0[1].x === 2 && t0[1].y === 4, JSON.stringify(t0));
const t1 = bedTiles(2, 3, 1);
check("Rot 1 occupies (2,3) and (3,3)", t1.length === 2 && t1.some((t) => t.x === 3 && t.y === 3), JSON.stringify(t1));

const pose = liePose({ x: 2, y: 3, rot: 0 });
check("Lie pose faces toward the foot of a rot-0 bed", pose.facing.z === 1 && pose.facing.x === 0, JSON.stringify(pose));
check("Head is on the headboard tile, body toward the foot", pose.head.y < pose.foot.y && pose.y > pose.head.y && pose.y < pose.foot.y, JSON.stringify(pose));

const p1 = liePose({ x: 1, y: 1, rot: 1 });
check("Rot 1 lie pose faces +X along the bed", p1.facing.x === 1 && p1.head.x < p1.foot.x, JSON.stringify(p1));

// An in-bounds 1x2 bed stays put (shrinking from an old 2x3 origin is safe).
const kept = migrateBed({ id: "b1", type: "bed", x: 1, y: 1, rot: 0 }, 6, (x, y, rot) => {
  const { w, h } = bedDims(rot);
  return x >= 0 && y >= 0 && x + w <= 6 && y + h <= 6;
});
check("A bed that already fits stays in place", kept.x === 1 && kept.y === 1 && kept.rot === 0, JSON.stringify(kept));

const moved = migrateBed({ id: "b2", type: "bed", x: 5, y: 5, rot: 0 }, 6, (x, y, rot) => {
  const { w, h } = bedDims(rot);
  return x >= 0 && y >= 0 && x + w <= 6 && y + h <= 6;
});
check("A bed hanging off the far corner is moved to a legal 1x2", moved.x + bedDims(moved.rot).w <= 6 && moved.y + bedDims(moved.rot).h <= 6, JSON.stringify(moved));

if (process.exitCode) {
  console.error(`bed: ${passed} passed, then failed`);
  process.exit(1);
}
console.log(`bed: ${passed} passed`);
