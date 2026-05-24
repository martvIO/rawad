// Public digital invitation landing page.
// Route: /d/:groomUsername/:token
//
// Reads the invite token (public read) and the groom's digital invitation
// doc (public read on the parent doc), then renders a cinematic luxury
// microsite: envelope intro → hero → media → countdown → RSVP → footer dock.
// Preserves all functional behavior (token auth, real RSVP submission,
// demo mode via ?demo=1, lazy photos sub-route).
import { useEffect, useState, useRef, useMemo, lazy, Suspense } from "react";
import { useParams, Routes, Route, useNavigate, useSearchParams } from "react-router-dom";
import { BrandLogo } from "../components/BrandLogo.jsx";
import { LangSwitcher } from "../components/LangSwitcher.jsx";
import { subscribeInviteToken } from "../services/invites.js";
import { getDigitalInvitationPublic, submitDigitalGuestInvite } from "../services/digitalInvitation.js";
import { logErr } from "../utils/logger.js";
import { C } from "../styles/theme.js";

const DEMO_MEDIA = [
  { url: "https://images.unsplash.com/photo-1519741497674-611481863552?w=1200&q=80",
    kind: "image", storagePath: "demo/1" },
  { url: "https://images.unsplash.com/photo-1465495976277-4387d4b0e4a6?w=1200&q=80",
    kind: "image", storagePath: "demo/2" },
  { url: "https://images.unsplash.com/photo-1511795409834-ef04bbd61622?w=1200&q=80",
    kind: "image", storagePath: "demo/3" },
];

const DigitalYourPhotos = lazy(() =>
  import("./DigitalYourPhotos.jsx").then(m => ({ default: m.DigitalYourPhotos })),
);

export function DigitalInvitationPage({ t, lang, setLang }) {
  return (
    <Routes>
      <Route index element={<DigitalLandingMain t={t} lang={lang} setLang={setLang} />} />
      <Route path="photos" element={
        <Suspense fallback={<LoadingScreen t={t} />}>
          <DigitalYourPhotos lang={lang} setLang={setLang} />
        </Suspense>
      } />
    </Routes>
  );
}

