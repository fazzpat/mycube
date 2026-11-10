/* 2D isometric pixel room renderer — original cyberpunk art, HouseRoom3D API. */
const TW = 32;
const TH = 16;
const WALL_H = 44;
const AV_W = 24;
const AV_H = 40;
const FOLLOW_ZOOM_DEFAULT = 2;
const ZOOMS = [1, 2, 3];

function isPhoneView() {
  if (typeof window === "undefined") return false;
  const narrow = window.innerWidth <= 820;
  const coarse = Boolean(window.matchMedia?.("(pointer: coarse)")?.matches || window.matchMedia?.("(hover: none)")?.matches);
  const touch = (navigator.maxTouchPoints || 0) > 0;
  return narrow && (coarse || touch);
}

function snapZoom(z) {
  const n = Number(z) || 1;
  let best = 1, d = Infinity;
  for (const v of ZOOMS) {
    const dd = Math.abs(v - n);
    if (dd < d) { best = v; d = dd; }
  }
  return best;
}

function hexToRgb(hex) {
  const n = parseInt(String(hex).replace("#", ""), 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}

function shade(hex, amt) {
  const { r, g, b } = hexToRgb(hex);
  const c = (v) => Math.max(0, Math.min(255, v + amt));
  return "#" + ((1 << 24) + (c(r) << 16) + (c(g) << 8) + c(b)).toString(16).slice(1);
}

function mix(a, b, t) {
  const A = hexToRgb(a), B = hexToRgb(b);
  const c = (x, y) => Math.round(x + (y - x) * t);
  return "#" + ((1 << 24) + (c(A.r, B.r) << 16) + (c(A.g, B.g) << 8) + c(A.b, B.b)).toString(16).slice(1);
}

const NEON = {
  mag: "#ff2bd6",
  cyan: "#00f0ff",
  purp: "#9b5cff",
  acid: "#b6ff3b",
  metal: "#161821",
  metal2: "#2a3040",
  metal3: "#3d465c",
  ink: "#05010d",
  glow: "#7afcff",
};

const WALL_COLORS = {
  "paint-cream": { base: "#1c1a24", trim: "#00f0ff", accent: "#9b5cff" },
  "paint-sage": { base: "#121a1c", trim: "#00f0ff", accent: "#b6ff3b" },
  "paint-blush": { base: "#1a1218", trim: "#ff2bd6", accent: "#00f0ff" },
  "paint-slate": { base: "#14141c", trim: "#9b5cff", accent: "#00f0ff" },
  "stars-mint": { base: "#121a1c", trim: "#00f0ff", accent: "#b6ff3b" },
  "dots-peach": { base: "#1a1218", trim: "#ff2bd6", accent: "#ff8fab" },
  "stripes-lilac": { base: "#16121e", trim: "#9b5cff", accent: "#ff2bd6" },
};

const FLOOR_KIND = { wood: "panel", tile: "glow", carpet: "grate" };

function makeCanvas(w, h) {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const ctx = c.getContext("2d");
  ctx.imageSmoothingEnabled = false;
  return { c, ctx };
}

function px(ctx, x, y, w, h, color) {
  ctx.fillStyle = color;
  ctx.fillRect(x | 0, y | 0, Math.max(1, w | 0), Math.max(1, h | 0));
}

function pset(ctx, x, y, color) {
  ctx.fillStyle = color;
  ctx.fillRect(x | 0, y | 0, 1, 1);
}

function tileToScreen(tx, ty) {
  return { sx: (tx - ty) * (TW / 2), sy: (tx + ty) * (TH / 2) };
}

function screenToTile(sx, sy) {
  return { x: sy / TH + sx / TW, y: sy / TH - sx / TW };
}

const spriteCache = new Map();
function sprite(key, w, h, draw) {
  let s = spriteCache.get(key);
  if (s) return s;
  const { c, ctx } = makeCanvas(w, h);
  draw(ctx, w, h);
  s = { c, w, h };
  spriteCache.set(key, s);
  return s;
}

function drawDiamond(ctx, cx, cy, fill, edge) {
  ctx.beginPath();
  ctx.moveTo(cx, cy);
  ctx.lineTo(cx + TW / 2, cy + TH / 2);
  ctx.lineTo(cx, cy + TH);
  ctx.lineTo(cx - TW / 2, cy + TH / 2);
  ctx.closePath();
  ctx.fillStyle = fill;
  ctx.fill();
  if (edge) {
    ctx.strokeStyle = edge;
    ctx.lineWidth = 1;
    ctx.stroke();
  }
}

function floorTileSprite(kind, lights, variant) {
  const key = "floor:" + kind + ":" + lights + ":" + variant;
  return sprite(key, TW + 2, TH + 2, (ctx) => {
    const dim = lights ? 0 : -40;
    if (kind === "glow") {
      const a = shade(variant % 2 ? "#1a1030" : "#101018", dim);
      drawDiamond(ctx, TW / 2 + 1, 1, a, shade(NEON.purp, dim));
      ctx.globalAlpha = lights ? 0.55 : 0.15;
      drawDiamond(ctx, TW / 2 + 1, 3, shade(variant % 3 === 0 ? NEON.cyan : NEON.mag, -80));
      ctx.globalAlpha = 1;
      ctx.strokeStyle = lights ? mix(NEON.cyan, "#111", 0.4) : "#223";
      ctx.beginPath();
      ctx.moveTo(TW / 2 + 1, 1);
      ctx.lineTo(TW + 1, TH / 2 + 1);
      ctx.stroke();
    } else if (kind === "grate") {
      drawDiamond(ctx, TW / 2 + 1, 1, shade("#15181f", dim), shade(NEON.acid, lights ? -70 : -120));
      ctx.strokeStyle = shade("#3a4250", dim);
      for (let i = 0; i < 5; i++) {
        ctx.beginPath();
        const t = 3 + i * 3;
        ctx.moveTo(TW / 2 + 1 - (t / TH) * (TW / 2) + 2, 1 + t);
        ctx.lineTo(TW / 2 + 1 + (t / TH) * (TW / 2) - 2, 1 + t);
        ctx.stroke();
      }
    } else {
      drawDiamond(ctx, TW / 2 + 1, 1, shade("#12131a", dim), shade("#00c8d8", lights ? -40 : -100));
      ctx.fillStyle = shade("#2a3040", dim);
      ctx.beginPath();
      ctx.moveTo(TW / 2 + 1, 4);
      ctx.lineTo(TW / 2 + TW / 2 - 5, TH / 2 + 1);
      ctx.lineTo(TW / 2 + 1, TH - 2);
      ctx.lineTo(TW / 2 - TW / 2 + 7, TH / 2 + 1);
      ctx.closePath();
      ctx.fill();
      pset(ctx, TW / 2 + 1, TH / 2 + 1, lights ? NEON.cyan : "#345");
    }
  });
}

function glyph(ctx, x, y, text, color) {
  ctx.fillStyle = color;
  ctx.font = "5px monospace";
  ctx.fillText(text, x, y);
}

function wallStrip(wallStyle, side, col, lights, hasWindow, hasDoor, sign) {
  const key = "wall:" + wallStyle + ":" + side + ":" + col + ":" + lights + ":" + hasWindow + ":" + hasDoor + ":" + (sign || "");
  const w = TW / 2 + 8;
  const h = WALL_H + TH / 2 + 4;
  return sprite(key, w, h, (ctx) => {
    const pal = WALL_COLORS[wallStyle] || WALL_COLORS["paint-cream"];
    const dim = lights ? 0 : -50;
    const base = shade(pal.base, dim);
    const trim = lights ? pal.trim : shade(pal.trim, -80);
    const accent = lights ? pal.accent : shade(pal.accent, -80);
    const top = 2;
    const bot = 2 + WALL_H;
    ctx.beginPath();
    if (side === "z") {
      ctx.moveTo(TW / 2, top);
      ctx.lineTo(TW / 2 + TW / 2, top + TH / 2);
      ctx.lineTo(TW / 2 + TW / 2, bot + TH / 2);
      ctx.lineTo(TW / 2, bot);
    } else {
      ctx.moveTo(8, top + TH / 2);
      ctx.lineTo(8 + TW / 2, top);
      ctx.lineTo(8 + TW / 2, bot);
      ctx.lineTo(8, bot + TH / 2);
    }
    ctx.closePath();
    ctx.fillStyle = side === "z" ? shade(base, 12) : shade(base, -8);
    ctx.fill();
    ctx.strokeStyle = trim;
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.strokeStyle = shade(base, 30);
    const midY = top + 14 + (col % 3) * 2;
    ctx.beginPath();
    if (side === "z") {
      ctx.moveTo(TW / 2 + 2, midY);
      ctx.lineTo(TW / 2 + TW / 2 - 2, midY + TH / 2 - 1);
    } else {
      ctx.moveTo(10, midY + TH / 2 - 1);
      ctx.lineTo(8 + TW / 2 - 2, midY);
    }
    ctx.stroke();
    if (hasDoor) {
      const dx = side === "z" ? TW / 2 + 4 : 12;
      px(ctx, dx, bot - 22, 8, 22, "#0a0b12");
      ctx.strokeStyle = trim;
      ctx.strokeRect(dx, bot - 22, 8, 22);
    } else if (hasWindow) {
      const wx = side === "z" ? TW / 2 + 5 : 13;
      const wy = top + 10;
      px(ctx, wx, wy, 7, 9, lights ? "#083048" : "#101018");
      px(ctx, wx + 1, wy + 1, 5, 3, lights ? mix(NEON.cyan, "#fff", 0.2) : "#1a3040");
      ctx.strokeStyle = accent;
      ctx.strokeRect(wx, wy, 7, 9);
    }
    if (sign && lights) {
      const sx = side === "z" ? TW / 2 + 3 : 11;
      px(ctx, sx, top + 6, 10, 5, "#08060c");
      glyph(ctx, sx + 1, top + 10, sign, col % 2 ? NEON.mag : NEON.cyan);
    }
  });
}

function furnSize(type) {
  const sizes = {
    plant: [22, 28], podplant: [22, 30], cubics: [28, 30], couch: [40, 24],
    capsulecouch: [40, 24], table: [30, 22], lamp: [16, 32], rug: [36, 20],
    chair: [20, 24], hoverchair: [22, 26], bed: [40, 28], tv: [28, 30],
    holotv: [28, 32], fridge: [20, 34], chesstable: [32, 24], coffeemachine: [20, 26],
    heavybag: [18, 36], benchpress: [36, 22], treadmill: [32, 26], clothescab: [24, 34],
    djdeck: [32, 26], sodavending: [22, 36], neonsign: [28, 28], shopkeeper: [AV_W, AV_H],
    rack: [28, 32], mannequin: [20, 36], petpen: [32, 24], cage: [24, 28], counter: [36, 22],
  };
  sizes.punchbag = sizes.heavybag;
  return sizes[type] || [24, 24];
}

function drawFurnitureSprite(type, opts = {}) {
  const lights = opts.lights !== false;
  const rot = opts.rot || 0;
  const on = Boolean(opts.on);
  const open = Boolean(opts.open);
  const key = "furn:" + type + ":" + rot + ":" + lights + ":" + on + ":" + open + ":" + (opts.sku || "");
  const [w, h] = furnSize(type);
  return sprite(key, w, h, (ctx) => {
    const metal = lights ? NEON.metal2 : shade(NEON.metal, -20);
    const body = (x, y, bw, bh, c) => px(ctx, x, y, bw, bh, c);
    const outline = (x, y, bw, bh, c = "#000") => {
      ctx.strokeStyle = c;
      ctx.strokeRect(x + 0.5, y + 0.5, bw - 1, bh - 1);
    };
    ctx.fillStyle = "rgba(0,0,0,0.35)";
    ctx.beginPath();
    ctx.ellipse(w / 2, h - 2, Math.min(12, w / 2 - 1), 3, 0, 0, Math.PI * 2);
    ctx.fill();
    const drawBox = (x, y, bw, bh, fill, trim) => {
      body(x, y, bw, bh, fill);
      body(x, y, bw, 2, shade(fill, 30));
      body(x, y + bh - 2, bw, 2, shade(fill, -25));
      if (trim) outline(x, y, bw, bh, trim);
    };
    switch (type) {
      case "plant":
      case "podplant": {
        drawBox(w / 2 - 6, h - 10, 12, 8, metal, NEON.cyan);
        if (lights) body(w / 2 - 5, h - 9, 10, 2, mix(NEON.acid, "#fff", 0.2));
        body(w / 2 - 2, h - 18, 4, 8, "#1a3020");
        body(w / 2 - 6, h - 24, 5, 8, lights ? "#3dff8a" : "#1a4a2a");
        body(w / 2 + 1, h - 26, 5, 10, lights ? "#b6ff3b" : "#3a5a20");
        body(w / 2 - 3, h - 28, 4, 6, lights ? "#7CFF6A" : "#2a4a20");
        break;
      }
      case "couch":
      case "capsulecouch": {
        drawBox(2, h - 14, w - 4, 10, "#1a1028", NEON.mag);
        drawBox(3, h - 20, w - 6, 8, "#2a1848", NEON.cyan);
        body(3, h - 20, w - 6, 2, lights ? NEON.mag : "#423");
        body(4, h - 17, 6, 4, shade("#2a1848", 20));
        body(w - 12, h - 17, 6, 4, shade("#2a1848", 20));
        break;
      }
      case "chair":
      case "hoverchair": {
        drawBox(5, h - 12, 12, 7, "#1c1228", NEON.cyan);
        body(6, h - 18, 10, 7, "#2a1840");
        body(6, h - 18, 10, 2, lights ? NEON.cyan : "#335");
        if (type === "hoverchair") {
          body(7, h - 5, 8, 2, lights ? mix(NEON.cyan, "#fff", 0.3) : "#234");
          body(8, h - 3, 6, 1, lights ? NEON.purp : "#223");
        } else {
          body(7, h - 5, 2, 4, metal);
          body(13, h - 5, 2, 4, metal);
        }
        break;
      }
      case "table":
      case "counter": {
        drawBox(3, h - 12, w - 6, 7, "#24202c", NEON.purp);
        body(4, h - 11, w - 8, 2, lights ? "#3a3450" : "#222");
        body(6, h - 5, 2, 4, metal);
        body(w - 9, h - 5, 2, 4, metal);
        break;
      }
      case "rug": {
        ctx.fillStyle = lights ? "#1a1030" : "#111018";
        ctx.beginPath();
        ctx.ellipse(w / 2, h / 2, w / 2 - 2, 6, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = lights ? NEON.mag : "#334";
        ctx.stroke();
        ctx.strokeStyle = lights ? NEON.cyan : "#223";
        ctx.beginPath();
        ctx.ellipse(w / 2, h / 2, w / 2 - 5, 4, 0, 0, Math.PI * 2);
        ctx.stroke();
        break;
      }
      case "lamp": {
        body(w / 2 - 2, h - 8, 4, 6, metal);
        body(w / 2 - 1, 8, 2, h - 16, "#2a3040");
        body(w / 2 - 6, 4, 12, 8, lights ? "#143048" : "#101018");
        if (lights) {
          ctx.fillStyle = "rgba(0,240,255,0.35)";
          ctx.beginPath();
          ctx.moveTo(w / 2 - 6, 12);
          ctx.lineTo(w / 2 + 6, 12);
          ctx.lineTo(w / 2 + 10, h - 6);
          ctx.lineTo(w / 2 - 10, h - 6);
          ctx.fill();
        }
        outline(w / 2 - 6, 4, 12, 8, NEON.cyan);
        break;
      }
      case "bed": {
        drawBox(2, h - 12, w - 4, 10, "#1a1228", NEON.purp);
        body(3, h - 18, w - 6, 8, "#2a1848");
        body(3, h - 18, 8, 8, lights ? "#3a2060" : "#221830");
        body(4, h - 16, 6, 3, "#f0d0e8");
        if (lights) body(2, h - 12, w - 4, 1, NEON.mag);
        break;
      }
      case "tv":
      case "holotv": {
        drawBox(4, 6, w - 8, h - 14, metal, NEON.cyan);
        const scr = on && lights ? "#041820" : "#0a0c10";
        body(6, 8, w - 12, h - 20, scr);
        if (on && lights) {
          body(7, 10, w - 14, 4, mix(NEON.cyan, "#fff", 0.15));
          body(7, 16, 6, 3, NEON.mag);
          body(14, 16, 6, 3, NEON.acid);
          body(7, 20, w - 14, 1, NEON.purp);
        }
        body(w / 2 - 3, h - 8, 6, 4, metal);
        if (type === "holotv" && on && lights) {
          ctx.globalAlpha = 0.45;
          body(5, 7, w - 10, h - 18, "#00f0ff");
          ctx.globalAlpha = 1;
        }
        break;
      }
      case "fridge": {
        drawBox(4, 2, 12, h - 6, "#1c2230", NEON.cyan);
        if (open) body(5, 6, 6, h - 14, "#0a1018");
        else {
          body(5, 4, 10, 12, "#242a38");
          body(5, 18, 10, h - 28, "#242a38");
        }
        pset(ctx, 13, 10, lights ? NEON.acid : "#333");
        break;
      }
      default:
        break;
    }
    // continued in next switch block via typ2
    drawFurnitureRest(ctx, type, { w, h, lights, on, metal, body, drawBox, outline, open });
  });
}

function drawFurnitureRest(ctx, type, S) {
  const { w, h, lights, on, metal, body, drawBox, outline, open } = S;
  void on; void open;
  switch (type) {
    case "cubics":
      drawBox(4, 8, w - 8, h - 12, metal, NEON.acid);
      body(6, 10, w - 12, h - 18, lights ? "#041008" : "#0a0c10");
      if (lights) {
        body(8, 12, 3, 3, NEON.cyan);
        body(12, 16, 3, 3, NEON.mag);
        body(16, 13, 3, 3, NEON.acid);
        body(8, 20, 3, 3, NEON.purp);
      }
      body(w / 2 - 4, h - 6, 8, 4, metal);
      break;
    case "chesstable":
      drawBox(4, h - 14, w - 8, 8, "#2a2030", NEON.purp);
      for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) {
        body(8 + i * 4, 6 + j * 3, 4, 3, (i + j) % 2 ? (lights ? "#00d0c8" : "#234") : (lights ? "#1a1030" : "#111"));
      }
      body(6, h - 6, 2, 4, metal);
      body(w - 8, h - 6, 2, 4, metal);
      break;
    case "coffeemachine":
      drawBox(5, 8, 10, h - 12, metal, NEON.mag);
      body(7, 10, 6, 6, lights ? "#3a1020" : "#220");
      body(8, 18, 4, 4, "#1a1220");
      if (lights) pset(ctx, 11, 12, NEON.mag);
      break;
    case "benchpress":
      drawBox(2, h - 10, w - 4, 6, metal, NEON.cyan);
      body(4, h - 14, w - 8, 5, "#1a1228");
      body(6, h - 20, w - 12, 3, "#889");
      body(4, h - 22, 3, 6, metal);
      body(w - 7, h - 22, 3, 6, metal);
      break;
    case "treadmill":
      drawBox(3, h - 10, w - 6, 8, "#1a1c22", NEON.cyan);
      body(4, h - 9, w - 8, 4, "#111");
      body(w - 10, 6, 6, h - 16, metal);
      body(w - 9, 8, 4, 6, lights ? "#082028" : "#111");
      if (lights) body(w - 8, 10, 2, 2, NEON.acid);
      break;
    case "clothescab":
      drawBox(4, 2, 16, h - 6, "#1c1428", NEON.purp);
      body(5, 4, 6, h - 10, "#2a1a40");
      body(12, 4, 7, h - 10, "#2a1a40");
      if (lights) body(4, 2, 16, 2, NEON.mag);
      pset(ctx, 10, 16, NEON.cyan);
      pset(ctx, 17, 16, NEON.cyan);
      break;
    case "djdeck":
      drawBox(2, h - 14, w - 4, 10, "#161018", NEON.mag);
      body(4, h - 12, 8, 6, "#0a0a10");
      body(w - 12, h - 12, 8, 6, "#0a0a10");
      if (lights) {
        pset(ctx, 7, h - 10, NEON.cyan);
        pset(ctx, 10, h - 9, NEON.mag);
        pset(ctx, w - 8, h - 10, NEON.acid);
      }
      body(14, h - 13, 4, 7, "#2a1848");
      break;
    case "sodavending":
      drawBox(4, 2, 14, h - 4, "#161820", NEON.cyan);
      body(6, 5, 10, 8, lights ? "#0a2030" : "#111");
      glyph(ctx, 6, 11, "CUBE", lights ? NEON.cyan : "#446");
      glyph(ctx, 6, 16, "COLA", lights ? NEON.mag : "#446");
      body(6, 18, 10, 10, "#0c0e14");
      body(7, 19, 3, 4, lights ? "#ff2bd6" : "#333");
      body(11, 19, 3, 4, lights ? "#00f0ff" : "#333");
      body(7, 24, 3, 4, lights ? "#b6ff3b" : "#333");
      body(9, h - 5, 4, 2, metal);
      break;
    case "neonsign":
      drawBox(2, 6, w - 4, 16, "#0a0810", NEON.mag);
      if (lights) {
        glyph(ctx, 5, 14, "MyCUBE", NEON.cyan);
        glyph(ctx, 6, 20, "LIVE", NEON.mag);
      }
      body(w / 2 - 1, 22, 2, 6, metal);
      break;
    case "rack":
      body(3, 4, 2, h - 6, metal);
      body(w - 5, 4, 2, h - 6, metal);
      body(3, 6, w - 6, 2, metal);
      body(3, 14, w - 6, 2, metal);
      body(3, 22, w - 6, 2, metal);
      body(6, 4, 5, 10, lights ? NEON.mag : "#423");
      body(12, 12, 5, 10, lights ? NEON.cyan : "#234");
      body(8, 20, 5, 8, lights ? NEON.purp : "#223");
      break;
    case "mannequin":
      body(w / 2 - 3, 6, 6, 6, "#d8c4a8");
      body(w / 2 - 4, 12, 8, 12, lights ? NEON.cyan : "#445");
      body(w / 2 - 6, 14, 3, 8, "#d8c4a8");
      body(w / 2 + 3, 14, 3, 8, "#d8c4a8");
      body(w / 2 - 3, 24, 3, 10, "#1a1030");
      body(w / 2, 24, 3, 10, "#1a1030");
      body(w / 2 - 1, h - 2, 2, 2, metal);
      break;
    case "petpen":
      drawBox(2, h - 12, w - 4, 10, "#1a1820", NEON.acid);
      body(3, 8, 2, h - 10, metal);
      body(w - 5, 8, 2, h - 10, metal);
      body(3, 8, w - 6, 2, metal);
      body(w / 2 - 3, h - 16, 6, 5, lights ? NEON.purp : "#334");
      pset(ctx, w / 2 - 2, h - 15, "#fff");
      pset(ctx, w / 2 + 1, h - 15, "#fff");
      break;
    case "cage":
      drawBox(4, h - 10, w - 8, 8, metal, NEON.cyan);
      for (let i = 0; i < 5; i++) body(6 + i * 3, 8, 1, h - 18, lights ? mix(NEON.cyan, "#222", 0.6) : "#334");
      body(w / 2 - 2, h - 16, 4, 5, lights ? NEON.acid : "#353");
      break;
    default:
      if (type === "plant" || type === "podplant" || type === "couch" || type === "capsulecouch" || type === "chair" || type === "hoverchair" || type === "table" || type === "counter" || type === "rug" || type === "lamp" || type === "bed" || type === "tv" || type === "holotv" || type === "fridge") return;
      if (type === "heavybag" || type === "punch" + "bag") {
        body(w / 2 - 1, 2, 2, 8, "#445");
        drawBox(w / 2 - 5, 8, 10, 18, "#2a1030", NEON.mag);
        body(w / 2 - 4, 10, 8, 3, lights ? NEON.mag : "#423");
        return;
      }
      drawBox(4, 6, w - 8, h - 10, metal, lights ? NEON.purp : "#334");
      glyph(ctx, 6, 16, String(type).slice(0, 6), lights ? NEON.cyan : "#445");
  }
}

function facingIndex(facing, dirX, dirY) {
  let dx = 0, dy = 1;
  if (facing && (facing.x !== undefined || facing.z !== undefined)) {
    dx = facing.x || 0;
    dy = facing.z !== undefined ? facing.z : (facing.y || 0);
  } else if (dirX !== undefined) {
    dx = dirX || 0;
    dy = dirY || 0;
  }
  if (dx === 0 && dy === 0) dy = 1;
  if (Math.abs(dx) > Math.abs(dy)) return dx > 0 ? 0 : 2;
  return dy < 0 ? 1 : 3;
}

function drawAvatarSprite(avatar = {}, flags = {}, frame = 0) {
  const a = {
    skin: avatar.skin || "#f1c27d",
    hair: avatar.hair || "short",
    hairColor: avatar.hairColor || "#2b1d16",
    shirt: avatar.shirt || "#ff7a59",
    glasses: Boolean(avatar.glasses),
    top: avatar.top || "tshirt",
    bottom: avatar.bottom || "jeans",
    bottomColor: avatar.bottomColor || "#3d4f7c",
    shoes: avatar.shoes || "white",
    accessory: avatar.accessory || "none",
    headphoneColor: avatar.headphoneColor || "#2a2a2e",
  };
  const sit = Boolean(flags.sitting);
  const walk = Boolean(flags.walking) && !sit;
  const dir = facingIndex(flags.facing, flags.dirX, flags.dirY);
  const back = dir === 1;
  const side = dir === 0 || dir === 2;
  const flip = dir === 2;
  const phone = Boolean(flags.usingPhone);
  const box = Boolean(flags.boxing);
  const emote = flags.actionEmote || null;
  const key = "av:" + JSON.stringify(a) + ":" + dir + ":" + sit + ":" + walk + ":" + frame + ":" + phone + ":" + box + ":" + emote + ":" + (flags.heldItem || flags.heldProp || "");
  return sprite(key, AV_W, AV_H, (ctx) => {
    if (flip) {
      ctx.translate(AV_W, 0);
      ctx.scale(-1, 1);
    }
    const skin = a.skin;
    const shirt = a.shirt;
    const pants = a.bottomColor;
    const shoeC = a.shoes === "white" ? "#f4f0ea" : a.shoes === "black" ? "#1a1a1a" : a.shoes === "red" ? "#c0392b" : a.shoes === "gum" ? "#e8d0b0" : a.shoes === "glow" ? "#00f0ff" : "#9b5cff";
    const bob = walk ? (frame ? 1 : 0) : 0;
    const legOff = walk ? (frame ? 2 : -2) : 0;
    const y0 = sit ? 4 : 0;
    ctx.fillStyle = "rgba(0,0,0,0.35)";
    ctx.beginPath();
    ctx.ellipse(AV_W / 2, AV_H - 1, 7, 2, 0, 0, Math.PI * 2);
    ctx.fill();
    const cx = AV_W / 2;
    const footY = AV_H - 2 - y0;
    if (!sit) {
      px(ctx, cx - 5 + legOff, footY - 3, 4, 3, shoeC);
      px(ctx, cx + 1 - legOff, footY - 3, 4, 3, shoeC);
      if (a.shoes === "glow") {
        px(ctx, cx - 5 + legOff, footY - 1, 4, 1, NEON.acid);
        px(ctx, cx + 1 - legOff, footY - 1, 4, 1, NEON.acid);
      }
      const lh = a.bottom === "cargo" || a.bottom === "neonpants" ? 10 : 9;
      px(ctx, cx - 4 + Math.min(legOff, 0), footY - 3 - lh, 4, lh, pants);
      px(ctx, cx + 1 + Math.max(legOff, 0), footY - 3 - lh, 4, lh, pants);
      if (a.bottom === "neonpants") {
        px(ctx, cx - 4, footY - 8, 4, 1, NEON.acid);
        px(ctx, cx + 1, footY - 8, 4, 1, NEON.cyan);
      }
    } else {
      px(ctx, cx - 6, footY - 5, 5, 4, pants);
      px(ctx, cx + 1, footY - 5, 5, 4, pants);
      px(ctx, cx - 6, footY - 2, 5, 2, shoeC);
      px(ctx, cx + 1, footY - 2, 5, 2, shoeC);
    }
    const torsoY = (sit ? footY - 16 : footY - 20) - bob;
    const torsoH = sit ? 11 : 12;
    if (a.top === "techwear") {
      px(ctx, cx - 6, torsoY, 12, torsoH, shade(shirt, -40));
      px(ctx, cx - 5, torsoY + 1, 10, torsoH - 2, shirt);
      px(ctx, cx - 6, torsoY, 12, 2, mix(shirt, "#fff", 0.3));
      px(ctx, cx - 6, torsoY + 5, 12, 1, NEON.cyan);
    } else if (a.top === "ledhoodie") {
      px(ctx, cx - 6, torsoY, 12, torsoH, shade(shirt, -30));
      px(ctx, cx - 5, torsoY + 2, 10, 1, shirt);
      px(ctx, cx - 5, torsoY + 6, 10, 1, mix(shirt, "#fff", 0.4));
    } else if (a.top === "hoodie") {
      px(ctx, cx - 6, torsoY, 12, torsoH, shade(shirt, -20));
      px(ctx, cx - 7, torsoY, 2, 7, shade(shirt, -40));
      px(ctx, cx + 5, torsoY, 2, 7, shade(shirt, -40));
    } else if (a.top === "jacket") {
      px(ctx, cx - 6, torsoY, 12, torsoH, shade(shirt, -30));
      px(ctx, cx - 3, torsoY + 2, 6, torsoH - 3, shade(shirt, 20));
    } else {
      px(ctx, cx - 5, torsoY, 10, torsoH, shirt);
    }
    const armY = torsoY + 1;
    const armSwing = walk ? (frame ? 2 : -2) : 0;
    const armUp = box || emote === "wave" || emote === "dance" ? 1 : 0;
    const leftY = armY + (armUp ? -4 : armSwing);
    const rightY = armY + (phone || box ? -3 : -armSwing);
    px(ctx, cx - 8, leftY, 3, 8, skin);
    px(ctx, cx + 5, rightY, 3, 8, skin);
    px(ctx, cx - 8, leftY, 3, 4, shade(shirt, -20));
    px(ctx, cx + 5, rightY, 3, 4, shade(shirt, -20));
    if (phone) {
      px(ctx, cx + 6, rightY - 1, 3, 5, "#1a1a22");
      pset(ctx, cx + 7, rightY, NEON.cyan);
    }
    if (box) {
      px(ctx, cx - 9, leftY - 1, 4, 4, skin);
      px(ctx, cx + 5, rightY - 1, 4, 4, skin);
    }
    const headY = torsoY - 10;
    px(ctx, cx - 1, torsoY - 2, 2, 3, skin);
    px(ctx, cx - 5, headY, 10, 10, skin);
    if (!side) {
      pset(ctx, cx - 6, headY + 4, skin);
      pset(ctx, cx + 5, headY + 4, skin);
    }
    if (!back) {
      pset(ctx, cx - 4, headY + 6, "#f5a9b8");
      pset(ctx, cx + 3, headY + 6, "#f5a9b8");
      if (side) {
        pset(ctx, cx + 2, headY + 4, "#1a1020");
        pset(ctx, cx + 2, headY + 5, "#fff");
      } else {
        pset(ctx, cx - 3, headY + 4, "#1a1020");
        pset(ctx, cx + 2, headY + 4, "#1a1020");
        pset(ctx, cx - 3, headY + 5, "#fff");
        pset(ctx, cx + 2, headY + 5, "#fff");
      }
      pset(ctx, cx, headY + 8, "#c07070");
    }
    if (a.accessory === "tattoo" && !back) {
      pset(ctx, cx + (side ? 1 : -4), headY + 3, NEON.mag);
      pset(ctx, cx + (side ? 1 : -4), headY + 4, NEON.cyan);
      pset(ctx, cx + (side ? 2 : -3), headY + 4, NEON.mag);
    }
    const hc = a.hairColor;
    const hd = shade(hc, -30);
    px(ctx, cx - 6, headY - 2, 12, 5, hc);
    if (a.hair === "curly") {
      pset(ctx, cx - 6, headY - 3, hc);
      pset(ctx, cx - 3, headY - 4, hc);
      pset(ctx, cx, headY - 4, hc);
      pset(ctx, cx + 3, headY - 4, hc);
      pset(ctx, cx + 5, headY - 3, hc);
    } else if (a.hair === "bun") {
      px(ctx, cx - 3, headY - 5, 6, 4, hc);
    } else if (a.hair === "spiky" || a.hair === "neon") {
      pset(ctx, cx - 4, headY - 4, hc);
      pset(ctx, cx - 1, headY - 5, hc);
      pset(ctx, cx + 2, headY - 5, hc);
      pset(ctx, cx + 5, headY - 4, hc);
      if (a.hair === "neon") {
        pset(ctx, cx - 1, headY - 6, mix(hc, "#fff", 0.4));
        pset(ctx, cx + 2, headY - 6, mix(hc, "#fff", 0.4));
      }
    } else if (a.hair === "undercut") {
      px(ctx, cx - 5, headY - 2, 10, 3, hc);
      px(ctx, cx + 1, headY - 1, 5, 6, hc);
    }
    if (!back) {
      if (a.hair === "long") {
        px(ctx, cx - 6, headY + 4, 2, 12, hc);
        px(ctx, cx + 4, headY + 4, 2, 12, hc);
      }
      if (a.hair === "bangs" || a.hair === "neon") {
        px(ctx, cx - 5, headY, 10, 3, hd);
        pset(ctx, cx - 2, headY + 3, hd);
        pset(ctx, cx + 1, headY + 3, hd);
      }
    } else {
      px(ctx, cx - 6, headY - 1, 12, 8, hc);
    }
    if (a.glasses && !back) {
      px(ctx, cx - 4, headY + 3, 3, 2, "#111");
      px(ctx, cx + 1, headY + 3, 3, 2, "#111");
      pset(ctx, cx, headY + 3, "#222");
    }
    if (a.accessory === "cap") {
      px(ctx, cx - 6, headY - 2, 12, 3, shirt);
      if (!back) px(ctx, cx - 2, headY + 1, 8, 2, shade(shirt, -30));
    } else if (a.accessory === "beanie") {
      px(ctx, cx - 6, headY - 3, 12, 5, a.headphoneColor || shirt);
    } else if (a.accessory === "headphones") {
      px(ctx, cx - 7, headY + 1, 2, 5, a.headphoneColor);
      px(ctx, cx + 5, headY + 1, 2, 5, a.headphoneColor);
      px(ctx, cx - 7, headY - 2, 14, 2, a.headphoneColor);
    } else if (a.accessory === "chain" && !back) {
      pset(ctx, cx - 1, torsoY + 2, "#f4c15d");
      pset(ctx, cx, torsoY + 3, "#f4c15d");
      pset(ctx, cx + 1, torsoY + 2, "#f4c15d");
    } else if (a.accessory === "visor") {
      px(ctx, cx - 6, headY + 3, 12, 3, back ? "#0a2030" : mix(NEON.cyan, "#011", 0.2));
      if (!back) px(ctx, cx - 5, headY + 3, 10, 2, NEON.cyan);
    } else if (a.accessory === "goggles") {
      px(ctx, cx - 6, headY + 3, 5, 3, "#111");
      px(ctx, cx + 1, headY + 3, 5, 3, "#111");
      if (!back) {
        pset(ctx, cx - 4, headY + 4, NEON.acid);
        pset(ctx, cx + 3, headY + 4, NEON.acid);
      }
    }
    const prop = flags.heldItem || flags.heldProp;
    if (prop && !sit) {
      if (prop === "coffee") px(ctx, cx + 7, rightY + 5, 3, 4, "#6b3a2a");
      else if (prop === "guitar") px(ctx, cx + 6, torsoY + 2, 3, 12, "#c4a35a");
      else if (prop === "skateboard") px(ctx, cx - 8, footY - 2, 16, 2, NEON.purp);
    }
  });
}

function drawPetSprite(kind, frame, walking, sit) {
  const key = "pet:" + kind + ":" + frame + ":" + walking + ":" + sit;
  const w = 16, h = 16;
  return sprite(key, w, h, (ctx) => {
    ctx.fillStyle = "rgba(0,0,0,0.3)";
    ctx.beginPath();
    ctx.ellipse(8, 14, 5, 2, 0, 0, Math.PI * 2);
    ctx.fill();
    const bob = walking ? (frame ? -1 : 0) : (kind === "drone" || kind === "jellyfish" ? (frame ? -2 : -1) : 0);
    const y = (sit ? 2 : 0) + bob;
    const body = (x, yy, bw, bh, c) => px(ctx, x, yy + y, bw, bh, c);
    if (kind === "dog") {
      body(3, 6, 10, 6, "#c4a06a");
      body(11, 4, 4, 4, "#c4a06a");
      pset(ctx, 13, 5, "#1a1a1a");
      body(2, 5, 3, 3, "#8a6a40");
      body(4, 12, 3, 3, "#c4a06a");
      body(9, 12, 3, 3, "#c4a06a");
    } else if (kind === "bunny") {
      body(4, 7, 8, 6, "#f4e8dc");
      body(5, 2, 2, 6, "#f4e8dc");
      body(9, 2, 2, 6, "#f4e8dc");
      pset(ctx, 6, 3, "#f5a9b8");
      pset(ctx, 10, 3, "#f5a9b8");
      pset(ctx, 6, 9, "#222");
      pset(ctx, 10, 9, "#222");
    } else if (kind === "robocat") {
      body(3, 6, 10, 6, "#9aa0b0");
      body(3, 3, 3, 4, "#9aa0b0");
      body(10, 3, 3, 4, "#9aa0b0");
      body(11, 5, 5, 4, "#7a8090");
      pset(ctx, 5, 8, NEON.cyan);
      pset(ctx, 8, 8, NEON.cyan);
      pset(ctx, 13, 6, NEON.mag);
      body(4, 12, 3, 3, "#667");
      body(9, 12, 3, 3, "#667");
    } else if (kind === "drone") {
      body(2, 7, 12, 4, "#2a3040");
      body(6, 6, 4, 3, NEON.cyan);
      pset(ctx, 3, 6, NEON.mag);
      pset(ctx, 12, 6, NEON.mag);
      body(1, 8, 3, 1, "#89a");
      body(12, 8, 3, 1, "#89a");
    } else if (kind === "neonfox") {
      body(3, 6, 10, 6, "#1a1030");
      body(11, 4, 4, 4, "#1a1030");
      body(3, 3, 3, 4, "#1a1030");
      pset(ctx, 4, 4, NEON.mag);
      pset(ctx, 13, 5, NEON.cyan);
      pset(ctx, 6, 8, NEON.acid);
      pset(ctx, 9, 8, NEON.acid);
      body(4, 12, 3, 3, "#1a1030");
      body(9, 12, 3, 3, "#1a1030");
      px(ctx, 2, 11 + y, 3, 1, NEON.mag);
    } else if (kind === "jellyfish") {
      body(4, 4, 8, 5, mix(NEON.purp, "#fff", 0.15));
      body(5, 5, 6, 3, mix(NEON.cyan, "#fff", 0.2));
      pset(ctx, 6, 6, "#fff");
      pset(ctx, 9, 6, "#fff");
      body(5, 9, 1, 5, NEON.cyan);
      body(7, 9, 1, 6, NEON.mag);
      body(9, 9, 1, 5, NEON.cyan);
      body(11, 9, 1, 4, NEON.purp);
    } else {
      body(3, 6, 10, 6, "#d08a3a");
      body(3, 3, 3, 4, "#d08a3a");
      body(10, 3, 3, 4, "#d08a3a");
      body(11, 5, 5, 4, "#d08a3a");
      pset(ctx, 5, 8, "#222");
      pset(ctx, 8, 8, "#222");
      pset(ctx, 13, 7, "#f5a9b8");
      body(4, 12, 3, 3, "#d08a3a");
      body(9, 12, 3, 3, "#d08a3a");
    }
  });
}

function createSpaceLayer(container) {
  const canvas = document.createElement("canvas");
  canvas.className = "iso-space";
  canvas.style.cssText = "position:absolute;inset:0;width:100%;height:100%;image-rendering:pixelated;pointer-events:none;z-index:0";
  container.appendChild(canvas);
  const ctx = canvas.getContext("2d");
  let w = 0, h = 0, stars = [], ships = [], t0 = performance.now();
  let planetA = Math.random() * Math.PI * 2;

  function resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, isPhoneView() ? 1.5 : 2);
    w = container.clientWidth || 800;
    h = container.clientHeight || 500;
    canvas.width = Math.max(1, Math.floor(w * dpr));
    canvas.height = Math.max(1, Math.floor(h * dpr));
    canvas.style.width = w + "px";
    canvas.style.height = h + "px";
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.imageSmoothingEnabled = false;
    stars = [];
    const n = Math.min(140, Math.floor((w * h) / 2800));
    for (let i = 0; i < n; i++) {
      stars.push({
        x: Math.random() * w,
        y: Math.random() * h,
        s: Math.random() < 0.85 ? 1 : 2,
        p: Math.random() * Math.PI * 2,
        c: Math.random() < 0.15 ? NEON.cyan : Math.random() < 0.1 ? NEON.mag : "#d0e8ff",
      });
    }
    ships = [
      { x: w * 0.15, y: h * 0.22, vx: 0.15, vy: 0.02, t: 0 },
      { x: w * 0.8, y: h * 0.35, vx: -0.1, vy: 0.01, t: 40 },
    ];
  }

  function draw(now) {
    const t = (now - t0) / 1000;
    ctx.fillStyle = "#05010d";
    ctx.fillRect(0, 0, w, h);
    const g = ctx.createLinearGradient(0, h * 0.55, 0, h);
    g.addColorStop(0, "rgba(5,1,13,0)");
    g.addColorStop(0.5, "rgba(80,10,80,0.25)");
    g.addColorStop(1, "rgba(0,180,200,0.2)");
    ctx.fillStyle = g;
    ctx.fillRect(0, h * 0.55, w, h * 0.45);
    ctx.fillStyle = "#07040f";
    const base = h * 0.78;
    for (let i = 0; i < 18; i++) {
      const bx = (i / 18) * w + Math.sin(i * 1.7) * 8;
      const bh = 18 + (i * 13) % 50;
      const bw = 10 + (i * 5) % 16;
      ctx.fillRect(bx, base - bh, bw, bh + 20);
      if (i % 2 === 0) {
        ctx.fillStyle = i % 4 === 0 ? "rgba(255,43,214,0.45)" : "rgba(0,240,255,0.4)";
        ctx.fillRect(bx + 2, base - bh + 4, 2, 2);
        ctx.fillStyle = "#07040f";
      }
    }
    const px0 = w * 0.78, py0 = h * 0.22, pr = Math.min(48, w * 0.08);
    const pg = ctx.createRadialGradient(px0 - 8, py0 - 6, 4, px0, py0, pr);
    pg.addColorStop(0, "#6a3cff");
    pg.addColorStop(0.55, "#2a1060");
    pg.addColorStop(1, "rgba(10,0,30,0)");
    ctx.fillStyle = pg;
    ctx.beginPath();
    ctx.arc(px0, py0, pr, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "rgba(255,43,214,0.5)";
    ctx.beginPath();
    ctx.ellipse(px0, py0, pr + 10, 4, planetA + t * 0.02, 0, Math.PI * 2);
    ctx.stroke();
    ctx.globalAlpha = 0.12;
    ctx.fillStyle = NEON.purp;
    ctx.beginPath();
    ctx.arc(w * 0.3, h * 0.3, 80, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = NEON.cyan;
    ctx.beginPath();
    ctx.arc(w * 0.55, h * 0.2, 60, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;
    for (const s of stars) {
      const a = 0.45 + 0.55 * Math.abs(Math.sin(t * 2 + s.p));
      ctx.globalAlpha = a;
      ctx.fillStyle = s.c;
      ctx.fillRect(s.x, s.y, s.s, s.s);
    }
    ctx.globalAlpha = 1;
    for (const sh of ships) {
      sh.x += sh.vx;
      sh.y += sh.vy * Math.sin((t + sh.t) * 0.6);
      if (sh.x > w + 10) sh.x = -10;
      if (sh.x < -10) sh.x = w + 10;
      ctx.fillStyle = "#c8d0e0";
      ctx.fillRect(sh.x, sh.y, 5, 2);
      ctx.fillStyle = sh.vx > 0 ? NEON.cyan : NEON.mag;
      ctx.fillRect(sh.x + (sh.vx > 0 ? -2 : 5), sh.y, 2, 2);
    }
  }

  resize();
  let last = 0;
  function tick(now) {
    if (now - last > 80) { draw(now); last = now; }
  }
  return { canvas, resize, tick };
}

export function createAvatarPreview(container) {
  container.innerHTML = "";
  container.style.position = "relative";
  container.style.imageRendering = "pixelated";
  const canvas = document.createElement("canvas");
  canvas.style.cssText = "width:100%;height:100%;image-rendering:pixelated;display:block";
  container.appendChild(canvas);
  let avatar = {};
  let facing = { x: 1, z: 1 };
  let raf = 0, alive = true;

  function resize() {
    const w = container.clientWidth || 160;
    const h = container.clientHeight || 180;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.max(1, Math.floor(w * dpr));
    canvas.height = Math.max(1, Math.floor(h * dpr));
    canvas.style.width = w + "px";
    canvas.style.height = h + "px";
  }

  function render(now) {
    if (!alive) return;
    const c = canvas.getContext("2d");
    const w = canvas.width, h = canvas.height;
    c.imageSmoothingEnabled = false;
    c.fillStyle = "#0a0812";
    c.fillRect(0, 0, w, h);
    c.fillStyle = "rgba(0,240,255,0.04)";
    for (let y = 0; y < h; y += 4) c.fillRect(0, y, w, 1);
    const scale = Math.max(2, Math.floor(Math.min(w / (AV_W + 8), h / (AV_H + 8))));
    const frame = Math.floor((now || 0) / 400) % 2;
    const spr = drawAvatarSprite(avatar, { facing, walking: false }, frame);
    const dx = Math.floor((w - spr.w * scale) / 2);
    const dy = Math.floor((h - spr.h * scale) / 2);
    c.drawImage(spr.c, 0, 0, spr.w, spr.h, dx, dy, spr.w * scale, spr.h * scale);
    raf = requestAnimationFrame(render);
  }

  resize();
  raf = requestAnimationFrame(render);
  return {
    setAvatar(a) { avatar = a || {}; },
    setPose() {},
    resize,
    dispose() { alive = false; cancelAnimationFrame(raf); container.innerHTML = ""; },
  };
}

export function createRoom3D(container) {
  container.innerHTML = "";
  container.style.position = "relative";
  container.style.overflow = "hidden";
  container.style.background = "transparent";

  const space = createSpaceLayer(container);
  const canvas = document.createElement("canvas");
  canvas.className = "iso-room";
  canvas.style.cssText = "position:absolute;inset:0;width:100%;height:100%;image-rendering:pixelated;image-rendering:crisp-edges;z-index:1;touch-action:none";
  container.appendChild(canvas);
  const overlay = document.createElement("div");
  overlay.className = "iso-overlay bubble-layer";
  overlay.id = "bubble-layer";
  overlay.style.cssText = "position:absolute;inset:0;z-index:2;pointer-events:none";
  container.appendChild(overlay);

  const ctx = canvas.getContext("2d");
  let viewW = 800, viewH = 500, dpr = 1;
  let gridSize = 6;
  let wallpaper = "paint-cream";
  let floorStyle = "wood";
  let lightsOn = true;
  let furniture = [];
  let wallArt = [];
  let uses = {};
  let tvs = {};
  let chess = {};
  let arcade = {};
  let people = [];
  let npcs = [];
  let ghost = null;
  let wallGhost = null;
  let highlightId = null;
  let followName = null;
  let camMode = "follow";
  let userZoom = FOLLOW_ZOOM_DEFAULT;
  let zoom = 1;
  let camX = 0, camY = 0;
  let placing = null;
  let alive = true;
  let serverTime0 = Date.now();
  let serverAt = performance.now();
  let hoverTile = null;
  let panStart = null;
  const pointers = new Map();
  let pinchStart = 0, pinchZoom0 = 1;
  let onTileClick = null, onTileHover = null, onFurnitureClick = null;
  let onSwitchClick = null, onWallClick = null, onWallHover = null;
  const personState = new Map();

  function nowServer() {
    return serverTime0 + (performance.now() - serverAt);
  }
  function bobY(now) {
    return Math.sin((now || performance.now()) / 900) * 1.2;
  }
  function roomWorldBounds() {
    const n = gridSize;
    const pts = [tileToScreen(0, 0), tileToScreen(n, 0), tileToScreen(0, n), tileToScreen(n, n)];
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    for (const p of pts) {
      minX = Math.min(minX, p.sx - TW / 2);
      maxX = Math.max(maxX, p.sx + TW / 2);
      minY = Math.min(minY, p.sy - WALL_H);
      maxY = Math.max(maxY, p.sy + TH);
    }
    return { minX, maxX, minY, maxY, w: maxX - minX, h: maxY - minY };
  }
  function originAt(now) {
    return { ox: viewW / (2 * zoom) - camX, oy: viewH / (2 * zoom) - camY + bobY(now) };
  }
  function fitRoomCamera() {
    const b = roomWorldBounds();
    camX = (b.minX + b.maxX) / 2;
    camY = (b.minY + b.maxY) / 2 + 4;
    zoom = 1;
  }
  function followCamera() {
    const name = followName || (people[0] && people[0].username);
    const p = people.find((x) => x.username === name) || people[0];
    const t = p ? tileToScreen((p.x ?? 0) + 0.5, (p.y ?? 0) + 0.5) : tileToScreen(gridSize / 2, gridSize / 2);
    camX += (t.sx - camX) * 0.18;
    camY += (t.sy - AV_H / 2 - camY) * 0.18;
    zoom = snapZoom(userZoom);
  }
  function applyCamera() {
    if (!isPhoneView() || camMode === "room") {
      fitRoomCamera();
      if (!isPhoneView()) {
        const b = roomWorldBounds();
        const sx = Math.floor(viewW / (b.w + 32));
        const sy = Math.floor(viewH / (b.h + 40));
        zoom = Math.max(1, Math.min(3, Math.min(sx, sy) || 1));
      }
    } else {
      followCamera();
    }
  }
  function clientFromWorld(sx, sy, now) {
    const { ox, oy } = originAt(now);
    const x = (ox + sx) * zoom;
    const y = (oy + sy) * zoom;
    const rect = canvas.getBoundingClientRect();
    return { x: rect.left + x, y: rect.top + y, visible: x >= 0 && y >= 0 && x <= viewW && y <= viewH };
  }
  function worldFromClient(cx, cy, now) {
    const rect = canvas.getBoundingClientRect();
    const { ox, oy } = originAt(now);
    return { sx: (cx - rect.left) / zoom - ox, sy: (cy - rect.top) / zoom - oy };
  }
  function resize() {
    viewW = container.clientWidth || 800;
    viewH = container.clientHeight || 500;
    dpr = Math.min(window.devicePixelRatio || 1, isPhoneView() ? 1.5 : 2);
    canvas.width = Math.max(1, Math.floor(viewW * dpr));
    canvas.height = Math.max(1, Math.floor(viewH * dpr));
    canvas.style.width = viewW + "px";
    canvas.style.height = viewH + "px";
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.imageSmoothingEnabled = false;
    space.resize();
    if (isPhoneView() && camMode === "follow" && userZoom < 1.15) userZoom = FOLLOW_ZOOM_DEFAULT;
    applyCamera();
  }
  function footOf(tx, ty) {
    return tileToScreen(tx + 0.5, ty + 0.5);
  }
  function blit(spr, x, y, alpha = 1) {
    if (!spr) return;
    if (alpha !== 1) ctx.globalAlpha = alpha;
    ctx.drawImage(spr.c, Math.round(x), Math.round(y));
    if (alpha !== 1) ctx.globalAlpha = 1;
  }
  function lightSwitchPos() {
    const p = tileToScreen(0, 1);
    return { sx: p.sx - 10, sy: p.sy - WALL_H + 16, w: 6, h: 8 };
  }
  function wallSlotWorld(wall, slot) {
    const n = gridSize;
    const s = Math.max(0, Math.min(n - 1, slot | 0));
    if (wall === "z" || wall === "left") {
      const p = tileToScreen(0, s + 0.5);
      return { sx: p.sx - 6, sy: p.sy - WALL_H + 10, wall: "left", slot: s };
    }
    const p = tileToScreen(s + 0.5, 0);
    return { sx: p.sx + 2, sy: p.sy - WALL_H + 10, wall: "back", slot: s };
  }

  function collectDrawList(now) {
    const list = [];
    for (const f of furniture) {
      const type = f.type;
      const [fw, fh] = furnSize(type);
      const foot = footOf(f.x, f.y);
      const tv = tvs[f.id] || {};
      const spr = drawFurnitureSprite(type, {
        lights: lightsOn,
        rot: f.rot || 0,
        on: type === "tv" || type === "holotv" ? Boolean(tv.on) : Boolean(uses[f.id]?.on),
        open: type === "fridge" ? Boolean(uses[f.id]?.open) : false,
        sku: f.sku,
      });
      list.push({ kind: "furn", id: f.id, type, depth: f.x + f.y + 0.2, sx: foot.sx - fw / 2, sy: foot.sy - fh + 2, w: fw, h: fh, spr, raw: f });
    }
    for (const npc of npcs) {
      const foot = footOf(npc.x, npc.y);
      const spr = drawAvatarSprite(npc.avatar || {}, { facing: { x: 1, z: 1 } }, 0);
      list.push({ kind: "npc", id: npc.id, type: "shopkeeper", depth: npc.x + npc.y + 0.4, sx: foot.sx - AV_W / 2, sy: foot.sy - AV_H + 2, w: AV_W, h: AV_H, spr, raw: npc });
    }
    for (const p of people) {
      const st = personState.get(p.username) || p;
      const x = st.x ?? p.x, y = st.y ?? p.y;
      const walking = Boolean(st.walking || p.walking);
      const frame = Math.floor(now / 200) % 2;
      const flags = {
        sitting: p.sitting, walking, facing: p.facing || st.facing, dirX: st.dirX, dirY: st.dirY,
        usingPhone: p.usingPhone, boxing: p.boxing, actionEmote: p.actionEmote,
        heldItem: p.heldItem, heldProp: p.heldProp, gym: p.gym,
      };
      const spr = drawAvatarSprite(p.avatar || {}, flags, frame);
      const foot = tileToScreen(x + 0.5, y + 0.5);
      list.push({ kind: "person", id: p.username, type: "person", depth: x + y + 0.45, sx: foot.sx - AV_W / 2, sy: foot.sy - AV_H + 2, w: AV_W, h: AV_H, spr, raw: p, tileX: x, tileY: y });
      if (p.activePet) {
        const sit = !walking && !p.sitting;
        const facing = p.facing || st.facing || { x: 1, z: 0 };
        const fx = facing.x || 0, fz = facing.z || 0;
        const rx = -fz, ry = fx;
        const plen = Math.hypot(rx, ry) || 1;
        const pst = st.petX != null ? { x: st.petX, y: st.petY } : { x: x + (rx / plen) * 0.45, y: y + (ry / plen) * 0.45 };
        const pf = tileToScreen(pst.x + 0.5, pst.y + 0.5);
        const hover = p.activePet === "drone" || p.activePet === "jellyfish";
        const pspr = drawPetSprite(p.activePet, frame, walking || hover, sit && !hover);
        list.push({ kind: "pet", id: p.username + "-pet", type: "pet", depth: pst.x + pst.y + 0.35, sx: pf.sx - 8, sy: pf.sy - 16 + 2, w: 16, h: 16, spr: pspr });
      }
    }
    if (ghost) {
      const [fw, fh] = furnSize(ghost.type);
      const foot = footOf(ghost.tx, ghost.ty);
      const spr = drawFurnitureSprite(ghost.type, { lights: lightsOn, rot: ghost.rot || 0 });
      list.push({ kind: "ghost", depth: ghost.tx + ghost.ty + 0.9, sx: foot.sx - fw / 2, sy: foot.sy - fh + 2, w: fw, h: fh, spr, alpha: 0.55 });
    }
    list.sort((a, b) => a.depth - b.depth);
    return list;
  }

  function drawWalls() {
    const n = gridSize;
    const signs = ["ZEON", "K3-09", "CUBE", "OPEN", "VLT", "GRID"];
    for (let i = 0; i < n; i++) {
      const hasDoor = i === Math.floor(n / 2);
      const hasWindow = !hasDoor && (i % 2 === 1);
      const sign = !hasDoor && i % 3 === 0 ? signs[i % signs.length] : "";
      const pr = tileToScreen(i, 0);
      const wr = wallStrip(wallpaper, "x", i, lightsOn, hasWindow, hasDoor, sign);
      blit(wr, pr.sx, pr.sy - WALL_H);
      const pl = tileToScreen(0, i);
      const wl = wallStrip(wallpaper, "z", i, lightsOn, !hasDoor && i % 2 === 0, hasDoor && i === Math.floor(n * 0.6), i % 3 === 1 ? signs[(i + 2) % signs.length] : "");
      blit(wl, pl.sx - TW / 2, pl.sy - WALL_H);
    }
    const sw = lightSwitchPos();
    px(ctx, sw.sx, sw.sy, sw.w, sw.h, lightsOn ? "#1a2230" : "#101018");
    ctx.strokeStyle = lightsOn ? NEON.cyan : "#445";
    ctx.strokeRect(sw.sx, sw.sy, sw.w, sw.h);
    px(ctx, sw.sx + 2, sw.sy + 2, 2, 4, lightsOn ? NEON.acid : "#555");
    for (const art of wallArt) {
      const pos = wallSlotWorld(art.wall, art.slot);
      px(ctx, pos.sx, pos.sy, 12, 10, "#0a0810");
      ctx.strokeStyle = art.type && String(art.type).includes("neon") ? NEON.mag : NEON.cyan;
      ctx.strokeRect(pos.sx, pos.sy, 12, 10);
      ctx.fillStyle = lightsOn ? NEON.cyan : "#446";
      ctx.font = "5px monospace";
      ctx.fillText((art.type || "ART").replace(/^art_/, "").slice(0, 5).toUpperCase(), pos.sx + 1, pos.sy + 7);
    }
    if (wallGhost) {
      const pos = wallSlotWorld(wallGhost.wall, wallGhost.slot);
      ctx.globalAlpha = 0.5;
      px(ctx, pos.sx, pos.sy, 12, 10, wallGhost.ok === false ? "#ff2b2b" : NEON.cyan);
      ctx.globalAlpha = 1;
    }
  }

  function drawGlow(now) {
    const b = roomWorldBounds();
    const { ox, oy } = originAt(now);
    const cx = ox + (b.minX + b.maxX) / 2;
    const cy = oy + b.maxY - 4;
    const grd = ctx.createRadialGradient(cx, cy, 8, cx, cy, Math.max(b.w, b.h) * 0.7);
    grd.addColorStop(0, "rgba(0,240,255,0.22)");
    grd.addColorStop(0.5, "rgba(155,92,255,0.12)");
    grd.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = grd;
    ctx.fillRect(cx - b.w, cy - 40, b.w * 2, 80);
  }

  function render(now) {
    if (!alive) return;
    applyCamera();
    space.tick(now);
    ctx.imageSmoothingEnabled = false;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, viewW, viewH);
    const { ox, oy } = originAt(now);
    ctx.save();
    ctx.translate(ox * zoom, oy * zoom);
    ctx.scale(zoom, zoom);
    drawGlow(now);
    const kind = FLOOR_KIND[floorStyle] || "panel";
    for (let y = 0; y < gridSize; y++) {
      for (let x = 0; x < gridSize; x++) {
        const p = tileToScreen(x, y);
        const spr = floorTileSprite(kind, lightsOn, (x + y) + x * 3);
        blit(spr, p.sx - TW / 2 - 1, p.sy - 1);
        if (hoverTile && hoverTile.x === x && hoverTile.y === y) {
          ctx.strokeStyle = NEON.cyan;
          ctx.globalAlpha = 0.7;
          ctx.beginPath();
          ctx.moveTo(p.sx, p.sy);
          ctx.lineTo(p.sx + TW / 2, p.sy + TH / 2);
          ctx.lineTo(p.sx, p.sy + TH);
          ctx.lineTo(p.sx - TW / 2, p.sy + TH / 2);
          ctx.closePath();
          ctx.stroke();
          ctx.globalAlpha = 1;
        }
      }
    }
    drawWalls();
    const list = collectDrawList(now);
    for (const it of list) {
      if (highlightId && it.id === highlightId) {
        ctx.fillStyle = "rgba(0,240,255,0.18)";
        ctx.fillRect(it.sx - 1, it.sy - 1, it.w + 2, it.h + 2);
      }
      blit(it.spr, it.sx, it.sy, it.alpha ?? 1);
    }
    ctx.restore();
    requestAnimationFrame(render);
  }

  function hitAt(cx, cy) {
    const now = performance.now();
    const wpt = worldFromClient(cx, cy, now);
    const list = collectDrawList(now);
    for (let i = list.length - 1; i >= 0; i--) {
      const it = list[i];
      if (it.kind === "ghost") continue;
      if (wpt.sx >= it.sx && wpt.sx <= it.sx + it.w && wpt.sy >= it.sy && wpt.sy <= it.sy + it.h) return it;
    }
    const sw = lightSwitchPos();
    if (wpt.sx >= sw.sx && wpt.sx <= sw.sx + sw.w && wpt.sy >= sw.sy && wpt.sy <= sw.sy + sw.h) return { kind: "switch" };
    for (const art of wallArt) {
      const pos = wallSlotWorld(art.wall, art.slot);
      if (wpt.sx >= pos.sx && wpt.sx <= pos.sx + 12 && wpt.sy >= pos.sy && wpt.sy <= pos.sy + 10) {
        return { kind: "wall", wall: pos.wall, slot: pos.slot, art };
      }
    }
    const tile = screenToTile(wpt.sx, wpt.sy);
    if (tile.y < 0 && tile.x >= 0 && tile.x < gridSize) {
      return { kind: "wall", wall: "back", slot: Math.max(0, Math.min(gridSize - 1, Math.floor(tile.x))) };
    }
    if (tile.x < 0 && tile.y >= 0 && tile.y < gridSize) {
      return { kind: "wall", wall: "left", slot: Math.max(0, Math.min(gridSize - 1, Math.floor(tile.y))) };
    }
    const tx = Math.floor(tile.x), ty = Math.floor(tile.y);
    if (tx >= 0 && ty >= 0 && tx < gridSize && ty < gridSize) return { kind: "tile", x: tx, y: ty };
    return null;
  }

  function handleTap(ev) {
    const hit = hitAt(ev.clientX, ev.clientY);
    if (!hit) return;
    if (hit.kind === "switch") { onSwitchClick?.(); return; }
    if (hit.kind === "wall") { onWallClick?.(hit.wall, hit.slot); return; }
    if (hit.kind === "furn" || hit.kind === "npc") { onFurnitureClick?.(hit.id, hit.type, hit.raw || {}); return; }
    if (hit.kind === "tile") onTileClick?.(hit.x, hit.y);
    if (hit.kind === "person") onTileClick?.(Math.round(hit.tileX), Math.round(hit.tileY));
  }

  function handleHover(ev) {
    const hit = hitAt(ev.clientX, ev.clientY);
    if (hit?.kind === "tile") {
      hoverTile = { x: hit.x, y: hit.y };
      onTileHover?.(hit.x, hit.y);
    } else if (hit?.kind === "wall") {
      onWallHover?.(hit.wall, hit.slot);
    }
  }

  canvas.addEventListener("pointerdown", (e) => {
    canvas.setPointerCapture?.(e.pointerId);
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.size === 2) {
      const pts = [...pointers.values()];
      pinchStart = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
      pinchZoom0 = userZoom;
    } else {
      panStart = { x: e.clientX, y: e.clientY, camX, camY, t: performance.now() };
    }
  });
  canvas.addEventListener("pointermove", (e) => {
    if (pointers.has(e.pointerId)) pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.size === 2 && pinchStart) {
      const pts = [...pointers.values()];
      const d = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
      userZoom = snapZoom(pinchZoom0 * (d / Math.max(8, pinchStart)));
      return;
    }
    if (panStart && !isPhoneView()) {
      camX = panStart.camX - (e.clientX - panStart.x) / zoom;
      camY = panStart.camY - (e.clientY - panStart.y) / zoom;
    }
    handleHover(e);
  });
  function endPtr(e) {
    const start = panStart;
    pointers.delete(e.pointerId);
    if (pointers.size < 2) pinchStart = 0;
    if (pointers.size === 0) {
      const dt = start ? performance.now() - start.t : 0;
      const dist = start ? Math.hypot(e.clientX - start.x, e.clientY - start.y) : 0;
      panStart = null;
      if (dist < 12 && dt < 500) handleTap(e);
    }
  }
  canvas.addEventListener("pointerup", endPtr);
  canvas.addEventListener("pointercancel", endPtr);
  canvas.addEventListener("wheel", (e) => {
    if (!isPhoneView()) return;
    e.preventDefault();
    const dir = e.deltaY > 0 ? -1 : 1;
    const i = Math.max(0, Math.min(2, ZOOMS.indexOf(snapZoom(userZoom)) + dir));
    userZoom = ZOOMS[i];
    if (camMode !== "follow") setCamMode("follow");
  }, { passive: false });

  function setCamMode(mode) {
    camMode = mode === "room" ? "room" : "follow";
    if (camMode === "follow" && isPhoneView() && userZoom < 1.15) userZoom = FOLLOW_ZOOM_DEFAULT;
    applyCamera();
    return camMode;
  }

  function findFurnMesh(id) {
    const f = furniture.find((x) => x.id === id);
    if (!f) return null;
    return { userData: { ...f, type: f.type, boardSquare: 0.125, tableSize: 1.7 } };
  }

  function interpolatePeople(list) {
    const seen = new Set();
    for (const p of list) {
      seen.add(p.username);
      let st = personState.get(p.username);
      if (!st) {
        st = { x: p.x, y: p.y, walking: false, dirX: 0, dirY: 0, petX: p.x, petY: p.y };
        personState.set(p.username, st);
      }
      st.targetX = p.x;
      st.targetY = p.y;
      st.facing = p.facing;
      Object.assign(st, { sitting: p.sitting, usingPhone: p.usingPhone, boxing: p.boxing, actionEmote: p.actionEmote, heldItem: p.heldItem, heldProp: p.heldProp, activePet: p.activePet, avatar: p.avatar, username: p.username });
    }
    for (const k of [...personState.keys()]) if (!seen.has(k)) personState.delete(k);
    people = list.map((p) => {
      const st = personState.get(p.username);
      if (!st) return p;
      st.x = p.x;
      st.y = p.y;
      st.walking = Boolean(p.walking);
      st.dirX = p.dirX || 0;
      st.dirY = (p.dirZ ?? p.dirY) || 0;
      const facing = p.facing || { x: 1, z: 0 };
      const rx = -(facing.z || 0), ry = facing.x || 0;
      const plen = Math.hypot(rx, ry) || 1;
      const wantX = st.x + (rx / plen) * 0.45;
      const wantY = st.y + (ry / plen) * 0.45;
      st.petX = (st.petX ?? wantX) + (wantX - (st.petX ?? wantX)) * 0.2;
      st.petY = (st.petY ?? wantY) + (wantY - (st.petY ?? wantY)) * 0.2;
      return p;
    });
  }

  if (isPhoneView()) {
    camMode = "follow";
    userZoom = FOLLOW_ZOOM_DEFAULT;
  } else {
    camMode = "room";
    zoom = 1;
  }
  resize();
  requestAnimationFrame(render);

  const api = {
    ready: true,
    overlay,
    resize,
    setStyle(wp, fl) { if (wp) wallpaper = wp; if (fl) floorStyle = fl; },
    setGridSize(n) { gridSize = Math.max(4, Math.min(12, n || 6)); applyCamera(); },
    setFurniture(list) { furniture = (list || []).map((f) => ({ ...f })); },
    addFurniture(f) { furniture = furniture.concat([f]); },
    getFurniture() { return furniture.slice(); },
    setGhost(g) { ghost = g; },
    getGhost() { return ghost; },
    getWallGhost() { return wallGhost; },
    highlightFurniture(id) { highlightId = id || null; },
    projectFurniture(id) {
      const f = furniture.find((x) => x.id === id);
      if (!f) return null;
      const [, fh] = furnSize(f.type);
      const foot = footOf(f.x, f.y);
      return clientFromWorld(foot.sx, foot.sy - fh / 2);
    },
    setLights(on) { lightsOn = on !== false; },
    lightsOn() { return lightsOn; },
    tvOn(id) { return Boolean(tvs[id]?.on); },
    fridgeOpen(id) { return Boolean(uses[id]?.open); },
    setUses(u) { uses = u || {}; },
    setChessMap(m) { chess = m || {}; },
    setTvs(m) { tvs = m || {}; },
    setWallArt(list) { wallArt = list || []; },
    setWallGhost(type, wall, slot, ok) { wallGhost = type ? { type, wall, slot, ok } : null; },
    setArcade(m) { arcade = m || {}; },
    getArcade() { return arcade; },
    setServerTime(t) { serverTime0 = t || Date.now(); serverAt = performance.now(); },
    tvProgram() { return null; },
    nowServer,
    findFurnMesh,
    getWallArt() { return wallArt.slice(); },
    petSitting(name) {
      const p = people.find((x) => x.username === name);
      const st = personState.get(name);
      if (!p?.activePet) return false;
      return st ? !st.walking : !p.walking;
    },
    bagSwinging(id) { return Boolean(uses[id]?.hit || uses[id]?.swing); },
    personFlags(name) {
      const p = people.find((x) => x.username === name);
      if (!p) return null;
      const st = personState.get(name) || {};
      return {
        boxing: p.boxing, sitting: p.sitting, heldItem: p.heldItem, gym: p.gym, facing: p.facing,
        actionEmote: p.actionEmote, walking: Boolean(st.walking || p.walking), usingPhone: p.usingPhone,
        sculpted: false, paperDoll: true, pixel: true,
      };
    },
    personTile(name) {
      const st = personState.get(name);
      const p = people.find((x) => x.username === name);
      if (st) return { x: st.x, y: st.y };
      if (p) return { x: p.x, y: p.y };
      return null;
    },
    projectTile(tx, ty) {
      const p = footOf(tx, ty);
      return clientFromWorld(p.sx, p.sy - 2);
    },
    projectHead(name) {
      const st = personState.get(name);
      const p = people.find((x) => x.username === name);
      if (!st && !p) return null;
      const x = (st?.x ?? p.x) + 0.5, y = (st?.y ?? p.y) + 0.5;
      const foot = tileToScreen(x, y);
      const c = clientFromWorld(foot.sx, foot.sy - AV_H + 4);
      const rect = container.getBoundingClientRect();
      return { x: c.x - rect.left, y: c.y - rect.top, visible: c.visible };
    },
    syncPeople(list) { interpolatePeople(list || []); },
    setNpcs(list) { npcs = list || []; },
    onTileClick(fn) { onTileClick = fn; },
    onTileHover(fn) { onTileHover = fn; },
    onFurnitureClick(fn) { onFurnitureClick = fn; },
    onSwitchClick(fn) { onSwitchClick = fn; },
    onWallClick(fn) { onWallClick = fn; },
    onWallHover(fn) { onWallHover = fn; },
    simulateWallClick(wall, slot) { onWallClick?.(wall, slot); },
    setFollowName(name) { followName = name || null; },
    setCamMode,
    toggleCamMode() { return setCamMode(camMode === "follow" ? "room" : "follow"); },
    camState() {
      return {
        mode: isPhoneView() ? camMode : "room",
        zoom: (!isPhoneView() || camMode === "room") ? 1 : snapZoom(userZoom),
        phone: isPhoneView(),
        follow: followName,
        target: { x: camX, y: 0, z: camY },
      };
    },
    chessBoardInfo(id) {
      const m = findFurnMesh(id);
      if (!m || m.userData.type !== "chesstable") return null;
      return { square: 0.125, board: 1, table: 1.7 };
    },
    setZoom(z) {
      userZoom = snapZoom(z);
      if (isPhoneView() && camMode === "follow") zoom = userZoom;
    },
    tapAt(x, y) { handleTap({ clientX: x, clientY: y }); },
    roomFitsView() {
      const now = performance.now();
      const rect = canvas.getBoundingClientRect();
      const b = roomWorldBounds();
      const pad = 3;
      const pts = [[b.minX, b.maxY], [b.maxX, b.maxY], [b.minX, b.minY], [b.maxX, b.minY]];
      const saved = { camX, camY, zoom, camMode, userZoom };
      fitRoomCamera();
      const clipped = [];
      for (const [sx, sy] of pts) {
        const c = clientFromWorld(sx, sy, now);
        const ok = c.x >= rect.left - pad && c.x <= rect.right + pad && c.y >= rect.top - pad && c.y <= rect.bottom + pad;
        if (!ok) clipped.push({ x: c.x, y: c.y });
      }
      camX = saved.camX; camY = saved.camY; zoom = saved.zoom; camMode = saved.camMode; userZoom = saved.userZoom;
      return { ok: clipped.length === 0, clipped, rect: { left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom, width: rect.width, height: rect.height } };
    },
    setPlacing(type) { placing = type; if (!type) ghost = null; },
    simulateTileClick(tx, ty) { onTileClick?.(tx, ty); },
    simulateFurnitureClick(id, type, extra) { onFurnitureClick?.(id, type, extra || {}); },
    simulateSwitchClick() { onSwitchClick?.(); },
    clear() {
      furniture = []; wallArt = []; arcade = {}; people = []; npcs = [];
      personState.clear(); ghost = null; wallGhost = null;
    },
    dispose() { alive = false; container.innerHTML = ""; },
  };
  window.HouseRoom3D = api;
  return api;
}

export default { createRoom3D, createAvatarPreview };
