// Presentational layer for the digital invitation. Same component renders:
//   - the public guest page (mode="public", onSubmitRsvp wired)
//   - the groom live preview inside the editor (mode="preview")
//   - the admin Preview modal (mode="preview")
//
// All theming flows from the `design` prop (snapshot or live doc). The
// component owns no token / auth state — that lives in the route wrapper.
import { useEffect, useMemo, useRef, useState } from "react";
import { getDigitalTheme, getDigitalFont } from "../../styles/digitalThemes.js";

export function DigitalInvitationView({
  design,
  guestName,
  lang = "ar",
  mode = "preview",
  onSubmitRsvp,
  showEnvelope = false,
  alreadyAnswered = false,
  rsvpDone = false,
}) {
  const theme = getDigitalTheme(design?.themeColor);
  const font = getDigitalFont(design?.fontFamily);

  const [rsvp, setRsvp] = useState(null);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const submit = async () => {
    if (!rsvp) {
      setError(lang === "he" ? "אנא בחר תשובה" : "يرجى اختيار إجابة");
      return;
    }
    setError("");
    if (mode === "preview") return;
    setBusy(true);
    try {
      await onSubmitRsvp?.({ rsvp, note: note.trim() });
    } catch (e) {
      setError(e?.message || (lang === "he" ? "שגיאה" : "خطأ"));
    } finally {
      setBusy(false);
    }
  };

  const media = Array.isArray(design?.media) ? design.media : [];
  const brideName = design?.brideName || "";
  const groomName = design?.groomDisplayName || "";
  const venue = design?.venue || "";
  const venueAddress = design?.venueAddress || "";
  const customMessage = design?.customMessage || "";
  const weddingDate = design?.weddingDate || null;

  return (
    <div
      style={{
        minHeight: "100vh",
        background: theme.bg,
        color: theme.text,
        paddingBottom: 80,
        position: "relative",
        overflowX: "hidden",
        fontFamily: font.family,
      }}
    >
      <ViewStyles theme={theme} font={font} />
      {showEnvelope && <EnvelopeIntro guestName={guestName} theme={theme} font={font} lang={lang} />}
      <Ambience theme={theme} />

      <Hero
        guestName={guestName}
        groomName={groomName}
        brideName={brideName}
        weddingDate={weddingDate}
        lang={lang}
        theme={theme}
        font={font}
      />

      {media.length > 0 && (
        <div style={{ maxWidth: 760, margin: "0 auto", padding: "0 16px" }}>
          <MediaCarousel items={media} theme={theme} />
        </div>
      )}

      <div style={{ maxWidth: 720, margin: "0 auto", padding: "20px 16px" }}>
        {customMessage && (
          <div className="dawa-reveal" style={{ marginTop: 48 }}>
            <SectionHead
              eyebrow={lang === "he" ? "מסר מהזוג" : "رسالة من العروسين"}
              title={lang === "he" ? "כמה מילים מהלב" : "كلمات من القلب"}
              theme={theme}
              font={font}
            />
            <div
              style={{
                padding: "24px 22px",
                borderRadius: 22,
                background: theme.cardBg,
                border: `1px solid ${theme.cardBorder}`,
                color: theme.text,
                fontFamily: font.family,
                fontSize: 16,
                lineHeight: 1.95,
                whiteSpace: "pre-wrap",
                textAlign: "center",
              }}
            >
              {customMessage}
            </div>
          </div>
        )}

        {(venue || venueAddress) && (
          <div className="dawa-reveal" style={{ marginTop: 56 }}>
            <SectionHead
              eyebrow={lang === "he" ? "מקום" : "المكان"}
              title={lang === "he" ? "היכן נחגוג" : "أين سنحتفل"}
              theme={theme}
              font={font}
            />
            <div
              style={{
                padding: "24px 22px",
                borderRadius: 22,
                background: theme.cardBg,
                border: `1px solid ${theme.cardBorder}`,
                textAlign: "center",
              }}
            >
              {venue && (
                <div
                  style={{
                    fontFamily: font.family,
                    fontWeight: 900,
                    fontSize: 24,
                    background: `linear-gradient(135deg,${theme.gradientStops.join(",")})`,
                    WebkitBackgroundClip: "text",
                    WebkitTextFillColor: "transparent",
                    paddingBlock: 4,
                    marginBottom: venueAddress ? 6 : 0,
                  }}
                >
                  {venue}
                </div>
              )}
              {venueAddress && (
                <div style={{ color: theme.textSoft, fontSize: 14, lineHeight: 1.7 }}>
                  {venueAddress}
                </div>
              )}
            </div>
          </div>
        )}

        <div className="dawa-reveal" style={{ marginTop: 56 }}>
          <SectionHead
            eyebrow={lang === "he" ? "אישור הגעה" : "تأكيد الحضور"}
            title={lang === "he" ? "האם תכבדו אותנו?" : "هل ستشرّفوننا؟"}
            theme={theme}
            font={font}
          />
          {alreadyAnswered ? (
            <SuccessCard theme={theme} tone="muted">
              <div style={{ fontSize: 48, marginBottom: 8 }}>✓</div>
              <div style={{ color: theme.rsvpAttending, fontSize: 16, fontWeight: 800 }}>
                {lang === "he" ? "כבר אישרת" : "تم تأكيد ردك"}
              </div>
            </SuccessCard>
          ) : rsvpDone ? (
            <SuccessCard theme={theme} tone="success">
              <div className="dawa-success-seal" style={{ background: `linear-gradient(135deg,${theme.rsvpAttending},#2f8a55)` }}>
                ✓
              </div>
              <div
                style={{
                  color: theme.text,
                  fontSize: 22,
                  fontWeight: 900,
                  fontFamily: font.family,
                  marginBottom: 10,
                }}
              >
                {lang === "he" ? "תודה רבה!" : "شكراً جزيلاً!"}
              </div>
              <div style={{ color: theme.textSoft, fontSize: 14, lineHeight: 1.8 }}>
                {lang === "he" ? "נשמח לראותכם" : "نتشرّف بحضوركم"}
              </div>
            </SuccessCard>
          ) : (
            <RsvpForm
              theme={theme}
              font={font}
              rsvp={rsvp}
              setRsvp={setRsvp}
              note={note}
              setNote={setNote}
              busy={busy}
              error={error}
              onSubmit={submit}
              disabled={mode === "preview"}
              lang={lang}
            />
          )}
        </div>

        {weddingDate && (
          <div className="dawa-reveal" style={{ marginTop: 80 }}>
            <SectionHead
              eyebrow={lang === "he" ? "ספירה לאחור" : "العد التنازلي"}
              title={lang === "he" ? "נשאר עד החתונה" : "متبقي حتى الفرح"}
              theme={theme}
              font={font}
            />
            <Countdown weddingDate={weddingDate} theme={theme} font={font} lang={lang} />
          </div>
        )}

        <InviteFooter theme={theme} font={font} lang={lang} />
      </div>

      {mode === "preview" && (
        <div
          style={{
            position: "fixed",
            top: 14,
            insetInlineStart: 14,
            padding: "6px 12px",
            borderRadius: 999,
            background: theme.chipBg,
            border: `1px solid ${theme.chipBorder}`,
            color: theme.accent,
            fontSize: 11,
            fontWeight: 800,
            letterSpacing: 2,
            textTransform: "uppercase",
            zIndex: 60,
            fontFamily: font.family,
          }}
        >
          {lang === "he" ? "תצוגה מקדימה" : "معاينة"}
        </div>
      )}
    </div>
  );
}

