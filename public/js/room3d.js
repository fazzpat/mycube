import * as THREE from "three";
import { OrbitControls } from "../vendor/OrbitControls.js";

const WALL_H = 3.15;

const WALL_COLORS = {
  "paint-cream": "#f3eadc",
  "paint-sage": "#d7e2d4",
  "paint-blush": "#f0d6d0",
  "paint-slate": "#d5dae3",
  "stars-mint": "#d7e2d4",
  "dots-peach": "#f0d6d0",
  "stripes-lilac": "#ddd6ee",
  "hearts-coral": "#f0d6d0",
};

function shade(hex, amt) {
  const n = (hex || "#888888").replace("#", "");
  const full = n.length === 3 ? n.split("").map((c) => c + c).join("") : n;
  const num = parseInt(full, 16);
  let r = (num >> 16) + amt;
  let g = ((num >> 8) & 0xff) + amt;
  let b = (num & 0xff) + amt;
  r = Math.max(0, Math.min(255, r));
  g = Math.max(0, Math.min(255, g));
  b = Math.max(0, Math.min(255, b));
  return "#" + ((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1);
}

function tileToWorld(tx, ty, size) {
  return new THREE.Vector3(tx + 0.5 - size / 2, 0, ty + 0.5 - size / 2);
}

function footprintCenter(x, y, w, h, size) {
  return new THREE.Vector3(x + w / 2 - size / 2, 0, y + h / 2 - size / 2);
}

function furnSize(type) {
  const item = globalThis.HouseIso?.CATALOG?.[type];
  return item ? [item.w, item.h] : [1, 1];
}

function std(color, extras = {}) {
  return new THREE.MeshStandardMaterial({
    color,
    roughness: 0.42,
    metalness: 0.05,
    ...extras,
  });
}

let toonGradient = null;
function getToonGradient() {
  if (toonGradient) return toonGradient;
  const c = document.createElement("canvas");
  c.width = 3;
  c.height = 1;
  const ctx = c.getContext("2d");
  ["#2e2e32", "#8a8a90", "#ffffff"].forEach((col, i) => {
    ctx.fillStyle = col;
    ctx.fillRect(i, 0, 1, 1);
  });
  toonGradient = new THREE.CanvasTexture(c);
  toonGradient.minFilter = THREE.NearestFilter;
  toonGradient.magFilter = THREE.NearestFilter;
  toonGradient.needsUpdate = true;
  return toonGradient;
}

function saturate(hex, amt = 0.28) {
  const n = (hex || "#888888").replace("#", "");
  const full = n.length === 3 ? n.split("").map((c) => c + c).join("") : n;
  let r = parseInt(full.slice(0, 2), 16) / 255;
  let g = parseInt(full.slice(2, 4), 16) / 255;
  let b = parseInt(full.slice(4, 6), 16) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  let h = 0;
  let s = 0;
  const l = (max + min) / 2;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    if (max === r) h = (g - b) / d + (g < b ? 6 : 0);
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h /= 6;
  }
  s = Math.min(1, s + amt);
  const hue2rgb = (p, q, t) => {
    if (t < 0) t += 1;
    if (t > 1) t -= 1;
    if (t < 1 / 6) return p + (q - p) * 6 * t;
    if (t < 1 / 2) return q;
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
    return p;
  };
  let nr; let ng; let nb;
  if (s === 0) {
    nr = ng = nb = l;
  } else {
    const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
    const p2 = 2 * l - q;
    nr = hue2rgb(p2, q, h + 1 / 3);
    ng = hue2rgb(p2, q, h);
    nb = hue2rgb(p2, q, h - 1 / 3);
  }
  const toHex = (v) => Math.round(Math.max(0, Math.min(1, v)) * 255).toString(16).padStart(2, "0");
  return `#${toHex(nr)}${toHex(ng)}${toHex(nb)}`;
}

function toon(color, extras = {}) {
  return new THREE.MeshToonMaterial({
    color,
    gradientMap: getToonGradient(),
    ...extras,
  });
}

const outlineMat = new THREE.MeshBasicMaterial({
  color: 0x140c08,
  side: THREE.BackSide,
});

function mesh(geo, color, extras = {}, opts = {}) {
  const mat = typeof color === "string" ? toon(color, extras) : color;
  const m = new THREE.Mesh(geo, mat);
  m.castShadow = true;
  m.receiveShadow = true;
  if (opts.outline !== false) {
    const o = new THREE.Mesh(geo, outlineMat);
    o.scale.setScalar(opts.outlineScale || 1.15);
    o.castShadow = false;
    o.receiveShadow = false;
    m.add(o);
  }
  return m;
}

function applySquash(rig, up) {
  rig.scale.set(1.1 - up * 0.18, 0.88 + up * 0.24, 1.1 - up * 0.18);
}

function applyCharacterPose(ud, t, walking, sitting) {
  if (!ud?.rig) return;
  const phase = ud.phase || 0;
  if (sitting) {
    ud.rig.position.y = -0.16;
    ud.rig.rotation.z = 0;
    ud.rig.scale.set(1, 1, 1);
    if (ud.leftLeg) ud.leftLeg.rotation.x = -1.15;
    if (ud.rightLeg) ud.rightLeg.rotation.x = -1.15;
    if (ud.leftArm) ud.leftArm.rotation.x = 0.18;
    if (ud.rightArm) ud.rightArm.rotation.x = 0.18;
    return;
  }
  if (walking) {
    const s = Math.sin(t * 9.4 + phase);
    const up = Math.abs(s);
    ud.rig.position.y = up * 0.13;
    ud.rig.rotation.z = s * 0.09;
    applySquash(ud.rig, up);
    if (ud.leftLeg) ud.leftLeg.rotation.x = s * 0.95;
    if (ud.rightLeg) ud.rightLeg.rotation.x = -s * 0.95;
    if (ud.leftArm) ud.leftArm.rotation.x = -s * 0.78;
    if (ud.rightArm) ud.rightArm.rotation.x = s * 0.78;
    return;
  }
  const wave = Math.sin(t * 2.8 + phase);
  const up = Math.abs(Math.sin(t * 3.8 + phase));
  ud.rig.position.y = up * 0.1;
  ud.rig.rotation.z = wave * 0.09;
  applySquash(ud.rig, up);
  if (ud.leftLeg) ud.leftLeg.rotation.x = wave * 0.16;
  if (ud.rightLeg) ud.rightLeg.rotation.x = -wave * 0.16;
  if (ud.leftArm) ud.leftArm.rotation.x = wave * 0.28;
  if (ud.rightArm) ud.rightArm.rotation.x = -wave * 0.28;
}

