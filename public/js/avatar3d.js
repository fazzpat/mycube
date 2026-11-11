/* Hand-authored Habbo-style paper-doll pixel avatars. Native 32x80, integer blit only. */
export const AV_W = 32;
export const AV_H = 80;

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
function mul(c, t) {
  return {
    r: Math.max(0, Math.min(255, Math.round(c.r * t))),
    g: Math.max(0, Math.min(255, Math.round(c.g * t))),
    b: Math.max(0, Math.min(255, Math.round(c.b * t))),
  };
}
function rgb(r, g, b) { return { r, g, b }; }

const INK = rgb(22, 16, 18);
const EYE_W = rgb(250, 250, 252);
const PUPIL = rgb(28, 20, 22);
const MOUTH = rgb(160, 80, 80);
const NOSE = rgb(180, 110, 90);

function tones(hex, warm = false) {
  const b = hexToRgb(hex);
  const hi = warm ? mix(b, rgb(255, 236, 214), 0.28) : mix(b, rgb(255, 255, 255), 0.22);
  const sh = warm ? mix(mul(b, 0.72), rgb(90, 40, 30), 0.12) : mul(b, 0.68);
  return { mid: b, hi, sh };
}

function shoePal(id) {
  if (id === "black") return tones("#2a2a2e");
  if (id === "red") return tones("#c0392b");
  if (id === "gum") return tones("#e8d0b0", true);
  if (id === "skate") return tones("#2a2a2e");
  return tones("#f4f0ea");
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
  };
}

/* View keys: s front, se front 3/4, e side, n back. Other dirs are mirrors. */
function viewOf(dir) {
  const map = { 0: "se", 1: "s", 2: "se", 3: "e", 4: "n", 5: "n", 6: "n", 7: "e" };
  const flip = { 0: false, 1: false, 2: true, 3: true, 4: true, 5: false, 6: false, 7: false };
  // dir 4 is NW = flip of NE; use se-back. Map 4 and 6 to "n" is too lossy.
  // Better: 4 = flip n-side (use "n" flipped), 6 = "n" unflipped is wrong (6 is NE back 3/4).
  return { key: map[dir] || "se", flip: Boolean(flip[dir]) };
}

// Refined view map: NE (6) and N (5) share back; NW (4) is flipped NE/back.
function viewOfDir(dir) {
  switch (dir) {
    case 0: return { key: "se", flip: false }; // SE front 3/4
    case 1: return { key: "s", flip: false };  // S front
    case 2: return { key: "se", flip: true };  // SW
    case 3: return { key: "e", flip: true };   // W
    case 4: return { key: "n", flip: true };   // NW back 3/4 flipped
    case 5: return { key: "n", flip: false };  // N back
    case 6: return { key: "n", flip: false };  // NE ~ back
    case 7: return { key: "e", flip: false };  // E side
    default: return { key: "se", flip: false };
  }
}

/* ---------------- pixel maps ('.' transparent, see PAL) ----------------
   # skin mid  s shade  h highlight
   % shirt mid c shade  + highlight
   = pants mid p shade  q highlight
   @ hair mid  a shade  i highlight
   $ shoe mid  w shade  y highlight  d sole
   e eye white u pupil  b brow  n nose  m mouth
   x accessory z shade  v highlight  g gold  t graphic
   o outline (only onto empty)
*/
const PAL_KEYS = {
  "#": "skin.mid", h: "skin.hi", s: "skin.sh",
  "%": "shirt.mid", "+": "shirt.hi", c: "shirt.sh",
  "=": "pants.mid", q: "pants.hi", p: "pants.sh",
  "@": "hair.mid", i: "hair.hi", a: "hair.sh",
  $: "shoe.mid", y: "shoe.hi", w: "shoe.sh", d: "sole.mid",
  e: "eye", u: "pupil", b: "brow", n: "nose", m: "mouth",
  x: "acc.mid", z: "acc.sh", v: "acc.hi", g: "gold", t: "graphic",
  o: "ink",
};

function L(y, rows, x = 0) {
  return { x, y, rows };
}

/* ===== BODY CORE: head, neck, torso (no arms/legs) ===== */
const CORE = {
  s: L(4, [
    "..........oooooooooooo..........",
    ".........ohhhhhhhhhhhho.........",
    ".........ohhhhhhhhhhhho.........",
    ".........ohh########hho.........",
    ".........oh##########ho.........",
    ".........oh##########ho.........",
    ".........o############o.........",
    ".........o############o.........",
    ".........o############o.........",
    ".........o#####ss#####o.........",
    ".........o####ssss####o.........",
    ".........o#####sss####o.........",
    ".........o############o.........",
    ".........o####ssss####o.........",
    "..........o##########o..........",
    "...........oooooooooo...........",
    "............o######o............",
    "............oh####ho............",
    "............o##ss##o............",
    "............oooooooo............",
    "...........o########o...........",
    "..........oh########ho..........",
    "..........o##########o..........",
    "..........o##########o..........",
    "..........o###ssss###o..........",
    "..........o##########o..........",
    "..........o##########o..........",
    "..........o##########o..........",
    "..........o###ssss###o..........",
    "..........o##########o..........",
    "..........o##########o..........",
    "..........o##########o..........",
    "..........o###ssss###o..........",
    "..........o##########o..........",
    "...........o########o...........",
    "...........o########o...........",
    "...........o##ssss##o...........",
    "...........o########o...........",
    "............o######o............",
    "............oooooooo............",
  ]),
  se: L(4, [
    "...........ooooooooooo..........",
    "..........ohhhhhhhhhhho.........",
    "..........ohhhhhhhhhhho.........",
    "..........ohh#######hho.........",
    "..........oh#########ho.........",
    "..........oh#########ho.........",
    "..........o###########o.........",
    "..........o###########o.........",
    "..........o###########o.........",
    "..........o####sss####o.........",
    "..........o###sssss###o.........",
    "..........o####ssss###o.........",
    "..........o###########o.........",
    "..........o###sssss###o.........",
    "...........o#########o..........",
    "............ooooooooo...........",
    ".............o#####o............",
    ".............oh###ho............",
    ".............o#ss#o.............",
    ".............ooooooo............",
    "............o#######o...........",
    "...........oh#######ho..........",
    "...........o#########o..........",
    "...........o#########o..........",
    "...........o##ssss###o..........",
    "...........o#########o..........",
    "...........o#########o..........",
    "...........o#########o..........",
    "...........o##sss####o..........",
    "...........o#########o..........",
    "...........o#########o..........",
    "...........o#########o..........",
    "...........o##ssss###o..........",
    "...........o#########o..........",
    "............o#######o...........",
    "............o#######o...........",
    "............o#ssss##o...........",
    "............o#######o...........",
    ".............o#####o............",
    ".............ooooooo............",
  ]),
  e: L(4, [
    "............oooooooo............",
    "...........ohhhhhhhho...........",
    "...........ohhhhhhhho...........",
    "...........ohh#####ho...........",
    "...........oh#######o...........",
    "...........o########o...........",
    "...........o########o...........",
    "...........o########o...........",
    "...........o#ssssss#o...........",
    "...........o#ssssss#o...........",
    "...........o##ssss##o...........",
    "...........o########o...........",
    "...........o##ssss##o...........",
    "............o######o............",
    ".............oooooo.............",
    "..............o##o..............",
    "..............o##o..............",
    "..............ohho..............",
    "..............osso..............",
    "..............oooo..............",
    ".............o######o...........",
    "............oh######ho..........",
    "............o########o..........",
    "............o########o..........",
    "............o##ssss##o..........",
    "............o########o..........",
    "............o########o..........",
    "............o########o..........",
    "............o##sss###o..........",
    "............o########o..........",
    "............o########o..........",
    "............o########o..........",
    "............o##ssss##o..........",
    "............o########o..........",
    ".............o######o...........",
    ".............o######o...........",
    ".............o#sss##o...........",
    ".............o######o...........",
    "..............o####o............",
    "..............oooooo............",
  ]),
  n: L(4, [
    "..........oooooooooooo..........",
    ".........ohhhhhhhhhhhho.........",
    ".........ohhhhhhhhhhhho.........",
    ".........ohh########hho.........",
    ".........oh##########ho.........",
    ".........o############o.........",
    ".........o############o.........",
    ".........o############o.........",
    ".........o############o.........",
    ".........o############o.........",
    ".........o############o.........",
    ".........oh##########ho.........",
    ".........o#ssssssssss#o.........",
    ".........o############o.........",
    "..........o##########o..........",
    "...........oooooooooo...........",
    "............o######o............",
    "............o######o............",
    "............o##ss##o............",
    "............oooooooo............",
    "...........o########o...........",
    "..........o##########o..........",
    "..........o##########o..........",
    "..........o##########o..........",
    "..........o###ssss###o..........",
    "..........o##########o..........",
    "..........o##########o..........",
    "..........o##########o..........",
    "..........o###ssss###o..........",
    "..........o##########o..........",
    "..........o##########o..........",
    "..........o##########o..........",
    "..........o###ssss###o..........",
    "..........o##########o..........",
    "...........o########o...........",
    "...........o########o...........",
    "...........o##ssss##o...........",
    "...........o########o...........",
    "............o######o............",
    "............oooooooo............",
  ])
};

/* Faces drawn after hair so eyes stay readable. Only front views. */
const FACE = {
  s: L(11, [
    "............b......b............",
    "............ee....ee............",
    "............eu....ue............",
    "..............nn................",
    "..............n.................",
    "..............mm................",
  ]),
  se: L(11, [
    ".............b......b...........",
    ".............ee....ee...........",
    ".............eu....ue...........",
    "...............nn...............",
    "...............n................",
    "...............mm...............",
  ]),
  e: L(11, [
    "...................b............",
    "..................ee............",
    "..................ue............",
    "...................n............",
    "...................m............",
  ])
};

/* Arms: [view][kind] where kind is idle|w0|w1|w2|w3|wave|phone|punch|hold|sit */
function armPair(view, kind, xL, xR, y, rowsL, rowsR) {
  return { view, kind, left: L(y, rowsL, xL), right: L(y, rowsR, xR) };
}

const ARMS = [];
function addArms(view, kind, xL, xR, y, left, right) {
  ARMS.push({ view, kind, left: L(y, left, xL), right: L(y, right, xR) });
}

addArms("s", "idle", 3, 23, 26, [
    ".ooo..",
    "ohhho.",
    "o###o.",
    "o###o.",
    "o##so.",
    "o##so.",
    "o###o.",
    "o###o.",
    "o#sso.",
    "o###o.",
    "o###o.",
    "o###o.",
    "o#sso.",
    "o###o.",
    ".ooo..",
    "oh##o.",
    "o#h#o.",
    ".ooo..",
  ], [
    ".ooo..",
    ".ohhho",
    ".o###o",
    ".o###o",
    ".os##o",
    ".os##o",
    ".o###o",
    ".o###o",
    ".oss#o",
    ".o###o",
    ".o###o",
    ".o###o",
    ".oss#o",
    ".o###o",
    "..ooo.",
    ".o##ho",
    ".o#h#o",
    "..ooo.",
  ]);
addArms("s", "w0", 3, 23, 26, [
    ".ooo..",
    "ohhho.",
    "o###o.",
    "o###o.",
    "o##so.",
    "o#sso.",
    "o###o.",
    ".ooo..",
    "oh##o.",
    "o#h#o.",
    ".ooo..",
  ], [
    ".ooo..",
    ".ohhho",
    ".o###o",
    ".o###o",
    ".os##o",
    ".os##o",
    ".o###o",
    ".o###o",
    ".oss#o",
    ".o###o",
    ".o###o",
    ".o###o",
    ".oss#o",
    ".o###o",
    "..ooo.",
    ".o##ho",
    ".o#h#o",
    "..ooo.",
  ]);
