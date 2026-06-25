// Capacitor native-shell initialization. Every call is a no-op on the web
// (Capacitor.isNativePlatform() === false), so importing this in a browser
// build is harmless. Plugins are dynamically imported so the web build never
// pulls native-only code into the main chunk.
import { Capacitor } from "@capacitor/core";

export async function initNative() {
  if (!Capacitor.isNativePlatform()) return;

  // Status bar: light text on our dark (#07070a) background. In
  // @capacitor/status-bar, Style.Dark means "light text for dark backgrounds".
  try {
    const { StatusBar, Style } = await import("@capacitor/status-bar");
    await StatusBar.setStyle({ style: Style.Dark });
    if (Capacitor.getPlatform() === "android") {
      await StatusBar.setBackgroundColor({ color: "#07070a" });
    }
  } catch {
    /* status bar is cosmetic — never break boot over it */
  }

  // Android hardware back button: navigate back within the SPA, or exit at the
  // root instead of killing the WebView to a blank screen.
  try {
    const { App } = await import("@capacitor/app");
    App.addListener("backButton", ({ canGoBack }) => {
      if (canGoBack || window.history.length > 1) window.history.back();
      else App.exitApp();
    });
  } catch {
    /* back-button handling is best-effort */
  }
}
