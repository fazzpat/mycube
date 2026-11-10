import * as THREE from "three";
import { OrbitControls } from "../vendor/OrbitControls.js";
import { drawCubeChannel, programAt } from "./cubechannel.js";
import { drawCubics } from "./cubics.js";
import { drawWallArt } from "./wallart.js";

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

function furnDims(type, rot) {
  const [w, h] = furnSize(type);
  const r = ((Number(rot) || 0) % 4 + 4) % 4;
  return r % 2 === 1 ? [h, w] : [w, h];
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

function resetLimbRot(ud) {
  for (const part of [ud.leftArm, ud.rightArm, ud.leftLeg, ud.rightLeg]) {
    if (part) part.rotation.set(0, 0, 0);
  }
  if (ud.rig) {
    ud.rig.position.y = 0;
    ud.rig.rotation.set(0, 0, 0);
    ud.rig.scale.set(1, 1, 1);
  }
}

function hideEmoteVfx(ud) {
  if (ud?.vfx) {
    ud.vfx.parent?.remove(ud.vfx);
    ud.vfx.traverse((o) => { if (o.geometry) o.geometry.dispose(); });
    ud.vfx = null;
    ud.vfxKind = null;
  }
}

function ensureEmoteVfx(ud, kind, make) {
  if (ud.vfx && ud.vfxKind === kind) return ud.vfx;
  hideEmoteVfx(ud);
  const g = new THREE.Group();
  ud.vfx = g;
  ud.vfxKind = kind;
  make(g);
  const root = ud.rig?.parent;
  if (root) root.add(g);
  return g;
}

function updateTearVfx(ud, local) {
  const g = ensureEmoteVfx(ud, "cry", (group) => {
    for (let i = 0; i < 4; i++) {
      const drop = new THREE.Mesh(
        new THREE.SphereGeometry(0.035, 8, 8),
        new THREE.MeshBasicMaterial({ color: 0x7ec8ff, transparent: true, opacity: 0.9 })
      );
      drop.userData.phase = i * 0.22;
      group.add(drop);
    }
  });
  g.position.set(0.08, 1.42, 0.16);
  for (const drop of g.children) {
    const u = ((local + drop.userData.phase) % 0.9) / 0.9;
    drop.position.set((drop.userData.phase - 0.3) * 0.15, -u * 0.45, 0.04);
    drop.scale.setScalar(1 - u * 0.4);
    drop.material.opacity = 0.95 - u * 0.7;
  }
}

function updateHeartVfx(ud, local) {
  const g = ensureEmoteVfx(ud, "heart", (group) => {
    for (let i = 0; i < 5; i++) {
      const h = new THREE.Mesh(
        new THREE.SphereGeometry(0.05, 8, 8),
        new THREE.MeshBasicMaterial({ color: 0xef476f, transparent: true, opacity: 0.95 })
      );
      h.userData.phase = i * 0.18;
      group.add(h);
    }
  });
  g.position.set(0, 1.35, 0.1);
  for (const h of g.children) {
    const u = ((local + h.userData.phase) % 1.2) / 1.2;
    h.position.set(Math.sin((h.userData.phase + local) * 3) * 0.2, u * 0.7, 0.05);
    h.scale.setScalar(1.1 - u * 0.6);
    h.material.opacity = 0.95 - u * 0.85;
  }
}

function applyActionEmote(ud, t) {
  const kind = ud.actionEmote;
  if (!kind) {
    hideEmoteVfx(ud);
    return false;
  }
  const at = ud.actionEmoteAt || 0;
  const local = Math.max(0, t - at / 1000);
  resetLimbRot(ud);
  if (kind === "wave") {
    const s = Math.sin(local * 10);
    ud.rig.rotation.z = s * 0.08;
    if (ud.rightArm) {
      ud.rightArm.rotation.x = -2.15;
      ud.rightArm.rotation.z = 0.25 + s * 0.85;
    }
    if (ud.leftArm) ud.leftArm.rotation.x = 0.25;
    return true;
  }
  if (kind === "dance") {
    const s = Math.sin(local * 10);
    const b = Math.abs(s);
    ud.rig.position.y = b * 0.22;
    ud.rig.rotation.z = s * 0.22;
    ud.rig.rotation.y = Math.sin(local * 5) * 0.25;
    applySquash(ud.rig, b);
    if (ud.leftArm) { ud.leftArm.rotation.x = -2.0 + s * 0.5; ud.leftArm.rotation.z = 0.4; }
    if (ud.rightArm) { ud.rightArm.rotation.x = -2.0 - s * 0.5; ud.rightArm.rotation.z = -0.4; }
    if (ud.leftLeg) ud.leftLeg.rotation.x = s * 0.9;
    if (ud.rightLeg) ud.rightLeg.rotation.x = -s * 0.9;
    return true;
  }
  if (kind === "cry") {
    const sob = Math.sin(local * 6);
    ud.rig.position.y = -0.04;
    ud.rig.rotation.z = 0.12 + sob * 0.04;
    if (ud.leftArm) { ud.leftArm.rotation.x = -1.6; ud.leftArm.rotation.z = -0.7; }
    if (ud.rightArm) { ud.rightArm.rotation.x = -1.6; ud.rightArm.rotation.z = 0.7; }
    updateTearVfx(ud, local);
    return true;
  }
  if (kind === "laugh") {
    const sh = Math.sin(local * 18);
    ud.rig.position.y = Math.abs(sh) * 0.08;
    ud.rig.rotation.z = sh * 0.18;
    applySquash(ud.rig, 0.3 + Math.abs(sh) * 0.4);
    if (ud.leftArm) { ud.leftArm.rotation.x = -1.3; ud.leftArm.rotation.z = 0.5; }
    if (ud.rightArm) { ud.rightArm.rotation.x = -0.4; ud.rightArm.rotation.z = -0.2; }
    return true;
  }
  if (kind === "clap") {
    const c = Math.abs(Math.sin(local * 12));
    if (ud.leftArm) { ud.leftArm.rotation.x = -1.35; ud.leftArm.rotation.y = 0.7 - c * 0.55; }
    if (ud.rightArm) { ud.rightArm.rotation.x = -1.35; ud.rightArm.rotation.y = -0.7 + c * 0.55; }
    ud.rig.rotation.z = (c - 0.5) * 0.08;
    return true;
  }
  if (kind === "shrug") {
    const k = Math.min(1, local / 0.18);
    if (ud.leftArm) { ud.leftArm.rotation.z = 1.15 * k; ud.leftArm.rotation.x = -0.2; }
    if (ud.rightArm) { ud.rightArm.rotation.z = -1.15 * k; ud.rightArm.rotation.x = -0.2; }
    ud.rig.position.y = 0.06 * k;
    return true;
  }
  if (kind === "heart") {
    const s = Math.sin(local * 6);
    if (ud.leftArm) { ud.leftArm.rotation.x = -1.7; ud.leftArm.rotation.z = -0.9; ud.leftArm.rotation.y = 0.4; }
    if (ud.rightArm) { ud.rightArm.rotation.x = -1.7; ud.rightArm.rotation.z = 0.9; ud.rightArm.rotation.y = -0.4; }
    ud.rig.position.y = 0.04 + Math.abs(s) * 0.05;
    updateHeartVfx(ud, local);
    return true;
  }
  if (kind === "cheer") {
    const s = Math.sin(local * 9);
    ud.rig.position.y = Math.abs(s) * 0.2;
    applySquash(ud.rig, Math.abs(s));
    if (ud.leftArm) { ud.leftArm.rotation.x = -2.5; ud.leftArm.rotation.z = 0.35; }
    if (ud.rightArm) { ud.rightArm.rotation.x = -2.5; ud.rightArm.rotation.z = -0.35; }
    if (ud.leftLeg) ud.leftLeg.rotation.x = s * 0.4;
    if (ud.rightLeg) ud.rightLeg.rotation.x = -s * 0.4;
    return true;
  }
  return false;
}

function applyCharacterPose(ud, t, walking, sitting) {
  if (!ud?.rig) return;
  const phase = ud.phase || 0;
  if (ud.boxing) {
    const tHit = Math.max(0, (Date.now() - (ud.boxing.lastHitAt || 0)) / 1000);
    const bounce = Math.abs(Math.sin(t * 8 + phase));
    ud.rig.position.y = 0.07 + bounce * 0.07;
    ud.rig.rotation.z = Math.sin(t * 8 + phase) * 0.05;
    ud.rig.scale.set(1, 1, 1);
    if (ud.leftLeg) ud.leftLeg.rotation.x = 0.35;
    if (ud.rightLeg) ud.rightLeg.rotation.x = -0.2;
    if (ud.leftArm) { ud.leftArm.rotation.x = -1.15; ud.leftArm.rotation.y = 0.35; }
    if (ud.rightArm) { ud.rightArm.rotation.x = -1.15; ud.rightArm.rotation.y = -0.35; }
    if (tHit < 0.32 && ud.rightArm) {
      const k = Math.sin((tHit / 0.32) * Math.PI);
      const mv = ud.boxing.move;
      if (mv === "hook") {
        ud.rightArm.rotation.y = -0.35 + k * 1.35;
        ud.rightArm.rotation.x = -1.15 + k * 0.3;
      } else if (mv === "uppercut") {
        ud.rightArm.rotation.x = -1.15 + k * 1.55;
        ud.rightArm.rotation.y = -0.15;
      } else {
        ud.rightArm.rotation.x = -1.15 - k * 0.85;
        ud.rightArm.rotation.z = k * 0.2;
      }
    }
    return;
  }
  if (ud.gym?.type === "treadmill") {
    const s = Math.sin(t * 11 + phase);
    ud.rig.position.y = Math.abs(s) * 0.1;
    ud.rig.rotation.z = s * 0.06;
    applySquash(ud.rig, Math.abs(s));
    if (ud.leftLeg) ud.leftLeg.rotation.x = s * 1.05;
    if (ud.rightLeg) ud.rightLeg.rotation.x = -s * 1.05;
    if (ud.leftArm) ud.leftArm.rotation.x = -s * 0.7;
    if (ud.rightArm) ud.rightArm.rotation.x = s * 0.7;
    return;
  }
  if (ud.gym?.type === "benchpress") {
    const tRep = Math.max(0, (Date.now() - (ud.gym.lastRepAt || 0)) / 1000);
    const k = tRep < 0.5 ? Math.sin((tRep / 0.5) * Math.PI) : 0;
    ud.rig.position.y = -0.22;
    ud.rig.rotation.z = 0;
    ud.rig.scale.set(1, 1, 1);
    if (ud.leftLeg) ud.leftLeg.rotation.x = -1.2;
    if (ud.rightLeg) ud.rightLeg.rotation.x = -1.2;
    if (ud.leftArm) ud.leftArm.rotation.x = -2.2 + k * 1.4;
    if (ud.rightArm) ud.rightArm.rotation.x = -2.2 + k * 1.4;
    return;
  }
  if (ud.heldItem && ud.rightArm) {
    const dur = ud.heldItem.kind === "sandwich" ? 7500 : ud.heldItem.kind === "soda" ? 6500 : ud.heldItem.kind === "coffee" ? 10800 : 6000;
    const elapsed = Math.max(0, Date.now() - (ud.heldItem.startedAt || 0));
    const cycleMs = ud.heldItem.kind === "coffee" ? 1800 : 1600;
    const cycle = (elapsed % cycleMs) / cycleMs;
    const sip = Math.sin(Math.min(1, cycle * 1.4) * Math.PI) * (cycle < 0.7 ? 1 : 0);
    if (walking) {
      const s = Math.sin(t * 9.4 + phase);
      ud.rig.position.y = Math.abs(s) * 0.13;
      ud.rig.rotation.z = s * 0.09;
      applySquash(ud.rig, Math.abs(s));
      if (ud.leftLeg) ud.leftLeg.rotation.x = s * 0.95;
      if (ud.rightLeg) ud.rightLeg.rotation.x = -s * 0.95;
      if (ud.leftArm) ud.leftArm.rotation.x = -s * 0.6;
    } else if (sitting) {
      ud.rig.position.y = -0.16;
      ud.rig.rotation.z = 0;
      ud.rig.scale.set(1, 1, 1);
      if (ud.leftLeg) ud.leftLeg.rotation.x = -1.15;
      if (ud.rightLeg) ud.rightLeg.rotation.x = -1.15;
      if (ud.leftArm) ud.leftArm.rotation.x = 0.18;
    } else {
      const wave = Math.sin(t * 2.8 + phase);
      ud.rig.position.y = Math.abs(wave) * 0.08;
      ud.rig.rotation.z = wave * 0.05;
      ud.rig.scale.set(1, 1, 1);
      if (ud.leftLeg) ud.leftLeg.rotation.x = wave * 0.12;
      if (ud.rightLeg) ud.rightLeg.rotation.x = -wave * 0.12;
      if (ud.leftArm) ud.leftArm.rotation.x = 0.15;
    }
    ud.rightArm.rotation.x = -0.5 - sip * 1.3;
    ud.rightArm.rotation.y = -0.15;
    if (ud.heldFood) {
      const bites = Math.min(4, Math.floor(elapsed / (dur / 4)));
      if (ud.heldItem.kind === "sandwich") ud.heldFood.scale.setScalar(Math.max(0.2, 1 - bites * 0.22));
      if (ud.heldItem.kind === "soda" && elapsed > dur - 800) ud.heldFood.scale.set(1, Math.max(0.3, 1 - (elapsed - (dur - 800)) / 800), 1);
    }
    return;
  }
  if (sitting && !ud.actionEmote) {
    resetLimbRot(ud);
    ud.rig.position.y = -0.16;
    if (ud.leftLeg) ud.leftLeg.rotation.x = -1.15;
    if (ud.rightLeg) ud.rightLeg.rotation.x = -1.15;
    if (ud.leftArm) ud.leftArm.rotation.x = 0.18;
    if (ud.rightArm) ud.rightArm.rotation.x = 0.18;
    hideEmoteVfx(ud);
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
    hideEmoteVfx(ud);
    return;
  }
  if (applyActionEmote(ud, t)) return;
  resetLimbRot(ud);
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

function buildHeldItem(kind) {
  const g = new THREE.Group();
  if (kind === "sandwich") {
    const loaf = mesh(new THREE.BoxGeometry(0.11, 0.07, 0.11), "#e6c27a");
    const filling = mesh(new THREE.BoxGeometry(0.1, 0.025, 0.1), "#7bc47f");
    filling.position.y = 0.01;
    const top = mesh(new THREE.BoxGeometry(0.11, 0.03, 0.11), "#d9a85c");
    top.position.y = 0.04;
    g.add(loaf, filling, top);
  } else if (kind === "soda") {
    const can = mesh(new THREE.CylinderGeometry(0.032, 0.032, 0.1, 12), "#ff3b4e");
    const top = mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.01, 12), "#d0d4da");
    top.position.y = 0.055;
    const tab = mesh(new THREE.BoxGeometry(0.02, 0.004, 0.012), "#c5c9ce");
    tab.position.set(0, 0.062, 0.008);
    g.add(can, top, tab);
  } else if (kind === "coffee") {
    const cup = mesh(new THREE.CylinderGeometry(0.04, 0.035, 0.07, 12), "#fff8f0");
    const coffee = mesh(new THREE.CylinderGeometry(0.032, 0.032, 0.02, 10), "#3d2314");
    coffee.position.y = 0.028;
    const handle = mesh(new THREE.TorusGeometry(0.025, 0.006, 6, 10, Math.PI), "#fff8f0");
    handle.rotation.y = Math.PI / 2;
    handle.position.x = 0.04;
    g.add(cup, coffee, handle);
  } else {
    const bottle = mesh(new THREE.CylinderGeometry(0.028, 0.032, 0.12, 12), "#cfefff");
    bottle.material.transparent = true;
    bottle.material.opacity = 0.55;
    const cap = mesh(new THREE.CylinderGeometry(0.018, 0.018, 0.02, 10), "#3d7cff");
    cap.position.y = 0.07;
    const water = mesh(new THREE.CylinderGeometry(0.024, 0.028, 0.08, 12), "#7ec8ff");
    water.position.y = -0.01;
    g.add(water, bottle, cap);
  }
  return g;
}