addArms("s", "w1", 3, 23, 26, [
    ".ooo..",
    "ohhho.",
    "o###o.",
    "o###o.",
    "o##so.",
    "o#sso.",
    "o###o.",
    ".ooo..",
    "oh##o.",
    "o#h#o.",
    ".ooo..",
  ], [
    ".ooo..",
    ".ohhho",
    ".o###o",
    ".o###o",
    ".os##o",
    ".os##o",
    ".o###o",
    ".o###o",
    ".oss#o",
    ".o###o",
    ".o###o",
    ".o###o",
    ".oss#o",
    ".o###o",
    "..ooo.",
    ".o##ho",
    ".o#h#o",
    "..ooo.",
  ]);
addArms("s", "w2", 3, 23, 26, [
    ".ooo..",
    "ohhho.",
    "o###o.",
    "o###o.",
    "o##so.",
    "o##so.",
    "o###o.",
    "o###o.",
    "o#sso.",
    "o###o.",
    "o###o.",
    "o###o.",
    "o#sso.",
    "o###o.",
    ".ooo..",
    "oh##o.",
    "o#h#o.",
    ".ooo..",
  ], [
    ".ooo..",
    ".ohhho",
    ".o###o",
    ".o###o",
    ".os##o",
    ".oss#o",
    ".o###o",
    "..ooo.",
    ".o##ho",
    ".o#h#o",
    "..ooo.",
  ]);
addArms("s", "w3", 3, 23, 26, [
    ".ooo..",
    "ohhho.",
    "o###o.",
    "o###o.",
    "o##so.",
    "o##so.",
    "o###o.",
    "o###o.",
    "o#sso.",
    "o###o.",
    "o###o.",
    "o###o.",
    "o#sso.",
    "o###o.",
    ".ooo..",
    "oh##o.",
    "o#h#o.",
    ".ooo..",
  ], [
    ".ooo..",
    ".ohhho",
    ".o###o",
    ".o###o",
    ".os##o",
    ".oss#o",
    ".o###o",
    "..ooo.",
    ".o##ho",
    ".o#h#o",
    "..ooo.",
  ]);
addArms("s", "wave", 3, 23, 8, [
    ".ooo..",
    "ohhho.",
    "o###o.",
    "o###o.",
    "o##so.",
    "o##so.",
    "o###o.",
    "o###o.",
    "o#sso.",
    "o###o.",
    "o###o.",
    "o###o.",
    "o#sso.",
    "o###o.",
    ".ooo..",
    "oh##o.",
    "o#h#o.",
    ".ooo..",
  ], [
    "..ooo.",
    ".o##ho",
    ".ohhho",
    ".o###o",
    ".os##o",
    ".o###o",
    ".oss#o",
    ".o###o",
    "..ooo.",
  ]);
addArms("s", "phone", 3, 23, 26, [
  ".ooo..",
  "ohhho.",
  "o###o.",
  "o###o.",
  "o##so.",
  "o##so.",
  "o###o.",
  "o###o.",
  "o#sso.",
  "o###o.",
  "o###o.",
  "o###o.",
  "o#sso.",
  "o###o.",
  ".ooo..",
  "oh##o.",
  "o#h#o.",
  ".ooo.."
], [
  ".ooo..",
  ".ohhho",
  ".o###o",
  ".os##o",
  ".o###o",
  "..ooo.",
  ".oxxxo",
  ".x#vvx",
  ".xzzzx",
  ".xxxxo",
  ".oxxxo",
  "..ooo."
]);
addArms("s", "phone1", 3, 23, 26, [
  ".ooo..",
  "ohhho.",
  "o###o.",
  "o###o.",
  "o##so.",
  "o##so.",
  "o###o.",
  "o###o.",
  "o#sso.",
  "o###o.",
  "o###o.",
  "o###o.",
  "o#sso.",
  "o###o.",
  ".ooo..",
  "oh##o.",
  "o#h#o.",
  ".ooo.."
], [
  ".ooo..",
  ".ohhho",
  ".o###o",
  ".os##o",
  ".o###o",
  "..ooo.",
  ".oxxxo",
  ".xvvvx",
  ".x#zzx",
  ".xxxxo",
  ".oxxxo",
  "..ooo."
]);
addArms("s", "phone2", 3, 23, 26, [
  ".ooo..",
  "ohhho.",
  "o###o.",
  "o###o.",
  "o##so.",
  "o##so.",
  "o###o.",
  "o###o.",
  "o#sso.",
  "o###o.",
  "o###o.",
  "o###o.",
  "o#sso.",
  "o###o.",
  ".ooo..",
  "oh##o.",
  "o#h#o.",
  ".ooo.."
], [
  ".ooo..",
  ".ohhho",
  ".o###o",
  ".os##o",
  ".o###o",
  "..ooo.",
  ".oxxxo",
  ".xvvvx",
  ".xzzzx",
  ".xx#xo",
  ".oxxxo",
  "..ooo."
]);
addArms("s", "punch", 5, 21, 18, [
    ".ooo..",
    "oh#o..",
    "o###o.",
    "o#sso.",
    "o###o.",
    ".ooo..",
    "o##ho.",
    "ooo...",
  ], [
    ".ooo..",
    ".o#ho.",
    ".o###o",
    ".oss#o",
    ".o###o",
    "..ooo.",
    ".oh##o",
    "...ooo",
  ]);
addArms("s", "hold", 3, 23, 26, [
    ".ooo..",
    "ohhho.",
    "o###o.",
    "o###o.",
    "o##so.",
    "o##so.",
    "o###o.",
    "o###o.",
    "o#sso.",
    "o###o.",
    "o###o.",
    "o###o.",
    "o#sso.",
    "o###o.",
    ".ooo..",
    "oh##o.",
    "o#h#o.",
    ".ooo..",
  ], [
    ".ooo..",
    ".ohhho",
    ".o###o",
    ".o###o",
    ".os##o",
    ".os##o",
    ".o###o",
    ".o###o",
    ".oss#o",
    ".o###o",
    ".o###d",
    ".o#hdd",
    "..oddd",
    "..dyyd",
    "...doo",
    "....o.",
  ]);
addArms("s", "sit", 3, 23, 34, [
    ".ooo..",
    "ohhho.",
    "o###o.",
    "o##so.",
    "o#sso.",
    "o###o.",
    ".ooo..",
    "oh##o.",
    "o#h#o.",
    ".ooo..",
  ], [
    ".ooo..",
    ".ohhho",
    ".o###o",
    ".os##o",
    ".oss#o",
    ".o###o",
    "..ooo.",
    ".o##ho",
    ".o#h#o",
    "..ooo.",
  ]);
addArms("se", "idle", 5, 22, 26, [
    ".ooo.",
    "ohhho",
    "o###o",
    "o##so",
    "o##so",
    "o###o",
    "o#sso",
    "o###o",
    "o###o",
    "o#sso",
    "o###o",
    ".ooo.",
    "oh##o",
    "o#h#o",
    ".ooo.",
  ], [
    ".ooo.",
    "o#hho",
    "o###o",
    "os##o",
    "os##o",
    "o###o",
    "oss#o",
    "o###o",
    "o###o",
    "oss#o",
    "o###o",
    ".ooo.",
    "o##ho",
    "o#h#o",
    ".ooo.",
  ]);
addArms("se", "w0", 5, 22, 26, [
    ".ooo.",
    "ohhho",
    "o###o",
    "o##so",
    "o#sso",
    "o###o",
    ".ooo.",
    "oh##o",
    "o#h#o",
    ".ooo.",
  ], [
    ".ooo.",
    "o#hho",
    "o###o",
    "os##o",
    "os##o",
    "o###o",
    "oss#o",
    "o###o",
    "o###o",
    "oss#o",
    "o###o",
    ".ooo.",
    "o##ho",
    "o#h#o",
    ".ooo.",
  ]);
addArms("se", "w1", 5, 22, 26, [
    ".ooo.",
    "ohhho",
    "o###o",
    "o##so",
    "o#sso",
    "o###o",
    ".ooo.",
    "oh##o",
    "o#h#o",
    ".ooo.",
  ], [
    ".ooo.",
    "o#hho",
    "o###o",
    "os##o",
    "os##o",
    "o###o",
    "oss#o",
    "o###o",
    "o###o",
    "oss#o",
    "o###o",
    ".ooo.",
    "o##ho",
    "o#h#o",
    ".ooo.",
  ]);
addArms("se", "w2", 5, 22, 26, [
    ".ooo.",
    "ohhho",
    "o###o",
    "o##so",
    "o##so",
    "o###o",
    "o#sso",
    "o###o",
    "o###o",
    "o#sso",
    "o###o",
    ".ooo.",
    "oh##o",
    "o#h#o",
    ".ooo.",
  ], [
    ".ooo.",
    "o#hho",
    "o###o",
    "os##o",
    "oss#o",
    "o###o",
    ".ooo.",
    "o##ho",
    "o#h#o",
    ".ooo.",
  ]);
addArms("se", "w3", 5, 22, 26, [
    ".ooo.",
    "ohhho",
    "o###o",
    "o##so",
    "o##so",
    "o###o",
    "o#sso",
    "o###o",
    "o###o",
    "o#sso",
    "o###o",
    ".ooo.",
    "oh##o",
    "o#h#o",
    ".ooo.",
  ], [
    ".ooo.",
    "o#hho",
    "o###o",
    "os##o",
    "oss#o",
    "o###o",
    ".ooo.",
    "o##ho",
    "o#h#o",
    ".ooo.",
  ]);
addArms("se", "wave", 5, 22, 8, [
    ".ooo.",
    "ohhho",
    "o###o",
    "o##so",
    "o##so",
    "o###o",
    "o#sso",
    "o###o",
    "o###o",
    "o#sso",
    "o###o",
    ".ooo.",
    "oh##o",
    "o#h#o",
    ".ooo.",
  ], [
    "ooo..",
    "o#hho",
    "o###o",
    "os##o",
    "o###o",
    "oss#o",
    ".ooo.",
    "o##ho",
    ".ooo.",
  ]);
addArms("se", "phone", 5, 22, 26, [
  ".ooo.",
  "ohhho",
  "o###o",
  "o##so",
  "o##so",
  "o###o",
  "o#sso",
  "o###o",
  "o###o",
  "o#sso",
  "o###o",
  ".ooo.",
  "oh##o",
  "o#h#o",
  ".ooo."
], [
  ".ooo.",
  "o#hho",
  "o###o",
  "os##o",
  "o###o",
  ".ooo.",
  "oxxxo",
  "x#vvx",
  "xzzzx",
  "xxxxo",
  "oxxxo",
  ".ooo."
]);
addArms("se", "phone1", 5, 22, 26, [
  ".ooo.",
  "ohhho",
  "o###o",
  "o##so",
  "o##so",
  "o###o",
  "o#sso",
  "o###o",
  "o###o",
  "o#sso",
  "o###o",
  ".ooo.",
  "oh##o",
  "o#h#o",
  ".ooo."
], [
  ".ooo.",
  "o#hho",
  "o###o",
  "os##o",
  "o###o",
  ".ooo.",
  "oxxxo",
  "xvvvx",
  "x#zzx",
  "xxxxo",
  "oxxxo",
  ".ooo."
]);
addArms("se", "phone2", 5, 22, 26, [
  ".ooo.",
  "ohhho",
  "o###o",
  "o##so",
  "o##so",
  "o###o",
  "o#sso",
  "o###o",
  "o###o",
  "o#sso",
  "o###o",
  ".ooo.",
  "oh##o",
  "o#h#o",
  ".ooo."
], [
  ".ooo.",
  "o#hho",
  "o###o",
  "os##o",
  "o###o",
  ".ooo.",
  "oxxxo",
  "xvvvx",
  "xzzzx",
  "xx#xo",
  "oxxxo",
  ".ooo."
]);
addArms("se", "punch", 6, 21, 18, [
    ".ooo.",
    "oh#o.",
    "o###o",
    "o#sso",
    "o###o",
    ".ooo.",
    "o##ho",
  ], [
    ".ooo.",
    "o#ho.",
    "o###o",
    "oss#o",
    "o###o",
    ".ooo.",
    "oh##o",
  ]);
