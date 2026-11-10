import { chromium } from "playwright";
import { mkdir } from "fs/promises";

const BASE = process.env.BASE_URL || "http://127.0.0.1:3000";
const SHOT = "/workspace/rooms-app/screenshots";

function log(msg) {
  console.log("[test]", msg);
}

async function login(page, username) {
  await page.goto(BASE, { waitUntil: "domcontentloaded" });
  await page.waitForSelector('[data-testid="username-input"]');
  await page.fill('[data-testid="username-input"]', username);
  await page.click('[data-testid="login-btn"]');
  await page.waitForSelector('body[data-view="creator"]', { timeout: 15000 });
  await page.waitForSelector('[data-testid="save-avatar"]', { timeout: 10000 });
}

async function customize(page, { displayName, hair, shirt, skin, glasses }) {
  await page.fill('[data-testid="display-name"]', displayName);
  await page.click(`[data-testid="hair-${hair}"]`);
  await page.click(`[data-testid="shirt-${shirt}"]`);
  await page.click(`[data-testid="skin-${skin}"]`);
  if (glasses) await page.check('[data-testid="glasses-toggle"]');
}

async function saveAvatar(page) {
  await page.click('[data-testid="save-avatar"]');
  await page.waitForSelector('body[data-view="lobby"]', { timeout: 10000 });
}

async function openAddSheet(page) {
  await page.click('[data-testid="add-menu-btn"]');
  await page.waitForSelector('[data-testid="friend-name"]');
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
  await customize(bob, { displayName: "Bob", hair: 2, shirt: 2, skin: 3, glasses: true });
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

  log("Speech bubbles: visible in-room, then they fade");
  await alice.evaluate(() => window.__clickTile(2, 3));
  await bob.evaluate(() => window.__clickTile(4, 3));
  await alice.waitForTimeout(1400);
  await alice.fill('[data-testid="chat-input"]', "hey there friend!");
  await alice.click('[data-testid="chat-send"]');
  await bob.waitForSelector('[data-testid="bubble-alice"]');
  await bob.waitForTimeout(350);
  const bubbleText = await bob.locator('[data-testid="bubble-alice"]').innerText();
  check("People in the room see the speech bubble", bubbleText.includes("hey there friend!"));
  await bob.screenshot({ path: `${SHOT}/04-speech-bubble.png` });
  await alice.evaluate(() => window.__clickTile(3, 5));
  await bob.evaluate(() => window.__clickTile(5, 5));
  await alice.waitForTimeout(3000);
  await bob.screenshot({ path: `${SHOT}/07-character-closeup.png` });
  await bob.waitForTimeout(5000);
  check("Speech bubbles disappear after a few seconds", (await bob.locator('[data-testid="bubble-alice"]').count()) === 0);

  log("Bubbles are not delivered outside the room");
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
  await alice.click('[data-testid="invite-btn"]');
  await alice.waitForSelector('[data-testid="invite-modal"]:not(.hidden)');
  await alice.fill('[data-testid="invite-name"]', "bob");
  await alice.click('[data-testid="invite-submit"]');
  await bob.waitForSelector('[data-testid="invite-join"]', { timeout: 10000 });
  await bob.click('[data-testid="invite-join"]');
  await bob.waitForSelector('body[data-view="room"]');
  await waitForText(bob, '[data-testid="room-title"]', "Secret Den");
  check("An invite lets a user into a locked room without the password", true);

  log("Alice buys and places furniture");
  await alice.click('[data-testid="shop-btn"]');
  await alice.waitForSelector('[data-testid="buy-couch"]');
  await alice.locator('[data-testid="buy-couch"]').click({ force: true });
  await alice.waitForSelector('[data-place="couch"]');
  await alice.locator('[data-testid="buy-plant"]').click({ force: true });
  await alice.waitForSelector('[data-place="plant"]');
  await alice.click('[data-place="couch"]');
  await alice.evaluate(() => window.__clickTile(3, 1));
  await alice.waitForFunction(() => window.HouseRoom3D.getFurniture().some((f) => f.type === "couch"));
  await alice.click('[data-testid="shop-btn"]');
  await alice.waitForSelector('[data-place="plant"]');
  await alice.click('[data-place="plant"]');
  await alice.evaluate(() => window.__clickTile(0, 1));
  await alice.waitForFunction(() => window.HouseRoom3D.getFurniture().some((f) => f.type === "plant"));
  await bob.waitForFunction(() => window.HouseRoom3D.getFurniture().some((f) => f.type === "couch"));
  const coins = await alice.locator("#room-coins").innerText();
  check("Owner can buy furniture and coins decrease", Number(coins) === 10, `coins=${coins}`);
  check("Placed furniture appears for everyone in the room", await bob.evaluate(() => window.HouseRoom3D.getFurniture().some((f) => f.type === "couch")));

  await alice.click('[data-testid="emote-drink"]');
  await bob.waitForSelector('[data-testid="emote-alice"]');
  check("Eat/drink emotes show up on the avatar", true);

  await alice.waitForTimeout(500);
  await alice.screenshot({ path: `${SHOT}/05-furniture.png` });

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
