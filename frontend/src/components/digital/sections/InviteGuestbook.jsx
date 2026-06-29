import { useEffect,useMemo,useState } from "react";
import { ON_GOLD, SectionHead } from "../inviteShared.jsx";

// ── Guestbook ───────────────────────────────────────────────────────────────────
function GuestbookSection({ wishes, approvedWishes = [], onSubmitWish, theme, font, lang, disabled }) {
  const [who, setWho] = useState("");
  const [what, setWhat] = useState("");
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [err, setErr] = useState("");
  const [page, setPage] = useState(0);

  // Approved guest wishes (live) + the groom's authored wishes — all shown.
  const all = useMemo(() => {
    const guest = (approvedWishes || []).map((w) => ({ who: w.who, what: w.what }));
    return [...guest, ...(wishes || [])].filter((w) => w && (w.what || "").toString().trim());
  }, [approvedWishes, wishes]);

  // Carousel — 3 wishes at a time, auto-rotating every 5s.
  const PER = 3;
  const pageCount = Math.max(1, Math.ceil(all.length / PER));
  useEffect(() => { if (page >= pageCount) setPage(0); }, [pageCount, page]);
  useEffect(() => {
    if (pageCount <= 1) return undefined;
    const id = setInterval(() => setPage((p) => (p + 1) % pageCount), 5000);
    return () => clearInterval(id);
  }, [pageCount]);
  const shown = all.slice(page * PER, page * PER + PER);

  const submit = async () => {
    if (!who.trim() || !what.trim() || sending) return;
    setErr(""); setSending(true);
    try {
      await onSubmitWish?.({ who: who.trim(), what: what.trim() });
      setSent(true); setWho(""); setWhat("");
    } catch {
      setErr(lang === "he" ? "השליחה נכשלה — נסו שוב" : "تعذّر الإرسال — حاول مرة أخرى");
    } finally { setSending(false); }
  };

  return (
    <section className="dawa-inv-section" id="inv-guestbook">
      <SectionHead
        eyebrow={lang === "he" ? "ספר ברכות" : "دفتر التهاني"}
        title={lang === "he" ? "שתפו אותנו במילה" : "شاركونا كلمة"}
        sub={lang === "he" ? "הברכה שלכם תוצג לאחר אישור הזוג." : "رسالتك ستظهر بعد موافقة العروسين."}
        theme={theme}
        font={font}
      />
      <div className="dawa-inv-rsvp dawa-inv-reveal" style={{ marginBottom: 22 }}>
        {sent ? (
          <div style={{ textAlign: "center", padding: "18px 12px", color: theme.accent, fontFamily: font.family, fontWeight: 800, lineHeight: 1.8 }}>
            🌟 {lang === "he" ? "תודה! הברכה נשלחה וממתינה לאישור הזוג." : "شكراً! وصلت رسالتك وهي بانتظار موافقة العروسين."}
          </div>
        ) : (
          <>
            <div className="dawa-inv-field">
              <label style={{ color: theme.accent, fontFamily: font.family }}>{lang === "he" ? "השם שלך" : "اسمك"}</label>
              <input className="dawa-inv-input" style={{ color: theme.text, borderColor: theme.accentLine, fontFamily: font.family }} value={who} onChange={(e) => setWho(e.target.value.slice(0, 60))} placeholder={lang === "he" ? "למשל: מוחמד ע." : "مثل: محمد ع."} disabled={disabled} />
            </div>
            <div className="dawa-inv-field">
              <label style={{ color: theme.accent, fontFamily: font.family }}>{lang === "he" ? "הברכה שלך" : "رسالتك"}</label>
              <textarea className="dawa-inv-input dawa-inv-textarea" style={{ color: theme.text, borderColor: theme.accentLine, fontFamily: font.family }} rows={2} value={what} onChange={(e) => setWhat(e.target.value.slice(0, 300))} placeholder={lang === "he" ? "מילה מהלב..." : "كلمة من القلب..."} disabled={disabled} />
            </div>
            {err && <div style={{ color: theme.rsvpAbsent || "#d4533a", fontSize: 12, marginBottom: 8, fontFamily: font.family }}>{err}</div>}
            <button
              className="dawa-inv-submit"
              style={{ color: ON_GOLD, background: `linear-gradient(135deg,${theme.gradientStops.join(",")})`, fontFamily: font.family, opacity: (disabled || sending) ? 0.6 : 1 }}
              onClick={submit}
              disabled={disabled || sending || !who.trim() || !what.trim()}
            >
              {sending ? "…" : (lang === "he" ? "שלח ברכה" : "أرسل رسالتي")}
            </button>
          </>
        )}
      </div>
      {all.length > 0 && (
        <>
          <div className="dawa-inv-wishes" key={page} style={{ animation: "dawa-inv-rise .6s ease both" }}>
            {shown.map((w, i) => (
              <div key={i} className="dawa-inv-wish" style={{ borderColor: theme.accentLine }}>
                <div className="dawa-inv-wish-who" style={{ color: theme.accent, fontFamily: font.family }}>— {w.who}</div>
                <div className="dawa-inv-wish-what" style={{ color: theme.text, fontFamily: font.family }}>{w.what}</div>
              </div>
            ))}
          </div>
          {pageCount > 1 && (
            <div style={{ display: "flex", justifyContent: "center", gap: 7, marginTop: 18 }}>
              {Array.from({ length: pageCount }).map((_, i) => (
                <span key={i} onClick={() => setPage(i)} aria-hidden="true" style={{
                  width: 7, height: 7, borderRadius: "50%", cursor: "pointer",
                  background: i === page ? theme.accent : theme.accentLine, transition: "background .3s",
                }} />
              ))}
            </div>
          )}
        </>
      )}
    </section>
  );
}

export { GuestbookSection };
