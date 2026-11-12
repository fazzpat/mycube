/* Wizard outfit art and catalog. Drawn as overlays so avatar3d.js keeps
   ownership of the chibi, eyes, hair, and walk cycle. */
export const OUTFIT_TAB = "outfits";

export const OUTFIT_STOCK = [
  { id: "ow-wizard-hat", slot: "hat", kind: "clothes", label: "Wizard Hat", price: 16, item: { hat: "wizard", hatColor: "#4a5c78" } },
  { id: "ow-wizard-cloak", slot: "cloak", kind: "clothes", label: "Wizard Cloak", price: 22, item: { cloak: "wizard" } },
  { id: "ow-wizard-pants", slot: "pants", kind: "clothes", label: "Wizard Pants", price: 18, item: { outfitPants: "wizard" } },
  { id: "ow-wizard-staff", slot: "prop", kind: "prop", label: "Wizard Staff", price: 18, item: "wizardstaff" },
  { id: "ow-flame-ball", slot: "pet", kind: "pet", label: "Flame Ball", price: 28, item: "flame" },
];

export function outfitById(id) {
  return OUTFIT_STOCK.find((s) => s.id === id) || null;
}

export function wearingOutfit(avatar = {}, stock) {
  if (!stock) return false;
  const it = stock.item;
  if (stock.slot === "hat") return avatar.hat === "wizard";
  if (stock.slot === "cloak") return avatar.cloak === "wizard";
  if (stock.slot === "pants") return avatar.outfitPants === "wizard";
  return false;
}

export function applyOutfitItem(avatar = {}, item = {}) {
  return { ...avatar, ...item };
}

export function stripOutfitItem(avatar = {}, item = {}) {
  const a = { ...avatar };
  if (item.hat) {
    a.hat = "none";
    if (a.accessory === item.hat || a.accessory === "wizard") a.accessory = "none";
  }
  if (item.cloak) a.cloak = "none";
  if (item.outfitPants) a.outfitPants = "none";
  return a;
}

export function hasWizardGloves(av) {
  return av?.cloak === "wizard";
}

export function hasWizardBoots(av) {
  return av?.outfitPants === "wizard";
}

const AV_W = 72, AV_H = 72, AV_PAD_X = 12, AV_PAD_TOP = 8, AV_GROUND_Y = 69;

const HAT = { mid: rgb(74, 92, 120), hi: rgb(106, 124, 150), sh: rgb(47, 62, 86), ink: rgb(28, 36, 52) };
const CLOAK = { mid: rgb(36, 52, 76), hi: rgb(58, 76, 104), sh: rgb(22, 32, 48), ink: rgb(16, 22, 34) };
const TUNIC = { mid: rgb(110, 140, 170), hi: rgb(140, 166, 190), sh: rgb(78, 104, 132) };
const LEATHER = { mid: rgb(107, 66, 40), hi: rgb(138, 90, 56), sh: rgb(74, 44, 24) };
const BRASS = { mid: rgb(196, 160, 86), hi: rgb(224, 200, 130), sh: rgb(140, 108, 48) };
const WOOD = { mid: rgb(107, 63, 34), hi: rgb(138, 90, 50), sh: rgb(61, 36, 20) };
const CRYSTAL = { mid: rgb(90, 142, 200), hi: rgb(168, 208, 240), sh: rgb(46, 86, 140), glow: rgb(200, 230, 255) };

function rgb(r, g, b) { return { r, g, b }; }

function plot(buf, x, y, color, kind, depth = 30, w = AV_W, h = AV_H) {
  x = x | 0; y = y | 0;
  if (x < 0 || y < 0 || x >= w || y >= h || !color) return;
  const i = y * w + x;
  const cur = buf[i];
  if (cur && (cur.depth || 0) > depth) return;
  const c = color.mid ? color.mid : color;
  buf[i] = { color: c, kind, depth };
}

function felt(buf, x, y, pal, kind, depth, w, h) {
  // Sparse irregular flecks — muted felt, not a diagonal stripe.
  const on = (((x * 13 + y * 7) ^ (x * 5 - y * 3)) % 11 + 11) % 11 === 0;
  plot(buf, x, y, on ? pal.hi : pal.mid, kind, depth, w, h);
}

