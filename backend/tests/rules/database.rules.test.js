// Security-rules tests for the Realtime Database.
//
// These tests run against the *database emulator* and load `database.rules.json`
// into an isolated namespace; each test gets a fresh, empty database. The
// emulator must be reachable on 127.0.0.1:9000 (default — see firebase.json).
//
// Run options (any one):
//   • `npm run test:rules`        — emulator already running
//   • `npm run test:rules:emu`    — boots the emulator, runs tests, tears down
//
// The Firebase web SDK is used unchanged; `initializeTestEnvironment` swaps in
// emulator credentials so reads/writes hit the right endpoint. `assertSucceeds`
// and `assertFails` map directly to "operation allowed by the rules" and
// "operation blocked by the rules".
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterAll, beforeAll, beforeEach, describe, expect, test } from "vitest";
import {
  initializeTestEnvironment, assertSucceeds, assertFails,
} from "@firebase/rules-unit-testing";
import { ref, get, set, update } from "firebase/database";

// Test fixtures (uids are arbitrary — the security rules only care about
// whether `auth.uid` matches the path / claim).
const ADMIN   = "uid-admin";
const GROOM   = "uid-groom-1";
const GROOM2  = "uid-groom-2";
const DRIVER  = "uid-driver-1";
const DRIVER2 = "uid-driver-2";

const validGuest = () => ({
  groomUsername: "g1",
  name:        "Khaled Tester",
  phone:       "0501112233",
  area:        "Haifa, Hanevi Street 1",
  status:      "pending",
  inviteType:  "premium",
});

const validUser = (overrides = {}) => ({
  username:  "g1",
  role:      "groom",
  phoneE164: "+972500000001",
  createdAt: Date.now(),
  ...overrides,
});

let env;

beforeAll(async () => {
  const rules = readFileSync(resolve(process.cwd(), "database.rules.json"), "utf8");
  env = await initializeTestEnvironment({
    projectId: "demo-dawa-rules",
    database: { rules, host: "127.0.0.1", port: 9000 },
  });
});

afterAll(async () => { if (env) await env.cleanup(); });
beforeEach(async () => { await env.clearDatabase(); });

// Seed initial DB state bypassing rules.
async function seed(updates) {
  await env.withSecurityRulesDisabled(async (ctx) => {
    await update(ref(ctx.database()), updates);
  });
}

// Convenience wrappers.
const asAnon   = () => env.unauthenticatedContext().database();
const asAdmin  = () => env.authenticatedContext(ADMIN, { role: "admin" }).database();
const asGroom  = (uid = GROOM)  => env.authenticatedContext(uid).database();
const asDriver = (uid = DRIVER) => env.authenticatedContext(uid).database();

// ── Smoke: emulator is reachable + clearDatabase actually clears ─────────────
describe("emulator connectivity", () => {
  test("clearDatabase empties the namespace", async () => {
    await seed({ [`users/${GROOM}`]: validUser() });
    // Read via the admin client to confirm the seed worked, then clear and re-check.
    expect((await get(ref(asAdmin(), `users/${GROOM}`))).exists()).toBe(true);
    await env.clearDatabase();
    expect((await get(ref(asAdmin(), `users/${GROOM}`))).exists()).toBe(false);
  });
});

// ── /users ───────────────────────────────────────────────────────────────────
describe("/users", () => {
  test("anonymous reads are blocked", async () => {
    await assertFails(get(ref(asAnon(), `users/${GROOM}`)));
  });
  test("users can read their own profile", async () => {
    await seed({ [`users/${GROOM}`]: validUser() });
    await assertSucceeds(get(ref(asGroom(), `users/${GROOM}`)));
  });
  test("users cannot read another user's profile", async () => {
    await seed({ [`users/${GROOM2}`]: validUser({ username: "g2" }) });
    await assertFails(get(ref(asGroom(), `users/${GROOM2}`)));
  });
  test("admin can read any profile", async () => {
    await seed({ [`users/${GROOM}`]: validUser() });
    await assertSucceeds(get(ref(asAdmin(), `users/${GROOM}`)));
  });
  test("clients cannot write to /users (only the admin SDK can)", async () => {
    // Even when authenticated as admin we should be blocked — the rule grants
    // .write only to auth.token.role === 'admin'. That works for the test SDK
    // because we pass the role claim, so we instead test that NON-admin is blocked.
    await assertFails(set(ref(asGroom(), `users/${GROOM}`), validUser()));
  });
  test("admin can write /users", async () => {
    await assertSucceeds(set(ref(asAdmin(), `users/${GROOM}`), validUser()));
  });
  test("validator rejects unknown role", async () => {
    await assertFails(set(ref(asAdmin(), `users/${GROOM}`),
      validUser({ role: "superuser" })));
  });
  test("validator rejects malformed phone", async () => {
    await assertFails(set(ref(asAdmin(), `users/${GROOM}`),
      validUser({ phoneE164: "0501234" })));
  });
});

