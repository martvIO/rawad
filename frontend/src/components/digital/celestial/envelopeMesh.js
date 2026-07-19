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
  // flaps slide straight OUTWARD from the centre in unison, revealing a warm glow
  // that swells to a hand-off wash. `shape:"bloom"` routes to buildEnvelopeBloom.
  "bloom": {
    shape: "bloom", light: true,
    palette: { paper: "#f7e7e8", foil: "#c98a90", foilBright: "#f2d8d4", wax: "#8a2230", cardPaper: "#fdf6f5", cardInk: "#5a2530", sealLogo: "#eccf94" },
    floralTint: "#ecd2d3", glow: "#ffcf9a", linen: "#f6e6e6",
  },
  // A DIFFERENT SHAPE: two pleated velvet drapes on a gold rod that DRAW APART to a
  // warm light, then dissolve into the "through the light" hand-off. Fixed luxury
  // palette (no groom colour pickers). `shape:"curtain"` → buildEnvelopeCurtain.
  "curtain": {
    shape: "curtain", light: true,
    palette: { velvet: "#e7dbc4", gold: "#c9a24e", goldBright: "#f0deA0" },
    glow: "#ffe6c2",
  },
  // Two ornate ivory-and-gold palace DOORS under a gold frame that SWING open to a
  // warm light, camera flying through. Fixed luxury palette. → buildEnvelopeGate.
  "gate": {
    shape: "gate", light: true,
    palette: { door: "#ece2cf", gold: "#c9a24e", goldBright: "#f2dfa0" },
    glow: "#ffe6c2",
  },
  // A ribboned luxury GIFT BOX whose lid + bow lift off to a burst of light. → gift.
  "gift": {
    shape: "gift", light: true,
    palette: { box: "#ece2cf", gold: "#c9a24e", goldBright: "#f2dfa0" },
    glow: "#ffe6c2",
  },
  // A gilded BOOK whose cover swings open to light between the pages. → book.
  "book": {
    shape: "book", light: true,
    palette: { cover: "#5e1a2c", gold: "#d8b45a", goldBright: "#f4e2a8", page: "#f3ead2" },
    glow: "#ffe6c2",
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
  if (preset && preset.shape === "curtain") return buildEnvelopeCurtain({ pal, preset, content });
  if (preset && preset.shape === "gate") return buildEnvelopeGate({ pal, preset, content });
  if (preset && preset.shape === "gift") return buildEnvelopeGift({ pal, preset, content });
  if (preset && preset.shape === "book") return buildEnvelopeBook({ pal, preset, content });
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
  const c = document.createElement("canvas");
  c.width = c.height = SEAL_TEX_S;
  paintSeal(c, pal, opts);
  const t = new THREE.CanvasTexture(c); setSRGB(t); return t;
}
// The full 512² wax paint (dozens of gradient/Path2D fills incl. blurred brand
// stamps) is the 2nd-heaviest boot bake — split from makeSealTex so the bloom
// path can queue it as a deferred boot step; classic keeps the one-shot call.
function paintSeal(c, pal, opts = {}) {
  const s = SEAL_TEX_S; const x = c.getContext("2d");
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
  const c = document.createElement("canvas");
  c.width = c.height = kind === "dot" ? 64 : 256;
  paintSprite(c, kind);
  return new THREE.CanvasTexture(c);
}
// Paint half of sprite(), split out so the bloom boot can queue a sprite's paint
// as a deferred bake while assigning its (blank) texture synchronously.
function paintSprite(c, kind) {
  const s = c.width; const x = c.getContext("2d");
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

function heightToNormal(heightCanvas, strength = 2, targetCanvas = null) {
  const s = heightCanvas.width;
  const hd = heightCanvas.getContext("2d").getImageData(0, 0, s, s).data;
  const nc = targetCanvas || document.createElement("canvas"); nc.width = nc.height = s;
  const nx = nc.getContext("2d"); const nimg = nx.createImageData(s, s); const nd = nimg.data;
  // This is the single hottest bake loop of the envelope boot (s×s iterations on
  // the main thread), so it runs on precomputed wrapped-neighbour offset tables
  // and raw indices instead of a per-pixel closure with double-modulo wrapping.
  // Same math as the naive form (red channel, wrapped Sobel-ish gradient),
  // output identical within ±1 LSB (sqrt vs hypot rounding).
  const xm = new Int32Array(s), xp = new Int32Array(s);
  for (let i = 0; i < s; i++) { xm[i] = ((i - 1 + s) % s) * 4; xp[i] = ((i + 1) % s) * 4; }
  const k = strength / 255;
  for (let y = 0; y < s; y++) {
    const row = y * s * 4;
    const rowUp = (((y - 1 + s) % s)) * s * 4;
    const rowDn = (((y + 1) % s)) * s * 4;
    for (let x = 0; x < s; x++) {
      const x4 = x * 4;
      const dx = (hd[row + xp[x]] - hd[row + xm[x]]) * k;
      const dy = (hd[rowDn + x4] - hd[rowUp + x4]) * k;
      const inv = 1 / Math.sqrt(dx * dx + dy * dy + 1);
      const i = row + x4;
      nd[i] = (-dx * inv * 0.5 + 0.5) * 255;
      nd[i + 1] = (-dy * inv * 0.5 + 0.5) * 255;
      nd[i + 2] = (inv * 0.5 + 0.5) * 255;
      nd[i + 3] = 255;
    }
  }
  nx.putImageData(nimg, 0, 0);
  return nc;
}

function makeFloral({ paper, tint, tintAlpha = 0.3, repeat = [1, 1], heightBoost = 2, size = 512, defer = null }) {
  const s = size;
  const mk = () => { const c = document.createElement("canvas"); c.width = c.height = s; return c; };
  const cc = mk(), hc = mk(), ncv = mk();
  const paint = () => {
    // Colour map: paper base + faint tinted florals (the relief carries the look).
    const xc = cc.getContext("2d");
    xc.fillStyle = paper || "#f2dcdd"; xc.fillRect(0, 0, s, s);
    drawGarden(xc, tint || "#e6c2c3", tintAlpha, 1.6, s);
    // Height map: mid-grey ground, white raised florals, softly blurred so the
    // emboss has rounded shoulders rather than hard walls.
    const xh = hc.getContext("2d");
    xh.fillStyle = "#7c7c7c"; xh.fillRect(0, 0, s, s);
    try { xh.filter = "blur(1.35px)"; } catch { /* older canvas: no blur */ }
    drawGarden(xh, "#ffffff", 1.0, 2.0, s);
    try { xh.filter = "none"; } catch { /* ignore */ }
    heightToNormal(hc, heightBoost, ncv);
  };
  const tex = (canvas, srgb) => {
    const t = new THREE.CanvasTexture(canvas);
    if (srgb) setSRGB(t);
    t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(repeat[0], repeat[1]);
    return t;
  };
  const colorTex = tex(cc, true), normalTex = tex(ncv, false);
  if (defer) {
    // Deferred boot bake: fill plain placeholders now (paper tone + neutral
    // normal) so nothing can flash black, and queue the real garden paint —
    // the engine drains the queue across frames behind the boot cover.
    const xc = cc.getContext("2d"); xc.fillStyle = paper || "#f2dcdd"; xc.fillRect(0, 0, s, s);
    const xn = ncv.getContext("2d"); xn.fillStyle = "#8080ff"; xn.fillRect(0, 0, s, s);
    defer.push(() => { paint(); colorTex.needsUpdate = true; normalTex.needsUpdate = true; });
  } else {
    paint();
  }
  return { colorTex, normalTex };
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
  // 128² is plenty for tiling bump/roughness grain at repeat 2.5 — quarter the
  // boot-bake iterations of the old 256² with no visible difference.
  const sz = 128, c = document.createElement("canvas"); c.width = c.height = sz;
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
  // Heavy paints are QUEUED here instead of running inline: the engine drains one
  // per rAF behind the opaque boot cover (and drains synchronously on a tap that
  // beats the drain), so the boot never blocks the main thread in one long task.
  const pendingBakes = [];
  const env = makeStudioEnvB(disposables);
  const grain = makeLinenGrainB(disposables);

  const HW = 0.94, HH = 1.94; // tall portrait — fills the phone screen edge-to-edge

  // 256² (was 512²): the emboss is blur-softened low-frequency relief, so at this
  // repeat and phone DPRs the loss is sub-pixel — and the dominant boot bake
  // (garden paint + normal-map loop) gets 4× cheaper. Classic keeps 512 (default).
  // heightBoost halves with the resolution: at 256² each texel spans 2× the UV
  // distance, so the same boost would read ~2× bolder than the shipped look.
  const fl = makeFloral({ paper: pal.paper, tint: preset && preset.floralTint, tintAlpha: 0.34, repeat: [1.0, 1.4], heightBoost: 1.5, size: 256, defer: pendingBakes });
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
    // transparent FROM CONSTRUCTION (opacity stays 1 until the late fade, which
    // renders byte-identical to an opaque pass): flipping .transparent mid-open
    // would bake a different shader (#define OPAQUE) and recompile at the fade.
    side: THREE.DoubleSide, transparent: true, depthWrite: true,
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
    side: THREE.DoubleSide, transparent: true, depthWrite: true, // see flapMat note
  });
  // The TOP flap leads the cascade and fades on its own clock, so it carries its
  // own material instances. clone() copies texture REFERENCES (the deferred floral
  // bake's needsUpdate reaches both) and an identical define-set → the clones share
  // the originals' compiled shader program; no new compile, no boot-contract change.
  const flapMatTop = flapMat.clone();
  const edgeMatTop = edgeMat.clone();
  // Hairline-ignite colours: each departing flap's border brightens from the resting
  // foil toward a hot gold aligned with the preset's glow (coherent on custom palettes).
  const edgeBase = col(pal.foil, "#c98a90");
  const edgeHot = glowCol.clone().lerp(new THREE.Color("#fff7e0"), 0.30);

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
  // Reveal-only glow (first drawn ~1.4s into the open): the texture is assigned
  // synchronously (keeps the material's `map` define stable) but its gradient is
  // painted as a deferred boot bake.
  const innerCanvas = document.createElement("canvas"); innerCanvas.width = innerCanvas.height = 256;
  const innerTex = new THREE.CanvasTexture(innerCanvas); disposables.push(innerTex);
  pendingBakes.push(() => { paintSprite(innerCanvas, "glow"); innerTex.needsUpdate = true; });
  const innerMat = new THREE.MeshBasicMaterial({ map: innerTex, color: glowCol, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending });
  const innerLight = new THREE.Mesh(new THREE.PlaneGeometry(HW * 4.4, HH * 4.4), innerMat);
  innerLight.position.set(0, 0, 0.0); innerLight.renderOrder = 2; group.add(innerLight);
  // The ~1s "through the light" climax needs a genuinely FULL-screen wash, and the
  // additive radial sprite above can't deliver it — its alpha dies before a wide
  // screen's corners. This solid colour quad guarantees edge-to-edge warmth, drawn
  // BENEATH the additive glow (renderOrder 1 < innerLight's 2) so the radial light
  // still ADDS on top of it — a luminous golden wash, not a flat matte wall.
  const washCol = glowCol.clone().lerp(new THREE.Color("#fff7e8"), 0.15);
  const washMat = new THREE.MeshBasicMaterial({ color: washCol, transparent: true, opacity: 0, depthWrite: false, depthTest: false });
  const washQuad = new THREE.Mesh(new THREE.PlaneGeometry(30, 30), washMat);
  washQuad.position.set(0, 0, 0.5); washQuad.renderOrder = 1; washQuad.visible = false; group.add(washQuad);

  // LUXURY seam-spill: warm light hugging the two upper diagonals the TOP triangle
  // uncovers as it leads the cascade. Placed BEHIND the flaps (z 0.02 < zt 0.05)
  // and depth-tested, so the closed paper physically occludes it and the top flap's
  // departure reveals it per-pixel — no manual masking, and it can never light the
  // outer paper. Length 0.85·diagLen re-anchored toward the centre: an origin-
  // centred full-diagonal plane would poke a glow nub past the outer corner, where
  // no flap or back panel occludes (verifier-confirmed leak). Bright end (u=0 of
  // makeSeamGlowTex) anchors at the seal/centre. Same define-set as innerMat →
  // shares its compiled program; a mesh, not a light (light count stays constant).
  const spillTex = makeSeamGlowTex(); disposables.push(spillTex);
  const diagLen = Math.hypot(HW, HH);
  const mkSeamSpill = (sx) => {
    const m = new THREE.MeshBasicMaterial({ map: spillTex, color: glowCol, transparent: true, opacity: 0, depthWrite: false, depthTest: true, blending: THREE.AdditiveBlending });
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(diagLen * 0.85, 0.46), m);
    mesh.position.set(sx * HW * 0.425, HH * 0.425, 0.02);
    mesh.rotation.z = Math.atan2(HH, sx * HW); // local +x runs centre → top corner
    mesh.renderOrder = 2; mesh.visible = false;
    group.add(mesh);
    return { mesh, mat: m };
  };
  const spillL = mkSeamSpill(-1), spillR = mkSeamSpill(1);

  // Four flaps tiling the rectangle in an X (two diagonals), hinged at outer edges.
  // A foil hairline on each flap's edges makes the X seams + border read (like a
  // real envelope back) and rides with the flap as it folds.
  const zt = 0.05;
  const edges = [];
  const addFlap = (pivot, pts, mats) => {
    const m = bloomFlap(pts, mats);
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
  const leftFlap = addFlap(leftPivot, [[0, -HH], [0, HH], [HW, 0]], [flapMat, edgeMat]);
  const rightPivot = new THREE.Group(); rightPivot.position.set(HW, 0, zt + 0.02); group.add(rightPivot);
  const rightFlap = addFlap(rightPivot, [[0, -HH], [0, HH], [-HW, 0]], [flapMat, edgeMat]);
  const botPivot = new THREE.Group(); botPivot.position.set(0, -HH, zt + 0.06); group.add(botPivot);
  addFlap(botPivot, [[-HW, 0], [HW, 0], [0, HH + OVER]], [flapMat, edgeMat]);
  const topPivot = new THREE.Group(); topPivot.position.set(0, HH, zt + 0.1); group.add(topPivot);
  addFlap(topPivot, [[-HW, 0], [HW, 0], [0, -HH - OVER]], [flapMatTop, edgeMatTop]);
  // Hairline handles for the per-flap ignite (push order above: L, R, B, T).
  const [edgeL, edgeR, edgeB, edgeT] = edges;

  // Professional CONTACT SHADOW: the raised top & bottom flaps cast a soft shadow
  // onto the side flaps beneath, along the four X seams — so it clearly reads that
  // top/bottom sit ABOVE the sides. A SEALED-state depth cue: all four strips fade
  // together over the first quarter of the unified slide (driven in applyVisual).
  const SHADOW_W     = 0.34;
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
    shadows.push({ mesh, mat, caster });
    return mesh;
  };
  // Upper strips are cast by the TOP flap, lower by the BOTTOM — each lifts off
  // with its own caster, a free depth-storytelling beat during the top's solo glide.
  mkShadow(leftFlap,  [ HW, 0], [0,  HH], [ HW / 3, 0], "top");
  mkShadow(leftFlap,  [ HW, 0], [0, -HH], [ HW / 3, 0], "rest");
  mkShadow(rightFlap, [-HW, 0], [0,  HH], [-HW / 3, 0], "top");
  mkShadow(rightFlap, [-HW, 0], [0, -HH], [-HW / 3, 0], "rest");

  // A REAL pressed-wax seal that CRACKS IN TWO: two scalloped half-meshes sharing a
  // jagged crack seam, the logo debossed on top. They part + fade on tap.
  const crackPts = sealCrackPoints();
  // Seal is sealed-state hero art, but its 512² vector paint is the 2nd-heaviest
  // boot bake — deferred; the engine holds the first envelope render (behind the
  // opaque boot cover) until the queue is drained, so no placeholder is ever seen.
  const sealCanvas = document.createElement("canvas"); sealCanvas.width = sealCanvas.height = SEAL_TEX_S;
  const sealTex = new THREE.CanvasTexture(sealCanvas); setSRGB(sealTex);
  disposables.push(sealTex);
  pendingBakes.push(() => { paintSeal(sealCanvas, pal, { blob: true, dome: true, deboss: true }); sealTex.needsUpdate = true; });
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
  // Press feedback (owner): the moment the guest taps, a warm glow RING blooms
  // AROUND the wax seal, then decays as the crack takes over. Parented to `group`,
  // not sealGroup — the sealGroup goes invisible once its halves fade, and the
  // ring must outlast the crack's start. The ring texture's bright band sits at
  // ~0.86 of its radius, landing just OUTSIDE the RG=0.28 wax disc.
  const ringTex = sprite("ring"); disposables.push(ringTex);
  const ringMat = new THREE.MeshBasicMaterial({ map: ringTex, color: glowCol, transparent: true, opacity: 0, depthWrite: false, depthTest: false, blending: THREE.AdditiveBlending });
  const sealRing = new THREE.Mesh(new THREE.PlaneGeometry(1.5, 1.5), ringMat);
  sealRing.position.set(0, 0, zt + 0.19); sealRing.renderOrder = 6; sealRing.visible = false;
  group.add(sealRing);
  const sealPulse = new THREE.PointLight(col(pal.foilBright, "#f6e3a6"), 0, 5 * S, 1.8);
  sealPulse.position.set(0, 0.05, 0.9); group.add(sealPulse);

  group.add(new THREE.AmbientLight(0xfff3ea, 0.82));
  const key = new THREE.DirectionalLight(0xfff1d8, 0.8); key.position.set(4, 6, 6.5); group.add(key);
  const fill = new THREE.DirectionalLight(0xf1e6dc, 0.4); fill.position.set(-4, -2, 5); group.add(fill);
  const innerGlow = new THREE.PointLight(glowCol, 0.0, 9 * S, 1); innerGlow.position.set(0, 0.1, -0.15); group.add(innerGlow);
  // The visible light is the FULL interior glow (above) + the wash quad. Four warm
  // PointLights backlight the revealed interior; all four grow together with the slide.
  const mkSeamLight = (cx, cy) => {
    const l = new THREE.PointLight(glowCol, 0.0, 8 * S, 1);
    l.position.set(cx * HW * 0.42, cy * HH * 0.42, -0.05);
    group.add(l); return l;
  };
  const seamLights = [mkSeamLight(-1, 1), mkSeamLight(1, 1), mkSeamLight(-1, -1), mkSeamLight(1, -1)];

  // ease-in-out kept for the fades/shadows; the slide itself uses softLinear below.
  const smooth = (x) => { const c = clamp01(x); return c < 0.5 ? 2 * c * c : 1 - Math.pow(-2 * c + 2, 2) / 2; };
  // Owner: the four triangles glide at a CONSTANT speed with only a soft release —
  // a quadratic ramp (~0.5s) whose exit velocity equals the linear segment's slope
  // (C¹ at the seam), then dead-constant to the end. f(1) = 1 exactly.
  const softLinear = (u) => {
    const c = clamp01(u), a = 0.13, n = 1 - a / 2;
    return c < a ? (c * c) / (2 * a * n) : (c - a / 2) / n;
  };
  // Single source of truth for the hand-off point: the wash swells INTO it, dims
  // AFTER it, and the returned HANDOFF_AT (which the engine's clearAlpha ramp
  // derives its window from) is this same constant — retuning it can't desync
  // the mesh's washDim from the engine's reveal tail. At DURATION 8.0 the tail is
  // (1 − 0.92) × 8.0 = 0.64s — just inside Ambience's 650ms done→gone timer and
  // the editor's 700ms re-seal delay.
  const HANDOFF = 0.92;

  function applyVisual(t) {
    const tt = clamp01(t);
    // Timeline (normalized; DURATION 8.0s — the luxury cascade):
    //   glow ring 0→0.075 · seal cracks 0.090→0.165 · STILLNESS 0.165→0.265 (0.8s)
    //   · TOP triangle slides alone from 0.265 · the other three release at
    //   top-halfway (0.490) · seam-spill light hugs the two uncovered diagonals ·
    //   each hairline ignites as its flap departs · per-group late fades · wash
    //   swells → HANDOFF 0.92 · wash dims → 1
    // Press feedback: the glow ring blooms around the seal on the tap, then decays
    // as the crack takes over (owner: glow first, THEN the envelope opens).
    const glowRise = ease(clamp01(tt / 0.075));
    const glowFall = ease(clamp01((tt - 0.105) / 0.075));
    const ringF = glowRise * (1 - glowFall);
    ringMat.opacity = 0.95 * ringF;
    sealRing.scale.setScalar(0.70 + 0.50 * glowRise);  // blooms outward from the press
    sealRing.visible = ringF > 0.003;
    // sealPulse stays VISIBLE at intensity 0 (like innerGlow/seamLights): hiding a
    // light changes the scene's point-light COUNT, which invalidates the program
    // cache of every lit material — i.e. a mass shader recompile at the exact
    // moment of the first tap. A visible intensity-0 light costs almost nothing.
    sealPulse.intensity = 2.4 * ringF;

    // Wax seal CRACKS IN TWO once the glow peaks: the halves part + tip forward,
    // then fade. Fully gone at tt 0.165 — where the owner's 0.8s SUSPENSEFUL
    // STILLNESS begins: no geometry moves until 0.265, only the ring/pulse
    // afterglow decays. Anticipation is the luxury beat.
    const crackSnap = ease(clamp01((tt - 0.090) / 0.025)); // sharp fracture instant
    const split     = smooth(clamp01((tt - 0.098) / 0.057)); // halves part fast
    const sealFade  = ease(clamp01((tt - 0.115) / 0.050));   // then vanish
    sealGroup.visible = sealFade < 0.999;
    sealGroup.scale.setScalar(1 + 0.02 * Math.sin(crackSnap * Math.PI)); // tiny jolt, NOT a shrink
    const sep  = 0.30 * split;
    const fwd  = 0.16 * split;
    const tip  = 0.42 * split;
    const roll = 0.09 * split;
    sealTopH.position.set(0,  sep, fwd);         sealTopH.rotation.set( tip, 0,  roll);
    sealBotH.position.set(0, -sep, fwd * 0.96);  sealBotH.rotation.set(-tip, 0, -roll);

    // TOP-FIRST CASCADE (owner): the top triangle glides out alone; when it is
    // halfway (topRaw 0.5 → tt 0.490 exactly), the other three release together.
    // Same straight glide, same softLinear constant-speed feel for both groups.
    const topRaw = clamp01((tt - 0.265) / 0.450);
    const topF = softLinear(topRaw);
    const restRaw = clamp01((tt - 0.490) / 0.375);
    const restF = softLinear(restRaw);
    const D_VERT = 2.7, D_SIDE = 1.35;
    topPivot.position.y   =  HH + D_VERT * topF;
    botPivot.position.y   = -HH - D_VERT * restF;
    leftPivot.position.x  = -HW - D_SIDE * restF;
    rightPivot.position.x =  HW + D_SIDE * restF;
    // all pivot rotations stay 0 — the triangles never fold, they glide

    // Per-group late fades: each group dissolves near the end of ITS travel.
    // ONLY depthWrite flips — pure per-draw GL state, no shader permutation, no
    // needsUpdate (materials are transparent-from-construction). The back panel
    // fades with the REST group so the wedge the top vacates stays backed.
    const topFadeF  = smooth(clamp01((topRaw - 0.77) / 0.23));
    const restFadeF = smooth(clamp01((restRaw - 0.77) / 0.23));
    const opTop = 1 - topFadeF, opRest = 1 - restFadeF;
    const wantWTop = topFadeF <= 0.0001;
    if (flapMatTop.depthWrite !== wantWTop) {
      flapMatTop.depthWrite = wantWTop; edgeMatTop.depthWrite = wantWTop;
    }
    const wantWRest = restFadeF <= 0.0001;
    if (flapMat.depthWrite !== wantWRest) {
      flapMat.depthWrite = wantWRest; edgeMat.depthWrite = wantWRest; backMat.depthWrite = wantWRest;
    }
    flapMatTop.opacity = opTop; edgeMatTop.opacity = opTop;
    flapMat.opacity = opRest; edgeMat.opacity = opRest; backMat.opacity = opRest;
    sealMat.opacity = 1 - sealFade;                    // the seal is long gone before the fades

    // EDGE IGNITE (owner: luxury): each flap's gold hairline brightens toward hot
    // gold over the first 30% of ITS OWN travel, holds while gliding, then dies
    // with its group's fade. Colour/opacity are uniforms — no recompile, in-place
    // Color.copy/lerp (no per-frame allocation).
    const ignTop  = smooth(clamp01(topRaw / 0.30));
    const ignRest = smooth(clamp01(restRaw / 0.30));
    edgeT.material.color.copy(edgeBase).lerp(edgeHot, ignTop);
    edgeT.material.opacity = (0.55 + 0.40 * ignTop) * opTop;
    for (const e of [edgeL, edgeR, edgeB]) {
      e.material.color.copy(edgeBase).lerp(edgeHot, ignRest);
      e.material.opacity = (0.55 + 0.40 * ignRest) * opRest;
    }

    // SEAM-SPILL (owner: "glowing light from the edges" after the top opens):
    // hugs the two uncovered diagonals during the top's solo glide — revealed
    // per-pixel by the departing top flap (depth-tested behind the paper), then
    // dissolves into the general interior flood once the cascade releases.
    const washDim = smooth(clamp01((tt - HANDOFF) / (1 - HANDOFF)));
    const spillGrow = smooth(clamp01(topF / 0.60));
    const spillFade = smooth(clamp01(restF / 0.45));
    const spillO = 0.50 * spillGrow * (1 - spillFade) * (1 - washDim);
    spillL.mat.opacity = spillR.mat.opacity = spillO;
    spillL.mesh.visible = spillR.mesh.visible = spillO > 0.002;
    const spw = 0.6 + 0.4 * spillGrow;                 // the glow thickens with the gap
    spillL.mesh.scale.set(1, spw, 1); spillR.mesh.scale.set(1, spw, 1);

    // Warm interior light: gentle rise during the solo glide, full flood with the
    // cascade; dims fully through the hand-off tail.
    const gTop = topF * (2 - topF), gRest = restF * (2 - restF);
    const grow = 0.35 * gTop + 0.65 * gRest;
    for (const lt of seamLights) lt.intensity = (0.15 + 3.4 * grow) * (1 - washDim);

    // Interior glow — appears with the FIRST gap (the top's), swelling into the
    // brief full-screen golden wash at the hand-off ("through the light"), then
    // dimming as the invitation cross-blends in beneath. Perceptual bright window
    // ≈0.95s, inside the owner's "الضو الي ببين بكل الشاشة خليه بس لمدة ثانية" cap.
    const revealF = smooth(clamp01(topF / 0.14));
    const flareF  = smooth(clamp01((tt - (HANDOFF - 0.13)) / 0.09));
    // Keep the additive boost modest — the wash must peak as luminous GOLD, not a
    // blown-out white page (the owner explicitly rejected a white hand-off).
    innerMat.opacity = (0.15 + 0.38 * flareF) * (1 - washDim) * revealF;
    innerLight.visible = innerMat.opacity > 0.002; // no draw call while sealed
    const ws = 1 + 0.9 * flareF;
    innerLight.scale.set(ws, ws, 1);
    washMat.opacity = 0.88 * flareF * (1 - washDim);
    washQuad.visible = washMat.opacity > 0.002;

    // Contact shadows lift off with their CASTER: the top's strips fade during the
    // solo glide, the bottom's stay until the cascade — a free depth beat.
    for (const sh of shadows) {
      const raw = sh.caster === "top" ? topRaw : restRaw;
      const shK = (1 - smooth(clamp01(raw / 0.25))) * opRest; // strips live ON the side flaps
      sh.mat.opacity = shK; sh.mesh.visible = shK > 0.002;
    }

    // Central junction glow: grows with the cascade PLUS a brief golden pulse at
    // the crack instant — the pulse dies INSIDE the stillness (by tt 0.245).
    innerGlow.intensity = (0.30 + 2.9 * grow) * (1 - washDim)
                        + 1.6 * crackSnap * (1 - ease(clamp01((tt - 0.155) / 0.090)));
  }

  // Sealed: fill the screen (cover = the tighter dimension fills). The camera is
  // fully STATIC, dead head-on — the four triangles slide along the screen axes,
  // so any push-in/tilt would add radial drift to their dead-straight paths.
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
    return { y: 0, z: cover * S, lookAtY: 0 };
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
    group, REVEAL_AT: 0.090, DURATION: 8.0, // luxury cascade: tap → invitation ≈ 8s
    // "Through the light" hand-off: onComplete fires at the wash PEAK (HANDOFF 0.92
    // ≈ 7.36s) while the envelope keeps rendering its dimming wash; WASH_TAIL tells
    // the engine to ramp clearAlpha → 0 over the tail and remove the env only at
    // openT = 1, so the invitation cross-blends in BENEATH the dimming gold — no
    // cut, no white page. The tail's wall clock, (1 − HANDOFF) × DURATION = 0.64s,
    // sits just inside CelestialAmbience's 650ms done→gone timer — retune together.
    DIRECT_HANDOFF: true, HANDOFF_AT: HANDOFF, WASH_TAIL: true,
    // Boot contract: the engine drains BAKE_QUEUE one closure per rAF before the
    // first envelope render (or synchronously if a tap beats the drain), then
    // pre-uploads WARM_TEXTURES so nothing uploads mid-choreography.
    BAKE_QUEUE: pendingBakes, WARM_TEXTURES: [innerTex, ringTex, spillTex],
    setOpen(t, fov, aspect) { applyVisual(t); return framing(t, fov, aspect); },
    framePose(fov, aspect) { return framing(0, fov, aspect); },
    refreshCard() { /* the bloom shape has no baked card */ },
    dispose,
  };
}

