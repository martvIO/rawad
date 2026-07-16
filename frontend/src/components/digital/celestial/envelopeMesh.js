// Premium 3D wedding-envelope reveal, REBUILT to live inside the shared
// celestial particle scene (one renderer — the engine owns the camera + RAF).
// Ported from the "ultra-premium studio reveal" design (envelope3d.js): a
// jewel-tone fiber-dyed cardstock envelope with a gold-foil arabesque flap, a
// glossy jewel-wax seal stamped with the gold دعوة brand emblem, a triangular
// flap that pivots 180°, and a cream gold-foil
// invitation card (Arabic + Hebrew calligraphy baked into a CanvasTexture)
// that rises out of the V-pocket as two gold-spark/shockwave bursts fire and
// the structure dissolves into light.
//
// Contract (the engine drives the clock + applies the camera pose):
//   const env = buildEnvelope({ colors, content })  // colors = themeToEnvelopePalette()
//   scene.add(env.group)
//   const pose = env.setOpen(t, fov, aspect)   // t∈[0,1] → all sub-easings + bursts; returns {y,z,lookAtY}
//   const pose = env.framePose(fov, aspect)    // sealed framing (visual stays at t=0)
//   env.REVEAL_AT                              // t at which to fade the sealed DOM hint
//   env.dispose()
//
// Materials are PBR (MeshStandard/MeshPhysical) lit by lights that are CHILDREN
// of env.group, with a raw equirectangular studio CanvasTexture as each PBR
// material's envMap (no PMREM, no renderer needed here). The particle field's
// ShaderMaterial ignores these lights/env map. All envelope geometry uses real
// depth (depthTest/Write true) so the flap occludes the body and the card the
// flap; the additive bursts are depthWrite:false at a high renderOrder.
import * as THREE from "three";
import { BRAND_ICON_PATHS, BRAND_ICON_VIEWBOX } from "../../../assets/brandSvg.js";

const clamp01 = (t) => Math.max(0, Math.min(1, t));
// Smooth ease-out used across the reveal sub-windows.
const ease = (t) => 1 - Math.pow(1 - clamp01(t), 3);
const col = (hex, fb) => { try { return new THREE.Color(hex); } catch { return new THREE.Color(fb); } };

// Envelope dimensions in DESIGN units; the whole group is scaled by S so it
// frames nicely in the engine's world (the old flat envelope was ~11 wide).
const S = 3.2;
const HW = 1.70, HH = 1.13;
const Z_CARD = 0.05, Z_LR = 0.12, Z_FLAP = 0.145, Z_SEAL = 0.30;
const SEAL_R = 0.40;
const RISE = 1.5;
const CARD_H = HH * 2 - 0.06;
const CARD_BASE_Y = -CARD_H / 2;
const CARD_W = HW * 2 - 0.46;

// Total reveal duration the engine maps t∈[0,1] onto (seconds-equivalent).
const DURATION = 4.8;
// Fire onReveal (fade the sealed DOM hint) once the seal has fractured.
const REVEAL_AT = 0.18;

