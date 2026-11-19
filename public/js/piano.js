/* Keyboard Piano — 2x1 furniture, cream play panel, iso art. */

import {
  PIANO_VOICES, PIANO_VOICE_IDS, PIANO_MIDI_MIN, PIANO_MIDI_MAX, DEFAULT_PIANO_VOLUME,
  isPianoVoice, clampMidi, unlockPianoAudio, playPianoNote, stopPianoNote,
  stopAllPianoNotes, setPianoVolume, getPianoAudioState, soundingPianoNotes,
} from "./pianoAudio.js";

export const PIANO_TYPE = "keyboardpiano";
export const PIANO_NAME = "Keyboard Piano";
export const PIANO_PRICE = 40;
export const PIANO_TILES = [2, 1];
export const PIANO_BODY_H = 26;
export { PIANO_VOICES, PIANO_VOICE_IDS, PIANO_MIDI_MIN, PIANO_MIDI_MAX, DEFAULT_PIANO_VOLUME, isPianoVoice, clampMidi };

export const VISIBLE_SEMITONES = 24; // two octaves + top tonic
export const BASE_MIDI = 48; // C3
export const OCTAVE_MIN = -2;
export const OCTAVE_MAX = 3;

const WHITE_STEPS = [0, 2, 4, 5, 7, 9, 11];
const BLACK_AFTER = new Set([0, 1, 3, 4, 5]); // white-index in an octave that has a sharp after it

export function midiName(midi) {
  const names = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
  const m = clampMidi(midi);
  if (m == null) return "";
  const oct = Math.floor(m / 12) - 1;
  return names[m % 12] + oct;
}

export function isWhiteMidi(midi) {
  return WHITE_STEPS.includes(((midi % 12) + 12) % 12);
}

export function visibleRange(octave) {
  const oct = Math.max(OCTAVE_MIN, Math.min(OCTAVE_MAX, Math.round(Number(octave) || 0)));
  const start = BASE_MIDI + oct * 12;
  const end = start + VISIBLE_SEMITONES;
  return { octave: oct, start, end, label: midiName(start) + "–" + midiName(end) };
}

export function whiteKeysInRange(start, end) {
  const keys = [];
  for (let m = start; m <= end; m++) if (isWhiteMidi(m)) keys.push(m);
  return keys;
}

export function blackKeysInRange(start, end) {
  const keys = [];
  for (let m = start; m <= end; m++) if (!isWhiteMidi(m)) keys.push(m);
  return keys;
}

export function notesKey(notes) {
  const list = [...new Set((notes || []).map(clampMidi).filter((n) => n != null))].sort((a, b) => a - b);
  return list.join(".");
}

function pitchClassLit(notes, midi) {
  const set = new Set((notes || []).map(clampMidi).filter((n) => n != null));
  if (set.has(midi)) return true;
  const pc = ((midi % 12) + 12) % 12;
  for (const n of set) if (((n % 12) + 12) % 12 === pc) return true;
  return false;
}

