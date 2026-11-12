/* Original MyCube chibi pets — ink-outlined, muted, big-headed. */
export const PET_W = 32;
export const PET_H = 30;
export const PET_GROUND_Y = 27;

function hex(h) {
  const n = parseInt(String(h).replace("#", ""), 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}
function mix(a, b, t) {
  return { r: Math.round(a.r + (b.r - a.r) * t), g: Math.round(a.g + (b.g - a.g) * t), b: Math.round(a.b + (b.b - a.b) * t) };
}
function tones(hexStr) {
  const mid = hex(hexStr);
  return { mid, hi: mix(mid, { r: 255, g: 248, b: 230 }, 0.32), sh: mix(mid, { r: 70, g: 38, b: 32 }, 0.22) };
}

const INK = { r: 42, g: 28, b: 24 };

function partOutlineColor(c) {
  const avg = (c.r + c.g + c.b) / 3;
  const sat = 1.4, dark = 0.40;
  return {
    r: Math.max(0, Math.min(255, Math.round((avg + (c.r - avg) * sat) * dark))),
    g: Math.max(0, Math.min(255, Math.round((avg + (c.g - avg) * sat) * dark))),
    b: Math.max(0, Math.min(255, Math.round((avg + (c.b - avg) * sat) * dark))),
  };
}

const PALS = {
  cat:     { fur: tones("#e0a04a"), belly: tones("#ffe8c4"), accent: tones("#7a4a28"), nose: { r: 230, g: 130, b: 140 } },
  dog:     { fur: tones("#d4a068"), belly: tones("#fff0d4"), accent: tones("#7a4a24"), nose: { r: 60, g: 36, b: 28 } },
  bunny:   { fur: tones("#f4e6dc"), belly: tones("#fffaf4"), accent: tones("#e0c4b8"), nose: { r: 230, g: 130, b: 140 } },
  fox:     { fur: tones("#e07830"), belly: tones("#fff0e0"), accent: tones("#fff0e0"), nose: { r: 60, g: 36, b: 28 } },
  hamster: { fur: tones("#e09a58"), belly: tones("#ffe6c0"), accent: tones("#ffe6c0"), nose: { r: 230, g: 130, b: 140 } },
  parrot:  { fur: tones("#e05048"), belly: tones("#f0c84a"), accent: tones("#48a050"), nose: { r: 236, g: 196, b: 90 } },
  turtle:  { fur: tones("#6aaa48"), belly: tones("#e0ec90"), accent: tones("#5a8a3a"), nose: { r: 60, g: 36, b: 28 } },
};

const kindDrawers = new Map();
export function setPetKindDrawer(kind, fn) {
  if (kind && fn) kindDrawers.set(kind, fn);
  else if (kind) kindDrawers.delete(kind);
}

function aliasKind(kind) {
  if (kind === "robocat") return "cat";
  if (kind === "drone") return "parrot";
  if (kind === "neonfox") return "fox";
  if (kind === "jellyfish") return "turtle";
  if (kindDrawers.has(kind)) return kind;
  return PALS[kind] ? kind : "cat";
}

export function petViewOfDir(dir) {
  const d = ((dir % 8) + 8) % 8;
  if (d === 0) return { key: "se", flip: false };
  if (d === 1) return { key: "s", flip: false };
  if (d === 2) return { key: "se", flip: true };
  if (d === 3) return { key: "e", flip: true };
  if (d === 4) return { key: "n", flip: true };
  if (d === 5) return { key: "n", flip: false };
  if (d === 6) return { key: "n", flip: false };
  return { key: "e", flip: false };
}

function facingToDir(facing) {
  const x = facing?.x ?? facing?.dirX ?? 1;
  const z = facing?.z ?? facing?.y ?? facing?.dirY ?? 1;
  let dir = Math.round(Math.atan2(z, x) / (Math.PI / 4));
  return ((dir % 8) + 8) % 8;
}

function makeBuf() { return new Array(PET_W * PET_H).fill(null); }
function plot(buf, x, y, color, kind, depth = 0) {
  x = x | 0; y = y | 0;
  if (x < 0 || y < 0 || x >= PET_W || y >= PET_H || !color) return;
  const i = y * PET_W + x;
  if (buf[i] && (buf[i].depth || 0) > depth) return;
  buf[i] = { r: color.r, g: color.g, b: color.b, a: 255, slot: kind, depth };
}
function shadeAt(pal, lx, ly) {
  if (!pal || !pal.hi) return pal;
  if (ly < -0.4) return pal.hi;
  if (ly > 0.46) return pal.sh;
  return pal.mid;
}
function ellipse(buf, cx, cy, rx, ry, pal, kind, depth = 0, opts = {}) {
  const rxi = Math.ceil(rx) + 1, ryi = Math.ceil(ry) + 1;
  const flat = opts.shade === "flat" || !pal?.hi;
  for (let y = -ryi; y <= ryi; y++) {
    for (let x = -rxi; x <= rxi; x++) {
      const nx = x / rx, ny = y / ry;
      if (nx * nx + ny * ny > 1) continue;
      const col = flat ? (pal.mid || pal) : shadeAt(pal, nx, ny);
      plot(buf, Math.round(cx + x), Math.round(cy + y), col, kind, depth);
    }
  }
}
function capsule(buf, x0, y0, x1, y1, r, pal, kind, depth) {
  const dx = x1 - x0, dy = y1 - y0, n = Math.ceil(Math.hypot(dx, dy)) + 1;
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    ellipse(buf, x0 + dx * t, y0 + dy * t, r, r, pal, kind, depth);
  }
}
function flipBuf(src, flip) {
  if (!flip) return src;
  const out = makeBuf();
  for (let y = 0; y < PET_H; y++) {
    for (let x = 0; x < PET_W; x++) out[y * PET_W + (PET_W - 1 - x)] = src[y * PET_W + x];
  }
  return out;
}
function shiftBuf(buf, dy) {
  if (!dy) return buf;
  const out = makeBuf();
  for (let y = 0; y < PET_H; y++) {
    const ny = y + dy;
    if (ny < 0 || ny >= PET_H) continue;
    for (let x = 0; x < PET_W; x++) out[ny * PET_W + x] = buf[y * PET_W + x];
  }
  return out;
}
function plantPet(buf) {
  let sole = -1;
  for (let y = PET_H - 1; y >= 0 && sole < 0; y--) {
    for (let x = 0; x < PET_W; x++) {
      const p = buf[y * PET_W + x];
      if (p && p.slot !== "ink" && p.slot !== "sticker" && p.slot !== "shadow" && p.slot !== "spark" && p.slot !== "glow" && p.slot !== "halo") { sole = y; break; }
    }
  }
  if (sole < 0 || sole === PET_GROUND_Y) return buf;
  return shiftBuf(buf, PET_GROUND_Y - sole);
}
function addInk(buf) {
  const next = buf.slice();
  const dirs = [[1, 0], [-1, 0], [0, 1], [0, -1]];
  for (let y = 0; y < PET_H; y++) {
    for (let x = 0; x < PET_W; x++) {
      if (buf[y * PET_W + x]) continue;
      let n = null;
      for (const [dx, dy] of dirs) {
        const xx = x + dx, yy = y + dy;
        if (xx < 0 || yy < 0 || xx >= PET_W || yy >= PET_H) continue;
        const c = buf[yy * PET_W + xx];
        if (c && c.slot !== "ink" && c.slot !== "sticker" && c.slot !== "spark" && c.slot !== "glow" && c.slot !== "halo") { n = c; break; }
      }
      if (!n) continue;
      const col = partOutlineColor({ r: n.r, g: n.g, b: n.b });
      next[y * PET_W + x] = { ...col, a: 255, slot: "ink", depth: 80 };
    }
  }
  for (let y = 0; y < PET_H; y++) {
    for (let x = 0; x < PET_W; x++) {
      if (x > 0 && y > 0 && x < PET_W - 1 && y < PET_H - 1) continue;
      const p = buf[y * PET_W + x];
      if (!p || p.slot === "ink" || p.slot === "sticker" || p.slot === "shadow") continue;
      const col = partOutlineColor({ r: p.r, g: p.g, b: p.b });
      next[y * PET_W + x] = { ...col, a: 255, slot: "ink", depth: 80 };
    }
  }
  return next;
}
function addSticker(buf) {
  // White sticker outlines are retired. Pets use a 1px part-colored ink outline only.
  return buf;
}

