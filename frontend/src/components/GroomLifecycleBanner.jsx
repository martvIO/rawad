// Slim banner shown on every groom tab when the wedding is not active
// (cancellation pending, cancelled, or postponed). Links to the Manage screen
// where the groom can undo / resume. Reads its own status via the lifecycle hook.
import { Link } from "react-router-dom";
import { C } from "../styles/theme.js";
import { useGroomLifecycle } from "../hooks/useGroomLifecycle.js";

export function GroomLifecycleBanner({ t, managePath }) {
  const { status, data } = useGroomLifecycle();
  if (status === "active") return null;

  const cfg = {
    cancel_pending: {
      color: C.red, bg: "rgba(212,80,58,.10)", border: "rgba(212,80,58,.32)",
      text: t("lc_pending_banner"),
    },
    cancelled: {
      color: C.red, bg: "rgba(212,80,58,.14)", border: "rgba(212,80,58,.4)",
      text: t("lc_cancelled_banner"),
    },
    paused: {
      color: "#f0c84c", bg: "rgba(255,180,80,.08)", border: "rgba(255,180,80,.28)",
      text: t("lc_paused_banner"),
    },
  }[status];
  if (!cfg) return null;

  const graceStr =
    status === "cancel_pending" && typeof data?.cancelGraceEndsAt === "number"
      ? new Date(data.cancelGraceEndsAt).toLocaleString()
      : null;

  return (
    <div style={{ maxWidth: 900, margin: "12px auto 0", padding: "0 16px" }}>
      <div
        data-testid="groom-lifecycle-banner"
        style={{
          display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap",
          padding: "10px 14px", borderRadius: 10, background: cfg.bg,
          border: `1px solid ${cfg.border}`,
        }}
      >
        <span style={{ fontSize: 13, color: cfg.color, fontWeight: 700, flex: 1, minWidth: 200, lineHeight: 1.6 }}>
          {cfg.text}
          {graceStr ? ` (${t("lc_grace_until")} ${graceStr})` : ""}
        </span>
        <Link
          to={managePath}
          style={{ fontSize: 12, fontWeight: 800, color: cfg.color, textDecoration: "underline", whiteSpace: "nowrap" }}
        >
          {t("lc_open_manage")}
        </Link>
      </div>
    </div>
  );
}
