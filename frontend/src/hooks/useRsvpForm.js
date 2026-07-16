import { useEffect, useState } from "react";
import { confettiBurst } from "../components/digital/inviteShared.jsx";
import { haptic } from "../utils/haptics.js";
import { localizeApiError } from "../utils/apiError.js";
import { isCompletePhone } from "../components/PhoneInput.jsx";

// RSVP state/validation/submit logic — lifted out of the classic template's
// InviteRsvp.jsx so every template's RSVP visual (old and new) shares one
// already-validated implementation of the party-size/meal/song/phone state,
// the submit contract, and the confetti/hearts celebration, instead of each
// bespoke template re-deriving it. A template's RSVP component only needs to
// build its own JSX around the values/setters this hook returns.
export function useRsvpForm({ guestPhone, opts, theme, lang, onSubmitRsvp, rsvpDone, disabled }) {
  const [status, setStatus] = useState(null); // "attending" | "absent"
  // Total headcount INCLUDING the invited guest (min 1). The backend still
  // stores `companions` = partySize - 1 (people besides the guest), so all
  // existing "expected attendees" totals and validation stay correct.
  const [partySize, setPartySize] = useState(1);
  const [phone, setPhone] = useState(guestPhone || "");
  const [meal, setMeal] = useState("");
  const [song, setSong] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);
  const [hearts, setHearts] = useState([]);

  // Pre-fill the phone from the invite token, but let the guest correct it.
  useEffect(() => { setPhone(guestPhone || ""); }, [guestPhone]);

  const submit = async () => {
    if (!status) {
      setError(lang === "he" ? "אנא בחרו תשובה" : "يرجى اختيار إجابة");
      return;
    }
    const phoneClean = (phone || "").trim();
    if (!isCompletePhone(phoneClean)) {
      setError(lang === "he" ? "אנא הזינו מספר טלפון תקין" : "يرجى إدخال رقم هاتف صحيح");
      return;
    }
    setError("");
    if (disabled) return;
    setBusy(true);
    try {
      await onSubmitRsvp?.({
        rsvp: status,
        note: note.trim(),
        submittedPhone: phoneClean,
        companions: status === "attending" && opts.companions ? Math.max(0, partySize - 1) : null,
        mealPreference: status === "attending" && opts.meal ? meal : "",
        songRequest: status === "attending" && opts.song ? song.trim() : "",
      });
      setDone(true);
      if (status === "attending") {
        confettiBurst([
          theme.gradientStops[0], theme.gradientStops[1], theme.gradientStops[2],
          theme.accent, theme.monoStops[0], theme.monoStops[1],
        ]);
        haptic(10); // light tap confirming the RSVP landed (attending only, like the confetti)
        const newH = Array.from({ length: 8 }, (_, i) => ({
          id: Date.now() + i,
          left: 40 + Math.random() * 20,
          hx: (Math.random() - 0.5) * 200,
          delay: i * 0.15,
        }));
        setHearts(newH);
        setTimeout(() => setHearts([]), 3500);
      }
    } catch (e) {
      setError(localizeApiError(e, lang));
    } finally {
      setBusy(false);
    }
  };

  const showDone = done || rsvpDone;
  const successText = status === "absent"
    ? (lang === "he" ? "תודה שהודעת. נתראה בהזדמנות אחרת." : "نشكر إعلامكم، ونلتقي في مناسبة أخرى قريبة.")
    : (lang === "he"
      ? `שמחים לארח אתכם${opts.companions && partySize > 1 ? ` (${partySize} אורחים)` : ""}. נתראה באירוע!`
      : `سعداء بحضوركم${opts.companions && partySize > 1 ? ` (${partySize} أشخاص)` : ""}. ننتظركم في الحفل!`);

  return {
    status, setStatus,
    partySize, setPartySize,
    phone, setPhone,
    meal, setMeal,
    song, setSong,
    note, setNote,
    busy, error, done, hearts,
    showDone, successText,
    submit,
  };
}
