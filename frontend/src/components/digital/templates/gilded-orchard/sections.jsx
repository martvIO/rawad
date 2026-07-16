// Gilded Orchard sections. Same design-doc fields as every template (no new
// schema); RSVP + countdown route through the shared hooks. Cream cards glow
// against the midnight orchard — the source's signature, reinterpreted.
import { useRsvpForm } from "../../../../hooks/useRsvpForm.js";
import { useCountdown } from "../../../../hooks/useCountdown.js";
import { PhoneInput } from "../../../PhoneInput.jsx";
import { StringLights, Fountain, SectionTitle, GoButton, L } from "./parts.jsx";

// ── Hero: a cream card glowing under the strung lights ────────────────────
export function Hero({ t, lang, guestName, namesLine, eyebrow, blessing, venueLine, clipTextOk, reduced }) {
  return (
    <header style={{ padding: "0 20px 26px" }}>
      <div className="go-reveal d1" style={{ marginInline: -20 }}>
        <StringLights t={t} animate={!reduced} />
      </div>
      <div className="go-card go-reveal d2" style={{ maxWidth: t.maxW, margin: "6px auto 0", textAlign: "center", padding: "30px 22px 26px", boxShadow: `0 26px 60px -30px rgba(0,0,0,.6), 0 0 40px -18px ${t.bulbGlow}` }}>
        {blessing && <div style={{ fontSize: 13, color: t.paperInkSoft, marginBottom: 12, lineHeight: 1.9 }}>{blessing}</div>}
        <div className="go-track" style={{ fontSize: 10, fontWeight: 800, textTransform: "uppercase", color: t.paperInkSoft }}>
          {eyebrow || L(lang, "أنتم مدعوون", "אתם מוזמנים")}
        </div>
        <h1
          className={clipTextOk ? "go-grad" : "go-grad-off"}
          style={{ fontFamily: "inherit", fontWeight: 900, fontSize: "clamp(26px,7vw,38px)", lineHeight: 1.25, margin: "12px 0 0", paddingBlock: 4 }}
        >
          {namesLine}
        </h1>
        <div aria-hidden="true" style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8, margin: "12px 0" }}>
          <span style={{ width: 34, height: 1, background: t.rule }} />
          <span style={{ width: 6, height: 6, borderRadius: "50%", background: t.bulb, boxShadow: `0 0 8px ${t.bulbGlow}` }} />
          <span style={{ width: 34, height: 1, background: t.rule }} />
        </div>
        {guestName && (
          <div style={{ fontSize: 13, color: t.paperInkSoft }}>
            {L(lang, "إلى", "אל")} <span style={{ color: t.paperInk, fontWeight: 800 }}>{guestName}</span>
          </div>
        )}
        {venueLine && <div style={{ fontSize: 12.5, color: t.paperInkSoft, marginTop: 6 }}>{venueLine}</div>}
      </div>
      {/* The fountain sits below the card, as it does in the orchard. */}
      <div className="go-reveal d3" aria-hidden="true" style={{ display: "flex", justifyContent: "center", marginTop: 8 }}>
        <Fountain t={t} size={132} animate={!reduced} />
      </div>
    </header>
  );
}

export function CountdownSection({ t, lang, weddingDate, dateText, clipTextOk }) {
  const { d, h, m, s } = useCountdown(weddingDate);
  const tiles = [
    [d, L(lang, "يوم", "ימים")],
    [h, L(lang, "ساعة", "שעות")],
    [m, L(lang, "دقيقة", "דקות")],
    [s, L(lang, "ثانية", "שניות")],
  ];
  return (
    <section className="go-scroll" id="go-countdown" style={{ padding: "30px 20px" }}>
      <SectionTitle eyebrow={L(lang, "العدّ التنازلي", "ספירה לאחור")} title={L(lang, "يبدأ الاحتفال بعد", "החגיגה מתחילה בעוד")} t={t} clipTextOk={clipTextOk} />
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 9, maxWidth: 360, margin: "0 auto" }}>
        {tiles.map(([val, label], i) => (
          <div key={i} className="go-card" style={{ padding: "13px 4px", textAlign: "center" }}>
            <div style={{ fontWeight: 900, fontSize: "clamp(20px,6.4vw,27px)", lineHeight: 1, color: t.paperInk }}>
              <bdi dir="ltr">{String(val).padStart(2, "0")}</bdi>
            </div>
            <div style={{ fontSize: 9.5, color: t.paperInkSoft, marginTop: 5, fontWeight: 700 }}>{label}</div>
          </div>
        ))}
      </div>
      {dateText && <div style={{ textAlign: "center", marginTop: 12, fontSize: 12.5, color: t.theme.textSoft }}><bdi dir="ltr">{dateText}</bdi></div>}
    </section>
  );
}

