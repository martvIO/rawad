// Manage tab — placeholder shell (real content built next: lifecycle state
// machine — postpone / pause / cancel / undo).
import { View, StyleSheet } from "react-native";
import { ScreenHeader } from "../../src/ui/ScreenHeader.jsx";
import { Screen, Card, Caption } from "../../src/ui/components.jsx";
import { usePortal } from "../../src/portal/PortalContext.jsx";
import { C } from "../../src/ui/theme.js";

export default function Manage() {
  const { t } = usePortal();
  return (
    <View style={styles.screen}>
      <ScreenHeader title={t("tab_manage") || "إدارة"} />
      <Screen>
        <Card>
          <Caption>{t("manage_soon") || "الإدارة قيد الإنشاء…"}</Caption>
        </Card>
      </Screen>
    </View>
  );
}

const styles = StyleSheet.create({ screen: { flex: 1, backgroundColor: C.bg } });
