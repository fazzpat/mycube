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

async function openPhone(page) {
  const overlay = page.locator('[data-testid="phone-overlay"]');
  if (await overlay.evaluate((el) => el.classList.contains("hidden"))) {
    await page.click('[data-testid="phone-btn"]');
    await page.waitForSelector('[data-testid="phone-overlay"]:not(.hidden)');
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

  await alice.click('[data-testid="emote-drink"]');
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
  await alice.screenshot({ path: `${SHOT}/08-phone-menu.png` });
  await openPhoneApp(alice, "shop");
  await alice.waitForSelector('[data-testid="phone-screen-shop"]:not(.hidden)');
  await alice.waitForTimeout(200);
  await alice.screenshot({ path: `${SHOT}/09-phone-app-open.png` });
  await alice.click('[data-testid="phone-home-bar"]');
  await alice.waitForSelector('[data-testid="phone-home"]:not(.hidden)', { state: "visible" });
  await alice.click('[data-testid="phone-home-bar"]');
  await alice.waitForFunction(() => document.querySelector('[data-testid="phone-overlay"]')?.classList.contains("hidden"));
  await alice.setViewportSize({ width: 1280, height: 800 });
  check("Room controls are packaged as apps on an in-game phone", true);

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
    await alice.click('[data-testid="furn-pickup"]');
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
  const lightsWereOn = await alice.evaluate(() => window.HouseRoom3D.lightsOn());
  await alice.evaluate(() => window.HouseRoom3D.simulateSwitchClick());
  await alice.waitForFunction((prev) => window.HouseRoom3D.lightsOn() !== prev, lightsWereOn);
  check("Anyone can flip the wall switch and everyone sees the lights change", await bob.evaluate((prev) => window.HouseRoom3D.lightsOn() !== prev, lightsWereOn));
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
  if (await alice.locator('[data-testid="stow-item"]').count()) {
    await alice.click('[data-testid="stow-item"]');
    await alice.waitForTimeout(300);
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
  await alice.locator('[data-testid="gym-done"]').click({ force: true });
  await alice.waitForTimeout(400);

  await alice.evaluate(() => { window.__startPlace("treadmill"); window.__clickTile(4, 0); });
  await alice.waitForFunction(() => window.HouseRoom3D.getFurniture().some((f) => f.type === "treadmill"));
  const millId = await alice.evaluate(() => window.HouseRoom3D.getFurniture().find((f) => f.type === "treadmill").id);
  await alice.evaluate((id) => window.__clickFurniture(id, "treadmill"), millId);
  await alice.waitForSelector('[data-testid="gym-done"]', { timeout: 15000 });
  check("The treadmill starts a synced running animation", await bob.waitForFunction(() => window.HouseRoom3D.personFlags("alice")?.gym?.type === "treadmill").then(() => true).catch(() => false));
  await alice.locator('[data-testid="gym-done"]').click({ force: true });

  await alice.setViewportSize({ width: 1280, height: 800 });


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
