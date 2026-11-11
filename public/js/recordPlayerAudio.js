/* Original looping lofi beats for the Record table — Web Audio only, no
   copyrighted samples. Dusty swung drums, jazzy 7ths/9ths, soft e-piano,
   sub bass, vinyl crackle, and a warm low-pass. Each vinyl has its own
   key, tempo, progression, and feel. Audio starts only after a user tap. */

export const VINYL_FEELS = {
  "neon-drift": {
    bpm: 84,
    key: "F# minor",
    swing: 0.58,
    cutoff: 2800,
    crackle: 0.035,
    hatGain: 0.07,
    snareGain: 0.2,
    kickGain: 0.7,
    pianoGain: 0.18,
    padGain: 0.1,
    bassGain: 0.28,
    pianoColor: 2.2,
    progression: [
      [66, 69, 73, 76, 80], // F#m9
      [62, 66, 69, 73],     // Dmaj7
      [64, 68, 71, 73, 78], // E6/9
      [61, 64, 68, 71],     // C#m7
    ],
    bass: [66, 62, 64, 61],
    hatEvery: 2,
    extraHat: true,
  },
  "midnight-ramen": {
    bpm: 74,
    key: "Eb major",
    swing: 0.66,
    cutoff: 2200,
    crackle: 0.055,
    hatGain: 0.05,
    snareGain: 0.18,
    kickGain: 0.75,
    pianoGain: 0.2,
    padGain: 0.12,
    bassGain: 0.3,
    pianoColor: 1.6,
    progression: [
      [63, 67, 70, 74, 77], // Ebmaj9
      [60, 63, 67, 70, 74], // Cm9
      [65, 68, 72, 75, 79], // Fm11
      [70, 74, 77, 80, 84], // Bb13-ish
    ],
    bass: [63, 60, 65, 70],
    hatEvery: 2,
    extraHat: false,
  },
  "rainy-rooftop": {
    bpm: 78,
    key: "A minor",
    swing: 0.6,
    cutoff: 1900,
    crackle: 0.07,
    hatGain: 0.045,
    snareGain: 0.16,
    kickGain: 0.62,
    pianoGain: 0.17,
    padGain: 0.14,
    bassGain: 0.26,
    pianoColor: 1.4,
    progression: [
      [69, 72, 76, 79, 83], // Am9
      [65, 69, 72, 76],     // Fmaj7
      [60, 64, 67, 71, 74], // Cmaj9
      [67, 71, 74, 77, 81], // G13
    ],
    bass: [69, 65, 60, 67],
    hatEvery: 4,
    extraHat: false,
  },
  "cube-city-nights": {
    bpm: 88,
    key: "D minor",
    swing: 0.54,
    cutoff: 3000,
    crackle: 0.03,
    hatGain: 0.075,
    snareGain: 0.22,
    kickGain: 0.72,
    pianoGain: 0.19,
    padGain: 0.09,
    bassGain: 0.32,
    pianoColor: 2.0,
    progression: [
      [62, 65, 69, 72, 76], // Dm9
      [70, 74, 77, 81],     // Bbmaj7
      [65, 69, 72, 76, 79], // Fmaj9
      [60, 64, 67, 70, 74], // C9
    ],
    bass: [62, 70, 65, 60],
    hatEvery: 2,
    extraHat: true,
    bounceBass: true,
  },
};

function midiToFreq(m) {
  return 440 * 2 ** ((m - 69) / 12);
}

function swingOffset(eighthIndex, beat, swing) {
  if (eighthIndex % 2 === 0) return 0;
  return (swing - 0.5) * beat;
}

function makeNoiseBuffer(ctx, seconds = 1) {
  const len = Math.max(1, Math.floor(ctx.sampleRate * seconds));
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
  return buf;
}

function envGain(ctx, dest, t, a, d, s, r, peak, dur) {
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), t + a);
  const hold = Math.max(a, dur - r);
  if (s < peak) g.gain.exponentialRampToValueAtTime(Math.max(0.0002, s), t + hold);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  g.connect(dest);
  return g;
}

