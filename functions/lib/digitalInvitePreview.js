"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.digitalInvitePreview = void 0;
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
const https_1 = require("firebase-functions/v2/https");
const database_1 = require("firebase-admin/database");
const firestore_1 = require("firebase-admin/firestore");
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const tokens_1 = require("./constants/tokens");
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
let bundledHtml = null;
function loadBundledHtml() {
    if (bundledHtml)
        return bundledHtml;
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
        }
        catch { /* try next */ }
    }
    throw new Error("index.html template not found");
}
// Live-fetched index.html cache, keyed by the source URL so emulator + prod
// never share a stale entry across (unlikely) co-located warm instances.
let liveHtml = null;
// Serve the CURRENTLY-DEPLOYED index.html so the returned page always points at
// asset hashes that actually exist in hosting — immune to deploy-order drift and
// hosting-only deploys (the original cause of the stale-bundle MIME error).
//
// `/index.html` is a static hosting file: Hosting serves static files before
// rewrites, and the `/d/**` rewrite only matches `/d/...`, so fetching it never
// re-enters this function. On any failure we fall back to the bundled copy.
async function loadIndexHtml(url) {
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
        }
        catch (e) {
            console.log(`[digitalInvitePreview] live index.html fetch failed (${e.message}) from ${url} — using bundled fallback`);
        }
        finally {
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
function resolveIndexUrl(req) {
    // x-forwarded-* can be comma-joined across proxy hops — take the first hop.
    const first = (v) => (v ? v.split(",")[0].trim() : "");
    const xfHost = first(req.get("x-forwarded-host"));
    const hostHdr = req.get("host") || "";
    const projectHost = process.env.GCLOUD_PROJECT ? `${process.env.GCLOUD_PROJECT}.web.app` : "";
    const host = xfHost || hostHdr || projectHost;
    if (!host)
        return "";
    const isLocal = /^(localhost|127\.0\.0\.1|\[::1\])/i.test(host);
    const proto = first(req.get("x-forwarded-proto")) || (isLocal ? "http" : "https");
    return `${proto}://${host}/index.html`;
}
function escapeHtml(s) {
    return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}
function loc(v) {
    if (v == null)
        return "";
    if (typeof v === "string")
        return v;
    return (v.ar || v.he || "").toString();
}
function formatDate(ms) {
    if (!ms)
        return "";
    try {
        return new Date(ms).toLocaleDateString("ar-EG", {
            day: "numeric", month: "long", year: "numeric", numberingSystem: "latn",
        });
    }
    catch {
        return "";
    }
}
function buildOgTags(inputs) {
    const title = inputs.guestName
        ? `دعوة زفاف — ${inputs.guestName}`
        : "دعوة زفاف";
    const couple = [inputs.groomDisplayName, inputs.brideName].filter(Boolean).join(" و ");
    let description = couple
        ? `${couple} يتشرّفون بدعوتكم لحضور حفل زفافهم`
        : "تفضّل بفتح بطاقة الدعوة الرقمية";
    if (inputs.dateText)
        description += ` — ${inputs.dateText}`;
    const tags = [
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
exports.digitalInvitePreview = (0, https_1.onRequest)({ region: "us-central1" }, async (req, res) => {
    // Path shape: /d/{groomUsername}/{token}[/...]
    const parts = req.path.split("/").filter(Boolean); // ["d", "groom", "token", ...]
    const token = parts[2] || "";
    const fullUrl = `https://${req.hostname}${req.path}`;
    // Public origin (e.g. https://dawa.to) for building the OG-image URL.
    const origin = resolveIndexUrl(req).replace(/\/index\.html$/, "");
    let inputs = { guestName: "", url: fullUrl };
    try {
        if (token && tokens_1.TOKEN_HEX_RE.test(token)) {
            const db = (0, database_1.getDatabase)();
            const snap = await db.ref(`inviteTokens/${token}`).get();
            if (snap.exists()) {
                const tk = snap.val();
                inputs.guestName = tk.guestName || "";
                // The OG image is generated on the fly by the digitalOgImage function
                // (the design's photo + the couple names/date/venue drawn over it).
                if (origin && token)
                    inputs.imageUrl = `${origin}/og/${token}.jpg`;
                if (tk.groomUid) {
                    // Prefer the token's embedded snapshot (what the guest actually
                    // sees). Fall back to the assigned/default design doc for any legacy
                    // token that predates snapshots, or the parent doc for un-migrated grooms.
                    let d = tk.designSnapshot;
                    if (!d) {
                        const fs = (0, firestore_1.getFirestore)();
                        const parentSnap = await fs.doc(`digitalInvitations/${tk.groomUid}`).get();
                        const parent = (parentSnap.exists ? parentSnap.data() : {});
                        const did = tk.designId || parent.defaultDesignId || "";
                        if (did) {
                            const dSnap = await fs.doc(`digitalInvitations/${tk.groomUid}/designs/${did}`).get();
                            if (dSnap.exists)
                                d = dSnap.data();
                        }
                        else {
                            d = parent;
                        }
                    }
                    if (d) {
                        inputs.brideName = loc(d.brideName);
                        inputs.groomDisplayName = loc(d.groomDisplayName);
                        inputs.dateText = formatDate(d.weddingDate);
                        // (Background photo is fetched inside the OG-image generator.)
                    }
                }
            }
        }
    }
    catch {
        // Fall through with whatever we have — never block the page on metadata errors.
    }
    let html;
    try {
        html = await loadIndexHtml(resolveIndexUrl(req));
    }
    catch {
        res.status(500).send("template not found");
        return;
    }
    const ogBlock = buildOgTags(inputs);
    const rendered = html.replace(OG_BLOCK_RE, ogBlock);
    res.set("Cache-Control", "public, max-age=300, s-maxage=600");
    res.set("Content-Type", "text/html; charset=utf-8");
    res.status(200).send(rendered);
});
//# sourceMappingURL=digitalInvitePreview.js.map