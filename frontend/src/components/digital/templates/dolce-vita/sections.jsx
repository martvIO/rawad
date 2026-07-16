// Dolce Vita sections — Italian-riviera stationery. They render from the SAME
// design-doc fields every other template reads (no new schema) and route RSVP +
// countdown through the shared hooks, so behaviour is identical everywhere and
// only the identity differs. Colour comes from the CSS vars on .tpl-dv + the
// motif tokens in `t`.
import { useRsvpForm } from "../../../../hooks/useRsvpForm.js";
import { useCountdown } from "../../../../hooks/useCountdown.js";
import { PhoneInput } from "../../../PhoneInput.jsx";
import { ScratchDate } from "./Scratch.jsx";

const L = (lang, ar, he) => (lang === "he" ? he : ar);

// ── Shared bits ────────────────────────────────────────────────────────────
export function SectionTitle({ eyebrow, title, t, clipTextOk }) {
  return (
    <div style={{ textAlign: "center", marginBottom: 22 }}>
      {eyebrow && (
        <div className="dv-track" style={{ fontSize: 10, fontWeight: 800, textTransform: "uppercase", color: t.theme.eyebrow, marginBottom: 8 }}>
          {eyebrow}
        </div>
      )}
      <h2
        className={clipTextOk ? "dv-grad" : "dv-grad-off"}
        style={{ fontFamily: "inherit", fontWeight: 900, fontSize: "clamp(22px,5.6vw,30px)", lineHeight: 1.35, margin: 0, paddingBlock: 4 }}
      >
        {title}
      </h2>
      <div aria-hidden="true" style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8, marginTop: 10 }}>
        <span style={{ width: 34, height: 1, background: t.theme.accentLine }} />
        <span style={{ width: 5, height: 5, transform: "rotate(45deg)", background: t.theme.accent }} />
        <span style={{ width: 34, height: 1, background: t.theme.accentLine }} />
      </div>
    </div>
  );
}

export function DvButton({ children, onClick, disabled, t, full, testid }) {
  return (
    <button
      type="button"
      data-testid={testid}
      onClick={onClick}
      disabled={disabled}
      style={{
        width: full ? "100%" : undefined,
        padding: "12px 22px", borderRadius: 999, border: "none",
        background: `linear-gradient(135deg, ${t.theme.accent}, ${t.trim})`,
        color: t.isLight ? "#fffdf8" : "#141414",
        fontWeight: 800, fontSize: 14, fontFamily: "inherit",
        cursor: disabled ? "not-allowed" : "pointer", opacity: disabled ? 0.6 : 1,
      }}
    >
      {children}
    </button>
  );
}

