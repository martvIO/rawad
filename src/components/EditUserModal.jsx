// Admin edit modal for an existing user. Mirrors EditGuestModal's style.
// Lets the admin change displayName, phone (E.164), role, username, and
// optionally set a new password (leave blank to keep current).
//
// قواعد الحفظ:
//  - اسم المستخدم ورقم الهاتف مطلوبان دائماً (لا يمكن إفراغهما).
//  - كلمة المرور اختيارية. إذا كُتبت يجب أن تكون قويّة، وإلا نُبلّغ المستخدم
//    بـ Toast ولا نُرسل أيّ تحديث (نسمح للأدمن بتصحيحها أو مسحها).
//  - إن لم يتغيّر أي حقل (وبقيت كلمة المرور فارغة) نُظهر «لا تغييرات للحفظ»
//    بدل تشغيل نداء عبثيّ.
import { useEffect, useState } from "react";
import { usePortal } from "../context/PortalContext.jsx";
import { PasswordRules } from "./PasswordRules.jsx";
import { PhoneInput } from "./PhoneInput.jsx";
import { isStrongPassword } from "../utils/password.js";
import { isPlaceholderPhone } from "../utils/phone.js";
import { C } from "../styles/theme.js";

export function EditUserModal() {
  const { editingUser, cancelEditUser, saveUserEdit, t, lang, showToast } = usePortal();

  const [username,    setUsername]    = useState("");
  const [displayName, setDisplayName] = useState("");
  const [phoneE164,   setPhoneE164]   = useState("");
  const [role,        setRole]        = useState("groom");
  const [newPassword, setNewPassword] = useState("");
  // حالة الإرسال — نُعطّل الزرّ ونُغيّر النصّ أثناء انتظار الـ Cloud Function
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (editingUser) {
      setUsername   (editingUser.username    || "");
      setDisplayName(editingUser.displayName || "");
      // الرقم الوهمي (+999...) يُعرض على شكل خانة فارغة حتى يستطيع الأدمن
      // إدخال رقم حقيقي إن أراد.
      setPhoneE164(isPlaceholderPhone(editingUser.phoneE164) ? "" : (editingUser.phoneE164 || ""));
      setRole       (editingUser.role        || "groom");
      setNewPassword("");
      setSaving(false);
    }
  }, [editingUser]);

  if (!editingUser) return null;

  // ── تحقّق من المدخلات قبل الإرسال ──
  // الهاتف اختياري الآن، فلا نُلزم به. نتحقق فقط من الاسم وقوّة كلمة السر (إن كُتبت).
  const validate = () => {
    if (!username.trim()) return t("admin_required");
    if (newPassword.length > 0 && !isStrongPassword(newPassword)) {
      return t("pwd_weak");
    }
    return null;
  };

  // ── هل ثمّة تغيير فعلي يستحقّ الحفظ؟ ──
  // نُعامل الرقم الوهمي (+999...) كأنه «بدون هاتف» لأغراض المقارنة.
  const originalPhone = isPlaceholderPhone(editingUser.phoneE164) ? "" : (editingUser.phoneE164 || "");
  const hasChanges =
    (username.trim().toLowerCase() !== (editingUser.username || "")) ||
    (displayName.trim() !== (editingUser.displayName || "")) ||
    (phoneE164.trim() !== originalPhone) ||
    (role !== (editingUser.role || "groom")) ||
    (newPassword.trim().length > 0);

  const save = async () => {
    const err = validate();
    if (err) { showToast(err); return; }
    if (!hasChanges) { showToast(t("admin_no_changes")); return; }

    setSaving(true);
    try {
      // بناء الـ patch: نُرسل فقط ما تغيّر فعلاً.
      // saveUserEdit يُقارن كل حقل بالأصل ولا يُرسل للـ Cloud Function
      // إلا ما تغيّر فعلاً — displayName عبر RTDB مباشرةً، username/phone/role
      // عبر updatePortalUser، password عبر adminSetPassword.
      const patch = {};
      patch.username = username.trim().toLowerCase();
      if (displayName.trim() !== (editingUser.displayName || ""))
        patch.displayName = displayName.trim();
      if (phoneE164.trim())
        patch.phoneE164 = phoneE164.trim();
      if (role !== (editingUser.role || "groom"))
        patch.role = role;
      if (newPassword.trim())
        patch.newPassword = newPassword.trim();

      console.log("[dawa] EditModal patch:", patch);
      await saveUserEdit(editingUser.uid || editingUser.id, patch);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div onClick={saving ? undefined : cancelEditUser} style={{
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
          <div style={{ color: C.gold, fontWeight: 900, fontSize: 18, fontFamily: "'Amiri',serif" }}>
            {t("admin_user_edit_title")}
          </div>
          <button onClick={cancelEditUser} disabled={saving} style={{
            background: "none", border: "none", color: C.dim, fontSize: 22,
            cursor: saving ? "not-allowed" : "pointer", padding: 0, lineHeight: 1,
            opacity: saving ? 0.5 : 1,
          }}>×</button>
        </div>

        {/* الدور */}
        <div style={{ marginBottom: 6, fontSize: 12, color: C.goldDim }}>{t("admin_role")}</div>
        <div style={{ display: "flex", gap: 8, marginBottom: 14 }}>
          {[
            { val: "groom",  lbl: t("admin_role_groom"),  color: C.gold },
            { val: "driver", lbl: t("admin_role_driver"), color: C.blue },
            { val: "admin",  lbl: t("admin_role_admin"),  color: C.red },
          ].map(opt => (
            <button key={opt.val} onClick={() => setRole(opt.val)} disabled={saving} style={{
              flex: 1, padding: "9px 0", borderRadius: 10, cursor: saving ? "not-allowed" : "pointer",
              background: role === opt.val ? `${opt.color}22` : "rgba(255,255,255,.04)",
              border: `1.5px solid ${role === opt.val ? opt.color : "rgba(255,255,255,.08)"}`,
              color: role === opt.val ? opt.color : C.dim,
              fontWeight: 800, fontSize: 12, fontFamily: "inherit",
            }}>{opt.lbl}</button>
          ))}
        </div>

        {/* اسم المستخدم */}
        <div style={{ marginBottom: 6, fontSize: 12, color: C.goldDim }}>{t("login_user")}</div>
        <input className="input-field" type="text" disabled={saving}
               value={username} onChange={e => setUsername(e.target.value)}
               style={{ marginBottom: 4, direction: "ltr", textAlign: "right" }}/>
        <div style={{ fontSize: 10, color: C.dim, marginBottom: 12 }}>
          {t("admin_user_edit_username_warn")}
        </div>

        {/* الاسم الظاهر */}
        <div style={{ marginBottom: 6, fontSize: 12, color: C.goldDim }}>{t("admin_user_edit_display_name")}</div>
        <input className="input-field" type="text" disabled={saving}
               value={displayName} onChange={e => setDisplayName(e.target.value)}
               style={{ marginBottom: 12 }}/>

        {/* الهاتف */}
        <div style={{ marginBottom: 6, fontSize: 12, color: C.goldDim }}>{t("phone_field_label")}</div>
        <div style={{ marginBottom: 12 }}>
          <PhoneInput value={phoneE164} onChange={setPhoneE164} t={t} lang={lang} disabled={saving} />
        </div>

        {/* كلمة المرور — اختيارية */}
        <div style={{ marginBottom: 6, fontSize: 12, color: C.goldDim }}>{t("admin_user_edit_new_password")}</div>
        <input className="input-field" type="password" disabled={saving}
               value={newPassword} onChange={e => setNewPassword(e.target.value)}
               placeholder={t("admin_user_edit_new_password_hint")}
               style={{ marginBottom: newPassword ? 10 : 20, direction: "ltr", textAlign: "right" }}/>
        {newPassword.length > 0 && (
          <div style={{ marginBottom: 16 }}>
            <PasswordRules password={newPassword} t={t} compact />
          </div>
        )}

        {/* أزرار إلغاء + حفظ */}
        {/* مهم: لا نُعطّل زرّ الحفظ بناءً على التحقّق — بدلاً من ذلك نسمح بالنقر */}
        {/* ونعرض Toast واضحاً إذا كانت هناك مشكلة. الزرّ يُعطَّل فقط أثناء الإرسال */}
        {/* الفعليّ لمنع النقر المزدوج. */}
        <div style={{ display: "flex", gap: 10 }}>
          <button className="ghost-btn" style={{ flex: 1 }} onClick={cancelEditUser} disabled={saving}>
            {t("edit_cancel")}
          </button>
          <button className="gold-btn" style={{ flex: 1 }} onClick={save} disabled={saving}>
            {saving ? t("admin_saving") : t("edit_save")}
          </button>
        </div>
      </div>
    </div>
  );
}
