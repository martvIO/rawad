# List Search and Filter

A reusable, client-side **search box + status/category filter chips** wired into
every list-rendering page across the [[User Roles|Admin, Groom, and Driver]]
portals (12 lists). Added 2026-06-12. Purely in-memory filtering of data the
pages already hold (REST polling / local state) — no DB, rules, or API change.

## The three primitives

- **`frontend/src/utils/searchFilter.js`** — the engine.
  - `normalizeForSearch(v)` — lowercases, westernizes Arabic-Indic digits
    (`toWesternDigits`), strips diacritics via the matching engine's
    `normalizeText`, and additionally strips the Arabic hamza combining marks
    (U+0653–U+0655) so search is hamza-insensitive (`احمد` finds `أحمد`). See
    [[Digit Normalization]].
  - `matchesQuery(item, query, { fields, phoneFields, lang })` — **token-AND
    substring** match. `fields` are string keys OR accessor fns (localized
    `{ar,he}` resolved via `localize`); `phoneFields` match by canonical phone
    form (`normalizePhoneForMatching`), so `052`, `+97252…`, `۰۵۲…` all find the
    same stored number.
  - `filterList(items, query, opts)` — standalone (non-hook) filter.
  - `useListFilter(items, { fields, phoneFields, lang, statusOf, statuses,
    allLabel })` → `{ query, setQuery, activeStatus, setActiveStatus, filtered,
    counts, chips }`. `filtered` = text search **AND** active chip; `chips` carry
    live counts computed over the text-filtered set.
- **`frontend/src/components/SearchBar.jsx`** — controlled 🔍 input with a live
  `X / Y` count pill and × clear. Visual/RTL clone of the search box inside
  `GroomMultiSelect.jsx`. Matches the [[Inline Styling Convention]].
- **`frontend/src/components/FilterChips.jsx`** — horizontal scrollable pill row
  (single-select), gold active state, live counts.

Supporting change: `normalizeText` is now **exported** from
`frontend/src/utils/matchUtils.js` (it was internal) so search folds text
identically to the [[Face Matching|confirmation-matching]] engine — one source of
truth, engine behavior unchanged.

## Wiring rules (followed on all 12 pages)

1. **Filter before grouping** — feed `filtered` into the page's existing
   split/group/section logic so headers + counts recompute.
2. **Metrics stay on the full array** — progress %, totals, dashboard stats,
   pending footers never read `filtered`.
3. **Compose with existing pre-filters** — role tabs (AdminUserManager), groom
   selector (Send/Confirmations), mode, status split — search runs on the
   already-scoped array.
4. **Stable identity** — `fields`/`phoneFields`/`statusOf` are module-level
   constants; `statuses` (translated chip labels) built in render.
5. **RTL** — `isRtl = lang !== "he"` (Arabic RTL, Hebrew LTR inside the app's RTL
   shell); never hardcode `dir`.

## Per-page chip dimension

Delivery status (pending/enroute/delivered): GroomGuests, DriverDeliveryList,
SharedCities. RSVP (pending/attending/absent): DigitalGuests, DigitalDashboard
messages, AdminSendTab (digital list only). Role: AdminUserManager (its existing
tabs ARE the chips — search-only added). Match status: AdminConfirmations. Design
status: AdminDesigns. File type: DigitalPhotographer. Search-only (no clean
status): GroomDashboard, GroomProofs.

**Gotcha fixed during QA:** AdminSendTab's RSVP chips are bound to the *digital*
list; in manual mode they showed `0/0/0` above physical guests — now gated on
`digitalGuests.length > 0`.

## i18n

New keys in `frontend/src/i18n/ar.js` + `he.js`: `search_placeholder`,
`search_no_results`, `filter_all`, per-list `search_*_placeholder`, and `chip_*`
status labels (Hebrew parity required — `makeT` only falls back ar→key).
Exception: DigitalDashboard uses its local inline `tt(lang,ar,he)` translator.

## Verification

24 new unit tests in `searchFilter.test.js` (376 total pass); full Vite build
clean (344 modules). Playwright-verified live on emulator: GroomGuests (text +
phone-fragment + chips + grouping + no-results), AdminUserManager (search ×
role-tab compose), AdminSendTab (search + chip-gating fix). See [[Dawa]].