function playKick(ctx, dest, t, gain, feel) {
  const osc = ctx.createOscillator();
  const g = ctx.createGain();
  osc.type = "sine";
  osc.frequency.setValueAtTime(150, t);
  osc.frequency.exponentialRampToValueAtTime(38, t + 0.08);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(gain * (feel.kickGain || 0.7), t + 0.008);
  g.gain.exponentialRampToValueAtTime(0.0001, t + 0.28);
  osc.connect(g);
  g.connect(dest);
  osc.start(t);
  osc.stop(t + 0.3);
}

function playSnare(ctx, dest, noise, t, gain, feel) {
  const src = ctx.createBufferSource();
  src.buffer = noise;
  const bp = ctx.createBiquadFilter();
  bp.type = "bandpass";
  bp.frequency.value = 1800;
  bp.Q.value = 0.8;
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(gain * (feel.snareGain || 0.2), t + 0.004);
  g.gain.exponentialRampToValueAtTime(0.0001, t + 0.14);
  src.connect(bp);
  bp.connect(g);
  g.connect(dest);
  src.start(t);
  src.stop(t + 0.16);
  const tone = ctx.createOscillator();
  const tg = ctx.createGain();
  tone.type = "triangle";
  tone.frequency.setValueAtTime(180, t);
  tone.frequency.exponentialRampToValueAtTime(120, t + 0.08);
  tg.gain.setValueAtTime(0.0001, t);
  tg.gain.exponentialRampToValueAtTime(gain * 0.12, t + 0.004);
  tg.gain.exponentialRampToValueAtTime(0.0001, t + 0.1);
  tone.connect(tg);
  tg.connect(dest);
  tone.start(t);
  tone.stop(t + 0.12);
}

function playHat(ctx, dest, noise, t, gain, feel, open = false) {
  const src = ctx.createBufferSource();
  src.buffer = noise;
  const hp = ctx.createBiquadFilter();
  hp.type = "highpass";
  hp.frequency.value = open ? 6000 : 9000;
  const g = ctx.createGain();
  const dur = open ? 0.12 : 0.04;
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(gain * (feel.hatGain || 0.06) * (open ? 0.8 : 1), t + 0.002);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  src.connect(hp);
  hp.connect(g);
  g.connect(dest);
  src.start(t);
  src.stop(t + dur + 0.01);
}

function playRhodes(ctx, dest, t, midis, gain, feel, dur = 1.6) {
  const peak = gain * (feel.pianoGain || 0.18);
  for (let i = 0; i < midis.length; i++) {
    const freq = midiToFreq(midis[i]);
    const g = envGain(ctx, dest, t + i * 0.012, 0.012, 0.25, peak * 0.45, 0.5, peak * (1 - i * 0.08), dur);
    const a = ctx.createOscillator();
    const b = ctx.createOscillator();
    a.type = "sine";
    b.type = "triangle";
    a.frequency.value = freq;
    b.frequency.value = freq * 2 + 0.4;
    const filt = ctx.createBiquadFilter();
    filt.type = "lowpass";
    filt.frequency.setValueAtTime(1400 * (feel.pianoColor || 1.8), t);
    filt.frequency.exponentialRampToValueAtTime(700, t + dur);
    a.connect(filt);
    b.connect(filt);
    filt.connect(g);
    a.start(t);
    b.start(t);
    a.stop(t + dur + 0.05);
    b.stop(t + dur + 0.05);
  }
}

function playPad(ctx, dest, t, midis, gain, feel, dur = 3.2) {
  const peak = gain * (feel.padGain || 0.1);
  for (const m of midis.slice(0, 4)) {
    const freq = midiToFreq(m);
    const g = envGain(ctx, dest, t, 0.25, 0.4, peak * 0.7, 0.6, peak, dur);
    const osc = ctx.createOscillator();
    const osc2 = ctx.createOscillator();
    osc.type = "triangle";
    osc2.type = "sine";
    osc.frequency.value = freq;
    osc2.frequency.value = freq * 0.5;
    const filt = ctx.createBiquadFilter();
    filt.type = "lowpass";
    filt.frequency.value = 640;
    osc.connect(filt);
    osc2.connect(filt);
    filt.connect(g);
    osc.start(t);
    osc2.start(t);
    osc.stop(t + dur + 0.05);
    osc2.stop(t + dur + 0.05);
  }
}

