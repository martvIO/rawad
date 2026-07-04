// Paid groom signup via Lemon Squeezy (overlay checkout).
//
// The admin mints a SINGLE-USE payment link for a package (price tier). The
// groom opens the branded /pay/:token page on our own site, picks a username +
// phone, and pays via the Lemon Squeezy checkout OVERLAY (LS is a Merchant of
// Record, so the card form is theirs; everything around it is ours). On the
// `order_created` webhook the backend auto-creates the groom account, stamps the
// purchase, stores the generated password (admin-only, auto-purged on first
// change) and WhatsApps the credentials. The groom is then forced to change the
// password on first login.
//
//   POST /payments/webhook              LS → provision account (X-Signature verified).
//   GET  /payments/packages             public: price list for the pay page.
//   GET  /payments/username-available   public: live username check on the pay page.
//   GET  /payments/links/:token         public: resolve a link (projected fields).
//   POST /payments/links                admin: mint a single-use link.
//   POST /payments/links/:token/intent  public: reserve username/phone + create LS checkout.
//   GET  /payments/links                admin: list links + statuses (+ generated pw).
//
// Route order matters: /webhook and the static /packages /username-available /links
// routes are declared before "/links/:token" so the param route can't capture them.
//
// CONFIG (test mode now, real payout later — no code change to go live):
//   LEMONSQUEEZY_API_KEY        LS API key (Settings → API)
//   LEMONSQUEEZY_STORE_ID       numeric store id (ILS store)
//   LEMONSQUEEZY_WEBHOOK_SECRET signing secret of the LS webhook (event: order_created)
//   LS_VARIANT_ID_<PACKAGEID>   the LS variant id per package (see config/packages.ts)
// Until set, the endpoints return 503 lemonsqueezy_not_configured — nothing else breaks.
// No LS SDK: REST API via fetch (mirrors auth.ts/whatsapp); webhook signature verified
// with Node crypto. The variant per package is server-chosen, so the buyer cannot
// tamper with the amount (we re-verify the order's variant in the webhook).

import { Router, Response, Request } from "express";
import { createHmac, timingSafeEqual, randomBytes } from "crypto";
import { getDatabase } from "firebase-admin/database";
import { requireAuth, requireAdmin, AuthRequest } from "../middleware/auth";
import { uidRateLimit, ipRateLimit, keyedRateLimit } from "../middleware/rateLimit";
import { HOUR_MS } from "../../constants/time";
import { RATE } from "../../constants/rateLimits";
import { TOKEN_BYTES, TOKEN_HEX_RE } from "../../constants/tokens";
import { isUsername, isE164, phoneIndexKey } from "../../helpers";
import { writeAudit } from "../../audit";
import { errorMessage } from "../errorDetail";
import {
  getPackage,
  publicPackages,
  variantIdFor,
  PAYMENT_LINK_TTL_MS,
  RESERVATION_TTL_MS,
} from "../../config/packages";
import { generateStrongPassword } from "../../passwordGen";
import { userStore } from "../stores/userStore";
import { createGroomAccount, GroomAccountError } from "../services/createGroomAccount";
import { sendCredentialsWhatsApp } from "../services/credentialsDelivery";
import { inviteLocale } from "../../whatsappInvite";
import { encryptField, isEncryptedField, decryptField } from "../passwordCrypto";

const LS_API = "https://api.lemonsqueezy.com/v1";
const CURRENCY = "ils";
// A token stuck in "provisioning" (a delivery that died mid-flight) becomes
// reclaimable by a later webhook retry after this long.
const PROVISIONING_STALE_MS = 2 * 60 * 1000;
// Link origin for the pay/login URLs we hand back + WhatsApp (shared w/ invites).
const PUBLIC_BASE_URL = (process.env.PUBLIC_BASE_URL || "https://dawa-aa793.web.app").replace(/\/+$/, "");

export const paymentsRouter = Router();

function lsApiKey(): string | null {
  return process.env.LEMONSQUEEZY_API_KEY || null;
}
function lsStoreId(): string | null {
  return process.env.LEMONSQUEEZY_STORE_ID || null;
}
function lsWebhookSecret(): string | null {
  return process.env.LEMONSQUEEZY_WEBHOOK_SECRET || null;
}

