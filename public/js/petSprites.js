/* Hand-authored Habbo-style pixel pets. Original art only. */
export const PET_W = 24;
export const PET_H = 22;

function hex(h) {
  const n = parseInt(String(h).replace("#", ""), 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255, a: 255 };
}

const PALS = {
  cat:     { mid: "#e09a3c", hi: "#f3c06a", sh: "#a05e22", belly: "#f6e2c4", ink: "#1a1020", nose: "#e8899a", eye: "#22180c", eyeHi: "#fff", accent: "#3a2414", pink: "#f5a9b8" },
  dog:     { mid: "#c49254", hi: "#e0b878", sh: "#8a5e30", belly: "#f0e0c4", ink: "#1a1020", nose: "#2a1c16", eye: "#22180c", eyeHi: "#fff", accent: "#5a3a1c", pink: "#f5a9b8" },
  bunny:   { mid: "#f0e6dc", hi: "#fffaf4", sh: "#c8b4a4", belly: "#fff8f0", ink: "#1a1020", nose: "#e8899a", eye: "#22180c", eyeHi: "#fff", accent: "#d8c4b4", pink: "#f5a9b8" },
  fox:     { mid: "#d87828", hi: "#f0a050", sh: "#8a4010", belly: "#f4eadc", ink: "#1a1020", nose: "#2a1c16", eye: "#22180c", eyeHi: "#fff", accent: "#f4eadc", pink: "#f5a9b8" },
  hamster: { mid: "#c48a48", hi: "#e0b070", sh: "#8a5a28", belly: "#f0d8b0", ink: "#1a1020", nose: "#e8899a", eye: "#22180c", eyeHi: "#fff", accent: "#f0d8b0", pink: "#f5a9b8" },
  parrot:  { mid: "#d43a3a", hi: "#f06060", sh: "#8a2020", belly: "#f0c040", ink: "#1a1020", nose: "#f0c040", eye: "#22180c", eyeHi: "#fff", accent: "#2a8a4a", pink: "#f5a9b8", wing: "#2a8a4a" },
  turtle:  { mid: "#4a8a3a", hi: "#7ab050", sh: "#2e5a24", belly: "#c4d47a", ink: "#1a1020", nose: "#2a1c16", eye: "#22180c", eyeHi: "#fff", accent: "#3d6a28", pink: "#f5a9b8" },
};

const KEYS = {
  o: "ink", "#": "mid", h: "hi", s: "sh", b: "belly", n: "nose",
  e: "eye", u: "eyeHi", t: "accent", p: "pink", w: "wing",
};

function palColor(pal, key) {
  if (key === "ink") return pal.ink;
  if (key === "wing") return pal.wing || pal.accent;
  return pal[key] || pal.mid;
}

function L(y, rows, x = 0) {
  return { x, y, rows: rows.map((r) => r.padEnd(PET_W, ".").slice(0, PET_W)) };
}

