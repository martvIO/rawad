// Guests tab — placeholder shell (real content built next: list, search/filter,
// status cycle, inline edit, delete, CSV).
import { View, StyleSheet } from "react-native";
import { ScreenHeader } from "../../src/ui/ScreenHeader.jsx";
import { Screen, Card, Caption } from "../../src/ui/components.jsx";
import { usePortal } from "../../src/portal/PortalContext.jsx";
import { C } from "../../src/ui/theme.js";

export default function Guests() {
  const { t } = usePortal();
  return (
    <View style={styles.screen}>
      <ScreenHeader title={t("tab_guests") || "المدعوون"} />
      <Screen>
        <Card>
          <Caption>{t("guests_soon") || "قائمة المدعوين قيد الإنشاء…"}</Caption>
        </Card>
      </Screen>
    </View>
  );
}

const styles = StyleSheet.create({ screen: { flex: 1, backgroundColor: C.bg } });
