---
date: 2026-07-02
sources:
  - session code audits (3 parallel: design system, public flows, portals)
  - live screenshots (dev server, mobile 390px + desktop)
  - live owner interview (4 rounds, 16 questions)
tags: [ux, research, personas, journey, audit, analysis]
---

# UX Research Discovery 2026-07-02

A full `/design-research:discover` cycle for [[Dawa]]: design audit → 4 personas → empathy map →
journey map → synthesis, followed by a **live owner interview** that validated/corrected the
findings and produced decisions. Companion usability plan: [[Usability Test Plan 2026-07]].
Builds on [[Buyer Persona]], [[Product Audit 2026-06-13]], [[CRO and IA Audit 2026-06-20]],
[[Competitor Landscape]], [[Visual Design System]].

## Design audit — what's good (keep & protect)

- **Genuinely premium visual identity** — gold-on-near-black, custom seal/monogram, 16 themes,
  envelope intro + orchestrated motion. Confirmed visually and confirmed *commercially* by the
  owner: prospects react "wow, then book talk" to the demo.
- **Strong foundations** — token scales in `theme.js`, accessible `ui/` primitives (Modal focus
  trap, Field aria wiring), `prefers-reduced-motion`, dark cold-load splash, head-loaded fonts.
- **Excellent PhoneInput** (country auto-detect, formatting, Arabic-digit safety via [[Digit Normalization]]).
- **Thoughtful flows**: forgot-password 3-step, token lifecycle states, optimistic delivery with
  revert, driver city-grouped routing, fail-open event availability.

## Design audit — flaws (ranked)

**Tier 1 — guest on a phone (highest volume, least technical):**
1. First-load wall on `/d/:groom/:token`: minimal dark loading state while the lazy three.js chunk
   downloads; nav sits *below* the envelope (z 120 vs 1000) → no skip path on slow networks
   (`DigitalInvitationPage.jsx`, `CelestialAmbience.jsx`, `InviteNavMenu.jsx`).
2. **RTL centering bug, visually confirmed in screenshot**: the "اضغط لفتح الدعوة" cue clips at the
   left screen edge — hardcoded `left: 50%` in `.dawa-inv-cue` (`InviteStyles.jsx:90`); ~15 more
   hardcoded `left/right` in the same file.
3. Silent failures: music `.play()` rejection swallowed (`InviteFooterDock.jsx`); no retry on failed
   RSVP submit; GPS accuracy ±1000m attached without warning.
4. One-shot RSVP — guests can't view/edit an answer (decision made — see below).

**Tier 2 — portal trust (the paying couple):**
5. Irreversible swipe-delete, no undo/confirm (`GroomGuests.jsx`).
6. Operational invisibility: no last-synced indicator; "sent" = a wa.me tab opened; design
   rejection silent; the admin-sends model never explained in UI.
7. Filtered-list header counts show totals, not the filtered count.

**Tier 3 — field & operator:**
8. Driver proof upload has no progress UI (double-tap risk); GPS share freezes on screen lock with
   no "paused" state; permission-denied dead-end says "retry" when browser settings are needed.
9. Admin: native `window.confirm` for 250-message bulk sends; no pagination on RSVP lists;
   optimistic user-create without rollback; silent 4000-char truncation.

**Tier 4 — design-system debt:**
10. 133+ hardcoded colors bypass tokens; `EditGuestModal`/`GuestMapModal` hand-roll modal scaffolding
    (z-index 1000 vs `z.modal` 1500, no `role="dialog"`) instead of `ui/Modal`.
11. Touch targets under 44px (`.gold-btn` ≈38px, FilterChips ≈20px, LangSwitcher ≈24px).
12. i18n bypass (hardcoded AR/HE strings in `DigitalInviteForm.jsx`, `InviteRsvp.jsx`); contradictory
    `direction:"ltr" + textAlign:"right"`; no shared breakpoint tokens.
13. Landing page: all below-hero content sits at opacity 0 until scroll-reveal (~21k px of black in
    full-page capture) — needs a no-JS/reduced-motion/crawler fallback check.
14. ~~Phone input default shows 🇮🇱 flag~~ — **decided + fixed 2026-07-02: dial code only, no flags.**

## Personas (4 — hypothesis-grade, see validation note)

**⭐ P1 (PRIMARY) — Rania, 28, "the organized bride"** (with her fiancé — the couple operates the
portal *together*, per the owner). WhatsApp-native, app-shy, Arabic-first, 200–600 guests.
Goals: accurate headcount, dignified presentation, zero chasing, control. Frustrations: invisible
status changes, unexplained admin-dependency, per-guest entry, irreversible actions, raw error
codes. *Design north star: convert operational invisibility into confidence signals.*

**P2 — Im Khaled, 54, "the WhatsApp aunt"** (guest — highest-volume user; sets the experience
floor). Older Android, village data, Arabic-only. The loading wall, clipped cue, silent audio, and
one-shot RSVP all land on her. *Design rule: the least-technical guest defines the floor.*

**P3 — Khalil, 24, the driver.** One-handed, sun glare, dead zones. Needs visible upload
progress/queue, an explicit GPS "paused" state, plain-language permission recovery.