function buildGlove() {
  const g = new THREE.Group();
  const puff = mesh(new THREE.SphereGeometry(0.09, 12, 10), "#e23c3c");
  puff.scale.set(1.15, 0.85, 1.25);
  const cuff = mesh(new THREE.CylinderGeometry(0.05, 0.055, 0.05, 10), "#f4f0ea");
  cuff.position.y = -0.07;
  g.add(puff, cuff);
  return g;
}

function buildPetMesh(kind) {
  const root = new THREE.Group();
  const rig = new THREE.Group();
  root.add(rig);
  const colors = { cat: "#e8c07a", dog: "#c68642", bunny: "#f3e6da" };
  const col = colors[kind] || colors.cat;
  const body = mesh(new THREE.SphereGeometry(kind === "dog" ? 0.16 : 0.13, 12, 10), col);
  body.position.y = kind === "dog" ? 0.22 : 0.2;
  body.scale.set(1.15, 0.85, 1.4);
  const head = new THREE.Group();
  head.position.set(0, kind === "dog" ? 0.34 : 0.32, 0.14);
  const skull = mesh(new THREE.SphereGeometry(0.11, 12, 10), col);
  head.add(skull);
  const earGeo = kind === "bunny"
    ? new THREE.CapsuleGeometry(0.025, 0.16, 4, 8)
    : new THREE.ConeGeometry(0.04, kind === "dog" ? 0.08 : 0.1, 8);
  const e1 = mesh(earGeo, shade(col, -15));
  const e2 = e1.clone();
  if (kind === "bunny") {
    e1.position.set(-0.05, 0.2, 0);
    e2.position.set(0.05, 0.2, 0);
  } else if (kind === "dog") {
    e1.position.set(-0.07, 0.08, 0);
    e2.position.set(0.07, 0.08, 0);
    e1.rotation.z = 0.6;
    e2.rotation.z = -0.6;
  } else {
    e1.position.set(-0.06, 0.1, 0.02);
    e2.position.set(0.06, 0.1, 0.02);
  }
  head.add(e1, e2);
  const eyeL = mesh(new THREE.SphereGeometry(0.018, 8, 8), "#2a160c");
  const eyeR = eyeL.clone();
  eyeL.position.set(-0.04, 0.02, 0.09);
  eyeR.position.set(0.04, 0.02, 0.09);
  head.add(eyeL, eyeR);
  const nose = mesh(new THREE.SphereGeometry(0.02, 6, 6), "#ff8fab");
  nose.position.set(0, -0.02, 0.1);
  head.add(nose);
  const tail = mesh(
    kind === "bunny" ? new THREE.SphereGeometry(0.045, 8, 8) : new THREE.SphereGeometry(0.04, 8, 8),
    kind === "bunny" ? "#fff" : shade(col, -20)
  );
  tail.position.set(0, 0.22, -0.18);
  const mkLeg = (x, z) => {
    const leg = new THREE.Group();
    leg.position.set(x, 0.12, z);
    const bone = mesh(new THREE.CapsuleGeometry(0.03, 0.08, 4, 8), shade(col, -10));
    bone.position.y = -0.06;
    leg.add(bone);
    return leg;
  };
  const fl = mkLeg(-0.07, 0.08);
  const fr = mkLeg(0.07, 0.08);
  const bl = mkLeg(-0.07, -0.08);
  const br = mkLeg(0.07, -0.08);
  rig.add(body, head, tail, fl, fr, bl, br);
  root.userData = {
    kind, rig, body, head, tail, ears: [e1, e2], eyes: [eyeL, eyeR],
    legs: [fl, fr, bl, br], sitting: false, phase: (kind || "cat").length,
  };
  return root;
}

