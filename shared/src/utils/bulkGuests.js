// Parse a pasted/typed guest list into validated rows for bulk import.
// Each line is "Name, Phone" (comma OR tab separated). Light client-side
// validation mirrors the add-guest rules (full name = 2+ words; phone = a valid
// Israeli mobile, normalized to local 0XXXXXXXXX form); the server re-validates
// and is authoritative. Duplicate phones within the paste (and against the
// existing list) are flagged so they aren't added twice.
import { toWesternDigits } from "./digits.js";

/**
 * Normalize a raw phone to the canonical Israeli local form (0 + 9 national
 * digits), the shape the add-guest API expects. Returns null if it isn't a
 * plausible IL mobile number.
 */
export function toLocalIL(phoneRaw) {
  // Westernize first: Arabic-Indic/Persian digits (٠٥٢…) are the norm in this
  // market. `[^0-9]` alone STRIPS them → the contact/guest is silently dropped.
  let d = toWesternDigits(String(phoneRaw || "")).replace(/[^0-9]/g, "");
  if (d.startsWith("972")) d = d.slice(3);
  d = d.replace(/^0+/, "");
  if (d.length !== 9) return null;
  return "0" + d;
}

/**
 * @param {string} text                 pasted guest lines
 * @param {Set<string>} [existingLocals] toLocalIL()s already in the list (dup flag)
 * @returns {{ rows: Array<{name,phone,valid,error}>, stats:{total,valid,invalid,duplicate} }}
 *   `phone` on each row is the normalized local form when valid.
 */
export function parseGuestLines(text, existingLocals) {
  const existing = existingLocals instanceof Set ? existingLocals : new Set();
  const seen = new Set();
  const rows = [];
  let valid = 0, invalid = 0, duplicate = 0;

  for (const raw of String(text || "").split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;
    const parts = line.split(/[,\t]/);
    const name = (parts[0] || "").trim();
    const phoneRaw = (parts.slice(1).join(" ") || "").trim();
    const local = toLocalIL(phoneRaw);

    let error = "";
    if (name.split(/\s+/).filter(Boolean).length < 2) error = "name";
    else if (!local) error = "phone";
    else if (existing.has(local) || seen.has(local)) error = "duplicate";

    if (error === "duplicate") duplicate++;
    else if (error) invalid++;
    else { valid++; seen.add(local); }

    rows.push({ name, phone: local || phoneRaw, valid: !error, error });
  }
  return { rows, stats: { total: rows.length, valid, invalid, duplicate } };
}