addArms("se", "hold", 5, 22, 26, [
    ".ooo.",
    "ohhho",
    "o###o",
    "o##so",
    "o##so",
    "o###o",
    "o#sso",
    "o###o",
    "o###o",
    "o#sso",
    "o###o",
    ".ooo.",
    "oh##o",
    "o#h#o",
    ".ooo.",
  ], [
    ".ooo.",
    "o#hho",
    "o###o",
    "os##o",
    "os##o",
    "o###o",
    "oss#o",
    "o###o",
    "o###d",
    "o#hdd",
    ".oddd",
    ".dyyd",
    "..doo",
  ]);
addArms("se", "sit", 5, 22, 34, [
    ".ooo.",
    "ohhho",
    "o###o",
    "o##so",
    "o#sso",
    "o###o",
    ".ooo.",
    "oh##o",
    "o#h#o",
    ".ooo.",
  ], [
    ".ooo.",
    "o#hho",
    "o###o",
    "os##o",
    "oss#o",
    "o###o",
    ".ooo.",
    "o##ho",
    "o#h#o",
    ".ooo.",
  ]);
addArms("e", "idle", 12, 16, 26, [
    ".oo.",
    "ohho",
    "o##o",
    "o#so",
    "o#so",
    "o##o",
    "osso",
    "o##o",
    "o##o",
    "osso",
    "o##o",
    ".oo.",
    "o##o",
    "oh#o",
    ".oo.",
  ], [
    ".oo.",
    "ohho",
    "o##o",
    "os#o",
    "os#o",
    "o##o",
    "osso",
    "o##o",
    "o##o",
    "osso",
    "o##o",
    ".oo.",
    "o##o",
    "o#ho",
    ".oo.",
  ]);
addArms("e", "w0", 12, 16, 26, [
    ".oo.",
    "ohho",
    "o##o",
    "o#so",
    "osso",
    "o##o",
    ".oo.",
    "o##o",
    "oh#o",
    ".oo.",
  ], [
    ".oo.",
    "ohho",
    "o##o",
    "os#o",
    "os#o",
    "o##o",
    "osso",
    "o##o",
    "o##o",
    "osso",
    "o##o",
    ".oo.",
    "o##o",
    "o#ho",
    ".oo.",
  ]);
addArms("e", "w1", 12, 16, 26, [
    ".oo.",
    "ohho",
    "o##o",
    "o#so",
    "osso",
    "o##o",
    ".oo.",
    "o##o",
    "oh#o",
    ".oo.",
  ], [
    ".oo.",
    "ohho",
    "o##o",
    "os#o",
    "os#o",
    "o##o",
    "osso",
    "o##o",
    "o##o",
    "osso",
    "o##o",
    ".oo.",
    "o##o",
    "o#ho",
    ".oo.",
  ]);
addArms("e", "w2", 12, 16, 26, [
    ".oo.",
    "ohho",
    "o##o",
    "o#so",
    "o#so",
    "o##o",
    "osso",
    "o##o",
    "o##o",
    "osso",
    "o##o",
    ".oo.",
    "o##o",
    "oh#o",
    ".oo.",
  ], [
    ".oo.",
    "ohho",
    "o##o",
    "os#o",
    "osso",
    "o##o",
    ".oo.",
    "o##o",
    "o#ho",
    ".oo.",
  ]);
addArms("e", "w3", 12, 16, 26, [
    ".oo.",
    "ohho",
    "o##o",
    "o#so",
    "o#so",
    "o##o",
    "osso",
    "o##o",
    "o##o",
    "osso",
    "o##o",
    ".oo.",
    "o##o",
    "oh#o",
    ".oo.",
  ], [
    ".oo.",
    "ohho",
    "o##o",
    "os#o",
    "osso",
    "o##o",
    ".oo.",
    "o##o",
    "o#ho",
    ".oo.",
  ]);
addArms("e", "wave", 12, 16, 8, [
    ".oo.",
    "ohho",
    "o##o",
    "o#so",
    "o#so",
    "o##o",
    "osso",
    "o##o",
    "o##o",
    "osso",
    "o##o",
    ".oo.",
    "o##o",
    "oh#o",
    ".oo.",
  ], [
    ".oo.",
    "o#ho",
    "ohho",
    "o##o",
    "os#o",
    "o##o",
    "osso",
    ".oo.",
    "o#ho",
  ]);
addArms("e", "phone", 12, 16, 26, [
  ".oo.",
  "ohho",
  "o##o",
  "o#so",
  "o#so",
  "o##o",
  "osso",
  "o##o",
  "o##o",
  "osso",
  "o##o",
  ".oo.",
  "o##o",
  "oh#o",
  ".oo."
], [
  ".oo.",
  "ohho",
  "o##o",
  "os#o",
  "o##o",
  ".oo.",
  "oxxo",
  "x#vx",
  "xzzx",
  "xxxo",
  "oxxo",
  ".oo."
]);
addArms("e", "phone1", 12, 16, 26, [
  ".oo.",
  "ohho",
  "o##o",
  "o#so",
  "o#so",
  "o##o",
  "osso",
  "o##o",
  "o##o",
  "osso",
  "o##o",
  ".oo.",
  "o##o",
  "oh#o",
  ".oo."
], [
  ".oo.",
  "ohho",
  "o##o",
  "os#o",
  "o##o",
  ".oo.",
  "oxxo",
  "xvvx",
  "x#zx",
  "xxxo",
  "oxxo",
  ".oo."
]);
addArms("e", "phone2", 12, 16, 26, [
  ".oo.",
  "ohho",
  "o##o",
  "o#so",
  "o#so",
  "o##o",
  "osso",
  "o##o",
  "o##o",
  "osso",
  "o##o",
  ".oo.",
  "o##o",
  "oh#o",
  ".oo."
], [
  ".oo.",
  "ohho",
  "o##o",
  "os#o",
  "o##o",
  ".oo.",
  "oxxo",
  "xvvx",
  "xzzx",
  "xx#o",
  "oxxo",
  ".oo."
]);
addArms("e", "punch", 13, 16, 18, [
    ".oo.",
    "oh#o",
    "o##o",
    "osso",
    "o##o",
    ".oo.",
  ], [
    ".oo.",
    "o#ho",
    "o##o",
    "osso",
    "o##o",
    ".oo.",
  ]);
addArms("e", "hold", 12, 16, 26, [
    ".oo.",
    "ohho",
    "o##o",
    "o#so",
    "o#so",
    "o##o",
    "osso",
    "o##o",
    "o##o",
    "osso",
    "o##o",
    ".oo.",
    "o##o",
    "oh#o",
    ".oo.",
  ], [
    ".oo.",
    "ohho",
    "o##o",
    "os#o",
    "os#o",
    "o##o",
    "osso",
    "o##o",
    "o##d",
    "o#dd",
    ".ddd",
    ".yyd",
    "..oo",
  ]);
addArms("e", "sit", 12, 16, 34, [
    ".oo.",
    "ohho",
    "o##o",
    "o#so",
    "osso",
    "o##o",
    ".oo.",
    "oh#o",
    ".oo.",
  ], [
    ".oo.",
    "ohho",
    "o##o",
    "os#o",
    "osso",
    "o##o",
    ".oo.",
    "o#ho",
    ".oo.",
  ]);
addArms("n", "idle", 3, 23, 26, [
    ".ooo..",
    "ohhho.",
    "o###o.",
    "o###o.",
    "o##so.",
    "o##so.",
    "o###o.",
    "o###o.",
    "o#sso.",
    "o###o.",
    "o###o.",
    "o###o.",
    "o#sso.",
    "o###o.",
    ".ooo..",
    "oh##o.",
    "o#h#o.",
    ".ooo..",
  ], [
    ".ooo..",
    ".ohhho",
    ".o###o",
    ".o###o",
    ".os##o",
    ".os##o",
    ".o###o",
    ".o###o",
    ".oss#o",
    ".o###o",
    ".o###o",
    ".o###o",
    ".oss#o",
    ".o###o",
    "..ooo.",
    ".o##ho",
    ".o#h#o",
    "..ooo.",
  ]);
addArms("n", "w0", 3, 23, 26, [
    ".ooo..",
    "ohhho.",
    "o###o.",
    "o###o.",
    "o##so.",
    "o#sso.",
    "o###o.",
    ".ooo..",
    "oh##o.",
    "o#h#o.",
    ".ooo..",
  ], [
    ".ooo..",
    ".ohhho",
    ".o###o",
    ".o###o",
    ".os##o",
    ".os##o",
    ".o###o",
    ".o###o",
    ".oss#o",
    ".o###o",
    ".o###o",
    ".o###o",
    ".oss#o",
    ".o###o",
    "..ooo.",
    ".o##ho",
    ".o#h#o",
    "..ooo.",
  ]);
addArms("n", "w1", 3, 23, 26, [
    ".ooo..",
    "ohhho.",
    "o###o.",
    "o###o.",
    "o##so.",
    "o#sso.",
    "o###o.",
    ".ooo..",
    "oh##o.",
    "o#h#o.",
    ".ooo..",
  ], [
    ".ooo..",
    ".ohhho",
    ".o###o",
    ".o###o",
    ".os##o",
    ".os##o",
    ".o###o",
    ".o###o",
    ".oss#o",
    ".o###o",
    ".o###o",
    ".o###o",
    ".oss#o",
    ".o###o",
    "..ooo.",
    ".o##ho",
    ".o#h#o",
    "..ooo.",
  ]);
addArms("n", "w2", 3, 23, 26, [
    ".ooo..",
    "ohhho.",
    "o###o.",
    "o###o.",
    "o##so.",
    "o##so.",
    "o###o.",
    "o###o.",
    "o#sso.",
    "o###o.",
    "o###o.",
    "o###o.",
    "o#sso.",
    "o###o.",
    ".ooo..",
    "oh##o.",
    "o#h#o.",
    ".ooo..",
  ], [
    ".ooo..",
    ".ohhho",
    ".o###o",
    ".o###o",
    ".os##o",
    ".oss#o",
    ".o###o",
    "..ooo.",
    ".o##ho",
    ".o#h#o",
    "..ooo.",
  ]);
addArms("n", "w3", 3, 23, 26, [
    ".ooo..",
    "ohhho.",
    "o###o.",
    "o###o.",
    "o##so.",
    "o##so.",
    "o###o.",
    "o###o.",
    "o#sso.",
    "o###o.",
    "o###o.",
    "o###o.",
    "o#sso.",
    "o###o.",
    ".ooo..",
    "oh##o.",
    "o#h#o.",
    ".ooo..",
  ], [
    ".ooo..",
    ".ohhho",
    ".o###o",
    ".o###o",
    ".os##o",
    ".oss#o",
    ".o###o",
    "..ooo.",
    ".o##ho",
    ".o#h#o",
    "..ooo.",
  ]);
addArms("n", "wave", 3, 23, 8, [
    ".ooo..",
    "ohhho.",
    "o###o.",
    "o###o.",
    "o##so.",
    "o##so.",
    "o###o.",
    "o###o.",
    "o#sso.",
    "o###o.",
    "o###o.",
    "o###o.",
    "o#sso.",
    "o###o.",
    ".ooo..",
    "oh##o.",
    "o#h#o.",
    ".ooo..",
  ], [
    "..ooo.",
    ".o##ho",
    ".ohhho",
    ".o###o",
    ".os##o",
    ".o###o",
    ".oss#o",
    ".o###o",
    "..ooo.",
  ]);