function fillEllipse(buf, cx, cy, rx, ry, pal, kind, depth, opts = {}) {
  const rxi = Math.ceil(rx) + 1, ryi = Math.ceil(ry) + 1;
  const dither = opts.dither;
  for (let y = -ryi; y <= ryi; y++) {
    for (let x = -rxi; x <= rxi; x++) {
      const d = (x / (rx || 1)) * (x / (rx || 1)) + (y / (ry || 1)) * (y / (ry || 1));
      if (d > 1) continue;
      const px = Math.round(cx + x), py = Math.round(cy + y);
      const col = d > 0.72 ? pal.sh : (dither ? null : pal.mid);
      if (dither) felt(buf, px, py, pal, kind, depth);
      else plot(buf, px, py, col || pal.mid, kind, depth);
    }
  }
}

function headGeom(key) {
  const ox = AV_PAD_X, oy = AV_PAD_TOP;
  if (key === "e") return { cx: 25 + ox, cy: 24.8 + oy, rx: 13.8, ry: 13.8 };
  if (key === "se") return { cx: 21.8 + ox, cy: 24.6 + oy, rx: 14.3, ry: 14.3 };
  if (key === "ne") return { cx: 23.6 + ox, cy: 24.6 + oy, rx: 14.4, ry: 14.4 };
  return { cx: 24 + ox, cy: 24.6 + oy, rx: 14.5, ry: 14.5 };
}

function torsoBox(key) {
  const y0 = 36 + AV_PAD_TOP, h = 16;
  if (key === "e") return { cx: 25 + AV_PAD_X, y0, hw: 10.8, h };
  if (key === "se") return { cx: 22.6 + AV_PAD_X, y0, hw: 12.0, h };
  if (key === "ne") return { cx: 23.8 + AV_PAD_X, y0, hw: 12.1, h };
  return { cx: 24 + AV_PAD_X, y0, hw: 12.8, h };
}

/** Pointy steel-blue felt hat, elliptical brim that reads as a circle in
    perspective, rounded crown base, and a clean sharp taper. A slight bend
    at the tip is ok. No stars. Stays above the eyes. */
export function drawOutfitHat(buf, av, key, upper = 0) {
  if (av?.hat !== "wizard") return;
  const g = headGeom(key);
  const cx = g.cx;
  const cy = g.cy + upper;
  const crown = cy - g.ry + 2.2;
  const brimCy = crown + 5.2;
  const faceTop = cy - 2; // keep brim/cone out of the eye window
  const back = key === "n" || key === "ne";
  // Circular brim in perspective: a proper ellipse, not a flat diamond or frown.
  const brimRx = g.rx * 1.38;
  const brimRy = 4.4;
  const rxi = Math.ceil(brimRx) + 1, ryi = Math.ceil(brimRy) + 1;
  for (let y = -ryi; y <= ryi; y++) {
    for (let x = -rxi; x <= rxi; x++) {
      const d = (x / brimRx) * (x / brimRx) + (y / brimRy) * (y / brimRy);
      if (d < 0.60 || d > 1.05) continue;
      const px = Math.round(cx + x);
      const py = Math.round(brimCy + y);
      if (!back && py >= faceTop && Math.abs(x) < brimRx * 0.55) continue;
      const edge = d > 0.92 || d < 0.70;
      felt(buf, px, py, edge ? HAT.sh : HAT, "hat-brim", y < 0 ? 54 : 55);
    }
  }
  // Rounded crown base sitting in the brim, then a sharp clean taper.
  const baseY = brimCy - 0.6;
  const baseR = g.rx * 0.72;
  fillEllipse(buf, cx, baseY, baseR, 2.6, HAT, "hat-base", 56);
  const bend = key === "e" ? 2.6 : back ? -1.8 : 2.2;
  const tipY = crown - 14;
  const tipX = cx + bend;
  for (let y = tipY; y <= baseY; y++) {
    const u = (y - tipY) / (baseY - tipY || 1);
    const wx = Math.max(0.5, Math.pow(u, 1.4) * baseR);
    const tipBlend = Math.max(0, 1 - u / 0.32);
    const mid = cx + bend * tipBlend * tipBlend;
    for (let x = Math.round(mid - wx); x <= Math.round(mid + wx); x++) {
      const edge = Math.abs(x - mid) >= wx - 0.65;
      felt(buf, x, Math.round(y), edge ? HAT.sh : HAT, "hat", 56);
    }
  }
  plot(buf, Math.round(tipX), Math.round(tipY + 1), HAT.sh, "hat", 57);
  plot(buf, Math.round(tipX), Math.round(tipY), HAT.hi, "hat", 57);
}

