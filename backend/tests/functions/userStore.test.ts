// @vitest-environment node
//
// Pure-logic tests for the user domain module (domain/users/userStore.ts).
// No emulator: the RTDB / Auth / audit dependencies are in-memory fakes injected
// through the narrow ports. This is the coverage the pre-extraction users.ts
// handlers could never have — its create/update/delete invariants were only
// reachable through the Firebase emulator.
import { describe, it, expect } from "vitest";
import { makeUserStore } from "../../functions/src/domain/users/userStore";

// ─── In-memory fakes ────────────────────────────────────────────────────────

function getAt(tree: any, path: string) {
  let node = tree;
  for (const k of path.split("/")) {
    if (node === null || node === undefined || typeof node !== "object") return null;
    node = node[k];
  }
  return node === undefined ? null : node;
}

function setAt(tree: any, path: string, value: unknown) {
  const parts = path.split("/");
  const last = parts.pop()!;
  let node = tree;
  for (const k of parts) {
    if (typeof node[k] !== "object" || node[k] === null) node[k] = {};
    node = node[k];
  }
  if (value === null) delete node[last];
  else node[last] = value;
}

function deleteAt(tree: any, path: string) {
  const parts = path.split("/");
  const last = parts.pop()!;
  let node = tree;
  for (const k of parts) {
    if (typeof node[k] !== "object" || node[k] === null) return;
    node = node[k];
  }
  delete node[last];
}

function fakeDb(seed: any = {}, log: string[] = []) {
  const tree = structuredClone(seed);
  return {
    tree,
    async get(path: string) {
      return getAt(tree, path);
    },
    async update(updates: Record<string, unknown>) {
      log.push("db.update");
      for (const [p, v] of Object.entries(updates)) setAt(tree, p, v);
    },
    async set(path: string, value: unknown) {
      log.push("db.set");
      setAt(tree, path, value);
    },
    async remove(path: string) {
      log.push("db.remove");
      deleteAt(tree, path);
    },
  };
}

function fakeAuth(seed: any = {}, log: string[] = []) {
  const usersById: any = structuredClone(seed);
  let counter = 0;
  return {
    usersById,
    async createUser(payload: any) {
      const uid = `uid-${++counter}`;
      usersById[uid] = { uid, ...payload };
      log.push("auth.createUser");
      return { uid };
    },
    async updateUser(uid: string, patch: any) {
      usersById[uid] = { ...(usersById[uid] ?? {}), ...patch };
      log.push("auth.updateUser");
    },
    async deleteUser(uid: string) {
      log.push("auth.deleteUser");
      if (!usersById[uid]) throw new Error("auth: user not found");
      delete usersById[uid];
    },
    async getUser(uid: string) {
      if (!usersById[uid]) throw new Error("auth: no such user");
      log.push("auth.getUser");
      return { uid, customClaims: usersById[uid].customClaims };
    },
    async setCustomUserClaims(uid: string, claims: any) {
      usersById[uid] = { ...(usersById[uid] ?? {}), customClaims: claims };
      log.push("auth.setCustomUserClaims");
    },
    async revokeRefreshTokens(uid: string) {
      log.push(`auth.revokeRefreshTokens:${uid}`);
    },
  };
}

function fakeAudit(log: string[] = []) {
  const entries: Array<{ uid: string; action: string; details: any }> = [];
  const fn = async (uid: string, action: string, details?: any) => {
    entries.push({ uid, action, details });
    log.push(`audit:${action}`);
  };
  (fn as any).entries = entries;
  return fn as typeof fn & { entries: typeof entries };
}

function build(opts: { dbSeed?: any; authSeed?: any } = {}) {
  const log: string[] = [];
  const db = fakeDb(opts.dbSeed ?? {}, log);
  const auth = fakeAuth(opts.authSeed ?? {}, log);
  const audit = fakeAudit(log);
  const store = makeUserStore({ db, auth, audit, now: () => 1000 });
  return { store, db, auth, audit, log };
}

