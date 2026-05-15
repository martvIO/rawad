// Admin → Users tab: create and delete portal users (grooms / drivers / admins).
// Passwords are NEVER stored in the database — Firebase Auth manages them.
// Phone number is required so the user can reset their password via SMS OTP.
import { usePortal } from "../../../context/PortalContext.jsx";

export function AdminUsersTab() {
  const {
    t, lang, addUser, users, deleteUser,
    newUserRole, setNewUserRole,
    newUserName, setNewUserName,
    newUserPass, setNewUserPass,
    newUserPhone, setNewUserPhone,
  } = usePortal();
  const phoneHint = lang === "he" ? "מספר טלפון (E.164, למשל +972501234567)"
                                  : "رقم الهاتف (E.164، مثال +972501234567)";
  const phonePlaceholder = "+972501234567";
  return (
    <>
            <div style={{ fontSize: 21, fontWeight: 900, color: "#f5e6b8", marginBottom: 4 }}>{t("admin_title")}</div>
            <div style={{ fontSize: 13, color: "#7a6a4a", marginBottom: 20 }}>{t("admin_subtitle")}</div>

            <div className="gold-card" style={{ marginBottom: 22 }}>
              <div style={{ fontSize: 14, fontWeight: 800, color: "#c9a84c", marginBottom: 14 }}>
                {t("admin_add_user")}
              </div>
              <div style={{ marginBottom: 6, fontSize: 12, color: "#a09070" }}>{t("admin_role")}</div>
              <div style={{ display: "flex", gap: 10, marginBottom: 14 }}>
                {[
                  { val: "groom",  lbl: t("admin_role_groom"),  color: "#c9a84c" },
                  { val: "driver", lbl: t("admin_role_driver"), color: "#4b9fd4" },
                ].map(opt => (
                  <button key={opt.val} onClick={() => setNewUserRole(opt.val)} style={{
                    flex: 1, padding: "10px 0", borderRadius: 10, cursor: "pointer",
                    background: newUserRole === opt.val ? `${opt.color}22` : "rgba(255,255,255,.04)",
                    border: `1.5px solid ${newUserRole === opt.val ? opt.color : "rgba(255,255,255,.08)"}`,
                    color: newUserRole === opt.val ? opt.color : "#7a6a4a",
                    fontWeight: 800, fontSize: 13, fontFamily: "inherit",
                  }}>{opt.lbl}</button>
                ))}
              </div>
              <div style={{ marginBottom: 6, fontSize: 12, color: "#a09070" }}>{t("login_user")}</div>
              <input className="input-field" type="text" placeholder={t("login_user")}
                     value={newUserName} onChange={e => setNewUserName(e.target.value)}
                     style={{ marginBottom: 12, direction: "ltr", textAlign: "right" }}/>
              <div style={{ marginBottom: 6, fontSize: 12, color: "#a09070" }}>{t("login_pass")}</div>
              <input className="input-field" type="password" placeholder="••••••••"
                     value={newUserPass} onChange={e => setNewUserPass(e.target.value)}
                     style={{ marginBottom: 12, direction: "ltr", textAlign: "right" }}/>
              <div style={{ marginBottom: 6, fontSize: 12, color: "#a09070" }}>{phoneHint}</div>
              <input className="input-field" type="tel" inputMode="tel" placeholder={phonePlaceholder}
                     value={newUserPhone} onChange={e => setNewUserPhone(e.target.value)}
                     style={{ marginBottom: 16, direction: "ltr", textAlign: "right" }}/>
              <button className="gold-btn" style={{ width: "100%" }} onClick={addUser}
                      disabled={!newUserName.trim() || !newUserPass.trim() || !newUserPhone.trim()}>
                ➕ {t("admin_create")}
              </button>
            </div>

            <div style={{ fontSize: 13, color: "#7a6a4a", fontWeight: 700, marginBottom: 10 }}>
              {t("admin_existing")} ({users.length.toLocaleString("en")})
            </div>
            {users.length === 0 ? (
              <div className="card" style={{ textAlign: "center", padding: 32, color: "#7a6a4a" }}>
                {t("admin_no_users")}
              </div>
            ) : (
              users.map(u => (
                <div key={u.uid || u.id} className="card" style={{
                  marginBottom: 10, display: "flex", alignItems: "center", gap: 12,
                }}>
                  <div style={{
                    width: 38, height: 38, borderRadius: 10, flexShrink: 0,
                    background: u.role === "driver" ? "rgba(75,159,212,.15)"
                              : u.role === "admin"  ? "rgba(212,80,58,.15)"
                              : "rgba(201,168,76,.15)",
                    color: u.role === "driver" ? "#4b9fd4"
                         : u.role === "admin"  ? "#d47a4b"
                         : "#c9a84c",
                    display: "flex", alignItems: "center", justifyContent: "center",
                    fontSize: 18, fontWeight: 900,
                  }}>{u.role === "driver" ? "🚗" : u.role === "admin" ? "🔒" : "♥"}</div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 800, color: "#f5e6b8", fontSize: 14, direction: "ltr", textAlign: "right" }}>{u.username}</div>
                    <div style={{ fontSize: 11, color: "#7a6a4a", marginTop: 2 }}>
                      {u.role === "driver" ? t("admin_role_driver")
                        : u.role === "admin" ? "🔒 admin"
                        : t("admin_role_groom")}
                      {u.phoneE164 && <> · <span style={{ direction: "ltr" }}>📱 {u.phoneE164}</span></>}
                    </div>
                  </div>
                  <button onClick={() => deleteUser(u.uid || u.id)} style={{
                    background: "rgba(212,122,75,.12)", border: "1px solid rgba(212,122,75,.3)",
                    color: "#d47a4b", padding: "6px 12px", borderRadius: 8,
                    fontWeight: 700, fontSize: 12, cursor: "pointer", fontFamily: "inherit",
                  }}>{t("admin_delete")}</button>
                </div>
              ))
            )}
    </>
  );
}