// ── Hero: the opened letter ────────────────────────────────────────────────
export function Hero({ t, lang, guestName, namesLine, eyebrow, venueLine, blessing, clipTextOk }) {
  return (
    <header style={{ padding: "58px 20px 26px" }}>
      <div className="dv-letter dv-reveal d1" style={{ maxWidth: t.maxW, margin: "0 auto", textAlign: "center", paddingBlock: 40 }}>
        <div className="dv-track" style={{ fontSize: 10, fontWeight: 800, textTransform: "uppercase", color: t.paperInkSoft }}>
          {eyebrow || L(lang, "أنتم مدعوون", "אתם מוזמנים")}
        </div>
        <h1
          className={clipTextOk ? "dv-grad" : "dv-grad-off"}
          style={{ fontFamily: "inherit", fontWeight: 900, fontSize: "clamp(28px,7.6vw,40px)", lineHeight: 1.2, margin: "14px 0 0", paddingBlock: 4 }}
        >
          {namesLine}
        </h1>
        {blessing && <div style={{ fontSize: 13, color: t.paperInkSoft, marginTop: 10, lineHeight: 1.8 }}>{blessing}</div>}
        <div aria-hidden="true" style={{ margin: "16px auto", width: 50, height: 1, background: t.rule }} />
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

// ── The signature: scratch the date ────────────────────────────────────────
export function ScratchDateSection({ t, lang, weddingDate, clipTextOk, reducedMotion }) {
  return (
    <section className="dv-scroll" id="dv-date" style={{ padding: "30px 20px" }}>
      <SectionTitle eyebrow={L(lang, "احفظوا التاريخ", "שמרו את התאריך")} title={L(lang, "متى نلتقي؟", "מתי נפגשים?")} t={t} clipTextOk={clipTextOk} />
      <ScratchDate t={t} lang={lang} weddingDate={weddingDate} reducedMotion={reducedMotion} />
    </section>
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
    <section className="dv-scroll" id="dv-countdown" style={{ padding: "30px 20px" }}>
      <SectionTitle eyebrow={L(lang, "العدّ التنازلي", "ספירה לאחור")} title={L(lang, "حتى اللقاء", "עד המפגש")} t={t} clipTextOk={clipTextOk} />
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 9, maxWidth: 360, margin: "0 auto" }}>
        {tiles.map(([val, label], i) => (
          <div key={i} className="dv-tile" style={{ padding: "13px 4px", textAlign: "center" }}>
            <div style={{ fontWeight: 900, fontSize: "clamp(20px,6.4vw,27px)", lineHeight: 1, color: t.paperInk }}>
              <bdi dir="ltr">{String(val).padStart(2, "0")}</bdi>
            </div>
            <div style={{ fontSize: 9.5, color: t.paperInkSoft, marginTop: 5, fontWeight: 700 }}>{label}</div>
          </div>
        ))}
      </div>
      {dateText && (
        <div style={{ textAlign: "center", marginTop: 12, fontSize: 12.5, color: t.theme.textSoft }}>
          <bdi dir="ltr">{dateText}</bdi>
        </div>
      )}
    </section>
  );
}

// ── Story ──────────────────────────────────────────────────────────────────
export function StorySection({ t, lang, items, clipTextOk }) {
  return (
    <section className="dv-scroll" id="dv-story" style={{ padding: "30px 20px" }}>
      <SectionTitle eyebrow={L(lang, "قصتنا", "הסיפור שלנו")} title={L(lang, "كيف وصلنا إلى هنا", "איך הגענו לכאן")} t={t} clipTextOk={clipTextOk} />
      <div style={{ maxWidth: t.maxW, margin: "0 auto", display: "grid", gap: 12 }}>
        {items.map((it, i) => (
          <div key={i} className="dv-letter" style={{ padding: "18px 20px" }}>
            {it.when && <div className="dv-track" style={{ fontSize: 9.5, fontWeight: 800, textTransform: "uppercase", color: t.paperInkSoft }}><bdi dir="ltr">{it.when}</bdi></div>}
            {it.title && <div style={{ fontWeight: 800, fontSize: 16, marginTop: 4, color: t.paperInk }}>{it.title}</div>}
            {it.body && <div style={{ fontSize: 13, marginTop: 4, lineHeight: 1.75, color: t.paperInkSoft }}>{it.body}</div>}
          </div>
        ))}
      </div>
    </section>
  );
}