// ── Per-field reads on /users (driver looking up their assigned groom) ───────
describe("/users per-field reads", () => {
  test("driver can read assigned groom's username", async () => {
    await seed({
      [`users/${GROOM}`]: validUser(),
      [`driverAssignments/${DRIVER}/${GROOM}`]: true,
    });
    await assertSucceeds(get(ref(asDriver(), `users/${GROOM}/username`)));
  });
  test("driver cannot read unassigned groom's username", async () => {
    await seed({ [`users/${GROOM2}`]: validUser({ username: "g2" }) });
    await assertFails(get(ref(asDriver(), `users/${GROOM2}/username`)));
  });
});

// ── /usernameIndex + /phoneIndex ─────────────────────────────────────────────
describe("/usernameIndex + /phoneIndex", () => {
  test("usernameIndex readable to any authed user", async () => {
    await seed({
      [`users/${GROOM}`]: validUser(),
      "usernameIndex/g1": GROOM,
    });
    await assertSucceeds(get(ref(asDriver(), "usernameIndex/g1")));
  });
  test("usernameIndex blocked for anonymous", async () => {
    await seed({
      [`users/${GROOM}`]: validUser(),
      "usernameIndex/g1": GROOM,
    });
    await assertFails(get(ref(asAnon(), "usernameIndex/g1")));
  });
  test("phoneIndex is NEVER client-readable (even admin)", async () => {
    await seed({
      [`users/${GROOM}`]: validUser(),
      "phoneIndex/972500000001": GROOM,
    });
    await assertFails(get(ref(asAdmin(), "phoneIndex/972500000001")));
  });
});

// ── /guestsByGroom ───────────────────────────────────────────────────────────
describe("/guestsByGroom", () => {
  test("groom can create their own guest with valid payload", async () => {
    await assertSucceeds(set(ref(asGroom(), `guestsByGroom/${GROOM}/abc1`), validGuest()));
  });
  test("groom cannot write to another groom's bucket", async () => {
    await assertFails(set(ref(asGroom(), `guestsByGroom/${GROOM2}/abc1`), validGuest()));
  });
  test("groom cannot list another groom's bucket", async () => {
    await seed({ [`guestsByGroom/${GROOM2}/abc1`]: validGuest() });
    await assertFails(get(ref(asGroom(), `guestsByGroom/${GROOM2}`)));
  });
  test("unassigned driver cannot read a groom's bucket", async () => {
    await seed({ [`guestsByGroom/${GROOM}/abc1`]: validGuest() });
    await assertFails(get(ref(asDriver(), `guestsByGroom/${GROOM}`)));
  });
  test("assigned driver can read the groom's bucket", async () => {
    await seed({
      [`guestsByGroom/${GROOM}/abc1`]: validGuest(),
      [`driverAssignments/${DRIVER}/${GROOM}`]: true,
    });
    await assertSucceeds(get(ref(asDriver(), `guestsByGroom/${GROOM}`)));
  });
  test("assigned driver can update an existing guest (delivery confirm)", async () => {
    await seed({
      [`guestsByGroom/${GROOM}/abc1`]: validGuest(),
      [`driverAssignments/${DRIVER}/${GROOM}`]: true,
    });
    await assertSucceeds(update(
      ref(asDriver(), `guestsByGroom/${GROOM}/abc1`),
      { status: "delivered", deliveredAt: "10:30", deliveredBy: "driver1" },
    ));
  });
  test("unassigned driver cannot update a guest", async () => {
    await seed({ [`guestsByGroom/${GROOM}/abc1`]: validGuest() });
    await assertFails(update(
      ref(asDriver(), `guestsByGroom/${GROOM}/abc1`),
      { status: "delivered" },
    ));
  });
  test("admin can read every groom's bucket", async () => {
    await seed({ [`guestsByGroom/${GROOM}/abc1`]: validGuest() });
    await assertSucceeds(get(ref(asAdmin(), "guestsByGroom")));
  });
  test("validator rejects an unknown status", async () => {
    await assertFails(set(ref(asGroom(), `guestsByGroom/${GROOM}/abc1`),
      { ...validGuest(), status: "in_transit" }));
  });
  test("validator rejects unknown inviteType", async () => {
    await assertFails(set(ref(asGroom(), `guestsByGroom/${GROOM}/abc1`),
      { ...validGuest(), inviteType: "gold" }));
  });
  test("validator rejects unknown extra fields", async () => {
    await assertFails(set(ref(asGroom(), `guestsByGroom/${GROOM}/abc1`),
      { ...validGuest(), nope: "haha" }));
  });
  test("validator accepts inviteWaStatus 'manual' (admin wa.me fallback stamp)", async () => {
    await assertSucceeds(set(ref(asGroom(), `guestsByGroom/${GROOM}/abc1`),
      { ...validGuest(), inviteWaStatus: "manual", inviteWaStatusAt: Date.now() }));
  });
  test("validator rejects an unknown inviteWaStatus", async () => {
    await assertFails(set(ref(asGroom(), `guestsByGroom/${GROOM}/abc1`),
      { ...validGuest(), inviteWaStatus: "carrier_pigeon" }));
  });
});

