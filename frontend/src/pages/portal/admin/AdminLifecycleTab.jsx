// Admin lifecycle inbox — every non-active groom account (cancellation pending,
// cancelled, or postponed), with the two admin actions: finalise a pending
// cancellation now, or restore any frozen account to active. Loads on open and
// refetches after each action.
import { useCallback, useEffect, useState } from "react";
import { usePortal } from "../../../context/PortalContext.jsx";
import {
  listLifecyclePending,
  confirmCancellation,
  restoreWedding,
} from "../../../services/lifecycle.js";
import { localizeApiError } from "../../../utils/apiError.js";
import { logErr } from "../../../utils/logger.js";
import { C } from "../../../styles/theme.js";

const STATE_COLOR = {
  cancel_pending: C.red,
  cancelled: C.red,
  paused: "#f0c84c",
};

export function AdminLifecycleTab() {
  const { t, showToast } = usePortal();
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busyUid, setBusyUid] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await listLifecyclePending();
      setRows(Array.isArray(r) ? r : []);
    } catch (e) {
      logErr("listLifecyclePending", e);
      showToast(localizeApiError(e, t, t("adm_lc_action_failed")));
    } finally {
      setLoading(false);
    }
  }, [t, showToast]);

  useEffect(() => {
    load();
  }, [load]);

  const act = async (uid, fn) => {
    setBusyUid(uid);
    try {
      await fn(uid);
      await load();
    } catch (e) {
      logErr("lifecycle-admin", e);
      showToast(localizeApiError(e, t, t("adm_lc_action_failed")));
    } finally {
      setBusyUid(null);
    }
  };

  const stateLabel = (s) =>
    ({
      cancel_pending: t("lc_state_cancel_pending"),
      cancelled: t("lc_state_cancelled"),
      paused: t("lc_state_paused"),
    }[s] || s);

  return (
    <div>
      <h2 style={{ fontFamily: "'Amiri','Frank Ruhl Libre','Amiri Fallback',serif", color: C.gold, fontSize: 18, marginBottom: 14 }}>
        {t("adm_lc_title")}
      </h2>

      {loading ? (
        <div className="card" style={{ textAlign: "center", padding: 24, color: C.dim }}>…</div>
      ) : rows.length === 0 ? (
        <div data-testid="adm-lc-empty" className="card" style={{ textAlign: "center", padding: 24, color: C.dim }}>
          {t("adm_lc_empty")}
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {rows.map((r) => {
            const color = STATE_COLOR[r.lifecycleStatus] || C.dim;
            const graceStr =
              typeof r.cancelGraceEndsAt === "number" ? new Date(r.cancelGraceEndsAt).toLocaleString() : null;
            return (
              <div key={r.uid} className="gold-card" data-testid={`adm-lc-row-${r.uid}`}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, marginBottom: 8 }}>
                  <span style={{ fontWeight: 800, color: C.gold, fontSize: 14 }}>
                    {r.displayName || r.username}
                    <span style={{ color: C.dim, fontWeight: 600, fontSize: 12, marginInlineStart: 6 }}>@{r.username}</span>
                  </span>
                  <span
                    style={{
                      fontSize: 11, fontWeight: 800, padding: "3px 10px", borderRadius: 16,
                      color, border: `1px solid ${color}55`, background: `${color}14`,
                    }}
                  >
                    {stateLabel(r.lifecycleStatus)}
                  </span>
                </div>

                {r.cancelReason && (
                  <div style={{ fontSize: 12, color: C.dim, marginBottom: 6, lineHeight: 1.6 }}>
                    {t("adm_lc_reason")}: {r.cancelReason}
                  </div>
                )}
                {graceStr && (
                  <div style={{ fontSize: 12, color: C.dim, marginBottom: 10 }}>
                    {t("adm_lc_grace_ends")}: {graceStr}
                  </div>
                )}

                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  {r.lifecycleStatus === "cancel_pending" && (
                    <button
                      data-testid={`adm-lc-confirm-${r.uid}`}
                      disabled={busyUid === r.uid}
                      onClick={() => act(r.uid, confirmCancellation)}
                      style={{
                        flex: 1, minWidth: 130, padding: "9px 0", borderRadius: 9, background: C.red,
                        border: "none", color: "#fff", fontSize: 12, fontWeight: 800,
                        fontFamily: "inherit", cursor: busyUid === r.uid ? "wait" : "pointer",
                      }}
                    >
                      {t("adm_lc_confirm_now")}
                    </button>
                  )}
                  <button
                    data-testid={`adm-lc-restore-${r.uid}`}
                    disabled={busyUid === r.uid}
                    onClick={() => act(r.uid, restoreWedding)}
                    style={{
                      flex: 1, minWidth: 130, padding: "9px 0", borderRadius: 9,
                      background: "rgba(76,201,122,.08)", border: "1px solid rgba(76,201,122,.32)",
                      color: "#4cc97a", fontSize: 12, fontWeight: 800, fontFamily: "inherit",
                      cursor: busyUid === r.uid ? "wait" : "pointer",
                    }}
                  >
                    {t("adm_lc_restore")}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
