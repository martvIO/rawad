// Driver → Map: spatial view of every guest the driver is delivering for.
// Pins are colour-coded by status. Tapping one opens GuestMapModal with
// nav-app links + a mark-delivered form that mirrors the list view.
import { useEffect, useMemo, useRef, useState } from "react";
import { usePortal } from "../../../context/PortalContext.jsx";
import { LiveMap } from "../../../components/LiveMap.jsx";
import { GuestMapModal } from "../../../components/GuestMapModal.jsx";
import { Num } from "../../../components/Num.jsx";
import { geocodeAddress } from "../../../utils/geocode.js";
import { extractCity } from "../../../utils/geo.js";
import { C } from "../../../styles/theme.js";

const FILTERS = ["pending", "delivered", "all"];

export function DriverMap() {
  const { t, lang, myGuests, markGuestDelivered } = usePortal();
  const [filter, setFilter] = useState("pending");
  const [selectedId, setSelectedId] = useState(null);

  // Guests who didn't share precise GPS are placed by geocoding their written
  // address, so ALL guests show on the map (approximate pins). Each address is
  // geocoded once (cached); a ref tracks which ids we've already attempted.
  const [geo, setGeo] = useState({});            // guestId -> { lat, lng }
  const [geoProgress, setGeoProgress] = useState({ done: 0, total: 0 });
  const geocodedRef = useRef(new Set());

  useEffect(() => {
    let cancelled = false;
    const need = myGuests.filter(g =>
      !(typeof g.lat === "number" && typeof g.lng === "number") &&
      (g.area || "").trim() &&
      !geocodedRef.current.has(g.id),
    );
    if (need.length === 0) return undefined;
    need.forEach(g => geocodedRef.current.add(g.id));
    setGeoProgress(p => ({ done: p.done, total: p.total + need.length }));
    (async () => {
      for (const g of need) {
        if (cancelled) return;
        // Full address first, fall back to just the city. (geocodeAddress
        // self-throttles network calls and caches, so cache hits are instant.)
        // Hard per-guest cap so one slow/hanging lookup can't stall the batch.
        const coords = await Promise.race([
          geocodeAddress(g.area, extractCity(g.area)),
          new Promise(res => setTimeout(() => res(undefined), 8000)),
        ]);
        if (cancelled) return;
        if (coords) setGeo(prev => ({ ...prev, [g.id]: coords }));
        setGeoProgress(p => ({ done: p.done + 1, total: p.total }));
      }
    })();
    return () => { cancelled = true; };
  }, [myGuests]);

  // Merge precise GPS + geocoded coords; flag the approximate ones.
  const withCoords = useMemo(() => myGuests.map(g => {
    if (typeof g.lat === "number" && typeof g.lng === "number") return g;
    const c = geo[g.id];
    return c ? { ...g, lat: c.lat, lng: c.lng, approxLocation: true } : g;
  }), [myGuests, geo]);

  const located = useMemo(
    () => withCoords.filter(g => typeof g.lat === "number" && typeof g.lng === "number"),
    [withCoords],
  );
  const missingLocation = myGuests.length - located.length;
  const geocoding = geoProgress.total > geoProgress.done;

  const visible = useMemo(() => {
    if (filter === "pending")   return located.filter(g => g.status !== "delivered");
    if (filter === "delivered") return located.filter(g => g.status === "delivered");
    return located;
  }, [located, filter]);

  const markers = useMemo(() => visible.map(g => ({
    key:  g.id,
    lat:  g.lat,
    lng:  g.lng,
    kind: g.status === "delivered" ? "guest_delivered"
        : g.status === "enroute"   ? "guest_enroute"
        : "guest_pending",
    label: g.name,
  })), [visible]);

  const selected = selectedId ? visible.find(g => g.id === selectedId) : null;
  const counts = {
    pending:   located.filter(g => g.status !== "delivered").length,
    delivered: located.filter(g => g.status === "delivered").length,
    all:       located.length,
  };

  return (
    <div style={{ animation: "fadeUp .3s ease" }}>
      <div style={{ marginBottom: 12 }}>
        <div style={{ fontSize: 19, fontWeight: 900, color: C.blue, fontFamily: "'Amiri','Frank Ruhl Libre','Amiri Fallback',serif", marginBottom: 4 }}>
          {t("driver_map_title")}
        </div>
        <div style={{ fontSize: 12, color: C.dim }}>
          {t("driver_map_subtitle")}
        </div>
      </div>

      {/* Filter chips */}
      <div style={{ display: "flex", gap: 6, marginBottom: 12, flexWrap: "wrap" }}>
        {FILTERS.map(f => {
          const active = filter === f;
          return (
            <button key={f} onClick={() => setFilter(f)} style={{
              padding: "6px 12px", borderRadius: 20, cursor: "pointer",
              background: active ? "rgba(75,159,212,.2)" : "rgba(255,255,255,.04)",
              border: `1.5px solid ${active ? C.blue : "rgba(255,255,255,.1)"}`,
              color: active ? C.blue : C.dim,
              fontSize: 12, fontWeight: 700, fontFamily: "inherit",
            }}>
              {t(`map_filter_${f}`)} (<Num>{counts[f].toLocaleString("en")}</Num>)
            </button>
          );
        })}
      </div>

      {geocoding && (
        <div style={{
          marginBottom: 12, padding: "8px 12px", borderRadius: 10,
          background: "rgba(75,159,212,.06)", border: "1px solid rgba(75,159,212,.22)",
          fontSize: 11, color: C.blue, lineHeight: 1.6,
        }}>
          📍 {lang === "he" ? "מאתר מיקומי מוזמנים" : "جارٍ تحديد مواقع المعزومين"}…{" "}
          <Num>{geoProgress.done.toLocaleString("en")}</Num>/<Num>{geoProgress.total.toLocaleString("en")}</Num>
        </div>
      )}

      {!geocoding && missingLocation > 0 && (
        <div style={{
          marginBottom: 12, padding: "8px 12px", borderRadius: 10,
          background: "rgba(240,200,76,.06)", border: "1px solid rgba(240,200,76,.22)",
          fontSize: 11, color: "#c9a84c", lineHeight: 1.6,
        }}>
          ⓘ {t("map_missing_location_banner").replace("{n}", missingLocation.toLocaleString("en"))}
        </div>
      )}

      <div style={{
        borderRadius: 14, overflow: "hidden",
        border: "1px solid rgba(75,159,212,.18)", background: "#fff",
      }}>
        {markers.length > 0 ? (
          <LiveMap
            markers={markers}
            t={t} lang={lang}
            height={520}
            onMarkerClick={setSelectedId}
            showTileSwitcher
          />
        ) : (
          <div style={{
            height: 380, display: "flex", flexDirection: "column",
            alignItems: "center", justifyContent: "center",
            background: "rgba(255,255,255,.02)", color: C.dim,
            fontSize: 14, textAlign: "center", padding: 24, gap: 10,
          }}>
            <div style={{ fontSize: 48 }}>🗺</div>
            <div style={{ fontWeight: 800, color: C.gold }}>
              {t("map_empty_title")}
            </div>
            <div style={{ fontSize: 12, color: C.dim, maxWidth: 380, lineHeight: 1.7 }}>
              {t("map_empty_body")}
            </div>
          </div>
        )}
      </div>

      <GuestMapModal
        guest={selected}
        t={t}
        onClose={() => setSelectedId(null)}
        onMarkDelivered={markGuestDelivered}
      />
    </div>
  );
}
