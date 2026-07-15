// Destination Love sections — all bespoke, travel/boarding-pass styled. They
// render from the SAME design-doc fields the classic template reads (no new
// schema), and reuse the shared behaviour hooks (useRsvpForm, useCountdown,
// confettiBurst) so RSVP/countdown behave identically everywhere. Colour comes
// from the CSS vars on `.tpl-dl` + the motif tokens in `t`.
import { PaperPlane, SectionTitle, DlButton, FlightPath, Ticker } from "./parts.jsx";
import { PhoneInput } from "../../../PhoneInput.jsx";
import { useRsvpForm } from "../../../../hooks/useRsvpForm.js";
import { useCountdown } from "../../../../hooks/useCountdown.js";

const L = (lang, ar, he) => (lang === "he" ? he : ar);

// ── Hero: circular medallion, script names, date, a plane on a dashed arc ──
export function Hero({ t, lang, fontFamily, guestName, namesLine, monogram, eyebrow, dateText, venueLine }) {
  return (
    <header style={{ position: "relative", padding: "70px 20px 30px", textAlign: "center" }}>
      <div className="dl-reveal d1" style={{ position: "relative", width: "min(320px, 82vw)", margin: "0 auto" }}>
        {/* Dashed arc + plane above the medallion */}
        <div style={{ marginBottom: -18 }}>
          <FlightPath w={300} h={90} d="M 12 70 C 90 6, 210 6, 288 60" t={t} planeSize={26} duration="10s" />
        </div>
        {/* Medallion */}
        <div
          style={{
            position: "relative",
            aspectRatio: "1 / 1",
            borderRadius: "50%",
            background: t.panel,
            border: `2px solid ${t.ring}`,
            boxShadow: `0 0 0 6px ${t.theme.chipBg}, 0 30px 70px -34px rgba(0,0,0,.7)`,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            padding: "10% 12%",
            color: t.panelInk,
          }}
        >
          <div style={{ fontWeight: 900, letterSpacing: ".08em", color: t.ring, fontSize: 15 }}>{monogram}</div>
          <div className="dl-track" style={{ fontSize: 10, fontWeight: 800, textTransform: "uppercase", color: t.panelInkSoft, marginTop: 6 }}>
            {eyebrow || L(lang, "أنتم مدعوون", "אתם מוזמנים")}
          </div>
          <div style={{ fontFamily: "inherit", fontWeight: 900, fontSize: "clamp(22px,6.4vw,30px)", lineHeight: 1.15, margin: "6px 0", color: t.panelInk }}>
            {namesLine}
          </div>
          {dateText && <div style={{ fontSize: 12, color: t.panelInkSoft }}><bdi dir="ltr">{dateText}</bdi></div>}
        </div>
      </div>

      {guestName && (
        <div className="dl-reveal d2" style={{ marginTop: 20, color: t.theme.textSoft, fontSize: 14 }}>
          {L(lang, "إلى", "אל")} <span style={{ color: t.theme.text, fontWeight: 800 }}>{guestName}</span>
        </div>
      )}
      {venueLine && (
        <div className="dl-reveal d3" style={{ marginTop: 6, color: t.theme.textSoft, fontSize: 13 }}>
          <PaperPlane size={13} color={t.secondary} /> {venueLine}
        </div>
      )}
      <div className="dl-reveal d4" style={{ marginTop: 22 }}>
        <Ticker text={L(lang, "بطاقة صعود · رحلة الحب ·", "כרטיס עלייה · מסע האהבה ·")} />
      </div>
    </header>
  );
}

