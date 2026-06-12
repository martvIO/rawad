// Live-location feature backed by Firebase RTDB (sharded by groom uid).
//
//   • Driver: holds a watchPosition open and, while broadcasting, writes the
//     latest fix into /liveLocationsByGroom/{groomUid}/{driverUid} for every
//     groom they've selected. Stopping clears those nodes.
//
//   • Groom: subscribes to /liveLocationsByGroom/{theirUid} so the rules
//     enforce that they only see drivers who chose to share with them.
//
// The previous in-browser localStorage poll loop and its stale-closure
// `driversSharingWithMe` bug (consumers were reading `d.driver` etc. on raw
// Object.entries() pairs) are gone — we map the snapshot into proper
// `{ driver, lat, lng, accuracy, time }` objects here.
import { useState, useEffect, useRef, useMemo } from "react";
import {
  publishMyFix, clearMyLocation, subscribeDriversForGroom,
} from "../services/liveLocations.js";
import { GEO } from "../config/index.js";
import { ROLES } from "../constants/roles.js";

const { STALE_MS, MAX_AGE_MS, TIMEOUT_MS, PUBLISH_INTERVAL_MS } = GEO;

export function useGeolocation({
  userType,
  currentUid,
  currentUsername,
  activeGroomUid,
  users,          // already scoped to the grooms the driver may share with
  t, showToast,
}) {
  // Translate `liveShareWith` (usernames the JSX slice writes) → groomUids
  // (what the RTDB shards are keyed by).
  const usernamesToUids = (list) =>
    (list || [])
      .map((u) => (users || []).find((x) => x.username === u)?.uid || u)
      .filter(Boolean);
  // ── Local-only state ──────────────────────────────────────────────────────
  const [liveShareWith, setLiveShareWith] = useState([]); // groomUids selected by the driver

  const [driverIsSharing,     setDriverIsSharing]     = useState(false);
  const [driverGeoPermission, setDriverGeoPermission] = useState("unknown");
  const [driverGeoError,      setDriverGeoError]      = useState(null);
  const [driverCoords,        setDriverCoords]        = useState(null);
  const driverWatchIdRef  = useRef(null);
  const driverCoordsRef   = useRef(null);

  const [groomGeoPermission, setGroomGeoPermission] = useState("unknown");
  const [groomGeoError,      setGroomGeoError]      = useState(null);
  const [groomCoords,        setGroomCoords]        = useState(null);
  const groomWatchIdRef = useRef(null);

  // Ticker bumps once per second so the stale-filter re-evaluates even when
  // no new snapshot has arrived.
  const [nowTick, setNowTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setNowTick((n) => n + 1), PUBLISH_INTERVAL_MS);
    return () => clearInterval(id);
  }, []);

  // ── Driver: GPS watchPosition lifecycle ───────────────────────────────────
  const startDriverWatch = () => {
    setDriverGeoError(null);
    if (!("geolocation" in navigator)) {
      setDriverGeoError(t("geo_not_supported"));
      setDriverGeoPermission("denied");
      return;
    }
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
        setDriverGeoPermission("denied");
        setDriverGeoError(err.code === 1 ? t("geo_denied") : (err.message || t("geo_denied")));
        if (driverWatchIdRef.current != null) {
          navigator.geolocation.clearWatch(driverWatchIdRef.current);
          driverWatchIdRef.current = null;
        }
        setDriverIsSharing(false);
      },
      { enableHighAccuracy: true, maximumAge: MAX_AGE_MS, timeout: TIMEOUT_MS },
    );
  };

  const saveLiveLocation = () => {
    if (liveShareWith.length === 0) { showToast(t("geo_pick_grooms_first")); return; }
    if (!currentUid) return;
    setDriverIsSharing(true);
    startDriverWatch();
  };

  const stopLiveLocation = async () => {
    if (driverWatchIdRef.current != null) {
      navigator.geolocation.clearWatch(driverWatchIdRef.current);
      driverWatchIdRef.current = null;
    }
    setDriverIsSharing(false);
    setDriverCoords(null);
    driverCoordsRef.current = null;
    try { await clearMyLocation(currentUid, usernamesToUids(liveShareWith)); } catch {}
    setLiveShareWith([]);
    showToast(t("share_stopped"));
  };

  // While broadcasting, push the latest fix to RTDB every second.
  useEffect(() => {
    if (userType !== ROLES.DRIVER || !driverIsSharing || !currentUid) return;
    const tick = () => {
      const fix = driverCoordsRef.current;
      if (!fix) return;
      publishMyFix(currentUid, currentUsername, fix, usernamesToUids(liveShareWith)).catch(() => {});
    };
    tick();
    const id = setInterval(tick, PUBLISH_INTERVAL_MS);
    return () => clearInterval(id);
  }, [userType, driverIsSharing, currentUid, liveShareWith]);

  // Clean up any open watch when the portal unmounts.
  useEffect(() => () => {
    if (driverWatchIdRef.current != null) navigator.geolocation.clearWatch(driverWatchIdRef.current);
    if (groomWatchIdRef.current  != null) navigator.geolocation.clearWatch(groomWatchIdRef.current);
  }, []);

  // ── Groom: GPS watchPosition (their own marker on the map) ────────────────
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
      { enableHighAccuracy: true, maximumAge: MAX_AGE_MS, timeout: TIMEOUT_MS },
    );
  };

  // ── Groom: subscribe to the drivers currently sharing with them ───────────
  const [driversSnapshot, setDriversSnapshot] = useState({}); // { [driverUid]: { lat, lng, accuracy, timeISO } }
  useEffect(() => {
    if (userType !== ROLES.GROOM || !activeGroomUid) { setDriversSnapshot({}); return; }
    return subscribeDriversForGroom(activeGroomUid, setDriversSnapshot);
  }, [userType, activeGroomUid]);

  // Match the original consumer shape: array of objects with .driver, .lat,
  // .lng, .accuracy, .time. (Fixes the latent bug from the localStorage era.)
  const driversSharingWithMe = useMemo(() => {
    if (userType !== ROLES.GROOM) return [];
    const now = Date.now();
    const out = [];
    for (const [driverUid, info] of Object.entries(driversSnapshot || {})) {
      if (!info || typeof info.lat !== "number" || typeof info.lng !== "number") continue;
      const ts = info.timeISO ? Date.parse(info.timeISO) : 0;
      if (!ts || (now - ts) > STALE_MS) continue;
      // Resolve a friendly display name: prefer the name the driver embedded
      // in their fix; then any /users profile we can see; finally the uid.
      const profile = (users || []).find(u => u.uid === driverUid);
      out.push({
        driver: info.driverDisplayName || profile?.username || driverUid,
        uid: driverUid,
        lat: info.lat,
        lng: info.lng,
        accuracy: info.accuracy,
        time: new Date(ts),
      });
    }
    return out;
  }, [userType, driversSnapshot, users, nowTick]);

  const myLiveLocation = driverCoords; // alias kept for any legacy reference

  // ── Marker set for the LiveMap component ──────────────────────────────────
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
        key: `drv_${d.uid}`,
        lat: d.lat, lng: d.lng,
        kind: "driver",
        label: `${t("map_driver")} · ${d.driver}`,
      });
    }
    return out;
  }, [groomCoords, driversSharingWithMe, t]);

  return {
    liveShareWith, setLiveShareWith,
    driverIsSharing, driverGeoPermission, driverGeoError, driverCoords,
    groomGeoPermission, groomGeoError, groomCoords,
    saveLiveLocation, stopLiveLocation, requestGroomLocation,
    myLiveLocation, driversSharingWithMe, groomMapMarkers,
  };
}
