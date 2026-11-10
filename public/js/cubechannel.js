/** The Cube Channel — a looping documentary, timed from a shared timestamp. */
export const CHANNEL_NAME = "The Cube Channel";
export const TV_EPOCH = 1_700_000_000_000;
export const TITLE_MS = 5200;
export const EPISODE_MS = 28000;

export const EPISODES = [
  {
    id: "heist",
    title: "The Great Sugar Cube Heist of 1843",
    ticker: "THE CUBE CHANNEL  —  Paris, 1843. Six sugar cubes vanished from a café. The teaspoon was never the same. Historians remain unhelpful.",
  },
  {
    id: "coldwar",
    title: "Ice Cubes: A Cold War",
    ticker: "THE CUBE CHANNEL  —  In a freezer divided, no cube would melt first. Diplomacy was served on the rocks. The tray is still classified.",
  },
  {
    id: "roots",
    title: "Cube Roots: A Family History",
    ticker: "THE CUBE CHANNEL  —  Every cube has twelve edges and one disappointment. Tonight, a genealogy of corners.",
  },
  {
    id: "deal",
    title: "The Square Deal",
    ticker: "THE CUBE CHANNEL  —  A documentary about fairness, four equal sides, and why circles were not invited.",
  },
  {
    id: "dream",
    title: "When Cubes Dream",
    ticker: "THE CUBE CHANNEL  —  Researchers placed a cube in a dark room. It thought about dust. This went on for an hour.",
  },
  {
    id: "flat",
    title: "Flattened: The Rise of the 2D Conspiracy",
    ticker: "THE CUBE CHANNEL  —  Some say a sixth face is missing. We asked a square for comment. It declined, citing dimension.",
  },
  {
    id: "corners",
    title: "A Brief History of Corners",
    ticker: "THE CUBE CHANNEL  —  They meet at ninety degrees and never hug. A touching story, in a strictly geometric sense.",
  },
  {
    id: "box",
    title: "Inside the Box",
    ticker: "THE CUBE CHANNEL  —  We went looking for outside-the-box thinking. It was not in the box. We checked twice.",
  },
];

const LOOP = EPISODES.length * EPISODE_MS;

export function programAt(serverTime) {
  const t = Math.max(0, Number(serverTime) || 0);
  const elapsed = ((t - TV_EPOCH) % LOOP + LOOP) % LOOP;
  const index = Math.floor(elapsed / EPISODE_MS);
  const local = elapsed - index * EPISODE_MS;
  const ep = EPISODES[index];
  return {
    channel: CHANNEL_NAME,
    index,
    title: ep.title,
    ticker: ep.ticker,
    local,
    titleCard: local < TITLE_MS,
    progress: local / EPISODE_MS,
    serverTime: t,
  };
}

function lerp(a, b, t) {
  return a + (b - a) * t;
}
function hsl(h, s, l) {
  return `hsl(${h} ${s}% ${l}%)`;
}