function makeWallTexture(id) {
  const fill = WALL_COLORS[id] || WALL_COLORS["paint-cream"];
  const c = document.createElement("canvas");
  c.width = c.height = 256;
  const ctx = c.getContext("2d");
  ctx.fillStyle = fill;
  ctx.fillRect(0, 0, 256, 256);
  ctx.fillStyle = shade(fill, -8);
  ctx.globalAlpha = 0.08;
  for (let i = 0; i < 80; i++) {
    ctx.fillRect(Math.random() * 256, Math.random() * 256, 12, 8);
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(2, 1.4);
  return tex;
}

function makeFloorTexture(style, tiles) {
  const c = document.createElement("canvas");
  c.width = 512;
  c.height = 512;
  const ctx = c.getContext("2d");
  if (style === "tile") {
    ctx.fillStyle = "#e8e4dc";
    ctx.fillRect(0, 0, 512, 512);
    const n = 8;
    const s = 512 / n;
    for (let y = 0; y < n; y++) {
      for (let x = 0; x < n; x++) {
        ctx.fillStyle = (x + y) % 2 ? "#efebe3" : "#e2ddd4";
        ctx.fillRect(x * s + 1, y * s + 1, s - 2, s - 2);
        ctx.strokeStyle = "#d4cfc4";
        ctx.strokeRect(x * s + 0.5, y * s + 0.5, s - 1, s - 1);
      }
    }
  } else if (style === "carpet") {
    ctx.fillStyle = "#c9b29a";
    ctx.fillRect(0, 0, 512, 512);
    for (let i = 0; i < 6000; i++) {
      ctx.fillStyle = i % 3 ? "#d4bea6" : "#bea68e";
      ctx.fillRect(Math.random() * 512, Math.random() * 512, 2, 2);
    }
  } else {
    const planks = 10;
    const ph = 512 / planks;
    for (let i = 0; i < planks; i++) {
      const base = i % 2 ? "#d2a06a" : "#c89258";
      ctx.fillStyle = base;
      ctx.fillRect(0, i * ph, 512, ph);
      ctx.fillStyle = shade(base, 12);
      ctx.fillRect(0, i * ph, 512, 3);
      ctx.fillStyle = shade(base, -18);
      ctx.fillRect(0, i * ph + ph - 2, 512, 2);
      for (let k = 0; k < 4; k++) {
        ctx.fillStyle = shade(base, -8);
        ctx.fillRect(80 + k * 120 + (i % 2) * 40, i * ph + 8, 1.5, ph - 12);
      }
    }
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(Math.max(2, tiles / 3), Math.max(2, tiles / 3));
  tex.anisotropy = 8;
  return tex;
}

function addHair(head, style, color) {
  const mat = toon(color);
  const cap = mesh(new THREE.SphereGeometry(0.312, 24, 20, 0, Math.PI * 2, 0, Math.PI / 1.48), mat);
  cap.position.set(0, 0.1, -0.02);
  cap.scale.set(1.12, 0.92, 1.08);
  if (style === "spiky") {
    cap.scale.set(1.08, 0.62, 1.02);
    head.add(cap);
    for (let i = 0; i < 11; i++) {
      const cone = mesh(new THREE.ConeGeometry(0.08, 0.32, 8), mat);
      const a = (i / 11) * Math.PI * 1.8 - 0.55;
      cone.position.set(Math.cos(a) * 0.18, 0.28, Math.sin(a) * 0.14);
      cone.rotation.z = Math.cos(a) * 0.42;
      cone.rotation.x = 0.22;
      head.add(cone);
    }
    return;
  }
  if (style === "curly") {
    [[-0.2, 0.14, 0.08], [0.2, 0.14, 0.08], [0, 0.3, 0.02], [-0.16, 0.22, -0.18], [0.16, 0.22, -0.18], [0, 0.14, 0.22], [-0.24, 0.06, -0.06], [0.24, 0.06, -0.06], [-0.12, 0.28, 0.12], [0.12, 0.28, 0.12], [0, 0.08, -0.22]].forEach((pt) => {
      const b = mesh(new THREE.SphereGeometry(0.145, 12, 10), mat);
      b.position.set(...pt);
      head.add(b);
    });
    return;
  }
  if (style === "bun") {
    head.add(cap);
    const sides = mesh(new THREE.SphereGeometry(0.185, 14, 12), mat);
    sides.position.set(0, 0.02, -0.06);
    sides.scale.set(1.42, 0.7, 1.18);
    const bun = mesh(new THREE.SphereGeometry(0.16, 16, 14), mat);
    bun.position.set(0, 0.38, -0.05);
    head.add(sides, bun);
    return;
  }
  if (style === "long") {
    head.add(cap);
    const p1 = mesh(new THREE.CapsuleGeometry(0.105, 0.52, 5, 10), mat);
    const p2 = p1.clone();
    p1.position.set(-0.24, -0.2, -0.02);
    p2.position.set(0.24, -0.2, -0.02);
    const back = mesh(new THREE.SphereGeometry(0.2, 12, 10), mat);
    back.position.set(0, -0.06, -0.16);
    back.scale.set(1.25, 1.2, 0.95);
    head.add(p1, p2, back);
    return;
  }
  if (style === "bangs") {
    head.add(cap);
    const bang = mesh(new THREE.SphereGeometry(0.18, 14, 10), mat);
    bang.scale.set(1.65, 0.52, 0.75);
    bang.position.set(0, 0.12, 0.2);
    const tail = mesh(new THREE.CapsuleGeometry(0.095, 0.42, 5, 10), mat);
    tail.position.set(-0.25, -0.16, 0);
    head.add(bang, tail);
    return;
  }
  head.add(cap);
  [[-0.22, 0.05, 0.04], [0.22, 0.05, 0.04], [0, 0.14, -0.16]].forEach((pt) => {
    const side = mesh(new THREE.SphereGeometry(0.145, 12, 10), mat);
    side.position.set(...pt);
    head.add(side);
  });
}

function buildProp(kind) {
  const g = new THREE.Group();
  if (kind === "skateboard") {
    const deck = mesh(new THREE.BoxGeometry(0.16, 0.035, 0.52), "#2b2b30");
    const grip = mesh(new THREE.BoxGeometry(0.12, 0.01, 0.42), "#ff7a59");
    grip.position.y = 0.02;
    [[-0.05, -0.03, -0.16], [0.05, -0.03, -0.16], [-0.05, -0.03, 0.16], [0.05, -0.03, 0.16]].forEach((p) => {
      const w = mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.04, 10), "#222");
      w.rotation.z = Math.PI / 2;
      w.position.set(...p);
      g.add(w);
    });
    g.add(deck, grip);
    g.rotation.set(0.2, 0, 0.15);
    return g;
  }
  if (kind === "coffee") {
    const cup = mesh(new THREE.CylinderGeometry(0.045, 0.038, 0.08, 10), "#fff8f0");
    const lid = mesh(new THREE.CylinderGeometry(0.048, 0.048, 0.015, 10), "#2a1810");
    lid.position.y = 0.045;
    g.add(cup, lid);
    return g;
  }
  // guitar default
  const body = mesh(new THREE.SphereGeometry(0.11, 12, 10), "#c47a3a");
  body.scale.set(0.85, 1, 0.4);
  const neck = mesh(new THREE.BoxGeometry(0.035, 0.32, 0.03), "#8a5a2b");
  neck.position.y = 0.24;
  const head = mesh(new THREE.BoxGeometry(0.05, 0.07, 0.03), "#6b4220");
  head.position.y = 0.42;
  g.add(body, neck, head);
  g.rotation.set(0.4, 0.2, -0.9);
  return g;
}