// ── VELVET CURTAINS SHAPE ─────────────────────────────────────────────────────
// Two pleated velvet drapes on a gold rod that DRAW APART (gathering toward their
// outer edges) to reveal a warm light, then dissolve into the "through the light"
// hand-off. Same engine contract + BAKE_QUEUE / no-recompile perf rules as bloom.
function buildEnvelopeCurtain({ pal, preset } = {}) {
  const velvetCol  = col(pal && pal.velvet, "#6a1a2e");
  const goldCol    = col(pal && pal.gold, "#d9b45a");
  const goldBright = col(pal && pal.goldBright, "#f4e2a8");
  const glowCol    = col(preset && preset.glow, "#ffd79a");

  const group = new THREE.Group();
  const S = 3.0; group.scale.setScalar(S);
  let disposed = false;
  const disposables = [];
  const pendingBakes = [];
  const env = makeStudioEnvB(disposables);

  const HW = 0.94, HH = 1.94; // tall portrait — matches bloom so framing is identical
  const zt = 0.06;

  // Interior light + full-screen wash, revealed as the drapes part (depth-tested
  // behind them so the closed velvet occludes it; the widening gap reveals it).
  const innerCanvas = document.createElement("canvas"); innerCanvas.width = innerCanvas.height = 256;
  const innerTex = new THREE.CanvasTexture(innerCanvas); disposables.push(innerTex);
  pendingBakes.push(() => { paintSprite(innerCanvas, "glow"); innerTex.needsUpdate = true; });
  const innerMat = new THREE.MeshBasicMaterial({ map: innerTex, color: glowCol, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending });
  const innerLight = new THREE.Mesh(new THREE.PlaneGeometry(HW * 4.4, HH * 4.4), innerMat);
  innerLight.position.set(0, 0, -0.05); innerLight.renderOrder = 2; group.add(innerLight);
  const washCol = glowCol.clone().lerp(new THREE.Color("#fff7e8"), 0.15);
  const washMat = new THREE.MeshBasicMaterial({ color: washCol, transparent: true, opacity: 0, depthWrite: false, depthTest: false });
  const washQuad = new THREE.Mesh(new THREE.PlaneGeometry(30, 30), washMat);
  washQuad.position.set(0, 0, 0.5); washQuad.renderOrder = 1; washQuad.visible = false; group.add(washQuad);

  // Dark backing so no starfield peeks through the centre seam before the parting.
  const backMat = new THREE.MeshStandardMaterial({ color: 0x1c0b12, roughness: 0.9, metalness: 0, transparent: true, depthWrite: true });
  const back = new THREE.Mesh(new THREE.PlaneGeometry(HW * 2.3, HH * 2.3), backMat);
  back.position.z = -0.12; group.add(back);

  // REALISTIC velvet: the fold RELIEF now comes from real 3D geometry (mkPanel below),
  // not a fake normal map, and the material carries the sheen BRDF — retro-reflective
  // fuzz that lights the fold shoulders + grazing silhouette, the thing a plain
  // MeshStandard can't do (v1 read as flat). A fine grain bump adds micro-fibre. Deep
  // burgundy lifted a touch out of near-black; transparent from construction (only
  // opacity/depthWrite animate later).
  const grain = makeLinenGrainB(disposables);
  const velvetMat = new THREE.MeshPhysicalMaterial({
    color: velvetCol,                    // cream — the fold light/shadow comes from the 3D geometry
    roughness: 0.74, metalness: 0.0,     // + the side-raking key, NOT baked shading (reads as real cloth)
    sheen: 0.85, sheenColor: new THREE.Color("#fff0d6"), sheenRoughness: 0.45,
    bumpMap: grain, bumpScale: 0.012,
    envMap: env, envMapIntensity: 0.10,
    emissive: velvetCol, emissiveIntensity: 0.05,
    vertexColors: true,                  // baked fold-valley AO (mkPanel) → deeper, realer folds
    side: THREE.DoubleSide, transparent: true, depthWrite: true,
  });

  // Natural velvet FOLD profile across the panel width (u ∈ [0,1]): a SUM of a few
  // cosines at different frequencies + fixed phases → irregular, organic fold spacing
  // (~6 major folds) rather than a mechanical single sine. Deterministic (no random).
  const foldZ = (u) =>
      Math.sin(u * 7 * Math.PI * 2 + 0.6) * 0.52 +
      Math.sin(u * 4.3 * Math.PI * 2 + 2.2) * 0.34 +
      Math.sin(u * 2.7 * Math.PI * 2 + 5.1) * 0.22 +
      Math.sin(u * 11 * Math.PI * 2 + 3.7) * 0.14;  // organic, irregular ≈ [-1.2, 1.2]
  const FAMP = 0.17;
  // Two drape panels, each pivoted at its OUTER edge so scaling x gathers the fabric
  // toward that edge (the inner edge sweeps outward → the centre gap opens).
  const mkPanel = (sx) => {
    // A high-segment plane DISPLACED in z into real 3D folds (one-time build cost): the
    // ridges catch the raking key, the valleys fall to shadow (deepened by baked AO
    // vertex colours), and the panel's edge shows the wavy fold cross-section — genuine
    // folded fabric. Fold amplitude tapers to ~0 at the top and fills toward the bottom,
    // with a slight forward belly + a pooling hem kick.
    const geo = new THREE.PlaneGeometry(HW, HH * 2, 96, 40);
    const pos = geo.attributes.position;
    const colr = new Float32Array(pos.count * 3);
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i), y = pos.getY(i);
      const u = (x + HW / 2) / HW;                    // 0..1 across the panel width
      const vy = (y + HH) / (HH * 2);                 // 0 bottom .. 1 top
      const taper = 0.20 + 0.80 * (1 - vy);           // pinched at top, full at bottom
      const hem = vy < 0.14 ? (0.14 - vy) * 0.7 : 0;  // extra fold depth where it pools
      const belly = 0.06 * Math.sin(vy * Math.PI);    // gentle forward bow mid-height
      const fv = foldZ(u);
      pos.setZ(i, FAMP * fv * (taper + hem) + belly);
      // Soft ambient occlusion baked per-vertex: fold VALLEYS darker, crests full — the
      // extra depth cue that pushes it from "CG" to "real cloth" (multiplies the cream).
      const ao = 0.56 + 0.44 * clamp01((fv + 1.2) / 2.4);
      colr[i * 3] = colr[i * 3 + 1] = colr[i * 3 + 2] = ao;
    }
    geo.setAttribute("color", new THREE.BufferAttribute(colr, 3));
    geo.computeVertexNormals();
    // Pivot (group) at the TOP OUTER corner (world (sx·HW, HH)) — the curtain HANGS from
    // there, so scaling the group's x gathers it toward the outer edge (opens the gap)
    // and a gentle rotation.z swings its free bottom edge in the wind (applyVisual).
    geo.translate(-sx * HW / 2, -HH, 0);
    const mesh = new THREE.Mesh(geo, velvetMat);
    mesh.position.z = zt;
    const g = new THREE.Group();
    g.position.set(sx * HW, HH, 0);
    g.add(mesh); group.add(g);
    return g;
  };
  const leftPanel = mkPanel(-1);           // covers world x [-HW, 0]
  const rightPanel = mkPanel(1);           // covers world x [0, HW]

  // Press feedback: a warm glow blooms at the centre seam on the tap, then the
  // drapes part. Additive, drawn in front, decays as the parting takes over.
  const pressCanvas = document.createElement("canvas"); pressCanvas.width = pressCanvas.height = 256;
  const pressTex = new THREE.CanvasTexture(pressCanvas); disposables.push(pressTex);
  pendingBakes.push(() => { paintSprite(pressCanvas, "glow"); pressTex.needsUpdate = true; });
  const pressMat = new THREE.MeshBasicMaterial({ map: pressTex, color: glowCol, transparent: true, opacity: 0, depthWrite: false, depthTest: false, blending: THREE.AdditiveBlending });
  const pressGlow = new THREE.Mesh(new THREE.PlaneGeometry(1.5, HH * 1.7), pressMat);
  pressGlow.position.set(0, 0, zt + 0.22); pressGlow.renderOrder = 6; pressGlow.visible = false; group.add(pressGlow);

  // Lights — constant count, intensity-driven (never toggled visible, to keep the
  // point-light count stable and avoid a mid-open shader recompile).
  // LOW ambient + a strong SIDE-RAKING key: the raking light deepens the vertical fold
  // shadows (valleys → soft shadow, crests → highlight) so the drape reads as real cloth.
  // A high ambient (v2 had 0.98) fills the shadows flat — the #1 "looks CG" mistake.
  group.add(new THREE.AmbientLight(0xfff3ea, 0.40));
  const key = new THREE.DirectionalLight(0xfff4e2, 1.55); key.position.set(7, 3.5, 4.5); group.add(key);
  const fill = new THREE.DirectionalLight(0xeaf0ff, 0.30); fill.position.set(-6, -1.5, 4); group.add(fill);
  const innerGlow = new THREE.PointLight(glowCol, 0.0, 9 * S, 1); innerGlow.position.set(0, 0.1, -0.1); group.add(innerGlow);

  const smooth = (x) => { const c = clamp01(x); return c < 0.5 ? 2 * c * c : 1 - Math.pow(-2 * c + 2, 2) / 2; };
  const softLinear = (u) => { const c = clamp01(u), a = 0.14, n = 1 - a / 2; return c < a ? (c * c) / (2 * a * n) : (c - a / 2) / n; };
  const HANDOFF = 0.91;

  function applyVisual(t) {
    const tt = clamp01(t);
    // Timeline (DURATION 6.5s): press glow 0→0.10 · drapes draw apart 0.10→0.85
    //   (gather toward the outer edges + gentle sway) · glow revealed through the
    //   widening gap · velvet+gold late-fade · wash swells → HANDOFF 0.91 → dim → 1
    const glowRise = ease(clamp01(tt / 0.07));
    const glowFall = ease(clamp01((tt - 0.10) / 0.09));
    const pressF = glowRise * (1 - glowFall);
    pressMat.opacity = 0.85 * pressF;
    pressGlow.scale.set(0.7 + 0.5 * glowRise, 1, 1);
    pressGlow.visible = pressF > 0.003;

    const partRaw = clamp01((tt - 0.10) / 0.75);
    const partF = softLinear(partRaw);
    const sc = 1 - 0.66 * partF;                 // gather toward the outer edge (stays a substantial
                                                 // drape the camera flies BETWEEN, not a thin strip)
    const zc = 1 + 0.5 * partF;                  // folds bunch DEEPER as the fabric gathers
    leftPanel.scale.set(sc, 1, zc); rightPanel.scale.set(sc, 1, zc);
    // WIND: a gentle gust billows each drape's free (bottom) edge toward the OPPOSITE side
    // of its travel as it opens — the panels hang from a TOP pivot so rotation.z swings the
    // bottom like real cloth (owner: "كأنه في هوا بزيح شوي منها للجهة العكسية"). Left opens
    // out-left so its bottom drags right (+z rot) and vice-versa → both billow inward.
    const windA = 0.05 * Math.sin(partF * Math.PI) + 0.02 * Math.sin(partF * Math.PI * 4);
    leftPanel.rotation.z = windA; rightPanel.rotation.z = -windA;

    const washDim = smooth(clamp01((tt - HANDOFF) / (1 - HANDOFF)));

    // Late fade: the gathered drapes + gold dissolve into the light near the end.
    // Only depthWrite flips (pure GL state) — materials are transparent-from-build.
    const fadeF = smooth(clamp01((partRaw - 0.84) / 0.16));
    const op = 1 - fadeF;
    const wantW = fadeF <= 0.0001;
    if (velvetMat.depthWrite !== wantW) { velvetMat.depthWrite = wantW; backMat.depthWrite = wantW; }
    velvetMat.opacity = op; backMat.opacity = op;

    // Interior glow + wash ("through the light"), revealed by the widening gap.
    const revealF = smooth(clamp01(partF / 0.10));
    const flareF  = smooth(clamp01((tt - (HANDOFF - 0.13)) / 0.09));
    // Keep the light MODEST while the drapes part + the camera flies between them (so the
    // velvet stays visible), then flare to the full golden wash only at the climax.
    innerMat.opacity = (0.12 + 0.34 * flareF) * (1 - washDim) * revealF;
    innerLight.visible = innerMat.opacity > 0.002;
    const ws = 1 + 0.9 * flareF; innerLight.scale.set(ws, ws, 1);
    washMat.opacity = 0.78 * flareF * (1 - washDim);   // warm GOLD climax, not a blown-out white page
    washQuad.visible = washMat.opacity > 0.002;

    const grow = partF * (2 - partF);
    innerGlow.intensity = (0.22 + 2.1 * grow) * (1 - washDim);
  }

  // Head-on cover fit (phones fill edge-to-edge, wide desktops get the tidy portrait
  // column) — PLUS a forward DOLLY: as the drapes part the camera pushes in through the
  // widening gap toward the light behind them (owner: "الكاميرا تفوت لجوا ورا البرداي").
  // The engine eases the returned z, so a per-openT-shrinking z reads as a smooth
  // fly-in and the shared star field rushes past. The drapes fade before the camera
  // reaches their plane, so nothing clips.
  function framing(t, fov, aspect) {
    const tn = Math.tan(((fov || 34) * Math.PI / 180) / 2);
    const realAsp = aspect || 1;
    const wide = realAsp > 0.85;
    const asp = wide ? HW / HH : realAsp;
    const margin = wide ? 1.14 : 1.0;
    const zBase = Math.min(HH / tn, HW / (tn * asp)) * margin * S;
    const dolly = smooth(clamp01((clamp01(t) - 0.10) / 0.75));
    return { y: 0, z: zBase * (1 - 0.60 * dolly), lookAtY: 0 };
  }

  applyVisual(0);

  function dispose() {
    if (disposed) return; disposed = true;
    group.traverse((o) => {
      if (o.geometry) o.geometry.dispose();
      if (o.material) {
        const mats = Array.isArray(o.material) ? o.material : [o.material];
        for (const m of mats) { for (const k of ["map", "normalMap", "roughnessMap", "metalnessMap", "envMap"]) if (m[k] && m[k].dispose) m[k].dispose(); m.dispose(); }
      }
    });
    for (const d of disposables) { try { d.dispose(); } catch { /* ignore */ } }
  }

  return {
    group, REVEAL_AT: 0.10, DURATION: 6.5,
    DIRECT_HANDOFF: true, HANDOFF_AT: HANDOFF, WASH_TAIL: true,
    BAKE_QUEUE: pendingBakes, WARM_TEXTURES: [innerTex, pressTex],
    setOpen(t, fov, aspect) { applyVisual(t); return framing(t, fov, aspect); },
    framePose(fov, aspect) { return framing(0, fov, aspect); },
    refreshCard() { /* the curtain shape has no baked card */ },
    dispose,
  };
}

