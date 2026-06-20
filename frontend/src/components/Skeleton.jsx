// Skeleton placeholders shown while data is loading. The shimmer animation
// itself lives in GlobalStyle.jsx as `.skeleton`; these components only set
// shape and layout.
//
// Two shapes:
//   variant="card" (default) — thumbnail + two text lines (photographer files).
//   variant="row"            — a list row: title + subtitle, no thumbnail
//                              (guest lists, delivery lists, user lists).

function SkeletonCard({ style }) {
  return (
    <div style={{
      background: "#0f0f15",
      border: "1px solid rgba(255,255,255,.05)",
      borderRadius: 14, padding: "12px 14px", marginBottom: 8,
      display: "flex", gap: 10, alignItems: "center",
      ...style,
    }}>
      <div className="skeleton" style={{ width: 36, height: 36, borderRadius: 8 }}/>
      <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 6 }}>
        <div className="skeleton" style={{ width: "62%", height: 12, borderRadius: 6 }}/>
        <div className="skeleton" style={{ width: "38%", height: 10, borderRadius: 6 }}/>
      </div>
    </div>
  );
}

function SkeletonRow({ style }) {
  return (
    <div style={{
      background: "#0f0f15",
      border: "1px solid rgba(255,255,255,.05)",
      borderRadius: 12, padding: "14px 16px", marginBottom: 8,
      display: "flex", flexDirection: "column", gap: 8,
      ...style,
    }}>
      <div className="skeleton" style={{ width: "50%", height: 13, borderRadius: 6 }}/>
      <div className="skeleton" style={{ width: "72%", height: 10, borderRadius: 6 }}/>
    </div>
  );
}

// N stacked skeletons. `variant` picks the shape; defaults preserve the prior
// card behaviour so existing callers are unaffected.
export function SkeletonList({ count = 3, variant = "card" }) {
  const Item = variant === "row" ? SkeletonRow : SkeletonCard;
  return (
    <>
      {Array.from({ length: count }).map((_, i) => <Item key={i}/>)}
    </>
  );
}