function Hero({ guestName, groomName, brideName, weddingDate, lang, theme, font }) {
  const date = weddingDate ? new Date(weddingDate) : null;
  const dateText = date
    ? date.toLocaleDateString(lang === "he" ? "he-IL" : "ar-EG", {
        day: "numeric",
        month: "long",
        year: "numeric",
      })
    : "";
  const monogram = useMemo(() => {
    const g = (groomName || "").trim().charAt(0);
    const b = (brideName || "").trim().charAt(0);
    return [g, b].filter(Boolean).join("&") || "د";
  }, [groomName, brideName]);

  return (
    <section style={{ position: "relative", textAlign: "center", padding: "72px 24px 56px", overflow: "hidden" }}>
      <div
        aria-hidden="true"
        style={{
          position: "absolute",
          inset: 0,
          background: `radial-gradient(ellipse 80% 60% at 50% 30%, ${theme.accentMuted} 0%, transparent 60%)`,
          pointerEvents: "none",
        }}
      />
      <div
        style={{
          position: "relative",
          fontFamily: font.family,
          fontStyle: "italic",
          fontSize: 13,
          letterSpacing: 4,
          textTransform: "uppercase",
          color: theme.eyebrow,
          marginBottom: 24,
          display: "inline-flex",
          alignItems: "center",
          gap: 14,
          animation: "dawa-rise .9s ease both",
        }}
      >
        <span style={{ width: 40, height: 1, background: `linear-gradient(90deg, transparent, ${theme.accent})` }} />
        {lang === "he" ? "בשמחה ובאהבה" : "بكل فرح ومحبّة"}
        <span style={{ width: 40, height: 1, background: `linear-gradient(90deg, ${theme.accent}, transparent)` }} />
      </div>

      <div
        style={{
          width: 180,
          height: 180,
          margin: "0 auto 32px",
          position: "relative",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          animation: "dawa-rise 1.1s .15s cubic-bezier(.17,.67,.35,1.4) both",
        }}
      >
        <svg viewBox="0 0 200 200" width="100%" height="100%" aria-hidden="true" style={{ position: "absolute", inset: 0 }}>
          <defs>
            <linearGradient id={`dawa-mono-${theme.key}`} x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stopColor={theme.monoStops[0]} />
              <stop offset="50%" stopColor={theme.monoStops[1]} />
              <stop offset="100%" stopColor={theme.monoStops[2]} />
            </linearGradient>
          </defs>
          <circle
            cx="100"
            cy="100"
            r="92"
            fill="none"
            stroke={`url(#dawa-mono-${theme.key})`}
            strokeWidth="1.5"
            strokeDasharray="580"
            strokeDashoffset="0"
            style={{ animation: "dawa-stroke-draw 2.4s cubic-bezier(.2,.7,.2,1) both" }}
          />
          <circle cx="100" cy="100" r="80" fill="none" stroke={theme.accentMuted} strokeDasharray="2 6" />
        </svg>
        <span
          style={{
            fontFamily: font.family,
            fontWeight: 900,
            fontSize: 56,
            lineHeight: 1,
            background: `linear-gradient(135deg,${theme.monoStops.join(",")})`,
            WebkitBackgroundClip: "text",
            WebkitTextFillColor: "transparent",
            paddingBlock: 4,
          }}
        >
          {monogram}
        </span>
      </div>

      {(groomName || brideName) && (
        <div
          style={{
            fontFamily: font.family,
            fontWeight: 900,
            fontSize: "clamp(40px, 8vw, 72px)",
            lineHeight: 1.3,
            background: `linear-gradient(135deg,${theme.gradientStops.join(",")})`,
            WebkitBackgroundClip: "text",
            WebkitTextFillColor: "transparent",
            marginBottom: 18,
            letterSpacing: 0,
            paddingBlock: 8,
            animation: "dawa-rise 1.1s .3s cubic-bezier(.2,.7,.2,1) both",
          }}
        >
          {groomName}
          {groomName && brideName && (
            <span
              style={{
                fontStyle: "italic",
                fontSize: "0.5em",
                marginInline: 14,
                color: theme.accent,
                verticalAlign: "middle",
                opacity: 0.7,
              }}
            >
              {lang === "he" ? "ו" : "&"}
            </span>
          )}
          {brideName}
        </div>
      )}

      {dateText && (
        <div
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 14,
            padding: "10px 20px",
            borderRadius: 999,
            background: theme.chipBg,
            border: `1px solid ${theme.chipBorder}`,
            color: theme.text,
            fontSize: 14,
            fontWeight: 700,
            marginBottom: 24,
            animation: "dawa-rise 1.1s .45s ease both",
          }}
        >
          <strong style={{ color: theme.accent }}>{dateText}</strong>
        </div>
      )}

      <div
        style={{
          fontFamily: font.family,
          fontStyle: "italic",
          color: theme.textSoft,
          fontSize: 17,
          lineHeight: 1.85,
          maxWidth: 480,
          marginInline: "auto",
          animation: "dawa-rise 1.1s .6s ease both",
        }}
      >
        {lang === "he" ? "נשמח לחגוג איתך" : "نشرّف لقاءك"}،
        <br />
        <strong
          style={{
            color: theme.text,
            fontStyle: "normal",
            fontSize: 22,
            display: "inline-block",
            marginTop: 6,
          }}
        >
          {guestName || "—"}
        </strong>
      </div>
    </section>
  );
}

