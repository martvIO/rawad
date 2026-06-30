// "الأشخاص" — public People gallery. Route: /g/:groomUsername
//
// Everyone-shareable link, but gated: the viewer enters their phone → must be in
// the wedding's guest list → gets an SMS code → unlocks the gallery for 24h.
// Then: a grid of person-tiles (like iPhone Photos > People); tapping a person
// shows every photo they're in + a download-all (.zip). The look INHERITS the
// couple's invitation theme (color + font). An admin kill-switch can disable it
// instantly (reads 404 → "unavailable").
import { useEffect, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import {
  requestGalleryOtp,
  verifyGalleryOtp,
  fetchGalleryPeople,
  fetchPersonPhotos,
  personZipUrl,
} from "../services/peopleGallery.js";
import { getDigitalTheme, getDigitalFont } from "../styles/digitalThemes.js";
import { LangSwitcher } from "../components/LangSwitcher.jsx";
import { logErr } from "../utils/logger.js";

const tt = (lang, ar, he) => (lang === "he" ? he : ar);
const SITE_KEY = import.meta.env.VITE_RECAPTCHA_V2_SITE_KEY || "";
const grantKey = (u) => `dawaGalleryGrant:${u}`;

export function PeopleGallery({ lang, setLang }) {
  const { groomUsername } = useParams();

  // stage: gate | otp | loading | people | person | unavailable | error
  const [stage, setStage] = useState("loading");
  const [error, setError] = useState("");
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [sessionInfo, setSessionInfo] = useState("");
  const [consentChecked, setConsentChecked] = useState(false); // biometric consent gate
  const [busy, setBusy] = useState(false);

  const [token, setToken] = useState(() => sessionStorage.getItem(grantKey(groomUsername)) || "");
  const [config, setConfig] = useState(null);
  const [people, setPeople] = useState([]);
  const [person, setPerson] = useState(null); // { label, photos }

  const recaptchaElRef = useRef(null);
  const widgetIdRef = useRef(null);

  const theme = getDigitalTheme(config?.themeColor || "gold");
  const font = getDigitalFont(config?.fontFamily || "amiri");

  // If we already hold a grant, try to load straight into the gallery.
  useEffect(() => {
    if (token) loadPeople(token);
    else setStage("gate");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Load + render the reCAPTCHA widget on the gate screen.
  useEffect(() => {
    if (stage !== "gate" || !SITE_KEY) return;
    const render = () => {
      if (!window.grecaptcha || widgetIdRef.current != null || !recaptchaElRef.current) return;
      try {
        window.grecaptcha.ready(() => {
          if (widgetIdRef.current == null && recaptchaElRef.current) {
            widgetIdRef.current = window.grecaptcha.render(recaptchaElRef.current, { sitekey: SITE_KEY });
          }
        });
      } catch { /* already rendered */ }
    };
    if (window.grecaptcha) { render(); return; }
    const existing = document.getElementById("dawa-recaptcha");
    if (existing) { existing.addEventListener("load", render); return; }
    const s = document.createElement("script");
    s.id = "dawa-recaptcha";
    s.src = "https://www.google.com/recaptcha/api.js?render=explicit";
    s.async = true; s.defer = true; s.onload = render;
    document.head.appendChild(s);
  }, [stage]);

  async function loadPeople(grant) {
    setStage("loading");
    try {
      const data = await fetchGalleryPeople(groomUsername, grant);
      setConfig(data.config || {});
      setPeople(data.people || []);
      setStage("people");
    } catch (err) {
      if (err?.status === 404) { setStage("unavailable"); return; }
      if (err?.status === 401) { sessionStorage.removeItem(grantKey(groomUsername)); setToken(""); setStage("gate"); return; }
      logErr("loadPeople", err);
      setStage("error"); setError(tt(lang, "تعذّر تحميل المعرض", "טעינת הגלריה נכשלה"));
    }
  }

  const onRequestOtp = async () => {
    if (!phone.trim()) return;
    const recaptchaToken = SITE_KEY && window.grecaptcha ? window.grecaptcha.getResponse(widgetIdRef.current ?? undefined) : "";
    if (SITE_KEY && !recaptchaToken) { setError(tt(lang, "يرجى تأكيد أنك لست روبوت", "אמת שאינך רובוט")); return; }
    setBusy(true); setError("");
    try {
      const r = await requestGalleryOtp(groomUsername, phone.trim(), recaptchaToken);
      setSessionInfo(r.sessionInfo);
      setStage("otp");
    } catch (err) {
      if (err?.status === 404) { setStage("unavailable"); return; }
      setError(err?.status === 403
        ? tt(lang, "هذا الرقم غير موجود في قائمة المدعوين", "המספר אינו ברשימת המוזמנים")
        : tt(lang, "تعذّر إرسال الرمز — حاول مجدداً", "שליחת הקוד נכשלה — נסה שוב"));
      try { window.grecaptcha?.reset(widgetIdRef.current ?? undefined); } catch { /* */ }
    } finally { setBusy(false); }
  };

  const onVerifyOtp = async () => {
    if (!code.trim()) return;
    setBusy(true); setError("");
    try {
      const r = await verifyGalleryOtp(groomUsername, sessionInfo, code.trim(), consentChecked);
      sessionStorage.setItem(grantKey(groomUsername), r.galleryToken);
      setToken(r.galleryToken);
      await loadPeople(r.galleryToken);
    } catch (err) {
      setError(err?.status === 403
        ? tt(lang, "هذا الرقم غير موجود في قائمة المدعوين", "המספר אינו ברשימת המוזמנים")
        : tt(lang, "رمز غير صحيح — حاول مجدداً", "קוד שגוי — נסה שוב"));
    } finally { setBusy(false); }
  };

  const openPerson = async (cluster) => {
    setStage("loading");
    try {
      const data = await fetchPersonPhotos(groomUsername, cluster.clusterId, token);
      setPerson({ clusterId: cluster.clusterId, label: cluster.label, photos: data.photos || [] });
      setStage("person");
    } catch (err) {
      logErr("openPerson", err);
      setStage("people");
    }
  };

  // ── Render ────────────────────────────────────────────────────────────────
  const pageStyle = { minHeight: "100vh", background: theme.bg, color: theme.text, fontFamily: font };
  const card = { background: "rgba(255,255,255,.04)", border: `1px solid ${theme.accentLine}`, borderRadius: 16, padding: 24, maxWidth: 420, margin: "40px auto" };

  return (
    <div style={pageStyle}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "12px 16px", borderBottom: `1px solid ${theme.accentLine}` }}>
        <div style={{ fontWeight: 800, color: theme.accent }}>📸 {tt(lang, "ألبوم الأشخاص", "אלבום האנשים")}</div>
        <LangSwitcher lang={lang} setLang={setLang} />
      </div>

      {stage === "loading" && <Centered text={tt(lang, "جاري التحميل…", "טוען…")} color={theme.text} />}

      {stage === "unavailable" && (
        <div style={card}>
          <div style={{ fontSize: 48, textAlign: "center", marginBottom: 10 }}>🔒</div>
          <div style={{ textAlign: "center", fontWeight: 800 }}>{tt(lang, "المعرض غير متاح حالياً", "הגלריה אינה זמינה כעת")}</div>
        </div>
      )}

      {stage === "error" && (
        <div style={card}>
          <div style={{ fontSize: 44, textAlign: "center", marginBottom: 10 }}>⚠️</div>
          <div style={{ textAlign: "center", color: "#e07070", fontWeight: 800 }}>{error}</div>
        </div>
      )}

      {stage === "gate" && (
        <div style={card}>
          <div style={{ fontSize: 40, textAlign: "center", marginBottom: 8 }}>🔐</div>
          <div style={{ fontSize: 16, fontWeight: 800, textAlign: "center", color: theme.accent, marginBottom: 8 }}>
            {tt(lang, "ألبوم صور الحفل", "אלבום תמונות האירוע")}
          </div>
          <div style={{ fontSize: 13, opacity: 0.8, textAlign: "center", lineHeight: 1.8, marginBottom: 12 }}>
            {tt(lang, "للدخول، أدخل رقم هاتفك المسجّل في الدعوة وسنرسل لك رمز تحقق.",
                      "להיכנס, הזן את מספר הטלפון שלך מההזמנה ונשלח קוד אימות.")}
          </div>
          <div style={{ fontSize: 12, opacity: 0.75, textAlign: "start", lineHeight: 1.7, marginBottom: 12 }}>
            {tt(lang,
              "🔎 يستخدم هذا الألبوم التعرف على الوجه (AWS) لتجميع الصور حسب الأشخاص. تُحفظ توقيعات رقمية للوجوه — لا الصور — وتُحذف تلقائياً بعد الحفل.",
              "🔎 אלבום זה משתמש בזיהוי פנים (AWS) לקיבוץ התמונות לפי אנשים. נשמרות חתימות מספריות — לא התמונות — והן נמחקות אוטומטית אחרי האירוע.")}
          </div>
          <label style={{
            display: "flex", alignItems: "flex-start", gap: 10, cursor: "pointer",
            fontSize: 12.5, opacity: 0.9, lineHeight: 1.7, marginBottom: 14, textAlign: "start",
          }}>
            <input
              type="checkbox"
              checked={consentChecked}
              onChange={(e) => setConsentChecked(e.target.checked)}
              style={{ marginTop: 3, flexShrink: 0, width: 16, height: 16, accentColor: theme.accent, cursor: "pointer" }}
            />
            <span>{tt(lang,
              "أوافق على استخدام التعرف على الوجه لعرض صور الحفل المنظَّمة حسب الأشخاص.",
              "אני מסכים לשימוש בזיהוי פנים להצגת תמונות האירוע מאורגנות לפי אנשים.")}{" "}
              <a href="/terms" target="_blank" rel="noopener noreferrer" style={{ color: theme.accent }}>
                {tt(lang, "سياسة الخصوصية", "מדיניות הפרטיות")}
              </a>
            </span>
          </label>
          <input value={phone} onChange={(e) => setPhone(e.target.value)} inputMode="tel" placeholder="05X-XXXXXXX"
                 style={inputStyle(theme)} />
          {SITE_KEY ? <div ref={recaptchaElRef} style={{ display: "flex", justifyContent: "center", margin: "12px 0" }} />
                    : <div style={{ fontSize: 11, opacity: 0.6, textAlign: "center", margin: "10px 0" }}>{tt(lang, "(التحقق غير مُهيّأ)", "(אימות לא מוגדר)")}</div>}
          {error && <div style={{ color: "#e07070", fontSize: 12, textAlign: "center", marginBottom: 8 }}>{error}</div>}
          <button onClick={onRequestOtp} disabled={busy || !consentChecked}
                  style={{ ...btnStyle(theme), opacity: (busy || !consentChecked) ? 0.5 : 1, cursor: (busy || !consentChecked) ? "not-allowed" : "pointer" }}>
            {busy ? "…" : tt(lang, "أرسل رمز التحقق", "שלח קוד אימות")}
          </button>
        </div>
      )}

      {stage === "otp" && (
        <div style={card}>
          <div style={{ fontSize: 40, textAlign: "center", marginBottom: 8 }}>✉️</div>
          <div style={{ fontSize: 13, opacity: 0.8, textAlign: "center", marginBottom: 16 }}>
            {tt(lang, "أدخل الرمز المُرسل إلى هاتفك", "הזן את הקוד שנשלח לטלפון שלך")}
          </div>
          <input value={code} onChange={(e) => setCode(e.target.value)} inputMode="numeric" placeholder="123456"
                 style={{ ...inputStyle(theme), textAlign: "center", letterSpacing: 6, fontSize: 20 }} />
          {error && <div style={{ color: "#e07070", fontSize: 12, textAlign: "center", margin: "8px 0" }}>{error}</div>}
          <button onClick={onVerifyOtp} disabled={busy} style={btnStyle(theme)}>
            {busy ? "…" : tt(lang, "دخول", "כניסה")}
          </button>
        </div>
      )}

      {stage === "people" && (
        <div style={{ maxWidth: 900, margin: "0 auto", padding: "20px 16px 60px" }}>
          {config?.coverPhoto?.url && (
            <img src={config.coverPhoto.url} alt="" style={{ width: "100%", maxHeight: 220, objectFit: "cover", borderRadius: 16, marginBottom: 16 }} />
          )}
          <div style={{ textAlign: "center", fontWeight: 800, fontSize: 18, color: theme.accent, marginBottom: 6 }}>
            {config?.brideName || ""}{config?.brideName && config?.groomDisplayName ? " & " : ""}{config?.groomDisplayName || ""}
          </div>
          <div style={{ textAlign: "center", fontSize: 13, opacity: 0.75, marginBottom: 20 }}>
            {tt(lang, `${people.length} شخص — اضغط على أي وجه لرؤية صوره`, `${people.length} אנשים — לחץ על פנים לצפייה בתמונות`)}
          </div>
          {people.length === 0 ? (
            <div style={{ textAlign: "center", opacity: 0.7 }}>{tt(lang, "لا يوجد أشخاص بعد", "אין אנשים עדיין")}</div>
          ) : (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(110px,1fr))", gap: 14 }}>
              {people.map((p) => (
                <button key={p.clusterId} onClick={() => openPerson(p)}
                        style={{ background: "none", border: "none", cursor: "pointer", display: "flex", flexDirection: "column", alignItems: "center", gap: 6 }}>
                  <FaceTile rep={p.rep} accent={theme.accent} />
                  <div style={{ fontSize: 12, fontWeight: 700, color: theme.text }}>
                    {labelOf(p, lang)}
                  </div>
                  <div style={{ fontSize: 10, opacity: 0.6 }}>{p.photoCount} 📷</div>
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {stage === "person" && person && (
        <div style={{ maxWidth: 900, margin: "0 auto", padding: "20px 16px 60px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14, gap: 10, flexWrap: "wrap" }}>
            <button onClick={() => setStage("people")} style={{ ...btnGhost(theme) }}>← {tt(lang, "كل الأشخاص", "כל האנשים")}</button>
            <div style={{ fontWeight: 800, color: theme.accent }}>{person.label ? labelText(person.label, lang) : tt(lang, "صور هذا الشخص", "תמונות האדם")}</div>
            <a href={personZipUrl(groomUsername, person.clusterId, token)} target="_blank" rel="noreferrer" style={{ ...btnStyle(theme), textDecoration: "none", padding: "8px 14px", width: "auto" }}>
              ⬇️ {tt(lang, "تنزيل الكل", "הורד הכל")}
            </a>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(120px,1fr))", gap: 6 }}>
            {person.photos.map((m) => (
              <a key={m.fileId} href={m.url} target="_blank" rel="noreferrer">
                <img src={m.url} alt="" style={{ width: "100%", aspectRatio: "1", objectFit: "cover", borderRadius: 10, border: `1px solid ${theme.accentLine}` }} />
              </a>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Helpers ──────────────────────────────────────────────────────────────────
function labelOf(p, lang) {
  return p.label ? labelText(p.label, lang) : (lang === "he" ? "אדם" : "شخص");
}
function labelText(label, lang) {
  if (label && typeof label === "object") return lang === "he" ? (label.he || label.ar || "") : (label.ar || label.he || "");
  return String(label || "");
}

// A face tile: crops the representative photo to the face box (object-position
// at the face centre) inside a circle.
function FaceTile({ rep, accent }) {
  const box = rep?.box || { x: 0, y: 0, w: 1, h: 1 };
  const cx = Math.min(1, Math.max(0, box.x + box.w / 2));
  const cy = Math.min(1, Math.max(0, box.y + box.h / 2));
  return (
    <div style={{ width: 96, height: 96, borderRadius: "50%", overflow: "hidden", border: `2px solid ${accent}`, background: "#0b0b0f" }}>
      {rep?.url ? (
        <img src={rep.url} alt="" style={{ width: "100%", height: "100%", objectFit: "cover", objectPosition: `${cx * 100}% ${cy * 100}%`, transform: "scale(1.6)" }} />
      ) : <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 30 }}>🙂</div>}
    </div>
  );
}

function Centered({ text, color }) {
  return <div style={{ textAlign: "center", padding: "80px 20px", color, opacity: 0.8 }}>{text}</div>;
}
const inputStyle = (theme) => ({ width: "100%", boxSizing: "border-box", padding: "11px 12px", borderRadius: 10, border: `1px solid ${theme.accentLine}`, background: "rgba(255,255,255,.05)", color: theme.text, fontSize: 15, direction: "ltr", textAlign: "center" });
const btnStyle = (theme) => ({ width: "100%", padding: "12px 14px", borderRadius: 10, border: "none", background: theme.accent, color: "#1a1208", fontSize: 15, fontWeight: 800, cursor: "pointer", marginTop: 6 });
const btnGhost = (theme) => ({ background: "none", border: `1px solid ${theme.accentLine}`, color: theme.text, borderRadius: 10, padding: "8px 12px", cursor: "pointer", fontSize: 13 });