// ── ORNATE GATE / PALACE-DOOR SHAPE ───────────────────────────────────────────
// Two ivory-and-gold arabesque doors in a gold frame that SWING open on their outer
// hinges to a warm light, camera flying through the doorway → "through the light"
// hand-off. Same engine contract + perf rules as bloom/curtain.
function buildEnvelopeGate({ pal, preset } = {}) {
  const doorCol   = col(pal && pal.door, "#ece2cf");
  const goldCol   = col(pal && pal.gold, "#c9a24e");
  const goldBright = col(pal && pal.goldBright, "#f2dfa0");
  const glowCol   = col(preset && preset.glow, "#ffe6c2");

  const group = new THREE.Group();
  const S = 3.0; group.scale.setScalar(S);
  let disposed = false;
  const disposables = [];
  const pendingBakes = [];
  const env = makeStudioEnvB(disposables);
  const grain = makeLinenGrainB(disposables);

  const HW = 0.94, HH = 1.94;
  const zt = 0.10, FR = 0.15;              // door depth layer, gold frame thickness

  // Interior light + full-screen wash behind the doors (revealed as they swing open).
  const innerCanvas = document.createElement("canvas"); innerCanvas.width = innerCanvas.height = 256;
  const innerTex = new THREE.CanvasTexture(innerCanvas); disposables.push(innerTex);
  pendingBakes.push(() => { paintSprite(innerCanvas, "glow"); innerTex.needsUpdate = true; });
  const innerMat = new THREE.MeshBasicMaterial({ map: innerTex, color: glowCol, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending });
  const innerLight = new THREE.Mesh(new THREE.PlaneGeometry(HW * 4.4, HH * 4.4), innerMat);
  innerLight.position.set(0, 0, -0.16); innerLight.renderOrder = 2; group.add(innerLight);
  const washCol = glowCol.clone().lerp(new THREE.Color("#fff7e8"), 0.15);
  const washMat = new THREE.MeshBasicMaterial({ color: washCol, transparent: true, opacity: 0, depthWrite: false, depthTest: false });
  const washQuad = new THREE.Mesh(new THREE.PlaneGeometry(30, 30), washMat);
  washQuad.position.set(0, 0, 0.5); washQuad.renderOrder = 1; washQuad.visible = false; group.add(washQuad);

  // Dark corridor behind, so the doorway reads before the light blooms.
  const backMat = new THREE.MeshStandardMaterial({ color: 0x120b06, roughness: 0.9, metalness: 0, transparent: true, depthWrite: true });
  const back = new THREE.Mesh(new THREE.PlaneGeometry(HW * 2.2, HH * 2.2), backMat);
  back.position.z = -0.22; group.add(back);

  // Ivory door stock with a metallic gold arabesque girih lattice (reuses makeArabesque:
  // the gold lines are the metallic/smooth part of the PBR over matte ivory).
  const arab = makeArabesque({ bg: "#" + doorCol.getHexString(), line: "#" + goldCol.getHexString(), alpha: 0.5, lineW: 2.4, cells: 2, repeat: [1, 2], withMetal: true });
  disposables.push(arab.color, arab.metal, arab.rough);
  const doorMat = new THREE.MeshStandardMaterial({
    color: 0xffffff, map: arab.color, metalnessMap: arab.metal, metalness: 1.0,
    roughnessMap: arab.rough, roughness: 0.6, bumpMap: grain, bumpScale: 0.006,
    envMap: env, envMapIntensity: 0.6, emissive: doorCol, emissiveIntensity: 0.07,
    side: THREE.DoubleSide, transparent: true, depthWrite: true,
  });
  const goldMat = new THREE.MeshPhysicalMaterial({
    color: goldCol, metalness: 0.96, roughness: 0.24, clearcoat: 0.5, clearcoatRoughness: 0.2,
    envMap: env, envMapIntensity: 1.25, emissive: goldBright, emissiveIntensity: 0.16,
    side: THREE.DoubleSide, transparent: true, depthWrite: true,
  });

  // A rectangular gold molding FRAME (rect outline with a rect hole), extruded + beveled.
  const mkFrameMesh = (w, h, t) => {
    const sh = new THREE.Shape();
    sh.moveTo(-w / 2, -h / 2); sh.lineTo(w / 2, -h / 2); sh.lineTo(w / 2, h / 2); sh.lineTo(-w / 2, h / 2); sh.closePath();
    const iw = w - 2 * t, ih = h - 2 * t;
    const hole = new THREE.Path();
    hole.moveTo(-iw / 2, -ih / 2); hole.lineTo(-iw / 2, ih / 2); hole.lineTo(iw / 2, ih / 2); hole.lineTo(iw / 2, -ih / 2); hole.closePath();
    sh.holes.push(hole);
    return new THREE.Mesh(new THREE.ExtrudeGeometry(sh, { depth: 0.05, bevelEnabled: true, bevelThickness: 0.014, bevelSize: 0.012, bevelSegments: 1 }), goldMat);
  };

  // Two doors, hinged at their OUTER edges, filling the opening inside the frame.
  const openW = HW * 2 - FR * 1.5;         // total door opening width
  const dW = openW / 2;                     // one door width
  const dH = HH * 2 - FR * 1.5;             // door height
  const doors = [];
  const mkDoor = (sx) => {
    const g = new THREE.Group();
    g.position.set(sx * (openW / 2), 0, zt); // hinge at the outer edge of the opening
    const panel = new THREE.Mesh(new THREE.BoxGeometry(dW, dH, 0.06), doorMat);
    panel.position.set(-sx * dW / 2, 0, 0);  // door extends INWARD from the hinge
    g.add(panel);
    // two recessed gold-bordered panels (moldings) on the face
    for (const cy of [1, -1]) {
      const pm = mkFrameMesh(dW * 0.66, dH * 0.4, 0.028);
      pm.position.set(-sx * dW / 2, cy * dH * 0.22, 0.035); g.add(pm);
    }
    // gold ring handle near the inner (meeting) edge
    const handle = new THREE.Mesh(new THREE.TorusGeometry(0.055, 0.017, 10, 22), goldMat);
    handle.position.set(-sx * (dW - 0.11), 0, 0.06); g.add(handle);
    group.add(g); doors.push({ g, sx });
  };
  mkDoor(-1); mkDoor(1);

  // Outer gold frame + a top-centre crest + four corner rosettes.
  const frame = mkFrameMesh(HW * 2, HH * 2, FR);
  frame.position.set(0, 0, zt + 0.06); group.add(frame);
  const crest = new THREE.Mesh(new THREE.SphereGeometry(0.15, 18, 14), goldMat);
  crest.position.set(0, HH - 0.02, zt + 0.08); group.add(crest);
  for (const cx of [-1, 1]) for (const cy of [-1, 1]) {
    const r = new THREE.Mesh(new THREE.SphereGeometry(0.075, 14, 12), goldMat);
    r.position.set(cx * (HW - FR / 2), cy * (HH - FR / 2), zt + 0.10); group.add(r);
  }

  // Press feedback: a warm glow blooms at the meeting seam on the tap.
  const pressCanvas = document.createElement("canvas"); pressCanvas.width = pressCanvas.height = 256;
  const pressTex = new THREE.CanvasTexture(pressCanvas); disposables.push(pressTex);
  pendingBakes.push(() => { paintSprite(pressCanvas, "glow"); pressTex.needsUpdate = true; });
  const pressMat = new THREE.MeshBasicMaterial({ map: pressTex, color: glowCol, transparent: true, opacity: 0, depthWrite: false, depthTest: false, blending: THREE.AdditiveBlending });
  const pressGlow = new THREE.Mesh(new THREE.PlaneGeometry(1.2, HH * 1.4), pressMat);
  pressGlow.position.set(0, 0, zt + 0.3); pressGlow.renderOrder = 6; pressGlow.visible = false; group.add(pressGlow);

  // Lights — constant count, intensity-driven.
  group.add(new THREE.AmbientLight(0xfff3ea, 0.55));
  const key = new THREE.DirectionalLight(0xfff4e2, 1.2); key.position.set(5, 5, 7); group.add(key);
  const fill = new THREE.DirectionalLight(0xeaf0ff, 0.34); fill.position.set(-5, -1.5, 4); group.add(fill);
  const innerGlow = new THREE.PointLight(glowCol, 0.0, 9 * S, 1); innerGlow.position.set(0, 0.1, -0.2); group.add(innerGlow);

  const smooth = (x) => { const c = clamp01(x); return c < 0.5 ? 2 * c * c : 1 - Math.pow(-2 * c + 2, 2) / 2; };
  const HANDOFF = 0.91;

  function applyVisual(t) {
    const tt = clamp01(t);
    // Timeline (DURATION 6.5s): press glow 0→0.10 · doors SWING open 0.10→0.85 · light
    //   pours through the widening gap · doors + frame late-fade · wash → HANDOFF → dim
    const glowRise = ease(clamp01(tt / 0.07));
    const glowFall = ease(clamp01((tt - 0.10) / 0.09));
    const pressF = glowRise * (1 - glowFall);
    pressMat.opacity = 0.85 * pressF; pressGlow.visible = pressF > 0.003;

    const swingRaw = clamp01((tt - 0.10) / 0.75);
    const swing = smooth(swingRaw) * 1.85;      // up to ~106° — doors swing wide open
    for (const d of doors) d.g.rotation.y = d.sx * swing;

    const washDim = smooth(clamp01((tt - HANDOFF) / (1 - HANDOFF)));

    // Late fade: doors + frame dissolve into the light near the end.
    const fadeF = smooth(clamp01((swingRaw - 0.82) / 0.18));
    const op = 1 - fadeF;
    const wantW = fadeF <= 0.0001;
    if (doorMat.depthWrite !== wantW) { doorMat.depthWrite = wantW; goldMat.depthWrite = wantW; backMat.depthWrite = wantW; }
    doorMat.opacity = op; goldMat.opacity = op; backMat.opacity = op;

    // Interior glow + wash ("through the light"), revealed by the opening doors.
    const revealF = smooth(clamp01(swing / 0.4));
    const flareF  = smooth(clamp01((tt - (HANDOFF - 0.13)) / 0.09));
    innerMat.opacity = (0.14 + 0.34 * flareF) * (1 - washDim) * revealF;
    innerLight.visible = innerMat.opacity > 0.002;
    const ws = 1 + 0.9 * flareF; innerLight.scale.set(ws, ws, 1);
    washMat.opacity = 0.78 * flareF * (1 - washDim);
    washQuad.visible = washMat.opacity > 0.002;

    const grow = smooth(swingRaw);
    innerGlow.intensity = (0.25 + 2.4 * grow) * (1 - washDim);
  }

  // Head-on cover fit + a forward DOLLY through the doorway as the doors open.
  function framing(t, fov, aspect) {
    const tn = Math.tan(((fov || 34) * Math.PI / 180) / 2);
    const realAsp = aspect || 1;
    const wide = realAsp > 0.85;
    const asp = wide ? HW / HH : realAsp;
    const margin = wide ? 1.14 : 1.0;
    const zBase = Math.min(HH / tn, HW / (tn * asp)) * margin * S;
    const dolly = smooth(clamp01((clamp01(t) - 0.10) / 0.75));
    return { y: 0, z: zBase * (1 - 0.55 * dolly), lookAtY: 0 };
  }

  applyVisual(0);

  function dispose() {
    if (disposed) return; disposed = true;
    group.traverse((o) => {
      if (o.geometry) o.geometry.dispose();
      if (o.material) {
        const mats = Array.isArray(o.material) ? o.material : [o.material];
        for (const m of mats) { for (const k of ["map", "normalMap", "roughnessMap", "metalnessMap", "envMap"]) if (m[k] && m[k].dispose) m[k].dispose(); m.dispose(); }
      }
    });
    for (const d of disposables) { try { d.dispose(); } catch { /* ignore */ } }
  }

  return {
    group, REVEAL_AT: 0.10, DURATION: 6.5,
    DIRECT_HANDOFF: true, HANDOFF_AT: HANDOFF, WASH_TAIL: true,
    BAKE_QUEUE: pendingBakes, WARM_TEXTURES: [innerTex, pressTex],
    setOpen(t, fov, aspect) { applyVisual(t); return framing(t, fov, aspect); },
    framePose(fov, aspect) { return framing(0, fov, aspect); },
    refreshCard() { /* the gate shape has no baked card */ },
    dispose,
  };
}

