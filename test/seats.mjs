import { readFileSync } from "node:fs";
import { SIT_EASE_MS, seatCushionLift, seatForward, sitEaseT, sitBob, isSeatType, seatBackDepth } from "../public/js/seats.js";

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

check("Seat types include chair, egg, couches, and chess", ["chair","hoverchair","couch","capsulecouch","chesstable"].every(isSeatType));
check("Cushion lifts match the furniture sprites", seatCushionLift("chair") === 14 && seatCushionLift("hoverchair") === 14 && seatCushionLift("couch") === 16 && seatCushionLift("capsulecouch") === 16 && seatCushionLift("chesstable") === 12);
check("Sitters are no longer perched 0.08 tiles forward", seatForward("chair") === 0.02 && seatForward("hoverchair") === 0 && seatForward("couch") === 0.02);
check("Ease lasts 200ms and is smoothstepped", SIT_EASE_MS === 200 && sitEaseT(0, 0) === 0 && sitEaseT(0, 200) === 1 && sitEaseT(0, 100) > 0.4 && sitEaseT(0, 100) < 0.6);
check("Idle bob is a 1px sine", Math.abs(sitBob(0)) <= 1 && Math.abs(sitBob(420 * Math.PI)) <= 1);
const mid = 2 + 2 + (2 + 1) / 2 + 0.2;
const sitter = mid + 0.08;
check("A rot-2 backrest draws in front of the sitter", seatBackDepth({ x: 2, y: 2, rot: 2 }, 2, 1) > sitter);
check("A rot-0 backrest stays behind the sitter", seatBackDepth({ x: 2, y: 2, rot: 0 }, 2, 1) < sitter);


const iso = readFileSync(new URL("../public/js/iso.js", import.meta.url), "utf8");
const server = readFileSync(new URL("../server.js", import.meta.url), "utf8");
check("iso and server sit poses share the deeper-in-the-seat offset", /hoverchair" \? 0 : 0.02/.test(iso) && /hoverchair" \? 0 : 0.02/.test(server) && !/localY = 0\.08/.test(iso) && !/localY = 0\.08/.test(server));

const furn = readFileSync(new URL("../public/js/furnIso.js", import.meta.url), "utf8");
check("Chairs and couches can be painted as a base and a backrest", /drawSeatBase/.test(furn) && /drawSeatBack/.test(furn) && /opts.part/.test(furn) && /drawEggRings/.test(furn));

const room = readFileSync(new URL("../public/js/isoRoom.js", import.meta.url), "utf8");
check("isoRoom eases, lifts, and bobs sitters, and splits seat sprites", /sitEaseT/.test(room) && /seatCushionLift/.test(room) && /sitBob/.test(room) && /part: "base"/.test(room));

if (process.exitCode) {
  console.error(`seats: ${passed} passed, then failed`);
  process.exit(1);
}
console.log(`seats: ${passed} passed`);
