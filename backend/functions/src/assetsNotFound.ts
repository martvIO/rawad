// Hard 404 for hashed assets that no longer exist.
//
// Without this, `GET /assets/<chunk-from-the-previous-deploy>.js` misses on disk,
// falls through the SPA catch-all rewrite (`**` → /index.html) and comes back as
// `200 text/html` — and the `/assets/**` header rule still stamps
// `public, max-age=31536000, immutable` on it. So a tab left open across a deploy
// lazy-loads a deleted chunk, gets HTML where JavaScript was expected (module
// parse error → dead navigation), and the browser caches that wrong answer for a
// YEAR. Only a hard refresh clears it.
//
// Hosting rewrite (owned by firebase.json):
//   { "source": "/assets/**", "function": "assetsNotFound" }
//
// Hosting serves existing static files BEFORE it consults rewrites, so this only
// ever fires for genuinely-missing files — near-zero invocations. It deliberately
// imports nothing beyond `onRequest`: it must stay the cheapest function here.
import { onRequest } from "firebase-functions/v2/https";

export const assetsNotFound = onRequest(
  // Same region as every other function. `maxInstances` caps the cost
  // blast-radius (mirrors `api`/`digitalOgImage`) so a post-deploy stale-chunk
  // stampede — or a scanner walking /assets/* — can't fan out unbudgeted.
  //
  // Memory is deliberately left at the default rather than capped at 128MiB:
  // every export in this codebase shares one entry module (index.ts), which
  // statically imports the Express app, so the heavy deps load at cold start no
  // matter how trivial this handler is. Capping lower would only buy an OOM.
  { region: "us-central1", maxInstances: 10 },
  (_req, res) => {
    // `no-store` states the intent, but Hosting's `/assets/**` rule OVERRIDES a
    // function's own Cache-Control on rewritten responses — verified live: the
    // `/og/**` rule's `s-maxage=259200` beats digitalOgImage's `s-maxage=604800`,
    // and the `**` rule's `no-cache` beats digitalInvitePreview's `max-age=300`.
    // The glob can't tell a missing asset from a real one (same URL shape), so the
    // immutable header lands on this 404 too.
    //
    // `Vary: *` is what actually holds the line: RFC 9111 §4.1 — a stored response
    // with `Vary: *` can never be selected for reuse, so neither the browser nor
    // the CDN may replay this 404 even while an immutable max-age is stamped on
    // it. That matters because Vite hashes are content-derived: a reverted chunk
    // can legitimately reappear under its old name, and a year-cached 404 would
    // break that user with no way to self-heal.
    res.set("Cache-Control", "no-store");
    res.set("Vary", "*");
    res.set("Content-Type", "text/plain; charset=utf-8");
    // Plain text, not the SPA shell — the whole point is to never hand a
    // JavaScript request an HTML body. A real 404 also lets Vite's
    // `vite:preloadError` self-heal fire (it can't distinguish a 200 of HTML).
    res.status(404).send("Not Found");
  },
);