/* ===== PET MAPS: 4 unique views (s, se, e, n). Sit is a loaf/crouch. ===== */
const PETS = {
  cat: {
    s: L(4, [
      ".........oooo..........",
      "........ohhhho.........",
      ".......oh#ee#ho........",
      ".......o#ueue#o........",
      ".......o######o........",
      ".......oh#nn#ho........",
      "......oobb#ifbo........",
      "......obbbbbbbo........",
      "......os######so.......",
      ".......o#o..o#o........",
      ".......oso..oso........",
      "........o....o.........",
    ]),
    se: L(4, [
      "..........ooo..........",
      ".........ohhho.........",
      "........oh#eeho........",
      "........o#ueu#o........",
      ".......oo#####o........",
      ".......oh##nn#o........",
      "......oobbbb#bo........",
      "......obbbbbbto........",
      "......os#####so........",
      ".......o#o.o#o.........",
      ".......oso.oso.........",
      "........o...o..........",
    ]),
    e: L(5, [
      "..........ooo..........",
      ".........ohhho.........",
      "........oh#euho........",
      "........o###n#o........",
      ".......oobb##to........",
      ".......obbbbbto........",
      ".......os####so........",
      "........o#o.o#o........",
      "........oso.oso........",
      ".........o...o.........",
    ]),
    n: L(4, [
      ".........oooo..........",
      "........ohhhho.........",
      ".......oh####ho........",
      ".......o######o........",
      ".......o######o........",
      "......oo######oo.......",
      "......obbbbbbbbo.......",
      "......os######so.......",
      ".......o#o..o#o........",
      ".......oso..oso........",
      "........o....o.........",
    ]),
    sitS: L(8, [
      ".........oooo..........",
      "........ohhhho.........",
      ".......oh#ee#ho........",
      ".......o#ueue#o........",
      ".......oh#nn#ho........",
      "......oobbbbbboo.......",
      "......obbbbbbbbo.......",
      "......osoooooso........",
    ]),
    sitE: L(8, [
      "..........ooo..........",
      ".........ohhho.........",
      "........oh#euho........",
      "........o###n#o........",
      ".......oobbbbto........",
      ".......obbbbbto........",
      ".......osooooso........",
    ]),
    tailS: L(8, [".................t.....", "..................t....", ".................to...."]),
    tailE: L(7, ["....t.................", "...to.................", "...o.................."]),
  },
  dog: {
    s: L(3, [
      "........o....o.........",
      ".......oho..oho........",
      ".......o#oooo#o........",
      ".......oh#ee#ho........",
      ".......o#ueue#o........",
      ".......o###nn#o........",
      "......oobbbbbboo.......",
      "......ob######bo.......",
      "......os#oooo#so.......",
      ".......o#o..o#o........",
      ".......oso..oso........",
      "........o....o.........",
    ]),
    se: L(3, [
      ".........o...o.........",
      "........oho.oho........",
      "........o#ooo#o........",
      "........oh#eeho........",
      "........o#ueu#o........",
      ".......oo###nn#o.......",
      "......oobbbbbbbo.......",
      "......ob######to.......",
      "......os#ooo#so........",
      ".......o#o.o#o.........",
      ".......oso.oso.........",
      "........o...o..........",
    ]),
    e: L(5, [
      ".........o..o..........",
      "........ohooho.........",
      "........o#ee#o.........",
      "........o#ue#no........",
      ".......oobbb##o........",
      ".......obbbbbto........",
      ".......os###tso........",
      "........o#o.o#o........",
      "........oso.oso........",
      ".........o...o.........",
    ]),
    n: L(3, [
      "........o....o.........",
      ".......oho..oho........",
      ".......o#oooo#o........",
      ".......oh####ho........",
      ".......o######o........",
      "......oo######oo.......",
      "......obbbbbbbbo.......",
      "......os#oooo#so.......",
      ".......o#o..o#o........",
      ".......oso..oso........",
      "........o....o.........",
    ]),
    sitS: L(7, [
      "........o....o.........",
      ".......oho..oho........",
      ".......oh#ee#ho........",
      ".......o#ueue#o........",
      ".......o###nn#o........",
      "......oobbbbbboo.......",
      "......obbbbbbbbo.......",
      "......osoooooso........",
    ]),
    sitE: L(7, [
      ".........o..o..........",
      "........ohooho.........",
      "........o#ee#o.........",
      "........o#ue#no........",
      ".......oobbbbto........",
      ".......obbbbbto........",
      ".......osooooso........",
    ]),
    tailS: L(7, [".................tt....", "..................to..."]),
    tailE: L(6, ["...tt.................", "..tto................."]),
  },
  bunny: {
    s: L(1, [
      "........o....o.........",
      ".......opo..opo........",
      ".......opo..opo........",
      ".......oho..oho........",
      ".......o#oooo#o........",
      ".......oh#ee#ho........",
      ".......o#ueue#o........",
      ".......o###nn#o........",
      "......oobbbbbboo.......",
      "......obbbbbbbbo.......",
      "......os#oooo#so.......",
      ".......o#o..o#o........",
      ".......oso..oso........",
      "........o....o.........",
    ]),
    se: L(1, [
      ".........o...o.........",
      "........opo.opo........",
      "........opo.opo........",
      "........oho.oho........",
      "........o#ooo#o........",
      "........oh#eeho........",
      "........o#ueu#o........",
      ".......oo###nn#o.......",
      "......oobbbbbbbo.......",
      "......obbbbbbbto.......",
      "......os#ooo#so........",
      ".......o#o.o#o.........",
      ".......oso.oso.........",
      "........o...o..........",
    ]),
    e: L(1, [
      "..........o.o..........",
      ".........opopo.........",
      ".........opopo.........",
      ".........ohoho.........",
      ".........o#ee#o........",
      ".........o#ue#no.......",
      "........oobbb##o.......",
      "........obbbbbto.......",
      "........os###tso.......",
      ".........o#o.o#o.......",
      ".........oso.oso.......",
      "..........o...o........",
    ]),
    n: L(1, [
      "........o....o.........",
      ".......opo..opo........",
      ".......opo..opo........",
      ".......oho..oho........",
      ".......o#oooo#o........",
      ".......oh####ho........",
      ".......o######o........",
      "......oo######oo.......",
      "......obbbbbbbbo.......",
      "......os#oooo#so.......",
      ".......o#o..o#o........",
      ".......oso..oso........",
      "........o....o.........",
    ]),
    sitS: L(5, [
      "........o....o.........",
      ".......opo..opo........",
      ".......oho..oho........",
      ".......oh#ee#ho........",
      ".......o#ueue#o........",
      ".......o###nn#o........",
      "......oobbbbbboo.......",
      "......obbbbbbbbo.......",
      "......osoooooso........",
    ]),
    sitE: L(5, [
      "..........o.o..........",
      ".........opopo.........",
      ".........ohoho.........",
      ".........o#ee#o........",
      ".........o#ue#no.......",
      "........oobbbbto.......",
      "........obbbbbto.......",
      "........osooooso.......",
    ]),
    tailS: L(12, ["..............tt.......", ".............tto......."]),
    tailE: L(11, ["....tt................", "...tto................"]),
  },
  fox: {
    s: L(3, [
      "........o....o.........",
      ".......oto..oto........",
      ".......o#oooo#o........",
      ".......oh#ee#ho........",
      ".......o#ueue#o........",
      ".......o###nn#o........",
      "......oobbbbbboo.......",
      "......ob######bo.......",
      "......os#oooo#so.......",
      ".......o#o..o#o........",
      ".......oso..oso........",
      "........o....o.........",
    ]),
    se: L(3, [
      ".........o...o.........",
      "........oto.oto........",
      "........o#ooo#o........",
      "........oh#eeho........",
      "........o#ueu#o........",
      ".......oo###nn#o.......",
      "......oobbbbbbbo.......",
      "......ob######to.......",
      "......os#ooo#so........",
      ".......o#o.o#o.........",
      ".......oso.oso.........",
      "........o...o..........",
    ]),
    e: L(4, [
      ".........o..o..........",
      "........otooto.........",
      "........o#ee#o.........",
      "........o#ue#no........",
      ".......oobbb##o........",
      ".......obbbbbto........",
      ".......os###tto........",
      "........o#o.oto........",
      "........oso.oso........",
      ".........o...o.........",
    ]),
    n: L(3, [
      "........o....o.........",
      ".......oto..oto........",
      ".......o#oooo#o........",
      ".......oh####ho........",
      ".......o######o........",
      "......oo######oo.......",
      "......obbbbbbbbo.......",
      "......os#oooo#so.......",
      ".......o#o..o#o........",
      ".......oso..oso........",
      "........o....o.........",
    ]),
    sitS: L(7, [
      "........o....o.........",
      ".......oto..oto........",
      ".......oh#ee#ho........",
      ".......o#ueue#o........",
      ".......o###nn#o........",
      "......oobbbbbboo.......",
      "......obbbbbbbbo.......",
      "......osoooooso........",
    ]),
    sitE: L(7, [
      ".........o..o..........",
      "........otooto.........",
      "........o#ee#o.........",
      "........o#ue#no........",
      ".......oobbbbto........",
      ".......obbbbtto........",
      ".......osooooso........",
    ]),
    tailS: L(7, [".................ttt...", "..................tto..", "...................to.."]),
    tailE: L(6, ["ttt...................", "tto...................", ".to..................."]),
  },
  hamster: {
    s: L(6, [
      "........oooooo.........",
      ".......ohhhhhho........",
      "......oh#ee#ee#o.......",
      "......o#ueu#ue#o.......",
      "......oh###nn##o.......",
      "......obbbbbbbbo.......",
      "......os######so.......",
      ".......o#o..o#o........",
      ".......oso..oso........",
    ]),
    se: L(6, [
      ".........ooooo.........",
      "........ohhhhho........",
      ".......oh#ee#eho.......",
      ".......o#ueu#u#o.......",
      ".......oh###nn#o.......",
      ".......obbbbbbbo.......",
      ".......os#####so.......",
      "........o#o.o#o........",
      "........oso.oso........",
    ]),
    e: L(7, [
      ".........oooo..........",
      "........ohhhho.........",
      "........o#eeuho........",
      "........o###n#o........",
      "........obbbbbo........",
      "........os###so........",
      ".........o#o.o#........",
      ".........oso.so........",
    ]),
    n: L(6, [
      "........oooooo.........",
      ".......ohhhhhho........",
      "......oh######ho.......",
      "......o########o.......",
      "......obbbbbbbbo.......",
      "......os######so.......",
      ".......o#o..o#o........",
      ".......oso..oso........",
    ]),
    sitS: L(8, [
      "........oooooo.........",
      ".......ohhhhhho........",
      "......oh#ee#ee#o.......",
      "......o#ueu#ue#o.......",
      "......oh###nn##o.......",
      "......obbbbbbbbo.......",
      "......osoooooso........",
    ]),
    sitE: L(8, [
      ".........oooo..........",
      "........ohhhho.........",
      "........o#eeuho........",
      "........o###n#o........",
      "........obbbbbo........",
      "........osoooso........",
    ]),
    tailS: L(11, ["..............o........"]),
    tailE: L(10, ["....o................."]),
  },
  parrot: {
    s: L(3, [
      ".........oooo..........",
      "........ohwwwo.........",
      ".......oh#ee#wo........",
      ".......o#ueue#o........",
      ".......onnn###o........",
      "......oow#####wo.......",
      "......owww##wwwo.......",
      "......os######so.......",
      ".......o#o..o#o........",
      ".......oso..oso........",
      "........o....o.........",
    ]),
    se: L(3, [
      "..........ooo..........",
      ".........ohwwo.........",
      "........oh#eewo........",
      "........o#ueu#o........",
      "........onn###o........",
      ".......oow###wwo.......",
      ".......owww#wwwto......",
      ".......os#####so.......",
      "........o#o.o#o........",
      "........oso.oso........",
      ".........o...o.........",
    ]),
    e: L(4, [
      "..........ooo..........",
      ".........ohwwo.........",
      ".........o#euwo........",
      ".........onn#wo........",
      "........oow##wo........",
      "........owwwwto........",
      "........os###so........",
      ".........o#o.o#........",
      ".........oso.so........",
      "..........o...o........",
    ]),
    n: L(3, [
      ".........oooo..........",
      "........ohwwwo.........",
      ".......ohw##wwo........",
      ".......ow#####o........",
      "......oow#####wo.......",
      "......owwwwwwwwo.......",
      "......os######so.......",
      ".......o#o..o#o........",
      ".......oso..oso........",
      "........o....o.........",
    ]),
    sitS: L(6, [
      ".........oooo..........",
      "........ohwwwo.........",
      ".......oh#ee#wo........",
      ".......o#ueue#o........",
      ".......onnn###o........",
      "......oowwwwwwwo.......",
      "......osoooooso........",
    ]),
    sitE: L(6, [
      "..........ooo..........",
      ".........ohwwo.........",
      ".........o#euwo........",
      ".........onn#wo........",
      "........oowwwwto.......",
      "........osooooso.......",
    ]),
    tailS: L(10, ["................tt.....", "...............tto....."]),
    tailE: L(9, ["..tt..................", ".tto.................."]),
  },
  turtle: {
    s: L(6, [
      ".........oooo..........",
      "........oh#eeho........",
      "........o#ueu#o........",
      ".......ooh#nn#oo.......",
      "......ottttttttto......",
      "......oths#sshtto......",
      "......ottttttttto......",
      "......os#oooo#so.......",
      ".......o#o..o#o........",
      ".......oso..oso........",
    ]),
    se: L(6, [
      "..........ooo..........",
      ".........oh#eho........",
      ".........o#ue#o........",
      "........ooh#n#oo.......",
      ".......otttttttto......",
      ".......oths#shtto......",
      ".......otttttttto......",
      ".......os#ooo#so.......",
      "........o#o.o#o........",
      "........oso.oso........",
    ]),
    e: L(7, [
      "..........ooo..........",
      ".........oh#euo........",
      ".........o##n#o........",
      "........otttttto.......",
      "........othshtto.......",
      "........otttttto.......",
      "........os#oo#so.......",
      ".........o#o.o#........",
      ".........oso.so........",
    ]),
    n: L(6, [
      ".........oooo..........",
      "........oh####o........",
      ".......ooh####oo.......",
      "......ottttttttto......",
      "......oths#sshtto......",
      "......ottttttttto......",
      "......os#oooo#so.......",
      ".......o#o..o#o........",
      ".......oso..oso........",
    ]),
    sitS: L(8, [
      ".........oooo..........",
      "........oh#eeho........",
      "........o#ueu#o........",
      ".......otttttttto......",
      ".......oths#shtto......",
      ".......otttttttto......",
      ".......osoooooso.......",
    ]),
    sitE: L(8, [
      "..........ooo..........",
      ".........oh#euo........",
      ".........o##n#o........",
      "........otttttto.......",
      "........othshtto.......",
      "........otttttto.......",
      "........osoooso........",
    ]),
    tailS: L(12, ["..............o........"]),
    tailE: L(11, ["....o................."]),
  },
};

