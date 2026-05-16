// Two-field address picker (city then street); emits a combined string.
import { useState, useRef, useEffect } from "react";
import { CityField } from "./CityField.jsx";
import { StreetField } from "./StreetField.jsx";
import { C } from "../styles/theme.js";

export function AddressInput({ value, onChange, placeholder, lang, t }) {
  // Parse incoming "value" into city + street ONCE on mount, so editing works
  const initialised = useRef(false);
  const [cityVal, setCityVal]     = useState("");
  const [streetVal, setStreetVal] = useState("");

  useEffect(() => {
    if (initialised.current) return;
    initialised.current = true;
    const raw = (value || "").trim();
    if (!raw) return;
    // Find longest known-city prefix
    const lower = raw.toLowerCase();
    let best = null;
    for (const c of CITIES_DB) {
      const ar = c.ar.toLowerCase();
      const he = c.he.toLowerCase();
      if (lower.startsWith(ar) && (!best || c.ar.length > best.len)) best = { matched: c.ar, len: c.ar.length };
      if (lower.startsWith(he) && (!best || c.he.length > best.len)) best = { matched: c.he, len: c.he.length };
    }
    if (best) {
      setCityVal(best.matched);
      setStreetVal(raw.slice(best.len).replace(/^[\s،,\-]+/, "").trim());
    } else {
      setCityVal(raw);
    }
  }, [value]);

  // Compose combined string back to parent on any change
  useEffect(() => {
    const combined = [cityVal.trim(), streetVal.trim()].filter(Boolean).join("، ");
    if (combined !== value) onChange(combined);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cityVal, streetVal]);

  return (
    <div>
      <div style={{ marginBottom: 5, fontSize: 11, color: C.dim, fontWeight: 700 }}>
        🏘 {t("addr_city_field")}
      </div>
      <div style={{ marginBottom: 12 }}>
        <CityField value={cityVal} onChange={setCityVal} lang={lang} t={t}/>
      </div>

      <div style={{ marginBottom: 5, fontSize: 11, color: C.dim, fontWeight: 700 }}>
        🛣 {t("addr_street_field")}
      </div>
      {cityVal.trim() ? (
        <StreetField value={streetVal} onChange={setStreetVal}
                     city={cityVal} lang={lang} t={t}/>
      ) : (
        <div style={{
          padding: "12px 14px", borderRadius: 12, fontSize: 12,
          background: "rgba(255,255,255,.03)", border: "1px dashed rgba(255,255,255,.1)",
          color: "#5a5040", textAlign: "center",
        }}>
          {t("addr_pick_city_first")}
        </div>
      )}
    </div>
  );
}
