import http from "node:http";
import { readFileSync, existsSync } from "node:fs";
import { extname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import {
  EASEL_TYPE, EASEL_NAME, EASEL_PRICE, EASEL_GRID, EASEL_WALL_SIZE, EASEL_MAX_ARTWORKS,
  EASEL_CATALOG, EASEL_PALETTE, EASEL_CANVAS_BG, isEaselArt, easelArtType,
  emptyCells, encodeArtwork, decodeArtwork, validateArtwork, wallPixelsFromArtwork,
  floodFill, sanitizeTitle, canonColor,
} from "../public/js/easel.js";

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

check("Easel costs 26 coins and occupies one floor tile",
  EASEL_PRICE === 26 && EASEL_CATALOG.w === 1 && EASEL_CATALOG.h === 1 && EASEL_CATALOG.blocks === true && EASEL_NAME === "Easel");
check("Paintings are a 16×16 grid with a 32×32 framed wall size",
  EASEL_GRID === 16 && EASEL_WALL_SIZE === 32);
check("The studio palette has 16 colors", EASEL_PALETTE.length === 16 && EASEL_PALETTE.every((c) => canonColor(c)));
check("isEaselArt recognizes saved artwork ids only",
  isEaselArt("art_easel_a1") && !isEaselArt("easel") && !isEaselArt("art_ocean") && !isEaselArt("art_easel_"));

const cells = emptyCells();
cells[0] = "#c43a3a";
cells[17] = "#3d5aa0";
const packed = encodeArtwork({ title: "  Red House!!  ", cells });
const back = decodeArtwork(packed);
check("Artwork encodes compactly and round-trips pixels and title",
  packed.w === 16 && packed.h === 16 && typeof packed.cells === "string" && packed.palette.length >= 2
  && back.cells[0] === "#c43a3a" && back.cells[17] === "#3d5aa0" && back.cells[2] === EASEL_CANVAS_BG
  && back.title === "Red House!!" && packed.cells.length < 16 * 16 * 2);
check("Titles are trimmed and capped", sanitizeTitle("   " + "A".repeat(40)) === "A".repeat(24));
check("Invalid colors and sizes are rejected",
  validateArtwork({ w: 8, h: 8, palette: ["#ffffff"], cells: "AA==" }).ok === false
  && validateArtwork({ w: 16, h: 16, palette: ["nope"], cells: packed.cells }).ok === false);
const okSave = validateArtwork(packed);
check("A valid 16×16 painting is accepted", okSave.ok === true && okSave.artwork.data.w === 16);
check("Per-user artwork cap is 24",
  EASEL_MAX_ARTWORKS === 24 && validateArtwork(packed, { count: 24 }).ok === false);

const filled = floodFill(emptyCells(), 16, 16, 0, 0, "#3d5aa0");
check("Fill bucket floods the blank canvas", filled.every((c) => c === "#3d5aa0"));

const wall = wallPixelsFromArtwork({ data: packed });
check("Wall render is a framed 32×32 picture",
  wall.width === 32 && wall.height === 32 && wall.pixels[0] === "#3a2418"
  && wall.pixels[16 * 32 + 16] !== "#3a2418");

const iso = readFileSync(new URL("../public/js/iso.js", import.meta.url), "utf8");
const server = readFileSync(new URL("../server.js", import.meta.url), "utf8");
check("The furniture catalog lists the easel on the client and server",
  /easel:\s*\{\s*name:\s*"Easel",\s*price:\s*26/.test(iso)
  && /easel:\s*\{\s*\.\.\.EASEL_CATALOG/.test(server)
  && /saveEaselArt/.test(server)
  && /isEaselArt\(type\)/.test(server));

const publicRoot = fileURLToPath(new URL("../public", import.meta.url));
const mime = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css" };
const html = `<!doctype html><script type="module">
  import { drawFurnitureSprite } from "/js/furnIso.js";
  import { encodeArtwork, emptyCells, wallPixelsFromArtwork } from "/js/easel.js";
  import { renderArtPixels, isPainting, isPixelArt } from "/js/artPieces.js";
  const cells = emptyCells();
  for (let y = 4; y <= 11; y++) for (let x = 4; x <= 11; x++) cells[y*16+x] = "#c43a3a";
  const art = { type: "art_easel_demo", title: "Dot", data: encodeArtwork({ title: "Dot", cells }) };
  const rots = [0,1,2,3].map((rot) => {
    const blank = drawFurnitureSprite("easel", { lights: true, rot });
    const painted = drawFurnitureSprite("easel", { lights: true, rot, canvas: art, canvasKey: "dot"+rot });
    function scan(spr, pred) {
      const ctx = spr.c.getContext("2d");
      const data = ctx.getImageData(0,0,spr.w,spr.h).data;
      let n = 0, hits = 0;
      for (let i = 0; i < data.length; i += 4) {
        if (data[i+3] < 16) continue;
        n++;
        if (pred(data[i], data[i+1], data[i+2])) hits++;
      }
      return { n, hits };
    }
    const wood = (r,g,b) => r > 80 && r < 200 && g > 40 && g < 160 && b < 120 && r > b + 10;
    const red = (r,g,b) => r > 160 && g < 90 && b < 90;
    return {
      rot, w: painted.w, h: painted.h,
      blank: scan(blank, wood),
      paintedWood: scan(painted, wood),
      paintedRed: scan(painted, red),
    };
  });
  const rendered = renderArtPixels(art.type, art);
  window.__out = {
    rots,
    isPainting: isPainting(art.type) && isPixelArt(art.type),
    wall: { w: rendered.width, h: rendered.height, n: rendered.pixels.length, red: rendered.pixels.filter((c) => c === "#c43a3a").length },
  };
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

check("Custom easel art uses the painting wall renderer", out.isPainting && out.wall.w === 32 && out.wall.h === 32 && out.wall.red >= 16);
for (const r of out.rots) {
  check(`Easel rot ${r.rot} draws a wooden A-frame sprite`,
    r.w > 40 && r.h > 40 && r.blank.n >= 40 && r.blank.hits >= 12, JSON.stringify(r.blank));
  check(`Easel rot ${r.rot} shows the painting on the canvas`,
    r.paintedRed.hits >= 4 && r.paintedWood.hits >= 8, JSON.stringify({ red: r.paintedRed, wood: r.paintedWood }));
}

if (process.exitCode) {
  console.error("easel: tests failed");
  process.exit(1);
}
console.log("easel: " + passed + " passed");