function aliasKind(kind) {
  if (kind === "robocat") return "cat";
  if (kind === "drone") return "parrot";
  if (kind === "neonfox") return "fox";
  if (kind === "jellyfish") return "turtle";
  return PETS[kind] ? kind : "cat";
}

export function petViewOfDir(dir) {
  const d = ((dir % 8) + 8) % 8;
  // 0=SE,1=S,2=SW,3=W,4=NW,5=N,6=NE,7=E
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
  const a = Math.atan2(z, x);
  let dir = Math.round(a / (Math.PI / 4));
  dir = ((dir % 8) + 8) % 8;
  return dir;
}

function makeBuf() {
  return new Array(PET_W * PET_H).fill(null);
}

function plot(buf, x, y, rgba, slot) {
  if (x < 0 || y < 0 || x >= PET_W || y >= PET_H) return;
  buf[y * PET_W + x] = { ...rgba, slot };
}

function blit(buf, layer, pal, flip, ox = 0, oy = 0, blink = false) {
  if (!layer) return;
  for (let j = 0; j < layer.rows.length; j++) {
    const row = layer.rows[j];
    for (let i = 0; i < row.length; i++) {
      const ch = row[i];
      if (ch === "." || ch === " ") continue;
      let x = (layer.x || 0) + i + ox;
      const y = (layer.y || 0) + j + oy;
      if (flip) x = PET_W - 1 - x;
      let key = KEYS[ch];
      if (!key) continue;
      if (blink && (key === "eye" || key === "eyeHi")) {
        if (key === "eyeHi") continue;
        key = "ink";
      }
      const col = palColor(pal, key);
      if (!col) continue;
      const rgba = typeof col === "string" ? hex(col) : col;
      plot(buf, x, y, rgba, key);
    }
  }
}