// ── Multi-day schedule (events[]) — a seaside day plan ─────────────────────
export function ScheduleSection({ t, lang, items, clipTextOk }) {
  return (
    <section className="dv-scroll" id="dv-events" style={{ padding: "30px 20px" }}>
      <SectionTitle eyebrow={L(lang, "جدول الاحتفال", "לוח האירוע")} title={L(lang, "أيام فرحنا", "ימי השמחה")} t={t} clipTextOk={clipTextOk} />
      <div style={{ maxWidth: t.maxW, margin: "0 auto", display: "grid", gap: 12 }}>
        {items.map((e, i) => {
          const query = [e.venue, e.address].filter(Boolean).join(" ");
          const href = e.mapUrl || (query ? `https://maps.google.com/?q=${encodeURIComponent(query)}` : "");
          return (
            <div key={i} className="dv-letter" style={{ padding: "16px 18px", display: "grid", gridTemplateColumns: "auto 1fr", gap: 12, alignItems: "start" }}>
              <span aria-hidden="true" style={{ fontSize: 20, lineHeight: 1.2 }}>{e.icon || "•"}</span>
              <div style={{ minWidth: 0 }}>
                {e.title && <div style={{ fontWeight: 800, fontSize: 15, color: t.paperInk }}>{e.title}</div>}
                {e.time && <div className="dv-track" style={{ fontSize: 10, fontWeight: 800, color: t.paperInkSoft, marginTop: 3 }}><bdi dir="ltr">{e.time}</bdi></div>}
                {e.venue && <div style={{ fontSize: 13, fontWeight: 700, marginTop: 6, color: t.paperInk }}>{e.venue}</div>}
                {e.address && <div style={{ fontSize: 12, marginTop: 2, lineHeight: 1.65, color: t.paperInkSoft }}>{e.address}</div>}
                {href && (
                  <a href={href} target="_blank" rel="noreferrer" style={{ display: "inline-block", marginTop: 8, fontSize: 11, fontWeight: 800, color: t.paperInkSoft, textDecoration: "none", borderBottom: `1px solid ${t.rule}` }}>
                    {L(lang, "افتح في الخريطة ↗", "פתח במפה ↗")}
                  </a>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

// ── Venue ──────────────────────────────────────────────────────────────────
export function VenueSection({ t, lang, venue, venueCity, venueAddress, accessNote, hotels, clipTextOk }) {
  const query = [venue, venueAddress, venueCity].filter(Boolean).join(" ");
  const href = query ? `https://maps.google.com/?q=${encodeURIComponent(query)}` : "";
  return (
    <section className="dv-scroll" id="dv-venue" style={{ padding: "30px 20px" }}>
      <SectionTitle eyebrow={L(lang, "المكان", "המקום")} title={L(lang, "أين نحتفل", "איפה חוגגים")} t={t} clipTextOk={clipTextOk} />
      <div className="dv-letter" style={{ maxWidth: t.maxW, margin: "0 auto", textAlign: "center", padding: "24px 20px" }}>
        {venue && <div style={{ fontWeight: 900, fontSize: 20, color: t.paperInk }}>{venue}</div>}
        {venueCity && <div className="dv-track" style={{ fontSize: 10, fontWeight: 800, textTransform: "uppercase", color: t.paperInkSoft, marginTop: 6 }}>{venueCity}</div>}
        {venueAddress && <div style={{ fontSize: 13, color: t.paperInkSoft, marginTop: 10, lineHeight: 1.7 }}>{venueAddress}</div>}
        {accessNote && <div style={{ fontSize: 12, color: t.paperInkSoft, marginTop: 8, opacity: 0.85 }}>{accessNote}</div>}
        {href && (
          <div style={{ marginTop: 16 }}>
            <a href={href} target="_blank" rel="noreferrer" style={{ textDecoration: "none" }}>
              <span style={{ display: "inline-block", padding: "9px 18px", borderRadius: 999, border: `1px solid ${t.rule}`, color: t.paperInk, fontSize: 12, fontWeight: 800 }}>
                {L(lang, "افتح في الخريطة ↗", "פתח במפה ↗")}
              </span>
            </a>
          </div>
        )}
      </div>
      {hotels.length > 0 && (
        <div style={{ maxWidth: t.maxW, margin: "12px auto 0", display: "grid", gap: 8 }}>
          {hotels.map((h, i) => (
            <div key={i} className="dv-tile" style={{ padding: "11px 14px", display: "flex", justifyContent: "space-between", gap: 10 }}>
              <span style={{ fontWeight: 700, fontSize: 13 }}>{h.name}</span>
              {h.walk && <span style={{ fontSize: 12, color: t.paperInkSoft }}>{h.walk}</span>}
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

// ── Dress code — the source's signature swatch strip ───────────────────────
// dressCode is an existing design field that NO template rendered until now.
export function DressCodeSection({ t, lang, dressCode, clipTextOk }) {
  return (
    <section className="dv-scroll" id="dv-dress" style={{ padding: "30px 20px" }}>
      <SectionTitle eyebrow={L(lang, "اللباس", "קוד לבוש")} title={L(lang, "بماذا نتأنّق؟", "איך מתלבשים?")} t={t} clipTextOk={clipTextOk} />
      <div className="dv-letter" style={{ maxWidth: t.maxW, margin: "0 auto", textAlign: "center", padding: "22px 20px" }}>
        <div style={{ fontSize: 14, lineHeight: 1.85, color: t.paperInk }}>{dressCode}</div>
        {/* Swatches drawn from the template's own palette — a visual cue for the
            tone, not a claim about the couple's exact colours. */}
        <div aria-hidden="true" style={{ display: "flex", justifyContent: "center", gap: 8, marginTop: 16 }}>
          {[t.sea, t.foilSoft, t.trim, t.paperSoft].map((c, i) => (
            <span key={i} style={{ width: 22, height: 22, borderRadius: "50%", background: c, border: `1px solid ${t.rule}` }} />
          ))}
        </div>
      </div>
    </section>
  );
}

// ── RSVP ───────────────────────────────────────────────────────────────────
export function RsvpSection({ t, lang, opts, mealOptions, guestPhone, onSubmitRsvp, disabled, alreadyAnswered, rsvpDone, clipTextOk }) {
  const f = useRsvpForm({ guestPhone, opts, theme: t.theme, lang, onSubmitRsvp, rsvpDone, disabled });
  const chip = (on) => ({
    padding: "9px 14px", borderRadius: 999, cursor: "pointer", fontSize: 13, fontWeight: 700, fontFamily: "inherit",
    border: `1px solid ${on ? "transparent" : t.theme.accentLine}`,
    background: on ? t.theme.accent : "transparent",
    color: on ? (t.isLight ? "#fffdf8" : "#141414") : t.theme.textSoft,
  });
  const input = { width: "100%", padding: "11px 13px", borderRadius: 10, border: `1px solid ${t.theme.accentLine}`, background: "transparent", color: t.theme.text, fontFamily: "inherit", fontSize: 14 };

  return (
    <section className="dv-scroll" id="rsvp" style={{ padding: "30px 20px" }}>
      <SectionTitle eyebrow={L(lang, "تأكيد الحضور", "אישור הגעה")} title={L(lang, "هل ستحضرون؟", "מגיעים?")} t={t} clipTextOk={clipTextOk} />
      <div style={{ maxWidth: 400, margin: "0 auto", position: "relative", background: t.theme.cardBg, border: `1px solid ${t.theme.cardBorder}`, borderRadius: 14, padding: 20 }}>
        {(alreadyAnswered && !f.showDone) || f.showDone ? (
          <div data-testid="rsvp-success" role="status" aria-live="polite" style={{ textAlign: "center", padding: "10px 0" }}>
            <div style={{ width: 52, height: 52, borderRadius: "50%", margin: "0 auto 12px", display: "flex", alignItems: "center", justifyContent: "center", background: t.theme.accent, color: t.isLight ? "#fffdf8" : "#141414", fontSize: 25 }}>✓</div>
            <div style={{ fontWeight: 800, fontSize: 17, color: t.theme.text }}>
              {alreadyAnswered && !f.showDone
                ? L(lang, "تم تأكيد ردك", "כבר אישרת")
                : (f.status === "absent" ? L(lang, "نشكر إعلامكم", "תודה שהודעת") : L(lang, "سعداء بلقائكم!", "נשמח לראותכם!"))}
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
                <label htmlFor="dv-rsvp-phone" style={{ display: "block", fontSize: 12, fontWeight: 700, color: t.theme.accent, marginBottom: 6 }}>{L(lang, "رقم هاتفك", "מספר טלפון")}</label>
                <PhoneInput value={f.phone} onChange={f.setPhone} lang={lang} inputId="dv-rsvp-phone" />
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
                <label htmlFor="dv-rsvp-song" style={{ display: "block", fontSize: 12, fontWeight: 700, color: t.theme.accent, marginBottom: 6 }}>{L(lang, "أغنية تحبّونها", "שיר שתאהבו")}</label>
                <input id="dv-rsvp-song" value={f.song} onChange={(e) => f.setSong(e.target.value.slice(0, 120))} placeholder={L(lang, "اسم الأغنية...", "שם השיר...")} dir="auto" style={input} />
              </div>
            )}
            <div style={{ marginBottom: 14 }}>
              <label htmlFor="dv-rsvp-note" style={{ display: "block", fontSize: 12, fontWeight: 700, color: t.theme.accent, marginBottom: 6 }}>{L(lang, "رسالة للعروسين", "ברכה לזוג")}</label>
              <textarea id="dv-rsvp-note" rows={3} value={f.note} onChange={(e) => f.setNote(e.target.value.slice(0, 500))} placeholder={L(lang, "مبروك مقدماً...", "מזל טוב מראש...")} style={{ ...input, resize: "vertical" }} />
            </div>
            {f.error && <div role="alert" style={{ color: t.theme.rsvpAbsent, fontSize: 13, marginBottom: 12, textAlign: "center" }}>{f.error}</div>}
            <DvButton t={t} full onClick={f.submit} disabled={f.busy || !f.status || disabled} testid="dv-rsvp-submit">
              {f.busy ? L(lang, "جاري الإرسال...", "שולח...") : `${L(lang, "أرسل ردّي", "שלח תשובה")} ←`}
            </DvButton>
          </>
        )}
        <div style={{ position: "absolute", inset: 0, overflow: "hidden", pointerEvents: "none" }}>
          {f.hearts.map((h) => (
            <span key={h.id} style={{ position: "absolute", bottom: 0, left: `${h.left}%`, color: t.theme.accent, fontSize: 20, animation: "dv-float 2s ease-out forwards", animationDelay: `${h.delay}s` }}>♥</span>
          ))}
        </div>
        <style>{"@keyframes dv-float{to{transform:translateY(-120px);opacity:0}}"}</style>
      </div>
    </section>
  );
}

// ── Gift ───────────────────────────────────────────────────────────────────
export function GiftSection({ t, lang, giftNote, giftIban, clipTextOk }) {
  return (
    <section className="dv-scroll" id="dv-gift" style={{ padding: "30px 20px" }}>
      <SectionTitle eyebrow={L(lang, "هدية", "מתנה")} title={L(lang, "حضوركم أجمل هدية", "נוכחותכם היא המתנה")} t={t} clipTextOk={clipTextOk} />
      <div className="dv-letter" style={{ maxWidth: t.maxW, margin: "0 auto", textAlign: "center", padding: "22px 20px" }}>
        {giftNote && <div style={{ fontSize: 13.5, lineHeight: 1.85, color: t.paperInk }}>{giftNote}</div>}
        {giftIban && (
          <div className="dv-tile" style={{ marginTop: 14, padding: "10px 14px", display: "inline-block" }}>
            <bdi dir="ltr" style={{ fontWeight: 800, fontSize: 13, letterSpacing: ".04em" }}>{giftIban}</bdi>
          </div>
        )}
      </div>
    </section>
  );
}

// ── Guestbook ──────────────────────────────────────────────────────────────
export function GuestbookSection({ t, lang, wishes, approvedWishes, clipTextOk }) {
  const all = [...(approvedWishes || []), ...(wishes || [])];
  if (!all.length) return null;
  return (
    <section className="dv-scroll" id="dv-guestbook" style={{ padding: "30px 20px" }}>
      <SectionTitle eyebrow={L(lang, "التهاني", "ברכות")} title={L(lang, "كلمات من الأحبة", "מילים מהאוהבים")} t={t} clipTextOk={clipTextOk} />
      <div style={{ maxWidth: t.maxW, margin: "0 auto", display: "grid", gap: 10 }}>
        {all.map((w, i) => (
          <div key={i} className="dv-letter" style={{ padding: "16px 18px" }}>
            <div style={{ fontSize: 13.5, lineHeight: 1.8, color: t.paperInk }}>{w.what || w.text}</div>
            {(w.who || w.name) && <div style={{ fontSize: 11.5, fontWeight: 800, color: t.paperInkSoft, marginTop: 8 }}>— {w.who || w.name}</div>}
          </div>
        ))}
      </div>
    </section>
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
