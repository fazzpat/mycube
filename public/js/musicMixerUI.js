/* Phone-friendly 16-step mixer UI opened from the Music Mixer furniture. */
import {
  MIXER_STEPS, MIXER_TITLE_MAX, MIXER_BPM_MIN, MIXER_BPM_MAX, MIXER_DEFAULT_BPM,
  DRUM_TRACKS, MELODY_PRESETS, MELODY_NOTES, MIX_LABEL_COLORS,
  emptyPattern, clonePattern, sanitizeTitle, demoPattern, validateMix,
} from "./musicMixer.js";
import { playMixPreview, stopMixAudio } from "./musicMixerAudio.js";

let hooks = {};
let openId = null;
let pattern = emptyPattern();
let undo = [];
let playing = false;
let playhead = -1;

const DRUM_LABELS = { kick: "Kick", snare: "Snare", hat: "Hat", clap: "Clap" };

function el(html) {
  const t = document.createElement("template");
  t.innerHTML = html.trim();
  return t.content.firstElementChild;
}

function ensureCss() {
  if (typeof document === "undefined") return;
  if (document.querySelector('link[href="/css/musicMixer.css"]')) return;
  const link = document.createElement("link");
  link.rel = "stylesheet";
  link.href = "/css/musicMixer.css";
  document.head.appendChild(link);
}

function pushUndo() {
  undo.push(clonePattern(pattern));
  if (undo.length > 30) undo.shift();
}

function renderGrid(pane) {
  if (!pane) return;
  pane.querySelectorAll("[data-drum-cell]").forEach((b) => {
    const track = b.dataset.track;
    const step = Number(b.dataset.step);
    const on = Boolean(pattern.drums?.[track]?.[step]);
    b.classList.toggle("is-on", on);
    b.setAttribute("aria-pressed", on ? "true" : "false");
  });
  pane.querySelectorAll("[data-melody-cell]").forEach((b) => {
    const pitch = Number(b.dataset.pitch);
    const step = Number(b.dataset.step);
    const on = pattern.melody?.[step] === pitch;
    b.classList.toggle("is-on", on);
    b.setAttribute("aria-pressed", on ? "true" : "false");
  });
  pane.querySelectorAll("[data-playhead]").forEach((col) => {
    const step = Number(col.dataset.playhead);
    col.classList.toggle("is-now", playing && step === playhead);
  });
  const bpm = pane.querySelector("[data-testid=mixer-bpm]");
  if (bpm && document.activeElement !== bpm) bpm.value = String(pattern.bpm);
  const bpmVal = pane.querySelector("[data-testid=mixer-bpm-value]");
  if (bpmVal) bpmVal.textContent = String(pattern.bpm);
  pane.querySelectorAll("[data-preset]").forEach((b) => {
    b.classList.toggle("is-on", b.dataset.preset === pattern.preset);
  });
  pane.querySelectorAll("[data-color]").forEach((b) => {
    b.classList.toggle("is-on", b.dataset.color === pattern.color);
  });
  for (const t of [...DRUM_TRACKS, "melody"]) {
    const sl = pane.querySelector(`[data-testid=mixer-vol-${t}]`);
    if (sl && document.activeElement !== sl) sl.value = String(Math.round((pattern.vols?.[t] ?? 0.8) * 100));
  }
  const playBtn = pane.querySelector("[data-testid=mixer-play]");
  if (playBtn) {
    playBtn.textContent = playing ? "Stop" : "Play";
    playBtn.setAttribute("aria-pressed", playing ? "true" : "false");
    playBtn.classList.toggle("is-on", playing);
  }
}

function paint() {
  renderGrid(document.getElementById("music-mixer"));
}

function toggleDrum(track, step) {
  if (!DRUM_TRACKS.includes(track)) return;
  pushUndo();
  const row = pattern.drums[track];
  row[step] = row[step] ? 0 : 1;
  paint();
}

function toggleMelody(pitch, step) {
  pushUndo();
  pattern.melody[step] = pattern.melody[step] === pitch ? null : pitch;
  paint();
}

function setPlaying(on) {
  playing = Boolean(on);
  if (!playing) {
    playhead = -1;
    stopMixAudio();
  } else {
    playMixPreview(pattern, {
      onStep(step) {
        playhead = step;
        const pane = document.getElementById("music-mixer");
        if (!pane || pane.classList.contains("hidden")) return;
        pane.querySelectorAll("[data-playhead]").forEach((col) => {
          col.classList.toggle("is-now", Number(col.dataset.playhead) === step);
        });
      },
    });
  }
  paint();
}

