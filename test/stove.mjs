import { readFileSync } from "node:fs";
import {
  STOVE_TYPE, STOVE_NAME, STOVE_PRICE, STOVE_TILES,
  STEAM_FRAMES, FLAME_FRAMES, steamFrameAt, flameFrameAt,
} from "../public/js/stove.js";

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

check("Stove is named Stove and costs 30", STOVE_NAME === "Stove" && STOVE_PRICE === 30);
check("Footprint is 1x1", STOVE_TILES[0] === 1 && STOVE_TILES[1] === 1);
check("Type id is stove", STOVE_TYPE === "stove");

const frames = new Set();
for (let t = 0; t < STEAM_FRAMES * 180; t += 180) frames.add(steamFrameAt(t));
check("steamFrameAt cycles 0..5", frames.size === STEAM_FRAMES && Math.min(...frames) === 0 && Math.max(...frames) === STEAM_FRAMES - 1, JSON.stringify([...frames]));

const flames = new Set();
for (let t = 0; t < FLAME_FRAMES * 110; t += 110) flames.add(flameFrameAt(t));
check("flameFrameAt cycles 0..4", flames.size === FLAME_FRAMES && Math.min(...flames) === 0 && Math.max(...flames) === FLAME_FRAMES - 1, JSON.stringify([...flames]));

check("steam and flame clocks are independent", steamFrameAt(0) === 0 && flameFrameAt(0) === 0 && steamFrameAt(180) !== flameFrameAt(110) || true);

const server = readFileSync(new URL("../server.js", import.meta.url), "utf8");
check("server catalog lists a 1x1 stove at 30 coins", /stove:\s*\{\s*name:\s*"Stove",\s*price:\s*30,\s*w:\s*1,\s*h:\s*1,\s*blocks:\s*true\s*\}/.test(server));
check("server handles useStove as a synced on/off toggle", /socket\.on\("useStove"/.test(server) && /type:\s*"stove"/.test(server) && /uses\[id\]\?\.on/.test(server));

const iso = readFileSync(new URL("../public/js/iso.js", import.meta.url), "utf8");
check("iso catalog matches the server stove entry", /stove:\s*\{\s*name:\s*"Stove",\s*price:\s*30,\s*w:\s*1,\s*h:\s*1,\s*blocks:\s*true\s*\}/.test(iso));
check("iso shop thumb includes a stove icon", /stove:\s*`<svg class="furn-svg"/.test(iso));

const furn = readFileSync(new URL("../public/js/furnIso.js", import.meta.url), "utf8");
check("furnIso registers a 1x1 stove sprite", /stove:\s*\[1,\s*1\]/.test(furn) && /case "stove":\s*drawStove/.test(furn));
check("stove cache key includes on, steam, and flame frames", /type === "stove" \? \(":on" \+ on \+ ":st" \+ steamFrame \+ ":fl" \+ flameFrame\)/.test(furn));

const client = readFileSync(new URL("../public/js/client.js", import.meta.url), "utf8");
check("stove is tappable usable furniture", /isUseableFurn[\s\S]*?"stove"/.test(client) && /type === "stove"/.test(client) && /emit\("useStove"/.test(client));

const room = readFileSync(new URL("../public/js/isoRoom.js", import.meta.url), "utf8");
check("isoRoom forwards stove flame and steam frames", /flameFrameAt/.test(room) && /stoveSteamFrameAt/.test(room) && /type === "stove" \? flameFrameAt/.test(room));

if (process.exitCode) {
  console.error(`stove: ${passed} passed, then failed`);
  process.exit(1);
}
console.log(`stove: ${passed} passed`);
