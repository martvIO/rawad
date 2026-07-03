---
date: 2026-07-02
sources:
  - 3 code audits (AUD-DS design system, AUD-PUB public flows, AUD-POR portals)
  - live screenshots (SCR)
  - owner interview, 16 answers (INT)
  - prior wiki audits (WIKI — Product Audit 2026-06-13, CRO/IA 2026-06-20)
tags: [ux, research, synthesis, affinity, jtbd, analysis]
---

# Research Synthesis 2026-07

Affinity-diagram + Jobs-to-Be-Done synthesis of the [[UX Research Discovery 2026-07-02]] corpus.
Every observation below is tagged with its source; single-source findings are flagged.

## The headline

> **Dawa's moat is proof — and its UX debt is also proof.**
> The business differentiates on *visible evidence* (photo proof, live GPS, delivery tracking —
> [[Competitor Landscape]]), yet at the interaction level the product systematically withholds
> evidence: sends that are fictions, uploads without progress, deletions without undo, rejections
> without notice, guests' phones nobody has watched. "Sell the operation" requires **showing** the
> operation, at every layer, to every actor.

## Affinity diagram (4 themes ← 6 clusters ← tagged observations)

### Theme 1 — Silence reads as failure *(highest frequency: 10 observations, 4 sources)*
**Insight: every layer of the product acts or fails silently, and users interpret silence as
failure — then route around the product to WhatsApp.**
- "Sent" = a wa.me tab opened; popup-blocked sends drop silently (AUD-POR, WIKI)
- The one real user-reported problem: "who got/read them?" (INT — the couple asked for evidence)
- Design rejection is invisible; blocks all sends with no alert (WIKI, AUD-POR)
- Music `.play()` rejection swallowed; RSVP network failure has no retry (AUD-PUB)
- No last-synced indicator anywhere despite 15s polling (AUD-POR)
- Driver upload has no progress; GPS share freezes on screen lock unsignaled (AUD-POR)
- Optimistic user-create leaves ghost rows on failure; 4000-char silent truncation (AUD-POR)
- Status pings hit the operator's WhatsApp "at key moments" — post-send, pre-wedding (INT)

### Theme 2 — The guest floor is unobserved *(high intensity: the value lands here)*
**Insight: the product's status promise is delivered on the phones of its least-technical,
never-observed users — the experience floor is set by a 54-year-old aunt on village 4G, and
nobody has ever watched her open a link.**
- Owner has zero visibility into guest experience; no funnel data link-open → RSVP (INT)
- Dark loading wall while the three.js chunk loads; no skip path (AUD-PUB)
- "اضغط لفتح الدعوة" cue clipped off-screen — RTL `left:50%` bug, visually confirmed (SCR, AUD-DS)
- One-shot RSVP; touch targets down to 20px; GPS ±1000m attached without warning (AUD-PUB, AUD-DS)
- Counter-evidence: prospects on demos react "wow, then book talk" (INT) — but prospects are
  motivated, curious viewers on good phones; wedding guests are neither. *Single-source, flagged.*

### Theme 3 — Premium face, workshop back-office *(owner-felt)*
**Insight: design quality is concentrated where Dawa sells (the invitation) and thinnest where
Dawa operates (portals, landing) — and the owner feels exactly this gap.**
- Owner's own gripes: landing page + portal look & feel (INT)
- Invitation: 300+ lines of crafted scoped CSS, fluid clamp() typography, PBR envelope; portals:
  plain inline styles, native `window.confirm`, unpaginated lists (AUD-DS, AUD-POR)
- The system exists but isn't the default: tokens bypassed 133+ times, `ui/Modal` unused by 2
  hand-rolled modals, logical properties skipped in the invite CSS, i18n bypassed in 2 public
  forms, the [[Optimistic UI Pattern]] convention unapplied to user-create (AUD-DS)
- **Sub-insight: the design-system work is adoption, not creation.**

