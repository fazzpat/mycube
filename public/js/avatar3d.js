/* Original MyCube chibi paper-doll avatars. Native 48x64, integer blit, sticker outline. */
export const AV_W = 48;
export const AV_H = 64;
export const AV_GROUND_Y = 61;
export const AV_HEAD_TOP = 2;
const AV_SEAT_DROP = 11;
const CX = 24;

export function facingIndex8(facing, dirX, dirY) {
  let dx = 0, dy = 1;
  if (facing && (facing.x !== undefined || facing.z !== undefined || facing.y !== undefined)) {
    dx = facing.x || 0;
    dy = facing.z !== undefined ? facing.z : (facing.y || 0);
  } else {
    dx = dirX || 0;
    dy = dirY || 0;
  }
  if (dx === 0 && dy === 0) dy = 1;
  let ang = Math.atan2(dy, dx);
  if (ang < 0) ang += Math.PI * 2;
  return Math.round(ang / (Math.PI / 4)) & 7;
}

function hexToRgb(hex) {
  const n = parseInt(String(hex).replace("#", ""), 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}
function mix(a, b, t) {
  return {
    r: Math.round(a.r + (b.r - a.r) * t),
    g: Math.round(a.g + (b.g - a.g) * t),
    b: Math.round(a.b + (b.b - a.b) * t),
  };
}
function rgb(r, g, b) { return { r, g, b }; }
function mute(hex) {
  // Pull catalog colors toward a muted, warm, earthy ramp.
  const c = hexToRgb(hex);
  const dust = rgb(168, 140, 110);
  return mix(c, dust, 0.28);
}

const INK = rgb(42, 28, 24);
const STICKER = rgb(255, 250, 244);
const TEAR = rgb(150, 186, 210);

function tones(hex, warm = false) {
  const b = typeof hex === "string" ? (warm ? hexToRgb(hex) : mute(hex)) : hex;
  const hi = warm ? mix(b, rgb(255, 236, 214), 0.28) : mix(b, rgb(255, 248, 236), 0.22);
  const sh = warm ? mix(b, rgb(96, 54, 42), 0.28) : mix(b, rgb(36, 24, 22), 0.28);
  return { mid: b, hi, sh };
}

function shoePal(id) {
  if (id === "black") return tones("#2c2624");
  if (id === "red") return tones("#8e3e32");
  if (id === "gum") return tones("#d8c4a4", true);
  if (id === "skate") return tones("#3a342e");
  return tones("#efe6d6", true);
}

function normalizeAvatar(raw = {}) {
  const a = { ...raw };
  if (a.top === "techwear") a.top = "jacket";
  if (a.top === "ledhoodie") a.top = "hoodie";
  if (a.bottom === "neonpants") a.bottom = "jeans";
  if (a.shoes === "glow") a.shoes = "white";
  if (a.shoes === "cyber") a.shoes = "black";
  if (a.accessory === "visor" || a.accessory === "goggles") { a.glasses = true; a.accessory = "none"; }
  if (a.accessory === "tattoo") a.accessory = "none";
  if (a.hair === "neon") a.hair = "spiky";
  return {
    skin: a.skin || "#f1c27d",
    hair: a.hair || "short",
    hairColor: a.hairColor || "#2b1d16",
    shirt: a.shirt || "#ff7a59",
    glasses: Boolean(a.glasses),
    top: a.top || "tshirt",
    bottom: a.bottom || "jeans",
    bottomColor: a.bottomColor || "#3d4f7c",
    shoes: a.shoes || "white",
    accessory: a.accessory || "none",
    headphoneColor: a.headphoneColor || "#2a2a2e",
    outer: a.outer || "none",
  };
}

function viewOfDir(dir) {
  switch (dir) {
    case 0: return { key: "se", flip: false };
    case 1: return { key: "s", flip: false };
    case 2: return { key: "se", flip: true };
    case 3: return { key: "e", flip: true };
    case 4: return { key: "ne", flip: true };
    case 5: return { key: "n", flip: false };
    case 6: return { key: "ne", flip: false };
    case 7: return { key: "e", flip: false };
    default: return { key: "se", flip: false };
  }
}

function makeBuf() { return new Array(AV_W * AV_H).fill(null); }

function plot(buf, x, y, color, kind, depth = 0) {
  x = x | 0; y = y | 0;
  if (x < 0 || y < 0 || x >= AV_W || y >= AV_H || !color) return;
  const i = y * AV_W + x;
  const cur = buf[i];
  if (cur && (cur.depth || 0) > depth) return;
  buf[i] = { color, kind, depth };
}

function shadeAt(pal, lx, ly) {
  const L = -lx * 0.62 - ly * 0.78;
  if (L > 0.32) return pal.hi;
  if (L < -0.22) return pal.sh;
  return pal.mid;
}

function ellipse(buf, cx, cy, rx, ry, pal, kind, depth = 0, opts = {}) {
  const rxi = Math.ceil(rx) + 1, ryi = Math.ceil(ry) + 1;
  const cut = opts.cut || 1;
  for (let y = -ryi; y <= ryi; y++) {
    for (let x = -rxi; x <= rxi; x++) {
      const nx = x / rx, ny = y / ry;
      const d = nx * nx + ny * ny;
      if (d > cut) continue;
      const col = pal.hi ? shadeAt(pal, nx, ny) : pal;
      plot(buf, Math.round(cx + x), Math.round(cy + y), col, kind, depth);
    }
  }
}

function circle(buf, cx, cy, r, pal, kind, depth) {
  ellipse(buf, cx, cy, r, r, pal, kind, depth);
}

function rect(buf, x0, y0, x1, y1, pal, kind, depth, round = 0) {
  const minx = Math.min(x0, x1), maxx = Math.max(x0, x1);
  const miny = Math.min(y0, y1), maxy = Math.max(y0, y1);
  const cx = (minx + maxx) / 2, cy = (miny + maxy) / 2;
  const hw = (maxx - minx) / 2 || 1, hh = (maxy - miny) / 2 || 1;
  for (let y = miny; y <= maxy; y++) {
    for (let x = minx; x <= maxx; x++) {
      if (round > 0) {
        const dx = Math.max(0, Math.abs(x - cx) - (hw - round));
        const dy = Math.max(0, Math.abs(y - cy) - (hh - round));
        if (dx * dx + dy * dy > round * round) continue;
      }
      const col = pal.hi ? shadeAt(pal, (x - cx) / hw, (y - cy) / hh) : pal;
      plot(buf, x, y, col, kind, depth);
    }
  }
}

function capsule(buf, x0, y0, x1, y1, r, pal, kind, depth) {
  const dx = x1 - x0, dy = y1 - y0;
  const len = Math.hypot(dx, dy) || 1;
  const n = Math.ceil(len) + 1;
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    ellipse(buf, x0 + dx * t, y0 + dy * t, r, r, pal, kind, depth);
  }
}

