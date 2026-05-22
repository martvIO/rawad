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

// Cached HTML template (read once per cold start).
let cachedHtml: string | null = null;
function loadIndexHtml(): string {
  if (cachedHtml) return cachedHtml;
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
      cachedHtml = txt;
      return txt;
    } catch { /* try next */ }
  }
  throw new Error("index.html template not found");
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
      html = loadIndexHtml();
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
