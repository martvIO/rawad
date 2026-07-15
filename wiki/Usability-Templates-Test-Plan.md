---
date: 2026-07-15
sources:
  - /design-research:test-plan (this session)
  - Digital-Invitations ("DECIDED + BUILDING: 4 webgency-inspired bespoke templates")
  - UX-Research-Discovery-2026-07-02 (personas P1 Rania / P2 Im Khaled)
tags: [ux, usability, testing, templates, digital-invitations]
---

# Usability Templates Test Plan

Two-wave usability test for the **4 bespoke webgency-inspired templates** (see
[[Digital Invitations]]). Same owner-set conventions as [[Usability Test Plan 2026-07]]:
moderated · in person · participant's own phone · Arabic think-aloud · production + disposable
test wedding. Aligned to the validated-as-primary personas **P1 Rania** (organized bride, runs
the editor) and **P2 Im Khaled** (WhatsApp aunt — the guest experience floor).

**What's tested:** the *design decisions*, not the whole product — the no-auto-open sealed-tap
open, max-wow WebGL effects with tiered fallbacks, curated per-template theming (3–4 chips vs 16),
the template picker + hidden 3D controls in the editor, and bespoke RSVP.

**Two waves:**
- **Wave 1 (formative, 4–5 people)** — after template 1 (`destination-love`) ships. **Gates**
  templates 2–4. Cheapest moment to change the intro contract / effects budget.
- **Wave 2 (comparative, 6–8 people)** — after all 4 ship. Preference, dignity perception,
  per-template ship-confidence.

## Research questions
1. **Sealed screen:** with no auto-open, do guests (esp. older P2) tap within ~30s unaided, or
   stall/abandon? (Classic has a 5s auto-open net that bespoke removes on purpose.)
2. **Loading wall:** does lazy-loading (template + WebGL chunk) on a budget Android over weak
   signal reproduce the audit "loading wall" before the sealed intro even paints?
3. **Dignity vs gimmick:** do the effects read as فخم (P1's core want) or gimmicky — and does
   low-end jank damage trust in the invitation?
4. **Curated control:** can P1 discover/compare/switch templates unaided, and does the shrunken
   theme list + theme-reset-on-switch read as premium guidance or as lost control / data loss?
5. **RSVP parity:** does each template's bespoke RSVP keep the classic completion rate + "I'm
   sure it was recorded" confidence?

## Participants
| Segment | Persona | Wave 1 | Wave 2 | Screening |
|---|---|---|---|---|
| Guest proxies | P2-adjacent younger | 2 | 3 | ≥1 budget Android; 1 in a weak-signal spot |
| Older-guest proxies | **P2 Im Khaled** | 1 | 2 | 45+, WhatsApp-only comfort, own device |
| Couple proxies | **P1 Rania** | 1–2 | 2–3 | recently married/engaged preferred, Arabic-comfortable |

Guest sessions are **within-subject comparative** — each guest opens **2 templates** (real
WhatsApp sends, counterbalanced so every template is seen by ≥3 guests in Wave 2).

## Tasks
**Guest** (entry = real admin WhatsApp send; template A tasks T1–T5, then template B T1–T3 short, then T6):
- **T1 Open it** — "take a look" (never say "tap"). *Success: taps sealed intro unaided ≤30s → opened.*
  Record: link-tap→sealed paint (loading wall), sealed→tap (**no-auto-open metric**), "is it broken?",
  random tapping, abandonment. No rescue before 60s.
- **T2 Comprehension** — after the animation: who/when/where, no scroll-back. (Does the wow carry or bury content?)
- **T3 Live with effects** — free scroll; delight vs distraction, jank, heat, battery remarks.
- **T4 RSVP** — "coming with your partner" (party size 2); confident it recorded; confetti = joy or startle?
- **T5 Find your way** — venue + map affordance.
- **T6 Compare** — both side-by-side: which would you rather receive / more فخم / send for your own event?
- **T7 (1/wave)** — reduced-motion on: still opens by tap, fully readable.

**Couple** (P1, fresh test-groom login):
- **C1 Choose a design** — find picker, browse thumbnails, understand these are different *designs*, pick, read confirm.
- **C2 Make it yours** — names/date/venue, change theme among curated chips, change font. Probe curation wording.
- **C3 Missing controls** — "change the background stars" (hidden on bespoke) — reads as broken or as "this design lacks it"?
- **C4 Switch & switch back** — no data-loss anxiety; content survives; theme reset noticed without alarm.
- **C5 Trust check** — preview → submit → open a minted link: "is this exactly what your guest sees?" (confidence).

## Metrics
Task success (unaided/prompted/failed, target ≥2/3 unaided) · **time-to-tap** on the sealed screen
(Wave-1 median >15s or any older-guest abandonment → revisit no-auto-open) · time-to-first-paint on
budget-Android+weak-signal (loading-wall check) · **SEQ 1–7** per task · **dignity differential**
(rate each فخم 1–7 + preference rank at T6) · error/confusion checklist (sealed-stall, load-cover wall,
jank, buried-content recall miss, theme-restriction complaint, hidden-controls confusion, switch anxiety,
RSVP error, confetti startle) · verbatims ("لو عرسك انت — بتبعت هاد؟").

## Facilitation deltas (reuse baseline intro/consent/probes)
Never say "tap" before T1 is scored. Sealed probe (after): "شو كانت الصفحة عم تستنى منك؟". Effects probe:
"كتير، قليل، ولا مظبوط؟". Theming probe: never say "limited/missing" — let P1 name it. Couple debrief:
"شو بتتوقع يتغير إذا غيّرتي التصميم بعد ما بعتّي الدعوات؟" (snapshot-locking comprehension).

## Decision gates
- Wave 1 → keep / strengthen / replace the no-auto-open sealed screen; default effects tier on mid devices;
  curation-copy adequacy. Applied to `useIntroPhase` **before** templates 2–4 inherit it.
- Wave 2 → per-template: ship broadly / fix first / drop from the picker.

## Pilot checklist (before session 1 of each wave)
- [ ] Test wedding; **4 designs approved under the 8-designs cap** (delete leftovers); one minted link/template verified on 2 devices
- [ ] Dry-run guest track on the budget Android over weak signal; confirm the WebGL fallback triggers on the old device
- [ ] Counterbalancing sheet (who sees which pair, in which order)
- [ ] Reduced-motion enabled on the facilitator device for T7
- [ ] Observation sheets w/ the metric checklist; recording + consent ready
- [ ] Same-day teardown (delete TEST users/guests/RSVPs; nothing TEST-prefixed remains)

## Output
`wiki/Usability-Templates-<date>.md` after each wave + updates to [[Tasks Backlog]] and the template
sections of [[Digital Invitations]]. Synthesize with `/design-research:synthesize`.

Related: [[Digital Invitations]] · [[UX Research Discovery 2026-07-02]] · [[Usability Test Plan 2026-07]] ·
[[Buyer Persona]] · [[Tasks Backlog]]
