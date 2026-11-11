import { chromium } from "playwright";
import { mkdir } from "fs/promises";
import { spawn } from "child_process";
import path from "path";
import { fileURLToPath } from "url";
import { ART_PIECES, PAINTING_CATALOG, PAINTING_IDS, ART_TILE_SPAN, ART_SIZE, ART_WORLD_UP } from "../public/js/artPieces.js";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const SHOT = process.env.SHOT_DIR || path.join(ROOT, "screenshots");
const ART_SHOTS = process.env.ART_SHOT_DIR || "/workspace/art-shots";
const PORT = Number(process.env.ART_TEST_PORT || 3018);
const START_SERVER = process.env.ART_E2E_START_SERVER !== "0";
const BASE = START_SERVER ? `http://127.0.0.1:${PORT}` : (process.env.BASE_URL || `http://127.0.0.1:${PORT}`);

const results = [];
function log(msg) { console.log("[art-test]", msg); }
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

async function startServer() {
  if (!START_SERVER) return null;
  const child = spawn("node", ["server.js"], {
    cwd: ROOT,
    env: { ...process.env, PORT: String(PORT) },
    stdio: ["ignore", "pipe", "pipe"],
  });
  let ready = false;
  child.stdout.on("data", (buf) => {
    if (String(buf).includes("listening")) ready = true;
  });
  child.stderr.on("data", (buf) => process.stderr.write(buf));
  const start = Date.now();
  while (!ready && Date.now() - start < 15000) {
    if (child.exitCode != null) throw new Error("art test server exited early: " + child.exitCode);
    await new Promise((r) => setTimeout(r, 100));
  }
  if (!ready) {
    try {
      const res = await fetch(BASE);
      if (!res.ok && res.status !== 200) throw new Error("not up");
    } catch {
      child.kill("SIGTERM");
      throw new Error("art test server did not start");
    }
  }
  return child;
}

const IDS = [...PAINTING_IDS];
const roomName = "Art Studio";
const server = await startServer();
const browser = await chromium.launch({
  headless: true,
  args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage"],
});

