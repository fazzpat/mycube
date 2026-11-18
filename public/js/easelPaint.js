import {
  EASEL_GRID, EASEL_PALETTE, EASEL_CANVAS_BG, EASEL_TITLE_MAX,
  emptyCells, cloneCells, canonColor, sanitizeTitle, encodeArtwork, decodeArtwork,
  floodFill, paintCells,
} from "./easel.js";

let hooks = {};
let openId = null;
let cells = emptyCells();
let tool = "pencil";
let color = EASEL_PALETTE[5];
let undo = [];
let drawing = false;

function el(html) {
  const t = document.createElement("template");
  t.innerHTML = html.trim();
  return t.content.firstElementChild;
}

function ensureCss() {
  if (document.querySelector('link[href="/css/easel.css"]')) return;
  const link = document.createElement("link");
  link.rel = "stylesheet";
  link.href = "/css/easel.css";
  document.head.appendChild(link);
}

export function mountEaselPaint(h = {}) {
  hooks = h;
  if (typeof document === "undefined") return;
  if (document.getElementById("easel-paint")) return;
  ensureCss();
  const host = document.getElementById("view-room") || document.body;
  const swatches = EASEL_PALETTE.map((c, i) =>
    `<button type="button" class="easel-swatch${c === color ? " is-on" : ""}" data-testid="easel-color-${i}" data-color="${c}" style="background:${c}" aria-label="Color ${c}"></button>`
  ).join("");
  const pane = el(`<div id="easel-paint" class="easel-paint hidden" data-testid="easel-paint" role="dialog" aria-label="Paint on the easel">
    <div class="easel-paint-title">PAINT</div>
    <div class="easel-canvas-wrap">
      <canvas id="easel-grid" data-testid="easel-grid" width="${EASEL_GRID}" height="${EASEL_GRID}"></canvas>
    </div>
    <div class="easel-tools" role="toolbar" aria-label="Tools">
      <button type="button" class="easel-tool is-on" data-testid="easel-tool-pencil" data-tool="pencil">Pencil</button>
      <button type="button" class="easel-tool" data-testid="easel-tool-eraser" data-tool="eraser">Eraser</button>
      <button type="button" class="easel-tool" data-testid="easel-tool-fill" data-tool="fill">Fill</button>
      <button type="button" class="easel-tool" data-testid="easel-undo">Undo</button>
      <button type="button" class="easel-tool" data-testid="easel-clear">Clear</button>
    </div>
    <div class="easel-palette" data-testid="easel-palette">${swatches}
      <input type="color" class="easel-custom" data-testid="easel-custom-color" value="${color}" aria-label="Custom color" />
    </div>
    <div class="easel-title-row">
      <label for="easel-title">Title</label>
      <input id="easel-title" data-testid="easel-title" type="text" maxlength="${EASEL_TITLE_MAX}" placeholder="Untitled" />
    </div>
    <div class="easel-actions">
      <button type="button" class="easel-btn secondary" data-testid="easel-cancel">Cancel</button>
      <button type="button" class="easel-btn primary" data-testid="easel-save">Save</button>
    </div>
  </div>`);
  host.appendChild(pane);
  const canvas = pane.querySelector("[data-testid='easel-grid']");
  const paintAt = (evt) => {
    const rect = canvas.getBoundingClientRect();
    const src = evt.touches ? evt.touches[0] : evt;
    const x = Math.max(0, Math.min(EASEL_GRID - 1, Math.floor((src.clientX - rect.left) / rect.width * EASEL_GRID)));
    const y = Math.max(0, Math.min(EASEL_GRID - 1, Math.floor((src.clientY - rect.top) / rect.height * EASEL_GRID)));
    applyTool(x, y);
  };
  canvas.addEventListener("pointerdown", (e) => {
    e.preventDefault();
    canvas.setPointerCapture?.(e.pointerId);
    pushUndo();
    drawing = true;
    paintAt(e);
  });
  canvas.addEventListener("pointermove", (e) => {
    if (!drawing) return;
    e.preventDefault();
    paintAt(e);
  });
  const end = () => { drawing = false; };
  canvas.addEventListener("pointerup", end);
  canvas.addEventListener("pointercancel", end);
  canvas.addEventListener("pointerleave", end);

  pane.querySelectorAll("[data-tool]").forEach((b) => {
    b.addEventListener("click", () => setTool(b.dataset.tool));
  });
  pane.querySelector("[data-testid='easel-undo']").addEventListener("click", undoOnce);
  pane.querySelector("[data-testid='easel-clear']").addEventListener("click", () => {
    pushUndo();
    cells = emptyCells();
    renderGrid();
  });
  pane.querySelectorAll("[data-color]").forEach((b) => {
    b.addEventListener("click", () => setColor(b.dataset.color));
  });
  pane.querySelector("[data-testid='easel-custom-color']").addEventListener("input", (e) => {
    setColor(e.target.value);
  });
  pane.querySelector("[data-testid='easel-cancel']").addEventListener("click", closeEaselPaint);
  pane.querySelector("[data-testid='easel-save']").addEventListener("click", () => {
    const title = pane.querySelector("[data-testid='easel-title']").value;
    hooks.onSave?.({
      id: openId,
      title: sanitizeTitle(title),
      data: encodeArtwork({ title, cells, w: EASEL_GRID, h: EASEL_GRID }),
    });
  });
}

