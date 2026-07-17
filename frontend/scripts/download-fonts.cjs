// Self-hosts the GLOBAL font families (the ones every page pays for) as woff2
// subsets under /public/fonts, and regenerates the inline @font-face block in
// index.html between the FONTS:BEGIN / FONTS:END markers.
//
// Why: a render-blocking fonts.googleapis.com/css2 stylesheet cost 888 ms on
// mobile (Lighthouse render-blocking-insight, Reports/WEB-QUALITY-2026-07-16.md)
// and its late swap caused the desktop CLS failure on /confirm (0.324). Inline
// @font-face + same-origin woff2 removes the third-party round-trip entirely.
//
// Scope: ONLY the 4 families used app-wide. The ~17-family invite-design picker
// set still comes from Google Fonts, lazily, via src/utils/digitalFonts.js —
// those are per-design and must not be paid for by every visitor.
//
// Weights are the minimal set that renders IDENTICALLY to the old global link:
// weight 300 was requested but never used anywhere, and 800/500 requests already
// snapped to 900/400 (CSS font matching) — so dropping them changes no pixel.
// Do NOT add an 800 face: 800 currently resolves to the 900 file, and a real
// 800 would render *lighter* than production does today.
//
// Usage:  node scripts/download-fonts.cjs
//
// Idempotent: skips woff2 files already on disk. Output is COMMITTED — there is
// no network call at build time.
//
// Cache note: these filenames are NOT content-hashed but firebase.json serves
// /fonts/** immutable for a year. If a face's bytes ever change (re-running with
// different weights/subsets), RENAME the file or the old bytes stay cached.
const fs = require("fs");
const path = require("path");

// ── The global set ──────────────────────────────────────────────────────────
// slug          → the /fonts/<slug>-<weight>-<subset>.woff2 filename prefix
// spec          → Google css2 family spec
// fallback      → the local() font whose metrics we match to avoid swap reflow
// capsize       → @capsizecss/metrics module id (dev-only, for the overrides)
const FAMILIES = [
  { family: "Amiri", slug: "amiri", spec: "Amiri:wght@400;700",
    capsize: "amiri", fallback: "Times New Roman", fallbackCapsize: "timesNewRoman" },
  { family: "Cairo", slug: "cairo", spec: "Cairo:wght@400;600;700;900",
    capsize: "cairo", fallback: "Arial", fallbackCapsize: "arial" },
  { family: "Heebo", slug: "heebo", spec: "Heebo:wght@400;600;700;900",
    capsize: "heebo", fallback: "Arial", fallbackCapsize: "arial" },
  { family: "Frank Ruhl Libre", slug: "frank-ruhl-libre", spec: "Frank+Ruhl+Libre:wght@400;700;900",
    capsize: "frankRuhlLibre", fallback: "Times New Roman", fallbackCapsize: "timesNewRoman" },
];

// Subsets css2 offers that this app never renders. `math` is Greek letters and
// math operators — verified zero occurrences in rendered source. Everything else
// stays: `symbols` really is used (✓ ← → ⚠ ♥ resolve to Heebo, since Cairo ships
// no symbols subset), and `latin-ext` covers accented characters in guest names.
const SKIP_SUBSETS = new Set(["math"]);

// A woff2-capable desktop UA — css2 serves woff2 + unicode-range splits for it.
const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 " +
  "(KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";

const OUT = path.join(__dirname, "..", "public", "fonts");
const INDEX = path.join(__dirname, "..", "index.html");
const BEGIN = "/* FONTS:BEGIN";
const END = "/* FONTS:END */";

/** Parse css2 output into {family, weight, subset, url, unicodeRange} blocks. */
function parseCss(css) {
  const blocks = [];
  // Each face is preceded by a `/* subset */` comment naming its unicode block.
  const re = /\/\*\s*([\w-]+)\s*\*\/\s*@font-face\s*\{([^}]*)\}/g;
  let m;
  while ((m = re.exec(css))) {
    const [, subset, body] = m;
    const pick = (k) => (body.match(new RegExp(k + ":\\s*([^;]+);")) || [])[1]?.trim();
    const family = (pick("font-family") || "").replace(/['"]/g, "");
    const url = (body.match(/url\((https:[^)]+)\)/) || [])[1];
    if (!family || !url) continue;
    blocks.push({
      family,
      weight: pick("font-weight") || "400",
      style: pick("font-style") || "normal",
      subset,
      url,
      unicodeRange: pick("unicode-range") || "",
    });
  }
  return blocks;
}