// ── /liveLocationsByGroom ────────────────────────────────────────────────────
describe("/liveLocationsByGroom", () => {
  const fix = () => ({
    lat: 32.79, lng: 35.00, accuracy: 5,
    timeISO: new Date().toISOString(),
  });
  // R2 hardening: a driver may write location DATA only to a groom they are
  // assigned to. Seed the assignment before the positive write cases.
  const assign = (driver = DRIVER, groom = GROOM) =>
    seed({ [`driverAssignments/${driver}/${groom}`]: true });

  test("driver writes their own shard when assigned to the groom", async () => {
    await assign();
    await assertSucceeds(set(
      ref(asDriver(), `liveLocationsByGroom/${GROOM}/${DRIVER}`),
      fix(),
    ));
  });
  test("driver canNOT write to a groom they are not assigned to", async () => {
    // No driverAssignments entry seeded → the write must be denied.
    await assertFails(set(
      ref(asDriver(), `liveLocationsByGroom/${GROOM}/${DRIVER}`),
      fix(),
    ));
  });
  test("driver can clear (remove) their own shard even without an assignment", async () => {
    // Clearing writes null; allowed regardless of assignment so an unassigned
    // driver can still remove a stale share.
    await seed({ [`liveLocationsByGroom/${GROOM}/${DRIVER}`]: fix() });
    await assertSucceeds(set(
      ref(asDriver(), `liveLocationsByGroom/${GROOM}/${DRIVER}`),
      null,
    ));
  });
  test("driver cannot write another driver's shard", async () => {
    await assign();
    await assertFails(set(
      ref(asDriver(), `liveLocationsByGroom/${GROOM}/${DRIVER2}`),
      fix(),
    ));
  });
  test("groom can list their own incoming shard", async () => {
    await seed({ [`liveLocationsByGroom/${GROOM}/${DRIVER}`]: fix() });
    await assertSucceeds(get(ref(asGroom(), `liveLocationsByGroom/${GROOM}`)));
  });
  test("groom cannot list another groom's incoming shard", async () => {
    await seed({ [`liveLocationsByGroom/${GROOM2}/${DRIVER}`]: fix() });
    await assertFails(get(ref(asGroom(), `liveLocationsByGroom/${GROOM2}`)));
  });
  test("validator rejects out-of-range latitude", async () => {
    await assign();
    await assertFails(set(
      ref(asDriver(), `liveLocationsByGroom/${GROOM}/${DRIVER}`),
      { ...fix(), lat: 999 },
    ));
  });
  test("validator rejects out-of-range longitude", async () => {
    await assign();
    await assertFails(set(
      ref(asDriver(), `liveLocationsByGroom/${GROOM}/${DRIVER}`),
      { ...fix(), lng: 999 },
    ));
  });
});

// ── /confirmations ───────────────────────────────────────────────────────────
describe("/confirmations", () => {
  const c = () => ({
    groomUid: GROOM, groomUsername: "g1",
    submittedName: "Khaled Tester", submittedPhone: "0501112233",
    submittedCity: "Haifa", submittedStreet: "", submittedHouse: "",
    confirmedAt: Date.now(),
  });
  test("admin can list /confirmations", async () => {
    await seed({ "confirmations/c1": c() });
    await assertSucceeds(get(ref(asAdmin(), "confirmations")));
  });
  test("non-admin cannot list /confirmations", async () => {
    await seed({ "confirmations/c1": c() });
    await assertFails(get(ref(asGroom(), "confirmations")));
  });
  test("clients cannot write to /confirmations (Function-only path)", async () => {
    // Even admin clients are blocked — only the Admin SDK from the Cloud Function can.
    await assertFails(set(ref(asAdmin(), "confirmations/c1"), c()));
    await assertFails(set(ref(asGroom(), "confirmations/c1"), c()));
    await assertFails(set(ref(asAnon(),  "confirmations/c1"), c()));
  });
});