function buildPetMesh(kind) {
  const g = new THREE.Group();
  const colors = { cat: "#e8c07a", dog: "#c68642", bunny: "#f3e6da" };
  const col = colors[kind] || colors.cat;
  const body = mesh(new THREE.SphereGeometry(kind === "dog" ? 0.16 : 0.13, 12, 10), col);
  body.position.y = kind === "dog" ? 0.2 : 0.18;
  body.scale.set(1.15, 0.85, 1.35);
  const head = mesh(new THREE.SphereGeometry(0.11, 12, 10), col);
  head.position.set(0, kind === "dog" ? 0.32 : 0.3, 0.14);
  const earGeo = kind === "bunny"
    ? new THREE.CapsuleGeometry(0.025, 0.16, 4, 8)
    : new THREE.ConeGeometry(0.04, kind === "dog" ? 0.08 : 0.1, 8);
  const e1 = mesh(earGeo, shade(col, -15));
  const e2 = e1.clone();
  if (kind === "bunny") {
    e1.position.set(-0.05, 0.48, 0.12);
    e2.position.set(0.05, 0.48, 0.12);
  } else if (kind === "dog") {
    e1.position.set(-0.07, 0.38, 0.12);
    e2.position.set(0.07, 0.38, 0.12);
    e1.rotation.z = 0.6;
    e2.rotation.z = -0.6;
  } else {
    e1.position.set(-0.06, 0.4, 0.14);
    e2.position.set(0.06, 0.4, 0.14);
  }
  const tail = mesh(
    kind === "bunny" ? new THREE.SphereGeometry(0.045, 8, 8) : new THREE.SphereGeometry(0.04, 8, 8),
    kind === "bunny" ? "#fff" : shade(col, -20)
  );
  tail.position.set(0, 0.22, -0.18);
  const nose = mesh(new THREE.SphereGeometry(0.02, 6, 6), "#ff8fab");
  nose.position.set(0, 0.28, 0.24);
  g.add(body, head, e1, e2, tail, nose);
  return g;
}