/** fontaine/capsize formula → metric overrides that make the fallback box match. */
function fallbackFace(cfg) {
  const web = require("@capsizecss/metrics/" + cfg.capsize);
  const fb = require("@capsizecss/metrics/" + cfg.fallbackCapsize);
  const pct = (n) => `${(n * 100).toFixed(2)}%`;
  // Width scale: how much to stretch the fallback so a line of text occupies the
  // same horizontal space (=> same wrap points => no reflow when the real font lands).
  const sizeAdjust = web.xWidthAvg / web.unitsPerEm / (fb.xWidthAvg / fb.unitsPerEm);
  // Vertical box: divided by sizeAdjust because the overrides are relative to the
  // ALREADY size-adjusted em box.
  return [
    `@font-face{font-family:'${cfg.family} Fallback';src:local('${cfg.fallback}');`,
    `size-adjust:${pct(sizeAdjust)};`,
    `ascent-override:${pct(web.ascent / web.unitsPerEm / sizeAdjust)};`,
    `descent-override:${pct(Math.abs(web.descent) / web.unitsPerEm / sizeAdjust)};`,
    `line-gap-override:${pct(web.lineGap / web.unitsPerEm / sizeAdjust)};}`,
  ].join("");
}

(async () => {
  fs.mkdirSync(OUT, { recursive: true });

  const href =
    "https://fonts.googleapis.com/css2?" +
    FAMILIES.map((f) => "family=" + f.spec).join("&") +
    "&display=swap";

  process.stdout.write("↓ css2 manifest ... ");
  const res = await fetch(href, { headers: { "User-Agent": UA } });
  if (!res.ok) throw new Error(`css2 HTTP ${res.status}`);
  const css = await res.text();
  const blocks = parseCss(css);
  console.log(`${blocks.length} faces`);

  const bySlug = new Map(FAMILIES.map((f) => [f.family, f.slug]));
  const rules = [];
  let total = 0;

  for (const b of blocks) {
    const slug = bySlug.get(b.family);
    if (!slug) {
      console.warn(`  ! skipping unexpected family ${b.family}`);
      continue;
    }
    if (SKIP_SUBSETS.has(b.subset)) continue;
    const file = `${slug}-${b.weight}-${b.subset}.woff2`;
    const dest = path.join(OUT, file);

    if (!fs.existsSync(dest) || fs.statSync(dest).size === 0) {
      const r = await fetch(b.url, { headers: { "User-Agent": UA } });
      if (!r.ok) throw new Error(`${file} HTTP ${r.status}`);
      fs.writeFileSync(dest, Buffer.from(await r.arrayBuffer()));
      console.log(`  ↓ ${file} (${fs.statSync(dest).size.toLocaleString()} B)`);
    } else {
      console.log(`  ✓ ${file} (exists)`);
    }
    total += fs.statSync(dest).size;

    // unicode-range is preserved VERBATIM — it is what keeps an Arabic page from
    // ever downloading the hebrew/latin-ext files.
    rules.push(
      `@font-face{font-family:'${b.family}';font-style:${b.style};font-weight:${b.weight};` +
        `font-display:swap;src:url(/fonts/${file}) format('woff2');unicode-range:${b.unicodeRange};}`
    );
  }

  const generated = [
    `${BEGIN} — generated by scripts/download-fonts.cjs; do not edit by hand */`,
    ...rules,
    "/* Metric-matched local fallbacks: the pre-swap text occupies the same box as",
    "   the webfont, so the swap causes no layout shift (fixes the /confirm CLS). */",
    ...FAMILIES.map(fallbackFace),
    END,
  ].join("\n      ");

  const html = fs.readFileSync(INDEX, "utf8");
  const start = html.indexOf(BEGIN);
  const stop = html.indexOf(END);
  if (start === -1 || stop === -1) {
    throw new Error(`FONTS:BEGIN/END markers not found in ${INDEX} — add them first.`);
  }
  fs.writeFileSync(INDEX, html.slice(0, start) + generated + html.slice(stop + END.length));

  console.log(
    `\n${rules.length} faces, ${(total / 1024).toFixed(0)} KB on disk ` +
      `(a single page downloads only the subsets it renders).\nindex.html updated.`
  );
})().catch((err) => {
  console.error(`FAILED — ${err.message}`);
  process.exit(1);
});
