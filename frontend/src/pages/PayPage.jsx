// Public paid-signup page, opened from an admin-minted link of the shape
// /pay/:token. The groom picks a username + phone, then pays with Stripe
// Elements (the card form is ours; Stripe.js tokenizes the card in-browser).
//
// On a successful payment the BACKEND webhook creates the groom account and
// WhatsApps the credentials — so the success screen here only confirms the
// payment and points the groom at /portal/login; it must NOT assume the account
// already exists (the webhook may lag a moment).
import { useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import { loadStripe } from "@stripe/stripe-js";
import { Elements, PaymentElement, useStripe, useElements } from "@stripe/react-stripe-js";
import { BrandLogo } from "../components/BrandLogo.jsx";
import { LangSwitcher } from "../components/LangSwitcher.jsx";
import { PhoneInput, isCompletePhone } from "../components/PhoneInput.jsx";
import {
  resolvePaymentToken,
  checkUsernameAvailable,
  createPaymentIntent,
} from "../services/payments.js";
import { logErr } from "../utils/logger.js";
import { C } from "../styles/theme.js";

// Mirror the server-side USERNAME_RE (helpers.ts).
const USERNAME_RE = /^[a-zA-Z0-9_.-]{2,60}$/;
const PUB_KEY = import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY || "";

/** Map an ApiError from /intent to a localized message. */
function mapPayError(err, t) {
  const code = err?.body?.error || "";
  switch (code) {
    case "token_not_found":
    case "invalid_token_format":
    case "package_unavailable":
      return t("pay_invalid");
    case "token_expired":
      return t("pay_expired");
    case "already_used":
      return t("pay_already_paid");
    case "username_taken":
      return t("pay_username_taken");
    case "phone_taken":
      return t("pay_phone_taken");
    case "stripe_not_configured":
      return t("pay_not_configured");
    default:
      return t("pay_error_generic");
  }
}

export function PayPage({ t, lang, setLang }) {
  const { token } = useParams();
  const [rec, setRec] = useState(undefined); // undefined=loading, null=missing
  const [username, setUsername] = useState("");
  const [phone, setPhone] = useState("");
  const [avail, setAvail] = useState(null); // null | "checking" | true | false
  const [clientSecret, setClientSecret] = useState("");
  const [intentBusy, setIntentBusy] = useState(false);
  const [error, setError] = useState("");
  const [paid, setPaid] = useState(false);

  const stripePromise = useMemo(() => (PUB_KEY ? loadStripe(PUB_KEY) : null), []);

  // Resolve the token once on load.
  useEffect(() => {
    if (!token) { setRec(null); return; }
    let alive = true;
    resolvePaymentToken(token)
      .then((r) => { if (alive) setRec(r); })
      .catch(() => { if (alive) setRec(null); });
    return () => { alive = false; };
  }, [token]);

  // Debounced username-availability check. `alive` guards against a slow earlier
  // request resolving after a newer one and clobbering `avail` with a stale result.
  useEffect(() => {
    const u = username.trim().toLowerCase();
    if (!USERNAME_RE.test(u)) { setAvail(null); return; }
    setAvail("checking");
    let alive = true;
    const id = setTimeout(() => {
      checkUsernameAvailable(u)
        .then((ok) => { if (alive) setAvail(ok); })
        .catch(() => { if (alive) setAvail(null); });
    }, 450);
    return () => { alive = false; clearTimeout(id); };
  }, [username]);

  // Stripe redirect-return handling: a payment method that requires a full-page
  // redirect comes back to /pay/:token with ?payment_intent_client_secret=…. On
  // that fresh mount, retrieve the intent and show the success screen if it
  // already succeeded (otherwise the user would see the form again).
  useEffect(() => {
    const cs = new URLSearchParams(window.location.search).get("payment_intent_client_secret");
    if (!cs || !stripePromise) return;
    let alive = true;
    stripePromise
      .then((stripe) => stripe?.retrievePaymentIntent(cs))
      .then((res) => {
        const st = res?.paymentIntent?.status;
        if (alive && (st === "succeeded" || st === "processing")) setPaid(true);
      })
      .catch(() => {});
    return () => { alive = false; };
  }, [stripePromise]);

  const usernameValid = USERNAME_RE.test(username.trim().toLowerCase());
  const phoneValid = isCompletePhone(phone);
  const canContinue = usernameValid && avail === true && phoneValid && !intentBusy;

  const continueToPayment = async () => {
    setError("");
    setIntentBusy(true);
    try {
      const data = await createPaymentIntent(token, {
        username: username.trim().toLowerCase(),
        phoneE164: phone.trim(),
        lang,
      });
      setClientSecret(data.clientSecret);
    } catch (err) {
      logErr("createPaymentIntent", err);
      setError(mapPayError(err, t));
    } finally {
      setIntentBusy(false);
    }
  };

  // ── Loading / terminal states ─────────────────────────────────────────────
  if (rec === undefined) {
    return <Centered><div style={{ color: C.dim, fontSize: 14 }}>…</div></Centered>;
  }
  if (rec === null) {
    return <Notice icon="⚠️" color={C.red} title={t("pay_invalid")} />;
  }
  if (rec.status === "paid" || rec.status === "delivered" || rec.status === "delivery_failed") {
    return <Notice icon="✅" color="#4cc97a" title={t("pay_already_paid")} />;
  }
  if (rec.expiresAt && Date.now() > rec.expiresAt) {
    return <Notice icon="⏰" color={C.red} title={t("pay_expired")} />;
  }
  if (paid) {
    return (
      <Notice icon="🎉" color="#4cc97a" title={t("pay_success_title")}>
        <p style={{ color: "rgba(245,230,184,.82)", fontSize: 14, lineHeight: 1.9, marginTop: 10 }}>
          {t("pay_success_body")}
        </p>
        <a href="/portal/login" className="gold-btn"
           style={{ display: "inline-block", marginTop: 18, textDecoration: "none" }}>
          {t("pay_goto_login")}
        </a>
      </Notice>
    );
  }

  const pkg = rec.package;
  const price = pkg ? `${Number(pkg.amountIls).toLocaleString("en-US")} ₪` : "—";
  const pkgLabel = pkg ? (pkg.label?.[lang] || pkg.label?.ar || pkg.id) : rec.packageId;

  return (
    <div style={{ minHeight: "100vh", padding: "24px 16px" }}>
      <div style={{ maxWidth: 480, margin: "0 auto" }}>
        <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 12 }}>
          <LangSwitcher lang={lang} setLang={setLang} />
        </div>

        <div style={{ textAlign: "center", marginBottom: 22 }}>
          <div style={{ display: "flex", justifyContent: "center", marginBottom: 14 }}>
            <BrandLogo size={64} />
          </div>
          <h1 style={{ fontFamily: "'Amiri','Frank Ruhl Libre',serif", color: C.gold, fontSize: 25, marginBottom: 8 }}>
            {t("pay_title")}
          </h1>
        </div>

        <div className="gold-card">
          {/* Package + price summary */}
          <div style={{
            display: "flex", justifyContent: "space-between", alignItems: "center",
            padding: "12px 14px", marginBottom: 18, borderRadius: 12,
            background: "rgba(201,168,76,.07)", border: "1px solid rgba(201,168,76,.22)",
          }}>
            <div>
              <div style={{ fontSize: 11, color: C.goldDim }}>{t("pay_package")}</div>
              <div style={{ fontSize: 15, fontWeight: 800, color: C.goldLight }}>{pkgLabel}</div>
            </div>
            <div style={{ textAlign: "end" }}>
              <div style={{ fontSize: 11, color: C.goldDim }}>{t("pay_price")}</div>
              <div style={{ fontSize: 17, fontWeight: 900, color: C.gold, direction: "ltr" }}>{price}</div>
            </div>
          </div>

          {!clientSecret ? (
            <>
              {/* Username */}
              <div style={{ marginBottom: 6, fontSize: 12, color: C.goldDim }}>{t("pay_username")} *</div>
              <input className="input-field" type="text" placeholder={t("pay_username_ph")}
                     value={username}
                     onChange={(e) => setUsername(e.target.value.replace(/\s+/g, ""))}
                     style={{ marginBottom: 6, direction: "ltr", textAlign: "left" }} />
              <div style={{ minHeight: 18, marginBottom: 12, fontSize: 11, fontWeight: 700 }}>
                {username.trim() && !usernameValid && (
                  <span style={{ color: C.dim }}>{t("pay_username_format")}</span>
                )}
                {usernameValid && avail === "checking" && (
                  <span style={{ color: C.dim }}>{t("pay_username_checking")}</span>
                )}
                {usernameValid && avail === true && (
                  <span style={{ color: "#4cc97a" }}>{t("pay_username_available")}</span>
                )}
                {usernameValid && avail === false && (
                  <span style={{ color: C.red }}>{t("pay_username_taken")}</span>
                )}
              </div>

              {/* Phone */}
              <div style={{ marginBottom: 6, fontSize: 12, color: C.goldDim }}>{t("pay_phone")} *</div>
              <div style={{ marginBottom: 6 }}>
                <PhoneInput value={phone} onChange={setPhone} t={t} lang={lang} />
              </div>
              <div style={{ fontSize: 11, color: C.dim, marginBottom: 16, lineHeight: 1.6 }}>
                {t("pay_phone_hint")}
              </div>

              {error && (
                <div style={{ color: C.red, fontSize: 12, marginBottom: 12, textAlign: "center" }}>{error}</div>
              )}
              {!PUB_KEY && (
                <div style={{ color: C.red, fontSize: 12, marginBottom: 12, textAlign: "center" }}>
                  {t("pay_not_configured")}
                </div>
              )}

              <button className="gold-btn" style={{ width: "100%" }}
                      onClick={continueToPayment} disabled={!canContinue || !PUB_KEY}>
                {intentBusy ? t("pay_processing") : t("pay_button")}
              </button>
            </>
          ) : (
            <Elements stripe={stripePromise} options={{ clientSecret, appearance: { theme: "night" } }}>
              <div style={{ marginBottom: 6, fontSize: 12, color: C.goldDim }}>{t("pay_card")}</div>
              <CheckoutForm
                t={t}
                onPaid={() => setPaid(true)}
                onError={(m) => setError(m)}
              />
              {error && (
                <div style={{ color: C.red, fontSize: 12, marginTop: 12, textAlign: "center" }}>{error}</div>
              )}
            </Elements>
          )}
        </div>
      </div>
    </div>
  );
}

