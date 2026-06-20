// Security-rules tests for Firestore (digital invitations, designs, biometric
// face data). Runs against the *firestore emulator* (127.0.0.1:8080) with
// `firestore.rules` loaded into an isolated project. Each test starts clean.
//
// Run via the root `npm test` (wraps these in firebase emulators:exec with the
// database+firestore+storage emulators).
//
// Security properties under test:
//   • parent invitation doc is publicly readable (guests open links unauth)
//   • guests/designs/designRequests are owner-or-admin only
//   • biometric subtrees (photoFaces/guestFaces/peopleClusters/...) are NEVER
//     client-readable — not even by the groom or admin
//   • photographerFiles flip to public-read only when photographerPublished
//   • admin collectionGroup read of designs; non-admin denied
//   • default-deny catch-all
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterAll, beforeAll, beforeEach, describe, test } from "vitest";
import {
  initializeTestEnvironment, assertSucceeds, assertFails,
} from "@firebase/rules-unit-testing";
import {
  doc, getDoc, setDoc, collection, getDocs, collectionGroup,
} from "firebase/firestore";

const ADMIN  = "uid-admin";
const GROOM  = "uid-groom-1";
const GROOM2 = "uid-groom-2";

let env;

beforeAll(async () => {
  const rules = readFileSync(resolve(process.cwd(), "firestore.rules"), "utf8");
  env = await initializeTestEnvironment({
    projectId: "demo-dawa-test",
    firestore: { rules, host: "127.0.0.1", port: 8080 },
  });
});
afterAll(async () => { if (env) await env.cleanup(); });
beforeEach(async () => { await env.clearFirestore(); });

async function seed(fn) {
  await env.withSecurityRulesDisabled(async (ctx) => { await fn(ctx.firestore()); });
}

const asAnon   = () => env.unauthenticatedContext().firestore();
const asAdmin  = () => env.authenticatedContext(ADMIN, { role: "admin" }).firestore();
const asGroom  = (uid = GROOM) => env.authenticatedContext(uid).firestore();

// ── parent invitation doc ─────────────────────────────────────────────────────
describe("digitalInvitations/{groomUid} (parent doc)", () => {
  test("anyone (even anon) can READ the parent doc — guests open links", async () => {
    await seed(async (db) => setDoc(doc(db, `digitalInvitations/${GROOM}`), { weddingDate: 1 }));
    await assertSucceeds(getDoc(doc(asAnon(), `digitalInvitations/${GROOM}`)));
  });
  test("groom can WRITE their own parent doc", async () => {
    await assertSucceeds(setDoc(doc(asGroom(), `digitalInvitations/${GROOM}`), { weddingDate: 1 }));
  });
  test("a different groom CANNOT write the parent doc", async () => {
    await assertFails(setDoc(doc(asGroom(GROOM2), `digitalInvitations/${GROOM}`), { weddingDate: 1 }));
  });
  test("admin can write any parent doc", async () => {
    await assertSucceeds(setDoc(doc(asAdmin(), `digitalInvitations/${GROOM}`), { weddingDate: 1 }));
  });
});

// ── guests / designs (owner-or-admin) ─────────────────────────────────────────
describe("guests + designs subcollections", () => {
  test("groom can read+write their own guests", async () => {
    await assertSucceeds(setDoc(doc(asGroom(), `digitalInvitations/${GROOM}/guests/g1`), { name: "A", status: "pending" }));
    await assertSucceeds(getDoc(doc(asGroom(), `digitalInvitations/${GROOM}/guests/g1`)));
  });
  test("a different groom cannot read another groom's guests", async () => {
    await seed(async (db) => setDoc(doc(db, `digitalInvitations/${GROOM}/guests/g1`), { name: "A" }));
    await assertFails(getDoc(doc(asGroom(GROOM2), `digitalInvitations/${GROOM}/guests/g1`)));
  });
  test("anon cannot read guests", async () => {
    await seed(async (db) => setDoc(doc(db, `digitalInvitations/${GROOM}/guests/g1`), { name: "A" }));
    await assertFails(getDoc(doc(asAnon(), `digitalInvitations/${GROOM}/guests/g1`)));
  });
  test("groom can write own designs; other groom cannot", async () => {
    await assertSucceeds(setDoc(doc(asGroom(), `digitalInvitations/${GROOM}/designs/d1`), { weddingDate: 1 }));
    await assertFails(setDoc(doc(asGroom(GROOM2), `digitalInvitations/${GROOM}/designs/d1`), { weddingDate: 1 }));
  });
});

