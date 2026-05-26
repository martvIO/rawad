# File Index — Dawa

_Generated from codebase inspection on 2026-05-24. Update whenever files are added or removed._

---

## Root

| File | Purpose |
|---|---|
| `package.json` | Frontend dependencies and npm scripts |
| `vite.config.js` | Vite build config |
| `vitest.config.js` | Vitest test config — defines `unit` and `integration` projects |
| `firebase.json` | Firebase project config (hosting rewrites, emulator ports, security headers) |
| `database.rules.json` | RTDB default-deny security rules |
| `firestore.rules` | Firestore security rules |
| `firestore.indexes.json` | Firestore composite index definitions |
| `storage.rules` | Firebase Storage security rules |
| `netlify.toml` | Netlify build config + SPA fallback |
| `index.html` | Vite HTML entry point |
| `tsconfig.json` | Root TypeScript config (for VS Code; actual build uses functions/tsconfig.json) |
| `.env` | Local environment variables (gitignored) |
| `.env.production` | Production env overrides (`VITE_USE_EMULATORS=0`) |
| `.npmrc` | npm config (`foreground-scripts=true` for Windows build compat) |
| `.firebaserc` | Firebase project alias (`dawa-aa793`) |
| `build-functions.cmd` | Windows CMD wrapper for functions build |
| `build-vite.cmd` | Windows CMD wrapper for Vite build |
| `re.js` | **UNUSED** — reCAPTCHA Enterprise sample. Safe to delete. |

---

## `src/`

### Entry & Routing
| File | Purpose |
|---|---|
| `main.jsx` | React entry — mounts `<App>` in `<StrictMode>` + `<BrowserRouter>` |
| `App.jsx` | Root routes (`/`, `/confirm/:groomUsername`, `/invite/:token`, `/invite/digital/:token`, `/d/:groomUsername/:token/*`, `/portal/*`). Owns language state. Back-compat `?form=` rewrite. |
| `firebase.js` | Firebase SDK init (Auth, RTDB, Firestore, Storage, Functions) + emulator wiring |

### `src/config/`
| File | Purpose |
|---|---|
| `index.js` | Centralized config: `API_BASE_URL`, `INVITE_BASE_URL`, `POLL_MS`, `TIMING`, `GEO`, `TOKEN_MGR`, `MATCHING`, `LEAFLET`, `MAP_TILES`, `ADDRESS_JOINER` |

### `src/constants/`
| File | Purpose |
|---|---|
| `roles.js` | `ROLES` frozen object (`ADMIN`, `DRIVER`, `GROOM`) + `ROLE_VALUES` array |
| `storageKeys.js` | localStorage key constants |
| `matchStatuses.js` | Match status constants (`GREEN`, `RED`, `UNKNOWN`) |

### `src/assets/`
| File | Purpose |
|---|---|
| `brandSvg.js` | SVG string for the Dawa brand logo |

### `src/styles/`
| File | Purpose |
|---|---|
| `theme.js` | Design tokens: `C` (colors), `ROLE` (role accents), `S` (style fragments) |
| `GlobalStyle.jsx` | Injects global CSS: keyframes, base reset, `.gold-card`, `.input-field`, `.gold-btn`, scrollbar |

### `src/i18n/`
| File | Purpose |
|---|---|
| `ar.js` | Arabic string map (default language) |
| `he.js` | Hebrew string map |
| `index.js` | `makeT(lang)` factory + `STRINGS` registry |

### `src/data/`
| File | Purpose |
|---|---|
| `status.js` | `STATUS` (delivery), `REPLY_STATUS` (invite), `replyStateOf(guest)` |
| `cities.js` | Static Israeli cities list for autocomplete |
| `inviteContent.js` | WhatsApp message templates (premium/standard) |
| `sampleGuests.js` | Dev-only seed data |