const VALID = {
  username: "Ali",
  password: "Abcd1234",
  role: "groom" as const,
  phoneE164: "+972501234567",
};

// ─── createUser ─────────────────────────────────────────────────────────────

describe("createUser", () => {
  it("writes profile + both indices + claims atomically and audits", async () => {
    const { store, db, auth, audit } = build();
    const { uid } = await store.createUser({ ...VALID }, "admin-uid");

    expect(uid).toBe("uid-1");
    // Username is lower-cased; profile written under the new uid.
    expect(db.tree.users[uid].username).toBe("ali");
    expect(db.tree.users[uid].role).toBe("groom");
    expect(db.tree.users[uid].phoneE164).toBe("+972501234567");
    expect(db.tree.users[uid].createdAt).toBe(1000); // injected clock
    expect(db.tree.users[uid].createdBy).toBe("admin-uid");
    // Indices point back to the uid.
    expect(db.tree.usernameIndex.ali).toBe(uid);
    expect(db.tree.phoneIndex["972501234567"]).toBe(uid);
    // Claims minted on the Auth record.
    expect(auth.usersById[uid].customClaims).toEqual({ role: "groom", username: "ali" });
    // Audit entry shape preserved exactly.
    expect(audit.entries).toEqual([
      { uid: "admin-uid", action: "createPortalUser", details: { uid, role: "groom" } },
    ]);
  });

  it("defaults feature flags (attendance/photographer ON, boarding-pass OFF)", async () => {
    const { store, db } = build();
    const { uid } = await store.createUser({ ...VALID }, "admin");
    expect(db.tree.users[uid].canSeeAttendance).toBe(true);
    expect(db.tree.users[uid].canUsePhotographer).toBe(true);
    expect(db.tree.users[uid].canUseBoardingPass).toBe(false);
  });

  it("honours explicit feature-flag overrides", async () => {
    const { store, db } = build();
    const { uid } = await store.createUser(
      { ...VALID, canSeeAttendance: false, canUsePhotographer: false, canUseBoardingPass: true },
      "admin"
    );
    expect(db.tree.users[uid].canSeeAttendance).toBe(false);
    expect(db.tree.users[uid].canUsePhotographer).toBe(false);
    expect(db.tree.users[uid].canUseBoardingPass).toBe(true);
  });

  it("omits phone index + profile phone when no phone supplied", async () => {
    const { store, db } = build();
    const { uid } = await store.createUser(
      { username: "noPhone", password: "Abcd1234", role: "driver" },
      "admin"
    );
    expect(db.tree.users[uid].phoneE164).toBeUndefined();
    expect(db.tree.phoneIndex).toBeUndefined();
  });

  it("slices Auth displayName to 120 but stores the full name in the profile (preserved quirk)", async () => {
    const { store, db, auth } = build();
    const long = "x".repeat(130);
    const { uid } = await store.createUser({ ...VALID, displayName: long }, "admin");
    expect((auth.usersById[uid] as any).displayName).toHaveLength(120);
    expect(db.tree.users[uid].displayName).toHaveLength(130);
  });

  it("rejects an invalid username before touching anything", async () => {
    const { store, auth } = build();
    await expect(store.createUser({ ...VALID, username: "a" }, "admin")).rejects.toMatchObject({
      code: "invalid_username",
    });
    expect(Object.keys(auth.usersById)).toHaveLength(0);
  });

  it("rejects a weak password", async () => {
    const { store } = build();
    await expect(store.createUser({ ...VALID, password: "weak" }, "admin")).rejects.toMatchObject({
      code: "weak_password",
    });
  });

  it("rejects an invalid role", async () => {
    const { store } = build();
    await expect(
      store.createUser({ ...VALID, role: "superuser" as any }, "admin")
    ).rejects.toMatchObject({ code: "invalid_role" });
  });

  it("rejects an invalid phone", async () => {
    const { store } = build();
    await expect(
      store.createUser({ ...VALID, phoneE164: "0501234567" }, "admin")
    ).rejects.toMatchObject({ code: "invalid_phone" });
  });

  it("rejects a taken username (409) without creating an Auth user", async () => {
    const { store, auth } = build({ dbSeed: { usernameIndex: { ali: "other-uid" } } });
    await expect(store.createUser({ ...VALID }, "admin")).rejects.toMatchObject({
      code: "username_taken",
    });
    expect(Object.keys(auth.usersById)).toHaveLength(0);
  });

  it("rejects a taken phone (409)", async () => {
    const { store } = build({ dbSeed: { phoneIndex: { "972501234567": "other-uid" } } });
    await expect(store.createUser({ ...VALID }, "admin")).rejects.toMatchObject({
      code: "phone_taken",
    });
  });
});

