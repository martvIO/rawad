// Reusable in-memory AuthPort fake (the "second adapter") for domain unit tests
// that touch custom claims — the emulator-free counterpart to
// firebaseAdapters.authPort. Models only what the domains read/write today
// (getUser + setCustomUserClaims); the rest of the AuthPort surface is stubbed.
//
// `failNextClaims()` arms setCustomUserClaims to throw once, so the assignment
// claim-restamp rollback path is testable.

import { AuthPort } from "../../../functions/src/domain/ports";

type AuthRec = { uid: string; customClaims?: Record<string, unknown> };

export function inMemoryAuth(
  seed: Record<string, { customClaims?: Record<string, unknown> }> = {},
): {
  auth: AuthPort;
  users: Record<string, AuthRec>;
  failNextClaims: () => void;
} {
  const users: Record<string, AuthRec> = {};
  for (const [uid, v] of Object.entries(seed)) {
    users[uid] = { uid, customClaims: v.customClaims };
  }
  let failClaims = false;

  const auth: AuthPort = {
    async createUser() {
      return { uid: "unused" };
    },
    async updateUser() {},
    async deleteUser() {},
    async getUser(uid) {
      const u = users[uid];
      if (!u) throw new Error("auth/user-not-found");
      return { uid, customClaims: u.customClaims };
    },
    async setCustomUserClaims(uid, claims) {
      if (failClaims) throw new Error("claim_write_failed");
      users[uid] = { ...(users[uid] ?? { uid }), customClaims: claims };
    },
    async revokeRefreshTokens() {},
  };

  return {
    auth,
    users,
    failNextClaims: () => {
      failClaims = true;
    },
  };
}
