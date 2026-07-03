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
import { getFirestore } from "firebase-admin/firestore";
import { getStorage } from "firebase-admin/storage";
import { createHash } from "crypto";
import type { Response } from "express";
import type { SKRSContext2D, Image } from "@napi-rs/canvas";
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

// "#d8bd63" + alpha → "rgba(r,g,b,a)" for canvas gradients/glows.
function hexA(hex: string, a: number): string {
  const h = (hex || "").replace("#", "");
  const n = h.length === 3 ? h.split("").map((c) => c + c).join("") : h;
  const r = parseInt(n.slice(0, 2), 16) || 0;
  const g = parseInt(n.slice(2, 4), 16) || 0;
  const b = parseInt(n.slice(4, 6), 16) || 0;
  return `rgba(${r},${g},${b},${a})`;
}

// Register Amiri once per cold start. GlobalFonts is passed in from the lazy
// canvas import so this module never loads the native binary just to declare it.
type GlobalFontsLike = { registerFromPath(path: string, nameAlias?: string): unknown };
let fontsReady = false;
function ensureFonts(GlobalFonts: GlobalFontsLike): void {
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
  ctx: SKRSContext2D,
  img: Image,
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
export async function renderOgImage(design: DesignLike | null, guestName = ""): Promise<Buffer> {
  // Lazy-load the heavy Skia/canvas native binary ONLY when we actually render.
  // The hot path (serving a pre-rendered cache hit) never touches it, so a cold
  // start that just streams the cached JPEG stays fast — which is what keeps the
  // WhatsApp link-preview crawler inside its few-second fetch budget.
  const { createCanvas, loadImage, GlobalFonts } = await import("@napi-rs/canvas");
  ensureFonts(GlobalFonts);
  const lang = "ar";
  const groom = localize(design?.groomDisplayName, lang);
  const bride = localize(design?.brideName, lang);
  const couple = [groom, bride].filter(Boolean).join("   &   ") || "بطاقة دعوة زفاف";
  const venue = [localize(design?.venue, lang), localize(design?.venueCity, lang)].filter(Boolean).join("  ·  ");
  const accent = ACCENTS[design?.themeColor || "gold"] || ACCENTS.gold;
  const dateText = design?.weddingDate
    ? new Date(design.weddingDate).toLocaleDateString("ar-EG", { day: "numeric", month: "long", year: "numeric", numberingSystem: "latn" })
    : "";
  const media = Array.isArray(design?.media) ? design!.media! : [];
  const bgUrl = (media.find((m) => m && m.kind !== "video" && m.url) || {}).url || design?.backgroundUrl || "";

  const canvas = createCanvas(W, H);
  const ctx = canvas.getContext("2d");

  // 1) Background. With a photo: full-bleed photo. Without one (photo-less
  // designs + physical invites): an elegant branded gradient with a soft gold
  // glow so the card still looks luxurious.
  let drewPhoto = false;
  if (bgUrl) {
    ctx.fillStyle = "#0b0b0f";
    ctx.fillRect(0, 0, W, H);
    try {
      const r = await fetch(bgUrl);
      if (r.ok) { drawCover(ctx, await loadImage(Buffer.from(await r.arrayBuffer()))); drewPhoto = true; }
    } catch { /* fall through to the branded background */ }
  }
  if (!drewPhoto) {
    const base = ctx.createLinearGradient(0, 0, 0, H);
    base.addColorStop(0, "#13111b");
    base.addColorStop(0.5, "#0c0b12");
    base.addColorStop(1, "#070709");
    ctx.fillStyle = base;
    ctx.fillRect(0, 0, W, H);
    const glow = ctx.createRadialGradient(W / 2, H * 0.6, 40, W / 2, H * 0.6, W * 0.62);
    glow.addColorStop(0, hexA(accent, 0.18));
    glow.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, W, H);
  }

  // 2) Light scrim toward the bottom (behind the text) — only over a photo.
  if (drewPhoto) {
    const g = ctx.createLinearGradient(0, H * 0.42, 0, H);
    g.addColorStop(0, "rgba(8,8,12,0)");
    g.addColorStop(0.55, "rgba(8,8,12,0.45)");
    g.addColorStop(1, "rgba(8,8,12,0.80)");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
  }

  // 3) Thin gold frame.
  ctx.strokeStyle = accent;
  ctx.globalAlpha = 0.55;
  ctx.lineWidth = 2.5;
  ctx.strokeRect(26, 26, W - 52, H - 52);
  ctx.globalAlpha = 1;

  ctx.direction = "rtl";
  ctx.textAlign = "center";
  const cx = W / 2;

  // 3b) Brand wordmark — "دعوة" at the top with a thin flourish, on every card.
  ctx.shadowColor = "rgba(0,0,0,0.6)";
  ctx.shadowBlur = 14;
  ctx.shadowOffsetY = 2;
  ctx.font = '56px "AmiriBold"';
  ctx.fillStyle = accent;
  ctx.fillText("دعوة", cx, H * 0.17);
  ctx.shadowColor = "transparent";
  ctx.shadowBlur = 0;
  ctx.shadowOffsetY = 0;
  ctx.globalAlpha = 0.7;
  ctx.strokeStyle = accent;
  ctx.lineWidth = 1.4;
  ctx.beginPath();
  ctx.moveTo(cx - 120, H * 0.205);
  ctx.lineTo(cx - 16, H * 0.205);
  ctx.moveTo(cx + 16, H * 0.205);
  ctx.lineTo(cx + 120, H * 0.205);
  ctx.stroke();
  ctx.globalAlpha = 1;
  ctx.save();
  ctx.translate(cx, H * 0.205);
  ctx.rotate(Math.PI / 4);
  ctx.fillStyle = accent;
  ctx.fillRect(-4, -4, 8, 8);
  ctx.restore();

  // 3c) Central monogram ornament — only when there's no photo (fills the gap).
  if (!drewPhoto) {
    const oy = H * 0.355;
    ctx.strokeStyle = accent;
    ctx.lineWidth = 2;
    ctx.globalAlpha = 0.8;
    ctx.beginPath(); ctx.arc(cx, oy, 50, 0, Math.PI * 2); ctx.stroke();
    ctx.globalAlpha = 0.3;
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.arc(cx, oy, 58, 0, Math.PI * 2); ctx.stroke();
    ctx.globalAlpha = 1;
    // Small heart, drawn with paths (Amiri has no ♥ glyph).
    ctx.fillStyle = accent;
    const hs = 17;
    const hy = oy - 5;
    ctx.beginPath();
    ctx.moveTo(cx, hy + hs * 0.28);
    ctx.bezierCurveTo(cx - hs, hy - hs * 0.32, cx - hs, hy + hs * 0.62, cx, hy + hs);
    ctx.bezierCurveTo(cx + hs, hy + hs * 0.62, cx + hs, hy - hs * 0.32, cx, hy + hs * 0.28);
    ctx.closePath();
    ctx.fill();
  }

  // 4) Text — RTL, centered, with shadows for legibility over any background.
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

// ─── Persistent Storage cache ────────────────────────────────────────────────
// Pre-rendered OG images live at og-cache/{token}.jpg. They are written by the
// inviteTokens onCreate trigger (cacheInviteOgImage) the moment a link is minted
// — so the image is a ready static object BEFORE the link is ever shared — and
// re-written here on any cache miss. A bucket lifecycle rule deletes them ~14
// days after creation (backend/scripts/set-og-cache-lifecycle.cjs); a later
// share simply re-renders + re-caches on the miss below.
const OG_CACHE_PREFIX = "og-cache/";
const ogCachePath = (token: string): string => `${OG_CACHE_PREFIX}${token}.jpg`;

async function readOgCache(token: string): Promise<Buffer | null> {
  try {
    const file = getStorage().bucket().file(ogCachePath(token));
    const [exists] = await file.exists();
    if (!exists) return null;
    const [buf] = await file.download();
    return buf;
  } catch (e) {
    console.warn("[digitalOgImage] cache read failed", token, e);
    return null;
  }
}

async function writeOgCache(token: string, buf: Buffer): Promise<void> {
  try {
    await getStorage().bucket().file(ogCachePath(token)).save(buf, {
      contentType: "image/jpeg",
      resumable: false,
      metadata: { cacheControl: "public, max-age=86400" },
    });
  } catch (e) {
    console.warn("[digitalOgImage] cache write failed", token, e);
  }
}

// Resolve the design + guest name a token's OG card renders from. Digital tokens
// carry an immutable designSnapshot; physical/legacy tokens fall back to the
// groom's (assigned/default) design so the couple names still appear.
async function loadDesignForToken(
  token: string,
): Promise<{ design: DesignLike | null; guestName: string }> {
  const snap = await getDatabase().ref(`inviteTokens/${token}`).get();
  if (!snap.exists()) return { design: null, guestName: "" };
  const tk = snap.val() as {
    designSnapshot?: DesignLike;
    guestName?: string;
    groomUid?: string;
    designId?: string;
  };
  const guestName = (tk?.guestName ?? "").toString();
  let design = (tk?.designSnapshot ?? null) as DesignLike | null;
  if (!design && tk?.groomUid) {
    try {
      const fsdb = getFirestore();
      const parentSnap = await fsdb.doc(`digitalInvitations/${tk.groomUid}`).get();
      const parent = (parentSnap.exists ? parentSnap.data() : {}) as Record<string, unknown>;
      const did = (tk.designId as string) || (parent.defaultDesignId as string) || "";
      if (did) {
        const dSnap = await fsdb.doc(`digitalInvitations/${tk.groomUid}/designs/${did}`).get();
        if (dSnap.exists) design = dSnap.data() as DesignLike;
      } else if (parentSnap.exists) {
        design = parent as DesignLike;
      }
    } catch { /* no design — render the branded card without couple names */ }
  }
  return { design, guestName };
}

/**
 * Render a token's OG card AND persist it to og-cache/{token}.jpg. Called by the
 * onCreate trigger (pre-generate at mint) and as the cache-miss path below.
 */
export async function renderAndCacheOgForToken(token: string): Promise<Buffer> {
  const { design, guestName } = await loadDesignForToken(token);
  const buf = await renderOgImage(design, guestName);
  await writeOgCache(token, buf);
  return buf;
}

// Send a JPEG with caching + a content-hash ETag, so a stale/failed CDN entry
// can be conditionally revalidated (304) instead of pinned for the full s-maxage.
function sendJpeg(
  req: { get(name: string): string | undefined },
  res: Response,
  buf: Buffer,
): void {
  const etag = `"${createHash("sha1").update(buf).digest("hex")}"`;
  res.set("Content-Type", "image/jpeg");
  res.set("Cache-Control", "public, max-age=86400, s-maxage=604800");
  res.set("ETag", etag);
  if ((req.get("if-none-match") || "") === etag) {
    res.status(304).end();
    return;
  }
  res.status(200).send(buf);
}

export const digitalOgImage = onRequest(
  // 1 GiB → more vCPU, so the cache-miss render + cold start are as fast as
  // possible; maxInstances caps the cost blast-radius (mirrors `api`).
  { region: "us-central1", memory: "1GiB", timeoutSeconds: 30, maxInstances: 10 },
  async (req, res) => {
    try {
      // Path shape: /og/{token}.jpg  (or /og/{token})
      const last = (req.path.split("/").filter(Boolean).pop() || "").replace(/\.(jpe?g|png)$/i, "");
      if (last && TOKEN_HEX_RE.test(last)) {
        // Fast path: stream the pre-rendered cache (the lazy canvas binary is
        // never even loaded), so a cold start here is sub-second.
        const cached = await readOgCache(last);
        if (cached) { sendJpeg(req, res, cached); return; }
        // Miss — the trigger hasn't finished yet, it's a physical/legacy token,
        // or the 14-day entry expired: render on demand and re-populate.
        const buf = await renderAndCacheOgForToken(last);
        sendJpeg(req, res, buf);
        return;
      }
      // No / malformed token — branded fallback card (not worth caching).
      const buf = await renderOgImage(null, "");
      sendJpeg(req, res, buf);
    } catch (e) {
      console.error("[digitalOgImage]", e);
      res.status(500).send("og image error");
    }
  },
);
