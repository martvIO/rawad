// Binary-upload adapter.
//
// putFileToStorage (services/digitalInvitation.js) streams file bytes to a
// GCS resumable-session URL via XMLHttpRequest. That works on web, but React
// Native file descriptors are plain `{ uri, name, type, size }` objects —
// `xhr.send(plainObject)` uploads nothing. Native injects an expo-file-system
// implementation through this seam; web never registers one, so the XHR path
// is untouched.
//
// Implementation contract — impl(url, file, opts) -> Promise<void>:
//   file: { uri, name, type, size } platform descriptor
//   opts: { signal?: AbortSignal, onProgress?: (fraction 0..1) => void }
//   resolve on HTTP 2xx;
//   throw Error("network_error") on transient failures (request failed / 5xx / 0 / 308);
//   throw Error("storage_put_<status>") on other non-2xx;
//   let AbortError propagate when opts.signal aborts.

let _binaryUpload = null;

/** Inject the platform binary-upload implementation (native only). */
export function setBinaryUpload(impl) {
  _binaryUpload = impl;
}

/** Return the injected implementation, or null when unset (web default → XHR). */
export function getBinaryUpload() {
  return _binaryUpload;
}
