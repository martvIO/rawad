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

// The premium envelope reveal is framed with a telephoto fov for an intimate,
// cinematic look; the scene resumes the wide fov as the camera glides back into
// the starfield. The reveal maps t∈[0,1] onto OPEN_DURATION "seconds".
const SCENE_FOV = 62;
const ENV_FOV = 34;
const OPEN_DURATION = 4.8;

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
    demoScroll = false, // editor preview: auto-ramp the scroll to demo entrance speed
  } = opts;

  // Mutable so rebuildEnvelope() can swap in a fresh design (e.g. the demo page
  // loads the admin-published design AFTER the sealed envelope was first built).
  let liveEnvelope = envelope;

  const cfg = TIERS[tier] || TIERS[2];
  const startUniforms = u0 || { isLight: false, bg: [0, 0, 0], core: [1, 1, 1], glow: [1, 1, 1] };

  const renderer = new THREE.WebGLRenderer({
    canvas,
    alpha: true, // composite over the existing DOM background + damask
    // AA only when the premium PBR envelope will play (crisp foil edges + card);
    // off on the common particle-only path to save fill-rate.
    antialias: !!envelope,
    premultipliedAlpha: false,
    powerPreference: tier >= 3 ? "high-performance" : "default",
    failIfMajorPerformanceCaveat: false,
  });
  renderer.setClearColor(0x000000, 0);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, cfg.dpr));
  if ("outputColorSpace" in renderer && THREE.SRGBColorSpace) renderer.outputColorSpace = THREE.SRGBColorSpace;
  // ACES filmic tone-mapping ONLY while a premium envelope is present — it gives
  // the wax/foil speculars their highlight rolloff. The particle ShaderMaterial
  // is toneMapped:false (set below) so it is unaffected either way; non-envelope
  // pages stay byte-identical (NoToneMapping). Set once at construction — never
  // toggled at runtime (that would force a material recompile hitch).
  if (envelope && THREE.ACESFilmicToneMapping !== undefined) {
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.0;
  }
  // During the envelope intro the canvas paints an OPAQUE themed background (and
  // is elevated above the DOM hero by the host) so the sealed envelope covers
  // the page like the old 2D overlay; on hand-off it fades back to transparent
  // so the particles composite over the hero again.
  const bgColor = new THREE.Color().setRGB(...startUniforms.bg);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(SCENE_FOV, 1, 0.1, 400);
  camera.position.set(0, 0, 60);

  const material = new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uSizeScale: { value: cfg.size * Math.min(window.devicePixelRatio || 1, cfg.dpr) },
      uCull: { value: 1 },
      uCore: { value: new THREE.Color().setRGB(...startUniforms.core) },
      uGlow: { value: new THREE.Color().setRGB(...startUniforms.glow) },
      uIsLight: { value: startUniforms.isLight ? 1 : 0 },
      // Per-design starfield overrides (default 1 = theme baseline): background
      // star SIZE multiplier and CLARITY/opacity multiplier. Colour rides uCore/uGlow.
      uStarSize: { value: typeof startUniforms.starSize === "number" ? startUniforms.starSize : 1 },
      uStarOpacity: { value: typeof startUniforms.starOpacity === "number" ? startUniforms.starOpacity : 1 },
    },
    vertexShader: VERT,
    fragmentShader: FRAG,
    transparent: true,
    depthWrite: false,
    depthTest: false,
    blending: startUniforms.isLight ? THREE.NormalBlending : THREE.AdditiveBlending,
    // The FRAG writes gl_FragColor directly (no tonemapping chunk), so ACES never
    // touches the motes — pin it so a future chunk-based refactor can't change that.
    toneMapped: false,
  });

  const geometry = buildGeometry(cfg.count);
  const points = new THREE.Points(geometry, material);
  // Always paint the particle field first; the depth-tested envelope draws over it.
  points.renderOrder = -10;
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
  // Per-design scroll-entrance speed multiplier (1 = baseline). Mutated live by
  // setTheme so dragging the editor's speed slider re-scales the fly-in at once.
  let camScrollSpeed = typeof startUniforms.starSpeed === "number" ? startUniforms.starSpeed : 1;
  let demoT = 0; // auto-ramp clock for the editor "entrance speed" preview
  let paused = false;
  let disposed = false;
  let raf = 0;
  let lastNow = performance.now();

  // ── Envelope intro state machine ──────────────────────────────────────────
  // mode: "scroll" (normal scene) | "envelope" (sealed, framed) | "opening"
  // (animating open) | "glide" (camera pulls back into the scene). The scroll
  // ref is IGNORED unless mode === "scroll", so the two camera drivers never
  // fight. While framing/opening, the camera pose comes from the envelope itself
  // (env.framePose / env.setOpen return {y,z,lookAtY}); the engine just applies
  // it (and a telephoto fov). On glide it blends back to the wide scene pose.
  let mode = "scroll";
  let env = null;
  let openT = 0;
  let glideT = 0;
  let revealFired = false;
  let holdUntil = 0;
  let onRevealCb = null;
  let onCompleteCb = null;
  let lastLookY = 0;
  let glideFrom = { z: 60, y: 0, lookY: 0, fov: ENV_FOV };

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
    if (typeof u.starSize === "number") material.uniforms.uStarSize.value = u.starSize;
    if (typeof u.starOpacity === "number") material.uniforms.uStarOpacity.value = u.starOpacity;
    if (typeof u.starSpeed === "number") camScrollSpeed = u.starSpeed;
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
    // Never degrade/fall back during the envelope reveal — the heavy PBR + bursts
    // are expected, and the tier≥2 gate upstream already protects weak devices.
    // (A genuine GPU context-loss still bails via onContextLost, independently.)
    if (mode !== "scroll") { lowStreak = 0; return; }
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

  // openT is advanced in frame() (it needs dt + drives the pose). This only
  // handles the reveal-fire (fade the sealed DOM hint) and the hold → glide
  // hand-off, capturing the camera pose to blend FROM as the glide starts.
  function advanceOpen(now) {
    const revealAt = env && env.REVEAL_AT != null ? env.REVEAL_AT : 0.18;
    if (!revealFired && openT >= revealAt) {
      revealFired = true;
      if (onRevealCb) onRevealCb();
    }
    if (openT >= 1) {
      if (holdUntil === 0) holdUntil = now + 320; // brief hold on the light, then glide
      else if (now >= holdUntil) {
        glideFrom = { z: cam.z, y: cam.y, lookY: lastLookY, fov: ENV_FOV };
        mode = "glide";
        glideT = 0;
      }
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
    const px = interactive ? input.pointerRef.current[0] * 7 + input.tiltRef.current[0] * 9 : 0;
    const py = interactive ? input.pointerRef.current[1] * 7 + input.tiltRef.current[1] * 9 : 0;
    const asp = camera.aspect || 1;

    // Per-mode camera target: position (tx,ty,tz), lookAt (lx,ly,lz), fov, clearA.
    let tx, ty, tz, lx, ly, lz, fov, clearA, posEase;

    if (mode === "scroll") {
      // Scroll flies the camera forward through the star slab so the field streams
      // in as the guest scrolls down — scaled live by the per-design entrance SPEED
      // (camScrollSpeed, 1 = baseline). The target z is FLOORED so a fast speed
      // can't overshoot the slab (z 40 → -130) and empty the field; at speed 1 the
      // floor is never reached, so the baseline look is byte-for-byte unchanged.
      // The editor preview has no page scroll, so `demoScroll` auto-ramps a 0→1→0
      // sweep to DEMONSTRATE the chosen speed to the groom.
      let s = input.scrollRef.current;
      if (demoScroll) {
        demoT += dt;
        const CYCLE = 3.4; // seconds per in-and-out sweep
        const phase = (demoT % CYCLE) / CYCLE;
        s = phase < 0.5 ? phase * 2 : (1 - phase) * 2; // triangle 0→1→0
      }
      tz = (interactive || demoScroll)
        ? Math.max(-60, 60 - s * 108 * camScrollSpeed)
        : 56 + Math.sin(t * 0.1) * 4;
      tx = driftX + px; ty = driftY + py;
      lx = cam.x * 0.25; ly = cam.y * 0.25; lz = cam.z - 45;
      fov = SCENE_FOV; clearA = 0; posEase = 0.06;
    } else {
      // Envelope framing (scroll ignored). Gentle parallax while framed.
      const gpx = px * 0.25, gpy = py * 0.25;
      if (mode === "glide") {
        glideT = Math.min(1, glideT + dt * 0.5);
        const g = easeInOut(glideT);
        tz = glideFrom.z + (60 - glideFrom.z) * g;
        tx = driftX * g + gpx;
        ty = glideFrom.y * (1 - g) + (driftY + gpy) * g;
        lx = cam.x * 0.25 * g;
        ly = glideFrom.lookY * (1 - g) + cam.y * 0.25 * g;
        lz = (cam.z - 45) * g;
        fov = glideFrom.fov + (SCENE_FOV - glideFrom.fov) * g;
        clearA = 1 - g; posEase = 0.1;
        if (glideT >= 1) finishGlide();
      } else {
        // "envelope" (sealed) or "opening" — the pose comes from the envelope.
        if (mode === "opening") openT = Math.min(1, openT + dt / OPEN_DURATION);
        const pose = mode === "opening"
          ? env.setOpen(openT, ENV_FOV, asp)
          : env.framePose(ENV_FOV, asp);
        tz = pose.z; tx = gpx; ty = pose.y + gpy;
        lx = cam.x * 0.1; ly = pose.lookAtY; lz = 0;
        fov = ENV_FOV; clearA = 1; posEase = mode === "opening" ? 0.2 : 0.12;
        if (mode === "opening") advanceOpen(now);
      }
      lastLookY = ly;
    }

    const exy = mode === "scroll" ? 0.045 : posEase;
    cam.x += (tx - cam.x) * exy;
    cam.y += (ty - cam.y) * exy;
    cam.z += (tz - cam.z) * posEase;
    camera.position.set(cam.x, cam.y, cam.z);
    camera.lookAt(lx, ly, lz);
    if (Math.abs(camera.fov - fov) > 0.01) { camera.fov = fov; camera.updateProjectionMatrix(); }

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
    camera.fov = SCENE_FOV;
    camera.updateProjectionMatrix();
    if (env) {
      scene.remove(env.group);
      env.dispose();
      env = null;
    }
    // Re-prime the FPS window so the heavy reveal isn't blamed on the steady scene.
    windowStart = performance.now();
    frames = 0;
    lowStreak = 0;
    if (onCompleteCb) {
      const cb = onCompleteCb;
      onCompleteCb = null;
      cb();
    }
  }

  function enterEnvelope() {
    if (!liveEnvelope || env || disposed) return;
    env = buildEnvelope({
      colors: liveEnvelope.colors,
      monogram: liveEnvelope.monogram,
      content: liveEnvelope.content,
    });
    env.group.position.set(0, 0, 0);
    scene.add(env.group);
    mode = "envelope";
    openT = 0;
    revealFired = false;
    holdUntil = 0;
    // Snap the camera + telephoto fov to the sealed framing pose (no flash).
    camera.fov = ENV_FOV;
    camera.updateProjectionMatrix();
    const pose = env.framePose(ENV_FOV, camera.aspect || 1);
    cam = { x: 0, y: pose.y, z: pose.z };
    lastLookY = pose.lookAtY;
    // Re-bake the card calligraphy once the wedding fonts finish loading (canvas
    // text silently falls back to a default face until then).
    if (env.refreshCard && typeof document !== "undefined" && document.fonts && document.fonts.ready) {
      document.fonts.ready.then(() => { if (env && env.refreshCard) env.refreshCard(); }).catch(() => {});
    }
  }

  // Swap the sealed envelope's design (names / colours / stars) after mount.
  // Only while still SEALED (mode === "envelope") — never mid-open, so a late
  // design load (e.g. the demo's admin-published design) can't disrupt a reveal.
  function rebuildEnvelope(next) {
    if (disposed || !next || mode !== "envelope") return;
    liveEnvelope = next;
    if (env) { scene.remove(env.group); env.dispose(); env = null; }
    enterEnvelope();
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
    rebuildEnvelope,
    openEnvelope,
    resize,
    dispose,
  };
}
