// Reusable status/category filter chips for list views. A horizontal,
// scrollable row of pill toggles (single-select). Pairs with SearchBar + the
// useListFilter hook (utils/searchFilter.js), which produces the `options`
// array (each with a live `count`).
//
// Presentational + controlled. Active pill uses the gold selected-card styling
// from GroomMultiSelect; inactive pills are faint. RTL-aware via `lang`.
//
// Props:
//   options   — [{ key, label, count }] (the leading "all" chip is just key:"all")
//   value     — active key (e.g. "all" | "pending" | "delivered")
//   onChange  — (key: string) => void
//   lang      — "ar" | "he"
//   style     — optional extra wrapper styles
import { C } from "../styles/theme.js";
import { Num } from "./Num.jsx";

export function FilterChips({ options = [], value = "all", onChange, lang = "ar", style }) {
  const isRtl = lang !== "he";
  if (!options || options.length === 0) return null;

  return (
    <div
      style={{
        display: "flex", gap: 6, flexWrap: "nowrap", overflowX: "auto",
        paddingBottom: 4, marginBottom: 12,
        direction: isRtl ? "rtl" : "ltr",
        scrollbarWidth: "thin",
        ...style,
      }}
    >
      {options.map((opt) => {
        const active = value === opt.key;
        return (
          <button
            key={opt.key}
            type="button"
            onClick={() => onChange(opt.key)}
            style={{
              flex: "0 0 auto",
              display: "inline-flex", alignItems: "center", gap: 6,
              padding: "6px 12px", borderRadius: 20, cursor: "pointer",
              background: active ? "rgba(201,168,76,.18)" : "rgba(255,255,255,.03)",
              border: `1.5px solid ${active ? C.gold : "rgba(255,255,255,.08)"}`,
              color: active ? C.gold : C.goldDim,
              fontWeight: active ? 800 : 700, fontSize: 12, fontFamily: "inherit",
              whiteSpace: "nowrap", transition: "all .18s",
            }}
          >
            <span>{opt.label}</span>
            {typeof opt.count === "number" && (
              <span
                style={{
                  fontSize: 11, fontWeight: 800,
                  color: active ? C.gold : C.dim,
                  background: active ? "rgba(201,168,76,.18)" : "rgba(255,255,255,.05)",
                  padding: "0 7px", borderRadius: 20, minWidth: 18, textAlign: "center",
                }}
              >
                <Num>{opt.count.toLocaleString("en")}</Num>
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
