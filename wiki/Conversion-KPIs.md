# Conversion KPIs

Defined 2026-06-20 as part of the [[CRO and IA Audit 2026-06-20]]. The
[[Admin Analytics]] dashboard shipped 2026-06-19 measures the business, but it is
**observational with no targets** — a speedometer with no destination. This page
sets the targets and the cadence. Most of this is a *decision*, not code.

## North Star
**Paid weddings per month** (couples who reach `paymentStatus: paid`). One number
that, if it goes up sustainably, means the business is winning.

## Supporting KPIs (the funnel)
| KPI | Definition | Source today | Gap |
|---|---|---|---|
| WhatsApp leads / week | Clicks on a "book" CTA that open WhatsApp | **not measured** | needs the top-of-funnel counter (see below) |
| Lead → paid % | Paid weddings ÷ WhatsApp leads | not computable | unlocked once leads are counted |
| RSVP completion % | Confirmed ÷ invites sent | [[Admin Analytics]] + [[Guest Experience Metrics]] | ✅ closed 2026-07-16 — full sent→opened→submitted funnel, incl. opened-but-never-answered and never-opened |
| Delivery-proof % | Deliveries with a proof photo ÷ total | in [[Admin Analytics]] | ok |
| ARPU / revenue (₪) | From Stripe paymentStatus | in [[Admin Analytics]] / [[Payments]] | ok |

## The missing measurement (dependency for lead→paid)
The sales funnel's **top step — the WhatsApp CTA click — is unmeasured.** Until a
lightweight, no-PII click counter exists (CRO item, deferred this session because it
needs a DB-writing endpoint — confirm separately per the project's "ask before DB
changes" rule), `lead → paid %` cannot be computed. Note both this and the separate
**invite-open** gap (RSVP funnel top) remain open.

## Targets (set AFTER a 2-week baseline)
Don't set numbers before you have a baseline. Process:
1. **Weeks 1–2:** instrument + observe. Record current paid weddings/month,
   RSVP %, delivery-proof %, and (once counting) WhatsApp leads/week.
2. **Then:** set a 90-day target for the North Star + one bottleneck KPI. Example
   shape (fill with real baselines): "paid weddings/month from X → 1.3X in 90 days
   by raising lead→paid from A% → B%."
3. **Weekly:** a 15-minute review of the [[Admin Analytics]] page; each KPI must tie
   to a decision it would change, or it's a vanity metric.

## Guardrails
- **Seasonality:** weddings are seasonal — review month-over-month, not week spikes.
- **One bottleneck at a time:** improve the single weakest funnel step, re-measure,
  move on. Don't chase every metric at once.

Related: [[Dawa]] · [[CRO and IA Audit 2026-06-20]] · [[Admin Analytics]] · [[Payments]] · [[Buyer Persona]]
