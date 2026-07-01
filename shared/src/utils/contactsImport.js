// Parse phone contacts from an uploaded file (vCard .vcf or CSV/TSV) into
// "Full Name, Phone" text lines that feed the existing bulk-guest pipeline
// (parseGuestLines in bulkGuests.js). Dependency-free.
//
// Why file upload (and not a native picker): there is NO browser contact-picker
// API on iPhone Safari or any desktop browser — only Android Chrome exposes
// `navigator.contacts.select`. A file upload is the only method that works on
// iPhone + Android + desktop. The groom exports contacts from their phone's
// Contacts app to a .vcf (iPhone: select contacts → Share; Android/desktop:
// "Export contacts") or a .csv, then uploads the file here.

import { toWesternDigits } from "./digits.js";

/** Count digits (after Arabic→Western conversion) in a string. */
function digitCount(s) {
  const m = toWesternDigits(String(s ?? "")).match(/[0-9]/g);
  return m ? m.length : 0;
}

/** Unfold vCard logical lines: a continuation line starts with space/tab. */
function unfold(text) {
  return String(text || "").replace(/\r\n/g, "\n").replace(/\n[ \t]/g, "");
}

/** Build "First Middle Last" from a vCard N value "Last;First;Middle;Prefix;Suffix". */
function nameFromN(val) {
  const [last = "", first = "", middle = ""] = val.split(";").map((s) => s.trim());
  return [first, middle, last].filter(Boolean).join(" ").trim();
}

/**
 * Parse vCard text → [{ name, phone }]. Prefers a TEL flagged CELL/MOBILE,
 * else the first TEL. Handles multiple cards and folded lines.
 */
export function parseVcards(text) {
  const cards = unfold(text).split(/END:VCARD/i);
  const out = [];
  for (const card of cards) {
    if (!/BEGIN:VCARD/i.test(card)) continue;
    let fn = "", n = "";
    const tels = []; // { value, mobile }
    for (const line of card.split("\n")) {
      // prop[;params]:value  (params optional; value may contain ':')
      const m = line.match(/^([A-Za-z][^:;]*)((?:;[^:]*)?):(.*)$/);
      if (!m) continue;
      const prop = m[1].trim().toUpperCase();
      const params = (m[2] || "").toUpperCase();
      const value = m[3].trim();
      if (prop === "FN") fn = value;
      else if (prop === "N") n = value;
      else if (prop === "TEL") tels.push({ value, mobile: /CELL|MOBILE|IPHONE/.test(params) });
    }
    if (!tels.length) continue;
    const name = fn || nameFromN(n);
    const tel = (tels.find((t) => t.mobile) || tels[0]).value;
    out.push({ name, phone: tel });
  }
  return out;
}

/** Split one CSV/TSV line into trimmed cells, honouring double-quoted fields. */
function splitCells(line) {
  const cells = [];
  let cur = "", inQ = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQ && line[i + 1] === '"') { cur += '"'; i++; }
      else inQ = !inQ;
    } else if ((ch === "," || ch === "\t") && !inQ) {
      cells.push(cur); cur = "";
    } else {
      cur += ch;
    }
  }
  cells.push(cur);
  return cells.map((c) => c.trim());
}

/**
 * Parse CSV/TSV text → [{ name, phone }]. Skips a header row (a first row with
 * no digits anywhere), and picks the phone as the non-name cell with the most
 * digits — so an Email/Notes column is never mistaken for the number.
 */
export function parseDelimited(text) {
  const lines = String(text || "").split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const out = [];
  for (let i = 0; i < lines.length; i++) {
    const cells = splitCells(lines[i]);
    if (cells.length < 2) continue;
    if (i === 0 && cells.every((c) => digitCount(c) === 0)) continue; // header row
    const name = cells[0];
    let phone = "", best = 0;
    for (let j = 1; j < cells.length; j++) {
      const dc = digitCount(cells[j]);
      if (dc > best) { best = dc; phone = cells[j]; }
    }
    if (best < 7) continue; // not enough digits to be a phone
    out.push({ name, phone });
  }
  return out;
}

/**
 * Convert raw vCard/CSV file TEXT to "Name, Phone" lines that parseGuestLines()
 * can consume. Auto-detects vCard by content or the source filename. Pure /
 * DOM-free so it works on React Native (no FileReader): the caller reads the
 * file to a string (expo-file-system) and passes it here.
 * @param {string} text     file contents
 * @param {string} [name]   original filename (for the .vcf extension hint)
 * @returns {string} newline-joined "Name, Phone" lines.
 */
export function contactsTextToLines(text, name = "") {
  const str = String(text || "");
  const isVcf = /BEGIN:VCARD/i.test(str) || /\.vcf$/i.test(name || "");
  const rows = isVcf ? parseVcards(str) : parseDelimited(str);
  return rows
    .map((r) => `${(r.name || "").replace(/[,\t]/g, " ").trim()}, ${(r.phone || "").trim()}`)
    .filter((l) => l.replace(/[\s,]/g, "").length > 0)
    .join("\n");
}

/**
 * Read a File and convert vCard/CSV contacts to "Name, Phone" text lines that
 * parseGuestLines() can consume. Auto-detects vCard by content/extension.
 * Browser-only (uses FileReader); native callers use contactsTextToLines().
 * @returns {Promise<string>} newline-joined "Name, Phone" lines.
 */
export function contactsFileToText(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("read_failed"));
    reader.onload = () =>
      resolve(contactsTextToLines(String(reader.result || ""), file?.name || ""));
    reader.readAsText(file);
  });
}
