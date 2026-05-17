// Leaflet map that renders/syncs multiple markers without re-creating the map.
//
// Marker kinds supported: "you" (gold person), "driver" (blue car),
// "guest_pending" (blue mail), "guest_enroute" (yellow scooter),
// "guest_delivered" (green tick). Pass `onMarkerClick(key)` to make markers
// tappable. Pass `showTileSwitcher` to surface a corner control that lets
// the user toggle between OSM / satellite / light / dark basemaps.
import { useRef, useEffect, useState } from "react";
import { useLeaflet } from "../hooks/useLeaflet.js";
import { C } from "../styles/theme.js";

const TILE_LAYERS = {
  osm: {
    url: "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
    attribution: "© OpenStreetMap", maxZoom: 19, subdomains: "abc",
  },
  satellite: {
    url: "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
    attribution: "© Esri", maxZoom: 19,
  },
  light: {
    url: "https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}.png",
    attribution: "© OpenStreetMap, © CARTO", maxZoom: 19, subdomains: "abcd",
  },
  dark: {
    url: "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png",
    attribution: "© OpenStreetMap, © CARTO", maxZoom: 19, subdomains: "abcd",
  },
};

// One palette entry per marker kind. Keeps the visual contract central so
// new pages don't drift in colour or iconography.
const MARKER_KINDS = {
  you:              { bg: "linear-gradient(135deg,#c9a84c,#f0c84c)", ring: C.gold,    icon: "👤" },
  driver:           { bg: "linear-gradient(135deg,#4b9fd4,#3a7fb0)", ring: C.blue,    icon: "🚗" },
  guest_pending:    { bg: "linear-gradient(135deg,#4b9fd4,#3a7fb0)", ring: C.blue,    icon: "📩" },
  guest_enroute:    { bg: "linear-gradient(135deg,#f0c84c,#c9a84c)", ring: "#f0c84c", icon: "🛵" },
  guest_delivered:  { bg: "linear-gradient(135deg,#4cc97a,#2da85a)", ring: "#4cc97a", icon: "✓"  },
};

export function LiveMap({
  markers, t, lang, height = 420,
  onMarkerClick,
  tileLayer = "osm",
  showTileSwitcher = false,
}) {
  const leafletReady = useLeaflet();
  const containerRef = useRef(null);
  const mapRef       = useRef(null);
  const tileRef      = useRef(null);
  const markerObjsRef = useRef(new Map()); // key -> L.marker
  const didFitRef     = useRef(false);
  const onClickRef    = useRef(onMarkerClick);
  const [tile, setTile] = useState(tileLayer);

  // Keep the click handler ref current so existing markers fire the latest
  // closure without needing to rebind on every re-render.
  useEffect(() => { onClickRef.current = onMarkerClick; }, [onMarkerClick]);

  // External `tileLayer` prop wins on change (e.g. parent persists a choice).
  useEffect(() => { setTile(tileLayer); }, [tileLayer]);

  // Build marker icon HTML for a given kind. Re-used across renders.
  const buildIcon = (kind, label) => {
    const L = window.L;
    if (!L) return null;
    const palette = MARKER_KINDS[kind] || MARKER_KINDS.driver;
    const { bg, ring, icon } = palette;
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
    const initial = TILE_LAYERS[tile] || TILE_LAYERS.osm;
    tileRef.current = L.tileLayer(initial.url, {
      attribution: initial.attribution,
      maxZoom: initial.maxZoom,
      subdomains: initial.subdomains,
    }).addTo(map);
    mapRef.current = map;
    // Invalidate size after mount so Leaflet picks up final container dimensions
    setTimeout(() => map.invalidateSize(), 60);
    return () => {
      map.remove();
      mapRef.current = null;
      tileRef.current = null;
      markerObjsRef.current = new Map();
      didFitRef.current = false;
    };
  }, [leafletReady]);

  // Swap tile layer in-place when the user picks a different basemap.
  useEffect(() => {
    if (!mapRef.current || !window.L) return;
    const cfg = TILE_LAYERS[tile] || TILE_LAYERS.osm;
    if (tileRef.current) {
      tileRef.current.remove();
      tileRef.current = null;
    }
    tileRef.current = window.L.tileLayer(cfg.url, {
      attribution: cfg.attribution, maxZoom: cfg.maxZoom, subdomains: cfg.subdomains,
    }).addTo(mapRef.current);
  }, [tile, leafletReady]);

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
        marker.on("click", () => {
          const cb = onClickRef.current;
          if (typeof cb === "function") cb(m.key);
        });
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
  return (
    <div style={{ position: "relative", width: "100%", height, borderRadius: 14, overflow: "hidden" }}>
      <div ref={containerRef} style={{ width: "100%", height: "100%" }}/>
      {showTileSwitcher && <TileSwitcher tile={tile} setTile={setTile} t={t}/>}
    </div>
  );
}

function TileSwitcher({ tile, setTile, t }) {
  const opts = [
    { key: "osm",       label: t("map_layer_street")    || "Street" },
    { key: "satellite", label: t("map_layer_satellite") || "Satellite" },
    { key: "light",     label: t("map_layer_light")     || "Light" },
    { key: "dark",      label: t("map_layer_dark")      || "Dark" },
  ];
  return (
    <div style={{
      position: "absolute", top: 10, right: 10, zIndex: 500,
      background: "rgba(7,7,10,.86)", border: "1px solid rgba(201,168,76,.3)",
      borderRadius: 10, padding: 4, display: "flex", gap: 2,
      boxShadow: "0 4px 14px rgba(0,0,0,.5)",
    }}>
      {opts.map(o => {
        const active = tile === o.key;
        return (
          <button key={o.key} onClick={() => setTile(o.key)} style={{
            padding: "5px 10px", borderRadius: 6, border: "none",
            background: active ? "rgba(201,168,76,.25)" : "transparent",
            color: active ? C.gold : C.dim,
            fontSize: 11, fontWeight: 800, fontFamily: "inherit",
            cursor: "pointer", transition: "all .15s",
          }}>{o.label}</button>
        );
      })}
    </div>
  );
}
