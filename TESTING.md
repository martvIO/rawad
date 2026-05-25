# Testing — Dawa

---

## Test Architecture

Two test projects defined in `vitest.config.js`:

| Project | Command | Environment | What it covers |
|---|---|---|---|
| `unit` | `npm run test:unit` | jsdom | Pure logic: utils, data, service helpers, Cloud Function helpers |
| `integration` | `npm test` | node | RTDB security rules against Firebase Database emulator |

The integration project requires the Firebase emulator (Java 21). Run via `firebase emulators:exec`.

---

## Running Tests

```bash
# Unit tests — fast, no emulator
npm run test:unit

# Integration tests — requires Java 21 + Firebase CLI
npm test

# Unit tests in watch mode
npm run test:unit:watch

# Coverage report
npm run test:coverage
```

---

## Unit Test Files

All in `src/__tests__/` and `tests/functions/`:

| Test file | What it tests |
|---|---|
| `src/__tests__/utils/apiClient.test.js` | ApiError class, request auth headers, 401 retry logic, upload, parseResponse |
| `src/__tests__/utils/tokenManager.test.js` | storeTokens, clearTokens, getIdToken, refreshIdToken, scheduleRefresh |
| `src/__tests__/utils/poller.test.js` | createPoller — immediate fire, interval, stop, 401 propagation |
| `src/__tests__/utils/matchUtils.test.js` | Phone normalization, phonesEqual, classifyAll (GREEN/RED/Unknown) |
| `src/__tests__/utils/phone.test.js` | toIntlPhone, validatePhone, isPlaceholderPhone |
| `src/__tests__/utils/geo.test.js` | extractCoords, toEmbedUrl, extractCity |
| `src/__tests__/utils/password.test.js` | evaluatePassword, isStrongPassword |
| `src/__tests__/utils/storage.test.js` | load, save, removeKey |
| `src/__tests__/utils/validation.test.js` | validateName |
| `src/__tests__/data/status.test.js` | STATUS map, REPLY_STATUS map, replyStateOf |
| `src/__tests__/services/services.test.js` | Service layer unit tests |
| `tests/functions/helpers.test.ts` | assertAdmin, isE164, isUsername, normalisePhone, isStrongPassword |
| `tests/functions/rateLimit.test.ts` | allow() — sliding window, key isolation |
| `tests/functions/stripApiPrefix.test.ts` | stripApiPrefix middleware — path normalization |

---

## Integration Test Files

| Test file | What it tests |
|---|---|
| `tests/database.test.js` | RTDB read/write permissions against emulator |
| `tests/rules/database.rules.test.js` | Full RTDB security rule assertions (79 tests) |

### Key rule test scenarios

- Admin can read/write all nodes
- Groom can only read/write their own `/guestsByGroom/{uid}` subtree
- Driver can only read `/guestsByGroom/{uid}` for assigned grooms
- Unauthenticated reads are denied on all protected paths
- `/confirmations` — unauthenticated write via Cloud Function; admin read/edit
- `/inviteTokens` — publicly readable; Cloud Function write only
- `/adminSettings` — authenticated read; admin write only

---

## Browser / E2E Testing — Playwright MCP

For UI verification and end-to-end flows, use the **Playwright MCP** rather than writing `.spec.ts` files. The MCP server runs at `http://localhost:8931/mcp` (configured in `.claude/settings.local.json`).

Start the dev server, then ask Claude to navigate, click, and assert in the live browser. Screenshots can be taken at any step. See the "Browser Testing with Playwright MCP" section in `CLAUDE.md` for example prompts.

---

## What Is NOT Tested (gaps)

- REST API route handlers (`functions/src/api/routes/`) — no automated tests exist
- Firestore security rules — no rule tests for `digitalGuests`, `digitalMedia`, `photographerFiles`
- Storage security rules — no automated rule tests
- React component rendering — no component tests

---

## Adding Tests

### Unit test (util/pure function)

```js
// src/__tests__/utils/myUtil.test.js
import { describe, it, expect } from "vitest";
import { myUtil } from "../../utils/myUtil.js";

describe("myUtil", () => {
  it("does the thing", () => {
    expect(myUtil("input")).toBe("expected");
  });
});
```

### Integration test (RTDB rule)

```js
// tests/rules/database.rules.test.js
import { initializeTestEnvironment, assertFails, assertSucceeds } from "@firebase/rules-unit-testing";

const env = await initializeTestEnvironment({ projectId: "demo-dawa-test", ... });

it("admin can read /users", async () => {
  const db = env.authenticatedContext("adminUid", { role: "admin" }).database();
  await assertSucceeds(get(ref(db, "users/someUid")));
});

it("unauthenticated cannot read /users", async () => {
  const db = env.unauthenticatedContext().database();
  await assertFails(get(ref(db, "users/someUid")));
});
```

---

## Test Coverage Goals

| Area | Current | Target |
|---|---|---|
| Utils (pure logic) | Good | Maintain |
| Cloud Function helpers | Good | Maintain |
| RTDB security rules | 79 tests | Maintain |
| REST API routes | None | Add for auth + users + guests |
| Firestore rules | None | Add |
| Storage rules | None | Add |