### `src/utils/`
| File | Purpose |
|---|---|
| `tokenManager.js` | localStorage-backed token lifecycle (idToken + refreshToken + expiry) |
| `apiClient.js` | `fetch()` wrapper — Bearer auth, 401 refresh+retry, multipart upload, `ApiError` class |
| `poller.js` | `createPoller(fetchFn, callback, opts)` — REST polling to replace RTDB `onValue` |
| `matchUtils.js` | Phone normalization, Dice/Jaccard fuzzy matching, `classifyAll(confirmations, guests)` |
| `geo.js` | `extractCoords`, `toEmbedUrl`, Waze/Google/Apple Maps links, `getCurrentFix`, `extractCity` |
| `phone.js` | `toIntlPhone`, `telLink`, `validatePhone`, `isPlaceholderPhone` |
| `validation.js` | `validateName` (requires 2+ words) |
| `password.js` | `PASSWORD_RULES`, `evaluatePassword`, `isStrongPassword` |
| `storage.js` | `load`, `save`, `removeKey` (localStorage wrappers) |
| `logger.js` | Tagged `[dawa]` console wrapper — silent in prod unless `VITE_DEBUG=1` |

### `src/services/`
| File | Purpose |
|---|---|
| `_helpers.js` | `subscribeList(path, cb, mapItem?)` (RTDB onValue→array) + `callable(name)` (HTTPS callable with auto-retry) |
| `auth.js` | `signIn`, `signOut`, `subscribeAuth`, `subscribeIdToken`, `forceRefreshToken`, `fetchProfile`, `sendPasswordResetCode`, `confirmPasswordResetCode` |
| `guests.js` | `subscribeAllGuests`, `subscribeGuestsForGroom`, `addGuest`, `updateGuest`, `removeGuest` |
| `users.js` | `subscribeUsers`, `subscribeGroomProfiles`, `createPortalUser`, `deletePortalUser`, `updatePortalUser`, `adminSetPassword`, `setAdminClaim`, `callResetPassword` |
| `confirmations.js` | `subscribeConfirmations`, `submitConfirmation`, `attachConfirmationLocationToGuest`, `updateConfirmation` |
| `liveLocations.js` | `publishMyFix`, `clearMyLocation`, `subscribeDriversForGroom` |
| `proofs.js` | `uploadProofBlob`, `proofDownloadUrl`, `dataUrlToBlob` |
| `invites.js` | `createGuestInvite`, `submitGuestInvite`, `subscribeInviteToken` |
| `assignments.js` | `assignDriverToGroom`, `subscribeAssignmentsFor` |
| `adminSettings.js` | `subscribeSettings`, `saveSettings` |
| `digitalInvitation.js` | Firestore-backed: digital guests, media, photographer files CRUD |
| `designRequests.js` | Design request CRUD (admin + groom) |

### `src/hooks/`
| File | Purpose |
|---|---|
| `usePortalState.js` | **Single source of truth** for all portal state, auth, Firebase subscriptions, handlers |
| `useGeolocation.js` | GPS `watchPosition` + RTDB publish/subscribe; stale-filters drivers >30s |
| `useLeaflet.js` | Lazily injects Leaflet 1.9.4 CSS + JS from CDN; returns `ready` boolean |

### `src/context/`
| File | Purpose |
|---|---|
| `PortalContext.jsx` | `PortalProvider` runs `usePortalState` once; `usePortal()` consumer hook |

