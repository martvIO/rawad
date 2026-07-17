# Codebase Organization

How this repository is laid out, where new code goes, and why. Established
2026-06-12 during the repo re-layout (see git history around that date).

---

## Top-level layout — four main folders

```
rawad/
  frontend/      The Vite + React app (everything the browser runs)
    src/                  components, pages, hooks, services, utils, i18n, …
    public/               static assets served as-is (face-api models)
    e2e/                  Playwright CI specs + page objects
    scripts/              build-vite.cjs (hosting predeploy), download-face-models.cjs
    index.html, vite.config.js, vitest.config.js, playwright.config.ts
    package.json          app deps; unit tests run here
    .env / .env.production  (untracked Vite env files)
    dist/                 build output (gitignored)

  backend/       Everything that runs on Firebase servers
    functions/            the deployable Cloud Functions package (Express REST API,
                          SSR preview, OG images, face-index trigger)
    tests/                functions unit tests + RTDB rules integration tests
    scripts/              build-functions.cjs (deploy predeploy), seed-emulator.cjs,
                          one-off migrations/backfills
    vitest.config.js      functions-unit + rules-integration projects

  loadtest/      Python/Locust load-testing suite (self-contained venv)

  app/           RESERVED — intentionally empty (.gitkeep only). Future use.

  (root)         Firebase project config (firebase.json, .firebaserc, *.rules,
                 firestore.indexes.json), thin orchestrator
                 package.json, CLAUDE.md, README.md, log.md, docs/, examples/,
                 wiki/ + graphify-out/ + memory/ (knowledge base — not app code)
```

The root `package.json` is an **orchestrator only**: its scripts delegate into
`frontend/` (`npm --prefix frontend run …`) and `backend/` (`node
backend/scripts/…`, `vitest -c backend/vitest.config.js`). Don't add app
dependencies to it — they belong to `frontend/package.json` or
`backend/functions/package.json`.

Firebase config stays at the root because `firebase deploy` runs from the repo
root: `firebase.json` points hosting at `frontend/dist` and functions at
`backend/functions`.

---

## Placement rule (frontend/src)

- **`src/pages/`** — route-mounted screens only: one component per route in
  `App.jsx`, including the role portals under `pages/portal/<role>/`.
- **`src/components/`** — anything rendered by **2+ routes**, or by both public
  and portal surfaces. Domain subfolders are fine (`components/digital/`).
- **`components/digital/` vs `pages/portal/groom/digital/`** — the former is
  the public-facing *render* of an invitation (`DigitalInvitationView`,
  `DigitalInvitationPreviewModal`); the latter is the groom's *editing*
  screens. The editor imports the View for live preview. **Pages may import
  components; components must never import from pages.**
- **`src/hooks/`** — hooks shared across screens. A hook used by a single
  section/component stays co-located with it.
- `DigitalInvitationView` lives in `components/digital/` because it has three
  consumers: the public page (`pages/DigitalInvitationPage`), the admin preview
  modal, and the groom editor preview.

## Backend layout rule

- One Express router per REST resource in
  `backend/functions/src/api/routes/` (large resources may be a directory of
  sub-routers with an `index.ts` re-export — mount paths never change).
- Standalone `onRequest`/trigger functions (SSR preview, OG image, face
  indexing) stay top-level in `backend/functions/src/`, exported from
  `index.ts`.
- Functions unit tests live in `backend/tests/functions/` (they import
  directly from `../../functions/src/...`); RTDB rules tests in
  `backend/tests/rules/`.

---

## History: the GSAP rollback (don't re-litigate)

Commit `a034c34` (mistitled "Add verify-landing-hero-ar.png image…") was a
wholesale **rollback of the GSAP "engraved suite" redesign** — it restored
byte-identical pre-redesign versions of `DigitalInvitationView.jsx` and
`LandingPage.jsx`. The earlier 14-file section split of the invitation view
(commit `4323da9`) was lost as collateral, **not** rejected on its merits.
The old section files in git history contain the rejected GSAP design and must
never be restored; any re-split is a fresh extraction from current code.

## Monolith roadmap

Done / in progress (2026-06-12 session):
- `backend/functions/src/api/routes/digital.ts` (2,172 lines) → `digital/`
  directory of sub-routers, identical mount paths.
- `frontend/src/hooks/usePortalState.js` (1,012 lines) → domain hooks in
  `src/hooks/portal/`, composed inside `usePortalState`; the returned API
  surface is unchanged.
- `frontend/src/components/digital/DigitalInvitationView.jsx` (1,536 lines) →
  fresh re-extraction into `components/digital/sections/` + `inviteShared.jsx`.

Future seams (documented, not yet executed):
- **`LandingPage.jsx` (~1,163 lines)** — already one function per section
  (`TopNav`, `HeroSection`, `AboutSection`, `FeaturesSection`,
  `PersonalizationSection`, `ServicesSection`, `ProcessSection`,
  `ShowcaseSection`, `PricingSection`, `FaqSection`, `CtaSection`,
  `FooterSection`, plus `useScrollPos`/`useReveal`). Seam: `src/pages/landing/`
  with a `LandingPage.jsx` composer + `sections/*.jsx` + `useLandingScroll.js`.
- **`DigitalDesignEditor.jsx` (~1,187 lines)** — the real monolith is
  `DesignEditorBody`. Seams: `editorUtils.js` (`leaf`, `setLeaf`, `mergeLang`,
  epoch helpers, key lists), `DesignSwitcher.jsx`, `StatusBanner.jsx`,
  `ArrayEditor.jsx`, form primitives (`Section`, `ToggleRow`, `FormField`),
  then split `DesignEditorBody` into content/media/wishes/preview panels.

---

## Open security action item (owner: Mrwen)

`users.md` existed in pushed git history with plaintext portal credentials
(`rawad/Rawad2026`, `groom/Groom1234`, `driver/Driver1234`). Admin + groom
passwords were rotated 2026-06-11, but `driver/Driver1234` was verified still
working that day and `rawad`'s status is unknown. **Rotate `driver` (and
`rawad` if unchanged)** via `node backend/functions/scripts/resetUser.js`.
Deleting the file (done 2026-06-12) does not remove it from history; rotation
makes the leaked values worthless.
