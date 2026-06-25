// Shared account-provisioning service for the post-payment groom signup flow.
//
// Mirrors the username/phone-index + custom-claims invariant that routes/users.ts
// POST /users establishes (create the Auth user, set { role, username } claims,
// then ONE atomic multi-path RTDB update that writes the profile + both indices +
// the public groom profile together — so an account never exists without its
// indices, or vice-versa). Kept here, behind the same UserStore seam, so the
// Stripe webhook can provision an account WITHOUT going through the admin-gated
// HTTP handler, and so it stays unit-testable via the in-memory store (no emulator).
//
// The webhook owns the surrounding concerns (token state machine, amount
// verification, idempotency, WhatsApp delivery); this helper owns ONLY the
// "an account + its indices + any same-transaction ledger writes appear together"
// atomic guarantee.

import { phoneIndexKey, syntheticEmail } from "../../helpers";
import { UserStore } from "../stores/userStore";
import { PackageFeatures } from "../../config/packages";

/** Stable error codes the webhook maps to a token status + ack. */
export type GroomAccountErrorCode = "username_taken" | "phone_taken";

/** Thrown on a username/phone collision so the caller can choose how to surface it. */
export class GroomAccountError extends Error {
  code: GroomAccountErrorCode;
  constructor(code: GroomAccountErrorCode) {
    super(code);
    this.code = code;
    this.name = "GroomAccountError";
  }
}

export interface CreateGroomAccountInput {
  /** Already lowercased + isUsername-validated. */
  username: string;
  /** Already isE164-validated. Required — the password is delivered to this phone. */
  phoneE164: string;
  /** Pre-generated strong password (see passwordGen.ts). */
  password: string;
  /** Permission flags from the purchased package. */
  features: PackageFeatures;
  /** Stamped into /users/{uid}/createdBy (e.g. "stripe"). */
  createdBy: string;
  /** Extra fields merged into the /users/{uid} profile object
   *  (e.g. paymentPackageId, mustChangePassword). */
  extraProfile?: Record<string, unknown>;
  /** Builds extra root multi-path updates merged into the SAME atomic write as
   *  the profile + indices (ledger row, generatedPasswords, token status,
   *  reservation release). Receives the freshly-created uid. */
  buildExtraUpdates?: (uid: string) => Record<string, unknown>;
}

export interface CreateGroomAccountResult {
  uid: string;
}

/**
 * Provision a groom account atomically. Throws GroomAccountError on a username
 * or phone collision (the caller decides how to surface it). Any other failure
 * (Auth/RTDB) propagates raw so the webhook can return 5xx and Stripe retries.
 *
 * NOTE: like routes/users.ts POST /users, the Auth user is created before the
 * RTDB write; a failure of the (single) RTDB update can leave an orphaned Auth
 * user. Same trade-off as the existing admin create path.
 */
export async function createGroomAccount(
  store: UserStore,
  input: CreateGroomAccountInput,
): Promise<CreateGroomAccountResult> {
  const { username, phoneE164 } = input;
  const phoneIdx = phoneIndexKey(phoneE164);

  if ((await store.readUsernameOwner(username)) !== null) {
    throw new GroomAccountError("username_taken");
  }
  if ((await store.readPhoneOwner(phoneIdx)) !== null) {
    throw new GroomAccountError("phone_taken");
  }

  const { uid } = await store.authCreateUser({
    email: syntheticEmail(username),
    password: input.password,
    phoneNumber: phoneE164,
    disabled: false,
  });

  // The Auth user now exists but the RTDB profile/indices do not. If the claims
  // or the atomic RTDB write fails, delete the Auth user before propagating so a
  // retry (the Stripe webhook re-delivers on 5xx) starts clean instead of
  // colliding forever on the orphan's synthetic email (auth/email-already-exists).
  try {
    await store.authSetClaims(uid, { role: "groom", username });

    const profile: Record<string, unknown> = {
      username,
      role: "groom",
      displayName: null,
      createdAt: Date.now(),
      createdBy: input.createdBy,
      phoneE164,
      canSeeAttendance: input.features.canSeeAttendance,
      canUsePhotographer: input.features.canUsePhotographer,
      canUseBoardingPass: input.features.canUseBoardingPass,
      ...input.extraProfile,
    };

    const updates: Record<string, unknown> = {
      [`users/${uid}`]: profile,
      [`usernameIndex/${username}`]: uid,
      [`phoneIndex/${phoneIdx}`]: uid,
      [`groomProfiles/${uid}`]: { username },
      ...(input.buildExtraUpdates ? input.buildExtraUpdates(uid) : {}),
    };
    await store.applyUpdates(updates);
  } catch (err) {
    await store.authDeleteUser(uid).catch(() => undefined);
    throw err;
  }

  return { uid };
}
