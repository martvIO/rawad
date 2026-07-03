// HTTP function that serves the SPA's index.html with dynamic Open Graph tags
// injected for /d/:groomUsername/:token URLs. WhatsApp scrapes OG tags from
// the initial HTML response, so SPAs need a server-side wrapper to get a
// large per-link preview.
//
// Hosting rewrite in firebase.json:
//   { "source": "/d/**", "function": "digitalInvitePreview" }
//
// The function loads the built dist/index.html (bundled with the function via
// functions/.dist), replaces the <!--OG_TAGS--> ... <!--/OG_TAGS--> block,
// and returns the HTML. JS hydrates as normal afterwards.
import { onRequest } from "firebase-functions/v2/https";
import { getDatabase } from "firebase-admin/database";
import { getFirestore } from "firebase-admin/firestore";
import * as fs from "fs";
import * as path from "path";
import { TOKEN_HEX_RE } from "./constants/tokens";

const OG_BLOCK_RE = /<!--OG_TAGS-->[\s\S]*?<!--\/OG_TAGS-->/;

// How long a live-fetched index.html stays fresh in module memory. Assets only
// change on deploy, so a few minutes keeps crawler bursts cheap while still
// picking up a new bundle hash shortly after a hosting deploy.
const HTML_CACHE_TTL_MS = 5 * 60 * 1000;
// Abort the live fetch quickly so a hosting hiccup never hangs WhatsApp's
// crawler — we fall back to the bundled copy instead.
const FETCH_TIMEOUT_MS = 2000;

// Bundled-copy cache (read once per cold start). This is only the cold-start /
// offline fallback now; the live fetch in loadIndexHtml() is the source of truth.
let bundledHtml: string | null = null;
function loadBundledHtml(): string {
  if (bundledHtml) return bundledHtml;
  // build-functions.cjs copies dist/index.html → functions/lib/index.html
  // alongside the compiled JS, so __dirname/index.html is the canonical path.
  const candidates = [
    path.resolve(__dirname, "index.html"),
    path.resolve(__dirname, "..", "index.html"),
    path.resolve(process.cwd(), "lib", "index.html"),
    path.resolve(process.cwd(), "..", "dist", "index.html"),
  ];
  for (const c of candidates) {
    try {
      const txt = fs.readFileSync(c, "utf8");
      bundledHtml = txt;
      return txt;
    } catch { /* try next */ }
  }
  throw new Error("index.html template not found");
}

// Live-fetched index.html cache, keyed by the source URL so emulator + prod
// never share a stale entry across (unlikely) co-located warm instances.
let liveHtml: { key: string; html: string; fetchedAt: number } | null = null;

// Serve the CURRENTLY-DEPLOYED index.html so the returned page always points at
// asset hashes that actually exist in hosting — immune to deploy-order drift and
// hosting-only deploys (the original cause of the stale-bundle MIME error).
//
// `/index.html` is a static hosting file: Hosting serves static files before
// rewrites, and the `/d/**` rewrite only matches `/d/...`, so fetching it never
// re-enters this function. On any failure we fall back to the bundled copy.
async function loadIndexHtml(url: string): Promise<string> {
  if (liveHtml && liveHtml.key === url && Date.now() - liveHtml.fetchedAt < HTML_CACHE_TTL_MS) {
    return liveHtml.html;
  }
  if (url) {
    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), FETCH_TIMEOUT_MS);
    try {
      const r = await fetch(url, { signal: ac.signal });
      if (r.ok) {
        const html = await r.text();
        // Only trust a response that is actually the SPA shell (has the OG block
        // to replace) — guards against an error page slipping through.
        if (OG_BLOCK_RE.test(html)) {
          liveHtml = { key: url, html, fetchedAt: Date.now() };
          return html;
        }
      }
      console.log(`[digitalInvitePreview] live index.html unusable (status ${r.status}) from ${url} — using bundled fallback`);
    } catch (e) {
      console.log(`[digitalInvitePreview] live index.html fetch failed (${(e as Error).message}) from ${url} — using bundled fallback`);
    } finally {
      clearTimeout(timer);
    }
  }
  return loadBundledHtml();
}