function DigitalLandingMain({ t, lang, setLang }) {
  const { token } = useParams();
  const navigate = useNavigate();
  const [search] = useSearchParams();
  const isDemo   = search.get("demo") === "1";
  const demoName = search.get("name");
  const demoDate = search.get("date");

  const [tokenRec, setTokenRec] = useState(isDemo ? {
    guestName: demoName ? decodeURIComponent(demoName) : "أحمد محمد",
    groomUid: "demo",
    expiresAt: Date.now() + 30 * 86400000,
  } : undefined);
  const [doc, setDoc] = useState(isDemo ? {
    media: DEMO_MEDIA,
    weddingDate: demoDate ? new Date(demoDate).getTime() : Date.now() + 30 * 86400000,
    brideName: "ليلى",
    groomDisplayName: "كريم",
  } : null);
  const [rsvp,  setRsvp]  = useState(null);
  const [note,  setNote]  = useState("");
  const [busy,  setBusy]  = useState(false);
  const [done,  setDone]  = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (isDemo) return;
    if (!token) { setTokenRec(null); return; }
    return subscribeInviteToken(token, setTokenRec);
  }, [token, isDemo]);

  useEffect(() => {
    if (isDemo) return;
    const groomUid = tokenRec?.groomUid;
    if (!groomUid) return;
    let active = true;
    getDigitalInvitationPublic(groomUid).then(d => { if (active) setDoc(d); });
    return () => { active = false; };
  }, [tokenRec?.groomUid, isDemo]);

  const submit = async () => {
    if (!rsvp) {
      setError(lang === "he" ? "אנא בחר תשובה" : "يرجى اختيار إجابة");
      return;
    }
    setError("");
    setBusy(true);
    try {
      if (isDemo) {
        await new Promise(r => setTimeout(r, 400));
        setDone(true);
        if (rsvp === "attending") confettiBurst();
        return;
      }
      await submitDigitalGuestInvite({ token, rsvp, note: note.trim() });
      setDone(true);
      if (rsvp === "attending") confettiBurst();
    } catch (err) {
      logErr("submitDigitalGuestInvite", err);
      const code = err?.code || "";
      if (code.includes("deadline-exceeded")) setError(t("inv_expired"));
      else if (code.includes("not-found"))    setError(t("inv_invalid"));
      else if (code.includes("already-exists")) setError(t("inv_already_answered"));
      else setError(err?.message || (lang === "he" ? "שגיאה" : "خطأ"));
    } finally {
      setBusy(false);
    }
  };

  if (tokenRec === undefined) return <LoadingScreen t={t} />;
  if (tokenRec === null) {
    return <CenteredMessage>
      <PageStyles />
      <div style={{ fontSize: 56, marginBottom: 12 }}>⚠️</div>
      <h1 style={{ fontFamily: "'Amiri',serif", color: C.red, fontSize: 24 }}>{t("inv_invalid")}</h1>
    </CenteredMessage>;
  }
  if (tokenRec.expiresAt && Date.now() > tokenRec.expiresAt) {
    return <CenteredMessage>
      <PageStyles />
      <div style={{ fontSize: 56, marginBottom: 12 }}>⏰</div>
      <h1 style={{ fontFamily: "'Amiri',serif", color: C.red, fontSize: 24 }}>{t("inv_expired")}</h1>
    </CenteredMessage>;
  }

  const media = doc?.media || [];
  const guestName = tokenRec.guestName || "";
  const groomName = doc?.groomDisplayName || "";
  const brideName = doc?.brideName || "";
  const usedAlready = tokenRec.usedAt && !done;

  return (
    <div style={{
      minHeight: "100vh",
      background: "#07070a",
      color: "#fff3c0",
      paddingBottom: 80,
      position: "relative",
      overflowX: "hidden",
    }}>
      <PageStyles />
      <EnvelopeIntro guestName={guestName} t={t} />
      <Ambience />

      {/* Top utility bar — language + photos. Sits above ambience overlay. */}
      <div style={{
        position: "sticky", top: 0, zIndex: 40,
        background: "rgba(7,7,10,.85)",
        backdropFilter: "blur(16px)", WebkitBackdropFilter: "blur(16px)",
        borderBottom: "1px solid rgba(212,160,122,.16)",
      }}>
        <div style={{
          maxWidth: 760, margin: "0 auto", padding: "10px 16px",
          display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10,
        }}>
          <button onClick={() => navigate("photos")} style={{
            padding: "8px 16px", borderRadius: 999, cursor: "pointer",
            background: "linear-gradient(135deg,rgba(212,160,122,.18),rgba(212,160,122,.06))",
            border: "1px solid rgba(212,160,122,.40)",
            color: "#f4d4c4", fontSize: 13, fontWeight: 800, fontFamily: "inherit",
            transition: "all .25s ease",
          }}
            onMouseEnter={e => { e.currentTarget.style.transform = "translateY(-1px)"; e.currentTarget.style.borderColor = "#d4a07a"; }}
            onMouseLeave={e => { e.currentTarget.style.transform = "translateY(0)"; e.currentTarget.style.borderColor = "rgba(212,160,122,.40)"; }}
          >{t("inv_photos_tab")}</button>
          <LangSwitcher lang={lang} setLang={setLang} />
        </div>
      </div>

      <Hero guestName={guestName} groomName={groomName} brideName={brideName}
            weddingDate={doc?.weddingDate} lang={lang} t={t} />

      {media.length > 0 && (
        <div style={{ maxWidth: 760, margin: "0 auto", padding: "0 16px" }}>
          <MediaCarousel items={media} />
        </div>
      )}

      <div style={{ maxWidth: 720, margin: "0 auto", padding: "20px 16px" }}>
        {/* RSVP section */}
        <div className="dawa-reveal" style={{ marginTop: 56 }}>
          <SectionHead eyebrow={t("inv_section_rsvp")}
                       title={lang === "he" ? "האם תכבדו אותנו?" : "هل ستشرّفوننا؟"} />
          {usedAlready ? (
            <SuccessCard tone="muted">
              <div style={{ fontSize: 48, marginBottom: 8 }}>✓</div>
              <div style={{ color: "#4cc97a", fontSize: 16, fontWeight: 800 }}>
                {t("inv_already_answered")}
              </div>
            </SuccessCard>
          ) : done ? (
            <SuccessCard tone="success">
              <div className="dawa-success-seal">✓</div>
              <div style={{
                color: "#fff3c0", fontSize: 22, fontWeight: 900,
                fontFamily: "'Amiri',serif", marginBottom: 10,
              }}>{t("inv_rsvp_thanks")}</div>
              <div style={{ color: "rgba(245,230,184,.78)", fontSize: 14, lineHeight: 1.8 }}>
                {rsvp === "attending" ? t("inv_rsvp_will_see") : t("inv_rsvp_will_miss")}
              </div>
            </SuccessCard>
          ) : (
            <RsvpForm rsvp={rsvp} setRsvp={setRsvp}
                      note={note} setNote={setNote}
                      busy={busy} error={error}
                      onSubmit={submit} t={t} lang={lang} />
          )}
        </div>

        {/* Countdown */}
        {doc?.weddingDate && (
          <div className="dawa-reveal" style={{ marginTop: 80 }}>
            <SectionHead eyebrow={t("inv_section_countdown")}
                         title={lang === "he" ? "נשאר עד החתונה" : "متبقي حتى الفرح"} />
            <Countdown weddingDate={doc.weddingDate} t={t} />
          </div>
        )}

        {/* Couple footer */}
        <InviteFooter t={t} lang={lang} />
      </div>

      <FloatingDock t={t} weddingDate={doc?.weddingDate} groomName={groomName} brideName={brideName} />
    </div>
  );
}

