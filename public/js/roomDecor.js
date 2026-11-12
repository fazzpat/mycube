/* Room decor catalogs, normalization, and thumbnail / window helpers.
   Shared by the Edit Room "Room" tab and the isometric room renderer. */

export const FLOOR_COLORS = [
  { id: "honey", name: "Honey", hex: "#e0b068" },
  { id: "cream", name: "Cream", hex: "#efe0c8" },
  { id: "butter", name: "Butter", hex: "#f0d878" },
  { id: "cocoa", name: "Cocoa", hex: "#8a5a32" },
  { id: "cherry", name: "Cherry", hex: "#c44a52" },
  { id: "sage", name: "Sage", hex: "#8aaa7a" },
  { id: "sky", name: "Sky", hex: "#7eb0d4" },
  { id: "lilac", name: "Lilac", hex: "#b8a0d0" },
  { id: "blush", name: "Blush", hex: "#e8a0a0" },
  { id: "slate", name: "Slate", hex: "#8a94a8" },
];

export const FLOOR_PATTERNS = [
  { id: "wood", name: "Wood planks" },
  { id: "checker", name: "Checker" },
  { id: "carpet", name: "Carpet" },
  { id: "marble", name: "Marble" },
  { id: "stone", name: "Stone" },
  { id: "grid", name: "Grid tile" },
];

export const WALL_COLORS = [
  { id: "cream", name: "Cream", hex: "#efe4d2" },
  { id: "sage", name: "Sage", hex: "#c5d8b8" },
  { id: "blush", name: "Blush", hex: "#f0c8c4" },
  { id: "slate", name: "Slate", hex: "#c8d0e0" },
  { id: "honey", name: "Honey", hex: "#e8c888" },
  { id: "sky", name: "Sky", hex: "#c0d8ec" },
  { id: "lilac", name: "Lilac", hex: "#d4c8e8" },
  { id: "cocoa", name: "Cocoa", hex: "#c4a07a" },
  { id: "mint", name: "Mint", hex: "#c8e8d4" },
  { id: "peach", name: "Peach", hex: "#f0d0b8" },
];

export const WALL_PATTERNS = [
  { id: "plain", name: "Plain" },
  { id: "tiles", name: "Tiles" },
  { id: "stripes", name: "Stripes" },
  { id: "brick", name: "Brick" },
  { id: "floral", name: "Floral" },
  { id: "dots", name: "Dots" },
  { id: "woodpanel", name: "Wood panel" },
];

export const WINDOW_VIEWS = [
  { id: "day", name: "Day sky" },
  { id: "city", name: "Night city" },
  { id: "sunset", name: "Sunset" },
  { id: "beach", name: "Beach" },
  { id: "snow", name: "Snowy" },
  { id: "forest", name: "Forest" },
  { id: "space", name: "Stars" },
];

export const DOOR_STYLES = [
  { id: "wood", name: "Wood panel" },
  { id: "modern", name: "Modern white" },
  { id: "metal", name: "Steel" },
  { id: "glass", name: "Glass" },
  { id: "arch", name: "Arched" },
  { id: "shutter", name: "Shutter" },
];

export const DEFAULT_DECOR = {
  floorColor: "honey",
  floorPattern: "wood",
  wallColor: "cream",
  wallPattern: "tiles",
  windowView: "day",
  doorStyle: "wood",
};

const FLOOR_COLOR_IDS = FLOOR_COLORS.map((x) => x.id);
const FLOOR_PATTERN_IDS = FLOOR_PATTERNS.map((x) => x.id);
const WALL_COLOR_IDS = WALL_COLORS.map((x) => x.id);
const WALL_PATTERN_IDS = WALL_PATTERNS.map((x) => x.id);
const WINDOW_VIEW_IDS = WINDOW_VIEWS.map((x) => x.id);
const DOOR_STYLE_IDS = DOOR_STYLES.map((x) => x.id);

