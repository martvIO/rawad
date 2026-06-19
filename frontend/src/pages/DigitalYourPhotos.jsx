// "صورك" — Face-recognition page reached from the digital invitation landing.
// Route: /d/:groomUsername/:token/photos
//
// AWS Rekognition engine:
//   1. Poll GET /digital/photos/matches?token=… (public, token-credential).
//      - photos not published → lock screen (poll keeps it advancing)
//      - already enrolled     → INSTANT gallery; later polls pick up newly
//                               indexed photos automatically
//      - not enrolled         → consent + method screen
//   2. The guest enrols a selfie via the CAMERA with AWS Face Liveness
//      (anti-spoof); on completion the verified reference image is enrolled
//      server-side. The verified selfie is processed by Rekognition; only a
//      FaceId is stored (auto-deleted when the invite expires). The camera is
//      the ONLY enrollment path — there is intentionally no photo-upload
//      fallback (anti-spoofing requires a live capture).
//   3. Gallery: download-all (.zip), re-scan, and delete-my-face-data.
import { useEffect, useRef, useState, lazy, Suspense } from "react";
import { useParams, useNavigate } from "react-router-dom";
import {
  subscribeFaceMatches,
  createLivenessSession,
  enrollWithLiveness,
  deleteFaceEnrollment,
  photosZipUrl,
} from "../services/digitalPhotos.js";
import { livenessConfigured } from "../utils/awsLiveness.js";
import { PhoneInput, isCompletePhone } from "../components/PhoneInput.jsx";
import { LangSwitcher } from "../components/LangSwitcher.jsx";
import { logErr } from "../utils/logger.js";
import { C } from "../styles/theme.js";

const LivenessCapture = lazy(() => import("../components/LivenessCapture.jsx"));

