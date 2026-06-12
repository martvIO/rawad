// Animated brand logo — renders the gold SVG with a soft glow aura.
import { BRAND_ICON_SVG, BRAND_FULL_SVG } from "../assets/brandSvg.js";

export function BrandLogo({ size = 80, withText = false }) {
  // The icon-only logo is wider than it is tall (5:4); the with-text variant
  // is roughly 1.16:1. We size by HEIGHT and let width follow the aspect ratio.
  const aspect = withText ? 592 / 512 : 480 / 384;
  const w = Math.round(size * aspect);
  const h = size;
  return (
    <div style={{
      width: w, height: h, position: "relative",
      animation: "sealPop .6s cubic-bezier(.17,.67,.35,1.4) both",
      display: "inline-flex", alignItems: "center", justifyContent: "center",
      flexShrink: 0,
    }}>
      {/* Soft gold aura behind the logo */}
      <div style={{
        position: "absolute", inset: -6, borderRadius: "50%",
        background: "radial-gradient(circle, rgba(201,168,76,.22) 0%, transparent 70%)",
        animation: "glowPulse 2.8s ease-in-out infinite",
        pointerEvents: "none",
      }}/>
      <div
        style={{ width: "100%", height: "100%", position: "relative", display: "flex" }}
        dangerouslySetInnerHTML={{ __html: withText ? BRAND_FULL_SVG : BRAND_ICON_SVG }}
      />
    </div>
  );
}
