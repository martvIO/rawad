# Wiki Log

Chronological, append-only record of everything that's happened in this wiki.

**Format:**
```
## [YYYY-MM-DD HH:MM] <type> | <title>
<optional detail line>
```

**Types:** `session`, `ingest`, `query`, `lint`, `rebuild`

**Quick access:** `grep "^## \[" log.md | tail -5` gives you the last 5 entries.

---

## [2026-05-26 17:35] ingest | Dawa project docs (initial wiki build)
Touched: Dawa, User Roles, REST API Architecture, Authentication, Polling and Realtime, Data Storage Model, Security Model, Digital Invitations, Optimistic UI Pattern, Inline Styling Convention, API Contracts, Architecture Decisions, Known Bugs, Tasks Backlog, AI Engineering Rules

## [2026-05-28] session | Full Playwright QA audit of live production app
Touched: none (new report file qa-audit-2026-05-28.md written to repo root; project memory saved)

## [2026-05-28 07:03] session | Add SessionStart hook for wiki-brain
Touched: none (config/hook setup, not a wiki page change)

## [2026-05-28 16:05] session | Self-serve digital design editor + approval gate
Touched: Digital Invitations, API Contracts, Architecture Decisions, Tasks Backlog

## [2026-05-28 16:45] session | Implement luxury digital-invitation design + full groom customization
Touched: Digital Invitations. Rebuilt DigitalInvitationView as the multi-section editorial microsite from the dawa-design-system handoff bundle (envelope → hero → story timeline → gallery+lightbox → details → venue+map+hotels → countdown → enhanced RSVP → guestbook → footer → dock), scoped under .dawa-inv, theme-token driven. Expanded DigitalDesignEditor so the groom edits every field (new src/data/digitalInviteDefaults.js + "fill sample" button + per-section toggles). Backend: new fields/validation in digital.ts sanitizeMediaSettings + DESIGN_FIELDS + design-list; RSVP headcount/meal/song + full designSnapshot in invites.ts. Public design browser-verified via /d demo route; editor build-verified (auth-gated).

## [2026-05-28 17:10] session | Add companions count to both invite types
Touched: Digital Invitations. Unified `companions` field (people attending besides the invited guest, 0–20, default 0) on digital + physical RSVP. Reframed the just-added digital `headcount`→`companions` (renamed toggle rsvpHeadcountEnabled→rsvpCompanionsEnabled). Backend: invites.ts (digital + physical submit/patch/mirror), confirmations.ts (open form + auto-attach), database.rules.json (guestsByGroom + confirmations validate, both had $other:false). Frontend: digital RSVP stepper (default 0, functional updaters for rapid taps), new shared src/components/CompanionsStepper.jsx on ConfirmationForm + InviteForm, conf_form_companions i18n key. Groom display: per-guest +N badges (DigitalGuests, GroomGuests) + "expected attendees" totals (DigitalDashboard, usePortalState→GroomDashboard) + admin AdminConfirmationsTab. Digital companions stepper browser-verified; physical write path needs RTDB rules deployed/emulated to accept the new field.

## [2026-05-28 21:10] session | Western digits across website + database
Touched: Digit Normalization (new). Standardized on Western ASCII digits everywhere. New src/utils/digits.js (toWesternDigits + westernizeDeep, preserves password keys); apiClient scrubs every request body so DB only stores Western digits; PhoneInput normalizes typed Arabic-Indic digits (its \D strip otherwise drops them). Added numberingSystem:"latn" to 9 Arabic-locale toLocale* date/time sites (keeps Arabic month names, Western digits — verified via Node ICU). Converted literal Arabic-Indic digits in sample/default content (digitalInviteDefaults.js, DigitalInvitationPage demo, DigitalDesignEditor placeholders). New scripts/migrate-arabic-digits.cjs (npm run migrate:digits) walks RTDB+Firestore, dry-run+emulator by default, --commit/--prod to write; NOT yet run against prod (user runs it). Unit tests in src/__tests__/utils/digits.test.js (all green); build passes. Browser verify skipped — Playwright MCP browser was locked by another session.

## [2026-05-29 16:05] session | Bilingual invitation content + RSVP/headcount/phone + groom-send lockout + RTL number alignment
Touched: Digital Invitations. Six-feature build from the translated/enhanced prompt. (1) Prominent guest name in the digital hero greeting (`.dawa-inv-greet strong` → block, clamp(30–46px), weight 900, gradient). (2) **Bilingual groom content**: new `src/utils/localize.js` (localize/localizeItems/localizeList/hasContent); `DigitalInvitationView` renders every text field via localize; new guest AR/HE `LangToggle` wired to app lang/setLang; `DigitalDesignEditor` got an editLang tab + leaf/setLeaf so each text input/array-leaf edits one language; backend `digital.ts` `sanitizeMediaSettings` accepts `{ar,he}` via `clampLocalized` (types widened to `Localized`); demo route now bilingual. (3) **Total headcount** incl. guest (min 1) — UI tracks partySize, still stores `companions = partySize−1` (no backend/rules change); `CompanionsStepper` + ConfirmationForm + InviteForm + digital RSVP; `conf_form_companions` reworded. (4) **Required editable phone** on digital RSVP — `submittedPhone` added to `/invites/digital/submit` (normalisePhone-validated, stored as guest phone). (5) **Groom WhatsApp send removed** — deleted GroomGuests send button; admin-only. (6) **RTL number alignment** — new `src/components/Num.jsx` (`<bdi dir=ltr>` isolate), 45 wraps across guest pages + portals (sub-agent sweep). Verified: frontend + functions builds pass; unit tests 416 pass (+8 new localize tests; 2 pre-existing apiClient/buildApiUrl env failures unrelated); Playwright smoke of the demo invitation (name 46px, AR↔HE switches all content, total-headcount label + min 1, required-phone block) and the confirmation form. NOT yet committed/deployed.
