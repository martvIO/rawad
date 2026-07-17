// Lazily injects the EXTENDED Arabic + Hebrew wedding font set used by the
// digital invitation (`DigitalInvitationView`) and its design editor. These
// ~17 families are loaded on demand — only when one of those surfaces mounts —
// so the landing page, login, and the rest of the portal never pay for them.
//
// The 4 base families (Amiri, Cairo, Heebo, Frank Ruhl Libre) are self-hosted and
// declared inline in index.html, so this set only adds the extra Arabic faces and
// the remaining Hebrew ones. All origins are already allow-listed by the CSP in
// firebase.json (style-src fonts.googleapis.com, font-src fonts.gstatic.com).
//
// Noto Naskh Arabic used to ride along on the global <link>. It is picker-only —
// no component asks for it — so self-hosting it would have made every visitor pay
// for a face almost no design uses. It is requested on demand here instead.

const FONT_HREF =
  "https://fonts.googleapis.com/css2" +
  // ── New Arabic faces ──
  "?family=Aref+Ruqaa:wght@400;700" +
  "&family=Noto+Naskh+Arabic:wght@400;500;700" +
  "&family=El+Messiri:wght@400;500;700" +
  "&family=Reem+Kufi:wght@400;600;700" +
  "&family=Tajawal:wght@400;500;700" +
  "&family=Markazi+Text:wght@400;600;700" +
  "&family=Scheherazade+New:wght@400;700" +
  "&family=Changa:wght@400;600;700" +
  "&family=Lalezar" +
  "&family=Lemonada:wght@400;600;700" +
  // ── Hebrew faces (matched to the Arabic pairs) ──
  "&family=Frank+Ruhl+Libre:wght@400;500;700;900" +
  "&family=Noto+Serif+Hebrew:wght@400;500;700" +
  "&family=Heebo:wght@400;500;700;900" +
  "&family=David+Libre:wght@400;500;700" +
  "&family=Assistant:wght@400;600;700" +
  "&family=Rubik:wght@400;500;700" +
  "&family=Secular+One" +
  "&family=Suez+One" +
  "&display=swap";

// ── Targeted, per-design loading ────────────────────────────────────────────
// An invitation renders exactly ONE font, but the guest used to wait on the
// whole ~17-family picker set above (a much bigger CSS + font payload on 4G),
// and the couple's names reflowed when the real face finally landed. The
// invitation views therefore ask for just the families their design needs.
//
// Self-hosted and always present (index.html) — never request these from Google.
const GLOBAL_FAMILIES = new Set(["Cairo", "Amiri", "Heebo", "Frank Ruhl Libre"]);

// family name → its Google Fonts spec (same weights the full set requests).
const FAMILY_SPEC = {
  "Aref Ruqaa": "Aref+Ruqaa:wght@400;700",
  "Noto Naskh Arabic": "Noto+Naskh+Arabic:wght@400;500;700",
  "El Messiri": "El+Messiri:wght@400;500;700",
  "Reem Kufi": "Reem+Kufi:wght@400;600;700",
  Tajawal: "Tajawal:wght@400;500;700",
  "Markazi Text": "Markazi+Text:wght@400;600;700",
  "Scheherazade New": "Scheherazade+New:wght@400;700",
  Changa: "Changa:wght@400;600;700",
  Lalezar: "Lalezar",
  Lemonada: "Lemonada:wght@400;600;700",
  "Noto Serif Hebrew": "Noto+Serif+Hebrew:wght@400;500;700",
  "David Libre": "David+Libre:wght@400;500;700",
  Assistant: "Assistant:wght@400;600;700",
  Rubik: "Rubik:wght@400;500;700",
  "Secular One": "Secular+One",
  "Suez One": "Suez+One",
};

function familiesFor(family) {
  return String(family || "")
    .split(",")
    .map((s) => s.trim().replace(/^['"]|['"]$/g, ""))
    .filter(Boolean);
}

/**
 * Inject ONLY the families this design's font stack needs. Pass the resolved
 * `font.family` stack (from getDigitalFont). Idempotent per stack; a no-op when
 * every family is already global, or when the full picker set is already in.
 */
export function ensureDigitalFontFamily(family) {
  if (typeof document === "undefined") return;
  if (document.querySelector("link[data-dawa-fonts]")) return; // full set already loaded
  const specs = familiesFor(family)
    .filter((f) => !GLOBAL_FAMILIES.has(f))
    .map((f) => FAMILY_SPEC[f])
    .filter(Boolean);
  if (!specs.length) return; // nothing to fetch — already available globally
  const key = specs.join("|");
  if (document.querySelector(`link[data-dawa-font="${CSS.escape(key)}"]`)) return;

  const preconnectCss = document.createElement("link");
  preconnectCss.rel = "preconnect";
  preconnectCss.href = "https://fonts.googleapis.com";

  const preconnectFiles = document.createElement("link");
  preconnectFiles.rel = "preconnect";
  preconnectFiles.href = "https://fonts.gstatic.com";
  preconnectFiles.crossOrigin = "anonymous";

  const link = document.createElement("link");
  link.rel = "stylesheet";
  link.href = `https://fonts.googleapis.com/css2?family=${specs.join("&family=")}&display=swap`;
  link.setAttribute("data-dawa-font", key);

  document.head.append(preconnectCss, preconnectFiles, link);
}

/**
 * Inject the extended wedding fonts once. Idempotent and SSR-safe — repeated
 * calls and a second mount are no-ops because the <link> carries a marker attr.
 * Used by the design EDITOR, whose font picker previews every family.
 */
export function ensureDigitalFonts() {
  if (typeof document === "undefined") return;
  if (document.querySelector("link[data-dawa-fonts]")) return;

  // Resource hints first so the font CSS + files start resolving immediately.
  const preconnectCss = document.createElement("link");
  preconnectCss.rel = "preconnect";
  preconnectCss.href = "https://fonts.googleapis.com";

  const preconnectFiles = document.createElement("link");
  preconnectFiles.rel = "preconnect";
  preconnectFiles.href = "https://fonts.gstatic.com";
  preconnectFiles.crossOrigin = "anonymous";

  const link = document.createElement("link");
  link.rel = "stylesheet";
  link.href = FONT_HREF;
  link.setAttribute("data-dawa-fonts", "");

  document.head.append(preconnectCss, preconnectFiles, link);
}
