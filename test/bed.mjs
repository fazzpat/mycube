import { readFileSync } from "node:fs";
import {
  BED_TILES, BED_NAME, BED_PRICE, bedDims, bedTiles, liePose, lieDrawPose, migrateBed,
  blanketLocal, pillowLocal, blanketTopQuad, quadCentroid, visibleLieBBox, BLANKET_THICK,
} from "../public/js/bed.js";

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
check("Head is at the head end, body toward the foot", pose.head.y < pose.foot.y && pose.y > pose.head.y && pose.y < pose.foot.y, JSON.stringify(pose));

const p1 = liePose({ x: 1, y: 1, rot: 1 });
check("Rot 1 lie pose faces +X along the bed", p1.facing.x === 1 && p1.head.x < p1.foot.x, JSON.stringify(p1));

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

function tileToScreen(tx, ty) {
  const TW = 64, TH = 32;
  return { sx: (tx - ty) * (TW / 2), sy: (tx + ty) * (TH / 2) };
}

const cover = blanketLocal(0);
check("Blanket covers almost the full 1x2", cover.w > 0.75 && cover.h > 1.7, JSON.stringify(cover));
check("Blanket has a slight thickness", BLANKET_THICK >= 4 && cover.top === cover.lift + cover.thick);

const pillow0 = pillowLocal(0);
check("Rot 0 pillow sits at the head end on the blanket", pillow0.y < cover.y + 0.2 && pillow0.y + pillow0.h < cover.y + cover.h * 0.5, JSON.stringify(pillow0));
const pillow2 = pillowLocal(2);
check("Rot 2 pillow sits at the opposite head end", pillow2.y > pillow0.y, JSON.stringify({ pillow0, pillow2 }));

for (const rot of [0, 1, 2, 3]) {
  const furn = { x: 2, y: 2, rot };
  const q = blanketTopQuad(furn, tileToScreen);
  const c = quadCentroid(q);
  const d = lieDrawPose(furn, tileToScreen, { headTop: 9, groundY: 69 });
  check("Rot " + rot + " lie pose targets the blanket top-face centroid", Math.hypot(d.centerSx - c.sx, d.centerSy - c.sy) < 0.01, JSON.stringify({ center: [d.centerSx, d.centerSy], centroid: [c.sx, c.sy] }));
  const floor = tileToScreen(2 + bedDims(rot).w / 2, 2 + bedDims(rot).h / 2);
  const lift = Math.abs((floor.sy) - c.sy);
  check("Rot " + rot + " top-face centroid sits above the floor center by the blanket thickness", Math.abs(lift - cover.top) < 0.01, JSON.stringify({ lift, top: cover.top, floor, centroid: c }));
}

// Synthetic "avatar": a solid 20x40 block whose visible center is known, offset in the sprite.
// After alignment, that visible center must land on the blanket centroid.
function solidBlock(avW, avH, x0, y0, bw, bh) {
  const data = new Uint8ClampedArray(avW * avH * 4);
  for (let y = y0; y < y0 + bh; y++) {
    for (let x = x0; x < x0 + bw; x++) {
      const i = (y * avW + x) * 4;
      data[i] = 200; data[i + 1] = 80; data[i + 2] = 80; data[i + 3] = 255;
    }
  }
  return { data, width: avW, height: avH };
}
const avW = 72, avH = 72;
// Visible block is off-center in the sprite (more mass toward the head / -y and +x).
const block = solidBlock(avW, avH, 30, 8, 20, 40);
const visCx = 30 + 10, visCy = 8 + 20;
for (const rot of [0, 1, 2, 3]) {
  const furn = { x: 2, y: 2, rot };
  const d = lieDrawPose(furn, tileToScreen, { headTop: 9, groundY: 69, imageData: block, avW, avH });
  const dist = Math.hypot(d.dx, d.dy);
  check("Rot " + rot + " synthetic visible-pixel center matches blanket centroid within 1px", dist <= 1, JSON.stringify({ dx: d.dx, dy: d.dy, dist, bbox: d.bbox, center: [d.centerSx, d.centerSy] }));
}

const src = {
  bed: readFileSync(new URL("../public/js/bed.js", import.meta.url), "utf8"),
  furn: readFileSync(new URL("../public/js/furnIso.js", import.meta.url), "utf8"),
};
const drawBedSrc = src.furn.slice(src.furn.indexOf("function drawBed"), src.furn.indexOf("function drawCabinet"));
check("drawBed uses the shared blanket and pillow rects, not a frame or headboard",
  /blanketLocal/.test(drawBedSrc) && /pillowLocal/.test(drawBedSrc) && /foldLocal/.test(drawBedSrc)
  && !/backRect/.test(drawBedSrc) && !/pal\("#6b4a32"/.test(drawBedSrc),
  drawBedSrc.slice(0, 200));

if (process.exitCode) {
  console.error(`bed: ${passed} passed, then failed`);
  process.exit(1);
}
console.log(`bed: ${passed} passed`);
