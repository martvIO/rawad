// Central portal state — the thin COMPOSITION ROOT for the portal's role views
// (login / admin / driver / groom). Every domain now lives in a focused hook
// under ./portal/ (auth, driver-groom, guests, admin settings, users,
// confirmations, send-invites, proofs); this root wires them together, owns only
// the cross-cutting glue (toast, the shared-cities view flags, the cross-domain
// logout sequence), and re-exposes everything through the SAME returned object as
// before — the public API ~30 views consume via usePortal().
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { TIMING } from "../config/index.js";
import { signOutNow } from "../services/auth.js";
import { useGeolocation } from "./useGeolocation.js";
import { usePortalAuth } from "./portal/usePortalAuth.js";
import { usePortalDriverGroom } from "./portal/usePortalDriverGroom.js";
import { usePortalGuests } from "./portal/usePortalGuests.js";
import { usePortalAdminSettings } from "./portal/usePortalAdminSettings.js";
import { usePortalUsers } from "./portal/usePortalUsers.js";
import { usePortalConfirmations } from "./portal/usePortalConfirmations.js";
import { usePortalSendInvites } from "./portal/usePortalSendInvites.js";
import { usePortalProofs } from "./portal/usePortalProofs.js";

export function usePortalState({ onBack, t, lang, setLang }) {
  const navigate = useNavigate();

  // ── Toast (cross-cutting glue, passed to every hook) ────────────────────────
  const [toast, setToast] = useState(null);
  const showToast = (msg) => { setToast(msg); setTimeout(() => setToast(null), TIMING.TOAST_MS); };

  // ── Shared-cities VIEW state (transient UI; reset on logout) ─────────────────
  const [sharedStep, setSharedStep] = useState("pickGrooms");
  const [sharedSelectedGrooms, setSharedSelectedGrooms] = useState([]);
  const [sharedSelectedCity, setSharedSelectedCity] = useState(null);

  // ── Domain hooks (unconditional, dependency-ordered) ────────────────────────
  const auth = usePortalAuth({ t, lang, navigate });
  const driver = usePortalDriverGroom({ navigate, t });

  const adminSettings = usePortalAdminSettings({ authed: auth.authed, showToast, t });

  const usersHook = usePortalUsers({
    authed: auth.authed, isAdmin: auth.isAdmin, currentUid: auth.currentUid,
    userType: auth.userType, driverServingGroom: driver.driverServingGroom,
    t, showToast,
  });

  const guestsHook = usePortalGuests({
    authed: auth.authed, isAdmin: auth.isAdmin, userType: auth.userType,
    currentUid: auth.currentUid, currentUsername: auth.currentUsername,
    driverServingGroomUid: driver.driverServingGroomUid,
    driverServingGroomUsername: driver.driverServingGroomUsername,
    assignedGrooms: auth.authUser?.claims?.assignedGrooms,
    t, lang, showToast,
  });

  const confirmations = usePortalConfirmations({
    isAdmin: auth.isAdmin, guests: guestsHook.guests, t, showToast,
  });

  const sendInvites = usePortalSendInvites({
    isAdmin: auth.isAdmin, users: usersHook.users, adminUsers: usersHook.adminUsers,
    guests: guestsHook.guests,
    adminMessageBody: adminSettings.adminMessageBody, adminFormLink: adminSettings.adminFormLink,
    adminMode: adminSettings.adminMode,
    adminDigitalBaseUrl: adminSettings.adminDigitalBaseUrl,
    adminDigitalMessage: adminSettings.adminDigitalMessage,
    t, lang, showToast,
  });

  const geo = useGeolocation({
    userType: auth.userType, currentUid: auth.currentUid, currentUsername: auth.currentUsername,
    activeGroomUid: guestsHook.activeGroomUid,
    users: usersHook.users,
    t, showToast,
  });

  // Final guest decoration: confirmations + sendInvites consume the RAW guests
  // list (above); the proof-URL bridge runs last and is what the views render.
  const { decoratedGuests } = usePortalProofs({ guests: guestsHook.guests });

  // ── Cross-domain logout sequence ────────────────────────────────────────────
  // Inherently spans auth + driver-groom + shared-cities; auth is created before
  // the others, so the orchestration lives here rather than inside any one hook.
  const doLogout = async () => {
    auth.setLogoutAsking(false);
    try { await signOutNow(); } catch {}
    auth.resetLoginFields();
    setSharedStep("pickGrooms");
    setSharedSelectedGrooms([]); setSharedSelectedCity(null);
    driver.clearServingGroom();
    auth.applySignedOut();
    navigate("/", { replace: true });
  };

  return {
    // passthrough
    onBack, t, lang, setLang,

    // auth + session
    authed: auth.authed, authReady: auth.authReady, userType: auth.userType,
    currentUid: auth.currentUid, currentUsername: auth.currentUsername,
    canSeeAttendance: auth.canSeeAttendance, canUsePhotographer: auth.canUsePhotographer,
    canUseBoardingPass: auth.canUseBoardingPass, mustChangePassword: auth.mustChangePassword,
    driverServingGroom: driver.driverServingGroomUsername,
    setDriverServingGroom: driver.setDriverServingGroom,
    loginUser: auth.loginUser, setLoginUser: auth.setLoginUser,
    loginPass: auth.loginPass, setLoginPass: auth.setLoginPass,
    loginError: auth.loginError, setLoginError: auth.setLoginError, loginLoading: auth.loginLoading,
    handleLogin: auth.handleLogin, doLogout, applySignedOut: auth.applySignedOut,
    logoutAsking: auth.logoutAsking, setLogoutAsking: auth.setLogoutAsking,
    driverGroomInput: driver.driverGroomInput, setDriverGroomInput: driver.setDriverGroomInput,
    driverGroomError: driver.driverGroomError, setDriverGroomError: driver.setDriverGroomError,
    submitDriverGroom: driver.submitDriverGroom,

    // toast
    toast, showToast,

    // guests
    guests: decoratedGuests, myGuests: decoratedGuests,
    guestsLoading: guestsHook.guestsLoading, activeGroomUsername: guestsHook.activeGroomUsername,
    stats: guestsHook.stats,
    addGuest: guestsHook.addGuest, removeGuest: guestsHook.removeGuest,
    gName: guestsHook.gName, setGName: guestsHook.setGName,
    gPhone: guestsHook.gPhone, setGPhone: guestsHook.setGPhone,
    gArea: guestsHook.gArea, setGArea: guestsHook.setGArea,
    gType: guestsHook.gType, setGType: guestsHook.setGType,
    editingGuest: guestsHook.editingGuest, startEdit: guestsHook.startEdit,
    cancelEdit: guestsHook.cancelEdit, saveEdit: guestsHook.saveEdit,
    eName: guestsHook.eName, setEName: guestsHook.setEName,
    ePhone: guestsHook.ePhone, setEPhone: guestsHook.setEPhone,
    eArea: guestsHook.eArea, setEArea: guestsHook.setEArea,
    eType: guestsHook.eType, setEType: guestsHook.setEType,
    revealedId: guestsHook.revealedId, setRevealedId: guestsHook.setRevealedId,
    swipeStartRef: guestsHook.swipeStartRef,
    sendInviteLink: sendInvites.sendInviteLink, sendDigitalInviteLink: sendInvites.sendDigitalInviteLink,
    digitalGuestsForSelectedGroom: sendInvites.digitalGuestsForSelectedGroom,

    // delivery
    activeId: guestsHook.activeId, setActiveId: guestsHook.setActiveId,
    photoTaken: guestsHook.photoTaken, setPhotoTaken: guestsHook.setPhotoTaken,
    deliveryNote: guestsHook.deliveryNote, setDeliveryNote: guestsHook.setDeliveryNote,
    photoData: guestsHook.photoData, setPhotoData: guestsHook.setPhotoData,
    markDelivered: guestsHook.markDelivered, markGuestDelivered: guestsHook.markGuestDelivered,
    markOutcome: guestsHook.markOutcome, markGuestOutcome: guestsHook.markGuestOutcome,

    // photo viewer
    viewingPhoto: guestsHook.viewingPhoto, setViewingPhoto: guestsHook.setViewingPhoto,

    // users (admin) / synthetic single-entry list for drivers
    users: usersHook.users, usersLoading: usersHook.usersLoading,
    addUser: usersHook.addUser, deleteUser: usersHook.deleteUser, groomProfiles: usersHook.groomProfiles,
    newUserRole: usersHook.newUserRole, setNewUserRole: usersHook.setNewUserRole,
    newUserName: usersHook.newUserName, setNewUserName: usersHook.setNewUserName,
    newUserPass: usersHook.newUserPass, setNewUserPass: usersHook.setNewUserPass,
    newUserPhone: usersHook.newUserPhone, setNewUserPhone: usersHook.setNewUserPhone,
    editingUser: usersHook.editingUser, startEditUser: usersHook.startEditUser,
    cancelEditUser: usersHook.cancelEditUser, saveUserEdit: usersHook.saveUserEdit,

    // admin
    adminSelectedGroom: sendInvites.adminSelectedGroom, setAdminSelectedGroom: sendInvites.setAdminSelectedGroom,
    adminMessageBody: adminSettings.adminMessageBody, setAdminMessageBody: adminSettings.setAdminMessageBody,
    adminFormLink: adminSettings.adminFormLink, setAdminFormLink: adminSettings.setAdminFormLink,
    adminMode: adminSettings.adminMode, setAdminMode: adminSettings.setAdminMode,
    adminDigitalBaseUrl: adminSettings.adminDigitalBaseUrl, setAdminDigitalBaseUrl: adminSettings.setAdminDigitalBaseUrl,
    adminDigitalMessage: adminSettings.adminDigitalMessage, setAdminDigitalMessage: adminSettings.setAdminDigitalMessage,
    contact: adminSettings.contact, setContactField: adminSettings.setContactField,
    confirmations: confirmations.confirmations, confirmationsLoading: confirmations.confirmationsLoading,
    editingConf: confirmations.editingConf, setEditingConf: confirmations.setEditingConf,
    sendWaToOne: sendInvites.sendWaToOne, sendWaToAll: sendInvites.sendWaToAll,
    matchedGuestFor: confirmations.matchedGuestFor, matchColor: confirmations.matchColor,
    useConfirmationData: confirmations.useConfirmationData, guestConfirmationStatus: confirmations.guestConfirmationStatus,
    confirmationReasons: confirmations.confirmationReasons, saveConfirmationEdit: confirmations.saveConfirmationEdit,
    attachConfirmationToGuest: confirmations.attachConfirmationToGuest,

    // shared-cities
    sharedStep, setSharedStep,
    sharedSelectedGrooms, setSharedSelectedGrooms,
    sharedSelectedCity, setSharedSelectedCity,
    sharedGuests: guestsHook.sharedGuests, driverAssignedGroomUids: guestsHook.driverAssignedGroomUids,

    // geolocation
    ...geo,
  };
}
