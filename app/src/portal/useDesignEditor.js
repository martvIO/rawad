// Per-design editing state for the native Design editor — mirrors the web
// DesignEditorBody: a buffered field object `f` + a `dirty` key set, autosave via
// patchDesignById (commit on blur / toggle / pick, not per keystroke), optimistic
// theme/font/toggle updates, and gallery/hero/background media. All persistence
// reuses @dawa/core services; the WebView preview reads the saved draft, so
// autosave is what drives the preview forward.
import { useState, useEffect, useRef, useCallback } from "react";
import {
  subscribeDesign,
  patchDesignById,
  addDesignMedia,
  removeDesignMedia,
} from "@dawa/core/services/digitalInvitation.js";
import {
  SCALAR_KEYS,
  ARRAY_KEYS,
  TOGGLE_KEYS,
  isLocalizedScalar,
} from "@dawa/core/data/digitalDesignSchema.js";

const objOr = (v, fallback) => (v && typeof v === "object" && !Array.isArray(v) ? v : fallback);

export function useDesignEditor(uid, designId, { onError } = {}) {
  const [doc, setDoc] = useState(null);
  const [loaded, setLoaded] = useState(false);
  const [f, setF] = useState({});
  const dirty = useRef(new Set());

  // Re-subscribe + reset the buffer whenever the selected design changes.
  useEffect(() => {
    if (!uid || !designId) return undefined;
    setLoaded(false);
    setDoc(null);
    setF({});
    dirty.current = new Set();
    return subscribeDesign(uid, designId, (d) => {
      setDoc(d);
      setLoaded(true);
      const next = d || {};
      setF((prev) => {
        const merged = { ...prev };
        const apply = (k, v) => { if (!dirty.current.has(k)) merged[k] = v; };
        SCALAR_KEYS.forEach((k) => apply(k, next[k] ?? (isLocalizedScalar(k) ? {} : "")));
        apply("weddingDate", next.weddingDate ?? null);
        ARRAY_KEYS.forEach((k) => apply(k, Array.isArray(next[k]) ? next[k] : []));
        TOGGLE_KEYS.forEach((k) => apply(k, next[k] !== false));
        apply("envelope", objOr(next.envelope, {}));
        apply("background", objOr(next.background, {}));
        apply("starfield", objOr(next.starfield, {}));
        apply("themeColor", next.themeColor || "gold");
        apply("fontFamily", next.fontFamily || "amiri");
        return merged;
      });
    });
  }, [uid, designId]);

  const status = doc?.designStatus || "draft";
  const media = Array.isArray(doc?.media) ? doc.media : [];
  const heroMedia = Array.isArray(doc?.heroMedia) ? doc.heroMedia : [];

  const persist = useCallback(
    async (patch) => {
      try {
        await patchDesignById(uid, designId, patch);
        return true;
      } catch (e) {
        onError && onError(e);
        return false;
      }
    },
    [uid, designId, onError],
  );

  const revert = useCallback(
    (key) => {
      const cur = doc || {};
      setF((prev) => {
        if (ARRAY_KEYS.includes(key)) return { ...prev, [key]: Array.isArray(cur[key]) ? cur[key] : [] };
        if (TOGGLE_KEYS.includes(key)) return { ...prev, [key]: cur[key] !== false };
        if (key === "envelope") return { ...prev, envelope: objOr(cur.envelope, {}) };
        if (key === "background") return { ...prev, background: objOr(cur.background, {}) };
        if (key === "starfield") return { ...prev, starfield: objOr(cur.starfield, {}) };
        if (key === "themeColor") return { ...prev, themeColor: cur.themeColor || "gold" };
        if (key === "fontFamily") return { ...prev, fontFamily: cur.fontFamily || "amiri" };
        if (key === "weddingDate") return { ...prev, weddingDate: cur.weddingDate ?? null };
        return { ...prev, [key]: cur[key] ?? (isLocalizedScalar(key) ? {} : "") };
      });
      dirty.current.delete(key);
    },
    [doc],
  );

  const setField = useCallback((key, value) => {
    dirty.current.add(key);
    setF((prev) => ({ ...prev, [key]: value }));
  }, []);

  // Commit a buffered scalar/array field on blur.
  const flush = useCallback(
    async (key, value) => {
      if (!dirty.current.has(key)) return;
      const ok = await persist({ [key]: value });
      if (ok) dirty.current.delete(key);
      else revert(key);
    },
    [persist, revert],
  );

  const toggle = useCallback(
    async (key, checked) => {
      setF((prev) => ({ ...prev, [key]: checked }));
      const ok = await persist({ [key]: checked });
      if (!ok) revert(key);
    },
    [persist, revert],
  );

  const commitArray = useCallback(
    async (key, arr) => {
      setField(key, arr);
      const ok = await persist({ [key]: arr });
      if (ok) dirty.current.delete(key);
      else revert(key);
    },
    [persist, revert, setField],
  );

  // Optimistic pick (theme/font): update the buffer, persist in the background.
  const pick = useCallback(
    (key, value) => {
      setField(key, value);
      flush(key, value);
    },
    [setField, flush],
  );

  // ── Localized scalar helpers ({ ar, he }; a legacy plain string reads as ar) ──
  const getLoc = useCallback(
    (key, editLang) => {
      const v = f[key];
      if (v && typeof v === "object") return v[editLang] || "";
      if (typeof v === "string") return editLang === "ar" ? v : "";
      return "";
    },
    [f],
  );
  const setLoc = useCallback(
    (key, editLang, text) => {
      const raw = f[key];
      const cur = raw && typeof raw === "object" ? raw : typeof raw === "string" && raw ? { ar: raw } : {};
      setField(key, { ...cur, [editLang]: text });
    },
    [f, setField],
  );

  // ── Nested object fields (envelope / background / starfield) ─────────────────
  // A subkey set to null/"" is removed → falls back to the theme default.
  const setNested = useCallback(
    (parent, subKey, value) => {
      const cur = objOr(f[parent], {});
      const n = { ...cur };
      if (value == null || value === "") delete n[subKey];
      else n[subKey] = value;
      setField(parent, n);
      flush(parent, n);
    },
    [f, setField, flush],
  );

  // ── Media (gallery / hero / background) ──────────────────────────────────────
  const addMedia = useCallback(
    async (file, target /* "gallery" | "hero" | "background" */, opts) => {
      const item = await addDesignMedia(uid, designId, file, target === "gallery" ? { ...opts } : { target, ...opts });
      if (!item?.storagePath) return null;
      if (target === "background") {
        const mergeImg = (o) => ({ ...(o || {}), background: { ...objOr((o || {}).background, {}), image: item } });
        setDoc((prev) => mergeImg(prev));
        setF((prev) => mergeImg(prev));
      } else {
        const arrKey = target === "hero" ? "heroMedia" : "media";
        setDoc((prev) => ({ ...(prev || {}), [arrKey]: [...((prev || {})[arrKey] || []), item] }));
      }
      return item;
    },
    [uid, designId],
  );

  const removeMedia = useCallback(
    async (item, target) => {
      await removeDesignMedia(uid, designId, item, target === "gallery" ? {} : { target });
      if (target === "background") {
        const clearImg = (o) => ({ ...(o || {}), background: { ...objOr((o || {}).background, {}), image: null } });
        setDoc((prev) => clearImg(prev));
        setF((prev) => clearImg(prev));
      } else {
        const arrKey = target === "hero" ? "heroMedia" : "media";
        setDoc((prev) => ({ ...(prev || {}), [arrKey]: ((prev || {})[arrKey] || []).filter((m) => m.storagePath !== item.storagePath) }));
      }
    },
    [uid, designId],
  );

  return {
    doc,
    loaded,
    status,
    f,
    media,
    heroMedia,
    themeColor: f.themeColor || doc?.themeColor || "gold",
    fontFamily: f.fontFamily || doc?.fontFamily || "amiri",
    envelope: objOr(f.envelope, {}),
    background: objOr(f.background, {}),
    starfield: objOr(f.starfield, {}),
    setField,
    flush,
    toggle,
    commitArray,
    pick,
    getLoc,
    setLoc,
    setNested,
    addMedia,
    removeMedia,
  };
}
