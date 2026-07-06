// Shown when an admin/driver account logs in — this app is groom-only.
import { useRouter } from "expo-router";
import { usePortal } from "../src/portal/PortalContext.jsx";
import { Screen, Card, Heading, Caption, PrimaryButton } from "../src/ui/components.jsx";

export default function NotAGroom() {
  const { t, logout } = usePortal();
  const router = useRouter();
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
          onPress={async () => {
            await logout();
            router.replace("/login");
          }}
          testID="btn-logout"
        />
      </Card>
    </Screen>
  );
}
