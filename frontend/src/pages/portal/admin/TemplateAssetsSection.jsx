// Admin: upload the PREVIEW COVER for each template — the art prospects see on
// the public /templates gallery and the landing strip, and grooms see in the
// design editor's template picker.
//
// Placed inside the Demo tab (rather than a tab of its own): that tab is already
// the admin's public-showcase surface, covers change rarely, and the demo editor
// directly below is the natural way to verify how a template actually looks
// before choosing art for it.
//
// A template with no uploaded cover falls back to its bundled art, then to a
// themed ornament — so this is always optional polish, never a broken surface.
import { useState } from "react";
import { TEMPLATES, DIGITAL_TEMPLATE_KEYS } from "@dawa/core/data/digitalTemplates.js";
import { uploadTemplateAsset, deleteTemplateAsset } from "../../../services/digitalInvitation.js";
import { useTemplateAssets, __resetTemplateAssetsCache } from "../../../hooks/useTemplateAssets.js";
import { getTemplateThumb } from "../../../components/digital/templates/thumbs.js";
import { localizeApiError } from "../../../utils/apiError.js";
import { logErr } from "../../../utils/logger.js";
import { C } from "../../../styles/theme.js";

const tt = (lang, ar, he) => (lang === "he" ? he : ar);

const fmtWhen = (ms, lang) => {
  if (!ms) return "";
  try {
    return new Date(ms).toLocaleDateString(lang === "he" ? "he-IL" : "ar", {
      day: "numeric", month: "short", year: "numeric", numberingSystem: "latn",
    });
  } catch {
    return "";
  }
};

export function TemplateAssetsSection({ lang, showToast }) {
  const { assets, resolveThumb } = useTemplateAssets();
  // Local overlay so the UI updates immediately after an upload/remove without
  // waiting on the module-level cache (which we reset so other surfaces re-fetch).
  const [local, setLocal] = useState({});
  const [busy, setBusy] = useState("");

  const coverOf = (id) => (id in local ? local[id]?.url || getTemplateThumb(id) : resolveThumb(id));
  const uploadedOf = (id) => (id in local ? local[id] : assets?.[id]);

  const onFile = async (id, file) => {
    if (!file) return;
    setBusy(id);
    try {
      const r = await uploadTemplateAsset(id, file);
      setLocal((m) => ({ ...m, [id]: { url: r.url, storagePath: r.storagePath, updatedAt: r.updatedAt } }));
      __resetTemplateAssetsCache(); // gallery/picker re-fetch on their next mount
      showToast(tt(lang, "✓ تم رفع صورة القالب", "✓ תמונת התבנית הועלתה"));
    } catch (e) {
      logErr("uploadTemplateAsset", e);
      showToast(localizeApiError(e, lang, tt(lang, "فشل رفع الصورة", "העלאת התמונה נכשלה")));
    } finally {
      setBusy("");
    }
  };

  const onRemove = async (id) => {
    setBusy(id);
    try {
      await deleteTemplateAsset(id);
      setLocal((m) => ({ ...m, [id]: null }));
      __resetTemplateAssetsCache();
      showToast(tt(lang, "✓ أُزيلت صورة القالب", "✓ תמונת התבנית הוסרה"));
    } catch (e) {
      logErr("deleteTemplateAsset", e);
      showToast(localizeApiError(e, lang, tt(lang, "فشل حذف الصورة", "מחיקת התמונה נכשלה")));
    } finally {
      setBusy("");
    }
  };

  return (
    <div className="gold-card" style={{ marginBottom: 16, padding: "14px 18px" }} data-testid="template-assets-section">
      <div style={{ fontSize: 14, fontWeight: 900, color: C.gold, marginBottom: 6 }}>
        {tt(lang, "صور القوالب", "תמונות התבניות")}
      </div>
      <div style={{ fontSize: 12, color: C.dim, lineHeight: 1.7, marginBottom: 14 }}>
        {tt(
          lang,
          "الصورة التي تظهر لكل قالب في معرض القوالب وفي صفحة الهبوط وفي اختيار العريس. صورة فقط (بدون فيديو)، حتى 10 ميغابايت. بدون صورة يظهر القالب بتصميمه الافتراضي.",
          "התמונה המוצגת לכל תבנית בגלריית התבניות, בדף הנחיתה ובבחירת החתן. תמונה בלבד (ללא וידאו), עד 10MB. ללא תמונה התבנית מוצגת בעיצוב ברירת המחדל.",
        )}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(150px, 1fr))", gap: 12 }}>
        {DIGITAL_TEMPLATE_KEYS.map((id) => {
          const tpl = TEMPLATES[id];
          const cover = coverOf(id);
          const uploaded = uploadedOf(id);
          const isBusy = busy === id;
          return (
            <div key={id} data-testid={`template-asset-${id}`}
              style={{ border: "1px solid rgba(255,255,255,.08)", borderRadius: 12, overflow: "hidden", background: "rgba(255,255,255,.02)" }}>
              <div style={{ width: "100%", aspectRatio: "3 / 4", background: "#111", display: "flex", alignItems: "center", justifyContent: "center" }}>
                {cover ? (
                  <img src={cover} alt="" style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
                ) : (
                  <span style={{ fontSize: 10, color: C.dim }}>{tt(lang, "لا توجد صورة", "אין תמונה")}</span>
                )}
              </div>
              <div style={{ padding: "8px 10px 10px" }}>
                <div style={{ fontSize: 12, fontWeight: 800, color: C.goldLight }}>{tt(lang, tpl.label_ar, tpl.label_he)}</div>
                <div style={{ fontSize: 10, color: C.dim, marginTop: 2, minHeight: 13 }}>
                  {uploaded?.updatedAt
                    ? tt(lang, `مرفوعة · ${fmtWhen(uploaded.updatedAt, lang)}`, `הועלה · ${fmtWhen(uploaded.updatedAt, lang)}`)
                    : tt(lang, "الصورة الافتراضية", "תמונת ברירת מחדל")}
                </div>
                <label style={{ display: "block", marginTop: 8 }}>
                  <input type="file" accept="image/*" disabled={isBusy} data-testid={`template-asset-input-${id}`}
                    onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; onFile(id, f); }}
                    style={{ display: "none" }} />
                  <span style={{
                    display: "block", textAlign: "center", padding: "5px 8px", borderRadius: 8,
                    border: "1px solid rgba(201,168,76,.3)", background: "rgba(201,168,76,.08)",
                    color: C.gold, fontSize: 10.5, fontWeight: 800, cursor: isBusy ? "wait" : "pointer",
                  }}>
                    {isBusy ? tt(lang, "…جارٍ", "…מעלה") : tt(lang, "رفع صورة", "העלאת תמונה")}
                  </span>
                </label>
                {uploaded?.url && (
                  <button type="button" disabled={isBusy} data-testid={`template-asset-remove-${id}`} onClick={() => onRemove(id)}
                    style={{ width: "100%", marginTop: 6, padding: "4px 8px", borderRadius: 8, border: "1px solid rgba(255,255,255,.1)", background: "transparent", color: C.dim, fontSize: 10, fontWeight: 700, cursor: isBusy ? "wait" : "pointer", fontFamily: "inherit" }}>
                    {tt(lang, "إزالة", "הסרה")}
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
