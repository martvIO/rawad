// Root layout — RTL bootstrap + providers + the router slot.
import { I18nManager } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { Slot } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { PortalProvider } from "../src/portal/PortalContext.jsx";

// Both Arabic and Hebrew render right-to-left, matching the web app's hardcoded
// dir="rtl". Set as early as possible. (The very first forceRTL on a fresh
// install needs one app reload to fully flip native layout — acceptable for v1.)
I18nManager.allowRTL(true);
if (!I18nManager.isRTL) {
  I18nManager.forceRTL(true);
}

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <StatusBar style="light" />
      <PortalProvider>
        <Slot />
      </PortalProvider>
    </SafeAreaProvider>
  );
}
