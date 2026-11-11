/* Standing 1-tile record table: spinning vinyl, floating notes, arcade picker. */
import {
  VINYL_FEELS,
  DEFAULT_VOLUME,
  unlockRecordAudio,
  playRecordVinyl,
  isRecordListening,
  getRecordAudioState,
  setRecordVolume,
  setRecordMuted,
  syncRecordAudio,
  syncRoomRecordAudio,
  stopRecordAudio,
  installRecordAudioGestures,
  preloadRecordAudio,
} from "./recordPlayerAudio.js";

export const TYPE = "recordplayer";
export const NAME = "Record table";
export const PRICE = 28;
export const TILES = [1, 1];
export const BODY_H = 40;
export const SPIN_FRAMES = 4;
export const NOTE_LIFE = 900;
export const NOTE_INTERVAL = 280;
export const NOTE_RISE = 32; // ~1 tile height in room/sprite pixels

export const VINYLS = [
  {
    id: "neon-drift",
    name: "Neon Drift",
    label: "#ff4da6",
    label2: "#5ce1ff",
    groove: "#2a1030",
    notes: ["#ff7ad9", "#5ce1ff", "#ffe066"],
    feel: VINYL_FEELS["neon-drift"],
    blurb: "A late-night cruise down a lit overpass.",
  },
  {
    id: "midnight-ramen",
    name: "Midnight Ramen",
    label: "#ff7a3a",
    label2: "#ffd166",
    groove: "#3a180c",
    notes: ["#ff9a4a", "#ffe066", "#ff6b6b"],
    feel: VINYL_FEELS["midnight-ramen"],
    blurb: "Steam, broth, and a swinging 2 a.m. booth.",
  },
  {
    id: "rainy-rooftop",
    name: "Rainy Rooftop",
    label: "#6aa4ff",
    label2: "#c9d6e8",
    groove: "#101828",
    notes: ["#8eb8ff", "#d4e4f7", "#a0f0e8"],
    feel: VINYL_FEELS["rainy-rooftop"],
    blurb: "Drizzle on the cube, city lights below.",
  },
  {
    id: "cube-city-nights",
    name: "Cube City Nights",
    label: "#f4c15d",
    label2: "#b07cff",
    groove: "#241028",
    notes: ["#f4c15d", "#c59bff", "#ff7ad9"],
    feel: VINYL_FEELS["cube-city-nights"],
    blurb: "Block-party bounce under gold street signs.",
  },
];

export function vinylById(id) {
  return VINYLS.find((v) => v.id === id) || null;
}

export function spinFrameAt(now = Date.now(), startedAt = 0) {
  const t = Math.max(0, (now - (startedAt || 0)));
  return Math.floor(t / 120) % SPIN_FRAMES;
}