addArms("n", "phone", 3, 23, 26, [
  ".ooo..",
  "ohhho.",
  "o###o.",
  "o###o.",
  "o##so.",
  "o##so.",
  "o###o.",
  "o###o.",
  "o#sso.",
  "o###o.",
  "o###o.",
  "o###o.",
  "o#sso.",
  "o###o.",
  ".ooo..",
  "oh##o.",
  "o#h#o.",
  ".ooo.."
], [
  ".ooo..",
  ".ohhho",
  ".o###o",
  ".os##o",
  ".o###o",
  "..ooo.",
  ".oxxxo",
  ".x#vvx",
  ".xzzzx",
  ".xxxxo",
  ".oxxxo",
  "..ooo."
]);
addArms("n", "phone1", 3, 23, 26, [
  ".ooo..",
  "ohhho.",
  "o###o.",
  "o###o.",
  "o##so.",
  "o##so.",
  "o###o.",
  "o###o.",
  "o#sso.",
  "o###o.",
  "o###o.",
  "o###o.",
  "o#sso.",
  "o###o.",
  ".ooo..",
  "oh##o.",
  "o#h#o.",
  ".ooo.."
], [
  ".ooo..",
  ".ohhho",
  ".o###o",
  ".os##o",
  ".o###o",
  "..ooo.",
  ".oxxxo",
  ".xvvvx",
  ".x#zzx",
  ".xxxxo",
  ".oxxxo",
  "..ooo."
]);
addArms("n", "phone2", 3, 23, 26, [
  ".ooo..",
  "ohhho.",
  "o###o.",
  "o###o.",
  "o##so.",
  "o##so.",
  "o###o.",
  "o###o.",
  "o#sso.",
  "o###o.",
  "o###o.",
  "o###o.",
  "o#sso.",
  "o###o.",
  ".ooo..",
  "oh##o.",
  "o#h#o.",
  ".ooo.."
], [
  ".ooo..",
  ".ohhho",
  ".o###o",
  ".os##o",
  ".o###o",
  "..ooo.",
  ".oxxxo",
  ".xvvvx",
  ".xzzzx",
  ".xx#xo",
  ".oxxxo",
  "..ooo."
]);
addArms("n", "punch", 5, 21, 18, [
    ".ooo..",
    "oh#o..",
    "o###o.",
    "o#sso.",
    "o###o.",
    ".ooo..",
    "o##ho.",
    "ooo...",
  ], [
    ".ooo..",
    ".o#ho.",
    ".o###o",
    ".oss#o",
    ".o###o",
    "..ooo.",
    ".oh##o",
    "...ooo",
  ]);
addArms("n", "hold", 3, 23, 26, [
    ".ooo..",
    "ohhho.",
    "o###o.",
    "o###o.",
    "o##so.",
    "o##so.",
    "o###o.",
    "o###o.",
    "o#sso.",
    "o###o.",
    "o###o.",
    "o###o.",
    "o#sso.",
    "o###o.",
    ".ooo..",
    "oh##o.",
    "o#h#o.",
    ".ooo..",
  ], [
    ".ooo..",
    ".ohhho",
    ".o###o",
    ".o###o",
    ".os##o",
    ".os##o",
    ".o###o",
    ".o###o",
    ".oss#o",
    ".o###o",
    ".o###d",
    ".o#hdd",
    "..oddd",
    "..dyyd",
    "...doo",
    "....o.",
  ]);
addArms("n", "sit", 3, 23, 34, [
    ".ooo..",
    "ohhho.",
    "o###o.",
    "o##so.",
    "o#sso.",
    "o###o.",
    ".ooo..",
    "oh##o.",
    "o#h#o.",
    ".ooo..",
  ], [
    ".ooo..",
    ".ohhho",
    ".o###o",
    ".os##o",
    ".oss#o",
    ".o###o",
    "..ooo.",
    ".o##ho",
    ".o#h#o",
    "..ooo.",
  ]);

function getArms(view, kind) {
  return ARMS.find((a) => a.view === view && a.kind === kind)
    || ARMS.find((a) => a.view === view && a.kind === "idle");
}

/* ===== LEGS ===== */
const LEGS = [];
function addLegs(view, kind, y, rows) {
  LEGS.push({ view, kind, layer: L(y, rows) });
}

