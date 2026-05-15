// Database security-rule tests.
//
// Each test boots a synthetic auth context (anonymous / groom / driver / admin)
// against the Firebase Realtime Database emulator loaded with our actual
// database.rules.json, then exercises a single read/write boundary.
//
// To run: `npm test`  (wraps everything in `firebase emulators:exec --only database`).
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

import {
  afterAll, beforeAll, beforeEach, describe, expect, it,
} from "vitest";
import {
  initializeTestEnvironment,
  assertSucceeds,
  assertFails,
} from "@firebase/rules-unit-testing";
import {
  ref, get, set, update, remove, push,
} from "firebase/database";

const HERE = dirname(fileURLToPath(import.meta.url));
const RULES = readFileSync(resolve(HERE, "../database.rules.json"), "utf8");

/* ─────────────────────────── fixtures ─────────────────────────── */

const UID_ADMIN  = "admin-uid";
const UID_GROOM1 = "groom1-uid";
const UID_GROOM2 = "groom2-uid";
const UID_DRIVER = "driver-uid";

let testEnv;

beforeAll(async () => {
  testEnv = await initializeTestEnvironment({
    projectId: "demo-dawa-test",
    database: {
      rules: RULES,
      // The emulator host:port is read from FIREBASE_DATABASE_EMULATOR_HOST,
      // which `firebase emulators:exec` injects automatically.
    },
  });
});

afterAll(async () => {
  if (testEnv) await testEnv.cleanup();
});

beforeEach(async () => {
  await testEnv.clearDatabase();
  // Seed canonical world: two grooms, one driver, one admin profile.
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.database();
    const baseProfile = (extra) => ({
      username: "x", role: "groom", phoneE164: "+972500000000", createdAt: 1, ...extra,
    });
    await set(ref(db, "users/" + UID_ADMIN),  baseProfile({ username: "admin",  role: "admin"  }));
    await set(ref(db, "users/" + UID_GROOM1), baseProfile({ username: "groom1", role: "groom"  }));
    await set(ref(db, "users/" + UID_GROOM2), baseProfile({ username: "groom2", role: "groom"  }));
    await set(ref(db, "users/" + UID_DRIVER), baseProfile({ username: "driver", role: "driver" }));
    await set(ref(db, "usernameIndex/admin"),  UID_ADMIN);
    await set(ref(db, "usernameIndex/groom1"), UID_GROOM1);
    await set(ref(db, "usernameIndex/groom2"), UID_GROOM2);
    await set(ref(db, "usernameIndex/driver"), UID_DRIVER);
    await set(ref(db, "phoneIndex/972500000001"), UID_GROOM1);
    // driver is assigned to groom1 (and groom1 only).
    await set(ref(db, `driverAssignments/${UID_DRIVER}/${UID_GROOM1}`), true);
    // Seed one guest per groom.
    await set(ref(db, `guestsByGroom/${UID_GROOM1}/g1`), {
      name: "Guest One", phone: "0501111111", status: "pending", inviteType: "premium",
    });
    await set(ref(db, `guestsByGroom/${UID_GROOM2}/g2`), {
      name: "Guest Two", phone: "0502222222", status: "pending", inviteType: "premium",
    });
    await set(ref(db, "adminSettings"), { messageBody: "Hello", formLink: "https://example.com/confirm" });
    await set(ref(db, "confirmations/c1"), {
      groomUid: UID_GROOM1, submittedName: "X Y", submittedPhone: "0501111111", confirmedAt: 1,
    });
  });
});

/* helpers */
const anon   = () => testEnv.unauthenticatedContext().database();
const groom1 = () => testEnv.authenticatedContext(UID_GROOM1).database();
const groom2 = () => testEnv.authenticatedContext(UID_GROOM2).database();
const driver = () => testEnv.authenticatedContext(UID_DRIVER).database();
const admin  = () => testEnv.authenticatedContext(UID_ADMIN, { admin: true }).database();

/* ─────────────────────────── /users ─────────────────────────── */