function playBass(ctx, dest, t, midi, gain, feel, dur = 0.45) {
  const freq = midiToFreq(midi - 12);
  const g = envGain(ctx, dest, t, 0.01, 0.12, gain * (feel.bassGain || 0.28) * 0.5, 0.15, gain * (feel.bassGain || 0.28), dur);
  const osc = ctx.createOscillator();
  osc.type = "sine";
  osc.frequency.setValueAtTime(freq * 1.06, t);
  osc.frequency.exponentialRampToValueAtTime(freq, t + 0.04);
  osc.connect(g);
  osc.start(t);
  osc.stop(t + dur + 0.05);
}

function playCrackle(ctx, dest, noise, t, feel) {
  const src = ctx.createBufferSource();
  src.buffer = noise;
  src.loop = false;
  const hp = ctx.createBiquadFilter();
  hp.type = "highpass";
  hp.frequency.value = 1200;
  const g = ctx.createGain();
  const peak = feel.crackle || 0.04;
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(peak * (0.3 + Math.random() * 0.7), t + 0.001);
  g.gain.exponentialRampToValueAtTime(0.0001, t + 0.012 + Math.random() * 0.02);
  src.connect(hp);
  hp.connect(g);
  g.connect(dest);
  src.start(t);
  src.stop(t + 0.04);
}

export function barDuration(feel) {
  return (60 / feel.bpm) * 4;
}

/** Schedule one 4-beat bar of a vinyl into `dest` starting at audio time `when`. */
export function scheduleBar(ctx, dest, noise, feel, when, barIndex, gain = 1) {
  const beat = 60 / feel.bpm;
  const eighth = beat / 2;
  const chord = feel.progression[barIndex % feel.progression.length];
  const root = feel.bass[barIndex % feel.bass.length];
  playPad(ctx, dest, when, chord, gain, feel, barDuration(feel) * 0.98);
  playRhodes(ctx, dest, when, chord, gain, feel, beat * 2.2);
  if (barIndex % 2 === 1) playRhodes(ctx, dest, when + beat * 2 + swingOffset(4, beat, feel.swing), chord.slice(0, 3), gain * 0.7, feel, beat * 1.4);

  // drums: kick 1 & 3, snare 2 & 4, swung 8th hats
  for (let i = 0; i < 8; i++) {
    const t = when + i * eighth + swingOffset(i, beat, feel.swing);
    if (i % (feel.hatEvery || 2) === 0) playHat(ctx, dest, noise, t, gain, feel, false);
    else if (feel.extraHat && i % 2 === 1) playHat(ctx, dest, noise, t, gain * 0.55, feel, false);
  }
  playKick(ctx, dest, when, gain, feel);
  playKick(ctx, dest, when + beat * 2, gain, feel);
  if (feel.bounceBass) playKick(ctx, dest, when + beat * 2.5 + swingOffset(5, beat, feel.swing), gain * 0.55, feel);
  playSnare(ctx, dest, noise, when + beat, gain, feel);
  playSnare(ctx, dest, noise, when + beat * 3, gain, feel);

  playBass(ctx, dest, when, root, gain, feel, beat * 1.1);
  playBass(ctx, dest, when + beat * 2, root, gain, feel, beat * 0.8);
  if (feel.bounceBass) playBass(ctx, dest, when + beat * 3 + swingOffset(6, beat, feel.swing), root + 7, gain * 0.7, feel, beat * 0.5);

  const crackles = Math.round(10 + feel.crackle * 80);
  for (let i = 0; i < crackles; i++) {
    playCrackle(ctx, dest, noise, when + Math.random() * barDuration(feel), feel);
  }
}

