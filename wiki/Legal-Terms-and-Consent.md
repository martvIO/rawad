# Legal, Terms & Consent

How دعوة (Dawa) surfaces its legal terms and captures guest consent at the point
of PII collection. See also [[Data Storage Model]], [[Security Model]],
[[Digital Invitations]].

## Terms & Privacy page (`/terms`)

Bilingual (Arabic + Hebrew), sourced from `shared/src/i18n/ar.js` / `he.js`.
As of **2026-07-06** it holds **14 Terms sections + 5 Privacy sections** after
five legal clauses were added and each routed to its correct half (Terms vs
Privacy). Jurisdiction is **Haifa-exclusive** (حيفا حصريًّا) — the governing-law /
venue clause names Haifa courts only.

## Consent-at-collection gate (2026-07-06)

Every **public PII-collection form** now requires the guest to actively agree to
the Terms & Privacy before the form will submit — it is no longer a passive
"by submitting you agree…" line below the button.

- **Shared component:** `frontend/src/components/ConsentNotice.jsx` — a required
  checkbox (`data-testid="consent-checkbox"`) whose label links to `/terms` in a
  new tab, plus an error slot (`data-testid="consent-error"`, `role="alert"`).
- **Forms wired:** `ConfirmationForm.jsx` (`/confirm/:groomUsername`) and
  `InviteForm.jsx` (the per-guest manual-invitation link `/invite/:token`). Both
  hold `consent` + `consentErr` state; the submit handler guards with
  `if (!consent) { setConsentErr(true); return; }` **after** the name/phone/city
  validation, so an unchecked box blocks submission before any network call.
- **Placement:** the checkbox sits **directly above** the submit button (was a
  line below it), so the guest reads it before acting.
- **Error copy:** red warning `consent_required` — AR `"يجب الموافقة على الشروط أولاً"`,
  HE `"יש לאשר את התנאים תחילה"`. Ticking the box clears the error immediately.
- **E2E:** `frontend/e2e/pages/InvitationPage.ts` and the `physical-delivery`
  journey now tick the box before submitting (it's mandatory).

Verified live on `https://dawa-aa793.web.app/confirm/test` (2026-07-06): unchecked
submit blocks + shows the red warning; ticking clears it and the submit proceeds
to the server. This is client-side gating (UX/compliance), not a server
enforcement — the backend does not require a consent flag on the payload.
