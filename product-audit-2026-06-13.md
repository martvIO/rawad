# Dawa — Product, UX & Engineering Audit

**Date:** 2026-06-13
**Scope:** Every user-facing surface (public guest flows; groom / admin / driver portals; the
digital-invitation engine; face-matching) plus the full Cloud Functions backend.
**Method:** 14-agent workflow — 6 surface mappers → 7 dimension analysts → 1 synthesizer — with
every finding grounded in current source (file:line cited).
**Lens:** senior full-stack engineer + product manager + the operator who has to talk to real
(non-technical, Arabic/Hebrew-speaking, mobile) users.

> Companion docs: `qa-audit-2026-05-28.md` (prior live QA audit), `wiki/Product-Audit-2026-06-13.md`
> (condensed wiki copy), `known_bugs` ledger in the wiki.

---

## Executive summary

Dawa is a genuinely polished, deeply-built product with a strong technical spine: server-mediated
auth, default-deny rules across RTDB/Firestore/Storage, an append-only audit log, 128-bit one-shot
invite tokens, a privacy-forward biometric face-finder, and warm, dialect-aware bilingual (AR/HE)
RTL copy. **All three "critical" bugs from the 2026-05-28 QA audit are confirmed FIXED** in current
source (driver Continue button, design-requests 500, settings PATCH 400).

The headline is that Dawa is a strong *product* but an incomplete *business*. The most important
issues are not broken features — they are whole missing layers and a handful of places where the
product promises things it cannot deliver:

1. **No proactive communication channel of any kind** — no email, SMS, push, in-app inbox, or
   server-side WhatsApp. Every status change is invisible until the user manually re-opens and polls
   the portal (~15s). This single gap underlies the broken reminder promise, the operator-scale
   ceiling, the invisible design-rejection problem, and the lack of delivery instrumentation.
2. **The product promises things it has no engine to deliver** — the RSVP screen guarantees "a
   reminder a week before," the landing page sells an "automatic emergency message" (×4), and the
   privacy policy promises 30-day PII auto-deletion. None have any backing implementation. This is a
   trust *and* legal liability.
3. **The top of funnel is broken** — every "contact to book" CTA dead-ends at a login screen, with
   no lead capture for prospects who, by definition, have no account.
4. **The operator is the bottleneck by design** — one admin manually opens a `wa.me` tab and presses
   Send for every single guest; grooms can't self-send and aren't told why. Realistic ceiling
   ~20–30 active weddings, not 100.
5. **The business is blind to itself** — no payments/plan layer, no analytics/funnel, no "invite
   opened" counter, no lead capture, no growth loop, no overview dashboard, no audit reader.
6. **Raw machine output leaks to users** — `api_429`/`network_error` with no i18n, raw backend error
   detail in prod, and a stale "paste a valid Telegram link" message on every WhatsApp send failure.

The cheapest high-impact wins are almost all string/config fixes; the strategic bets are bulk guest
import, real WhatsApp Business API outbound, and a payment-status + analytics layer.

---

## What's genuinely good (so the rest is in context)

- A polished, fully bilingual (AR/HE) RTL editorial marketing site with hero, two service tiers,
  pricing cards, a process timeline, an animated phone mockup, FAQ accordion, and footer.
- `ConfirmationForm` / `InviteForm` have clear required markers, inline validation, disabled-until-valid
  submit, and well-differentiated terminal states (loading / invalid / expired / used / done).
- Thoughtful guest location capture: GPS + draggable Leaflet picker, graceful decline, accuracy in meters.
- A feature-rich, tasteful digital invitation: envelope intro, flip countdown, gallery lightbox,
  guestbook carousel, gift/IBAN, RSVP with companions/meal/song, confetti.
- A privacy-forward face-photo finder: explicit biometric consent listing exactly what is stored
  (a numeric signature, not the image), a TTL auto-delete date, and in-page delete/rescan.
- Strong backend security spine: server-only `WEB_API_KEY`, enumeration-resistant login, two-layer
  login lockout, fail-closed CORS, 128-bit one-shot tokens, default-deny rules, HSTS/CSP headers.
