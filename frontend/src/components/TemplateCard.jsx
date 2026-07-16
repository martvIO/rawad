// One template's presentation card — shared by the public gallery page and the
// landing-page strip so the two surfaces can never drift apart. Purely
// data-driven from the shared TEMPLATES metadata: a new template appears on both
// surfaces the moment it is registered, with no code change here.
//
// Thumbnail policy: `thumb` is passed IN (rather than resolved here) so the
// caller controls the uploaded → bundled → label-only chain. When no thumbnail
// exists, the card paints a placeholder in the template's OWN default palette,
// so a thumbnail-less template still previews its look instead of reading broken.
import { useState } from "react";
import { TEMPLATES } from "@dawa/core/data/digitalTemplates.js";
import { DIGITAL_THEMES, getDigitalTheme } from "../styles/digitalThemes.js";
import { demoPreviewUrl, demoPreviewShareUrl } from "../utils/templateDemo.js";
import { C } from "../styles/theme.js";

// The palette keys to show as swatches: a bespoke template's curated list, else
// the template's single default palette.
function swatchKeys(tpl) {
  const keys = Array.isArray(tpl?.themes) && tpl.themes.length ? tpl.themes : [tpl?.defaults?.themeColor];
  return keys.filter((k) => k && DIGITAL_THEMES[k]).slice(0, 4);
}

export function TemplateCard({ id, t, lang, thumb, compact = false }) {
  const tpl = TEMPLATES[id];
  const [copied, setCopied] = useState(false);
  if (!tpl) return null;

  const label = lang === "he" ? tpl.label_he : tpl.label_ar;
  const theme = getDigitalTheme(tpl.defaults?.themeColor);
  const openDemo = () => window.open(demoPreviewUrl(id), "_blank", "noopener");

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(demoPreviewShareUrl(id));
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      // Clipboard blocked (insecure context / permission) — the "try live"
      // button still works, so fail quietly rather than alarm a prospect.
    }
  };

  return (
    <div
      data-testid={`template-card-${id}`}
      style={{
        display: "flex", flexDirection: "column",
        borderRadius: 16, overflow: "hidden",
        border: "1px solid rgba(201,168,76,.22)",
        background: "linear-gradient(180deg, rgba(255,255,255,.03), rgba(255,255,255,.01))",
        minWidth: compact ? 210 : 0,
      }}
    >
      {/* Preview art — the uploaded/bundled cover, else a themed placeholder. */}
      <div
        onClick={openDemo}
        style={{
          width: "100%", aspectRatio: "3 / 4", overflow: "hidden", cursor: "pointer",
          background: thumb ? "#111" : `linear-gradient(160deg, ${theme.bg}, ${theme.accent}22)`,
          display: "flex", alignItems: "center", justifyContent: "center",
        }}
      >
        {thumb ? (
          <img src={thumb} alt={label} loading="lazy" style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
        ) : (
          // No cover uploaded/bundled yet: a themed ornament previews the
          // template's palette. Deliberately text-free — the name already sits
          // in the title row below, and repeating it here read as a bug.
          <div aria-hidden="true" style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 10, opacity: 0.85 }}>
            <span style={{ width: 46, height: 1, background: `linear-gradient(90deg, transparent, ${theme.accent})` }} />
            <span style={{ width: 12, height: 12, transform: "rotate(45deg)", border: `1px solid ${theme.accent}`, background: `${theme.accent}22` }} />
            <span style={{ width: 46, height: 1, background: `linear-gradient(90deg, ${theme.accent}, transparent)` }} />
          </div>
        )}
      </div>

      <div style={{ padding: compact ? "10px 12px 12px" : "14px 16px 16px", display: "flex", flexDirection: "column", gap: 10, flex: 1 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
          <div style={{ fontFamily: "'Amiri','Frank Ruhl Libre',serif", fontWeight: 900, fontSize: compact ? 15 : 18, color: C.goldLight }}>{label}</div>
          {/* Curated palette swatches — what this template can be recolored into. */}
          <div style={{ display: "inline-flex", gap: 4 }} aria-hidden="true">
            {swatchKeys(tpl).map((k) => (
              <span key={k} style={{ width: 10, height: 10, borderRadius: "50%", background: DIGITAL_THEMES[k].swatch, border: "1px solid rgba(0,0,0,.4)" }} />
            ))}
          </div>
        </div>

        <div style={{ display: "flex", gap: 8, marginTop: "auto" }}>
          <button type="button" data-testid={`template-try-${id}`} onClick={openDemo}
            style={{
              flex: 1, padding: "8px 10px", borderRadius: 999, border: "none", cursor: "pointer",
              background: "linear-gradient(135deg,#fff3c0,#f0c84c,#c9a84c)", color: "#07070a",
              fontSize: 11.5, fontWeight: 800, fontFamily: "inherit",
            }}>
            {t("templates_try_live")}
          </button>
          {!compact && (
            <button type="button" data-testid={`template-copy-${id}`} onClick={copyLink}
              style={{
                padding: "8px 10px", borderRadius: 999, cursor: "pointer",
                border: "1px solid rgba(201,168,76,.3)", background: "transparent",
                color: copied ? C.gold : C.dim, fontSize: 11.5, fontWeight: 700, fontFamily: "inherit",
              }}>
              {copied ? t("templates_copied") : t("templates_copy_link")}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
