// Minimal CSV builder + browser download. RFC-4180 escaping; a UTF-8 BOM is
// prepended on download so Excel opens Arabic/Hebrew text correctly.

/** Escape a single CSV cell. */
export function csvCell(v) {
  const s = v == null ? "" : String(v);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** Build a CSV string from a header row + array-of-arrays rows. */
export function toCsv(headers, rows) {
  const head = (headers || []).map(csvCell).join(",");
  const body = (rows || []).map((r) => r.map(csvCell).join(",")).join("\r\n");
  return body ? `${head}\r\n${body}` : head;
}

/** Trigger a client-side download of `csv` as `filename`. No-op outside a DOM. */
export function downloadCsv(filename, csv) {
  if (typeof document === "undefined") return;
  const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
