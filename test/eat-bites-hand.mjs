import { heldItemHandAnchor, heldItemFaceAnchor, sipAdjustedHand, AV_W } from "../public/js/avatar3d.js";
import { drawHeldItemSprite, sipAnim, BITE_COUNT, BITE_FIRST_MS } from "../public/js/heldItems.js";

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

const av = {
  skin: "#f0c9a8", hair: "spiky", hairColor: "#e6d3a4", shirt: "#c45c4a",
  top: "tshirt", bottom: "jeans", bottomColor: "#3d4f7c", shoes: "white", accessory: "none",
};
const facings = [
  { bodyDir: 0, name: "3/4 SE" },
  { bodyDir: 1, name: "front S" },
  { bodyDir: 2, name: "3/4 SW" },
  { bodyDir: 3, name: "profile W" },
  { bodyDir: 4, name: "3/4 NW" },
  { bodyDir: 5, name: "back N" },
  { bodyDir: 6, name: "3/4 NE" },
  { bodyDir: 7, name: "profile E" },
];

const mid = AV_W / 2;
for (const kind of ["pizza", "chicken", "soda"]) {
  for (const f of facings) {
    const base = { bodyDir: f.bodyDir, headDir: f.bodyDir, heldItem: { kind }, blink: "open" };
    const rest = heldItemHandAnchor(av, base, 0);
    const face = heldItemFaceAnchor(av, base, 0);
    const item = drawHeldItemSprite(kind, { hand: false, flip: rest.flip, eaten: 0 });
    const sipLip = { x: (item.lx ?? item.gx) - item.gx, y: (item.ly ?? item.gy) - item.gy };
    const sipMouth = face.mouth
      ? { x: face.mouth.x, y: face.mouth.y + 1 }
      : { x: face.head.x, y: face.head.y + 6 };
    const flags = { ...base, sipLift: 1, sipLip, sipMouth, sipKey: rest.key };
    const raised = heldItemHandAnchor(av, flags, 0);
    const moved = Math.hypot(raised.x - rest.x, raised.y - rest.y);
    check(`${kind} ${f.name}: raise moves the holding hand`, moved > 2, JSON.stringify({ rest, raised, moved }));

    // Item stays glued to the hand: grip world pos == hand, so lip = hand + sipLip.
    const lipX = raised.x + sipLip.x;
    const lipY = raised.y + sipLip.y;
    const back = rest.key === "n" || rest.key === "ne";
    const lipDist = Math.hypot(lipX - sipMouth.x, lipY - sipMouth.y);
    if (back) {
      const restLip = Math.hypot(rest.x + sipLip.x - sipMouth.x, rest.y + sipLip.y - sipMouth.y);
      check(`${kind} ${f.name}: back-facing raise stays attached and closer to the hidden face`,
        raised.behind === true && lipDist < restLip - 1, JSON.stringify({ lipDist, restLip, key: rest.key, raised, mid }));
      check(`${kind} ${f.name}: back-facing hand stays off the spine`,
        Math.abs(raised.x - mid) > 3, JSON.stringify({ x: raised.x, mid, key: rest.key }));
    } else {
      check(`${kind} ${f.name}: lip meets the mouth while the hand keeps the grip`,
        lipDist <= 1.25, JSON.stringify({ lipDist, lipX, lipY, sipMouth, raised, sipLip }));
    }

    const midHand = sipAdjustedHand(rest, { sipLift: 0.5, sipLip, sipMouth, sipKey: rest.key });
    const midOk = Math.abs(midHand.x - (rest.x + raised.x) / 2) < 1.6 && Math.abs(midHand.y - (rest.y + raised.y) / 2) < 1.6;
    check(`${kind} ${f.name}: mid-raise hand is between rest and mouth`, midOk, JSON.stringify({ midHand, rest, raised }));
  }
}

check("sipAdjustedHand is a no-op at lift 0", sipAdjustedHand({ x: 10, y: 20 }, { sipLift: 0, sipMouth: { x: 1, y: 1 } }).x === 10);

const pizzaBite = sipAnim({ kind: "pizza", startedAt: 1, }, "pat", 1 + BITE_FIRST_MS + 1000);
check("A mid-bite still reports one of 4 chunks eaten", pizzaBite.action === "bite" && pizzaBite.eaten === 1 && pizzaBite.eaten < BITE_COUNT, JSON.stringify(pizzaBite));

if (process.exitCode) {
  console.error(`eat-bites-hand: ${passed} passed, then failed`);
  process.exit(1);
}
console.log(`eat-bites-hand: ${passed} passed`);
