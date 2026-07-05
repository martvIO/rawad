// Dynamic Expo config for the Dawa groom app.
//
// Public build-time URLs live in `extra` (committed — they are not secrets; the
// web app's same values are public). The native env adapter
// (src/adapters/native/env.js) maps these to the VITE_* keys @dawa/core's
// config/index.js expects.
export default {
  expo: {
    name: "Dawa",
    slug: "dawa-groom",
    scheme: "dawa",
    version: "1.0.0",
    orientation: "portrait",
    userInterfaceStyle: "dark",
    backgroundColor: "#07070a",
    // Brand icon/splash derived from the gold دعوة seal (frontend favicon).
    icon: "./assets/icon.png",
    // RTL: both Arabic and Hebrew render right-to-left (see app/_layout.jsx).
    ios: {
      bundleIdentifier: "to.dawa.app",
      supportsTablet: false,
      backgroundColor: "#07070a",
      // HTTPS-only + RSA password envelope = standard exemption; pre-answers the
      // App Store Connect encryption question.
      infoPlist: { ITSAppUsesNonExemptEncryption: false },
    },
    android: {
      package: "to.dawa.app",
      backgroundColor: "#07070a",
      adaptiveIcon: {
        foregroundImage: "./assets/adaptive-icon.png",
        backgroundColor: "#07070a",
      },
      // expo-contacts injects WRITE_CONTACTS (app only reads); SYSTEM_ALERT_WINDOW
      // comes from the template and triggers Play Console scrutiny — neither is used.
      blockedPermissions: [
        "android.permission.WRITE_CONTACTS",
        "android.permission.SYSTEM_ALERT_WINDOW",
      ],
    },
    plugins: [
      "expo-router",
      "expo-secure-store",
      "expo-font",
      [
        "expo-splash-screen",
        {
          image: "./assets/splash-icon.png",
          resizeMode: "contain",
          backgroundColor: "#07070a",
          imageWidth: 220,
        },
      ],
      [
        "expo-image-picker",
        {
          photosPermission:
            "تتيح لك دعوة اختيار صور وفيديوهات من معرض هاتفك لرفعها إلى دعوتك.",
          cameraPermission:
            "تتيح لك دعوة التقاط صور بالكاميرا لإضافتها إلى دعوتك أو معرض المصوّر.",
          // Both launchCameraAsync calls are images-only — no mic needed; this
          // drops RECORD_AUDIO (Android) and the NSMicrophoneUsageDescription key.
          microphonePermission: false,
        },
      ],
      [
        "expo-contacts",
        {
          contactsPermission:
            "تتيح لك دعوة اختيار مدعوين من جهات الاتصال في هاتفك لإضافتهم إلى قائمتك.",
        },
      ],
    ],
    experiments: { typedRoutes: false },
    extra: {
      // Absolute Cloud Run URLs (native fetch sends no Origin, so CORS passes).
      // DAWA_* env vars (read at config-eval time) override for local emulator QA —
      // e.g. DAWA_API_BASE_URL=http://127.0.0.1:5001/dawa-aa793/us-central1/api
      // (iOS sim) or http://10.0.2.2:5001/... (Android emulator). See .env.example.
      apiBaseUrl: process.env.DAWA_API_BASE_URL || "https://api-je74slt7ra-uc.a.run.app",
      sseBaseUrl:
        process.env.DAWA_SSE_BASE_URL ||
        process.env.DAWA_API_BASE_URL ||
        "https://api-je74slt7ra-uc.a.run.app",
      inviteBaseUrl: "https://invite.dawa.to",
      contactWhatsapp: "972529348797",
      // Firebase Hosting SPA — serves the web renderer the design-preview WebView
      // loads at /preview/digital/:designId (auth via injected tokens).
      webBaseUrl: process.env.DAWA_WEB_BASE_URL || "https://dawa-aa793.web.app",
    },
  },
};
