// Reusable phone input with a country-code chip, auto-formatting, and a
// live "valid" indicator. Emits an E.164 string (e.g. "+972501234567")
// via onChange — or an empty string while the number is incomplete. The
// value prop is also expected to be E.164 (or empty).
//
// Israeli/Palestinian numbers strip a leading 0 automatically; users can
// also paste a full "+972…" string and the country chip updates itself.
import { useEffect, useRef, useState } from "react";
import { toWesternDigits } from "../utils/digits.js";

const COUNTRIES = [
  { code: "IL", dial: "+972", flag: "🇮🇱", name_ar: "إسرائيل",       name_he: "ישראל",       len: 9,  startsWith: ["5", "7"] },
  { code: "PS", dial: "+970", flag: "🇵🇸", name_ar: "فلسطين",        name_he: "פלסטין",       len: 9,  startsWith: ["5"] },
  { code: "JO", dial: "+962", flag: "🇯🇴", name_ar: "الأردن",         name_he: "ירדן",         len: 9,  startsWith: ["7"] },
  { code: "EG", dial: "+20",  flag: "🇪🇬", name_ar: "مصر",           name_he: "מצרים",        len: 10, startsWith: ["1"] },
  { code: "AE", dial: "+971", flag: "🇦🇪", name_ar: "الإمارات",      name_he: "איחוד האמירויות", len: 9, startsWith: ["5"] },
  { code: "SA", dial: "+966", flag: "🇸🇦", name_ar: "السعودية",      name_he: "ערב הסעודית",  len: 9,  startsWith: ["5"] },
  { code: "US", dial: "+1",   flag: "🇺🇸", name_ar: "الولايات المتحدة", name_he: "ארה״ב",       len: 10, startsWith: [] },
];

function findByDial(e164) {
  if (!e164 || !e164.startsWith("+")) return null;
  // Longest dial first so "+972" matches before "+97".
  return [...COUNTRIES]
    .sort((a, b) => b.dial.length - a.dial.length)
    .find(c => e164.startsWith(c.dial)) || null;
}

function findByCode(code) {
  return COUNTRIES.find(c => c.code === code) || COUNTRIES[0];
}

// Format raw national digits for display. IL/PS use 2-3-4 grouping
// (mobile pattern); everything else gets generic 3-groups.
function formatNational(digits, countryCode) {
  if (!digits) return "";
  if (countryCode === "IL" || countryCode === "PS") {
    if (digits.length <= 2) return digits;
    if (digits.length <= 5) return digits.slice(0, 2) + "-" + digits.slice(2);
    return digits.slice(0, 2) + "-" + digits.slice(2, 5) + "-" + digits.slice(5, 9);
  }
  return digits.match(/.{1,3}/g)?.join(" ") || "";
}

function isValidLength(digits, countryCode) {
  const c = findByCode(countryCode);
  if (!digits) return false;
  if (digits.length !== c.len) return false;
  if (c.startsWith.length > 0 && !c.startsWith.includes(digits[0])) return false;
  return true;
}