let alice, bob, ctxA, ctxB;
try {
  await mkdir(SHOT, { recursive: true });
  await mkdir(ART_SHOTS, { recursive: true });
  ctxA = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  ctxB = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  alice = await ctxA.newPage();
  bob = await ctxB.newPage();
  alice.setDefaultTimeout(20000);
  bob.setDefaultTimeout(20000);

  log("Catalog entries exist on the client");
  await loginToNewRoom(alice, "aria", "Aria", roomName);
  const catalog = await alice.evaluate((ids) => {
    const out = {};
    for (const id of ids) out[id] = window.HouseIso?.CATALOG?.[id] || null;
    return out;
  }, IDS);
  const catalogOk = IDS.every((id) => {
    const got = catalog[id];
    const exp = PAINTING_CATALOG[id];
    return got && got.name === exp.name && got.price === exp.price
      && got.w === 1 && got.h === 1 && got.surface === "wall";
  });
  check("All 6 paintings are in the catalog as one-tile wall art with the right titles and prices", catalogOk, catalogOk ? "" : JSON.stringify(catalog));

  log("Store Art category lists the new paintings");
  await alice.evaluate(() => window.__debugKit({ coins: 400 }));
  await alice.evaluate(() => window.__openStore("art", "art_shore"));
  await alice.waitForSelector('[data-testid="store-panel"]:not(.hidden)');
  const store = await alice.evaluate((ids) => {
    const listed = ids.filter((id) => document.querySelector(`[data-testid="store-item-${id}"]`));
    const prices = {};
    for (const id of listed) {
      prices[id] = document.querySelector(`[data-testid="store-item-${id}"] .price`)?.textContent || "";
    }
    return { listed, prices, tab: Boolean(document.querySelector('[data-testid="store-tab-art"]')) };
  }, IDS);
  const storeOk = store.tab && store.listed.length === IDS.length
    && IDS.every((id) => store.prices[id] === `${PAINTING_CATALOG[id].price}c`);
  check("The Art tab lists all 6 paintings at their catalog coin prices", storeOk, storeOk ? "" : JSON.stringify(store));
  await alice.waitForTimeout(250);
  await alice.screenshot({ path: path.join(ART_SHOTS, "store-listing.png") });

  log("Buy a painting from the store");
  await alice.locator('[data-testid="store-item-art_blocks"]').click();
  await alice.locator('[data-testid="store-buy"]').click();
  const bought = await alice.waitForFunction(() => (window.__inventory?.() || []).includes("art_blocks"), null, { timeout: 8000 }).then(() => true).catch(() => false);
  check("Buying Color Blocks from the Art tab adds it to inventory", bought);
  await alice.evaluate(() => window.__closeStore?.());

  log("Place paintings on both walls, one tile each");
  await alice.evaluate((ids) => window.__debugKit({ furniture: ids, coins: 400 }), IDS);
  await alice.waitForTimeout(200);
  await alice.evaluate(() => window.__enterEdit());
  const placements = [
    ["art_shore", "back", 0],
    ["art_peaks", "back", 1],
    ["art_mesa", "back", 2],
    ["art_blocks", "left", 0],
    ["art_tide", "left", 1],
    ["art_splash", "left", 5],
  ];
  const blockedBefore = await alice.evaluate(() => [...(window.HouseIso.blockedSet(window.HouseRoom3D.getFurniture()) || [])]);
  for (const [type, wall, slot] of placements) {
    await alice.evaluate(({ type, wall, slot }) => {
      window.__startPlace(type);
      window.__clickWall(wall, slot);
    }, { type, wall, slot });
  }
  await alice.waitForFunction((n) => (window.HouseRoom3D.getWallArt() || []).length >= n, placements.length, { timeout: 10000 });
  await alice.waitForFunction(() => !document.querySelector("#place-banner") || document.querySelector("#place-banner").classList.contains("hidden"), null, { timeout: 5000 });
  await alice.waitForTimeout(300);

  const placed = await alice.evaluate((want) => {
    const arts = window.HouseRoom3D.getWallArt() || [];
    const furniture = window.HouseRoom3D.getFurniture() || [];
    const blocked = [...(window.HouseIso.blockedSet(furniture) || [])];
    const rows = want.map(([type, wall, slot]) => {
      const hits = arts.filter((a) => a.type === type);
      const metrics = window.HouseRoom3D.artMetrics?.(type, wall, slot) || null;
      return {
        type, wall, slot,
        count: hits.length,
        match: hits.some((a) => a.wall === wall && a.slot === slot),
        onFloor: furniture.some((f) => f.type === type),
        tileSpan: metrics?.tileSpan,
        upHeight: metrics?.upHeight,
      };
    });
    const slots = arts.map((a) => `${a.wall}:${a.slot}`);
    const unique = new Set(slots).size === slots.length;
    return { rows, unique, count: arts.length, blocked };
  }, placements);
  const placeOk = placed.unique
    && placed.rows.every((r) => r.count === 1 && r.match && !r.onFloor && r.tileSpan === ART_TILE_SPAN && r.upHeight === 32)
    && placed.blocked.length === blockedBefore.length;
  check("Each painting hangs in exactly one wall-tile footprint and does not occupy a floor tile", placeOk, placeOk ? "" : JSON.stringify({ placed, blockedBefore }));

  log("Rotate / flip between walls");
  const oceanBefore = await alice.evaluate(() => {
    const a = window.HouseRoom3D.getWallArt().find((x) => x.type === "art_shore");
    window.__clickFurniture(a.id, "art_shore", { wallArt: true });
    window.__rotatePending();
    return { wall: a.wall, slot: a.slot, id: a.id };
  });
  const flipped = await alice.waitForFunction((prev) => {
    const a = (window.HouseRoom3D.getWallArt() || []).find((x) => x.id === prev.id);
    if (a && a.wall !== prev.wall) return { wall: a.wall, slot: a.slot };
    return false;
  }, oceanBefore, { timeout: 8000 }).then((h) => h.jsonValue()).catch(() => null);
  const flipOk = Boolean(flipped && flipped.wall !== oceanBefore.wall);
  check("Rotating a hung painting flips it to a free slot on the other wall", flipOk, JSON.stringify({ oceanBefore, flipped }));

  const farmBefore = await alice.evaluate(() => {
    const a = window.HouseRoom3D.getWallArt().find((x) => x.type === "art_blocks");
    window.__clickFurniture(a.id, "art_blocks", { wallArt: true });
    window.__rotatePending();
    return { wall: a.wall, slot: a.slot, id: a.id };
  });
  const farmAfter = await alice.waitForFunction((prev) => {
    const a = (window.HouseRoom3D.getWallArt() || []).find((x) => x.id === prev.id);
    if (a && a.wall !== prev.wall) return { wall: a.wall, slot: a.slot };
    return false;
  }, farmBefore, { timeout: 8000 }).then((h) => h.jsonValue()).catch(() => null);
  check("A second painting can also be flipped to the opposite wall", Boolean(farmAfter && farmAfter.wall !== farmBefore.wall), JSON.stringify({ farmBefore, farmAfter }));

  const extras = [];
  for (const type of extras) {
    const spot = await alice.evaluate((type) => {
      const size = 6;
      const arts = window.HouseRoom3D.getWallArt() || [];
      const used = new Set(arts.map((a) => `${a.wall}:${a.slot}`));
      const reserved = window.HouseIso.reservedWallSlots(size);
      for (const wall of ["back", "left"]) {
        for (let s = 0; s < size; s++) {
          if (reserved[wall].has(s) || used.has(`${wall}:${s}`)) continue;
          if (!window.HouseIso.canPlaceWall(type, wall, s, size)) continue;
          return { wall, slot: s };
        }
      }
      return null;
    }, type);
    if (!spot) continue;
    await alice.evaluate(({ type, wall, slot }) => {
      window.__startPlace(type);
      window.__clickWall(wall, slot);
    }, { type, ...spot });
    await alice.waitForFunction((type) => (window.HouseRoom3D.getWallArt() || []).some((a) => a.type === type), type, { timeout: 8000 });
  }

  log("Sync to another player and persist after leave/rejoin");
  await createUser(bob, "bruno", "Bruno");
  await joinPublicRoom(bob, roomName);
  const bobSees = await bob.waitForFunction(() => {
    const arts = window.HouseRoom3D.getWallArt() || [];
    const types = new Set(arts.map((a) => a.type));
    return types.has("art_peaks") && types.has("art_shore") && types.has("art_splash") && arts.length >= 6;
  }, null, { timeout: 10000 }).then(() => true).catch(() => false);
  check("A second player in the cube sees the hung paintings", bobSees);

  const beforeLeave = await bob.evaluate(() => (window.HouseRoom3D.getWallArt() || []).map((a) => ({ type: a.type, wall: a.wall, slot: a.slot })));
  await alice.evaluate(() => window.__leaveRoom?.());
  await alice.waitForSelector('body[data-view="lobby"]', { timeout: 15000 });
  await joinPublicRoom(alice, roomName);
  const afterRejoin = await alice.waitForFunction((prev) => {
    const arts = window.HouseRoom3D.getWallArt() || [];
    if (arts.length !== prev.length) return false;
    return prev.every((p) => arts.some((a) => a.type === p.type && a.wall === p.wall && a.slot === p.slot));
  }, beforeLeave, { timeout: 10000 }).then(() => true).catch(() => false);
  check("Paintings are still hung after the owner leaves and rejoins the cube", afterRejoin);

  log("Desktop and phone in-room screenshots");
  await alice.evaluate(() => {
    window.__exitEdit?.();
    const box = document.getElementById("toasts");
    if (box) box.innerHTML = "";
  });
  await alice.evaluate(() => window.HouseRoom3D.setCamMode?.("room"));
  await alice.waitForTimeout(400);
  await alice.screenshot({ path: path.join(ART_SHOTS, "cube-all-six.png") });
  await alice.setViewportSize({ width: 390, height: 844 });
  await alice.waitForTimeout(700);
  const phonePath = path.join(ART_SHOTS, "in-room-phone.png");
  await alice.screenshot({ path: phonePath });
  await alice.screenshot({ path: path.join(SHOT, "art-in-room-phone.png") });
  check("Saved a phone-viewport shot of paintings hung in a cube", true, phonePath);

  const failed = results.filter((r) => !r.ok);
  if (failed.length) {
    console.error(`\n${failed.length} art check(s) failed`);
    process.exitCode = 1;
  } else {
    console.log(`\nAll ${results.length} art checks passed`);
  }
} catch (err) {
  console.error("Art e2e crashed:", err);
  try {
    await alice?.screenshot({ path: path.join(SHOT, "debug-art-alice.png"), fullPage: true });
    await bob?.screenshot({ path: path.join(SHOT, "debug-art-bob.png"), fullPage: true });
  } catch {}
  process.exitCode = 1;
} finally {
  await browser.close();
  if (server) {
    server.kill("SIGTERM");
    await new Promise((r) => setTimeout(r, 300));
    if (server.exitCode == null) server.kill("SIGKILL");
  }
}
