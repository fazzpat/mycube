/** Original procedural wall pieces for MyCube. */
export function drawWallArt(ctx, w, h, type, lightsOn = true, t = 0) {
  ctx.clearRect(0, 0, w, h);
  if (type === "art_mona") drawMona(ctx, w, h);
  else if (type === "art_starry") drawStarry(ctx, w, h, t);
  else if (type === "art_pop") drawPop(ctx, w, h);
  else if (type === "art_sunset") drawSunset(ctx, w, h);
  else if (type === "art_cubism") drawCubism(ctx, w, h);
  else if (type === "art_poster") drawPoster(ctx, w, h);
  else if (type === "art_hang") drawHang(ctx, w, h);
  else if (type === "art_neon") drawNeon(ctx, w, h, lightsOn, t);
  else {
    ctx.fillStyle = "#efe6d8";
    ctx.fillRect(0, 0, w, h);
  }
}

function frame(ctx, w, h, fill) {
  ctx.fillStyle = "#6b4220";
  ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = fill || "#efe6d8";
  ctx.fillRect(10, 10, w - 20, h - 20);
}

function drawMona(ctx, w, h) {
  frame(ctx, w, h, "#7ea07a");
  // muted landscape
  ctx.fillStyle = "#c9b88a";
  ctx.fillRect(14, h * 0.62, w - 28, h * 0.28);
  ctx.fillStyle = "#5a7a6a";
  ctx.fillRect(14, h * 0.55, w - 28, h * 0.1);
  // cube-headed sitter
  ctx.fillStyle = "#2a2a2e";
  ctx.fillRect(w * 0.28, h * 0.58, w * 0.44, h * 0.28);
  ctx.fillStyle = "#f1c27d";
  const s = Math.min(w, h) * 0.28;
  ctx.fillRect(w / 2 - s / 2, h * 0.28, s, s);
  ctx.fillStyle = "#3d2c29";
  ctx.fillRect(w / 2 - s / 2, h * 0.28, s, s * 0.28);
  // eyes and a tiny knowing smile
  ctx.fillStyle = "#2a1c16";
  ctx.fillRect(w / 2 - s * 0.22, h * 0.4, 6, 6);
  ctx.fillRect(w / 2 + s * 0.12, h * 0.4, 6, 6);
  ctx.strokeStyle = "#2a1c16";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(w / 2, h * 0.5, s * 0.16, 0.15, Math.PI - 0.15);
  ctx.stroke();
  ctx.fillStyle = "#6b4220";
  ctx.font = "bold 11px Nunito, sans-serif";
  ctx.textAlign = "center";
  ctx.fillText("MONA CUBA", w / 2, h - 16);
}

function drawStarry(ctx, w, h, t) {
  frame(ctx, w, h, "#0d1b33");
  ctx.save();
  ctx.beginPath();
  ctx.rect(10, 10, w - 20, h - 20);
  ctx.clip();
  for (let i = 0; i < 8; i++) {
    ctx.strokeStyle = `hsl(${200 + i * 8} 70% ${40 + i * 4}%)`;
    ctx.lineWidth = 6 - i * 0.4;
    ctx.beginPath();
    const y = 30 + i * 18;
    ctx.moveTo(12, y);
    for (let x = 12; x < w - 12; x += 8) {
      ctx.lineTo(x, y + Math.sin(x * 0.08 + i + t * 0.4) * (10 + i));
    }
    ctx.stroke();
  }
  // cube "stars"
  for (let i = 0; i < 9; i++) {
    const x = 24 + (i * 37) % (w - 48);
    const y = 24 + (i * 29) % (h * 0.55);
    const s = 8 + (i % 3) * 4;
    ctx.fillStyle = i % 2 ? "#f4c15d" : "#9be7ff";
    ctx.fillRect(x, y, s, s);
  }
  // a little cube town
  ctx.fillStyle = "#1a2744";
  ctx.fillRect(18, h * 0.72, w - 36, h * 0.16);
  ctx.fillStyle = "#f4c15d";
  ctx.fillRect(w * 0.6, h * 0.58, 16, 16);
  ctx.restore();
}

function drawPop(ctx, w, h) {
  frame(ctx, w, h, "#111");
  const cols = ["#ef476f", "#f4c15d", "#4d7cff", "#3ecf8e"];
  const bw = (w - 24) / 2;
  const bh = (h - 24) / 2;
  cols.forEach((c, i) => {
    const x = 12 + (i % 2) * bw;
    const y = 12 + Math.floor(i / 2) * bh;
    ctx.fillStyle = c;
    ctx.fillRect(x + 2, y + 2, bw - 4, bh - 4);
    ctx.fillStyle = "#111";
    const s = Math.min(bw, bh) * 0.45;
    ctx.fillRect(x + bw / 2 - s / 2, y + bh / 2 - s / 2, s, s);
    ctx.fillStyle = "#fff";
    ctx.fillRect(x + bw / 2 - s / 2, y + bh / 2 - s / 2, s / 2, s / 2);
  });
}

function drawSunset(ctx, w, h) {
  frame(ctx, w, h, "#f4a261");
  const g = ctx.createLinearGradient(0, 12, 0, h - 12);
  g.addColorStop(0, "#ffd166");
  g.addColorStop(0.45, "#ff6b35");
  g.addColorStop(0.7, "#9a3412");
  g.addColorStop(1, "#1d3557");
  ctx.fillStyle = g;
  ctx.fillRect(12, 12, w - 24, h - 24);
  ctx.fillStyle = "#ffdd57";
  ctx.beginPath();
  ctx.arc(w / 2, h * 0.48, 22, 0, Math.PI * 2);
  ctx.fill();
  // cube reflections on the water
  ctx.fillStyle = "rgba(255, 200, 80, 0.5)";
  for (let i = 0; i < 5; i++) ctx.fillRect(w / 2 - 16 + i * 2, h * 0.58 + i * 8, 28 - i * 4, 5);
  ctx.fillStyle = "#1d3557";
  ctx.fillRect(12, h * 0.7, w - 24, h * 0.22);
}