function setSRGB(tex) {
  if (THREE.SRGBColorSpace) tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

// Extruded flat triangle (xy plane) → a thin paper panel.
function triPanel(pts, depth, mat) {
  const s = new THREE.Shape();
  s.moveTo(pts[0][0], pts[0][1]);
  s.lineTo(pts[1][0], pts[1][1]);
  s.lineTo(pts[2][0], pts[2][1]);
  s.closePath();
  const g = new THREE.ExtrudeGeometry(s, { depth, bevelEnabled: false });
  g.computeVertexNormals();
  return new THREE.Mesh(g, mat);
}

export function buildEnvelope({ colors, content } = {}) {
  const pal = {
    foil: "#d4a07a", foilBright: "#f4d4c4", paper: "#2a211a",
    wax: "#f4ece0", cardPaper: "#f9f6f0", cardInk: "#3a2412",
    ...(colors || {}),
  };
  // Star (arabesque) options — one coherent system across the flap + shell.
  // They ride on the same `colors` object from resolveEnvelopePalette().
  const starsEnabled = colors?.starsEnabled !== false;            // default ON
  const starDensity = Number.isFinite(colors?.starDensity) ? colors.starDensity : 2;
  const starIntensity = (typeof colors?.starIntensity === "number" && Number.isFinite(colors.starIntensity))
    ? colors.starIntensity : null;                                // null → per-surface defaults
  const densF = starDensity / 2;                                  // density 2 = baseline 1×
  const flapAlpha = starIntensity != null ? starIntensity : 0.34; // flap is the focal surface
  const shellAlpha = starIntensity != null ? starIntensity * 0.65 : 0.22; // back/V-pocket subtler
  const text = {
    eyebrow: "دعوة شخصية · הזמנה אישית",
    blessing: "",
    namesAr: "", namesHe: "",
    welcome: "",
    date: "",
    ...(content || {}),
  };

  const group = new THREE.Group();
  group.scale.setScalar(S);
  let disposed = false;
  const disposables = []; // textures/geometries/materials to dispose explicitly

  // ── studio env map (raw equirectangular CanvasTexture, like the design) ──
  const env = (() => {
    const c = document.createElement("canvas");
    c.width = 48; c.height = 256;
    const x = c.getContext("2d");
    const gr = x.createLinearGradient(0, 0, 0, 256);
    gr.addColorStop(0.0, "#fff7e6"); gr.addColorStop(0.16, "#e8c88e");
    gr.addColorStop(0.40, "#3a2c1e"); gr.addColorStop(0.66, "#140f0a"); gr.addColorStop(1.0, "#030303");
    x.fillStyle = gr; x.fillRect(0, 0, 48, 256);
    x.fillStyle = "rgba(255,250,232,0.96)"; x.fillRect(0, 20, 48, 14);  // key-light streak
    x.fillStyle = "rgba(255,238,200,0.32)"; x.fillRect(0, 120, 48, 8);  // soft secondary catch-light
    const t = new THREE.CanvasTexture(c);
    t.mapping = THREE.EquirectangularReflectionMapping;
    setSRGB(t);
    disposables.push(t);
    return t;
  })();

  // ── woven-linen paper-grain roughness map ──
  const grain = (() => {
    const sz = 256, c = document.createElement("canvas");
    c.width = c.height = sz; const x = c.getContext("2d");
    const img = x.createImageData(sz, sz), d = img.data;
    // Deterministic (no Math.random — keeps the build replay-safe): two crossed
    // sine gratings give a tactile woven-linen weave; fine value noise breaks up
    // the banding so it reads as high-end laid cardstock, not corduroy.
    for (let yy = 0; yy < sz; yy++) {
      for (let xx = 0; xx < sz; xx++) {
        const i = (yy * sz + xx) * 4;
        const weave = (Math.sin(xx * 0.55) + Math.sin(yy * 0.55)) * 8;
        const p = yy * sz + xx;
        const n = ((Math.sin(p * 12.9898) * 43758.5453) % 1) * 16 - 8;
        const v = Math.max(0, Math.min(255, 206 + weave + n));
        d[i] = d[i + 1] = d[i + 2] = v; d[i + 3] = 255;
      }
    }
    x.putImageData(img, 0, 0);
    const t = new THREE.CanvasTexture(c);
    t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(3, 2);
    disposables.push(t);
    return t;
  })();

  // ── materials ──
  // Plain matte cardstock (used when stars are OFF, and as the foil-arabesque
  // base colour when ON). DoubleSide so the body reads from behind as the flap pivots.
  const plainPaper = (lighten) => new THREE.MeshStandardMaterial({
    color: lighten ? col(pal.paper, "#0f0d0b").clone().offsetHSL(0, 0, 0.03) : col(pal.paper, "#0f0d0b"),
    metalness: 0.05, roughness: 1.0, roughnessMap: grain, envMap: env, envMapIntensity: 0.06,
    side: THREE.DoubleSide, transparent: true, depthWrite: true,
  });
  // A tone-on-tone gold-foil arabesque material: the foil lattice is the smooth
  // metallic part via metalness/roughness maps over the matte paper colour (the
  // colour is baked into the map, so the material base stays white — matches the
  // card/flap baked-map pattern).
  const arabMat = (arab, envI) => new THREE.MeshStandardMaterial({
    color: 0xffffff, map: arab.color, metalnessMap: arab.metal, roughnessMap: arab.rough,
    metalness: 1.0, roughness: 1.0, envMap: env, envMapIntensity: envI,
    side: THREE.DoubleSide, transparent: true, depthWrite: true,
  });
  // One arabesque map set. `repeat` chosen per surface so the star SCALE matches
  // across geometries: triPanel/flap use ExtrudeGeometry (design-unit UVs) so they
  // share the flap repeat; the back wall is a BoxGeometry (0..1 face UVs) so it
  // needs a larger repeat to land at the same on-screen star size.
  const mkArab = (alpha, lineW, repeat) => {
    const a = makeArabesque({ bg: pal.paper, line: pal.foil, alpha, lineW, cells: 2, repeat, withMetal: true });
    disposables.push(a.color, a.metal, a.rough);
    return a;
  };

  // Back wall (BoxGeometry) + V-pocket panels (ExtrudeGeometry) — the exterior
  // shell now carries the same gold-star arabesque as the flap (subtler alpha so
  // the flap stays the focal point). When stars are OFF, plain matte cardstock.
  let paperMat, paperMat2;
  if (starsEnabled) {
    paperMat = arabMat(mkArab(shellAlpha, 2.2, [1.7 * densF, 1.4 * densF]), 0.4);   // back wall
    paperMat2 = arabMat(mkArab(shellAlpha, 2.2, [0.5 * densF, 0.62 * densF]), 0.4); // V-pocket
  } else {
    paperMat = plainPaper(false);
    paperMat2 = plainPaper(true);
  }

  // Flap face — same star system; falls back to plain jewel cardstock when off so
  // "stars off" removes the decoration everywhere.
  const flapMat = starsEnabled
    ? arabMat(mkArab(flapAlpha, 2.6, [0.5 * densF, 0.62 * densF]), 0.55)
    : plainPaper(false);

  // Flap lining — rich satin silk in a deep contrasting tone with a faint gold
  // arabesque; the luxury "lined envelope" reveal as the flap pivots open.
  const silkColor = col(pal.foil, "#b3a384").clone().lerp(new THREE.Color("#15100a"), 0.5);
  const liningArab = makeArabesque({
    bg: "#" + silkColor.getHexString(), line: pal.foilBright, alpha: 0.16, lineW: 2.0, cells: 2, repeat: [0.55, 0.6],
  });
  disposables.push(liningArab.color);
  const liningMat = new THREE.MeshPhysicalMaterial({
    color: 0xffffff, map: liningArab.color, metalness: 0.0, roughness: 0.42,
    sheen: 1.0, sheenColor: col(pal.foilBright, "#f4d4c4"), sheenRoughness: 0.5,
    clearcoat: 0.25, clearcoatRoughness: 0.4, envMap: env, envMapIntensity: 0.55,
    side: THREE.FrontSide, transparent: true, depthWrite: true,
  });

  const sealTex = makeSealTex(pal);
  disposables.push(sealTex);
  // color:0xffffff — the jewel-tone wax is ALREADY baked into sealTex's gradient;
  // a white base avoids double-multiplying pal.wax (which would crush the disc
  // back toward black). Matches the cardMat/flapMat baked-map pattern.
  const waxMat = new THREE.MeshPhysicalMaterial({
    color: 0xffffff, metalness: 0.0, roughness: 0.16, clearcoat: 1.0, clearcoatRoughness: 0.08,
    envMap: env, envMapIntensity: 1.5, transparent: true, depthWrite: true, map: sealTex,
  });

  const cardMaps = makeCardTextures(pal, text);
  cardMaps.list.forEach((t) => disposables.push(t));
  const cardMat = new THREE.MeshPhysicalMaterial({
    color: 0xffffff, map: cardMaps.color, metalnessMap: cardMaps.metal, roughnessMap: cardMaps.rough,
    metalness: 1.0, roughness: 1.0, clearcoat: 0.35, clearcoatRoughness: 0.5,
    envMap: env, envMapIntensity: 1.0, transparent: true, depthWrite: true,
  });

  // gold hairline edges — give the matte paper its shape. Collected so the
  // dissolve can fade them with the structure.
  const goldEdges = [];
  function addEdge(parent, geo, opacity) {
    const e = new THREE.LineSegments(
      new THREE.EdgesGeometry(geo, 25),
      new THREE.LineBasicMaterial({ color: col(pal.foil, "#f0c84c"), transparent: true, opacity, depthWrite: false }),
    );
    e.material.userData.base = opacity;
    e.renderOrder = 2;
    parent.add(e);
    goldEdges.push(e);
    return e;
  }

  // ── geometry ──
  // back wall
  const backGeo = new THREE.BoxGeometry(HW * 2, HH * 2, 0.12);
  const back = new THREE.Mesh(backGeo, paperMat);
  back.position.z = -0.07;
  group.add(back);
  addEdge(back, backGeo, 0.55);

  // invitation card (rises straight up + forward out of the V-pocket)
  const cardPivot = new THREE.Group();
  cardPivot.position.set(0, CARD_BASE_Y, 0);
  group.add(cardPivot);
  const card = new THREE.Mesh(new THREE.BoxGeometry(CARD_W, CARD_H, 0.045), cardMat);
  card.position.set(0, CARD_H / 2, Z_CARD);
  card.renderOrder = 5;
  cardPivot.add(card);

  // converging lower / side panels = the V-pocket framing the card
  const pBottom = triPanel([[-HW, -HH], [HW, -HH], [0, 0]], 0.03, paperMat2);
  pBottom.position.z = Z_LR; group.add(pBottom); addEdge(pBottom, pBottom.geometry, 0.45);
  const pLeft = triPanel([[-HW, -HH], [-HW, HH], [0, 0]], 0.03, paperMat2);
  pLeft.position.z = Z_LR + 0.004; group.add(pLeft); addEdge(pLeft, pLeft.geometry, 0.45);
  const pRight = triPanel([[HW, -HH], [HW, HH], [0, 0]], 0.03, paperMat2);
  pRight.position.z = Z_LR + 0.004; group.add(pRight); addEdge(pRight, pRight.geometry, 0.45);

  // top flap — hinged at the top edge (pivot at y=+HH)
  const flapPivot = new THREE.Group();
  flapPivot.position.set(0, HH, Z_FLAP);
  group.add(flapPivot);
  const flapOuter = triPanel([[-HW, 0], [HW, 0], [0, -HH]], 0.028, flapMat);
  flapPivot.add(flapOuter);
  addEdge(flapOuter, flapOuter.geometry, 0.62);
  // refined inset gold border framing the flap face (fades with the structure)
  const flapBorder = new THREE.LineLoop(
    new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(-HW * 0.86, -0.07, 0.032),
      new THREE.Vector3(HW * 0.86, -0.07, 0.032),
      new THREE.Vector3(0, -HH * 0.82, 0.032),
    ]),
    new THREE.LineBasicMaterial({ color: col(pal.foil, "#f0c84c"), transparent: true, opacity: 0.5, depthWrite: false }),
  );
  flapBorder.material.userData.base = 0.5; flapBorder.renderOrder = 2;
  flapPivot.add(flapBorder); goldEdges.push(flapBorder);
  const liningShape = new THREE.Shape();
  liningShape.moveTo(-HW + 0.04, -0.04); liningShape.lineTo(HW - 0.04, -0.04); liningShape.lineTo(0, -HH + 0.06); liningShape.closePath();
  const lining = new THREE.Mesh(new THREE.ShapeGeometry(liningShape), liningMat);
  lining.position.z = -0.02; lining.rotation.y = Math.PI;
  flapPivot.add(lining);

  // wax seal — two half-discs split along the flap/body seam
  const sealTop = new THREE.Mesh(new THREE.CircleGeometry(SEAL_R, 64, 0, Math.PI), waxMat);
  sealTop.position.set(0, -HH, Z_SEAL - Z_FLAP); sealTop.renderOrder = 3; flapPivot.add(sealTop);
  const sealBot = new THREE.Mesh(new THREE.CircleGeometry(SEAL_R, 64, Math.PI, Math.PI), waxMat);
  sealBot.position.set(0, 0, Z_SEAL); sealBot.renderOrder = 3; group.add(sealBot);

  // ── lights (children of the group; particle ShaderMaterial ignores them) ──
  // Intensities are the design's, tuned against ACES filmic tone-mapping (the
  // engine enables ACES while an envelope is present). Directional lights are
  // direction-only so the group's scale doesn't affect them; the point lights
  // use decay:1 (legacy-like linear falloff) so the design's intensity numbers
  // read, with their cutoff distance scaled by S to reach the scaled geometry.
  group.add(new THREE.AmbientLight(0x16130d, 0.16));
  const key = new THREE.DirectionalLight(0xfff1d8, 1.0); key.position.set(5, 6.5, 5.5); group.add(key);
  const top = new THREE.DirectionalLight(0xfff2dd, 0.12); top.position.set(0, 8, 3); group.add(top);
  const fill = new THREE.DirectionalLight(0x4a3a28, 0.07); fill.position.set(-4, -3, 4); group.add(fill);
  // warm back-rim in the theme's foil colour — lifts the gold filigree + jewel paper
  const backRim = new THREE.DirectionalLight(col(pal.foilBright, "#f4d4c4"), 0.20); backRim.position.set(-3, 2, -5); group.add(backRim);
  const rim = new THREE.PointLight(col(pal.foilBright, "#f0c84c"), 0.0, 24 * S, 1); rim.position.set(0, 0.2, 2.4); group.add(rim);
  const sealGlow = new THREE.PointLight(col(pal.foilBright, "#f0c84c"), 0.0, 6 * S, 1); sealGlow.position.set(0, 0, 0.9); group.add(sealGlow);

  // ── bursts (gold sparks + shockwave + flare + flash), fired from setOpen ──
  const sparkPal = [col(pal.foilBright, "#fff3c0"), col(pal.foil, "#f0c84c"), new THREE.Color("#ffffff"), col(pal.foilBright, "#ffd56a")];
  const burstOpen = makeBurst(group, new THREE.Vector3(0, -0.15, Z_SEAL + 0.06), 220, 1.0, 0.12, sparkPal, disposables);
  const burstDissolve = makeBurst(group, new THREE.Vector3(0, 1.5, 0.62), 360, 1.85, 0.16, sparkPal, disposables);

  // ── visual state for a normalized progress t ──
  function applyVisual(t) {
    const T = clamp01(t) * DURATION;
    const frac = ease(clamp01((T - 0.05) / 0.45));   // seal fracture
    const flap = ease(clamp01((T - 0.35) / 1.05));   // 180° pivot
    const rise = ease(clamp01((T - 0.95) / 1.25));   // card rise
    const structFade = ease(clamp01((T - 2.45) / 0.8)); // body dissolves
    const burst = clamp01((T - 0.42) / 1.45);        // burst #1 (rupture)
    const dis = clamp01((T - 3.85) / 0.9);           // burst #2 (card → light)
    const fade = ease(clamp01((T - 3.95) / 0.8));    // card dissolves into light

    flapPivot.rotation.x = -Math.PI * 0.97 * flap;
    sealTop.position.y = -HH + 0.045 * frac;
    sealBot.position.y = -0.05 * frac;
    sealBot.rotation.z = 0.18 * frac;

    cardPivot.position.y = CARD_BASE_Y + RISE * rise;
    cardPivot.position.z = 0.6 * rise;

    applyBurst(burstOpen, burst);
    applyBurst(burstDissolve, dis);

    cardMat.opacity = 1 - fade;
    const ef = 1 - structFade;
    paperMat.opacity = ef; paperMat2.opacity = ef; flapMat.opacity = ef; liningMat.opacity = ef; waxMat.opacity = ef;
    for (const e of goldEdges) e.material.opacity = (e.material.userData.base || 0.3) * ef;

    sealGlow.intensity = 0.5 * (1 - clamp01(T / 0.5));
    rim.intensity = 0.35 + 1.4 * rise
      + 1.6 * clamp01(1 - burst / 0.5) * (burst > 0 ? 1 : 0)
      + 2.4 * clamp01(1 - dis / 0.6) * (dis > 0 ? 1 : 0);

    return { frac, flap, rise, structFade };
  }

  // ── camera framing for a normalized progress t (engine applies the pose) ──
  // Returns a desired pose in WORLD units (group is scaled by S). Contains the
  // whole live extent early, then tightens onto the risen card as it dissolves.
  function framing(t, fov, aspect) {
    const tn = Math.tan(((fov || 34) * Math.PI / 180) / 2);
    const asp = aspect || 1;
    const fit = (halfW, halfH, margin) => Math.max(halfH / tn, halfW / (tn * asp)) * margin;
    const T = clamp01(t) * DURATION;
    const structFade = ease(clamp01((T - 2.45) / 0.8));
    const camB = structFade;

    const flapRot = -Math.PI * 0.97 * ease(clamp01((T - 0.35) / 1.05));
    const rise = ease(clamp01((T - 0.95) / 1.25));
    const cardY = CARD_BASE_Y + RISE * rise;
    const cardZ = 0.6 * rise;

    // wide framing — contain EVERYTHING currently on screen
    const flapTipY = HH * (1 - Math.cos(flapRot));
    const cardTopY = cardY + CARD_H;
    const allTop = Math.max(HH, flapTipY, cardTopY) + 0.16;
    const allBot = -HH - 0.16;
    const allCen = (allTop + allBot) / 2;
    const allZ = fit(HW + 0.16, (allTop - allBot) / 2, 1.1);

    // close framing — the risen card fills the frame
    const cardCen = cardY + CARD_H / 2;
    const closeZ = cardZ + fit(CARD_W / 2, CARD_H / 2, 1.06);

    const cy = allCen + (cardCen - allCen) * camB;
    const cz = allZ + (closeZ - allZ) * camB;
    return { y: cy * S, z: cz * S, lookAtY: cy * S };
  }

  applyVisual(0);

  function dispose() {
    if (disposed) return;
    disposed = true;
    group.traverse((o) => {
      if (o.geometry) o.geometry.dispose();
      if (o.material) {
        const m = o.material;
        for (const slot of ["map", "roughnessMap", "metalnessMap", "normalMap", "clearcoatMap", "envMap", "alphaMap"]) {
          if (m[slot] && m[slot].dispose) m[slot].dispose();
        }
        m.dispose();
      }
    });
    for (const d of disposables) { try { d.dispose(); } catch { /* ignore */ } }
  }

  return {
    group,
    REVEAL_AT,
    setOpen(t, fov, aspect) { applyVisual(t); return framing(t, fov, aspect); },
    framePose(fov, aspect) { return framing(0, fov, aspect); },
    // Re-bake the card calligraphy once the wedding fonts finish loading (canvas
    // text silently falls back until then). No-ops after dispose.
    refreshCard() {
      if (disposed) return;
      paintCard(cardMaps, pal, text);
      cardMaps.color.needsUpdate = cardMaps.metal.needsUpdate = cardMaps.rough.needsUpdate = true;
    },
    dispose,
  };
}

