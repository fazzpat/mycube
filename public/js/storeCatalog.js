/* Shared clothing/pet store catalogs and avatar option extensions. */

export const HAIR_STYLES = ["short", "long", "curly", "bun", "spiky", "bangs", "neon", "undercut"];
export const HAIR_COLORS = [
  "#2b1d16", "#6b3a2a", "#d4a017", "#f3e5c2", "#c0392b", "#4a90d9", "#7b4f9c", "#222222",
  "#00f0ff", "#ff2bd6", "#b6ff3b",
];
export const SKINS = ["#ffdfc4", "#f1c27d", "#e0ac69", "#c68642", "#8d5524", "#5c3317"];
export const SHIRTS = ["#ff7a59", "#7bc47f", "#6c7bff", "#f4c15d", "#ef476f", "#20b2aa", "#ff8fab", "#5c4d7d", "#ff2bd6", "#00f0ff", "#b6ff3b", "#9b5cff"];
export const TOPS = ["tshirt", "hoodie", "jacket", "techwear", "ledhoodie"];
export const BOTTOMS = ["jeans", "joggers", "cargo", "neonpants"];
export const BOTTOM_COLORS = ["#3d4f7c", "#2a2a2e", "#6b7280", "#c4a35a", "#1a1030", "#00a38a"];
export const SHOES = ["white", "black", "red", "gum", "glow", "cyber"];
export const ACCESSORIES = ["none", "cap", "beanie", "chain", "headphones", "visor", "goggles", "tattoo"];
export const HEADPHONE_COLORS = ["#2a2a2e", "#ff7a59", "#7c5cff", "#f4c15d", "#ef476f", "#20b2aa", "#f6f3ee", "#3d4f7c", "#00f0ff", "#ff2bd6"];
export const PETS = ["cat", "dog", "bunny", "robocat", "drone", "neonfox", "jellyfish"];

export const BASE_TOPS = ["tshirt", "hoodie", "jacket"];
export const BASE_BOTTOMS = ["jeans", "joggers"];
export const BASE_SHOES = ["white", "black", "red", "gum"];
export const BASE_ACCESSORIES = ["none", "cap", "beanie", "chain", "headphones"];
export const BASE_HAIR = ["short", "long", "curly", "bun", "spiky", "bangs"];
export const STORE_LOCKED = {
  top: new Set(["techwear", "ledhoodie"]),
  bottom: new Set(["cargo", "neonpants"]),
  shoes: new Set(["glow", "cyber"]),
  accessory: new Set(["visor", "goggles", "tattoo"]),
  hair: new Set(["neon", "undercut"]),
};

export const CLOTHING_STOCK = [
  { id: "nt-tech-m", label: "Magenta Tech Jacket", price: 35, item: { top: "techwear", shirt: "#ff2bd6" } },
  { id: "nt-tech-c", label: "Cyan Tech Jacket", price: 35, item: { top: "techwear", shirt: "#00f0ff" } },
  { id: "nt-tech-p", label: "Purple Tech Jacket", price: 40, item: { top: "techwear", shirt: "#9b5cff" } },
  { id: "nt-led-g", label: "Acid LED Hoodie", price: 30, item: { top: "ledhoodie", shirt: "#b6ff3b" } },
  { id: "nt-led-m", label: "Magenta LED Hoodie", price: 30, item: { top: "ledhoodie", shirt: "#ff2bd6" } },
  { id: "nt-led-c", label: "Cyan LED Hoodie", price: 30, item: { top: "ledhoodie", shirt: "#00f0ff" } },
  { id: "nt-cargo", label: "Night Cargo Pants", price: 22, item: { bottom: "cargo", bottomColor: "#1a1030" } },
  { id: "nt-neonpants", label: "Acid Stripe Pants", price: 24, item: { bottom: "neonpants", bottomColor: "#00a38a" } },
  { id: "nt-glow", label: "Glow Sneakers", price: 20, item: { shoes: "glow" } },
  { id: "nt-cyber", label: "Cyber Boots", price: 25, item: { shoes: "cyber" } },
  { id: "nt-visor", label: "Holovid Visor", price: 18, item: { accessory: "visor" } },
  { id: "nt-goggles", label: "Cyber Goggles", price: 18, item: { accessory: "goggles" } },
  { id: "nt-tattoo", label: "Face Circuit Decal", price: 12, item: { accessory: "tattoo" } },
  { id: "nt-neon-hair", label: "Neon Spike Hair", price: 16, item: { hair: "neon", hairColor: "#00f0ff" } },
  { id: "nt-undercut", label: "Magenta Undercut", price: 16, item: { hair: "undercut", hairColor: "#ff2bd6" } },
  { id: "nt-street-j", label: "Classic Street Jacket", price: 15, item: { top: "jacket", shirt: "#5c4d7d" } },
  { id: "nt-hoodie", label: "Soft Hoodie", price: 14, item: { top: "hoodie", shirt: "#6c7bff" } },
  { id: "nt-tee", label: "Cube Tee", price: 8, item: { top: "tshirt", shirt: "#20b2aa" } },
];

export const PET_STOCK = [
  { id: "bp-cat", item: "cat", label: "City Cat", price: 25 },
  { id: "bp-dog", item: "dog", label: "Alley Dog", price: 25 },
  { id: "bp-bunny", item: "bunny", label: "Pixel Bunny", price: 22 },
  { id: "bp-robocat", item: "robocat", label: "Robo-Cat", price: 40 },
  { id: "bp-drone", item: "drone", label: "Hover Drone", price: 35 },
  { id: "bp-fox", item: "neonfox", label: "Neon Fox", price: 45 },
  { id: "bp-jelly", item: "jellyfish", label: "Pixel Jellyfish", price: 38 },
];

export const PUBLIC_PLACES = [
  {
    id: "place-neon-threads",
    name: "NEON THREADS",
    shop: "clothes",
    wallpaper: "paint-blush",
    floorStyle: "tile",
    keeper: { name: "Nyx", skin: "#c68642", hair: "undercut", hairColor: "#ff2bd6", shirt: "#00f0ff", top: "techwear", bottom: "cargo", bottomColor: "#1a1030", shoes: "glow", accessory: "visor" },
  },
  {
    id: "place-byte-pets",
    name: "BYTE PETS",
    shop: "pets",
    wallpaper: "paint-sage",
    floorStyle: "carpet",
    keeper: { name: "Byte", skin: "#f1c27d", hair: "neon", hairColor: "#b6ff3b", shirt: "#9b5cff", top: "ledhoodie", bottom: "neonpants", bottomColor: "#00a38a", shoes: "cyber", accessory: "goggles" },
  },
];

export const NEW_FURNITURE = [
  { type: "hoverchair", name: "Hover Chair", price: 30 },
  { type: "djdeck", name: "Synth DJ Deck", price: 40 },
  { type: "sodavending", name: "Cube Cola Vendor", price: 28 },
  { type: "neonsign", name: "MyCube Neon Sign", price: 22 },
  { type: "capsulecouch", name: "Capsule Couch", price: 36 },
  { type: "podplant", name: "Glow Pod Plant", price: 16 },
  { type: "holotv", name: "Holo TV", price: 32 },
];

export function clothingById(id) {
  return CLOTHING_STOCK.find((c) => c.id === id) || null;
}

export function petById(id) {
  return PET_STOCK.find((p) => p.id === id) || null;
}
