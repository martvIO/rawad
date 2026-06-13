# Product Audit — 2026-06-13

A full product / UX / engineering audit of [[Dawa]], run as a 14-agent workflow (6 surface
mappers → 7 dimension analysts → 1 synthesizer), all findings grounded in current source.
Lens: senior full-stack engineer + product manager + the operator who has to talk to real
(non-technical, Arabic/Hebrew-speaking, mobile) users.

Related: [[Known Bugs]] · [[Tasks Backlog]] · [[Security Model]] · [[Digital Invitations]]
· [[Face Matching]] · [[User Roles]] · [[Authentication]] · the prior `qa-audit-2026-05-28.md`.

---

## Executive summary

Dawa is a genuinely polished, deeply-built product with a strong technical spine (server-mediated
auth, default-deny rules, append-only audit log, 128-bit one-shot tokens, a privacy-forward
biometric face-finder, warm dialect-aware AR/HE RTL copy). **All three "critical" bugs from the
2026-05-28 QA audit are confirmed FIXED** in current source (driver Continue button,
design-requests 500, settings PATCH 400).

But the platform is **structurally incomplete as a business**:

1. **No proactive communication channel of any kind** — no email, SMS, push, in-app inbox, or
   server-side WhatsApp. Every status change is invisible until the user manually re-opens and
   polls the portal. This single gap underlies the broken reminder promise, the operator-scale
   ceiling, the invisible design-rejection problem, and the lack of delivery instrumentation.
2. **The product promises things it cannot deliver** — the RSVP screen guarantees "a reminder a
   week before," the landing page sells an "automatic emergency message" (×4), the privacy policy
   promises 30-day PII auto-deletion. None have any backing implementation. Trust + legal liability.
3. **The business is blind to itself** — no payments/plan layer, no analytics/funnel, no
   lead capture, no growth loop, no overview dashboard, no audit reader.
4. **The top of funnel is broken** — every "contact to book" CTA dead-ends at a login screen.
5. **The operator is the bottleneck by design** — one admin manually opens a wa.me tab and presses
   Send for every single guest; grooms can't self-send and aren't told why. Realistic ceiling
   ~20–30 active weddings, not 100.
6. **Raw machine output leaks to users** — `api_429`/`network_error` with no i18n, raw backend
   error detail, and a stale "paste a valid Telegram link" message on every WhatsApp send failure.

The cheapest high-impact wins are almost all string/config fixes; the strategic bets are bulk
guest import, real WhatsApp Business API outbound, and a payment-status + analytics layer.

---

## Prioritized roadmap (ranked, deduped across all dimensions)

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

---

## 1. What should be added / missing features

- **Bulk guest import (critical).** Both add-guest flows are one-at-a-time. A 200–600-guest list
  hand-typed on a phone is the #1 abandonment driver. No CSV/paste/contact-picker exists
  (`GroomAddGuest.jsx`, `DigitalAddGuest.jsx`).
- **RSVP reminders / follow-ups (high).** No scheduler anywhere, yet the RSVP screen promises a
  reminder. No "remind all non-responders" batch.
- **Groom RSVP rollup (high).** Handwritten `GroomDashboard.jsx` shows delivery counts only, never
  confirmed/declined/no-reply — the number a groom needs for catering. The digital dashboard does
  show it, so the two halves are inconsistent.
- **Guest can't view/edit an RSVP after submitting (high).** All flows are one-shot; no self-correct,
  no "reset this guest's link" admin shortcut.
- **Driver non-delivery outcomes (high).** Delivery is binary; `enroute` is read-only dead data.
  A groom can't distinguish a real delivery from a driver who gave up and faked it.
- **Calendar/share for paper-invite guests (medium).** `.ics`/share live only inside the optional
  digital footer dock; paper-confirm success screens are a dead-end with no date/venue/calendar.
- **Data export (medium).** No CSV/PDF of guest list, RSVPs, or delivery report for the caterer/hall.
- **QR / venue check-in (medium).** Token infra already exists; check-in is a natural premium upsell.
- **Actionable segmentation (medium).** `ranks`/`inviteType` are labelable but drive no
  sending/reporting; no "side" (groom's vs bride's family).
- **Later tier (low):** table/seating, gift registry (today IBAN-only), multi-event (henna/engagement).

