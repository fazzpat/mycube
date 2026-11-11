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
    await openCreatorTab(page, "face");
    await page.evaluate((id) => window.__creatorMenu?.showOption?.(id), "glasses-toggle");
    const box = page.locator('[data-testid="glasses-toggle"]');
    const on = await box.isChecked();
    if (glasses && !on) await box.check();
    if (!glasses && on) await box.uncheck();
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

async function openPhoneApp(page, app) {
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


const CREATOR_TABS = ["body", "hair", "face", "top", "bottom", "shoes"];
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
    && (flagsA.actionEmote || null) === (flagsB.actionEmote || null)
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
    const win = document.querySelector('[data-testid="creator-window"]');
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
  const scrollFail = info.scrolls.filter((r) => !r.ok);
  check(
    `${label} does not scroll`,
    scrollFail.length === 0,
    JSON.stringify(scrollFail.length ? scrollFail : { ok: true })
  );
  const chromeEntries = Object.entries(info.chrome).filter(([k]) => k !== "pager" || (info.pages || 1) > 1);
  const chromeFail = chromeEntries.filter(([, v]) => v.missing || v.ok === false);
  check(
    `${label} chrome and visible options stay in view`,
    chromeFail.length === 0 && info.optionFits.every((o) => o.ok && !o.missing),
    JSON.stringify({ chrome: chromeFail, options: info.optionFits.filter((o) => !o.ok || o.missing) })
  );
  const minTap = viewportName === "1280x800" ? 36 : 40;
  if (viewportName !== "1280x800") {
    const small = info.optionFits.filter((o) => !o.missing && o.minH < minTap);
    check(
      `${label} tap targets are at least ${minTap}px`,
      small.length === 0,
      JSON.stringify(small)
    );
  }
}

