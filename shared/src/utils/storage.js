// Storage helpers — every read/write goes through the @dawa/core storage
// adapter so failures (private mode, quota, disabled storage, or an unset
// adapter) degrade gracefully instead of throwing.
import { getStorage } from "../adapters/storage.js";

// Read a JSON value; return `fallback` when missing or unreadable.
export const load = (key, fallback) => {
  try {
    const v = getStorage().getItem(key);
    return v != null ? JSON.parse(v) : fallback;
  } catch {
    return fallback;
  }
};

// Write a JSON value (silently no-ops if storage is unavailable).
export const save = (key, val) => {
  try {
    getStorage().setItem(key, JSON.stringify(val));
  } catch {}
};

// Remove a key (silently no-ops if storage is unavailable).
export const removeKey = (key) => {
  try {
    getStorage().removeItem(key);
  } catch {}
};
