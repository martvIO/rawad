// ======================================================================
// إدارة المستخدمين — صفحة كاملة للمدير
// ======================================================================
// الحقول الأساسية:  username ✱  password ✱  role ✱  phone (اختياري)
// البيانات: تأتي من Firebase RTDB عبر subscribeUsers (اشتراك حيّ لحظي)،
//          مدعوم بـ optimisticUsers محلية (localStorage) لعرض الإضافات فوراً.
// التعديل: Cloud Function updatePortalUser → ثمّ تحديث تلقائي من الاشتراك.
// ======================================================================
import { useState } from "react";
import { usePortal } from "../../../context/PortalContext.jsx";
import { RoleGuard } from "../../../components/RoleGuard.jsx";
import { PasswordRules } from "../../../components/PasswordRules.jsx";
import { PhoneInput } from "../../../components/PhoneInput.jsx";
import { isStrongPassword } from "../../../utils/password.js";
import { isPlaceholderPhone } from "../../../utils/phone.js";
import { C } from "../../../styles/theme.js";

// ── ألوان وأيقونات لكل دور ───────────────────────────────────────────
const ROLE_META = {
  admin:  { bg: "rgba(212,80,58,.15)",  fg: C.red,  icon: "🔒" },
  driver: { bg: "rgba(75,159,212,.15)", fg: C.blue, icon: "🚗" },
  groom:  { bg: "rgba(201,168,76,.15)", fg: C.gold, icon: "♥"  },
};

