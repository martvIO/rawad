// Central portal state — every piece of state and every handler the portal's
// role views (login / admin / driver / groom) share. The data layer is now
// Firebase; local state is reserved for transient UI (form inputs, modals,
// tab selection). The shape of the returned object matches the original
// localStorage-backed version so the role-view slices can stay untouched.
import { useEffect, useMemo, useRef, useState } from "react";
import { load, save, removeKey } from "../utils/storage.js";
import { toIntlPhone, validatePhone } from "../utils/phone.js";
import { validateName } from "../utils/validation.js";

import { subscribeAuth, signIn, signOutNow } from "../services/auth.js";
import {
  subscribeAllGuests, subscribeGuestsForGroom,
  addGuest as addGuestSrv, updateGuest as updateGuestSrv, removeGuest as removeGuestSrv,
} from "../services/guests.js";
import {
  subscribeUsers,
  createPortalUser, deletePortalUser,
} from "../services/users.js";
import { subscribeConfirmations, updateConfirmation as updateConfirmationSrv } from "../services/confirmations.js";
import { classifyAll, normalizePhoneForMatching } from "../utils/matchUtils.js";
import { subscribeSettings, saveSettings } from "../services/adminSettings.js";
import {
  uploadProofBlob, dataUrlToBlob, proofDownloadUrl,
} from "../services/proofs.js";
import { assignDriverToGroom } from "../services/assignments.js";
import { useGeolocation } from "./useGeolocation.js";

