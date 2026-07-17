// Royal Gold sections — cream script on a wine wall, torn cream bands, photos
// hung in gold frames. Same design-doc fields as every other template (no new
// schema); RSVP + countdown route through the shared hooks.
//
// Every section takes `onBand`, which the view assigns by RENDERED index so the
// wall/band stripe alternates correctly no matter which sections are switched
// off. Colours come from ink(t, onBand) — never hard-coded — because the ivory
// palette inverts the wall and band roles.
import { useRsvpForm } from "../../../../hooks/useRsvpForm.js";
import { useCountdown } from "../../../../hooks/useCountdown.js";
import { PhoneInput } from "../../../PhoneInput.jsx";
import { Block, SectionTitle, HungFrame, WaxSeal, Rose, Diamond, RgButton, ink, L } from "./parts.jsx";

// Fixed tilts, cycled by index: the frames must hang the same way on every
// render, so this is a table rather than Math.random().
const TILTS = [-4, 3.2, -2.4, 4.4, -3.6, 2.2];

const mapHref = (parts, explicit) => {
  if (explicit) return explicit;
  const q = parts.filter(Boolean).join(" ");
  return q ? "https://maps.google.com/?q=" + encodeURIComponent(q) : "";
};

// ── Hero — always on the wall ───────────────────────────────────────────────
export function Hero({ t, lang, guestName, namesLine, eyebrow, blessing, dateText, venueLine }) {
  const c = ink(t, false);
  return (
    <header style={{ position: "relative", padding: "clamp(64px,17vw,112px) 22px 56px", textAlign: "center" }}>
      {/* a pool of light on the wine wall, so the ground reads as a room */}
      <div aria-hidden="true" style={{
        position: "absolute", inset: 0, pointerEvents: "none",
        background: "radial-gradient(115% 70% at 50% 24%, " + t.frame + "1f 0%, transparent 60%)",
      }} />
      <div className="rg-reveal d1" style={{ position: "relative" }}>
        {blessing && <div style={{ fontSize: 13, color: c.soft, marginBottom: 18, lineHeight: 1.9 }}>{blessing}</div>}
        <div className="rg-track" style={{ fontSize: 10, fontWeight: 700, color: t.frameInk }}>
          {eyebrow || L(lang, "أنتم مدعوون", "אתם מוזמנים")}
        </div>
        <h1 style={{
          fontFamily: "inherit", fontWeight: 800, fontSize: "clamp(32px,9vw,50px)",
          lineHeight: 1.25, margin: "16px 0 0", color: c.text, paddingBlock: 4,
        }}>
          {namesLine}
        </h1>
      </div>
      <div className="rg-reveal d2" style={{ position: "relative" }}>
        <div aria-hidden="true" style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 10, margin: "22px 0" }}>
          <span style={{ width: 44, height: 1, background: t.rule }} />
          <Rose t={t} size={22} />
          <span style={{ width: 44, height: 1, background: t.rule }} />
        </div>
        {dateText && (
          <div style={{ fontSize: 15, color: c.text, fontWeight: 700 }}>
            <bdi dir="ltr">{dateText}</bdi>
          </div>
        )}
        {venueLine && <div style={{ fontSize: 13.5, color: c.soft, marginTop: 8, lineHeight: 1.8 }}>{venueLine}</div>}
      </div>
      {guestName && (
        <div className="rg-reveal d3" style={{ position: "relative", marginTop: 32, fontSize: 13, color: c.soft }}>
          {L(lang, "إلى", "אל")} <span style={{ color: t.frameInk, fontWeight: 800 }}>{guestName}</span>
        </div>
      )}
    </header>
  );
}

