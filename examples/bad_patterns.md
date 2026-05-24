# Bad Patterns — Dawa

Anti-patterns to avoid. Each one has caused or could cause real problems.

---

## 1. Business logic in UI components

```jsx
// Bad — phone normalization in a component
function GuestRow({ guest }) {
  const normalized = guest.phone.replace(/\D/g, "").replace(/^972/, "");
  return <span>{normalized}</span>;
}

// Good — use the utility
import { toIntlPhone } from "../../utils/phone.js";
function GuestRow({ guest }) {
  return <span>{toIntlPhone(guest.phone)}</span>;
}
```

**Why:** Phone normalization has 6 edge cases (+972, 00972, 0 prefix, +970, etc.). Logic in components can't be unit tested without mounting React. Logic in `utils/phone.js` is covered by `phone.test.js`.

---

## 2. Hardcoded hex colors

```jsx
// Bad
<button style={{ background: "#c9a84c", color: "#1a1a2e" }}>

// Good
import { C } from "../../styles/theme.js";
<button style={{ background: C.gold, color: C.bg }}>
```

**Why:** The codebase had 254 hardcoded hex literals before the theme migration. A brand color change required touching 32 files. Token references are one edit.

---

## 3. Calling Firebase SDK directly from a component

```jsx
// Bad — component talks to Firestore directly
import { doc, setDoc } from "firebase/firestore";
import { firestore } from "../../firebase.js";

async function handleSave() {
  await setDoc(doc(firestore, "digitalGuests", uid), data);
}

// Good — component calls a service
import { addDigitalGuest } from "../../services/digitalInvitation.js";

async function handleSave() {
  await addDigitalGuest(uid, data);
}
```

**Why:** Service functions are testable and swappable. A component that imports Firestore directly is hard to test, can't be mocked, and leaks Firebase SDK details into the UI layer. This is also how the DigitalAddGuest bug went unnoticed — the Firestore call was not wrapped in error handling.

---

## 4. Skipping rate limits on public endpoints

```ts
// Bad — no rate limit on a public endpoint
export const submitConfirmation = onCall(async (req) => {
  const { name, phone } = req.data;
  await db.ref("confirmations").push({ name, phone }); // spammable!
});

// Good
export const submitConfirmation = onCall(async (req) => {
  if (!allow(`confirm:${req.rawRequest?.ip}`, 5, 60 * 60 * 1000)) {
    throw new HttpsError("resource-exhausted", "too_many_requests");
  }
  // ...
});
```

**Why:** App Check was removed. Rate limiting is the only abuse gate on public endpoints.

---

## 5. Calling assertAdmin after database reads

```ts
// Bad — reads data before checking permissions
export const deletePortalUser = onCall(async (req) => {
  const snap = await db.ref(`users/${req.data.uid}`).get(); // race: unauth can trigger this
  assertAdmin(req); // too late
});

// Good — authorize first, act second
export const deletePortalUser = onCall(async (req) => {
  assertAdmin(req);
  const snap = await db.ref(`users/${req.data.uid}`).get();
});
```

**Why:** Even though the `permission-denied` error eventually fires, the database read still happened. assertAdmin must always be the first line.

---

## 6. Using bare string role checks

```js
// Bad — typos silently allow wrong roles
if (userType === "admen") {
  showAdminPanel();
}

// Good
import { ROLES } from "../constants/roles.js";
if (userType === ROLES.ADMIN) {
  showAdminPanel();
}
```

**Why:** `"admen"` passes no type check. `ROLES.ADMIN` throws a linter error if the constant doesn't exist.

---

## 7. Blocking emulator connections in production builds

```js
// Bad — emulator connect called unconditionally (breaks prod)
connectDatabaseEmulator(db, "localhost", 9000);

// Good — guard on env var
if (import.meta.env.VITE_USE_EMULATORS === "1") {
  connectDatabaseEmulator(db, "localhost", 9000);
}
```

**Why:** This happened once and caused the production app to silently connect to nothing. `VITE_USE_EMULATORS=0` is set in `.env.production` to ensure this guard works correctly on production builds.

---

## 8. Fabricating API responses in tests

```js
// Bad — mock returns a hand-crafted response that may not match the real API
vi.mock("../../utils/apiClient.js", () => ({
  api: { get: vi.fn().mockResolvedValue({ guests: [{ id: "1", name: "Fake" }] }) }
}));

// Better — test the actual function with a real (emulator) API, or test the service
// function's error handling path only (not happy path with fabricated data)
```

**Why:** Mock-based tests that fabricate successful responses give false confidence. They pass even when the real API contract has changed. Integration tests against the emulator are preferred for data-path tests.

---

## 9. Committing the service-account key

```
# Bad — service account key in git history
git add dawa-aa793-firebase-adminsdk-fbsvc-e42554a05c.json
git commit -m "add service account key"

# The key is already in .gitignore — never override it
```

**Why:** A committed service-account key gives anyone with repo access full admin access to the Firebase project. There is no automated revocation; the key must be manually rotated.

---

## 10. Stale incremental tsc cache

```bash
# Bad — leaves tsconfig.tsbuildinfo from a previous build
cd functions && tsc

# Good — wipe the cache first (what scripts/build-functions.cjs does)
rm -rf functions/lib functions/tsconfig.tsbuildinfo && tsc -p functions/tsconfig.json
```

**Why:** When `lib/` is deleted but `tsconfig.tsbuildinfo` survives, tsc skips emitting files it thinks are up-to-date. Firebase deploy then prompts to delete the "missing" functions. `build-functions.cjs` always starts clean.

---

## 11. Silent error swallowing

```js
// Bad — error vanishes
try {
  await updateGuest(groomUid, guestId, patch);
} catch {
  // nothing
}

// Good — log it and surface to the user
try {
  await updateGuest(groomUid, guestId, patch);
} catch (err) {
  logErr("updateGuest", err);
  setToast(t("error_save_failed"));
}
```

**Why:** Silent catches are how the DigitalAddGuest and photo upload bugs went unnoticed. The submit button spinning forever is a symptom of a swallowed rejection. Always log + surface errors.
