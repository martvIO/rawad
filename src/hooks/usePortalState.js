// Central portal state — every piece of state and every handler that the
// portal's role views (login / admin / driver / groom) share. Lifted out of
// the old monolithic GroomPortal component so each view can read exactly
// what it needs via usePortal(). Live-location concerns live in useGeolocation.
import { useState, useMemo, useEffect, useRef } from "react";
import { load, save, removeKey } from "../utils/storage.js";
import { toIntlPhone, validatePhone } from "../utils/phone.js";
import { validateName } from "../utils/validation.js";
import { SAMPLE_GUESTS } from "../data/sampleGuests.js";
import { useGeolocation } from "./useGeolocation.js";

export function usePortalState({ onBack, t, lang, setLang }) {
  // ── Session persistence ──
  const [authed, setAuthed]     = useState(() => load("dawa_session_authed", false));
  const [userType, setUserType] = useState(() => load("dawa_session_type", null));
  const [currentUsername, setCurrentUsername] = useState(() => load("dawa_session_user", null));
  const [driverServingGroom, setDriverServingGroom] = useState(() => load("dawa_driver_serving_groom", null));

  const [loginUser, setLoginUser] = useState("");
  const [loginPass, setLoginPass] = useState("");
  const [loginError, setLoginError] = useState("");
  const [guests, setGuests] = useState(() => load("dawa_guests", SAMPLE_GUESTS));
  const [tab, setTab] = useState(() => load("dawa_session_tab", "dashboard"));
  const [toast, setToast] = useState(null);

  // Logout confirmation
  const [logoutAsking, setLogoutAsking] = useState(false);

  // Driver: pick-groom screen state
  const [driverGroomInput, setDriverGroomInput] = useState("");
  const [driverGroomError, setDriverGroomError] = useState("");

  // Shared-cities feature
  const [sharedStep, setSharedStep]               = useState("pickGrooms"); // "pickGrooms" | "pickCity" | "viewRoute"
  const [sharedSelectedGrooms, setSharedSelectedGrooms] = useState([]);
  const [sharedSelectedCity, setSharedSelectedCity]     = useState(null);

  // ── ADMIN: WhatsApp invitation system ──
  const [adminTab, setAdminTab] = useState("users"); // users | send | confirmations | settings
  const [adminSelectedGroom, setAdminSelectedGroom] = useState(null);
  const [adminMessageBody, setAdminMessageBody] = useState(
    () => load("dawa_admin_msg",
      "شركة دعوة ترحب بكم 🌸\nنحن شركة دعوة — متخصصون في توصيل مكاتيب الأعراس بطريقة احترافية وراقية.\n\nيُرجى تأكيد بياناتكم من خلال الرابط أدناه ليتمكن المرسل من إيصال المكتوب إليكم:")
  );
  const [adminFormLink, setAdminFormLink] = useState(() => load("dawa_admin_link", ""));
  const [confirmations, setConfirmations] = useState(() => load("dawa_confirmations", []));
  const [editingConf, setEditingConf] = useState(null);

  // Admin: managed users (persisted)
  const [users, setUsers] = useState(() => load("dawa_users", [
    { id: 1, role: "groom",  username: "groom",  password: "1234" },
    { id: 2, role: "driver", username: "driver", password: "1234" },
  ]));
  const [newUserRole, setNewUserRole] = useState("groom");
  const [newUserName, setNewUserName] = useState("");
  const [newUserPass, setNewUserPass] = useState("");

  // Groom: add-guest form state
  const [gName, setGName]   = useState("");
  const [gPhone, setGPhone] = useState("");
  const [gArea, setGArea]   = useState("");
  const [gType, setGType]   = useState("premium");

  // Groom: edit-guest modal state
  const [editingGuest, setEditingGuest] = useState(null);
  const [eName, setEName]   = useState("");
  const [ePhone, setEPhone] = useState("");
  const [eArea, setEArea]   = useState("");
  const [eType, setEType]   = useState("premium");

  // Groom: swipe-to-delete reveal state (guest id whose remove action is shown)
  const [revealedId, setRevealedId] = useState(null);
  const swipeStartRef = useRef({ id: null, x: 0 });

  // Distributor: delivery form state
  const [activeId, setActiveId]   = useState(null);
  const [photoTaken, setPhotoTaken] = useState(false);
  const [deliveryNote, setDeliveryNote] = useState("");

  // Photo viewer (groom clicks proof image)
  const [viewingPhoto, setViewingPhoto] = useState(null);
  // Captured photo (data-URL) before delivery confirm
  const [photoData, setPhotoData] = useState(null);

  // ── Persist on change ──
  useEffect(() => { save("dawa_guests", guests); }, [guests]);
  useEffect(() => { save("dawa_users",  users);  }, [users]);
  // Session
  useEffect(() => { save("dawa_session_authed", authed); }, [authed]);
  useEffect(() => { save("dawa_session_type",   userType); }, [userType]);
  useEffect(() => { save("dawa_session_user",   currentUsername); }, [currentUsername]);
  useEffect(() => { save("dawa_session_tab",    tab); }, [tab]);
  useEffect(() => { save("dawa_driver_serving_groom", driverServingGroom); }, [driverServingGroom]);
  // Admin
  useEffect(() => { save("dawa_admin_msg",  adminMessageBody); }, [adminMessageBody]);
  useEffect(() => { save("dawa_admin_link", adminFormLink);    }, [adminFormLink]);
  useEffect(() => { save("dawa_confirmations", confirmations); }, [confirmations]);

  // Toast helper — defined early so useGeolocation (called below) can use it.
  const showToast = (msg) => { setToast(msg); setTimeout(() => setToast(null), 3200); };

  // ── Live-location feature (driver broadcast + groom map) ──
  const geo = useGeolocation({ userType, currentUsername, t, showToast });

  // ── WhatsApp helpers ──
  // Build wa.me URL for a guest (phone + admin's customised message + form link)
  const waLinkFor = (phone) => {
    const intl = toIntlPhone(phone);
    if (!intl) return "";
    const body = (adminMessageBody || "").trim();
    const link = (adminFormLink || "").trim();
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
    const groomGuests = guests.filter(g => g.groomUsername === groomUsername);
    if (groomGuests.length === 0) return;
    showToast(t("admin_bulk_warn"));
    // Open each in a new tab — browsers may block; user must allow popups
    groomGuests.forEach((g, i) => {
      const url = waLinkFor(g.phone);
      if (url) setTimeout(() => window.open(url, "_blank", "noopener"), i * 300);
    });
  };

  // ── Match a confirmation against the groom's invited guests by phone ──
  const matchedGuestFor = (conf) => {
    const wantedPhone = (conf.submittedPhone || "").replace(/\D/g, "");
    if (!wantedPhone) return null;
    return guests.find(g => {
      if (g.groomUsername !== conf.groomUsername) return false;
      return (g.phone || "").replace(/\D/g, "") === wantedPhone;
    }) || null;
  };
  // Decide the color (green/red) for a confirmation card
  const matchColor = (conf) => {
    const guest = matchedGuestFor(conf);
    if (!guest) return "red"; // unknown — no matching phone
    const sameName = (guest.name || "").trim().toLowerCase() === (conf.submittedName || "").trim().toLowerCase();
    if (!sameName) return "red";
    const groomCity = (guest.area || "").split(/[-،,]/)[0].trim().toLowerCase();
    const guestCity = (conf.submittedCity || "").trim().toLowerCase();
    // Green if: groom had no city OR cities match
    if (!groomCity || groomCity === guestCity) return "green";
    return "red";
  };

  // ── Admin: apply confirmation edits to the matched guest record ──
  const useConfirmationData = (conf) => {
    const guest = matchedGuestFor(conf);
    if (!guest) return;
    const fullAddr = [conf.submittedCity, conf.submittedStreet, conf.submittedHouse].filter(Boolean).join("، ");
    setGuests(prev => prev.map(g => g.id === guest.id ? {
      ...g, name: conf.submittedName || g.name, phone: conf.submittedPhone || g.phone,
      area: fullAddr || g.area,
    } : g));
    showToast(t("edit_success"));
  };

  // ── Active groom username (whose guests we're operating on) ──
  // For groom: their own username. For driver: the groom they picked. For admin: none.
  const activeGroomUsername = userType === "groom" ? currentUsername
                            : userType === "driver" ? driverServingGroom
                            : null;

  // Filtered guest list for the active session
  const myGuests = useMemo(() =>
    activeGroomUsername
      ? guests.filter(g => g.groomUsername === activeGroomUsername)
      : guests,
    [guests, activeGroomUsername]
  );

  // ── Logout ──
  const doLogout = () => {
    setAuthed(false);
    setUserType(null);
    setCurrentUsername(null);
    setDriverServingGroom(null);
    setLoginUser("");
    setLoginPass("");
    setTab("dashboard");
    setSharedStep("pickGrooms");
    setSharedSelectedGrooms([]);
    setSharedSelectedCity(null);
    setLogoutAsking(false);
    // Clear session-specific localStorage but keep persistent data (guests, users, live url)
    removeKey("dawa_session_authed");
    removeKey("dawa_session_type");
    removeKey("dawa_session_user");
    removeKey("dawa_session_tab");
    removeKey("dawa_driver_serving_groom");
  };

  const stats = useMemo(() => {
    const total = myGuests.length;
    const delivered = myGuests.filter(g => g.status === "delivered").length;
    const enroute   = myGuests.filter(g => g.status === "enroute").length;
    const pending   = myGuests.filter(g => g.status === "pending").length;
    return { total, delivered, enroute, pending, pct: total ? Math.round(delivered/total*100) : 0 };
  }, [myGuests]);

  const handleLogin = () => {
    const u = loginUser.trim();
    const p = loginPass;
    // Admin (hidden, hardcoded — only the owner knows it)
    if (u === "admin" && p === "admin2026") {
      setAuthed(true); setUserType("admin"); setCurrentUsername("admin");
      setLoginError(""); setTab("admin");
      return;
    }
    // Dynamic users created by admin
    const found = users.find(usr => usr.username === u && usr.password === p);
    if (found) {
      setAuthed(true); setUserType(found.role); setCurrentUsername(found.username);
      setLoginError("");
      setTab(found.role === "driver" ? "pending" : "dashboard");
      // For drivers: ensure they pick a groom (will be shown if driverServingGroom is null)
    } else {
      setLoginError(t("login_error"));
    }
  };

  // Driver picks the groom they serve
  const submitDriverGroom = () => {
    const name = driverGroomInput.trim();
    if (!name) { setDriverGroomError(t("driver_pick_groom_invalid")); return; }
    const groomUser = users.find(u => u.role === "groom" && u.username === name);
    if (!groomUser) { setDriverGroomError(t("driver_pick_groom_invalid")); return; }
    setDriverServingGroom(name);
    setDriverGroomInput("");
    setDriverGroomError("");
    setTab("pending");
  };

  const addGuest = () => {
    if (!gName.trim() || !gPhone.trim()) {
      showToast(t("add_required_msg"));
      return;
    }
    const nameError = validateName(gName, t);
    if (nameError) { showToast(nameError); return; }
    const phoneError = validatePhone(gPhone, t);
    if (phoneError) { showToast(phoneError); return; }
    // Duplicate detection: by phone (primary) and by name (secondary) — scoped to current groom
    const normalizedPhone = gPhone.trim().replace(/\s+/g, "");
    const normalizedName  = gName.trim().toLowerCase();
    if (myGuests.some(g =>
        (g.phone || "").replace(/\s+/g, "") === normalizedPhone ||
        (g.name  || "").trim().toLowerCase() === normalizedName
    )) {
      showToast(t("add_duplicate_msg"));
      return;
    }
    const newGuest = {
      id: Date.now(),
      groomUsername: activeGroomUsername,
      name: gName.trim(),
      phone: gPhone.trim().replace(/\s+/g, ""),
      area: gArea.trim(),
      status: "pending",
      inviteType: gType,
    };
    setGuests(prev => [...prev, newGuest]);
    setGName(""); setGPhone(""); setGArea(""); setGType("premium");
    showToast(t("add_success"));
  };

  const removeGuest = (id) => {
    setGuests(prev => prev.filter(g => g.id !== id));
    showToast(t("delete_success"));
  };

  // Edit guest
  const startEdit = (g) => {
    setEditingGuest(g);
    setEName(g.name); setEPhone(g.phone); setEArea(g.area || ""); setEType(g.inviteType);
  };
  const cancelEdit = () => setEditingGuest(null);
  const saveEdit = () => {
    if (!eName.trim() || !ePhone.trim()) { showToast(t("add_required_msg")); return; }
    const nameError = validateName(eName, t);
    if (nameError) { showToast(nameError); return; }
    const phoneError = validatePhone(ePhone, t);
    if (phoneError) { showToast(phoneError); return; }
    setGuests(prev => prev.map(g => g.id === editingGuest.id ? {
      ...g, name: eName.trim(), phone: ePhone.trim().replace(/\s+/g, ""), area: eArea.trim(), inviteType: eType,
    } : g));
    setEditingGuest(null);
    showToast(t("edit_success"));
  };

  // Admin: user management
  const addUser = () => {
    if (!newUserName.trim() || !newUserPass.trim()) { showToast(t("admin_required")); return; }
    if (users.some(u => u.username === newUserName.trim()) || newUserName.trim() === "admin") {
      showToast(t("admin_taken")); return;
    }
    setUsers(prev => [...prev, {
      id: Date.now(), role: newUserRole,
      username: newUserName.trim(), password: newUserPass.trim(),
    }]);
    setNewUserName(""); setNewUserPass("");
    showToast(t("admin_added"));
  };
  const deleteUser = (id) => {
    setUsers(prev => prev.filter(u => u.id !== id));
    showToast(t("admin_deleted"));
  };

  // ── Per-guest confirmation status (used to colour cards in admin "send" tab) ──
  // Returns null (no confirmation yet), "matched" (everything lines up), or
  // an object { status: "mismatch", reasons: [...] } when something disagrees.
  const guestConfirmationStatus = (guest) => {
    if (!guest) return null;
    const guestPhoneDigits = (guest.phone || "").replace(/\D/g, "");
    if (!guestPhoneDigits) return null;
    // Find a confirmation whose phone matches AND that is for this groom
    const conf = confirmations.find(c =>
      c.groomUsername === guest.groomUsername &&
      (c.submittedPhone || "").replace(/\D/g, "") === guestPhoneDigits
    );
    if (!conf) return null;
    const reasons = [];
    // Name validation: at least 2 words; AND case-insensitive match to guest.name
    const submittedName = (conf.submittedName || "").trim();
    const words = submittedName.split(/\s+/).filter(Boolean);
    if (words.length < 2) reasons.push(t("conf_mismatch_invalid_name"));
    else if (submittedName.toLowerCase() !== (guest.name || "").trim().toLowerCase()) {
      reasons.push(t("conf_mismatch_name"));
    }
    // Phone validation: exactly 10 digits
    if (guestPhoneDigits.length !== 10) reasons.push(t("conf_mismatch_invalid_phone"));
    // City comparison (only if groom recorded a city)
    const groomCity = (guest.area || "").split(/[-،,]/)[0].trim().toLowerCase();
    const guestCity = (conf.submittedCity || "").trim().toLowerCase();
    if (groomCity && guestCity && groomCity !== guestCity) reasons.push(t("conf_mismatch_city"));
    return reasons.length === 0
      ? { status: "matched", conf }
      : { status: "mismatch", reasons, conf };
  };

  const markDelivered = (id) => {
    const time = new Date().toLocaleTimeString("ar", { hour: "2-digit", minute: "2-digit" });
    setGuests(prev => prev.map(g => g.id === id ? {
      ...g, status: "delivered",
      // Store the actual image data URL when a photo was captured, fallback to emoji marker
      proofImg: photoData || (photoTaken ? "📸" : undefined),
      deliveredAt: time,
      deliveredBy: lang === "he" ? "השליח (אתה)" : "المرسل (أنت)",
      deliveryNote: deliveryNote.trim() || undefined,
    } : g));
    setActiveId(null); setPhotoTaken(false); setPhotoData(null); setDeliveryNote("");
    showToast(t("driver_confirm"));
  };

  return {
    // passthrough props
    onBack, t, lang, setLang,
    // session / auth
    authed, userType, currentUsername,
    driverServingGroom, setDriverServingGroom,
    loginUser, setLoginUser, loginPass, setLoginPass, loginError, setLoginError,
    handleLogin, doLogout,
    logoutAsking, setLogoutAsking,
    driverGroomInput, setDriverGroomInput,
    driverGroomError, setDriverGroomError, submitDriverGroom,
    // navigation
    tab, setTab,
    // toast
    toast, showToast,
    // guests
    guests, myGuests, activeGroomUsername, stats,
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
    // users (admin)
    users, addUser, deleteUser,
    newUserRole, setNewUserRole, newUserName, setNewUserName, newUserPass, setNewUserPass,
    // admin messaging + confirmations
    adminTab, setAdminTab, adminSelectedGroom, setAdminSelectedGroom,
    adminMessageBody, setAdminMessageBody, adminFormLink, setAdminFormLink,
    confirmations, editingConf, setEditingConf,
    sendWaToOne, sendWaToAll,
    matchedGuestFor, matchColor, useConfirmationData, guestConfirmationStatus,
    // shared-cities
    sharedStep, setSharedStep,
    sharedSelectedGrooms, setSharedSelectedGrooms,
    sharedSelectedCity, setSharedSelectedCity,
    // live location (spread from useGeolocation)
    ...geo,
  };
}