### Theme 4 — Pre-revenue reality reprioritizes everything *(context theme)*
**Insight: every prior audit implicitly assumed a running business; there are actually 0 paying
weddings, inner-circle evidence only, and no launch date — so the product must (a) convert
prospects and (b) be flawless for wedding #1, not scale for wedding #30.**
- 0 paying weddings; inner-circle testing only; first wedding date unknown (INT)
- Growth is word-of-mouth dependent → reputation of wedding #1 IS the growth engine (INT, WIKI)
- The funnel blocker is fixed (WhatsApp number set + working) and the demo converts attention
  (INT) — top-of-funnel is healthier than the June audit assumed
- Operator-scale ceilings (~20–30 weddings, WIKI) are real but **not the binding constraint yet**

## Jobs-to-Be-Done

**Couple (primary):** *When we announce our wedding, we want every relative invited in a way that
honors them — and to know exactly who was reached and who's coming — so our family looks flawless
and the hall gets the right number.*
- Functional: invite 200–600; accurate headcount; track delivery. Emotional: control during peak
  stress; avoid the shame of a forgotten relative. Social: "a family that does things properly."
- Current hires: print shop + relatives hand-delivering (the real incumbent), free digital tools,
  phone-chasing. Dawa competes with *the cousin*, not Canva ([[Competitor Landscape]]).
- **Underserved half: "know exactly."** The operation happens but isn't shown (Theme 1).

**Guest:** *When a wedding invitation reaches me on WhatsApp, I want to see it, feel honored, and
answer correctly with minimal effort, so I fulfill my family duty.*
- Stages: receive → **open (underserved: loading wall)** → absorb → respond → **modify
  (unserved: one-shot → decided fix in [[Digital Invitations]])** → attend → relive (steep
  biometric ask).

**Driver:** *When I'm on a route in the sun, I want to prove each delivery in seconds, so I finish
fast and nobody can question my work.*
- Underserved: certainty — no upload progress/queue, unsignaled GPS pause. His proof is his
  paycheck defense; the UI makes proof feel unreliable.

**Operator-owner:** *When I run every wedding solo, I want every message and status visible and
batchable, so I can scale without dropping a single family's big day.*
- Underserved: instrumentation (the "sent" fiction), list scale, silent failures. His reputation
  is the growth engine (Theme 4).

**Convergence: all four actors' outcome expectations reduce to the same word — proof.** The couple
wants proof of reach, the guest proof their answer registered, the driver proof the upload landed,
the owner proof the send happened. This is the headline insight, and it makes the confidence-layer
work (TASK-UX-2/3) *identity-consistent*, not just polish.

## Prioritized design implications

1. **Build the proof layer** (Themes 1 + JTBD convergence) — per-guest sent/delivered/read via
   [[WhatsApp Messaging]] states, last-synced, design-review notification, upload progress/queue,
   GPS pause state, undo-toasts. → TASK-UX-2 + TASK-UX-3 in [[Tasks Backlog]].
2. **Harden the guest floor before wedding #1** (Themes 2 + 4) — first-load skeleton + skip +
   RTL cue fix (TASK-UX-1), then editable RSVP (TASK-UX-5), funnel metrics (TASK-UX-6), and the
   baseline sessions in [[Usability Test Plan 2026-07]] to actually watch a guest for the first time.
3. **Run the adoption sweep, not a redesign** (Theme 3) — migrate to the primitives/tokens that
   already exist (TASK-UX-4); fold the owner's landing/portal polish into it (TASK-UX-7).
4. **Sequence by the pre-revenue lens** (Theme 4) — anything serving wedding #1's flawlessness and
   prospect conversion outranks scale features; the operator ceiling becomes binding only after
   several concurrent weddings exist.

Related: [[Dawa]] · [[UX Research Discovery 2026-07-02]] · [[Usability Test Plan 2026-07]] ·
[[Buyer Persona]] · [[Competitor Landscape]] · [[Tasks Backlog]] · [[Digital Invitations]] ·
[[WhatsApp Messaging]]
