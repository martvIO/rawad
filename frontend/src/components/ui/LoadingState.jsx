// LoadingState / SuspenseFallback — standardize loading UI so every data
// surface shows a shape-matched skeleton (not bare text or a lone spinner).
// `variant` maps to the Skeleton shapes (card | row | stat | chart); `inline`
// renders the small `.spinner` for in-button/toast use. SuspenseFallback is a
// branded full-area fallback for React.Suspense boundaries.

import { C } from "../../styles/theme.js";
import { SkeletonList } from "../Skeleton.jsx";

export function LoadingState({ variant = "card", count = 3, label }) {
  if (variant === "inline") {
    return (
      <span style={{ display: "inline-flex", alignItems: "center", gap: 8, color: C.goldDim }}>
        <span className="spinner" aria-hidden="true" />
        {label}
      </span>
    );
  }
  return <SkeletonList count={count} variant={variant} />;
}

export function SuspenseFallback({ label }) {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 12,
        padding: 48,
        minHeight: 200,
      }}
    >
      <span className="spinner" style={{ width: 22, height: 22 }} aria-hidden="true" />
      {label && <div style={{ color: C.goldDim, fontSize: 13 }}>{label}</div>}
    </div>
  );
}
