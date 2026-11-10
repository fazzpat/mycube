/* Low-poly V-ego renderer: 8 iso angles, toon shade, quantized pixel outline. */
export const AV_W = 24;
export const AV_H = 64;
const RS = 2; // render scale
const RW = AV_W * RS;
const RH = AV_H * RS;

function hexToRgb(hex) {
  const n = parseInt(String(hex).replace("#", ""), 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}
function shade(hex, amt) {
  const { r, g, b } = hexToRgb(hex);
  const c = (v) => Math.max(0, Math.min(255, v + amt));
  return "#" + ((1 << 24) + (c(r) << 16) + (c(g) << 8) + c(b)).toString(16).slice(1);
}
function mix(a, b, t) {
  const A = hexToRgb(a), B = hexToRgb(b);
  const c = (x, y) => Math.round(x + (y - x) * t);
  return "#" + ((1 << 24) + (c(A.r, B.r) << 16) + (c(A.g, B.g) << 8) + c(A.b, B.b)).toString(16).slice(1);
}

const L = { x: -0.52, y: 0.78, z: 0.34 };
(function normLight() {
  const m = Math.hypot(L.x, L.y, L.z) || 1;
  L.x /= m; L.y /= m; L.z /= m;
})();

export function facingIndex8(facing, dirX, dirY) {
  let dx = 0, dy = 1;
  if (facing && (facing.x !== undefined || facing.z !== undefined || facing.y !== undefined)) {
    dx = facing.x || 0;
    dy = facing.z !== undefined ? facing.z : (facing.y || 0);
  } else {
    dx = dirX || 0;
    dy = dirY || 0;
  }
  if (dx === 0 && dy === 0) dy = 1;
  let ang = Math.atan2(dy, dx); // 0 = +x (SE)
  if (ang < 0) ang += Math.PI * 2;
  return Math.round(ang / (Math.PI / 4)) & 7;
}

export function yawFromDir(dir) {
  return dir * (Math.PI / 4);
}

function toon(rgb, nx, ny, nz, opts = {}) {
  const nd = nx * L.x + ny * L.y + nz * L.z;
  let t;
  if (nd > 0.72) t = opts.spec ? 1.38 : 1.22;
  else if (nd > 0.28) t = 1.0;
  else if (nd > -0.05) t = 0.74;
  else t = 0.48;
  if (opts.fold && nd < 0.15) t *= 0.88;
  return {
    r: Math.max(0, Math.min(255, Math.round(rgb.r * t))),
    g: Math.max(0, Math.min(255, Math.round(rgb.g * t))),
    b: Math.max(0, Math.min(255, Math.round(rgb.b * t))),
  };
}

function unitSphere(lat = 9, lon = 12) {
  const verts = [];
  const tris = [];
  for (let i = 0; i <= lat; i++) {
    const v = i / lat, phi = v * Math.PI;
    const y = Math.cos(phi), r = Math.sin(phi);
    for (let j = 0; j <= lon; j++) {
      const u = j / lon, th = u * Math.PI * 2;
      const x = Math.cos(th) * r, z = Math.sin(th) * r;
      verts.push({ x, y, z });
    }
  }
  const stride = lon + 1;
  for (let i = 0; i < lat; i++) {
    for (let j = 0; j < lon; j++) {
      const a = i * stride + j;
      const b = a + stride;
      if (i !== 0) tris.push([a, b, a + 1]);
      if (i !== lat - 1) tris.push([a + 1, b, b + 1]);
    }
  }
  return { verts, tris };
}

function unitBox() {
  const verts = [
    { x: -1, y: -1, z: -1 }, { x: 1, y: -1, z: -1 }, { x: 1, y: 1, z: -1 }, { x: -1, y: 1, z: -1 },
    { x: -1, y: -1, z: 1 }, { x: 1, y: -1, z: 1 }, { x: 1, y: 1, z: 1 }, { x: -1, y: 1, z: 1 },
  ];
  const faces = [
    [0, 1, 2, 3], [5, 4, 7, 6], [4, 0, 3, 7], [1, 5, 6, 2], [3, 2, 6, 7], [4, 5, 1, 0],
  ];
  const tris = [];
  for (const f of faces) tris.push([f[0], f[1], f[2]], [f[0], f[2], f[3]]);
  return { verts, tris };
}

const SPHERE = unitSphere(8, 10);
const BOX = unitBox();

function rotateYaw(p, yaw) {
  const c = Math.cos(yaw), s = Math.sin(yaw);
  return { x: p.z * c - p.x * s, y: p.y, z: p.z * s + p.x * c };
}

function addOutline(img, w, h, ink = { r: 18, g: 12, b: 16 }) {
  const out = new Uint8ClampedArray(img);
  const solid = (i) => img[i * 4 + 3] > 160;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      if (solid(i)) continue;
      let n = false;
      if (x > 0 && solid(i - 1)) n = true;
      else if (x + 1 < w && solid(i + 1)) n = true;
      else if (y > 0 && solid(i - w)) n = true;
      else if (y + 1 < h && solid(i + w)) n = true;
      if (!n) continue;
      const p = i * 4;
      out[p] = ink.r; out[p + 1] = ink.g; out[p + 2] = ink.b; out[p + 3] = 255;
    }
  }
  return out;
}

