// Security-rules tests for Cloud Storage (proof photos, digital media,
// photographer files). Runs against the *storage emulator* (127.0.0.1:9199)
// with `storage.rules` loaded. Each test starts clean.
//
// Run via the root `npm test` (database+firestore+storage emulators).
//
// The central security gate: a proof photo may be WRITTEN only by the driver
// whose custom claim `assignedGrooms[groomUid] == true`, and READ only by the
// owning groom or an admin. digitalMedia is public-read; everything else denies.
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterAll, beforeAll, beforeEach, describe, test } from "vitest";
import {
  initializeTestEnvironment, assertSucceeds, assertFails,
} from "@firebase/rules-unit-testing";
import { ref, uploadBytes, getBytes } from "firebase/storage";

const ADMIN  = "uid-admin";
const GROOM  = "uid-groom-1";
const GROOM2 = "uid-groom-2";
const DRIVER = "uid-driver-1";

const JPEG = { contentType: "image/jpeg" };
const bytes = () => new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3, 4]); // tiny "jpeg"

let env;

beforeAll(async () => {
  const rules = readFileSync(resolve(process.cwd(), "storage.rules"), "utf8");
  env = await initializeTestEnvironment({
    projectId: "demo-dawa-test",
    storage: { rules, host: "127.0.0.1", port: 9199 },
  });
});
afterAll(async () => { if (env) await env.cleanup(); });
beforeEach(async () => { await env.clearStorage(); });

async function seedObject(path, data = bytes(), meta = JPEG) {
  await env.withSecurityRulesDisabled(async (ctx) => {
    await uploadBytes(ref(ctx.storage(), path), data, meta);
  });
}

const asAnon   = () => env.unauthenticatedContext().storage();
const asAdmin  = () => env.authenticatedContext(ADMIN, { role: "admin" }).storage();
const asGroom  = (uid = GROOM) => env.authenticatedContext(uid).storage();
// Driver carries the assignedGrooms claim that the proof-write rule checks.
const asAssignedDriver   = () => env.authenticatedContext(DRIVER, { assignedGrooms: { [GROOM]: true } }).storage();
const asUnassignedDriver = () => env.authenticatedContext(DRIVER, { assignedGrooms: {} }).storage();

const proof = `proofs/${GROOM}/guest1/p.jpg`;

// ── proof writes: the assignedGrooms gate ─────────────────────────────────────
describe("proofs/* write gate", () => {
  test("assigned driver CAN upload a jpeg proof", async () => {
    await assertSucceeds(uploadBytes(ref(asAssignedDriver(), proof), bytes(), JPEG));
  });
  test("UNassigned driver CANNOT upload a proof", async () => {
    await assertFails(uploadBytes(ref(asUnassignedDriver(), proof), bytes(), JPEG));
  });
  test("a groom cannot upload a proof (only the assigned driver can)", async () => {
    await assertFails(uploadBytes(ref(asGroom(), proof), bytes(), JPEG));
  });
  test("non-image content type is rejected even for the assigned driver", async () => {
    await assertFails(uploadBytes(ref(asAssignedDriver(), proof), bytes(), { contentType: "text/plain" }));
  });
});

// ── proof reads: owner groom or admin only ────────────────────────────────────
describe("proofs/* read gate", () => {
  test("owning groom can read the proof", async () => {
    await seedObject(proof);
    await assertSucceeds(getBytes(ref(asGroom(), proof)));
  });
  test("admin can read the proof", async () => {
    await seedObject(proof);
    await assertSucceeds(getBytes(ref(asAdmin(), proof)));
  });
  test("a different groom cannot read the proof", async () => {
    await seedObject(proof);
    await assertFails(getBytes(ref(asGroom(GROOM2), proof)));
  });
  test("anonymous cannot read the proof", async () => {
    await seedObject(proof);
    await assertFails(getBytes(ref(asAnon(), proof)));
  });
});

// ── digitalMedia: public read, owner/admin write ──────────────────────────────
describe("digitalMedia/* (public read)", () => {
  const media = `digitalMedia/${GROOM}/hero.jpg`;
  test("anyone can read digital media (guests open invite links)", async () => {
    await seedObject(media);
    await assertSucceeds(getBytes(ref(asAnon(), media)));
  });
  test("groom can write their own media", async () => {
    await assertSucceeds(uploadBytes(ref(asGroom(), media), bytes(), JPEG));
  });
  test("a different groom cannot write the media", async () => {
    await assertFails(uploadBytes(ref(asGroom(GROOM2), media), bytes(), JPEG));
  });
});

// ── default deny ──────────────────────────────────────────────────────────────
describe("default deny", () => {
  test("writing to an unmatched path is denied", async () => {
    await assertFails(uploadBytes(ref(asAdmin(), "random/x.bin"), bytes(), JPEG));
  });
  test("reading an unmatched path is denied", async () => {
    await seedObject("random/x.bin");
    await assertFails(getBytes(ref(asAnon(), "random/x.bin")));
  });
});
