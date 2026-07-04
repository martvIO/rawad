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
import { Num } from "../../../components/Num.jsx";
import { PasswordRules } from "../../../components/PasswordRules.jsx";
import { PhoneInput } from "../../../components/PhoneInput.jsx";
import { TempPasswordModal } from "./TempPasswordModal.jsx";
import { isStrongPassword } from "../../../utils/password.js";
import { isPlaceholderPhone } from "../../../utils/phone.js";
import { C } from "../../../styles/theme.js";
import { useListFilter } from "../../../utils/searchFilter.js";
import { SearchBar } from "../../../components/SearchBar.jsx";
import { SkeletonList } from "../../../components/Skeleton.jsx";

// ── مبدّل لغة رسالة الواتساب (ar/he) — يُستخدم في الإنشاء وإعادة التعيين ──
function LangToggle({ value, onChange, t, disabled, idPrefix = "new" }) {
  return (
    <div>
      <div style={{ fontSize: 12, color: C.goldDim, marginBottom: 6 }}>{t("admin_send_lang")}</div>
      <div style={{ display: "flex", gap: 8 }}>
        {[["ar", "العربية"], ["he", "עברית"]].map(([val, label]) => {
          const active = value === val;
          return (
            <button key={val} data-testid={`btn-${idPrefix}-lang-${val}`} disabled={disabled}
                    onClick={() => onChange(val)} style={{
              flex: 1, padding: "8px 0", borderRadius: 10, cursor: "pointer",
              background: active ? "rgba(201,168,76,.18)" : "rgba(255,255,255,.04)",
              border: `1.5px solid ${active ? C.gold : "rgba(255,255,255,.08)"}`,
              color: active ? C.gold : C.dim,
              fontWeight: 800, fontSize: 12, fontFamily: "inherit",
            }}>{label}</button>
          );
        })}
      </div>
    </div>
  );
}

// ── حقول البحث النصّي + حقول الهاتف (ثابتة على مستوى الوحدة) ──────────
const USERS_FIELDS = ["username", "displayName", (u) => u.role];
const USERS_PHONE  = ["phoneE164"];

// ── ألوان وأيقونات لكل دور ───────────────────────────────────────────
const ROLE_META = {
  admin:  { bg: "rgba(212,80,58,.15)",  fg: C.red,  icon: "🔒" },
  driver: { bg: "rgba(75,159,212,.15)", fg: C.blue, icon: "🚗" },
  groom:  { bg: "rgba(201,168,76,.15)", fg: C.gold, icon: "♥"  },
};

// ── مفتاح صلاحية (Toggle) — يُستخدم في الإنشاء والتعديل للعرسان ───────
// صلاحيتان يتحكّم بهما المدير لكلّ عريس:
//   • ظهور الحضور      (canSeeAttendance)   — هل يرى العريس مَن أكّد حضوره؟
//   • منطقة المصوّر     (canUsePhotographer) — هل تتاح له صفحة المصوّر؟
function FlagToggle({ label, hint, value, onChange, disabled }) {
  return (
    <div
      onClick={disabled ? undefined : () => onChange(!value)}
      style={{
        display: "flex", alignItems: "center", gap: 12, padding: "12px 14px",
        marginBottom: 10, borderRadius: 12, cursor: disabled ? "default" : "pointer",
        background: value ? "rgba(76,201,122,.06)" : "rgba(255,255,255,.03)",
        border: `1px solid ${value ? "rgba(76,201,122,.32)" : "rgba(255,255,255,.1)"}`,
        transition: "background .15s, border-color .15s", opacity: disabled ? .55 : 1,
      }}
    >
      {/* المقبض المنزلق */}
      <div style={{
        width: 42, height: 24, borderRadius: 999, flexShrink: 0, position: "relative",
        background: value ? "#2da85a" : "rgba(255,255,255,.14)", transition: "background .2s",
      }}>
        <div style={{
          position: "absolute", top: 3, insetInlineStart: value ? 21 : 3,
          width: 18, height: 18, borderRadius: "50%", background: "#fff",
          transition: "inset-inline-start .2s",
        }} />
      </div>
      <div style={{ flex: 1, textAlign: "start" }}>
        <div style={{ fontSize: 13, fontWeight: 800, color: value ? "#4cc97a" : C.goldDim }}>{label}</div>
        {hint && <div style={{ fontSize: 10.5, color: C.dim, marginTop: 2, lineHeight: 1.5 }}>{hint}</div>}
      </div>
    </div>
  );
}