## 2. What's unclear for the normal user (UX clarity)

- **Stale Telegram error on WhatsApp sends (high).** `share_invalid` (`ar.js:172`) still says "paste
  a valid Telegram link," fired ~10× in `usePortalSendInvites.js` on any bad phone / mint failure.
- **Raw English error codes leak to AR/HE users (high).** `apiClient` throws `api_429`,
  `network_error`, etc.; handlers do `showToast(e.message || fallback)` and the raw code wins.
- **Groom has no Send button and nothing explains why (high).** Sending is admin-only; the groom
  has no send/copy/preview affordance, only a read-only "✓ sent" badge after the admin acts.
- **RSVP promises a reminder that never comes (high).** `InviteRsvp.jsx:100-101`.
- **Marketing CTAs say "contact to book" but there's no contact method (high).** All route to login.
- **Mixed Arabic+Hebrew button for the Hebrew driver (medium):** `ابدأ שיתוף מיקום`
  (`DriverShareLocation.jsx:143`).
- **No first-run onboarding (medium).** New groom lands on 0-tiles with no "what do I do first";
  design rejection is invisible until they re-open the tab.
- **Bare `...` loaders read as "frozen" (medium)** on slow networks (`InviteForm.jsx:112`).
- **Confirm form never validates the groom username (medium):** a typo'd link wastes the whole form;
  no groom/couple name shown for reassurance.
- **Fake venue "map" (medium):** decorative SVG + a single Google Maps text link, no embed, no Waze.
- **Face-finder is a steep ask (medium):** consent + model download + camera + timed two-turn
  liveness, with no non-biometric browse fallback.

## 3. How easy is communication between us and the user

This is the weakest area of the whole product.

- **Us → user: essentially nothing automated.** No email, SMS, push, FCM, in-app bell/inbox, or
  server-side WhatsApp (all verified absent). Design approved/rejected, RSVP received, delivery made,
  invite sent — none notify anyone; the relevant party only finds out by re-opening and polling (~15s).
  A rejected design silently blocks all invites with no alert.
- **User → us: no inbound channel at all.** No help/contact/support link anywhere in the portals,
  forms, Terms, or login. The Terms page literally says "contact us via WhatsApp" but renders no
  number. A confused user cannot reach a human inside the product.
- **Password recovery removed.** Self-service reset was taken out of login; admin resets manually —
  but a locked-out groom has no way to even ask.
- **The only outbound is manual and un-instrumented.** The admin opens wa.me tabs one guest at a
  time; `window.open` results are never checked, so popup-blocked sends silently drop and the
  platform never learns if a message was sent/delivered/read. "Sent" just means "a tab was opened."
- **Drivers are one-way.** They can only mark delivered; no channel to report wrong-address/no-answer
  back to groom/admin (the call button targets the GUEST, not the operator).

## 4. Other things you should know

### Trust / privacy / legal (high stakes — biometrics + guest PII + Israeli market)
- **Broken legal promise (critical):** the privacy policy cites Israeli Privacy Protection Law 1981
  and promises all guest PII auto-deleted within 30 days of the event. Nothing auto-deletes guest
  PII (only a 90-day token TTL keyed to mint time and a face-descriptor TTL). Implement it or fix the copy.
- **Raw backend error detail leaks in prod (high):** every non-digital route returns
  `detail: errorMessage(err)`; the digital `safeDetail()` guard is inert because `NODE_ENV` is never
  set to `production`. Admin-SDK errors embed Firestore paths + bucket names, on public endpoints.
- **No privacy/consent link on any PII-collection form (high)** — including the biometric consent screen.
- **In-memory rate limits + login lockout (high):** per-instance Maps, bypassable across cold
  starts / concurrent instances; the per-account credential-stuffing lockout is the real casualty.
- **Audit log is write-only (medium):** no read/export endpoint or UI; grows unbounded.
- **Published photographer photos are world-readable by groomUid (medium):** gated by obscurity, not auth.
- **Guest name baked into a publicly CDN-cached OG image (medium).**
- **Driver self-assignment (medium):** self-service-in, never-out; grants full guest-PII access by
  knowing a username, with no admin approval and no revocation endpoint.

