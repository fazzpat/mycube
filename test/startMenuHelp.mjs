/** Shared helper so login flows go through the arcade start menu. */
export async function openStartForm(page, action = "start") {
  const input = page.locator('[data-testid="username-input"]');
  if (await input.isVisible().catch(() => false)) return;
  const menu = page.locator('[data-testid="start-menu"]');
  await menu.waitFor({ state: "visible", timeout: 20000 });
  await page.locator(`[data-testid="start-option-${action}"]`).click();
  await input.waitFor({ state: "visible", timeout: 10000 });
}
