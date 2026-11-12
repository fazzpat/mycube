/* Shared clothing/pet store catalogs and avatar option extensions. */

export const HAIR_STYLES = [
  "short", "long", "curly", "bun", "spiky", "bangs", "undercut",
  "frosted", "buzz", "swoop", "cornrows", "shaggy",
  "ponytail", "spacebuns", "straightbangs", "afropuff", "bobclips",
];
export const HAIR_LABELS = {
  short: "Short", long: "Long", curly: "Curly", bun: "Bun", spiky: "Spiky", bangs: "Bangs", undercut: "Undercut",
  frosted: "Frosted tips", buzz: "Buzz cut", swoop: "Swoop emo", cornrows: "Slick back", slickback: "Slick back", shaggy: "Shaggy skater",
  ponytail: "Pigtails", pigtails: "Pigtails", spacebuns: "Space buns", straightbangs: "Straight bangs", afropuff: "Afro puff", bobclips: "Curly", curls: "Curly", ringlets: "Curly",
};
export const HAIR_COLORS = [
  "#2b1d16", "#6b3a2a", "#d4a017", "#f3e5c2", "#c0392b", "#4a90d9", "#7b4f9c", "#222222",
  "#ff8fab", "#20b2aa",
];
export const SKINS = ["#ffdfc4", "#f1c27d", "#e0ac69", "#c68642", "#8d5524", "#5c3317"];
export const SHIRTS = [
  "#ff7a59", "#7bc47f", "#6c7bff", "#f4c15d", "#ef476f", "#20b2aa", "#ff8fab", "#5c4d7d",
  "#2a2a2e", "#1a1a22", "#3d5aa0", "#2a2a32", "#8a5ad4", "#c43a3a", "#2a3a7a", "#6a8a3a",
  "#f4efe6", "#c4a0e8",
];
export const TOPS = [
  "tshirt", "hoodie", "jacket", "bandtee",
  "ziphoodie", "oversized", "velour", "varsity", "truckertee", "puffer", "polo", "babytee", "crophoodie", "jersey",
];
export const TOP_LABELS = {
  tshirt: "Tee", hoodie: "Hoodie", jacket: "Jacket", bandtee: "Band tee",
  ziphoodie: "Zip hoodie", oversized: "Oversized tee", velour: "Velour jacket", varsity: "Varsity",
  truckertee: "Trucker tee", puffer: "Puffer vest", polo: "Polo", babytee: "Baby tee",
  crophoodie: "Crop hoodie", jersey: "Jersey",
};
export const BOTTOMS = ["jeans", "joggers", "cargo", "shorts", "baggy", "track", "skirt", "flares"];
export const BOTTOM_LABELS = {
  jeans: "Jeans", joggers: "Joggers", cargo: "Cargos", shorts: "Shorts",
  baggy: "Baggy jeans", track: "Track pants", skirt: "Denim skirt", flares: "Flares",
};
export const BOTTOM_COLORS = ["#3d4f7c", "#2a2a2e", "#6b7280", "#c4a35a", "#3a8a5a", "#2a3a7a", "#3d5a8a", "#5a6a8a", "#1a1a22"];
export const SHOES = ["white", "black", "red", "gum", "skate", "hightop", "boots", "checker"];
export const ACCESSORIES = ["none", "cap", "beanie", "chain", "headphones", "trucker", "wristband", "belt", "bucket", "fitted", "shades"];
export const ACC_LABELS = {
  none: "None", cap: "Cap", beanie: "Beanie", chain: "Chain", headphones: "Headphones",
  trucker: "Trucker hat", wristband: "Wristbands", belt: "Belt", bucket: "Bucket hat", fitted: "Fitted cap", shades: "Tinted shades",
};
export const HEADPHONE_COLORS = [
  "#2a2a2e", "#ff7a59", "#7c5cff", "#f4c15d", "#ef476f", "#20b2aa", "#f6f3ee", "#3d4f7c",
  "#f4c15d", "#6a8a3a", "#c43a3a",
];
export const PETS = ["cat", "dog", "bunny", "fox", "hamster", "parrot", "turtle", "flame"];

