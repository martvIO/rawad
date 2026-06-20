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
  ATTACH_LOC_PER_ADMIN: perHour(30),
  UPDATE_USER_PER_ADMIN: perHour(60),
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
});