export function PhoneInput({
  value,
  onChange,
  t,
  lang = "ar",
  defaultCountry = "IL",
  placeholder,
  autoFocus = false,
  disabled = false,
  hasError = false,
}) {
  const [country, setCountry]       = useState(defaultCountry);
  const [display, setDisplay]       = useState("");
  const [pickerOpen, setPickerOpen] = useState(false);
  const containerRef = useRef(null);
  const inputRef     = useRef(null);

  // Sync from external value (E.164 or empty / legacy local digits).
  useEffect(() => {
    if (!value) { setDisplay(""); return; }
    const matched = findByDial(value);
    if (matched) {
      setCountry(matched.code);
      setDisplay(formatNational(value.slice(matched.dial.length).replace(/\D/g, ""), matched.code));
    } else {
      // Legacy: just digits, no "+". Treat as default-country national.
      const digits = value.replace(/\D/g, "").replace(/^0+/, "");
      setDisplay(formatNational(digits, country));
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  // Close picker on outside-click / Escape.
  useEffect(() => {
    if (!pickerOpen) return;
    const onDoc = (e) => {
      if (containerRef.current && !containerRef.current.contains(e.target)) setPickerOpen(false);
    };
    const onKey = (e) => { if (e.key === "Escape") setPickerOpen(false); };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown",  onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown",  onKey);
    };
  }, [pickerOpen]);

  const emit = (digits, countryCode) => {
    const c = findByCode(countryCode);
    onChange(digits ? c.dial + digits : "");
  };

  const handleType = (rawInput) => {
    // Convert any Arabic-Indic digits first; otherwise the `\D` strip below
    // would treat them as non-digits and silently drop what the user typed.
    const raw = toWesternDigits(rawInput);
    let workCountry = country;
    let digits      = raw.replace(/\D/g, "");

    // User pasted an E.164 string — switch country to match.
    if (raw.startsWith("+")) {
      const matched = findByDial(raw);
      if (matched) {
        workCountry = matched.code;
        setCountry(matched.code);
        digits = raw.slice(matched.dial.length).replace(/\D/g, "");
      }
    } else if (workCountry === "IL" || workCountry === "PS") {
      // Local users often type the leading 0 — drop it.
      digits = digits.replace(/^0+/, "");
    }

    const max = findByCode(workCountry).len;
    digits = digits.slice(0, max);
    setDisplay(formatNational(digits, workCountry));
    emit(digits, workCountry);
  };

  const switchCountry = (code) => {
    setPickerOpen(false);
    setCountry(code);
    // Re-emit with the new prefix, re-format the visible digits.
    const digits = display.replace(/\D/g, "").slice(0, findByCode(code).len);
    setDisplay(formatNational(digits, code));
    emit(digits, code);
    // Focus the input so the user can keep typing.
    inputRef.current?.focus();
  };

  const current = findByCode(country);
  const digitsOnly = display.replace(/\D/g, "");
  const isValid   = isValidLength(digitsOnly, country);
  const countryName = (lang === "he" ? "name_he" : "name_ar");

  const shellClass = [
    "phone-input-shell",
    isValid && "is-valid",
    hasError && "has-error",
    disabled && "is-disabled",
  ].filter(Boolean).join(" ");

  return (
    <div ref={containerRef} style={{ position: "relative" }}>
      <div className={shellClass}>
        <button
          type="button"
          onClick={() => !disabled && setPickerOpen(o => !o)}
          disabled={disabled}
          aria-haspopup="listbox"
          aria-expanded={pickerOpen}
          aria-label={t ? t("phone_country_select") : current[countryName]}
          className="phone-input-chip"
        >
          <span style={{ fontSize: 18, lineHeight: 1 }} aria-hidden>{current.flag}</span>
          <span style={{ direction: "ltr", fontWeight: 800 }}>{current.dial}</span>
          <span style={{ fontSize: 9, opacity: .55 }} aria-hidden>▾</span>
        </button>

        <input
          ref={inputRef}
          type="tel"
          inputMode="numeric"
          autoComplete="tel-national"
          disabled={disabled}
          autoFocus={autoFocus}
          value={display}
          placeholder={placeholder ?? (country === "IL" || country === "PS" ? "50-123-4567" : "123 456 7890")}
          onChange={e => handleType(e.target.value)}
          className="phone-input-native"
          aria-invalid={hasError || (!!digitsOnly && !isValid)}
        />

        <span className="phone-input-status" aria-hidden>
          {isValid ? "✓" : ""}
        </span>
      </div>

      {pickerOpen && (
        <div role="listbox" className="phone-input-picker">
          {COUNTRIES.map(c => {
            const active = c.code === country;
            return (
              <button
                key={c.code}
                type="button"
                role="option"
                aria-selected={active}
                onClick={() => switchCountry(c.code)}
                className={"phone-input-picker-row" + (active ? " active" : "")}
              >
                <span style={{ fontSize: 20, lineHeight: 1 }} aria-hidden>{c.flag}</span>
                <span style={{ flex: 1, textAlign: "start" }}>{c[countryName] || c.name_ar}</span>
                <span style={{ direction: "ltr", opacity: .75, fontVariantNumeric: "tabular-nums" }}>{c.dial}</span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
