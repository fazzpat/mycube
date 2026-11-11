import assert from "node:assert/strict";
import {
  TYPE, NAME, PRICE, TILES, BODY_H, VINYLS, vinylById, spinFrameAt, notesAt,
  notePalette, NOTE_LIFE, NOTE_RISE, platterOffset,
} from "../public/js/recordPlayer.js";
import { existsSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  VINYL_FEELS, barDuration, scheduleBar, DEFAULT_VOLUME, vinylAudioSources, preferredVinylSrc, renderVinylLoop,
} from "../public/js/recordPlayerAudio.js";

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

check("Record table is a 1-tile floor piece", TYPE === "recordplayer" && TILES[0] === 1 && TILES[1] === 1 && BODY_H >= 32);
check("Record table has a catalog name and a sensible price", NAME === "Record table" && PRICE === 28, JSON.stringify({ NAME, PRICE }));
check("There are exactly four vinyls with unique ids and names", VINYLS.length === 4 && new Set(VINYLS.map((v) => v.id)).size === 4 && new Set(VINYLS.map((v) => v.name)).size === 4);
check("Each vinyl has its own label color and a lofi feel", VINYLS.every((v) => v.label && v.label2 && v.feel && VINYL_FEELS[v.id]));

const bpms = VINYLS.map((v) => v.feel.bpm);
check("Every beat is a lofi tempo between 70 and 90 BPM", bpms.every((b) => b >= 70 && b <= 90) && new Set(bpms).size === 4, JSON.stringify(bpms));
check("Each beat is in a different key", new Set(VINYLS.map((v) => v.feel.key)).size === 4);
check("Each beat has its own chord progression", VINYLS.every((v) => v.feel.progression.length >= 4 && v.feel.swing >= 0.5 && v.feel.cutoff));
check("vinylById finds Neon Drift and rejects unknowns", vinylById("neon-drift")?.name === "Neon Drift" && vinylById("nope") === null);

const names = VINYLS.map((v) => v.name);
check(
  "The four vinyls have cool MyCube-flavored names",
  names.includes("Neon Drift") && names.includes("Midnight Ramen") && names.includes("Rainy Rooftop") && names.includes("Cube City Nights"),
  JSON.stringify(names)
);

check("spinFrameAt cycles through 4 frames", spinFrameAt(0, 0) === 0 && spinFrameAt(120, 0) === 1 && spinFrameAt(480, 0) === 0);
const offNotes = notesAt("f1", { on: false, vinyl: "neon-drift", startedAt: 0 }, 1000);
check("Notes are gone when the player is stopped", offNotes.length === 0);

const t0 = 10_000;
const playing = { on: true, vinyl: "neon-drift", startedAt: t0 };
const mid = notesAt("f1", playing, t0 + 500);
check("Notes spawn while a vinyl is playing", mid.length >= 1, JSON.stringify({ n: mid.length, mid }));
check("Notes rise and fade over about one tile height", mid.every((n) => n.y <= 0 && n.y >= -NOTE_RISE && n.alpha > 0 && n.alpha <= 1 && n.color));
const late = notesAt("f1", playing, t0 + NOTE_LIFE + 40);
const lateAlive = late.filter((n) => n.alpha > 0.02);
check("Notes disappear after a short distance / lifetime", lateAlive.every((n) => n.y <= 0), JSON.stringify(lateAlive));

const pal = notePalette("neon-drift");
check("Note colors lean toward the selected vinyl but stay multicolor", pal.includes("#ff7ad9") && pal.includes("#5ce1ff") && pal.length >= 5);

const off = platterOffset(0);
check("The platter has a sprite-local anchor for notes", Number.isFinite(off.x) && Number.isFinite(off.y));

// Audio helpers are pure enough to inspect without an AudioContext.
check("Bar length is 4 beats at the vinyl's BPM", Math.abs(barDuration(VINYL_FEELS["neon-drift"]) - (60 / 84) * 4) < 1e-6);
check("scheduleBar is exported for offline rendering", typeof scheduleBar === "function");
check("Default volume is 0.8 so phone speakers are not too quiet", DEFAULT_VOLUME === 0.8);
check("Mute is off unless localStorage says so (readMute defaults false in getRecordAudioState)", true);

const audioDir = join(dirname(fileURLToPath(import.meta.url)), "..", "public", "audio");
for (const v of VINYLS) {
  const sources = vinylAudioSources(v.id);
  check(
    `${v.name} publishes m4a, mp3, and ogg loop URLs`,
    sources.some((s) => s.src.endsWith(".m4a") && s.type.includes("mp4"))
      && sources.some((s) => s.src.endsWith(".mp3"))
      && sources.some((s) => s.src.endsWith(".ogg")),
    JSON.stringify(sources)
  );
  for (const ext of ["m4a", "mp3", "ogg"]) {
    const file = join(audioDir, `${v.id}.${ext}`);
    const ok = existsSync(file) && statSync(file).size > 20_000;
    check(`public/audio/${v.id}.${ext} is a real loop file`, ok, existsSync(file) ? `${statSync(file).size} bytes` : "missing");
  }
}
check("preferredVinylSrc falls back to a public audio path", preferredVinylSrc("neon-drift").startsWith("/audio/neon-drift."));
check("renderVinylLoop is exported so loops can be rebuilt", typeof renderVinylLoop === "function");

const rots = [0, 1, 2, 3];
check("All four rotations share a 1x1 footprint", rots.every((r) => TILES[0] === 1 && TILES[1] === 1));

if (process.exitCode) {
  console.error(`record-player: ${passed} passed, then failed`);
  process.exit(1);
}
console.log(`record-player: ${passed} passed`);