// ── arabesque foil pattern: an allover 8-point-star girih lattice, tone-on-tone.
// Returns aligned color (+ optional metalness/roughness) CanvasTextures so the
// foil lines can be the smooth metallic part of a PBR material over matte stock.
// Deterministic (no Math.random) — keeps the build replay-safe. ──
function makeArabesque({ bg, line, alpha = 0.3, lineW = 2.4, cells = 2, repeat = [1, 1], withMetal = false }) {
  const s = 512;
  const mk = () => { const c = document.createElement("canvas"); c.width = c.height = s; return c; };
  const cc = mk(); const xc = cc.getContext("2d");
  const mc = withMetal ? mk() : null; const xm = mc ? mc.getContext("2d") : null;
  const rc = withMetal ? mk() : null; const xr = rc ? rc.getContext("2d") : null;
  if (bg) { xc.fillStyle = bg; xc.fillRect(0, 0, s, s); }
  if (xm) { xm.fillStyle = "#000"; xm.fillRect(0, 0, s, s); }          // matte (non-metal) ground
  if (xr) { xr.fillStyle = "#e6e6e6"; xr.fillRect(0, 0, s, s); }       // rough ground

  const star = (ctx, ox, oy, r, stroke, a, lw) => {
    ctx.save();
    ctx.globalAlpha = a; ctx.strokeStyle = stroke; ctx.lineWidth = lw;
    ctx.lineJoin = "round"; ctx.lineCap = "round";
    ctx.beginPath();
    for (let i = 0; i < 16; i++) {                  // outer 8-point star
      const ang = (i * Math.PI) / 8 - Math.PI / 2;
      const rr = i % 2 === 0 ? r : r * 0.45;
      const px = ox + Math.cos(ang) * rr, py = oy + Math.sin(ang) * rr;
      i ? ctx.lineTo(px, py) : ctx.moveTo(px, py);
    }
    ctx.closePath(); ctx.stroke();
    ctx.beginPath();
    for (let i = 0; i < 8; i++) {                   // inner octagon
      const ang = (i * Math.PI) / 4;
      const px = ox + Math.cos(ang) * r * 0.4, py = oy + Math.sin(ang) * r * 0.4;
      i ? ctx.lineTo(px, py) : ctx.moveTo(px, py);
    }
    ctx.closePath(); ctx.stroke();
    ctx.restore();
  };
  // One motif drawn into every aligned map at once: foil on the colour map, white
  // on the metal map (foil = metallic), dark on the rough map (foil = smooth).
  const motif = (ox, oy, r, a, lw) => {
    star(xc, ox, oy, r, line, a, lw);
    if (xm) star(xm, ox, oy, r, "#fff", Math.min(1, a * 2.6), lw);
    if (xr) star(xr, ox, oy, r, "#3a3a3a", Math.min(1, a * 2.4), lw);
  };

  const u = s / cells;
  // Lattice nodes on the grid corners tile seamlessly under RepeatWrapping;
  // smaller accent stars at the cell centres add density.
  for (let gy = 0; gy <= cells; gy++) {
    for (let gx = 0; gx <= cells; gx++) motif(gx * u, gy * u, u * 0.5, alpha, lineW);
  }
  for (let gy = 0; gy < cells; gy++) {
    for (let gx = 0; gx < cells; gx++) motif(gx * u + u / 2, gy * u + u / 2, u * 0.24, alpha * 0.85, lineW * 0.8);
  }

  const tex = (canvas, srgb) => {
    const t = new THREE.CanvasTexture(canvas);
    if (srgb) setSRGB(t);
    t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(repeat[0], repeat[1]);
    return t;
  };
  return {
    color: tex(cc, true),
    metal: mc ? tex(mc, false) : null,
    rough: rc ? tex(rc, false) : null,
  };
}