// ── RIBBONED GIFT BOX SHAPE ───────────────────────────────────────────────────
// A cream-and-gold wrapped gift box whose lid + bow LIFT off and float away to a
// burst of light from inside, camera rising in → "through the light" hand-off.
function buildEnvelopeGift({ pal, preset } = {}) {
  const boxCol    = col(pal && pal.box, "#ece2cf");
  const goldCol   = col(pal && pal.gold, "#c9a24e");
  const goldBright = col(pal && pal.goldBright, "#f2dfa0");
  const glowCol   = col(preset && preset.glow, "#ffe6c2");

  const group = new THREE.Group();
  const S = 3.0; group.scale.setScalar(S);
  let disposed = false;
  const disposables = [];
  const pendingBakes = [];
  const env = makeStudioEnvB(disposables);
  const grain = makeLinenGrainB(disposables);
  const HW = 0.94, HH = 1.94;

  const bw = 0.64, bh = 0.6, bd = 0.44;    // box half-extents (a discrete box floating in the scene)
  const boxY = -0.14;                       // box centre (slightly low, lid + bow above)
  const lidH = 0.17;                        // lid half-height
  const lidY0 = boxY + bh + lidH;           // lid resting on the box top

  // Interior light + full-screen wash — bursts from the box TOP as the lid lifts.
  const innerCanvas = document.createElement("canvas"); innerCanvas.width = innerCanvas.height = 256;
  const innerTex = new THREE.CanvasTexture(innerCanvas); disposables.push(innerTex);
  pendingBakes.push(() => { paintSprite(innerCanvas, "glow"); innerTex.needsUpdate = true; });
  const innerMat = new THREE.MeshBasicMaterial({ map: innerTex, color: glowCol, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending });
  const innerLight = new THREE.Mesh(new THREE.PlaneGeometry(bw * 4, bh * 4), innerMat);
  innerLight.position.set(0, boxY + bh + 0.1, 0.15); innerLight.renderOrder = 2; group.add(innerLight);
  const washCol = glowCol.clone().lerp(new THREE.Color("#fff7e8"), 0.15);
  const washMat = new THREE.MeshBasicMaterial({ color: washCol, transparent: true, opacity: 0, depthWrite: false, depthTest: false });
  const washQuad = new THREE.Mesh(new THREE.PlaneGeometry(30, 30), washMat);
  washQuad.position.set(0, 0, 0.5); washQuad.renderOrder = 1; washQuad.visible = false; group.add(washQuad);

  const boxMat = new THREE.MeshStandardMaterial({ color: boxCol, roughness: 0.5, metalness: 0, bumpMap: grain, bumpScale: 0.008, envMap: env, envMapIntensity: 0.25, emissive: boxCol, emissiveIntensity: 0.06, side: THREE.DoubleSide, transparent: true, depthWrite: true });
  const goldMat = new THREE.MeshPhysicalMaterial({ color: goldCol, metalness: 0.96, roughness: 0.24, clearcoat: 0.5, clearcoatRoughness: 0.2, envMap: env, envMapIntensity: 1.25, emissive: goldBright, emissiveIntensity: 0.16, side: THREE.DoubleSide, transparent: true, depthWrite: true });
  // Lid has its OWN material clones so it can fade as it floats up while the base stays.
  const lidBoxMat = boxMat.clone();
  const lidGoldMat = goldMat.clone();

  // Box base + a gold ribbon cross (vertical + horizontal bands proud of the box).
  const base = new THREE.Mesh(new THREE.BoxGeometry(bw * 2, bh * 2, bd * 2), boxMat);
  base.position.set(0, boxY, 0); group.add(base);
  const ribV = new THREE.Mesh(new THREE.BoxGeometry(bw * 0.3, bh * 2 + 0.02, bd * 2 + 0.05), goldMat);
  ribV.position.set(0, boxY, 0); group.add(ribV);
  const ribH = new THREE.Mesh(new THREE.BoxGeometry(bw * 2 + 0.05, bh * 0.3, bd * 2 + 0.05), goldMat);
  ribH.position.set(0, boxY, 0); group.add(ribH);

  // Lid group (flat cream lid + gold rim + a bow) — lifts off, tilts, floats away, fades.
  const lid = new THREE.Group();
  lid.position.set(0, lidY0, 0);
  const lidMesh = new THREE.Mesh(new THREE.BoxGeometry(bw * 2.16, lidH * 2, bd * 2.16), lidBoxMat);
  lid.add(lidMesh);
  const lidRim = new THREE.Mesh(new THREE.BoxGeometry(bw * 2.2, lidH * 0.5, bd * 2.2), lidGoldMat);
  lidRim.position.y = -lidH + 0.02; lid.add(lidRim);
  const mkLoop = (sxl) => { const l = new THREE.Mesh(new THREE.TorusGeometry(0.16, 0.05, 10, 24), lidGoldMat); l.position.set(sxl * 0.15, lidH + 0.05, 0); l.scale.set(1, 0.8, 0.5); l.rotation.z = sxl * 0.5; lid.add(l); };
  mkLoop(-1); mkLoop(1);
  const knot = new THREE.Mesh(new THREE.SphereGeometry(0.075, 14, 12), lidGoldMat); knot.position.set(0, lidH + 0.05, 0.02); lid.add(knot);
  group.add(lid);

  // Press feedback (warm glow at the bow on tap).
  const pressCanvas = document.createElement("canvas"); pressCanvas.width = pressCanvas.height = 256;
  const pressTex = new THREE.CanvasTexture(pressCanvas); disposables.push(pressTex);
  pendingBakes.push(() => { paintSprite(pressCanvas, "glow"); pressTex.needsUpdate = true; });
  const pressMat = new THREE.MeshBasicMaterial({ map: pressTex, color: glowCol, transparent: true, opacity: 0, depthWrite: false, depthTest: false, blending: THREE.AdditiveBlending });
  const pressGlow = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 1.6), pressMat);
  pressGlow.position.set(0, lidY0 + 0.1, 0.4); pressGlow.renderOrder = 6; pressGlow.visible = false; group.add(pressGlow);

  group.add(new THREE.AmbientLight(0xfff3ea, 0.6));
  const key = new THREE.DirectionalLight(0xfff4e2, 1.18); key.position.set(5, 6, 7); group.add(key);
  const fill = new THREE.DirectionalLight(0xeaf0ff, 0.35); fill.position.set(-5, -1.5, 4); group.add(fill);
  const innerGlow = new THREE.PointLight(glowCol, 0.0, 9 * S, 1); innerGlow.position.set(0, boxY + bh, 0.1); group.add(innerGlow);

  const smooth = (x) => { const c = clamp01(x); return c < 0.5 ? 2 * c * c : 1 - Math.pow(-2 * c + 2, 2) / 2; };
  const HANDOFF = 0.91;

  function applyVisual(t) {
    const tt = clamp01(t);
    // press 0->0.10 . lid+bow LIFT off 0.10->0.85 . light bursts from the box . lid fades
    // as it rises . base fades late . wash -> HANDOFF -> dim
    const glowRise = ease(clamp01(tt / 0.07));
    const glowFall = ease(clamp01((tt - 0.10) / 0.09));
    const pressF = glowRise * (1 - glowFall);
    pressMat.opacity = 0.8 * pressF; pressGlow.visible = pressF > 0.003;
    pressGlow.scale.setScalar(0.7 + 0.5 * glowRise);

    const liftRaw = clamp01((tt - 0.10) / 0.75);
    const lift = smooth(liftRaw);
    lid.position.y = lidY0 + lift * 2.8;         // floats up and off the top
    lid.rotation.z = lift * 0.22; lid.rotation.x = lift * 0.16;

    const washDim = smooth(clamp01((tt - HANDOFF) / (1 - HANDOFF)));

    // Lid fades as it rises; base + ribbon fade only at the very end.
    const lidFade = smooth(clamp01((liftRaw - 0.45) / 0.5));
    const baseFade = smooth(clamp01((liftRaw - 0.82) / 0.18));
    const lidWantW = lidFade <= 0.0001, baseWantW = baseFade <= 0.0001;
    if (lidBoxMat.depthWrite !== lidWantW) { lidBoxMat.depthWrite = lidWantW; lidGoldMat.depthWrite = lidWantW; }
    if (boxMat.depthWrite !== baseWantW) { boxMat.depthWrite = baseWantW; goldMat.depthWrite = baseWantW; }
    lidBoxMat.opacity = lidGoldMat.opacity = 1 - lidFade;
    boxMat.opacity = goldMat.opacity = 1 - baseFade;

    // Light bursts from the box top as the lid clears it, then the wash climax.
    const revealF = smooth(clamp01(lift / 0.2));
    const flareF  = smooth(clamp01((tt - (HANDOFF - 0.13)) / 0.09));
    innerMat.opacity = (0.14 + 0.36 * flareF) * (1 - washDim) * revealF;
    innerLight.visible = innerMat.opacity > 0.002;
    const ws = 1 + 1.1 * flareF; innerLight.scale.set(ws, ws, 1);
    washMat.opacity = 0.78 * flareF * (1 - washDim);
    washQuad.visible = washMat.opacity > 0.002;
    innerGlow.intensity = (0.2 + 2.6 * lift) * (1 - washDim);
  }

  // Head-on cover fit + a forward DOLLY rising toward the opening box as the lid lifts.
  function framing(t, fov, aspect) {
    const tn = Math.tan(((fov || 34) * Math.PI / 180) / 2);
    const realAsp = aspect || 1;
    const wide = realAsp > 0.85;
    const asp = wide ? HW / HH : realAsp;
    const margin = wide ? 1.14 : 1.0;
    const zBase = Math.min(HH / tn, HW / (tn * asp)) * margin * S;
    const dolly = smooth(clamp01((clamp01(t) - 0.10) / 0.75));
    return { y: 0, z: zBase * (1 - 0.5 * dolly), lookAtY: (boxY + 0.35) * S * dolly };
  }

  applyVisual(0);

  function dispose() {
    if (disposed) return; disposed = true;
    group.traverse((o) => {
      if (o.geometry) o.geometry.dispose();
      if (o.material) {
        const mats = Array.isArray(o.material) ? o.material : [o.material];
        for (const m of mats) { for (const k of ["map", "normalMap", "roughnessMap", "metalnessMap", "envMap"]) if (m[k] && m[k].dispose) m[k].dispose(); m.dispose(); }
      }
    });
    for (const d of disposables) { try { d.dispose(); } catch { /* ignore */ } }
  }

  return {
    group, REVEAL_AT: 0.10, DURATION: 6.0,
    DIRECT_HANDOFF: true, HANDOFF_AT: HANDOFF, WASH_TAIL: true,
    BAKE_QUEUE: pendingBakes, WARM_TEXTURES: [innerTex, pressTex],
    setOpen(t, fov, aspect) { applyVisual(t); return framing(t, fov, aspect); },
    framePose(fov, aspect) { return framing(0, fov, aspect); },
    refreshCard() { /* the gift shape has no baked card */ },
    dispose,
  };
}