const LEGACY_WALL = {
  "paint-cream": { wallColor: "cream", wallPattern: "tiles" },
  "paint-sage": { wallColor: "sage", wallPattern: "tiles" },
  "paint-blush": { wallColor: "blush", wallPattern: "tiles" },
  "paint-slate": { wallColor: "slate", wallPattern: "tiles" },
  "stars-mint": { wallColor: "mint", wallPattern: "dots" },
  "dots-peach": { wallColor: "peach", wallPattern: "dots" },
  "stripes-lilac": { wallColor: "lilac", wallPattern: "stripes" },
};

const LEGACY_FLOOR = {
  wood: "wood",
  tile: "grid",
  carpet: "carpet",
};

export function floorColorHex(id) {
  return (FLOOR_COLORS.find((c) => c.id === id) || FLOOR_COLORS[0]).hex;
}

export function wallColorPal(id) {
  const hex = (WALL_COLORS.find((c) => c.id === id) || WALL_COLORS[0]).hex;
  return {
    base: hex,
    grout: shadeHex(hex, -28),
    cap: shadeHex(hex, -40),
    skirt: shadeHex(hex, -12),
    trim: shadeHex(hex, -36),
    accent: shadeHex(hex, 20),
  };
}

export function shadeHex(hex, amt) {
  const h = String(hex || "#888").replace("#", "");
  const n = h.length === 3 ? h.split("").map((c) => c + c).join("") : h;
  const v = parseInt(n, 16);
  const r = Math.max(0, Math.min(255, ((v >> 16) & 255) + amt));
  const g = Math.max(0, Math.min(255, ((v >> 8) & 255) + amt));
  const b = Math.max(0, Math.min(255, (v & 255) + amt));
  return "#" + ((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1);
}

export function normalizeDecor(input = {}, room = {}) {
  const legacy = LEGACY_WALL[input.wallpaper || room.wallpaper] || {};
  const floorFromLegacy = LEGACY_FLOOR[input.floorStyle || room.floorStyle];
  const src = { ...DEFAULT_DECOR, ...legacy, ...(floorFromLegacy ? { floorPattern: floorFromLegacy } : {}), ...room, ...input };
  const pick = (list, v, fb) => (list.includes(v) ? v : fb);
  return {
    floorColor: pick(FLOOR_COLOR_IDS, src.floorColor, DEFAULT_DECOR.floorColor),
    floorPattern: pick(FLOOR_PATTERN_IDS, src.floorPattern, DEFAULT_DECOR.floorPattern),
    wallColor: pick(WALL_COLOR_IDS, src.wallColor, DEFAULT_DECOR.wallColor),
    wallPattern: pick(WALL_PATTERN_IDS, src.wallPattern, DEFAULT_DECOR.wallPattern),
    windowView: pick(WINDOW_VIEW_IDS, src.windowView, DEFAULT_DECOR.windowView),
    doorStyle: pick(DOOR_STYLE_IDS, src.doorStyle, DEFAULT_DECOR.doorStyle),
  };
}

export function legacyAliases(decor) {
  const d = normalizeDecor(decor);
  const wallMap = {
    cream: "paint-cream", sage: "paint-sage", blush: "paint-blush", slate: "paint-slate",
    mint: "stars-mint", peach: "dots-peach", lilac: "stripes-lilac",
  };
  const floorMap = { wood: "wood", carpet: "carpet", checker: "tile", grid: "tile", marble: "tile", stone: "tile" };
  return {
    wallpaper: wallMap[d.wallColor] || "paint-cream",
    floorStyle: floorMap[d.floorPattern] || "wood",
  };
}

export function decorPayload(decor) {
  const d = normalizeDecor(decor);
  const alias = legacyAliases(d);
  return { ...d, ...alias };
}

function boundsOf(pts) {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const p of pts) {
    const x = p.sx ?? p.x, y = p.sy ?? p.y;
    if (x < minX) minX = x; if (y < minY) minY = y;
    if (x > maxX) maxX = x; if (y > maxY) maxY = y;
  }
  return { minX, minY, maxX, maxY, w: maxX - minX, h: maxY - minY };
}

