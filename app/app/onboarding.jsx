// First-sign-in onboarding for a groom (the couple). Reached from the entry gate
// (index.jsx) and post-login (login.jsx) whenever the signed-in groom has no
// `onboardedAt` yet. The couple's names (+ optional wedding date) are stored on
// the account and pre-seed the first digital-invitation design, so Step 1 of the
// design wizard is effectively already done. Mirrors the web OnboardingScreen.
import { useState } from "react";
import { useRouter } from "expo-router";
import { usePortal } from "../src/portal/PortalContext.jsx";
import { submitOnboarding } from "@dawa/core/services/auth.js";
import {
  Screen,
  Card,
  Heading,
  Caption,
  Field,
  PrimaryButton,
  ErrorBanner,
} from "../src/ui/components.jsx";
import { DatePickerField } from "../src/ui/primitives.jsx";

export default function Onboarding() {
  const { lang, refreshUser } = usePortal();
  const he = lang === "he";
  const router = useRouter();
  const [groomName, setGroomName] = useState("");
  const [brideName, setBrideName] = useState("");
  const [weddingDate, setWeddingDate] = useState(null); // epoch ms
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const canSubmit = !busy && !!groomName.trim() && !!brideName.trim();

  const onSubmit = async () => {
    if (!canSubmit) return;
    setBusy(true);
    setError("");
    try {
      await submitOnboarding({ groomName: groomName.trim(), brideName: brideName.trim(), weddingDate });
      // Re-fetch /auth/me so the freshly-set onboardedAt clears the gate, then
      // land the couple on their dashboard.
      await refreshUser();
      router.replace("/dashboard");
    } catch (e) {
      setError(he ? "השמירה נכשלה, נסו שוב." : "تعذّر الحفظ، حاول مرة أخرى.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen>
      <Card>
        <Heading>{he ? "ברוכים הבאים 💛" : "أهلاً بكم 💛"}</Heading>
        <Caption>
          {he
            ? "ספרו לנו את שמות החתן והכלה כדי שנכין את ההזמנה הדיגיטלית אוטומטית."
            : "أخبرونا بأسماء العروسين لنجهّز دعوتكم الرقمية تلقائياً."}
        </Caption>
        <Field
          label={he ? "שם החתן" : "اسم العريس"}
          value={groomName}
          onChangeText={setGroomName}
          testID="onb-groom"
        />
        <Field
          label={he ? "שם הכלה" : "اسم العروس"}
          value={brideName}
          onChangeText={setBrideName}
          testID="onb-bride"
        />
        <DatePickerField
          label={he ? "תאריך החתונה (אופציונלי)" : "تاريخ الزفاف (اختياري)"}
          value={weddingDate}
          mode="datetime"
          onChange={setWeddingDate}
          placeholder={he ? "בחר תאריך" : "اختر التاريخ"}
        />
        <ErrorBanner message={error} testID="onb-error" />
        <PrimaryButton
          title={he ? "המשך →" : "متابعة →"}
          onPress={onSubmit}
          disabled={!canSubmit}
          busy={busy}
          testID="btn-onb-submit"
        />
      </Card>
    </Screen>
  );
}
