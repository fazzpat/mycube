import {
  ART_PIECES,
  ART_TYPES,
  ART_SIZE,
  FLOOR_TILE_PX,
  ART_TILE_SPAN,
  ART_WORLD_UP,
  renderArtPixels,
  uniqueColors,
  artCatalogEntry,
  PAINTING_CATALOG,
  isPainting,
  isPixelArt,
} from "../public/js/artPieces.js";

const results = [];
function check(name, ok, extra = "") {
  results.push({ name, ok, extra });
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${extra ? " — " + extra : ""}`);
}

check("There are exactly 10 original pixel-art pieces", ART_PIECES.length === 10 && ART_TYPES.length === 10, String(ART_TYPES));

const names = new Set(), types = new Set();
let catalogOk = true;
for (const piece of ART_PIECES) {
  types.add(piece.type);
  names.add(piece.name);
  const entry = artCatalogEntry(piece);
  const catalog = PAINTING_CATALOG[piece.type];
  if (!piece.type || !piece.name || !piece.description) catalogOk = false;
  if (!(piece.price >= 10 && piece.price <= 40)) catalogOk = false;
  if (entry.w !== 1 || entry.h !== 1 || entry.surface !== "wall" || entry.blocks !== false) catalogOk = false;
  if (!catalog || catalog.name !== piece.name || catalog.price !== piece.price) catalogOk = false;
  if (!isPainting(piece.type) || !isPixelArt(piece.type)) catalogOk = false;
}
check("Each piece has a unique name, type, description, coin price, and one-tile wall catalog entry", catalogOk && names.size === 10 && types.size === 10);

check(
  "Artwork size matches one floor-tile face (isoRoom TW=64, TH=32)",
  ART_SIZE === 32 && FLOOR_TILE_PX === 32 && ART_TILE_SPAN === 1 && ART_WORLD_UP === 32,
  JSON.stringify({ ART_SIZE, FLOOR_TILE_PX, ART_TILE_SPAN, ART_WORLD_UP }),
);

const landscapes = ["art_ocean", "art_peaks", "art_nightwood", "art_mesa", "art_farm", "art_skyline"];
const abstracts = ["art_blocks", "art_gridsun", "art_swirl", "art_bloom"];
check(
  "The ten types cover six landscapes and four abstracts",
  landscapes.every((t) => ART_TYPES.includes(t)) && abstracts.every((t) => ART_TYPES.includes(t)),
);

let pixelsOk = true;
const palettes = [];
for (const piece of ART_PIECES) {
  const { width, height, pixels } = renderArtPixels(piece.type);
  const missing = pixels.filter((c) => !c || c === "#00000000").length;
  const colors = uniqueColors(piece.type);
  palettes.push({ type: piece.type, colors: colors.length, missing });
  if (width !== ART_SIZE || height !== ART_SIZE) pixelsOk = false;
  if (pixels.length !== ART_SIZE * ART_SIZE) pixelsOk = false;
  if (missing !== 0) pixelsOk = false;
  if (colors.length < 6 || colors.length > 40) pixelsOk = false;
}
check("Each piece is a complete 32x32 pixel buffer with a limited palette", pixelsOk, JSON.stringify(palettes));

const hashes = ART_PIECES.map((p) => renderArtPixels(p.type).pixels.join(","));
check("The ten paintings are visually distinct", new Set(hashes).size === 10);

const failed = results.filter((r) => !r.ok);
if (failed.length) {
  console.error(`\n${failed.length} art catalog check(s) failed`);
  process.exitCode = 1;
} else {
  console.log(`\nAll ${results.length} art catalog checks passed`);
}
