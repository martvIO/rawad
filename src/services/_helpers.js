// Shared service-layer helpers. Collapse the two patterns every service was
// repeating: onValue → forEach → push → cb, and httpsCallable → await → .data.
import { ref, onValue } from "firebase/database";
import { httpsCallable } from "firebase/functions";
import { db, functions } from "../firebase.js";
import { forceRefreshToken } from "./auth.js";
import { logErr, logWarn } from "../utils/logger.js";

// Subscribe to a list-shaped RTDB path. `mapItem` is optional; by default each
// child becomes { id: key, ...val }. Errors call `cb([])` so the UI degrades
// to "empty list" instead of staying stuck on a loader.
export function subscribeList(path, cb, mapItem) {
  return onValue(
    ref(db, path),
    (snap) => {
      const out = [];
      snap.forEach((c) => {
        out.push(mapItem ? mapItem(c) : { id: c.key, ...c.val() });
      });
      cb(out);
    },
    (err) => {
      logErr(`subscribeList(${path})`, err);
      cb([]);
    },
  );
}

// Codes that usually mean "your token is stale" — most commonly because a
// custom claim was granted after the token was minted (e.g. admin promotion).
const REFRESHABLE_CODES = new Set([
  "functions/permission-denied",
  "functions/unauthenticated",
  "permission-denied",
  "unauthenticated",
]);

// Wrap a Cloud Function callable. Returns an async fn that resolves to the
// unwrapped `.data` payload. On the first permission-denied / unauthenticated
// failure we force a token refresh and retry once — handles the case where
// the user was just promoted while signed in.
export function callable(name) {
  const fn = httpsCallable(functions, name);
  return async (input) => {
    try {
      return (await fn(input)).data;
    } catch (e) {
      if (REFRESHABLE_CODES.has(e?.code)) {
        logWarn(`callable(${name}) ${e.code} — refreshing token and retrying`);
        try {
          await forceRefreshToken();
          return (await fn(input)).data;
        } catch (e2) {
          logErr(`callable(${name}) retry`, e2);
          throw e2;
        }
      }
      logErr(`callable(${name})`, e);
      throw e;
    }
  };
}
