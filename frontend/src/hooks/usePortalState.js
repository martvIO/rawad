// Central portal state — every piece of state and every handler the portal's
// role views (login / admin / driver / groom) share. The data layer is now
// Firebase; local state is reserved for transient UI (form inputs, modals,
// tab selection). The shape of the returned object matches the original
// localStorage-backed version so the role-view slices can stay untouched.
//
// Domain logic lives in composed hooks under ./portal/ (admin settings,
// users, confirmations, send-invites, proofs); this hook owns the tangled
// center — auth/session, the guests subscription + optimistic delivery
// overlay, shared-cities, and the transient forms — and re-exposes
// everything through the same returned object as before.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { load, save, removeKey } from "../utils/storage.js";
import { validatePhone } from "../utils/phone.js";
import { validateName } from "../utils/validation.js";
import { logErr } from "../utils/logger.js";
import { TIMING } from "../config/index.js";
import { ROLES } from "../constants/roles.js";
import { STORAGE_KEYS } from "../constants/storageKeys.js";

import { subscribeAuth, signIn, signOutNow } from "../services/auth.js";
import { setAuthChangeCallback } from "../utils/apiClient.js";
import {
  subscribeAllGuests, subscribeGuestsForGroom,
  addGuest as addGuestSrv, updateGuest as updateGuestSrv, removeGuest as removeGuestSrv,
} from "../services/guests.js";
import { normalizePhoneForMatching } from "../utils/matchUtils.js";
import {
  uploadProofBlob, dataUrlToBlob,
} from "../services/proofs.js";
import { assignDriverToGroom } from "../services/assignments.js";
import { useGeolocation } from "./useGeolocation.js";
import { usePortalAdminSettings } from "./portal/usePortalAdminSettings.js";
import { usePortalUsers } from "./portal/usePortalUsers.js";
import { usePortalConfirmations } from "./portal/usePortalConfirmations.js";
import { usePortalSendInvites } from "./portal/usePortalSendInvites.js";
import { usePortalProofs } from "./portal/usePortalProofs.js";

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

  // ── Admin settings (RTDB-backed, subscribed) ────────────────────────────────
  const {
    adminMessageBody, setAdminMessageBody,
    adminFormLink, setAdminFormLink,
    adminMode, setAdminMode,
    adminDigitalBaseUrl, setAdminDigitalBaseUrl,
    adminDigitalMessage, setAdminDigitalMessage,
  } = usePortalAdminSettings({ authed, showToast });

  // ── Users domain (admin list + optimistic overlay + edit modal) ─────────────
  const {
    groomProfiles,
    adminUsers, users, usersLoading,
    addUser, deleteUser,
    newUserRole, setNewUserRole, newUserName, setNewUserName,
    newUserPass, setNewUserPass, newUserPhone, setNewUserPhone,
    editingUser, startEditUser, cancelEditUser, saveUserEdit,
  } = usePortalUsers({ authed, isAdmin, currentUid, userType, driverServingGroom, t, showToast });

  // ── Guests subscription ─────────────────────────────────────────────────────
  const [guests, setGuests] = useState([]);
  // Guest ids the driver just marked delivered, kept until the server echoes
  // "delivered". A 15s poll arriving mid-confirm would otherwise flip the row
  // back to pending; this overlay keeps it delivered so there's no flicker.
  const optimisticDeliveredRef = useRef(new Set());
  // Apply the "just delivered" optimistic overlay to any guest list so a poll
  // that lands before the server echoes the delivery doesn't flip the card back
  // to pending. Shared by both the primary `guests` list and the `sharedGuests`
  // list (Shared-Cities view) so the optimistic flip survives in both.
  const applyDeliveredOverlay = useCallback((list) => {
    const set = optimisticDeliveredRef.current;
    if (!set.size || !Array.isArray(list)) return list;
    return list.map((g) => {
      if (!set.has(g.id)) return g;
      if (g.status === "delivered") { set.delete(g.id); return g; } // server caught up
      return { ...g, status: "delivered" };
    });
  }, []);
  const setGuestsWithOverlay = useCallback((listOrFn) => {
    setGuests((prev) => {
      const list = typeof listOrFn === "function" ? listOrFn(prev) : listOrFn;
      return applyDeliveredOverlay(list);
    });
  }, [applyDeliveredOverlay]);
  useEffect(() => {
    if (!authed) { setGuests([]); return; }
    if (isAdmin)                                 return subscribeAllGuests(setGuestsWithOverlay);
    if (userType === ROLES.DRIVER && driverServingGroomUid)
      return subscribeGuestsForGroom(driverServingGroomUid, setGuestsWithOverlay);
    if (userType === ROLES.GROOM && currentUid)
      return subscribeGuestsForGroom(currentUid, setGuestsWithOverlay);
    setGuests([]);
  }, [authed, isAdmin, userType, currentUid, driverServingGroomUid, setGuestsWithOverlay]);

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
      setSharedGuests(applyDeliveredOverlay(Object.values(buckets).flat()));
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

  // ── Confirmations domain (admin-only) ───────────────────────────────────────
  const {
    confirmations, editingConf, setEditingConf,
    matchedGuestFor, matchColor, confirmationReasons,
    useConfirmationData, saveConfirmationEdit, attachConfirmationToGuest,
    guestConfirmationStatus,
  } = usePortalConfirmations({ isAdmin, guests, t, showToast });

  // ── Send-tab domain (WhatsApp + invite links) ───────────────────────────────
  const {
    adminSelectedGroom, setAdminSelectedGroom,
    digitalGuestsForSelectedGroom,
    sendWaToOne, sendWaToAll,
    sendInviteLink, sendDigitalInviteLink,
  } = usePortalSendInvites({
    isAdmin, users, adminUsers, guests,
    adminMessageBody, adminFormLink, adminMode,
    adminDigitalBaseUrl, adminDigitalMessage,
    t, lang, showToast,
  });

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
    // A physical guest "confirms" by submitting the form (stamps confirmedAt).
    // Expected attendees = each confirmed guest + the companions they reported.
    const confirmedGuests = myGuests.filter(g => g.confirmedAt);
    const confirmed = confirmedGuests.length;
    const expectedAttendees = confirmedGuests.reduce(
      (sum, g) => sum + 1 + (Number(g.companions) > 0 ? Number(g.companions) : 0),
      0,
    );
    return { total, delivered, enroute, pending, confirmed, expectedAttendees, pct: total ? Math.round(delivered/total*100) : 0 };
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
    } catch (err) {
      // Distinguish the failure so the user isn't told "wrong password" when the
      // real cause is rate-limiting or a server error.
      const status = err?.status;
      if (status === 429) {
        setLoginError(lang === "he"
          ? "יותר מדי ניסיונות התחברות — נסה שוב בעוד מספר דקות."
          : "محاولات دخول كثيرة — يرجى المحاولة بعد عدة دقائق.");
      } else if (status >= 500) {
        setLoginError(lang === "he"
          ? "שגיאת שרת — נסה שוב בעוד רגע."
          : "خطأ في الخادم — يرجى المحاولة بعد قليل.");
      } else {
        setLoginError(t("login_error"));
      }
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
    // Drop the local session and restart the subscription (it now fires
    // cb(null) since tokens are gone), then return to the landing page.
    setAuthUser(null);
    setAuthReady(true);
    setAuthKey((k) => k + 1);
    navigate("/", { replace: true });
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

  // ── Mark delivered (with optional photo upload) ─────────────────────────────
  // Pure variant — accepts its inputs explicitly so callers with their own
  // local UI state (e.g. the map modal) don't have to plumb through the
  // delivery-form state that DriverDeliveryList owns.
  const markGuestDelivered = async (id, { photoData: pData, photoTaken: pTaken, deliveryNote: pNote } = {}) => {
    const guest = myGuests.find(g => g.id === id) || sharedGuests.find(g => g.id === id);
    if (!guest) return false;
    const priorStatus = guest.status;
    const deliveredBy = lang === "he" ? "השליח (אתה)" : "المرسل (أنت)";
    const time = new Date().toLocaleTimeString("ar", { hour: "2-digit", minute: "2-digit", numberingSystem: "latn" });

    // Optimistic: move the guest to "delivered" instantly so the driver sees it
    // accept immediately (no 15s poll wait). The proof upload + status PATCH run
    // in the background; the overlay above keeps it delivered until the server
    // echoes it. On failure we revert so the driver can retry.
    optimisticDeliveredRef.current.add(id);
    setGuests(prev => prev.map(g => g.id === id ? { ...g, status: "delivered", deliveredAt: time, deliveredBy } : g));
    // Mirror into sharedGuests too — the Shared-Cities view renders from this
    // separate list, so without this the delivered card lingered until the next
    // ~15s poll. The overlay (applyDeliveredOverlay) keeps it delivered across
    // polls; we revert this list as well on failure.
    setSharedGuests(prev => prev.map(g => g.id === id ? { ...g, status: "delivered", deliveredAt: time, deliveredBy } : g));
    showToast(t("driver_confirm"));

    (async () => {
      try {
        let proofPhotoPath;
        if (pData) {
          const blob = dataUrlToBlob(pData);
          proofPhotoPath = await uploadProofBlob(guest.groomUid, id, blob);
        } else if (pTaken) {
          proofPhotoPath = "📸"; // legacy fallback marker
        }
        const patch = { status: "delivered", deliveredAt: time, deliveredBy };
        if (proofPhotoPath)        patch.proofPhotoPath = proofPhotoPath;
        if (pNote && pNote.trim())  patch.deliveryNote  = pNote.trim();
        await updateGuestSrv(guest.groomUid, id, patch);
        // Leave the id in the overlay set — the next poll showing "delivered" clears it.
      } catch (e) {
        logErr("markGuestDelivered", e);
        optimisticDeliveredRef.current.delete(id);
        setGuests(prev => prev.map(g => g.id === id ? { ...g, status: priorStatus } : g));
        setSharedGuests(prev => prev.map(g => g.id === id ? { ...g, status: priorStatus } : g));
        showToast(lang === "he" ? "המסירה נכשלה — נסה שוב" : "فشل تأكيد التسليم — حاول مرة أخرى");
      }
    })();

    return true;
  };

  // List-view wrapper — reads from the global delivery-form state and clears
  // it on success. Kept for the existing DriverDeliveryList JSX.
  const markDelivered = async (id) => {
    const ok = await markGuestDelivered(id, { photoData, photoTaken, deliveryNote });
    if (ok) {
      setActiveId(null); setPhotoTaken(false); setPhotoData(null); setDeliveryNote("");
    }
  };

  // ── Proof-photo URL bridge ──────────────────────────────────────────────────
  const { decoratedGuests } = usePortalProofs({ guests });

  return {
    // passthrough
    onBack, t, lang, setLang,

    // auth + session
    authed, authReady, userType, currentUid, currentUsername,
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
