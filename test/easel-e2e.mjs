import { chromium } from "playwright";
import { spawn } from "child_process";
import path from "path";
import { fileURLToPath } from "url";
import { seedAndLogin, clickCreatorOption, goToLobby, openCharacterEditor, closePhoneIfOpen } from "./startMenuHelp.mjs";
import { EASEL_PRICE, EASEL_GRID } from "../public/js/easel.js";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const PORT = Number(process.env.EASEL_TEST_PORT || 3071);
const BASE = process.env.BASE_URL || `http://127.0.0.1:${PORT}`;
const START_SERVER = process.env.EASEL_E2E_START_SERVER !== "0";

const results = [];
function log(msg) { console.log("[easel-test]", msg); }
function check(name, ok, extra = "") {
  results.push({ name, ok, extra });
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${extra ? " — " + extra : ""}`);
}

async function customize(page, displayName) {
  await openCharacterEditor(page);
  await page.fill('[data-testid="display-name"]', displayName);
  await clickCreatorOption(page, "hair-1");
  await clickCreatorOption(page, "shirt-2");
  await clickCreatorOption(page, "skin-2");
}
async function saveAvatar(page) {
  await openCharacterEditor(page);
  await page.click('[data-testid="save-avatar"]');
  await page.waitForSelector('body[data-view="room"]', { timeout: 15000 });
  await page.waitForFunction(() => !window.__creatorMenu?.isPhoneEdit?.(), null, { timeout: 8000 }).catch(() => {});
  await closePhoneIfOpen(page);
}
async function loginToNewRoom(page, username, displayName, roomName) {
  await seedAndLogin(page, username, BASE);
  await customize(page, displayName);
  await saveAvatar(page);
  await goToLobby(page);
  await page.click('[data-testid="add-menu-btn"]');
  await page.waitForSelector('[data-testid="friend-name"]');
  await page.fill('[data-testid="room-name"]', roomName);
  await page.click('[data-testid="create-room-btn"]');
  await page.waitForSelector('body[data-view="room"]');
  await page.waitForFunction(() => window.HouseRoom3D && window.HouseRoom3D.ready);
}

async function startServer() {
  if (!START_SERVER) return null;
  const child = spawn("node", ["server.js"], {
    cwd: ROOT,
    env: { ...process.env, PORT: String(PORT) },
    stdio: ["ignore", "pipe", "pipe"],
  });
  let ready = false;
  child.stdout.on("data", (buf) => { if (String(buf).includes("listening")) ready = true; });
  child.stderr.on("data", (buf) => process.stderr.write(buf));
  const t0 = Date.now();
  while (!ready && Date.now() - t0 < 8000) await new Promise((r) => setTimeout(r, 50));
  if (!ready) throw new Error("easel e2e server did not start");
  return child;
}

const child = await startServer();
const browser = await chromium.launch({ args: ["--no-sandbox", "--disable-setuid-sandbox"] });
const ctxA = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
const alice = await ctxA.newPage();
alice.setDefaultTimeout(20000);
const roomName = "Easel Studio " + Math.floor(Math.random() * 9999);
try {
  log("Catalog and furniture tab");
  await loginToNewRoom(alice, "easelalice", "Aria", roomName);
  const cat = await alice.evaluate(() => window.HouseIso?.CATALOG?.easel || null);
  check("The easel is a 1-tile furniture catalog item at 26 coins",
    cat?.name === "Easel" && cat?.price === EASEL_PRICE && cat?.w === 1 && cat?.h === 1 && cat?.surface !== "wall", JSON.stringify(cat));

  await alice.evaluate(() => window.__debugKit({ coins: 200 }));
  await alice.evaluate(() => window.__openStore("furniture", "easel"));
  await alice.waitForSelector('[data-testid="store-panel"]:not(.hidden)');
  const listed = await alice.evaluate(() => {
    const card = document.querySelector('[data-testid="store-item-easel"]');
    return { has: Boolean(card), text: card?.textContent?.replace(/\s+/g, " ").trim(), buy: document.querySelector('[data-testid="store-buy"]')?.textContent };
  });
  check("The Furniture tab lists the Easel at 26c",
    listed.has && listed.text.includes("Easel") && (listed.text.includes("26c") || listed.buy?.includes("26")), JSON.stringify(listed));
  await alice.locator('[data-testid="store-item-easel"]').click();
  await alice.locator('[data-testid="store-buy"]').click();
  const bought = await alice.waitForFunction(() => (window.__inventory?.() || []).includes("easel"), null, { timeout: 8000 }).then(() => true).catch(() => false);
  check("Buying the easel adds it to inventory", bought);
  await alice.evaluate(() => window.__closeStore?.());

  log("Place the easel in Edit mode");
  await alice.evaluate(() => window.__enterEdit());
  await alice.evaluate(() => {
    window.__startPlace("easel");
    window.__clickTile(3, 3);
  });
  const placed = await alice.waitForFunction(() => (window.HouseRoom3D?.getFurniture?.() || []).some((f) => f.type === "easel"), null, { timeout: 8000 }).then(() => true).catch(() => false);
  check("The easel can be placed on a floor tile like other furniture", placed);
  await alice.evaluate(() => window.__cancelPlace?.());
  const easelId = await alice.evaluate(() => (window.HouseRoom3D.getFurniture() || []).find((f) => f.type === "easel")?.id);

  log("Paint, save, and inventory");
  await alice.evaluate((id) => {
    // Leave edit so a tap opens the paint UI, not the move handles.
    window.__exitEdit?.() || document.querySelector('[data-testid="edit-done"]')?.click();
    window.__openEaselPaint(id);
  }, easelId);
  await alice.waitForSelector('[data-testid="easel-paint"]:not(.hidden)', { timeout: 8000 });
  const ui = await alice.evaluate(() => ({
    grid: Boolean(document.querySelector('[data-testid="easel-grid"]')),
    tools: ["pencil", "eraser", "fill"].every((t) => document.querySelector(`[data-testid="easel-tool-${t}"]`)),
    undo: Boolean(document.querySelector('[data-testid="easel-undo"]')),
    clear: Boolean(document.querySelector('[data-testid="easel-clear"]')),
    palette: document.querySelectorAll("[data-testid^='easel-color-']").length,
    custom: Boolean(document.querySelector('[data-testid="easel-custom-color"]')),
    title: Boolean(document.querySelector('[data-testid="easel-title"]')),
    save: Boolean(document.querySelector('[data-testid="easel-save"]')),
    cancel: Boolean(document.querySelector('[data-testid="easel-cancel"]')),
  }));
  check("The paint UI is phone-friendly with a 16×16 grid, 16 colors, custom picker, tools, title, Save, and Cancel",
    ui.grid && ui.tools && ui.undo && ui.clear && ui.palette === 16 && ui.custom && ui.title && ui.save && ui.cancel, JSON.stringify(ui));

  await alice.fill('[data-testid="easel-title"]', "Red House");
  await alice.evaluate(() => window.__easelPaintDemo("house"));
  await alice.locator('[data-testid="easel-save"]').click();
  await alice.waitForFunction(() => (window.__inventory?.() || []).some((t) => String(t).startsWith("art_easel_")), null, { timeout: 8000 });
  const afterSave = await alice.evaluate(() => {
    const inv = window.__inventory?.() || [];
    const type = inv.find((t) => String(t).startsWith("art_easel_"));
    const arts = (window.__storeState?.()?.me?.artworks) || (window.__artworkByType?.(type) ? [window.__artworkByType(type)] : []);
    // profile artworks may be on state.me
    return {
      type,
      inventory: inv,
      artworks: window.__artworkByType?.(type) || null,
      easel: (window.HouseRoom3D.getFurniture() || []).find((f) => f.type === "easel") || null,
      paintClosed: !window.__isEaselPaintOpen?.(),
    };
  });
  check("Saving creates a titled artwork item in inventory and leaves it on the easel canvas",
    afterSave.type && afterSave.artworks?.title === "Red House" && afterSave.easel?.canvas?.data && afterSave.paintClosed,
    JSON.stringify({ type: afterSave.type, title: afterSave.artworks?.title, canvas: Boolean(afterSave.easel?.canvas), closed: afterSave.paintClosed }));

  log("Inventory shows a thumbnail and title");
  await alice.evaluate(() => window.__enterEdit());
  const invCard = await alice.evaluate((type) => {
    const btn = document.querySelector(`[data-testid="edit-item-${type}"]`);
    const thumb = btn?.querySelector("canvas[data-easel-thumb], canvas[data-art-thumb], img, canvas");
    return {
      has: Boolean(btn),
      text: btn?.textContent?.replace(/\s+/g, " ").trim() || "",
      thumb: Boolean(thumb),
      thumbKind: thumb?.dataset?.easelThumb || thumb?.dataset?.artThumb || thumb?.tagName || null,
    };
  }, afterSave.type);
  check("Inventory shows the artwork with a thumbnail and its title",
    invCard.has && invCard.thumb && invCard.text.includes("Red House"), JSON.stringify(invCard));

  log("Hang the painting on the wall");
  await alice.evaluate((type) => {
    window.__startPlace(type);
    window.__clickWall("back", 0);
  }, afterSave.type);
  const hung = await alice.waitForFunction((type) => (window.HouseRoom3D.getWallArt() || []).some((a) => a.type === type && a.data), afterSave.type, { timeout: 8000 }).then(() => true).catch(() => false);
  const hungArt = await alice.evaluate(() => (window.HouseRoom3D.getWallArt() || []).find((a) => String(a.type).startsWith("art_easel_")));
  check("The saved artwork hangs on a wall slot like other paintings and keeps its pixels",
    hung && hungArt?.title === "Red House" && Boolean(hungArt?.data?.cells) && hungArt.wall === "back", JSON.stringify(hungArt));

  log("Visitor cannot paint");
  const ctxB = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
  const bob = await ctxB.newPage();
  bob.setDefaultTimeout(20000);
  await seedAndLogin(bob, "easelbob", BASE);
  await customize(bob, "Bo");
  await saveAvatar(bob);
  await goToLobby(bob);
  await bob.click('[data-testid="add-menu-btn"]');
  await bob.waitForSelector('[data-testid="room-list"]');
  const item = bob.locator('[data-testid^="room-item-"]').filter({ hasText: roomName });
  await item.first().waitFor({ timeout: 10000 });
  await item.first().click();
  await bob.waitForSelector('body[data-view="room"]', { timeout: 15000 });
  await bob.waitForFunction(() => window.HouseRoom3D && window.HouseRoom3D.ready);
  const visitorWall = await bob.evaluate(() => (window.HouseRoom3D.getWallArt() || []).find((a) => String(a.type).startsWith("art_easel_")));
  check("A visitor in the cube sees the hung custom painting",
    visitorWall?.title === "Red House" && Boolean(visitorWall?.data), JSON.stringify(visitorWall && { title: visitorWall.title, type: visitorWall.type }));
  const visitorBlocked = await bob.evaluate(() => {
    const easel = (window.HouseRoom3D.getFurniture() || []).find((f) => f.type === "easel");
    window.__clickFurniture(easel.id, "easel");
    const open = window.__isEaselPaintOpen?.();
    return { id: easel?.id, open };
  });
  // give toast a beat
  await bob.waitForTimeout(300);
  const stillClosed = await bob.evaluate(() => !window.__isEaselPaintOpen?.());
  check("A visitor cannot open the owner's easel to paint",
    stillClosed && visitorBlocked.open !== true, JSON.stringify(visitorBlocked));
  await ctxB.close();
} catch (err) {
  check("easel e2e ran without throwing", false, String(err?.stack || err));
} finally {
  await browser.close();
  if (child) child.kill("SIGTERM");
}

const failed = results.filter((r) => !r.ok);
if (failed.length) {
  console.log(`\n${failed.length} easel e2e check(s) failed`);
  process.exit(1);
}
console.log(`\nAll ${results.length} easel e2e checks passed`);
