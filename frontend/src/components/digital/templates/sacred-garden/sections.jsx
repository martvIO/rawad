// Sacred Garden sections — cream stationery in a walled garden. Same design-doc
// fields as every other template (no new schema); RSVP + countdown route through
// the shared hooks so behaviour is identical everywhere and only identity differs.
import { useRsvpForm } from "../../../../hooks/useRsvpForm.js";
import { useCountdown } from "../../../../hooks/useCountdown.js";
import { PhoneInput } from "../../../PhoneInput.jsx";
import { SectionTitle, SgButton, Vine, Rose, TornEdge, L } from "./parts.jsx";

// A section on a torn-edged cream band — the source's signature transition.
function Band({ id, children, t, className = "sg-scroll" }) {
  return (
    <section id={id} className={className} style={{ position: "relative" }}>
      <TornEdge t={t} />
      <div className="sg-band" style={{ padding: "10px 20px 26px" }}>{children}</div>
      <TornEdge t={t} flip />
    </section>
  );
}

// ── Hero: the invitation card, framed by vines ─────────────────────────────
export function Hero({ t, lang, guestName, namesLine, eyebrow, blessing, venueLine, clipTextOk }) {
  return (
    <header style={{ padding: "54px 20px 26px", position: "relative" }}>
      <div className="sg-card sg-reveal d1" style={{ maxWidth: t.maxW, margin: "0 auto", textAlign: "center", padding: "34px 22px 30px", overflow: "hidden" }}>
        {/* Garlands climbing the card's lower corners. */}
        <div aria-hidden="true" style={{ position: "absolute", insetInlineStart: -10, bottom: -14, pointerEvents: "none" }}>
          <Vine w={78} h={100} t={t} opacity={0.42} />
        </div>
        <div aria-hidden="true" style={{ position: "absolute", insetInlineEnd: -10, bottom: -14, pointerEvents: "none" }}>
          <Vine w={78} h={100} t={t} flip opacity={0.42} />
        </div>

        {/* The blessing leads, the way the source opens on the Bismillah. */}
        {blessing && (
          <div style={{ fontSize: 13.5, color: t.paperInkSoft, marginBottom: 14, lineHeight: 1.9 }}>{blessing}</div>
        )}
        <div className="sg-track" style={{ fontSize: 10, fontWeight: 800, textTransform: "uppercase", color: t.paperInkSoft }}>
          {eyebrow || L(lang, "أنتم مدعوون", "אתם מוזמנים")}
        </div>
        <h1
          className={clipTextOk ? "sg-grad" : "sg-grad-off"}
          style={{ fontFamily: "inherit", fontWeight: 900, fontSize: "clamp(28px,7.4vw,40px)", lineHeight: 1.2, margin: "12px 0 0", paddingBlock: 4 }}
        >
          {namesLine}
        </h1>
        <div aria-hidden="true" style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 10, margin: "14px 0" }}>
          <span style={{ width: 36, height: 1, background: t.rule }} />
          <Rose size={20} t={t} />
          <span style={{ width: 36, height: 1, background: t.rule }} />
        </div>
        {guestName && (
          <div style={{ fontSize: 13, color: t.paperInkSoft }}>
            {L(lang, "إلى", "אל")} <span style={{ color: t.paperInk, fontWeight: 800 }}>{guestName}</span>
          </div>
        )}
        {venueLine && <div style={{ fontSize: 12.5, color: t.paperInkSoft, marginTop: 6 }}>{venueLine}</div>}
      </div>
    </header>
  );
}

