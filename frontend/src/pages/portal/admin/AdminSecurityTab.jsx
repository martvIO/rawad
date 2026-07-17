// Admin → Security. Monitors the threat feed (auth/brute-force, authorization
// abuse, rate-limit/flood, malformed input, blocks) with filters, and lets the
// admin block/unblock accounts, IPs, and device fingerprints. Backed by
// /admin/security (see backend routes/security.ts).
import { useEffect, useState, useCallback } from "react";
import { usePortal } from "../../../context/PortalContext.jsx";
import { C } from "../../../styles/theme.js";
import {
  getSecurityEvents,
  getSecuritySummary,
  getSecurityBlocks,
  blockEntity,
  unblockEntity,
  resolveSecurityEvent,
} from "../../../services/security.js";
import { localizeApiError } from "../../../utils/apiError.js";

const EVENT_TYPES = [
  "auth_failure", "account_lockout", "invalid_token", "otp_abuse",
  "authz_denied", "rate_limited", "malformed_input", "path_scan",
  "blocked_request", "manual_block", "manual_unblock", "auto_block",
];
const SEVERITIES = ["critical", "high", "medium", "low", "info"];

function sevColor(sev) {
  switch (sev) {
    case "critical": return "#ff5a5a";
    case "high": return "#ff8a4c";
    case "medium": return "#f0c84c";
    case "low": return C.dim;
    default: return C.dim;
  }
}

function fmtTime(ts) {
  if (!ts) return "";
  try {
    return new Date(ts).toLocaleString("en-GB", {
      day: "2-digit", month: "2-digit", year: "numeric",
      hour: "2-digit", minute: "2-digit", numberingSystem: "latn",
    });
  } catch { return String(ts); }
}

