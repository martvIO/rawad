# Plan: Add URL-Based Page Routing (react-router-dom)

## Context

The app currently uses pure React state for all navigation. No URL changes happen when switching between views or tabs — the browser's back button is useless, pages can't be bookmarked, and there's no way to share a direct link to a specific section. The user wants proper page routes so every view gets a unique URL and the browser handles navigation natively.

Current navigation state:
- `view` (App.jsx) — "landing" | "portal" | "confirmForm"
- `tab` (usePortalState) — groom tabs: "dashboard" | "guests" | "add" | "proofs" | "live"; driver tabs: "pending" | "shared"
- `adminTab` (usePortalState) — "users" | "send" | "confirmations" | "settings"
- `?form=GROOM_USERNAME` query param — public confirmation form

No routing library is installed. `react-router` does not appear in `package.json`.

---

## URL Structure

```
/                               → LandingPage (not logged in)
/confirm/:groomUsername         → Public confirmation form  (was ?form=USERNAME)

/portal                         → Redirect → /portal/groom/dashboard | /portal/admin/users | /portal/driver/pending
/portal/login                   → LoginScreen (if not authenticated)

/portal/admin/users             → AdminUserManager
/portal/admin/send              → AdminSendTab
/portal/admin/confirmations     → AdminConfirmationsTab
/portal/admin/settings          → AdminSettingsTab

/portal/groom/dashboard         → GroomDashboard
/portal/groom/guests            → GroomGuests
/portal/groom/add               → GroomAddGuest
/portal/groom/proofs            → GroomProofs
/portal/groom/live              → GroomLiveMap

/portal/driver/pending          → DriverDeliveryList
/portal/driver/shared           → SharedCities
```

All unknown paths → redirect to `/`.

---

## Implementation Steps

### 1. Install react-router-dom

```
npm install react-router-dom
```

No other dependency changes needed.

---

### 2. Wrap app in `<BrowserRouter>` — `src/main.jsx`

```jsx
import { BrowserRouter } from "react-router-dom";
// ...
root.render(
  <BrowserRouter>
    <App />
  </BrowserRouter>
);
```

---

### 3. Rewrite `src/App.jsx` — replace `view` state with `<Routes>`

Current: reads `?form=` from `window.location.search`, controls `view` via `useState`.

After:
```jsx
import { Routes, Route, Navigate, useNavigate } from "react-router-dom";

function App() {
  return (
    <Routes>
      <Route path="/"                       element={<LandingPage />} />
      <Route path="/confirm/:groomUsername" element={<ConfirmationForm />} />
      <Route path="/portal/*"               element={<Portal />} />
      <Route path="*"                       element={<Navigate to="/" replace />} />
    </Routes>
  );
}
```

`onBack` and similar callbacks replaced by `useNavigate()` hooks inside the components that need them.

---

### 4. Rewrite `src/pages/portal/Portal.jsx` — auth-aware nested routes

```jsx
import { Routes, Route, Navigate } from "react-router-dom";

function PortalRouter() {
  const { authed, authReady, userType } = usePortal();
  if (!authReady) return null;
  if (!authed) return <LoginScreen />;

  const defaultPath = userType === "admin"  ? "/portal/admin/users"
                    : userType === "driver" ? "/portal/driver/pending"
                    :                        "/portal/groom/dashboard";

  return (
    <Routes>
      <Route index element={<Navigate to={defaultPath} replace />} />
      <Route path="admin/*"  element={<RoleGuard roles={["admin"]}>  <AdminPortal />     </RoleGuard>} />
      <Route path="driver/*" element={<RoleGuard roles={["driver"]}> <DriverPortal />    </RoleGuard>} />
      <Route path="groom/*"  element={<RoleGuard roles={["groom"]}>  <GroomPortalView /> </RoleGuard>} />
      <Route path="*"        element={<Navigate to={defaultPath} replace />} />
    </Routes>
  );
}
```

---

### 5. Update each role portal to use URL-based tab navigation

#### `AdminPortal.jsx`

Replace `adminTab` state + tab-button clicks with `<NavLink>` and `<Routes>`:

