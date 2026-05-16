// Admin → User Manager page (replaces AdminUsersTab). Full CRUD over every
// account type. Wrapped in a RoleGuard so that even if the parent tab
// switching mis-fires, a non-admin can never render this view.
//
// All mutations are routed through Cloud Functions (createPortalUser,
// updatePortalUser, deletePortalUser, adminSetPassword) where the server
// re-checks the admin claim before doing anything.
import { useState } from "react";
import { usePortal } from "../../../context/PortalContext.jsx";
import { RoleGuard } from "../../../components/RoleGuard.jsx";
import { PasswordRules } from "../../../components/PasswordRules.jsx";
import { PhoneInput } from "../../../components/PhoneInput.jsx";
import { isStrongPassword } from "../../../utils/password.js";
import { C } from "../../../styles/theme.js";

const ROLE_STYLE = {
  admin:  { bg: "rgba(212,80,58,.15)",  fg: C.red, icon: "🔒" },
  driver: { bg: "rgba(75,159,212,.15)", fg: C.blue, icon: "🚗" },
  groom:  { bg: "rgba(201,168,76,.15)", fg: C.gold, icon: "♥" },
};

function UserManagerInner() {
  const {
    t, lang, users, addUser, deleteUser, startEditUser,
    newUserRole, setNewUserRole,
    newUserName, setNewUserName,
    newUserPass, setNewUserPass,
    newUserPhone, setNewUserPhone,
  } = usePortal();

  const [filter, setFilter] = useState("all");
  const [confirmingDelete, setConfirmingDelete] = useState(null);

  const filtered = filter === "all" ? users : users.filter(u => u.role === filter);

  return (
    <>
      <div style={{ fontSize: 21, fontWeight: 900, color: C.goldLight, marginBottom: 4 }}>
        {t("admin_user_manager_title")}
      </div>
      <div style={{ fontSize: 13, color: C.dim, marginBottom: 20 }}>
        {t("admin_user_manager_subtitle")}
      </div>

      {/* ── Create form ────────────────────────────────────────────────── */}
      <div className="gold-card" style={{ marginBottom: 22 }}>
        <div style={{ fontSize: 14, fontWeight: 800, color: C.gold, marginBottom: 14 }}>
          {t("admin_add_user")}
        </div>

        <div style={{ marginBottom: 6, fontSize: 12, color: C.goldDim }}>{t("admin_role")}</div>
        <div style={{ display: "flex", gap: 8, marginBottom: 14 }}>
          {[
            { val: "groom",  lbl: t("admin_role_groom") },
            { val: "driver", lbl: t("admin_role_driver") },
            { val: "admin",  lbl: t("admin_role_admin") },
          ].map(opt => {
            const s = ROLE_STYLE[opt.val];
            const active = newUserRole === opt.val;
            return (
              <button key={opt.val} onClick={() => setNewUserRole(opt.val)} style={{
                flex: 1, padding: "10px 0", borderRadius: 10, cursor: "pointer",
                background: active ? `${s.fg}22` : "rgba(255,255,255,.04)",
                border: `1.5px solid ${active ? s.fg : "rgba(255,255,255,.08)"}`,
                color: active ? s.fg : C.dim,
                fontWeight: 800, fontSize: 13, fontFamily: "inherit",
              }}>{s.icon} {opt.lbl}</button>
            );
          })}
        </div>

        <div style={{ marginBottom: 6, fontSize: 12, color: C.goldDim }}>{t("login_user")}</div>
        <input className="input-field" type="text" placeholder={t("login_user")}
               value={newUserName} onChange={e => setNewUserName(e.target.value)}
               style={{ marginBottom: 12, direction: "ltr", textAlign: "right" }}/>

        <div style={{ marginBottom: 6, fontSize: 12, color: C.goldDim }}>{t("login_pass")}</div>
        <input className="input-field" type="password" placeholder="••••••••"
               value={newUserPass} onChange={e => setNewUserPass(e.target.value)}
               style={{ marginBottom: 10, direction: "ltr", textAlign: "right" }}/>
        <PasswordRules password={newUserPass} t={t} />

        <div style={{ marginBottom: 6, fontSize: 12, color: C.goldDim }}>{t("phone_field_label")}</div>
        <div style={{ marginBottom: 16 }}>
          <PhoneInput value={newUserPhone} onChange={setNewUserPhone} t={t} lang={lang} />
        </div>

        <button className="gold-btn" style={{ width: "100%" }} onClick={addUser}
                disabled={!newUserName.trim() || !newUserPhone.trim() || !isStrongPassword(newUserPass)}>
          ➕ {t("admin_create")}
        </button>
      </div>

      {/* ── Filter chips ───────────────────────────────────────────────── */}
      <div style={{ display: "flex", gap: 6, marginBottom: 14, flexWrap: "wrap" }}>
        {[
          { val: "all",    lbl: t("admin_user_filter_all") },
          { val: "admin",  lbl: t("admin_role_admin") },
          { val: "groom",  lbl: t("admin_role_groom") },
          { val: "driver", lbl: t("admin_role_driver") },
        ].map(opt => (
          <button key={opt.val} onClick={() => setFilter(opt.val)} style={{
            flex: "1 1 80px", padding: "8px 0", borderRadius: 10, cursor: "pointer",
            background: filter === opt.val ? "rgba(201,168,76,.18)" : "rgba(255,255,255,.04)",
            border: `1px solid ${filter === opt.val ? "rgba(201,168,76,.4)" : "rgba(255,255,255,.08)"}`,
            color: filter === opt.val ? C.gold : C.dim,
            fontSize: 11, fontWeight: 800, fontFamily: "inherit",
          }}>{opt.lbl}</button>
        ))}
      </div>

      <div style={{ fontSize: 13, color: C.dim, fontWeight: 700, marginBottom: 10 }}>
        {t("admin_existing")} ({filtered.length.toLocaleString("en")})
      </div>

      {/* ── User list ─────────────────────────────────────────────────── */}
      {filtered.length === 0 ? (
        <div className="card" style={{ textAlign: "center", padding: 32, color: C.dim }}>
          {t("admin_no_users")}
        </div>
      ) : (
        filtered.map(u => {
          const s = ROLE_STYLE[u.role] || ROLE_STYLE.groom;
          const isConfirming = confirmingDelete === (u.uid || u.id);
          return (
            <div key={u.uid || u.id} className="card" style={{
              marginBottom: 10, padding: 12,
              display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap",
            }}>
              <div style={{
                width: 38, height: 38, borderRadius: 10, flexShrink: 0,
                background: s.bg, color: s.fg,
                display: "flex", alignItems: "center", justifyContent: "center",
                fontSize: 18, fontWeight: 900,
              }}>{s.icon}</div>

              <div style={{ flex: "1 1 200px", minWidth: 0 }}>
                <div style={{ fontWeight: 800, color: C.goldLight, fontSize: 14, direction: "ltr", textAlign: "right" }}>
                  {u.username}
                </div>
                {u.displayName && (
                  <div style={{ fontSize: 11, color: C.goldDim, marginTop: 2 }}>
                    {u.displayName}
                  </div>
                )}
                <div style={{ fontSize: 11, color: C.dim, marginTop: 2 }}>
                  <span style={{ color: s.fg }}>
                    {u.role === "admin"  ? t("admin_role_admin")
                     : u.role === "driver" ? t("admin_role_driver")
                     : t("admin_role_groom")}
                  </span>
                  {u.phoneE164 && <> · <span style={{ direction: "ltr" }}>📱 {u.phoneE164}</span></>}
                </div>
              </div>

              <div style={{ display: "flex", gap: 6 }}>
                <button onClick={() => startEditUser(u)} style={{
                  background: "rgba(201,168,76,.10)", border: "1px solid rgba(201,168,76,.30)",
                  color: C.gold, padding: "6px 12px", borderRadius: 8,
                  fontWeight: 700, fontSize: 12, cursor: "pointer", fontFamily: "inherit",
                }}>✎ {t("admin_edit")}</button>

                {isConfirming ? (
                  <>
                    <button onClick={() => {
                      deleteUser(u.uid || u.id);
                      setConfirmingDelete(null);
                    }} style={{
                      background: "rgba(212,80,58,.2)", border: "1px solid rgba(212,80,58,.5)",
                      color: C.red, padding: "6px 12px", borderRadius: 8,
                      fontWeight: 800, fontSize: 12, cursor: "pointer", fontFamily: "inherit",
                    }}>✓ {t("admin_delete_confirm")}</button>
                    <button onClick={() => setConfirmingDelete(null)} style={{
                      background: "rgba(255,255,255,.04)", border: "1px solid rgba(255,255,255,.08)",
                      color: C.dim, padding: "6px 10px", borderRadius: 8,
                      fontWeight: 700, fontSize: 12, cursor: "pointer", fontFamily: "inherit",
                    }}>×</button>
                  </>
                ) : (
                  <button onClick={() => setConfirmingDelete(u.uid || u.id)} style={{
                    background: "rgba(212,122,75,.12)", border: "1px solid rgba(212,122,75,.3)",
                    color: C.red, padding: "6px 12px", borderRadius: 8,
                    fontWeight: 700, fontSize: 12, cursor: "pointer", fontFamily: "inherit",
                  }}>{t("admin_delete")}</button>
                )}
              </div>
            </div>
          );
        })
      )}
    </>
  );
}

export function AdminUserManager() {
  return (
    <RoleGuard roles={["admin"]}>
      <UserManagerInner />
    </RoleGuard>
  );
}