describe("/users", () => {
  it("anonymous cannot read any user", async () => {
    await assertFails(get(ref(anon(), "users/" + UID_GROOM1)));
  });

  it("a groom can read their own profile", async () => {
    await assertSucceeds(get(ref(groom1(), "users/" + UID_GROOM1)));
  });

  it("a groom cannot read another groom's profile", async () => {
    await assertFails(get(ref(groom1(), "users/" + UID_GROOM2)));
  });

  it("an admin can read any user", async () => {
    await assertSucceeds(get(ref(admin(), "users/" + UID_GROOM1)));
    await assertSucceeds(get(ref(admin(), "users/" + UID_GROOM2)));
  });

  it("a groom cannot write into /users (not even their own)", async () => {
    await assertFails(
      update(ref(admin().app ? groom1() : groom1(), "users/" + UID_GROOM1), { displayName: "evil" }),
    );
  });

  it("admin can update a profile (writes pass rules; Function does the real work in prod)", async () => {
    await assertSucceeds(
      update(ref(admin(), "users/" + UID_GROOM1), { displayName: "new name" }),
    );
  });

  it("driver can read username/role of an assigned groom but NOT an unassigned one", async () => {
    // groom1 is assigned to this driver; groom2 is not.
    await assertSucceeds(get(ref(driver(), `users/${UID_GROOM1}/username`)));
    await assertSucceeds(get(ref(driver(), `users/${UID_GROOM1}/role`)));
    await assertFails   (get(ref(driver(), `users/${UID_GROOM2}/username`)));
  });
});

/* ──────────────────────── /guestsByGroom ──────────────────────── */

describe("/guestsByGroom", () => {
  it("anonymous cannot read any groom's guests", async () => {
    await assertFails(get(ref(anon(), `guestsByGroom/${UID_GROOM1}`)));
  });

  it("a groom can read their own subtree", async () => {
    await assertSucceeds(get(ref(groom1(), `guestsByGroom/${UID_GROOM1}`)));
  });

  it("a groom CANNOT read another groom's subtree", async () => {
    await assertFails(get(ref(groom1(), `guestsByGroom/${UID_GROOM2}`)));
  });

  it("a driver can read the assigned groom's subtree but NOT an unassigned one", async () => {
    await assertSucceeds(get(ref(driver(), `guestsByGroom/${UID_GROOM1}`)));
    await assertFails   (get(ref(driver(), `guestsByGroom/${UID_GROOM2}`)));
  });

  it("admin can read everything under /guestsByGroom", async () => {
    await assertSucceeds(get(ref(admin(), "guestsByGroom")));
  });

  it("a groom can add a guest to their own subtree", async () => {
    const r = push(ref(groom1(), `guestsByGroom/${UID_GROOM1}`));
    await assertSucceeds(set(r, {
      name: "New Guest", phone: "0509999999", status: "pending", inviteType: "premium",
    }));
  });

  it("a groom CANNOT add a guest to another groom's subtree", async () => {
    const r = push(ref(groom1(), `guestsByGroom/${UID_GROOM2}`));
    await assertFails(set(r, {
      name: "Sneaky", phone: "0509999999", status: "pending", inviteType: "premium",
    }));
  });

  it("guest schema is enforced (bad status rejected)", async () => {
    const r = push(ref(groom1(), `guestsByGroom/${UID_GROOM1}`));
    await assertFails(set(r, {
      name: "Bad", phone: "0509999999", status: "totally-bogus", inviteType: "premium",
    }));
  });

  it("assigned driver can update a guest's status (delivery)", async () => {
    await assertSucceeds(
      update(ref(driver(), `guestsByGroom/${UID_GROOM1}/g1`), { status: "delivered" }),
    );
  });

  it("unassigned driver CANNOT update a guest", async () => {
    await assertFails(
      update(ref(driver(), `guestsByGroom/${UID_GROOM2}/g2`), { status: "delivered" }),
    );
  });

  it("a groom can delete their own guest", async () => {
    await assertSucceeds(remove(ref(groom1(), `guestsByGroom/${UID_GROOM1}/g1`)));
  });
});

/* ──────────────────── /liveLocationsByGroom ──────────────────── */