function connectMaster(ctx, feel) {
  const filter = ctx.createBiquadFilter();
  filter.type = "lowpass";
  filter.frequency.value = feel?.cutoff || 2400;
  filter.Q.value = 0.7;
  const shaper = ctx.createWaveShaper();
  const curve = new Float32Array(256);
  for (let i = 0; i < 256; i++) {
    const x = (i / 128) - 1;
    curve[i] = Math.tanh(x * 1.4);
  }
  shaper.curve = curve;
  const gain = ctx.createGain();
  gain.gain.value = 0.0001;
  filter.connect(shaper);
  shaper.connect(gain);
  return { filter, gain, input: filter };
}

const STORE_VOL = "mycube.record.volume";
const STORE_MUTE = "mycube.record.muted";

function readVol() {
  try {
    const raw = localStorage.getItem(STORE_VOL);
    if (raw == null || raw === "") return 0.55;
    const n = Number(raw);
    if (Number.isFinite(n)) return Math.min(1, Math.max(0, n));
  } catch {}
  return 0.55;
}
function readMute() {
  try { return localStorage.getItem(STORE_MUTE) === "1"; } catch { return false; }
}

let live = null;

function ensureLive() {
  if (live) return live;
  if (typeof AudioContext === "undefined" && typeof webkitAudioContext === "undefined") return null;
  const Ctx = AudioContext || webkitAudioContext;
  const ctx = new Ctx();
  const noise = makeNoiseBuffer(ctx, 1.5);
  const dummyFeel = VINYL_FEELS["neon-drift"];
  const master = connectMaster(ctx, dummyFeel);
  master.gain.connect(ctx.destination);
  live = {
    ctx,
    noise,
    master,
    playing: null,
    nextBar: 0,
    barIndex: 0,
    timer: null,
    volume: readVol(),
    muted: readMute(),
    listening: false,
  };
  applyLiveGain(0);
  return live;
}

function applyLiveGain(target, at = 0.05) {
  if (!live) return;
  const g = live.muted || !live.playing ? 0.0001 : Math.max(0.0001, live.volume * 0.9);
  const t = live.ctx.currentTime + at;
  live.master.gain.gain.cancelScheduledValues(live.ctx.currentTime);
  live.master.gain.gain.setValueAtTime(Math.max(0.0001, live.master.gain.gain.value || 0.0001), live.ctx.currentTime);
  live.master.gain.gain.exponentialRampToValueAtTime(target == null ? g : Math.max(0.0001, target), t);
}

function schedulerTick() {
  if (!live?.playing) return;
  const feel = VINYL_FEELS[live.playing];
  if (!feel) return;
  const bar = barDuration(feel);
  const ahead = live.ctx.currentTime + 0.25;
  while (live.nextBar < ahead) {
    scheduleBar(live.ctx, live.master.input, live.noise, feel, live.nextBar, live.barIndex, 1);
    live.nextBar += bar;
    live.barIndex += 1;
  }
}

export async function unlockRecordAudio() {
  const deck = ensureLive();
  if (!deck) return false;
  if (deck.ctx.state === "suspended") {
    try { await deck.ctx.resume(); } catch { return false; }
  }
  deck.listening = true;
  return deck.ctx.state === "running";
}

export function isRecordListening() {
  return Boolean(live?.listening && live.ctx && live.ctx.state !== "closed");
}

export function getRecordAudioState() {
  return {
    listening: isRecordListening(),
    playing: live?.playing || null,
    vinyl: live?.playing || null,
    volume: live ? live.volume : readVol(),
    muted: live ? live.muted : readMute(),
    ctx: live?.ctx?.state || "none",
  };
}

export function setRecordVolume(v) {
  const raw = Number(v);
  const n = Number.isFinite(raw) ? Math.min(1, Math.max(0, raw)) : (live?.volume ?? readVol());
  try { localStorage.setItem(STORE_VOL, String(n)); } catch {}
  if (live) {
    live.volume = n;
    if (n <= 0.001) live.muted = false;
    applyLiveGain();
  }
  return n;
}

export function setRecordMuted(on) {
  const muted = Boolean(on);
  try { localStorage.setItem(STORE_MUTE, muted ? "1" : "0"); } catch {}
  if (live) {
    live.muted = muted;
    applyLiveGain();
  }
  return muted;
}

