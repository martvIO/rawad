// In-memory UserStore adapter for unit tests — the second adapter at the user
// data-access seam (the first is the Firebase-backed singleton in
// functions/src/api/stores/userStore.ts). Models the RTDB buckets (/users,
// /usernameIndex, /phoneIndex, /groomProfiles, plus any other top-level path a
// multi-path update touches) as a nested object tree, and the Firebase Auth
// records as a map. Honours the same interface so handler tests exercise real
// route behaviour with no emulator.
//
// `inMemoryUserStore(seed)` returns { store, rtdb, authUsers, revoked }: pass
// `store` wherever a UserStore is expected, and read the rest to assert
// post-state after writes.

import type {
  AuthUserRecord,
  UserRecord,
  UserStore,
} from "../../../functions/src/api/stores/userStore";

type Obj = Record<string, any>;

/** Read a "a/b/c" path out of the tree (undefined when any segment is absent). */
function getAt(tree: Obj, path: string): any {
  let node: any = tree;
  for (const k of path.split("/")) {
    if (node === null || node === undefined || typeof node !== "object") {
      return undefined;
    }
    node = node[k];
  }
  return node;
}

/** Set/delete a "a/b/c" path in the tree (a null value deletes the leaf). */
function setAt(tree: Obj, path: string, value: unknown): void {
  const parts = path.split("/");
  const last = parts.pop()!;
  let node: any = tree;
  for (const k of parts) {
    if (typeof node[k] !== "object" || node[k] === null) node[k] = {};
    node = node[k];
  }
  if (value === null) delete node[last];
  else node[last] = value;
}

export interface UserStoreSeed {
  users?: Record<string, Obj>;
  usernameIndex?: Record<string, string>;
  phoneIndex?: Record<string, string>;
  groomProfiles?: Record<string, Obj>;
  authUsers?: Record<string, { customClaims?: Record<string, unknown> } & Obj>;
  [bucket: string]: unknown;
}

export function inMemoryUserStore(seed: UserStoreSeed = {}): {
  store: UserStore;
  rtdb: Record<string, Obj>;
  authUsers: Record<string, Obj>;
  revoked: string[];
} {
  const rtdb: Record<string, Obj> = {};
  for (const [bucket, val] of Object.entries(seed)) {
    if (bucket === "authUsers") continue;
    rtdb[bucket] = structuredClone(val) as Obj;
  }
  rtdb.users ??= {};
  rtdb.usernameIndex ??= {};
  rtdb.phoneIndex ??= {};
  rtdb.groomProfiles ??= {};

  const authUsers: Record<string, Obj> = structuredClone(seed.authUsers ?? {});
  const revoked: string[] = [];
  let counter = 0;

  const rows = (m: Obj): UserRecord[] =>
    Object.entries(m).map(([uid, data]) => ({
      uid,
      id: uid,
      ...(data as Obj),
    }));

  const store: UserStore = {
    async listUsers() {
      return rows(rtdb.users);
    },
    async listGroomProfiles() {
      return rows(rtdb.groomProfiles);
    },
    async readUser(uid) {
      const v = rtdb.users[uid];
      return v === undefined ? null : { ...v };
    },
    async readUsernameOwner(username) {
      return (rtdb.usernameIndex[username] as string) ?? null;
    },
    async readPhoneOwner(phoneIndexKey) {
      return (rtdb.phoneIndex[phoneIndexKey] as string) ?? null;
    },
    async readGeneratedPassword(uid) {
      const v = (rtdb.generatedPasswords as Obj | undefined)?.[uid];
      return v === undefined ? null : { ...v };
    },

    async applyUpdates(updates) {
      for (const [path, value] of Object.entries(updates)) setAt(rtdb, path, value);
    },
    async patchUserFields(uid, fields) {
      for (const [k, v] of Object.entries(fields)) setAt(rtdb, `users/${uid}/${k}`, v);
    },
    async setUserRole(uid, role) {
      setAt(rtdb, `users/${uid}/role`, role);
    },
    async setGroomProfile(uid, data) {
      rtdb.groomProfiles[uid] = { ...data };
    },
    async removeGroomProfile(uid) {
      delete rtdb.groomProfiles[uid];
    },

    async authCreateUser(payload) {
      const uid = `mem_${++counter}`;
      authUsers[uid] = { uid, ...payload };
      return { uid };
    },
    async authSetClaims(uid, claims) {
      authUsers[uid] = { ...(authUsers[uid] ?? { uid }), customClaims: claims };
    },
    async authUpdateUser(uid, patch) {
      authUsers[uid] = { ...(authUsers[uid] ?? { uid }), ...patch };
    },
    async authDeleteUser(uid) {
      if (!authUsers[uid]) throw new Error("auth/user-not-found");
      delete authUsers[uid];
    },
    async authGetUser(uid): Promise<AuthUserRecord> {
      const u = authUsers[uid];
      if (!u) throw new Error("auth/user-not-found");
      return { uid, customClaims: u.customClaims };
    },
    async authRevokeTokens(uid) {
      revoked.push(uid);
    },
  };

  // expose getAt for tests that want to assert deep paths
  void getAt;

  return { store, rtdb, authUsers, revoked };
}
