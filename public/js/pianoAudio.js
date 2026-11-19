/* Keyboard Piano voices — Web Audio only, no sample files.
   Unlocks on a user gesture for iOS Safari and best-effort silent-switch. */

export const PIANO_VOICES = [
  { id: "grand", name: "Grand Piano" },
  { id: "epiano", name: "Electric Piano" },
  { id: "organ", name: "Organ" },
  { id: "synth", name: "Synth" },
  { id: "bells", name: "Music Box" },
];

export const PIANO_VOICE_IDS = PIANO_VOICES.map((v) => v.id);
export const PIANO_MIDI_MIN = 21;
export const PIANO_MIDI_MAX = 108;
export const DEFAULT_PIANO_VOLUME = 0.72;

const SILENT_WAV = "data:audio/wav;base64,UklGRigAAABXQVZFZm10IBIAAAABAAEARKwAAIhYAQACABAAAABkYXRhAgAAAAEA";

let live = null;
const voices = new Map(); // key -> { stop }
let voiceSeq = 0;

export function midiToFreq(m) {
  return 440 * Math.pow(2, (m - 69) / 12);
}

export function clampMidi(n) {
  const m = Math.round(Number(n));
  if (!Number.isFinite(m)) return null;
  if (m < PIANO_MIDI_MIN || m > PIANO_MIDI_MAX) return null;
  return m;
}

export function isPianoVoice(id) {
  return PIANO_VOICE_IDS.includes(String(id || ""));
}

function ctxClass() {
  return (typeof globalThis !== "undefined" && (globalThis.AudioContext || globalThis.webkitAudioContext)) || undefined;
}

function ensureSilentEl() {
  if (typeof document === "undefined") return null;
  let el = document.getElementById("piano-silent-audio");
  if (el) return el;
  el = document.createElement("audio");
  el.id = "piano-silent-audio";
  el.setAttribute("playsinline", "");
  el.setAttribute("webkit-playsinline", "");
  el.setAttribute("preload", "auto");
  el.loop = true;
  el.src = SILENT_WAV;
  el.volume = 0.01;
  el.style.position = "fixed";
  el.style.left = "-99px";
  el.style.width = "1px";
  el.style.height = "1px";
  el.style.opacity = "0";
  el.setAttribute("aria-hidden", "true");
  document.body.append(el);
  return el;
}

function ensureLive() {
  if (live) return live;
  const Ctx = ctxClass();
  const ctx = Ctx ? new Ctx() : null;
  live = {
    ctx,
    master: null,
    volume: DEFAULT_PIANO_VOLUME,
    primed: false,
    unlocked: false,
  };
  if (ctx) {
    const master = ctx.createGain();
    master.gain.value = live.volume;
    const filter = ctx.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.value = 14000;
    filter.Q.value = 0.5;
    master.connect(filter);
    filter.connect(ctx.destination);
    live.master = master;
    live.filter = filter;
  }
  return live;
}

function resumeContext() {
  const deck = ensureLive();
  if (deck?.ctx && (deck.ctx.state === "suspended" || deck.ctx.state === "interrupted")) {
    try { deck.ctx.resume(); } catch {}
  }
  return deck;
}

function playSilentBuffer(ctx) {
  try {
    const buf = ctx.createBuffer(1, 1, ctx.sampleRate);
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const g = ctx.createGain();
    g.gain.value = 0.0001;
    src.connect(g);
    g.connect(ctx.destination);
    src.start(0);
  } catch {}
}

export function unlockPianoAudio() {
  const deck = resumeContext();
  if (!deck) return false;
  if (deck.ctx) playSilentBuffer(deck.ctx);
  const el = ensureSilentEl();
  if (el) {
    try {
      const p = el.play();
      if (p && typeof p.then === "function") p.catch(() => {});
    } catch {}
  }
  deck.primed = true;
  deck.unlocked = Boolean(!deck.ctx || deck.ctx.state === "running" || deck.ctx.state === "interrupted");
  return deck.unlocked || deck.primed;
}

export function setPianoVolume(v) {
  const deck = ensureLive();
  const vol = Math.max(0, Math.min(1, Number(v)));
  if (!Number.isFinite(vol)) return deck.volume;
  deck.volume = vol;
  if (deck.master && deck.ctx) {
    try { deck.master.gain.setTargetAtTime(vol, deck.ctx.currentTime, 0.02); } catch { deck.master.gain.value = vol; }
  }
  return deck.volume;
}