function setTool(next) {
  tool = next;
  document.querySelectorAll("#easel-paint [data-tool]").forEach((b) => {
    b.classList.toggle("is-on", b.dataset.tool === tool);
  });
}

function setColor(next) {
  const c = canonColor(next) || EASEL_CANVAS_BG;
  color = c;
  const pane = document.getElementById("easel-paint");
  pane?.querySelectorAll("[data-color]").forEach((b) => b.classList.toggle("is-on", b.dataset.color === c));
  const custom = pane?.querySelector("[data-testid='easel-custom-color']");
  if (custom) custom.value = c;
}

function pushUndo() {
  undo.push(cloneCells(cells));
  if (undo.length > 30) undo.shift();
}

function undoOnce() {
  if (!undo.length) return;
  cells = undo.pop();
  renderGrid();
}

function applyTool(x, y) {
  const i = y * EASEL_GRID + x;
  if (tool === "fill") {
    cells = floodFill(cells, EASEL_GRID, EASEL_GRID, x, y, color);
    drawing = false;
    renderGrid();
    return;
  }
  const next = tool === "eraser" ? EASEL_CANVAS_BG : color;
  if (cells[i] === next) return;
  cells[i] = next;
  renderGrid();
}

function renderGrid() {
  const canvas = document.getElementById("easel-grid");
  if (!canvas) return;
  const ctx = canvas.getContext("2d");
  ctx.imageSmoothingEnabled = false;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  paintCells(ctx, cells, EASEL_GRID, EASEL_GRID, 0, 0, 1);
}

export function openEaselPaint(id, seed = {}) {
  mountEaselPaint(hooks);
  openId = id;
  const decoded = seed.data ? decodeArtwork(seed.data) : null;
  cells = decoded?.cells ? cloneCells(decoded.cells) : (Array.isArray(seed.cells) ? cloneCells(seed.cells) : emptyCells());
  undo = [];
  tool = "pencil";
  color = EASEL_PALETTE[5];
  const pane = document.getElementById("easel-paint");
  const title = pane.querySelector("[data-testid='easel-title']");
  if (title) title.value = seed.title && seed.title !== "Untitled" ? seed.title : "";
  setTool("pencil");
  setColor(color);
  renderGrid();
  pane.classList.remove("hidden");
}

export function closeEaselPaint() {
  document.getElementById("easel-paint")?.classList.add("hidden");
  openId = null;
  drawing = false;
}

export function isEaselPaintOpen() {
  const pane = document.getElementById("easel-paint");
  return Boolean(pane && !pane.classList.contains("hidden"));
}

export function easelPaintId() {
  return openId;
}

export function easelPaintSnapshot() {
  return { id: openId, cells: cloneCells(cells), title: document.getElementById("easel-title")?.value || "", tool, color };
}

/** Used by e2e / art captures to stamp a small recognizable drawing. */
export function easelPaintDemo(kind = "house") {
  pushUndo();
  cells = emptyCells();
  const p = (x, y, c) => { cells[y * EASEL_GRID + x] = c; };
  const red = "#c43a3a", navy = "#3d5aa0", gold = "#f4c15d", green = "#19c37d", ink = "#1a1410";
  if (kind === "house") {
    for (let x = 3; x <= 12; x++) for (let y = 8; y <= 13; y++) p(x, y, navy);
    for (let y = 4; y <= 8; y++) {
      const span = 8 - (8 - y);
      for (let x = 8 - span; x <= 8 + span; x++) if (x >= 2 && x <= 13) p(x, y, red);
    }
    for (let y = 10; y <= 13; y++) for (let x = 7; x <= 9; x++) p(x, y, "#8b5a2b");
    p(9, 11, gold); p(5, 10, gold); p(5, 11, gold);
    for (let x = 1; x <= 14; x++) p(x, 14, green);
  } else {
    for (let i = 0; i < 16; i++) { p(i, i, red); p(15 - i, i, navy); }
    p(4, 4, ink); p(11, 4, ink); p(5, 11, ink); p(6, 12, ink); p(7, 12, ink); p(8, 12, ink); p(9, 12, ink); p(10, 11, ink);
  }
  renderGrid();
}

if (typeof window !== "undefined") {
  window.__easelPaintDemo = easelPaintDemo;
  window.__easelPaintSnapshot = easelPaintSnapshot;
}

export default { mountEaselPaint, openEaselPaint, closeEaselPaint, isEaselPaintOpen, easelPaintId, easelPaintSnapshot, easelPaintDemo };