export function buildAvatarMesh(avatar = {}) {
  const skin = saturate(avatar.skin || "#f1c27d", 0.08);
  const topColor = saturate(avatar.shirt || "#ff7a59", 0.3);
  const hair = avatar.hairColor || "#2b1d16";
  const style = avatar.hair || "short";
  const top = avatar.top || "tshirt";
  const bottom = avatar.bottom || "jeans";
  const bottomColor = saturate(avatar.bottomColor || "#3d4f7c", 0.26);
  const shoe = avatar.shoes || "white";
  const shoeMap = { white: "#fff6ea", black: "#222226", red: "#ff3a3a", gum: "#e8942e" };
  const shoeColor = shoeMap[shoe] || shoeMap.white;
  const accessory = avatar.accessory || "none";
  const hpColor = saturate(avatar.headphoneColor || "#2a2a2e", 0.18);
  const noOL = { outline: false };
  const HIP = 0.58;
  const group = new THREE.Group();
  const rig = new THREE.Group();
  group.add(rig);

  const shadow = new THREE.Mesh(
    new THREE.CircleGeometry(0.42, 22),
    new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.24 })
  );
  shadow.rotation.x = -Math.PI / 2;
  shadow.position.y = 0.015;
  group.add(shadow);

  const leftLeg = new THREE.Group();
  const rightLeg = new THREE.Group();
  leftLeg.position.set(-0.145, HIP, 0);
  rightLeg.position.set(0.145, HIP, 0);
  const pantH = bottom === "joggers" ? 0.16 : 0.2;
  const lThigh = mesh(new THREE.CapsuleGeometry(0.155, pantH, 6, 14), bottomColor, {}, { outlineScale: 1.12 });
  const rThigh = lThigh.clone();
  lThigh.position.y = -0.2;
  rThigh.position.y = -0.2;
  leftLeg.add(lThigh);
  rightLeg.add(rThigh);
  if (bottom === "joggers") {
    const cuffL = mesh(new THREE.SphereGeometry(0.16, 12, 10), shade(bottomColor, -18));
    cuffL.scale.set(1.05, 0.48, 1.05);
    const cuffR = cuffL.clone();
    cuffL.position.y = -0.34;
    cuffR.position.y = -0.34;
    leftLeg.add(cuffL);
    rightLeg.add(cuffR);
  }
  const mkShoe = () => {
    const g = new THREE.Group();
    const upper = mesh(new THREE.SphereGeometry(0.135, 16, 14), shoeColor, {}, { outlineScale: 1.12 });
    upper.scale.set(1.5, 0.78, 2.05);
    upper.position.set(0, -0.42, 0.12);
    const sole = mesh(new THREE.CapsuleGeometry(0.095, 0.24, 4, 12), "#fff8f0", {}, { outlineScale: 1.1 });
    sole.rotation.z = Math.PI / 2;
    sole.scale.set(1, 0.95, 1.45);
    sole.position.set(0, -0.5, 0.13);
    const toe = mesh(new THREE.SphereGeometry(0.1, 12, 10), shade(shoeColor, 14), {}, { outlineScale: 1.1 });
    toe.scale.set(1.3, 0.62, 1.05);
    toe.position.set(0, -0.41, 0.26);
    g.add(upper, sole, toe);
    return g;
  };
  leftLeg.add(mkShoe());
  rightLeg.add(mkShoe());
  rig.add(leftLeg, rightLeg);

  const hips = mesh(new THREE.SphereGeometry(0.26, 16, 14), shade(bottomColor, -6));
  hips.scale.set(1.22, 0.58, 0.95);
  hips.position.y = HIP;
  rig.add(hips);

  const torso = new THREE.Group();
  torso.position.y = HIP;
  const chest = mesh(new THREE.SphereGeometry(0.27, 22, 18), topColor, {}, { outlineScale: 1.12 });
  chest.scale.set(1.32, 0.98, 1.16);
  chest.position.y = 0.26;
  torso.add(chest);
  if (top === "hoodie") {
    const pocket = mesh(new THREE.SphereGeometry(0.14, 12, 10), shade(topColor, -14));
    pocket.scale.set(1.65, 0.75, 0.55);
    pocket.position.set(0, 0.14, 0.22);
    const hood = mesh(new THREE.SphereGeometry(0.3, 16, 14, 0, Math.PI * 2, 0, Math.PI / 1.5), shade(topColor, -8));
    hood.position.set(0, 0.7, -0.12);
    hood.rotation.x = 0.32;
    const strL = mesh(new THREE.CapsuleGeometry(0.014, 0.18, 3, 8), shade(topColor, -24), {}, noOL);
    const strR = strL.clone();
    strL.position.set(-0.07, 0.38, 0.24);
    strR.position.set(0.07, 0.38, 0.24);
    strL.rotation.x = 0.45;
    strR.rotation.x = 0.45;
    const tipL = mesh(new THREE.SphereGeometry(0.022, 8, 8), shade(topColor, -36), {}, noOL);
    const tipR = tipL.clone();
    tipL.position.set(-0.07, 0.28, 0.3);
    tipR.position.set(0.07, 0.28, 0.3);
    torso.add(pocket, hood, strL, strR, tipL, tipR);
  } else if (top === "jacket") {
    const lapelL = mesh(new THREE.CapsuleGeometry(0.055, 0.28, 4, 8), shade(topColor, -20));
    const lapelR = lapelL.clone();
    lapelL.position.set(-0.15, 0.32, 0.22);
    lapelR.position.set(0.15, 0.32, 0.22);
    lapelL.rotation.z = 0.42;
    lapelR.rotation.z = -0.42;
    const collarL = mesh(new THREE.SphereGeometry(0.09, 12, 10), shade(topColor, -26));
    collarL.scale.set(0.8, 0.55, 1);
    const collarR = collarL.clone();
    collarL.position.set(-0.13, 0.5, 0.18);
    collarR.position.set(0.13, 0.5, 0.18);
    torso.add(lapelL, lapelR, collarL, collarR);
  }

  const leftArm = new THREE.Group();
  const rightArm = new THREE.Group();
  leftArm.position.set(-0.38, 0.4, 0);
  rightArm.position.set(0.38, 0.4, 0);
  const sleeveLen = top === "tshirt" ? 0.1 : 0.22;
  const sleeveL = mesh(new THREE.CapsuleGeometry(0.11, sleeveLen, 5, 12), topColor, {}, { outlineScale: 1.12 });
  const sleeveR = sleeveL.clone();
  sleeveL.position.y = -sleeveLen / 2;
  sleeveR.position.y = -sleeveLen / 2;
  leftArm.add(sleeveL);
  rightArm.add(sleeveR);
  const handY = top === "tshirt" ? -0.24 : -0.36;
  const mkHand = () => {
    const hand = mesh(new THREE.SphereGeometry(0.112, 14, 12), skin, {}, { outlineScale: 1.12 });
    hand.scale.set(1.2, 0.88, 1.4);
    return hand;
  };
  const handL = mkHand();
  const handR = mkHand();
  handL.position.y = handY;
  handR.position.y = handY;
  leftArm.add(handL);
  rightArm.add(handR);
  if (avatar.prop) {
    const prop = buildProp(avatar.prop);
    prop.scale.setScalar(1.2);
    prop.position.set(0.04, handY - 0.02, 0.1);
    rightArm.add(prop);
  }
  torso.add(leftArm, rightArm);

  const neck = mesh(new THREE.CapsuleGeometry(0.095, 0.04, 4, 10), skin);
  neck.position.y = 0.5;
  torso.add(neck);

  const head = new THREE.Group();
  head.position.y = 0.78;
  const skull = mesh(new THREE.SphereGeometry(0.3, 28, 24), skin, {}, { outlineScale: 1.12 });
  skull.scale.set(1.04, 1.0, 1.02);
  head.add(skull);

  const eyeWhite = toon("#fffef8");
  const irisC = toon("#2a160c");
  [[-0.095, 0.025, 0.245], [0.095, 0.025, 0.245]].forEach(([x, y, z], i) => {
    const w = mesh(new THREE.SphereGeometry(0.082, 16, 14), eyeWhite, {}, noOL);
    w.scale.set(1.05, 1.22, 0.58);
    w.position.set(x, y, z);
    const iris = mesh(new THREE.SphereGeometry(0.046, 14, 12), irisC, {}, noOL);
    iris.position.set(x, y - 0.006, z + 0.022);
    const pupil = mesh(new THREE.SphereGeometry(0.022, 12, 10), "#0c0604", {}, noOL);
    pupil.position.set(x, y - 0.006, z + 0.04);
    const shine = mesh(new THREE.SphereGeometry(0.022, 10, 8), "#fff", {}, noOL);
    shine.position.set(x + 0.02, y + 0.022, z + 0.052);
    const shine2 = mesh(new THREE.SphereGeometry(0.01, 8, 8), "#fff", {}, noOL);
    shine2.position.set(x - 0.018, y - 0.014, z + 0.048);
    head.add(w, iris, pupil, shine, shine2);
    const brow = mesh(new THREE.CapsuleGeometry(0.016, 0.09, 3, 8), shade(hair, 8), {}, noOL);
    brow.rotation.z = Math.PI / 2 + (i === 0 ? 0.28 : -0.28);
    brow.position.set(x, y + 0.078, z + 0.012);
    head.add(brow);
  });
  const nose = mesh(new THREE.SphereGeometry(0.036, 12, 10), shade(skin, -14), {}, noOL);
  nose.scale.set(0.88, 1.05, 1.25);
  nose.position.set(0, -0.015, 0.29);
  const mouth = mesh(new THREE.TorusGeometry(0.078, 0.018, 10, 22, Math.PI * 1.08), "#e23d55", {}, noOL);
  mouth.position.set(0, -0.1, 0.25);
  mouth.rotation.set(Math.PI * 0.9, 0, 0);
  const cheekL = mesh(new THREE.SphereGeometry(0.04, 10, 8), shade(skin, 22), {}, noOL);
  const cheekR = cheekL.clone();
  cheekL.position.set(-0.155, -0.05, 0.21);
  cheekR.position.set(0.155, -0.05, 0.21);
  head.add(nose, mouth, cheekL, cheekR);
  addHair(head, style, hair);

  if (avatar.glasses) {
    const frame = toon("#1c1c1c");
    const lens = new THREE.MeshToonMaterial({ color: "#2a2430", transparent: true, opacity: 0.38, gradientMap: getToonGradient() });
    const g1 = mesh(new THREE.TorusGeometry(0.078, 0.013, 8, 18), frame, {}, noOL);
    const g2 = g1.clone();
    g1.position.set(-0.095, 0.025, 0.262);
    g2.position.set(0.095, 0.025, 0.262);
    const l1 = mesh(new THREE.CircleGeometry(0.068, 16), lens, {}, noOL);
    const l2 = l1.clone();
    l1.position.set(-0.095, 0.025, 0.262);
    l2.position.set(0.095, 0.025, 0.262);
    const bar = mesh(new THREE.CapsuleGeometry(0.009, 0.05, 3, 6), frame, {}, noOL);
    bar.rotation.z = Math.PI / 2;
    bar.position.set(0, 0.025, 0.262);
    head.add(g1, g2, l1, l2, bar);
  }
  if (accessory === "cap") {
    const brim = mesh(new THREE.SphereGeometry(0.2, 14, 10), topColor);
    brim.scale.set(1.25, 0.2, 1.45);
    brim.position.set(0, 0.14, 0.2);
    const dome = mesh(new THREE.SphereGeometry(0.31, 16, 12, 0, Math.PI * 2, 0, Math.PI / 2), shade(topColor, -8));
    dome.position.set(0, 0.16, 0);
    head.add(brim, dome);
  } else if (accessory === "beanie") {
    const beanie = mesh(new THREE.SphereGeometry(0.315, 16, 12, 0, Math.PI * 2, 0, Math.PI / 1.55), saturate("#3d4f7c", 0.2));
    beanie.position.set(0, 0.12, -0.01);
    const pom = mesh(new THREE.SphereGeometry(0.07, 10, 8), "#fff6ea");
    pom.position.set(0, 0.38, 0);
    head.add(beanie, pom);
  } else if (accessory === "chain") {
    const chain = mesh(new THREE.TorusGeometry(0.14, 0.018, 8, 18), "#ffd24a", {}, noOL);
    chain.position.set(0, 0.42, 0.16);
    chain.rotation.x = 0.95;
    torso.add(chain);
  } else if (accessory === "headphones") {
    const band = mesh(new THREE.TorusGeometry(0.322, 0.032, 10, 24, Math.PI), hpColor);
    band.position.set(0, 0.04, 0);
    const cupL = mesh(new THREE.SphereGeometry(0.09, 14, 12), hpColor);
    cupL.scale.set(0.6, 1.18, 1.18);
    const cupR = cupL.clone();
    cupL.position.set(-0.31, 0.02, 0);
    cupR.position.set(0.31, 0.02, 0);
    const padL = mesh(new THREE.TorusGeometry(0.06, 0.018, 8, 16), shade(hpColor, -32), {}, noOL);
    padL.rotation.y = Math.PI / 2;
    const padR = padL.clone();
    padL.position.set(-0.275, 0.02, 0);
    padR.position.set(0.275, 0.02, 0);
    const innerL = mesh(new THREE.CircleGeometry(0.042, 14), "#141414", {}, noOL);
    innerL.rotation.y = Math.PI / 2;
    const innerR = innerL.clone();
    innerL.position.set(-0.258, 0.02, 0);
    innerR.position.set(0.258, 0.02, 0);
    innerR.rotation.y = -Math.PI / 2;
    head.add(band, cupL, cupR, padL, padR, innerL, innerR);
  }

  torso.add(head);
  rig.add(torso);

  group.userData = {
    rig,
    leftLeg,
    rightLeg,
    leftArm,
    rightArm,
    torso,
    head,
    shadow,
    phase: 0,
  };
  return group;
}

