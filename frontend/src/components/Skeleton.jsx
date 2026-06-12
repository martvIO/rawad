// Skeleton placeholders shown while data is loading. The shimmer animation
// itself lives in GlobalStyle.jsx as `.skeleton`; these components only set
// shape and layout.

// Single photographer-file card placeholder
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

// N stacked card skeletons
export function SkeletonList({ count = 3 }) {
  return (
    <>
      {Array.from({ length: count }).map((_, i) => <SkeletonCard key={i}/>)}
    </>
  );
}

