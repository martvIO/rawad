// Procedural 3D envelope for the celestial intro — body + triangular flap
// (hinged at its top edge) + a wax-seal disc bearing the monogram + a letter
// that rises and fades in on open. No model files: a handful of planes + one
// CanvasTexture for the seal initials. All parts are depthTest:false (like the
// particle field) and occlude purely by draw order, so there's no 3D
// self-occlusion to fight; the rising letter fades in and draws on top.
//
//   const env = buildEnvelope({ colors, monogram })  // colors = themeToUniforms()
//   scene.add(env.group); env.setOpen(0..1); env.dispose()
import * as THREE from "three";

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const easeOut = (t) => 1 - Math.pow(1 - t, 3);
const col = (rgb) => new THREE.Color().setRGB(rgb[0], rgb[1], rgb[2]);
const css = (rgb) => `rgb(${(rgb[0] * 255) | 0},${(rgb[1] * 255) | 0},${(rgb[2] * 255) | 0})`;

// Envelope dimensions in world units (camera frames it from ~14 units away).
const W = 11;
const H = 7;

function makeSealTexture(monogram, colors) {
  const S = 256;
  const c = document.createElement("canvas");
  c.width = c.height = S;
  const ctx = c.getContext("2d");
  const g = ctx.createRadialGradient(S * 0.4, S * 0.36, S * 0.08, S * 0.5, S * 0.5, S * 0.52);
  g.addColorStop(0, css(colors.glow));
  g.addColorStop(1, css(colors.accent));
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(S / 2, S / 2, S / 2 - 8, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = colors.isLight ? "rgba(40,18,4,.92)" : "rgba(20,12,4,.92)";
  ctx.font = `900 ${Math.round(S * 0.4)}px Cairo, Amiri, "Frank Ruhl Libre", serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(monogram || "د", S / 2, S / 2 + S * 0.03);
  const tex = new THREE.CanvasTexture(c);
  tex.anisotropy = 4;
  return tex;
}

function basicMat(color, opacity, blending) {
  return new THREE.MeshBasicMaterial({
    color,
    transparent: true,
    opacity,
    blending,
    depthTest: false,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
}

export function buildEnvelope({ colors, monogram }) {
  const isLight = !!colors.isLight;
  const group = new THREE.Group();

  // Soft glow halo so the envelope sits in the particle world.
  const glow = new THREE.Mesh(
    new THREE.PlaneGeometry(W * 1.7, H * 2.0),
    basicMat(col(colors.glow), isLight ? 0.12 : 0.34, THREE.AdditiveBlending),
  );
  glow.position.z = -0.6;
  group.add(glow);

  // Accent rim (a frame just behind the body).
  const rim = new THREE.Mesh(
    new THREE.PlaneGeometry(W + 0.4, H + 0.4),
    basicMat(col(colors.glow), isLight ? 0.55 : 0.6, isLight ? THREE.NormalBlending : THREE.AdditiveBlending),
  );
  rim.position.z = -0.04;
  group.add(rim);

  // Envelope body (paper panel).
  const bodyColor = isLight
    ? col([0.97, 0.94, 0.88])
    : col([colors.accent[0] * 0.34 + 0.03, colors.accent[1] * 0.34 + 0.03, colors.accent[2] * 0.34 + 0.03]);
  const body = new THREE.Mesh(new THREE.PlaneGeometry(W, H), basicMat(bodyColor, isLight ? 0.97 : 0.92, THREE.NormalBlending));
  group.add(body);

  // Triangular flap, hinged at the body's TOP edge via a pivot. Geometry is
  // built relative to the pivot: base along y=0 (the hinge), apex down at -H/2.
  const flapPivot = new THREE.Object3D();
  flapPivot.position.set(0, H / 2, 0.06);
  const flapGeo = new THREE.BufferGeometry();
  flapGeo.setAttribute(
    "position",
    new THREE.BufferAttribute(new Float32Array([-W / 2, 0, 0, W / 2, 0, 0, 0, -H / 2, 0]), 3),
  );
  const flapColor = isLight
    ? col([0.92, 0.88, 0.79])
    : col([colors.accent[0] * 0.5 + 0.04, colors.accent[1] * 0.5 + 0.04, colors.accent[2] * 0.5 + 0.04]);
  const flap = new THREE.Mesh(flapGeo, basicMat(flapColor, isLight ? 0.98 : 0.95, THREE.NormalBlending));
  flapPivot.add(flap);
  group.add(flapPivot);

  // Wax seal with the monogram, where the flap apex meets the body centre.
  const sealTex = makeSealTexture(monogram, colors);
  const sealMat = new THREE.MeshBasicMaterial({
    map: sealTex,
    transparent: true,
    opacity: 1,
    depthTest: false,
    depthWrite: false,
  });
  const seal = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 2.6), sealMat);
  seal.position.set(0, -0.4, 0.12);
  group.add(seal);

  // The letter — fades in and rises on open. Drawn last so it's on top; the big
  // DOM couple-names overlay sits over it.
  const letterColor = isLight
    ? col([1, 1, 1])
    : col([colors.core[0] * 0.4 + 0.12, colors.core[1] * 0.4 + 0.12, colors.core[2] * 0.4 + 0.12]);
  const letterMat = basicMat(letterColor, 0, THREE.NormalBlending);
  const letter = new THREE.Mesh(new THREE.PlaneGeometry(W * 0.86, H * 0.78), letterMat);
  const LETTER_Y0 = 0;
  const LETTER_RISE = H * 0.42;
  letter.position.set(0, LETTER_Y0, 0.18);
  group.add(letter);

  function setOpen(t) {
    const flapT = easeOut(clamp(t / 0.6, 0, 1));
    flapPivot.rotation.x = -2.7 * flapT; // swing up and back over the hinge

    const sealT = clamp(t / 0.32, 0, 1);
    sealMat.opacity = 1 - sealT;
    seal.scale.setScalar(1 + sealT * 0.6);

    const letterT = easeOut(clamp((t - 0.22) / 0.6, 0, 1));
    letterMat.opacity = letterT;
    letter.position.y = LETTER_Y0 + letterT * LETTER_RISE;
  }
  setOpen(0);

  function dispose() {
    group.traverse((o) => {
      if (o.geometry) o.geometry.dispose();
      if (o.material) {
        if (o.material.map) o.material.map.dispose();
        o.material.dispose();
      }
    });
  }

  return { group, setOpen, dispose };
}
