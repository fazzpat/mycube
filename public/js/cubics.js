/** Cubics — a square-only falling-block game. */
export const COLS = 8;
export const ROWS = 12;
export const JOKES = [
  "A square is just a cube that gave up.",
  "You cleared a row. Try not to let it go to your head.",
  "The blocks have been notified. They are taking it well.",
  "Congratulations. You have made another line. The line is unimpressed.",
  "Geometry remains undefeated.",
  "That was a square. It always is.",
  "The high score is also a number. We checked.",
  "Game over. The blocks, however, are fine.",
  "You may go again. The squares are patient.",
  "No bonus points for enthusiasm.",
];

const COLORS = ["#ef476f", "#f4c15d", "#3ecf8e", "#4d7cff", "#c77dff", "#ff7a59"];

export function jokeAt(n) {
  return JOKES[Math.abs(n) % JOKES.length];
}

export function emptyBoard() {
  return Array.from({ length: ROWS }, () => Array(COLS).fill(0));
}

export function createGame() {
  return {
    board: emptyBoard(),
    piece: null,
    score: 0,
    lines: 0,
    over: false,
    joke: jokeAt(0),
    tickMs: 0,
    fallEvery: 700,
    nextSize: 2,
  };
}

function fits(board, piece) {
  if (!piece) return false;
  for (let y = 0; y < piece.size; y++) {
    for (let x = 0; x < piece.size; x++) {
      const gx = piece.x + x;
      const gy = piece.y + y;
      if (gx < 0 || gx >= COLS || gy >= ROWS) return false;
      if (gy >= 0 && board[gy][gx]) return false;
    }
  }
  return true;
}

function spawn(state) {
  const size = state.nextSize || (Math.random() < 0.15 ? 1 : Math.random() < 0.12 ? 3 : 2);
  state.nextSize = Math.random() < 0.15 ? 1 : Math.random() < 0.12 ? 3 : 2;
  if (size > COLS) return;
  const color = 1 + Math.floor(Math.random() * COLORS.length);
  const piece = { x: Math.floor((COLS - size) / 2), y: -size + 1, size, color };
  if (!fits(state.board, piece)) {
    state.over = true;
    state.piece = null;
    state.joke = jokeAt(7);
    return;
  }
  state.piece = piece;
}

function lock(state) {
  const p = state.piece;
  if (!p) return;
  for (let y = 0; y < p.size; y++) {
    for (let x = 0; x < p.size; x++) {
      const gy = p.y + y;
      const gx = p.x + x;
      if (gy >= 0 && gy < ROWS && gx >= 0 && gx < COLS) state.board[gy][gx] = p.color;
    }
  }
  state.piece = null;
  let cleared = 0;
  for (let y = ROWS - 1; y >= 0; y--) {
    if (state.board[y].every((c) => c)) {
      state.board.splice(y, 1);
      state.board.unshift(Array(COLS).fill(0));
      cleared += 1;
      y += 1;
    }
  }
  if (cleared) {
    state.lines += cleared;
    state.score += cleared * 80 + (cleared > 1 ? 40 : 0);
    state.joke = jokeAt(state.lines);
    state.fallEvery = Math.max(280, 700 - state.lines * 18);
  } else {
    state.score += 4;
  }
  spawn(state);
}

export function startGame() {
  const state = createGame();
  spawn(state);
  state.joke = jokeAt(1);
  return state;
}

export function move(state, dx) {
  if (!state || state.over || !state.piece) return state;
  const next = { ...state.piece, x: state.piece.x + dx };
  if (fits(state.board, next)) state.piece = next;
  return state;
}

export function softDrop(state) {
  if (!state || state.over || !state.piece) return state;
  const next = { ...state.piece, y: state.piece.y + 1 };
  if (fits(state.board, next)) {
    state.piece = next;
    state.score += 1;
  } else lock(state);
  return state;
}

export function hardDrop(state) {
  if (!state || state.over || !state.piece) return state;
  while (state.piece && fits(state.board, { ...state.piece, y: state.piece.y + 1 })) {
    state.piece.y += 1;
    state.score += 2;
  }
  lock(state);
  return state;
}

export function tick(state, dt) {
  if (!state || state.over) return state;
  state.tickMs += dt;
  if (state.tickMs >= state.fallEvery) {
    state.tickMs = 0;
    softDrop(state);
  }
  return state;
}

