// @vitest-environment node
//
// Contract test for the in-memory UserStore adapter — the test-side adapter at
// the user data-access seam. Proves the double honours the UserStore interface
// (row stamping, absent → []/null, multi-path applyUpdates incl. deep paths +
// null deletes, field patch, role set, groom-profile set/remove, and the Auth
// surface) so the handler tests built on it (usersHandlers.test.ts) are
// trustworthy.
import { describe, it, expect } from "vitest";
import { inMemoryUserStore } from "./support/inMemoryUserStore";

describe("inMemoryUserStore (UserStore contract)", () => {
  it("listUsers() / listGroomProfiles() stamp uid + id and return [] when empty", async () => {
    const { store } = inMemoryUserStore();
    expect(await store.listUsers()).toEqual([]);
    expect(await store.listGroomProfiles()).toEqual([]);

    const seeded = inMemoryUserStore({
      users: { u1: { username: "ali" } },
      groomProfiles: { u1: { username: "ali" } },
    });
    expect(await seeded.store.listUsers()).toEqual([{ uid: "u1", id: "u1", username: "ali" }]);
    expect(await seeded.store.listGroomProfiles()).toEqual([{ uid: "u1", id: "u1", username: "ali" }]);
  });

  it("readUser() returns a copy or null; readUsernameOwner/readPhoneOwner resolve indices", async () => {
    const { store } = inMemoryUserStore({
      users: { u1: { username: "ali" } },
      usernameIndex: { ali: "u1" },
      phoneIndex: { "972500": "u1" },
    });
    expect(await store.readUser("u1")).toEqual({ username: "ali" });
    expect(await store.readUser("ghost")).toBeNull();
    expect(await store.readUsernameOwner("ali")).toBe("u1");
    expect(await store.readUsernameOwner("free")).toBeNull();
    expect(await store.readPhoneOwner("972500")).toBe("u1");
    expect(await store.readPhoneOwner("000")).toBeNull();
  });

  it("applyUpdates() handles whole-node set, deep-path set, and null delete atomically", async () => {
    const { store, rtdb } = inMemoryUserStore({
      users: { u1: { username: "ali", role: "groom" } },
      usernameIndex: { ali: "u1" },
    });
    await store.applyUpdates({
      "users/u2": { username: "sara", role: "driver" }, // whole-node set
      "users/u1/role": "admin", // deep-path set
      "usernameIndex/ali": null, // delete
      "usernameIndex/sara": "u2",
    });
    expect(rtdb.users.u2).toEqual({ username: "sara", role: "driver" });
    expect(rtdb.users.u1.role).toBe("admin");
    expect(rtdb.usernameIndex.ali).toBeUndefined();
    expect(rtdb.usernameIndex.sara).toBe("u2");
  });

  it("patchUserFields() shallow-merges into /users/{uid}", async () => {
    const { store, rtdb } = inMemoryUserStore({ users: { u1: { username: "ali", displayName: "old" } } });
    await store.patchUserFields("u1", { displayName: "new" });
    expect(rtdb.users.u1).toEqual({ username: "ali", displayName: "new" });
  });

  it("setUserRole() / setGroomProfile() / removeGroomProfile() round-trip", async () => {
    const { store, rtdb } = inMemoryUserStore({ users: { u1: { role: "groom" } } });
    await store.setUserRole("u1", "admin");
    expect(rtdb.users.u1.role).toBe("admin");
    await store.setGroomProfile("u1", { username: "ali" });
    expect(rtdb.groomProfiles.u1).toEqual({ username: "ali" });
    await store.removeGroomProfile("u1");
    expect(rtdb.groomProfiles.u1).toBeUndefined();
  });

  it("auth surface: create stamps an id, get/set/update round-trip, delete + revoke", async () => {
    const { store, authUsers, revoked } = inMemoryUserStore();
    const { uid } = await store.authCreateUser({ email: "a@dawa.local", password: "Abcd1234" });
    expect(uid).toBeTruthy();
    await store.authSetClaims(uid, { role: "groom", username: "ali" });
    expect((await store.authGetUser(uid)).customClaims).toEqual({ role: "groom", username: "ali" });
    await store.authUpdateUser(uid, { password: "NewPass1" });
    expect(authUsers[uid].password).toBe("NewPass1");
    await store.authRevokeTokens(uid);
    expect(revoked).toEqual([uid]);
    await store.authDeleteUser(uid);
    await expect(store.authGetUser(uid)).rejects.toThrow();
  });

  it("authGetUser() rejects for a missing user (mirrors the Admin SDK throw)", async () => {
    const { store } = inMemoryUserStore();
    await expect(store.authGetUser("ghost")).rejects.toThrow();
  });
});
