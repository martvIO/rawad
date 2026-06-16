// Users domain — the admin's live /users subscription merged with the
// localStorage-backed optimistic additions, groom profiles, the new-user
// form, and the user-edit modal lifecycle. Extracted from usePortalState;
// the returned `users` shape (admin merge / driver synthetic entry) is
// unchanged.
import { useEffect, useMemo, useRef, useState } from "react";
import { isStrongPassword } from "../../utils/password.js";
import { logErr } from "../../utils/logger.js";
import { localizeApiError } from "../../utils/apiError.js";
import { ROLES } from "../../constants/roles.js";
import { forceRefreshToken } from "../../services/auth.js";
import {
  subscribeUsers, subscribeGroomProfiles,
  createPortalUser, deletePortalUser,
  updatePortalUser as updatePortalUserSrv,
  adminSetPassword as adminSetPasswordSrv,
  patchUserInRTDB,
  upsertGroomProfile, removeGroomProfile,
} from "../../services/users.js";

export function usePortalUsers({ authed, isAdmin, currentUid, userType, driverServingGroom, t, showToast }) {
  // قائمة العرسان العامة — مرئية لجميع المستخدمين (مرسلين + عرسان + أدمن).
  // تُستخدم في واجهة المرسل لاختيار من يشارك معهم موقعه / البلدات المشتركة.
  const [groomProfiles, setGroomProfiles] = useState([]);
  useEffect(() => {
    if (!authed) { setGroomProfiles([]); return; }
    return subscribeGroomProfiles(setGroomProfiles);
  }, [authed]);

  // Users (admin sees full /users; drivers see their assigned groom as a synthetic single entry)
  const [adminUsers, setAdminUsers] = useState([]);
  const [usersLoading, setUsersLoading] = useState(false);
  useEffect(() => {
    if (!isAdmin) { setAdminUsers([]); return; }
    setUsersLoading(true);
    let unsub = () => {};
    // نجدّد الـ JWT قبل الاشتراك: يضمن أنّ قواعد RTDB ترى الـ claim الصحيحة
    // (role === 'admin') من أوّل طلب، دون انتظار دورة التحديث التلقائية (ساعة).
    forceRefreshToken()
      .catch(() => {/* إذا فشل التجديد نكمل بالتوكن الحالي */})
      .finally(() => {
        unsub = subscribeUsers((list) => {
          setAdminUsers(list);
          setUsersLoading(false);
        });
      });
    return () => unsub();
  }, [isAdmin]);

  // ── إضافات تفاؤلية لقائمة الأدمن (مع حفظ في localStorage) ──
  // عند إنشاء/تعديل حساب نُحدّث هذه القائمة فوراً حتى لا ننتظر subscribeUsers
  // الحي (الذي قد يكون مرفوضاً من قواعد RTDB إذا لم يُنشر التحديث بعد).
  // نحفظها في localStorage باسم مفتاح خاص بكلّ أدمن (currentUid)، فتنجو
  // من إعادة تحميل الصفحة. تبقى مقيّدة بالمتصفّح الواحد — الحلّ النهائي
  // للقائمة الكاملة هو نشر قواعد RTDB الجديدة.
  const OPTIMISTIC_KEY = (uid) => `dawa.optimisticUsers.${uid}`;
  const [optimisticUsers, setOptimisticUsersRaw] = useState([]);
  // مرجع لمعرفة هل حُمّلت قائمة الـ uid الحالي من localStorage بعد، حتى لا
  // نطمس البيانات المخزّنة بمصفوفة فارغة قبل أن نقرأ من الـ storage.
  const optimisticLoadedFor = useRef(null);
  // حمّل القائمة المخزّنة محلياً عندما يُعرف uid الأدمن.
  useEffect(() => {
    if (!isAdmin || !currentUid) return;
    if (optimisticLoadedFor.current === currentUid) return;
    optimisticLoadedFor.current = currentUid;
    try {
      const raw = localStorage.getItem(OPTIMISTIC_KEY(currentUid));
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) setOptimisticUsersRaw(parsed);
      }
    } catch (e) { logErr("loadOptimisticUsers", e); }
  }, [isAdmin, currentUid]);
  // أيّ تحديث للقائمة يُحفظ مباشرةً في localStorage (إن كان الـ uid معروفاً).
  const setOptimisticUsers = (updater) => {
    setOptimisticUsersRaw(prev => {
      const next = typeof updater === "function" ? updater(prev) : updater;
      if (isAdmin && currentUid) {
        try { localStorage.setItem(OPTIMISTIC_KEY(currentUid), JSON.stringify(next)); }
        catch (e) { logErr("saveOptimisticUsers", e); }
      }
      return next;
    });
  };
  const users = useMemo(() => {
    if (isAdmin) {
      // ندمج القائمة الحية مع الإضافات التفاؤلية ونُزيل المكررات بالـ uid:
      // إذا ظهر السجل الحقيقي في Firebase نُسقط نسخته التفاؤلية.
      const liveUids = new Set(adminUsers.map(u => u.uid || u.id));
      const ghosts   = optimisticUsers.filter(o => !liveUids.has(o.uid));
      return [...adminUsers, ...ghosts];
    }
    if (userType === ROLES.DRIVER && driverServingGroom) {
      return [{
        uid: driverServingGroom.uid,
        id:  driverServingGroom.uid,
        username: driverServingGroom.username,
        role: ROLES.GROOM,
      }];
    }
    return [];
  }, [isAdmin, adminUsers, optimisticUsers, userType, driverServingGroom]);

  // Admin user-creation form
  const [newUserRole,  setNewUserRole]  = useState("groom");
  const [newUserName,  setNewUserName]  = useState("");
  const [newUserPass,  setNewUserPass]  = useState("");
  const [newUserPhone, setNewUserPhone] = useState("");

  // Admin user-edit modal (full row selected; null = modal closed)
  const [editingUser, setEditingUser] = useState(null);

  // ── Admin user management ───────────────────────────────────────────────────
  // عند نجاح الإنشاء نُضيف الحساب الجديد إلى optimisticUsers فوراً، حتى يظهر
  // في القائمة قبل أن يلتقطه subscribeUsers الحي. النتيجة المُعادة تُمكّن
  // الصفحة من القفز للتبويب الموافق للدور.
  //
  // ملاحظة: الـ Cloud Function المنشورة حالياً ما زالت تشترط رقم هاتف
  // E.164 صالحاً (تمرّره إلى Firebase Auth التي تستخدم libphonenumber).
  // لا يوجد بادئة وهميّة آمنة 100%، فالهاتف مطلوب حتى ينشر الأدمن النسخة
  // الجديدة من الدالّة.
  const addUser = async (opts = {}) => {
    if (!newUserName.trim() || !newUserPass.trim()) { showToast(t("admin_required")); return null; }
    if (!isStrongPassword(newUserPass)) { showToast(t("pwd_weak")); return null; }
    const username   = newUserName.trim().toLowerCase();
    const role       = newUserRole;
    // صلاحيتا العريس (افتراضاً مُفعّلتان). تُمرَّران من نموذج الإنشاء.
    const canSeeAttendance   = opts.canSeeAttendance   !== false;
    const canUsePhotographer = opts.canUsePhotographer !== false;
    // بطاقة المحفظة — افتراضاً متوقّفة (يفعّلها الأدمن لكل عريس).
    const canUseBoardingPass = opts.canUseBoardingPass === true;
    // الهاتف اختياري في الواجهة. إذا تُرك فارغاً نُولِّد رقماً وهمياً
    // بنطاق +1202555XXXX (محجوز رسمياً للاستخدام الاختباري في NANP؛
    // تقبله libphonenumber / Firebase Auth كصيغة E.164 صالحة).
    // يُحذف هذا التحايل بعد نشر Cloud Function الجديدة التي لا تشترط الهاتف.
    const typedPhone = newUserPhone.trim();
    const phoneE164  = typedPhone ||
      ("+1202555" + (Date.now() % 10000).toString().padStart(4, "0"));
    try {
      const result = await createPortalUser({ username, password: newUserPass, role, phoneE164, canSeeAttendance, canUsePhotographer, canUseBoardingPass });
      const uid = result?.uid;
      const newRow = { uid, id: uid, username, role, phoneE164, canSeeAttendance, canUsePhotographer, canUseBoardingPass };
      if (uid) {
        setOptimisticUsers(prev => [...prev, newRow]);
        // إذا كان دور الحساب الجديد "عريس" نكتب سجله في /groomProfiles مباشرةً
        // من الكلايَنت حتى يظهر فوراً في القوائم (بدون انتظار نشر Cloud Function).
        if (role === ROLES.GROOM) {
          upsertGroomProfile(uid, { username }).catch(() => {});
        }
      }
      setNewUserName(""); setNewUserPass(""); setNewUserPhone("");
      showToast(t("admin_added"));
      return newRow;
    } catch (e) {
      logErr("addUser", e);
      showToast(localizeApiError(e, t, t("admin_taken")));
      return null;
    }
  };
  // عند الحذف نُزيل السجل من القائمة التفاؤلية أيضاً حتى لو لم يكن قد وصل بعد
  // من Firebase، لئلا يبقى ظاهراً بعد تأكيد الحذف.
  const deleteUser = async (uid) => {
    try {
      await deletePortalUser(uid);
      setOptimisticUsers(prev => prev.filter(o => o.uid !== uid));
      // أزل من groomProfiles إن كان الحساب عريساً (بلا أثر إن لم يكن)
      removeGroomProfile(uid).catch(() => {});
      showToast(t("admin_deleted"));
    } catch (e) { logErr("deleteUser", e); showToast(localizeApiError(e, t)); }
  };

  // Admin user-edit lifecycle. Open the modal with a user row, save patches
  // through updatePortalUser, and (optionally) set a fresh password via
  // adminSetPassword. The Cloud Functions are authoritative — these client
  // helpers just choose what to send.
  const startEditUser = (u) => setEditingUser(u);
  const cancelEditUser = () => setEditingUser(null);
  // ── saveUserEdit ────────────────────────────────────────────────────────────
  // الحلّ لـ INTERNAL: نُقسِّم التعديل إلى مسارات مستقلّة حسب نوع الحقل:
  //
  //  1. displayName   → RTDB مباشرةً (/users/{uid}/displayName).
  //                    لا يمرّ عبر Cloud Function لأنّ Auth.updateUser(displayName:null)
  //                    يُسبّب INTERNAL على بعض أنواع الحسابات.
  //  2. username / phone / role → Cloud Function (updatePortalUser) — تحتاج
  //                    تحديث Auth email / phoneNumber / custom claims + indices.
  //  3. password      → Cloud Function (adminSetPassword) — مستقلّة دائماً.
  //
  // هذا التقسيم يُعزل كل نقطة فشل ممكنة ويُظهر رسالة خطأ دقيقة للمشخّص.
  //
  // يقبل `originalUser` كمرجع للمقارنة (من الكلايَنت) أو يُستخدم hook-level
  // editingUser إن لم يُمرَّر.
  const saveUserEdit = async (uid, patch, originalUser) => {
    if (!uid) return;
    const orig = originalUser ?? editingUser ?? {};

    const newUsername    = patch?.username?.trim().toLowerCase() ?? "";
    const newDisplayName = typeof patch?.displayName === "string" ? patch.displayName.trim() : undefined;
    const newPhoneE164   = patch?.phoneE164?.trim() ?? "";
    const newRole        = typeof patch?.role === "string" ? patch.role : undefined;
    const newPassword    = patch?.newPassword?.trim() || null;
    // صلاحيتا العريس — قِيَم boolean صريحة فقط (undefined = لم تُرسل).
    const newCanSee      = typeof patch?.canSeeAttendance   === "boolean" ? patch.canSeeAttendance   : undefined;
    const newCanPhoto    = typeof patch?.canUsePhotographer === "boolean" ? patch.canUsePhotographer : undefined;
    const newCanBoarding = typeof patch?.canUseBoardingPass === "boolean" ? patch.canUseBoardingPass : undefined;

    // ─ ما الذي تغيّر فعلاً؟ ──────────────────────────────────────────────
    const usernameChanged    = newUsername    && newUsername    !== (orig.username ?? "");
    const displayNameChanged = newDisplayName !== undefined
                               && newDisplayName !== (orig.displayName ?? "");
    const phoneChanged       = newPhoneE164   && newPhoneE164   !== (orig.phoneE164 ?? "");
    const roleChanged        = newRole        && newRole        !== (orig.role    ?? "");
    // المقارنة تُطبِّع الغياب على true (الافتراضي backward-compatible).
    const seeChanged         = newCanSee   !== undefined && newCanSee   !== (orig.canSeeAttendance   !== false);
    const photoChanged       = newCanPhoto !== undefined && newCanPhoto !== (orig.canUsePhotographer !== false);
    // بطاقة المحفظة الافتراضي OFF — نُطبِّع الغياب على false.
    const boardingChanged    = newCanBoarding !== undefined && newCanBoarding !== (orig.canUseBoardingPass === true);
    const flagsChanged       = seeChanged || photoChanged || boardingChanged;
    const needsFunction      = usernameChanged || phoneChanged || roleChanged;
    const needsPassword      = !!newPassword;
    const needsDisplayName   = displayNameChanged;
    const nothingChanged     = !usernameChanged && !displayNameChanged
                               && !phoneChanged && !roleChanged && !needsPassword && !flagsChanged;

    // ─ console.log للتشخيص ──────────────────────────────────────────────
    console.log("[dawa] saveUserEdit — diff:", {
      uid,
      usernameChanged, displayNameChanged, phoneChanged, roleChanged,
      needsPassword,
      functionPayload: needsFunction
        ? { uid, ...(usernameChanged && { username: newUsername }),
            ...(phoneChanged   && { phoneE164: newPhoneE164 }),
            ...(roleChanged    && { role: newRole }) }
        : null,
    });

    if (nothingChanged) { showToast(t("admin_no_changes")); return; }

    try {
      // ── 1. displayName: كتابة RTDB مباشرة (لا Cloud Function) ─────────
      if (needsDisplayName) {
        console.log("[dawa] patchUserInRTDB displayName:", { uid, displayName: newDisplayName || null });
        await patchUserInRTDB(uid, { displayName: newDisplayName || null });
      }

      // ── 2. username / phone / role: Cloud Function updatePortalUser ────
      if (needsFunction) {
        const payload = { uid };
        if (usernameChanged) payload.username  = newUsername;
        if (phoneChanged)    payload.phoneE164 = newPhoneE164;
        if (roleChanged)     payload.role      = newRole;
        console.log("[dawa] updatePortalUser:", payload);
        await updatePortalUserSrv(payload);
      }

      // ── 3. password: Cloud Function adminSetPassword ───────────────────
      if (needsPassword) {
        console.log("[dawa] adminSetPassword uid:", uid);
        await adminSetPasswordSrv(uid, newPassword);
      }

      // ── 4. صلاحيات العريس: كتابة RTDB مباشرة عبر PATCH /users/:uid ──────
      //     (allowlist في الخادم يقبل canSeeAttendance/canUsePhotographer/canUseBoardingPass)
      if (flagsChanged) {
        const fp = {};
        if (seeChanged)      fp.canSeeAttendance   = newCanSee;
        if (photoChanged)    fp.canUsePhotographer = newCanPhoto;
        if (boardingChanged) fp.canUseBoardingPass = newCanBoarding;
        console.log("[dawa] patchUserInRTDB flags:", { uid, ...fp });
        await patchUserInRTDB(uid, fp);
      }

      // ── حدّث الحالة المحلية فوراً ──────────────────────────────────────
      const localPatch = {
        ...(usernameChanged    && { username:    newUsername }),
        ...(displayNameChanged && { displayName: newDisplayName }),
        ...(phoneChanged       && { phoneE164:   newPhoneE164 }),
        ...(roleChanged        && { role:        newRole }),
        ...(seeChanged         && { canSeeAttendance:   newCanSee }),
        ...(photoChanged       && { canUsePhotographer: newCanPhoto }),
        ...(boardingChanged    && { canUseBoardingPass: newCanBoarding }),
      };
      const mergedUser = { ...orig, uid, id: uid, ...localPatch };
      setOptimisticUsers(prev => {
        const idx = prev.findIndex(o => o.uid === uid);
        if (idx >= 0) { const next = [...prev]; next[idx] = mergedUser; return next; }
        return [...prev, mergedUser];
      });

      // ── مزامنة /groomProfiles ────────────────────────────────────────
      const finalRole     = localPatch.role     ?? orig.role;
      const finalUsername = localPatch.username ?? orig.username ?? "";
      const finalDN       = localPatch.displayName !== undefined
                              ? localPatch.displayName
                              : (orig.displayName ?? undefined);
      if (finalRole === ROLES.GROOM) {
        upsertGroomProfile(uid, { username: finalUsername, displayName: finalDN }).catch(() => {});
      } else if (orig.role === ROLES.GROOM && finalRole && finalRole !== ROLES.GROOM) {
        removeGroomProfile(uid).catch(() => {});
      }

      setEditingUser(null);
      showToast(t("admin_user_edit_saved"));

    } catch (e) {
      logErr("saveUserEdit", e);
      console.error("[dawa] saveUserEdit FAILED:", { code: e?.code, message: e?.message, details: e?.details });
      showToast(localizeApiError(e, t, t("admin_taken")));
    }
  };

  return {
    groomProfiles,
    adminUsers, users, usersLoading,
    addUser, deleteUser,
    newUserRole, setNewUserRole, newUserName, setNewUserName,
    newUserPass, setNewUserPass, newUserPhone, setNewUserPhone,
    editingUser, startEditUser, cancelEditUser, saveUserEdit,
  };
}
