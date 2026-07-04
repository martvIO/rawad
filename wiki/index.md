# Wiki Index

This is the catalog of every page in your wiki. Claude updates it automatically.

**Pattern:** `- [[Page Name]] — one-line summary`

**Start here:** [[Dawa]] — the project hub linking everything below.

---

## Entities

_(people, places, organizations, products — pages that describe a thing)_

- [[Dawa]] — wedding-invitation management & distribution platform for the Arab/Israeli market (hub page)
- [[User Roles]] — the three portal roles: Admin, Groom, Driver
- [[Competitor Landscape]] — first competitor scan; the digital invite is a commodity, the delivery+proof+photo-finder operation is the moat
- [[Buyer Persona]] — hypothesis persona (organized bride as decider, family as payer); needs validation against real customers

## Concepts

_(ideas, frameworks, patterns, principles — pages that describe a concept)_

- [[REST API Architecture]] — Express-on-Cloud-Functions REST layer; no Firebase SDK on the client
- [[Authentication]] — synthetic email, JWT custom claims, token manager, phone-OTP reset; + generated groom/driver credentials with forced first-login change (2026-07-04)
- [[Polling and Realtime]] — REST polling (15–30s) for most data; SSE for live driver GPS
- [[Security Model]] — three enforced server-side layers + non-authoritative UI guard; + 2026-07-01 monitoring/blocking/validation layer
- [[Password Encryption]] — client RSA-OAEP-encrypts password fields as `enc:v1:` envelopes (defense-in-depth on top of HTTPS); backend middleware decrypts ahead of /auth + /users; LIVE in prod with plaintext rejection enforced, verified E2E 2026-07-03
- [[Digital Invitations]] — the Firestore-backed WhatsApp-link invite flow; guest phone fields reuse the shared PhoneInput (Arabic-digit safe), groom add-guest imports contacts from .vcf/.csv files
- [[Face Matching]] — AWS Rekognition engine: guest "your photos" (camera-only Face Liveness → matches → ZIP) + OTP-gated "People" gallery; auto-send photos on publish; Cognito pool wired (us-east-1); consent + 30-day auto-purge
- [[Optimistic UI Pattern]] — recurring bug class from the polling architecture, and its fix convention
- [[Inline Styling Convention]] — 100% inline styles + `theme.js` tokens, no CSS framework
- [[Visual Design System]] — bespoke design foundation: `theme.js` token scales, the inline-SVG Icon set, hover/press utilities, cold-load splash, favicon; + the 2026-06-20 visual-design refinement pass
- [[Digit Normalization]] — Western ASCII digits everywhere: `numberingSystem: latn` dates, apiClient input scrubbing, DB migration script
- [[List Search and Filter]] — reusable SearchBar + FilterChips + `useListFilter` on every portal list (12 lists); substring + phone-aware + hamza-insensitive
- [[Load-Test Dashboard]] — local-only FastAPI+React control panel for the Locust suite; live SSE metrics, always-on LOADTEST-data cleanup (incl. new admin purge endpoint), archived run history + compare

- [[Payments]] — Lemon Squeezy overlay checkout (admin-minted single-use pay links) + X-Signature-verified order_created webhook for paid groom self-signup
- [[WhatsApp Messaging]] — WhatsApp Cloud API send + Meta webhook + daily scheduled RSVP reminders; + manual-send fallback (copy/open-WhatsApp modal on failed sends, clickable failed pill, persisted "manual" status)
- [[Communication Settings]] — admin contact channels + public /settings/public + landing WhatsApp CTAs
- [[Admin Analytics]] — admin operator command center: server-aggregated GET /admin/analytics + recharts page (composition/revenue/operations/rsvp/designs/triage/trends)
- [[Conversion KPIs]] — North Star (paid weddings/month) + funnel KPIs + weekly cadence; flags the untracked top-of-funnel (WhatsApp-click) gap
- [[Mobile App]] — groom-only Android+iOS Capacitor app (separate `app/` package reusing frontend/); phased roadmap (foundation → push → self-serve signup w/ iOS IAP + Android Lemon Squeezy); Phase 1 built 2026-06-25

## Sources

