import { lazy, Suspense, useState, useEffect, useRef } from "react";
import { Ambience } from "./InviteAmbience.jsx";
import { EnvelopeIntro } from "./EnvelopeIntro.jsx";
import { CelestialEnvelopeOverlay } from "./CelestialEnvelopeOverlay.jsx";
import { useDeviceCapability } from "../../../hooks/useDeviceCapability.js";
import { celDowngraded, markCelDowngraded } from "../celestial/downgradeStore.js";
import { themeToEnvelopePalette } from "../../../utils/themeToEnvelopePalette.js";

// Single owner of the invitation's backdrop AND intro envelope. It decides,
// per device capability and the groom's flags:
//   • WebGL celestial world vs the 2D CSS ambience floor (the guaranteed fallback)
//   • 3D WebGL envelope vs the 2D wax-seal envelope
// The 2D floor is BOTH the fallback and the Suspense placeholder, so the page is
// never blank while the (lazy) three.js chunk loads.
const CelestialCanvas = lazy(() => import("../celestial/CelestialCanvas.jsx"));

const OPENED_KEY = "dawa-invite-opened";
function readOpened() {
  try { return localStorage.getItem(OPENED_KEY) === "1"; } catch { return false; }
}
function markOpened() {
  try { localStorage.setItem(OPENED_KEY, "1"); } catch { /* ignore */ }
}

export function CelestialAmbience({
  theme, font, lang, mode = "public", fixed = true, immersive3d = true,
  showEnvelope = false, guestName = "", groomName = "", brideName = "", monogram = "",
  blessing = "", welcome = "", namesAr = "", namesHe = "", eyebrow = "", dateText = "",
}) {
  const cap = useDeviceCapability();
  const [downgraded, setDowngraded] = useState(celDowngraded);
  const [opened, setOpened] = useState(readOpened);
  // Envelope reveal phases: sealed → opening → revealing → done → gone.
  const [phase, setPhase] = useState("sealed");
  const worldRef = useRef(null);

  // Honor a mid-session "reduce motion" toggle by tearing the world down live.
  const [reduceMotion, setReduceMotion] = useState(false);
  useEffect(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") return undefined;
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const onChange = () => setReduceMotion(mq.matches);
    onChange();
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  const wantWebGL = immersive3d && cap.tier >= 1 && !downgraded && !reduceMotion;
  // The PREMIUM 3D envelope reveal is heavy (PBR + AA + bursts) — gate it to
  // capable devices (tier ≥ 2). Tier-1 keeps the particle backdrop but gets the
  // lighter 2D envelope; no-WebGL / reduced-motion get the 2D floor + 2D envelope.
  const doEnvelope = !!showEnvelope && !opened && wantWebGL && cap.tier >= 2;

  // Latch "this mount is running the 3D envelope" at first render. `opened` flips
  // true on hand-off (for future visits), so we must NOT key the overlay/elevated
  // off `doEnvelope` — that would yank the overlay before its done→gone fade.
  const envActiveRef = useRef(undefined);
  if (envActiveRef.current === undefined) envActiveRef.current = doEnvelope;
  const envActive = envActiveRef.current && phase !== "gone";

  // Lock page scroll while the 3D envelope is on screen, so the scroll-driven
  // camera (resumed after hand-off) can't be desynced mid-sequence. Also gate on
  // `wantWebGL`: if it flips false mid-reveal (mid-session reduced-motion toggle,
  // or a GPU context-loss → downgrade), the WebGL path unmounts and `phase`
  // freezes — so we must release the lock here rather than wait for a "gone" that
  // can never arrive, or the page would stay permanently unscrollable.
  useEffect(() => {
    if (!envActive || !wantWebGL) return undefined;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = prev; };
  }, [envActive, wantWebGL]);

  // After the hand-off completes, fade the overlay out then unmount it.
  useEffect(() => {
    if (phase !== "done") return undefined;
    const id = setTimeout(() => setPhase("gone"), 650);
    return () => clearTimeout(id);
  }, [phase]);

  const onFpsDowngrade = () => {
    markCelDowngraded();
    setDowngraded(true);
  };

  const onOpen = () => {
    const w = worldRef.current;
    if (!w || phase !== "sealed") return;
    setPhase("opening");
    w.openEnvelope({
      onReveal: () => setPhase("revealing"),
      onComplete: () => { markOpened(); setOpened(true); setPhase("done"); },
    });
  };

  if (wantWebGL) {
    const envelopePayload = envActiveRef.current
      ? {
          colors: themeToEnvelopePalette(theme),
          monogram,
          content: { namesAr, namesHe, blessing, welcome, eyebrow, date: dateText },
        }
      : null;
    return (
      <>
        <Suspense fallback={<Ambience theme={theme} fixed={fixed} />}>
          <CelestialCanvas
            theme={theme}
            mode={mode}
            fixed={fixed}
            tier={cap.tier}
            onFpsDowngrade={onFpsDowngrade}
            envelope={envelopePayload}
            onReady={(w) => { worldRef.current = w; }}
            elevated={envActive}
          />
        </Suspense>
        {envActive && (
          <CelestialEnvelopeOverlay
            phase={phase}
            guestName={guestName}
            groomName={groomName}
            brideName={brideName}
            theme={theme}
            font={font}
            lang={lang}
            onOpen={onOpen}
          />
        )}
        {/* Tier-1 capable of the particle world but NOT the premium reveal → the
            lighter 2D wax-seal envelope rides over the particle backdrop. */}
        {showEnvelope && !opened && !envActiveRef.current && (
          <EnvelopeIntro
            guestName={guestName}
            groomName={groomName}
            brideName={brideName}
            monogram={monogram}
            blessing={blessing}
            welcome={welcome}
            theme={theme}
            font={font}
            lang={lang}
          />
        )}
      </>
    );
  }

  // No WebGL → the 2D floor, plus the 2D wax-seal envelope (now reveals the
  // couple names) for reduced-motion / weak / immersive3d-off devices.
  return (
    <>
      {showEnvelope && !opened && (
        <EnvelopeIntro
          guestName={guestName}
          groomName={groomName}
          brideName={brideName}
          monogram={monogram}
          blessing={blessing}
          welcome={welcome}
          theme={theme}
          font={font}
          lang={lang}
        />
      )}
      <Ambience theme={theme} fixed={fixed} />
    </>
  );
}
