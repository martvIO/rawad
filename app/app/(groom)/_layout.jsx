// Groom section shell — bottom Tabs (Dashboard · Guests · Manage), wrapped by
// the Toast + digital-data providers so all three tabs share one polling context.
// help/terms are registered here but hidden from the tab bar (push-only from the
// per-screen header kebab). Each screen renders its own ScreenHeader (the Tabs
// header is hidden).
import { Tabs } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { usePortal } from "../../src/portal/PortalContext.jsx";
import { ToastProvider } from "../../src/ui/Toast.jsx";
import { DigitalProvider } from "../../src/portal/useGroomDigital.jsx";
import { C, type } from "../../src/ui/theme.js";

const tabIcon =
  (name) =>
  ({ color, size }) =>
    <Ionicons name={name} size={size} color={color} />;

export default function GroomLayout() {
  const { t, user } = usePortal();
  const canUsePhotographer = user?.canUsePhotographer !== false;
  return (
    <ToastProvider>
      <DigitalProvider>
        <Tabs
          screenOptions={{
            headerShown: false,
            tabBarActiveTintColor: C.gold,
            tabBarInactiveTintColor: C.dim,
            tabBarStyle: {
              backgroundColor: "#0d0c08",
              borderTopColor: "rgba(201,168,76,0.2)",
            },
            tabBarLabelStyle: { fontSize: type.xs, fontWeight: "700" },
          }}
        >
          <Tabs.Screen
            name="dashboard"
            options={{ title: t("tab_dashboard") || "الرئيسية", tabBarIcon: tabIcon("home-outline") }}
          />
          <Tabs.Screen
            name="guests"
            options={{ title: t("tab_guests") || "المدعوون", tabBarIcon: tabIcon("people-outline") }}
          />
          <Tabs.Screen
            name="photographer"
            options={{
              title: t("tab_photographer") || "المصور",
              tabBarIcon: tabIcon("camera-outline"),
              // Hidden from the tab bar (and unreachable) when the account can't use it.
              href: canUsePhotographer ? undefined : null,
            }}
          />
          <Tabs.Screen
            name="design"
            options={{ title: t("tab_design") || "التصميم", tabBarIcon: tabIcon("color-palette-outline") }}
          />
          <Tabs.Screen
            name="manage"
            options={{ title: t("tab_manage") || "إدارة", tabBarIcon: tabIcon("settings-outline") }}
          />
          <Tabs.Screen name="help" options={{ href: null }} />
          <Tabs.Screen name="terms" options={{ href: null }} />
          <Tabs.Screen name="add-guest" options={{ href: null }} />
          <Tabs.Screen name="design-preview" options={{ href: null }} />
        </Tabs>
      </DigitalProvider>
    </ToastProvider>
  );
}