function stepsRow(kind, key) {
  const cells = [];
  for (let i = 0; i < MIXER_STEPS; i++) {
    const beat = i % 4 === 0;
    if (kind === "drum") {
      cells.push(`<button type="button" class="mixer-cell${beat ? " is-beat" : ""}" data-drum-cell data-track="${key}" data-step="${i}" data-testid="mixer-${key}-${i}" aria-pressed="false"></button>`);
    } else {
      cells.push(`<button type="button" class="mixer-cell mixer-pitch${beat ? " is-beat" : ""}" data-melody-cell data-pitch="${key}" data-step="${i}" data-testid="mixer-mel-${key}-${i}" aria-pressed="false"></button>`);
    }
  }
  return cells.join("");
}

export function mountMixerUI(h = {}) {
  hooks = h;
  if (typeof document === "undefined") return;
  if (document.getElementById("music-mixer")) return;
  ensureCss();
  const host = document.getElementById("view-room") || document.body;
  const drumRows = DRUM_TRACKS.map((t) =>
    `<div class="mixer-row" data-testid="mixer-row-${t}">
      <span class="mixer-row-label">${DRUM_LABELS[t]}</span>
      <div class="mixer-steps">${stepsRow("drum", t)}</div>
    </div>`
  ).join("");
  const pitchRows = [...MELODY_NOTES].map((n, i) => {
    const pitch = MELODY_NOTES.length - 1 - i;
    const note = MELODY_NOTES[pitch];
    return `<div class="mixer-row mixer-row-pitch" data-testid="mixer-pitch-row-${pitch}">
      <span class="mixer-row-label">${note.name}</span>
      <div class="mixer-steps">${stepsRow("melody", pitch)}</div>
    </div>`;
  }).join("");
  const presets = MELODY_PRESETS.map((p) =>
    `<button type="button" class="mixer-chip" data-preset="${p}" data-testid="mixer-preset-${p}">${p[0].toUpperCase() + p.slice(1)}</button>`
  ).join("");
  const colors = MIX_LABEL_COLORS.map((c, i) =>
    `<button type="button" class="mixer-color" data-color="${c}" data-testid="mixer-color-${i}" style="background:${c}" aria-label="Label ${c}"></button>`
  ).join("");
  const vols = [...DRUM_TRACKS, "melody"].map((t) =>
    `<label class="mixer-vol"><span>${t === "melody" ? "Tune" : DRUM_LABELS[t]}</span>
      <input type="range" min="0" max="100" value="80" data-testid="mixer-vol-${t}" data-vol="${t}" aria-label="${t} volume" />
    </label>`
  ).join("");
  const heads = Array.from({ length: MIXER_STEPS }, (_, i) =>
    `<span class="mixer-head" data-playhead="${i}"></span>`
  ).join("");

  const pane = el(`<div id="music-mixer" class="music-mixer hidden" data-testid="music-mixer" role="dialog" aria-label="Mix a beat">
    <div class="mixer-title">MUSIC MIXER</div>
    <div class="mixer-transport">
      <button type="button" class="mixer-btn" data-testid="mixer-play" aria-pressed="false">Play</button>
      <button type="button" class="mixer-btn" data-testid="mixer-stop">Stop</button>
      <button type="button" class="mixer-btn" data-testid="mixer-undo">Undo</button>
      <button type="button" class="mixer-btn" data-testid="mixer-clear">Clear</button>
      <label class="mixer-bpm-wrap">
        <span>Tempo</span>
        <input type="range" min="${MIXER_BPM_MIN}" max="${MIXER_BPM_MAX}" value="${MIXER_DEFAULT_BPM}" data-testid="mixer-bpm" aria-label="Tempo" />
        <strong data-testid="mixer-bpm-value">${MIXER_DEFAULT_BPM}</strong>
      </label>
    </div>
    <div class="mixer-heads" aria-hidden="true">${heads}</div>
    <div class="mixer-drums" data-testid="mixer-drums">${drumRows}</div>
    <div class="mixer-melody-head">
      <span>Melody</span>
      <div class="mixer-presets" data-testid="mixer-presets">${presets}</div>
    </div>
    <div class="mixer-melody" data-testid="mixer-melody">${pitchRows}</div>
    <div class="mixer-vols" data-testid="mixer-vols">${vols}</div>
    <div class="mixer-colors" data-testid="mixer-colors">
      <span>Label</span>${colors}
    </div>
    <div class="mixer-title-row">
      <label for="mixer-title">Title</label>
      <input id="mixer-title" data-testid="mixer-title" type="text" maxlength="${MIXER_TITLE_MAX}" placeholder="Untitled Mix" />
    </div>
    <div class="mixer-actions">
      <button type="button" class="mixer-btn secondary" data-testid="mixer-cancel">Cancel</button>
      <button type="button" class="mixer-btn primary" data-testid="mixer-save">Save record</button>
    </div>
  </div>`);
  host.appendChild(pane);

  pane.addEventListener("pointerdown", (e) => {
    const drum = e.target.closest("[data-drum-cell]");
    if (drum) {
      e.preventDefault();
      toggleDrum(drum.dataset.track, Number(drum.dataset.step));
      return;
    }
    const mel = e.target.closest("[data-melody-cell]");
    if (mel) {
      e.preventDefault();
      toggleMelody(Number(mel.dataset.pitch), Number(mel.dataset.step));
    }
  });
  pane.querySelector("[data-testid=mixer-play]")?.addEventListener("click", () => setPlaying(!playing));
  pane.querySelector("[data-testid=mixer-stop]")?.addEventListener("click", () => setPlaying(false));
  pane.querySelector("[data-testid=mixer-undo]")?.addEventListener("click", () => {
    const prev = undo.pop();
    if (!prev) return;
    pattern = clonePattern(prev);
    if (playing) setPlaying(true);
    else paint();
  });
  pane.querySelector("[data-testid=mixer-clear]")?.addEventListener("click", () => {
    pushUndo();
    const keep = { title: pattern.title, color: pattern.color, bpm: pattern.bpm, preset: pattern.preset, vols: pattern.vols };
    pattern = clonePattern({ ...emptyPattern(), ...keep, drums: emptyPattern().drums, melody: emptyPattern().melody });
    if (playing) setPlaying(true);
    else paint();
  });
  pane.querySelector("[data-testid=mixer-bpm]")?.addEventListener("input", (e) => {
    const n = Math.round(Number(e.target.value));
    if (!Number.isFinite(n)) return;
    pattern.bpm = Math.max(MIXER_BPM_MIN, Math.min(MIXER_BPM_MAX, n));
    if (playing) setPlaying(true);
    else paint();
  });
  pane.querySelectorAll("[data-preset]").forEach((b) => {
    b.addEventListener("click", () => {
      pattern.preset = b.dataset.preset;
      if (playing) setPlaying(true);
      else paint();
    });
  });
  pane.querySelectorAll("[data-color]").forEach((b) => {
    b.addEventListener("click", () => {
      pattern.color = b.dataset.color;
      paint();
    });
  });
  pane.querySelectorAll("[data-vol]").forEach((sl) => {
    sl.addEventListener("input", (e) => {
      const t = sl.dataset.vol;
      pattern.vols[t] = Math.max(0, Math.min(1, Number(e.target.value) / 100));
      if (playing) setPlaying(true);
    });
  });
  pane.querySelector("[data-testid=mixer-cancel]")?.addEventListener("click", () => closeMixerUI());
  pane.querySelector("[data-testid=mixer-save]")?.addEventListener("click", () => {
    const titleEl = pane.querySelector("[data-testid=mixer-title]");
    pattern.title = sanitizeTitle(titleEl?.value);
    const check = validateMix(pattern);
    if (!check.ok) {
      hooks.onError?.(check.error);
      return;
    }
    const wasPlaying = playing;
    setPlaying(false);
    hooks.onSave?.({
      id: openId,
      title: check.mix.title,
      data: check.mix.data,
    });
    if (wasPlaying) { /* leave stopped after save; room may start the vinyl later */ }
  });
}

