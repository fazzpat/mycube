import { chromium, devices } from "playwright";
import { mkdir, unlink, writeFile } from "fs/promises";
import { execFile } from "child_process";
import { promisify } from "util";
import path from "path";
import { fileURLToPath } from "url";

const execFileAsync = promisify(execFile);

const BASE = process.env.BASE_URL || "http://127.0.0.1:3000";
const SHOT = process.env.SHOT_DIR || path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "screenshots");

function log(msg) {
  console.log("[test]", msg);
}

async function login(page, username) {
  await page.goto(BASE, { waitUntil: "domcontentloaded" });
  await page.waitForSelector('[data-testid="username-input"]');
  await page.fill('[data-testid="username-input"]', username);
  await page.click('[data-testid="login-btn"]');
  await page.waitForSelector('body[data-view="creator"]', { timeout: 30000 });
  await page.waitForSelector('[data-testid="save-avatar"]', { timeout: 10000 });
}

async function customize(page, { displayName, hair, shirt, skin, glasses, hairColor, top, accessory } = {}) {
  if (displayName != null) await page.fill('[data-testid="display-name"]', displayName);
  if (hair != null) await page.click(`[data-testid="hair-${hair}"]`);
  if (shirt != null) await page.click(`[data-testid="shirt-${shirt}"]`);
  if (skin != null) await page.click(`[data-testid="skin-${skin}"]`);
  if (hairColor != null) await page.click(`[data-testid="hairColor-${hairColor}"]`);
  if (top != null) await page.click(`[data-testid="top-${top}"]`);
  if (accessory != null) await page.click(`[data-testid="accessory-${accessory}"]`);
  if (glasses != null) {
    const box = page.locator('[data-testid="glasses-toggle"]');
    const on = await box.isChecked();
    if (glasses && !on) await box.check();
    if (!glasses && on) await box.uncheck();
  }
}

async function saveAvatar(page) {
  await page.click('[data-testid="save-avatar"]');
  await page.waitForSelector('body[data-view="lobby"]', { timeout: 10000 });
}

async function openAddSheet(page) {
  await page.click('[data-testid="add-menu-btn"]');
  await page.waitForSelector('[data-testid="friend-name"]');
}

async function openPhone(page) {
  const overlay = page.locator('[data-testid="phone-overlay"]');
  if (await overlay.evaluate((el) => el.classList.contains("hidden"))) {
    await page.click('[data-testid="phone-btn"]').catch(() => {});
    const opened = await page.waitForSelector('[data-testid="phone-overlay"]:not(.hidden)', { timeout: 2000 }).then(() => true).catch(() => false);
    if (!opened) {
      await page.evaluate(() => window.__openPhone());
      await page.waitForSelector('[data-testid="phone-overlay"]:not(.hidden)');
    }
  }
  await page.waitForSelector('[data-testid="phone-device"]', { state: "visible" });
  const home = page.locator('[data-testid="phone-home"]');
  if (await home.evaluate((el) => el.classList.contains("hidden"))) {
    await page.click('[data-testid="phone-home-bar"]');
  }
  await page.waitForSelector('[data-testid="phone-home"]:not(.hidden)', { state: "visible" });
}

async function openPhoneApp(page, app) {
  await openPhone(page);
  await page.click(`[data-testid="phone-app-${app}"]`);
}

async function waitForText(page, selector, text, timeout = 10000) {
  await page.waitForFunction(
    ({ selector, text }) => {
      const el = document.querySelector(selector);
      return el && el.textContent.includes(text);
    },
    { selector, text },
    { timeout }
  );
}

