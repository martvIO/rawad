// Placeholder groom dashboard — proves the authed shell renders. Real digital
// dashboard (stats, RSVPs, photographer, design editor) comes in Phase 2+.
import { usePortal } from "../../src/portal/PortalContext.jsx";
import {
  Screen,
  Card,
  Heading,
  Caption,
  PrimaryButton,
} from "../../src/ui/components.jsx";

export default function Dashboard() {
  const { t, user, logout } = usePortal();
  return (
    <Screen>
      <Card>
        <Heading>{t("portal_groom") || "بوابة العريس"}</Heading>
        <Caption>{user?.displayName || user?.username || ""}</Caption>
        <Caption>{t("groom_dashboard_soon") || "لوحة التحكم قيد الإنشاء…"}</Caption>
        <PrimaryButton
          title={t("logout") || "تسجيل الخروج"}
          onPress={logout}
          testID="btn-logout"
        />
      </Card>
    </Screen>
  );
}
