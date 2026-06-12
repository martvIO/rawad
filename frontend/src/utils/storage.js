// localStorage helpers — every read/write goes through these so failures
// (private mode, quota, disabled storage) degrade gracefully instead of throwing.

// Read a JSON value; return `fallback` when missing or unreadable.
export const load = (key, fallback) => {
  try {
    const v = localStorage.getItem(key);
    return v != null ? JSON.parse(v) : fallback;
  } catch {
    return fallback;
  }
};

// Write a JSON value (silently no-ops if storage is unavailable).
export const save = (key, val) => {
  try {
    localStorage.setItem(key, JSON.stringify(val));
  } catch {}
};

// Remove a key (silently no-ops if storage is unavailable).
export const removeKey = (key) => {
  try {
    localStorage.removeItem(key);
  } catch {}
};