function downsample(src, sw, sh, scale) {
  const w = sw / scale, h = sh / scale;
  const out = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let r = 0, g = 0, b = 0, a = 0, c = 0;
      for (let oy = 0; oy < scale; oy++) {
        for (let ox = 0; ox < scale; ox++) {
          const i = ((y * scale + oy) * sw + (x * scale + ox)) * 4;
          if (src[i + 3] < 8) continue;
          r += src[i]; g += src[i + 1]; b += src[i + 2]; a += src[i + 3]; c++;
        }
      }
      const o = (y * w + x) * 4;
      if (!c) continue;
      out[o] = Math.round(r / c);
      out[o + 1] = Math.round(g / c);
      out[o + 2] = Math.round(b / c);
      out[o + 3] = Math.min(255, Math.round(a / c));
    }
  }
  return { data: out, w, h };
}

function makeTarget() {
  const zbuf = new Float32Array(RW * RH);
  zbuf.fill(-1e9);
  const img = new Uint8ClampedArray(RW * RH * 4);
  const S = (58 * RS) / 6.35;
  const ox = RW / 2;
  const oy = RH - 3 * RS;
  return { zbuf, img, S, ox, oy };
}

function project(T, x, y, z) {
  return {
    sx: T.ox + (x - z) * T.S,
    sy: T.oy - y * T.S + (x + z) * T.S * 0.5,
    depth: (x + z) * 0.75 + y * 0.12,
  };
}

function plot(T, x, y, z, col, a = 255) {
  const px = x | 0, py = y | 0;
  if (px < 0 || py < 0 || px >= RW || py >= RH) return;
  const i = py * RW + px;
  if (z < T.zbuf[i]) return;
  T.zbuf[i] = z;
  const o = i * 4;
  T.img[o] = col.r; T.img[o + 1] = col.g; T.img[o + 2] = col.b; T.img[o + 3] = a;
}

function fillTri(T, a, b, c, na, nb, nc, rgb, opts) {
  const minX = Math.max(0, Math.floor(Math.min(a.sx, b.sx, c.sx)));
  const maxX = Math.min(RW - 1, Math.ceil(Math.max(a.sx, b.sx, c.sx)));
  const minY = Math.max(0, Math.floor(Math.min(a.sy, b.sy, c.sy)));
  const maxY = Math.min(RH - 1, Math.ceil(Math.max(a.sy, b.sy, c.sy)));
  const area = (b.sx - a.sx) * (c.sy - a.sy) - (b.sy - a.sy) * (c.sx - a.sx);
  if (Math.abs(area) < 0.05) return;
  const inv = 1 / area;
  for (let y = minY; y <= maxY; y++) {
    for (let x = minX; x <= maxX; x++) {
      const w0 = ((b.sx - a.sx) * (y - a.sy) - (b.sy - a.sy) * (x - a.sx)) * inv;
      const w1 = ((c.sx - b.sx) * (y - b.sy) - (c.sy - b.sy) * (x - b.sx)) * inv;
      const w2 = 1 - w0 - w1;
      if (w0 < -0.01 || w1 < -0.01 || w2 < -0.01) continue;
      const z = a.depth * w2 + b.depth * w0 + c.depth * w1;
      const nx = na.x * w2 + nb.x * w0 + nc.x * w1;
      const ny = na.y * w2 + nb.y * w0 + nc.y * w1;
      const nz = na.z * w2 + nb.z * w0 + nc.z * w1;
      const len = Math.hypot(nx, ny, nz) || 1;
      plot(T, x, y, z, toon(rgb, nx / len, ny / len, nz / len, opts));
    }
  }
}

function drawMesh(T, mesh, xf, rgb, opts = {}) {
  const vs = mesh.verts.map((v) => {
    const p = xf(v);
    const pr = project(T, p.x, p.y, p.z);
    return { ...pr, n: { x: p.nx, y: p.ny, z: p.nz } };
  });
  for (const t of mesh.tris) {
    const a = vs[t[0]], b = vs[t[1]], c = vs[t[2]];
    fillTri(T, a, b, c, a.n, b.n, c.n, rgb, opts);
  }
}

function xfEllipsoid(cx, cy, cz, rx, ry, rz, yaw, tilt = 0, roll = 0) {
  const cyaw = Math.cos(yaw), syaw = Math.sin(yaw);
  const cti = Math.cos(tilt), sti = Math.sin(tilt);
  const cr = Math.cos(roll), sr = Math.sin(roll);
  return (v) => {
    let x = v.x * rx, y = v.y * ry, z = v.z * rz;
    // roll (z), tilt (x), yaw (y) — applied to both position and normal
    let nx = v.x, ny = v.y, nz = v.z;
    function rotX(px, py, pz, c, s) { return { x: px, y: py * c - pz * s, z: py * s + pz * c }; }
    function rotZ(px, py, pz, c, s) { return { x: px * c - py * s, y: px * s + py * c, z: pz }; }
    let p = rotZ(x, y, z, cr, sr); let n = rotZ(nx, ny, nz, cr, sr);
    p = rotX(p.x, p.y, p.z, cti, sti); n = rotX(n.x, n.y, n.z, cti, sti);
    const wx = p.z * cyaw - p.x * syaw, wy = p.y, wz = p.z * syaw + p.x * cyaw;
    const nnx = n.z * cyaw - n.x * syaw, nny = n.y, nnz = n.z * syaw + n.x * cyaw;
    const len = Math.hypot(nnx, nny, nnz) || 1;
    return { x: wx + cx, y: wy + cy, z: wz + cz, nx: nnx / len, ny: nny / len, nz: nnz / len };
  };
}

function xfBox(cx, cy, cz, hx, hy, hz, yaw, tilt = 0) {
  return xfEllipsoid(cx, cy, cz, hx, hy, hz, yaw, tilt, 0);
}

