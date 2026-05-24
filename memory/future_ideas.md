# Future Ideas — Dawa Platform

_Non-committed; ideas for future consideration. Do not implement without explicit approval._

---

## Performance

- **Route-based code splitting** — `React.lazy()` + `<Suspense>` on portal sub-routes. Currently ~775 KB bundle (larger with face-api.js). Admin/driver/groom rarely loaded together.
- **Proof photo CDN thumbnails** — Firebase Storage with image transformation URLs. Currently full-res images load in the proof gallery.
- **SSE for live locations** — Already partially done for driver GPS. Extend to confirmations tab so admin sees new submissions in real-time without polling.

## Features

- **Push notifications** — Web Push API for drivers (new delivery assigned) and grooms (guest confirmed).
- **Guest QR codes** — Generate a QR code per guest for door check-in at the wedding.
- **Batch invite send** — Select all un-sent guests in one click and open WhatsApp for each with a staggered timer (already partially in AdminSendTab).
- **Delivery route optimization** — Sort the driver's delivery list by geographic proximity (Leaflet + Haversine distance).
- **Confirmation deduplication** — When the same phone submits the form twice, update rather than create a second record.
- **Groom-to-driver messaging** — In-app notes between groom and assigned driver.

## Technical / DevOps

- **CI/CD pipeline** — GitHub Actions: lint, unit tests, integration tests, deploy to Firebase on merge to main.
- **Bundle analysis** — `rollup-plugin-visualizer` to audit bundle composition; decide whether to remove `face-api.js`.
- **Error monitoring** — Integrate Sentry (or Firebase Crashlytics) for frontend JS errors.
- **API versioning** — Prefix routes `/v1/` before the API contract stabilizes, to allow non-breaking migration.
- **RTDB → Firestore migration** — RTDB is eventually-consistent and has inflexible query support. Long-term, migrate guests and confirmations to Firestore for richer queries.
- **Emulator seed script** — `scripts/seed-emulator.cjs` exists but its completeness is unknown. Document and validate it.
- **Automated smoke tests** — Extend `docs/SMOKE_TEST.md` into a Playwright script.

## Security

- **Refresh token rotation** — Currently the refresh token from Firebase never rotates unless revoked. Consider adding server-side session tracking.
- **API key rotation schedule** — Document how to rotate `WEB_API_KEY` and Firebase config keys.
- **Security headers audit** — Review CSP against latest browser requirements; `'unsafe-inline'` in `style-src` could be tightened.
