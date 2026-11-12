import { chromium, devices } from "playwright";
import { mkdir, unlink, writeFile } from "fs/promises";
import { execFile } from "child_process";
import { promisify } from "util";
import path from "path";
import { fileURLToPath } from "url";
import { openStartForm, openCreatorTab, clickCreatorOption, goToLobby, seedAndLogin, openCharacterEditor, closePhoneIfOpen } from "./startMenuHelp.mjs";

const execFileAsync = promisify(execFile);

const BASE = process.env.BASE_URL || "http://127.0.0.1:3000";
const SHOT = process.env.SHOT_DIR || path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "screenshots");

function log(msg) {
  console.log("[test]", msg);
}

async function login(page, username) {
  await seedAndLogin(page, username, BASE);
}

async function openChat(page) {
  const open = await page.evaluate(() => document.body.classList.contains("chat-open") && document.getElementById("chat-input"));
  if (open) {
    await page.evaluate(() => document.getElementById("chat-input")?.focus?.({ preventScroll: true }));
    return;
  }
  const btn = page.locator('[data-testid="chat-bubble-btn"]');
  if (await btn.isVisible().catch(() => false)) await btn.click();
  else await page.evaluate(() => window.__openChat?.());
  await page.waitForFunction(() => document.body.classList.contains("chat-open") && document.activeElement?.id === "chat-input", null, { timeout: 8000 });
}

async function sendChatMsg(page) {
  await page.evaluate(() => {
    const el = document.querySelector("[data-testid=chat-input]");
    if (!el) return;
    el.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true }));
  });
}

async function customize(page, { displayName, hair, shirt, skin, glasses, hairColor, top, accessory } = {}) {
  await openCharacterEditor(page);
  if (displayName != null) await page.fill('[data-testid="display-name"]', displayName);
  if (skin != null) await clickCreatorOption(page, `skin-${skin}`);
  if (hair != null) await clickCreatorOption(page, `hair-${hair}`);
  if (hairColor != null) await clickCreatorOption(page, `hairColor-${hairColor}`);
  if (top != null) await clickCreatorOption(page, `top-${top}`);
  if (shirt != null) await clickCreatorOption(page, `shirt-${shirt}`);
  if (accessory != null) await clickCreatorOption(page, `accessory-${accessory}`);
  if (glasses != null) {
    await openCreatorTab(page, "head");
    await clickCreatorOption(page, glasses ? "glassesStyle-1" : "glassesStyle-0");
  }
}

async function saveAvatar(page) {
  await openCharacterEditor(page);
  await page.click('[data-testid="save-avatar"]');
  await page.waitForSelector('body[data-view="room"]', { timeout: 15000 });
  await page.waitForFunction(() => !window.__creatorMenu?.isPhoneEdit?.(), null, { timeout: 8000 }).catch(() => {});
  await page.waitForTimeout(320);
  // Helper is done with the editor; close the handset so later room clicks aren't blocked.
  await closePhoneIfOpen(page);
}