// ── مربّع تعديل مضمَّن (Inline Edit Modal) ──────────────────────────
// يظهر عند الضغط على «تعديل» في سطر المستخدم ويتيح تغيير:
//   username  |  password (اختياري)  |  phone (اختياري)  |  role
function EditModal({ user, onSave, onCancel, t, lang }) {
  const [username,    setUsername]    = useState(user.username    ?? "");
  const [displayName, setDisplayName] = useState(user.displayName ?? "");
  const [phoneE164,   setPhoneE164]   = useState(
    isPlaceholderPhone(user.phoneE164) ? "" : (user.phoneE164 ?? ""),
  );
  const [role,        setRole]        = useState(user.role        ?? "groom");
  const [newPass,     setNewPass]     = useState("");
  const [saving,      setSaving]      = useState(false);

  const canSave = username.trim() &&
    (newPass.length === 0 || isStrongPassword(newPass));

  const handleSave = async () => {
    if (!canSave) return;
    setSaving(true);
    // نُرسل فقط ما تغيّر فعلاً — لا نُرسل displayName/role إذا لم يتغيّرا
    // حتى لا تُطلَق Cloud Function بلا سبب وتُعيد INTERNAL
    const patch = {};
    patch.username = username.trim().toLowerCase();
    if (displayName.trim() !== (user.displayName || ""))
      patch.displayName = displayName.trim();
    if (phoneE164.trim())
      patch.phoneE164 = phoneE164.trim();
    if (role !== (user.role || "groom"))
      patch.role = role;
    if (newPass.trim())
      patch.newPassword = newPass.trim();
    console.log("[dawa] EditModal → patch:", patch);
    try {
      await onSave(user.uid ?? user.id, patch);
    } finally {
      setSaving(false);
    }
  };

  const inputStyle = {
    marginBottom: 12, direction: "ltr", textAlign: "right",
  };

  return (
    // طبقة خلفية شفافة — النقر عليها يُغلق المودال
    <div
      onClick={saving ? undefined : onCancel}
      style={{
        position: "fixed", inset: 0, zIndex: 1000,
        background: "rgba(0,0,0,.75)",
        display: "flex", alignItems: "center", justifyContent: "center",
        padding: 20, animation: "fadeIn .2s ease",
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          width: "100%", maxWidth: 460, maxHeight: "90vh", overflowY: "auto",
          background: "#0c0c11", border: "1px solid rgba(201,168,76,.3)",
          borderRadius: 18, padding: 24, animation: "slideUp .25s ease",
        }}
      >
        {/* ─ رأس المودال ─ */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 18 }}>
          <span style={{ color: C.gold, fontWeight: 900, fontSize: 17, fontFamily: "'Amiri',serif" }}>
            {t("admin_user_edit_title")}
          </span>
          <button onClick={onCancel} disabled={saving} style={{
            background: "none", border: "none", color: C.dim, fontSize: 22,
            cursor: "pointer", lineHeight: 1,
          }}>×</button>
        </div>

        {/* الدور */}
        <div style={{ fontSize: 12, color: C.goldDim, marginBottom: 6 }}>{t("admin_role")}</div>
        <div style={{ display: "flex", gap: 8, marginBottom: 14 }}>
          {(["groom", "driver", "admin"]).map(r => {
            const m = ROLE_META[r];
            const active = role === r;
            return (
              <button key={r} onClick={() => setRole(r)} disabled={saving} style={{
                flex: 1, padding: "9px 0", borderRadius: 10, cursor: "pointer",
                background: active ? `${m.fg}22` : "rgba(255,255,255,.04)",
                border: `1.5px solid ${active ? m.fg : "rgba(255,255,255,.08)"}`,
                color: active ? m.fg : C.dim,
                fontWeight: 800, fontSize: 12, fontFamily: "inherit",
              }}>
                {t(`admin_role_${r}`)}
              </button>
            );
          })}
        </div>

        {/* اسم المستخدم — مطلوب */}
        <div style={{ fontSize: 12, color: C.goldDim, marginBottom: 6 }}>
          {t("login_user")} <span style={{ color: C.red }}>*</span>
        </div>
        <input className="input-field" type="text" disabled={saving}
               value={username} onChange={e => setUsername(e.target.value)}
               style={inputStyle} />
        <div style={{ fontSize: 10, color: C.dim, marginBottom: 12, marginTop: -8 }}>
          {t("admin_user_edit_username_warn")}
        </div>

        {/* الاسم الظاهر */}
        <div style={{ fontSize: 12, color: C.goldDim, marginBottom: 6 }}>{t("admin_user_edit_display_name")}</div>
        <input className="input-field" type="text" disabled={saving}
               value={displayName} onChange={e => setDisplayName(e.target.value)}
               style={inputStyle} />

        {/* الهاتف — اختياري */}
        <div style={{ fontSize: 12, color: C.goldDim, marginBottom: 6 }}>
          {t("phone_field_label")}
          <span style={{ color: C.dim, fontWeight: 400, marginInlineStart: 6 }}>
            ({t("field_address_optional")})
          </span>
        </div>
        <div style={{ marginBottom: 14 }}>
          <PhoneInput value={phoneE164} onChange={setPhoneE164} t={t} lang={lang} disabled={saving} />
        </div>

        {/* كلمة مرور جديدة — اختيارية */}
        <div style={{ fontSize: 12, color: C.goldDim, marginBottom: 6 }}>
          {t("admin_user_edit_new_password")}
          <span style={{ color: C.dim, fontWeight: 400, marginInlineStart: 6 }}>
            ({t("admin_user_edit_new_password_hint")})
          </span>
        </div>
        <input className="input-field" type="password" disabled={saving}
               value={newPass} onChange={e => setNewPass(e.target.value)}
               placeholder="••••••••"
               style={{ marginBottom: newPass ? 8 : 20, direction: "ltr", textAlign: "right" }} />
        {newPass.length > 0 && (
          <div style={{ marginBottom: 16 }}>
            <PasswordRules password={newPass} t={t} compact />
          </div>
        )}

        {/* أزرار */}
        <div style={{ display: "flex", gap: 10 }}>
          <button className="ghost-btn" style={{ flex: 1 }} onClick={onCancel} disabled={saving}>
            {t("edit_cancel")}
          </button>
          <button className="gold-btn" style={{ flex: 1 }} onClick={handleSave}
                  disabled={saving || !canSave}>
            {saving ? t("admin_saving") : t("edit_save")}
          </button>
        </div>
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════
function UserManagerInner() {
  const {
    t, lang,
    // القائمة الحيّة (Firebase RTDB) + الإضافات التفاؤلية مدموجة في `users`
    users, usersLoading,
    addUser, deleteUser, saveUserEdit,
    newUserRole, setNewUserRole,
    newUserName, setNewUserName,
    newUserPass, setNewUserPass,
    newUserPhone, setNewUserPhone,
  } = usePortal();

  // ── الحالة المحلية ──────────────────────────────────────────────────
  const [filter,         setFilter]         = useState("all");
  const [confirmDelete,  setConfirmDelete]  = useState(null); // uid المراد حذفه
  const [editingUser,    setEditingUser]    = useState(null); // المستخدم الذي يُعدَّل

  // تبويبات التصفية
  const TABS = [
    { val: "all",    label: t("admin_user_filter_all")     },
    { val: "groom",  label: t("admin_user_filter_grooms")  },
    { val: "driver", label: t("admin_user_filter_drivers") },
    { val: "admin",  label: t("admin_user_filter_admins")  },
  ];

  // القائمة المُصفَّاة
  const filtered = filter === "all" ? users : users.filter(u => u.role === filter);

  // ── الإنشاء ──────────────────────────────────────────────────────────
  const handleCreate = async () => {
    const result = await addUser();
    if (result?.uid) setFilter(result.role); // اقفز للتبويب الموافق
  };

  // ── حفظ التعديل ──────────────────────────────────────────────────────
  // saveUserEdit (من الـ hook) يُحدِّث Firebase ثمّ يُطبِّق التغيير محلياً
  // في optimisticUsers؛ وبما أنّ subscribeUsers تعمل الآن، ستُحدَّث
  // القائمة تلقائياً بمجرّد وصول snapshot جديد من RTDB.
  // نُمرِّر editingUser كمرجع أصلي لـ saveUserEdit حتى تقارن الحقول بشكل صحيح
  // وتُرسل فقط ما تغيّر فعلاً — يُصلح INTERNAL الناتجة عن إرسال displayName:null
  const handleSaveEdit = async (uid, patch) => {
    await saveUserEdit(uid, patch, editingUser);
    setEditingUser(null);
  };

  // ══════════════════════════════════════════════════════════════════
  return (
    <>
      <div style={{ fontSize: 21, fontWeight: 900, color: C.goldLight, marginBottom: 4 }}>
        {t("admin_user_manager_title")}
      </div>
      <div style={{ fontSize: 13, color: C.dim, marginBottom: 20 }}>
        {t("admin_user_manager_subtitle")}
      </div>

      {/* ── نموذج إنشاء حساب جديد ─────────────────────────────────── */}
      <div className="gold-card" style={{ marginBottom: 24 }}>
        <div style={{ fontSize: 14, fontWeight: 800, color: C.gold, marginBottom: 16 }}>
          {t("admin_add_user")}
        </div>

        {/* الدور */}
        <div style={{ fontSize: 12, color: C.goldDim, marginBottom: 6 }}>{t("admin_role")}</div>
        <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
          {[
            { val: "groom",  label: t("admin_role_groom")  },
            { val: "driver", label: t("admin_role_driver") },
            { val: "admin",  label: t("admin_role_admin")  },
          ].map(({ val, label }) => {
            const m = ROLE_META[val];
            const active = newUserRole === val;
            return (
              <button key={val} onClick={() => setNewUserRole(val)} style={{
                flex: 1, padding: "10px 0", borderRadius: 10, cursor: "pointer",
                background: active ? `${m.fg}22` : "rgba(255,255,255,.04)",
                border: `1.5px solid ${active ? m.fg : "rgba(255,255,255,.08)"}`,
                color: active ? m.fg : C.dim,
                fontWeight: 800, fontSize: 13, fontFamily: "inherit",
              }}>{m.icon} {label}</button>
            );
          })}
        </div>

        {/* اسم المستخدم ✱ */}
        <div style={{ fontSize: 12, color: C.goldDim, marginBottom: 6 }}>
          {t("login_user")} <span style={{ color: C.red }}>*</span>
        </div>
        <input className="input-field" type="text" placeholder={t("login_user")}
               value={newUserName} onChange={e => setNewUserName(e.target.value)}
               style={{ marginBottom: 14, direction: "ltr", textAlign: "right" }} />

        {/* كلمة المرور ✱ */}
        <div style={{ fontSize: 12, color: C.goldDim, marginBottom: 6 }}>
          {t("login_pass")} <span style={{ color: C.red }}>*</span>
        </div>
        <input className="input-field" type="password" placeholder="••••••••"
               value={newUserPass} onChange={e => setNewUserPass(e.target.value)}
               style={{ marginBottom: 10, direction: "ltr", textAlign: "right" }} />
        <div style={{ marginBottom: 14 }}>
          <PasswordRules password={newUserPass} t={t} />
        </div>

        {/* الهاتف (اختياري) */}
        <div style={{ fontSize: 12, color: C.goldDim, marginBottom: 6 }}>
          {t("phone_field_label")}
          <span style={{ color: C.dim, fontWeight: 400, marginInlineStart: 6 }}>
            ({t("field_address_optional")})
          </span>
        </div>
        <div style={{ marginBottom: 18 }}>
          <PhoneInput value={newUserPhone} onChange={setNewUserPhone} t={t} lang={lang} />
        </div>

        <button className="gold-btn" style={{ width: "100%" }}
                onClick={handleCreate}
                disabled={!newUserName.trim() || !isStrongPassword(newUserPass)}>
          ➕ {t("admin_create")}
        </button>
      </div>

      {/* ── تبويبات التصفية ───────────────────────────────────────── */}
      <div style={{ display: "flex", gap: 6, marginBottom: 14, flexWrap: "wrap" }}>
        {TABS.map(({ val, label }) => (
          <button key={val} onClick={() => setFilter(val)} style={{
            flex: "1 1 80px", padding: "8px 0", borderRadius: 10, cursor: "pointer",
            background: filter === val ? "rgba(201,168,76,.18)" : "rgba(255,255,255,.04)",
            border: `1px solid ${filter === val ? "rgba(201,168,76,.4)" : "rgba(255,255,255,.08)"}`,
            color: filter === val ? C.gold : C.dim,
            fontSize: 11, fontWeight: 800, fontFamily: "inherit",
          }}>{label}</button>
        ))}
      </div>

      {/* عداد + حالة التحميل */}
      <div style={{ fontSize: 13, color: C.dim, fontWeight: 700, marginBottom: 10, display: "flex", alignItems: "center", gap: 10 }}>
        <span>{t("admin_existing")} ({filtered.length.toLocaleString("en")})</span>
        {usersLoading && (
          <span style={{ fontSize: 11, color: C.goldDim, fontWeight: 400 }}>
            ⟳ {lang === "he" ? "טוען…" : "جاري التحميل…"}
          </span>
        )}
      </div>

      {/* ── قائمة المستخدمين ───────────────────────────────────────── */}
      {!usersLoading && filtered.length === 0 ? (
        <div className="card" style={{ textAlign: "center", padding: 32, color: C.dim }}>
          {t("admin_no_users")}
        </div>
      ) : (
        filtered.map(u => {
          const m         = ROLE_META[u.role] || ROLE_META.groom;
          const uid       = u.uid ?? u.id;
          const isConfirm = confirmDelete === uid;
          const showPhone = u.phoneE164 && !isPlaceholderPhone(u.phoneE164);

          return (
            <div key={uid} className="card" style={{
              marginBottom: 10, padding: "12px 14px",
              display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap",
            }}>
              {/* أيقونة الدور */}
              <div style={{
                width: 40, height: 40, borderRadius: 10, flexShrink: 0,
                background: m.bg, color: m.fg,
                display: "flex", alignItems: "center", justifyContent: "center",
                fontSize: 20,
              }}>{m.icon}</div>

              {/* بيانات المستخدم */}
              <div style={{ flex: "1 1 160px", minWidth: 0 }}>
                {/* اسم المستخدم — بارز ورئيسي */}
                <div style={{
                  fontWeight: 900, fontSize: 15, color: C.goldLight,
                  direction: "ltr", textAlign: "right",
                }}>
                  @{u.username}
                </div>
                {u.displayName && (
                  <div style={{ fontSize: 11, color: C.goldDim, marginTop: 2 }}>
                    {u.displayName}
                  </div>
                )}
                <div style={{ fontSize: 11, color: C.dim, marginTop: 3, display: "flex", flexWrap: "wrap", gap: 6, justifyContent: "flex-end" }}>
                  <span style={{ color: m.fg, fontWeight: 700 }}>
                    {t(`admin_role_${u.role || "groom"}`)}
                  </span>
                  {showPhone && (
                    <span style={{ direction: "ltr" }}>📱 {u.phoneE164}</span>
                  )}
                </div>
              </div>

              {/* أزرار التعديل والحذف */}
              <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
                <button
                  onClick={() => setEditingUser(u)}
                  style={{
                    background: "rgba(201,168,76,.10)", border: "1px solid rgba(201,168,76,.30)",
                    color: C.gold, padding: "6px 14px", borderRadius: 8,
                    fontWeight: 700, fontSize: 12, cursor: "pointer", fontFamily: "inherit",
                  }}
                >
                  ✎ {t("admin_edit")}
                </button>

                {isConfirm ? (
                  <>
                    <button
                      onClick={() => { deleteUser(uid); setConfirmDelete(null); }}
                      style={{
                        background: "rgba(212,80,58,.2)", border: "1px solid rgba(212,80,58,.5)",
                        color: C.red, padding: "6px 12px", borderRadius: 8,
                        fontWeight: 800, fontSize: 12, cursor: "pointer", fontFamily: "inherit",
                      }}
                    >✓ {t("admin_delete_confirm")}</button>
                    <button
                      onClick={() => setConfirmDelete(null)}
                      style={{
                        background: "rgba(255,255,255,.04)", border: "1px solid rgba(255,255,255,.08)",
                        color: C.dim, padding: "6px 10px", borderRadius: 8,
                        fontWeight: 700, fontSize: 12, cursor: "pointer", fontFamily: "inherit",
                      }}
                    >×</button>
                  </>
                ) : (
                  <button
                    onClick={() => setConfirmDelete(uid)}
                    style={{
                      background: "rgba(212,122,75,.12)", border: "1px solid rgba(212,122,75,.3)",
                      color: C.red, padding: "6px 12px", borderRadius: 8,
                      fontWeight: 700, fontSize: 12, cursor: "pointer", fontFamily: "inherit",
                    }}
                  >{t("admin_delete")}</button>
                )}
              </div>
            </div>
          );
        })
      )}

      {/* ── مودال التعديل ────────────────────────────────────────────── */}
      {editingUser && (
        <EditModal
          user={editingUser}
          onSave={handleSaveEdit}
          onCancel={() => setEditingUser(null)}
          t={t}
          lang={lang}
        />
      )}
    </>
  );
}

// ══════════════════════════════════════════════════════════════════════
export function AdminUserManager() {
  return (
    <RoleGuard roles={["admin"]}>
      <UserManagerInner />
    </RoleGuard>
  );
}
