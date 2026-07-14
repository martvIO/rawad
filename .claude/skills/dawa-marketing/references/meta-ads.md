# Meta Ads for Dawa

Build a Facebook/Instagram campaign that turns wedding-planning couples into WhatsApp conversations. Produce a concrete campaign spec the user can build in Ads Manager, plus the click-through steps.

## Prerequisites (check these exist before advising a launch)

- **Meta Business Manager** with a Facebook Page + connected Instagram account.
- **WhatsApp connected** to the Page (required for Click-to-WhatsApp ads — Dawa's best objective).
- **Meta Pixel + Conversions API** on the Dawa site if running Sales-objective ads (tracks package purchases / `Lead` events). Not required for WhatsApp/Leads objectives.
- A **payment method** and the account not in a restricted state.

If any are missing, the deliverable is a setup checklist, not a campaign.

## Choose the objective (this decision drives everything)

| Objective | Use for Dawa when… | Note |
|---|---|---|
| **Engagement → WhatsApp** (Click-to-WhatsApp) | **Default early choice.** You want couples to DM you on WhatsApp where you close. | Cheapest path to a real conversation; matches Dawa's WhatsApp-native flow. |
| **Leads → Instant Form** | You want structured info first (wedding date, guest count, city) before chatting. | Higher intent, lower volume than CTWA. Pre-fill wedding date + city fields. |
| **Sales → Website conversions** | Pixel has data and you're driving package purchases on-site. | Needs volume (~50 conversions/week/ad set) to optimize — usually a later stage. |
| **Traffic / Awareness** | Rarely. Only for cheap reach or warming a new Page. | Optimizes for clicks/reach, not buyers. Don't start here. |

**Recommendation for a new account:** start with **Engagement → WhatsApp**. Move budget to **Sales** once the Pixel has learned.

## Campaign structure

Keep it simple enough to read the data:

- **1 campaign** per objective. Use **Advantage+ campaign budget (CBO)** once you trust the audiences; use **ad-set budgets (ABO)** while testing so each audience gets a fair test.
- **2–4 ad sets**, each a distinct audience hypothesis (see below). One variable per ad set.
- **3–5 ads** per ad set — different creative/hook, **same** offer. Let Meta find the winning creative.
- Name everything: `[Objective]_[Audience]_[Date]` / `[Angle]_[Format]` so the report is legible.

## Audiences

Israeli-Arab wedding market. Build these as separate ad sets to test:

1. **Advantage+ / Broad** — minimal targeting, let Meta optimize. Often wins once creative is good. Location: Israel; Language: Arabic.
2. **Interest core** — Israel, age **20–38**, Arabic language, interests: `weddings`, `wedding planning`, `bridal`, `engagement`, `wedding photography`, `wedding dress`, plus local wedding-hall / henna interests where available.
3. **Life-event** — "newly engaged (0–6 / 6–12 months)" where the segment is available in the account.
4. **Geo-tight** — narrow to one strong region (e.g. المثلث / الجليل / النقب) when a driver route or a promo is city-specific.
5. **Retargeting** (once you have traffic) — IG/FB engagers (365d), video viewers (≥50%), site visitors, WhatsApp openers. Warmest, cheapest conversions.
6. **Lookalike** (once ~100+ leads/customers) — 1–3% LAL of WhatsApp leads or purchasers.

Exclude existing customers/leads from cold ad sets. Don't stack so many interests that the audience is tiny — broad + good creative beats narrow.

## Budget, testing, scaling

- **Start small:** ₪30–70/day per ad set. Run **4–7 days** before judging — don't kill an ad on day 1 (learning phase).
- **Kill** ad sets/ads clearly below target CPL after enough spend (≈2–3× your target cost-per-result with no result).
- **Scale winners** by **+20% every 2–3 days** (bigger jumps reset learning), or duplicate the winner into a new ad set to scale faster.
- One change at a time so you know what moved the number.

## KPIs and what "good" looks like

| Metric | Read it as | Rough healthy range (calibrate to your account) |
|---|---|---|
| **CTR (link)** | Is the creative/hook working? | > 1.5% is promising |
| **CPM** | Cost to reach; spikes if audience is fatigued/narrow | market-dependent |
| **Cost per WhatsApp conversation / Lead** | The number that matters | set a target from your package margin |
| **ThruPlay / 3-sec views** | Is the video hook holding? | compare across creatives |
| **Frequency** | Fatigue signal | refresh creative when it climbs (>2–3 on cold) |

Optimize toward **cost per conversation/lead**, not CTR. A cheap click that never messages you is worthless.

## Ads Manager — click-through (Engagement → WhatsApp)

1. **Ads Manager → Create → Engagement.**
2. Conversion location: **WhatsApp**. Select the connected WhatsApp number.
3. Ad-set level: set **budget**, **schedule**, **location = Israel**, **age 20–38**, **language = Arabic**, and the interests/audience for this ad set. Placements: **Advantage+ placements** (let Meta distribute) unless you have a reason to restrict.
4. Ad level: pick format (single image / video / carousel), upload creative, paste **primary text + headline** (from [`ad-copy.md`](ad-copy.md)), set the **WhatsApp default message** (a pre-filled opener like "مرحبا، بدي استفسر عن دعوة 💍").
5. Confirm the WhatsApp CTA button, review, **Publish**.
6. After 4–7 days, open the report, compare ad sets on cost-per-conversation, kill/scale.

## Compliance notes

- Weddings are **not** a Special Ad Category (that's credit/housing/employment/politics/social issues) — full targeting is available.
- Meta's **personal-attributes** rule still applies: address the reader as planning a wedding ("بتخططوا لعرس؟"), never as if you know their private status ("we noticed you got engaged").
- Use real imagery you have rights to; get consent before featuring a real couple's wedding.