addLegs("s", "idle", 46, [
  "..........oooooooo..............",
  ".........o========o.............",
  ".........oq======qo.............",
  ".........o===pp===o.............",
  "........o===o..o===o............",
  "........o===o..o===o............",
  "........oq==o..o==qo............",
  "........o===o..o===o............",
  "........o=ppo..opp=o............",
  "........o===o..o===o............",
  "........o===o..o===o............",
  "........o=ppo..opp=o............",
  "........o===o..o===o............",
  "........o===o..o===o............",
  "........o=ppo..opp=o............",
  "........o===o..o===o............",
  ".........ooo....ooo.............",
  "........oyyyo..oyyyo............",
  ".......oy$$$yo.oy$$$yo..........",
  ".......o$$$$$o.o$$$$$o..........",
  ".......o$yyy$o.o$yyy$o..........",
  ".......o$$$$$o.o$$$$$o..........",
  ".......odddddo.odddddo..........",
  ".......ooooooo.ooooooo.........."
]);
addLegs("s", "w0", 46, [
  "............oooooooo............",
  "...........o========o...........",
  "...........oq======qo...........",
  "..........o===o..o===o..........",
  ".........o===o....o===o.........",
  ".........oq==o....o===o.........",
  ".........o=ppo....opp=o.........",
  ".........o===o.....ooo..........",
  ".........o===o....oyyyo.........",
  ".........o=ppo...oy$$$yo........",
  ".........o===o...o$$$$$o........",
  ".........oyyyo...o$yyy$o........",
  "........oy$$$yo..odddddo........",
  "........o$$$$$o..ooooooo........",
  "........o$yyy$o.................",
  "........o$$$$$o.................",
  "........o$$$$$o.................",
  "........o$yyy$o.................",
  "........odddddo.................",
  "........ooooooo................."
]);
addLegs("s", "w1", 46, [
  "............oooooooo............",
  "...........o========o...........",
  "...........oq======qo...........",
  "..........o===o..o===o..........",
  ".........o===o....o===o.........",
  ".........oq==o....o===o.........",
  ".........o=ppo....o===o.........",
  ".........o===o....oyyyo.........",
  ".........o===o...oy$$$yo........",
  ".........o=ppo...o$$$$$o........",
  ".........o===o...o$yyy$o........",
  ".........oyyyo...odddddo........",
  "........oy$$$yo..ooooooo........",
  "........o$$$$$o.................",
  "........o$yyy$o.................",
  "........o$$$$$o.................",
  "........o$$$$$o.................",
  "........o$yyy$o.................",
  "........odddddo.................",
  "........ooooooo................."
]);
addLegs("s", "w2", 46, [
  "............oooooooo............",
  "...........o========o...........",
  "...........oq======qo...........",
  "..........o===o..o===o..........",
  ".........o===o....o===o.........",
  ".........o===o....o==qo.........",
  ".........o=ppo....opp=o.........",
  "..........ooo.....o===o.........",
  ".........oyyyo....o===o.........",
  "........oy$$$yo...o=ppo.........",
  "........o$$$$$o...o===o.........",
  "........o$yyy$o...oyyyo.........",
  "........odddddo..oy$$$yo........",
  "........ooooooo..o$$$$$o........",
  ".................o$yyy$o........",
  ".................o$$$$$o........",
  ".................o$$$$$o........",
  ".................o$yyy$o........",
  ".................odddddo........",
  ".................ooooooo........"
]);
addLegs("s", "w3", 46, [
  "............oooooooo............",
  "...........o========o...........",
  "...........oq======qo...........",
  "..........o===o..o===o..........",
  ".........o===o....o===o.........",
  ".........o===o....o==qo.........",
  ".........o===o....opp=o.........",
  ".........oyyyo....o===o.........",
  "........oy$$$yo...o===o.........",
  "........o$$$$$o...o=ppo.........",
  "........o$yyy$o...o===o.........",
  "........odddddo...oyyyo.........",
  "........ooooooo..oy$$$yo........",
  ".................o$$$$$o........",
  ".................o$yyy$o........",
  ".................o$$$$$o........",
  ".................o$$$$$o........",
  ".................o$yyy$o........",
  ".................odddddo........",
  ".................ooooooo........"
]);
addLegs("s", "sit", 54, [
  "............oooooooo............",
  "..........o==========o..........",
  ".........oq==========qo.........",
  "........o===oooooooo===o........",
  ".......o===o........o===o.......",
  ".......o=ppo........opp=o.......",
  ".......o===o........o===o.......",
  ".......oyyyo........oyyyo.......",
  "......oy$$$yo......oy$$$yo......",
  "......o$$$$$o......o$$$$$o......",
  "......o$yyy$o......o$yyy$o......",
  "......odddddo......odddddo......",
  "......ooooooo......ooooooo......"
]);
addLegs("se", "idle", 46, [
  "............oooooooo............",
  "...........o========o...........",
  "...........oq======qo...........",
  "...........o===pp===o...........",
  "..........o===o.o===o...........",
  "..........o===o.o===o...........",
  "..........oq==o.o==qo...........",
  "..........o===o.o===o...........",
  "..........o=ppo.opp=o...........",
  "..........o===o.o===o...........",
  "..........o===o.o===o...........",
  "..........o=ppo.opp=o...........",
  "..........o===o.o===o...........",
  "..........o===o.o===o...........",
  "...........ooo...ooo............",
  "..........oyyyo.oyyyo...........",
  ".........oy$$$yooy$$$yo.........",
  ".........o$$$$$o.o$$$$$o........",
  ".........o$yyy$o.o$yyy$o........",
  ".........o$$$$$o.o$$$$$o........",
  ".........odddddo.odddddo........",
  ".........ooooooo.ooooooo........"
]);
addLegs("se", "w0", 46, [
  "............oooooooo............",
  "...........o========o...........",
  "...........oq======qo...........",
  "..........o===o.o===o...........",
  ".........o===o...o===o..........",
  ".........o=ppo...opp=o..........",
  ".........o===o....ooo...........",
  ".........o===o...oyyyo..........",
  ".........o===o..oy$$$yo.........",
  ".........oyyyo..o$$$$$o.........",
  "........oy$$$yo.o$yyy$o.........",
  "........o$$$$$o.odddddo.........",
  "........o$yyy$o.ooooooo.........",
  "........o$$$$$o.................",
  "........o$$$$$o.................",
  "........o$yyy$o.................",
  "........o$$$$$o.................",
  "........odddddo.................",
  "........ooooooo.................",
  "................................"
]);
addLegs("se", "w1", 46, [
  "............oooooooo............",
  "...........o========o...........",
  "...........oq======qo...........",
  "..........o===o.o===o...........",
  ".........o===o...o===o..........",
  ".........o=ppo...o===o..........",
  ".........o===o...oyyyo..........",
  ".........o===o..oy$$$yo.........",
  ".........oyyyo..o$$$$$o.........",
  "........oy$$$yo.o$yyy$o.........",
  "........o$$$$$o.odddddo.........",
  "........o$yyy$o.ooooooo.........",
  "........o$$$$$o.................",
  "........o$$$$$o.................",
  "........o$yyy$o.................",
  "........o$$$$$o.................",
  "........o$$$$$o.................",
  "........odddddo.................",
  "........ooooooo.................",
  "................................"
]);
addLegs("se", "w2", 46, [
  "............oooooooo............",
  "...........o========o...........",
  "...........oq======qo...........",
  "..........o===o.o===o...........",
  ".........o===o...o===o..........",
  ".........o=ppo...opp=o..........",
  "..........ooo....o===o..........",
  ".........oyyyo...o===o..........",
  "........oy$$$yo..o===o..........",
  "........o$$$$$o..oyyyo..........",
  "........o$yyy$o.oy$$$yo.........",
  "........odddddo.o$$$$$o.........",
  "........ooooooo.o$yyy$o.........",
  "................o$$$$$o.........",
  "................o$$$$$o.........",
  "................o$yyy$o.........",
  "................o$$$$$o.........",
  "................odddddo.........",
  "................ooooooo.........",
  "................................"
]);
addLegs("se", "w3", 46, [
  "............oooooooo............",
  "...........o========o...........",
  "...........oq======qo...........",
  "..........o===o.o===o...........",
  ".........o===o...o===o..........",
  ".........o===o...opp=o..........",
  ".........oyyyo...o===o..........",
  "........oy$$$yo..o===o..........",
  "........o$$$$$o..oyyyo..........",
  "........o$yyy$o.oy$$$yo.........",
  "........odddddo.o$$$$$o.........",
  "........ooooooo.o$yyy$o.........",
  "................o$$$$$o.........",
  "................o$$$$$o.........",
  "................o$yyy$o.........",
  "................o$$$$$o.........",
  "................o$$$$$o.........",
  "................odddddo.........",
  "................ooooooo.........",
  "................................"
]);
addLegs("se", "sit", 54, [
  "............oooooooo............",
  "..........o==========o..........",
  ".........oq==========qo.........",
  "........o===oooooooo===o........",
  ".......o===o........o===o.......",
  ".......o=ppo........opp=o.......",
  ".......oyyyo........oyyyo.......",
  "......oy$$$yo......oy$$$yo......",
  "......o$$$$$o......o$$$$$o......",
  "......o$yyy$o......o$yyy$o......",
  "......ooooooo......ooooooo......"
]);
addLegs("e", "idle", 46, [
  ".............oooooooo...........",
  "............o========o..........",
  "............oq======qo..........",
  "............o===pp===o..........",
  "............o========o..........",
  "............opppppppp...........",
  "............o========o..........",
  "............o========o..........",
  "............opppppppp...........",
  "............o========o..........",
  "............o========o..........",
  "............opppppppp...........",
  "............o========o..........",
  ".............oooooooo...........",
  "............oyyyyyyyo...........",
  "...........oy$$$$$$$yo..........",
  "...........o$$$$$$$$$o..........",
  "...........o$yyyyyyy$o..........",
  "...........o$$$$$$$$$o..........",
  "...........odddddddddo..........",
  "...........ooooooooooo.........."
]);
addLegs("e", "w0", 46, [
  ".............oooooooo...........",
  "............o========o..........",
  "............oq======qo..........",
  "............o===pp===o..........",
  "...........o====o.o===o.........",
  "..........o===o...o===o.........",
  "..........o=ppo...opp=o.........",
  "..........o===o....ooo..........",
  "..........oyyyo...oyyyo.........",
  ".........oy$$$yo.oy$$$yo........",
  ".........o$$$$$o.o$$$$$o........",
  ".........o$yyy$o.odddddo........",
  ".........o$$$$$o.ooooooo........",
  ".........o$yyy$o................",
  ".........o$$$$$o................",
  ".........o$$$$$o................",
  ".........o$yyy$o................",
  ".........odddddo................",
  ".........ooooooo................",
  "................................"
]);
addLegs("e", "w1", 46, [
  ".............oooooooo...........",
  "............o========o..........",
  "............oq======qo..........",
  "............o===pp===o..........",
  "...........o====o.o===o.........",
  "..........o===o...o===o.........",
  "..........o=ppo...oyyyo.........",
  "..........o===o..oy$$$yo........",
  "..........oyyyo..o$$$$$o........",
  ".........oy$$$yo.o$yyy$o........",
  ".........o$$$$$o.odddddo........",
  ".........o$yyy$o.ooooooo........",
  ".........o$$$$$o................",
  ".........o$$$$$o................",
  ".........o$yyy$o................",
  ".........o$$$$$o................",
  ".........o$$$$$o................",
  ".........odddddo................",
  ".........ooooooo................",
  "................................"
]);
addLegs("e", "w2", 46, [
  ".............oooooooo...........",
  "............o========o..........",
  "............oq======qo..........",
  "............o===pp===o..........",
  "...........o====o.o===o.........",
  "..........o===o...o===o.........",
  "..........o=ppo...opp=o.........",
  "...........ooo....o===o.........",
  "..........oyyyo...oyyyo.........",
  ".........oy$$$yo.oy$$$yo........",
  ".........o$$$$$o.o$$$$$o........",
  ".........odddddo.o$yyy$o........",
  ".........ooooooo.o$$$$$o........",
  ".................o$yyy$o........",
  ".................o$$$$$o........",
  ".................o$$$$$o........",
  ".................o$yyy$o........",
  ".................odddddo........",
  ".................ooooooo........",
  "................................"
]);
addLegs("e", "w3", 46, [
  ".............oooooooo...........",
  "............o========o..........",
  "............oq======qo..........",
  "............o===pp===o..........",
  "...........o====o.o===o.........",
  "..........oyyyo...o===o.........",
  ".........oy$$$yo..opp=o.........",
  ".........o$$$$$o..o===o.........",
  ".........o$yyy$o..oyyyo.........",
  ".........odddddo.oy$$$yo........",
  ".........ooooooo.o$$$$$o........",
  ".................o$yyy$o........",
  ".................o$$$$$o........",
  ".................o$$$$$o........",
  ".................o$yyy$o........",
  ".................o$$$$$o........",
  ".................o$$$$$o........",
  ".................odddddo........",
  ".................ooooooo........",
  "................................"
]);
addLegs("e", "sit", 54, [
  ".............oooooooo...........",
  "...........o==========o.........",
  "..........oq==========qo........",
  "........oooooooo========o.......",
  "......o===o........o=====o......",
  "......o=ppo........opppppo......",
  "......oyyyo........oyyyyyo......",
  ".....oy$$$yo......oy$$$$$yo.....",
  ".....o$$$$$o......o$$$$$$$o.....",
  ".....o$yyy$o......o$yyyyy$o.....",
  ".....ooooooo......ooooooooo....."
]);
addLegs("n", "idle", 46, [
  "..........oooooooo..............",
  ".........o========o.............",
  ".........o========o.............",
  ".........o===pp===o.............",
  "........o===o..o===o............",
  "........o===o..o===o............",
  "........o===o..o===o............",
  "........o=ppo..opp=o............",
  "........o===o..o===o............",
  "........o===o..o===o............",
  "........o=ppo..opp=o............",
  "........o===o..o===o............",
  "........o===o..o===o............",
  "........o=ppo..opp=o............",
  ".........ooo....ooo.............",
  "........oyyyo..oyyyo............",
  ".......oy$$$yo.oy$$$yo..........",
  ".......o$$$$$o.o$$$$$o..........",
  ".......o$yyy$o.o$yyy$o..........",
  ".......o$$$$$o.o$$$$$o..........",
  ".......odddddo.odddddo..........",
  ".......ooooooo.ooooooo.........."
]);
addLegs("n", "w0", 46, [
  "............oooooooo............",
  "...........o========o...........",
  "...........oq======qo...........",
  "..........o===o..o===o..........",
  ".........o===o....o===o.........",
  ".........oq==o....o===o.........",
  ".........o=ppo....opp=o.........",
  ".........o===o.....ooo..........",
  ".........o===o....oyyyo.........",
  ".........o=ppo...oy$$$yo........",
  ".........o===o...o$$$$$o........",
  ".........oyyyo...o$yyy$o........",
  "........oy$$$yo..odddddo........",
  "........o$$$$$o..ooooooo........",
  "........o$yyy$o.................",
  "........o$$$$$o.................",
  "........o$$$$$o.................",
  "........o$yyy$o.................",
  "........odddddo.................",
  "........ooooooo................."
]);
addLegs("n", "w1", 46, [
  "............oooooooo............",
  "...........o========o...........",
  "...........oq======qo...........",
  "..........o===o..o===o..........",
  ".........o===o....o===o.........",
  ".........oq==o....o===o.........",
  ".........o=ppo....o===o.........",
  ".........o===o....oyyyo.........",
  ".........o===o...oy$$$yo........",
  ".........o=ppo...o$$$$$o........",
  ".........o===o...o$yyy$o........",
  ".........oyyyo...odddddo........",
  "........oy$$$yo..ooooooo........",
  "........o$$$$$o.................",
  "........o$yyy$o.................",
  "........o$$$$$o.................",
  "........o$$$$$o.................",
  "........o$yyy$o.................",
  "........odddddo.................",
  "........ooooooo................."
]);
addLegs("n", "w2", 46, [
  "............oooooooo............",
  "...........o========o...........",
  "...........oq======qo...........",
  "..........o===o..o===o..........",
  ".........o===o....o===o.........",
  ".........o===o....o==qo.........",
  ".........o=ppo....opp=o.........",
  "..........ooo.....o===o.........",
  ".........oyyyo....o===o.........",
  "........oy$$$yo...o=ppo.........",
  "........o$$$$$o...o===o.........",
  "........o$yyy$o...oyyyo.........",
  "........odddddo..oy$$$yo........",
  "........ooooooo..o$$$$$o........",
  ".................o$yyy$o........",
  ".................o$$$$$o........",
  ".................o$$$$$o........",
  ".................o$yyy$o........",
  ".................odddddo........",
  ".................ooooooo........"
]);
addLegs("n", "w3", 46, [
  "............oooooooo............",
  "...........o========o...........",
  "...........oq======qo...........",
  "..........o===o..o===o..........",
  ".........o===o....o===o.........",
  ".........o===o....o==qo.........",
  ".........o===o....opp=o.........",
  ".........oyyyo....o===o.........",
  "........oy$$$yo...o===o.........",
  "........o$$$$$o...o=ppo.........",
  "........o$yyy$o...o===o.........",
  "........odddddo...oyyyo.........",
  "........ooooooo..oy$$$yo........",
  ".................o$$$$$o........",
  ".................o$yyy$o........",
  ".................o$$$$$o........",
  ".................o$$$$$o........",
  ".................o$yyy$o........",
  ".................odddddo........",
  ".................ooooooo........"
]);
addLegs("n", "sit", 54, [
  "............oooooooo............",
  "..........o==========o..........",
  ".........o============o.........",
  "........o===oooooooo===o........",
  ".......o===o........o===o.......",
  ".......o=ppo........opp=o.......",
  ".......oyyyo........oyyyo.......",
  "......oy$$$yo......oy$$$yo......",
  "......o$$$$$o......o$$$$$o......",
  "......o$yyy$o......o$yyy$o......",
  "......ooooooo......ooooooo......"
]);

function getLegs(view, kind) {
  return (LEGS.find((a) => a.view === view && a.kind === kind)
    || LEGS.find((a) => a.view === view && a.kind === "idle")).layer;
}

/* ===== TOPS (torso only; sleeves are painted from arm skin) ===== */
const TOPS = {
  tshirt: {
    s: L(25, [
      "...........o++++++++o...........",
      "..........o++%++++%++o..........",
      "..........o+%++++++%+o..........",
      "..........o%%%%%%%%%%o..........",
      "..........o%%%cccc%%%o..........",
      "..........o%%%%%%%%%%o..........",
      "..........o%%%%%%%%%%o..........",
      "..........o%%%%%%%%%%o..........",
      "..........o%%%cccc%%%o..........",
      "..........o%%%%%%%%%%o..........",
      "..........o%%%%%%%%%%o..........",
      "..........o%%%%%%%%%%o..........",
      "..........o%%%cccc%%%o..........",
      "..........o%%%%%%%%%%o..........",
      "..........o%%%%%%%%%%o..........",
      "...........o%%%%%%%%o...........",
      "...........o%%%%%%%%o...........",
      "...........o%%cccc%%o...........",
      "...........o%%%%%%%%o...........",
      "............oooooooo............",
    ]),
    se: L(25, [
      "............o+++++++o...........",
      "...........o++%++++%+o..........",
      "...........o+%++++++%o..........",
      "...........o%%%%%%%%%o..........",
      "...........o%%cccc%%%o..........",
      "...........o%%%%%%%%%o..........",
      "...........o%%%%%%%%%o..........",
      "...........o%%%%%%%%%o..........",
      "...........o%%ccc%%%%o..........",
      "...........o%%%%%%%%%o..........",
      "...........o%%%%%%%%%o..........",
      "...........o%%%%%%%%%o..........",
      "...........o%%cccc%%%o..........",
      "...........o%%%%%%%%%o..........",
      "...........o%%%%%%%%%o..........",
      "............o%%%%%%%o...........",
      "............o%%%%%%%o...........",
      "............o%cccc%%o...........",
      "............o%%%%%%%o...........",
      ".............ooooooo............",
    ]),
    e: L(25, [
      ".............o++++++o...........",
      "............o++%+++%+o..........",
      "............o+%+++++%o..........",
      "............o%%%%%%%%o..........",
      "............o%%cccc%%o..........",
      "............o%%%%%%%%o..........",
      "............o%%%%%%%%o..........",
      "............o%%%%%%%%o..........",
      "............o%cccc%%%o..........",
      "............o%%%%%%%%o..........",
      "............o%%%%%%%%o..........",
      "............o%%%%%%%%o..........",
      "............o%%cccc%%o..........",
      "............o%%%%%%%%o..........",
      "............o%%%%%%%%o..........",
      ".............o%%%%%%o...........",
      ".............o%%%%%%o...........",
      ".............o%ccc%%o...........",
      ".............o%%%%%%o...........",
      "..............oooooo............",
    ]),
    n: L(25, [
      "...........o%%%%%%%%o...........",
      "..........o%%%%%%%%%%o..........",
      "..........o%%%%%%%%%%o..........",
      "..........o%%%%%%%%%%o..........",
      "..........o%%%cccc%%%o..........",
      "..........o%%%%%%%%%%o..........",
      "..........o%%%%%%%%%%o..........",
      "..........o%%%%%%%%%%o..........",
      "..........o%%%cccc%%%o..........",
      "..........o%%%%%%%%%%o..........",
      "..........o%%%%%%%%%%o..........",
      "..........o%%%%%%%%%%o..........",
      "..........o%%%cccc%%%o..........",
      "..........o%%%%%%%%%%o..........",
      "..........o%%%%%%%%%%o..........",
      "...........o%%%%%%%%o...........",
      "...........o%%%%%%%%o...........",
      "...........o%%cccc%%o...........",
      "...........o%%%%%%%%o...........",
      "............oooooooo............",
    ])
  },
};
const HOODIE_EXTRA = {
  s: L(21, [
    "...........occ%%%%cco...........",
    "............o%%%%%%o............",
    "...........o%%%%%%%%o...........",
    "..........o%%%%%%%%%%o..........",
  ]),
  se: L(21, [
    "............occ%%%cco...........",
    ".............o%%%%%o............",
    "............o%%%%%%%o...........",
    "...........o%%%%%%%%%o..........",
  ]),
  e: L(21, [
    ".............occ%%cco...........",
    "..............o%%%%o............",
    ".............o%%%%%%o...........",
    "............o%%%%%%%%o..........",
  ]),
  n: L(16, [
    "..........occccccccco...........",
    ".........oc%%%%%%%%%%o..........",
    ".........oc%%%++++%%co..........",
    ".........oc%%%%%%%%%%o..........",
    "..........occccccccco...........",
  ])
};