// ── seal texture: glossy jewel-tone wax, raised rim, debossed compass + the
// gold-foil دعوة brand emblem (drawn natively via Path2D — no <img>, no taint) ──
function makeSealTex(pal) {
  const s = 512, c = document.createElement("canvas");
  c.width = c.height = s; const x = c.getContext("2d");
  const cx = s / 2, cy = s / 2, R = s / 2 - 6;
  // Disc colour derived from the theme's jewel-tone wax: a lit centre falling to
  // a darkened rim, so it reads as rich coloured sealing-wax, not a black puck.
  const waxC = col(pal.wax, "#6c5240");
  const cCenter = waxC.clone().lerp(new THREE.Color("#ffffff"), 0.46).getStyle();
  const cMid = waxC.clone().lerp(new THREE.Color("#ffffff"), 0.08).getStyle();
  const cRim = waxC.clone().lerp(new THREE.Color("#000000"), 0.42).getStyle();
  const rg = x.createRadialGradient(cx - R * 0.3, cy - R * 0.34, R * 0.05, cx, cy, R * 1.05);
  rg.addColorStop(0, cCenter); rg.addColorStop(0.45, cMid); rg.addColorStop(1, cRim);
  x.fillStyle = rg; x.beginPath(); x.arc(cx, cy, R, 0, 7); x.fill();
  // raised rim rings (warm catch-light + inner shadow)
  x.lineWidth = 12; x.strokeStyle = "rgba(255,248,224,0.16)"; x.beginPath(); x.arc(cx, cy, R - 9, 0, 7); x.stroke();
  x.lineWidth = 7; x.strokeStyle = "rgba(0,0,0,0.55)"; x.beginPath(); x.arc(cx, cy, R - 22, 0, 7); x.stroke();
  // faint debossed compass behind the emblem
  const star = (rot, scale, fill) => {
    x.save(); x.translate(cx, cy); x.rotate(rot); x.beginPath();
    for (let i = 0; i < 8; i++) {
      const a = i * Math.PI / 4; const rr = (i % 2 === 0) ? R * 0.5 * scale : R * 0.14 * scale;
      x[i ? "lineTo" : "moveTo"](Math.cos(a) * rr, Math.sin(a) * rr);
    }
    x.closePath(); x.fillStyle = fill; x.fill(); x.restore();
  };
  if (pal.sealStarEnabled) {                 // default OFF — groom opts in via the design editor
    star(0, 1.0, "rgba(0,0,0,0.45)");
    star(0, 0.96, "rgba(255,248,224,0.06)");
  }

  // The دعوة brand mark, stamped in gold foil — a dark deboss shadow under a
  // vertically graded foil face — drawn from the icon's raw SVG paths via Path2D
  // (no <img> load, so the canvas stays origin-clean for the WebGL texture upload).
  const vb = BRAND_ICON_VIEWBOX;
  const paths = BRAND_ICON_PATHS.map((d) => new Path2D(d));
  const lw = R * 1.32, sc = lw / vb.w, lh = vb.h * sc;
  const stampShadow = (dx, dy) => {
    x.save(); x.translate(cx - lw / 2 + dx, cy - lh / 2 + dy); x.scale(sc, sc);
    x.fillStyle = "rgba(0,0,0,0.5)";
    for (const p of paths) x.fill(p);
    x.restore();
  };
  stampShadow(R * 0.016, R * 0.024);
  x.save();                                              // foil face
  x.translate(cx - lw / 2, cy - lh / 2); x.scale(sc, sc);
  const fg = x.createLinearGradient(0, 0, 0, vb.h);
  fg.addColorStop(0, pal.foilBright || "#f4d4c4");
  fg.addColorStop(0.5, pal.foil || "#d4a07a");
  fg.addColorStop(1, pal.foilBright || "#f4d4c4");
  x.fillStyle = fg;
  for (const p of paths) x.fill(p);
  x.restore();

  const t = new THREE.CanvasTexture(c); setSRGB(t); return t;
}

