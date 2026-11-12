import http from "node:http";
import { readFileSync, existsSync } from "node:fs";
import { extname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import { OUTFIT_STOCK, outfitById, wearingOutfit, stripOutfitItem, shouldDrawStaff } from "../public/js/outfits.js";
import { HATS, PETS } from "../public/js/storeCatalog.js";

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

const prices = Object.fromEntries(OUTFIT_STOCK.map((s) => [s.id, s.price]));
check("Outfits tab stocks five separate items", OUTFIT_STOCK.length === 5);
check("Wizard Hat costs 16 coins", prices["ow-wizard-hat"] === 16 && outfitById("ow-wizard-hat")?.label === "Wizard Hat");
check("Wizard Cloak costs 22 coins", prices["ow-wizard-cloak"] === 22);
check("Wizard Pants cost 18 coins", prices["ow-wizard-pants"] === 18);
check("Wizard Staff costs 18 coins", prices["ow-wizard-staff"] === 18 && outfitById("ow-wizard-staff")?.item === "wizardstaff");
check("Flame Ball pet costs 28 coins", prices["ow-flame-ball"] === 28 && outfitById("ow-flame-ball")?.item === "flame");
check("HATS allowlist includes wizard", HATS.includes("wizard"));
check("PETS allowlist includes flame", PETS.includes("flame"));

const wearing = { hat: "wizard", cloak: "wizard", outfitPants: "wizard" };
check("wearingOutfit sees each slot independently",
  wearingOutfit(wearing, outfitById("ow-wizard-hat"))
  && wearingOutfit(wearing, outfitById("ow-wizard-cloak"))
  && wearingOutfit({ ...wearing, hat: "none" }, outfitById("ow-wizard-cloak"))
  && !wearingOutfit({ ...wearing, hat: "none" }, outfitById("ow-wizard-hat")));
const stripped = stripOutfitItem(wearing, outfitById("ow-wizard-hat").item);
check("stripOutfitItem unequips only the hat", stripped.hat === "none" && stripped.cloak === "wizard" && stripped.outfitPants === "wizard");
check("Staff hides while a fridge item is held", shouldDrawStaff({ heldProp: "wizardstaff", heldItem: { kind: "soda" } }, wearing, "s") === false);
check("Staff hides while lying down", shouldDrawStaff({ heldProp: "wizardstaff", lying: true }, wearing, "s") === false);
check("Staff draws when held in the front", shouldDrawStaff({ heldProp: "wizardstaff" }, wearing, "s") === true);
check("Staff hides on a back-facing sip raise", shouldDrawStaff({ heldProp: "wizardstaff", sipLift: 1 }, wearing, "n") === false);

const avatar3d = readFileSync(new URL("../public/js/avatar3d.js", import.meta.url), "utf8");
check("avatar3d exposes a setOutfitDraw hook and does not import outfits.js",
  /export function setOutfitDraw\(/.test(avatar3d)
  && !/from "\.\/outfits\.js"/.test(avatar3d)
  && /outfitDraw\?\.drawHat\?/.test(avatar3d)
  && /outfitDraw\?\.drawBody\?/.test(avatar3d)
  && /outfitDraw\.drawGlove/.test(avatar3d)
  && /outfitDraw\.drawBoot/.test(avatar3d)
  && /outfitDraw\.drawStaff/.test(avatar3d)
  && /hatOf\(av\) !== "wizard"/.test(avatar3d)
  && /cloak: a\.cloak === "wizard"/.test(avatar3d)
  && /Boolean\(flags\.lying\)/.test(avatar3d));
check("composeAvatar still draws eyes and mouth via the existing helpers",
  /drawEyes\(head, hk, headUpper/.test(avatar3d) && /drawMouth\(head, hk, headUpper/.test(avatar3d));

const pets = readFileSync(new URL("../public/js/petSprites.js", import.meta.url), "utf8");
check("petSprites can register a custom Flame Ball drawer without aliasing flame to cat",
  /export function setPetKindDrawer\(/.test(pets)
  && /kindDrawers\.has\(kind\)/.test(pets));

const serverSrc = readFileSync(new URL("../server.js", import.meta.url), "utf8");
check("server persists cloak and outfitPants through sanitizeAvatar",
  /cloak: m\.cloak === "wizard" \? "wizard" : "none"/.test(serverSrc)
  && /outfitPants: m\.outfitPants === "wizard" \? "wizard" : "none"/.test(serverSrc));
check("server buyStoreItem accepts the outfits tab and routes slots into clothes, props, and pets",
  /kind === "outfits"/.test(serverSrc) && /outfitById\(id\)/.test(serverSrc));
check("equipClothes toggles an already-worn outfit piece off",
  /wearingOutfit\(user\.avatar, stock\)/.test(serverSrc) && /stripOutfitItem\(user\.avatar/.test(serverSrc));

const html = readFileSync(new URL("../public/index.html", import.meta.url), "utf8");
check("The store panel has an Outfits tab",
  /data-store-tab="outfits"/.test(html) && /data-testid="store-tab-outfits"/.test(html));

const iso = readFileSync(new URL("../public/js/isoRoom.js", import.meta.url), "utf8");
check("isoRoom installs outfit and flame-pet drawers and stows the staff while sleeping",
  /installOutfitDraw\(setOutfitDraw\)/.test(iso)
  && /installFlamePet\(setPetKindDrawer\)/.test(iso)
  && /heldProp: lying \? null : p\.heldProp/.test(iso));

const root = fileURLToPath(new URL("../public", import.meta.url));
const mime = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".png": "image/png", ".svg": "image/svg+xml", ".json": "application/json" };

const measure = `<!DOCTYPE html><html><body>
<canvas id="c"></canvas>
<script type="module">
  import { drawAvatarSprite, setOutfitDraw, AV_W, AV_H, AV_HEAD_TOP, AV_GROUND_Y } from "/js/avatar3d.js";
  import { installOutfitDraw } from "/js/outfits.js";
  import { drawPetSprite, setPetKindDrawer, PET_W, PET_H } from "/js/petSprites.js";
  import { installFlamePet } from "/js/flamePet.js";
  installOutfitDraw(setOutfitDraw);
  installFlamePet(setPetKindDrawer);
  const look = {
    skin: "#f0c9a8", hair: "spiky", hairColor: "#e6d3a4", shirt: "#c45c4a",
    top: "tshirt", bottom: "jeans", bottomColor: "#3d4f7c", shoes: "white", accessory: "none",
    hat: "wizard", hatColor: "#4a5c78", cloak: "wizard", outfitPants: "wizard",
  };
  const bare = { ...look, hat: "none", cloak: "none", outfitPants: "none" };
  const facings = [
    { name: "SE", facing: { x: 1, z: 1 } },
    { name: "S", facing: { x: 0, z: 1 } },
    { name: "SW", facing: { x: -1, z: 1 } },
    { name: "W", facing: { x: -1, z: 0 } },
    { name: "NW", facing: { x: -1, z: -1 } },
    { name: "N", facing: { x: 0, z: -1 } },
    { name: "NE", facing: { x: 1, z: -1 } },
    { name: "E", facing: { x: 1, z: 0 } },
  ];
  function scan(img, w, h, pred) {
    let n = 0, hits = 0, minY = h, maxY = 0, minX = w, maxX = 0;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const o = (y * w + x) * 4;
      if (img[o + 3] < 16) continue;
      n++;
      if (pred(img[o], img[o + 1], img[o + 2], x, y)) {
        hits++;
        if (y < minY) minY = y; if (y > maxY) maxY = y;
        if (x < minX) minX = x; if (x > maxX) maxX = x;
      }
    }
    return { n, hits, minY, maxY, minX, maxX };
  }
  const steel = (r, g, b) => b > r + 8 && b > 70 && r < 160 && g < 180 && r > 20 && b < 200;
  const darkCloak = (r, g, b) => b > r + 6 && b > 28 && b < 130 && r < 90 && g < 110;
  const leather = (r, g, b) => r > 70 && r > g + 8 && g > b && b < 90;
  const wood = (r, g, b) => r > 50 && r > b + 20 && g < r && g > 20 && b < 80;
  const crystal = (r, g, b) => b > r + 20 && b > 140 && g > 80;
  const purple = (r, g, b) => r > 80 && b > 80 && g < 70 && Math.abs(r - b) < 50;
  const flameOrange = (r, g, b) => r > 180 && g > 40 && g < 200 && b < 80;
  const flameYellow = (r, g, b) => r > 220 && g > 180 && b < 160;
  const out = { facings: [], walk: null, sit: null, lie: null, flame: {}, eyes: null };
  for (const f of facings) {
    const spr = drawAvatarSprite(look, { facing: f.facing, heldProp: "wizardstaff", blink: "open" }, 0);
    const img = spr.c.getContext("2d").getImageData(0, 0, AV_W, AV_H).data;
    const blue = scan(img, AV_W, AV_H, steel);
    const cloak = scan(img, AV_W, AV_H, darkCloak);
    const boot = scan(img, AV_W, AV_H, (r, g, b, x, y) => leather(r, g, b) && y >= AV_GROUND_Y - 14);
    const staffWood = scan(img, AV_W, AV_H, wood);
    const gem = scan(img, AV_W, AV_H, crystal);
    const purp = scan(img, AV_W, AV_H, purple);
    out.facings.push({
      name: f.name, px: blue.n, hatBlue: blue.hits, hatTop: blue.minY,
      cloakHits: cloak.hits, cloakBot: cloak.maxY,
      bootHits: boot.hits, staffWood: staffWood.hits, staffTop: Math.min(staffWood.minY, gem.minY),
      gemHits: gem.hits, gemTop: gem.minY, purple: purp.hits,
    });
  }
  const walk = drawAvatarSprite(look, { facing: { x: 0, z: 1 }, heldProp: "wizardstaff", walking: true, blink: "open" }, 6);
  const wimg = walk.c.getContext("2d").getImageData(0, 0, AV_W, AV_H).data;
  out.walk = { px: scan(wimg, AV_W, AV_H, () => true).n, hat: scan(wimg, AV_W, AV_H, steel).hits };
  const sit = drawAvatarSprite(look, { facing: { x: 0, z: 1 }, heldProp: "wizardstaff", sitting: true, blink: "open" }, 0);
  const simg = sit.c.getContext("2d").getImageData(0, 0, AV_W, AV_H).data;
  out.sit = { px: scan(simg, AV_W, AV_H, () => true).n, hat: scan(simg, AV_W, AV_H, steel).hits, cloak: scan(simg, AV_W, AV_H, darkCloak).hits };
  const front = drawAvatarSprite(look, { facing: { x: 0, z: 1 }, heldProp: "wizardstaff", blink: "open" }, 0);
  const bareS = drawAvatarSprite(bare, { facing: { x: 0, z: 1 }, blink: "open" }, 0);
  const fimg = front.c.getContext("2d").getImageData(0, 0, AV_W, AV_H).data;
  const bimg = bareS.c.getContext("2d").getImageData(0, 0, AV_W, AV_H).data;
  // Face window around mid-head should keep eye-dark pixels, not be a solid hat fill.
  let eyeKept = 0, facePx = 0, hatInFace = 0;
  for (let y = AV_HEAD_TOP + 10; y < AV_HEAD_TOP + 28; y++) {
    for (let x = 26; x < 46; x++) {
      const o = (y * AV_W + x) * 4;
      if (bimg[o + 3] < 16) continue;
      const br = bimg[o], bg = bimg[o + 1], bb = bimg[o + 2];
      const dark = br < 80 && bg < 80 && bb < 80;
      if (!dark) continue;
      facePx++;
      const fr = fimg[o], fg = fimg[o + 1], fb = fimg[o + 2], fa = fimg[o + 3];
      if (fa > 16 && !steel(fr, fg, fb) && fr < 90 && fg < 90 && fb < 90) eyeKept++;
      if (fa > 16 && steel(fr, fg, fb)) hatInFace++;
    }
  }
  out.eyes = { facePx, eyeKept, hatInFace };
  for (const key of ["s", "n", "e"]) {
    const pet = drawPetSprite("flame", { dir: key === "s" ? 1 : key === "n" ? 5 : 7, walking: true }, 4);
    const pimg = pet.c.getContext("2d").getImageData(0, 0, pet.w, pet.h).data;
    const org = scan(pimg, pet.w, pet.h, flameOrange);
    const yel = scan(pimg, pet.w, pet.h, flameYellow);
    const eyes = scan(pimg, pet.w, pet.h, (r, g, b) => r > 240 && g > 230 && b > 200);
    out.flame[key] = { px: org.n, orange: org.hits, yellow: yel.hits, eyes: eyes.hits };
  }
  window.__outfits = out;
</script>
</body></html>`;

const httpServer = http.createServer((req, res) => {
  if (req.url === "/" || req.url.startsWith("/outfits-measure")) {
    res.writeHead(200, { "content-type": "text/html" });
    res.end(measure);
    return;
  }
  const rel = decodeURIComponent((req.url || "/").split("?")[0].replace(/^\//, ""));
  const file = join(root, rel);
  if (!file.startsWith(root) || !existsSync(file)) { res.writeHead(404); res.end("no"); return; }
  res.writeHead(200, { "content-type": mime[extname(file)] || "application/octet-stream" });
  res.end(readFileSync(file));
});

await new Promise((r) => httpServer.listen(0, "127.0.0.1", r));
const { port } = httpServer.address();
const browser = await chromium.launch({ args: ["--no-sandbox", "--disable-setuid-sandbox"] });
const page = await browser.newPage();
page.on("pageerror", (e) => { console.error("PAGEERROR", e); process.exitCode = 1; });
await page.goto("http://127.0.0.1:" + port + "/outfits-measure", { waitUntil: "networkidle" });
const metrics = await page.waitForFunction(() => window.__outfits, null, { timeout: 20000 }).then(() => page.evaluate(() => window.__outfits));
await browser.close();
httpServer.close();

if (!metrics) {
  console.error("FAIL no outfit metrics");
  process.exit(1);
}

for (const f of metrics.facings) {
  check(`${f.name}: full wizard set is non-empty`, f.px > 80, JSON.stringify(f));
  check(`${f.name}: steel/denim hat pixels sit above the face`, f.hatBlue >= 20 && f.hatTop <= 16, JSON.stringify(f));
  check(`${f.name}: cloak reaches near the ground`, f.cloakHits >= 20 && f.cloakBot >= 60, JSON.stringify(f));
  check(`${f.name}: tall brown boots are visible`, f.bootHits >= 8, JSON.stringify(f));
  check(`${f.name}: twisted staff is taller than the figure with a blue crystal on top`,
    f.staffWood >= 8 && f.gemHits >= 4 && f.gemTop <= 12 && f.staffTop <= 8, JSON.stringify(f));
  check(`${f.name}: no leftover purple/star palette`, f.purple === 0, JSON.stringify(f));
}
check("Walking frame still shows the hat", metrics.walk.px > 80 && metrics.walk.hat >= 20, JSON.stringify(metrics.walk));
check("Sitting still shows the hat and cloak", metrics.sit.px > 80 && metrics.sit.hat >= 20 && metrics.sit.cloak >= 10, JSON.stringify(metrics.sit));
check("Wizard hat does not cover the eyes",
  metrics.eyes.facePx >= 4 && metrics.eyes.eyeKept >= 2 && metrics.eyes.hatInFace === 0, JSON.stringify(metrics.eyes));
check("Flame Ball has orange/yellow fire and eyes from the front",
  metrics.flame.s.orange >= 20 && metrics.flame.s.yellow >= 4 && metrics.flame.s.eyes >= 2, JSON.stringify(metrics.flame));
check("Flame Ball keeps a flame body from the back without front-facing eyes",
  metrics.flame.n.orange >= 20 && metrics.flame.n.eyes === 0, JSON.stringify(metrics.flame));

if (process.exitCode) {
  console.error(`outfits: ${passed} passed, then failed`);
  process.exit(1);
}
console.log(`outfits: ${passed} passed`);
