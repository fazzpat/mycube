/* Crisp 2000s MyCoke-style drip coffee maker and pot on a small side table.
   Steam wisps loop, and they get stronger while a cup is brewing. */

export const STEAM_FRAMES = 6;

export function steamFrameAt(now = Date.now()) {
  return Math.floor(now / 180) % STEAM_FRAMES;
}

function drawSteam(ctx, pot, potLift, lights, frame, brewing, iso) {
  const { diamond, fillPts, shade } = iso;
  const strength = brewing ? 1 : 0.62;
  const wisps = brewing ? 6 : 4;
  const colors = lights
    ? (brewing ? ["#ffffff", "#f7f2ea", "#efe8dc"] : ["#f0ece4", "#e2ddd4", "#d0cbc2"])
    : [shade("#f0ece4", -36), shade("#e2ddd4", -36), shade("#d0cbc2", -36)];
  const cx = pot.x + pot.w / 2;
  const cy = pot.y + pot.h / 2;
  for (let i = 0; i < wisps; i++) {
    const phase = (frame + i * 2) % STEAM_FRAMES;
    const rise = 5 + phase * 3.2 + (i % 3) * 2.2;
    const wobble = ((i % 2 === 0) ? 1 : -1) * (0.03 + phase * 0.018);
    const s = Math.max(0.03, (brewing ? 0.13 : 0.09) - phase * 0.012);
    const a = strength * (1 - phase / (STEAM_FRAMES + 0.4)) * (lights ? 0.95 : 0.55);
    if (a < 0.1) continue;
    ctx.globalAlpha = a;
    const d = diamond(cx + wobble - s / 2, cy - s / 2, s, s, potLift + rise);
    fillPts(ctx, [d.N, d.E, d.S, d.W], colors[i % colors.length], null);
    const dHi = diamond(cx + wobble * 0.5 - s * 0.25, cy - s * 0.25, s * 0.55, s * 0.55, potLift + rise + 1.6);
    fillPts(ctx, [dHi.N, dHi.E, dHi.S, dHi.W], colors[(i + 1) % colors.length], null);
    if (brewing && phase < 5) {
      const d2 = diamond(
        cx - wobble * 0.85 - s * 0.35,
        cy - s * 0.35,
        s * 0.8,
        s * 0.8,
        potLift + rise + 3.4
      );
      fillPts(ctx, [d2.N, d2.E, d2.S, d2.W], colors[(i + 2) % colors.length], null);
    }
  }
  ctx.globalAlpha = 1;
}

