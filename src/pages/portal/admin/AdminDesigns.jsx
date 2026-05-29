// Admin reviewer screen for the groom-driven design workflow. Replaces the
// admin-uploads-mockups AdminDesignRequests screen.
import { useEffect, useMemo, useState } from "react";
import { usePortal } from "../../../context/PortalContext.jsx";
import {
  subscribeAdminDesignList,
  approveDigitalDesign,
  rejectDigitalDesign,
} from "../../../services/digitalInvitation.js";
import { logErr } from "../../../utils/logger.js";
import { C } from "../../../styles/theme.js";
import { Num } from "../../../components/Num.jsx";
import { DigitalInvitationPreviewModal } from "../../../components/digital/DigitalInvitationPreviewModal.jsx";
import { getDigitalTheme } from "../../../styles/digitalThemes.js";

const tt = (lang, ar, he) => (lang === "he" ? he : ar);

const STATUS_META = {
  pending_approval: { icon: "👀", color: "#c084fc", label_ar: "بانتظار الموافقة", label_he: "ממתין לאישור", bucket: "pending" },
  approved:         { icon: "✓", color: "#4cc97a", label_ar: "معتمد", label_he: "אושר", bucket: "approved" },
  rejected:         { icon: "⚠", color: "#d4533a", label_ar: "مرفوض", label_he: "נדחה", bucket: "rejected" },
  draft:            { icon: "✎", color: C.gold, label_ar: "مسوّدة", label_he: "טיוטה", bucket: "other" },
};

