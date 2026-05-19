// Public digital invitation landing page.
// Route: /d/:groomUsername/:token
//
// Reads the invite token from RTDB (public read) and the groom's digital
// invitation doc from Firestore (public read on the parent doc), then renders:
//   - Hero header: guest's name in large gold serif
//   - Media carousel: images / GIFs / videos from the groom's gallery
//   - RSVP buttons (attending / absent)
//   - Countdown timer to the wedding date
//   - Top nav: only "صورك" tab → /d/:user/:token/photos
import { useEffect, useState, useRef, lazy, Suspense } from "react";
import { useParams, Routes, Route, useNavigate, useSearchParams } from "react-router-dom";
import { BrandLogo } from "../components/BrandLogo.jsx";
import { LangSwitcher } from "../components/LangSwitcher.jsx";
import { subscribeInviteToken } from "../services/invites.js";
import { getDigitalInvitationPublic, submitDigitalGuestInvite } from "../services/digitalInvitation.js";
import { logErr } from "../utils/logger.js";
import { C } from "../styles/theme.js";

// Demo-mode data used when the URL has ?demo=1 — lets the groom preview the
// landing page without minting a real invite token. Reads name + wedding date
// from query params so it's easy to share a link.
// Hero pulse — gentle scale-up + matching radiant gold glow on the same
// timeline so the two effects stay perfectly synchronised (one keyframe,
// one duration, one easing curve). Peak at 50%, calm at 0%/100%.
const HERO_KEYFRAMES = `
@keyframes dawa-hero-pulse {
  0%, 100% {
    transform: scale(1);
    text-shadow:
      0 0 12px rgba(201,168,76,.22),
      0 0 28px rgba(201,168,76,.12);
  }
  50% {
    transform: scale(1.05);
    text-shadow:
      0 0 18px rgba(245,221,138,.85),
      0 0 36px rgba(201,168,76,.6),
      0 0 70px rgba(201,168,76,.4),
      0 0 110px rgba(201,168,76,.22);
  }
}
`;

const DEMO_MEDIA = [
  { url: "https://images.unsplash.com/photo-1519741497674-611481863552?w=1200&q=80",
    kind: "image", storagePath: "demo/1" },
  { url: "https://images.unsplash.com/photo-1465495976277-4387d4b0e4a6?w=1200&q=80",
    kind: "image", storagePath: "demo/2" },
  { url: "https://images.unsplash.com/photo-1511795409834-ef04bbd61622?w=1200&q=80",
    kind: "image", storagePath: "demo/3" },
];

// Lazy-load the face-recognition page so its ~600KB bundle (face-api.js +
// liveness logic) only ships when the guest opens the "صورك" tab.
const DigitalYourPhotos = lazy(() => import("./DigitalYourPhotos.jsx").then(m => ({ default: m.DigitalYourPhotos })));

export function DigitalInvitationPage({ lang, setLang }) {
  return (
    <Routes>
      <Route index element={<DigitalLandingMain lang={lang} setLang={setLang} />} />
      <Route path="photos" element={
        <Suspense fallback={<LoadingScreen lang={lang} />}>
          <DigitalYourPhotos lang={lang} setLang={setLang} />
        </Suspense>
      } />
    </Routes>
  );
}

