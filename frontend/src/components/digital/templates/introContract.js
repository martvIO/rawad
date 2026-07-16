import { useCallback, useEffect, useRef, useState } from "react";

// The shared "sealed-tap" opening contract for BESPOKE templates.
//
// Every bespoke template replaces the classic 3D envelope with its own opening
// animation, but the *behaviour* around that animation must be identical across
// templates — otherwise each one re-implements (and subtly breaks) the reveal
// gating, the reduced-motion floor, and the return-visit fast path. This hook
// owns that behaviour; a template's <Intro> only supplies the visuals.
//
// Phase machine:
//   "sealed"  → page is at rest: guest name + a tap cue, NOTHING animating.
//   "opening" → the guest tapped; the template plays its opening animation.
//   "done"    → the invitation is revealed; content cascade unlocked.
//
// Design decisions encoded here (grilled 2026-07-14/15, synthesis-refined):
//   • NO auto-open — the invitation opens only on an explicit tap (the ritual).
//     A LONG failsafe still force-reveals content if the intro errors, so a
//     broken tap handler can never trap a guest on a dead sealed screen; that
//     failsafe hard-cuts to content (no animation) and is distinct from an
//     auto-open (which would play the animation unprompted).
//   • Escalating cue — after CUE_ESCALATE_MS idle on the sealed screen,
//     `cueEscalated` flips true so the template can strengthen its tap hint
//     (the P2 "older WhatsApp guest" floor risk: they may not know to tap).
//   • Skip — `skip()` jumps straight to revealed (a discreet "تخطّي" control
//     during the opening animation).
//   • Return-visit fast path — once a token has completed its open, later
//     visits (re-checking the date) reveal instantly; `seenBefore` lets the
//     template offer a "replay" affordance instead of re-gating the content.
//   • Reduced motion — `open()` still reveals, but with no animation window.
//
// `active` gates the whole thing: pass `active={showEnvelope}` from the view.
// In the editor/admin preview `showEnvelope` is unset → active=false → the
// template renders fully revealed with no intro (the preview never seals).

const CUE_ESCALATE_MS = 8000;
const DEFAULT_OPEN_ANIM_MS = 2200;
const FAILSAFE_MS = 20000;
const SEEN_KEY_PREFIX = "dawa-intro-seen:";

function readSeen(token) {
  if (!token) return false;
  try {
    return globalThis.localStorage?.getItem(SEEN_KEY_PREFIX + token) === "1";
  } catch {
    return false;
  }
}

function markSeen(token) {
  if (!token) return;
  try {
    globalThis.localStorage?.setItem(SEEN_KEY_PREFIX + token, "1");
  } catch {
    /* private-mode / unavailable — the fast path just won't trigger next time */
  }
}

function prefersReducedMotion() {
  try {
    return globalThis.matchMedia?.("(prefers-reduced-motion: reduce)").matches === true;
  } catch {
    return false;
  }
}

// `onEvent(event, opts)` is an OPTIONAL instrumentation callback (see
// utils/inviteMetrics.js). It is wired here, in the shared contract, rather than
// in each template — so every bespoke template (present and future) reports the
// same "sealed / opening / how did it open" signals for free, and no template
// can silently forget to. Events:
//   ("sealed")                     the sealed screen is on screen
//   ("open", {kind:"tap"})         a real guest tap
//   ("open", {kind:"skip"})        the guest used the skip control
//   ("open", {kind:"failsafe"})    the stuck-screen rescue fired
//   ("open", {kind:"seen"})        return visit — revealed instantly, no tap
// Every call is wrapped so a throwing callback can never break the ritual.
export function useIntroPhase({ active = false, token = "", openMs = DEFAULT_OPEN_ANIM_MS, onEvent = null } = {}) {
  // Keep the latest callback in a ref so callers can pass an inline function
  // without re-creating open()/skip() (which would churn the template's handlers).
  const onEventRef = useRef(onEvent);
  onEventRef.current = onEvent;
  const emit = useCallback((event, opts) => {
    try {
      // Always hand the listener an options object, so a consumer can read
      // opts.kind without guarding for undefined.
      onEventRef.current?.(event, opts || {});
    } catch {
      /* instrumentation must never break the intro */
    }
  }, []);
  // An invitation opens exactly once per mount, so the open signal is latched:
  // this keeps the phase machine's functional-updater race guard intact while
  // making the emit idempotent (React may double-invoke an updater in
  // StrictMode, and a double-counted "tap" would corrupt the tap-delay stats).
  const openEmitted = useRef(false);
  const emitOpenOnce = useCallback((kind) => {
    if (openEmitted.current) return;
    openEmitted.current = true;
    emit("open", { kind });
  }, [emit]);
  // Resolve the starting phase ONCE (lazy init): inactive previews and
  // already-seen tokens skip straight to revealed; a fresh active visit seals.
  const [phase, setPhase] = useState(() => {
    if (!active) return "done";
    return readSeen(token) ? "done" : "sealed";
  });
  const [cueEscalated, setCueEscalated] = useState(false);
  const seenBeforeRef = useRef(active ? readSeen(token) : false);
  const openTimer = useRef(null);

  const revealed = phase === "done";

  // Report the initial state ONCE per mount: either the sealed screen is up, or
  // this is a return visit that revealed instantly (no tap will ever come).
  const startReported = useRef(false);
  useEffect(() => {
    if (startReported.current || !active) return;
    startReported.current = true;
    if (phase === "sealed") emit("sealed");
    else emitOpenOnce("seen");
    // Intentionally mount-only: `phase` is read for the INITIAL state.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, emit, emitOpenOnce]);

  // Escalate the tap cue after an idle beat on the sealed screen.
  useEffect(() => {
    if (phase !== "sealed") return undefined;
    setCueEscalated(false);
    const id = setTimeout(() => setCueEscalated(true), CUE_ESCALATE_MS);
    return () => clearTimeout(id);
  }, [phase]);

  // Failsafe: content can never stay hidden. Distinct from auto-open — this
  // hard-cuts to "done" (no opening animation) only as a stuck-screen rescue.
  useEffect(() => {
    if (!active || phase === "done") return undefined;
    const id = setTimeout(() => {
      emitOpenOnce("failsafe");
      setPhase("done");
    }, FAILSAFE_MS);
    return () => clearTimeout(id);
  }, [active, phase, emitOpenOnce]);

  useEffect(() => () => clearTimeout(openTimer.current), []);

  const open = useCallback(() => {
    setPhase((p) => {
      if (p !== "sealed") return p;
      // Only on a real sealed→open transition (latched, so a double-tap or a
      // StrictMode updater replay can't inflate the tap count).
      emitOpenOnce("tap");
      markSeen(token);
      if (prefersReducedMotion()) return "done";
      clearTimeout(openTimer.current);
      openTimer.current = setTimeout(() => setPhase("done"), Math.max(0, openMs));
      return "opening";
    });
  }, [token, openMs, emitOpenOnce]);

  const skip = useCallback(() => {
    clearTimeout(openTimer.current);
    emitOpenOnce("skip");
    markSeen(token);
    setPhase("done");
  }, [token, emitOpenOnce]);

  const replay = useCallback(() => {
    clearTimeout(openTimer.current);
    setCueEscalated(false);
    setPhase("sealed");
  }, []);

  return {
    phase,
    revealed,
    sealed: phase === "sealed",
    opening: phase === "opening",
    cueEscalated,
    seenBefore: seenBeforeRef.current,
    open,
    skip,
    replay,
  };
}
