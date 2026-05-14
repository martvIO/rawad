// Street autocomplete scoped to a city — queries Nominatim + Photon.
import { useState, useMemo, useRef, useEffect } from "react";
import { CITIES_DB } from "../data/cities.js";

export function StreetField({ value, onChange, city, lang, t }) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState([]);
  const debounceRef = useRef(null);

  // Get the Hebrew + Arabic name of the city from CITIES_DB if we know it
  const cityNames = useMemo(() => {
    const trimmed = (city || "").trim();
    if (!trimmed) return { he: trimmed, ar: trimmed };
    const lower = trimmed.toLowerCase();
    const found = CITIES_DB.find(c =>
      c.ar.toLowerCase() === lower || c.he.toLowerCase() === lower
    );
    return found ? { he: found.he, ar: found.ar } : { he: trimmed, ar: trimmed };
  }, [city]);

  useEffect(() => {
    if (!open) return;
    const q = (value || "").trim();
    if (q.length < 1) { setResults([]); setLoading(false); return; }
    if (!city || !city.trim()) { setResults([]); setLoading(false); return; }
    clearTimeout(debounceRef.current);
    setLoading(true);
    debounceRef.current = setTimeout(async () => {
      const langCode = lang === "he" ? "he,en,ar" : "ar,en,he";
      const queries = [
        `${q} ${cityNames.he}`,
        `${q} ${cityNames.ar}`,
        `${cityNames.he} ${q}`,
      ];
      let found = [];

      // 1) Nominatim free-text search
      for (const variant of queries) {
        try {
          const url = `https://nominatim.openstreetmap.org/search?format=jsonv2`
                    + `&q=${encodeURIComponent(variant)}`
                    + `&countrycodes=il,ps&accept-language=${langCode}&limit=10&addressdetails=1&namedetails=1&dedupe=1`;
          const res = await fetch(url);
          if (!res.ok) continue;
          const data = await res.json();
          if (Array.isArray(data) && data.length > 0) {
            found = data;
            break;
          }
        } catch {}
      }

      // 2) Photon fallback
      if (found.length === 0) {
        for (const variant of queries) {
          try {
            const url = `https://photon.komoot.io/api/?q=${encodeURIComponent(variant)}&limit=10`;
            const res = await fetch(url);
            if (!res.ok) continue;
            const data = await res.json();
            if (data && Array.isArray(data.features) && data.features.length > 0) {
              const filtered = data.features
                .filter(f => {
                  const cc = (f.properties.countrycode || "").toUpperCase();
                  return cc === "IL" || cc === "PS";
                })
                .map(f => {
                  const p = f.properties;
                  const parts = [p.name, p.street, p.city, p.state].filter(Boolean);
                  return {
                    place_id: p.osm_id || `${Math.random()}`,
                    display_name: [...new Set(parts)].join(", "),
                    type: p.osm_value || p.osm_key || "place",
                    class: p.osm_key,
                  };
                });
              if (filtered.length > 0) { found = filtered; break; }
            }
          } catch {}
        }
      }

      // Keep only results that look like streets/places within the city
      const cityLower = (cityNames.he + " " + cityNames.ar).toLowerCase();
      const filtered = found.filter(r => {
        const dn = (r.display_name || "").toLowerCase();
        return cityLower.split(" ").some(w => w && dn.includes(w));
      });
      setResults(filtered.length > 0 ? filtered : found);
      setLoading(false);
    }, 250);
    return () => clearTimeout(debounceRef.current);
  }, [value, open, city, lang, cityNames.he, cityNames.ar]);

  const labelFor = (r) => {
    if (!r.display_name) return "";
    const parts = r.display_name.split(",").map(s => s.trim()).filter(Boolean);
    // Drop "Israel" / "ישראל" / "إسرائيل" from the tail to keep label short
    const cleaned = parts.filter(p => !/^(ישראל|إسرائيل|israel|פלסטין|فلسطين|palestine)$/i.test(p));
    return cleaned.slice(0, 2).join("، ");
  };

  return (
    <div style={{ position: "relative" }}>
      <input className="input-field" type="text" placeholder={t("addr_street_placeholder")}
             value={value}
             onChange={e => { onChange(e.target.value); setOpen(true); }}
             onFocus={() => setOpen(true)}
             onBlur={() => setTimeout(() => setOpen(false), 200)}/>
      {open && (loading || results.length > 0 || (value || "").trim().length >= 1) && (
        <div style={{
          position: "absolute", top: "100%", left: 0, right: 0,
          background: "#0c0c11", border: "1px solid rgba(201,168,76,.3)",
          borderRadius: 12, marginTop: 4, padding: 6,
          maxHeight: 260, overflowY: "auto", zIndex: 100,
          boxShadow: "0 8px 28px rgba(0,0,0,.6)",
        }}>
          {loading && (
            <div style={{ padding: "10px 12px", fontSize: 12, color: "#7a6a4a", textAlign: "center" }}>
              {t("addr_loading")}
            </div>
          )}
          {!loading && results.length === 0 && (
            <div style={{ padding: "10px 12px", fontSize: 12, color: "#7a6a4a", textAlign: "center" }}>
              {t("addr_no_matches")}
            </div>
          )}
          {!loading && results.map(r => (
            <div key={r.place_id} onMouseDown={e => e.preventDefault()}
                 onClick={() => { onChange(labelFor(r)); setOpen(false); }}
                 style={{
                   padding: "9px 12px", borderRadius: 8, cursor: "pointer",
                   fontSize: 13, color: "#f5e6b8", lineHeight: 1.5,
                   transition: "background .15s",
                 }}
                 onMouseEnter={e => e.currentTarget.style.background = "rgba(201,168,76,.12)"}
                 onMouseLeave={e => e.currentTarget.style.background = "transparent"}>
              <div style={{ fontWeight: 700 }}>🛣 {labelFor(r)}</div>
              {r.type && (
                <div style={{ fontSize: 10, color: "#7a6a4a", marginTop: 2 }}>
                  {r.class === "highway" || /residential|tertiary|primary|secondary/.test(r.type || "")
                    ? (lang === "he" ? "🛣 רחוב" : "🛣 شارع")
                    : `📍 ${r.type}`}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