export function StorySection({ t, lang, items, clipTextOk }) {
  return (
    <section className="go-scroll" id="go-story" style={{ padding: "30px 20px" }}>
      <SectionTitle eyebrow={L(lang, "قصتنا", "הסיפור שלנו")} title={L(lang, "كيف بدأ كل شيء", "איך הכל התחיל")} t={t} clipTextOk={clipTextOk} />
      <div style={{ maxWidth: t.maxW, margin: "0 auto", display: "grid", gap: 12 }}>
        {items.map((it, i) => (
          <div key={i} className="go-card" style={{ padding: "16px 18px" }}>
            {it.when && <div className="go-track" style={{ fontSize: 9.5, fontWeight: 800, textTransform: "uppercase", color: t.paperInkSoft }}><bdi dir="ltr">{it.when}</bdi></div>}
            {it.title && <div style={{ fontWeight: 800, fontSize: 16, marginTop: 3, color: t.paperInk }}>{it.title}</div>}
            {it.body && <div style={{ fontSize: 13, marginTop: 3, lineHeight: 1.75, color: t.paperInkSoft }}>{it.body}</div>}
          </div>
        ))}
      </div>
    </section>
  );
}

// Multi-day schedule — the source runs its own ceremony list down a gold spine.
export function ScheduleSection({ t, lang, items, clipTextOk }) {
  return (
    <section className="go-scroll" id="go-events" style={{ padding: "30px 20px" }}>
      <SectionTitle eyebrow={L(lang, "جدول الاحتفال", "לוח האירוע")} title={L(lang, "أيام فرحنا", "ימי השמחה")} t={t} clipTextOk={clipTextOk} />
      <div style={{ maxWidth: 400, margin: "0 auto" }}>
        {items.map((e, i) => {
          const query = [e.venue, e.address].filter(Boolean).join(" ");
          const href = e.mapUrl || (query ? `https://maps.google.com/?q=${encodeURIComponent(query)}` : "");
          const last = i === items.length - 1;
          return (
            <div key={i} style={{ position: "relative", paddingInlineStart: 36, paddingBottom: last ? 0 : 20 }}>
              {!last && <span aria-hidden="true" style={{ position: "absolute", insetInlineStart: 10, top: 24, bottom: 0, borderInlineStart: `1px solid ${t.rule}` }} />}
              <span aria-hidden="true" style={{ position: "absolute", insetInlineStart: 0, top: 0, width: 21, display: "flex", justifyContent: "center" }}>
                {e.icon ? <span style={{ fontSize: 15 }}>{e.icon}</span> : <span style={{ width: 8, height: 8, borderRadius: "50%", background: t.bulb, boxShadow: `0 0 8px ${t.bulbGlow}`, display: "block", marginTop: 6 }} />}
              </span>
              {e.title && <div style={{ fontWeight: 800, fontSize: 15, color: t.theme.text }}>{e.title}</div>}
              {e.time && <div className="go-track" style={{ fontSize: 10, fontWeight: 800, color: t.theme.accent, marginTop: 3 }}><bdi dir="ltr">{e.time}</bdi></div>}
              {e.venue && <div style={{ fontSize: 13, fontWeight: 700, marginTop: 5, color: t.theme.text }}>{e.venue}</div>}
              {e.address && <div style={{ fontSize: 12, marginTop: 2, lineHeight: 1.65, color: t.theme.textSoft }}>{e.address}</div>}
              {href && (
                <a href={href} target="_blank" rel="noreferrer" style={{ display: "inline-block", marginTop: 7, fontSize: 11, fontWeight: 800, color: t.theme.accent, textDecoration: "none", borderBottom: `1px solid ${t.rule}` }}>
                  {L(lang, "افتح في الخريطة ↗", "פתח במפה ↗")}
                </a>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}

export function VenueSection({ t, lang, venue, venueCity, venueAddress, accessNote, hotels, clipTextOk }) {
  const query = [venue, venueAddress, venueCity].filter(Boolean).join(" ");
  const href = query ? `https://maps.google.com/?q=${encodeURIComponent(query)}` : "";
  return (
    <section className="go-scroll" id="go-venue" style={{ padding: "30px 20px" }}>
      <SectionTitle eyebrow={L(lang, "المكان", "המקום")} title={L(lang, "أين نحتفل", "איפה חוגגים")} t={t} clipTextOk={clipTextOk} />
      <div className="go-card" style={{ maxWidth: t.maxW, margin: "0 auto", textAlign: "center", padding: "22px 18px" }}>
        {venue && <div style={{ fontWeight: 900, fontSize: 19, color: t.paperInk }}>{venue}</div>}
        {venueCity && <div className="go-track" style={{ fontSize: 10, fontWeight: 800, textTransform: "uppercase", color: t.paperInkSoft, marginTop: 6 }}>{venueCity}</div>}
        {venueAddress && <div style={{ fontSize: 13, color: t.paperInkSoft, marginTop: 9, lineHeight: 1.7 }}>{venueAddress}</div>}
        {accessNote && <div style={{ fontSize: 12, color: t.paperInkSoft, marginTop: 7, opacity: 0.85 }}>{accessNote}</div>}
        {href && (
          <div style={{ marginTop: 14 }}>
            <a href={href} target="_blank" rel="noreferrer" style={{ textDecoration: "none" }}>
              <span style={{ display: "inline-block", padding: "8px 16px", borderRadius: 999, border: `1px solid ${t.rule}`, color: t.paperInk, fontSize: 12, fontWeight: 800 }}>
                {L(lang, "افتح في الخريطة ↗", "פתח במפה ↗")}
              </span>
            </a>
          </div>
        )}
      </div>
      {hotels.length > 0 && (
        <div style={{ maxWidth: t.maxW, margin: "12px auto 0", display: "grid", gap: 8 }}>
          {hotels.map((h, i) => (
            <div key={i} className="go-card" style={{ padding: "10px 14px", display: "flex", justifyContent: "space-between", gap: 10 }}>
              <span style={{ fontWeight: 700, fontSize: 13 }}>{h.name}</span>
              {h.walk && <span style={{ fontSize: 12, color: t.paperInkSoft }}>{h.walk}</span>}
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

export function DressCodeSection({ t, lang, dressCode, clipTextOk }) {
  return (
    <section className="go-scroll" id="go-dress" style={{ padding: "30px 20px" }}>
      <SectionTitle eyebrow={L(lang, "اللباس", "קוד לבוש")} title={L(lang, "بماذا نتأنّق؟", "איך מתלבשים?")} t={t} clipTextOk={clipTextOk} />
      <div className="go-card" style={{ maxWidth: t.maxW, margin: "0 auto", textAlign: "center", padding: "22px 18px" }}>
        <div style={{ fontSize: 14, lineHeight: 1.85, color: t.paperInk }}>{dressCode}</div>
        <div aria-hidden="true" style={{ display: "flex", justifyContent: "center", gap: 8, marginTop: 14 }}>
          {[t.bulb, t.bulbGlow, t.trim, t.paperSoft].map((c, i) => (
            <span key={i} style={{ width: 22, height: 22, borderRadius: "50%", background: c, border: `1px solid ${t.rule}` }} />
          ))}
        </div>
      </div>
    </section>
  );
}

export function RsvpSection({ t, lang, opts, mealOptions, guestPhone, onSubmitRsvp, disabled, alreadyAnswered, rsvpDone, clipTextOk }) {
  const f = useRsvpForm({ guestPhone, opts, theme: t.theme, lang, onSubmitRsvp, rsvpDone, disabled });
  const chip = (on) => ({
    padding: "9px 14px", borderRadius: 999, cursor: "pointer", fontSize: 13, fontWeight: 700, fontFamily: "inherit",
    border: `1px solid ${on ? "transparent" : t.theme.accentLine}`,
    background: on ? t.theme.accent : "transparent",
    color: on ? "#fffbf8" : t.theme.textSoft,
  });
  const input = { width: "100%", padding: "11px 13px", borderRadius: 4, border: `1px solid ${t.theme.accentLine}`, background: "transparent", color: t.theme.text, fontFamily: "inherit", fontSize: 14 };

  return (
    <section className="go-scroll" id="rsvp" style={{ padding: "30px 20px" }}>
      <SectionTitle eyebrow={L(lang, "تأكيد الحضور", "אישור הגעה")} title={L(lang, "هل ستحضرون؟", "מגיעים?")} t={t} clipTextOk={clipTextOk} />
      <div style={{ maxWidth: 400, margin: "0 auto", position: "relative", background: t.theme.cardBg, border: `1px solid ${t.theme.cardBorder}`, borderRadius: 6, padding: 20 }}>
        {(alreadyAnswered && !f.showDone) || f.showDone ? (
          <div data-testid="rsvp-success" role="status" aria-live="polite" style={{ textAlign: "center", padding: "10px 0" }}>
            <div style={{ width: 52, height: 52, borderRadius: "50%", margin: "0 auto 12px", display: "flex", alignItems: "center", justifyContent: "center", background: t.theme.accent, color: "#fffbf8", fontSize: 25 }}>✓</div>
            <div style={{ fontWeight: 800, fontSize: 17, color: t.theme.text }}>
              {alreadyAnswered && !f.showDone
                ? L(lang, "تم تأكيد ردك", "כבר אישרת")
                : (f.status === "absent" ? L(lang, "نشكر إعلامكم", "תודה שהודעת") : L(lang, "بانتظاركم تحت الأضواء", "מחכים לכם תחת האורות"))}
            </div>
            {f.showDone && <p style={{ color: t.theme.textSoft, marginTop: 6, fontSize: 14 }}>{f.successText}</p>}
          </div>
        ) : (
          <>
            <div style={{ display: "flex", gap: 10, marginBottom: 14 }}>
              <button onClick={() => f.setStatus("attending")} style={{ ...chip(f.status === "attending"), flex: 1, padding: 12 }}>{L(lang, "✓ سأحضر", "✓ אגיע")}</button>
              <button onClick={() => f.setStatus("absent")} style={{ ...chip(f.status === "absent"), flex: 1, padding: 12 }}>{L(lang, "للأسف لا", "לצערי לא")}</button>
            </div>
            {f.status && (
              <div style={{ marginBottom: 12 }}>
                <label htmlFor="go-rsvp-phone" style={{ display: "block", fontSize: 12, fontWeight: 700, color: t.theme.accent, marginBottom: 6 }}>{L(lang, "رقم هاتفك", "מספר טלפון")}</label>
                <PhoneInput value={f.phone} onChange={f.setPhone} lang={lang} inputId="go-rsvp-phone" />
              </div>
            )}
            {f.status === "attending" && opts.companions && (
              <div style={{ marginBottom: 12 }}>
                <label style={{ display: "block", fontSize: 12, fontWeight: 700, color: t.theme.accent, marginBottom: 6 }}>{L(lang, "كم شخصاً أنتم؟", "כמה אתם?")}</label>
                <div style={{ display: "inline-flex", alignItems: "center", gap: 16, border: `1px solid ${t.theme.accentLine}`, borderRadius: 999, padding: "6px 14px" }}>
                  <button onClick={() => f.setPartySize((c) => Math.max(1, c - 1))} aria-label="-" style={{ border: "none", background: "none", color: t.theme.accent, fontSize: 20, cursor: "pointer" }}>−</button>
                  <span style={{ color: t.theme.text, fontWeight: 800, minWidth: 20, textAlign: "center" }}><bdi dir="ltr">{f.partySize}</bdi></span>
                  <button onClick={() => f.setPartySize((c) => Math.min(21, c + 1))} aria-label="+" style={{ border: "none", background: "none", color: t.theme.accent, fontSize: 20, cursor: "pointer" }}>+</button>
                </div>
              </div>
            )}
            {f.status === "attending" && opts.meal && mealOptions.length > 0 && (
              <div style={{ marginBottom: 12 }}>
                <label style={{ display: "block", fontSize: 12, fontWeight: 700, color: t.theme.accent, marginBottom: 6 }}>{L(lang, "تفضيل الطعام", "העדפת מנה")}</label>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                  {mealOptions.map((opt) => <button key={opt} onClick={() => f.setMeal(opt)} style={chip(f.meal === opt)}>{opt}</button>)}
                </div>
              </div>
            )}
            {f.status === "attending" && opts.song && (
              <div style={{ marginBottom: 12 }}>
                <label htmlFor="go-rsvp-song" style={{ display: "block", fontSize: 12, fontWeight: 700, color: t.theme.accent, marginBottom: 6 }}>{L(lang, "أغنية تحبّونها", "שיר שתאהבו")}</label>
                <input id="go-rsvp-song" value={f.song} onChange={(e) => f.setSong(e.target.value.slice(0, 120))} placeholder={L(lang, "اسم الأغنية...", "שם השיר...")} dir="auto" style={input} />
              </div>
            )}
            <div style={{ marginBottom: 14 }}>
              <label htmlFor="go-rsvp-note" style={{ display: "block", fontSize: 12, fontWeight: 700, color: t.theme.accent, marginBottom: 6 }}>{L(lang, "رسالة للعروسين", "ברכה לזוג")}</label>
              <textarea id="go-rsvp-note" rows={3} value={f.note} onChange={(e) => f.setNote(e.target.value.slice(0, 500))} placeholder={L(lang, "مبروك مقدماً...", "מזל טוב מראש...")} style={{ ...input, resize: "vertical" }} />
            </div>
            {f.error && <div role="alert" style={{ color: t.theme.rsvpAbsent, fontSize: 13, marginBottom: 12, textAlign: "center" }}>{f.error}</div>}
            <GoButton t={t} full onClick={f.submit} disabled={f.busy || !f.status || disabled} testid="go-rsvp-submit">
              {f.busy ? L(lang, "جاري الإرسال...", "שולח...") : `${L(lang, "أرسل ردّي", "שלח תשובה")} ←`}
            </GoButton>
          </>
        )}
        <div style={{ position: "absolute", inset: 0, overflow: "hidden", pointerEvents: "none" }}>
          {f.hearts.map((h) => (
            <span key={h.id} style={{ position: "absolute", bottom: 0, left: `${h.left}%`, color: t.bulb, fontSize: 20, animation: "go-float 2s ease-out forwards", animationDelay: `${h.delay}s` }}>♥</span>
          ))}
        </div>
        <style>{"@keyframes go-float{to{transform:translateY(-120px);opacity:0}}"}</style>
      </div>
    </section>
  );
}

export function GiftSection({ t, lang, giftNote, giftIban, clipTextOk }) {
  return (
    <section className="go-scroll" id="go-gift" style={{ padding: "30px 20px" }}>
      <SectionTitle eyebrow={L(lang, "هدية", "מתנה")} title={L(lang, "حضوركم أجمل هدية", "נוכחותכם היא המתנה")} t={t} clipTextOk={clipTextOk} />
      <div className="go-card" style={{ maxWidth: t.maxW, margin: "0 auto", textAlign: "center", padding: "22px 18px" }}>
        {giftNote && <div style={{ fontSize: 13.5, lineHeight: 1.85, color: t.paperInk }}>{giftNote}</div>}
        {giftIban && (
          <div style={{ marginTop: 12, padding: "9px 14px", border: `1px solid ${t.rule}`, borderRadius: 4, display: "inline-block" }}>
            <bdi dir="ltr" style={{ fontWeight: 800, fontSize: 13, color: t.paperInk }}>{giftIban}</bdi>
          </div>
        )}
      </div>
    </section>
  );
}

export function GuestbookSection({ t, lang, wishes, approvedWishes, clipTextOk }) {
  const all = [...(approvedWishes || []), ...(wishes || [])];
  if (!all.length) return null;
  return (
    <section className="go-scroll" id="go-guestbook" style={{ padding: "30px 20px" }}>
      <SectionTitle eyebrow={L(lang, "التهاني", "ברכות")} title={L(lang, "كلمات من الأحبة", "מילים מהאוהבים")} t={t} clipTextOk={clipTextOk} />
      <div style={{ maxWidth: t.maxW, margin: "0 auto", display: "grid", gap: 10 }}>
        {all.map((w, i) => (
          <div key={i} className="go-card" style={{ padding: "14px 16px" }}>
            <div style={{ fontSize: 13.5, lineHeight: 1.8, color: t.paperInk }}>{w.what || w.text}</div>
            {(w.who || w.name) && <div style={{ fontSize: 11.5, fontWeight: 800, color: t.paperInkSoft, marginTop: 7 }}>— {w.who || w.name}</div>}
          </div>
        ))}
      </div>
    </section>
  );
}

export function FooterCredit({ t, lang, isPublic }) {
  return (
    <footer style={{ textAlign: "center", padding: "26px 20px 64px", color: t.theme.textSoft, fontSize: 11.5 }}>
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
