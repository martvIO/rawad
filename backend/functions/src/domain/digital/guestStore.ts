// Digital-guest domain module — the deep interface over the Firestore
// `digitalInvitations/{uid}/guests` subcollection.
//
// It owns ONLY persistence + record shaping over the FirestorePort. The route
// keeps transport concerns: authorization (canActOnUid), body validation
// (sanitizeDigitalGuest*), status/createdAt stamping, and computing the phone
// dedupe key (the il-national normaliser lives in the route's sanitize layer).
//
// The one piece of REAL logic here is the duplicate-phone guard: the legacy
// route read every guest then added, which let two concurrent submits with the
// same phone both pass the check. `create` routes that through
// FirestorePort.addAfterScan, a single Firestore transaction (scan-then-add), so
// exactly one of two racing inserts wins. The decision (what counts as a dup) is
// injected so the module stays free of the route's phone-normalisation rules.
//
// Unit-testable with the in-memory FirestorePort fake, no emulator (see
// tests/functions/digitalGuestStore.test.ts).

import { FirestorePort } from "../ports";

/** Collection layout — Firestore `digitalInvitations/{uid}/guests`. */
const ROOT = "digitalInvitations";
const GUESTS = "guests";
const guestsPath = (uid: string) => `${ROOT}/${uid}/${GUESTS}`;
const guestDocPath = (uid: string, guestId: string) =>
  `${guestsPath(uid)}/${guestId}`;

/** A digital guest as it crosses the seam: id + plain fields. */
export interface DigitalGuestRecord extends Record<string, unknown> {
  id: string;
}

export type CreateGuestResult =
  | { ok: true; id: string }
  | { ok: false; reason: "duplicate_phone" };

/** How to decide a duplicate: the new guest's key + how to derive an existing one's. */
export interface DedupeBy {
  /** Normalised key of the guest being created (e.g. il-national phone). */
  key: string;
  /** Derive the same normalised key from an existing guest's stored fields. */
  keyOf: (data: Record<string, unknown>) => string | null;
}

export interface DigitalGuestStore {
  list(uid: string): Promise<DigitalGuestRecord[]>;
  create(
    uid: string,
    record: Record<string, unknown>,
    dedupe: DedupeBy,
  ): Promise<CreateGuestResult>;
  patch(uid: string, guestId: string, patch: Record<string, unknown>): Promise<void>;
  remove(uid: string, guestId: string): Promise<void>;
}

export function makeDigitalGuestStore(deps: {
  fs: FirestorePort;
}): DigitalGuestStore {
  const { fs } = deps;
  return {
    async list(uid) {
      const docs = await fs.list(guestsPath(uid), {
        orderBy: { field: "createdAt", dir: "asc" },
      });
      return docs.map((d) => ({ id: d.id, ...d.data }));
    },

    async create(uid, record, dedupe) {
      const r = await fs.addAfterScan(guestsPath(uid), (existing) => {
        const dup = existing.some((g) => dedupe.keyOf(g.data) === dedupe.key);
        return dup ? undefined : record;
      });
      return r.added
        ? { ok: true, id: r.id as string }
        : { ok: false, reason: "duplicate_phone" };
    },

    async patch(uid, guestId, patch) {
      await fs.update(guestDocPath(uid, guestId), patch);
    },

    async remove(uid, guestId) {
      await fs.remove(guestDocPath(uid, guestId));
    },
  };
}