### Reliability / bugs
- **Proof photos never display on the groom dashboard (high):** `GroomDashboard.jsx:140` only accepts
  `data:image`, but proofs are now `https://` Storage URLs. `GroomProofs.jsx` does it right → drift.
- **Driver loses the proof photo on a failed upload (high):** form state is cleared before the async
  upload resolves; no retry queue / offline persistence. Real failure mode in patchy-coverage villages.
- **Live GPS silently freezes when the screen locks (high):** no wake-lock / visibilitychange; the
  groom's pin just vanishes (stale fixes dropped) with no "offline/last-seen" signal; battery drain.
- **Confirm form IP-limited at 5/hr with no venue-NAT backstop (medium):** a hall full of guests on
  shared Wi-Fi gets blocked — the exact problem the photo endpoints already mitigate, not applied here.
- **Bulk "send to all" drops popup-blocked windows silently (medium)** and uses the manual-mode
  template even in digital mode.
- **Stale `adminSettings` RTDB rules (medium):** `mode`/`digitalBaseUrl`/`digitalMessage` are
  forbidden by `$other:false`; survives only because the Admin SDK bypasses rules — latent landmine.
- **Admin self-delete button still ungated client-side (low):** backend blocks it, so it degrades to
  a confusing raw error, not a lockout.
- **Proof-compression drift (low):** `SharedCities` delivery form skips the compression the main
  list applies.

### Mobile / accessibility / i18n
- **Hebrew fonts never load outside the invitation (high):** Hebrew falls back to OS serif on
  login/landing/forms/portal.
- **69 inline language ternaries bypass i18n (high):** not parity-checked; source of the mixed-language
  driver button.
- **Interactive a11y basics fail (high):** clickable divs without roles/keyboard, aria-hidden 7px
  carousel dots, no `main` landmark or skip-link, no axe-core in e2e.
- **Medium:** `C.dim` #7a6a4a contrast 3.82:1 (under AA), no PWA/offline/installability, 14–15px
  inputs trigger iOS auto-zoom, ellipsis loaders, physical CSS props, English `.ics` fallback.

### Business / PM
- **No monetization layer (high):** paid tiers (2,500 / 3,500 ILS) but zero billing/plan/payment-status;
  the product doesn't know its own revenue.
- **Marketing funnel dead-ends + no lead capture (high).**
- **Zero analytics / funnel / conversion tracking (high):** no client analytics AND no server-side
  "invite opened" counter, so RSVP conversion is unmeasurable.
- **Operator doesn't scale (high):** sole manual sender, no overview dashboard. Ceiling ~20–30 weddings.
- **Outbound un-instrumented (high):** "sent" = tab opened; no delivered/read/conversion signal.
- **Pricing hardcoded in i18n (medium):** every price change is a code deploy; no promo/coupon.
- **No growth loop (medium):** the digital invite reaches 100–600 in-market guests and captures none.
- **Activation gap (high):** no onboarding; the admin-sends model is never explained.
- **Differentiators unmeasured (low):** can't prove delivery rate / face-match success to justify premium.

---

## What this audit did NOT cover (follow-ups)
- No real-device / Playwright MCP browser testing (iOS auto-zoom, face-finder on old Android,
  WhatsApp popup-blocking, GPS screen-lock freeze all need on-device verification).
- No load/scale testing despite the `loadtest/` Locust suite (list virtualization, SSE pressure,
  in-memory limiter under autoscale).
- Backend was read, not executed (biometric erasure, token rollback, designSnapshot locking).
- Rules-vs-code parity sampled, not exhaustively diffed.
- Native-speaker AR/HE linguistic/tone review.
- Cost/quota exposure (face-api cold starts, per-paint geocoding, SSE function, unbounded `/audit`).
- Test-suite/CI health and competitive/market validation.

## Things to downweight (overstated / already-fixed)
- The 3 prior "critical" QA bugs are FIXED — do not re-count.
- Admin self-delete: backend blocks it; impact is a confusing toast, not a lockout (low, not critical).
- Photographer world-readable photos + OG-image PII: real but gated by 28-char UIDs / 128-bit tokens —
  medium, not critical.
- "~20–30 weddings" is a reasonable estimate, not a measured throughput figure.
- The no-payments/no-analytics/no-growth findings recur per-lens — same small business-layer gap,
  don't triple-count.
