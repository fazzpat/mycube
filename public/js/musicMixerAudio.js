/* WebAudio drums + melody for the mixer preview and mixed vinyls. */
import {
  MIXER_STEPS, DRUM_TRACKS, MELODY_NOTES, MIXER_DEFAULT_BPM, isMixVinyl,
  clonePattern, stepDuration, loopDuration,
} from "./musicMixer.js";

let resolvePattern = (id) => null;
let startedAtFor = (id) => 0;
let live = null;

export function setMixPatternResolver(fn) {
  resolvePattern = typeof fn === "function" ? fn : () => null;
}

export function setMixStartedAtResolver(fn) {
  startedAtFor = typeof fn === "function" ? fn : () => 0;
}

function audioCtx() {
  const Ctx = (typeof globalThis !== "undefined" && (globalThis.AudioContext || globalThis.webkitAudioContext))
    || (typeof window !== "undefined" && (window.AudioContext || window.webkitAudioContext))
    || undefined;
  return Ctx ? new Ctx() : null;
}

function ensureLive() {
  if (live) return live;
  const ctx = audioCtx();
  const master = ctx ? ctx.createGain() : null;
  if (master && ctx) master.connect(ctx.destination);
  if (master) master.gain.value = 0.8;
  live = {
    ctx,
    master,
    noise: ctx ? makeNoise(ctx) : null,
    playing: null,
    pattern: null,
    timer: null,
    nextTime: 0,
    step: 0,
    volume: 0.8,
    muted: false,
    onStep: null,
  };
  return live;
}

function makeNoise(ctx, seconds = 1) {
  const n = Math.ceil(ctx.sampleRate * seconds);
  const buf = ctx.createBuffer(1, n, ctx.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < n; i++) data[i] = Math.random() * 2 - 1;
  return buf;
}

function applyGain() {
  const deck = live;
  if (!deck?.master) return;
  const vol = deck.muted ? 0 : Math.max(0, Math.min(1, deck.volume));
  try { deck.master.gain.setTargetAtTime(vol, deck.ctx.currentTime, 0.02); } catch {
    deck.master.gain.value = vol;
  }
}

export function setMixGain(volume, muted) {
  const deck = ensureLive();
  if (volume != null) deck.volume = Math.max(0, Math.min(1, Number(volume) || 0));
  if (muted != null) deck.muted = Boolean(muted);
  applyGain();
}

function envGain(ctx, dest, when, peak, attack, decay) {
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, when);
  g.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), when + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, when + attack + decay);
  g.connect(dest);
  return g;
}

export function scheduleKick(ctx, dest, when, vel = 0.9) {
  const osc = ctx.createOscillator();
  const g = envGain(ctx, dest, when, vel, 0.004, 0.22);
  osc.type = "sine";
  osc.frequency.setValueAtTime(150, when);
  osc.frequency.exponentialRampToValueAtTime(40, when + 0.12);
  osc.connect(g);
  osc.start(when);
  osc.stop(when + 0.28);
}

export function scheduleSnare(ctx, dest, noise, when, vel = 0.8) {
  const src = ctx.createBufferSource();
  src.buffer = noise;
  const filt = ctx.createBiquadFilter();
  filt.type = "bandpass";
  filt.frequency.value = 1800;
  filt.Q.value = 0.8;
  const g = envGain(ctx, dest, when, vel * 0.7, 0.002, 0.16);
  src.connect(filt);
  filt.connect(g);
  src.start(when);
  src.stop(when + 0.2);
  const osc = ctx.createOscillator();
  osc.type = "triangle";
  osc.frequency.setValueAtTime(180, when);
  osc.frequency.exponentialRampToValueAtTime(120, when + 0.08);
  const og = envGain(ctx, dest, when, vel * 0.35, 0.002, 0.1);
  osc.connect(og);
  osc.start(when);
  osc.stop(when + 0.12);
}

export function scheduleHat(ctx, dest, noise, when, vel = 0.55) {
  const src = ctx.createBufferSource();
  src.buffer = noise;
  const filt = ctx.createBiquadFilter();
  filt.type = "highpass";
  filt.frequency.value = 7000;
  const g = envGain(ctx, dest, when, vel * 0.5, 0.001, 0.05);
  src.connect(filt);
  filt.connect(g);
  src.start(when);
  src.stop(when + 0.07);
}

export function scheduleClap(ctx, dest, noise, when, vel = 0.75) {
  for (const off of [0, 0.012, 0.024]) {
    const src = ctx.createBufferSource();
    src.buffer = noise;
    const filt = ctx.createBiquadFilter();
    filt.type = "bandpass";
    filt.frequency.value = 1200;
    const g = envGain(ctx, dest, when + off, vel * (off === 0.024 ? 0.7 : 0.35), 0.001, 0.12);
    src.connect(filt);
    filt.connect(g);
    src.start(when + off);
    src.stop(when + off + 0.16);
  }
}

