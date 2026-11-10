import * as THREE from "three";
import { OrbitControls } from "../vendor/OrbitControls.js";
import { drawCubeChannel, programAt } from "./cubechannel.js";
import { drawCubics } from "./cubics.js";
import { drawWallArt } from "./wallart.js";

const WALL_H = 3.15;

function isPhoneView() {
  if (typeof window === "undefined") return false;
  const narrow = window.innerWidth <= 820;
  const coarse = Boolean(window.matchMedia?.("(pointer: coarse)")?.matches || window.matchMedia?.("(hover: none)")?.matches);
  const touch = (navigator.maxTouchPoints || 0) > 0;
  return narrow && (coarse || touch);
}

function capPixelRatio() {
  const dpr = window.devicePixelRatio || 1;
  return Math.min(dpr, isPhoneView() ? 1.5 : 2);
}


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
  c.width = 16;
  c.height = 1;
  const ctx = c.getContext("2d");
  for (let i = 0; i < 16; i++) {
    const t = i / 15;
    const v = Math.round(70 + t * 185);
    ctx.fillStyle = `rgb(${v},${v},${v})`;
    ctx.fillRect(i, 0, 1, 1);
  }
  toonGradient = new THREE.CanvasTexture(c);
  toonGradient.minFilter = THREE.LinearFilter;
  toonGradient.magFilter = THREE.LinearFilter;
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
  const { roughness, metalness, ...rest } = extras;
  return new THREE.MeshStandardMaterial({
    color,
    roughness: roughness ?? 0.46,
    metalness: metalness ?? 0.02,
    ...rest,
  });
}

const outlineMat = new THREE.MeshBasicMaterial({
  color: 0x3a2418,
  side: THREE.BackSide,
  transparent: true,
  opacity: 0.35,
});

function mesh(geo, color, extras = {}, opts = {}) {
  const mat = typeof color === "string" ? toon(color, extras) : color;
  const m = new THREE.Mesh(geo, mat);
  m.castShadow = true;
  m.receiveShadow = true;
  if (opts.outline !== false) {
    const o = new THREE.Mesh(geo, outlineMat);
    o.scale.setScalar(opts.outlineScale || 1.035);
    o.castShadow = false;
    o.receiveShadow = false;
    m.add(o);
  }
  return m;
}


const GEO_CACHE = new Map();
function geo(key, factory) {
  let g = GEO_CACHE.get(key);
  if (!g) {
    g = factory();
    g.userData.shared = true;
    GEO_CACHE.set(key, g);
  }
  return g;
}

const MAT_CACHE = new Map();
function matCached(color, extras = {}, kind = "std") {
  const key = kind + "|" + String(color) + "|" + JSON.stringify(extras);
  let m = MAT_CACHE.get(key);
  if (!m) {
    if (kind === "basic") m = new THREE.MeshBasicMaterial({ color, ...extras });
    else m = toon(color, extras);
    m.userData.shared = true;
    MAT_CACHE.set(key, m);
  }
  return m;
}

const _tmpV1 = new THREE.Vector3();
const _tmpV2 = new THREE.Vector3();
const _tmpV3 = new THREE.Vector3();
const _floorPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);

function applyJointBends(ud, { sit = false, walkSwing = null, run = false } = {}) {
  if (!ud) return;
  const defFore = 0.22;
  if (sit) {
    if (ud.leftShin) ud.leftShin.rotation.x = 1.28;
    if (ud.rightShin) ud.rightShin.rotation.x = 1.28;
    if (ud.leftFoot) ud.leftFoot.rotation.x = -0.1;
    if (ud.rightFoot) ud.rightFoot.rotation.x = -0.1;
    if (ud.leftForearm) ud.leftForearm.rotation.set(0.35, 0, 0);
    if (ud.rightForearm) ud.rightForearm.rotation.set(0.35, 0, 0);
    return;
  }
  if (walkSwing != null) {
    const amp = run ? 0.85 : 0.7;
    if (ud.leftShin) ud.leftShin.rotation.x = 0.08 + Math.max(0, walkSwing) * amp;
    if (ud.rightShin) ud.rightShin.rotation.x = 0.08 + Math.max(0, -walkSwing) * amp;
    if (ud.leftFoot) ud.leftFoot.rotation.x = -ud.leftShin.rotation.x * 0.45;
    if (ud.rightFoot) ud.rightFoot.rotation.x = -ud.rightShin.rotation.x * 0.45;
    if (ud.leftForearm) ud.leftForearm.rotation.set(defFore + Math.max(0, -walkSwing) * 0.25, 0, 0);
    if (ud.rightForearm) ud.rightForearm.rotation.set(defFore + Math.max(0, walkSwing) * 0.25, 0, 0);
    return;
  }
  if (ud.leftShin) ud.leftShin.rotation.set(0.08, 0, 0);
  if (ud.rightShin) ud.rightShin.rotation.set(0.08, 0, 0);
  if (ud.leftFoot) ud.leftFoot.rotation.set(0, 0, 0);
  if (ud.rightFoot) ud.rightFoot.rotation.set(0, 0, 0);
  if (ud.leftForearm) ud.leftForearm.rotation.set(defFore, 0, 0);
  if (ud.rightForearm) ud.rightForearm.rotation.set(defFore, 0, 0);
}

function disposeObject3D(root) {
  if (!root) return;
  root.traverse((o) => {
    if (o.geometry && !o.geometry.userData?.shared) o.geometry.dispose();
    const mats = o.material ? (Array.isArray(o.material) ? o.material : [o.material]) : [];
    for (const mat of mats) {
      if (mat && !mat.userData?.shared && mat !== outlineMat) mat.dispose();
    }
  });
}

function applySquash(rig, up) {
  rig.scale.set(1.1 - up * 0.18, 0.88 + up * 0.24, 1.1 - up * 0.18);
}

function resetLimbRot(ud) {
  for (const part of [ud.leftArm, ud.rightArm, ud.leftLeg, ud.rightLeg]) {
    if (part) part.rotation.set(0, 0, 0);
  }
  if (ud.head) ud.head.rotation.set(0, 0, 0);
  if (ud.rig) {
    ud.rig.position.y = 0;
    ud.rig.rotation.set(0, 0, 0);
    ud.rig.scale.set(1, 1, 1);
  }
  applyJointBends(ud, {});
}

