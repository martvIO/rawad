// Framework-free three.js engine for the celestial particle world. No React in
// here — it owns a single requestAnimationFrame loop that reads input *refs*
// each frame (scroll / pointer / tilt) so React never re-renders per event.
//
//   const world = createCelestialWorld(canvas, opts)
//   world.setTheme(uniforms)  world.setScroll(0..1)  world.setPaused(bool)
//   world.resize()            world.dispose()
//
// `three` is imported here, so it only lands in the lazy chunk that pulls this
// module (CelestialCanvas) — never the initial bundle.
import * as THREE from "three";
import { VERT, FRAG } from "./particles.glsl.js";
import { buildEnvelope } from "./envelopeMesh.js";

const easeInOut = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

// Particle count + pixel-ratio cap + base mote size per capability tier.
const TIERS = {
  1: { count: 1700, dpr: 1, size: 1.0 },
  2: { count: 4500, dpr: 1.5, size: 1.15 },
  3: { count: 10500, dpr: 2, size: 1.3 },
};

function buildGeometry(count) {
  const pos = new Float32Array(count * 3);
  const seed = new Float32Array(count);
  const size = new Float32Array(count);
  const speed = new Float32Array(count);
  for (let i = 0; i < count; i++) {
    // A wide, deep slab the camera flies through along -z.
    pos[i * 3] = (Math.random() - 0.5) * 130;
    pos[i * 3 + 1] = (Math.random() - 0.5) * 100;
    pos[i * 3 + 2] = 40 - Math.random() * 170;
    seed[i] = Math.random();
    // A few large "bloom" motes, many fine dust specks.
    size[i] = Math.random() < 0.12 ? 3.4 + Math.random() * 2.6 : 0.8 + Math.random() * 1.6;
    speed[i] = 0.15 + Math.random() * 0.5;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  g.setAttribute("aSeed", new THREE.BufferAttribute(seed, 1));
  g.setAttribute("aSize", new THREE.BufferAttribute(size, 1));
  g.setAttribute("aSpeed", new THREE.BufferAttribute(speed, 1));
  return g;
}

export function createCelestialWorld(canvas, opts = {}) {
  const {
    uniforms: u0,
    tier = 2,
    interactive = true, // public guest page: scroll + parallax; preview: ambient drift only
    onFpsDowngrade,
    envelope = null, // { colors, monogram } → enables the 3D intro envelope
  } = opts;

  const cfg = TIERS[tier] || TIERS[2];
  const startUniforms = u0 || { isLight: false, bg: [0, 0, 0], core: [1, 1, 1], glow: [1, 1, 1] };

  const renderer = new THREE.WebGLRenderer({
    canvas,
    alpha: true, // composite over the existing DOM background + damask
    antialias: false,
    premultipliedAlpha: false,
    powerPreference: tier >= 3 ? "high-performance" : "default",
    failIfMajorPerformanceCaveat: false,
  });
  renderer.setClearColor(0x000000, 0);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, cfg.dpr));
  // During the envelope intro the canvas paints an OPAQUE themed background (and
  // is elevated above the DOM hero by the host) so the sealed envelope covers
  // the page like the old 2D overlay; on hand-off it fades back to transparent
  // so the particles composite over the hero again.
  const bgColor = new THREE.Color().setRGB(...startUniforms.bg);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(62, 1, 0.1, 400);
  camera.position.set(0, 0, 60);

  const material = new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uSizeScale: { value: cfg.size * Math.min(window.devicePixelRatio || 1, cfg.dpr) },
      uCull: { value: 1 },
      uCore: { value: new THREE.Color().setRGB(...startUniforms.core) },
      uGlow: { value: new THREE.Color().setRGB(...startUniforms.glow) },
      uIsLight: { value: startUniforms.isLight ? 1 : 0 },
    },
    vertexShader: VERT,
    fragmentShader: FRAG,
    transparent: true,
    depthWrite: false,
    depthTest: false,
    blending: startUniforms.isLight ? THREE.NormalBlending : THREE.AdditiveBlending,
  });

  const geometry = buildGeometry(cfg.count);
  const points = new THREE.Points(geometry, material);
  scene.add(points);

  // ── live input read by the loop ──────────────────────────────────────────
  // The host passes its input refs so the engine's single rAF reads them
  // directly — no second pump loop. Falls back to internal refs (driven by the
  // setters) when used standalone.
  const input = opts.inputRefs || {
    scrollRef: { current: 0 },
    pointerRef: { current: [0, 0] },
    tiltRef: { current: [0, 0] },
  };
  let cam = { x: 0, y: 0, z: 60 };
  let paused = false;
  let disposed = false;
  let raf = 0;
  let lastNow = performance.now();

  // ── Envelope intro state machine ──────────────────────────────────────────
  // mode: "scroll" (normal scene) | "envelope" (sealed, framed) | "opening"
  // (animating open) | "glide" (camera pulls back into the scene). The scroll
  // ref is IGNORED unless mode === "scroll", so the two camera drivers never
  // fight. The envelope (z=0) is framed from ~14 units away.
  const ENV_FRAME_Z = 14;
  let mode = "scroll";
  let env = null;
  let openT = 0;
  let glideT = 0;
  let revealFired = false;
  let holdUntil = 0;
  let onRevealCb = null;
  let onCompleteCb = null;

  // FPS guard: degrade one step, then fall back to the 2D floor entirely.
  // QA/automation can set window.__DAWA_CEL_NOGUARD to keep the world mounted
  // in offscreen headless windows (which throttle rAF and would false-trip it).
  const noGuard = typeof window !== "undefined" && !!window.__DAWA_CEL_NOGUARD;
  let frames = 0;
  let windowStart = performance.now();
  let lowStreak = 0;
  let degraded = false;
  let preDegradeFps = 0;
  let contextLost = false;

  function resize() {
    const w = canvas.clientWidth || window.innerWidth;
    const h = canvas.clientHeight || window.innerHeight;
    renderer.setSize(w, h, false);
    camera.aspect = w / Math.max(h, 1);
    camera.updateProjectionMatrix();
  }

  function setTheme(u) {
    if (!u) return;
    material.uniforms.uCore.value.setRGB(...u.core);
    material.uniforms.uGlow.value.setRGB(...u.glow);
    material.uniforms.uIsLight.value = u.isLight ? 1 : 0;
    material.blending = u.isLight ? THREE.NormalBlending : THREE.AdditiveBlending;
    material.needsUpdate = true;
    if (u.bg) bgColor.setRGB(...u.bg);
  }

  function checkFps(now) {
    if (noGuard) return;
    frames++;
    const elapsed = now - windowStart;
    if (elapsed < 1100) return;
    const sampled = frames;
    const fps = (frames * 1000) / elapsed;
    frames = 0;
    windowStart = now;
    // Only judge FPS when this tab is the active, FOREGROUND render target.
    // Occluded / blurred / battery-throttled tabs run rAF slowly without the
    // GPU being the bottleneck — counting those would wrongly demote a capable
    // device to the 2D floor for the rest of the session. (sampled < 4 catches
    // the near-frozen case before the active check can settle.)
    const active = typeof document === "undefined"
      || (document.visibilityState === "visible"
          && (typeof document.hasFocus !== "function" || document.hasFocus()));
    if (!active || sampled < 4) {
      lowStreak = 0;
      return;
    }
    if (fps >= 24) {
      lowStreak = 0;
      return;
    }
    // Once we've thinned the field, a meaningful recovery into the low-20s is
    // good enough to keep the world — don't kill a degrade that actually worked.
    if (degraded && (fps >= 20 || fps >= preDegradeFps + 4)) {
      lowStreak = 0;
      return;
    }
    lowStreak++;
    if (lowStreak === 1 && !degraded) {
      // First bad second: thin the field and drop pixel ratio rather than quit.
      degraded = true;
      preDegradeFps = fps;
      material.uniforms.uCull.value = 0.55;
      renderer.setPixelRatio(1);
    } else if (lowStreak >= 3) {
      // Three sustained bad seconds: hand back to the CSS 2D floor.
      stop();
      if (typeof onFpsDowngrade === "function") onFpsDowngrade();
    }
  }

  function advanceOpen(now, dt) {
    openT = Math.min(1, openT + dt * 0.6);
    if (env) env.setOpen(openT);
    if (!revealFired && openT >= 0.62) {
      revealFired = true;
      if (onRevealCb) onRevealCb();
    }
    if (openT >= 1) {
      if (holdUntil === 0) holdUntil = now + 850; // hold on the reveal, then glide
      else if (now >= holdUntil) { mode = "glide"; glideT = 0; }
    }
  }

  function frame(now) {
    if (disposed || contextLost) return;
    raf = requestAnimationFrame(frame);
    if (paused) { lastNow = now; return; }
    const dt = Math.min(0.05, Math.max(0, (now - lastNow) / 1000));
    lastNow = now;

    const t = now * 0.001;
    material.uniforms.uTime.value = t;

    const driftX = Math.sin(t * 0.18) * 2.2;
    const driftY = Math.cos(t * 0.13) * 1.6;
    let px = interactive ? input.pointerRef.current[0] * 7 + input.tiltRef.current[0] * 9 : 0;
    let py = interactive ? input.pointerRef.current[1] * 7 + input.tiltRef.current[1] * 9 : 0;

    let camTargetZ;
    let lookAtZ;
    if (mode === "scroll") {
      // Normal scene: scroll flies forward; ambient drift + parallax keep it alive.
      camTargetZ = interactive ? 60 - input.scrollRef.current * 72 : 56 + Math.sin(t * 0.1) * 4;
      lookAtZ = null; // → cam.z - 45
    } else {
      // Envelope framing (scroll ignored). Gentler parallax while framed.
      px *= 0.4;
      py *= 0.4;
      if (mode === "opening") advanceOpen(now, dt);
      if (mode === "glide") {
        glideT = Math.min(1, glideT + dt * 0.55);
        if (glideT >= 1) finishGlide();
      }
      const g = easeInOut(glideT); // 0 while framing/opening, ramps during glide
      camTargetZ = ENV_FRAME_Z + (60 - ENV_FRAME_Z) * g;
      lookAtZ = 0 * (1 - g) + (camTargetZ - 45) * g;
    }

    const ease = mode === "scroll" ? 0.06 : 0.08;
    cam.x += (driftX + px - cam.x) * 0.045;
    cam.y += (driftY + py - cam.y) * 0.045;
    cam.z += (camTargetZ - cam.z) * ease;
    camera.position.set(cam.x, cam.y, cam.z);
    camera.lookAt(cam.x * 0.25, cam.y * 0.25, lookAtZ === null ? cam.z - 45 : lookAtZ);

    // Opaque themed background while framing/opening the envelope; fade to
    // transparent across the glide so the DOM hero shows through; fully
    // transparent in the normal scene.
    let clearA = 0;
    if (mode === "envelope" || mode === "opening") clearA = 1;
    else if (mode === "glide") clearA = 1 - easeInOut(glideT);
    renderer.setClearColor(bgColor, clearA);

    renderer.render(scene, camera);
    checkFps(now);
  }

  function stop() {
    if (raf) cancelAnimationFrame(raf);
    raf = 0;
  }

  function finishGlide() {
    mode = "scroll";
    if (env) {
      scene.remove(env.group);
      env.dispose();
      env = null;
    }
    if (onCompleteCb) {
      const cb = onCompleteCb;
      onCompleteCb = null;
      cb();
    }
  }

  function enterEnvelope() {
    if (!envelope || env || disposed) return;
    env = buildEnvelope({ colors: envelope.colors, monogram: envelope.monogram });
    env.group.position.set(0, 0, 0);
    scene.add(env.group);
    mode = "envelope";
    openT = 0;
    revealFired = false;
    holdUntil = 0;
    cam = { x: 0, y: 0, z: ENV_FRAME_Z }; // snap to the framing pose (no flash)
  }

  function openEnvelope(cbs) {
    if (mode !== "envelope") return;
    onRevealCb = cbs && cbs.onReveal;
    onCompleteCb = cbs && cbs.onComplete;
    openT = 0;
    revealFired = false;
    holdUntil = 0;
    mode = "opening";
  }

  // INVOLUNTARY context loss (GPU reset, OS power event, or the browser evicting
  // the least-recently-used WebGL context once the ~16-context limit is hit by
  // other tabs). three silently turns render() into a no-op, so the FPS guard
  // would never notice — we must hand back to the 2D floor ourselves.
  function onContextLost(e) {
    e.preventDefault();
    contextLost = true;
    stop();
    if (typeof onFpsDowngrade === "function") onFpsDowngrade();
  }
  canvas.addEventListener("webglcontextlost", onContextLost, false);

  function dispose() {
    if (disposed) return;
    disposed = true;
    // Remove our listener FIRST so the force-lose below doesn't re-enter it.
    canvas.removeEventListener("webglcontextlost", onContextLost, false);
    stop();
    if (env) { scene.remove(env.group); env.dispose(); env = null; }
    geometry.dispose();
    material.dispose();
    renderer.dispose();
    if (!contextLost) {
      const lose = renderer.getContext()?.getExtension?.("WEBGL_lose_context");
      if (lose) lose.loseContext();
    }
  }

  resize();
  if (envelope) enterEnvelope(); // start framed on the sealed envelope (no scene flash)
  raf = requestAnimationFrame(frame);

  return {
    setTheme,
    setScroll: (v) => { input.scrollRef.current = Math.max(0, Math.min(1, v)); },
    setPointer: (x, y) => { input.pointerRef.current = [x, y]; },
    setTilt: (x, y) => { input.tiltRef.current = [x, y]; },
    setPaused: (v) => { paused = !!v; if (!v) { windowStart = performance.now(); frames = 0; lastNow = performance.now(); } },
    enterEnvelope,
    openEnvelope,
    resize,
    dispose,
  };
}