function SectionHead({ eyebrow, title, theme, font }) {
  return (
    <div style={{ textAlign: "center", marginBottom: 28 }}>
      <div
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 12,
          fontSize: 11,
          color: theme.accent,
          fontWeight: 800,
          letterSpacing: 3,
          textTransform: "uppercase",
          marginBottom: 12,
        }}
      >
        <span style={{ width: 22, height: 1, background: `linear-gradient(90deg, transparent, ${theme.accent})` }} />
        {eyebrow}
        <span style={{ width: 22, height: 1, background: `linear-gradient(90deg, ${theme.accent}, transparent)` }} />
      </div>
      <h2
        style={{
          fontFamily: font.family,
          fontWeight: 900,
          fontSize: "clamp(26px,4vw,38px)",
          lineHeight: 1.35,
          background: `linear-gradient(135deg,${theme.gradientStops.join(",")})`,
          WebkitBackgroundClip: "text",
          WebkitTextFillColor: "transparent",
          letterSpacing: 0,
          paddingBlock: 4,
        }}
      >
        {title}
      </h2>
    </div>
  );
}

function RsvpForm({ theme, font, rsvp, setRsvp, note, setNote, busy, error, onSubmit, disabled, lang }) {
  return (
    <div
      style={{
        padding: "28px 24px",
        borderRadius: 24,
        background: theme.cardBg,
        border: `1px solid ${theme.cardBorder}`,
        backdropFilter: "blur(20px)",
        WebkitBackdropFilter: "blur(20px)",
      }}
    >
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 18 }}>
        <RsvpToggleBtn
          theme={theme}
          active={rsvp === "attending"}
          onClick={() => setRsvp("attending")}
          color={theme.rsvpAttending}
          glyph="✓"
          label={lang === "he" ? "מאשר/ת הגעה" : "سأحضر"}
        />
        <RsvpToggleBtn
          theme={theme}
          active={rsvp === "absent"}
          onClick={() => setRsvp("absent")}
          color={theme.rsvpAbsent}
          glyph="✗"
          label={lang === "he" ? "לא אוכל להגיע" : "أعتذر"}
        />
      </div>

      <label
        style={{
          display: "block",
          marginBottom: 8,
          fontSize: 12,
          color: theme.textSoft,
          letterSpacing: 1.5,
          textTransform: "uppercase",
          fontWeight: 700,
        }}
      >
        {lang === "he" ? "הוסף ברכה" : "أضف رسالة"}
      </label>
      <textarea
        rows={3}
        value={note}
        onChange={(e) => setNote(e.target.value.slice(0, 500))}
        placeholder={lang === "he" ? "מבורך מראש..." : "مبروك مقدماً..."}
        disabled={disabled}
        style={{
          width: "100%",
          background: theme.chipBg,
          border: `1px solid ${theme.accentLine}`,
          borderRadius: 12,
          padding: "12px 14px",
          color: theme.text,
          fontSize: 14,
          fontFamily: font.family,
          resize: "vertical",
          minHeight: 80,
          outline: "none",
          marginBottom: 14,
        }}
      />

      {error && (
        <div style={{ color: theme.rsvpAbsent, fontSize: 12, marginBottom: 12, textAlign: "center" }}>
          {error}
        </div>
      )}

      <button
        className="gold-btn"
        style={{ width: "100%", opacity: disabled ? 0.6 : 1 }}
        onClick={onSubmit}
        disabled={busy || !rsvp || disabled}
      >
        {busy ? <span className="spinner" /> : `${lang === "he" ? "שלח" : "إرسال"} ←`}
      </button>
    </div>
  );
}