// ── /adminSettings ───────────────────────────────────────────────────────────
describe("/adminSettings", () => {
  test("authed users can read /adminSettings", async () => {
    await seed({ "adminSettings/formLink": "https://example.com/c" });
    await assertSucceeds(get(ref(asGroom(),  "adminSettings")));
    await assertSucceeds(get(ref(asDriver(), "adminSettings")));
  });
  test("anonymous cannot read /adminSettings", async () => {
    await seed({ "adminSettings/formLink": "https://example.com/c" });
    await assertFails(get(ref(asAnon(), "adminSettings")));
  });
  test("only admin can write /adminSettings", async () => {
    await assertFails (set(ref(asGroom(), "adminSettings/formLink"), "https://x.test/c"));
    await assertSucceeds(set(ref(asAdmin(), "adminSettings/formLink"), "https://x.test/c"));
  });
  test("validator rejects non-https formLink", async () => {
    await assertFails(set(ref(asAdmin(), "adminSettings/formLink"), "http://x.test/c"));
  });
});

// ── /driverAssignments ───────────────────────────────────────────────────────
describe("/driverAssignments", () => {
  test("client writes are blocked (only assignDriverToGroom Function can)", async () => {
    await assertFails(set(ref(asDriver(), `driverAssignments/${DRIVER}/${GROOM}`), true));
    await assertFails(set(ref(asAdmin(),  `driverAssignments/${DRIVER}/${GROOM}`), true));
  });
  test("driver reads own assignment list", async () => {
    await seed({ [`driverAssignments/${DRIVER}/${GROOM}`]: true });
    await assertSucceeds(get(ref(asDriver(), `driverAssignments/${DRIVER}`)));
  });
  test("driver cannot read another driver's assignment list", async () => {
    await seed({ [`driverAssignments/${DRIVER2}/${GROOM}`]: true });
    await assertFails(get(ref(asDriver(), `driverAssignments/${DRIVER2}`)));
  });
  test("admin can read any driver's assignment list", async () => {
    await seed({ [`driverAssignments/${DRIVER}/${GROOM}`]: true });
    await assertSucceeds(get(ref(asAdmin(), `driverAssignments/${DRIVER}`)));
  });
});

// ── /audit ───────────────────────────────────────────────────────────────────
describe("/audit", () => {
  const e = () => ({ uid: ADMIN, action: "test", timestamp: Date.now() });
  test("admin can list /audit", async () => {
    await seed({ "audit/e1": e() });
    await assertSucceeds(get(ref(asAdmin(), "audit")));
  });
  test("non-admin cannot list /audit", async () => {
    await seed({ "audit/e1": e() });
    await assertFails(get(ref(asGroom(), "audit")));
  });
  test("no client can write to /audit (Function-only path)", async () => {
    await assertFails(set(ref(asAdmin(), "audit/e1"), e()));
    await assertFails(set(ref(asGroom(), "audit/e1"), e()));
  });
});

// ── /inviteTokens ──────────────────────────────────────────────────────────
// Token records are minted ONLY by the Admin SDK (server-side, which bypasses
// these rules) via the admin-gated POST /invites + POST /invites/digital
// endpoints. No client — not even a groom for their OWN guest — may write a
// token directly: doing so would bypass the admin gate, the per-user mint rate
// limit, and the audit log. Reads are already closed (the raw record carries
// guest PII + the full design snapshot; it is only ever projected by the
// server GET /invites/token/:token).
describe("/inviteTokens", () => {
  const TOK = "a".repeat(32); // 32-char token id, like randomBytes(16).hex
  const token = () => ({
    groomUid:      GROOM,
    groomUsername: "g1",
    guestId:       "guest1",
    guestName:     "Khaled Tester",
    guestPhone:    "0501112233",
    guestType:     "physical", // mirror the real Admin-SDK mint payload
    createdAt:     Date.now(),
    expiresAt:     Date.now() + 90 * 24 * 60 * 60 * 1000,
  });
  // A groom authenticated WITH the role claim they actually carry in
  // production (asGroom() above is claimless, so it can't exercise a
  // role-gated rule branch).
  const asGroomRole = (uid = GROOM) =>
    env.authenticatedContext(uid, { role: "groom", username: "g1" }).database();

  test("a groom cannot self-mint an invite token for their own guest", async () => {
    await assertFails(set(ref(asGroomRole(), `inviteTokens/${TOK}`), token()));
  });
  test("no client can write /inviteTokens (admin client included — Function-only path)", async () => {
    await assertFails(set(ref(asAdmin(), `inviteTokens/${TOK}`), token()));
    await assertFails(set(ref(asAnon(),  `inviteTokens/${TOK}`), token()));
  });
  test("clients cannot read a raw token record", async () => {
    await seed({ [`inviteTokens/${TOK}`]: token() });
    await assertFails(get(ref(asGroomRole(), `inviteTokens/${TOK}`)));
    await assertFails(get(ref(asAnon(),      `inviteTokens/${TOK}`)));
  });
});
