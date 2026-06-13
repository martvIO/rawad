# Wiki Index

This is the catalog of every page in your wiki. Claude updates it automatically.

**Pattern:** `- [[Page Name]] — one-line summary`

**Start here:** [[Dawa]] — the project hub linking everything below.

---

## Entities

_(people, places, organizations, products — pages that describe a thing)_

- [[Dawa]] — wedding-invitation management & distribution platform for the Arab/Israeli market (hub page)
- [[User Roles]] — the three portal roles: Admin, Groom, Driver

## Concepts

_(ideas, frameworks, patterns, principles — pages that describe a concept)_

- [[REST API Architecture]] — Express-on-Cloud-Functions REST layer; no Firebase SDK on the client
- [[Authentication]] — synthetic email, JWT custom claims, token manager, phone-OTP reset
- [[Polling and Realtime]] — REST polling (15–30s) for most data; SSE for live driver GPS
- [[Security Model]] — three enforced server-side layers + non-authoritative UI guard
- [[Digital Invitations]] — the Firestore-backed WhatsApp-link invite flow
- [[Face Matching]] — server-side face index for the guest "your photos" page; biometric consent + TTL erasure
- [[Optimistic UI Pattern]] — recurring bug class from the polling architecture, and its fix convention
- [[Inline Styling Convention]] — 100% inline styles + `theme.js` tokens, no CSS framework
- [[Digit Normalization]] — Western ASCII digits everywhere: `numberingSystem: latn` dates, apiClient input scrubbing, DB migration script
- [[List Search and Filter]] — reusable SearchBar + FilterChips + `useListFilter` on every portal list (12 lists); substring + phone-aware + hamza-insensitive
- [[Load-Test Dashboard]] — local-only FastAPI+React control panel for the Locust suite; live SSE metrics, always-on LOADTEST-data cleanup (incl. new admin purge endpoint), archived run history + compare

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
---

*This index is maintained by Claude via `/wiki-brain`. Do not edit by hand unless you know what you're doing.*
