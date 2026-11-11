/** Original looping TV channels for the CubeVision CRT. Shared clock, 8fps. */
export const TV_CHANNEL_COUNT = 4;
export const TV_CHANNELS = [
  { id: "cartoon", name: "Cartoon Capers" },
  { id: "beats", name: "Cube Beats" },
  { id: "sports", name: "Cube Sports" },
  { id: "news", name: "Cube News" },
];
export const TV_FPS = 8;
export const TV_STATIC_MS = 280;
export const TV_SCREEN_W = 48;
export const TV_SCREEN_H = 32;

const _cache = new Map();

function keyOf(channel, frame, staticOn) {
  return (staticOn ? "static:" : "ch" + channel + ":") + frame;
}

function canv() {
  const c = document.createElement("canvas");
  c.width = TV_SCREEN_W;
  c.height = TV_SCREEN_H;
  const ctx = c.getContext("2d");
  ctx.imageSmoothingEnabled = false;
  return { c, ctx };
}

function hash(n) {
  n = (n * 374761393 + 668265263) | 0;
  n = Math.imul(n ^ (n >>> 13), 1274126177);
  return ((n ^ (n >>> 16)) >>> 0) / 4294967296;
}

function paintStatic(ctx, frame) {
  const w = TV_SCREEN_W, h = TV_SCREEN_H;
  const img = ctx.createImageData(w, h);
  const d = img.data;
  for (let i = 0, y = 0; y < h; y++) {
    for (let x = 0; x < w; x++, i += 4) {
      const v = hash(frame * 997 + y * 131 + x * 17) > 0.5 ? 230 : 40;
      const bar = (x / w) * 8 | 0;
      const bars = [[220, 220, 220], [220, 220, 40], [40, 220, 220], [40, 220, 40], [220, 40, 220], [220, 40, 40], [40, 40, 220], [30, 30, 30]];
      if (y < 6) {
        const b = bars[bar];
        d[i] = b[0]; d[i + 1] = b[1]; d[i + 2] = b[2]; d[i + 3] = 255;
      } else {
        d[i] = d[i + 1] = d[i + 2] = v; d[i + 3] = 255;
      }
    }
  }
  ctx.putImageData(img, 0, 0);
}

function paintCartoon(ctx, f) {
  const w = TV_SCREEN_W, h = TV_SCREEN_H;
  ctx.fillStyle = "#7ec8f0";
  ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = "#7bc45a";
  ctx.fillRect(0, 22, w, 10);
  ctx.fillStyle = "#f4d36a";
  ctx.fillRect(34, 3, 8, 6);
  const t = f % 16;
  const bounce = t < 8 ? t : 16 - t;
  const x = 8 + (f % 24);
  const y = 14 - Math.floor(bounce / 2);
  ctx.fillStyle = "#ffb070";
  ctx.fillRect(x, y, 8, 8);
  ctx.fillStyle = "#2a1c16";
  ctx.fillRect(x + 2, y + 2, 2, 2);
  ctx.fillRect(x + 5, y + 2, 2, 2);
  ctx.fillStyle = "#6c7bff";
  ctx.fillRect(x + 1, y + 8, 6, 4);
  ctx.fillStyle = "#3d4f7c";
  ctx.fillRect(x + 1, y + 12, 6, 3);
}

function paintBeats(ctx, f) {
  const w = TV_SCREEN_W, h = TV_SCREEN_H;
  ctx.fillStyle = "#14081c";
  ctx.fillRect(0, 0, w, h);
  const cols = ["#ff5ad2", "#7c5cff", "#5ad2ff", "#ffe45a", "#5aff9a"];
  for (let i = 0; i < 8; i++) {
    const n = 4 + Math.floor(8 * (0.5 + 0.5 * Math.sin((f / 2 + i) * 0.9)));
    ctx.fillStyle = cols[i % cols.length];
    const bw = 4, x = 5 + i * 5, y = h - 4 - n * 2;
    ctx.fillRect(x, y, bw, n * 2);
  }
  ctx.fillStyle = "#ffe45a";
  ctx.fillRect(6, 3, 3, 3);
  ctx.fillRect(11, 2, 3, 3);
  ctx.fillRect(16, 4, 3, 3);
}

