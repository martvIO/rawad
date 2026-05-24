# Good Patterns — Dawa

Proven approaches used in this codebase. Follow these when adding similar functionality.

---

## 1. Service layer subscription with createPoller

Services export an `unsubscribe` function that the hook calls on cleanup. Consistent with the old `onValue` contract — the rest of the codebase doesn't need to know it's polling under the hood.

```js
// src/services/guests.js
export function subscribeGuestsForGroom(groomUid, cb) {
  return createPoller(
    () => api.get(`/guests?groomUid=${groomUid}`).then(r => r.guests ?? []),
    cb,
    { intervalMs: POLL_MS.GUESTS }
  );
}

// src/hooks/usePortalState.js — consumer
useEffect(() => {
  if (!groomUid) return;
  const unsub = subscribeGuestsForGroom(groomUid, setMyGuests);
  return unsub; // React calls this on unmount
}, [groomUid]);
```

**Why:** The service owns the fetch logic; the hook owns the lifecycle. Swapping from polling to SSE later only changes `subscribeGuestsForGroom` — zero changes in the hook.

---

## 2. ApiError branching in service functions

Use `err.status` to distinguish error types. Let unknown errors propagate — don't swallow them.

```js
// src/services/users.js
export async function createPortalUser(data) {
  try {
    return await api.post("/users", data);
  } catch (err) {
    if (err instanceof ApiError && err.status === 400) {
      // Validation error — return the body so the UI can show field errors
      throw err; // re-throw; the caller decides how to display
    }
    logErr("createPortalUser", err);
    throw err;
  }
}
```

**Why:** `ApiError` carries `.status` and `.body`. Callers can branch on `err.status === 409` (conflict) vs. `err.status === 400` (validation) without re-parsing the response.

---

## 3. Rate-limiting middleware applied at route declaration

```ts
// functions/src/api/routes/auth.ts
authRouter.post(
  "/login",
  ipRateLimit("login", LOGIN_RATE_PER_HOUR, ONE_HOUR_MS),
  async (req, res) => { ... }
);
```

**Why:** The rate limit is co-located with the route, visible at a glance. It's applied before the handler — no risk of forgetting it inside the handler body.

---

## 4. assertAdmin called first in every privileged Cloud Function

```ts
// functions/src/users.ts
export const deletePortalUser = onCall(async (req) => {
  assertAdmin(req);     // throws permission-denied before any reads/writes
  const { uid } = req.data;
  // ... safe to proceed
});
```

**Why:** Fail fast. Any exception here surfaces as a `permission-denied` error to the caller. No database reads happen before authorization is verified.

---

## 5. Design tokens instead of hardcoded colors

```jsx
// Good
import { C, ROLE, S } from "../../styles/theme.js";

<div style={{ background: C.bg, color: C.gold, ...S.fieldLabel }}>
  <span style={{ color: ROLE.admin.color }}>Admin</span>
</div>

// Bad
<div style={{ background: "#1a1a2e", color: "#c9a84c" }}>
```

**Why:** Color changes are made in one place. Accidental variations (a slightly different gold) are impossible.

---

## 6. Phone normalization before any comparison

```js
// src/utils/matchUtils.js
function normalizePhoneForMatching(raw) {
  // Strip +972, 972, 00972, +970, 0 prefixes → bare national number
  let digits = String(raw ?? "").replace(/\D/g, "");
  if (digits.startsWith("972")) digits = digits.slice(3);
  else if (digits.startsWith("970")) digits = digits.slice(3);
  if (digits.startsWith("0")) digits = digits.slice(1);
  return digits;
}

// Always normalize both sides before comparing
export function phonesEqual(a, b) {
  return normalizePhoneForMatching(a) === normalizePhoneForMatching(b);
}
```

**Why:** Confirmation form submissions arrive in mixed formats (`+972-50-...`, `050...`, `972 50...`). Without normalization, identical phones appear different and matching fails silently.

---

## 7. Centralized config instead of scattered env reads

```js
// Good — import once from config
import { API_BASE_URL, POLL_MS, GEO } from "../config/index.js";

// Bad — scattered import.meta.env reads with no single source of truth
const url = import.meta.env.VITE_API_BASE_URL ?? "/api";
```

**Why:** All environment-driven values and timing constants are in `src/config/index.js`. If a constant changes (e.g. `POLL_MS.GUESTS`), it changes in one place and is immediately visible to all consumers.

---

## 8. Logging errors with the tagged logger

```js
// Good
import { logErr, log } from "../utils/logger.js";

try {
  await doSomething();
} catch (err) {
  logErr("subscribeGuests", err); // tagged [dawa], silent in prod
  throw err;
}

// Bad — bare console.error clutters prod logs
console.error("error in subscribeGuests:", err);
```

**Why:** `logErr` prefixes every message with `[dawa]` so it's easy to filter. It's a no-op in production unless `VITE_DEBUG=1` is set. Bare `console.error` calls can't be silenced globally.

---

## 9. Role constants instead of inline strings

```js
// Good
import { ROLES } from "../constants/roles.js";

if (userType === ROLES.ADMIN) { ... }
if (claim.role === ROLES.DRIVER) { ... }

// Bad — typos silently disable role checks
if (userType === "admen") { ... }
```

**Why:** `ROLES.ADMIN` is caught by an IDE. `"admen"` is not. The `ROLES` object is frozen to prevent mutation.

---

## 10. Public Cloud Function endpoints with explicit rate limiting

```ts
// Every public endpoint needs its own rate limit call
export const submitConfirmation = onCall(
  { enforceAppCheck: false },
  async (req) => {
    // Rate-limit by IP before touching any database
    if (!allow(`confirm:${req.rawRequest?.ip}`, 5, 60 * 60 * 1000)) {
      throw new HttpsError("resource-exhausted", "too_many_requests");
    }
    // ... proceed
  }
);
```

**Why:** Public endpoints are the only abuse surface. App Check was removed, so rate limiting is the sole guard. No public function should omit this call.
