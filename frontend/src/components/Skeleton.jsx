// Skeleton placeholders shown while data is loading. The shimmer animation
// itself lives in GlobalStyle.jsx as `.skeleton`; these components only set
// shape and layout.
//
// Shapes:
//   variant="card" (default) — thumbnail + two text lines (photographer files).
//   variant="row"            — a list row: title + subtitle, no thumbnail
//                              (guest lists, delivery lists, user lists).
//   variant="stat"           — a KPI tile: small label + big number block
//                              (dashboard stat grids).
//   variant="chart"          — a card-height block for a chart placeholder
//                              (analytics charts).

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

// A KPI stat tile: a short label line over a large value block.
function SkeletonStat({ style }) {
  return (
    <div style={{
      background: "#0f0f15",
      border: "1px solid rgba(255,255,255,.05)",
      borderRadius: 14, padding: "16px 18px",
      display: "flex", flexDirection: "column", gap: 10,
      ...style,
    }}>
      <div className="skeleton" style={{ width: "45%", height: 10, borderRadius: 6 }}/>
      <div className="skeleton" style={{ width: "60%", height: 24, borderRadius: 8 }}/>
    </div>
  );
}

// A chart placeholder: caption line over a tall block.
function SkeletonChart({ style }) {
  return (
    <div style={{
      background: "#0f0f15",
      border: "1px solid rgba(255,255,255,.05)",
      borderRadius: 14, padding: 16, marginBottom: 8,
      display: "flex", flexDirection: "column", gap: 12,
      ...style,
    }}>
      <div className="skeleton" style={{ width: "40%", height: 12, borderRadius: 6 }}/>
      <div className="skeleton" style={{ width: "100%", height: 160, borderRadius: 10 }}/>
    </div>
  );
}

const VARIANTS = {
  card: SkeletonCard,
  row: SkeletonRow,
  stat: SkeletonStat,
  chart: SkeletonChart,
};

// N stacked skeletons. `variant` picks the shape; defaults preserve the prior
// card behaviour so existing callers are unaffected.
export function SkeletonList({ count = 3, variant = "card" }) {
  const Item = VARIANTS[variant] || SkeletonCard;
  return (
    <>
      {Array.from({ length: count }).map((_, i) => <Item key={i}/>)}
    </>
  );
}