// ── Boarding-pass details card (the signature) ─────────────────────────────
export function BoardingPass({ t, lang, fontFamily, namesLine, dateText, timeText, destination, code }) {
  const row = (label, value) => (
    <div style={{ flex: 1, minWidth: 0 }}>
      <div className="dl-track" style={{ fontSize: 9, fontWeight: 800, textTransform: "uppercase", color: t.panelInkSoft }}>{label}</div>
      <div style={{ fontWeight: 800, fontSize: 14, color: t.panelInk, marginTop: 2, overflowWrap: "anywhere" }}>{value || "—"}</div>
    </div>
  );
  return (
    <section className="dl-scroll" style={{ padding: "16px 18px 8px" }}>
      <div style={{ maxWidth: t.maxW, margin: "0 auto", background: t.panel, color: t.panelInk, borderRadius: 18, overflow: "hidden", boxShadow: "0 24px 60px -34px rgba(0,0,0,.6)" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "13px 18px", background: t.secondary, color: t.onSecondary }}>
          <span style={{ fontWeight: 900, fontSize: 13 }}>{L(lang, "بطاقة صعود", "כרטיס עלייה")}</span>
          <PaperPlane size={20} color={t.onSecondary} stroke="transparent" />
        </div>
        <div style={{ padding: "16px 18px" }}>
          <div style={{ display: "flex", gap: 14, marginBottom: 14 }}>
            {row(L(lang, "العروسان", "בני הזוג"), namesLine)}
            {row(L(lang, "الوجهة", "יעד"), destination)}
          </div>
          <div style={{ borderTop: `1.5px dashed ${t.panelInkSoft}`, opacity: 0.45, margin: "4px 0 14px" }} />
          <div style={{ display: "flex", gap: 14 }}>
            {row(L(lang, "التاريخ", "תאריך"), dateText ? <bdi dir="ltr">{dateText}</bdi> : "")}
            {row(L(lang, "الرحلة", "טיסה"), <bdi dir="ltr">{code}</bdi>)}
          </div>
        </div>
        {/* barcode footer */}
        <div aria-hidden="true" style={{ display: "flex", gap: 2, height: 30, padding: "0 18px 14px", alignItems: "stretch" }}>
          {Array.from({ length: 52 }).map((_, i) => (
            <span key={i} style={{ flex: i % 5 === 0 ? 2 : 1, background: i % 3 === 0 ? t.panelInk : "transparent", opacity: 0.75 }} />
          ))}
        </div>
      </div>
    </section>
  );
}

// ── Countdown: departure tiles ─────────────────────────────────────────────
export function CountdownSection({ t, lang, fontFamily, weddingDate }) {
  const { d, h, m, s } = useCountdown(weddingDate);
  const tiles = [
    [d, L(lang, "يوم", "ימים")],
    [h, L(lang, "ساعة", "שעות")],
    [m, L(lang, "دقيقة", "דקות")],
    [s, L(lang, "ثانية", "שניות")],
  ];
  return (
    <section className="dl-scroll" id="dl-countdown" style={{ padding: "34px 20px" }}>
      <SectionTitle eyebrow={L(lang, "الإقلاع بعد", "ההמראה בעוד")} title={L(lang, "العدّ للرحلة", "הספירה למסע")} t={t} fontFamily={fontFamily} />
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 10, maxWidth: 380, margin: "0 auto" }}>
        {tiles.map(([val, label], i) => (
          <div key={i} className="dl-tile" style={{ background: t.theme.cardBg, border: `1px solid ${t.theme.cardBorder}`, borderRadius: 14, padding: "14px 4px", textAlign: "center" }}>
            <div style={{ fontWeight: 900, fontSize: "clamp(22px,7vw,30px)", color: t.theme.text, lineHeight: 1 }}>
              <bdi dir="ltr">{String(val).padStart(2, "0")}</bdi>
            </div>
            <div style={{ fontSize: 10, color: t.theme.textSoft, marginTop: 6, fontWeight: 700 }}>{label}</div>
          </div>
        ))}
      </div>
    </section>
  );
}

// ── Timeline: event legs down a dashed flight route ────────────────────────
export function TimelineSection({ t, lang, fontFamily, items }) {
  return (
    <section className="dl-scroll" id="dl-timeline" style={{ padding: "34px 20px" }}>
      <SectionTitle eyebrow={L(lang, "خط الرحلة", "מסלול")} title={L(lang, "برنامج اليوم", "מהלך היום")} t={t} fontFamily={fontFamily} />
      <div style={{ maxWidth: 420, margin: "0 auto", position: "relative" }}>
        <div style={{ position: "absolute", insetInlineStart: 15, top: 6, bottom: 6, width: 0, borderInlineStart: `2px dashed ${t.dash}` }} aria-hidden="true" />
        {items.map((it, i) => (
          <div key={i} style={{ position: "relative", paddingInlineStart: 44, marginBottom: 22 }}>
            <span style={{ position: "absolute", insetInlineStart: 4, top: 2, width: 24, height: 24, borderRadius: "50%", background: t.panel, border: `2px solid ${t.ring}`, display: "flex", alignItems: "center", justifyContent: "center" }}>
              <PaperPlane size={13} color={t.secondary} />
            </span>
            {it.when && <div className="dl-track" style={{ fontSize: 10, fontWeight: 800, color: t.accent, textTransform: "uppercase" }}><bdi dir="ltr">{it.when}</bdi></div>}
            {it.title && <div style={{ fontWeight: 800, fontSize: 16, color: t.theme.text, marginTop: 2 }}>{it.title}</div>}
            {it.body && <div style={{ fontSize: 13, color: t.theme.textSoft, marginTop: 3, lineHeight: 1.6 }}>{it.body}</div>}
          </div>
        ))}
      </div>
    </section>
  );
}

