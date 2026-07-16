# Build & bundle evidence — fresh `npm run build`, 2026-07-16

Vite 5.4.21, 4121 modules, built in 3.64 s. `frontend/dist/` total: **12 MB**, of which `dist/models/` = **7.7 MB**.

## Chunk table (verbatim from Vite output)

| Chunk | Size | Gzip |
|---|---:|---:|
| `index.html` | 3.90 kB | 1.81 kB |
| `assets/destination-love-C9VCTUQD.jpg` | 10.48 kB | — |
| `assets/LivenessCapture-SrCJ8IIs.css` | 315.40 kB | 30.11 kB |
| `assets/toString-bYoCTrHq.js` | 1.25 kB | 0.68 kB |
| `assets/TemplateGalleryPage-DMo7GLlc.js` | 2.35 kB | 1.04 kB |
| `assets/Scene3D-Bdbc3eCQ.js` | 3.90 kB | 1.96 kB |
| `assets/index.browser-CSGu9rmu.js` | 4.67 kB | 1.94 kB |
| `assets/web-vitals-XmI6MyaH.js` | 5.94 kB | 2.43 kB |
| `assets/OnboardingChecklist-C4fVBQc6.js` | 8.78 kB | 3.08 kB |
| `assets/DigitalYourPhotos-NtVdF8HA.js` | 12.35 kB | 4.98 kB |
| `assets/CelestialCanvas-CRgtC0Rr.js` | 31.21 kB | 12.42 kB |
| `assets/index-GPP7idwB.js` | 37.38 kB | 12.14 kB |
| `assets/DriverPortal-FjooR2AD.js` | 54.67 kB | 14.60 kB |
| `assets/gallery-FAwSQfht.js` | 68.20 kB | 21.18 kB |
| `assets/GroomPortalView-CYkH3pqy.js` | 71.34 kB | 22.55 kB |
| `assets/AdminPortal-DfP9HVbd.js` | 118.80 kB | 31.22 kB |
| `assets/AdminAnalytics-DOo-ex0t.js` | 436.55 kB | 118.64 kB |
| `assets/three.module-Ctu3ud4c.js` | 513.21 kB | 129.03 kB |
| **`assets/index-mHFYgxkl.js` (main entry)** | **654.55 kB** | **215.61 kB** |
| `assets/LivenessCapture-CJxwkcCM.js` | 1,666.96 kB | 335.18 kB |

Vite emitted its own warning: *"Some chunks are larger than 500 kB after minification … Use build.rollupOptions.output.manualChunks"*.

## Config facts

- `frontend/vite.config.js` has **no `build` block** — no `manualChunks`, default esbuild minify, default chunk-size warning. Code splitting exists only via `React.lazy` boundaries (per-role portals, gallery, analytics, liveness, three.js scenes).
- Route-level lazy loading confirmed for: TemplateGalleryPage, AdminPortal, DriverPortal, GroomPortalView, AdminAnalytics, LivenessCapture, CelestialCanvas/Scene3D/DestinationLoveView, DigitalYourPhotos.

## Static source greps (frontend/src)

| Check | Result |
|---|---|
| `<img>` tags total / without `loading=` attr | 17 / **14** |
| `srcset` usage | **0** |
| `<label>` count / `htmlFor` count | 40 / **15** (≈25 labels not explicitly associated) |
| Head manager (`react-helmet`, `document.title`) | **none** — every route ships the identical static AR `<title>` + meta description |
| `sitemap.xml` in `frontend/public/` | **absent** |
| References to `/models/` face-api shards in `frontend/src` | **none** (backend `faceIndex/match.ts` works on descriptors only; `frontend/public/models/` 7.7 MB is deployed dead weight) |

## Skill static analyzer

`.agents/skills/web-quality-audit/scripts/analyze.sh` on `frontend/index.html` and `frontend/dist/`: **0 issues, 0 warnings** (doctype, charset, viewport, lang, title, img-alt basics all pass).