### `src/pages/`
| File | Purpose |
|---|---|
| `LandingPage.jsx` | Public marketing page (`/`) |
| `ConfirmationForm.jsx` | Guest attendance form (`/confirm/:groomUsername`) |
| `InviteForm.jsx` | Handwritten per-guest invite form (`/invite/:token`) |
| `DigitalInviteForm.jsx` | Digital per-guest invite form (`/invite/digital/:token`) |
| `DigitalInvitationPage.jsx` | Public digital invitation page (`/d/:groomUsername/:token/*`) |
| `DigitalYourPhotos.jsx` | Public photographer gallery sub-page |
| `portal/LoginScreen.jsx` | Login form |
| `portal/LogoutPage.jsx` | Clears session + redirects to `/` |
| `portal/Portal.jsx` | Auth guard + `PortalProvider` + role routing |
| `portal/admin/AdminPortal.jsx` | Admin shell: header + tab navigation |
| `portal/admin/AdminUserManager.jsx` | Full CRUD for portal accounts |
| `portal/admin/AdminSendTab.jsx` | WhatsApp bulk-send with per-guest invite links |
| `portal/admin/AdminConfirmationsTab.jsx` | Real-time confirmation feed with GREEN/RED/Unknown matching |
| `portal/admin/AdminSettingsTab.jsx` | Edit WhatsApp template + confirmation form link |
| `portal/admin/AdminDesignRequests.jsx` | View and manage groom design requests |
| `portal/driver/DriverPortal.jsx` | Driver shell: tabs after groom picked |
| `portal/driver/DriverPickGroom.jsx` | Groom selection (required first step) |
| `portal/driver/DriverDeliveryList.jsx` | City-grouped delivery list + photo upload |
| `portal/driver/DriverMap.jsx` | Leaflet map of guest pins for selected groom |
| `portal/driver/DriverShareLocation.jsx` | GPS sharing — pick grooms + toggle |
| `portal/driver/SharedCities.jsx` | City-grouped summary of guests across shared grooms |
| `portal/groom/GroomPortalView.jsx` | Routes to type-select / handwritten / digital |
| `portal/groom/GroomTypeSelect.jsx` | Choose handwritten or digital invite type |
| `portal/groom/GroomHandwrittenShell.jsx` | Shell for handwritten invite flow |
| `portal/groom/GroomDashboard.jsx` | Delivery stats + recent activity |
| `portal/groom/GroomGuests.jsx` | Paginated guest list with status pills |
| `portal/groom/GroomAddGuest.jsx` | Add-guest form |
| `portal/groom/GroomGuestsMap.jsx` | Leaflet map of all guests with coordinates |
| `portal/groom/GroomLiveMap.jsx` | Live driver GPS map |
| `portal/groom/GroomProofs.jsx` | Delivery proof photo gallery |
| `portal/groom/digital/DigitalPortal.jsx` | Digital invite shell: 4 tabs |
| `portal/groom/digital/DigitalDashboard.jsx` | Digital stats + background media upload |
| `portal/groom/digital/DigitalGuests.jsx` | Digital guest list with 3-state status cycling |
| `portal/groom/digital/DigitalAddGuest.jsx` | Add guest to digital list — **KNOWN BUG: hangs** |
| `portal/groom/digital/DigitalPhotographer.jsx` | Photographer file upload/gallery |
| `portal/groom/digital/DigitalDesignRequest.jsx` | Groom submits custom design request |

### `src/components/`
| File | Purpose |
|---|---|
| `ErrorBoundary.jsx` | Top-level React error boundary; bilingual fallback with reload button |
| `RoleGuard.jsx` | Client-side role gate (convenience only) |
| `Toast.jsx` | Fixed-position top notification |
| `Skeleton.jsx` | Loading skeleton placeholder |
| `BrandLogo.jsx` | Renders SVG brand mark |
| `LangSwitcher.jsx` | AR / HE toggle |
| `LogoutConfirm.jsx` | Confirm-before-logout dialog |
| `PhoneInput.jsx` | E.164 formatted phone field |
| `CityField.jsx` | Israeli cities autocomplete |
| `AddressInput.jsx` | Composite city + street + house |
| `StreetField.jsx` | Street name with suggestions |
| `LiveMap.jsx` | Leaflet map of driver markers |
| `MapPickerInline.jsx` | Draggable Leaflet map picker |
| `GuestMapModal.jsx` | Full-screen guest location modal |
| `PhotoViewer.jsx` | Proof photo lightbox |
| `GroomMultiSelect.jsx` | Multi-select groom username picker |
| `EditGuestModal.jsx` | Modal: edit guest record |
| `EditUserModal.jsx` | Modal: edit portal user account |
| `EditConfirmationModal.jsx` | Modal: edit confirmation record |
| `PasswordResetFlow.jsx` | 2-step phone OTP reset |
| `PasswordRules.jsx` | Visual password strength checklist |