export function StartsIn({ t, lang, weddingDate, onBand }) {
  const { d, h, m, s } = useCountdown(weddingDate);
  const c = ink(t, onBand);
  const tiles = [
    [d, L(lang, "يوم", "ימים")],
    [h, L(lang, "ساعة", "שעות")],
    [m, L(lang, "دقيقة", "דקות")],
    [s, L(lang, "ثانية", "שניות")],
  ];
  return (
    <Block t={t} id="rg-countdown" onBand={onBand}>
      <SectionTitle title={L(lang, "يبدأ بعد", "מתחיל בעוד")} t={t} onBand={onBand} />
      <div style={{ display: "flex", justifyContent: "center", alignItems: "baseline", gap: 6, flexWrap: "wrap" }}>
        {tiles.map(([val, label], i) => (
          <div key={i} style={{ textAlign: "center", minWidth: 64 }}>
            <div style={{ fontWeight: 800, fontSize: "clamp(28px,8vw,40px)", lineHeight: 1, color: c.accent }}>
              <bdi dir="ltr">{String(val).padStart(2, "0")}</bdi>
            </div>
            <div className="rg-track" style={{ fontSize: 9, fontWeight: 700, color: c.soft, marginTop: 9 }}>{label}</div>
          </div>
        ))}
      </div>
    </Block>
  );
}

// ── Gallery — the photos hang in gold frames on the wall ────────────────────
export function GallerySection({ t, lang, items, onBand }) {
  const c = ink(t, onBand);
  return (
    <Block t={t} id="rg-gallery" onBand={onBand}>
      <SectionTitle title={L(lang, "لحظات نحتفظ بها", "רגעים ששמרנו")} t={t} onBand={onBand} />
      <div style={{
        display: "flex", flexWrap: "wrap", justifyContent: "center",
        gap: "34px 22px", maxWidth: t.maxW, margin: "0 auto",
      }}>
        {items.map((m, i) => (
          <div key={m.storagePath || i} style={{ marginTop: i % 2 === 1 ? 22 : 0 }}>
            <HungFrame t={t} src={m.url} alt={m.cap || ""} kind={m.kind} tilt={TILTS[i % TILTS.length]} w={140} />
            {m.cap && (
              <div style={{ textAlign: "center", marginTop: 12, fontSize: 11.5, color: c.soft, maxWidth: 140 }}>
                {m.cap}
              </div>
            )}
          </div>
        ))}
      </div>
    </Block>
  );
}

export function StorySection({ t, lang, items, onBand }) {
  const c = ink(t, onBand);
  return (
    <Block t={t} id="rg-story" onBand={onBand}>
      <SectionTitle title={L(lang, "قصتنا", "הסיפור שלנו")} t={t} onBand={onBand} />
      <div style={{ maxWidth: 400, margin: "0 auto", display: "grid", gap: 28 }}>
        {items.map((it, i) => (
          <div key={i} style={{ textAlign: "center" }}>
            {it.when && <div className="rg-track" style={{ fontSize: 9, fontWeight: 700, color: c.accent }}><bdi dir="ltr">{it.when}</bdi></div>}
            {it.title && <div style={{ fontWeight: 800, fontSize: 17, marginTop: 8, color: c.text }}>{it.title}</div>}
            {it.body && <div style={{ fontSize: 13.5, marginTop: 8, lineHeight: 1.9, color: c.soft }}>{it.body}</div>}
            {i < items.length - 1 && (
              <div aria-hidden="true" style={{ display: "flex", justifyContent: "center", marginTop: 28 }}>
                <Diamond t={t} size={5} />
              </div>
            )}
          </div>
        ))}
      </div>
    </Block>
  );
}

