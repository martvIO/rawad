// Confirmations domain — the admin-only subscription, fuzzy classification
// against the guest list, and the edit/attach handlers. Extracted from
// usePortalState; classification re-runs automatically when either
// confirmations or guests change.
import { useEffect, useMemo, useState } from "react";
import { formatAddress } from "../../utils/geo.js";
import { logErr } from "../../utils/logger.js";
import { localizeApiError } from "../../utils/apiError.js";
import { MATCH_STATUS } from "../../constants/matchStatuses.js";
import {
  subscribeConfirmations,
  updateConfirmation as updateConfirmationSrv,
  attachConfirmationLocationToGuest as attachConfLocationSrv,
} from "../../services/confirmations.js";
import { updateGuest as updateGuestSrv } from "../../services/guests.js";
import { classifyAll, normalizePhoneForMatching } from "../../utils/matchUtils.js";

export function usePortalConfirmations({ isAdmin, guests, t, showToast }) {
  // Confirmations (admin-only subscription)
  const [confirmations, setConfirmations] = useState([]);
  // True until the first poll lands, so the list can show a skeleton instead of
  // an empty state while data is still loading (the array starts []).
  const [confirmationsLoading, setConfirmationsLoading] = useState(false);
  useEffect(() => {
    if (!isAdmin) { setConfirmations([]); setConfirmationsLoading(false); return; }
    setConfirmationsLoading(true);
    return subscribeConfirmations((list) => {
      setConfirmations(list);
      setConfirmationsLoading(false);
    });
  }, [isAdmin]);
  const [editingConf, setEditingConf] = useState(null);

  // ── Confirmation matching ───────────────────────────────────────────────────
  // Phone is the primary key. Names/addresses use fuzzy similarity tolerant
  // of spelling variants, Arabic/Hebrew/English transliteration, and word
  // reordering (see src/utils/matchUtils.js for details).
  const classificationMap = useMemo(
    () => {
      const map = classifyAll(confirmations, guests);
      // Digital-invite RSVPs are confirmed through the digital flow and have no
      // RTDB guest to fuzzy-match against, so classifyAll would mark them
      // "unknown". They are valid confirmations — show them green with no
      // mismatch reasons.
      for (const conf of confirmations) {
        if (conf?.source === "digital") {
          map.set(conf.id, { status: MATCH_STATUS.GREEN, guest: null, reasons: [] });
        }
      }
      return map;
    },
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
    } catch (e) { logErr("useConfirmationData", e); showToast(localizeApiError(e, t)); }
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
    } catch (e) { logErr("saveConfirmationEdit", e); showToast(localizeApiError(e, t)); }
  };

  // Admin-only: copy a confirmation's stored coords onto a specific guest.
  // Surfaced from EditConfirmationModal when auto-attach couldn't resolve.
  const attachConfirmationToGuest = async (confirmationId, guestId) => {
    if (!confirmationId || !guestId) return;
    try {
      await attachConfLocationSrv({ confirmationId, guestId });
      showToast(t("admin_conf_attach_success"));
    } catch (e) { logErr("attachConfirmationToGuest", e); showToast(localizeApiError(e, t)); }
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

  return {
    confirmations, confirmationsLoading, editingConf, setEditingConf,
    matchedGuestFor, matchColor, confirmationReasons,
    useConfirmationData, saveConfirmationEdit, attachConfirmationToGuest,
    guestConfirmationStatus,
  };
}
