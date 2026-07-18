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

// ── Designer envelope STYLES ──────────────────────────────────────────────────
// Each is a self-contained luxury look: a signature palette + a delicate FLORAL
// emboss (procedural normal-map relief instead of the arabesque) + a warm inner
// glow that spills out as the flap opens (the reference's golden light). The wax
// seal keeps the دعوة فرحنا company emblem (no couple initials). `style ===
// "classic"` or any unknown value keeps the original theme-driven arabesque
// envelope byte-for-byte untouched. `glow` = the light pouring from inside;
// `linen` = the flap's satin lining (kept light so it catches the glow);
// `floralTint` = the barely-there colour of the embossed florals on the paper.
const STYLE_PRESETS = {
  // A DIFFERENT SHAPE (not a recolour): a portrait envelope whose four triangular
  // flaps fold OUTWARD from the centre — like the reference — revealing the card
  // with a warm glow. `shape:"bloom"` routes buildEnvelope to buildEnvelopeBloom.
  "bloom": {
    shape: "bloom", light: true,
    palette: { paper: "#f7e7e8", foil: "#c98a90", foilBright: "#f2d8d4", wax: "#8a2230", cardPaper: "#fdf6f5", cardInk: "#5a2530", sealLogo: "#eccf94" },
    floralTint: "#ecd2d3", glow: "#ffcf9a", linen: "#f6e6e6",
  },
  "royal-blush": {
    palette: { paper: "#f7e7e8", foil: "#c98a90", foilBright: "#f2d8d4", wax: "#8a2230", cardPaper: "#fdf6f5", cardInk: "#5a2530" },
    floralTint: "#ecd2d3", glow: "#ffcf9a", linen: "#f4e2e2",
  },
  "royal-gold": {
    light: false, // deep midnight paper — keep the dim, dramatic classic lighting
    palette: { paper: "#141021", foil: "#d8b25a", foilBright: "#f6e3a6", wax: "#c69a34", cardPaper: "#f7efe0", cardInk: "#4a3a12" },
    floralTint: "#caa254", glow: "#ffe1a0", linen: "#ecd6a2",
  },
  "emerald-ivory": {
    palette: { paper: "#ece5d4", foil: "#b6974e", foilBright: "#e7d597", wax: "#123f2b", cardPaper: "#f7f2e6", cardInk: "#173d2b" },
    floralTint: "#cbb888", glow: "#ffe6ad", linen: "#e9dcc0",
  },
};

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

