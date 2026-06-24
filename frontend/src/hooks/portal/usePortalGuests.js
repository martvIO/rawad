// Portal guests domain — the former "tangled center" of usePortalState: the
// guests subscription + optimistic-delivery overlay, the shared-cities
// cross-groom subscription, the active-groom context, guest CRUD + its form
// state, and the delivery/outcome handlers + their form state. Returns the RAW
// guests list; the composition root runs it through usePortalProofs to decorate
// proof-photo URLs (preserving the original ordering of confirmations/sendInvites
// consuming the raw list).
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ROLES } from "../../constants/roles.js";
import {
  subscribeAllGuests, subscribeGuestsForGroom,
  addGuest as addGuestSrv, updateGuest as updateGuestSrv, removeGuest as removeGuestSrv,
} from "../../services/guests.js";
import { uploadProofBlob, dataUrlToBlob } from "../../services/proofs.js";
import { validatePhone } from "../../utils/phone.js";
import { validateName } from "../../utils/validation.js";
import { normalizePhoneForMatching } from "../../utils/matchUtils.js";
import { localizeApiError } from "../../utils/apiError.js";
import { logErr } from "../../utils/logger.js";
import { applyDeliveredOverlay as applyDeliveredOverlayPure, computeGuestStats } from "./guestLogic.js";