function paintSports(ctx, f) {
  const w = TV_SCREEN_W, h = TV_SCREEN_H;
  ctx.fillStyle = "#3d8a3a";
  ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = "#f4efe4";
  ctx.fillRect(2, 14, w - 4, 2);
  ctx.fillRect(Math.floor(w / 2) - 1, 4, 2, h - 8);
  ctx.strokeStyle = "#f4efe4";
  ctx.strokeRect(16, 8, 16, 16);
  const t = f % 20;
  const bx = 8 + t * 1.6;
  const by = 10 + ((t % 6) < 3 ? t % 6 : 6 - (t % 6));
  ctx.fillStyle = "#f4efe4";
  ctx.fillRect(bx, by, 3, 3);
  ctx.fillStyle = "#2a1c16";
  ctx.fillRect(10, 16, 4, 6);
  ctx.fillRect(32, 16, 4, 6);
}

function paintNews(ctx, f) {
  const w = TV_SCREEN_W, h = TV_SCREEN_H;
  ctx.fillStyle = "#1a3a6a";
  ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = "#c4182d";
  ctx.fillRect(2, 2, 18, 8);
  ctx.fillStyle = "#f4efe4";
  ctx.font = "5px sans-serif";
  ctx.fillText("CUBE", 4, 8);
  ctx.fillStyle = "#f4c15d";
  ctx.fillRect(22, 3, 24, 6);
  ctx.fillStyle = "#1a1220";
  ctx.fillText("NEWS", 24, 8);
  ctx.fillStyle = "#f4efe4";
  ctx.fillRect(4, 12, 16, 10);
  ctx.fillStyle = "#3a6aaa";
  ctx.fillRect(22, 12, 22, 10);
  ctx.fillStyle = "#c4182d";
  ctx.fillRect(0, 24, w, 8);
  const msg = "  CUBE NEWS  ·  Lounge Cube live  ·  Pets voted good boys  ·  ";
  const off = (f * 2) % (msg.length * 4);
  ctx.fillStyle = "#f4efe4";
  ctx.font = "6px sans-serif";
  ctx.fillText(msg, 4 - off, 30);
}

function paintChannel(ctx, channel, frame) {
  const id = TV_CHANNELS[((channel % TV_CHANNEL_COUNT) + TV_CHANNEL_COUNT) % TV_CHANNEL_COUNT].id;
  if (id === "cartoon") paintCartoon(ctx, frame);
  else if (id === "beats") paintBeats(ctx, frame);
  else if (id === "sports") paintSports(ctx, frame);
  else paintNews(ctx, frame);
  // Scanline flicker
  ctx.fillStyle = (frame % 2 === 0) ? "rgba(0,0,0,0.18)" : "rgba(255,255,255,0.06)";
  for (let y = 0; y < TV_SCREEN_H; y += 2) ctx.fillRect(0, y, TV_SCREEN_W, 1);
}

export function tvFrameAt(now) {
  return Math.floor((now || 0) / (1000 / TV_FPS));
}

export function tvChannelName(channel) {
  const c = TV_CHANNELS[((channel % TV_CHANNEL_COUNT) + TV_CHANNEL_COUNT) % TV_CHANNEL_COUNT];
  return c ? c.name : "CubeVision";
}

export function getTvScreen(channel, now, changedAt = 0) {
  const frame = tvFrameAt(now);
  const staticOn = changedAt && (now - changedAt) >= 0 && (now - changedAt) < TV_STATIC_MS;
  const key = keyOf(channel, staticOn ? frame : frame, staticOn);
  let hit = _cache.get(key);
  if (hit) return hit;
  if (_cache.size > 80) _cache.clear();
  const { c, ctx } = canv();
  if (staticOn) paintStatic(ctx, frame);
  else paintChannel(ctx, channel, frame);
  _cache.set(key, c);
  return c;
}

export default { TV_CHANNEL_COUNT, TV_CHANNELS, TV_FPS, TV_STATIC_MS, getTvScreen, tvFrameAt, tvChannelName };