/** Tunic, belt, hooded cloak, and/or blue lower legs depending on equipped slots. */
export function drawOutfitBody(buf, av, key, upper = 0, sit = false) {
  const cloakOn = av?.cloak === "wizard";
  const pantsOn = av?.outfitPants === "wizard";
  if (!cloakOn && !pantsOn) return;
  const t = torsoBox(key);
  const y0 = t.y0 + upper;
  const h = t.h;
  const cx = t.cx;
  const back = key === "n" || key === "ne";
  const hemY = sit ? AV_GROUND_Y - 14 : AV_GROUND_Y - 3;
  const waist = y0 + h * 0.70;

  if (cloakOn) {
    // Lighter blue long tunic over the body, down past the bean hips.
    const tunicHem = Math.round(waist + 8);
    const tunW = t.hw + 0.6;
    for (let y = Math.round(y0 + 1); y <= tunicHem; y++) {
      const u = (y - y0) / (tunicHem - y0 || 1);
      const w = tunW + u * 1.2;
      for (let x = Math.round(cx - w); x <= Math.round(cx + w); x++) {
        felt(buf, x, y, TUNIC, "tunic", 29);
      }
    }
    // Brown leather belt + brass buckle.
    const by = Math.round(waist);
    for (let x = Math.round(cx - tunW - 0.5); x <= Math.round(cx + tunW + 0.5); x++) {
      plot(buf, x, by - 1, LEATHER.hi, "belt", 32);
      plot(buf, x, by, LEATHER.mid, "belt", 32);
      plot(buf, x, by + 1, LEATHER.sh, "belt", 32);
    }
    if (!back) {
      const bx = Math.round(cx - 3);
      plot(buf, bx, by, BRASS.hi, "buckle", 33);
      plot(buf, bx - 1, by, BRASS.mid, "buckle", 33);
      plot(buf, bx + 1, by, BRASS.mid, "buckle", 33);
      plot(buf, bx, by - 1, BRASS.mid, "buckle", 33);
      plot(buf, bx, by + 1, BRASS.sh, "buckle", 33);
    }

    // Tailored cloak: hug the bean/shoulder silhouette, slight taper through
    // the torso, and a gentle flare only at the hem — no rectangular slab.
    const throatY = Math.round(y0 + 1);
    const shoulderW = t.hw + 0.7;
    const midBody = y0 + h * 0.50;
    const bodyRy = h * 0.50;
    for (let y = throatY; y <= hemY; y++) {
      const u = (y - throatY) / (hemY - throatY || 1);
      let bodyHalf;
      const ny = (y - midBody) / (bodyRy || 1);
      if (y <= y0 + h + 1 && ny * ny < 1) {
        bodyHalf = t.hw * Math.sqrt(Math.max(0, 1 - ny * ny));
      } else if (y < midBody) {
        bodyHalf = t.hw * 0.55;
      } else {
        bodyHalf = t.hw * 0.62;
      }
      let spread = Math.max(bodyHalf + 0.8, shoulderW * 0.72);
      if (u < 0.22) spread = Math.max(spread, shoulderW - u * 1.2);
      if (u > 0.68) {
        const v = (u - 0.68) / 0.32;
        spread = (t.hw * 0.62 + 0.8) + v * v * (back ? 3.0 : 2.2);
      }
      const open = (!back && y > waist + 2) ? 3.0 + u * 1.2 : 0; // front split below the clasp
      for (let x = Math.round(cx - spread); x <= Math.round(cx + spread); x++) {
        if (open && Math.abs(x - cx) < open && y > throatY + 4) continue;
        // Leave the central tunic visible on the front upper body.
        if (!back && y < tunicHem && Math.abs(x - cx) < tunW + 0.2 && y > throatY + 3) continue;
        felt(buf, x, y, Math.abs(x - cx) > spread - 1.2 ? CLOAK.sh : CLOAK, "cloak", 20);
      }
    }
    // Closed throat / clasp.
    fillEllipse(buf, cx, throatY + 1.2, 3.2, 2.0, CLOAK, "clasp", 34);
    if (!back) {
      plot(buf, Math.round(cx), throatY + 1, BRASS.mid, "clasp", 35);
      plot(buf, Math.round(cx), throatY + 2, BRASS.sh, "clasp", 35);
    }
    // Hood resting behind the neck (not over the face), readable at the nape.
    const hoodY = y0 + (back ? 2.2 : 3.4);
    const hoodX = back ? cx : cx + (key === "e" ? -6.2 : 0);
    const hoodRx = back ? t.hw + 4.0 : (key === "e" ? 5.0 : 6.2);
    const hoodRy = back ? 4.8 : 3.2;
    fillEllipse(buf, hoodX, hoodY, hoodRx, hoodRy, CLOAK, "hood", 21, { dither: true });
    if (back) {
      fillEllipse(buf, cx, hoodY + 1.2, hoodRx * 0.62, 2.6, CLOAK.sh, "hood-in", 22);
      // Folded edge of the cowl sitting on the shoulders.
      for (let x = Math.round(cx - hoodRx + 1); x <= Math.round(cx + hoodRx - 1); x++) {
        plot(buf, x, Math.round(hoodY + hoodRy - 0.4), CLOAK.hi, "hood-edge", 23);
      }
    } else if (key !== "e") {
      // Small hood peek at the sides of the neck on front views.
      fillEllipse(buf, cx - t.hw + 0.2, hoodY, 2.8, 2.8, CLOAK, "hood", 21, { dither: true });
      fillEllipse(buf, cx + t.hw - 0.2, hoodY, 2.8, 2.8, CLOAK, "hood", 21, { dither: true });
    }
  }

  if (pantsOn) {
    // Blue lower legs under / below the tunic hem, down to the boot tops.
    const bootTop = sit ? AV_GROUND_Y - 10 : AV_GROUND_Y - 12;
    const legTop = cloakOn ? Math.round(waist + 8) : Math.round(y0 + h * 0.58);
    const stance = key === "e" ? 3.2 : 5.0;
    for (const side of key === "e" ? [1] : [-1, 1]) {
      const lx = cx + side * stance * (key === "e" ? 0.2 : 1);
      const lw = key === "e" ? 4.2 : 3.6;
      for (let y = legTop; y < bootTop; y++) {
        for (let x = Math.round(lx - lw); x <= Math.round(lx + lw); x++) {
          felt(buf, x, y, TUNIC, "wiz-pants", 30);
        }
      }
    }
  }
}

