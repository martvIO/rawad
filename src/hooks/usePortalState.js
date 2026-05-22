// Central portal state — every piece of state and every handler the portal's
// role views (login / admin / driver / groom) share. The data layer is now
// Firebase; local state is reserved for transient UI (form inputs, modals,
// tab selection). The shape of the returned object matches the original
// localStorage-backed version so the role-view slices can stay untouched.
import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { load, save, removeKey } from "../utils/storage.js";
import { buildWaLink, toIntlPhone, validatePhone } from "../utils/phone.js";
import { validateName } from "../utils/validation.js";
import { isStrongPassword } from "../utils/password.js";
import { formatAddress } from "../utils/geo.js";
import { logErr } from "../utils/logger.js";
import { INVITE_BASE_URL, TIMING } from "../config/index.js";
import { ROLES } from "../constants/roles.js";
import { STORAGE_KEYS } from "../constants/storageKeys.js";
import { MATCH_STATUS } from "../constants/matchStatuses.js";

import { subscribeAuth, signIn, signOutNow, forceRefreshToken } from "../services/auth.js";
import { setAuthChangeCallback } from "../utils/apiClient.js";
import {
  subscribeAllGuests, subscribeGuestsForGroom,
  addGuest as addGuestSrv, updateGuest as updateGuestSrv, removeGuest as removeGuestSrv,
} from "../services/guests.js";
import {
  subscribeUsers, subscribeGroomProfiles,
  createPortalUser, deletePortalUser,
  updatePortalUser as updatePortalUserSrv,
  adminSetPassword as adminSetPasswordSrv,
  patchUserInRTDB,
  upsertGroomProfile, removeGroomProfile,
} from "../services/users.js";
import {
  subscribeConfirmations,
  updateConfirmation as updateConfirmationSrv,
  attachConfirmationLocationToGuest as attachConfLocationSrv,
} from "../services/confirmations.js";
import { classifyAll, normalizePhoneForMatching } from "../utils/matchUtils.js";
import { subscribeSettings, saveSettings } from "../services/adminSettings.js";
import {
  uploadProofBlob, dataUrlToBlob, proofDownloadUrl,
} from "../services/proofs.js";
import { assignDriverToGroom } from "../services/assignments.js";
import { createGuestInvite } from "../services/invites.js";
import {
  subscribeDigitalGuests, createDigitalGuestInvite,
} from "../services/digitalInvitation.js";
import { useGeolocation } from "./useGeolocation.js";