// ─── updateUser ─────────────────────────────────────────────────────────────

const SEED_USER = {
  users: { u1: { username: "ali", role: "groom", phoneE164: "+972501111111" } },
  usernameIndex: { ali: "u1" },
  phoneIndex: { "972501111111": "u1" },
};

describe("updateUser", () => {
  it("throws not_found for a missing user", async () => {
    const { store } = build();
    await expect(store.updateUser("ghost", { role: "admin" }, "admin")).rejects.toMatchObject({
      code: "not_found",
    });
  });

  it("renames the username: swaps index, updates Auth email + claims, audits changes", async () => {
    const { store, db, auth, audit } = build({
      dbSeed: SEED_USER,
      authSeed: { u1: { customClaims: { role: "groom", username: "ali" } } },
    });
    await store.updateUser("u1", { username: "Ahmad" }, "admin");

    expect(db.tree.users.u1.username).toBe("ahmad");
    expect(db.tree.usernameIndex.ali).toBeUndefined(); // old index cleared
    expect(db.tree.usernameIndex.ahmad).toBe("u1"); // new index set
    expect(auth.usersById.u1.email).toBe("ahmad@dawa.local");
    expect(auth.usersById.u1.customClaims).toEqual({ role: "groom", username: "ahmad" });
    expect(audit.entries[0]).toEqual({
      uid: "admin",
      action: "updatePortalUser",
      details: { uid: "u1", changes: ["username"] },
    });
  });

  it("orders side effects Auth → claims → RTDB → audit", async () => {
    const { store, log } = build({
      dbSeed: SEED_USER,
      authSeed: { u1: { customClaims: { role: "groom", username: "ali" } } },
    });
    await store.updateUser("u1", { username: "Ahmad", role: "admin" }, "admin");
    expect(log).toEqual([
      "auth.updateUser", // email change
      "auth.getUser", // read existing claims
      "auth.setCustomUserClaims", // re-mint
      "db.update", // RTDB index + field swap
      "audit:updatePortalUser",
    ]);
  });

  it("strips a legacy `admin: true` claim when re-minting", async () => {
    const { store, auth } = build({
      dbSeed: SEED_USER,
      authSeed: { u1: { customClaims: { admin: true, role: "groom", username: "ali" } } },
    });
    await store.updateUser("u1", { role: "admin" }, "admin");
    expect(auth.usersById.u1.customClaims).toEqual({ role: "admin", username: "ali" });
    expect(auth.usersById.u1.customClaims.admin).toBeUndefined();
  });

  it("swaps the phone index and sets the Auth phoneNumber", async () => {
    const { store, db, auth } = build({
      dbSeed: SEED_USER,
      authSeed: { u1: {} },
    });
    await store.updateUser("u1", { phoneE164: "+972502222222" }, "admin");
    expect(db.tree.phoneIndex["972501111111"]).toBeUndefined();
    expect(db.tree.phoneIndex["972502222222"]).toBe("u1");
    expect(db.tree.users.u1.phoneE164).toBe("+972502222222");
    expect(auth.usersById.u1.phoneNumber).toBe("+972502222222");
  });

  it("blocks an admin demoting themselves", async () => {
    const { store } = build({ dbSeed: { users: { me: { username: "me", role: "admin" } } } });
    await expect(store.updateUser("me", { role: "groom" }, "me")).rejects.toMatchObject({
      code: "cannot_self_demote",
    });
  });

  it("rejects a username already taken by someone else", async () => {
    const seed = structuredClone(SEED_USER) as any;
    seed.usernameIndex.taken = "other";
    const { store } = build({ dbSeed: seed, authSeed: { u1: {} } });
    await expect(store.updateUser("u1", { username: "taken" }, "admin")).rejects.toMatchObject({
      code: "username_taken",
    });
  });

  it("no-ops cleanly (only audits) when nothing actually changes", async () => {
    const { store, log } = build({ dbSeed: SEED_USER, authSeed: { u1: {} } });
    await store.updateUser("u1", {}, "admin");
    expect(log).toEqual(["audit:updatePortalUser"]); // no auth/db writes
  });
});

