// GLSL for the celestial particle field. One BufferGeometry of points, one
// draw call. Per-particle drift + twinkle happen here (cheap on the GPU); the
// camera fly-forward + parallax are done in JS by moving the camera, which
// gives natural depth parallax for free through perspective projection.

export const VERT = /* glsl */ `
  uniform float uTime;
  uniform float uSizeScale;   // dpr * tier size factor — keeps motes a constant visual size
  uniform float uStarSize;    // per-design background-star SIZE multiplier (1 = theme baseline)
  uniform float uCull;        // 1.0 = all visible; FPS guard lowers this to thin the field live
  attribute float aSeed;
  attribute float aSize;
  attribute float aSpeed;
  varying float vAlpha;
  varying float vTwinkle;

  const float TAU = 6.2831853;

  void main() {
    // Particles past the live cull fraction are pushed outside clip space and
    // given zero size — a free way to scale density down without rebuilding buffers.
    if (aSeed > uCull) {
      gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
      gl_PointSize = 0.0;
      vAlpha = 0.0;
      return;
    }

    vec3 p = position;
    float t = uTime * aSpeed;
    p.x += sin(t + aSeed * TAU) * 1.3;
    p.y += cos(t * 0.8 + aSeed * TAU) * 1.3 + sin(t * 0.3) * 0.5;
    p.z += sin(t * 0.5 + aSeed * 3.14159) * 0.9;

    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    float dist = -mv.z;

    // Volumetric depth: fade in from the far plane and fade out as motes pass
    // close to the camera, so the field has a soft, bottomless feel.
    vAlpha = smoothstep(150.0, 95.0, dist) * smoothstep(1.0, 14.0, dist);
    vTwinkle = 0.55 + 0.45 * sin(uTime * 2.0 * aSpeed + aSeed * 20.0);

    gl_PointSize = aSize * uSizeScale * uStarSize * (300.0 / max(dist, 1.0));
    gl_Position = projectionMatrix * mv;

    // Screen-space side-weighting for legibility: keep the central ~45% of the
    // viewport nearly clear (a faint 6% floor — "a little in the central") and
    // let motes gather toward the left/right edges where there's no text. NDC is
    // screen-space, so the clear corridor tracks the viewport, not world space.
    vec2 ndc = gl_Position.xy / gl_Position.w;
    float edge = mix(0.06, 1.0, smoothstep(0.0, 0.62, abs(ndc.x)));
    vAlpha *= edge;
  }
`;

export const FRAG = /* glsl */ `
  precision mediump float;
  uniform vec3 uCore;
  uniform vec3 uGlow;
  uniform float uIsLight;
  uniform float uStarOpacity; // per-design background-star CLARITY/opacity multiplier (1 = baseline)
  varying float vAlpha;
  varying float vTwinkle;

  void main() {
    vec2 uv = gl_PointCoord - 0.5;
    float d = length(uv);
    if (d > 0.5) discard;

    float core = smoothstep(0.5, 0.0, d);
    float halo = smoothstep(0.5, 0.12, d);
    vec3 col = mix(uGlow, uCore, core);

    // Dark themes: bright additive core+halo. Light themes: softer halo-only
    // motes (normal blending is set on the material), kept subtle so they read
    // as floating dust over the pale background rather than muddy blobs.
    float a = uIsLight > 0.5
      ? halo * 0.28 * vAlpha * vTwinkle
      : (core * 0.9 + halo * 0.4) * vAlpha * vTwinkle;

    gl_FragColor = vec4(col, a * uStarOpacity);
  }
`;
