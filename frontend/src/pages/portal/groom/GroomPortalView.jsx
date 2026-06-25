// Groom portal entry — routes between type-select, handwritten, and digital portals.
// The index route reads the last-used type from localStorage and redirects accordingly.
import { useEffect } from "react";
import { Routes, Route, Navigate, useNavigate } from "react-router-dom";
import { GroomTypeSelect } from "./GroomTypeSelect.jsx";
import { GroomHandwrittenShell } from "./GroomHandwrittenShell.jsx";
import { DigitalPortal } from "./digital/DigitalPortal.jsx";
import { STORAGE_KEYS } from "../../../constants/storageKeys.js";
import { FEATURES } from "../../../config/index.js";

function GroomTypeGate() {
  const navigate = useNavigate();
  useEffect(() => {
    const type = localStorage.getItem(STORAGE_KEYS.GROOM_TYPE);
    // The handwritten ("physical") track is gated behind a build-time beta flag.
    // While it's off, ignore a saved "handwritten" choice and send the groom to
    // type-select. We leave their localStorage intact, so re-enabling the flag
    // returns them straight to the handwritten dashboard.
    if      (FEATURES.physical && type === "handwritten") navigate("/portal/groom/handwritten/dashboard", { replace: true });
    else if (type === "digital")                          navigate("/portal/groom/digital/dashboard",     { replace: true });
    else                                                  navigate("/portal/groom/type-select",            { replace: true });
  }, [navigate]);
  return null;
}

export function GroomPortalView() {
  return (
    <Routes>
      <Route index                element={<GroomTypeGate />} />
      <Route path="type-select"   element={<GroomTypeSelect />} />
      <Route path="handwritten/*" element={
        FEATURES.physical ? <GroomHandwrittenShell /> : <Navigate to="/portal/groom/type-select" replace />
      } />
      <Route path="digital/*"     element={<DigitalPortal />} />
      <Route path="*"             element={<Navigate to="type-select" replace />} />
    </Routes>
  );
}