export function drawKeyboardPiano(ctx, tw, th, rot, lights, opts = {}, iso) {
  const { box, pal, shadow, insetBox, normalizeFurnRot } = iso;
  const full = insetBox(tw, th);
  const r = normalizeFurnRot(rot);
  const notes = opts.notes || [];
  const bodyH = 16;
  const wood = pal("#5a3a22", lights);
  const casePal = pal("#1c1a20", lights);
  const gold = pal("#e0b43a", lights);
  const ink = wood.ink || "#2a1810";

  shadow(ctx, full.x, full.y, full.w, full.h, 0.32);
  const leg = 0.1;
  const legs = pal("#3a2414", lights);
  const spots = [
    [full.x + 0.06, full.y + 0.06],
    [full.x + full.w - leg - 0.06, full.y + 0.06],
    [full.x + 0.06, full.y + full.h - leg - 0.06],
    [full.x + full.w - leg - 0.06, full.y + full.h - leg - 0.06],
  ];
  for (const [lx, ly] of spots) box(ctx, lx, ly, leg, leg, 0, 8, legs);

  box(ctx, full.x + 0.04, full.y + 0.04, full.w - 0.08, full.h - 0.08, 8, bodyH - 8, wood);

  const bands = [
    pal("#d82a32", true).base,
    pal("#2a5ae0", true).base,
    pal("#22b84a", true).base,
    pal("#f0c428", true).base,
    pal("#f4f0e8", true).base,
    pal("#f07818", true).base,
  ];
  // Cube stickers on the case sides (visible faces).
  const alongX = full.w >= full.h;
  if (alongX) {
    box(ctx, full.x + 0.12, full.y + 0.02, 0.18, 0.08, 10, 5, pal(bands[0], true));
    box(ctx, full.x + 0.34, full.y + 0.02, 0.18, 0.08, 10, 5, pal(bands[1], true));
    box(ctx, full.x + full.w - 0.52, full.y + 0.02, 0.18, 0.08, 10, 5, pal(bands[2], true));
    box(ctx, full.x + full.w - 0.30, full.y + 0.02, 0.18, 0.08, 10, 5, pal(bands[3], true));
  } else {
    box(ctx, full.x + 0.02, full.y + 0.12, 0.08, 0.18, 10, 5, pal(bands[0], true));
    box(ctx, full.x + 0.02, full.y + 0.34, 0.08, 0.18, 10, 5, pal(bands[1], true));
    box(ctx, full.x + 0.02, full.y + full.h - 0.52, 0.08, 0.18, 10, 5, pal(bands[2], true));
    box(ctx, full.x + 0.02, full.y + full.h - 0.30, 0.08, 0.18, 10, 5, pal(bands[3], true));
  }

  // Keybed frame
  box(ctx, full.x + 0.05, full.y + 0.05, full.w - 0.1, full.h - 0.1, bodyH, 2, casePal);
  box(ctx, full.x + 0.04, full.y + 0.04, full.w - 0.08, full.h - 0.08, bodyH + 1, 1, gold);

  // Music rack at the back (far in iso = smaller y or x depending on rot).
  const rackD = alongX ? Math.min(0.28, full.h * 0.32) : Math.min(0.28, full.w * 0.32);
  if (alongX) {
    box(ctx, full.x + 0.1, full.y + 0.05, full.w - 0.2, rackD, bodyH + 2, 8, casePal);
    box(ctx, full.x + full.w / 2 - 0.1, full.y + 0.08, 0.2, 0.16, bodyH + 10, 1, pal(bands[3], true));
  } else {
    box(ctx, full.x + 0.05, full.y + 0.1, rackD, full.h - 0.2, bodyH + 2, 8, casePal);
    box(ctx, full.x + 0.08, full.y + full.h / 2 - 0.1, 0.16, 0.2, bodyH + 10, 1, pal(bands[3], true));
  }

  const whites = whiteKeysInRange(48, 72);
  const nW = whites.length;
  const keyPad = 0.03;
  const keyLift = bodyH + 3;
  if (alongX) {
    const ky = full.y + rackD + 0.08;
    const kh = Math.max(0.22, full.h - rackD - 0.14);
    const kw = (full.w - keyPad * 2) / nW;
    const kx0 = full.x + keyPad;
    whites.forEach((midi, i) => {
      const on = pitchClassLit(notes, midi);
      const col = on ? (lights ? "#ffe066" : "#d4a830") : (lights ? "#f6f1e6" : "#d8d0c4");
      box(ctx, kx0 + i * kw + 0.008, ky, kw - 0.016, kh, keyLift, on ? 0.6 : 1.2, {
        top: col, left: on ? "#f0c850" : "#e8e0d4", right: on ? "#c9a028" : "#c8c0b4", outline: ink,
      });
    });
    const bk = blackKeysInRange(48, 72);
    bk.forEach((midi) => {
      const after = whites.findIndex((w) => w === midi - 1);
      if (after < 0) return;
      const on = pitchClassLit(notes, midi);
      const bw = kw * 0.58;
      const bh = kh * 0.6;
      const bx = kx0 + (after + 1) * kw - bw / 2;
      const by = ky;
      box(ctx, bx, by, bw, bh, keyLift + 1.2, on ? 0.8 : 1.4, {
        top: on ? "#f4c15d" : "#1a181c",
        left: on ? "#e0b43a" : "#2a282c",
        right: on ? "#a07a20" : "#0c0a10",
        outline: ink,
      });
    });
  } else {
    const kx = full.x + rackD + 0.08;
    const kw = Math.max(0.22, full.w - rackD - 0.14);
    const kh = (full.h - keyPad * 2) / nW;
    const ky0 = full.y + keyPad;
    whites.forEach((midi, i) => {
      const on = pitchClassLit(notes, midi);
      const col = on ? (lights ? "#ffe066" : "#d4a830") : (lights ? "#f6f1e6" : "#d8d0c4");
      box(ctx, kx, ky0 + i * kh + 0.008, kw, kh - 0.016, keyLift, on ? 0.6 : 1.2, {
        top: col, left: on ? "#f0c850" : "#e8e0d4", right: on ? "#c9a028" : "#c8c0b4", outline: ink,
      });
    });
    const bk = blackKeysInRange(48, 72);
    bk.forEach((midi) => {
      const after = whites.findIndex((w) => w === midi - 1);
      if (after < 0) return;
      const on = pitchClassLit(notes, midi);
      const bw = kw * 0.6;
      const bh = kh * 0.58;
      const by = ky0 + (after + 1) * kh - bh / 2;
      box(ctx, kx, by, bw, bh, keyLift + 1.2, on ? 0.8 : 1.4, {
        top: on ? "#f4c15d" : "#1a181c",
        left: on ? "#e0b43a" : "#2a282c",
        right: on ? "#a07a20" : "#0c0a10",
        outline: ink,
      });
    });
  }
}

