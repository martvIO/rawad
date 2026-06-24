// Public RSVP page opened from a WhatsApp digital invite link.
// Route: /invite/digital/:token
//
// Differs from the physical InviteForm:
//   - No address fields. The guest just confirms attendance or absence.
//   - Pre-fills name + phone from the token (read-only).
//   - Optional free-text note for the couple.
//   - Submission writes to Firestore digitalGuests via the Cloud Function.
import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { BrandLogo } from "../components/BrandLogo.jsx";
import { LangSwitcher } from "../components/LangSwitcher.jsx";
import { subscribeInviteToken } from "../services/invites.js";
import { submitDigitalGuestInvite } from "../services/digitalInvitation.js";
import { EventUnavailableNotice } from "../components/EventUnavailableNotice.jsx";
import { logErr } from "../utils/logger.js";
import { localizeApiError } from "../utils/apiError.js";
import { C } from "../styles/theme.js";

export function DigitalInviteForm({ t, lang, setLang }) {
  const { token } = useParams();
  const [tokenRec, setTokenRec] = useState(undefined); // undefined=loading, null=missing
  const [rsvp, setRsvp]   = useState(null);   // "attending" | "absent" | null
  const [note, setNote]   = useState("");
  const [busy, setBusy]   = useState(false);
  const [done, setDone]   = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!token) { setTokenRec(null); return; }
    const unsub = subscribeInviteToken(token, (rec) => setTokenRec(rec));
    return () => unsub();
  }, [token]);

  const submit = async () => {
    if (!rsvp) {
      setError(lang === "he" ? "אנא בחר תשובה" : "يرجى اختيار إجابة");
      return;
    }
    setError("");
    setBusy(true);
    try {
      await submitDigitalGuestInvite({ token, rsvp, note: note.trim() });
      setDone(true);
    } catch (err) {
      logErr("submitDigitalGuestInvite", err);
      const code = err?.code || "";
      if (code.includes("deadline-exceeded")) setError(lang === "he" ? "הקישור פג תוקף" : "انتهت صلاحية الرابط");
      else if (code.includes("not-found"))    setError(lang === "he" ? "קישור לא תקין" : "رابط غير صالح");
      else if (code.includes("already-exists")) setError(lang === "he" ? "כבר השבת" : "تم الرد مسبقاً");
      else setError(localizeApiError(err, lang));
    } finally {
      setBusy(false);
    }
  };

  // ── Loading / error states ────────────────────────────────────────────────
  if (tokenRec === undefined) {
    return <CenteredMessage><div style={{ color: C.dim, fontSize: 14 }}>...</div></CenteredMessage>;
  }
  if (tokenRec === null) {
    return (
      <CenteredMessage>
        <div style={{ fontSize: 56, marginBottom: 12 }}>⚠️</div>
        <h1 style={{ fontFamily: "'Amiri','Frank Ruhl Libre',serif", color: C.red, fontSize: 24, marginBottom: 8 }}>
          {lang === "he" ? "קישור לא תקין" : "رابط غير صالح"}
        </h1>
      </CenteredMessage>
    );
  }
  if (tokenRec.guestType && tokenRec.guestType !== "digital") {
    return (
      <CenteredMessage>
        <div style={{ fontSize: 56, marginBottom: 12 }}>⚠️</div>
        <h1 style={{ fontFamily: "'Amiri','Frank Ruhl Libre',serif", color: C.red, fontSize: 22, marginBottom: 8 }}>
          {lang === "he" ? "סוג הזמנה לא נכון" : "نوع الدعوة غير صحيح"}
        </h1>
      </CenteredMessage>
    );
  }
  if (tokenRec.eventStatus && tokenRec.eventStatus !== "active" && !done) {
    return <EventUnavailableNotice state={tokenRec.eventStatus} t={t} lang={lang} />;
  }
  if (tokenRec.expiresAt && Date.now() > tokenRec.expiresAt) {
    return (
      <CenteredMessage>
        <div style={{ fontSize: 56, marginBottom: 12 }}>⏰</div>
        <h1 style={{ fontFamily: "'Amiri','Frank Ruhl Libre',serif", color: C.red, fontSize: 24, marginBottom: 8 }}>
          {lang === "he" ? "הקישור פג תוקף" : "انتهت صلاحية الرابط"}
        </h1>
      </CenteredMessage>
    );
  }
  if (tokenRec.usedAt && !done) {
    return (
      <CenteredMessage>
        <div style={{ fontSize: 56, marginBottom: 12 }}>✅</div>
        <h1 style={{ fontFamily: "'Amiri','Frank Ruhl Libre',serif", color: "#4cc97a", fontSize: 24, marginBottom: 8 }}>
          {lang === "he" ? "כבר השבת — תודה!" : "تم الرد مسبقاً — شكراً!"}
        </h1>
      </CenteredMessage>
    );
  }
  if (done) {
    return (
      <CenteredMessage>
        <div style={{ fontSize: 64, marginBottom: 16 }}>🎉</div>
        <h1 style={{ fontFamily: "'Amiri','Frank Ruhl Libre',serif", color: "#4cc97a", fontSize: 28, marginBottom: 12 }}>
          {lang === "he" ? "תודה!" : "شكراً جزيلاً!"}
        </h1>
        <p style={{ color: "rgba(245,230,184,.8)", fontSize: 14, lineHeight: 1.9 }}>
          {rsvp === "attending"
            ? (lang === "he" ? "מחכים לראותך באירוע 💛" : "بانتظارك في الحفل 💛")
            : (lang === "he" ? "מצטערים שלא תוכל להגיע" : "نأسف لعدم استطاعتك الحضور")}
        </p>
      </CenteredMessage>
    );
  }

  // ── Form ──────────────────────────────────────────────────────────────────
  return (
    <div style={{ minHeight: "100vh", padding: "24px 16px" }}>
      <div style={{ maxWidth: 480, margin: "0 auto" }}>
        <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 12 }}>
          <LangSwitcher lang={lang} setLang={setLang}/>
        </div>

        <div style={{ textAlign: "center", marginBottom: 24 }}>
          <div style={{ display: "flex", justifyContent: "center", marginBottom: 14 }}>
            <BrandLogo size={68} />
          </div>
          <h1 style={{ fontFamily: "'Amiri','Frank Ruhl Libre',serif", color: C.gold, fontSize: 26, marginBottom: 10 }}>
            {lang === "he" ? "אישור הגעה" : "تأكيد الحضور"}
          </h1>
          <p style={{ color: "rgba(245,230,184,.78)", fontSize: 13, lineHeight: 1.9, maxWidth: 400, margin: "0 auto" }}>
            {lang === "he"
              ? "אנא אשר את הגעתך בלחיצה על אחת מהאפשרויות"
              : "يرجى تأكيد حضورك بالضغط على أحد الخيارات"}
          </p>
        </div>

        <div className="gold-card">
          {/* Pre-filled name + phone (read-only) */}
          <div style={{
            marginBottom: 18, padding: "14px 16px", borderRadius: 12,
            background: "rgba(201,168,76,.06)", border: "1px solid rgba(201,168,76,.2)",
          }}>
            <div style={{ fontSize: 11, color: C.goldDim, marginBottom: 4 }}>
              {lang === "he" ? "מוזמן/ת" : "المعزوم"}
            </div>
            <div style={{ fontSize: 15, fontWeight: 800, color: C.goldLight, marginBottom: 6 }}>
              {tokenRec.guestName || "—"}
            </div>
            <div style={{ fontSize: 12, color: C.dim, direction: "ltr", textAlign: "left" }}>
              {tokenRec.guestPhone || ""}
            </div>
          </div>

          {/* RSVP buttons */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 18 }}>
            <button onClick={() => setRsvp("attending")} style={rsvpBtnStyle(rsvp === "attending", "#4cc97a")}>
              <div style={{ fontSize: 32, marginBottom: 6 }}>✓</div>
              <div style={{ fontSize: 14, fontWeight: 900 }}>
                {lang === "he" ? "מגיע/ה" : "سأحضر"}
              </div>
            </button>
            <button onClick={() => setRsvp("absent")} style={rsvpBtnStyle(rsvp === "absent", C.red)}>
              <div style={{ fontSize: 32, marginBottom: 6 }}>✗</div>
              <div style={{ fontSize: 14, fontWeight: 900 }}>
                {lang === "he" ? "לא מגיע/ה" : "لن أحضر"}
              </div>
            </button>
          </div>

          <div style={{ marginBottom: 6, fontSize: 12, color: C.goldDim }}>
            {lang === "he" ? "הערה לזוג (אופציונלי)" : "ملاحظة للعروسين (اختياري)"}
          </div>
          <textarea className="input-field" rows={3}
                    value={note} onChange={e => setNote(e.target.value.slice(0, 500))}
                    placeholder={lang === "he" ? "ברכה, הערה..." : "تهنئة، ملاحظة..."}
                    style={{ marginBottom: 14, resize: "vertical", minHeight: 64, fontFamily: "inherit" }}/>

          {error && (
            <div style={{ color: C.red, fontSize: 12, marginBottom: 12, textAlign: "center" }}>{error}</div>
          )}

          <button className="gold-btn" style={{ width: "100%" }} onClick={submit} disabled={busy || !rsvp}>
            {busy ? "…" : (lang === "he" ? "שלח" : "إرسال")}
          </button>
        </div>
      </div>
    </div>
  );
}

function CenteredMessage({ children }) {
  return (
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
      <div style={{ maxWidth: 460, width: "100%", textAlign: "center" }}>{children}</div>
    </div>
  );
}

const rsvpBtnStyle = (selected, color) => ({
  padding: "20px 12px", borderRadius: 14, cursor: "pointer",
  background: selected ? `${color}26` : "rgba(255,255,255,.03)",
  border: `2px solid ${selected ? color : "rgba(255,255,255,.07)"}`,
  color: selected ? color : "rgba(245,230,184,.6)",
  fontFamily: "inherit", transition: "all .2s ease",
  display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
});