export function getPianoAudioState() {
  const deck = live || {};
  return {
    unlocked: Boolean(deck.unlocked || (deck.ctx && deck.ctx.state === "running")),
    primed: Boolean(deck.primed),
    volume: deck.volume ?? DEFAULT_PIANO_VOLUME,
    ctx: deck.ctx ? deck.ctx.state : "none",
    sounding: voices.size,
  };
}

function env(gain, t, a, d, s, r, peak, hold, sustainHold) {
  const g = gain.gain;
  const p = Math.max(0.0002, peak);
  g.cancelScheduledValues(t);
  g.setValueAtTime(0.0001, t);
  g.exponentialRampToValueAtTime(p, t + Math.max(0.004, a));
  const decEnd = t + a + Math.max(0.01, d);
  g.exponentialRampToValueAtTime(Math.max(0.0002, s), decEnd);
  if (!sustainHold && hold != null) {
    const relAt = Math.max(decEnd, t + hold);
    g.setValueAtTime(Math.max(0.0002, s), relAt);
    g.exponentialRampToValueAtTime(0.0001, relAt + r);
  }
}

function addOsc(ctx, dest, type, freq, detune, t) {
  const osc = ctx.createOscillator();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t);
  if (detune) osc.detune.setValueAtTime(detune, t);
  osc.connect(dest);
  return osc;
}

function startVoice(ctx, dest, midi, voice, vel, t) {
  const freq = midiToFreq(midi);
  const v = Math.max(0.15, Math.min(1, vel || 0.85));
  const oscs = [];
  const nodes = [];
  const g = ctx.createGain();
  g.gain.value = 0.0001;
  let release = 0.18;
  let sustainHold = true;

  if (voice === "grand") {
    const body = ctx.createGain();
    body.gain.value = 0.7 * v;
    const harm = ctx.createGain();
    harm.gain.value = 0.22 * v;
    const high = ctx.createGain();
    high.gain.value = 0.08 * v;
    body.connect(g); harm.connect(g); high.connect(g);
    oscs.push(addOsc(ctx, body, "triangle", freq, -4, t));
    oscs.push(addOsc(ctx, body, "sine", freq, 6, t));
    oscs.push(addOsc(ctx, harm, "sine", freq * 2, 0, t));
    oscs.push(addOsc(ctx, high, "sine", freq * 3, 0, t));
    // Soft hammer noise
    try {
      const noise = ctx.createBufferSource();
      const buf = ctx.createBuffer(1, Math.floor(ctx.sampleRate * 0.04), ctx.sampleRate);
      const data = buf.getChannelData(0);
      for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / data.length);
      noise.buffer = buf;
      const bp = ctx.createBiquadFilter();
      bp.type = "bandpass";
      bp.frequency.value = Math.min(8000, freq * 4);
      const ng = ctx.createGain();
      ng.gain.setValueAtTime(0.12 * v, t);
      ng.gain.exponentialRampToValueAtTime(0.0001, t + 0.04);
      noise.connect(bp); bp.connect(ng); ng.connect(g);
      noise.start(t);
      noise.stop(t + 0.05);
      oscs.push(noise);
      nodes.push(bp, ng);
    } catch {}
    env(g, t, 0.008, 0.28, 0.22 * v, 0.45, 0.9 * v, null, true);
    release = 0.5;
    nodes.push(body, harm, high);
  } else if (voice === "epiano") {
    const body = ctx.createGain();
    body.gain.value = 0.65 * v;
    const tine = ctx.createGain();
    tine.gain.value = 0.28 * v;
    body.connect(g); tine.connect(g);
    oscs.push(addOsc(ctx, body, "sine", freq, 0, t));
    oscs.push(addOsc(ctx, body, "sine", freq * 2.003, 0, t));
    oscs.push(addOsc(ctx, tine, "sine", freq * 4.7, 0, t));
    env(g, t, 0.006, 0.22, 0.28 * v, 0.55, 0.8 * v, null, true);
    release = 0.55;
    nodes.push(body, tine);
  } else if (voice === "organ") {
    const bars = [1, 2, 3, 4, 6];
    const gains = [0.5, 0.32, 0.16, 0.1, 0.08];
    bars.forEach((mult, i) => {
      const bg = ctx.createGain();
      bg.gain.value = gains[i] * v;
      bg.connect(g);
      oscs.push(addOsc(ctx, bg, "sine", freq * mult, 0, t));
      nodes.push(bg);
    });
    env(g, t, 0.02, 0.05, 0.7 * v, 0.12, 0.75 * v, null, true);
    release = 0.14;
  } else if (voice === "synth") {
    const lp = ctx.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.setValueAtTime(600, t);
    lp.frequency.exponentialRampToValueAtTime(Math.min(6800, freq * 8), t + 0.08);
    lp.frequency.exponentialRampToValueAtTime(1400, t + 0.4);
    lp.Q.value = 1.1;
    lp.connect(g);
    oscs.push(addOsc(ctx, lp, "sawtooth", freq, -6, t));
    oscs.push(addOsc(ctx, lp, "sawtooth", freq, 7, t));
    env(g, t, 0.02, 0.18, 0.42 * v, 0.28, 0.7 * v, null, true);
    release = 0.3;
    nodes.push(lp);
  } else {
    // Music box / bells: bright inharmonic partials, short sustain.
    const parts = [1, 2.76, 5.4, 8.03];
    const gains = [0.55, 0.28, 0.14, 0.07];
    parts.forEach((mult, i) => {
      const bg = ctx.createGain();
      bg.gain.value = gains[i] * v;
      bg.connect(g);
      oscs.push(addOsc(ctx, bg, "sine", freq * mult, 0, t));
      nodes.push(bg);
    });
    env(g, t, 0.004, 0.6, 0.0002, 0.8, 0.85 * v, 1.4, false);
    sustainHold = false;
    release = 0.7;
  }

  g.connect(dest);
  for (const o of oscs) {
    try { if (o.start) o.start(t); } catch {}
  }
  return { oscs, nodes, gain: g, release, sustainHold, startedAt: t };
}

