/** Shared helper so login flows go through the arcade start menu. */
export async function openStartForm(page, action = "start") {
  const input = page.locator('[data-testid="username-input"]');
  if (await input.isVisible().catch(() => false)) return;
  const menu = page.locator('[data-testid="start-menu"]');
  await menu.waitFor({ state: "visible", timeout: 20000 });
  await page.locator(`[data-testid="start-option-${action}"]`).click();
  await input.waitFor({ state: "visible", timeout: 10000 });
}

const TAB_FOR = {
  skin: "skin",
  hair: "hair",
  hairColor: "hair",
  glasses: "head",
  glassesStyle: "head",
  glassesColor: "head",
  accessory: "head",
  hat: "head",
  hatColor: "head",
  headphoneColor: "head",
  top: "shirt",
  shirt: "shirt",
  bottom: "pants",
  bottomColor: "pants",
  shoes: "shoes",
  shoeColor: "shoes",
  necklace: "extras",
};

export async function openCreatorTab(page, tab) {
  const btn = page.locator(`[data-testid="creator-tab-${tab}"]`);
  await btn.waitFor({ state: "visible", timeout: 10000 });
  await btn.click();
  const panel = page.locator(`[data-testid="creator-panel-${tab}"]`);
  try {
    await panel.waitFor({ state: "visible", timeout: 2500 });
  } catch {
    await page.evaluate((id) => window.__creatorMenu?.setTab?.(id), tab);
    await panel.waitFor({ state: "visible", timeout: 8000 });
  }
}

const ACCESSORY_TO_HAT = { 1: "hat-1", 2: "hat-2", 5: "hat-3", 8: "hat-4", 9: "hat-5" }; // cap, beanie, trucker, bucket, fitted
export async function clickCreatorOption(page, testId) {
  let id = String(testId);
  if (id.startsWith("accessory-")) {
    const n = id.slice("accessory-".length);
    if (n === "3") id = "necklace-1"; // gold chain
    else if (ACCESSORY_TO_HAT[n]) id = ACCESSORY_TO_HAT[n];
    else if (n === "10") id = "glassesStyle-3"; // shades
  }
  if (id === "glasses-toggle") id = "glassesStyle-1";
  const key = id.split("-")[0];
  const tab = TAB_FOR[key];
  if (tab) await openCreatorTab(page, tab);
  await page.evaluate((tid) => window.__creatorMenu?.showOption?.(tid), id);
  await page.click(`[data-testid="${id}"]`);
}

export async function closePhoneIfOpen(page) {
  const open = await page.evaluate(() => {
    const el = document.getElementById("phone-overlay");
    return Boolean(el && !el.classList.contains("hidden"));
  });
  if (!open) return;
  await page.evaluate(() => window.__closePhone?.());
  await page.waitForFunction(() => {
    const el = document.getElementById("phone-overlay");
    return !el || el.classList.contains("hidden");
  }, null, { timeout: 8000 }).catch(() => {});
}

export async function goToLobby(page) {
  const view = await page.evaluate(() => document.body.dataset.view);
  if (view === "lobby") return;
  if (view === "room") {
    await closePhoneIfOpen(page);
    const btn = page.locator('[data-testid="leave-cube"]');
    if (await btn.isVisible().catch(() => false)) {
      await btn.click();
    } else {
      await page.evaluate(() => window.__leaveRoom?.());
    }
    await page.waitForSelector('body[data-view="lobby"]', { timeout: 15000 });
    return;
  }
  await page.evaluate(() => window.__leaveRoom?.());
  await page.waitForSelector('body[data-view="lobby"]', { timeout: 15000 });
}

export async function seedAndLogin(page, username, baseUrl) {
  await page.addInitScript((u) => {
    try {
      localStorage.setItem("hearthUser", u);
      sessionStorage.setItem("hearthUser", u);
    } catch {}
  }, username);
  await page.goto(baseUrl, { waitUntil: "domcontentloaded" });
  await page.waitForSelector('body[data-view="room"]', { timeout: 30000 });
}

export async function openCharacterEditor(page) {
  const open = await page.evaluate(() => window.__creatorMenu?.isPhoneEdit?.() || document.body.dataset.view === "creator");
  if (!open) {
    await page.evaluate(() => window.__openCharacterEditor?.());
  }
  await page.waitForFunction(() => window.__creatorMenu?.isPhoneEdit?.() || document.body.dataset.view === "creator", null, { timeout: 15000 });
  await page.waitForSelector('[data-testid="creator-window"]', { timeout: 10000 });
  await page.waitForTimeout(320);
}
