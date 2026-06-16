// Themed monogram PNG for wallet passes — the couple's monogram (or initials)
// drawn in the design accent on the design background. Used as the Google
// Wallet logo (served by GET /invites/pass/:token/logo.png) and, later, as the
// Apple .pkpass icon/logo images. Reuses the @napi-rs/canvas + Amiri font setup
// from digitalOgImage.ts.
import { createCanvas, GlobalFonts } from "@napi-rs/canvas";
import * as fs from "fs";
import * as path from "path";
import { getThemeHex } from "./themeHex";
import { localize } from "./passData";

let fontsReady = false;
function ensureFonts(): void {
  if (fontsReady) return;
  const dirs = [
    path.resolve(__dirname, "..", "assets", "fonts"),
    path.resolve(__dirname, "assets", "fonts"),
    path.resolve(process.cwd(), "assets", "fonts"),
  ];
  for (const dir of dirs) {
    try {
      const bold = path.join(dir, "Amiri-Bold.ttf");
      const reg = path.join(dir, "Amiri-Regular.ttf");
      let found = false;
      if (fs.existsSync(bold)) { GlobalFonts.registerFromPath(bold, "AmiriBold"); found = true; }
      if (fs.existsSync(reg)) { GlobalFonts.registerFromPath(reg, "Amiri"); found = true; }
      if (found) break;
    } catch { /* try next dir */ }
  }
  fontsReady = true;
}

function firstGlyph(s: string): string {
  const t = (s || "").trim();
  return t ? Array.from(t)[0] : "";
}

/** Resolve the monogram glyphs: explicit `monogram`, else groom & bride initials. */
function monogramText(design: Record<string, unknown>): string {
  const explicit = localize(design.monogram as never, "ar").trim();
  if (explicit) return explicit;
  const g = firstGlyph(localize(design.groomDisplayName as never, "ar"));
  const b = firstGlyph(localize(design.brideName as never, "ar"));
  const pair = [g, b].filter(Boolean).join(" & ");
  return pair || "دعوة";
}

/**
 * Render a square monogram-on-color PNG at the given size (px).
 * Solid background + centered accent monogram + a thin accent ring.
 */
export async function renderMonogramPng(design: Record<string, unknown>, size = 660): Promise<Buffer> {
  ensureFonts();
  const theme = getThemeHex(design.themeColor as string | undefined);
  const canvas = createCanvas(size, size);
  const ctx = canvas.getContext("2d");

  // Background
  ctx.fillStyle = theme.bg;
  ctx.fillRect(0, 0, size, size);

  // Thin accent ring
  const pad = size * 0.12;
  ctx.strokeStyle = theme.accent;
  ctx.lineWidth = Math.max(2, size * 0.01);
  ctx.globalAlpha = 0.55;
  ctx.beginPath();
  ctx.arc(size / 2, size / 2, size / 2 - pad, 0, Math.PI * 2);
  ctx.stroke();
  ctx.globalAlpha = 1;

  // Monogram glyphs
  const text = monogramText(design);
  ctx.fillStyle = theme.accent;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.direction = "rtl";
  let fontPx = Math.round(size * (text.length > 3 ? 0.26 : 0.4));
  ctx.font = `${fontPx}px AmiriBold, Amiri, serif`;
  // Shrink to fit if a long monogram overflows the ring.
  const maxW = size - pad * 2.4;
  while (ctx.measureText(text).width > maxW && fontPx > 12) {
    fontPx -= 4;
    ctx.font = `${fontPx}px AmiriBold, Amiri, serif`;
  }
  ctx.fillText(text, size / 2, size / 2 + size * 0.02);

  return canvas.encode("png");
}
// NOTE: canvas.encode returns a Promise<Buffer>, so this function is async.