export function drawCubeChannel(ctx, w, h, serverTime) {
  const p = programAt(serverTime);
  const t = p.local / 1000;
  ctx.clearRect(0, 0, w, h);

  // episode color grade
  const hue = (p.index * 47) % 360;
  if (p.titleCard) {
    const k = Math.min(1, p.local / 400);
    ctx.fillStyle = `rgb(${12 + 8 * k}, ${10 + 6 * k}, ${22 + 10 * k})`;
    ctx.fillRect(0, 0, w, h);
    // soft cubes in the dark
    for (let i = 0; i < 7; i++) {
      const cx = (w * (0.15 + i * 0.12) + Math.sin(t * 0.6 + i) * 8);
      const cy = h * 0.42 + Math.cos(t * 0.4 + i * 0.7) * 10;
      const s = 16 + (i % 3) * 6;
      ctx.fillStyle = hsl((hue + i * 18) % 360, 40, 18 + i * 3);
      ctx.fillRect(cx - s / 2, cy - s / 2, s, s);
    }
    ctx.fillStyle = "#f4c15d";
    ctx.font = `bold ${Math.round(h * 0.07)}px Nunito, sans-serif`;
    ctx.textAlign = "center";
    ctx.fillText("THE CUBE CHANNEL", w / 2, h * 0.28);
    ctx.fillStyle = "#fff8f2";
    ctx.font = `bold ${Math.round(h * 0.11)}px Nunito, sans-serif`;
    wrapTitle(ctx, p.title, w / 2, h * 0.5, w * 0.86, Math.round(h * 0.12));
    ctx.font = `${Math.round(h * 0.055)}px Nunito, sans-serif`;
    ctx.fillStyle = "#c9b8a6";
    ctx.fillText("A Cube Channel Documentary", w / 2, h * 0.78);
  } else {
    const scene = p.local - TITLE_MS;
    const st = scene / 1000;
    // backdrop
    const g = ctx.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, hsl(hue, 35, 16));
    g.addColorStop(1, hsl((hue + 40) % 360, 40, 8));
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);

    // "archival" cubes drifting
    for (let i = 0; i < 12; i++) {
      const cx = ((i * 89 + st * (12 + i)) % (w + 40)) - 20;
      const cy = (h * 0.2 + ((i * 53) % (h * 0.55)) + Math.sin(st * 0.8 + i) * 16);
      const s = 10 + (i % 5) * 7;
      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(Math.sin(st * 0.3 + i) * 0.2);
      ctx.fillStyle = hsl((hue + i * 22) % 360, 55, 40 + (i % 4) * 6);
      ctx.fillRect(-s / 2, -s / 2, s, s);
      ctx.fillStyle = "rgba(255,255,255,0.15)";
      ctx.fillRect(-s / 2, -s / 2, s / 2, s / 2);
      ctx.restore();
    }

    // lower-third title
    ctx.fillStyle = "rgba(20,10,30,0.72)";
    ctx.fillRect(0, h * 0.68, w, h * 0.14);
    ctx.fillStyle = "#f4c15d";
    ctx.fillRect(0, h * 0.68, 6, h * 0.14);
    ctx.textAlign = "left";
    ctx.font = `bold ${Math.round(h * 0.065)}px Nunito, sans-serif`;
    ctx.fillStyle = "#fff8f2";
    ctx.fillText(p.title, 14, h * 0.77);
    ctx.font = `${Math.round(h * 0.045)}px Nunito, sans-serif`;
    ctx.fillStyle = "#c9b8a6";
    ctx.fillText("The Cube Channel  ·  Documentary", 14, h * 0.795);
  }

  // logo bug
  const bw = Math.round(w * 0.28);
  const bh = Math.round(h * 0.11);
  const bx = w - bw - 8;
  const by = 8;
  ctx.fillStyle = "rgba(20,12,32,0.82)";
  roundRect(ctx, bx, by, bw, bh, 5);
  ctx.fill();
  ctx.strokeStyle = "#f4c15d";
  ctx.lineWidth = 1.5;
  ctx.stroke();
  ctx.fillStyle = "#f4c15d";
  ctx.textAlign = "center";
  ctx.font = `bold ${Math.round(h * 0.045)}px Nunito, sans-serif`;
  ctx.fillText("CUBE", bx + bw / 2, by + bh * 0.48);
  ctx.font = `${Math.round(h * 0.032)}px Nunito, sans-serif`;
  ctx.fillStyle = "#fff8f2";
  ctx.fillText("CHANNEL", bx + bw / 2, by + bh * 0.82);

  // caption ticker
  ctx.fillStyle = "rgba(10,8,16,0.88)";
  ctx.fillRect(0, h - 22, w, 22);
  ctx.fillStyle = "#f4c15d";
  ctx.fillRect(0, h - 22, w, 2);
  const tick = p.ticker + "    •    " + p.ticker + "    •    ";
  const speed = 42;
  const textW = tick.length * 6.2;
  const x = w - ((serverTime / 1000) * speed) % textW;
  ctx.font = `${Math.round(h * 0.05)}px Nunito, sans-serif`;
  ctx.textAlign = "left";
  ctx.fillStyle = "#fff8f2";
  ctx.fillText(tick, x, h - 7);
  ctx.fillText(tick, x + textW, h - 7);

  // film grain
  ctx.globalAlpha = 0.06;
  for (let i = 0; i < 40; i++) {
    ctx.fillStyle = i % 2 ? "#fff" : "#000";
    ctx.fillRect(Math.random() * w, Math.random() * h, 2, 2);
  }
  ctx.globalAlpha = 1;
  return p;
}

function wrapTitle(ctx, text, x, y, maxW, lineH) {
  const words = text.split(" ");
  const lines = [];
  let cur = "";
  for (const word of words) {
    const trial = cur ? cur + " " + word : word;
    if (ctx.measureText(trial).width > maxW && cur) {
      lines.push(cur);
      cur = word;
    } else cur = trial;
  }
  if (cur) lines.push(cur);
  const start = y - ((lines.length - 1) * lineH) / 2;
  lines.forEach((ln, i) => ctx.fillText(ln, x, start + i * lineH));
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}
