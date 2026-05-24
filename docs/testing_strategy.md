# Testing Strategy — Dawa

---

## Philosophy

Test the things most likely to break and most costly to miss:
1. **Security rules** — a wrong rule silently grants access to the wrong user
2. **Pure business logic** — matching algorithms, phone normalization, token math
3. **Auth/token lifecycle** — stale tokens, refresh races, session expiry

Do not test React component rendering — the app is small enough to verify visually, and component tests are brittle against inline-style churn.

---

## Test Split

| Layer | Environment | Tool | Run command |
|---|---|---|---|
| Unit — pure logic | jsdom | Vitest | `npm run test:unit` |
| Integration — RTDB rules | Node + Firebase emulator | Vitest + `@firebase/rules-unit-testing` | `npm test` |

---

## Unit Tests: What to Cover

### Critical (must have)
- **`matchUtils.js`** — phone normalization, phonesEqual, classifyAll (GREEN/RED/Unknown). These drive the admin confirmations matching UI. Bugs here lead to wrong match labels with no runtime error.
- **`tokenManager.js`** — storeTokens, clearTokens, getIdToken (expiry check), refreshIdToken (coalescing), scheduleRefresh (timer math).
- **`apiClient.js`** — 401 retry logic, skipAuth, multipart upload, ApiError shape.
- **`poller.js`** — immediate fire, interval fires, stop, 401 propagation.

### Important (should have)
- **`phone.js`** — toIntlPhone, validatePhone (both formats), isPlaceholderPhone
- **`password.js`** — evaluatePassword against each rule, isStrongPassword boundary
- **`geo.js`** — extractCoords from various URL formats, extractCity from various address strings
- **`validation.js`** — validateName — both valid and invalid inputs
- **`storage.js`** — load/save/removeKey — localStorage success and silent-failure paths
- **`status.js`** — replyStateOf with all three states
- **Cloud Function `helpers.ts`** — isE164, isUsername, normalisePhone, isStrongPassword, phoneIndexKey

### Lower priority
- `logger.js` — not worth testing; it's a trivial console wrapper

---

## Integration Tests: What to Cover

### RTDB security rules (79 tests currently exist — maintain and extend)

#### Core access patterns to keep covered:
- **Admin** can read and write every node
- **Groom** can read/write their own `/guestsByGroom/{uid}` subtree; cannot read another groom's
- **Driver** can read `/guestsByGroom/{uid}` only for assigned grooms; cannot write
- **Driver** can write their own `/liveLocationsByGroom/{groomUid}/{driverUid}`
- **Unauthenticated** is denied everywhere except `/inviteTokens` (public read)
- **`/adminSettings`** — authenticated read; admin write only
- **`/confirmations`** — Cloud Function write (via service account); admin read/update

#### Schema validation tests:
- `.validate` rejects wrong types (e.g. `confirmedAt` must be a number)
- Required fields can't be null

### What's missing and should be added:
- **Firestore rules** — `digitalGuests/{uid}/guests` write requires groom ownership or admin
- **Storage rules** — proof photo upload requires `assignedGrooms[groomUid]` claim
- **REST API routes** — at minimum: `/auth/login`, `/users` CRUD, `/guests` CRUD, `/confirmations` public submit

---

## Writing New Tests

### New unit test for a util function

```js
// src/__tests__/utils/myUtil.test.js
import { describe, it, expect } from "vitest";
import { myFunction } from "../../utils/myUtil.js";

describe("myFunction", () => {
  it("handles the happy path", () => {
    expect(myFunction("valid input")).toBe("expected output");
  });

  it("handles the edge case", () => {
    expect(myFunction("")).toBeNull();
  });
});
```

### New RTDB rule test

```js
// tests/rules/database.rules.test.js (add to existing describe block)
it("groom cannot read another groom's guests", async () => {
  const db = env.authenticatedContext("groomA", { role: "groom" }).database();
  await assertFails(get(ref(db, "guestsByGroom/groomBUid")));
});
```

### New REST API test (when added)

```ts
// tests/api/auth.test.ts
import { describe, it, expect } from "vitest";
import request from "supertest";
import { app } from "../../functions/src/api/index";

describe("POST /auth/login", () => {
  it("returns 400 when body is missing", async () => {
    const res = await request(app).post("/auth/login").send({});
    expect(res.status).toBe(400);
    expect(res.body.error).toBe("missing_fields");
  });
});
```

---

## Test Coverage Goals

| Area | Status | Priority |
|---|---|---|
| RTDB security rules | ✅ 79 tests | Maintain |
| matchUtils | ✅ Covered | Maintain |
| tokenManager | ✅ Covered | Maintain |
| apiClient | ✅ Covered | Maintain |
| poller | ✅ Covered | Maintain |
| phone / password / validation | ✅ Covered | Maintain |
| REST API routes (auth, users, guests) | ❌ Missing | High |
| Firestore security rules | ❌ Missing | Medium |
| Storage security rules | ❌ Missing | Medium |
| End-to-end (Playwright) | ❌ Missing | Low |

---

## Never Do

- Claim tests passed without running them
- Suppress failing tests with `.skip` without a dated TODO comment
- Mock Firebase RTDB in rule tests — use the actual emulator
- Write tests that test the test framework instead of the code