export const BASE_TOPS = ["tshirt", "hoodie", "jacket"];
export const BASE_BOTTOMS = ["jeans", "joggers"];
export const BASE_SHOES = ["white", "black", "red", "gum"];
export const BASE_ACCESSORIES = ["none", "cap", "beanie", "chain", "headphones"];
export const BASE_HAIR = ["short", "long", "curly", "bun", "spiky", "bangs"];

export const HAT_ACCESSORIES = new Set(["cap", "beanie", "trucker", "bucket", "fitted"]);
export const HATS = ["none", "cap", "beanie", "trucker", "bucket", "fitted", "crown", "wizard"];
export const HAT_LABELS = { none: "No hat", cap: "Cap", beanie: "Beanie", trucker: "Trucker hat", bucket: "Bucket hat", fitted: "Fitted cap", crown: "Crown", wizard: "Wizard Hat" };
export const GLASSES_STYLES = ["none", "round", "square", "shades"];
export const GLASSES_LABELS = { none: "No glasses", round: "Round glasses", square: "Square glasses", shades: "Shades" };
export const GLASSES_COLORS = ["#2a2422", "#6b3a2a", "#d4b46a", "#c0c4c8", "#ef476f", "#4a90d9", "#1a1a22"];
export const NECKLACES = ["none", "chain", "diamond"];
export const NECKLACE_LABELS = { none: "No necklace", chain: "Gold chain", diamond: "Diamond necklace" };
export const SHOE_COLORS = ["#f4efe6", "#2a2624", "#c43632", "#e8d4b0", "#3a5a8a", "#c4a056", "#1a1a1a", "#3d4f7c"];
export const HAT_COLORS = ["#2a2a2e", "#ff7a59", "#7c5cff", "#f4c15d", "#ef476f", "#20b2aa", "#f6f3ee", "#3d4f7c", "#6a8a3a", "#c43a3a"];

export function migrateAvatar(raw = {}) {
  const a = { ...raw };
  const hats = HAT_ACCESSORIES;
  if (!a.hat || a.hat === "") a.hat = hats.has(a.accessory) ? a.accessory : "none";
  if (!a.hatColor) a.hatColor = a.headphoneColor || "#2a2a2e";
  if (!a.glassesStyle) {
    if (typeof a.glasses === "string" && a.glasses !== "true" && a.glasses !== "false") a.glassesStyle = a.glasses;
    else if (a.accessory === "shades") a.glassesStyle = "shades";
    else a.glassesStyle = a.glasses ? "round" : "none";
  }
  if (!a.glassesColor) a.glassesColor = a.glassesStyle === "shades" ? "#2a1c30" : "#2a2422";
  if (!a.necklace) a.necklace = a.accessory === "chain" ? "chain" : "none";
  a.glasses = a.glassesStyle && a.glassesStyle !== "none";
  if (!a.headphoneColor) a.headphoneColor = a.hatColor;
  return a;
}

export const STORE_LOCKED = {
  top: new Set(["bandtee", "ziphoodie", "oversized", "velour", "varsity", "truckertee", "puffer", "polo", "babytee", "crophoodie", "jersey"]),
  bottom: new Set(["cargo", "shorts", "baggy", "track", "skirt", "flares"]),
  shoes: new Set(["skate", "hightop", "boots", "checker"]),
  accessory: new Set(["trucker", "wristband", "belt", "bucket", "fitted", "shades"]),
  hat: new Set(["trucker", "bucket", "fitted", "wizard"]),
  hair: new Set(["undercut"]),
};

export const CLOTHING_SLOTS = ["tops", "bottoms", "hats", "accessories", "shoes"];

export function clothingSlot(stock) {
  if (stock?.slot) return stock.slot;
  const item = stock?.item || stock || {};
  if (item.shoes) return "shoes";
  if (item.bottom) return "bottoms";
  if (item.hair) return "hair";
  if (item.accessory && HAT_ACCESSORIES.has(item.accessory)) return "hats";
  if (item.accessory || item.glasses) return "accessories";
  return "tops";
}

