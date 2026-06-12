// Reusable list search box. Visual + RTL parity with the search field inside
// GroomMultiSelect.jsx (🔍 icon, × clear, `.input-field` class). Presentational
// and controlled — the parent owns `value`/`onChange` (usually via useListFilter
// in utils/searchFilter.js). No i18n import: strings arrive as props, matching
// the app convention for shared components.
//
// Props:
//   value         — current query string (controlled)
//   onChange      — (next: string) => void
//   lang          — "ar" | "he" (Arabic renders RTL, Hebrew LTR — see isRtl)
//   placeholder   — input placeholder (already translated)
//   resultCount   — optional; shown as "X / Y" pill when query is non-empty
//   totalCount    — optional; the denominator of that pill
//   autoFocus     — optional
//   style         — optional extra wrapper styles
import { C } from "../styles/theme.js";
import { Num } from "./Num.jsx";

export function SearchBar({
  value,
  onChange,
  lang = "ar",
  placeholder,
  resultCount,
  totalCount,
  autoFocus,
  style,
}) {
  const isRtl = lang !== "he"; // عربي → RTL ; עברית → LTR (matches GroomMultiSelect)
  const showCount =
    !!String(value || "").trim() &&
    typeof resultCount === "number" &&
    typeof totalCount === "number";

  return (
    <div style={{ position: "relative", marginBottom: 10, ...style }}>
      <input
        className="input-field"
        type="text"
        inputMode="search"
        autoFocus={autoFocus}
        placeholder={placeholder ?? (lang === "he" ? "חיפוש…" : "بحث…")}
        value={value || ""}
        onChange={(e) => onChange(e.target.value)}
        style={{
          paddingInlineStart: 36,
          paddingInlineEnd: showCount ? 86 : 36,
          direction: isRtl ? "rtl" : "ltr",
          marginBottom: 0,
        }}
      />
      {/* 🔍 leading icon */}
      <span
        style={{
          position: "absolute", insetInlineStart: 12, top: "50%",
          transform: "translateY(-50%)", fontSize: 14, pointerEvents: "none",
          color: C.dim,
        }}
      >
        🔍
      </span>

      {/* live result count pill (only while searching) */}
      {showCount && (
        <span
          style={{
            position: "absolute", insetInlineEnd: value ? 34 : 12, top: "50%",
            transform: "translateY(-50%)", pointerEvents: "none",
            fontSize: 11, fontWeight: 800, color: C.gold,
            background: "rgba(201,168,76,.16)", padding: "2px 8px", borderRadius: 20,
            whiteSpace: "nowrap",
          }}
        >
          <Num>{resultCount.toLocaleString("en")}</Num>
          {" / "}
          <Num>{totalCount.toLocaleString("en")}</Num>
        </span>
      )}

      {/* × clear */}
      {value && (
        <button
          type="button"
          onClick={() => onChange("")}
          aria-label={lang === "he" ? "נקה חיפוש" : "مسح البحث"}
          style={{
            position: "absolute", insetInlineEnd: 10, top: "50%",
            transform: "translateY(-50%)", background: "none", border: "none",
            color: C.dim, cursor: "pointer", fontSize: 16, lineHeight: 1, padding: 4,
          }}
        >
          ×
        </button>
      )}
    </div>
  );
}
