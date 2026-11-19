import { chromium } from "playwright";
import { spawn } from "child_process";
import path from "path";
import { fileURLToPath } from "url";
import { seedAndLogin, clickCreatorOption, goToLobby, openCharacterEditor, closePhoneIfOpen } from "./startMenuHelp.mjs";
import { MIXER_PRICE, MIXER_STEPS } from "../public/js/musicMixer.js";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const PORT = Number(process.env.MIXER_TEST_PORT || 3075);
const BASE = process.env.BASE_URL || `http://127.0.0.1:${PORT}`;
const START_SERVER = process.env.MIXER_E2E_START_SERVER !== "0";

const results = [];
function log(msg) { console.log("[mixer-test]", msg); }
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
  if (!ready) throw new Error("mixer e2e server did not start");
  return child;
}

const child = await startServer();
const browser = await chromium.launch({ args: ["--no-sandbox", "--disable-setuid-sandbox"] });
const ctxA = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
const alice = await ctxA.newPage();
alice.setDefaultTimeout(20000);
const roomName = "Mix Studio " + Math.floor(Math.random() * 9999);
try {
  log("Catalog and furniture tab");
  await loginToNewRoom(alice, "mixalice", "Aria", roomName);
  const cat = await alice.evaluate(() => window.HouseIso?.CATALOG?.musicmixer || null);
  check("The Music Mixer is a 1-tile furniture catalog item at 28 coins",
    cat?.name === "Music Mixer" && cat?.price === MIXER_PRICE && cat?.w === 1 && cat?.h === 1 && cat?.surface !== "wall", JSON.stringify(cat));

  await alice.evaluate(() => window.__debugKit({ coins: 200 }));
  await alice.evaluate(() => window.__openStore("furniture", "musicmixer"));
  await alice.waitForSelector('[data-testid="store-panel"]:not(.hidden)');
  const listed = await alice.evaluate(() => {
    const card = document.querySelector('[data-testid="store-item-musicmixer"]');
    return { has: Boolean(card), text: card?.textContent?.replace(/\s+/g, " ").trim(), buy: document.querySelector('[data-testid="store-buy"]')?.textContent };
  });
  check("The Furniture tab lists the Music Mixer at 28c",
    listed.has && listed.text.includes("Music Mixer") && (listed.text.includes("28c") || listed.buy?.includes("28")), JSON.stringify(listed));
  await alice.locator('[data-testid="store-item-musicmixer"]').click();
  await alice.locator('[data-testid="store-buy"]').click();
  const bought = await alice.waitForFunction(() => (window.__inventory?.() || []).includes("musicmixer"), null, { timeout: 8000 }).then(() => true).catch(() => false);
  check("Buying the mixer adds it to inventory", bought);
  await alice.evaluate(() => window.__closeStore?.());

  log("Place the mixer and a record table");
  await alice.evaluate(() => window.__debugKit({ furniture: ["recordplayer"] }));
  await alice.waitForFunction(() => (window.__inventory?.() || []).includes("recordplayer"));
  await alice.evaluate(() => {
    window.__enterEdit();
    window.__startPlace("musicmixer");
    window.__clickTile(3, 3);
  });
  await alice.waitForFunction(() => (window.HouseRoom3D?.getFurniture?.() || []).some((f) => f.type === "musicmixer"), null, { timeout: 8000 });
  await alice.evaluate(() => {
    window.__startPlace("recordplayer");
    window.__clickTile(1, 3);
  });
  const placed = await alice.waitForFunction(() => {
    const f = window.HouseRoom3D?.getFurniture?.() || [];
    return f.some((x) => x.type === "musicmixer") && f.some((x) => x.type === "recordplayer");
  }, null, { timeout: 8000 }).then(() => true).catch(() => false);
  check("The mixer and record table can be placed on floor tiles", placed);
  await alice.evaluate(() => window.__exitEdit?.());
  const ids = await alice.evaluate(() => {
    const f = window.HouseRoom3D.getFurniture() || [];
    return {
      mixer: f.find((x) => x.type === "musicmixer")?.id,
      table: f.find((x) => x.type === "recordplayer")?.id,
    };
  });

  log("Mix, save, and inventory");
  await alice.evaluate((id) => window.__openMixer(id), ids.mixer);
  await alice.waitForSelector('[data-testid="music-mixer"]:not(.hidden)', { timeout: 8000 });
  const ui = await alice.evaluate(() => {
    const steps = document.querySelectorAll("[data-drum-cell]").length;
    return {
      play: Boolean(document.querySelector('[data-testid="mixer-play"]')),
      stop: Boolean(document.querySelector('[data-testid="mixer-stop"]')),
      undo: Boolean(document.querySelector('[data-testid="mixer-undo"]')),
      clear: Boolean(document.querySelector('[data-testid="mixer-clear"]')),
      bpm: Boolean(document.querySelector('[data-testid="mixer-bpm"]')),
      drums: ["kick", "snare", "hat", "clap"].every((t) => document.querySelector(`[data-testid="mixer-row-${t}"]`)),
      steps,
      melody: Boolean(document.querySelector('[data-testid="mixer-melody"]')),
      presets: document.querySelectorAll("[data-testid^='mixer-preset-']").length,
      title: Boolean(document.querySelector('[data-testid="mixer-title"]')),
      save: Boolean(document.querySelector('[data-testid="mixer-save"]')),
      cancel: Boolean(document.querySelector('[data-testid="mixer-cancel"]')),
    };
  });
  check("The mixer UI is phone-friendly with a 16-step grid, drums, melody, tempo, Play, Save, and Cancel",
    ui.play && ui.stop && ui.undo && ui.clear && ui.bpm && ui.drums && ui.steps === MIXER_STEPS * 4
      && ui.melody && ui.presets >= 3 && ui.title && ui.save && ui.cancel, JSON.stringify(ui));

  await alice.fill('[data-testid="mixer-title"]', "Cube Beat");
  await alice.evaluate(() => window.__mixerLoadDemo("house"));
  await alice.locator('[data-testid="mixer-save"]').click();
  await alice.waitForFunction(() => (window.__inventory?.() || []).some((t) => String(t).startsWith("mix_vinyl_")), null, { timeout: 8000 });
  const afterSave = await alice.evaluate(() => {
    const inv = window.__inventory?.() || [];
    const type = inv.find((t) => String(t).startsWith("mix_vinyl_"));
    return {
      type,
      mix: window.__mixByType?.(type) || null,
      mixer: (window.HouseRoom3D.getFurniture() || []).find((f) => f.type === "musicmixer") || null,
      paintClosed: !window.__isMixerOpen?.(),
    };
  });
  check("Saving creates a titled record in inventory and keeps the pattern on the mixer",
    afterSave.type && afterSave.mix?.title === "Cube Beat" && afterSave.mixer?.pattern?.data && afterSave.paintClosed,
    JSON.stringify({ type: afterSave.type, title: afterSave.mix?.title, pattern: Boolean(afterSave.mixer?.pattern), closed: afterSave.paintClosed }));

  log("Inventory shows a label color and title");
  await alice.evaluate(() => window.__enterEdit());
  const invCard = await alice.evaluate((type) => {
    const btn = document.querySelector(`[data-testid="edit-item-${type}"]`);
    const thumb = btn?.querySelector("svg, [data-mix-thumb], canvas");
    return {
      has: Boolean(btn),
      text: btn?.textContent?.replace(/\s+/g, " ").trim() || "",
      thumb: Boolean(thumb),
    };
  }, afterSave.type);
  check("Inventory shows the record with a vinyl thumb and its title",
    invCard.has && invCard.thumb && invCard.text.includes("Cube Beat"), JSON.stringify(invCard));
  await alice.evaluate(() => window.__exitEdit?.());

  log("Select the mix on the record table");
  await alice.evaluate((id) => window.__openRecordPicker(id), ids.table);
  await alice.waitForSelector('[data-testid="record-picker"]:not(.hidden)');
  const onPicker = await alice.evaluate((type) => Boolean(document.querySelector(`[data-testid="record-vinyl-${type}"]`)), afterSave.type);
  check("The record picker lists the saved mix next to the built-in vinyls", onPicker);
  await alice.locator(`[data-testid="record-vinyl-${afterSave.type}"]`).click();
  const playing = await alice.waitForFunction((info) => {
    const rec = window.__recordPlayers?.()?.[info.table];
    return rec && rec.on && rec.vinyl === info.type && rec.pattern;
  }, { table: ids.table, type: afterSave.type }, { timeout: 8000 }).then(() => true).catch(() => false);
  const rec = await alice.evaluate((tableId) => window.__recordPlayers?.()?.[tableId] || null, ids.table);
  check("Selecting the mix on the record table plays the saved beat for the room",
    playing && rec?.on && rec?.vinyl === afterSave.type && rec?.title === "Cube Beat" && Boolean(rec?.pattern?.drums),
    JSON.stringify({ playing, vinyl: rec?.vinyl, title: rec?.title, on: rec?.on }));

  log("Visitor cannot mix, but hears the record");
  const ctxB = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
  const bob = await ctxB.newPage();
  bob.setDefaultTimeout(20000);
  await seedAndLogin(bob, "mixbob", BASE);
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
  const visitor = await bob.evaluate(() => {
    const recs = Object.values(window.__recordPlayers?.() || {});
    const playing = recs.find((r) => r.on);
    const mixer = (window.HouseRoom3D.getFurniture() || []).find((f) => f.type === "musicmixer");
    window.__clickFurniture(mixer.id, "musicmixer");
    return {
      vinyl: playing?.vinyl,
      title: playing?.title,
      pattern: Boolean(playing?.pattern),
      open: window.__isMixerOpen?.(),
    };
  });
  await bob.waitForTimeout(300);
  const stillClosed = await bob.evaluate(() => !window.__isMixerOpen?.());
  check("A visitor in the cube hears the mixed record playing on the table",
    visitor.pattern && visitor.title === "Cube Beat" && String(visitor.vinyl).startsWith("mix_vinyl_"), JSON.stringify(visitor));
  check("A visitor cannot open the owner's mixer to mix",
    stillClosed && visitor.open !== true, JSON.stringify(visitor));
  await ctxB.close();
} catch (err) {
  check("mixer e2e ran without throwing", false, String(err?.stack || err));
} finally {
  await browser.close();
  if (child) child.kill("SIGTERM");
}

const failed = results.filter((r) => !r.ok);
if (failed.length) {
  console.log(`\n${failed.length} mixer e2e check(s) failed`);
  process.exit(1);
}
console.log(`\nAll ${results.length} mixer e2e checks passed`);
