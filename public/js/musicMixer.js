/* Music Mixer furniture: 16-step patterns saved as playable vinyls. */

export const MIXER_TYPE = "musicmixer";
export const MIXER_NAME = "Music Mixer";
export const MIXER_PRICE = 28;
export const MIXER_STEPS = 16;
export const MIXER_TITLE_MAX = 24;
export const MIXER_MAX_MIXES = 24;
export const MIXER_VINYL_PREFIX = "mix_vinyl_";
export const MIXER_BPM_MIN = 70;
export const MIXER_BPM_MAX = 180;
export const MIXER_DEFAULT_BPM = 110;

export const DRUM_TRACKS = ["kick", "snare", "hat", "clap"];
export const MELODY_PRESETS = ["square", "bass", "pluck", "bell"];
export const MELODY_NOTES = [
  { name: "C3", freq: 130.81 },
  { name: "D3", freq: 146.83 },
  { name: "E3", freq: 164.81 },
  { name: "G3", freq: 196.00 },
  { name: "A3", freq: 220.00 },
  { name: "C4", freq: 261.63 },
  { name: "D4", freq: 293.66 },
  { name: "E4", freq: 329.63 },
];
export const MIX_LABEL_COLORS = [
  "#ff4da6", "#5ce1ff", "#f4c15d", "#7dff9a", "#b07cff", "#ff7a3a",
];

export const MIXER_CATALOG = {
  name: MIXER_NAME,
  price: MIXER_PRICE,
  w: 1,
  h: 1,
  blocks: true,
};

export function isMixVinyl(type) {
  return typeof type === "string" && type.startsWith(MIXER_VINYL_PREFIX) && type.length > MIXER_VINYL_PREFIX.length;
}

export function mixVinylType(id) {
  return MIXER_VINYL_PREFIX + String(id);
}

export function sanitizeTitle(title) {
  return String(title || "").replace(/\s+/g, " ").trim().slice(0, MIXER_TITLE_MAX) || "Untitled Mix";
}