// ── Venue: "The Destination" ───────────────────────────────────────────────
export function VenueSection({ t, lang, fontFamily, venue, venueCity, venueAddress, accessNote, hotels }) {
  const query = encodeURIComponent([venue, venueCity, venueAddress].filter(Boolean).join(", "));
  const mapUrl = `https://www.google.com/maps/search/?api=1&query=${query}`;
  return (
    <section className="dl-scroll" id="dl-venue" style={{ padding: "34px 20px" }}>
      <SectionTitle eyebrow={L(lang, "الوجهة", "היעד")} title={venue || L(lang, "مكان الاحتفال", "מקום החגיגה")} t={t} fontFamily={fontFamily} />
      <div style={{ maxWidth: t.maxW, margin: "0 auto", textAlign: "center", color: t.theme.textSoft }}>
        {venueCity && <div style={{ fontSize: 15, color: t.theme.text, fontWeight: 700 }}>{venueCity}</div>}
        {venueAddress && <div style={{ fontSize: 14, marginTop: 6 }}>{venueAddress}</div>}
        {accessNote && <div style={{ fontSize: 13, marginTop: 6, opacity: 0.9 }}>{accessNote}</div>}
        <div style={{ marginTop: 18 }}>
          <a href={mapUrl} target="_blank" rel="noopener noreferrer" style={{ textDecoration: "none" }}>
            <DlButton t={t}>🧭 {L(lang, "افتح الخريطة", "פתח מפה")}</DlButton>
          </a>
        </div>
        {hotels && hotels.length > 0 && (
          <div style={{ marginTop: 22, display: "grid", gap: 8 }}>
            {hotels.map((ho, i) => (
              <div key={i} style={{ background: t.theme.cardBg, border: `1px solid ${t.theme.cardBorder}`, borderRadius: 12, padding: "10px 14px", display: "flex", justifyContent: "space-between", gap: 10 }}>
                <span style={{ color: t.theme.text, fontWeight: 700 }}>{ho.name}</span>
                {ho.walk && <span style={{ fontSize: 12, color: t.theme.textSoft }}>{ho.walk}</span>}
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}

// ── RSVP: "Your ticket to love" ────────────────────────────────────────────
export function RsvpSection({ t, lang, fontFamily, opts, mealOptions, guestPhone, onSubmitRsvp, disabled, alreadyAnswered, rsvpDone }) {
  const f = useRsvpForm({ guestPhone, opts, theme: t.theme, lang, onSubmitRsvp, rsvpDone, disabled });
  const chipStyle = (on) => ({
    padding: "9px 14px", borderRadius: 999, cursor: "pointer", fontSize: 13, fontWeight: 700, fontFamily: "inherit",
    border: `1px solid ${on ? "transparent" : t.theme.accentLine}`, background: on ? t.secondary : "transparent", color: on ? t.onSecondary : t.theme.textSoft,
  });
  const inputStyle = { width: "100%", padding: "11px 13px", borderRadius: 12, border: `1px solid ${t.theme.accentLine}`, background: "transparent", color: t.theme.text, fontFamily: "inherit", fontSize: 14 };

  return (
    <section className="dl-scroll" id="rsvp" style={{ padding: "34px 20px" }}>
      <SectionTitle eyebrow={L(lang, "تذكرتك", "הכרטיס שלך")} title={L(lang, "احجز مقعدك", "שריינו מקום")} t={t} fontFamily={fontFamily} />
      <div style={{ maxWidth: 400, margin: "0 auto", position: "relative", background: t.theme.cardBg, border: `1px solid ${t.theme.cardBorder}`, borderRadius: 18, padding: 20 }}>
        {(alreadyAnswered && !f.showDone) || f.showDone ? (
          <div data-testid="rsvp-success" role="status" aria-live="polite" style={{ textAlign: "center", padding: "10px 0" }}>
            <div style={{ width: 54, height: 54, borderRadius: "50%", margin: "0 auto 12px", display: "flex", alignItems: "center", justifyContent: "center", background: t.secondary, color: t.onSecondary, fontSize: 26 }}>✓</div>
            <div style={{ fontWeight: 800, fontSize: 18, color: t.theme.text }}>
              {alreadyAnswered && !f.showDone ? L(lang, "تم تأكيد ردك", "כבר אישרת") : (f.status === "absent" ? L(lang, "نشكر إعلامكم", "תודה שהודעת") : L(lang, "تم حجز مقعدك!", "המקום שוריין!"))}
            </div>
            {f.showDone && <p style={{ color: t.theme.textSoft, marginTop: 6, fontSize: 14 }}>{f.successText}</p>}
          </div>
        ) : (
          <>
            <div style={{ display: "flex", gap: 10, marginBottom: 14 }}>
              <button onClick={() => f.setStatus("attending")} style={{ ...chipStyle(f.status === "attending"), flex: 1, padding: "12px" }}>{L(lang, "✓ سأحضر", "✓ אגיע")}</button>
              <button onClick={() => f.setStatus("absent")} style={{ ...chipStyle(f.status === "absent"), flex: 1, padding: "12px" }}>{L(lang, "للأسف لا", "לצערי לא")}</button>
            </div>

            {f.status && (
              <div style={{ marginBottom: 12 }}>
                <label htmlFor="dl-rsvp-phone" style={{ display: "block", fontSize: 12, fontWeight: 700, color: t.accent, marginBottom: 6 }}>{L(lang, "رقم هاتفك", "מספר טלפון")}</label>
                <PhoneInput value={f.phone} onChange={f.setPhone} lang={lang} inputId="dl-rsvp-phone" />
              </div>
            )}

            {f.status === "attending" && opts.companions && (
              <div style={{ marginBottom: 12 }}>
                <label style={{ display: "block", fontSize: 12, fontWeight: 700, color: t.accent, marginBottom: 6 }}>{L(lang, "كم شخصاً أنتم؟", "כמה אתם?")}</label>
                <div style={{ display: "inline-flex", alignItems: "center", gap: 16, border: `1px solid ${t.theme.accentLine}`, borderRadius: 999, padding: "6px 14px" }}>
                  <button onClick={() => f.setPartySize((c) => Math.max(1, c - 1))} aria-label="-" style={{ border: "none", background: "none", color: t.accent, fontSize: 20, cursor: "pointer" }}>−</button>
                  <span style={{ color: t.theme.text, fontWeight: 800, minWidth: 20, textAlign: "center" }}><bdi dir="ltr">{f.partySize}</bdi></span>
                  <button onClick={() => f.setPartySize((c) => Math.min(21, c + 1))} aria-label="+" style={{ border: "none", background: "none", color: t.accent, fontSize: 20, cursor: "pointer" }}>+</button>
                </div>
              </div>
            )}

            {f.status === "attending" && opts.meal && mealOptions.length > 0 && (
              <div style={{ marginBottom: 12 }}>
                <label style={{ display: "block", fontSize: 12, fontWeight: 700, color: t.accent, marginBottom: 6 }}>{L(lang, "تفضيل الطعام", "העדפת מנה")}</label>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                  {mealOptions.map((opt) => (
                    <button key={opt} onClick={() => f.setMeal(opt)} style={chipStyle(f.meal === opt)}>{opt}</button>
                  ))}
                </div>
              </div>
            )}

            {f.status === "attending" && opts.song && (
              <div style={{ marginBottom: 12 }}>
                <label htmlFor="dl-rsvp-song" style={{ display: "block", fontSize: 12, fontWeight: 700, color: t.accent, marginBottom: 6 }}>{L(lang, "أغنية تحبّونها", "שיר שתאהבו")}</label>
                <input id="dl-rsvp-song" value={f.song} onChange={(e) => f.setSong(e.target.value.slice(0, 120))} placeholder={L(lang, "اسم الأغنية...", "שם השיר...")} dir="auto" style={inputStyle} />
              </div>
            )}

            <div style={{ marginBottom: 14 }}>
              <label htmlFor="dl-rsvp-note" style={{ display: "block", fontSize: 12, fontWeight: 700, color: t.accent, marginBottom: 6 }}>{L(lang, "رسالة للعروسين", "ברכה לזוג")}</label>
              <textarea id="dl-rsvp-note" rows={3} value={f.note} onChange={(e) => f.setNote(e.target.value.slice(0, 500))} placeholder={L(lang, "مبروك مقدماً...", "מזל טוב מראש...")} style={{ ...inputStyle, resize: "vertical" }} />
            </div>

            {f.error && <div role="alert" style={{ color: t.theme.rsvpAbsent, fontSize: 13, marginBottom: 12, textAlign: "center" }}>{f.error}</div>}

            <DlButton t={t} full onClick={f.submit} disabled={f.busy || !f.status || disabled} testid="dl-rsvp-submit">
              {f.busy ? L(lang, "جاري الإرسال...", "שולח...") : `${L(lang, "أرسل ردّي", "שלח תשובה")} ←`}
            </DlButton>
          </>
        )}
        <div style={{ position: "absolute", inset: 0, overflow: "hidden", pointerEvents: "none" }}>
          {f.hearts.map((h) => (
            <span key={h.id} style={{ position: "absolute", bottom: 0, left: h.left + "%", color: t.secondary, fontSize: 20, animation: "dl-float 2s ease-out forwards", animationDelay: h.delay + "s" }}>♥</span>
          ))}
        </div>
      </div>
    </section>
  );
}

// ── Gift ───────────────────────────────────────────────────────────────────
export function GiftSection({ t, lang, fontFamily, giftNote, giftIban }) {
  return (
    <section className="dl-scroll" id="dl-gift" style={{ padding: "34px 20px" }}>
      <SectionTitle eyebrow={L(lang, "هدية", "מתנה")} title={L(lang, "هدية العروسين", "מתנה לזוג")} t={t} fontFamily={fontFamily} />
      <div style={{ maxWidth: t.maxW, margin: "0 auto", textAlign: "center", background: t.theme.cardBg, border: `1px solid ${t.theme.cardBorder}`, borderRadius: 16, padding: 20 }}>
        {giftNote && <p style={{ color: t.theme.textSoft, lineHeight: 1.7, margin: "0 0 12px" }}>{giftNote}</p>}
        {giftIban && (
          <div style={{ fontFamily: "monospace", direction: "ltr", background: t.theme.chipBg, border: `1px solid ${t.theme.chipBorder}`, borderRadius: 10, padding: "10px 12px", color: t.theme.text, fontSize: 14, wordBreak: "break-all" }}>
            {giftIban}
          </div>
        )}
      </div>
    </section>
  );
}

// ── Guestbook ──────────────────────────────────────────────────────────────
export function GuestbookSection({ t, lang, fontFamily, wishes, approvedWishes, onSubmitWish, disabled }) {
  const all = [...(approvedWishes || []), ...(wishes || [])].slice(0, 20);
  return (
    <section className="dl-scroll" id="dl-guestbook" style={{ padding: "34px 20px" }}>
      <SectionTitle eyebrow={L(lang, "التهاني", "ברכות")} title={L(lang, "سجل الأمنيات", "ספר הברכות")} t={t} fontFamily={fontFamily} />
      <div style={{ maxWidth: t.maxW, margin: "0 auto", display: "grid", gap: 10 }}>
        {all.map((w, i) => (
          <div key={i} style={{ background: t.theme.cardBg, border: `1px solid ${t.theme.cardBorder}`, borderRadius: 12, padding: "12px 14px" }}>
            <div style={{ color: t.theme.text, fontSize: 14, lineHeight: 1.6 }}>{w.what || w.text}</div>
            {(w.who || w.name) && <div style={{ color: t.accent, fontSize: 12, fontWeight: 700, marginTop: 6 }}>— {w.who || w.name}</div>}
          </div>
        ))}
      </div>
    </section>
  );
}

// ── Footer credit (dock handled by the shared FloatingDock in the View) ────
export function FooterCredit({ t, lang, isPublic }) {
  return (
    <footer style={{ textAlign: "center", padding: "26px 20px 80px" }}>
      <div className="dl-rule" style={{ marginBottom: 12 }} aria-hidden="true"><i /><b /><i /></div>
      <PaperPlane size={20} color={t.secondary} />
      <div style={{ color: t.theme.textSoft, fontSize: 12, marginTop: 8 }}>{L(lang, "بانتظار وصولكم ✦", "מחכים לבואכם ✦")}</div>
      {isPublic && (
        <div style={{ marginTop: 14 }}>
          <a href="/?ref=invite" target="_blank" rel="noopener noreferrer" style={{ color: t.accent, textDecoration: "none", opacity: 0.7, fontSize: 12, fontWeight: 700 }}>
            {L(lang, "صُنعت بواسطة دعوة فرحنا ←", "נוצר עם דעוה שמחתנו ←")}
          </a>
        </div>
      )}
    </footer>
  );
}
