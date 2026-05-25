# Fixes Log

A chronological record of what broke during the first Playwright runs and
what was needed to get the suite green. Useful when porting tests to CI or
when the next dev hits the same wall.

---

## 1. Auth route hardcoded production Firebase URL (real bug — fixed in source)

**Symptom:** Every login test got 401 `invalid_credentials`. Seed inserted
users into the local Auth emulator (port 9099), but `/api/auth/login` was
hitting `https://identitytoolkit.googleapis.com` directly — completely
bypassing the emulator. Live Google Auth doesn't know about `admin@dawa.local`.

**Fix:** `functions/src/api/routes/auth.ts` — replaced the two hardcoded
constants with `identityToolkitBase()` / `secureTokenBase()` functions that
detect `FIREBASE_AUTH_EMULATOR_HOST` and rewrite to the emulator path
`http://{host}/identitytoolkit.googleapis.com/v1/accounts`. Added
`effectiveApiKey()` so the emulator (which accepts any non-empty key) can
work without `WEB_API_KEY` set.

This is a real bug — *any* local e2e testing would have hit it. The fix
also unblocks future automated CI runs.

## 2. Seed didn't reset existing passwords

**Symptom:** Reseeding said "exists: admin (...)" but login still failed
because the seed-generated password didn't overwrite the one stored from
the first run.

**Fix:** `scripts/seed-emulator.cjs` `ensureUser()` — added an
`auth.updateUser(uid, { password, displayName, phoneNumber })` call when
the user already exists. Reseed is now idempotent.

## 3. Seed inserted guests with wrong field names

**Symptom:** Admin send tab showed "عدد المدعوين: 0" for the seeded groom;
driver delivery list rendered no guests.

**Cause:** Seed wrote `{ phoneE164, city, street, house }` but the app
reads `{ phone, area, status, inviteType, groomUid, groomUsername }`. The
filter `g.groomUsername === adminSelectedGroom` matched zero rows.

**Fix:** `scripts/seed-emulator.cjs` — updated the `GUESTS` constant to
match the app schema, and added `groomUid` + `groomUsername` to the push
payload. Also clears the bucket before re-pushing so reseeds don't
accumulate duplicates.

## 4. Groom add-guest test couldn't find the area input

**Symptom:** `groom.areaField.fill()` failed because `field-guest-area`
was placed on the wrapping `<div>`, not on the actual input. The
AddressInput component wraps a CityField + StreetField; neither inherits
the test id.

**Fix:** `e2e/pages/GroomDashboardPage.ts` — scoped to
`areaField.locator(".input-field").first()` (the CityField's text input).

## 5. CityField selector clash on the confirmation form

**Symptom:** `InvitationPage.fill()` reached for `.input-field nth(2)`
which used to be the city input. After we tagged name/street/house with
test ids, the `.input-field` nth-order shifted and `.nth(2)` landed on
the street input.

**Fix:** Added `data-testid="field-city"` to `CityField`, then switched
`InvitationPage.fill()` to target it directly. Also added a click-outside
step so the city autocomplete dropdown closes before submitting.

## 6. Invite token stub URL didn't match the real route

**Symptom:** Three invite-token tests timed out waiting for the
`conf-invalid` / `conf-used` / `conf-expired` titles. The stub matched
`**/invites/tokens/**` but the real route is `/invites/token/:token`
(singular).

**Fix:** `e2e/invitation.spec.ts` — fixed the path pattern.

## 7. Confirmation-submit stub matched too eagerly

**Symptom:** Public confirmation submit hit `/api/confirmations` (POST)
but the stub `**/confirmations**` matched both POST and the admin-list GET.

**Fix:** `e2e/invitation.spec.ts` — tightened the route pattern to
`**/api/confirmations` and kept the method check.

## 8. Driver tests assumed driverServingGroom persisted between tests

**Symptom:** `Driver — delivery list` group tests went straight to
`/portal/driver/pending` after `clearSession`, but clearSession wipes
`dawa.driverServingGroom`, so the user landed on the pick-groom gate
instead of the delivery list.

**Fix:** `e2e/driver.spec.ts` — added a `pickGroom("groom")` step inside
the `beforeEach`, and asserted the URL advances to `/pending` before
running each test.

## 9. Hebrew assertion matched the wrong string

**Symptom:** `rtl.spec.ts` "language switcher swaps copy to Hebrew" looked
for `התחברות|כניסה` — but on the login page after the switch, the heading
animation / lang re-render race meant the test sometimes finished checking
before the heading swapped.

**Fix:** Switched the assertion to match the subtitle `פורטל החתן`
(login_subtitle) which is unique enough to avoid collisions and renders
synchronously with the language flip.

## 10. Multiple "groom" buttons in admin send-tab picker

**Symptom:** Earlier test runs created fixture grooms named `tgroom*`.
The send-tab picker rendered both `tgroom469135` and the seeded `groom`,
and the test's `getByRole("button", { name: /groom/i }).first()` picked
the fixture (which has 0 guests), so the bulk-send button never appeared.

**Fix:** `e2e/admin.spec.ts` — narrowed the locator to a regex that
requires the `♥` or `✓` glyph followed by `groom` (exact) followed by
"عدد المدعوين", which uniquely identifies the seeded card.

## 11. Race against the 15-second guest subscription poll

**Symptom:** `Groom — guest CRUD > add a new guest (premium)` waited 10s
for the new row after `navGuests.click()`, but POLL_MS.GUESTS = 15_000ms,
so the subscription tick hadn't fired yet.

**Fix:** Bumped the test timeout to 30s and the row-visible expect to 20s.

---

## Final result

```
56 passed
 1 skipped (OTP flow — requires reCAPTCHA + SMS)
 0 failed
Time: ~1.1 min on a single chromium project
```

Run with:

```bash
# Terminal A — emulators + functions
npm run emulators

# Terminal B — Vite dev server pointed at the emulator API
npm run dev:emulator

# Terminal C — Playwright
PLAYWRIGHT_BASE_URL=http://localhost:5174 npx playwright test
# (or omit and rely on the default http://localhost:5173 if no other
#  Vite instance is running)
```

The `globalSetup` re-seeds the emulator on every run so tests start from a
known state without manual `npm run emulators:seed` invocations.