function teardrop(buf, cx, cy, rx, ry, ang, pal, kind, depth) {
  // Rounded clump pointing along ang (radians, 0 = right, -PI/2 = up).
  const ca = Math.cos(ang), sa = Math.sin(ang);
  const rxi = Math.ceil(Math.abs(rx) + Math.abs(ry)) + 2;
  for (let y = -rxi; y <= rxi; y++) {
    for (let x = -rxi; x <= rxi; x++) {
      const lx = x * ca + y * sa;
      const ly = -x * sa + y * ca;
      const nx = lx / rx, ny = ly / ry;
      // pointed tip in +lx
      const tip = nx > 0 ? nx * nx * 1.15 + ny * ny : nx * nx * 0.75 + ny * ny;
      if (tip > 1) continue;
      const col = pal.hi ? shadeAt(pal, nx, ny) : pal;
      plot(buf, Math.round(cx + x), Math.round(cy + y), col, kind, depth);
    }
  }
}

function flipBuf(src, flip) {
  if (!flip) return src;
  const out = makeBuf();
  for (let y = 0; y < AV_H; y++) {
    for (let x = 0; x < AV_W; x++) {
      out[y * AV_W + (AV_W - 1 - x)] = src[y * AV_W + x];
    }
  }
  return out;
}

function shiftBuf(buf, dy) {
  if (!dy) return buf;
  const out = makeBuf();
  for (let y = 0; y < AV_H; y++) {
    const ny = y + dy;
    if (ny < 0 || ny >= AV_H) continue;
    for (let x = 0; x < AV_W; x++) out[ny * AV_W + x] = buf[y * AV_W + x];
  }
  return out;
}

function lowestKindY(buf, pred) {
  for (let y = AV_H - 1; y >= 0; y--) {
    for (let x = 0; x < AV_W; x++) {
      const p = buf[y * AV_W + x];
      if (p && pred(p)) return y;
    }
  }
  return -1;
}

function plantOnGround(buf) {
  const sole = lowestKindY(buf, (p) => {
    const k = p.kind || "";
    return k.startsWith("shoe") || k.startsWith("sole") || k.startsWith("boot");
  });
  const body = lowestKindY(buf, (p) => p.kind !== "ink" && p.kind !== "sticker" && p.kind !== "shadow");
  const y = sole >= 0 ? sole : body;
  if (y < 0 || y === AV_GROUND_Y) return buf;
  return shiftBuf(buf, AV_GROUND_Y - y);
}

function addInkOutline(buf) {
  const next = buf.slice();
  const dirs = [[1, 0], [-1, 0], [0, 1], [0, -1]];
  for (let y = 0; y < AV_H; y++) {
    for (let x = 0; x < AV_W; x++) {
      const i = y * AV_W + x;
      if (buf[i]) continue;
      let n = null;
      for (const [dx, dy] of dirs) {
        const xx = x + dx, yy = y + dy;
        if (xx < 0 || yy < 0 || xx >= AV_W || yy >= AV_H) continue;
        const c = buf[yy * AV_W + xx];
        if (c && c.kind !== "ink" && c.kind !== "sticker" && c.kind !== "shadow") { n = c; break; }
      }
      if (!n) continue;
      const col = mix(n.color || INK, INK, 0.72);
      next[i] = { color: col, kind: "ink", depth: 80 };
    }
  }
  return next;
}

function addStickerOutline(buf) {
  const next = buf.slice();
  const dirs = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]];
  for (let y = 0; y < AV_H; y++) {
    for (let x = 0; x < AV_W; x++) {
      const i = y * AV_W + x;
      if (buf[i]) continue;
      let hit = false;
      for (const [dx, dy] of dirs) {
        const xx = x + dx, yy = y + dy;
        if (xx < 0 || yy < 0 || xx >= AV_W || yy >= AV_H) continue;
        const c = buf[yy * AV_W + xx];
        if (c && c.kind !== "shadow") { hit = true; break; }
      }
      if (hit) next[i] = { color: STICKER, kind: "sticker", depth: 90 };
    }
  }
  return next;
}

function buildPalette(av) {
  const skin = tones(av.skin, true);
  const shirt = tones(av.shirt);
  const pants = tones(av.bottomColor);
  const hair = tones(av.hairColor, true);
  const shoe = shoePal(av.shoes);
  const acc = tones(av.headphoneColor || av.shirt || "#2a2a2e");
  const sole = (av.shoes === "gum" || av.shoes === "white") ? tones("#b08958", true) : tones("#1e1a18");
  return { skin, shirt, pants, hair, shoe, acc, sole, gold: tones("#c9a25a", true) };
}

/* ---------- geometry per view ---------- */
function headGeom(key) {
  // Head is ~45% of figure height (about 28px of 61).
  if (key === "e") return { cx: 25, cy: 15.5, rx: 11.2, ry: 13.4 };
  if (key === "se") return { cx: 21.4, cy: 15.2, rx: 12.2, ry: 13.6 };
  if (key === "ne") return { cx: 23.5, cy: 15.2, rx: 12.6, ry: 13.6 };
  return { cx: 24, cy: 15.2, rx: 13.2, ry: 13.8 };
}