// ── invitation card faces: color + metalness + roughness canvases ──
function makeCardTextures(pal, text) {
  const W = 1100, H = 832;
  const make = () => { const c = document.createElement("canvas"); c.width = W; c.height = H; return c; };
  const color = make(), metal = make(), rough = make();
  const maps = {
    W, H, color, metal, rough,
    colorTex: setSRGB(new THREE.CanvasTexture(color)),
    metalTex: new THREE.CanvasTexture(metal),
    roughTex: new THREE.CanvasTexture(rough),
  };
  paintCard(maps, pal, text);
  return {
    color: maps.colorTex, metal: maps.metalTex, rough: maps.roughTex,
    W, H, canvas: { color, metal, rough },
    list: [maps.colorTex, maps.metalTex, maps.roughTex],
    // mirror onto the simple shape paintCard expects
    _maps: maps,
  };
}

function wrapText(ctx, str, cx, y, maxW, lh) {
  const words = String(str || "").split(" ");
  let line = ""; const lines = [];
  for (const w of words) {
    const test = line ? line + " " + w : w;
    if (ctx.measureText(test).width > maxW && line) { lines.push(line); line = w; } else line = test;
  }
  if (line) lines.push(line);
  lines.forEach((l, j) => ctx.fillText(l, cx, y + j * lh));
}

