import { readFileSync } from "node:fs";
import {
  POOL_TABLE_TYPE, POOL_TABLE_NAME, POOL_TABLE_PRICE, POOL_TABLE_TILES,
  CUE_RACK_TYPE, CUE_RACK_NAME, CUE_RACK_PRICE, CUE_COUNT,
  CUE_U0, CUE_U1, CUE_V0, CUE_V1,
} from "../public/js/billiards.js";

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

check("Pool table is named Pool Table and costs 60", POOL_TABLE_NAME === "Pool Table" && POOL_TABLE_PRICE === 60);
check("Pool table footprint is 2x2", POOL_TABLE_TILES[0] === 2 && POOL_TABLE_TILES[1] === 2);
check("Type id is pooltable", POOL_TABLE_TYPE === "pooltable");
check("Cue rack is named Cue Rack and costs 20", CUE_RACK_NAME === "Cue Rack" && CUE_RACK_PRICE === 20);
check("Cue rack type is cuerack and holds 4 cues", CUE_RACK_TYPE === "cuerack" && CUE_COUNT === 4);
check("Cue rack is taller than a painting strip", CUE_V1 - CUE_V0 > 40 && CUE_U1 - CUE_U0 > 0.6);

const server = readFileSync(new URL("../server.js", import.meta.url), "utf8");
check("server catalog lists a 2x2 pool table at 60 coins", /pooltable:\s*\{\s*name:\s*"Pool Table",\s*price:\s*60,\s*w:\s*2,\s*h:\s*2,\s*blocks:\s*true\s*\}/.test(server));
check("server catalog lists a wall-mounted cue rack at 20 coins", /cuerack:\s*\{\s*name:\s*"Cue Rack",\s*price:\s*20,\s*w:\s*1,\s*h:\s*1,\s*blocks:\s*false,\s*surface:\s*"wall"\s*\}/.test(server));
check("server treats the cue rack as wall art", /WALL_ART_TYPES = new Set\(\[[^\]]*cuerack/.test(server) || /surface === "wall"/.test(server));

const iso = readFileSync(new URL("../public/js/iso.js", import.meta.url), "utf8");
check("iso catalog matches the server pool table entry", /pooltable:\s*\{\s*name:\s*"Pool Table",\s*price:\s*60,\s*w:\s*2,\s*h:\s*2,\s*blocks:\s*true\s*\}/.test(iso));
check("iso catalog matches the server cue rack entry", /cuerack:\s*\{\s*name:\s*"Cue Rack",\s*price:\s*20,[\s\S]*?surface:\s*"wall"\s*\}/.test(iso));
check("iso shop thumbs include both pieces", /pooltable:\s*`<svg class="furn-svg"/.test(iso) && /cuerack:\s*`<svg class="furn-svg"/.test(iso));
check("iso isWallArt is surface-based so the cue rack qualifies", /surface === "wall"/.test(iso));

const furn = readFileSync(new URL("../public/js/furnIso.js", import.meta.url), "utf8");
check("furnIso registers a 2x2 pool table sprite", /pooltable:\s*\[2,\s*2\]/.test(furn) && /case "pooltable":\s*drawPoolTable/.test(furn));

const room = readFileSync(new URL("../public/js/isoRoom.js", import.meta.url), "utf8");
check("isoRoom draws the cue rack on the wall", /drawCueRackOnWall/.test(room) && /CUE_RACK_TYPE/.test(room) && /cueRackQuad/.test(room));

if (process.exitCode) {
  console.error(`billiards: ${passed} passed, then failed`);
  process.exit(1);
}
console.log(`billiards: ${passed} passed`);