function drawHead(buf, key, pal, upper, emote) {
  const g = headGeom(key);
  const cy = g.cy + upper;
  // Slightly squared jaw: ellipse plus a flatter lower third.
  ellipse(buf, g.cx, cy, g.rx, g.ry, pal.skin, "skin-head", 40);
  ellipse(buf, g.cx, cy + g.ry * 0.28, g.rx * 0.92, g.ry * 0.78, pal.skin, "skin-jaw", 40);
  // Cheeks
  if (key !== "n") {
    const off = key === "e" ? 3 : 7.5;
    ellipse(buf, g.cx - (key === "e" ? 1 : off), cy + 5.2, 3.2, 2.6, { hi: pal.skin.hi, mid: mix(pal.skin.mid, rgb(230, 150, 130), 0.18), sh: pal.skin.sh }, "skin-cheek", 41);
    if (key !== "e") ellipse(buf, g.cx + off, cy + 5.2, 3.2, 2.6, { hi: pal.skin.hi, mid: mix(pal.skin.mid, rgb(230, 150, 130), 0.18), sh: pal.skin.sh }, "skin-cheek", 41);
  }
  // Ears (small, round) — skip when a hat will cover, still draw; hats go on later.
  if (key === "s") {
    ellipse(buf, g.cx - g.rx + 1, cy + 1, 2.6, 3.1, pal.skin, "ear", 35);
    ellipse(buf, g.cx + g.rx - 1, cy + 1, 2.6, 3.1, pal.skin, "ear", 35);
  } else if (key === "se") {
    ellipse(buf, g.cx - g.rx + 1.4, cy + 1, 2.5, 3.0, pal.skin, "ear", 35);
    ellipse(buf, g.cx + g.rx - 0.6, cy + 0.6, 2.4, 2.8, pal.skin, "ear", 34);
  } else if (key === "e") {
    ellipse(buf, g.cx - 2, cy + 0.5, 2.5, 3.0, pal.skin, "ear", 34);
  } else if (key === "n") {
    ellipse(buf, g.cx - g.rx + 1, cy + 1, 2.6, 3.1, pal.skin, "ear", 35);
    ellipse(buf, g.cx + g.rx - 1, cy + 1, 2.6, 3.1, pal.skin, "ear", 35);
  } else if (key === "ne") {
    ellipse(buf, g.cx - g.rx + 0.6, cy + 0.6, 2.4, 2.8, pal.skin, "ear", 34);
    ellipse(buf, g.cx + g.rx - 1.4, cy + 1, 2.5, 3.0, pal.skin, "ear", 35);
  }
}

function clearFaceWindow(buf, key, pal, upper) {
  if (key === "n" || key === "ne") return;
  const g = headGeom(key);
  const cy = g.cy + upper;
  // Repaint the lower face so hair never hides the eyes.
  ellipse(buf, g.cx + (key === "e" ? 2 : 0), cy + 4.2, g.rx * (key === "e" ? 0.72 : 0.78), g.ry * 0.62, pal.skin, "skin-face", 48);
  if (key !== "e") {
    ellipse(buf, g.cx - 6.5, cy + 5.4, 3.1, 2.5, { hi: pal.skin.hi, mid: mix(pal.skin.mid, rgb(230, 150, 130), 0.16), sh: pal.skin.sh }, "skin-cheek", 49);
    ellipse(buf, g.cx + 6.5, cy + 5.4, 3.1, 2.5, { hi: pal.skin.hi, mid: mix(pal.skin.mid, rgb(230, 150, 130), 0.16), sh: pal.skin.sh }, "skin-cheek", 49);
  }
}

function drawFace(buf, key, pal, upper, emote) {
  if (key === "n" || key === "ne") return;
  const g = headGeom(key);
  const cy = g.cy + upper;
  const eyeY = cy + 5.2;
  const eyeRx = 2.05, eyeRy = 2.55;
  let leftX, rightX;
  if (key === "e") { leftX = g.cx + 3.6; rightX = null; }
  else if (key === "se") { leftX = g.cx - 3.2; rightX = g.cx + 7.0; }
  else { leftX = g.cx - 6.0; rightX = g.cx + 6.0; }
  const closed = emote === "laugh" || emote === "dance";
  const crying = emote === "cry";
  function eye(ex) {
    if (closed) {
      plot(buf, Math.round(ex - 1), Math.round(eyeY), INK, "eye", 54);
      plot(buf, Math.round(ex), Math.round(eyeY + 1), INK, "eye", 54);
      plot(buf, Math.round(ex + 1), Math.round(eyeY), INK, "eye", 54);
    } else {
      ellipse(buf, ex, eyeY, eyeRx, eyeRy, INK, "eye", 54);
    }
  }
  eye(leftX);
  if (rightX != null) eye(rightX);
  if (crying) {
    rect(buf, leftX - 0.5, eyeY + 3, leftX + 0.5, eyeY + 7, TEAR, "tear", 55);
    if (rightX != null) rect(buf, rightX - 0.5, eyeY + 3, rightX + 0.5, eyeY + 7, TEAR, "tear", 55);
  }
  if (emote === "laugh") {
    ellipse(buf, key === "e" ? g.cx + 4 : g.cx, cy + 9.0, 1.6, 1.2, rgb(90, 40, 40), "mouth", 54);
  } else if (emote === "cry") {
    ellipse(buf, key === "e" ? g.cx + 4 : g.cx, cy + 9.2, 1.2, 0.8, rgb(120, 70, 70), "mouth", 54);
  }
}