function limbChain(base, length, angX, yaw) {
  // returns center of a capsule going from joint along local -Y rotated by angX (pitch) then yaw
  const c = Math.cos(angX), s = Math.sin(angX);
  // local down is -Y; pitch around X swings in YZ (forward/back)
  const ly = -Math.cos(angX) * length;
  const lz = Math.sin(angX) * length;
  const endLocal = { x: 0, y: ly, z: lz };
  const midLocal = { x: 0, y: ly / 2, z: lz / 2 };
  const end = rotateYaw({ x: endLocal.x + (base.lx || 0), y: endLocal.y, z: endLocal.z }, yaw);
  const mid = rotateYaw({ x: midLocal.x + (base.lx || 0), y: midLocal.y, z: midLocal.z }, yaw);
  return {
    mid: { x: base.x + mid.x, y: base.y + mid.y, z: base.z + mid.z },
    end: { x: base.x + end.x, y: base.y + end.y, z: base.z + end.z },
    tilt: angX,
  };
}

function shoeColor(id) {
  if (id === "white") return "#f4f0ea";
  if (id === "black") return "#2a2a2e";
  if (id === "red") return "#c0392b";
  if (id === "gum") return "#e8d0b0";
  if (id === "skate") return "#2a2a2e";
  if (id === "glow") return "#f4f0ea";
  if (id === "cyber") return "#2a2a2e";
  return "#2a2a2e";
}

function normalizeAvatar(raw) {
  const a = { ...(raw || {}) };
  if (a.top === "techwear") a.top = "jacket";
  if (a.top === "ledhoodie") a.top = "hoodie";
  if (a.bottom === "neonpants") a.bottom = "jeans";
  if (a.shoes === "glow") a.shoes = "white";
  if (a.shoes === "cyber") a.shoes = "black";
  if (a.accessory === "visor" || a.accessory === "goggles") {
    a.glasses = true;
    a.accessory = "none";
  }
  if (a.accessory === "tattoo") a.accessory = "none";
  if (a.hair === "neon") a.hair = "spiky";
  return a;
}

function buildPose(flags, frame) {
  const sit = Boolean(flags.sitting);
  const walk = Boolean(flags.walking) && !sit;
  const f = walk ? (frame % 4) : 0;
  const swing = walk ? [0.62, 0.08, -0.62, -0.08][f] : 0;
  const bob = walk ? [0, 0.07, 0, 0.07][f] : 0;
  const armS = walk ? -swing * 0.85 : 0;
  const wave = flags.actionEmote === "wave" || flags.actionEmote === "dance";
  const dance = flags.actionEmote === "dance";
  const box = Boolean(flags.boxing);
  const phone = Boolean(flags.usingPhone);
  if (sit) {
    return {
      bob: 0, hipY: 1.85,
      thighL: 1.15, thighR: 1.15, shinL: -1.25, shinR: -1.25,
      armL: 0.35, armR: 0.35, elbowL: 0.6, elbowR: 0.6,
    };
  }
  return {
    bob,
    hipY: 3.05 + bob,
    thighL: swing, thighR: -swing,
    shinL: walk ? Math.max(0, -swing) * 0.55 : 0.08,
    shinR: walk ? Math.max(0, swing) * 0.55 : 0.08,
    armL: box || wave || dance ? -2.1 : 0.12 + armS * 0.9,
    armR: phone || box || dance ? (phone ? -1.4 : -2.0) : 0.12 - armS * 0.9,
    elbowL: box || wave ? 1.1 : 0.22,
    elbowR: phone || box ? 1.2 : 0.22,
  };
}