export function drawWindowScenery(ctx, pts, view, now = 0, lightsOn = true) {
  if (!pts || pts.length < 4) return;
  const t = (now || 0) / 1000;
  const b = boundsOf(pts);
  ctx.save();
  ctx.beginPath();
  ctx.moveTo(pts[0].sx ?? pts[0].x, pts[0].sy ?? pts[0].y);
  for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].sx ?? pts[i].x, pts[i].sy ?? pts[i].y);
  ctx.closePath();
  ctx.clip();
  const x = b.minX, y = b.minY, w = Math.max(2, b.w), h = Math.max(2, b.h);
  const dim = lightsOn ? 1 : 0.55;
  const sky = (top, bot) => {
    const g = ctx.createLinearGradient(x, y, x, y + h);
    g.addColorStop(0, top);
    g.addColorStop(1, bot);
    ctx.fillStyle = g;
    ctx.fillRect(x - 1, y - 1, w + 2, h + 2);
  };
  if (view === "city") {
    sky("#1a1840", "#3a2860");
    ctx.fillStyle = "#120e28";
    const drift = (t * 4) % 8;
    for (let i = 0; i < 8; i++) {
      const bx = x + ((i * 11 + drift) % (w + 10)) - 4;
      const bh = h * (0.35 + (i % 4) * 0.12);
      ctx.fillRect(bx, y + h - bh, 8 + (i % 3) * 2, bh);
      ctx.fillStyle = "rgba(255, 214, 120, 0.7)";
      for (let wy = 0; wy < 5; wy++) {
        if ((i + wy + Math.floor(t * 2)) % 3 === 0) ctx.fillRect(bx + 1.5, y + h - bh + 3 + wy * 5, 1.6, 1.6);
      }
      ctx.fillStyle = "#120e28";
    }
  } else if (view === "sunset") {
    sky("#f4b878", "#e06a5a");
    ctx.fillStyle = "rgba(255, 230, 160, 0.85)";
    const sunX = x + w * 0.62, sunY = y + h * (0.55 + Math.sin(t * 0.3) * 0.02);
    ctx.beginPath(); ctx.arc(sunX, sunY, Math.min(w, h) * 0.18, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = "#6a3a4a";
    ctx.beginPath();
    ctx.moveTo(x - 2, y + h);
    ctx.lineTo(x + w * 0.25, y + h * 0.62);
    ctx.lineTo(x + w * 0.48, y + h);
    ctx.fill();
    ctx.fillStyle = "#4a2a38";
    ctx.beginPath();
    ctx.moveTo(x + w * 0.4, y + h);
    ctx.lineTo(x + w * 0.72, y + h * 0.55);
    ctx.lineTo(x + w + 2, y + h);
    ctx.fill();
  } else if (view === "beach") {
    sky("#7ec8f0", "#d8f0ff");
    ctx.fillStyle = "#3aa0d0";
    const wave = Math.sin(t * 1.4) * 2;
    ctx.fillRect(x - 1, y + h * 0.52 + wave, w + 2, h);
    ctx.fillStyle = "#5eb8e0";
    ctx.fillRect(x - 1, y + h * 0.52 + wave, w + 2, 3);
    ctx.fillStyle = "#e8d4a0";
    ctx.fillRect(x - 1, y + h * 0.72, w + 2, h);
    ctx.fillStyle = "#2a8a4a";
    ctx.beginPath();
    ctx.ellipse(x + w * 0.2, y + h * 0.78, 6, 3, 0, 0, Math.PI * 2);
    ctx.fill();
  } else if (view === "snow") {
    sky("#c8d8f0", "#eef4ff");
    ctx.fillStyle = "#9aacc4";
    ctx.beginPath();
    ctx.moveTo(x - 2, y + h);
    ctx.lineTo(x + w * 0.3, y + h * 0.42);
    ctx.lineTo(x + w * 0.58, y + h);
    ctx.fill();
    ctx.fillStyle = "#b8c8dc";
    ctx.beginPath();
    ctx.moveTo(x + w * 0.4, y + h);
    ctx.lineTo(x + w * 0.78, y + h * 0.36);
    ctx.lineTo(x + w + 2, y + h);
    ctx.fill();
    ctx.fillStyle = "#f4f8ff";
    ctx.fillRect(x - 1, y + h * 0.82, w + 2, h);
    ctx.fillStyle = "rgba(255,255,255,0.95)";
    for (let i = 0; i < 12; i++) {
      const fx = x + ((i * 17 + t * 18) % (w + 6));
      const fy = y + ((i * 11 + t * 24) % (h + 6));
      ctx.fillRect(fx, fy, 1.4, 1.4);
    }
  } else if (view === "forest") {
    sky("#8ec8e8", "#c8e8d8");
    ctx.fillStyle = "#2f6a3a";
    for (let i = 0; i < 6; i++) {
      const fx = x + i * (w / 5) - 4;
      const sway = Math.sin(t * 0.8 + i) * 1.2;
      ctx.beginPath();
      ctx.moveTo(fx + 7 + sway, y + h * 0.22);
      ctx.lineTo(fx + 16 + sway, y + h * 0.78);
      ctx.lineTo(fx - 2 + sway, y + h * 0.78);
      ctx.fill();
      ctx.fillStyle = "#3a2a18";
      ctx.fillRect(fx + 5, y + h * 0.72, 3, h * 0.3);
      ctx.fillStyle = "#2f6a3a";
    }
    ctx.fillStyle = "#4a8a4a";
    ctx.fillRect(x - 1, y + h * 0.86, w + 2, h);
  } else if (view === "space") {
    sky("#080818", "#1a1440");
    for (let i = 0; i < 18; i++) {
      const tw = 0.45 + 0.55 * Math.abs(Math.sin(t * 2 + i * 1.7));
      ctx.fillStyle = `rgba(255, 244, 210, ${tw})`;
      const sx = x + ((i * 13) % w);
      const sy = y + ((i * 9) % h);
      ctx.fillRect(sx, sy, 1.3, 1.3);
    }
    ctx.fillStyle = "#d8d0c0";
    ctx.beginPath();
    ctx.arc(x + w * 0.72, y + h * 0.32, Math.min(w, h) * 0.12, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#b8b0a0";
    ctx.beginPath();
    ctx.arc(x + w * 0.7, y + h * 0.3, Math.min(w, h) * 0.04, 0, Math.PI * 2);
    ctx.fill();
  } else {
    // day sky with clouds
    sky("#7ec4f0", "#d8eefc");
    ctx.fillStyle = "rgba(255,255,255,0.88)";
    const drift = (t * 10) % (w + 24);
    for (let i = 0; i < 2; i++) {
      const cx = x + ((drift + i * (w * 0.55)) % (w + 24)) - 12;
      const cy = y + h * (0.28 + i * 0.18);
      ctx.beginPath();
      ctx.ellipse(cx, cy, 9, 4.2, 0, 0, Math.PI * 2);
      ctx.ellipse(cx + 7, cy + 1, 7, 3.4, 0, 0, Math.PI * 2);
      ctx.ellipse(cx - 6, cy + 1.4, 6, 3, 0, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  if (dim < 1) {
    ctx.fillStyle = `rgba(0,0,0,${1 - dim})`;
    ctx.fillRect(x - 1, y - 1, w + 2, h + 2);
  }
  ctx.restore();
}

function thumbBg(ctx, w, h, hex) {
  ctx.fillStyle = shadeHex(hex, -18);
  ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = hex;
  ctx.fillRect(1, 1, w - 2, h - 2);
}

export function paintDecorThumb(canvas, kind, id, decor = {}) {
  if (!canvas) return;
  const w = canvas.width || 40, h = canvas.height || 32;
  const ctx = canvas.getContext("2d");
  ctx.imageSmoothingEnabled = false;
  ctx.clearRect(0, 0, w, h);
  const d = normalizeDecor(decor);
  if (kind === "floorColor" || kind === "wallColor") {
    const hex = kind === "floorColor" ? floorColorHex(id) : wallColorPal(id).base;
    thumbBg(ctx, w, h, hex);
    ctx.fillStyle = shadeHex(hex, 24);
    ctx.fillRect(2, 2, w - 6, 3);
    ctx.fillStyle = shadeHex(hex, -36);
    ctx.fillRect(1, h - 3, w - 2, 2);
    return;
  }
  if (kind === "floorPattern") {
    const hex = floorColorHex(d.floorColor);
    thumbBg(ctx, w, h, hex);
    ctx.strokeStyle = shadeHex(hex, -40);
    ctx.lineWidth = 1;
    if (id === "wood") {
      for (let y = 4; y < h; y += 6) {
        ctx.beginPath(); ctx.moveTo(2, y); ctx.lineTo(w - 2, y); ctx.stroke();
      }
    } else if (id === "checker") {
      for (let yy = 0; yy < 4; yy++) for (let xx = 0; xx < 4; xx++) {
        if ((xx + yy) % 2) {
          ctx.fillStyle = shadeHex(hex, -28);
          ctx.fillRect(2 + xx * ((w - 4) / 4), 2 + yy * ((h - 4) / 4), (w - 4) / 4, (h - 4) / 4);
        }
      }
    } else if (id === "grid") {
      ctx.strokeStyle = shadeHex(hex, -50);
      for (let i = 1; i < 4; i++) {
        const xx = 2 + i * ((w - 4) / 4), yy = 2 + i * ((h - 4) / 4);
        ctx.beginPath(); ctx.moveTo(xx, 2); ctx.lineTo(xx, h - 2); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(2, yy); ctx.lineTo(w - 2, yy); ctx.stroke();
      }
    } else if (id === "carpet") {
      ctx.strokeStyle = shadeHex(hex, 30);
      ctx.strokeRect(4, 4, w - 8, h - 8);
      ctx.fillStyle = shadeHex(hex, 18);
      ctx.fillRect(w / 2 - 1, h / 2 - 1, 2, 2);
    } else if (id === "marble") {
      ctx.strokeStyle = shadeHex(hex, 30);
      ctx.beginPath(); ctx.moveTo(3, 8); ctx.quadraticCurveTo(w * 0.5, 2, w - 3, 12); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(4, 20); ctx.quadraticCurveTo(w * 0.4, 16, w - 2, 22); ctx.stroke();
    } else if (id === "stone") {
      ctx.fillStyle = shadeHex(hex, -22);
      ctx.fillRect(3, 4, 10, 8);
      ctx.fillRect(16, 6, 12, 9);
      ctx.fillRect(6, 16, 14, 8);
      ctx.strokeStyle = shadeHex(hex, -40);
      ctx.strokeRect(3, 4, 10, 8);
      ctx.strokeRect(16, 6, 12, 9);
      ctx.strokeRect(6, 16, 14, 8);
    }
    return;
  }
  if (kind === "wallPattern") {
    const pal = wallColorPal(d.wallColor);
    thumbBg(ctx, w, h, pal.base);
    if (id === "tiles") {
      ctx.strokeStyle = pal.grout;
      for (let i = 1; i < 3; i++) {
        ctx.beginPath(); ctx.moveTo(2, 2 + i * (h - 4) / 3); ctx.lineTo(w - 2, 2 + i * (h - 4) / 3); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(2 + i * (w - 4) / 3, 2); ctx.lineTo(2 + i * (w - 4) / 3, h - 2); ctx.stroke();
      }
    } else if (id === "stripes") {
      ctx.fillStyle = shadeHex(pal.base, -18);
      for (let i = 0; i < 5; i++) ctx.fillRect(2 + i * 7, 2, 3, h - 4);
    } else if (id === "brick") {
      ctx.fillStyle = shadeHex(pal.base, -22);
      ctx.strokeStyle = pal.grout;
      for (let r = 0; r < 3; r++) {
        const off = r % 2 ? 6 : 0;
        for (let c = 0; c < 4; c++) {
          ctx.strokeRect(off + c * 12 - 2, 3 + r * 9, 11, 8);
        }
      }
    } else if (id === "floral") {
      ctx.fillStyle = shadeHex(pal.base, -30);
      for (const p of [[8, 10], [22, 8], [16, 20], [28, 18]]) {
        ctx.beginPath(); ctx.arc(p[0], p[1], 2.2, 0, Math.PI * 2); ctx.fill();
      }
    } else if (id === "dots") {
      ctx.fillStyle = shadeHex(pal.base, -28);
      for (let yy = 0; yy < 3; yy++) for (let xx = 0; xx < 4; xx++) {
        ctx.beginPath(); ctx.arc(6 + xx * 8, 7 + yy * 8, 1.6, 0, Math.PI * 2); ctx.fill();
      }
    } else if (id === "woodpanel") {
      ctx.strokeStyle = shadeHex(pal.base, -36);
      for (let i = 1; i < 4; i++) {
        ctx.beginPath(); ctx.moveTo(2 + i * (w - 4) / 4, 2); ctx.lineTo(2 + i * (w - 4) / 4, h - 2); ctx.stroke();
      }
    }
    ctx.fillStyle = pal.skirt;
    ctx.fillRect(0, h - 4, w, 4);
    return;
  }
  if (kind === "windowView") {
    const pts = [{ x: 1, y: 1 }, { x: w - 1, y: 1 }, { x: w - 1, y: h - 1 }, { x: 1, y: h - 1 }];
    drawWindowScenery(ctx, pts, id, 0, true);
    ctx.strokeStyle = "#3a2c24";
    ctx.lineWidth = 2;
    ctx.strokeRect(1, 1, w - 2, h - 2);
    ctx.beginPath(); ctx.moveTo(w / 2, 1); ctx.lineTo(w / 2, h - 1); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(1, h / 2); ctx.lineTo(w - 1, h / 2); ctx.stroke();
    return;
  }
  if (kind === "doorStyle") {
    ctx.fillStyle = "#c4b090";
    ctx.fillRect(0, 0, w, h);
    const frame = "#3a2418";
    const body = id === "modern" ? "#efe8dc" : id === "metal" ? "#8a9098" : id === "glass" ? "#8ab8c8" : id === "shutter" ? "#6a6e74" : "#6b3e22";
    ctx.fillStyle = frame;
    ctx.fillRect(6, 2, w - 12, h - 3);
    ctx.fillStyle = body;
    ctx.fillRect(8, 4, w - 16, h - 7);
    if (id === "wood" || id === "arch") {
      ctx.strokeStyle = shadeHex(body, -30);
      ctx.strokeRect(10, 6, w - 20, (h - 14) / 2);
      ctx.strokeRect(10, 8 + (h - 14) / 2, w - 20, (h - 14) / 2);
    }
    if (id === "glass") {
      ctx.fillStyle = "rgba(200,230,240,0.7)";
      ctx.fillRect(9, 5, (w - 18) / 2 - 1, h - 10);
      ctx.fillRect(9 + (w - 18) / 2 + 1, 5, (w - 18) / 2 - 1, h - 10);
    }
    if (id === "shutter") {
      ctx.strokeStyle = shadeHex(body, -30);
      for (let i = 1; i < 5; i++) {
        const yy = 5 + i * ((h - 12) / 5);
        ctx.beginPath(); ctx.moveTo(9, yy); ctx.lineTo(w - 9, yy); ctx.stroke();
      }
    }
    if (id === "arch") {
      ctx.fillStyle = "#c4b090";
      ctx.fillRect(6, 2, w - 12, 5);
      ctx.fillStyle = frame;
      ctx.beginPath();
      ctx.moveTo(6, 8);
      ctx.quadraticCurveTo(w / 2, 0, w - 6, 8);
      ctx.lineTo(w - 6, 10);
      ctx.quadraticCurveTo(w / 2, 2, 6, 10);
      ctx.fill();
    }
    if (id === "metal") {
      ctx.fillStyle = "#d4d8dc";
      ctx.fillRect(w / 2 - 6, h * 0.55, 12, 2);
    } else {
      ctx.fillStyle = id === "modern" ? "#b0b4b8" : "#d4b46a";
      ctx.beginPath(); ctx.arc(w - 12, h * 0.55, 1.8, 0, Math.PI * 2); ctx.fill();
    }
  }
}

export const DECOR_GROUPS = [
  { id: "floor", label: "Floor", colors: FLOOR_COLORS, colorKey: "floorColor", patterns: FLOOR_PATTERNS, patternKey: "floorPattern" },
  { id: "wall", label: "Wall", colors: WALL_COLORS, colorKey: "wallColor", patterns: WALL_PATTERNS, patternKey: "wallPattern" },
  { id: "window", label: "Window", options: WINDOW_VIEWS, key: "windowView" },
  { id: "door", label: "Door", options: DOOR_STYLES, key: "doorStyle" },
];
