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

interface OgInputs {
  guestName: string;
  brideName?: string;
  groomDisplayName?: string;
  imageUrl?: string;
  url: string;
}

function buildOgTags(inputs: OgInputs): string {
  const title = inputs.guestName
    ? `دعوة زفاف — ${inputs.guestName}`
    : "دعوة زفاف";
  const couple = [inputs.groomDisplayName, inputs.brideName].filter(Boolean).join(" و ");
  const description = couple
    ? `${couple} يدعونكم لحضور زفافهم`
    : "تفضّل بفتح بطاقة الدعوة الرقمية";
  const tags: string[] = [
    `<meta property="og:type" content="website" />`,
    `<meta property="og:title" content="${escapeHtml(title)}" />`,
    `<meta property="og:description" content="${escapeHtml(description)}" />`,
    `<meta property="og:url" content="${escapeHtml(inputs.url)}" />`,
    `<meta name="twitter:card" content="summary_large_image" />`,
  ];
  if (inputs.imageUrl) {
    tags.push(`<meta property="og:image" content="${escapeHtml(inputs.imageUrl)}" />`);
    tags.push(`<meta property="og:image:width" content="1200" />`);
    tags.push(`<meta property="og:image:height" content="630" />`);
    tags.push(`<meta name="twitter:image" content="${escapeHtml(inputs.imageUrl)}" />`);
  }
  return `<!--OG_TAGS-->\n${tags.join("\n")}\n<!--/OG_TAGS-->`;
}

export const digitalInvitePreview = onRequest(
  { region: "us-central1" },
  async (req, res) => {
    // Path shape: /d/{groomUsername}/{token}[/...]
    const parts = req.path.split("/").filter(Boolean);   // ["d", "groom", "token", ...]
    const token = parts[2] || "";
    const fullUrl = `https://${req.hostname}${req.path}`;

    let inputs: OgInputs = { guestName: "", url: fullUrl };

    try {
      if (token && TOKEN_HEX_RE.test(token)) {
        const db = getDatabase();
        const snap = await db.ref(`inviteTokens/${token}`).get();
        if (snap.exists()) {
          const tk = snap.val() as { groomUid?: string; guestName?: string };
          inputs.guestName = tk.guestName || "";
          if (tk.groomUid) {
            const fs = getFirestore();
            const docSnap = await fs.doc(`digitalInvitations/${tk.groomUid}`).get();
            if (docSnap.exists) {
              const d = docSnap.data() as {
                media?: Array<{ url?: string; kind?: string }>;
                backgroundUrl?: string;
                brideName?: string;
                groomDisplayName?: string;
              };
              inputs.brideName        = d.brideName;
              inputs.groomDisplayName = d.groomDisplayName;
              const firstImage = (d.media || []).find(m => m.kind !== "video" && m.url)?.url
                              || d.backgroundUrl;
              if (firstImage) inputs.imageUrl = firstImage;
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