// ── Hero ─────────────────────────────────────────────────────────────────────
function Hero({ guestName, groomName, brideName, weddingDate, lang, t }) {
  const date = weddingDate ? new Date(weddingDate) : null;
  const dateText = date
    ? date.toLocaleDateString(lang === "he" ? "he-IL" : "ar-EG", { day: "numeric", month: "long", year: "numeric" })
    : "";
  const monogram = useMemo(() => {
    const g = (groomName || "").trim().charAt(0);
    const b = (brideName || "").trim().charAt(0);
    return [g, b].filter(Boolean).join("&") || "د";
  }, [groomName, brideName]);

  return (
    <section style={{
      position: "relative", textAlign: "center",
      padding: "72px 24px 56px",
      overflow: "hidden",
    }}>
      <div aria-hidden="true" style={{
        position: "absolute", inset: 0,
        background:
          "radial-gradient(ellipse 80% 60% at 50% 30%, rgba(212,160,122,.12) 0%, transparent 60%)," +
          "radial-gradient(ellipse 60% 40% at 50% 80%, rgba(201,168,76,.06) 0%, transparent 65%)",
        pointerEvents: "none",
      }} />

      <div style={{
        position: "relative",
        fontFamily: "'Amiri',serif", fontStyle: "italic",
        fontSize: 13, letterSpacing: 4, textTransform: "uppercase",
        color: "#d4a07a", marginBottom: 24,
        display: "inline-flex", alignItems: "center", gap: 14,
        animation: "dawa-rise .9s ease both",
      }}>
        <span style={{ width: 40, height: 1, background: "linear-gradient(90deg, transparent, #d4a07a)" }} />
        {t("inv_hero_eyebrow")}
        <span style={{ width: 40, height: 1, background: "linear-gradient(90deg, #d4a07a, transparent)" }} />
      </div>

      {/* Monogram ring */}
      <div style={{
        width: 180, height: 180, margin: "0 auto 32px",
        position: "relative",
        display: "flex", alignItems: "center", justifyContent: "center",
        animation: "dawa-rise 1.1s .15s cubic-bezier(.17,.67,.35,1.4) both",
      }}>
        <svg viewBox="0 0 200 200" width="100%" height="100%" aria-hidden="true" style={{ position: "absolute", inset: 0 }}>
          <defs>
            <linearGradient id="dawa-mono-grad" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%"  stopColor="#fbf6e8" />
              <stop offset="50%" stopColor="#f4d4c4" />
              <stop offset="100%" stopColor="#d4a07a" />
            </linearGradient>
          </defs>
          <circle cx="100" cy="100" r="92" fill="none" stroke="url(#dawa-mono-grad)" strokeWidth="1.5"
                  strokeDasharray="580" strokeDashoffset="0"
                  style={{ animation: "dawa-stroke-draw 2.4s cubic-bezier(.2,.7,.2,1) both" }} />
          <circle cx="100" cy="100" r="80" fill="none" stroke="rgba(212,160,122,.18)" strokeDasharray="2 6" />
        </svg>
        <span style={{
          fontFamily: "'Amiri',serif", fontWeight: 900, fontSize: 56, lineHeight: 1,
          background: "linear-gradient(135deg,#fbf6e8,#f4d4c4,#d4a07a)",
          WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent",
          paddingBlock: 4,
        }}>{monogram}</span>
      </div>

      {/* Couple names */}
      {(groomName || brideName) && (
        <div style={{
          fontFamily: "'Amiri',serif", fontWeight: 900,
          fontSize: "clamp(40px, 8vw, 72px)", lineHeight: 1.3,
          background: "linear-gradient(135deg,#fff3c0,#f4d4c4,#d4a07a)",
          WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent",
          marginBottom: 18, letterSpacing: 0, paddingBlock: 8,
          animation: "dawa-rise 1.1s .3s cubic-bezier(.2,.7,.2,1) both",
        }}>
          {groomName}
          {groomName && brideName && (
            <span style={{
              fontStyle: "italic", fontSize: "0.5em", marginInline: 14,
              color: "#d4a07a", verticalAlign: "middle", opacity: 0.7,
            }}>
              {lang === "he" ? "ו" : "&"}
            </span>
          )}
          {brideName}
        </div>
      )}

      {/* Date line */}
      {dateText && (
        <div style={{
          display: "inline-flex", alignItems: "center", gap: 14,
          padding: "10px 20px", borderRadius: 999,
          background: "rgba(212,160,122,.06)",
          border: "1px solid rgba(212,160,122,.22)",
          color: "#fff3c0", fontSize: 14, fontWeight: 700,
          marginBottom: 24,
          animation: "dawa-rise 1.1s .45s ease both",
        }}>
          <strong style={{ color: "#f4d4c4" }}>{dateText}</strong>
        </div>
      )}

      {/* Guest greeting */}
      <div style={{
        fontFamily: "'Amiri',serif", fontStyle: "italic",
        color: "#d8c9a6", fontSize: 17, lineHeight: 1.85,
        maxWidth: 480, marginInline: "auto",
        animation: "dawa-rise 1.1s .6s ease both",
      }}>
        {t("inv_hero_join")}،<br />
        <strong style={{
          color: "#fff3c0", fontStyle: "normal", fontSize: 22,
          display: "inline-block", marginTop: 6,
        }}>{guestName || "—"}</strong>
      </div>
    </section>
  );
}

// ── Shared section head (sits above each RSVP / countdown block) ────────────
function SectionHead({ eyebrow, title }) {
  return (
    <div style={{ textAlign: "center", marginBottom: 28 }}>
      <div style={{
        display: "inline-flex", alignItems: "center", gap: 12,
        fontSize: 11, color: "#d4a07a", fontWeight: 800,
        letterSpacing: 3, textTransform: "uppercase", marginBottom: 12,
      }}>
        <span style={{ width: 22, height: 1, background: "linear-gradient(90deg, transparent, #d4a07a)" }} />
        {eyebrow}
        <span style={{ width: 22, height: 1, background: "linear-gradient(90deg, #d4a07a, transparent)" }} />
      </div>
      <h2 style={{
        fontFamily: "'Amiri',serif", fontWeight: 900,
        fontSize: "clamp(26px,4vw,38px)", lineHeight: 1.35,
        background: "linear-gradient(135deg,#fff3c0,#f4d4c4,#d4a07a)",
        WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent",
        letterSpacing: 0, paddingBlock: 4,
      }}>{title}</h2>
    </div>
  );
}