// ── Countdown ──────────────────────────────────────────────────────────────
export function CountdownSection({ t, lang, weddingDate, dateText, clipTextOk }) {
  const { d, h, m, s } = useCountdown(weddingDate);
  const tiles = [
    [d, L(lang, "يوم", "ימים")],
    [h, L(lang, "ساعة", "שעות")],
    [m, L(lang, "دقيقة", "דקות")],
    [s, L(lang, "ثانية", "שניות")],
  ];
  return (
    <Band id="sg-countdown" t={t}>
      <SectionTitle eyebrow={L(lang, "العدّ التنازلي", "ספירה לאחור")} title={L(lang, "يبدأ الاحتفال بعد", "החגיגה מתחילה בעוד")} t={t} clipTextOk={clipTextOk} />
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 9, maxWidth: 360, margin: "0 auto" }}>
        {tiles.map(([val, label], i) => (
          <div key={i} style={{ textAlign: "center", padding: "10px 4px", border: `1px solid ${t.rule}`, borderRadius: 4 }}>
            <div style={{ fontWeight: 900, fontSize: "clamp(20px,6.4vw,27px)", lineHeight: 1, color: t.paperInk }}>
              <bdi dir="ltr">{String(val).padStart(2, "0")}</bdi>
            </div>
            <div style={{ fontSize: 9.5, color: t.paperInkSoft, marginTop: 5, fontWeight: 700 }}>{label}</div>
          </div>
        ))}
      </div>
      {dateText && (
        <div style={{ textAlign: "center", marginTop: 12, fontSize: 12.5, color: t.paperInkSoft }}><bdi dir="ltr">{dateText}</bdi></div>
      )}
    </Band>
  );
}

// ── Story ──────────────────────────────────────────────────────────────────
export function StorySection({ t, lang, items, clipTextOk }) {
  return (
    <Band id="sg-story" t={t}>
      <SectionTitle eyebrow={L(lang, "قصتنا", "הסיפור שלנו")} title={L(lang, "كيف نمت حكايتنا", "איך צמח הסיפור")} t={t} clipTextOk={clipTextOk} />
      <div style={{ maxWidth: 420, margin: "0 auto", display: "grid", gap: 14 }}>
        {items.map((it, i) => (
          <div key={i} style={{ borderInlineStart: `2px dotted ${t.rule}`, paddingInlineStart: 16 }}>
            {it.when && <div className="sg-track" style={{ fontSize: 9.5, fontWeight: 800, textTransform: "uppercase", color: t.paperInkSoft }}><bdi dir="ltr">{it.when}</bdi></div>}
            {it.title && <div style={{ fontWeight: 800, fontSize: 16, marginTop: 3, color: t.paperInk }}>{it.title}</div>}
            {it.body && <div style={{ fontSize: 13, marginTop: 3, lineHeight: 1.75, color: t.paperInkSoft }}>{it.body}</div>}
          </div>
        ))}
      </div>
    </Band>
  );
}

// ── Multi-day schedule (events[]) — the dotted garden spine ────────────────
export function ScheduleSection({ t, lang, items, clipTextOk }) {
  return (
    <Band id="sg-events" t={t}>
      <SectionTitle eyebrow={L(lang, "جدول الاحتفال", "לוח האירוע")} title={L(lang, "أيام فرحنا", "ימי השמחה")} t={t} clipTextOk={clipTextOk} />
      <div style={{ maxWidth: 420, margin: "0 auto", position: "relative" }}>
        {items.map((e, i) => {
          const query = [e.venue, e.address].filter(Boolean).join(" ");
          const href = e.mapUrl || (query ? `https://maps.google.com/?q=${encodeURIComponent(query)}` : "");
          const last = i === items.length - 1;
          return (
            <div key={i} style={{ position: "relative", paddingInlineStart: 34, paddingBottom: last ? 0 : 20 }}>
              {!last && <span aria-hidden="true" className="sg-spine" style={{ position: "absolute", insetInlineStart: 9, top: 22, bottom: 0 }} />}
              <span aria-hidden="true" style={{ position: "absolute", insetInlineStart: 0, top: 2, width: 20, height: 20, display: "flex", alignItems: "center", justifyContent: "center" }}>
                {e.icon ? <span style={{ fontSize: 15 }}>{e.icon}</span> : <Rose size={18} t={t} />}
              </span>
              {e.title && <div style={{ fontWeight: 800, fontSize: 15, color: t.paperInk }}>{e.title}</div>}
              {e.time && <div className="sg-track" style={{ fontSize: 10, fontWeight: 800, color: t.paperInkSoft, marginTop: 3 }}><bdi dir="ltr">{e.time}</bdi></div>}
              {e.venue && <div style={{ fontSize: 13, fontWeight: 700, marginTop: 5, color: t.paperInk }}>{e.venue}</div>}
              {e.address && <div style={{ fontSize: 12, marginTop: 2, lineHeight: 1.65, color: t.paperInkSoft }}>{e.address}</div>}
              {href && (
                <a href={href} target="_blank" rel="noreferrer" style={{ display: "inline-block", marginTop: 7, fontSize: 11, fontWeight: 800, color: t.paperInkSoft, textDecoration: "none", borderBottom: `1px solid ${t.rule}` }}>
                  {L(lang, "افتح في الخريطة ↗", "פתח במפה ↗")}
                </a>
              )}
            </div>
          );
        })}
      </div>
    </Band>
  );
}

