import http from "node:http";
import { readFileSync, existsSync } from "node:fs";
import { extname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import { OUTFIT_STOCK, outfitById, wearingOutfit, stripOutfitItem, shouldDrawStaff } from "../public/js/outfits.js";
import { HATS, PETS, PET_STOCK, petById } from "../public/js/storeCatalog.js";

let passed = 0;
function check(label, ok, detail) {
  if (!ok) {
    console.error("FAIL", label, detail || "");
    process.exitCode = 1;
    return;
  }
  passed += 1;
  console.log("ok  ", label);
}

const prices = Object.fromEntries(OUTFIT_STOCK.map((s) => [s.id, s.price]));
check("Outfits tab stocks five separate items", OUTFIT_STOCK.length === 5);
check("Wizard Hat costs 16 coins", prices["ow-wizard-hat"] === 16 && outfitById("ow-wizard-hat")?.label === "Wizard Hat");
check("Wizard Cloak costs 22 coins", prices["ow-wizard-cloak"] === 22);
check("Wizard Pants cost 18 coins", prices["ow-wizard-pants"] === 18);
check("Wizard Staff costs 18 coins", prices["ow-wizard-staff"] === 18 && outfitById("ow-wizard-staff")?.item === "wizardstaff");
check("Flame Ball pet costs 28 coins", prices["ow-flame-ball"] === 28 && outfitById("ow-flame-ball")?.item === "flame");
check("HATS allowlist includes wizard", HATS.includes("wizard"));
check("PETS allowlist includes flame", PETS.includes("flame"));
const petSku = petById("ow-flame-ball");
check("Flame Ball is listed in the pet store under the same id",
  petSku?.item === "flame" && petSku?.label === "Flame Ball" && petSku?.price === 28
  && PET_STOCK.filter((p) => p.id === "ow-flame-ball").length === 1);

const wearing = { hat: "wizard", cloak: "wizard", outfitPants: "wizard" };
check("wearingOutfit sees each slot independently",
  wearingOutfit(wearing, outfitById("ow-wizard-hat"))
  && wearingOutfit(wearing, outfitById("ow-wizard-cloak"))
  && wearingOutfit({ ...wearing, hat: "none" }, outfitById("ow-wizard-cloak"))
  && !wearingOutfit({ ...wearing, hat: "none" }, outfitById("ow-wizard-hat")));
const stripped = stripOutfitItem(wearing, outfitById("ow-wizard-hat").item);
check("stripOutfitItem unequips only the hat", stripped.hat === "none" && stripped.cloak === "wizard" && stripped.outfitPants === "wizard");
check("Staff hides while a fridge item is held", shouldDrawStaff({ heldProp: "wizardstaff", heldItem: { kind: "soda" } }, wearing, "s") === false);
check("Staff hides while lying down", shouldDrawStaff({ heldProp: "wizardstaff", lying: true }, wearing, "s") === false);
check("Staff draws when held in the front", shouldDrawStaff({ heldProp: "wizardstaff" }, wearing, "s") === true);
check("Staff hides on a back-facing sip raise", shouldDrawStaff({ heldProp: "wizardstaff", sipLift: 1 }, wearing, "n") === false);

const avatar3d = readFileSync(new URL("../public/js/avatar3d.js", import.meta.url), "utf8");
check("avatar3d exposes a setOutfitDraw hook and does not import outfits.js",
  /export function setOutfitDraw\(/.test(avatar3d)
  && !/from "\.\/outfits\.js"/.test(avatar3d)
  && /outfitDraw\?\.drawHat\?/.test(avatar3d)
  && /outfitDraw\?\.drawBody\?/.test(avatar3d)
  && /outfitDraw\.drawGlove/.test(avatar3d)
  && /outfitDraw\.drawBoot/.test(avatar3d)
  && /outfitDraw\.drawStaff/.test(avatar3d)
  && /hatOf\(av\) !== "wizard"/.test(avatar3d)
  && /outfitDraw\?\.clipHairUnderHat\?/.test(avatar3d)
  && /outfitDraw\?\.tuckWizardHatInk\?/.test(avatar3d)
  && /cloak: a\.cloak === "wizard"/.test(avatar3d)
  && /Boolean\(flags\.lying\)/.test(avatar3d));
check("composeAvatar still draws eyes and mouth via the existing helpers",
  /drawEyes\(head, hk, headUpper/.test(avatar3d) && /drawMouth\(head, hk, headUpper/.test(avatar3d));

const pets = readFileSync(new URL("../public/js/petSprites.js", import.meta.url), "utf8");
check("petSprites can register a custom Flame Ball drawer without aliasing flame to cat",
  /export function setPetKindDrawer\(/.test(pets)
  && /kindDrawers\.has\(kind\)/.test(pets));

const serverSrc = readFileSync(new URL("../server.js", import.meta.url), "utf8");
check("server persists cloak and outfitPants through sanitizeAvatar",
  /cloak: m\.cloak === "wizard" \? "wizard" : "none"/.test(serverSrc)
  && /outfitPants: m\.outfitPants === "wizard" \? "wizard" : "none"/.test(serverSrc));
check("server buyStoreItem accepts the outfits tab and routes slots into clothes, props, and pets",
  /kind === "outfits"/.test(serverSrc) && /outfitById\(id\)/.test(serverSrc));
check("equipClothes toggles an already-worn outfit piece off",
  /wearingOutfit\(user\.avatar, stock\)/.test(serverSrc) && /stripOutfitItem\(user\.avatar/.test(serverSrc));

const html = readFileSync(new URL("../public/index.html", import.meta.url), "utf8");
check("The store panel has an Outfits tab",
  /data-store-tab="outfits"/.test(html) && /data-testid="store-tab-outfits"/.test(html));

const iso = readFileSync(new URL("../public/js/isoRoom.js", import.meta.url), "utf8");
check("isoRoom installs outfit and flame-pet drawers and stows the staff while sleeping",
  /installOutfitDraw\(setOutfitDraw\)/.test(iso)
  && /installFlamePet\(setPetKindDrawer\)/.test(iso)
  && /heldProp: lying \? null : p\.heldProp/.test(iso));

const root = fileURLToPath(new URL("../public", import.meta.url));
const mime = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".png": "image/png", ".svg": "image/svg+xml", ".json": "application/json" };

const measure = `<!DOCTYPE html><html><body>
<canvas id="c"></canvas>
<script type="module">
  import { drawAvatarSprite, setOutfitDraw, AV_W, AV_H, AV_HEAD_TOP, AV_GROUND_Y } from "/js/avatar3d.js";
  import { installOutfitDraw, wizardHatBrimCoverY, wizardHatHeadUpper } from "/js/outfits.js";
  import { HAIR_STYLES } from "/js/storeCatalog.js";
  import { drawPetSprite, setPetKindDrawer, PET_W, PET_H } from "/js/petSprites.js";
  import { installFlamePet } from "/js/flamePet.js";
  installOutfitDraw(setOutfitDraw);
  installFlamePet(setPetKindDrawer);
  const look = {
    skin: "#f0c9a8", hair: "spiky", hairColor: "#e6d3a4", shirt: "#c45c4a",
    top: "tshirt", bottom: "jeans", bottomColor: "#3d4f7c", shoes: "white", accessory: "none",
    hat: "wizard", hatColor: "#4a5c78", cloak: "wizard", outfitPants: "wizard",
  };
  const bare = { ...look, hat: "none", cloak: "none", outfitPants: "none" };
  const facings = [
    { name: "SE", facing: { x: 1, z: 1 } },
    { name: "S", facing: { x: 0, z: 1 } },
    { name: "SW", facing: { x: -1, z: 1 } },
    { name: "W", facing: { x: -1, z: 0 } },
    { name: "NW", facing: { x: -1, z: -1 } },
    { name: "N", facing: { x: 0, z: -1 } },
    { name: "NE", facing: { x: 1, z: -1 } },
    { name: "E", facing: { x: 1, z: 0 } },
  ];
  function scan(img, w, h, pred) {
    let n = 0, hits = 0, minY = h, maxY = 0, minX = w, maxX = 0;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const o = (y * w + x) * 4;
      if (img[o + 3] < 16) continue;
      n++;
      if (pred(img[o], img[o + 1], img[o + 2], x, y)) {
        hits++;
        if (y < minY) minY = y; if (y > maxY) maxY = y;
        if (x < minX) minX = x; if (x > maxX) maxX = x;
      }
    }
    return { n, hits, minY, maxY, minX, maxX };
  }
  const steel = (r, g, b) => b > r + 8 && b > 70 && r < 160 && g < 180 && r > 20 && b < 200;
  const darkCloak = (r, g, b) => b > r + 6 && b > 28 && b < 130 && r < 90 && g < 110;
  const leather = (r, g, b) => r > 70 && r > g + 8 && g > b && b < 90;
  const wood = (r, g, b) => r > 50 && r > b + 20 && g < r && g > 20 && b < 80;
  const crystal = (r, g, b) => b > r + 20 && b > 140 && g > 80;
  const purple = (r, g, b) => r > 80 && b > 80 && g < 70 && Math.abs(r - b) < 50;
  const emberCore = (r, g, b) => r > 160 && g > 30 && g < 220 && b < 100 && r > g;
  const eyeHi = (r, g, b) => r > 240 && g > 230 && b > 200;
  const out = { facings: [], walk: null, sit: null, lie: null, flame: {}, eyes: null };
  for (const f of facings) {
    const spr = drawAvatarSprite(look, { facing: f.facing, heldProp: "wizardstaff", blink: "open" }, 0);
    const img = spr.c.getContext("2d").getImageData(0, 0, AV_W, AV_H).data;
    const blue = scan(img, AV_W, AV_H, steel);
    const cloak = scan(img, AV_W, AV_H, darkCloak);
    const boot = scan(img, AV_W, AV_H, (r, g, b, x, y) => leather(r, g, b) && y >= AV_GROUND_Y - 14);
    const staffWood = scan(img, AV_W, AV_H, wood);
    const gem = scan(img, AV_W, AV_H, crystal);
    const purp = scan(img, AV_W, AV_H, purple);
    out.facings.push({
      name: f.name, px: blue.n, hatBlue: blue.hits, hatTop: blue.minY,
      cloakHits: cloak.hits, cloakBot: cloak.maxY,
      bootHits: boot.hits, staffWood: staffWood.hits, staffTop: Math.min(staffWood.minY, gem.minY),
      gemHits: gem.hits, gemTop: gem.minY, purple: purp.hits,
    });
  }
  const walk = drawAvatarSprite(look, { facing: { x: 0, z: 1 }, heldProp: "wizardstaff", walking: true, blink: "open" }, 6);
  const wimg = walk.c.getContext("2d").getImageData(0, 0, AV_W, AV_H).data;
  out.walk = { px: scan(wimg, AV_W, AV_H, () => true).n, hat: scan(wimg, AV_W, AV_H, steel).hits };
  const sit = drawAvatarSprite(look, { facing: { x: 0, z: 1 }, heldProp: "wizardstaff", sitting: true, blink: "open" }, 0);
  const simg = sit.c.getContext("2d").getImageData(0, 0, AV_W, AV_H).data;
  out.sit = { px: scan(simg, AV_W, AV_H, () => true).n, hat: scan(simg, AV_W, AV_H, steel).hits, cloak: scan(simg, AV_W, AV_H, darkCloak).hits };
  const front = drawAvatarSprite(look, { facing: { x: 0, z: 1 }, heldProp: "wizardstaff", blink: "open" }, 0);
  const bareS = drawAvatarSprite(bare, { facing: { x: 0, z: 1 }, blink: "open" }, 0);
  const fimg = front.c.getContext("2d").getImageData(0, 0, AV_W, AV_H).data;
  const bimg = bareS.c.getContext("2d").getImageData(0, 0, AV_W, AV_H).data;
  // Face window around mid-head should keep eye-dark pixels, not be a solid hat fill.
  let eyeKept = 0, facePx = 0, hatInFace = 0;
  for (let y = AV_HEAD_TOP + 10; y < AV_HEAD_TOP + 28; y++) {
    for (let x = 26; x < 46; x++) {
      const o = (y * AV_W + x) * 4;
      if (bimg[o + 3] < 16) continue;
      const br = bimg[o], bg = bimg[o + 1], bb = bimg[o + 2];
      const dark = br < 80 && bg < 80 && bb < 80;
      if (!dark) continue;
      facePx++;
      const fr = fimg[o], fg = fimg[o + 1], fb = fimg[o + 2], fa = fimg[o + 3];
      if (fa > 16 && !steel(fr, fg, fb) && fr < 90 && fg < 90 && fb < 90) eyeKept++;
      if (fa > 16 && steel(fr, fg, fb)) hatInFace++;
    }
  }
  out.eyes = { facePx, eyeKept, hatInFace };

  const hex = (h) => {
    const n = (h || "#000000").replace("#", "");
    return { r: parseInt(n.slice(0, 2), 16), g: parseInt(n.slice(2, 4), 16), b: parseInt(n.slice(4, 6), 16) };
  };
  const near = (r, g, b, c, tol = 42) => Math.abs(r - c.r) + Math.abs(g - c.g) + Math.abs(b - c.b) <= tol;
  const facingKeys = [
    { name: "SE", facing: { x: 1, z: 1 }, key: "se" },
    { name: "S", facing: { x: 0, z: 1 }, key: "s" },
    { name: "SW", facing: { x: -1, z: 1 }, key: "se" },
    { name: "W", facing: { x: -1, z: 0 }, key: "e" },
    { name: "NW", facing: { x: -1, z: -1 }, key: "ne" },
    { name: "N", facing: { x: 0, z: -1 }, key: "n" },
    { name: "NE", facing: { x: 1, z: -1 }, key: "ne" },
    { name: "E", facing: { x: 1, z: 0 }, key: "e" },
  ];
  const poses = [
    { name: "idle", flags: { blink: "open" }, frame: 0 },
    { name: "walk", flags: { walking: true, blink: "open" }, frame: 6 },
    { name: "sit", flags: { sitting: true, blink: "open" }, frame: 0 },
  ];
  const hairColors = ["#2b1d16", "#e6d3a4"];
  const skin = "#f0c9a8";
  const peeks = [];
  const holes = [];
  const isHatPx = (r, g, b, a) => a > 16 && (steel(r, g, b) || (b >= r && b > 40 && r < 90 && g < 100));
  function coverLine(hat, sitting) {
    const yLimit = sitting ? 50 : 42;
    const brimYs = [];
    for (let x = 0; x < AV_W; x++) {
      let maxY = -1;
      for (let y = 0; y < yLimit; y++) {
        const o = (y * AV_W + x) * 4;
        if (isHatPx(hat[o], hat[o + 1], hat[o + 2], hat[o + 3])) maxY = y;
      }
      if (maxY >= 0) brimYs.push(maxY);
    }
    brimYs.sort((a, b) => a - b);
    const typicalBrim = brimYs.length ? brimYs[Math.floor(brimYs.length * 0.3)] : 28;
    return typicalBrim - 2;
  }
  for (const style of HAIR_STYLES) {
    for (const hairColor of hairColors) {
      if (hairColor === "#e6d3a4" && !["spiky", "shaggy", "afropuff", "spacebuns", "bun"].includes(style)) continue;
      const skinC = hex(skin), hairC = hex(hairColor);
      const isHeadPx = (r, g, b, a) => a > 16 && (near(r, g, b, skinC) || near(r, g, b, hairC));
      const base = {
        skin, hair: style, hairColor, shirt: "#c45c4a", top: "tshirt",
        bottom: "jeans", bottomColor: "#3d4f7c", shoes: "white", accessory: "none",
      };
      for (const f of facingKeys) {
        for (const pose of poses) {
          const flags = { facing: f.facing, ...pose.flags };
          const hatSpr = drawAvatarSprite({ ...base, hat: "wizard", cloak: "wizard", outfitPants: "wizard" }, flags, pose.frame);
          const hat = hatSpr.c.getContext("2d").getImageData(0, 0, AV_W, AV_H).data;
          const coverY = coverLine(hat, Boolean(pose.flags.sitting));
          // 1) No hair or scalp may remain visible above the brim.
          const leftover = [];
          for (let x = 0; x < AV_W; x++) {
            for (let y = 0; y <= coverY; y++) {
              const o = (y * AV_W + x) * 4;
              if (isHeadPx(hat[o], hat[o + 1], hat[o + 2], hat[o + 3])) leftover.push({ x, y });
            }
          }
          if (leftover.length) peeks.push({ style, hairColor, facing: f.name, pose: pose.name, n: leftover.length, sample: leftover.slice(0, 4) });
          // 2) The bare buzz/scalp silhouette (the actual head, not tall spikes) is solidly under the hat.
          const buzzSpr = drawAvatarSprite({ ...base, hair: "buzz", hat: "none", cloak: "none", outfitPants: "none" }, flags, pose.frame);
          const buzz = buzzSpr.c.getContext("2d").getImageData(0, 0, AV_W, AV_H).data;
          const gap = [];
          for (let x = 0; x < AV_W; x++) {
            for (let y = 0; y <= coverY; y++) {
              const o = (y * AV_W + x) * 4;
              if (!isHeadPx(buzz[o], buzz[o + 1], buzz[o + 2], buzz[o + 3])) continue;
              const hr = hat[o], hg = hat[o + 1], hb = hat[o + 2], ha = hat[o + 3];
              if (ha < 16 || isHeadPx(hr, hg, hb, ha)) gap.push({ x, y, ha });
            }
          }
          if (gap.length) holes.push({ style, hairColor, facing: f.name, pose: pose.name, n: gap.length, sample: gap.slice(0, 4) });
        }
      }
    }
  }
  out.cover = { peeks, holes, styles: HAIR_STYLES.length };

  // Bent tip: top of the south-facing cone is offset from the crown center; it moves while walking.
  function hatTip(img) {
    let minY = AV_H, xs = [], n = 0, baseXs = [];
    for (let y = 0; y < AV_H; y++) for (let x = 0; x < AV_W; x++) {
      const o = (y * AV_W + x) * 4;
      if (img[o + 3] < 16 || !steel(img[o], img[o + 1], img[o + 2])) continue;
      if (y < minY) { minY = y; xs = [x]; n = 1; }
      else if (y === minY) { xs.push(x); n++; }
    }
    const tipX = xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0;
    // Crown center: hat pixels around the brim band.
    const upper = wizardHatHeadUpper({}, 0);
    const brimY = wizardHatBrimCoverY("s", upper);
    const cx = [];
    for (let y = brimY - 3; y <= brimY; y++) for (let x = 0; x < AV_W; x++) {
      const o = (y * AV_W + x) * 4;
      if (img[o + 3] > 16 && steel(img[o], img[o + 1], img[o + 2])) cx.push(x);
    }
    const baseX = cx.length ? cx.reduce((a, b) => a + b, 0) / cx.length : AV_W / 2;
    return { minY, tipX, baseX, offset: tipX - baseX };
  }
  const idleTip = hatTip(fimg);
  const walkTips = [0, 2, 4, 6].map((fr) => {
    const spr = drawAvatarSprite(look, { facing: { x: 0, z: 1 }, heldProp: "wizardstaff", walking: true, blink: "open" }, fr);
    return hatTip(spr.c.getContext("2d").getImageData(0, 0, AV_W, AV_H).data);
  });
  const tipXs = walkTips.map((t) => t.tipX);
  const tipYs = walkTips.map((t) => t.minY);
  out.bend = {
    idle: idleTip,
    walk: walkTips,
    walkSpanX: Math.max(...tipXs) - Math.min(...tipXs),
    walkSpanY: Math.max(...tipYs) - Math.min(...tipYs),
  };

  for (const key of ["s", "n", "e"]) {
    const pet = drawPetSprite("flame", { dir: key === "s" ? 1 : key === "n" ? 5 : 7, walking: true }, 4);
    const pimg = pet.c.getContext("2d").getImageData(0, 0, pet.w, pet.h).data;
    const org = scan(pimg, pet.w, pet.h, emberCore);
    const eyes = scan(pimg, pet.w, pet.h, eyeHi);
    out.flame[key] = { px: org.n, ember: org.hits, eyes: eyes.hits };
  }
  const tunicBlue = (r, g, b) => r > 70 && r < 180 && b > r + 8 && g > 90 && g < 210 && b < 220 && b < r + 90;
  const darkCape = (r, g, b) => b >= r && b > 28 && b < 130 && r < 90 && g < 120;
  const skinPx = (r, g, b) => r > 160 && g > 110 && b > 70 && r > b + 20 && r > g && g > b - 10;
  const shirtPx = (r, g, b) => r > 140 && g < 120 && b < 100 && r > g + 30 && r > b + 30;
  const leatherPx = (r, g, b) => r > 70 && r > g + 8 && g > b && b < 90;

  // Robe skirt: one light-blue panel from the waist to just above the ankles.
  const skirtSpr = drawAvatarSprite(look, { facing: { x: 0, z: 1 }, heldProp: "wizardstaff", blink: "open" }, 0);
  const simg2 = skirtSpr.c.getContext("2d").getImageData(0, 0, AV_W, AV_H).data;
  function rowRuns(img, y, pred) {
    const runs = [];
    let start = -1;
    for (let x = 0; x <= AV_W; x++) {
      const o = (y * AV_W + x) * 4;
      const hit = x < AV_W && img[o + 3] > 16 && pred(img[o], img[o + 1], img[o + 2]);
      if (hit && start < 0) start = x;
      if (!hit && start >= 0) { runs.push({ x0: start, x1: x - 1, w: x - start }); start = -1; }
    }
    return runs;
  }
  const calfY = AV_GROUND_Y - 9;
  const midSkirtY = AV_GROUND_Y - 11;
  const calfRuns = rowRuns(simg2, calfY, tunicBlue);
  const midRuns = rowRuns(simg2, midSkirtY, tunicBlue);
  const ankleBoots = scan(simg2, AV_W, AV_H, (r, g, b, x, y) => leatherPx(r, g, b) && y >= AV_GROUND_Y - 8);
  const twoLegGap = calfRuns.length >= 2 && (calfRuns[1].x0 - calfRuns[0].x1) >= 3;
  out.skirt = {
    calfRuns: calfRuns.length, calfW: calfRuns.reduce((s, r) => s + r.w, 0), twoLegGap,
    midRuns: midRuns.length, midW: midRuns.reduce((s, r) => s + r.w, 0),
    ankleBoots: ankleBoots.hits,
    calfY, midSkirtY,
  };
  const walkSkirt = [0, 2, 4, 6].map((fr) => {
    const spr = drawAvatarSprite(look, { facing: { x: 0, z: 1 }, heldProp: "wizardstaff", walking: true, blink: "open" }, fr);
    const img = spr.c.getContext("2d").getImageData(0, 0, AV_W, AV_H).data;
    const runs = rowRuns(img, calfY, tunicBlue);
    const cx = runs.length ? (runs[0].x0 + runs[runs.length - 1].x1) / 2 : 0;
    return { fr, cx, w: runs.reduce((s, r) => s + r.w, 0), n: runs.length };
  });
  out.skirtSway = {
    frames: walkSkirt,
    span: Math.max(...walkSkirt.map((f) => f.cx)) - Math.min(...walkSkirt.map((f) => f.cx)),
  };

  // Back cape: no body/skin/shirt/tunic bleeding through the cape panel.
  // N and NW (and W, a flipped 3/4-back) are the back-facing views in this isometric mapping.
  const backFacings = [
    { name: "N", facing: { x: 0, z: -1 } },
    { name: "NW", facing: { x: -1, z: -1 } },
    { name: "W", facing: { x: -1, z: 0 } },
  ];
  out.capeBack = [];
  for (const f of backFacings) {
    const spr = drawAvatarSprite(look, { facing: f.facing, heldProp: "wizardstaff", blink: "open" }, 0);
    const img = spr.c.getContext("2d").getImageData(0, 0, AV_W, AV_H).data;
    const y0 = 54, y1 = AV_GROUND_Y - 5;
    let minX = AV_W, maxX = 0;
    for (let y = y0; y <= y1; y++) for (let x = 0; x < AV_W; x++) {
      const o = (y * AV_W + x) * 4;
      if (img[o + 3] > 16 && darkCape(img[o], img[o + 1], img[o + 2])) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
      }
    }
    const x0 = minX + 2, x1 = maxX - 2;
    let bleed = 0, holes = 0, capePx = 0, sample = [];
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        const o = (y * AV_W + x) * 4;
        const r = img[o], g = img[o + 1], b = img[o + 2], a = img[o + 3];
        if (a < 16) { holes++; if (sample.length < 4) sample.push({ x, y, a, r, g, b }); continue; }
        if (darkCape(r, g, b)) { capePx++; continue; }
        if (skinPx(r, g, b) || shirtPx(r, g, b) || tunicBlue(r, g, b)) {
          bleed++;
          if (sample.length < 6) sample.push({ x, y, r, g, b });
        }
      }
    }
    out.capeBack.push({ name: f.name, bleed, holes, capePx, sample, x0, x1, y0, y1 });
  }

  window.__outfits = out;
</script>
</body></html>`;

const httpServer = http.createServer((req, res) => {
  if (req.url === "/" || req.url.startsWith("/outfits-measure")) {
    res.writeHead(200, { "content-type": "text/html" });
    res.end(measure);
    return;
  }
  const rel = decodeURIComponent((req.url || "/").split("?")[0].replace(/^\//, ""));
  const file = join(root, rel);
  if (!file.startsWith(root) || !existsSync(file)) { res.writeHead(404); res.end("no"); return; }
  res.writeHead(200, { "content-type": mime[extname(file)] || "application/octet-stream" });
  res.end(readFileSync(file));
});

await new Promise((r) => httpServer.listen(0, "127.0.0.1", r));
const { port } = httpServer.address();
const browser = await chromium.launch({ args: ["--no-sandbox", "--disable-setuid-sandbox"] });
const page = await browser.newPage();
page.on("pageerror", (e) => { console.error("PAGEERROR", e); process.exitCode = 1; });
await page.goto("http://127.0.0.1:" + port + "/outfits-measure", { waitUntil: "networkidle" });
const metrics = await page.waitForFunction(() => window.__outfits, null, { timeout: 20000 }).then(() => page.evaluate(() => window.__outfits));
await browser.close();
httpServer.close();

if (!metrics) {
  console.error("FAIL no outfit metrics");
  process.exit(1);
}

for (const f of metrics.facings) {
  check(`${f.name}: full wizard set is non-empty`, f.px > 80, JSON.stringify(f));
  check(`${f.name}: steel/denim hat pixels sit above the face`, f.hatBlue >= 20 && f.hatTop <= 16, JSON.stringify(f));
  check(`${f.name}: cloak reaches near the ground`, f.cloakHits >= 20 && f.cloakBot >= 60, JSON.stringify(f));
  check(`${f.name}: tall brown boots are visible`, f.bootHits >= 8, JSON.stringify(f));
  check(`${f.name}: twisted staff is taller than the figure with a blue crystal on top`,
    f.staffWood >= 8 && f.gemHits >= 4 && f.gemTop <= 12 && f.staffTop <= 8, JSON.stringify(f));
  check(`${f.name}: no leftover purple/star palette`, f.purple === 0, JSON.stringify(f));
}
check("Walking frame still shows the hat", metrics.walk.px > 80 && metrics.walk.hat >= 20, JSON.stringify(metrics.walk));
check("Sitting still shows the hat and cloak", metrics.sit.px > 80 && metrics.sit.hat >= 20 && metrics.sit.cloak >= 10, JSON.stringify(metrics.sit));
check("Wizard hat does not cover the eyes",
  metrics.eyes.facePx >= 4 && metrics.eyes.eyeKept >= 2 && metrics.eyes.hatInFace === 0, JSON.stringify(metrics.eyes));
check("Wizard hat hides hair and scalp above the brim in every facing, pose, and hair style",
  metrics.cover.peeks.length === 0 && metrics.cover.styles >= 8, JSON.stringify(metrics.cover.peeks.slice(0, 8)));
check("Wizard hat covers the head's top silhouette (not just hiding hair as holes)",
  metrics.cover.holes.length === 0, JSON.stringify(metrics.cover.holes.slice(0, 8)));
check("Wizard hat tip droops to one side at rest",
  Math.abs(metrics.bend.idle.offset) >= 4 && metrics.bend.idle.minY <= 12, JSON.stringify(metrics.bend.idle));
check("Wizard hat tip bounces while walking",
  (metrics.bend.walkSpanX >= 2 || metrics.bend.walkSpanY >= 1) && metrics.bend.walk.every((t) => Math.abs(t.offset) >= 3),
  JSON.stringify(metrics.bend));
check("Wizard Pants are a light-blue robe skirt covering the legs, not two separate pant legs",
  metrics.skirt.calfRuns === 1 && metrics.skirt.calfW >= 10 && !metrics.skirt.twoLegGap
  && metrics.skirt.midRuns === 1 && metrics.skirt.midW >= 10, JSON.stringify(metrics.skirt));
check("The robe skirt ends just above the ankles so boots still peek out",
  metrics.skirt.ankleBoots >= 6, JSON.stringify(metrics.skirt));
check("The robe skirt sways slightly while walking",
  metrics.skirtSway.span >= 1, JSON.stringify(metrics.skirtSway));
for (const c of metrics.capeBack) {
  check(`${c.name}: the cape is opaque over the back with no body/skin/shirt showing through`,
    c.bleed === 0 && c.holes === 0 && c.capePx >= 40, JSON.stringify(c));
}
check("Flame Ball is a solid ember with a glowing core and oval-eye highlights from the front",
  metrics.flame.s.ember >= 16 && metrics.flame.s.eyes >= 1, JSON.stringify(metrics.flame));
check("Flame Ball keeps an ember body from the back without front-facing eye highlights",
  metrics.flame.n.ember >= 16 && metrics.flame.n.eyes === 0, JSON.stringify(metrics.flame));

if (process.exitCode) {
  console.error(`outfits: ${passed} passed, then failed`);
  process.exit(1);
}
console.log(`outfits: ${passed} passed`);