// ── biometric subtrees — NEVER client-readable ────────────────────────────────
describe("biometric subtrees are server-only", () => {
  for (const sub of ["photoFaces", "guestFaces", "peopleClusters", "galleryConfig", "jobStatus"]) {
    test(`${sub}: groom CANNOT read`, async () => {
      await seed(async (db) => setDoc(doc(db, `digitalInvitations/${GROOM}/${sub}/x`), { v: 1 }));
      await assertFails(getDoc(doc(asGroom(), `digitalInvitations/${GROOM}/${sub}/x`)));
    });
    test(`${sub}: admin CANNOT read either`, async () => {
      await seed(async (db) => setDoc(doc(db, `digitalInvitations/${GROOM}/${sub}/x`), { v: 1 }));
      await assertFails(getDoc(doc(asAdmin(), `digitalInvitations/${GROOM}/${sub}/x`)));
    });
    test(`${sub}: groom CANNOT write`, async () => {
      await assertFails(setDoc(doc(asGroom(), `digitalInvitations/${GROOM}/${sub}/x`), { v: 1 }));
    });
  }
});

// ── photographerFiles publish gate ────────────────────────────────────────────
describe("photographerFiles public-read gate", () => {
  test("anon CANNOT read when not published", async () => {
    await seed(async (db) => {
      await setDoc(doc(db, `digitalInvitations/${GROOM}`), { photographerPublished: false });
      await setDoc(doc(db, `digitalInvitations/${GROOM}/photographerFiles/f1`), { url: "x" });
    });
    await assertFails(getDoc(doc(asAnon(), `digitalInvitations/${GROOM}/photographerFiles/f1`)));
  });
  test("anon CAN read once photographerPublished == true", async () => {
    await seed(async (db) => {
      await setDoc(doc(db, `digitalInvitations/${GROOM}`), { photographerPublished: true });
      await setDoc(doc(db, `digitalInvitations/${GROOM}/photographerFiles/f1`), { url: "x" });
    });
    await assertSucceeds(getDoc(doc(asAnon(), `digitalInvitations/${GROOM}/photographerFiles/f1`)));
  });
});

// ── collectionGroup(designs) admin-only read ──────────────────────────────────
describe("collectionGroup designs", () => {
  test("admin can collectionGroup-read designs across grooms", async () => {
    await seed(async (db) => setDoc(doc(db, `digitalInvitations/${GROOM}/designs/d1`), { weddingDate: 1 }));
    await assertSucceeds(getDocs(collectionGroup(asAdmin(), "designs")));
  });
  test("a groom cannot collectionGroup-read all designs", async () => {
    await seed(async (db) => setDoc(doc(db, `digitalInvitations/${GROOM}/designs/d1`), { weddingDate: 1 }));
    await assertFails(getDocs(collectionGroup(asGroom(), "designs")));
  });
});

// ── default deny ──────────────────────────────────────────────────────────────
describe("default deny", () => {
  test("an unrelated path is not readable", async () => {
    await seed(async (db) => setDoc(doc(db, "randomCollection/x"), { v: 1 }));
    await assertFails(getDoc(doc(asAdmin(), "randomCollection/x")));
  });
  test("an unrelated collection is not listable", async () => {
    await assertFails(getDocs(collection(asGroom(), "randomCollection")));
  });
});