**P4 — the operator-admin (owner).** The deliberate high-touch bottleneck. Needs instrumented batch
sends, real confirm modals, paginated lists, optimistic-rollback ([[Optimistic UI Pattern]]).

**Validation status: no personas are validated.** The June plan (call 10 past customers) is
**impossible — there are 0 paying customers** (see interview). Validate via pilot weddings +
prospects instead; [[Usability Test Plan 2026-07]] is the first instrument.

## Empathy map (Rania)

- **Says**: "Will it look dignified enough?" · "Did the invitations actually go out?" · "The hall
  is asking for a number." · "I'll just WhatsApp the operator."
- **Thinks**: "My one wedding — nothing can go wrong." · "Is this list live?" · "Why can't *I*
  send them?" · "What does api_429 mean?"
- **Does**: evening bursts on the phone; previews the demo repeatedly; screenshots dashboards into
  family groups; polls the operator on WhatsApp (no in-product channel).
- **Feels**: proud at the design preview; anxious in the post-send silence; afraid of one wrong
  swipe.
- **Core insight: trust = visibility.** The portal's job is continuous, glanceable proof that the
  done-for-you operation is happening.

## Journey map (Rania, 7 stages)

1. **Discover** (+2) — WhatsApp referral → landing → demo. June's funnel blocker (WhatsApp number
   unset) is **resolved — set and working** per owner.
2. **Book & onboard** (+3) — WhatsApp chat, `/pay/:token`, first login. Gap: no groom first-run
   checklist (drivers have one).
3. **Build the list** (−1) — per-guest entry on the physical track; swipe-delete risk; no sync
   indicator.
4. **Design & preview** (+3, **peak 1**) — premium themes/envelope. Gap: silent design rejection.
5. **Send & wait** (−2, **deepest trough**) — can't send, can't see who got/read; guests hit the
   loading wall. Status pings to the operator cluster here (owner-confirmed: "at key moments").
6. **Wedding week** (+2, dips) — delivery + GPS proof (the moat); GPS freeze on screen lock;
   handwritten dashboard lacks the RSVP rollup digital has.
7. **Day & after** (+3, **peak 2**) — [[Face Matching]] photos; no referral capture at peak delight.

**Moments of truth**: (1) the guest's first 3 seconds on village 4G; (2) "did it go out?";
(3) the headcount call; (4) the proof photo arriving.

## Owner interview (2026-07-02, live, 4 rounds / 16 questions)

Reframing facts (all explicitly stated):
- **0 paying weddings; inner-circle testing only; no launch timeline** — pre-revenue; growth
  expected via word of mouth.
- The one real reported problem: **"who got/read them?"** — per-guest delivery/read status.
  Sharper than the audit framing: tab-opened sends can never answer it; the already-built
  [[WhatsApp Messaging]] Cloud API path could surface per-guest sent/delivered/read.
- Couples operate the portal **together** (P1 adjusted).
- Guest-side experience is a **total blind spot** — owner wants **funnel metrics + live observation**.
- Demo = sales weapon ("wow, then book talk") — protect the envelope experience.
- Status pings arrive **at key moments** (post-send, pre-wedding) — trough placement confirmed.

**Decisions made (owner-stated):**
1. Phone input: **dial code only, no flag emoji** → implemented 2026-07-02 (`PhoneInput.jsx`).
2. **RSVP policy: editable until deadline + couple sees a change log** → recorded in
   [[Digital Invitations]]; needs its own design + go-ahead (DB/schema work).
3. Guest blind spot: close with **metrics + observation** (metrics need a DB-writing endpoint —
   separate go-ahead).
4. Priorities: **fund all four clusters** (guest first-load, confidence layer, safe actions,
   design-system sweep).
5. Owner's personal polish targets: **landing page + portal look & feel**.

## Prioritized opportunity backlog (awaiting per-item go-aheads)

1. **Guest first-load** — skeleton/hero placeholder + skip-intro + fix `.dawa-inv-cue` logical
   properties (S effort, highest impact).
2. **Confidence layer** — per-guest sent/delivered/read (via [[WhatsApp Messaging]] states),
   last-synced chip, design-review notification, "why admin sends" explainer, filtered-count fixes.
3. **Safe actions** — undo-toast delete; themed bulk confirm; driver upload progress + retry queue.
4. **Design-system adoption sweep** — modals → `ui/Modal`, colors → tokens, `left/right` →
   logical properties, ≥44px targets.
5. **RSVP editability** (decided feature — needs design).
6. Owner-flagged: landing + portal polish passes; landing scroll-reveal fallback; GPS-accuracy warning.

## Research gaps

- Personas unvalidated (0 customers — validate via pilots/prospects; run [[Usability Test Plan 2026-07]]).
- No on-device data for budget Androids / village networks.
- No funnel data between link-open and RSVP (envelope-abandon step unmeasured).
- Hebrew-speaking guest segment + screen-reader usage unobserved.

Related: [[Dawa]] · [[Buyer Persona]] · [[Product Audit 2026-06-13]] · [[CRO and IA Audit 2026-06-20]] ·
[[Competitor Landscape]] · [[Visual Design System]] · [[Digital Invitations]] · [[Tasks Backlog]] ·
[[Usability Test Plan 2026-07]]