function drawCharacter(T, avatar, yaw, pose, flags) {
  avatar = normalizeAvatar(avatar);
  const skin = hexToRgb(avatar.skin || "#f1c27d");
  const shirt = hexToRgb(avatar.shirt || "#ff7a59");
  const pants = hexToRgb(avatar.bottomColor || "#3d4f7c");
  const shoe = hexToRgb(shoeColor(avatar.shoes || "white"));
  const hairC = hexToRgb(avatar.hairColor || "#2b1d16");
  const hairL = hexToRgb(mix(avatar.hairColor || "#2b1d16", "#ffffff", 0.35));
  const top = avatar.top || "tshirt";
  const hair = avatar.hair || "short";

  const hipY = pose.hipY;
  const chestY = hipY + 1.05;
  const shoulderY = chestY + 0.62;
  const neckY = shoulderY + 0.28;
  const headY = neckY + 0.62;
  const headR = 0.5;

  // legs
  const hipOff = 0.22;
  function leg(side, thighA, shinA) {
    const hx = -side * hipOff;
    const hip = { x: 0, y: hipY, z: 0, lx: hx };
    const shorts = (avatar.bottom || "jeans") === "shorts";
    const cargo = (avatar.bottom || "jeans") === "cargo";
    const thighLen = 1.22, shinLen = 1.18;
    const th = limbChain(hip, thighLen, thighA, yaw);
    const shin = limbChain({ x: th.end.x, y: th.end.y, z: th.end.z, lx: 0 }, shinLen, thighA + shinA, yaw);
    const thighR = cargo ? 0.26 : 0.22;
    drawMesh(T, SPHERE, xfEllipsoid(th.mid.x, th.mid.y, th.mid.z, thighR, thighLen * 0.52, 0.26, yaw, thighA), pants, { fold: true });
    if (shorts) {
      const midShin = limbChain({ x: th.end.x, y: th.end.y, z: th.end.z, lx: 0 }, shinLen * 0.45, thighA + shinA, yaw);
      drawMesh(T, SPHERE, xfEllipsoid(midShin.mid.x, midShin.mid.y, midShin.mid.z, 0.2, shinLen * 0.25, 0.22, yaw, thighA + shinA), pants, { fold: true });
      drawMesh(T, SPHERE, xfEllipsoid(shin.mid.x, shin.mid.y - 0.15, shin.mid.z, 0.16, shinLen * 0.28, 0.18, yaw, thighA + shinA), skin);
    } else {
      drawMesh(T, SPHERE, xfEllipsoid(shin.mid.x, shin.mid.y, shin.mid.z, cargo ? 0.22 : 0.2, shinLen * 0.5, 0.22, yaw, thighA + shinA), pants, { fold: true });
    }
    const skate = (avatar.shoes || "white") === "skate";
    const fwd = rotateYaw({ x: 0, y: 0, z: 0.22 }, yaw);
    drawMesh(T, BOX, xfBox(shin.end.x + fwd.x, shin.end.y + 0.1, shin.end.z + fwd.z, skate ? 0.24 : 0.2, skate ? 0.16 : 0.12, skate ? 0.38 : 0.32, yaw, 0), shoe, { spec: true });
    const hl = { r: 245, g: 245, b: 248 };
    drawMesh(T, BOX, xfBox(shin.end.x + fwd.x, shin.end.y + 0.16, shin.end.z + fwd.z, 0.12, 0.03, 0.2, yaw, 0), hl, { spec: true });
  }
  leg(1, pose.thighL, pose.shinL);
  leg(-1, pose.thighR, pose.shinR);

  // hips / jeans waist
  drawMesh(T, SPHERE, xfEllipsoid(0, hipY + 0.15, 0, 0.42, 0.28, 0.28, yaw), pants, { fold: true });

  // torso
  const torsoRgb = shirt;
  const torsoH = 0.95;
  const tw = top === "hoodie" || top === "jacket" ? 0.48 : 0.42;
  drawMesh(T, SPHERE, xfEllipsoid(0, chestY, 0, tw, torsoH, 0.32, yaw), torsoRgb, { fold: true });
  if (top === "hoodie") {
    const back = rotateYaw({ x: 0, y: 0, z: -0.28 }, yaw);
    drawMesh(T, SPHERE, xfEllipsoid(back.x, shoulderY + 0.1, back.z, 0.36, 0.22, 0.22, yaw), shadeRgb(torsoRgb, -20));
  }
  if (top === "bandtee") {
    const graphic = shadeRgb(torsoRgb, 80);
    drawMesh(T, BOX, xfBox(0, chestY + 0.05, 0.28, 0.22, 0.22, 0.04, yaw), graphic);
    drawMesh(T, BOX, xfBox(0, chestY + 0.05, 0.3, 0.1, 0.1, 0.03, yaw), shadeRgb(torsoRgb, -40));
  }
  if (top === "jacket") {
    const inner = shadeRgb(torsoRgb, 30);
    drawMesh(T, BOX, xfBox(0, chestY, 0.1, 0.18, 0.7, 0.16, yaw), inner);
  }

  // shoulders
  const shx = 0.66;
  const sl = rotateYaw({ x: -shx, y: 0, z: 0 }, yaw);
  const sr = rotateYaw({ x: shx, y: 0, z: 0 }, yaw);
  drawMesh(T, SPHERE, xfEllipsoid(sl.x, shoulderY, sl.z, 0.22, 0.2, 0.22, yaw), torsoRgb);
  drawMesh(T, SPHERE, xfEllipsoid(sr.x, shoulderY, sr.z, 0.22, 0.2, 0.22, yaw), torsoRgb);

  // arms + hands
  function arm(side, ang, elbow) {
    const ox = -side * shx;
    const base = { x: 0, y: shoulderY - 0.02, z: 0, lx: ox };
    const upper = limbChain(base, 0.85, ang, yaw);
    const lower = limbChain({ x: upper.end.x, y: upper.end.y, z: upper.end.z, lx: 0 }, 0.78, ang + elbow, yaw);
    drawMesh(T, SPHERE, xfEllipsoid(upper.mid.x, upper.mid.y, upper.mid.z, 0.18, 0.44, 0.18, yaw, ang), torsoRgb);
    drawMesh(T, SPHERE, xfEllipsoid(lower.mid.x, lower.mid.y, lower.mid.z, 0.16, 0.38, 0.16, yaw, ang + elbow), skin);
    drawMesh(T, SPHERE, xfEllipsoid(lower.end.x, lower.end.y, lower.end.z, 0.18, 0.15, 0.2, yaw, ang + elbow), skin);
    return lower.end;
  }
  const leftHand = arm(1, pose.armL, pose.elbowL);
  const rightHand = arm(-1, pose.armR, pose.elbowR);

  if (flags.usingPhone && rightHand) {
    const ph = hexToRgb("#1a1a22");
    drawMesh(T, BOX, xfBox(rightHand.x, rightHand.y + 0.08, rightHand.z + 0.05, 0.08, 0.16, 0.03, yaw), ph, { spec: true });
  }
  if ((flags.heldItem || flags.heldProp) === "coffee" && rightHand) {
    drawMesh(T, BOX, xfBox(rightHand.x, rightHand.y + 0.05, rightHand.z + 0.08, 0.08, 0.12, 0.08, yaw), hexToRgb("#6b3a2a"));
  }

  // neck
  drawMesh(T, SPHERE, xfEllipsoid(0, neckY, 0, 0.14, 0.18, 0.14, yaw), skin);

  // head (rounded, slightly wider in cheeks)
  drawMesh(T, SPHERE, xfEllipsoid(0, headY, 0.02, 0.52, 0.56, 0.48, yaw), skin);
  // nose bump
  const nose = rotateYaw({ x: 0, y: -0.02, z: 0.48 }, yaw);
  drawMesh(T, SPHERE, xfEllipsoid(nose.x, headY + nose.y, nose.z, 0.1, 0.08, 0.1, yaw), skin);
  // ears
  const earL = rotateYaw({ x: -0.5, y: 0, z: 0 }, yaw);
  const earR = rotateYaw({ x: 0.5, y: 0, z: 0 }, yaw);
  drawMesh(T, SPHERE, xfEllipsoid(earL.x, headY, earL.z, 0.08, 0.12, 0.08, yaw), skin);
  drawMesh(T, SPHERE, xfEllipsoid(earR.x, headY, earR.z, 0.08, 0.12, 0.08, yaw), skin);

  drawHair(T, hair, hairC, hairL, yaw, headY, flags);

  // accessories
  const acc = avatar.accessory || "none";
  if (acc === "cap") {
    const cap = hexToRgb(avatar.shirt || "#ff7a59");
    drawMesh(T, SPHERE, xfEllipsoid(0, headY + 0.32, 0, 0.56, 0.22, 0.54, yaw), cap, { spec: true });
    const brim = rotateYaw({ x: 0, y: 0, z: 0.4 }, yaw);
    drawMesh(T, BOX, xfBox(brim.x, headY + 0.22, brim.z, 0.28, 0.04, 0.28, yaw), shadeRgb(cap, -30));
  } else if (acc === "beanie") {
    const bn = hexToRgb(avatar.headphoneColor || avatar.shirt || "#2a2a2e");
    drawMesh(T, SPHERE, xfEllipsoid(0, headY + 0.3, 0, 0.56, 0.28, 0.54, yaw), bn);
  } else if (acc === "headphones") {
    const hp = hexToRgb(avatar.headphoneColor || "#2a2a2e");
    drawMesh(T, SPHERE, xfEllipsoid(earL.x - 0.04, headY, earL.z, 0.12, 0.16, 0.12, yaw), hp, { spec: true });
    drawMesh(T, SPHERE, xfEllipsoid(earR.x + 0.04, headY, earR.z, 0.12, 0.16, 0.12, yaw), hp, { spec: true });
    drawMesh(T, BOX, xfBox(0, headY + 0.42, 0, 0.52, 0.05, 0.08, yaw), hp);
  } else if (acc === "trucker") {
    const front = hexToRgb(avatar.shirt || "#c43a4a");
    const mesh = hexToRgb("#efe6d4");
    drawMesh(T, SPHERE, xfEllipsoid(0, headY + 0.32, 0, 0.56, 0.22, 0.54, yaw), mesh, { spec: true });
    const panel = rotateYaw({ x: 0, y: 0, z: 0.2 }, yaw);
    drawMesh(T, SPHERE, xfEllipsoid(panel.x, headY + 0.3, panel.z, 0.36, 0.2, 0.28, yaw), front, { spec: true });
    const brim = rotateYaw({ x: 0, y: 0, z: 0.4 }, yaw);
    drawMesh(T, BOX, xfBox(brim.x, headY + 0.22, brim.z, 0.28, 0.04, 0.28, yaw), shadeRgb(front, -30));
  } else if (avatar.glasses) {
    const col = hexToRgb("#111111");
    const fwd = rotateYaw({ x: 0, y: 0, z: 0.46 }, yaw);
    drawMesh(T, BOX, xfBox(fwd.x, headY + 0.02, fwd.z, 0.36, 0.08, 0.06, yaw), col, { spec: true });
  } else if (acc === "chain") {
    const g = hexToRgb("#f4c15d");
    drawMesh(T, SPHERE, xfEllipsoid(0, chestY + 0.35, 0.28, 0.14, 0.06, 0.06, yaw), g, { spec: true });
  }
  if (acc === "belt" || acc === "wristband") {
    if (acc === "belt") {
      drawMesh(T, BOX, xfBox(0, hipY + 0.2, 0.05, 0.42, 0.08, 0.3, yaw), hexToRgb("#1a1a1c"));
      drawMesh(T, BOX, xfBox(0, hipY + 0.2, 0.32, 0.08, 0.08, 0.04, yaw), hexToRgb("#c4a35a"), { spec: true });
    }
  }
  if (acc === "wristband" && leftHand) {
    drawMesh(T, SPHERE, xfEllipsoid(leftHand.x, leftHand.y + 0.12, leftHand.z, 0.12, 0.08, 0.12, yaw), hexToRgb("#1a1a1c"));
  }

  return { headY, yaw, leftHand, rightHand };
}

