// Guest-facing notice shown on any public invite/confirm page when the wedding
// is cancelled or postponed (the groom account is frozen). Neutral by design —
// no reasons, no embarrassing detail — and it replaces the RSVP/confirm form so
// no replies are collected against a frozen event.
import { C } from "../styles/theme.js";

/**
 * @param {{ state: "cancelled"|"postponed", t: (k:string)=>string,
 *           lang?: string, pausedNewDate?: number|null }} props
 */
export function EventUnavailableNotice({ state, t, lang, pausedNewDate }) {
  const postponed = state === "postponed";
  const icon = postponed ? "🗓️" : "🚫";
  const title = postponed ? t("ev_postponed_title") : t("ev_cancelled_title");
  const body = postponed ? t("ev_postponed_body") : t("ev_cancelled_body");
  const dateStr =
    postponed && typeof pausedNewDate === "number"
      ? new Date(pausedNewDate).toLocaleDateString(lang === "he" ? "he" : "ar-EG", {
          year: "numeric",
          month: "long",
          day: "numeric",
        })
      : null;

  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 24,
        background: C.bg,
      }}
    >
      <div role="status" aria-live="polite" style={{ maxWidth: 460, width: "100%", textAlign: "center" }}>
        <div style={{ fontSize: 60, marginBottom: 14 }} aria-hidden>{icon}</div>
        <h1
          data-testid="event-unavailable-title"
          style={{ fontFamily: "'Amiri','Frank Ruhl Libre','Amiri Fallback',serif", color: C.gold, fontSize: 25, marginBottom: 12 }}
        >
          {title}
        </h1>
        <p style={{ color: "rgba(245,230,184,.8)", fontSize: 14, lineHeight: 1.9 }}>{body}</p>
        {dateStr && (
          <p style={{ color: C.gold, fontSize: 14, marginTop: 10, fontWeight: 700 }}>
            {t("ev_new_date")}: {dateStr}
          </p>
        )}
      </div>
    </div>
  );
}