function hairClumps(style, key) {
  // Relative to head center. Each clump: {dx,dy,rx,ry,ang}
  const up = -Math.PI / 2;
  const styles = {
    short: [
      { dx: 0, dy: -9.5, rx: 7, ry: 5.5, ang: up },
      { dx: -7.5, dy: -6.5, rx: 5, ry: 5, ang: up - 0.7 },
      { dx: 7.5, dy: -6.5, rx: 5, ry: 5, ang: up + 0.7 },
      { dx: -11, dy: -0.5, rx: 4.2, ry: 4.6, ang: Math.PI },
      { dx: 11, dy: -0.5, rx: 4.2, ry: 4.6, ang: 0 },
    ],
    spiky: [
      { dx: 0, dy: -12, rx: 4.2, ry: 7.8, ang: up },
      { dx: -5.5, dy: -11, rx: 3.8, ry: 7.2, ang: up - 0.4 },
      { dx: 5.5, dy: -11, rx: 3.8, ry: 7.2, ang: up + 0.4 },
      { dx: -10, dy: -7.5, rx: 3.6, ry: 6.2, ang: up - 0.9 },
      { dx: 10, dy: -7.5, rx: 3.6, ry: 6.2, ang: up + 0.9 },
      { dx: -11, dy: -1, rx: 4, ry: 4.6, ang: Math.PI },
      { dx: 11, dy: -1, rx: 4, ry: 4.6, ang: 0 },
    ],
    bangs: [
      { dx: 0, dy: -9.5, rx: 7.5, ry: 5.5, ang: up },
      { dx: -6.5, dy: -8, rx: 5, ry: 5, ang: up - 0.45 },
      { dx: 6.5, dy: -8, rx: 5, ry: 5, ang: up + 0.45 },
      { dx: -3.2, dy: -3.2, rx: 3.6, ry: 3.4, ang: up - 0.15 },
      { dx: 3.6, dy: -3.6, rx: 3.4, ry: 3.2, ang: up + 0.25 },
      { dx: -11, dy: 0, rx: 4.2, ry: 5.5, ang: Math.PI },
      { dx: 11, dy: 0, rx: 4.2, ry: 5.5, ang: 0 },
      { dx: -10, dy: 10, rx: 3.6, ry: 6.5, ang: Math.PI * 0.62 },
      { dx: 10, dy: 10, rx: 3.6, ry: 6.5, ang: Math.PI * 0.38 },
    ],
    curly: [
      { dx: 0, dy: -11, rx: 5.2, ry: 5.2, ang: up },
      { dx: -7, dy: -9, rx: 5, ry: 5, ang: up },
      { dx: 7, dy: -9, rx: 5, ry: 5, ang: up },
      { dx: -11, dy: -3.5, rx: 4.6, ry: 4.6, ang: Math.PI },
      { dx: 11, dy: -3.5, rx: 4.6, ry: 4.6, ang: 0 },
      { dx: -10, dy: 3, rx: 4.2, ry: 4.2, ang: Math.PI },
      { dx: 10, dy: 3, rx: 4.2, ry: 4.2, ang: 0 },
    ],
    bun: [
      { dx: 0, dy: -8.5, rx: 7, ry: 5.2, ang: up },
      { dx: -7.5, dy: -5, rx: 4.6, ry: 4.4, ang: up - 0.7 },
      { dx: 7.5, dy: -5, rx: 4.6, ry: 4.4, ang: up + 0.7 },
      { dx: -10.5, dy: 0, rx: 4, ry: 4.4, ang: Math.PI },
      { dx: 10.5, dy: 0, rx: 4, ry: 4.4, ang: 0 },
    ],
    long: [
      { dx: 0, dy: -9.5, rx: 7.5, ry: 5.5, ang: up },
      { dx: -7.5, dy: -6.5, rx: 5, ry: 5, ang: up - 0.65 },
      { dx: 7.5, dy: -6.5, rx: 5, ry: 5, ang: up + 0.65 },
      { dx: -11, dy: -1, rx: 4.4, ry: 5, ang: Math.PI },
      { dx: 11, dy: -1, rx: 4.4, ry: 5, ang: 0 },
    ],
    undercut: [
      { dx: 0, dy: -11, rx: 6.2, ry: 6.8, ang: up },
      { dx: -5, dy: -10, rx: 4.6, ry: 6, ang: up - 0.35 },
      { dx: 5, dy: -10, rx: 4.6, ry: 6, ang: up + 0.35 },
      { dx: -8, dy: -5, rx: 3.4, ry: 4.4, ang: up - 0.85 },
      { dx: 8, dy: -5, rx: 3.4, ry: 4.4, ang: up + 0.85 },
    ],
  };
  let clumps = styles[style] || styles.short;
  if (key === "e") {
    clumps = clumps.map((c) => ({ ...c, dx: c.dx * 0.55 + 2, dy: c.dy }));
  } else if (key === "se" || key === "ne") {
    clumps = clumps.map((c) => ({ ...c, dx: c.dx * 0.92 - 1, dy: c.dy }));
  }
  if (key === "n" || key === "ne") {
    // Fuller back of the head; drop fringe clumps near the face.
    clumps = clumps.filter((c) => c.dy < 8 || Math.abs(c.dx) > 6);
    clumps = clumps.concat([
      { dx: 0, dy: 2, rx: 10, ry: 8, ang: Math.PI / 2 },
    ]);
  }
  return clumps;
}

function drawHair(buf, av, key, pal, upper, hatOn) {
  const g = headGeom(key);
  const cy = g.cy + upper;
  const style = hatOn && av.hair !== "long" ? "short" : av.hair;
  for (const c of hairClumps(style, key)) {
    teardrop(buf, g.cx + c.dx, cy + c.dy, c.rx, c.ry, c.ang, pal.hair, "hair", 45);
  }
  // Skull cap fill so scalp never shows.
  ellipse(buf, g.cx, cy - 3.5, g.rx * 0.92, g.ry * 0.72, pal.hair, "hair-cap", 44);
  if (av.hair === "bun") {
    circle(buf, g.cx - 11, cy + 2, 3.8, pal.hair, "hair-bun", 46);
    circle(buf, g.cx + 11, cy + 2, 3.8, pal.hair, "hair-bun", 46);
  }
  if (av.hair === "long") {
    const lx = key === "e" ? 0 : 11.2;
    if (key === "e") {
      capsule(buf, g.cx - 6, cy + 4, g.cx - 5, cy + 22, 3.6, pal.hair, "hair-lock", 43);
    } else {
      capsule(buf, g.cx - lx, cy + 3, g.cx - lx - 0.5, cy + 22, 3.7, pal.hair, "hair-lock", 43);
      capsule(buf, g.cx + lx, cy + 3, g.cx + lx + 0.5, cy + 22, 3.7, pal.hair, "hair-lock", 43);
    }
  }
}

function drawHat(buf, av, key, pal, upper) {
  const g = headGeom(key);
  const cy = g.cy + upper - 8.5;
  const acc = pal.acc;
  if (av.accessory === "beanie") {
    ellipse(buf, g.cx, cy + 2, g.rx * 0.88, 5.2, acc, "hat", 55);
    ellipse(buf, g.cx, cy + 0.2, g.rx * 0.62, 3.2, acc, "hat", 56);
    circle(buf, g.cx, cy - 4, 2.0, acc, "hat-pom", 57);
  } else if (av.accessory === "cap" || av.accessory === "trucker") {
    ellipse(buf, g.cx, cy + 2.2, g.rx * 0.88, 4.4, acc, "hat", 55);
    if (key !== "n") {
      const bx = key === "e" ? g.cx + 7 : g.cx;
      ellipse(buf, bx, cy + 5.4, key === "e" ? 6.5 : 7.5, 1.6, acc, "hat-brim", 56);
    }
  }
}