function drawPet(buf, kind, key, pal, sit, walkStep, blink = "open", wag = 0, bob = 0) {
  const cx = key === "e" ? 17 : 16;
  const bobY = sit ? (bob || 0) : 0;
  const headY = (sit ? 13 : 11) + bobY;
  const bodyY = (sit ? 21 : 20) + bobY;
  const ground = PET_GROUND_Y;
  // Body first
  const bw = sit ? 8.5 : 7.2, bh = sit ? 5.5 : 6.2;
  ellipse(buf, cx, bodyY, key === "e" ? bw - 1.5 : bw, bh, pal.fur, "body", 10);
  if (key !== "n") ellipse(buf, cx, bodyY + 1, key === "e" ? 4 : 5, 3.2, pal.belly, "belly", 11, { shade: "flat" });
  // Paws
  const lift = walkStep ? 2 : 0;
  if (key === "e") {
    ellipse(buf, cx + 4, ground - (walkStep ? lift : 0), 2.6, 1.8, pal.fur, "paw", 8);
    ellipse(buf, cx - 2, ground - (walkStep ? 0 : lift), 2.6, 1.8, pal.fur, "paw", 8);
  } else {
    ellipse(buf, cx - 5, ground - (walkStep ? lift : 0), 2.6, 1.8, pal.fur, "paw", 8);
    ellipse(buf, cx + 5, ground - (walkStep ? 0 : lift), 2.6, 1.8, pal.fur, "paw", 8);
    if (!sit) {
      ellipse(buf, cx - 2, ground, 2.2, 1.5, pal.fur, "paw", 7);
      ellipse(buf, cx + 2, ground, 2.2, 1.5, pal.fur, "paw", 7);
    }
  }
  // Tail — when sitting, a small wag shifts the tail left/right (wag=0 matches the still pose).
  if (kind !== "parrot" && kind !== "turtle") {
    const tx = cx - 8 + (sit ? (wag || 0) : 0);
    const ty = bodyY;
    ellipse(buf, tx, ty + (kind === "cat" || kind === "fox" ? -2 : 1), kind === "bunny" ? 2 : 3.2, kind === "cat" || kind === "fox" ? 4.5 : 2.6, kind === "fox" ? pal.accent : pal.fur, "tail", 6);
  }
  if (kind === "turtle") {
    ellipse(buf, cx, bodyY, 8, 5.5, pal.accent, "shell", 12);
    if (key !== "n") ellipse(buf, cx, bodyY, 4, 2.6, pal.belly, "shell-hi", 13, { shade: "flat" });
    else ellipse(buf, cx, bodyY - 1, 3.2, 2.0, pal.fur, "shell-hi", 13, { shade: "flat" });
  }
  // Head (big)
  const hrx = key === "e" ? 7.4 : 8.4, hry = 7.6;
  ellipse(buf, cx, headY, hrx, hry, pal.fur, "head", 20);
  if (key !== "n") ellipse(buf, cx + (key === "e" ? 2 : 0), headY + 2.4, hrx * 0.62, hry * 0.5, pal.belly, "muzzle", 21);
  // Ears
  if (kind === "bunny") {
    ellipse(buf, cx - (key === "e" ? 1 : 5), headY - 6.2, 2.2, 4.6, pal.fur, "ear", 18);
    if (key !== "e") ellipse(buf, cx + 5, headY - 6.2, 2.2, 4.6, pal.fur, "ear", 18);
    ellipse(buf, cx - (key === "e" ? 1 : 5), headY - 5.4, 1.0, 3.0, { r: 230, g: 160, b: 170 }, "ear-in", 19);
  } else if (kind === "cat" || kind === "fox") {
    // Pointed ears
    ellipse(buf, cx - (key === "e" ? 1 : 5.5), headY - 7.2, 3.0, 3.6, pal.fur, "ear", 18);
    if (key !== "e") ellipse(buf, cx + 5.5, headY - 7.2, 3.0, 3.6, pal.fur, "ear", 18);
  } else if (kind === "dog" || kind === "hamster") {
    ellipse(buf, cx - (key === "e" ? 1 : 6), headY - 4, 3.4, 3.0, pal.fur, "ear", 18);
    if (key !== "e") ellipse(buf, cx + 6, headY - 4, 3.4, 3.0, pal.fur, "ear", 18);
  } else if (kind === "parrot") {
    ellipse(buf, cx, headY - 7, 3.2, 2.4, pal.fur, "crest", 18);
  }
  // Face — big sparkly eyes to match the chibi avatars.
  if (key !== "n") {
    const EYE_INK = { r: 22, g: 14, b: 12 };
    const EYE_HI = { r: 255, g: 255, b: 255 };
    const BLUSH = { r: 232, g: 150, b: 156 };
    const PET_OPEN = [
      [-1, -3], [0, -3], [1, -3],
      [-2, -2], [-1, -2], [0, -2], [1, -2], [2, -2],
      [-2, -1], [-1, -1], [0, -1], [1, -1], [2, -1],
      [-2,  0], [-1,  0], [0,  0], [1,  0], [2,  0],
      [-2,  1], [-1,  1], [0,  1], [1,  1], [2,  1],
      [-1,  2], [0,  2], [1,  2],
    ];
    const PET_HALF = [
      [-1, -1], [0, -1], [1, -1],
      [-2,  0], [-1,  0], [0,  0], [1,  0], [2,  0],
      [-1,  1], [0,  1], [1,  1],
    ];
    const PET_CLOSED = [
      [-2, -1], [-1, 0], [0, 0], [1, 0], [2, -1],
    ];
    const eyeY = headY - 0.2;
    function petEye(ex, ey, side) {
      const x = Math.round(ex), y = Math.round(ey);
      if (blink === "closed") {
        for (const [dx, dy] of PET_CLOSED) plot(buf, x + dx, y + dy, EYE_INK, "eye", 30);
      } else if (blink === "half") {
        for (const [dx, dy] of PET_HALF) plot(buf, x + dx, y + dy, EYE_INK, "eye", 30);
      } else {
        for (const [dx, dy] of PET_OPEN) plot(buf, x + dx, y + dy, EYE_INK, "eye", 30);
        plot(buf, x - 1, y - 2, EYE_HI, "eye-hi", 31);
        plot(buf, x, y - 2, EYE_HI, "eye-hi", 31);
        plot(buf, x + 1, y + 1, EYE_HI, "eye-spark", 31);
      }
      const dir = side >= 0 ? 1 : -1;
      plot(buf, x + dir, y + 4, BLUSH, "blush", 28);
      plot(buf, x + dir * 2, y + 4, BLUSH, "blush", 28);
    }
    if (key === "e") {
      petEye(cx + 3.6, eyeY, 1);
    } else {
      petEye(cx - 4.0, eyeY, -1);
      petEye(cx + 4.0, eyeY, 1);
    }
    const nx = key === "e" ? cx + 5 : cx;
    const ny = headY + 5.0;
    plot(buf, Math.round(nx), Math.round(ny), pal.nose, "nose", 32);
    plot(buf, Math.round(nx) - 1, Math.round(ny), pal.nose, "nose", 32);
    if (key !== "e") plot(buf, Math.round(nx) + 1, Math.round(ny), pal.nose, "nose", 32);
  }
}

