// Groom portal entry — routes between type-select, handwritten, and digital portals.
// The index route reads the last-used type from localStorage and redirects accordingly.
import { useEffect } from "react";
import { Routes, Route, Navigate, useNavigate } from "react-router-dom";
import { GroomTypeSelect } from "./GroomTypeSelect.jsx";
import { GroomHandwrittenShell } from "./GroomHandwrittenShell.jsx";
import { DigitalPortal } from "./digital/DigitalPortal.jsx";

function GroomTypeGate() {
  const navigate = useNavigate();
  useEffect(() => {
    const type = localStorage.getItem("dawa_groom_type");
    if      (type === "handwritten") navigate("/portal/groom/handwritten/dashboard", { replace: true });
    else if (type === "digital")     navigate("/portal/groom/digital/dashboard",     { replace: true });
    else                              navigate("/portal/groom/type-select",            { replace: true });
  }, [navigate]);
  return null;
}

export function GroomPortalView() {
  return (
    <Routes>
      <Route index                element={<GroomTypeGate />} />
      <Route path="type-select"   element={<GroomTypeSelect />} />
      <Route path="handwritten/*" element={<GroomHandwrittenShell />} />
      <Route path="digital/*"     element={<DigitalPortal />} />
      <Route path="*"             element={<Navigate to="type-select" replace />} />
    </Routes>
  );
}