export function scheduleMelody(ctx, dest, when, pitch, preset, vel = 0.7) {
  const note = MELODY_NOTES[pitch];
  if (!note) return;
  const osc = ctx.createOscillator();
  const osc2 = ctx.createOscillator();
  let peak = vel;
  let decay = 0.28;
  let type = "square";
  let freq = note.freq;
  if (preset === "bass") {
    type = "sawtooth";
    freq = note.freq / 2;
    decay = 0.42;
    peak = vel * 0.85;
  } else if (preset === "pluck") {
    type = "triangle";
    decay = 0.16;
  } else if (preset === "bell") {
    type = "sine";
    decay = 0.55;
  }
  osc.type = type;
  osc.frequency.setValueAtTime(freq, when);
  const g = envGain(ctx, dest, when, peak, 0.004, decay);
  osc.connect(g);
  osc.start(when);
  osc.stop(when + decay + 0.05);
  if (preset === "bell") {
    osc2.type = "sine";
    osc2.frequency.setValueAtTime(freq * 2.01, when);
    const g2 = envGain(ctx, dest, when, peak * 0.25, 0.004, decay * 0.7);
    osc2.connect(g2);
    osc2.start(when);
    osc2.stop(when + decay);
  }
}

export function schedulePatternStep(ctx, dest, noise, pattern, step, when) {
  const p = clonePattern(pattern);
  const i = ((step % MIXER_STEPS) + MIXER_STEPS) % MIXER_STEPS;
  const vols = p.vols || {};
  if (p.drums.kick[i]) scheduleKick(ctx, dest, when, vols.kick);
  if (p.drums.snare[i]) scheduleSnare(ctx, dest, noise, when, vols.snare);
  if (p.drums.hat[i]) scheduleHat(ctx, dest, noise, when, vols.hat);
  if (p.drums.clap[i]) scheduleClap(ctx, dest, noise, when, vols.clap);
  if (p.melody[i] != null) scheduleMelody(ctx, dest, when, p.melody[i], p.preset, vols.melody);
}

function stopTimer() {
  if (live?.timer) {
    clearTimeout(live.timer);
    live.timer = null;
  }
}

function tick() {
  const deck = live;
  if (!deck?.ctx || !deck.pattern || !deck.playing) return;
  const ctx = deck.ctx;
  const dur = stepDuration(deck.pattern.bpm);
  const ahead = 0.12;
  try {
    while (deck.nextTime < ctx.currentTime + ahead) {
      schedulePatternStep(ctx, deck.master, deck.noise, deck.pattern, deck.step, deck.nextTime);
      deck.onStep?.(deck.step, deck.nextTime);
      deck.step = (deck.step + 1) % MIXER_STEPS;
      deck.nextTime += dur;
    }
  } catch {}
  deck.timer = setTimeout(tick, 25);
}

function startLoop(id, pattern, startedAt) {
  const deck = ensureLive();
  if (!deck.ctx) return false;
  if (deck.ctx.state === "suspended" || deck.ctx.state === "interrupted") {
    try { deck.ctx.resume(); } catch {}
  }
  stopTimer();
  const p = clonePattern(pattern);
  const dur = stepDuration(p.bpm);
  const loop = dur * MIXER_STEPS;
  const now = deck.ctx.currentTime;
  let step = 0;
  let next = now + 0.04;
  const origin = Number(startedAt) || 0;
  if (origin > 0) {
    const elapsed = Math.max(0, (Date.now() - origin) / 1000);
    const into = ((elapsed % loop) + loop) % loop;
    step = Math.floor(into / dur) % MIXER_STEPS;
    const remain = dur - (into % dur);
    next = now + Math.max(0.01, remain);
  }
  deck.pattern = p;
  deck.playing = id || "preview";
  deck.step = step;
  deck.nextTime = next;
  applyGain();
  tick();
  return true;
}

export function playMixPreview(pattern, { onStep } = {}) {
  const deck = ensureLive();
  deck.onStep = onStep || null;
  return startLoop("preview", pattern, 0);
}

export function playMixVinyl(id, opts = {}) {
  const pattern = opts.pattern || resolvePattern(id);
  if (!pattern) return false;
  const deck = ensureLive();
  deck.onStep = opts.onStep || null;
  if (opts.volume != null || opts.muted != null) setMixGain(opts.volume, opts.muted);
  const startedAt = opts.startedAt != null ? opts.startedAt : startedAtFor(id);
  return startLoop(id, pattern, startedAt);
}

export function stopMixAudio() {
  stopTimer();
  if (live) {
    live.playing = null;
    live.pattern = null;
    live.onStep = null;
  }
}

export function isMixPlaying(id) {
  if (!live?.playing) return false;
  if (id == null) return true;
  return live.playing === id;
}

export function mixPlaybackState() {
  return {
    playing: live?.playing || null,
    step: live?.step ?? 0,
    hasCtx: Boolean(live?.ctx),
  };
}

export function recoverMixAudio() {
  if (!live?.playing || !live.pattern) return;
  if (live.ctx && (live.ctx.state === "suspended" || live.ctx.state === "interrupted")) {
    try { live.ctx.resume(); } catch {}
  }
  if (!live.timer) tick();
}

export function hasMixVinyl(id) {
  return Boolean(id && (isMixVinyl(id) || resolvePattern(id)));
}

export function registerMixEngine(audioApi) {
  if (!audioApi?.registerMixEngine) return;
  audioApi.registerMixEngine({
    has: (id) => hasMixVinyl(id),
    play: (id, opts) => playMixVinyl(id, opts || {}),
    stop: () => stopMixAudio(),
    isPlaying: (id) => isMixPlaying(id),
    setGain: (volume, muted) => setMixGain(volume, muted),
    recover: () => recoverMixAudio(),
  });
}

export { loopDuration, stepDuration };
export default { playMixPreview, playMixVinyl, stopMixAudio, schedulePatternStep };