function bufToCanvas(buf) {
  const c = typeof document !== "undefined" ? document.createElement("canvas") : null;
  if (!c) return { c: null, w: PET_W, h: PET_H };
  c.width = PET_W; c.height = PET_H;
  const ctx = c.getContext("2d");
  const img = ctx.createImageData(PET_W, PET_H);
  for (let i = 0; i < buf.length; i++) {
    const p = buf[i]; if (!p) continue;
    const o = i * 4;
    img.data[o] = p.r; img.data[o + 1] = p.g; img.data[o + 2] = p.b; img.data[o + 3] = (p.a == null ? 255 : p.a);
  }
  ctx.putImageData(img, 0, 0);
  ctx.globalCompositeOperation = "destination-over";
  ctx.fillStyle = "rgba(28, 16, 12, 0.30)";
  ctx.beginPath();
  ctx.ellipse(PET_W / 2, PET_GROUND_Y + 1.1, 8, 1.8, 0, 0, Math.PI * 2);
  ctx.fill();
  return { c, w: PET_W, h: PET_H };
}

const cache = new Map();

export function drawPetSprite(kind, flags = {}, frame = 0) {
  const k = aliasKind(kind);
  const walking = Boolean(flags.walking);
  const sit = Boolean(flags.sit);
  const dir = flags.dir != null ? flags.dir : facingToDir(flags.facing || { x: 1, z: 1 });
  const view = petViewOfDir(dir);
  const walkStep = walking && !sit ? (frame % 2) : 0;
  const blink = flags.blink || "open";
  const wag = sit ? (flags.wag | 0) : 0;
  const bob = sit ? (flags.bob | 0) : 0;
  const fx = (kindDrawers.get(kind) || kindDrawers.get(k)) ? (frame % 8) : 0;
  const key = ["ink", k, view.key, view.flip ? 1 : 0, sit ? 1 : 0, walking ? 1 : 0, walkStep, blink, wag, bob, fx].join(":");
  if (cache.has(key)) return cache.get(key);
  let buf = makeBuf();
  const custom = kindDrawers.get(kind) || kindDrawers.get(k);
  if (custom) custom(buf, { kind: k, key: view.key, flip: view.flip, sit, walkStep, blink, wag, bob, frame, walking });
  else drawPet(buf, k, view.key, PALS[k], sit, walkStep, blink, wag, bob);
  if (view.flip) buf = flipBuf(buf, true);
  buf = plantPet(buf);
  buf = addInk(buf);
  const spr = bufToCanvas(buf);
  cache.set(key, spr);
  return spr;
}

