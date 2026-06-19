import { useEffect,useState } from "react";
import { Num } from "../../Num.jsx";
import { ON_GOLD, SectionHead } from "../inviteShared.jsx";
import { localizeApiError } from "../../../utils/apiError.js";
import { PhoneInput, isCompletePhone } from "../../PhoneInput.jsx";

// ── RSVP ────────────────────────────────────────────────────────────────────────
function confettiBurst(palette) {
  const root = document.createElement("div");
  root.className = "dawa-inv-confetti";
  document.body.appendChild(root);
  for (let i = 0; i < 80; i++) {
    const sp = document.createElement("span");
    const angle = Math.random() * Math.PI * 2;
    const dist = 220 + Math.random() * 280;
    sp.style.background = palette[i % palette.length];
    sp.style.setProperty("--x", `${Math.cos(angle) * dist}px`);
    sp.style.setProperty("--y", `${Math.sin(angle) * dist - 100}px`);
    sp.style.setProperty("--r", `${Math.random() * 720 - 360}deg`);
    sp.style.animationDelay = Math.random() * 0.2 + "s";
    root.appendChild(sp);
  }
  setTimeout(() => root.remove(), 1800);
}

function RSVPSection({ theme, font, lang, opts, mealOptions, guestPhone, onSubmitRsvp, disabled, alreadyAnswered, rsvpDone }) {
  const [status, setStatus] = useState(null); // "attending" | "absent"
  // Total headcount INCLUDING the invited guest (min 1). The backend still
  // stores `companions` = partySize - 1 (people besides the guest), so all
  // existing "expected attendees" totals and validation stay correct.
  const [partySize, setPartySize] = useState(1);
  const [phone, setPhone] = useState(guestPhone || "");
  const [meal, setMeal] = useState("");
  const [song, setSong] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);
  const [hearts, setHearts] = useState([]);

  // Pre-fill the phone from the invite token, but let the guest correct it.
  useEffect(() => { setPhone(guestPhone || ""); }, [guestPhone]);

  const submit = async () => {
    if (!status) {
      setError(lang === "he" ? "אנא בחרו תשובה" : "يرجى اختيار إجابة");
      return;
    }
    const phoneClean = (phone || "").trim();
    if (!isCompletePhone(phoneClean)) {
      setError(lang === "he" ? "אנא הזינו מספר טלפון תקין" : "يرجى إدخال رقم هاتف صحيح");
      return;
    }
    setError("");
    if (disabled) return;
    setBusy(true);
    try {
      await onSubmitRsvp?.({
        rsvp: status,
        note: note.trim(),
        submittedPhone: phoneClean,
        companions: status === "attending" && opts.companions ? Math.max(0, partySize - 1) : null,
        mealPreference: status === "attending" && opts.meal ? meal : "",
        songRequest: status === "attending" && opts.song ? song.trim() : "",
      });
      setDone(true);
      if (status === "attending") {
        confettiBurst([
          theme.gradientStops[0], theme.gradientStops[1], theme.gradientStops[2],
          theme.accent, theme.monoStops[0], theme.monoStops[1],
        ]);
        const newH = Array.from({ length: 8 }, (_, i) => ({
          id: Date.now() + i,
          left: 40 + Math.random() * 20,
          hx: (Math.random() - 0.5) * 200,
          delay: i * 0.15,
        }));
        setHearts(newH);
        setTimeout(() => setHearts([]), 3500);
      }
    } catch (e) {
      setError(localizeApiError(e, lang));
    } finally {
      setBusy(false);
    }
  };

  const showDone = done || rsvpDone;
  const successText = status === "absent"
    ? (lang === "he" ? "תודה שהודעת. נתראה בהזדמנות אחרת." : "نشكر إعلامكم، ونلتقي في مناسبة أخرى قريبة.")
    : (lang === "he"
      ? `שמחים לארח אתכם${opts.companions && partySize > 1 ? ` (${partySize} אורחים)` : ""}. נתראה באירוע!`
      : `سعداء بحضوركم${opts.companions && partySize > 1 ? ` (${partySize} أشخاص)` : ""}. ننتظركم في الحفل!`);

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
          <div className="dawa-inv-rsvp-success">
            <div className="dawa-inv-seal" style={{ background: `radial-gradient(circle at 30% 30%, ${theme.gradientStops[1]} 0%, ${theme.accent} 65%)`, color: ON_GOLD }}>✓</div>
            <h3 className="dawa-inv-grad" style={{ fontFamily: font.family, background: `linear-gradient(135deg,${theme.gradientStops.join(",")})`, WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>
              {lang === "he" ? "כבר אישרת" : "تم تأكيد ردك"}
            </h3>
          </div>
        ) : showDone ? (
          <div className="dawa-inv-rsvp-success">
            <div className="dawa-inv-seal" style={{ background: `radial-gradient(circle at 30% 30%, ${theme.gradientStops[1]} 0%, ${theme.accent} 65%)`, color: ON_GOLD }}>✓</div>
            <h3 className="dawa-inv-grad" style={{ fontFamily: font.family, background: `linear-gradient(135deg,${theme.gradientStops.join(",")})`, WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>
              {status === "absent" ? (lang === "he" ? "תודה שהודעת" : "نشكر إعلامكم") : (lang === "he" ? "תודה רבה! נתראה" : "شكراً لكم! ننتظركم")}
            </h3>
            <p style={{ color: theme.textSoft, fontFamily: font.family }}>{successText}</p>
          </div>
        ) : (
          <>
            <div className="dawa-inv-field">
              <label style={{ color: theme.accent, fontFamily: font.family }}>{lang === "he" ? "האם תגיעו?" : "هل ستحضرون؟"}</label>
              <div className="dawa-inv-toggle" style={{ borderColor: theme.accentLine }}>
                <ToggleBtn theme={theme} font={font} active={status === "attending"} onClick={() => setStatus("attending")} label={lang === "he" ? "✓ אגיע" : "✓ سأحضر"} />
                <ToggleBtn theme={theme} font={font} active={status === "absent"} onClick={() => setStatus("absent")} label={lang === "he" ? "לצערי לא" : "للأسف لا"} />
              </div>
            </div>

            {status && (
              <div className="dawa-inv-field">
                <label style={{ color: theme.accent, fontFamily: font.family }}>{lang === "he" ? "מספר הטלפון שלך" : "رقم هاتفك"}</label>
                <PhoneInput
                  value={phone}
                  onChange={setPhone}
                  lang={lang}
                />
              </div>
            )}

            {status === "attending" && opts.companions && (
              <div className="dawa-inv-field">
                <label style={{ color: theme.accent, fontFamily: font.family }}>{lang === "he" ? "כמה אתם?" : "كم شخصاً انتم ؟"}</label>
                <div className="dawa-inv-stepper">
                  <button style={{ borderColor: theme.accentLine, color: theme.accent }} onClick={() => setPartySize((c) => Math.max(1, c - 1))} aria-label="-">−</button>
                  <span style={{ color: theme.text, fontFamily: font.family }}><Num>{partySize}</Num></span>
                  <button style={{ borderColor: theme.accentLine, color: theme.accent }} onClick={() => setPartySize((c) => Math.min(21, c + 1))} aria-label="+">+</button>
                </div>
              </div>
            )}

            {status === "attending" && opts.meal && mealOptions.length > 0 && (
              <div className="dawa-inv-field">
                <label style={{ color: theme.accent, fontFamily: font.family }}>{lang === "he" ? "העדפת מנה" : "تفضيل الطعام"}</label>
                <div className="dawa-inv-chips">
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
                <label style={{ color: theme.accent, fontFamily: font.family }}>{lang === "he" ? "שיר שתרצו שינוגן" : "أغنية تحبون أن تُعزَف"}</label>
                <input
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
              <label style={{ color: theme.accent, fontFamily: font.family }}>{lang === "he" ? "ברכה לזוג" : "رسالة للعروسين"}</label>
              <textarea
                className="dawa-inv-input dawa-inv-textarea"
                style={{ color: theme.text, borderColor: theme.accentLine, fontFamily: font.family }}
                rows={3}
                value={note}
                onChange={(e) => setNote(e.target.value.slice(0, 500))}
                placeholder={lang === "he" ? "מזל טוב מראש..." : "مبروك مقدماً..."}
              />
            </div>

            {error && <div style={{ color: theme.rsvpAbsent, fontSize: 13, marginBottom: 12, textAlign: "center" }}>{error}</div>}

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