function ring(buf, cx, cy, rx, ry, color, kind, depth) {
  const rxi = Math.ceil(rx) + 1, ryi = Math.ceil(ry) + 1;
  for (let y = -ryi; y <= ryi; y++) {
    for (let x = -rxi; x <= rxi; x++) {
      const d = (x / rx) * (x / rx) + (y / ry) * (y / ry);
      if (d > 1.08 || d < 0.62) continue;
      plot(buf, Math.round(cx + x), Math.round(cy + y), color, kind, depth);
    }
  }
}

function drawGlasses(buf, key, upper) {
  if (key === "n" || key === "ne") return;
  const g = headGeom(key);
  const cy = g.cy + upper + 5.2;
  const frame = rgb(48, 36, 32);
  if (key === "e") {
    ring(buf, g.cx + 3.6, cy, 3.4, 2.8, frame, "glasses", 56);
    return;
  }
  const wide = 6.0;
  ring(buf, g.cx - wide, cy, 3.6, 2.9, frame, "glasses", 56);
  ring(buf, g.cx + wide, cy, 3.6, 2.9, frame, "glasses", 56);
  rect(buf, g.cx - 2, cy, g.cx + 2, cy, frame, "glasses", 56);
}

function drawHeadphones(buf, av, key, pal, upper) {
  const g = headGeom(key);
  const cy = g.cy + upper;
  const acc = pal.acc;
  ellipse(buf, g.cx, cy - 9, 8, 3.2, acc, "hp-band", 58);
  if (key !== "e") {
    circle(buf, g.cx - g.rx + 1, cy + 1, 3.4, acc, "hp-cup", 58);
    circle(buf, g.cx + g.rx - 1, cy + 1, 3.4, acc, "hp-cup", 58);
  } else {
    circle(buf, g.cx - 2, cy + 0.5, 3.4, acc, "hp-cup", 58);
  }
}

/* Body / clothes / limbs */
function torsoBox(key, sit) {
  // Short stubby torso under the big head.
  const y0 = 29 + (sit ? 0 : 0);
  if (key === "e") return { cx: 25, y0, hw: 6.2, h: 13 };
  if (key === "se") return { cx: 22.4, y0, hw: 7.2, h: 13 };
  if (key === "ne") return { cx: 23.8, y0, hw: 7.4, h: 13 };
  return { cx: 24, y0, hw: 8.0, h: 13 };
}

function drawTorso(buf, av, key, pal, upper, sit) {
  const t = torsoBox(key, sit);
  const y0 = t.y0 + upper;
  // Neck
  rect(buf, t.cx - 2.2, y0 - 2, t.cx + 2.2, y0 + 2, pal.skin, "neck", 20, 1);
  // Skin torso (in case sleeves/neckline show)
  ellipse(buf, t.cx, y0 + t.h * 0.42, t.hw, t.h * 0.62, pal.skin, "skin-body", 18);
  // Shirt / hoodie / jacket
  const topPal = pal.shirt;
  ellipse(buf, t.cx, y0 + t.h * 0.45, t.hw + 0.6, t.h * 0.66, topPal, "top", 22);
  if (av.top === "hoodie") {
    // Hood ring and pouch
    ellipse(buf, t.cx, y0 + 1.5, t.hw * 0.95, 3.5, topPal, "hood", 24);
    ellipse(buf, t.cx, y0 + t.h * 0.7, t.hw * 0.7, 3.2, { hi: topPal.sh, mid: topPal.sh, sh: mix(topPal.sh, INK, 0.2) }, "pouch", 24);
  }
  if (av.top === "jacket") {
    // Open placket down the center
    if (key !== "n") {
      rect(buf, t.cx - 1, y0 + 1, t.cx + 1, y0 + t.h - 1, pal.skin, "placket", 25);
      rect(buf, t.cx - 1.8, y0 + 1, t.cx - 0.6, y0 + t.h - 1, topPal.sh, "lapel", 26);
      rect(buf, t.cx + 0.6, y0 + 1, t.cx + 1.8, y0 + t.h - 1, topPal.sh, "lapel", 26);
    }
    ellipse(buf, t.cx, y0 + 1, t.hw + 0.4, 2.8, topPal, "collar", 26);
  }
  if (av.top === "bandtee") {
    const gx = key === "e" ? t.cx + 2 : t.cx;
    ellipse(buf, gx, y0 + 6, 3.2, 3.2, pal.gold, "graphic", 26);
  }
  if (av.accessory === "chain" && key !== "n") {
    ellipse(buf, t.cx, y0 + 3, 3.5, 2.2, pal.gold, "chain", 27);
  }
  if (av.accessory === "belt") {
    rect(buf, t.cx - t.hw, y0 + t.h - 2, t.cx + t.hw, y0 + t.h, pal.gold, "belt", 27);
  }
}

