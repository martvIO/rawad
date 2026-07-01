// Composed groom DIGITAL data context — mounted once at (groom)/_layout so the
// three tabs share one set of pollers. Subscribes to the shared @dawa/core
// services (each wraps createPoller, RN-safe) and exposes the data + optimistic
// mutations every groom screen needs. Mirrors the web's optimistic + pending-map
// patterns (the fixes for the vanishing-media / vanishing-guest bugs).
import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  useCallback,
} from "react";
import { AppState } from "react-native";
import {
  subscribeDigitalGuests,
  subscribeDigitalMedia,
  subscribeDesigns,
  setWeddingDate,
  setGuestRanks,
  addInvitationMedia,
  removeInvitationMedia,
  addDigitalGuest,
  updateDigitalGuest,
  removeDigitalGuest,
} from "@dawa/core/services/digitalInvitation.js";
import { localizeApiError } from "@dawa/core/utils/apiError.js";
import { usePortal } from "./PortalContext.jsx";
import { useToast } from "../ui/Toast.jsx";

const Ctx = createContext(null);
export const useGroomDigital = () => useContext(Ctx);

const MAX_RANK_ITEMS = 32;
const MAX_RANK_LEN = 60;
const CYCLE = ["pending", "attending", "absent"];

// Upload progress uses XMLHttpRequest.upload (the apiClient XHR path), which is
// unreliable on RN/Android. Default OFF → the robust `fetch` path (no progress)
// + the pending-tile spinner. Flip to true AFTER verifying xhr.upload progress
// fires on a real Android + iOS device (the on-device upload spike).
const ENABLE_UPLOAD_PROGRESS = false;

export function guestStatus(g) {
  return g?.status === "attending" || g?.status === "absent" ? g.status : "pending";
}