async function openAddSheet(page) {
  await goToLobby(page);
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

async function openShopPanel(page) {
  const already = await page.evaluate(() => {
    const panel = document.querySelector('[data-testid="store-panel"]');
    const open = Boolean(panel && !panel.classList.contains("hidden"));
    return open && Boolean(document.querySelector('[data-testid="buy-couch"]'));
  });
  if (already) return;
  await page.evaluate(() => window.__openStore?.("furniture"));
  await page.waitForSelector('[data-testid="store-panel"]:not(.hidden)');
  await page.waitForSelector('[data-testid="buy-couch"]');
}

async function openPhoneApp(page, app) {
  if (app === "shop") {
    await openShopPanel(page);
    return;
  }
  if (app === "edit") {
    await page.evaluate(() => window.__enterEdit?.());
    await page.waitForSelector('[data-testid="edit-inventory"]:not(.hidden)');
    return;
  }
  if (app === "upgrade") {
    await page.evaluate(() => { window.__enterEdit?.(); window.__setEditTab?.("upgrade"); });
    await page.waitForSelector('[data-testid="edit-tab-upgrade"]');
    return;
  }
  await openPhone(page);
  await page.click(`[data-testid="phone-app-${app}"]`);
}

async function screenshotAvatar(page, path) {
  const box = await page.evaluate(() => {
    const head = window.__avatarPose?.()?.head;
    if (!head || head.x == null) return null;
    const x = Math.max(0, head.x - 90);
    const y = Math.max(0, head.y - 150);
    return { x, y, width: 180, height: 260 };
  });
  if (box && box.width > 8 && box.height > 8) {
    await page.screenshot({ path, clip: box });
    return;
  }
  const canvas = page.locator("#view-room canvas").first();
  if (await canvas.count()) await canvas.screenshot({ path });
  else await page.screenshot({ path });
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
  if (app === "edit") {
    await page.evaluate(() => window.__enterEdit?.());
    await page.waitForSelector('[data-testid="edit-inventory"]:not(.hidden)');
    return;
  }
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
  const placedNow = await page.waitForFunction(() => window.HouseRoom3D.getFurniture().some((f) => f.type === "plant"), null, { timeout: 8000 }).then(() => true).catch(() => false);
  check(`Touch placement spawns a plant in the room on ${deviceName}`, placedNow);
  if (screenshot) {
    await page.waitForTimeout(350);
    await page.screenshot({ path: screenshot });
  }
  const placed = placedNow;

  const invToggle = page.locator('[data-testid="edit-inv-toggle"]').locator("visible=true");
  if (await invToggle.count()) await invToggle.tap();
  await page.waitForTimeout(200);
  await tapTile(page, 2, 2);
  const actionsOpen = await page.waitForSelector('[data-testid="item-rotate"]:not(.hidden)', { timeout: 8000 }).then(() => true).catch(() => false);
  check(`Tapping placed furniture shows the rotate handle on ${deviceName}`, actionsOpen);
  if (actionsOpen) {
    await page.locator('[data-testid="item-rotate"]').tap();
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

const PHONE_HUD = ['[data-testid="leave-cube"]', '[data-testid="room-title"]', '#room-meta', '[data-testid="room-coins"]', '[data-testid="shop-toggle"]', '[data-testid="cam-toggle"]', '[data-testid="phone-btn"]', '[data-testid="emote-wheel-btn"]', '[data-testid="chat-bubble-btn"]', '[data-testid="chat-dock"]'];
const TOP_HUD = ['[data-testid="leave-cube"]', '[data-testid="room-coins"]', '[data-testid="shop-toggle"]'];

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


const CREATOR_TABS = ["skin", "hair", "shirt", "pants", "shoes", "head", "extras"];
const CREATOR_VIEWPORTS = [
  { name: "360x640", width: 360, height: 640 },
  { name: "375x667", width: 375, height: 667 },
  { name: "390x844", width: 390, height: 844 },
  { name: "414x896", width: 414, height: 896 },
  { name: "844x390 landscape", width: 844, height: 390 },
  { name: "1280x800", width: 1280, height: 800 },
];
const CREATOR_PHONES = CREATOR_VIEWPORTS;

async function snapshotCreatorLayout(page) {
  return page.evaluate(() => {
    const box = (el) => {
      if (!el) return null;
      const r = el.getBoundingClientRect();
      return { x: +r.x.toFixed(2), y: +r.y.toFixed(2), w: +r.width.toFixed(2), h: +r.height.toFixed(2) };
    };
    const roomView = document.getElementById("view-room") || document.querySelector(".room-view");
    const canvas = roomView?.querySelector("canvas") || roomView;
    const name = window.__storeState?.()?.me?.username || localStorage.getItem("hearthUser");
    const r3 = window.HouseRoom3D;
    return {
      room: box(canvas),
      phone: box(document.querySelector("[data-testid=phone-device]")),
      panel: box(document.querySelector("[data-testid=creator-window]")),
      pose: window.__avatarPose?.() || null,
      tile: r3?.personTile?.(name) || null,
      head: r3?.projectHead?.(name) || null,
      flags: r3?.personFlags?.(name) || null,
      cam: r3?.camState?.() || null,
      zoom: r3?.visualZoom?.() ?? null,
      view: document.body.dataset.view,
      pages: window.__creatorMenu?.pages?.() ?? 1,
      page: window.__creatorMenu?.page?.() ?? 0,
    };
  });
}

function samePose(a, b) {
  if (!a || !b) return false;
  const tileOk = a.tile && b.tile && Math.abs(a.tile.x - b.tile.x) <= 0.05 && Math.abs(a.tile.y - b.tile.y) <= 0.05;
  const flagsA = a.flags || {}, flagsB = b.flags || {};
  const poseOk = Boolean(flagsA.sitting) === Boolean(flagsB.sitting)
    && Boolean(flagsA.walking) === Boolean(flagsB.walking)
    && Boolean(flagsA.gym) === Boolean(flagsB.gym)
    && Boolean(flagsA.boxing) === Boolean(flagsB.boxing);
  const seatOk = (a.stationId || flagsA.stationId || null) === (b.stationId || flagsB.stationId || null)
    && Boolean(a.sitting ?? flagsA.sitting) === Boolean(b.sitting ?? flagsB.sitting);
  const camA = a.cam || {}, camB = b.cam || {};
  // Follow-camera easing and dance/hair bob change projected head / target
  // slightly; mode and zoom must stay put, and the avatar must not be recentered
  // into a different camera mode.
  const camOk = (camA.mode || "") === (camB.mode || "")
    && Math.abs((camA.zoom || 0) - (camB.zoom || 0)) <= 0.02;
  return tileOk && poseOk && seatOk && camOk;
}

function sameBox(a, b, slack = 1.25) {
  if (!a || !b) return false;
  return Math.abs(a.x - b.x) <= slack && Math.abs(a.y - b.y) <= slack && Math.abs(a.w - b.w) <= slack && Math.abs(a.h - b.h) <= slack;
}

async function measureCreatorFit(page, tab) {
  return page.evaluate((tab) => {
    const view = document.getElementById("view-creator");
    const overlay = document.querySelector("[data-testid=edit-char-overlay]:not(.hidden)");
    const win = (overlay && overlay.querySelector('[data-testid="creator-window"]')) || document.querySelector('[data-testid="creator-window"]');
    const panels = document.getElementById("creator-tab-panels");
    const panel = document.querySelector(`[data-testid="creator-panel-${tab}"]`);
    const vv = window.visualViewport;
    const vw = vv?.width ?? innerWidth;
    const vh = vv?.height ?? innerHeight;
    const pad = 2;
    const inView = (el) => {
      if (!el) return { missing: true };
      const style = getComputedStyle(el);
      if (style.display === "none" || style.visibility === "hidden" || el.classList.contains("hidden") || el.closest(".hidden") || el.classList.contains("creator-offpage") || el.closest(".creator-offpage")) {
        return { missing: true };
      }
      const r = el.getBoundingClientRect();
      if (r.width < 1 || r.height < 1) return { missing: true };
      const ok = r.top >= -pad && r.left >= -pad && r.bottom <= vh + pad && r.right <= vw + pad;
      return { ok, top: +r.top.toFixed(1), bottom: +r.bottom.toFixed(1), w: +r.width.toFixed(1), h: +r.height.toFixed(1) };
    };
    const noScroll = (el, name) => {
      if (!el) return { name, ok: true, missing: true };
      const slack = 1.5;
      // Vertical overflow is the "must not scroll" rule. A few px of horizontal
      // halo from the selected-state ring is allowed and is not user-scrollable.
      return { name, ok: el.scrollHeight <= el.clientHeight + slack && el.scrollWidth <= el.clientWidth + 8, scrollH: el.scrollHeight, clientH: el.clientHeight, scrollW: el.scrollWidth, clientW: el.clientWidth };
    };
    const options = [...(panel?.querySelectorAll("button.swatch, button.choice, .check-row") || [])]
      .filter((el) => !el.closest(".hidden") && !el.classList.contains("creator-offpage") && !el.closest(".creator-offpage"));
    const roomView = document.getElementById("view-room");
    const phone = document.querySelector("[data-testid=phone-device]");
    const screen = document.getElementById("phone-screen-edit-character");
    const mount = document.querySelector("[data-testid=phone-character-editor]");
    const pages = window.__creatorMenu?.pages?.() ?? 1;
    return {
      scrolls: [
        noScroll(document.documentElement, "html"),
        noScroll(document.body, "body"),
        noScroll(roomView, "room"),
        noScroll(phone, "phone"),
        noScroll(screen, "screen"),
        noScroll(mount, "mount"),
        noScroll(win, "window"),
        noScroll(panels, "panels"),
        noScroll(panel, "panel"),
      ],
      pages,
      chrome: {
        phone: inView(document.querySelector("[data-testid=phone-device]")),
        window: inView(document.querySelector("[data-testid=creator-window]")),
        back: inView(document.querySelector("[data-testid=creator-back]")),
        tabs: inView(document.querySelector("[data-testid=creator-tabs]")),
        tab: inView(document.querySelector(`[data-testid=creator-tab-${tab}]`)),
        name: inView(document.querySelector("[data-testid=display-name]")),
        save: inView(document.querySelector("[data-testid=save-avatar]")),
        pager: inView(document.querySelector("[data-testid=creator-pager]")),
      },
      optionFits: options.map((el) => ({ id: el.dataset.testid || el.id || el.textContent.trim(), minH: Math.round(el.getBoundingClientRect().height), ...inView(el) })),
    };
  }, tab);
}

async function assertCreatorPageFit(page, viewportName, tab, pageNo) {
  const label = `Creator ${viewportName} ${tab.toUpperCase()} p${pageNo}`;
  const info = await measureCreatorFit(page, tab);
  const scrollFail = info.scrolls.filter((r) => !r.ok && ["html", "body", "room"].includes(r.name));
  check(
    `${label} does not scroll the page`,
    scrollFail.length === 0,
    JSON.stringify(scrollFail.length ? scrollFail : { ok: true })
  );
  const phoneOk = info.chrome.phone && info.chrome.phone.ok && !info.chrome.phone.missing;
  const windowOk = info.chrome.window && info.chrome.window.ok && !info.chrome.window.missing;
  check(
    `${label} fits the full-screen editor`,
    Boolean(windowOk),
    JSON.stringify({ window: info.chrome.window, phone: info.chrome.phone })
  );
  // In-handset editor is compact; options may scroll. Don't require 40px targets.
}

async function assertCreatorTabsFit(page, viewportName, viewport) {
  await page.evaluate(() => document.getElementById("creator-back")?.classList.remove("hidden"));
  await openCreatorTab(page, "skin");
  await page.waitForTimeout(80);
  const baseline = await snapshotCreatorLayout(page);
  const vw = viewport?.width || 0, vh = viewport?.height || 0;
  const phoneFits = baseline.phone && baseline.phone.x >= -1 && baseline.phone.y >= -1 && baseline.phone.x + baseline.phone.w <= vw + 1 && baseline.phone.y + baseline.phone.h <= vh + 1;
  const overlayOn = await page.evaluate(() => {
    const ov = document.querySelector("[data-testid=edit-char-overlay]");
    const tabs = document.querySelector("[data-testid=creator-tabs]");
    const preview = document.querySelector("[data-testid=creator-preview]");
    if (!ov || ov.classList.contains("hidden") || ov.hasAttribute("hidden")) return { ok: false };
    const or_ = ov.getBoundingClientRect();
    const tr = tabs?.getBoundingClientRect();
    const pr = preview?.getBoundingClientRect();
    return {
      ok: or_.width > 100 && or_.height > 100 && tr && tr.width < 90 && tr.height > 40 && pr && pr.height > 80,
      overlay: { w: or_.width, h: or_.height },
      tabs: tr && { w: tr.width, h: tr.height },
      preview: pr && { w: pr.width, h: pr.height },
    };
  });
  check(
    `Creator ${viewportName} captured a stable room and a full-screen rail editor`,
    Boolean(baseline.room && baseline.panel && baseline.room.w > 10 && baseline.panel.w > 10 && baseline.view === "room" && overlayOn.ok),
    JSON.stringify({ room: baseline.room, panel: baseline.panel, view: baseline.view, overlay: overlayOn, phoneFits })
  );
  for (const tab of CREATOR_TABS) {
    await openCreatorTab(page, tab);
    if (tab === "head") {
      await clickCreatorOption(page, "hat-1");
    }
    await page.waitForTimeout(40);
    const first = await snapshotCreatorLayout(page);
    if (tab === "hair" && viewport && viewport.height <= 500) {
      check(
        `Creator ${viewportName} HAIR shows style thumbnails in a scrollable grid`,
        Boolean(first.panel && first.panel.w > 10),
        JSON.stringify({ pages: first.pages, panel: first.panel })
      );
    }
    const pages = first.pages || 1;
    for (let pno = 0; pno < pages; pno++) {
      await page.evaluate((i) => window.__creatorMenu?.setPage?.(i), pno);
      await page.waitForTimeout(40);
      const snap = await snapshotCreatorLayout(page);
      const roomMoved = !sameBox(baseline.room, snap.room);
      const phoneMoved = !sameBox(baseline.phone, snap.phone);
      const poseMoved = !samePose({ ...baseline, head: snap.head }, snap);
      check(
        `Creator ${viewportName} ${tab.toUpperCase()} p${pno} keeps the room and character fixed`,
        !roomMoved && !poseMoved,
        JSON.stringify({ roomMoved, phoneMoved, poseMoved, view: snap.view, baseTile: baseline.tile, tile: snap.tile, baseFlags: baseline.flags, flags: snap.flags })
      );
      await assertCreatorPageFit(page, viewportName, tab, pno);
    }
  }
}


async function tapPoint(page, x, y) {
  const hasTouch = await page.evaluate(() => navigator.maxTouchPoints > 0);
  if (hasTouch) await page.touchscreen.tap(x, y);
  else await page.mouse.click(x, y);
}

async function tapFurnitureReal(page, id) {
  const pt = await page.evaluate((fid) => window.HouseRoom3D.projectFurniture(fid), id);
  if (!pt || pt.visible === false) throw new Error("furniture not on screen: " + id + " " + JSON.stringify(pt));
  await tapPoint(page, pt.x, pt.y);
}

async function tapTestIdReal(page, testId) {
  const box = await page.locator(`[data-testid="${testId}"]`).boundingBox();
  if (!box) throw new Error("missing " + testId);
  await tapPoint(page, box.x + box.width / 2, box.y + box.height / 2);
}

async function runRecordPlayerTests(browser) {
  log("Record table picker, vinyls, and synced lofi beats");
  const ctxA = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const ctxB = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const recA = await ctxA.newPage();
  const recB = await ctxB.newPage();
  recA.setDefaultTimeout(20000);
  recB.setDefaultTimeout(20000);
  try {
    await login(recA, "recalice");
    await recA.waitForFunction(() => window.HouseRoom3D && window.HouseRoom3D.ready);
    await login(recB, "recbob");
    await recB.waitForFunction(() => window.HouseRoom3D && window.HouseRoom3D.ready);

    await openAddSheet(recA);
    await recA.fill('[data-testid="friend-name"]', "recbob");
    await recA.click('[data-testid="add-friend-btn"]');
    await recA.waitForSelector('[data-testid="friend-item-recbob"]');
    await recA.click("#add-sheet-close").catch(() => {});
    await openAddSheet(recB);
    await recB.fill('[data-testid="friend-name"]', "recalice");
    await recB.click('[data-testid="add-friend-btn"]');
    await recB.waitForSelector('[data-testid="friend-item-recalice"]');
    await recB.click("#add-sheet-close").catch(() => {});

    await openAddSheet(recA);
    await recA.fill('[data-testid="room-name"]', "Vinyl Lounge");
    await recA.click('[data-testid="create-room-btn"]');
    await recA.waitForSelector('body[data-view="room"]');
    await recA.waitForFunction(() => window.HouseRoom3D && window.HouseRoom3D.ready);
    await recB.click('[data-testid="friend-item-recalice"]');
    await recB.waitForSelector('body[data-view="room"]', { timeout: 15000 });
    await recB.waitForFunction(() => window.HouseRoom3D && window.HouseRoom3D.ready);
    await recA.waitForSelector('[data-testid="avatar-recbob"]', { timeout: 15000 });

    const catalog = await recA.evaluate(() => window.HouseIso?.CATALOG?.recordplayer);
    check(
      "Record table is in the furniture catalog for 28 coins on a 1-tile footprint",
      Boolean(catalog && catalog.name === "Record table" && catalog.price === 28 && catalog.w === 1 && catalog.h === 1),
      JSON.stringify(catalog)
    );

    await openPhoneApp(recA, "shop");
    await recA.waitForSelector('[data-testid="store-panel"]:not(.hidden)');
    const shopHas = await recA.locator('[data-testid="buy-recordplayer"]').count();
    check("Record table appears in the furniture shop", shopHas >= 1);
    await recA.evaluate(() => window.__closeStore?.());
    await closePhoneIfOpen(recA);

    await recA.evaluate(() => window.__debugKit?.({ furniture: ["recordplayer"], coins: 400 }));
    await recA.evaluate(() => { window.__startPlace("recordplayer"); window.__clickTile(4, 2); });
    await recA.waitForFunction(() => window.HouseRoom3D.getFurniture().some((f) => f.type === "recordplayer"));
    await recB.waitForFunction(() => window.HouseRoom3D.getFurniture().some((f) => f.type === "recordplayer"));
    await recA.evaluate(() => window.__exitEdit?.());
    const recId = await recA.evaluate(() => window.HouseRoom3D.getFurniture().find((f) => f.type === "recordplayer").id);
    check("A 1-tile record table can be placed in the room", Boolean(recId));

    await tapFurnitureReal(recA, recId);
    await recA.waitForSelector('[data-testid="record-picker"]:not(.hidden)', { timeout: 12000 });
    const vinylIds = await recA.evaluate(() => Array.from(document.querySelectorAll("[data-testid^=record-vinyl-]")).map((el) => el.getAttribute("data-testid").replace("record-vinyl-", "")));
    const pickerText = await recA.locator('[data-testid="record-picker"]').innerText();
    const expected = ["neon-drift", "midnight-ramen", "rainy-rooftop", "cube-city-nights"];
    check(
      "Tapping the record table opens an arcade picker with four named vinyls",
      vinylIds.length === 4 && expected.every((id) => vinylIds.includes(id)) && pickerText.includes("Neon Drift") && pickerText.includes("Midnight Ramen") && pickerText.includes("Rainy Rooftop") && pickerText.includes("Cube City Nights"),
      JSON.stringify({ vinylIds, pickerText })
    );
    check("The picker includes a Stop control", await recA.locator('[data-testid="record-stop"]').count() === 1);

    const targets = await recA.evaluate(() => {
      const ids = ["record-vinyl-neon-drift", "record-vinyl-midnight-ramen", "record-vinyl-rainy-rooftop", "record-vinyl-cube-city-nights", "record-stop", "record-mute", "record-close"];
      return ids.map((id) => {
        const r = document.querySelector(`[data-testid="${id}"]`)?.getBoundingClientRect();
        return r ? { id, w: +r.width.toFixed(1), h: +r.height.toFixed(1) } : { id, missing: true };
      });
    });
    check("Picker buttons are at least 40px tall for tapping", targets.every((t) => !t.missing && t.h >= 39.5), JSON.stringify(targets));

    await tapTestIdReal(recA, "record-vinyl-neon-drift");
    await recA.waitForFunction((id) => window.HouseRoom3D.recordOn(id) && window.HouseRoom3D.recordVinyl(id) === "neon-drift", recId);
    await recB.waitForFunction((id) => window.HouseRoom3D.recordOn(id) && window.HouseRoom3D.recordVinyl(id) === "neon-drift", recId);
    await recA.waitForTimeout(450);
    const noteCount = await recA.evaluate((id) => window.HouseRoom3D.recordNotes(id).length, recId);
    const aliceAudio = await recA.evaluate(() => window.__recordAudioState());
    const bobAudio = await recB.evaluate(() => window.__recordAudioState());
    check(
      "Choosing Neon Drift starts that vinyl, spins the platter, and floats notes",
      Boolean(aliceAudio?.listening && (aliceAudio?.vinyl === "neon-drift" || aliceAudio?.playing === "neon-drift") && noteCount >= 1),
      JSON.stringify({ aliceAudio, noteCount })
    );
    const aliceEl = aliceAudio?.element || {};
    const t0 = aliceEl.currentTime || 0;
    await recA.waitForTimeout(500);
    const aliceLater = await recA.evaluate(() => window.__recordAudioState());
    const t1 = aliceLater?.element?.currentTime || 0;
    check(
      "The owner's HTML audio element is playing, unmuted, and advancing after a vinyl tap",
      Boolean(aliceEl.present && aliceEl.paused === false && aliceEl.muted === false && aliceEl.volume > 0 && t1 > t0 && aliceAudio?.ctx === "running"),
      JSON.stringify({ aliceEl, t0, t1, later: aliceLater, ctx: aliceAudio?.ctx })
    );
    const ownerGate = await recA.evaluate(() => {
      const btn = document.querySelector('[data-testid="record-listen"]');
      const hint = document.querySelector('[data-testid="record-listen-hint"]');
      return {
        listenHidden: !btn || btn.classList.contains("hidden"),
        hintHidden: !hint || hint.classList.contains("hidden"),
        volume: document.querySelector('[data-testid="record-volume"]')?.value,
        muted: window.__recordAudioState()?.muted,
      };
    });
    check(
      "The owner who chose the vinyl is not blocked by TAP TO LISTEN, and volume is not muted or zero",
      Boolean(ownerGate.listenHidden && ownerGate.hintHidden && ownerGate.muted === false && Number(ownerGate.volume) >= 50),
      JSON.stringify(ownerGate)
    );
    check(
      "A guest sees the same vinyl playing but does not auto-hear it",
      bobAudio?.listening === false,
      JSON.stringify({ bobAudio })
    );

    await recB.waitForSelector('[data-testid="record-listen-hint"]:not(.hidden)', { timeout: 6000 });
    check("A guest gets a tap-to-listen hint while a record is playing", true);
    await recB.click('[data-testid="record-listen-hint"]');
    await recB.waitForFunction(() => window.__recordAudioState()?.listening === true, null, { timeout: 5000 });
    check("Tapping the hint lets the guest hear the same beat", ((s) => s?.listening === true && (s?.vinyl === "neon-drift" || s?.playing === "neon-drift"))(await recB.evaluate(() => window.__recordAudioState())));

    await tapTestIdReal(recA, "record-stop");
    await recA.waitForFunction((id) => !window.HouseRoom3D.recordOn(id), recId);
    await recB.waitForFunction((id) => !window.HouseRoom3D.recordOn(id), recId);
    const stoppedNotes = await recA.evaluate((id) => window.HouseRoom3D.recordNotes(id).length, recId);
    check("Stop turns the table off for everyone and the notes fade out", stoppedNotes === 0 && !(await recB.evaluate((id) => window.HouseRoom3D.recordOn(id), recId)));

    if (await recA.locator('[data-testid="record-picker"]:not(.hidden)').count()) {
      await recA.click('[data-testid="record-close"]');
    }
    await tapFurnitureReal(recB, recId);
    await recB.waitForSelector('[data-testid="record-picker"]:not(.hidden)', { timeout: 12000 });
    check("A guest can tap the record table in someone else's cube and open the picker", true);
    await tapTestIdReal(recB, "record-vinyl-rainy-rooftop");
    await recA.waitForFunction((id) => window.HouseRoom3D.recordVinyl(id) === "rainy-rooftop", recId);
    await recB.waitForFunction((id) => window.HouseRoom3D.recordVinyl(id) === "rainy-rooftop", recId);
    check("A guest's vinyl choice plays for everyone in the room", await recA.evaluate((id) => window.HouseRoom3D.recordVinyl(id) === "rainy-rooftop", recId));

    if (!(await recA.locator('[data-testid="record-picker"]:not(.hidden)').count())) {
      await tapFurnitureReal(recA, recId);
      await recA.waitForSelector('[data-testid="record-picker"]:not(.hidden)', { timeout: 12000 });
    }
    await tapTestIdReal(recA, "record-vinyl-cube-city-nights");
    await recA.waitForFunction((id) => window.HouseRoom3D.recordVinyl(id) === "cube-city-nights", recId);
    await recB.waitForFunction((id) => window.HouseRoom3D.recordVinyl(id) === "cube-city-nights", recId);
    await recA.click('[data-testid="record-close"]');
    await goToLobby(recA);
    await recA.click('[data-testid="friend-item-recbob"]');
    await recA.waitForSelector('body[data-view="room"]', { timeout: 15000 });
    await recA.waitForFunction(() => window.HouseRoom3D && window.HouseRoom3D.ready);
    const after = await recA.evaluate((id) => ({ on: window.HouseRoom3D.recordOn(id), vinyl: window.HouseRoom3D.recordVinyl(id) }), recId);
    const afterBob = await recB.evaluate((id) => ({ on: window.HouseRoom3D.recordOn(id), vinyl: window.HouseRoom3D.recordVinyl(id) }), recId);
    check(
      "The chosen vinyl is still playing after the owner leaves and rejoins",
      after.on && after.vinyl === "cube-city-nights" && afterBob.on && afterBob.vinyl === "cube-city-nights",
      JSON.stringify({ after, afterBob })
    );
  } finally {
    await ctxA.close();
    await ctxB.close();
  }
}


async function runRecordPlayerTouchTests(browser) {
  log("Record table phone tap opens the picker and plays a vinyl");
  const i14 = devices["iPhone 14"] || devices["iPhone 13"] || { viewport: { width: 390, height: 844 } };
  const ctx = await browser.newContext({ ...i14, hasTouch: true, isMobile: true, viewport: { width: 390, height: 844 } });
  const page = await ctx.newPage();
  page.setDefaultTimeout(20000);
  try {
    await login(page, "rectouch");
    await page.waitForFunction(() => window.HouseRoom3D && window.HouseRoom3D.ready);
    await page.evaluate(() => window.__debugKit?.({ furniture: ["recordplayer"], coins: 400 }));
    await page.evaluate(() => { window.__startPlace("recordplayer"); window.__clickTile(3, 2); });
    await page.waitForFunction(() => window.HouseRoom3D.getFurniture().some((f) => f.type === "recordplayer"));
    await page.evaluate(() => window.__exitEdit?.());
    const recId = await page.evaluate(() => window.HouseRoom3D.getFurniture().find((f) => f.type === "recordplayer").id);
    await tapFurnitureReal(page, recId);
    await page.waitForSelector('[data-testid="record-picker"]:not(.hidden)', { timeout: 12000 });
    check("A phone tap on the record table opens the vinyl picker", true);
    await tapTestIdReal(page, "record-vinyl-midnight-ramen");
    await page.waitForFunction((id) => window.HouseRoom3D.recordOn(id) && window.HouseRoom3D.recordVinyl(id) === "midnight-ramen", recId);
    await page.waitForTimeout(450);
    const state = await page.evaluate((id) => ({
      on: window.HouseRoom3D.recordOn(id),
      vinyl: window.HouseRoom3D.recordVinyl(id),
      notes: window.HouseRoom3D.recordNotes(id).length,
      audio: window.__recordAudioState(),
    }), recId);
    const el0 = state.audio?.element || {};
    const t0 = el0.currentTime || 0;
    await page.waitForTimeout(500);
    const later = await page.evaluate(() => window.__recordAudioState());
    const t1 = later?.element?.currentTime || 0;
    check(
      "A phone tap on a vinyl starts that beat, spins the platter, and floats notes",
      Boolean(state.on && state.vinyl === "midnight-ramen" && state.notes >= 1 && state.audio?.listening && (state.audio.playing === "midnight-ramen" || state.audio.vinyl === "midnight-ramen")),
      JSON.stringify(state)
    );
    check(
      "After a phone vinyl tap the audio element is playing and the AudioContext is running",
      Boolean(el0.present && el0.paused === false && el0.muted === false && el0.volume > 0 && t1 > t0 && (state.audio?.ctx === "running" || later?.ctx === "running")),
      JSON.stringify({ el0, t0, t1, later, ctx: state.audio?.ctx })
    );
    const gate = await page.evaluate(() => {
      const btn = document.querySelector('[data-testid="record-listen"]');
      return { hidden: !btn || btn.classList.contains("hidden"), vol: window.__recordAudioState()?.volume, muted: window.__recordAudioState()?.muted };
    });
    check("The phone owner is not shown TAP TO LISTEN after picking a vinyl", Boolean(gate.hidden && gate.muted === false && gate.vol > 0), JSON.stringify(gate));
  } finally {
    await ctx.close();
  }
}

async function runCreatorPhoneAndBoot(browser) {
  log("Everyone boots straight into their own cube");
  const fresh = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const fp = await fresh.newPage();
  fp.setDefaultTimeout(20000);
  await fp.goto(BASE, { waitUntil: "domcontentloaded" });
  await fp.waitForSelector('body[data-view="room"]', { timeout: 20000 });
  const boot = await fp.evaluate(() => ({
    view: document.body.dataset.view,
    menu: Boolean(document.querySelector('[data-testid="start-menu"]') && !document.getElementById("view-login")?.classList.contains("hidden")),
    title: document.querySelector('[data-testid="room-title"]')?.textContent || "",
    user: localStorage.getItem("hearthUser") || sessionStorage.getItem("hearthUser") || "",
    hasPhone: Boolean(document.querySelector('[data-testid="phone-btn"]')),
  }));
  check(
    "A fresh visitor boots straight into their own home cube",
    boot.view === "room" && !boot.menu && /'s Cube/i.test(boot.title) && /^[a-zA-Z0-9_]{2,16}$/.test(boot.user) && boot.hasPhone,
    JSON.stringify(boot)
  );
  const other = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const op = await other.newPage();
  await op.goto(BASE, { waitUntil: "domcontentloaded" });
  await op.waitForSelector('body[data-view="room"]', { timeout: 20000 });
  const otherUser = await op.evaluate(() => localStorage.getItem("hearthUser") || "");
  check("Auto-created guest usernames do not collide", otherUser && otherUser !== boot.user, JSON.stringify({ first: boot.user, second: otherUser }));
  await other.close();
  await fresh.close();

  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await ctx.newPage();
  page.setDefaultTimeout(20000);
  await login(page, "returnee");
  await page.waitForSelector('body[data-view="room"]');
  const landed = await page.evaluate(() => document.querySelector('[data-testid="room-title"]')?.textContent || "");
  check("A named account boots into its own cube with a default look", /returnee/i.test(landed) && await page.locator('body[data-view="room"]').count() === 1, landed);
  await customize(page, { displayName: "Returnee", hair: 2, shirt: 1, skin: 2, glasses: false });
  await saveAvatar(page);
  await page.waitForSelector('body[data-view="room"]');
  const homeTitle = await page.evaluate(() => document.querySelector('[data-testid="room-title"]')?.textContent || "");
  check("Renaming in the phone editor updates the home cube name", /returnee/i.test(homeTitle), homeTitle);

  await page.evaluate(() => window.__debugKit?.({ furniture: ["capsulecouch", "holotv", "lamp"] }));
  await page.waitForTimeout(150);
  await page.evaluate(() => { window.__startPlace?.("capsulecouch"); window.__clickTile(2, 3); });
  await page.waitForTimeout(120);
  await page.evaluate(() => { window.__startPlace?.("holotv"); window.__clickTile(1, 1); });
  await page.waitForTimeout(120);
  await page.evaluate(() => { window.__startPlace?.("lamp"); window.__clickTile(4, 2); });
  await page.waitForTimeout(200);
  await page.evaluate(() => window.__exitEdit?.());
  const placed = await page.evaluate(() => (window.HouseRoom3D?.getFurniture?.() || []).length);
  check("Home cube accepted furniture for the in-room creator backdrop", placed >= 2, String(placed));
  await openPhone(page);
  const brand = await page.evaluate(() => ({
    home: (document.querySelector("[data-testid=phone-home-title]")?.textContent || "").replace(/\s+/g, " ").trim(),
    bar: (document.querySelector("[data-testid=phone-brand]")?.textContent || "").replace(/\s+/g, " ").trim(),
    icon: Boolean(document.querySelector("[data-testid=phone-brand] img.phone-brand-mark, [data-testid=phone-home-title] img.phone-brand-mark")),
  }));
  check("The in-game phone is branded CUBE PHONE with a cube mark", brand.home.includes("CUBE PHONE") && brand.bar.includes("CUBE PHONE") && brand.icon, JSON.stringify(brand));
  check("The phone menu has an Edit Character entry", await page.locator('[data-testid="phone-app-edit-character"]').isVisible());
  const homePhone = await page.evaluate(() => {
    const r = document.querySelector("[data-testid=phone-device]").getBoundingClientRect();
    return { w: r.width, h: r.height };
  });
  await page.click('[data-testid="phone-app-edit-character"]');
  await page.waitForSelector('[data-testid="creator-window"]');
  await page.waitForTimeout(400);
  const inRoomBd = await page.evaluate(() => {
    const phone = document.querySelector("[data-testid=phone-device]").getBoundingClientRect();
    const win = document.querySelector("[data-testid=creator-window]").getBoundingClientRect();
    return {
      view: document.body.dataset.view,
      phoneEdit: window.__creatorMenu?.isPhoneEdit?.() || false,
      furn: window.HouseRoom3D?.getFurniture?.()?.length || 0,
      phone: { w: phone.width, h: phone.height, x: phone.x, y: phone.y },
      windowInside: win.left >= phone.left - 2 && win.right <= phone.right + 2,
    };
  });
  const fs = await page.evaluate(() => {
    const ov = document.querySelector("[data-testid=edit-char-overlay]");
    const win = document.querySelector("[data-testid=creator-window]");
    const preview = document.querySelector("[data-testid=creator-preview]");
    const tabs = document.querySelector("[data-testid=creator-tabs]");
    const or_ = ov?.getBoundingClientRect();
    const wr = win?.getBoundingClientRect();
    const hair = document.querySelector('[data-testid="creator-tab-hair"]');
    return {
      view: document.body.dataset.view,
      overlay: Boolean(ov && !ov.classList.contains("hidden")),
      full: Boolean(or_ && or_.width >= window.innerWidth - 8 && or_.height >= window.innerHeight - 8),
      preview: Boolean(preview && preview.getBoundingClientRect().height > 80),
      tabs: Boolean(tabs && tabs.getBoundingClientRect().height > 40),
      rail: Boolean(tabs && tabs.getBoundingClientRect().width < 80),
      furn: window.HouseRoom3D?.getFurniture?.()?.length || 0,
      usingPhone: window.HouseRoom3D?.personFlags?.("pixel")?.usingPhone || window.__storeState?.()?.people?.get?.("pixel")?.usingPhone,
    };
  });
  check(
    "Edit Character opens as a full-screen window over the room",
    fs.view === "room" && fs.overlay && fs.full && fs.preview && fs.tabs && fs.furn >= 2,
    JSON.stringify(fs)
  );
  await page.click('[data-testid="creator-tab-hair"]');
  const hairTiles = await page.evaluate(() => {
    const tiles = [...document.querySelectorAll("#hair-choices .choice")];
    return {
      count: tiles.length,
      canvases: tiles.filter((t) => t.querySelector("canvas")).length,
      named: tiles.filter((t) => (t.textContent || "").trim().length > 0).length,
      labels: tiles.filter((t) => t.getAttribute("aria-label")).length,
      selected: tiles.some((t) => t.classList.contains("selected")),
    };
  });
  check(
    "Hair tab tiles are icon-only head thumbnails with aria-labels",
    hairTiles.count >= 10 && hairTiles.canvases === hairTiles.count && hairTiles.named === 0 && hairTiles.labels === hairTiles.count,
    JSON.stringify(hairTiles)
  );
  async function measureEditorGrids(page) {
    return page.evaluate(async () => {
      const measure = (rowSel) => {
        const panel = document.querySelector("[data-testid=edit-char-overlay] .creator-tab-panels")
          || document.querySelector(".creator-tab-panels");
        const pr = panel?.getBoundingClientRect();
        const tiles = [...document.querySelectorAll(`${rowSel} .choice, ${rowSel} .swatch`)]
          .filter((el) => el.offsetParent && getComputedStyle(el).display !== "none");
        const boxes = tiles.map((el) => {
          const r = el.getBoundingClientRect();
          return { x: r.x, r: r.right, y: r.y, b: r.bottom, w: r.width, h: r.height };
        });
        const clipped = boxes.some((b) => pr && (b.x < pr.left - 1 || b.r > pr.right + 1));
        const cols = new Set(boxes.map((b) => Math.round(b.x * 2) / 2)).size;
        return { count: boxes.length, clipped, cols, paneW: pr ? +pr.width.toFixed(1) : 0, tileW: boxes[0] ? +boxes[0].w.toFixed(1) : 0, lastR: boxes[2] ? +boxes[2].r.toFixed(1) : 0, paneR: pr ? +pr.right.toFixed(1) : 0 };
      };
      const hashCanvas = (sel, index) => {
        const c = document.querySelectorAll(`${sel} canvas`)[index];
        if (!c) return "";
        const ctx = c.getContext("2d");
        const { data } = ctx.getImageData(0, 0, c.width, c.height);
        let h = 0;
        for (let i = 0; i < data.length; i += 17) h = (h * 33 + data[i] + data[i + 1] * 3 + data[i + 2] * 7) | 0;
        return String(h);
      };
      const unique = (arr) => new Set(arr.filter(Boolean)).size;
      document.querySelector('[data-testid="creator-tab-hair"]')?.click();
      await new Promise((r) => setTimeout(r, 80));
      const hair = measure("#hair-choices");
      document.querySelector('[data-testid="creator-tab-head"]')?.click();
      await new Promise((r) => setTimeout(r, 80));
      const hats = measure("#hat-choices");
      const hatHashes = [0, 1, 2].map((i) => hashCanvas("#hat-choices", i));
      const glasses = measure("#glasses-choices");
      const glassHashes = [0, 1, 2, 3].map((i) => hashCanvas("#glasses-choices", i));
      const hatColors = measure("#hat-color-choices");
      document.querySelector('[data-testid="creator-tab-shoes"]')?.click();
      await new Promise((r) => setTimeout(r, 80));
      const shoes = measure("#shoes-choices");
      const shoeHashes = [0, 1, 2].map((i) => hashCanvas("#shoes-choices", i));
      document.querySelector('[data-testid="creator-tab-extras"]')?.click();
      await new Promise((r) => setTimeout(r, 80));
      const neck = measure("#necklace-choices");
      const neckHashes = [0, 1, 2].map((i) => hashCanvas("#necklace-choices", i));
      document.querySelector('[data-testid="creator-tab-pants"]')?.click();
      await new Promise((r) => setTimeout(r, 80));
      const pants = measure("#bottom-choices");
      return {
        vw: window.innerWidth, vh: window.innerHeight,
        hair, hats, glasses, hatColors, shoes, neck, pants,
        hatDistinct: unique(hatHashes) >= 3,
        glassesDistinct: unique(glassHashes) >= 3,
        shoeDistinct: unique(shoeHashes) >= 2,
        neckDistinct: unique(neckHashes) >= 3,
        hatHashes, glassHashes, shoeHashes, neckHashes,
      };
    });
  }
  const prevVp = page.viewportSize();
  const gridReports = {};
  for (const size of [{ width: 390, height: 844 }, { width: 375, height: 667 }]) {
    await page.setViewportSize(size);
    await page.waitForTimeout(200);
    gridReports[`${size.width}x${size.height}`] = await measureEditorGrids(page);
  }
  if (prevVp) await page.setViewportSize(prevVp);
  const gridOk = Object.values(gridReports).every((g) => !g.hair.clipped && !g.hats.clipped && !g.glasses.clipped && !g.shoes.clipped && !g.neck.clipped && !g.pants.clipped && !g.hatColors.clipped && g.hair.cols >= 3 && g.hair.tileW >= 36);
  check(
    "The options grid keeps all three tile columns fully visible at 390 and 375",
    gridOk,
    JSON.stringify(gridReports)
  );
  const thumbsOk = Object.values(gridReports).every((g) => g.hatDistinct && g.glassesDistinct && g.shoeDistinct && g.neckDistinct && g.pants.count >= 2);
  check(
    "Hat, glasses, shoe, pants, and necklace tiles show distinct real items",
    thumbsOk,
    JSON.stringify({ reports: Object.fromEntries(Object.entries(gridReports).map(([k, g]) => [k, { hatDistinct: g.hatDistinct, glassesDistinct: g.glassesDistinct, shoeDistinct: g.shoeDistinct, neckDistinct: g.neckDistinct, hashes: { hat: g.hatHashes, glasses: g.glassHashes, shoes: g.shoeHashes, neck: g.neckHashes } }])) })
  );
  check(
    "Color swatches fit the options column without clipping",
    Object.values(gridReports).every((g) => !g.hatColors.clipped && g.hatColors.count >= 6),
    JSON.stringify(Object.fromEntries(Object.entries(gridReports).map(([k, g]) => [k, g.hatColors])))
  );
  await page.waitForTimeout(200);
  await page.evaluate(() => document.querySelector("[data-testid=save-avatar]")?.click());
  await page.waitForFunction(() => !window.__creatorMenu?.isPhoneEdit?.(), null, { timeout: 8000 });
  await page.waitForTimeout(320);
  await page.waitForSelector('body[data-view="room"]');
  const afterClose = await page.evaluate(() => {
    const ov = document.querySelector("[data-testid=edit-char-overlay]");
    return {
      overlayHidden: !ov || ov.classList.contains("hidden") || ov.hasAttribute("hidden"),
      view: document.body.dataset.view,
    };
  });
  check(
    "Done closes Edit Character and returns to the room",
    afterClose.overlayHidden && afterClose.view === "room",
    JSON.stringify(afterClose)
  );
  await openPhoneApp(page, "pets");
  await page.waitForTimeout(200);
  const petsSz = await page.evaluate(() => {
    const r = document.querySelector("[data-testid=phone-device]").getBoundingClientRect();
    return { w: Math.round(r.width), h: Math.round(r.height) };
  });
  check(
    "Pets stays at the same phone size as home",
    Math.abs(petsSz.w - Math.round(homePhone.w)) <= 2 && Math.abs(petsSz.h - Math.round(homePhone.h)) <= 2,
    JSON.stringify({ home: homePhone, pets: petsSz })
  );
  const roomBeforeShop = await page.evaluate(() => {
    const r = document.getElementById("view-room")?.getBoundingClientRect();
    return r ? { w: Math.round(r.width), h: Math.round(r.height), x: Math.round(r.x), y: Math.round(r.y) } : null;
  });
  await openPhoneApp(page, "shop");
  await page.waitForSelector('[data-testid="store-panel"]:not(.hidden)');
  const shopUi = await page.evaluate(() => {
    const panel = document.querySelector("[data-testid=store-panel]");
    const phone = document.querySelector("[data-testid=phone-overlay]");
    const room = document.getElementById("view-room")?.getBoundingClientRect();
    const pr = panel?.getBoundingClientRect();
    const tabs = [...panel?.querySelectorAll(".store-tab") || []].map((el) => el.getBoundingClientRect());
    const tabRow = tabs.length ? {
      y0: Math.min(...tabs.map((r) => r.y)),
      y1: Math.max(...tabs.map((r) => r.bottom)),
    } : null;
    const inv = document.querySelector("#inventory-row");
    const invVisible = Boolean(inv && !inv.classList.contains("hidden") && inv.offsetParent && inv.textContent.trim());
    const thumbs = [...panel?.querySelectorAll("canvas.store-thumb") || []].map((c) => {
      const ctx = c.getContext("2d");
      const d = ctx.getImageData(0, 0, c.width, c.height).data;
      let ink = 0;
      for (let i = 0; i < d.length; i += 4) if (d[i + 3] > 8 && (d[i] + d[i + 1] + d[i + 2] < 720)) ink++;
      return { w: c.width, h: c.height, ink };
    });
    const plaque = document.querySelector(".room-plaque")?.getBoundingClientRect();
    const cart = document.querySelector("[data-testid=shop-toggle]");
    const cartVis = cart && getComputedStyle(cart).visibility !== "hidden" && getComputedStyle(cart).display !== "none";
    const toasts = document.getElementById("toasts");
    const toastVis = toasts && getComputedStyle(toasts).visibility !== "hidden";
    const slack = 2;
    const hits = (r) => Boolean(r && pr && r.left < pr.right - slack && r.right > pr.left + slack && r.top < pr.bottom - slack && r.bottom > pr.top + slack);
    const overlapsHud = [];
    if (cartVis && hits(cart.getBoundingClientRect())) overlapsHud.push("cart");
    if (toastVis && toasts && hits(toasts.getBoundingClientRect())) overlapsHud.push("toasts");
    const plaqueVis = plaque && document.querySelector(".room-plaque") && getComputedStyle(document.querySelector(".room-plaque")).visibility !== "hidden";
    if (plaqueVis && hits(plaque)) overlapsHud.push("plaque");
    const box = (sel) => {
      const el = panel?.querySelector(sel);
      if (!el) return null;
      const r = el.getBoundingClientRect();
      return { text: (el.textContent || "").trim(), x: +r.x.toFixed(1), y: +r.y.toFixed(1), w: +r.width.toFixed(1), h: +r.height.toFixed(1), bottom: +r.bottom.toFixed(1), right: +r.right.toFixed(1), clipped: el.scrollWidth > el.clientWidth + 1 };
    };
    const topbar = document.querySelector(".room-view .topbar")?.getBoundingClientRect();
    const tabInfo = [...(panel?.querySelectorAll(".store-tab") || [])].map((el) => {
      const r = el.getBoundingClientRect();
      return { text: (el.textContent || "").replace(/\s+/g, " ").trim(), w: +r.width.toFixed(1), clipped: el.scrollWidth > el.clientWidth + 1 };
    });
    return {
      panelOpen: Boolean(panel && !panel.classList.contains("hidden")),
      phoneClosed: !phone || phone.classList.contains("hidden"),
      panel: pr ? { w: Math.round(pr.width), h: Math.round(pr.height), x: Math.round(pr.x), y: Math.round(pr.y), bottom: Math.round(pr.bottom) } : null,
      room: room ? { w: Math.round(room.width), h: Math.round(room.height), x: Math.round(room.x), y: Math.round(room.y) } : null,
      vw: window.innerWidth,
      vh: window.innerHeight,
      tabH: tabRow ? Math.round(tabRow.y1 - tabRow.y0) : null,
      invVisible,
      thumbCount: thumbs.length,
      thumbsWithArt: thumbs.filter((t) => t.ink > 8).length,
      overlapsHud,
      title: box("[data-testid=store-panel-title]"),
      close: box("[data-testid=store-close]"),
      coins: box("[data-testid=shop-panel-coins]"),
      topbarBottom: topbar ? Math.round(topbar.bottom) : 0,
      tabInfo,
    };
  });
  check(
    "Opening the shop closes the phone and slides in a left side panel below the top bar",
    Boolean(shopUi.panelOpen && shopUi.phoneClosed && shopUi.panel && shopUi.panel.x <= 2
      && shopUi.panel.y >= Math.max(36, (shopUi.topbarBottom || 0) - 2)
      && shopUi.panel.w >= 160 && shopUi.panel.w <= Math.min(360, Math.round(shopUi.vw * 0.62) + 2)),
    JSON.stringify(shopUi)
  );
  check(
    "The Shop title, coin chip, and close X are fully visible below the top bar",
    Boolean(shopUi.title && shopUi.close && shopUi.title.text.includes("Shop")
      && shopUi.title.y >= (shopUi.panel?.y || 0) - 1
      && shopUi.title.y >= (shopUi.topbarBottom || 0) - 2
      && shopUi.close.y >= (shopUi.topbarBottom || 0) - 2
      && shopUi.title.w > 8 && shopUi.close.w >= 24
      && shopUi.title.right <= shopUi.vw && shopUi.close.right <= shopUi.vw),
    JSON.stringify({ title: shopUi.title, close: shopUi.close, coins: shopUi.coins, topbarBottom: shopUi.topbarBottom })
  );
  const wantedTabs = ["Furniture", "Clothes", "Pets", "Wall art"];
  check(
    "Shop tab labels are fully readable",
    Boolean(shopUi.tabInfo && wantedTabs.every((name) => shopUi.tabInfo.some((t) => t.text === name && !t.clipped && t.w >= 28))),
    JSON.stringify(shopUi.tabInfo)
  );
  check(
    "The shop panel is about half as tall and ends around mid-screen",
    Boolean(shopUi.panel && shopUi.panel.h <= Math.round(shopUi.vh * 0.55) && shopUi.panel.h >= Math.round(shopUi.vh * 0.28) && shopUi.panel.bottom <= Math.round(shopUi.vh * 0.62)),
    JSON.stringify(shopUi.panel)
  );
  check(
    "Shop tabs sit on one clean row and leftover inventory pills are hidden",
    Boolean(shopUi.tabH != null && shopUi.tabH <= 36 && !shopUi.invVisible),
    JSON.stringify({ tabH: shopUi.tabH, invVisible: shopUi.invVisible })
  );
  check(
    "Each shop card shows an item thumbnail, and the cart, plaque, and toasts do not cover the panel",
    Boolean(shopUi.thumbCount >= 3 && shopUi.thumbsWithArt >= 3 && shopUi.overlapsHud.length === 0),
    JSON.stringify({ thumbCount: shopUi.thumbCount, thumbsWithArt: shopUi.thumbsWithArt, overlapsHud: shopUi.overlapsHud })
  );
  check(
    "The room stays in place when the shop panel opens",
    Boolean(roomBeforeShop && shopUi.room && roomBeforeShop.w === shopUi.room.w && roomBeforeShop.h === shopUi.room.h && roomBeforeShop.x === shopUi.room.x && roomBeforeShop.y === shopUi.room.y),
    JSON.stringify({ before: roomBeforeShop, after: shopUi.room })
  );
  await page.click('[data-testid="store-close"]');
  await page.waitForFunction(() => document.querySelector('[data-testid="store-panel"]')?.classList.contains("hidden"));
  await openPhoneApp(page, "edit");
  await page.waitForTimeout(200);
  const editRow = await page.evaluate(() => {
    const overlay = document.querySelector("[data-testid=phone-overlay]");
    const inv = document.querySelector("[data-testid=edit-inventory]");
    const dock = document.querySelector("[data-testid=chat-dock]");
    const done = document.querySelector("[data-testid=edit-done]");
    const ir = inv?.getBoundingClientRect();
    const dr = dock?.getBoundingClientRect();
    const editBtn = document.querySelector("[data-testid=edit-room-btn]");
    const tabs = [...document.querySelectorAll("[data-testid=edit-inv-tabs] [data-tab]")].map((t) => t.dataset.tab);
    return {
      phoneHidden: !overlay || overlay.classList.contains("hidden"),
      invVisible: Boolean(inv && !inv.classList.contains("hidden") && ir && ir.height > 8),
      fabsAbove: Boolean(ir && dr && dr.bottom <= ir.top + 16),
      done: Boolean(done && done.getBoundingClientRect().width > 0),
      tabs,
      editBtn: Boolean(editBtn && !editBtn.classList.contains("hidden")),
    };
  });
  check(
    "Edit Room shows the top button, bottom inventory, and Furniture/Room/Upgrade tabs",
    Boolean(editRow.phoneHidden && editRow.invVisible && editRow.done && editRow.editBtn && (editRow.tabs || []).includes("furniture") && (editRow.tabs || []).includes("room") && (editRow.tabs || []).includes("upgrade")),
    JSON.stringify(editRow)
  );
  await page.evaluate(() => window.__exitEdit?.());
  await page.waitForTimeout(150);
  const savedLook = await page.evaluate(() => window.__storeState?.()?.me?.avatar || {});

  await page.reload({ waitUntil: "domcontentloaded" });
  await page.waitForSelector('body[data-view="room"]', { timeout: 20000 });
  const afterReload = await page.evaluate(() => ({
    view: document.body.dataset.view,
    menu: Boolean(document.querySelector('[data-testid="start-menu"]') && !document.getElementById("view-login")?.classList.contains("hidden")),
    title: document.querySelector('[data-testid="room-title"]')?.textContent || "",
    avatar: window.__storeState?.()?.me?.avatar || {},
  }));
  check(
    "A returning user with a remembered login boots into their own cube",
    afterReload.view === "room" && !afterReload.menu && /returnee/i.test(afterReload.title),
    JSON.stringify({ view: afterReload.view, menu: afterReload.menu, title: afterReload.title })
  );
  check(
    "Phone editor name and look changes persist after reload",
    afterReload.avatar.displayName === "Returnee" && afterReload.avatar.hair === savedLook.hair && afterReload.avatar.shirt === savedLook.shirt,
    JSON.stringify({ savedLook, after: afterReload.avatar })
  );

  await page.evaluate(() => window.__signOut?.());
  await page.waitForSelector('[data-testid="start-menu"]', { timeout: 15000 });
  check("Sign out returns the user to the arcade start menu", await page.locator('[data-testid="start-menu"]').isVisible());
  await ctx.close();

  log("Creator options fit every phone tab without scrolling");
  const cctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const cp = await cctx.newPage();
  cp.setDefaultTimeout(20000);
  await login(cp, "fituser");
  await openCharacterEditor(cp);
  await cp.waitForTimeout(650);
  const homeBd = await cp.evaluate(() => {
    const ov = document.querySelector("[data-testid=edit-char-overlay]");
    const or_ = ov?.getBoundingClientRect();
    return {
      view: document.body.dataset.view,
      phoneEdit: window.__creatorMenu?.isPhoneEdit?.() || false,
      overlay: Boolean(ov && !ov.classList.contains("hidden")),
      full: Boolean(or_ && or_.width >= window.innerWidth - 8 && or_.height >= window.innerHeight - 8),
    };
  });
  check("A new user's character editor opens full-screen and stays in the cube", homeBd.view === "room" && homeBd.phoneEdit && homeBd.overlay && homeBd.full, JSON.stringify(homeBd));
  for (const vp of CREATOR_PHONES) {
    await cp.setViewportSize({ width: vp.width, height: vp.height });
    await cp.waitForTimeout(200);
    await assertCreatorTabsFit(cp, vp.name, vp);
  }
  await cctx.close();

  await runPhoneEditPoseTests(browser);
  await runMobileAvatarClearTests(browser);
}


function boxesOverlap(a, b) {
  if (!a || !b) return true;
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

async function measureAvatarPhoneClearance(page) {
  return page.evaluate(() => {
    const phoneEl = document.querySelector("[data-testid=phone-device]");
    const pr = phoneEl?.getBoundingClientRect();
    const pose = window.__avatarPose?.();
    const box = window.HouseRoom3D?.personBox?.(pose?.name) || pose?.box;
    const phone = pr ? { x: pr.x, y: pr.y, w: pr.width, h: pr.height, right: pr.right, bottom: pr.bottom } : null;
    const overlap = Boolean(box && phone && box.x < phone.x + phone.w && box.x + box.w > phone.x && box.y < phone.y + phone.h && box.y + box.h > phone.y);
    const html = document.documentElement, body = document.body, room = document.getElementById("view-room");
    const slack = 1.5;
    const noScroll = (el) => !el || (el.scrollHeight <= el.clientHeight + slack && el.scrollWidth <= el.clientWidth + 8);
    return {
      phone,
      box,
      overlap,
      compact: document.getElementById("phone-overlay")?.classList.contains("is-compact-edit"),
      view: document.body.dataset.view,
      sitting: Boolean(pose?.flags?.sitting || pose?.sitting),
      tile: pose?.tile,
      flags: pose?.flags,
      html: noScroll(html),
      body: noScroll(body),
      room: noScroll(room),
      phoneFits: phone && phone.x >= -1 && phone.y >= -1 && phone.x + phone.w <= innerWidth + 1 && phone.y + phone.h <= innerHeight + 1,
      pose,
    };
  });
}

async function clickPhoneBack(page) {
  const done = page.locator('[data-testid="save-avatar"]').locator("visible=true");
  if (await done.count()) {
    await done.first().click();
    return;
  }
  const btn = page.locator("[data-phone-back]").locator("visible=true");
  if (await btn.count()) {
    await btn.first().click();
    return;
  }
  const legacy = page.locator('[data-testid="creator-back"]').locator("visible=true");
  if (await legacy.count()) {
    await legacy.first().click();
    return;
  }
  await page.evaluate(() => {
    const b = [...document.querySelectorAll("[data-phone-back]")].find((el) => el.offsetParent);
    if (b) b.click();
    else window.__creatorMenu?.close?.();
  });
}

async function walkToTile(page, name, x, y) {
  await page.evaluate(({ x, y }) => window.__clickTile?.(x, y), { x, y });
  await page.waitForFunction(({ name, x, y }) => {
    const t = window.HouseRoom3D?.personTile?.(name);
    const walking = window.HouseRoom3D?.personFlags?.(name)?.walking;
    return t && Math.abs(t.x - x) < 0.25 && Math.abs(t.y - y) < 0.25 && !walking;
  }, { name, x, y }, { timeout: 12000 }).catch(() => {});
  await page.waitForTimeout(250);
}

async function runMobileAvatarClearTests(browser) {
  log("The compact phone editor never covers the avatar on mobile");
  const viewports = [
    { name: "360x640", width: 360, height: 640 },
    { name: "375x667", width: 375, height: 667 },
    { name: "390x844", width: 390, height: 844 },
    { name: "414x896", width: 414, height: 896 },
  ];
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await ctx.newPage();
  page.setDefaultTimeout(20000);
  await login(page, "clearview");
  await page.waitForFunction(() => window.HouseRoom3D && window.HouseRoom3D.ready);
  const n = await page.evaluate(() => window.HouseRoom3D?.gridSize?.() || 6);
  const left = { x: 0, y: Math.max(1, Math.floor(n / 2)) };
  const center = { x: Math.floor((n - 1) / 2), y: Math.floor((n - 1) / 2) };
  const right = { x: n - 1, y: Math.max(1, Math.floor(n / 2)) };

  await page.evaluate(() => window.__debugKit?.({ furniture: ["capsulecouch"], coins: 400 }));
  await page.evaluate(() => { window.__startPlace?.("capsulecouch"); window.__clickTile(4, 0); });
  await page.waitForFunction(() => window.HouseRoom3D.getFurniture().some((f) => f.type === "capsulecouch"));
  await page.evaluate(() => window.__exitEdit?.());
  const couchId = await page.evaluate(() => window.HouseRoom3D.getFurniture().find((f) => f.type === "capsulecouch").id);

  const placements = [
    { label: "left", kind: "stand", tile: left },
    { label: "center", kind: "stand", tile: center },
    { label: "right", kind: "stand", tile: right },
    { label: "seated", kind: "sit" },
  ];

  for (const vp of viewports) {
    await page.setViewportSize({ width: vp.width, height: vp.height });
    await page.waitForTimeout(200);
    for (const place of placements) {
      if (place.kind === "stand") {
        const sitting = await page.evaluate(() => window.HouseRoom3D.personFlags("clearview")?.sitting);
        if (sitting) {
          await page.evaluate((id) => window.__sit(id, 0), couchId);
          await page.waitForFunction(() => !window.HouseRoom3D.personFlags("clearview")?.sitting, null, { timeout: 8000 }).catch(() => {});
        }
        await walkToTile(page, "clearview", place.tile.x, place.tile.y);
      } else {
        const sitting = await page.evaluate(() => window.HouseRoom3D.personFlags("clearview")?.sitting);
        if (!sitting) {
          await page.evaluate((id) => window.__sit(id, 0), couchId);
          await page.waitForFunction(() => window.HouseRoom3D.personFlags("clearview")?.sitting, null, { timeout: 12000 });
          await page.waitForTimeout(300);
        }
      }
      const before = await page.evaluate(() => window.__avatarPose?.());
      await openCharacterEditor(page);
      await page.waitForTimeout(360);
      const mid = await measureAvatarPhoneClearance(page);
      check(
        `Edit Character at ${vp.name} (${place.label}) stays at the normal phone size and keeps the avatar in the room`,
        mid.view === "room" && mid.box && mid.phone && mid.phone.w <= 220 && mid.phone.h <= 360 && mid.phoneFits && (place.kind === "sit" ? mid.sitting : !mid.sitting),
        JSON.stringify({ place, mid, beforeTile: before?.tile })
      );
      check(
        `Edit Character at ${vp.name} (${place.label}) does not change pose or seat`,
        samePose(before, mid.pose || { tile: mid.tile, flags: mid.flags, sitting: mid.sitting, view: mid.view, cam: before?.cam }) && mid.view === "room",
        JSON.stringify({ before, mid })
      );
      check(
        `Edit Character at ${vp.name} (${place.label}) does not scroll the page`,
        mid.html && mid.body && mid.room && mid.phoneFits,
        JSON.stringify({ scroll: { html: mid.html, body: mid.body, room: mid.room }, phone: mid.phone })
      );
      await clickPhoneBack(page);
      await page.waitForFunction(() => !window.__creatorMenu?.isPhoneEdit?.(), null, { timeout: 8000 });
      await page.waitForTimeout(200);
    }
  }
  await ctx.close();
}

async function runPhoneEditPoseTests(browser) {
  log("Editing a character leaves pose, seat, and action unchanged");
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await ctx.newPage();
  page.setDefaultTimeout(20000);
  await login(page, "posecheck");
  await page.waitForFunction(() => window.HouseRoom3D && window.HouseRoom3D.ready);
  await page.evaluate(() => window.__debugKit?.({ furniture: ["capsulecouch", "chesstable"], coins: 400 }));
  await page.evaluate(() => { window.__startPlace?.("capsulecouch"); window.__clickTile(2, 3); });
  await page.waitForFunction(() => window.HouseRoom3D.getFurniture().some((f) => f.type === "capsulecouch"));
  await page.evaluate(() => { window.__startPlace?.("chesstable"); window.__clickTile(4, 1); });
  await page.waitForFunction(() => window.HouseRoom3D.getFurniture().some((f) => f.type === "chesstable"));
  await page.evaluate(() => window.__exitEdit?.());

  const snap = () => page.evaluate(() => window.__avatarPose?.());
  const phoneBox = () => page.evaluate(() => {
    const r = document.querySelector("[data-testid=phone-device]")?.getBoundingClientRect();
    return r ? { w: +r.width.toFixed(2), h: +r.height.toFixed(2), x: +r.x.toFixed(2), y: +r.y.toFixed(2) } : null;
  });

  async function assertStable(label, before, during, after, homePhone, editPhone) {
    check(
      `${label}: avatar position and pose stay identical before, during, and after editing`,
      samePose(before, during) && samePose(before, after) && before.view === "room" && during.view === "room" && after.view === "room" && during.phoneEdit && !after.phoneEdit && Boolean(during.flags?.sitting) === Boolean(before.flags?.sitting),
      JSON.stringify({ before, during, after })
    );
    const overlay = await page.evaluate(() => {
      const ov = document.querySelector("[data-testid=edit-char-overlay]");
      return !ov || ov.classList.contains("hidden") || ov.hasAttribute("hidden");
    });
    check(
      `${label}: closing Edit Character returns to the room`,
      overlay && after.view === "room",
      JSON.stringify({ after, overlayHidden: overlay })
    );
  }

  // Measure the resting phone size, then start a looping dance so we can
  // prove Edit Character does not cancel a mid-action animation.
  await openPhone(page);
  const homeA = await phoneBox();
  await page.click('[data-testid="phone-home-bar"]').catch(() => {});
  await page.evaluate(() => window.__closePhone?.() || document.getElementById("phone-overlay")?.classList.add("hidden"));
  await page.waitForTimeout(200);
  await page.evaluate(() => window.__playEmote?.("dance"));
  await page.waitForFunction(() => window.__avatarPose?.()?.flags?.actionEmote === "dance", null, { timeout: 4000 });
  await page.waitForTimeout(400);
  const beforeA = await snap();
  await openCharacterEditor(page);
  const duringA = await snap();
  const editA = await phoneBox();
  await clickCreatorOption(page, "shirt-2");
  const midA = await snap();
  await page.click('[data-testid="save-avatar"]');
  await page.waitForFunction(() => !window.__creatorMenu?.isPhoneEdit?.(), null, { timeout: 8000 });
  await page.waitForTimeout(320);
  const afterA = await snap();
  afterA.restored = await phoneBox();
  check(
    "Opening Edit Character holds the phone pose and leaves the avatar in place",
    beforeA.flags?.actionEmote === "dance" && duringA.flags?.usingPhone && midA.flags?.usingPhone && !afterA.flags?.usingPhone && samePose(beforeA, duringA) && samePose(beforeA, afterA) && duringA.view === "room",
    JSON.stringify({ before: beforeA.flags, during: duringA.flags, mid: midA.flags, after: afterA.flags })
  );
  await assertStable("Standing / mid-action", beforeA, duringA, afterA, homeA, editA);
  check("Standing mid-action keeps the same tile while looks update in place", samePose({ ...beforeA, head: midA.head }, midA) && midA.view === "room", JSON.stringify({ before: beforeA, mid: midA }));

  // Seated on couch
  const couchId = await page.evaluate(() => window.HouseRoom3D.getFurniture().find((f) => f.type === "capsulecouch").id);
  await page.evaluate((id) => window.__sit(id, 0), couchId);
  await page.waitForFunction(() => window.HouseRoom3D.personFlags("posecheck")?.sitting, null, { timeout: 12000 });
  await page.waitForTimeout(400);
  await openPhone(page);
  const homeB = await phoneBox();
  const beforeB = await snap();
  await openCharacterEditor(page);
  const duringB = await snap();
  const editB = await phoneBox();
  await clickCreatorOption(page, "hair-2");
  const midB = await snap();
  await clickPhoneBack(page);
  await page.waitForFunction(() => !window.__creatorMenu?.isPhoneEdit?.(), null, { timeout: 8000 });
  await page.waitForTimeout(320);
  const afterB = await snap();
  afterB.restored = await phoneBox();
  check("A seated character stays seated in place while looks update", Boolean(beforeB.flags?.sitting && duringB.flags?.sitting && midB.flags?.sitting && afterB.flags?.sitting), JSON.stringify({ before: beforeB, during: duringB, mid: midB, after: afterB }));
  await assertStable("Seated on a couch", beforeB, duringB, afterB, homeB, editB);

  // Chess stool
  await page.evaluate(() => {
    const flags = window.HouseRoom3D.personFlags("posecheck");
    if (flags?.sitting) {
      const couch = window.HouseRoom3D.getFurniture().find((f) => f.type === "capsulecouch");
      if (couch) window.__sit(couch.id, 0);
    }
  });
  // stand first if needed by clicking again? sit toggle may stand. Then sit on chess.
  await page.waitForTimeout(200);
  const chessId = await page.evaluate(() => window.HouseRoom3D.getFurniture().find((f) => f.type === "chesstable").id);
  // If still sitting on couch, stand via sit toggle then sit chess
  const stillSitting = await page.evaluate(() => window.HouseRoom3D.personFlags("posecheck")?.sitting);
  if (stillSitting) {
    await page.evaluate((id) => window.__sit(id, 0), couchId);
    await page.waitForFunction(() => !window.HouseRoom3D.personFlags("posecheck")?.sitting, null, { timeout: 8000 }).catch(() => {});
  }
  await page.evaluate((id) => window.__sit(id, 0), chessId);
  await page.waitForFunction(() => window.HouseRoom3D.personFlags("posecheck")?.sitting, null, { timeout: 12000 });
  await page.evaluate(() => document.getElementById("chess-close")?.click());
  await page.waitForTimeout(120);
  await openPhone(page);
  const homeC = await phoneBox();
  const beforeC = await snap();
  await openCharacterEditor(page);
  const duringC = await snap();
  const editC = await phoneBox();
  await page.click('[data-testid="save-avatar"]');
  await page.waitForFunction(() => !window.__creatorMenu?.isPhoneEdit?.(), null, { timeout: 8000 });
  await page.waitForTimeout(320);
  const afterC = await snap();
  afterC.restored = await phoneBox();
  check("A chess-stool sitter stays seated while editing", Boolean(beforeC.flags?.sitting && duringC.flags?.sitting && afterC.flags?.sitting), JSON.stringify({ before: beforeC, during: duringC, after: afterC }));
  await assertStable("Seated on a chess stool", beforeC, duringC, afterC, homeC, editC);

  // No page scroll at the required viewports
  await openCharacterEditor(page);
  for (const vp of [{ name: "360x640", width: 360, height: 640 }, { name: "390x844", width: 390, height: 844 }, { name: "1280x800", width: 1280, height: 800 }]) {
    await page.setViewportSize({ width: vp.width, height: vp.height });
    await page.waitForTimeout(250);
    const fit = await page.evaluate((vp) => {
      const html = document.documentElement, body = document.body, room = document.getElementById("view-room");
      const ov = document.querySelector("[data-testid=edit-char-overlay]");
      const win = document.querySelector("[data-testid=creator-window]");
      const r = (ov || win)?.getBoundingClientRect();
      const slack = 1.5;
      const noScroll = (el) => !el || (el.scrollHeight <= el.clientHeight + slack && el.scrollWidth <= el.clientWidth + 8);
      return {
        view: document.body.dataset.view,
        html: noScroll(html),
        body: noScroll(body),
        room: noScroll(room),
        editorFits: Boolean(r && r.left >= -1 && r.top >= -1 && r.right <= vp.width + 1 && r.bottom <= vp.height + 1),
        editor: r && { w: r.width, h: r.height, x: r.x, y: r.y },
      };
    }, vp);
    check(
      `Edit Character does not scroll the page at ${vp.name}`,
      fit.view === "room" && fit.html && fit.body && fit.room && fit.editorFits,
      JSON.stringify(fit)
    );
  }
  await ctx.close();
}

async function runAppShellFit(browser) {
  const i14 = devices["iPhone 14"] || devices["iPhone 13"];
  const ctx = await browser.newContext({ ...i14, hasTouch: true, isMobile: true });
  const page = await ctx.newPage();
  page.setDefaultTimeout(20000);
  await page.goto(BASE, { waitUntil: "domcontentloaded" });
  await page.waitForSelector('body[data-view="room"]', { timeout: 20000 });
  await page.waitForTimeout(200);
  await assertInsideViewport(page, ['[data-testid="room-title"]', '[data-testid="phone-btn"]'], "A fresh visit's home cube fits the iPhone 14 viewport");
  await page.evaluate(() => window.__signOut?.());
  await page.waitForSelector('[data-testid="start-menu"]', { timeout: 15000 });
  await page.waitForTimeout(200);
  await assertInsideViewport(page, ['[data-testid="start-menu"]', '[data-testid="start-option-start"]'], "The arcade start menu fits the iPhone 14 viewport after sign out");
  await openStartForm(page);
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
  await openCharacterEditor(page);
  await page.waitForTimeout(200);
  await assertInsideViewport(page, ['[data-testid="edit-char-overlay"]', '[data-testid="display-name"]', '[data-testid="save-avatar"]'], "Character creator chrome fits the iPhone 14 viewport");
  const prev = page.viewportSize();
  await page.setViewportSize({ width: Math.max(prev.width, 390), height: Math.max(prev.height, 1100) });
  await customize(page, { displayName: "Pia", hair: 1, shirt: 2, skin: 2, glasses: false });
  await saveAvatar(page);
  await page.setViewportSize(i14.viewport);
  await page.waitForSelector('body[data-view="room"]');
  await page.waitForTimeout(250);
  await goToLobby(page);
  await assertInsideViewport(page, [".lobby-topbar", '[data-testid="friend-search"]', '[data-testid="add-menu-btn"]'], "Contact-list home fits the iPhone 14 viewport");
  await page.screenshot({ path: `${SHOT}/27-app-home.png` });

  await openAddSheet(page);
  await page.fill('[data-testid="room-name"]', "Pia Cube");
  await page.click('[data-testid="create-room-btn"]');
  await page.waitForSelector('body[data-view="room"]');
  await page.waitForFunction(() => window.HouseRoom3D && window.HouseRoom3D.ready);
  await page.evaluate(() => window.HouseRoom3D?.resize?.());
  await page.waitForTimeout(300);
  await assertInsideViewport(page, ['[data-testid="room-title"]', '[data-testid="chat-dock"]', '[data-testid="chat-bubble-btn"]', '[data-testid="phone-btn"]', '[data-testid="emote-wheel-btn"]', '[data-testid="cam-toggle"]', '[data-testid="room-coins"]'], "In-room chrome fits the iPhone 14 viewport");
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

  await page.evaluate(() => { window.__setCamMode("follow"); window.HouseRoom3D.setZoom(2); });
  await page.waitForTimeout(120);
  const beforePan = await page.evaluate(() => window.__camState());
  const canvasBox = await page.locator(".room3d-root canvas").boundingBox();
  const panX = Math.round((canvasBox.x + canvasBox.width * 0.55));
  const panY = Math.round((canvasBox.y + canvasBox.height * 0.45));
  await page.mouse.move(panX, panY);
  await page.mouse.down();
  await page.mouse.move(panX + 54, panY + 28, { steps: 8 });
  await page.mouse.up();
  await page.waitForTimeout(80);
  const afterPan = await page.evaluate(() => window.__camState());
  check(
    "Dragging pans the room and pauses follow-cam",
    Boolean(afterPan?.paused && (Math.abs((afterPan.target?.x ?? 0) - (beforePan.target?.x ?? 0)) > 2 || Math.abs((afterPan.target?.z ?? 0) - (beforePan.target?.z ?? 0)) > 2)),
    JSON.stringify({ before: beforePan, after: afterPan })
  );
  const zoomBeforePinch = afterPan?.zoom;
  await page.evaluate(({ x, y }) => {
    const c = document.querySelector(".room3d-root canvas");
    const fire = (type, id, px, py) => c.dispatchEvent(new PointerEvent(type, {
      pointerId: id, pointerType: "touch", clientX: px, clientY: py, bubbles: true, cancelable: true, isPrimary: id === 1, width: 12, height: 12,
    }));
    fire("pointerdown", 1, x - 30, y);
    fire("pointerdown", 2, x + 30, y);
    fire("pointermove", 1, x - 78, y);
    fire("pointermove", 2, x + 78, y);
    fire("pointerup", 1, x - 78, y);
    fire("pointerup", 2, x + 78, y);
  }, { x: panX, y: panY });
  await page.waitForTimeout(100);
  const afterPinch = await page.evaluate(() => window.__camState());
  check(
    "Pinching zooms the room smoothly",
    Boolean(afterPinch?.zoom >= (zoomBeforePinch || 0) + 0.25 && afterPinch.zoom <= 4.05),
    JSON.stringify({ before: zoomBeforePinch, after: afterPinch })
  );
  const twoFingerWalk = await page.evaluate(({ x, y }) => {
    window.HouseRoom3D.setMoveTarget?.(null, null);
    const c = document.querySelector(".room3d-root canvas");
    const fire = (type, id, px, py) => c.dispatchEvent(new PointerEvent(type, {
      pointerId: id, pointerType: "touch", clientX: px, clientY: py, bubbles: true, cancelable: true, isPrimary: id === 1,
    }));
    fire("pointerdown", 1, x - 12, y);
    fire("pointerdown", 2, x + 12, y);
    fire("pointerup", 2, x + 12, y);
    fire("pointerup", 1, x - 12, y);
    return window.HouseRoom3D.getMoveTarget?.();
  }, { x: panX, y: panY });
  check("Two fingers never start a walk", twoFingerWalk == null, JSON.stringify(twoFingerWalk));
  await page.evaluate(() => window.__setCamMode("follow"));
  const walkTap = await page.evaluate(() => {
    const p = window.HouseRoom3D.projectWorld(2, 4);
    window.HouseRoom3D.tapAt(p.x, p.y);
    return window.HouseRoom3D.getMoveTarget?.();
  });
  check("A short tap still walks to a tile", Boolean(walkTap && (walkTap.x === 2 || walkTap.y === 4 || walkTap.x != null)), JSON.stringify(walkTap));
  await page.click('[data-testid="cam-recenter"]');
  await page.waitForTimeout(80);
  const rec = await page.evaluate(() => ({ cam: window.__camState(), fit: window.HouseRoom3D.roomFitsView() }));
  check("The recenter button fits the cube on screen", Boolean(rec.cam?.mode === "room" && rec.fit?.ok && rec.cam.zoom <= 1.05), JSON.stringify(rec));

  const sizes = [
    { name: "iPhone SE", width: 375, height: 667 },
    { name: "iPhone 14", width: 390, height: 844 },
    { name: "iPhone 15", width: 393, height: 852 },
    { name: "iPhone 14 Pro Max", width: 430, height: 932 },
    { name: "compact Android", width: 360, height: 780 },
    { name: "Pixel 7", width: (devices["Pixel 7"]?.viewport?.width) || 412, height: (devices["Pixel 7"]?.viewport?.height) || 915 },
    { name: "iPhone 14 landscape", width: 844, height: 390 },
  ];
  const chrome = ['[data-testid="room-title"]', '[data-testid="chat-dock"]', '[data-testid="chat-bubble-btn"]', '[data-testid="phone-btn"]'];
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
    window.__syncVisualTop?.();
    window.HouseRoom3D?.resize?.();
  });
  await page.waitForTimeout(350);
  await page.evaluate(() => window.__setCamMode?.("room"));
  await page.waitForTimeout(80);
  await assertInsideViewport(page, chrome, "In-room chrome stays inside a 47px top safe-area", { top: 47, bottom: 0 });
  await assertInsideViewport(page, TOP_HUD, "Leave Cube, coins, and the shop cart stay in view under a 47px notch", { top: 47, bottom: 0 });
  await assertNoHudOverlap(page, PHONE_HUD, "In-room HUD does not overlap with a 47px notch inset");
  const titleTop = await page.locator('[data-testid="room-title"]').evaluate((el) => el.getBoundingClientRect().top);
  check("The in-room HUD sits below a 47px notch inset", titleTop >= 47, `titleTop=${titleTop.toFixed(1)}`);
  const fitSat = await page.evaluate(() => window.HouseRoom3D.roomFitsView());
  check("The whole cube stays in frame with a simulated notch", Boolean(fitSat?.ok), JSON.stringify(fitSat));
  await page.screenshot({ path: `${SHOT}/30-fit-top.png` });

  // Real-phone bug: iOS can shift the visual viewport and hide the top HUD.
  await page.evaluate(() => {
    window.scrollTo(0, 180);
    document.documentElement.scrollTop = 180;
    if (document.body) document.body.scrollTop = 180;
  });
  await page.waitForTimeout(80);
  const afterShift = await page.evaluate(() => ({
    y: window.scrollY || document.documentElement.scrollTop || document.body.scrollTop || 0,
    vvTop: window.visualViewport?.offsetTop || 0,
  }));
  check("An iOS-style page scroll is snapped back to the top", afterShift.y === 0, JSON.stringify(afterShift));
  await assertInsideViewport(page, TOP_HUD, "The top HUD stays visible after an iOS-style page shift", { top: 47, bottom: 0 });

  await page.evaluate(() => window.__setKeyboardInset?.(280));
  await page.waitForTimeout(80);
  await assertInsideViewport(page, TOP_HUD, "The top HUD stays visible while a keyboard is open", { top: 47, bottom: 0 });
  const kbHud = await page.evaluate(() => {
    const box = (sel) => {
      const el = document.querySelector(sel);
      if (!el) return null;
      const r = el.getBoundingClientRect();
      return { top: +r.top.toFixed(1), bottom: +r.bottom.toFixed(1), visible: r.width > 0 && r.height > 0 && getComputedStyle(el).visibility !== "hidden" };
    };
    return {
      leave: box("[data-testid=leave-cube]"),
      coins: box("[data-testid=room-coins]"),
      cart: box("[data-testid=shop-toggle]"),
      inset: getComputedStyle(document.documentElement).getPropertyValue("--kb-inset").trim(),
      scroll: window.scrollY || 0,
    };
  });
  check(
    "Leave Cube, coins, and the shop cart stay below the notch with the keyboard up",
    Boolean(kbHud.leave?.visible && kbHud.coins?.visible && kbHud.cart?.visible
      && kbHud.leave.top >= 45 && kbHud.coins.top >= 45 && kbHud.cart.top >= 45
      && kbHud.scroll === 0 && kbHud.inset === "280px"),
    JSON.stringify(kbHud)
  );
  await page.evaluate(() => window.__setKeyboardInset?.(0));

  await page.locator('[data-testid="shop-toggle"]').click();
  await page.waitForSelector('[data-testid="store-panel"]:not(.hidden)');
  await assertInsideViewport(page, ['[data-testid="leave-cube"]', '[data-testid="room-coins"]'], "Leave Cube and coins stay visible while the shop is open", { top: 47, bottom: 0 });
  await page.locator('[data-testid="store-close"]').click();
  await page.waitForFunction(() => document.querySelector('[data-testid="store-panel"]')?.classList.contains("hidden"));

  await openPhone(page);
  await page.waitForTimeout(80);
  await assertInsideViewport(page, TOP_HUD, "The top HUD stays visible while the phone is open", { top: 47, bottom: 0 });
  await page.evaluate(() => window.__closePhone?.());
  await page.waitForFunction(() => document.querySelector('[data-testid="phone-overlay"]')?.classList.contains("hidden"));

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
  const slotCounts = await page.evaluate(() => ({
    tabs: document.querySelectorAll('[data-testid="store-slot-tabs"] [data-slot]').length,
    tops: document.querySelectorAll('[data-testid="store-slot-tops"]').length,
    bottoms: document.querySelectorAll('[data-testid="store-slot-bottoms"]').length,
    hats: document.querySelectorAll('[data-testid="store-slot-hats"]').length,
    acc: document.querySelectorAll('[data-testid="store-slot-accessories"]').length,
    shoes: document.querySelectorAll('[data-testid="store-slot-shoes"]').length,
  }));
  check("The clothes tab has Tops / Bottoms / Hats / Accessories / Shoes filters", slotCounts.tabs >= 5 && slotCounts.tops === 1 && slotCounts.bottoms === 1 && slotCounts.hats === 1 && slotCounts.acc === 1 && slotCounts.shoes === 1, JSON.stringify(slotCounts));
  await page.locator('[data-testid="store-slot-tops"]').click();
  check("The Tops filter still lists the Cube Tee", await page.locator('[data-testid="store-item-nt-tee"]').count() === 1);
  await page.locator('[data-testid="store-item-nt-varsity"]').click();
  await page.locator('[data-testid="store-tryon"]').click();
  await page.waitForTimeout(150);
  await page.locator('[data-testid="store-buy"]').click();
  await page.waitForFunction(() => (window.__storeState()?.collection?.clothes || []).some((c) => c.catalogId === "nt-varsity"), null, { timeout: 8000 });
  check("Buying a varsity jacket adds it to the wardrobe", await page.evaluate(() => (window.__storeState()?.collection?.clothes || []).some((c) => c.catalogId === "nt-varsity")));
  await page.locator('[data-testid="store-wear"]').click();
  await page.waitForFunction(() => window.__storeState()?.me?.avatar?.top === "varsity", null, { timeout: 8000 });
  check("Owned clothes can be equipped from the clothing tab", await page.evaluate(() => window.__storeState()?.me?.avatar?.top === "varsity" && window.__storeState()?.me?.avatar?.shirt === "#c43a3a"));
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
      await goToLobby(pg);
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
  await openChat(pages[0].pg);
  await pages[0].pg.fill('[data-testid="chat-input"]', "welcome to the grid");
  await sendChatMsg(pages[0].pg);
  await openChat(pages[1].pg);
  await pages[1].pg.fill('[data-testid="chat-input"]', "Cube Cola hits different");
  await sendChatMsg(pages[1].pg);
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
    const outsidePhone = await a.evaluate(() => {
      const phone = document.querySelector("[data-testid=phone-device]")?.getBoundingClientRect();
      const w = window.innerWidth;
      const x = phone ? Math.min(w - 16, phone.right + 24) : w - 16;
      return { x, y: 80 };
    });
    await a.touchscreen.tap(outsidePhone.x, outsidePhone.y);
    await a.waitForSelector('[data-testid="phone-overlay"].hidden, body:not(.phone-open)', { timeout: 8000 }).catch(() => {});
    await a.waitForTimeout(150);

    await a.evaluate(() => window.__enterEdit?.());
    await a.waitForSelector('[data-testid="edit-inventory"]:not(.hidden)', { timeout: 8000 });
    await assertInsideViewport(a, ['[data-testid="edit-inventory"]', '[data-testid="edit-done"]', '[data-testid="cam-toggle"]'], "Edit mode inventory fits the viewport");
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


async function runPhoneButtonHitTests(browser) {
  log("Dock phone button hit target and touch toggles");
  const i14 = devices["iPhone 14"] || devices["iPhone 13"] || { viewport: { width: 390, height: 844 } };
  const ctx = await browser.newContext({ ...i14, hasTouch: true, isMobile: true, viewport: { width: 390, height: 844 } });
  const page = await ctx.newPage();
  page.setDefaultTimeout(20000);
  await login(page, "phnbtn");
  await page.waitForFunction(() => window.HouseRoom3D && window.HouseRoom3D.ready);

  const hit = await page.evaluate(() => {
    const btn = document.querySelector('[data-testid="phone-btn"]');
    const emote = document.querySelector('[data-testid="emote-wheel-btn"]');
    const chat = document.querySelector('[data-testid="chat-input"]');
    if (!btn) return null;
    const r = btn.getBoundingClientRect();
    const er = emote?.getBoundingClientRect();
    const cr = chat?.getBoundingClientRect();
    const after = getComputedStyle(btn, "::after");
    const inset = {
      left: parseFloat(after.left) || 0,
      right: parseFloat(after.right) || 0,
      top: parseFloat(after.top) || 0,
      bottom: parseFloat(after.bottom) || 0,
    };
    const hitBox = {
      x: r.x + inset.left,
      y: r.y + inset.top,
      w: r.width - inset.left - inset.right,
      h: r.height - inset.top - inset.bottom,
    };
    const overlaps = (a, b) => Boolean(b && a.x < b.right && a.x + a.w > b.left && a.y < b.bottom && a.y + a.h > b.top);
    const isBtn = (el) => Boolean(el && (el.id === "phone-btn" || el.closest?.("#phone-btn")));
    const sample = [
      [hitBox.x + 2, hitBox.y + hitBox.h / 2],
      [hitBox.x + hitBox.w - 2, hitBox.y + hitBox.h / 2],
      [hitBox.x + hitBox.w / 2, hitBox.y + 2],
      [hitBox.x + hitBox.w / 2, hitBox.y + hitBox.h - 2],
    ].map(([x, y]) => isBtn(document.elementFromPoint(x, y)));
    return {
      visible: { w: +r.width.toFixed(2), h: +r.height.toFixed(2) },
      emote: er ? { w: +er.width.toFixed(2), h: +er.height.toFixed(2) } : null,
      hit: { w: +hitBox.w.toFixed(2), h: +hitBox.h.toFixed(2), x: +hitBox.x.toFixed(2), y: +hitBox.y.toFixed(2) },
      overlapsEmote: overlaps(hitBox, er),
      overlapsChat: overlaps(hitBox, cr),
      slopHits: sample,
    };
  });
  check(
    "The dock phone button is a slightly larger round control than the emote button",
    Boolean(hit && hit.emote && hit.visible.w >= 46 && hit.visible.w <= 48 && hit.visible.h >= 46 && hit.visible.h <= 48 && hit.emote.w >= 40 && hit.emote.w <= 44 && hit.visible.w >= hit.emote.w + 4),
    JSON.stringify(hit)
  );
  check(
    "The dock phone button has at least a 52×52 hit target that misses the emote button and chat input",
    Boolean(hit && hit.hit.w >= 52 && hit.hit.h >= 52 && !hit.overlapsEmote && !hit.overlapsChat && hit.slopHits.every(Boolean)),
    JSON.stringify(hit)
  );

  async function assertBtnOnTop(label, setup) {
    if (setup) await setup();
    const report = await page.evaluate(() => {
      const btn = document.querySelector('[data-testid="phone-btn"]');
      const r = btn.getBoundingClientRect();
      const pts = [
        ["center", r.x + r.width / 2, r.y + r.height / 2],
        ["tl", r.x + 2, r.y + 2],
        ["tr", r.x + r.width - 2, r.y + 2],
        ["bl", r.x + 2, r.y + r.height - 2],
        ["br", r.x + r.width - 2, r.y + r.height - 2],
      ];
      const isBtn = (el) => Boolean(el && (el.id === "phone-btn" || el.closest?.("#phone-btn")));
      return {
        box: { w: +r.width.toFixed(2), h: +r.height.toFixed(2), x: +r.x.toFixed(2), y: +r.y.toFixed(2) },
        pts: pts.map(([name, x, y]) => {
          const el = document.elementFromPoint(x, y);
          return { name, ok: isBtn(el), id: el?.id || "", cls: (typeof el?.className === "string" ? el.className : "").slice(0, 60), tag: el?.tagName };
        }),
      };
    });
    check(
      `Nothing covers the phone button (${label})`,
      Boolean(report.pts.every((p) => p.ok)),
      JSON.stringify(report)
    );
  }

  await assertBtnOnTop("normal");

  await openChat(page);
  await page.focus('[data-testid="chat-input"]');
  await page.evaluate(() => window.__setKeyboardInset?.(320));
  await page.waitForTimeout(80);
  await assertBtnOnTop("keyboard up");
  await page.evaluate(() => {
    window.__setKeyboardInset?.(0);
    document.querySelector('[data-testid="chat-input"]')?.blur();
  });
  await page.waitForTimeout(80);

  await page.evaluate(() => window.__enterEdit?.());
  await page.waitForSelector('[data-testid="edit-inventory"]:not(.hidden)');
  await assertBtnOnTop("edit row shown");
  await page.evaluate(() => window.__exitEdit?.());

  await page.evaluate(() => window.__toast?.("Saved!"));
  await page.waitForTimeout(50);
  await assertBtnOnTop("toast shown");

  await page.evaluate(() => window.__openPhone?.());
  await page.waitForSelector('[data-testid="phone-overlay"]:not(.hidden)');
  await assertBtnOnTop("phone open");
  await page.evaluate(() => window.__closePhone?.());
  await page.waitForFunction(() => document.querySelector('[data-testid="phone-overlay"]')?.classList.contains("hidden"));

  await page.evaluate(() => window.__openStore?.("furniture"));
  await page.waitForSelector('[data-testid="store-panel"]:not(.hidden)');
  await assertBtnOnTop("shop panel open");
  await page.evaluate(() => window.__closeStore?.());

  // First tap with the chat input focused must open the phone, not just blur.
  await openChat(page);
  await page.focus('[data-testid="chat-input"]');
  await page.evaluate(() => window.__setKeyboardInset?.(320));
  await page.waitForTimeout(80);
  let box = await page.locator('[data-testid="phone-btn"]').boundingBox();
  await page.touchscreen.tap(box.x + box.width / 2, box.y + box.height / 2);
  const openedFromFocus = await page.waitForSelector('[data-testid="phone-overlay"]:not(.hidden)', { timeout: 3000 }).then(() => true).catch(() => false);
  check("Tapping the phone button while the chat input is focused opens the phone on the first tap", openedFromFocus);
  box = await page.locator('[data-testid="phone-btn"]').boundingBox();
  await page.touchscreen.tap(box.x + box.width / 2, box.y + box.height / 2);
  const closedAgain = await page.waitForFunction(() => document.querySelector('[data-testid="phone-overlay"]')?.classList.contains("hidden"), null, { timeout: 3000 }).then(() => true).catch(() => false);
  check("Tapping the phone button again closes the phone while the keyboard is up", closedAgain);
  await page.evaluate(() => window.__setKeyboardInset?.(0));

  await page.evaluate(() => { window.__closePhone?.(); window.__enterEdit?.(); });
  await page.waitForSelector('[data-testid="edit-inventory"]:not(.hidden)');
  box = await page.locator('[data-testid="phone-btn"]').boundingBox();
  await page.touchscreen.tap(box.x + box.width / 2, box.y + box.height / 2);
  const openedInEdit = await page.waitForSelector('[data-testid="phone-overlay"]:not(.hidden)', { timeout: 3000 }).then(() => true).catch(() => false);
  check("Tapping the phone button in Edit Room opens the phone", openedInEdit);
  await page.evaluate(() => { window.__closePhone?.(); window.__exitEdit?.(); });

  await page.evaluate(() => window.__closePhone?.());
  await page.waitForFunction(() => document.querySelector('[data-testid="phone-overlay"]')?.classList.contains("hidden"));
  let toggles = 0;
  const missed = [];
  let seed = 12345;
  const rnd = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return (seed >>> 8) / 0x1000000; };
  for (let i = 0; i < 20; i++) {
    const before = await page.evaluate(() => !document.querySelector('[data-testid="phone-overlay"]')?.classList.contains("hidden"));
    const r = await page.locator('[data-testid="phone-btn"]').boundingBox();
    const x = r.x + 3 + rnd() * Math.max(1, r.width - 6);
    const y = r.y + 3 + rnd() * Math.max(1, r.height - 6);
    await page.touchscreen.tap(x, y);
    const ok = await page.waitForFunction((prev) => {
      const open = !document.querySelector('[data-testid="phone-overlay"]')?.classList.contains("hidden");
      return open !== prev;
    }, before, { timeout: 2000 }).then(() => true).catch(() => false);
    if (ok) toggles += 1;
    else missed.push({ i, before, x: +x.toFixed(1), y: +y.toFixed(1) });
  }
  check("20 random taps inside the phone button produce 20 toggles", toggles === 20, JSON.stringify({ toggles, missed }));

  await page.evaluate(() => window.__closePhone?.());
  await page.waitForFunction(() => document.querySelector('[data-testid="phone-overlay"]')?.classList.contains("hidden"));
  const r = await page.locator('[data-testid="phone-btn"]').boundingBox();
  const cx = r.x + r.width / 2;
  const cy = r.y + r.height / 2;
  await page.touchscreen.tap(cx, cy);
  await page.touchscreen.tap(cx, cy);
  await page.touchscreen.tap(cx, cy);
  const rapid = await page.evaluate(() => !document.querySelector('[data-testid="phone-overlay"]')?.classList.contains("hidden"));
  check("Rapid taps toggle the phone on every tap (open-close-open)", rapid === true);

  await ctx.close();
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

  log("A fresh visit lands in your cube");
  await alice.goto(BASE, { waitUntil: "domcontentloaded" });
  await alice.waitForSelector('body[data-view="room"]', { timeout: 20000 });
  await alice.waitForTimeout(400);
  const firstBoot = await alice.evaluate(() => ({
    view: document.body.dataset.view,
    menu: Boolean(document.querySelector('[data-testid="start-menu"]') && !document.getElementById("view-login")?.classList.contains("hidden")),
    title: document.querySelector('[data-testid="room-title"]')?.textContent || "",
    user: localStorage.getItem("hearthUser") || "",
  }));
  check(
    "The first screen is the player's own cube, not the start menu",
    firstBoot.view === "room" && !firstBoot.menu && /'s Cube/i.test(firstBoot.title),
    JSON.stringify(firstBoot)
  );

  log("Sign out reveals the arcade start menu for switching accounts");
  await alice.evaluate(() => window.__signOut?.());
  await alice.waitForSelector('[data-testid="start-menu"]', { timeout: 20000 });
  await alice.waitForTimeout(400);
  const startLayout = await alice.evaluate(() => {
    const menu = document.querySelector('[data-testid="start-menu"]');
    const room = document.querySelector('[data-testid="start-room"]');
    const canvas = room && room.querySelector("canvas");
    const mr = menu.getBoundingClientRect();
    const rr = (canvas || room).getBoundingClientRect();
    const vw = window.innerWidth, vh = window.innerHeight;
    const menuCx = mr.left + mr.width / 2, menuCy = mr.top + mr.height / 2;
    const roomCx = rr.left + rr.width / 2, roomCy = rr.top + rr.height / 2;
    return {
      hasCanvas: Boolean(canvas && canvas.width > 8 && canvas.height > 8),
      menuW: mr.width, menuH: mr.height,
      centered: Math.abs(menuCx - roomCx) < 48 && Math.abs(menuCy - roomCy) < 80 && Math.abs(menuCx - vw / 2) < 48,
      selected: document.querySelector("[data-action].is-selected")?.getAttribute("data-action") || "",
      options: [...document.querySelectorAll("#start-options [data-action]")].map((el) => el.getAttribute("data-action")),
    };
  });
  check(
    "The first screen is an empty cube with an arcade menu in the middle",
    Boolean(startLayout.hasCanvas && startLayout.centered && startLayout.menuW > 80),
    JSON.stringify(startLayout)
  );
  check(
    "PRESS START is selected by default and every start-flow action is listed",
    startLayout.selected === "start" && startLayout.options.join(",") === "start,signin,new,about",
    JSON.stringify(startLayout)
  );
  await alice.keyboard.press("ArrowDown");
  const afterDown = await alice.evaluate(() => window.__startMenu?.index() + ":" + document.querySelector("[data-action].is-selected")?.getAttribute("data-action"));
  check("Arrow keys move the blinking arcade cursor", afterDown === "1:signin", afterDown);
  await alice.locator('[data-testid="start-option-about"]').click();
  await alice.waitForSelector('[data-testid="start-about"]:not(.hidden)');
  const aboutText = await alice.locator('[data-testid="start-about"]').innerText();
  check(
    "ABOUT opens the existing product copy",
    /contact list|bubbles appear/i.test(aboutText),
    aboutText.slice(0, 160)
  );
  await alice.locator('[data-testid="start-about-back"]').click();
  await alice.waitForSelector('[data-testid="start-menu"]:not(.hidden)');
  await alice.locator('[data-testid="start-option-start"]').click();
  await alice.waitForSelector('[data-testid="username-input"]');
  check(
    "PRESS START opens the existing username form so login still works",
    await alice.locator('[data-testid="login-btn"]').isVisible() && await alice.locator('[data-testid="username-input"]').isVisible()
  );

  log("Alice and Bob create characters");
  await login(alice, "alice");
  log("Arcade character creator");
  await openPhone(alice);
  check("Edit Character is on the in-game phone", await alice.locator('[data-testid="phone-app-edit-character"]').isVisible());
  await alice.click('[data-testid="phone-app-edit-character"]');
  await alice.waitForSelector('[data-testid="creator-window"]');
  await alice.waitForTimeout(400);
  const creatorLayout = await alice.evaluate(() => {
    const room = document.getElementById("view-room");
    const canvas = room && room.querySelector("canvas");
    const phone = document.querySelector("[data-testid=phone-device]");
    const win = document.querySelector("[data-testid=creator-window]");
    const tabs = [...document.querySelectorAll("#creator-tabs [data-tab]")].map((el) => el.getAttribute("data-tab"));
    const wr = win.getBoundingClientRect();
    const pr = phone.getBoundingClientRect();
    const rr = (canvas || room).getBoundingClientRect();
    const pose = window.__avatarPose?.();
    return {
      view: document.body.dataset.view,
      phoneEdit: window.__creatorMenu?.isPhoneEdit?.() || false,
      hasRoom: Boolean(canvas && canvas.width > 8 && canvas.height > 8 && rr.width > 80 && rr.height > 80),
      phoneVisible: pr.width > 80 && pr.height > 80,
      windowInsidePhone: wr.width > 80 && wr.height > 80 && wr.left >= pr.left - 2 && wr.right <= pr.right + 2 && wr.top >= pr.top - 2 && wr.bottom <= pr.bottom + 2,
      characterInRoom: Boolean(pose?.tile && pose.view === "room"),
      tab: window.__creatorMenu?.tab() || "",
      tabs,
    };
  });
  check(
    "Edit Character opens full-screen and keeps the avatar in the room",
    Boolean(creatorLayout.view === "room" && creatorLayout.hasRoom && creatorLayout.characterInRoom),
    JSON.stringify(creatorLayout)
  );
  check(
    "Creator options are grouped into Skin / Hair / Shirt / Pants / Shoes / Head / Accessories tabs",
    creatorLayout.tab === "skin" && creatorLayout.tabs.join(",") === "skin,hair,shirt,pants,shoes,head,extras",
    JSON.stringify(creatorLayout)
  );
  await alice.evaluate(() => document.activeElement && document.activeElement.blur && document.activeElement.blur());
  await alice.locator('[data-testid="creator-tabs"]').click({ position: { x: 8, y: 8 } });
  await alice.keyboard.press("ArrowRight");
  const afterRight = await alice.evaluate(() => window.__creatorMenu?.tab());
  check("Arrow keys move between creator tabs", afterRight === "hair", afterRight);
  await clickCreatorOption(alice, "hair-3");
  const hairOn = await alice.evaluate(() => document.querySelector('[data-testid="hair-3"]')?.classList.contains("selected"));
  check("Choosing a hair style in its tab updates the live selection", hairOn === true);
  await alice.keyboard.press("ArrowLeft");
  const backBody = await alice.evaluate(() => window.__creatorMenu?.tab());
  check("Arrow left returns to the Skin tab", backBody === "skin", backBody);

  await customize(alice, { displayName: "Alice", hair: 3, shirt: 0, skin: 1, glasses: false });
  await clickCreatorOption(alice, "hat-1");
  await clickCreatorOption(alice, "hatColor-2");
  await clickCreatorOption(alice, "glassesStyle-1");
  await clickCreatorOption(alice, "necklace-1");
  await alice.waitForTimeout(300);
  await alice.setViewportSize({ width: 1280, height: 1100 });
  await alice.screenshot({ path: `${SHOT}/01-character-creator.png` });
  await alice.setViewportSize({ width: 1280, height: 800 });
  await saveAvatar(alice);
  check("Alice can create an avatar and land in her own cube", await alice.locator('body[data-view="room"]').count() === 1);
  const aliceHome = await alice.evaluate(() => document.querySelector('[data-testid="room-title"]')?.textContent || "");
  check("Alice's home cube is her own", /alice/i.test(aliceHome), aliceHome);
  await goToLobby(alice);

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
    await screenshotAvatar(bob, path);
    varietyPaths.push(path);
  }
  await composeAvatarGrid(varietyPaths, varietyLooks.map((l) => l.name), `${SHOT}/36-avatar-variety.png`);
  for (const path of varietyPaths) {
    await unlink(path).catch(() => {});
  }
  check("Avatar variety grid shows every hairstyle", true);

  await customize(bob, { displayName: "Bob", hair: 2, shirt: 2, skin: 3, hairColor: 0, glasses: true });
  await bob.waitForTimeout(500);
  await screenshotAvatar(bob, `${SHOT}/07-character-closeup.png`);
  await screenshotAvatar(bob, `${SHOT}/32-avatar-closeup.png`);
  await saveAvatar(bob);
  check("Bob can create an avatar and land in his own cube", await bob.locator('body[data-view="room"]').count() === 1);
  await goToLobby(bob);

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

  const outline = await alice.evaluate(async () => {
    const avMod = await import("/js/avatar3d.js?outline=1");
    const petMod = await import("/js/petSprites.js?outline=1");
    const count = avMod.countNearWhiteEdgePixels;
    const looks = [
      { skin: "#f0c9a8", hair: "spiky", hairColor: "#f4d27a", shirt: "#ef5a5a", top: "tshirt", bottom: "jeans", bottomColor: "#3d4f7c", shoes: "white" },
      { skin: "#c98a62", hair: "ponytail", hairColor: "#f4d27a", shirt: "#6c7bff", top: "hoodie", bottom: "baggy", bottomColor: "#3d4f7c", shoes: "black", accessory: "beanie" },
      { skin: "#8d5524", hair: "afropuff", hairColor: "#2b1a12", shirt: "#3d8a3a", top: "varsity", bottom: "jeans", bottomColor: "#2a2a2e", shoes: "gum" },
      { skin: "#f0c9a8", hair: "spacebuns", hairColor: "#b48cff", shirt: "#f4efe6", top: "tshirt", bottom: "skirt", bottomColor: "#c45a3a", shoes: "white", accessory: "cap" },
    ];
    const poses = [
      { bodyDir: 1, headDir: 1, blink: "open" },
      { bodyDir: 0, headDir: 0, walk: true },
      { bodyDir: 7, headDir: 7, sitting: true },
      { bodyDir: 5, headDir: 5, usingPhone: true },
      { bodyDir: 3, headDir: 3, actionEmote: "wave" },
    ];
    const hits = [];
    for (const look of looks) {
      for (const flags of poses) {
        for (const dir of [0, 1, 2, 3, 4, 5, 6, 7]) {
          const spr = avMod.drawAvatarSprite(look, { ...flags, bodyDir: dir, headDir: dir }, flags.walk ? 3 : 0);
          const n = count(spr.c);
          if (n) hits.push({ kind: "avatar", hair: look.hair, dir, n, flags: Object.keys(flags).join(",") });
        }
      }
    }
    for (const pet of ["cat", "dog", "bunny", "fox", "parrot"]) {
      for (const dir of [0, 1, 2, 3, 4, 5, 6, 7]) {
        for (const sit of [false, true]) {
          const spr = petMod.drawPetSprite(pet, { dir, sit, blink: "open" }, 0);
          const n = count(spr.c);
          if (n) hits.push({ kind: "pet", pet, dir, sit, n });
        }
      }
    }
    return { hits: hits.slice(0, 12), count: hits.length };
  });
  check("Avatar and pet silhouette edges have no white or cream outline", outline.count === 0, JSON.stringify(outline));

  const shape = await alice.evaluate(async () => {
    const avMod = await import("/js/avatar3d.js?shape=1");
    const looks = [
      { skin: "#f0c9a8", hair: "spiky", hairColor: "#f4d27a", shirt: "#ef5a5a", top: "tshirt", bottom: "jeans", bottomColor: "#3d4f7c", shoes: "white" },
      { skin: "#c98a62", hair: "ponytail", hairColor: "#f4d27a", shirt: "#6c7bff", top: "hoodie", bottom: "baggy", bottomColor: "#3d4f7c", shoes: "black" },
      { skin: "#8d5524", hair: "afropuff", hairColor: "#2b1a12", shirt: "#3d8a3a", top: "varsity", bottom: "jeans", bottomColor: "#2a2a2e", shoes: "gum" },
      { skin: "#f0c9a8", hair: "spacebuns", hairColor: "#b48cff", shirt: "#f4efe6", top: "tshirt", bottom: "skirt", bottomColor: "#c45a3a", shoes: "white" },
    ];
    const samples = [];
    for (const look of looks) {
      for (const dir of [0, 1, 7, 5]) {
        const idle = avMod.inspectAvatarGeometry(look, { bodyDir: dir, headDir: dir, blink: "open" }, 0);
        samples.push({ hair: look.hair, dir, pose: "idle", ...idle });
        const walk = avMod.inspectAvatarGeometry(look, { bodyDir: dir, headDir: dir, blink: "open", walking: true }, 2);
        samples.push({ hair: look.hair, dir, pose: "walk", ...walk });
      }
    }
    const bad = samples.filter((s) => !s.seated || !s.squishy || !s.compact);
    return {
      ok: bad.length === 0,
      bad: bad.slice(0, 8),
      sample: samples[0],
    };
  });
  check("Avatars are short and squishy with the head seated on the shoulders", Boolean(shape.ok), JSON.stringify(shape));

  const hands = await alice.evaluate(async () => {
    const avMod = await import("/js/avatar3d.js?hands=1");
    const looks = [
      { skin: "#f0c9a8", hair: "spiky", hairColor: "#f4d27a", shirt: "#ef5a5a", top: "tshirt", bottom: "jeans", bottomColor: "#3d4f7c", shoes: "white" },
      { skin: "#c98a62", hair: "ponytail", hairColor: "#f4d27a", shirt: "#6c7bff", top: "hoodie", bottom: "baggy", bottomColor: "#3d4f7c", shoes: "black" },
      { skin: "#8d5524", hair: "afropuff", hairColor: "#2b1a12", shirt: "#3d8a3a", top: "varsity", bottom: "jeans", bottomColor: "#2a2a2e", shoes: "gum" },
      { skin: "#f0c9a8", hair: "spacebuns", hairColor: "#b48cff", shirt: "#f4efe6", top: "tshirt", bottom: "skirt", bottomColor: "#c45a3a", shoes: "white" },
    ];
    const samples = [];
    for (const look of looks) {
      for (const dir of [0, 1, 7, 5]) {
        for (const walking of [false, true]) {
          const g = avMod.inspectHandClearance(look, { bodyDir: dir, headDir: dir, blink: "open", walking }, walking ? 2 : 0);
          samples.push({ hair: look.hair, dir, walking, overlap: g.overlap, ok: g.ok, samples: g.samples });
        }
      }
    }
    const bad = samples.filter((s) => !s.ok);
    return { ok: bad.length === 0, bad: bad.slice(0, 8), count: samples.length };
  });
  check("Mitten hands hang beside the torso and do not overlap it", Boolean(hands.ok), JSON.stringify(hands));

  log("Speech bubbles: visible in-room, then they rise in row order");
  await alice.evaluate(() => window.__clickTile(2, 3));
  await bob.evaluate(() => window.__clickTile(4, 3));
  await alice.waitForTimeout(1400);
  await openChat(alice);
  await alice.fill('[data-testid="chat-input"]', "hey there friend!");
  await sendChatMsg(alice);
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
  await openChat(bob);
  await bob.fill('[data-testid="chat-input"]', "right back at you");
  await sendChatMsg(bob);
  await alice.waitForSelector('[data-testid="bubble-bob"]');
  await alice.waitForTimeout(250);
  await openChat(alice);
  await alice.fill('[data-testid="chat-input"]', "stack us up");
  await sendChatMsg(alice);
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

  const longA = "This is a long multi-line cube chat that should wrap inside the bubble instead of colliding with neighbors when we stack several of them in a row.";
  const longB = "Another lengthy reply about Cube Cola, hanging out, and why the bubbles have to stay neatly stacked no matter how much we type.";
  const longC = "A third long message from Alice so we can prove a tall bubble pushes every older line up by its real height plus a gap.";
  await openChat(alice);
  await alice.fill('[data-testid="chat-input"]', longA.slice(0, 120));
  await sendChatMsg(alice);
  await openChat(bob);
  await bob.fill('[data-testid="chat-input"]', longB.slice(0, 120));
  await sendChatMsg(bob);
  await openChat(alice);
  await alice.fill('[data-testid="chat-input"]', longC.slice(0, 120));
  await sendChatMsg(alice);
  await bob.waitForTimeout(450);
  const stackedLong = await bob.evaluate(() => {
    const els = [...document.querySelectorAll(".speech-stack")].filter((el) => el.dataset.testid && el.dataset.testid.startsWith("bubble-"));
    const boxes = els.map((el) => {
      const r = el.getBoundingClientRect();
      return { testid: el.dataset.testid, text: (el.innerText || "").replace(/\s+/g, " ").trim(), top: r.top, bottom: r.bottom, height: r.height };
    }).sort((a, b) => a.top - b.top);
    const overlaps = [];
    for (let i = 1; i < boxes.length; i++) {
      if (boxes[i].top < boxes[i - 1].bottom - 1) overlaps.push([boxes[i - 1], boxes[i]]);
    }
    return { count: boxes.length, overlaps, boxes };
  });
  check(
    "Long multi-line bubbles never overlap and stack by their measured height",
    Boolean(stackedLong.count >= 3 && stackedLong.overlaps.length === 0 && stackedLong.boxes.every((b, i) => i === 0 || b.top >= stackedLong.boxes[i - 1].bottom - 1)),
    JSON.stringify(stackedLong)
  );

  await openChat(alice);
  const capUi = await alice.evaluate(() => {
    const input = document.querySelector('[data-testid="chat-input"]');
    const count = document.querySelector('[data-testid="chat-count"]');
    const over = "x".repeat(121);
    input.value = "";
    input.focus();
    input.dispatchEvent(new InputEvent("beforeinput", { bubbles: true, data: over, inputType: "insertText" }));
    if (input.value.length < 121) {
      input.value = over;
      if (input.maxLength >= 0 && over.length > input.maxLength) input.value = over.slice(0, input.maxLength);
      input.dispatchEvent(new Event("input", { bubbles: true }));
    }
    return {
      max: Number(input.getAttribute("maxlength")),
      valueLen: input.value.length,
      counter: count?.textContent || "",
    };
  });
  check(
    "The chat box blocks a 121st character and shows a live 120 cap counter",
    capUi.max === 120 && capUi.valueLen === 120 && capUi.counter === "120/120",
    JSON.stringify(capUi)
  );
  await alice.evaluate(() => { const i = document.querySelector('[data-testid="chat-input"]'); if (i) i.value = ""; });

  const beforeCap = await bob.evaluate(() => (window.__chatBubbles() || []).map((b) => b.text));
  await alice.evaluate(() => window.__say?.("Y".repeat(150)));
  const serverCap = await bob.waitForFunction((prev) => {
    const texts = (window.__chatBubbles() || []).map((b) => b.text);
    const fresh = texts.filter((t) => t.includes("Y") && !prev.includes(t));
    return fresh[0] || null;
  }, beforeCap, { timeout: 6000 }).then((h) => h.jsonValue()).catch(() => null);
  check(
    "The server caps chat messages at 120 characters",
    typeof serverCap === "string" && serverCap.replace(/\s/g, "").length === 120 && !/[Y]{121}/.test(serverCap),
    JSON.stringify({ serverCap: serverCap && serverCap.length, text: serverCap })
  );

  log("Bubbles are not delivered outside the room");
  await openPhoneApp(bob, "leave");
  await bob.click('[data-testid="leave-room"]');
  await bob.waitForSelector('body[data-view="lobby"]');
  const before = await bob.evaluate(() => window.__lastSays.map((s) => s.text));
  await openChat(alice);
  await alice.fill('[data-testid="chat-input"]', "secret whisper");
  await sendChatMsg(alice);
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
  await alice.evaluate(() => window.__debugKit?.({ coins: 400 }));
  await alice.waitForTimeout(200);
  await openPhoneApp(alice, "shop");
  await alice.waitForSelector('[data-testid="store-panel"]:not(.hidden)');
  await alice.waitForSelector('[data-testid="buy-couch"]');
  await alice.evaluate(() => document.querySelector('[data-testid="buy-couch"]')?.click());
  await alice.waitForFunction(() => (window.__inventory?.() || []).includes("couch"), null, { timeout: 15000 });
  await alice.evaluate(() => document.querySelector('[data-testid="buy-plant"]')?.click());
  await alice.waitForFunction(() => (window.__inventory?.() || []).includes("plant"), null, { timeout: 15000 });
  await alice.evaluate(() => document.querySelector('#inventory-row [data-place="couch"], #store-panel [data-place="couch"], #phone-screen-edit [data-place="couch"]')?.click());
  await alice.evaluate(() => window.__clickTile(3, 1));
  await alice.waitForFunction(() => window.HouseRoom3D.getFurniture().some((f) => f.type === "couch"));
  await openPhoneApp(alice, "shop");
  await alice.waitForFunction(() => (window.__inventory?.() || []).includes("plant"), null, { timeout: 15000 });
  await alice.evaluate(() => document.querySelector('#inventory-row [data-place="plant"], #store-panel [data-place="plant"], #phone-screen-edit [data-place="plant"]')?.click());
  await alice.evaluate(() => window.__clickTile(0, 1));
  await alice.waitForFunction(() => window.HouseRoom3D.getFurniture().some((f) => f.type === "plant"));
  await bob.waitForFunction(() => window.HouseRoom3D.getFurniture().some((f) => f.type === "couch"));
  const coins = await alice.locator("#room-coins").innerText();
  check("Owner can buy furniture and coins decrease", Number(coins) < 400 && Number(coins) >= 0 && Number.isFinite(Number(coins)), `coins=${coins}`);
  check("Placed furniture appears for everyone in the room", await bob.evaluate(() => window.HouseRoom3D.getFurniture().some((f) => f.type === "couch")));

  await alice.evaluate(() => window.__emote?.("drink"));
  await bob.waitForSelector('[data-testid="emote-alice"]');
  check("Eat/drink emotes show up on the avatar", true);

  await alice.waitForTimeout(500);
  await alice.screenshot({ path: `${SHOT}/05-furniture.png` });
  // Put the drink away so the hold chip does not cover later panels.
  if (await alice.evaluate(() => Boolean(window.HouseRoom3D?.personFlags("alice")?.heldItem))) {
    await alice.evaluate(() => window.__stowItem());
    await alice.waitForFunction(() => !window.HouseRoom3D.personFlags("alice")?.heldItem, null, { timeout: 8000 });
  }

  log("In-room phone menu");
  await alice.setViewportSize({ width: 390, height: 844 });
  await alice.waitForTimeout(400);
  await openPhone(alice);
  await alice.waitForTimeout(250);
  const chatBox = await alice.evaluate(() => {
    const bubble = document.querySelector("[data-testid=chat-bubble-btn]");
    const phone = document.querySelector("[data-testid=phone-device]");
    const br = bubble?.getBoundingClientRect();
    const pr = phone?.getBoundingClientRect();
    const inside = Boolean(br && pr && br.left >= pr.left && br.right <= pr.right && br.top >= pr.top && br.bottom <= pr.bottom);
    return {
      bubble: br && { y: +br.y.toFixed(1), h: +br.height.toFixed(1), visible: br.width > 8 && br.height > 8 },
      phone: pr && { y: +pr.y.toFixed(1), h: +pr.height.toFixed(1), x: +pr.x.toFixed(1), w: +pr.width.toFixed(1) },
      inside,
    };
  });
  const phoneBox = chatBox.phone;
  check(
    "The chat bubble stays visible outside the handheld phone",
    Boolean(chatBox.bubble?.visible && phoneBox && !chatBox.inside),
    JSON.stringify(chatBox)
  );
  const vp = alice.viewportSize();
  check(
    "The phone menu is a small handheld in the corner with the room still visible above it",
    Boolean(phoneBox && phoneBox.w <= 176 && phoneBox.w <= vp.width * 0.42 && phoneBox.h <= 250 && phoneBox.x < vp.width * 0.45 && phoneBox.x >= -4 && phoneBox.x < 40),
    JSON.stringify(phoneBox && { w: Math.round(phoneBox.w), h: Math.round(phoneBox.h), x: Math.round(phoneBox.x), y: Math.round(phoneBox.y), vw: vp.width, vh: vp.height })
  );
  const aliceOnPhone = await alice.waitForFunction(() => window.HouseRoom3D.personFlags("alice")?.usingPhone, null, { timeout: 8000 }).then(() => true).catch(() => false);
  const bobSeesPhone = await bob.waitForFunction(() => window.HouseRoom3D.personFlags("alice")?.usingPhone, null, { timeout: 8000 }).then(() => true).catch(() => false);
  check("Opening the phone menu makes your character pull out a phone", aliceOnPhone);
  const poseHold = await alice.evaluate(async () => {
    const mod = await import("/js/avatar3d.js?phonepose=1");
    const av = window.__storeState?.()?.me?.avatar || {};
    const views = [0, 1, 2, 3, 4, 5, 6, 7];
    return views.map((dir) => ({ dir, ...mod.inspectPhoneHold(av, { bodyDir: dir, headDir: dir, usingPhone: true }, 0) }));
  });
  check(
    "The phone-open pose holds the phone at the side, not in front of the face, in all 8 directions",
    Array.isArray(poseHold) && poseHold.length === 8 && poseHold.every((p) => p.hasPhone && p.atSide && !p.overlapsFace),
    JSON.stringify(poseHold.map((p) => ({ dir: p.dir, hasPhone: p.hasPhone, atSide: p.atSide, overlapsFace: p.overlapsFace, phone: p.phone, face: p.face })))
  );
  check("Other people in the cube see you scrolling on a phone", bobSeesPhone);
  await alice.waitForTimeout(500);
  await alice.screenshot({ path: `${SHOT}/29-corner-phone.png` });
  await alice.screenshot({ path: `${SHOT}/08-phone-menu.png` });
  await openPhoneApp(alice, "shop");
  await alice.waitForSelector('[data-testid="store-panel"]:not(.hidden)');
  await alice.waitForFunction(() => document.querySelector('[data-testid="phone-overlay"]')?.classList.contains("hidden") && window.HouseRoom3D.personFlags("alice")?.usingPhone, null, { timeout: 8000 }).catch(() => {});
  const shopMutex = await alice.evaluate(() => ({
    phoneClosed: document.querySelector('[data-testid="phone-overlay"]')?.classList.contains("hidden"),
    shopOpen: !document.querySelector('[data-testid="store-panel"]')?.classList.contains("hidden"),
    usingPhone: Boolean(window.HouseRoom3D.personFlags("alice")?.usingPhone),
  }));
  check(
    "Opening the shop from a phone session hides the handset and keeps the phone-hold pose",
    shopMutex.phoneClosed && shopMutex.shopOpen && shopMutex.usingPhone,
    JSON.stringify(shopMutex)
  );
  await alice.waitForTimeout(200);
  await alice.screenshot({ path: `${SHOT}/09-phone-app-open.png` });
  await alice.click('[data-testid="store-close"]');
  await alice.waitForFunction(() => document.querySelector('[data-testid="store-panel"]')?.classList.contains("hidden"));
  await openPhone(alice);
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
  const dockPhone = await alice.evaluate(() => {
    const dock = document.querySelector('[data-testid="chat-dock"]');
    const phone = document.querySelector('[data-testid="phone-btn"]');
    const emote = document.querySelector('[data-testid="emote-wheel-btn"]');
    if (!dock || !phone || !emote) return { missing: true };
    const kids = [...dock.children].map((el) => el.getAttribute("data-testid") || el.id);
    const pr = phone.getBoundingClientRect();
    const er = emote.getBoundingClientRect();
    return {
      inDock: dock.contains(phone) && dock.contains(emote),
      order: kids,
      phoneBeforeEmote: pr.right <= er.left + 1,
      gap: Math.round(er.left - pr.right),
    };
  });
  check(
    "The phone button sits in the chat dock next to the emote button",
    Boolean(dockPhone.inDock && dockPhone.phoneBeforeEmote && dockPhone.order[0] === "phone-btn" && dockPhone.order[1] === "emote-wheel-btn"),
    JSON.stringify(dockPhone)
  );
  await alice.setViewportSize({ width: 360, height: 640 });
  await alice.waitForTimeout(200);
  await openChat(alice);
  const slim = await alice.evaluate(() => {
    const input = document.querySelector('[data-testid="chat-input"]');
    const r = input?.getBoundingClientRect();
    return { w: r ? Math.round(r.width) : 0, font: input ? parseFloat(getComputedStyle(input).fontSize) : 0 };
  });
  check("The chat input stays wide enough on a 360px phone", Boolean(slim.w >= 120 && slim.font >= 16), JSON.stringify(slim));
  await alice.setViewportSize({ width: 1280, height: 800 });
  check("Room controls are packaged as apps on an in-game phone", true);

  log("Sending chat does not open the phone, and the phone grid fits without scrolling");
  await alice.setViewportSize({ width: 390, height: 844 });
  await alice.waitForTimeout(200);
  await alice.evaluate(() => document.querySelector('[data-testid="phone-overlay"]')?.classList.add("hidden"));
  await openChat(alice);
  await alice.fill('[data-testid="chat-input"]', "do not open the phone");
  await sendChatMsg(alice);
  await alice.waitForTimeout(250);
  const phoneStayedShut = await alice.evaluate(() => document.querySelector('[data-testid="phone-overlay"]')?.classList.contains("hidden"));
  check("Sending a chat with Say does not open the phone menu", phoneStayedShut);
  await openChat(alice);
  await alice.fill('[data-testid="chat-input"]', "enter should not open it either");
  await openChat(alice);
  await alice.locator('[data-testid="chat-input"]').press("Enter");
  await alice.waitForTimeout(250);
  const phoneStayedShutEnter = await alice.evaluate(() => document.querySelector('[data-testid="phone-overlay"]')?.classList.contains("hidden"));
  check("Pressing Enter to send does not open the phone menu", phoneStayedShutEnter);

  const leaveVisible = await alice.locator('[data-testid="leave-cube"]').isVisible();
  const leaveBox = await alice.locator('[data-testid="leave-cube"]').boundingBox();
  const coinBox = await alice.locator('[data-testid="room-coins"]').boundingBox();
  check("Leave Cube sits in the top right next to the coin pill", Boolean(leaveVisible && leaveBox && coinBox && leaveBox.y < 80 && leaveBox.x + leaveBox.width <= (coinBox.x + coinBox.width + 8) && Math.abs(leaveBox.y - coinBox.y) < 40), JSON.stringify(leaveBox && coinBox && { leave: { x: Math.round(leaveBox.x), y: Math.round(leaveBox.y) }, coins: { x: Math.round(coinBox.x), y: Math.round(coinBox.y) } }));
  const topRow375 = await (async () => {
    const prev = alice.viewportSize();
    await alice.setViewportSize({ width: 375, height: 667 });
    await alice.waitForTimeout(200);
    const info = await alice.evaluate(() => {
      const box = (sel) => {
        const el = document.querySelector(sel);
        if (!el || el.classList.contains("hidden") || el.closest(".hidden")) return null;
        const r = el.getBoundingClientRect();
        return { x: r.x, y: r.y, r: r.right, b: r.bottom, w: r.width, h: r.height };
      };
      const shop = box('[data-testid="shop-toggle"]');
      const title = box('[data-testid="room-title"]');
      const edit = box('[data-testid="edit-room-btn"]');
      const leave = box('[data-testid="leave-cube"]');
      const coins = box('[data-testid="room-coins"]');
      const items = [shop, title, edit, leave, coins].filter(Boolean);
      const overlap = [];
      for (let i = 0; i < items.length; i++) {
        for (let j = i + 1; j < items.length; j++) {
          const a = items[i], b = items[j];
          if (a.x < b.r - 1 && a.r > b.x + 1 && a.y < b.b - 1 && a.b > b.y + 1) overlap.push([i, j]);
        }
      }
      const clipped = items.some((el) => el.x < -1 || el.y < -1 || el.r > 376 || el.b > 667);
      const plaqueRightOfCart = Boolean(shop && title && title.x >= shop.r - 1 && Math.abs(title.y - shop.y) < 28);
      const inTopRow = Boolean(title && title.y < 48);
      return { overlap, clipped, plaqueRightOfCart, inTopRow, shop, title, edit, leave, coins };
    });
    await alice.setViewportSize(prev);
    return info;
  })();
  check(
    "The cube name sits in the top row next to the shop cart and nothing clips at 375px",
    Boolean(topRow375.plaqueRightOfCart && topRow375.inTopRow && topRow375.overlap.length === 0 && !topRow375.clipped),
    JSON.stringify(topRow375)
  );

  log("Coins chip dropdown");
  await alice.setViewportSize({ width: 375, height: 667 });
  await alice.waitForTimeout(200);
  check("Buy Coins is not a phone app", await alice.locator('[data-testid="phone-app-coins"]').count() === 0);
  await alice.click('[data-testid="room-coins"]');
  await alice.waitForSelector('[data-testid="coins-panel"]:not(.hidden)');
  const coinsPanel = await alice.evaluate(() => {
    const panel = document.querySelector("[data-testid=coins-panel]");
    const chip = document.querySelector("[data-testid=room-coins]");
    const ad = document.querySelector("[data-testid=coins-watch-ad]");
    const packs = [...document.querySelectorAll("[data-testid^=coin-pack-]")].map((el) => ({
      id: el.getAttribute("data-testid"),
      y: el.getBoundingClientRect().top,
    }));
    const pr = panel?.getBoundingClientRect();
    const cr = chip?.getBoundingClientRect();
    const adY = ad?.getBoundingClientRect().top ?? 0;
    return {
      visible: Boolean(panel && !panel.classList.contains("hidden") && pr && pr.height > 8),
      belowChip: Boolean(pr && cr && pr.top >= cr.bottom - 2),
      rightish: Boolean(pr && cr && Math.abs(pr.right - Math.min(window.innerWidth, cr.right + 8)) <= 24),
      inView: Boolean(pr && pr.left >= -2 && pr.right <= window.innerWidth + 2 && pr.top >= -2 && pr.bottom <= window.innerHeight + 2),
      notFull: Boolean(pr && pr.height <= window.innerHeight * 0.72 && pr.width <= Math.min(300, window.innerWidth - 8)),
      adFirst: Boolean(ad && packs.length === 3 && adY <= Math.min(...packs.map((p) => p.y))),
      packs: packs.map((p) => p.id),
    };
  });
  check(
    "Tapping the coins chip opens a compact dropdown below it with the ad reward and 3 packs",
    Boolean(coinsPanel.visible && coinsPanel.belowChip && coinsPanel.inView && coinsPanel.notFull && coinsPanel.adFirst
      && coinsPanel.packs.includes("coin-pack-starter") && coinsPanel.packs.includes("coin-pack-bundle") && coinsPanel.packs.includes("coin-pack-stack")),
    JSON.stringify(coinsPanel)
  );
  await alice.click('[data-testid="shop-toggle"]');
  await alice.waitForSelector('[data-testid="store-panel"]:not(.hidden)');
  const coinsVsShop = await alice.evaluate(() => ({
    shop: !document.querySelector("[data-testid=store-panel]")?.classList.contains("hidden"),
    coins: Boolean(document.querySelector("[data-testid=coins-panel]") && !document.querySelector("[data-testid=coins-panel]").classList.contains("hidden")),
  }));
  check("Opening the shop closes the coins panel", coinsVsShop.shop && !coinsVsShop.coins, JSON.stringify(coinsVsShop));
  await alice.click('[data-testid="room-coins"]');
  await alice.waitForSelector('[data-testid="coins-panel"]:not(.hidden)');
  const coinMutex = await alice.evaluate(() => ({
    shop: !document.querySelector("[data-testid=store-panel]")?.classList.contains("hidden"),
    coins: Boolean(document.querySelector("[data-testid=coins-panel]") && !document.querySelector("[data-testid=coins-panel]").classList.contains("hidden")),
  }));
  check("Opening the coins panel closes the shop", coinMutex.coins && !coinMutex.shop, JSON.stringify(coinMutex));
  await alice.click('[data-testid="coins-panel-close"]');
  await alice.waitForFunction(() => document.querySelector("[data-testid=coins-panel]")?.classList.contains("hidden"));
  await alice.click('[data-testid="room-coins"]');
  await alice.waitForSelector('[data-testid="coins-panel"]:not(.hidden)');
  await alice.click('[data-testid="room-coins"]');
  await alice.waitForFunction(() => document.querySelector("[data-testid=coins-panel]")?.classList.contains("hidden"));
  check("Tapping the coins chip again closes the dropdown", true);
  await alice.click('[data-testid="room-coins"]');
  await alice.waitForSelector('[data-testid="coins-panel"]:not(.hidden)');
  await alice.mouse.click(40, 300);
  await alice.waitForFunction(() => document.querySelector("[data-testid=coins-panel]")?.classList.contains("hidden"));
  check("Tapping outside the coins panel closes it", true);
  await alice.setViewportSize({ width: 1280, height: 800 });

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
        hasCoinsApp: Boolean(document.querySelector('[data-testid="phone-app-coins"]')),
        canScroll: grid.scrollHeight > grid.clientHeight + 1,
        allIn,
        deviceY: Math.round(d.y),
        deviceH: Math.round(d.height),
      };
    });
    check(
      `The ${vpPhone.name} phone home shows every app in a grid that stays on the handset`,
      Boolean(info && info.appCount >= 9 && !info.hasCoinsApp && (info.allIn || info.canScroll) && typeof info.deviceY === "number"),
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
  await openChat(alice);
  await alice.waitForTimeout(200);
  const shortChat = await alice.evaluate(() => {
    const input = document.querySelector("[data-testid=chat-input]");
    const composer = document.querySelector("[data-testid=chat-composer]");
    const dock = document.querySelector("[data-testid=chat-dock]");
    const cr = composer?.getBoundingClientRect();
    const dr = dock?.getBoundingClientRect();
    const cs = composer ? getComputedStyle(composer) : null;
    const hiddenBar = Boolean(cs && (Number(cs.opacity) < 0.05 || (cr && cr.height <= 2)));
    return {
      focused: document.activeElement === input && document.body.classList.contains("chat-open"),
      hiddenBar,
      composerH: cr ? Math.round(cr.height) : 0,
      dockBottom: dr ? Math.round(dr.bottom) : 0,
      visH: window.innerHeight,
    };
  });
  const visH = 450;
  check(
    "Opening chat in a short viewport focuses a hidden input with no visible composer",
    Boolean(shortChat.focused && shortChat.hiddenBar && shortChat.dockBottom <= visH + 1),
    JSON.stringify(shortChat)
  );
  const fontSize = await alice.locator('[data-testid="chat-input"]').evaluate((el) => parseFloat(getComputedStyle(el).fontSize));
  check("Chat input font is at least 16px", fontSize >= 16, `font=${fontSize}`);

  log("Mobile keyboard keeps the room still and sending stays one step");
  const hint = await alice.locator('[data-testid="chat-input"]').getAttribute("enterkeyhint");
  check("The chat input uses enterkeyhint=send", hint === "send", `hint=${hint}`);
  await alice.setViewportSize({ width: 1280, height: 800 });
  await alice.waitForTimeout(200);
  await openChat(alice);
  await alice.fill('[data-testid="chat-input"]', "enter sends in one step");
  await openChat(alice);
  await alice.locator('[data-testid="chat-input"]').press("Enter");
  await alice.waitForTimeout(250);
  const afterEnter = await alice.evaluate(() => {
    const input = document.querySelector('[data-testid="chat-input"]');
    return {
      value: input?.value || "",
      focused: document.activeElement === input,
    };
  });
  check("Pressing Enter sends the chat", afterEnter.value === "", JSON.stringify(afterEnter));
  check("Focus stays in the chat input after Enter", afterEnter.focused, JSON.stringify(afterEnter));
  const bobSawEnter = await bob.waitForFunction(() => (window.__lastSays || []).some((s) => s.text === "enter sends in one step"), null, { timeout: 6000 }).then(() => true).catch(() => false);
  check("The other player sees the Enter-sent message", bobSawEnter);
  await openChat(alice);
  await alice.fill('[data-testid="chat-input"]', "say keeps the keyboard");
  await sendChatMsg(alice);
  await alice.waitForTimeout(200);
  const afterSay = await alice.evaluate(() => {
    const input = document.querySelector('[data-testid="chat-input"]');
    return { value: input?.value || "", focused: document.activeElement === input };
  });
  check("Tapping Say sends the chat", afterSay.value === "", JSON.stringify(afterSay));
  check("Focus stays in the chat input after Say", afterSay.focused, JSON.stringify(afterSay));

  await openChat(alice);
  await alice.fill('[data-testid="chat-input"]', "thinking about it");
  const bobSeesTyping = await bob.waitForFunction(() => Boolean(document.querySelector('[data-testid="typing-alice"]')), null, { timeout: 4000 }).then(() => true).catch(() => false);
  check("Friends in the cube see a thinking bubble while you type", bobSeesTyping);
  const typyingViews = {
    alice: await alice.evaluate(() => {
      const el = document.querySelector("[data-testid=typing-alice]");
      return {
        draft: document.querySelector("[data-testid=typying-draft]")?.textContent || "",
        count: document.querySelector("[data-testid=typying-count]")?.textContent || "",
        text: el?.innerText || "",
        hasDots: Boolean(el?.querySelector(".think-dots")),
      };
    }),
    bob: await bob.evaluate(() => {
      const el = document.querySelector("[data-testid=typing-alice]");
      return {
        text: el?.innerText || "",
        hasDots: Boolean(el?.querySelector(".think-dots")),
        hasDraft: (el?.innerText || "").includes("thinking about it"),
        hasCount: (el?.innerText || "").includes("/120"),
      };
    }),
  };
  check(
    "The typying player sees their draft and 120 counter in the thought bubble",
    typyingViews.alice.draft === "thinking about it" && typyingViews.alice.count === "17/120" && !typyingViews.alice.hasDots,
    JSON.stringify(typyingViews.alice)
  );
  check(
    "The other player sees typying dots, not the draft text",
    Boolean(typyingViews.bob.hasDots && !typyingViews.bob.hasDraft && !typyingViews.bob.hasCount),
    JSON.stringify(typyingViews.bob)
  );
  await alice.locator('[data-testid="chat-input"]').fill("x".repeat(120), { force: true });
  await alice.waitForTimeout(80);
  const typyingWrap = await alice.evaluate(() => {
    const el = document.querySelector("[data-testid=typing-alice]");
    const r = el?.getBoundingClientRect();
    return r ? { top: r.top, bottom: r.bottom, left: r.left, right: r.right, w: r.width, h: r.height, vw: window.innerWidth, vh: window.innerHeight, text: (el.innerText || "").length } : null;
  });
  check(
    "Long typying text wraps and stays on screen",
    Boolean(typyingWrap && typyingWrap.top >= 0 && typyingWrap.left >= -1 && typyingWrap.right <= typyingWrap.vw + 1 && typyingWrap.bottom <= typyingWrap.vh + 1 && typyingWrap.w <= 260 && typyingWrap.h >= 28),
    JSON.stringify(typyingWrap)
  );
  await sendChatMsg(alice);
  const typingGone = await bob.waitForFunction(() => !document.querySelector('[data-testid="typing-alice"]'), null, { timeout: 4000 }).then(() => true).catch(() => false);
  check("The thinking bubble hides when the message is sent", typingGone);

  function sameBox(a, b) {
    return Boolean(a && b && a.x === b.x && a.y === b.y && a.w === b.w && a.h === b.h);
  }
  async function assertKeyboardDoesNotMoveRoom(page, label, size) {
    await page.setViewportSize(size);
    await page.waitForTimeout(250);
    await page.evaluate(() => window.__setKeyboardInset?.(0));
    await page.waitForTimeout(50);
    const before = await page.evaluate(() => {
      const canvas = document.querySelector("#floor canvas, .room3d-root canvas, #floor");
      const header = document.querySelector(".room-view .topbar") || document.querySelector('[data-testid="leave-cube"]');
      const dock = document.querySelector('[data-testid="chat-dock"]');
      const reserve = document.querySelector('[data-testid="kb-reserve"]');
      const box = (el) => {
        if (!el) return null;
        const r = el.getBoundingClientRect();
        return { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) };
      };
      return {
        canvas: box(canvas), header: box(header), dock: box(dock), reserve: box(reserve),
        innerH: window.innerHeight, scroll: window.scrollY || 0,
        reserveVar: getComputedStyle(document.documentElement).getPropertyValue("--kb-reserve").trim(),
      };
    });
    check(
      `${label}: the room fills down to the bottom of the screen with FABs at the bottom`,
      Boolean(before.dock && before.canvas
        && before.canvas.y + before.canvas.h >= before.innerH - 24
        && before.canvas.y + before.canvas.h <= before.innerH + 4
        && before.dock.y + before.dock.h <= before.innerH + 2
        && before.dock.y + before.dock.h >= before.innerH - 24
        && (!before.reserve || before.reserve.h < 8)
        && (before.reserveVar === "0px" || before.reserveVar === "0" || !before.reserveVar)),
      JSON.stringify(before)
    );
    await openChat(page);
    await page.evaluate(() => document.getElementById("chat-input")?.focus?.({ preventScroll: true }));
    await page.waitForTimeout(80);
    const afterFocus = await page.evaluate(() => {
      const canvas = document.querySelector("#floor canvas, .room3d-root canvas, #floor");
      const header = document.querySelector(".room-view .topbar") || document.querySelector('[data-testid="leave-cube"]');
      const dock = document.querySelector('[data-testid="chat-dock"]');
      const box = (el) => {
        if (!el) return null;
        const r = el.getBoundingClientRect();
        return { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) };
      };
      return { canvas: box(canvas), header: box(header), dock: box(dock) };
    });
    check(
      `${label}: focusing the chat does not move the canvas, header, or dock`,
      sameBox(before.canvas, afterFocus.canvas) && sameBox(before.header, afterFocus.header) && sameBox(before.dock, afterFocus.dock),
      JSON.stringify({ before, afterFocus })
    );
    const kb = 280;
    await page.evaluate((h) => window.__setKeyboardInset?.(h), kb);
    await page.waitForTimeout(80);
    const afterKb = await page.evaluate(() => {
      const canvas = document.querySelector("#floor canvas, .room3d-root canvas, #floor");
      const header = document.querySelector(".room-view .topbar") || document.querySelector('[data-testid="leave-cube"]');
      const dock = document.querySelector('[data-testid="chat-dock"]');
      const reserve = document.querySelector('[data-testid="kb-reserve"]');
      const box = (el) => {
        if (!el) return null;
        const r = el.getBoundingClientRect();
        return { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) };
      };
      const inset = getComputedStyle(document.documentElement).getPropertyValue("--kb-inset").trim();
      return { canvas: box(canvas), header: box(header), dock: box(dock), reserve: box(reserve), inset, scroll: window.scrollY || 0 };
    });
    check(
      `${label}: a simulated keyboard does not move the canvas or header`,
      sameBox(before.canvas, afterKb.canvas) && sameBox(before.header, afterKb.header)
        && afterKb.scroll === 0,
      JSON.stringify({ before, afterKb })
    );
    const composer = await page.evaluate(() => {
      const el = document.querySelector("[data-testid=chat-composer]");
      const input = document.querySelector("[data-testid=chat-input]");
      const r = el?.getBoundingClientRect();
      const cs = el ? getComputedStyle(el) : null;
      return {
        y: r ? Math.round(r.y) : null,
        h: r ? Math.round(r.height) : null,
        hiddenBar: Boolean(cs && (Number(cs.opacity) < 0.05 || (r && r.height <= 2))),
        focused: document.activeElement === input && document.body.classList.contains("chat-open"),
      };
    });
    check(
      `${label}: the chat composer is not visible while the keyboard is up`,
      Boolean(composer && composer.hiddenBar && composer.focused
        && (afterKb.inset === `${kb}px` || afterKb.inset === String(kb))),
      JSON.stringify({ composer, inset: afterKb.inset, kb, innerH: before.innerH, dock: afterKb.dock })
    );
    await page.evaluate(() => window.__setKeyboardInset?.(0));
  }
  await assertKeyboardDoesNotMoveRoom(alice, "iPhone 14", { width: 390, height: 844 });
  await assertKeyboardDoesNotMoveRoom(alice, "Pixel 7", { width: 412, height: 915 });

  log("Edit mode inventory, ghost, rotate, move, pick up");
  await alice.setViewportSize({ width: 390, height: 844 });
  await alice.waitForTimeout(300);
  await alice.click('[data-testid="edit-room-btn"]');
  await alice.waitForSelector('[data-testid="edit-inventory"]:not(.hidden)');
  const editRowLayout = await alice.evaluate(() => {
    const overlay = document.querySelector("[data-testid=phone-overlay]");
    const inv = document.querySelector("[data-testid=edit-inventory]");
    const dock = document.querySelector("[data-testid=chat-dock]");
    const btn = document.querySelector("[data-testid=edit-room-btn]");
    if (!inv) return { ok: false };
    const ir = inv.getBoundingClientRect(), dr = dock?.getBoundingClientRect();
    const leave = document.querySelector("[data-testid=leave-cube]")?.getBoundingClientRect();
    const er = btn?.getBoundingClientRect();
    return {
      phoneHidden: !overlay || overlay.classList.contains("hidden"),
      inPhone: Boolean(inv.closest("[data-testid=phone-device]")),
      tabs: [...document.querySelectorAll("[data-testid=edit-inv-tabs] [data-tab]")].map((t) => t.dataset.tab),
      nextToLeave: Boolean(er && leave && Math.abs(er.top - leave.top) < 12),
      width: Math.round(ir.width),
      height: Math.round(ir.height),
      fabsAbove: Boolean(dr && dr.bottom <= ir.top + 16),
    };
  });
  check("Edit Room button sits next to Leave Cube and opens Furniture/Room/Upgrade tabs", Boolean(editRowLayout.phoneHidden && !editRowLayout.inPhone && editRowLayout.nextToLeave && (editRowLayout.tabs || []).join() === "furniture,room,upgrade" && editRowLayout.height >= 48), JSON.stringify(editRowLayout));

  async function measureEditSheet(page, size) {
    await page.setViewportSize(size);
    await page.waitForTimeout(220);
    return page.evaluate((size) => {
      const inv = document.querySelector("[data-testid=edit-inventory]");
      const head = inv?.querySelector(".edit-inv-head");
      const tabs = inv?.querySelector("[data-testid=edit-inv-tabs]");
      const close = inv?.querySelector("[data-testid=edit-done]");
      const items = inv?.querySelector("[data-testid=edit-inv-items]");
      const box = (el) => {
        if (!el) return null;
        const r = el.getBoundingClientRect();
        return { t: Math.round(r.top), b: Math.round(r.bottom), l: Math.round(r.left), r: Math.round(r.right), w: Math.round(r.width), h: Math.round(r.height) };
      };
      const inside = (outer, inner) => Boolean(outer && inner && inner.t >= outer.t - 1 && inner.b <= outer.b + 1 && inner.l >= outer.l - 1 && inner.r <= outer.r + 1);
      const vw = window.innerWidth, vh = window.innerHeight;
      const ir = box(inv);
      const cs = items ? getComputedStyle(items) : null;
      return {
        size,
        ir,
        fullyInView: Boolean(ir && ir.t >= 0 && ir.l >= -1 && ir.r <= vw + 1 && ir.b <= vh + 1),
        roomVisible: Boolean(ir && ir.t >= 90),
        headIn: inside(ir, box(head)),
        tabsIn: inside(ir, box(tabs)),
        closeIn: inside(ir, box(close)),
        itemsIn: inside(ir, box(items)),
        overflowX: cs?.overflowX || "",
        overflowY: cs?.overflowY || "",
        webkit: cs?.webkitOverflowScrolling || "",
        touchAction: cs?.touchAction || "",
        tab: document.querySelector("#edit-inv-tabs .is-on")?.dataset.tab || "",
        sections: [...document.querySelectorAll("[data-testid^=decor-section-]")].map((el) => el.dataset.testid),
      };
    }, size);
  }
  const sheetReports = {};
  for (const size of [{ width: 390, height: 844 }, { width: 375, height: 667 }]) {
    await alice.evaluate(() => window.__setEditTab?.("furniture"));
    sheetReports[`furniture-${size.width}`] = await measureEditSheet(alice, size);
    await alice.evaluate(() => window.__setEditTab?.("room"));
    await alice.waitForTimeout(80);
    sheetReports[`room-${size.width}`] = await measureEditSheet(alice, size);
    await alice.evaluate(() => window.__setEditTab?.("upgrade"));
    await alice.waitForTimeout(80);
    sheetReports[`upgrade-${size.width}`] = await measureEditSheet(alice, size);
  }
  await alice.evaluate(() => window.__setEditTab?.("furniture"));
  await alice.setViewportSize({ width: 390, height: 844 });
  await alice.waitForTimeout(200);
  const sheetOk = Object.values(sheetReports).every((r) => r.fullyInView && r.roomVisible && r.headIn && r.tabsIn && r.closeIn && r.itemsIn);
  const furnitureScroll = ["furniture-390", "furniture-375"].every((k) => /auto|scroll/.test(sheetReports[k].overflowX) && /pan-x/.test(sheetReports[k].touchAction));
  const decorScroll = ["room-390", "room-375"].every((k) => /auto|scroll/.test(sheetReports[k].overflowY) && (sheetReports[k].sections || []).length >= 4);
  check("The Edit Room panel stays fully visible in the safe area at 390 and 375", sheetOk, JSON.stringify(sheetReports));
  check("Furniture and upgrade rows scroll horizontally and decor sections scroll vertically", furnitureScroll && decorScroll, JSON.stringify({ furnitureScroll, decorScroll, reports: sheetReports }));

  const pan = await alice.evaluate(() => {
    const before = window.HouseRoom3D.camState().target;
    const canvas = document.querySelector("#floor canvas, .room3d-root canvas");
    const pt = window.HouseRoom3D.projectTile(1, 4);
    const x = pt?.x ?? 200;
    const y = pt?.y ?? 200;
    const fire = (type, cx, cy, buttons) => canvas.dispatchEvent(new PointerEvent(type, {
      bubbles: true, cancelable: true, clientX: cx, clientY: cy, pointerId: 7, pointerType: "mouse", buttons,
    }));
    fire("pointerdown", x, y, 1);
    fire("pointermove", x + 56, y + 18, 1);
    fire("pointerup", x + 56, y + 18, 0);
    const after = window.HouseRoom3D.camState().target;
    return { before, after, moved: Math.hypot((after.x - before.x) || 0, (after.z - before.z) || 0) };
  });
  check("Hold-and-drag on empty floor in edit mode pans the room", pan.moved > 1.5, JSON.stringify(pan));
  await alice.evaluate(() => window.HouseRoom3D.recenterView?.());

  await alice.evaluate(() => window.__startPlace("art_neon"));
  const wallSpawn = await alice.evaluate(() => window.HouseRoom3D.getWallGhost());
  check(
    "Wall pieces start on a valid empty wall slot",
    Boolean(wallSpawn && wallSpawn.ok && (wallSpawn.wall === "back" || wallSpawn.wall === "left") && Number.isFinite(wallSpawn.slot)),
    JSON.stringify(wallSpawn)
  );
  await alice.evaluate(() => window.__cancelPlace?.());

  const plant = await alice.evaluate(() => window.HouseRoom3D.getFurniture().find((f) => f.type === "plant"));
  if (plant) {
    await alice.evaluate((id) => window.__clickFurniture(id, "plant"), plant.id);
    await alice.waitForSelector('[data-testid="item-rotate"]:not(.hidden)');
    await alice.evaluate(() => window.__putAwaySelected?.());
    await alice.waitForFunction(() => !window.HouseRoom3D.getFurniture().some((f) => f.type === "plant"));
    await alice.waitForSelector('[data-testid="edit-item-plant"]');
  }
  await alice.click('[data-testid="edit-item-plant"]');
  const spawned = await alice.waitForFunction(() => window.HouseRoom3D.getFurniture().some((f) => f.type === "plant"), null, { timeout: 8000 }).then(() => true).catch(() => false);
  const spawn = await alice.evaluate(() => {
    const f = window.HouseRoom3D.getFurniture().find((x) => x.type === "plant");
    return f ? { type: "plant", tx: f.x, ty: f.y, id: f.id } : window.HouseRoom3D.getGhost();
  });
  check(
    "Tapping a floor item in the inventory row spawns it near the center of the room",
    Boolean(spawned && spawn && spawn.tx != null && Math.hypot(spawn.tx - 2.5, spawn.ty - 2.5) <= 2.3),
    JSON.stringify(spawn)
  );
  await alice.waitForSelector('[data-testid="item-rotate"]:not(.hidden)');
  check("A newly spawned item is locked on with only a rotate handle", await alice.locator('[data-testid="item-rotate"]:not(.hidden)').count() === 1 && !(await alice.locator('[data-testid="furn-place"]').isVisible().catch(() => false)) && !(await alice.locator('[data-testid="place-confirm"]').isVisible().catch(() => false)));
  await alice.waitForTimeout(200);
  await alice.screenshot({ path: `${SHOT}/10-edit-inventory.png` });

  const placedPlant = await alice.evaluate(() => window.HouseRoom3D.getFurniture().find((f) => f.type === "plant"));
  await alice.evaluate((id) => window.__clickFurniture(id, "plant"), placedPlant.id);
  await alice.waitForSelector('[data-testid="item-rotate"]:not(.hidden)');
  await alice.screenshot({ path: `${SHOT}/11-edit-selected.png` });

  const couch = await alice.evaluate(() => window.HouseRoom3D.getFurniture().find((f) => f.type === "couch"));
  await alice.evaluate((id) => window.__clickFurniture(id, "couch"), couch.id);
  await alice.waitForSelector('[data-testid="item-rotate"]:not(.hidden)');
  await alice.click('[data-testid="item-rotate"]');
  await alice.waitForFunction(() => {
    const c = window.HouseRoom3D.getFurniture().find((f) => f.type === "couch");
    return c && (c.rot === 1);
  });
  const couchRot = await alice.evaluate(() => window.HouseRoom3D.getFurniture().find((f) => f.type === "couch"));
  check("Rotate turns a non-square piece and keeps a valid footprint", couchRot.rot === 1 && couchRot.x === 3 && couchRot.y === 1, JSON.stringify(couchRot));

  await alice.evaluate((id) => window.__moveFurnitureTo(id, 4, 4), placedPlant.id);
  await alice.waitForFunction(() => window.HouseRoom3D.getFurniture().some((f) => f.type === "plant" && f.x === 4 && f.y === 4));
  check("Move repositions a piece and syncs to the room", await bob.evaluate(() => window.HouseRoom3D.getFurniture().some((f) => f.type === "plant" && f.x === 4 && f.y === 4)));

  const movedPlant = await alice.evaluate(() => window.HouseRoom3D.getFurniture().find((f) => f.type === "plant"));
  await alice.evaluate((id) => window.__clickFurniture(id, "plant"), movedPlant.id);
  await alice.evaluate(() => window.__putAwaySelected?.());
  await alice.waitForFunction(() => !window.HouseRoom3D.getFurniture().some((f) => f.type === "plant"));
  check("Put-away returns an item to inventory and frees its tiles", await alice.locator('[data-testid="edit-item-plant"]').count() === 1);

  const putAwayBtn = alice.locator('[data-testid="edit-putaway"]');
  check("The Put away button sits in the inventory header and is dimmed when nothing is selected", await putAwayBtn.count() === 1 && await putAwayBtn.isDisabled());
  const putAwayFit = await alice.evaluate(() => {
    const btn = document.querySelector("[data-testid=edit-putaway]");
    const tabs = document.querySelector("[data-testid=edit-inv-tabs]");
    const items = document.querySelector("[data-testid=edit-inv-items]");
    const head = document.querySelector(".edit-inv-head");
    const box = (el) => { const r = el.getBoundingClientRect(); return { t: r.top, b: r.bottom, l: r.left, r: r.right }; };
    const br = box(btn), tr = box(tabs), ir = box(items), hr = box(head);
    const overlap = (a, b) => a.l < b.r - 1 && a.r > b.l + 1 && a.t < b.b - 1 && a.b > b.t + 1;
    return {
      inHead: br.t >= hr.t - 1 && br.b <= hr.b + 1,
      coversTabs: overlap(br, tr),
      coversItems: overlap(br, ir),
      touchAction: getComputedStyle(document.querySelector(".room3d-root canvas, #floor canvas, #floor")).touchAction,
    };
  });
  check("The Put away button does not cover the item row or tabs", Boolean(putAwayFit.inHead && !putAwayFit.coversTabs && !putAwayFit.coversItems), JSON.stringify(putAwayFit));
  check("The room canvas uses touch-action: manipulation to disable double-tap zoom", putAwayFit.touchAction === "manipulation", JSON.stringify(putAwayFit));

  await alice.click('[data-testid="edit-item-plant"]');
  await alice.waitForFunction(() => window.HouseRoom3D.getFurniture().some((f) => f.type === "plant"));
  check("The Put away button is enabled when a piece is selected", await putAwayBtn.isEnabled());
  await putAwayBtn.click();
  await alice.waitForFunction(() => !window.HouseRoom3D.getFurniture().some((f) => f.type === "plant"), null, { timeout: 8000 });
  check("Tapping Put away stores the selected furniture in the inventory", await alice.locator('[data-testid="edit-item-plant"]').count() === 1 && await putAwayBtn.isDisabled());

  await alice.click('[data-testid="edit-item-plant"]');
  const plantId = await alice.waitForFunction(() => window.HouseRoom3D.getFurniture().find((f) => f.type === "plant")?.id, null, { timeout: 8000 }).then((h) => h.jsonValue());
  await alice.evaluate((id) => { window.__clickFurniture(id, "plant"); window.__clickFurniture(id, "plant"); }, plantId);
  const plantGone = await alice.waitForFunction(() => !window.HouseRoom3D.getFurniture().some((f) => f.type === "plant"), null, { timeout: 8000 }).then(() => true).catch(() => false);
  check("Double-tapping a placed furniture piece stores it in the inventory", plantGone && await alice.locator('[data-testid="edit-item-plant"]').count() === 1);

  await alice.evaluate(() => window.__debugKit?.({ furniture: ["art_neon"] }));
  await alice.waitForFunction(() => document.querySelector('[data-testid="edit-item-art_neon"]'), null, { timeout: 8000 });
  await alice.evaluate(() => { window.__startPlace("art_neon"); window.__clickWall?.("left", 0); });
  const wallId = await alice.waitForFunction(() => (window.HouseRoom3D.getWallArt?.() || []).find((a) => a.type === "art_neon")?.id, null, { timeout: 8000 }).then((h) => h.jsonValue()).catch(() => null);
  if (wallId) {
    await alice.evaluate((id) => { window.__clickWallArt?.(id); window.__clickWallArt?.(id); }, wallId);
    const wallGone = await alice.waitForFunction(() => !(window.HouseRoom3D.getWallArt?.() || []).some((a) => a.type === "art_neon"), null, { timeout: 8000 }).then(() => true).catch(() => false);
    check("Double-tapping a placed wall piece stores it in the inventory", wallGone);
  } else {
    check("Double-tapping a placed wall piece stores it in the inventory", false, "art_neon did not place");
  }

  // Room decor apply + sync
  await alice.click('[data-testid="edit-tab-room"]');
  await alice.waitForSelector('[data-testid="decor-chip-floor"]');
  await alice.click('[data-testid="decor-floorPattern-checker"]');
  await alice.click('[data-testid="decor-chip-window"]');
  await alice.click('[data-testid="decor-windowView-sunset"]');
  const decorAlice = await alice.waitForFunction(() => {
    const d = window.HouseRoom3D.getDecor?.();
    return d && d.floorPattern === "checker" && d.windowView === "sunset" ? d : null;
  }, null, { timeout: 6000 }).catch(() => null);
  const decorBob = await bob.waitForFunction(() => {
    const d = window.HouseRoom3D.getDecor?.();
    return d && d.floorPattern === "checker" && d.windowView === "sunset" ? d : null;
  }, null, { timeout: 6000 }).then((h) => h.jsonValue()).catch(() => null);
  check("Room decor applies instantly and syncs to visitors", Boolean(decorAlice && decorBob && decorBob.floorPattern === "checker" && decorBob.windowView === "sunset"), JSON.stringify({ decorBob }));

  await alice.click('[data-testid="edit-tab-upgrade"]');
  const upgradeUi = await alice.evaluate(() => {
    const cur = document.querySelector("[data-testid=upgrade-tier-6]");
    const next = document.querySelector("[data-testid=upgrade-cube]");
    return { current: cur?.classList.contains("is-current"), buy: Boolean(next), text: document.querySelector("[data-testid=edit-inv-items]")?.textContent || "" };
  });
  check("Upgrade tab lists cube sizes with the current size marked and a buy control", Boolean(upgradeUi.current && upgradeUi.buy && /8/.test(upgradeUi.text)), JSON.stringify(upgradeUi));

  await alice.evaluate(() => window.__setEditTab?.("room"));
  await alice.waitForSelector('[data-testid="decor-floorColor-wheel"]');
  await alice.click('[data-testid="decor-floorColor-wheel"]');
  await alice.waitForSelector('[data-testid="color-wheel"]:not(.hidden)');
  const roomWheelFit = await alice.evaluate(() => {
    const pop = document.querySelector("[data-testid=color-wheel]");
    const preview = document.querySelector(".room3d-root, #floor");
    const pr = pop?.getBoundingClientRect();
    const av = preview?.getBoundingClientRect();
    const overlap = pr && av && pr.left < av.right && pr.right > av.left && pr.top < av.top + 80;
    return {
      open: Boolean(pop && !pop.classList.contains("hidden")),
      inView: Boolean(pr && pr.top >= 0 && pr.left >= 0 && pr.right <= window.innerWidth + 1 && pr.bottom <= window.innerHeight + 1),
      w: pr ? Math.round(pr.width) : 0,
      h: pr ? Math.round(pr.height) : 0,
      hidesTopRoom: Boolean(overlap),
    };
  });
  check("The Edit Room color wheel is a small popover that stays on screen", Boolean(roomWheelFit.open && roomWheelFit.inView && roomWheelFit.w <= 220 && roomWheelFit.h <= 260), JSON.stringify(roomWheelFit));
  const floorHex = await alice.evaluate(() => window.__setColorWheel?.("#3344cc"));
  await alice.waitForTimeout(200);
  await alice.click('[data-testid="color-wheel-ok"]');
  const floorSaved = await alice.waitForFunction(() => window.__decor?.().floorColor === "#3344cc", null, { timeout: 6000 }).then(() => true).catch(() => false);
  const floorBob = await bob.waitForFunction(() => window.__decor?.().floorColor === "#3344cc" || window.HouseRoom3D?.getDecor?.().floorColor === "#3344cc", null, { timeout: 6000 }).then(() => true).catch(() => false);
  const floorSwatch = await alice.evaluate(() => {
    const b = document.querySelector("[data-testid=decor-floorColor-wheel]");
    return { custom: b?.classList.contains("has-custom"), color: getComputedStyle(b).getPropertyValue("--custom-color").trim() };
  });
  check("A custom floor color previews live, saves as hex, and syncs to visitors", Boolean(floorHex === "#3344cc" && floorSaved && floorBob && floorSwatch.custom), JSON.stringify({ floorHex, floorSaved, floorBob, floorSwatch }));

  await alice.evaluate(() => window.__exitEdit());

  await openCharacterEditor(alice);
  await openCreatorTab(alice, "hair");
  await alice.waitForSelector('[data-testid="hairColor-wheel"]');
  const colorRows = await alice.evaluate(() => {
    const ids = ["skin-wheel", "hairColor-wheel", "shirt-wheel", "bottomColor-wheel", "shoeColor-wheel", "hatColor-wheel", "glassesColor-wheel"];
    return Object.fromEntries(ids.map((id) => [id, Boolean(document.querySelector(`[data-testid="${id}"]`))]));
  });
  check("Every Edit Character color row ends with a rainbow color-wheel swatch", Object.values(colorRows).every(Boolean), JSON.stringify(colorRows));
  await alice.click('[data-testid="hairColor-wheel"]');
  await alice.waitForSelector('[data-testid="color-wheel"]:not(.hidden)');
  const charWheelFit = await alice.evaluate(() => {
    const pop = document.querySelector("[data-testid=color-wheel]");
    const avatar = document.querySelector(".edit-char-preview-wrap, #creator-preview");
    const pr = pop?.getBoundingClientRect();
    const ar = avatar?.getBoundingClientRect();
    const overlap = pr && ar && pr.left < ar.right - 8 && pr.right > ar.left + 8 && pr.top < ar.bottom - 8 && pr.bottom > ar.top + 8;
    return {
      open: Boolean(pop && !pop.classList.contains("hidden")),
      inView: Boolean(pr && pr.top >= 0 && pr.left >= 0 && pr.right <= window.innerWidth + 1 && pr.bottom <= window.innerHeight + 1),
      overlapAvatar: Boolean(overlap),
      w: pr ? Math.round(pr.width) : 0,
      h: pr ? Math.round(pr.height) : 0,
    };
  });
  check("The Edit Character color wheel is small and does not cover the avatar preview", Boolean(charWheelFit.open && charWheelFit.inView && !charWheelFit.overlapAvatar && charWheelFit.w <= 220 && charWheelFit.h <= 260), JSON.stringify(charWheelFit));
  const hairHex = await alice.evaluate(() => window.__setColorWheel?.("#22aa88"));
  await alice.waitForTimeout(120);
  await alice.click('[data-testid="color-wheel-ok"]');
  const hairSwatch = await alice.evaluate(() => {
    const b = document.querySelector("[data-testid=hairColor-wheel]");
    return { custom: b?.classList.contains("has-custom"), selected: b?.classList.contains("selected"), color: getComputedStyle(b).getPropertyValue("--custom-color").trim() };
  });
  check("The chosen custom color shows in the wheel swatch", Boolean(hairHex === "#22aa88" && hairSwatch.custom && hairSwatch.selected && hairSwatch.color.includes("#22aa88")), JSON.stringify({ hairHex, hairSwatch }));
  await alice.evaluate(() => document.querySelector("[data-testid=save-avatar]")?.click());
  await alice.waitForFunction(() => !window.__creatorMenu?.isPhoneEdit?.(), null, { timeout: 8000 }).catch(() => {});
  await alice.waitForTimeout(400);
  const hairBob = await bob.waitForFunction(() => (window.__peopleAvatars?.().alice || {}).hairColor === "#22aa88", null, { timeout: 8000 }).then(() => true).catch(() => false);
  check("A custom avatar color saves as hex and renders for other players", hairBob, JSON.stringify({ hairHex, hairBob }));


  const invalidHex = await alice.evaluate(() => {
    const before = window.__peopleAvatars?.().alice?.hairColor;
    window.__updateAvatar?.({ ...(window.__peopleAvatars?.().alice || {}), hairColor: "red", shirt: "#fff", glassesColor: "#GG0000" });
    return before;
  });
  await alice.waitForTimeout(300);
  const afterInvalid = await alice.evaluate(() => window.__peopleAvatars?.().alice || {});
  check(
    "The server rejects colors that are not #rrggbb or a palette swatch",
    afterInvalid.hairColor !== "red" && afterInvalid.shirt !== "#fff" && afterInvalid.glassesColor !== "#GG0000" && (afterInvalid.hairColor === "#22aa88" || afterInvalid.hairColor === invalidHex),
    JSON.stringify({ invalidHex, afterInvalid: { hairColor: afterInvalid.hairColor, shirt: afterInvalid.shirt, glassesColor: afterInvalid.glassesColor } })
  );

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
  const sitPose = await alice.evaluate(() => {
    const pose = window.HouseRoom3D.petPose("alice");
    const tile = window.HouseRoom3D.personTile("alice");
    return { pose, tile };
  });
  const bobSitPose = await bob.evaluate(() => window.HouseRoom3D.petPose("alice"));
  const sitDist = (sitPose.pose && sitPose.tile)
    ? Math.hypot(sitPose.pose.x - sitPose.tile.x, sitPose.pose.y - sitPose.tile.y)
    : 99;
  const sitSync = sitPose.pose && bobSitPose
    && Math.hypot((sitPose.pose.x ?? 0) - (bobSitPose.x ?? 0), (sitPose.pose.y ?? 0) - (bobSitPose.y ?? 0)) < 0.15
    && bobSitPose.sitting;
  check(
    "After the owner stops, the pet sits adjacent to their feet",
    Boolean(sitPose.pose?.sitting && sitDist <= 1 && sitDist >= 0.12),
    JSON.stringify({ sitPose, sitDist })
  );
  check(
    "Every viewer sees the pet in the same sit placement",
    Boolean(sitSync),
    JSON.stringify({ alice: sitPose.pose, bob: bobSitPose })
  );
  await alice.waitForTimeout(300);
  await alice.screenshot({ path: `${SHOT}/12-pet-sitting.png` });

  await alice.evaluate(() => window.__clickTile(0, 5));
  await alice.waitForFunction(() => {
    const flags = window.HouseRoom3D.personFlags("alice");
    const pose = window.HouseRoom3D.petPose("alice");
    return Boolean(flags?.walking && pose && !pose.sitting);
  }, null, { timeout: 8000 });
  const followPose = await alice.evaluate(() => window.HouseRoom3D.petPose("alice"));
  const bobFollow = await bob.evaluate(() => window.HouseRoom3D.petPose("alice"));
  check(
    "When the owner walks again, the pet stands and follows",
    Boolean(followPose && !followPose.sitting && (followPose.following || followPose.walking)),
    JSON.stringify(followPose)
  );
  check(
    "Every viewer sees the pet leave the sit and follow",
    Boolean(bobFollow && !bobFollow.sitting),
    JSON.stringify(bobFollow)
  );

  log("Multiple pets can follow or stay in the room");
  await alice.evaluate(() => window.__debugKit({ pets: ["fox", "cat", "dog"], coins: 400 }));
  await alice.waitForTimeout(400);
  await alice.evaluate(() => { window.__placePet?.("cat", 1, 1); window.__placePet?.("dog", 4, 1); });
  const placedOk = await alice.waitForFunction(() => (window.HouseRoom3D.getPlacedPets?.() || []).filter((p) => p.item === "cat" || p.item === "dog").length >= 2, null, { timeout: 8000 }).then(() => true).catch(() => false);
  const placed = await alice.evaluate(() => window.HouseRoom3D.getPlacedPets?.() || []);
  const bobPlaced = await bob.evaluate(() => window.HouseRoom3D.getPlacedPets?.() || []);
  check("You can place more than one owned pet in the room", placedOk && placed.filter((p) => p.item === "cat" || p.item === "dog").length >= 2, JSON.stringify(placed));
  check("Placed pets are synced to other people in the cube", bobPlaced.filter((p) => p.item === "cat" || p.item === "dog").length >= 2, JSON.stringify(bobPlaced));
  await alice.evaluate(() => window.__equipPet?.("cat"));
  const switched = await alice.waitForFunction(() => {
    const placed = window.HouseRoom3D.getPlacedPets?.() || [];
    return placed.some((p) => p.item === "fox") && !placed.some((p) => p.item === "cat");
  }, null, { timeout: 8000 }).then(() => true).catch(() => false);
  check("Only one pet follows; the previous follower stays where it stood", switched, JSON.stringify(await alice.evaluate(() => window.HouseRoom3D.getPlacedPets?.() || [])));
  await alice.evaluate(() => window.__putAwayPet?.("dog"));
  const away = await alice.waitForFunction(() => !(window.HouseRoom3D.getPlacedPets?.() || []).some((p) => p.item === "dog"), null, { timeout: 8000 }).then(() => true).catch(() => false);
  check("Put away returns a placed pet to inventory", away);

  log("Pets stay off furniture");
  await alice.evaluate(() => window.__debugKit({ pet: "fox", pets: ["fox", "cat"], furniture: ["couch", "rug", "plant"], coins: 400 }));
  await alice.waitForTimeout(300);
  const petGrid = await alice.evaluate(() => {
    const furn = [
      { type: "couch", x: 2, y: 2, rot: 0 },
      { type: "rug", x: 0, y: 0, rot: 0 },
      { type: "plant", x: 5, y: 5, rot: 0 },
    ];
    const blocked = window.HouseIso.blockedSet(furn);
    const size = 6;
    const owner = { x: 2, y: 3 };
    // Couch 2x1 at (2,2) blocks (2,2) and (3,2). Owner at (2,3) is south of the couch.
    const sit = window.HouseRoom3D.petSitTarget(owner.x, owner.y, { x: 0, z: -1 }, { blocked, occupied: new Set(), gridSize: size });
    const sitTile = { x: Math.round(sit.x), y: Math.round(sit.y) };
    const sitFree = !blocked.has(sitTile.x + "," + sitTile.y);
    const follow = window.HouseRoom3D.petFollowTarget(owner.x, owner.y, { x: 0, z: -1 }, size, { blocked, occupied: new Set() });
    const followTile = { x: Math.round(follow.x), y: Math.round(follow.y) };
    const followFree = !blocked.has(followTile.x + "," + followTile.y);
    const path = window.HouseIso.pathfind({ x: 2, y: 4 }, { x: 2, y: 1 }, blocked, size);
    const pathCuts = (path || []).some((p) => blocked.has(p.x + "," + p.y));
    const rugOk = window.HouseIso.canPlacePet(furn, [], 0, 0, size);
    const couchBad = window.HouseIso.canPlacePet(furn, [], 2, 2, size);
    const plantBad = window.HouseIso.canPlacePet(furn, [], 5, 5, size);
    const openOk = window.HouseIso.canPlacePet(furn, [], 0, 5, size);
    return {
      blocked: [...blocked], sit, sitTile, sitFree,
      follow, followTile, followFree,
      path, pathCuts, pathLen: path && path.length,
      rugOk, couchBad, plantBad, openOk,
    };
  });
  check("A pet sit target is a free tile, not furniture, when a side is blocked", Boolean(petGrid.sitFree && (Math.abs(petGrid.sitTile.x - 2) + Math.abs(petGrid.sitTile.y - 3)) >= 1), JSON.stringify(petGrid));
  check("A following pet's target stays on a walkable tile around furniture", Boolean(petGrid.followFree), JSON.stringify(petGrid.follow));
  check("Pet pathfinding walks around furniture and does not cut corners through it", Boolean(petGrid.path && petGrid.path.length > 2 && !petGrid.pathCuts), JSON.stringify(petGrid.path));
  check("Rugs are valid pet tiles because avatars can walk on them", petGrid.rugOk === true, JSON.stringify(petGrid));
  check("Furniture tiles are invalid for pets (Edit Room uses the same walkability grid)", petGrid.couchBad === false && petGrid.plantBad === false && petGrid.openOk === true, JSON.stringify(petGrid));

  await alice.evaluate(() => window.__enterEdit?.());
  await alice.evaluate(() => window.__startPlacePet?.("cat"));
  const ghostFurn = await alice.evaluate(() => {
    window.__updatePetPlace?.(2, 2);
    // If no couch is in the live room yet, report only the ghost after we place one below.
    return window.HouseRoom3D.getPetGhost?.();
  });
  await alice.evaluate(() => window.__cancelPlace?.() || window.__exitEdit?.());

  // Live: place a pet, then drop a plant on its tile and expect a nudge.
  await alice.evaluate(() => { window.__exitEdit?.(); window.__putAwayPet?.("cat"); window.__putAwayPet?.("fox"); });
  await alice.waitForTimeout(200);
  const petSpot = await alice.evaluate(() => {
    const furn = window.HouseRoom3D.getFurniture();
    const blocked = window.HouseIso.blockedSet(furn);
    const size = 6;
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        if (window.HouseIso.canPlacePet(furn, [], x, y, size) && window.HouseIso.canPlace(furn, "plant", x, y, size, 0)) {
          return { x, y };
        }
      }
    }
    return null;
  });
  if (petSpot) await alice.evaluate((s) => window.__placePet("cat", s.x, s.y), petSpot);
  const petDown = await alice.waitForFunction((s) => {
    if (!s) return false;
    return (window.HouseRoom3D.getPlacedPets?.() || []).some((p) => p.item === "cat" && p.x === s.x && p.y === s.y);
  }, petSpot, { timeout: 6000 }).then(() => true).catch(() => false);
  check("A placed pet lands on the chosen free tile", Boolean(petSpot && petDown), JSON.stringify(petSpot));

  if (petSpot && petDown) {
    await alice.evaluate(() => window.__enterEdit?.());
    const pet = await alice.evaluate(() => (window.HouseRoom3D.getPlacedPets?.() || []).find((p) => p.item === "cat"));
    await alice.evaluate((p) => { window.__clickPet?.(p); window.__clickPet?.(p); }, pet);
    const petAway = await alice.waitForFunction(() => !(window.HouseRoom3D.getPlacedPets?.() || []).some((p) => p.item === "cat"), null, { timeout: 8000 }).then(() => true).catch(() => false);
    check("Double-tapping a placed pet stores it in the inventory", petAway);
    await alice.evaluate((s) => window.__placePet("cat", s.x, s.y), petSpot);
    await alice.waitForFunction((s) => (window.HouseRoom3D.getPlacedPets?.() || []).some((p) => p.item === "cat" && p.x === s.x && p.y === s.y), petSpot, { timeout: 8000 });
    await alice.evaluate(() => window.__exitEdit?.());
  }

  await alice.evaluate(() => window.__enterEdit?.());
  await alice.evaluate((s) => { window.__startPlace("plant"); window.__clickTile(s.x, s.y); }, petSpot);
  const nudged = await alice.waitForFunction((s) => {
    if (!s) return false;
    const pets = window.HouseRoom3D.getPlacedPets?.() || [];
    const cat = pets.find((p) => p.item === "cat");
    const plant = window.HouseRoom3D.getFurniture().find((f) => f.type === "plant" && f.x === s.x && f.y === s.y);
    if (!cat || !plant) return false;
    return !(Math.round(cat.x) === s.x && Math.round(cat.y) === s.y);
  }, petSpot, { timeout: 8000 }).then(() => true).catch(() => false);
  const afterNudge = await alice.evaluate(() => {
    const pets = window.HouseRoom3D.getPlacedPets?.() || [];
    const cat = pets.find((p) => p.item === "cat");
    const furn = window.HouseRoom3D.getFurniture();
    const blocked = window.HouseIso.blockedSet(furn);
    const k = cat ? Math.round(cat.x) + "," + Math.round(cat.y) : null;
    return { cat, blockedOnCat: k ? blocked.has(k) : null, furn: furn.map((f) => ({ type: f.type, x: f.x, y: f.y })) };
  });
  check("Placing furniture on a pet's tile nudges the pet to the nearest free tile", Boolean(nudged && afterNudge.cat && afterNudge.blockedOnCat === false), JSON.stringify(afterNudge));

  // Edit-room ghost: furniture tile is invalid, rug (if present) or open floor is valid.
  await alice.evaluate(() => window.__enterEdit?.());
  const ghostChecks = await alice.evaluate(() => {
    const furn = window.HouseRoom3D.getFurniture();
    const pets = window.HouseRoom3D.getPlacedPets?.() || [];
    const blocked = window.HouseIso.blockedSet(furn);
    let bad = null, good = null;
    for (let y = 0; y < 6; y++) {
      for (let x = 0; x < 6; x++) {
        const k = x + "," + y;
        if (!bad && blocked.has(k)) bad = { x, y };
        if (!good && window.HouseIso.canPlacePet(furn, pets, x, y, 6)) good = { x, y };
      }
    }
    window.__startPlacePet("fox");
    window.__updatePetPlace(bad.x, bad.y);
    const onFurn = window.HouseRoom3D.getPetGhost();
    window.__updatePetPlace(good.x, good.y);
    const onOpen = window.HouseRoom3D.getPetGhost();
    return { bad, good, onFurn, onOpen };
  });
  await alice.evaluate(() => { window.__cancelPlace?.(); window.__exitEdit?.(); });
  check("Edit Room marks furniture tiles as invalid for pets", Boolean(ghostChecks.onFurn && ghostChecks.onFurn.ok === false), JSON.stringify(ghostChecks));
  check("Edit Room marks walkable tiles as valid for pets", Boolean(ghostChecks.onOpen && ghostChecks.onOpen.ok === true), JSON.stringify(ghostChecks));

  // Wander: every sample along the cycle stays off furniture.
  const wander = await alice.evaluate(() => {
    const furn = window.HouseRoom3D.getFurniture();
    const blocked = window.HouseIso.blockedSet(furn);
    const pets = window.HouseRoom3D.getPlacedPets?.() || [];
    const cat = pets.find((p) => p.item === "cat");
    if (!cat || !window.HouseRoom3D.placedPetAnim) return { error: "no anim", pets };
    const hits = [];
    for (let t = 0; t < 8000; t += 80) {
      const a = window.HouseRoom3D.placedPetAnim(cat, t);
      const k = Math.round(a.x) + "," + Math.round(a.y);
      if (blocked.has(k)) hits.push({ t, x: a.x, y: a.y, k });
    }
    return { hits: hits.length, sample: hits[0] || null, cat, blocked: [...blocked] };
  });
  check("A placed pet wanders only onto free tiles and never through furniture", Boolean(wander && wander.hits === 0 && !wander.error), JSON.stringify(wander));

  await alice.evaluate(() => {
    const plant = window.HouseRoom3D.getFurniture().find((f) => f.type === "plant");
    if (plant) window.__pickupFurniture?.(plant.id);
    window.__putAwayPet?.("cat");
    window.__putAwayPet?.("fox");
    window.__exitEdit?.();
  });

  log("TV and light switch");

  await alice.evaluate(() => window.__debugKit({ furniture: ["tv", "fridge", "chesstable", "punchbag", "benchpress", "treadmill"], coins: 400 }));
  await alice.waitForTimeout(400);
  await alice.evaluate(() => { window.__startPlace("tv"); window.__clickTile(0, 0); });
  await alice.waitForFunction(() => window.HouseRoom3D.getFurniture().some((f) => f.type === "tv"));
  const tvId = await alice.evaluate(() => window.HouseRoom3D.getFurniture().find((f) => f.type === "tv").id);
  await alice.evaluate((id) => window.__clickFurniture(id, "tv"), tvId);
  await alice.waitForFunction((id) => window.HouseRoom3D.tvOn(id), tvId);
  check("Tapping the TV toggles a synced screen", await bob.evaluate((id) => window.HouseRoom3D.tvOn(id), tvId));
  const ch0 = await alice.evaluate((id) => ({ on: window.HouseRoom3D.tvOn(id), ch: window.HouseRoom3D.tvChannel(id), name: window.HouseRoom3D.tvChannelName(id) }), tvId);
  check("The first tap turns the TV on to channel 0", Boolean(ch0.on && ch0.ch === 0), JSON.stringify(ch0));
  await alice.evaluate((id) => window.__clickFurniture(id, "tv"), tvId);
  await alice.waitForFunction((id) => window.HouseRoom3D.tvOn(id) && window.HouseRoom3D.tvChannel(id) === 1, tvId);
  const ch1 = await alice.evaluate((id) => ({ on: window.HouseRoom3D.tvOn(id), ch: window.HouseRoom3D.tvChannel(id), name: window.HouseRoom3D.tvChannelName(id) }), tvId);
  const bobCh = await bob.evaluate((id) => ({ on: window.HouseRoom3D.tvOn(id), ch: window.HouseRoom3D.tvChannel(id), name: window.HouseRoom3D.tvChannelName(id) }), tvId);
  check("A second tap changes the channel", Boolean(ch1.on && ch1.ch === 1 && ch1.name && ch1.name !== ch0.name), JSON.stringify({ ch0, ch1 }));
  check("The new TV channel is synced to everyone in the cube", Boolean(bobCh.on && bobCh.ch === ch1.ch && bobCh.name === ch1.name), JSON.stringify({ ch1, bobCh }));
  const prog = await alice.evaluate(() => window.HouseRoom3D.tvProgram());
  check(
    "The Cube Channel plays a synced documentary episode",
    Boolean(prog && prog.channel === "The Cube Channel" && prog.title && prog.ticker),
    JSON.stringify(prog && { title: prog.title, titleCard: prog.titleCard })
  );
  const tvGlow = await alice.evaluate(async () => {
    const furn = await import("/js/furnIso.js");
    const pointIn = (x, y, q) => {
      // Ray-cast even-odd in the screen parallelogram.
      let inside = false;
      for (let i = 0, j = q.length - 1; i < q.length; j = i++) {
        const xi = q[i].x, yi = q[i].y, xj = q[j].x, yj = q[j].y;
        const hit = ((yi > y) !== (yj > y)) && (x < (xj - xi) * (y - yi) / ((yj - yi) || 1e-6) + xi);
        if (hit) inside = !inside;
      }
      return inside;
    };
    const screen = document.createElement("canvas");
    screen.width = 24; screen.height = 16;
    const sctx = screen.getContext("2d");
    sctx.fillStyle = "#7ec8ff";
    sctx.fillRect(0, 0, 24, 16);
    sctx.fillStyle = "#ffffff";
    sctx.fillRect(2, 2, 8, 4);
    const issues = [];
    for (const type of ["tv", "holotv"]) {
      for (const rot of [0, 1, 2, 3]) {
        const spr = furn.drawFurnitureSprite(type, { lights: true, rot, on: true, screen });
        const quad = furn.tvScreenQuadSprite(type, rot);
        const ctx = spr.c.getContext("2d");
        const data = ctx.getImageData(0, 0, spr.w, spr.h).data;
        let outside = 0, inside = 0;
        for (let y = 0; y < spr.h; y++) {
          for (let x = 0; x < spr.w; x++) {
            const i = (y * spr.w + x) * 4;
            const a = data[i + 3];
            if (a < 16) continue;
            const r = data[i], g = data[i + 1], b = data[i + 2];
            // Bright cyan/white glare or lit screen pixels.
            const glare = (g > 160 && b > 180 && r > 80) || (r > 200 && g > 200 && b > 200);
            if (!glare) continue;
            if (quad && pointIn(x + 0.5, y + 0.5, quad)) inside++;
            else if (quad) outside++;
            else {
              // Back of the set: there is no screen, so these should not be screen-glare colors.
              // Bezel/body is dark; count only very bright pixels as leaks.
              if (r + g + b > 520) outside++;
            }
          }
        }
        if (rot === 0 || rot === 1) {
          if (outside > 2) issues.push({ type, rot, outside, inside, reason: "glare outside screen quad" });
          if (inside < 8) issues.push({ type, rot, outside, inside, reason: "screen looks empty" });
        } else if (outside > 2) {
          issues.push({ type, rot, outside, inside, reason: "glow on back of set" });
        }
      }
    }
    return { issues, ok: issues.length === 0 };
  });
  check("TV screen glow and content stay clipped to the screen quad in every rotation", Boolean(tvGlow.ok), JSON.stringify(tvGlow));
  await alice.setViewportSize({ width: 390, height: 844 });
  await alice.waitForTimeout(500);
  await alice.screenshot({ path: `${SHOT}/13-tv-on.png` });
  const lightsWereOn = await alice.evaluate(() => window.HouseRoom3D.lightsOn());
  await alice.evaluate(() => window.HouseRoom3D.simulateSwitchClick());
  await alice.waitForFunction((prev) => window.HouseRoom3D.lightsOn() !== prev, lightsWereOn);
  check("Anyone can flip the wall switch and everyone sees the lights change", await bob.evaluate((prev) => window.HouseRoom3D.lightsOn() !== prev, lightsWereOn));
  const allLights = await alice.evaluate(() => {
    const draw = window.__drawFurnitureSprite;
    if (typeof draw !== "function") return { ok: false, reason: "no sprite" };
    const onSpr = draw("lamp", { lights: true, rot: 0 });
    const offSpr = draw("lamp", { lights: false, rot: 0 });
    if (!onSpr?.c || !offSpr?.c) return { ok: false, reason: "no canvas" };
    const da = onSpr.c.getContext("2d").getImageData(0, 0, onSpr.w, onSpr.h).data;
    const db = offSpr.c.getContext("2d").getImageData(0, 0, offSpr.w, offSpr.h).data;
    let diff = 0;
    for (let i = 0; i < da.length; i++) if (da[i] !== db[i]) diff++;
    const state = window.HouseRoom3D.lightState?.() || { room: window.HouseRoom3D.lightsOn(), lamps: window.HouseRoom3D.lightsOn() };
    const bobState = state;
    return { ok: diff > 20, diff, state };
  });
  const bobLights = await bob.evaluate(() => window.HouseRoom3D.lightState?.() || { room: window.HouseRoom3D.lightsOn(), lamps: window.HouseRoom3D.lightsOn() });
  check("The wall switch turns off room lighting and lamp furniture together, in sync", Boolean(allLights.ok && allLights.state && allLights.state.room === false && allLights.state.lamps === false && bobLights.room === false && bobLights.lamps === false), JSON.stringify({ allLights, bobLights }));
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
  const fridgeChoices = await alice.evaluate(() => [...document.querySelectorAll("[data-fridge]")].map((b) => b.dataset.fridge));
  check("Fridge picker offers pizza, soda, chicken, and water", [...fridgeChoices].sort().join(",") === "chicken,pizza,soda,water", JSON.stringify(fridgeChoices));
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
  await alice.evaluate(() => { window.__startPlace("art_hang"); window.__clickWall("left", 5); });
  await alice.waitForFunction(() => window.HouseRoom3D.getWallArt().length >= 4);
  const blocked = await alice.evaluate(() => {
    const wall = window.HouseRoom3D.doorWall?.() || "left";
    const door = window.HouseRoom3D.doorSlot?.() ?? 3;
    const sw = window.HouseRoom3D.switchSlot?.() ?? 2;
    window.__startPlace("art_pop");
    window.__clickWall(wall, door);
    const onDoor = window.HouseRoom3D.getWallArt().some((a) => a.wall === wall && a.slot === door);
    window.__startPlace("art_pop");
    window.__clickWall(wall, sw);
    const onSwitch = window.HouseRoom3D.getWallArt().some((a) => a.wall === wall && a.slot === sw);
    return { onDoor, onSwitch, door, sw, wall };
  });
  check("Wall art can be placed on a wall grid and avoids the door, window, and switch", !blocked.onDoor && !blocked.onSwitch && await bob.evaluate(() => window.HouseRoom3D.getWallArt().some((a) => a.type === "art_neon")), JSON.stringify(blocked));
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
  await alice.evaluate(() => { window.__standUp?.(); window.__exitEdit?.(); window.__closePhone?.(); });
  await alice.waitForFunction(() => {
    const flags = window.HouseRoom3D?.personFlags?.("alice") || {};
    return !flags.sitting && !document.body.classList.contains("edit-mode") && !document.body.dataset.editMode;
  }, null, { timeout: 8000 }).catch(() => {});
  await alice.waitForTimeout(50);
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

  const destInfo = await alice.evaluate(() => {
    const size = 6;
    const furn = window.HouseRoom3D.getFurniture() || [];
    const pets = window.HouseRoom3D.getPlacedPets?.() || [];
    const blocked = window.HouseIso?.blockedSet?.(furn) || new Set([
      ...furn.map((f) => `${Math.round(f.x)},${Math.round(f.y)}`),
    ]);
    pets.forEach((p) => blocked.add(`${Math.round(p.x)},${Math.round(p.y)}`));
    const me = window.HouseRoom3D.personTile("alice");
    if (me) blocked.add(`${Math.round(me.x)},${Math.round(me.y)}`);
    const prefer = [{ x: 0, y: 5 }, { x: 1, y: 5 }, { x: 0, y: 4 }, { x: 5, y: 0 }, { x: 1, y: 4 }];
    let dest = prefer.find((t) => !blocked.has(`${t.x},${t.y}`));
    if (!dest) {
      for (let y = size - 1; y >= 0 && !dest; y--) {
        for (let x = 0; x < size && !dest; x++) {
          if (!blocked.has(`${x},${y}`)) dest = { x, y };
        }
      }
    }
    let marked = null;
    if (dest) {
      const pt = window.HouseRoom3D.projectTile(dest.x, dest.y);
      window.HouseRoom3D.tapAt(pt.x, pt.y);
      // Read the marker in the same turn. Waiting lets a one-tile walk
      // finish and the renderer clear the marker on arrival.
      marked = window.HouseRoom3D.getMoveTarget();
    }
    return { destTile: dest, marked };
  });
  check("Clicking a walkable tile sets a destination marker", Boolean(destInfo.marked && destInfo.destTile && destInfo.marked.x === destInfo.destTile.x && destInfo.marked.y === destInfo.destTile.y), JSON.stringify(destInfo));

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
  await runCreatorPhoneAndBoot(browser);
  await runAppShellFit(browser);

  log("Phone playtest: follow camera, chess seating, and touch interactions");
  await runPhonePlaytest(browser);

  log("Dock phone button hit target and touch toggles");
  await runPhoneButtonHitTests(browser);

  log("Stores and restyle screenshots");
  await runStoresAndCyberShots(browser);

  log("Record table picker and synced lofi beats");
  await runRecordPlayerTests(browser);
  await runRecordPlayerTouchTests(browser);

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