function hash32(s) {
  let h = 2166136261;
  const str = String(s);
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

const GLYPHS = {
  eighth: ["  ##", "  # #", "  #  ", "  #  ", "##   ", "##   "],
  beamed: ["  ####", "  #  #", "  #  #", "  #  #", "##  ##", "##  ##"],
};

const RAINBOW = ["#ff7ad9", "#5ce1ff", "#ffe066", "#7dff9a", "#c59bff"];

export function notePalette(vinylId) {
  const v = vinylById(vinylId);
  const lean = v?.notes || RAINBOW;
  return [...lean, ...RAINBOW.filter((c) => !lean.includes(c))];
}

export function notesAt(id, rec, now = Date.now()) {
  if (!rec?.on) return [];
  const started = rec.startedAt || 0;
  const pal = notePalette(rec.vinyl);
  const out = [];
  const t0 = now - NOTE_LIFE;
  const first = Math.ceil((t0 - started) / NOTE_INTERVAL);
  const last = Math.floor((now - started) / NOTE_INTERVAL);
  for (let i = Math.max(0, first); i <= last; i++) {
    const born = started + i * NOTE_INTERVAL;
    const age = now - born;
    if (age < 0 || age > NOTE_LIFE) continue;
    const u = age / NOTE_LIFE;
    const seed = hash32(id + ":" + i + ":" + (rec.vinyl || ""));
    const drift = ((seed % 21) - 10) * 0.9;
    const wig = Math.sin(age / 120 + (seed % 7)) * 3.2;
    out.push({
      x: drift + wig,
      y: -u * NOTE_RISE,
      alpha: (1 - u) * (u < 0.12 ? u / 0.12 : 1),
      color: pal[seed % pal.length],
      glyph: seed % 2 === 0 ? "eighth" : "beamed",
      scale: 1.4 + (seed % 3) * 0.25,
    });
  }
  return out;
}

export function drawNotes(ctx, ox, oy, notes, lights = true) {
  if (!notes?.length) return;
  for (const n of notes) {
    const rows = GLYPHS[n.glyph] || GLYPHS.eighth;
    const s = n.scale || 1.5;
    const x0 = Math.round(ox + n.x);
    const y0 = Math.round(oy + n.y);
    ctx.save();
    ctx.globalAlpha = Math.max(0, Math.min(1, n.alpha));
    if (!lights) {
      ctx.shadowColor = n.color;
      ctx.shadowBlur = 6;
    }
    const glow = lights ? n.color : shadeHex(n.color, 40);
    for (let r = 0; r < rows.length; r++) {
      for (let c = 0; c < rows[r].length; c++) {
        if (rows[r][c] === " ") continue;
        ctx.fillStyle = glow;
        ctx.fillRect(x0 + c * s, y0 + r * s, s, s);
      }
    }
    ctx.restore();
  }
}

function shadeHex(hex, amt) {
  const n = parseInt(String(hex).replace("#", ""), 16);
  const c = (v) => Math.max(0, Math.min(255, v + amt));
  const r = c((n >> 16) & 255), g = c((n >> 8) & 255), b = c(n & 255);
  return "#" + ((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1);
}

const TW = 64, TH = 32, I = 0.125;
function pt(x, y, lift = 0) {
  return { x: (x - y) * (TW / 2), y: (x + y) * (TH / 2) - lift };
}

/** Sprite-local pixel offset of the platter center (add to furnBlitPos sx/sy). */
export function platterOffset(rot = 0) {
  const tw = 1, th = 1;
  const pad = 2, bodyH = BODY_H;
  const ox = pad + th * (TW / 2);
  const oy = pad + bodyH;
  const full = { x: I, y: I, w: tw - 2 * I, h: th - 2 * I };
  const p = pt(full.x + full.w / 2, full.y + full.h / 2, 22);
  return { x: ox + p.x, y: oy + p.y };
}

export function drawRecordPlayer(ctx, tw, th, rot, lights, opts, iso) {
  const { box, pal, shadow, insetBox, frontRect, diamond, fillPts, shade } = iso;
  const on = Boolean(opts?.on);
  const frame = ((opts?.spinFrame ?? 0) % SPIN_FRAMES + SPIN_FRAMES) % SPIN_FRAMES;
  const vinyl = vinylById(opts?.vinyl) || VINYLS[0];
  const full = insetBox(tw, th);
  const wood = pal("#6b4a2c", lights);
  const darkWood = pal("#3a2818", lights);
  const metal = pal("#8a9098", lights);
  const plinth = pal("#1a181c", lights);
  const crate = pal("#5a3a22", lights);

  shadow(ctx, full.x, full.y, full.w, full.h, 0.3);
  const tableH = 13;
  const leg = 0.1;
  const inset = 0.08;
  const spots = [
    [full.x + inset, full.y + inset],
    [full.x + full.w - leg - inset, full.y + inset],
    [full.x + inset, full.y + full.h - leg - inset],
    [full.x + full.w - leg - inset, full.y + full.h - leg - inset],
  ];
  for (const [lx, ly] of spots) box(ctx, lx, ly, leg, leg, 0, tableH, darkWood);

  // Crate of records under the front apron.
  const front = frontRect(tw, th, rot, 0.32);
  const crateH = 9;
  box(ctx, front.x + 0.04, front.y + 0.04, Math.max(0.2, front.w - 0.08), Math.max(0.18, front.h - 0.08), 0, crateH, crate);
  const spines = [vinyl.label, vinyl.label2, "#7dff9a", "#ff6b6b", "#5ce1ff"];
  const nSpines = 5;
  for (let i = 0; i < nSpines; i++) {
    const t = (i + 0.2) / nSpines;
    if (rot % 2 === 0) {
      const x = front.x + 0.08 + t * Math.max(0.1, front.w - 0.2);
      box(ctx, x, front.y + 0.08, 0.06, Math.max(0.12, front.h - 0.16), 1, crateH - 2, pal(spines[i], lights));
    } else {
      const y = front.y + 0.08 + t * Math.max(0.1, front.h - 0.2);
      box(ctx, front.x + 0.08, y, Math.max(0.12, front.w - 0.16), 0.06, 1, crateH - 2, pal(spines[i], lights));
    }
  }

  box(ctx, full.x, full.y, full.w, full.h, tableH, 3, wood);

  // Deck plinth
  const pad = 0.12;
  const deck = { x: full.x + pad, y: full.y + pad, w: full.w - pad * 2, h: full.h - pad * 2 };
  box(ctx, deck.x, deck.y, deck.w, deck.h, tableH + 3, 2.2, plinth);

  // Vinyl disc
  const cx = deck.x + deck.w / 2;
  const cy = deck.y + deck.h / 2;
  const discLift = tableH + 5.6;
  const r0 = 0.26;
  const disc = diamond(cx - r0, cy - r0, r0 * 2, r0 * 2, discLift);
  fillPts(ctx, [disc.N, disc.E, disc.S, disc.W], lights ? "#161418" : "#0c0a0e", lights ? "#3a3438" : "#222");
  const r1 = 0.2;
  const groove = diamond(cx - r1, cy - r1, r1 * 2, r1 * 2, discLift + 0.4);
  fillPts(ctx, [groove.N, groove.E, groove.S, groove.W], vinyl.groove, null);

  // Spinning highlight / groove tick
  const corners = [disc.N, disc.E, disc.S, disc.W];
  const a = corners[frame % 4];
  const b = corners[(frame + 1) % 4];
  ctx.save();
  ctx.globalAlpha = on ? 0.7 : 0.28;
  ctx.strokeStyle = lights ? "#8a868c" : "#555";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo((a.x + disc.S.x) / 2, (a.y + disc.S.y) / 2);
  ctx.lineTo((b.x + disc.N.x) / 2, (b.y + disc.N.y) / 2);
  ctx.stroke();
  ctx.restore();

  // Label
  const lr = 0.09;
  const lab = diamond(cx - lr, cy - lr, lr * 2, lr * 2, discLift + 1.2);
  fillPts(ctx, [lab.N, lab.E, lab.S, lab.W], lights ? vinyl.label : shadeHex(vinyl.label, -28), lights ? vinyl.label2 : shadeHex(vinyl.label2, -28));
  const hole = diamond(cx - 0.025, cy - 0.025, 0.05, 0.05, discLift + 1.8);
  fillPts(ctx, [hole.N, hole.E, hole.S, hole.W], "#0a0a0c", null);

  // Tonearm: resting on the disc when playing, raised when stopped.
  const pivotX = deck.x + deck.w - 0.08;
  const pivotY = deck.y + 0.08;
  const armLift = on ? discLift + 2.4 : discLift + 7;
  const tipX = on ? cx + 0.04 : pivotX - 0.16;
  const tipY = on ? cy + 0.02 : pivotY + 0.08;
  box(ctx, pivotX - 0.035, pivotY - 0.035, 0.07, 0.07, tableH + 5.4, on ? 3 : 8, metal);
  const arm0 = pt(pivotX, pivotY, armLift);
  const arm1 = pt(tipX, tipY, on ? discLift + 2.6 : discLift + 6.2);
  ctx.save();
  ctx.strokeStyle = lights ? "#c4c8cc" : "#6a6e72";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(arm0.x, arm0.y);
  ctx.lineTo(arm1.x, arm1.y);
  ctx.stroke();
  ctx.restore();
  box(ctx, tipX - 0.025, tipY - 0.025, 0.05, 0.05, on ? discLift + 2.2 : discLift + 5.6, 1.4, pal("#2a2a2e", lights));

  // Front knobs + play lamp
  const knobY = front.y + front.h * 0.55;
  const knobX = front.x + front.w * 0.28;
  box(ctx, knobX, knobY, 0.08, 0.08, tableH + 3.2, 1.4, metal);
  box(ctx, knobX + 0.14, knobY, 0.08, 0.08, tableH + 3.2, 1.4, metal);
  const led = on ? (lights ? "#7dff9a" : "#4dff88") : (lights ? "#3a2a2a" : "#1a1010");
  box(ctx, front.x + front.w * 0.7, knobY, 0.07, 0.07, tableH + 3.4, 1.2, pal(led, true));
}

/* ---------- arcade picker + listen hint ---------- */

let hooks = {};
let openId = null;

function el(html) {
  const t = document.createElement("template");
  t.innerHTML = html.trim();
  return t.content.firstElementChild;
}

function vinylThumb(v) {
  return `<svg class="record-thumb" viewBox="0 0 40 40" width="40" height="40" aria-hidden="true">
    <circle cx="20" cy="20" r="18" fill="#141216" stroke="#2a1810" stroke-width="2"/>
    <circle cx="20" cy="20" r="13" fill="#1a181c"/>
    <circle cx="20" cy="20" r="6" fill="${v.label}" stroke="${v.label2}" stroke-width="1.5"/>
    <circle cx="20" cy="20" r="1.6" fill="#0a0a0c"/>
  </svg>`;
}

export function mountRecordPicker(h = {}) {
  hooks = h;
  if (typeof document === "undefined") return;
  if (document.getElementById("record-picker")) return;
  if (!document.querySelector('link[href="/css/recordPlayer.css"]')) {
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = "/css/recordPlayer.css";
    document.head.appendChild(link);
  }
  const host = document.getElementById("view-room") || document.body;
  const pane = el(`<div id="record-picker" class="record-picker hidden" data-testid="record-picker" role="dialog" aria-label="Spin a vinyl">
    <div class="record-picker-title">SPIN A VINYL</div>
    <div class="record-picker-grid" data-testid="record-picker-grid">
      ${VINYLS.map((v) => `<button type="button" class="record-vinyl" data-testid="record-vinyl-${v.id}" data-vinyl="${v.id}">
        ${vinylThumb(v)}
        <span class="record-vinyl-name">${v.name}</span>
      </button>`).join("")}
    </div>
    <div class="record-picker-actions">
      <button type="button" class="record-btn record-stop" data-testid="record-stop">STOP</button>
      <button type="button" class="record-btn record-listen hidden" data-testid="record-listen">TAP TO LISTEN</button>
    </div>
    <div class="record-picker-vol">
      <button type="button" class="record-btn record-mute" data-testid="record-mute" aria-pressed="false">MUTE</button>
      <input type="range" min="0" max="100" value="80" data-testid="record-volume" class="record-volume" aria-label="Volume" />
    </div>
    <button type="button" class="record-btn record-close" data-testid="record-close">CLOSE</button>
  </div>`);
  const hint = el(`<button type="button" id="record-listen-hint" class="record-listen-hint hidden" data-testid="record-listen-hint">♪ TAP TO LISTEN</button>`);
  host.appendChild(pane);
  host.appendChild(hint);
  installRecordAudioGestures();
  let lastVinylAt = 0;
  const pickVinyl = (id) => {
    if (!id) return;
    lastVinylAt = Date.now();
    // play() first, in this tap, before any socket/await work.
    playRecordVinyl(id);
    hooks.onSelect?.(openId, id);
  };
  const replayVinyl = (id) => { if (id) playRecordVinyl(id); };
  pane.querySelectorAll("[data-vinyl]").forEach((b) => {
    b.addEventListener("pointerdown", (e) => {
      if (e.button && e.button !== 0) return;
      pickVinyl(b.dataset.vinyl);
    });
    b.addEventListener("touchend", (e) => {
      replayVinyl(b.dataset.vinyl);
    }, { passive: true });
    b.addEventListener("click", () => {
      if (Date.now() - lastVinylAt < 450) {
        replayVinyl(b.dataset.vinyl);
        return;
      }
      pickVinyl(b.dataset.vinyl);
    });
  });
  pane.querySelector("[data-testid=record-stop]")?.addEventListener("click", () => hooks.onStop?.(openId));
  const listenNow = (id) => {
    const rec = hooks.getState?.(id || openId);
    if (rec?.on && rec.vinyl) playRecordVinyl(rec.vinyl);
    else unlockRecordAudio();
    hooks.onListen?.(id || openId);
  };
  pane.querySelector("[data-testid=record-listen]")?.addEventListener("pointerdown", () => listenNow(openId));
  pane.querySelector("[data-testid=record-listen]")?.addEventListener("touchend", () => listenNow(openId), { passive: true });
  pane.querySelector("[data-testid=record-listen]")?.addEventListener("click", () => listenNow(openId));
  pane.querySelector("[data-testid=record-close]")?.addEventListener("click", () => closeRecordPicker());
  pane.querySelector("[data-testid=record-mute]")?.addEventListener("click", () => {
    const next = !getRecordAudioState().muted;
    hooks.onMute?.(next);
    paintRecordPicker();
  });
  pane.querySelector("[data-testid=record-volume]")?.addEventListener("input", (e) => {
    hooks.onVolume?.(Number(e.target.value) / 100);
    paintRecordPicker();
  });
  hint.addEventListener("pointerdown", () => listenNow(hint.dataset.recordId));
  hint.addEventListener("touchend", () => listenNow(hint.dataset.recordId), { passive: true });
  hint.addEventListener("click", () => listenNow(hint.dataset.recordId));
}

export function openRecordPicker(id, rec) {
  openId = id;
  const pane = document.getElementById("record-picker");
  if (!pane) return false;
  pane.dataset.recordId = id;
  pane.classList.remove("hidden");
  paintRecordPicker(rec);
  try { preloadRecordAudio(); } catch {}
  return true;
}

export function closeRecordPicker() {
  openId = null;
  document.getElementById("record-picker")?.classList.add("hidden");
  hooks.onClose?.();
}

export function isRecordPickerOpen() {
  const pane = document.getElementById("record-picker");
  return Boolean(openId && pane && !pane.classList.contains("hidden"));
}

export function recordPickerId() {
  return openId;
}

export function paintRecordPicker(rec) {
  const pane = document.getElementById("record-picker");
  if (!pane || pane.classList.contains("hidden")) return;
  const state = rec || hooks.getState?.(openId) || {};
  const audio = getRecordAudioState();
  pane.querySelectorAll("[data-vinyl]").forEach((b) => {
    const on = state.on && state.vinyl === b.dataset.vinyl;
    b.classList.toggle("is-selected", on);
    b.setAttribute("aria-pressed", on ? "true" : "false");
  });
  const listenBtn = pane.querySelector("[data-testid=record-listen]");
  const needsListen = Boolean(state.on && !audio.listening);
  listenBtn?.classList.toggle("hidden", !needsListen);
  const mute = pane.querySelector("[data-testid=record-mute]");
  if (mute) {
    mute.textContent = audio.muted ? "UNMUTE" : "MUTE";
    mute.setAttribute("aria-pressed", audio.muted ? "true" : "false");
    mute.classList.toggle("is-on", audio.muted);
  }
  const vol = pane.querySelector("[data-testid=record-volume]");
  if (vol && document.activeElement !== vol) vol.value = String(Math.round(audio.volume * 100));
}

export function paintListenHint(playingId, clientRect) {
  const hint = document.getElementById("record-listen-hint");
  if (!hint) return;
  const audio = getRecordAudioState();
  const show = Boolean(playingId && !audio.listening);
  hint.classList.toggle("hidden", !show);
  if (!show) return;
  hint.dataset.recordId = playingId;
  if (clientRect) {
    hint.style.left = Math.round(clientRect.x + clientRect.w / 2) + "px";
    hint.style.top = Math.round(clientRect.y - 8) + "px";
  }
}

export {
  unlockRecordAudio,
  playRecordVinyl,
  isRecordListening,
  getRecordAudioState,
  setRecordVolume,
  setRecordMuted,
  syncRecordAudio,
  syncRoomRecordAudio,
  stopRecordAudio,
  DEFAULT_VOLUME,
};