// ── Multi-day schedule — a rose crowns the spine, diamonds mark the legs ────
export function ScheduleSection({ t, lang, items, onBand }) {
  const c = ink(t, onBand);
  return (
    <Block t={t} id="rg-events" onBand={onBand}>
      <div style={{ display: "flex", justifyContent: "center", marginBottom: 10 }}>
        <Rose t={t} size={30} />
      </div>
      <SectionTitle title={L(lang, "جدول الاحتفال", "לוח האירוע")} t={t} onBand={onBand} />
      <div style={{ maxWidth: 400, margin: "0 auto", position: "relative" }}>
        {/* the spine the legs hang off */}
        <div aria-hidden="true" style={{
          position: "absolute", insetInlineStart: 3.5, top: 6, bottom: 6,
          width: 1, background: t.rule,
        }} />
        <div style={{ display: "grid", gap: 26 }}>
          {items.map((e, i) => {
            const href = mapHref([e.venue, e.address], e.mapUrl);
            return (
              <div key={i} style={{ display: "flex", gap: 16, alignItems: "flex-start" }}>
                <div style={{ paddingTop: 6 }}><Diamond t={t} size={8} /></div>
                <div style={{ flex: 1 }}>
                  {e.time && <div className="rg-track" style={{ fontSize: 9, fontWeight: 700, color: c.accent }}><bdi dir="ltr">{e.time}</bdi></div>}
                  {e.title && <div style={{ fontWeight: 800, fontSize: 16, marginTop: 6, color: c.text }}>{e.title}</div>}
                  {e.venue && <div style={{ fontSize: 13, marginTop: 5, color: c.soft }}>{e.venue}</div>}
                  {e.address && <div style={{ fontSize: 12, marginTop: 3, lineHeight: 1.7, color: c.soft, opacity: 0.85 }}>{e.address}</div>}
                  {href && (
                    <a href={href} target="_blank" rel="noreferrer" className="rg-track"
                      style={{ display: "inline-block", marginTop: 9, fontSize: 9, fontWeight: 700, color: c.accent, textDecoration: "none", borderBottom: "1px solid " + c.line, paddingBottom: 3 }}>
                      {L(lang, "الخريطة", "מפה")}
                    </a>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </Block>
  );
}

export function VenueSection({ t, lang, venue, venueCity, venueAddress, accessNote, hotels, onBand }) {
  const c = ink(t, onBand);
  const href = mapHref([venue, venueAddress, venueCity]);
  return (
    <Block t={t} id="rg-venue" onBand={onBand}>
      <SectionTitle title={L(lang, "المكان", "המקום")} t={t} onBand={onBand} />
      <div style={{ textAlign: "center", maxWidth: t.maxW, margin: "0 auto" }}>
        {venue && <div style={{ fontWeight: 800, fontSize: 21, color: c.text }}>{venue}</div>}
        {venueCity && <div className="rg-track" style={{ fontSize: 9.5, fontWeight: 700, color: c.accent, marginTop: 10 }}>{venueCity}</div>}
        {venueAddress && <div style={{ fontSize: 13.5, color: c.soft, marginTop: 12, lineHeight: 1.8 }}>{venueAddress}</div>}
        {accessNote && <div style={{ fontSize: 12.5, color: c.soft, marginTop: 8, opacity: 0.85 }}>{accessNote}</div>}
        {href && (
          <div style={{ marginTop: 20 }}>
            <a href={href} target="_blank" rel="noreferrer" style={{ textDecoration: "none" }}>
              <RgButton t={t} onBand={onBand} testid="rg-map">{L(lang, "الخريطة", "מפה")}</RgButton>
            </a>
          </div>
        )}
        {hotels.length > 0 && (
          <div style={{ marginTop: 26, display: "grid", gap: 12 }}>
            {hotels.map((h, i) => (
              <div key={i} style={{ fontSize: 13, color: c.soft }}>
                <span style={{ color: c.text, fontWeight: 800 }}>{h.name}</span>
                {h.walk && <span> · {h.walk}</span>}
              </div>
            ))}
          </div>
        )}
      </div>
    </Block>
  );
}

export function DressCodeSection({ t, lang, dressCode, onBand }) {
  const c = ink(t, onBand);
  return (
    <Block t={t} id="rg-dress" onBand={onBand}>
      <SectionTitle title={L(lang, "اللباس", "קוד לבוש")} t={t} onBand={onBand} />
      <div style={{ maxWidth: 380, margin: "0 auto", textAlign: "center", fontSize: 14, lineHeight: 1.95, color: c.soft }}>
        {dressCode}
      </div>
    </Block>
  );
}

export function RsvpSection({ t, lang, opts, mealOptions, guestPhone, onSubmitRsvp, disabled, alreadyAnswered, rsvpDone, onBand }) {
  const f = useRsvpForm({ guestPhone, opts, theme: t.theme, lang, onSubmitRsvp, rsvpDone, disabled });
  const c = ink(t, onBand);
  const chip = (on) => ({
    padding: "10px 16px", borderRadius: 999, cursor: "pointer", fontSize: 11, fontFamily: "inherit", fontWeight: 700,
    border: "1px solid " + (on ? c.accent : c.line),
    background: on ? (onBand ? "rgba(0,0,0,.06)" : t.theme.accentMuted) : "transparent",
    color: on ? c.accent : c.soft,
  });
  const input = {
    width: "100%", padding: "12px 0", borderRadius: 0, border: "none",
    borderBottom: "1px solid " + c.line, background: "transparent",
    color: c.text, fontFamily: "inherit", fontSize: 14,
  };
  const label = { display: "block", fontSize: 9, fontWeight: 700, color: c.soft, marginBottom: 8 };

  return (
    <Block t={t} id="rsvp" onBand={onBand}>
      <SectionTitle title={L(lang, "تأكيد الحضور", "אישור הגעה")} t={t} onBand={onBand} />
      <div style={{ maxWidth: 380, margin: "0 auto", position: "relative" }}>
        {(alreadyAnswered && !f.showDone) || f.showDone ? (
          <div data-testid="rsvp-success" role="status" aria-live="polite" style={{ textAlign: "center" }}>
            <div style={{ display: "flex", justifyContent: "center", marginBottom: 16 }}><WaxSeal t={t} size={54} /></div>
            <div style={{ fontWeight: 800, fontSize: 17, color: c.text }}>
              {alreadyAnswered && !f.showDone
                ? L(lang, "تم تأكيد ردك", "כבר אישרת")
                : (f.status === "absent" ? L(lang, "نشكر إعلامكم", "תודה שהודעת") : L(lang, "بانتظاركم", "מחכים לכם"))}
            </div>
            {f.showDone && <p style={{ color: c.soft, marginTop: 8, fontSize: 13.5, lineHeight: 1.8 }}>{f.successText}</p>}
          </div>
        ) : (
          <>
            <div style={{ display: "flex", gap: 10, marginBottom: 22, justifyContent: "center" }}>
              <button onClick={() => f.setStatus("attending")} style={{ ...chip(f.status === "attending"), flex: 1 }}>{L(lang, "سأحضر", "אגיע")}</button>
              <button onClick={() => f.setStatus("absent")} style={{ ...chip(f.status === "absent"), flex: 1 }}>{L(lang, "لا أستطيع", "לא אוכל")}</button>
            </div>
            {f.status && (
              <div style={{ marginBottom: 18 }}>
                <label htmlFor="rg-rsvp-phone" className="rg-track" style={label}>{L(lang, "رقم هاتفك", "מספר טלפון")}</label>
                <PhoneInput value={f.phone} onChange={f.setPhone} lang={lang} inputId="rg-rsvp-phone" />
              </div>
            )}
            {f.status === "attending" && opts.companions && (
              <div style={{ marginBottom: 18 }}>
                <label className="rg-track" style={label}>{L(lang, "كم شخصاً أنتم؟", "כמה אתם?")}</label>
                <div style={{ display: "inline-flex", alignItems: "center", gap: 18, border: "1px solid " + c.line, borderRadius: 999, padding: "6px 16px" }}>
                  <button onClick={() => f.setPartySize((n) => Math.max(1, n - 1))} aria-label="-" style={{ border: "none", background: "none", color: c.accent, fontSize: 18, cursor: "pointer" }}>−</button>
                  <span style={{ color: c.text, fontWeight: 800, minWidth: 18, textAlign: "center" }}><bdi dir="ltr">{f.partySize}</bdi></span>
                  <button onClick={() => f.setPartySize((n) => Math.min(21, n + 1))} aria-label="+" style={{ border: "none", background: "none", color: c.accent, fontSize: 18, cursor: "pointer" }}>+</button>
                </div>
              </div>
            )}
            {f.status === "attending" && opts.meal && mealOptions.length > 0 && (
              <div style={{ marginBottom: 18 }}>
                <label className="rg-track" style={label}>{L(lang, "تفضيل الطعام", "העדפת מנה")}</label>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                  {mealOptions.map((opt) => <button key={opt} onClick={() => f.setMeal(opt)} style={chip(f.meal === opt)}>{opt}</button>)}
                </div>
              </div>
            )}
            {f.status === "attending" && opts.song && (
              <div style={{ marginBottom: 18 }}>
                <label htmlFor="rg-rsvp-song" className="rg-track" style={label}>{L(lang, "أغنية تحبّونها", "שיר שתאהבו")}</label>
                <input id="rg-rsvp-song" value={f.song} onChange={(e) => f.setSong(e.target.value.slice(0, 120))} placeholder={L(lang, "اسم الأغنية...", "שם השיר...")} dir="auto" style={input} />
              </div>
            )}
            <div style={{ marginBottom: 24 }}>
              <label htmlFor="rg-rsvp-note" className="rg-track" style={label}>{L(lang, "رسالة للعروسين", "ברכה לזוג")}</label>
              <textarea id="rg-rsvp-note" rows={2} value={f.note} onChange={(e) => f.setNote(e.target.value.slice(0, 500))} placeholder={L(lang, "مبروك مقدماً...", "מזל טוב מראש...")} style={{ ...input, resize: "vertical" }} />
            </div>
            {f.error && <div role="alert" style={{ color: t.theme.rsvpAbsent, fontSize: 13, marginBottom: 14, textAlign: "center" }}>{f.error}</div>}
            <RgButton t={t} onBand={onBand} full onClick={f.submit} disabled={f.busy || !f.status || disabled} testid="rg-rsvp-submit">
              {f.busy ? L(lang, "جاري الإرسال...", "שולח...") : L(lang, "أرسل ردّي", "שלח תשובה")}
            </RgButton>
          </>
        )}
        <div style={{ position: "absolute", inset: 0, overflow: "hidden", pointerEvents: "none" }}>
          {f.hearts.map((h) => (
            <span key={h.id} style={{ position: "absolute", bottom: 0, left: h.left + "%", color: c.accent, fontSize: 16, animation: "rg-float 2s ease-out forwards", animationDelay: h.delay + "s" }}>♥</span>
          ))}
        </div>
        <style>{"@keyframes rg-float{to{transform:translateY(-110px);opacity:0}}"}</style>
      </div>
    </Block>
  );
}

export function GiftSection({ t, lang, giftNote, giftIban, onBand }) {
  const c = ink(t, onBand);
  return (
    <Block t={t} id="rg-gift" onBand={onBand}>
      <SectionTitle title={L(lang, "هدية", "מתנה")} t={t} onBand={onBand} />
      <div style={{ maxWidth: 380, margin: "0 auto", textAlign: "center" }}>
        {giftNote && <div style={{ fontSize: 13.5, lineHeight: 1.95, color: c.soft }}>{giftNote}</div>}
        {giftIban && (
          <div style={{ marginTop: 16, paddingBottom: 6, borderBottom: "1px solid " + c.line, display: "inline-block" }}>
            <bdi dir="ltr" style={{ fontWeight: 800, fontSize: 13, color: c.text }}>{giftIban}</bdi>
          </div>
        )}
      </div>
    </Block>
  );
}

export function GuestbookSection({ t, lang, wishes, approvedWishes, onBand }) {
  const all = [...(approvedWishes || []), ...(wishes || [])];
  if (!all.length) return null;
  const c = ink(t, onBand);
  return (
    <Block t={t} id="rg-guestbook" onBand={onBand}>
      <SectionTitle title={L(lang, "التهاني", "ברכות")} t={t} onBand={onBand} />
      <div style={{ maxWidth: 380, margin: "0 auto", display: "grid", gap: 26 }}>
        {all.map((w, i) => (
          <div key={i} style={{ textAlign: "center" }}>
            <div style={{ fontSize: 13.5, lineHeight: 1.95, color: c.soft, fontStyle: "italic" }}>{w.what || w.text}</div>
            {(w.who || w.name) && <div className="rg-track" style={{ fontSize: 9, fontWeight: 700, color: c.accent, marginTop: 10 }}>{w.who || w.name}</div>}
          </div>
        ))}
      </div>
    </Block>
  );
}

export function FooterCredit({ t, lang, isPublic }) {
  return (
    <footer style={{ textAlign: "center", padding: "26px 24px 70px", color: t.theme.textSoft, fontSize: 11 }}>
      <div aria-hidden="true" style={{ display: "flex", justifyContent: "center", marginBottom: 20 }}>
        <Diamond t={t} size={5} />
      </div>
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
