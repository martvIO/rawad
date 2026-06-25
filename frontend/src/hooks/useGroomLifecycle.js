// Polls the caller's own wedding-lifecycle status block (GET /lifecycle/me) and
// exposes a `reload()` so a screen can refetch right after a transition. Backs
// both the read-only banner (every groom tab) and the Manage screen.
import { useCallback, useEffect, useState } from "react";
import { getMyLifecycle } from "../services/lifecycle.js";
import { createPoller } from "../utils/poller.js";

const POLL_MS = 20000;

export function useGroomLifecycle({ enabled = true } = {}) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(enabled);
  const [reloadKey, setReloadKey] = useState(0);
  const reload = useCallback(() => setReloadKey((k) => k + 1), []);

  useEffect(() => {
    if (!enabled) {
      setData(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    const stop = createPoller(
      () => getMyLifecycle(),
      (v) => {
        setData(v && typeof v === "object" ? v : null);
        setLoading(false);
      },
      { intervalMs: POLL_MS, pauseWhenHidden: true },
    );
    return stop;
  }, [enabled, reloadKey]);

  const status = data?.lifecycleStatus || "active";
  return { status, data, loading, reload };
}