function shadeRgb(rgb, amt) {
  return {
    r: Math.max(0, Math.min(255, rgb.r + amt)),
    g: Math.max(0, Math.min(255, rgb.g + amt)),
    b: Math.max(0, Math.min(255, rgb.b + amt)),
  };
}

function drawHair(T, style, hairC, hairL, yaw, headY, flags) {
  const base = (cx, cy, cz, rx, ry, rz, tilt = 0, col = hairC) => {
    const p = rotateYaw({ x: cx, y: cy, z: cz }, yaw);
    drawMesh(T, SPHERE, xfEllipsoid(p.x, headY + p.y, p.z, rx, ry, rz, yaw, tilt), col, { spec: true });
  };
  // cap over skull + highlight streak
  base(0, 0.22, -0.02, 0.56, 0.38, 0.54, 0);
  base(-0.12, 0.38, 0.05, 0.18, 0.1, 0.22, 0.2, hairL);

  if (style === "curly") {
    const puffs = [
      [-0.5, 0.2, 0.18, 0.34], [0.5, 0.2, 0.18, 0.34],
      [-0.3, 0.55, 0.05, 0.32], [0.3, 0.55, 0.05, 0.32],
      [0, 0.62, 0.08, 0.34], [-0.48, 0.32, -0.22, 0.3], [0.48, 0.32, -0.22, 0.3],
      [0, 0.4, -0.45, 0.32], [-0.2, 0.5, 0.3, 0.28], [0.2, 0.5, 0.3, 0.28],
    ];
    for (const [x, y, z, r] of puffs) base(x, y, z, r, r, r);
    base(-0.2, 0.5, 0.05, 0.12, 0.08, 0.12, 0, hairL);
  } else if (style === "bun") {
    base(-0.28, 0.62, -0.05, 0.22, 0.2, 0.22);
    base(0.28, 0.62, -0.05, 0.22, 0.2, 0.22);
    base(-0.28, 0.72, -0.02, 0.08, 0.06, 0.08, 0, hairL);
    base(0.28, 0.72, -0.02, 0.08, 0.06, 0.08, 0, hairL);
  } else if (style === "spiky" || style === "neon") {
    const spikes = [
      [0, 0.85, 0.05, 0.08, 0.42, 0.08, -0.15],
      [-0.28, 0.72, 0.1, 0.07, 0.36, 0.07, 0.35],
      [0.28, 0.78, 0.05, 0.07, 0.4, 0.07, -0.3],
      [-0.18, 0.7, -0.2, 0.07, 0.32, 0.07, 0.2],
      [0.15, 0.82, -0.12, 0.07, 0.38, 0.07, -0.25],
      [0.4, 0.55, 0.05, 0.07, 0.28, 0.07, -0.5],
    ];
    for (const [x, y, z, rx, ry, rz, tilt] of spikes) {
      base(x, y, z, rx, ry, rz, tilt, style === "neon" ? hairL : hairC);
    }
    base(0.05, 0.9, 0.02, 0.05, 0.08, 0.05, 0, hairL);
  } else if (style === "undercut") {
    // short sides already just cap; volume on top swept
    base(0.08, 0.42, 0.1, 0.42, 0.22, 0.36, -0.4);
    base(0.18, 0.5, 0.05, 0.2, 0.1, 0.18, -0.3, hairL);
  } else if (style === "long") {
    base(-0.4, -0.15, -0.05, 0.18, 0.7, 0.2);
    base(0.4, -0.15, -0.05, 0.18, 0.7, 0.2);
    base(0, -0.05, -0.4, 0.4, 0.7, 0.2);
    base(-0.35, 0.2, 0.15, 0.12, 0.16, 0.12, 0, hairL);
  } else if (style === "bangs") {
    // emo side fringe swept over one eye, longer on the left
    base(-0.15, 0.22, 0.42, 0.38, 0.16, 0.22, 0.6);
    base(-0.42, 0.05, 0.15, 0.18, 0.5, 0.18, 0.2);
    base(0.32, 0.2, -0.1, 0.16, 0.2, 0.16);
    base(-0.2, 0.18, 0.45, 0.12, 0.08, 0.1, 0.4, hairL);
  } else if (style === "short") {
    base(0, 0.3, 0.05, 0.54, 0.28, 0.5);
    base(-0.2, 0.38, 0.1, 0.16, 0.1, 0.16, 0, hairL);
  } else {
    base(0, 0.28, 0, 0.54, 0.3, 0.52);
  }
}

