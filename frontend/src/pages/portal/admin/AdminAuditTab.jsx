// Admin → Audit log reader. Surfaces the append-only /audit trail (privileged
// actions: user create/delete, password resets, driver self-assignment, payment
// links, etc.) so the operator can review "who did what" without the Firebase
// console.
import { useEffect, useState } from "react";
import { usePortal } from "../../../context/PortalContext.jsx";
import { C } from "../../../styles/theme.js";
import { getAuditLog } from "../../../services/audit.js";
import { localizeApiError } from "../../../utils/apiError.js";

function fmtTime(ts) {
  if (!ts) return "";
  try {
    return new Date(ts).toLocaleString("en-GB", {
      day: "2-digit", month: "2-digit", year: "numeric",
      hour: "2-digit", minute: "2-digit", numberingSystem: "latn",
    });
  } catch { return String(ts); }
}

export function AdminAuditTab() {
  const { lang, showToast } = usePortal();
  const [rows, setRows] = useState(null);
  const [loading, setLoading] = useState(true);

  const reload = async () => {
    setLoading(true);
    try {
      const data = await getAuditLog(200);
      setRows(Array.isArray(data) ? data : []);
    } catch (e) {
      showToast(localizeApiError(e, lang));
      setRows([]);
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { reload(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, []);

  return (
    <div style={{ animation: "fadeUp .3s ease" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
        <div style={{ fontSize: 16, fontWeight: 900, color: C.gold, fontFamily: "'Amiri',serif" }}>
          📜 {lang === "he" ? "יומן פעולות" : "سجل العمليات"}
        </div>
        <button className="ghost-btn" style={{ padding: "6px 14px", fontSize: 12 }} onClick={reload} disabled={loading}>
          {loading ? "…" : (lang === "he" ? "רענן" : "تحديث")}
        </button>
      </div>

      {loading && rows === null && (
        <div className="card" style={{ textAlign: "center", padding: 24, color: C.dim }}>…</div>
      )}
      {rows && rows.length === 0 && (
        <div className="card" style={{ textAlign: "center", padding: 24, color: C.dim }}>
          {lang === "he" ? "אין רשומות" : "لا توجد سجلات"}
        </div>
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {(rows || []).map((r) => (
          <div key={r.id} className="card" style={{ padding: "10px 14px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 10 }}>
              <span style={{ fontWeight: 800, color: C.goldLight, fontSize: 13 }}>{r.action || "—"}</span>
              <span style={{ fontSize: 11, color: C.dim, direction: "ltr", flexShrink: 0 }}>{fmtTime(r.timestamp)}</span>
            </div>
            <div style={{ fontSize: 11, color: C.dim, marginTop: 4, direction: "ltr", textAlign: "left", wordBreak: "break-all" }}>
              <span style={{ opacity: 0.7 }}>by</span> {String(r.uid || "—")}
              {r.details && (
                <span style={{ opacity: 0.8 }}> · {JSON.stringify(r.details)}</span>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
