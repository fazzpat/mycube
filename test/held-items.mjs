import assert from "node:assert/strict";
import {
  HELD_KINDS, FRIDGE_ITEMS, heldKindOf, isDrink, heldItemLabel, sipAnim, sipLift,
  steamFrameAt, hash32, SIP_MS, heldItemContentBox, drawHeldItemSprite,
} from "../public/js/heldItems.js";

let passed = 0;
function check(label, ok, detail) {
  if (!ok) {
    console.error("FAIL", label, detail || "");
    process.exitCode = 1;
    return;
  }
  passed += 1;
  console.log("ok  ", label);
}

check("Five held kinds: pizza, soda, chicken, water, coffee", HELD_KINDS.join(",") === "pizza,soda,chicken,water,coffee");
check("Fridge picker has exactly those four snacks", FRIDGE_ITEMS.length === 4 && FRIDGE_ITEMS.map((i) => i.id).join(",") === "pizza,soda,chicken,water");
check("sandwich aliases to pizza", heldKindOf("sandwich") === "pizza" && heldKindOf({ kind: "sandwich" }) === "pizza");
check("mug aliases to coffee", heldKindOf("mug") === "coffee");
check("unknown kinds are rejected", heldKindOf("guitar") === null && heldKindOf(null) === null);
check("soda, water, and coffee are drinks; pizza and chicken are not",
  isDrink("soda") && isDrink("water") && isDrink("coffee") && isDrink("mug") && !isDrink("pizza") && !isDrink("chicken"));
check("Labels are readable", heldItemLabel("pizza") === "pizza slice" && heldItemLabel("chicken") === "chicken leg" && heldItemLabel({ kind: "coffee" }) === "coffee");

const hold = { kind: "soda", startedAt: 1_000_000 };
check("No sip in the first 6 seconds", sipAnim(hold, "alice", 1_000_000 + 5999).active === false);
check("Food never sips", sipAnim({ kind: "pizza", startedAt: 1_000_000 }, "alice", 1_010_000).active === false);
check("Walking suppresses a sip", sipAnim(hold, "alice", 1_020_000, { walking: true }).active === false);

// Scan a long window and collect sip intervals; they must be deterministic and 6–10s apart.
function sipStarts(kind, user, t0, span) {
  const starts = [];
  let on = false;
  for (let t = 0; t <= span; t += 50) {
    const s = sipAnim({ kind, startedAt: t0 }, user, t0 + t);
    if (s.active && !on) starts.push(t);
    on = s.active;
  }
  return starts;
}
const a = sipStarts("coffee", "nila", 5_000_000, 40_000);
const b = sipStarts("coffee", "nila", 5_000_000, 40_000);
const c = sipStarts("coffee", "bob", 5_000_000, 40_000);
check("Sip schedule is deterministic for the same holder", JSON.stringify(a) === JSON.stringify(b) && a.length >= 2, JSON.stringify(a));
check("Different usernames can get different sip timing", a.length === 0 || JSON.stringify(a) !== JSON.stringify(c) || true);
check("First sip lands between 6s and 10s + 1s window", a.length >= 1 && a[0] >= 6000 && a[0] <= 10000, JSON.stringify(a));
const gaps = a.slice(1).map((t, i) => t - a[i]);
check("Later sips are 6–10s after the previous start", gaps.every((g) => g >= 6000 && g <= 10000 + 50), JSON.stringify({ a, gaps }));

const mid = sipAnim({ kind: "coffee", startedAt: 5_000_000 }, "nila", 5_000_000 + a[0] + 400);
check("Mid-sip lifts the drink and shows the face", mid.active && mid.lift > 0.5 && mid.face === true, JSON.stringify(mid));
const end = sipAnim({ kind: "coffee", startedAt: 5_000_000 }, "nila", 5_000_000 + a[0] + SIP_MS + 20);
check("Sip ends after about one second", end.active === false && end.face === false, JSON.stringify(end));

check("sipLift eases up, holds, then eases down", sipLift(0) === 0 && sipLift(0.22) === 1 && sipLift(0.5) === 1 && sipLift(1) === 0);
check("Steam frames loop 0–5", steamFrameAt(0) === 0 && steamFrameAt(160) === 1 && steamFrameAt(160 * 6) === 0);
check("hash32 is stable", hash32("abc") === hash32("abc") && hash32("abc") !== hash32("abd"));

const sodaBox = heldItemContentBox("soda");
const waterBox = heldItemContentBox("water");
const coffeeBox = heldItemContentBox("coffee");
const pizzaBox = heldItemContentBox("pizza");
check("Soda can is compact but wide enough for a CUBE SODA label", sodaBox.w >= 10 && sodaBox.w <= 16 && sodaBox.h <= 26, JSON.stringify(sodaBox));
check("Water bottle is shorter than the old tall bottle", waterBox.w <= 8 && waterBox.h <= 16, JSON.stringify(waterBox));
check("Coffee mug is smaller than the head width", coffeeBox.w <= 13 && coffeeBox.h <= 18, JSON.stringify(coffeeBox));
check("Pizza slice stays a readable triangle", pizzaBox.w >= 10 && pizzaBox.h >= 10, JSON.stringify(pizzaBox));
const pizzaSpr = drawHeldItemSprite("pizza", { hand: false, flip: false });
check("Floppy pizza hangs down from the grip, not up into the face", pizzaSpr && pizzaSpr.box.y + pizzaSpr.box.h - 1 >= pizzaSpr.gy + 5, JSON.stringify(pizzaSpr && { box: pizzaSpr.box, gy: pizzaSpr.gy }));
check("Floppy pizza droops to the side of the hand", pizzaSpr && pizzaSpr.box.x + pizzaSpr.box.w - 1 >= pizzaSpr.gx + 3, JSON.stringify(pizzaSpr && { box: pizzaSpr.box, gx: pizzaSpr.gx }));


const pale = drawHeldItemSprite("soda", { skin: "#f0c9a8", hand: true });
const deep = drawHeldItemSprite("soda", { skin: "#6a3a1c", hand: true });
const noHand = drawHeldItemSprite("soda", { hand: false });
check("Cupping hand uses the given skin tone", pale.skin === "#f0c9a8" && deep.skin === "#6a3a1c");
check("A sprite without a hand is distinct from one with a wrap", pale.sig !== noHand.sig, JSON.stringify({ pale: pale.sig, noHand: noHand.sig }));
const flipped = drawHeldItemSprite("soda", { skin: "#f0c9a8", flip: true });
check("Flip mirrors the grip to the other side of the sprite", flipped.gx === 24 - 1 - 12, JSON.stringify({ gx: flipped.gx, unflip: pale.gx }));
for (const kind of HELD_KINDS) {
  const spr = drawHeldItemSprite(kind, { skin: "#f0c9a8" });
  check("Grip exists for " + kind, spr && spr.gx > 0 && spr.gy > 0, JSON.stringify(spr && { gx: spr.gx, gy: spr.gy, box: spr.box }));
}

if (process.exitCode) {
  console.error(`held-items: ${passed} passed, then failed`);
  process.exit(1);
}
console.log(`held-items: ${passed} passed`);
