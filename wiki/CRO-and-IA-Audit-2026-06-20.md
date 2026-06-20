# CRO and IA Audit 2026-06-20

A focused audit of [[Dawa]] on **web/conversion strategy + information
architecture**, with the high-value, low-risk fixes implemented and shipped the
same session. Companion to the broader [[Product Audit 2026-06-13]].

## Owner direction (anchored the verdicts)
1. **Sales motion stays high-touch** — admin-provisioned grooms after a WhatsApp
   chat; admin generates the Stripe link manually. Optimize this; do NOT build
   self-serve signup/checkout.
2. **Primary desired action = "Message on WhatsApp."**
3. **Owner is "somewhat blind"** on competitors + persona → Discovery work weighted up.

## Headline finding
The landing page was built **backwards** relative to the goal. The dominant,
6×-repeated gold CTA pointed at `/portal` — a **login wall a prospect cannot pass**
(no self-serve signup). The actually-wanted action (WhatsApp) was a secondary
*ghost* button, **absent from the hero**. Maximum attention funnelled into a
dead-end; the desired action buried.

## What shipped this session (frontend, [[Inline Styling Convention]])
All in `frontend/src/pages/LandingPage.jsx` + `frontend/src/i18n/{ar,he}.js`:
1. **CTA hierarchy flipped → WhatsApp-primary.** Hero/TopNav/Personalization/final
   gold CTAs now call `onContact` (WhatsApp via [[Communication Settings]]); portal
   demoted to an "already a client? log in" text link. Verified AR + HE, RTL intact.
2. **Empty "AS FEATURED" claim removed** (was a credibility risk with no press behind it).
3. **Live sample invite surfaced** — hero + showcase link to `/d/demo/demo?demo=1`
   (reuses existing `?demo=1` demo render). Verified end-to-end.
4. **Social-proof band added** (`SocialProofSection`) — reads i18n `testimonials`,
   renders nothing while empty. **Deliberately NOT fabricated** — owner pastes real,
   consented quotes (name + town) to switch it on.
5. **Hero differentiators surfaced** via new trust-chips: live driver tracking,
   photo delivery proof, guest photo gallery, 24h service (all true features).

Build verified (3769 modules). Tested via Playwright MCP in AR + HE.

## ⚠️ Critical dependency (action for owner)
**Production `/api/settings/public` returns `{}` — no WhatsApp number is set.** Until
the WhatsApp business number is configured (admin Communication settings, or
`VITE_CONTACT_WHATSAPP`), every flipped "book" CTA **gracefully falls back to the
login screen** (`onContact` → portal). No regression vs. before, but **the WhatsApp
funnel is inert until that number is set.** This is the single highest-leverage next
step. See [[Communication Settings]].

## Discovery deliverables (this session)
- [[Competitor Landscape]] — real named competitors; the digital invite is a
  commodity, the *operation* is the moat; objection table for the WhatsApp script.
- [[Buyer Persona]] — hypothesis grounded in the brief (user vs. family-as-payer);
  flagged for validation against real customers.
- [[Conversion KPIs]] — North Star (paid weddings/month) + funnel KPIs + cadence;
  notes the top-of-funnel measurement gap.

## Honest no's / deferred (with reasons)
- **Self-serve signup + embedded checkout** — against the chosen high-touch model.
- **Top-of-funnel WhatsApp-click tracking** — needs a DB-writing endpoint; deferred
  to a separate go-ahead per the project's "ask before DB changes" rule. Blocks
  `lead→paid %` until done (see [[Conversion KPIs]]).
- **Real testimonial content** — owner supplies; never fabricated.
- **Heavy analytics stack (GA4/Mixpanel) + sitemap restructure** — not worth it at
  current volume / structure is already sound.

## Verdict-by-item summary
| Item | Verdict |
|---|---|
| Competitor analysis | Implement now (lightweight) — done as [[Competitor Landscape]] |
| Persona work | Implement now (lightweight) — done as [[Buyer Persona]], needs validation |
| Defined business goals/KPIs | Implement now — done as [[Conversion KPIs]] |
| Sitemap | Mostly skip (sound) + 1 add (sample node) — added |
| User flows | Fix prospect flow — done via CTA flip |
| Content hierarchy | Copy/sequence pass — partial (chips + CTA order + AS FEATURED) |
| Intentional CTAs | Implement now — **done (headline fix)** |
| Conversion funnels | Minimal tracking — **deferred (DB endpoint)** |
| Social-proof placement | Implement now — band shipped; content pending owner |

Related: [[Dawa]] · [[Product Audit 2026-06-13]] · [[Audit Remediation 2026]] · [[Communication Settings]] · [[Admin Analytics]] · [[Payments]]