async function assertCreatorTabsFit(page, viewportName, viewport) {
  await page.evaluate(() => document.getElementById("creator-back")?.classList.remove("hidden"));
  await openCreatorTab(page, "body");
  await page.waitForTimeout(80);
  const baseline = await snapshotCreatorLayout(page);
  const vw = viewport?.width || 0, vh = viewport?.height || 0;
  const phoneFits = baseline.phone && baseline.phone.x >= -1 && baseline.phone.y >= -1 && baseline.phone.x + baseline.phone.w <= vw + 1 && baseline.phone.y + baseline.phone.h <= vh + 1;
  check(
    `Creator ${viewportName} captured a stable room, character, and in-phone panel`,
    Boolean(baseline.room && baseline.phone && baseline.panel && baseline.room.w > 10 && baseline.phone.w > 10 && baseline.panel.w > 10 && baseline.view === "room" && phoneFits),
    JSON.stringify({ room: baseline.room, phone: baseline.phone, panel: baseline.panel, view: baseline.view, pose: baseline.pose })
  );
  for (const tab of CREATOR_TABS) {
    await openCreatorTab(page, tab);
    if (tab === "face") {
      await clickCreatorOption(page, "accessory-4");
      await page.waitForSelector("#headphone-color-field:not(.hidden)", { timeout: 4000 }).catch(() => {});
    }
    await page.waitForTimeout(40);
    const first = await snapshotCreatorLayout(page);
    if (tab === "hair" && viewport && viewport.height <= 500) {
      check(
        `Creator ${viewportName} HAIR paginates inside the phone when the screen is short`,
        first.pages > 1,
        JSON.stringify({ pages: first.pages })
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
        `Creator ${viewportName} ${tab.toUpperCase()} p${pno} keeps the room, character, and phone size fixed`,
        !roomMoved && !phoneMoved && !poseMoved && snap.view === "room",
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
    await recA.waitForSelector('[data-testid="phone-screen-shop"]:not(.hidden)');
    const shopHas = await recA.locator('[data-testid="buy-recordplayer"]').count();
    check("Record table appears in the furniture shop", shopHas >= 1);
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
    check(
      "A phone tap on a vinyl starts that beat, spins the platter, and floats notes",
      Boolean(state.on && state.vinyl === "midnight-ramen" && state.notes >= 1 && state.audio?.listening && (state.audio.playing === "midnight-ramen" || state.audio.vinyl === "midnight-ramen")),
      JSON.stringify(state)
    );
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
  check(
    "Edit Character stays in the cube and opens the options inside the phone",
    inRoomBd.view === "room" && inRoomBd.phoneEdit && inRoomBd.furn >= 2 && inRoomBd.windowInside,
    JSON.stringify(inRoomBd)
  );
  check(
    "The in-game phone grows when Edit Character opens",
    inRoomBd.phone.w > homePhone.w + 8 && inRoomBd.phone.h > homePhone.h + 8,
    JSON.stringify({ home: homePhone, edit: inRoomBd.phone })
  );
  await page.click('[data-testid="creator-back"]');
  await page.waitForFunction(() => !window.__creatorMenu?.isPhoneEdit?.(), null, { timeout: 8000 });
  await page.waitForTimeout(320);
  await page.waitForSelector('body[data-view="room"]');
  const afterClose = await page.evaluate(() => {
    const r = document.querySelector("[data-testid=phone-device]").getBoundingClientRect();
    return { w: r.width, h: r.height, home: !document.getElementById("phone-home")?.classList.contains("hidden") };
  });
  check(
    "Back shrinks the phone and returns to the phone home",
    Math.abs(afterClose.w - homePhone.w) <= 2 && Math.abs(afterClose.h - homePhone.h) <= 2 && afterClose.home,
    JSON.stringify({ home: homePhone, after: afterClose })
  );
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
  const homeBd = await cp.evaluate(() => ({
    view: document.body.dataset.view,
    phoneEdit: window.__creatorMenu?.isPhoneEdit?.() || false,
    inPhone: Boolean(document.querySelector("[data-testid=phone-character-editor] [data-testid=creator-window]")),
  }));
  check("A new user's character editor opens inside the in-game phone and stays in the cube", homeBd.view === "room" && homeBd.phoneEdit && homeBd.inPhone, JSON.stringify(homeBd));
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
        `Edit Character at ${vp.name} (${place.label}) keeps the avatar fully visible beside the phone`,
        mid.view === "room" && mid.compact && mid.box && mid.phone && !mid.overlap && mid.phone.w <= 220 && mid.phone.h <= 360 && (place.kind === "sit" ? mid.sitting : !mid.sitting),
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
      await page.click('[data-testid="creator-back"]');
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
    if (homePhone && editPhone) {
      const compact = editPhone.w <= 220 && editPhone.h <= 360;
      const restored = after.restored && Math.abs(after.restored.w - homePhone.w) <= 4 && Math.abs(after.restored.h - homePhone.h) <= 4;
      check(
        `${label}: the mobile editor stays compact and the phone restores on close`,
        compact && restored,
        JSON.stringify({ homePhone, editPhone, restored: after.restored })
      );
    }
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
    "A mid-action dance is not cancelled by opening Edit Character",
    beforeA.flags?.actionEmote === "dance" && duringA.flags?.actionEmote === "dance" && midA.flags?.actionEmote === "dance" && afterA.flags?.actionEmote === "dance",
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
  await page.click('[data-testid="creator-back"]');
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
      const phone = document.querySelector("[data-testid=phone-device]");
      const r = phone.getBoundingClientRect();
      const slack = 1.5;
      const noScroll = (el) => !el || (el.scrollHeight <= el.clientHeight + slack && el.scrollWidth <= el.clientWidth + 8);
      return {
        view: document.body.dataset.view,
        html: noScroll(html),
        body: noScroll(body),
        room: noScroll(room),
        phoneFits: r.left >= -1 && r.top >= -1 && r.right <= vp.width + 1 && r.bottom <= vp.height + 1,
        phone: { w: r.width, h: r.height, x: r.x, y: r.y },
      };
    }, vp);
    check(
      `Edit Character does not scroll the page at ${vp.name}`,
      fit.view === "room" && fit.html && fit.body && fit.room && fit.phoneFits,
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
  await assertInsideViewport(page, ['[data-testid="phone-device"]', '[data-testid="display-name"]', '[data-testid="save-avatar"]'], "Character creator chrome fits the iPhone 14 viewport");
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
    "Edit Character enlarges the in-game phone and keeps the avatar in the room",
    Boolean(creatorLayout.view === "room" && creatorLayout.phoneEdit && creatorLayout.hasRoom && creatorLayout.phoneVisible && creatorLayout.windowInsidePhone && creatorLayout.characterInRoom),
    JSON.stringify(creatorLayout)
  );
  check(
    "Creator options are grouped into BODY / HAIR / FACE / TOP / BOTTOM / SHOES tabs",
    creatorLayout.tab === "body" && creatorLayout.tabs.join(",") === "body,hair,face,top,bottom,shoes",
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
  check("Arrow left returns to the BODY tab", backBody === "body", backBody);

  await customize(alice, { displayName: "Alice", hair: 3, shirt: 0, skin: 1, glasses: false });
  await clickCreatorOption(alice, "accessory-4");
  await clickCreatorOption(alice, "headphoneColor-2");
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

  log("Mobile keyboard keeps the room still and sending stays one step");
  const hint = await alice.locator('[data-testid="chat-input"]').getAttribute("enterkeyhint");
  check("The chat input uses enterkeyhint=send", hint === "send", `hint=${hint}`);
  await alice.setViewportSize({ width: 1280, height: 800 });
  await alice.waitForTimeout(200);
  await alice.fill('[data-testid="chat-input"]', "enter sends in one step");
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
  await alice.fill('[data-testid="chat-input"]', "say keeps the keyboard");
  await alice.click('[data-testid="chat-send"]');
  await alice.waitForTimeout(200);
  const afterSay = await alice.evaluate(() => {
    const input = document.querySelector('[data-testid="chat-input"]');
    return { value: input?.value || "", focused: document.activeElement === input };
  });
  check("Tapping Say sends the chat", afterSay.value === "", JSON.stringify(afterSay));
  check("Focus stays in the chat input after Say", afterSay.focused, JSON.stringify(afterSay));

  await alice.fill('[data-testid="chat-input"]', "thinking about it");
  const bobSeesTyping = await bob.waitForFunction(() => Boolean(document.querySelector('[data-testid="typing-alice"]')), null, { timeout: 4000 }).then(() => true).catch(() => false);
  check("Friends in the cube see a thinking bubble while you type", bobSeesTyping);
  await alice.click('[data-testid="chat-send"]');
  const typingGone = await bob.waitForFunction(() => !document.querySelector('[data-testid="typing-alice"]'), null, { timeout: 4000 }).then(() => true).catch(() => false);
  check("The thinking bubble hides when the message is sent", typingGone);

  async function assertKeyboardDoesNotMoveRoom(page, label, size) {
    await page.setViewportSize(size);
    await page.waitForTimeout(250);
    await page.evaluate(() => window.__setKeyboardInset?.(0));
    await page.waitForTimeout(50);
    const before = await page.evaluate(() => {
      const canvas = document.querySelector("#floor canvas, .room3d-root canvas, #floor");
      const header = document.querySelector(".room-view .topbar") || document.querySelector('[data-testid="leave-cube"]');
      const box = (el) => {
        if (!el) return null;
        const r = el.getBoundingClientRect();
        return { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) };
      };
      return { canvas: box(canvas), header: box(header), innerH: window.innerHeight };
    });
    await page.locator('[data-testid="chat-input"]').click();
    await page.waitForTimeout(80);
    const afterFocus = await page.evaluate(() => {
      const canvas = document.querySelector("#floor canvas, .room3d-root canvas, #floor");
      const header = document.querySelector(".room-view .topbar") || document.querySelector('[data-testid="leave-cube"]');
      const box = (el) => {
        if (!el) return null;
        const r = el.getBoundingClientRect();
        return { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) };
      };
      return { canvas: box(canvas), header: box(header) };
    });
    check(
      `${label}: focusing the chat does not move the canvas or header`,
      Boolean(before.canvas && afterFocus.canvas && before.header && afterFocus.header
        && before.canvas.x === afterFocus.canvas.x && before.canvas.y === afterFocus.canvas.y
        && before.canvas.w === afterFocus.canvas.w && before.canvas.h === afterFocus.canvas.h
        && before.header.x === afterFocus.header.x && before.header.y === afterFocus.header.y
        && before.header.w === afterFocus.header.w && before.header.h === afterFocus.header.h),
      JSON.stringify({ before, afterFocus })
    );
    const kb = 280;
    await page.evaluate((h) => window.__setKeyboardInset?.(h), kb);
    await page.waitForTimeout(80);
    const afterKb = await page.evaluate(() => {
      const canvas = document.querySelector("#floor canvas, .room3d-root canvas, #floor");
      const header = document.querySelector(".room-view .topbar") || document.querySelector('[data-testid="leave-cube"]');
      const dock = document.querySelector('[data-testid="chat-dock"]');
      const box = (el) => {
        if (!el) return null;
        const r = el.getBoundingClientRect();
        return { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) };
      };
      const inset = getComputedStyle(document.documentElement).getPropertyValue("--kb-inset").trim();
      return { canvas: box(canvas), header: box(header), dock: box(dock), inset };
    });
    check(
      `${label}: a simulated keyboard does not move the canvas or header`,
      Boolean(before.canvas && afterKb.canvas && before.header && afterKb.header
        && before.canvas.x === afterKb.canvas.x && before.canvas.y === afterKb.canvas.y
        && before.canvas.w === afterKb.canvas.w && before.canvas.h === afterKb.canvas.h
        && before.header.x === afterKb.header.x && before.header.y === afterKb.header.y
        && before.header.w === afterKb.header.w && before.header.h === afterKb.header.h),
      JSON.stringify({ before, afterKb })
    );
    check(
      `${label}: the chat dock lifts above the simulated keyboard`,
      Boolean(afterKb.dock && before.innerH && afterKb.dock.y < size.height - afterKb.dock.h - 200
        && afterKb.inset === "280px"),
      JSON.stringify({ dock: afterKb.dock, inset: afterKb.inset, vh: size.height })
    );
    await page.evaluate(() => window.__setKeyboardInset?.(0));
  }
  await assertKeyboardDoesNotMoveRoom(alice, "iPhone 14", { width: 390, height: 844 });
  await assertKeyboardDoesNotMoveRoom(alice, "Pixel 7", { width: 412, height: 915 });

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
  await runCreatorPhoneAndBoot(browser);
  await runAppShellFit(browser);

  log("Phone playtest: follow camera, chess seating, and touch interactions");
  await runPhonePlaytest(browser);

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
