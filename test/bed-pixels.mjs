import http from "node:http";
import { readFileSync, existsSync } from "node:fs";
import { extname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const root = fileURLToPath(new URL("../public", import.meta.url));
const mime = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".png": "image/png", ".svg": "image/svg+xml", ".json": "application/json" };

const html = `<!DOCTYPE html><html><body>
<canvas id="c"></canvas>
<script type="module">
  import { drawAvatarSprite, AV_W, AV_H, AV_HEAD_TOP, AV_GROUND_Y } from "/js/avatar3d.js";
  import { drawFurnitureSprite, furnBlitPos } from "/js/furnIso.js";
  import { lieDrawPose } from "/js/bed.js";
  const TW = 64, TH = 32;
  const tileToScreen = (tx, ty) => ({ sx: (tx - ty) * (TW / 2), sy: (tx + ty) * (TH / 2) });
  const look = { skin: "#f0c9a8", hair: "spiky", hairColor: "#e6d3a4", shirt: "#c45c4a", top: "tshirt", bottom: "jeans", bottomColor: "#3d4f7c", shoes: "white", accessory: "none" };
  function inQuad(px, py, q) {
    const pts = [q.N, q.E, q.S, q.W];
    let sgn = 0;
    for (let i = 0; i < 4; i++) {
      const a = pts[i], b = pts[(i + 1) % 4];
      const v = (px - a.sx) * (b.sy - a.sy) - (py - a.sy) * (b.sx - a.sx);
      const s = Math.sign(v);
      if (s) { if (!sgn) sgn = s; else if (s !== sgn) return false; }
    }
    return true;
  }
  const out = [];
  for (const rot of [0, 1, 2, 3]) {
    const furn = { x: 1, y: 1, rot, type: "bed" };
    const av = drawAvatarSprite(look, { facing: { x: 0, z: 1 }, lying: true, blink: "closed", walking: false, sitting: false }, 0);
    const d = lieDrawPose(furn, tileToScreen, { headTop: AV_HEAD_TOP, groundY: AV_GROUND_Y, avatar: av.c, avW: AV_W, avH: AV_H });
    const img = av.c.getContext("2d").getImageData(0, 0, AV_W, AV_H);
    const cos = Math.cos(d.angle), sin = Math.sin(d.angle);
    let n = 0, outside = 0;
    for (let y = 0; y < AV_H; y++) for (let x = 0; x < AV_W; x++) {
      if (img.data[(y * AV_W + x) * 4 + 3] < 16) continue;
      const lx = x - AV_W / 2, ly = y - (AV_HEAD_TOP + 1);
      const sx = d.headSx + lx * cos - ly * sin;
      const sy = d.headSy + lx * sin + ly * cos;
      n++;
      if (!inQuad(sx, sy, d.quad)) outside++;
    }
    out.push({
      rot,
      dx: d.dx, dy: d.dy, dist: Math.hypot(d.dx, d.dy),
      bbox: { w: d.bbox.w, h: d.bbox.h, n: d.bbox.n, cx: d.bbox.cx, cy: d.bbox.cy },
      centroid: { sx: d.centerSx, sy: d.centerSy },
      visible: n, outside, outsideFrac: outside / n,
    });
  }
  window.__metrics = out;
</script>
</body></html>`;

const server = http.createServer((req, res) => {
  if (req.url === "/" || req.url.startsWith("/bed-measure")) {
    res.writeHead(200, { "content-type": "text/html" });
    res.end(html);
    return;
  }
  const rel = decodeURIComponent((req.url || "/").split("?")[0].replace(/^\//, ""));
  const file = join(root, rel);
  if (!file.startsWith(root) || !existsSync(file)) { res.writeHead(404); res.end("no"); return; }
  res.writeHead(200, { "content-type": mime[extname(file)] || "application/octet-stream" });
  res.end(readFileSync(file));
});

await new Promise((r) => server.listen(0, "127.0.0.1", r));
const { port } = server.address();

const browser = await chromium.launch({ args: ["--no-sandbox", "--disable-setuid-sandbox"] });
const page = await browser.newPage();
page.on("pageerror", (e) => { console.error("PAGEERROR", e); process.exitCode = 1; });
await page.goto("http://127.0.0.1:" + port + "/bed-measure", { waitUntil: "networkidle" });
const metrics = await page.waitForFunction(() => window.__metrics, null, { timeout: 20000 }).then(() => page.evaluate(() => window.__metrics));
await browser.close();
server.close();

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

for (const m of metrics) {
  const line = `rot ${m.rot}: dx=${m.dx.toFixed(3)} dy=${m.dy.toFixed(3)} dist=${m.dist.toFixed(3)} bbox=${m.bbox.w.toFixed(1)}x${m.bbox.h.toFixed(1)} visible=${m.visible} outside_top=${m.outside} (${(m.outsideFrac * 100).toFixed(1)}%)`;
  console.log("    ", line);
  check("Rot " + m.rot + " visible-pixel center matches blanket top-face centroid within 1px", m.dist <= 1, JSON.stringify(m));
}

if (process.exitCode) {
  console.error(`bed-pixels: ${passed} passed, then failed`);
  process.exit(1);
}
console.log(`bed-pixels: ${passed} passed`);
