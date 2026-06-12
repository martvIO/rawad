// HTTP function that generates a CRISP 1200×630 Open Graph image for a digital
// wedding invitation — the design's real background photo, with the couple's
// names + date + venue written over it in elegant Arabic (Amiri), and only a
// light scrim + text shadow behind the text so the photo stays clear and the
// words stay legible on WhatsApp.
//
// Hosting rewrite (firebase.json):  { "source": "/og/**", "function": "digitalOgImage" }
// Referenced by <meta property="og:image"> in digitalInvitePreview.ts.
import { onRequest } from "firebase-functions/v2/https";
import { getDatabase } from "firebase-admin/database";
import { createCanvas, loadImage, GlobalFonts } from "@napi-rs/canvas";
import * as fs from "fs";
import * as path from "path";
import { TOKEN_HEX_RE } from "./constants/tokens";

const W = 1200;
const H = 630;

// Accent (gold/rose/…) per the design's themeColor — mirrors digitalThemes.
// Light-palette accents use a slightly brightened tone so they stay legible on
// the dark photo scrim of the OG card.
const ACCENTS: Record<string, string> = {
  gold: "#d8bd63", rose: "#e3a6b3", blue: "#82c0e6", emerald: "#6fcb9c", white: "#ece5d2",
  champagne: "#d4b483", blush: "#e6b3aa", sage: "#a3ad82", dustyblue: "#9bb0c8", lavender: "#b3a3cc",
  pearl: "#bdb3a0", peach: "#e8b193", mint: "#84c4aa", mauve: "#c39bb3", ivorygold: "#ddc488",
};

type Localized = string | { ar?: string; he?: string } | undefined | null;
interface DesignLike {
  brideName?: Localized;
  groomDisplayName?: Localized;
  venue?: Localized;
  venueCity?: Localized;
  weddingDate?: number | null;
  themeColor?: string;
  media?: Array<{ url?: string; kind?: string }>;
  backgroundUrl?: string;
}

function localize(v: Localized, lang = "ar"): string {
  if (v == null) return "";
  if (typeof v === "string") return v;
  return (v[lang as "ar" | "he"] || v.ar || v.he || "").toString();
}

// Register Amiri once per cold start.
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

// Draw an image as object-fit: cover into WxH.
function drawCover(
  ctx: ReturnType<ReturnType<typeof createCanvas>["getContext"]>,
  img: Awaited<ReturnType<typeof loadImage>>,
): void {
  const ir = img.width / img.height;
  const cr = W / H;
  let dw: number, dh: number, dx: number, dy: number;
  if (ir > cr) { dh = H; dw = H * ir; dx = (W - dw) / 2; dy = 0; }
  else { dw = W; dh = W / ir; dx = 0; dy = (H - dh) / 2; }
  ctx.drawImage(img, dx, dy, dw, dh);
}

/**
 * Render the OG card to a JPEG buffer. Exported so the layout can be rendered
 * and inspected locally without deploying.
 *
 * @param design     the invite's design snapshot (couple/date/venue/photo)
 * @param guestName  the per-link guest name, drawn over the card so the
 *                   WhatsApp preview is personalised to whoever received it.
 */