const JACKET_EXTRA = {
  s: L(25, [
    "...........o+......+o...........",
    "..........o++......++o..........",
    "..........o+........+o..........",
    "..........oc........co..........",
    "..........o%........%o..........",
    "..........o%........%o..........",
    "..........o%........%o..........",
    "..........oc........co..........",
    "..........o%........%o..........",
    "..........o%........%o..........",
    "..........o%........%o..........",
    "..........oc........co..........",
    "..........o%........%o..........",
    "..........o%........%o..........",
    "..........o%........%o..........",
    "...........o........o...........",
    "...........o........o...........",
    "...........o........o...........",
    "...........o........o...........",
    "............oooooooo............",
  ]),
  se: L(25, [
    "............o+.....+o...........",
    "...........o++.....++o..........",
    "...........o+.......+o..........",
    "...........oc.......co..........",
    "...........o%.......%o..........",
    "...........o%.......%o..........",
    "...........o%.......%o..........",
    "...........oc.......co..........",
    "...........o%.......%o..........",
    "...........o%.......%o..........",
    "...........o%.......%o..........",
    "...........oc.......co..........",
    "...........o%.......%o..........",
    "...........o%.......%o..........",
    "...........o%.......%o..........",
    "............o.......o...........",
    "............o.......o...........",
    "............o.......o...........",
    "............o.......o...........",
    ".............ooooooo............",
  ]),
  e: L(25, [
    ".............o++++++o...........",
    "............o++%+++%+o..........",
    "............o+%+++++%o..........",
    "............o%%%%%%%%o..........",
    "............o%%cccc%%o..........",
    "............o%%%%%%%%o..........",
    "............o%%%%%%%%o..........",
    "............o%%%%%%%%o..........",
    "............o%cccc%%%o..........",
    "............o%%%%%%%%o..........",
    "............o%%%%%%%%o..........",
    "............o%%%%%%%%o..........",
    "............o%%cccc%%o..........",
    "............o%%%%%%%%o..........",
    "............o%%%%%%%%o..........",
    ".............o%%%%%%o...........",
    ".............o%%%%%%o...........",
    ".............o%ccc%%o...........",
    ".............o%%%%%%o...........",
    "..............oooooo............",
  ]),
  n: L(25, [
    "...........o++++++++o...........",
    "..........o++%++++%++o..........",
    "..........o+%++++++%+o..........",
    "..........o%%%%%%%%%%o..........",
    "..........o%%%cccc%%%o..........",
    "..........o%%%%%%%%%%o..........",
    "..........o%%%%%%%%%%o..........",
    "..........o%%%%%%%%%%o..........",
    "..........o%%%cccc%%%o..........",
    "..........o%%%%%%%%%%o..........",
    "..........o%%%%%%%%%%o..........",
    "..........o%%%%%%%%%%o..........",
    "..........o%%%cccc%%%o..........",
    "..........o%%%%%%%%%%o..........",
    "..........o%%%%%%%%%%o..........",
    "...........o%%%%%%%%o...........",
    "...........o%%%%%%%%o...........",
    "...........o%%cccc%%o...........",
    "...........o%%%%%%%%o...........",
    "............oooooooo............",
  ])
};

const BAND_GRAPHIC = {
  s: L(32, [
    "............ottttto.............",
    "............ottctto.............",
    "............ottttto.............",
  ]),
  se: L(32, [
    ".............otttto.............",
    ".............otctto.............",
    ".............otttto.............",
  ])
};

/* ===== HAIR (6+ silhouettes, highlight streaks) ===== */
const HAIR = {
  short: {
    s: L(3, [
      ".........oooooooooooo...........",
      "........oiii@@@@@@@@ao..........",
      ".......oii@@@@@@@@@@ao..........",
      ".......oi@@@@@@@@@@@@o..........",
      ".......o@@@@@....@@@@@o.........",
      ".......o@@@@......@@@@o.........",
      ".......oa@@........@@ao.........",
      "........o............o..........",
    ]),
    se: L(3, [
      "..........oooooooooooo..........",
      ".........oiii@@@@@@@@ao.........",
      "........oii@@@@@@@@@@ao.........",
      "........oi@@@@@@@@@@@@o.........",
      "........o@@@@@....@@@@@o........",
      "........o@@@@......@@@@o........",
      "........oa@@........@@ao........",
      ".........o............o.........",
    ]),
    e: L(3, [
      "............ooooooooo...........",
      "...........oii@@@@@@ao..........",
      "...........oi@@@@@@@@o..........",
      "...........o@@@@@..@@o..........",
      "...........o@@@@...@@o..........",
      "..........oa@@@....@ao..........",
      "..........oo........o...........",
    ]),
    n: L(3, [
      ".........oooooooooooo...........",
      "........oiii@@@@@@@@@ao.........",
      "........oi@@@@@@@@@@@@o.........",
      "........o@@@@......@@@@o........",
      "........oa@@........@@ao........",
      ".........oo..........oo.........",
    ])
  },
  spiky: {
    s: L(0, [
      "........o.o..o..o..o.o..........",
      ".......oioooioooiooiao..........",
      ".......oi@@@@@@@@@@@@ao.........",
      "......oii@@@@@@@@@@@@@ao........",
      "......oi@@@@@....@@@@@@o........",
      "......o@@@@........@@@@@o.......",
      "......oa@@..........@@@ao.......",
      ".......o..............o.........",
    ]),
    se: L(0, [
      ".........o.o..o..o..o.o.........",
      "........oioooioooiooiao.........",
      "........oi@@@@@@@@@@@@ao........",
      ".......oii@@@@@@@@@@@@@ao.......",
      ".......oi@@@@@....@@@@@@o.......",
      ".......o@@@@........@@@@@o......",
      ".......oa@@..........@@@ao......",
      "........o..............o........",
    ]),
    e: L(0, [
      ".............o.o.o.o.o..........",
      "............oioioioiao..........",
      "............oi@@@@@@@@o.........",
      "............o@@@@@..@@o.........",
      "............o@@@@....@o.........",
      "...........oa@@@.....o..........",
      "...........oo........o..........",
    ]),
    n: L(0, [
      ".......o.o..o..o..o..o.o........",
      "........oiooiiooiioiao..........",
      "........oi@@@@@@@@@@@@o.........",
      "........o@@@@......@@@@o........",
      "........oa@@........@@ao........",
      ".........oo..........oo.........",
    ])
  },
  bangs: {
    s: L(3, [
      ".........oooooooooooo...........",
      "........oiii@@@@@@@@@ao.........",
      ".......oii@@@@@@@@@@@@ao........",
      ".......oi@@@@@@@aaaaaaao........",
      ".......o@@@@@..aaaaaaaao........",
      ".......o@@@@....aa@aaaao........",
      ".......oa@@......o...@ao........",
      "........o..............o........",
    ]),
    se: L(3, [
      "..........oooooooooooo..........",
      ".........oiii@@@@@@@@@ao........",
      "........oii@@@@@@@@@@@@ao.......",
      "........oi@@@@@@@aaaaaaao.......",
      "........o@@@@@.aaaaaaaaao.......",
      "........o@@@@...aaa@aaaao.......",
      "........oa@@.....o....@ao.......",
      ".........o...............o......",
    ]),
    e: L(3, [
      "............ooooooooo...........",
      "...........oii@@@@@@ao..........",
      "...........oi@@@@@@@ao..........",
      "...........o@@@@@aaaaa..........",
      "...........o@@@@.aaaaa..........",
      "...........oa@@..aaa.o..........",
      "...........oo.....ooo...........",
    ]),
    n: L(3, [
      ".........oooooooooooo...........",
      "........oiii@@@@@@@@@ao.........",
      "........oi@@@@@@@@@@@@o.........",
      "........o@@@@aaaaaaaa@o.........",
      "........oa@@........@@ao........",
      ".........oo..........oo.........",
    ])
  },
  curly: {
    s: L(1, [
      ".......oo.oo.oo.oo.oo.oo........",
      "......oi@oi@oi@oi@oi@oao........",
      "......oii@@@@@@@@@@@@@aoo.......",
      ".....oii@@@@@@@@@@@@@@@ao.......",
      ".....oi@@@@@@...@@@@@@@@o.......",
      ".....o@@@@@.......@@@@@@@o......",
      ".....oa@@@.........@@@@@ao......",
      "......o...............o.........",
    ]),
    se: L(1, [
      "........oo.oo.oo.oo.oo.o........",
      ".......oi@oi@oi@oi@oi@ao........",
      ".......oii@@@@@@@@@@@@@aoo......",
      "......oii@@@@@@@@@@@@@@@ao......",
      "......oi@@@@@@...@@@@@@@@o......",
      "......o@@@@@.......@@@@@@@o.....",
      "......oa@@@.........@@@@@ao.....",
      ".......o...............o........",
    ]),
    e: L(1, [
      "..........o.o.o.o.o.o.o.........",
      ".........oi@i@i@i@i@iao.........",
      ".........oi@@@@@@@@@@@@o........",
      ".........o@@@@......@@@@o.......",
      "........oa@@@........@@ao.......",
      ".........oo............oo.......",
    ]),
    n: L(1, [
      ".......oo.oo.oo.oo.oo.oo........",
      "......oi@oi@oi@oi@oi@oao........",
      "......oii@@@@@@@@@@@@@@@o.......",
      "......oi@@@@@@...@@@@@@@@o......",
      "......o@@@@@.......@@@@@@@o.....",
      "......oa@@@.........@@@@@ao.....",
      ".......oo.............oo........",
    ])
  },
  bun: {
    s: L(0, [
      "............oooo................",
      "...........oi@@ao...............",
      "...........o@ii@o...............",
      "..........oooooooo..............",
      ".........oiii@@@@@@ao...........",
      "........oi@@@@@@@@@@ao..........",
      "........o@@@@@....@@@@o.........",
      "........o@@@@......@@@o.........",
      "........oa@@........@o..........",
      ".........o..........o...........",
    ]),
    se: L(0, [
      ".............oooo...............",
      "............oi@@ao..............",
      "............o@ii@o..............",
      "...........oooooooo.............",
      "..........oiii@@@@@@ao..........",
      ".........oi@@@@@@@@@@ao.........",
      ".........o@@@@@....@@@@o........",
      ".........o@@@@......@@@o........",
      ".........oa@@........@o.........",
      "..........o..........o..........",
    ]),
    e: L(0, [
      "...............oooo.............",
      "..............oi@@ao............",
      "..............o@ii@o............",
      ".............ooooooo............",
      "............oii@@@@@ao..........",
      "............oi@@@@@@@o..........",
      "............o@@@...@@o..........",
      "............oa@.....o...........",
      "............oo......o...........",
    ]),
    n: L(0, [
      "............oooo................",
      "...........oi@@ao...............",
      "...........o@ii@o...............",
      "..........oooooooo..............",
      ".........oiii@@@@@@ao...........",
      ".........oi@@@@@@@@@o...........",
      ".........o@@@....@@@@o..........",
      ".........oa@@....@@@ao..........",
      "..........oo......oo............",
    ])
  },
  long: {
    s: L(3, [
      ".........oooooooooooo...........",
      "........oiii@@@@@@@@@ao.........",
      ".......oii@@@@@@@@@@@@ao........",
      ".......oi@@@@@@@@@@@@@@o........",
      ".......o@@@@@....@@@@@@@o.......",
      ".......o@@@@......@@@@@@o.......",
      ".......oa@@........@@@@ao.......",
      ".......oa@@........@@@@ao.......",
      ".......oa@@........@@@@ao.......",
      ".......oa@@........@@@@ao.......",
      ".......oaa@........@aaaao.......",
      "........oo..........ooo.........",
    ]),
    se: L(3, [
      "..........oooooooooooo..........",
      ".........oiii@@@@@@@@@ao........",
      "........oii@@@@@@@@@@@@ao.......",
      "........oi@@@@@@@@@@@@@@o.......",
      "........o@@@@@....@@@@@@@o......",
      "........o@@@@......@@@@@@o......",
      "........oa@@........@@@@ao......",
      "........oa@@........@@@@ao......",
      "........oa@@........@@@@ao......",
      "........oa@@........@@@@ao......",
      "........oaa@........@aaaao......",
      ".........oo..........ooo........",
    ]),
    e: L(3, [
      "............ooooooooo...........",
      "...........oii@@@@@@ao..........",
      "...........oi@@@@@@@@o..........",
      "...........o@@@@@..@@o..........",
      "......oooooa@@@....@@o..........",
      "......oaaaa@@.......o...........",
      "......oaaaa@.......oo...........",
      "......oaaaa........o............",
      ".......oooo........o............",
    ]),
    n: L(3, [
      ".........oooooooooooo...........",
      "........oiii@@@@@@@@@ao.........",
      "........oi@@@@@@@@@@@@@o........",
      "........o@@@@@@@@@@@@@@@o.......",
      ".......oa@@@@@@@@@@@@@@@ao......",
      ".......oa@@...........@@ao......",
      ".......oa@@...........@@ao......",
      ".......oa@@...........@@ao......",
      "........oo.............oo.......",
    ])
  },
  undercut: {
    s: L(3, [
      "..........oooooooooo............",
      ".........oiii@@@@@@ao...........",
      ".........oi@@@@@@@@@o...........",
      ".........o@@@@..@@@@@o..........",
      ".........o@@@....@@@@o..........",
      "..........o........o............",
    ]),
    se: L(3, [
      "...........oooooooooo...........",
      "..........oiii@@@@@@ao..........",
      "..........oi@@@@@@@@@o..........",
      "..........o@@@@..@@@@@o.........",
      "..........o@@@....@@@@o.........",
      "...........o........o...........",
    ]),
    e: L(3, [
      ".............oooooooo...........",
      "............oii@@@@@ao..........",
      "............oi@@@@@@@o..........",
      "............o@@@...@@o..........",
      "............oa@.....o...........",
      ".............o......o...........",
    ]),
    n: L(3, [
      "...........oooooooo.............",
      "..........oiii@@@@ao............",
      "..........oi@@@@@@@o............",
      "..........o@@@..@@@o............",
      "...........o......o.............",
    ])
  }
};