function stopVoiceEntry(entry, immediate) {
  if (!entry || entry.stopped) return;
  entry.stopped = true;
  const deck = live;
  const ctx = deck?.ctx;
  const t = ctx ? ctx.currentTime : 0;
  const rel = immediate ? 0.03 : (entry.release || 0.2);
  try {
    if (entry.gain && ctx) {
      const g = entry.gain.gain;
      const cur = Math.max(0.0002, g.value || 0.0002);
      g.cancelScheduledValues(t);
      g.setValueAtTime(cur, t);
      g.exponentialRampToValueAtTime(0.0001, t + rel);
    }
  } catch {}
  const halt = t + rel + 0.05;
  for (const o of entry.oscs || []) {
    try { if (o.stop) o.stop(halt); } catch {}
  }
  setTimeout(() => {
    try { entry.gain?.disconnect(); } catch {}
    for (const n of entry.nodes || []) { try { n.disconnect(); } catch {} }
  }, (rel + 0.08) * 1000);
}

export function playPianoNote(midi, voice, vel = 0.85) {
  const m = clampMidi(midi);
  if (m == null) return null;
  unlockPianoAudio();
  const deck = ensureLive();
  if (!deck?.ctx || !deck.master) return null;
  resumeContext();
  const t = deck.ctx.currentTime;
  const kind = isPianoVoice(voice) ? voice : "grand";
  // Retrigger same midi.
  stopPianoNote(m, true);
  const entry = startVoice(deck.ctx, deck.master, m, kind, vel, t);
  const id = "n" + (++voiceSeq) + ":" + m;
  entry.midi = m;
  entry.voice = kind;
  voices.set(String(m), entry);
  entry.id = id;
  return id;
}

export function stopPianoNote(midi, immediate = false) {
  const m = clampMidi(midi);
  if (m == null) return;
  const entry = voices.get(String(m));
  if (!entry) return;
  voices.delete(String(m));
  stopVoiceEntry(entry, immediate);
}

export function stopAllPianoNotes(immediate = false) {
  for (const [k, entry] of voices) {
    voices.delete(k);
    stopVoiceEntry(entry, immediate);
  }
}

export function soundingPianoNotes() {
  return [...voices.keys()].map((k) => Number(k)).filter(Number.isFinite);
}
