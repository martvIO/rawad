// Entry route — gates on auth readiness, then redirects to the right place.
import { Redirect } from "expo-router";
import { View, ActivityIndicator, StyleSheet } from "react-native";
import { usePortal } from "../src/portal/PortalContext.jsx";
import { C } from "../src/ui/theme.js";

export default function Index() {
  const { authReady, user } = usePortal();

  if (!authReady) {
    return (
      <View style={styles.splash}>
        <ActivityIndicator color={C.gold} size="large" />
      </View>
    );
  }
  if (!user) return <Redirect href="/login" />;
  if (user.mustChangePassword) return <Redirect href="/change-password" />;
  if (user.role !== "groom") return <Redirect href="/not-a-groom" />;
  if (!user.onboardedAt) return <Redirect href="/onboarding" />;
  return <Redirect href="/dashboard" />;
}

const styles = StyleSheet.create({
  splash: {
    flex: 1,
    backgroundColor: C.bg,
    alignItems: "center",
    justifyContent: "center",
  },
});
