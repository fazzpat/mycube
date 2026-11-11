import { Chess } from "/vendor/chess.js";

/* Standing 16x24 MyCoke-style pixel chess pieces. Always drawn upright;
   the board itself is flipped for Black. */
const PW = 16;
const PH = 24;

const PALS = {
  w: {
    k: [42, 28, 22, 255],
    b: [255, 252, 244, 255],
    s: [196, 168, 120, 255],
    h: [255, 255, 255, 255],
    a: [214, 168, 32, 255],
    d: [110, 74, 16, 255],
    e: [250, 250, 252, 255],
    p: [28, 20, 22, 255],
  },
  b: {
    k: [14, 10, 12, 255],
    b: [52, 42, 62, 255],
    s: [28, 22, 34, 255],
    h: [96, 84, 112, 255],
    a: [192, 196, 208, 255],
    d: [18, 14, 20, 255],
    e: [250, 250, 252, 255],
    p: [20, 14, 16, 255],
  },
};

/* Each key is a piece type (lowercase). Rows are 16 characters of:
   . empty  k outline  b body  s shadow  h highlight  a accent  d dark accent  e eye  p pupil */
const SPRITES = {
  p: [
    "................",
    "................",
    "......kkkk......",
    ".....khbbsk.....",
    "....khbbbbsk....",
    "....khbbbbsk....",
    ".....kbbssk.....",
    "......kkkk......",
    "......kbsk......",
    ".....kbbbsk.....",
    "....khbbbbsk....",
    "....kbbbbssk....",
    ".....kkkkkk.....",
    "......kbsk......",
    ".....kbbbsk.....",
    "....kkbbbbkk....",
    "...khbbbbbssk...",
    "...kbsssssssk...",
    "....kkkkkkkk....",
    "................",
    "................",
    "................",
    "................",
    "................",
  ],
  r: [
    "................",
    "...k.k..k.k.....",
    "...kak.kakak....",
    "...kaakkaask....",
    "...kkkkkkkkk....",
    "....khbbbbs.....",
    "....khbbabsk....",
    "....khbbbbsk....",
    "....kbbbbssk....",
    "....khbbbbsk....",
    "....kbbbbssk....",
    "....kkkkkkkk....",
    ".....kbsssk.....",
    ".....kbbbsk.....",
    "....khbbbbsk....",
    "....kbbbbssk....",
    "...kkbbbbbbkk...",
    "..khbbbbbbbssk..",
    "..kbsssssssssk..",
    "...kkkkkkkkkk...",
    "................",
    "................",
    "................",
    "................",
  ],
  n: [
    "................",
    ".......kk.......",
    ".....kkabk......",
    "....khaabsk.....",
    "...khhbaassk....",
    "...khebapssk....",
    "...khbbbpssk....",
    "..kkhbbbbssk....",
    ".kbkhbbbbssk....",
    ".ksskbbbbssk....",
    "..kkkbbbbsk.....",
    "....khbbbsk.....",
    "....kbbbbsk.....",
    "....khbbbsk.....",
    "....kbbbbssk....",
    "....kkkkkkkk....",
    "...khbbbbbssk...",
    "...kbsssssssk...",
    "....kkkkkkkk....",
    "................",
    "................",
    "................",
    "................",
    "................",
  ],
  b: [
    "................",
    ".......kk.......",
    "......kaak......",
    "......kssk......",
    ".....khhbsk.....",
    "....khhbbssk....",
    "....khbabssk....",
    "....khbbbssk....",
    ".....kbbssk.....",
    "......kkkk......",
    "......kaak......",
    ".....kbbbsk.....",
    "....khbbbbsk....",
    "....kbbbbssk....",
    "....khbbbbsk....",
    ".....kkkkkk.....",
    "......kbsk......",
    "....kkbbbbkk....",
    "...khbbbbbssk...",
    "...kbsssssssk...",
    "....kkkkkkkk....",
    "................",
    "................",
    "................",
  ],
  q: [
    "................",
    ".k.k.kk.k.k.k...",
    ".kakkaakkaakak..",
    ".kaaaaaaaaaaak..",
    "..kkkkkkkkkkkk..",
    "....khhbbssk....",
    "....khebapsk....",
    "....khbbbssk....",
    ".....kbbssk.....",
    "......kkkk......",
    ".....kaaaak.....",
    "....khbbbbsk....",
    "....khbaabsk....",
    "....kbbbbssk....",
    "....khbbbbsk....",
    ".....kkkkkk.....",
    "......kbsk......",
    ".....kbbbsk.....",
    "....kkbbbbkk....",
    "...khbbbbbssk...",
    "..kkbssssssskk..",
    "...kkkkkkkkkk...",
    "................",
    "................",
  ],
  k: [
    "................",
    ".......kk.......",
    "......kaak......",
    "....kkkaakkk....",
    "....kaaaaaak....",
    "....kkkkkkkk....",
    ".....khhbsk.....",
    "....khebapsk....",
    "....khbbbssk....",
    ".....kbbssk.....",
    "......kkkk......",
    ".....kaaaak.....",
    "....khbaabsk....",
    "....kbbbbssk....",
    "....khbbbbsk....",
    "....kbbbbssk....",
    ".....kkkkkk.....",
    "......kbsk......",
    ".....kbbbsk.....",
    "....kkbbbbkk....",
    "...khbbbbbssk...",
    "..kkbssssssskk..",
    "...kkkkkkkkkk...",
    "................",
  ],
};

