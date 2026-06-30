// Shown when an admin/driver account logs in — this app is groom-only.
import { usePortal } from "../src/portal/PortalContext.jsx";
import { Screen, Card, Heading, Caption, PrimaryButton } from "../src/ui/components.jsx";

export default function NotAGroom() {
  const { t, logout } = usePortal();
  return (
    <Screen>
      <Card>
        <Heading>{t("only_grooms_title") || "هذا التطبيق للعرسان فقط"}</Heading>
        <Caption>
          {t("only_grooms_body") ||
            "يرجى استخدام لوحة الويب لحسابات الأدمن والسائقين."}
        </Caption>
        <PrimaryButton
          title={t("logout") || "تسجيل الخروج"}
          onPress={logout}
          testID="btn-logout"
        />
      </Card>
    </Screen>
  );
}
