# Stage theming derives from the 2D Palette, with optional per-Palette 3D overrides

The 15 Palettes ([digitalThemes.js](../../frontend/src/styles/digitalThemes.js)) are 2D
tokens (hex, CSS gradients, a `sparkleGlow`) with no PBR vocabulary, yet the brief
requires the cinematic language to flex across all 15. We bridge with a **pure
`paletteToStageEnv(palette)` function** that derives Three.js light / material / post
parameters from the existing tokens (key & fill light from `accent`/`text`; background
grade and fog from `bg`/`overlay`; gold metalness / roughness / anisotropy from foil
defaults; bloom strength from `sparkleGlow`). A Palette may *optionally* add a `stage`
sub-object to override any derived value. Frontend-only — the per-couple design doc and DB
rules are untouched.

## Considered options

- **Derive-first, with optional per-Palette overrides (chosen)**
- Author a full 3D descriptor by hand for each of the 15 Palettes
- One hard-coded hero look that Palettes merely tint

## Why

Derive-first gives all 15 Palettes a credible stage on day one with zero per-Palette
authoring, which is exactly what "flex across all palettes" demands. The optional
override is an escape hatch so the flagship gold-on-black look can be tuned without
imposing that work on the other 14. Hand-authoring 15 descriptors is slow and silently
drifts out of sync whenever a Palette's 2D tokens change. A single tinted look fails the
brief's "design a *system*" mandate and makes the non-gold Palettes read as an afterthought.

## Consequences

- The derive function is the single source of truth: change a 2D token and the stage shifts
  with it, keeping the [[Poster fallback]] and the canvas coherent.
- Per-Palette `stage` overrides are additive — no migration when one is added.
- No DB schema or rules change; the `themeColor`/`fontFamily` keys still fully describe a
  couple's choice, so every existing [[Snapshot]] gets the new stage automatically.