async function renderOgImage(design: DesignLike | null, guestName = ""): Promise<Buffer> {
  ensureFonts();
  const lang = "ar";
  const groom = localize(design?.groomDisplayName, lang);
  const bride = localize(design?.brideName, lang);
  const couple = [groom, bride].filter(Boolean).join("   و   ") || "بطاقة دعوة زفاف";
  const venue = [localize(design?.venue, lang), localize(design?.venueCity, lang)].filter(Boolean).join("  ·  ");
  const accent = ACCENTS[design?.themeColor || "gold"] || ACCENTS.gold;
  const dateText = design?.weddingDate
    ? new Date(design.weddingDate).toLocaleDateString("ar-EG", { day: "numeric", month: "long", year: "numeric", numberingSystem: "latn" })
    : "";
  const media = Array.isArray(design?.media) ? design!.media! : [];
  const bgUrl = (media.find((m) => m && m.kind !== "video" && m.url) || {}).url || design?.backgroundUrl || "";

  const canvas = createCanvas(W, H);
  const ctx = canvas.getContext("2d");

  // 1) Background — the real photo, full bleed and clear.
  ctx.fillStyle = "#0b0b0f";
  ctx.fillRect(0, 0, W, H);
  if (bgUrl) {
    try {
      const r = await fetch(bgUrl);
      if (r.ok) drawCover(ctx, await loadImage(Buffer.from(await r.arrayBuffer())));
    } catch { /* keep solid background */ }
  }

  // 2) Light scrim ONLY toward the bottom (behind the text) — keeps the photo clear.
  const g = ctx.createLinearGradient(0, H * 0.42, 0, H);
  g.addColorStop(0, "rgba(8,8,12,0)");
  g.addColorStop(0.55, "rgba(8,8,12,0.45)");
  g.addColorStop(1, "rgba(8,8,12,0.80)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);

  // 3) Thin gold frame.
  ctx.strokeStyle = accent;
  ctx.globalAlpha = 0.55;
  ctx.lineWidth = 2.5;
  ctx.strokeRect(26, 26, W - 52, H - 52);
  ctx.globalAlpha = 1;

  // 4) Text — RTL, centered, sitting over the bottom scrim, with shadows.
  ctx.direction = "rtl";
  ctx.textAlign = "center";
  const cx = W / 2;
  const guest = (guestName || "").toString().trim();
  const detailsLine = [dateText, venue].filter(Boolean).join("   ·   ");

  // Auto-shrink a font so `text` fits within `maxW`.
  const fit = (text: string, family: string, start: number, min: number, maxW: number): number => {
    let s = start;
    ctx.font = `${s}px "${family}"`;
    while (ctx.measureText(text).width > maxW && s > min) { s -= 3; ctx.font = `${s}px "${family}"`; }
    return s;
  };

  ctx.shadowColor = "rgba(0,0,0,0.65)";
  ctx.shadowBlur = 16;
  ctx.shadowOffsetY = 3;

  // eyebrow
  ctx.font = '30px "Amiri"';
  ctx.fillStyle = accent;
  ctx.fillText("يتشرّفون بدعوتكم", cx, H * 0.50);

  // couple names — the hero line (auto-shrink to fit)
  fit(couple, "AmiriBold", 92, 44, W - 180);
  ctx.shadowBlur = 22;
  ctx.fillStyle = "#fbf4e0";
  ctx.fillText(couple, cx, H * 0.66);

  // guest name — personalised per link
  if (guest) {
    const gtext = `إلى: ${guest}`;
    fit(gtext, "AmiriBold", 40, 24, W - 220);
    ctx.shadowBlur = 14;
    ctx.fillStyle = accent;
    ctx.fillText(gtext, cx, H * 0.79);
  }

  // date · venue
  if (detailsLine) {
    fit(detailsLine, "Amiri", 30, 18, W - 160);
    ctx.shadowBlur = 12;
    ctx.fillStyle = "rgba(243,234,210,0.92)";
    ctx.fillText(detailsLine, cx, guest ? H * 0.89 : H * 0.83);
  }

  ctx.shadowColor = "transparent";
  ctx.shadowBlur = 0;
  ctx.shadowOffsetY = 0;

  return canvas.encode("jpeg", 90);
}

export const digitalOgImage = onRequest(
  { region: "us-central1", memory: "512MiB", timeoutSeconds: 30 },
  async (req, res) => {
    try {
      // Path shape: /og/{token}.jpg  (or /og/{token})
      const last = (req.path.split("/").filter(Boolean).pop() || "").replace(/\.(jpe?g|png)$/i, "");
      let design: DesignLike | null = null;
      let guestName = "";
      if (last && TOKEN_HEX_RE.test(last)) {
        const snap = await getDatabase().ref(`inviteTokens/${last}`).get();
        if (snap.exists()) {
          const tk = snap.val() as { designSnapshot?: DesignLike; guestName?: string };
          design = (tk?.designSnapshot ?? null) as DesignLike | null;
          guestName = (tk?.guestName ?? "").toString();
        }
      }
      const buf = await renderOgImage(design, guestName);
      res.set("Content-Type", "image/jpeg");
      res.set("Cache-Control", "public, max-age=86400, s-maxage=604800");
      res.status(200).send(buf);
    } catch (e) {
      console.error("[digitalOgImage]", e);
      res.status(500).send("og image error");
    }
  },
);
