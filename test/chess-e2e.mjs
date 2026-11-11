import { chromium } from "playwright";
import { mkdir } from "fs/promises";
import { spawn } from "child_process";
import path from "path";
import { fileURLToPath } from "url";
import { once } from "events";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const SHOT = process.env.SHOT_DIR || path.join(ROOT, "screenshots");
const PORT = Number(process.env.CHESS_TEST_PORT || 3010);
const BASE = process.env.BASE_URL || `http://127.0.0.1:${PORT}`;
const START_SERVER = process.env.CHESS_E2E_START_SERVER !== "0";

const results = [];
function log(msg) { console.log("[chess-test]", msg); }
function check(name, ok, extra = "") {
  results.push({ name, ok, extra });
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${extra ? " — " + extra : ""}`);
}

async function login(page, username) {
  await page.goto(BASE, { waitUntil: "domcontentloaded" });
  await page.waitForSelector('[data-testid="username-input"]');
  await page.fill('[data-testid="username-input"]', username);
  await page.click('[data-testid="login-btn"]');
  await page.waitForSelector('body[data-view="creator"]', { timeout: 30000 });
  await page.waitForSelector('[data-testid="save-avatar"]', { timeout: 10000 });
}

async function customize(page, displayName) {
  await page.fill('[data-testid="display-name"]', displayName);
  await page.click('[data-testid="hair-1"]');
  await page.click('[data-testid="shirt-2"]');
  await page.click('[data-testid="skin-2"]');
}

async function saveAvatar(page) {
  await page.click('[data-testid="save-avatar"]');
  await page.waitForSelector('body[data-view="lobby"]', { timeout: 10000 });
}

async function loginToNewRoom(page, username, displayName, roomName) {
  await login(page, username);
  await customize(page, displayName);
  await saveAvatar(page);
  await page.click('[data-testid="add-menu-btn"]');
  await page.waitForSelector('[data-testid="friend-name"]');
  await page.fill('[data-testid="room-name"]', roomName);
  await page.click('[data-testid="create-room-btn"]');
  await page.waitForSelector('body[data-view="room"]');
  await page.waitForFunction(() => window.HouseRoom3D && window.HouseRoom3D.ready);
}

async function joinPublicRoom(page, roomName) {
  await page.click('[data-testid="add-menu-btn"]');
  await page.waitForSelector('[data-testid="room-list"]');
  const item = page.locator('[data-testid^="room-item-"]').filter({ hasText: roomName });
  await item.first().waitFor({ timeout: 10000 });
  await item.first().click();
  await page.waitForSelector('body[data-view="room"]', { timeout: 15000 });
  await page.waitForFunction(() => window.HouseRoom3D && window.HouseRoom3D.ready);
}

async function createUser(page, username, displayName) {
  await login(page, username);
  await customize(page, displayName);
  await saveAvatar(page);
}

function squareMetricsOk(metrics, label) {
  if (!metrics || !metrics.squares || metrics.squares.length !== 64) {
    check(label, false, JSON.stringify(metrics && { count: metrics?.squares?.length, board: metrics?.board }));
    return false;
  }
  const sizes = metrics.squares.map((s) => ({ w: s.w, h: s.h }));
  const w0 = sizes[0].w;
  const maxW = Math.max(...sizes.map((s) => s.w));
  const minW = Math.min(...sizes.map((s) => s.w));
  const maxH = Math.max(...sizes.map((s) => s.h));
  const minH = Math.min(...sizes.map((s) => s.h));
  const maxDelta = Math.max(maxW - minW, maxH - minH);
  const maxRect = Math.max(...sizes.map((s) => Math.abs(s.w - s.h)));
  const ok = maxDelta <= 1.25 && maxRect <= 1.25 && w0 >= 20;
  check(label, ok, JSON.stringify({ w: +w0.toFixed(2), dW: +((maxW - minW).toFixed(2)), dH: +((maxH - minH).toFixed(2)), rect: +maxRect.toFixed(2), board: metrics.board }));
  return ok;
}

async function waitPanel(page) {
  await page.waitForSelector('[data-testid="chess-panel"]:not(.hidden)', { timeout: 20000 });
}

async function startServer() {
  if (!START_SERVER) return null;
  const child = spawn("node", ["server.js"], {
    cwd: ROOT,
    env: { ...process.env, PORT: String(PORT) },
    stdio: ["ignore", "pipe", "pipe"],
  });
  let ready = false;
  child.stdout.on("data", (buf) => {
    const s = String(buf);
    if (s.includes("listening")) ready = true;
  });
  child.stderr.on("data", (buf) => process.stderr.write(buf));
  const start = Date.now();
  while (!ready && Date.now() - start < 15000) {
    if (child.exitCode != null) throw new Error("chess test server exited early: " + child.exitCode);
    await new Promise((r) => setTimeout(r, 100));
  }
  if (!ready) {
    // still try a fetch in case the banner differs
    try {
      const res = await fetch(BASE);
      if (!res.ok && res.status !== 200) throw new Error("not up");
    } catch {
      child.kill("SIGTERM");
      throw new Error("chess test server did not start");
    }
  }
  return child;
}

const roomName = "Chess Lab";
const server = await startServer();
const browser = await chromium.launch({
  headless: true,
  args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage"],
});

let white, black, spectator, ctxA, ctxB, ctxC;
try {
  await mkdir(SHOT, { recursive: true });
  ctxA = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  ctxB = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  ctxC = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  white = await ctxA.newPage();
  black = await ctxB.newPage();
  spectator = await ctxC.newPage();
  white.setDefaultTimeout(20000);
  black.setDefaultTimeout(20000);
  spectator.setDefaultTimeout(20000);

  log("Set up a room and seat two players at a chess table");
  await loginToNewRoom(white, "wren", "Wren", roomName);
  const roomId = await white.evaluate(() => window.__roomId || document.querySelector("[data-testid='room-title']")?.textContent);
  await white.evaluate(() => window.__debugKit({ furniture: ["chesstable"], coins: 400 }));
  await white.waitForTimeout(200);
  await white.evaluate(() => { window.__startPlace("chesstable"); window.__clickTile(1, 3); });
  await white.waitForFunction(() => window.HouseRoom3D.getFurniture().some((f) => f.type === "chesstable"));
  const chessId = await white.evaluate(() => window.HouseRoom3D.getFurniture().find((f) => f.type === "chesstable").id);

  await createUser(black, "pax", "Pax");
  await joinPublicRoom(black, roomName);

  await white.evaluate((id) => window.__clickFurniture(id, "chesstable", { seat: 0 }), chessId);
  await black.evaluate((id) => window.__clickFurniture(id, "chesstable", { seat: 1 }), chessId);
  await waitPanel(white);
  await waitPanel(black);
  check("Both players see the chess panel after sitting", true);

  log("Square sizing on desktop, phone portrait, and landscape");
  const desk = await white.evaluate(() => window.__chessPanelMetrics());
  squareMetricsOk(desk, "Desktop board uses 8x8 equal square cells");
  check("Desktop pieces are standing sprite images, not letter glyphs", Boolean(desk && desk.pieces === 32 && await white.locator('[data-testid="chess-board"] img.chess-piece').count() === 32));
  await white.screenshot({ path: path.join(SHOT, "chess-desktop.png") });

  await white.setViewportSize({ width: 390, height: 844 });
  await white.waitForTimeout(300);
  const phone = await white.evaluate(() => window.__chessPanelMetrics());
  squareMetricsOk(phone, "Phone portrait board uses 8x8 equal square cells");
  await white.screenshot({ path: path.join(SHOT, "chess-phone-portrait.png") });

  await white.setViewportSize({ width: 844, height: 390 });
  await white.waitForTimeout(300);
  const land = await white.evaluate(() => window.__chessPanelMetrics());
  squareMetricsOk(land, "Phone landscape board uses 8x8 equal square cells");
  await white.setViewportSize({ width: 1280, height: 800 });
  await white.waitForTimeout(200);

  log("Legal moves, highlights, and two-client sync");
  // Black's board is flipped; both click via testids.
  await white.click('[data-testid="chess-sq-e2"]');
  await white.waitForTimeout(150);
  const highlights = await white.evaluate(() => {
    const legal = [...document.querySelectorAll(".chess-sq.legal")].map((el) => el.dataset.square);
    const sel = document.querySelector(".chess-sq.sel")?.dataset.square;
    return { legal, sel };
  });
  check(
    "Selecting a pawn highlights its legal destination squares",
    highlights.sel === "e2" && highlights.legal.includes("e3") && highlights.legal.includes("e4") && !highlights.legal.includes("e5"),
    JSON.stringify(highlights)
  );
  await white.screenshot({ path: path.join(SHOT, "chess-legal-moves.png") });

  // Illegal: e5 should not move the pawn
  await white.click('[data-testid="chess-sq-e5"]');
  await white.waitForTimeout(200);
  const stillHome = await white.evaluate(() => {
    const e2 = document.querySelector('[data-testid="chess-sq-e2"] img');
    const e5 = document.querySelector('[data-testid="chess-sq-e5"] img');
    return Boolean(e2) && !e5;
  });
  check("An illegal destination is ignored and the pawn stays on e2", stillHome);

  await white.click('[data-testid="chess-sq-e2"]');
  await white.click('[data-testid="chess-sq-e4"]');
  await black.waitForFunction(() => document.querySelector('[data-testid="chess-sq-e4"] img'), null, { timeout: 8000 });
  const synced = await black.evaluate(() => {
    const e4 = document.querySelector('[data-testid="chess-sq-e4"] img');
    const e2 = document.querySelector('[data-testid="chess-sq-e2"] img');
    const status = document.querySelector('[data-testid="chess-status"]')?.textContent || "";
    return { moved: Boolean(e4) && !e2, status, flipFiles: document.querySelector('[data-testid="chess-files"]')?.textContent };
  });
  check("Black sees White's e2-e4 move on a flipped board", synced.moved && /black to move/i.test(synced.status), JSON.stringify(synced));
  check("Black's file labels are flipped (h…a)", typeof synced.flipFiles === "string" && synced.flipFiles.replace(/\s/g, "").startsWith("h") && synced.flipFiles.replace(/\s/g, "").endsWith("a"), JSON.stringify(synced.flipFiles));

  log("Spectator can watch the live board");
  await createUser(spectator, "sage", "Sage");
  await joinPublicRoom(spectator, roomName);
  await spectator.evaluate((id) => window.__clickFurniture(id, "chesstable"), chessId);
  await waitPanel(spectator);
  const specView = await spectator.evaluate(() => {
    const status = document.querySelector('[data-testid="chess-status"]')?.textContent || "";
    const e4 = Boolean(document.querySelector('[data-testid="chess-sq-e4"] img'));
    const resignHidden = document.getElementById("chess-resign")?.classList.contains("hidden");
    return { status, e4, resignHidden };
  });
  check("A spectator sees the current position and cannot resign", specView.e4 && /spectat/i.test(specView.status) && specView.resignHidden, JSON.stringify(specView));

  log("Reconnect keeps the game in progress");
  await white.reload({ waitUntil: "domcontentloaded" });
  // After refresh the client should auto-login via session? Check how auth works.
  // If it shows login, log back in as wren (avatar already saved).
  const view = await white.waitForFunction(() => document.body.dataset.view, null, { timeout: 10000 }).then(() => white.evaluate(() => document.body.dataset.view));
  if (view === "login") {
    await white.fill('[data-testid="username-input"]', "wren");
    await white.click('[data-testid="login-btn"]');
  }
  await white.waitForSelector('body[data-view="room"]', { timeout: 20000 });
  await waitPanel(white);
  const resumed = await white.evaluate(() => {
    const e4 = Boolean(document.querySelector('[data-testid="chess-sq-e4"] img'));
    const result = document.querySelector('[data-testid="chess-result"]');
    const hidden = !result || result.classList.contains("hidden");
    const status = document.querySelector('[data-testid="chess-status"]')?.textContent || "";
    return { e4, hidden, status };
  });
  check("Refreshing mid-game restores the same position (not a forfeit)", resumed.e4 && resumed.hidden && !/forfeit|checkmate/i.test(resumed.status), JSON.stringify(resumed));

  log("Promotion choice UI");
  await white.evaluate((id) => window.__chessSetFen(id, "8/P3k3/8/8/8/8/8/4K3 w - - 0 1"), chessId);
  await white.waitForFunction(() => document.querySelector('[data-testid="chess-sq-a7"] img'), null, { timeout: 8000 });
  await white.click('[data-testid="chess-sq-a7"]');
  await white.click('[data-testid="chess-sq-a8"]');
  await white.waitForSelector('[data-testid="chess-promo"]:not(.hidden)', { timeout: 8000 });
  check("A pawn reaching the last rank opens a promotion chooser", true);
  await white.click('[data-testid="chess-promo-n"]');
  await white.waitForFunction(() => {
    const promo = document.querySelector('[data-testid="chess-promo"]');
    const a8 = document.querySelector('[data-testid="chess-sq-a8"] img');
    return promo?.classList.contains("hidden") && a8 && a8.getAttribute("data-piece") === "wn";
  }, null, { timeout: 8000 });
  const promoSync = await black.waitForFunction(() => {
    const a8 = document.querySelector('[data-testid="chess-sq-a8"] img');
    return a8 && a8.getAttribute("data-piece") === "wn";
  }, null, { timeout: 8000 }).then(() => true).catch(() => false);
  check("Promoting to a knight syncs the new standing piece to the opponent", promoSync);

  log("Scholar's mate checkmate message");
  await white.evaluate((id) => window.__chessSetFen(id, "r1bqkb1r/pppp1Qpp/2n2n2/4p3/2B1P3/8/PPPP1PPP/RNB1K1NR b KQkq - 0 4"), chessId);
  // That's already mate? Scholar's mate final position after Qxf7#.
  // FEN after 4. Qxf7#: r1bqkb1r/pppp1Qpp/2n2n2/4p3/2B1P3/8/PPPP1PPP/RNB1K1NR b - - 0 4 is checkmate (black to move but mated).
  // debugKit clears result and loads FEN; if the FEN is already checkmate, result may stay null until a move.
  // Play the mate live instead from a near-mate position: 
  // r1bqkb1r/pppp1ppp/2n2n2/4p2Q/2B1P3/8/PPPP1PPP/RNB1K1NR w KQkq - 4 4  then Qh5-f7
  await white.evaluate((id) => window.__chessSetFen(id, "r1bqkb1r/pppp1ppp/2n2n2/4p2Q/2B1P3/8/PPPP1PPP/RNB1K1NR w KQkq - 4 4"), chessId);
  await white.waitForFunction(() => document.querySelector('[data-testid="chess-sq-h5"] img'), null, { timeout: 8000 });
  await white.click('[data-testid="chess-sq-h5"]');
  await white.click('[data-testid="chess-sq-f7"]');
  await white.waitForFunction(() => document.querySelector('[data-testid="chess-result"]')?.textContent?.toLowerCase().includes("checkmate"), null, { timeout: 8000 });
  const mateBoth = await black.locator('[data-testid="chess-result"]').innerText().then((t) => t.toLowerCase().includes("checkmate"));
  check("Checkmate is shown clearly to both players", mateBoth);
  await white.setViewportSize({ width: 390, height: 844 });
  await white.waitForTimeout(300);
  await white.screenshot({ path: path.join(SHOT, "chess-checkmate.png") });

  const failed = results.filter((r) => !r.ok);
  if (failed.length) {
    console.error(`\n${failed.length} chess check(s) failed`);
    process.exitCode = 1;
  } else {
    console.log(`\nAll ${results.length} chess checks passed`);
  }

  await ctxA?.close();
  await ctxB?.close();
  await ctxC?.close();
} catch (err) {
  console.error("Chess e2e crashed:", err);
  process.exitCode = 1;
  try { if (white) await white.screenshot({ path: path.join(SHOT, "debug-chess-white.png"), fullPage: true }); } catch {}
  try { if (black) await black.screenshot({ path: path.join(SHOT, "debug-chess-black.png"), fullPage: true }); } catch {}
} finally {
  await browser.close();
  if (server) {
    server.kill("SIGTERM");
    await Promise.race([once(server, "exit"), new Promise((r) => setTimeout(r, 2000))]);
  }
}