- Reduced-motion respected; lazy-loading of face-api models and the photos route.

---

## Prioritized roadmap (ranked, deduped across all dimensions)

Quick high-impact wins first (most are string/config), then strategic bets.

| # | Item | Effort | Impact |
|---|------|--------|--------|
| 1 | Replace stale "paste a valid Telegram link" error on the WhatsApp send path (`share_invalid`) | S | High |
| 2 | Add a localized `api_*`/`network_error` mapping layer so error codes stop leaking to users | M | High |
| 3 | Fix proof-photo display bug on the groom handwritten dashboard (one-line `data:image` drift) | S | High |
| 4 | Stop selling messaging the product can't deliver (remove reminder + "emergency message" promises) | S | High |
| 5 | Add a real contact channel + lead capture to the marketing site | S | High |
| 6 | Implement (or correct the copy of) the published 30-day guest-PII auto-deletion promise | M | High |
| 7 | Stop leaking raw backend error detail in prod (`safeDetail` + set `NODE_ENV=production`) | S | High |
| 8 | Explain (and partly restore) groom invite-sending; add a first-run checklist | M | High |
| 9 | Add structured non-delivery outcomes for drivers (no-answer/wrong-address/refused) + undo | M | High |
| 10 | Build bulk guest import (CSV / paste / contact picker) | L | High |
| 11 | Move outbound to WhatsApp Business/Cloud API + a scheduler (reminders, receipts, scale) | XL | High |
| 12 | Add an admin overview dashboard + an audit-log reader | L | High |
| 13 | Add a payment-status / plan layer and instrument core business data | M | High |
| 14 | Add a growth loop on the digital invitation ("Made with Dawa" + referral) | M | High |
| 15 | Load Hebrew fonts globally; fix mixed AR+HE driver button; accessibility basics | M | Medium |

### Quick-win batch (≈ half a day, items 1–7)

1. **`share_invalid` rewrite** — `frontend/src/i18n/ar.js:172` + `he.js:172` still say "paste a valid
   Telegram link"; it's the active fallback fired ~10× in `usePortalSendInvites.js`. Rewrite to
   WhatsApp/phone-specific copy; ideally split into distinct keys (invalid-phone vs mint-failure).
2. **Error mapping layer** — add `apiErrorToMessage(code, t)` mapping transport codes
   (`api_429`, `network_error`, `request_timeout`, `session_expired`) **and** backend domain codes
   (`cannot_self_delete`, `design_not_approved`, `duplicate_phone`, `token_expired`) to localized
   AR/HE strings; route every catch through it instead of `e?.message`.
3. **Proof-photo predicate** — replace the `data:image`-only check in `GroomDashboard.jsx:140` with
   the `GroomProofs.jsx:31` predicate (`data:image` OR `https?://`); extract a shared
   `isProofImage()` so they can't drift again.
4. **Honest copy** — remove/soften the reminder sentence (`InviteRsvp.jsx:100-101`) and the
   "automatic emergency message" marketing claims (`ar.js:29,44,60,120`) until a real send pipeline exists.
5. **Contact + lead capture** — add a `wa.me/<operator number>` CTA on the hero, pricing cards, and
   footer; make footer ✉/📱 real `mailto:`/`tel:`/`wa.me` links; add a lead form writing to `/leads`.
6. **30-day deletion** — fastest honest fix: change the policy copy to actual behavior. Proper fix:
   an `onSchedule` function deleting guest PII at `weddingDate + 30 days`; add a reachable
   privacy/data-deletion contact.
7. **Stop error leakage** — replace `detail: errorMessage(err)` with `safeDetail(err)` (or drop
   `detail` on public endpoints) and set `NODE_ENV=production` so the digital guard actually fires;
   add a unit test asserting public 500s carry no `detail`.

---

## 1. What should be added / missing features

### Critical / high

