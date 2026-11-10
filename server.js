import express from "express";
import { createServer } from "http";
import { Server } from "socket.io";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT) || 3000;

const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer);

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
};
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

function tilesFor(type, x, y) {
  const item = FURNITURE_CATALOG[type];
  if (!item) return [];
  const out = [];
  for (let dy = 0; dy < item.h; dy++) {
    for (let dx = 0; dx < item.w; dx++) out.push({ x: x + dx, y: y + dy });
  }
  return out;
}

function blockedSet(room) {
  const set = new Set();
  for (const f of room.furniture) {
    const item = FURNITURE_CATALOG[f.type];
    if (!item?.blocks) continue;
    for (const t of tilesFor(f.type, f.x, f.y)) set.add(`${t.x},${t.y}`);
  }
  return set;
}

function occupiedSet(room) {
  const set = new Set();
  for (const f of room.furniture) {
    for (const t of tilesFor(f.type, f.x, f.y)) set.add(`${t.x},${t.y}`);
  }
  return set;
}

function canPlaceOn(room, type, x, y) {
  const item = FURNITURE_CATALOG[type];
  if (!item) return false;
  const tiles = tilesFor(type, x, y);
  if (!tiles.length || tiles.some((t) => !inBounds(t.x, t.y, roomSize(room)))) return false;
  const used = occupiedSet(room);
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

const SKINS = ["#ffdfc4", "#f1c27d", "#e0ac69", "#c68642", "#8d5524", "#5c3317"];
const HAIR_STYLES = ["short", "long", "curly", "bun", "spiky", "bangs"];
const HAIR_COLORS = ["#2b1d16", "#6b3a2a", "#d4a017", "#f3e5c2", "#c0392b", "#4a90d9", "#7b4f9c", "#222222"];
const SHIRTS = ["#ff7a59", "#7bc47f", "#6c7bff", "#f4c15d", "#ef476f", "#20b2aa", "#ff8fab", "#5c4d7d"];
const TOPS = ["tshirt", "hoodie", "jacket"];
const BOTTOMS = ["jeans", "joggers"];
const BOTTOM_COLORS = ["#3d4f7c", "#2a2a2e", "#6b7280", "#c4a35a"];
const SHOES = ["white", "black", "red", "gum"];
const ACCESSORIES = ["none", "cap", "beanie", "chain", "headphones"];
const HEADPHONE_COLORS = ["#2a2a2e", "#ff7a59", "#7c5cff", "#f4c15d", "#ef476f", "#20b2aa", "#f6f3ee", "#3d4f7c"];
const PROPS = ["guitar", "skateboard", "coffee"];
const PETS = ["cat", "dog", "bunny"];

const users = new Map();
const rooms = new Map();
let roomSeq = 1;
let furnSeq = 1;

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
  }));
}

function snapshotPerson(u) {
  return {
    username: u.username,
    avatar: u.avatar,
    x: u.x,
    y: u.y,
    sitting: u.sitting,
    emote: u.emote,
    heldProp: u.heldProp || null,
    activePet: u.activePet || null,
  };
}