### `src/__tests__/`
| File | Purpose |
|---|---|
| `utils/apiClient.test.js` | Unit tests for apiClient.js |
| `utils/geo.test.js` | Unit tests for geo.js |
| `utils/matchUtils.test.js` | Unit tests for matchUtils.js |
| `utils/password.test.js` | Unit tests for password.js |
| `utils/phone.test.js` | Unit tests for phone.js |
| `utils/poller.test.js` | Unit tests for poller.js |
| `utils/storage.test.js` | Unit tests for storage.js |
| `utils/tokenManager.test.js` | Unit tests for tokenManager.js |
| `utils/validation.test.js` | Unit tests for validation.js |
| `data/status.test.js` | Unit tests for status.js |
| `services/services.test.js` | Service layer unit tests |

---

## `functions/src/`

### API Layer (`functions/src/api/`)
| File | Purpose |
|---|---|
| `index.ts` | Express app factory — mounts all routers, CORS, JSON body, error handler |
| `middleware/auth.ts` | `requireAuth` middleware — verifies Firebase ID token, attaches `req.caller` |
| `middleware/rateLimit.ts` | `ipRateLimit(key, limit, windowMs)` middleware factory |
| `routes/auth.ts` | POST /login, /logout, /refresh, /reset-password; GET /me; POST /send-otp, /verify-otp |
| `routes/users.ts` | Admin CRUD for portal accounts |
| `routes/guests.ts` | Guest CRUD (sharded by groomUid) |
| `routes/confirmations.ts` | POST (public), GET (admin), PATCH (admin) |
| `routes/liveLocations.ts` | Driver GPS publish/subscribe (SSE) |
| `routes/invites.ts` | Create invite token, submit invite |
| `routes/assignments.ts` | Driver → groom assignment |
| `routes/proofs.ts` | Proof photo upload (multipart) |
| `routes/digital.ts` | Digital guests, media, photographer files |
| `routes/settings.ts` | Admin settings read/write |

### Legacy Callable Cloud Functions
| File | Purpose |
|---|---|
| `index.ts` | Exports both `api` (Express) and all legacy callables |
| `helpers.ts` | `assertAdmin`, validators, phone utils, `isStrongPassword` |
| `users.ts` | `createPortalUser`, `deletePortalUser`, `setAdminClaim` callables |
| `updateUser.ts` | `updatePortalUser` callable |
| `adminSetPassword.ts` | `adminSetPassword` callable |
| `assignments.ts` | `assignDriverToGroom` callable |
| `confirmations.ts` | `submitConfirmation` callable (public, rate-limited) |
| `attachLocation.ts` | `attachConfirmationLocationToGuest` callable |
| `invite.ts` | `createGuestInvite` + `submitGuestInvite` callables |
| `resetPassword.ts` | `resetPassword` callable (phone-OTP verified) |
| `digitalInvite.ts` | Digital invitation callable |
| `digitalInvitePreview.ts` | SSR digital invitation preview function |
| `audit.ts` | `writeAudit` internal helper |
| `rateLimit.ts` | In-memory sliding-window rate limiter |
| `constants/` | `format.ts`, `limits.ts`, `rateLimits.ts`, `time.ts`, `tokens.ts` |

---

## `tests/`

| File | Purpose |
|---|---|
| `database.test.js` | Integration tests against Firebase Database emulator |
| `rules/database.rules.test.js` | RTDB security rule tests |
| `functions/helpers.test.ts` | Unit tests for `functions/src/helpers.ts` |
| `functions/rateLimit.test.ts` | Unit tests for `functions/src/rateLimit.ts` |
| `functions/stripApiPrefix.test.ts` | Unit tests for `stripApiPrefix` middleware |

---

## `scripts/`

| File | Purpose |
|---|---|
| `build-functions.cjs` | Wipes `functions/lib/` + `tsconfig.tsbuildinfo` before tsc (prevents stale cache) |
| `build-vite.cjs` | Runs Vite build via dynamic import (Windows ESM compatibility) |
| `seed-emulator.cjs` | Seeds emulator with test data |

## `functions/scripts/`

| File | Purpose |
|---|---|
| `seedAdmin.js` | Bootstrap first admin account (run once) |
| `inspectUser.js` | Dump Auth record + RTDB profile + claims |
| `resetUser.js` | Reset password + optionally stamp admin claim |
| `fixAdminClaim.js` | One-off repair for missing role claim |
| `migrateClaims.js` | Backfill `{role, username}` on all Auth users |
