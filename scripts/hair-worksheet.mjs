#!/usr/bin/env node
// Regenerate the numbered haircut worksheet (1–10 + name above each column,
// Front / 3/4 / Side / Back row labels).
// Usage:
//   BASE_URL=http://127.0.0.1:3040 node scripts/hair-worksheet.mjs [outfile]
// Default outfile: /tmp/art/hair-worksheet.png

import { chromium } from "playwright";
import { writeFile, mkdir, unlink } from "fs/promises";
import { dirname, resolve } from "path";
import { fileURLToPath } from "url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const BASE = (process.env.BASE_URL || "http://127.0.0.1:3040").replace(/\/$/, "");
const OUT = resolve(process.argv[2] || "/tmp/art/hair-worksheet.png");
const STAMP = Date.now();
const HTML_REL = "tmp-hair-worksheet.html";
const HTML_PATH = resolve(ROOT, "public", HTML_REL);

const html = `<!doctype html>
<meta charset="utf-8">
<style>body{margin:0;background:#f4efe4}canvas{image-rendering:pixelated;display:block}</style>
<canvas id="sheet"></canvas>
<script type="module">
  import { drawAvatarSprite, HAIRCUT_LOOKS, AV_W, AV_H } from "./js/avatar3d.js?ws=${STAMP}";

  const looks = HAIRCUT_LOOKS;
  const dirs = [
    { label: "Front", body: 1 },
    { label: "3/4", body: 0 },
    { label: "Side", body: 7 },
    { label: "Back", body: 5 },
  ];
  const scale = 8;
  const pad = 24, gapX = 16, gapY = 16, lab = 128, header = 142;
  const cw = AV_W * scale, ch = AV_H * scale;
  const canvas = document.getElementById("sheet");
  canvas.width = lab + pad * 2 + looks.length * cw + (looks.length - 1) * gapX;
  canvas.height = pad + header + dirs.length * ch + (dirs.length - 1) * gapY + pad;
  const ctx = canvas.getContext("2d");
  ctx.imageSmoothingEnabled = false;
  ctx.fillStyle = "#f4efe4";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = "#2a1c16";
  ctx.textBaseline = "alphabetic";

  const base = {
    skin: "#f0c9a8", shirt: "#6c7bff", top: "tshirt",
    bottom: "jeans", bottomColor: "#3d4f7c", shoes: "white", accessory: "none",
  };

  dirs.forEach((d, r) => {
    const y = pad + header + r * (ch + gapY);
    ctx.font = "18px Verdana, sans-serif";
    ctx.textAlign = "left";
    ctx.fillText(d.label, 22, y + ch / 2 + 6);
    looks.forEach((h, i) => {
      const x = lab + pad + i * (cw + gapX);
      const spr = drawAvatarSprite(
        { ...base, hair: h.hair, hairColor: h.hairColor },
        { bodyDir: d.body, headDir: d.body, blink: "open" },
        0,
      );
      ctx.drawImage(spr.c, 0, 0, spr.w, spr.h, x, y, cw, ch);
      if (r === 0) {
        const cx = x + cw / 2;
        ctx.textAlign = "center";
        ctx.font = "700 56px Verdana, sans-serif";
        ctx.fillText(String(i + 1), cx, pad + 56);
        ctx.font = "18px Verdana, sans-serif";
        ctx.fillText(h.label, cx, pad + 88);
        ctx.textAlign = "left";
      }
    });
  });
  window.__size = { w: canvas.width, h: canvas.height };
  window.__done = true;
</script>
`;

await writeFile(HTML_PATH, html);
await mkdir(dirname(OUT), { recursive: true });

const browser = await chromium.launch();
try {
  const page = await browser.newPage({ viewport: { width: 4200, height: 2400 } });
  page.on("pageerror", (e) => console.error("pageerror", e.message));
  await page.goto(`${BASE}/${HTML_REL}?t=${STAMP}`, { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => window.__done, { timeout: 30000 });
  const size = await page.evaluate(() => window.__size);
  const buf = await page.locator("#sheet").screenshot({ type: "png" });
  await writeFile(OUT, buf);
  console.log("wrote", OUT, size);
} finally {
  await browser.close();
  await unlink(HTML_PATH).catch(() => {});
}
