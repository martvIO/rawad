// Login screen — username + password against @dawa/core's signIn().
import { useState } from "react";
import { useRouter } from "expo-router";
import { usePortal } from "../../src/portal/PortalContext.jsx";
import {
  Screen,
  Card,
  Heading,
  Caption,
  Field,
  PrimaryButton,
  TextLink,
  ErrorBanner,
} from "../../src/ui/components.jsx";

export default function Login() {
  const { t, login } = usePortal();
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const canSubmit = !busy && !!username.trim() && !!password;

  const onSubmit = async () => {
    if (!canSubmit) return;
    setBusy(true);
    setError("");
    try {
      const u = await login(username.trim(), password);
      if (u.mustChangePassword) router.replace("/change-password");
      else if (u.role !== "groom") router.replace("/not-a-groom");
      else router.replace("/dashboard");
    } catch (e) {
      setError(t("login_failed") || "تعذّر تسجيل الدخول. تحقّق من البيانات.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen>
      <Card>
        <Heading>{t("login_title") || "تسجيل الدخول"}</Heading>
        <Caption>{t("app_name") || "دعوة"}</Caption>
        <Field
          label={t("login_username") || "اسم المستخدم"}
          value={username}
          onChangeText={setUsername}
          testID="field-username"
        />
        <Field
          label={t("login_password") || "كلمة المرور"}
          value={password}
          onChangeText={setPassword}
          secureTextEntry
          testID="field-password"
        />
        <ErrorBanner message={error} testID="login-error" />
        <PrimaryButton
          title={t("login_submit") || "دخول"}
          onPress={onSubmit}
          disabled={!canSubmit}
          busy={busy}
          testID="btn-login"
        />
        <TextLink
          title={t("login_forgot") || "نسيت كلمة المرور؟"}
          onPress={() => router.push("/forgot-password")}
        />
      </Card>
    </Screen>
  );
}