// ── Venue ──────────────────────────────────────────────────────────────────
export function VenueSection({ t, lang, venue, venueCity, venueAddress, accessNote, hotels, clipTextOk }) {
  const query = [venue, venueAddress, venueCity].filter(Boolean).join(" ");
  const href = query ? `https://maps.google.com/?q=${encodeURIComponent(query)}` : "";
  return (
    <Band id="sg-venue" t={t}>
      <SectionTitle eyebrow={L(lang, "المكان", "המקום")} title={L(lang, "أين نحتفل", "איפה חוגגים")} t={t} clipTextOk={clipTextOk} />
      <div style={{ maxWidth: 420, margin: "0 auto", textAlign: "center", border: `1px solid ${t.rule}`, borderRadius: 4, padding: "22px 18px", position: "relative" }}>
        {venue && <div style={{ fontWeight: 900, fontSize: 19, color: t.paperInk }}>{venue}</div>}
        {venueCity && <div className="sg-track" style={{ fontSize: 10, fontWeight: 800, textTransform: "uppercase", color: t.paperInkSoft, marginTop: 6 }}>{venueCity}</div>}
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
        <div style={{ maxWidth: 420, margin: "12px auto 0", display: "grid", gap: 8 }}>
          {hotels.map((h, i) => (
            <div key={i} style={{ padding: "10px 14px", border: `1px solid ${t.rule}`, borderRadius: 4, display: "flex", justifyContent: "space-between", gap: 10 }}>
              <span style={{ fontWeight: 700, fontSize: 13, color: t.paperInk }}>{h.name}</span>
              {h.walk && <span style={{ fontSize: 12, color: t.paperInkSoft }}>{h.walk}</span>}
            </div>
          ))}
        </div>
      )}
    </Band>
  );
}

// ── Dress code ─────────────────────────────────────────────────────────────
export function DressCodeSection({ t, lang, dressCode, clipTextOk }) {
  return (
    <Band id="sg-dress" t={t}>
      <SectionTitle eyebrow={L(lang, "اللباس", "קוד לבוש")} title={L(lang, "بماذا نتأنّق؟", "איך מתלבשים?")} t={t} clipTextOk={clipTextOk} />
      <div style={{ maxWidth: 420, margin: "0 auto", textAlign: "center", fontSize: 14, lineHeight: 1.85, color: t.paperInk }}>{dressCode}</div>
    </Band>
  );
}

