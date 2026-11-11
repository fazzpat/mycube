/* Shared clothing/pet store catalogs and avatar option extensions. */

export const HAIR_STYLES = ["short", "long", "curly", "bun", "spiky", "bangs", "undercut"];
export const HAIR_COLORS = [
  "#2b1d16", "#6b3a2a", "#d4a017", "#f3e5c2", "#c0392b", "#4a90d9", "#7b4f9c", "#222222",
];
export const SKINS = ["#ffdfc4", "#f1c27d", "#e0ac69", "#c68642", "#8d5524", "#5c3317"];
export const SHIRTS = ["#ff7a59", "#7bc47f", "#6c7bff", "#f4c15d", "#ef476f", "#20b2aa", "#ff8fab", "#5c4d7d"];
export const TOPS = ["tshirt", "hoodie", "jacket", "bandtee"];
export const BOTTOMS = ["jeans", "joggers", "cargo", "shorts"];
export const BOTTOM_COLORS = ["#3d4f7c", "#2a2a2e", "#6b7280", "#c4a35a"];
export const SHOES = ["white", "black", "red", "gum", "skate"];
export const ACCESSORIES = ["none", "cap", "beanie", "chain", "headphones", "trucker", "wristband", "belt"];
export const HEADPHONE_COLORS = ["#2a2a2e", "#ff7a59", "#7c5cff", "#f4c15d", "#ef476f", "#20b2aa", "#f6f3ee", "#3d4f7c"];
export const PETS = ["cat", "dog", "bunny", "fox", "hamster", "parrot", "turtle"];

export const BASE_TOPS = ["tshirt", "hoodie", "jacket"];
export const BASE_BOTTOMS = ["jeans", "joggers"];
export const BASE_SHOES = ["white", "black", "red", "gum"];
export const BASE_ACCESSORIES = ["none", "cap", "beanie", "chain", "headphones"];
export const BASE_HAIR = ["short", "long", "curly", "bun", "spiky", "bangs"];
export const STORE_LOCKED = {
  top: new Set(["bandtee"]),
  bottom: new Set(["cargo", "shorts"]),
  shoes: new Set(["skate"]),
  accessory: new Set(["trucker", "wristband", "belt"]),
  hair: new Set(["undercut"]),
};

export const CLOTHING_STOCK = [
  { id: "nt-tee", label: "Cube Tee", price: 8, item: { top: "tshirt", shirt: "#20b2aa" } },
  { id: "nt-band-star", label: "Starry Band Tee", price: 12, item: { top: "bandtee", shirt: "#1a1a22" } },
  { id: "nt-band-cube", label: "Cube Fest Tee", price: 12, item: { top: "bandtee", shirt: "#6c7bff" } },
  { id: "nt-band-emo", label: "Emo Star Tee", price: 12, item: { top: "bandtee", shirt: "#2a2a2e" } },
  { id: "nt-hoodie", label: "Skate Hoodie", price: 14, item: { top: "hoodie", shirt: "#6c7bff" } },
  { id: "nt-hoodie-blk", label: "Black Zip Hoodie", price: 16, item: { top: "hoodie", shirt: "#2a2a2e" } },
  { id: "nt-street-j", label: "Classic Street Jacket", price: 15, item: { top: "jacket", shirt: "#5c4d7d" } },
  { id: "nt-wind", label: "Windbreaker", price: 18, item: { top: "jacket", shirt: "#ef476f" } },
  { id: "nt-cargo", label: "Cargo Pants", price: 16, item: { bottom: "cargo", bottomColor: "#6b7280" } },
  { id: "nt-shorts", label: "Cargo Shorts", price: 14, item: { bottom: "shorts", bottomColor: "#c4a35a" } },
  { id: "nt-baggy", label: "Baggy Jeans", price: 16, item: { bottom: "jeans", bottomColor: "#2a2a2e" } },
  { id: "nt-skate", label: "Skate Shoes", price: 18, item: { shoes: "skate" } },
  { id: "nt-trucker", label: "Trucker Hat", price: 10, item: { accessory: "trucker" } },
  { id: "nt-beanie", label: "Slouch Beanie", price: 10, item: { accessory: "beanie", headphoneColor: "#2a2a2e" } },
  { id: "nt-wrist", label: "Wristband", price: 8, item: { accessory: "wristband" } },
  { id: "nt-belt", label: "Studded Belt", price: 12, item: { accessory: "belt" } },
  { id: "nt-shades", label: "Sunglasses", price: 12, item: { glasses: true } },
  { id: "nt-undercut", label: "Undercut", price: 10, item: { hair: "undercut", hairColor: "#222222" } },
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
];

export function clothingById(id) {
  return CLOTHING_STOCK.find((c) => c.id === id) || null;
}

export function petById(id) {
  return PET_STOCK.find((p) => p.id === id) || null;
}
