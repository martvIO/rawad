// "صورك" — Face-recognition page reached from the digital invitation landing.
// Route: /d/:groomUsername/:token/photos
//
// Strict workflow:
//   1. Resolve token → groomUid.
//   2. Read digitalInvitations/{groomUid}.photographerPublished. If false, show
//      a notice and BLOCK camera + matching entirely.
//   3. Load face-api.js models from /models (same origin, lazy-loaded).
//   4. Open the front camera (getUserMedia). NO file upload fallback.
//   5. Liveness: guest must turn head left AND right (yaw > +15° and < -15°)
//      within 12s — protects against photo spoofing.
//   6. Extract a single descriptor from the live stream.
//   7. Fetch photographer files (public read enforced by Firestore rules).
//   8. For each photo, detect all faces, compute descriptors, compare to the
//      guest descriptor (euclideanDistance ≤ 0.5 = match). All client-side.
//   9. Render matched photos.
import { useEffect, useRef, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { subscribeInviteToken } from "../services/invites.js";
import { getDigitalInvitationPublic, fetchPublishedPhotographerFiles } from "../services/digitalInvitation.js";
import { LangSwitcher } from "../components/LangSwitcher.jsx";
import { logErr } from "../utils/logger.js";
import { C } from "../styles/theme.js";

const MATCH_THRESHOLD     = 0.5;     // face-api default; lower = stricter
const LIVENESS_TIMEOUT_MS = 12000;   // max time to complete the head-turn
const YAW_TRIGGER_DEG     = 15;      // degrees of yaw required on each side
const MAX_PHOTOS_TO_SCAN  = 80;      // cap to keep mobile UX bearable

export function DigitalYourPhotos({ lang, setLang }) {
  const { token } = useParams();
  const navigate = useNavigate();

  // ── State machine ────────────────────────────────────────────────────────
  // "loading"           → resolving token + publish flag
  // "not-published"     → block message
  // "loading-models"    → fetching face-api models from /models
  // "requesting-camera" → asking for camera permission
  // "liveness"          → user turning head left/right
  // "extracting"        → grabbing the guest descriptor
  // "matching"          → scanning photographer files
  // "done"              → results gallery
  // "error"             → fatal error
  const [stage, setStage]    = useState("loading");
  const [error, setError]    = useState("");
  const [groomUid, setGroomUid] = useState(null);
  const [livenessProgress, setLivenessProgress] = useState({ left: false, right: false });
  const [faceDetected, setFaceDetected] = useState(false);
  const [matchProgress, setMatchProgress] = useState({ done: 0, total: 0 });
  const [matches, setMatches] = useState([]);

  const videoRef        = useRef(null);
  const canvasRef       = useRef(null);
  const streamRef       = useRef(null);
  const faceapiRef      = useRef(null);
  const livenessRafRef  = useRef(0);
  const livenessTimeout = useRef(null);
  const cancelledRef    = useRef(false);
  // True once we've routed into the camera flow. The token endpoint is POLLED
  // (fires every few seconds even when unchanged), so without this guard the
  // callback would keep calling setStage("loading-models") and restart the
  // whole camera flow in a loop. We decide the stage once; later polls only
  // refresh groomUid.
  const routedRef       = useRef(false);

  // ── Step 1: resolve token + publish flag ────────────────────────────────
  useEffect(() => {
    if (!token) { setStage("error"); setError(tt(lang, "رابط غير صالح", "קישור לא תקין")); return; }
    cancelledRef.current = false;
    routedRef.current = false;
    const unsub = subscribeInviteToken(token, async (rec) => {
      if (cancelledRef.current) return;
      if (!rec) {
        if (!routedRef.current) { setStage("error"); setError(tt(lang, "رابط غير صالح", "קישור לא תקין")); }
        return;
      }
      const uid = rec.groomUid;
      setGroomUid(uid);
      if (routedRef.current) return;            // already in the camera flow — don't restart it
      const doc = await getDigitalInvitationPublic(uid).catch(() => null);
      if (cancelledRef.current || routedRef.current) return;
      if (!doc || doc.photographerPublished !== true) {
        setStage("not-published");              // keep polling — advances once the groom publishes
      } else {
        routedRef.current = true;               // lock: the camera flow now owns the stage
        setStage("loading-models");
      }
    });
    return () => { cancelledRef.current = true; unsub(); cleanupCamera(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  // ── Step 2: load face-api models once published is confirmed ────────────
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
  useEffect(() => {
    if (stage !== "liveness") return;
    const faceapi = faceapiRef.current;
    let left = false, right = false;
    setLivenessProgress({ left, right });
    setFaceDetected(false);
    bindStream(); // ensure the stream is attached before we start reading frames

    livenessTimeout.current = setTimeout(() => {
      cancelAnimationFrame(livenessRafRef.current);
      setStage("error");
      setError(tt(lang, "انتهت مهلة الفحص — حاول مرة أخرى", "תם הזמן — נסה שוב"));
    }, LIVENESS_TIMEOUT_MS);

    const detectorOpts = new faceapi.TinyFaceDetectorOptions({ inputSize: 224, scoreThreshold: 0.5 });

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
          if (yaw < -YAW_TRIGGER_DEG) left  = true;
          if (yaw >  YAW_TRIGGER_DEG) right = true;
          setLivenessProgress({ left, right });
          if (left && right) {
            cancelAnimationFrame(livenessRafRef.current);
            clearTimeout(livenessTimeout.current);
            setStage("extracting");
            return;
          }
        } else {
          setFaceDetected(false);
          drawOverlay(null);                   // clear the overlay when no face is visible
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

  // ── Step 5: extract guest descriptor from a single live frame ───────────
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
        // Kick off matching with the descriptor we just extracted.
        matchAgainstGallery(result.descriptor);
      } catch (err) {
        logErr("extractDescriptor", err);
        setStage("error");
        setError(err?.message || tt(lang, "خطأ في الاستخراج", "שגיאה בחילוץ"));
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stage]);

  // ── Step 6: fetch photographer files + match each one ───────────────────
  const matchAgainstGallery = async (guestDescriptor) => {
    setStage("matching");
    const faceapi = faceapiRef.current;
    try {
      const allFiles = await fetchPublishedPhotographerFiles(groomUid);
      // Only images can be face-matched; skip videos / other.
      const photos = allFiles
        .filter(f => (f.type || "").startsWith("image"))
        .slice(0, MAX_PHOTOS_TO_SCAN);

      setMatchProgress({ done: 0, total: photos.length });
      if (photos.length === 0) {
        setStage("done");
        return;
      }

      const detectorOpts = new faceapi.TinyFaceDetectorOptions({ inputSize: 416, scoreThreshold: 0.5 });
      const found = [];
      for (let i = 0; i < photos.length; i++) {
        if (cancelledRef.current) return;
        const photo = photos[i];
        try {
          const img = await loadImage(photo.url);
          const results = await faceapi
            .detectAllFaces(img, detectorOpts)
            .withFaceLandmarks()
            .withFaceDescriptors();
          for (const r of results) {
            const dist = faceapi.euclideanDistance(guestDescriptor, r.descriptor);
            if (dist <= MATCH_THRESHOLD) {
              found.push({ ...photo, distance: dist });
              break;
            }
          }
        } catch (err) {
          // photo failed to load or face-detect — skip silently
        }
        setMatchProgress({ done: i + 1, total: photos.length });
      }
      found.sort((a, b) => a.distance - b.distance);
      setMatches(found);
      setStage("done");
    } catch (err) {
      logErr("matchAgainstGallery", err);
      setStage("error");
      setError(err?.message || tt(lang, "خطأ في البحث", "שגיאה בחיפוש"));
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

  // Guidance text that changes with what the guest needs to do right now.
  function guidanceText() {
    if (stage === "requesting-camera") return tt(lang, "جاري تشغيل الكاميرا... 📷", "מפעיל מצלמה... 📷");
    if (stage === "extracting")        return tt(lang, "تم التحقق بنجاح! ✓", "אומת בהצלחה! ✓");
    // liveness
    if (!faceDetected)
      return tt(lang, "ضع وجهك داخل الإطار 🙂", "מקם את פניך במסגרת 🙂");
    if (!livenessProgress.right && !livenessProgress.left)
      return tt(lang, "أدِر رأسك ببطء يميناً ثم يساراً 🟢", "סובב את ראשך לאט ימינה ואז שמאלה 🟢");
    if (!livenessProgress.right)
      return tt(lang, "التفت لليمين الآن 🟢 →", "פנה ימינה עכשיו 🟢 →");
    if (!livenessProgress.left)
      return tt(lang, "ممتاز! الآن التفت لليسار 🟢 ←", "מצוין! עכשיו פנה שמאלה 🟢 ←");
    return tt(lang, "تم! ✓", "בוצע! ✓");
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
                <LivenessIndicator done={livenessProgress.left}  label={tt(lang, "← يسار", "← שמאלה")}/>
                <LivenessIndicator done={livenessProgress.right} label={tt(lang, "يمين →", "ימינה →")}/>
              </div>
            )}
            <div style={{ fontSize: 11, color: C.dim, marginTop: 14, lineHeight: 1.7 }}>
              {tt(lang, "كل المعالجة تجري في متصفحك فقط — لا تُرفع صورتك إلى أي مكان",
                        "כל העיבוד מתבצע בדפדפן שלך בלבד — תמונתך לא נשלחת לשום מקום")}
            </div>
          </div>
        )}

        {stage === "matching" && (
          <div style={{ textAlign: "center" }}>
            <div style={{ fontSize: 44, marginBottom: 8 }}>🔍</div>
            <div style={{ fontSize: 14, fontWeight: 800, color: C.goldLight, marginBottom: 14 }}>
              {tt(lang, "جاري البحث عن صورك...", "מחפש את התמונות שלך...")}
            </div>
            <div style={{
              width: "100%", maxWidth: 360, margin: "0 auto",
              height: 10, background: "rgba(255,255,255,.06)", borderRadius: 5, overflow: "hidden",
            }}>
              <div style={{
                height: "100%",
                width: `${matchProgress.total ? Math.round(matchProgress.done / matchProgress.total * 100) : 0}%`,
                background: "linear-gradient(90deg,#c9a84c,#f0c84c)",
                transition: "width .3s",
              }}/>
            </div>
            <div style={{ fontSize: 11, color: C.dim, marginTop: 8 }}>
              {matchProgress.done.toLocaleString("en")} / {matchProgress.total.toLocaleString("en")}
            </div>
          </div>
        )}

        {stage === "done" && (
          matches.length === 0 ? (
            <div className="card" style={{ textAlign: "center", padding: 32, color: C.dim }}>
              <div style={{ fontSize: 48, marginBottom: 10 }}>🔍</div>
              {tt(lang, "لم نجد صوراً لك بعد", "לא נמצאו תמונות שלך עדיין")}
            </div>
          ) : (
            <>
              <div style={{ fontSize: 14, fontWeight: 800, color: C.gold, marginBottom: 14, textAlign: "center" }}>
                {tt(lang, `وجدنا ${matches.length} صورة`, `מצאנו ${matches.length} תמונות`)}
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(120px,1fr))", gap: 6 }}>
                {matches.map(m => (
                  <a key={m.id} href={m.url} target="_blank" rel="noreferrer">
                    <img src={m.url} alt=""
                         style={{ width: "100%", aspectRatio: "1", objectFit: "cover", borderRadius: 10,
                                  border: "1px solid rgba(201,168,76,.25)" }}/>
                  </a>
                ))}
              </div>
            </>
          )
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

function loadImage(url) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload  = () => resolve(img);
    img.onerror = () => reject(new Error("image load failed"));
    img.src = url;
  });
}