export function openMixerUI(id, seed = {}) {
  if (!document.getElementById("music-mixer")) mountMixerUI(hooks);
  openId = id;
  const src = seed?.data || seed?.pattern || seed;
  pattern = clonePattern(src && (src.drums || src.melody) ? src : emptyPattern());
  if (seed?.title) pattern.title = sanitizeTitle(seed.title);
  if (seed?.color) pattern.color = seed.color;
  undo = [];
  playing = false;
  playhead = -1;
  const pane = document.getElementById("music-mixer");
  if (!pane) return false;
  pane.dataset.mixerId = id || "";
  const title = pane.querySelector("[data-testid=mixer-title]");
  if (title) title.value = pattern.title === "Untitled Mix" ? "" : pattern.title;
  pane.classList.remove("hidden");
  paint();
  return true;
}

export function closeMixerUI() {
  setPlaying(false);
  openId = null;
  document.getElementById("music-mixer")?.classList.add("hidden");
  hooks.onClose?.();
}

export function isMixerOpen() {
  const pane = document.getElementById("music-mixer");
  return Boolean(openId && pane && !pane.classList.contains("hidden"));
}

export function mixerOpenId() {
  return openId;
}

export function mixerSnapshot() {
  return clonePattern(pattern);
}

export function mixerLoadDemo(kind = "house") {
  pushUndo();
  pattern = demoPattern(kind);
  const pane = document.getElementById("music-mixer");
  const title = pane?.querySelector("[data-testid=mixer-title]");
  if (title) title.value = pattern.title;
  if (playing) setPlaying(true);
  else paint();
  return clonePattern(pattern);
}

if (typeof window !== "undefined") {
  window.__mixerLoadDemo = mixerLoadDemo;
  window.__mixerSnapshot = mixerSnapshot;
}

export default { mountMixerUI, openMixerUI, closeMixerUI, isMixerOpen, mixerLoadDemo };