export function DigitalProvider({ children }) {
  const { user, t } = usePortal();
  const uid = user?.uid;
  const toast = useToast();

  const [guests, setGuests] = useState([]);
  const [doc, setDoc] = useState(null);
  const [designs, setDesigns] = useState([]);
  const [loading, setLoading] = useState(true);
  const [uploadState, setUploadState] = useState({ busy: false, progress: 0, pending: [] });

  const pendingPathsRef = useRef(new Map()); // storagePath -> media item (in-flight)
  const pendingGuestsRef = useRef(new Map()); // id -> just-added guest (poll-race bridge)
  const subsRef = useRef([]);
  const uploadAbortRef = useRef(null);

  const fail = useCallback(
    (e, fallback) => toast.show("✗ " + localizeApiError(e, t, fallback || t("err_generic"))),
    [toast, t],
  );

  // Merge in-flight uploads into a freshly-polled doc so a poll can't wipe a
  // just-uploaded tile before the server lists it (web BUG-O002).
  const mergePending = useCallback((serverDoc) => {
    if (!serverDoc) return serverDoc;
    const media = Array.isArray(serverDoc.media) ? [...serverDoc.media] : [];
    const have = new Set(media.map((m) => m.storagePath));
    for (const [path, item] of pendingPathsRef.current) {
      if (have.has(path)) pendingPathsRef.current.delete(path);
      else media.push(item);
    }
    return { ...serverDoc, media };
  }, []);

  // Bridge a just-added guest across the poll that hasn't indexed it yet, so a
  // stale-in-flight poll can't momentarily drop it (guest twin of mergePending).
  const mergePendingGuests = useCallback((list) => {
    const arr = Array.isArray(list) ? [...list] : [];
    const have = new Set(arr.map((g) => g.id));
    for (const [id, g] of pendingGuestsRef.current) {
      if (have.has(id)) pendingGuestsRef.current.delete(id);
      else arr.unshift(g);
    }
    return arr;
  }, []);

  const subscribe = useCallback(() => {
    if (!uid) return;
    subsRef.current = [
      subscribeDigitalGuests(
        uid,
        (list) => {
          setGuests(mergePendingGuests(list));
          setLoading(false);
        },
        (e) => fail(e),
      ),
      subscribeDigitalMedia(uid, (d) => setDoc(d), (e) => fail(e), mergePending),
      subscribeDesigns(uid, (d) => setDesigns(d || []), () => {}),
    ];
  }, [uid, fail, mergePending, mergePendingGuests]);

  const unsubscribeAll = useCallback(() => {
    subsRef.current.forEach((u) => {
      try {
        u && u();
      } catch {
        /* noop */
      }
    });
    subsRef.current = [];
  }, []);

  useEffect(() => {
    subscribe();
    return unsubscribeAll;
  }, [subscribe, unsubscribeAll]);

  // Pause pollers while backgrounded; re-subscribe (instant refresh) on resume.
  useEffect(() => {
    const sub = AppState.addEventListener("change", (s) => {
      if (s === "active") {
        if (subsRef.current.length === 0) subscribe();
      } else {
        unsubscribeAll();
      }
    });
    return () => sub.remove();
  }, [subscribe, unsubscribeAll]);

  // Abort any in-flight upload on unmount.
  useEffect(
    () => () => {
      try {
        uploadAbortRef.current?.abort();
      } catch {
        /* noop */
      }
    },
    [],
  );

  const ranks = doc?.guestRanks || [];
  const media = doc?.media || [];
  const weddingDate = doc?.weddingDate ?? null;

  const setDate = useCallback(
    async (epoch) => {
      try {
        await setWeddingDate(uid, epoch);
        setDoc((d) => ({ ...(d || {}), weddingDate: epoch }));
      } catch (e) {
        fail(e);
      }
    },
    [uid, fail],
  );

  const addRank = useCallback(
    async (label) => {
      const v = String(label || "").trim().slice(0, MAX_RANK_LEN);
      if (!v || ranks.includes(v)) return;
      const next = [...ranks, v].slice(0, MAX_RANK_ITEMS);
      try {
        await setGuestRanks(uid, next);
        setDoc((d) => ({ ...(d || {}), guestRanks: next }));
      } catch (e) {
        fail(e);
      }
    },
    [uid, ranks, fail],
  );

  const removeRank = useCallback(
    async (label) => {
      const next = ranks.filter((r) => r !== label);
      try {
        await setGuestRanks(uid, next);
        setDoc((d) => ({ ...(d || {}), guestRanks: next }));
      } catch (e) {
        fail(e);
      }
    },
    [uid, ranks, fail],
  );

  // Add one guest. Throws to the caller (the Add screen handles the toast +
  // duplicate_phone code). Optimistically prepends + bridges the poll race.
  const addGuest = useCallback(
    async ({ name, phone, ranks }) => {
      const id = await addDigitalGuest(uid, { name, phone, ranks });
      const optimistic = { id, name, phone, status: "pending", createdAt: Date.now() };
      if (ranks?.length) optimistic.ranks = ranks;
      pendingGuestsRef.current.set(id, optimistic);
      setGuests((gs) => (gs.some((g) => g.id === id) ? gs : [optimistic, ...gs]));
      return id;
    },
    [uid],
  );

  const editGuest = useCallback(
    async (id, patch) => {
      await updateDigitalGuest(uid, id, patch); // throws to caller (sheet) on failure
      setGuests((gs) => gs.map((g) => (g.id === id ? { ...g, ...patch } : g)));
    },
    [uid],
  );

  const deleteGuest = useCallback(
    async (id) => {
      try {
        await removeDigitalGuest(uid, id);
        pendingGuestsRef.current.delete(id);
        setGuests((gs) => gs.filter((g) => g.id !== id));
      } catch (e) {
        fail(e);
      }
    },
    [uid, fail],
  );

  const cycleGuestStatus = useCallback(
    async (g) => {
      const next = CYCLE[(CYCLE.indexOf(guestStatus(g)) + 1) % CYCLE.length];
      try {
        await editGuest(g.id, { status: next });
      } catch (e) {
        fail(e);
      }
    },
    [editGuest, fail],
  );

  // files: [{ uri, name, type, kind }] from the image picker.
  const addMedia = useCallback(
    async (files) => {
      if (!files?.length) return;
      const stamp = Date.now();
      const previews = files.map((f, i) => ({
        storagePath: `__pending_${stamp}_${i}`,
        url: f.uri,
        kind: f.kind || "image",
        pending: true,
      }));
      setUploadState({ busy: true, progress: 0, pending: previews });
      const ctrl = new AbortController();
      uploadAbortRef.current = ctrl;
      const fractions = new Array(files.length).fill(0);
      const onFileProgress = (i) => (frac) => {
        fractions[i] = frac;
        setUploadState((s) => ({
          ...s,
          progress: fractions.reduce((a, b) => a + b, 0) / fractions.length,
        }));
      };
      const results = await Promise.allSettled(
        files.map((f, i) =>
          addInvitationMedia(
            uid,
            { uri: f.uri, name: f.name || `upload_${i}.jpg`, type: f.type || "image/jpeg" },
            {
              signal: ctrl.signal,
              ...(ENABLE_UPLOAD_PROGRESS ? { onProgress: onFileProgress(i) } : {}),
            },
          ),
        ),
      );
      const added = [];
      results.forEach((r) => {
        if (r.status === "fulfilled" && r.value?.storagePath) {
          pendingPathsRef.current.set(r.value.storagePath, r.value);
          added.push(r.value);
        }
      });
      setDoc((d) => {
        const have = new Set((d?.media || []).map((m) => m.storagePath));
        const fresh = added.filter((m) => !have.has(m.storagePath));
        return { ...(d || {}), media: [...(d?.media || []), ...fresh] };
      });
      setUploadState({ busy: false, progress: 0, pending: [] });
      uploadAbortRef.current = null;
      const failed = results.filter((r) => r.status === "rejected").length;
      if (failed && failed === files.length) {
        fail(results.find((r) => r.status === "rejected")?.reason, t("err_upload"));
      } else if (failed) {
        toast.show(t("upload_partial") || "بعض الملفات لم تُرفع");
      }
    },
    [uid, fail, toast, t],
  );

  const removeMedia = useCallback(
    async (item) => {
      try {
        await removeInvitationMedia(uid, item);
        pendingPathsRef.current.delete(item.storagePath);
        setDoc((d) => ({
          ...(d || {}),
          media: (d?.media || []).filter((m) => m.storagePath !== item.storagePath),
        }));
      } catch (e) {
        fail(e);
      }
    },
    [uid, fail],
  );

  const stats = useMemo(() => {
    let attending = 0;
    let absent = 0;
    let companions = 0;
    for (const g of guests) {
      const s = guestStatus(g);
      if (s === "attending") {
        attending++;
        companions += Number(g.companions || 0);
      } else if (s === "absent") {
        absent++;
      }
    }
    const total = guests.length;
    const pending = total - attending - absent;
    return {
      total,
      attending,
      absent,
      pending,
      companions,
      expected: attending + companions,
      pct: total ? Math.round((attending / total) * 100) : 0,
    };
  }, [guests]);

  const value = {
    uid,
    loading,
    guests,
    doc,
    designs,
    ranks,
    media,
    weddingDate,
    stats,
    uploadState,
    canSeeAttendance: user?.canSeeAttendance !== false,
    guestStatus,
    setDate,
    addRank,
    removeRank,
    addGuest,
    editGuest,
    deleteGuest,
    cycleGuestStatus,
    addMedia,
    removeMedia,
  };

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
