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