export function drawOutfitGlove(buf, x, y, side = 1) {
  const r = 3.15;
  fillEllipse(buf, x, y, r, r, LEATHER, "glove", 40);
  fillEllipse(buf, x + (side >= 0 ? 0.8 : -0.8), y - 1.5, 1.4, 1.5, LEATHER, "glove-thumb", 41);
  plot(buf, Math.round(x), Math.round(y - 1.4), LEATHER.hi, "glove-hi", 42);
}

export function drawOutfitBoot(buf, x, y, key, side, sit = false) {
  // Tall brown leather boot; y is the sole. Shaft goes well up the shin.
  const shaft = sit ? 7.2 : 11;
  const toe = sit ? 4.4 : 6.2;
  const dir = (key === "e") ? (side >= 0 ? 1 : 1) : 0;
  const toeX = key === "e" ? (side >= 0 ? toe : -toe * 0.2) : 0;
  // Shaft
  for (let i = 0; i <= shaft; i++) {
    const w = 2.4 + (i < 2 ? 0.8 : 0) + (i / shaft) * 0.6;
    for (let dx = -w; dx <= w; dx++) {
      const col = i > shaft - 2 ? LEATHER.sh : ((Math.round(x + dx) + Math.round(y - i)) % 5 === 0 ? LEATHER.hi : LEATHER.mid);
      plot(buf, Math.round(x + dx), Math.round(y - i), col, "boot", 36);
    }
  }
  // Toe
  if (key === "e") {
    fillEllipse(buf, x + (side >= 0 ? 3.2 : -1.2), y - 1.2, 3.4, 2.0, LEATHER, "boot-toe", 37);
  } else {
    fillEllipse(buf, x, y - 0.8, 3.6, 1.8, LEATHER, "boot-toe", 37);
  }
  // Sole
  for (let dx = -3; dx <= 3 + (key === "e" ? 2 : 0); dx++) {
    plot(buf, Math.round(x + dx + (key === "e" && side >= 0 ? 1 : 0)), Math.round(y + 1), LEATHER.sh, "boot-sole", 38);
  }
  // Highlight wrinkle
  plot(buf, Math.round(x - 1), Math.round(y - 4), LEATHER.hi, "boot-hi", 39);
}