// ── مربّع تعديل مضمَّن (Inline Edit Modal) ──────────────────────────
// يظهر عند الضغط على «تعديل» في سطر المستخدم ويتيح تغيير:
//   username  |  phone (اختياري)  |  role  |  الصلاحيات
// كلمة المرور: للمدراء حقل يدوي (كما كان)؛ للعريس/المرسل زرّ «إعادة تعيين»
// يولّد كلمة جديدة في الخادم ويرسلها بواتساب (onResetPassword).
function EditModal({ user, onSave, onCancel, onResetPassword, t, lang }) {
  const [username,    setUsername]    = useState(user.username    ?? "");
  const [displayName, setDisplayName] = useState(user.displayName ?? "");
  const [phoneE164,   setPhoneE164]   = useState(
    isPlaceholderPhone(user.phoneE164) ? "" : (user.phoneE164 ?? ""),
  );
  const [role,        setRole]        = useState(user.role        ?? "groom");
  const [newPass,     setNewPass]     = useState("");
  const [saving,      setSaving]      = useState(false);
  // إعادة تعيين كلمة مرور عريس/مرسل — لغة رسالة الواتساب + حالة الإرسال.
  const [resetLang,   setResetLang]   = useState("ar");
  const [resetting,   setResetting]   = useState(false);
  // صلاحيتا العريس — افتراضاً مُفعّلتان (backward-compatible).
  const [canSee,   setCanSee]   = useState(user.canSeeAttendance   !== false);
  const [canPhoto, setCanPhoto] = useState(user.canUsePhotographer !== false);
  // بطاقة المحفظة — افتراضاً متوقّفة.
  const [canBoarding, setCanBoarding] = useState(user.canUseBoardingPass === true);

  // الحقل اليدوي يخصّ المدراء فقط — الخادم يرفضه للعريس/المرسل (409).
  const manualPassword = role === "admin";
  const canSave = username.trim() &&
    (!manualPassword || newPass.length === 0 || isStrongPassword(newPass));

  const handleReset = async () => {
    if (resetting || saving) return;
    setResetting(true);
    try {
      await onResetPassword(user.uid ?? user.id, resetLang);
    } finally {
      setResetting(false);
    }
  };

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
    if (manualPassword && newPass.trim())
      patch.newPassword = newPass.trim();
    // صلاحيتا العريس — نُرسلهما دائماً للعرسان؛ saveUserEdit يقارن ويكتب المتغيّر فقط.
    if (role === "groom") {
      patch.canSeeAttendance   = canSee;
      patch.canUsePhotographer = canPhoto;
      patch.canUseBoardingPass = canBoarding;
    }
    // NOTE: never log `patch` — it can contain patch.newPassword (a plaintext
    // password), which would leak into the browser console / any log sink.
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
          <span style={{ color: C.gold, fontWeight: 900, fontSize: 17, fontFamily: "'Amiri','Frank Ruhl Libre',serif" }}>
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

        {/* كلمة المرور: حقل يدوي للمدراء، إعادة تعيين مُولَّدة للعريس/المرسل */}
        {manualPassword ? (
          <>
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
          </>
        ) : (
          <div style={{
            marginBottom: 18, padding: "12px 14px", borderRadius: 12,
            background: "rgba(255,255,255,.03)", border: "1px solid rgba(255,255,255,.1)",
          }}>
            <div style={{ fontSize: 12, color: C.goldDim, fontWeight: 700, marginBottom: 4 }}>
              {t("admin_user_edit_new_password")}
            </div>
            <div style={{ fontSize: 10.5, color: C.dim, lineHeight: 1.6, marginBottom: 10 }}>
              {t("admin_reset_pw_hint")}
            </div>
            <div style={{ marginBottom: 10 }}>
              <LangToggle value={resetLang} onChange={setResetLang} t={t}
                          disabled={resetting || saving} idPrefix="reset" />
            </div>
            <button data-testid="btn-reset-password" className="ghost-btn"
                    style={{ width: "100%" }} disabled={resetting || saving}
                    onClick={handleReset}>
              🔑 {resetting ? t("admin_resetting_pw") : t("admin_reset_pw")}
            </button>
          </div>
        )}

        {/* صلاحيات العريس — للعرسان فقط */}
        {role === "groom" && (
          <div style={{ marginBottom: 18 }}>
            <div style={{ fontSize: 12, color: C.goldDim, marginBottom: 8, fontWeight: 700 }}>
              {lang === "he" ? "הרשאות" : "الصلاحيات"}
            </div>
            <FlagToggle
              value={canSee} onChange={setCanSee} disabled={saving}
              label={lang === "he" ? "📊 הצגת נוכחות" : "📊 ظهور الحضور"}
              hint={lang === "he"
                ? "האם החתן רואה מי אישר הגעה ואת אחוז הנוכחות"
                : "هل يرى العريس مَن أكّد حضوره ونسبة الحضور"}
            />
            <FlagToggle
              value={canPhoto} onChange={setCanPhoto} disabled={saving}
              label={lang === "he" ? "📸 אזור הצלם" : "📸 منطقة المصوّر"}
              hint={lang === "he"
                ? "האם אזור הצלם זמין לחתן"
                : "هل تتاح صفحة المصوّر للعريس"}
            />
            <FlagToggle
              value={canBoarding} onChange={setCanBoarding} disabled={saving}
              label={lang === "he" ? "🎟️ כרטיס ארנק" : "🎟️ بطاقة المحفظة"}
              hint={lang === "he"
                ? "האם אפשר להוסיף את ההזמנה לארנק אפל/גוגל"
                : "هل تتاح للضيوف إضافة الدعوة إلى محفظة آبل/جوجل"}
            />
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
    t, lang, showToast,
    // القائمة الحيّة (Firebase RTDB) + الإضافات التفاؤلية مدموجة في `users`
    users, usersLoading,
    addUser, deleteUser, saveUserEdit, resetUserPassword,
    newUserRole, setNewUserRole,
    newUserName, setNewUserName,
    newUserPass, setNewUserPass,
    newUserPhone, setNewUserPhone,
    newUserLang, setNewUserLang,
    newUserNoPhone, setNewUserNoPhone,
  } = usePortal();

  // ── الحالة المحلية ──────────────────────────────────────────────────
  const [filter,         setFilter]         = useState("all");
  const [confirmDelete,  setConfirmDelete]  = useState(null); // uid المراد حذفه
  const [editingUser,    setEditingUser]    = useState(null); // المستخدم الذي يُعدَّل
  // بيانات الدخول المُولَّدة التي لم تُرسل بواتساب — تُعرض مرة واحدة للنسخ.
  // NOTE: never log this — it carries a plaintext password.
  const [tempCreds,      setTempCreds]      = useState(null);
  // صلاحيتا العريس الجديد — افتراضاً مُفعّلتان.
  const [newCanSee,   setNewCanSee]   = useState(true);
  const [newCanPhoto, setNewCanPhoto] = useState(true);
  // بطاقة المحفظة للعريس الجديد — افتراضاً متوقّفة.
  const [newCanBoarding, setNewCanBoarding] = useState(false);

  // تبويبات التصفية
  const TABS = [
    { val: "all",    label: t("admin_user_filter_all")     },
    { val: "groom",  label: t("admin_user_filter_grooms")  },
    { val: "driver", label: t("admin_user_filter_drivers") },
    { val: "admin",  label: t("admin_user_filter_admins")  },
  ];

  // القائمة المُصفَّاة حسب الدور (تبويبات التصفية)
  const filtered = filter === "all" ? users : users.filter(u => u.role === filter);

  // بحث نصّي فوق القائمة المُصفَّاة بالدور — يُركَّب فوق تبويبات الدور
  // (لا توجد رقائق حالة هنا؛ التبويبات نفسها هي مرشّح الحالة)
  const {
    query, setQuery,
    filtered: visibleUsers,
  } = useListFilter(filtered, {
    fields: USERS_FIELDS,
    phoneFields: USERS_PHONE,
    lang,
  });

  // ── الإنشاء ──────────────────────────────────────────────────────────
  const handleCreate = async () => {
    const result = await addUser({ canSeeAttendance: newCanSee, canUsePhotographer: newCanPhoto, canUseBoardingPass: newCanBoarding });
    if (result?.uid) {
      setFilter(result.role);        // اقفز للتبويب الموافق
      setNewCanSee(true); setNewCanPhoto(true); setNewCanBoarding(false); // أعد الصلاحيات للوضع الافتراضي
      // كلمة مرور مُولَّدة لم تُرسل بواتساب → اعرضها مرة واحدة للنسخ اليدوي.
      const creds = result.credentials;
      if (creds && !creds.delivered && creds.password) {
        setTempCreds({ username: result.username, password: creds.password, phoneE164: result.phoneE164 });
      }
    }
  };

  // ── إعادة تعيين كلمة مرور (من مودال التعديل) ─────────────────────────
  const handleResetPassword = async (uid, resetLang) => {
    const creds = await resetUserPassword(uid, resetLang);
    if (!creds) return; // الخطأ ظهر Toast من الـ hook
    if (creds.delivered) {
      showToast(t("admin_pw_sent_wa"));
    } else if (creds.password) {
      const target = users.find(u => (u.uid ?? u.id) === uid) || editingUser || {};
      setTempCreds({ username: target.username, password: creds.password, phoneE164: target.phoneE164 });
    }
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
              <button key={val} data-testid={`btn-new-role-${val}`} onClick={() => setNewUserRole(val)} style={{
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
        <input data-testid="field-new-user" className="input-field" type="text" placeholder={t("login_user")}
               value={newUserName} onChange={e => setNewUserName(e.target.value)}
               style={{ marginBottom: 14, direction: "ltr", textAlign: "right" }} />

        {/* كلمة المرور — للمدراء فقط؛ العريس/المرسل تُولَّد لهم تلقائياً */}
        {newUserRole === "admin" ? (
          <>
            <div style={{ fontSize: 12, color: C.goldDim, marginBottom: 6 }}>
              {t("login_pass")} <span style={{ color: C.red }}>*</span>
            </div>
            <input data-testid="field-new-pass" className="input-field" type="password" placeholder="••••••••"
                   value={newUserPass} onChange={e => setNewUserPass(e.target.value)}
                   style={{ marginBottom: 10, direction: "ltr", textAlign: "right" }} />
            <div style={{ marginBottom: 14 }}>
              <PasswordRules password={newUserPass} t={t} />
            </div>
          </>
        ) : (
          <div data-testid="autogen-hint" style={{
            fontSize: 11.5, color: C.goldDim, lineHeight: 1.7, marginBottom: 14,
            padding: "10px 12px", borderRadius: 10,
            background: "rgba(201,168,76,.06)", border: "1px solid rgba(201,168,76,.22)",
          }}>
            🔑 {t("admin_pw_autogen_hint")}
          </div>
        )}

        {/* الهاتف — إلزامي للعريس/المرسل (وجهة رسالة بيانات الدخول)، اختياري للمدير */}
        <div style={{ fontSize: 12, color: C.goldDim, marginBottom: 6 }}>
          {t("phone_field_label")}
          {newUserRole === "admin" ? (
            <span style={{ color: C.dim, fontWeight: 400, marginInlineStart: 6 }}>
              ({t("field_address_optional")})
            </span>
          ) : (
            !newUserNoPhone && <span style={{ color: C.red }}> *</span>
          )}
        </div>
        <div style={{ marginBottom: newUserRole === "admin" ? 18 : 10 }}>
          <PhoneInput value={newUserPhone} onChange={setNewUserPhone} t={t} lang={lang}
                      disabled={newUserRole !== "admin" && newUserNoPhone} />
        </div>
        {newUserRole !== "admin" && (
          <div style={{ marginBottom: 18 }}>
            {/* «بدون هاتف الآن» — تخطٍّ مقصود لشرط الهاتف؛ تُعرض كلمة المرور للنسخ */}
            <label data-testid="chk-no-phone-label" style={{
              display: "flex", alignItems: "center", gap: 8, cursor: "pointer",
              fontSize: 12, color: newUserNoPhone ? C.gold : C.dim, fontWeight: 700,
              marginBottom: 12, userSelect: "none",
            }}>
              <input data-testid="chk-no-phone" type="checkbox" checked={newUserNoPhone}
                     onChange={e => { setNewUserNoPhone(e.target.checked); if (e.target.checked) setNewUserPhone(""); }}
                     style={{ accentColor: "#c9a84c", width: 16, height: 16 }} />
              {t("admin_no_phone_yet")}
            </label>
            <LangToggle value={newUserLang} onChange={setNewUserLang} t={t} idPrefix="new" />
          </div>
        )}

        {/* صلاحيات العريس الجديد — للعرسان فقط */}
        {newUserRole === "groom" && (
          <div style={{ marginBottom: 18 }}>
            <div style={{ fontSize: 12, color: C.goldDim, marginBottom: 8, fontWeight: 700 }}>
              {lang === "he" ? "הרשאות" : "الصلاحيات"}
            </div>
            <FlagToggle
              value={newCanSee} onChange={setNewCanSee}
              label={lang === "he" ? "📊 הצגת נוכחות" : "📊 ظهور الحضور"}
              hint={lang === "he"
                ? "האם החתן רואה מי אישר הגעה ואת אחוז הנוכחות"
                : "هل يرى العريس مَن أكّد حضوره ونسبة الحضور"}
            />
            <FlagToggle
              value={newCanPhoto} onChange={setNewCanPhoto}
              label={lang === "he" ? "📸 אזור הצלם" : "📸 منطقة المصوّر"}
              hint={lang === "he"
                ? "האם אזור הצלם זמין לחתן"
                : "هل تتاح صفحة المصوّر للعريس"}
            />
            <FlagToggle
              value={newCanBoarding} onChange={setNewCanBoarding}
              label={lang === "he" ? "🎟️ כרטיס ארנק" : "🎟️ بطاقة المحفظة"}
              hint={lang === "he"
                ? "האם אפשר להוסיף את ההזמנה לארנק אפל/גוגל"
                : "هل تتاح للضيوف إضافة الدعوة إلى محفظة آبل/جوجل"}
            />
          </div>
        )}

        <button data-testid="btn-create-user" className="gold-btn" style={{ width: "100%" }}
                onClick={handleCreate}
                disabled={!newUserName.trim() || (newUserRole === "admin"
                  ? !isStrongPassword(newUserPass)
                  : (!newUserPhone.trim() && !newUserNoPhone))}>
          ➕ {t("admin_create")}
        </button>
      </div>

      {/* ── تبويبات التصفية ───────────────────────────────────────── */}
      <div style={{ display: "flex", gap: 6, marginBottom: 14, flexWrap: "wrap" }}>
        {TABS.map(({ val, label }) => (
          <button key={val} data-testid={`btn-filter-${val === "all" ? "all" : val + "s"}`} onClick={() => setFilter(val)} style={{
            flex: "1 1 80px", padding: "8px 0", borderRadius: 10, cursor: "pointer",
            background: filter === val ? "rgba(201,168,76,.18)" : "rgba(255,255,255,.04)",
            border: `1px solid ${filter === val ? "rgba(201,168,76,.4)" : "rgba(255,255,255,.08)"}`,
            color: filter === val ? C.gold : C.dim,
            fontSize: 11, fontWeight: 800, fontFamily: "inherit",
          }}>{label}</button>
        ))}
      </div>

      {/* ── بحث نصّي داخل القائمة المُصفَّاة بالدور ─────────────────── */}
      <SearchBar
        value={query}
        onChange={setQuery}
        lang={lang}
        placeholder={t("search_users_placeholder")}
        resultCount={visibleUsers.length}
        totalCount={filtered.length}
      />

      {/* عداد */}
      <div style={{ fontSize: 13, color: C.dim, fontWeight: 700, marginBottom: 10, display: "flex", alignItems: "center", gap: 10 }}>
        <span>{t("admin_existing")} (<Num>{filtered.length.toLocaleString("en")}</Num>)</span>
      </div>

      {/* ── قائمة المستخدمين ───────────────────────────────────────── */}
      {usersLoading && filtered.length === 0 ? (
        <SkeletonList variant="row" count={5} />
      ) : !usersLoading && filtered.length === 0 ? (
        <div className="card" style={{ textAlign: "center", padding: 32, color: C.dim }}>
          {t("admin_no_users")}
        </div>
      ) : query.trim() && visibleUsers.length === 0 ? (
        <div className="card" style={{ textAlign: "center", padding: 24, color: C.dim }}>
          {t("search_no_results")}
        </div>
      ) : (
        visibleUsers.map(u => {
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
                    <button data-testid="btn-delete-user-confirm"
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
                  <button data-testid="btn-delete-user"
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
          onResetPassword={handleResetPassword}
          t={t}
          lang={lang}
        />
      )}

      {/* ── كلمة المرور المؤقتة (تُعرض مرة واحدة عند فشل إرسال الواتساب) ── */}
      <TempPasswordModal
        creds={tempCreds}
        onClose={() => setTempCreds(null)}
        t={t}
        showToast={showToast}
      />
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