// ── RSVP form ────────────────────────────────────────────────────────────────
function RsvpForm({ rsvp, setRsvp, note, setNote, busy, error, onSubmit, t, lang }) {
  return (
    <div style={{
      padding: "28px 24px",
      borderRadius: 24,
      background: "linear-gradient(180deg, rgba(212,160,122,.05), rgba(212,160,122,.01))",
      border: "1px solid rgba(212,160,122,.22)",
      backdropFilter: "blur(20px)", WebkitBackdropFilter: "blur(20px)",
    }}>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 18 }}>
        <RsvpToggleBtn active={rsvp === "attending"} onClick={() => setRsvp("attending")}
                       color="#4cc97a" glyph="✓" label={t("inv_rsvp_attending")} />
        <RsvpToggleBtn active={rsvp === "absent"} onClick={() => setRsvp("absent")}
                       color="#d4533a" glyph="✗" label={t("inv_rsvp_absent")} />
      </div>

      <label style={{
        display: "block", marginBottom: 8,
        fontSize: 12, color: "#a09070",
        letterSpacing: 1.5, textTransform: "uppercase", fontWeight: 700,
      }}>{t("inv_rsvp_note")}</label>
      <textarea rows={3}
        value={note}
        onChange={e => setNote(e.target.value.slice(0, 500))}
        placeholder={lang === "he" ? "מבורך מראש..." : "مبروك مقدماً..."}
        style={{
          width: "100%",
          background: "rgba(255,255,255,.04)",
          border: "1px solid rgba(255,255,255,.10)",
          borderRadius: 12, padding: "12px 14px",
          color: "#fff3c0", fontSize: 14, fontFamily: "inherit",
          resize: "vertical", minHeight: 80, outline: "none",
          transition: "border-color .2s, box-shadow .2s",
          marginBottom: 14,
        }}
        onFocus={e => { e.currentTarget.style.borderColor = "rgba(212,160,122,.55)"; e.currentTarget.style.boxShadow = "0 0 0 3px rgba(212,160,122,.15)"; }}
        onBlur={e => { e.currentTarget.style.borderColor = "rgba(255,255,255,.10)"; e.currentTarget.style.boxShadow = "none"; }}
      />

      {error && (
        <div style={{
          color: "#d4533a", fontSize: 12, marginBottom: 12, textAlign: "center",
        }}>{error}</div>
      )}

      <button className="gold-btn" style={{ width: "100%" }} onClick={onSubmit} disabled={busy || !rsvp}>
        {busy ? <span className="spinner" /> : `${t("inv_rsvp_submit")} ←`}
      </button>
    </div>
  );
}

function RsvpToggleBtn({ active, onClick, color, glyph, label }) {
  return (
    <button onClick={onClick} style={{
      padding: "20px 12px", borderRadius: 16, cursor: "pointer",
      background: active ? `${color}1f` : "rgba(255,255,255,.03)",
      border: `2px solid ${active ? color : "rgba(255,255,255,.07)"}`,
      color: active ? color : "rgba(245,230,184,.6)",
      fontFamily: "inherit",
      display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 6,
      transition: "all .25s cubic-bezier(.2,.95,.25,1.1)",
    }}>
      <div style={{ fontSize: 28, lineHeight: 1 }}>{glyph}</div>
      <div style={{ fontSize: 13, fontWeight: 900 }}>{label}</div>
    </button>
  );
}

function SuccessCard({ children, tone }) {
  const isSuccess = tone === "success";
  return (
    <div style={{
      padding: "36px 24px", textAlign: "center",
      borderRadius: 24,
      background: isSuccess
        ? "linear-gradient(180deg, rgba(76,201,122,.10), rgba(76,201,122,.02))"
        : "linear-gradient(180deg, rgba(212,160,122,.06), rgba(212,160,122,.01))",
      border: `1px solid ${isSuccess ? "rgba(76,201,122,.30)" : "rgba(212,160,122,.20)"}`,
      backdropFilter: "blur(20px)", WebkitBackdropFilter: "blur(20px)",
      position: "relative", overflow: "hidden",
    }}>{children}</div>
  );
}