- **No bulk guest import anywhere.** Both add-guest flows (`GroomAddGuest`, `DigitalAddGuest`) are
  strictly one-guest-at-a-time. A real Arab/Israeli wedding has 200–600 guests; hand-typing each
  name + 9/10-digit phone + ranks on a phone is the single largest workload in the product and the
  #1 abandonment driver — and it throttles the whole operator funnel (no list → nothing to send).
  *Verified absent via grep `FileReader|.csv|xlsx|navigator.contacts|vcard` in `pages/portal/groom`.*
  **Fix:** a "bulk add" textarea (`Name, Phone` lines) + CSV/Excel upload, parsed client-side,
  validated row-by-row (reuse the 2-word-name + 9-digit + dedup rules), editable preview, one batched
  POST. Phase 2: Web Contact Picker on mobile. *(L / High)*
- **No RSVP reminders / follow-ups / re-send,** and the RSVP success screen explicitly promises a
  reminder the backend can't send (`InviteRsvp.jsx:100-101`; no `onSchedule|cron|reminder` in
  backend). **Fix:** remove the promise now; later add an `onSchedule` job + a "remind all
  non-responders" batch. *(L / High)*
- **No attendance rollup on the handwritten dashboard.** `GroomDashboard.jsx:34-49` shows delivery
  tiles only (total/delivered/enroute/pending) — never confirmed/declined/no-reply, the number a
  groom needs for catering. `usePortalState` already computes `confirmed` but the handwritten dash
  never surfaces it; the digital dashboard *does*, so the two halves are inconsistent. *(M / High)*
- **Guest can't view or change an RSVP after submitting.** All flows are one-shot (`usedAt` →
  terminal screen, `InviteForm.jsx:136-145`); no self-correct, no admin "reset this guest's link"
  shortcut. **Fix:** allow re-open/edit until a configurable cutoff, or at least a read-only echo +
  an admin reset action. *(M / High)*
- **Driver cannot report a failed delivery.** Delivery is binary; `enroute` exists in the data model
  and even has a dashboard tile + pin color but **no driver action ever writes it** (read-only dead
  data, `status.js`; only `markDelivered` mutates status). The only failure channel is a free-text
  note that saves only if the guest is *also* marked delivered. A groom can't distinguish a real
  delivery from a driver who gave up and cleared the row. **Fix:** structured outcomes (delivered /
  no-answer / wrong-address / refused / reschedule) savable independently, surfaced to groom+admin;
  wire or remove `enroute`; add an undo. *(M / High)*

### Medium / later

- **Calendar (.ics) + share exist only for digital guests, behind an optional toggle.** Paper-invite
  guests get a dead-end thank-you with no date/venue/calendar; `.ics` lives only in the optional
  `FloatingDock`. **Fix:** promote add-to-calendar + share to an always-rendered block on every
  success screen; offer Google/Outlook URLs, not just a downloaded file. *(M / Medium)*
- **No data export (CSV/PDF)** of guest list, RSVPs, or delivery report for the caterer/hall. *(S / Medium)*
- **No QR / venue check-in** — token infra already exists; high perceived value, modest build, strong
  upsell. *(L / Medium)*
- **Segmentation is half-built** — `ranks`/`inviteType` can be labelled but drive no
  sending/reporting; no "groom's side vs bride's side." *(M / Medium)*
- **No table/seating, no gift registry (IBAN-only), no multi-event** (henna/engagement/reception). *(XL / Low)*

---

## 2. What's unclear for the normal user (UX clarity)

- **Stale Telegram error on WhatsApp sends (high).** `share_invalid` (`ar.js:172`) says "paste a
  valid Telegram link," fired ~10× in `usePortalSendInvites.js` on any bad phone / mint failure.
- **Raw English error codes leak to AR/HE users (high).** `apiClient` throws `api_429`,
  `network_error`, etc. (`apiClient.js:340,343,366`); handlers do `showToast(e.message || fallback)`
  and the raw code (truthy) wins over the localized fallback. A rate-limited groom literally sees `api_429`.
