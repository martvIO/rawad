---
date: 2026-07-02
sources:
  - owner interview (parameters set live, 2026-07-02)
  - UX-Research-Discovery-2026-07-02
tags: [ux, usability, testing, research, plan]
---

# Usability Test Plan 2026-07

Baseline usability test for [[Dawa]] on the **current build, before** the improvement clusters land
(owner's sequencing choice), re-tested after. All parameters below were set by the owner in the
live interview — see [[UX Research Discovery 2026-07-02]].

**Parameters**: all three tracks · moderated, in person, participant's own phone, think-aloud in
Arabic · production + disposable test wedding · one track per person (~30 min) · younger friends
+ 1–2 parents (guest micro-sessions) + throttled/old-device runs.

## Research questions
1. Do guests get from the WhatsApp message to a rendered invitation without stalling/abandoning —
   and where exactly do they stall? (loading wall, clipped tap-to-open cue)
2. Can guests complete an RSVP with party size unaided, feel confident it was recorded, and what do
   they do when they need to change it? (one-shot RSVP)
3. Can a couple build a guest list without a data-loss event, and answer "did it go out? who
   got/read it?" from the portal alone? (trust = visibility)
4. Does the driver flow survive real field conditions — GPS with the phone pocketed/locked, proof
   upload on weak signal?
5. Which audit-flagged flaws does real behavior confirm, and which does it refute?

## Participants (7–9, one track each)
| Segment | Count | Screening | Track |
|---|---|---|---|
| Guest proxies | 3 friends | ≥1 on an older/budget Android; 1 session in a weak-signal spot or on a provided old device | Guest, 30 min |
| Older-guest proxies | 1–2 parents/aunts | 45+, WhatsApp-only comfort | Guest micro, 15 min (G1+G3, zero prompting) |
| Couple proxies | 2 friends | Recently married/engaged if possible | Couple, 30 min |
| Driver proxies | 2 friends | Car or willing to walk a 3-stop route | Driver, 40 min |

## Tasks (success criteria in parentheses)

**Guest track** — entry is a REAL WhatsApp send from the admin panel to their number:
- **G1** "You just got this message — take a look." (Reaches the rendered invitation; states who/when/where. Record time-to-envelope-open; note taps on the clipped cue, "is it broken?" utterances, abandonment.)
- **G2** "Figure out how you'd get there." (Finds venue; opens map/Waze.)
- **G3** "Reply that you're coming with your partner." (RSVP with party size 2; states confidently it was recorded.)
- **G4** "Plans changed — make it 3 people." (**Expected FAIL** on current build; observe workaround attempts — evidence for the decided editable-RSVP feature.)
- **G5** Free exploration: music, share, calendar, photos. (Note silent-audio confusion.)

**Couple track** — fresh test-groom credentials:
- **C1** First login + forced password change. (Unaided.)
- **C2** "Add these 5 guests" (paper list; one has an 8-digit phone). (All 5 added; when do they discover the 9-digit rule?)
- **C3** "How many confirmed? Did [test guest] get her invitation? Did she read it?" (**Expected partial FAIL** — where do they look; when do they say "I'd WhatsApp you"?)
- **C4** "Remove guest X." (Swipe discoverability; mis-swipe near-misses; reaction to no-undo.)
- **C5** Preview design + submit a design request. (Where would they expect to hear back?)

**Driver track** — test-driver account assigned to the test groom; real 3-address mini route:
- **D1** Login, pick groom, first-run checklist. (Unaided.)
- **D2** Start GPS share, pocket the phone, walk 5 min. (Facilitator watches the groom-side live map: does the pin freeze?)
- **D3** Address 1: Waze button → mark delivered + door proof photo + note. (Note double-taps during progress-less upload.)
- **D4** Address 2: record a "no answer" outcome. (Finds the structured non-delivery option.)
- **D5** Address 3: upload proof at the weakest-signal spot. (Retry behavior, uncertainty.)

## Metrics
- Task success, 3-level: unaided / prompted / failed (target: ≥2 of 3 unaided per task).
- Time: G1 message-tap → envelope open → rendered; G3 RSVP completion.
- **SEQ** (1–7) after each task.
- Error/confusion counts vs. a pre-built checklist keyed to audit findings (clipped cue, loading
  wall, silent audio, count mismatch, swipe risk, upload double-tap, GPS freeze).
- Qualitative: verbatims, esp. trust ("would you rely on this for YOUR wedding?").

## Facilitation guide (Arabic skeleton)
- **Intro (2 min)**: "نحن نختبر التطبيق، مش نختبرك — ما في إجابة غلط. احكي بصوت عالي شو بتفكر.
  بسجّل الشاشة، موافق؟" Consent: recording + using their number for the test invite; deletion after
  analysis.
- **Probes (neutral)**: "شو بتفكر هلق؟" · "شو توقعت يصير؟" · "وين كنت تدور؟" Never rescue before a
  60-second stall; log the stall, then prompt minimally.
- **Debrief (5 min)**: hardest moment? most impressive? "لو عرسك انت — بتوثق فيه؟ ليش / ليش لأ؟"

## Data collection & analysis
- Screen recording on the participant's phone where consented, else over-shoulder camera; per-task
  observation sheet (expected-issue checkboxes + free notes); findings coded participant × task ×
  severity (frequency × impact, Krug-lite).
- Output: `wiki/Usability-Baseline-2026-07.md` (create after sessions) + updates to
  [[Tasks Backlog]]; deltas re-measured in the post-fix re-test. Synthesize with
  `/design-research:synthesize`.

## Test-wedding setup & teardown (production — owner is admin)
- **Setup**: create `TEST-usability` groom + one test driver (assigned); add 8–10 guests with
  participants' real numbers (with consent); admin-send real invite links; verify tokens on 2
  devices before day 1.
- **Teardown same day**: delete test users/guests/proofs/RSVPs (align with the LOADTEST cleanup
  conventions — see [[Load-Test Dashboard]]); confirm nothing TEST-prefixed remains.

## Pilot checklist (before session 1)
- [ ] Dry-run the full guest track with one patient friend; fix script ambiguities
- [ ] Test wedding created; links verified on 2 devices; driver account assigned
- [ ] Old/budget Android charged; weak-signal location chosen
- [ ] Observation sheets ready; recording storage ready; consent script on hand
- [ ] Groom-side live map open on a second device for D2
- [ ] Teardown checklist ready

Related: [[Dawa]] · [[UX Research Discovery 2026-07-02]] · [[Buyer Persona]] · [[Tasks Backlog]]