function drawLegs(buf, av, key, pal, pose) {
  const sit = pose.sit;
  const t = torsoBox(key, sit);
  const hipY = t.y0 + t.h - 1;
  const ground = AV_GROUND_Y;
  const shorts = av.bottom === "shorts";
  const pants = pal.pants;
  if (sit) {
    // Tucked stubby legs, feet still near the ground.
    if (key === "e") {
      capsule(buf, t.cx, hipY, t.cx + 10, hipY + 4, 3.2, pants, "pants", 12);
      ellipse(buf, t.cx + 13, ground - 2, 5, 3.2, pal.shoe, "shoe", 14);
      ellipse(buf, t.cx + 13, ground, 5, 1.6, pal.sole, "sole", 13);
    } else {
      capsule(buf, t.cx - 5, hipY, t.cx - 8, hipY + 6, 3.4, pants, "pants", 12);
      capsule(buf, t.cx + 5, hipY, t.cx + 8, hipY + 6, 3.4, pants, "pants", 12);
      ellipse(buf, t.cx - 9, ground - 2, 5, 3.2, pal.shoe, "shoe", 14);
      ellipse(buf, t.cx + 9, ground - 2, 5, 3.2, pal.shoe, "shoe", 14);
      ellipse(buf, t.cx - 9, ground, 5, 1.6, pal.sole, "sole", 13);
      ellipse(buf, t.cx + 9, ground, 5, 1.6, pal.sole, "sole", 13);
    }
    return;
  }
  const L = pose.left, R = pose.right;
  function leg(side, foot) {
    const hipX = t.cx + side * (key === "e" ? 1.5 : 4.2);
    const footX = hipX + foot.dx;
    const footY = ground - foot.lift;
    const midY = (hipY + footY) / 2 + 1;
    const pantR = 3.3;
    const pantEnd = shorts ? hipY + 6 : footY - 5;
    if (shorts) capsule(buf, hipX, pantEnd, footX, footY - 5, 2.5, pal.skin, "leg", 9);
    capsule(buf, hipX, hipY, hipX + foot.dx * 0.35, pantEnd, pantR, pants, "pants", 10);
    if (av.bottom === "cargo" && !shorts) {
      ellipse(buf, hipX + side * 2.2, hipY + 6, 2.4, 2.2, pants, "cargo", 11);
    }
    if (av.bottom === "joggers") {
      ellipse(buf, footX, footY - 5.5, 3.2, 2, pants, "cuff", 11);
    }
    // Chunky boot / sneaker
    ellipse(buf, footX, footY - 2.2, 5.2, 3.4, pal.shoe, "shoe", 14);
    ellipse(buf, footX + (key === "e" ? 1.5 : 0), footY - 0.2, 5.4, 1.8, pal.sole, "sole", 13);
    if (av.shoes === "skate") {
      rect(buf, footX - 2, footY - 3, footX + 2, footY - 2, pal.gold, "shoe-stripe", 15);
    }
  }
  // Far leg first
  if (key === "e") {
    leg(0, R);
    // Near-side single visible leg mostly; still draw both slightly offset
    leg(0.2, L);
  } else {
    leg(-1, L);
    leg(1, R);
  }
}

function drawArms(buf, av, key, pal, upper, pose) {
  const t = torsoBox(key, pose.sit);
  const y0 = t.y0 + upper;
  const long = av.top === "hoodie" || av.top === "jacket";
  const sleevePal = pal.shirt;
  const skin = pal.skin;
  function arm(side, kind, near) {
    const sx = t.cx + side * (key === "e" ? 3 : t.hw - 0.5);
    const sy = y0 + 3;
    let ex = sx + side * 5, ey = sy + (long ? 13 : 11);
    let hand = { x: ex, y: ey };
    if (kind === "wave" || kind === "cheer") {
      ex = sx + side * 2;
      ey = y0 - 8;
      hand = { x: ex + side, y: ey - 2 };
    } else if (kind === "dance") {
      ex = sx + side * 3;
      ey = y0 - 6 + (side > 0 ? -2 : 1);
      hand = { x: ex, y: ey - 1 };
    } else if (kind === "phone" || kind.startsWith("phone")) {
      ex = t.cx + (key === "e" ? 6 : 5);
      ey = y0 + 2;
      hand = { x: ex + 1, y: ey + 2 };
    } else if (kind === "hold" || kind === "punch") {
      ex = t.cx + side * 6;
      ey = y0 + 8;
      hand = { x: ex, y: ey };
    } else if (kind === "sit") {
      ex = sx + side * 4;
      ey = y0 + 10;
      hand = { x: ex, y: ey };
    } else if (kind === "clap") {
      ex = t.cx + side * 2;
      ey = y0 + 6;
      hand = { x: t.cx + side * 1.5, y: ey };
    } else if (kind === "shrug") {
      ex = sx + side * 7;
      ey = y0 + 1;
      hand = { x: ex, y: ey };
    } else if (typeof pose.armSwing === "number") {
      ex = sx + side * (4 + pose.armSwing * side);
      ey = sy + 11 - Math.abs(pose.armSwing);
      hand = { x: ex, y: ey + 1 };
    }
    const depth = near ? 30 : 8;
    // Sleeve
    const midX = (sx + hand.x) / 2, midY = (sy + hand.y) / 2;
    capsule(buf, sx, sy, long ? hand.x : midX, long ? (hand.y + midY) / 2 : midY, 3.6, sleevePal, "sleeve", depth);
    if (!long) capsule(buf, midX, midY, hand.x, hand.y, 3.0, skin, "arm", depth + 1);
    // Mitten hand
    circle(buf, hand.x, hand.y, 3.5, skin, "hand", depth + 2);
    if (av.accessory === "wristband" && near) {
      circle(buf, (hand.x + sx) / 2, (hand.y + sy) / 2 + 2, 2.2, pal.gold, "wrist", depth + 3);
    }
    return hand;
  }

  const aKind = pose.armKind || "idle";
  const oneHanded = aKind === "wave" || aKind.startsWith("phone") || aKind === "hold" || aKind === "punch";
  if (key === "e") {
    const hand = arm(1, aKind, true);
    return { near: hand };
  }
  const farKind = oneHanded ? "idle" : (aKind === "dance" || aKind === "cheer" || aKind === "clap" || aKind === "shrug" ? aKind : "idle");
  arm(-1, farKind, false);
  const near = arm(1, aKind, true);
  return { near };
}

function drawProp(buf, flags, hand, key, pose) {
  if (!hand) return;
  const held = flags.heldItem?.kind || flags.heldProp || (typeof flags.heldItem === "string" ? flags.heldItem : "");
  if (pose.armKind && String(pose.armKind).startsWith("phone") || flags.usingPhone) {
    const pal = tones("#3a3430");
    rect(buf, hand.x - 1, hand.y - 6, hand.x + 3, hand.y + 1, pal, "phone", 60, 1);
    const screen = rgb(160, 196, 170);
    rect(buf, hand.x - 0, hand.y - 5, hand.x + 2, hand.y - 1, screen, "phone-screen", 61);
    return;
  }
  if (!held) return;
  if (held === "soda" || held === "coffee" || held === "drink" || held === "mug") {
    const cup = held === "coffee" || held === "mug" ? tones("#6a4030", true) : tones("#8a2e2a");
    rect(buf, hand.x - 1, hand.y - 5, hand.x + 2, hand.y + 1, cup, "cup", 60, 1);
  }
}