// ─── deleteUser ─────────────────────────────────────────────────────────────

describe("deleteUser", () => {
  it("blocks self-delete", async () => {
    const { store } = build();
    await expect(store.deleteUser("me", "me")).rejects.toMatchObject({
      code: "cannot_self_delete",
    });
  });

  it("throws not_found for a missing user", async () => {
    const { store } = build();
    await expect(store.deleteUser("ghost", "admin")).rejects.toMatchObject({ code: "not_found" });
  });

  it("tears down profile, indices, assignments, guests and live-locations", async () => {
    const { store, db, audit } = build({
      dbSeed: {
        ...structuredClone(SEED_USER),
        driverAssignments: { u1: { x: true } },
        guestsByGroom: { u1: { g: {} } },
        liveLocationsByGroom: { u1: { l: {} } },
      },
      authSeed: { u1: { uid: "u1" } },
    });
    await store.deleteUser("u1", "admin");
    expect(db.tree.users.u1).toBeUndefined();
    expect(db.tree.usernameIndex.ali).toBeUndefined();
    expect(db.tree.phoneIndex["972501111111"]).toBeUndefined();
    expect(db.tree.driverAssignments.u1).toBeUndefined();
    expect(db.tree.guestsByGroom.u1).toBeUndefined();
    expect(db.tree.liveLocationsByGroom.u1).toBeUndefined();
    expect(audit.entries[0]).toEqual({ uid: "admin", action: "deletePortalUser", details: { uid: "u1" } });
  });

  it("still clears RTDB when the Auth record is already gone (best-effort delete)", async () => {
    const { store, db } = build({ dbSeed: structuredClone(SEED_USER), authSeed: {} });
    await store.deleteUser("u1", "admin"); // auth.deleteUser throws, swallowed
    expect(db.tree.users.u1).toBeUndefined();
    expect(db.tree.usernameIndex.ali).toBeUndefined();
  });
});

// ─── setRole (admin-claim) ──────────────────────────────────────────────────

describe("setRole", () => {
  it("promotes to admin: re-mints claims (stripping legacy admin) and sets RTDB role", async () => {
    const { store, db, auth, audit } = build({
      dbSeed: { users: { u1: { role: "groom" } } },
      authSeed: { u1: { customClaims: { admin: true, role: "groom", username: "ali" } } },
    });
    await store.setRole("u1", true, "admin");
    expect(auth.usersById.u1.customClaims).toEqual({ role: "admin", username: "ali" });
    expect(db.tree.users.u1.role).toBe("admin");
    expect(audit.entries[0]).toEqual({
      uid: "admin",
      action: "setAdminClaim",
      details: { uid: "u1", isAdmin: true },
    });
  });

  it("blocks an admin demoting themselves", async () => {
    const { store } = build({ authSeed: { me: { customClaims: {} } } });
    await expect(store.setRole("me", false, "me")).rejects.toMatchObject({
      code: "cannot_self_demote",
    });
  });
});

// ─── setPassword ────────────────────────────────────────────────────────────