function ornRule(ctx, cx, y, w, color) {
  ctx.save(); ctx.strokeStyle = color; ctx.fillStyle = color; ctx.lineWidth = 1.4;
  ctx.beginPath(); ctx.moveTo(cx - w / 2, y); ctx.lineTo(cx - 12, y); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(cx + 12, y); ctx.lineTo(cx + w / 2, y); ctx.stroke();
  ctx.save(); ctx.translate(cx, y); ctx.rotate(Math.PI / 4); ctx.fillRect(-4, -4, 8, 8); ctx.restore();
  ctx.restore();
}

function paintCard(cardMaps, pal, text) {
  const maps = cardMaps._maps || cardMaps;
  const W = maps.W, H = maps.H;
  const colC = maps.color.getContext("2d");
  const met = maps.metal.getContext("2d");
  const rgh = maps.rough.getContext("2d");

  const cardPaper = pal.cardPaper || "#f9f6f0";
  const foil = pal.foil || "#d4a07a";
  const foilB = pal.foilBright || "#f4d4c4";
  const ink = pal.cardInk || "#3a2412";

  // base maps
  colC.fillStyle = cardPaper; colC.fillRect(0, 0, W, H);
  met.fillStyle = "#000000"; met.fillRect(0, 0, W, H);
  rgh.fillStyle = "#d6d6d6"; rgh.fillRect(0, 0, W, H);
  const vg = colC.createRadialGradient(W / 2, H * 0.42, H * 0.2, W / 2, H / 2, H * 0.85);
  vg.addColorStop(0, "rgba(255,255,255,0)"); vg.addColorStop(1, "rgba(120,95,60,0.10)");
  colC.fillStyle = vg; colC.fillRect(0, 0, W, H);

  // gold-foil filigree corner flourishes → drawn into all three maps
  const corner = (ox, oy, sx, sy) => {
    [colC, met, rgh].forEach((ctx, idx) => {
      ctx.save(); ctx.translate(ox, oy); ctx.scale(sx, sy);
      ctx.lineCap = "round"; ctx.lineJoin = "round";
      if (idx === 0) { const lg = ctx.createLinearGradient(0, 0, 150, 150); lg.addColorStop(0, foilB); lg.addColorStop(1, foil); ctx.strokeStyle = lg; ctx.fillStyle = lg; }
      else if (idx === 1) { ctx.strokeStyle = "#ffffff"; ctx.fillStyle = "#ffffff"; }
      else { ctx.strokeStyle = "#3a3a3a"; ctx.fillStyle = "#3a3a3a"; }
      ctx.lineWidth = 6; ctx.beginPath(); ctx.moveTo(8, 150); ctx.bezierCurveTo(8, 50, 60, 8, 150, 8); ctx.stroke();
      ctx.lineWidth = 3.2; ctx.beginPath(); ctx.moveTo(26, 150); ctx.bezierCurveTo(26, 66, 70, 26, 150, 26); ctx.stroke();
      ctx.lineWidth = 4; ctx.beginPath(); ctx.moveTo(8, 150); ctx.bezierCurveTo(40, 120, 70, 120, 70, 92); ctx.bezierCurveTo(70, 74, 52, 70, 50, 86); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(150, 8); ctx.bezierCurveTo(120, 40, 120, 70, 92, 70); ctx.bezierCurveTo(74, 70, 70, 52, 86, 50); ctx.stroke();
      const leaf = (lx, ly, r) => { ctx.save(); ctx.translate(lx, ly); ctx.rotate(r); ctx.beginPath(); ctx.ellipse(0, 0, 16, 6, 0, 0, 7); ctx.fill(); ctx.restore(); };
      leaf(58, 58, 0.78); leaf(96, 30, 0.4); leaf(30, 96, 1.15);
      [[150, 8], [8, 150], [50, 86], [86, 50]].forEach((d) => { ctx.beginPath(); ctx.arc(d[0], d[1], 4.5, 0, 7); ctx.fill(); });
      ctx.restore();
    });
  };
  const M = 30;
  corner(M, M, 1, 1); corner(W - M, M, -1, 1); corner(M, H - M, 1, -1); corner(W - M, H - M, -1, -1);

  // thin foil inner frame
  [colC, met, rgh].forEach((ctx, idx) => {
    ctx.save();
    ctx.strokeStyle = idx === 0 ? foil : idx === 1 ? "#cfcfcf" : "#5a5a5a";
    ctx.lineWidth = 2.2; ctx.strokeRect(W * 0.11, H * 0.10, W * 0.78, H * 0.80); ctx.restore();
  });

  // ── typography (colour map only; baked as matte ink) ──
  // The families come from the design's chosen font (threaded in as
  // content.arFamily / content.heFamily by CelestialAmbience) so the names
  // emerging on the card match the hero one second later. Falls back to the
  // previous hardcoded pair when absent. Quoted so multi-word families
  // ("Frank Ruhl Libre", "Noto Naskh Arabic") parse in the canvas font shorthand.
  const q = (f, fallback) => `"${String(f || fallback).replace(/"/g, "")}"`;
  const ar = q(text.arFamily, "Amiri");
  const he = q(text.heFamily, "Frank Ruhl Libre");
  colC.textAlign = "center"; colC.direction = "rtl";
  colC.fillStyle = foil; colC.font = `600 34px ${ar},"Scheherazade New",serif`;
  colC.fillText(text.blessing || "", W / 2, H * 0.165);
  ornRule(colC, W / 2, H * 0.205, 150, foil);
  colC.fillStyle = "rgba(150,110,60,0.9)"; colC.font = `500 19px ${ar},Cairo,sans-serif`;
  colC.fillText(text.eyebrow || "", W / 2, H * 0.265);
  colC.fillStyle = ink; colC.font = `700 92px ${ar},serif`;
  colC.fillText(text.namesAr || "", W / 2, H * 0.44);
  colC.fillStyle = "#7a5430"; colC.font = `700 40px ${he},serif`;
  colC.fillText(text.namesHe || "", W / 2, H * 0.525);
  ornRule(colC, W / 2, H * 0.575, 210, foil);
  colC.fillStyle = "#6a4e30"; colC.font = `400 24px ${ar},${he},sans-serif`;
  wrapText(colC, text.welcome || "", W / 2, H * 0.66, W * 0.66, 34);
  colC.fillStyle = foil; colC.font = `600 23px ${ar},Cairo,sans-serif`;
  colC.fillText(text.date || "", W / 2, H * 0.85);
}