// ── GILDED BOOK SHAPE ─────────────────────────────────────────────────────────
// A closed burgundy-leather-and-gold book facing the viewer; the front cover SWINGS
// open on the spine to a warm light between the pages, camera easing in -> hand-off.
function buildEnvelopeBook({ pal, preset } = {}) {
  const coverCol  = col(pal && pal.cover, "#5e1a2c");
  const goldCol   = col(pal && pal.gold, "#d8b45a");
  const goldBright = col(pal && pal.goldBright, "#f4e2a8");
  const pageCol   = col(pal && pal.page, "#f3ead2");
  const glowCol   = col(preset && preset.glow, "#ffe6c2");

  const group = new THREE.Group();
  const S = 3.0; group.scale.setScalar(S);
  let disposed = false;
  const disposables = [];
  const pendingBakes = [];
  const env = makeStudioEnvB(disposables);
  const grain = makeLinenGrainB(disposables);
  const HW = 0.94, HH = 1.94;

  const bw = 0.74, bh = 1.12, bd = 0.14;   // book half-extents (portrait), half-thickness

  // Interior light + wash — glows from between the pages as the cover opens.
  const innerCanvas = document.createElement("canvas"); innerCanvas.width = innerCanvas.height = 256;
  const innerTex = new THREE.CanvasTexture(innerCanvas); disposables.push(innerTex);
  pendingBakes.push(() => { paintSprite(innerCanvas, "glow"); innerTex.needsUpdate = true; });
  const innerMat = new THREE.MeshBasicMaterial({ map: innerTex, color: glowCol, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending });
  const innerLight = new THREE.Mesh(new THREE.PlaneGeometry(bw * 4.4, bh * 4.4), innerMat);
  // In FRONT of the cream pages but BEHIND the closed front cover, so the swinging
  // cover reveals the light flooding out (not the flat opaque page face).
  innerLight.position.set(0, 0, bd + 0.01); innerLight.renderOrder = 2; group.add(innerLight);
  const washCol = glowCol.clone().lerp(new THREE.Color("#fff7e8"), 0.15);
  const washMat = new THREE.MeshBasicMaterial({ color: washCol, transparent: true, opacity: 0, depthWrite: false, depthTest: false });
  const washQuad = new THREE.Mesh(new THREE.PlaneGeometry(30, 30), washMat);
  washQuad.position.set(0, 0, 0.5); washQuad.renderOrder = 1; washQuad.visible = false; group.add(washQuad);

  const coverMat = new THREE.MeshStandardMaterial({ color: coverCol, roughness: 0.62, metalness: 0, bumpMap: grain, bumpScale: 0.012, envMap: env, envMapIntensity: 0.14, emissive: coverCol, emissiveIntensity: 0.14, side: THREE.DoubleSide, transparent: true, depthWrite: true });
  const goldMat = new THREE.MeshPhysicalMaterial({ color: goldCol, metalness: 0.96, roughness: 0.26, clearcoat: 0.5, envMap: env, envMapIntensity: 1.2, emissive: goldBright, emissiveIntensity: 0.16, side: THREE.DoubleSide, transparent: true, depthWrite: true });
  const pageMat = new THREE.MeshStandardMaterial({ color: pageCol, roughness: 0.85, metalness: 0, emissive: pageCol, emissiveIntensity: 0.1, side: THREE.DoubleSide, transparent: true, depthWrite: true });
  const frontMat = coverMat.clone();   // front cover fades on its own clock as it opens
  const frontGold = goldMat.clone();

  // Page block (cream, with gilded gold edges) + back cover + spine.
  const pages = new THREE.Mesh(new THREE.BoxGeometry(bw * 2 * 0.92, bh * 2 * 0.95, bd * 2 * 0.9), pageMat);
  group.add(pages);
  const edge = new THREE.Mesh(new THREE.BoxGeometry(0.03, bh * 2 * 0.96, bd * 2 * 0.92), goldMat);
  edge.position.set(bw * 0.92, 0, 0); group.add(edge);   // gilded fore-edge (right)
  const backCover = new THREE.Mesh(new THREE.BoxGeometry(bw * 2, bh * 2, 0.05), coverMat);
  backCover.position.set(0, 0, -bd - 0.02); group.add(backCover);
  const spine = new THREE.Mesh(new THREE.BoxGeometry(0.09, bh * 2, bd * 2 + 0.1), coverMat);
  spine.position.set(-bw - 0.02, 0, 0); group.add(spine);

  // Front cover - hinged on the SPINE (left edge); swings open toward the viewer.
  const front = new THREE.Group();
  front.position.set(-bw, 0, bd + 0.03);
  const fc = new THREE.Mesh(new THREE.BoxGeometry(bw * 2, bh * 2, 0.05), frontMat);
  fc.position.set(bw, 0, 0); front.add(fc);
  // gold border frame + a central diamond emblem on the front cover
  const brd = (() => {
    const w = bw * 2 * 0.82, h = bh * 2 * 0.88, tw = 0.05;
    const sh = new THREE.Shape();
    sh.moveTo(-w / 2, -h / 2); sh.lineTo(w / 2, -h / 2); sh.lineTo(w / 2, h / 2); sh.lineTo(-w / 2, h / 2); sh.closePath();
    const iw = w - 2 * tw, ih = h - 2 * tw; const ho = new THREE.Path();
    ho.moveTo(-iw / 2, -ih / 2); ho.lineTo(-iw / 2, ih / 2); ho.lineTo(iw / 2, ih / 2); ho.lineTo(iw / 2, -ih / 2); ho.closePath();
    sh.holes.push(ho);
    return new THREE.Mesh(new THREE.ExtrudeGeometry(sh, { depth: 0.02, bevelEnabled: false }), frontGold);
  })();
  brd.position.set(bw, 0, 0.03); front.add(brd);
  const emblem = new THREE.Mesh(new THREE.OctahedronGeometry(0.16, 0), frontGold);
  emblem.position.set(bw, 0, 0.05); emblem.scale.set(1, 1.5, 0.4); front.add(emblem);
  group.add(front);

  // Press feedback at the fore-edge.
  const pressCanvas = document.createElement("canvas"); pressCanvas.width = pressCanvas.height = 256;
  const pressTex = new THREE.CanvasTexture(pressCanvas); disposables.push(pressTex);
  pendingBakes.push(() => { paintSprite(pressCanvas, "glow"); pressTex.needsUpdate = true; });
  const pressMat = new THREE.MeshBasicMaterial({ map: pressTex, color: glowCol, transparent: true, opacity: 0, depthWrite: false, depthTest: false, blending: THREE.AdditiveBlending });
  const pressGlow = new THREE.Mesh(new THREE.PlaneGeometry(1.4, bh * 1.6), pressMat);
  pressGlow.position.set(0, 0, bd + 0.4); pressGlow.renderOrder = 6; pressGlow.visible = false; group.add(pressGlow);

  group.add(new THREE.AmbientLight(0xfff3ea, 0.6));
  const key = new THREE.DirectionalLight(0xfff4e2, 1.12); key.position.set(6, 5, 7); group.add(key);
  const fill = new THREE.DirectionalLight(0xeaf0ff, 0.34); fill.position.set(-5, -1.5, 4); group.add(fill);
  const innerGlow = new THREE.PointLight(glowCol, 0.0, 9 * S, 1); innerGlow.position.set(0, 0.1, 0.0); group.add(innerGlow);

  const smooth = (x) => { const c = clamp01(x); return c < 0.5 ? 2 * c * c : 1 - Math.pow(-2 * c + 2, 2) / 2; };
  const HANDOFF = 0.91;

  function applyVisual(t) {
    const tt = clamp01(t);
    // press 0->0.10 . front cover SWINGS open 0.10->0.85 . light glows from the pages .
    // cover + book late-fade . wash -> HANDOFF -> dim
    const glowRise = ease(clamp01(tt / 0.07));
    const glowFall = ease(clamp01((tt - 0.10) / 0.09));
    const pressF = glowRise * (1 - glowFall);
    pressMat.opacity = 0.8 * pressF; pressGlow.visible = pressF > 0.003;

    const openRaw = clamp01((tt - 0.10) / 0.75);
    const openF = smooth(openRaw);
    front.rotation.y = openF * 2.4;             // swings wide open on the spine (~137deg)

    const washDim = smooth(clamp01((tt - HANDOFF) / (1 - HANDOFF)));

    const frontFade = smooth(clamp01((openRaw - 0.55) / 0.45));
    const bookFade = smooth(clamp01((openRaw - 0.82) / 0.18));
    const fWantW = frontFade <= 0.0001, bWantW = bookFade <= 0.0001;
    if (frontMat.depthWrite !== fWantW) { frontMat.depthWrite = fWantW; frontGold.depthWrite = fWantW; }
    if (coverMat.depthWrite !== bWantW) { coverMat.depthWrite = bWantW; goldMat.depthWrite = bWantW; pageMat.depthWrite = bWantW; }
    frontMat.opacity = frontGold.opacity = 1 - frontFade;
    coverMat.opacity = goldMat.opacity = pageMat.opacity = 1 - bookFade;

    const revealF = smooth(clamp01(openF / 0.3));
    const flareF  = smooth(clamp01((tt - (HANDOFF - 0.13)) / 0.09));
    innerMat.opacity = (0.14 + 0.36 * flareF) * (1 - washDim) * revealF;
    innerLight.visible = innerMat.opacity > 0.002;
    const ws = 1 + 1.0 * flareF; innerLight.scale.set(ws, ws, 1);
    washMat.opacity = 0.78 * flareF * (1 - washDim);
    washQuad.visible = washMat.opacity > 0.002;
    innerGlow.intensity = (0.2 + 2.4 * openF) * (1 - washDim);
  }

  function framing(t, fov, aspect) {
    const tn = Math.tan(((fov || 34) * Math.PI / 180) / 2);
    const realAsp = aspect || 1;
    const wide = realAsp > 0.85;
    const asp = wide ? HW / HH : realAsp;
    const margin = wide ? 1.14 : 1.0;
    const zBase = Math.min(HH / tn, HW / (tn * asp)) * margin * S;
    const dolly = smooth(clamp01((clamp01(t) - 0.10) / 0.75));
    return { y: 0, z: zBase * (1 - 0.28 * dolly), lookAtY: 0 };
  }

  applyVisual(0);

  function dispose() {
    if (disposed) return; disposed = true;
    group.traverse((o) => {
      if (o.geometry) o.geometry.dispose();
      if (o.material) {
        const mats = Array.isArray(o.material) ? o.material : [o.material];
        for (const m of mats) { for (const k of ["map", "normalMap", "roughnessMap", "metalnessMap", "envMap"]) if (m[k] && m[k].dispose) m[k].dispose(); m.dispose(); }
      }
    });
    for (const d of disposables) { try { d.dispose(); } catch { /* ignore */ } }
  }

  return {
    group, REVEAL_AT: 0.10, DURATION: 6.0,
    DIRECT_HANDOFF: true, HANDOFF_AT: HANDOFF, WASH_TAIL: true,
    BAKE_QUEUE: pendingBakes, WARM_TEXTURES: [innerTex, pressTex],
    setOpen(t, fov, aspect) { applyVisual(t); return framing(t, fov, aspect); },
    framePose(fov, aspect) { return framing(0, fov, aspect); },
    refreshCard() { /* the book shape has no baked card */ },
    dispose,
  };
}
