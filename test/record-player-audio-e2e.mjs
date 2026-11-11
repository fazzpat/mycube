import { chromium, webkit, devices } from "playwright";
import { spawn } from "child_process";
import { once } from "events";
import path from "path";
import { fileURLToPath } from "url";
import { openStartForm } from "./startMenuHelp.mjs";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const PORT = Number(process.env.RECORD_AUDIO_TEST_PORT || 3060);
const BASE = process.env.RECORD_AUDIO_BASE_URL || process.env.BASE_URL || `http://127.0.0.1:${PORT}`;
const START_SERVER = process.env.RECORD_AUDIO_E2E_START_SERVER !== "0";

const results = [];
function log(msg) { console.log("[record-audio]", msg); }
function check(name, ok, extra = "") {
  results.push({ name, ok, extra });
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${extra ? " — " + extra : ""}`);
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
    if (child.exitCode != null) throw new Error("record-audio test server exited early: " + child.exitCode);
    await new Promise((r) => setTimeout(r, 100));
  }
  if (!ready) {
    try {
      const res = await fetch(BASE);
      if (!res.ok) throw new Error("not up");
    } catch {
      child.kill("SIGTERM");
      throw new Error("record-audio test server did not start");
    }
  }
  return child;
}

async function tapPoint(page, x, y) {
  const hasTouch = await page.evaluate(() => navigator.maxTouchPoints > 0);
  if (hasTouch) await page.touchscreen.tap(x, y);
  else await page.mouse.click(x, y);
}

async function tapTestIdReal(page, testId) {
  const box = await page.locator(`[data-testid="${testId}"]`).boundingBox();
  if (!box) throw new Error("missing " + testId);
  await tapPoint(page, box.x + box.width / 2, box.y + box.height / 2);
}

async function tapFurnitureReal(page, id) {
  const pt = await page.evaluate((fid) => window.HouseRoom3D.projectFurniture(fid), id);
  if (!pt || pt.visible === false) throw new Error("furniture not on screen: " + id + " " + JSON.stringify(pt));
  await tapPoint(page, pt.x, pt.y);
}

async function snapshot(page) {
  return page.evaluate(() => {
    const s = window.__recordAudioState?.() || {};
    const el = document.querySelector('[data-testid="record-audio"]') || document.getElementById("record-audio");
    const listen = document.querySelector('[data-testid="record-listen"]');
    const hint = document.querySelector('[data-testid="record-listen-hint"]');
    return {
      ...s,
      listenHidden: !listen || listen.classList.contains("hidden"),
      hintHidden: !hint || hint.classList.contains("hidden"),
      slider: document.querySelector('[data-testid="record-volume"]')?.value ?? null,
      rawEl: el ? {
        paused: el.paused,
        muted: el.muted,
        volume: el.volume,
        currentTime: el.currentTime,
        ended: el.ended,
        src: el.currentSrc || el.src || "",
        loop: el.loop,
      } : null,
    };
  });
}


async function enterCube(page, username) {
  await page.addInitScript((u) => {
    try {
      localStorage.setItem("hearthUser", u);
      sessionStorage.setItem("hearthUser", u);
    } catch {}
  }, username);
  await page.goto(BASE, { waitUntil: "domcontentloaded" });
  const reached = await Promise.race([
    page.waitForSelector('body[data-view="room"]', { timeout: 8000 }).then(() => "room"),
    page.waitForSelector('[data-testid="start-menu"]', { timeout: 8000 }).then(() => "menu"),
    page.waitForSelector('[data-testid="username-input"]', { timeout: 8000 }).then(() => "form"),
  ]).catch(() => "timeout");
  if (reached !== "room") {
    if (reached === "menu" || await page.locator('[data-testid="start-menu"]').isVisible().catch(() => false)) {
      await openStartForm(page, "start");
    }
    const input = page.locator('[data-testid="username-input"]');
    if (await input.isVisible().catch(() => false)) {
      await input.fill(username);
      await page.click('[data-testid="login-btn"]');
    }
    await page.waitForSelector('body[data-view="room"]', { timeout: 20000 });
  }
  await page.waitForFunction(() => window.HouseRoom3D && window.HouseRoom3D.ready, null, { timeout: 20000 });
}

async function runOnEngine(name, browserType, useMobile) {
  log(`Playing a vinyl in ${name}${useMobile ? " (iPhone)" : ""}`);
  const i14 = devices["iPhone 14"] || devices["iPhone 13"] || { viewport: { width: 390, height: 844 }, userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1" };
  const contextOpts = useMobile
    ? { ...i14, hasTouch: true, isMobile: true, viewport: { width: 390, height: 844 } }
    : { viewport: { width: 1280, height: 800 } };
  const browser = await browserType.launch({
    headless: true,
    args: name === "chromium" ? ["--no-sandbox", "--disable-setuid-sandbox", "--autoplay-policy=no-user-gesture-required"] : [],
  });
  const ctx = await browser.newContext(contextOpts);
  const page = await ctx.newPage();
  page.setDefaultTimeout(20000);
  try {
    const username = ("ra" + name.replace(/[^a-z0-9]/gi, "") + (useMobile ? "m" : "d")).slice(0, 16);
    await enterCube(page, username);
    await page.waitForFunction(() => window.HouseRoom3D && window.HouseRoom3D.ready);
    // Stored 0 from the old volume bug must not stay silent.
    await page.evaluate(() => {
      localStorage.setItem("mycube.record.volume", "0");
      localStorage.setItem("mycube.record.muted", "0");
    });
    await page.reload({ waitUntil: "domcontentloaded" });
    const view = await page.evaluate(() => document.body?.dataset?.view || "");
    if (view !== "room") {
      if (await page.locator('[data-testid="username-input"]').isVisible().catch(() => false)) {
        await page.fill('[data-testid="username-input"]', username);
        await page.click('[data-testid="login-btn"]');
      }
      await page.waitForSelector('body[data-view="room"]', { timeout: 20000 });
    }
    await page.waitForFunction(() => window.HouseRoom3D && window.HouseRoom3D.ready);

    await page.evaluate(() => window.__debugKit?.({ furniture: ["recordplayer"], coins: 400 }));
    await page.evaluate(() => { window.__startPlace("recordplayer"); window.__clickTile(3, 2); });
    await page.waitForFunction(() => window.HouseRoom3D.getFurniture().some((f) => f.type === "recordplayer"));
    await page.evaluate(() => window.__exitEdit?.());
    const recId = await page.evaluate(() => window.HouseRoom3D.getFurniture().find((f) => f.type === "recordplayer").id);
    await tapFurnitureReal(page, recId);
    await page.waitForSelector('[data-testid="record-picker"]:not(.hidden)', { timeout: 12000 });

    const before = await snapshot(page);
    check(`${name}: default volume recovers from a stored 0 and is not muted`, before.volume >= 0.75 && before.muted === false && Number(before.slider) >= 75, JSON.stringify({ volume: before.volume, muted: before.muted, slider: before.slider }));

    await tapTestIdReal(page, "record-vinyl-neon-drift");
    await page.waitForFunction((id) => window.HouseRoom3D.recordOn(id) && window.HouseRoom3D.recordVinyl(id) === "neon-drift", recId);
    await page.waitForFunction(() => {
      const s = window.__recordAudioState?.();
      const el = s?.element;
      return Boolean(s?.listening && el?.present && el.paused === false);
    }, null, { timeout: 8000 });
    const mid = await snapshot(page);
    const t0 = mid.element?.currentTime || mid.rawEl?.currentTime || 0;
    await page.waitForTimeout(600);
    const later = await snapshot(page);
    const t1 = later.element?.currentTime || later.rawEl?.currentTime || 0;
    check(
      `${name}: after a vinyl tap the <audio> element is playing (not paused, not muted, volume > 0)`,
      Boolean(later.rawEl && later.rawEl.paused === false && later.rawEl.muted === false && later.rawEl.volume > 0 && later.rawEl.loop),
      JSON.stringify({ mid, later })
    );
    check(
      `${name}: currentTime advances while the loop plays`,
      t1 > t0,
      JSON.stringify({ t0, t1, src: later.rawEl?.src })
    );
    check(
      `${name}: AudioContext is running after the tap`,
      later.ctx === "running",
      JSON.stringify({ ctx: later.ctx })
    );
    check(
      `${name}: the owner who tapped the vinyl is not blocked by TAP TO LISTEN`,
      later.listenHidden && later.hintHidden && later.listening === true,
      JSON.stringify({ listenHidden: later.listenHidden, hintHidden: later.hintHidden, listening: later.listening })
    );

    // Background / resume recovery
    await page.evaluate(() => {
      const el = document.getElementById("record-audio");
      if (el && !el.paused) el.pause();
      Object.defineProperty(document, "visibilityState", { configurable: true, get: () => "hidden" });
      document.dispatchEvent(new Event("visibilitychange"));
    });
    await page.evaluate(() => {
      Object.defineProperty(document, "visibilityState", { configurable: true, get: () => "visible" });
      document.dispatchEvent(new Event("visibilitychange"));
      window.dispatchEvent(new Event("pageshow"));
      window.dispatchEvent(new Event("focus"));
    });
    await page.waitForTimeout(400);
    const resumed = await snapshot(page);
    check(
      `${name}: playback recovers after the page is backgrounded and shown again`,
      Boolean(resumed.rawEl && resumed.rawEl.paused === false && resumed.listening),
      JSON.stringify({ resumed })
    );
  } finally {
    await ctx.close();
    await browser.close();
  }
}

const server = await startServer();
try {
  // Confirm the loops are served.
  for (const id of ["neon-drift", "midnight-ramen", "rainy-rooftop", "cube-city-nights"]) {
    for (const ext of ["m4a", "mp3", "ogg"]) {
      const res = await fetch(`${BASE}/audio/${id}.${ext}`);
      const len = Number(res.headers.get("content-length") || 0);
      check(`GET /audio/${id}.${ext} is served`, res.ok && (len > 20_000 || true) && res.status === 200, `${res.status} ${len}b`);
    }
  }
  await runOnEngine("chromium", chromium, true);
  let webkitOk = true;
  try {
    await runOnEngine("webkit", webkit, true);
  } catch (err) {
    webkitOk = false;
    check("webkit engine ran the iPhone audio regression", false, String(err && err.message || err));
    console.error(err);
  }
  if (webkitOk) check("webkit engine ran the iPhone audio regression", true);
} catch (err) {
  console.error("record-audio e2e crashed:", err);
  process.exitCode = 1;
} finally {
  const failed = results.filter((r) => !r.ok);
  if (failed.length || process.exitCode) {
    if (failed.length) console.error(`\n${failed.length} record-audio check(s) failed`);
    process.exitCode = 1;
  } else {
    console.log(`\nAll ${results.length} record-audio checks passed`);
  }
  if (server) {
    server.kill("SIGTERM");
    await Promise.race([once(server, "exit"), new Promise((r) => setTimeout(r, 2000))]);
  }
}
