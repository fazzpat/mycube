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
  skin: "body",
  hair: "hair",
  hairColor: "hair",
  glasses: "face",
  accessory: "face",
  headphoneColor: "face",
  top: "top",
  shirt: "top",
  bottom: "bottom",
  bottomColor: "bottom",
  shoes: "shoes",
};

export async function openCreatorTab(page, tab) {
  const btn = page.locator(`[data-testid="creator-tab-${tab}"]`);
  await btn.waitFor({ state: "visible", timeout: 10000 });
  await btn.click();
  await page.locator(`[data-testid="creator-panel-${tab}"]`).waitFor({ state: "visible", timeout: 8000 });
}

export async function clickCreatorOption(page, testId) {
  const key = String(testId).split("-")[0];
  const tab = TAB_FOR[key];
  if (tab) await openCreatorTab(page, tab);
  await page.evaluate((id) => window.__creatorMenu?.showOption?.(id), testId);
  await page.click(`[data-testid="${testId}"]`);
}

export async function goToLobby(page) {
  const view = await page.evaluate(() => document.body.dataset.view);
  if (view === "lobby") return;
  if (view === "room") {
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