function walkPose(frame, walking, sit) {
  if (sit) return { sit: true, left: { dx: 0, lift: 0 }, right: { dx: 0, lift: 0 }, armKind: "sit", armSwing: 0 };
  if (!walking) return { sit: false, left: { dx: 0, lift: 0 }, right: { dx: 0, lift: 0 }, armSwing: 0 };
  const f = ((frame % 8) + 8) % 8;
  // Bouncy chibi walk; at least one sole stays at lift 0.
  const table = [
    { left: { dx: 3, lift: 0 }, right: { dx: -2, lift: 0 }, bob: 0, armSwing: 2 },
    { left: { dx: 4, lift: 0 }, right: { dx: -2, lift: 3 }, bob: -2, armSwing: 3 },
    { left: { dx: 3, lift: 0 }, right: { dx: -1, lift: 1 }, bob: -1, armSwing: 2 },
    { left: { dx: 1, lift: 0 }, right: { dx: 1, lift: 0 }, bob: 0, armSwing: 0 },
    { left: { dx: -2, lift: 0 }, right: { dx: 3, lift: 0 }, bob: 0, armSwing: -2 },
    { left: { dx: -2, lift: 3 }, right: { dx: 4, lift: 0 }, bob: -2, armSwing: -3 },
    { left: { dx: -1, lift: 1 }, right: { dx: 3, lift: 0 }, bob: -1, armSwing: -2 },
    { left: { dx: 1, lift: 0 }, right: { dx: 1, lift: 0 }, bob: 0, armSwing: 0 },
  ];
  return { sit: false, ...table[f] };
}

function armKindFromFlags(flags, frame) {
  if (flags.sitting) return "sit";
  if (flags.actionEmote === "wave") return "wave";
  if (flags.actionEmote === "dance" || flags.actionEmote === "cheer") return "dance";
  if (flags.actionEmote === "clap") return "clap";
  if (flags.actionEmote === "shrug") return "shrug";
  if (flags.boxing) return "punch";
  if (flags.usingPhone) return (frame % 3 === 1) ? "phone1" : "phone";
  const held = flags.heldItem?.kind || flags.heldItem || flags.heldProp;
  if (held) return "hold";
  if (flags.gym) return "hold";
  if (flags.walking) return "walk";
  return "idle";
}

function composeAvatar(av, flags, frame) {
  const dir = (flags.walking && (flags.dirX || flags.dirY))
    ? facingIndex8(null, flags.dirX, flags.dirY)
    : facingIndex8(flags.facing, flags.dirX, flags.dirY);
  const { key, flip } = viewOfDir(dir);
  const pal = buildPalette(av);
  const sit = Boolean(flags.sitting);
  const walk = Boolean(flags.walking) && !sit;
  const pose = walkPose(frame, walk, sit);
  pose.armKind = armKindFromFlags(flags, frame);
  // Idle breathing: upper body only, feet stay planted.
  const breathe = (!walk && !sit) ? ((frame % 16) < 8 ? 0 : -1) : 0;
  const bob = walk ? (pose.bob || 0) : 0;
  const upper = sit ? AV_SEAT_DROP : (bob + breathe);
  const emote = flags.actionEmote || "";

  let buf = makeBuf();
  const hatOn = av.accessory === "cap" || av.accessory === "beanie" || av.accessory === "trucker";

  // Far hair (long back strands) before body for back views? Draw body first, hair later covers head.
  drawLegs(buf, av, key, pal, pose);
  drawTorso(buf, av, key, pal, upper, sit);
  const hands = drawArms(buf, av, key, pal, upper, pose);
  if (key === "n" || key === "ne") {
    drawHair(buf, av, key, pal, upper, hatOn);
    drawHead(buf, key, pal, upper, emote);
    // Hair cap over the back of the head
    drawHair(buf, av, key, pal, upper, hatOn);
  } else {
    drawHead(buf, key, pal, upper, emote);
    drawHair(buf, av, key, pal, upper, hatOn);
    clearFaceWindow(buf, key, pal, upper);
    drawFace(buf, key, pal, upper, emote);
  }
  if (av.glasses) drawGlasses(buf, key, upper);
  if (hatOn) drawHat(buf, av, key, pal, upper);
  if (av.accessory === "headphones") drawHeadphones(buf, av, key, pal, upper);
  if (emote === "heart") {
    const g = headGeom(key);
    ellipse(buf, g.cx + 8, g.cy + upper - 8, 2, 2, rgb(180, 70, 70), "heart", 70);
    ellipse(buf, g.cx + 11, g.cy + upper - 8, 2, 2, rgb(180, 70, 70), "heart", 70);
  }
  drawProp(buf, flags, hands && hands.near, key, pose);

  if (flip) buf = flipBuf(buf, true);
  buf = plantOnGround(buf);
  buf = addInkOutline(buf);
  buf = addStickerOutline(buf);
  return buf;
}

