# Dawa Test Report

- Generated: 2026-06-29T10:40:00.243Z
- Mode: **emulator** (http://localhost:5173)
- Duration: 426.4s

## Overview

**59 passed / 17 failed / 26 skipped** (of 102)

## By area

- `a11y        ` [##########] 4/4
- `a11y-authed ` [#####-----] 2/4 · 1 failed · 1 skipped
- `a11y-axe    ` [##########] 3/3
- `admin       ` [#########-] 10/11 · 1 failed
- `auth        ` [########--] 10/12 · 1 failed · 1 skipped
- `crawler     ` [----------] 0/4 · 3 failed · 1 skipped
- `driver      ` [----------] 0/9 · 9 skipped
- `groom       ` [----------] 0/11 · 11 skipped
- `groom-digital` [----------] 0/2 · 2 failed
- `i18n-render ` [#########-] 9/10 · 1 failed
- `invitation  ` [########--] 5/6 · 1 failed
- `journeys    ` [######----] 4/7 · 3 failed
- `paid-signup-ls` [----------] 0/1 · 1 failed
- `prod-smoke  ` [##########] 4/4
- `rtl         ` [########--] 3/4 · 1 failed
- `visual      ` [#####-----] 5/10 · 2 failed · 3 skipped

## Findings (14)

### console-error (9)

- 🔴 `/portal/login` — Failed to load resource: net::ERR_INSUFFICIENT_RESOURCES
- 🔴 `/portal/login` — Failed to load resource: net::ERR_INSUFFICIENT_RESOURCES
- 🔴 `/portal/groom/digital/dashboard` — Failed to load resource: the server responded with a status of 401 ()
- 🔴 `/portal/groom/digital/dashboard` — [dawa] subscribeDriversForGroom:error  [object Event] Event
- 🔴 `/portal/groom/digital/dashboard` — Failed to load resource: the server responded with a status of 401 ()
- 🔴 `/portal/groom/digital/dashboard` — [dawa] subscribeDriversForGroom:error  [object Event] Event
- 🔴 `/portal/groom/digital/dashboard` — [dawa] subscribeDriversForGroom:error  [object Event] Event
- 🔴 `/portal/groom/digital/dashboard` — Failed to load resource: the server responded with a status of 401 ()
- 🔴 `/portal/groom/digital/dashboard` — [dawa] subscribeDriversForGroom:error  [object Event] Event

### broken-image (4)

- 🟡 `/d/groom/demo?demo=1 [ar]` — broken <img> https://images.unsplash.com/photo-1465495976277-4387d4b0e4a6?w=1200&q=80
- 🟡 `/d/groom/demo?demo=1` — broken <img> https://images.unsplash.com/photo-1465495976277-4387d4b0e4a6?w=1200&q=80
- 🟡 `/d/groom/demo?demo=1 [he]` — broken <img> https://images.unsplash.com/photo-1465495976277-4387d4b0e4a6?w=1200&q=80
- 🟡 `/d/groom/demo?demo=1 [he]` — broken <img> https://images.unsplash.com/photo-1465495976277-4387d4b0e4a6?w=1200&q=80

### other (1)

- 🔴 `/portal/admin/send` — navigation failed: TimeoutError: page.goto: Timeout 20000ms exceeded.
Call log:
[2m  - navigating to "http://localhost:5173/portal/admin/send", waiting until "commit"[22m


## Failed tests (17)

- ❌ [crawler/chromium] Crawler — full render sweep › anonymous / public pages
  - Error: Crawler found 2 error-severity issues:
- ❌ [groom-digital/chromium] Groom — digital track › pick digital lands on the digital dashboard
  - Error: expect(page).toHaveURL(expected) failed
- ❌ [journeys/chromium] Journey — admin bulk send › select groom → send to all issues the request without crashing
  - Error: expect(locator).toBeVisible() failed
- ❌ [journeys/chromium] Journey — digital lifecycle › digital guest → invite minted → invitation renders → RSVP + wish accepted
  - Error: expect(received).toBe(expected) // Object.is equality
- ❌ [a11y-authed/chromium] a11y — authenticated portals › groom dashboard
  - TimeoutError: page.goto: Timeout 20000ms exceeded.
- ❌ [admin/chromium] Admin — dashboard + nav › user list shows seeded users
  - TimeoutError: page.goto: Timeout 20000ms exceeded.
- ❌ [i18n-render/chromium] i18n — he › login renders fully translated (he)
  - TimeoutError: page.goto: Timeout 20000ms exceeded.
- ❌ [paid-signup-ls/chromium] paid signup: admin link → /pay → LS checkout → webhook → groom account → forced change
  - TimeoutError: page.goto: Timeout 20000ms exceeded.
- ❌ [rtl/chromium] public landing page has dir='rtl' and renders Arabic headings
  - TimeoutError: page.goto: Timeout 20000ms exceeded.
- ❌ [invitation/chromium] Per-guest invite token › expired token shows expired-link page
  - TimeoutError: page.goto: Timeout 20000ms exceeded.
- ❌ [auth/chromium] Auth — role redirects › driver login → /portal/driver/*
  - TimeoutError: page.goto: Timeout 20000ms exceeded.
- ❌ [journeys/chromium] Journey — paid signup handoff › admin mints pay link → /pay renders → username availability enables Pay
  - TimeoutError: page.goto: Timeout 20000ms exceeded.
- ❌ [groom-digital/chromium] Groom — digital track › every digital screen renders with no console errors
  - TimeoutError: page.goto: Timeout 20000ms exceeded.
- ❌ [crawler/chromium] Crawler — full render sweep › admin portal
  - Test timeout of 120000ms exceeded.
- ❌ [visual/chromium] Visual — public @visual › landing _(visual diff)_
  - Error: expect(page).toHaveScreenshot(expected) failed
- ❌ [crawler/chromium] Crawler — full render sweep › groom portal (both tracks)
  - Error: Crawler found 3 error-severity issues:
- ❌ [visual/chromium] Visual — authed @visual › admin-users _(visual diff)_
  - Error: expect(page).toHaveScreenshot(expected) failed