export function DigitalYourPhotos({ lang, setLang }) {
  const { token } = useParams();
  const navigate = useNavigate();

  // Stage: loading | invalid | not-published | consent |
  //        liveness-loading | liveness | enrolling | done | error
  const [stage, setStage] = useState("loading");
  const [error, setError] = useState("");
  const [matches, setMatches] = useState([]);
  const [expiresAt, setExpiresAt] = useState(null);
  const [phone, setPhone] = useState("");
  const [session, setSession] = useState(null); // { sessionId, region }

  const cancelledRef = useRef(false);
  const stageRef = useRef("loading");
  const unsubRef = useRef(null);
  const phoneTouchedRef = useRef(false);
  useEffect(() => { stageRef.current = stage; }, [stage]);

  // ── Poll enrollment state + matches ──────────────────────────────────────
  useEffect(() => {
    if (!token) { setStage("invalid"); setError(tt(lang, "رابط غير صالح", "קישור לא תקין")); return; }
    cancelledRef.current = false;
    const unsub = subscribeFaceMatches(
      token,
      (state) => {
        if (cancelledRef.current || !state) return;
        if (state.expiresAt) setExpiresAt(state.expiresAt);
        if (state.guestPhone && !phoneTouchedRef.current) setPhone(state.guestPhone);
        const s = stageRef.current;
        const passive = s === "loading" || s === "not-published" || s === "done";
        if (!passive) return;
        if (state.published !== true) { setStage("not-published"); return; }
        if (state.enrolled) {
          setMatches(state.matches || []);
          setStage("done");
        } else if (s !== "done") {
          setMatches([]);
          setStage("consent");
        }
      },
      (err) => {
        if (cancelledRef.current) return;
        if (err?.status === 400 || err?.status === 404 || err?.status === 410) {
          setStage("invalid");
          setError(err.status === 410
            ? tt(lang, "انتهت صلاحية الرابط", "תוקף הקישור פג")
            : tt(lang, "رابط غير صالح", "קישור לא תקין"));
          if (unsubRef.current) unsubRef.current();
        }
      },
    );
    unsubRef.current = unsub;
    return () => { cancelledRef.current = true; unsub(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  // ── Camera (AWS Face Liveness) path — the only enrollment method ──────────
  const startLiveness = async () => {
    setStage("liveness-loading");
    try {
      const s = await createLivenessSession(token);
      if (cancelledRef.current) return;
      if (!s?.sessionId) throw new Error("no_session");
      setSession(s);
      setStage("liveness");
    } catch (err) {
      logErr("createLivenessSession", err);
      setStage("error");
      setError(tt(lang, "تعذّر بدء فحص الكاميرا — حاول مجدداً", "לא ניתן להתחיל בדיקת מצלמה — נסה שוב"));
    }
  };
  const onLivenessComplete = async () => {
    setStage("enrolling");
    try {
      const resp = await enrollWithLiveness(token, session?.sessionId, phone.trim());
      if (cancelledRef.current) return;
      setMatches(resp?.matches ?? []);
      if (resp?.expiresAt) setExpiresAt(resp.expiresAt);
      setStage("done");
    } catch (err) {
      handleEnrollError(err);
    }
  };

  function handleEnrollError(err) {
    logErr("enroll", err);
    if (cancelledRef.current) return;
    setStage("error");
    const code = err?.body?.error;
    setError(
      err?.status === 409 || code === "not_published"
        ? tt(lang, "الصور لم تُنشر بعد", "התמונות עוד לא פורסמו")
        : err?.status === 413
          ? tt(lang, "الصورة كبيرة جداً — اختر صورة أصغر", "התמונה גדולה מדי — בחר תמונה קטנה יותר")
          : code === "no_face"
            ? tt(lang, "لم نتعرّف على وجه في الصورة — جرّب صورة أوضح", "לא זוהו פנים בתמונה — נסה תמונה ברורה יותר")
            : code === "liveness_failed"
              ? tt(lang, "لم يكتمل فحص الحيوية — حاول مجدداً", "בדיקת החיות לא הושלמה — נסה שוב")
              : tt(lang, "فشل حفظ بصمة الوجه — حاول مجدداً", "שמירת חתימת הפנים נכשלה — נסה שוב"),
    );
  }

  // ── Delete my face data ──────────────────────────────────────────────────
  const handleDeleteFaceData = async () => {
    const sure = window.confirm(tt(lang,
      "سيتم حذف بصمة وجهك المخزّنة نهائياً. متابعة؟",
      "חתימת הפנים השמורה תימחק לצמיתות. להמשיך?"));
    if (!sure) return;
    try {
      await deleteFaceEnrollment(token);
      setMatches([]);
      setStage("consent");
    } catch (err) {
      logErr("deleteFaceEnrollment", err);
      setStage("error");
      setError(tt(lang, "فشل حذف البيانات — حاول مجدداً", "מחיקת הנתונים נכשלה — נסה שוב"));
    }
  };

  useEffect(() => () => { cancelledRef.current = true; }, []);

  const expiryDateText = expiresAt
    ? new Date(expiresAt).toLocaleDateString(lang === "he" ? "he-IL" : "ar-EG",
        { day: "numeric", month: "long", year: "numeric", numberingSystem: "latn" })
    : null;

  return (
    <div style={{ minHeight: "100vh", background: C.bg }}>
      <div style={{
        position: "sticky", top: 0, zIndex: 50, background: "rgba(7,7,10,.95)",
        backdropFilter: "blur(12px)", borderBottom: "1px solid rgba(201,168,76,.18)",
      }}>
        <div style={{
          maxWidth: 720, margin: "0 auto", padding: "10px 16px",
          display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10,
        }}>
          <button onClick={() => navigate("..")} style={{
            background: "none", border: "none", color: C.dim, cursor: "pointer", fontSize: 18,
          }}>←</button>
          <div style={{ fontWeight: 800, color: C.gold, fontSize: 14 }}>
            📸 {tt(lang, "صورك", "התמונות שלך")}
          </div>
          <LangSwitcher lang={lang} setLang={setLang} />
        </div>
      </div>

      <div style={{ maxWidth: 720, margin: "0 auto", padding: "24px 16px 60px" }}>
        {stage === "loading" && <Status icon="…" text={tt(lang, "جاري التحميل", "טוען")} />}

        {stage === "not-published" && (
          <div className="gold-card" style={{ textAlign: "center", padding: 32 }}>
            <div style={{ fontSize: 56, marginBottom: 14 }}>🔒</div>
            <div style={{ fontSize: 16, fontWeight: 800, color: C.gold, marginBottom: 8 }}>
              {tt(lang, "الصور لم تُنشر بعد من قِبل العريس", "התמונות עוד לא פורסמו על-ידי החתן")}
            </div>
            <div style={{ fontSize: 12, color: C.dim, lineHeight: 1.7 }}>
              {tt(lang, "عُد لاحقاً بعد نشر الصور لتتمكن من البحث عن صورك",
                        "חזור מאוחר יותר אחרי שהתמונות יפורסמו")}
            </div>
          </div>
        )}

        {stage === "consent" && (
          <div className="gold-card" style={{ padding: 28 }}>
            <div style={{ fontSize: 44, textAlign: "center", marginBottom: 10 }}>🔍📸</div>
            <div style={{ fontSize: 16, fontWeight: 800, color: C.gold, textAlign: "center", marginBottom: 14 }}>
              {tt(lang, "ابحث عن صورك بالتعرف على الوجه", "מצא את התמונות שלך בזיהוי פנים")}
            </div>
            <div style={{ fontSize: 13, color: C.dim, lineHeight: 2, marginBottom: 16 }}>
              <div>{tt(lang,
                "📷 استخدم كاميرا جهازك لالتقاط صورة حيّة ونعثر على كل الصور التي تظهر فيها.",
                "📷 השתמש במצלמת המכשיר לצילום חי ונמצא את כל התמונות שאתה מופיע בהן.")}</div>
              <div>{tt(lang,
                "☁️ تُرسَل صورتك بأمان وتُعالَج عبر خدمة التعرف على الوجه (AWS) لمطابقة صور الحفل فقط — نحفظ توقيعاً رقمياً للوجه، لا الصورة نفسها.",
                "☁️ התמונה נשלחת באופן מאובטח ומעובדת בשירות זיהוי הפנים (AWS) רק להתאמת תמונות האירוע — נשמרת חתימה מספרית, לא התמונה.")}</div>
              {expiryDateText && (
                <div>{tt(lang,
                  `🗓 يُحذف توقيع وجهك تلقائياً بتاريخ ${expiryDateText} مع انتهاء صلاحية الدعوة.`,
                  `🗓 חתימת הפנים נמחקת אוטומטית בתאריך ${expiryDateText} עם פקיעת ההזמנה.`)}</div>
              )}
              <div>{tt(lang, "🗑 يمكنك حذف بصمة وجهك في أي وقت.", "🗑 ניתן למחוק את חתימת הפנים בכל עת.")}</div>
            </div>

            <label style={{ fontSize: 12, color: C.dim, display: "block", marginBottom: 6 }}>
              {tt(lang, "📱 رقم هاتفك (لإرسال رابط صورك)", "📱 מספר הטלפון שלך (לקבלת קישור התמונות)")}
            </label>
            <div style={{ marginBottom: 16 }}>
              <PhoneInput
                value={phone}
                onChange={(v) => { phoneTouchedRef.current = true; setPhone(v); }}
                lang={lang}
              />
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {livenessConfigured() ? (
                <button
                  className="gold-btn"
                  onClick={startLiveness}
                  disabled={!isCompletePhone(phone)}
                  style={{ opacity: isCompletePhone(phone) ? 1 : 0.5, cursor: isCompletePhone(phone) ? "pointer" : "not-allowed" }}
                >
                  {tt(lang, "📷 افتح الكاميرا للبحث عن صورك", "📷 פתח מצלמה כדי למצוא את התמונות שלך")}
                </button>
              ) : (
                <div style={{
                  background: "rgba(212,122,75,.10)", border: "1px solid rgba(212,122,75,.4)", color: C.dim,
                  borderRadius: 10, padding: "12px 14px", fontSize: 13, lineHeight: 1.7, textAlign: "center",
                }}>
                  {tt(lang,
                    "هذه الميزة تتطلب كاميرا — افتح الرابط من هاتف بكاميرا ومتصفّح حديث.",
                    "תכונה זו דורשת מצלמה — פתח את הקישור מטלפון עם מצלמה ודפדפן עדכני.")}
                </div>
              )}
              <button onClick={() => navigate("..")} style={{
                background: "none", border: "1px solid rgba(255,255,255,.15)", color: C.dim,
                borderRadius: 10, padding: "10px 14px", cursor: "pointer", fontSize: 13,
              }}>
                {tt(lang, "رجوع", "חזרה")}
              </button>
            </div>
          </div>
        )}

        {stage === "liveness-loading" && (
          <Status icon="📷" text={tt(lang, "جاري تجهيز فحص الكاميرا...", "מכין את בדיקת המצלמה...")} />
        )}
        {stage === "enrolling" && (
          <Status icon="🔍" text={tt(lang, "جاري التحقق والبحث عن صورك...", "מאמת ומחפש את התמונות שלך...")} />
        )}

        {stage === "liveness" && session && (
          <Suspense fallback={<Status icon="📷" text={tt(lang, "جاري التحميل...", "טוען...")} />}>
            <LivenessCapture
              sessionId={session.sessionId}
              region={session.region}
              onComplete={onLivenessComplete}
              onError={(err) => { logErr("liveness", err); setStage("error"); setError(tt(lang, "تعذّر فحص الكاميرا — حاول مجدداً", "בדיקת המצלמה נכשלה — נסה שוב")); }}
              onCancel={() => setStage("consent")}
            />
          </Suspense>
        )}

        {stage === "done" && (
          <>
            {matches.length === 0 ? (
              <div className="card" style={{ textAlign: "center", padding: 32, color: C.dim }}>
                <div style={{ fontSize: 48, marginBottom: 10 }}>🔍</div>
                {tt(lang, "لم نجد صوراً لك بعد — تُضاف الصور الجديدة تلقائياً", "לא נמצאו תמונות שלך עדיין — תמונות חדשות נוספות אוטומטית")}
              </div>
            ) : (
              <>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14, gap: 10, flexWrap: "wrap" }}>
                  <div style={{ fontSize: 14, fontWeight: 800, color: C.gold }}>
                    {tt(lang, `وجدنا ${matches.length} صورة`, `מצאנו ${matches.length} תמונות`)}
                  </div>
                  <a href={photosZipUrl(token)} target="_blank" rel="noreferrer" className="gold-btn"
                     style={{ textDecoration: "none", padding: "8px 14px", fontSize: 13 }}>
                    {tt(lang, "⬇️ تنزيل الكل (ZIP)", "⬇️ הורד הכל (ZIP)")}
                  </a>
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(120px,1fr))", gap: 6 }}>
                  {matches.map(m => (
                    <a key={m.fileId} href={m.url} target="_blank" rel="noreferrer">
                      <img src={m.url} alt=""
                           style={{ width: "100%", aspectRatio: "1", objectFit: "cover", borderRadius: 10,
                                    border: "1px solid rgba(201,168,76,.25)" }}/>
                    </a>
                  ))}
                </div>
              </>
            )}
            <div style={{ display: "flex", justifyContent: "center", gap: 10, marginTop: 22, flexWrap: "wrap" }}>
              <button onClick={() => setStage("consent")} style={{
                background: "none", border: "1px solid rgba(201,168,76,.4)", color: C.goldLight,
                borderRadius: 10, padding: "9px 14px", cursor: "pointer", fontSize: 12, fontWeight: 700,
              }}>
                {tt(lang, "🔄 إعادة المسح", "🔄 סריקה מחדש")}
              </button>
              <button onClick={handleDeleteFaceData} style={{
                background: "none", border: "1px solid rgba(255,80,80,.35)", color: "#e07070",
                borderRadius: 10, padding: "9px 14px", cursor: "pointer", fontSize: 12, fontWeight: 700,
              }}>
                {tt(lang, "🗑 حذف بصمة وجهي", "🗑 מחק את חתימת הפנים שלי")}
              </button>
            </div>
          </>
        )}

        {stage === "invalid" && (
          <div className="gold-card" style={{ textAlign: "center" }}>
            <div style={{ fontSize: 56, marginBottom: 12 }}>⚠️</div>
            <div style={{ fontSize: 14, color: C.red, fontWeight: 800 }}>{error}</div>
          </div>
        )}

        {stage === "error" && (
          <div className="gold-card" style={{ textAlign: "center" }}>
            <div style={{ fontSize: 56, marginBottom: 12 }}>⚠️</div>
            <div style={{ fontSize: 14, color: C.red, fontWeight: 800, marginBottom: 14 }}>{error}</div>
            <button onClick={() => { setError(""); setStage("consent"); }} className="gold-btn">
              {tt(lang, "🔁 حاول مرة أخرى", "🔁 נסה שוב")}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Helpers ────────────────────────────────────────────────────────────────
const tt = (lang, ar, he) => (lang === "he" ? he : ar);

function Status({ icon, text }) {
  return (
    <div style={{ textAlign: "center", padding: "60px 20px", color: C.dim }}>
      <div style={{ fontSize: 56, marginBottom: 14 }}>{icon}</div>
      <div style={{ fontSize: 13 }}>{text}</div>
    </div>
  );
}