function RsvpToggleBtn({ theme, active, onClick, color, glyph, label }) {
  return (
    <button
      onClick={onClick}
      style={{
        padding: "20px 12px",
        borderRadius: 16,
        cursor: "pointer",
        background: active ? `${color}1f` : theme.chipBg,
        border: `2px solid ${active ? color : theme.accentLine}`,
        color: active ? color : theme.textSoft,
        fontFamily: "inherit",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 6,
        transition: "all .25s cubic-bezier(.2,.95,.25,1.1)",
      }}
    >
      <div style={{ fontSize: 28, lineHeight: 1 }}>{glyph}</div>
      <div style={{ fontSize: 13, fontWeight: 900 }}>{label}</div>
    </button>
  );
}

function SuccessCard({ children, tone, theme }) {
  const isSuccess = tone === "success";
  return (
    <div
      style={{
        padding: "36px 24px",
        textAlign: "center",
        borderRadius: 24,
        background: isSuccess ? theme.successBg : theme.cardBg,
        border: `1px solid ${isSuccess ? theme.successBorder : theme.cardBorder}`,
        backdropFilter: "blur(20px)",
        WebkitBackdropFilter: "blur(20px)",
        position: "relative",
        overflow: "hidden",
      }}
    >
      {children}
    </div>
  );
}

