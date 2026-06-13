// Driver → Share-Location tab
// يتيح للمرسل اختيار العرسان الذين يريد مشاركة موقعه الحيّ معهم،
// ثمّ تفعيل / إيقاف البثّ بزرّ واحد.
//
// تدفّق البيانات:
//   1. groomProfiles (من RTDB /groomProfiles) — قائمة كل العرسان المتاحين.
//   2. liveShareWith (state في useGeolocation) — قائمة uid العرسان المختارين.
//   3. saveLiveLocation() / stopLiveLocation() — يبدآن/يوقفان watchPosition
//      ويكتبان في /liveLocationsByGroom/{groomUid}/{driverUid}.
import { usePortal } from "../../../context/PortalContext.jsx";
import { GroomMultiSelect } from "../../../components/GroomMultiSelect.jsx";
import { C } from "../../../styles/theme.js";

export function DriverShareLocation() {
  const {
    t, lang,
    groomProfiles,
    liveShareWith, setLiveShareWith,
    driverIsSharing,
    driverGeoPermission, driverGeoError,
    driverCoords,
    saveLiveLocation, stopLiveLocation,
  } = usePortal();

  const canShare   = liveShareWith.length > 0;
  const isSharing  = driverIsSharing;
  const hasPermission = driverGeoPermission === "granted";

  return (
    <div style={{ animation: "fadeUp .3s ease" }}>

      {/* ── عنوان القسم ────────────────────────────────────────────── */}
      <div style={{ marginBottom: 20 }}>
        <div style={{ fontSize: 19, fontWeight: 900, color: C.blue, fontFamily: "'Amiri','Frank Ruhl Libre',serif", marginBottom: 4 }}>
          📍 {lang === "he" ? "שיתוף מיקום עם חתנים" : "مشاركة موقعي مع العرسان"}
        </div>
        <div style={{ fontSize: 12, color: C.dim, lineHeight: 1.7 }}>
          {lang === "he"
            ? "בחר את החתנים שיוכלו לראות את המיקום שלך על המפה בזמן אמת. לחץ על כפתור ירוק להתחלת השיתוף."
            : "اختر العرسان الذين يستطيعون رؤية موقعك على الخريطة. فقط المختارون سيرون موقعك. اضغط ابدأ المشاركة لبدء البثّ."}
        </div>
      </div>

      {/* ── حالة البثّ الحالية ───────────────────────────────────────── */}
      {isSharing && (
        <div style={{
          marginBottom: 16, padding: "12px 14px", borderRadius: 12,
          background: "rgba(76,201,122,.07)", border: "1px solid rgba(76,201,122,.28)",
          display: "flex", alignItems: "center", gap: 10,
        }}>
          <span style={{ fontSize: 20 }}>🟢</span>
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 800, color: "#4cc97a", fontSize: 13 }}>
              {lang === "he" ? "משדר עכשיו…" : "جارٍ البثّ الآن…"}
            </div>
            {driverCoords && (
              <div style={{ fontSize: 10, color: C.dim, direction: "ltr", textAlign: "right", marginTop: 2 }}>
                {driverCoords.lat.toFixed(5)}, {driverCoords.lng.toFixed(5)}
                {driverCoords.accuracy ? ` · ±${driverCoords.accuracy}m` : ""}
              </div>
            )}
            <div style={{ fontSize: 11, color: "#4cc97a", marginTop: 3 }}>
              {lang === "he"
                ? `שיתוף עם ${liveShareWith.length} חתן${liveShareWith.length !== 1 ? "ים" : ""}`
                : `تتشارك مع ${liveShareWith.length.toLocaleString("en")} ${liveShareWith.length === 1 ? "عريس" : "عرسان"}`}
            </div>
          </div>
        </div>
      )}

      {/* ── خطأ إذن الموقع ───────────────────────────────────────────── */}
      {driverGeoPermission === "denied" && driverGeoError && (
        <div style={{
          marginBottom: 14, padding: "10px 14px", borderRadius: 10,
          background: "rgba(212,80,58,.07)", border: "1px solid rgba(212,80,58,.28)",
          fontSize: 12, color: C.red,
        }}>
          ⚠ {driverGeoError}
        </div>
      )}

      {/* ── اختيار العرسان ───────────────────────────────────────────── */}
      {!isSharing && (
        <div style={{
          background: "rgba(255,255,255,.02)", borderRadius: 14,
          border: "1px solid rgba(255,255,255,.07)", padding: "16px 14px", marginBottom: 16,
        }}>
          <GroomMultiSelect
            grooms={groomProfiles}
            selected={liveShareWith}
            onChange={setLiveShareWith}
            label={lang === "he" ? "בחר חתנים לשיתוף המיקום:" : "اختر العرسان لمشاركة الموقع معهم:"}
            placeholder={lang === "he" ? "חיפוש חתן…" : "البحث عن عريس…"}
            emptyText={lang === "he" ? "אין חתנים רשומים" : "لا يوجد عرسان مسجّلون"}
            t={t}
            lang={lang}
          />
        </div>
      )}

      {/* ── عرض المختارين أثناء البثّ ───────────────────────────────── */}
      {isSharing && liveShareWith.length > 0 && (
        <div style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 12, color: C.goldDim, fontWeight: 700, marginBottom: 8 }}>
            {lang === "he" ? "חתנים שמקבלים את המיקום:" : "العرسان الذين يرون موقعك:"}
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
            {liveShareWith.map(uid => {
              const g = groomProfiles.find(x => x.uid === uid);
              return g ? (
                <span key={uid} style={{
                  padding: "4px 12px", borderRadius: 20, fontSize: 12,
                  background: "rgba(76,201,122,.12)", color: "#4cc97a",
                  border: "1px solid rgba(76,201,122,.3)", fontWeight: 700,
                  direction: "ltr",
                }}>
                  🟢 @{g.username}
                </span>
              ) : null;
            })}
          </div>
        </div>
      )}

      {/* ── أزرار البثّ ─────────────────────────────────────────────── */}
      {!isSharing ? (
        <button
          onClick={saveLiveLocation}
          disabled={!canShare}
          style={{
            width: "100%", padding: 14, borderRadius: 12,
            background: canShare
              ? "linear-gradient(135deg,rgba(76,201,122,.9),rgba(40,170,90,.9))"
              : "rgba(255,255,255,.05)",
            color: canShare ? "#fff" : "#5a5040",
            border: "none", fontWeight: 900, fontSize: 15, fontFamily: "inherit",
            cursor: canShare ? "pointer" : "not-allowed",
            transition: "all .2s",
          }}
        >
          {!canShare
            ? (lang === "he" ? "בחר חתן אחד לפחות" : "اختر عريساً واحداً على الأقل")
            : `📡 ${lang === "he" ? "התחל שיתוף מיקום" : "ابدأ مشاركة الموقع"} (${liveShareWith.length})`}
        </button>
      ) : (
        <button
          onClick={stopLiveLocation}
          style={{
            width: "100%", padding: 14, borderRadius: 12,
            background: "rgba(212,80,58,.85)",
            color: "#fff", border: "none",
            fontWeight: 900, fontSize: 15, fontFamily: "inherit",
            cursor: "pointer", transition: "all .2s",
          }}
        >
          ■ {lang === "he" ? "עצור שיתוף" : "إيقاف المشاركة"}
        </button>
      )}

      {/* ── ملاحظة خصوصية ───────────────────────────────────────────── */}
      <div style={{
        marginTop: 16, padding: "10px 14px", borderRadius: 10,
        background: "rgba(255,255,255,.02)", border: "1px solid rgba(255,255,255,.06)",
        fontSize: 11, color: "#5a5040", lineHeight: 1.7, textAlign: "center",
      }}>
        🔒 {lang === "he"
          ? "המיקום שלך גלוי אך ורק לחתנים שבחרת. לחתנים אחרים אין גישה."
          : "موقعك مرئيّ فقط للعرسان الذين اخترتهم. لا يستطيع أحد غيرهم رؤيته."}
      </div>
    </div>
  );
}
