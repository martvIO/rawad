## Gotchas — Dawa Platform

_Reusable debugging notes and workflow traps. Append new entries; don't rewrite history._

---

### Firebase Hosting cache busts the wrong file

After `firebase deploy --only hosting --project dawa-aa793`, browsers may keep serving the previous `index.html` from cache. The cached HTML still references the OLD `assets/index-<hash>.js` filename, so the fresh JS bundle never loads even though it's deployed and accessible at the new URL.

- **Why:** Firebase Hosting's default cache headers for `index.html` allow short-term caching. Content-hashed asset bundles are safe to cache long, but the HTML pointing at them is not — and the browser may not revalidate within a single tab session.
- **How to apply:** When verifying a freshly deployed change (Playwright or a real browser), append a cache-busting query string to the URL — e.g. `https://dawa-aa793.web.app/portal/groom/digital/dashboard?cb=v2`. Then check `document.querySelectorAll('script[src]')` to confirm the loaded bundle hash matches what `ls dist/assets/` produced locally before trusting test results.

---

### Use the React fiber to verify deployed useState values

When a deployed React page renders stale/empty data even though the API returns the right thing, don't guess about React state — read it directly from the fiber. Network logs only confirm the response landed; they don't tell you whether `setState` actually ran.

- **Why:** In production builds, console logs and breakpoints are often impractical (especially via Playwright with no React DevTools attached). The fiber's `memoizedState` linked list is the ground truth for "did the update happen."
- **How to apply:** From `browser_evaluate`, grab a DOM element inside the suspect component, find the `__reactFiber$<random>` key, walk up via `f.return` until you hit a fiber with `memoizedState && memoizedState.queue && typeof f.type === 'function'` (a function component with hooks). Then walk `memoizedState.next` to enumerate every hook value in declaration order. useState → current value; useRef → `{ current }`; useEffect → `{ tag, create, destroy, deps }`. This caught the `currentUid` not-exported bug below in seconds when network inspection had hit a dead end.

---

### Before destructuring from `usePortal()`, verify the field is exported

`src/hooks/usePortalState.js` is ~1000 lines with dozens of useState/useMemo calls; the return object groups fields into commented sections (`// auth + session`, `// guests`, `// admin`, etc.). It's easy to add an internal value without remembering to add it to the return.

- **Why:** Destructuring an unexported field yields `undefined` silently. Any downstream `useEffect` that early-bails on the value (`if (!currentUid) return`) never runs, and there's no error to trace. `currentUid` was the latest casualty — declared on line 85, used internally by `useGeolocation` on line 362, but missing from the return until 2026-05-26. The DigitalDashboard and DigitalPhotographer subscriptions never started for any user; only the optimistic-update fallback let uploads ever appear in the UI. See [KNOWN_BUGS.md](../KNOWN_BUGS.md) BUG-O002.
- **How to apply:** When adding any new portal hook consumer, run `grep -n 'fieldName' src/hooks/usePortalState.js` and confirm the match is in the return block, not just inside the function body. When adding a brand-new field for downstream use, add it to the return in the same commit.
