// Native lifecycle hook for the Manage screen. Equivalent to the web
// hooks/useGroomLifecycle.js but without the web `pauseWhenHidden` — this is a
// low-frequency read (20s) and the Manage screen is rarely backgrounded mid-flow.
import { useCallback, useEffect, useState } from "react";
import { createPoller } from "@dawa/core/utils/poller.js";
import { getMyLifecycle } from "@dawa/core/services/lifecycle.js";

export function useGroomLifecycle() {
  const [status, setStatus] = useState(null);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [reloadKey, setReloadKey] = useState(0);

  const reload = useCallback(() => setReloadKey((k) => k + 1), []);

  useEffect(() => {
    const stop = createPoller(
      getMyLifecycle,
      (value) => {
        if (value) {
          // GET /lifecycle/me returns statusBlock() → { lifecycleStatus, ... }
          // (matches the web hook). Reading value.status left this stuck on
          // "active", hiding the paused/cancel banners + Resume/Undo actions.
          setStatus(value.lifecycleStatus || "active");
          setData(value);
        }
        setLoading(false);
      },
      { intervalMs: 20000 },
    );
    return stop;
  }, [reloadKey]);

  return { status, data, loading, reload };
}
