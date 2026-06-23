// Data-access seam for portal-user management (RTDB /users, /usernameIndex,
// /phoneIndex, /groomProfiles + the Firebase Auth records & custom claims).
//
// Handlers in routes/users.ts own authorization, validation, the index/claims
// invariant (which writes to perform, in what order) and error mapping; this
// module owns ONLY data access. It hides the Realtime Database AND the Firebase
// Auth Admin SDK behind a small interface of plain-object methods, so the user
// handlers become unit-testable through an in-memory adapter (see
// tests/functions/support/inMemoryUserStore.ts) with no emulator — the same kind
// of seam routes/guests.ts gets from api/stores/guestStore.ts.
//
// Mirrors the legacy access points (formerly inline in users.ts):
//   read index     getDatabase().ref(`usernameIndex|phoneIndex/${k}`).get()
//   read profile   getDatabase().ref(`users/${uid}`).get()
//   list           getDatabase().ref(`users|groomProfiles`).get()
//   multi-path     getDatabase().ref().update(updates)
//   field patch    getDatabase().ref(`users/${uid}`).update(fields)
//   set role       getDatabase().ref(`users/${uid}/role`).set(role)
//   groom profile  getDatabase().ref(`groomProfiles/${uid}`).set()/.remove()
//   auth           getAuth().createUser/updateUser/deleteUser/getUser/
//                  setCustomUserClaims/revokeRefreshTokens
//
// Error contract: the store NEVER catches or re-wraps. Absent paths yield
// []/null (mirroring an empty snapshot); a real RTDB/Auth failure propagates raw
// so each handler keeps its existing `catch → res.status(5xx).json({ error,
// detail: errorMessage(err) })` mapping unchanged. `getUser` propagates the
// Admin SDK's not-found throw, which the password/claim handlers map to 404.

import { getDatabase } from "firebase-admin/database";
import { getAuth } from "firebase-admin/auth";

// Reuse the SDK's own parameter types so the adapter stays in lock-step with
// firebase-admin without importing named request types.
type CreateReq = Parameters<ReturnType<typeof getAuth>["createUser"]>[0];
type UpdateReq = Parameters<ReturnType<typeof getAuth>["updateUser"]>[1];

/** A user/groom-profile row as it crosses the seam: plain object, `uid`+`id`. */
export interface UserRecord extends Record<string, unknown> {
  uid: string;
  id: string;
}

/** The subset of a Firebase Auth user record the handlers read. */
export interface AuthUserRecord {
  uid: string;
  customClaims?: Record<string, unknown>;
}

/**
 * Persistence interface for portal users. Narrow by design — each method maps
 * to a single RTDB or Auth operation and returns/accepts plain objects. Two
 * adapters satisfy it: the Firebase-backed singleton below (prod) and an
 * in-memory double (tests).
 */
export interface UserStore {
  // ── RTDB reads ──
  /** Every portal user, each stamped with uid + id. */
  listUsers(): Promise<UserRecord[]>;
  /** Every public groom profile, each stamped with uid + id. */
  listGroomProfiles(): Promise<UserRecord[]>;
  /** Read one user's profile object, or null when absent. */
  readUser(uid: string): Promise<Record<string, unknown> | null>;
  /** Resolve /usernameIndex/{username} → owning uid, or null when free. */
  readUsernameOwner(username: string): Promise<string | null>;
  /** Resolve /phoneIndex/{key} → owning uid, or null when free. */
  readPhoneOwner(phoneIndexKey: string): Promise<string | null>;

  // ── RTDB writes ──
  /** Atomic root multi-path update (a null value deletes that path). */
  applyUpdates(updates: Record<string, unknown>): Promise<void>;
  /** Shallow-merge `fields` into /users/{uid} (mirrors RTDB .update). */
  patchUserFields(uid: string, fields: Record<string, unknown>): Promise<void>;
  /** Set /users/{uid}/role. */
  setUserRole(uid: string, role: string): Promise<void>;
  /** Overwrite the public /groomProfiles/{uid} row. */
  setGroomProfile(uid: string, data: Record<string, unknown>): Promise<void>;
  /** Remove /groomProfiles/{uid}; idempotent. */
  removeGroomProfile(uid: string): Promise<void>;

  // ── Firebase Auth ──
  authCreateUser(payload: {
    email: string;
    password: string;
    displayName?: string;
    disabled?: boolean;
    phoneNumber?: string;
  }): Promise<{ uid: string }>;
  authSetClaims(uid: string, claims: Record<string, unknown>): Promise<void>;
  authUpdateUser(uid: string, patch: Record<string, unknown>): Promise<void>;
  authDeleteUser(uid: string): Promise<void>;
  /** Read an Auth user; propagates the SDK's not-found throw. */
  authGetUser(uid: string): Promise<AuthUserRecord>;
  authRevokeTokens(uid: string): Promise<void>;
}

/**
 * Firebase adapter. `getDatabase()` / `getAuth()` are called lazily inside each
 * method (never at module load) so importing this module in a no-Firebase unit
 * environment is safe — that is what lets the user handler tests run without the
 * emulator.
 */
function makeFirebaseUserStore(): UserStore {
  const mapRows = (val: Record<string, unknown> | null): UserRecord[] =>
    Object.entries(val ?? {}).map(([uid, data]) => ({
      uid,
      id: uid,
      ...(data as Record<string, unknown>),
    }));

  return {
    async listUsers() {
      const snap = await getDatabase().ref("users").get();
      return mapRows(snap.val());
    },
    async listGroomProfiles() {
      const snap = await getDatabase().ref("groomProfiles").get();
      return mapRows(snap.val());
    },
    async readUser(uid) {
      const snap = await getDatabase().ref(`users/${uid}`).get();
      return snap.exists() ? (snap.val() as Record<string, unknown>) : null;
    },
    async readUsernameOwner(username) {
      const snap = await getDatabase().ref(`usernameIndex/${username}`).get();
      return snap.exists() ? (snap.val() as string) : null;
    },
    async readPhoneOwner(phoneIndexKey) {
      const snap = await getDatabase().ref(`phoneIndex/${phoneIndexKey}`).get();
      return snap.exists() ? (snap.val() as string) : null;
    },

    async applyUpdates(updates) {
      await getDatabase().ref().update(updates);
    },
    async patchUserFields(uid, fields) {
      await getDatabase().ref(`users/${uid}`).update(fields);
    },
    async setUserRole(uid, role) {
      await getDatabase().ref(`users/${uid}/role`).set(role);
    },
    async setGroomProfile(uid, data) {
      await getDatabase().ref(`groomProfiles/${uid}`).set(data);
    },
    async removeGroomProfile(uid) {
      await getDatabase().ref(`groomProfiles/${uid}`).remove();
    },

    async authCreateUser(payload) {
      const rec = await getAuth().createUser(payload as CreateReq);
      return { uid: rec.uid };
    },
    async authSetClaims(uid, claims) {
      await getAuth().setCustomUserClaims(uid, claims);
    },
    async authUpdateUser(uid, patch) {
      await getAuth().updateUser(uid, patch as UpdateReq);
    },
    async authDeleteUser(uid) {
      await getAuth().deleteUser(uid);
    },
    async authGetUser(uid) {
      const rec = await getAuth().getUser(uid);
      return {
        uid: rec.uid,
        customClaims: rec.customClaims as Record<string, unknown> | undefined,
      };
    },
    async authRevokeTokens(uid) {
      await getAuth().revokeRefreshTokens(uid);
    },
  };
}

/** Default production store, backed by Firebase (RTDB + Auth Admin SDK). */
export const userStore: UserStore = makeFirebaseUserStore();