function addOutline(buf) {
  const next = buf.slice();
  const dirs = [[1, 0], [-1, 0], [0, 1], [0, -1]];
  const ink = hex("#1a1020");
  for (let y = 0; y < PET_H; y++) {
    for (let x = 0; x < PET_W; x++) {
      const i = y * PET_W + x;
      if (buf[i]) continue;
      let n = false;
      for (const [dx, dy] of dirs) {
        const xx = x + dx, yy = y + dy;
        if (xx < 0 || yy < 0 || xx >= PET_W || yy >= PET_H) continue;
        const c = buf[yy * PET_W + xx];
        if (c && c.slot !== "ink") { n = true; break; }
      }
      if (n) next[i] = { ...ink, slot: "ink" };
    }
  }
  return next;
}

function bufToCanvas(buf) {
  const c = typeof document !== "undefined" ? document.createElement("canvas") : null;
  if (!c) return { c: null, w: PET_W, h: PET_H };
  c.width = PET_W;
  c.height = PET_H;
  const ctx = c.getContext("2d");
  const img = ctx.createImageData(PET_W, PET_H);
  for (let i = 0; i < buf.length; i++) {
    const p = buf[i];
    if (!p) continue;
    const o = i * 4;
    img.data[o] = p.r;
    img.data[o + 1] = p.g;
    img.data[o + 2] = p.b;
    img.data[o + 3] = p.a;
  }
  ctx.putImageData(img, 0, 0);
  // floor shadow
  ctx.globalCompositeOperation = "destination-over";
  ctx.fillStyle = "rgba(0,0,0,0.28)";
  ctx.beginPath();
  ctx.ellipse(PET_W / 2, PET_H - 2.2, 6.5, 1.6, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalCompositeOperation = "source-over";
  return { c, w: PET_W, h: PET_H };
}

const cache = new Map();

export function drawPetSprite(kind, flags = {}, frame = 0) {
  const k = aliasKind(kind);
  const walking = Boolean(flags.walking);
  const sit = Boolean(flags.sit);
  const dir = flags.dir != null ? flags.dir : facingToDir(flags.facing || { x: 1, z: 1 });
  const view = petViewOfDir(dir);
  const blink = !walking && !sit && (frame % 8 === 6);
  const wag = !sit && (frame % 4 === 1 || frame % 4 === 2);
  const walkStep = walking ? (frame % 2) : 0;
  const key = [k, view.key, view.flip ? 1 : 0, sit ? 1 : 0, walking ? 1 : 0, walkStep, blink ? 1 : 0, wag ? 1 : 0].join(":");
  if (cache.has(key)) return cache.get(key);

  const set = PETS[k];
  const pal = PALS[k];
  let buf = makeBuf();
  let body = sit
    ? (view.key === "e" || view.key === "se" ? (set.sitE || set.sitS) : (view.key === "n" ? set.n : set.sitS)) || set.s
    : set[view.key] || set.s;

  const bob = walking ? (walkStep ? -1 : 0) : (k === "parrot" && !sit && frame % 2 ? -1 : 0);
  const legShift = walking && !sit ? (walkStep ? 1 : -1) : 0;

  // body
  blit(buf, body, pal, view.flip, 0, bob, blink);

  // wag / sit tail
  const tail = view.key === "e" ? set.tailE : set.tailS;
  if (tail && !sit) {
    const tox = wag ? (view.key === "e" ? -1 : 1) : 0;
    blit(buf, tail, pal, view.flip, tox, bob, false);
  }

  // walk: nudge lower "leg" pixels by shifting a couple of bottom rows
  if (walking && !sit && legShift) {
    const next = buf.slice();
    const y0 = PET_H - 5;
    for (let y = y0; y < PET_H; y++) {
      for (let x = 0; x < PET_W; x++) {
        const src = buf[y * PET_W + x];
        if (!src) continue;
        const nx = x + ((x < PET_W / 2) ? -legShift : legShift);
        next[y * PET_W + x] = null;
        if (nx >= 0 && nx < PET_W) next[y * PET_W + nx] = src;
      }
    }
    buf = next;
  }

  buf = addOutline(buf);
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

export default { drawPetSprite, paintPetSheet, paintPetThumb, PET_W, PET_H, PET_SHEET_KINDS };
