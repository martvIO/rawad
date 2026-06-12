// Per-guest invite-link service (physical + digital).
//
// Endpoints (all under /api/invites):
//   POST /invites                  groom/admin: mint physical token
//   POST /invites/submit           PUBLIC: submit physical reply
//   POST /invites/digital          groom/admin: mint digital token
//   POST /invites/digital/submit   PUBLIC: submit digital reply
//   GET  /invites/token/:token     PUBLIC: fetch a token record

import { api } from "../utils/apiClient.js";
import { createPoller } from "../utils/poller.js";
import { POLL_MS } from "../config/index.js";

// ─── Constants ────────────────────────────────────────────────────────────────

/** Aggressive interval — invite pages need to detect "used" quickly. */
const INVITE_TOKEN_POLL_INTERVAL_MS = POLL_MS.INVITES;

// ─── Token mint / submit ──────────────────────────────────────────────────────

/**
 * Mint a physical invite token. Body: `{ groomUid, guestId }`.
 * @returns {Promise<{token, expiresAt}>}
 */
export async function createGuestInvite(input) {
  return api.post("/invites", input);
}

/**
 * Submit a physical invite reply. Public; no auth.
 */
export async function submitGuestInvite(input) {
  return api.post("/invites/submit", input, { skipAuth: true });
}

/**
 * Mint a digital invite token. Body: `{ groomUid, guestId }`.
 */
export async function createDigitalGuestInvite(input) {
  return api.post("/invites/digital", input);
}

/**
 * Submit a digital invite reply. Public; no auth.
 * Body: `{ token, rsvp: "attending"|"absent", note? }`.
 */
export async function submitDigitalGuestInvite(input) {
  return api.post("/invites/digital/submit", input, { skipAuth: true });
}

/**
 * Submit a guestbook wish from the digital invitation. Public; no auth.
 * Body: `{ token, who, what }`. Stored as pending until the groom approves.
 */
export async function submitDigitalWish(input) {
  return api.post("/invites/digital/wish", input, { skipAuth: true });
}

/**
 * Read the APPROVED guestbook wishes for a token's groom (live, cross-design).
 * Public; no auth. Returns `{ wishes: [{ who, what }] }`.
 */
export async function getApprovedWishes(token) {
  return api.get(`/invites/digital/wishes/${token}`, { skipAuth: true });
}

// ─── Token read ───────────────────────────────────────────────────────────────

/**
 * Subscribe to a token record. The InviteForm page uses this to detect
 * `usedAt` (one-shot guard) and expiry. Fires `cb(null)` when the token
 * doesn't exist.
 *
 * @param {string} token
 * @param {(record: object|null) => void} cb
 * @returns {() => void} unsubscribe
 */
export function subscribeInviteToken(token, cb) {
  if (!token) {
    queueMicrotask(() => cb(null));
    return () => {};
  }
  return createPoller(
    async () => {
      try {
        return await api.get(`/invites/token/${token}`, { skipAuth: true });
      } catch (err) {
        if (err?.status === 404) return null;
        throw err;
      }
    },
    (value) => cb(value ?? null),
    { intervalMs: INVITE_TOKEN_POLL_INTERVAL_MS },
  );
}