export function snapshot(state) {
  if (!state) return null;
  return {
    board: state.board.map((r) => r.slice()),
    piece: state.piece ? { ...state.piece } : null,
    score: state.score,
    lines: state.lines,
    over: state.over,
    joke: state.joke,
    nextSize: state.nextSize,
  };
}

export function drawCubics(ctx, w, h, state, time = 0, scores = []) {
  ctx.fillStyle = "#141018";
  ctx.fillRect(0, 0, w, h);
  const pad = 8;
  const boardH = h - 36;
  const cell = Math.min((w - pad * 2) / COLS, (boardH - pad * 2) / ROWS);
  const ox = (w - cell * COLS) / 2;
  const oy = 22;

  ctx.fillStyle = "#f4c15d";
  ctx.font = `bold ${Math.round(h * 0.055)}px Nunito, sans-serif`;
  ctx.textAlign = "center";
  ctx.fillText("CUBICS", w / 2, 16);

  ctx.fillStyle = "#0b0a10";
  ctx.fillRect(ox - 2, oy - 2, cell * COLS + 4, cell * ROWS + 4);

  const paintCell = (x, y, color) => {
    if (y < 0) return;
    ctx.fillStyle = COLORS[color - 1] || "#888";
    ctx.fillRect(ox + x * cell + 1, oy + y * cell + 1, cell - 2, cell - 2);
    ctx.fillStyle = "rgba(255,255,255,0.22)";
    ctx.fillRect(ox + x * cell + 1, oy + y * cell + 1, (cell - 2) / 2, (cell - 2) / 2);
  };

  if (state?.board) {
    for (let y = 0; y < ROWS; y++) {
      for (let x = 0; x < COLS; x++) {
        const v = state.board[y][x];
        if (v) paintCell(x, y, v);
        else {
          ctx.fillStyle = "#1a1622";
          ctx.fillRect(ox + x * cell + 1, oy + y * cell + 1, cell - 2, cell - 2);
        }
      }
    }
  }
  if (state?.piece) {
    const p = state.piece;
    for (let y = 0; y < p.size; y++) {
      for (let x = 0; x < p.size; x++) paintCell(p.x + x, p.y + y, p.color);
    }
  }

  ctx.fillStyle = "#fff8f2";
  ctx.font = `${Math.round(h * 0.04)}px Nunito, sans-serif`;
  ctx.textAlign = "left";
  const score = state?.score ?? 0;
  ctx.fillText("SCORE " + score, 6, h - 8);
  ctx.textAlign = "right";
  const joke = state?.joke || (state ? "" : jokeAt(Math.floor(time / 4000)));
  ctx.font = `${Math.round(h * 0.032)}px Nunito, sans-serif`;
  ctx.fillStyle = "#c9b8a6";
  const j = joke.length > 36 ? joke.slice(0, 34) + "…" : joke;
  ctx.fillText(j, w - 6, h - 8);

  if (!state) {
    ctx.fillStyle = "rgba(20,10,30,0.45)";
    ctx.fillRect(0, h * 0.38, w, h * 0.2);
    ctx.fillStyle = "#fff8f2";
    ctx.font = `bold ${Math.round(h * 0.07)}px Nunito, sans-serif`;
    ctx.textAlign = "center";
    ctx.fillText("INSERT COIN", w / 2, h * 0.5);
    ctx.font = `${Math.round(h * 0.04)}px Nunito, sans-serif`;
    ctx.fillText("squares only. no heroes.", w / 2, h * 0.57);
  }
  if (state?.over) {
    ctx.fillStyle = "rgba(12,8,18,0.72)";
    ctx.fillRect(0, h * 0.3, w, h * 0.32);
    ctx.fillStyle = "#f4c15d";
    ctx.font = `bold ${Math.round(h * 0.08)}px Nunito, sans-serif`;
    ctx.textAlign = "center";
    ctx.fillText("GAME OVER", w / 2, h * 0.44);
    ctx.fillStyle = "#fff8f2";
    ctx.font = `${Math.round(h * 0.045)}px Nunito, sans-serif`;
    ctx.fillText(String(state.joke || jokeAt(7)), w / 2, h * 0.54);
  }
}