function applyPetPose(ud, t, walking, sitting) {
  if (!ud?.rig) return;
  const phase = ud.phase || 0;
  const [fl, fr, bl, br] = ud.legs || [];
  if (sitting) {
    ud.rig.position.y = -0.02;
    if (ud.body) {
      ud.body.rotation.x = 0.55;
      ud.body.position.y = (ud.kind === "dog" ? 0.16 : 0.14);
      ud.body.scale.set(1.25, 0.8, 1.2);
    }
    if (ud.head) ud.head.position.y = (ud.kind === "dog" ? 0.26 : 0.24);
    if (bl) { bl.rotation.x = 1.15; bl.position.y = 0.07; }
    if (br) { br.rotation.x = 1.15; br.position.y = 0.07; }
    if (fl) { fl.rotation.x = 0.35; fl.position.y = 0.08; }
    if (fr) { fr.rotation.x = 0.35; fr.position.y = 0.08; }
    if (ud.tail) ud.tail.rotation.y = Math.sin(t * 8 + phase) * 0.55;
    if (ud.ears) {
      const twitch = Math.sin(t * 3.2 + phase);
      const pulse = (Math.sin(t * 1.7 + phase * 2) > 0.85) ? 0.25 : 0;
      ud.ears[0].rotation.z = (ud.kind === "dog" ? 0.6 : 0) - twitch * 0.12 - pulse;
      ud.ears[1].rotation.z = (ud.kind === "dog" ? -0.6 : 0) + twitch * 0.12 + pulse;
    }
    if (ud.eyes) {
      const blink = ((Math.floor(t * 2 + phase * 3) % 11) === 0);
      ud.eyes.forEach((e) => e.scale.set(1, blink ? 0.12 : 1, 1));
    }
    return;
  }
  if (ud.body) {
    ud.body.rotation.x = 0;
    ud.body.position.y = ud.kind === "dog" ? 0.22 : 0.2;
    ud.body.scale.set(1.15, 0.85, 1.4);
  }
  if (ud.head) ud.head.position.y = ud.kind === "dog" ? 0.34 : 0.32;
  ud.rig.position.y = walking ? Math.abs(Math.sin(t * 10)) * 0.03 : 0;
  const s = walking ? Math.sin(t * 10 + phase) * 0.7 : Math.sin(t * 2.2 + phase) * 0.08;
  if (fl) { fl.rotation.x = s; fl.position.y = 0.12; }
  if (br) { br.rotation.x = s; br.position.y = 0.12; }
  if (fr) { fr.rotation.x = -s; fr.position.y = 0.12; }
  if (bl) { bl.rotation.x = -s; bl.position.y = 0.12; }
  if (ud.tail) ud.tail.rotation.y = Math.sin(t * (walking ? 10 : 3) + phase) * (walking ? 0.4 : 0.2);
  if (ud.eyes) ud.eyes.forEach((e) => e.scale.set(1, 1, 1));
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
  if (avatar.boxing) {
    const gL = buildGlove();
    const gR = buildGlove();
    gL.position.set(0, handY - 0.02, 0.04);
    gR.position.set(0, handY - 0.02, 0.04);
    leftArm.add(gL);
    rightArm.add(gR);
  } else if (avatar.heldItem) {
    const food = buildHeldItem(avatar.heldItem.kind);
    food.position.set(0.04, handY - 0.02, 0.1);
    rightArm.add(food);
    // stored later on userData via group
    group.userData._heldFoodTmp = food;
  } else if (avatar.prop) {
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
    heldFood: group.userData._heldFoodTmp || null,
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
    [-0.42, 0.42].forEach((x, i) => {
      const hit = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.4, 0.7), new THREE.MeshBasicMaterial({ visible: false }));
      hit.position.set(x, 0.4, 0.05);
      hit.userData.seat = i;
      g.add(hit);
    });
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
    const bezel = new THREE.Mesh(new THREE.BoxGeometry(1.42, 0.84, 0.08), paint("#111"));
    bezel.position.set(0, 0.85, 0);
    let screenMat;
    if (ghost) screenMat = paint("#1a1c22");
    else {
      const canvas = document.createElement("canvas");
      canvas.width = 512; canvas.height = 288;
      const ctx = canvas.getContext("2d");
      ctx.fillStyle = "#151820";
      ctx.fillRect(0, 0, 512, 288);
      const tex = new THREE.CanvasTexture(canvas);
      tex.colorSpace = THREE.SRGBColorSpace;
      screenMat = new THREE.MeshStandardMaterial({
        map: tex, emissive: "#ffffff", emissiveMap: tex, emissiveIntensity: 0.15, roughness: 0.35,
      });
      g.userData.tvCanvas = canvas;
      g.userData.tvCtx = ctx;
      g.userData.tvTex = tex;
    }
    const screen = new THREE.Mesh(new THREE.BoxGeometry(1.28, 0.7, 0.04), screenMat);
    screen.position.set(0, 0.85, 0.05);
    add(stand); add(bezel); add(screen);
    g.userData.screen = screen;
  } else if (type === "fridge") {
    const cab = new THREE.Mesh(new THREE.BoxGeometry(0.78, 1.55, 0.7), paint("#e8e2d8"));
    cab.position.y = 0.78;
    add(cab);
    // interior
    const inner = new THREE.Mesh(new THREE.BoxGeometry(0.62, 1.35, 0.5), paint("#f7f3ea"));
    inner.position.set(0.02, 0.78, 0.02);
    add(inner);
    const glow = new THREE.PointLight(0xfff2c8, 0, 1.8);
    glow.position.set(0, 1.0, 0.15);
    g.add(glow);
    g.userData.fridgeLight = glow;
    const shelf = (y) => {
      const s = new THREE.Mesh(new THREE.BoxGeometry(0.56, 0.03, 0.46), paint("#d9d3c8"));
      s.position.set(0.02, y, 0.02);
      add(s);
    };
    shelf(0.45); shelf(0.85); shelf(1.2);
    const sandwich = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.08, 0.16), paint("#e6c27a"));
    sandwich.position.set(-0.12, 0.92, 0.05);
    const can = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.14, 10), paint("#ff3b4e"));
    can.position.set(0.14, 0.94, 0.08);
    const bottle = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.045, 0.18, 10), paint("#9bd7ff"));
    bottle.position.set(0.02, 0.56, 0.08);
    add(sandwich); add(can); add(bottle);
    const door = new THREE.Group();
    door.position.set(0.39, 0.78, 0.36);
    const doorMesh = new THREE.Mesh(new THREE.BoxGeometry(0.08, 1.55, 0.72), paint("#ece7df"));
    doorMesh.position.set(0, 0, -0.36);
    door.add(doorMesh);
    const handle = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.28, 0.04), paint("#b0a89c"));
    handle.position.set(0.07, 0.17, -0.08);
    door.add(handle);
    [[ -0.02, 0.35, -0.2, "#7c5cff"], [ -0.02, 0.15, -0.5, "#ff7a59"], [ -0.02, -0.2, -0.3, "#f4c15d"]].forEach(([x,y,z,c]) => {
      const mag = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.1, 0.1), paint(c));
      mag.position.set(x, y, z);
      door.add(mag);
    });
    g.add(door);
    g.userData.door = door;
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
    const hit = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.4, 0.5), new THREE.MeshBasicMaterial({ visible: false }));
    hit.position.set(0, 0.5, 0);
    hit.userData.seat = 0;
    g.add(hit);
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
  } else if (type === "chesstable") {
    const top = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.1, 1.7), paint("#8b5a2b"));
    top.position.y = 0.7;
    add(top);
    [[-0.7, 0.35, -0.7], [0.7, 0.35, -0.7], [-0.7, 0.35, 0.7], [0.7, 0.35, 0.7]].forEach((p) => {
      const leg = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.7, 0.1), paint("#6b4220"));
      leg.position.set(...p);
      add(leg);
    });
    const boardRoot = new THREE.Group();
    boardRoot.position.y = 0.76;
    for (let r = 0; r < 8; r++) {
      for (let c = 0; c < 8; c++) {
        const light = (r + c) % 2 === 0;
        const sq = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.02, 0.18), paint(light ? "#f3eadc" : "#3d2c29"));
        sq.position.set((c - 3.5) * 0.18, 0, (r - 3.5) * 0.18);
        boardRoot.add(sq);
      }
    }
    g.add(boardRoot);
    const mkStool = (z, seat) => {
      const st = new THREE.Group();
      const pad = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.07, 12), paint("#c4a06a"));
      pad.position.y = 0.42;
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.4, 8), paint("#6b4220"));
      pole.position.y = 0.2;
      st.add(pad, pole);
      st.position.set(0, 0, z);
      st.userData.seat = seat;
      g.add(st);
      return st;
    };
    mkStool(1.05, 0);
    mkStool(-1.05, 1);
    const pieces = new THREE.Group();
    pieces.position.y = 0.78;
    g.add(pieces);
    g.userData.pieces = pieces;
    g.userData.stools = [1.05, -1.05];
  } else if (type === "punchbag") {
    const hook = new THREE.Mesh(new THREE.SphereGeometry(0.06, 8, 8), paint("#4a4038"));
    hook.position.y = 2.35;
    add(hook);
    const chain = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, 0.25, 8), paint("#c5c9ce"));
    chain.position.y = 2.22;
    add(chain);
    const pivot = new THREE.Group();
    pivot.position.y = 2.08;
    const bag = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.22, 1.15, 14), paint("#c44536"));
    bag.position.y = -0.7;
    const stripe = new THREE.Mesh(new THREE.CylinderGeometry(0.205, 0.225, 0.12, 14), paint("#eee3d6"));
    stripe.position.y = -0.55;
    pivot.add(bag, stripe);
    g.add(pivot);
    g.userData.pivot = pivot;
    g.userData.bag = bag;
    const base = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.26, 0.08, 12), paint("#3d342c"));
    base.position.y = 0.04;
    add(base);
  } else if (type === "benchpress") {
    const pad = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.12, 1.5), paint("#d8c6a8"));
    pad.position.set(0, 0.38, 0);
    add(pad);
    const standL = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.9, 0.08), paint("#6b6f78"));
    const standR = standL.clone();
    standL.position.set(-0.45, 0.55, -0.55);
    standR.position.set(0.45, 0.55, -0.55);
    add(standL); add(standR);
    const bar = new THREE.Group();
    const rod = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 1.7, 10), paint("#c5c9ce"));
    rod.rotation.z = Math.PI / 2;
    const w1 = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.14, 0.08, 12), paint("#2a2a2e"));
    const w2 = w1.clone();
    w1.rotation.z = Math.PI / 2; w2.rotation.z = Math.PI / 2;
    w1.position.x = -0.75; w2.position.x = 0.75;
    bar.add(rod, w1, w2);
    bar.position.set(0, 0.95, -0.55);
    g.add(bar);
    g.userData.bar = bar;
  } else if (type === "treadmill") {
    const base = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.12, 1.5), paint("#3d342c"));
    base.position.y = 0.1;
    add(base);
    const beltMat = ghost ? paint("#2a2a2e") : new THREE.MeshStandardMaterial({ color: "#2a2a2e", roughness: 0.8 });
    const belt = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.04, 1.25), beltMat);
    belt.position.y = 0.17;
    add(belt);
    g.userData.belt = belt;
    const post = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.85, 0.08), paint("#6b6f78"));
    post.position.set(0, 0.55, -0.65);
    add(post);
    const console = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.08, 0.22), paint("#2a2a2e"));
    console.position.set(0, 1.0, -0.62);
    add(console);
  } else if (type === "cubics") {
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.7, 1.7, 0.62), paint("#2a1c4a"));
    body.position.y = 0.85;
    add(body);
    const bezel = new THREE.Mesh(new THREE.BoxGeometry(0.58, 0.48, 0.06), paint("#111"));
    bezel.position.set(0, 1.25, 0.32);
    add(bezel);
    const canvas = document.createElement("canvas");
    canvas.width = 256; canvas.height = 320;
    const ctx = canvas.getContext("2d");
    drawCubics(ctx, 256, 320, null, 0, []);
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    const cubMat = ghost ? paint("#111") : new THREE.MeshStandardMaterial({
      map: tex, emissive: "#ffffff", emissiveMap: tex, emissiveIntensity: 0.7, roughness: 0.4,
    });
    const cubScreen = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.4, 0.03), cubMat);
    cubScreen.position.set(0, 1.25, 0.35);
    add(cubScreen);
    const panel = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.28, 0.3), paint("#1a1030"));
    panel.position.set(0, 0.85, 0.22);
    add(panel);
    const cubebase = new THREE.Mesh(new THREE.BoxGeometry(0.78, 0.12, 0.7), paint("#1a1030"));
    cubebase.position.y = 0.06;
    add(cubebase);
    if (!ghost) {
      g.userData.arcadeCanvas = canvas;
      g.userData.arcadeCtx = ctx;
      g.userData.arcadeTex = tex;
      g.userData.arcadeScreen = cubScreen;
    }
  } else if (type === "clothescab") {
    const cab = new THREE.Mesh(new THREE.BoxGeometry(0.85, 1.7, 0.5), paint("#8b5a2b"));
    cab.position.y = 0.85;
    add(cab);
    const inner = new THREE.Mesh(new THREE.BoxGeometry(0.72, 1.4, 0.2), paint("#c4a06a"));
    inner.position.set(0, 0.9, 0.16);
    add(inner);
    const rod = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.68, 8), paint("#c5c9ce"));
    rod.rotation.z = Math.PI / 2;
    rod.position.set(0, 1.45, 0.18);
    add(rod);
    [["#7c5cff", -0.22], ["#ff7a59", 0], ["#3ecf8e", 0.22]].forEach(([c, x]) => {
      const shirt = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.32, 0.06), paint(c));
      shirt.position.set(x, 1.2, 0.2);
      add(shirt);
      const hook = new THREE.Mesh(new THREE.TorusGeometry(0.03, 0.008, 6, 10, Math.PI), paint("#c5c9ce"));
      hook.position.set(x, 1.4, 0.2);
      hook.rotation.y = Math.PI / 2;
      add(hook);
    });
  } else if (type === "coffeemachine") {
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.48, 0.7, 0.4), paint("#d8d2ca"));
    body.position.y = 0.55;
    add(body);
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.16, 0.3), paint("#2a2a2e"));
    head.position.set(0, 0.98, 0);
    add(head);
    const tray = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.04, 0.28), paint("#8a8f96"));
    tray.position.set(0, 0.28, 0.08);
    add(tray);
    const mug = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.05, 0.1, 12), paint("#fff8f0"));
    mug.position.set(0, 0.36, 0.1);
    add(mug);
    g.userData.mug = mug;
    const stream = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.28, 6), paint("#3d2314"));
    stream.position.set(0, 0.7, 0.1);
    stream.visible = false;
    add(stream);
    g.userData.pour = stream;
    const steam = new THREE.Group();
    steam.position.set(0, 0.85, 0.1);
    for (let i = 0; i < 5; i++) {
      const puff = new THREE.Mesh(new THREE.SphereGeometry(0.04, 8, 8), new THREE.MeshBasicMaterial({ color: "#f4f0ea", transparent: true, opacity: 0.35 }));
      puff.userData.phase = i;
      steam.add(puff);
    }
    g.add(steam);
    g.userData.steam = steam;
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

  const hemi = new THREE.HemisphereLight(0xffe6c9, 0x8a9aaa, 0.7);
  const ambient = new THREE.AmbientLight(0xfff6e8, 0.28);
  scene.add(hemi);
  scene.add(ambient);
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
  // One-finger touch is for walking / placing, not orbiting the camera.
  controls.touches.ONE = -1;
  controls.touches.TWO = THREE.TOUCH.DOLLY_ROTATE;
  renderer.domElement.style.touchAction = "none";

  const rim = new THREE.DirectionalLight(0xfff6e8, 0.55);
  rim.position.copy(camera.position);
  scene.add(rim);

  const tilesGroup = new THREE.Group();
  const wallsGroup = new THREE.Group();
  const furnitureGroup = new THREE.Group();
  const ghostGroup = new THREE.Group();
  const peopleGroup = new THREE.Group();
  const petsGroup = new THREE.Group();
  const gridGroup = new THREE.Group();
  const fxGroup = new THREE.Group();
  const wallArtGroup = new THREE.Group();
  scene.add(tilesGroup, wallsGroup, furnitureGroup, ghostGroup, peopleGroup, petsGroup, gridGroup, fxGroup, wallArtGroup);

  let ghost = null;
  let ghostState = null;
  const peopleMeshes = new Map();
  const petMeshes = new Map();
  const tileMeshes = [];
  let hoverMesh = null;
  let selectedMesh = null;
  let highlight = null;
  let gridSize = 6;
  let wallpaper = "paint-cream";
  let floorStyle = "wood";
  let onTileClick = null;
  let onTileHover = null;
  let onFurnitureClick = null;
  let onSwitchClick = null;
  let placing = null;
  let furnitureList = [];
  let hovering = false;
  let lightsOn = true;
  let uses = {};
  let chessMap = {};
  let tvs = {};
  let wallArtList = [];
  let arcade = {};
  let serverTime = Date.now();
  let serverTimeAt = Date.now();
  let wallGhost = null;
  let wallGhostState = null;
  let onWallClick = null;
  let onWallHover = null;
  let windowLightRef = null;
  let switchMesh = null;

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
    const windowLight = new THREE.PointLight(0xffe0b0, lightsOn ? 0.85 : 0.35, 7);
    windowLight.position.set(gridSize * 0.18, 1.9, -gridSize / 2 + 0.8);
    wallsGroup.add(windowLight);
    windowLightRef = windowLight;

    const door = new THREE.Mesh(new THREE.BoxGeometry(0.08, 2.05, 0.85), std("#8a5a36"));
    door.position.set(-gridSize / 2 + 0.07, 1.05, gridSize * 0.22);
    const knob = new THREE.Mesh(new THREE.SphereGeometry(0.04, 8, 8), std("#e6c35c", { metalness: 0.7, roughness: 0.3 }));
    knob.position.set(-gridSize / 2 + 0.13, 1.05, gridSize * 0.22 + 0.3);
    wallsGroup.add(door, knob);

    const plate = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.28, 0.18), std("#efe8dc"));
    plate.position.set(-gridSize / 2 + 0.08, 1.35, gridSize * 0.22 - 0.7);
    const sw = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.1, 0.07), std(lightsOn ? "#f4c15d" : "#6b6f78"));
    sw.position.set(-gridSize / 2 + 0.12, 1.35, gridSize * 0.22 - 0.7);
    sw.userData.lightSwitch = true;
    plate.userData.lightSwitch = true;
    wallsGroup.add(plate, sw);
    switchMesh = sw;
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
    setWallArt(wallArtList);
    resize();
  }

  function setFurniture(list) {
    furnitureList = list || [];
    furnitureGroup.clear();
    selectedMesh = null;
    furnitureList.forEach((f) => addFurniture(f, true));
    refreshInteractives();
    if (highlight) highlight.visible = false;
  }

  function addFurniture(f, skipPush) {
    if (!skipPush && !furnitureList.some((x) => x.id === f.id)) furnitureList.push(f);
    const [w, h] = furnDims(f.type, f.rot);
    const m = buildFurnitureMesh(f.type, false);
    const c = footprintCenter(f.x, f.y, w, h, gridSize);
    m.position.set(c.x, 0, c.z);
    m.rotation.y = (normalizeRotSafe(f.rot) * Math.PI) / 2;
    m.userData.furnitureId = f.id;
    m.userData.type = f.type;
    m.userData.rot = f.rot || 0;
    furnitureGroup.add(m);
    // tag stool children
    m.traverse((ch) => {
      if (ch.userData && ch.userData.seat != null) {
        ch.userData.furnitureId = f.id;
        ch.userData.type = f.type;
      }
    });
    return m;
  }

  function normalizeRotSafe(rot) {
    return ((Number(rot) || 0) % 4 + 4) % 4;
  }

  function setGhost(type, tx, ty, ok, rot) {
    ghostGroup.clear();
    ghost = null;
    ghostState = null;
    if (!type || tx == null || ty == null) return;
    const r = normalizeRotSafe(rot);
    const [w, h] = furnDims(type, r);
    ghost = buildFurnitureMesh(type, true, ok);
    const c = footprintCenter(tx, ty, w, h, gridSize);
    ghost.position.set(c.x, 0.02, c.z);
    ghost.rotation.y = (r * Math.PI) / 2;
    ghostGroup.add(ghost);
    ghostState = { type, tx, ty, ok: Boolean(ok), rot: r };
  }

  function getGhost() { return ghostState ? { ...ghostState } : null; }

  function findFurnMesh(id) {
    return furnitureGroup.children.find((c) => c.userData.furnitureId === id)
      || wallArtGroup.children.find((c) => c.userData.artId === id)
      || null;
  }

  function highlightFurniture(id) {
    if (highlight) {
      highlight.parent && highlight.parent.remove(highlight);
      highlight = null;
    }
    selectedMesh = id ? findFurnMesh(id) : null;
    if (!selectedMesh) return;
    const box = new THREE.Box3().setFromObject(selectedMesh);
    const size = new THREE.Vector3();
    const center = new THREE.Vector3();
    box.getSize(size);
    box.getCenter(center);
    highlight = new THREE.Mesh(
      new THREE.BoxGeometry(Math.max(0.4, size.x + 0.12), Math.max(0.2, size.y + 0.12), Math.max(0.4, size.z + 0.12)),
      new THREE.MeshBasicMaterial({ color: 0xffe08a, transparent: true, opacity: 0.22, depthWrite: false })
    );
    highlight.position.copy(center);
    highlight.position.y = size.y / 2 + 0.02;
    scene.add(highlight);
  }

  function projectFurniture(id) {
    const m = findFurnMesh(id);
    if (!m) return null;
    const v = new THREE.Vector3();
    m.getWorldPosition(v);
    v.y += 1.1;
    v.project(camera);
    const w = container.clientWidth;
    const h = container.clientHeight;
    return { x: (v.x * 0.5 + 0.5) * w, y: (-v.y * 0.5 + 0.5) * h, visible: v.z < 1 };
  }

  function applyLights() {
    const on = lightsOn;
    hemi.intensity = on ? 0.7 : 0.18;
    ambient.intensity = on ? 0.28 : 0.06;
    sun.intensity = on ? 0.95 : 0.12;
    rim.intensity = on ? 0.55 : 0.12;
    if (windowLightRef) windowLightRef.intensity = on ? 0.85 : 0.4;
    renderer.setClearColor(on ? 0xb7c4d6 : 0x1a1630, 1);
    if (switchMesh) switchMesh.material.color.set(on ? "#f4c15d" : "#6b6f78");
    refreshArt();
  }

  function setLights(on) {
    lightsOn = on !== false;
    applyLights();
    refreshInteractives();
  }

  function setUses(next) { uses = next || {}; refreshInteractives(); }
  function setChessMap(next) { chessMap = next || {}; refreshInteractives(); }
  function setTvs(next) { tvs = next || {}; refreshInteractives(); }
  function setServerTime(t) {
    serverTime = Number(t) || Date.now();
    serverTimeAt = Date.now();
  }
  function nowServer() {
    return serverTime + (Date.now() - serverTimeAt);
  }
  function tvProgram() {
    return programAt(nowServer());
  }

  function wallWorld(wall, slot) {
    const pos = new THREE.Vector3();
    if (wall === "back") {
      pos.set(slot + 0.5 - gridSize / 2, 1.55, -gridSize / 2 + 0.08);
    } else {
      pos.set(-gridSize / 2 + 0.08, 1.55, slot + 0.5 - gridSize / 2);
    }
    return pos;
  }

  function makeArtMesh(type, ghost = false, ok = true) {
    const canvas = document.createElement("canvas");
    canvas.width = 256; canvas.height = 320;
    const ctx = canvas.getContext("2d");
    drawWallArt(ctx, 256, 320, type, lightsOn, 0);
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    const mat = new THREE.MeshStandardMaterial({
      map: tex,
      roughness: 0.55,
      metalness: 0.05,
      transparent: ghost,
      opacity: ghost ? 0.55 : 1,
      emissive: type === "art_neon" ? new THREE.Color("#ff4d8d") : new THREE.Color("#000"),
      emissiveIntensity: 0,
      color: ghost ? (ok ? "#b8ffd0" : "#ffb0b0") : "#ffffff",
    });
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(0.72, 0.9), mat);
    mesh.userData.artCanvas = canvas;
    mesh.userData.artCtx = ctx;
    mesh.userData.artTex = tex;
    mesh.userData.artType = type;
    return mesh;
  }

  function placeArtMesh(m, wall, slot) {
    const pos = wallWorld(wall, slot);
    m.position.copy(pos);
    m.rotation.y = wall === "back" ? 0 : Math.PI / 2;
  }

  function setWallArt(list) {
    wallArtList = list || [];
    wallArtGroup.clear();
    wallArtList.forEach((a) => {
      const m = makeArtMesh(a.type);
      placeArtMesh(m, a.wall, a.slot);
      m.userData.artId = a.id;
      m.userData.wall = a.wall;
      m.userData.slot = a.slot;
      wallArtGroup.add(m);
    });
    refreshArt();
  }

  function refreshArt() {
    wallArtGroup.children.forEach((m) => {
      if (!m.userData.artCtx) return;
      drawWallArt(m.userData.artCtx, 256, 320, m.userData.artType, lightsOn, performance.now() / 1000);
      m.userData.artTex.needsUpdate = true;
      if (m.material && m.userData.artType === "art_neon") {
        m.material.emissiveIntensity = lightsOn ? 0.2 : 1.1;
      }
    });
  }

  function setWallGhost(type, wall, slot, ok) {
    if (wallGhost) {
      wallArtGroup.remove(wallGhost);
      wallGhost = null;
    }
    wallGhostState = null;
    if (!type || wall == null || slot == null) return;
    wallGhost = makeArtMesh(type, true, ok);
    placeArtMesh(wallGhost, wall, slot);
    wallGhost.userData.ghost = true;
    wallArtGroup.add(wallGhost);
    wallGhostState = { type, wall, slot, ok: Boolean(ok) };
  }
  function getWallGhost() { return wallGhostState ? { ...wallGhostState } : null; }

  function wallFromPoint(point) {
    const backZ = -gridSize / 2;
    const leftX = -gridSize / 2;
    const dBack = Math.abs(point.z - backZ);
    const dLeft = Math.abs(point.x - leftX);
    if (dBack <= dLeft && dBack < 0.45) {
      const slot = Math.round(point.x + gridSize / 2 - 0.5);
      if (slot >= 0 && slot < gridSize) return { wall: "back", slot };
    }
    if (dLeft < 0.45) {
      const slot = Math.round(point.z + gridSize / 2 - 0.5);
      if (slot >= 0 && slot < gridSize) return { wall: "left", slot };
    }
    return null;
  }

  function setArcade(next) { arcade = next || {}; refreshInteractives(); }

  function layoutChessPieces(root, fen) {
    if (!root) return;
    while (root.children.length) root.remove(root.children[0]);
    if (!fen) return;
    const board = fen.split(" ")[0].split("/");
    const letter = (ch) => ch.toLowerCase();
    const isWhite = (ch) => ch === ch.toUpperCase();
    for (let r = 0; r < 8; r++) {
      let c = 0;
      for (const ch of board[r] || "") {
        if (/[1-8]/.test(ch)) { c += Number(ch); continue; }
        const color = isWhite(ch) ? "#f4efe6" : "#2a2a2e";
        const kind = letter(ch);
        let piece;
        if (kind === "p") piece = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.05, 0.1, 8), std(color));
        else if (kind === "r") piece = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.14, 0.08), std(color));
        else if (kind === "n") piece = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.14, 8), std(color));
        else if (kind === "b") piece = new THREE.Mesh(new THREE.ConeGeometry(0.045, 0.16, 6), std(color));
        else if (kind === "q") piece = new THREE.Mesh(new THREE.SphereGeometry(0.055, 10, 8), std(color));
        else piece = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.06, 0.18, 10), std(color));
        piece.position.set((c - 3.5) * 0.18, 0.07, (7 - r - 3.5) * 0.18);
        piece.castShadow = true;
        root.add(piece);
        c += 1;
      }
    }
  }

  function refreshInteractives() {
    furnitureGroup.children.forEach((m) => {
      const id = m.userData.furnitureId;
      const type = m.userData.type;
      const use = uses[id];
      if (m.userData.door) m.userData.door.rotation.y = use && use.type === "fridge" && use.open ? -2.1 : 0;
      if (m.userData.fridgeLight) m.userData.fridgeLight.intensity = (use && use.open) ? (lightsOn ? 0.45 : 1.1) : 0;
      if (m.userData.screen) {
        const on = Boolean(tvs[id]?.on);
        m.userData.screen.userData.tvOn = on;
        if (m.userData.screen.material && m.userData.screen.material.emissive) {
          m.userData.screen.material.emissiveIntensity = on ? 1.2 : 0.1;
        }
      }
      if (m.userData.pieces) layoutChessPieces(m.userData.pieces, chessMap[id]?.fen);
    });
  }

  function petSitWorld(ownerMesh) {
    const yaw = ownerMesh.rotation.y;
    const fwdX = Math.sin(yaw), fwdZ = Math.cos(yaw);
    const rightX = Math.cos(yaw), rightZ = -Math.sin(yaw);
    const candidates = [];
    for (const side of [1, -1, 0]) {
      for (const fwd of [0.16, 0.02, 0.3, -0.12]) {
        candidates.push([
          ownerMesh.position.x + rightX * 0.38 * (side || 1) + fwdX * fwd,
          ownerMesh.position.z + rightZ * 0.38 * (side || 1) + fwdZ * fwd,
        ]);
        if (side === 0) break;
      }
    }
    const blocked = (globalThis.HouseIso?.blockedSet(furnitureList) || new Set());
    const ok = (x, z) => {
      const tx = Math.round(x + gridSize / 2 - 0.5);
      const ty = Math.round(z + gridSize / 2 - 0.5);
      if (tx < 0 || ty < 0 || tx >= gridSize || ty >= gridSize) return false;
      return !blocked.has(tx + "," + ty);
    };
    for (const [x, z] of candidates) {
      if (ok(x, z)) return new THREE.Vector3(x, 0, z);
    }
    return new THREE.Vector3(ownerMesh.position.x + rightX * 0.3, 0, ownerMesh.position.z + rightZ * 0.3);
  }

  function syncPeople(people) {
    const seen = new Set();
    for (const p of people) {
      seen.add(p.username);
      let m = peopleMeshes.get(p.username);
      const av = {
        ...(p.avatar || {}),
        prop: p.heldProp || p.avatar?.prop || null,
        heldItem: p.heldItem || null,
        boxing: p.boxing || null,
      };
      const sig = JSON.stringify(av) + "|" + (p.activePet || "") + "|" + (p.gym?.type || "");
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
      m.userData.heldItem = p.heldItem || null;
      m.userData.boxing = p.boxing || null;
      m.userData.gym = p.gym || null;
      m.userData.actionEmote = p.actionEmote || null;
      m.userData.actionEmoteAt = p.actionEmoteAt || 0;
      m.userData.username = p.username;
      if (!m.userData.actionEmote) hideEmoteVfx(m.userData);
      if (p.walking && (p.dirX != null || p.dirZ != null)) {
        m.rotation.y = Math.atan2(p.dirX || 0, p.dirZ || 1);
        m.userData.facing = { x: p.dirX || 0, z: p.dirZ || 1 };
      } else if (p.facing && (p.facing.x != null || p.facing.z != null)) {
        m.rotation.y = Math.atan2(p.facing.x || 0, p.facing.z || 1);
        m.userData.facing = p.facing;
      }
      // otherwise keep last rotation so every viewer sees the same facing
      if (p.activePet) {
        let pet = petMeshes.get(p.username);
        if (!pet || pet.userData.kind !== p.activePet) {
          if (pet) petsGroup.remove(pet);
          pet = buildPetMesh(p.activePet);
          pet.userData.kind = p.activePet;
          pet.userData.phase = (p.username.length % 7);
          petMeshes.set(p.username, pet);
          petsGroup.add(pet);
          pet.position.set(pos.x - 0.45, 0, pos.z - 0.35);
        }
        const walking = Boolean(p.walking);
        pet.userData.wantSit = !walking && !p.sitting;
        if (walking) {
          pet.userData.target = new THREE.Vector3(pos.x - Math.sin(m.rotation.y) * 0.5, 0, pos.z - Math.cos(m.rotation.y) * 0.5);
          pet.userData.sitReady = false;
        } else {
          pet.userData.target = petSitWorld(m);
        }
        pet.userData.ownerYaw = m.rotation.y;
        pet.userData.ownerPos = pos.clone();
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

  function tileFromPoint(point) {
    if (!point) return null;
    const tx = Math.floor(point.x + gridSize / 2);
    const ty = Math.floor(point.z + gridSize / 2);
    if (tx < 0 || ty < 0 || tx >= gridSize || ty >= gridSize) return null;
    return { tx, ty };
  }
  function tileFromEvent(event) {
    const hit = pick(event, tileMeshes);
    if (hit) {
      let obj = hit.object;
      while (obj && !obj.userData.tile) obj = obj.parent;
      if (obj?.userData.tile) return { tx: obj.userData.tx, ty: obj.userData.ty };
      const fromPt = tileFromPoint(hit.point);
      if (fromPt) return fromPt;
    }
    const rect = renderer.domElement.getBoundingClientRect();
    const ev = event.clientX != null ? event : (event.changedTouches && event.changedTouches[0]);
    if (!ev) return null;
    pointer.x = ((ev.clientX - rect.left) / rect.width) * 2 - 1;
    pointer.y = -((ev.clientY - rect.top) / rect.height) * 2 + 1;
    raycaster.setFromCamera(pointer, camera);
    const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
    const pt = new THREE.Vector3();
    if (!raycaster.ray.intersectPlane(plane, pt)) return null;
    return tileFromPoint(pt);
  }

  let downPt = null;
  function pointerPos(e) {
    if (e && e.clientX != null) return { x: e.clientX, y: e.clientY };
    const t = e?.changedTouches?.[0] || e?.touches?.[0];
    return t ? { x: t.clientX, y: t.clientY } : null;
  }
  function slopFor(type) {
    return type === "mouse" ? 8 : 28;
  }
  function handleTap(e) {
    const swHit = pick(e, wallsGroup.children);
    if (swHit) {
      let obj = swHit.object;
      while (obj && !obj.userData.lightSwitch) obj = obj.parent;
      if (obj?.userData.lightSwitch) {
        onSwitchClick?.();
        return;
      }
    }
    const artHit = pick(e, wallArtGroup.children);
    if (artHit) {
      let obj = artHit.object;
      while (obj && !obj.userData.artId && !obj.userData.ghost) obj = obj.parent;
      if (obj?.userData.artId) {
        onFurnitureClick?.(obj.userData.artId, obj.userData.artType, { wall: obj.userData.wall, slot: obj.userData.slot, wallArt: true });
        return;
      }
    }
    const furnHit = pick(e, furnitureGroup.children);
    if (furnHit) {
      let obj = furnHit.object;
      let seat = null;
      while (obj && !obj.userData.furnitureId) {
        if (obj.userData && obj.userData.seat != null) seat = obj.userData.seat;
        obj = obj.parent;
      }
      if (obj?.userData.furnitureId) {
        if (seat == null && obj.userData.seat != null) seat = obj.userData.seat;
        onFurnitureClick?.(obj.userData.furnitureId, obj.userData.type, { seat });
        return;
      }
    }
    // Only treat a wall hit as a wall-art placement tap when the client
    // has a wall handler AND we are actually targeting a wall slot.
    // Never swallow floor taps just because the ray also grazes a wall.
    const placingWall = Boolean(onWallClick) && Boolean(placing) && typeof placing === "string" && placing.startsWith("art_");
    if (placingWall) {
      const wallHit = swHit || pick(e, wallsGroup.children);
      const spot = wallHit ? wallFromPoint(wallHit.point) : null;
      if (spot) {
        onWallClick(spot.wall, spot.slot);
        return;
      }
    }
    const tile = tileFromEvent(e);
    if (tile) onTileClick?.(tile.tx, tile.ty);
  }
  renderer.domElement.addEventListener("pointerdown", (e) => {
    const p = pointerPos(e);
    if (!p) return;
    downPt = { x: p.x, y: p.y, id: e.pointerId, type: e.pointerType || "touch" };
  });
  renderer.domElement.addEventListener("pointerup", (e) => {
    if (!downPt) return;
    if (e.pointerId != null && downPt.id != null && e.pointerId !== downPt.id) return;
    const p = pointerPos(e);
    const moved = p ? Math.hypot(p.x - downPt.x, p.y - downPt.y) : 0;
    const slop = slopFor(downPt.type);
    downPt = null;
    if (moved > slop) return;
    handleTap(e);
  });
  renderer.domElement.addEventListener("pointercancel", () => {
    downPt = null;
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
    const wallHit = pick(e, wallsGroup.children);
    if (wallHit) {
      const spot = wallFromPoint(wallHit.point);
      if (spot) onWallHover?.(spot.wall, spot.slot);
    }
  });
  renderer.domElement.addEventListener("pointerleave", () => {
    hovering = false;
    if (!placing) showGrid(false);
    if (hoverMesh) hoverMesh.visible = false;
  });

  function syncEmotePop(name, m) {
    const kind = m.userData.actionEmote;
    const want = kind === "laugh" || kind === "heart";
    const sel = `[data-emote-pop="${String(name).replace(/"/g, "")}"]`;
    let el = overlay.querySelector(sel);
    if (!want) {
      el?.remove();
      return;
    }
    if (!el) {
      el = document.createElement("div");
      el.className = "emote-fx";
      el.dataset.emotePop = name;
      el.dataset.testid = "emote-fx-" + name;
      overlay.appendChild(el);
    }
    el.classList.toggle("laugh", kind === "laugh");
    el.classList.toggle("heart", kind === "heart");
    el.textContent = kind === "laugh" ? "HA HA" : "❤";
    const pos = projectHead(name);
    if (!pos || !pos.visible) {
      el.style.display = "none";
      return;
    }
    el.style.display = "block";
    el.style.left = pos.x + "px";
    el.style.top = pos.y + "px";
  }

  let raf = 0;
  let alive = true;
  function loop() {
    if (!alive) return;
    raf = requestAnimationFrame(loop);
    const t = performance.now() / 1000;
    for (const [name, m] of peopleMeshes.entries()) {
      applyCharacterPose(m.userData, t, m.userData.walking, m.userData.sitting);
      try { syncEmotePop(name, m); } catch {}
    }
    for (const pet of petMeshes.values()) {
      const ud = pet.userData;
      if (ud.target) {
        pet.position.lerp(ud.target, ud.wantSit ? 0.12 : 0.08);
        const d = ud.target.clone().sub(pet.position);
        const dist = Math.hypot(d.x, d.z);
        if (dist > 0.05 && !ud.sitReady) pet.rotation.y = Math.atan2(d.x, d.z);
        if (ud.wantSit && dist < 0.06) ud.sitReady = true;
        if (!ud.wantSit) ud.sitReady = false;
      }
      const sitting = Boolean(ud.sitReady && ud.wantSit);
      ud.sitting = sitting;
      if (sitting) {
        const yaw = ud.ownerYaw || pet.rotation.y;
        if (ud.ownerPos) {
          const toward = Math.atan2(ud.ownerPos.x - pet.position.x, ud.ownerPos.z - pet.position.z);
          // face mostly with the owner, slightly toward them
          pet.rotation.y = yaw * 0.75 + toward * 0.25;
        } else pet.rotation.y = yaw;
      }
      applyPetPose(ud, t, !sitting && !ud.wantSit, sitting);
      if (!sitting) pet.position.y = Math.abs(Math.sin(t * 6)) * 0.02;
      else pet.position.y = 0;
    }
    furnitureGroup.children.forEach((m) => {
      const id = m.userData.furnitureId;
      const use = uses[id];
      if (m.userData.pivot && use && use.type === "punchbag" && use.lastHitAt) {
        const age = (Date.now() - use.lastHitAt) / 1000;
        const amp = (use.move === "uppercut" ? 0.55 : use.move === "hook" ? 0.4 : 0.28) * Math.exp(-age * 2.2);
        const dir = use.move === "hook" ? 1 : 0.35;
        m.userData.pivot.rotation.x = Math.sin(age * 11) * amp;
        m.userData.pivot.rotation.z = Math.cos(age * 9 + dir) * amp * 0.6;
        const squash = Math.exp(-age * 10) * 0.2;
        if (m.userData.bag) m.userData.bag.scale.set(1 + squash, 1 - squash, 1 + squash);
        m.userData.swinging = age < 1.6 && amp > 0.02;
      } else if (m.userData.pivot) {
        m.userData.pivot.rotation.x *= 0.85;
        m.userData.pivot.rotation.z *= 0.85;
        if (m.userData.bag) m.userData.bag.scale.set(1, 1, 1);
        m.userData.swinging = false;
      }
      if (m.userData.bar && use && use.type === "benchpress") {
        const age = (Date.now() - (use.lastRepAt || 0)) / 1000;
        const k = age < 0.5 ? Math.sin((age / 0.5) * Math.PI) : 0;
        m.userData.bar.position.y = 0.95 + k * 0.35;
      }
      if (m.userData.belt && use && use.type === "treadmill" && m.userData.belt.material) {
        // visual run pulse
        m.userData.belt.material.color.setHSL(0, 0, 0.12 + 0.05 * Math.sin(t * 12));
      }
      if (m.userData.tvCtx && m.userData.screen) {
        const on = Boolean(tvs[id]?.on);
        m.userData.screen.userData.tvOn = on;
        if (on) {
          drawCubeChannel(m.userData.tvCtx, 512, 288, nowServer());
          m.userData.tvTex.needsUpdate = true;
          if (m.userData.screen.material) m.userData.screen.material.emissiveIntensity = 0.85;
        } else if (m.userData.screen.material) {
          m.userData.tvCtx.fillStyle = "#151820";
          m.userData.tvCtx.fillRect(0, 0, 512, 288);
          m.userData.tvTex.needsUpdate = true;
          m.userData.screen.material.emissiveIntensity = 0.08;
        }
      }
      if (m.userData.arcadeCtx) {
        const cab = arcade[id];
        drawCubics(m.userData.arcadeCtx, 256, 320, cab?.state || null, t, cab?.scores || []);
        m.userData.arcadeTex.needsUpdate = true;
      }
      if (m.userData.steam) {
        const brewing = use && use.type === "coffeemachine";
        const age = brewing ? (Date.now() - (use.startedAt || 0)) / 1000 : 0;
        m.userData.steam.visible = brewing;
        if (m.userData.pour) m.userData.pour.visible = brewing && age > 1.4 && age < 3.05;
        if (m.userData.mug) m.userData.mug.visible = !(brewing && age > 2.85);
        if (brewing) {
          m.userData.steam.children.forEach((puff) => {
            const ph = puff.userData.phase || 0;
            const k = (t * 0.8 + ph * 0.35) % 1;
            puff.position.set(Math.sin(t * 2 + ph) * 0.04, k * 0.35, Math.cos(t * 1.6 + ph) * 0.03);
            puff.scale.setScalar(0.4 + k);
            puff.material.opacity = 0.4 * (1 - k);
          });
        }
      }
    });
    if (Math.floor(t * 8) !== Math.floor((t - 1 / 60) * 8)) refreshArt();
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
    getGhost,
    getWallGhost,
    highlightFurniture,
    projectFurniture,
    setLights,
    lightsOn: () => lightsOn,
    tvOn(id) { return Boolean(tvs[id]?.on); },
    fridgeOpen(id) { return Boolean(uses[id]?.open); },
    setUses,
    setChessMap,
    setTvs,
    setWallArt,
    setWallGhost,
    setArcade,
    getArcade() { return arcade; },
    setServerTime,
    tvProgram,
    nowServer,
    findFurnMesh,
    getWallArt() { return wallArtList.slice(); },
    petSitting(name) { return Boolean(petMeshes.get(name)?.userData.sitting); },
    bagSwinging(id) { return Boolean(findFurnMesh(id)?.userData.swinging); },
    personFlags(name) {
      const m = peopleMeshes.get(name);
      if (!m) return null;
      return {
        boxing: Boolean(m.userData.boxing),
        sitting: Boolean(m.userData.sitting),
        heldItem: m.userData.heldItem || null,
        gym: m.userData.gym || null,
        facing: m.userData.facing || null,
        actionEmote: m.userData.actionEmote || null,
        walking: Boolean(m.userData.walking),
      };
    },
    personTile(name) {
      const m = peopleMeshes.get(name);
      if (!m) return null;
      return {
        x: m.position.x + gridSize / 2 - 0.5,
        y: m.position.z + gridSize / 2 - 0.5,
      };
    },
    projectTile(tx, ty) {
      const pos = tileToWorld(tx, ty, gridSize);
      const v = new THREE.Vector3(pos.x, 0.06, pos.z);
      v.project(camera);
      const rect = renderer.domElement.getBoundingClientRect();
      return {
        x: rect.left + (v.x * 0.5 + 0.5) * rect.width,
        y: rect.top + (-v.y * 0.5 + 0.5) * rect.height,
        visible: v.z < 1,
      };
    },
    syncPeople,
    projectHead,
    overlay,
    onTileClick(fn) { onTileClick = fn; },
    onTileHover(fn) { onTileHover = fn; },
    onFurnitureClick(fn) { onFurnitureClick = fn; },
    onSwitchClick(fn) { onSwitchClick = fn; },
    onWallClick(fn) { onWallClick = fn; },
    onWallHover(fn) { onWallHover = fn; },
    simulateWallClick(wall, slot) { onWallClick?.(wall, slot); },
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
    simulateFurnitureClick(id, type, extra) { onFurnitureClick?.(id, type, extra || {}); },
    simulateSwitchClick() { onSwitchClick?.(); },
    clear() {
      setFurniture([]);
      setWallArt([]);
      setArcade({});
      syncPeople([]);
      setGhost(null);
      setWallGhost(null);
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
  return api;
}
