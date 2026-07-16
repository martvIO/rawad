// Lumen sections — type and space. Same design-doc fields as every template (no
// new schema); RSVP + countdown route through the shared hooks. There is no
// ornament here beyond the seal and a hairline: the restraint is the design.
import { useRsvpForm } from "../../../../hooks/useRsvpForm.js";
import { useCountdown } from "../../../../hooks/useCountdown.js";
import { PhoneInput } from "../../../PhoneInput.jsx";
import { Head, Seal, LmButton, L } from "./parts.jsx";

// ── Hero ───────────────────────────────────────────────────────────────────
export function Hero({ t, lang, guestName, namesLine, eyebrow, blessing, dateText, venueLine }) {
  return (
    <header className="lm-sec" style={{ textAlign: "center", paddingTop: "clamp(60px,16vw,110px)" }}>
      <div className="lm-reveal d1">
        {blessing && <div style={{ fontSize: 13, color: t.theme.textSoft, marginBottom: 18, lineHeight: 1.9 }}>{blessing}</div>}
        <div className="lm-cap" style={{ fontSize: 10, color: t.theme.textSoft }}>
          {eyebrow || L(lang, "أنتم مدعوون", "אתם מוזמנים")}
        </div>
        <h1 style={{ fontFamily: "inherit", fontWeight: 700, fontSize: "clamp(30px,8.4vw,46px)", lineHeight: 1.25, margin: "18px 0 0", color: t.theme.text, paddingBlock: 4 }}>
          {namesLine}
        </h1>
        <hr className="lm-rule" style={{ width: 54, margin: "24px auto" }} />
      </div>
      {/* WHEN? / WHERE? — the source's two quiet columns. */}
      <div className="lm-reveal d2" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 18, maxWidth: 400, margin: "0 auto" }}>
        <div>
          <div className="lm-cap" style={{ fontSize: 10, color: t.theme.textSoft }}>{L(lang, "متى؟", "מתי?")}</div>
          <div style={{ marginTop: 10, fontSize: 14, color: t.theme.text, lineHeight: 1.7 }}>
            {dateText ? <bdi dir="ltr">{dateText}</bdi> : "—"}
          </div>
        </div>
        <div>
          <div className="lm-cap" style={{ fontSize: 10, color: t.theme.textSoft }}>{L(lang, "أين؟", "איפה?")}</div>
          <div style={{ marginTop: 10, fontSize: 14, color: t.theme.text, lineHeight: 1.7 }}>{venueLine || "—"}</div>
        </div>
      </div>
      {guestName && (
        <div className="lm-reveal d2" style={{ marginTop: 34, fontSize: 13, color: t.theme.textSoft }}>
          {L(lang, "إلى", "אל")} <span style={{ color: t.theme.text, fontWeight: 700 }}>{guestName}</span>
        </div>
      )}
    </header>
  );
}

export function StartsIn({ t, lang, weddingDate }) {
  const { d, h, m, s } = useCountdown(weddingDate);
  const tiles = [
    [d, L(lang, "يوم", "ימים")],
    [h, L(lang, "ساعة", "שעות")],
    [m, L(lang, "دقيقة", "דקות")],
    [s, L(lang, "ثانية", "שניות")],
  ];
  return (
    <section className="lm-sec lm-scroll" id="lm-countdown">
      <Head title={L(lang, "يبدأ بعد", "מתחיל בעוד")} t={t} />
      <div style={{ display: "flex", justifyContent: "center", alignItems: "baseline", gap: 6, flexWrap: "wrap" }}>
        {tiles.map(([val, label], i) => (
          <div key={i} style={{ textAlign: "center", minWidth: 62 }}>
            <div style={{ fontFamily: "'Amiri','Frank Ruhl Libre',serif", fontWeight: 700, fontSize: "clamp(28px,8vw,40px)", lineHeight: 1, color: t.theme.text }}>
              <bdi dir="ltr">{String(val).padStart(2, "0")}</bdi>
            </div>
            <div className="lm-cap" style={{ fontSize: 8.5, color: t.theme.textSoft, marginTop: 10 }}>{label}</div>
          </div>
        ))}
      </div>
    </section>
  );
}

export function StorySection({ t, lang, items }) {
  return (
    <section className="lm-sec lm-scroll" id="lm-story">
      <Head title={L(lang, "قصتنا", "הסיפור שלנו")} t={t} />
      <div style={{ maxWidth: t.maxW, margin: "0 auto", display: "grid", gap: 30 }}>
        {items.map((it, i) => (
          <div key={i} style={{ textAlign: "center" }}>
            {it.when && <div className="lm-cap" style={{ fontSize: 9, color: t.theme.textSoft }}><bdi dir="ltr">{it.when}</bdi></div>}
            {it.title && <div style={{ fontWeight: 700, fontSize: 17, marginTop: 8, color: t.theme.text }}>{it.title}</div>}
            {it.body && <div style={{ fontSize: 13.5, marginTop: 8, lineHeight: 1.9, color: t.theme.textSoft, maxWidth: 380, marginInline: "auto" }}>{it.body}</div>}
          </div>
        ))}
      </div>
    </section>
  );
}

