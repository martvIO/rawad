// Web implementation of the @dawa/core storage adapter — a synchronous
// localStorage wrapper. Every method swallows errors (private mode, quota,
// disabled storage) so the shared storage seam degrades gracefully, exactly
// matching the original inline behavior in tokenManager.js / utils/storage.js.
export const webStorage = {
  getItem(key) {
    try {
      return localStorage.getItem(key);
    } catch {
      return null;
    }
  },
  setItem(key, value) {
    try {
      localStorage.setItem(key, value);
    } catch {
      /* ignore */
    }
  },
  removeItem(key) {
    try {
      localStorage.removeItem(key);
    } catch {
      /* ignore */
    }
  },
};
