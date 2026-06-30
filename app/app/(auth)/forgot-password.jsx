// Phase-1 minimal forgot-password. The full SMS-OTP + reCAPTCHA reset flow needs
// a native reCAPTCHA strategy (Phase 2); for now route the user to WhatsApp
// support so no one is stranded.
import { useRouter } from "expo-router";
import { Linking } from "react-native";
import { usePortal } from "../../src/portal/PortalContext.jsx";
import { CONTACT } from "@dawa/core/config/index.js";
import {
  Screen,
  Card,
  Heading,
  Caption,
  PrimaryButton,
  TextLink,
} from "../../src/ui/components.jsx";

export default function ForgotPassword() {
  const { t } = usePortal();
  const router = useRouter();
  const wa = CONTACT.WHATSAPP;

  return (
    <Screen>
      <Card>
        <Heading>{t("login_forgot") || "نسيت كلمة المرور؟"}</Heading>
        <Caption>
          {t("fr_native_hint") ||
            "للمساعدة في استعادة كلمة المرور، تواصل معنا عبر واتساب."}
        </Caption>
        <PrimaryButton
          title={t("contact_whatsapp") || "تواصل عبر واتساب"}
          onPress={() => Linking.openURL(`https://wa.me/${wa}`)}
          testID="btn-whatsapp"
        />
        <TextLink title={t("back") || "رجوع"} onPress={() => router.back()} />
      </Card>
    </Screen>
  );
}