export function ScheduleSection({ t, lang, items }) {
  return (
    <section className="lm-sec lm-scroll" id="lm-events">
      <Head title={L(lang, "جدول الاحتفال", "לוח האירוע")} t={t} />
      <div style={{ maxWidth: 380, margin: "0 auto", display: "grid", gap: 26 }}>
        {items.map((e, i) => {
          const query = [e.venue, e.address].filter(Boolean).join(" ");
          const href = e.mapUrl || (query ? `https://maps.google.com/?q=${encodeURIComponent(query)}` : "");
          return (
            <div key={i} style={{ textAlign: "center" }}>
              {e.time && <div className="lm-cap" style={{ fontSize: 9, color: t.theme.textSoft }}><bdi dir="ltr">{e.time}</bdi></div>}
              {e.title && <div style={{ fontWeight: 700, fontSize: 16, marginTop: 7, color: t.theme.text }}>{e.title}</div>}
              {e.venue && <div style={{ fontSize: 13, marginTop: 6, color: t.theme.textSoft }}>{e.venue}</div>}
              {e.address && <div style={{ fontSize: 12, marginTop: 3, lineHeight: 1.7, color: t.theme.textSoft, opacity: 0.85 }}>{e.address}</div>}
              {href && (
                <div style={{ marginTop: 9 }}>
                  <a href={href} target="_blank" rel="noreferrer" className="lm-cap" style={{ fontSize: 9, color: t.theme.accent, textDecoration: "none", borderBottom: `1px solid ${t.theme.accentLine}`, paddingBottom: 3 }}>
                    {L(lang, "الخريطة", "מפה")}
                  </a>
                </div>
              )}
              {i < items.length - 1 && <hr className="lm-rule" style={{ width: 26, margin: "26px auto 0" }} />}
            </div>
          );
        })}
      </div>
    </section>
  );
}

