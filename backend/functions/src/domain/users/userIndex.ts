// Read-only lookups over the /usernameIndex and /phoneIndex secondary indices.
//
// The deep user module (userStore.ts) OWNS these indices — it writes them in
// lock-step with /users/{uid} on create/update/delete. This module is the
// read-only counterpart: a narrow, pure resolver that public-facing routes
// (confirmations submit, invites mint/submit) use to turn a groomUsername into
// its uid without importing firebase-admin or re-deriving the index path.
//
// It takes the same narrow DbPort as the other domain modules and is unit-
// testable with an in-memory fake, no emulator.

import { DbPort } from "../ports";

export interface UserIndex {
  /** Resolve a username to its uid via /usernameIndex, or null if absent. */
  resolveUidByUsername(username: string): Promise<string | null>;
}

export function makeUserIndex(deps: { db: DbPort }): UserIndex {
  const { db } = deps;
  return {
    async resolveUidByUsername(username) {
      const uid = await db.get(`usernameIndex/${username}`);
      return typeof uid === "string" ? uid : null;
    },
  };
}