export const CLOTHING_STOCK = [
  { id: "nt-tee", slot: "tops", label: "Cube Tee", price: 8, item: { top: "tshirt", shirt: "#20b2aa" } },
  { id: "nt-band-star", slot: "tops", label: "Starry Band Tee", price: 12, item: { top: "bandtee", shirt: "#1a1a22" } },
  { id: "nt-band-cube", slot: "tops", label: "Cube Fest Tee", price: 12, item: { top: "bandtee", shirt: "#6c7bff" } },
  { id: "nt-band-emo", slot: "tops", label: "Emo Star Tee", price: 12, item: { top: "bandtee", shirt: "#2a2a2e" } },
  { id: "nt-hoodie", slot: "tops", label: "Skate Hoodie", price: 14, item: { top: "hoodie", shirt: "#6c7bff" } },
  { id: "nt-hoodie-blk", slot: "tops", label: "Black Zip Hoodie", price: 16, item: { top: "ziphoodie", shirt: "#2a2a2e" } },
  { id: "nt-zip-red", slot: "tops", label: "Red Zip Hoodie", price: 16, item: { top: "ziphoodie", shirt: "#ef476f" } },
  { id: "nt-zip-navy", slot: "tops", label: "Navy Zip Hoodie", price: 16, item: { top: "ziphoodie", shirt: "#3d5aa0" } },
  { id: "nt-og-tee", slot: "tops", label: "Oversized Graphic", price: 12, item: { top: "oversized", shirt: "#ff7a59" } },
  { id: "nt-og-tee-blk", slot: "tops", label: "Oversized Black Tee", price: 12, item: { top: "oversized", shirt: "#2a2a32" } },
  { id: "nt-velour-pink", slot: "tops", label: "Pink Velour Jacket", price: 20, item: { top: "velour", shirt: "#ff8fab" } },
  { id: "nt-velour-purp", slot: "tops", label: "Purple Velour Jacket", price: 20, item: { top: "velour", shirt: "#8a5ad4" } },
  { id: "nt-varsity", slot: "tops", label: "Varsity Jacket", price: 22, item: { top: "varsity", shirt: "#c43a3a" } },
  { id: "nt-varsity-navy", slot: "tops", label: "Navy Varsity", price: 22, item: { top: "varsity", shirt: "#2a3a7a" } },
  { id: "nt-trucker-tee", slot: "tops", label: "Trucker Tee", price: 10, item: { top: "truckertee", shirt: "#f4c15d" } },
  { id: "nt-puffer", slot: "tops", label: "Pink Puffer Vest", price: 18, item: { top: "puffer", shirt: "#ef476f" } },
  { id: "nt-puffer-olive", slot: "tops", label: "Olive Puffer Vest", price: 18, item: { top: "puffer", shirt: "#6a8a3a" } },
  { id: "nt-polo", slot: "tops", label: "Popped Polo", price: 14, item: { top: "polo", shirt: "#20b2aa" } },
  { id: "nt-polo-wht", slot: "tops", label: "White Polo", price: 14, item: { top: "polo", shirt: "#f4efe6" } },
  { id: "nt-baby", slot: "tops", label: "Baby Tee", price: 10, item: { top: "babytee", shirt: "#ff8fab" } },
  { id: "nt-baby-lil", slot: "tops", label: "Lilac Baby Tee", price: 10, item: { top: "babytee", shirt: "#c4a0e8" } },
  { id: "nt-crop", slot: "tops", label: "Crop Hoodie", price: 16, item: { top: "crophoodie", shirt: "#6c7bff" } },
  { id: "nt-crop-hot", slot: "tops", label: "Hot Crop Hoodie", price: 16, item: { top: "crophoodie", shirt: "#ef476f" } },
  { id: "nt-jersey", slot: "tops", label: "Cube Jersey", price: 18, item: { top: "jersey", shirt: "#c43a3a" } },
  { id: "nt-jersey-teal", slot: "tops", label: "Teal Jersey", price: 18, item: { top: "jersey", shirt: "#20b2aa" } },
  { id: "nt-street-j", slot: "tops", label: "Classic Street Jacket", price: 15, item: { top: "jacket", shirt: "#5c4d7d" } },
  { id: "nt-wind", slot: "tops", label: "Windbreaker", price: 18, item: { top: "jacket", shirt: "#ef476f" } },
  { id: "nt-cargo", slot: "bottoms", label: "Cargo Pants", price: 16, item: { bottom: "cargo", bottomColor: "#6b7280" } },
  { id: "nt-shorts", slot: "bottoms", label: "Cargo Shorts", price: 14, item: { bottom: "shorts", bottomColor: "#c4a35a" } },
  { id: "nt-baggy", slot: "bottoms", label: "Baggy Jeans", price: 16, item: { bottom: "baggy", bottomColor: "#2a2a2e" } },
  { id: "nt-baggy-blue", slot: "bottoms", label: "Blue Baggy Jeans", price: 16, item: { bottom: "baggy", bottomColor: "#3d4f7c" } },
  { id: "nt-track", slot: "bottoms", label: "Track Pants", price: 16, item: { bottom: "track", bottomColor: "#3a8a5a" } },
  { id: "nt-track-navy", slot: "bottoms", label: "Navy Track Pants", price: 16, item: { bottom: "track", bottomColor: "#2a3a7a" } },
  { id: "nt-skirt", slot: "bottoms", label: "Denim Skirt", price: 14, item: { bottom: "skirt", bottomColor: "#3d5a8a" } },
  { id: "nt-skirt-blk", slot: "bottoms", label: "Black Skirt", price: 14, item: { bottom: "skirt", bottomColor: "#1a1a22" } },
  { id: "nt-flares", slot: "bottoms", label: "Low-Rise Flares", price: 16, item: { bottom: "flares", bottomColor: "#3d4f7c" } },
  { id: "nt-flares-wash", slot: "bottoms", label: "Washed Flares", price: 16, item: { bottom: "flares", bottomColor: "#5a6a8a" } },
  { id: "nt-skate", slot: "shoes", label: "Skate Shoes", price: 18, item: { shoes: "skate" } },
  { id: "nt-hightop", slot: "shoes", label: "High-Tops", price: 20, item: { shoes: "hightop" } },
  { id: "nt-boots", slot: "shoes", label: "Work Boots", price: 22, item: { shoes: "boots" } },
  { id: "nt-checker", slot: "shoes", label: "Checker Slips", price: 16, item: { shoes: "checker" } },
  { id: "nt-trucker", slot: "hats", label: "Trucker Hat", price: 10, item: { accessory: "trucker" } },
  { id: "nt-beanie", slot: "hats", label: "Slouch Beanie", price: 10, item: { accessory: "beanie", headphoneColor: "#2a2a2e" } },
  { id: "nt-bucket", slot: "hats", label: "Bucket Hat", price: 12, item: { accessory: "bucket", headphoneColor: "#6a8a3a" } },
  { id: "nt-bucket-yel", slot: "hats", label: "Yellow Bucket", price: 12, item: { accessory: "bucket", headphoneColor: "#f4c15d" } },
  { id: "nt-fitted", slot: "hats", label: "Fitted Cap", price: 12, item: { accessory: "fitted", headphoneColor: "#2a2a2e" } },
  { id: "nt-fitted-red", slot: "hats", label: "Red Fitted", price: 12, item: { accessory: "fitted", headphoneColor: "#c43a3a" } },
  { id: "nt-wrist", slot: "accessories", label: "Wristband", price: 8, item: { accessory: "wristband" } },
  { id: "nt-wrist-red", slot: "accessories", label: "Red Wristbands", price: 8, item: { accessory: "wristband", headphoneColor: "#ef476f" } },
  { id: "nt-belt", slot: "accessories", label: "Studded Belt", price: 12, item: { accessory: "belt" } },
  { id: "nt-shades", slot: "accessories", label: "Sunglasses", price: 12, item: { glasses: true } },
  { id: "nt-shades-tint", slot: "accessories", label: "Tinted Shades", price: 14, item: { accessory: "shades", glasses: true } },
  { id: "nt-undercut", slot: "hair", label: "Undercut", price: 10, item: { hair: "undercut", hairColor: "#222222" } },
];