export function AdminDesigns() {
  const { lang, showToast, users } = usePortal();
  const [rows, setRows] = useState([]);
  const [previewDesign, setPreviewDesign] = useState(null);
  const [rejecting, setRejecting] = useState(null); // groomUid
  const [rejectNote, setRejectNote] = useState("");
  const [busy, setBusy] = useState(null); // groomUid

  useEffect(() => subscribeAdminDesignList(setRows), []);

  // Join groom username for display. Users list is already in PortalContext.
  const withUsernames = useMemo(() => {
    const byUid = new Map(users.map((u) => [u.uid || u.id, u.username]));
    return rows.map((r) => ({ ...r, groomUsername: byUid.get(r.groomUid) || r.groomUid.slice(0, 6) }));
  }, [rows, users]);

  const groups = useMemo(() => ({
    pending: withUsernames.filter((r) => r.designStatus === "pending_approval"),
    approved: withUsernames.filter((r) => r.designStatus === "approved"),
    rejected: withUsernames.filter((r) => r.designStatus === "rejected"),
    other: withUsernames.filter((r) => r.designStatus === "draft" || !r.designStatus),
  }), [withUsernames]);

  const onApprove = async (row) => {
    setBusy(row.groomUid);
    try {
      await approveDigitalDesign(row.groomUid);
      showToast(tt(lang, "✓ تم اعتماد التصميم", "✓ העיצוב אושר"));
    } catch (err) {
      logErr("approveDigitalDesign", err);
      showToast(err?.message || tt(lang, "فشل الاعتماد", "האישור נכשל"));
    } finally {
      setBusy(null);
    }
  };

  const onConfirmReject = async () => {
    if (!rejectNote.trim()) {
      showToast(tt(lang, "اكتب سبب الرفض", "כתוב סיבת הדחייה"));
      return;
    }
    setBusy(rejecting);
    try {
      await rejectDigitalDesign(rejecting, rejectNote.trim());
      showToast(tt(lang, "✓ تم رفض التصميم", "✓ העיצוב נדחה"));
      setRejecting(null);
      setRejectNote("");
    } catch (err) {
      logErr("rejectDigitalDesign", err);
      showToast(err?.message || tt(lang, "فشل الرفض", "הדחייה נכשלה"));
    } finally {
      setBusy(null);
    }
  };

  return (
    <div style={{ animation: "fadeUp .3s ease" }}>
      <div style={{ marginBottom: 16 }}>
        <div style={{ fontSize: 19, fontWeight: 900, color: C.gold, fontFamily: "'Amiri',serif", marginBottom: 4 }}>
          🎨 {tt(lang, "اعتماد التصاميم الرقمية", "אישור עיצובים דיגיטליים")}
        </div>
        <div style={{ fontSize: 12, color: C.dim }}>
          {tt(
            lang,
            "العرسان يصمّمون دعواتهم بأنفسهم. هنا تراجعها وتعتمدها أو ترفضها مع ملاحظة.",
            "החתנים מעצבים בעצמם. כאן תאשר את הבקשות או תדחה עם הערה.",
          )}
        </div>
      </div>

      {withUsernames.length === 0 && (
        <div className="card" style={{ textAlign: "center", padding: 32, color: C.dim }}>
          {tt(lang, "لا توجد طلبات حالياً", "אין בקשות כרגע")}
        </div>
      )}

      <Section
        testid="designs-section-pending"
        title={tt(lang, "👀 بانتظار الموافقة", "👀 ממתין לאישור")}
        count={groups.pending.length}
        color="#c084fc"
      >
        {groups.pending.map((row) => (
          <DesignCard
            key={row.groomUid}
            row={row}
            lang={lang}
            busy={busy === row.groomUid}
            onPreview={() => setPreviewDesign(row)}
            onApprove={() => onApprove(row)}
            onReject={() => { setRejecting(row.groomUid); setRejectNote(""); }}
          />
        ))}
      </Section>

      <Section
        testid="designs-section-approved"
        title={tt(lang, "✓ معتمد", "✓ אושר")}
        count={groups.approved.length}
        color="#4cc97a"
      >
        {groups.approved.map((row) => (
          <DesignCard
            key={row.groomUid}
            row={row}
            lang={lang}
            busy={busy === row.groomUid}
            onPreview={() => setPreviewDesign(row)}
            showApprovedAt
          />
        ))}
      </Section>

      <Section
        testid="designs-section-rejected"
        title={tt(lang, "⚠ مرفوض", "⚠ נדחה")}
        count={groups.rejected.length}
        color="#d4533a"
      >
        {groups.rejected.map((row) => (
          <DesignCard
            key={row.groomUid}
            row={row}
            lang={lang}
            busy={busy === row.groomUid}
            onPreview={() => setPreviewDesign(row)}
            showRejectionNote
          />
        ))}
      </Section>

      <Section
        testid="designs-section-draft"
        title={tt(lang, "✎ مسودات", "✎ טיוטות")}
        count={groups.other.length}
        color={C.gold}
      >
        {groups.other.map((row) => (
          <DesignCard
            key={row.groomUid}
            row={row}
            lang={lang}
            busy={busy === row.groomUid}
            onPreview={() => setPreviewDesign(row)}
          />
        ))}
      </Section>

      {/* Reject modal */}
      {rejecting && (
        <div
          onClick={() => !busy && setRejecting(null)}
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,.78)",
            zIndex: 1600,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 16,
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            data-testid="design-reject-modal"
            style={{
              maxWidth: 440,
              width: "100%",
              padding: 24,
              borderRadius: 18,
              background: "#0c0c11",
              border: "1px solid rgba(212,80,58,.35)",
              boxShadow: "0 20px 60px rgba(0,0,0,.6)",
            }}
          >
            <div style={{ fontSize: 17, fontWeight: 900, color: "#d4533a", marginBottom: 8 }}>
              {tt(lang, "رفض التصميم", "דחיית העיצוב")}
            </div>
            <div style={{ fontSize: 12, color: C.dim, marginBottom: 14 }}>
              {tt(
                lang,
                "اكتب ملاحظة واضحة للعريس لمعرفة ما يجب تعديله.",
                "כתוב הערה ברורה כדי שהחתן ידע מה לשנות.",
              )}
            </div>
            <textarea
              data-testid="design-reject-note-input"
              className="input-field"
              rows={5}
              maxLength={500}
              value={rejectNote}
              onChange={(e) => setRejectNote(e.target.value)}
              placeholder={tt(lang, "مثال: غيّر اللون للأبيض ووضّح اسم القاعة", "לדוגמה: שנה את הצבע ללבן והבהר את שם האולם")}
              style={{ resize: "vertical", minHeight: 100, marginBottom: 14, fontFamily: "inherit" }}
            />
            <div style={{ display: "flex", gap: 10 }}>
              <button
                data-testid="design-reject-confirm"
                onClick={onConfirmReject}
                disabled={busy}
                className="danger-btn"
                style={{ flex: 1 }}
              >
                {busy ? "..." : tt(lang, "📨 إرسال الرفض", "📨 שלח דחייה")}
              </button>
              <button
                onClick={() => { setRejecting(null); setRejectNote(""); }}
                disabled={busy}
                style={{
                  flex: 1,
                  padding: "12px 0",
                  background: "rgba(255,255,255,.04)",
                  border: "1px solid rgba(255,255,255,.12)",
                  borderRadius: 12,
                  color: C.goldLight,
                  cursor: busy ? "not-allowed" : "pointer",
                  fontFamily: "inherit",
                  fontWeight: 700,
                }}
              >
                {tt(lang, "إلغاء", "ביטול")}
              </button>
            </div>
          </div>
        </div>
      )}

      <DigitalInvitationPreviewModal
        open={!!previewDesign}
        design={previewDesign}
        demoGuestName={tt(lang, "اسم الضيف", "שם האורח")}
        lang={lang}
        onClose={() => setPreviewDesign(null)}
      />
    </div>
  );
}