// Resolve the public hosting origin for the live index.html fetch. Behind the
// Firebase Hosting → Functions proxy the `Host` header is the function's own
// host, not the site — the original site host is in `x-forwarded-host`. Fall
// back to the project's default *.web.app domain (always serves the current
// deploy) so the fetch works even if neither header is trustworthy.
function resolveIndexUrl(req: { get(name: string): string | undefined }): string {
  // x-forwarded-* can be comma-joined across proxy hops — take the first hop.
  const first = (v?: string) => (v ? v.split(",")[0].trim() : "");
  const xfHost = first(req.get("x-forwarded-host"));
  const hostHdr = req.get("host") || "";
  const projectHost = process.env.GCLOUD_PROJECT ? `${process.env.GCLOUD_PROJECT}.web.app` : "";
  const host = xfHost || hostHdr || projectHost;
  if (!host) return "";
  const isLocal = /^(localhost|127\.0\.0\.1|\[::1\])/i.test(host);
  const proto = first(req.get("x-forwarded-proto")) || (isLocal ? "http" : "https");
  return `${proto}://${host}/index.html`;
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c] as string));
}

// Design text fields are stored bilingually as { ar, he }; resolve to a string
// (Arabic preferred) so the OG description isn't "[object Object]".
type Localized = string | { ar?: string; he?: string } | undefined | null;
function loc(v: Localized): string {
  if (v == null) return "";
  if (typeof v === "string") return v;
  return (v.ar || v.he || "").toString();
}
function formatDate(ms?: number | null): string {
  if (!ms) return "";
  try {
    return new Date(ms).toLocaleDateString("ar-EG", {
      day: "numeric", month: "long", year: "numeric", numberingSystem: "latn",
    } as Intl.DateTimeFormatOptions);
  } catch { return ""; }
}

interface OgInputs {
  guestName: string;
  brideName?: string;
  groomDisplayName?: string;
  dateText?: string;
  shareMessage?: string;
  imageUrl?: string;
  url: string;
  isPhysical?: boolean;
}

function buildOgTags(inputs: OgInputs): string {
  const title = inputs.guestName
    ? `دعوة — ${inputs.guestName}`
    : "دعوة";
  let description: string;
  if (inputs.isPhysical) {
    // Physical / handwritten invite link — describe the platform in the OG
    // description, not the couple names + date (title + image stay the same).
    description = "منصة دعوة لتوصيل مكاتيب للمناسبات";
  } else {
    // The groom-authored `shareMessage` (design field) wins; otherwise fall back
    // to the couple-names line. The wedding date is auto-appended in both cases.
    const couple = [inputs.groomDisplayName, inputs.brideName].filter(Boolean).join(" & ");
    const custom = (inputs.shareMessage || "").trim();
    description = custom
      || (couple ? `${couple} يتشرّفون بدعوتكم لحضور حفل زفافهم` : "تفضّل بفتح بطاقة الدعوة الرقمية");
    if (inputs.dateText) description += ` — ${inputs.dateText}`;
  }
  const tags: string[] = [
    `<meta property="og:type" content="website" />`,
    `<meta property="og:title" content="${escapeHtml(title)}" />`,
    `<meta property="og:description" content="${escapeHtml(description)}" />`,
    `<meta property="og:url" content="${escapeHtml(inputs.url)}" />`,
    `<meta name="twitter:card" content="summary_large_image" />`,
  ];
  if (inputs.imageUrl) {
    tags.push(`<meta property="og:image" content="${escapeHtml(inputs.imageUrl)}" />`);
    tags.push(`<meta property="og:image:type" content="image/jpeg" />`);
    tags.push(`<meta property="og:image:width" content="1200" />`);
    tags.push(`<meta property="og:image:height" content="630" />`);
    tags.push(`<meta name="twitter:image" content="${escapeHtml(inputs.imageUrl)}" />`);
  }
  return `<!--OG_TAGS-->\n${tags.join("\n")}\n<!--/OG_TAGS-->`;
}