export const PET_STOCK = [
  { id: "bp-cat", item: "cat", label: "House Cat", price: 25 },
  { id: "bp-dog", item: "dog", label: "Puppy", price: 25 },
  { id: "bp-bunny", item: "bunny", label: "Bunny", price: 22 },
  { id: "bp-fox", item: "fox", label: "Fox", price: 30 },
  { id: "bp-hamster", item: "hamster", label: "Hamster", price: 20 },
  { id: "bp-parrot", item: "parrot", label: "Parrot", price: 32 },
  { id: "bp-turtle", item: "turtle", label: "Turtle", price: 28 },
];

export const PUBLIC_PLACES = []

export const NEW_FURNITURE = [
  { type: "hoverchair", name: "Egg Chair", price: 30 },
  { type: "djdeck", name: "DJ Deck", price: 40 },
  { type: "sodavending", name: "Cube Cola Vendor", price: 28 },
  { type: "neonsign", name: "Lava Lamp", price: 22 },
  { type: "capsulecouch", name: "Studio Couch", price: 36 },
  { type: "podplant", name: "Potted Plant", price: 16 },
  { type: "holotv", name: "TV", price: 32 },
  { type: "pinball", name: "Pinball cabinet", price: 38 },
  { type: "recordplayer", name: "Record table", price: 28 },
];

