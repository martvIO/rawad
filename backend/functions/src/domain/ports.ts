// Narrow dependency ports shared by every domain module.
//
// Domain modules ACCEPT these ports rather than calling getDatabase()/getAuth()
// directly. Each port declares exactly the operations the domain needs — no
// more — so a unit test can supply an in-memory fake (the second adapter) and
// exercise the logic with no Firebase emulator. Production wiring lives in
// `firebaseAdapters.ts` (the first adapter). One adapter would be a hypothetical
// seam; the test fake is what makes it a real one.

/** Realtime Database access, reduced to the four operations the domains use. */
export interface DbPort {
  /** Read a path. Resolves to the value, or `null` when the path doesn't exist. */
  get(path: string): Promise<unknown | null>;
  /** Root multi-path atomic update. A `null` value deletes that path. */
  update(updates: Record<string, unknown>): Promise<void>;
  /** Overwrite the value at a single path. */
  set(path: string, value: unknown): Promise<void>;
  /** Delete the value at a single path. */
  remove(path: string): Promise<void>;
  /**
   * Atomic read-modify-write at a single path. `transform` receives the current
   * value (`null` when the path is absent) and returns the next value to
   * commit, or `undefined` to ABORT the write. Resolves to whether a write
   * committed. Mirrors RTDB `ref(path).transaction(...)` and exists for
   * compare-and-set guards like the one-shot invite-token claim (set `usedAt`
   * only if still empty) that a plain `update` can't express race-free.
   */
  transaction(
    path: string,
    transform: (current: unknown) => unknown,
  ): Promise<{ committed: boolean }>;
}

/** A Firestore document as it crosses the seam: id + plain data, never a snapshot. */
export interface FsDoc {
  id: string;
  data: Record<string, unknown>;
}

/** One op in a FirestorePort.batchWrite — a per-doc update or delete. */
export type FsBatchOp =
  | { type: "update"; docPath: string; patch: Record<string, unknown> }
  | { type: "delete"; docPath: string };

/**
 * Firestore access, reduced to the operations the digital domain needs. Paths
 * are full slash paths — a collection ("digitalInvitations/uid/guests") or a
 * doc ("digitalInvitations/uid/guests/gid"). Modelled separately from DbPort
 * because Firestore is a distinct store with its own atomicity primitive
 * (runTransaction), which `addAfterScan` exposes at exactly the grain the
 * digital guest list needs.
 */
export interface FirestorePort {
  /** Read every doc in a collection, optionally ordered by a field. */
  list(
    collectionPath: string,
    opts?: { orderBy?: { field: string; dir: "asc" | "desc" } },
  ): Promise<FsDoc[]>;
  /** Read one doc, or null when absent. */
  get(docPath: string): Promise<FsDoc | null>;
  /** Every doc in a collection whose `field` equals `value` (`.where(field,'==',value)`). */
  findByField(
    collectionPath: string,
    field: string,
    value: unknown,
  ): Promise<FsDoc[]>;
  /** Add a doc with a fresh auto id; returns the new id. */
  add(collectionPath: string, data: Record<string, unknown>): Promise<string>;
  /** Shallow-merge update an existing doc (Firestore `.update` — rejects if absent). */
  update(docPath: string, patch: Record<string, unknown>): Promise<void>;
  /** Merge-set a doc, creating it if absent (Firestore `.set(data, { merge: true })`). */
  setMerge(docPath: string, data: Record<string, unknown>): Promise<void>;
  /** Delete a doc (idempotent). */
  remove(docPath: string): Promise<void>;
  /** Apply a list of update/delete ops atomically (Firestore `WriteBatch`). */
  batchWrite(ops: FsBatchOp[]): Promise<void>;
  /**
   * Atomically scan a collection then conditionally add ONE doc, inside a single
   * Firestore transaction: read every doc, call `decide(existing)`, and — when
   * it returns a value — add a fresh auto-id doc with that value. Returns
   * `{ added:false, id:null }` when `decide` returns `undefined` (e.g. a
   * duplicate was found). This is the race-free form of read-then-add that the
   * digital guest-list duplicate-phone guard needs (a plain list()+add() lets
   * two concurrent inserts both pass the check).
   */
  addAfterScan(
    collectionPath: string,
    decide: (existing: FsDoc[]) => Record<string, unknown> | undefined,
  ): Promise<{ added: boolean; id: string | null }>;
}

/** The subset of a Firebase Auth user record the domains read. */
export interface AuthUserRecord {
  uid: string;
  customClaims?: Record<string, unknown>;
}

/** Firebase Auth admin operations, reduced to what the user domain needs. */
export interface AuthPort {
  createUser(payload: {
    email: string;
    password: string;
    displayName?: string;
    disabled?: boolean;
    phoneNumber?: string;
  }): Promise<{ uid: string }>;
  updateUser(uid: string, patch: Record<string, unknown>): Promise<void>;
  deleteUser(uid: string): Promise<void>;
  getUser(uid: string): Promise<AuthUserRecord>;
  setCustomUserClaims(uid: string, claims: Record<string, unknown>): Promise<void>;
  revokeRefreshTokens(uid: string): Promise<void>;
}

/** Append an audit-log entry. Signature mirrors `audit.ts#writeAudit`. */
export type AuditPort = (
  uid: string,
  action: string,
  details?: Record<string, unknown>,
) => Promise<void>;

/** Injectable wall-clock (`Date.now`) so `createdAt`/timestamps are testable. */
export type Clock = () => number;
