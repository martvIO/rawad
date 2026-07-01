// Live invitation preview — a WebView that loads the web renderer at
// /preview/digital/:designId, so the design's WebGL 3D envelope + every section
// render on the device GPU (exactly what the guest sees). We seed the WebView's
// localStorage with the groom's tokens (peekTokens) BEFORE content loads so the
// web apiClient authenticates as the owner and can read the (still-draft) design.
// The ⤴ button captures the rendered preview (react-native-view-shot) and shares
// it via the OS sheet (expo-sharing) — e.g. to send guests a teaser.
import { useRef, useState } from "react";
import { View, Text, Pressable, ActivityIndicator, StyleSheet, Platform } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { WebView } from "react-native-webview";
import { captureRef } from "react-native-view-shot";
import * as Sharing from "expo-sharing";
import Constants from "expo-constants";
import { peekTokens } from "@dawa/core/utils/tokenManager.js";
import { usePortal } from "../../src/portal/PortalContext.jsx";
import { useToast } from "../../src/ui/Toast.jsx";
import { C, space, radius, type } from "../../src/ui/theme.js";

const WEB_BASE = Constants.expoConfig?.extra?.webBaseUrl || "https://dawa-aa793.web.app";

export default function DesignPreview() {
  const { id, lang: langParam } = useLocalSearchParams();
  const { lang } = usePortal();
  const he = (langParam || lang) === "he";
  const toast = useToast();
  const router = useRouter();
  const shotRef = useRef(null);
  const webRef = useRef(null);
  const [loading, setLoading] = useState(true);
  const [sharing, setSharing] = useState(false);
  const [routeError, setRouteError] = useState(false);

  const previewLang = langParam || lang || "ar";
  const uri = `${WEB_BASE}/preview/digital/${id}?lang=${previewLang}`;

  // Seed the WebView localStorage with the groom's session before the SPA boots.
  const { idToken, refreshToken, expiresAt, uid } = peekTokens();
  const injectBefore = `
    (function(){
      try {
        localStorage.setItem('dawa.idToken', ${JSON.stringify(idToken || "")});
        localStorage.setItem('dawa.refreshToken', ${JSON.stringify(refreshToken || "")});
        localStorage.setItem('dawa.expiresAt', ${JSON.stringify(String(expiresAt || 0))});
        localStorage.setItem('dawa.uid', ${JSON.stringify(uid || "")});
      } catch (e) {}
    })();
    true;
  `;

  // After the SPA boots, verify we actually landed on the preview route. If the
  // route isn't in the deployed build, React Router redirects to "/" (the landing
  // page) — poll the pathname briefly (it may redirect a few hundred ms after
  // load) and report back so we can show an error instead of silently displaying
  // the marketing site.
  const routeCheck = `
    (function(){
      var expected = '/preview/digital/';
      var tries = 0;
      (function check(){
        tries++;
        var p = window.location.pathname || '';
        if (p.indexOf(expected) !== 0) {
          window.ReactNativeWebView &&
            window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'wrong_route', path: p }));
          return;
        }
        if (tries < 8) setTimeout(check, 300);
      })();
    })();
    true;
  `;

  const onMessage = (e) => {
    try {
      const msg = JSON.parse(e.nativeEvent.data);
      if (msg?.type === "wrong_route") { setRouteError(true); setLoading(false); }
    } catch { /* ignore non-JSON postMessage payloads */ }
  };

  const retry = () => {
    setRouteError(false);
    setLoading(true);
    webRef.current?.reload();
  };

  const share = async () => {
    if (sharing) return;
    setSharing(true);
    try {
      const canShare = await Sharing.isAvailableAsync();
      if (!canShare) { toast.show(he ? "שיתוף לא זמין" : "المشاركة غير متاحة"); return; }
      const fileUri = await captureRef(shotRef, { format: "png", quality: 0.95, result: "tmpfile" });
      await Sharing.shareAsync(fileUri, { mimeType: "image/png", dialogTitle: he ? "שתף תצוגה" : "مشاركة المعاينة" });
    } catch {
      toast.show(he ? "שיתוף נכשל" : "تعذّرت المشاركة");
    } finally {
      setSharing(false);
    }
  };

  return (
    <View style={styles.screen}>
      <View style={styles.bar}>
        <Pressable onPress={() => router.back()} hitSlop={10}><Text style={styles.barBtn}>‹ {he ? "חזרה" : "رجوع"}</Text></Pressable>
        <Text style={styles.barTitle}>{he ? "תצוגה מקדימה" : "معاينة"}</Text>
        <Pressable onPress={share} hitSlop={10} disabled={sharing}>
          <Text style={[styles.barBtn, sharing && styles.dim]}>{sharing ? "…" : `⤴ ${he ? "שתף" : "مشاركة"}`}</Text>
        </Pressable>
      </View>
      <View style={styles.webWrap} ref={shotRef} collapsable={false}>
        <WebView
          ref={webRef}
          source={{ uri }}
          injectedJavaScriptBeforeContentLoaded={injectBefore}
          injectedJavaScript={routeCheck}
          onMessage={onMessage}
          onLoadEnd={() => setLoading(false)}
          originWhitelist={["*"]}
          javaScriptEnabled
          domStorageEnabled
          allowsInlineMediaPlayback
          mediaPlaybackRequiresUserAction={false}
          // Needed on Android so the WebGL <canvas> composites into the view-shot.
          {...(Platform.OS === "android" ? { androidLayerType: "hardware" } : {})}
          style={styles.web}
        />
        {loading && !routeError ? (
          <View style={styles.loading}>
            <ActivityIndicator color={C.gold} />
            <Text style={styles.loadingText}>{he ? "טוען תצוגה…" : "جاري تحميل المعاينة…"}</Text>
          </View>
        ) : null}
        {routeError ? (
          <View style={styles.errorBox}>
            <Text style={styles.errorTitle}>{he ? "טעינת התצוגה נכשלה" : "تعذّر تحميل المعاينة"}</Text>
            <Text style={styles.errorText}>
              {he ? "ודא שהאפליקציה מעודכנת ונסה שוב." : "تأكد من تحديث التطبيق وحاول مجدداً."}
            </Text>
            <Pressable style={styles.retryBtn} onPress={retry} hitSlop={8}>
              <Text style={styles.retryBtnText}>{he ? "נסה שוב" : "إعادة المحاولة"}</Text>
            </Pressable>
          </View>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: C.bg },
  bar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: space[4],
    paddingVertical: space[3],
    borderBottomColor: "rgba(201,168,76,0.2)",
    borderBottomWidth: 1,
    backgroundColor: "#0d0c08",
  },
  barBtn: { color: C.gold, fontSize: type.md, fontWeight: "800" },
  barTitle: { color: C.goldLight, fontSize: type.md, fontWeight: "800" },
  dim: { opacity: 0.5 },
  webWrap: { flex: 1, backgroundColor: C.bg },
  web: { flex: 1, backgroundColor: C.bg },
  loading: { ...StyleSheet.absoluteFillObject, alignItems: "center", justifyContent: "center", gap: space[2] },
  loadingText: { color: C.dim, fontSize: type.sm },
  errorBox: { ...StyleSheet.absoluteFillObject, alignItems: "center", justifyContent: "center", gap: space[3], padding: space[6], backgroundColor: C.bg },
  errorTitle: { color: C.goldLight, fontSize: type.xl, fontWeight: "800", textAlign: "center" },
  errorText: { color: C.dim, fontSize: type.sm, textAlign: "center", lineHeight: 20 },
  retryBtn: { marginTop: space[2], paddingHorizontal: space[5], paddingVertical: space[3], borderRadius: radius.pill, backgroundColor: C.gold },
  retryBtnText: { color: "#0d0c08", fontSize: type.md, fontWeight: "800" },
});