function setMouthShape(ud, shape) {
  if (!ud?.mouths) return;
  const next = ud.mouths[shape] ? shape : "smile";
  for (const [k, g] of Object.entries(ud.mouths)) g.visible = k === next;
  ud.mouthShape = next;
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
  setMouthShape(ud, kind === "laugh" ? "laugh" : kind === "cry" ? "sad" : "smile");
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

function applyPhoneScroll(ud, t, sitting) {
  resetLimbRot(ud);
  setMouthShape(ud, "smile");
  const host = ud.rightHand || ud.rightArm;
  if (!ud.handPhone && host) {
    const phone = buildHandPhone();
    const hy = ud.rightHand ? 0 : (ud.handY ?? -0.36);
    phone.position.set(0.015, hy - 0.01, 0.07);
    phone.rotation.set(0.2, 0.15, -0.4);
    host.add(phone);
    ud.handPhone = phone;
  }
  if (ud.handPhone) ud.handPhone.visible = true;
  if (sitting) {
    ud.rig.position.y = -0.22;
    if (ud.leftLeg) ud.leftLeg.rotation.x = -1.2;
    if (ud.rightLeg) ud.rightLeg.rotation.x = -1.2;
    applyJointBends(ud, { sit: true });
  }
  if (ud.head) ud.head.rotation.x = 0.46;
  const swipe = Math.sin(t * 7.2);
  if (ud.rightArm) {
    ud.rightArm.rotation.x = -1.22 + swipe * 0.1;
    ud.rightArm.rotation.y = -0.42;
    ud.rightArm.rotation.z = -0.12;
  }
  if (ud.leftArm) {
    ud.leftArm.rotation.x = -0.95;
    ud.leftArm.rotation.y = 0.55;
    ud.leftArm.rotation.z = 0.18;
  }
  if (ud.thumbR) ud.thumbR.rotation.z = 0.35 + swipe * 0.55;
  if (ud.handPhone) {
    ud.handPhone.rotation.x = 0.18 + swipe * 0.22;
    const scr = ud.handPhone.userData.screen;
    if (scr?.material) {
      const pulse = 0.45 + 0.55 * (0.5 + 0.5 * Math.sin(t * 5));
      scr.material.emissiveIntensity = pulse;
    }
  }
}

function applyCharacterPose(ud, t, walking, sitting) {
  if (!ud?.rig) return;
  const phase = ud.phase || 0;
  const onPhone = Boolean(ud.usingPhone) && !walking;
  if (ud.handPhone && !onPhone) ud.handPhone.visible = false;
  if (!ud.actionEmote) setMouthShape(ud, "smile");
  if (onPhone && !ud.boxing && !ud.gym) {
    applyPhoneScroll(ud, t, sitting);
    return;
  }
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
    applyJointBends(ud, { walkSwing: 0.35 });
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
    applyJointBends(ud, { walkSwing: s, run: true });
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
    applyJointBends(ud, { sit: true });
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
      applyJointBends(ud, { walkSwing: s });
    } else if (sitting) {
      ud.rig.position.y = -0.22;
      ud.rig.rotation.z = 0;
      ud.rig.scale.set(1, 1, 1);
      if (ud.leftLeg) ud.leftLeg.rotation.x = -1.2;
      if (ud.rightLeg) ud.rightLeg.rotation.x = -1.2;
      if (ud.leftArm) ud.leftArm.rotation.x = 0.18;
      applyJointBends(ud, { sit: true });
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
    ud.rig.position.y = -0.22;
    if (ud.leftLeg) ud.leftLeg.rotation.x = -1.2;
    if (ud.rightLeg) ud.rightLeg.rotation.x = -1.2;
    if (ud.leftArm) ud.leftArm.rotation.x = 0.18;
    if (ud.rightArm) ud.rightArm.rotation.x = 0.18;
    applyJointBends(ud, { sit: true });
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
    applyJointBends(ud, { walkSwing: s });
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
  const mat = matCached(color, { roughness: 0.62 });
  const cap = mesh(geo("hairCap", () => new THREE.SphereGeometry(0.135, 28, 22, 0, Math.PI * 2, 0, Math.PI / 1.6)), mat, {}, { outlineScale: 1.03 });
  cap.position.set(0, 0.1, -0.02);
  cap.scale.set(1.12, 0.92, 1.06);
  if (style === "spiky") {
    cap.scale.set(1.06, 0.68, 1.0);
    head.add(cap);
    for (let i = 0; i < 10; i++) {
      const cone = mesh(geo("hairSpike", () => new THREE.ConeGeometry(0.035, 0.13, 8)), mat, {}, { outlineScale: 1.03 });
      const a = (i / 10) * Math.PI * 1.75 - 0.5;
      cone.position.set(Math.cos(a) * 0.1, 0.2, Math.sin(a) * 0.08 - 0.02);
      cone.rotation.z = Math.cos(a) * 0.4;
      cone.rotation.x = 0.25;
      head.add(cone);
    }
    return;
  }
  if (style === "curly") {
    [[-0.13, 0.12, 0.02], [0.13, 0.12, 0.02], [0, 0.23, -0.02], [-0.1, 0.18, -0.11], [0.1, 0.18, -0.11], [0, 0.13, 0.08], [-0.16, 0.05, -0.04], [0.16, 0.05, -0.04], [-0.07, 0.21, 0.05], [0.07, 0.21, 0.05], [0, 0.07, -0.15], [-0.11, 0.08, 0.1], [0.11, 0.08, 0.1]].forEach((pt) => {
      const b = mesh(geo("hairCurl", () => new THREE.SphereGeometry(0.085, 12, 10)), mat, {}, { outlineScale: 1.03 });
      b.position.set(...pt);
      head.add(b);
    });
    return;
  }
  if (style === "bun") {
    head.add(cap);
    const sides = mesh(geo("hairBunSide", () => new THREE.SphereGeometry(0.11, 16, 14)), mat, {}, { outlineScale: 1.03 });
    sides.position.set(0, 0.02, -0.04);
    sides.scale.set(1.5, 0.7, 1.15);
    const bun = mesh(geo("hairBun", () => new THREE.SphereGeometry(0.09, 16, 14)), mat, {}, { outlineScale: 1.03 });
    bun.position.set(0, 0.24, -0.05);
    head.add(sides, bun);
    return;
  }
  if (style === "long") {
    head.add(cap);
    const p1 = mesh(geo("hairLock", () => new THREE.CapsuleGeometry(0.065, 0.46, 6, 12)), mat, {}, { outlineScale: 1.03 });
    const p2 = p1.clone();
    p1.position.set(-0.13, -0.16, -0.02);
    p2.position.set(0.13, -0.16, -0.02);
    const back = mesh(geo("hairLongBack", () => new THREE.SphereGeometry(0.13, 14, 12)), mat, {}, { outlineScale: 1.03 });
    back.position.set(0, -0.02, -0.12);
    back.scale.set(1.25, 1.35, 0.95);
    const fall = mesh(geo("hairFall", () => new THREE.CapsuleGeometry(0.09, 0.38, 6, 12)), mat, {}, { outlineScale: 1.03 });
    fall.position.set(0, -0.14, -0.1);
    head.add(p1, p2, back, fall);
    return;
  }
  if (style === "bangs") {
    head.add(cap);
    const bang = mesh(geo("hairBang", () => new THREE.SphereGeometry(0.11, 16, 12)), mat, {}, { outlineScale: 1.03 });
    bang.scale.set(1.5, 0.38, 0.55);
    bang.position.set(0, 0.13, 0.1);
    const tail = mesh(geo("hairBangTail", () => new THREE.CapsuleGeometry(0.06, 0.36, 6, 12)), mat, {}, { outlineScale: 1.03 });
    tail.position.set(-0.15, -0.14, 0);
    head.add(bang, tail);
    return;
  }
  head.add(cap);
  [[-0.13, 0.05, 0.02], [0.13, 0.05, 0.02], [0, 0.1, -0.12]].forEach((pt) => {
    const side = mesh(geo("hairShortSide", () => new THREE.SphereGeometry(0.085, 14, 12)), mat, {}, { outlineScale: 1.03 });
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
  const puff = mesh(new THREE.SphereGeometry(0.07, 12, 10), "#e23c3c");
  puff.scale.set(1.15, 0.85, 1.25);
  const cuff = mesh(new THREE.CylinderGeometry(0.038, 0.042, 0.04, 10), "#f4f0ea");
  cuff.position.y = -0.055;
  g.add(puff, cuff);
  return g;
}

function buildHandPhone() {
  const g = new THREE.Group();
  const body = mesh(new THREE.BoxGeometry(0.08, 0.15, 0.012), "#1b1430", {}, { outline: false });
  const screen = mesh(
    new THREE.BoxGeometry(0.064, 0.128, 0.004),
    new THREE.MeshStandardMaterial({ color: "#8ce7ff", emissive: "#7ad8ff", emissiveIntensity: 0.7, roughness: 0.25, metalness: 0.1 }),
    {},
    { outline: false }
  );
  screen.position.z = 0.007;
  const glow = mesh(
    new THREE.BoxGeometry(0.066, 0.13, 0.002),
    new THREE.MeshStandardMaterial({ color: "#b8f4ff", emissive: "#9be7ff", emissiveIntensity: 0.35, transparent: true, opacity: 0.55, roughness: 0.4 }),
    {},
    { outline: false }
  );
  glow.position.z = 0.009;
  g.add(body, screen, glow);
  g.userData.screen = screen;
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
  const skin = saturate(avatar.skin || "#f1c27d", 0.1);
  const topColor = saturate(avatar.shirt || "#ff7a59", 0.22);
  const hair = avatar.hairColor || "#2b1d16";
  const style = avatar.hair || "short";
  const top = avatar.top || "tshirt";
  const bottom = avatar.bottom || "jeans";
  const bottomColor = saturate(avatar.bottomColor || "#3d4f7c", 0.18);
  const shoe = avatar.shoes || "white";
  const shoeMap = { white: "#fff6ea", black: "#222226", red: "#ff3a3a", gum: "#e8942e" };
  const shoeColor = shoeMap[shoe] || shoeMap.white;
  const accessory = avatar.accessory || "none";
  const hpColor = saturate(avatar.headphoneColor || "#2a2a2e", 0.12);
  const noOL = { outline: false };
  const HIP = 0.62;
  const THIGH = 0.30;
  const SHIN = 0.26;
  const group = new THREE.Group();
  const rig = new THREE.Group();
  group.add(rig);

  const shadow = new THREE.Mesh(
    geo("avatarShadow", () => new THREE.CircleGeometry(0.3, 24)),
    matCached("#000000", { transparent: true, opacity: 0.2, color: 0x000000 }, "basic")
  );
  shadow.rotation.x = -Math.PI / 2;
  shadow.position.y = 0.015;
  shadow.receiveShadow = false;
  shadow.castShadow = false;
  group.add(shadow);

  const skinMat = matCached(skin, { roughness: 0.48 });
  const topMat = matCached(topColor, { roughness: 0.5 });
  const pantMat = matCached(bottomColor, { roughness: 0.55 });
  const shoeMat = matCached(shoeColor, { roughness: 0.42 });
  const soleMat = matCached("#f2ebe3", { roughness: 0.7 });
  const soleDark = matCached(shade("#3d342c", shoe === "black" ? -10 : 0), { roughness: 0.8 });

  const mkShoe = () => {
    const g = new THREE.Group();
    const sole = mesh(geo("shoeSole", () => new THREE.BoxGeometry(0.11, 0.035, 0.22)), soleMat, {}, { outlineScale: 1.03 });
    sole.position.set(0, 0.018, 0.04);
    const heel = mesh(geo("shoeHeel", () => new THREE.BoxGeometry(0.11, 0.05, 0.07)), soleDark, {}, { outlineScale: 1.03 });
    heel.position.set(0, 0.025, -0.055);
    const upper = mesh(geo("shoeUpper", () => new THREE.BoxGeometry(0.105, 0.07, 0.16)), shoeMat, {}, { outlineScale: 1.03 });
    upper.position.set(0, 0.06, 0.02);
    const toe = mesh(geo("shoeToe", () => new THREE.SphereGeometry(0.055, 12, 10)), shoeMat, {}, { outlineScale: 1.03 });
    toe.scale.set(0.95, 0.62, 0.85);
    toe.position.set(0, 0.05, 0.12);
    const tongue = mesh(geo("shoeTongue", () => new THREE.BoxGeometry(0.055, 0.05, 0.06)), shade(shoeColor, 18), {}, noOL);
    tongue.position.set(0, 0.1, 0.04);
    const lace = mesh(geo("shoeLace", () => new THREE.BoxGeometry(0.06, 0.006, 0.08)), "#f7f2ea", {}, noOL);
    lace.position.set(0, 0.1, 0.035);
    g.add(sole, heel, upper, toe, tongue, lace);
    return g;
  };

  const mkLeg = (side) => {
    const leg = new THREE.Group();
    leg.position.set(side * 0.1, HIP, 0);
    const thigh = mesh(geo("thigh", () => new THREE.CapsuleGeometry(0.075, THIGH, 8, 14)), pantMat, {}, { outlineScale: 1.03 });
    thigh.position.y = -THIGH / 2 - 0.02;
    leg.add(thigh);
    const shinG = new THREE.Group();
    shinG.position.y = -THIGH - 0.02;
    const shinLen = bottom === "joggers" ? SHIN * 0.72 : SHIN;
    const shin = mesh(geo(bottom === "joggers" ? "shinJog" : "shin", () => new THREE.CapsuleGeometry(0.058, shinLen, 6, 14)), bottom === "joggers" ? skinMat : pantMat, {}, { outlineScale: 1.03 });
    shin.position.y = -shinLen / 2 - 0.02;
    shinG.add(shin);
    if (bottom === "joggers") {
      const cuff = mesh(geo("pantCuff", () => new THREE.CylinderGeometry(0.07, 0.068, 0.06, 14)), matCached(shade(bottomColor, -16), { roughness: 0.55 }), {}, { outlineScale: 1.03 });
      cuff.position.y = -0.04;
      shinG.add(cuff);
    } else {
      const cuff = mesh(geo("pantHem", () => new THREE.CylinderGeometry(0.065, 0.06, 0.045, 14)), matCached(shade(bottomColor, -12), { roughness: 0.55 }), {}, { outlineScale: 1.03 });
      cuff.position.y = -SHIN + 0.02;
      shinG.add(cuff);
    }
    const knee = mesh(geo("knee", () => new THREE.SphereGeometry(0.062, 12, 10)), bottom === "joggers" ? skinMat : pantMat, {}, { outlineScale: 1.03 });
    knee.position.y = -0.01;
    shinG.add(knee);
    const foot = new THREE.Group();
    foot.position.y = -SHIN - 0.05;
    const shoeMesh = mkShoe();
    shoeMesh.position.y = 0;
    foot.add(shoeMesh);
    shinG.add(foot);
    leg.add(shinG);
    leg.userData.shin = shinG;
    leg.userData.foot = foot;
    return leg;
  };
  const leftLeg = mkLeg(-1);
  const rightLeg = mkLeg(1);
  rig.add(leftLeg, rightLeg);

  const hips = mesh(geo("hipsLathe", () => {
    const pts = [new THREE.Vector2(0.04, -0.06), new THREE.Vector2(0.13, -0.04), new THREE.Vector2(0.145, 0.02), new THREE.Vector2(0.125, 0.08), new THREE.Vector2(0.1, 0.12)];
    return new THREE.LatheGeometry(pts, 20);
  }), pantMat, {}, { outlineScale: 1.03 });
  hips.position.y = HIP;
  rig.add(hips);

  const torso = new THREE.Group();
  torso.position.y = HIP;
  const body = mesh(geo("torsoLathe", () => {
    const pts = [
      new THREE.Vector2(0.125, 0.0),
      new THREE.Vector2(0.13, 0.06),
      new THREE.Vector2(0.105, 0.16),
      new THREE.Vector2(0.1, 0.22),
      new THREE.Vector2(0.125, 0.32),
      new THREE.Vector2(0.132, 0.4),
      new THREE.Vector2(0.115, 0.46),
      new THREE.Vector2(0.07, 0.5),
    ];
    return new THREE.LatheGeometry(pts, 24);
  }), topMat, {}, { outlineScale: 1.03 });
  torso.add(body);
  const shirtHem = mesh(geo("shirtHem", () => new THREE.CylinderGeometry(0.132, 0.128, 0.05, 20)), matCached(shade(topColor, -14), { roughness: 0.5 }), {}, { outlineScale: 1.03 });
  shirtHem.position.y = 0.04;
  torso.add(shirtHem);
  const shoulderL = mesh(geo("shoulder", () => new THREE.SphereGeometry(0.075, 14, 12)), topMat, {}, { outlineScale: 1.03 });
  const shoulderR = shoulderL.clone();
  shoulderL.position.set(-0.16, 0.45, 0);
  shoulderR.position.set(0.16, 0.45, 0);
  torso.add(shoulderL, shoulderR);

  if (top === "hoodie") {
    const pocket = mesh(geo("hoodiePocket", () => new THREE.BoxGeometry(0.2, 0.1, 0.04)), matCached(shade(topColor, -14), { roughness: 0.5 }), {}, { outlineScale: 1.03 });
    pocket.position.set(0, 0.16, 0.12);
    const hood = mesh(geo("hoodieHood", () => new THREE.SphereGeometry(0.16, 18, 14, 0, Math.PI * 2, 0, Math.PI / 1.5)), matCached(shade(topColor, -8), { roughness: 0.5 }), {}, { outlineScale: 1.03 });
    hood.position.set(0, 0.58, -0.08);
    hood.rotation.x = 0.28;
    const strL = mesh(geo("hoodieString", () => new THREE.CapsuleGeometry(0.01, 0.14, 3, 8)), matCached(shade(topColor, -24), { roughness: 0.5 }), {}, noOL);
    const strR = strL.clone();
    strL.position.set(-0.05, 0.36, 0.13);
    strR.position.set(0.05, 0.36, 0.13);
    strL.rotation.x = 0.45;
    strR.rotation.x = 0.45;
    torso.add(pocket, hood, strL, strR);
  } else if (top === "jacket") {
    const lapelL = mesh(geo("jacketLapel", () => new THREE.CapsuleGeometry(0.03, 0.24, 4, 8)), matCached(shade(topColor, -20), { roughness: 0.5 }), {}, { outlineScale: 1.03 });
    const lapelR = lapelL.clone();
    lapelL.position.set(-0.08, 0.3, 0.12);
    lapelR.position.set(0.08, 0.3, 0.12);
    lapelL.rotation.z = 0.35;
    lapelR.rotation.z = -0.35;
    const collarL = mesh(geo("jacketCollar", () => new THREE.BoxGeometry(0.08, 0.06, 0.05)), matCached(shade(topColor, -26), { roughness: 0.5 }), {}, { outlineScale: 1.03 });
    const collarR = collarL.clone();
    collarL.position.set(-0.07, 0.46, 0.09);
    collarR.position.set(0.07, 0.46, 0.09);
    torso.add(lapelL, lapelR, collarL, collarR);
  }

  const sleeveLen = top === "tshirt" ? 0.14 : 0.2;
  const mkArm = (side) => {
    const arm = new THREE.Group();
    arm.position.set(side * 0.2, 0.45, 0);
    const upper = mesh(geo(top === "tshirt" ? "upperArmShort" : "upperArmLong", () => new THREE.CapsuleGeometry(0.05, sleeveLen, 6, 14)), topMat, {}, { outlineScale: 1.03 });
    upper.position.y = -sleeveLen / 2 - 0.02;
    arm.add(upper);
    if (top === "tshirt") {
      const cuff = mesh(geo("sleeveCuff", () => new THREE.CylinderGeometry(0.055, 0.052, 0.04, 12)), matCached(shade(topColor, -12), { roughness: 0.5 }), {}, { outlineScale: 1.03 });
      cuff.position.y = -sleeveLen - 0.02;
      arm.add(cuff);
    }
    const forearmG = new THREE.Group();
    forearmG.position.y = -0.2;
    const forearm = mesh(geo("forearm", () => new THREE.CapsuleGeometry(0.042, 0.16, 6, 12)), skinMat, {}, { outlineScale: 1.03 });
    forearm.position.y = -0.1;
    forearmG.add(forearm);
    const elbow = mesh(geo("elbow", () => new THREE.SphereGeometry(0.048, 12, 10)), top === "tshirt" ? skinMat : topMat, {}, { outlineScale: 1.03 });
    forearmG.add(elbow);
    const hand = new THREE.Group();
    hand.position.y = -0.2;
    const palm = mesh(geo("palm", () => new THREE.BoxGeometry(0.055, 0.07, 0.03)), skinMat, {}, { outlineScale: 1.03 });
    palm.position.y = -0.02;
    const fingers = mesh(geo("fingers", () => new THREE.CapsuleGeometry(0.016, 0.04, 4, 10)), skinMat, {}, { outlineScale: 1.03 });
    fingers.position.set(0, -0.065, 0.005);
    const thumb = mesh(geo("thumb", () => new THREE.CapsuleGeometry(0.013, 0.032, 4, 10)), skinMat, {}, { outlineScale: 1.03 });
    thumb.position.set(side * 0.036, -0.015, 0.016);
    thumb.rotation.z = side * 0.85;
    thumb.rotation.x = -0.35;
    hand.add(palm, fingers, thumb);
    hand.userData.thumb = thumb;
    forearmG.add(hand);
    arm.add(forearmG);
    arm.userData.forearm = forearmG;
    arm.userData.hand = hand;
    return arm;
  };
  const leftArm = mkArm(-1);
  const rightArm = mkArm(1);
  const handL = leftArm.userData.hand;
  const handR = rightArm.userData.hand;
  if (avatar.boxing) {
    const gL = buildGlove();
    const gR = buildGlove();
    gL.position.set(0, -0.02, 0.02);
    gR.position.set(0, -0.02, 0.02);
    handL.add(gL);
    handR.add(gR);
  } else if (avatar.heldItem) {
    const food = buildHeldItem(avatar.heldItem.kind);
    food.position.set(0.02, -0.02, 0.07);
    handR.add(food);
    group.userData._heldFoodTmp = food;
  } else if (avatar.prop) {
    const prop = buildProp(avatar.prop);
    prop.scale.setScalar(1.05);
    prop.position.set(0.02, -0.02, 0.07);
    handR.add(prop);
  }
  torso.add(leftArm, rightArm);

  const neck = mesh(geo("neck", () => new THREE.CapsuleGeometry(0.045, 0.09, 6, 12)), skinMat, {}, { outlineScale: 1.03 });
  neck.position.y = 0.56;
  torso.add(neck);

  const head = new THREE.Group();
  head.position.y = 0.78;
  const skull = mesh(geo("headLathe", () => {
    const pts = [
      new THREE.Vector2(0.001, -0.155),
      new THREE.Vector2(0.032, -0.15),
      new THREE.Vector2(0.068, -0.125),
      new THREE.Vector2(0.092, -0.09),
      new THREE.Vector2(0.108, -0.04),
      new THREE.Vector2(0.118, 0.02),
      new THREE.Vector2(0.122, 0.08),
      new THREE.Vector2(0.115, 0.145),
      new THREE.Vector2(0.09, 0.195),
      new THREE.Vector2(0.048, 0.22),
      new THREE.Vector2(0.001, 0.228),
    ];
    return new THREE.LatheGeometry(pts, 28);
  }), skinMat, {}, { outlineScale: 1.03 });
  head.add(skull);
  const chin = mesh(geo("chin", () => new THREE.SphereGeometry(0.04, 14, 12)), skinMat, {}, { outlineScale: 1.03 });
  chin.scale.set(0.9, 0.7, 0.75);
  chin.position.set(0, -0.145, 0.04);
  const cheekL = mesh(geo("cheek", () => new THREE.SphereGeometry(0.04, 12, 10)), matCached(shade(skin, 16), { roughness: 0.5 }), {}, noOL);
  const cheekR = cheekL.clone();
  cheekL.position.set(-0.085, -0.03, 0.09);
  cheekR.position.set(0.085, -0.03, 0.09);
  head.add(chin, cheekL, cheekR);

  const earL = mesh(geo("ear", () => new THREE.SphereGeometry(0.038, 12, 10)), matCached(shade(skin, -8), { roughness: 0.48 }), {}, { outlineScale: 1.03 });
  earL.scale.set(0.55, 1.15, 0.8);
  const earR = earL.clone();
  earL.position.set(-0.125, 0.01, -0.01);
  earR.position.set(0.125, 0.01, -0.01);
  const innerL = mesh(geo("earInner", () => new THREE.SphereGeometry(0.018, 8, 8)), matCached(shade(skin, -20), { roughness: 0.5 }), {}, noOL);
  innerL.scale.set(0.45, 0.9, 0.5);
  const innerR = innerL.clone();
  innerL.position.set(-0.13, 0.01, 0.005);
  innerR.position.set(0.13, 0.01, 0.005);
  head.add(earL, earR, innerL, innerR);

  const eyeWhite = matCached("#fffef8", { roughness: 0.28 });
  const irisC = matCached("#3d2a1c", { roughness: 0.35 });
  const brows = [];
  [[-0.048, 0.035, 0.108], [0.048, 0.035, 0.108]].forEach(([x, y, z], i) => {
    const w = mesh(geo("eyeWhite", () => new THREE.SphereGeometry(0.032, 16, 12)), eyeWhite, {}, noOL);
    w.scale.set(1.15, 1.05, 0.55);
    w.position.set(x, y, z);
    const lid = mesh(geo("eyelid", () => new THREE.SphereGeometry(0.033, 14, 10, 0, Math.PI * 2, 0, Math.PI / 2)), skinMat, {}, noOL);
    lid.scale.set(1.2, 0.55, 0.6);
    lid.position.set(x, y + 0.012, z);
    const iris = mesh(geo("iris", () => new THREE.SphereGeometry(0.018, 14, 12)), irisC, {}, noOL);
    iris.position.set(x, y - 0.001, z + 0.012);
    const pupil = mesh(geo("pupil", () => new THREE.SphereGeometry(0.01, 10, 8)), matCached("#14110f", { roughness: 0.3 }), {}, noOL);
    pupil.position.set(x, y - 0.001, z + 0.022);
    const shine = mesh(geo("eyeShine", () => new THREE.SphereGeometry(0.007, 8, 8)), matCached("#ffffff", { roughness: 0.2 }), {}, noOL);
    shine.position.set(x + 0.008, y + 0.008, z + 0.026);
    head.add(w, lid, iris, pupil, shine);
    const brow = mesh(geo("brow", () => new THREE.CapsuleGeometry(0.008, 0.05, 3, 8)), matCached(shade(hair, 8), { roughness: 0.6 }), {}, noOL);
    brow.rotation.z = Math.PI / 2 + (i === 0 ? 0.18 : -0.18);
    brow.position.set(x, y + 0.042, z + 0.002);
    head.add(brow);
    brows.push(brow);
  });

  const nose = new THREE.Group();
  const bridge = mesh(geo("noseBridge", () => new THREE.CapsuleGeometry(0.012, 0.05, 4, 8)), matCached(shade(skin, -10), { roughness: 0.48 }), {}, noOL);
  bridge.rotation.x = 0.35;
  bridge.position.set(0, 0.01, 0.118);
  const tip = mesh(geo("noseTip", () => new THREE.SphereGeometry(0.018, 12, 10)), matCached(shade(skin, -14), { roughness: 0.48 }), {}, noOL);
  tip.scale.set(0.95, 0.75, 1.05);
  tip.position.set(0, -0.02, 0.138);
  const nosL = mesh(geo("nostril", () => new THREE.SphereGeometry(0.01, 8, 8)), matCached(shade(skin, -22), { roughness: 0.5 }), {}, noOL);
  const nosR = nosL.clone();
  nosL.position.set(-0.012, -0.028, 0.125);
  nosR.position.set(0.012, -0.028, 0.125);
  nose.add(bridge, tip, nosL, nosR);
  head.add(nose);

  const mouths = {};
  const mouthSmile = new THREE.Group();
  const upperLip = mesh(geo("lipUpper", () => new THREE.TorusGeometry(0.032, 0.007, 8, 16, Math.PI)), matCached("#d06472", { roughness: 0.45 }), {}, noOL);
  upperLip.position.set(0, -0.068, 0.11);
  upperLip.rotation.set(Math.PI * 0.15, 0, Math.PI);
  const lowerLip = mesh(geo("lipLower", () => new THREE.TorusGeometry(0.03, 0.008, 8, 16, Math.PI * 0.9)), matCached("#c45264", { roughness: 0.45 }), {}, noOL);
  lowerLip.position.set(0, -0.078, 0.108);
  lowerLip.rotation.set(Math.PI * 0.95, 0, 0);
  mouthSmile.add(upperLip, lowerLip);
  const mouthLaugh = new THREE.Group();
  const open = mesh(geo("mouthOpen", () => new THREE.SphereGeometry(0.032, 12, 10)), matCached("#6a1c28", { roughness: 0.5 }), {}, noOL);
  open.scale.set(1.2, 0.75, 0.5);
  open.position.set(0, -0.075, 0.1);
  const teeth = mesh(geo("teeth", () => new THREE.BoxGeometry(0.055, 0.012, 0.01)), matCached("#fffaf4", { roughness: 0.35 }), {}, noOL);
  teeth.position.set(0, -0.062, 0.118);
  mouthLaugh.add(open, teeth);
  const mouthSad = new THREE.Group();
  const frown = mesh(geo("mouthFrown", () => new THREE.TorusGeometry(0.03, 0.007, 8, 16, Math.PI)), matCached("#c45a68", { roughness: 0.45 }), {}, noOL);
  frown.position.set(0, -0.088, 0.1);
  frown.rotation.set(-Math.PI * 0.12, 0, Math.PI);
  mouthSad.add(frown);
  mouths.smile = mouthSmile;
  mouths.laugh = mouthLaugh;
  mouths.sad = mouthSad;
  mouthLaugh.visible = false;
  mouthSad.visible = false;
  head.add(mouthSmile, mouthLaugh, mouthSad);
  addHair(head, style, hair);

  if (avatar.glasses) {
    const frame = matCached("#1c1c1c", { roughness: 0.4, metalness: 0.15 });
    const lens = new THREE.MeshStandardMaterial({ color: "#2a2430", transparent: true, opacity: 0.32, roughness: 0.12, metalness: 0.1 });
    const g1 = mesh(geo("glassRim", () => new THREE.TorusGeometry(0.038, 0.007, 8, 16)), frame, {}, noOL);
    const g2 = g1.clone();
    g1.position.set(-0.048, 0.035, 0.12);
    g2.position.set(0.048, 0.035, 0.12);
    const l1 = mesh(geo("glassLens", () => new THREE.CircleGeometry(0.034, 16)), lens, {}, noOL);
    const l2 = l1.clone();
    l1.position.set(-0.048, 0.035, 0.12);
    l2.position.set(0.048, 0.035, 0.12);
    const bar = mesh(geo("glassBar", () => new THREE.CapsuleGeometry(0.005, 0.022, 3, 6)), frame, {}, noOL);
    bar.rotation.z = Math.PI / 2;
    bar.position.set(0, 0.035, 0.12);
    head.add(g1, g2, l1, l2, bar);
  }
  if (accessory === "cap") {
    const brim = mesh(geo("capBrim", () => new THREE.SphereGeometry(0.12, 16, 12)), topMat, {}, { outlineScale: 1.03 });
    brim.scale.set(1.2, 0.18, 1.4);
    brim.position.set(0, 0.12, 0.12);
    const dome = mesh(geo("capDome", () => new THREE.SphereGeometry(0.15, 18, 14, 0, Math.PI * 2, 0, Math.PI / 2)), matCached(shade(topColor, -8), { roughness: 0.5 }), {}, { outlineScale: 1.03 });
    dome.position.set(0, 0.13, 0);
    head.add(brim, dome);
  } else if (accessory === "beanie") {
    const beanie = mesh(geo("beanie", () => new THREE.SphereGeometry(0.155, 18, 14, 0, Math.PI * 2, 0, Math.PI / 1.55)), matCached(saturate("#3d4f7c", 0.15), { roughness: 0.6 }), {}, { outlineScale: 1.03 });
    beanie.position.set(0, 0.1, -0.01);
    const pom = mesh(geo("beaniePom", () => new THREE.SphereGeometry(0.04, 10, 8)), matCached("#fff6ea", { roughness: 0.7 }), {}, { outlineScale: 1.03 });
    pom.position.set(0, 0.26, 0);
    head.add(beanie, pom);
  } else if (accessory === "chain") {
    const chain = mesh(geo("chain", () => new THREE.TorusGeometry(0.09, 0.01, 8, 20)), matCached("#ffd24a", { roughness: 0.3, metalness: 0.55 }), {}, noOL);
    chain.position.set(0, 0.42, 0.09);
    chain.rotation.x = 0.95;
    torso.add(chain);
  } else if (accessory === "headphones") {
    const band = mesh(geo("hpBand", () => new THREE.TorusGeometry(0.16, 0.018, 10, 24, Math.PI)), matCached(hpColor, { roughness: 0.45 }), {}, { outlineScale: 1.03 });
    band.position.set(0, 0.04, 0);
    const cupL = mesh(geo("hpCup", () => new THREE.SphereGeometry(0.05, 14, 12)), matCached(hpColor, { roughness: 0.45 }), {}, { outlineScale: 1.03 });
    cupL.scale.set(0.55, 1.1, 1.1);
    const cupR = cupL.clone();
    cupL.position.set(-0.13, 0.01, 0);
    cupR.position.set(0.13, 0.01, 0);
    const padL = mesh(geo("hpPad", () => new THREE.TorusGeometry(0.032, 0.01, 8, 16)), matCached(shade(hpColor, -32), { roughness: 0.6 }), {}, noOL);
    padL.rotation.y = Math.PI / 2;
    const padR = padL.clone();
    padL.position.set(-0.12, 0.01, 0);
    padR.position.set(0.12, 0.01, 0);
    head.add(band, cupL, cupR, padL, padR);
  }

  torso.add(head);
  rig.add(torso);

  group.userData = {
    rig,
    leftLeg,
    rightLeg,
    leftArm,
    rightArm,
    leftShin: leftLeg.userData.shin,
    rightShin: rightLeg.userData.shin,
    leftFoot: leftLeg.userData.foot,
    rightFoot: rightLeg.userData.foot,
    leftForearm: leftArm.userData.forearm,
    rightForearm: rightArm.userData.forearm,
    leftHand: handL,
    rightHand: handR,
    torso,
    head,
    neck,
    shadow,
    phase: 0,
    heldFood: group.userData._heldFoodTmp || null,
    mouths,
    brows,
    thumbR: handR.userData.thumb,
    thumbL: handL.userData.thumb,
    handY: 0,
    mouthShape: "smile",
    sculpted: true,
  };
  group.scale.setScalar(1.16);
  applyJointBends(group.userData, {});
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
    const sq = 0.125;
    const boardRoot = new THREE.Group();
    boardRoot.position.y = 0.76;
    for (let r = 0; r < 8; r++) {
      for (let c = 0; c < 8; c++) {
        const light = (r + c) % 2 === 0;
        const cell = new THREE.Mesh(new THREE.BoxGeometry(sq, 0.02, sq), paint(light ? "#f3eadc" : "#3d2c29"));
        cell.position.set((c - 3.5) * sq, 0, (r - 3.5) * sq);
        boardRoot.add(cell);
      }
    }
    g.add(boardRoot);
    g.userData.boardSquare = sq;
    g.userData.tableSize = 1.7;
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
  if (!ghost) addFurnitureHitbox(g, type);
  return g;
}

const INTERACTIVE_TYPES = new Set([
  "couch", "chair", "tv", "chesstable", "fridge", "punchbag",
  "benchpress", "treadmill", "cubics", "clothescab", "coffeemachine",
]);

function addFurnitureHitbox(g, type) {
  if (!INTERACTIVE_TYPES.has(type)) return;
  const [fw, fh] = furnSize(type);
  const hx = Math.max(fw * 0.98, type === "coffeemachine" ? 0.95 : 0.75);
  const hz = Math.max(fh * 0.98, type === "coffeemachine" ? 0.95 : 0.75);
  const hy = type === "coffeemachine" ? 1.25
    : (type === "cubics" || type === "clothescab" || type === "fridge" || type === "tv") ? 1.85
    : type === "punchbag" ? 2.2
    : 1.15;
  const box = new THREE.Mesh(
    geo("hit:" + type, () => new THREE.BoxGeometry(hx, hy, hz)),
    new THREE.MeshBasicMaterial({ visible: false, transparent: true, opacity: 0, depthWrite: false })
  );
  box.position.y = hy / 2;
  box.userData.hitbox = true;
  g.add(box);
}

export function createAvatarPreview(container) {
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(capPixelRatio());
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.shadowMap.enabled = true;
  container.innerHTML = "";
  container.appendChild(renderer.domElement);
  const scene = new THREE.Scene();
  scene.add(new THREE.HemisphereLight(0xfff3e6, 0x9aa6b0, 1.1));
  scene.add(new THREE.AmbientLight(0xfff4ea, 0.55));
  const sun = new THREE.DirectionalLight(0xfff4e4, 1.15);
  sun.position.set(2.2, 4.2, 3.2);
  sun.castShadow = true;
  scene.add(sun);
  const fill = new THREE.DirectionalLight(0xfff6e8, 0.75);
  fill.position.set(-1.4, 2.4, 4.2);
  scene.add(fill);
  const previewRim = new THREE.DirectionalLight(0xfff8f0, 0.5);
  previewRim.position.set(-1.6, 1.8, -3.2);
  scene.add(previewRim);
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
      disposeObject3D(meshObj);
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
  const renderer = new THREE.WebGLRenderer({ antialias: !isPhoneView(), alpha: false });
  renderer.setPixelRatio(capPixelRatio());
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.18;
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

  const hemi = new THREE.HemisphereLight(0xfff3e6, 0xb7c2c8, 1.1);
  const ambient = new THREE.AmbientLight(0xfff4ea, 0.62);
  scene.add(hemi);
  scene.add(ambient);
  const sun = new THREE.DirectionalLight(0xfff0dc, 1.05);
  sun.position.set(5.5, 10, 4.5);
  sun.castShadow = true;
  sun.shadow.mapSize.set(isPhoneView() ? 512 : 1024, isPhoneView() ? 512 : 1024);
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

  function measureRoomViewExtents() {
    camera.updateMatrixWorld(true);
    const inv = camera.matrixWorldInverse;
    const half = gridSize / 2;
    const pts = [
      [-half, 0, -half], [half, 0, -half], [-half, 0, half], [half, 0, half],
      [-half, WALL_H, -half], [half, WALL_H, -half], [-half, WALL_H, half],
      [half, 1.9, half], [-half, 1.9, half], [half, 1.9, -half],
    ];
    let maxX = 0;
    let maxY = 0;
    for (const [x, y, z] of pts) {
      _tmpV1.set(x, y, z).applyMatrix4(inv);
      maxX = Math.max(maxX, Math.abs(_tmpV1.x));
      maxY = Math.max(maxY, Math.abs(_tmpV1.y));
    }
    return { halfW: maxX + 0.45, halfH: maxY + 0.45 };
  }

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
  controls.addEventListener("change", () => {
    if (isPhoneView() && camMode === "follow") userZoom = camera.zoom;
  });

  const fill = new THREE.DirectionalLight(0xffe8d8, 0.85);
  fill.position.set(-4, 5.5, 7);
  scene.add(fill);
  const rim = new THREE.DirectionalLight(0xfff8f2, 0.55);
  rim.position.copy(camera.position).multiplyScalar(-0.4).add(new THREE.Vector3(-2, 3, -4));
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
  let followName = null;
  let camMode = "follow";
  let userZoom = 2;
  const FOLLOW_ZOOM_DEFAULT = 2;
  let lastTapAt = 0;
  let lastTapX = 0;
  let lastTapY = 0;
  let tapLock = false;


  function applyCameraFraming() {
    const phone = isPhoneView();
    if (!phone) {
      controls.enableRotate = true;
      return;
    }
    controls.enableRotate = camMode !== "follow";
    if (camMode === "room") {
      controls.target.set(0, 0.45, 0);
      camera.position.set(9.5, 9.2, 9.5);
      if (Math.abs(camera.zoom - 1) > 1e-4) {
        camera.zoom = 1;
        camera.updateProjectionMatrix();
      } else camera.zoom = 1;
      return;
    }
    const m = followName ? peopleMeshes.get(followName) : null;
    const tx = m ? m.position.x : 0;
    const ty = 0.72;
    const tz = m ? m.position.z : 0;
    controls.target.set(tx, ty, tz);
    camera.position.set(tx + 9.5, ty + 8.75, tz + 9.5);
    if (Math.abs(camera.zoom - userZoom) > 1e-4) {
      camera.zoom = userZoom;
      camera.updateProjectionMatrix();
    } else camera.zoom = userZoom;
  }

  function setCamMode(mode) {
    camMode = mode === "room" ? "room" : "follow";
    if (camMode === "follow" && isPhoneView() && userZoom < 1.15) userZoom = FOLLOW_ZOOM_DEFAULT;
    applyCameraFraming();
    return camMode;
  }

  function toggleCamMode() {
    return setCamMode(camMode === "follow" ? "room" : "follow");
  }

  function resize() {
    const w = container.clientWidth || 800;
    const h = container.clientHeight || 500;
    renderer.setPixelRatio(capPixelRatio());
    renderer.setSize(w, h, false);
    const a = Math.max(0.15, w / Math.max(1, h));
    const need = measureRoomViewExtents();
    const base = frustumSize();
    // Desktop framing (never zoom in tighter than this).
    let halfW = Math.max(need.halfW, (base * a) / 2);
    let halfH = Math.max(need.halfH, base / 2);
    // Keep the camera aspect and make sure the whole cube stays in frame at zoom 1.
    if (halfW / halfH < a) halfW = halfH * a;
    else halfH = halfW / a;
    camera.left = -halfW;
    camera.right = halfW;
    camera.top = halfH;
    camera.bottom = -halfH;
    const fitZoom = Math.min(halfW / need.halfW, halfH / need.halfH);
    if (isPhoneView()) {
      controls.minZoom = 0.9;
      controls.maxZoom = 2.6;
      if (camMode === "room") camera.zoom = 1;
      else camera.zoom = userZoom || FOLLOW_ZOOM_DEFAULT;
    } else {
      camera.zoom = 1;
      controls.minZoom = 0.7;
      controls.maxZoom = Math.max(1, Math.min(1.85, fitZoom));
    }
    camera.updateProjectionMatrix();
    applyCameraFraming();
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
    const box = new THREE.Box3().setFromObject(m);
    box.getCenter(_tmpV1);
    _tmpV1.y = box.min.y + Math.min(0.7, Math.max(0.2, (box.max.y - box.min.y) * 0.4));
    _tmpV1.project(camera);
    const rect = renderer.domElement.getBoundingClientRect();
    return {
      x: rect.left + (_tmpV1.x * 0.5 + 0.5) * rect.width,
      y: rect.top + (-_tmpV1.y * 0.5 + 0.5) * rect.height,
      visible: _tmpV1.z < 1,
    };
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

  function layoutChessPieces(root, fen, square = 0.125) {
    if (!root) return;
    while (root.children.length) root.remove(root.children[0]);
    if (!fen) return;
    const k = square / 0.18;
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
        if (kind === "p") piece = new THREE.Mesh(new THREE.CylinderGeometry(0.045 * k, 0.05 * k, 0.1 * k, 8), std(color));
        else if (kind === "r") piece = new THREE.Mesh(new THREE.BoxGeometry(0.08 * k, 0.14 * k, 0.08 * k), std(color));
        else if (kind === "n") piece = new THREE.Mesh(new THREE.ConeGeometry(0.05 * k, 0.14 * k, 8), std(color));
        else if (kind === "b") piece = new THREE.Mesh(new THREE.ConeGeometry(0.045 * k, 0.16 * k, 6), std(color));
        else if (kind === "q") piece = new THREE.Mesh(new THREE.SphereGeometry(0.055 * k, 10, 8), std(color));
        else piece = new THREE.Mesh(new THREE.CylinderGeometry(0.05 * k, 0.06 * k, 0.18 * k, 10), std(color));
        piece.position.set((c - 3.5) * square, 0.07 * k, (7 - r - 3.5) * square);
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
      if (m.userData.pieces) layoutChessPieces(m.userData.pieces, chessMap[id]?.fen, m.userData.boardSquare || 0.125);
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
      m.userData.usingPhone = Boolean(p.usingPhone);
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
    const ev = event && event.clientX != null ? event : pointerPos(event);
    if (!ev || ev.x == null && ev.clientX == null) return null;
    const x = ev.clientX != null ? ev.clientX : ev.x;
    const y = ev.clientY != null ? ev.clientY : ev.y;
    const rect = renderer.domElement.getBoundingClientRect();
    if (!rect.width || !rect.height) return null;
    pointer.x = ((x - rect.left) / rect.width) * 2 - 1;
    pointer.y = -((y - rect.top) / rect.height) * 2 + 1;
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
    if (!raycaster.ray.intersectPlane(_floorPlane, _tmpV1)) return null;
    return tileFromPoint(_tmpV1);
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
    if (tile) {
      const furn = furnitureAtTile(tile.tx, tile.ty);
      if (furn && INTERACTIVE_TYPES.has(furn.type) && !placing) {
        onFurnitureClick?.(furn.id, furn.type, {});
        return;
      }
      const p = pointerPos(e);
      if (p && isPhoneView() && !placing && lastTapAt && (performance.now() - lastTapAt) < 320 && Math.hypot(p.x - lastTapX, p.y - lastTapY) < 28) {
        lastTapAt = 0;
        toggleCamMode();
        return "cam";
      }
      onTileClick?.(tile.tx, tile.ty);
    }
  }

  function furnitureAtTile(tx, ty) {
    for (const f of furnitureList) {
      const [w, h] = furnDims(f.type, f.rot);
      if (tx >= f.x && tx < f.x + w && ty >= f.y && ty < f.y + h) return f;
    }
    return null;
  }
  function finishTap(e) {
    if (!downPt || tapLock) return;
    if (e && e.pointerId != null && downPt.id != null && e.pointerId !== downPt.id && e.type !== "touchend") return;
    const p = pointerPos(e);
    const moved = p ? Math.hypot(p.x - downPt.x, p.y - downPt.y) : 0;
    const slop = slopFor(downPt.type);
    const start = downPt;
    downPt = null;
    if (moved > slop) return;
    tapLock = true;
    const result = handleTap(e || { clientX: start.x, clientY: start.y });
    if (p && result !== "cam") {
      lastTapAt = performance.now();
      lastTapX = p.x;
      lastTapY = p.y;
    }
    setTimeout(() => { tapLock = false; }, 40);
  }
  renderer.domElement.addEventListener("pointerdown", (e) => {
    const p = pointerPos(e);
    if (!p) return;
    downPt = { x: p.x, y: p.y, id: e.pointerId, type: e.pointerType || "touch" };
  });
  renderer.domElement.addEventListener("pointerup", (e) => finishTap(e));
  renderer.domElement.addEventListener("touchend", (e) => finishTap(e), { passive: true });
  renderer.domElement.addEventListener("pointercancel", () => {
    // Keep downPt so a following touchend can still count as a tap on iOS.
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
        _tmpV1.copy(ud.target).sub(pet.position);
        const dist = Math.hypot(_tmpV1.x, _tmpV1.z);
        if (dist > 0.05 && !ud.sitReady) pet.rotation.y = Math.atan2(_tmpV1.x, _tmpV1.z);
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
    applyCameraFraming();
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
        usingPhone: Boolean(m.userData.usingPhone),
        sculpted: Boolean(m.userData.sculpted),
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
    setFollowName(name) { followName = name || null; },
    setCamMode,
    toggleCamMode,
    camState() {
      return {
        mode: isPhoneView() ? camMode : "room",
        zoom: camera.zoom,
        phone: isPhoneView(),
        follow: followName,
        target: { x: controls.target.x, y: controls.target.y, z: controls.target.z },
      };
    },
    chessBoardInfo(id) {
      const m = findFurnMesh(id);
      if (!m || m.userData.type !== "chesstable") return null;
      const sq = m.userData.boardSquare || 0.125;
      return { square: sq, board: sq * 8, table: m.userData.tableSize || 1.7 };
    },
    setZoom(z) {
      const next = Number(z) || 1;
      camera.zoom = next;
      userZoom = next;
      camera.updateProjectionMatrix();
    },
    tapAt(x, y) {
      handleTap({ clientX: x, clientY: y });
    },
    roomFitsView() {
      const canvas = renderer.domElement;
      const rect = canvas.getBoundingClientRect();
      camera.updateMatrixWorld(true);
      const half = gridSize / 2;
      const pts = [
        [-half, 0, -half], [half, 0, -half], [-half, 0, half], [half, 0, half],
        [-half, WALL_H, -half], [half, WALL_H, -half], [-half, WALL_H, half],
      ];
      const pad = 3;
      const clipped = [];
      for (const p of pts) {
        _tmpV1.set(p[0], p[1], p[2]).project(camera);
        const x = rect.left + (_tmpV1.x * 0.5 + 0.5) * rect.width;
        const y = rect.top + (-_tmpV1.y * 0.5 + 0.5) * rect.height;
        const ok = x >= rect.left - pad && x <= rect.right + pad && y >= rect.top - pad && y <= rect.bottom + pad;
        if (!ok) clipped.push({ x, y, nx: _tmpV1.x, ny: _tmpV1.y });
      }
      return { ok: clipped.length === 0, clipped, rect: { left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom, width: rect.width, height: rect.height } };
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