export async function syncRecordAudio(rec, { userGesture = false } = {}) {
  const on = Boolean(rec?.on && rec?.vinyl && VINYL_FEELS[rec.vinyl]);
  if (userGesture) {
    const ok = await unlockRecordAudio();
    if (!ok) return getRecordAudioState();
  }
  const deck = live;
  if (!deck || !deck.listening) return getRecordAudioState();
  if (!on) {
    if (deck.playing) {
      applyLiveGain(0.0001, 0.12);
      deck.playing = null;
      if (deck.timer) { clearInterval(deck.timer); deck.timer = null; }
    }
    return getRecordAudioState();
  }
  if (deck.playing === rec.vinyl && deck.timer) return getRecordAudioState();
  // Switch or start.
  if (deck.ctx.state === "suspended") {
    if (!userGesture) return getRecordAudioState();
    try { await deck.ctx.resume(); } catch { return getRecordAudioState(); }
  }
  deck.master.filter.frequency.value = VINYL_FEELS[rec.vinyl].cutoff;
  deck.playing = rec.vinyl;
  deck.barIndex = 0;
  deck.nextBar = deck.ctx.currentTime + 0.06;
  if (deck.timer) clearInterval(deck.timer);
  schedulerTick();
  deck.timer = setInterval(schedulerTick, 80);
  applyLiveGain(null, 0.08);
  return getRecordAudioState();
}

export async function stopRecordAudio({ fade = true } = {}) {
  if (!live) return;
  if (fade) applyLiveGain(0.0001, 0.1);
  live.playing = null;
  if (live.timer) { clearInterval(live.timer); live.timer = null; }
}

export async function renderVinylSample(vinylId, seconds = 15) {
  const feel = VINYL_FEELS[vinylId];
  if (!feel || typeof OfflineAudioContext === "undefined") return null;
  const sr = 44100;
  const dur = Math.max(4, seconds);
  const ctx = new OfflineAudioContext(2, Math.ceil(sr * dur), sr);
  const noise = makeNoiseBuffer(ctx, 1.5);
  const master = connectMaster(ctx, feel);
  master.gain.gain.setValueAtTime(0.0001, 0);
  master.gain.gain.exponentialRampToValueAtTime(0.7, 0.08);
  master.gain.gain.setValueAtTime(0.7, dur - 0.4);
  master.gain.gain.exponentialRampToValueAtTime(0.0001, dur - 0.02);
  master.gain.connect(ctx.destination);
  const bar = barDuration(feel);
  let t = 0.08;
  let barIndex = 0;
  while (t < dur - 0.05) {
    scheduleBar(ctx, master.input, noise, feel, t, barIndex, 1);
    t += bar;
    barIndex += 1;
  }
  const rendered = await ctx.startRendering();
  return rendered;
}

export function audioBufferToWav(buffer) {
  const ch = buffer.numberOfChannels;
  const sr = buffer.sampleRate;
  const len = buffer.length;
  const bytes = len * ch * 2;
  const ab = new ArrayBuffer(44 + bytes);
  const view = new DataView(ab);
  const writeStr = (o, s) => { for (let i = 0; i < s.length; i++) view.setUint8(o + i, s.charCodeAt(i)); };
  writeStr(0, "RIFF");
  view.setUint32(4, 36 + bytes, true);
  writeStr(8, "WAVE");
  writeStr(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, ch, true);
  view.setUint32(24, sr, true);
  view.setUint32(28, sr * ch * 2, true);
  view.setUint16(32, ch * 2, true);
  view.setUint16(34, 16, true);
  writeStr(36, "data");
  view.setUint32(40, bytes, true);
  let off = 44;
  const channels = [];
  for (let c = 0; c < ch; c++) channels.push(buffer.getChannelData(c));
  for (let i = 0; i < len; i++) {
    for (let c = 0; c < ch; c++) {
      const s = Math.max(-1, Math.min(1, channels[c][i]));
      view.setInt16(off, s < 0 ? s * 0x8000 : s * 0x7fff, true);
      off += 2;
    }
  }
  return ab;
}