export function buildFurnitureMesh(type, ghost = false, ok = true) {
  const g = new THREE.Group();
  const paint = (color) => std(ghost ? (ok ? "#9cffb3" : "#ff8a8a") : color, ghost ? { transparent: true, opacity: 0.5 } : {});
  const add = (m) => {
    m.castShadow = !ghost;
    m.receiveShadow = true;
    g.add(m);
    return m;
  };
  if (type === "rug") {
    const rug = new THREE.Mesh(new THREE.BoxGeometry(1.85, 0.04, 1.85), paint("#8b4d3b"));
    rug.position.y = 0.03;
    add(rug);
    const inner = new THREE.Mesh(new THREE.BoxGeometry(1.35, 0.02, 1.35), paint("#d9c2a3"));
    inner.position.y = 0.045;
    add(inner);
  } else if (type === "plant") {
    const pot = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.17, 0.22, 10), paint("#b85c38"));
    pot.position.y = 0.12;
    add(pot);
    [[0, 0.42, 0, 0.16], [-0.1, 0.36, 0.04, 0.12], [0.1, 0.38, -0.03, 0.11]].forEach(([x, y, z, r]) => {
      const leaf = new THREE.Mesh(new THREE.SphereGeometry(r, 10, 8), paint("#3a8f5a"));
      leaf.position.set(x, y, z);
      add(leaf);
    });
  } else if (type === "lamp") {
    const base = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.16, 0.06, 12), paint("#4a4038"));
    base.position.y = 0.04;
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 1.15, 8), paint("#d8cfc4"));
    pole.position.y = 0.62;
    const shade = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.22, 0.22, 12, 1, true), paint("#f4ecd8"));
    shade.position.y = 1.22;
    add(base); add(pole); add(shade);
    if (!ghost) {
      const glow = new THREE.PointLight(0xffe3b0, 0.55, 3.2);
      glow.position.y = 1.15;
      g.add(glow);
    }
  } else if (type === "table") {
    const top = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.08, 0.78), paint("#c8a36e"));
    top.position.y = 0.72;
    add(top);
    [[-0.7, 0.35, -0.28], [0.7, 0.35, -0.28], [-0.7, 0.35, 0.28], [0.7, 0.35, 0.28]].forEach((p) => {
      const leg = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.7, 0.07), paint("#6b4a2b"));
      leg.position.set(...p);
      add(leg);
    });
  } else if (type === "coffeetable") {
    const top = new THREE.Mesh(new THREE.BoxGeometry(1.55, 0.07, 0.7), paint("#8b5a2b"));
    top.position.y = 0.32;
    add(top);
    [[-0.62, 0.15, -0.24], [0.62, 0.15, -0.24], [-0.62, 0.15, 0.24], [0.62, 0.15, 0.24]].forEach((p) => {
      const leg = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.3, 0.06), paint("#5a3a1c"));
      leg.position.set(...p);
      add(leg);
    });
    const book = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.03, 0.16), paint("#6c5cff"));
    book.position.set(-0.25, 0.38, 0.05);
    add(book);
  } else if (type === "couch") {
    const seat = new THREE.Mesh(new THREE.BoxGeometry(1.85, 0.28, 0.72), paint("#6d7c8a"));
    seat.position.y = 0.28;
    const back = new THREE.Mesh(new THREE.BoxGeometry(1.85, 0.46, 0.18), paint("#5c6b78"));
    back.position.set(0, 0.5, -0.28);
    const a1 = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.28, 0.72), paint("#5c6b78"));
    const a2 = a1.clone();
    a1.position.set(-0.86, 0.36, 0);
    a2.position.set(0.86, 0.36, 0);
    add(seat); add(back); add(a1); add(a2);
  } else if (type === "bed") {
    const frame = new THREE.Mesh(new THREE.BoxGeometry(1.85, 0.22, 2.75), paint("#d7c4a3"));
    frame.position.y = 0.22;
    const mattress = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.16, 2.55), paint("#f4efe6"));
    mattress.position.y = 0.38;
    const blanket = new THREE.Mesh(new THREE.BoxGeometry(1.68, 0.08, 1.7), paint("#7ea0c4"));
    blanket.position.set(0, 0.46, -0.2);
    const pillow = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.12, 0.4), paint("#f7f3ea"));
    pillow.position.set(0, 0.5, 1.05);
    const headboard = new THREE.Mesh(new THREE.BoxGeometry(1.85, 0.7, 0.12), paint("#b08968"));
    headboard.position.set(0, 0.55, 1.38);
    add(frame); add(mattress); add(blanket); add(pillow); add(headboard);
  } else if (type === "tv") {
    const stand = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.4, 0.5), paint("#3d342c"));
    stand.position.y = 0.22;
    const screen = new THREE.Mesh(new THREE.BoxGeometry(1.35, 0.78, 0.08), paint("#1a1c22"));
    screen.position.set(0, 0.85, 0);
    const bezel = new THREE.Mesh(new THREE.BoxGeometry(1.42, 0.84, 0.06), paint("#111"));
    bezel.position.set(0, 0.85, -0.01);
    add(stand); add(bezel); add(screen);
  } else if (type === "fridge") {
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.82, 1.55, 0.7), paint("#ece7df"));
    body.position.y = 0.78;
    const handle = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.28, 0.04), paint("#b0a89c"));
    handle.position.set(0.36, 0.95, 0.36);
    const line = new THREE.Mesh(new THREE.BoxGeometry(0.84, 0.02, 0.72), paint("#d5cfc4"));
    line.position.y = 0.95;
    add(body); add(handle); add(line);
  } else if (type === "kitchenette") {
    const counter = new THREE.Mesh(new THREE.BoxGeometry(1.85, 0.72, 0.7), paint("#d8c6a8"));
    counter.position.y = 0.38;
    const top = new THREE.Mesh(new THREE.BoxGeometry(1.88, 0.06, 0.74), paint("#8a8f96"));
    top.position.y = 0.76;
    const sink = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.04, 0.32), paint("#c5ccd3"));
    sink.position.set(-0.35, 0.8, 0);
    add(counter); add(top); add(sink);
  } else if (type === "chair") {
    const seat = new THREE.Mesh(new THREE.BoxGeometry(0.48, 0.07, 0.48), paint("#c4a06a"));
    seat.position.y = 0.42;
    const back = new THREE.Mesh(new THREE.BoxGeometry(0.48, 0.42, 0.07), paint("#b08958"));
    back.position.set(0, 0.64, -0.2);
    [[-0.18, 0.2, -0.18], [0.18, 0.2, -0.18], [-0.18, 0.2, 0.18], [0.18, 0.2, 0.18]].forEach((p) => {
      const leg = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.4, 0.05), paint("#6b4a2b"));
      leg.position.set(...p);
      add(leg);
    });
    add(seat); add(back);
  } else if (type === "bookshelf") {
    const shell = new THREE.Mesh(new THREE.BoxGeometry(1.75, 1.45, 0.38), paint("#8b5a2b"));
    shell.position.y = 0.74;
    add(shell);
    [0.4, 0.75, 1.1].forEach((y) => {
      const shelf = new THREE.Mesh(new THREE.BoxGeometry(1.65, 0.05, 0.36), paint("#a56c36"));
      shelf.position.y = y;
      add(shelf);
    });
    ["#6c5cff", "#e05656", "#3a8f5a", "#f4c15d", "#4d7cff"].forEach((col, i) => {
      const book = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.26, 0.22), paint(col));
      book.position.set(-0.6 + i * 0.28, 0.56, 0);
      add(book);
    });
  } else {
    const seat = new THREE.Mesh(new THREE.BoxGeometry(1.85, 0.28, 0.72), paint("#6d7c8a"));
    seat.position.y = 0.28;
    add(seat);
  }
  return g;
}