export function VenueSection({ t, lang, venue, venueCity, venueAddress, accessNote, hotels }) {
  const query = [venue, venueAddress, venueCity].filter(Boolean).join(" ");
  const href = query ? `https://maps.google.com/?q=${encodeURIComponent(query)}` : "";
  return (
    <section className="lm-sec lm-scroll" id="lm-venue">
      <Head title={L(lang, "المكان", "המקום")} t={t} />
      <div style={{ textAlign: "center", maxWidth: t.maxW, margin: "0 auto" }}>
        {venue && <div style={{ fontWeight: 700, fontSize: 20, color: t.theme.text }}>{venue}</div>}
        {venueCity && <div className="lm-cap" style={{ fontSize: 9.5, color: t.theme.textSoft, marginTop: 10 }}>{venueCity}</div>}
        {venueAddress && <div style={{ fontSize: 13.5, color: t.theme.textSoft, marginTop: 12, lineHeight: 1.8 }}>{venueAddress}</div>}
        {accessNote && <div style={{ fontSize: 12.5, color: t.theme.textSoft, marginTop: 8, opacity: 0.85 }}>{accessNote}</div>}
        {href && (
          <div style={{ marginTop: 20 }}>
            <a href={href} target="_blank" rel="noreferrer" style={{ textDecoration: "none" }}>
              <LmButton t={t} testid="lm-map">{L(lang, "الخريطة", "מפה")}</LmButton>
            </a>
          </div>
        )}
        {hotels.length > 0 && (
          <div style={{ marginTop: 26, display: "grid", gap: 12 }}>
            {hotels.map((h, i) => (
              <div key={i} style={{ fontSize: 13, color: t.theme.textSoft }}>
                <span style={{ color: t.theme.text, fontWeight: 700 }}>{h.name}</span>
                {h.walk && <span> · {h.walk}</span>}
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}

export function DressCodeSection({ t, lang, dressCode }) {
  return (
    <section className="lm-sec lm-scroll" id="lm-dress">
      <Head title={L(lang, "اللباس", "קוד לבוש")} t={t} />
      <div style={{ maxWidth: 380, margin: "0 auto", textAlign: "center", fontSize: 14, lineHeight: 1.95, color: t.theme.textSoft }}>
        {dressCode}
      </div>
    </section>
  );
}

export function RsvpSection({ t, lang, opts, mealOptions, guestPhone, onSubmitRsvp, disabled, alreadyAnswered, rsvpDone }) {
  const f = useRsvpForm({ guestPhone, opts, theme: t.theme, lang, onSubmitRsvp, rsvpDone, disabled });
  const chip = (on) => ({
    padding: "10px 16px", borderRadius: 2, cursor: "pointer", fontSize: 10, fontFamily: "inherit",
    border: `1px solid ${on ? t.theme.accent : t.theme.accentLine}`,
    background: on ? t.theme.accentMuted : "transparent",
    color: on ? t.theme.accent : t.theme.textSoft,
    letterSpacing: ".16em", textTransform: "uppercase", fontWeight: 700,
  });
  const input = { width: "100%", padding: "12px 0", borderRadius: 0, border: "none", borderBottom: `1px solid ${t.theme.accentLine}`, background: "transparent", color: t.theme.text, fontFamily: "inherit", fontSize: 14 };

  return (
    <section className="lm-sec lm-scroll" id="rsvp">
      <Head title={L(lang, "تأكيد الحضور", "אישור הגעה")} t={t} />
      <div style={{ maxWidth: 380, margin: "0 auto", position: "relative" }}>
        {(alreadyAnswered && !f.showDone) || f.showDone ? (
          <div data-testid="rsvp-success" role="status" aria-live="polite" style={{ textAlign: "center" }}>
            <div style={{ display: "flex", justifyContent: "center", marginBottom: 16 }}><Seal t={t} size={48} /></div>
            <div style={{ fontWeight: 700, fontSize: 17, color: t.theme.text }}>
              {alreadyAnswered && !f.showDone
                ? L(lang, "تم تأكيد ردك", "כבר אישרת")
                : (f.status === "absent" ? L(lang, "نشكر إعلامكم", "תודה שהודעת") : L(lang, "بانتظاركم", "מחכים לכם"))}
            </div>
            {f.showDone && <p style={{ color: t.theme.textSoft, marginTop: 8, fontSize: 13.5, lineHeight: 1.8 }}>{f.successText}</p>}
          </div>
        ) : (
          <>
            <div style={{ display: "flex", gap: 10, marginBottom: 22, justifyContent: "center" }}>
              <button onClick={() => f.setStatus("attending")} style={{ ...chip(f.status === "attending"), flex: 1 }}>{L(lang, "سأحضر", "אגיע")}</button>
              <button onClick={() => f.setStatus("absent")} style={{ ...chip(f.status === "absent"), flex: 1 }}>{L(lang, "لا أستطيع", "לא אוכל")}</button>
            </div>
            {f.status && (
              <div style={{ marginBottom: 18 }}>
                <label htmlFor="lm-rsvp-phone" className="lm-cap" style={{ display: "block", fontSize: 9, color: t.theme.textSoft, marginBottom: 8 }}>{L(lang, "رقم هاتفك", "מספר טלפון")}</label>
                <PhoneInput value={f.phone} onChange={f.setPhone} lang={lang} inputId="lm-rsvp-phone" />
              </div>
            )}
            {f.status === "attending" && opts.companions && (
              <div style={{ marginBottom: 18 }}>
                <label className="lm-cap" style={{ display: "block", fontSize: 9, color: t.theme.textSoft, marginBottom: 8 }}>{L(lang, "كم شخصاً أنتم؟", "כמה אתם?")}</label>
                <div style={{ display: "inline-flex", alignItems: "center", gap: 18, border: `1px solid ${t.theme.accentLine}`, borderRadius: 2, padding: "6px 16px" }}>
                  <button onClick={() => f.setPartySize((c) => Math.max(1, c - 1))} aria-label="-" style={{ border: "none", background: "none", color: t.theme.accent, fontSize: 18, cursor: "pointer" }}>−</button>
                  <span style={{ color: t.theme.text, fontWeight: 700, minWidth: 18, textAlign: "center" }}><bdi dir="ltr">{f.partySize}</bdi></span>
                  <button onClick={() => f.setPartySize((c) => Math.min(21, c + 1))} aria-label="+" style={{ border: "none", background: "none", color: t.theme.accent, fontSize: 18, cursor: "pointer" }}>+</button>
                </div>
              </div>
            )}
            {f.status === "attending" && opts.meal && mealOptions.length > 0 && (
              <div style={{ marginBottom: 18 }}>
                <label className="lm-cap" style={{ display: "block", fontSize: 9, color: t.theme.textSoft, marginBottom: 8 }}>{L(lang, "تفضيل الطعام", "העדפת מנה")}</label>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                  {mealOptions.map((opt) => <button key={opt} onClick={() => f.setMeal(opt)} style={chip(f.meal === opt)}>{opt}</button>)}
                </div>
              </div>
            )}
            {f.status === "attending" && opts.song && (
              <div style={{ marginBottom: 18 }}>
                <label htmlFor="lm-rsvp-song" className="lm-cap" style={{ display: "block", fontSize: 9, color: t.theme.textSoft, marginBottom: 8 }}>{L(lang, "أغنية تحبّونها", "שיר שתאהבו")}</label>
                <input id="lm-rsvp-song" value={f.song} onChange={(e) => f.setSong(e.target.value.slice(0, 120))} placeholder={L(lang, "اسم الأغنية...", "שם השיר...")} dir="auto" style={input} />
              </div>
            )}
            <div style={{ marginBottom: 24 }}>
              <label htmlFor="lm-rsvp-note" className="lm-cap" style={{ display: "block", fontSize: 9, color: t.theme.textSoft, marginBottom: 8 }}>{L(lang, "رسالة للعروسين", "ברכה לזוג")}</label>
              <textarea id="lm-rsvp-note" rows={2} value={f.note} onChange={(e) => f.setNote(e.target.value.slice(0, 500))} placeholder={L(lang, "مبروك مقدماً...", "מזל טוב מראש...")} style={{ ...input, resize: "vertical" }} />
            </div>
            {f.error && <div role="alert" style={{ color: t.theme.rsvpAbsent, fontSize: 13, marginBottom: 14, textAlign: "center" }}>{f.error}</div>}
            <LmButton t={t} full onClick={f.submit} disabled={f.busy || !f.status || disabled} testid="lm-rsvp-submit">
              {f.busy ? L(lang, "جاري الإرسال...", "שולח...") : L(lang, "أرسل ردّي", "שלח תשובה")}
            </LmButton>
          </>
        )}
        <div style={{ position: "absolute", inset: 0, overflow: "hidden", pointerEvents: "none" }}>
          {f.hearts.map((h) => (
            <span key={h.id} style={{ position: "absolute", bottom: 0, left: `${h.left}%`, color: t.theme.accent, fontSize: 16, animation: "lm-float 2s ease-out forwards", animationDelay: `${h.delay}s` }}>♥</span>
          ))}
        </div>
        <style>{"@keyframes lm-float{to{transform:translateY(-110px);opacity:0}}"}</style>
      </div>
    </section>
  );
}

export function GiftSection({ t, lang, giftNote, giftIban }) {
  return (
    <section className="lm-sec lm-scroll" id="lm-gift">
      <Head title={L(lang, "هدية", "מתנה")} t={t} />
      <div style={{ maxWidth: 380, margin: "0 auto", textAlign: "center" }}>
        {giftNote && <div style={{ fontSize: 13.5, lineHeight: 1.95, color: t.theme.textSoft }}>{giftNote}</div>}
        {giftIban && (
          <div style={{ marginTop: 16, paddingBottom: 6, borderBottom: `1px solid ${t.theme.accentLine}`, display: "inline-block" }}>
            <bdi dir="ltr" style={{ fontWeight: 700, fontSize: 13, color: t.theme.text }}>{giftIban}</bdi>
          </div>
        )}
      </div>
    </section>
  );
}

export function GuestbookSection({ t, lang, wishes, approvedWishes }) {
  const all = [...(approvedWishes || []), ...(wishes || [])];
  if (!all.length) return null;
  return (
    <section className="lm-sec lm-scroll" id="lm-guestbook">
      <Head title={L(lang, "التهاني", "ברכות")} t={t} />
      <div style={{ maxWidth: 380, margin: "0 auto", display: "grid", gap: 26 }}>
        {all.map((w, i) => (
          <div key={i} style={{ textAlign: "center" }}>
            <div style={{ fontSize: 13.5, lineHeight: 1.95, color: t.theme.textSoft, fontStyle: "italic" }}>{w.what || w.text}</div>
            {(w.who || w.name) && <div className="lm-cap" style={{ fontSize: 9, color: t.theme.text, marginTop: 10 }}>{w.who || w.name}</div>}
          </div>
        ))}
      </div>
    </section>
  );
}

export function FooterCredit({ t, lang, isPublic }) {
  return (
    <footer style={{ textAlign: "center", padding: "16px 24px 70px", color: t.theme.textSoft, fontSize: 11 }}>
      <hr className="lm-rule" style={{ width: 34, margin: "0 auto 22px" }} />
      {isPublic ? (
        <a href="/" style={{ color: t.theme.textSoft, textDecoration: "none" }}>
          {L(lang, "صُنعت بواسطة دعوة فرحنا — اصنع دعوتك ←", "נוצר על-ידי דעוה שמחתנו — צרו הזמנה ←")}
        </a>
      ) : (
        <span>{L(lang, "دعوة فرحنا", "דעוה שמחתנו")}</span>
      )}
    </footer>
  );
}
