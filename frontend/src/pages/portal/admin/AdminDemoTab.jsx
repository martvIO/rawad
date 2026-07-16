// Admin tab: edit the PUBLIC demo invitation's design. Reuses the groom design
// editor (DesignEditorBody) pointed at the reserved demo design, in
// adminDemoMode — edits are a private draft; the live demo only changes when the
// admin clicks "Publish to demo" (which snapshots the draft).
import { useEffect, useState } from "react";
import { usePortal } from "../../../context/PortalContext.jsx";
import { localizeApiError } from "../../../utils/apiError.js";
import { logErr } from "../../../utils/logger.js";
import { C } from "../../../styles/theme.js";
import { DesignEditorBody } from "../../portal/groom/digital/DigitalDesignEditor.jsx";
import { TemplateAssetsSection } from "./TemplateAssetsSection.jsx";
import {
  ensureDemoDesign,
  publishDemoDesign,
  DEMO_DESIGN_UID,
  DEMO_DESIGN_ID,
} from "../../../services/digitalInvitation.js";

const tt = (lang, ar, he) => (lang === "he" ? he : ar);

export function AdminDemoTab() {
  const { lang, showToast } = usePortal();
  const [ready, setReady] = useState(false);
  const [publishing, setPublishing] = useState(false);

  // Make sure the editable demo design doc exists before the editor reads it.
  useEffect(() => {
    let alive = true;
    ensureDemoDesign()
      .then(() => { if (alive) setReady(true); })
      .catch((e) => { logErr("ensureDemoDesign", e); if (alive) setReady(true); });
    return () => { alive = false; };
  }, []);

  const onPublish = async () => {
    setPublishing(true);
    try {
      await publishDemoDesign();
      showToast(tt(lang, "✓ تم النشر إلى صفحة العرض", "✓ פורסם לדף ההדגמה"));
    } catch (e) {
      logErr("publishDemoDesign", e);
      showToast(localizeApiError(e, lang, tt(lang, "فشل النشر", "הפרסום נכשל")));
    } finally {
      setPublishing(false);
    }
  };

  const openLiveDemo = () => window.open("/d/demo/demo?demo=1", "_blank", "noopener");

  return (
    <div style={{ animation: "fadeUp .3s ease" }}>
      <div className="gold-card" style={{ marginBottom: 16, padding: "14px 18px" }}>
        <div style={{ fontSize: 14, fontWeight: 900, color: C.gold, marginBottom: 6 }}>
          {tt(lang, "تصميم صفحة العرض", "עיצוב דף ההדגמה")}
        </div>
        <div style={{ fontSize: 12, color: C.dim, lineHeight: 1.7 }}>
          {tt(
            lang,
            "تعديلاتك هنا تُحفظ كمسودة ولا تظهر للزوّار حتى تضغط «نشر إلى صفحة العرض». قبل النشر يعرض الزوّار النسخة التجريبية الافتراضية.",
            "העריכות כאן נשמרות כטיוטה ולא מוצגות למבקרים עד שתלחץ «פרסם לדף ההדגמה». לפני הפרסום המבקרים רואים את דמו ברירת המחדל.",
          )}
        </div>
        <button
          type="button"
          data-testid="demo-open-live"
          onClick={openLiveDemo}
          style={{
            marginTop: 10, background: "rgba(201,168,76,.08)", border: "1px solid rgba(201,168,76,.3)",
            color: C.gold, padding: "6px 12px", borderRadius: 9, fontSize: 11, fontWeight: 800,
            cursor: "pointer", fontFamily: "inherit",
          }}
        >
          🔗 {tt(lang, "فتح صفحة العرض المباشرة", "פתח את דף ההדגמה החי")}
        </button>
      </div>

      <TemplateAssetsSection lang={lang} showToast={showToast} />

      {ready ? (
        <DesignEditorBody
          key="demo"
          groomUid={DEMO_DESIGN_UID}
          designId={DEMO_DESIGN_ID}
          adminDemoMode
          onPublish={onPublish}
          publishing={publishing}
        />
      ) : (
        <div style={{ textAlign: "center", padding: 40, color: C.dim }}>
          <span className="spinner" /> {tt(lang, "جاري التحميل...", "טוען...")}
        </div>
      )}
    </div>
  );
}
