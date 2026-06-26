// Forced / self-service password change. The backend revokes refresh tokens on
// success, so we log out and bounce back to login afterward.
import { useState } from "react";
import { useRouter } from "expo-router";
import { usePortal } from "../../src/portal/PortalContext.jsx";
import { changePassword } from "@dawa/core/services/auth.js";
import { isStrongPassword } from "@dawa/core/utils/password.js";
import {
  Screen,
  Card,
  Heading,
  Caption,
  Field,
  PrimaryButton,
  ErrorBanner,
} from "../../src/ui/components.jsx";

export default function ChangePassword() {
  const { t, logout } = usePortal();
  const router = useRouter();
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const strong = isStrongPassword(next);
  const canSubmit = !busy && !!current && strong && next === confirm;

  const onSubmit = async () => {
    if (!canSubmit) return;
    setBusy(true);
    setError("");
    try {
      await changePassword(current, next);
      await logout(); // tokens were revoked server-side
      router.replace("/login");
    } catch (e) {
      setError(t("pwd_change_failed") || "تعذّر تغيير كلمة المرور.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen>
      <Card>
        <Heading>{t("pwd_change_title") || "تغيير كلمة المرور"}</Heading>
        <Caption>{t("pwd_change_hint") || "اختر كلمة مرور قوية جديدة."}</Caption>
        <Field
          label={t("pwd_current") || "كلمة المرور الحالية"}
          value={current}
          onChangeText={setCurrent}
          secureTextEntry
          testID="field-current"
        />
        <Field
          label={t("pwd_new") || "كلمة المرور الجديدة"}
          value={next}
          onChangeText={setNext}
          secureTextEntry
          testID="field-new"
        />
        <Field
          label={t("pwd_confirm") || "تأكيد كلمة المرور"}
          value={confirm}
          onChangeText={setConfirm}
          secureTextEntry
          testID="field-confirm"
        />
        <ErrorBanner message={error} testID="pwd-error" />
        <PrimaryButton
          title={t("save") || "حفظ"}
          onPress={onSubmit}
          disabled={!canSubmit}
          busy={busy}
          testID="btn-save-pwd"
        />
      </Card>
    </Screen>
  );
}
