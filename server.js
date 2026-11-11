import express from "express";
import { createServer } from "http";
import { Server } from "socket.io";
import path from "path";
import { fileURLToPath } from "url";
import { Chess } from "chess.js";
import {
  SKINS as CAT_SKINS,
  HAIR_STYLES as CAT_HAIR_STYLES,
  HAIR_COLORS as CAT_HAIR_COLORS,
  SHIRTS as CAT_SHIRTS,
  TOPS as CAT_TOPS,
  BOTTOMS as CAT_BOTTOMS,
  BOTTOM_COLORS as CAT_BOTTOM_COLORS,
  SHOES as CAT_SHOES,
  ACCESSORIES as CAT_ACCESSORIES,
  HEADPHONE_COLORS as CAT_HEADPHONE_COLORS,
  PETS as CAT_PETS,
  STORE_LOCKED,
  CLOTHING_STOCK,
  PET_STOCK,
  PUBLIC_PLACES,
  clothingById,
  petById,
} from "./public/js/storeCatalog.js";
import { ART_PIECES, artCatalogEntry, PAINTING_CATALOG } from "./public/js/artPieces.js";
import { reservedWallSlots as layoutReservedWallSlots } from "./public/js/wallLayout.js";
import { chessSeatTiles, chessSeatPose, migrateChessTable } from "./public/js/chessTable.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT) || 3000;

const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer);

