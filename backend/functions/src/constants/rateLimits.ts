// Per-action rate-limit policy. Each entry pairs a numeric per-hour cap
// with the window length (always `HOUR_MS` today, but kept explicit so a
// future per-action window change doesn't ripple through every call site).
//
// Consumers pass these to `allow(key, limit, windowMs)` from rateLimit.ts.

import { HOUR_MS } from "./time";

type RateLimitPolicy = Readonly<{ limit: number; windowMs: number }>;

const perHour = (limit: number): RateLimitPolicy =>
  Object.freeze({ limit, windowMs: HOUR_MS });

export const RATE = Object.freeze({
  /** Guest confirmation form — anonymous public endpoint. Keyed per-groom so a
   *  venue full of guests sharing one NAT IP isn't throttled as a single client. */
  CONFIRM_PER_GROOM: perHour(600),
  /** IP backstop for the confirmation form (one venue ≈ one wedding ≈ one IP). */
  CONFIRM_IP_BACKSTOP: perHour(600),
  /** Phone-OTP password reset (per phone number). */
  RESET_PER_PHONE: perHour(5),
  /** Admin actions against the user CRUD endpoints. */
  CREATE_USER_PER_ADMIN: perHour(30),
  DELETE_USER_PER_ADMIN: perHour(30),
  SET_PASSWORD_PER_ADMIN: perHour(30),
  /** Admin regenerate-and-resend of a groom/driver temp password. */
  RESET_PASSWORD_PER_ADMIN: perHour(30),
  /** Admin re-reveal of a stored temp password (audited per hit). */
  TEMP_PASSWORD_REVEAL_PER_ADMIN: perHour(60),
  ATTACH_LOC_PER_ADMIN: perHour(30),
  UPDATE_USER_PER_ADMIN: perHour(60),
  /** Admin minting a paid-signup payment link (matches the legacy 20/hr). */
  CREATE_PAYMENT_LINK_PER_ADMIN: perHour(20),
  /** Self-service password change (per caller UID) — incl. the forced first-login change. */
  CHANGE_PASSWORD_PER_USER: perHour(10),
  /** Public pay page: username-availability checks (per IP). */
  PAY_USERNAME_CHECK_PER_IP: perHour(240),
  /** Public pay page: package list reads (per IP). */
  PAY_PACKAGES_PER_IP: perHour(240),
  /** Public pay page: token resolves, per token with an IP backstop. */
  PAY_RESOLVE_PER_TOKEN: perHour(120),
  PAY_RESOLVE_IP_BACKSTOP: perHour(600),
  /** Public pay page: PaymentIntent creation, per token with an IP backstop. */
  PAY_INTENT_PER_TOKEN: perHour(30),
  PAY_INTENT_IP_BACKSTOP: perHour(120),
  /** Invite-mint per caller (groom/admin). */
  CREATE_INVITE_PER_USER: perHour(60),
  /** Guest invite submission — anonymous public endpoint. */
  SUBMIT_INVITE_PER_IP: perHour(5),
  /** Digital-invite mint per caller (groom/admin). */
  CREATE_DIGITAL_INVITE_PER_USER: perHour(60),
  /** Digital-invite submission — anonymous public endpoint. */
  SUBMIT_DIGITAL_INVITE_PER_IP: perHour(10),
  /** Guest face enrollment / erasure — per invite token. */
  PHOTO_ENROLL_PER_TOKEN: perHour(10),
  /** IP backstop for enroll/erase (venue NAT shares one IP across guests). */
  PHOTO_ENROLL_IP_BACKSTOP: perHour(300),
  /** Guest face-match reads — polled at 15s by the photos page (240/h). */
  PHOTO_MATCHES_PER_TOKEN: perHour(300),
  /** IP backstop for match reads — sized for a venue full of pollers. */
  PHOTO_MATCHES_IP_BACKSTOP: perHour(6000),
  /** Photographer face-index backfill per caller (groom/admin). */
  PHOTO_REINDEX_PER_USER: perHour(10),
  /** Digital-invite "opened" ping — per invite token (handles refreshes). */
  INVITE_OPEN_PER_TOKEN: perHour(60),
  /** IP backstop for the open ping — generous for a venue sharing one NAT IP. */
  INVITE_OPEN_IP_BACKSTOP: perHour(600),

  // ── Admin Security page ──────────────────────────────────────────────────
  /** Reads on the admin Security page (events / summary / blocks; polled). */
  SECURITY_READ_PER_ADMIN: perHour(600),
  /** Block / unblock / resolve actions on the Security page. */
  SECURITY_ACTION_PER_ADMIN: perHour(120),

  // ── Rate-limit gaps closed after the security audit ──────────────────────
  /** Public invite-token lookup (GET /invites/token/:token) — per token + IP. */
  INVITE_LOOKUP_PER_TOKEN: perHour(60),
  INVITE_LOOKUP_IP_BACKSTOP: perHour(600),
  /** Public digital-wishes read (GET /invites/digital/wishes/:token). */
  WISHES_READ_PER_TOKEN: perHour(120),
  WISHES_READ_IP_BACKSTOP: perHour(1200),
  /** Public wedding-status lookup (GET /lifecycle/public/:username) — per name + IP. */
  PUBLIC_STATUS_PER_NAME: perHour(120),
  PUBLIC_STATUS_IP_BACKSTOP: perHour(600),
  /** Authenticated guest CRUD (per caller uid). */
  GUESTS_READ_PER_USER: perHour(600),
  GUESTS_WRITE_PER_USER: perHour(600),
  /** Groom lifecycle state changes (cancel/undo/pause/resume) per caller. */
  LIFECYCLE_ACTION_PER_USER: perHour(30),
  /** Admin lifecycle actions (confirm-cancel / restore) per admin. */
  LIFECYCLE_ADMIN_PER_ADMIN: perHour(60),
  /** SSE stream-token minting (per caller uid). */
  STREAM_TOKEN_PER_USER: perHour(120),
  /** Proof upload / signed-URL fetch (per caller uid). */
  PROOF_UPLOAD_PER_USER: perHour(60),
  PROOF_URL_PER_USER: perHour(300),
  /** Driver self-assignment write / read (per caller uid). */
  ASSIGN_WRITE_PER_USER: perHour(20),
  ASSIGN_READ_PER_USER: perHour(120),
  /** Admin read endpoints that were missing a limiter. */
  USERS_LIST_PER_ADMIN: perHour(120),
  GROOM_PROFILES_READ_PER_USER: perHour(240),
  GROOM_PROFILE_WRITE_PER_ADMIN: perHour(60),
  ADMIN_CLAIM_PER_ADMIN: perHour(30),
  WA_READ_PER_ADMIN: perHour(60),
  /** Admin read of the payment-links list (returns sensitive data). */
  PAYMENT_LINKS_READ_PER_ADMIN: perHour(120),

  // ── Rate-limit gaps closed after the 2026-07-02 re-audit ─────────────────
  /** Digital media / photographer file uploads (per caller uid). Large
   *  multipart bodies (50 MB media, 200 MB photographer) so cap per-caller
   *  frequency to bound self-inflicted Storage/egress cost. */
  MEDIA_UPLOAD_PER_USER: perHour(120),
  /** Photographer dumps a whole event's photos in one session — a wedding album
   *  is routinely many hundreds of files, so 120/h wrongly blocked the legit case
   *  (429 after 120). Sized for a full event upload while still bounding abuse. */
  PHOTOG_UPLOAD_PER_USER: perHour(2000),
  /** People-gallery read-heavy routes (index/cluster status, clusters, config)
   *  — polled by the gallery UI; generous per-caller cap on own-tenant reads. */
  GALLERY_READ_PER_USER: perHour(600),
  /** People-gallery curation / config writes (per caller uid). */
  GALLERY_WRITE_PER_USER: perHour(120),
  /** Admin settings merge-patch (per admin). */
  SETTINGS_PATCH_PER_ADMIN: perHour(60),
});