function faceVisible(yaw) {
  // camera looks from +X+Z; face forward is rotateYaw(0,0,1)
  const fwd = rotateYaw({ x: 0, y: 0, z: 1 }, yaw);
  const viewX = 1, viewZ = 1;
  return fwd.x * viewX + fwd.z * viewZ > 0.15;
}

function projectPoint(T, x, y, z) {
  return project(T, x, y, z);
}

function paintFaceDecals(ctx, T, yaw, headY, avatar, scaleToNative = false) {
  // decals are painted on the hi-res buffer via a temp path after we blit to 24x64
  void scaleToNative;
  const fwd = rotateYaw({ x: 0, y: 0, z: 0.5 }, yaw);
  const right = rotateYaw({ x: 1, y: 0, z: 0 }, yaw);
  const vis = faceVisible(yaw);
  if (!vis && !avatar.glasses) return null;
  const mid = projectPoint(T, fwd.x * 0.15, headY + 0.02, fwd.z * 0.15);
  return { mid, fwd, right, vis, T };
}

function drawDecalsOnNative(ctx, info, avatar, yaw) {
  if (!info) return;
  const T = info.T;
  const headY = 4.85; // unused if we project explicitly
  void headY;
  const eyeY = 0.08;
  const eyeSep = 0.2;
  function pt(lx, ly, lz) {
    const p = rotateYaw({ x: lx, y: ly, z: lz }, yaw);
    const pr = project(T, p.x, /*head is around*/ (3.05 + 1.05 + 0.62 + 0.28 + 0.62) + p.y, p.z);
    // The headY used in build is: neckY + 0.62 with neckY = shoulderY+0.28, shoulderY = chestY+0.62, chestY = hipY+1.05
    // hipY walk is ~3.05+bob — we must use the same. Can't easily. Better project during drawCharacter and stash.
    return pr;
  }
  void pt; void eyeY; void eyeSep; void ctx; void avatar;
}