export function buildEnvelope({ style, colors, overrides, content } = {}) {
  // A designer style overrides the theme palette with its own signature look and
  // swaps the arabesque for a floral emboss; "classic"/unknown → theme-driven.
  const preset = (style && STYLE_PRESETS[style]) || null;
  const styled = !!preset;
  // Light cardstock (blush / ivory) needs bright, even light; a dark designer
  // paper (midnight gold) keeps the dim, dramatic classic lighting.
  const lightPaper = styled && preset.light !== false;
  // A styled preset (bloom / royal-*) carries its OWN signature palette; the groom's
  // per-design picks (raw design.envelope hex values in `overrides`) layer ON TOP of
  // it — so an untouched bloom shows its default look and each picked colour wins.
  // Whitelist the hex keys so a picker can never inject arbitrary palette fields.
  const HEX6 = /^#[0-9a-fA-F]{6}$/;
  const ov = overrides && typeof overrides === "object" ? overrides : {};
  const isHex = (x) => typeof x === "string" && HEX6.test(x);
  const picks = {};
  for (const k of ["paper", "wax", "foil", "cardPaper", "cardInk"]) if (isHex(ov[k])) picks[k] = ov[k];
  // The seal emblem + hairline "gold" follows the groom's foil pick: derive its bright
  // catch-light so the pressed دعوة logo takes the chosen gold too.
  if (picks.foil) {
    picks.foilBright = "#" + new THREE.Color(picks.foil).lerp(new THREE.Color("#ffffff"), 0.45).getHexString();
    picks.sealLogo = picks.foilBright;
  }
  const pal = {
    foil: "#d4a07a", foilBright: "#f4d4c4", paper: "#2a211a",
    wax: "#f4ece0", cardPaper: "#f9f6f0", cardInk: "#3a2412",
    ...(styled ? preset.palette : (colors || {})),
    ...(styled ? picks : {}),
  };
  // A different SHAPE (not just a look) routes to its own builder, same contract. Its
  // light/emboss colours (glow = the rays/reveal light, snow = the floral emboss tint,
  // linen = the lining) live on the preset; let the groom override each via
  // design.envelope.{glow,snow,linen}, falling back to the preset default when unset.
  if (preset && preset.shape === "bloom") {
    const presetForBloom = {
      ...preset,
      glow: isHex(ov.glow) ? ov.glow : preset.glow,
      floralTint: isHex(ov.snow) ? ov.snow : preset.floralTint,
      linen: isHex(ov.linen) ? ov.linen : preset.linen,
    };
    return buildEnvelopeBloom({ pal, preset: presetForBloom, content });
  }
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
  // Floral-EMBOSS paper (designer styles): the delicate botanical relief is a
  // procedural NORMAL map over the tinted cardstock, so light rakes across the
  // raised florals like the reference's white-on-white embossing. Soft & matte.
  // A touch of paper-colour emissive lifts the LIGHT cardstock to its true albedo
  // (ACES tone-mapping + grazing key light otherwise mute the pastel to a dusty
  // grey); the directional lights still rake the normal-map florals for relief.
  const floralPaperMat = (fl, dbl) => new THREE.MeshStandardMaterial({
    color: 0xffffff, map: fl.colorTex, normalMap: fl.normalTex,
    normalScale: new THREE.Vector2(1.7, 1.7),
    roughnessMap: grain, roughness: 0.88, metalness: 0.02,
    emissive: col(pal.paper, "#f7e7e8"), emissiveIntensity: 0.17,
    envMap: env, envMapIntensity: 0.05,
    side: dbl ? THREE.DoubleSide : THREE.FrontSide, transparent: true, depthWrite: true,
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
  let paperMat, paperMat2, flapMat;
  if (styled) {
    // Delicate floral emboss across shell + flap. Different repeats keep the
    // sprig SCALE consistent across the box-UV back wall vs the design-unit flap.
    const mkFl = (tintA, rep, boost) => {
      const fl = makeFloral({ paper: pal.paper, tint: preset.floralTint, tintAlpha: tintA, repeat: rep, heightBoost: boost });
      disposables.push(fl.colorTex, fl.normalTex);
      return fl;
    };
    paperMat  = floralPaperMat(mkFl(0.24, [2.1, 1.8], 2.0), true);   // back wall
    paperMat2 = floralPaperMat(mkFl(0.28, [1.15, 1.3], 2.0), true);  // V-pocket
    flapMat   = floralPaperMat(mkFl(0.42, [1.15, 1.3], 2.6), false); // flap focal surface
  } else if (starsEnabled) {
    paperMat = arabMat(mkArab(shellAlpha, 2.2, [1.7 * densF, 1.4 * densF]), 0.4);   // back wall
    paperMat2 = arabMat(mkArab(shellAlpha, 2.2, [0.5 * densF, 0.62 * densF]), 0.4); // V-pocket
    flapMat = arabMat(mkArab(flapAlpha, 2.6, [0.5 * densF, 0.62 * densF]), 0.55);
  } else {
    paperMat = plainPaper(false);
    paperMat2 = plainPaper(true);
    flapMat = plainPaper(false);
  }

  // Flap lining — rich satin silk in a deep contrasting tone with a faint gold
  // arabesque; the luxury "lined envelope" reveal as the flap pivots open.
  // Designer styles line the flap in a LIGHT satin (preset.linen) so the warm
  // inner glow pools on it as the flap opens; classic keeps the deep silk.
  const silkColor = styled
    ? col(preset.linen, "#f0dcdc")
    : col(pal.foil, "#b3a384").clone().lerp(new THREE.Color("#15100a"), 0.5);
  const liningArab = makeArabesque({
    bg: "#" + silkColor.getHexString(), line: pal.foilBright, alpha: styled ? 0.05 : 0.16, lineW: 2.0, cells: 2, repeat: [0.55, 0.6],
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
  // Designer styles use LIGHT cardstock (blush / ivory), so they need far more
  // ambient + fill than the near-black classic jewel paper or they read muddy.
  group.add(new THREE.AmbientLight(lightPaper ? 0xfff3ea : 0x16130d, lightPaper ? 0.82 : 0.16));
  const key = new THREE.DirectionalLight(0xfff1d8, lightPaper ? 0.8 : 1.0); key.position.set(5, 6.5, 5.5); group.add(key);
  const top = new THREE.DirectionalLight(0xfff2dd, lightPaper ? 0.3 : 0.12); top.position.set(0, 8, 3); group.add(top);
  const fill = new THREE.DirectionalLight(lightPaper ? 0xf1e6dc : 0x4a3a28, lightPaper ? 0.45 : 0.07); fill.position.set(-4, -3, 4); group.add(fill);
  // warm back-rim in the theme's foil colour — lifts the gold filigree + jewel paper
  const backRim = new THREE.DirectionalLight(col(pal.foilBright, "#f4d4c4"), 0.20); backRim.position.set(-3, 2, -5); group.add(backRim);
  const rim = new THREE.PointLight(col(pal.foilBright, "#f0c84c"), 0.0, 24 * S, 1); rim.position.set(0, 0.2, 2.4); group.add(rim);
  const sealGlow = new THREE.PointLight(col(pal.foilBright, "#f0c84c"), 0.0, 6 * S, 1); sealGlow.position.set(0, 0, 0.9); group.add(sealGlow);
  // Designer styles: a warm light INSIDE the envelope that pours out as the flap
  // opens — the reference's golden glow spilling from the V-pocket mouth.
  const styleGlow = new THREE.PointLight(styled ? col(preset.glow, "#ffcf9a") : col(pal.foilBright, "#f0c84c"), 0.0, 9 * S, 1);
  styleGlow.position.set(0, 0.15, -0.1); group.add(styleGlow);

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
    // Warm inner glow swells as the flap lifts, then fades with the dissolve.
    styleGlow.intensity = styled ? (0.25 + 3.8 * flap) * (1 - structFade) : 0;
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
const SEAL_TEX_S = 512;
const SEAL_TEX_R = SEAL_TEX_S / 2 - 30;              // 226 — leaves room for the lobes

// A wax seal whose SILHOUETTE *is* the دعوة logo (owner: "شمع ختمي مكبوس عشكل لوجو دعوة،
// مش دائرة وفوقها اللوجو"). The wax jewel-tone fills the logo paths; a soft upper-left
// sheen + dark inner rim make it read as glossy pressed wax molded to the mark.
function makeLogoSealTex(pal) {
  const s = SEAL_TEX_S, c = document.createElement("canvas");
  c.width = c.height = s; const x = c.getContext("2d");
  const cx = s / 2, cy = s / 2;
  const CBX = 93.54, CBY = 73.38, CBW = 260.05, CBH = 264.41; // measured دعوة content bbox
  const ccx = CBX + CBW / 2, ccy = CBY + CBH / 2;
  const sc = (s * 0.9) / Math.max(CBW, CBH);          // fill most of the canvas, small margin
  const paths = BRAND_ICON_PATHS.map((d) => new Path2D(d));
  const waxC = col(pal.wax, "#8a2230");
  const cCenter = waxC.clone().lerp(new THREE.Color("#ffffff"), 0.42).getStyle();
  const cMid    = waxC.getStyle();
  const cRim    = waxC.clone().lerp(new THREE.Color("#000000"), 0.46).getStyle();
  x.save();
  x.translate(cx - ccx * sc, cy - ccy * sc); x.scale(sc, sc);
  // molded wax body (radial jewel gradient), filled to the logo shape
  const rg = x.createRadialGradient(ccx - CBW * 0.22, ccy - CBH * 0.26, CBW * 0.05, ccx, ccy, CBW * 0.78);
  rg.addColorStop(0, cCenter); rg.addColorStop(0.5, cMid); rg.addColorStop(1, cRim);
  x.fillStyle = rg; for (const p of paths) x.fill(p);
  // glossy upper-left sheen (domed-wax highlight)
  x.globalAlpha = 0.55;
  const sh = x.createRadialGradient(ccx - CBW * 0.3, ccy - CBH * 0.32, 0, ccx - CBW * 0.3, ccy - CBH * 0.32, CBW * 0.62);
  sh.addColorStop(0, "rgba(255,250,236,0.95)"); sh.addColorStop(0.5, "rgba(255,248,228,0.14)"); sh.addColorStop(1, "rgba(255,248,228,0)");
  x.fillStyle = sh; for (const p of paths) x.fill(p);
  x.globalAlpha = 1;
  // pressed inner shadow + a bright lit lip on the mark's edges
  x.lineJoin = "round";
  x.lineWidth = CBW * 0.045; x.strokeStyle = "rgba(0,0,0,0.42)"; for (const p of paths) x.stroke(p);
  x.lineWidth = CBW * 0.014; x.strokeStyle = "rgba(255,248,224,0.4)"; for (const p of paths) x.stroke(p);
  x.restore();
  const t = new THREE.CanvasTexture(c); setSRGB(t); return t;
}

// Organic scalloped outline, NORMALIZED (outer radius ~1). MUST be EVEN in `a`
// (cosine-only, no phase) so SEAL_RAD(-a)===SEAL_RAD(a): the geometry rim (built
// y-up) and the baked wax disc (sampled through CanvasTexture flipY) coincide
// exactly — no transparent bites at the rim.
const SEAL_RAD = (a) =>
  1
  + 0.050 * Math.cos(13 * a)
  + 0.028 * Math.cos(3 * a)
  + 0.018 * Math.cos(7 * a)
  + 0.012 * Math.cos(5 * a);

// Deterministic jagged CRACK polyline down the middle, LEFT→RIGHT in normalized
// coords. Endpoints sit on the rim; y-jitter enveloped by sin(pi*f) so it vanishes
// at the rim. Generate ONCE and pass the SAME array to makeSealTex + both
// makeWaxHalf calls so the baked fissure and the geometry seam align.
function sealCrackPoints() {
  const H = (i) => { const v = Math.sin(i * 12.9898 + 78.233) * 43758.5453; return v - Math.floor(v); };
  const N = 13;
  const xL = -SEAL_RAD(Math.PI), xR = SEAL_RAD(0);
  const pts = [[xL, 0]];
  for (let i = 1; i < N; i++) {
    const f = i / N;
    const nx = xL + f * (xR - xL);
    const env = Math.sin(f * Math.PI);
    const ny = ((H(i) * 2 - 1) * 0.13 + 0.045 * Math.sin(i * 2.3)) * env;
    pts.push([nx, ny]);
  }
  pts.push([xR, 0]);
  return pts;
}

// One SCALLOPED HALF wax mesh. side=+1 → top half, side=-1 → bottom half. Both
// share `crackPts`, so they tessellate when closed and split along the jagged seam
// when they part. Each vertex UV-samples the FULL seal texture; Z pushed by a
// shallow dome with ANALYTIC normals (ShapeGeometry has no interior verts, so
// computeVertexNormals can't smooth the dome). Normals assigned AFTER geo.scale so
// applyMatrix4 doesn't denormalize them.
function makeWaxHalf(side, material, o = {}) {
  const { RG = 0.36, domeH = 0.14, arcN = 96, crackPts } = o;
  const R = SEAL_TEX_R, s = SEAL_TEX_S, k = R / s;
  const pts = crackPts;
  const L = pts[0];
  const shape = new THREE.Shape();
  if (side > 0) {
    shape.moveTo(L[0], L[1]);
    for (let i = 1; i < pts.length; i++) shape.lineTo(pts[i][0], pts[i][1]);
    for (let i = 1; i <= arcN; i++) {
      const a = (i / arcN) * Math.PI, rr = SEAL_RAD(a);
      shape.lineTo(Math.cos(a) * rr, Math.sin(a) * rr);
    }
  } else {
    shape.moveTo(L[0], L[1]);
    for (let i = 1; i <= arcN; i++) {
      const a = Math.PI + (i / arcN) * Math.PI, rr = SEAL_RAD(a);
      shape.lineTo(Math.cos(a) * rr, Math.sin(a) * rr);
    }
    for (let i = pts.length - 2; i >= 0; i--) shape.lineTo(pts[i][0], pts[i][1]);
  }
  shape.closePath();

  const geo = new THREE.ShapeGeometry(shape);
  const pos = geo.attributes.position, uv = geo.attributes.uv;
  const nrm = new Float32Array(pos.count * 3);
  for (let i = 0; i < pos.count; i++) {
    const px = pos.getX(i), py = pos.getY(i);
    uv.setXY(i, 0.5 + px * k, 0.5 + py * k);
    const r2 = px * px + py * py;
    const rc = r2 < 1 ? r2 : 1;
    pos.setZ(i, domeH * (1 - rc));
    let nx = 2 * domeH * px, ny = 2 * domeH * py, nz = 1;
    if (r2 >= 1) { nx = 0; ny = 0; }
    const inv = 1 / Math.hypot(nx, ny, nz);
    nrm[i * 3] = nx * inv; nrm[i * 3 + 1] = ny * inv; nrm[i * 3 + 2] = nz * inv;
  }
  pos.needsUpdate = true; uv.needsUpdate = true;
  geo.scale(RG, RG, RG);
  geo.setAttribute("normal", new THREE.BufferAttribute(nrm, 3));
  return new THREE.Mesh(geo, material);
}

function makeSealTex(pal, opts = {}) {
  const s = SEAL_TEX_S, c = document.createElement("canvas");
  c.width = c.height = s; const x = c.getContext("2d");
  const cx = s / 2, cy = s / 2;
  const blob   = !!opts.blob;
  const dome   = opts.dome   != null ? !!opts.dome   : blob;
  const deboss = opts.deboss != null ? !!opts.deboss : blob;
  const R = blob ? SEAL_TEX_R : s / 2 - 6;
  const rad = (a) => (blob ? R * SEAL_RAD(a) : R);
  const waxPath = () => {
    const p = new Path2D(); const N = 240;
    for (let i = 0; i <= N; i++) {
      const a = (i / N) * Math.PI * 2, rr = rad(a);
      const px = cx + Math.cos(a) * rr, py = cy + Math.sin(a) * rr;
      i ? p.lineTo(px, py) : p.moveTo(px, py);
    }
    p.closePath(); return p;
  };
  const disc = waxPath();

  const waxC = col(pal.wax, "#6c5240");
  const cCenter = waxC.clone().lerp(new THREE.Color("#ffffff"), 0.46).getStyle();
  const cMid    = waxC.clone().lerp(new THREE.Color("#ffffff"), 0.08).getStyle();
  const cRim    = waxC.clone().lerp(new THREE.Color("#000000"), 0.42).getStyle();
  const rg = x.createRadialGradient(cx - R * 0.3, cy - R * 0.34, R * 0.05, cx, cy, R * 1.05);
  rg.addColorStop(0, cCenter); rg.addColorStop(0.45, cMid); rg.addColorStop(1, cRim);
  x.fillStyle = rg; x.fill(disc);

  if (blob) {
    x.save(); x.clip(disc);
    x.lineWidth = 26; x.strokeStyle = "rgba(0,0,0,0.34)"; x.stroke(disc);
    const H = (i) => { const v = Math.sin(i * 91.7 + 12.3) * 43758.5; return v - Math.floor(v); };
    for (let i = 0; i < 22; i++) {
      const a = H(i) * 6.283, r = H(i + 9) * R * 0.85;
      const px = cx + Math.cos(a) * r, py = cy + Math.sin(a) * r, rr = 14 + H(i + 3) * 40;
      const g2 = x.createRadialGradient(px, py, 0, px, py, rr);
      const dark = H(i + 5) > 0.5;
      g2.addColorStop(0, dark ? "rgba(0,0,0,0.14)" : "rgba(255,244,220,0.12)");
      g2.addColorStop(1, "rgba(0,0,0,0)");
      x.fillStyle = g2; x.beginPath(); x.arc(px, py, rr, 0, 7); x.fill();
    }
    x.restore();
  }

  if (dome) {
    x.save(); x.clip(disc);
    const sheen = x.createRadialGradient(cx - R * 0.34, cy - R * 0.42, R * 0.02, cx - R * 0.15, cy - R * 0.2, R * 1.15);
    sheen.addColorStop(0, "rgba(255,250,235,0.34)");
    sheen.addColorStop(0.35, "rgba(255,246,224,0.10)");
    sheen.addColorStop(1, "rgba(255,246,224,0)");
    x.fillStyle = sheen; x.fillRect(0, 0, s, s);
    const hot = x.createRadialGradient(cx - R * 0.40, cy - R * 0.46, 0, cx - R * 0.40, cy - R * 0.46, R * 0.34);
    hot.addColorStop(0, "rgba(255,255,250,0.5)"); hot.addColorStop(1, "rgba(255,255,250,0)");
    x.fillStyle = hot; x.fillRect(0, 0, s, s);
    x.restore();
  }

  x.lineWidth = 12; x.strokeStyle = "rgba(255,248,224,0.16)"; x.beginPath(); x.arc(cx, cy, R - 9, 0, 7); x.stroke();
  x.lineWidth = 7;  x.strokeStyle = "rgba(0,0,0,0.55)";       x.beginPath(); x.arc(cx, cy, R - 22, 0, 7); x.stroke();

  const starDeco = (rot, scale, fill) => {
    x.save(); x.translate(cx, cy); x.rotate(rot); x.beginPath();
    for (let i = 0; i < 8; i++) {
      const a = i * Math.PI / 4; const rr = (i % 2 === 0) ? R * 0.5 * scale : R * 0.14 * scale;
      x[i ? "lineTo" : "moveTo"](Math.cos(a) * rr, Math.sin(a) * rr);
    }
    x.closePath(); x.fillStyle = fill; x.fill(); x.restore();
  };
  if (pal.sealStarEnabled) { starDeco(0, 1.0, "rgba(0,0,0,0.45)"); starDeco(0, 0.96, "rgba(255,248,224,0.06)"); }

  // The دعوة brand mark, PRESSED into the wax — centred on the mark's true content
  // bbox (not the padded viewBox) so it sits dead-centre and large but clear of the
  // scalloped rim. Deboss = layered blurred dark recess (upper-left) + a bright lit
  // lip (lower-right) + a metallic gold face with a spec sheen and inner shade.
  const paths = BRAND_ICON_PATHS.map((d) => new Path2D(d));
  const CBX = 93.54, CBY = 73.38, CBW = 260.05, CBH = 264.41;   // measured دعوة content bbox
  const ccx = CBX + CBW / 2, ccy = CBY + CBH / 2;
  const target = R * 1.04;
  const sc = target / Math.max(CBW, CBH);
  const pdx = R * 0.026, pdy = R * 0.032;
  const stamp = (dx, dy, style, blur) => {
    x.save();
    if (blur) { try { x.filter = `blur(${blur}px)`; } catch { /* older canvas: no filter */ } }
    x.translate(cx + dx - ccx * sc, cy + dy - ccy * sc); x.scale(sc, sc);
    x.fillStyle = style;
    for (const p of paths) x.fill(p);
    x.restore();
  };
  if (deboss) {
    stamp(-pdx * 0.4, -pdy * 0.4, "rgba(28,12,8,0.50)", 5);
    stamp(-pdx,       -pdy,       "rgba(0,0,0,0.66)",    3);
    stamp(-pdx * 0.5, -pdy * 0.5, "rgba(0,0,0,0.55)",    0.6);
    stamp( pdx,        pdy,       "rgba(255,247,227,0.62)", 0);
    stamp( pdx * 0.55, pdy * 0.55,"rgba(255,251,236,0.50)", 0);
  } else {
    stamp( pdx,        pdy,       "rgba(0,0,0,0.55)",       0);
    stamp(-pdx * 0.6, -pdy * 0.6, "rgba(255,248,230,0.50)", 0);
  }
  x.save();
  x.translate(cx - ccx * sc, cy - ccy * sc); x.scale(sc, sc);
  const _white = new THREE.Color("#ffffff"), _black = new THREE.Color("#000000");
  const _gold  = col(pal.sealLogo || pal.foilBright || "#f4d4c4");
  const gBright = _gold.clone().lerp(_white, 0.50).getStyle();
  const gMid    = _gold.getStyle();
  const gDeep   = _gold.clone().lerp(_black, 0.32).getStyle();
  const fg = x.createLinearGradient(CBX, CBY, CBX + CBW, CBY + CBH);
  fg.addColorStop(0, gBright); fg.addColorStop(0.5, gMid); fg.addColorStop(1, gDeep);
  x.fillStyle = fg; for (const p of paths) x.fill(p);
  const sp = x.createLinearGradient(CBX, CBY, CBX + CBW * 0.85, CBY + CBH * 0.85);
  sp.addColorStop(0, "rgba(255,252,242,0.50)");
  sp.addColorStop(0.4, "rgba(255,248,228,0.10)");
  sp.addColorStop(1, "rgba(255,248,228,0)");
  x.fillStyle = sp; for (const p of paths) x.fill(p);
  const bd = x.createLinearGradient(CBX + CBW, CBY + CBH, CBX + CBW * 0.25, CBY + CBH * 0.25);
  bd.addColorStop(0, "rgba(50,24,8,0.32)");
  bd.addColorStop(0.5, "rgba(50,24,8,0.08)");
  bd.addColorStop(1, "rgba(50,24,8,0)");
  x.fillStyle = bd; for (const p of paths) x.fill(p);
  x.restore();

  if (opts.crack) {
    const pts = opts.crackPts || sealCrackPoints();
    const toPx = (p) => [cx + p[0] * R, cy - p[1] * R];
    x.save(); x.clip(disc); x.lineJoin = "round"; x.lineCap = "round";
    x.beginPath();
    pts.forEach((p, i) => { const [px, py] = toPx(p); i ? x.lineTo(px, py) : x.moveTo(px, py); });
    x.strokeStyle = "rgba(0,0,0,0.5)"; x.lineWidth = 6; x.stroke();
    x.beginPath();
    pts.forEach((p, i) => { const [px, py] = toPx(p); i ? x.lineTo(px, py - 3) : x.moveTo(px, py - 3); });
    x.strokeStyle = "rgba(255,246,225,0.35)"; x.lineWidth = 2; x.stroke();
    x.restore();
  }

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

// A warm glow STRIP texture: brightest at the seam's CENTRE (seal) end, fading
// toward the corner, with a tight Gaussian core across its width. White RGB so the
// material's warm `color` tints it; additive. Deterministic.
function makeSeamGlowTex() {
  const w = 256, h = 64, c = document.createElement("canvas");
  c.width = w; c.height = h;
  const x = c.getContext("2d");
  const img = x.createImageData(w, h), d = img.data;
  for (let yy = 0; yy < h; yy++) {
    const ty = (yy / (h - 1)) * 2 - 1;
    const across = Math.exp(-(ty * ty) / 0.10);
    for (let xx = 0; xx < w; xx++) {
      const u = xx / (w - 1);
      // Ray runs the FULL length of the seam (bright to the corner, only a soft
      // fall-off at the very tip) so it extends along the whole shadow.
      const along = 0.68 + 0.32 * Math.pow(1 - u, 0.6);
      const a = Math.max(0, Math.min(255, 255 * across * along));
      const i = (yy * w + xx) * 4;
      d[i] = d[i + 1] = d[i + 2] = 255; d[i + 3] = a;
    }
  }
  x.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(c);
  t.needsUpdate = true;
  return t;
}

// A soft CONTACT-SHADOW strip texture (white RGB, alpha = shadow density): darkest
// along the seam edge (v→1), fading across the strip + tapering to nothing toward
// the corner end. Tinted dark by the material `color`; NormalBlending. Deterministic.
function makeShadowTex() {
  const w = 128, h = 64, c = document.createElement("canvas");
  c.width = w; c.height = h;
  const x = c.getContext("2d");
  const img = x.createImageData(w, h), d = img.data;
  const PEAK = 0.38;
  const ss = (e0, e1, t) => { const u = clamp01((t - e0) / (e1 - e0)); return u * u * (3 - 2 * u); };
  for (let yy = 0; yy < h; yy++) {
    const v = 1 - yy / (h - 1);
    const across = ss(0.0, 0.16, v) * Math.pow(clamp01((1 - v) / 0.84), 1.4);
    for (let xx = 0; xx < w; xx++) {
      const u = xx / (w - 1);
      const along = ss(0.0, 0.12, u) * ss(0.0, 0.50, 1 - u);
      const a = clamp01(across * along) * PEAK;
      const i = (yy * w + xx) * 4;
      d[i] = d[i + 1] = d[i + 2] = 255;
      d[i + 3] = Math.round(a * 255);
    }
  }
  x.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(c);
  t.needsUpdate = true;
  return t;
}

// ── FLORAL EMBOSS (designer styles) ──────────────────────────────────────────
// A delicate botanical relief for the paper: white-on-white embossing like the
// reference. Returns a colour texture (tinted paper + faint florals) and a
// NORMAL map derived from a blurred floral heightfield, so light rakes over the
// raised sprigs. Deterministic (no Math.random) — keeps the build replay-safe.
function drawGarden(ctx, color, alpha, lw, s) {
  ctx.save();
  ctx.strokeStyle = color; ctx.fillStyle = color;
  ctx.lineCap = "round"; ctx.lineJoin = "round";
  const R = (i) => { const v = Math.sin(i * 12.9898 + 78.233) * 43758.5453; return v - Math.floor(v); };
  const W = Math.max(1, lw || 1.6);
  const TAU = Math.PI * 2;

  // A 6-fold SNOWFLAKE crystal (owner: "ثلج متساقط محل الورد عالمكتوب"): a central hub,
  // six main arms, each with paired side-branchlets + a terminal V, and little pearls at
  // the tips/centre for emboss relief. Fine strokes read as delicate frosted ridges.
  const flake = (x, y, r, rot, a, branch) => {
    ctx.save(); ctx.translate(x, y); ctx.rotate(rot); ctx.globalAlpha = a;
    ctx.lineWidth = Math.max(W, r * 0.05);
    for (let k = 0; k < 6; k++) {
      ctx.save(); ctx.rotate(k * (TAU / 6));
      ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(0, -r); ctx.stroke();       // main arm
      for (let bi = 0; bi < branch; bi++) {                                     // side branchlets
        const t = 0.34 + bi * (0.52 / Math.max(1, branch));
        const by = -r * t, bl = r * (0.28 - t * 0.16);
        ctx.beginPath();
        ctx.moveTo(0, by); ctx.lineTo(bl, by - bl * 0.9);
        ctx.moveTo(0, by); ctx.lineTo(-bl, by - bl * 0.9);
        ctx.stroke();
      }
      const tv = r * 0.17;                                                      // terminal V
      ctx.beginPath();
      ctx.moveTo(0, -r + tv); ctx.lineTo(tv * 0.6, -r);
      ctx.moveTo(0, -r + tv); ctx.lineTo(-tv * 0.6, -r);
      ctx.stroke();
      ctx.beginPath(); ctx.arc(0, -r, Math.max(1, r * 0.05), 0, TAU); ctx.fill(); // tip pearl
      ctx.restore();
    }
    ctx.beginPath(); ctx.arc(0, 0, r * 0.12, 0, TAU); ctx.fill();               // centre hub
    ctx.restore();
  };

  const speck = (x, y, r, a) => {                                              // fine drifting snow
    ctx.save(); ctx.globalAlpha = a;
    ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill();
    ctx.restore();
  };

  // FALLING-SNOW scatter: a few large + several medium crystals at varied sizes/angles,
  // seeded with fine specks — like drifting snow. Deterministic + seamless-tiling.
  const paint = () => {
    const bigs = [[0.22, 0.20], [0.72, 0.32], [0.44, 0.60], [0.82, 0.80], [0.14, 0.84], [0.58, 0.90]];
    for (let i = 0; i < bigs.length; i++) {
      const seed = i * 7 + 3;
      const x = bigs[i][0] * s + (R(seed) - 0.5) * s * 0.1;
      const y = bigs[i][1] * s + (R(seed + 1) - 0.5) * s * 0.1;
      const r = s * (0.066 + R(seed + 2) * 0.05);
      flake(x, y, r, R(seed + 3) * TAU, alpha, 3);
    }
    for (let i = 0; i < 7; i++) {                                              // medium flakes
      const x = R(i * 5 + 40) * s, y = R(i * 5 + 41) * s;
      const r = s * (0.026 + R(i * 5 + 42) * 0.02);
      flake(x, y, r, R(i * 5 + 43) * TAU, alpha * 0.9, 2);
    }
    for (let i = 0; i < 24; i++) {                                             // fine specks
      speck(R(i * 3 + 70) * s, R(i * 3 + 71) * s, Math.max(1.2, s * 0.006 * (0.6 + R(i * 3 + 72))), alpha * 0.6);
    }
  };

  // Paint at all 9 tile offsets so motifs wrap seamlessly under RepeatWrapping.
  for (let oy = -1; oy <= 1; oy++) {
    for (let ox = -1; ox <= 1; ox++) {
      ctx.save(); ctx.translate(ox * s, oy * s); paint(); ctx.restore();
    }
  }
  ctx.restore();
}

function heightToNormal(heightCanvas, strength = 2) {
  const s = heightCanvas.width;
  const hd = heightCanvas.getContext("2d").getImageData(0, 0, s, s).data;
  const nc = document.createElement("canvas"); nc.width = nc.height = s;
  const nx = nc.getContext("2d"); const nimg = nx.createImageData(s, s); const nd = nimg.data;
  const at = (x, y) => hd[(((y % s + s) % s) * s + ((x % s + s) % s)) * 4]; // red channel, wrapped
  for (let y = 0; y < s; y++) {
    for (let x = 0; x < s; x++) {
      const dx = (at(x + 1, y) - at(x - 1, y)) / 255 * strength;
      const dy = (at(x, y + 1) - at(x, y - 1)) / 255 * strength;
      let nX = -dx, nY = -dy; const nZ = 1;
      const inv = 1 / Math.hypot(nX, nY, nZ);
      nX *= inv; nY *= inv;
      const i = (y * s + x) * 4;
      nd[i] = (nX * 0.5 + 0.5) * 255;
      nd[i + 1] = (nY * 0.5 + 0.5) * 255;
      nd[i + 2] = (nZ * inv * 0.5 + 0.5) * 255;
      nd[i + 3] = 255;
    }
  }
  nx.putImageData(nimg, 0, 0);
  return nc;
}

function makeFloral({ paper, tint, tintAlpha = 0.3, repeat = [1, 1], heightBoost = 2 }) {
  const s = 512;
  const mk = () => { const c = document.createElement("canvas"); c.width = c.height = s; return c; };
  // Colour map: paper base + faint tinted florals (the relief carries the look).
  const cc = mk(); const xc = cc.getContext("2d");
  xc.fillStyle = paper || "#f2dcdd"; xc.fillRect(0, 0, s, s);
  drawGarden(xc, tint || "#e6c2c3", tintAlpha, 1.6, s);
  // Height map: mid-grey ground, white raised florals, softly blurred so the
  // emboss has rounded shoulders rather than hard walls.
  const hc = mk(); const xh = hc.getContext("2d");
  xh.fillStyle = "#7c7c7c"; xh.fillRect(0, 0, s, s);
  try { xh.filter = "blur(1.35px)"; } catch { /* older canvas: no blur */ }
  drawGarden(xh, "#ffffff", 1.0, 2.0, s);
  try { xh.filter = "none"; } catch { /* ignore */ }
  const nc = heightToNormal(hc, heightBoost);
  const tex = (canvas, srgb) => {
    const t = new THREE.CanvasTexture(canvas);
    if (srgb) setSRGB(t);
    t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(repeat[0], repeat[1]);
    return t;
  };
  return { colorTex: tex(cc, true), normalTex: tex(nc, false) };
}

// ── BLOOM SHAPE ──────────────────────────────────────────────────────────────
// A genuinely different envelope FORM (not a recolour): a portrait envelope whose
// four triangular flaps tile an X and fold OUTWARD from the centre — like the
// reference — revealing the invitation card with a warm glow. Same contract as
// buildEnvelope so the engine drives it identically.
function makeStudioEnvB(disposables) {
  const c = document.createElement("canvas"); c.width = 48; c.height = 256;
  const x = c.getContext("2d");
  const gr = x.createLinearGradient(0, 0, 0, 256);
  gr.addColorStop(0.0, "#fff7e6"); gr.addColorStop(0.18, "#f0dcc0");
  gr.addColorStop(0.5, "#8a7860"); gr.addColorStop(1.0, "#3a3026");
  x.fillStyle = gr; x.fillRect(0, 0, 48, 256);
  x.fillStyle = "rgba(255,250,235,0.95)"; x.fillRect(0, 22, 48, 16);
  const t = new THREE.CanvasTexture(c);
  t.mapping = THREE.EquirectangularReflectionMapping; setSRGB(t);
  disposables.push(t); return t;
}
function makeLinenGrainB(disposables) {
  const sz = 256, c = document.createElement("canvas"); c.width = c.height = sz;
  const x = c.getContext("2d"); const img = x.createImageData(sz, sz), d = img.data;
  for (let yy = 0; yy < sz; yy++) for (let xx = 0; xx < sz; xx++) {
    const i = (yy * sz + xx) * 4;
    const weave = (Math.sin(xx * 0.55) + Math.sin(yy * 0.55)) * 7;
    const n = ((Math.sin((yy * sz + xx) * 12.9898) * 43758.5453) % 1) * 14 - 7;
    const v = Math.max(0, Math.min(255, 210 + weave + n));
    d[i] = d[i + 1] = d[i + 2] = v; d[i + 3] = 255;
  }
  x.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(2.5, 2.5);
  disposables.push(t); return t;
}
function bloomFlap(pts, mats) {
  const s = new THREE.Shape();
  s.moveTo(pts[0][0], pts[0][1]); s.lineTo(pts[1][0], pts[1][1]); s.lineTo(pts[2][0], pts[2][1]); s.closePath();
  // Thick cardstock: real depth + a soft bevel so each flap edge catches light
  // like a substantial pressed board (not a thin sheet). Two materials — the
  // floral face (group 0) and a pale paper EDGE for the extruded walls (group 1),
  // so the visible thickness reads as premium cardstock, not a dark seam.
  const g = new THREE.ExtrudeGeometry(s, { depth: 0.08, bevelEnabled: true, bevelThickness: 0.012, bevelSize: 0.01, bevelSegments: 2 });
  g.computeVertexNormals();
  return new THREE.Mesh(g, mats);
}

function buildEnvelopeBloom({ pal, preset, content } = {}) {
  const glowCol = col(preset && preset.glow, "#ffcf9a");
  const linenCol = col(preset && preset.linen, "#f6e6e6");

  const group = new THREE.Group();
  const S = 3.0; group.scale.setScalar(S);
  let disposed = false;
  const disposables = [];
  const env = makeStudioEnvB(disposables);
  const grain = makeLinenGrainB(disposables);

  const HW = 0.94, HH = 1.94; // tall portrait — fills the phone screen edge-to-edge

  const fl = makeFloral({ paper: pal.paper, tint: preset && preset.floralTint, tintAlpha: 0.34, repeat: [1.0, 1.4], heightBoost: 3.0 });
  disposables.push(fl.colorTex, fl.normalTex);
  // Pronounced matte pressed-cardstock: ornate rose emboss (normalMap) over a strong
  // paper tooth (bumpMap:grain), no gloss, a whisper of envMap, blush emissive lift for ACES.
  const flapMat = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    map: fl.colorTex,
    normalMap: fl.normalTex, normalScale: new THREE.Vector2(1.5, 1.5), // ornate rose emboss
    bumpMap: grain, bumpScale: 0.02,                                    // stronger paper-fibre tooth
    roughnessMap: grain, roughness: 0.95,                              // no gloss, uneven sheen
    metalness: 0.0,
    emissive: col(pal.paper, "#f7e7e8"), emissiveIntensity: 0.16,       // ACES blush lift
    envMap: env, envMapIntensity: 0.05,                                 // a whisper of life
    side: THREE.DoubleSide, transparent: false, depthWrite: true,
  });
  flapMat.map.anisotropy = 8;                                          // crisp florals at grazing angles
  // Pale matte edge for the extruded cardstock walls (group 1) — a lifted-emissive
  // paper so the flap thickness reads as a bright pressed-board edge, never a dark
  // seam where the flaps taper to a point.
  const edgeMat = new THREE.MeshStandardMaterial({
    color: col(pal.paper, "#f7e7e8"),
    bumpMap: grain, bumpScale: 0.010,
    roughnessMap: grain, roughness: 0.92, metalness: 0.0,
    emissive: col(pal.paper, "#f7e7e8"), emissiveIntensity: 0.42,
    side: THREE.DoubleSide, transparent: false, depthWrite: true,
  });

  // Inner back — revealed as the flaps open, then fades with the structure at the
  // end. NO invitation card: the flaps open and the structure dissolves straight
  // into the REAL invitation (the owner asked for the دعوة directly, not a paper).
  const backMat = new THREE.MeshStandardMaterial({ color: linenCol, roughness: 0.72, metalness: 0, emissive: linenCol, emissiveIntensity: 0.16, transparent: true, depthWrite: true });
  const back = new THREE.Mesh(new THREE.BoxGeometry(HW * 2, HH * 2, 0.06), backMat);
  back.position.z = -0.14; group.add(back);

  // FULL interior LIGHT (owner: "خلف المكتوب كله ضو مش X"): a big warm additive glow
  // sitting just behind the flaps. The closed opaque flaps occlude it; as each flap
  // opens it's revealed in that flap's area, so the interior reads as a growing FULL
  // light (not four X streaks) — and fills the screen once all four are open.
  const innerTex = sprite("glow"); disposables.push(innerTex);
  const innerMat = new THREE.MeshBasicMaterial({ map: innerTex, color: glowCol, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending });
  const innerLight = new THREE.Mesh(new THREE.PlaneGeometry(HW * 4.4, HH * 4.4), innerMat);
  innerLight.position.set(0, 0, 0.0); innerLight.renderOrder = 2; group.add(innerLight);

  // Four flaps tiling the rectangle in an X (two diagonals), hinged at outer edges.
  // A foil hairline on each flap's edges makes the X seams + border read (like a
  // real envelope back) and rides with the flap as it folds.
  const zt = 0.05;
  const edges = [];
  const addFlap = (pivot, pts) => {
    const m = bloomFlap(pts, [flapMat, edgeMat]);
    const e = new THREE.LineSegments(
      new THREE.EdgesGeometry(m.geometry, 20),
      new THREE.LineBasicMaterial({ color: col(pal.foil, "#c98a90"), transparent: true, opacity: 0.55, depthWrite: false }),
    );
    e.renderOrder = 3; e.material.userData.base = 0.55; m.add(e); edges.push(e); pivot.add(m); return m;
  };
  // z-order: side flaps BEHIND, then bottom, then TOP frontmost — so the top &
  // bottom triangles overlap the two side triangles (like a real envelope back).
  // The top & bottom apexes reach PAST centre (by OVER) so their slant edges cover
  // a visible sliver of the side flaps — the overlap reads clearly, not a flush tile.
  const OVER = HH * 0.1;
  const leftPivot = new THREE.Group(); leftPivot.position.set(-HW, 0, zt); group.add(leftPivot);
  const leftFlap = addFlap(leftPivot, [[0, -HH], [0, HH], [HW, 0]]);
  const rightPivot = new THREE.Group(); rightPivot.position.set(HW, 0, zt + 0.02); group.add(rightPivot);
  const rightFlap = addFlap(rightPivot, [[0, -HH], [0, HH], [-HW, 0]]);
  const botPivot = new THREE.Group(); botPivot.position.set(0, -HH, zt + 0.06); group.add(botPivot);
  addFlap(botPivot, [[-HW, 0], [HW, 0], [0, HH + OVER]]);
  const topPivot = new THREE.Group(); topPivot.position.set(0, HH, zt + 0.1); group.add(topPivot);
  addFlap(topPivot, [[-HW, 0], [HW, 0], [0, -HH - OVER]]);

  // Professional CONTACT SHADOW: the raised top & bottom flaps cast a soft shadow
  // onto the side flaps beneath, along the four X seams — so it clearly reads that
  // top/bottom sit ABOVE the sides. Baked strips parented to the side flaps; each
  // fades + slides as its caster flap lifts (driven in applyVisual), gone once open.
  const SHADOW_W     = 0.34;
  const SHADOW_SLIDE = 0.06;
  const SHADOW_Z     = 0.10;
  const SHADOW_COL   = 0x140d05;
  const shadowTex = makeShadowTex(); disposables.push(shadowTex);
  const shadows = [];
  const mkShadow = (flap, S0, S1, centroid, caster) => {
    const dx = S1[0] - S0[0], dy = S1[1] - S0[1];
    const L = Math.hypot(dx, dy);
    const ux = dx / L, uy = dy / L;
    let nx = -uy, ny = ux;
    const inwardDot = nx * (centroid[0] - S0[0]) + ny * (centroid[1] - S0[1]);
    const flipY = inwardDot < 0 ? -1 : 1;
    if (flipY < 0) { nx = -nx; ny = -ny; }
    const geo = new THREE.PlaneGeometry(L, SHADOW_W, 1, 1);
    geo.translate(L / 2, SHADOW_W / 2, 0);
    const mat = new THREE.MeshBasicMaterial({
      map: shadowTex, color: SHADOW_COL, transparent: true, opacity: 0,
      depthWrite: false, depthTest: true,
      blending: THREE.NormalBlending, side: THREE.DoubleSide,
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.rotation.z = Math.atan2(uy, ux);
    mesh.scale.set(1, flipY, 1);
    mesh.position.set(S0[0], S0[1], SHADOW_Z);
    mesh.renderOrder = 4;
    flap.add(mesh);
    shadows.push({ mesh, mat, caster, sx: S0[0], sy: S0[1], inx: nx, iny: ny, flipY });
    return mesh;
  };
  mkShadow(leftFlap,  [ HW, 0], [0,  HH], [ HW / 3, 0], "top");
  mkShadow(leftFlap,  [ HW, 0], [0, -HH], [ HW / 3, 0], "rest");
  mkShadow(rightFlap, [-HW, 0], [0,  HH], [-HW / 3, 0], "top");
  mkShadow(rightFlap, [-HW, 0], [0, -HH], [-HW / 3, 0], "rest");

  // A REAL pressed-wax seal that CRACKS IN TWO: two scalloped half-meshes sharing a
  // jagged crack seam, the logo debossed on top. They part + fade on tap.
  const crackPts = sealCrackPoints();
  const sealTex = makeSealTex(pal, { blob: true, dome: true, deboss: true });
  disposables.push(sealTex);
  const sealMat = new THREE.MeshPhysicalMaterial({
    color: 0xffffff, map: sealTex, metalness: 0.0, roughness: 0.20,
    clearcoat: 1.0, clearcoatRoughness: 0.10, envMap: env, envMapIntensity: 1.3,
    transparent: true, depthWrite: true, side: THREE.DoubleSide,
  });
  const sealGroup = new THREE.Group();
  sealGroup.position.set(0, 0, zt + 0.2); group.add(sealGroup);
  const sealTopH = makeWaxHalf(+1, sealMat, { crackPts, RG: 0.28 });
  const sealBotH = makeWaxHalf(-1, sealMat, { crackPts, RG: 0.28 });
  sealTopH.renderOrder = sealBotH.renderOrder = 5;
  sealGroup.add(sealTopH, sealBotH);

  group.add(new THREE.AmbientLight(0xfff3ea, 0.82));
  const key = new THREE.DirectionalLight(0xfff1d8, 0.8); key.position.set(4, 6, 6.5); group.add(key);
  const fill = new THREE.DirectionalLight(0xf1e6dc, 0.4); fill.position.set(-4, -2, 5); group.add(fill);
  const innerGlow = new THREE.PointLight(glowCol, 0.0, 9 * S, 1); innerGlow.position.set(0, 0.1, -0.15); group.add(innerGlow);
  // NO more X strips — the visible light is the FULL interior glow (above) + a wide
  // top beam (below). Four warm PointLights stay to backlight the revealed interior.
  const mkSeamLight = (cx, cy) => {
    const l = new THREE.PointLight(glowCol, 0.0, 8 * S, 1);
    l.position.set(cx * HW * 0.42, cy * HH * 0.42, -0.05);
    group.add(l); return l;
  };
  const seamLights = [
    { lt: mkSeamLight(-1,  1), kind: "top" },
    { lt: mkSeamLight( 1,  1), kind: "top" },
    { lt: mkSeamLight(-1, -1), kind: "rest" },
    { lt: mkSeamLight( 1, -1), kind: "rest" },
  ];
  // Two STRONG rays escaping the top triangle's edges, each AIMED down its upper diagonal
  // ONTO a side triangle (owner: "شعاع قوي… متجه على المثلثات الي عالجوانب"). Biased toward
  // the side flap (not over the top flap, so the top flap stays legible during the pause).
  // Additive, in FRONT (never occluded), growing with the top flap's open.
  const beamTex = sprite("glow"); disposables.push(beamTex);
  const diagLen = Math.hypot(HW, HH);
  const mkSideRay = (sx) => {
    const m = new THREE.MeshBasicMaterial({ map: beamTex, color: glowCol, transparent: true, opacity: 0, depthWrite: false, depthTest: false, blending: THREE.AdditiveBlending });
    // A glow stretched ALONG the shared upper diagonal (centre → top corner) and centred
    // right ON that diagonal — the edge the side triangle SHARES with the top triangle. Its
    // soft spread spills onto the side triangle so, as the top flap lifts, the side triangle's
    // upper edge visibly lights up (owner: "الضوء فوق أطراف المثلثين الجانبيين المجاورة للمثلث").
    const geo = new THREE.PlaneGeometry(diagLen * 1.28, HH * 0.6);
    const mesh = new THREE.Mesh(geo, m);
    // unit vector perpendicular to the diagonal, pointing INTO the side triangle (away from
    // the top flap) — nudge the glow slightly that way so it lands on the side flap, not the top.
    const px = (sx * HH) / diagLen, py = (-HW) / diagLen;
    const push = HH * 0.1;
    mesh.position.set(sx * HW * 0.5 + px * push, HH * 0.5 + py * push, zt + 0.06);
    mesh.rotation.z = Math.atan2(HH, sx * HW);       // aligned with the upper diagonal
    mesh.renderOrder = 8; group.add(mesh);
    return { mesh, mat: m };
  };
  const sideRayL = mkSideRay(-1), sideRayR = mkSideRay(1);

  const A_OPEN = Math.PI * 0.9;   // ~162° — flaps fold fully UP/OUTWARD like petals
  // ease-in-out for a gentle, gradual "شوي شوي" fold (no snappy start).
  const smooth = (x) => { const c = clamp01(x); return c < 0.5 ? 2 * c * c : 1 - Math.pow(-2 * c + 2, 2) / 2; };
  // The TOP flap cracks a TINY sliver at the edges (just enough for the ray to leak),
  // HOLDS suspended ~2s, then OPENS fully up (owner: "يفتح نتفة الحواف بس وتطلع دغري
  // الشعاع… ويضل ثانيتين معلق وبعدها بكمل"): 0→0.08 tiny, hold at 0.08, then 0.08→1.
  const pausedRise = (x) => {
    const c = clamp01(x);
    if (c < 0.09) return 0.18 * smooth(c / 0.09);       // small edge open — rays shoot out
    if (c < 0.165) return 0.18;                          // HOLD suspended (~1s — half the old pause)
    return 0.18 + 0.82 * smooth((c - 0.165) / 0.835);    // then OPEN slowly, filling the timeline
  };

  function applyVisual(t) {
    const tt = clamp01(t);
    // Timeline (normalized; DURATION 16s → true slow-motion):
    //   wax cracks 0.02→0.09 · TOP flap 0.10→0.46 · other three 0.50→0.86 · dissolve 0.88→1
    const frac  = ease(clamp01(tt / 0.06));            // legacy handle (returned)
    // Seal cracks + vanishes FIRST; only THEN does the top flap begin (owner:
    // "أول ما يختفي الختم يبلش المثلث الي فوق"). Top rises with a small-open→hold→rise.
    const topF  = pausedRise(clamp01((tt - 0.11) / 0.72)); // opens SLOWLY across the timeline
    const restF = smooth(clamp01((tt - 0.30) / 0.42));     // the OTHER three open WITH the top (faster)
    const diss  = ease(clamp01((tt - 0.65) / 0.08));       // the flaps MELT AWAY (fade) as they finish
                                                           // opening instead of splaying + lingering — so on a
                                                           // WIDE desktop screen (where they don't clip off the
                                                           // edges like on a phone) they still DISAPPEAR at the
                                                           // same moment, then the engine hands off at HANDOFF_AT
                                                           // and the invitation opens instantly (owner: "زي التلفون
                                                           // — أول ما تختفي المثلثات دغري تفتح الدعوة").

    // The TOP flap LIFTS straight UP the screen (with only a slight forward tilt for
    // volume) — an unmistakable "opening UP", never sliding/folding BACKWARD (owner:
    // "يفتح لفوق ومش يرجع لورا"). As it rises it uncovers the full-length rays beneath.
    topPivot.rotation.x   = -0.55 * topF;        // slight forward tilt (volume, faces the viewer)
    topPivot.position.y   =  HH + 2.4 * topF;    // rises UP the screen (stays legible, then off top)
    botPivot.rotation.x   = -A_OPEN * restF;
    leftPivot.rotation.y  = -A_OPEN * restF;
    rightPivot.rotation.y =  A_OPEN * restF;

    // Wax seal: CRACKS within ~1s of the tap, halves part fast, then the whole seal
    // FADES OUT cleanly — FULLY gone (~1.3s) BEFORE the top flap opens, so no seal
    // shadow ever lingers above the ray (owner: "خلال ثانية ينكسر ويختفي بدون آثار").
    // Wax seal CRACKS IN TWO on tap: the halves part + tip forward, then fade — fully
    // gone BEFORE the top flap opens.
    const crackSnap = ease(clamp01((tt - 0.01) / 0.045));  // sharp fracture instant
    const split     = smooth(clamp01((tt - 0.02) / 0.08)); // halves part fast
    const sealFade  = ease(clamp01((tt - 0.03) / 0.05));   // then vanish
    sealGroup.visible = sealFade < 0.999;
    sealGroup.scale.setScalar(1 + 0.02 * Math.sin(crackSnap * Math.PI)); // tiny jolt, NOT a shrink
    const sep  = 0.30 * split;
    const fwd  = 0.16 * split;
    const tip  = 0.42 * split;
    const roll = 0.09 * split;
    sealTopH.position.set(0,  sep, fwd);         sealTopH.rotation.set( tip, 0,  roll);
    sealBotH.position.set(0, -sep, fwd * 0.96);  sealBotH.rotation.set(-tip, 0, -roll);

    // Opacity: flaps stay opaque until the dissolve; the seal fades right after the press
    // (opaque flip only for the flaps, whose overlap would otherwise darken).
    const op = 1 - diss;
    const wantT = diss > 0.0001;
    if (flapMat.transparent !== wantT) { flapMat.transparent = wantT; flapMat.needsUpdate = true; }
    if (edgeMat.transparent !== wantT) { edgeMat.transparent = wantT; edgeMat.needsUpdate = true; }
    flapMat.opacity = op; edgeMat.opacity = op; backMat.opacity = op;
    sealMat.opacity = (1 - sealFade) * op;             // press → then dissolve
    for (const e of edges) e.material.opacity = (e.material.userData.base || 0.55) * op;

    // Light from ALL FOUR flap edges: begins with the TOP flap, GROWS as more flaps
    // open, largest at full reveal, then eases on the dissolve.
    const union = (a, b) => 1 - (1 - a) * (1 - b);
    const fTop  = union(topF, restF);     // top ∪ side  — lights FIRST
    const fRest = restF * (2 - restF);    // rest ∪ rest — grows later
    // The ray must appear IMMEDIATELY at the tiny edge-crack, then keep GROWING as the
    // flap opens further — so front-load the top seams, but still climb to full.
    // The beam grows WITH the flap (linear), so at the tiny-crack + pause it's only a
    // soft ray beside the top flap and does NOT wash it out — the flap stays visible
    // (owner: "الشعاع ما يأثّر على المثلث ويضلّ يبين عادي"). It builds to full as it opens.
    const rayTop = fTop;
    const fade  = 1 - diss;
    let totalF = 0;
    for (const { lt, kind } of seamLights) {
      const fi = (kind === "top" ? rayTop : fRest) * fade;
      totalF += fi;
      lt.intensity = 0.15 + 3.4 * fi;
    }
    // Interior light — a warm glow revealed as the flaps open (occluded when closed).
    // The full-screen wash is a BRIEF CLIMAX, not a long build: it stays a SOFT backing
    // glow through the whole open, then flares to its brightest only in the final ~1s as
    // the flaps vanish, so the whole screen only lights up for about a second (owner:
    // "الضو الي ببين بكل الشاشة خليه بس لمدة ثانية").
    const openMax = Math.max(topF, restF);
    const revealF = smooth(clamp01(openMax / 0.14));       // present once the flaps crack open
    const flareF  = smooth(clamp01((tt - 0.60) / 0.05));   // flares bright just as the flaps melt away
    innerMat.opacity = (0.15 + 0.53 * flareF) * revealF * fade;
    // Two STRONG side-rays aimed onto the side triangles — grow WITH the top flap (soft at
    // the crack so the flap stays legible, strong as it opens). They sit off the top-flap
    // face so they light the SIDE flaps, not wash the top one.
    const beamF = rayTop * fade;
    const beamO = Math.min(1, 1.35 * beamF);
    sideRayL.mat.opacity = beamO; sideRayR.mat.opacity = beamO;
    const bs = 0.7 + 0.45 * beamF;
    sideRayL.mesh.scale.set(bs, bs, 1); sideRayR.mesh.scale.set(bs, bs, 1);
    // Contact shadows are a SEALED-STATE depth cue: each stays until ITS flap opens.
    // The TWO TOP shadows fade as the TOP flap opens; the TWO BOTTOM shadows remain
    // until the other three open (owner: "لما يفتح المثلث الفوقاني بس الظلين الفوقانيين
    // يختفوا والتحتانيين يضلّوا، ولما تفتح الثلاثة يختفي الظل").
    for (const sh of shadows) {
      const cF = sh.caster === "top" ? topF : restF;
      const k = (1 - smooth(clamp01(cF / 0.5))) * (1 - diss);
      sh.mat.opacity = k;
      sh.mesh.visible = k > 0.002;
    }
    // Central junction glow: seam-total reveal PLUS a brief golden pulse at the crack
    // instant ("seal breaks → light escapes"). Single merged driver for innerGlow.
    innerGlow.intensity = (0.30 + 0.72 * totalF) * (1 - 0.6 * diss)
                        + 1.6 * crackSnap * (1 - ease(clamp01((tt - 0.09) / 0.12)));

    return { frac, fold: Math.max(topF, restF), rise: diss };
  }

  // Sealed: fill the screen (cover = the tighter dimension fills). The envelope
  // does NOT shrink while opening (owner's request) — the camera holds; only a
  // gentle push-IN on the final dissolve toward the revealed invitation.
  function framing(t, fov, aspect) {
    const tn = Math.tan(((fov || 34) * Math.PI / 180) / 2);
    // Only a LANDSCAPE / wide screen (a desktop) gets the tidy centred portrait column;
    // EVERY portrait screen — a phone, even ~0.6 aspect once the browser chrome shows —
    // keeps the full-screen cover fit, edge-to-edge (owner: "بالتلفون بدي المكتوب عكامل
    // الشاشة"). A raw cover fit on a wide screen is width-constrained and blows the
    // portrait envelope up ~3–4× (cropped + "weird"), so wide screens clamp the aspect to
    // the envelope's own portrait ratio + a little breathing room.
    const realAsp = aspect || 1;
    const wide = realAsp > 0.85;
    const asp = wide ? HW / HH : realAsp;
    const margin = wide ? 1.14 : 1.0;
    const cover = Math.min(HH / tn, HW / (tn * asp)) * margin;
    const tc = clamp01(t);
    const diss = ease(clamp01((tc - 0.65) / 0.08));
    // Sealed = dead head-on. As the flaps open, the camera RISES + looks down into a
    // gentle 3/4 view so the top flap is clearly seen LIFTING up in 3-D (a pure
    // head-on camera only ever looks INTO the opening). Settles back head-on on the
    // dissolve so the invitation hands off flat.
    return { y: 0, z: cover * (1 - 0.08 * diss) * S, lookAtY: 0 };
  }

  applyVisual(0);

  function dispose() {
    if (disposed) return; disposed = true;
    group.traverse((o) => {
      if (o.geometry) o.geometry.dispose();
      if (o.material) {
        const mats = Array.isArray(o.material) ? o.material : [o.material];   // flaps carry [face, edge]
        for (const m of mats) { for (const k of ["map", "normalMap", "roughnessMap", "metalnessMap", "envMap"]) if (m[k] && m[k].dispose) m[k].dispose(); m.dispose(); }
      }
    });
    for (const d of disposables) { try { d.dispose(); } catch { /* ignore */ } }
  }

  return {
    group, REVEAL_AT: 0.11, DURATION: 16.0, // true slow-motion, graceful petal-like open
    // The moment the flaps VANISH (openT 0.89), hand off to the invitation DIRECTLY — no white
    // page, no lingering tail, no camera glide. HANDOFF_AT fires the hand-off just after the
    // dissolve completes (0.83→0.89) so the invitation opens the instant the triangles disappear
    // while the OPEN itself stays slow (owner: "بطيء زي ما هو + الدعوة فوراً لما تختفي المثلثات").
    DIRECT_HANDOFF: true, HANDOFF_AT: 0.74,
    setOpen(t, fov, aspect) { applyVisual(t); return framing(t, fov, aspect); },
    framePose(fov, aspect) { return framing(0, fov, aspect); },
    refreshCard() { /* the bloom shape has no baked card */ },
    dispose,
  };
}
