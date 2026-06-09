// Lazily injects the EXTENDED Arabic + Hebrew wedding font set used by the
// digital invitation (`DigitalInvitationView`) and its design editor. These
// ~17 families are loaded on demand — only when one of those surfaces mounts —
// so the landing page, login, and the rest of the portal never pay for them.
//
// The 3 base families (Amiri, Cairo, Noto Naskh Arabic) are already loaded
// globally via GlobalStyle.jsx, so this set only adds the new Arabic faces and
// every Hebrew face. All origins are already allow-listed by the CSP in
// firebase.json (style-src fonts.googleapis.com, font-src fonts.gstatic.com).

const FONT_HREF =
  "https://fonts.googleapis.com/css2" +
  // ── New Arabic faces ──
  "?family=Aref+Ruqaa:wght@400;700" +
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

/**
 * Inject the extended wedding fonts once. Idempotent and SSR-safe — repeated
 * calls and a second mount are no-ops because the <link> carries a marker attr.
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