// ── one burst rig: gold sparks (Points) + shockwave ring + flare + flash ──
function makeBurst(group, origin, N, speedScale, dotSize, palette, disposables) {
  const geo = new THREE.BufferGeometry();
  const pos = new Float32Array(N * 3), colArr = new Float32Array(N * 3);
  const dir = [], speed = new Float32Array(N);
  for (let i = 0; i < N; i++) {
    // Deterministic scatter (no Math.random) so the build is replay-safe.
    const a = (i * 2.399963) % (Math.PI * 2);            // golden-angle spiral
    const elev = (((Math.sin(i * 7.13) + 1) / 2) - 0.5) * 1.5;
    const dx = Math.cos(a) * Math.cos(elev);
    const dy = Math.sin(a) * Math.cos(elev) * 0.95 + 0.18;
    const dz = Math.abs(Math.sin(elev)) * 0.5 + 0.25 + ((Math.sin(i * 3.7) + 1) / 2) * 0.7;
    dir.push(new THREE.Vector3(dx, dy, dz).normalize());
    speed[i] = (1.1 + ((Math.sin(i * 1.7) + 1) / 2) * 3.0) * speedScale;
    pos[i * 3] = origin.x; pos[i * 3 + 1] = origin.y; pos[i * 3 + 2] = origin.z;
    const c = palette[i % palette.length];
    colArr[i * 3] = c.r; colArr[i * 3 + 1] = c.g; colArr[i * 3 + 2] = c.b;
  }
  geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  geo.setAttribute("color", new THREE.BufferAttribute(colArr, 3));
  const dotTex = sprite("dot"); const ringTex = sprite("ring"); const glowTex = sprite("glow");
  disposables.push(dotTex, ringTex, glowTex);
  const points = new THREE.Points(geo, new THREE.PointsMaterial({
    size: dotSize, map: dotTex, vertexColors: true, transparent: true, opacity: 0,
    depthWrite: false, blending: THREE.AdditiveBlending, sizeAttenuation: true,
  }));
  points.visible = false; points.renderOrder = 10; group.add(points);

  const flash = new THREE.PointLight(0xfff0c8, 0, 18 * 3.2, 1); flash.position.set(origin.x, origin.y, origin.z + 0.5); group.add(flash);

  const shock = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({
    map: ringTex, color: palette[0].clone(), transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
  }));
  shock.position.set(origin.x, origin.y + 0.05, origin.z + 0.02); shock.visible = false; shock.renderOrder = 10; group.add(shock);

  const flare = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({
    map: glowTex, color: palette[0].clone(), transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending,
  }));
  flare.position.set(origin.x, origin.y + 0.05, origin.z + 0.05); flare.visible = false; flare.renderOrder = 10; group.add(flare);

  const big = dotSize > 0.14;
  return { geo, points, dir, speed, origin, flash, shock, flare, ringSpread: big ? 9.5 : 6.2, flareSpread: big ? 5.5 : 3.4 };
}

