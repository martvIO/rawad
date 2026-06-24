// Production adapters: bind the narrow domain ports to the real Firebase
// Admin SDK. Built PER REQUEST (not at module load) so SDK handles resolve at
// request time exactly as the pre-extraction handlers did.
//
// These are the FIRST adapter for each port; the in-memory fakes in
// tests/functions/*.test.ts are the second. Keep these wrappers dumb — all
// behaviour lives in the domain modules, so there is nothing here worth
// unit-testing past the one-line SDK pass-throughs.

import { getDatabase } from "firebase-admin/database";
import { getAuth } from "firebase-admin/auth";
import { DbPort, AuthPort } from "./ports";

// Reuse the SDK's own parameter types so the adapter stays in lock-step with
// firebase-admin without importing named request types.
type CreateReq = Parameters<ReturnType<typeof getAuth>["createUser"]>[0];
type UpdateReq = Parameters<ReturnType<typeof getAuth>["updateUser"]>[1];

/** Realtime Database adapter. `get` collapses `!exists()` to `null`. */
export function rtdbPort(): DbPort {
  const db = getDatabase();
  return {
    async get(path) {
      const snap = await db.ref(path).get();
      return snap.exists() ? snap.val() : null;
    },
    async update(updates) {
      await db.ref().update(updates);
    },
    async set(path, value) {
      await db.ref(path).set(value);
    },
    async remove(path) {
      await db.ref(path).remove();
    },
    async transaction(path, transform) {
      // RTDB hands the transform `null` for an absent path and aborts the write
      // when it returns `undefined` — the exact contract the DbPort declares, so
      // this is a straight pass-through.
      const result = await db
        .ref(path)
        .transaction((current) =>
          transform(current === undefined ? null : current),
        );
      return { committed: result.committed };
    },
  };
}

/** Firebase Auth adapter — thin pass-through to the Admin SDK. */
export function authPort(): AuthPort {
  const auth = getAuth();
  return {
    async createUser(payload) {
      const rec = await auth.createUser(payload as CreateReq);
      return { uid: rec.uid };
    },
    async updateUser(uid, patch) {
      await auth.updateUser(uid, patch as UpdateReq);
    },
    async deleteUser(uid) {
      await auth.deleteUser(uid);
    },
    async getUser(uid) {
      const rec = await auth.getUser(uid);
      return {
        uid: rec.uid,
        customClaims: rec.customClaims as Record<string, unknown> | undefined,
      };
    },
    async setCustomUserClaims(uid, claims) {
      await auth.setCustomUserClaims(uid, claims);
    },
    async revokeRefreshTokens(uid) {
      await auth.revokeRefreshTokens(uid);
    },
  };
}
