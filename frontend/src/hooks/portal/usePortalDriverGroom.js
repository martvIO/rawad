// Portal driver→groom selection domain — the groom a driver is currently
// delivering for (persisted in localStorage, since the username isn't
// world-readable), plus the pick-groom flow. Extracted from usePortalState.
import { useEffect, useState } from "react";
import { load, save, removeKey } from "../../utils/storage.js";
import { STORAGE_KEYS } from "../../constants/storageKeys.js";
import { assignDriverToGroom } from "../../services/assignments.js";

export function usePortalDriverGroom({ navigate, t }) {
  // Persisted as { uid, username }.
  const [driverServingGroom, setDriverServingGroomState] = useState(
    () => load(STORAGE_KEYS.DRIVER_SERVING_GROOM, null),
  );
  useEffect(() => {
    save(STORAGE_KEYS.DRIVER_SERVING_GROOM, driverServingGroom);
  }, [driverServingGroom]);
  const driverServingGroomUid = driverServingGroom?.uid ?? null;
  const driverServingGroomUsername = driverServingGroom?.username ?? null;

  // Pick-groom input
  const [driverGroomInput, setDriverGroomInput] = useState("");
  const [driverGroomError, setDriverGroomError] = useState("");

  // Driver picks a groom (server-side: assignDriverToGroom Function).
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

  // Compatibility alias so the JSX slice can set by username string or object.
  const setDriverServingGroom = (next) => setDriverServingGroomState(
    next === null ? null
                  : (typeof next === "string" ? { uid: null, username: next } : next),
  );

  // Clear on logout — the composition root calls this as part of doLogout.
  const clearServingGroom = () => {
    setDriverServingGroomState(null);
    removeKey(STORAGE_KEYS.DRIVER_SERVING_GROOM);
  };

  return {
    driverServingGroom, // the {uid, username} object (usePortalUsers consumes it)
    driverServingGroomUid, driverServingGroomUsername,
    setDriverServingGroom, clearServingGroom,
    driverGroomInput, setDriverGroomInput,
    driverGroomError, setDriverGroomError,
    submitDriverGroom,
  };
}
