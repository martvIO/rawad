# HTTP header & origin evidence — https://dawa.to

Collected 2026-07-16 via `curl -sI` (read-only GETs). Raw capture: session scratchpad `headers-raw.txt`.

## Per-path header matrix

| Path | Status | Content-Type | Cache-Control | Notes |
|---|---|---|---|---|
| `/` | 200 | text/html | `no-cache` | Full security header set present (see below) |
| `/assets/index-BFAyOOb1.js` (real hashed chunk) | 200 | application/javascript | `public, max-age=31536000, immutable` | Correct for hashed assets |
| `/assets/<nonexistent>.js` | **200** | **text/html** (index.html body, same ETag as `/`) | **`public, max-age=31536000, immutable`** | ⚠️ SPA catch-all rewrite serves index.html for missing assets **with a 1-year immutable cache header** — a stale-chunk request after a deploy gets HTML-as-JS poisoned into the browser/CDN cache for a year |
| `/favicon.svg` | 200 | image/svg+xml | `no-cache` | Not long-cached |
| `/og-default.png` | 200 | image/png | `no-cache` | 110 KB, re-fetched every share-crawl |
| `/site.webmanifest` | 200 | application/manifest+json | `no-cache` | |
| `/robots.txt` | 200 | text/plain | `no-cache` | Body: `Disallow: /portal`, `Disallow: /og/`; comment admits `X-Robots-Tag: noindex` for `/d/**` is a TODO |
| `/sitemap.xml` | **200** | **text/html** | `no-cache` | **No sitemap exists** — SPA shell returned instead (soft-200) |
| `/models/tiny_face_detector_model-weights_manifest.json` | 200 | application/json | `no-cache` | 7.7 MB face-api model dir IS deployed and publicly served, not long-cached |
| `/this-route-does-not-exist-xyz` | **200** | text/html | `no-cache` | **Soft-404**: unknown routes return 200 + shell |

## Security headers on `/` (all present)

- `strict-transport-security: max-age=63072000; includeSubDomains; preload`
- `x-content-type-options: nosniff`, `x-frame-options: DENY`
- `referrer-policy: strict-origin-when-cross-origin`
- `permissions-policy: geolocation=(self), microphone=(), camera=(self)`
- `content-security-policy`: default-src 'self'; script-src includes gstatic/google/googletagmanager/recaptcha/unpkg/AWS-liveness; style-src includes `'unsafe-inline'` + fonts.googleapis + unpkg; img-src includes OSM/arcgis/carto tiles + firebasestorage; connect-src includes Cloud Run API + AWS Cognito/Rekognition; object-src 'none'; base-uri 'self'; form-action 'self'

## Origins & redirects

| Probe | Result |
|---|---|
| `http://dawa.to/` | `301 → https://dawa.to/` ✓ |
| `https://www.dawa.to/` | **No DNS record** (dig empty, connection fails) — www subdomain unreachable |
| `https://dawa-aa793.web.app/` | 200, identical app — **duplicate origin, no canonical tag anywhere** |
| `https://dawa.to/d/demo/demo?demo=1` | 200; **no `X-Robots-Tag`** header despite robots.txt comment recommending it |

## Cloud Function shell latency (`/d/**` rewrite → `digitalInvitePreview`)

| State | TTFB |
|---|---|
| Cold (first hit) | **5.99 s** |
| Warm (immediately after) | 0.39 s |

Body served is the 3.3 KB OG-injected SPA shell.

## Secondary deploy target

`netlify.toml` (repo root): base=frontend, SPA redirect only — **no security headers, no cache headers** defined. If the Netlify deploy is live, it serves the same app without HSTS/CSP/nosniff and without immutable asset caching. (Netlify URL not identified in repo; treated as configuration-level finding.)