/**
 * Whether Lemon Squeezy is fully configured for the checkout + webhook flow:
 * API key + store id + webhook secret + at least the Premium variant. This mirrors
 * what `POST /links/:token/intent` actually enforces, so `/api/health` can surface
 * a deploy that forgot the LS secrets. VIP is optional — Premium is the minimum
 * sellable package. Never throws (safe to call on the health path).
 */
export function isLemonSqueezyConfigured(): boolean {
  return !!(lsApiKey() && lsStoreId() && lsWebhookSecret() && variantIdFor("premium"));
}

/** POST a JSON:API body to the Lemon Squeezy REST API; returns parsed JSON. */
async function lsPost(path: string, body: unknown, key: string) {
  const res = await fetch(`${LS_API}${path}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      Accept: "application/vnd.api+json",
      "Content-Type": "application/vnd.api+json",
    },
    body: JSON.stringify(body),
  });
  const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  return { ok: res.ok, status: res.status, data };
}

/**
 * Release a reservation node (usernameReservations/* or phoneReservations/*) ONLY
 * if it is still owned by `token`. A blind remove() would let a concurrent
 * same-token request's just-made reservation be deleted out from under it; the
 * transaction makes the release ownership-checked.
 */
async function releaseReservation(
  db: ReturnType<typeof getDatabase>,
  path: string,
  token: string,
): Promise<void> {
  await db
    .ref(path)
    .transaction((cur) => {
      const r = cur as { token?: string } | null;
      if (r && r.token === token) return null; // ours → release
      return cur; // someone else's (or absent) → leave untouched
    })
    .catch(() => undefined);
}

// ─── POST /payments/webhook — Lemon Squeezy → provision account (sig-verified) ──
// MUST be registered before the "/links/:token" routes below.

paymentsRouter.post("/webhook", async (req: Request, res: Response) => {
  const secret = lsWebhookSecret();
  if (!secret) {
    res.status(503).json({ error: "lemonsqueezy_not_configured" });
    return;
  }
  // Firebase populates req.rawBody (the original bytes); signature verification
  // REQUIRES the raw bytes (express.json already parsed a copy).
  const raw = (req as unknown as { rawBody?: Buffer }).rawBody;
  const sig = req.header("x-signature") || "";
  if (!raw || !sig) {
    res.status(400).json({ error: "bad_signature" });
    return;
  }
  if (!verifyLemonSignature(raw, sig, secret)) {
    res.status(400).json({ error: "bad_signature" });
    return;
  }

  let body: LsWebhookBody;
  try {
    body = JSON.parse(raw.toString("utf8"));
  } catch {
    res.status(400).json({ error: "bad_payload" });
    return;
  }

  try {
    if (body?.meta?.event_name === "order_created") {
      await provisionPaidOrder(body);
    }
    // Any other event type is acked without work (no retry storm).
    res.json({ received: true });
  } catch (err) {
    // A genuine processing failure (e.g. a transient RTDB/Auth outage while
    // provisioning). Do NOT ack 200 — that tells LS the event is handled and it
    // never re-delivers, silently losing a paid signup. Return 5xx so LS retries;
    // provisioning is idempotent (atomic token claim), so re-processing is safe.
    console.error("[payments] webhook handling error", err);
    res.status(500).json({ error: "processing_failed" });
  }
});

interface LsWebhookBody {
  meta?: { event_name?: string; custom_data?: Record<string, unknown> };
  data?: { id?: string | number; attributes?: Record<string, unknown> };
}

/**
 * Provision (or idempotently skip) the groom account for a paid LS order. Throws
 * only on an infrastructure failure that warrants an LS retry; all "expected"
 * terminal outcomes (missing/used token, wrong variant, username collision) mark
 * the token and return so the webhook acks 200.
 */
async function provisionPaidOrder(body: LsWebhookBody): Promise<void> {
  const custom = (body.meta?.custom_data ?? {}) as Record<string, unknown>;
  const token = typeof custom.token === "string" ? custom.token : "";
  if (!token || !TOKEN_HEX_RE.test(token)) return;

  const order = body.data ?? {};
  const attrs = (order.attributes ?? {}) as Record<string, unknown>;
  // Only provision on a fully-PAID order (ignore pending/failed/refunded states).
  if (attrs.status !== "paid") return;

  const db = getDatabase();
  const tokenRef = db.ref(`paymentTokens/${token}`);

  // Atomically CLAIM the token before any provisioning work. LS delivers
  // at-least-once and can re-deliver the same event concurrently; a plain
  // read-then-write idempotency check would let two deliveries both provision.
  // Only the delivery whose transaction commits a transition to "provisioning"
  // proceeds — losers (already paid/delivered, or another delivery actively
  // provisioning) abort and the webhook acks 200. A stale "provisioning" claim
  // is reclaimable after PROVISIONING_STALE_MS so a later retry can recover.
  const claimNow = Date.now();
  const claim = await tokenRef.transaction((cur) => {
    const r = cur as Record<string, unknown> | null;
    if (!r) return r; // unknown token → commit no-op, handled below
    if (r.status === "paid" || r.status === "delivered" || r.createdUid) return undefined;
    if (
      r.status === "provisioning" &&
      typeof r.claimedAt === "number" &&
      claimNow - (r.claimedAt as number) < PROVISIONING_STALE_MS
    ) {
      return undefined; // another delivery is actively provisioning
    }
    return { ...r, status: "provisioning", claimedAt: claimNow };
  });
  if (!claim.committed || !claim.snapshot.exists()) return; // lost the race / unknown token
  const rec = claim.snapshot.val() as Record<string, unknown>;

  const pkg = getPackage(rec.packageId);
  if (!pkg) {
    await tokenRef.update({ status: "amount_mismatch" });
    await writeAudit("lemonsqueezy", "payment_package_missing", { token, packageId: rec.packageId });
    return;
  }

  // Amount-tampering guard. We create the checkout for a server-chosen variant,
  // so the buyer can't change the price — re-verify the paid order is for the
  // variant we expect for this package.
  const expectedVariant = variantIdFor(pkg.id);
  const firstItem = (attrs.first_order_item ?? {}) as Record<string, unknown>;
  const orderVariant = firstItem.variant_id != null ? String(firstItem.variant_id) : "";
  if (!expectedVariant || orderVariant !== expectedVariant) {
    await tokenRef.update({ status: "amount_mismatch" });
    await writeAudit("lemonsqueezy", "payment_variant_mismatch", {
      token,
      expected: expectedVariant,
      got: orderVariant,
    });
    return;
  }

  // Prefer the SERVER-stored reservation over the buyer-echoed custom_data: the
  // token record is the single source of truth, and a groom who re-submitted with
  // a different username then paid an OLD checkout tab (carrying stale custom_data)
  // must still be provisioned as the currently-reserved identity, not the abandoned
  // one (whose reservation no longer protects it). Fall back to custom_data only
  // when the reservation is somehow absent.
  const username =
    (typeof rec.reservedUsername === "string" && rec.reservedUsername) ||
    (typeof custom.username === "string" && custom.username) ||
    "";
  const phoneE164 =
    (typeof rec.reservedPhoneE164 === "string" && rec.reservedPhoneE164) ||
    (typeof custom.phone === "string" && custom.phone) ||
    "";
  if (!isUsername(username) || !isE164(phoneE164)) {
    await tokenRef.update({ status: "account_conflict", deliveryError: "invalid_account_fields" });
    await writeAudit("lemonsqueezy", "payment_invalid_account_fields", { token });
    return;
  }
  const phoneIdx = phoneIndexKey(phoneE164);

  const orderId = order.id != null ? String(order.id) : null;
  const amountPaidCents = typeof attrs.total === "number" ? attrs.total : Number(attrs.total) || null;
  const password = generateStrongPassword();
  const lang = inviteLocale(rec.lang);
  const paidAt = Date.now();
  // Time-to-pay analytics want the link mint time; fall back to now.
  const linkCreatedAt = typeof rec.createdAt === "number" ? rec.createdAt : paidAt;

  let uid: string;
  try {
    const result = await createGroomAccount(userStore, {
      username,
      phoneE164,
      password,
      features: pkg.features,
      createdBy: "lemonsqueezy",
      extraProfile: {
        mustChangePassword: true,
        paymentPackageId: pkg.id,
        // Legacy revenue fields the analytics aggregator (composeRevenue) reads —
        // keeps the admin Revenue dashboard counting provisioned grooms.
        paymentStatus: "paid",
        paymentPlan: pkg.id,
        paymentAmountIls: pkg.amountIls,
        paymentPaidAt: paidAt,
        paymentCreatedAt: linkCreatedAt,
      },
      buildExtraUpdates: (newUid) => ({
        // Encrypted at rest (enc:v1 envelope); plaintext only if the key is
        // unset — the node is function-only either way (.read: false).
        [`generatedPasswords/${newUid}`]: { password: encryptField(password) ?? password, createdAt: paidAt, token },
        [`purchases/${token}`]: {
          uid: newUid,
          packageId: pkg.id,
          amountIls: pkg.amountIls,
          // The ACTUAL amount LS charged (cents), in case the display value drifts.
          amountPaidCents,
          currency: CURRENCY,
          token,
          orderId,
          status: "paid",
          paidAt,
        },
        [`paymentTokens/${token}/status`]: "paid",
        [`paymentTokens/${token}/paidAt`]: paidAt,
        [`paymentTokens/${token}/createdUid`]: newUid,
        [`usernameReservations/${username}`]: null,
        [`phoneReservations/${phoneIdx}`]: null,
      }),
    });
    uid = result.uid;
  } catch (err) {
    if (err instanceof GroomAccountError) {
      // Username/phone was taken out from under the reservation (very rare).
      // The groom paid but no account could be created — flag for the admin.
      await tokenRef.update({ status: "account_conflict", deliveryError: err.code });
      await writeAudit("lemonsqueezy", "payment_account_conflict", { token, code: err.code });
      return;
    }
    // Infrastructure failure: release our "provisioning" claim so the LS retry
    // can re-attempt instead of being aborted by the stale-claim guard.
    await tokenRef.update({ status: "reserved", claimedAt: null }).catch(() => undefined);
    throw err; // → 5xx → LS retries
  }

  await writeAudit("lemonsqueezy", "payment_paid", { token, uid, packageId: pkg.id, orderId });

  // Deliver the credentials over WhatsApp (best-effort; the account already
  // exists and the admin can read the password as a fallback if this fails).
  await deliverCredentials(token, phoneE164, lang, username, password);
}

/**
 * Send the new groom their login credentials over WhatsApp (via the shared
 * credentialsDelivery service) and stamp the token delivered / delivery_failed.
 * Never throws — a delivery failure must not 5xx the webhook (which would make
 * LS re-deliver, and re-provision is already short-circuited). On failure the
 * admin reads the generated password from the Payment Links tab (graceful
 * degrade).
 */
async function deliverCredentials(
  token: string,
  phoneE164: string,
  lang: "ar" | "he",
  username: string,
  password: string,
): Promise<void> {
  const tokenRef = getDatabase().ref(`paymentTokens/${token}`);
  const result = await sendCredentialsWhatsApp({ phoneE164, lang, username, password });
  try {
    if (result.delivered) {
      await tokenRef.update({ status: "delivered", deliveredAt: Date.now() });
    } else {
      await tokenRef.update({
        status: "delivery_failed",
        deliveryError: result.error ?? "send_failed",
      });
    }
  } catch {
    /* best-effort stamp — never 5xx the webhook over it */
  }
}

// ─── GET /payments/packages — public price list ─────────────────────────────────

paymentsRouter.get(
  "/packages",
  ipRateLimit("payPackages", RATE.PAY_PACKAGES_PER_IP.limit, HOUR_MS),
  (_req: Request, res: Response) => {
    res.json({ packages: publicPackages() });
  },
);

// ─── GET /payments/username-available — public live username check ──────────────

paymentsRouter.get(
  "/username-available",
  ipRateLimit("payUsernameCheck", RATE.PAY_USERNAME_CHECK_PER_IP.limit, HOUR_MS),
  async (req: Request, res: Response) => {
    const u = String(req.query?.u ?? "");
    if (!isUsername(u)) {
      res.status(400).json({ error: "invalid_username" });
      return;
    }
    try {
      res.json({ available: await isUsernameFree(u.toLowerCase()) });
    } catch (err) {
      res.status(500).json({ error: "check_failed", detail: errorMessage(err) });
    }
  },
);

/** A username is free when no account owns it AND no live reservation holds it. */
async function isUsernameFree(username: string): Promise<boolean> {
  const db = getDatabase();
  const ownerSnap = await db.ref(`usernameIndex/${username}`).get();
  if (ownerSnap.exists()) return false;
  const resSnap = await db.ref(`usernameReservations/${username}`).get();
  if (!resSnap.exists()) return true;
  const reservation = resSnap.val() as { expiresAt?: number };
  return !(typeof reservation.expiresAt === "number" && reservation.expiresAt > Date.now());
}

// ─── GET /payments/links/:token — public resolve (projected fields only) ────────

paymentsRouter.get(
  "/links/:token",
  keyedRateLimit(
    "payResolve",
    (req) => req.params.token || "",
    RATE.PAY_RESOLVE_PER_TOKEN.limit,
    HOUR_MS,
    RATE.PAY_RESOLVE_IP_BACKSTOP.limit,
  ),
  async (req: Request, res: Response) => {
    const { token } = req.params;
    if (!TOKEN_HEX_RE.test(token)) {
      res.status(400).json({ error: "invalid_token_format" });
      return;
    }
    try {
      const snap = await getDatabase().ref(`paymentTokens/${token}`).get();
      if (!snap.exists()) {
        res.status(404).json({ error: "token_not_found" });
        return;
      }
      const rec = snap.val() as Record<string, unknown>;
      const pkg = getPackage(rec.packageId);
      // Project ONLY the public fields — never expose createdBy / reserved* /
      // generated password. Pair with the RTDB rule paymentTokens.read:false so
      // the path can't be read directly either.
      res.json({
        status: rec.status,
        expiresAt: rec.expiresAt,
        packageId: rec.packageId,
        package: pkg
          ? { id: pkg.id, label: pkg.label, amountIls: pkg.amountIls, currency: pkg.currency }
          : null,
      });
    } catch (err) {
      res.status(500).json({ error: "read_failed", detail: errorMessage(err) });
    }
  },
);

// ─── POST /payments/links — admin mints a single-use link ───────────────────────

paymentsRouter.post(
  "/links",
  requireAuth,
  requireAdmin,
  uidRateLimit("createPaymentLink", RATE.CREATE_PAYMENT_LINK_PER_ADMIN.limit, HOUR_MS),
  async (req: AuthRequest, res: Response) => {
    const callerUid = req.caller!.uid;
    const packageId = String((req.body ?? {}).packageId ?? "");
    const pkg = getPackage(packageId);
    if (!pkg) {
      res.status(400).json({ error: "invalid_package" });
      return;
    }
    try {
      const token = randomBytes(TOKEN_BYTES).toString("hex");
      const now = Date.now();
      const expiresAt = now + PAYMENT_LINK_TTL_MS;
      await getDatabase().ref(`paymentTokens/${token}`).set({
        // role is ALWAYS groom for a paid signup link (never trusted from the client).
        role: "groom",
        packageId: pkg.id,
        status: "pending",
        createdAt: now,
        expiresAt,
        createdBy: callerUid,
      });
      await writeAudit(callerUid, "payment_link_created", { token, packageId: pkg.id });
      res.json({ token, expiresAt, packageId: pkg.id, payUrl: `${PUBLIC_BASE_URL}/pay/${token}` });
    } catch (err) {
      res.status(500).json({ error: "create_failed", detail: errorMessage(err) });
    }
  },
);

// ─── POST /payments/links/:token/intent — public: reserve + create LS checkout ──

paymentsRouter.post(
  "/links/:token/intent",
  keyedRateLimit(
    "payIntent",
    (req) => req.params.token || "",
    RATE.PAY_INTENT_PER_TOKEN.limit,
    HOUR_MS,
    RATE.PAY_INTENT_IP_BACKSTOP.limit,
  ),
  async (req: Request, res: Response) => {
    const key = lsApiKey();
    const storeId = lsStoreId();
    if (!key || !storeId) {
      res.status(503).json({ error: "lemonsqueezy_not_configured" });
      return;
    }
    const { token } = req.params;
    if (!TOKEN_HEX_RE.test(token)) {
      res.status(400).json({ error: "invalid_token_format" });
      return;
    }

    const body = (req.body ?? {}) as Record<string, unknown>;
    const usernameRaw = typeof body.username === "string" ? body.username : "";
    const phoneE164 = typeof body.phoneE164 === "string" ? body.phoneE164 : "";
    const lang = body.lang === "he" ? "he" : "ar";
    if (!isUsername(usernameRaw)) {
      res.status(400).json({ error: "invalid_username" });
      return;
    }
    if (!isE164(phoneE164)) {
      res.status(400).json({ error: "invalid_phone" });
      return;
    }
    const username = usernameRaw.toLowerCase();
    const phoneIdx = phoneIndexKey(phoneE164);

    const db = getDatabase();
    const tokenRef = db.ref(`paymentTokens/${token}`);
    try {
      const snap = await tokenRef.get();
      if (!snap.exists()) {
        res.status(404).json({ error: "token_not_found" });
        return;
      }
      const rec = snap.val() as Record<string, unknown>;
      if (rec.status === "paid" || rec.status === "delivered" || rec.createdUid) {
        res.status(409).json({ error: "already_used" });
        return;
      }
      if (typeof rec.expiresAt === "number" && Date.now() > rec.expiresAt) {
        res.status(410).json({ error: "token_expired" });
        return;
      }
      const pkg = getPackage(rec.packageId);
      if (!pkg) {
        res.status(409).json({ error: "package_unavailable" });
        return;
      }
      const variantId = variantIdFor(pkg.id);
      if (!variantId) {
        // The package has no LS variant configured (operator setup incomplete).
        res.status(503).json({ error: "lemonsqueezy_not_configured" });
        return;
      }

      // Account-level uniqueness checks before taking money.
      if ((await db.ref(`usernameIndex/${username}`).get()).exists()) {
        res.status(409).json({ error: "username_taken" });
        return;
      }
      const phoneOwner = await db.ref(`phoneIndex/${phoneIdx}`).get();
      if (phoneOwner.exists()) {
        res.status(409).json({ error: "phone_taken" });
        return;
      }

      // Atomically reserve the username AND the phone so account creation at the
      // webhook can never collide on either. Abort only when another (still-valid)
      // token holds it. The same-token branch lets a groom retry/resubmit freely.
      const now = Date.now();
      const claimReservation = (cur: unknown) => {
        const r = cur as { token?: string; expiresAt?: number } | null;
        if (r && r.token !== token && typeof r.expiresAt === "number" && r.expiresAt > now) {
          return undefined; // held by another live token → abort
        }
        return { token, expiresAt: now + RESERVATION_TTL_MS };
      };
      const uTxn = await db.ref(`usernameReservations/${username}`).transaction(claimReservation);
      if (!uTxn.committed) {
        res.status(409).json({ error: "username_taken" });
        return;
      }
      const pTxn = await db.ref(`phoneReservations/${phoneIdx}`).transaction(claimReservation);
      if (!pTxn.committed) {
        // Release the username reservation we just took (ours), then reject.
        await releaseReservation(db, `usernameReservations/${username}`, token);
        res.status(409).json({ error: "phone_taken" });
        return;
      }

      // Create the LS checkout for this package's variant. The variant fixes the
      // price (server-chosen), and custom_data round-trips to the webhook.
      const checkout = await lsPost(
        "/checkouts",
        {
          data: {
            type: "checkouts",
            attributes: {
              checkout_data: {
                custom: { token, username, phone: phoneE164, package_id: pkg.id },
              },
              checkout_options: { embed: true },
              product_options: { redirect_url: `${PUBLIC_BASE_URL}/pay/${token}` },
            },
            relationships: {
              store: { data: { type: "stores", id: String(storeId) } },
              variant: { data: { type: "variants", id: String(variantId) } },
            },
          },
        },
        key,
      );
      const checkoutUrl = readCheckoutUrl(checkout.data);
      if (!checkout.ok || !checkoutUrl) {
        // Release our just-made reservations (ownership-checked) so nothing sticks.
        await releaseReservation(db, `usernameReservations/${username}`, token);
        await releaseReservation(db, `phoneReservations/${phoneIdx}`, token);
        console.error("[payments] LS checkout create failed", checkout.status, checkout.data);
        res.status(502).json({ error: "lemonsqueezy_error" });
        return;
      }

      // Re-submit cleanup: if this token previously reserved a DIFFERENT
      // username/phone (groom changed their mind), release those stale
      // reservations. (LS checkouts need no cancellation — an unused checkout URL
      // never charges anything.)
      const prevUsername = typeof rec.reservedUsername === "string" ? rec.reservedUsername : "";
      if (prevUsername && prevUsername !== username) {
        await releaseReservation(db, `usernameReservations/${prevUsername}`, token);
      }
      const prevPhone = typeof rec.reservedPhoneE164 === "string" ? rec.reservedPhoneE164 : "";
      if (prevPhone && phoneIndexKey(prevPhone) !== phoneIdx) {
        await releaseReservation(db, `phoneReservations/${phoneIndexKey(prevPhone)}`, token);
      }

      await tokenRef.update({
        status: "reserved",
        reservedUsername: username,
        reservedPhoneE164: phoneE164,
        lang,
      });

      res.json({ checkoutUrl });
    } catch (err) {
      res.status(500).json({ error: "intent_failed", detail: errorMessage(err) });
    }
  },
);

/** Pull the hosted checkout URL out of an LS `POST /checkouts` JSON:API response. */
function readCheckoutUrl(body: Record<string, unknown>): string | null {
  const data = body?.data as { attributes?: { url?: unknown } } | undefined;
  const url = data?.attributes?.url;
  return typeof url === "string" && url ? url : null;
}

// ─── GET /payments/links — admin list (status + generated password fallback) ────

paymentsRouter.get(
  "/links",
  requireAuth,
  requireAdmin,
  uidRateLimit("getPaymentLinks", RATE.PAYMENT_LINKS_READ_PER_ADMIN.limit, HOUR_MS),
  async (_req: AuthRequest, res: Response) => {
    try {
      const db = getDatabase();
      const [tokensSnap, pwSnap] = await Promise.all([
        db.ref("paymentTokens").get(),
        db.ref("generatedPasswords").get(),
      ]);
      const tokens = (tokensSnap.val() ?? {}) as Record<string, Record<string, unknown>>;
      const passwords = (pwSnap.val() ?? {}) as Record<string, { password?: string }>;
      const links = Object.entries(tokens)
        .map(([token, rec]) => {
          const pkg = getPackage(rec.packageId);
          const createdUid = typeof rec.createdUid === "string" ? rec.createdUid : null;
          // Generated password is shown only until the groom's first-login
          // change purges generatedPasswords/{uid}. Stored as an enc:v1
          // envelope — decrypt for the admin here; legacy plaintext entries
          // pass through; an undecryptable envelope (key rotated/unset)
          // degrades to null rather than failing the whole list.
          const stored = createdUid ? passwords[createdUid]?.password ?? null : null;
          let generatedPassword: string | null = stored;
          if (stored && isEncryptedField(stored)) {
            try {
              generatedPassword = decryptField(stored);
            } catch {
              generatedPassword = null;
            }
          }
          return {
            token,
            status: rec.status ?? null,
            packageId: rec.packageId ?? null,
            packageLabel: pkg ? pkg.label : null,
            amountIls: pkg ? pkg.amountIls : null,
            createdAt: rec.createdAt ?? null,
            expiresAt: rec.expiresAt ?? null,
            paidAt: rec.paidAt ?? null,
            createdUid,
            reservedUsername: rec.reservedUsername ?? null,
            deliveryError: rec.deliveryError ?? null,
            generatedPassword,
            payUrl: `${PUBLIC_BASE_URL}/pay/${token}`,
          };
        })
        .sort((a, b) => Number(b.createdAt ?? 0) - Number(a.createdAt ?? 0));
      res.json({ links });
    } catch (err) {
      res.status(500).json({ error: "read_failed", detail: errorMessage(err) });
    }
  },
);

// ─── Lemon Squeezy webhook signature verification (no SDK) ──────────────────────

/**
 * Verify Lemon Squeezy's `X-Signature` header against the raw body: it is the hex
 * HMAC-SHA256 of the raw request body using the webhook's signing secret. Exact,
 * timing-safe compare. Exported for tests. (LS does not sign a timestamp, so there
 * is no replay window to check — idempotency is enforced by the atomic token claim.)
 */
export function verifyLemonSignature(raw: Buffer, header: string, secret: string): boolean {
  if (!header || !secret) return false;
  const expected = createHmac("sha256", secret).update(raw).digest("hex");
  const got = Buffer.from(header, "utf8");
  const want = Buffer.from(expected, "utf8");
  if (got.length !== want.length) return false;
  try {
    return timingSafeEqual(got, want);
  } catch {
    return false;
  }
}