export function usePortalGuests({
  authed, isAdmin, userType,
  currentUid, currentUsername,
  driverServingGroomUid, driverServingGroomUsername,
  assignedGrooms,
  t, lang, showToast,
}) {
  // ── Guests subscription ─────────────────────────────────────────────────────
  const [guests, setGuests] = useState([]);
  // Guest ids the driver just marked delivered, kept until the server echoes
  // "delivered" so a 15s poll mid-confirm can't flip the row back to pending.
  const optimisticDeliveredRef = useRef(new Set());
  const applyDeliveredOverlay = useCallback(
    (list) => applyDeliveredOverlayPure(list, optimisticDeliveredRef.current),
    [],
  );
  const setGuestsWithOverlay = useCallback((listOrFn) => {
    setGuests((prev) => {
      const list = typeof listOrFn === "function" ? listOrFn(prev) : listOrFn;
      return applyDeliveredOverlay(list);
    });
  }, [applyDeliveredOverlay]);
  // True until the first guest poll lands, so list screens can show a skeleton.
  const [guestsLoading, setGuestsLoading] = useState(true);
  const onGuestsData = useCallback((list) => {
    setGuestsWithOverlay(list);
    setGuestsLoading(false);
  }, [setGuestsWithOverlay]);
  useEffect(() => {
    if (!authed) { setGuests([]); setGuestsLoading(false); return; }
    setGuestsLoading(true);
    if (isAdmin)                                 return subscribeAllGuests(onGuestsData);
    if (userType === ROLES.DRIVER && driverServingGroomUid)
      return subscribeGuestsForGroom(driverServingGroomUid, onGuestsData);
    if (userType === ROLES.GROOM && currentUid)
      return subscribeGuestsForGroom(currentUid, onGuestsData);
    setGuests([]); setGuestsLoading(false);
  }, [authed, isAdmin, userType, currentUid, driverServingGroomUid, onGuestsData]);

  // UIDs assigned to this driver (from the JWT claim) — used by Shared-Cities to
  // know which grooms' guests it may read.
  const driverAssignedGroomUids = useMemo(() => {
    if (userType !== ROLES.DRIVER) return [];
    if (!assignedGrooms || typeof assignedGrooms !== "object") return [];
    return Object.keys(assignedGrooms).filter((uid) => assignedGrooms[uid] === true);
  }, [userType, assignedGrooms]);
  // Stable string key for the assigned list — used as a dependency instead of the
  // object whose reference changes every render.
  const _assignedKey = driverAssignedGroomUids.slice().sort().join(",");

  // Unified subscription to all assigned grooms' guests (Shared-Cities only), so a
  // driver sees shared cities across every groom they have, not just the active
  // one. RTDB rules silently return empty for any unassigned groom.
  const [sharedGuests, setSharedGuests] = useState([]);
  useEffect(() => {
    if (userType !== ROLES.DRIVER || driverAssignedGroomUids.length === 0) {
      setSharedGuests([]);
      return;
    }
    // Keep each bucket separate so one groom's response can't wipe another's.
    const buckets = {};
    const merge = () =>
      setSharedGuests(applyDeliveredOverlay(Object.values(buckets).flat()));
    const unsubscribers = driverAssignedGroomUids.map((groomUid) =>
      subscribeGuestsForGroom(groomUid, (list) => {
        buckets[groomUid] = list;
        merge();
      }),
    );
    return () => unsubscribers.forEach((fn) => fn());
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

  // ── Derived ─────────────────────────────────────────────────────────────────
  const stats = useMemo(() => computeGuestStats(myGuests), [myGuests]);

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
    } catch (e) { logErr("addGuest", e); showToast(localizeApiError(e, t)); }
  };

  const removeGuest = async (id) => {
    const guest = myGuests.find(g => g.id === id);
    if (!guest) return;
    try { await removeGuestSrv(guest.groomUid, id); showToast(t("delete_success")); }
    catch (e) { logErr("removeGuest", e); showToast(localizeApiError(e, t)); }
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
    } catch (e) { logErr("saveGuestEdit", e); showToast(localizeApiError(e, t)); }
  };

  // ── Mark delivered (with optional photo upload) ─────────────────────────────
  // Pure variant — accepts its inputs explicitly so callers with their own local
  // UI state (e.g. the map modal) don't have to plumb through the delivery-form
  // state that DriverDeliveryList owns.
  const markGuestDelivered = async (id, { photoData: pData, photoTaken: pTaken, deliveryNote: pNote } = {}) => {
    const guest = myGuests.find(g => g.id === id) || sharedGuests.find(g => g.id === id);
    if (!guest) return false;
    const priorStatus = guest.status;
    const deliveredBy = lang === "he" ? "השליח (אתה)" : "المرسل (أنت)";
    // deliveredAt is a HH:MM display string by design (analytics + the RTDB
    // isString() validator depend on that shape). Force 24-hour latn HH:MM so the
    // stored value is uniform across both languages.
    const time = new Date().toLocaleTimeString(lang === "he" ? "he" : "ar", {
      hour: "2-digit", minute: "2-digit", hour12: false, numberingSystem: "latn",
    });

    // Optimistic: move the guest to "delivered" instantly. The proof upload +
    // status PATCH run in the background; the overlay keeps it delivered until the
    // server echoes it. On failure we revert so the driver can retry.
    optimisticDeliveredRef.current.add(id);
    setGuests(prev => prev.map(g => g.id === id ? { ...g, status: "delivered", deliveredAt: time, deliveredBy } : g));
    // Mirror into sharedGuests too — the Shared-Cities view renders from this
    // separate list. The overlay keeps it delivered across polls; we revert this
    // list as well on failure.
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

  // List-view wrapper — reads from the global delivery-form state and clears it on success.
  const markDelivered = async (id) => {
    const ok = await markGuestDelivered(id, { photoData, photoTaken, deliveryNote });
    if (ok) {
      setActiveId(null); setPhotoTaken(false); setPhotoData(null); setDeliveryNote("");
    }
  };

  // Driver records a NON-delivery outcome (no_answer / wrong_address / refused)
  // with an optional reason note. Server-first (pessimistic): infrequent, must not
  // run through the delivered-only optimistic overlay.
  const markGuestOutcome = async (id, status, note) => {
    const guest = guests.find(g => g.id === id) || sharedGuests.find(g => g.id === id);
    if (!guest) return false;
    try {
      const patch = { status };
      const reason = (note ?? "").trim();
      if (reason) patch.deliveryNote = reason;
      await updateGuestSrv(guest.groomUid, id, patch);
      setGuests(prev => prev.map(g => g.id === id ? { ...g, ...patch } : g));
      setSharedGuests(prev => prev.map(g => g.id === id ? { ...g, ...patch } : g));
      showToast(lang === "he" ? "הסטטוס נרשם והחתן עודכן" : "تم تسجيل الحالة وإشعار العريس");
      return true;
    } catch (e) {
      logErr("markGuestOutcome", e);
      showToast(localizeApiError(e, t));
      return false;
    }
  };

  // List-view wrapper — uses the shared delivery-note field as the reason and
  // clears the form on success.
  const markOutcome = async (id, status) => {
    const ok = await markGuestOutcome(id, status, deliveryNote);
    if (ok) {
      setActiveId(null); setPhotoTaken(false); setPhotoData(null); setDeliveryNote("");
    }
  };

  return {
    guests, // RAW list — the root decorates it via usePortalProofs
    myGuests, guestsLoading,
    activeGroomUid, activeGroomUsername,
    sharedGuests, driverAssignedGroomUids,
    stats,

    // guest form + CRUD
    gName, setGName, gPhone, setGPhone, gArea, setGArea, gType, setGType,
    editingGuest, startEdit, cancelEdit, saveEdit,
    eName, setEName, ePhone, setEPhone, eArea, setEArea, eType, setEType,
    revealedId, setRevealedId, swipeStartRef,
    addGuest, removeGuest,

    // delivery form + handlers
    activeId, setActiveId, photoTaken, setPhotoTaken,
    deliveryNote, setDeliveryNote, photoData, setPhotoData,
    markDelivered, markGuestDelivered, markOutcome, markGuestOutcome,

    // photo viewer
    viewingPhoto, setViewingPhoto,
  };
}