export function usePortalState({ onBack, t, lang, setLang }) {
  // ── Auth (driven by Firebase Auth state) ────────────────────────────────────
  const [authUser, setAuthUser] = useState(null);
  const [authReady, setAuthReady] = useState(false);
  useEffect(() => {
    return subscribeAuth((u) => { setAuthUser(u); setAuthReady(true); });
  }, []);

  const authed = !!authUser;
  const userType = authUser?.role ?? null;
  const currentUsername = authUser?.username ?? null;
  const currentUid = authUser?.uid ?? null;
  const isAdmin = authUser?.claims?.admin === true || userType === "admin";

  // ── Login form (transient) ──────────────────────────────────────────────────
  const [loginUser, setLoginUser]   = useState("");
  const [loginPass, setLoginPass]   = useState("");
  const [loginError, setLoginError] = useState("");

  // ── Toast ───────────────────────────────────────────────────────────────────
  const [toast, setToast] = useState(null);
  const showToast = (msg) => { setToast(msg); setTimeout(() => setToast(null), 3200); };

  // ── UI-only persistence ─────────────────────────────────────────────────────
  const [tab, setTab] = useState(() => load("dawa_session_tab", "dashboard"));
  useEffect(() => { save("dawa_session_tab", tab); }, [tab]);

  // Logout confirmation modal
  const [logoutAsking, setLogoutAsking] = useState(false);

  // ── Driver: active groom they're delivering for ─────────────────────────────
  // Persisted as { uid, username } because the username isn't world-readable.
  const [driverServingGroom, setDriverServingGroomState] = useState(
    () => load("dawa_driver_serving_groom", null),
  );
  useEffect(() => { save("dawa_driver_serving_groom", driverServingGroom); }, [driverServingGroom]);
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
  const [adminTab, setAdminTab] = useState("users");
  const [adminSelectedGroom, setAdminSelectedGroom] = useState(null);

  // Admin settings (RTDB-backed, subscribed)
  const [adminMessageBody, setAdminMessageBodyState] = useState("");
  const [adminFormLink,    setAdminFormLinkState]    = useState("");
  useEffect(() => {
    if (!authed) return;
    return subscribeSettings((s) => {
      setAdminMessageBodyState(s.messageBody ?? "");
      setAdminFormLinkState   (s.formLink    ?? "");
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

  // Confirmations (admin-only subscription)
  const [confirmations, setConfirmations] = useState([]);
  useEffect(() => {
    if (!isAdmin) { setConfirmations([]); return; }
    return subscribeConfirmations(setConfirmations);
  }, [isAdmin]);
  const [editingConf, setEditingConf] = useState(null);

  // Users (admin sees full /users; drivers see their assigned groom as a synthetic single entry)
  const [adminUsers, setAdminUsers] = useState([]);
  useEffect(() => {
    if (!isAdmin) { setAdminUsers([]); return; }
    return subscribeUsers(setAdminUsers);
  }, [isAdmin]);
  const users = useMemo(() => {
    if (isAdmin) return adminUsers;
    if (userType === "driver" && driverServingGroom) {
      return [{
        uid: driverServingGroom.uid,
        id:  driverServingGroom.uid,
        username: driverServingGroom.username,
        role: "groom",
      }];
    }
    return [];
  }, [isAdmin, adminUsers, userType, driverServingGroom]);

  // Admin user-creation form
  const [newUserRole,  setNewUserRole]  = useState("groom");
  const [newUserName,  setNewUserName]  = useState("");
  const [newUserPass,  setNewUserPass]  = useState("");
  const [newUserPhone, setNewUserPhone] = useState("");

  // ── Guests subscription ─────────────────────────────────────────────────────
  const [guests, setGuests] = useState([]);
  useEffect(() => {
    if (!authed) { setGuests([]); return; }
    if (isAdmin)                                 return subscribeAllGuests(setGuests);
    if (userType === "driver" && driverServingGroomUid)
      return subscribeGuestsForGroom(driverServingGroomUid, setGuests);
    if (userType === "groom"  && currentUid)
      return subscribeGuestsForGroom(currentUid, setGuests);
    setGuests([]);
  }, [authed, isAdmin, userType, currentUid, driverServingGroomUid]);

  // Active groom context: groom uses their own uid; driver uses the assigned one.
  const activeGroomUid      = userType === "groom"  ? currentUid
                            : userType === "driver" ? driverServingGroomUid
                            : null;
  const activeGroomUsername = userType === "groom"  ? currentUsername
                            : userType === "driver" ? driverServingGroomUsername
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
    try {
      await signIn(u, p);
      setLoginError("");
      // setTab is run after auth subscription resolves (effect below).
    } catch {
      setLoginError(t("login_error"));
    }
  };

  // When auth state changes from null→user, route to the right starting tab.
  useEffect(() => {
    if (!authed) return;
    if (userType === "admin")  setTab("admin");
    else if (userType === "driver") setTab("pending");
    else                            setTab("dashboard");
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authed, userType]);

  const doLogout = async () => {
    setLogoutAsking(false);
    try { await signOutNow(); } catch {}
    setLoginUser(""); setLoginPass("");
    setTab("dashboard");
    setSharedStep("pickGrooms");
    setSharedSelectedGrooms([]); setSharedSelectedCity(null);
    setDriverServingGroomState(null);
    removeKey("dawa_session_tab");
    removeKey("dawa_driver_serving_groom");
  };

  // ── Driver picks a groom (server-side: assignDriverToGroom Function) ────────
  const submitDriverGroom = async () => {
    const name = driverGroomInput.trim().toLowerCase();
    if (!name) { setDriverGroomError(t("driver_pick_groom_invalid")); return; }
    try {
      const { groomUid } = await assignDriverToGroom(name);
      setDriverServingGroomState({ uid: groomUid, username: name });
      setDriverGroomInput(""); setDriverGroomError("");
      setTab("pending");
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
  const waLinkFor = (phone) => {
    const intl = toIntlPhone(phone);
    if (!intl) return "";
    const body = (adminMessageBody || "").trim();
    const link = (adminFormLink    || "").trim();
    const text = [body, link].filter(Boolean).join("\n\n");
    return `https://wa.me/${intl}?text=${encodeURIComponent(text)}`;
  };
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
      if (url) setTimeout(() => window.open(url, "_blank", "noopener"), i * 300);
    });
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
    classificationMap.get(conf?.id)?.status ?? "unknown";

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
    const fullAddr = [conf.submittedCity, conf.submittedStreet, conf.submittedHouse].filter(Boolean).join("، ");
    try {
      await updateGuestSrv(guest.groomUid, guest.id, {
        name:  conf.submittedName  || guest.name,
        phone: conf.submittedPhone || guest.phone,
        area:  fullAddr || guest.area,
      });
      showToast(t("edit_success"));
    } catch (e) { showToast(e?.message || ""); }
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
    } catch (e) { showToast(e?.message || ""); }
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
    if (!cls || cls.status === "green") return { status: "matched", conf };
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
    if (myGuests.some(g =>
        (g.phone || "").replace(/\s+/g, "") === normalizedPhone ||
        (g.name  || "").trim().toLowerCase() === normalizedName,
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
    } catch (e) { showToast(e?.message || ""); }
  };

  const removeGuest = async (id) => {
    const guest = myGuests.find(g => g.id === id);
    if (!guest) return;
    try { await removeGuestSrv(guest.groomUid, id); showToast(t("delete_success")); }
    catch (e) { showToast(e?.message || ""); }
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
    } catch (e) { showToast(e?.message || ""); }
  };

  // ── Admin user management ───────────────────────────────────────────────────
  const addUser = async () => {
    if (!newUserName.trim() || !newUserPass.trim()) { showToast(t("admin_required")); return; }
    if (newUserPass.length < 8) { showToast(t("admin_required")); return; }
    if (!newUserPhone.trim()) { showToast(t("admin_required")); return; }
    try {
      await createPortalUser({
        username:  newUserName.trim().toLowerCase(),
        password:  newUserPass,
        phoneE164: newUserPhone.trim(),
        role:      newUserRole,
      });
      setNewUserName(""); setNewUserPass(""); setNewUserPhone("");
      showToast(t("admin_added"));
    } catch (e) {
      showToast(e?.message || t("admin_taken"));
    }
  };
  const deleteUser = async (uid) => {
    try { await deletePortalUser(uid); showToast(t("admin_deleted")); }
    catch (e) { showToast(e?.message || ""); }
  };

  // ── Mark delivered (with optional photo upload) ─────────────────────────────
  const markDelivered = async (id) => {
    const guest = myGuests.find(g => g.id === id);
    if (!guest) return;
    let proofPhotoPath;
    try {
      if (photoData) {
        const blob = dataUrlToBlob(photoData);
        proofPhotoPath = await uploadProofBlob(guest.groomUid, id, blob);
      } else if (photoTaken) {
        proofPhotoPath = "📸"; // legacy fallback marker
      }
      const time = new Date().toLocaleTimeString("ar", { hour: "2-digit", minute: "2-digit" });
      const patch = {
        status: "delivered",
        deliveredAt: time,
        deliveredBy: lang === "he" ? "השליח (אתה)" : "المرسل (أنت)",
      };
      if (proofPhotoPath)        patch.proofPhotoPath = proofPhotoPath;
      if (deliveryNote.trim())   patch.deliveryNote   = deliveryNote.trim();
      await updateGuestSrv(guest.groomUid, id, patch);
      setActiveId(null); setPhotoTaken(false); setPhotoData(null); setDeliveryNote("");
      showToast(t("driver_confirm"));
    } catch (e) {
      showToast(e?.message || "");
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
    loginError, setLoginError,
    handleLogin, doLogout,
    logoutAsking, setLogoutAsking,
    driverGroomInput, setDriverGroomInput,
    driverGroomError, setDriverGroomError, submitDriverGroom,

    // navigation
    tab, setTab,

    // toast
    toast, showToast,

    // guests
    guests: decoratedGuests, myGuests: decoratedGuests, activeGroomUsername, stats,
    addGuest, removeGuest,
    gName, setGName, gPhone, setGPhone, gArea, setGArea, gType, setGType,
    editingGuest, startEdit, cancelEdit, saveEdit,
    eName, setEName, ePhone, setEPhone, eArea, setEArea, eType, setEType,
    revealedId, setRevealedId, swipeStartRef,

    // delivery
    activeId, setActiveId, photoTaken, setPhotoTaken,
    deliveryNote, setDeliveryNote, photoData, setPhotoData,
    markDelivered,

    // photo viewer
    viewingPhoto, setViewingPhoto,

    // users (admin) / synthetic single-entry list for drivers
    users, addUser, deleteUser,
    newUserRole, setNewUserRole, newUserName, setNewUserName,
    newUserPass, setNewUserPass, newUserPhone, setNewUserPhone,

    // admin
    adminTab, setAdminTab, adminSelectedGroom, setAdminSelectedGroom,
    adminMessageBody, setAdminMessageBody, adminFormLink, setAdminFormLink,
    confirmations, editingConf, setEditingConf,
    sendWaToOne, sendWaToAll,
    matchedGuestFor, matchColor, useConfirmationData, guestConfirmationStatus,
    confirmationReasons, saveConfirmationEdit,

    // shared-cities
    sharedStep, setSharedStep,
    sharedSelectedGrooms, setSharedSelectedGrooms,
    sharedSelectedCity, setSharedSelectedCity,

    // geolocation
    ...geo,
  };
}
