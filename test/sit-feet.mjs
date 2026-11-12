import { sitFootLayout, AV_W, AV_GROUND_Y, facingIndex8 } from "../public/js/avatar3d.js";
import { readFileSync } from "node:fs";

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

const cx = 24 + 12; // AV_PAD_X + 24
const views = [
  { key: "s", flip: false, name: "front" },
  { key: "se", flip: false, name: "3/4 front (seat rot 1)" },
  { key: "se", flip: true, name: "3/4 front (seat rot 0)" },
  { key: "e", flip: false, name: "profile right" },
  { key: "e", flip: true, name: "profile left" },
  { key: "ne", flip: false, name: "3/4 back (seat rot 2)" },
  { key: "ne", flip: true, name: "3/4 back (seat rot 3)" },
  { key: "n", flip: false, name: "back" },
];

for (const v of views) {
  const [far, near] = sitFootLayout(v.key, v.flip, cx);
  const spread = Math.abs(near.x - far.x);
  check(`${v.name}: both feet planted on the ground`, far.y === AV_GROUND_Y && near.y === AV_GROUND_Y);
  check(`${v.name}: feet stay close together (not splayed)`, spread <= 8, `spread=${spread}`);
  if (v.key === "e") {
    check(`${v.name}: both shoes share one forward toe direction`, far.side === near.side && far.side === (v.flip ? -1 : 1), { far: far.side, near: near.side });
    const mid = (far.x + near.x) / 2;
    const bodyX = v.flip ? AV_W - 1 - cx : cx;
    const ahead = v.flip ? mid < bodyX : mid > bodyX;
    check(`${v.name}: both feet sit ahead of the hips`, ahead, { mid, bodyX });
  } else {
    check(`${v.name}: left and right shoes stay on their own sides`, far.side !== near.side);
  }
}

check("Seat rot 0 (+Y) is the 3/4 front flip view", facingIndex8({ x: 0, z: 1 }) === 2);
check("Seat rot 1 (+X) is the 3/4 front view", facingIndex8({ x: 1, z: 0 }) === 0);

const src = readFileSync(new URL("../public/js/avatar3d.js", import.meta.url), "utf8");
const compose = src.slice(src.indexOf("function composeAvatar"), src.indexOf("function bufToCanvas"));
check("composeAvatar still draws eyes and mouth via the existing helpers", /drawEyes\(/.test(compose) && /drawMouth\(/.test(compose) && /drawHair\(/.test(compose));
check("Sit feet are layered in front of the body so both shoes stay visible", /if \(sit\) layers\.push\(fHand, body, head, nHand, fFoot, nFoot\)/.test(compose));

if (process.exitCode) {
  console.error(`sit-feet: ${passed} passed, then failed`);
  process.exit(1);
}
console.log(`sit-feet: ${passed} passed`);