function roomState(room) {
  return {
    id: room.id,
    name: room.name,
    owner: room.owner,
    locked: room.locked,
    hasPassword: Boolean(room.password),
    furniture: room.furniture,
    wallpaper: room.wallpaper,
    floorStyle: room.floorStyle,
    grid: roomSize(room),
    size: roomSize(room),
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

function emitProfile(user) {
  if (user.socketId) io.to(user.socketId).emit("profile", publicUser(user));
}

function leaveRoom(user) {
  if (!user?.roomId) return;
  const prevId = user.roomId;
  const room = rooms.get(prevId);
  user.roomId = null;
  user.sitting = false;
  user.emote = null;
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
  if (room.owner.toLowerCase() === user.username.toLowerCase()) return { ok: true };
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
    if (!user) {
      user = {
        username,
        avatar: null,
        coins: START_COINS,
        inventory: [],
        friends: [],
        socketId: socket.id,
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
      users.set(key, user);
    } else {
      user.socketId = socket.id;
    }
    if (!user.collection) user.collection = emptyCollection();
    socket.data.userKey = key;
    ensureDay(user);
    let daily = 0;
    if (user.lastLoginBonusOn !== todayStamp()) {
      user.lastLoginBonusOn = todayStamp();
      user.coins += DAILY_LOGIN_BONUS;
      daily = DAILY_LOGIN_BONUS;
    }
    socket.emit("loggedIn", { user: publicUser(user), rooms: publicRooms() });
    if (daily) socket.emit("coinsEarned", { amount: daily, reason: "daily", coins: user.coins });
    notifyFriendWatchers(user);
  });

  socket.on("updateAvatar", (raw) => {
    const user = getUser(socket);
    if (!user) return;
    user.avatar = sanitizeAvatar(raw);
    if (!user.avatar.displayName) user.avatar.displayName = user.username;
    emitProfile(user);
    if (user.roomId) {
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

  socket.on("move", ({ x, y } = {}) => {
    const user = getUser(socket);
    if (!user?.roomId) return;
    const room = rooms.get(user.roomId);
    const tx = Math.round(Number(x));
    const ty = Math.round(Number(y));
    if (!room || !inBounds(tx, ty, roomSize(room))) return;
    if (blockedSet(room).has(`${tx},${ty}`)) return;
    user.x = tx;
    user.y = ty;
    user.sitting = false;
    io.to(user.roomId).emit("userMoved", {
      username: user.username,
      x: user.x,
      y: user.y,
      sitting: false,
    });
  });

  socket.on("sit", ({ furnitureId } = {}) => {
    const user = getUser(socket);
    if (!user?.roomId) return;
    const room = rooms.get(user.roomId);
    const furn = room?.furniture.find((f) => f.id === furnitureId && f.type === "couch");
    if (!furn) return;
    user.x = furn.x;
    user.y = furn.y;
    user.sitting = true;
    io.to(user.roomId).emit("userMoved", {
      username: user.username,
      x: user.x,
      y: user.y,
      sitting: true,
    });
  });

  socket.on("say", ({ text } = {}) => {
    const user = getUser(socket);
    if (!user?.roomId) return;
    text = String(text || "").replace(/\s+/g, " ").trim().slice(0, 80);
    if (!text) return;
    io.to(user.roomId).emit("userSaid", {
      username: user.username,
      text,
      at: Date.now(),
    });
  });

  socket.on("emote", ({ type } = {}) => {
    const user = getUser(socket);
    if (!user?.roomId) return;
    if (type !== "eat" && type !== "drink") return;
    user.emote = type;
    io.to(user.roomId).emit("userEmote", { username: user.username, type });
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
    if (!room || room.owner.toLowerCase() !== user.username.toLowerCase()) {
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

  socket.on("placeFurniture", ({ type, x, y } = {}) => {
    const user = getUser(socket);
    if (!user?.roomId) return;
    const room = rooms.get(user.roomId);
    if (!room || room.owner.toLowerCase() !== user.username.toLowerCase()) {
      socket.emit("errorMsg", { message: "Only the room owner can place furniture." });
      return;
    }
    const idx = user.inventory.indexOf(type);
    if (idx === -1) {
      socket.emit("errorMsg", { message: "Buy that item first." });
      return;
    }
    if (!FURNITURE_CATALOG[type]) return;
    const tx = Math.round(Number(x));
    const ty = Math.round(Number(y));
    if (!canPlaceOn(room, type, tx, ty)) {
      socket.emit("errorMsg", { message: "That doesn't fit on those tiles." });
      return;
    }
    user.inventory.splice(idx, 1);
    const piece = { id: "f" + furnSeq++, type, x: tx, y: ty };
    room.furniture.push(piece);
    emitProfile(user);
    io.to(room.id).emit("furniturePlaced", piece);
  });

  socket.on("upgradeCube", () => {
    const user = getUser(socket);
    if (!user?.roomId) return;
    const room = rooms.get(user.roomId);
    if (!room || room.owner.toLowerCase() !== user.username.toLowerCase()) {
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

  socket.on("setRoomStyle", ({ wallpaper, floorStyle } = {}) => {
    const user = getUser(socket);
    if (!user?.roomId) return;
    const room = rooms.get(user.roomId);
    if (!room || room.owner.toLowerCase() !== user.username.toLowerCase()) return;
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

  socket.on("equipPet", ({ item } = {}) => {
    const user = getUser(socket);
    if (!user) return;
    if (item && !(user.collection?.pets || []).some((p) => p.item === item)) return;
    user.activePet = item || null;
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

  socket.on("disconnect", () => {
    const user = getUser(socket);
    if (!user || user.socketId !== socket.id) return;
    leaveRoom(user);
    user.socketId = null;
    notifyFriendWatchers(user);
  });
});

httpServer.listen(PORT, "0.0.0.0", () => {
  console.log(`MyCube listening on http://localhost:${PORT}`);
});
