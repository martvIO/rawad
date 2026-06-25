// Paid groom signup via Stripe Elements.
//
// The admin mints a SINGLE-USE payment link for a package (price tier). The
// groom opens the branded /pay/:token page on our own site, picks a username +
// phone, and pays with Stripe Elements (the card form is ours; Stripe.js
// tokenizes the card in-browser). On `payment_intent.succeeded` the webhook
// auto-creates the groom account, stamps the purchase, stores the generated
// password (admin-only, auto-purged on first change) and WhatsApps the
// credentials. The groom is then forced to change the password on first login.
//
//   POST /payments/webhook              Stripe → provision account (sig-verified).
//   GET  /payments/packages             public: price list for the pay page.
//   GET  /payments/username-available   public: live username check on the pay page.
//   GET  /payments/links/:token         public: resolve a link (projected fields).
//   POST /payments/links                admin: mint a single-use link.
//   POST /payments/links/:token/intent  public: reserve username + create PaymentIntent.
//   GET  /payments/links                admin: list links + statuses (+ generated pw).
//
// Route order matters: /webhook and the static /packages /username-available /links
// routes are declared before "/links/:token" so the param route can't capture them.
//
// CONFIG (test mode now, real payout later — no code change to go live):
//   STRIPE_SECRET_KEY      sk_test_… (later sk_live_…)
//   STRIPE_WEBHOOK_SECRET  whsec_… (from the Stripe webhook endpoint; event
//                          subscription = payment_intent.succeeded)
// Until set, the endpoints return 503 stripe_not_configured — nothing else breaks.
// No Stripe SDK: REST API via fetch (mirrors auth.ts); webhook signature verified
// with Node crypto. Amounts come from config/packages.ts (server-authoritative).

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
  PAYMENT_LINK_TTL_MS,
  RESERVATION_TTL_MS,
} from "../../config/packages";
import { generateStrongPassword } from "../../passwordGen";
import { userStore } from "../stores/userStore";
import { createGroomAccount, GroomAccountError } from "../services/createGroomAccount";
import { getWhatsAppConfig, isConfigured } from "../../whatsappConfig";
import { sendWhatsAppTemplate } from "../../whatsapp";
import { inviteLocale } from "../../whatsappInvite";

const STRIPE_API = "https://api.stripe.com/v1";
const CURRENCY = "ils";
// Reject webhook events whose timestamp is older than this (replay protection).
const WEBHOOK_TOLERANCE_S = 5 * 60;
// A token stuck in "provisioning" (a delivery that died mid-flight) becomes
// reclaimable by a later Stripe retry after this long.
const PROVISIONING_STALE_MS = 2 * 60 * 1000;
// Link origin for the pay/login URLs we hand back + WhatsApp (shared w/ invites).
const PUBLIC_BASE_URL = (process.env.PUBLIC_BASE_URL || "https://dawa-aa793.web.app").replace(/\/+$/, "");

export const paymentsRouter = Router();

function stripeKey(): string | null {
  return process.env.STRIPE_SECRET_KEY || null;
}
function webhookSecret(): string | null {
  return process.env.STRIPE_WEBHOOK_SECRET || null;
}