_(summaries of specific sources you've ingested)_

- [[Data Storage Model]] — RTDB (sharded by groomUid) + Firestore + Storage layout
- [[API Contracts]] — REST resource routers, access levels, error codes
- [[Architecture Decisions]] — index of closed architectural questions and their rationale
- [[Known Bugs]] — resolved bug ledger (mostly digital-upload races)
- [[Tasks Backlog]] — prioritized open work
- [[AI Engineering Rules]] — code/testing/security/workflow rules for contributors

## Analyses

_(synthesized answers to questions you've asked, filed back as pages)_

- [[Product Audit 2026-06-13]] — full product/UX/eng audit; biggest gaps: no proactive comms, broken promises (reminders/30-day-deletion), no payments/analytics, operator-scale ceiling
- [[Audit Remediation 2026]] — implementation of the audit roadmap (Phases 1-13), shipped to production
- [[CRO and IA Audit 2026-06-20]] — conversion/IA audit + shipped fixes (CTA flip to WhatsApp-primary, sample-invite link, social-proof band, AS-FEATURED removed); flags prod WhatsApp number unset
- [[QA Analytics and Ops Hardening 2026-06-20]] — analytics/QA/web-ops audit remediation: shipped DR backups (backupRtdb + setup-backups.sh + RUNBOOK), CI pipeline, cross-browser/device Playwright, Firestore/Storage rules tests (123 pass), axe a11y, handoff docs; GA4/Clarity/monitoring/backup-enablement remain owner-gated
- [[Five-Domain Audit Implementation 2026-06-20]] — full five-domain web audit (`docs/WEB-AUDIT-2026-06-20.md`) executed + deployed on Node 22: a11y/iOS-zoom, venue-NAT confirm rate-limit, invite-open KPI, localized reminders, audit-log+biometric retention, Sentry (DSN-gated), CI build+gitleaks, onboarding/OG/icons, softened deletion copy + corrected false "secrets-in-history" docs; build/admin-SDK-key alarms verified false
- [[Backend Security Hardening 2026-07-01]] — added input-validation (zod), per-request monitoring (Cloud Logging + Firestore securityEvents), account/IP/fingerprint blocking + admin Security page, encrypted-password enforcement; full endpoint audit fixed ~20 missing rate limiters + 2 input-validation gaps
- [[Security Audit 2026-06-29]] — targeted audit of AI-introduced vuln classes (hardcoded secrets / injection / auth-crypto): app verified clean (Semgrep 0 findings, no SQL/XSS, strong auth-crypto, no real secret in 662 commits); added `.gitleaks.toml` allowlist + `security.yml` (Semgrep/dependency-review/CodeQL) + Husky pre-commit; open: F-1 transitive npm vulns, rotate chat-shared LS key
- [[Security Audit 2026-07-02]] — fresh trust-nothing full-codebase re-audit (finder+adversarial-verifier, 16→12 confirmed / 4 refuted); fixed in code+rules: Firestore parent-doc PII read (MED), login-lockout DoS (MED), committed loadtest prod creds (HIGH), SVG upload + missing rate limiters + OG-cache exhaustion (LOW); owner actions: rotate admin/groom + AWS keys, bump aws-amplify
- [[UX Research Discovery 2026-07-02]] — full discovery cycle (design audit + 4 personas + empathy map + journey map) + live owner interview; core insight "trust = visibility"; reframe: 0 paying weddings, guest side is a blind spot; decisions: dial-code-only phone input (done), editable RSVP + change log, fund all 4 UX clusters
- [[Usability Test Plan 2026-07]] — ready-to-run baseline usability test (guest/couple/driver tracks, in-person on own phones, prod test wedding, parents micro-sessions + throttled runs); run before the UX clusters land, re-test after
- [[Research Synthesis 2026-07]] — affinity diagram (4 themes) + JTBD map over the discovery corpus; headline: "Dawa's moat is proof — and its UX debt is also proof"; all four actors' jobs converge on visible proof, making the confidence layer identity-work, not polish
- [[Comprehensive-Test-Harness]] — multi-layer automated test + feedback harness (`npm run test:full`): API route tests (closes TASK-006), 7 cross-role journeys, auto-crawler, visual regression, i18n/a11y sweeps → one consolidated report + deduped auto-filed issues; emulator-full + read-only prod smoke; flag-aware (physical track gated off); fixed the emulator seed namespace mismatch
---

*This index is maintained by Claude via `/wiki-brain`. Do not edit by hand unless you know what you're doing.*