```jsx
import { NavLink, Routes, Route, Navigate } from "react-router-dom";

// Tab bar: each button is a NavLink
<NavLink to="/portal/admin/users"         style={navStyle}>👥 Users</NavLink>
<NavLink to="/portal/admin/send"          style={navStyle}>📨 Send</NavLink>
<NavLink to="/portal/admin/confirmations" style={navStyle}>✓ Confirmations</NavLink>
<NavLink to="/portal/admin/settings"      style={navStyle}>⚙ Settings</NavLink>

// Tab content: nested Routes
<Routes>
  <Route index element={<Navigate to="users" replace />} />
  <Route path="users"         element={<AdminUserManager />} />
  <Route path="send"          element={<AdminSendTab />} />
  <Route path="confirmations" element={<AdminConfirmationsTab />} />
  <Route path="settings"      element={<AdminSettingsTab />} />
</Routes>
```

NavLink `style` callback uses `isActive` to apply active tab styling — replaces manual `adminTab === "x"` checks:
```jsx
const navStyle = ({ isActive }) => ({
  background: isActive ? "rgba(201,168,76,.18)" : "rgba(255,255,255,.04)",
  border: `1px solid ${isActive ? "rgba(201,168,76,.4)" : "rgba(255,255,255,.08)"}`,
  color: isActive ? "#c9a84c" : "#7a6a4a",
  // ... rest of button styles unchanged
});
```

#### `GroomPortalView.jsx`

Same pattern — NavLinks to:
- `/portal/groom/dashboard`
- `/portal/groom/guests`
- `/portal/groom/add`
- `/portal/groom/proofs`
- `/portal/groom/live`

#### `DriverPortal.jsx`

NavLinks to:
- `/portal/driver/pending`
- `/portal/driver/shared`

The `driverServingGroom` prerequisite gate stays: if `!driverServingGroom`, render `<DriverPickGroom />` regardless of route.

---

### 6. Update `src/hooks/usePortalState.js`

Remove:
- `tab`, `setTab` state and `dawa_session_tab` localStorage persistence
- `adminTab`, `setAdminTab` state
- The `useEffect` that called `setTab("admin")` etc. on login (Portal router's `<Navigate>` handles this)

Keep:
- `driverServingGroom` localStorage persistence (context, not navigation)
- `onBack` prop (becomes `useNavigate` call in App)

Any code that called `setTab("pending")` after an action (e.g. `submitDriverGroom`):
→ Replace with `navigate("/portal/driver/pending")` inside the component using `useNavigate()`.

---

### 7. Update `src/pages/ConfirmationForm.jsx`

Currently reads `?form=GROOM_USERNAME` from `window.location.search`.

After:
```jsx
import { useParams } from "react-router-dom";
const { groomUsername } = useParams();
```

Backward compatibility: in App.jsx, detect `?form=X` on `/` and redirect to `/confirm/X`.

---

### 8. firebase.json + netlify.toml — already done

Both already have `/**` → `/index.html` SPA rewrites. No changes needed.

---

## Files to Create / Modify

| File | Action |
|---|---|
| `package.json` | Add `react-router-dom` dependency |
| `src/main.jsx` | Wrap root in `<BrowserRouter>` |
| `src/App.jsx` | Replace `view` state + `?form=` detection with `<Routes>` |
| `src/pages/portal/Portal.jsx` | Rewrite with nested `<Routes>` + role-based default redirect |
| `src/pages/portal/admin/AdminPortal.jsx` | `<NavLink>` tabs + nested `<Routes>`; remove `adminTab` state |
| `src/pages/portal/groom/GroomPortalView.jsx` | `<NavLink>` tabs + nested `<Routes>`; remove `tab` state |
| `src/pages/portal/driver/DriverPortal.jsx` | `<NavLink>` tabs + nested `<Routes>`; remove `tab` state |
| `src/pages/ConfirmationForm.jsx` | `useParams()` instead of `?form=` query string |
| `src/hooks/usePortalState.js` | Remove `tab`/`adminTab` state + associated effects |

---

## Verification

1. `npm install` then `npm run build` — build must succeed with no errors.
2. Manual navigation smoke test (`npm run dev`):
   - `http://localhost:5173/` → LandingPage
   - `http://localhost:5173/confirm/admin` → Confirmation form for groom "admin"
   - Sign in as admin → auto-redirects to `/portal/admin/users`
   - Click each admin tab → URL changes; page reload stays on same tab
   - Browser back button → returns to previous tab
   - Sign in as groom → auto-redirects to `/portal/groom/dashboard`
   - Sign in as driver → auto-redirects to `/portal/driver/pending`
   - Visit `/portal/admin/users` while signed in as groom → RoleGuard blocks, redirected to groom dashboard
   - Bookmark `/portal/groom/guests` → reopening goes directly to guests tab