/** POST a form-encoded body to the Stripe REST API; returns parsed JSON. */
async function stripePost(path: string, params: Record<string, string>, key: string) {
  const res = await fetch(`${STRIPE_API}${path}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams(params).toString(),
  });
  const data = (await res.json()) as Record<string, unknown>;
  return { ok: res.ok, data };
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

// ─── POST /payments/webhook — Stripe → provision account (sig-verified) ─────────
// MUST be registered before the "/links/:token" routes below.

paymentsRouter.post("/webhook", async (req: Request, res: Response) => {
  const secret = webhookSecret();
  if (!secret) {
    res.status(503).json({ error: "stripe_not_configured" });
    return;
  }
  // Firebase populates req.rawBody (the original bytes); signature verification
  // REQUIRES the raw bytes (express.json already parsed a copy).
  const raw = (req as unknown as { rawBody?: Buffer }).rawBody;
  const sig = req.header("stripe-signature") || "";
  if (!raw || !sig) {
    res.status(400).json({ error: "bad_signature" });
    return;
  }
  if (!verifyStripeSignature(raw, sig, secret)) {
    res.status(400).json({ error: "bad_signature" });
    return;
  }

  let event: { type?: string; data?: { object?: Record<string, unknown> } };
  try {
    event = JSON.parse(raw.toString("utf8"));
  } catch {
    res.status(400).json({ error: "bad_payload" });
    return;
  }

  try {
    if (event.type === "payment_intent.succeeded") {
      const pi = event.data?.object ?? {};
      await provisionPaidIntent(pi);
    }
    // Any other event type is acked without work (no retry storm).
    res.json({ received: true });
  } catch (err) {
    // A genuine processing failure (e.g. a transient RTDB/Auth outage while
    // provisioning). Do NOT ack 200 — that tells Stripe the event is handled
    // and it never re-delivers, silently losing a paid signup. Return 5xx so
    // Stripe retries; provisioning is idempotent (token status guard), so
    // re-processing the same event is safe.
    console.error("[payments] webhook handling error", err);
    res.status(500).json({ error: "processing_failed" });
  }
});

/**
 * Provision (or idempotently skip) the groom account for a succeeded
 * PaymentIntent. Throws only on an infrastructure failure that warrants a Stripe
 * retry; all "expected" terminal outcomes (missing/used token, amount mismatch,
 * username collision) mark the token and return so the webhook acks 200.
 */
async function provisionPaidIntent(pi: Record<string, unknown>): Promise<void> {
  const metadata = (pi.metadata ?? {}) as Record<string, unknown>;
  const token = typeof metadata.token === "string" ? metadata.token : "";
  if (!token || !TOKEN_HEX_RE.test(token)) return;

  const db = getDatabase();
  const tokenRef = db.ref(`paymentTokens/${token}`);

  // Atomically CLAIM the token before doing any provisioning work. Stripe
  // delivers at-least-once and can deliver/retry the same event concurrently; a
  // plain read-then-write idempotency check would let two deliveries both
  // provision. Only the delivery whose transaction commits a transition to
  // "provisioning" proceeds — losers (already paid/delivered, or another
  // delivery actively provisioning) abort and the webhook acks 200. A stale
  // "provisioning" claim (a process that died mid-flight) is reclaimable after
  // PROVISIONING_STALE_MS so a later retry can still recover.
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
    await writeAudit("stripe", "payment_package_missing", { token, packageId: rec.packageId });
    return;
  }

  // Amount tampering guard: the PaymentIntent amount is set server-side, but
  // re-verify against the authoritative price before creating any account.
  const amount = typeof pi.amount === "number" ? pi.amount : Number(pi.amount);
  const currency = typeof pi.currency === "string" ? pi.currency : "";
  if (amount !== pkg.amountIls * 100 || currency !== CURRENCY) {
    await tokenRef.update({ status: "amount_mismatch" });
    await writeAudit("stripe", "payment_amount_mismatch", {
      token,
      expected: pkg.amountIls * 100,
      got: amount,
      currency,
    });
    return;
  }

  const username =
    (typeof metadata.username === "string" && metadata.username) ||
    (typeof rec.reservedUsername === "string" && rec.reservedUsername) ||
    "";
  const phoneE164 =
    (typeof metadata.phoneE164 === "string" && metadata.phoneE164) ||
    (typeof rec.reservedPhoneE164 === "string" && rec.reservedPhoneE164) ||
    "";
  if (!isUsername(username) || !isE164(phoneE164)) {
    await tokenRef.update({ status: "account_conflict", deliveryError: "invalid_account_fields" });
    await writeAudit("stripe", "payment_invalid_account_fields", { token });
    return;
  }
  const phoneIdx = phoneIndexKey(phoneE164);

  const paymentIntentId = typeof pi.id === "string" ? pi.id : null;
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
      createdBy: "stripe",
      extraProfile: {
        mustChangePassword: true,
        paymentPackageId: pkg.id,
        // Legacy revenue fields the analytics aggregator (composeRevenue) reads —
        // keeps the admin Revenue dashboard counting Stripe-provisioned grooms.
        paymentStatus: "paid",
        paymentPlan: pkg.id,
        paymentAmountIls: pkg.amountIls,
        paymentPaidAt: paidAt,
        paymentCreatedAt: linkCreatedAt,
      },
      buildExtraUpdates: (newUid) => ({
        [`generatedPasswords/${newUid}`]: { password, createdAt: paidAt, token },
        [`purchases/${token}`]: {
          uid: newUid,
          packageId: pkg.id,
          amountIls: pkg.amountIls,
          currency: CURRENCY,
          token,
          paymentIntentId,
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
      await writeAudit("stripe", "payment_account_conflict", { token, code: err.code });
      return;
    }
    // Infrastructure failure: release our "provisioning" claim so the Stripe
    // retry can re-attempt instead of being aborted by the stale-claim guard.
    await tokenRef.update({ status: "reserved", claimedAt: null }).catch(() => undefined);
    throw err; // → 5xx → Stripe retries
  }

  await writeAudit("stripe", "payment_paid", { token, uid, packageId: pkg.id });

  // Deliver the credentials over WhatsApp (best-effort; the account already
  // exists and the admin can read the password as a fallback if this fails).
  await deliverCredentials(token, phoneE164, lang, username, password);
}

/**
 * Send the new groom their login credentials over WhatsApp (Meta-approved
 * template per language) and stamp the token delivered / delivery_failed.
 * Never throws — a delivery failure must not 5xx the webhook (which would make
 * Stripe re-deliver and re-provision is already short-circuited).
 */
async function deliverCredentials(
  token: string,
  phoneE164: string,
  lang: "ar" | "he",
  username: string,
  password: string,
): Promise<void> {
  const tokenRef = getDatabase().ref(`paymentTokens/${token}`);
  try {
    const cfg = await getWhatsAppConfig();
    const tmpl = cfg.credentialsTemplates[lang];
    if (!isConfigured(cfg) || !cfg.autoSendEnabled || !tmpl) {
      await tokenRef.update({ status: "delivery_failed", deliveryError: "not_configured" });
      return;
    }
    const loginUrl = `${PUBLIC_BASE_URL}/portal/login`;
    const components = [
      {
        type: "body",
        parameters: [
          { type: "text", text: username },
          { type: "text", text: password },
          { type: "text", text: loginUrl },
        ],
      },
    ];
    const result = await sendWhatsAppTemplate(phoneE164, tmpl, lang, components, {
      token: cfg.token,
      phoneId: cfg.phoneId,
    });
    if (result.ok) {
      await tokenRef.update({ status: "delivered", deliveredAt: Date.now() });
    } else {
      await tokenRef.update({
        status: "delivery_failed",
        deliveryError: (result.error || "send_failed").slice(0, 240),
      });
    }
  } catch (err) {
    await tokenRef
      .update({ status: "delivery_failed", deliveryError: (errorMessage(err) ?? "send_failed").slice(0, 240) })
      .catch(() => undefined);
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
      // paymentIntentId / generated password. Pair with the RTDB rule
      // paymentTokens.read:false so the path can't be read directly either.
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

// ─── POST /payments/links/:token/intent — public: reserve + create PaymentIntent ─

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
    const key = stripeKey();
    if (!key) {
      res.status(503).json({ error: "stripe_not_configured" });
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

      // Create the PaymentIntent. Amount is AUTHORITATIVE from the package config.
      const pi = await stripePost(
        "/payment_intents",
        {
          amount: String(pkg.amountIls * 100),
          currency: CURRENCY,
          "metadata[token]": token,
          "metadata[username]": username,
          "metadata[phoneE164]": phoneE164,
          "metadata[packageId]": pkg.id,
          "automatic_payment_methods[enabled]": "true",
        },
        key,
      );
      if (!pi.ok || !pi.data.client_secret || !pi.data.id) {
        // Release our just-made reservations (ownership-checked) so nothing sticks.
        await releaseReservation(db, `usernameReservations/${username}`, token);
        await releaseReservation(db, `phoneReservations/${phoneIdx}`, token);
        console.error("[payments] payment_intent create failed", pi.data);
        res.status(502).json({ error: "stripe_error" });
        return;
      }

      // Re-submit cleanup: if this token previously reserved a DIFFERENT
      // username/phone (groom changed their mind), release those stale
      // reservations and cancel the now-orphaned PaymentIntent so a stale intent
      // in an old tab can't provision the wrong identity.
      const prevUsername = typeof rec.reservedUsername === "string" ? rec.reservedUsername : "";
      if (prevUsername && prevUsername !== username) {
        await releaseReservation(db, `usernameReservations/${prevUsername}`, token);
      }
      const prevPhone = typeof rec.reservedPhoneE164 === "string" ? rec.reservedPhoneE164 : "";
      if (prevPhone && phoneIndexKey(prevPhone) !== phoneIdx) {
        await releaseReservation(db, `phoneReservations/${phoneIndexKey(prevPhone)}`, token);
      }
      const prevPI = typeof rec.paymentIntentId === "string" ? rec.paymentIntentId : "";
      if (prevPI && prevPI !== pi.data.id) {
        await stripePost(`/payment_intents/${prevPI}/cancel`, {}, key).catch(() => undefined);
      }

      await tokenRef.update({
        status: "reserved",
        paymentIntentId: pi.data.id as string,
        reservedUsername: username,
        reservedPhoneE164: phoneE164,
        lang,
      });

      res.json({ clientSecret: pi.data.client_secret as string });
    } catch (err) {
      res.status(500).json({ error: "intent_failed", detail: errorMessage(err) });
    }
  },
);

// ─── GET /payments/links — admin list (status + generated password fallback) ────

paymentsRouter.get(
  "/links",
  requireAuth,
  requireAdmin,
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
          // change purges generatedPasswords/{uid}.
          const generatedPassword = createdUid ? passwords[createdUid]?.password ?? null : null;
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

// ─── Stripe webhook signature verification (no SDK) ─────────────────────────────

/**
 * Verify a Stripe `Stripe-Signature` header against the raw body.
 * Header shape: `t=<unix>,v1=<hexHmac>[,v1=<hexHmac>...]`. The signed payload is
 * `${t}.${rawBody}`, HMAC-SHA256 with the endpoint secret. Exported for tests.
 */
export function verifyStripeSignature(raw: Buffer, header: string, secret: string): boolean {
  const parts = header.split(",").map((p) => p.trim());
  let t = "";
  const v1: string[] = [];
  for (const p of parts) {
    const [k, v] = p.split("=");
    if (k === "t") t = v;
    else if (k === "v1" && v) v1.push(v);
  }
  if (!t || v1.length === 0) return false;

  // Replay protection: reject very old timestamps.
  const ts = Number(t);
  if (Number.isFinite(ts)) {
    const ageS = Math.abs(Date.now() / 1000 - ts);
    if (ageS > WEBHOOK_TOLERANCE_S) return false;
  }

  const expected = createHmac("sha256", secret)
    .update(`${t}.${raw.toString("utf8")}`, "utf8")
    .digest("hex");
  const expectedBuf = Buffer.from(expected, "utf8");
  // Constant-time compare against each provided signature.
  return v1.some((sig) => {
    const sigBuf = Buffer.from(sig, "utf8");
    return sigBuf.length === expectedBuf.length && timingSafeEqual(sigBuf, expectedBuf);
  });
}