app.get("/sw.js", (_req, res) => {
  res.set("Cache-Control", "no-cache");
  res.type("application/javascript");
  res.sendFile(path.join(__dirname, "public", "sw.js"));
});
app.use(express.static(path.join(__dirname, "public")));
app.get("*", (_req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

const START_SIZE = 6;
const SIZE_STEPS = [6, 8, 10];
const UPGRADE_COST = { 6: 25, 8: 40 };
const FURNITURE_CATALOG = {
  rug: { name: "Rug", price: 15, w: 2, h: 2, blocks: false },
  plant: { name: "Plant", price: 20, w: 1, h: 1, blocks: true },
  lamp: { name: "Floor lamp", price: 25, w: 1, h: 1, blocks: true },
  table: { name: "Dining table", price: 30, w: 2, h: 1, blocks: true },
  couch: { name: "Couch", price: 40, w: 2, h: 1, blocks: true },
  bed: { name: "Bed", price: 45, w: 2, h: 3, blocks: true },
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
Object.assign(FURNITURE_CATALOG, PAINTING_CATALOG);
const WALL_ART_TYPES = new Set(["art_mona","art_starry","art_pop","art_sunset","art_cubism","art_poster","art_hang","art_neon"]);
for (const piece of ART_PIECES) {
  FURNITURE_CATALOG[piece.type] = artCatalogEntry(piece);
  WALL_ART_TYPES.add(piece.type);
}
const WALLPAPERS = ["paint-cream", "paint-sage", "paint-blush", "paint-slate"];
const FLOORS = ["wood", "tile", "carpet"];
const START_COINS = 50;
const DAILY_LOGIN_BONUS = 20;
const HANGOUT_INTERVAL_MS = 2 * 60 * 1000;
const HANGOUT_REWARD = 8;
const HANGOUT_DAILY_CAP = 40;
const AD_REWARD = 15;
const AD_DAILY_CAP = 3;
const AD_SPIN_DAILY_CAP = 3;
const COIN_PACKS = {
  starter: { coins: 80, price: "$0.99", label: "Starter pack" },
  bundle: { coins: 500, price: "$4.99", label: "Bundle" },
  stack: { coins: 1200, price: "$9.99", label: "Stack" },
};
const SPIN_PRIZES = [
  { id: "coins15", type: "coins", amount: 15, label: "15 coins", weight: 24 },
  { id: "coins40", type: "coins", amount: 40, label: "40 coins", weight: 16 },
  { id: "coins100", type: "coins", amount: 100, label: "100 coins", weight: 7 },
  { id: "furn-rug", type: "furniture", item: "rug", label: "Rug", weight: 7 },
  { id: "furn-plant", type: "furniture", item: "plant", label: "Plant", weight: 6 },
  { id: "furn-chair", type: "furniture", item: "chair", label: "Chair", weight: 6 },
  { id: "clothes-hoodie", type: "clothes", item: { top: "hoodie", shirt: "#f4c15d" }, label: "Gold hoodie", weight: 6 },
  { id: "clothes-jacket", type: "clothes", item: { top: "jacket", shirt: "#7c5cff" }, label: "Neon jacket", weight: 5 },
  { id: "prop-guitar", type: "prop", item: "guitar", label: "Guitar", weight: 6 },
  { id: "prop-skate", type: "prop", item: "skateboard", label: "Skateboard", weight: 5 },
  { id: "prop-cup", type: "prop", item: "coffee", label: "Coffee cup", weight: 5 },
  { id: "pet-cat", type: "pet", item: "cat", label: "Cat", weight: 3 },
  { id: "pet-dog", type: "pet", item: "dog", label: "Dog", weight: 3 },
  { id: "pet-bunny", type: "pet", item: "bunny", label: "Bunny", weight: 2 },
  { id: "extra-spin", type: "spin", amount: 1, label: "Extra spin", weight: 5 },
];
const SPIN_WEIGHT_TOTAL = SPIN_PRIZES.reduce((n, p) => n + p.weight, 0);

function todayStamp() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function ensureDay(user) {
  const today = todayStamp();
  if (user.economyDate !== today) {
    user.economyDate = today;
    user.hangoutEarnedToday = 0;
    user.hangoutAccrued = 0;
    user.adsWatchedToday = 0;
    user.adSpinsToday = 0;
    user.freeSpinUsed = false;
  }
}

function emptyCollection() {
  return { clothes: [], props: [], pets: [] };
}
function roomSize(room) {
  return room?.size || START_SIZE;
}

function inBounds(x, y, size) {
  const n = size || START_SIZE;
  return Number.isInteger(x) && Number.isInteger(y) && x >= 0 && y >= 0 && x < n && y < n;
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


function snapFacingToAxis(facing) {
  const dx = Number(facing?.x) || 0;
  const dz = Number(facing?.z ?? facing?.y) || 0;
  if (dx === 0 && dz === 0) return { x: 0, z: 1 };
  if (Math.abs(dx) >= Math.abs(dz)) return { x: dx >= 0 ? 1 : -1, z: 0 };
  return { x: 0, z: dz >= 0 ? 1 : -1 };
}

function dimsOf(type, rot) {
  const item = FURNITURE_CATALOG[type];
  if (!item) return { w: 1, h: 1 };
  const r = normalizeRot(rot);
  return r % 2 === 1 ? { w: item.h, h: item.w } : { w: item.w, h: item.h };
}

function tilesFor(type, x, y, rot) {
  const { w, h } = dimsOf(type, rot);
  const out = [];
  for (let dy = 0; dy < h; dy++) {
    for (let dx = 0; dx < w; dx++) out.push({ x: x + dx, y: y + dy });
  }
  return out;
}

function blockedSet(room) {
  const set = new Set();
  for (const f of room.furniture) {
    const item = FURNITURE_CATALOG[f.type];
    if (!item?.blocks) continue;
    for (const t of tilesFor(f.type, f.x, f.y, f.rot)) set.add(`${t.x},${t.y}`);
  }
  return set;
}

function occupancyTiles(f) {
  const tiles = tilesFor(f.type, f.x, f.y, f.rot);
  if (f.type === "chesstable") {
    for (const t of chessSeatTiles(f.x, f.y, f.rot)) tiles.push(t);
  }
  return tiles;
}

function occupiedSet(room, ignoreId) {
  const set = new Set();
  for (const f of room.furniture) {
    if (ignoreId && f.id === ignoreId) continue;
    for (const t of occupancyTiles(f)) set.add(`${t.x},${t.y}`);
  }
  return set;
}

function canPlaceOn(room, type, x, y, rot, ignoreId) {
  const item = FURNITURE_CATALOG[type];
  if (!item || item.surface === "wall") return false;
  const tiles = occupancyTiles({ type, x, y, rot });
  if (!tiles.length || tiles.some((t) => !inBounds(t.x, t.y, roomSize(room)))) return false;
  const used = occupiedSet(room, ignoreId);
  return tiles.every((t) => !used.has(`${t.x},${t.y}`));
}

function findSpawnTile(room) {
  const n = roomSize(room);
  const blocked = blockedSet(room);
  for (const name of room.occupants) {
    const u = users.get(name.toLowerCase());
    if (u) blocked.add(`${Math.round(u.x)},${Math.round(u.y)}`);
  }
  const mid = Math.floor(n / 2);
  const candidates = [
    [mid - 1, n - 2],
    [mid + 1, n - 2],
    [mid, n - 2],
    [1, n - 2],
    [n - 2, n - 2],
    [mid - 1, n - 3],
    [mid + 1, n - 3],
    [2, 2],
  ];
  for (const [x, y] of candidates) {
    if (inBounds(x, y, n) && !blocked.has(`${x},${y}`)) return { x, y };
  }
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      if (!blocked.has(`${x},${y}`)) return { x, y };
    }
  }
  return { x: 1, y: 1 };
}

const SKINS = CAT_SKINS;
const HAIR_STYLES = CAT_HAIR_STYLES;
const HAIR_COLORS = CAT_HAIR_COLORS;
const SHIRTS = CAT_SHIRTS;
const TOPS = CAT_TOPS;
const BOTTOMS = CAT_BOTTOMS;
const BOTTOM_COLORS = CAT_BOTTOM_COLORS;
const SHOES = CAT_SHOES;
const ACCESSORIES = CAT_ACCESSORIES;
const HEADPHONE_COLORS = CAT_HEADPHONE_COLORS;
const PROPS = ["guitar", "skateboard", "coffee"];
const PETS = CAT_PETS;

const users = new Map();
const rooms = new Map();
let roomSeq = 1;
let furnSeq = 1;

function userOwnsStyle(user, field, value) {
  if (!STORE_LOCKED[field] || !STORE_LOCKED[field].has(value)) return true;
  return (user?.collection?.clothes || []).some((c) => c.item && c.item[field] === value);
}

function makePlaceFurniture(place) {
  const items = [];
  let i = 1;
  const add = (type, x, y) => items.push({ id: place.id + "-f" + i++, type, x, y, rot: 0 });
  if (place.shop === "clothes") {
    add("rack", 1, 0);
    add("rack", 3, 0);
    add("mannequin", 5, 0);
    add("mannequin", 5, 2);
    add("counter", 2, 2);
    add("lamp", 0, 0);
    add("neonsign", 0, 2);
  } else {
    add("petpen", 1, 0);
    add("petpen", 3, 0);
    add("cage", 5, 0);
    add("cage", 5, 2);
    add("counter", 2, 2);
    add("podplant", 0, 0);
  }
  return items;
}

function ensurePublicPlaces() {
  for (const place of PUBLIC_PLACES) {
    if (rooms.has(place.id)) continue;
    const keeper = place.keeper || {};
    rooms.set(place.id, {
      id: place.id,
      name: place.name,
      owner: "MyCube",
      locked: false,
      password: "",
      occupants: [],
      furniture: makePlaceFurniture(place),
      size: START_SIZE,
      wallpaper: place.wallpaper || "paint-slate",
      floorStyle: place.floorStyle || "tile",
      lightsOn: true,
      tvs: {},
      chess: {},
      uses: {},
      wallArt: [],
      seats: {},
      arcade: {},
      invites: new Set(),
      publicPlace: true,
      shop: place.shop,
      npcs: [{
        id: "keeper",
        name: keeper.name || "Shopkeep",
        x: 3,
        y: 1,
        avatar: { ...keeper, displayName: keeper.name || "Shopkeep" },
      }],
    });
  }
}

function isRoomOwner(user, room) {
  if (!user || !room || room.publicPlace) return false;
  return room.owner.toLowerCase() === user.username.toLowerCase();
}

function clamp(n, min, max) {
  return Math.max(min, Math.min(max, n));
}

function sanitizeAvatar(raw = {}) {
  const displayName = String(raw.displayName || "")
    .trim()
    .slice(0, 16);
  return {
    displayName: displayName || "",
    skin: SKINS.includes(raw.skin) ? raw.skin : SKINS[1],
    hair: HAIR_STYLES.includes(raw.hair) ? raw.hair : "short",
    hairColor: HAIR_COLORS.includes(raw.hairColor) ? raw.hairColor : HAIR_COLORS[0],
    shirt: SHIRTS.includes(raw.shirt) ? raw.shirt : SHIRTS[0],
    glasses: Boolean(raw.glasses),
    top: TOPS.includes(raw.top) ? raw.top : "tshirt",
    bottom: BOTTOMS.includes(raw.bottom) ? raw.bottom : "jeans",
    bottomColor: BOTTOM_COLORS.includes(raw.bottomColor) ? raw.bottomColor : BOTTOM_COLORS[0],
    shoes: SHOES.includes(raw.shoes) ? raw.shoes : "white",
    accessory: ACCESSORIES.includes(raw.accessory) ? raw.accessory : "none",
    headphoneColor: HEADPHONE_COLORS.includes(raw.headphoneColor) ? raw.headphoneColor : HEADPHONE_COLORS[0],
  };
}

function getUser(socket) {
  return socket.data.userKey ? users.get(socket.data.userKey) : null;
}

function publicRooms() {
  return [...rooms.values()].map((r) => ({
    id: r.id,
    name: r.name,
    owner: r.owner,
    locked: r.locked,
    occupantCount: r.occupants.length,
    place: Boolean(r.publicPlace),
    shop: r.shop || null,
  }));
}

const ACTION_EMOTES = new Set(["wave", "dance", "cry", "laugh", "clap", "shrug", "heart", "cheer"]);
const ACTION_EMOTE_MS = { wave: 3000, cry: 4000, laugh: 3500, clap: 3000, shrug: 2500, heart: 3000, cheer: 3000 };

function clearActionEmote(user, emit = true) {
  if (!user || !ACTION_EMOTES.has(user.actionEmote)) {
    if (user) {
      user.actionEmote = null;
      user.actionEmoteAt = null;
    }
    return;
  }
  user.actionEmote = null;
  user.actionEmoteAt = null;
  if (emit && user.roomId) {
    io.to(user.roomId).emit("userEmote", { username: user.username, type: null, action: true });
  }
}

function snapshotPerson(u) {
  return {
    username: u.username,
    avatar: u.avatar,
    x: u.x,
    y: u.y,
    sitting: u.sitting,
    emote: u.emote,
    actionEmote: u.actionEmote || null,
    actionEmoteAt: u.actionEmoteAt || null,
    usingPhone: Boolean(u.usingPhone),
    heldProp: u.heldProp || null,
    activePet: u.activePet || null,
    heldItem: u.heldItem || null,
    boxing: u.boxing || null,
    gym: u.gym || null,
    facing: u.sitting ? snapFacingToAxis(u.facing) : (u.facing || null),
    stationId: u.stationId || null,
    seat: u.seat ?? null,
  };
}

function roomState(room) {
  ensureRoomExtras(room);
  return {
    id: room.id,
    name: room.name,
    owner: room.owner,
    locked: room.locked,
    hasPassword: Boolean(room.password),
    furniture: room.furniture,
    wallpaper: room.wallpaper,
    floorStyle: room.floorStyle,
    lightsOn: room.lightsOn !== false,
    tvs: room.tvs || {},
    recordPlayers: room.recordPlayers || {},
    chess: publicChessMap(room),
    uses: room.uses || {},
    wallArt: room.wallArt || [],
    pets: (room.pets || []).map((p) => ({ ...p })),
    seats: publicSeats(room),
    arcade: publicArcade(room),
    serverTime: Date.now(),
    grid: roomSize(room),
    size: roomSize(room),
    publicPlace: Boolean(room.publicPlace),
    shop: room.shop || null,
    npcs: (room.npcs || []).map((n) => ({ ...n })),
    occupants: room.occupants.slice(),
    people: room.occupants
      .map((name) => {
        const u = users.get(name.toLowerCase());
        return u ? snapshotPerson(u) : null;
      })
      .filter(Boolean),
  };
}

function friendList(user) {
  return user.friends.map((fname) => {
    const f = users.get(fname.toLowerCase());
    if (!f) {
      return {
        username: fname,
        displayName: fname,
        exists: false,
        online: false,
        roomId: null,
        roomName: null,
        locked: false,
        avatar: null,
      };
    }
    const room = f.roomId ? rooms.get(f.roomId) : null;
    return {
      username: f.username,
      displayName: (f.avatar && f.avatar.displayName) || f.username,
      exists: true,
      online: Boolean(f.socketId),
      roomId: room?.id ?? null,
      roomName: room?.name ?? null,
      locked: room?.locked ?? false,
      avatar: f.avatar,
    };
  });
}

function invitesFor(username) {
  const key = username.toLowerCase();
  const list = [];
  for (const r of rooms.values()) {
    if (r.invites.has(key)) {
      list.push({ roomId: r.id, roomName: r.name, from: r.owner });
    }
  }
  return list;
}

function publicUser(user) {
  return {
    username: user.username,
    avatar: user.avatar,
    coins: user.coins,
    inventory: user.inventory.slice(),
    friends: friendList(user),
    roomId: user.roomId,
    invites: invitesFor(user.username),
    collection: user.collection || emptyCollection(),
    heldProp: user.heldProp || null,
    activePet: user.activePet || null,
    extraSpins: user.extraSpins || 0,
    rewards: {
      freeSpinAvailable: !user.freeSpinUsed,
      extraSpins: user.extraSpins || 0,
      adsLeft: Math.max(0, AD_DAILY_CAP - (user.adsWatchedToday || 0)),
      adSpinsLeft: Math.max(0, AD_SPIN_DAILY_CAP - (user.adSpinsToday || 0)),
      hangoutEarnedToday: user.hangoutEarnedToday || 0,
      hangoutCap: HANGOUT_DAILY_CAP,
      packs: COIN_PACKS,
      odds: SPIN_PRIZES.map((p) => ({
        id: p.id,
        label: p.label,
        type: p.type,
        chance: Math.round((p.weight / SPIN_WEIGHT_TOTAL) * 1000) / 10,
      })),
    },
  };
}

function broadcastRooms() {
  io.emit("roomsUpdated", publicRooms());
}

function notifyFriendWatchers(subject) {
  const subjectKey = subject.username.toLowerCase();
  for (const u of users.values()) {
    if (!u.socketId) continue;
    if (u.friends.some((f) => f.toLowerCase() === subjectKey)) {
      io.to(u.socketId).emit("friendsUpdated", friendList(u));
    }
  }
}



function isWallArt(type) {
  return WALL_ART_TYPES.has(type) || FURNITURE_CATALOG[type]?.surface === "wall";
}

function reservedWallSlots(size) {
  return layoutReservedWallSlots(size || START_SIZE);
}

function canPlaceWallOn(room, type, wall, slot, ignoreId) {
  if (!isWallArt(type)) return false;
  if (wall !== "back" && wall !== "left") return false;
  const n = roomSize(room);
  const s = Math.round(Number(slot));
  if (s < 0 || s >= n) return false;
  if (reservedWallSlots(n)[wall].has(s)) return false;
  return !(room.wallArt || []).some((a) => a.wall === wall && a.slot === s && a.id !== ignoreId);
}

function seatCountOf(type) {
  if (type === "couch" || type === "capsulecouch") return 2;
  if (type === "chair" || type === "hoverchair") return 1;
  return 0;
}

function seatPoseOf(furn, seatNum) {
  const n = seatCountOf(furn.type) || 1;
  const r = normalizeRot(furn.rot);
  const { w, h } = dimsOf(furn.type, r);
  const cx = furn.x + (w - 1) / 2;
  const cy = furn.y + (h - 1) / 2;
  const t = n === 1 ? 0 : (seatNum / (n - 1) - 0.5);
  const along = (r % 2 === 0 ? w : h) * 0.42;
  const localX = t * along;
  const localY = 0.08;
  if (r === 0) return { x: cx + localX, y: cy + localY, facing: { x: 0, z: 1 } };
  if (r === 1) return { x: cx + localY, y: cy - localX, facing: { x: 1, z: 0 } };
  if (r === 2) return { x: cx - localX, y: cy - localY, facing: { x: 0, z: -1 } };
  return { x: cx - localY, y: cy + localX, facing: { x: -1, z: 0 } };
}

function sittersOn(room, id) {
  const out = [];
  for (const u of users.values()) {
    if (u.roomId === room.id && u.stationId === id && u.sitting) out.push(u);
  }
  return out;
}

function publicSeats(room) {
  const out = {};
  for (const f of room.furniture || []) {
    const n = seatCountOf(f.type);
    if (!n) continue;
    const map = {};
    for (let i = 0; i < n; i++) map[i] = null;
    for (const u of sittersOn(room, f.id)) {
      const s = u.seat ?? 0;
      map[s] = u.username;
    }
    out[f.id] = map;
  }
  return out;
}

function publicArcade(room) {
  const out = {};
  for (const [id, a] of Object.entries(room.arcade || {})) {
    out[id] = {
      user: a.user || null,
      state: a.state || null,
      scores: (a.scores || []).slice(0, 5),
    };
  }
  return out;
}

function emitSeats(room) {
  emitRoom(room, "seatsUpdated", { seats: publicSeats(room) });
}


function trySit(user, room, furn, seat, socket) {
  ensureRoomExtras(room);
  const n = seatCountOf(furn.type);
  if (!n) return false;
  if (!room.seats[furn.id]) room.seats[furn.id] = {};
  const taken = sittersOn(room, furn.id);
  const occupied = new Set(taken.map((u) => u.seat ?? 0));
  const holderOf = (i) => taken.find((u) => (u.seat ?? 0) === i);
  let seatNum = seat == null || seat === "" ? -1 : Number(seat);
  if (Number.isFinite(seatNum) && seatNum >= 0 && seatNum < n) {
    const holder = holderOf(seatNum);
    if (holder && holder.username !== user.username) {
      socket?.emit("errorMsg", { message: "Seat taken" });
      return false;
    }
  } else {
    seatNum = -1;
    for (let i = 0; i < n; i++) {
      if (!occupied.has(i) || holderOf(i)?.username === user.username) {
        seatNum = i;
        break;
      }
    }
  }
  if (seatNum < 0) {
    socket?.emit("errorMsg", { message: "Seat taken" });
    return false;
  }
  clearUserActivities(user, room, { forfeit: true });
  if (!room.seats[furn.id]) room.seats[furn.id] = {};
  room.seats[furn.id][seatNum] = user.username;
  const pose = seatPoseOf(furn, seatNum);
  user.x = pose.x;
  user.y = pose.y;
  user.facing = pose.facing;
  user.sitting = true;
  user.stationId = furn.id;
  user.seat = seatNum;
  emitPerson(user);
  io.to(room.id).emit("userMoved", { username: user.username, x: user.x, y: user.y, sitting: true, facing: user.facing });
  emitSeats(room);
  return true;
}

function furnitureInUse(room, id) {
  if (sittersOn(room, id).length) return "Someone is sitting there.";
  const use = room.uses?.[id];
  if (use) return "Someone is using that.";
  if (room.arcade?.[id]?.user) return "Someone is playing Cubics.";
  const game = room.chess?.[id];
  if (game && (game.seats?.[0] || game.seats?.[1])) return "Someone is sitting there.";
  return null;
}

function migrateRoomChessTables(room) {
  if (!Array.isArray(room.furniture)) return;
  const n = roomSize(room);
  for (const f of room.furniture) {
    if (f.type !== "chesstable") continue;
    if (canPlaceOn(room, "chesstable", f.x, f.y, f.rot, f.id)) continue;
    const moved = migrateChessTable(f, n, (x, y) => {
      if (!inBounds(x, y, n)) return false;
      return !occupiedSet(room, f.id).has(`${x},${y}`);
    });
    if (moved) {
      f.x = moved.x;
      f.y = moved.y;
      f.rot = moved.rot;
    }
  }
}

function ensureRoomExtras(room) {
  if (!room.tvs) room.tvs = {};
  if (!room.recordPlayers) room.recordPlayers = {};
  if (!room.chess) room.chess = {};
  if (!room.uses) room.uses = {};
  if (!room.wallArt) room.wallArt = [];
  if (!room.seats) room.seats = {};
  if (!room.arcade) room.arcade = {};
  if (!Array.isArray(room.pets)) room.pets = [];
  if (room.lightsOn === undefined) room.lightsOn = true;
  if (Array.isArray(room.furniture)) {
    for (const f of room.furniture) f.rot = normalizeRot(f.rot);
    migrateRoomChessTables(room);
    migrateWallArtOffReserved(room);
  }
  return room;
}

function migrateWallArtOffReserved(room) {
  const list = room.wallArt || [];
  if (!list.length) return;
  const n = roomSize(room);
  const reserved = reservedWallSlots(n);
  for (const art of list) {
    const wall = art.wall === "z" ? "left" : art.wall;
    if (!(reserved[wall]?.has(art.slot))) continue;
    let found = null;
    for (const w of [wall, "left", "back"]) {
      for (let s = 0; s < n; s++) {
        if (reserved[w]?.has(s)) continue;
        if (list.some((a) => a !== art && a.wall === w && a.slot === s)) continue;
        found = { wall: w, slot: s };
        break;
      }
      if (found) break;
    }
    if (found) {
      art.wall = found.wall;
      art.slot = found.slot;
    }
  }
}

function publicChess(game) {
  if (!game) return null;
  const fen = game.engine ? game.engine.fen() : game.fen;
  const engine = game.engine || (fen ? new Chess(fen) : null);
  return {
    fen,
    white: game.white || null,
    black: game.black || null,
    seats: game.seats || { 0: null, 1: null },
    result: game.result || null,
    winner: game.winner || null,
    lastMove: game.lastMove || null,
    turn: engine ? engine.turn() : "w",
    check: engine ? engine.isCheck() : false,
    checkmate: engine ? engine.isCheckmate() : false,
    stalemate: engine ? engine.isStalemate() : false,
    captured: game.captured || { w: [], b: [] },
    legal: null,
    away: game.away && Object.keys(game.away).length ? { ...game.away } : {},
  };
}

function publicChessMap(room) {
  const out = {};
  for (const [id, g] of Object.entries(room.chess || {})) {
    out[id] = publicChess(g);
  }
  return out;
}

function emitRoom(room, event, payload) {
  io.to(room.id).emit(event, payload);
}

function emitPerson(user) {
  emitProfile(user);
  if (user.roomId) io.to(user.roomId).emit("userUpdated", snapshotPerson(user));
}

function clearHeldTimer(user) {
  if (user._heldTimer) {
    clearTimeout(user._heldTimer);
    user._heldTimer = null;
  }
}

function clearUserActivities(user, room, { forfeit = true, keepChess = false } = {}) {
  if (!user) return;
  const stationId = user.stationId;
  if (room && stationId) {
    const use = room.uses?.[stationId];
    const furn = room.furniture.find((f) => f.id === stationId);
    if (furn?.type === "chesstable" && room.chess?.[stationId] && !keepChess) {
      const game = room.chess[stationId];
      const wasWhite = game.white === user.username;
      const wasBlack = game.black === user.username;
      if (forfeit && !game.result && (wasWhite || wasBlack) && game.white && game.black) {
        game.result = "forfeit";
        game.winner = wasWhite ? game.black : game.white;
      }
      if (game.seats) {
        if (game.seats[0] === user.username) game.seats[0] = null;
        if (game.seats[1] === user.username) game.seats[1] = null;
      }
      if (wasWhite) game.white = null;
      if (wasBlack) game.black = null;
      clearChessAway(game, user.username);
      emitRoom(room, "chessUpdated", { id: stationId, game: publicChess(game) });
    }
    if (use && use.user === user.username) {
      delete room.uses[stationId];
      emitRoom(room, "useUpdated", { id: stationId, use: null });
    }
    if (room.seats?.[stationId]) {
      for (const k of Object.keys(room.seats[stationId])) {
        if (room.seats[stationId][k] === user.username) room.seats[stationId][k] = null;
      }
      emitSeats(room);
    }
    if (room.arcade?.[stationId]?.user === user.username) {
      room.arcade[stationId].user = null;
      room.arcade[stationId].state = null;
      emitRoom(room, "arcadeUpdated", { id: stationId, arcade: publicArcade(room)[stationId] });
    }
  }
  clearBrewTimer(user);
  user.stationId = null;
  user.sitting = false;
  user.seat = null;
  if (user.boxing) user.boxing = null;
  if (user.gym) user.gym = null;
  if (user.usingPhone) {
    user.usingPhone = false;
    if (user.roomId) io.to(user.roomId).emit("userPhone", { username: user.username, on: false });
  }
  clearActionEmote(user, true);
}

const CHESS_RECONNECT_MS = 60_000;

function findActiveChess(room, username) {
  if (!room?.chess) return null;
  for (const [id, game] of Object.entries(room.chess)) {
    if (!game || game.result) continue;
    if (game.white === username || game.black === username) return { id, game };
  }
  return null;
}

function clearChessAway(game, username) {
  if (!game) return;
  if (game.away) delete game.away[username];
  if (game._awayTimers?.[username]) {
    clearTimeout(game._awayTimers[username]);
    delete game._awayTimers[username];
  }
}

function armChessReconnect(room, id, username) {
  const game = room?.chess?.[id];
  if (!game || game.result) return;
  game.away = game.away || {};
  game.away[username] = Date.now();
  game._awayTimers = game._awayTimers || {};
  if (game._awayTimers[username]) clearTimeout(game._awayTimers[username]);
  game._awayTimers[username] = setTimeout(() => {
    delete game._awayTimers[username];
    if (game.result) return;
    if (!game.away?.[username]) return;
    const wasWhite = game.white === username;
    const wasBlack = game.black === username;
    if (game.white && game.black && (wasWhite || wasBlack)) {
      game.result = "forfeit";
      game.winner = wasWhite ? game.black : game.white;
    }
    if (game.seats) {
      if (game.seats[0] === username) game.seats[0] = null;
      if (game.seats[1] === username) game.seats[1] = null;
    }
    if (wasWhite) game.white = null;
    if (wasBlack) game.black = null;
    delete game.away[username];
    emitRoom(room, "chessUpdated", { id, game: publicChess(game) });
    const parked = [...users.values()].find((u) => u.username === username && u.roomId === room.id && !u.socketId);
    if (parked) leaveRoom(parked);
  }, CHESS_RECONNECT_MS);
  emitRoom(room, "chessUpdated", { id, game: publicChess(game) });
}

function capturedFromHistory(engine) {
  const cap = { w: [], b: [] };
  for (const m of engine.history({ verbose: true })) {
    if (m.captured) {
      const taker = m.color;
      cap[taker].push(m.captured);
    }
  }
  return cap;
}

function requireOwner(socket, user) {
  if (!user?.roomId) return null;
  const room = rooms.get(user.roomId);
  if (!room || !isRoomOwner(user, room)) {
    socket.emit("errorMsg", { message: "Only the cube owner can decorate this room." });
    return null;
  }
  return room;
}


function seatWorld(furn, seatNum) {
  if (furn.type === "chesstable") return chessSeatPose(furn, seatNum);
  const { w, h } = dimsOf(furn.type, furn.rot);
  const rot = normalizeRot(furn.rot);
  // seat 0 at the "front" of the table, seat 1 at the back, in tile coords
  const cx = furn.x + (w - 1) / 2;
  const cy = furn.y + (h - 1) / 2;
  let sx = cx;
  let sy = cy;
  if (rot === 0) sy = seatNum === 0 ? furn.y + h - 0.15 : furn.y + 0.15;
  else if (rot === 2) sy = seatNum === 0 ? furn.y + 0.15 : furn.y + h - 0.15;
  else if (rot === 1) sx = seatNum === 0 ? furn.x + 0.15 : furn.x + w - 0.15;
  else sx = seatNum === 0 ? furn.x + w - 0.15 : furn.x + 0.15;
  const fx = cx - sx;
  const fz = cy - sy;
  const len = Math.hypot(fx, fz) || 1;
  return { x: sx, y: sy, facing: { x: fx / len, z: fz / len } };
}

function startHeldItem(user, kind) {
  const durations = { sandwich: 20000, pizza: 20000, soda: 45000, chicken: 20000, water: 45000, coffee: 50000 };
  clearHeldTimer(user);
  if (user.heldProp) {
    user.stowedProp = user.heldProp;
    user.heldProp = null;
  }
  user.heldItem = { kind, startedAt: Date.now(), sips: kind === "coffee" ? 6 : undefined };
  user._heldTimer = setTimeout(() => {
    const was = user.heldItem?.kind;
    user.heldItem = null;
    user._heldTimer = null;
    if (user.stowedProp) {
      user.heldProp = user.stowedProp;
      user.stowedProp = null;
    }
    emitPerson(user);
    if (was === "coffee" && user.roomId) {
      io.to(user.roomId).emit("userSaid", { username: user.username, text: "ahh", at: Date.now() });
    }
  }, durations[kind] || 6000);
}

function clearBrewTimer(user) {
  if (user?._brewTimer) {
    clearTimeout(user._brewTimer);
    user._brewTimer = null;
  }
}

function emitProfile(user) {
  if (user.socketId) io.to(user.socketId).emit("profile", publicUser(user));
}

function leaveRoom(user) {
  if (!user?.roomId) return;
  const prevId = user.roomId;
  const room = rooms.get(prevId);
  if (room) clearUserActivities(user, room, { forfeit: true });
  user.roomId = null;
  user.sitting = false;
  user.emote = null;
  user.heldItem = null;
  clearHeldTimer(user);
  if (room) {
    room.occupants = room.occupants.filter(
      (n) => n.toLowerCase() !== user.username.toLowerCase()
    );
    io.to(room.id).emit("userLeft", { username: user.username });
  }
  const sock = user.socketId ? io.sockets.sockets.get(user.socketId) : null;
  if (sock) sock.leave(prevId);
  broadcastRooms();
  notifyFriendWatchers(user);
}

function canEnter(user, room, password) {
  if (!room.locked) return { ok: true };
  if (isRoomOwner(user, room)) return { ok: true };
  if (room.invites.has(user.username.toLowerCase())) return { ok: true };
  if (password == null || password === "") return { ok: false, reason: "password_required" };
  if (password === room.password) return { ok: true };
  return { ok: false, reason: "bad_password" };
}

function joinUserToRoom(user, room, socket) {
  if (user.roomId && user.roomId !== room.id) leaveRoom(user);
  if (user.roomId === room.id) {
    socket.join(room.id);
    socket.emit("joinedRoom", roomState(room));
    return;
  }
  user.roomId = room.id;
  const spawn = findSpawnTile(room);
  user.x = spawn.x;
  user.y = spawn.y;
  user.sitting = false;
  user.emote = null;
  room.occupants.push(user.username);
  socket.join(room.id);
  socket.emit("joinedRoom", roomState(room));
  socket.to(room.id).emit("userJoined", snapshotPerson(user));
  broadcastRooms();
  notifyFriendWatchers(user);
}


function applyPrize(user, prize) {
  if (prize.type === "coins") {
    user.coins += prize.amount;
  } else if (prize.type === "furniture" && FURNITURE_CATALOG[prize.item]) {
    user.inventory.push(prize.item);
  } else if (prize.type === "clothes") {
    user.collection.clothes.push({ id: prize.id + "-" + Date.now(), label: prize.label, item: prize.item });
  } else if (prize.type === "prop") {
    if (!(user.collection.props || []).some((p) => p.item === prize.item)) {
      user.collection.props.push({ id: prize.id, item: prize.item, label: prize.label });
    }
    user.heldProp = prize.item;
  } else if (prize.type === "pet") {
    if (!(user.collection.pets || []).some((p) => p.item === prize.item)) {
      user.collection.pets.push({ id: prize.id, item: prize.item, label: prize.label });
    }
    user.activePet = prize.item;
  } else if (prize.type === "spin") {
    user.extraSpins = (user.extraSpins || 0) + (prize.amount || 1);
  }
}

function hasFriendInRoom(user) {
  if (!user.roomId) return false;
  const room = rooms.get(user.roomId);
  if (!room) return false;
  return room.occupants.some((name) => {
    if (name.toLowerCase() === user.username.toLowerCase()) return false;
    return user.friends.some((f) => f.toLowerCase() === name.toLowerCase());
  });
}

setInterval(() => {
  const step = 10;
  for (const user of users.values()) {
    if (!user.socketId) continue;
    ensureDay(user);
    if (!hasFriendInRoom(user)) {
      user.hangoutAccrued = 0;
      continue;
    }
    if ((user.hangoutEarnedToday || 0) >= HANGOUT_DAILY_CAP) continue;
    user.hangoutAccrued = (user.hangoutAccrued || 0) + step * 1000;
    if (user.hangoutAccrued >= HANGOUT_INTERVAL_MS) {
      user.hangoutAccrued = 0;
      const amt = Math.min(HANGOUT_REWARD, HANGOUT_DAILY_CAP - user.hangoutEarnedToday);
      if (amt <= 0) continue;
      user.coins += amt;
      user.hangoutEarnedToday += amt;
      if (user.socketId) {
        io.to(user.socketId).emit("coinsEarned", { amount: amt, reason: "hangout", coins: user.coins });
        emitProfile(user);
      }
    }
  }
}, 10000);

io.on("connection", (socket) => {
  function makeCube(name, owner) {
    return {
      id: "r" + roomSeq++,
      name,
      owner,
      locked: false,
      password: "",
      occupants: [],
      furniture: [],
      size: START_SIZE,
      wallpaper: "paint-cream",
      floorStyle: "wood",
      lightsOn: true,
      tvs: {},
      chess: {},
      uses: {},
      wallArt: [],
      seats: {},
      arcade: {},
      invites: new Set(),
    };
  }

  function homeCubeName(user) {
    const n = String(user.avatar?.displayName || user.username || "My").slice(0, 18);
    return (n + "'s Cube").slice(0, 28);
  }

  function ensureHomeRoom(user) {
    if (user.homeRoomId) {
      const existing = rooms.get(user.homeRoomId);
      if (existing) return existing;
    }
    const owned = [...rooms.values()].find((r) => r.owner && r.owner.toLowerCase() === user.username.toLowerCase() && !r.publicPlace);
    if (owned) {
      user.homeRoomId = owned.id;
      return owned;
    }
    const room = makeCube(homeCubeName(user), user.username);
    rooms.set(room.id, room);
    user.homeRoomId = room.id;
    return room;
  }

  function enterHomeRoom(user, sock) {
    const room = ensureHomeRoom(user);
    joinUserToRoom(user, room, sock);
  }

  function defaultAvatar(username) {
    return sanitizeAvatar({ displayName: String(username || "Friend").slice(0, 16) });
  }

  const GUEST_ADJ = ["Sunny", "Brave", "Cozy", "Lucky", "Swift", "Merry", "Calm", "Bold", "Kind", "Zippy", "Happy", "Chill"];
  const GUEST_NOUN = ["Cube", "Fox", "Bean", "Puff", "Star", "Moss", "Spark", "Bud", "Dot", "Pal", "Pip", "Kid"];

  function allocateGuestUsername() {
    for (let i = 0; i < 80; i++) {
      const adj = GUEST_ADJ[Math.floor(Math.random() * GUEST_ADJ.length)];
      const noun = GUEST_NOUN[Math.floor(Math.random() * GUEST_NOUN.length)];
      const num = String(10 + Math.floor(Math.random() * 90));
      const name = adj + noun + num;
      if (name.length >= 2 && name.length <= 16 && !users.has(name.toLowerCase())) return name;
    }
    for (let i = 1; i < 10000; i++) {
      const name = "Guest" + i;
      if (!users.has(name.toLowerCase())) return name;
    }
    return ("Guest" + Date.now().toString(36)).slice(0, 16);
  }

  function makeUser(username) {
    return {
      username,
      avatar: defaultAvatar(username),
      coins: START_COINS,
      inventory: [],
      friends: [],
      socketId: null,
      roomId: null,
      x: 3,
      y: 5,
      sitting: false,
      emote: null,
      collection: emptyCollection(),
      heldProp: null,
      activePet: null,
      extraSpins: 0,
      freeSpinUsed: false,
      hangoutEarnedToday: 0,
      hangoutAccrued: 0,
      adsWatchedToday: 0,
      adSpinsToday: 0,
      economyDate: null,
    };
  }

  function syncHomeCubeName(user) {
    if (!user?.homeRoomId) return;
    const room = rooms.get(user.homeRoomId);
    if (!room || !room.owner || room.owner.toLowerCase() !== user.username.toLowerCase()) return;
    const next = homeCubeName(user);
    if (room.name === next) return;
    room.name = next;
    io.emit("roomsUpdated", publicRooms());
  }

  function finishLogin(user, sock, { isNew = false } = {}) {
    if (!user.avatar) user.avatar = defaultAvatar(user.username);
    if (!user.collection) user.collection = emptyCollection();
    user.socketId = sock.id;
    sock.data.userKey = user.username.toLowerCase();
    ensureDay(user);
    let daily = 0;
    if (user.lastLoginBonusOn !== todayStamp()) {
      user.lastLoginBonusOn = todayStamp();
      user.coins += DAILY_LOGIN_BONUS;
      daily = DAILY_LOGIN_BONUS;
    }
    const resumeRoom = user.roomId ? rooms.get(user.roomId) : null;
    sock.emit("loggedIn", {
      user: publicUser(user),
      rooms: publicRooms(),
      resumeRoomId: resumeRoom ? resumeRoom.id : null,
      homeRoomId: user.homeRoomId || null,
      isNew: Boolean(isNew),
    });
    if (daily) sock.emit("coinsEarned", { amount: daily, reason: "daily", coins: user.coins });
    if (resumeRoom) {
      sock.join(resumeRoom.id);
      const playing = findActiveChess(resumeRoom, user.username);
      if (playing) {
        clearChessAway(playing.game, user.username);
        emitRoom(resumeRoom, "chessUpdated", { id: playing.id, game: publicChess(playing.game) });
      }
      sock.emit("joinedRoom", roomState(resumeRoom));
    } else {
      enterHomeRoom(user, sock);
    }
    notifyFriendWatchers(user);
  }

  socket.on("guestLogin", () => {
    const username = allocateGuestUsername();
    const user = makeUser(username);
    users.set(username.toLowerCase(), user);
    finishLogin(user, socket, { isNew: true });
  });

  socket.on("login", ({ username } = {}) => {
    username = String(username || "").trim();
    if (!/^[a-zA-Z0-9_]{2,16}$/.test(username)) {
      socket.emit("errorMsg", {
        message: "Username must be 2–16 letters, numbers, or underscores.",
      });
      return;
    }
    const key = username.toLowerCase();
    let user = users.get(key);
    if (user && user.socketId && user.socketId !== socket.id && io.sockets.sockets.has(user.socketId)) {
      socket.emit("errorMsg", { message: "That name is already hanging out here." });
      return;
    }
    let isNew = false;
    if (!user) {
      user = makeUser(username);
      users.set(key, user);
      isNew = true;
    }
    finishLogin(user, socket, { isNew });
  });

  socket.on("updateAvatar", (raw) => {
    const user = getUser(socket);
    if (!user) return;
    const next = sanitizeAvatar(raw);
    for (const field of Object.keys(STORE_LOCKED)) {
      if (!userOwnsStyle(user, field, next[field]) && user.avatar) {
        next[field] = user.avatar[field];
        if (!userOwnsStyle(user, field, next[field])) {
          if (field === "top") next[field] = "tshirt";
          else if (field === "bottom") next[field] = "jeans";
          else if (field === "shoes") next[field] = "white";
          else if (field === "accessory") next[field] = "none";
          else if (field === "hair") next[field] = "short";
        }
      }
    }
    const firstAvatar = !user.avatar;
    user.avatar = next;
    if (!user.avatar.displayName) user.avatar.displayName = user.username;
    syncHomeCubeName(user);
    emitProfile(user);
    if (firstAvatar && !user.roomId) {
      enterHomeRoom(user, socket);
    } else if (user.roomId) {
      io.to(user.roomId).emit("userUpdated", snapshotPerson(user));
    }
  });

  socket.on("addFriend", ({ username } = {}) => {
    const user = getUser(socket);
    if (!user) return;
    const name = String(username || "").trim();
    if (!name) return;
    if (name.toLowerCase() === user.username.toLowerCase()) {
      socket.emit("errorMsg", { message: "You are already your own best friend." });
      return;
    }
    const target = users.get(name.toLowerCase());
    if (!target) {
      socket.emit("errorMsg", { message: `Nobody named "${name}" is here yet.` });
      return;
    }
    if (!user.friends.some((f) => f.toLowerCase() === target.username.toLowerCase())) {
      user.friends.push(target.username);
    }
    emitProfile(user);
    socket.emit("friendsUpdated", friendList(user));
  });

  socket.on("createRoom", ({ name, locked, password } = {}) => {
    const user = getUser(socket);
    if (!user) return;
    if (!user.avatar) {
      socket.emit("errorMsg", { message: "Create your character first." });
      return;
    }
    name = String(name || "").trim().slice(0, 28);
    if (name.length < 2) {
      socket.emit("errorMsg", { message: "Room name needs at least 2 characters." });
      return;
    }
    locked = Boolean(locked);
    password = locked ? String(password || "") : "";
    if (locked && password.length < 2) {
      socket.emit("errorMsg", { message: "Locked rooms need a password (2+ characters)." });
      return;
    }
    const room = {
      id: "r" + roomSeq++,
      name,
      owner: user.username,
      locked,
      password,
      occupants: [],
      furniture: [],
      size: START_SIZE,
      wallpaper: "paint-cream",
      floorStyle: "wood",
      lightsOn: true,
      tvs: {},
      chess: {},
      uses: {},
      wallArt: [],
      seats: {},
      arcade: {},
      invites: new Set(),
    };
    rooms.set(room.id, room);
    joinUserToRoom(user, room, socket);
  });

  socket.on("joinRoom", ({ roomId, password } = {}) => {
    const user = getUser(socket);
    if (!user) return;
    if (!user.avatar) {
      socket.emit("errorMsg", { message: "Create your character first." });
      return;
    }
    const room = rooms.get(roomId);
    if (!room) {
      socket.emit("joinResult", { ok: false, reason: "not_found" });
      socket.emit("errorMsg", { message: "That cube is gone." });
      return;
    }
    const gate = canEnter(user, room, password);
    if (!gate.ok) {
      socket.emit("joinResult", { ok: false, reason: gate.reason, roomId: room.id, roomName: room.name });
      if (gate.reason === "bad_password") {
        socket.emit("errorMsg", { message: "That password didn't work." });
      }
      return;
    }
    joinUserToRoom(user, room, socket);
    socket.emit("joinResult", { ok: true, roomId: room.id });
  });

  socket.on("leaveRoom", () => {
    const user = getUser(socket);
    if (!user) return;
    leaveRoom(user);
    socket.emit("leftRoom");
    emitProfile(user);
  });

  socket.on("logout", () => {
    const user = getUser(socket);
    if (user) {
      leaveRoom(user);
      user.socketId = null;
      notifyFriendWatchers(user);
    }
    socket.data.userKey = null;
    socket.emit("loggedOut");
  });

  socket.on("move", ({ x, y } = {}) => {
    const user = getUser(socket);
    if (!user?.roomId) return;
    const room = rooms.get(user.roomId);
    const tx = Math.round(Number(x));
    const ty = Math.round(Number(y));
    if (!room || !inBounds(tx, ty, roomSize(room))) return;
    if (blockedSet(room).has(`${tx},${ty}`)) return;
    const dx = tx - (user.x ?? tx);
    const dy = ty - (user.y ?? ty);
    if (dx || dy) user.facing = { x: dx, z: dy };
    user.x = tx;
    user.y = ty;
    user.sitting = false;
    if (ACTION_EMOTES.has(user.actionEmote)) clearActionEmote(user, true);
    if (user.usingPhone) {
      user.usingPhone = false;
      io.to(user.roomId).emit("userPhone", { username: user.username, on: false });
    }
    io.to(user.roomId).emit("userMoved", {
      username: user.username,
      x: user.x,
      y: user.y,
      sitting: false,
      facing: user.facing || null,
      usingPhone: false,
    });
  });

  socket.on("sit", ({ furnitureId, seat } = {}) => {
    const user = getUser(socket);
    if (!user?.roomId) return;
    const room = rooms.get(user.roomId);
    const furn = room?.furniture.find((f) => f.id === furnitureId);
    if (!furn || !seatCountOf(furn.type)) return;
    trySit(user, room, furn, seat, socket);
  });

  socket.on("typing", ({ on } = {}) => {
    const user = getUser(socket);
    if (!user?.roomId) return;
    user.typing = Boolean(on);
    io.to(user.roomId).emit("userTyping", {
      username: user.username,
      on: Boolean(on),
      at: Date.now(),
    });
  });

  socket.on("say", ({ text, shout } = {}) => {
    const user = getUser(socket);
    if (!user?.roomId) return;
    text = String(text || "").replace(/\s+/g, " ").trim().slice(0, 80);
    if (!text) return;
    if (user.typing) {
      user.typing = false;
      io.to(user.roomId).emit("userTyping", { username: user.username, on: false, at: Date.now() });
    }
    io.to(user.roomId).emit("userSaid", {
      username: user.username,
      text,
      shout: Boolean(shout),
      at: Date.now(),
    });
  });

  socket.on("usePhone", ({ on } = {}) => {
    const user = getUser(socket);
    if (!user?.roomId) return;
    const next = Boolean(on);
    if (Boolean(user.usingPhone) === next) return;
    user.usingPhone = next;
    if (next && ACTION_EMOTES.has(user.actionEmote)) clearActionEmote(user, true);
    io.to(user.roomId).emit("userPhone", { username: user.username, on: next });
  });

  socket.on("emote", ({ type } = {}) => {
    const user = getUser(socket);
    if (!user?.roomId) return;
    if (ACTION_EMOTES.has(type)) {
      if (user.actionEmote === type && type === "dance") {
        clearActionEmote(user, true);
        emitPerson(user);
        return;
      }
      user.actionEmote = type;
      user.actionEmoteAt = Date.now();
      io.to(user.roomId).emit("userEmote", { username: user.username, type, at: user.actionEmoteAt, action: true });
      emitPerson(user);
      const stamp = user.actionEmoteAt;
      const ms = ACTION_EMOTE_MS[type];
      if (ms) {
        setTimeout(() => {
          if (user.actionEmote === type && user.actionEmoteAt === stamp) {
            clearActionEmote(user, true);
          }
        }, ms);
      }
      return;
    }
    if (type !== "eat" && type !== "drink") return;
    user.emote = type;
    startHeldItem(user, type === "eat" ? "sandwich" : "soda");
    io.to(user.roomId).emit("userEmote", { username: user.username, type });
    emitPerson(user);
    const stamp = type;
    setTimeout(() => {
      if (user.emote === stamp) {
        user.emote = null;
        if (user.roomId) {
          io.to(user.roomId).emit("userEmote", { username: user.username, type: null });
        }
      }
    }, 4000);
  });

  socket.on("inviteUser", ({ username } = {}) => {
    const user = getUser(socket);
    if (!user?.roomId) return;
    const room = rooms.get(user.roomId);
    if (!room || !isRoomOwner(user, room)) {
      socket.emit("errorMsg", { message: "Only the room owner can send invites." });
      return;
    }
    const name = String(username || "").trim();
    const target = users.get(name.toLowerCase());
    if (!target) {
      socket.emit("errorMsg", { message: `Nobody named "${name}" is here yet.` });
      return;
    }
    room.invites.add(target.username.toLowerCase());
    socket.emit("inviteSent", { username: target.username, roomName: room.name });
    if (target.socketId) {
      io.to(target.socketId).emit("invited", {
        roomId: room.id,
        roomName: room.name,
        from: user.username,
      });
      io.to(target.socketId).emit("profile", publicUser(target));
    }
  });

  socket.on("buyFurniture", ({ type } = {}) => {
    const user = getUser(socket);
    if (!user) return;
    const item = FURNITURE_CATALOG[type];
    if (!item) return;
    if (user.coins < item.price) {
      socket.emit("errorMsg", { message: "Not enough coins for that." });
      return;
    }
    user.coins -= item.price;
    user.inventory.push(type);
    emitProfile(user);
    socket.emit("bought", { type, name: item.name, coins: user.coins });
  });

  socket.on("placeFurniture", ({ type, x, y, rot } = {}) => {
    const user = getUser(socket);
    const room = requireOwner(socket, user);
    if (!room) return;
    const idx = user.inventory.indexOf(type);
    if (idx === -1) {
      socket.emit("errorMsg", { message: "Buy that item first." });
      return;
    }
    if (!FURNITURE_CATALOG[type]) return;
    const tx = Math.round(Number(x));
    const ty = Math.round(Number(y));
    const r = normalizeRot(rot);
    if (!canPlaceOn(room, type, tx, ty, r)) {
      socket.emit("errorMsg", { message: "That doesn't fit on those tiles." });
      return;
    }
    user.inventory.splice(idx, 1);
    const piece = { id: "f" + furnSeq++, type, x: tx, y: ty, rot: r };
    room.furniture.push(piece);
    emitProfile(user);
    io.to(room.id).emit("furniturePlaced", piece);
  });

  socket.on("moveFurniture", ({ id, x, y, rot } = {}) => {
    const user = getUser(socket);
    const room = requireOwner(socket, user);
    if (!room) return;
    const piece = room.furniture.find((f) => f.id === id);
    if (!piece) return;
    const busy = furnitureInUse(room, id);
    if (busy) {
      socket.emit("errorMsg", { message: busy });
      return;
    }
    const tx = Math.round(Number(x));
    const ty = Math.round(Number(y));
    const r = normalizeRot(rot ?? piece.rot);
    if (!canPlaceOn(room, piece.type, tx, ty, r, piece.id)) {
      socket.emit("errorMsg", { message: "That doesn't fit on those tiles." });
      return;
    }
    piece.x = tx;
    piece.y = ty;
    piece.rot = r;
    io.to(room.id).emit("furnitureUpdated", piece);
  });

  socket.on("pickupFurniture", ({ id } = {}) => {
    const user = getUser(socket);
    const room = requireOwner(socket, user);
    if (!room) return;
    const idx = room.furniture.findIndex((f) => f.id === id);
    if (idx === -1) return;
    const piece = room.furniture[idx];
    const busy = furnitureInUse(room, id);
    if (busy) {
      socket.emit("errorMsg", { message: busy });
      return;
    }
    // kick anyone using it
    for (const u of users.values()) {
      if (u.stationId === id && u.roomId === room.id) {
        clearUserActivities(u, room, { forfeit: true });
        u.sitting = false;
        emitPerson(u);
      }
    }
    if (room.chess?.[id]) delete room.chess[id];
    if (room.tvs?.[id]) delete room.tvs[id];
    if (room.recordPlayers?.[id]) delete room.recordPlayers[id];
    if (room.uses?.[id]) delete room.uses[id];
    room.furniture.splice(idx, 1);
    user.inventory.push(piece.type);
    emitProfile(user);
    io.to(room.id).emit("furnitureRemoved", { id, type: piece.type });
  });

  socket.on("upgradeCube", () => {
    const user = getUser(socket);
    if (!user?.roomId) return;
    const room = rooms.get(user.roomId);
    if (!room || !isRoomOwner(user, room)) {
      socket.emit("errorMsg", { message: "Only the cube owner can upgrade it." });
      return;
    }
    const next = room.size === 6 ? 8 : room.size === 8 ? 10 : null;
    const cost = UPGRADE_COST[room.size];
    if (!next || !cost) {
      socket.emit("errorMsg", { message: "This cube is already as big as it gets." });
      return;
    }
    if (user.coins < cost) {
      socket.emit("errorMsg", { message: "Not enough coins to upgrade this cube." });
      return;
    }
    user.coins -= cost;
    room.size = next;
    emitProfile(user);
    io.to(room.id).emit("roomResized", { size: next });
  });

  socket.on("setRoomLock", ({ locked, password } = {}) => {
    const user = getUser(socket);
    if (!user?.roomId) return;
    const room = rooms.get(user.roomId);
    if (!room || !isRoomOwner(user, room)) {
      socket.emit("errorMsg", { message: "Only the cube owner can lock this room." });
      return;
    }
    locked = Boolean(locked);
    if (locked) {
      const next = String(password || "").trim();
      const pass = next.length ? next : String(room.password || "");
      if (pass.length < 2) {
        socket.emit("errorMsg", { message: "Locked rooms need a password (2+ characters)." });
        return;
      }
      room.locked = true;
      room.password = pass;
    } else {
      room.locked = false;
      room.password = "";
    }
    io.to(room.id).emit("roomLock", { locked: room.locked, hasPassword: Boolean(room.password) });
    broadcastRooms();
  });

  socket.on("setRoomStyle", ({ wallpaper, floorStyle } = {}) => {
    const user = getUser(socket);
    if (!user?.roomId) return;
    const room = rooms.get(user.roomId);
    if (!room || !isRoomOwner(user, room)) return;
    if (WALLPAPERS.includes(wallpaper)) room.wallpaper = wallpaper;
    if (FLOORS.includes(floorStyle)) room.floorStyle = floorStyle;
    io.to(room.id).emit("roomStyle", { wallpaper: room.wallpaper, floorStyle: room.floorStyle });
  });

  socket.on("claimAdReward", () => {
    const user = getUser(socket);
    if (!user) return;
    ensureDay(user);
    if (user.adsWatchedToday >= AD_DAILY_CAP) {
      socket.emit("errorMsg", { message: "That's all the ad coins for today." });
      return;
    }
    user.adsWatchedToday += 1;
    user.coins += AD_REWARD;
    emitProfile(user);
    socket.emit("coinsEarned", { amount: AD_REWARD, reason: "ad", coins: user.coins });
  });

  socket.on("buyCoinPack", ({ pack } = {}) => {
    const user = getUser(socket);
    if (!user) return;
    const spec = COIN_PACKS[pack];
    if (!spec) return;
    user.coins += spec.coins;
    emitProfile(user);
    socket.emit("coinsEarned", { amount: spec.coins, reason: "store", coins: user.coins });
    socket.emit("storePurchase", { pack, label: spec.label, coins: spec.coins, price: spec.price });
  });

  socket.on("claimAdSpin", () => {
    const user = getUser(socket);
    if (!user) return;
    ensureDay(user);
    if (user.adSpinsToday >= AD_SPIN_DAILY_CAP) {
      socket.emit("errorMsg", { message: "That's all the extra spins from ads today." });
      return;
    }
    user.adSpinsToday += 1;
    user.extraSpins = (user.extraSpins || 0) + 1;
    emitProfile(user);
    socket.emit("spinGranted", { extraSpins: user.extraSpins });
  });

  socket.on("spinWheel", () => {
    const user = getUser(socket);
    if (!user) return;
    ensureDay(user);
    let usedExtra = false;
    if (!user.freeSpinUsed) {
      user.freeSpinUsed = true;
    } else if ((user.extraSpins || 0) > 0) {
      user.extraSpins -= 1;
      usedExtra = true;
    } else {
      socket.emit("errorMsg", { message: "No spins left today. Watch an ad for another?" });
      return;
    }
    let roll = Math.random() * SPIN_WEIGHT_TOTAL;
    let prize = SPIN_PRIZES[SPIN_PRIZES.length - 1];
    for (const p of SPIN_PRIZES) {
      roll -= p.weight;
      if (roll <= 0) {
        prize = p;
        break;
      }
    }
    applyPrize(user, prize);
    emitProfile(user);
    socket.emit("spinResult", { prize, usedExtra, extraSpins: user.extraSpins || 0, coins: user.coins });
  });

  socket.on("equipProp", ({ item } = {}) => {
    const user = getUser(socket);
    if (!user) return;
    if (item && !(user.collection?.props || []).some((p) => p.item === item)) return;
    user.heldProp = item || null;
    emitProfile(user);
    if (user.roomId) io.to(user.roomId).emit("userUpdated", snapshotPerson(user));
  });

  function petLabelFor(user, item) {
    const c = (user.collection?.pets || []).find((p) => p.item === item);
    return c?.label || item;
  }
  function emitRoomPets(room) {
    io.to(room.id).emit("roomPets", { pets: room.pets || [] });
  }
  function placeFollowerWhereStanding(user, room, item) {
    if (!room || !item) return;
    room.pets = room.pets || [];
    if (room.pets.some((p) => p.owner === user.username && p.item === item)) return;
    const size = roomSize(room);
    let x = Math.max(0, Math.min(size - 1, Math.round(Number(user.x) || 0)));
    let y = Math.max(0, Math.min(size - 1, Math.round(Number(user.y) || 0)));
    const taken = new Set(room.pets.map((p) => p.x + "," + p.y));
    if (taken.has(x + "," + y)) {
      const spots = [[1, 0], [0, 1], [-1, 0], [0, -1], [1, 1], [-1, 1], [1, -1], [-1, -1]];
      for (const [dx, dy] of spots) {
        const nx = x + dx, ny = y + dy;
        if (nx >= 0 && ny >= 0 && nx < size && ny < size && !taken.has(nx + "," + ny)) { x = nx; y = ny; break; }
      }
    }
    room.pets.push({
      id: "pet-" + Date.now() + "-" + Math.floor(Math.random() * 1000),
      item,
      label: petLabelFor(user, item),
      x, y,
      owner: user.username,
    });
  }
  function removeOwnedPetFromRoom(room, user, item, id) {
    if (!room) return false;
    const before = (room.pets || []).length;
    room.pets = (room.pets || []).filter((p) => {
      if (id && p.id === id && (!p.owner || p.owner === user.username)) return false;
      if (item && p.item === item && (!p.owner || p.owner === user.username)) return false;
      return true;
    });
    return room.pets.length !== before;
  }

  socket.on("equipPet", ({ item } = {}) => {
    const user = getUser(socket);
    if (!user) return;
    if (item && !(user.collection?.pets || []).some((p) => p.item === item)) return;
    const room = user.roomId ? rooms.get(user.roomId) : null;
    if (room) ensureRoomExtras(room);
    const prev = user.activePet;
    if (prev && prev !== item && room) {
      placeFollowerWhereStanding(user, room, prev);
    }
    if (item && room) removeOwnedPetFromRoom(room, user, item);
    user.activePet = item || null;
    emitProfile(user);
    if (user.roomId) io.to(user.roomId).emit("userUpdated", snapshotPerson(user));
    if (room) emitRoomPets(room);
  });

  socket.on("placePet", ({ item, x, y } = {}) => {
    const user = getUser(socket);
    if (!user?.roomId) return;
    if (!item || !(user.collection?.pets || []).some((p) => p.item === item)) return;
    const room = rooms.get(user.roomId);
    if (!room) return;
    ensureRoomExtras(room);
    const size = roomSize(room);
    const tx = Math.max(0, Math.min(size - 1, Math.round(Number(x) || 0)));
    const ty = Math.max(0, Math.min(size - 1, Math.round(Number(y) || 0)));
    if ((room.pets || []).some((p) => p.x === tx && p.y === ty && !(p.owner === user.username && p.item === item))) {
      socket.emit("errorMsg", { message: "A pal is already on that tile." });
      return;
    }
    removeOwnedPetFromRoom(room, user, item);
    if (user.activePet === item) user.activePet = null;
    room.pets.push({
      id: "pet-" + Date.now() + "-" + Math.floor(Math.random() * 1000),
      item,
      label: petLabelFor(user, item),
      x: tx, y: ty,
      owner: user.username,
    });
    emitProfile(user);
    if (user.roomId) io.to(user.roomId).emit("userUpdated", snapshotPerson(user));
    emitRoomPets(room);
  });

  socket.on("putAwayPet", ({ item, id } = {}) => {
    const user = getUser(socket);
    if (!user) return;
    const room = user.roomId ? rooms.get(user.roomId) : null;
    if (room) {
      ensureRoomExtras(room);
      removeOwnedPetFromRoom(room, user, item, id);
      emitRoomPets(room);
    }
    if (item && user.activePet === item) user.activePet = null;
    if (id && user.activePet) {
      const still = (room?.pets || []).some((p) => p.id === id);
      if (!still && !item) { /* id-only put away of a placed pet */ }
    }
    emitProfile(user);
    if (user.roomId) io.to(user.roomId).emit("userUpdated", snapshotPerson(user));
  });

  socket.on("equipClothes", ({ id } = {}) => {
    const user = getUser(socket);
    if (!user?.avatar) return;
    const item = (user.collection?.clothes || []).find((c) => c.id === id);
    if (!item) return;
    user.avatar = sanitizeAvatar({ ...user.avatar, ...(item.item || {}) });
    emitProfile(user);
    if (user.roomId) io.to(user.roomId).emit("userUpdated", snapshotPerson(user));
  });

  socket.on("buyStoreItem", ({ kind, id } = {}) => {
    const user = getUser(socket);
    if (!user) return;
    if (!user.collection) user.collection = { clothes: [], props: [], pets: [] };
    if (kind === "clothes") {
      const stock = clothingById(id);
      if (!stock) {
        socket.emit("errorMsg", { message: "That look isn't in stock." });
        return;
      }
      if ((user.collection.clothes || []).some((c) => c.catalogId === stock.id)) {
        socket.emit("errorMsg", { message: "You already own that." });
        return;
      }
      if (user.coins < stock.price) {
        socket.emit("errorMsg", { message: "Not enough coins." });
        return;
      }
      user.coins -= stock.price;
      const cid = "c" + Date.now() + Math.floor(Math.random() * 1000);
      user.collection.clothes.push({ id: cid, catalogId: stock.id, item: { ...stock.item }, label: stock.label });
      socket.emit("storeBought", { kind: "clothes", id: stock.id, collectionId: cid, coins: user.coins, collection: user.collection });
      emitProfile(user);
      return;
    }
    if (kind === "pets") {
      const stock = petById(id);
      if (!stock) {
        socket.emit("errorMsg", { message: "That pet isn't in stock." });
        return;
      }
      if ((user.collection.pets || []).some((p) => p.item === stock.item)) {
        socket.emit("errorMsg", { message: "You already have that pet." });
        return;
      }
      if (user.coins < stock.price) {
        socket.emit("errorMsg", { message: "Not enough coins." });
        return;
      }
      user.coins -= stock.price;
      user.collection.pets.push({ item: stock.item, label: stock.label });
      socket.emit("storeBought", { kind: "pets", id: stock.id, item: stock.item, coins: user.coins, collection: user.collection });
      emitProfile(user);
    }
  });


  socket.on("setLights", ({ on } = {}) => {
    const user = getUser(socket);
    if (!user?.roomId) return;
    const room = rooms.get(user.roomId);
    if (!room) return;
    ensureRoomExtras(room);
    room.lightsOn = Boolean(on);
    io.to(room.id).emit("lightsUpdated", { on: room.lightsOn });
  });

  socket.on("toggleTv", ({ id } = {}) => {
    const user = getUser(socket);
    if (!user?.roomId) return;
    const room = rooms.get(user.roomId);
    const furn = room?.furniture.find((f) => f.id === id && (f.type === "tv" || f.type === "holotv"));
    if (!furn) return;
    ensureRoomExtras(room);
    const cur = room.tvs[id] || { on: false, channel: 0 };
    const now = Date.now();
    if (!cur.on) {
      cur.on = true;
      cur.channel = 0;
    } else if ((cur.channel || 0) < 3) {
      cur.channel = (cur.channel || 0) + 1;
    } else {
      cur.on = false;
      cur.channel = 0;
    }
    cur.changedAt = now;
    room.tvs[id] = cur;
    io.to(room.id).emit("tvUpdated", { id, tv: cur, serverTime: now });
  });

  socket.on("selectRecordPlayer", ({ id, vinyl, stop } = {}) => {
    const user = getUser(socket);
    if (!user?.roomId) return;
    const room = rooms.get(user.roomId);
    const furn = room?.furniture.find((f) => f.id === id && f.type === "recordplayer");
    if (!furn) return;
    ensureRoomExtras(room);
    const now = Date.now();
    if (stop || !vinyl) {
      const cur = room.recordPlayers[id] || { on: false, vinyl: null };
      cur.on = false;
      cur.changedAt = now;
      room.recordPlayers[id] = cur;
      io.to(room.id).emit("recordPlayerUpdated", { id, player: cur, serverTime: now });
      return;
    }
    const allowed = ["neon-drift", "midnight-ramen", "rainy-rooftop", "cube-city-nights"];
    if (!allowed.includes(String(vinyl))) return;
    const cur = { on: true, vinyl: String(vinyl), startedAt: now, changedAt: now };
    room.recordPlayers[id] = cur;
    io.to(room.id).emit("recordPlayerUpdated", { id, player: cur, serverTime: now });
  });

  socket.on("standUp", () => {
    const user = getUser(socket);
    if (!user?.roomId) return;
    const room = rooms.get(user.roomId);
    clearUserActivities(user, room, { forfeit: true });
    user.sitting = false;
    emitPerson(user);
  });

  socket.on("sitFurniture", ({ id, seat } = {}) => {
    const user = getUser(socket);
    if (!user?.roomId) return;
    const room = rooms.get(user.roomId);
    const furn = room?.furniture.find((f) => f.id === id);
    if (!furn) return;
    ensureRoomExtras(room);
    if (seatCountOf(furn.type)) {
      trySit(user, room, furn, seat, socket);
      return;
    }
    if (furn.type === "chesstable") {
      let game = room.chess[id];
      if (!game) {
        game = { engine: new Chess(), seats: { 0: null, 1: null }, white: null, black: null, result: null, winner: null, lastMove: null, captured: { w: [], b: [] } };
        room.chess[id] = game;
      }
      const seatNum = seat === 1 ? 1 : 0;
      if (game.seats[seatNum] && game.seats[seatNum] !== user.username) {
        socket.emit("errorMsg", { message: "That stool is taken." });
        return;
      }
      // already sitting on the other stool
      if (game.seats[0] === user.username) game.seats[0] = null;
      if (game.seats[1] === user.username) game.seats[1] = null;
      clearUserActivities(user, room, { forfeit: false });
      game.seats[seatNum] = user.username;
      clearChessAway(game, user.username);
      if (game.white === user.username || game.black === user.username) {
        // returning player keeps their color
      } else if (!game.result) {
        const canWhite = !game.white && game.black !== user.username;
        const canBlack = !game.black && game.white !== user.username;
        if (seatNum === 1 && canBlack) game.black = user.username;
        else if (seatNum === 0 && canWhite) game.white = user.username;
        else if (canWhite) game.white = user.username;
        else if (canBlack) game.black = user.username;
      }
      user.stationId = id;
      user.sitting = true;
      const { w, h } = dimsOf(furn.type, furn.rot);
      // seat 0 toward +h, seat 1 toward -h relative to rotation
      const stools = seatWorld(furn, seatNum);
      user.x = stools.x;
      user.y = stools.y;
      user.facing = stools.facing;
      emitPerson(user);
      io.to(room.id).emit("userMoved", { username: user.username, x: user.x, y: user.y, sitting: true, facing: user.facing });
      emitRoom(room, "chessUpdated", { id, game: publicChess(game) });
    }
  });

  socket.on("chessMove", ({ id, from, to, promotion } = {}) => {
    const user = getUser(socket);
    if (!user?.roomId) return;
    const room = rooms.get(user.roomId);
    const game = room?.chess?.[id];
    if (!game || game.result) return;
    if (!game.engine) game.engine = new Chess(game.fen);
    const turn = game.engine.turn();
    const expected = turn === "w" ? game.white : game.black;
    if (expected !== user.username) {
      socket.emit("errorMsg", { message: "It's not your turn." });
      return;
    }
    const move = { from, to };
    if (promotion) move.promotion = String(promotion).slice(0, 1);
    else {
      // auto-queen if a pawn is promoting and no piece was chosen
      const legal = game.engine.moves({ square: from, verbose: true }).filter((m) => m.to === to);
      if (legal.length && legal.every((m) => m.promotion)) move.promotion = "q";
    }
    let result;
    try {
      result = game.engine.move(move);
    } catch {
      result = null;
    }
    if (!result) {
      socket.emit("errorMsg", { message: "That move isn't legal." });
      return;
    }
    game.lastMove = { from: result.from, to: result.to, san: result.san, promotion: result.promotion || null };
    game.captured = capturedFromHistory(game.engine);
    game.fen = game.engine.fen();
    if (game.engine.isCheckmate()) {
      game.result = "checkmate";
      game.winner = user.username;
    } else if (game.engine.isStalemate()) {
      game.result = "stalemate";
      game.winner = null;
    } else if (game.engine.isDraw()) {
      game.result = "draw";
      game.winner = null;
    }
    emitRoom(room, "chessUpdated", { id, game: publicChess(game) });
  });

  socket.on("chessResign", ({ id } = {}) => {
    const user = getUser(socket);
    if (!user?.roomId) return;
    const room = rooms.get(user.roomId);
    const game = room?.chess?.[id];
    if (!game || game.result) return;
    if (user.username !== game.white && user.username !== game.black) return;
    game.result = "resign";
    game.winner = user.username === game.white ? game.black : game.white;
    emitRoom(room, "chessUpdated", { id, game: publicChess(game) });
  });

  socket.on("chessRematch", ({ id } = {}) => {
    const user = getUser(socket);
    if (!user?.roomId) return;
    const room = rooms.get(user.roomId);
    const game = room?.chess?.[id];
    if (!game) return;
    if (user.username !== game.white && user.username !== game.black) return;
    const nw = game.black;
    const nb = game.white;
    game.engine = new Chess();
    game.fen = game.engine.fen();
    game.white = nw;
    game.black = nb;
    game.result = null;
    game.winner = null;
    game.lastMove = null;
    game.captured = { w: [], b: [] };
    emitRoom(room, "chessUpdated", { id, game: publicChess(game) });
  });

  socket.on("openFridge", ({ id } = {}) => {
    const user = getUser(socket);
    if (!user?.roomId) return;
    const room = rooms.get(user.roomId);
    const furn = room?.furniture.find((f) => f.id === id && f.type === "fridge");
    if (!furn) return;
    ensureRoomExtras(room);
    if (room.uses[id] && room.uses[id].user !== user.username) {
      socket.emit("errorMsg", { message: "Someone else is at the fridge." });
      return;
    }
    clearUserActivities(user, room, { forfeit: true });
    room.uses[id] = { type: "fridge", user: user.username, open: true };
    user.stationId = id;
    emitRoom(room, "useUpdated", { id, use: room.uses[id] });
    emitPerson(user);
  });

  socket.on("closeFridge", ({ id } = {}) => {
    const user = getUser(socket);
    if (!user?.roomId) return;
    const room = rooms.get(user.roomId);
    if (room?.uses?.[id]?.user === user.username) {
      delete room.uses[id];
      if (user.stationId === id) user.stationId = null;
      emitRoom(room, "useUpdated", { id, use: null });
      emitPerson(user);
    }
  });

  socket.on("fridgeTake", ({ id, item } = {}) => {
    const user = getUser(socket);
    if (!user?.roomId) return;
    const room = rooms.get(user.roomId);
    const furn = room?.furniture.find((f) => f.id === id && f.type === "fridge");
    if (!furn) return;
    const allowed = ["pizza", "soda", "chicken", "water", "sandwich"];
    if (!allowed.includes(item)) return;
    const kind = item === "sandwich" ? "pizza" : item;
    startHeldItem(user, kind);
    if (room?.uses?.[id]?.user === user.username) {
      delete room.uses[id];
      emitRoom(room, "useUpdated", { id, use: null });
    }
    if (user.stationId === id) user.stationId = null;
    emitPerson(user);
  });

  socket.on("stowItem", () => {
    const user = getUser(socket);
    if (!user) return;
    clearHeldTimer(user);
    user.heldItem = null;
    if (user.stowedProp) {
      user.heldProp = user.stowedProp;
      user.stowedProp = null;
    }
    emitPerson(user);
  });

  socket.on("usePunchbag", ({ id } = {}) => {
    const user = getUser(socket);
    if (!user?.roomId) return;
    const room = rooms.get(user.roomId);
    const furn = room?.furniture.find((f) => f.id === id && f.type === "punchbag");
    if (!furn) return;
    ensureRoomExtras(room);
    if (room.uses[id] && room.uses[id].user !== user.username) {
      socket.emit("errorMsg", { message: "That bag is taken." });
      return;
    }
    clearUserActivities(user, room, { forfeit: true });
    if (user.heldItem) {
      clearHeldTimer(user);
      user.heldItem = null;
    }
    if (user.heldProp) {
      user.stowedProp = user.heldProp;
      user.heldProp = null;
    }
    room.uses[id] = { type: "punchbag", user: user.username, combo: 0, move: null, lastHitAt: 0, auto: false };
    user.stationId = id;
    user.boxing = { bagId: id, move: null, combo: 0, auto: false, lastHitAt: 0 };
    emitRoom(room, "useUpdated", { id, use: room.uses[id] });
    emitPerson(user);
  });

  socket.on("boxHit", ({ id, move } = {}) => {
    const user = getUser(socket);
    if (!user?.roomId) return;
    const room = rooms.get(user.roomId);
    const use = room?.uses?.[id];
    if (!use || use.type !== "punchbag" || use.user !== user.username) return;
    const kind = ["jab", "hook", "uppercut"].includes(move) ? move : "jab";
    const now = Date.now();
    if (now - (use.lastHitAt || 0) < 180) return;
    if (now - (use.lastHitAt || 0) < 1400) use.combo = (use.combo || 0) + 1;
    else use.combo = 1;
    use.move = kind;
    use.lastHitAt = now;
    use.hit = now;
    use.swing = now;
    user.boxing = { bagId: id, move: kind, combo: use.combo, auto: Boolean(use.auto), lastHitAt: now };
    emitRoom(room, "useUpdated", { id, use });
    emitPerson(user);
  });

  socket.on("boxAuto", ({ id, on } = {}) => {
    const user = getUser(socket);
    if (!user?.roomId) return;
    const room = rooms.get(user.roomId);
    const use = room?.uses?.[id];
    if (!use || use.user !== user.username) return;
    use.auto = Boolean(on);
    if (user.boxing) user.boxing.auto = use.auto;
    emitRoom(room, "useUpdated", { id, use });
    emitPerson(user);
  });

  socket.on("boxStop", ({ id } = {}) => {
    const user = getUser(socket);
    if (!user?.roomId) return;
    const room = rooms.get(user.roomId);
    if (room?.uses?.[id]?.user === user.username) {
      delete room.uses[id];
      emitRoom(room, "useUpdated", { id, use: null });
    }
    user.boxing = null;
    if (user.stationId === id) user.stationId = null;
    if (user.stowedProp) {
      user.heldProp = user.stowedProp;
      user.stowedProp = null;
    }
    emitPerson(user);
  });

  socket.on("useGym", ({ id } = {}) => {
    const user = getUser(socket);
    if (!user?.roomId) return;
    const room = rooms.get(user.roomId);
    const furn = room?.furniture.find((f) => f.id === id && (f.type === "benchpress" || f.type === "treadmill"));
    if (!furn) return;
    ensureRoomExtras(room);
    if (room.uses[id] && room.uses[id].user !== user.username) {
      socket.emit("errorMsg", { message: "That machine is taken." });
      return;
    }
    clearUserActivities(user, room, { forfeit: true });
    room.uses[id] = { type: furn.type, user: user.username, reps: 0, startedAt: Date.now(), lastRepAt: 0 };
    user.stationId = id;
    user.gym = { id, type: furn.type, reps: 0, startedAt: Date.now(), lastRepAt: 0 };
    if (furn.type === "benchpress") user.sitting = true;
    emitRoom(room, "useUpdated", { id, use: room.uses[id] });
    emitPerson(user);
  });

  socket.on("gymRep", ({ id } = {}) => {
    const user = getUser(socket);
    if (!user?.roomId) return;
    const room = rooms.get(user.roomId);
    const use = room?.uses?.[id];
    if (!use || use.user !== user.username) return;
    const now = Date.now();
    if (now - (use.lastRepAt || 0) < 400) return;
    use.reps = (use.reps || 0) + 1;
    use.lastRepAt = now;
    user.gym = { ...(user.gym || {}), reps: use.reps, lastRepAt: now };
    emitRoom(room, "useUpdated", { id, use });
    emitPerson(user);
  });

  socket.on("gymStop", ({ id } = {}) => {
    const user = getUser(socket);
    if (!user?.roomId) return;
    const room = rooms.get(user.roomId);
    if (room?.uses?.[id]?.user === user.username) {
      delete room.uses[id];
      emitRoom(room, "useUpdated", { id, use: null });
    }
    user.gym = null;
    user.sitting = false;
    if (user.stationId === id) user.stationId = null;
    emitPerson(user);
  });


  socket.on("placeWallArt", ({ type, wall, slot } = {}) => {
    const user = getUser(socket);
    const room = requireOwner(socket, user);
    if (!room) return;
    ensureRoomExtras(room);
    if (!isWallArt(type)) return;
    const idx = user.inventory.indexOf(type);
    if (idx === -1) {
      socket.emit("errorMsg", { message: "Buy that item first." });
      return;
    }
    const s = Math.round(Number(slot));
    if (!canPlaceWallOn(room, type, wall, s)) {
      socket.emit("errorMsg", { message: "That wall space is taken or blocked." });
      return;
    }
    user.inventory.splice(idx, 1);
    const piece = { id: "w" + furnSeq++, type, wall, slot: s };
    room.wallArt.push(piece);
    emitProfile(user);
    emitRoom(room, "wallArtPlaced", piece);
  });

  socket.on("moveWallArt", ({ id, wall, slot } = {}) => {
    const user = getUser(socket);
    const room = requireOwner(socket, user);
    if (!room) return;
    ensureRoomExtras(room);
    const piece = room.wallArt.find((a) => a.id === id);
    if (!piece) return;
    const s = Math.round(Number(slot));
    if (!canPlaceWallOn(room, piece.type, wall, s, piece.id)) {
      socket.emit("errorMsg", { message: "That wall space is taken or blocked." });
      return;
    }
    piece.wall = wall;
    piece.slot = s;
    emitRoom(room, "wallArtUpdated", piece);
  });

  socket.on("pickupWallArt", ({ id } = {}) => {
    const user = getUser(socket);
    const room = requireOwner(socket, user);
    if (!room) return;
    ensureRoomExtras(room);
    const idx = room.wallArt.findIndex((a) => a.id === id);
    if (idx === -1) return;
    const piece = room.wallArt[idx];
    room.wallArt.splice(idx, 1);
    user.inventory.push(piece.type);
    emitProfile(user);
    emitRoom(room, "wallArtRemoved", { id, type: piece.type });
  });

  socket.on("useCoffee", ({ id } = {}) => {
    const user = getUser(socket);
    if (!user?.roomId) return;
    const room = rooms.get(user.roomId);
    const furn = room?.furniture.find((f) => f.id === id && f.type === "coffeemachine");
    if (!furn) return;
    ensureRoomExtras(room);
    if (room.uses[id] && room.uses[id].user !== user.username) {
      socket.emit("errorMsg", { message: "The coffee machine is busy." });
      return;
    }
    if (room.uses[id] && room.uses[id].user === user.username) return;
    clearUserActivities(user, room, { forfeit: true });
    clearBrewTimer(user);
    room.uses[id] = { type: "coffeemachine", user: user.username, phase: "brew", startedAt: Date.now() };
    user.stationId = id;
    emitRoom(room, "useUpdated", { id, use: room.uses[id] });
    emitPerson(user);
    user._brewTimer = setTimeout(() => {
      user._brewTimer = null;
      if (room.uses[id]?.user === user.username) {
        delete room.uses[id];
        emitRoom(room, "useUpdated", { id, use: null });
      }
      if (user.stationId === id) user.stationId = null;
      startHeldItem(user, "coffee");
      emitPerson(user);
    }, 3000);
  });

  socket.on("useWardrobe", ({ id } = {}) => {
    const user = getUser(socket);
    if (!user?.roomId) return;
    const room = rooms.get(user.roomId);
    const furn = room?.furniture.find((f) => f.id === id && f.type === "clothescab");
    if (!furn) return;
    socket.emit("wardrobeOpen", { id });
  });

  socket.on("cubicsStart", ({ id } = {}) => {
    const user = getUser(socket);
    if (!user?.roomId) return;
    const room = rooms.get(user.roomId);
    const furn = room?.furniture.find((f) => f.id === id && f.type === "cubics");
    if (!furn) return;
    ensureRoomExtras(room);
    if (!room.arcade[id]) room.arcade[id] = { user: null, state: null, scores: [] };
    if (room.arcade[id].user && room.arcade[id].user !== user.username) {
      socket.emit("errorMsg", { message: "Someone is already playing." });
      return;
    }
    clearUserActivities(user, room, { forfeit: true });
    room.arcade[id].user = user.username;
    room.arcade[id].state = { score: 0, over: false };
    user.stationId = id;
    emitRoom(room, "arcadeUpdated", { id, arcade: publicArcade(room)[id] });
    emitPerson(user);
  });

  socket.on("cubicsState", ({ id, state } = {}) => {
    const user = getUser(socket);
    if (!user?.roomId) return;
    const room = rooms.get(user.roomId);
    const cab = room?.arcade?.[id];
    if (!cab || cab.user !== user.username) return;
    cab.state = state || null;
    emitRoom(room, "arcadeUpdated", { id, arcade: publicArcade(room)[id] });
  });

  socket.on("cubicsEnd", ({ id, score } = {}) => {
    const user = getUser(socket);
    if (!user?.roomId) return;
    const room = rooms.get(user.roomId);
    const cab = room?.arcade?.[id];
    if (!cab || cab.user !== user.username) return;
    const s = Math.max(0, Math.min(999999, Math.round(Number(score) || 0)));
    cab.scores = cab.scores || [];
    cab.scores.push({ name: user.username, score: s, at: Date.now() });
    cab.scores.sort((a, b) => b.score - a.score || a.at - b.at);
    cab.scores = cab.scores.slice(0, 5);
    cab.user = null;
    cab.state = { ...(cab.state || {}), over: true, score: s };
    if (user.stationId === id) user.stationId = null;
    emitRoom(room, "arcadeUpdated", { id, arcade: publicArcade(room)[id] });
    emitPerson(user);
  });

  socket.on("debugKit", (kit = {}) => {
    const user = getUser(socket);
    if (!user) return;
    if (typeof kit.coins === "number") user.coins = Math.max(0, Math.round(kit.coins));
    const grantPet = (name, follow) => {
      if (!name) return;
      user.collection = user.collection || emptyCollection();
      if (!user.collection.pets.some((p) => p.item === name)) {
        user.collection.pets.push({ id: "debug-" + name, item: name, label: name[0].toUpperCase() + name.slice(1) });
      }
      if (follow) user.activePet = name;
    };
    if (Array.isArray(kit.pets)) kit.pets.forEach((name, i) => grantPet(name, i === 0 && !kit.pet));
    if (kit.pet) grantPet(kit.pet, true);
    if (Array.isArray(kit.furniture)) {
      for (const typ of kit.furniture) {
        if (FURNITURE_CATALOG[typ]) user.inventory.push(typ);
      }
    }
    if (kit.chessFen && kit.chessId && user.roomId) {
      const room = rooms.get(user.roomId);
      const game = room?.chess?.[kit.chessId];
      if (game) {
        try {
          game.engine = new Chess(String(kit.chessFen));
          game.fen = game.engine.fen();
          game.result = null;
          game.winner = null;
          game.lastMove = null;
          game.captured = { w: [], b: [] };
          emitRoom(room, "chessUpdated", { id: kit.chessId, game: publicChess(game) });
        } catch (err) {
          socket.emit("errorMsg", { message: "Invalid debug FEN." });
        }
      }
    }
    emitProfile(user);
    emitPerson(user);
  });

  socket.on("disconnect", () => {
    const user = getUser(socket);
    if (!user || user.socketId !== socket.id) return;
    const room = user.roomId ? rooms.get(user.roomId) : null;
    const playing = room ? findActiveChess(room, user.username) : null;
    if (playing) {
      user.socketId = null;
      armChessReconnect(room, playing.id, user.username);
      notifyFriendWatchers(user);
      return;
    }
    leaveRoom(user);
    user.socketId = null;
    notifyFriendWatchers(user);
  });
});

ensurePublicPlaces();
httpServer.listen(PORT, "0.0.0.0", () => {
  console.log(`MyCube listening on http://localhost:${PORT}`);
});
