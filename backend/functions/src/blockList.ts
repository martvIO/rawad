// Block-list store — the account / IP / device-fingerprint deny-lists an admin
// (or a conservative auto-rule) can add to, enforced on every request.
//
// STORAGE — RTDB under `securityBlocks/{accounts|ips|fingerprints}/{key}` so the
// per-request check is a cheap read against a small node (the same store family
// the rate-limiter uses). Each request instance keeps a short-TTL in-memory
// cache so the hot path doesn't hit RTDB on every call; a block/unblock made on
// an instance invalidates that instance immediately, and other warm instances
// converge within CACHE_TTL_MS.
//
// ENFORCEMENT SPLIT:
//   - IP + fingerprint blocks are enforced by blockCheck middleware BEFORE auth
//     (the identity is available pre-auth and covers public/unauthenticated abuse).
//   - ACCOUNT blocks are enforced authoritatively by Firebase Auth itself: the
//     security route disables the user + revokeRefreshTokens, so requireAuth's
//     verifyIdToken(checkRevoked:true) rejects them. The RTDB account entry is a
//     record for the admin UI + a marker for re-enable on unblock.
//
// FAIL-OPEN — a store/cache error must never lock out every user, matching the
// rate-limiter philosophy. On any read error the check returns "not blocked".

import { getDatabase } from "firebase-admin/database";
import type { Request } from "express";
import { clientIp, ipKey, deviceFingerprint } from "./api/clientMeta";

export const BLOCKS_ROOT = "securityBlocks";

export type BlockKind = "account" | "ip" | "fingerprint";

export interface BlockRecord {
  reason?: string;
  by?: string; // admin uid, or "auto" for rule-driven blocks
  ts?: number;
  /** Epoch ms after which the block lapses; null/absent = permanent. */
  expiresAt?: number | null;
  /** The original (unsanitized) value, for admin display (IP keys are munged). */
  value?: string;
}

type BlockMap = Record<string, BlockRecord>;

interface BlockCache {
  accounts: BlockMap;
  ips: BlockMap;
  fingerprints: BlockMap;
  at: number;
}

const CACHE_TTL_MS = 30_000;
const KIND_PATH: Record<BlockKind, string> = {
  account: "accounts",
  ip: "ips",
  fingerprint: "fingerprints",
};

let cache: BlockCache | null = null;

/** Drop the cache so the next check re-reads (called after a block/unblock). */
export function invalidateBlockCache(): void {
  cache = null;
}

/** True when the record exists and has not expired. */
function isActive(rec: BlockRecord | undefined, now: number): boolean {
  if (!rec) return false;
  if (rec.expiresAt != null && rec.expiresAt <= now) return false;
  return true;
}

/** Load (or return cached) block maps. Fail-open: returns empty maps on error. */
async function getCache(): Promise<BlockCache> {
  const now = Date.now();
  if (cache && now - cache.at < CACHE_TTL_MS) return cache;
  try {
    const snap = await getDatabase().ref(BLOCKS_ROOT).get();
    const val = (snap.val() ?? {}) as Partial<Omit<BlockCache, "at">>;
    cache = {
      accounts: val.accounts ?? {},
      ips: val.ips ?? {},
      fingerprints: val.fingerprints ?? {},
      at: now,
    };
    return cache;
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error("[blockList] cache load failed (fail-open)", err);
    return { accounts: {}, ips: {}, fingerprints: {}, at: now };
  }
}

export interface BlockHit {
  kind: BlockKind;
  key: string;
}

/**
 * Check the pre-auth identity (IP + fingerprint) against the deny-lists.
 * Returns the first hit, or null. Never throws (fail-open).
 */
export async function checkIpOrFingerprintBlocked(
  req: Request
): Promise<BlockHit | null> {
  const c = await getCache();
  const now = Date.now();

  const key = ipKey(clientIp(req));
  if (isActive(c.ips[key], now)) return { kind: "ip", key };

  const fp = deviceFingerprint(req);
  if (fp && isActive(c.fingerprints[fp], now)) {
    return { kind: "fingerprint", key: fp };
  }
  return null;
}

/** True when the given account uid is on the (unexpired) account deny-list. */
export async function isAccountBlocked(uid: string): Promise<boolean> {
  const c = await getCache();
  return isActive(c.accounts[uid], Date.now());
}

/** Write (or overwrite) a block entry, then invalidate the local cache. */
export async function setBlock(
  kind: BlockKind,
  key: string,
  rec: BlockRecord
): Promise<void> {
  await getDatabase()
    .ref(`${BLOCKS_ROOT}/${KIND_PATH[kind]}/${key}`)
    .set({
      reason: rec.reason ?? null,
      by: rec.by ?? null,
      ts: rec.ts ?? Date.now(),
      expiresAt: rec.expiresAt ?? null,
      value: rec.value ?? null,
    });
  invalidateBlockCache();
}

/** Remove a block entry, then invalidate the local cache. */
export async function removeBlock(kind: BlockKind, key: string): Promise<void> {
  await getDatabase().ref(`${BLOCKS_ROOT}/${KIND_PATH[kind]}/${key}`).remove();
  invalidateBlockCache();
}

/** Snapshot all deny-lists (for the admin Security page). */
export async function listBlocks(): Promise<{
  accounts: BlockMap;
  ips: BlockMap;
  fingerprints: BlockMap;
}> {
  const snap = await getDatabase().ref(BLOCKS_ROOT).get();
  const val = (snap.val() ?? {}) as Partial<Omit<BlockCache, "at">>;
  return {
    accounts: val.accounts ?? {},
    ips: val.ips ?? {},
    fingerprints: val.fingerprints ?? {},
  };
}
