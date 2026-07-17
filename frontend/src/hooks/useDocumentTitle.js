// Per-route <title> + <link rel="canonical"> management (SEO-01, SEO-03).
//
// Deliberately not react-helmet: two head tags over one route table don't justify
// a dependency + provider wrapper. The caller owns the route→title mapping (see
// App.jsx) — this hook only writes what it is handed, so it stays testable and
// has no opinion about routing.
import { useEffect } from "react";

// dawa-aa793.web.app serves this same app (Firebase's default domain, kept for
// deploy previews), so every page exists on two origins. Without a canonical,
// search engines pick the winner themselves — this pins it to the branded one.
const CANONICAL_ORIGIN = "https://dawa.to";

/**
 * @param {string}      title          Fully-resolved, already-translated document title.
 *                                     Falsy → leave whatever is in <title> alone.
 * @param {string|null} canonicalPath  Path to canonicalize (e.g. "/terms"), or null
 *                                     to publish NO canonical for this route. Pass a
 *                                     pathname only — a query string would canonicalize
 *                                     a guest token. Null is the right answer for
 *                                     tokenized/private/404 routes; see App.jsx.
 */
export function useDocumentTitle(title, canonicalPath) {
  useEffect(() => {
    if (!title) return;
    document.title = title;
  }, [title]);

  useEffect(() => {
    if (!canonicalPath) return;
    // Create-and-remove rather than mutate-in-place: the cleanup is what makes a
    // null canonicalPath actually mean "no canonical". Mutating a shared element
    // would strand the previous route's canonical on tokenized pages, publishing
    // the wrong URL. index.html ships no canonical, so this hook is the only owner.
    const link = document.createElement("link");
    link.rel = "canonical";
    link.href = CANONICAL_ORIGIN + canonicalPath;
    document.head.appendChild(link);
    return () => link.remove();
  }, [canonicalPath]);
}