export function drawCoffeeMaker(ctx, tw, th, rot, lights, opts, iso) {
  const {
    box, pal, shadow, insetBox, frontRect, backRect, visibleFront,
    faceCorners, faceRect, shade,
  } = iso;
  const brewing = !!opts?.brewing;
  const frame = ((opts?.steamFrame ?? 0) % STEAM_FRAMES + STEAM_FRAMES) % STEAM_FRAMES;

  const full = insetBox(tw, th);
  const table = {
    x: full.x + 0.04,
    y: full.y + 0.04,
    w: full.w - 0.08,
    h: full.h - 0.08,
  };
  shadow(ctx, table.x, table.y, table.w, table.h, 0.3);
  const wood = pal("#6b4a2c", lights);
  const legs = pal("#3a2818", lights);
  const tableTop = 10;
  const leg = 0.11;
  const inset = 0.08;
  const spots = [
    [table.x + inset, table.y + inset],
    [table.x + table.w - leg - inset, table.y + inset],
    [table.x + inset, table.y + table.h - leg - inset],
    [table.x + table.w - leg - inset, table.y + table.h - leg - inset],
  ];
  for (const [lx, ly] of spots) box(ctx, lx, ly, leg, leg, 0, tableTop, legs);
  box(ctx, table.x, table.y, table.w, table.h, tableTop, 2.4, wood);

  const back = backRect(tw, th, rot, 0.48);
  const mx = back.x + 0.07;
  const my = back.y + 0.07;
  const mw = Math.max(0.28, back.w - 0.14);
  const mh = Math.max(0.28, back.h - 0.14);
  const bodyLift = tableTop + 2.4;
  const bodyH = 16;
  const cream = pal("#d8d0c4", lights);
  box(ctx, mx, my, mw, mh, bodyLift, bodyH, cream);

  const frontFace = visibleFront(rot);
  if (frontFace) {
    const fc = faceCorners(mx, my, mw, mh, bodyLift, bodyH, frontFace);
    faceRect(ctx, fc, 0.08, 0.78, 0.92, 0.96, lights ? "#c4a35a" : "#7a6438", cream.outline);
    faceRect(ctx, fc, 0.16, 0.22, 0.84, 0.7, lights ? "#6a8aa0" : "#33444c", cream.outline);
    faceRect(ctx, fc, 0.22, 0.3, 0.78, 0.62, lights ? "#3a2218" : "#1a100c", cream.outline);
    if (brewing) {
      faceRect(ctx, fc, 0.44, 0.82, 0.58, 0.93, lights ? "#ffd56a" : "#8a6a30", null);
    } else if (lights) {
      faceRect(ctx, fc, 0.72, 0.82, 0.84, 0.92, "#c43a4a", null);
    }
  }

  const headLift = bodyLift + bodyH - 2;
  const head = frontRect(tw, th, rot, 0.2);
  const hx = head.x + head.w * 0.18;
  const hy = head.y + head.h * 0.2;
  box(ctx, hx, hy, head.w * 0.64, head.h * 0.55, headLift, 3, pal("#c8c0b4", lights));

  const front = frontRect(tw, th, rot, 0.4);
  const plate = {
    x: front.x + front.w * 0.16,
    y: front.y + front.h * 0.16,
    w: front.w * 0.68,
    h: front.h * 0.68,
  };
  box(ctx, plate.x, plate.y, plate.w, plate.h, bodyLift, 1.3, pal("#6a6860", lights));

  const pot = {
    x: front.x + front.w * 0.22,
    y: front.y + front.h * 0.2,
    w: front.w * 0.56,
    h: front.h * 0.56,
  };
  const potLift = bodyLift + 1.3;
  const glass = pal("#8eb8c8", lights);
  box(ctx, pot.x, pot.y, pot.w, pot.h, potLift, 8, {
    top: lights ? "rgba(180, 210, 220, 0.55)" : glass.top,
    left: lights ? "rgba(90, 130, 150, 0.55)" : glass.left,
    right: lights ? "rgba(60, 90, 110, 0.55)" : glass.right,
    outline: glass.outline,
  });
  box(
    ctx,
    pot.x + pot.w * 0.1,
    pot.y + pot.h * 0.1,
    pot.w * 0.8,
    pot.h * 0.8,
    potLift,
    4.8,
    pal("#3a1c10", lights)
  );
  box(ctx, pot.x, pot.y, pot.w, pot.h, potLift + 7.1, 1.3, pal("#c8c0b4", lights));

  if (frontFace === "+y") {
    box(ctx, pot.x + pot.w, pot.y + pot.h * 0.28, 0.08, pot.h * 0.44, potLift + 1.6, 4.6, pal("#c8c0b4", lights));
  } else if (frontFace === "+x") {
    box(ctx, pot.x + pot.w * 0.28, pot.y + pot.h, pot.w * 0.44, 0.08, potLift + 1.6, 4.6, pal("#c8c0b4", lights));
  } else {
    box(ctx, pot.x - 0.08, pot.y + pot.h * 0.28, 0.08, pot.h * 0.44, potLift + 1.6, 4.6, pal("#c8c0b4", lights));
  }

  drawSteam(ctx, pot, potLift + 8.4, lights, frame, brewing, iso);
  void shade;
}
