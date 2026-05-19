// Lightweight Leaflet map for picking a single point. The guest can tap on
// the map or drag the marker; `onPick({ lat, lng })` fires on every change.
//
// Re-uses the existing useLeaflet hook (same CDN script LiveMap loads) so we
// keep one map stack in the app and avoid bundling a separate library.
import { useEffect, useRef } from "react";
import { useLeaflet } from "../hooks/useLeaflet.js";
import { C } from "../styles/theme.js";

const OSM_TILE = {
  url: "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
  attribution: "© OpenStreetMap",
  maxZoom: 19,
  subdomains: "abc",
};

// Israel-centred fallback (matches LiveMap.jsx).
const DEFAULT_CENTER = [32.79, 35.0];
const DEFAULT_ZOOM = 13;

export function MapPickerInline({ value, onPick, height = 300, t }) {
  const leafletReady = useLeaflet();
  const containerRef = useRef(null);
  const mapRef = useRef(null);
  const markerRef = useRef(null);
  const onPickRef = useRef(onPick);
  useEffect(() => { onPickRef.current = onPick; }, [onPick]);

  // Initialise the map once Leaflet is loaded.
  useEffect(() => {
    if (!leafletReady || !containerRef.current || mapRef.current) return;
    const L = window.L;
    const start = value && typeof value.lat === "number" && typeof value.lng === "number"
      ? [value.lat, value.lng]
      : DEFAULT_CENTER;
    const map = L.map(containerRef.current, {
      zoomControl: true, attributionControl: true,
    }).setView(start, value ? 16 : DEFAULT_ZOOM);
    L.tileLayer(OSM_TILE.url, {
      attribution: OSM_TILE.attribution,
      maxZoom: OSM_TILE.maxZoom,
      subdomains: OSM_TILE.subdomains,
    }).addTo(map);
    mapRef.current = map;

    // One draggable marker. If the user taps the map we move the marker there
    // instead of dropping a second one.
    const placeMarker = (latlng) => {
      if (!markerRef.current) {
        markerRef.current = L.marker(latlng, { draggable: true }).addTo(map);
        markerRef.current.on("dragend", (e) => {
          const ll = e.target.getLatLng();
          const cb = onPickRef.current;
          if (typeof cb === "function") cb({ lat: ll.lat, lng: ll.lng });
        });
      } else {
        markerRef.current.setLatLng(latlng);
      }
      const cb = onPickRef.current;
      if (typeof cb === "function") cb({ lat: latlng[0], lng: latlng[1] });
    };

    map.on("click", (e) => placeMarker([e.latlng.lat, e.latlng.lng]));

    if (value && typeof value.lat === "number" && typeof value.lng === "number") {
      placeMarker([value.lat, value.lng]);
    }

    setTimeout(() => map.invalidateSize(), 60);

    return () => {
      map.remove();
      mapRef.current = null;
      markerRef.current = null;
    };
  }, [leafletReady]);

  // Sync external `value` changes (e.g. user pressed the GPS button after
  // opening the map) without recreating the map.
  useEffect(() => {
    if (!mapRef.current || !window.L || !value) return;
    if (typeof value.lat !== "number" || typeof value.lng !== "number") return;
    const latlng = [value.lat, value.lng];
    if (!markerRef.current) {
      markerRef.current = window.L.marker(latlng, { draggable: true }).addTo(mapRef.current);
      markerRef.current.on("dragend", (e) => {
        const ll = e.target.getLatLng();
        const cb = onPickRef.current;
        if (typeof cb === "function") cb({ lat: ll.lat, lng: ll.lng });
      });
    } else {
      markerRef.current.setLatLng(latlng);
    }
    mapRef.current.setView(latlng, 16);
  }, [value?.lat, value?.lng]);

  if (!leafletReady) {
    return (
      <div style={{
        width: "100%", height,
        display: "flex", alignItems: "center", justifyContent: "center",
        background: "rgba(255,255,255,.03)", border: "1px dashed rgba(201,168,76,.2)",
        borderRadius: 14, color: C.dim, fontSize: 13,
      }}>
        {t ? t("map_loading") : "..."}
      </div>
    );
  }

  return (
    <div style={{
      position: "relative", width: "100%", height,
      borderRadius: 14, overflow: "hidden",
      border: "1px solid rgba(201,168,76,.25)",
    }}>
      <div ref={containerRef} style={{ width: "100%", height: "100%" }}/>
    </div>
  );
}
