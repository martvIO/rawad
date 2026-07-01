// Reusable zod primitives for request schemas. These wrap the EXISTING
// validators in helpers.ts / constants so there is one source of truth for a
// rule (a zod schema and the legacy per-handler check can never drift).

import { z } from "zod";
import { isUsername, isE164, isRole, isStrongPassword } from "../../helpers";
import { MAX_LEN } from "../../constants/limits";

/** username: 2–60 chars of [a-zA-Z0-9_.-]. */
export const zUsername = z
  .string()
  .refine(isUsername, { message: "invalid_username" });

/** Lower-cased username (public forms accept any case, store lowercase). */
export const zUsernameLower = z
  .string()
  .transform((s) => s.toLowerCase())
  .refine(isUsername, { message: "invalid_username" });

/** E.164 phone: +[country][number]. */
export const zE164 = z.string().refine(isE164, { message: "invalid_phone" });

/** Portal role. */
export const zRole = z
  .string()
  .refine(isRole, { message: "invalid_role" }) as z.ZodType<
  "admin" | "driver" | "groom"
>;

/** Strong password: ≥8 chars incl. upper, lower, digit. */
export const zStrongPassword = z
  .string()
  .refine(isStrongPassword, { message: "weak_password" });

/** A trimmed, non-empty string bounded to `max` chars. */
export const zBoundedString = (max: number, min = 1) =>
  z.string().trim().min(min).max(max);

/** An optional trimmed string bounded to `max` chars (empty allowed). */
export const zOptionalString = (max: number) =>
  z.string().trim().max(max).optional();

/** Firebase push-key / uid shape (path-segment safe). */
export const zId = z
  .string()
  .regex(/^[A-Za-z0-9_-]{1,128}$/, { message: "invalid_id" });

/** A finite number within inclusive bounds. */
export const zNumberInRange = (min: number, max: number) =>
  z.number().finite().min(min).max(max);

/** Latitude / longitude. */
export const zLat = zNumberInRange(-90, 90);
export const zLng = zNumberInRange(-180, 180);

/** A positive integer query param (e.g. ?limit=N), coerced from the string. */
export const zPositiveIntParam = (max: number, fallback: number) =>
  z.coerce.number().int().min(1).max(max).catch(fallback);

/** Common length-capped display fields. */
export const zName = zBoundedString(MAX_LEN.NAME);
export const zPhoneRaw = zBoundedString(MAX_LEN.PHONE);