// ── Media carousel ───────────────────────────────────────────────────────────
function MediaCarousel({ items }) {
  const [idx, setIdx] = useState(0);
  const timer = useRef(null);

  useEffect(() => {
    if (items.length <= 1) return;
    timer.current = setInterval(() => setIdx(i => (i + 1) % items.length), 5000);
    return () => clearInterval(timer.current);
  }, [items.length]);

  const item = items[idx];
  if (!item) return null;

  return (
    <div style={{
      position: "relative", borderRadius: 22, overflow: "hidden",
      marginTop: 8, marginBottom: 4,
      boxShadow: "0 30px 80px -30px rgba(0,0,0,.6)",
      border: "1px solid rgba(212,160,122,.18)",
    }}>
      {item.kind === "video" ? (
        <video src={item.url} autoPlay muted loop playsInline
               style={{ width: "100%", maxHeight: 480, objectFit: "cover", display: "block" }} />
      ) : (
        <img src={item.url} alt=""
             style={{ width: "100%", maxHeight: 480, objectFit: "cover", display: "block" }} />
      )}
      {items.length > 1 && (
        <div style={{
          position: "absolute", bottom: 14, insetInline: 0,
          display: "flex", justifyContent: "center", gap: 6,
        }}>
          {items.map((_, i) => (
            <button key={i} onClick={() => { clearInterval(timer.current); setIdx(i); }}
              aria-label={`slide ${i + 1}`}
              style={{
                width: i === idx ? 26 : 8, height: 8, padding: 0, borderRadius: 4,
                background: i === idx ? "linear-gradient(90deg,#f4d4c4,#d4a07a)" : "rgba(255,255,255,.4)",
                border: "none", cursor: "pointer",
                transition: "width .4s cubic-bezier(.2,.95,.25,1.1), background .3s",
              }} />
          ))}
        </div>
      )}
    </div>
  );
}

// ── Countdown ────────────────────────────────────────────────────────────────
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

function CountdownCell({ value, label }) {
  const [flip, setFlip] = useState(false);
  const prev = useRef(value);
  useEffect(() => {
    if (prev.current !== value) {
      setFlip(true);
      prev.current = value;
      const id = setTimeout(() => setFlip(false), 400);
      return () => clearTimeout(id);
    }
  }, [value]);
  return (
    <div style={{
      flex: 1, minWidth: 0, textAlign: "center",
      paddingInline: 4,
    }}>
      <div style={{
        fontFamily: "'Amiri',serif", fontWeight: 900,
        fontSize: "clamp(40px, 9vw, 64px)",
        lineHeight: 1.2,
        background: "linear-gradient(135deg,#fff3c0,#f4d4c4,#d4a07a)",
        WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent",
        fontVariantNumeric: "tabular-nums",
        transition: "transform .4s cubic-bezier(.2,.95,.25,1.1)",
        transform: flip ? "translateY(-4px)" : "translateY(0)",
        textShadow: "0 0 30px rgba(212,160,122,.25)",
        paddingBlock: 6,
      }}>{String(value).padStart(2, "0")}</div>
      <div style={{
        fontFamily: "'Amiri',serif", fontStyle: "italic",
        fontSize: 11, color: "#d4a07a",
        letterSpacing: 2, textTransform: "uppercase",
        marginTop: 4,
      }}>{label}</div>
    </div>
  );
}

function Countdown({ weddingDate, t }) {
  const { d, h, m, s, reached } = useCountdown(weddingDate);
  if (reached) {
    return (
      <div style={{ textAlign: "center", padding: "32px 20px" }}>
        <div style={{ fontSize: 56, marginBottom: 12 }}>🎊</div>
        <div style={{
          color: "#fff3c0", fontSize: 26, fontWeight: 900,
          fontFamily: "'Amiri',serif", paddingBlock: 4,
        }}>{t("inv_today_is")}</div>
      </div>
    );
  }
  return (
    <div style={{
      display: "flex", alignItems: "stretch", justifyContent: "center",
      direction: "ltr",
      padding: "28px 12px",
      borderBlock: "1px solid rgba(212,160,122,.20)",
    }}>
      <CountdownCell value={d} label={t("inv_days")} />
      <Sep />
      <CountdownCell value={h} label={t("inv_hours")} />
      <Sep />
      <CountdownCell value={m} label={t("inv_minutes")} />
      <Sep />
      <CountdownCell value={s} label={t("inv_seconds")} />
    </div>
  );
}
function Sep() {
  return <div style={{ width: 1, alignSelf: "stretch", background: "rgba(212,160,122,.20)" }} />;
}

// ── Envelope intro overlay (one-time, persisted in localStorage) ────────────
function EnvelopeIntro({ guestName, t }) {
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
    <div className={`dawa-envelope-overlay${opening ? " is-opening" : ""}`}
         role="dialog" aria-label={t("inv_envelope_seal")}>
      <div className="dawa-envelope" role="button" tabIndex={0}
           onClick={onOpen}
           onKeyDown={e => (e.key === "Enter" || e.key === " ") && onOpen()}>
        <div className="dawa-wax-seal" aria-hidden="true" />
      </div>
      <div className="dawa-env-hint">— {t("inv_envelope_hint")} —</div>
      {guestName && <div className="dawa-env-name">{guestName}</div>}
    </div>
  );
}

// ── Ambience (petals + sparkles, lightweight) ───────────────────────────────
function Ambience() {
  const petals = useMemo(() => Array.from({ length: 10 }, () => ({
    left:  Math.random() * 100,
    dur:   16 + Math.random() * 14,
    delay: Math.random() * 18,
    size:  10 + Math.random() * 8,
  })), []);
  const sparkles = useMemo(() => Array.from({ length: 18 }, () => ({
    top:   Math.random() * 100,
    left:  Math.random() * 100,
    dur:   2.5 + Math.random() * 3,
    delay: Math.random() * 4,
  })), []);
  return (
    <>
      <div className="dawa-petals" aria-hidden="true">
        {petals.map((p, i) => (
          <span key={i} className="dawa-petal" style={{
            left: `${p.left}%`,
            width: p.size, height: p.size,
            animationDuration: `${p.dur}s`,
            animationDelay: `${p.delay}s`,
          }} />
        ))}
      </div>
      <div className="dawa-sparkles" aria-hidden="true">
        {sparkles.map((s, i) => (
          <span key={i} className="dawa-sparkle" style={{
            top: `${s.top}%`, left: `${s.left}%`,
            animationDuration: `${s.dur}s`,
            animationDelay: `${s.delay}s`,
          }} />
        ))}
      </div>
    </>
  );
}