/** Sprite-space x for a vertical staff held beside the body, clear of the head. */
export function staffSideX(hand, key = "s", box) {
  const t = box || torsoBox(key);
  const g = headGeom(key);
  const cx = t.cx;
  const side = (hand && Number.isFinite(hand.x) && hand.x < cx) ? -1 : 1;
  const need = Math.max((t.hw || 12) + 4.2, (g.rx || 14) + 3.4);
  return Math.max(5, Math.min(AV_W - 6, Math.round(cx + side * need)));
}

/** Park the gripping hand at hip/waist height on the staff, beside the body. */
export function placeStaffHand(hand, key, box) {
  if (!hand) return hand;
  const t = box || torsoBox(key);
  const x = staffSideX(hand, key, t);
  const hip = (t.y0 || 44) + (t.h || 16) * 0.86;
  const y = Number.isFinite(hand.y) ? hand.y : hip;
  return { ...hand, x, y };
}

/** Tall gnarled staff with a pointed blue crystal, held vertically at the side. */
export function drawWizardStaff(buf, hand, key = "s", box) {
  if (!hand) return;
  const t = box || torsoBox(key);
  const hx = staffSideX(hand, key, t);
  const hy = hand.y;
  const top = 3;
  const bot = AV_GROUND_Y;
  // Nearly vertical shaft — knots for a gnarled look, not a lean across the body.
  for (let y = top + 8; y <= bot; y++) {
    const thick = y > bot - 4 ? 2 : 1;
    const knot = Math.sin(y * 0.55) * 0.35;
    const x = Math.round(hx + knot);
    for (let dx = -thick; dx <= thick; dx++) {
      const col = dx < 0 ? WOOD.sh : (dx > 0 ? WOOD.hi : WOOD.mid);
      plot(buf, x + dx, y, col, "staff", 28);
    }
    if (y % 11 === 3) plot(buf, x + 1, y, WOOD.sh, "staff-knot", 28);
  }
  // Grip at hip / waist height
  for (let y = Math.round(hy - 2); y <= Math.round(hy + 2); y++) {
    plot(buf, Math.round(hx - 1), y, WOOD.sh, "staff", 29);
    plot(buf, Math.round(hx + 1), y, WOOD.hi, "staff", 29);
  }
  // Pointed blue crystal above the shoulder/head, beside the head.
  const cx = hx;
  const cy = top + 8;
  for (let i = 0; i < 9; i++) {
    const w = i < 3 ? i : (8 - i) * 0.7;
    for (let dx = Math.round(-w); dx <= Math.round(w); dx++) {
      const col = i < 3 ? CRYSTAL.hi : (Math.abs(dx) > w - 1 ? CRYSTAL.sh : CRYSTAL.mid);
      plot(buf, cx + dx, cy - 8 + i, col, "crystal", 58);
    }
  }
  // Soft glow
  plot(buf, cx, cy - 8, CRYSTAL.glow, "crystal-glow", 59);
  plot(buf, cx, cy - 5, CRYSTAL.hi, "crystal-glow", 59);
  plot(buf, cx - 2, cy - 4, CRYSTAL.glow, "crystal-glow", 57);
  plot(buf, cx + 2, cy - 4, CRYSTAL.glow, "crystal-glow", 57);
  plot(buf, cx - 1, cy - 7, CRYSTAL.glow, "crystal-glow", 56);
  plot(buf, cx + 1, cy - 6, CRYSTAL.glow, "crystal-glow", 56);
}