export function usePortalState({ onBack, t, lang, setLang }) {
  const navigate = useNavigate();

  // ── Auth (driven by Firebase Auth state) ────────────────────────────────────
  // We subscribe to BOTH auth-state changes (sign-in / sign-out) AND ID-token
  // refreshes. The token refresh path is what makes a newly-granted role
  // claim visible to the UI without forcing a sign-out / sign-in.
  const [authUser, setAuthUser] = useState(null);
  const [authReady, setAuthReady] = useState(false);
  // Bumped after login/logout to re-run the subscription effect so it
  // re-evaluates with the freshly stored (or cleared) tokens.
  const [authKey, setAuthKey] = useState(0);
  useEffect(() => {
    // REST polling auth — subscribeAuth handles both the initial state and
    // every periodic /auth/me refresh (replaces SDK onAuthStateChanged +
    // onIdTokenChanged).
    const unsubAuth = subscribeAuth((u) => {
      setAuthUser(u);
      setAuthReady(true);
    });
    // When apiClient detects an unrecoverable 401 it fires this callback so
    // the portal can drop the local user state and route to login.
    setAuthChangeCallback(() => {
      setAuthUser(null);
      setAuthReady(true);
    });
    return () => {
      unsubAuth();
      setAuthChangeCallback(null);
    };
  }, [authKey]);

  const authed = !!authUser;
  const userType = authUser?.role ?? null;
  const currentUsername = authUser?.username ?? null;
  const currentUid = authUser?.uid ?? null;
  const isAdmin = authUser?.claims?.role === ROLES.ADMIN;

  // ── Login form (transient) ──────────────────────────────────────────────────
  const [loginUser, setLoginUser]   = useState("");
  const [loginPass, setLoginPass]   = useState("");
  const [loginError, setLoginError] = useState("");
  const [loginLoading, setLoginLoading] = useState(false);

  // ── Toast ───────────────────────────────────────────────────────────────────
  const [toast, setToast] = useState(null);
  const showToast = (msg) => { setToast(msg); setTimeout(() => setToast(null), TIMING.TOAST_MS); };

  // Logout confirmation modal
  const [logoutAsking, setLogoutAsking] = useState(false);

  // ── Driver: active groom they're delivering for ─────────────────────────────
  // Persisted as { uid, username } because the username isn't world-readable.
  const [driverServingGroom, setDriverServingGroomState] = useState(
    () => load(STORAGE_KEYS.DRIVER_SERVING_GROOM, null),
  );
  useEffect(() => { save(STORAGE_KEYS.DRIVER_SERVING_GROOM, driverServingGroom); }, [driverServingGroom]);
  const driverServingGroomUid      = driverServingGroom?.uid      ?? null;
  const driverServingGroomUsername = driverServingGroom?.username ?? null;

  // Driver: pick-groom input
  const [driverGroomInput, setDriverGroomInput] = useState("");
  const [driverGroomError, setDriverGroomError] = useState("");

  // ── Shared-cities feature (UI only) ─────────────────────────────────────────
  const [sharedStep, setSharedStep] = useState("pickGrooms");
  const [sharedSelectedGrooms, setSharedSelectedGrooms] = useState([]);
  const [sharedSelectedCity, setSharedSelectedCity] = useState(null);

  // ── Admin (UI only + subscriptions) ─────────────────────────────────────────
  const [adminSelectedGroom, setAdminSelectedGroom] = useState(null);

  // Digital guests for the admin's currently-selected groom. Subscribed only
  // while an admin is viewing that groom — empties otherwise.
  const [digitalGuestsForSelectedGroom, setDigitalGuestsForSelectedGroom] = useState([]);

  // Admin settings (RTDB-backed, subscribed)
  const [adminMessageBody,    setAdminMessageBodyState]    = useState("");
  const [adminFormLink,       setAdminFormLinkState]       = useState("");
  const [adminMode,           setAdminModeState]           = useState("manual"); // "manual" | "digital"
  const [adminDigitalBaseUrl, setAdminDigitalBaseUrlState] = useState("");
  const [adminDigitalMessage, setAdminDigitalMessageState] = useState("");
  useEffect(() => {
    if (!authed) return;
    return subscribeSettings((s) => {
      setAdminMessageBodyState   (s.messageBody    ?? "");
      setAdminFormLinkState      (s.formLink       ?? "");
      setAdminModeState          (s.mode           === "digital" ? "digital" : "manual");
      setAdminDigitalBaseUrlState(s.digitalBaseUrl ?? "");
      setAdminDigitalMessageState(s.digitalMessage ?? "");
    });
  }, [authed]);
  const setAdminMessageBody = (v) => {
    setAdminMessageBodyState(v);
    saveSettings({ messageBody: v }).catch((e) => showToast(e?.message || ""));
  };
  const setAdminFormLink = (v) => {
    setAdminFormLinkState(v);
    saveSettings({ formLink: v }).catch((e) => showToast(e?.message || ""));
  };
  const setAdminMode = (v) => {
    const mode = v === "digital" ? "digital" : "manual";
    setAdminModeState(mode);
    saveSettings({ mode }).catch((e) => showToast(e?.message || ""));
  };
  const setAdminDigitalBaseUrl = (v) => {
    setAdminDigitalBaseUrlState(v);
    saveSettings({ digitalBaseUrl: v }).catch((e) => showToast(e?.message || ""));
  };
  const setAdminDigitalMessage = (v) => {
    setAdminDigitalMessageState(v);
    saveSettings({ digitalMessage: v }).catch((e) => showToast(e?.message || ""));
  };

  // Confirmations (admin-only subscription)
  const [confirmations, setConfirmations] = useState([]);
  useEffect(() => {
    if (!isAdmin) { setConfirmations([]); return; }
    return subscribeConfirmations(setConfirmations);
  }, [isAdmin]);
  const [editingConf, setEditingConf] = useState(null);

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

  // Admin Send tab — digital guests for the currently-selected groom. Only
  // subscribed while admin is viewing a specific groom; we resolve the uid
  // from the username via the users list.
  useEffect(() => {
    if (!isAdmin || !adminSelectedGroom) { setDigitalGuestsForSelectedGroom([]); return; }
    const groom = users.find(u => u.username === adminSelectedGroom);
    const groomUid = groom?.uid || groom?.id;
    if (!groomUid) { setDigitalGuestsForSelectedGroom([]); return; }
    return subscribeDigitalGuests(groomUid, setDigitalGuestsForSelectedGroom);
  }, [isAdmin, adminSelectedGroom, users]);

  // Admin user-creation form
  const [newUserRole,  setNewUserRole]  = useState("groom");
  const [newUserName,  setNewUserName]  = useState("");
  const [newUserPass,  setNewUserPass]  = useState("");
  const [newUserPhone, setNewUserPhone] = useState("");

  // Admin user-edit modal (full row selected; null = modal closed)
  const [editingUser, setEditingUser] = useState(null);

  // ── Guests subscription ─────────────────────────────────────────────────────
  const [guests, setGuests] = useState([]);
  useEffect(() => {
    if (!authed) { setGuests([]); return; }
    if (isAdmin)                                 return subscribeAllGuests(setGuests);
    if (userType === ROLES.DRIVER && driverServingGroomUid)
      return subscribeGuestsForGroom(driverServingGroomUid, setGuests);
    if (userType === ROLES.GROOM && currentUid)
      return subscribeGuestsForGroom(currentUid, setGuests);
    setGuests([]);
  }, [authed, isAdmin, userType, currentUid, driverServingGroomUid]);

  // ── قائمة الـ UIDs المُسنَدة للمرسل (من JWT claim assignedGrooms) ────────────
  // تُستخدم في البلدات المشتركة لمعرفة أي عرسان يمكنه قراءة معازيمهم.
  const driverAssignedGroomUids = useMemo(() => {
    if (userType !== ROLES.DRIVER) return [];
    const ag = authUser?.claims?.assignedGrooms;
    if (!ag || typeof ag !== "object") return [];
    return Object.keys(ag).filter(uid => ag[uid] === true);
  }, [userType, authUser?.claims?.assignedGrooms]);

  // مفتاح نصّي مستقرّ لقائمة العرسان المُسنَدين — يُستخدم كـ dependency بدل
  // الكائن المباشر الذي يتغيّر مرجعه بكلّ إعادة تصيير.
  const _assignedKey = driverAssignedGroomUids.slice().sort().join(",");

  // ── اشتراك موحّد بمعازيم كلّ العرسان المُسنَدين للمرسل ──────────────────────
  // يُستخدم في البلدات المشتركة فقط حتى يرى المرسل البلدات المشتركة عبر
  // كل العرسان اللي عنده، وليس فقط العريس اللي يخدمه الآن.
  // قواعد RTDB تسمح للمرسل بقراءة معازيم العرسان المُسنَدين إليه فقط —
  // أي عريس غير مُسنَد تُعيد اشتراكه فارغاً بصمت.
  const [sharedGuests, setSharedGuests] = useState([]);
  useEffect(() => {
    if (userType !== ROLES.DRIVER || driverAssignedGroomUids.length === 0) {
      setSharedGuests([]);
      return;
    }
    // حافظ على كلّ bucket منفصل حتى لا تمسح استجابة عريس نتائج عريس آخر
    const buckets = {};
    const merge = () =>
      setSharedGuests(Object.values(buckets).flat());
    const unsubscribers = driverAssignedGroomUids.map(groomUid =>
      subscribeGuestsForGroom(groomUid, (list) => {
        buckets[groomUid] = list;
        merge();
      }),
    );
    return () => unsubscribers.forEach(fn => fn());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userType, _assignedKey]);

  // Active groom context: groom uses their own uid; driver uses the assigned one.
  const activeGroomUid      = userType === ROLES.GROOM  ? currentUid
                            : userType === ROLES.DRIVER ? driverServingGroomUid
                            : null;
  const activeGroomUsername = userType === ROLES.GROOM  ? currentUsername
                            : userType === ROLES.DRIVER ? driverServingGroomUsername
                            : null;

  // For non-admin sessions the subscription already filtered to one groom, so
  // myGuests === guests; for admin it's the whole flattened list.
  const myGuests = guests;

  // ── Groom: add/edit guest form (transient) ──────────────────────────────────
  const [gName, setGName] = useState("");
  const [gPhone, setGPhone] = useState("");
  const [gArea, setGArea] = useState("");
  const [gType, setGType] = useState("premium");

  const [editingGuest, setEditingGuest] = useState(null);
  const [eName, setEName] = useState("");
  const [ePhone, setEPhone] = useState("");
  const [eArea, setEArea] = useState("");
  const [eType, setEType] = useState("premium");

  const [revealedId, setRevealedId] = useState(null);
  const swipeStartRef = useRef({ id: null, x: 0 });

  // ── Delivery form (transient) ───────────────────────────────────────────────
  const [activeId, setActiveId] = useState(null);
  const [photoTaken, setPhotoTaken] = useState(false);
  const [deliveryNote, setDeliveryNote] = useState("");
  const [photoData, setPhotoData] = useState(null);

  // Photo viewer modal
  const [viewingPhoto, setViewingPhoto] = useState(null);

  // ── Live location ───────────────────────────────────────────────────────────
  const geo = useGeolocation({
    userType, currentUid, currentUsername,
    activeGroomUid,
    users,
    t, showToast,
  });

  // ── Derived ─────────────────────────────────────────────────────────────────
  const stats = useMemo(() => {
    const total     = myGuests.length;
    const delivered = myGuests.filter(g => g.status === "delivered").length;
    const enroute   = myGuests.filter(g => g.status === "enroute").length;
    const pending   = myGuests.filter(g => g.status === "pending").length;
    return { total, delivered, enroute, pending, pct: total ? Math.round(delivered/total*100) : 0 };
  }, [myGuests]);

  // ── Handlers: auth ──────────────────────────────────────────────────────────
  const handleLogin = async () => {
    const u = loginUser.trim();
    const p = loginPass;
    if (!u || !p) { setLoginError(t("login_error")); return; }
    setLoginLoading(true);
    try {
      const user = await signIn(u, p);
      // Apply the session immediately so PortalRouter flips to the authed
      // tree without waiting for the first /auth/me poll. Bumping authKey
      // restarts the subscription so it picks up the freshly stored tokens.
      setAuthUser(user);
      setAuthReady(true);
      setAuthKey((k) => k + 1);
      setLoginError("");
      const path =
        user.role === ROLES.ADMIN  ? "/portal/admin/users"
      : user.role === ROLES.DRIVER ? "/portal/driver/pending"
      :                              "/portal/groom";
      navigate(path, { replace: true });
    } catch {
      setLoginError(t("login_error"));
    } finally {
      setLoginLoading(false);
    }
  };

  const doLogout = async () => {
    setLogoutAsking(false);
    try { await signOutNow(); } catch {}
    setLoginUser(""); setLoginPass("");
    setSharedStep("pickGrooms");
    setSharedSelectedGrooms([]); setSharedSelectedCity(null);
    setDriverServingGroomState(null);
    removeKey(STORAGE_KEYS.DRIVER_SERVING_GROOM);
    // Drop the local session so PortalRouter falls back to LoginScreen, and
    // restart the subscription (it now fires cb(null) since tokens are gone).
    setAuthUser(null);
    setAuthReady(true);
    setAuthKey((k) => k + 1);
  };

  // ── Driver picks a groom (server-side: assignDriverToGroom Function) ────────
  const submitDriverGroom = async () => {
    const name = driverGroomInput.trim().toLowerCase();
    if (!name) { setDriverGroomError(t("driver_pick_groom_invalid")); return; }
    try {
      const { groomUid } = await assignDriverToGroom(name);
      setDriverServingGroomState({ uid: groomUid, username: name });
      setDriverGroomInput(""); setDriverGroomError("");
      navigate("/portal/driver/pending");
    } catch {
      setDriverGroomError(t("driver_pick_groom_invalid"));
    }
  };
  // Compatibility alias so the JSX slice's `driverServingGroom` reads the username.
  const setDriverServingGroom = (next) => setDriverServingGroomState(
    next === null ? null
                  : (typeof next === "string" ? { uid: null, username: next } : next),
  );

  // ── WhatsApp link helpers ───────────────────────────────────────────────────
  const waLinkFor = (phone) =>
    buildWaLink(phone, (adminMessageBody || "").trim(), (adminFormLink || "").trim()) || "";
  const sendWaToOne = (phone) => {
    const url = waLinkFor(phone);
    if (!url) { showToast(t("share_invalid")); return; }
    window.open(url, "_blank", "noopener");
  };
  const sendWaToAll = (groomUsername) => {
    if (!adminFormLink.trim()) { showToast(t("admin_form_link")); return; }
    const groomUid = adminUsers.find(u => u.username === groomUsername)?.uid;
    const groomGuests = guests.filter(g => g.groomUid === groomUid);
    if (groomGuests.length === 0) return;
    showToast(t("admin_bulk_warn"));
    groomGuests.forEach((g, i) => {
      const url = waLinkFor(g.phone);
      if (url) setTimeout(() => window.open(url, "_blank", "noopener"), i * TIMING.WA_STAGGER_MS);
    });
  };

  // Per-guest invite link. Behaviour branches on adminMode:
  //   - manual:   mints the existing /invite/{token} link + adminMessageBody
  //   - digital:  mints a token via createDigitalGuestInvite + uses the
  //               adminDigitalBaseUrl + adminDigitalMessage, with the guest's
  //               groomUsername + token appended so the public landing page
  //               can personalise the displayed guest name.
  const sendInviteLink = async (guest) => {
    if (!guest?.groomUid || !guest?.id) { showToast(t("share_invalid")); return; }
    if (!toIntlPhone(guest.phone)) { showToast(t("share_invalid")); return; }
    try {
      if (adminMode === "digital") {
        const { token } = await createDigitalGuestInvite({
          groomUid: guest.groomUid,
          guestId:  guest.id,
        });
        if (!token) { showToast(t("share_invalid")); return; }
        const base = (adminDigitalBaseUrl || "").trim().replace(/\/+$/, "")
                  || `${window.location.origin}/d`;
        const groomUsername = guest.groomUsername || "";
        const url  = groomUsername ? `${base}/${groomUsername}/${token}` : `${base}/${token}`;
        const waUrl = buildWaLink(guest.phone, (adminDigitalMessage || "").trim(), url);
        if (waUrl) window.open(waUrl, "_blank", "noopener");
        return;
      }

      // Manual mode — existing physical-invite flow.
      const { token } = await createGuestInvite({
        groomUid: guest.groomUid,
        guestId:  guest.id,
      });
      if (!token) { showToast(t("share_invalid")); return; }
      const baseUrl = (INVITE_BASE_URL || "").replace(/\/+$/, "")
                   || window.location.origin;
      const url = `${baseUrl}/invite/${token}`;
      const waUrl = buildWaLink(guest.phone, (adminMessageBody || "").trim(), url);
      if (waUrl) window.open(waUrl, "_blank", "noopener");
    } catch (e) {
      logErr("sendInviteLink", e);
      showToast(e?.message || t("share_invalid"));
    }
  };

  // Per-guest DIGITAL invite link. Mirrors sendInviteLink but uses the
  // digital token Cloud Function and routes through /invite/digital/{token}.
  // Only the admin's Send tab calls this — grooms can no longer self-send.
  const sendDigitalInviteLink = async (guest, groomUid) => {
    if (!groomUid || !guest?.id) { showToast(t("share_invalid")); return; }
    if (!toIntlPhone(guest.phone)) { showToast(t("share_invalid")); return; }
    try {
      const { token } = await createDigitalGuestInvite({
        groomUid,
        guestId: guest.id,
      });
      if (!token) { showToast(t("share_invalid")); return; }
      const baseUrl = (INVITE_BASE_URL || "").replace(/\/+$/, "")
                   || window.location.origin;
      const url = `${baseUrl}/invite/digital/${token}`;
      const waUrl = buildWaLink(guest.phone, (adminMessageBody || "").trim(), url);
      if (waUrl) window.open(waUrl, "_blank", "noopener");
    } catch (e) {
      logErr("sendDigitalInviteLink", e);
      showToast(e?.message || t("share_invalid"));
    }
  };

  // ── Confirmation matching ───────────────────────────────────────────────────
  // Phone is the primary key. Names/addresses use fuzzy similarity tolerant
  // of spelling variants, Arabic/Hebrew/English transliteration, and word
  // reordering (see src/utils/matchUtils.js for details).
  const classificationMap = useMemo(
    () => classifyAll(confirmations, guests),
    [confirmations, guests],
  );

  const matchedGuestFor = (conf) =>
    classificationMap.get(conf?.id)?.guest ?? null;

  // matchColor returns "green" | "red" | "unknown" (note: was previously
  // "red" for unknowns; UI now branches on three states for the Unknown section).
  const matchColor = (conf) =>
    classificationMap.get(conf?.id)?.status ?? MATCH_STATUS.UNKNOWN;

  // Translate machine reason codes into the existing i18n strings so
  // AdminConfirmationsTab can display them as badges.
  const reasonsLabel = (codes) => (codes || []).map((c) => {
    if (c === "name_differs")    return t("conf_mismatch_name");
    if (c === "address_differs") return t("conf_mismatch_city");
    return c;
  });

  const confirmationReasons = (conf) =>
    reasonsLabel(classificationMap.get(conf?.id)?.reasons);

  // Sync the confirmation's submitted data back into the matched guest record.
  // (Function name kept for compatibility with the AdminConfirmationsTab slice.)
  const useConfirmationData = async (conf) => {
    const guest = matchedGuestFor(conf);
    if (!guest) return;
    const fullAddr = formatAddress(conf.submittedCity, conf.submittedStreet, conf.submittedHouse);
    try {
      await updateGuestSrv(guest.groomUid, guest.id, {
        name:  conf.submittedName  || guest.name,
        phone: conf.submittedPhone || guest.phone,
        area:  fullAddr || guest.area,
      });
      showToast(t("edit_success"));
    } catch (e) { logErr("useConfirmationData", e); showToast(e?.message || ""); }
  };

  // Admin edits a confirmation record. Updates both /confirmations/{id}
  // and the matched guest's record (if any) so the two stay in sync.
  // After save, re-classification runs automatically because confirmations
  // and guests both re-subscribe and the memo above re-computes.
  const saveConfirmationEdit = async (confId, patch) => {
    const conf = confirmations.find(c => c.id === confId);
    if (!conf) return;
    const cleanPatch = {
      submittedName:  (patch.submittedName  ?? conf.submittedName  ?? "").trim(),
      submittedPhone: (patch.submittedPhone ?? conf.submittedPhone ?? "").trim(),
      submittedCity:  (patch.submittedCity  ?? conf.submittedCity  ?? "").trim(),
    };
    try {
      await updateConfirmationSrv(confId, cleanPatch);
      // Propagate to the guest record matched by the *new* phone, if any.
      const newPhoneDigits = normalizePhoneForMatching(cleanPatch.submittedPhone);
      const guestMatch = newPhoneDigits
        ? guests.find(g =>
            g.groomUid === conf.groomUid &&
            normalizePhoneForMatching(g.phone) === newPhoneDigits,
          )
        : null;
      if (guestMatch) {
        await updateGuestSrv(guestMatch.groomUid, guestMatch.id, {
          name:  cleanPatch.submittedName  || guestMatch.name,
          phone: cleanPatch.submittedPhone || guestMatch.phone,
          area:  cleanPatch.submittedCity  || guestMatch.area || "",
        });
      }
      setEditingConf(null);
      showToast(t("edit_success"));
    } catch (e) { logErr("saveConfirmationEdit", e); showToast(e?.message || ""); }
  };

  // Admin-only: copy a confirmation's stored coords onto a specific guest.
  // Surfaced from EditConfirmationModal when auto-attach couldn't resolve.
  const attachConfirmationToGuest = async (confirmationId, guestId) => {
    if (!confirmationId || !guestId) return;
    try {
      await attachConfLocationSrv({ confirmationId, guestId });
      showToast(t("admin_conf_attach_success"));
    } catch (e) { logErr("attachConfirmationToGuest", e); showToast(e?.message || ""); }
  };

  // Status badge for a guest based on whether a confirmation arrived. Used
  // by the Send tab (per-guest "Matched"/"Mismatch" chip).
  const guestConfirmationStatus = (guest) => {
    if (!guest) return null;
    const guestPhone = normalizePhoneForMatching(guest.phone);
    if (!guestPhone) return null;
    const conf = confirmations.find(c =>
      c.groomUid === guest.groomUid &&
      normalizePhoneForMatching(c.submittedPhone) === guestPhone,
    );
    if (!conf) return null;
    const cls = classificationMap.get(conf.id);
    if (!cls || cls.status === MATCH_STATUS.GREEN) return { status: "matched", conf };
    return { status: "mismatch", reasons: reasonsLabel(cls.reasons), conf };
  };

  // ── Guest CRUD ──────────────────────────────────────────────────────────────
  const addGuest = async () => {
    if (!activeGroomUid) { showToast(t("add_required_msg")); return; }
    if (!gName.trim() || !gPhone.trim()) { showToast(t("add_required_msg")); return; }
    const nameError  = validateName(gName, t);  if (nameError)  { showToast(nameError);  return; }
    const phoneError = validatePhone(gPhone, t); if (phoneError) { showToast(phoneError); return; }
    const normalizedPhone = gPhone.trim().replace(/\s+/g, "");
    const normalizedName  = gName.trim().toLowerCase();
    // Compare on normalised digits so "+972501234567" and "0501234567" are equal.
    const newPhoneDigits = normalizePhoneForMatching(normalizedPhone);
    if (myGuests.some(g =>
        (newPhoneDigits && normalizePhoneForMatching(g.phone) === newPhoneDigits) ||
        (g.name || "").trim().toLowerCase() === normalizedName,
    )) { showToast(t("add_duplicate_msg")); return; }
    try {
      await addGuestSrv(activeGroomUid, {
        groomUsername: activeGroomUsername,
        name:  gName.trim(),
        phone: normalizedPhone,
        area:  gArea.trim(),
        status: "pending",
        inviteType: gType,
      });
      setGName(""); setGPhone(""); setGArea(""); setGType("premium");
      showToast(t("add_success"));
    } catch (e) { logErr("addGuest", e); showToast(e?.message || ""); }
  };

  const removeGuest = async (id) => {
    const guest = myGuests.find(g => g.id === id);
    if (!guest) return;
    try { await removeGuestSrv(guest.groomUid, id); showToast(t("delete_success")); }
    catch (e) { logErr("removeGuest", e); showToast(e?.message || ""); }
  };

  const startEdit = (g) => {
    setEditingGuest(g);
    setEName(g.name); setEPhone(g.phone); setEArea(g.area || ""); setEType(g.inviteType);
  };
  const cancelEdit = () => setEditingGuest(null);
  const saveEdit = async () => {
    if (!editingGuest) return;
    if (!eName.trim() || !ePhone.trim()) { showToast(t("add_required_msg")); return; }
    const nameError  = validateName(eName, t);  if (nameError)  { showToast(nameError);  return; }
    const phoneError = validatePhone(ePhone, t); if (phoneError) { showToast(phoneError); return; }
    try {
      await updateGuestSrv(editingGuest.groomUid, editingGuest.id, {
        name:  eName.trim(),
        phone: ePhone.trim().replace(/\s+/g, ""),
        area:  eArea.trim(),
        inviteType: eType,
      });
      setEditingGuest(null);
      showToast(t("edit_success"));
    } catch (e) { logErr("saveGuestEdit", e); showToast(e?.message || ""); }
  };

  // ── Admin user management ───────────────────────────────────────────────────
  // عند نجاح الإنشاء نُضيف الحساب الجديد إلى optimisticUsers فوراً، حتى يظهر
  // في القائمة قبل أن يلتقطه subscribeUsers الحي. النتيجة المُعادة تُمكّن
  // الصفحة من القفز للتبويب الموافق للدور.
  //
  // ملاحظة: الـ Cloud Function المنشورة حالياً ما زالت تشترط رقم هاتف
  // E.164 صالحاً (تمرّره إلى Firebase Auth التي تستخدم libphonenumber).
  // لا يوجد بادئة وهميّة آمنة 100%، فالهاتف مطلوب حتى ينشر الأدمن النسخة
  // الجديدة من الدالّة.
  const addUser = async () => {
    if (!newUserName.trim() || !newUserPass.trim()) { showToast(t("admin_required")); return null; }
    if (!isStrongPassword(newUserPass)) { showToast(t("pwd_weak")); return null; }
    const username   = newUserName.trim().toLowerCase();
    const role       = newUserRole;
    // الهاتف اختياري في الواجهة. إذا تُرك فارغاً نُولِّد رقماً وهمياً
    // بنطاق +1202555XXXX (محجوز رسمياً للاستخدام الاختباري في NANP؛
    // تقبله libphonenumber / Firebase Auth كصيغة E.164 صالحة).
    // يُحذف هذا التحايل بعد نشر Cloud Function الجديدة التي لا تشترط الهاتف.
    const typedPhone = newUserPhone.trim();
    const phoneE164  = typedPhone ||
      ("+1202555" + (Date.now() % 10000).toString().padStart(4, "0"));
    try {
      const result = await createPortalUser({ username, password: newUserPass, role, phoneE164 });
      const uid = result?.uid;
      const newRow = { uid, id: uid, username, role, phoneE164 };
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
      showToast(e?.message || t("admin_taken"));
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
    } catch (e) { logErr("deleteUser", e); showToast(e?.message || ""); }
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

    // ─ ما الذي تغيّر فعلاً؟ ──────────────────────────────────────────────
    const usernameChanged    = newUsername    && newUsername    !== (orig.username ?? "");
    const displayNameChanged = newDisplayName !== undefined
                               && newDisplayName !== (orig.displayName ?? "");
    const phoneChanged       = newPhoneE164   && newPhoneE164   !== (orig.phoneE164 ?? "");
    const roleChanged        = newRole        && newRole        !== (orig.role    ?? "");
    const needsFunction      = usernameChanged || phoneChanged || roleChanged;
    const needsPassword      = !!newPassword;
    const needsDisplayName   = displayNameChanged;
    const nothingChanged     = !usernameChanged && !displayNameChanged
                               && !phoneChanged && !roleChanged && !needsPassword;

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

      // ── حدّث الحالة المحلية فوراً ──────────────────────────────────────
      const localPatch = {
        ...(usernameChanged    && { username:    newUsername }),
        ...(displayNameChanged && { displayName: newDisplayName }),
        ...(phoneChanged       && { phoneE164:   newPhoneE164 }),
        ...(roleChanged        && { role:        newRole }),
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
      const msg = e?.message || e?.details?.message || e?.code || "خطأ غير معروف";
      console.error("[dawa] saveUserEdit FAILED:", { code: e?.code, message: e?.message, details: e?.details });
      showToast(msg);
    }
  };

  // ── Mark delivered (with optional photo upload) ─────────────────────────────
  // Pure variant — accepts its inputs explicitly so callers with their own
  // local UI state (e.g. the map modal) don't have to plumb through the
  // delivery-form state that DriverDeliveryList owns.
  const markGuestDelivered = async (id, { photoData: pData, photoTaken: pTaken, deliveryNote: pNote } = {}) => {
    const guest = myGuests.find(g => g.id === id) || sharedGuests.find(g => g.id === id);
    if (!guest) return false;
    let proofPhotoPath;
    try {
      if (pData) {
        const blob = dataUrlToBlob(pData);
        proofPhotoPath = await uploadProofBlob(guest.groomUid, id, blob);
      } else if (pTaken) {
        proofPhotoPath = "📸"; // legacy fallback marker
      }
      const time = new Date().toLocaleTimeString("ar", { hour: "2-digit", minute: "2-digit" });
      const patch = {
        status: "delivered",
        deliveredAt: time,
        deliveredBy: lang === "he" ? "השליח (אתה)" : "المرسل (أنت)",
      };
      if (proofPhotoPath)              patch.proofPhotoPath = proofPhotoPath;
      if (pNote && pNote.trim())       patch.deliveryNote   = pNote.trim();
      await updateGuestSrv(guest.groomUid, id, patch);
      showToast(t("driver_confirm"));
      return true;
    } catch (e) {
      logErr("markGuestDelivered", e);
      showToast(e?.message || "");
      return false;
    }
  };

  // List-view wrapper — reads from the global delivery-form state and clears
  // it on success. Kept for the existing DriverDeliveryList JSX.
  const markDelivered = async (id) => {
    const ok = await markGuestDelivered(id, { photoData, photoTaken, deliveryNote });
    if (ok) {
      setActiveId(null); setPhotoTaken(false); setPhotoData(null); setDeliveryNote("");
    }
  };

  // Bridge legacy `guest.proofImg` → resolved storage URL for the proof viewer.
  // The JSX slices check `g.proofImg` strings; for new records we expose a
  // matching `proofImg` field populated from `proofPhotoPath`.
  const [proofUrlCache, setProofUrlCache] = useState({});
  useEffect(() => {
    let cancelled = false;
    const need = guests
      .filter(g => g.proofPhotoPath && /^proofs\//.test(g.proofPhotoPath))
      .filter(g => !(g.id in proofUrlCache));
    if (need.length === 0) return;
    (async () => {
      const adds = {};
      for (const g of need) {
        try { adds[g.id] = await proofDownloadUrl(g.proofPhotoPath); }
        catch { adds[g.id] = null; }
      }
      if (!cancelled) setProofUrlCache((prev) => ({ ...prev, ...adds }));
    })();
    return () => { cancelled = true; };
  }, [guests, proofUrlCache]);

  const decoratedGuests = useMemo(
    () => guests.map((g) => {
      if (g.proofPhotoPath && /^proofs\//.test(g.proofPhotoPath)) {
        const url = proofUrlCache[g.id];
        return { ...g, proofImg: url || g.proofPhotoPath };
      }
      if (g.proofPhotoPath && !g.proofImg) return { ...g, proofImg: g.proofPhotoPath };
      return g;
    }),
    [guests, proofUrlCache],
  );

  return {
    // passthrough
    onBack, t, lang, setLang,

    // auth + session
    authed, authReady, userType, currentUsername,
    driverServingGroom: driverServingGroomUsername,
    setDriverServingGroom,
    loginUser, setLoginUser, loginPass, setLoginPass,
    loginError, setLoginError, loginLoading,
    handleLogin, doLogout,
    logoutAsking, setLogoutAsking,
    driverGroomInput, setDriverGroomInput,
    driverGroomError, setDriverGroomError, submitDriverGroom,

    // toast
    toast, showToast,

    // guests
    guests: decoratedGuests, myGuests: decoratedGuests, activeGroomUsername, stats,
    addGuest, removeGuest,
    gName, setGName, gPhone, setGPhone, gArea, setGArea, gType, setGType,
    editingGuest, startEdit, cancelEdit, saveEdit,
    eName, setEName, ePhone, setEPhone, eArea, setEArea, eType, setEType,
    revealedId, setRevealedId, swipeStartRef,
    sendInviteLink, sendDigitalInviteLink,
    digitalGuestsForSelectedGroom,

    // delivery
    activeId, setActiveId, photoTaken, setPhotoTaken,
    deliveryNote, setDeliveryNote, photoData, setPhotoData,
    markDelivered, markGuestDelivered,

    // photo viewer
    viewingPhoto, setViewingPhoto,

    // users (admin) / synthetic single-entry list for drivers
    users, usersLoading, addUser, deleteUser, groomProfiles,
    newUserRole, setNewUserRole, newUserName, setNewUserName,
    newUserPass, setNewUserPass, newUserPhone, setNewUserPhone,
    editingUser, startEditUser, cancelEditUser, saveUserEdit,

    // admin
    adminSelectedGroom, setAdminSelectedGroom,
    adminMessageBody, setAdminMessageBody, adminFormLink, setAdminFormLink,
    adminMode, setAdminMode,
    adminDigitalBaseUrl, setAdminDigitalBaseUrl,
    adminDigitalMessage, setAdminDigitalMessage,
    confirmations, editingConf, setEditingConf,
    sendWaToOne, sendWaToAll,
    matchedGuestFor, matchColor, useConfirmationData, guestConfirmationStatus,
    confirmationReasons, saveConfirmationEdit, attachConfirmationToGuest,

    // shared-cities
    sharedStep, setSharedStep,
    sharedSelectedGrooms, setSharedSelectedGrooms,
    sharedSelectedCity, setSharedSelectedCity,
    sharedGuests, driverAssignedGroomUids,

    // geolocation
    ...geo,
  };
}