// ── RSVP ───────────────────────────────────────────────────────────────────
export function RsvpSection({ t, lang, opts, mealOptions, guestPhone, onSubmitRsvp, disabled, alreadyAnswered, rsvpDone, clipTextOk }) {
  const f = useRsvpForm({ guestPhone, opts, theme: t.theme, lang, onSubmitRsvp, rsvpDone, disabled });
  const chip = (on) => ({
    padding: "9px 14px", borderRadius: 999, cursor: "pointer", fontSize: 13, fontWeight: 700, fontFamily: "inherit",
    border: `1px solid ${on ? "transparent" : t.rule}`,
    background: on ? t.theme.accent : "transparent",
    color: on ? "#fffdf6" : t.paperInkSoft,
  });
  const input = { width: "100%", padding: "11px 13px", borderRadius: 4, border: `1px solid ${t.rule}`, background: "transparent", color: t.paperInk, fontFamily: "inherit", fontSize: 14 };

  return (
    <Band id="rsvp" t={t}>
      <SectionTitle eyebrow={L(lang, "تأكيد الحضور", "אישור הגעה")} title={L(lang, "هل ستحضرون؟", "מגיעים?")} t={t} clipTextOk={clipTextOk} />
      <div style={{ maxWidth: 400, margin: "0 auto", position: "relative" }}>
        {(alreadyAnswered && !f.showDone) || f.showDone ? (
          <div data-testid="rsvp-success" role="status" aria-live="polite" style={{ textAlign: "center", padding: "10px 0" }}>
            <div style={{ width: 52, height: 52, borderRadius: "50%", margin: "0 auto 12px", display: "flex", alignItems: "center", justifyContent: "center", background: t.theme.accent, color: "#fffdf6", fontSize: 25 }}>✓</div>
            <div style={{ fontWeight: 800, fontSize: 17, color: t.paperInk }}>
              {alreadyAnswered && !f.showDone
                ? L(lang, "تم تأكيد ردك", "כבר אישרת")
                : (f.status === "absent" ? L(lang, "نشكر إعلامكم", "תודה שהודעת") : L(lang, "بانتظاركم في حديقتنا", "מחכים לכם בגן"))}
            </div>
            {f.showDone && <p style={{ color: t.paperInkSoft, marginTop: 6, fontSize: 14 }}>{f.successText}</p>}
          </div>
        ) : (
          <>
            <div style={{ display: "flex", gap: 10, marginBottom: 14 }}>
              <button onClick={() => f.setStatus("attending")} style={{ ...chip(f.status === "attending"), flex: 1, padding: 12 }}>{L(lang, "✓ سأحضر", "✓ אגיע")}</button>
              <button onClick={() => f.setStatus("absent")} style={{ ...chip(f.status === "absent"), flex: 1, padding: 12 }}>{L(lang, "للأسف لا", "לצערי לא")}</button>
            </div>
            {f.status && (
              <div style={{ marginBottom: 12 }}>
                <label htmlFor="sg-rsvp-phone" style={{ display: "block", fontSize: 12, fontWeight: 700, color: t.paperInkSoft, marginBottom: 6 }}>{L(lang, "رقم هاتفك", "מספר טלפון")}</label>
                <PhoneInput value={f.phone} onChange={f.setPhone} lang={lang} inputId="sg-rsvp-phone" />
              </div>
            )}
            {f.status === "attending" && opts.companions && (
              <div style={{ marginBottom: 12 }}>
                <label style={{ display: "block", fontSize: 12, fontWeight: 700, color: t.paperInkSoft, marginBottom: 6 }}>{L(lang, "كم شخصاً أنتم؟", "כמה אתם?")}</label>
                <div style={{ display: "inline-flex", alignItems: "center", gap: 16, border: `1px solid ${t.rule}`, borderRadius: 999, padding: "6px 14px" }}>
                  <button onClick={() => f.setPartySize((c) => Math.max(1, c - 1))} aria-label="-" style={{ border: "none", background: "none", color: t.theme.accent, fontSize: 20, cursor: "pointer" }}>−</button>
                  <span style={{ color: t.paperInk, fontWeight: 800, minWidth: 20, textAlign: "center" }}><bdi dir="ltr">{f.partySize}</bdi></span>
                  <button onClick={() => f.setPartySize((c) => Math.min(21, c + 1))} aria-label="+" style={{ border: "none", background: "none", color: t.theme.accent, fontSize: 20, cursor: "pointer" }}>+</button>
                </div>
              </div>
            )}
            {f.status === "attending" && opts.meal && mealOptions.length > 0 && (
              <div style={{ marginBottom: 12 }}>
                <label style={{ display: "block", fontSize: 12, fontWeight: 700, color: t.paperInkSoft, marginBottom: 6 }}>{L(lang, "تفضيل الطعام", "העדפת מנה")}</label>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                  {mealOptions.map((opt) => <button key={opt} onClick={() => f.setMeal(opt)} style={chip(f.meal === opt)}>{opt}</button>)}
                </div>
              </div>
            )}
            {f.status === "attending" && opts.song && (
              <div style={{ marginBottom: 12 }}>
                <label htmlFor="sg-rsvp-song" style={{ display: "block", fontSize: 12, fontWeight: 700, color: t.paperInkSoft, marginBottom: 6 }}>{L(lang, "أغنية تحبّونها", "שיר שתאהבו")}</label>
                <input id="sg-rsvp-song" value={f.song} onChange={(e) => f.setSong(e.target.value.slice(0, 120))} placeholder={L(lang, "اسم الأغنية...", "שם השיר...")} dir="auto" style={input} />
              </div>
            )}
            <div style={{ marginBottom: 14 }}>
              <label htmlFor="sg-rsvp-note" style={{ display: "block", fontSize: 12, fontWeight: 700, color: t.paperInkSoft, marginBottom: 6 }}>{L(lang, "رسالة للعروسين", "ברכה לזוג")}</label>
              <textarea id="sg-rsvp-note" rows={3} value={f.note} onChange={(e) => f.setNote(e.target.value.slice(0, 500))} placeholder={L(lang, "مبروك مقدماً...", "מזל טוב מראש...")} style={{ ...input, resize: "vertical" }} />
            </div>
            {f.error && <div role="alert" style={{ color: t.theme.rsvpAbsent, fontSize: 13, marginBottom: 12, textAlign: "center" }}>{f.error}</div>}
            <SgButton t={t} full onClick={f.submit} disabled={f.busy || !f.status || disabled} testid="sg-rsvp-submit">
              {f.busy ? L(lang, "جاري الإرسال...", "שולח...") : `${L(lang, "أرسل ردّي", "שלח תשובה")} ←`}
            </SgButton>
          </>
        )}
        <div style={{ position: "absolute", inset: 0, overflow: "hidden", pointerEvents: "none" }}>
          {f.hearts.map((h) => (
            <span key={h.id} style={{ position: "absolute", bottom: 0, left: `${h.left}%`, color: t.rose, fontSize: 20, animation: "sg-float 2s ease-out forwards", animationDelay: `${h.delay}s` }}>♥</span>
          ))}
        </div>
        <style>{"@keyframes sg-float{to{transform:translateY(-120px);opacity:0}}"}</style>
      </div>
    </Band>
  );
}