export function shouldDrawStaff(flags, av, key) {
  if (flags?.lying) return false;
  const prop = flags?.heldProp;
  if (prop !== "wizardstaff") return false;
  const food = flags?.heldItem?.kind || (typeof flags?.heldItem === "string" ? flags.heldItem : null);
  if (food) return false; // fridge/coffee items stow the staff
  if (flags?.usingPhone) return false;
  const k = key || flags?.sipKey || "";
  if ((k === "n" || k === "ne") && (Number(flags?.sipLift) || 0) > 0.25) return false;
  return true;
}

export function installOutfitDraw(setOutfitDraw) {
  if (typeof setOutfitDraw !== "function") return;
  setOutfitDraw({
    drawHat: drawOutfitHat,
    drawBody: drawOutfitBody,
    hasGloves: hasWizardGloves,
    drawGlove: drawOutfitGlove,
    hasBoots: hasWizardBoots,
    drawBoot: drawOutfitBoot,
    shouldDrawStaff,
    placeStaffHand,
    drawStaff: drawWizardStaff,
  });
}

function makeCanvas(w, h) {
  if (typeof document !== "undefined") {
    const c = document.createElement("canvas");
    c.width = w; c.height = h;
    return c;
  }
  try {
    const { createCanvas } = require("canvas");
    return createCanvas(w, h);
  } catch {
    return null;
  }
}

export function paintOutfitThumb(canvas, stock, avatar = {}) {
  if (!canvas || !stock) return false;
  const w = canvas.width || 56, h = canvas.height || 56;
  if (!canvas.width) canvas.width = w;
  if (!canvas.height) canvas.height = h;
  const ctx = canvas.getContext?.("2d");
  if (!ctx) return false;
  ctx.imageSmoothingEnabled = false;
  ctx.fillStyle = "#efe6d4";
  ctx.fillRect(0, 0, w, h);
  const buf = new Array(AV_W * AV_H).fill(null);
  if (stock.slot === "hat") {
    drawOutfitHat(buf, { hat: "wizard" }, "s", 0);
  } else if (stock.slot === "cloak") {
    drawOutfitBody(buf, { cloak: "wizard" }, "s", 0, false);
  } else if (stock.slot === "pants") {
    drawOutfitBody(buf, { outfitPants: "wizard" }, "s", 0, false);
    drawOutfitBoot(buf, 31, AV_GROUND_Y, "s", -1, false);
    drawOutfitBoot(buf, 41, AV_GROUND_Y, "s", 1, false);
  } else if (stock.slot === "prop") {
    drawWizardStaff(buf, { x: 36, y: 42 }, "s");
  } else {
    return false;
  }
  const img = ctx.createImageData(AV_W, AV_H);
  let x0 = AV_W, y0 = AV_H, x1 = 0, y1 = 0, any = false;
  for (let i = 0; i < buf.length; i++) {
    const p = buf[i];
    if (!p) continue;
    any = true;
    const x = i % AV_W, y = (i / AV_W) | 0;
    if (x < x0) x0 = x; if (y < y0) y0 = y;
    if (x > x1) x1 = x; if (y > y1) y1 = y;
    const o = i * 4, c = p.color;
    img.data[o] = c.r; img.data[o + 1] = c.g; img.data[o + 2] = c.b; img.data[o + 3] = 255;
  }
  if (!any) return false;
  const tmp = makeCanvas(AV_W, AV_H);
  if (!tmp) return false;
  tmp.getContext("2d").putImageData(img, 0, 0);
  const pad = 3;
  const sw = x1 - x0 + 1, sh = y1 - y0 + 1;
  const sc = Math.max(1, Math.floor(Math.min((w - pad * 2) / sw, (h - pad * 2) / sh)));
  const dw = sw * sc, dh = sh * sc;
  ctx.drawImage(tmp, x0, y0, sw, sh, Math.floor((w - dw) / 2), Math.floor((h - dh) / 2), dw, dh);
  return true;
}

if (typeof window !== "undefined") {
  window.__OUTFIT_STOCK = OUTFIT_STOCK;
  window.__paintOutfitThumb = paintOutfitThumb;
}

export default {
  OUTFIT_STOCK, outfitById, wearingOutfit, applyOutfitItem, stripOutfitItem,
  drawOutfitHat, drawOutfitBody, drawOutfitGlove, drawOutfitBoot, drawWizardStaff,
  installOutfitDraw, paintOutfitThumb, shouldDrawStaff, placeStaffHand, staffSideX,
  hasWizardGloves, hasWizardBoots,
};
