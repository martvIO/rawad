// Admin tab: mint paid-signup payment links + watch their status.
//
// The admin picks a package (price tier from the backend config) and mints a
// single-use link. The groom opens it, picks a username + phone, and pays; the
// webhook then creates the groom account and WhatsApps the credentials. If
// delivery fails, the generated password is shown here as a fallback (it is
// purged automatically once the groom completes the forced first-login change).
import { useEffect, useState } from "react";
import { usePortal } from "../../../context/PortalContext.jsx";
import { Num } from "../../../components/Num.jsx";
import { createPoller } from "../../../utils/poller.js";
import { getPackages, createPaymentLink, listPaymentLinks } from "../../../services/payments.js";
import { localizeApiError } from "../../../utils/apiError.js";
import { POLL_MS } from "../../../config/index.js";
import { C } from "../../../styles/theme.js";

const STATUS_COLOR = {
  pending: C.dim,
  reserved: C.gold,
  paid: "#3fbf6f",
  delivered: "#4cc97a",
  delivery_failed: C.red,
  amount_mismatch: C.red,
  account_conflict: C.red,
};

export function AdminPaymentLinks() {
  const { t, lang, showToast } = usePortal();
  const [packages, setPackages] = useState([]);
  const [packageId, setPackageId] = useState("");
  const [busy, setBusy] = useState(false);
  const [links, setLinks] = useState([]);

  useEffect(() => {
    getPackages()
      .then((pkgs) => {
        setPackages(pkgs);
        if (pkgs.length) setPackageId((cur) => cur || pkgs[0].id);
      })
      .catch(() => setPackages([]));
  }, []);

  // Live-ish poll of the created links so a paid/delivered transition shows up.
  useEffect(() => {
    return createPoller(
      () => listPaymentLinks(),
      (rows) => { if (Array.isArray(rows)) setLinks(rows); },
      { intervalMs: POLL_MS.ME, onError: () => {} },
    );
  }, []);

  const copy = async (text, msg) => {
    if (!text) return;
    try { await navigator.clipboard.writeText(text); showToast(msg); } catch { /* noop */ }
  };

  const create = async () => {
    if (!packageId) return;
    setBusy(true);
    try {
      const res = await createPaymentLink(packageId);
      showToast(t("admin_paylinks_created"));
      await copy(res.payUrl, t("admin_paylinks_copied"));
      const rows = await listPaymentLinks();
      setLinks(rows);
    } catch (e) {
      if (e?.body?.error === "invalid_package") showToast(t("admin_paylinks_invalid_package"));
      else showToast(localizeApiError(e, t, t("pay_error_generic")));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      {/* Create */}
      <div className="gold-card" style={{ marginBottom: 18 }}>
        <div style={{ fontSize: 14, fontWeight: 800, color: C.goldLight, marginBottom: 4 }}>
          {t("admin_paylinks_create")}
        </div>
        <div style={{ fontSize: 11, color: C.dim, marginBottom: 12 }}>{t("admin_paylinks_role_note")}</div>

        <div style={{ marginBottom: 6, fontSize: 12, color: C.goldDim }}>{t("admin_paylinks_package")}</div>
        <div style={{ display: "flex", gap: 8, marginBottom: 14, flexWrap: "wrap" }}>
          {packages.map((p) => {
            const active = p.id === packageId;
            const label = p.label?.[lang] || p.label?.ar || p.id;
            return (
              <button key={p.id} onClick={() => setPackageId(p.id)} disabled={busy} style={{
                flex: "1 1 120px", padding: "10px 6px", borderRadius: 10, cursor: "pointer",
                fontSize: 12, fontWeight: 800, fontFamily: "inherit",
                background: active ? "rgba(201,168,76,.18)" : "rgba(255,255,255,.04)",
                border: `1px solid ${active ? "rgba(201,168,76,.5)" : "rgba(255,255,255,.08)"}`,
                color: active ? C.gold : C.dim,
              }}>
                {label}<br />
                <span style={{ fontSize: 13, direction: "ltr" }}>
                  <Num>{Number(p.amountIls).toLocaleString("en-US")}</Num> ₪
                </span>
              </button>
            );
          })}
        </div>

        <button className="gold-btn" style={{ width: "100%" }} onClick={create} disabled={busy || !packageId}>
          {busy ? "…" : t("admin_paylinks_make")}
        </button>
      </div>

      {/* List */}
      <div style={{ fontSize: 13, fontWeight: 800, color: C.goldLight, marginBottom: 10 }}>
        {t("admin_paylinks_title")}
      </div>
      {links.length === 0 ? (
        <div className="card" style={{ textAlign: "center", padding: 22, color: C.dim, fontSize: 13 }}>
          {t("admin_paylinks_empty")}
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {links.map((l) => {
            const label = l.packageLabel?.[lang] || l.packageLabel?.ar || l.packageId || "—";
            const color = STATUS_COLOR[l.status] || C.dim;
            return (
              <div key={l.token} className="card" style={{ padding: 14 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                  <span style={{ fontSize: 13, fontWeight: 800, color: C.goldLight }}>
                    {label}{l.amountIls ? <> · <span style={{ direction: "ltr" }}><Num>{Number(l.amountIls).toLocaleString("en-US")}</Num> ₪</span></> : null}
                  </span>
                  <span style={{ fontSize: 11, fontWeight: 800, color }}>
                    {t(`admin_paylinks_status_${l.status}`)}
                  </span>
                </div>
                {l.reservedUsername && (
                  <div style={{ fontSize: 12, color: C.dim, marginBottom: 8, direction: "ltr", textAlign: "start" }}>
                    @{l.reservedUsername}
                  </div>
                )}
                <div style={{ display: "flex", gap: 8 }}>
                  <button className="ghost-btn" style={{ flex: 1, fontSize: 12 }}
                          onClick={() => copy(l.payUrl, t("admin_paylinks_copied"))}>
                    {t("admin_paylinks_url")} · {t("admin_paylinks_copy")}
                  </button>
                  {l.generatedPassword && (
                    <button className="gold-btn" style={{ flex: 1, fontSize: 12 }}
                            onClick={() => copy(l.generatedPassword, t("admin_paylinks_copied"))}>
                      🔑 {t("admin_paylinks_password")}
                    </button>
                  )}
                </div>
                {l.generatedPassword && (
                  <div style={{
                    marginTop: 8, padding: "8px 10px", borderRadius: 8, direction: "ltr", textAlign: "left",
                    background: "rgba(255,255,255,.04)", border: "1px solid rgba(201,168,76,.18)",
                    fontFamily: "monospace", fontSize: 13, color: C.goldLight, wordBreak: "break-all",
                  }}>
                    {l.generatedPassword}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