- **Groom has no Send button and nothing explains why (high).** Sending is admin-only; the groom has
  no send/copy/preview affordance, only a read-only "✓ sent" badge after the admin acts
  (`GroomGuests.jsx:151`, `DigitalGuests.jsx`). Most likely source of confused support calls.
- **RSVP promises a reminder that never comes (high)** — `InviteRsvp.jsx:100-101`.
- **Marketing CTAs say "contact to book" but there's no contact method (high)** — all route to login
  (`LandingPage.jsx:1079-1082`, footer glyphs scroll to top).
- **Mixed Arabic+Hebrew button for the Hebrew driver (medium):** `ابدأ שיתוף מיקום`
  (`DriverShareLocation.jsx:143`).
- **No first-run onboarding (medium).** New groom lands on 0-tiles; design rejection is invisible
  until they re-open the tab and the poll resolves.
- **Bare `...` loaders read as "frozen" on slow networks (medium):** `InviteForm.jsx:112`, while
  `DigitalInvitationPage` uses a proper spinner — inconsistent.
- **Confirm form never validates the groom username (medium):** a typo'd link wastes the whole form;
  no couple name shown for reassurance (`ConfirmationForm.jsx:18-110`).
- **Fake venue "map" (medium):** decorative SVG + a single Google Maps text link, no embed, no Waze
  (`InviteVenue.jsx`).
- **Face-finder is a steep ask (medium):** consent + model download + camera + timed two-turn
  liveness (20s/step), with no non-biometric browse fallback (`DigitalYourPhotos.jsx`).
- **Ranks dead-end on add-guest (low):** "add them on the main page" with no link; wedding date set in
  two conflicting places (dashboard vs per-design).

---

## 3. How easy is communication between us and the user

This is the weakest area of the product, in both directions.

- **Us → user: nothing automated.** No email, SMS, push, FCM, in-app bell/inbox, or server-side
  WhatsApp (all verified absent via grep). Design approved/rejected, RSVP received, delivery made,
  invite sent — none notify anyone; the relevant party only finds out by re-opening and polling. A
  rejected design silently blocks all invites with no alert.
- **User → us: no inbound channel at all.** No help/contact/support link anywhere in the portals,
  forms, Terms, or login. The Terms page says "contact us via WhatsApp" but renders no number
  (`ar.js:504`, `TermsPage.jsx`). A confused user cannot reach a human inside the product.
- **Password recovery removed.** Self-service reset was taken out of login; admin resets manually —
  a locked-out groom has no way to even ask.
- **The only outbound is manual + un-instrumented.** The admin opens `wa.me` tabs one guest at a
  time; `window.open` results are never checked (`usePortalSendInvites.js:53,78,92`,
  `AdminSendTab.jsx:79-90`), so popup-blocked sends silently drop and "sent" just means "a tab was
  opened." `inviteLinkSentAt` records intent, not delivery.
- **Drivers are one-way.** They can only mark delivered; no channel to report wrong-address/no-answer
  back to groom/admin (the call button targets the GUEST).

**Recommended path:** short-term, add a click-to-WhatsApp contact + Help link across portals/forms/
Terms/login and re-introduce self-service password reset; strategically, adopt the **WhatsApp
Business / Cloud API** for server-side send. That one investment unblocks delivery/read receipts,
automated reminders, the "emergency broadcast" already advertised, and operator scale, and makes the
core funnel metric (send → open → RSVP) measurable.

---

## 4. Other things you should know

### Trust / privacy / legal (high stakes — biometrics + guest PII + Israeli market)

- **Broken legal promise (critical):** the privacy policy cites Israeli Privacy Protection Law 1981
  and promises all guest names/phones/addresses auto-deleted within 30 days of the event
  (`ar.js:519-521`). **Nothing auto-deletes guest PII** — only a 90-day token TTL (keyed to mint
  time, not event date) and a face-descriptor TTL exist. Implement it (`onSchedule` per groom at
  `weddingDate + 30 days`) or change the copy to match reality.