function drawCubism(ctx, w, h) {
  frame(ctx, w, h, "#efe6d8");
  const shards = [
    [20, 20, 70, 24, 40, 90, "#c44536"],
    [60, 18, 140, 30, 120, 100, "#4d7cff"],
    [30, 80, 90, 40, 110, 130, "#f4c15d"],
    [20, 100, 80, 140, 24, 148, "#3ecf8e"],
    [90, 90, 150, 80, 150, 150, "#7c5cff"],
  ];
  shards.forEach((s) => {
    ctx.fillStyle = s[6];
    ctx.beginPath();
    ctx.moveTo(s[0], s[1]);
    ctx.lineTo(s[2], s[3]);
    ctx.lineTo(s[4], s[5]);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = "#2a1c16";
    ctx.stroke();
  });
  ctx.fillStyle = "#2a1c16";
  ctx.fillRect(70, 60, 28, 28);
}

function drawPoster(ctx, w, h) {
  ctx.fillStyle = "#2a1c4a";
  ctx.fillRect(0, 0, w, h);
  ctx.strokeStyle = "#f4c15d";
  ctx.lineWidth = 8;
  ctx.strokeRect(6, 6, w - 12, h - 12);
  ctx.fillStyle = "#ef476f";
  ctx.fillRect(28, 28, 28, 28);
  ctx.fillStyle = "#f4c15d";
  ctx.fillRect(62, 28, 28, 28);
  ctx.fillStyle = "#4d7cff";
  ctx.fillRect(28, 64, 28, 28);
  ctx.fillStyle = "#3ecf8e";
  ctx.fillRect(62, 64, 28, 28);
  ctx.fillStyle = "#fff8f2";
  ctx.font = "bold 22px Nunito, sans-serif";
  ctx.textAlign = "center";
  ctx.fillText("CUBICS", w / 2, h * 0.72);
  ctx.font = "12px Nunito, sans-serif";
  ctx.fillStyle = "#c9b8a6";
  ctx.fillText("SQUARES ONLY", w / 2, h * 0.82);
  ctx.fillText("no heroes.", w / 2, h * 0.9);
}

function drawHang(ctx, w, h) {
  frame(ctx, w, h, "#e8f0d8");
  ctx.strokeStyle = "#6b4a2b";
  ctx.lineWidth = 6;
  ctx.beginPath();
  ctx.moveTo(18, 24);
  ctx.lineTo(w - 18, 24);
  ctx.stroke();
  // cartoon cat hanging from a paw
  const cx = w / 2, cy = h * 0.48;
  ctx.strokeStyle = "#6b4a2b";
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(cx, 24);
  ctx.lineTo(cx, 48);
  ctx.stroke();
  ctx.fillStyle = "#f4c15d";
  ctx.beginPath();
  ctx.arc(cx, cy, 22, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = "#2a1c16";
  ctx.lineWidth = 2;
  ctx.stroke();
  // ears
  ctx.fillStyle = "#f4c15d";
  ctx.beginPath();
  ctx.moveTo(cx - 20, cy - 10);
  ctx.lineTo(cx - 8, cy - 28);
  ctx.lineTo(cx - 2, cy - 12);
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(cx + 20, cy - 10);
  ctx.lineTo(cx + 8, cy - 28);
  ctx.lineTo(cx + 2, cy - 12);
  ctx.fill();
  ctx.fillStyle = "#2a1c16";
  ctx.fillRect(cx - 10, cy - 4, 5, 5);
  ctx.fillRect(cx + 5, cy - 4, 5, 5);
  ctx.beginPath();
  ctx.arc(cx, cy + 8, 6, 0.2, Math.PI - 0.2);
  ctx.stroke();
  // paws up
  ctx.fillStyle = "#f4c15d";
  ctx.beginPath();
  ctx.arc(cx - 6, 50, 6, 0, Math.PI * 2);
  ctx.arc(cx + 6, 50, 6, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#2a1c4a";
  ctx.font = "bold 11px Nunito, sans-serif";
  ctx.textAlign = "center";
  ctx.fillText("HANG IN THERE", w / 2, h - 22);
}

function drawNeon(ctx, w, h, lightsOn, t) {
  ctx.fillStyle = lightsOn ? "#1a1420" : "#07060c";
  ctx.fillRect(0, 0, w, h);
  const glow = lightsOn ? 0.45 : 1;
  const pulse = 0.75 + Math.sin(t * 3) * 0.25;
  ctx.shadowColor = `rgba(255, 77, 141, ${glow * pulse})`;
  ctx.shadowBlur = lightsOn ? 12 : 28;
  ctx.fillStyle = `rgba(255, 77, 141, ${0.7 + glow * 0.3})`;
  ctx.font = "bold 28px Nunito, sans-serif";
  ctx.textAlign = "center";
  ctx.fillText("my", w / 2, h * 0.42);
  ctx.shadowColor = `rgba(120, 220, 255, ${glow * pulse})`;
  ctx.fillStyle = `rgba(120, 220, 255, ${0.7 + glow * 0.3})`;
  ctx.fillText("cube", w / 2, h * 0.66);
  ctx.shadowBlur = 0;
}
