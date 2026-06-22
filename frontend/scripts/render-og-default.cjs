// One-off generator for the default Open Graph share card (frontend/public/og-default.png).
//
// This is the MARKETING card for the landing/share URL (brand + tagline) — distinct
// from the per-invite cards the digitalOgImage Cloud Function renders. Run it once and
// commit the PNG; it is NOT part of the build pipeline (the card is static). Re-run after
// editing og-default.svg / this file:
//
//   node frontend/scripts/render-og-default.cjs
//
// Reuses @napi-rs/canvas + the Amiri fonts already vendored in backend/functions (no new
// frontend dependency), resolved by absolute path so it runs from anywhere.

const path = require("path");
const fs = require("fs");

const BACKEND = path.resolve(__dirname, "..", "..", "backend", "functions");
const { createCanvas, GlobalFonts } = require(path.join(BACKEND, "node_modules", "@napi-rs", "canvas"));

const FONT_DIR = path.join(BACKEND, "assets", "fonts");
GlobalFonts.registerFromPath(path.join(FONT_DIR, "Amiri-Bold.ttf"), "AmiriBold");
GlobalFonts.registerFromPath(path.join(FONT_DIR, "Amiri-Regular.ttf"), "Amiri");

const W = 1200, H = 630;
const GOLD = "#d8bd63";

async function main() {
  const canvas = createCanvas(W, H);
  const ctx = canvas.getContext("2d");

  // Background: dark vertical gradient + a soft central gold glow.
  const bg = ctx.createLinearGradient(0, 0, 0, H);
  bg.addColorStop(0, "#0a0a0f");
  bg.addColorStop(1, "#070709");
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);
  const glow = ctx.createRadialGradient(W / 2, H * 0.42, 40, W / 2, H * 0.42, W * 0.6);
  glow.addColorStop(0, "rgba(216,189,99,0.16)");
  glow.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, W, H);

  // Thin gold frame.
  ctx.strokeStyle = GOLD;
  ctx.globalAlpha = 0.45;
  ctx.lineWidth = 2.5;
  ctx.strokeRect(26, 26, W - 52, H - 52);
  ctx.globalAlpha = 1;

  // Seal: two concentric rings + a checkmark (echoes the brand SVG).
  const cx = W / 2, sy = H * 0.30;
  ctx.strokeStyle = GOLD;
  ctx.lineWidth = 3;
  ctx.globalAlpha = 0.9;
  ctx.beginPath(); ctx.arc(cx, sy, 64, 0, Math.PI * 2); ctx.stroke();
  ctx.globalAlpha = 0.4;
  ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.arc(cx, sy, 74, 0, Math.PI * 2); ctx.stroke();
  ctx.globalAlpha = 1;
  ctx.strokeStyle = GOLD;
  ctx.lineWidth = 6;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.beginPath();
  ctx.moveTo(cx - 24, sy + 4);
  ctx.lineTo(cx - 7, sy + 21);
  ctx.lineTo(cx + 26, sy - 18);
  ctx.stroke();

  // Arabic text.
  ctx.direction = "rtl";
  ctx.textAlign = "center";

  // Wordmark.
  ctx.shadowColor = "rgba(0,0,0,0.6)";
  ctx.shadowBlur = 14;
  ctx.shadowOffsetY = 2;
  ctx.font = '120px "AmiriBold"';
  ctx.fillStyle = GOLD;
  ctx.fillText("دعوة", cx, H * 0.62);

  // Tagline + sub-tagline.
  ctx.shadowBlur = 8;
  ctx.font = '34px "Amiri"';
  ctx.fillStyle = "rgba(245,230,184,0.95)";
  ctx.fillText("توزيع مكاتيب الأفراح · دعوات رقمية", cx, H * 0.74);
  ctx.shadowColor = "transparent";
  ctx.shadowBlur = 0;
  ctx.shadowOffsetY = 0;
  ctx.font = '26px "Amiri"';
  ctx.fillStyle = "#8a7a58";
  ctx.fillText("تسليم باليد · إثبات بالصورة · معرض صور بالذكاء الاصطناعي", cx, H * 0.84);

  const png = await canvas.encode("png");
  const out = path.resolve(__dirname, "..", "public", "og-default.png");
  fs.writeFileSync(out, png);
  console.log(`wrote ${out} (${png.length} bytes)`);
}

main().catch((e) => { console.error(e); process.exit(1); });
