# WebGL renders as a stage layer over the existing DOM substance

The cinematic reinvention is being designed in Three.js (via Claude design). Rather
than rewrite the invitation/landing render path in 3D, we mount the Three.js work as
a **stage layer** — a lazily-loaded WebGL canvas — behind and around the existing DOM
**substance layer** ([DigitalInvitationView.jsx](../../frontend/src/components/digital/DigitalInvitationView.jsx),
[LandingPage.jsx](../../frontend/src/pages/LandingPage.jsx)), which keeps owning text,
Scenes, RSVP, the 15-Palette theming, RTL, and accessibility. The stage is managed with
**react-three-fiber + drei** for React 18 lifecycle integration.

## Considered options

- **Stage over substance (chosen)** — DOM owns content; WebGL is an overlay/underlay canvas.
- **Parallel WebGL-first renderer behind a per-design flag**, with the old DOM tree kept as the explicit fallback codepath.
- **In-place WebGL-first rewrite** with a newly built static/video fallback.

## Why

The brief's hard constraints — graceful degradation on low-/mid-end phones, a
*complete* `prefers-reduced-motion` path, WCAG AA, the RSVP reachable without 3D,
server-rendered WhatsApp link previews (`digitalInvitePreview`), and a design language
that flexes across 15 Palettes — are satisfied *structurally* by this split: the
[[Poster fallback]] is just the substance layer with the canvas un-mounted, and 100% of
the existing accessible / RTL / bilingual / [[Snapshot]] / RSVP machinery is reused.

The other two options force us to re-solve accessibility, RTL, forms, and theming
*inside* 3D and to maintain two render paths in sync — large, slow, and risky against a
non-negotiable "RSVP must work fast without 3D" rule.

## Consequences

- The price we accept: content [[Scene]]s become depth-and-atmosphere *over* DOM, not
  content rendered *inside* 3D. The hero moments that justify the spectacle — the intro,
  the [[Envelope]] opening, the RSVP success burst — are still true canvas. If a Scene
  must be genuinely in-3D later, it is an additive exception, not the baseline.
- A **capability gate** + [[Poster fallback]] is required (no-WebGL / reduced-motion /
  low-end / WhatsApp in-app browser).
- The 15 Palettes are 2D-only tokens today (hex, CSS gradients, a `petal` radial). A
  **theming bridge** to PBR material/light parameters is required — see ADR 0002. It is a
  frontend-only change to the Palette definitions; the per-couple design document is
  untouched (still only `themeColor`/`fontFamily` keys), so no DB schema or rules sign-off.
- Three.js becomes a **lazily-loaded** dependency, never in the initial bundle, alongside
  the already-heavy `aws-amplify` / liveness / `recharts` / Sentry baseline.
