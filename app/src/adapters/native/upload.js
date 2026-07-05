// Native binary-upload adapter for @dawa/core — backed by expo-file-system.
//
// putFileToStorage's XHR path can't stream a React Native { uri } descriptor
// (xhr.send(plainObject) uploads nothing), so the shared service delegates
// here via adapters/upload.js. File#upload streams the bytes natively
// (background URL session on iOS) and resolves with { status } even on
// non-2xx — mapped below to the exact error contract of the web XHR path so
// the shared retry queue treats both platforms identically.
import { File, UploadType } from "expo-file-system";

/** desc: { uri, name, type, size } — opts: { signal, onProgress(fraction) }. */
export async function nativeBinaryUpload(url, desc, opts) {
  const size = Number(desc?.size) || 0;
  const headers = { "Content-Type": desc?.type || "application/octet-stream" };
  if (size > 0) headers["Content-Range"] = `bytes 0-${size - 1}/${size}`;
  const onProgress = typeof opts?.onProgress === "function" ? opts.onProgress : null;
  let result;
  try {
    result = await new File(desc.uri).upload(url, {
      httpMethod: "PUT",
      uploadType: UploadType.BINARY_CONTENT,
      headers,
      signal: opts?.signal,
      onProgress: onProgress
        ? ({ bytesSent, totalBytes }) => { if (totalBytes > 0) onProgress(bytesSent / totalBytes); }
        : undefined,
    });
  } catch (err) {
    if (err?.name === "AbortError") throw err;
    if (opts?.signal?.aborted) {
      const e = new Error("Aborted");
      e.name = "AbortError";
      throw e;
    }
    // Request failed before a response (mirrors xhr.onerror) → transient.
    throw new Error("network_error");
  }
  const status = Number(result?.status) || 0;
  if (status >= 200 && status < 300) return;
  // 5xx (and 0 / 308) are transient → network_error so the shared retry
  // re-attempts; other statuses are permanent (mirrors putFileToStorage).
  throw new Error(status >= 500 || status === 0 || status === 308 ? "network_error" : `storage_put_${status}`);
}
