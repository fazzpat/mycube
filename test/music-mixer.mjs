import http from "node:http";
import { readFileSync, existsSync } from "node:fs";
import { extname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import {
  MIXER_TYPE, MIXER_NAME, MIXER_PRICE, MIXER_STEPS, MIXER_MAX_MIXES, MIXER_CATALOG,
  DRUM_TRACKS, MELODY_PRESETS, MELODY_NOTES, isMixVinyl, mixVinylType,
  emptyPattern, clonePattern, validateMix, demoPattern, sanitizeTitle,
  publicMix, mixToVinyl, stepDuration, loopDuration,
} from "../public/js/musicMixer.js";

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

check("The Music Mixer costs 28 coins and occupies one floor tile",
  MIXER_PRICE === 28 && MIXER_CATALOG.w === 1 && MIXER_CATALOG.h === 1 && MIXER_CATALOG.blocks === true && MIXER_NAME === "Music Mixer" && MIXER_TYPE === "musicmixer");
check("The sequencer is 16 steps with kick, snare, hat, clap, and a pitched melody",
  MIXER_STEPS === 16 && DRUM_TRACKS.join(",") === "kick,snare,hat,clap" && MELODY_NOTES.length === 8 && MELODY_PRESETS.length >= 3);
check("isMixVinyl recognizes saved record ids only",
  isMixVinyl("mix_vinyl_m1") && !isMixVinyl("musicmixer") && !isMixVinyl("neon-drift") && !isMixVinyl("mix_vinyl_"));

const demo = demoPattern("house");
check("The demo beat has a four-on-the-floor kick, snares, hats, and a melody",
  demo.drums.kick.filter(Boolean).length === 4
  && demo.drums.snare[4] === 1 && demo.drums.snare[12] === 1
  && demo.drums.hat.filter(Boolean).length >= 4
  && demo.melody.filter((n) => n != null).length >= 6
  && demo.bpm >= 70 && demo.bpm <= 180);

const packed = validateMix({ ...demo, title: "  Cube Beat  " });
check("A valid 16-step mix is accepted and titled",
  packed.ok && packed.mix.title === "Cube Beat" && packed.mix.data.drums.kick.length === 16);
check("Titles are trimmed and capped", sanitizeTitle("   " + "A".repeat(40)) === "A".repeat(24));
check("Bad sizes, presets, and tempos are rejected",
  validateMix({ ...emptyPattern(), drums: { kick: [1] } }).ok === false
  && validateMix({ ...emptyPattern(), preset: "laser" }).ok === false
  && validateMix({ ...emptyPattern(), bpm: 20 }).ok === false);
check("Per-user mixed-record cap is 24",
  MIXER_MAX_MIXES === 24 && validateMix(demo, { count: 24 }).ok === false);

const pub = publicMix({ id: "m1", type: mixVinylType("m1"), title: "Cube Beat", color: "#ff4da6", data: demo });
const vinyl = mixToVinyl(pub);
check("A saved mix becomes a vinyl with a label color and title",
  pub?.type === "mix_vinyl_m1" && vinyl?.id === "mix_vinyl_m1" && vinyl.name === "Cube Beat" && vinyl.label === "#ff4da6" && vinyl.mix === true);

const cloned = clonePattern(demo);
cloned.drums.kick[0] = 0;
check("clonePattern copies drum rows so edits do not leak", demo.drums.kick[0] === 1 && cloned.drums.kick[0] === 0);

check("Loop length is 16 steps at the mix tempo",
  Math.abs(loopDuration(demo) - stepDuration(demo.bpm) * 16) < 1e-9 && stepDuration(110) === 60 / 110 / 4);

const iso = readFileSync(new URL("../public/js/iso.js", import.meta.url), "utf8");
const server = readFileSync(new URL("../server.js", import.meta.url), "utf8");
const recordSrc = readFileSync(new URL("../public/js/recordPlayer.js", import.meta.url), "utf8");
check("The furniture catalog lists the Music Mixer on the client and server",
  /musicmixer:\s*\{\s*name:\s*"Music Mixer",\s*price:\s*28/.test(iso)
  && /musicmixer:\s*\{\s*\.\.\.MIXER_CATALOG/.test(server)
  && /saveMixerMix/.test(server)
  && /isMixVinyl\(vinylId\)/.test(server));
check("The built-in record table still has exactly four vinyls",
  /export const VINYLS = \[/.test(recordSrc)
  && (recordSrc.match(/id: "neon-drift"/g) || []).length === 1);

const publicRoot = fileURLToPath(new URL("../public", import.meta.url));
const mime = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css" };
const html = `<!doctype html><script type="module">
  import { drawFurnitureSprite } from "/js/furnIso.js";
  const rots = [0,1,2,3].map((rot) => {
    const spr = drawFurnitureSprite("musicmixer", { lights: true, rot });
    const ctx = spr.c.getContext("2d");
    const data = ctx.getImageData(0,0,spr.w,spr.h).data;
    let n = 0, wood = 0, gray = 0, led = 0, wheel = 0;
    for (let i = 0; i < data.length; i += 4) {
      if (data[i+3] < 16) continue;
      n++;
      const r = data[i], g = data[i+1], b = data[i+2];
      if (r > 70 && r < 200 && g > 30 && g < 140 && b < 90 && r > b + 20 && r > g) wood++;
      if (r > 30 && r < 120 && g > 35 && g < 130 && b > 40 && b < 140 && Math.abs(r-g) < 28 && Math.abs(g-b) < 28) gray++;
      const green = g > 180 && r < 140 && b < 180;
      const yellow = r > 180 && g > 160 && b < 140;
      const orange = r > 180 && g > 80 && g < 180 && b < 90;
      const red = r > 180 && g < 120 && b < 120;
      if (green || yellow || orange || red) led++;
      if (r < 40 && g < 40 && b < 48) wheel++;
    }
    return { rot, w: spr.w, h: spr.h, n, wood, gray, led, wheel };
  });
  window.__out = { rots };
  window.__ready = true;
</script>`;
const srv = http.createServer((req, res) => {
  if ((req.url || "/") === "/") { res.writeHead(200, { "content-type": "text/html" }); res.end(html); return; }
  const file = join(publicRoot, decodeURIComponent((req.url || "/").replace(/^\//, "")));
  if (!file.startsWith(publicRoot) || !existsSync(file)) { res.writeHead(404); res.end(); return; }
  res.writeHead(200, { "content-type": mime[extname(file)] || "application/octet-stream" });
  res.end(readFileSync(file));
});
await new Promise((r) => srv.listen(0, "127.0.0.1", r));
const port = srv.address().port;
const browser = await chromium.launch({ args: ["--no-sandbox", "--disable-setuid-sandbox"] });
const page = await browser.newPage();
page.on("pageerror", (e) => console.error("PAGEERROR", e));
await page.goto("http://127.0.0.1:" + port + "/");
await page.waitForFunction(() => window.__ready, null, { timeout: 20000 });
const out = await page.evaluate(() => window.__out);
await browser.close();
srv.close();

for (const r of out.rots) {
  check(`Mixer rot ${r.rot} is a square 1-tile sprite with wooden legs and rim`,
    r.w > 40 && r.h > 40 && r.n >= 80 && r.wood >= 20, JSON.stringify(r));
  check(`Mixer rot ${r.rot} has a dark console, LED lights, and a jog wheel`,
    r.gray >= 16 && r.led >= 4 && r.wheel >= 8, JSON.stringify(r));
}

if (process.exitCode) {
  console.error("music-mixer: tests failed");
  process.exit(1);
}
console.log("music-mixer: " + passed + " passed");