export function paintPetThumb(canvas, kind) {
  const w = canvas.width || 28, h = canvas.height || 28;
  if (!canvas.width) canvas.width = w;
  if (!canvas.height) canvas.height = h;
  const ctx = canvas.getContext("2d");
  ctx.imageSmoothingEnabled = false;
  ctx.fillStyle = "#efe6d4";
  ctx.fillRect(0, 0, w, h);
  const spr = drawPetSprite(kind, { facing: { x: 1, z: 1 }, sit: true }, 0);
  if (!spr.c) return false;
  const scale = Math.max(1, Math.floor(Math.min((w - 2) / spr.w, (h - 2) / spr.h)));
  const dx = Math.floor((w - spr.w * scale) / 2);
  const dy = Math.floor((h - spr.h * scale) / 2);
  ctx.drawImage(spr.c, 0, 0, spr.w, spr.h, dx, dy, spr.w * scale, spr.h * scale);
  return true;
}

export const PET_SHEET_KINDS = ["cat", "dog", "bunny", "fox", "hamster", "parrot", "turtle"];

export function paintPetSheet(canvas, scale = 4) {
  const kinds = PET_SHEET_KINDS;
  const dirs = [
    { label: "SE", facing: { x: 1, z: 1 } },
    { label: "S", facing: { x: 0, z: 1 } },
    { label: "E", facing: { x: 1, z: 0 } },
    { label: "N", facing: { x: 0, z: -1 } },
  ];
  const poses = [
    { label: "idle", flags: {} },
    { label: "walk", flags: { walking: true }, frame: 1 },
    { label: "sit", flags: { sit: true } },
  ];
  const cellW = PET_W * scale + 16;
  const cellH = PET_H * scale + 22;
  const labelW = 78;
  const cols = dirs.length * poses.length;
  const w = labelW + cols * cellW + 16;
  const h = 28 + kinds.length * (cellH + 12) + 12;
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  ctx.imageSmoothingEnabled = false;
  ctx.fillStyle = "#f4efe4";
  ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = "#3a2a1a";
  ctx.font = "11px Verdana, sans-serif";
  dirs.forEach((d, di) => {
    poses.forEach((p, pi) => {
      const x = labelW + (di * poses.length + pi) * cellW + 4;
      ctx.fillText(d.label + " " + p.label, x, 16);
    });
  });
  kinds.forEach((kind, ki) => {
    const y0 = 28 + ki * (cellH + 12);
    ctx.fillStyle = "#3a2a1a";
    ctx.font = "11px Verdana, sans-serif";
    ctx.fillText(kind, 8, y0 + cellH / 2);
    dirs.forEach((d, di) => {
      poses.forEach((p, pi) => {
        const spr = drawPetSprite(kind, { ...p.flags, facing: d.facing }, p.frame || 0);
        const x = labelW + (di * poses.length + pi) * cellW + 8;
        const y = y0 + 4;
        if (spr.c) ctx.drawImage(spr.c, 0, 0, spr.w, spr.h, x, y, spr.w * scale, spr.h * scale);
      });
    });
  });
}

if (typeof window !== "undefined") {
  window.__paintPetSheet = paintPetSheet;
  window.__drawPetSprite = drawPetSprite;
  window.__paintPetThumb = paintPetThumb;
}

export default { drawPetSprite, paintPetSheet, paintPetThumb, setPetKindDrawer, PET_W, PET_H, PET_GROUND_Y, PET_SHEET_KINDS };
