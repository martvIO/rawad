// Groom "Manage wedding" screen — the self-serve home for the wedding lifecycle:
// cancel (with grace-period undo) and postpone/resume. Reads its own status via
// the lifecycle hook and refetches after each transition. Admin-gated actions
// (true deletion, restore-from-cancelled) are NOT here — those live with the admin.
import { useState } from "react";
import { usePortal } from "../../../context/PortalContext.jsx";
import { useGroomLifecycle } from "../../../hooks/useGroomLifecycle.js";
import {
  requestCancellation,
  undoCancellation,
  pauseWedding,
  resumeWedding,
} from "../../../services/lifecycle.js";
import { localizeApiError } from "../../../utils/apiError.js";
import { logErr } from "../../../utils/logger.js";
import { C } from "../../../styles/theme.js";

const STATE_COLOR = {
  active: "#4cc97a",
  cancel_pending: C.red,
  cancelled: C.red,
  paused: "#f0c84c",
};

export function GroomManage() {
  const { t, lang } = usePortal();
  const { status, data, loading, reload } = useGroomLifecycle();
  const [reason, setReason] = useState("");
  const [confirming, setConfirming] = useState(false);
  const [newDate, setNewDate] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const run = async (fn) => {
    setBusy(true);
    setErr("");
    try {
      await fn();
      reload();
      setConfirming(false);
      setReason("");
      setNewDate("");
    } catch (e) {
      logErr("lifecycle", e);
      setErr(localizeApiError(e, t, t("lc_action_failed")));
    } finally {
      setBusy(false);
    }
  };

  const stateLabel =
    {
      active: t("lc_state_active"),
      cancel_pending: t("lc_state_cancel_pending"),
      cancelled: t("lc_state_cancelled"),
      paused: t("lc_state_paused"),
    }[status] || status;

  const graceStr =
    typeof data?.cancelGraceEndsAt === "number"
      ? new Date(data.cancelGraceEndsAt).toLocaleString()
      : null;

  return (
    <div style={{ maxWidth: 560, margin: "0 auto" }}>
      <h1 style={{ fontFamily: "'Amiri','Frank Ruhl Libre',serif", color: C.gold, fontSize: 22, marginBottom: 6 }}>
        {t("lc_title")}
      </h1>
      <p style={{ color: C.dim, fontSize: 13, lineHeight: 1.8, marginBottom: 18 }}>{t("lc_subtitle")}</p>

      {/* Current status chip */}
      <div className="gold-card" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
        <span style={{ fontSize: 13, color: C.goldDim }}>{t("lc_current_status")}</span>
        <span
          data-testid="lc-current-state"
          style={{
            fontSize: 12, fontWeight: 800, padding: "4px 12px", borderRadius: 20,
            color: STATE_COLOR[status] || C.dim,
            border: `1px solid ${STATE_COLOR[status] || C.dim}55`,
            background: `${STATE_COLOR[status] || C.dim}14`,
          }}
        >
          {loading ? "…" : stateLabel}
        </span>
      </div>

      {err && (
        <div role="alert" style={{ color: C.red, fontSize: 12, marginBottom: 12, textAlign: "center" }}>
          {err}
        </div>
      )}

      {/* ── cancel_pending: undo only ── */}
      {status === "cancel_pending" && (
        <div className="gold-card" style={{ borderColor: "rgba(212,80,58,.3)" }}>
          <div style={{ fontSize: 13, color: C.red, fontWeight: 700, lineHeight: 1.7, marginBottom: 6 }}>
            {t("lc_pending_banner")}
          </div>
          {graceStr && (
            <div style={{ fontSize: 12, color: C.dim, marginBottom: 14 }}>
              {t("lc_grace_until")}: {graceStr}
            </div>
          )}
          <button
            data-testid="lc-undo-btn"
            disabled={busy}
            onClick={() => run(() => undoCancellation())}
            className="gold-btn"
            style={{ width: "100%" }}
          >
            {t("lc_undo_btn")}
          </button>
        </div>
      )}

      {/* ── cancelled: read-only message ── */}
      {status === "cancelled" && (
        <div className="gold-card" style={{ borderColor: "rgba(212,80,58,.3)" }}>
          <div style={{ fontSize: 13, color: C.red, fontWeight: 700, lineHeight: 1.8 }}>
            {t("lc_cancelled_banner")}
          </div>
        </div>
      )}

      {/* ── paused: resume ── */}
      {status === "paused" && (
        <div className="gold-card" style={{ marginBottom: 16, borderColor: "rgba(255,180,80,.3)" }}>
          <div style={{ fontSize: 13, color: "#f0c84c", fontWeight: 700, lineHeight: 1.7, marginBottom: 14 }}>
            {t("lc_paused_banner")}
          </div>
          <button
            data-testid="lc-resume-btn"
            disabled={busy}
            onClick={() => run(() => resumeWedding())}
            className="gold-btn"
            style={{ width: "100%" }}
          >
            {t("lc_resume_btn")}
          </button>
        </div>
      )}

      {/* ── active (or paused): postpone + cancel sections ── */}
      {(status === "active" || status === "paused") && (
        <>
          {status === "active" && (
            <div className="gold-card" style={{ marginBottom: 16 }}>
              <div style={{ fontSize: 14, fontWeight: 800, color: C.gold, marginBottom: 6 }}>{t("lc_postpone_title")}</div>
              <p style={{ fontSize: 12, color: C.dim, lineHeight: 1.7, marginBottom: 12 }}>{t("lc_postpone_desc")}</p>
              <label style={{ display: "block", fontSize: 12, color: C.goldDim, marginBottom: 6 }}>{t("lc_new_date")}</label>
              <input
                type="datetime-local"
                className="input-field"
                value={newDate}
                onChange={(e) => setNewDate(e.target.value)}
                style={{ marginBottom: 12, colorScheme: "dark" }}
              />
              <button
                data-testid="lc-pause-btn"
                disabled={busy}
                onClick={() => run(() => pauseWedding(newDate ? new Date(newDate).getTime() : null))}
                style={{
                  width: "100%", padding: "10px 0", borderRadius: 10,
                  background: "rgba(255,180,80,.08)", border: "1px solid rgba(255,180,80,.32)",
                  color: "#f0c84c", fontSize: 13, fontWeight: 800, fontFamily: "inherit",
                  cursor: busy ? "wait" : "pointer",
                }}
              >
                {t("lc_pause_btn")}
              </button>
            </div>
          )}

          <div className="gold-card" style={{ borderColor: "rgba(212,80,58,.25)" }}>
            <div style={{ fontSize: 14, fontWeight: 800, color: C.red, marginBottom: 6 }}>{t("lc_cancel_title")}</div>
            <p style={{ fontSize: 12, color: C.dim, lineHeight: 1.7, marginBottom: 12 }}>{t("lc_cancel_desc")}</p>
            <label style={{ display: "block", fontSize: 12, color: C.goldDim, marginBottom: 6 }}>{t("lc_cancel_reason")}</label>
            <textarea
              data-testid="lc-cancel-reason"
              className="input-field"
              rows={2}
              value={reason}
              onChange={(e) => setReason(e.target.value.slice(0, 500))}
              style={{ marginBottom: 12, resize: "vertical", minHeight: 56, fontFamily: "inherit" }}
            />
            {!confirming ? (
              <button
                data-testid="lc-cancel-btn"
                disabled={busy}
                onClick={() => setConfirming(true)}
                style={{
                  width: "100%", padding: "10px 0", borderRadius: 10,
                  background: "rgba(212,80,58,.08)", border: "1px solid rgba(212,80,58,.35)",
                  color: C.red, fontSize: 13, fontWeight: 800, fontFamily: "inherit", cursor: "pointer",
                }}
              >
                {t("lc_cancel_btn")}
              </button>
            ) : (
              <div>
                <div style={{ fontSize: 13, color: C.red, fontWeight: 700, textAlign: "center", marginBottom: 10 }}>
                  {t("lc_cancel_confirm")}
                </div>
                <div style={{ display: "flex", gap: 8 }}>
                  <button
                    data-testid="lc-cancel-confirm"
                    disabled={busy}
                    onClick={() => run(() => requestCancellation(reason))}
                    style={{
                      flex: 1, padding: "10px 0", borderRadius: 10, background: C.red,
                      border: "none", color: "#fff", fontSize: 13, fontWeight: 800,
                      fontFamily: "inherit", cursor: busy ? "wait" : "pointer",
                    }}
                  >
                    {t("lc_yes_cancel")}
                  </button>
                  <button
                    disabled={busy}
                    onClick={() => setConfirming(false)}
                    style={{
                      flex: 1, padding: "10px 0", borderRadius: 10,
                      background: "rgba(255,255,255,.05)", border: "1px solid rgba(255,255,255,.15)",
                      color: C.dim, fontSize: 13, fontWeight: 700, fontFamily: "inherit", cursor: "pointer",
                    }}
                  >
                    {t("lc_no_keep")}
                  </button>
                </div>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
