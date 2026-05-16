// Leaflet map that renders/syncs multiple markers without re-creating the map.
import { useRef, useEffect } from "react";
import { useLeaflet } from "../hooks/useLeaflet.js";
import { C } from "../styles/theme.js";

export function LiveMap({ markers, t, lang, height = 420 }) {
  const leafletReady = useLeaflet();
  const containerRef = useRef(null);
  const mapRef       = useRef(null);
  const markerObjsRef = useRef(new Map()); // key -> L.marker
  const didFitRef     = useRef(false);

  // Build marker icon HTML for a given kind. Re-used across renders.
  const buildIcon = (kind, label) => {
    const L = window.L;
    if (!L) return null;
    const isYou = kind === "you";
    const bg     = isYou ? "linear-gradient(135deg,#c9a84c,#f0c84c)" : "linear-gradient(135deg,#4b9fd4,#3a7fb0)";
    const ring   = isYou ? C.gold : C.blue;
    const icon   = isYou ? "👤" : "🚗";
    const html = `
      <div style="position:relative;width:44px;height:54px;display:flex;flex-direction:column;align-items:center;">
        <div style="
          width:38px;height:38px;border-radius:50%;
          background:${bg};border:2.5px solid #fff;
          box-shadow:0 0 0 3px ${ring}55, 0 4px 14px rgba(0,0,0,.45);
          display:flex;align-items:center;justify-content:center;
          font-size:20px;line-height:1;
        ">${icon}</div>
        <div style="
          width:0;height:0;margin-top:-3px;
          border-left:6px solid transparent;border-right:6px solid transparent;
          border-top:9px solid #fff;
          filter:drop-shadow(0 2px 2px rgba(0,0,0,.35));
        "></div>
        <div style="
          margin-top:2px;padding:2px 7px;border-radius:8px;
          background:rgba(7,7,10,.86);border:1px solid ${ring}66;
          color:#f5e6b8;font-size:10px;font-weight:800;
          white-space:nowrap;font-family:'Cairo','Amiri',sans-serif;
        ">${label}</div>
      </div>`;
    return L.divIcon({
      html, className: "dawa-live-marker",
      iconSize:   [44, 80],
      iconAnchor: [22, 47], // tip of the chevron
      popupAnchor: [0, -46],
    });
  };

  // Initialise the map ONCE (when Leaflet is ready and we have at least one marker
  // or the container is mounted).
  useEffect(() => {
    if (!leafletReady || !containerRef.current || mapRef.current) return;
    const L = window.L;
    // Default centre: roughly Haifa, fallback when no markers yet.
    const fallback = [32.79, 35.0];
    const start = markers.length > 0 ? [markers[0].lat, markers[0].lng] : fallback;
    const map = L.map(containerRef.current, {
      zoomControl: true, attributionControl: true,
    }).setView(start, 13);
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: "© OpenStreetMap",
      maxZoom: 19,
    }).addTo(map);
    mapRef.current = map;
    // Invalidate size after mount so Leaflet picks up final container dimensions
    setTimeout(() => map.invalidateSize(), 60);
    return () => {
      map.remove();
      mapRef.current = null;
      markerObjsRef.current = new Map();
      didFitRef.current = false;
    };
  }, [leafletReady]);

  // Sync markers: add/update/remove without re-creating the map
  useEffect(() => {
    if (!leafletReady || !mapRef.current) return;
    const L = window.L;
    const map = mapRef.current;
    const existing = markerObjsRef.current;
    const seen = new Set();

    for (const m of markers) {
      seen.add(m.key);
      const latlng = [m.lat, m.lng];
      const prev = existing.get(m.key);
      if (prev) {
        prev.setLatLng(latlng);
        prev.setIcon(buildIcon(m.kind, m.label));
      } else {
        const marker = L.marker(latlng, { icon: buildIcon(m.kind, m.label) }).addTo(map);
        existing.set(m.key, marker);
      }
    }
    // Remove markers that vanished
    for (const [key, marker] of existing.entries()) {
      if (!seen.has(key)) {
        marker.remove();
        existing.delete(key);
      }
    }

    // Auto-fit to bounds the FIRST time we have markers, then leave the user in control
    if (markers.length > 0 && !didFitRef.current) {
      if (markers.length === 1) {
        map.setView([markers[0].lat, markers[0].lng], 14);
      } else {
        const bounds = L.latLngBounds(markers.map(m => [m.lat, m.lng]));
        map.fitBounds(bounds, { padding: [50, 50], maxZoom: 15 });
      }
      didFitRef.current = true;
    }
  }, [markers, leafletReady]);

  // Re-invalidate the map size whenever the container becomes visible again
  // (e.g. switching tabs in the groom dashboard).
  useEffect(() => {
    if (!mapRef.current) return;
    const id = setTimeout(() => mapRef.current && mapRef.current.invalidateSize(), 80);
    return () => clearTimeout(id);
  });

  if (!leafletReady) {
    return (
      <div style={{
        width: "100%", height,
        display: "flex", alignItems: "center", justifyContent: "center",
        background: "rgba(255,255,255,.03)", border: "1px dashed rgba(201,168,76,.2)",
        borderRadius: 14, color: C.dim, fontSize: 13,
      }}>
        {t("map_loading")}
      </div>
    );
  }
  return <div ref={containerRef} style={{ width: "100%", height, borderRadius: 14, overflow: "hidden" }}/>;
}