function DigitalLandingMain({ lang, setLang }) {
  const { groomUsername, token } = useParams();
  const navigate = useNavigate();
  const [search] = useSearchParams();
  const isDemo   = search.get("demo") === "1";
  const demoName = search.get("name");
  const demoDate = search.get("date"); // YYYY-MM-DD or ISO

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

  // Subscribe to the token to resolve groomUid + guestName (skipped in demo).
  useEffect(() => {
    if (isDemo) return;
    if (!token) { setTokenRec(null); return; }
    return subscribeInviteToken(token, setTokenRec);
  }, [token, isDemo]);

  // Fetch the groom's invitation doc once we know their uid (skipped in demo).
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
        // Preview mode — pretend the submission succeeded after a short delay.
        await new Promise(r => setTimeout(r, 400));
        setDone(true);
        return;
      }
      await submitDigitalGuestInvite({ token, rsvp, note: note.trim() });
      setDone(true);
    } catch (err) {
      logErr("submitDigitalGuestInvite", err);
      const code = err?.code || "";
      if (code.includes("deadline-exceeded")) setError(lang === "he" ? "הקישור פג תוקף" : "انتهت صلاحية الرابط");
      else if (code.includes("not-found"))    setError(lang === "he" ? "קישור לא תקין" : "رابط غير صالح");
      else if (code.includes("already-exists")) setError(lang === "he" ? "כבר השבת" : "تم الرد مسبقاً");
      else setError(err?.message || (lang === "he" ? "שגיאה" : "خطأ"));
    } finally {
      setBusy(false);
    }
  };

  // ── States: loading / invalid / expired / used ────────────────────────────
  if (tokenRec === undefined) return <LoadingScreen lang={lang} />;
  if (tokenRec === null) {
    return <CenteredMessage>
      <div style={{ fontSize: 56, marginBottom: 12 }}>⚠️</div>
      <h1 style={{ fontFamily: "'Amiri',serif", color: C.red, fontSize: 24 }}>
        {lang === "he" ? "קישור לא תקין" : "رابط غير صالح"}
      </h1>
    </CenteredMessage>;
  }
  if (tokenRec.expiresAt && Date.now() > tokenRec.expiresAt) {
    return <CenteredMessage>
      <div style={{ fontSize: 56, marginBottom: 12 }}>⏰</div>
      <h1 style={{ fontFamily: "'Amiri',serif", color: C.red, fontSize: 24 }}>
        {lang === "he" ? "הקישור פג תוקף" : "انتهت صلاحية الرابط"}
      </h1>
    </CenteredMessage>;
  }

  const media = doc?.media || [];
  const guestName = tokenRec.guestName || "";

  return (
    <div style={{ minHeight: "100vh", background: C.bg, paddingBottom: 40 }}>

      {/* Top nav — language switch + "صورك" tab */}
      <div style={{
        position: "sticky", top: 0, zIndex: 50, background: "rgba(7,7,10,.95)",
        backdropFilter: "blur(12px)", borderBottom: "1px solid rgba(201,168,76,.18)",
      }}>
        <div style={{
          maxWidth: 720, margin: "0 auto", padding: "10px 16px",
          display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10,
        }}>
          <button onClick={() => navigate("photos")} style={{
            padding: "8px 16px", borderRadius: 10, cursor: "pointer",
            background: "linear-gradient(135deg,rgba(201,168,76,.18),rgba(201,168,76,.08))",
            border: "1px solid rgba(201,168,76,.4)",
            color: C.gold, fontSize: 13, fontWeight: 800, fontFamily: "inherit",
          }}>
            📸 {lang === "he" ? "התמונות שלך" : "صورك"}
          </button>
          <LangSwitcher lang={lang} setLang={setLang} />
        </div>
      </div>

      <div style={{ maxWidth: 720, margin: "0 auto", padding: "20px 16px" }}>

        {/* ── Hero: guest name in large gold serif ─────────────────────── */}
        <style>{HERO_KEYFRAMES}</style>
        <div style={{ textAlign: "center", padding: "24px 16px 22px", animation: "fadeUp .5s ease" }}>
          <div style={{ display: "flex", justifyContent: "center", marginBottom: 14 }}>
            <BrandLogo size={56} />
          </div>
          <h1 style={{
            fontFamily: "'Amiri',serif",
            fontSize: "clamp(30px, 7.5vw, 52px)",
            fontWeight: 900,
            color: C.gold,
            margin: 0, lineHeight: 1.25,
            display: "inline-block",
            transformOrigin: "center",
            // Single keyframe drives both the scale + shadow on one timeline
            // so the pulse and the glow stay perfectly synced.
            animation: "dawa-hero-pulse 3.6s ease-in-out infinite",
            willChange: "transform, text-shadow",
          }}>
            {lang === "he" ? "כבוד המוזמן:" : "حضرة المدعو:"} {guestName || "—"}
          </h1>
        </div>

        {/* ── Media carousel ───────────────────────────────────────────── */}
        {media.length > 0 && <MediaCarousel items={media} />}

        {/* ── Couple names (optional) ──────────────────────────────────── */}
        {(doc?.brideName || doc?.groomDisplayName) && (
          <div style={{ textAlign: "center", padding: "20px 0", color: C.goldLight }}>
            <div style={{ fontSize: 13, color: C.dim, marginBottom: 6 }}>
              {lang === "he" ? "החתן והכלה" : "العريسان"}
            </div>
            <div style={{ fontFamily: "'Amiri',serif", fontSize: 22, fontWeight: 800 }}>
              {doc.groomDisplayName} {doc.brideName && doc.groomDisplayName && " & "} {doc.brideName}
            </div>
          </div>
        )}

        {/* ── RSVP section ─────────────────────────────────────────────── */}
        {!done && tokenRec.usedAt ? (
          <div className="gold-card" style={{ textAlign: "center", margin: "20px 0" }}>
            <div style={{ fontSize: 44, marginBottom: 8 }}>✅</div>
            <div style={{ color: "#4cc97a", fontSize: 16, fontWeight: 800 }}>
              {lang === "he" ? "כבר השבת — תודה!" : "تم الرد مسبقاً — شكراً!"}
            </div>
          </div>
        ) : done ? (
          <div className="gold-card" style={{ textAlign: "center", margin: "20px 0" }}>
            <div style={{ fontSize: 56, marginBottom: 10 }}>🎉</div>
            <div style={{ color: "#4cc97a", fontSize: 18, fontWeight: 900, marginBottom: 8 }}>
              {lang === "he" ? "תודה!" : "شكراً جزيلاً!"}
            </div>
            <div style={{ color: "rgba(245,230,184,.8)", fontSize: 13, lineHeight: 1.8 }}>
              {rsvp === "attending"
                ? (lang === "he" ? "מחכים לראותך באירוע 💛" : "بانتظارك في الحفل 💛")
                : (lang === "he" ? "מצטערים שלא תוכל להגיע" : "نأسف لعدم استطاعتك الحضور")}
            </div>
          </div>
        ) : (
          <div className="gold-card" style={{ marginTop: 20 }}>
            <div style={{ textAlign: "center", fontSize: 14, color: C.goldDim, marginBottom: 14, fontWeight: 700 }}>
              {lang === "he" ? "האם תגיע לחתונה?" : "هل ستحضر الزفاف؟"}
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 14 }}>
              <button onClick={() => setRsvp("attending")} style={rsvpBtnStyle(rsvp === "attending", "#4cc97a")}>
                <div style={{ fontSize: 32, marginBottom: 6 }}>✓</div>
                <div style={{ fontSize: 14, fontWeight: 900 }}>
                  {lang === "he" ? "מגיע" : "سأحضر"}
                </div>
              </button>
              <button onClick={() => setRsvp("absent")} style={rsvpBtnStyle(rsvp === "absent", C.red)}>
                <div style={{ fontSize: 32, marginBottom: 6 }}>✗</div>
                <div style={{ fontSize: 14, fontWeight: 900 }}>
                  {lang === "he" ? "לא מגיע" : "لن أحضر"}
                </div>
              </button>
            </div>

            <textarea className="input-field" rows={3}
                      value={note} onChange={e => setNote(e.target.value.slice(0, 500))}
                      placeholder={lang === "he" ? "הערה לזוג (אופציונלי)" : "ملاحظة للعروسين (اختياري)"}
                      style={{ marginBottom: 12, resize: "vertical", minHeight: 64, fontFamily: "inherit" }}/>

            {error && <div style={{ color: C.red, fontSize: 12, marginBottom: 10, textAlign: "center" }}>{error}</div>}

            <button className="gold-btn" style={{ width: "100%" }} onClick={submit} disabled={busy || !rsvp}>
              {busy ? "…" : (lang === "he" ? "שלח תשובה" : "إرسال الرد")}
            </button>
          </div>
        )}

        {/* ── Countdown ────────────────────────────────────────────────── */}
        {doc?.weddingDate && <Countdown weddingDate={doc.weddingDate} lang={lang} />}
      </div>
    </div>
  );
}

