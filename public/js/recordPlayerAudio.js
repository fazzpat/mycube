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
  filter.frequency.value = (feel?.cutoff || 2400) + 400;
  filter.Q.value = 0.65;
  // Presence / mid boost — lofi low-pass is otherwise too quiet on phone speakers.
  const mid = ctx.createBiquadFilter();
  mid.type = "peaking";
  mid.frequency.value = 2200;
  mid.Q.value = 0.85;
  mid.gain.value = 7;
  const highmid = ctx.createBiquadFilter();
  highmid.type = "peaking";
  highmid.frequency.value = 3600;
  highmid.Q.value = 0.7;
  highmid.gain.value = 4;
  const shaper = ctx.createWaveShaper();
  const curve = new Float32Array(256);
  for (let i = 0; i < 256; i++) {
    const x = (i / 128) - 1;
    curve[i] = Math.tanh(x * 1.35);
  }
  shaper.curve = curve;
  const gain = ctx.createGain();
  gain.gain.value = 0.0001;
  filter.connect(mid);
  mid.connect(highmid);
  highmid.connect(shaper);
  shaper.connect(gain);
  return { filter, mid, highmid, gain, input: filter };
}

function seamlessCrossfade(buffer, fadeSec = 0.025) {
  const n = Math.max(2, Math.floor(buffer.sampleRate * fadeSec));
  for (let c = 0; c < buffer.numberOfChannels; c++) {
    const d = buffer.getChannelData(c);
    const len = d.length;
    if (len <= n * 2) continue;
    for (let i = 0; i < n; i++) {
      const t = i / n;
      const start = d[i];
      const end = d[len - n + i];
      d[i] = end * (1 - t) + start * t;
      d[len - n + i] = end * (1 - t);
    }
  }
  return buffer;
}

export const LOOP_BARS = 16;

/** Render an exact number of bars with no end fade, for a looping audio file. */
export async function renderVinylLoop(vinylId, bars = LOOP_BARS) {
  const feel = VINYL_FEELS[vinylId];
  if (!feel || typeof OfflineAudioContext === "undefined") return null;
  const sr = 44100;
  const bar = barDuration(feel);
  const dur = bar * Math.max(4, bars);
  const ctx = new OfflineAudioContext(2, Math.ceil(sr * dur), sr);
  const noise = makeNoiseBuffer(ctx, 1.5);
  const master = connectMaster(ctx, feel);
  master.gain.gain.setValueAtTime(0.0001, 0);
  master.gain.gain.exponentialRampToValueAtTime(0.85, 0.01);
  master.gain.connect(ctx.destination);
  for (let i = 0; i < bars; i++) {
    scheduleBar(ctx, master.input, noise, feel, i * bar, i, 1);
  }
  const rendered = await ctx.startRendering();
  return seamlessCrossfade(rendered, 0.025);
}

export const DEFAULT_VOLUME = 0.8;

const STORE_VOL = "mycube.record.volume";
const STORE_MUTE = "mycube.record.muted";

export function vinylAudioSources(id) {
  return [
    { src: `/audio/${id}.m4a`, type: "audio/mp4" },
    { src: `/audio/${id}.mp3`, type: "audio/mpeg" },
    { src: `/audio/${id}.ogg`, type: "audio/ogg" },
  ];
}

export function preferredVinylSrc(id) {
  if (typeof document === "undefined") return `/audio/${id}.mp3`;
  const probe = document.createElement("audio");
  const sources = vinylAudioSources(id);
  for (const s of sources) {
    const rank = probe.canPlayType?.(s.type) || "";
    if (rank === "probably" || rank === "maybe") return s.src;
  }
  return sources[0].src;
}

function readVol() {
  try {
    if (typeof localStorage === "undefined") return DEFAULT_VOLUME;
    const raw = localStorage.getItem(STORE_VOL);
    if (raw == null || raw === "") return DEFAULT_VOLUME;
    const n = Number(raw);
    // 0 was accidentally persisted by an older bug; mute is the real off switch.
    if (!Number.isFinite(n) || n <= 0) return DEFAULT_VOLUME;
    return Math.min(1, n);
  } catch {}
  return DEFAULT_VOLUME;
}
function readMute() {
  try {
    if (typeof localStorage === "undefined") return false;
    return localStorage.getItem(STORE_MUTE) === "1";
  } catch { return false; }
}

let live = null;

function setPlaybackSession() {
  try {
    const session = globalThis.navigator?.audioSession;
    if (session && session.type !== "playback") session.type = "playback";
  } catch {}
}