export function AdminSecurityTab() {
  const { lang, showToast } = usePortal();
  const L = (ar, he) => (lang === "he" ? he : ar);

  const [events, setEvents] = useState(null);
  const [summary, setSummary] = useState(null);
  const [blocks, setBlocks] = useState(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [fType, setFType] = useState("");
  const [fSev, setFSev] = useState("");
  const [fResolved, setFResolved] = useState("");

  // Manual block form.
  const [mKind, setMKind] = useState("ip");
  const [mValue, setMValue] = useState("");
  const [mDuration, setMDuration] = useState(""); // "" = permanent
  const [mReason, setMReason] = useState("");

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const filters = { limit: 200 };
      if (fType) filters.type = fType;
      if (fSev) filters.severity = fSev;
      if (fResolved) filters.resolved = fResolved;
      const [ev, sm, bl] = await Promise.all([
        getSecurityEvents(filters),
        getSecuritySummary(),
        getSecurityBlocks(),
      ]);
      setEvents(Array.isArray(ev) ? ev : []);
      setSummary(sm);
      setBlocks(bl);
    } catch (e) {
      showToast(localizeApiError(e, lang));
      setEvents([]);
    } finally {
      setLoading(false);
    }
  }, [fType, fSev, fResolved, lang, showToast]);

  useEffect(() => { reload(); }, [reload]);

  const doBlock = async (kind, value, opts = {}) => {
    if (!value) return;
    if (kind === "account" &&
        !window.confirm(L(
          `حظر الحساب ${value}؟ سيتم تعطيله وإنهاء جلساته فوراً.`,
          `לחסום את החשבון ${value}? הוא יושבת והפעלות שלו יסתיימו מיד.`))) {
      return;
    }
    setBusy(true);
    try {
      await blockEntity(kind, value, opts);
      showToast(L("تم الحظر", "נחסם"));
      await reload();
    } catch (e) {
      showToast(localizeApiError(e, lang));
    } finally {
      setBusy(false);
    }
  };

  const doUnblock = async (kind, value) => {
    setBusy(true);
    try {
      await unblockEntity(kind, value);
      showToast(L("تم رفع الحظر", "החסימה הוסרה"));
      await reload();
    } catch (e) {
      showToast(localizeApiError(e, lang));
    } finally {
      setBusy(false);
    }
  };

  const doResolve = async (id) => {
    setBusy(true);
    try {
      await resolveSecurityEvent(id);
      await reload();
    } catch (e) {
      showToast(localizeApiError(e, lang));
    } finally {
      setBusy(false);
    }
  };

  const submitManualBlock = async (e) => {
    e.preventDefault();
    const durationMs = mDuration ? Number(mDuration) : undefined;
    await doBlock(mKind, mValue.trim(), { reason: mReason.trim() || undefined, durationMs });
    setMValue(""); setMReason("");
  };

  const selectStyle = {
    background: "rgba(255,255,255,.05)", color: C.gold,
    border: "1px solid rgba(255,255,255,.12)", borderRadius: 8,
    padding: "6px 10px", fontSize: 12, fontFamily: "inherit",
  };

  return (
    <div style={{ animation: "fadeUp .3s ease" }} data-testid="admin-security">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
        <div style={{ fontSize: 16, fontWeight: 900, color: C.gold, fontFamily: "'Amiri','Frank Ruhl Libre','Amiri Fallback',serif" }}>
          🛡 {L("مراقبة الأمان", "ניטור אבטחה")}
        </div>
        <button className="ghost-btn" style={{ padding: "6px 14px", fontSize: 12 }} onClick={reload} disabled={loading || busy}>
          {loading ? "…" : L("تحديث", "רענן")}
        </button>
      </div>

      {/* Summary */}
      {summary && (
        <div className="card" style={{ padding: "12px 14px", marginBottom: 14, display: "flex", flexWrap: "wrap", gap: 14 }}>
          <Stat label={L("غير معالَجة", "לא טופלו")} value={summary.unresolved} color={summary.unresolved ? "#ff8a4c" : C.dim} />
          {SEVERITIES.map((s) => (
            <Stat key={s} label={s} value={summary.bySeverity?.[s] || 0} color={sevColor(s)} />
          ))}
          <Stat label={L("حسابات محظورة", "חשבונות חסומים")} value={summary.blockedCounts?.accounts || 0} color="#ff5a5a" />
          <Stat label={L("IP محظور", "IP חסומים")} value={summary.blockedCounts?.ips || 0} color="#ff5a5a" />
          <Stat label={L("بصمات محظورة", "טביעות חסומות")} value={summary.blockedCounts?.fingerprints || 0} color="#ff5a5a" />
        </div>
      )}

      {/* Filters */}
      <div style={{ display: "flex", gap: 8, marginBottom: 14, flexWrap: "wrap" }}>
        <select data-testid="sec-filter-type" value={fType} onChange={(e) => setFType(e.target.value)} style={selectStyle}>
          <option value="">{L("كل الأنواع", "כל הסוגים")}</option>
          {EVENT_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
        </select>
        <select data-testid="sec-filter-severity" value={fSev} onChange={(e) => setFSev(e.target.value)} style={selectStyle}>
          <option value="">{L("كل الخطورة", "כל החומרות")}</option>
          {SEVERITIES.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
        <select data-testid="sec-filter-resolved" value={fResolved} onChange={(e) => setFResolved(e.target.value)} style={selectStyle}>
          <option value="">{L("الكل", "הכול")}</option>
          <option value="false">{L("غير معالَجة", "לא טופלו")}</option>
          <option value="true">{L("معالَجة", "טופלו")}</option>
        </select>
      </div>

      {/* Active blocks */}
      <BlocksPanel blocks={blocks} L={L} busy={busy} onUnblock={doUnblock} />

      {/* Manual block form */}
      <form onSubmit={submitManualBlock} className="card" style={{ padding: "12px 14px", marginBottom: 14, display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
        <span style={{ fontSize: 12, fontWeight: 800, color: C.goldLight }}>{L("حظر يدوي", "חסימה ידנית")}:</span>
        <select value={mKind} onChange={(e) => setMKind(e.target.value)} style={selectStyle} data-testid="sec-block-kind">
          <option value="ip">IP</option>
          <option value="account">{L("حساب", "חשבון")}</option>
          <option value="fingerprint">{L("بصمة", "טביעה")}</option>
        </select>
        <input data-testid="sec-block-value" value={mValue} onChange={(e) => setMValue(e.target.value)}
          placeholder={mKind === "ip" ? "1.2.3.4" : mKind === "account" ? "uid" : "fingerprint"}
          style={{ ...selectStyle, direction: "ltr", flex: "1 1 160px" }} />
        <select value={mDuration} onChange={(e) => setMDuration(e.target.value)} style={selectStyle}>
          <option value="">{L("دائم", "קבוע")}</option>
          <option value={String(60 * 60 * 1000)}>1h</option>
          <option value={String(24 * 60 * 60 * 1000)}>24h</option>
          <option value={String(7 * 24 * 60 * 60 * 1000)}>7d</option>
        </select>
        <input value={mReason} onChange={(e) => setMReason(e.target.value)} placeholder={L("السبب (اختياري)", "סיבה (רשות)")}
          style={{ ...selectStyle, flex: "1 1 120px" }} />
        <button type="submit" className="ghost-btn" style={{ padding: "6px 14px", fontSize: 12, color: "#ff5a5a" }} disabled={busy || !mValue.trim()}>
          {L("حظر", "חסום")}
        </button>
      </form>

      {/* Event feed */}
      {loading && events === null && (
        <div className="card" style={{ textAlign: "center", padding: 24, color: C.dim }}>…</div>
      )}
      {events && events.length === 0 && (
        <div className="card" style={{ textAlign: "center", padding: 24, color: C.dim }}>
          {L("لا توجد أحداث", "אין אירועים")}
        </div>
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {(events || []).map((r) => (
          <div key={r.id} className="card" style={{ padding: "10px 14px", opacity: r.resolved ? 0.55 : 1 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 10 }}>
              <span style={{ fontWeight: 800, fontSize: 13, color: sevColor(r.severity) }}>
                ● {r.type}
              </span>
              <span style={{ fontSize: 11, color: C.dim, direction: "ltr", flexShrink: 0 }}>{fmtTime(r.ts)}</span>
            </div>
            <div style={{ fontSize: 11, color: C.dim, marginTop: 4, direction: "ltr", textAlign: "left", wordBreak: "break-all" }}>
              {r.method} {r.path || "—"}
              {r.role ? <span style={{ opacity: 0.8 }}> · {r.role}</span> : null}
              {r.ip ? <span style={{ opacity: 0.8 }}> · ip {r.ip}</span> : null}
              {r.uid ? <span style={{ opacity: 0.8 }}> · uid {r.uid}</span> : null}
              {r.detail ? <span style={{ opacity: 0.8 }}> · {JSON.stringify(r.detail)}</span> : null}
            </div>
            <div style={{ display: "flex", gap: 6, marginTop: 8, flexWrap: "wrap" }}>
              {r.ip && <ActBtn label={L("حظر IP", "חסום IP")} onClick={() => doBlock("ip", r.ip, { durationMs: 60 * 60 * 1000 })} disabled={busy} />}
              {r.uid && <ActBtn label={L("حظر الحساب", "חסום חשבון")} onClick={() => doBlock("account", r.uid)} disabled={busy} />}
              {r.fingerprint && <ActBtn label={L("حظر البصمة", "חסום טביעה")} onClick={() => doBlock("fingerprint", r.fingerprint)} disabled={busy} />}
              {!r.resolved && <ActBtn label={L("تمّت المعالجة", "סמן כטופל")} onClick={() => doResolve(r.id)} disabled={busy} subtle />}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function Stat({ label, value, color }) {
  return (
    <div style={{ textAlign: "center", minWidth: 56 }}>
      <div style={{ fontSize: 18, fontWeight: 900, color }}>{value}</div>
      <div style={{ fontSize: 10, color: C.dim, marginTop: 2 }}>{label}</div>
    </div>
  );
}

function ActBtn({ label, onClick, disabled, subtle }) {
  return (
    <button onClick={onClick} disabled={disabled} className="ghost-btn"
      style={{ padding: "4px 10px", fontSize: 11, color: subtle ? C.dim : "#ff8a4c" }}>
      {label}
    </button>
  );
}

function BlocksPanel({ blocks, L, busy, onUnblock }) {
  if (!blocks) return null;
  const rows = [];
  for (const [key, rec] of Object.entries(blocks.accounts || {})) rows.push({ kind: "account", key, rec });
  for (const [key, rec] of Object.entries(blocks.ips || {})) rows.push({ kind: "ip", key, rec });
  for (const [key, rec] of Object.entries(blocks.fingerprints || {})) rows.push({ kind: "fingerprint", key, rec });
  if (rows.length === 0) return null;

  const fmtExp = (rec) => {
    if (!rec?.expiresAt) return L("دائم", "קבוע");
    return `→ ${fmtTime(rec.expiresAt)}`;
  };

  return (
    <div className="card" style={{ padding: "12px 14px", marginBottom: 14 }}>
      <div style={{ fontSize: 12, fontWeight: 800, color: "#ff5a5a", marginBottom: 8 }}>
        🚫 {L("محظورون حالياً", "חסומים כעת")} ({rows.length})
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        {rows.map((row) => (
          <div key={`${row.kind}:${row.key}`} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
            <span style={{ fontSize: 11, color: C.dim, direction: "ltr", textAlign: "left", wordBreak: "break-all" }}>
              <b style={{ color: C.goldLight }}>{row.kind}</b> {row.rec?.value || row.key}
              <span style={{ opacity: 0.7 }}> · {fmtExp(row.rec)}</span>
              {row.rec?.by === "auto" ? <span style={{ opacity: 0.7 }}> · auto</span> : null}
            </span>
            <button onClick={() => onUnblock(row.kind, row.rec?.value || row.key)} disabled={busy} className="ghost-btn"
              style={{ padding: "4px 10px", fontSize: 11, flexShrink: 0 }}>
              {L("رفع الحظر", "הסר")}
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