export function pianoParticles(id, notes, now) {
  const list = (notes || []).map(clampMidi).filter((n) => n != null);
  if (!list.length) return [];
  const out = [];
  const colors = ["#f4c15d", "#ffe9a0", "#ff7ad9", "#8eb8ff"];
  list.slice(0, 6).forEach((m, i) => {
    const seed = (String(id || "") + ":" + m + ":" + i).split("").reduce((a, c) => a + c.charCodeAt(0), 0);
    const t = ((now / 16) + seed) % 900;
    const life = t / 900;
    out.push({
      x: ((seed * 13) % 70) - 20,
      y: -8 - life * 28,
      a: 1 - life,
      color: colors[(m + i) % colors.length],
    });
  });
  return out;
}

export function drawPianoParticles(ctx, sx, sy, parts, lights) {
  if (!parts?.length) return;
  ctx.save();
  for (const p of parts) {
    ctx.globalAlpha = Math.max(0, Math.min(1, p.a)) * (lights ? 1 : 0.75);
    ctx.fillStyle = p.color || "#f4c15d";
    const x = sx + p.x, y = sy + p.y;
    ctx.beginPath();
    ctx.ellipse(x, y, 3, 4, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillRect(x + 2, y - 8, 1.5, 8);
  }
  ctx.globalAlpha = 1;
  ctx.restore();
}

/* ——— UI ——— */

const panelState = {
  id: null,
  voice: "grand",
  volume: DEFAULT_PIANO_VOLUME,
  octave: 0,
  sustain: false,
  held: new Set(), // midis held by pointer
  sustainHeld: new Set(),
  pointers: new Map(), // pointerId -> midi
  onNote: null,
  onClose: null,
  getSafe: null,
};

export function isPianoOpen() {
  const el = document.getElementById("cube-piano");
  return Boolean(panelState.id && el && el.classList.contains("is-open"));
}

export function pianoPanelState() {
  const el = document.getElementById("cube-piano");
  const r = el && !el.hidden ? el.getBoundingClientRect() : null;
  const board = el?.querySelector("[data-testid=piano-board]");
  const br = board?.getBoundingClientRect();
  const vw = window.innerWidth, vh = window.innerHeight;
  const range = visibleRange(panelState.octave);
  const whites = whiteKeysInRange(range.start, range.end);
  const blacks = blackKeysInRange(range.start, range.end);
  const keys = [...(el?.querySelectorAll("[data-piano-key]") || [])];
  const keyRects = keys.slice(0, 3).map((k) => {
    const kr = k.getBoundingClientRect();
    return { midi: Number(k.dataset.midi), w: kr.width, h: kr.height, on: kr.left >= -1 && kr.right <= vw + 1 };
  });
  const safe = typeof panelState.getSafe === "function" ? panelState.getSafe() : { top: 8, bottom: vh - 8 };
  const onScreen = Boolean(r && r.left >= -1 && r.top >= -1 && r.right <= vw + 1 && r.bottom <= vh + 1);
  const clearsChrome = Boolean(r && r.top >= (safe.top || 0) - 1 && r.bottom <= (safe.bottom || vh) + 1);
  const boardOnScreen = Boolean(br && br.left >= -1 && br.right <= vw + 1 && br.top >= -1 && br.bottom <= vh + 1);
  return {
    open: isPianoOpen(),
    id: panelState.id,
    voice: panelState.voice,
    volume: panelState.volume,
    octave: range.octave,
    sustain: panelState.sustain,
    startMidi: range.start,
    endMidi: range.end,
    label: range.label,
    voices: PIANO_VOICE_IDS.slice(),
    keysOn: [...panelState.held, ...panelState.sustainHeld],
    whiteCount: whites.length,
    blackCount: blacks.length,
    keyCount: whites.length + blacks.length,
    rect: r ? { left: r.left, right: r.right, top: r.top, bottom: r.bottom, w: r.width, h: r.height } : null,
    onScreen,
    clearsChrome,
    boardOnScreen,
    keyRects,
    audio: getPianoAudioState(),
    vw, vh,
  };
}

function defaultSafe() {
  const pad = 8;
  const vw = window.innerWidth, vh = window.innerHeight;
  let top = pad, bottom = vh - pad;
  const topSels = ["#view-room .topbar", "#shop-toggle", "#edit-room-btn", "#leave-cube", "#room-coins-btn"];
  for (const sel of topSels) {
    const n = document.querySelector(sel);
    if (!n || n.hidden) continue;
    const r = n.getBoundingClientRect();
    if (r.height > 0 && r.bottom < vh * 0.45) top = Math.max(top, Math.ceil(r.bottom) + pad);
  }
  for (const sel of ["#chat-dock", "#phone-btn", "#char-slots-btn", "#emote-wheel-btn", "#chat-bubble-btn"]) {
    const n = document.querySelector(sel);
    if (!n || n.hidden) continue;
    const r = n.getBoundingClientRect();
    if (r.height > 0 && r.bottom > vh * 0.45) bottom = Math.min(bottom, Math.floor(r.top) - pad);
  }
  if (bottom - top < 180) { top = pad; bottom = Math.max(top + 180, vh - 64); }
  return { top, bottom, left: pad, right: vw - pad, width: vw - pad * 2, height: Math.max(180, bottom - top), vw, vh };
}

export function layoutPianoPanel() {
  const el = document.getElementById("cube-piano");
  if (!el || !panelState.id) return;
  const safe = (typeof panelState.getSafe === "function" ? panelState.getSafe() : null) || defaultSafe();
  const width = Math.max(280, Math.min(360, safe.width));
  el.style.width = width + "px";
  el.style.maxWidth = safe.width + "px";
  el.style.maxHeight = safe.height + "px";
  el.style.overflow = "hidden";
  el.style.left = Math.round(safe.left + Math.max(0, (safe.width - width) / 2)) + "px";
  el.style.top = safe.top + "px";
  void el.offsetHeight;
  const rh = Math.min(el.getBoundingClientRect().height || 0, safe.height);
  // Pin just above the dock so the furniture piano stays visible in the room.
  const gap = 10;
  let top = safe.bottom - rh - gap;
  top = Math.min(Math.max(top, safe.top), Math.max(safe.top, safe.bottom - rh));
  el.style.top = Math.round(top) + "px";
  const rect = el.getBoundingClientRect();
  if (rect.bottom > safe.bottom) {
    el.style.top = Math.round(Math.max(safe.top, safe.bottom - Math.min(rect.height, safe.height))) + "px";
  }
}

function ensurePanel() {
  let el = document.getElementById("cube-piano");
  if (el) return el;
  el = document.createElement("div");
  el.id = "cube-piano";
  el.className = "cube-piano";
  el.hidden = true;
  el.dataset.testid = "piano-window";
  el.innerHTML = `
    <div class="cube-piano-head">
      <h2 class="cube-piano-title">Keyboard Piano</h2>
      <button type="button" class="cube-piano-close" data-testid="piano-close" aria-label="Close piano">×</button>
    </div>
    <div class="cube-piano-voices" data-testid="piano-voices"></div>
    <div class="cube-piano-controls">
      <button type="button" class="cube-piano-oct" data-testid="piano-oct-down" aria-label="Octave down">−</button>
      <div class="cube-piano-oct-label" data-testid="piano-oct-label">C3–C5</div>
      <button type="button" class="cube-piano-oct" data-testid="piano-oct-up" aria-label="Octave up">+</button>
      <label class="cube-piano-vol">
        <span>Vol</span>
        <input type="range" min="0" max="100" value="72" data-testid="piano-volume" />
      </label>
      <button type="button" class="cube-piano-sustain" data-testid="piano-sustain" aria-pressed="false">Sustain</button>
    </div>
    <div class="cube-piano-board" data-testid="piano-board"></div>
    <p class="cube-piano-hint">Tap keys to play. Hold several for a chord.</p>
  `;
  el.querySelector("[data-testid=piano-close]").addEventListener("click", (e) => {
    e.preventDefault();
    closePiano();
  });
  el.querySelector("[data-testid=piano-oct-down]").addEventListener("click", (e) => {
    e.preventDefault();
    setOctave(panelState.octave - 1);
  });
  el.querySelector("[data-testid=piano-oct-up]").addEventListener("click", (e) => {
    e.preventDefault();
    setOctave(panelState.octave + 1);
  });
  el.querySelector("[data-testid=piano-volume]").addEventListener("input", (e) => {
    panelState.volume = setPianoVolume(Number(e.target.value) / 100);
  });
  el.querySelector("[data-testid=piano-sustain]").addEventListener("click", (e) => {
    e.preventDefault();
    setSustain(!panelState.sustain);
  });
  const board = el.querySelector("[data-testid=piano-board]");
  board.addEventListener("pointerdown", onBoardPointerDown);
  board.addEventListener("pointermove", onBoardPointerMove);
  board.addEventListener("pointerup", onBoardPointerUp);
  board.addEventListener("pointercancel", onBoardPointerUp);
  board.addEventListener("lostpointercapture", onBoardPointerUp);
  board.addEventListener("contextmenu", (e) => e.preventDefault());
  document.body.append(el);
  return el;
}

function setOctave(next) {
  const range = visibleRange(next);
  if (range.octave === panelState.octave) return;
  releaseAll(true);
  panelState.octave = range.octave;
  paintBoard();
  const label = ensurePanel().querySelector("[data-testid=piano-oct-label]");
  if (label) label.textContent = range.label;
}

function setSustain(on) {
  panelState.sustain = Boolean(on);
  const btn = ensurePanel().querySelector("[data-testid=piano-sustain]");
  if (btn) btn.setAttribute("aria-pressed", panelState.sustain ? "true" : "false");
  if (!panelState.sustain) releaseSustain();
}

function paintVoices() {
  const row = ensurePanel().querySelector("[data-testid=piano-voices]");
  row.replaceChildren();
  for (const v of PIANO_VOICES) {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "cube-piano-voice" + (v.id === panelState.voice ? " is-on" : "");
    b.dataset.testid = "piano-voice-" + v.id;
    b.dataset.voice = v.id;
    b.textContent = v.name;
    b.addEventListener("click", (e) => {
      e.preventDefault();
      unlockPianoAudio();
      panelState.voice = v.id;
      paintVoices();
    });
    row.append(b);
  }
}

function paintBoard() {
  const board = ensurePanel().querySelector("[data-testid=piano-board]");
  const range = visibleRange(panelState.octave);
  const whites = whiteKeysInRange(range.start, range.end);
  const blacks = blackKeysInRange(range.start, range.end);
  board.replaceChildren();
  const whiteRow = document.createElement("div");
  whiteRow.className = "piano-whites";
  whites.forEach((midi) => {
    const k = document.createElement("button");
    k.type = "button";
    k.className = "piano-key piano-key-white";
    k.dataset.pianoKey = "1";
    k.dataset.midi = String(midi);
    k.dataset.testid = "piano-key-" + midi;
    k.setAttribute("aria-label", midiName(midi));
    if (panelState.held.has(midi) || panelState.sustainHeld.has(midi)) k.classList.add("is-on");
    whiteRow.append(k);
  });
  board.append(whiteRow);
  const blackRow = document.createElement("div");
  blackRow.className = "piano-blacks";
  blacks.forEach((midi) => {
    const after = whites.indexOf(midi - 1);
    if (after < 0) return;
    const k = document.createElement("button");
    k.type = "button";
    k.className = "piano-key piano-key-black";
    k.dataset.pianoKey = "1";
    k.dataset.midi = String(midi);
    k.dataset.testid = "piano-key-" + midi;
    k.setAttribute("aria-label", midiName(midi));
    k.style.left = ((after + 1) / whites.length * 100) + "%";
    if (panelState.held.has(midi) || panelState.sustainHeld.has(midi)) k.classList.add("is-on");
    blackRow.append(k);
  });
  board.append(blackRow);
  const label = ensurePanel().querySelector("[data-testid=piano-oct-label]");
  if (label) label.textContent = range.label;
}

function lightKey(midi, on) {
  const el = document.querySelector('[data-testid="piano-key-' + midi + '"]');
  if (el) el.classList.toggle("is-on", Boolean(on));
}

function emitNote(midi, on, vel) {
  if (typeof panelState.onNote === "function") {
    panelState.onNote({
      id: panelState.id,
      note: midi,
      on: Boolean(on),
      voice: panelState.voice,
      vel: vel ?? 0.85,
    });
  }
}

function startLocal(midi, vel) {
  const m = clampMidi(midi);
  if (m == null) return;
  unlockPianoAudio();
  playPianoNote(m, panelState.voice, vel);
  panelState.held.add(m);
  panelState.sustainHeld.delete(m);
  lightKey(m, true);
  emitNote(m, true, vel);
}

function stopLocal(midi, fromSustain = false) {
  const m = clampMidi(midi);
  if (m == null) return;
  panelState.held.delete(m);
  if (panelState.sustain && !fromSustain) {
    panelState.sustainHeld.add(m);
    lightKey(m, true);
    return;
  }
  panelState.sustainHeld.delete(m);
  stopPianoNote(m, false);
  lightKey(m, false);
  emitNote(m, false);
}

function releaseSustain() {
  for (const m of [...panelState.sustainHeld]) {
    if (panelState.held.has(m)) continue;
    stopLocal(m, true);
  }
}

function releaseAll(immediate) {
  for (const m of [...panelState.held, ...panelState.sustainHeld]) {
    stopPianoNote(m, immediate);
    lightKey(m, false);
    emitNote(m, false);
  }
  panelState.held.clear();
  panelState.sustainHeld.clear();
  panelState.pointers.clear();
}

function keyFromPoint(x, y) {
  const board = document.querySelector("[data-testid=piano-board]");
  if (!board) return null;
  const blacks = [...board.querySelectorAll(".piano-key-black")];
  for (const k of blacks) {
    const r = k.getBoundingClientRect();
    if (x >= r.left && x <= r.right && y >= r.top && y <= r.bottom) return Number(k.dataset.midi);
  }
  const whites = [...board.querySelectorAll(".piano-key-white")];
  for (const k of whites) {
    const r = k.getBoundingClientRect();
    if (x >= r.left && x <= r.right && y >= r.top && y <= r.bottom) return Number(k.dataset.midi);
  }
  return null;
}

function onBoardPointerDown(e) {
  if (e.button != null && e.button !== 0) return;
  e.preventDefault();
  e.stopPropagation();
  unlockPianoAudio();
  const board = e.currentTarget;
  try { board.setPointerCapture(e.pointerId); } catch {}
  const midi = keyFromPoint(e.clientX, e.clientY);
  if (midi == null) return;
  panelState.pointers.set(e.pointerId, midi);
  startLocal(midi, 0.88);
}

function onBoardPointerMove(e) {
  if (!panelState.pointers.has(e.pointerId)) return;
  e.preventDefault();
  const midi = keyFromPoint(e.clientX, e.clientY);
  const prev = panelState.pointers.get(e.pointerId);
  if (midi == null || midi === prev) return;
  stopLocal(prev);
  panelState.pointers.set(e.pointerId, midi);
  startLocal(midi, 0.8);
}

function onBoardPointerUp(e) {
  const prev = panelState.pointers.get(e.pointerId);
  panelState.pointers.delete(e.pointerId);
  if (prev != null) stopLocal(prev);
}

export function applyRemotePianoNote({ note, on, voice, vel, fromSelf } = {}) {
  const m = clampMidi(note);
  if (m == null) return;
  if (on) {
    if (!fromSelf) {
      unlockPianoAudio();
      playPianoNote(m, isPianoVoice(voice) ? voice : panelState.voice, vel ?? 0.8);
    }
    lightKey(m, true);
  } else {
    if (!fromSelf && !panelState.held.has(m) && !panelState.sustainHeld.has(m)) stopPianoNote(m, false);
    if (!panelState.held.has(m) && !panelState.sustainHeld.has(m)) lightKey(m, false);
  }
}

export function pressPianoMidi(midi) {
  const m = clampMidi(midi);
  if (m == null) return false;
  startLocal(m, 0.9);
  return true;
}

export function releasePianoMidi(midi) {
  const m = clampMidi(midi);
  if (m == null) return false;
  stopLocal(m);
  return true;
}

export function openPiano(id, hooks = {}) {
  if (!id) return;
  panelState.id = id;
  panelState.onNote = hooks.onNote || panelState.onNote;
  panelState.onClose = hooks.onClose || panelState.onClose;
  panelState.getSafe = hooks.getSafe || panelState.getSafe;
  unlockPianoAudio();
  const el = ensurePanel();
  el.hidden = false;
  el.classList.add("is-open");
  paintVoices();
  paintBoard();
  const vol = el.querySelector("[data-testid=piano-volume]");
  if (vol) vol.value = String(Math.round(panelState.volume * 100));
  setPianoVolume(panelState.volume);
  setSustain(panelState.sustain);
  layoutPianoPanel();
}

export function closePiano() {
  const id = panelState.id;
  releaseAll(true);
  stopAllPianoNotes(false);
  const el = document.getElementById("cube-piano");
  if (el) {
    el.classList.remove("is-open");
    el.hidden = true;
  }
  panelState.id = null;
  if (id && typeof panelState.onClose === "function") panelState.onClose(id);
}

export function mountPiano(hooks = {}) {
  if (hooks.onNote) panelState.onNote = hooks.onNote;
  if (hooks.onClose) panelState.onClose = hooks.onClose;
  if (hooks.getSafe) panelState.getSafe = hooks.getSafe;
  if (typeof window !== "undefined") {
    window.addEventListener("resize", () => { if (isPianoOpen()) layoutPianoPanel(); });
  }
}

export function currentPianoId() {
  return panelState.id;
}

export function currentPianoVoice() {
  return panelState.voice;
}