export function createAvatarPreview(container) {
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.shadowMap.enabled = true;
  container.innerHTML = "";
  container.appendChild(renderer.domElement);
  const scene = new THREE.Scene();
  scene.add(new THREE.HemisphereLight(0xffe8d6, 0x8899aa, 1.05));
  const sun = new THREE.DirectionalLight(0xfff1d6, 1.05);
  sun.position.set(2.2, 4.2, 3.2);
  sun.castShadow = true;
  scene.add(sun);
  const fill = new THREE.DirectionalLight(0xfff6e8, 0.45);
  fill.position.set(-2, 2, 2);
  scene.add(fill);
  const camera = new THREE.PerspectiveCamera(30, 1, 0.1, 20);
  function framePreview() {
    const w = container.clientWidth || 360;
    const h = container.clientHeight || 480;
    renderer.setSize(w, h);
    camera.aspect = w / h;
    camera.fov = 30;
    camera.position.set(2.65, 1.02, 5.15);
    camera.lookAt(0, 0.88, 0);
    camera.updateProjectionMatrix();
  }
  framePreview();
  let meshObj = buildAvatarMesh({});
  scene.add(meshObj);
  let raf = 0;
  let alive = true;
  function loop() {
    if (!alive) return;
    raf = requestAnimationFrame(loop);
    meshObj.rotation.y += 0.008;
    applyCharacterPose(meshObj.userData, performance.now() / 1000, false, false);
    renderer.render(scene, camera);
  }
  loop();
  const ro = new ResizeObserver(framePreview);
  ro.observe(container);
  return {
    setAvatar(avatar) {
      scene.remove(meshObj);
      meshObj.traverse((o) => { if (o.geometry) o.geometry.dispose(); });
      meshObj = buildAvatarMesh(avatar);
      scene.add(meshObj);
    },
    dispose() {
      alive = false;
      cancelAnimationFrame(raf);
      ro.disconnect();
      renderer.dispose();
    },
  };
}