function ensureAudioEl() {
  if (typeof document === "undefined") return null;
  let el = document.getElementById("record-audio");
  if (!el) {
    el = document.createElement("audio");
    el.id = "record-audio";
    el.setAttribute("data-testid", "record-audio");
    el.loop = true;
    el.preload = "auto";
    el.playsInline = true;
    el.setAttribute("playsinline", "");
    el.setAttribute("webkit-playsinline", "");
    el.crossOrigin = "anonymous";
    (document.body || document.documentElement).appendChild(el);
  }
  return el;
}

function attachSources(el, vinylId) {
  if (!el || !vinylId) return;
  const src = preferredVinylSrc(vinylId);
  if (el.dataset.vinyl === vinylId && el.getAttribute("src") === src && !el.error) return;
  el.pause();
  while (el.firstChild) el.removeChild(el.firstChild);
  for (const s of vinylAudioSources(vinylId)) {
    const source = document.createElement("source");
    source.src = s.src;
    source.type = s.type;
    el.appendChild(source);
  }
  el.src = src;
  el.dataset.vinyl = vinylId;
  el.loop = true;
  el.load();
}

function applyElementGain() {
  if (!live?.audio) return;
  live.audio.muted = Boolean(live.muted);
  live.audio.volume = live.muted ? 0 : Math.max(0, Math.min(1, live.volume));
}

function ensureLive() {
  if (live) return live;
  const Ctx = (typeof globalThis !== "undefined" && (globalThis.AudioContext || globalThis.webkitAudioContext))
    || (typeof window !== "undefined" && (window.AudioContext || window.webkitAudioContext))
    || undefined;
  const ctx = Ctx ? new Ctx() : null;
  const audio = ensureAudioEl();
  live = {
    ctx,
    audio,
    playing: null,
    wanted: null,
    volume: readVol(),
    muted: readMute(),
    listening: false,
    primed: false,
  };
  applyElementGain();
  return live;
}

/** Start (or switch to) a vinyl. play() is called in this turn — do not await first. */
export function playRecordVinyl(vinylId) {
  setPlaybackSession();
  const deck = ensureLive();
  if (!deck) return getRecordAudioState();
  deck.listening = true;
  deck.wanted = vinylId || deck.wanted;
  if (deck.ctx && (deck.ctx.state === "suspended" || deck.ctx.state === "interrupted")) {
    try { deck.ctx.resume(); } catch {}
  }
  if (!vinylId || !VINYL_FEELS[vinylId] || !deck.audio) return getRecordAudioState();
  attachSources(deck.audio, vinylId);
  applyElementGain();
  let playResult = null;
  try { playResult = deck.audio.play(); } catch {}
  deck.playing = vinylId;
  if (playResult && typeof playResult.then === "function") {
    playResult.then(() => { deck.primed = true; }).catch(() => {});
  }
  return playResult && typeof playResult.then === "function"
    ? playResult.then(() => getRecordAudioState()).catch(() => getRecordAudioState())
    : getRecordAudioState();
}

function resumeContext(deck) {
  if (deck?.ctx && (deck.ctx.state === "suspended" || deck.ctx.state === "interrupted")) {
    try { deck.ctx.resume(); } catch {}
  }
}

/** Prime the media channel on a gesture without opting the guest into listening. */
export function primeRecordAudio() {
  setPlaybackSession();
  const deck = ensureLive();
  if (!deck) return Promise.resolve(false);
  resumeContext(deck);
  const el = deck.audio;
  if (el && deck.listening && deck.wanted && VINYL_FEELS[deck.wanted]) {
    applyElementGain();
    if (el.paused) {
      try { el.play(); } catch {}
    }
    return Promise.resolve(true);
  }
  if (el && !deck.primed && !deck.wanted) {
    if (!el.dataset.vinyl) attachSources(el, "neon-drift");
    const wasMuted = el.muted;
    el.muted = true;
    try {
      const p = el.play();
      if (p && typeof p.then === "function") {
        p.then(() => {
          deck.primed = true;
          // Don't clobber a vinyl that started after this prime began.
          if (!deck.wanted && !deck.listening) {
            try { el.pause(); el.currentTime = 0; } catch {}
          }
          el.muted = deck.muted || wasMuted;
          applyElementGain();
        }).catch(() => { el.muted = wasMuted; });
      }
    } catch { el.muted = wasMuted; }
  }
  return Promise.resolve(Boolean(deck.ctx ? deck.ctx.state !== "suspended" : true));
}

