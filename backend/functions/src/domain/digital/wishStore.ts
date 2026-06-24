// Digital-wish (guestbook) domain module — the deep interface over the Firestore
// `digitalInvitations/{uid}/wishes` subcollection, for the groom's moderation
// panel (list / approve-or-unpublish / delete).
//
// It owns persistence + the moderation-list ordering and the approve/unpublish
// timestamp rule. The route keeps authorization (canActOnUid) and the status
// allowlist. Guest-facing wish SUBMISSION lives elsewhere (the invite-token
// path), so this module is read/moderate-only.
//
// `now` is injected (the domain Clock pattern) so approvedAt is testable. Unit-
// testable with the in-memory FirestorePort fake (see digitalWishStore.test.ts).

import { FirestorePort } from "../ports";

const ROOT = "digitalInvitations";
const WISHES = "wishes";
const wishesPath = (uid: string) => `${ROOT}/${uid}/${WISHES}`;
const wishDocPath = (uid: string, wishId: string) =>
  `${wishesPath(uid)}/${wishId}`;

export interface DigitalWishRecord extends Record<string, unknown> {
  id: string;
}

export type WishStatus = "approved" | "pending";

export interface DigitalWishStore {
  /** All wishes (any status), newest-first by submittedAt (missing → oldest). */
  list(uid: string): Promise<DigitalWishRecord[]>;
  /** Approve ("approved", stamps approvedAt) or un-publish ("pending", clears it). */
  setStatus(uid: string, wishId: string, status: WishStatus): Promise<void>;
  remove(uid: string, wishId: string): Promise<void>;
}

export function makeDigitalWishStore(deps: {
  fs: FirestorePort;
  now: () => number;
}): DigitalWishStore {
  const { fs, now } = deps;
  return {
    async list(uid) {
      const docs = await fs.list(wishesPath(uid));
      const records = docs.map(
        (d) => ({ id: d.id, ...d.data }),
      ) as DigitalWishRecord[];
      // JS sort (not Firestore orderBy) so wishes missing `submittedAt` still
      // appear (treated as oldest), matching the legacy handler exactly.
      records.sort(
        (a, b) => (Number(b.submittedAt) || 0) - (Number(a.submittedAt) || 0),
      );
      return records;
    },

    async setStatus(uid, wishId, status) {
      await fs.update(wishDocPath(uid, wishId), {
        status,
        approvedAt: status === "approved" ? now() : null,
      });
    },

    async remove(uid, wishId) {
      await fs.remove(wishDocPath(uid, wishId));
    },
  };
}
