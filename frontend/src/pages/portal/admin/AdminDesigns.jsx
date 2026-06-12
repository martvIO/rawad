// Admin reviewer screen for the groom-driven design workflow. Replaces the
// admin-uploads-mockups AdminDesignRequests screen.
import { useEffect, useMemo, useState } from "react";
import { usePortal } from "../../../context/PortalContext.jsx";
import {
  subscribeAdminDesignList,
  setDesignStatus,
} from "../../../services/digitalInvitation.js";
import { logErr } from "../../../utils/logger.js";
import { C } from "../../../styles/theme.js";
import { Num } from "../../../components/Num.jsx";
import { DigitalInvitationPreviewModal } from "../../../components/digital/DigitalInvitationPreviewModal.jsx";
import { getDigitalTheme } from "../../../styles/digitalThemes.js";
import { localize } from "../../../utils/localize.js";

const tt = (lang, ar, he) => (lang === "he" ? he : ar);

// A groom may have several designs, so cards key on groomUid + designId.
const cidOf = (r) => `${r.groomUid}:${r.designId || ""}`;
const titleOf = (r, lang) => {
  const t = r.title;
  const v = t && typeof t === "object" ? (t[lang === "he" ? "he" : "ar"] || t.ar || t.he) : t;
  return (v || "").trim();
};

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
  const [rejecting, setRejecting] = useState(null); // the row being rejected
  const [rejectNote, setRejectNote] = useState("");
  const [busy, setBusy] = useState(null); // composite id (groomUid:designId)

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

  // Admin can move a design to ANY of the 3 states. "rejected" opens the note
  // modal first (the actual set happens in onConfirmReject); the others apply
  // immediately with an optimistic move to the right section.
  const onSetStatus = async (row, status) => {
    if (status === "rejected") {
      setRejecting(row);
      setRejectNote("");
      return;
    }
    setBusy(cidOf(row));
    try {
      await setDesignStatus(row.groomUid, row.designId, status);
      setRows((prev) => prev.map((r) => (cidOf(r) === cidOf(row)
        ? {
            ...r,
            designStatus: status,
            ...(status === "approved"
              ? { designApprovedAt: Date.now(), designRejectionNote: null }
              : { designApprovedAt: null, designRejectionNote: null }),
          }
        : r)));
      showToast(status === "approved"
        ? tt(lang, "✓ تم اعتماد التصميم", "✓ העיצוב אושר")
        : tt(lang, "↩ أُعيد التصميم لمسوّدة", "↩ הוחזר לטיוטה"));
    } catch (err) {
      logErr("setDesignStatus", err);
      showToast(err?.message || tt(lang, "فشل تغيير الحالة", "שינוי הסטטוס נכשל"));
    } finally {
      setBusy(null);
    }
  };

  const onConfirmReject = async () => {
    if (!rejectNote.trim()) {
      showToast(tt(lang, "اكتب سبب الرفض", "כתוב סיבת הדחייה"));
      return;
    }
    setBusy(cidOf(rejecting));
    try {
      const note = rejectNote.trim();
      const rid = cidOf(rejecting);
      await setDesignStatus(rejecting.groomUid, rejecting.designId, "rejected", note);
      // Optimistically move the card to "مرفوض" with the note.
      setRows((prev) => prev.map((r) => (cidOf(r) === rid
        ? { ...r, designStatus: "rejected", designRejectedAt: Date.now(), designRejectionNote: note }
        : r)));
      showToast(tt(lang, "✓ تم رفض التصميم", "✓ העיצוב נדחה"));
      setRejecting(null);
      setRejectNote("");
    } catch (err) {
      logErr("setDesignStatus.rejected", err);
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
            key={cidOf(row)}
            row={row}
            lang={lang}
            busy={busy === cidOf(row)}
            onPreview={() => setPreviewDesign(row)}
            onSetStatus={(status) => onSetStatus(row, status)}
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
            key={cidOf(row)}
            row={row}
            lang={lang}
            busy={busy === cidOf(row)}
            onPreview={() => setPreviewDesign(row)}
            onSetStatus={(status) => onSetStatus(row, status)}
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
            key={cidOf(row)}
            row={row}
            lang={lang}
            busy={busy === cidOf(row)}
            onPreview={() => setPreviewDesign(row)}
            onSetStatus={(status) => onSetStatus(row, status)}
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
            key={cidOf(row)}
            row={row}
            lang={lang}
            busy={busy === cidOf(row)}
            onPreview={() => setPreviewDesign(row)}
            onSetStatus={(status) => onSetStatus(row, status)}
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

function DesignCard({ row, lang, busy, onPreview, onSetStatus, showApprovedAt, showRejectionNote }) {
  const meta = STATUS_META[row.designStatus] || STATUS_META.draft;
  const theme = getDigitalTheme(row.themeColor);
  // Groom-authored fields are localized { ar, he } objects — resolve to a string
  // before rendering, or React throws "Objects are not valid as a React child".
  const bride = localize(row.brideName, lang);
  const groomName = localize(row.groomDisplayName, lang);
  const venue = localize(row.venue, lang);
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
            {bride || "—"} {bride && groomName && "&"} {groomName || ""}
          </div>
          <div style={{ fontSize: 11, color: C.dim }}>
            @{row.groomUsername} · <Num dir="auto">{date}</Num>
          </div>
          {titleOf(row, lang) && (
            <div style={{ fontSize: 11, color: C.gold, fontWeight: 700, marginTop: 2 }}>
              🎨 {titleOf(row, lang)}
            </div>
          )}
          {venue && (
            <div style={{ fontSize: 11, color: C.dim, marginTop: 2 }}>📍 {venue}</div>
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
        {/* Status switcher — admin can set the design to any of the 3 states.
            The current state is the active (filled) button. */}
        {onSetStatus && (
          <div style={{ display: "flex", gap: 6, flex: "2 1 220px" }}>
            {[
              { key: "approved", ar: "✓ اعتماد", he: "✓ אישור", color: "#4cc97a" },
              { key: "draft",    ar: "✎ مسوّدة", he: "✎ טיוטה", color: C.gold },
              { key: "rejected", ar: "✗ رفض",    he: "✗ דחה",   color: "#d4533a" },
            ].map((o) => {
              const active = row.designStatus === o.key;
              return (
                <button
                  key={o.key}
                  data-testid={`design-set-${o.key}`}
                  onClick={() => { if (!active) onSetStatus(o.key); }}
                  disabled={busy || active}
                  title={active ? tt(lang, "الحالة الحالية", "הסטטוס הנוכחי") : ""}
                  style={{
                    flex: 1, padding: "9px 6px", borderRadius: 10, fontFamily: "inherit",
                    fontSize: 12, fontWeight: 800, whiteSpace: "nowrap",
                    cursor: (busy || active) ? "default" : "pointer",
                    border: `1px solid ${o.color}${active ? "" : "55"}`,
                    background: active ? o.color : `${o.color}14`,
                    color: active ? "#0b0b0f" : o.color,
                    opacity: busy && !active ? 0.55 : 1,
                  }}
                >
                  {tt(lang, o.ar, o.he)}
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
