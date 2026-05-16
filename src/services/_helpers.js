// Shared service-layer helpers. Collapse the two patterns every service was
// repeating: onValue → forEach → push → cb, and httpsCallable → await → .data.
import { ref, onValue } from "firebase/database";
import { httpsCallable } from "firebase/functions";
import { db, functions } from "../firebase.js";
import { logErr } from "../utils/logger.js";

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

// Wrap a Cloud Function callable. Returns an async fn that resolves to the
// unwrapped `.data` payload and logs any failure under a stable tag before
// re-throwing for the caller's UI to handle.
export function callable(name) {
  const fn = httpsCallable(functions, name);
  return async (input) => {
    try {
      return (await fn(input)).data;
    } catch (e) {
      logErr(`callable(${name})`, e);
      throw e;
    }
  };
}