// Stash projected face anchors during render
function faceAnchors(T, yaw, headY) {
  const anchors = {};
  function P(lx, ly, lz) {
    const p = rotateYaw({ x: lx, y: ly, z: lz }, yaw);
    return project(T, p.x, headY + p.y, p.z);
  }
  anchors.center = P(0, 0, 0.2);
  anchors.eyeL = P(-0.2, 0.14, 0.44);
  anchors.eyeR = P(0.2, 0.14, 0.44);
  anchors.browL = P(-0.2, 0.28, 0.44);
  anchors.browR = P(0.2, 0.28, 0.44);
  anchors.mouth = P(0, -0.14, 0.48);
  anchors.cheekL = P(-0.28, -0.02, 0.38);
  anchors.cheekR = P(0.28, -0.02, 0.38);
  anchors.vis = faceVisible(yaw);
  return anchors;
}

function blitHiToCanvas(T, anchors, avatar) {
  const { data, w, h } = downsample(T.img, RW, RH, RS);
  const outlined = addOutline(data, w, h, { r: 22, g: 14, b: 18 });
  const c = document.createElement("canvas");
  c.width = w; c.height = h;
  const ctx = c.getContext("2d");
  ctx.imageSmoothingEnabled = false;
  const img = ctx.createImageData(w, h);
  img.data.set(outlined);
  ctx.putImageData(img, 0, 0);

  // Face decals at native resolution (crisper eyes/brows)
  if (anchors && anchors.vis) {
    const sx = 1 / RS, sy = 1 / RS;
    const q = (p) => ({ x: p.sx * sx, y: p.sy * sy });
    const eL = q(anchors.eyeL), eR = q(anchors.eyeR);
    const bL = q(anchors.browL), bR = q(anchors.browR);
    const mo = q(anchors.mouth);
    const acc = avatar.accessory || "none";
    const brow = shade(avatar.hairColor || "#2b1d16", -40);
    ctx.fillStyle = brow;
    ctx.fillRect((bL.x - 1.2) | 0, (bL.y) | 0, 3, 1);
    ctx.fillRect((bR.x - 1.2) | 0, (bR.y) | 0, 3, 1);
    if (avatar.glasses || acc === "visor" || acc === "goggles") {
      if (acc === "visor") {
        ctx.fillStyle = "rgba(0,220,240,0.7)";
        ctx.fillRect((eL.x - 2) | 0, (eL.y - 1) | 0, ((eR.x - eL.x) + 5) | 0, 3);
        ctx.fillStyle = "#083040";
        ctx.fillRect((eL.x - 2) | 0, (eL.y - 1) | 0, ((eR.x - eL.x) + 5) | 0, 1);
      } else {
        ctx.fillStyle = acc === "goggles" ? "#111" : "#1a1a1a";
        ctx.fillRect((eL.x - 2) | 0, (eL.y - 1) | 0, 4, 3);
        ctx.fillRect((eR.x - 2) | 0, (eR.y - 1) | 0, 4, 3);
        ctx.fillStyle = "#d8dce0";
        ctx.fillRect((eL.x) | 0, (eL.y) | 0, 1, 1);
        ctx.fillRect((eR.x) | 0, (eR.y) | 0, 1, 1);
        ctx.fillStyle = "#222";
        ctx.fillRect(((eL.x + eR.x) / 2) | 0, (eL.y) | 0, 1, 1);
      }
    } else {
      ctx.fillStyle = "#fff";
      ctx.fillRect((eL.x - 1) | 0, (eL.y - 1) | 0, 3, 2);
      ctx.fillRect((eR.x - 1) | 0, (eR.y - 1) | 0, 3, 2);
      ctx.fillStyle = "#1a1020";
      ctx.fillRect((eL.x) | 0, (eL.y - 1) | 0, 1, 2);
      ctx.fillRect((eR.x) | 0, (eR.y - 1) | 0, 1, 2);
    }
    ctx.fillStyle = "#c07070";
    ctx.fillRect((mo.x) | 0, (mo.y) | 0, 2, 1);
  }

  // soft elliptical floor shadow under feet
  ctx.globalCompositeOperation = "destination-over";
  ctx.fillStyle = "rgba(0,0,0,0.32)";
  ctx.beginPath();
  ctx.ellipse(w / 2, h - 2, 7, 2.2, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalCompositeOperation = "source-over";
  return { c, w, h };
}

const cache = new Map();

export function drawAvatarSprite(avatar = {}, flags = {}, frame = 0) {
  const a = {
    skin: avatar.skin || "#f1c27d",
    hair: avatar.hair || "short",
    hairColor: avatar.hairColor || "#2b1d16",
    shirt: avatar.shirt || "#ff7a59",
    glasses: Boolean(avatar.glasses),
    top: avatar.top || "tshirt",
    bottom: avatar.bottom || "jeans",
    bottomColor: avatar.bottomColor || "#3d4f7c",
    shoes: avatar.shoes || "white",
    accessory: avatar.accessory || "none",
    headphoneColor: avatar.headphoneColor || "#2a2a2e",
  };
  const walk = Boolean(flags.walking) && !flags.sitting;
  let dir;
  if (walk && (flags.dirX || flags.dirY)) dir = facingIndex8(null, flags.dirX, flags.dirY);
  else dir = facingIndex8(flags.facing, flags.dirX, flags.dirY);
  const key = "av3:" + JSON.stringify(a) + ":" + dir + ":" + Boolean(flags.sitting) + ":" + walk + ":" + (frame % 4) + ":" + Boolean(flags.usingPhone) + ":" + Boolean(flags.boxing) + ":" + (flags.actionEmote || "") + ":" + (flags.heldItem || flags.heldProp || "");
  const hit = cache.get(key);
  if (hit) return hit;

  const T = makeTarget();
  const yaw = yawFromDir(dir);
  const pose = buildPose(flags, frame);
  const info = drawCharacter(T, a, yaw, pose, flags);
  const anchors = faceAnchors(T, yaw, info.headY);
  const spr = blitHiToCanvas(T, anchors, a);
  cache.set(key, spr);
  return spr;
}

export const AVATAR_SHEET_LOOKS = [
  { label: "spiky blond", skin: "#ffdfc4", hair: "spiky", hairColor: "#f3e5c2", shirt: "#ef476f", top: "tshirt", bottom: "jeans", bottomColor: "#3d4f7c", shoes: "white", accessory: "none" },
  { label: "emo fringe", skin: "#f1c27d", hair: "bangs", hairColor: "#222222", shirt: "#2a2a2e", top: "jacket", bottom: "jeans", bottomColor: "#1a1a22", shoes: "black", accessory: "headphones", headphoneColor: "#2a2a2e" },
  { label: "afro", skin: "#8d5524", hair: "curly", hairColor: "#2b1d16", shirt: "#7bc47f", top: "hoodie", bottom: "joggers", bottomColor: "#2a2a2e", shoes: "red", accessory: "chain" },
  { label: "purple buns", skin: "#c68642", hair: "bun", hairColor: "#7b4f9c", shirt: "#ff8fab", top: "hoodie", bottom: "jeans", bottomColor: "#3d4f7c", shoes: "gum", accessory: "none" },
  { label: "wild grey", skin: "#e0ac69", hair: "spiky", hairColor: "#9aa0b0", shirt: "#6c7bff", top: "jacket", bottom: "cargo", bottomColor: "#3d4f7c", shoes: "white", accessory: "none", glasses: true },
  { label: "long dark", skin: "#f1c27d", hair: "long", hairColor: "#2b1d16", shirt: "#5c4d7d", top: "jacket", bottom: "jeans", bottomColor: "#2a2a2e", shoes: "black", glasses: true },
  { label: "band tee", skin: "#f1c27d", hair: "spiky", hairColor: "#2b1d16", shirt: "#1a1a22", top: "bandtee", bottom: "shorts", bottomColor: "#c4a35a", shoes: "skate", accessory: "trucker" },
  { label: "undercut", skin: "#c68642", hair: "undercut", hairColor: "#2b1d16", shirt: "#2a2a2e", top: "hoodie", bottom: "cargo", bottomColor: "#6b7280", shoes: "skate", accessory: "wristband" },
];

export function paintAvatarSheet(canvas, looks, scale = 3) {
  looks = looks && looks.length ? looks : AVATAR_SHEET_LOOKS;
  const dirs = [0, 1, 2, 3, 4, 5, 6, 7];
  const dirLabels = ["SE", "S", "SW", "W", "NW", "N", "NE", "E"];
  const cols = 8;
  const pad = 12, cap = 16, gap = 10;
  const cw = AV_W * scale, ch = AV_H * scale;
  const rowsLooks = Math.ceil(looks.length / cols);
  const rows = rowsLooks + 1; // + turnaround row
  canvas.width = pad * 2 + cols * cw + (cols - 1) * gap;
  canvas.height = pad * 2 + rows * (ch + cap) + (rows - 1) * gap + 8;
  const ctx = canvas.getContext("2d");
  ctx.imageSmoothingEnabled = false;
  ctx.fillStyle = "#f4efe4";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  looks.forEach((look, i) => {
    const r = Math.floor(i / cols), c = i % cols;
    const x = pad + c * (cw + gap);
    const y = pad + r * (ch + cap + gap);
    const spr = drawAvatarSprite(look, { facing: { x: 0, z: 1 } }, 0);
    ctx.drawImage(spr.c, 0, 0, spr.w, spr.h, x, y, cw, ch);
    ctx.fillStyle = "#2a1c4a";
    ctx.font = "11px sans-serif";
    ctx.fillText(look.label || "", x, y + ch + 12);
  });
  const turnY = pad + rowsLooks * (ch + cap + gap);
  const turnLook = looks[0] || AVATAR_SHEET_LOOKS[0];
  dirs.forEach((d, i) => {
    const x = pad + i * (cw + gap);
    const y = turnY;
    const spr = drawAvatarSprite(turnLook, { facing: { x: Math.cos(d * Math.PI / 4), z: Math.sin(d * Math.PI / 4) } }, 0);
    ctx.drawImage(spr.c, 0, 0, spr.w, spr.h, x, y, cw, ch);
    ctx.fillStyle = "#2a1c4a";
    ctx.font = "11px sans-serif";
    ctx.fillText(dirLabels[i], x + 8, y + ch + 12);
  });
}

export function paintStoreThumb(canvas, kind, item, base) {
  const w = canvas.width = 28, h = canvas.height = 28;
  const ctx = canvas.getContext("2d");
  ctx.imageSmoothingEnabled = false;
  ctx.fillStyle = "#efe6d4";
  ctx.fillRect(0, 0, w, h);
  if (kind === "pets") return false;
  const av = { ...(base || {}), ...(item || {}) };
  const spr = drawAvatarSprite(av, { facing: { x: 0, z: 1 } }, 0);
  const dw = 10, dh = 26;
  ctx.drawImage(spr.c, 0, 0, spr.w, spr.h, Math.floor((w - dw) / 2), 1, dw, dh);
  return true;
}

if (typeof window !== "undefined") {
  window.__paintAvatarSheet = paintAvatarSheet;
  window.__paintStoreThumb = paintStoreThumb;
  window.__drawAvatarSprite = drawAvatarSprite;
}

export default { drawAvatarSprite, paintAvatarSheet, paintStoreThumb, facingIndex8, AV_W, AV_H, AVATAR_SHEET_LOOKS };