// ── Gift ───────────────────────────────────────────────────────────────────
export function GiftSection({ t, lang, giftNote, giftIban, clipTextOk }) {
  return (
    <Band id="sg-gift" t={t}>
      <SectionTitle eyebrow={L(lang, "هدية", "מתנה")} title={L(lang, "حضوركم أجمل هدية", "נוכחותכם היא המתנה")} t={t} clipTextOk={clipTextOk} />
      <div style={{ maxWidth: 420, margin: "0 auto", textAlign: "center" }}>
        {giftNote && <div style={{ fontSize: 13.5, lineHeight: 1.85, color: t.paperInk }}>{giftNote}</div>}
        {giftIban && (
          <div style={{ marginTop: 12, padding: "9px 14px", border: `1px solid ${t.rule}`, borderRadius: 4, display: "inline-block" }}>
            <bdi dir="ltr" style={{ fontWeight: 800, fontSize: 13, color: t.paperInk }}>{giftIban}</bdi>
          </div>
        )}
      </div>
    </Band>
  );
}

// ── Guestbook ──────────────────────────────────────────────────────────────
export function GuestbookSection({ t, lang, wishes, approvedWishes, clipTextOk }) {
  const all = [...(approvedWishes || []), ...(wishes || [])];
  if (!all.length) return null;
  return (
    <Band id="sg-guestbook" t={t}>
      <SectionTitle eyebrow={L(lang, "التهاني", "ברכות")} title={L(lang, "كلمات من الأحبة", "מילים מהאוהבים")} t={t} clipTextOk={clipTextOk} />
      <div style={{ maxWidth: 420, margin: "0 auto", display: "grid", gap: 10 }}>
        {all.map((w, i) => (
          <div key={i} style={{ padding: "14px 16px", border: `1px solid ${t.rule}`, borderRadius: 4 }}>
            <div style={{ fontSize: 13.5, lineHeight: 1.8, color: t.paperInk }}>{w.what || w.text}</div>
            {(w.who || w.name) && <div style={{ fontSize: 11.5, fontWeight: 800, color: t.paperInkSoft, marginTop: 7 }}>— {w.who || w.name}</div>}
          </div>
        ))}
      </div>
    </Band>
  );
}

// ── Footer ─────────────────────────────────────────────────────────────────
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