export function unlockRecordAudio() {
  // resume() and play() must run in this turn so iOS treats them as a gesture.
  setPlaybackSession();
  const deck = ensureLive();
  if (!deck) return Promise.resolve(false);
  deck.listening = true;
  resumeContext(deck);
  const el = deck.audio;
  if (el) {
    applyElementGain();
    if (deck.wanted && VINYL_FEELS[deck.wanted]) {
      attachSources(el, deck.wanted);
      try { el.play(); } catch {}
      deck.playing = deck.wanted;
    } else {
      primeRecordAudio();
    }
  }
  const running = !deck.ctx || deck.ctx.state === "running" || deck.ctx.state === "interrupted";
  return Promise.resolve(Boolean(deck.listening && running));
}

export function recoverRecordAudio() {
  if (typeof document !== "undefined" && document.visibilityState && document.visibilityState !== "visible") return;
  if (!live?.listening) return;
  setPlaybackSession();
  if (live.ctx && (live.ctx.state === "suspended" || live.ctx.state === "interrupted")) {
    try { live.ctx.resume(); } catch {}
  }
  if (live.wanted && live.audio && live.audio.paused && !live.muted) {
    try { live.audio.play(); } catch {}
  }
}

export function installRecordAudioGestures() {
  if (typeof document === "undefined" || installRecordAudioGestures.installed) return;
  installRecordAudioGestures.installed = true;
  const kick = () => { primeRecordAudio(); };
  for (const ev of ["pointerdown", "touchend", "click", "keydown"]) {
    document.addEventListener(ev, kick, { capture: true, passive: true });
  }
  document.addEventListener("visibilitychange", recoverRecordAudio);
  window.addEventListener("pageshow", recoverRecordAudio);
  window.addEventListener("focus", recoverRecordAudio);
}

export function preloadRecordAudio() {
  if (typeof document === "undefined") return;
  for (const id of Object.keys(VINYL_FEELS)) {
    const link = document.createElement("link");
    link.rel = "preload";
    link.as = "audio";
    link.href = preferredVinylSrc(id);
    document.head.appendChild(link);
  }
}

export function isRecordListening() {
  return Boolean(live?.listening);
}

function elementSnapshot() {
  const el = live?.audio;
  if (!el) return { present: false, paused: true, muted: false, volume: 0, currentTime: 0, ended: false };
  return {
    present: true,
    paused: Boolean(el.paused),
    muted: Boolean(el.muted),
    volume: Number(el.volume),
    currentTime: Number(el.currentTime) || 0,
    ended: Boolean(el.ended),
    src: el.currentSrc || el.src || el.getAttribute("src") || "",
    vinyl: el.dataset.vinyl || null,
    loop: Boolean(el.loop),
    readyState: el.readyState,
  };
}

export function getRecordAudioState() {
  return {
    listening: isRecordListening(),
    playing: live?.playing || live?.wanted || null,
    vinyl: live?.playing || live?.wanted || null,
    volume: live ? live.volume : readVol(),
    muted: live ? live.muted : readMute(),
    ctx: live?.ctx?.state || "none",
    element: elementSnapshot(),
  };
}

export function setRecordVolume(v) {
  const raw = Number(v);
  const n = Number.isFinite(raw) ? Math.min(1, Math.max(0, raw)) : (live?.volume ?? readVol());
  try { if (typeof localStorage !== "undefined") localStorage.setItem(STORE_VOL, String(n)); } catch {}
  if (live) {
    live.volume = n;
    if (n <= 0.001) live.muted = false;
    applyElementGain();
  }
  return n;
}

export function setRecordMuted(on) {
  const muted = Boolean(on);
  try { if (typeof localStorage !== "undefined") localStorage.setItem(STORE_MUTE, muted ? "1" : "0"); } catch {}
  if (live) {
    live.muted = muted;
    applyElementGain();
    if (!muted && live.wanted && live.audio?.paused) {
      try { live.audio.play(); } catch {}
    }
  }
  return muted;
}

export function syncRecordAudio(rec, { userGesture = false } = {}) {
  const on = Boolean(rec?.on && rec?.vinyl && VINYL_FEELS[rec.vinyl]);
  if (userGesture) unlockRecordAudio();
  const deck = live;
  if (!deck || !deck.listening) return getRecordAudioState();
  if (!on) {
    deck.playing = null;
    deck.wanted = null;
    if (deck.audio && !deck.audio.paused) {
      try { deck.audio.pause(); } catch {}
    }
    return getRecordAudioState();
  }
  if (userGesture) return playRecordVinyl(rec.vinyl);
  // Already unlocked: keep the same track going, or switch if the room changed vinyls.
  if (deck.playing === rec.vinyl && deck.audio && !deck.audio.paused) return getRecordAudioState();
  return playRecordVinyl(rec.vinyl);
}

export function stopRecordAudio() {
  if (!live) return;
  live.playing = null;
  live.wanted = null;
  if (live.audio && !live.audio.paused) {
    try { live.audio.pause(); } catch {}
  }
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