- **Raw backend error detail leaks in prod (high):** every non-digital route returns
  `detail: errorMessage(err)` on 500s (confirmations, invites, users, photoFaces, …); the digital
  `safeDetail()` guard only suppresses when `NODE_ENV === 'production'`, which is **never set**
  (`project.ts:91`; absent from `firebase.json`/`.env`/`index.ts`). Admin-SDK errors embed Firestore
  paths + GCS bucket names, exposed on public endpoints.
- **No privacy/consent link on any PII-collection form (high)** — including the biometric face-scan
  consent screen (`ConfirmationForm`, `InviteForm`, `InviteRsvp`, `DigitalYourPhotos:406-447`).
- **In-memory rate limits + login lockout (high):** single-process Maps (`rateLimit.ts`), bypassable
  across cold starts / concurrent instances; the per-account credential-stuffing lockout is the real
  casualty. **Fix:** back the limiter + failure counter with Firestore-TTL or Memorystore.
- **Audit log is write-only (medium):** no read/export endpoint or UI; grows unbounded (`audit.ts`).
- **Published photographer photos are world-readable by `groomUid` (medium):** `storage.rules:40-48`
  — gated by 28-char UID obscurity + a boolean, not by token auth, for guest-face media.
- **Guest name baked into a publicly CDN-cached OG image (medium):** `digitalOgImage.ts:135`,
  `firebase.json` `/og/**` cache `s-maxage=259200`.
- **Confirm form allows groom-username enumeration (medium):** distinct 404 vs 200
  (`confirmations.ts:175-178`).
- **Driver self-assignment (medium):** self-service-in, never-out; typing a username grants full
  guest-PII access with no admin approval and no DELETE/revocation route (`assignments.ts`).
- **Terms says "contact via WhatsApp" with no number (low)** — no data-subject-rights channel exists.

### Reliability / bugs that hit real users

- **Proof photos never display on the groom dashboard (high):** `GroomDashboard.jsx:140` only accepts
  `data:image`, but proofs are now `https://` Storage URLs; `GroomProofs.jsx:30-31` does it right → drift.
- **Driver loses the proof photo on a failed upload (high):** the form state is cleared
  (`usePortalState.js:467-472`) before the async upload resolves (`:439-460`); no retry queue, no
  offline persistence — a real field failure in patchy-coverage villages.
- **Live GPS silently freezes when the screen locks (high):** no wake-lock / `visibilitychange`
  (`useGeolocation.js:97-128`); stale fixes are dropped so the groom's pin just vanishes (`:186`)
  with no "offline / last-seen" signal; also drains battery (highAccuracy + 1s writes, no auto-stop).
- **Confirm form IP-limited at 5/hr with no venue-NAT backstop (medium):** a hall full of guests on
  shared Wi-Fi gets blocked — the exact problem the photo endpoints already mitigate, not applied here
  (`confirmations.ts:161`, `rateLimits.ts:35-40`).
- **Bulk "send to all" drops popup-blocked windows silently (medium)** and uses the manual-mode
  template even in digital mode (`usePortalSendInvites.js`).
- **Stale `adminSettings` RTDB rules (medium):** `mode`/`digitalBaseUrl`/`digitalMessage` are
  forbidden by `$other:false` (`database.rules.json:143-145`); survives only because the Admin SDK
  bypasses rules — latent landmine.
- **Admin self-delete button still ungated client-side (low):** backend blocks it
  (`cannot_self_delete`), so it degrades to a confusing raw toast, not a lockout.
- **Proof-compression drift (low):** `SharedCities.jsx:407-412` skips the compression
  `DriverDeliveryList.jsx:377` applies.

### Mobile / accessibility / i18n

- **Hebrew fonts never load outside the invitation (high):** the global import loads only Arabic
  families and ~30 headers hard-code Amiri; Hebrew falls back to OS serif on login/landing/forms/portal.
- **69 inline language ternaries bypass i18n (high):** not parity-checked; source of the
  mixed-language driver button (`DriverShareLocation.jsx:143`).