function MediaCarousel({ items, theme }) {
  const [idx, setIdx] = useState(0);
  const timer = useRef(null);

  useEffect(() => {
    if (items.length <= 1) return;
    timer.current = setInterval(() => setIdx((i) => (i + 1) % items.length), 5000);
    return () => clearInterval(timer.current);
  }, [items.length]);

  const item = items[idx];
  if (!item) return null;

  return (
    <div
      style={{
        position: "relative",
        borderRadius: 22,
        overflow: "hidden",
        marginTop: 8,
        marginBottom: 4,
        boxShadow: "0 30px 80px -30px rgba(0,0,0,.6)",
        border: `1px solid ${theme.accentLine}`,
      }}
    >
      {item.kind === "video" ? (
        <video src={item.url} autoPlay muted loop playsInline style={{ width: "100%", maxHeight: 480, objectFit: "cover", display: "block" }} />
      ) : (
        <img src={item.url} alt="" style={{ width: "100%", maxHeight: 480, objectFit: "cover", display: "block" }} />
      )}
      {items.length > 1 && (
        <div style={{ position: "absolute", bottom: 14, insetInline: 0, display: "flex", justifyContent: "center", gap: 6 }}>
          {items.map((_, i) => (
            <button
              key={i}
              onClick={() => {
                clearInterval(timer.current);
                setIdx(i);
              }}
              aria-label={`slide ${i + 1}`}
              style={{
                width: i === idx ? 26 : 8,
                height: 8,
                padding: 0,
                borderRadius: 4,
                background: i === idx ? `linear-gradient(90deg,${theme.gradientStops[0]},${theme.gradientStops[2]})` : "rgba(255,255,255,.4)",
                border: "none",
                cursor: "pointer",
                transition: "width .4s cubic-bezier(.2,.95,.25,1.1), background .3s",
              }}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function useCountdown(target) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);
  const diff = Math.max(0, target - now);
  return {
    d: Math.floor(diff / 86400000),
    h: Math.floor((diff % 86400000) / 3600000),
    m: Math.floor((diff % 3600000) / 60000),
    s: Math.floor((diff % 60000) / 1000),
    reached: target - now <= 0,
  };
}

function Countdown({ weddingDate, theme, font, lang }) {
  const { d, h, m, s, reached } = useCountdown(weddingDate);
  if (reached) {
    return (
      <div style={{ textAlign: "center", padding: "32px 20px" }}>
        <div style={{ fontSize: 56, marginBottom: 12 }}>🎊</div>
        <div style={{ color: theme.text, fontSize: 26, fontWeight: 900, fontFamily: font.family, paddingBlock: 4 }}>
          {lang === "he" ? "היום החתונה!" : "اليوم الفرح!"}
        </div>
      </div>
    );
  }
  return (
    <div style={{ display: "flex", alignItems: "stretch", justifyContent: "center", direction: "ltr", padding: "28px 12px", borderBlock: `1px solid ${theme.accentLine}` }}>
      <CountdownCell value={d} label={lang === "he" ? "ימים" : "أيام"} theme={theme} font={font} />
      <Sep color={theme.accentLine} />
      <CountdownCell value={h} label={lang === "he" ? "שעות" : "ساعات"} theme={theme} font={font} />
      <Sep color={theme.accentLine} />
      <CountdownCell value={m} label={lang === "he" ? "דקות" : "دقائق"} theme={theme} font={font} />
      <Sep color={theme.accentLine} />
      <CountdownCell value={s} label={lang === "he" ? "שניות" : "ثوان"} theme={theme} font={font} />
    </div>
  );
}

function CountdownCell({ value, label, theme, font }) {
  return (
    <div style={{ flex: 1, minWidth: 0, textAlign: "center", paddingInline: 4 }}>
      <div
        style={{
          fontFamily: font.family,
          fontWeight: 900,
          fontSize: "clamp(40px, 9vw, 64px)",
          lineHeight: 1.2,
          background: `linear-gradient(135deg,${theme.gradientStops.join(",")})`,
          WebkitBackgroundClip: "text",
          WebkitTextFillColor: "transparent",
          fontVariantNumeric: "tabular-nums",
          paddingBlock: 6,
        }}
      >
        {String(value).padStart(2, "0")}
      </div>
      <div
        style={{
          fontFamily: font.family,
          fontStyle: "italic",
          fontSize: 11,
          color: theme.accent,
          letterSpacing: 2,
          textTransform: "uppercase",
          marginTop: 4,
        }}
      >
        {label}
      </div>
    </div>
  );
}

function Sep({ color }) {
  return <div style={{ width: 1, alignSelf: "stretch", background: color }} />;
}

function InviteFooter({ theme, font, lang }) {
  return (
    <footer style={{ textAlign: "center", marginTop: 80, paddingTop: 36, borderTop: `1px solid ${theme.accentLine}` }}>
      <div
        style={{
          fontFamily: font.family,
          fontWeight: 900,
          fontSize: 28,
          background: `linear-gradient(135deg,${theme.gradientStops.join(",")})`,
          WebkitBackgroundClip: "text",
          WebkitTextFillColor: "transparent",
          marginBottom: 8,
          paddingBlock: 4,
        }}
      >
        {lang === "he" ? "דעוה" : "دعوة"}
      </div>
      <div
        style={{
          fontFamily: font.family,
          fontStyle: "italic",
          color: theme.accent,
          fontSize: 12,
          letterSpacing: 3,
          textTransform: "uppercase",
        }}
      >
        {lang === "he" ? "— נעשה באהבה —" : "— صُنعت بحبّ —"}
      </div>
    </footer>
  );
}

function EnvelopeIntro({ guestName, theme, font, lang }) {
  const [opened, setOpened] = useState(() => {
    try { return localStorage.getItem("dawa-invite-opened") === "1"; }
    catch { return true; }
  });
  const [opening, setOpening] = useState(false);
  const onOpen = () => {
    if (opening) return;
    setOpening(true);
    try { localStorage.setItem("dawa-invite-opened", "1"); } catch {}
    setTimeout(() => setOpened(true), 1100);
  };
  if (opened) return null;
  return (
    <div className={`dawa-envelope-overlay${opening ? " is-opening" : ""}`} role="dialog">
      <div
        className="dawa-envelope"
        role="button"
        tabIndex={0}
        onClick={onOpen}
        onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && onOpen()}
      >
        <div className="dawa-wax-seal" aria-hidden="true">د</div>
      </div>
      <div className="dawa-env-hint">— {lang === "he" ? "לחץ לפתיחה" : "اضغط للفتح"} —</div>
      {guestName && <div className="dawa-env-name" style={{ fontFamily: font.family }}>{guestName}</div>}
    </div>
  );
}

function Ambience({ theme }) {
  const petals = useMemo(() => Array.from({ length: 10 }, () => ({
    left: Math.random() * 100,
    dur: 16 + Math.random() * 14,
    delay: Math.random() * 18,
    size: 10 + Math.random() * 8,
  })), []);
  const sparkles = useMemo(() => Array.from({ length: 18 }, () => ({
    top: Math.random() * 100,
    left: Math.random() * 100,
    dur: 2.5 + Math.random() * 3,
    delay: Math.random() * 4,
  })), []);
  return (
    <>
      <div className="dawa-petals" aria-hidden="true">
        {petals.map((p, i) => (
          <span
            key={i}
            className="dawa-petal"
            style={{
              left: `${p.left}%`,
              width: p.size,
              height: p.size,
              animationDuration: `${p.dur}s`,
              animationDelay: `${p.delay}s`,
              background: theme.petal,
            }}
          />
        ))}
      </div>
      <div className="dawa-sparkles" aria-hidden="true">
        {sparkles.map((s, i) => (
          <span
            key={i}
            className="dawa-sparkle"
            style={{
              top: `${s.top}%`,
              left: `${s.left}%`,
              animationDuration: `${s.dur}s`,
              animationDelay: `${s.delay}s`,
              background: theme.sparkle,
              boxShadow: `0 0 8px ${theme.sparkleGlow}, 0 0 16px rgba(240,200,76,.4)`,
            }}
          />
        ))}
      </div>
    </>
  );
}

function ViewStyles({ theme }) {
  return (
    <style>{`
      @keyframes dawa-rise { from { opacity: 0; transform: translateY(20px); } to { opacity: 1; transform: none; } }
      .dawa-reveal { opacity: 1; transform: none; transition: opacity .9s, transform .9s; }
      .dawa-envelope-overlay {
        position: fixed; inset: 0; z-index: 1000;
        background: radial-gradient(ellipse 80% 60% at 50% 50%, ${theme.bg} 0%, ${theme.bg} 70%);
        display: flex; flex-direction: column;
        align-items: center; justify-content: center;
        padding: 32px;
        transition: opacity 1.2s ease, transform 1.4s cubic-bezier(.2,.95,.25,1.1);
      }
      .dawa-envelope-overlay.is-opening { opacity: 0; transform: scale(1.05); pointer-events: none; }
      .dawa-envelope {
        position: relative; width: 320px; max-width: 80vw; aspect-ratio: 1.5/1;
        border-radius: 14px; cursor: pointer;
        background: linear-gradient(140deg, ${theme.bg} 0%, ${theme.bg} 100%);
        border: 1px solid ${theme.accentLine};
        box-shadow: 0 30px 80px -20px rgba(0,0,0,.7), 0 0 60px ${theme.accentMuted};
      }
      .dawa-wax-seal {
        position: absolute; top: 50%; left: 50%;
        transform: translate(-50%,-50%);
        width: 86px; height: 86px; border-radius: 50%;
        background: radial-gradient(circle at 30% 30%, ${theme.gradientStops[0]} 0%, ${theme.accent} 60%, ${theme.accent} 100%);
        display: flex; align-items: center; justify-content: center;
        color: ${theme.bg}; font-weight: 900; font-size: 36px;
        box-shadow: 0 8px 26px ${theme.accentMuted}, 0 0 32px ${theme.accentMuted};
        z-index: 2;
      }
      .dawa-env-hint {
        margin-top: 36px; color: ${theme.accent};
        font-size: 13px; letter-spacing: 3px; text-transform: uppercase;
        font-style: italic;
      }
      .dawa-env-name {
        margin-top: 22px; font-weight: 900;
        font-size: clamp(28px, 5vw, 44px);
        background: linear-gradient(135deg, ${theme.gradientStops.join(",")});
        -webkit-background-clip: text; background-clip: text;
        -webkit-text-fill-color: transparent;
      }
      .dawa-petals { position: fixed; inset: 0; pointer-events: none; z-index: 5; overflow: hidden; }
      .dawa-petal {
        position: absolute; top: -40px;
        border-radius: 60% 40% 60% 40% / 70% 60% 40% 30%;
        opacity: .45;
        filter: blur(.4px) drop-shadow(0 2px 4px ${theme.accentMuted});
        animation: dawa-petal-fall linear infinite;
      }
      @keyframes dawa-petal-fall {
        0%   { transform: translateY(0)    rotate(0)    translateX(0);    opacity: 0; }
        5%   { opacity: .5; }
        50%  { transform: translateY(45vh) rotate(180deg) translateX(40px); }
        95%  { opacity: .5; }
        100% { transform: translateY(105vh) rotate(420deg) translateX(-30px); opacity: 0; }
      }
      .dawa-sparkles { position: fixed; inset: 0; pointer-events: none; z-index: 4; }
      .dawa-sparkle {
        position: absolute; width: 2px; height: 2px; border-radius: 50%;
        animation: dawa-sparkle ease-in-out infinite;
      }
      @keyframes dawa-sparkle {
        0%, 100% { opacity: 0; transform: scale(.5); }
        50%      { opacity: 1; transform: scale(1.6); }
      }
      @keyframes dawa-stroke-draw { from { stroke-dashoffset: 580; } to { stroke-dashoffset: 0; } }
      .dawa-success-seal {
        width: 80px; height: 80px; margin: 0 auto 18px;
        border-radius: 50%;
        color: #07070a; font-size: 38px; font-weight: 900;
        display: flex; align-items: center; justify-content: center;
        box-shadow: 0 0 0 6px rgba(76,201,122,.15), 0 12px 36px rgba(47,138,85,.45);
      }
      @media (prefers-reduced-motion: reduce) {
        .dawa-petal, .dawa-sparkle { animation: none !important; }
      }
    `}</style>
  );
}