function Section({ title, count, color, children, testid }) {
  if (count === 0) return null;
  return (
    <div data-testid={testid} style={{ marginBottom: 18 }}>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          marginBottom: 10,
          padding: "8px 12px",
          borderRadius: 10,
          background: `${color}10`,
          border: `1px solid ${color}33`,
        }}
      >
        <div style={{ flex: 1, fontWeight: 800, color, fontSize: 13 }}>{title}</div>
        <span style={{ fontSize: 11, color, fontWeight: 700 }}><Num>{count.toLocaleString("en")}</Num></span>
      </div>
      {children}
    </div>
  );
}

function DesignCard({ row, lang, busy, onPreview, onApprove, onReject, showApprovedAt, showRejectionNote }) {
  const meta = STATUS_META[row.designStatus] || STATUS_META.draft;
  const theme = getDigitalTheme(row.themeColor);
  const date = row.weddingDate ? new Date(row.weddingDate).toLocaleDateString(lang === "he" ? "he-IL" : "ar-EG", { day: "numeric", month: "long", year: "numeric", numberingSystem: "latn" }) : "—";
  const submittedAt = row.designSubmittedAt
    ? new Date(row.designSubmittedAt).toLocaleString(lang === "he" ? "he-IL" : "ar-EG", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit", numberingSystem: "latn" })
    : null;

  return (
    <div
      data-testid="design-card"
      data-groom-uid={row.groomUid}
      style={{
        background: "#0f0f15",
        border: "1px solid rgba(255,255,255,.07)",
        borderRadius: 14,
        padding: 14,
        marginBottom: 10,
      }}
    >
      <div style={{ display: "flex", gap: 12, alignItems: "center", marginBottom: 12 }}>
        <div
          style={{
            width: 44,
            height: 44,
            borderRadius: 12,
            background: theme.swatch,
            border: `2px solid ${theme.bg}`,
            boxShadow: `0 0 0 1px ${theme.accentLine}`,
            flexShrink: 0,
          }}
        />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 14, fontWeight: 900, color: C.goldLight, marginBottom: 2 }}>
            {row.brideName || "—"} {row.brideName && row.groomDisplayName && "&"} {row.groomDisplayName || ""}
          </div>
          <div style={{ fontSize: 11, color: C.dim }}>
            @{row.groomUsername} · <Num dir="auto">{date}</Num>
          </div>
          {row.venue && (
            <div style={{ fontSize: 11, color: C.dim, marginTop: 2 }}>📍 {row.venue}</div>
          )}
          {submittedAt && row.designStatus === "pending_approval" && (
            <div style={{ fontSize: 10, color: C.dim, marginTop: 2 }}>
              {tt(lang, "أُرسل:", "נשלח:")} <Num dir="auto">{submittedAt}</Num>
            </div>
          )}
        </div>
        <div style={{ fontSize: 11, color: meta.color, fontWeight: 800, padding: "4px 8px", borderRadius: 8, background: `${meta.color}14`, border: `1px solid ${meta.color}33`, whiteSpace: "nowrap" }}>
          {meta.icon} {tt(lang, meta.label_ar, meta.label_he)}
        </div>
      </div>

      {showRejectionNote && row.designRejectionNote && (
        <div
          style={{
            padding: "10px 12px",
            borderRadius: 8,
            marginBottom: 12,
            background: "rgba(212,80,58,.06)",
            border: "1px solid rgba(212,80,58,.20)",
          }}
        >
          <div style={{ fontSize: 10, color: "#d4533a", fontWeight: 800, marginBottom: 4 }}>
            {tt(lang, "ملاحظة الرفض:", "הערת הדחייה:")}
          </div>
          <div style={{ fontSize: 12, color: C.goldLight, lineHeight: 1.7, whiteSpace: "pre-wrap" }}>
            {row.designRejectionNote}
          </div>
        </div>
      )}

      {showApprovedAt && row.designApprovedAt && (
        <div style={{ fontSize: 11, color: "#4cc97a", marginBottom: 10 }}>
          ✓ {tt(lang, "اعتُمد:", "אושר:")} <Num dir="auto">{new Date(row.designApprovedAt).toLocaleString(lang === "he" ? "he-IL" : "ar-EG", { day: "2-digit", month: "2-digit", numberingSystem: "latn" })}</Num>
        </div>
      )}

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <button
          data-testid="design-preview-btn"
          onClick={onPreview}
          style={{
            flex: "1 1 100px",
            padding: "10px 12px",
            borderRadius: 10,
            background: "rgba(201,168,76,.10)",
            border: "1px solid rgba(201,168,76,.30)",
            color: C.gold,
            cursor: "pointer",
            fontFamily: "inherit",
            fontSize: 12,
            fontWeight: 800,
          }}
        >
          👁 {tt(lang, "معاينة", "תצוגה מקדימה")}
        </button>
        {onApprove && (
          <button
            data-testid="design-approve-btn"
            onClick={onApprove}
            disabled={busy}
            style={{
              flex: "1 1 100px",
              padding: "10px 12px",
              borderRadius: 10,
              background: "linear-gradient(135deg,#4cc97a,#2da85a)",
              border: "none",
              color: "#fff",
              cursor: busy ? "not-allowed" : "pointer",
              fontFamily: "inherit",
              fontSize: 12,
              fontWeight: 900,
              opacity: busy ? 0.6 : 1,
            }}
          >
            ✓ {tt(lang, "اعتماد", "אישור")}
          </button>
        )}
        {onReject && (
          <button
            data-testid="design-reject-btn"
            onClick={onReject}
            disabled={busy}
            style={{
              flex: "1 1 100px",
              padding: "10px 12px",
              borderRadius: 10,
              background: "rgba(212,80,58,.10)",
              border: "1px solid rgba(212,80,58,.35)",
              color: "#d4533a",
              cursor: busy ? "not-allowed" : "pointer",
              fontFamily: "inherit",
              fontSize: 12,
              fontWeight: 800,
              opacity: busy ? 0.6 : 1,
            }}
          >
            ✗ {tt(lang, "رفض", "דחה")}
          </button>
        )}
      </div>
    </div>
  );
}
