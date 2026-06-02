// Downscale + re-encode an image File to a compact JPEG data URL so uploads
// (e.g. driver delivery-proof photos shot on cellular) transfer fast and don't
// time out. Tuned for "good enough + small", not archival quality.
//
// Always resolves to a usable data URL: on any failure (unsupported type, no
// canvas/createImageBitmap, decode error) it falls back to the original file
// read as a data URL, so callers never have to special-case errors.

/** Read a File/Blob as a data URL. */
function readAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onloadend = () => resolve(typeof r.result === "string" ? r.result : null);
    r.onerror = () => reject(r.error || new Error("read_failed"));
    r.readAsDataURL(file);
  });
}

/**
 * @param {File|Blob} file
 * @param {{maxDimension?: number, quality?: number}} [opts]
 * @returns {Promise<string|null>} a JPEG data URL (or the original, or null)
 */
export async function compressImageToDataUrl(file, { maxDimension = 1280, quality = 0.6 } = {}) {
  const original = await readAsDataUrl(file).catch(() => null);
  try {
    if (!file || !file.type || !file.type.startsWith("image/")) return original;
    if (typeof createImageBitmap !== "function" || typeof document === "undefined") return original;
    // `from-image` bakes in EXIF orientation so portrait phone photos aren't rotated.
    const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
    const scale = Math.min(1, maxDimension / Math.max(bitmap.width, bitmap.height));
    const w = Math.max(1, Math.round(bitmap.width * scale));
    const h = Math.max(1, Math.round(bitmap.height * scale));
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    ctx.drawImage(bitmap, 0, 0, w, h);
    bitmap.close?.();
    const out = canvas.toDataURL("image/jpeg", quality);
    if (!out) return original;
    // Keep whichever is smaller (a small PNG can grow when re-encoded as JPEG).
    if (original && original.length <= out.length) return original;
    return out;
  } catch {
    return original;
  }
}