function applyBurst(s, b) {
  if (!s) return;
  if (b <= 0) { s.points.visible = false; s.shock.visible = false; s.flare.visible = false; s.flash.intensity = 0; return; }
  const e = 1 - Math.pow(1 - b, 2.2);
  const pos = s.geo.attributes.position.array, o = s.origin;
  for (let i = 0; i < s.speed.length; i++) {
    const d = s.dir[i], sp = s.speed[i] * e;
    pos[i * 3] = o.x + d.x * sp;
    pos[i * 3 + 1] = o.y + d.y * sp - 1.7 * b * b;
    pos[i * 3 + 2] = o.z + d.z * sp;
  }
  s.geo.attributes.position.needsUpdate = true;
  s.points.visible = b < 1;
  s.points.material.opacity = clamp01(1 - (b - 0.12) / 0.88) * clamp01(b / 0.04);
  s.flash.intensity = clamp01(b / 0.05) * (1 - clamp01((b - 0.05) / 0.42)) * 12;
  s.shock.visible = b < 0.85;
  const ss = 0.4 + b * s.ringSpread; s.shock.scale.set(ss, ss, 1);
  s.shock.material.opacity = clamp01(1 - b / 0.75) * 0.95;
  s.flare.visible = b < 0.66;
  const fs = 0.6 + b * s.flareSpread; s.flare.scale.set(fs, fs, 1);
  s.flare.material.opacity = clamp01(1 - b / 0.62) * 0.92;
}

// soft sprite textures shared by the burst actors
function sprite(kind) {
  const s = kind === "dot" ? 64 : 256, c = document.createElement("canvas");
  c.width = c.height = s; const x = c.getContext("2d");
  if (kind === "dot") {
    const gr = x.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
    gr.addColorStop(0, "rgba(255,255,255,1)"); gr.addColorStop(0.35, "rgba(255,236,180,0.9)"); gr.addColorStop(1, "rgba(255,200,90,0)");
    x.fillStyle = gr; x.fillRect(0, 0, s, s);
  } else if (kind === "ring") {
    const gr = x.createRadialGradient(s / 2, s / 2, s * 0.30, s / 2, s / 2, s * 0.5);
    gr.addColorStop(0, "rgba(255,236,180,0)"); gr.addColorStop(0.72, "rgba(255,236,180,0)");
    gr.addColorStop(0.86, "rgba(255,240,200,0.95)"); gr.addColorStop(0.95, "rgba(240,200,90,0.5)"); gr.addColorStop(1, "rgba(240,200,90,0)");
    x.fillStyle = gr; x.fillRect(0, 0, s, s);
  } else {
    const gr = x.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
    gr.addColorStop(0, "rgba(255,248,220,0.95)"); gr.addColorStop(0.25, "rgba(255,224,150,0.6)"); gr.addColorStop(0.6, "rgba(240,200,90,0.18)"); gr.addColorStop(1, "rgba(240,200,90,0)");
    x.fillStyle = gr; x.fillRect(0, 0, s, s);
  }
  return new THREE.CanvasTexture(c);
}