export function canonColor(c) {
  const s = String(c || "").trim().toLowerCase();
  if (/^#[0-9a-f]{6}$/.test(s)) return s;
  return null;
}

function clamp01(n, fallback = 0.8) {
  const x = Number(n);
  if (!Number.isFinite(x)) return fallback;
  return Math.max(0, Math.min(1, x));
}

function emptyDrums() {
  const drums = {};
  for (const t of DRUM_TRACKS) drums[t] = Array(MIXER_STEPS).fill(0);
  return drums;
}

export function emptyMelody() {
  return Array(MIXER_STEPS).fill(null);
}

export function emptyPattern() {
  return {
    v: 1,
    title: "Untitled Mix",
    bpm: MIXER_DEFAULT_BPM,
    preset: "square",
    color: MIX_LABEL_COLORS[0],
    vols: { kick: 0.9, snare: 0.8, hat: 0.55, clap: 0.75, melody: 0.7 },
    drums: emptyDrums(),
    melody: emptyMelody(),
  };
}

function sanitizeDrums(raw) {
  const drums = emptyDrums();
  for (const t of DRUM_TRACKS) {
    const src = raw && raw[t];
    if (!Array.isArray(src) || src.length !== MIXER_STEPS) return null;
    drums[t] = src.map((v) => (v ? 1 : 0));
  }
  return drums;
}

function sanitizeMelody(raw) {
  if (!Array.isArray(raw) || raw.length !== MIXER_STEPS) return null;
  return raw.map((v) => {
    if (v == null || v === "" || v === false) return null;
    const n = Number(v);
    if (!Number.isInteger(n) || n < 0 || n >= MELODY_NOTES.length) return null;
    return n;
  });
}

export function clonePattern(p) {
  const d = emptyPattern();
  if (!p) return d;
  d.title = sanitizeTitle(p.title);
  const bpm = Math.round(Number(p.bpm));
  d.bpm = Number.isFinite(bpm) ? Math.max(MIXER_BPM_MIN, Math.min(MIXER_BPM_MAX, bpm)) : MIXER_DEFAULT_BPM;
  d.preset = MELODY_PRESETS.includes(p.preset) ? p.preset : "square";
  d.color = canonColor(p.color) || MIX_LABEL_COLORS[0];
  const vols = p.vols || {};
  d.vols = {
    kick: clamp01(vols.kick, 0.9),
    snare: clamp01(vols.snare, 0.8),
    hat: clamp01(vols.hat, 0.55),
    clap: clamp01(vols.clap, 0.75),
    melody: clamp01(vols.melody, 0.7),
  };
  const drums = sanitizeDrums(p.drums);
  const melody = sanitizeMelody(p.melody);
  if (drums) d.drums = drums;
  if (melody) d.melody = melody;
  return d;
}

export function validateMix(raw, { count = 0 } = {}) {
  if (count >= MIXER_MAX_MIXES) return { ok: false, error: "You already have 24 mixed records." };
  if (!raw || typeof raw !== "object") return { ok: false, error: "That mix is empty." };
  const title = sanitizeTitle(raw.title);
  const bpm = Math.round(Number(raw.bpm));
  if (!Number.isFinite(bpm) || bpm < MIXER_BPM_MIN || bpm > MIXER_BPM_MAX) {
    return { ok: false, error: "Tempo must be between 70 and 180 BPM." };
  }
  if (raw.preset != null && !MELODY_PRESETS.includes(raw.preset)) {
    return { ok: false, error: "Unknown sound preset." };
  }
  const drums = sanitizeDrums(raw.drums);
  if (!drums) return { ok: false, error: "Drum tracks must be 16 steps." };
  const melody = sanitizeMelody(raw.melody);
  if (!melody) return { ok: false, error: "Melody must be 16 steps." };
  const color = canonColor(raw.color) || MIX_LABEL_COLORS[0];
  const pattern = clonePattern({ ...raw, title, bpm, drums, melody, color });
  return {
    ok: true,
    mix: {
      title: pattern.title,
      color: pattern.color,
      data: pattern,
    },
  };
}

export function stepDuration(bpm) {
  const b = Number(bpm) || MIXER_DEFAULT_BPM;
  return 60 / b / 4;
}

export function loopDuration(pattern) {
  return stepDuration(pattern?.bpm) * MIXER_STEPS;
}

export function publicMix(mix) {
  if (!mix) return null;
  const type = mix.type || (mix.id != null ? mixVinylType(mix.id) : null);
  if (!isMixVinyl(type)) return null;
  const check = validateMix({ ...(mix.data || {}), title: mix.title, color: mix.color || mix.data?.color });
  if (!check.ok) return null;
  return {
    id: String(mix.id),
    type,
    title: check.mix.title,
    color: check.mix.color,
    data: check.mix.data,
  };
}

export function mixToVinyl(mix) {
  const pub = publicMix(mix);
  if (!pub) return null;
  const label = pub.color || MIX_LABEL_COLORS[0];
  return {
    id: pub.type,
    name: pub.title,
    label,
    label2: "#f4efe6",
    groove: "#1a1020",
    notes: [label, "#5ce1ff", "#f4c15d", "#7dff9a", "#b07cff"],
    blurb: "A beat mixed in this cube.",
    mix: true,
    pattern: pub.data,
  };
}

export function vinylThumbHtml(mix, title) {
  const pub = publicMix(mix) || { type: mix, title: title || "Mix", color: MIX_LABEL_COLORS[0] };
  const label = pub.color || MIX_LABEL_COLORS[0];
  const name = escapeHtml(title || pub.title || "Mix");
  return `<span class="mix-vinyl-thumb" data-mix-thumb="${escapeHtml(pub.type || "")}" data-testid="mix-thumb-${escapeHtml(pub.type || "")}">
    <svg class="mix-thumb" viewBox="0 0 40 40" width="40" height="40" aria-hidden="true">
      <circle cx="20" cy="20" r="18" fill="#141216" stroke="#2a1810" stroke-width="2"/>
      <circle cx="20" cy="20" r="13" fill="#1a181c"/>
      <circle cx="20" cy="20" r="6" fill="${label}" stroke="#f4efe6" stroke-width="1.5"/>
      <circle cx="20" cy="20" r="1.6" fill="#0a0a0c"/>
    </svg>
  </span>`;
}

function escapeHtml(s) {
  return String(s ?? "").replace(/[&<>"']/g, (ch) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  }[ch]));
}

export function demoPattern(kind = "house") {
  const p = emptyPattern();
  p.title = "Cube Beat";
  p.bpm = 110;
  p.preset = "square";
  p.color = "#ff4da6";
  if (kind === "house" || kind === "demo") {
    p.drums.kick = [1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0];
    p.drums.snare = [0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0];
    p.drums.hat = [0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0];
    p.drums.clap = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0];
    p.melody = [0, null, 2, null, 3, null, 2, null, 5, null, 4, null, 3, 2, 0, null];
  }
  return p;
}

export function registerMixerCatalog(iso) {
  if (!iso?.CATALOG) return;
  iso.CATALOG[MIXER_TYPE] = { ...MIXER_CATALOG };
}

export default {
  MIXER_TYPE, MIXER_NAME, MIXER_PRICE, MIXER_STEPS, isMixVinyl, mixVinylType,
  validateMix, emptyPattern, clonePattern, demoPattern, publicMix, mixToVinyl,
};