// ── Media carousel ──────────────────────────────────────────────────────────
function MediaCarousel({ items }) {
  const [idx, setIdx] = useState(0);
  const timer = useRef(null);

  // Auto-advance every 5s, pause if there's only one item.
  useEffect(() => {
    if (items.length <= 1) return;
    timer.current = setInterval(() => setIdx(i => (i + 1) % items.length), 5000);
    return () => clearInterval(timer.current);
  }, [items.length]);

  const item = items[idx];
  if (!item) return null;

  return (
    <div style={{ position: "relative", borderRadius: 18, overflow: "hidden", marginBottom: 4 }}>
      {item.kind === "video" ? (
        <video src={item.url} autoPlay muted loop playsInline
               style={{ width: "100%", maxHeight: 480, objectFit: "cover", display: "block" }}/>
      ) : (
        <img src={item.url} alt=""
             style={{ width: "100%", maxHeight: 480, objectFit: "cover", display: "block" }}/>
      )}
      {items.length > 1 && (
        <div style={{
          position: "absolute", bottom: 12, insetInline: 0,
          display: "flex", justifyContent: "center", gap: 6,
        }}>
          {items.map((_, i) => (
            <button key={i} onClick={() => { clearInterval(timer.current); setIdx(i); }}
                    style={{
                      width: i === idx ? 24 : 8, height: 8, padding: 0, borderRadius: 4,
                      background: i === idx ? C.gold : "rgba(255,255,255,.4)",
                      border: "none", cursor: "pointer", transition: "all .3s",
                    }}/>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Countdown ───────────────────────────────────────────────────────────────
// Inline-text format: D:HH:MM:SS, large red digits, no card / boxes.
// Each digit slide-down animates whenever its value changes: outgoing digit
// slides down + fades out, incoming digit slides in from above.
const COUNTDOWN_KEYFRAMES = `
@keyframes dawa-slide-in {
  from { transform: translateY(-100%); opacity: 0; }
  to   { transform: translateY(0);     opacity: 1; }
}
@keyframes dawa-slide-out {
  from { transform: translateY(0);     opacity: 1; }
  to   { transform: translateY(100%);  opacity: 0; }
}
`;

// A single digit with an enter/exit slide-down animation.
// `stack` holds one or two items: the currently visible incoming digit and,
// briefly during a change, the outgoing digit sliding out beneath it. Keys
// stay stable across the post-animation cleanup so React doesn't remount
// (and re-animate) the surviving incoming digit every second.
function FlipDigit({ value }) {
  const counterRef = useRef(0);
  const prevRef    = useRef(value);
  const [stack,    setStack] = useState(() => [
    { v: value, k: 0, side: "in" },
  ]);

  useEffect(() => {
    if (prevRef.current === value) return;
    const newKey = ++counterRef.current;
    setStack(prev => [
      ...prev.map(it => ({ ...it, side: "out" })),
      { v: value, k: newKey, side: "in" },
    ]);
    prevRef.current = value;
    const t = setTimeout(() => {
      // Drop the outgoing item(s) but keep the incoming one with its existing
      // key intact — same key = no remount = no re-trigger of the slide-in.
      setStack(prev => prev.filter(it => it.k === newKey));
    }, 480);
    return () => clearTimeout(t);
  }, [value]);

  return (
    <span style={{
      position: "relative", display: "inline-block",
      overflow: "hidden", verticalAlign: "baseline",
      minWidth: "1ch", textAlign: "center",
    }}>
      {/* Invisible spacer — reserves the row height while items animate. */}
      <span style={{ visibility: "hidden" }}>{value}</span>
      {stack.map(it => (
        <span key={it.k} style={{
          position: "absolute", inset: 0,
          animation: `${it.side === "out" ? "dawa-slide-out" : "dawa-slide-in"} .48s cubic-bezier(.55,.06,.18,1) both`,
        }}>{it.v}</span>
      ))}
    </span>
  );
}

// Render a fixed-width number using one FlipDigit per character.
function FlipNumber({ value, pad = 2 }) {
  const str = String(value).padStart(pad, "0");
  return (
    <>
      {str.split("").map((ch, i) => (
        <FlipDigit key={i} value={ch} />
      ))}
    </>
  );
}

function Countdown({ weddingDate, lang }) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  const diff = Math.max(0, weddingDate - now);
  const days    = Math.floor(diff / 86400000);
  const hours   = Math.floor((diff % 86400000) / 3600000);
  const minutes = Math.floor((diff % 3600000) / 60000);
  const seconds = Math.floor((diff % 60000) / 1000);

  if (weddingDate - now <= 0) {
    return (
      <div style={{ textAlign: "center", marginTop: 28 }}>
        <div style={{ fontSize: 40, marginBottom: 6 }}>🎊</div>
        <div style={{ color: "#d4533a", fontSize: 22, fontWeight: 900, fontFamily: "'Amiri',serif" }}>
          {lang === "he" ? "החתונה כאן!" : "اليوم هو يوم الزفاف!"}
        </div>
      </div>
    );
  }

  // Digit width depends on the max days count so the row doesn't jitter.
  const daysPad = days >= 100 ? 3 : days >= 10 ? 2 : 1;

  return (
    <div style={{ textAlign: "center", marginTop: 28 }}>
      <style>{COUNTDOWN_KEYFRAMES}</style>
      <div style={{
        fontSize: 12, color: C.goldDim, marginBottom: 10,
        letterSpacing: 2, textTransform: "uppercase", fontWeight: 700,
      }}>
        {lang === "he" ? "נשאר לחתונה" : "متبقي للعرس"}
      </div>
      <div style={{
        direction: "ltr",
        display: "inline-flex", alignItems: "baseline", justifyContent: "center", gap: 4,
        fontFamily: "'Amiri',serif",
        fontSize: "clamp(48px, 12vw, 88px)",
        lineHeight: 1.05,
        fontWeight: 900,
        color: "#e63946",
        textShadow: "0 0 24px rgba(230,57,70,.35)",
        letterSpacing: 1,
      }}>
        <FlipNumber value={days}    pad={daysPad} />
        <Separator />
        <FlipNumber value={hours}   pad={2} />
        <Separator />
        <FlipNumber value={minutes} pad={2} />
        <Separator />
        <FlipNumber value={seconds} pad={2} />
      </div>
    </div>
  );
}

function Separator() {
  return (
    <span style={{ color: "#e63946", opacity: 0.85, padding: "0 2px" }}>:</span>
  );
}

function CenteredMessage({ children }) {
  return (
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
      <div style={{ maxWidth: 460, width: "100%", textAlign: "center" }}>{children}</div>
    </div>
  );
}
function LoadingScreen({ lang }) {
  return <CenteredMessage>
    <div style={{ color: C.dim, fontSize: 14 }}>
      {lang === "he" ? "טוען..." : "جاري التحميل..."}
    </div>
  </CenteredMessage>;
}
const rsvpBtnStyle = (selected, color) => ({
  padding: "20px 12px", borderRadius: 14, cursor: "pointer",
  background: selected ? `${color}26` : "rgba(255,255,255,.03)",
  border: `2px solid ${selected ? color : "rgba(255,255,255,.07)"}`,
  color: selected ? color : "rgba(245,230,184,.6)",
  fontFamily: "inherit", transition: "all .2s ease",
  display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
});
