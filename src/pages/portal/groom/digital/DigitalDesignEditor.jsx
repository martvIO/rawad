// Self-serve digital invitation design editor. Replaces the legacy
// admin-uploads-mockups workflow. Groom edits fields, sees a live preview,
// then submits for admin approval.
import { useEffect, useMemo, useRef, useState } from "react";
import { usePortal } from "../../../../context/PortalContext.jsx";
import {
  subscribeDigitalMedia,
  patchDesignFields,
  submitDesignForApproval,
  cancelDesignSubmission,
  addInvitationMedia,
  removeInvitationMedia,
} from "../../../../services/digitalInvitation.js";
import { logErr } from "../../../../utils/logger.js";
import { C } from "../../../../styles/theme.js";
import { DIGITAL_THEMES, DIGITAL_FONTS, DIGITAL_THEME_KEYS, DIGITAL_FONT_KEYS } from "../../../../styles/digitalThemes.js";
import { DigitalInvitationView } from "../../../../components/digital/DigitalInvitationView.jsx";

const tt = (lang, ar, he) => (lang === "he" ? he : ar);

export function DigitalDesignEditor() {
  const { lang, currentUid, showToast } = usePortal();
  const [doc, setDoc] = useState(null);
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(false);
  const fileInputRef = useRef(null);

  // Buffered field values so autosave fires on blur, not on every keystroke.
  // We mirror the server doc into local state and only push back on blur.
  const [brideName, setBrideName] = useState("");
  const [groomDisplayName, setGroomDisplayName] = useState("");
  const [weddingDate, setWeddingDate] = useState("");
  const [venue, setVenue] = useState("");
  const [venueAddress, setVenueAddress] = useState("");
  const [customMessage, setCustomMessage] = useState("");

  // Track which fields are dirty so the autosave PATCH only sends what
  // actually changed. A `dirtyRef` Set is enough — we never need to render
  // off it.
  const dirtyRef = useRef(new Set());

  useEffect(() => {
    if (!currentUid) return;
    return subscribeDigitalMedia(currentUid, (d) => {
      setDoc(d);
      setLoaded(true);
      // Hydrate buffered fields only on first load OR when server changes
      // come in that the user hasn't edited locally.
      const next = d || {};
      if (!dirtyRef.current.has("brideName")) setBrideName(next.brideName || "");
      if (!dirtyRef.current.has("groomDisplayName")) setGroomDisplayName(next.groomDisplayName || "");
      if (!dirtyRef.current.has("weddingDate")) setWeddingDate(epochToInput(next.weddingDate));
      if (!dirtyRef.current.has("venue")) setVenue(next.venue || "");
      if (!dirtyRef.current.has("venueAddress")) setVenueAddress(next.venueAddress || "");
      if (!dirtyRef.current.has("customMessage")) setCustomMessage(next.customMessage || "");
    });
  }, [currentUid]);

  const status = doc?.designStatus || "draft";
  const themeColor = doc?.themeColor || "gold";
  const fontFamily = doc?.fontFamily || "amiri";
  const media = Array.isArray(doc?.media) ? doc.media : [];

  // Editor is read-only while awaiting approval. Approved status is
  // editable too — first design-field edit demotes it back to draft.
  const editable = status === "draft" || status === "approved" || status === "rejected";
  const isPending = status === "pending_approval";

  // Live design that drives the preview — buffered fields merged with the
  // saved doc. Lets the groom see updates immediately.
  const previewDesign = useMemo(
    () => ({
      brideName,
      groomDisplayName,
      weddingDate: inputToEpoch(weddingDate),
      venue,
      venueAddress,
      customMessage,
      themeColor,
      fontFamily,
      media,
    }),
    [brideName, groomDisplayName, weddingDate, venue, venueAddress, customMessage, themeColor, fontFamily, media],
  );

  const flushField = async (key, value) => {
    if (!dirtyRef.current.has(key)) return;
    dirtyRef.current.delete(key);
    if (!editable) return;
    if (status === "approved") {
      const ok = window.confirm(tt(
        lang,
        "تعديل التصميم سيتطلب إعادة الموافقة. الدعوات المُرسلة سابقاً ستحتفظ بنسختها. متابعة؟",
        "עריכת העיצוב תדרוש אישור מחדש. הזמנות שכבר נשלחו ישמרו על הגרסה הקודמת. להמשיך?",
      ));
      if (!ok) {
        // restore from doc
        const cur = doc || {};
        if (key === "brideName") setBrideName(cur.brideName || "");
        if (key === "groomDisplayName") setGroomDisplayName(cur.groomDisplayName || "");
        if (key === "weddingDate") setWeddingDate(epochToInput(cur.weddingDate));
        if (key === "venue") setVenue(cur.venue || "");
        if (key === "venueAddress") setVenueAddress(cur.venueAddress || "");
        if (key === "customMessage") setCustomMessage(cur.customMessage || "");
        return;
      }
    }
    try {
      await patchDesignFields(currentUid, { [key]: value });
    } catch (err) {
      logErr("patchDesignFields", err);
      showToast(err?.message || tt(lang, "فشل الحفظ", "השמירה נכשלה"));
    }
  };

  const onPickTheme = async (key) => {
    if (!editable || themeColor === key) return;
    if (status === "approved") {
      const ok = window.confirm(tt(
        lang,
        "تعديل التصميم سيتطلب إعادة الموافقة. متابعة؟",
        "עריכת העיצוב תדרוש אישור מחדש. להמשיך?",
      ));
      if (!ok) return;
    }
    try {
      await patchDesignFields(currentUid, { themeColor: key });
    } catch (err) {
      logErr("patchDesignFields.themeColor", err);
      showToast(err?.message || tt(lang, "فشل الحفظ", "השמירה נכשלה"));
    }
  };

  const onPickFont = async (key) => {
    if (!editable || fontFamily === key) return;
    if (status === "approved") {
      const ok = window.confirm(tt(
        lang,
        "تعديل التصميم سيتطلب إعادة الموافقة. متابعة؟",
        "עריכת העיצוב תדרוש אישור מחדש. להמשיך?",
      ));
      if (!ok) return;
    }
    try {
      await patchDesignFields(currentUid, { fontFamily: key });
    } catch (err) {
      logErr("patchDesignFields.fontFamily", err);
      showToast(err?.message || tt(lang, "فشل الحفظ", "השמירה נכשלה"));
    }
  };

  const onUpload = async (file) => {
    if (!file) return;
    if (!editable) return;
    setBusy(true);
    try {
      await addInvitationMedia(currentUid, file);
      showToast(tt(lang, "✓ تم رفع الصورة", "✓ התמונה הועלתה"));
    } catch (err) {
      logErr("addInvitationMedia", err);
      showToast(err?.message || tt(lang, "فشل الرفع", "ההעלאה נכשלה"));
    } finally {
      setBusy(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const onRemoveMedia = async (item) => {
    if (!editable) return;
    if (!window.confirm(tt(lang, "حذف هذه الصورة؟", "למחוק את התמונה הזו?"))) return;
    try {
      await removeInvitationMedia(currentUid, item);
      showToast(tt(lang, "✓ تم الحذف", "✓ נמחק"));
    } catch (err) {
      logErr("removeInvitationMedia", err);
      showToast(err?.message || tt(lang, "فشل الحذف", "המחיקה נכשלה"));
    }
  };

  const onSubmit = async () => {
    if (!brideName.trim() || !groomDisplayName.trim()) {
      showToast(tt(lang, "اسم العروسين مطلوبان", "שמות הזוג נדרשים"));
      return;
    }
    setBusy(true);
    try {
      await submitDesignForApproval(currentUid);
      showToast(tt(lang, "✓ تم الإرسال للموافقة", "✓ נשלח לאישור"));
    } catch (err) {
      logErr("submitDesignForApproval", err);
      showToast(err?.message || tt(lang, "فشل الإرسال", "השליחה נכשלה"));
    } finally {
      setBusy(false);
    }
  };

  const onCancelSubmission = async () => {
    setBusy(true);
    try {
      await cancelDesignSubmission(currentUid);
      showToast(tt(lang, "↶ تم الإلغاء، يمكنك التعديل", "↶ בוטל, ניתן לערוך"));
    } catch (err) {
      logErr("cancelDesignSubmission", err);
      showToast(err?.message || tt(lang, "فشل الإلغاء", "הביטול נכשל"));
    } finally {
      setBusy(false);
    }
  };

  if (!loaded) {
    return (
      <div style={{ textAlign: "center", padding: 40, color: C.dim }}>
        <span className="spinner" /> {tt(lang, "جاري التحميل...", "טוען...")}
      </div>
    );
  }

  return (
    <div style={{ animation: "fadeUp .3s ease" }}>
      {/* ── Title ──────────────────────────────────────────────────────────── */}
      <div style={{ marginBottom: 18 }}>
        <div style={{ fontSize: 19, fontWeight: 900, color: C.gold, fontFamily: "'Amiri',serif", marginBottom: 4 }}>
          🎨 {tt(lang, "تصميم الدعوة", "עיצוב ההזמנה")}
        </div>
        <div style={{ fontSize: 12, color: C.dim, lineHeight: 1.7 }}>
          {tt(
            lang,
            "صمّم دعوتك بنفسك — اختر الألوان والخط، أضف الصور وأماكن الزفاف، ثم أرسل للأدمن للاعتماد.",
            "עצב את ההזמנה שלך — בחר צבעים וגופן, הוסף תמונות ומקום אירוע, ושלח לאישור.",
          )}
        </div>
      </div>

      {/* ── Status banner ─────────────────────────────────────────────────── */}
      <StatusBanner status={status} doc={doc} lang={lang} onCancel={onCancelSubmission} busy={busy} />

      {/* ── EDITOR + PREVIEW grid ─────────────────────────────────────────── */}
      <div style={{ display: "grid", gridTemplateColumns: "minmax(280px, 1fr)", gap: 18 }}>
        {/* Field: Names */}
        <Section title={tt(lang, "أسماء العروسين", "שמות הזוג")}>
          <FormField label={tt(lang, "اسم العروس *", "שם הכלה *")}>
            <input
              data-testid="design-bride-name"
              className="input-field"
              type="text"
              value={brideName}
              disabled={!editable}
              onChange={(e) => { setBrideName(e.target.value); dirtyRef.current.add("brideName"); }}
              onBlur={() => flushField("brideName", brideName.trim())}
            />
          </FormField>
          <FormField label={tt(lang, "اسم العريس *", "שם החתן *")}>
            <input
              data-testid="design-groom-name"
              className="input-field"
              type="text"
              value={groomDisplayName}
              disabled={!editable}
              onChange={(e) => { setGroomDisplayName(e.target.value); dirtyRef.current.add("groomDisplayName"); }}
              onBlur={() => flushField("groomDisplayName", groomDisplayName.trim())}
            />
          </FormField>
        </Section>

        {/* Field: Wedding date */}
        <Section title={tt(lang, "تاريخ الزفاف", "תאריך החתונה")}>
          <FormField label={tt(lang, "اختر التاريخ", "בחר תאריך")}>
            <input
              data-testid="design-wedding-date"
              className="input-field"
              type="date"
              value={weddingDate}
              disabled={!editable}
              onChange={(e) => { setWeddingDate(e.target.value); dirtyRef.current.add("weddingDate"); }}
              onBlur={() => flushField("weddingDate", inputToEpoch(weddingDate))}
              style={{ direction: "ltr" }}
            />
          </FormField>
        </Section>

        {/* Field: Venue */}
        <Section title={tt(lang, "مكان الحفل", "מקום האירוע")}>
          <FormField label={tt(lang, "اسم القاعة / المكان", "שם האולם / המקום")}>
            <input
              data-testid="design-venue"
              className="input-field"
              type="text"
              value={venue}
              maxLength={120}
              disabled={!editable}
              onChange={(e) => { setVenue(e.target.value); dirtyRef.current.add("venue"); }}
              onBlur={() => flushField("venue", venue.trim())}
            />
          </FormField>
          <FormField label={tt(lang, "العنوان الكامل", "כתובת מלאה")}>
            <input
              data-testid="design-venue-address"
              className="input-field"
              type="text"
              value={venueAddress}
              maxLength={200}
              disabled={!editable}
              onChange={(e) => { setVenueAddress(e.target.value); dirtyRef.current.add("venueAddress"); }}
              onBlur={() => flushField("venueAddress", venueAddress.trim())}
            />
          </FormField>
        </Section>

        {/* Field: Custom message */}
        <Section title={tt(lang, "رسالة شخصية", "מסר אישי")}>
          <FormField label={tt(lang, "رسالة من العروسين للضيوف (اختياري)", "מסר מהזוג לאורחים (אופציונלי)")}>
            <textarea
              data-testid="design-custom-message"
              className="input-field"
              rows={4}
              value={customMessage}
              maxLength={500}
              disabled={!editable}
              onChange={(e) => { setCustomMessage(e.target.value); dirtyRef.current.add("customMessage"); }}
              onBlur={() => flushField("customMessage", customMessage)}
              style={{ resize: "vertical", minHeight: 80 }}
            />
            <div style={{ fontSize: 10, color: C.dim, textAlign: "end", marginTop: 4 }}>
              {customMessage.length}/500
            </div>
          </FormField>
        </Section>

        {/* Field: Theme color */}
        <Section title={tt(lang, "لون التصميم", "צבע העיצוב")}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(110px, 1fr))", gap: 10 }}>
            {DIGITAL_THEME_KEYS.map((k) => {
              const t = DIGITAL_THEMES[k];
              const active = themeColor === k;
              return (
                <button
                  key={k}
                  data-testid={`design-theme-${k}`}
                  onClick={() => onPickTheme(k)}
                  disabled={!editable}
                  style={{
                    padding: "12px 10px",
                    borderRadius: 12,
                    border: `2px solid ${active ? C.gold : "rgba(255,255,255,.08)"}`,
                    background: active ? "rgba(201,168,76,.10)" : "rgba(255,255,255,.02)",
                    cursor: editable ? "pointer" : "not-allowed",
                    opacity: editable ? 1 : 0.55,
                    fontFamily: "inherit",
                    textAlign: "center",
                  }}
                >
                  <div
                    style={{
                      width: 36,
                      height: 36,
                      borderRadius: "50%",
                      margin: "0 auto 6px",
                      background: t.swatch,
                      border: `2px solid ${t.bg}`,
                      boxShadow: `0 0 0 1px ${t.accentLine}`,
                    }}
                  />
                  <div style={{ fontSize: 11, fontWeight: 800, color: active ? C.gold : C.goldLight }}>
                    {tt(lang, t.label_ar, t.label_he)}
                  </div>
                </button>
              );
            })}
          </div>
        </Section>

        {/* Field: Font */}
        <Section title={tt(lang, "نوع الخط", "סוג גופן")}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))", gap: 10 }}>
            {DIGITAL_FONT_KEYS.map((k) => {
              const f = DIGITAL_FONTS[k];
              const active = fontFamily === k;
              return (
                <button
                  key={k}
                  data-testid={`design-font-${k}`}
                  onClick={() => onPickFont(k)}
                  disabled={!editable}
                  style={{
                    padding: "14px 10px",
                    borderRadius: 12,
                    border: `2px solid ${active ? C.gold : "rgba(255,255,255,.08)"}`,
                    background: active ? "rgba(201,168,76,.10)" : "rgba(255,255,255,.02)",
                    cursor: editable ? "pointer" : "not-allowed",
                    opacity: editable ? 1 : 0.55,
                    fontFamily: f.family,
                    textAlign: "center",
                  }}
                >
                  <div style={{ fontSize: 28, fontWeight: 900, color: active ? C.gold : C.goldLight, lineHeight: 1.2 }}>
                    {tt(lang, "كلمات", "מילים")}
                  </div>
                  <div style={{ fontSize: 10, fontFamily: "inherit", color: C.dim, marginTop: 4 }}>
                    {tt(lang, f.label_ar, f.label_he)}
                  </div>
                </button>
              );
            })}
          </div>
        </Section>

        {/* Field: Media */}
        <Section title={tt(lang, "الصور والفيديو", "תמונות וסרטונים")}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(110px, 1fr))", gap: 8, marginBottom: 12 }}>
            {media.map((m, i) => (
              <div
                key={m.storagePath || i}
                style={{
                  position: "relative",
                  aspectRatio: "1",
                  borderRadius: 10,
                  overflow: "hidden",
                  border: "1px solid rgba(201,168,76,.2)",
                }}
              >
                {m.kind === "video" ? (
                  <video src={m.url} muted playsInline style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                ) : (
                  <img src={m.url} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                )}
                {editable && (
                  <button
                    onClick={() => onRemoveMedia(m)}
                    aria-label="delete"
                    style={{
                      position: "absolute",
                      top: 4,
                      insetInlineEnd: 4,
                      width: 24,
                      height: 24,
                      borderRadius: 12,
                      background: "rgba(0,0,0,.6)",
                      border: "1px solid rgba(212,80,58,.4)",
                      color: "#fff",
                      fontSize: 12,
                      cursor: "pointer",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    ✕
                  </button>
                )}
              </div>
            ))}
          </div>
          {editable && (
            <label
              style={{
                display: "block",
                padding: "12px 16px",
                borderRadius: 10,
                textAlign: "center",
                border: `2px dashed ${busy ? "rgba(201,168,76,.65)" : "rgba(201,168,76,.32)"}`,
                background: busy ? "rgba(201,168,76,.06)" : "rgba(201,168,76,.02)",
                cursor: busy ? "not-allowed" : "pointer",
              }}
            >
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*,video/*"
                style={{ display: "none" }}
                disabled={busy}
                data-testid="design-upload-input"
                onChange={(e) => onUpload(e.target.files?.[0])}
              />
              <div style={{ color: C.gold, fontSize: 12, fontWeight: 800 }}>
                {busy ? tt(lang, "⏳ جاري الرفع...", "⏳ מעלה...") : tt(lang, "📁 إضافة صورة أو فيديو", "📁 הוסף תמונה או סרטון")}
              </div>
            </label>
          )}
        </Section>

        {/* ── Submit / Action ──────────────────────────────────────────────── */}
        {(status === "draft" || status === "rejected") && (
          <button
            data-testid="design-submit-btn"
            className="gold-btn"
            onClick={onSubmit}
            disabled={busy}
            style={{ width: "100%", padding: "14px 0", fontSize: 14, marginTop: 4 }}
          >
            {busy
              ? "..."
              : status === "rejected"
                ? tt(lang, "📨 إعادة الإرسال للاعتماد", "📨 שלח שוב לאישור")
                : tt(lang, "📨 إرسال للاعتماد", "📨 שלח לאישור")}
          </button>
        )}

        {/* ── Live preview ─────────────────────────────────────────────────── */}
        <div style={{ marginTop: 12 }}>
          <div style={{ fontSize: 12, color: C.goldDim, marginBottom: 8, fontWeight: 800, letterSpacing: 2, textTransform: "uppercase" }}>
            {tt(lang, "معاينة مباشرة", "תצוגה מקדימה חיה")}
          </div>
          <div
            data-testid="design-preview"
            style={{
              borderRadius: 16,
              overflow: "hidden",
              border: "1px solid rgba(201,168,76,.22)",
              maxHeight: 600,
              overflowY: "auto",
            }}
          >
            <DigitalInvitationView
              design={previewDesign}
              guestName={tt(lang, "اسم الضيف", "שם האורח")}
              lang={lang}
              mode="preview"
            />
          </div>
        </div>
      </div>
    </div>
  );
}

function StatusBanner({ status, doc, lang, onCancel, busy }) {
  if (status === "pending_approval") {
    return (
      <div
        data-testid="design-status-banner"
        data-design-status="pending_approval"
        style={{
          padding: "14px 16px",
          borderRadius: 12,
          marginBottom: 18,
          background: "rgba(75,159,212,.08)",
          border: "1px solid rgba(75,159,212,.32)",
          display: "flex",
          gap: 12,
          alignItems: "center",
          flexWrap: "wrap",
        }}
      >
        <div style={{ fontSize: 28 }}>⏳</div>
        <div style={{ flex: 1, minWidth: 200 }}>
          <div style={{ fontSize: 14, fontWeight: 900, color: C.blue, marginBottom: 4 }}>
            {tt(lang, "بانتظار موافقة الأدمن", "ממתין לאישור מנהל")}
          </div>
          <div style={{ fontSize: 11, color: C.dim }}>
            {tt(lang, "لا يمكن التعديل حتى نتلقى رد المراجعة.", "לא ניתן לערוך עד שהמנהל יחזיר תשובה.")}
          </div>
        </div>
        <button
          onClick={onCancel}
          disabled={busy}
          data-testid="design-cancel-btn"
          style={{
            padding: "8px 14px",
            borderRadius: 10,
            background: "rgba(255,255,255,.04)",
            border: "1px solid rgba(255,255,255,.12)",
            color: C.goldLight,
            cursor: busy ? "not-allowed" : "pointer",
            fontSize: 12,
            fontWeight: 700,
            fontFamily: "inherit",
          }}
        >
          {tt(lang, "إلغاء وتحرير", "בטל וערוך")}
        </button>
      </div>
    );
  }
  if (status === "approved") {
    return (
      <div
        data-testid="design-status-banner"
        data-design-status="approved"
        style={{
          padding: "14px 16px",
          borderRadius: 12,
          marginBottom: 18,
          background: "rgba(76,201,122,.08)",
          border: "1px solid rgba(76,201,122,.35)",
          display: "flex",
          gap: 12,
          alignItems: "center",
        }}
      >
        <div style={{ fontSize: 28 }}>✓</div>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 14, fontWeight: 900, color: "#4cc97a", marginBottom: 4 }}>
            {tt(lang, "تم اعتماد التصميم", "העיצוב אושר")}
          </div>
          <div style={{ fontSize: 11, color: C.dim }}>
            {tt(
              lang,
              "يمكنك إرسال الدعوات الآن. أي تعديل سيُعيد التصميم لمسوّدة ويتطلب اعتماداً جديداً.",
              "ניתן לשלוח הזמנות. כל עריכה תחזיר לטיוטה ותדרוש אישור מחדש.",
            )}
          </div>
        </div>
      </div>
    );
  }
  if (status === "rejected") {
    return (
      <div
        data-testid="design-status-banner"
        data-design-status="rejected"
        style={{
          padding: "14px 16px",
          borderRadius: 12,
          marginBottom: 18,
          background: "rgba(212,80,58,.08)",
          border: "1px solid rgba(212,80,58,.35)",
        }}
      >
        <div style={{ display: "flex", gap: 12, alignItems: "center", marginBottom: 8 }}>
          <div style={{ fontSize: 28 }}>⚠</div>
          <div style={{ fontSize: 14, fontWeight: 900, color: "#d4533a" }}>
            {tt(lang, "تم رفض التصميم", "העיצוב נדחה")}
          </div>
        </div>
        {doc?.designRejectionNote && (
          <div
            data-testid="design-rejection-note"
            style={{
              fontSize: 13,
              color: C.goldLight,
              padding: "10px 12px",
              borderRadius: 8,
              background: "rgba(0,0,0,.25)",
              whiteSpace: "pre-wrap",
              lineHeight: 1.7,
            }}
          >
            {doc.designRejectionNote}
          </div>
        )}
      </div>
    );
  }
  // draft
  return (
    <div
      data-testid="design-status-banner"
      data-design-status="draft"
      style={{
        padding: "14px 16px",
        borderRadius: 12,
        marginBottom: 18,
        background: "rgba(201,168,76,.06)",
        border: "1px solid rgba(201,168,76,.22)",
        display: "flex",
        gap: 12,
        alignItems: "center",
      }}
    >
      <div style={{ fontSize: 28 }}>✎</div>
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: 14, fontWeight: 900, color: C.gold, marginBottom: 4 }}>
          {tt(lang, "مسوّدة", "טיוטה")}
        </div>
        <div style={{ fontSize: 11, color: C.dim }}>
          {tt(lang, "أكمل التعديلات ثم اضغط إرسال للاعتماد.", "השלם את העריכה ולחץ שלח לאישור.")}
        </div>
      </div>
    </div>
  );
}

function Section({ title, children }) {
  return (
    <div className="gold-card" style={{ padding: 18 }}>
      <div style={{ fontSize: 13, color: C.goldLight, fontWeight: 800, marginBottom: 12, letterSpacing: 1 }}>
        {title}
      </div>
      {children}
    </div>
  );
}

function FormField({ label, children }) {
  return (
    <div style={{ marginBottom: 12 }}>
      <div style={{ fontSize: 12, color: C.goldDim, marginBottom: 5 }}>{label}</div>
      {children}
    </div>
  );
}

function epochToInput(epoch) {
  if (!epoch || !Number.isFinite(epoch)) return "";
  const d = new Date(epoch);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function inputToEpoch(value) {
  if (!value) return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return d.getTime();
}
