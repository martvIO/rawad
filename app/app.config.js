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
    // RTL: both Arabic and Hebrew render right-to-left (see app/_layout.jsx).
    ios: {
      bundleIdentifier: "to.dawa.app",
      supportsTablet: false,
      backgroundColor: "#07070a",
    },
    android: {
      package: "to.dawa.app",
      backgroundColor: "#07070a",
      adaptiveIcon: { backgroundColor: "#07070a" },
    },
    plugins: [
      "expo-router",
      "expo-secure-store",
      "expo-font",
      [
        "expo-image-picker",
        {
          photosPermission:
            "تتيح لك دعوة اختيار صور وفيديوهات من معرض هاتفك لرفعها إلى دعوتك.",
          cameraPermission:
            "تتيح لك دعوة التقاط صور بالكاميرا لإضافتها إلى دعوتك أو معرض المصوّر.",
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
      apiBaseUrl: "https://api-je74slt7ra-uc.a.run.app",
      sseBaseUrl: "https://api-je74slt7ra-uc.a.run.app",
      inviteBaseUrl: "https://invite.dawa.to",
      contactWhatsapp: "972529348797",
      // Firebase Hosting SPA — serves the web renderer the design-preview WebView
      // loads at /preview/digital/:designId (auth via injected tokens).
      webBaseUrl: "https://dawa-aa793.web.app",
    },
  },
};