describe("/liveLocationsByGroom", () => {
  const FIX = { lat: 32.5, lng: 35.0, accuracy: 10, timeISO: new Date().toISOString() };

  it("a driver writes their own fix into the destination groom's shard", async () => {
    await assertSucceeds(
      set(ref(driver(), `liveLocationsByGroom/${UID_GROOM1}/${UID_DRIVER}`), FIX),
    );
  });

  it("a driver CANNOT write under someone else's driverUid (spoofing)", async () => {
    await assertFails(
      set(ref(driver(), `liveLocationsByGroom/${UID_GROOM1}/someoneElse`), FIX),
    );
  });

  it("listed groom can read their shard, other groom cannot", async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await set(ref(ctx.database(), `liveLocationsByGroom/${UID_GROOM1}/${UID_DRIVER}`), FIX);
    });
    await assertSucceeds(get(ref(groom1(), `liveLocationsByGroom/${UID_GROOM1}`)));
    await assertFails   (get(ref(groom2(), `liveLocationsByGroom/${UID_GROOM1}`)));
  });

  it("bad coordinates are rejected by validation", async () => {
    await assertFails(
      set(ref(driver(), `liveLocationsByGroom/${UID_GROOM1}/${UID_DRIVER}`), {
        ...FIX, lat: 999,
      }),
    );
  });
});

/* ───────────────────────── /confirmations ───────────────────── */

describe("/confirmations", () => {
  it("client writes are rejected even for admin (Function-only)", async () => {
    await assertFails(
      push(ref(admin(), "confirmations")).then(r => set(r, {
        groomUid: UID_GROOM1, submittedName: "x y", submittedPhone: "0501111111", confirmedAt: 1,
      })),
    );
  });

  it("admin can read /confirmations", async () => {
    await assertSucceeds(get(ref(admin(), "confirmations")));
  });

  it("a groom CANNOT read /confirmations", async () => {
    await assertFails(get(ref(groom1(), "confirmations")));
  });
});

/* ──────────────────────── /adminSettings ────────────────────── */

describe("/adminSettings", () => {
  it("any authenticated user can read", async () => {
    await assertSucceeds(get(ref(groom1(), "adminSettings")));
    await assertSucceeds(get(ref(driver(), "adminSettings")));
  });

  it("anonymous CANNOT read", async () => {
    await assertFails(get(ref(anon(), "adminSettings")));
  });

  it("only admin can write", async () => {
    await assertSucceeds(update(ref(admin(),  "adminSettings"), { messageBody: "Hi" }));
    await assertFails   (update(ref(groom1(), "adminSettings"), { messageBody: "Hi" }));
  });

  it("formLink must use https://", async () => {
    await assertFails(update(ref(admin(), "adminSettings"), { formLink: "http://insecure.example" }));
  });
});

/* ─────────────────── /driverAssignments + /audit ────────────── */

describe("/driverAssignments and /audit", () => {
  it("a driver can read their own assignment map", async () => {
    await assertSucceeds(get(ref(driver(), `driverAssignments/${UID_DRIVER}`)));
  });

  it("a driver CANNOT write to /driverAssignments (Function-only)", async () => {
    await assertFails(
      set(ref(driver(), `driverAssignments/${UID_DRIVER}/${UID_GROOM2}`), true),
    );
  });

  it("a non-admin cannot read /audit", async () => {
    await assertFails(get(ref(groom1(), "audit")));
  });

  it("admin can read /audit", async () => {
    await assertSucceeds(get(ref(admin(), "audit")));
  });
});

/* ────────────────────────── smoke check ─────────────────────── */

describe("end-to-end smoke", () => {
  it("a groom adding then re-reading a guest sees their own write", async () => {
    const r = push(ref(groom1(), `guestsByGroom/${UID_GROOM1}`));
    await set(r, {
      name: "Round Trip", phone: "0507777777", status: "pending", inviteType: "vip",
    });
    const snap = await get(ref(groom1(), `guestsByGroom/${UID_GROOM1}/${r.key}`));
    expect(snap.exists()).toBe(true);
    expect(snap.val().name).toBe("Round Trip");
  });
});
