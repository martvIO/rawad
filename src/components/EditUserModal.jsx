// Admin edit modal for an existing user. Mirrors EditGuestModal's style.
// Lets the admin change displayName, phone (E.164), role, username, and
// optionally set a new password (leave blank to keep current).
import { useEffect, useState } from "react";
import { usePortal } from "../context/PortalContext.jsx";

export function EditUserModal() {
  const { editingUser, cancelEditUser, saveUserEdit, t, lang } = usePortal();

  const [username,    setUsername]    = useState("");
  const [displayName, setDisplayName] = useState("");
  const [phoneE164,   setPhoneE164]   = useState("");
  const [role,        setRole]        = useState("groom");
  const [newPassword, setNewPassword] = useState("");

  useEffect(() => {
    if (editingUser) {
      setUsername   (editingUser.username    || "");
      setDisplayName(editingUser.displayName || "");
      setPhoneE164  (editingUser.phoneE164   || "");
      setRole       (editingUser.role        || "groom");
      setNewPassword("");
    }
  }, [editingUser]);

  if (!editingUser) return null;

  const save = () => {
    if (!username.trim() || !phoneE164.trim()) return;
    saveUserEdit(editingUser.uid || editingUser.id, {
      username:    username.trim().toLowerCase(),
      displayName: displayName.trim(),
      phoneE164:   phoneE164.trim(),
      role,
      newPassword: newPassword.trim() || null,
    });
  };

  const phoneHint = lang === "he"
    ? "מספר טלפון (E.164, למשל +972501234567)"
    : "رقم الهاتف (E.164، مثال +972501234567)";

  return (
    <div onClick={cancelEditUser} style={{
      position: "fixed", inset: 0, background: "rgba(0,0,0,.78)",
      display: "flex", alignItems: "center", justifyContent: "center",
      zIndex: 1000, padding: 20, animation: "fadeIn .25s ease",
    }}>
      <div onClick={e => e.stopPropagation()} style={{
        maxWidth: 460, width: "100%", maxHeight: "90vh", overflowY: "auto",
        background: "#0c0c11", border: "1px solid rgba(201,168,76,.3)",
        borderRadius: 18, padding: 24, animation: "slideUp .3s ease",
      }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 18 }}>
          <div style={{ color: "#c9a84c", fontWeight: 900, fontSize: 18, fontFamily: "'Amiri',serif" }}>
            {t("admin_user_edit_title")}
          </div>
          <button onClick={cancelEditUser} style={{
            background: "none", border: "none", color: "#7a6a4a", fontSize: 22,
            cursor: "pointer", padding: 0, lineHeight: 1,
          }}>×</button>
        </div>

        <div style={{ marginBottom: 6, fontSize: 12, color: "#a09070" }}>{t("admin_role")}</div>
        <div style={{ display: "flex", gap: 8, marginBottom: 14 }}>
          {[
            { val: "groom",  lbl: t("admin_role_groom"),  color: "#c9a84c" },
            { val: "driver", lbl: t("admin_role_driver"), color: "#4b9fd4" },
            { val: "admin",  lbl: t("admin_role_admin"),  color: "#d47a4b" },
          ].map(opt => (
            <button key={opt.val} onClick={() => setRole(opt.val)} style={{
              flex: 1, padding: "9px 0", borderRadius: 10, cursor: "pointer",
              background: role === opt.val ? `${opt.color}22` : "rgba(255,255,255,.04)",
              border: `1.5px solid ${role === opt.val ? opt.color : "rgba(255,255,255,.08)"}`,
              color: role === opt.val ? opt.color : "#7a6a4a",
              fontWeight: 800, fontSize: 12, fontFamily: "inherit",
            }}>{opt.lbl}</button>
          ))}
        </div>

        <div style={{ marginBottom: 6, fontSize: 12, color: "#a09070" }}>{t("login_user")}</div>
        <input className="input-field" type="text"
               value={username} onChange={e => setUsername(e.target.value)}
               style={{ marginBottom: 4, direction: "ltr", textAlign: "right" }}/>
        <div style={{ fontSize: 10, color: "#7a6a4a", marginBottom: 12 }}>
          {t("admin_user_edit_username_warn")}
        </div>

        <div style={{ marginBottom: 6, fontSize: 12, color: "#a09070" }}>{t("admin_user_edit_display_name")}</div>
        <input className="input-field" type="text"
               value={displayName} onChange={e => setDisplayName(e.target.value)}
               style={{ marginBottom: 12 }}/>

        <div style={{ marginBottom: 6, fontSize: 12, color: "#a09070" }}>{phoneHint}</div>
        <input className="input-field" type="tel" inputMode="tel"
               value={phoneE164} onChange={e => setPhoneE164(e.target.value)}
               placeholder="+972501234567"
               style={{ marginBottom: 12, direction: "ltr", textAlign: "right" }}/>

        <div style={{ marginBottom: 6, fontSize: 12, color: "#a09070" }}>{t("admin_user_edit_new_password")}</div>
        <input className="input-field" type="password"
               value={newPassword} onChange={e => setNewPassword(e.target.value)}
               placeholder={t("admin_user_edit_new_password_hint")}
               style={{ marginBottom: 20, direction: "ltr", textAlign: "right" }}/>

        <div style={{ display: "flex", gap: 10 }}>
          <button className="ghost-btn" style={{ flex: 1 }} onClick={cancelEditUser}>
            {t("edit_cancel")}
          </button>
          <button className="gold-btn" style={{ flex: 1 }} onClick={save}
                  disabled={!username.trim() || !phoneE164.trim() ||
                            (newPassword.length > 0 && newPassword.length < 8)}>
            {t("edit_save")}
          </button>
        </div>
      </div>
    </div>
  );
}