function bufToCanvas(buf) {
  const c = document.createElement("canvas");
  c.width = AV_W;
  c.height = AV_H;
  const ctx = c.getContext("2d");
  ctx.imageSmoothingEnabled = false;
  const img = ctx.createImageData(AV_W, AV_H);
  for (let i = 0; i < buf.length; i++) {
    const p = buf[i];
    if (!p) continue;
    const o = i * 4;
    img.data[o] = p.color.r;
    img.data[o + 1] = p.color.g;
    img.data[o + 2] = p.color.b;
    img.data[o + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  ctx.globalCompositeOperation = "destination-over";
  ctx.fillStyle = "rgba(28, 16, 12, 0.32)";
  ctx.beginPath();
  ctx.ellipse(AV_W / 2, AV_GROUND_Y + 1.3, 11, 2.3, 0, 0, Math.PI * 2);
  ctx.fill();
  return { c, w: AV_W, h: AV_H };
}

const cache = new Map();

export function drawAvatarSprite(avatar = {}, flags = {}, frame = 0) {
  const av = normalizeAvatar(avatar);
  const walk = Boolean(flags.walking) && !flags.sitting;
  const dir = (walk && (flags.dirX || flags.dirY))
    ? facingIndex8(null, flags.dirX, flags.dirY)
    : facingIndex8(flags.facing, flags.dirX, flags.dirY);
  const held = flags.heldItem?.kind || flags.heldProp || (typeof flags.heldItem === "string" ? flags.heldItem : "");
  const phase = walk ? (frame % 8) : (flags.usingPhone ? (frame % 3) : (frame % 16));
  const key = "chibi:" + JSON.stringify(av) + ":" + dir + ":" + Boolean(flags.sitting) + ":" + walk + ":" + phase + ":" + Boolean(flags.usingPhone) + ":" + Boolean(flags.boxing) + ":" + (flags.actionEmote || "") + ":" + held + ":" + Boolean(flags.gym);
  const hit = cache.get(key);
  if (hit) return hit;
  const spr = bufToCanvas(composeAvatar(av, flags, frame));
  cache.set(key, spr);
  return spr;
}

export const AVATAR_SHEET_LOOKS = [
  { label: "spiky blond", skin: "#f0c9a8", hair: "spiky", hairColor: "#e6d3a4", shirt: "#c45c4a", top: "tshirt", bottom: "jeans", bottomColor: "#3d4f7c", shoes: "white", accessory: "none" },
  { label: "emo fringe", skin: "#e6b589", hair: "bangs", hairColor: "#2a2422", shirt: "#3a3634", top: "jacket", bottom: "jeans", bottomColor: "#2a2624", shoes: "black", accessory: "headphones", headphoneColor: "#3a3634" },
  { label: "afro", skin: "#8d5524", hair: "curly", hairColor: "#2b1d16", shirt: "#6a8a5a", top: "hoodie", bottom: "joggers", bottomColor: "#3a3634", shoes: "red", accessory: "chain" },
  { label: "purple buns", skin: "#c8894e", hair: "bun", hairColor: "#6a4a70", shirt: "#c47a8a", top: "hoodie", bottom: "jeans", bottomColor: "#3d4f7c", shoes: "gum", accessory: "none" },
  { label: "wild grey", skin: "#d8a56a", hair: "spiky", hairColor: "#8a8490", shirt: "#5a6a9a", top: "jacket", bottom: "cargo", bottomColor: "#4a4a42", shoes: "white", accessory: "none", glasses: true },
  { label: "long dark", skin: "#e6b589", hair: "long", hairColor: "#2b1d16", shirt: "#5c4d7d", top: "jacket", bottom: "jeans", bottomColor: "#2a2624", shoes: "black", glasses: true },
  { label: "band tee", skin: "#e6b589", hair: "spiky", hairColor: "#2b1d16", shirt: "#3a3634", top: "bandtee", bottom: "shorts", bottomColor: "#b89a5a", shoes: "skate", accessory: "trucker", headphoneColor: "#6a4030" },
  { label: "undercut", skin: "#c8894e", hair: "undercut", hairColor: "#2b1d16", shirt: "#4a5a4a", top: "hoodie", bottom: "cargo", bottomColor: "#6b7280", shoes: "skate", accessory: "wristband" },
];

export function paintAvatarSheet(canvas, looks, scale = 4) {
  looks = looks && looks.length ? looks : AVATAR_SHEET_LOOKS;
  const dirs = [
    { d: 1, label: "Front" },
    { d: 0, label: "3/4" },
    { d: 7, label: "Side" },
    { d: 5, label: "Back" },
  ];
  const pad = 16, cap = 18, gap = 14;
  const cw = AV_W * scale, ch = AV_H * scale;
  const cols = dirs.length;
  const rows = looks.length;
  canvas.width = pad * 2 + cols * cw + (cols - 1) * gap + 80;
  canvas.height = pad * 2 + rows * (ch + cap) + (rows - 1) * gap + 8;
  const ctx = canvas.getContext("2d");
  ctx.imageSmoothingEnabled = false;
  ctx.fillStyle = "#f4efe4";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.font = "12px Verdana, sans-serif";
  looks.forEach((look, r) => {
    const y = pad + r * (ch + cap + gap);
    ctx.fillStyle = "#2a1c16";
    ctx.fillText(look.label || "", 8, y + 14);
    dirs.forEach((dir, c) => {
      const x = pad + 80 + c * (cw + gap);
      const spr = drawAvatarSprite(look, { facing: { x: Math.cos(dir.d * Math.PI / 4), z: Math.sin(dir.d * Math.PI / 4) } }, 0);
      ctx.drawImage(spr.c, 0, 0, spr.w, spr.h, x, y, cw, ch);
      if (r === 0) {
        ctx.fillStyle = "#2a1c16";
        ctx.fillText(dir.label, x + cw / 2 - 14, y - 4);
      }
    });
  });
}

export function paintStoreThumb(canvas, kind, item, base) {
  const w = canvas.width = canvas.width || 48, h = canvas.height = canvas.height || 48;
  const ctx = canvas.getContext("2d");
  ctx.imageSmoothingEnabled = false;
  ctx.fillStyle = "#efe6d4";
  ctx.fillRect(0, 0, w, h);
  if (kind === "pets") {
    const name = typeof item === "string" ? item : (item?.item || item?.kind || "cat");
    if (typeof window !== "undefined" && typeof window.__paintPetThumb === "function") {
      return window.__paintPetThumb(canvas, name);
    }
    return false;
  }
  const av = { ...(base || {}), ...(item || {}) };
  const spr = drawAvatarSprite(av, { facing: { x: 1, z: 1 } }, 0);
  const scale = Math.max(1, Math.floor(Math.min((w - 4) / spr.w, (h - 4) / spr.h)));
  const dw = spr.w * scale, dh = spr.h * scale;
  ctx.drawImage(spr.c, 0, 0, spr.w, spr.h, Math.floor((w - dw) / 2), Math.floor((h - dh) / 2) + 1, dw, dh);
  return true;
}

if (typeof window !== "undefined") {
  window.__paintAvatarSheet = paintAvatarSheet;
  window.__paintStoreThumb = paintStoreThumb;
  window.__drawAvatarSprite = drawAvatarSprite;
}

export default { drawAvatarSprite, paintAvatarSheet, paintStoreThumb, facingIndex8, AV_W, AV_H, AV_GROUND_Y, AV_HEAD_TOP, AVATAR_SHEET_LOOKS };
