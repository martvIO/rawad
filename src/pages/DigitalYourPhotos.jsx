// "صورك" — Face-recognition page reached from the digital invitation landing.
// Route: /d/:groomUsername/:token/photos
//
// Server-side face index (replaces the old fully-in-browser matcher, which
// re-scanned up to 80 photos on the guest's phone on every single visit):
//   1. Poll GET /digital/photos/matches?token=… (public, token-credential).
//      - photos not published → lock screen (poll keeps it advancing)
//      - already enrolled     → INSTANT gallery, no camera; later poll ticks
//                               pick up newly indexed photos automatically
//      - not enrolled         → explicit biometric CONSENT screen
//   2. After consent: load face-api models, open the front camera, liveness
//      (turn head both ways), extract ONE 128-D descriptor — all in-browser;
//      the camera image never leaves the device.
//   3. POST /digital/photos/enroll stores the descriptor server-side (kept
//      until the invite expires, Firestore-TTL'd) and returns the matches
//      against the photoFaces index that a Cloud Function maintains over
//      EVERY photographer photo — no 80-photo cap.
//   4. Gallery footer: "rescan" (replaces the descriptor) and "delete my
//      face data" (immediate erasure → back to consent).
import { useEffect, useRef, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import {
  subscribeFaceMatches,
  enrollFaceDescriptor,
  deleteFaceEnrollment,
} from "../services/digitalPhotos.js";
import { LangSwitcher } from "../components/LangSwitcher.jsx";
import { logErr } from "../utils/logger.js";
import { C } from "../styles/theme.js";

const STEP_TIMEOUT_MS     = 20000;   // time budget per turn (resets after the 1st turn)
const YAW_TRIGGER_DEG     = 13;      // degrees of yaw to register a turn (eased from 15)
const HOLD_FRAMES         = 2;       // consecutive frames beyond threshold to confirm (debounce)

export function DigitalYourPhotos({ lang, setLang }) {
  const { token } = useParams();
  const navigate = useNavigate();

  // ── State machine ────────────────────────────────────────────────────────
  // "loading"           → first matches fetch in flight
  // "invalid"           → token missing/expired — terminal, no retry
  // "not-published"     → lock screen (poller keeps it advancing)
  // "consent"           → biometric consent screen, gate before any camera
  // "loading-models"    → fetching face-api models from /models
  // "requesting-camera" → asking for camera permission
  // "liveness"          → user turning head left/right
  // "extracting"        → grabbing the guest descriptor
  // "enrolling"         → storing the descriptor + first match round trip
  // "done"              → results gallery (poller refreshes new photos)
  // "error"             → camera/enroll error with retry
  const [stage, setStage]    = useState("loading");
  const [error, setError]    = useState("");
  const [livenessProgress, setLivenessProgress] = useState({ left: false, right: false });
  const [faceDetected, setFaceDetected] = useState(false);
  const [matches, setMatches] = useState([]);
  const [expiresAt, setExpiresAt] = useState(null);

  const videoRef        = useRef(null);
  const canvasRef       = useRef(null);
  const streamRef       = useRef(null);
  const faceapiRef      = useRef(null);
  const livenessRafRef  = useRef(0);
  const livenessTimeout = useRef(null);
  const cancelledRef    = useRef(false);
  // The matches endpoint is POLLED; once the guest is inside the camera flow
  // the poller must not yank the stage out from under them. The ref mirrors
  // `stage` so the poll callback can decide without re-subscribing.
  const stageRef        = useRef("loading");
  const unsubRef        = useRef(null);
  useEffect(() => { stageRef.current = stage; }, [stage]);

  // ── Step 1: poll enrollment state + matches ──────────────────────────────
  useEffect(() => {
    if (!token) { setStage("invalid"); setError(tt(lang, "رابط غير صالح", "קישור לא תקין")); return; }
    cancelledRef.current = false;
    const unsub = subscribeFaceMatches(
      token,
      (state) => {
        if (cancelledRef.current || !state) return;
        if (state.expiresAt) setExpiresAt(state.expiresAt);
        const s = stageRef.current;
        // Passive stages follow the server; the consent screen and the camera
        // flow own the stage until they finish.
        const passive = s === "loading" || s === "not-published" || s === "done";
        if (!passive) return;
        if (state.published !== true) { setStage("not-published"); return; }
        if (state.enrolled) {
          setMatches(state.matches || []);
          setStage("done");
        } else if (s !== "done") {
          // A tick that STARTED before our enroll POST landed can still say
          // enrolled:false — never bounce an already-shown gallery back to
          // the consent screen over a stale read.
          setMatches([]);
          setStage("consent");
        }
      },
      (err) => {
        if (cancelledRef.current) return;
        // Token-level failures are terminal — stop polling, no retry button.
        if (err?.status === 400 || err?.status === 404 || err?.status === 410) {
          setStage("invalid");
          setError(err.status === 410
            ? tt(lang, "انتهت صلاحية الرابط", "תוקף הקישור פג")
            : tt(lang, "رابط غير صالح", "קישור לא תקין"));
          if (unsubRef.current) unsubRef.current();
        }
        // Other errors: the poller backs off and retries on its own.
      },
    );
    unsubRef.current = unsub;
    return () => { cancelledRef.current = true; unsub(); cleanupCamera(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  // ── Step 2: load face-api models after consent ───────────────────────────
  useEffect(() => {
    if (stage !== "loading-models") return;
    (async () => {
      try {
        const faceapi = await import("face-api.js");
        faceapiRef.current = faceapi;
        await Promise.all([
          faceapi.nets.tinyFaceDetector.loadFromUri("/models"),
          faceapi.nets.faceLandmark68Net.loadFromUri("/models"),
          faceapi.nets.faceRecognitionNet.loadFromUri("/models"),
        ]);
        if (cancelledRef.current) return;
        setStage("requesting-camera");
      } catch (err) {
        logErr("loadFaceApiModels", err);
        setStage("error");
        setError(tt(lang, "فشل تحميل مكتبة التعرف", "טעינת ספריית הזיהוי נכשלה"));
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stage]);

  // Attach the live MediaStream to the <video> element. Safe to call any time:
  // it only binds when both the stream and a (mounted) video element exist, and
  // never re-binds the same stream. This is the fix for the black-screen bug —
  // getUserMedia resolves before the <video> is guaranteed mounted, so binding
  // is driven by an effect that re-runs on every render instead of a one-shot.
  function bindStream() {
    const v = videoRef.current;
    if (v && streamRef.current && v.srcObject !== streamRef.current) {
      v.srcObject = streamRef.current;
      v.play().catch(() => { /* autoplay rejection is non-fatal; user gesture already granted */ });
    }
  }

  // Draw the green tracking box + landmark dots over the live video. The canvas
  // shares the video's CSS mirror (scaleX -1), so drawing raw detection coords
  // lines up with the mirrored selfie view. Pass `null` to clear (no face).
  function drawOverlay(result) {
    const canvas = canvasRef.current;
    const video = videoRef.current;
    const faceapi = faceapiRef.current;
    if (!canvas || !video || !faceapi || !video.videoWidth) return;
    const dims = { width: video.videoWidth, height: video.videoHeight };
    faceapi.matchDimensions(canvas, dims);
    const ctx = canvas.getContext("2d");
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    if (!result) return;
    const resized = faceapi.resizeResults(result, dims);
    if (resized?.detection?.box) {
      new faceapi.draw.DrawBox(resized.detection.box, { boxColor: "#4cc97a", lineWidth: 3 }).draw(canvas);
    }
    if (resized?.landmarks) {
      faceapi.draw.drawFaceLandmarks(canvas, resized);
    }
  }

  // ── Step 3: open camera ─────────────────────────────────────────────────
  useEffect(() => {
    if (stage !== "requesting-camera") return;
    let cancelled = false;
    cleanupCamera(); // stop any prior stream (e.g. on retry) before re-acquiring
    (async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: "user", width: { ideal: 640 }, height: { ideal: 480 } },
          audio: false,
        });
        if (cancelled || cancelledRef.current) { stream.getTracks().forEach(t => t.stop()); return; }
        streamRef.current = stream;
        bindStream();            // bind immediately if the <video> is already mounted
        setStage("liveness");    // re-render mounts the video; the bind effect below catches it
      } catch (err) {
        logErr("getUserMedia", err);
        setStage("error");
        setError(tt(lang, "تم رفض الوصول للكاميرا", "הגישה למצלמה נדחתה"));
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stage]);

  // Re-bind on every render so the stream attaches the moment the <video> mounts
  // (covers the case where getUserMedia resolved before the element existed).
  useEffect(() => { bindStream(); });

  // ── Step 4: liveness check via head-yaw tracking ────────────────────────
  // Sequential, two-step turn: first turn (either physical direction — raw
  // front-camera mirroring differs per device, so we accept whichever way the
  // guest turns first and remember its sign), then the OPPOSITE turn. This
  // guarantees two genuine turns while the on-screen labels still read
  // "right then left" because step 1 follows the guest's prompted first turn.
  useEffect(() => {
    if (stage !== "liveness") return;
    const faceapi = faceapiRef.current;
    let right = false, left = false;   // right = 1st turn confirmed, left = 2nd (opposite)
    let firstSign = 0;                 // sign of the 1st turn; the 2nd must be its negative
    let hold = 0;                      // consecutive in-direction frames (debounce)
    setLivenessProgress({ right, left });
    setFaceDetected(false);
    bindStream(); // ensure the stream is attached before we start reading frames

    const armTimeout = () => {
      clearTimeout(livenessTimeout.current);
      livenessTimeout.current = setTimeout(() => {
        cancelAnimationFrame(livenessRafRef.current);
        setStage("error");
        setError(tt(lang, "لم يكتمل الفحص — جرّب مجدداً وأدِر رأسك ببطء", "הבדיקה לא הושלמה — נסה שוב ולאט"));
      }, STEP_TIMEOUT_MS);
    };
    armTimeout();

    const detectorOpts = new faceapi.TinyFaceDetectorOptions({ inputSize: 224, scoreThreshold: 0.4 });

    const tick = async () => {
      if (cancelledRef.current || !videoRef.current) return;
      try {
        const result = await faceapi
          .detectSingleFace(videoRef.current, detectorOpts)
          .withFaceLandmarks();
        if (result?.landmarks) {
          setFaceDetected(true);
          drawOverlay(result);                 // green box + landmarks over the face
          const yaw = estimateYaw(result.landmarks);
          if (!right) {
            // Step 1: any clear turn confirms; remember its direction.
            if (Math.abs(yaw) > YAW_TRIGGER_DEG) {
              if (++hold >= HOLD_FRAMES) {
                right = true; firstSign = Math.sign(yaw); hold = 0;
                setLivenessProgress({ right, left });
                armTimeout();                  // fresh time budget for the 2nd turn
              }
            } else hold = 0;
          } else if (!left) {
            // Step 2: must turn the OPPOSITE way.
            if (Math.sign(yaw) === -firstSign && Math.abs(yaw) > YAW_TRIGGER_DEG) {
              if (++hold >= HOLD_FRAMES) {
                left = true; hold = 0;
                setLivenessProgress({ right, left });
              }
            } else hold = 0;
          }
          if (right && left) {
            cancelAnimationFrame(livenessRafRef.current);
            clearTimeout(livenessTimeout.current);
            setStage("extracting");
            return;
          }
        } else {
          setFaceDetected(false);
          drawOverlay(null);                   // clear the overlay when no face is visible
          hold = 0;
        }
      } catch (err) { /* ignore frame errors */ }
      livenessRafRef.current = requestAnimationFrame(tick);
    };
    livenessRafRef.current = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(livenessRafRef.current);
      clearTimeout(livenessTimeout.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stage]);

  // ── Step 5: extract descriptor from one live frame, then enroll ──────────
  useEffect(() => {
    if (stage !== "extracting") return;
    const faceapi = faceapiRef.current;
    const detectorOpts = new faceapi.TinyFaceDetectorOptions({ inputSize: 416, scoreThreshold: 0.55 });
    (async () => {
      try {
        const result = await faceapi
          .detectSingleFace(videoRef.current, detectorOpts)
          .withFaceLandmarks()
          .withFaceDescriptor();
        if (!result?.descriptor) {
          throw new Error(tt(lang, "لم نتعرف على وجهك", "לא זוהו פנים"));
        }
        cleanupCamera();
        setStage("enrolling");
        // Store the numeric signature server-side; the response carries the
        // first match results so the gallery shows in the same round trip.
        const resp = await enrollFaceDescriptor(token, Array.from(result.descriptor));
        if (cancelledRef.current) return;
        setMatches(resp?.matches ?? []);
        if (resp?.expiresAt) setExpiresAt(resp.expiresAt);
        setStage("done");
      } catch (err) {
        logErr("extractOrEnroll", err);
        if (cancelledRef.current) return;
        setStage("error");
        setError(
          err?.status === 409
            ? tt(lang, "الصور لم تُنشر بعد", "התמונות עוד לא פורסמו")
            : err?.status
              ? tt(lang, "فشل حفظ بصمة الوجه — حاول مجدداً", "שמירת חתימת הפנים נכשלה — נסה שוב")
              : err?.message || tt(lang, "خطأ في الاستخراج", "שגיאה בחילוץ"),
        );
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stage]);

  // ── Delete my face data ───────────────────────────────────────────────────
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

  function cleanupCamera() {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop());
      streamRef.current = null;
    }
    if (videoRef.current) videoRef.current.srcObject = null;
  }
  useEffect(() => () => { cancelledRef.current = true; cleanupCamera(); }, []);

  // ── Render ──────────────────────────────────────────────────────────────
  const cameraActive = stage === "requesting-camera" || stage === "liveness" || stage === "extracting";

  const expiryDateText = expiresAt
    ? new Date(expiresAt).toLocaleDateString(lang === "he" ? "he-IL" : "ar-EG",
        { day: "numeric", month: "long", year: "numeric", numberingSystem: "latn" })
    : null;

  // Guidance text that changes with what the guest needs to do right now.
  function guidanceText() {
    if (stage === "requesting-camera") return tt(lang, "جاري تشغيل الكاميرا... 📷", "מפעיל מצלמה... 📷");
    if (stage === "extracting")        return tt(lang, "تم التحقق بنجاح! ✓", "אומת בהצלחה! ✓");
    // liveness — one step at a time
    if (!faceDetected)
      return tt(lang, "ضع وجهك داخل الإطار 🙂", "מקם את פניך במסגרת 🙂");
    if (!livenessProgress.right)
      return tt(lang, "الخطوة 1: أدِر رأسك إلى اليمين ببطء 👉", "שלב 1: סובב ראשך ימינה לאט 👉");
    if (!livenessProgress.left)
      return tt(lang, "ممتاز ✓ — الخطوة 2: الآن أدِر رأسك إلى اليسار 👈", "מצוין ✓ — שלב 2: עכשיו סובב שמאלה 👈");
    return tt(lang, "تم التحقق ✓", "אומת ✓");
  }

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
              {tt(lang, "الصور لم تُنشر بعد من قِبل العريس",
                        "התמונות עוד לא פורסמו על-ידי החתן")}
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
              {tt(lang, "البحث عن صورك بالتعرف على الوجه", "חיפוש התמונות שלך בזיהוי פנים")}
            </div>
            <div style={{ fontSize: 13, color: C.dim, lineHeight: 2, marginBottom: 18 }}>
              <div>
                {tt(lang,
                  "📷 سنمسح وجهك بالكاميرا للعثور على كل الصور التي تظهر فيها — صورة الكاميرا تبقى في جهازك ولا تُرفع إطلاقاً.",
                  "📷 נסרוק את פניך במצלמה כדי למצוא את כל התמונות שאתה מופיע בהן — תמונת המצלמה נשארת במכשיר ולא נשלחת לעולם.")}
              </div>
              <div>
                {tt(lang,
                  "🔢 يُحفظ على خوادمنا «توقيع رقمي» للوجه فقط (سلسلة أرقام، وليست صورة) لمطابقة صور الحفل.",
                  "🔢 בשרתים נשמרת רק «חתימה מספרית» של הפנים (סדרת מספרים, לא תמונה) להתאמת תמונות האירוע.")}
              </div>
              {expiryDateText && (
                <div>
                  {tt(lang,
                    `🗓 يُحذف هذا التوقيع تلقائياً بتاريخ ${expiryDateText} مع انتهاء صلاحية الدعوة.`,
                    `🗓 החתימה נמחקת אוטומטית בתאריך ${expiryDateText} עם פקיעת ההזמנה.`)}
                </div>
              )}
              <div>
                {tt(lang,
                  "🗑 يمكنك حذف بصمة وجهك في أي وقت بزر الحذف داخل صفحة الصور.",
                  "🗑 ניתן למחוק את חתימת הפנים בכל עת בכפתור המחיקה בעמוד התמונות.")}
              </div>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              <button className="gold-btn" onClick={() => setStage("loading-models")}>
                {tt(lang, "أوافق — ابدأ المسح ✓", "אני מסכים — התחל סריקה ✓")}
              </button>
              <button onClick={() => navigate("..")} style={{
                background: "none", border: "1px solid rgba(255,255,255,.15)", color: C.dim,
                borderRadius: 10, padding: "10px 14px", cursor: "pointer", fontSize: 13,
              }}>
                {tt(lang, "رجوع", "חזרה")}
              </button>
            </div>
          </div>
        )}

        {stage === "loading-models" && <Status icon="⏳" text={tt(lang, "جاري تحميل مكتبة التعرف...", "טוען ספריית זיהוי...")} />}

        {cameraActive && (
          <div style={{ textAlign: "center" }}>
            <div style={{
              fontSize: 15, fontWeight: 800, marginBottom: 14, minHeight: 24,
              color: stage === "extracting" ? "#4cc97a" : C.goldLight,
            }}>
              {guidanceText()}
            </div>
            <div style={{ position: "relative", width: "100%", maxWidth: 360, margin: "0 auto", aspectRatio: "4/3" }}>
              <video ref={videoRef} autoPlay playsInline muted
                     style={{
                       position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover",
                       borderRadius: 18, border: "3px solid rgba(201,168,76,.5)",
                       transform: "scaleX(-1)", background: "#0b0b0f",
                     }}/>
              {/* Overlay canvas — same mirror as the video so the green box aligns. */}
              <canvas ref={canvasRef}
                      style={{
                        position: "absolute", inset: 0, width: "100%", height: "100%",
                        borderRadius: 18, transform: "scaleX(-1)", pointerEvents: "none",
                      }}/>
              {stage === "requesting-camera" && (
                <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 44 }}>📷</div>
              )}
            </div>
            {stage === "liveness" && (
              <div style={{ display: "flex", justifyContent: "center", gap: 16, marginTop: 16 }}>
                <LivenessIndicator done={livenessProgress.right} label={tt(lang, "👉 يمين", "👉 ימינה")}/>
                <LivenessIndicator done={livenessProgress.left}  label={tt(lang, "يسار 👈", "שמאלה 👈")}/>
              </div>
            )}
            <div style={{ fontSize: 11, color: C.dim, marginTop: 14, lineHeight: 1.7 }}>
              {tt(lang, "صورة الكاميرا لا تغادر جهازك — يُحفظ فقط توقيع رقمي للوجه للعثور على صورك",
                        "תמונת המצלמה לא עוזבת את המכשיר — נשמרת רק חתימה מספרית של הפנים לאיתור התמונות שלך")}
            </div>
          </div>
        )}

        {stage === "enrolling" && (
          <Status icon="🔍" text={tt(lang, "جاري حفظ بصمة الوجه والبحث عن صورك...", "שומר את חתימת הפנים ומחפש את התמונות שלך...")} />
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
                <div style={{ fontSize: 14, fontWeight: 800, color: C.gold, marginBottom: 14, textAlign: "center" }}>
                  {tt(lang, `وجدنا ${matches.length} صورة`, `מצאנו ${matches.length} תמונות`)}
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
              <button onClick={() => setStage("loading-models")} style={{
                background: "none", border: "1px solid rgba(201,168,76,.4)", color: C.goldLight,
                borderRadius: 10, padding: "9px 14px", cursor: "pointer", fontSize: 12, fontWeight: 700,
              }}>
                {tt(lang, "🔄 إعادة مسح وجهي", "🔄 סריקה מחדש")}
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
            <button onClick={() => { setError(""); setStage("loading-models"); }} className="gold-btn">
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

function LivenessIndicator({ done, label }) {
  return (
    <div style={{
      display: "flex", flexDirection: "column", alignItems: "center", gap: 4,
      padding: "8px 14px", borderRadius: 10,
      background: done ? "rgba(76,201,122,.12)" : "rgba(255,255,255,.04)",
      border: `1px solid ${done ? "rgba(76,201,122,.4)" : "rgba(255,255,255,.08)"}`,
      transition: "all .25s",
    }}>
      <div style={{ fontSize: 20 }}>{done ? "✓" : "·"}</div>
      <div style={{ fontSize: 10, fontWeight: 800, color: done ? "#4cc97a" : C.dim }}>{label}</div>
    </div>
  );
}

// Yaw estimation from 68-point landmarks.
//   Compare horizontal distance from nose-tip (idx 30) to the centre of each
//   eye corner. The face-api landmark indices are stable. Returns degrees;
//   positive = head turned to the user's right (camera-mirrored: visually left).
function estimateYaw(landmarks) {
  const pts = landmarks.positions;
  const noseTip = pts[30];
  const leftEye  = pts[36];
  const rightEye = pts[45];
  const eyeMid   = { x: (leftEye.x + rightEye.x) / 2, y: (leftEye.y + rightEye.y) / 2 };
  const eyeDist  = Math.hypot(rightEye.x - leftEye.x, rightEye.y - leftEye.y);
  const dx       = noseTip.x - eyeMid.x;
  // Normalised offset → approximate degrees. Empirically 1.0 ≈ 60°.
  return (dx / eyeDist) * 60;
}