/* Hats / accessories on the head */
const HATS = {
  cap: {
    s: L(2, [
      ".........oxxxxxxxxxxxo..........",
      "........oxvvvvvvvvvvzo..........",
      "........oxxxxxxxxxxxxo..........",
      "......ooo.............ooo.......",
    ]),
    se: L(2, [
      "..........oxxxxxxxxxxxo.........",
      ".........oxvvvvvvvvvvzo.........",
      ".........oxxxxxxxxxxxxo.........",
      ".......ooo.............ooo......",
    ]),
    e: L(2, [
      "...........oxxxxxxxxxo..........",
      "..........oxvvvvvvvvzo..........",
      "..........oxxxxxxxxxxo..........",
      ".............oooooooooo.........",
    ]),
    n: L(2, [
      ".........oxxxxxxxxxxxo..........",
      "........oxvvvvvvvvvvzo..........",
      "........oxxxxxxxxxxxxo..........",
    ])
  },
  trucker: {
    s: L(2, [
      ".........oxxxxxxxzzzo...........",
      "........oxvvvvvxxzzzzo..........",
      "........oxxxxxxxxzzzzzo.........",
      "......ooo..............ooo......",
    ]),
    se: L(2, [
      "..........oxxxxxxxzzzo..........",
      ".........oxvvvvvxxzzzzo.........",
      ".........oxxxxxxxxzzzzzo........",
      ".......ooo..............ooo.....",
    ]),
    e: L(2, [
      "...........oxxxxxzzo............",
      "..........oxvvvzzzzzo...........",
      "..........oxxxxxxxzzo...........",
      ".............oooooooooo.........",
    ]),
    n: L(2, [
      ".........oxxxxxxxzzzo...........",
      "........oxvvvvvxxzzzzo..........",
      "........oxxxxxxxxzzzzzo.........",
    ])
  },
  beanie: {
    s: L(1, [
      "..........oooooooooo............",
      ".........oxvvvvvvvvxo...........",
      "........oxxxxxxxxxxxxo..........",
      "........oxzzzzzzzzzzxo..........",
      "........oxxxxxxxxxxxxo..........",
    ]),
    se: L(1, [
      "...........oooooooooo...........",
      "..........oxvvvvvvvvxo..........",
      ".........oxxxxxxxxxxxxo.........",
      ".........oxzzzzzzzzzzxo.........",
      ".........oxxxxxxxxxxxxo.........",
    ]),
    e: L(1, [
      "............ooooooooo...........",
      "...........oxvvvvvvvxo..........",
      "..........oxxxxxxxxxxo..........",
      "..........oxzzzzzzzzxo..........",
      "..........oxxxxxxxxxxo..........",
    ]),
    n: L(1, [
      "..........oooooooooo............",
      ".........oxvvvvvvvvxo...........",
      "........oxxxxxxxxxxxxo..........",
      "........oxzzzzzzzzzzxo..........",
      "........oxxxxxxxxxxxxo..........",
    ])
  }
};

const HEADPHONES = {
  s: L(13, [
    ".......xxo..........oxx.........",
    ".......xzo..........ozx.........",
    ".......xxo..........oxx.........",
  ]),
  se: L(13, [
    "........xxo..........oxx........",
    "........xzo..........ozx........",
    "........xxo..........oxx........",
  ]),
  e: L(13, [
    "..........xxo...................",
    "..........xzo...................",
    "..........xxo...................",
  ]),
  n: L(12, [
    ".......xxoooooooooooooxx........",
    ".......xzo............ozx.......",
    ".......xxo............oxx.......",
  ])
};

const GLASSES = {
  s: L(12, [
    "..........oxxxo.oxxxo...........",
    "..........ozxzo.ozxzo...........",
  ]),
  se: L(12, [
    "...........oxxxo.oxxxo..........",
    "...........ozxzo.ozxzo..........",
  ]),
  e: L(12, [
    ".................oxxxo..........",
    ".................ozxzo..........",
  ])
};

const CHAIN = {
  s: L(25, [
    "............ogggo...............",
    ".............ggg................",
  ]),
  se: L(25, [
    ".............ogggo..............",
    "..............ggg...............",
  ]),
  e: L(25, [
    "..............ogg...............",
  ])
};

function padRow(row) {
  if (row.length === AV_W) return row;
  if (row.length < AV_W) return row + ".".repeat(AV_W - row.length);
  return row.slice(0, AV_W);
}

function makeBuf() {
  const pix = new Array(AV_W * AV_H);
  for (let i = 0; i < pix.length; i++) pix[i] = null;
  return pix;
}

function plot(buf, x, y, color, kind, overwrite = true) {
  if (x < 0 || y < 0 || x >= AV_W || y >= AV_H) return;
  const i = y * AV_W + x;
  if (!overwrite && buf[i]) return;
  if (kind === "ink" && buf[i] && buf[i].kind !== "ink") return;
  buf[i] = { color, kind };
}

function blitLayer(buf, layer, pal, flip, ox = 0, oy = 0) {
  if (!layer) return;
  const rows = layer.rows;
  for (let j = 0; j < rows.length; j++) {
    const row = rows[j];
    for (let i = 0; i < row.length; i++) {
      const ch = row[i];
      if (ch === "." || ch === " " || ch === "|") continue;
      let x = (layer.x || 0) + i + ox;
      const y = (layer.y || 0) + j + oy;
      if (flip) x = AV_W - 1 - x;
      const key = PAL_KEYS[ch];
      if (!key) continue;
      if (key === "ink") {
        plot(buf, x, y, pal.ink, "ink", false);
        continue;
      }
      const col = lookup(pal, key);
      if (!col) continue;
      plot(buf, x, y, col, key, true);
    }
  }
}

function lookup(pal, key) {
  const parts = key.split(".");
  let v = pal;
  for (const p of parts) v = v ? v[p] : null;
  return v || null;
}

function sleeveFromArm(armLayer, length) {
  // Recolor skin pixels in the upper portion of an arm into shirt tones.
  if (!armLayer) return null;
  const rows = armLayer.rows.map((r) => r.split(""));
  const h = rows.length;
  const cut = length === "long" ? Math.max(0, h - 6) : Math.min(8, h);
  for (let j = 0; j < cut; j++) {
    for (let i = 0; i < rows[j].length; i++) {
      const ch = rows[j][i];
      if (ch === "#" || ch === "h" || ch === "s") {
        rows[j][i] = ch === "h" ? "+" : ch === "s" ? "c" : "%";
      }
      // leave @ (hair on back arms) as-is
    }
  }
  return { x: armLayer.x, y: armLayer.y, rows: rows.map((r) => r.join("")) };
}

function shortsLegs(layer) {
  if (!layer) return layer;
  // Below mid-shin, convert pants pixels to skin.
  const rows = layer.rows.map((r) => r.split(""));
  const start = Math.floor(rows.length * 0.55);
  for (let j = start; j < rows.length; j++) {
    // stop before shoes
    const row = rows[j].join("");
    if (row.includes("$") || row.includes("y") || row.includes("d")) break;
    for (let i = 0; i < rows[j].length; i++) {
      const ch = rows[j][i];
      if (ch === "=" || ch === "p" || ch === "q") {
        rows[j][i] = ch === "q" ? "h" : ch === "p" ? "s" : "#";
      }
    }
  }
  return { x: layer.x, y: layer.y, rows: rows.map((r) => r.join("")) };
}

function cargoPockets(view) {
  if (view === "e") {
    return L(56, [
      "............oxxxo.............",
      "............ozzzo.............",
    ]);
  }
  return L(56, [
    ".........oxxx....xxxo.........",
    ".........ozzz....zzzo.........",
  ]);
}

function skateStripe(layer) {
  if (!layer) return layer;
  const rows = layer.rows.map((r) => r);
  // add a highlight stripe on shoe mid rows
  const out = rows.map((row) => row.split(""));
  for (let j = 0; j < out.length; j++) {
    const s = out[j].join("");
    if (s.includes("$") || s.includes("y")) {
      for (let i = 0; i < out[j].length; i++) {
        if (out[j][i] === "$") { out[j][i] = "y"; break; }
      }
    }
  }
  return { x: layer.x, y: layer.y, rows: out.map((r) => r.join("")) };
}