export function clothingById(id) {
  return CLOTHING_STOCK.find((c) => c.id === id) || null;
}

export function petById(id) {
  return PET_STOCK.find((p) => p.id === id) || null;
}

export const OUTERWEAR_SLOTS = ["head", "torso", "legs", "prop"];

export const OUTERWEAR_STOCK = [
  { id: "ow-beanie", slot: "head", label: "Beanie", price: 10, item: { hat: "beanie", hatColor: "#3d4f7c" } },
  { id: "ow-cap", slot: "head", label: "Cap", price: 10, item: { hat: "cap", hatColor: "#c43a3a" } },
  { id: "ow-crown", slot: "head", label: "Crown", price: 18, item: { hat: "crown", hatColor: "#f0c63a" } },
  { id: "ow-hoodie", slot: "torso", label: "Hoodie", price: 14, item: { top: "hoodie", shirt: "#6c7bff" } },
  { id: "ow-jacket", slot: "torso", label: "Jacket", price: 16, item: { top: "jacket", shirt: "#2a2a2e" } },
  { id: "ow-vest", slot: "torso", label: "Vest", price: 14, item: { top: "vest", vestColor: "#6a8a3a" } },
  { id: "ow-cargo", slot: "legs", label: "Cargo pants", price: 12, item: { bottom: "cargo", bottomColor: "#6b7280" } },
  { id: "ow-shorts", slot: "legs", label: "Shorts", price: 10, item: { bottom: "shorts", bottomColor: "#3d4f7c" } },
  { id: "ow-balloon", slot: "prop", label: "Balloon", price: 8, item: { prop: "balloon" } },
  { id: "ow-skate", slot: "prop", label: "Skateboard", price: 12, item: { prop: "skateboard" } },
  { id: "ow-wizard-hat", slot: "head", label: "Wizard Hat", price: 16, item: { hat: "wizard", hatColor: "#4a5c78" } },
  { id: "ow-wizard-cloak", slot: "torso", label: "Wizard Cloak", price: 22, item: { cloak: "wizard" } },
  { id: "ow-wizard-pants", slot: "legs", label: "Wizard Pants", price: 18, item: { outfitPants: "wizard" } },
  { id: "ow-wizard-staff", slot: "prop", label: "Wizard Staff", price: 18, item: { prop: "wizardstaff" } },
];

export const PROP_ITEMS = ["balloon", "skateboard", "guitar", "coffee", "wizardstaff"];

export function outerwearById(id) {
  return OUTERWEAR_STOCK.find((c) => c.id === id) || null;
}

export function emptyGear() {
  return { head: null, torso: null, legs: null };
}

export function normalizeGear(raw = {}) {
  const ok = (v) => (typeof v === "string" && v && outerwearById(v)?.slot && outerwearById(v).slot !== "prop") ? v : null;
  return { head: ok(raw.head), torso: ok(raw.torso), legs: ok(raw.legs) };
}

export function applyEquippedGear(avatar = {}, gear = {}) {
  const out = { ...(avatar || {}) };
  const g = normalizeGear(gear);
  for (const slot of ["head", "torso", "legs"]) {
    const stock = outerwearById(g[slot]);
    if (stock?.item) Object.assign(out, stock.item);
  }
  return out;
}
