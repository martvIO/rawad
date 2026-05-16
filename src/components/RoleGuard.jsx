// Client-side role gate. Renders `children` only when the signed-in user's
// role is in `roles`; otherwise renders `fallback` (default: null).
//
// IMPORTANT: this is convenience-only — it stops the wrong UI from rendering
// for the wrong role, but it is NOT the authoritative security check. Every
// privileged action is also gated by:
//   - Cloud Function `assertAdmin()` (functions/src/helpers.ts)
//   - RTDB security rules (database.rules.json)
//   - Firebase Auth custom claims (auth.token.role, assignedGrooms)
// Even if a determined client bypasses this guard, the server will reject
// any action they're not entitled to.
import { usePortal } from "../context/PortalContext.jsx";

export function RoleGuard({ roles, children, fallback = null }) {
  const { userType, authed, authReady } = usePortal();
  // While auth is still resolving, render nothing — avoids flashing the
  // wrong role's UI for one frame.
  if (!authReady) return null;
  if (!authed) return fallback;
  if (!Array.isArray(roles) || !roles.includes(userType)) return fallback;
  return children;
}
