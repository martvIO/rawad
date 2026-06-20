// Lazy-loaded AWS Face Liveness capture. Imported via React.lazy() so the heavy
// Amplify bundle only loads when a guest actually picks the camera path.
//
// The detector streams the camera challenge to AWS; pass/fail confidence is
// fetched SERVER-SIDE (GET FaceLivenessSessionResults in the enroll endpoint),
// so this component only needs to know the session started and finished.
//
// The default Amplify UI is a light theme that clashes with the dark + gold
// page. We wrap the detector in a ThemeProvider mapped to our palette so its
// loading spinner, start screen, instruction overlay, and buttons match.
import { FaceLivenessDetector } from "@aws-amplify/ui-react-liveness";
import { ThemeProvider } from "@aws-amplify/ui-react";
import "@aws-amplify/ui-react/styles.css";
import { Amplify } from "aws-amplify";
import { COGNITO_IDENTITY_POOL_ID, LIVENESS_REGION } from "../utils/awsLiveness.js";

let configured = false;
function ensureConfigured() {
  if (configured || !COGNITO_IDENTITY_POOL_ID) return;
  Amplify.configure({
    Auth: { Cognito: { identityPoolId: COGNITO_IDENTITY_POOL_ID, allowGuestAccess: true } },
  });
  configured = true;
}

// Dawa palette mapped onto Amplify design tokens (see styles/theme.js · C).
const livenessTheme = {
  name: "dawa-liveness",
  tokens: {
    colors: {
      brand: {
        primary: {
          10:  { value: "rgba(201,168,76,.10)" },
          20:  { value: "rgba(201,168,76,.20)" },
          40:  { value: "#8a7430" },
          60:  { value: "#a8893a" },
          80:  { value: "#c9a84c" },
          90:  { value: "#dcc05a" },
          100: { value: "#f0c84c" },
        },
      },
      background: {
        primary:   { value: "#07070a" },
        secondary: { value: "#0c0c11" },
        tertiary:  { value: "#14141b" },
      },
      font: {
        primary:   { value: "#f5e6b8" },
        secondary: { value: "#c9a84c" },
        tertiary:  { value: "#a09070" },
        inverse:   { value: "#07070a" },
      },
      border: {
        primary:   { value: "rgba(201,168,76,.30)" },
        secondary: { value: "rgba(201,168,76,.18)" },
      },
    },
    components: {
      button: {
        primary: {
          backgroundColor: { value: "#c9a84c" },
          color: { value: "#07070a" },
          _hover: { backgroundColor: { value: "#f0c84c" }, color: { value: "#07070a" } },
          _focus: { backgroundColor: { value: "#f0c84c" }, color: { value: "#07070a" } },
          _active: { backgroundColor: { value: "#b89a42" }, color: { value: "#07070a" } },
        },
      },
      loader: {
        strokeEmpty:  { value: "rgba(201,168,76,.18)" },
        strokeFilled: { value: "#c9a84c" },
      },
    },
  },
};

// Localized copy for the most visible detector strings. Partial maps are safe —
// Amplify deep-merges with its English defaults, so any omitted key falls back.
const DISPLAY_TEXT = {
  ar: {
    startScreenBeginCheckText: "ابدأ فحص الكاميرا",
    photosensitivyWarningHeadingText: "تحذير حساسية الضوء",
    photosensitivyWarningBodyText:
      "يعرض هذا الفحص أضواءً وامضة. توخَّ الحذر إن كنت تعاني من حساسية للضوء.",
    photosensitivyWarningInfoText:
      "قد تسبّب نسبة قليلة من الأشخاص نوبات صرع عند التعرّض للأضواء الملوّنة الوامضة.",
    hintCenterFaceText: "ضع وجهك في منتصف الإطار",
    tryAgainText: "حاول مرة أخرى",
    cameraNotFoundHeadingText: "لم يتم العثور على كاميرا",
    cameraNotFoundMessageText: "تأكّد من توصيل كاميرا ومنح إذن الوصول إليها، ثم حدّث الصفحة.",
    retryCameraPermissionsText: "إعادة المحاولة",
    cancelLivenessCheckText: "إلغاء فحص الكاميرا",
  },
  he: {
    startScreenBeginCheckText: "התחל בדיקת מצלמה",
    photosensitivyWarningHeadingText: "אזהרת רגישות לאור",
    photosensitivyWarningBodyText:
      "בדיקה זו מציגה אורות מהבהבים. נהג בזהירות אם יש לך רגישות לאור.",
    photosensitivyWarningInfoText:
      "אצל אחוז קטן מהאנשים אורות צבעוניים מהבהבים עלולים לגרום להתקפים.",
    hintCenterFaceText: "מקם את הפנים במרכז המסגרת",
    tryAgainText: "נסה שוב",
    cameraNotFoundHeadingText: "לא נמצאה מצלמה",
    cameraNotFoundMessageText: "ודא שמחוברת מצלמה ושהענקת הרשאת גישה, ואז רענן את הדף.",
    retryCameraPermissionsText: "נסה שוב",
    cancelLivenessCheckText: "בטל בדיקת מצלמה",
  },
};

export default function LivenessCapture({ sessionId, region, lang, onComplete, onError, onCancel }) {
  ensureConfigured();
  return (
    <ThemeProvider theme={livenessTheme} colorMode="dark">
      <div style={{ maxWidth: 420, margin: "0 auto" }}>
        <FaceLivenessDetector
          sessionId={sessionId}
          region={region || LIVENESS_REGION}
          displayText={DISPLAY_TEXT[lang === "he" ? "he" : "ar"]}
          onAnalysisComplete={async () => {
            if (onComplete) await onComplete();
          }}
          onError={(err) => {
            if (onError) onError(err);
          }}
          onUserCancel={() => {
            if (onCancel) onCancel();
          }}
        />
      </div>
    </ThemeProvider>
  );
}
