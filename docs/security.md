# Security — Dawa

---

## Threat Model

| Threat | Mitigation |
|---|---|
| Unauthenticated reads of guest data | RTDB default-deny; all reads require `auth != null` at minimum |
| Cross-role data access (driver reads admin data) | `auth.token.role === 'admin'` checks in RTDB rules + API middleware |
| Driver reads another groom's guests | `auth.token.assignedGrooms[groomUid] === true` check in RTDB rules |
| Groom modifies another groom's guests | Ownership check in RTDB rules: `$uid === auth.uid` |
| Unauthenticated proof photo upload | Storage rules gate on `assignedGrooms` claim |
| Spam on the public confirmation form | Rate limit: 5/hr per IP in `confirmations.ts` |
| Brute-force login | Rate limit: 10/hr per IP on `POST /auth/login` |
| Stale JWT after role change | `GET /auth/me` polled every 30s; `apiClient` retries with refreshed token on 401 |
| Admin service-account key exposure | Key excluded from git (`.gitignore`); should be stored in Secret Manager |
| Client-side XSS reading tokens | `localStorage` tokens are readable by JS in the same origin — acceptable trade-off vs. `httpOnly` cookies given CORS controls |
| CSRF | REST API uses Bearer tokens in headers (not cookies) — no CSRF risk |
| Clickjacking | `X-Frame-Options: DENY` header on all Hosting responses |
| Mixed content / downgrade attack | `Strict-Transport-Security: max-age=63072000; includeSubDomains; preload` |
| Malicious CDN content (Leaflet) | CDN URL pinned to specific version (`leaflet@1.9.4`) in `src/config/index.js`; `script-src` CSP includes `unpkg.com` |

---

## Three Security Rings

All three must be independently enforced — if one layer is bypassed, the others hold.

### Ring 1: Cloud Functions / REST API

`requireAuth` middleware (`functions/src/api/middleware/auth.ts`) verifies the Firebase ID token on every protected route using `getAuth().verifyIdToken()`. Token verification happens server-side — the client cannot forge claims.

For admin-only operations: `assertAdmin(req)` in `functions/src/helpers.ts` throws `permission-denied` before any logic runs if `req.caller.claims.role !== 'admin'`.

### Ring 2: RTDB Rules (`database.rules.json`)

Default-deny. Key checks:
- `auth != null` — any authenticated user
- `auth.token.role === 'admin'` — admin-only nodes
- `auth.uid === $uid` — ownership checks on per-user data
- `auth.token.assignedGrooms[$groomUid] === true` — driver data access
- `.validate` rules enforce schema types and required fields

### Ring 3: Storage Rules (`storage.rules`)

Proof photos: `request.auth.token.assignedGrooms[groomUid] == true` — only a driver assigned to the groom can upload.
Digital media: `request.auth.uid == groomUid` — only the owning groom can write.

---

## JWT Custom Claims

Claims are set by Cloud Functions and are immutable by the client.

```json
{
  "role": "admin | driver | groom",
  "username": "string",
  "assignedGrooms": { "[groomUid]": true }
}
```

**`assignedGrooms`** is stamped by `assignDriverToGroom` after the driver picks a groom. It is what the Storage rules check before allowing proof photo uploads.

**Claim refresh:** The client polls `GET /auth/me` every 30 seconds. On 401, `apiClient` refreshes the ID token and retries.

---

## Rate Limits

| Endpoint | Limit | Window |
|---|---|---|
| `POST /auth/login` | 10 req | 1 hour per IP |
| `POST /auth/refresh` | 60 req | 1 hour per IP |
| `POST /auth/send-otp` | 5 req | 1 hour per IP |
| `POST /auth/verify-otp` | 5 req | 1 hour per IP |
| `POST /auth/reset-password` | 3 req | 1 hour per phone |
| `POST /confirmations` | 5 req | 1 hour per IP |
| `POST /users` (createPortalUser) | 30 req | 1 hour per admin |
| `DELETE /users/:uid` | 30 req | 1 hour per admin |

Rate limits are in-memory per Cloud Function instance and reset on cold start. Acceptable for low-volume endpoints; not suitable as the only protection for high-value resources.

---

## HTTP Security Headers

Configured in `firebase.json`, applied by Firebase Hosting to all responses:

| Header | Value |
|---|---|
| `Strict-Transport-Security` | `max-age=63072000; includeSubDomains; preload` |
| `X-Content-Type-Options` | `nosniff` |
| `X-Frame-Options` | `DENY` |
| `Referrer-Policy` | `strict-origin-when-cross-origin` |
| `Permissions-Policy` | `geolocation=(self), microphone=(), camera=(self)` |
| `Content-Security-Policy` | Full allowlist (see `firebase.json`) |

**CSP allowlist includes:**
- `unpkg.com` — Leaflet CDN
- `www.google.com`, `www.recaptcha.net` — Phone Auth reCAPTCHA
- `firebasestorage.googleapis.com` — proof photos, media
- `*.tile.openstreetmap.org`, `*.basemaps.cartocdn.com`, `server.arcgisonline.com` — map tiles
- `nominatim.openstreetmap.org`, `photon.komoot.io` — geocoding (if used)
- `*.cloudfunctions.net` — REST API calls

---

## Sensitive Files

| File | Status | Action required |
|---|---|---|
| `dawa-aa793-firebase-adminsdk-fbsvc-e42554a05c.json` | In project root, excluded from git | Move to Secret Manager; delete local copy |
| `.env` | Local only, gitignored | Contains `WEB_API_KEY` — never commit |
| `.env.production` | In git | Contains only `VITE_USE_EMULATORS=0` — safe |

---

## Security Non-Issues (by design)

**No App Check** — removed because it caused false rejections on mobile WebViews. The public confirmation form is protected by rate limiting (5/hr/IP) instead.

**`unsafe-inline` in CSP `style-src`** — present because React's inline styles and injected `<style>` tags require it. This is a known trade-off when using inline styles. Script injection is still blocked by the `script-src` allowlist.

**in-memory rate limiting** — not shared across Cloud Function instances. Acceptable for the current scale; upgrade to Firestore-backed or Redis-backed if abuse is observed.