export const digitalInvitePreview = onRequest(
  { region: "us-central1" },
  async (req, res) => {
    // Path shapes: /d/{groomUsername}/{token}[/...]  |  /invite/{token}  |
    // /invite/digital/{token}. Take the last hex-looking segment so one handler
    // serves every guest-link form (digital invitation + physical invite link).
    const parts = req.path.split("/").filter(Boolean);
    const token = [...parts].reverse().find((s) => TOKEN_HEX_RE.test(s)) || "";
    const fullUrl = `https://${req.hostname}${req.path}`;
    // Public origin (e.g. https://dawa.to) for building the OG-image URL.
    const origin = resolveIndexUrl(req).replace(/\/index\.html$/, "");

    let inputs: OgInputs = { guestName: "", url: fullUrl };

    try {
      if (token && TOKEN_HEX_RE.test(token)) {
        const db = getDatabase();
        const snap = await db.ref(`inviteTokens/${token}`).get();
        if (snap.exists()) {
          type DesignLike = {
            media?: Array<{ url?: string; kind?: string }>;
            backgroundUrl?: string;
            brideName?: Localized;
            groomDisplayName?: Localized;
            weddingDate?: number | null;
            shareMessage?: Localized;
          };
          const tk = snap.val() as {
            groomUid?: string;
            guestName?: string;
            guestType?: string;
            designId?: string;
            designSnapshot?: DesignLike;
          };
          inputs.guestName = tk.guestName || "";
          // Physical/handwritten tokens carry no `guestType: "digital"`. Flag
          // them so the OG description becomes the platform line (title + image
          // are unchanged). Digital links keep the couple + date description.
          inputs.isPhysical = tk.guestType !== "digital";
          // The OG image is generated on the fly by the digitalOgImage function
          // (the design's photo + the couple names/date/venue drawn over it).
          if (origin && token) inputs.imageUrl = `${origin}/og/${token}.jpg`;
          if (tk.groomUid) {
            // Prefer the token's embedded snapshot (what the guest actually
            // sees). Fall back to the assigned/default design doc for any legacy
            // token that predates snapshots, or the parent doc for un-migrated grooms.
            let d: DesignLike | undefined = tk.designSnapshot;
            if (!d) {
              const fs = getFirestore();
              const parentSnap = await fs.doc(`digitalInvitations/${tk.groomUid}`).get();
              const parent = (parentSnap.exists ? parentSnap.data() : {}) as Record<string, unknown>;
              const did = (tk.designId as string) || (parent.defaultDesignId as string) || "";
              if (did) {
                const dSnap = await fs.doc(`digitalInvitations/${tk.groomUid}/designs/${did}`).get();
                if (dSnap.exists) d = dSnap.data() as DesignLike;
              } else {
                d = parent as DesignLike;
              }
            }
            if (d) {
              inputs.brideName        = loc(d.brideName);
              inputs.groomDisplayName = loc(d.groomDisplayName);
              inputs.dateText         = formatDate(d.weddingDate);
              inputs.shareMessage     = loc(d.shareMessage);
              // (Background photo is fetched inside the OG-image generator.)
            }
          }
        }
      }
    } catch {
      // Fall through with whatever we have — never block the page on metadata errors.
    }

    let html: string;
    try {
      html = await loadIndexHtml(resolveIndexUrl(req));
    } catch {
      res.status(500).send("template not found");
      return;
    }

    const ogBlock = buildOgTags(inputs);
    const rendered = html.replace(OG_BLOCK_RE, ogBlock);

    res.set("Cache-Control", "public, max-age=300, s-maxage=600");
    res.set("Content-Type", "text/html; charset=utf-8");
    res.status(200).send(rendered);
  },
);