- **Interactive a11y basics fail (high):** clickable `div`s with no role/keyboard
  (`InviteGallery.jsx:23`), aria-hidden 7px carousel dots (`InviteGuestbook.jsx:90-93`), no `main`
  landmark or skip-link, no axe-core in e2e.
- **Medium:** `C.dim` #7a6a4a contrast 3.82:1 (under AA, used 132×), no PWA/offline/installability,
  14–15px inputs trigger iOS auto-zoom, ellipsis loaders, physical (not logical) CSS props, English
  `.ics` fallback.

### Business / PM

- **No monetization layer (high):** paid tiers (2,500 / 3,500 ILS) but zero billing/plan/payment
  status; the groom record is only `{username, role, displayName, createdAt, createdBy, phoneE164}`
  (`users.ts:244-251`). The product doesn't know its own revenue. **Fix:** add
  `{paymentStatus, plan, amountIls, paidAt}` editable in the admin user editor + a paid/unpaid badge;
  later gate "send to all" on payment. No gateway needed initially.
- **Marketing funnel dead-ends + no lead capture (high)** — `LandingPage.jsx:1079-1082`.
- **Zero analytics / funnel / conversion tracking (high):** no client analytics AND no server-side
  "invite opened" counter, so RSVP conversion is unmeasurable. **Fix:** add a privacy-respecting tag
  on the landing page + a server-side `openedAt`/`openCount` write on first token read.
- **Operator doesn't scale (high):** sole manual sender, no overview dashboard (5 admin tabs, none a
  dashboard). Ceiling ~20–30 weddings. **Fix:** an admin overview (per-groom guests/sent/opened/
  confirmed/delivered + global weekly send + RSVP rate) and scoped groom self-send.
- **Outbound un-instrumented (high):** "sent" = tab opened; no delivered/read/conversion signal.
- **Pricing hardcoded in i18n (medium):** every price change is a code deploy; no promo/coupon.
  **Fix:** move prices into `adminSettings`.
- **No growth loop (medium):** the digital invite reaches 100–600 in-market guests and captures none.
  **Fix:** an on-brand "Made with Dawa — create yours" footer credit + referral param + groom referral
  incentive.
- **Activation gap (high):** no onboarding; the admin-sends model is never explained → confused groom
  + manual support load that caps operator scale.
- **Differentiators unmeasured (low):** no delivery-success rate, no face-match success count, no
  usage data — can't show "98% delivered" social proof to justify the premium price.

---

## What this audit did NOT cover (follow-ups)

- **No real-device / Playwright MCP browser testing** — iOS auto-zoom, the face-finder liveness on
  older Android, WhatsApp popup-blocking, and the GPS screen-lock freeze all need on-device verification.
- **No load/scale testing** despite the `loadtest/` Locust suite — list virtualization, SSE pressure
  on the 512MiB instance, per-keystroke settings writes, in-memory limiter under autoscale.
- **Backend was read, not executed** — biometric erasure, one-shot token rollback, and designSnapshot
  version-locking should be confirmed by exercising endpoints.
- **Rules-vs-code parity sampled, not exhaustively diffed** (the stale `adminSettings` rule was caught).
- **Native-speaker AR/HE linguistic / tone review** not done (key parity 386/386 verified).
- **Cost/quota exposure** not quantified (face-api cold starts, per-paint geocoding, the SSE function,
  unbounded `/audit`).
- **Test-suite / CI health** and **competitive / market validation** not assessed.

## Things to downweight (overstated / already-fixed)

- The 3 prior "critical" QA bugs are **FIXED** in current source — do not re-count.
- Admin self-delete: backend blocks it; impact is a confusing toast, not a lockout (low, not critical).
- Photographer world-readable photos + OG-image PII: real but gated by 28-char UIDs / 128-bit tokens —
  treat as medium, not critical.
- "~20–30 weddings" is a reasonable engineering estimate, not a measured throughput figure.
- The no-payments / no-analytics / no-growth findings recur per-lens but are one business-layer gap —
  don't triple-count.

---

*Generated 2026-06-13 via a 14-agent grounded audit workflow. No code was changed.*