function addOutline(buf) {
  const next = buf.slice();
  const dirs = [[1, 0], [-1, 0], [0, 1], [0, -1]];
  for (let y = 0; y < AV_H; y++) {
    for (let x = 0; x < AV_W; x++) {
      const i = y * AV_W + x;
      if (buf[i]) continue;
      let n = false;
      for (const [dx, dy] of dirs) {
        const nx = x + dx, ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= AV_W || ny >= AV_H) continue;
        const c = buf[ny * AV_W + nx];
        if (c && c.kind !== "ink" && c.kind !== "shadow") { n = true; break; }
      }
      if (n) next[i] = { color: INK, kind: "ink" };
    }
  }
  return next;
}

function armKindFromFlags(flags, frame) {
  if (flags.sitting) return "sit";
  if (flags.actionEmote === "wave" || flags.actionEmote === "dance") return "wave";
  if (flags.boxing) return "punch";
  if (flags.usingPhone) {
    const f = frame % 3;
    return f === 1 ? "phone1" : f === 2 ? "phone2" : "phone";
  }
  const held = flags.heldItem?.kind || flags.heldItem || flags.heldProp;
  if (held) return "hold";
  if (flags.gym) return "hold";
  if (flags.walking) {
    const f = frame % 8;
    if (f === 0 || f === 1) return "w0";
    if (f === 2 || f === 3) return "w1";
    if (f === 4 || f === 5) return "w2";
    return "w3";
  }
  return "idle";
}

function legKindFromFlags(flags, frame) {
  if (flags.sitting) return "sit";
  if (flags.walking) {
    const f = frame % 8;
    if (f === 0 || f === 7) return "w0";
    if (f === 1 || f === 2) return "w1";
    if (f === 3 || f === 4) return "w2";
    return "w3";
  }
  return "idle";
}

function buildPalette(av) {
  const skin = tones(av.skin, true);
  const shirt = tones(av.shirt);
  const pants = tones(av.bottomColor);
  const hair = tones(av.hairColor);
  const shoe = shoePal(av.shoes);
  const accBase = av.accessory === "headphones" ? av.headphoneColor : (av.shirt || "#2a2a2e");
  const acc = tones(av.accessory === "beanie" || av.accessory === "cap" || av.accessory === "trucker" ? (av.headphoneColor || av.shirt || "#2a2a2e") : accBase);
  const graphic = mix(shirt.mid, rgb(255, 255, 255), 0.55);
  const sole = av.shoes === "gum" || av.shoes === "white" ? tones("#c4a070") : tones("#1a1a1c");
  const gold = tones("#f4c15d");
  return {
    ink: INK,
    skin, shirt, pants, hair, shoe, acc,
    sole: sole.mid ? sole : { mid: sole },
    gold: gold.mid,
    graphic,
    eye: EYE_W,
    pupil: PUPIL,
    brow: mix(hexToRgb(av.hairColor || "#2b1d16"), INK, 0.4),
    nose: mix(skin.sh, NOSE, 0.4),
    mouth: MOUTH,
  };
}

const cache = new Map();

function composeAvatar(av, flags, frame) {
  const dir = (flags.walking && (flags.dirX || flags.dirY))
    ? facingIndex8(null, flags.dirX, flags.dirY)
    : facingIndex8(flags.facing, flags.dirX, flags.dirY);
  const { key, flip } = viewOfDir(dir);
  const pal = buildPalette(av);
  const walkBob = [0, -1, -2, -1, 0, -1, -2, -1];
  const bob = (flags.walking && !flags.sitting) ? walkBob[frame % 8] : 0;
  const sit = Boolean(flags.sitting);
  const aKind = armKindFromFlags(flags, frame);
  const lKind = legKindFromFlags(flags, frame);
  const arms = getArms(key, aKind);
  const idleArms = getArms(key, "idle");
  const legs = getLegs(key, lKind);
  const sleeveLen = (av.top === "hoodie" || av.top === "jacket") ? "long" : "short";
  const oneHanded = aKind === "wave" || aKind === "phone" || aKind === "hold";

  const buf = makeBuf();
  // far arm first (left on unflipped front). Keep the far arm idle for one-handed actions.
  const far = oneHanded ? (flip ? idleArms.right : idleArms.left) : (flip ? arms.right : arms.left);
  const near = oneHanded ? (flip ? arms.left : arms.right) : (flip ? arms.left : arms.right);
  const armPull = (layer) => {
    if (!layer || key === "e") return 0;
    const pull = key === "se" ? 1 : 2;
    return (layer.x < AV_W / 2) ? pull : -pull;
  };
  blitLayer(buf, sleeveFromArm(far, sleeveLen), pal, flip, armPull(far), bob);

  let legLayer = av.bottom === "shorts" ? shortsLegs(legs) : legs;
  if (av.shoes === "skate") legLayer = skateStripe(legLayer);
  blitLayer(buf, legLayer, pal, flip, 0, sit ? 0 : bob);

  blitLayer(buf, CORE[key], pal, flip, 0, bob);

  const topBase = TOPS.tshirt[key];
  blitLayer(buf, topBase, pal, flip, 0, bob);
  if (av.top === "hoodie") blitLayer(buf, HOODIE_EXTRA[key], pal, flip, 0, bob);
  if (av.top === "jacket") blitLayer(buf, JACKET_EXTRA[key], pal, flip, 0, bob);
  if (av.top === "bandtee") blitLayer(buf, BAND_GRAPHIC[key], pal, flip, 0, bob);
  if (av.bottom === "cargo") blitLayer(buf, cargoPockets(key), pal, flip, 0, sit ? 0 : bob);
  if (av.accessory === "belt") {
    blitLayer(buf, L(45 + bob, ["..........oggggggg..........", "..........oooooooo.........."]), pal, flip);
  }

  blitLayer(buf, sleeveFromArm(near, sleeveLen), pal, flip, armPull(near), bob);

  if (av.accessory === "wristband") {
    const handY = (near.y || 19) + Math.max(0, (near.rows.length || 8) - 5) + bob;
    blitLayer(buf, L(handY, ["xzzx"], (near.x || 17) + 0), pal, flip);
  }
  if (av.accessory === "chain") blitLayer(buf, CHAIN[key], pal, flip, 0, bob);

  const hair = (HAIR[av.hair] || HAIR.short)[key];
  const hatOn = av.accessory === "cap" || av.accessory === "beanie" || av.accessory === "trucker";
  if (!hatOn) blitLayer(buf, hair, pal, flip, 0, bob);
  else {
    // still a little hair at the sides
    blitLayer(buf, hair, pal, flip, 0, bob);
    blitLayer(buf, HATS[av.accessory][key], pal, flip, 0, bob);
  }

  if (key !== "n") blitLayer(buf, FACE[key], pal, flip, 0, bob);
  if (av.glasses) blitLayer(buf, GLASSES[key], pal, flip, 0, bob);
  if (av.accessory === "headphones") blitLayer(buf, HEADPHONES[key], pal, flip, 0, bob);

  const outlined = addOutline(buf);

  // floor shadow
  const spr = { c: null, w: AV_W, h: AV_H, data: outlined };
  return spr;
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
    const o = i * 4;
    if (!p) continue;
    img.data[o] = p.color.r;
    img.data[o + 1] = p.color.g;
    img.data[o + 2] = p.color.b;
    img.data[o + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  // elliptical shadow under feet
  ctx.globalCompositeOperation = "destination-over";
  ctx.fillStyle = "rgba(0,0,0,0.32)";
  ctx.beginPath();
  ctx.ellipse(AV_W / 2, AV_H - 2, 9, 2.5, 0, 0, Math.PI * 2);
  ctx.fill();
  return { c, w: AV_W, h: AV_H };
}

export function drawAvatarSprite(avatar = {}, flags = {}, frame = 0) {
  const av = normalizeAvatar(avatar);
  const walk = Boolean(flags.walking) && !flags.sitting;
  const dir = (walk && (flags.dirX || flags.dirY))
    ? facingIndex8(null, flags.dirX, flags.dirY)
    : facingIndex8(flags.facing, flags.dirX, flags.dirY);
  const held = flags.heldItem?.kind || flags.heldProp || (typeof flags.heldItem === "string" ? flags.heldItem : "");
  const key = "pd:" + JSON.stringify(av) + ":" + dir + ":" + Boolean(flags.sitting) + ":" + walk + ":" + (walk ? (frame % 8) : (flags.usingPhone ? (frame % 3) : 0)) + ":" + Boolean(flags.usingPhone) + ":" + Boolean(flags.boxing) + ":" + (flags.actionEmote || "") + ":" + held + ":" + Boolean(flags.gym);
  const hit = cache.get(key);
  if (hit) return hit;
  const composed = composeAvatar(av, flags, frame);
  const spr = bufToCanvas(composed.data);
  cache.set(key, spr);
  return spr;
}

export const AVATAR_SHEET_LOOKS = [
  { label: "spiky blond", skin: "#ffdfc4", hair: "spiky", hairColor: "#f3e5c2", shirt: "#ef476f", top: "tshirt", bottom: "jeans", bottomColor: "#3d4f7c", shoes: "white", accessory: "none" },
  { label: "emo fringe", skin: "#f1c27d", hair: "bangs", hairColor: "#222222", shirt: "#2a2a2e", top: "jacket", bottom: "jeans", bottomColor: "#1a1a22", shoes: "black", accessory: "headphones", headphoneColor: "#2a2a2e" },
  { label: "afro", skin: "#8d5524", hair: "curly", hairColor: "#2b1d16", shirt: "#7bc47f", top: "hoodie", bottom: "joggers", bottomColor: "#2a2a2e", shoes: "red", accessory: "chain" },
  { label: "purple buns", skin: "#c68642", hair: "bun", hairColor: "#7b4f9c", shirt: "#ff8fab", top: "hoodie", bottom: "jeans", bottomColor: "#3d4f7c", shoes: "gum", accessory: "none" },
  { label: "wild grey", skin: "#e0ac69", hair: "spiky", hairColor: "#9aa0b0", shirt: "#6c7bff", top: "jacket", bottom: "cargo", bottomColor: "#3d4f7c", shoes: "white", accessory: "none", glasses: true },
  { label: "long dark", skin: "#f1c27d", hair: "long", hairColor: "#2b1d16", shirt: "#5c4d7d", top: "jacket", bottom: "jeans", bottomColor: "#2a2a2e", shoes: "black", glasses: true },
  { label: "band tee", skin: "#f1c27d", hair: "spiky", hairColor: "#2b1d16", shirt: "#1a1a22", top: "bandtee", bottom: "shorts", bottomColor: "#c4a35a", shoes: "skate", accessory: "trucker" },
  { label: "undercut", skin: "#c68642", hair: "undercut", hairColor: "#2b1d16", shirt: "#2a2a2e", top: "hoodie", bottom: "cargo", bottomColor: "#6b7280", shoes: "skate", accessory: "wristband" },
];

export function paintAvatarSheet(canvas, looks, scale = 4) {
  looks = looks && looks.length ? looks : AVATAR_SHEET_LOOKS;
  const dirs = [
    { d: 0, label: "SE" },
    { d: 1, label: "S" },
    { d: 7, label: "E" },
    { d: 5, label: "N" },
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
        ctx.fillText(dir.label, x + cw / 2 - 8, y - 4);
      }
    });
  });
}

export function paintStoreThumb(canvas, kind, item, base) {
  const w = canvas.width = 28, h = canvas.height = 28;
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
  const dw = 12, dh = 26;
  ctx.drawImage(spr.c, 0, 0, spr.w, spr.h, Math.floor((w - dw) / 2), 2, dw, dh);
  return true;
}

if (typeof window !== "undefined") {
  window.__paintAvatarSheet = paintAvatarSheet;
  window.__paintStoreThumb = paintStoreThumb;
  window.__drawAvatarSprite = drawAvatarSprite;
}

export default { drawAvatarSprite, paintAvatarSheet, paintStoreThumb, facingIndex8, AV_W, AV_H, AVATAR_SHEET_LOOKS };