export function createRoom3D(container) {
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.08;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.setClearColor(0xb7c4d6, 1);
  container.innerHTML = "";
  container.appendChild(renderer.domElement);
  const overlay = document.createElement("div");
  overlay.className = "bubble-layer";
  overlay.id = "bubble-layer";
  container.appendChild(overlay);

  const scene = new THREE.Scene();
  scene.fog = new THREE.Fog(0xc5b7a8, 22, 36);

  scene.add(new THREE.HemisphereLight(0xffe6c9, 0x8a9aaa, 0.7));
  scene.add(new THREE.AmbientLight(0xfff6e8, 0.28));
  const sun = new THREE.DirectionalLight(0xffe4c4, 0.95);
  sun.position.set(5.5, 10, 4.5);
  sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024);
  sun.shadow.camera.near = 1;
  sun.shadow.camera.far = 28;
  sun.shadow.camera.left = sun.shadow.camera.bottom = -9;
  sun.shadow.camera.right = sun.shadow.camera.top = 9;
  scene.add(sun);

  function frustumSize() {
    return gridSize * 0.78 + 1.7;
  }
  const camera = new THREE.OrthographicCamera(-6.4, 6.4, 6.4, -6.4, 0.1, 60);
  camera.position.set(9.5, 9.2, 9.5);
  camera.lookAt(0, 0.45, 0);

  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enablePan = false;
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  controls.minPolarAngle = Math.PI / 3.4;
  controls.maxPolarAngle = Math.PI / 2.35;
  controls.minZoom = 0.7;
  controls.maxZoom = 1.85;
  controls.target.set(0, 0.45, 0);

  const rim = new THREE.DirectionalLight(0xfff6e8, 0.55);
  rim.position.copy(camera.position);
  scene.add(rim);

  const tilesGroup = new THREE.Group();
  const wallsGroup = new THREE.Group();
  const furnitureGroup = new THREE.Group();
  const peopleGroup = new THREE.Group();
  const petsGroup = new THREE.Group();
  const gridGroup = new THREE.Group();
  scene.add(tilesGroup, wallsGroup, furnitureGroup, peopleGroup, petsGroup, gridGroup);

  let ghost = null;
  const peopleMeshes = new Map();
  const petMeshes = new Map();
  const tileMeshes = [];
  let hoverMesh = null;
  let gridSize = 6;
  let wallpaper = "paint-cream";
  let floorStyle = "wood";
  let onTileClick = null;
  let onTileHover = null;
  let onFurnitureClick = null;
  let placing = null;
  let furnitureList = [];
  let hovering = false;

  function resize() {
    const w = container.clientWidth || 800;
    const h = container.clientHeight || 500;
    renderer.setSize(w, h, false);
    const a = w / h;
    const frustum = frustumSize();
    camera.left = (-frustum * a) / 2;
    camera.right = (frustum * a) / 2;
    camera.top = frustum / 2;
    camera.bottom = -frustum / 2;
    camera.updateProjectionMatrix();
  }

  function showGrid(on) {
    gridGroup.visible = Boolean(on);
  }

  function buildFloor() {
    tilesGroup.clear();
    gridGroup.clear();
    tileMeshes.length = 0;
    const floor = new THREE.Mesh(
      new THREE.BoxGeometry(gridSize + 0.04, 0.08, gridSize + 0.04),
      new THREE.MeshStandardMaterial({
        map: makeFloorTexture(floorStyle, gridSize),
        roughness: floorStyle === "wood" ? 0.62 : 0.8,
        metalness: 0.02,
      })
    );
    floor.position.y = 0.04;
    floor.receiveShadow = true;
    tilesGroup.add(floor);

    const invis = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0,
    });
    for (let ty = 0; ty < gridSize; ty++) {
      for (let tx = 0; tx < gridSize; tx++) {
        const picker = new THREE.Mesh(new THREE.BoxGeometry(1, 0.04, 1), invis);
        const pos = tileToWorld(tx, ty, gridSize);
        picker.position.set(pos.x, 0.09, pos.z);
        picker.userData = { tile: true, tx, ty };
        tilesGroup.add(picker);
        tileMeshes.push(picker);
      }
    }

    const gridMat = new THREE.LineBasicMaterial({
      color: 0x2a2018,
      transparent: true,
      opacity: 0.22,
    });
    for (let i = 0; i <= gridSize; i++) {
      const z0 = i - gridSize / 2;
      const ptsA = [new THREE.Vector3(-gridSize / 2, 0.085, z0), new THREE.Vector3(gridSize / 2, 0.085, z0)];
      const ptsB = [new THREE.Vector3(z0, 0.085, -gridSize / 2), new THREE.Vector3(z0, 0.085, gridSize / 2)];
      gridGroup.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(ptsA), gridMat));
      gridGroup.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(ptsB), gridMat));
    }
    showGrid(Boolean(placing) || hovering);

    if (hoverMesh) tilesGroup.remove(hoverMesh);
    hoverMesh = new THREE.Mesh(
      new THREE.PlaneGeometry(0.96, 0.96),
      new THREE.MeshBasicMaterial({ color: 0xffe29a, transparent: true, opacity: 0.28 })
    );
    hoverMesh.rotation.x = -Math.PI / 2;
    hoverMesh.position.y = 0.091;
    hoverMesh.visible = false;
    tilesGroup.add(hoverMesh);
  }

  function buildWalls() {
    wallsGroup.clear();
    const tex = makeWallTexture(wallpaper);
    const mat = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.82, metalness: 0.02 });
    const trim = std("#f3eee4", { roughness: 0.45 });
    const back = new THREE.Mesh(new THREE.BoxGeometry(gridSize + 0.12, WALL_H, 0.1), mat);
    back.position.set(0, WALL_H / 2, -gridSize / 2);
    back.receiveShadow = true;
    const left = new THREE.Mesh(new THREE.BoxGeometry(0.1, WALL_H, gridSize + 0.12), mat.clone());
    left.position.set(-gridSize / 2, WALL_H / 2, 0);
    left.receiveShadow = true;
    const base1 = new THREE.Mesh(new THREE.BoxGeometry(gridSize + 0.16, 0.16, 0.14), trim);
    base1.position.set(0, 0.1, -gridSize / 2 + 0.02);
    const base2 = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.16, gridSize + 0.16), trim);
    base2.position.set(-gridSize / 2 + 0.02, 0.1, 0);
    const crown1 = new THREE.Mesh(new THREE.BoxGeometry(gridSize + 0.16, 0.08, 0.12), trim);
    crown1.position.set(0, WALL_H - 0.05, -gridSize / 2 + 0.02);
    const crown2 = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.08, gridSize + 0.16), trim);
    crown2.position.set(-gridSize / 2 + 0.02, WALL_H - 0.05, 0);
    wallsGroup.add(back, left, base1, base2, crown1, crown2);

    const frame = std("#efe8dc");
    const win = new THREE.Mesh(new THREE.BoxGeometry(1.6, 1.15, 0.08), frame);
    win.position.set(gridSize * 0.18, 1.85, -gridSize / 2 + 0.06);
    const pane = new THREE.Mesh(
      new THREE.BoxGeometry(1.38, 0.95, 0.04),
      new THREE.MeshStandardMaterial({ color: "#cfe8ff", emissive: "#ffd9a0", emissiveIntensity: 0.35, roughness: 0.2 })
    );
    pane.position.copy(win.position);
    pane.position.z += 0.03;
    const mullion = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.95, 0.05), frame);
    mullion.position.copy(pane.position);
    wallsGroup.add(win, pane, mullion);
    const windowLight = new THREE.PointLight(0xffe0b0, 0.85, 7);
    windowLight.position.set(gridSize * 0.18, 1.9, -gridSize / 2 + 0.8);
    wallsGroup.add(windowLight);

    const door = new THREE.Mesh(new THREE.BoxGeometry(0.08, 2.05, 0.85), std("#8a5a36"));
    door.position.set(-gridSize / 2 + 0.07, 1.05, gridSize * 0.22);
    const knob = new THREE.Mesh(new THREE.SphereGeometry(0.04, 8, 8), std("#e6c35c", { metalness: 0.7, roughness: 0.3 }));
    knob.position.set(-gridSize / 2 + 0.13, 1.05, gridSize * 0.22 + 0.3);
    wallsGroup.add(door, knob);
  }

  function setStyle(nextPaper, nextFloor) {
    if (nextPaper) wallpaper = nextPaper;
    if (nextFloor) floorStyle = nextFloor;
    buildFloor();
    buildWalls();
  }

  function setGridSize(n) {
    const next = Number(n) || 6;
    gridSize = next;
    buildFloor();
    buildWalls();
    resize();
  }

  function setFurniture(list) {
    furnitureList = list || [];
    furnitureGroup.clear();
    furnitureList.forEach((f) => addFurniture(f, true));
  }

  function addFurniture(f, skipPush) {
    if (!skipPush && !furnitureList.some((x) => x.id === f.id)) furnitureList.push(f);
    const [w, h] = furnSize(f.type);
    const m = buildFurnitureMesh(f.type, false);
    const c = footprintCenter(f.x, f.y, w, h, gridSize);
    m.position.set(c.x, 0, c.z);
    m.userData = { furnitureId: f.id, type: f.type };
    furnitureGroup.add(m);
  }

  function setGhost(type, tx, ty, ok) {
    if (ghost) {
      furnitureGroup.remove(ghost);
      ghost = null;
    }
    if (!type) return;
    const [w, h] = furnSize(type);
    ghost = buildFurnitureMesh(type, true, ok);
    const c = footprintCenter(tx, ty, w, h, gridSize);
    ghost.position.set(c.x, 0.02, c.z);
    furnitureGroup.add(ghost);
  }

  function syncPeople(people) {
    const seen = new Set();
    for (const p of people) {
      seen.add(p.username);
      let m = peopleMeshes.get(p.username);
      const av = { ...(p.avatar || {}), prop: p.heldProp || p.avatar?.prop || null };
      const sig = JSON.stringify(av) + "|" + (p.activePet || "");
      if (!m || m.userData.sig !== sig) {
        if (m) peopleGroup.remove(m);
        m = buildAvatarMesh(av);
        m.userData.sig = sig;
        peopleMeshes.set(p.username, m);
        peopleGroup.add(m);
      }
      const pos = tileToWorld(p.x, p.y, gridSize);
      m.position.set(pos.x, 0, pos.z);
      m.userData.walking = Boolean(p.walking);
      m.userData.sitting = Boolean(p.sitting);
      m.userData.phase = m.userData.phase || (p.username.length % 5);
      m.userData.activePet = p.activePet || null;
      if (p.walking && (p.dirX != null || p.dirZ != null)) {
        m.rotation.y = Math.atan2(p.dirX || 0, p.dirZ || 1);
      } else {
        m.rotation.y = Math.atan2(camera.position.x - m.position.x, camera.position.z - m.position.z);
      }
      if (p.activePet) {
        let pet = petMeshes.get(p.username);
        if (!pet || pet.userData.kind !== p.activePet) {
          if (pet) petsGroup.remove(pet);
          pet = buildPetMesh(p.activePet);
          pet.userData.kind = p.activePet;
          petMeshes.set(p.username, pet);
          petsGroup.add(pet);
          pet.position.set(pos.x - 0.45, 0, pos.z - 0.35);
        }
        pet.userData.target = new THREE.Vector3(pos.x - Math.sin(m.rotation.y) * 0.5, 0, pos.z - Math.cos(m.rotation.y) * 0.5);
      }
    }
    for (const [name, m] of peopleMeshes) {
      if (!seen.has(name)) {
        peopleGroup.remove(m);
        peopleMeshes.delete(name);
      }
    }
    for (const [name, pet] of petMeshes) {
      const owner = peopleMeshes.get(name);
      if (!seen.has(name) || !owner?.userData.activePet) {
        petsGroup.remove(pet);
        petMeshes.delete(name);
      }
    }
  }

  function projectHead(username) {
    const m = peopleMeshes.get(username);
    if (!m) return null;
    const v = new THREE.Vector3();
    if (m.userData.head) {
      v.set(0, 0.78, 0);
      m.userData.head.localToWorld(v);
    } else {
      v.set(0, m.userData.sitting ? 1.72 : 2.35, 0);
      m.localToWorld(v);
    }
    v.project(camera);
    const w = container.clientWidth;
    const h = container.clientHeight;
    return { x: (v.x * 0.5 + 0.5) * w, y: (-v.y * 0.5 + 0.5) * h, visible: v.z < 1 };
  }

  const raycaster = new THREE.Raycaster();
  const pointer = new THREE.Vector2();

  function pick(event, list) {
    const rect = renderer.domElement.getBoundingClientRect();
    pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
    raycaster.setFromCamera(pointer, camera);
    return raycaster.intersectObjects(list, true)[0] || null;
  }

  function tileFromEvent(event) {
    const hit = pick(event, tileMeshes);
    if (!hit) return null;
    let obj = hit.object;
    while (obj && !obj.userData.tile) obj = obj.parent;
    return obj?.userData.tile ? { tx: obj.userData.tx, ty: obj.userData.ty } : null;
  }

  let downPt = null;
  renderer.domElement.addEventListener("pointerdown", (e) => {
    downPt = { x: e.clientX, y: e.clientY };
  });
  renderer.domElement.addEventListener("pointerup", (e) => {
    if (!downPt) return;
    const moved = Math.hypot(e.clientX - downPt.x, e.clientY - downPt.y);
    downPt = null;
    if (moved > 7) return;
    const furnHit = pick(e, furnitureGroup.children);
    if (furnHit && !placing) {
      let obj = furnHit.object;
      while (obj && !obj.userData.furnitureId) obj = obj.parent;
      if (obj?.userData.furnitureId) {
        onFurnitureClick?.(obj.userData.furnitureId, obj.userData.type);
        return;
      }
    }
    const tile = tileFromEvent(e);
    if (tile) onTileClick?.(tile.tx, tile.ty);
  });
  renderer.domElement.addEventListener("pointermove", (e) => {
    const tile = tileFromEvent(e);
    hovering = Boolean(tile);
    showGrid(Boolean(placing) || hovering);
    if (hoverMesh) {
      if (tile) {
        const pos = tileToWorld(tile.tx, tile.ty, gridSize);
        hoverMesh.position.set(pos.x, 0.091, pos.z);
        hoverMesh.visible = true;
      } else hoverMesh.visible = false;
    }
    if (placing && tile) onTileHover?.(tile.tx, tile.ty);
  });
  renderer.domElement.addEventListener("pointerleave", () => {
    hovering = false;
    if (!placing) showGrid(false);
    if (hoverMesh) hoverMesh.visible = false;
  });

  let raf = 0;
  let alive = true;
  function loop() {
    if (!alive) return;
    raf = requestAnimationFrame(loop);
    const t = performance.now() / 1000;
    for (const m of peopleMeshes.values()) {
      applyCharacterPose(m.userData, t, m.userData.walking, m.userData.sitting);
    }
    for (const pet of petMeshes.values()) {
      if (pet.userData.target) {
        pet.position.lerp(pet.userData.target, 0.08);
        const d = pet.userData.target.clone().sub(pet.position);
        if (d.lengthSq() > 0.0004) pet.rotation.y = Math.atan2(d.x, d.z);
      }
      pet.position.y = Math.abs(Math.sin(t * 6)) * 0.02;
    }
    rim.position.copy(camera.position);
    controls.update();
    renderer.render(scene, camera);
  }

  resize();
  setStyle(wallpaper, floorStyle);
  loop();
  const ro = new ResizeObserver(resize);
  ro.observe(container);

  const api = {
    ready: true,
    resize,
    setStyle,
    setGridSize,
    setFurniture,
    addFurniture,
    getFurniture() { return furnitureList.slice(); },
    setGhost,
    syncPeople,
    projectHead,
    overlay,
    onTileClick(fn) { onTileClick = fn; },
    onTileHover(fn) { onTileHover = fn; },
    onFurnitureClick(fn) { onFurnitureClick = fn; },
    setZoom(z) {
      camera.zoom = Number(z) || 1;
      camera.updateProjectionMatrix();
    },
    setPlacing(type) {
      placing = type;
      showGrid(Boolean(type) || hovering);
      if (!type) setGhost(null);
    },
    simulateTileClick(tx, ty) { onTileClick?.(tx, ty); },
    clear() {
      setFurniture([]);
      syncPeople([]);
      setGhost(null);
    },
    dispose() {
      alive = false;
      cancelAnimationFrame(raf);
      ro.disconnect();
      controls.dispose();
      renderer.dispose();
    },
  };
  window.HouseRoom3D = api;
  window.__clickTile = (x, y) => api.simulateTileClick(x, y);
  return api;
}
