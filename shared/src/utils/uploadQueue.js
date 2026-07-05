// Bounded-concurrency upload queue with per-item retry on transient failures.
//
// Lifted from the groom photographer page: firing every file in one
// Promise.allSettled made the browser queue them behind ~6 sockets and the
// WAITING requests burned their 2-min timeout → mass failures on big albums.
// A bounded queue keeps only a few requests live at a time so none stalls in
// the queue. Shared by web (DigitalPhotographer) and native (photographer).

// How many files upload at once.
export const UPLOAD_CONCURRENCY = 4;
export const UPLOAD_MAX_ATTEMPTS = 3; // 1 try + 2 retries on transient (timeout/network) failures

// DOMException is a browser global — Hermes may not have it, so fall back to a
// plain Error carrying the same name the callers test for.
function abortError() {
  try {
    return new DOMException("Aborted", "AbortError");
  } catch {
    const e = new Error("Aborted");
    e.name = "AbortError";
    return e;
  }
}

/**
 * Run `uploadOne(item, index)` over `items` through a bounded-concurrency
 * queue with per-item retry on transient failures (request_timeout /
 * network_error). Returns results in Promise.allSettled shape, in order.
 *
 * opts:
 *   concurrency     — max in-flight uploads (default UPLOAD_CONCURRENCY)
 *   maxAttempts     — tries per item incl. the first (default UPLOAD_MAX_ATTEMPTS)
 *   signal          — AbortSignal; aborted items settle rejected with AbortError
 *   onRetryReset(i) — called before an item retries (e.g. reset its progress bar)
 *   onItemDone()    — called after each item settles (success or final failure)
 */
export async function runUploadQueue(items, uploadOne, opts = {}) {
  const {
    concurrency = UPLOAD_CONCURRENCY,
    maxAttempts = UPLOAD_MAX_ATTEMPTS,
    signal,
    onRetryReset,
    onItemDone,
  } = opts;
  const results = new Array(items.length);
  let next = 0;
  const runOne = async (item, i) => {
    let lastErr;
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      if (signal?.aborted) {
        return { status: "rejected", reason: abortError() };
      }
      try {
        const value = await uploadOne(item, i);
        return { status: "fulfilled", value };
      } catch (err) {
        lastErr = err;
        const isAbort = err?.name === "AbortError";
        const transient = err?.message === "request_timeout" || err?.message === "network_error";
        if (isAbort || !transient || attempt === maxAttempts) break;
        if (onRetryReset) onRetryReset(i); // reset this item's progress before the retry
        await new Promise((r) => setTimeout(r, 500 * attempt)); // small backoff
      }
    }
    return { status: "rejected", reason: lastErr };
  };
  const worker = async () => {
    while (!signal?.aborted) {
      const i = next++;
      if (i >= items.length) return;
      results[i] = await runOne(items[i], i);
      if (onItemDone) onItemDone();
    }
  };
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, worker));
  // Abort can leave tail entries unset — normalize so callers can read .status.
  for (let i = 0; i < results.length; i++) {
    if (!results[i]) results[i] = { status: "rejected", reason: abortError() };
  }
  return results;
}
