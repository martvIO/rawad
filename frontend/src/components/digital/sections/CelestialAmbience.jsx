import { lazy, Suspense, useState, useEffect, useRef } from "react";
import { Ambience } from "./InviteAmbience.jsx";
import { CelestialEnvelopeOverlay } from "./CelestialEnvelopeOverlay.jsx";
import { useDeviceCapability } from "../../../hooks/useDeviceCapability.js";
import { celDowngraded, markCelDowngraded } from "../celestial/downgradeStore.js";
import { resolveEnvelopePalette } from "../../../utils/themeToEnvelopePalette.js";
import { resolveBackground } from "../../../utils/themeToBackground.js";

// Single owner of the invitation's backdrop AND intro envelope. It decides,
// per device capability and the groom's flags:
//   • WebGL celestial world vs the 2D CSS ambience floor (the guaranteed fallback)
//   • 3D WebGL envelope vs (since the 2D wax-seal was removed) no envelope
// The 2D floor is BOTH the fallback and the Suspense placeholder, so the page is
// never blank while the (lazy) three.js chunk loads.
//
// When the groom enables a CUSTOM BACKGROUND (`background.enabled`), the 3D world
// is replaced for ALL guests by the 2D custom backdrop (fill/circles/image). The
// envelope intro still plays on capable devices, then its WebGL canvas fades out
// to reveal the custom background underneath.
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
  showEnvelope = false, demo = false, guestName = "", monogram = "",
  namesAr = "", namesHe = "", eyebrow = "", blessing = "", welcome = "", dateText = "",
  envelopeOverrides = null, background = null,
}) {
  const cap = useDeviceCapability();
  const [downgraded, setDowngraded] = useState(celDowngraded);
  // The demo is a showcase: always replay the envelope, and never write the
  // global "opened" flag (so visiting the demo can't suppress a real invite).
  const [opened, setOpened] = useState(() => (demo ? false : readOpened()));
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

  // Custom background: replaces the persistent 3D world (not the envelope intro).
  const resolvedBg = background ? resolveBackground(theme, background) : null;
  const customBg = !!resolvedBg?.enabled;

  const canWebGL = cap.tier >= 1 && !downgraded && !reduceMotion;
  // The persistent 3D world only when NOT in custom-background mode.
  const wantWorld = !customBg && immersive3d && canWebGL;
  // Envelope intro: tied to the world in normal mode; in custom mode it just
  // needs a WebGL-capable device (the world is gone, but the reveal still plays).
  const doEnvelope = !!showEnvelope && !opened && (customBg ? canWebGL : wantWorld);

  // Latch "this mount is running the 3D envelope" at first render. `opened` flips
  // true on hand-off (for future visits), so we must NOT key the overlay/elevated
  // off `doEnvelope` — that would yank the overlay before its done→gone fade.
  const envActiveRef = useRef(undefined);
  if (envActiveRef.current === undefined) envActiveRef.current = doEnvelope;
  const envActive = envActiveRef.current && phase !== "gone";

  // Lock page scroll while the 3D envelope is on screen, so the scroll-driven
  // camera (resumed after hand-off) can't be desynced mid-sequence.
  useEffect(() => {
    if (!envActive) return undefined;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = prev; };
  }, [envActive]);

  // After the hand-off completes, fade the overlay/canvas out then unmount.
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
      onComplete: () => { if (!demo) markOpened(); setOpened(true); setPhase("done"); },
    });
  };

  const envelopeProp = {
    colors: resolveEnvelopePalette(theme, envelopeOverrides),
    monogram,
    content: { namesAr, namesHe, blessing, welcome, eyebrow, date: dateText },
  };

  // ── Custom background mode ───────────────────────────────────────────────────
  // The 2D custom backdrop is the base layer (behind content). If the envelope
  // intro runs, its WebGL canvas sits on top (z 999) and fades out on hand-off,
  // revealing the custom backdrop. No persistent 3D world.
  if (customBg) {
    return (
      <>
        <Ambience theme={theme} fixed={fixed} background={resolvedBg} />
        {envActive && (
          <>
            <div
              style={{
                position: fixed ? "fixed" : "absolute",
                inset: 0,
                zIndex: 999,
                pointerEvents: "none",
                opacity: phase === "done" ? 0 : 1,
                transition: "opacity .6s ease",
              }}
            >
              <Suspense fallback={null}>
                <CelestialCanvas
                  theme={theme}
                  mode={mode}
                  fixed={false}
                  tier={cap.tier}
                  onFpsDowngrade={onFpsDowngrade}
                  envelope={envActiveRef.current ? envelopeProp : null}
                  onReady={(w) => { worldRef.current = w; }}
                  elevated={false}
                />
              </Suspense>
            </div>
            <CelestialEnvelopeOverlay
              phase={phase}
              guestName={guestName}
              theme={theme}
              font={font}
              lang={lang}
              onOpen={onOpen}
            />
          </>
        )}
      </>
    );
  }

  // ── Normal mode: persistent 3D world (capable) or the 2D theme floor ─────────
  if (wantWorld) {
    return (
      <>
        <Suspense fallback={<Ambience theme={theme} fixed={fixed} />}>
          <CelestialCanvas
            theme={theme}
            mode={mode}
            fixed={fixed}
            tier={cap.tier}
            onFpsDowngrade={onFpsDowngrade}
            envelope={envActiveRef.current ? envelopeProp : null}
            onReady={(w) => { worldRef.current = w; }}
            elevated={envActive}
          />
        </Suspense>
        {envActive && (
          <CelestialEnvelopeOverlay
            phase={phase}
            guestName={guestName}
            theme={theme}
            font={font}
            lang={lang}
            onOpen={onOpen}
          />
        )}
      </>
    );
  }

  // No WebGL (reduced-motion / data-saver / no WebGL / immersive3d off) → just
  // the 2D CSS ambience floor behind the content. The envelope intro is now
  // WebGL-only: incapable devices land straight on the invitation, no envelope.
  return <Ambience theme={theme} fixed={fixed} />;
}