describe("setPassword", () => {
  it("updates the password and revokes refresh tokens", async () => {
    const { store, auth, audit, log } = build({ authSeed: { u1: { uid: "u1" } } });
    await store.setPassword("u1", "NewPass1", "admin");
    expect(auth.usersById.u1.password).toBe("NewPass1");
    expect(log).toContain("auth.revokeRefreshTokens:u1");
    expect(audit.entries[0]).toEqual({ uid: "admin", action: "adminSetPassword", details: { uid: "u1" } });
  });

  it("rejects a weak password before anything else", async () => {
    const { store } = build({ authSeed: { u1: {} } });
    await expect(store.setPassword("u1", "weak", "admin")).rejects.toMatchObject({
      code: "weak_password",
    });
  });

  it("blocks setting your own password", async () => {
    const { store } = build({ authSeed: { me: {} } });
    await expect(store.setPassword("me", "NewPass1", "me")).rejects.toMatchObject({
      code: "cannot_self_set",
    });
  });

  it("throws not_found when the Auth user is missing", async () => {
    const { store } = build({ authSeed: {} });
    await expect(store.setPassword("ghost", "NewPass1", "admin")).rejects.toMatchObject({
      code: "not_found",
    });
  });
});

// ─── patchProfileFields ─────────────────────────────────────────────────────

describe("patchProfileFields", () => {
  it("writes only the allowlisted child fields and audits the field names", async () => {
    const { store, db, audit } = build({ dbSeed: { users: { u1: { username: "ali", displayName: "old" } } } });
    await store.patchProfileFields("u1", { displayName: "new", canSeeAttendance: false }, "admin");
    expect(db.tree.users.u1.displayName).toBe("new");
    expect(db.tree.users.u1.canSeeAttendance).toBe(false);
    expect(db.tree.users.u1.username).toBe("ali"); // untouched
    expect(audit.entries[0]).toEqual({
      uid: "admin",
      action: "patchPortalUser",
      details: { uid: "u1", fields: ["displayName", "canSeeAttendance"] },
    });
  });

  it("clears a field when the safe value is null", async () => {
    const { store, db } = build({ dbSeed: { users: { u1: { displayName: "old" } } } });
    await store.patchProfileFields("u1", { displayName: null }, "admin");
    expect(db.tree.users.u1.displayName).toBeUndefined();
  });
});

// ─── groom profiles + reads ─────────────────────────────────────────────────

describe("groom profiles", () => {
  it("upserts a profile and slices the display name", async () => {
    const { store, db } = build();
    await store.upsertGroomProfile("u1", "ali", "x".repeat(200));
    expect(db.tree.groomProfiles.u1.username).toBe("ali");
    expect(db.tree.groomProfiles.u1.displayName).toHaveLength(120);
  });

  it("omits displayName when blank", async () => {
    const { store, db } = build();
    await store.upsertGroomProfile("u1", "ali", "");
    expect(db.tree.groomProfiles.u1).toEqual({ username: "ali" });
  });

  it("rejects a missing username", async () => {
    const { store } = build();
    await expect(store.upsertGroomProfile("u1", "", undefined)).rejects.toMatchObject({
      code: "missing_username",
    });
  });

  it("removes a profile", async () => {
    const { store, db } = build({ dbSeed: { groomProfiles: { u1: { username: "ali" } } } });
    await store.removeGroomProfile("u1");
    expect(db.tree.groomProfiles.u1).toBeUndefined();
  });
});

describe("reads", () => {
  it("listUsers maps the map into an array with uid + id", async () => {
    const { store } = build({ dbSeed: { users: { u1: { username: "ali" }, u2: { username: "sara" } } } });
    const list = await store.listUsers();
    expect(list).toEqual([
      { uid: "u1", id: "u1", username: "ali" },
      { uid: "u2", id: "u2", username: "sara" },
    ]);
  });

  it("listUsers returns [] when there are no users", async () => {
    const { store } = build();
    expect(await store.listUsers()).toEqual([]);
  });

  it("getUser returns the profile or null", async () => {
    const { store } = build({ dbSeed: { users: { u1: { username: "ali" } } } });
    expect(await store.getUser("u1")).toEqual({ username: "ali" });
    expect(await store.getUser("ghost")).toBeNull();
  });
});
