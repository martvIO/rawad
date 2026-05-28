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
