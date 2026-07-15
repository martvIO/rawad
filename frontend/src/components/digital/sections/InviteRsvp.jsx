import { Num } from "../../Num.jsx";
import { ON_GOLD, SectionHead } from "../inviteShared.jsx";
import { PhoneInput } from "../../PhoneInput.jsx";
import { useRsvpForm } from "../../../hooks/useRsvpForm.js";

// ── RSVP ────────────────────────────────────────────────────────────────────────
function RSVPSection({ theme, font, lang, opts, mealOptions, guestPhone, onSubmitRsvp, disabled, alreadyAnswered, rsvpDone }) {
  const {
    status, setStatus,
    partySize, setPartySize,
    phone, setPhone,
    meal, setMeal,
    song, setSong,
    note, setNote,
    busy, error, hearts,
    showDone, successText,
    submit,
  } = useRsvpForm({ guestPhone, opts, theme, lang, onSubmitRsvp, rsvpDone, disabled });

  return (
    <section className="dawa-inv-section" id="rsvp">
      <SectionHead
        eyebrow={lang === "he" ? "אישור הגעה" : "تأكيد الحضور"}
        title={lang === "he" ? "האם תכבדו אותנו?" : "هل ستشرّفوننا؟"}
        sub={lang === "he" ? "התשובה שלכם עוזרת לנו להכין כל פרט לערב מושלם." : "ردّكم يساعدنا في تجهيز كل التفاصيل لتكون الليلة كما تستحقّون."}
        theme={theme}
        font={font}
      />
      <div className="dawa-inv-rsvp dawa-inv-reveal" style={{ position: "relative" }}>
        {alreadyAnswered && !showDone ? (
          <div className="dawa-inv-rsvp-success" role="status" aria-live="polite">
            <div className="dawa-inv-seal" aria-hidden style={{ background: `radial-gradient(circle at 30% 30%, ${theme.gradientStops[1]} 0%, ${theme.accent} 65%)`, color: ON_GOLD }}>✓</div>
            <h3 className="dawa-inv-grad" style={{ fontFamily: font.family, background: `linear-gradient(135deg,${theme.gradientStops.join(",")})`, WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>
              {lang === "he" ? "כבר אישרת" : "تم تأكيد ردك"}
            </h3>
          </div>
        ) : showDone ? (
          <div className="dawa-inv-rsvp-success" role="status" aria-live="polite">
            <div className="dawa-inv-seal" aria-hidden style={{ background: `radial-gradient(circle at 30% 30%, ${theme.gradientStops[1]} 0%, ${theme.accent} 65%)`, color: ON_GOLD }}>✓</div>
            <h3 className="dawa-inv-grad" style={{ fontFamily: font.family, background: `linear-gradient(135deg,${theme.gradientStops.join(",")})`, WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>
              {status === "absent" ? (lang === "he" ? "תודה שהודעת" : "نشكر إعلامكم") : (lang === "he" ? "תודה רבה! נתראה" : "شكراً لكم! ننتظركم")}
            </h3>
            <p style={{ color: theme.textSoft, fontFamily: font.family }}>{successText}</p>
          </div>
        ) : (
          <>
            <div className="dawa-inv-field">
              <label id="rsvp-attend-label" style={{ color: theme.accent, fontFamily: font.family }}>{lang === "he" ? "האם תגיעו?" : "هل ستحضرون؟"}</label>
              <div className="dawa-inv-toggle" role="group" aria-labelledby="rsvp-attend-label" style={{ borderColor: theme.accentLine }}>
                <ToggleBtn theme={theme} font={font} active={status === "attending"} onClick={() => setStatus("attending")} label={lang === "he" ? "✓ אגיע" : "✓ سأحضر"} />
                <ToggleBtn theme={theme} font={font} active={status === "absent"} onClick={() => setStatus("absent")} label={lang === "he" ? "לצערי לא" : "للأسف لا"} />
              </div>
            </div>

            {status && (
              <div className="dawa-inv-field">
                <label htmlFor="rsvp-phone" style={{ color: theme.accent, fontFamily: font.family }}>{lang === "he" ? "מספר הטלפון שלך" : "رقم هاتفك"}</label>
                <PhoneInput
                  value={phone}
                  onChange={setPhone}
                  lang={lang}
                  inputId="rsvp-phone"
                />
              </div>
            )}

            {status === "attending" && opts.companions && (
              <div className="dawa-inv-field">
                <label id="rsvp-party-label" style={{ color: theme.accent, fontFamily: font.family }}>{lang === "he" ? "כמה אתם?" : "كم شخصاً انتم ؟"}</label>
                <div className="dawa-inv-stepper" role="group" aria-labelledby="rsvp-party-label">
                  <button style={{ borderColor: theme.accentLine, color: theme.accent }} onClick={() => setPartySize((c) => Math.max(1, c - 1))} aria-label="-">−</button>
                  <span style={{ color: theme.text, fontFamily: font.family }}><Num>{partySize}</Num></span>
                  <button style={{ borderColor: theme.accentLine, color: theme.accent }} onClick={() => setPartySize((c) => Math.min(21, c + 1))} aria-label="+">+</button>
                </div>
              </div>
            )}

            {status === "attending" && opts.meal && mealOptions.length > 0 && (
              <div className="dawa-inv-field">
                <label id="rsvp-meal-label" style={{ color: theme.accent, fontFamily: font.family }}>{lang === "he" ? "העדפת מנה" : "تفضيل الطعام"}</label>
                <div className="dawa-inv-chips" role="group" aria-labelledby="rsvp-meal-label">
                  {mealOptions.map((opt) => (
                    <button
                      key={opt}
                      className={`dawa-inv-chip${meal === opt ? " is-on" : ""}`}
                      style={meal === opt
                        ? { color: ON_GOLD, background: `linear-gradient(135deg,${theme.gradientStops.join(",")})`, borderColor: "transparent" }
                        : { color: theme.textSoft, borderColor: theme.accentLine }}
                      onClick={() => setMeal(opt)}
                    >
                      {opt}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {status === "attending" && opts.song && (
              <div className="dawa-inv-field">
                <label htmlFor="rsvp-song" style={{ color: theme.accent, fontFamily: font.family }}>{lang === "he" ? "שיר שתרצו שינוגן" : "أغنية تحبون أن تُعزَف"}</label>
                <input
                  id="rsvp-song"
                  className="dawa-inv-input"
                  style={{ color: theme.text, borderColor: theme.accentLine, fontFamily: font.family }}
                  value={song}
                  onChange={(e) => setSong(e.target.value.slice(0, 120))}
                  placeholder={lang === "he" ? "שם השיר והאמן..." : "اسم الأغنية والمطرب..."}
                  dir="auto"
                />
              </div>
            )}

            <div className="dawa-inv-field">
              <label htmlFor="rsvp-note" style={{ color: theme.accent, fontFamily: font.family }}>{lang === "he" ? "ברכה לזוג" : "رسالة للعروسين"}</label>
              <textarea
                id="rsvp-note"
                className="dawa-inv-input dawa-inv-textarea"
                style={{ color: theme.text, borderColor: theme.accentLine, fontFamily: font.family }}
                rows={3}
                value={note}
                onChange={(e) => setNote(e.target.value.slice(0, 500))}
                placeholder={lang === "he" ? "מזל טוב מראש..." : "مبروك مقدماً..."}
              />
            </div>

            {error && <div role="alert" aria-live="assertive" style={{ color: theme.rsvpAbsent, fontSize: 13, marginBottom: 12, textAlign: "center" }}>{error}</div>}

            <button
              className="dawa-inv-submit"
              style={{ color: ON_GOLD, background: `linear-gradient(135deg,${theme.gradientStops.join(",")})`, fontFamily: font.family, opacity: disabled ? 0.6 : 1 }}
              onClick={submit}
              disabled={busy || !status || disabled}
            >
              {busy ? (lang === "he" ? "שולח..." : "جاري الإرسال...") : `${lang === "he" ? "שלח את תשובתי" : "إرسال ردّي"} ←`}
            </button>
          </>
        )}

        <div className="dawa-inv-hearts">
          {hearts.map((h) => (
            <span key={h.id} style={{ left: h.left + "%", animationDelay: h.delay + "s", color: theme.accent, "--hx": h.hx + "px" }}>♥</span>
          ))}
        </div>
      </div>
    </section>
  );
}

function ToggleBtn({ theme, font, active, onClick, label }) {
  return (
    <button
      onClick={onClick}
      className="dawa-inv-toggle-btn"
      style={active
        ? { color: ON_GOLD, background: `linear-gradient(135deg,${theme.gradientStops.join(",")})`, borderColor: "transparent", fontFamily: font.family }
        : { color: theme.textSoft, borderColor: theme.accentLine, fontFamily: font.family }}
    >
      {label}
    </button>
  );
}

export { RSVPSection };
