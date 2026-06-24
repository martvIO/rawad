// Stripe payments — the admin generates a per-plan payment link (sent to the
// groom over WhatsApp after a conversation); a webhook marks the groom "paid"
// when checkout completes.
//
//   POST /payments/webhook  — Stripe calls this (no auth; verified by signature).
//                             On checkout.session.completed → paymentStatus=paid.
//   POST /payments/:uid     — admin only. Body { plan: "premium" | "vip" }.
//                             Creates a Stripe Payment Link, persists it on the
//                             groom's user record, returns { url, ... }.
//
// NOTE: /webhook is registered BEFORE /:uid — otherwise Express's ":uid" param
// route would capture the literal "webhook" segment and 401 Stripe's callbacks.
//
// CONFIG (test mode now, real payout later — no code change to go live):
//   STRIPE_SECRET_KEY      sk_test_… (later sk_live_…)
//   STRIPE_WEBHOOK_SECRET  whsec_… (from the Stripe webhook endpoint)
// Set them in functions/.env.local (emulator) or Secret Manager (prod). Until
// set, the endpoints return 503 stripe_not_configured — nothing else breaks.
//
// No Stripe SDK dependency: link creation uses the Stripe REST API via fetch
// (mirrors auth.ts), and the webhook signature is verified with Node crypto.
// Prices are created on the fly, so there is NO dashboard pre-setup to do.
import { Router, Response, Request } from "express";
import { createHmac, timingSafeEqual } from "crypto";
import { getDatabase } from "firebase-admin/database";
import { requireAuth, requireAdmin, AuthRequest } from "../middleware/auth";
import { uidRateLimit } from "../middleware/rateLimit";
import { HOUR_MS } from "../../constants/time";
import { writeAudit } from "../../audit";

const STRIPE_API = "https://api.stripe.com/v1";
// Display/charge amounts per plan, in ILS. (Later: move to adminSettings so the
// operator can change prices without a deploy — audit item 13.)
// Exported so a drift test asserts these stay in sync with the marketing/admin
// price strings in frontend i18n (price_pkg*_price, admin_pay_*) — changing a
// price here should fail that test and prompt updating every source.
export const PLAN_AMOUNTS_ILS: Record<string, number> = { premium: 1500, vip: 2000 };
const VALID_PLANS = new Set(Object.keys(PLAN_AMOUNTS_ILS));
const CURRENCY = "ils";

/**
 * Build the SINGLE root multi-path RTDB update for a created payment link: the
 * groom's payment metadata under /users/{uid} AND the /stripePaymentLinks/{linkId}
 * reverse index the webhook resolves uid from. Returning one object lets the route
 * apply both atomically via ref().update — exported pure so the atomicity (both
 * the user paths AND the reverse index present in one write) is unit-testable.
 */
export function paymentLinkUpdates(
  uid: string,
  linkId: string,
  f: { plan: string; amountIls: number; url: string; mode: string; createdAt: number },
): Record<string, unknown> {
  return {
    [`users/${uid}/paymentPlan`]: f.plan,
    [`users/${uid}/paymentStatus`]: "pending",
    [`users/${uid}/paymentAmountIls`]: f.amountIls,
    [`users/${uid}/paymentLinkUrl`]: f.url,
    [`users/${uid}/paymentLinkId`]: linkId,
    [`users/${uid}/paymentCreatedAt`]: f.createdAt,
    [`users/${uid}/paymentMode`]: f.mode,
    [`stripePaymentLinks/${linkId}`]: uid,
  };
}
// Reject webhook events whose timestamp is older than this (replay protection).
const WEBHOOK_TOLERANCE_S = 5 * 60;

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

// ─── POST /payments/webhook — Stripe → mark paid (no auth, signature-verified) ──
// MUST be registered before the "/:uid" route below.

