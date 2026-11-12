/* 2D isometric (2:1) room helpers — original art, no 3D engine. */
(function (global) {
  const GRID = 6;
  const TW = 72;
  const TH = 36;
  const WALL_H = 148;
  const PAD = 24;

  const CATALOG = {
    rug: { name: "Rug", price: 15, w: 2, h: 2, blocks: false },
    plant: { name: "Plant", price: 20, w: 1, h: 1, blocks: true },
    lamp: { name: "Floor lamp", price: 25, w: 1, h: 1, blocks: true },
    table: { name: "Dining table", price: 30, w: 2, h: 1, blocks: true },
    couch: { name: "Couch", price: 40, w: 2, h: 1, blocks: true },
    bed: { name: "Bed", price: 45, w: 1, h: 2, blocks: true },
    coffeetable: { name: "Coffee table", price: 22, w: 2, h: 1, blocks: true },
    tv: { name: "TV stand", price: 35, w: 2, h: 1, blocks: true },
    fridge: { name: "Fridge", price: 30, w: 1, h: 1, blocks: true },
    kitchenette: { name: "Kitchenette", price: 32, w: 2, h: 1, blocks: true },
    chair: { name: "Chair", price: 12, w: 1, h: 1, blocks: true },
    bookshelf: { name: "Bookshelf", price: 28, w: 2, h: 1, blocks: true },
    chesstable: { name: "Chess table", price: 45, w: 1, h: 1, blocks: true },
    punchbag: { name: "Punching bag", price: 30, w: 1, h: 1, blocks: true },
    benchpress: { name: "Bench press", price: 35, w: 2, h: 1, blocks: true },
    treadmill: { name: "Treadmill", price: 35, w: 1, h: 2, blocks: true },
    cubics: { name: "Retro Arcade", price: 40, w: 1, h: 1, blocks: true },
    clothescab: { name: "Clothes cabinet", price: 30, w: 1, h: 1, blocks: true },
    coffeemachine: { name: "Coffee maker", price: 25, w: 1, h: 1, blocks: true },
    stove: { name: "Stove", price: 30, w: 1, h: 1, blocks: true },
    pooltable: { name: "Pool Table", price: 60, w: 2, h: 2, blocks: true },
    cuerack: { name: "Cue Rack", price: 20, w: 1, h: 1, blocks: false, surface: "wall" },
    recordplayer: { name: "Record table", price: 28, w: 1, h: 1, blocks: true },
    art_mona: { name: "Mona Cuba", price: 22, w: 1, h: 1, blocks: false, surface: "wall" },
    art_starry: { name: "Starry Cube Night", price: 28, w: 1, h: 1, blocks: false, surface: "wall" },
    art_pop: { name: "Pop-art cubes", price: 18, w: 1, h: 1, blocks: false, surface: "wall" },
    art_sunset: { name: "Cube sunset", price: 16, w: 1, h: 1, blocks: false, surface: "wall" },
    art_cubism: { name: "Cubism", price: 24, w: 1, h: 1, blocks: false, surface: "wall" },
    art_poster: { name: "CUBICS poster", price: 10, w: 1, h: 1, blocks: false, surface: "wall" },
    art_hang: { name: "Hang In There", price: 14, w: 1, h: 1, blocks: false, surface: "wall" },
    art_neon: { name: "my cube neon", price: 30, w: 1, h: 1, blocks: false, surface: "wall" },
    hoverchair: { name: "Egg Chair", price: 30, w: 1, h: 1, blocks: true },
    djdeck: { name: "DJ Deck", price: 40, w: 2, h: 1, blocks: true },
    sodavending: { name: "Cube Cola Vendor", price: 28, w: 1, h: 1, blocks: true },
    neonsign: { name: "Lava Lamp", price: 22, w: 1, h: 1, blocks: true },
    capsulecouch: { name: "Studio Couch", price: 36, w: 2, h: 1, blocks: true },
    podplant: { name: "Potted Plant", price: 16, w: 1, h: 1, blocks: true },
    holotv: { name: "TV", price: 32, w: 2, h: 1, blocks: true },
    pinball: { name: "Pinball cabinet", price: 38, w: 1, h: 1, blocks: true },
  };
  const WALL_ART = ["art_mona", "art_starry", "art_pop", "art_sunset", "art_cubism", "art_poster", "art_hang", "art_neon", "cuerack"];

  const WALLPAPERS = [
    { id: "paint-cream", name: "Grey Tile", wall: "#9aa0aa", wall2: "#6d727a", ink: "#2a2c30" },
    { id: "paint-sage", name: "Sage Green", wall: "#8a9a86", wall2: "#6a8a4a", ink: "#2a3228" },
    { id: "paint-blush", name: "Blush Pink", wall: "#c4a8a6", wall2: "#c48a80", ink: "#4a3230" },
    { id: "paint-slate", name: "Slate Blue", wall: "#8a8e9a", wall2: "#6a7a9a", ink: "#2a2c34" },
  ];

  const FLOORS = [
    { id: "wood", name: "Wood Planks", colors: ["#8a5a32", "#c4a070"] },
    { id: "tile", name: "Grey Tile", colors: ["#b4b8c0", "#6d727a"] },
    { id: "carpet", name: "Pattern Rug", colors: ["#9a2030", "#e8c878"] },
  ];

  function tileToScreen(tx, ty) {
    return { x: (tx - ty) * (TW / 2), y: (tx + ty) * (TH / 2) };
  }

  function sceneMetrics() {
    const w = GRID * TW + PAD * 2;
    const h = WALL_H + GRID * TH + 110;
    const ox = w / 2;
    const oy = WALL_H + 12;
    return { w, h, ox, oy };
  }

  function tileCenter(tx, ty) {
    const top = tileToScreen(tx, ty);
    return { x: top.x, y: top.y + TH / 2 };
  }

  function footprintCenter(x, y, w, h) {
    return tileToScreen(x + w / 2, y + h / 2);
  }

  function normalizeRot(rot) {
    const n = Number(rot);
    if (!Number.isFinite(n)) return 0;
    if (Math.abs(n) >= 45) {
      const deg = ((n % 360) + 360) % 360;
      return Math.round(deg / 90) % 4;
    }
    return ((Math.round(n) % 4) + 4) % 4;
  }

  function dims(type, rot) {
    const item = CATALOG[type];
    if (!item) return { w: 1, h: 1 };
    const r = normalizeRot(rot);
    return r % 2 === 1 ? { w: item.h, h: item.w } : { w: item.w, h: item.h };
  }

  function tilesFor(type, x, y, rot) {
    const { w, h } = dims(type, rot);
    const out = [];
    for (let dy = 0; dy < h; dy++) {
      for (let dx = 0; dx < w; dx++) out.push({ x: x + dx, y: y + dy });
    }
    return out;
  }

  function inBounds(x, y, size) {
    const n = size || GRID;
    return x >= 0 && y >= 0 && x < n && y < n;
  }

  function blockedSet(furniture) {
    const set = new Set();
    (furniture || []).forEach((f) => {
      if (isWallArt(f.type) || f.wall) return;
      const item = CATALOG[f.type];
      if (!item || !item.blocks) return;
      tilesFor(f.type, f.x, f.y, f.rot).forEach((t) => set.add(t.x + "," + t.y));
    });
    return set;
  }

  function occupiedSet(furniture, ignoreId) {
    const set = new Set();
    (furniture || []).forEach((f) => {
      if (ignoreId && f.id === ignoreId) return;
      if (isWallArt(f.type) || f.wall) return;
      tilesFor(f.type, f.x, f.y, f.rot).forEach((t) => set.add(t.x + "," + t.y));
    });
    return set;
  }

  function canPlace(furniture, type, x, y, size, rot, ignoreId) {
    const item = CATALOG[type];
    if (!item || item.surface === "wall") return false;
    const tiles = tilesFor(type, x, y, rot);
    if (!tiles.length || tiles.some((t) => !inBounds(t.x, t.y, size))) return false;
    const used = occupiedSet(furniture, ignoreId);
    return tiles.every((t) => !used.has(t.x + "," + t.y));
  }

  function isWallArt(type) {
    return Boolean(CATALOG[type]?.surface === "wall");
  }

  function reservedWallSlots(size) {
    const n = size || GRID;
    const back = new Set();
    const left = new Set();
    const winX = 0;
    for (let s = 0; s < n; s++) {
      const cx = s + 0.5 - n / 2;
      if (Math.abs(cx - winX) < 1.05) back.add(s);
    }
    const door = Math.round((n - 1) / 2);
    left.add(door); // door in the middle of the left wall
    left.add(Math.max(0, door - 1)); // light switch beside the door
    return { back, left };
  }

  function canPlaceWall(art, wall, slot, size) {
    if (!isWallArt(art)) return false;
    if (wall !== "back" && wall !== "left") return false;
    const n = size || GRID;
    const s = Math.round(Number(slot));
    if (s < 0 || s >= n) return false;
    const reserved = reservedWallSlots(n)[wall];
    if (reserved.has(s)) return false;
    return true;
  }

  function wallOccupied(list, wall, slot, ignoreId) {
    return (list || []).some((a) => a.wall === wall && a.slot === slot && a.id !== ignoreId);
  }

  function seatCount(type) {
    if (type === "couch" || type === "capsulecouch") return 2;
    if (type === "chair" || type === "hoverchair") return 1;
    return 0;
  }

  function seatPose(furn, seatNum) {
    const n = seatCount(furn.type) || 1;
    const r = normalizeRot(furn.rot);
    const { w, h } = dims(furn.type, r);
    const cx = furn.x + (w - 1) / 2;
    const cy = furn.y + (h - 1) / 2;
    const t = n === 1 ? 0 : (seatNum / (n - 1) - 0.5);
    const along = (r % 2 === 0 ? w : h) * 0.42;
    const localX = t * along;
    const localY = 0.08;
    // rot 0: width +x, forward +y (away from back at -y)
    if (r === 0) return { x: cx + localX, y: cy + localY, facing: { x: 0, z: 1 } };
    if (r === 1) return { x: cx + localY, y: cy - localX, facing: { x: 1, z: 0 } };
    if (r === 2) return { x: cx - localX, y: cy - localY, facing: { x: 0, z: -1 } };
    return { x: cx - localY, y: cy + localX, facing: { x: -1, z: 0 } };
  }

  function nearestFreeTile(fromX, fromY, blocked, size, extra) {
    const sx = Math.round(fromX);
    const sy = Math.round(fromY);
    const seen = new Set();
    const q = [];
    function consider(x, y) {
      const k = x + "," + y;
      if (seen.has(k) || !inBounds(x, y, size)) return false;
      seen.add(k);
      const taken = (blocked && blocked.has(k)) || (extra && extra.has(k));
      if (!taken) return true;
      q.push({ x, y });
      return false;
    }
    if (consider(sx, sy)) return { x: sx, y: sy };
    while (q.length) {
      const cur = q.shift();
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = cur.x + dx, ny = cur.y + dy;
        if (consider(nx, ny)) return { x: nx, y: ny };
      }
    }
    return null;
  }

  function canPlacePet(furniture, pets, x, y, size, ignore) {
    const tx = Math.round(Number(x));
    const ty = Math.round(Number(y));
    if (!inBounds(tx, ty, size)) return false;
    if (blockedSet(furniture).has(tx + "," + ty)) return false;
    return !(pets || []).some((p) => {
      if (ignore && ignore.id && p.id === ignore.id) return false;
      if (ignore && p.owner === ignore.owner && p.item === ignore.item) return false;
      return Math.round(p.x) === tx && Math.round(p.y) === ty;
    });
  }

  function pathfind(from, to, blocked, size) {
    const start = { x: Math.round(from.x), y: Math.round(from.y) };
    const goal = { x: Math.round(to.x), y: Math.round(to.y) };
    const key = (p) => p.x + "," + p.y;
    if (!inBounds(goal.x, goal.y, size) || blocked.has(key(goal))) return null;
    if (start.x === goal.x && start.y === goal.y) return [start];
    const q = [start];
    const prev = new Map();
    prev.set(key(start), null);
    const dirs = [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ];
    while (q.length) {
      const cur = q.shift();
      if (cur.x === goal.x && cur.y === goal.y) {
        const path = [];
        let n = cur;
        while (n) {
          path.push(n);
          n = prev.get(key(n));
        }
        return path.reverse();
      }
      for (const [dx, dy] of dirs) {
        const nx = cur.x + dx;
        const ny = cur.y + dy;
        const k = nx + "," + ny;
        if (!inBounds(nx, ny, size) || prev.has(k)) continue;
        if (blocked.has(k) && !(nx === goal.x && ny === goal.y && !blocked.has(k))) continue;
        if (blocked.has(k)) continue;
        prev.set(k, cur);
        q.push({ x: nx, y: ny });
      }
    }
    return null;
  }

  function floorColor(style, tx, ty) {
    const pal = (FLOORS.find((f) => f.id === style) || FLOORS[0]).colors;
    if (style === "wood") return pal[(tx + ty) % 2];
    if (style === "checker") return pal[(tx + ty) % 2];
    return pal[(tx + ty * 3) % pal.length];
  }

  function wallpaper(style) {
    return WALLPAPERS.find((w) => w.id === style) || WALLPAPERS[0];
  }

  function tilePoly(tx, ty, ox, oy) {
    const a = tileToScreen(tx, ty);
    const b = tileToScreen(tx + 1, ty);
    const c = tileToScreen(tx + 1, ty + 1);
    const d = tileToScreen(tx, ty + 1);
    return [a, b, c, d].map((p) => `${ox + p.x},${oy + p.y}`).join(" ");
  }

  function roomSVG(wallpaperId, floorId) {
    const { w, h, ox, oy } = sceneMetrics();
    const paper = wallpaper(wallpaperId);
    const back = tileToScreen(0, 0);
    const left = tileToScreen(0, GRID);
    const right = tileToScreen(GRID, 0);
    const leftWall = [
      `${ox + back.x},${oy + back.y}`,
      `${ox + left.x},${oy + left.y}`,
      `${ox + left.x},${oy + left.y - WALL_H}`,
      `${ox + back.x},${oy + back.y - WALL_H}`,
    ].join(" ");
    const rightWall = [
      `${ox + back.x},${oy + back.y}`,
      `${ox + right.x},${oy + right.y}`,
      `${ox + right.x},${oy + right.y - WALL_H}`,
      `${ox + back.x},${oy + back.y - WALL_H}`,
    ].join(" ");

    let extras = "";
    if (paper.id === "stars-mint" || paper.id === "hearts-coral") {
      const mark = paper.id === "hearts-coral" ? "♥" : "★";
      for (let i = 0; i < 14; i++) {
        const t = i / 14;
        extras += `<text x="${ox + back.x - 90 + (i % 5) * 36}" y="${oy + back.y - WALL_H + 28 + Math.floor(i / 5) * 32}" fill="${paper.ink}" font-size="16" opacity=".55">${mark}</text>`;
      }
    } else if (paper.id === "dots-peach") {
      for (let i = 0; i < 18; i++) {
        extras += `<circle cx="${ox - 110 + (i % 6) * 42}" cy="${oy + back.y - WALL_H + 24 + Math.floor(i / 6) * 36}" r="5" fill="${paper.ink}" opacity=".45"/>`;
      }
    } else {
      for (let i = 0; i < 8; i++) {
        extras += `<line x1="${ox - 140}" y1="${oy + back.y - WALL_H + 16 + i * 18}" x2="${ox + 140}" y2="${oy + back.y - WALL_H + 16 + i * 18}" stroke="${paper.ink}" stroke-width="6" opacity=".28"/>`;
      }
    }

    let tiles = "";
    for (let sum = 0; sum <= GRID * 2; sum++) {
      for (let tx = 0; tx < GRID; tx++) {
        const ty = sum - tx;
        if (ty < 0 || ty >= GRID) continue;
        tiles += `<polygon points="${tilePoly(tx, ty, ox, oy)}" fill="${floorColor(floorId, tx, ty)}" stroke="#3d2c29" stroke-width="1.6" opacity=".96"/>`;
      }
    }

    return `<svg class="iso-bg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" aria-hidden="true">
      <polygon points="${leftWall}" fill="${paper.wall}" stroke="#2a1810" stroke-width="3"/>
      <polygon points="${rightWall}" fill="${paper.wall2}" stroke="#2a1810" stroke-width="3"/>
      <g pointer-events="none">${extras}</g>
      ${tiles}
    </svg>`;
  }

  function furnitureSVG(type) {
    const ink = "#2a1810";
    if (type === "rug") {
      return `<svg class="furn-svg" width="130" height="72" viewBox="0 0 130 72">
        <polygon points="65,6 124,36 65,66 6,36" fill="#ff4d8d" stroke="${ink}" stroke-width="3"/>
        <polygon points="65,16 108,36 65,56 22,36" fill="#ffd166" stroke="${ink}" stroke-width="2"/>
        <polygon points="65,24 90,36 65,48 40,36" fill="#7c5cff"/>
      </svg>`;
    }
    if (type === "plant") {
      return `<svg class="furn-svg" width="70" height="86" viewBox="0 0 70 86">
        <ellipse cx="35" cy="80" rx="16" ry="5" fill="#2a1810" opacity=".18"/>
        <path d="M22 62 H48 L44 80 H26 Z" fill="#ff7a59" stroke="${ink}" stroke-width="3"/>
        <circle cx="35" cy="36" r="16" fill="#3ddc84" stroke="${ink}" stroke-width="3"/>
        <circle cx="20" cy="42" r="12" fill="#19c37d" stroke="${ink}" stroke-width="3"/>
        <circle cx="50" cy="40" r="13" fill="#6ef0a8" stroke="${ink}" stroke-width="3"/>
      </svg>`;
    }
    if (type === "lamp") {
      return `<svg class="furn-svg" width="68" height="96" viewBox="0 0 68 96">
        <ellipse cx="34" cy="26" rx="22" ry="12" fill="#fff3a0" opacity=".9"/>
        <path d="M14 28 L54 28 L46 50 H22 Z" fill="#ffd000" stroke="${ink}" stroke-width="3"/>
        <rect x="31" y="50" width="6" height="32" fill="#7c5cff" stroke="${ink}" stroke-width="2"/>
        <rect x="20" y="82" width="28" height="7" rx="3" fill="#ff4d8d" stroke="${ink}" stroke-width="2"/>
      </svg>`;
    }
    if (type === "table") {
      return `<svg class="furn-svg" width="118" height="74" viewBox="0 0 118 74">
        <ellipse cx="59" cy="30" rx="50" ry="16" fill="#00d4c8" stroke="${ink}" stroke-width="3"/>
        <ellipse cx="59" cy="24" rx="50" ry="16" fill="#5ef0e6" stroke="${ink}" stroke-width="3"/>
        <rect x="24" y="38" width="7" height="24" fill="#2a1810"/>
        <rect x="87" y="38" width="7" height="24" fill="#2a1810"/>
        <circle cx="44" cy="22" r="6" fill="#ff4d6d" stroke="${ink}" stroke-width="2"/>
        <circle cx="70" cy="20" r="5" fill="#ffd000" stroke="${ink}" stroke-width="2"/>
      </svg>`;
    }
    const icons = {
      bed: `<svg class="furn-svg" width="70" height="80" viewBox="0 0 70 80"><rect x="16" y="18" width="38" height="54" rx="5" fill="#4a7ab0" stroke="${ink}" stroke-width="2"/><rect x="20" y="22" width="30" height="16" rx="4" fill="#fff8f0" stroke="${ink}" stroke-width="1.5"/><rect x="20" y="40" width="30" height="6" fill="#6a96c4"/></svg>`,
      coffeetable: `<svg class="furn-svg" width="90" height="50" viewBox="0 0 90 50"><rect x="10" y="18" width="70" height="10" rx="3" fill="#8b5a2b" stroke="${ink}" stroke-width="2"/><rect x="16" y="28" width="6" height="16" fill="#5a3a1c"/><rect x="68" y="28" width="6" height="16" fill="#5a3a1c"/></svg>`,
      tv: `<svg class="furn-svg" width="90" height="110" viewBox="0 0 90 110"><rect x="8" y="86" width="74" height="16" rx="2" fill="#6b4a2c" stroke="${ink}" stroke-width="2"/><rect x="14" y="90" width="18" height="8" rx="1" fill="#4a3220"/><rect x="58" y="90" width="18" height="8" rx="1" fill="#4a3220"/><rect x="38" y="80" width="14" height="8" fill="#1a1c22"/><rect x="12" y="8" width="66" height="76" rx="2" fill="#1a1c22" stroke="${ink}" stroke-width="2"/><rect x="16" y="14" width="58" height="60" fill="#152238"/></svg>`,
      fridge: `<svg class="furn-svg" width="50" height="80" viewBox="0 0 50 80"><rect x="8" y="6" width="34" height="68" rx="4" fill="#ece7df" stroke="${ink}" stroke-width="2"/><rect x="34" y="22" width="4" height="16" fill="#b0a89c"/></svg>`,
      kitchenette: `<svg class="furn-svg" width="90" height="56" viewBox="0 0 90 56"><rect x="6" y="20" width="78" height="28" fill="#d8c6a8" stroke="${ink}" stroke-width="2"/><rect x="6" y="16" width="78" height="8" fill="#8a8f96" stroke="${ink}" stroke-width="2"/></svg>`,
      chair: `<svg class="furn-svg" width="56" height="70" viewBox="0 0 56 70"><rect x="10" y="28" width="36" height="10" fill="#c4a06a" stroke="${ink}" stroke-width="2"/><rect x="10" y="8" width="36" height="20" fill="#b08958" stroke="${ink}" stroke-width="2"/><rect x="12" y="38" width="6" height="22" fill="#6b4a2b"/><rect x="38" y="38" width="6" height="22" fill="#6b4a2b"/></svg>`,
      bookshelf: `<svg class="furn-svg" width="90" height="76" viewBox="0 0 90 76"><rect x="8" y="6" width="74" height="64" fill="#8b5a2b" stroke="${ink}" stroke-width="2"/><rect x="14" y="16" width="10" height="18" fill="#6c5cff"/><rect x="28" y="16" width="10" height="18" fill="#e05656"/><rect x="42" y="16" width="10" height="18" fill="#3a8f5a"/></svg>`,
      chesstable: `<svg class="furn-svg" width="64" height="64" viewBox="0 0 64 64"><rect x="14" y="28" width="36" height="22" rx="3" fill="#8b5a2b" stroke="${ink}" stroke-width="2"/><rect x="18" y="16" width="28" height="28" fill="#f3eadc" stroke="${ink}" stroke-width="2"/><path d="M18 16h7v7H18zM32 16h7v7H32zM25 23h7v7h-7zM39 23h7v7h-7zM18 30h7v7H18zM32 30h7v7H32z" fill="#3d2c29"/><rect x="6" y="36" width="12" height="10" rx="2" fill="#6b4a2c" stroke="${ink}" stroke-width="1.5"/><rect x="46" y="36" width="12" height="10" rx="2" fill="#6b4a2c" stroke="${ink}" stroke-width="1.5"/></svg>`,
      punchbag: `<svg class="furn-svg" width="56" height="80" viewBox="0 0 56 80"><line x1="28" y1="4" x2="28" y2="16" stroke="${ink}" stroke-width="3"/><rect x="14" y="16" width="28" height="52" rx="12" fill="#c44536" stroke="${ink}" stroke-width="2"/><rect x="16" y="28" width="24" height="8" fill="#eee3d6"/></svg>`,
      benchpress: `<svg class="furn-svg" width="90" height="56" viewBox="0 0 90 56"><rect x="16" y="28" width="58" height="10" rx="2" fill="#d8c6a8" stroke="${ink}" stroke-width="2"/><rect x="12" y="14" width="8" height="28" fill="#6b6f78"/><rect x="70" y="14" width="8" height="28" fill="#6b6f78"/><rect x="8" y="12" width="74" height="6" rx="2" fill="#2a2a2e"/></svg>`,
      treadmill: `<svg class="furn-svg" width="70" height="70" viewBox="0 0 70 70"><rect x="16" y="36" width="40" height="18" rx="3" fill="#3d342c" stroke="${ink}" stroke-width="2"/><rect x="20" y="8" width="8" height="32" fill="#6b6f78"/><rect x="18" y="6" width="28" height="8" fill="#2a2a2e"/></svg>`,
      cubics: `<svg class="furn-svg" width="56" height="96" viewBox="0 0 56 96">
<rect x="16" y="6" width="26" height="10" rx="1.5" fill="#1a1a1e" stroke="${ink}" stroke-width="2"/>
<rect x="18" y="8" width="22" height="6" fill="#39ff14"/>
<text x="29" y="13" text-anchor="middle" font-size="5.5" font-weight="700" fill="#06140a" font-family="monospace">CUBICS</text>
<rect x="14" y="16" width="28" height="70" rx="2" fill="#1a1a1e" stroke="${ink}" stroke-width="2"/>
<rect x="42" y="16" width="8" height="70" fill="#141418" stroke="${ink}" stroke-width="1.5"/>
<rect x="44" y="20" width="2.2" height="2.2" fill="#39ff14"/><rect x="47" y="20" width="2.2" height="2.2" fill="#39ff14"/>
<rect x="44" y="23" width="2.2" height="2.2" fill="#39ff14"/><rect x="47" y="23" width="2.2" height="2.2" fill="#39ff14"/>
<rect x="44" y="28" width="2.2" height="2.2" fill="#39ff14"/><rect x="44" y="31" width="2.2" height="2.2" fill="#39ff14"/>
<rect x="44" y="34" width="2.2" height="2.2" fill="#39ff14"/><rect x="47" y="34" width="2.2" height="2.2" fill="#39ff14"/>
<rect x="47" y="40" width="2.2" height="2.2" fill="#39ff14"/>
<rect x="44" y="43" width="2.2" height="2.2" fill="#39ff14"/><rect x="47" y="43" width="2.2" height="2.2" fill="#39ff14"/><rect x="50" y="43" width="2.2" height="2.2" fill="#39ff14"/>
<rect x="44" y="54" width="2.2" height="8" fill="#0a0a0c"/><rect x="47.4" y="54" width="2.2" height="8" fill="#0a0a0c"/>
<rect x="17" y="20" width="22" height="32" fill="#0c0c10" stroke="${ink}" stroke-width="1.5"/>
<rect x="19" y="22" width="18" height="28" fill="#3ee01a"/>
<rect x="21" y="24" width="7" height="5" fill="#e8ffe0"/>
<rect x="18" y="52" width="20" height="8" fill="#141418" stroke="${ink}" stroke-width="1.5"/>
<rect x="23" y="55" width="1" height="2" fill="#4a4a52"/><rect x="22" y="53" width="3" height="3" fill="#e82838"/>
<rect x="27" y="54" width="2" height="2" fill="#e82838"/><rect x="31" y="54" width="2" height="2" fill="#f4c15d"/>
<rect x="18" y="66" width="18" height="14" fill="#2a2a32" stroke="${ink}" stroke-width="1.5"/>
<rect x="18" y="66" width="18" height="2" fill="#39ff14"/>
<rect x="24" y="72" width="8" height="3" fill="#f4c15d"/>
<ellipse cx="12" cy="84" rx="5" ry="3" fill="#3a3a42" stroke="${ink}" stroke-width="1"/>
<rect x="10" y="84" width="1.6" height="7" fill="#e8e8ee"/><rect x="12.2" y="84" width="1.6" height="7" fill="#e8e8ee"/><rect x="14.4" y="84" width="1.6" height="7" fill="#e8e8ee"/>
</svg>`,
      clothescab: `<svg class="furn-svg" width="56" height="80" viewBox="0 0 56 80"><rect x="8" y="6" width="40" height="68" rx="3" fill="#8b5a2b" stroke="${ink}" stroke-width="2"/><line x1="12" y1="16" x2="44" y2="16" stroke="${ink}" stroke-width="2"/><rect x="16" y="18" width="10" height="22" fill="#7c5cff"/><rect x="30" y="18" width="10" height="22" fill="#ff7a59"/></svg>`,
      pooltable: `<svg class="furn-svg" width="90" height="70" viewBox="0 0 90 70"><rect x="8" y="22" width="74" height="36" rx="3" fill="#6b4228" stroke="${ink}" stroke-width="2"/><rect x="14" y="27" width="62" height="26" rx="2" fill="#1c7a3a"/><circle cx="16" cy="29" r="3" fill="#1a1214"/><circle cx="74" cy="29" r="3" fill="#1a1214"/><circle cx="16" cy="51" r="3" fill="#1a1214"/><circle cx="74" cy="51" r="3" fill="#1a1214"/><circle cx="45" cy="29" r="3" fill="#1a1214"/><circle cx="45" cy="51" r="3" fill="#1a1214"/><circle cx="58" cy="36" r="2.4" fill="#d42828"/><circle cx="63" cy="40" r="2.4" fill="#1c4ad8"/><circle cx="54" cy="40" r="2.4" fill="#f0c01c"/><circle cx="58" cy="44" r="2.4" fill="#141414"/><circle cx="28" cy="40" r="2.4" fill="#f4efe4"/></svg>`,
      cuerack: `<svg class="furn-svg" width="56" height="74" viewBox="0 0 56 74"><rect x="10" y="6" width="36" height="62" rx="2" fill="#6b4228" stroke="${ink}" stroke-width="2"/><rect x="14" y="12" width="28" height="5" fill="#8a5a32"/><rect x="14" y="44" width="28" height="5" fill="#8a5a32"/><rect x="16" y="10" width="4" height="52" fill="#d8b07a"/><rect x="24" y="10" width="4" height="52" fill="#d8b07a"/><rect x="32" y="10" width="4" height="52" fill="#d8b07a"/><rect x="40" y="10" width="4" height="52" fill="#d8b07a"/><rect x="16" y="10" width="4" height="8" fill="#3a2418"/><rect x="24" y="10" width="4" height="8" fill="#3a2418"/><rect x="32" y="10" width="4" height="8" fill="#3a2418"/><rect x="40" y="10" width="4" height="8" fill="#3a2418"/><rect x="16" y="58" width="4" height="3" fill="#3a6ad8"/><rect x="24" y="58" width="4" height="3" fill="#3a6ad8"/><rect x="32" y="58" width="4" height="3" fill="#3a6ad8"/><rect x="40" y="58" width="4" height="3" fill="#3a6ad8"/><rect x="34" y="62" width="8" height="6" fill="#3a7ad0" stroke="${ink}" stroke-width="1"/></svg>`,
      stove: `<svg class="furn-svg" width="56" height="74" viewBox="0 0 56 74"><rect x="8" y="28" width="40" height="40" rx="2" fill="#6a6e74" stroke="${ink}" stroke-width="2"/><rect x="12" y="32" width="32" height="14" fill="#2a2c30"/><circle cx="20" cy="38" r="4" fill="none" stroke="#8a8e94" stroke-width="1.5"/><circle cx="36" cy="38" r="4" fill="none" stroke="#8a8e94" stroke-width="1.5"/><rect x="16" y="20" width="16" height="14" rx="2" fill="#4a5560" stroke="${ink}" stroke-width="1.5"/><rect x="15" y="16" width="18" height="5" rx="1" fill="#6a7480" stroke="${ink}" stroke-width="1"/><rect x="14" y="50" width="28" height="14" fill="#3a3c42" stroke="${ink}" stroke-width="1.5"/><rect x="18" y="53" width="20" height="8" fill="#1a1c22"/><circle cx="16" cy="68" r="2" fill="#c4c8cc"/><circle cx="24" cy="68" r="2" fill="#c4c8cc"/><circle cx="32" cy="68" r="2" fill="#c4c8cc"/><circle cx="40" cy="68" r="2" fill="#c4c8cc"/><path d="M22 12c0-3 2-5 2-8M28 12c0-4 2-6 2-9" fill="none" stroke="#e8e0d4" stroke-width="1.4" stroke-linecap="round"/></svg>`,
      coffeemachine: `<svg class="furn-svg" width="56" height="74" viewBox="0 0 56 74"><rect x="6" y="40" width="44" height="10" rx="2" fill="#6b4a2c" stroke="${ink}" stroke-width="2"/><rect x="10" y="46" width="5" height="16" fill="#3a2818"/><rect x="41" y="46" width="5" height="16" fill="#3a2818"/><rect x="10" y="14" width="22" height="28" rx="2" fill="#d8d0c4" stroke="${ink}" stroke-width="2"/><rect x="14" y="20" width="14" height="12" fill="#3a2218"/><rect x="30" y="36" width="14" height="12" rx="2" fill="#8eb8c8" stroke="${ink}" stroke-width="1.5"/><rect x="32" y="40" width="10" height="6" fill="#3a1c10"/><path d="M34 12c0-4 3-6 3-10M40 12c0-3 2-5 2-8" fill="none" stroke="#d8d4cc" stroke-width="1.6" stroke-linecap="round"/></svg>`,
      recordplayer: `<svg class="furn-svg" width="56" height="74" viewBox="0 0 56 74"><rect x="8" y="50" width="40" height="8" fill="#6b4a2c" stroke="${ink}" stroke-width="2"/><rect x="12" y="58" width="5" height="12" fill="#3a2818"/><rect x="39" y="58" width="5" height="12" fill="#3a2818"/><rect x="10" y="40" width="12" height="10" fill="#5a3a22" stroke="${ink}" stroke-width="1.5"/><rect x="12" y="42" width="2" height="7" fill="#ff4da6"/><rect x="15" y="42" width="2" height="7" fill="#ff7a3a"/><rect x="18" y="42" width="2" height="7" fill="#f4c15d"/><circle cx="32" cy="28" r="16" fill="#161418" stroke="${ink}" stroke-width="2"/><circle cx="32" cy="28" r="6" fill="#ff4da6" stroke="#5ce1ff" stroke-width="1.5"/><circle cx="32" cy="28" r="1.6" fill="#0a0a0c"/><line x1="44" y1="14" x2="36" y2="26" stroke="#c4c8cc" stroke-width="2"/></svg>`,
      art_mona: `<svg class="furn-svg" width="56" height="64" viewBox="0 0 56 64"><rect x="8" y="6" width="40" height="52" fill="#c4a06a" stroke="${ink}" stroke-width="2"/><rect x="14" y="18" width="28" height="28" fill="#7ea07a"/><rect x="22" y="24" width="12" height="14" fill="#f1c27d"/></svg>`,
      art_starry: `<svg class="furn-svg" width="56" height="64" viewBox="0 0 56 64"><rect x="8" y="6" width="40" height="52" fill="#1a2744" stroke="${ink}" stroke-width="2"/><path d="M12 30c8-10 16 4 24-8" stroke="#f4c15d" fill="none" stroke-width="3"/><rect x="30" y="36" width="8" height="8" fill="#9be7ff"/></svg>`,
      art_pop: `<svg class="furn-svg" width="56" height="64" viewBox="0 0 56 64"><rect x="8" y="6" width="18" height="24" fill="#ef476f" stroke="${ink}" stroke-width="1.5"/><rect x="28" y="6" width="18" height="24" fill="#f4c15d" stroke="${ink}" stroke-width="1.5"/><rect x="8" y="32" width="18" height="24" fill="#4d7cff" stroke="${ink}" stroke-width="1.5"/><rect x="28" y="32" width="18" height="24" fill="#3ecf8e" stroke="${ink}" stroke-width="1.5"/></svg>`,
      art_sunset: `<svg class="furn-svg" width="56" height="64" viewBox="0 0 56 64"><rect x="8" y="6" width="40" height="52" fill="#f4a261" stroke="${ink}" stroke-width="2"/><circle cx="28" cy="28" r="8" fill="#ff6b35"/><rect x="8" y="40" width="40" height="18" fill="#2a4a6a"/></svg>`,
      art_cubism: `<svg class="furn-svg" width="56" height="64" viewBox="0 0 56 64"><rect x="8" y="6" width="40" height="52" fill="#efe6d8" stroke="${ink}" stroke-width="2"/><polygon points="14,14 30,18 22,40" fill="#c44536"/><polygon points="28,16 46,20 40,48 24,44" fill="#4d7cff"/></svg>`,
      art_poster: `<svg class="furn-svg" width="56" height="64" viewBox="0 0 56 64"><rect x="8" y="6" width="40" height="52" fill="#2a1c4a" stroke="${ink}" stroke-width="2"/><rect x="16" y="16" width="10" height="10" fill="#ef476f"/><rect x="28" y="16" width="10" height="10" fill="#f4c15d"/><text x="28" y="48" text-anchor="middle" font-size="8" fill="#fff">CUBICS</text></svg>`,
      art_hang: `<svg class="furn-svg" width="56" height="64" viewBox="0 0 56 64"><rect x="8" y="6" width="40" height="52" fill="#e8f0d8" stroke="${ink}" stroke-width="2"/><line x1="14" y1="14" x2="42" y2="14" stroke="#6b4a2b" stroke-width="3"/><circle cx="28" cy="30" r="8" fill="#f4c15d"/><rect x="24" y="20" width="8" height="6" fill="#f4c15d"/></svg>`,
      art_neon: `<svg class="furn-svg" width="56" height="64" viewBox="0 0 56 64"><rect x="8" y="6" width="40" height="52" fill="#141018" stroke="${ink}" stroke-width="2"/><text x="28" y="36" text-anchor="middle" font-size="9" fill="#ff4d8d" font-weight="700">my cube</text></svg>`,
    };
    if (icons[type]) return icons[type];
    return `<svg class="furn-svg" width="136" height="78" viewBox="0 0 136 78">
      <rect x="8" y="22" width="120" height="34" rx="14" fill="#6d7c8a" stroke="${ink}" stroke-width="3"/>
      <rect x="16" y="28" width="46" height="20" rx="9" fill="#c5d0d8" stroke="${ink}" stroke-width="2"/>
      <rect x="74" y="28" width="46" height="20" rx="9" fill="#c5d0d8" stroke="${ink}" stroke-width="2"/>
    </svg>`;
  }

  global.HouseIso = {
    GRID, TW, TH, WALL_H, CATALOG, WALLPAPERS, FLOORS, WALL_ART,
    tileToScreen, tileCenter, footprintCenter, sceneMetrics,
    tilesFor, dims, normalizeRot, inBounds, blockedSet, occupiedSet, canPlace, pathfind, nearestFreeTile, canPlacePet,
    isWallArt, reservedWallSlots, canPlaceWall, wallOccupied, seatCount, seatPose,
    roomSVG, furnitureSVG,
  };
})(window);