/** Card-entry + confirm. Must render inside <Elements> to use the Stripe hooks. */
function CheckoutForm({ t, onPaid, onError }) {
  const stripe = useStripe();
  const elements = useElements();
  const [busy, setBusy] = useState(false);

  const pay = async () => {
    if (!stripe || !elements) return;
    setBusy(true);
    onError("");
    const { error, paymentIntent } = await stripe.confirmPayment({
      elements,
      confirmParams: { return_url: window.location.href },
      redirect: "if_required",
    });
    setBusy(false);
    if (error) {
      onError(error.message || t("pay_error_generic"));
      return;
    }
    if (paymentIntent && (paymentIntent.status === "succeeded" || paymentIntent.status === "processing")) {
      onPaid();
    }
  };

  return (
    <div style={{ marginTop: 4 }}>
      <PaymentElement />
      <button className="gold-btn" style={{ width: "100%", marginTop: 18 }}
              onClick={pay} disabled={!stripe || busy}>
        {busy ? t("pay_processing") : t("pay_button")}
      </button>
    </div>
  );
}

function Centered({ children }) {
  return (
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
      <div style={{ maxWidth: 460, width: "100%", textAlign: "center" }}>{children}</div>
    </div>
  );
}

function Notice({ icon, color, title, children }) {
  return (
    <Centered>
      <div style={{ fontSize: 56, marginBottom: 12 }}>{icon}</div>
      <h1 style={{ fontFamily: "'Amiri','Frank Ruhl Libre',serif", color, fontSize: 24, marginBottom: 8 }}>
        {title}
      </h1>
      {children}
    </Centered>
  );
}