const spriteCache = new Map();

function bottomAlign(rows) {
  const out = rows.slice();
  while (out.length && /^\.+$/.test(out[out.length - 1] || "")) out.pop();
  while (out.length < PH) out.unshift(".".repeat(PW));
  return out.slice(-PH).map((row) => (row + ".".repeat(PW)).slice(0, PW));
}

function paintSprite(type, color) {
  const key = color + type;
  if (spriteCache.has(key)) return spriteCache.get(key);
  const rows = bottomAlign(SPRITES[type] || SPRITES.p);
  const pal = PALS[color] || PALS.w;
  const canvas = document.createElement("canvas");
  canvas.width = PW;
  canvas.height = PH;
  const ctx = canvas.getContext("2d");
  const img = ctx.createImageData(PW, PH);
  const data = img.data;
  for (let y = 0; y < PH; y++) {
    const row = rows[y] || "";
    for (let x = 0; x < PW; x++) {
      const ch = row[x] || ".";
      if (ch === ".") continue;
      const rgba = pal[ch];
      if (!rgba) continue;
      const i = (y * PW + x) * 4;
      data[i] = rgba[0];
      data[i + 1] = rgba[1];
      data[i + 2] = rgba[2];
      data[i + 3] = rgba[3];
    }
  }
  ctx.putImageData(img, 0, 0);
  const url = canvas.toDataURL("image/png");
  spriteCache.set(key, url);
  return url;
}

export function pieceSrc(type, color) {
  return paintSprite(String(type || "p").toLowerCase(), color === "b" ? "b" : "w");
}

function pieceImg(type, color, extraClass = "chess-piece") {
  const t = String(type || "p").toLowerCase();
  const c = color === "b" ? "b" : "w";
  const names = { p: "pawn", r: "rook", n: "knight", b: "bishop", q: "queen", k: "king" };
  const side = c === "w" ? "White" : "Black";
  return `<img class="${extraClass}" src="${pieceSrc(t, c)}" alt="${side} ${names[t] || t}" draggable="false" data-piece="${c}${t}" />`;
}

