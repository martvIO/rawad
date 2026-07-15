import { useEffect, useState } from "react";

// Ticks once a second toward `target` (epoch ms). Shared by every digital-
// invitation template's countdown visual — lifted out of the classic
// template's InviteCountdown.jsx so new templates (Jasmine Courtyard's brass
// tiles, Journey's split-flap board, Gilded Orchard's bespoke countdown) all
// consume the identical, already-correct day/hour/min/sec math instead of
// re-deriving it.
export function useCountdown(target) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);
  const diff = Math.max(0, target - now);
  return {
    d: Math.floor(diff / 86400000),
    h: Math.floor((diff % 86400000) / 3600000),
    m: Math.floor((diff % 3600000) / 60000),
    s: Math.floor((diff % 60000) / 1000),
    reached: target - now <= 0,
  };
}