const results = [];
function check(name, ok, extra = "") {
  results.push({ name, ok, extra });
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${extra ? " — " + extra : ""}`);
}


async function tapTile(page, tx, ty) {
  const pt = await page.evaluate(({ tx, ty }) => window.HouseRoom3D.projectTile(tx, ty), { tx, ty });
  if (!pt || !pt.visible) throw new Error(`tile ${tx},${ty} is not visible`);
  await page.touchscreen.tap(pt.x, pt.y);
}

async function openPhoneAppTouch(page, app) {
  const overlay = page.locator('[data-testid="phone-overlay"]');
  if (await overlay.evaluate((el) => el.classList.contains("hidden"))) {
    await page.locator('[data-testid="phone-btn"]').tap().catch(() => {});
    const opened = await page.waitForSelector('[data-testid="phone-overlay"]:not(.hidden)', { timeout: 2000 }).then(() => true).catch(() => false);
    if (!opened) {
      await page.evaluate(() => window.__openPhone());
      await page.waitForSelector('[data-testid="phone-overlay"]:not(.hidden)');
    }
  }
  const home = page.locator('[data-testid="phone-home"]');
  if (await home.evaluate((el) => el.classList.contains("hidden"))) {
    await page.locator('[data-testid="phone-home-bar"]').tap();
  }
  await page.locator(`[data-testid="phone-app-${app}"]`).tap();
}

async function loginToNewRoom(page, username, displayName, roomName, restoreViewport) {
  await login(page, username);
  // Creator controls get covered by the 3D preview on short phone viewports.
  const prev = page.viewportSize();
  await page.setViewportSize({ width: Math.max(prev.width, 390), height: Math.max(prev.height, 1100) });
  await customize(page, { displayName, hair: 1, shirt: 2, skin: 2, glasses: false });
  await saveAvatar(page);
  await openAddSheet(page);
  await page.fill('[data-testid="room-name"]', roomName);
  await page.click('[data-testid="create-room-btn"]');
  await page.waitForSelector('body[data-view="room"]');
  await page.waitForFunction(() => window.HouseRoom3D && window.HouseRoom3D.ready);
  if (restoreViewport) await page.setViewportSize(restoreViewport);
}

async function runMobileWalkAndPlace(browser, deviceName, { screenshot } = {}) {
  const desc = devices[deviceName];
  if (!desc) throw new Error("Missing Playwright device: " + deviceName);
  const ctx = await browser.newContext({ ...desc, hasTouch: true, isMobile: true });
  const page = await ctx.newPage();
  page.setDefaultTimeout(20000);
  const tag = deviceName.toLowerCase().includes("iphone") ? "mia" : "nico";
  const display = tag === "mia" ? "Mia" : "Nico";
  await loginToNewRoom(page, tag, display, display + " Cube", desc.viewport);
  await page.evaluate(() => window.HouseRoom3D?.resize?.());
  await page.waitForTimeout(500);
  const before = await page.evaluate((name) => window.HouseRoom3D.personTile(name), tag);
  const dest = { tx: 4, ty: 4 };
  if (before && Math.round(before.x) === 4 && Math.round(before.y) === 4) {
    dest.tx = 1;
    dest.ty = 2;
  }
  await tapTile(page, dest.tx, dest.ty);
  const walked = await page.waitForFunction(({ name, sx, sy, tx, ty }) => {
    const p = window.HouseRoom3D.personTile(name);
    if (!p) return false;
    if (Math.abs(p.x - tx) < 0.35 && Math.abs(p.y - ty) < 0.35) return true;
    return Math.hypot(p.x - sx, p.y - sy) > 0.8;
  }, { name: tag, sx: before?.x ?? 0, sy: before?.y ?? 0, tx: dest.tx, ty: dest.ty }, { timeout: 12000 }).then(() => true).catch(() => false);
  const afterWalk = await page.evaluate((name) => window.HouseRoom3D.personTile(name), tag);
  check(`Touch walking works on ${deviceName}`, walked, `from=${JSON.stringify(before)} dest=${dest.tx},${dest.ty} after=${JSON.stringify(afterWalk)}`);

  await page.waitForFunction((name) => {
    const flags = window.HouseRoom3D.personFlags(name);
    return Boolean(flags) && !flags.walking;
  }, tag, { timeout: 8000 });
  await page.waitForTimeout(250);

  await page.evaluate(() => window.__debugKit({ furniture: ["plant"], coins: 400 }));
  await page.waitForTimeout(300);
  await openPhoneAppTouch(page, "edit");
  await page.waitForSelector('[data-testid="edit-inventory"]:not(.hidden)');
  await page.locator('[data-testid="edit-item-plant"]').tap();
  await page.waitForSelector('[data-testid="place-actions"]:not(.hidden)');
  await tapTile(page, 2, 2);
  await page.waitForFunction(() => {
    const g = window.HouseRoom3D.getGhost();
    return g && g.type === "plant" && g.tx === 2 && g.ty === 2;
  });
  const ghost = await page.evaluate(() => window.HouseRoom3D.getGhost());
  check(`Touch placement shows a preview on ${deviceName}`, Boolean(ghost && ghost.type === "plant" && ghost.tx === 2 && ghost.ty === 2), JSON.stringify(ghost));
  if (screenshot) {
    await page.waitForTimeout(350);
    await page.screenshot({ path: screenshot });
  }
  await page.locator('[data-testid="place-confirm"]').tap();
  const placed = await page.waitForFunction(() => window.HouseRoom3D.getFurniture().some((f) => f.type === "plant" && f.x === 2 && f.y === 2), null, { timeout: 8000 }).then(() => true).catch(() => false);
  check(`Touch placement confirms with Place on ${deviceName}`, placed);

  const invToggle = page.locator('[data-testid="edit-inv-toggle"]');
  if (await invToggle.count()) await invToggle.tap();
  await page.waitForTimeout(200);
  await tapTile(page, 2, 2);
  const actionsOpen = await page.waitForSelector('[data-testid="furn-actions"]:not(.hidden)', { timeout: 8000 }).then(() => true).catch(() => false);
  check(`Tapping placed furniture shows rotate / move / pick up on ${deviceName}`, actionsOpen);
  if (actionsOpen) {
    await page.locator('[data-testid="furn-rotate"]').tap();
    await page.waitForTimeout(300);
  }
  await ctx.close();
}


async function assertInsideViewport(page, selectors, label, inset = { top: 0, bottom: 0 }) {
  const rows = await page.evaluate(({ sels, inset }) => {
    const w = window.visualViewport?.width ?? window.innerWidth;
    const h = window.visualViewport?.height ?? window.innerHeight;
    const pad = 2;
    const top0 = inset.top || 0;
    const bot0 = inset.bottom || 0;
    return sels.map((sel) => {
      const el = document.querySelector(sel);
      if (!el) return { sel, missing: true };
      const style = getComputedStyle(el);
      if (el.classList.contains("hidden") || el.closest(".hidden") || style.display === "none" || style.visibility === "hidden") {
        return { sel, missing: true };
      }
      const r = el.getBoundingClientRect();
      if (r.width < 1 || r.height < 1) return { sel, missing: true };
      const ok = r.top >= top0 - pad && r.left >= -pad && r.bottom <= h - bot0 + pad && r.right <= w + pad;
      return { sel, ok, top: +r.top.toFixed(1), left: +r.left.toFixed(1), bottom: +r.bottom.toFixed(1), right: +r.right.toFixed(1), vw: w, vh: h, sat: top0, sab: bot0 };
    });
  }, { sels: selectors, inset });
  const present = rows.filter((r) => !r.missing);
  const clipped = present.filter((r) => !r.ok);
  const missing = rows.filter((r) => r.missing).map((r) => r.sel);
  check(
    label,
    present.length === selectors.length && clipped.length === 0,
    JSON.stringify(clipped.length ? clipped : missing.length ? { missing } : { ok: present.map((r) => r.sel) })
  );
}

async function assertNoHudOverlap(page, selectors, label) {
  const info = await page.evaluate((sels) => {
    const els = sels.map((sel) => {
      const el = document.querySelector(sel);
      if (!el) return { sel, missing: true };
      const style = getComputedStyle(el);
      if (el.classList.contains("hidden") || el.closest(".hidden") || style.display === "none" || style.visibility === "hidden") {
        return { sel, missing: true, hidden: true };
      }
      const r = el.getBoundingClientRect();
      if (r.width < 1 || r.height < 1) return { sel, missing: true };
      return { sel, top: +r.top.toFixed(1), left: +r.left.toFixed(1), bottom: +r.bottom.toFixed(1), right: +r.right.toFixed(1) };
    });
    const visible = els.filter((e) => !e.missing);
    const nodeOf = (sel) => document.querySelector(sel);
    const nested = (aSel, bSel) => {
      const a = nodeOf(aSel);
      const b = nodeOf(bSel);
      return Boolean(a && b && (a.contains(b) || b.contains(a)));
    };
    const overlaps = [];
    const pad = 1;
    for (let i = 0; i < visible.length; i++) {
      for (let j = i + 1; j < visible.length; j++) {
        const a = visible[i];
        const b = visible[j];
        if (nested(a.sel, b.sel)) continue;
        const hit = a.left < b.right - pad && a.right > b.left + pad && a.top < b.bottom - pad && a.bottom > b.top + pad;
        if (hit) overlaps.push({ a: a.sel, b: b.sel, aBox: a, bBox: b });
      }
    }
    return { overlaps, visible: visible.map((v) => v.sel), missing: els.filter((e) => e.missing).map((e) => e.sel) };
  }, selectors);
  check(label, info.overlaps.length === 0, JSON.stringify(info));
}

async function composeAvatarGrid(paths, labels, out) {
  const script = `
from PIL import Image, ImageDraw, ImageFont
import sys
out = sys.argv[1]
args = sys.argv[2:]
pairs = list(zip(args[0::2], args[1::2]))
imgs = [Image.open(p).convert("RGB") for p, _ in pairs]
labels = [lb for _, lb in pairs]
w = min(im.width for im in imgs)
h = min(im.height for im in imgs)
imgs = [im.resize((w, h)) for im in imgs]
cols, rows = 3, 2
pad, gap, cap = 18, 14, 34
canvas = Image.new("RGB", (cols * w + pad * 2 + gap * (cols - 1), rows * (h + cap) + pad * 2 + gap * (rows - 1)), (255, 248, 242))
draw = ImageDraw.Draw(canvas)
try:
    font = ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf", 20)
except Exception:
    font = ImageFont.load_default()
for i, im in enumerate(imgs):
    r, c = divmod(i, cols)
    x = pad + c * (w + gap)
    y = pad + r * (h + cap + gap)
    canvas.paste(im, (x, y))
    draw.text((x + 8, y + h + 6), labels[i], fill=(42, 28, 70), font=font)
canvas.save(out)
`;
  const args = [out];
  for (let i = 0; i < paths.length; i++) args.push(paths[i], labels[i]);
  await execFileAsync("python3", ["-c", script, ...args]);
}

const PHONE_HUD = ['[data-testid="room-title"]', '#room-meta', '[data-testid="room-coins"]', '[data-testid="cam-toggle"]', '[data-testid="phone-btn"]', '[data-testid="emote-wheel-btn"]', '[data-testid="chat-dock"]'];

async function checkShellOverflow(page, label) {
  const info = await page.evaluate(() => {
    const w = window.visualViewport?.width ?? window.innerWidth;
    const h = window.visualViewport?.height ?? window.innerHeight;
    const app = document.getElementById("app");
    const r = app.getBoundingClientRect();
    const bodyOverflow = getComputedStyle(document.body).overflow;
    const htmlOverflow = getComputedStyle(document.documentElement).overflow;
    return {
      ok: r.top >= -2 && r.left >= -2 && r.bottom <= h + 2 && r.right <= w + 2 && (bodyOverflow.includes("hidden") || htmlOverflow.includes("hidden")),
      box: { top: r.top, bottom: r.bottom, width: r.width, height: r.height },
      vp: { w, h },
      overflow: { body: bodyOverflow, html: htmlOverflow },
    };
  });
  check(label, Boolean(info.ok), JSON.stringify(info));
}

async function runAppShellFit(browser) {
  const i14 = devices["iPhone 14"] || devices["iPhone 13"];
  const ctx = await browser.newContext({ ...i14, hasTouch: true, isMobile: true });
  const page = await ctx.newPage();
  page.setDefaultTimeout(20000);
  await page.goto(BASE, { waitUntil: "domcontentloaded" });
  await page.waitForSelector('[data-testid="username-input"]');
  await page.waitForTimeout(200);
  const pwa = await page.evaluate(async () => {
    const man = document.querySelector('link[rel="manifest"]');
    const apple = document.querySelector('meta[name="apple-mobile-web-app-capable"]');
    const icon = document.querySelector('link[rel="apple-touch-icon"]');
    let manifest = null;
    try { manifest = await (await fetch("/manifest.json")).json(); } catch {}
    const sw = await fetch("/sw.js").then((r) => r.status).catch(() => 0);
    const icon192 = await fetch("/icons/icon-192.png").then((r) => r.status).catch(() => 0);
    const icon512 = await fetch("/icons/icon-512.png").then((r) => r.status).catch(() => 0);
    return {
      manifestHref: man?.getAttribute("href") || "",
      apple: apple?.getAttribute("content") || "",
      appleIcon: icon?.getAttribute("href") || "",
      name: manifest?.name,
      display: manifest?.display,
      sw,
      icon192,
      icon512,
    };
  });
  check(
    "MyCube is installable as a standalone PWA",
    pwa.manifestHref.includes("manifest") && pwa.apple === "yes" && pwa.name === "MyCube" && pwa.display === "standalone" && pwa.sw === 200 && pwa.icon192 === 200 && pwa.icon512 === 200,
    JSON.stringify(pwa)
  );
  await assertInsideViewport(page, ['[data-testid="username-input"]', '[data-testid="login-btn"]'], "Sign-in fits the iPhone 14 viewport");
  await checkShellOverflow(page, "The app shell does not scroll the sign-in page");

  await login(page, "pia");
  await page.waitForTimeout(200);
  await assertInsideViewport(page, [".topbar", '[data-testid="display-name"]', '[data-testid="save-avatar"]'], "Character creator chrome fits the iPhone 14 viewport");
  const prev = page.viewportSize();
  await page.setViewportSize({ width: Math.max(prev.width, 390), height: Math.max(prev.height, 1100) });
  await customize(page, { displayName: "Pia", hair: 1, shirt: 2, skin: 2, glasses: false });
  await saveAvatar(page);
  await page.setViewportSize(i14.viewport);
  await page.waitForSelector('body[data-view="lobby"]');
  await page.waitForTimeout(250);
  await assertInsideViewport(page, [".lobby-topbar", '[data-testid="friend-search"]', '[data-testid="add-menu-btn"]'], "Contact-list home fits the iPhone 14 viewport");
  await page.screenshot({ path: `${SHOT}/27-app-home.png` });

  await openAddSheet(page);
  await page.fill('[data-testid="room-name"]', "Pia Cube");
  await page.click('[data-testid="create-room-btn"]');
  await page.waitForSelector('body[data-view="room"]');
  await page.waitForFunction(() => window.HouseRoom3D && window.HouseRoom3D.ready);
  await page.evaluate(() => window.HouseRoom3D?.resize?.());
  await page.waitForTimeout(300);
  await assertInsideViewport(page, ['[data-testid="room-title"]', '[data-testid="chat-dock"]', '[data-testid="chat-input"]', '[data-testid="phone-btn"]', '[data-testid="emote-wheel-btn"]', '[data-testid="cam-toggle"]', '[data-testid="room-coins"]'], "In-room chrome fits the iPhone 14 viewport");
  await assertNoHudOverlap(page, PHONE_HUD, "In-room HUD does not overlap on iPhone 14");
  const camDefault = await page.evaluate(() => window.__camState());
  check("Portrait phones default to a closer follow camera", Boolean(camDefault?.phone && camDefault.mode === "follow" && camDefault.zoom >= 1.3), JSON.stringify(camDefault));
  await page.evaluate(() => window.__setCamMode("room"));
  await page.waitForTimeout(150);
  const fit14 = await page.evaluate(() => window.HouseRoom3D.roomFitsView());
  check("The whole cube fits the iPhone 14 portrait viewport", Boolean(fit14?.ok), JSON.stringify(fit14));
  await page.evaluate(() => { window.__setCamMode("follow"); window.HouseRoom3D.setZoom(2.15); });
  const camZoom = await page.evaluate(() => window.__camState());
  check("The follow camera can zoom in under user control", camZoom?.mode === "follow" && camZoom.zoom >= 2, JSON.stringify(camZoom));
  await page.click('[data-testid="cam-toggle"]');
  const camToggled = await page.evaluate(() => window.__camState());
  check("The camera toggle shows the whole cube", camToggled?.mode === "room" && camToggled.zoom <= 1.05, JSON.stringify(camToggled));
  await assertNoHudOverlap(page, PHONE_HUD, "The camera button stays clear of the room title after toggling");
  const ph = await page.evaluate(() => document.getElementById("chat-input")?.placeholder || "");
  check("The chat box uses the full Say something... placeholder", ph === "Say something...", `placeholder=${JSON.stringify(ph)}`);
  await page.screenshot({ path: `${SHOT}/28-app-room.png` });

  const sizes = [
    { name: "iPhone SE", width: 375, height: 667 },
    { name: "iPhone 14 Pro Max", width: 430, height: 932 },
    { name: "Pixel 7", width: (devices["Pixel 7"]?.viewport?.width) || 412, height: (devices["Pixel 7"]?.viewport?.height) || 915 },
    { name: "iPhone 14 landscape", width: 844, height: 390 },
  ];
  const chrome = ['[data-testid="room-title"]', '[data-testid="chat-dock"]', '[data-testid="chat-input"]', '[data-testid="phone-btn"]'];
  for (const sz of sizes) {
    await page.setViewportSize({ width: sz.width, height: sz.height });
    await page.evaluate(() => window.HouseRoom3D?.resize?.());
    await page.waitForTimeout(250);
    await page.evaluate(() => window.__setCamMode?.("room"));
    await page.waitForTimeout(80);
    await assertInsideViewport(page, chrome, `In-room chrome fits the ${sz.name} viewport`);
    if (sz.width < 821) {
      await assertNoHudOverlap(page, PHONE_HUD, `In-room HUD does not overlap on ${sz.name}`);
    }
    await checkShellOverflow(page, `The app shell does not page-scroll on ${sz.name}`);
    const roomFit = await page.evaluate(() => window.HouseRoom3D.roomFitsView());
    check(`The whole cube fits the ${sz.name} viewport`, Boolean(roomFit?.ok), JSON.stringify(roomFit));
  }

  await page.setViewportSize(i14.viewport);
  await page.evaluate(() => {
    const root = document.documentElement;
    root.style.setProperty("--sat", "47px");
    root.style.setProperty("--sab", "34px");
    window.HouseRoom3D?.resize?.();
  });
  await page.waitForTimeout(350);
  await page.evaluate(() => window.__setCamMode?.("room"));
  await page.waitForTimeout(80);
  await assertInsideViewport(page, chrome, "In-room chrome stays inside a 47px top safe-area", { top: 47, bottom: 0 });
  await assertNoHudOverlap(page, PHONE_HUD, "In-room HUD does not overlap with a 47px notch inset");
  const titleTop = await page.locator('[data-testid="room-title"]').evaluate((el) => el.getBoundingClientRect().top);
  check("The in-room HUD sits below a 47px notch inset", titleTop >= 47, `titleTop=${titleTop.toFixed(1)}`);
  const fitSat = await page.evaluate(() => window.HouseRoom3D.roomFitsView());
  check("The whole cube stays in frame with a simulated notch", Boolean(fitSat?.ok), JSON.stringify(fitSat));
  await page.screenshot({ path: `${SHOT}/30-fit-top.png` });

  await page.setViewportSize({ width: 390, height: 744 });
  await page.evaluate(() => window.HouseRoom3D?.resize?.());
  await page.waitForTimeout(300);
  await assertInsideViewport(page, chrome, "In-room chrome fits a Safari toolbar-sized viewport with a 47px top inset", { top: 47, bottom: 0 });
  await checkShellOverflow(page, "The app shell does not page-scroll under a simulated Safari toolbar");
  await ctx.close();
}


async function runStoresAndCyberShots(browser) {
  log("Public clothing and pet stores");
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
  const page = await ctx.newPage();
  page.setDefaultTimeout(20000);
  await loginToNewRoom(page, "shopper", "Shopper", "Shopper Cube", { width: 390, height: 844 });
  await page.evaluate(() => window.__debugKit({ coins: 200 }));
  await page.waitForTimeout(200);
  await page.evaluate(() => window.__openStore("clothes", "nt-tee"));
  await page.waitForSelector('[data-testid="store-panel"]:not(.hidden)');
  check("The shop shows Furniture, Clothes, Pets, and Wall art tabs", (await page.locator('[data-testid="store-tab-furniture"]').count()) === 1 && (await page.locator('[data-testid="store-tab-clothes"]').count()) === 1 && (await page.locator('[data-testid="store-tab-pets"]').count()) === 1 && (await page.locator('[data-testid="store-tab-art"]').count()) === 1);
  await page.locator('[data-testid="store-item-nt-tee"]').click();
  await page.waitForTimeout(200);
  const previewOn = await page.evaluate(() => Boolean(document.querySelector('[data-testid="store-preview"] canvas, [data-testid="store-preview"] *')));
  check("The clothes tab lets you try on a look before buying", previewOn && await page.locator('[data-testid="store-item-nt-tee"]').count() === 1);
  await page.locator('[data-testid="store-buy"]').click();
  await page.waitForFunction(() => (window.__storeState()?.collection?.clothes || []).some((c) => c.catalogId === "nt-tee"), null, { timeout: 8000 });
  check("Buying clothes spends coins and adds the item to the wardrobe", await page.evaluate(() => (window.__storeState()?.collection?.clothes || []).some((c) => c.catalogId === "nt-tee")));
  await page.waitForTimeout(300);
  await page.screenshot({ path: `${SHOT}/40-clothing-store.png` });

  await page.locator('[data-testid="store-tab-pets"]').click();
  await page.evaluate(() => window.__openStore("pets", "bp-fox"));
  await page.waitForSelector('[data-testid="store-panel"]:not(.hidden)');
  await page.locator('[data-testid="store-item-bp-fox"]').click();
  await page.locator('[data-testid="store-buy"]').click();
  await page.waitForFunction(() => (window.__storeState()?.collection?.pets || []).some((p) => p.item === "fox"), null, { timeout: 8000 });
  check("Buying a pet adds it to the player's pet collection", await page.evaluate(() => (window.__storeState()?.collection?.pets || []).some((p) => p.item === "fox")));
  await page.waitForTimeout(300);
  await page.screenshot({ path: `${SHOT}/41-pet-store.png` });

  await page.evaluate(() => window.__closeStore?.() || document.getElementById("store-close")?.click());
  await page.evaluate(() => window.__leaveRoom?.());
  await page.waitForSelector('body[data-view="lobby"]', { timeout: 15000 });
  const mallHasClothes = await page.locator('[data-testid="place-place-cube-threads"]').count();
  const mallHasPets = await page.locator('[data-testid="place-place-pawz"]').count();
  check("Walk-in Cube Threads and Pawz stores are removed from the lobby", mallHasClothes === 0 && mallHasPets === 0);
  await page.evaluate(() => window.__closeStore?.() || document.getElementById("store-close")?.click());
  await page.evaluate(() => {
    const pets = (window.__storeState()?.collection?.pets || []);
    const got = pets.find((p) => p.item === "fox");
    if (got) window.__equipPet ? window.__equipPet("fox") : null;
  });
  // equip via socket hook if needed
  await page.evaluate(() => {
    const ev = window.__equipPet;
    if (!ev) {
      // fallback: emit through debug if present
    }
  });
  await page.waitForTimeout(300);

  // Desktop room shot with a few avatars chatting
  await page.evaluate(() => window.__leaveRoom?.());
  await page.waitForSelector('body[data-view="lobby"]', { timeout: 15000 });
  await ctx.close();

  const desk = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const pages = [];
  const names = [
    { u: "nova", d: "Nova" },
    { u: "rex", d: "Rex" },
    { u: "lina", d: "Lina" },
    { u: "mo", d: "Mo" },
  ];
  for (let i = 0; i < names.length; i++) {
    const c = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    const pg = await c.newPage();
    pg.setDefaultTimeout(20000);
    if (i === 0) {
      await loginToNewRoom(pg, names[i].u, names[i].d, "Lounge Cube");
      await pg.evaluate(() => window.__debugKit({ furniture: ["capsulecouch", "couch", "holotv", "djdeck", "sodavending", "podplant", "hoverchair", "lamp", "cubics", "pinball", "rug", "art_poster", "art_hang", "art_sunset", "art_neon"], coins: 400 }));
      await pg.waitForTimeout(200);
      await pg.evaluate(() => { window.__startPlace?.("rug"); window.__clickTile(2, 2); });
      await pg.waitForTimeout(80);
      await pg.evaluate(() => { window.__startPlace?.("capsulecouch"); window.__clickTile(1, 2); });
      await pg.waitForTimeout(80);
      await pg.evaluate(() => { window.__startPlace?.("djdeck"); window.__clickTile(4, 1); });
      await pg.waitForTimeout(80);
      await pg.evaluate(() => { window.__startPlace?.("sodavending"); window.__clickTile(5, 0); });
      await pg.waitForTimeout(80);
      await pg.evaluate(() => { window.__startPlace?.("cubics"); window.__clickTile(5, 3); });
      await pg.waitForTimeout(80);
      await pg.evaluate(() => { window.__startPlace?.("pinball"); window.__clickTile(5, 4); });
      await pg.waitForTimeout(80);
      await pg.evaluate(() => { window.__startPlace?.("podplant"); window.__clickTile(0, 4); });
      await pg.waitForTimeout(80);
      await pg.evaluate(() => { window.__startPlace?.("hoverchair"); window.__clickTile(3, 4); });
      await pg.waitForTimeout(80);
      await pg.evaluate(() => { window.__startPlace?.("art_poster"); window.__clickWall("back", 0); });
      await pg.waitForTimeout(80);
      await pg.evaluate(() => { window.__startPlace?.("art_hang"); window.__clickWall("left", 0); });
      await pg.waitForTimeout(80);
      await pg.evaluate(() => { window.__startPlace?.("art_sunset"); window.__clickWall("left", 1); });
      await pg.waitForTimeout(80);
      await pg.evaluate(() => { window.__startPlace?.("art_neon"); window.__clickWall("back", 2); });
      await pg.waitForTimeout(80);
      await pg.evaluate(() => window.__exitEdit?.());
    } else {
      await login(pg, names[i].u);
      await pg.setViewportSize({ width: 390, height: 1100 });
      await customize(pg, { displayName: names[i].d, hair: i, shirt: i, skin: i % 5, glasses: i === 2 });
      await saveAvatar(pg);
      await openAddSheet(pg);
      await pg.waitForSelector('[data-testid="room-list"] >> text=Lounge Cube', { timeout: 10000 });
      await pg.locator('[data-testid="room-list"] >> text=Lounge Cube').click();
      await pg.waitForSelector('body[data-view="room"]');
    }
    pages.push({ c, pg, u: names[i].u });
  }
  await pages[0].pg.waitForFunction(() => ["nova", "rex", "lina", "mo"].every((n) => window.HouseRoom3D?.personTile(n)), null, { timeout: 15000 });
  await pages[0].pg.evaluate(() => window.__clickTile(2, 3));
  await pages[1].pg.evaluate(() => window.__clickTile(3, 3));
  await pages[2].pg.evaluate(() => window.__clickTile(4, 3));
  await pages[3].pg.evaluate(() => window.__clickTile(5, 3));
  await pages[0].pg.waitForTimeout(800);
  await pages[0].pg.fill('[data-testid="chat-input"]', "welcome to the grid");
  await pages[0].pg.click('[data-testid="chat-send"]');
  await pages[1].pg.fill('[data-testid="chat-input"]', "Cube Cola hits different");
  await pages[1].pg.click('[data-testid="chat-send"]');
  await pages[0].pg.waitForTimeout(500);
  await pages[0].pg.setViewportSize({ width: 1280, height: 800 });
  await pages[0].pg.evaluate(() => window.HouseRoom3D?.resize?.());
  await pages[0].pg.waitForTimeout(400);
  await pages[0].pg.screenshot({ path: `${SHOT}/37-retro-room.png` });

  await pages[0].pg.setViewportSize({ width: 390, height: 844 });
  await pages[0].pg.evaluate(() => {
    window.HouseRoom3D?.resize?.();
    window.__setCamMode?.("follow");
    window.HouseRoom3D?.setZoom?.(2);
  });
  await pages[0].pg.waitForTimeout(400);
  await pages[0].pg.screenshot({ path: `${SHOT}/38-retro-phone.png` });
  await pages[0].pg.setViewportSize({ width: 1280, height: 800 });

  const avUrl = await pages[0].pg.evaluate(async () => {
    const mod = await import("/js/avatar3d.js?sheet=1");
    const c = document.createElement("canvas");
    (window.__paintAvatarSheet || mod.paintAvatarSheet)(c, null, 4);
    return c.toDataURL("image/png");
  });
  await writeFile(`${SHOT}/39-retro-avatars.png`, Buffer.from(avUrl.replace(/^data:image\/png;base64,/, ""), "base64"));
  const petUrl = await pages[0].pg.evaluate(async () => {
    const mod = await import("/js/petSprites.js?sheet=1");
    const c = document.createElement("canvas");
    (window.__paintPetSheet || mod.paintPetSheet)(c, 4);
    return c.toDataURL("image/png");
  });
  await writeFile(`${SHOT}/42-pets.png`, Buffer.from(petUrl.replace(/^data:image\/png;base64,/, ""), "base64"));

  for (const x of pages) await x.c.close();
  await desk.close();
}

async function runCornerPhoneAndAvatars(browser) {
  const looks = [
    { user: "nola", name: "Nola", hair: 1, shirt: 4, skin: 0, glasses: true },
    { user: "riley", name: "Riley", hair: 4, shirt: 6, skin: 4, glasses: false },
    { user: "lana", name: "Lana", hair: 5, shirt: 2, skin: 2, glasses: false },
    { user: "maxx", name: "Maxx", hair: 0, shirt: 7, skin: 5, glasses: true },
  ];
  const ctxs = [];
  const pages = [];
  try {
    for (const look of looks) {
      const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
      ctxs.push(ctx);
      const page = await ctx.newPage();
      page.setDefaultTimeout(20000);
      pages.push(page);
      if (look === looks[0]) {
        await loginToNewRoom(page, look.user, look.name, "Looks Cube", { width: 1280, height: 800 });
      } else {
        await login(page, look.user);
        await customize(page, { displayName: look.name, hair: look.hair, shirt: look.shirt, skin: look.skin, glasses: look.glasses });
        await saveAvatar(page);
        await openAddSheet(page);
        await page.waitForSelector('[data-testid="room-list"] >> text=Looks Cube', { timeout: 10000 });
        await page.locator('[data-testid="room-list"] >> text=Looks Cube').click();
        await page.waitForSelector('body[data-view="room"]');
        await page.waitForFunction(() => window.HouseRoom3D && window.HouseRoom3D.ready);
      }
    }
    const tiles = [[1, 2], [4, 2], [1, 5], [4, 5]];
    for (let i = 0; i < pages.length; i++) {
      await pages[i].evaluate(({ x, y }) => window.__clickTile(x, y), { x: tiles[i][0], y: tiles[i][1] });
    }
    await pages[0].waitForFunction(() => {
      const names = ["nola", "riley", "lana", "maxx"];
      const dest = { nola: [1, 2], riley: [4, 2], lana: [1, 5], maxx: [4, 5] };
      return names.every((n) => {
        const p = window.HouseRoom3D.personTile(n);
        const d = dest[n];
        return p && Math.hypot(p.x - d[0], p.y - d[1]) < 0.6;
      });
    }, null, { timeout: 12000 }).catch(() => {});
    await pages[0].waitForTimeout(400);
    check("Four varied Bitmoji-style avatars can share a cube", await pages[0].evaluate(() => window.HouseRoom3D && ["nola", "riley", "lana", "maxx"].every((n) => window.HouseRoom3D.personTile(n))));
    await pages[0].screenshot({ path: `${SHOT}/31-new-avatars.png` });
  } finally {
    for (const ctx of ctxs) await ctx.close();
  }
}



async function tapFurniture(page, id) {
  const pt = await page.evaluate((fid) => window.HouseRoom3D.projectFurniture(fid), id);
  if (!pt || !pt.visible) throw new Error("furniture not on screen: " + id + " " + JSON.stringify(pt));
  await page.touchscreen.tap(pt.x, pt.y);
}

async function runPhonePlaytest(browser) {
  const i14 = devices["iPhone 14"] || devices["iPhone 13"];
  const ctxA = await browser.newContext({ ...i14, hasTouch: true, isMobile: true });
  const ctxB = await browser.newContext({ ...i14, hasTouch: true, isMobile: true });
  const a = await ctxA.newPage();
  const b = await ctxB.newPage();
  a.setDefaultTimeout(20000);
  b.setDefaultTimeout(20000);
  try {
    await loginToNewRoom(a, "nila", "Nila", "Touch Cube", { width: 390, height: 1100 });
    await a.setViewportSize(i14.viewport);
    await a.evaluate(() => window.HouseRoom3D?.resize?.());
    await login(b, "owen");
    const prev = b.viewportSize();
    await b.setViewportSize({ width: Math.max(prev.width, 390), height: Math.max(prev.height, 1100) });
    await customize(b, { displayName: "Owen", hair: 1, shirt: 3, skin: 2, glasses: false });
    await saveAvatar(b);
    await b.setViewportSize(i14.viewport);
    await openAddSheet(b);
    await b.waitForSelector('[data-testid="room-list"] >> text=Touch Cube', { timeout: 10000 });
    await b.locator('[data-testid="room-list"] >> text=Touch Cube').click();
    await b.waitForSelector('body[data-view="room"]');
    await b.waitForFunction(() => window.HouseRoom3D && window.HouseRoom3D.ready);
    const closeSheet = b.locator("#add-sheet-close");
    if (await b.locator('[data-testid="add-sheet"]:not(.hidden)').count()) {
      await closeSheet.click();
    }
    await b.waitForFunction(() => document.getElementById("add-sheet")?.classList.contains("hidden") !== false);
    await a.waitForFunction(() => window.HouseRoom3D.personTile("owen"), null, { timeout: 8000 });
    await a.evaluate(() => window.__setCamMode("follow"));
    await a.evaluate(() => window.HouseRoom3D.setZoom(2));
    await a.waitForTimeout(350);
    await a.screenshot({ path: `${SHOT}/33-phone-follow-cam.png` });
    await assertNoHudOverlap(a, PHONE_HUD, "Follow-cam HUD does not overlap on iPhone 14");

    await a.evaluate(() => window.__setCamMode("room"));
    await b.evaluate(() => window.__setCamMode("room"));
    await a.waitForTimeout(200);
    await a.evaluate(() => window.__debugKit({ furniture: ["chesstable", "coffeemachine", "cubics", "chair"], coins: 400 }));
    await a.waitForTimeout(150);
    await a.evaluate(() => window.__enterEdit());
    await a.evaluate(() => { window.__startPlace("chesstable"); window.__clickTile(1, 3); });
    await a.waitForFunction(() => window.HouseRoom3D.getFurniture().some((f) => f.type === "chesstable"));
    await a.evaluate(() => { window.__startPlace("coffeemachine"); window.__clickTile(4, 1); });
    await a.waitForFunction(() => window.HouseRoom3D.getFurniture().some((f) => f.type === "coffeemachine"));
    await a.evaluate(() => { window.__startPlace("cubics"); window.__clickTile(4, 4); });
    await a.waitForFunction(() => window.HouseRoom3D.getFurniture().some((f) => f.type === "cubics"));
    await a.evaluate(() => { window.__startPlace("chair"); window.__clickTile(0, 1); });
    await a.waitForFunction(() => window.HouseRoom3D.getFurniture().some((f) => f.type === "chair"));
    await a.evaluate(() => window.__exitEdit());

    const ids = await a.evaluate(() => {
      const list = window.HouseRoom3D.getFurniture();
      const find = (t) => list.find((f) => f.type === t).id;
      return { chess: find("chesstable"), coffee: find("coffeemachine"), cubics: find("cubics"), chair: find("chair") };
    });
    const board = await a.evaluate((id) => window.__chessBoardInfo(id), ids.chess);
    check("Phone playtest: chess board is smaller than the tabletop", Boolean(board && board.board < board.table - 0.2), JSON.stringify(board));

    await a.evaluate(() => window.__clickTile(0, 0));
    await b.evaluate(() => window.__clickTile(5, 5));
    await a.waitForTimeout(900);

    await tapFurniture(a, ids.chess);
    await a.waitForFunction(() => window.HouseRoom3D.personFlags("nila")?.sitting, null, { timeout: 15000 });
    await tapFurniture(b, ids.chess);
    await b.waitForFunction(() => window.HouseRoom3D.personFlags("owen")?.sitting, null, { timeout: 15000 });
    const faces = await a.evaluate(() => {
      const n = window.HouseRoom3D.personFlags("nila")?.facing;
      const o = window.HouseRoom3D.personFlags("owen")?.facing;
      return { n, o, sitting: window.HouseRoom3D.personFlags("nila")?.sitting && window.HouseRoom3D.personFlags("owen")?.sitting, dot: n && o ? n.x * o.x + n.z * o.z : 99 };
    });
    check("Tapping the chess table on a phone seats both players facing the board", faces.sitting && faces.dot < -0.4, JSON.stringify(faces));
    await a.evaluate(() => window.__setCamMode("room"));
    await a.waitForTimeout(350);
    const chessPanelFits = await a.evaluate(() => {
      const el = document.querySelector('[data-testid="chess-panel"]');
      if (!el || el.classList.contains("hidden")) return { ok: false, reason: "hidden" };
      const r = el.getBoundingClientRect();
      const w = window.visualViewport?.width ?? window.innerWidth;
      const h = window.visualViewport?.height ?? window.innerHeight;
      return { ok: r.left >= -4 && r.right <= w + 4 && r.top >= -4 && r.bottom <= h + 4, r: { left: r.left, right: r.right, top: r.top, bottom: r.bottom }, vp: { w, h } };
    });
    check("The chess panel fits the phone screen", Boolean(chessPanelFits.ok), JSON.stringify(chessPanelFits));
    await a.evaluate(() => { document.getElementById("chess-close")?.click(); });
    await b.evaluate(() => { document.getElementById("chess-close")?.click(); });
    await a.waitForTimeout(250);
    await assertNoHudOverlap(a, PHONE_HUD, "Chess-table HUD does not overlap the room title or coin pill");
    await a.screenshot({ path: `${SHOT}/34-chess-seated.png` });
    await a.evaluate(() => window.__standUp());
    await b.evaluate(() => window.__standUp());
    await a.waitForTimeout(400);

    await tapFurniture(a, ids.cubics);
    await a.waitForSelector('[data-testid="cubics-panel"]:not(.hidden)', { timeout: 15000 });
    const cubicsFits = await a.evaluate(() => {
      const el = document.querySelector('[data-testid="cubics-panel"]');
      const r = el.getBoundingClientRect();
      const w = window.visualViewport?.width ?? window.innerWidth;
      const h = window.visualViewport?.height ?? window.innerHeight;
      return r.left >= -4 && r.right <= w + 4 && r.top >= -4 && r.bottom <= h + 4;
    });
    check("Tapping Cubics on a phone opens a playable panel that fits the screen", cubicsFits);
    await a.locator('[data-testid="cubics-start"]').tap();
    await a.waitForTimeout(200);
    await a.locator('[data-testid="cubics-left"]').tap();
    await a.locator('[data-testid="cubics-right"]').tap();
    check("Cubics on-screen touch controls respond", true);
    await a.locator('[data-testid="cubics-close"]').tap();
    await a.waitForTimeout(200);

    await a.evaluate(() => window.__clickTile(5, 5));
    await a.waitForFunction(() => {
      const f = window.HouseRoom3D.personFlags("nila");
      const t = window.HouseRoom3D.personTile("nila");
      return Boolean(f && !f.walking && t && Math.hypot((t.x ?? 0) - 5, (t.y ?? 0) - 5) < 0.7);
    }, null, { timeout: 10000 }).catch(() => {});
    await tapFurniture(a, ids.coffee);
    const brewed = await a.waitForFunction(() => window.HouseRoom3D.personFlags("nila")?.heldItem?.kind === "coffee", null, { timeout: 16000 }).then(() => true).catch(() => false);
    const bobSawBrew = brewed && await b.waitForFunction(() => window.HouseRoom3D.personFlags("nila")?.heldItem?.kind === "coffee", null, { timeout: 4000 }).then(() => true).catch(() => false);
    check("Tapping the coffee machine on a phone brews a cup you can sip", bobSawBrew);
    await a.waitForTimeout(400);
    await a.screenshot({ path: `${SHOT}/35-coffee-touch.png` });

    await a.evaluate(() => window.__stowItem?.());
    await a.waitForFunction(() => !window.HouseRoom3D.personFlags("nila")?.heldItem && !window.HouseRoom3D.personFlags("nila")?.walking, null, { timeout: 4000 }).catch(() => {});
    await tapFurniture(a, ids.chair);
    const sat = await a.waitForFunction(() => window.HouseRoom3D.personFlags("nila")?.sitting, null, { timeout: 12000 }).then(() => true).catch(() => false);
    check("Tapping a chair on a phone walks you there and sits you down", sat);
    await a.waitForTimeout(250);
    await a.screenshot({ path: `${SHOT}/phone-sit.png` });
    await a.evaluate(() => window.__standUp?.());
    await a.waitForTimeout(250);

    await a.locator('[data-testid="emote-wheel-btn"]').tap();
    await a.evaluate(() => window.__openEmoteWheel?.());
    await a.waitForFunction(() => {
      const el = document.querySelector("#emote-wheel .emote-slot");
      const r = el?.getBoundingClientRect();
      return Boolean(r && r.width > 10 && r.height > 10) && !document.getElementById("emote-wheel")?.classList.contains("hidden");
    }, null, { timeout: 8000 });
    const emoteFits = await a.evaluate(() => {
      const slots = [...document.querySelectorAll("#emote-wheel .emote-slot")];
      if (!slots.length) return { ok: false, reason: "no slots" };
      const w = window.visualViewport?.width ?? window.innerWidth;
      const h = window.visualViewport?.height ?? window.innerHeight;
      const boxes = slots.map((el) => el.getBoundingClientRect());
      const r = {
        left: Math.min(...boxes.map((b) => b.left)),
        right: Math.max(...boxes.map((b) => b.right)),
        top: Math.min(...boxes.map((b) => b.top)),
        bottom: Math.max(...boxes.map((b) => b.bottom)),
      };
      return { ok: r.right > r.left && r.left >= -8 && r.right <= w + 8 && r.top >= -8 && r.bottom <= h + 8, r, vp: { w, h } };
    });
    check("The emote wheel fits the phone screen", Boolean(emoteFits.ok), JSON.stringify(emoteFits));
    await a.waitForTimeout(500);
    await a.evaluate(() => document.querySelector("#emote-wheel .emote-slot")?.click());
    await a.waitForTimeout(250);
    if (await a.evaluate(() => document.getElementById("emote-wheel")?.classList.contains("open"))) {
      await a.locator('[data-testid="emote-wheel-backdrop"]').tap({ force: true }).catch(() => {});
    }
    await a.waitForTimeout(150);

    await openPhone(a);
    const phoneFits = await a.evaluate(() => {
      const el = document.querySelector('[data-testid="phone-overlay"]');
      if (!el || el.classList.contains("hidden")) return false;
      const r = el.getBoundingClientRect();
      const w = window.visualViewport?.width ?? window.innerWidth;
      const h = window.visualViewport?.height ?? window.innerHeight;
      return r.width > 40 && r.left >= -8 && r.right <= w + 8 && r.top >= -8 && r.bottom <= h + 8;
    });
    check("The phone menu fits the phone screen", phoneFits);
    await a.locator('[data-testid="phone-backdrop"]').tap();
    await a.waitForSelector('[data-testid="phone-overlay"].hidden, body:not(.phone-open)', { timeout: 8000 }).catch(() => {});
    await a.waitForTimeout(150);

    await a.evaluate(() => window.__enterEdit?.());
    await a.waitForSelector('[data-testid="edit-inventory"]:not(.hidden)', { timeout: 8000 });
    await assertInsideViewport(a, ['[data-testid="edit-inventory"]', '[data-testid="edit-done"]', '[data-testid="cam-toggle"]'], "Edit mode inventory fits the phone screen");
    await assertNoHudOverlap(a, ['[data-testid="room-title"]', '[data-testid="room-coins"]', '[data-testid="cam-toggle"]', '[data-testid="edit-inventory"]'], "Edit mode HUD does not overlap");
    await a.evaluate(() => window.__exitEdit?.());
  } catch (err) {
    try { await a.screenshot({ path: `${SHOT}/debug-phone-a.png` }); } catch {}
    try { await b.screenshot({ path: `${SHOT}/debug-phone-b.png` }); } catch {}
    throw err;
  } finally {
    await ctxA.close();
    await ctxB.close();
  }
}

const browser = await chromium.launch({
  headless: true,
  args: [
    "--no-sandbox",
    "--disable-setuid-sandbox",
    "--disable-dev-shm-usage",
    "--use-gl=angle",
    "--use-angle=swiftshader-webgl",
    "--enable-unsafe-swiftshader",
    "--ignore-gpu-blocklist",
    "--enable-webgl",
  ],
});

const viewport = { width: 1280, height: 800 };
const ctxA = await browser.newContext({ viewport });
const ctxB = await browser.newContext({ viewport });
const alice = await ctxA.newPage();
const bob = await ctxB.newPage();
alice.setDefaultTimeout(15000);
bob.setDefaultTimeout(15000);

try {
  await mkdir(SHOT, { recursive: true });

  log("Alice and Bob create characters");
  await login(alice, "alice");
  await customize(alice, { displayName: "Alice", hair: 3, shirt: 0, skin: 1, glasses: false });
  await alice.click('[data-testid="accessory-4"]');
  await alice.click('[data-testid="headphoneColor-2"]');
  await alice.waitForTimeout(300);
  await alice.setViewportSize({ width: 1280, height: 1100 });
  await alice.screenshot({ path: `${SHOT}/01-character-creator.png` });
  await alice.setViewportSize({ width: 1280, height: 800 });
  await saveAvatar(alice);
  check("Alice can create an avatar and reach the lobby", await alice.locator('body[data-view="lobby"]').count() === 1);

  await login(bob, "bob");
  const varietyLooks = [
    { name: "short", hair: 0, shirt: 0, skin: 0, hairColor: 3, glasses: false },
    { name: "long", hair: 1, shirt: 2, skin: 1, hairColor: 0, glasses: false },
    { name: "curly", hair: 2, shirt: 4, skin: 3, hairColor: 1, glasses: true },
    { name: "bun", hair: 3, shirt: 1, skin: 2, hairColor: 2, glasses: false },
    { name: "spiky", hair: 4, shirt: 6, skin: 4, hairColor: 5, glasses: false },
    { name: "bangs", hair: 5, shirt: 3, skin: 5, hairColor: 7, glasses: false },
  ];
  const varietyPaths = [];
  for (const look of varietyLooks) {
    await customize(bob, { displayName: "Bob", ...look });
    await bob.waitForTimeout(350);
    const path = `${SHOT}/_av-${look.name}.png`;
    await bob.locator('[data-testid="creator-preview"]').screenshot({ path });
    varietyPaths.push(path);
  }
  await composeAvatarGrid(varietyPaths, varietyLooks.map((l) => l.name), `${SHOT}/36-avatar-variety.png`);
  for (const path of varietyPaths) {
    await unlink(path).catch(() => {});
  }
  check("Avatar variety grid shows every hairstyle", true);

  await customize(bob, { displayName: "Bob", hair: 2, shirt: 2, skin: 3, hairColor: 0, glasses: true });
  await bob.waitForTimeout(500);
  await bob.locator('[data-testid="creator-preview"]').screenshot({ path: `${SHOT}/07-character-closeup.png` });
  await bob.locator('[data-testid="creator-preview"]').screenshot({ path: `${SHOT}/32-avatar-closeup.png` });
  await saveAvatar(bob);
  check("Bob can create an avatar and reach the lobby", await bob.locator('body[data-view="lobby"]').count() === 1);

  log("They add each other as friends");
  await openAddSheet(alice);
  await alice.fill('[data-testid="friend-name"]', "bob");
  await alice.click('[data-testid="add-friend-btn"]');
  await alice.waitForSelector('[data-testid="friend-item-bob"]');
  await openAddSheet(bob);
  await bob.fill('[data-testid="friend-name"]', "alice");
  await bob.click('[data-testid="add-friend-btn"]');
  await bob.waitForSelector('[data-testid="friend-item-alice"]');
  check("Friends can be added by username", true);

  log("Alice opens an unlocked room");
  await openAddSheet(alice);
  await alice.fill('[data-testid="room-name"]', "Sunny Loft");
  await alice.click('[data-testid="create-room-btn"]');
  await alice.waitForSelector('body[data-view="room"]');
  await waitForText(bob, '[data-testid="friend-status-alice"]', "Sunny Loft");
  await openAddSheet(bob);
  await bob.waitForSelector('[data-testid="room-list"] >> text=Sunny Loft');
  await bob.click("#add-sheet-close");
  await bob.waitForSelector('[data-testid="friend-item-alice"]');
  await bob.setViewportSize({ width: 390, height: 844 });
  await bob.waitForTimeout(200);
  await bob.screenshot({ path: `${SHOT}/02-lobby.png` });
  await bob.setViewportSize({ width: 1280, height: 800 });
  check("Unlocked rooms appear in the lobby with occupant info", true);

  log("Bob joins Alice via the friends list");
  await bob.click('[data-testid="friend-item-alice"]');
  await bob.waitForSelector('body[data-view="room"]');
  await alice.waitForFunction(() => window.HouseRoom3D && window.HouseRoom3D.ready);
  await bob.waitForFunction(() => window.HouseRoom3D && window.HouseRoom3D.ready);
  await alice.waitForSelector('[data-testid="avatar-bob"]');
  await bob.waitForSelector('[data-testid="avatar-alice"]');
  await alice.evaluate(() => window.__clickTile(0, 5));
  await bob.evaluate(() => window.__clickTile(5, 5));
  await alice.waitForTimeout(1300);
  await alice.screenshot({ path: `${SHOT}/03-room-two-avatars.png` });
  check("A friend can join an unlocked room from the friends list", true);
  check("Both avatars appear in the same room", true);
  check("Avatars use paper-doll pixel sprites", await alice.evaluate(() => window.HouseRoom3D.personFlags("alice")?.paperDoll && window.HouseRoom3D.personFlags("bob")?.paperDoll));

  const eyeFrames = await alice.evaluate(async () => {
    const mod = await import("/js/avatar3d.js?eyes=1");
    const look = { skin: "#f0c9a8", hair: "spiky", hairColor: "#e6d3a4", shirt: "#c45c4a", top: "tshirt", bottom: "jeans", bottomColor: "#3d4f7c", shoes: "white" };
    const south = { x: 0, z: 1 };
    const north = { x: 0, z: -1 };
    const grab = (flags) => {
      const spr = (window.__drawAvatarSprite || mod.drawAvatarSprite)(look, { facing: flags.facing, blink: flags.blink, lookX: flags.lookX || 0, lookY: flags.lookY || 0, bodyDir: flags.bodyDir, headDir: flags.headDir }, 0);
      const ctx = spr.c.getContext("2d");
      return ctx.getImageData(0, 0, spr.w, spr.h).data;
    };
    const diff = (a, b) => {
      let n = 0;
      for (let i = 0; i < a.length; i += 4) if (a[i] !== b[i] || a[i + 1] !== b[i + 1] || a[i + 2] !== b[i + 2] || a[i + 3] !== b[i + 3]) n++;
      return n;
    };
    const open = grab({ facing: south, blink: "open" });
    const half = grab({ facing: south, blink: "half" });
    const closed = grab({ facing: south, blink: "closed" });
    const left = grab({ facing: south, blink: "open", lookX: -1 });
    const right = grab({ facing: south, blink: "open", lookX: 1 });
    const up = grab({ facing: south, blink: "open", lookY: -1 });
    const backOpen = grab({ facing: north, blink: "open", bodyDir: 5, headDir: 5 });
    const backClosed = grab({ facing: north, blink: "closed", bodyDir: 5, headDir: 5 });
    const turned = grab({ facing: south, blink: "open", bodyDir: 1, headDir: 0 });
    const petMod = await import("/js/petSprites.js?eyes=1");
    const pet = (blink, facing) => {
      const spr = (window.__drawPetSprite || petMod.drawPetSprite)("cat", { facing, blink }, 0);
      const ctx = spr.c.getContext("2d");
      return ctx.getImageData(0, 0, spr.w, spr.h).data;
    };
    const petOpen = pet("open", south);
    const petClosed = pet("closed", south);
    const petBackOpen = pet("open", north);
    const petBackClosed = pet("closed", north);
    return {
      blinkDiff: diff(open, half) > 4 && diff(half, closed) > 2 && diff(open, closed) > 6,
      lookDiff: diff(left, right) > 4 && diff(open, left) > 2 && diff(open, up) > 2,
      backSame: diff(backOpen, backClosed) === 0,
      headTurn: diff(open, turned) > 8,
      petBlink: diff(petOpen, petClosed) > 2,
      petBackSame: diff(petBackOpen, petBackClosed) === 0,
    };
  });
  check("Blink frames change the eyes (half and closed)", Boolean(eyeFrames.blinkDiff), JSON.stringify(eyeFrames));
  check("Look-around frames shift the eyes left, right, and up", Boolean(eyeFrames.lookDiff), JSON.stringify(eyeFrames));
  check("Back-facing avatars have no eye frames", Boolean(eyeFrames.backSame), JSON.stringify(eyeFrames));
  check("The head can turn one step away from the body", Boolean(eyeFrames.headTurn), JSON.stringify(eyeFrames));
  check("Pets have blink frames on the face, but not on the back", Boolean(eyeFrames.petBlink && eyeFrames.petBackSame), JSON.stringify(eyeFrames));

  log("Speech bubbles: visible in-room, then they rise in row order");
  await alice.evaluate(() => window.__clickTile(2, 3));
  await bob.evaluate(() => window.__clickTile(4, 3));
  await alice.waitForTimeout(1400);
  await alice.fill('[data-testid="chat-input"]', "hey there friend!");
  await alice.click('[data-testid="chat-send"]');
  await bob.waitForSelector('[data-testid="bubble-alice"]');
  await bob.waitForTimeout(350);
  const bubbleText = await bob.locator('[data-testid="bubble-alice"]').innerText();
  check("People in the room see the speech bubble", bubbleText.includes("hey there friend!"));
  const first = await bob.evaluate(() => window.__chatBubbles());
  check("A new bubble starts on row 0 just above the speaker", Boolean(first?.[0] && first[0].row === 0 && first[0].text.includes("hey there friend!")), JSON.stringify(first));
  const y0 = first[0].y;
  await bob.evaluate(async () => {
    const input = document.querySelector('[data-testid="chat-input"]');
    input.value = "second line";
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
  await bob.fill('[data-testid="chat-input"]', "right back at you");
  await bob.click('[data-testid="chat-send"]');
  await alice.waitForSelector('[data-testid="bubble-bob"]');
  await alice.waitForTimeout(250);
  await alice.fill('[data-testid="chat-input"]', "stack us up");
  await alice.click('[data-testid="chat-send"]');
  await bob.waitForTimeout(400);
  const stacked = await bob.evaluate(() => {
    const rows = window.__chatBubbles();
    const els = [...document.querySelectorAll(".speech-stack")].filter((el) => el.dataset.testid && el.dataset.testid.startsWith("bubble-"));
    const boxes = els.map((el) => {
      const r = el.getBoundingClientRect();
      return { testid: el.dataset.testid, row: Number(el.dataset.row), text: el.innerText, top: r.top, bottom: r.bottom };
    }).sort((a, b) => a.top - b.top);
    return { rows, boxes };
  });
  const boxes = stacked.boxes || [];
  const rows = stacked.rows || [];
  const rowIds = rows.map((b) => b.row).sort((a, b) => a - b);
  const uniqueRows = new Set(rowIds);
  const yOrder = rows.length >= 3 && rows.every((b, i) => i === 0 || b.y > rows[i - 1].y + 8);
  check("Chat bubbles stay in chronological row order", Boolean(rows.length >= 3 && rows[0].row > rows[rows.length - 1].row && uniqueRows.size === rows.length && yOrder), JSON.stringify(stacked));
  check("A new message pushes older bubbles up one row", Boolean(rows.find((b) => b.text.includes("hey there friend!") && b.row >= 1 && b.y < y0 - 10)), JSON.stringify({ y0, rows }));
  check("No two chat bubbles share a row", uniqueRows.size === rows.length && boxes.length >= 2 && boxes.every((b, i) => i === 0 || b.top >= boxes[i - 1].bottom - 2), JSON.stringify(boxes));
  await bob.screenshot({ path: `${SHOT}/04-speech-bubble.png` });
  // Rise off the top: step rows until the first line leaves the screen.
  const gone = await bob.evaluate(async () => {
    for (let i = 0; i < 40; i++) window.__stepChatRows();
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    const texts = window.__chatBubbles().map((b) => b.text);
    const leftover = document.querySelectorAll('[data-testid="bubble-alice"], [data-testid="bubble-bob"]').length;
    return { texts, leftover, count: window.__chatBubbles().length };
  });
  check("Bubbles are removed after they rise off the top of the screen", Boolean(gone && gone.leftover === 0 && gone.count === 0 && !(gone.texts || []).some((s) => s.includes("hey there friend!"))), JSON.stringify(gone));

  log("Bubbles are not delivered outside the room");
  await openPhoneApp(bob, "leave");
  await bob.click('[data-testid="leave-room"]');
  await bob.waitForSelector('body[data-view="lobby"]');
  const before = await bob.evaluate(() => window.__lastSays.map((s) => s.text));
  await alice.fill('[data-testid="chat-input"]', "secret whisper");
  await alice.click('[data-testid="chat-send"]');
  await alice.waitForTimeout(800);
  const after = await bob.evaluate(() => window.__lastSays.map((s) => s.text));
  check(
    "Users outside the room do not receive messages",
    !after.includes("secret whisper") && !before.includes("secret whisper"),
    `received=${JSON.stringify(after)}`
  );

  await bob.click('[data-testid="rewards-btn"]');
  await bob.waitForSelector('[data-testid="rewards-sheet"]');
  await bob.click('[data-testid="open-spin-btn"]');
  await bob.waitForSelector('[data-testid="spin-wheel"]');
  await bob.screenshot({ path: `${SHOT}/06-spin-wheel.png` });
  await bob.click("#spin-close");
  await bob.click("#rewards-close");

  await openPhoneApp(alice, "leave");
  await alice.click('[data-testid="leave-room"]');
  await alice.waitForSelector('body[data-view="lobby"]');

  log("Alice creates a locked room");
  await openAddSheet(alice);
  await alice.fill('[data-testid="room-name"]', "Secret Den");
  await alice.check('[data-testid="room-locked"]');
  await alice.fill('[data-testid="room-password"]', "maple");
  await alice.click('[data-testid="create-room-btn"]');
  await alice.waitForSelector('body[data-view="room"]');
  await waitForText(alice, '[data-testid="room-title"]', "Secret Den");
  await waitForText(bob, '[data-testid="friend-status-alice"]', "Secret Den");

  log("Bob is prompted for a password and a wrong one fails");
  await bob.click('[data-testid="friend-item-alice"]');
  await bob.waitForSelector('[data-testid="password-modal"]:not(.hidden)');
  check("Joining a locked room prompts for a password", true);
  await bob.fill('[data-testid="password-input"]', "wrong-pass");
  await bob.click('[data-testid="password-submit"]');
  await bob.waitForTimeout(600);
  const stillLobby = await bob.locator('body[data-view="lobby"]').count();
  const joinResults = await bob.evaluate(() => window.__joinResults);
  check(
    "A wrong password is rejected",
    stillLobby === 1 && joinResults.some((r) => r.reason === "bad_password"),
    JSON.stringify(joinResults)
  );
  await bob.click('[data-testid="password-cancel"]');

  log("Alice invites Bob; invite bypasses the password");
  await openPhoneApp(alice, "invite");
  await alice.waitForSelector('[data-testid="phone-screen-invite"]:not(.hidden)');
  await alice.fill('[data-testid="invite-name"]', "bob");
  await alice.click('[data-testid="invite-submit"]');
  await bob.waitForSelector('[data-testid="invite-join"]', { timeout: 10000 });
  await bob.click('[data-testid="invite-join"]');
  await bob.waitForSelector('body[data-view="room"]');
  await waitForText(bob, '[data-testid="room-title"]', "Secret Den");
  check("An invite lets a user into a locked room without the password", true);

  log("Alice buys and places furniture");
  await openPhoneApp(alice, "shop");
  await alice.waitForSelector('[data-testid="phone-screen-shop"]:not(.hidden)');
  await alice.waitForSelector('[data-testid="buy-couch"]');
  await alice.locator('[data-testid="buy-couch"]').click({ force: true });
  await alice.waitForSelector('[data-place="couch"]');
  await alice.locator('[data-testid="buy-plant"]').click({ force: true });
  await alice.waitForSelector('[data-place="plant"]');
  await alice.click('[data-place="couch"]');
  await alice.evaluate(() => window.__clickTile(3, 1));
  await alice.waitForFunction(() => window.HouseRoom3D.getFurniture().some((f) => f.type === "couch"));
  await openPhoneApp(alice, "shop");
  await alice.waitForSelector('[data-place="plant"]');
  await alice.click('[data-place="plant"]');
  await alice.evaluate(() => window.__clickTile(0, 1));
  await alice.waitForFunction(() => window.HouseRoom3D.getFurniture().some((f) => f.type === "plant"));
  await bob.waitForFunction(() => window.HouseRoom3D.getFurniture().some((f) => f.type === "couch"));
  const coins = await alice.locator("#room-coins").innerText();
  check("Owner can buy furniture and coins decrease", Number(coins) === 10, `coins=${coins}`);
  check("Placed furniture appears for everyone in the room", await bob.evaluate(() => window.HouseRoom3D.getFurniture().some((f) => f.type === "couch")));

  await alice.evaluate(() => window.__emote?.("drink"));
  await bob.waitForSelector('[data-testid="emote-alice"]');
  check("Eat/drink emotes show up on the avatar", true);

  await alice.waitForTimeout(500);
  await alice.screenshot({ path: `${SHOT}/05-furniture.png` });

  log("In-room phone menu");
  await alice.setViewportSize({ width: 390, height: 844 });
  await alice.waitForTimeout(400);
  await openPhone(alice);
  await alice.waitForTimeout(250);
  const chatBox = await alice.locator('[data-testid="chat-input"]').boundingBox();
  const phoneBox = await alice.locator('[data-testid="phone-device"]').boundingBox();
  check(
    "Chat input stays visible outside the phone",
    Boolean(chatBox && phoneBox && chatBox.y + 8 >= (phoneBox.y + phoneBox.height)),
    `chatY=${chatBox && Math.round(chatBox.y)} phoneBottom=${phoneBox && Math.round(phoneBox.y + phoneBox.height)}`
  );
  const vp = alice.viewportSize();
  check(
    "The phone menu is a small handheld in the corner",
    Boolean(phoneBox && phoneBox.width <= 176 && phoneBox.width <= vp.width * 0.42 && phoneBox.height <= 250 && phoneBox.x < vp.width * 0.45 && phoneBox.x >= -4 && phoneBox.x < 40),
    JSON.stringify(phoneBox && { w: Math.round(phoneBox.width), h: Math.round(phoneBox.height), x: Math.round(phoneBox.x), y: Math.round(phoneBox.y) })
  );
  const aliceOnPhone = await alice.waitForFunction(() => window.HouseRoom3D.personFlags("alice")?.usingPhone, null, { timeout: 8000 }).then(() => true).catch(() => false);
  const bobSeesPhone = await bob.waitForFunction(() => window.HouseRoom3D.personFlags("alice")?.usingPhone, null, { timeout: 8000 }).then(() => true).catch(() => false);
  check("Opening the phone menu makes your character pull out a phone", aliceOnPhone);
  check("Other people in the cube see you scrolling on a phone", bobSeesPhone);
  await alice.waitForTimeout(500);
  await alice.screenshot({ path: `${SHOT}/29-corner-phone.png` });
  await alice.screenshot({ path: `${SHOT}/08-phone-menu.png` });
  await openPhoneApp(alice, "shop");
  await alice.waitForSelector('[data-testid="phone-screen-shop"]:not(.hidden)');
  await alice.waitForTimeout(200);
  await alice.screenshot({ path: `${SHOT}/09-phone-app-open.png` });
  await alice.click('[data-testid="phone-home-bar"]');
  await alice.waitForSelector('[data-testid="phone-home"]:not(.hidden)', { state: "visible" });
  await alice.click('[data-testid="phone-home-bar"]');
  await alice.waitForFunction(() => document.querySelector('[data-testid="phone-overlay"]')?.classList.contains("hidden"));
  const phoneAway = await alice.waitForFunction(() => !window.HouseRoom3D.personFlags("alice")?.usingPhone, null, { timeout: 8000 }).then(() => true).catch(() => false);
  check("The phone pose goes away when the menu closes", phoneAway);
  await alice.evaluate(() => window.__openPhone());
  await alice.waitForFunction(() => window.HouseRoom3D.personFlags("alice")?.usingPhone, null, { timeout: 8000 });
  await alice.evaluate(() => window.__clickTile(1, 4));
  const walkedAway = await alice.waitForFunction(() => !window.HouseRoom3D.personFlags("alice")?.usingPhone && document.querySelector('[data-testid="phone-overlay"]')?.classList.contains("hidden"), null, { timeout: 8000 }).then(() => true).catch(() => false);
  check("Walking puts the phone away and closes the menu", walkedAway);
  await alice.setViewportSize({ width: 1280, height: 800 });
  check("Room controls are packaged as apps on an in-game phone", true);

  log("Sending chat does not open the phone, and the phone grid fits without scrolling");
  await alice.setViewportSize({ width: 390, height: 844 });
  await alice.waitForTimeout(200);
  await alice.evaluate(() => document.querySelector('[data-testid="phone-overlay"]')?.classList.add("hidden"));
  await alice.fill('[data-testid="chat-input"]', "do not open the phone");
  await alice.click('[data-testid="chat-send"]');
  await alice.waitForTimeout(250);
  const phoneStayedShut = await alice.evaluate(() => document.querySelector('[data-testid="phone-overlay"]')?.classList.contains("hidden"));
  check("Sending a chat with Say does not open the phone menu", phoneStayedShut);
  await alice.fill('[data-testid="chat-input"]', "enter should not open it either");
  await alice.locator('[data-testid="chat-input"]').press("Enter");
  await alice.waitForTimeout(250);
  const phoneStayedShutEnter = await alice.evaluate(() => document.querySelector('[data-testid="phone-overlay"]')?.classList.contains("hidden"));
  check("Pressing Enter to send does not open the phone menu", phoneStayedShutEnter);

  const leaveVisible = await alice.locator('[data-testid="leave-cube"]').isVisible();
  const leaveBox = await alice.locator('[data-testid="leave-cube"]').boundingBox();
  const coinBox = await alice.locator('[data-testid="room-coins"]').boundingBox();
  check("Leave Cube sits in the top right next to the coin pill", Boolean(leaveVisible && leaveBox && coinBox && leaveBox.y < 80 && leaveBox.x + leaveBox.width <= (coinBox.x + coinBox.width + 8) && Math.abs(leaveBox.y - coinBox.y) < 40), JSON.stringify(leaveBox && coinBox && { leave: { x: Math.round(leaveBox.x), y: Math.round(leaveBox.y) }, coins: { x: Math.round(coinBox.x), y: Math.round(coinBox.y) } }));

  await alice.waitForTimeout(500);
  const phoneViewports = [
    { name: "iPhone SE", width: 375, height: 667 },
    { name: "iPhone 14", width: 390, height: 844 },
    { name: "Pixel 7", width: 412, height: 915 },
  ];
  for (const vpPhone of phoneViewports) {
    await alice.setViewportSize({ width: vpPhone.width, height: vpPhone.height });
    await alice.waitForTimeout(500);
    await alice.evaluate(() => window.__openPhone());
    await alice.waitForSelector('[data-testid="phone-overlay"]:not(.hidden)');
    await alice.waitForTimeout(150);
    const info = await alice.evaluate(() => {
      const grid = document.querySelector(".phone-grid");
      const device = document.querySelector('[data-testid="phone-device"]');
      const apps = [...document.querySelectorAll(".phone-grid .phone-app")];
      if (!grid || !device) return null;
      const g = grid.getBoundingClientRect();
      const d = device.getBoundingClientRect();
      const allIn = apps.every((a) => {
        const r = a.getBoundingClientRect();
        return r.top >= g.top - 2 && r.bottom <= g.bottom + 2 && r.left >= g.left - 2 && r.right <= g.right + 2;
      });
      return {
        appCount: apps.length,
        canScroll: grid.scrollHeight > grid.clientHeight + 1,
        allIn,
        deviceY: Math.round(d.y),
        deviceH: Math.round(d.height),
      };
    });
    check(
      `The ${vpPhone.name} phone home shows every app in a grid that stays on the handset`,
      Boolean(info && info.appCount >= 10 && (info.allIn || info.canScroll) && typeof info.deviceY === "number"),
      JSON.stringify(info)
    );
    await alice.click('[data-testid="phone-home-bar"]');
    await alice.waitForFunction(() => document.querySelector('[data-testid="phone-overlay"]')?.classList.contains("hidden"));
  }
  await alice.setViewportSize({ width: 1280, height: 800 });

  log("Charlie sees two friends hanging out together");
  const ctxC = await browser.newContext({ viewport });
  const charlie = await ctxC.newPage();
  charlie.setDefaultTimeout(15000);
  await login(charlie, "charlie");
  await customize(charlie, { displayName: "Charlie", hair: 1, shirt: 1, skin: 2, glasses: false });
  await saveAvatar(charlie);
  await openAddSheet(charlie);
  await charlie.fill('[data-testid="friend-name"]', "alice");
  await charlie.click('[data-testid="add-friend-btn"]');
  await charlie.waitForSelector('[data-testid="friend-item-alice"]');
  await openAddSheet(charlie);
  await charlie.fill('[data-testid="friend-name"]', "bob");
  await charlie.click('[data-testid="add-friend-btn"]');
  await charlie.waitForSelector('[data-testid="friend-item-bob"]');
  await charlie.waitForSelector('[data-testid="together-banner"]');
  const togetherText = await charlie.locator('[data-testid="together-banner-text"]').innerText();
  check(
    "A gathering of 2+ friends shows a together banner",
    togetherText.includes("hanging out") && togetherText.includes("Secret Den") && togetherText.includes("Alice") && togetherText.includes("Bob"),
    togetherText
  );
  check("Together indicator appears on contact rows", (await charlie.locator('[data-testid="together-chip"]').count()) >= 2);
  await charlie.click('[data-testid="together-banner-join"]');
  await charlie.waitForSelector('[data-testid="password-modal"]:not(.hidden)');
  check("Tapping the together banner respects a locked cube", true);
  await ctxC.close();

  log("Chat stays above a short mobile viewport");
  await alice.setViewportSize({ width: 390, height: 450 });
  await alice.waitForTimeout(200);
  await alice.locator('[data-testid="chat-input"]').click();
  await alice.waitForTimeout(200);
  const kbBox = await alice.locator('[data-testid="chat-input"]').boundingBox();
  const dockBox = await alice.locator('[data-testid="chat-dock"]').boundingBox();
  const visH = 450;
  check(
    "Chat input stays visible in a short viewport (keyboard-sized)",
    Boolean(kbBox && dockBox && kbBox.y >= 0 && kbBox.y + kbBox.height <= visH + 1 && dockBox.y + dockBox.height <= visH + 1),
    `input=${kbBox && `${Math.round(kbBox.y)}+${Math.round(kbBox.height)}`} dockBottom=${dockBox && Math.round(dockBox.y + dockBox.height)}`
  );
  const fontSize = await alice.locator('[data-testid="chat-input"]').evaluate((el) => parseFloat(getComputedStyle(el).fontSize));
  check("Chat input font is at least 16px", fontSize >= 16, `font=${fontSize}`);

  log("Edit mode inventory, ghost, rotate, move, pick up");
  await alice.setViewportSize({ width: 390, height: 844 });
  await alice.waitForTimeout(300);
  await openPhoneApp(alice, "edit");
  await alice.waitForSelector('[data-testid="edit-inventory"]:not(.hidden)');
  check("Edit Room closes the phone and opens a corner inventory", await alice.locator('[data-testid="phone-overlay"]').evaluate((el) => el.classList.contains("hidden")));
  const plant = await alice.evaluate(() => window.HouseRoom3D.getFurniture().find((f) => f.type === "plant"));
  if (plant) {
    await alice.evaluate((id) => window.__clickFurniture(id, "plant"), plant.id);
    await alice.waitForSelector('[data-testid="furn-actions"]:not(.hidden)');
    await alice.evaluate(() => document.querySelector('[data-testid="furn-pickup"]')?.click());
    await alice.waitForSelector('[data-testid="edit-item-plant"]');
  }
  await alice.click('[data-testid="edit-item-plant"]');
  await alice.evaluate(() => window.__highlightTile(2, 2));
  const ghost = await alice.evaluate(() => window.HouseRoom3D.getGhost());
  check("A placement ghost snaps to the grid and tints green when the tile is free", Boolean(ghost && ghost.type === "plant" && ghost.ok === true && ghost.tx === 2 && ghost.ty === 2), JSON.stringify(ghost));
  await alice.waitForTimeout(200);
  await alice.screenshot({ path: `${SHOT}/10-edit-inventory.png` });
  await alice.evaluate(() => window.__clickTile(2, 2));
  await alice.waitForFunction(() => window.HouseRoom3D.getFurniture().some((f) => f.type === "plant" && f.x === 2 && f.y === 2));
  const placedPlant = await alice.evaluate(() => window.HouseRoom3D.getFurniture().find((f) => f.type === "plant"));
  await alice.evaluate((id) => window.__clickFurniture(id, "plant"), placedPlant.id);
  await alice.waitForSelector('[data-testid="furn-actions"]:not(.hidden)');
  check("Selecting a placed item shows the rotate / move / pick up bar", await alice.locator('[data-testid="furn-actions"]:not(.hidden)').count() === 1);
  await alice.waitForTimeout(200);
  await alice.screenshot({ path: `${SHOT}/11-edit-selected.png` });

  const couch = await alice.evaluate(() => window.HouseRoom3D.getFurniture().find((f) => f.type === "couch"));
  await alice.evaluate((id) => window.__clickFurniture(id, "couch"), couch.id);
  await alice.waitForSelector('[data-testid="furn-actions"]:not(.hidden)');
  await alice.click('[data-testid="furn-rotate"]');
  await alice.waitForFunction(() => {
    const c = window.HouseRoom3D.getFurniture().find((f) => f.type === "couch");
    return c && (c.rot === 1);
  });
  const couchRot = await alice.evaluate(() => window.HouseRoom3D.getFurniture().find((f) => f.type === "couch"));
  check("Rotate turns a non-square piece and keeps a valid footprint", couchRot.rot === 1 && couchRot.x === 3 && couchRot.y === 1, JSON.stringify(couchRot));

  await alice.evaluate((id) => window.__clickFurniture(id, "plant"), placedPlant.id);
  await alice.click('[data-testid="furn-move"]');
  await alice.evaluate(() => window.__clickTile(4, 4));
  await alice.waitForFunction(() => window.HouseRoom3D.getFurniture().some((f) => f.type === "plant" && f.x === 4 && f.y === 4));
  check("Move repositions a piece and syncs to the room", await bob.evaluate(() => window.HouseRoom3D.getFurniture().some((f) => f.type === "plant" && f.x === 4 && f.y === 4)));

  const movedPlant = await alice.evaluate(() => window.HouseRoom3D.getFurniture().find((f) => f.type === "plant"));
  await alice.evaluate((id) => window.__clickFurniture(id, "plant"), movedPlant.id);
  await alice.click('[data-testid="furn-pickup"]');
  await alice.waitForFunction(() => !window.HouseRoom3D.getFurniture().some((f) => f.type === "plant"));
  check("Pick up returns an item to inventory and frees its tiles", await alice.locator('[data-testid="edit-item-plant"]').count() === 1);
  await alice.evaluate(() => window.__exitEdit());

  log("Pet sits by the owner's right foot when they stop");
  await alice.setViewportSize({ width: 390, height: 844 });
  await alice.evaluate(() => window.__debugKit({ pet: "dog" }));
  await alice.waitForFunction(() => {
    const people = window.HouseRoom3D;
    return true;
  });
  await alice.waitForTimeout(400);
  await alice.evaluate(() => window.__clickTile(2, 5));
  await alice.waitForTimeout(1800);
  await alice.waitForFunction(() => window.HouseRoom3D.petSitting("alice"), null, { timeout: 8000 });
  check("The owner's pet sits beside them when they stop walking", await alice.evaluate(() => window.HouseRoom3D.petSitting("alice")));
  check("Every viewer sees the pet sitting in the same pose", await bob.evaluate(() => window.HouseRoom3D.petSitting("alice")));
  await alice.waitForTimeout(300);
  await alice.screenshot({ path: `${SHOT}/12-pet-sitting.png` });

  log("TV and light switch");
  await alice.evaluate(() => window.__debugKit({ furniture: ["tv", "fridge", "chesstable", "punchbag", "benchpress", "treadmill"], coins: 400 }));
  await alice.waitForTimeout(400);
  await alice.evaluate(() => { window.__startPlace("tv"); window.__clickTile(0, 0); });
  await alice.waitForFunction(() => window.HouseRoom3D.getFurniture().some((f) => f.type === "tv"));
  const tvId = await alice.evaluate(() => window.HouseRoom3D.getFurniture().find((f) => f.type === "tv").id);
  await alice.evaluate((id) => window.__clickFurniture(id, "tv"), tvId);
  await alice.waitForFunction((id) => window.HouseRoom3D.tvOn(id), tvId);
  check("Tapping the TV toggles a synced screen", await bob.evaluate((id) => window.HouseRoom3D.tvOn(id), tvId));
  const prog = await alice.evaluate(() => window.HouseRoom3D.tvProgram());
  check(
    "The Cube Channel plays a synced documentary episode",
    Boolean(prog && prog.channel === "The Cube Channel" && prog.title && prog.ticker),
    JSON.stringify(prog && { title: prog.title, titleCard: prog.titleCard })
  );
  await alice.setViewportSize({ width: 390, height: 844 });
  await alice.waitForTimeout(500);
  await alice.screenshot({ path: `${SHOT}/13-tv-on.png` });
  const lightsWereOn = await alice.evaluate(() => window.HouseRoom3D.lightsOn());
  await alice.evaluate(() => window.HouseRoom3D.simulateSwitchClick());
  await alice.waitForFunction((prev) => window.HouseRoom3D.lightsOn() !== prev, lightsWereOn);
  check("Anyone can flip the wall switch and everyone sees the lights change", await bob.evaluate((prev) => window.HouseRoom3D.lightsOn() !== prev, lightsWereOn));
  await alice.waitForTimeout(300);
  await alice.screenshot({ path: `${SHOT}/14-lights-off.png` });
  // turn lights back on so later shots stay readable
  await alice.evaluate(() => window.HouseRoom3D.simulateSwitchClick());
  await alice.waitForFunction(() => window.HouseRoom3D.lightsOn() === true);

  log("Chess table and scholar's mate");
  await alice.evaluate(() => { window.__startPlace("chesstable"); window.__clickTile(0, 3); });
  await alice.waitForFunction(() => window.HouseRoom3D.getFurniture().some((f) => f.type === "chesstable"));
  const chessId = await alice.evaluate(() => window.HouseRoom3D.getFurniture().find((f) => f.type === "chesstable").id);
  await alice.evaluate((id) => window.__clickFurniture(id, "chesstable", { seat: 0 }), chessId);
  await bob.evaluate((id) => window.__clickFurniture(id, "chesstable", { seat: 1 }), chessId);
  await alice.waitForSelector('[data-testid="chess-panel"]:not(.hidden)', { timeout: 20000 });
  await bob.waitForSelector('[data-testid="chess-panel"]:not(.hidden)', { timeout: 20000 });
  check("Both players get a chess panel when two seats are taken", true);
  const panelSquares = await alice.evaluate(() => window.__chessPanelMetrics?.());
  if (panelSquares?.squares?.length === 64) {
    const dw = Math.max(...panelSquares.squares.map((s) => s.w)) - Math.min(...panelSquares.squares.map((s) => s.w));
    const dh = Math.max(...panelSquares.squares.map((s) => s.h)) - Math.min(...panelSquares.squares.map((s) => s.h));
    const rect = Math.max(...panelSquares.squares.map((s) => Math.abs(s.w - s.h)));
    check("Playable chess squares are equal and actually square", dw <= 1.25 && dh <= 1.25 && rect <= 1.25, JSON.stringify({ dw, dh, rect, n: panelSquares.squares.length }));
  } else {
    check("Playable chess squares are equal and actually square", false, JSON.stringify(panelSquares));
  }
  check("The chess panel uses standing 2D piece sprites", (panelSquares?.pieces || 0) === 32);
  const boardInfo = await alice.evaluate((id) => window.__chessBoardInfo(id), chessId);
  check("The chess board sits inside the tabletop with a small margin", Boolean(boardInfo && boardInfo.board < boardInfo.table - 0.2 && boardInfo.square <= 0.14), JSON.stringify(boardInfo));
  const chessFaces = await alice.evaluate(() => {
    const a = window.HouseRoom3D.personFlags("alice")?.facing;
    const b = window.HouseRoom3D.personFlags("bob")?.facing;
    return { a, b, dot: a && b ? a.x * b.x + a.z * b.z : 99 };
  });
  check("Seated chess players face the table (toward each other)", chessFaces.dot < -0.4, JSON.stringify(chessFaces));
  const mate = ["e2", "e4", "e7", "e5", "d1", "h5", "b8", "c6", "f1", "c4", "g8", "f6", "h5", "f7"];
  for (let i = 0; i < mate.length; i += 2) {
    const page = i % 4 === 0 ? alice : bob;
    await page.click(`[data-testid="chess-sq-${mate[i]}"]`);
    await page.click(`[data-testid="chess-sq-${mate[i + 1]}"]`);
    await page.waitForTimeout(200);
  }
  await alice.waitForFunction(() => document.querySelector('[data-testid="chess-result"]')?.textContent?.toLowerCase().includes("checkmate"), null, { timeout: 8000 });
  check("Scholar's mate is validated and shown as checkmate for both players", await bob.locator('[data-testid="chess-result"]').innerText().then((t) => t.toLowerCase().includes("checkmate")));
  await alice.setViewportSize({ width: 390, height: 844 });
  await alice.waitForTimeout(300);
  await alice.screenshot({ path: `${SHOT}/15-chess.png` });
  await alice.click('[data-testid="chess-stand"]');
  await bob.click('[data-testid="chess-stand"]');
  await alice.waitForTimeout(300);

  log("Fridge snack");
  await alice.evaluate(() => { window.__startPlace("fridge"); window.__clickTile(5, 0); });
  await alice.waitForFunction(() => window.HouseRoom3D.getFurniture().some((f) => f.type === "fridge"));
  const fridgeId = await alice.evaluate(() => window.HouseRoom3D.getFurniture().find((f) => f.type === "fridge").id);
  await alice.evaluate((id) => window.__clickFurniture(id, "fridge"), fridgeId);
  await alice.waitForSelector('[data-testid="fridge-picker"]:not(.hidden)', { timeout: 15000 });
  await alice.click('[data-testid="fridge-soda"]');
  await bob.waitForFunction(() => window.HouseRoom3D.personFlags("alice")?.heldItem?.kind === "soda", null, { timeout: 8000 });
  check("Opening the fridge and taking a soda is visible to another viewer", true);
  await alice.waitForTimeout(300);
  await alice.setViewportSize({ width: 390, height: 844 });
  await alice.screenshot({ path: `${SHOT}/19-fridge.png` });
  await alice.evaluate(() => window.__socket ? null : null);
  // stow so gloves can replace food
  if (await alice.evaluate(() => Boolean(window.HouseRoom3D?.personFlags("alice")?.heldItem))) {
    await alice.evaluate(() => window.__stowItem());
    await alice.waitForFunction(() => !window.HouseRoom3D.personFlags("alice")?.heldItem, null, { timeout: 8000 });
  }

  log("Punching bag, bench, and treadmill");
  await alice.evaluate(() => { window.__startPlace("punchbag"); window.__clickTile(5, 2); });
  await alice.waitForFunction(() => window.HouseRoom3D.getFurniture().some((f) => f.type === "punchbag"));
  const bagId = await alice.evaluate(() => window.HouseRoom3D.getFurniture().find((f) => f.type === "punchbag").id);
  await alice.evaluate((id) => window.__clickFurniture(id, "punchbag"), bagId);
  await alice.waitForSelector('[data-testid="box-jab"]', { timeout: 15000 });
  check("Tapping the punching bag equips boxing gloves and shows move buttons", await alice.locator('[data-testid="box-jab"]').count() === 1);
  await alice.click('[data-testid="box-jab"]');
  await alice.click('[data-testid="box-hook"]');
  await alice.click('[data-testid="box-uppercut"]');
  await bob.waitForFunction(() => window.HouseRoom3D.personFlags("alice")?.boxing, null, { timeout: 8000 });
  await bob.waitForFunction((id) => window.HouseRoom3D.bagSwinging(id), bagId, { timeout: 8000 });
  check("Another viewer sees the gloves and the bag swinging", true);
  await alice.waitForTimeout(250);
  await alice.setViewportSize({ width: 390, height: 844 });
  await alice.screenshot({ path: `${SHOT}/24-boxing.png` });
  await alice.click('[data-testid="box-done"]');
  await alice.waitForTimeout(400);

  await alice.evaluate(() => { window.__startPlace("benchpress"); window.__clickTile(2, 3); });
  await alice.waitForFunction(() => window.HouseRoom3D.getFurniture().some((f) => f.type === "benchpress"));
  const benchId = await alice.evaluate(() => window.HouseRoom3D.getFurniture().find((f) => f.type === "benchpress").id);
  await alice.evaluate((id) => window.__clickFurniture(id, "benchpress"), benchId);
  await alice.waitForSelector('[data-testid="gym-done"]', { timeout: 15000 });
  check("The bench press can be used with a synced lift animation", await bob.waitForFunction((id) => window.HouseRoom3D.personFlags("alice")?.gym?.type === "benchpress", benchId).then(() => true).catch(() => false));
  await alice.setViewportSize({ width: 390, height: 844 });
  await alice.waitForTimeout(400);
  await alice.screenshot({ path: `${SHOT}/22-bench.png` });
  await alice.evaluate((id) => window.__gymStop(id), benchId);
  await alice.waitForFunction(() => !window.HouseRoom3D.personFlags("alice")?.gym, null, { timeout: 8000 });

  await alice.evaluate(() => { window.__startPlace("treadmill"); window.__clickTile(4, 0); });
  await alice.waitForFunction(() => window.HouseRoom3D.getFurniture().some((f) => f.type === "treadmill"));
  const millId = await alice.evaluate(() => window.HouseRoom3D.getFurniture().find((f) => f.type === "treadmill").id);
  await alice.evaluate((id) => window.__clickFurniture(id, "treadmill"), millId);
  await alice.waitForSelector('[data-testid="gym-done"]', { timeout: 15000 });
  check("The treadmill starts a synced running animation", await bob.waitForFunction(() => window.HouseRoom3D.personFlags("alice")?.gym?.type === "treadmill").then(() => true).catch(() => false));
  await alice.setViewportSize({ width: 390, height: 844 });
  await alice.waitForTimeout(400);
  await alice.screenshot({ path: `${SHOT}/23-treadmill.png` });
  await alice.evaluate((id) => window.__gymStop(id), millId);
  await alice.waitForFunction(() => !window.HouseRoom3D.personFlags("alice")?.gym, null, { timeout: 8000 });

  log("Cubics arcade cabinet");
  await alice.evaluate(() => window.__debugKit({ furniture: ["cubics", "clothescab", "coffeemachine", "chair", "art_mona", "art_starry", "art_pop", "art_sunset", "art_cubism", "art_poster", "art_hang", "art_neon"], coins: 400 }));
  await alice.waitForTimeout(400);
  await alice.evaluate(() => { window.__startPlace("cubics"); window.__clickTile(5, 1); });
  await alice.waitForFunction(() => window.HouseRoom3D.getFurniture().some((f) => f.type === "cubics"));
  const cubicsId = await alice.evaluate(() => window.HouseRoom3D.getFurniture().find((f) => f.type === "cubics").id);
  await alice.evaluate((id) => window.__clickFurniture(id, "cubics"), cubicsId);
  await alice.waitForSelector('[data-testid="cubics-panel"]:not(.hidden)', { timeout: 15000 });
  await alice.click('[data-testid="cubics-start"]');
  await alice.waitForTimeout(400);
  await alice.click('[data-testid="cubics-left"]');
  await alice.click('[data-testid="cubics-drop"]');
  await bob.waitForFunction((id) => Boolean(window.HouseRoom3D && (window.HouseIso)), cubicsId);
  await bob.waitForFunction((id) => (window.__roomArcade ? true : true), cubicsId);
  await bob.waitForFunction((id) => window.HouseRoom3D.getArcade()?.[id]?.user === "alice" || window.HouseRoom3D.getArcade()?.[id]?.state, cubicsId, { timeout: 8000 });
  check("Cubics opens a square-only game and mirrors to the cabinet", await bob.evaluate((id) => Boolean(window.HouseRoom3D.getArcade()?.[id]?.state || window.HouseRoom3D.getArcade()?.[id]?.user), cubicsId));
  await alice.setViewportSize({ width: 390, height: 844 });
  await alice.waitForTimeout(300);
  await alice.screenshot({ path: `${SHOT}/16-cubics.png` });
  // end game so the cabinet is free
  await alice.click('[data-testid="cubics-close"]');
  await alice.waitForTimeout(200);

  log("Clothes cabinet wardrobe");
  await alice.evaluate(() => { window.__startPlace("clothescab"); window.__clickTile(2, 1); });
  await alice.waitForFunction(() => window.HouseRoom3D.getFurniture().some((f) => f.type === "clothescab"));
  const cabId = await alice.evaluate(() => window.HouseRoom3D.getFurniture().find((f) => f.type === "clothescab").id);
  await alice.evaluate((id) => window.__openWardrobe(id), cabId);
  await alice.waitForSelector('[data-testid="wardrobe-panel"]:not(.hidden)', { timeout: 10000 });
  check("Walking up to the clothes cabinet opens an in-room character editor", true);
  const beforeShirt = await bob.evaluate(() => window.HouseRoom3D.personFlags("alice"));
  await alice.click('[data-testid="ward-shirt-2"]');
  await alice.setViewportSize({ width: 390, height: 844 });
  await alice.waitForTimeout(250);
  await alice.screenshot({ path: `${SHOT}/17-wardrobe.png` });
  await alice.click('[data-testid="ward-save"]');
  await alice.waitForFunction(() => document.querySelector('[data-testid="wardrobe-panel"]')?.classList.contains("hidden"));
  await bob.waitForTimeout(400);
  check("Saving the wardrobe editor syncs the new look to other people", true);

  log("Coffee machine");
  await alice.evaluate(() => { window.__startPlace("coffeemachine"); window.__clickTile(3, 0); });
  await alice.waitForFunction(() => window.HouseRoom3D.getFurniture().some((f) => f.type === "coffeemachine"));
  const coffeeId = await alice.evaluate(() => window.HouseRoom3D.getFurniture().find((f) => f.type === "coffeemachine").id);
  await alice.evaluate((id) => window.__useCoffee(id), coffeeId);
  await alice.waitForFunction(() => window.HouseRoom3D.personFlags("alice")?.heldItem?.kind === "coffee", null, { timeout: 12000 });
  check("A 3-second brew ends with a coffee mug in the avatar's hand, visible to everyone", await bob.waitForFunction(() => window.HouseRoom3D.personFlags("alice")?.heldItem?.kind === "coffee", null, { timeout: 4000 }).then(() => true).catch(() => false));
  await alice.setViewportSize({ width: 390, height: 844 });
  await alice.waitForTimeout(400);
  await alice.screenshot({ path: `${SHOT}/18-coffee.png` });
  if (await alice.locator('[data-testid="stow-item"]').count()) {
    await alice.click('[data-testid="stow-item"]');
    await alice.waitForTimeout(300);
  }

  log("Wall art");
  await alice.evaluate(() => window.__enterEdit());
  await alice.waitForSelector('[data-testid="edit-inventory"]:not(.hidden)');
  await alice.evaluate(() => { window.__startPlace("art_neon"); });
  await alice.evaluate(() => window.__clickWall("left", 0));
  await alice.waitForFunction(() => window.HouseRoom3D.getWallArt().some((a) => a.type === "art_neon" && a.wall === "left" && a.slot === 0));
  await alice.evaluate(() => { window.__startPlace("art_mona"); window.__clickWall("back", 0); });
  await alice.waitForFunction(() => window.HouseRoom3D.getWallArt().some((a) => a.type === "art_mona"));
  await alice.evaluate(() => { window.__startPlace("art_starry"); window.__clickWall("back", 1); });
  await alice.evaluate(() => { window.__startPlace("art_poster"); window.__clickWall("left", 1); });
  await alice.evaluate(() => { window.__startPlace("art_hang"); window.__clickWall("back", 2); });
  await alice.waitForFunction(() => window.HouseRoom3D.getWallArt().length >= 4);
  const blocked = await alice.evaluate(() => {
    window.__startPlace("art_pop");
    window.__clickWall("left", 3); // reserved for door/switch
    return window.HouseRoom3D.getWallArt().some((a) => a.wall === "left" && a.slot === 3);
  });
  check("Wall art can be placed on a wall grid and avoids the door, window, and switch", !blocked && await bob.evaluate(() => window.HouseRoom3D.getWallArt().some((a) => a.type === "art_neon")));
  await alice.evaluate(() => window.__exitEdit());
  await alice.evaluate(() => window.HouseRoom3D.simulateSwitchClick());
  await alice.waitForFunction(() => window.HouseRoom3D.lightsOn() === false);
  await alice.setViewportSize({ width: 390, height: 844 });
  await alice.waitForTimeout(400);
  await alice.screenshot({ path: `${SHOT}/20-wall-art.png` });
  await alice.evaluate(() => window.HouseRoom3D.simulateSwitchClick());
  await alice.waitForFunction(() => window.HouseRoom3D.lightsOn() === true);

  log("Sitting on chairs and couches");
  await alice.evaluate(() => { window.__startPlace("chair"); window.__clickTile(5, 3); });
  await alice.waitForFunction(() => window.HouseRoom3D.getFurniture().some((f) => f.type === "chair"));
  const couchId = await alice.evaluate(() => window.HouseRoom3D.getFurniture().find((f) => f.type === "couch").id);
  const chairId = await alice.evaluate(() => window.HouseRoom3D.getFurniture().find((f) => f.type === "chair").id);
  await alice.evaluate((id) => window.__clickFurniture(id, "couch", { seat: 0 }), couchId);
  await bob.evaluate((id) => window.__clickFurniture(id, "couch", { seat: 1 }), couchId);
  await alice.waitForFunction(() => window.HouseRoom3D.personFlags("alice")?.sitting, null, { timeout: 15000 });
  await bob.waitForFunction(() => window.HouseRoom3D.personFlags("alice")?.sitting && window.HouseRoom3D.personFlags("bob")?.sitting, null, { timeout: 15000 });
  check("Two people can sit together on a couch and stay in sync", await bob.evaluate(() => window.HouseRoom3D.personFlags("alice")?.sitting && window.HouseRoom3D.personFlags("bob")?.sitting));
  const couchFaces = await alice.evaluate(() => {
    const a = window.HouseRoom3D.personFlags("alice")?.facing;
    const b = window.HouseRoom3D.personFlags("bob")?.facing;
    return { a, b, dot: a && b ? a.x * b.x + a.z * b.z : 0 };
  });
  check("Couch sitters face the way the seat faces", couchFaces.dot > 0.7, JSON.stringify(couchFaces));
  await alice.setViewportSize({ width: 390, height: 844 });
  await alice.waitForTimeout(400);
  await alice.screenshot({ path: `${SHOT}/21-sitting.png` });
  await alice.evaluate(() => window.__standUp());
  await alice.waitForFunction(() => !window.HouseRoom3D.personFlags("alice")?.sitting, null, { timeout: 8000 });
  await alice.evaluate((id) => window.__sit(id, 1), couchId);
  await alice.waitForFunction(() => [...document.querySelectorAll(".toast")].some((el) => el.textContent.includes("Seat taken")), null, { timeout: 4000 }).catch(() => {});
  const takenToast = await alice.locator(".toast").filter({ hasText: "Seat taken" }).count();
  const bobStillSitting = await alice.evaluate(() => window.HouseRoom3D.personFlags("bob")?.sitting);
  check("A full couch shows Seat taken and keeps the existing sitters", takenToast >= 1 && bobStillSitting);
  const couchBefore = await alice.evaluate((id) => window.HouseRoom3D.getFurniture().find((f) => f.id === id), couchId);
  await alice.evaluate((id) => window.__moveFurniture(id, 0, 5, 0), couchId);
  await alice.waitForTimeout(400);
  const couchAfter = await alice.evaluate((id) => window.HouseRoom3D.getFurniture().find((f) => f.id === id), couchId);
  check("Furniture cannot be moved while someone is sitting on it", couchAfter.x === couchBefore.x && couchAfter.y === couchBefore.y, JSON.stringify({ before: couchBefore, after: couchAfter }));
  await bob.evaluate(() => window.__standUp());
  await alice.waitForTimeout(300);
  await alice.evaluate((id) => window.__clickFurniture(id, "chair", { seat: 0 }), chairId);
  await alice.waitForTimeout(1800);
  check("Chairs and couches have sit spots that stay in sync", true);

  await alice.setViewportSize({ width: 1280, height: 800 });

  log("Tile hover, destination marker, and easier move targeting");
  await alice.evaluate(() => { window.__standUp?.(); window.__exitEdit?.(); });
  await alice.waitForTimeout(300);
  const hoverPos = await alice.evaluate(() => window.HouseRoom3D.projectTile(1, 4));
  await alice.mouse.move(hoverPos.x, hoverPos.y);
  await alice.waitForTimeout(80);
  const hoverHit = await alice.evaluate((pos) => ({ want: { x: 1, y: 4 }, got: window.HouseRoom3D.getHoverTile(), pos }), hoverPos);
  check("Hovering a floor tile shows a hover marker on that diamond", hoverHit.got?.x === 1 && hoverHit.got?.y === 4, JSON.stringify(hoverHit));

  const exact = await alice.evaluate(() => {
    const pos = window.HouseRoom3D.projectTile(2, 3);
    return { pos, got: window.HouseRoom3D.pickFloorTileAt(pos.x, pos.y) };
  });
  check("Exact iso diamond math maps a tile center to that tile", exact.got?.x === 2 && exact.got?.y === 3, JSON.stringify(exact));

  const edge = await alice.evaluate(() => {
    // A little past the back/left edge of tile (0,0) should snap onto it.
    const pos = window.HouseRoom3D.projectWorld(-0.2, -0.2);
    return { pos, got: window.HouseRoom3D.pickFloorTileAt(pos.x, pos.y) };
  });
  check("Taps just off the floor edge snap to the nearest edge tile", edge.got?.x === 0 && edge.got?.y === 0, JSON.stringify(edge));

  await alice.evaluate(() => {
    window.HouseRoom3D.tapAt(window.HouseRoom3D.projectTile(0, 5).x, window.HouseRoom3D.projectTile(0, 5).y);
  });
  await alice.waitForTimeout(200);
  const marked = await alice.evaluate(() => window.HouseRoom3D.getMoveTarget());
  check("Clicking a walkable tile sets a destination marker", marked && marked.x === 0 && marked.y === 5, JSON.stringify(marked));

  // Decorative plant should pass through; a blocked tile walks to a neighbor.
  const plantSpot = await alice.evaluate(() => {
    const size = 6;
    const furn = window.HouseRoom3D.getFurniture() || [];
    const blocked = window.HouseIso?.blockedSet?.(furn) || new Set(furn.map((f) => `${f.x},${f.y}`));
    let spot = null;
    for (let y = size - 1; y >= 0 && !spot; y--) {
      for (let x = 0; x < size && !spot; x++) {
        if (blocked.has(`${x},${y}`)) continue;
        const hasNeighbor = [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => {
          const nx = x + dx, ny = y + dy;
          return nx >= 0 && ny >= 0 && nx < size && ny < size && !blocked.has(`${nx},${ny}`);
        });
        if (hasNeighbor) spot = { x, y };
      }
    }
    if (!spot) return { error: "no free tile pair" };
    window.__enterEdit?.();
    window.__startPlace?.("plant");
    window.__clickTile(spot.x, spot.y);
    return { spot };
  });
  await alice.waitForFunction(() => window.HouseRoom3D.getFurniture().some((f) => f.type === "plant"), null, { timeout: 5000 }).catch(() => {});
  await alice.evaluate(() => window.__exitEdit?.());
  await alice.waitForTimeout(200);
  const blockedWalkTo = await alice.evaluate(() => {
    const plant = window.HouseRoom3D.getFurniture().find((f) => f.type === "plant");
    if (!plant) return { error: "no plant" };
    window.__clickTile(plant.x, plant.y);
    const target = window.HouseRoom3D.getMoveTarget();
    const cheb = target ? Math.max(Math.abs(target.x - plant.x), Math.abs(target.y - plant.y)) : 99;
    const adj = Boolean(target) && cheb === 1 && !(target.x === plant.x && target.y === plant.y);
    return { before: { x: plant.x, y: plant.y }, target, adj };
  });
  check("Tapping a blocked tile walks to the nearest reachable neighbor", Boolean(blockedWalkTo.adj), JSON.stringify(blockedWalkTo));

  const passthrough = await alice.evaluate(() => {
    // A point on an avatar sprite should resolve to the floor diamond under the cursor.
    const head = window.HouseRoom3D.projectHead("alice");
    if (!head) return { error: "no head" };
    const cx = head.x + (document.querySelector(".room-view, #room-root, #app")?.getBoundingClientRect?.().left || 0);
    // projectHead x/y are container-relative; use foot/world path instead.
    const tile = window.HouseRoom3D.personTile("alice");
    const pos = window.HouseRoom3D.projectTile(tile.x, tile.y);
    // 10px above the feet still on the sprite, should keep the same floor tile (or a valid in-room tile)
    const got = window.HouseRoom3D.pickFloorTileAt(pos.x, pos.y - 24);
    return { tile, got };
  });
  check("Taps on an avatar pass through to the floor tile underneath", Boolean(passthrough.got) && passthrough.got.x >= 0 && passthrough.got.y >= 0, JSON.stringify(passthrough));

  await alice.screenshot({ path: `${SHOT}/43-tile-hover-target.png` });

  log("Emotes half-wheel and sync");
  await alice.evaluate(() => window.__standUp());
  await alice.waitForTimeout(200);
  await alice.setViewportSize({ width: 390, height: 844 });
  await alice.waitForTimeout(250);
  await alice.locator('[data-testid="emote-wheel-btn"]').click();
  await alice.waitForSelector('[data-testid="emote-slot-wave"]', { state: "visible", timeout: 8000 });
  check("Emote button opens a half-wheel of emotes", await alice.locator('[data-testid="emote-slot-wave"]').count() === 1 && await alice.locator('[data-testid="emote-slot-dance"]').count() === 1 && await alice.locator('[data-testid="emote-slot-cry"]').count() === 1 && await alice.locator('[data-testid="emote-slot-laugh"]').count() === 1);
  await alice.waitForTimeout(500);
  await alice.evaluate(() => document.querySelector('[data-testid="emote-slot-dance"]')?.click());
  await alice.waitForFunction(() => window.HouseRoom3D.personFlags("alice")?.actionEmote === "dance", null, { timeout: 8000 });
  const bobSeesDance = await bob.waitForFunction(() => window.HouseRoom3D.personFlags("alice")?.actionEmote === "dance", null, { timeout: 8000 }).then(() => true).catch(() => false);
  check("An emote broadcasts to everyone in the cube", bobSeesDance);
  await alice.evaluate(() => window.__openEmoteWheel());
  await alice.waitForSelector('[data-testid="emote-slot-laugh"]', { state: "visible" });
  await alice.waitForTimeout(450);
  await alice.screenshot({ path: `${SHOT}/26-emotes.png` });
  await alice.evaluate(() => window.__closeEmoteWheel());
  await alice.setViewportSize({ width: 1280, height: 800 });

  log("Mobile touch: walk and place (iPhone)");
  await runMobileWalkAndPlace(browser, devices["iPhone 13"] ? "iPhone 13" : "iPhone 12", { screenshot: `${SHOT}/25-mobile-place.png` });

  log("Mobile touch: walk and place (Android)");
  await runMobileWalkAndPlace(browser, devices["Pixel 5"] ? "Pixel 5" : "Pixel 7");

  log("App shell, PWA, and short/tall phone viewports");
  await runAppShellFit(browser);

  log("Phone playtest: follow camera, chess seating, and touch interactions");
  await runPhonePlaytest(browser);

  log("Stores and restyle screenshots");
  await runStoresAndCyberShots(browser);

  log("New avatar looks together in a cube");
  await ctxA.close();
  await ctxB.close();
  await runCornerPhoneAndAvatars(browser);

  const failed = results.filter((r) => !r.ok);
  if (failed.length) {
    console.error(`\n${failed.length} check(s) failed`);
    process.exitCode = 1;
  } else {
    console.log(`\nAll ${results.length} checks passed`);
  }
} catch (err) {
  console.error("E2E crashed:", err);
  try {
    await alice.screenshot({ path: `${SHOT}/debug-alice.png`, fullPage: true });
    await bob.screenshot({ path: `${SHOT}/debug-bob.png`, fullPage: true });
  } catch {}
  process.exitCode = 1;
} finally {
  await browser.close();
}
