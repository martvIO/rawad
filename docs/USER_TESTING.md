# User Testing — moderated session scripts

The audience is **non-technical, Arabic/Hebrew-speaking, mobile-first** users.
Their *comprehension* and *flow confusion* — not code bugs — are what kill RSVP
and signup conversion. Automated tests can't catch "the groom didn't understand
the handwritten-vs-digital gate." Real users can.

**Method (Nielsen's rule of 5):** ~5 sessions per major release surface the
majority of usability problems. No tooling, no budget — a phone, a script, and a
willingness to stay quiet. Pair with Microsoft Clarity (once live) so these
qualitative sessions explain the quantitative drop-off points.

## How to run a session (15–20 min)
1. Recruit a **real target user** — a recently-married couple, a guest, someone
   non-technical. Include at least one true stranger (friends are too forgiving).
2. Use **their** phone, in **their** language (Arabic or Hebrew).
3. Give a task, then **stay silent**. The golden line: *"Think out loud — and I
   can't help you, I need to see where it's confusing."*
4. Don't lead ("now tap the blue button"). Watch where they hesitate, mis-tap,
   or give up. Hesitation = a finding.
5. Note the exact wording that confused them (RTL/dialect copy is a stated
   product value — probe it).

## Scripts by persona

### Groom (the paying customer)
- "You just signed up to send your wedding invitations. Set yourself up and add
  your first 3 guests." → watch the **handwritten vs digital gate** — do they
  understand the choice?
- "Send a digital invite link to one guest." → is link generation discoverable?
- "Check who has confirmed." → do they find delivery proofs + RSVP status?

### Guest (the hundreds who decide your RSVP rate)
- Send them a real invite link **over WhatsApp** (open it from WhatsApp, not a
  browser — that's where guests actually open it). → "You got this from a friend
  getting married. What is it, and what would you do?"
- "Let the couple know if you're coming." → does RSVP read as an RSVP? Is the
  attending/absent choice obvious? Does the Arabic-digit phone field work?
- (If face-finder) "Find your photos from the event." → camera + Liveness on
  their real device; do they trust the privacy/consent step?

### Driver (delivery + proof)
- "You've been given a delivery route. Deliver to the first address and prove you
  did." → is photo-upload obvious? Does GPS sharing make sense?
- "Mark an address as wrong/no-answer." → are the outcome options clear?

## After each round
- Log findings in a wiki page (`wiki/` — e.g. a "User Testing <date>" note),
  cross-linked from the audit pages.
- Rank by frequency × severity; feed the top 2–3 into the backlog as fixes.
- Re-test the fixed flows in the next round to confirm they actually improved.

## What NOT to do
- Don't test with developers or yourself — you know where everything is.
- Don't demo; observe. The moment you explain, the finding is gone.
- Don't fix copy live — capture it, fix it deliberately, re-test.
