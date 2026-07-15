// three.js parallax sky for Destination Love — layered soft clouds drifting at
// depth, a field of slow light motes, and pointer/tilt parallax. This is the
// lazy chunk (three lands only here + the celestial engine, and Vite dedupes it
// into one shared vendor chunk). No React-in-three: the engine is a plain
// lifecycle driven from a single effect, mirroring celestialEngine.js.
//
// A runtime FPS guard calls onDowngrade() (→ markCelDowngraded + swap to the 2D
// floor) if the device can't sustain it — the real safety net for anything the
// capability heuristics get wrong.
import { useEffect, useRef } from "react";
import * as THREE from "three";

// Soft radial sprite texture (white core → transparent), tinted per-instance.
function softTexture() {
  const c = document.createElement("canvas");
  c.width = c.height = 128;
  const g = c.getContext("2d");
  const grd = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  grd.addColorStop(0, "rgba(255,255,255,1)");
  grd.addColorStop(0.4, "rgba(255,255,255,.55)");
  grd.addColorStop(1, "rgba(255,255,255,0)");
  g.fillStyle = grd;
  g.beginPath();
  g.arc(64, 64, 64, 0, Math.PI * 2);
  g.fill();
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

const MOTES_BY_TIER = { 1: 260, 2: 520, 3: 900 };
const CLOUDS_BY_TIER = { 1: 5, 2: 8, 3: 12 };

export default function Scene3D({ t, tier = 2, fixed = true, onDowngrade }) {
  const hostRef = useRef(null);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return undefined;

    // Create the <canvas> imperatively per mount (NOT via JSX): disposing a
    // WebGLRenderer poisons its canvas, so a reused canvas can't get a fresh
    // context (React StrictMode's mount→unmount→remount, and any real remount,
    // otherwise fail with "canvas has an existing context"). Same pattern as
    // celestial/CelestialCanvas.jsx.
    const canvas = document.createElement("canvas");
    canvas.setAttribute("aria-hidden", "true");
    Object.assign(canvas.style, { position: fixed ? "fixed" : "absolute", inset: "0", width: "100%", height: "100%", display: "block", pointerEvents: "none" });
    host.appendChild(canvas);

    let renderer;
    try {
      renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: tier >= 3, powerPreference: "high-performance" });
    } catch {
      canvas.remove();
      onDowngrade?.();
      return undefined;
    }
    let W = host.clientWidth || window.innerWidth;
    let H = host.clientHeight || window.innerHeight;
    const dprCap = tier >= 3 ? 2 : tier === 2 ? 1.5 : 1;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, dprCap));
    renderer.setSize(W, H, false);

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(60, W / H, 0.1, 100);
    camera.position.z = 16;

    const tex = softTexture();
    const disposables = [tex];

    // ── Motes: a slow drifting dust/star field ──────────────────────────
    const moteCount = MOTES_BY_TIER[tier] || MOTES_BY_TIER[2];
    const mPos = new Float32Array(moteCount * 3);
    for (let i = 0; i < moteCount; i++) {
      mPos[i * 3] = (Math.sin(i * 12.9898) * 43758.545 % 1) * 40 - 20;
      mPos[i * 3 + 1] = (Math.sin(i * 78.233) * 43758.545 % 1) * 40 - 20;
      mPos[i * 3 + 2] = (Math.sin(i * 37.719) * 43758.545 % 1) * 20 - 16;
    }
    const mGeo = new THREE.BufferGeometry();
    mGeo.setAttribute("position", new THREE.BufferAttribute(mPos, 3));
    const mMat = new THREE.PointsMaterial({
      size: tier >= 3 ? 0.14 : 0.2,
      map: tex,
      color: new THREE.Color(t.theme.sparkle || "#ffffff"),
      transparent: true,
      opacity: t.isLight ? 0.5 : 0.85,
      depthWrite: false,
      blending: t.isLight ? THREE.NormalBlending : THREE.AdditiveBlending,
      sizeAttenuation: true,
    });
    const motes = new THREE.Points(mGeo, mMat);
    scene.add(motes);
    disposables.push(mGeo, mMat);

    // ── Clouds: soft sprites at varied depth drifting horizontally ──────
    const cloudCount = CLOUDS_BY_TIER[tier] || CLOUDS_BY_TIER[2];
    const clouds = [];
    const cloudColor = new THREE.Color(t.isLight ? "#ffffff" : (t.secondary || "#9bb7a1"));
    for (let i = 0; i < cloudCount; i++) {
      const mat = new THREE.SpriteMaterial({ map: tex, color: cloudColor, transparent: true, opacity: (t.isLight ? 0.16 : 0.12) + (i % 3) * 0.02, depthWrite: false });
      const s = new THREE.Sprite(mat);
      const z = -6 - (i % 4) * 3;
      const scale = 7 + (i % 5) * 3;
      s.position.set((((i * 97) % 100) / 100) * 44 - 22, (((i * 53) % 100) / 100) * 26 - 13, z);
      s.scale.set(scale, scale * 0.62, 1);
      s.userData.speed = 0.006 + (i % 4) * 0.004;
      scene.add(s);
      clouds.push(s);
      disposables.push(mat);
    }

    // ── Parallax target (pointer + device tilt) ─────────────────────────
    const target = { x: 0, y: 0 };
    const onPointer = (e) => {
      const r = canvas.getBoundingClientRect();
      target.x = ((e.clientX - r.left) / r.width - 0.5) * 2;
      target.y = ((e.clientY - r.top) / r.height - 0.5) * 2;
    };
    const onTilt = (e) => {
      if (e.gamma == null) return;
      target.x = Math.max(-1, Math.min(1, e.gamma / 30));
      target.y = Math.max(-1, Math.min(1, (e.beta - 45) / 30));
    };
    window.addEventListener("pointermove", onPointer, { passive: true });
    window.addEventListener("deviceorientation", onTilt, { passive: true });

    // ── Resize ──────────────────────────────────────────────────────────
    const onResize = () => {
      W = host?.clientWidth || window.innerWidth;
      H = host?.clientHeight || window.innerHeight;
      camera.aspect = W / H;
      camera.updateProjectionMatrix();
      renderer.setSize(W, H, false);
    };
    const ro = typeof ResizeObserver !== "undefined" ? new ResizeObserver(onResize) : null;
    if (ro && host) ro.observe(host); else window.addEventListener("resize", onResize);

    // ── Loop + FPS guard ────────────────────────────────────────────────
    let raf = 0;
    let last = performance.now();
    let slowFrames = 0;
    let frames = 0;
    const animate = (now) => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      camera.position.x += (target.x * 1.6 - camera.position.x) * 0.04;
      camera.position.y += (-target.y * 1.1 - camera.position.y) * 0.04;
      camera.lookAt(0, 0, 0);
      motes.rotation.z += dt * 0.015;
      motes.position.y = (motes.position.y + dt * 0.25) % 8;
      for (const s of clouds) {
        s.position.x += s.userData.speed * dt * 60;
        if (s.position.x > 26) s.position.x = -26;
      }
      renderer.render(scene, camera);

      // FPS guard: sample after warm-up; if a sustained slow streak, downgrade.
      frames++;
      if (frames > 40) {
        if (dt > 1 / 28) slowFrames++; else slowFrames = Math.max(0, slowFrames - 1);
        if (slowFrames > 45) { onDowngrade?.(); return; }
      }
      raf = requestAnimationFrame(animate);
    };
    raf = requestAnimationFrame(animate);

    // Lose-context → fall back to 2D rather than showing a dead canvas.
    const onLost = (e) => { e.preventDefault(); onDowngrade?.(); };
    canvas.addEventListener("webglcontextlost", onLost, false);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("pointermove", onPointer);
      window.removeEventListener("deviceorientation", onTilt);
      if (ro) ro.disconnect(); else window.removeEventListener("resize", onResize);
      canvas.removeEventListener("webglcontextlost", onLost);
      disposables.forEach((d) => d.dispose?.());
      // Release the GL context, then drop the canvas so the next mount starts
      // from a clean element (see the imperative-canvas note above).
      try { renderer.forceContextLoss(); } catch { /* already lost */ }
      renderer.dispose();
      canvas.remove();
    };
  }, [t, tier, fixed, onDowngrade]);

  return (
    <div ref={hostRef} aria-hidden="true" style={{ position: fixed ? "fixed" : "absolute", inset: 0, pointerEvents: "none" }} />
  );
}