paymentsRouter.post("/webhook", async (req: Request, res: Response) => {
  const secret = webhookSecret();
  if (!secret) {
    res.status(503).json({ error: "stripe_not_configured" });
    return;
  }
  // Firebase populates req.rawBody (the original bytes) even though express.json
  // already parsed the body; signature verification REQUIRES the raw bytes.
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
    if (event.type === "checkout.session.completed" ||
        event.type === "checkout.session.async_payment_succeeded") {
      const session = event.data?.object ?? {};
      const linkId = typeof session.payment_link === "string" ? session.payment_link : "";
      const paid = session.payment_status === "paid" || session.payment_status === "no_payment_required";
      if (linkId && paid) {
        const db = getDatabase();
        const uidSnap = await db.ref(`stripePaymentLinks/${linkId}`).get();
        const uid = uidSnap.val();
        if (typeof uid === "string" && uid) {
          const userRef = db.ref(`users/${uid}`);
          // Idempotent: Stripe can deliver the same event more than once (and we
          // now return 5xx on failure, which makes a retry more likely). Only
          // write + audit the FIRST time we see it paid, so retries don't drift
          // paymentPaidAt or push duplicate "payment_paid" audit rows.
          const already = (await userRef.child("paymentStatus").get()).val();
          if (already !== "paid") {
            await userRef.update({
              paymentStatus: "paid",
              paymentPaidAt: Date.now(),
            });
            await writeAudit("stripe", "payment_paid", { uid, linkId });
          }
        }
      }
    }
    res.json({ received: true });
  } catch (err) {
    // A genuine processing failure (e.g. a transient RTDB outage on the
    // paid-status write). Do NOT ack with 200: that tells Stripe the event is
    // handled and it will never re-deliver, silently losing a real payment.
    // Return 5xx so Stripe retries — the paid-status write is an idempotent
    // upsert, so re-processing the same event is safe.
    console.error("[payments] webhook handling error", err);
    res.status(500).json({ error: "processing_failed" });
  }
});

// ─── POST /payments/:uid — create a payment link (admin) ────────────────────────

paymentsRouter.post(
  "/:uid",
  requireAuth,
  requireAdmin,
  uidRateLimit("createPaymentLink", 20, HOUR_MS),
  async (req: AuthRequest, res: Response) => {
    const key = stripeKey();
    if (!key) {
      res.status(503).json({ error: "stripe_not_configured" });
      return;
    }
    const { uid } = req.params;
    const plan = String((req.body ?? {}).plan ?? "");
    if (!VALID_PLANS.has(plan)) {
      res.status(400).json({ error: "invalid_plan" });
      return;
    }

    const db = getDatabase();
    const userSnap = await db.ref(`users/${uid}`).get();
    if (!userSnap.exists()) {
      res.status(404).json({ error: "user_not_found" });
      return;
    }

    const amountIls = PLAN_AMOUNTS_ILS[plan];
    try {
      // 1) Create a one-off Price (with an inline product) for this plan/amount.
      const priceRes = await stripePost(
        "/prices",
        {
          currency: CURRENCY,
          unit_amount: String(amountIls * 100), // Stripe wants the minor unit
          "product_data[name]": `دعوة — ${plan === "vip" ? "VIP Royal" : "Premium"}`,
        },
        key,
      );
      if (!priceRes.ok || !priceRes.data.id) {
        console.error("[payments] price create failed", priceRes.data);
        res.status(502).json({ error: "stripe_error" });
        return;
      }
      const priceId = priceRes.data.id as string;

      // 2) Create a Payment Link for that price. metadata carries uid+plan; we
      //    also store a reverse index keyed by the link id for the webhook.
      const linkRes = await stripePost(
        "/payment_links",
        {
          "line_items[0][price]": priceId,
          "line_items[0][quantity]": "1",
          "metadata[uid]": uid,
          "metadata[plan]": plan,
        },
        key,
      );
      if (!linkRes.ok || !linkRes.data.url) {
        console.error("[payments] payment_link create failed", linkRes.data);
        res.status(502).json({ error: "stripe_error" });
        return;
      }
      const linkId = linkRes.data.id as string;
      const url = linkRes.data.url as string;
      const mode = key.startsWith("sk_live_") ? "live" : "test";

      // Single atomic multi-path update: the user's payment metadata AND the
      // reverse index the webhook maps linkId→uid with land together (or neither).
      // Previously these were two separate writes — a failure of the second left a
      // payment link the webhook couldn't attribute, silently dropping the payment.
      await db.ref().update(
        paymentLinkUpdates(uid, linkId, { plan, amountIls, url, mode, createdAt: Date.now() }),
      );
      await writeAudit(req.caller?.uid ?? "admin", "payment_link_created", { uid, plan, linkId, mode });

      res.json({ url, linkId, plan, amountIls, mode });
    } catch (err) {
      console.error("[payments] create error", err);
      res.status(502).json({ error: "stripe_error" });
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