// ── Floating action dock (music visual / share / calendar) ──────────────────
function FloatingDock({ t, weddingDate, groomName, brideName }) {
  const [music, setMusic] = useState(false);
  const onShare = async () => {
    const url = window.location.href;
    if (navigator.share) {
      try { await navigator.share({ url }); } catch { /* dismissed */ }
    } else if (navigator.clipboard) {
      try { await navigator.clipboard.writeText(url); } catch { /* ignored */ }
    }
  };
  const onCalendar = () => {
    if (!weddingDate) return;
    const dt = new Date(weddingDate);
    const fmt = (d) => d.toISOString().replace(/[-:]/g, "").split(".")[0] + "Z";
    const summary = [groomName, brideName].filter(Boolean).join(" & ") || "Wedding";
    const ics = [
      "BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Dawa//Invitation//AR", "BEGIN:VEVENT",
      `UID:dawa-${weddingDate}@dawa.app`,
      `DTSTAMP:${fmt(new Date())}`,
      `DTSTART:${fmt(dt)}`,
      `DTEND:${fmt(new Date(dt.getTime() + 5 * 3600 * 1000))}`,
      `SUMMARY:${summary}`,
      "END:VEVENT", "END:VCALENDAR",
    ].join("\n");
    const blob = new Blob([ics], { type: "text/calendar" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "dawa-invitation.ics";
    document.body.appendChild(a); a.click(); a.remove();
  };
  return (
    <div className="dawa-dock">
      <button className={`dawa-dock-btn${music ? " is-on" : ""}`}
              onClick={() => setMusic(m => !m)}
              aria-label="music">
        {music ? "♫" : "♪"}
        {music && <span className="dawa-dock-pulse" aria-hidden="true" />}
      </button>
      <button className="dawa-dock-btn" onClick={onShare} aria-label="share">↗</button>
      {weddingDate && (
        <button className="dawa-dock-btn" onClick={onCalendar} aria-label="calendar">📅</button>
      )}
    </div>
  );
}

function InviteFooter({ t, lang }) {
  return (
    <footer style={{
      textAlign: "center", marginTop: 80, paddingTop: 36,
      borderTop: "1px solid rgba(212,160,122,.16)",
    }}>
      <div style={{
        fontFamily: "'Amiri',serif", fontWeight: 900, fontSize: 28,
        background: "linear-gradient(135deg,#fff3c0,#f4d4c4,#d4a07a)",
        WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent",
        marginBottom: 8, paddingBlock: 4,
      }}>{lang === "he" ? "דעוה" : "دعوة"}</div>
      <div style={{
        fontFamily: "'Amiri',serif", fontStyle: "italic",
        color: "#d4a07a", fontSize: 12, letterSpacing: 3, textTransform: "uppercase",
      }}>{lang === "he" ? "— נעשה באהבה —" : "— صُنعت بحبّ —"}</div>
    </footer>
  );
}

// ── Confetti burst (DOM particles, vanilla; no library) ─────────────────────
function confettiBurst() {
  if (typeof document === "undefined") return;
  const root = document.createElement("div");
  root.className = "dawa-confetti";
  document.body.appendChild(root);
  const palette = ["#fff3c0", "#f0c84c", "#c9a84c", "#d4a07a", "#f4d4c4", "#fbf6e8"];
  for (let i = 0; i < 70; i++) {
    const s = document.createElement("span");
    const angle = Math.random() * Math.PI * 2;
    const dist  = 220 + Math.random() * 240;
    s.style.background = palette[i % palette.length];
    s.style.setProperty("--x", `${Math.cos(angle) * dist}px`);
    s.style.setProperty("--y", `${Math.sin(angle) * dist - 100}px`);
    s.style.setProperty("--r", `${(Math.random() * 720 - 360)}deg`);
    s.style.animationDelay = `${Math.random() * 0.2}s`;
    root.appendChild(s);
  }
  setTimeout(() => root.remove(), 1800);
}

// ── Loading / centered helpers ──────────────────────────────────────────────
function CenteredMessage({ children }) {
  return (
    <div style={{
      minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center",
      padding: 24, background: "#07070a",
    }}>
      <div style={{ maxWidth: 460, width: "100%", textAlign: "center" }}>{children}</div>
    </div>
  );
}
function LoadingScreen({ t }) {
  return <CenteredMessage>
    <PageStyles />
    <div style={{ display: "inline-flex", alignItems: "center", gap: 10, color: "#d4a07a", fontSize: 14 }}>
      <span className="spinner" />
      {t ? t("inv_loading") : "…"}
    </div>
  </CenteredMessage>;
}

// ── Page-scoped styles (envelope, ambience, dock, animations) ───────────────
function PageStyles() {
  return (
    <style>{`
      @keyframes dawa-rise { from { opacity: 0; transform: translateY(20px); } to { opacity: 1; transform: none; } }

      .dawa-reveal {
        opacity: 0; transform: translateY(36px);
        transition: opacity .9s cubic-bezier(.2,.7,.2,1), transform .9s cubic-bezier(.2,.7,.2,1);
      }
      .dawa-reveal.is-in { opacity: 1; transform: none; }

      /* Envelope intro */
      .dawa-envelope-overlay {
        position: fixed; inset: 0; z-index: 1000;
        background: radial-gradient(ellipse 80% 60% at 50% 50%, #1a1822 0%, #07070a 70%);
        display: flex; flex-direction: column;
        align-items: center; justify-content: center;
        padding: 32px;
        animation: dawa-env-in .9s cubic-bezier(.2,.95,.25,1.1) both;
        transition: opacity 1.2s ease, transform 1.4s cubic-bezier(.2,.95,.25,1.1);
      }
      @keyframes dawa-env-in { from { opacity: 0; } to { opacity: 1; } }
      .dawa-envelope-overlay.is-opening { opacity: 0; transform: scale(1.05); pointer-events: none; }
      .dawa-envelope-overlay::before {
        content: ""; position: absolute; inset: 0;
        background:
          radial-gradient(circle at 30% 20%, rgba(201,168,76,.10), transparent 50%),
          radial-gradient(circle at 70% 80%, rgba(212,160,122,.08), transparent 50%);
        pointer-events: none;
      }
      .dawa-envelope {
        position: relative; width: 320px; max-width: 80vw; aspect-ratio: 1.5/1;
        border-radius: 14px; cursor: pointer;
        background: linear-gradient(140deg, #14131c 0%, #1a1822 60%, #0e0d16 100%);
        border: 1px solid rgba(212,160,122,.30);
        box-shadow:
          inset 0 1px 0 rgba(255,255,255,.04),
          0 30px 80px -20px rgba(0,0,0,.7),
          0 0 60px rgba(212,160,122,.15);
        transition: transform .6s cubic-bezier(.2,.95,.25,1.1), box-shadow .6s ease;
      }
      .dawa-envelope:hover {
        transform: translateY(-6px) scale(1.02);
        box-shadow:
          inset 0 1px 0 rgba(255,255,255,.06),
          0 40px 100px -20px rgba(0,0,0,.7),
          0 0 80px rgba(212,160,122,.25);
      }
      .dawa-envelope::before, .dawa-envelope::after {
        content: ""; position: absolute;
        width: 50%; height: 100%; top: 0;
        background: linear-gradient(155deg, #1c1a26, #14131c);
        border-top: 1px solid rgba(212,160,122,.18);
      }
      .dawa-envelope::before { left: 0; clip-path: polygon(0 0, 100% 0, 100% 0, 50% 70%); }
      .dawa-envelope::after  { right: 0; clip-path: polygon(0 0, 100% 0, 50% 70%, 0 0); }
      .dawa-wax-seal {
        position: absolute; top: 50%; left: 50%;
        transform: translate(-50%,-50%);
        width: 86px; height: 86px; border-radius: 50%;
        background: radial-gradient(circle at 30% 30%, #f4d4c4 0%, #d4a07a 30%, #a06b4c 75%, #5a3520 100%);
        display: flex; align-items: center; justify-content: center;
        box-shadow:
          inset 0 2px 4px rgba(255,255,255,.45),
          inset 0 -4px 6px rgba(0,0,0,.40),
          0 8px 26px rgba(154,84,52,.55),
          0 0 32px rgba(212,160,122,.40);
        z-index: 2;
        animation: dawa-wax-pulse 3s ease-in-out infinite;
      }
      .dawa-wax-seal::after {
        content: "د"; font-family: 'Amiri', serif;
        font-size: 36px; font-weight: 900; color: #2a0f00;
        text-shadow: 0 1px 0 rgba(255,255,255,.3);
      }
      @keyframes dawa-wax-pulse {
        0%, 100% { transform: translate(-50%,-50%) scale(1);    }
        50%      { transform: translate(-50%,-50%) scale(1.05); }
      }
      .dawa-env-hint {
        margin-top: 36px;
        font-family: 'Amiri', serif; font-style: italic;
        color: #d4a07a; font-size: 13px;
        letter-spacing: 3px; text-transform: uppercase;
        animation: dawa-hint-flow 2.6s ease-in-out infinite;
      }
      @keyframes dawa-hint-flow {
        0%, 100% { opacity: .55; transform: translateY(0); }
        50%      { opacity: 1; transform: translateY(-3px); }
      }
      .dawa-env-name {
        margin-top: 22px;
        font-family: 'Amiri', serif; font-weight: 900;
        font-size: clamp(28px, 5vw, 44px);
        line-height: 1.4; padding-block: 6px;
        background: linear-gradient(135deg, #fbf6e8, #f4d4c4 40%, #d4a07a);
        -webkit-background-clip: text; background-clip: text;
        -webkit-text-fill-color: transparent;
        animation: dawa-rise 1.1s .3s cubic-bezier(.2,.95,.25,1.1) both;
      }
      .dawa-envelope-overlay.is-opening .dawa-envelope {
        animation: dawa-env-open 1.2s cubic-bezier(.2,.95,.25,1.1) forwards;
      }
      .dawa-envelope-overlay.is-opening .dawa-wax-seal {
        animation: dawa-seal-crack 1s cubic-bezier(.2,.95,.25,1.1) forwards;
      }
      @keyframes dawa-env-open {
        0%   { transform: translateY(0)    rotate(0)   scale(1);   opacity: 1; }
        60%  { transform: translateY(-30px) rotate(-2deg) scale(1.06); }
        100% { transform: translateY(-80vh) rotate(-4deg) scale(.7);  opacity: 0; }
      }
      @keyframes dawa-seal-crack {
        0%   { transform: translate(-50%,-50%) scale(1)    rotate(0); }
        30%  { transform: translate(-50%,-50%) scale(1.25) rotate(-12deg); }
        100% { transform: translate(-50%,-50%) scale(0)    rotate(180deg); opacity: 0; }
      }

      /* Ambience — petals + sparkles */
      .dawa-petals { position: fixed; inset: 0; pointer-events: none; z-index: 5; overflow: hidden; }
      .dawa-petal {
        position: absolute; top: -40px;
        background: radial-gradient(circle at 30% 30%, #f4d4c4 0%, #c98a78 80%);
        border-radius: 60% 40% 60% 40% / 70% 60% 40% 30%;
        opacity: .45;
        filter: blur(.4px) drop-shadow(0 2px 4px rgba(212,160,122,.3));
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
        background: #fff3c0;
        box-shadow: 0 0 8px #f0c84c, 0 0 16px rgba(240,200,76,.4);
        animation: dawa-sparkle ease-in-out infinite;
      }
      @keyframes dawa-sparkle {
        0%, 100% { opacity: 0; transform: scale(.5); }
        50%      { opacity: 1; transform: scale(1.6); }
      }

      /* Monogram ring stroke */
      @keyframes dawa-stroke-draw { from { stroke-dashoffset: 580; } to { stroke-dashoffset: 0; } }

      /* Floating dock — pinned bottom-right regardless of direction */
      .dawa-dock {
        position: fixed; bottom: 20px; right: 20px;
        z-index: 30;
        display: flex; flex-direction: column; gap: 10px;
      }
      .dawa-dock-btn {
        width: 50px; height: 50px; border-radius: 50%;
        background: rgba(7,7,10,.78); backdrop-filter: blur(20px); -webkit-backdrop-filter: blur(20px);
        border: 1px solid rgba(212,160,122,.30);
        color: #d4a07a; font-size: 20px;
        cursor: pointer; font-family: inherit;
        display: flex; align-items: center; justify-content: center;
        position: relative;
        transition: all .25s cubic-bezier(.2,.95,.25,1.1);
        box-shadow: 0 10px 30px -10px rgba(0,0,0,.55);
      }
      .dawa-dock-btn:hover {
        color: #fff3c0; border-color: #d4a07a;
        transform: translateY(-2px);
        box-shadow: 0 16px 40px -10px rgba(212,160,122,.25);
      }
      .dawa-dock-btn.is-on { color: #fff3c0; border-color: #d4a07a; }
      .dawa-dock-pulse {
        position: absolute; inset: -3px; border-radius: 50%;
        border: 1.5px solid #d4a07a;
        animation: dawa-dock-pulse 1.6s ease-out infinite;
      }
      @keyframes dawa-dock-pulse {
        0% { transform: scale(1); opacity: .8; }
        100% { transform: scale(1.5); opacity: 0; }
      }

      /* Success seal */
      .dawa-success-seal {
        width: 80px; height: 80px; margin: 0 auto 18px;
        border-radius: 50%;
        background: linear-gradient(135deg, #4cc97a, #2f8a55);
        color: #07070a; font-size: 38px; font-weight: 900;
        display: flex; align-items: center; justify-content: center;
        box-shadow: 0 0 0 6px rgba(76,201,122,.15), 0 12px 36px rgba(47,138,85,.45);
        animation: dawa-seal-pop .7s cubic-bezier(.17,.67,.35,1.4) both;
      }
      @keyframes dawa-seal-pop {
        from { transform: scale(0) rotate(-30deg); opacity: 0; }
        to   { transform: scale(1) rotate(0); opacity: 1; }
      }

      /* Confetti burst */
      .dawa-confetti {
        position: fixed; inset: 0; pointer-events: none; z-index: 1500;
        display: flex; align-items: center; justify-content: center;
      }
      .dawa-confetti span {
        position: absolute; width: 10px; height: 14px;
        opacity: 0; border-radius: 2px;
        animation: dawa-confetti-burst 1.6s cubic-bezier(.2,.7,.2,1) forwards;
      }
      @keyframes dawa-confetti-burst {
        0%   { transform: translate(0,0) rotate(0); opacity: 0; }
        10%  { opacity: 1; }
        100% { transform: translate(var(--x), var(--y)) rotate(var(--r)); opacity: 0; }
      }

      @media (prefers-reduced-motion: reduce) {
        .dawa-reveal { opacity: 1 !important; transform: none !important; transition: none !important; }
        .dawa-petal, .dawa-sparkle, .dawa-wax-seal, .dawa-dock-pulse { animation: none !important; }
      }
    `}</style>
  );
}
