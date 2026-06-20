# Dawa KPIs — what we measure and why

The 2026-06-13 audit called the business "blind to itself." This file defines
the handful of numbers worth watching, where each comes from today, and what is
still un-instrumented. **Instrument against these — don't add analytics events
that don't map to a KPI here.** Companion: the admin analytics dashboard
(server-side aggregation) + the planned GA4 funnel layer.

> Targets below are starting guesses to make the dashboards actionable. Replace
> the `target` values with real ones after one month of baseline data.

| # | KPI | Definition | Source today | Target (placeholder) |
|---|-----|------------|--------------|----------------------|
| 1 | **Paid-plan conversion** | grooms with `paymentStatus=paid` ÷ grooms created | Admin dashboard → Revenue (RTDB) | ≥ 40% of onboarded grooms |
| 2 | **Revenue (₪)/period** | Σ paid plans × plan price (Premium 2,500 / VIP 3,500) | Admin dashboard → Revenue | trend up MoM |
| 3 | **RSVP conversion** | confirmed guests ÷ invites sent | Admin dashboard → RSVP (partial) | ≥ 60% of invited |
| 4 | **Invite-open rate** ⚠️ | unique invite opens ÷ invites sent | **NOT instrumented** — needs server-side `viewedAt` | ≥ 70% opened |
| 5 | **Delivery completion** | guests delivered ÷ total (per wedding) | Admin dashboard → Operations | ≥ 95% before wedding |
| 6 | **Landing → signup** | grooms created ÷ landing sessions | **NOT instrumented** — needs GA4 | ≥ 5% of sessions |
| 7 | **Operator throughput** | concurrent active weddings vs. ~20–30 ceiling | Admin dashboard (count active) | watch vs. ceiling |
| 8 | **Face-match success** | guests who retrieve ≥1 photo ÷ guests who try | **NOT instrumented** — needs event | establish baseline |

## Measurement gaps (the work the analytics plan closes)

- **#4 Invite-open rate** is the highest-value missing metric — the top of the
  RSVP funnel. Today an invite counts as "engaged" only when the guest *submits*
  a form. Fix = a first-party `viewedAt` write on the digital-invite render
  function (ad-block-proof), surfaced on the dashboard's currently-empty
  open-rate. GA4 `invite_open` is a secondary cross-check.
- **#6 Landing→signup** and traffic sources need the GA4 funnel layer
  (`landing_cta_click` → `signup_complete`).
- **#8 Face-match success** needs a `photo_match_found` / `photo_match_empty`
  event on the finder result.

## How to use this

- Review #1–#5 on the admin dashboard weekly.
- After GA4 + invite-open land, #4 and #6 become measurable — re-baseline and
  set real targets.
- Every new analytics event must trace to a KPI row here, or it's noise.

Related: KPIs feed the growth goals in the product audit
(`product-audit-2026-06-13.md`).