export function initChessUI({ socket, state, $, SHOW, HIDE }) {
  let pendingPromo = null;

  function isSeated(game, me) {
    return Boolean(game && me && (game.seats?.[0] === me || game.seats?.[1] === me || game.white === me || game.black === me));
  }

  function openChessPanel(id) {
    state.chessId = id;
    pendingPromo = null;
    SHOW($("#chess-panel"));
    paintChessPanel();
  }

  function closeChessPanel() {
    HIDE($("#chess-panel"));
    state.chessId = null;
    state.chessSel = null;
    pendingPromo = null;
  }

  function resultCopy(game) {
    if (!game?.result) return "";
    if (game.checkmate || game.result === "checkmate") return `Checkmate! ${game.winner} wins`;
    if (game.result === "stalemate" || game.stalemate) return "Stalemate — draw";
    if (game.result === "resign") return `${game.winner} wins by resignation`;
    if (game.result === "forfeit") return `${game.winner} wins by forfeit`;
    if (game.result === "draw") return "Draw";
    return "Draw";
  }

  function awayNote(game) {
    const away = game.away || {};
    const names = Object.keys(away).filter(Boolean);
    if (!names.length) return "";
    return ` · ${names.join(", ")} reconnecting…`;
  }

  function paintCaptured(game) {
    const cap = $("#chess-captured");
    if (!cap) return;
    const make = (list, taker) =>
      (list || [])
        .map((t) => pieceImg(t, taker === "w" ? "b" : "w", "chess-captured-piece"))
        .join("");
    const w = make(game.captured?.w, "w");
    const b = make(game.captured?.b, "b");
    cap.innerHTML =
      (w ? `<span class="chess-captured-group" data-side="w">${w}</span>` : "") +
      (b ? `<span class="chess-captured-group" data-side="b">${b}</span>` : "");
  }

  function paintCoords(flip) {
    const files = "abcdefgh";
    const ranks = [8, 7, 6, 5, 4, 3, 2, 1];
    const orderFiles = flip ? files.split("").reverse() : files.split("");
    const orderRanks = flip ? ranks.slice().reverse() : ranks;
    const rEl = $("#chess-ranks");
    const fEl = $("#chess-files");
    if (rEl) rEl.innerHTML = orderRanks.map((r) => `<span>${r}</span>`).join("");
    if (fEl) fEl.innerHTML = orderFiles.map((f) => `<span>${f}</span>`).join("");
  }

  function kingSquare(engine, color) {
    const files = "abcdefgh";
    for (const r of [1, 2, 3, 4, 5, 6, 7, 8]) {
      for (const f of files) {
        const p = engine.get(f + r);
        if (p && p.type === "k" && p.color === color) return f + r;
      }
    }
    return null;
  }

  function paintPromo(color) {
    const box = $("#chess-promo");
    if (!box) return;
    if (!pendingPromo) {
      HIDE(box);
      return;
    }
    const choices = [
      ["q", "Queen"],
      ["r", "Rook"],
      ["b", "Bishop"],
      ["n", "Knight"],
    ];
    box.innerHTML =
      `<div class="chess-promo-label">Promote pawn to</div>` +
      `<div class="chess-promo-choices">` +
      choices
        .map(
          ([t, label]) =>
            `<button type="button" data-promo="${t}" data-testid="chess-promo-${t}">${pieceImg(t, color)}<span>${label}</span></button>`
        )
        .join("") +
      `</div>`;
    box.querySelectorAll("[data-promo]").forEach((btn) => {
      btn.addEventListener("click", () => confirmPromo(btn.dataset.promo));
    });
    SHOW(box);
  }

  function confirmPromo(promo) {
    if (!pendingPromo) return;
    const { from, to } = pendingPromo;
    pendingPromo = null;
    state.chessSel = null;
    socket.emit("chessMove", { id: state.chessId, from, to, promotion: promo });
    paintChessPanel();
  }

  function paintChessPanel() {
    const id = state.chessId;
    const game = id && state.room?.chess?.[id];
    if (!game) return;
    const me = state.me?.username;
    const isWhite = game.white === me;
    const isBlack = game.black === me;
    const isPlayer = isWhite || isBlack;
    const myTurn = !game.result && ((game.turn === "w" && isWhite) || (game.turn === "b" && isBlack));
    const status = $("#chess-status");
    if (status) {
      if (game.result) status.textContent = game.result === "checkmate" ? `Checkmate · ${game.winner} wins` : game.result === "resign" || game.result === "forfeit" ? `${game.winner} wins` : "Draw";
      else if (!game.white || !game.black) status.textContent = "Waiting for an opponent…";
      else if (!isPlayer) status.textContent = `Spectating · ${game.turn === "w" ? "White" : "Black"} to move${game.check ? " · check" : ""}${awayNote(game)}`;
      else status.textContent = `${game.turn === "w" ? "White" : "Black"} to move${game.check ? " · check" : ""}${myTurn ? " · your turn" : ""}${awayNote(game)}`;
      if (game.result) status.removeAttribute("data-turn");
      else status.dataset.turn = game.turn || "w";
    }
    paintCaptured(game);
    const result = $("#chess-result");
    if (result) {
      if (game.result) {
        result.textContent = resultCopy(game);
        SHOW(result);
      } else {
        HIDE(result);
      }
    }
    const rematch = $("#chess-rematch");
    if (rematch) {
      if (game.result && isPlayer) SHOW(rematch);
      else HIDE(rematch);
    }
    const resign = $("#chess-resign");
    if (resign) {
      if (isPlayer && !game.result) SHOW(resign);
      else HIDE(resign);
    }
    const stand = $("#chess-stand");
    if (stand) {
      const seatedHere = game.seats?.[0] === me || game.seats?.[1] === me;
      if (seatedHere) SHOW(stand);
      else HIDE(stand);
    }

    const boardEl = $("#chess-board");
    if (!boardEl) return;
    let engine = null;
    try {
      engine = new Chess(game.fen);
    } catch {
      engine = new Chess();
    }
    const flip = isBlack;
    paintCoords(flip);
    const legalMoves = [];
    if (myTurn && state.chessSel && !pendingPromo) {
      engine.moves({ square: state.chessSel, verbose: true }).forEach((m) => legalMoves.push(m));
    }
    const legalTo = new Set(legalMoves.map((m) => m.to));
    const last = game.lastMove || {};
    const files = "abcdefgh";
    const ranks = [8, 7, 6, 5, 4, 3, 2, 1];
    const orderFiles = flip ? files.split("").reverse() : files.split("");
    const orderRanks = flip ? ranks.slice().reverse() : ranks;
    const checked = game.check && !game.result ? kingSquare(engine, engine.turn()) : null;
    let html = "";
    let z = 1;
    for (const r of orderRanks) {
      for (const f of orderFiles) {
        const sq = f + r;
        const fileIdx = files.indexOf(f);
        const dark = (fileIdx + r) % 2 === 0;
        const piece = engine.get(sq);
        const cls = [
          "chess-sq",
          dark ? "dark" : "light",
          state.chessSel === sq ? "sel" : "",
          legalTo.has(sq) ? "legal" : "",
          last.from === sq || last.to === sq ? "last" : "",
          checked === sq ? "check" : "",
        ]
          .filter(Boolean)
          .join(" ");
        const isCapture = legalTo.has(sq) && piece;
        const isDot = legalTo.has(sq) && !piece;
        const marker = isCapture
          ? `<span class="chess-legal-cap" aria-hidden="true"></span>`
          : isDot
            ? `<span class="chess-legal-dot" aria-hidden="true"></span>`
            : "";
        const fig = piece ? pieceImg(piece.type, piece.color) : "";
        html += `<button type="button" class="${cls}" style="z-index:${z}" data-square="${sq}" data-testid="chess-sq-${sq}">${marker}${fig}</button>`;
      }
      z += 1;
    }
    boardEl.innerHTML = html;
    boardEl.querySelectorAll("[data-square]").forEach((b) => {
      b.addEventListener("click", () => onChessSquare(b.dataset.square, engine, myTurn, isPlayer, isWhite, isBlack));
    });
    paintPromo(isBlack ? "b" : "w");
  }

  function onChessSquare(sq, engine, myTurn, isPlayer, isWhite, isBlack) {
    if (pendingPromo) return;
    if (!isPlayer || !myTurn) return;
    const piece = engine.get(sq);
    if (state.chessSel) {
      const moves = engine.moves({ square: state.chessSel, verbose: true }).filter((m) => m.to === sq);
      if (moves.length) {
        if (moves.some((m) => m.promotion)) {
          pendingPromo = { from: state.chessSel, to: sq };
          paintChessPanel();
          return;
        }
        socket.emit("chessMove", { id: state.chessId, from: state.chessSel, to: sq });
        state.chessSel = null;
        paintChessPanel();
        return;
      }
    }
    if (piece && ((piece.color === "w" && isWhite) || (piece.color === "b" && isBlack))) {
      state.chessSel = sq;
      paintChessPanel();
    } else {
      state.chessSel = null;
      paintChessPanel();
    }
  }

  function pickFreeChessSeat(game) {
    if (!game) return 0;
    if (!game.seats?.[0]) return 0;
    if (!game.seats?.[1]) return 1;
    return 0;
  }

  function handleTableClick(id, extra, approachSit) {
    const game = state.room?.chess?.[id];
    const me = state.me?.username;
    if (isSeated(game, me)) {
      openChessPanel(id);
      return true;
    }
    const seatsFull = Boolean(game && game.seats?.[0] && game.seats?.[1]);
    const inPlay = Boolean(game && game.white && game.black);
    if (seatsFull || (inPlay && !game.result) || (game && game.result && seatsFull)) {
      openChessPanel(id);
      return true;
    }
    const seat = extra?.seat === 1 ? 1 : extra?.seat === 0 ? 0 : pickFreeChessSeat(game);
    approachSit(seat);
    return true;
  }

  function onChessUpdated(id, game) {
    if (!state.room) return;
    state.room.chess = state.room.chess || {};
    if (game) state.room.chess[id] = game;
    else delete state.room.chess[id];
    state.room3d?.setChessMap(state.room.chess);
    const me = state.me?.username;
    if (isSeated(game, me)) openChessPanel(id);
    else if (state.chessId === id) paintChessPanel();
  }

  function restoreAfterMount() {
    const me = state.me?.username;
    const games = state.room?.chess || {};
    for (const [id, game] of Object.entries(games)) {
      if (isSeated(game, me)) {
        openChessPanel(id);
        return;
      }
    }
  }

  function bind() {
    $("#chess-close")?.addEventListener("click", closeChessPanel);
    $("#chess-resign")?.addEventListener("click", () => {
      if (state.chessId) socket.emit("chessResign", { id: state.chessId });
    });
    $("#chess-rematch")?.addEventListener("click", () => {
      if (state.chessId) socket.emit("chessRematch", { id: state.chessId });
    });
    $("#chess-stand")?.addEventListener("click", () => {
      socket.emit("standUp");
      closeChessPanel();
    });
  }

  bind();

  window.__chessSetFen = (id, fen) => socket.emit("debugKit", { chessId: id, chessFen: fen });
  window.__chessPanelMetrics = () => {
    const board = document.querySelector('[data-testid="chess-board"]');
    if (!board || board.closest(".hidden")) return null;
    const squares = [...board.querySelectorAll(".chess-sq")].map((el) => {
      const r = el.getBoundingClientRect();
      return { sq: el.dataset.square, w: r.width, h: r.height, x: r.x, y: r.y };
    });
    const br = board.getBoundingClientRect();
    return { board: { w: br.width, h: br.height }, squares, pieces: board.querySelectorAll(".chess-piece").length };
  };

  return {
    openChessPanel,
    closeChessPanel,
    paintChessPanel,
    handleTableClick,
    onChessUpdated,
    restoreAfterMount,
    pickFreeChessSeat,
  };
}
