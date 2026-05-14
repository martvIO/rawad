// Live-location feature: the driver broadcasts their GPS fix; grooms watch
// the drivers sharing with them on a map. State is mirrored through
// localStorage ("dawa_live_locations") so it works across browser tabs.
import { useState, useEffect, useRef, useMemo } from "react";
import { load, save } from "../utils/storage.js";

export function useGeolocation({ userType, currentUsername, t, showToast }) {
  // Distributor → Groom: live location share (per-driver, with explicit shareWith list).
  // Shape: { [driverUsername]: { lat, lng, accuracy, timeISO, shareWith: [groomUsername...] } }
  const [liveLocations, setLiveLocations] = useState(() => load("dawa_live_locations", {}));
  const [liveShareWith, setLiveShareWith] = useState([]);

  // Driver: am I broadcasting? Did I get GPS permission? What's my latest fix?
  const [driverIsSharing,     setDriverIsSharing]     = useState(false);
  const [driverGeoPermission, setDriverGeoPermission] = useState("unknown"); // unknown | granted | denied
  const [driverGeoError,      setDriverGeoError]      = useState(null);
  const [driverCoords,        setDriverCoords]        = useState(null); // {lat, lng, accuracy}
  const driverWatchIdRef  = useRef(null);
  const driverCoordsRef   = useRef(null);

  // Groom: do I want to see myself on the map? GPS permission?
  const [groomGeoPermission, setGroomGeoPermission] = useState("unknown");
  const [groomGeoError,      setGroomGeoError]      = useState(null);
  const [groomCoords,        setGroomCoords]        = useState(null);
  const groomWatchIdRef = useRef(null);

  // Ticking state — bumps every second so live-map markers re-render and the
  // staleness filter re-evaluates even when liveLocations itself hasn't changed.
  const [nowTick, setNowTick] = useState(0);

  // Persist driver fixes so grooms (in other tabs) can read them.
  useEffect(() => { save("dawa_live_locations", liveLocations); }, [liveLocations]);

  // ── Driver: ask the browser for GPS permission, then start watchPosition ──
  // Permission is auto-prompted by the browser on the first call; we keep a
  // watchPosition open for the lifetime of the broadcast for smooth updates,
  // and ALSO push the latest fix to localStorage every 1s for grooms to read.
  const startDriverWatch = () => {
    setDriverGeoError(null);
    if (!("geolocation" in navigator)) {
      setDriverGeoError(t("geo_not_supported"));
      setDriverGeoPermission("denied");
      return;
    }
    // Stop any previous watch first (defensive)
    if (driverWatchIdRef.current != null) {
      navigator.geolocation.clearWatch(driverWatchIdRef.current);
      driverWatchIdRef.current = null;
    }
    driverWatchIdRef.current = navigator.geolocation.watchPosition(
      (pos) => {
        setDriverGeoPermission("granted");
        setDriverGeoError(null);
        const fix = {
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          accuracy: Math.round(pos.coords.accuracy || 0),
        };
        driverCoordsRef.current = fix;
        setDriverCoords(fix);
      },
      (err) => {
        setDriverGeoPermission(err.code === 1 ? "denied" : "denied");
        setDriverGeoError(err.code === 1 ? t("geo_denied") : (err.message || t("geo_denied")));
        if (driverWatchIdRef.current != null) {
          navigator.geolocation.clearWatch(driverWatchIdRef.current);
          driverWatchIdRef.current = null;
        }
        setDriverIsSharing(false);
      },
      { enableHighAccuracy: true, maximumAge: 1000, timeout: 12000 }
    );
  };

  // Start broadcasting (driver pressed "Start sharing")
  const saveLiveLocation = () => {
    if (liveShareWith.length === 0) { showToast(t("geo_pick_grooms_first")); return; }
    if (!currentUsername) return;
    setDriverIsSharing(true);
    startDriverWatch();
  };

  // Stop broadcasting (driver pressed "Stop sharing")
  const stopLiveLocation = () => {
    if (driverWatchIdRef.current != null) {
      navigator.geolocation.clearWatch(driverWatchIdRef.current);
      driverWatchIdRef.current = null;
    }
    setDriverIsSharing(false);
    setDriverCoords(null);
    driverCoordsRef.current = null;
    if (currentUsername) {
      setLiveLocations(prev => {
        const next = { ...prev };
        delete next[currentUsername];
        return next;
      });
    }
    setLiveShareWith([]);
    showToast(t("share_stopped"));
  };

  // While the driver is sharing, push their latest fix to localStorage every 1s
  // so all grooms watching see fresh data. Uses a ref to avoid restarting the
  // interval on every coord change.
  useEffect(() => {
    if (userType !== "driver" || !driverIsSharing || !currentUsername) return;
    const tick = () => {
      const fix = driverCoordsRef.current;
      if (!fix) return;
      setLiveLocations(prev => ({
        ...prev,
        [currentUsername]: {
          lat: fix.lat, lng: fix.lng, accuracy: fix.accuracy,
          timeISO: new Date().toISOString(),
          shareWith: [...liveShareWith],
        },
      }));
    };
    tick(); // push immediately so grooms see something the first second
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [userType, driverIsSharing, currentUsername, liveShareWith]);

  // Cleanup any open watch when the portal unmounts
  useEffect(() => () => {
    if (driverWatchIdRef.current != null) navigator.geolocation.clearWatch(driverWatchIdRef.current);
    if (groomWatchIdRef.current  != null) navigator.geolocation.clearWatch(groomWatchIdRef.current);
  }, []);

  // ── Groom: ask the browser for GPS permission, then start watchPosition ──
  const requestGroomLocation = () => {
    setGroomGeoError(null);
    if (!("geolocation" in navigator)) {
      setGroomGeoError(t("geo_not_supported"));
      setGroomGeoPermission("denied");
      return;
    }
    if (groomWatchIdRef.current != null) {
      navigator.geolocation.clearWatch(groomWatchIdRef.current);
      groomWatchIdRef.current = null;
    }
    groomWatchIdRef.current = navigator.geolocation.watchPosition(
      (pos) => {
        setGroomGeoPermission("granted");
        setGroomGeoError(null);
        setGroomCoords({
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          accuracy: Math.round(pos.coords.accuracy || 0),
        });
      },
      (err) => {
        setGroomGeoPermission("denied");
        setGroomGeoError(err.code === 1 ? t("geo_denied") : (err.message || t("geo_denied")));
        if (groomWatchIdRef.current != null) {
          navigator.geolocation.clearWatch(groomWatchIdRef.current);
          groomWatchIdRef.current = null;
        }
      },
      { enableHighAccuracy: true, maximumAge: 1000, timeout: 12000 }
    );
  };

  // Every second: bump a tick + re-read liveLocations from localStorage so the
  // groom sees driver positions update in near-real-time even across tabs.
  // We compare via a ref so the comparator sees the freshest state, not a stale closure.
  const liveLocationsRef = useRef(liveLocations);
  useEffect(() => { liveLocationsRef.current = liveLocations; }, [liveLocations]);
  useEffect(() => {
    if (userType !== "groom") return;
    const id = setInterval(() => {
      setNowTick(n => n + 1);
      try {
        const raw = localStorage.getItem("dawa_live_locations");
        if (!raw) return;
        const fresh = JSON.parse(raw) || {};
        const cur = liveLocationsRef.current || {};
        let changed = false;
        const keys = new Set([...Object.keys(fresh), ...Object.keys(cur)]);
        for (const k of keys) {
          if ((fresh[k]?.timeISO) !== (cur[k]?.timeISO)) { changed = true; break; }
        }
        if (changed) setLiveLocations(fresh);
      } catch {}
    }, 1000);
    return () => clearInterval(id);
  }, [userType]);

  // Convenience accessors
  const myLiveLocation = currentUsername ? liveLocations[currentUsername] : null;
  const driversSharingWithMe = useMemo(() => {
    if (userType !== "groom" || !currentUsername) return [];
    // A driver is considered "live" only if their last fix is within 30 seconds.
    // Beyond that we treat them as disconnected so their pin doesn't ghost on the map.
    const STALE_MS = 30 * 1000;
    const now = Date.now();
    return Object.entries(liveLocations)
      .filter(([_, info]) => {
        if (!Array.isArray(info?.shareWith)) return false;
        if (!info.shareWith.includes(currentUsername)) return false;
        if (typeof info.lat !== "number" || typeof info.lng !== "number") return false;
        const ts = info.timeISO ? Date.parse(info.timeISO) : 0;
        return ts && (now - ts) <= STALE_MS;
      })
  }, [liveLocations, currentUsername, userType, nowTick]);

  // Build the marker set for the LiveMap (groom's own + every driver sharing with them)
  const groomMapMarkers = useMemo(() => {
    const out = [];
    if (groomCoords) {
      out.push({
        key: `__you__`,
        lat: groomCoords.lat, lng: groomCoords.lng,
        kind: "you",
        label: t("map_you"),
      });
    }
    for (const d of driversSharingWithMe) {
      out.push({
        key: `drv_${d.driver}`,
        lat: d.lat, lng: d.lng,
        kind: "driver",
        label: `${t("map_driver")} · ${d.driver}`,
      });
    }
    return out;
  }, [groomCoords, driversSharingWithMe, t]);

  return {
    liveLocations, setLiveLocations,
    liveShareWith, setLiveShareWith,
    driverIsSharing, driverGeoPermission, driverGeoError, driverCoords,
    groomGeoPermission, groomGeoError, groomCoords,
    saveLiveLocation, stopLiveLocation, requestGroomLocation,
    myLiveLocation, driversSharingWithMe, groomMapMarkers,
  };
}
