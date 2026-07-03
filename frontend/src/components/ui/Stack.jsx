// Stack / Inline — flex layout helper that replaces the dozens of
// `display:flex; gap:N` inline blocks with a token-aware component. `gap` is a
// key into the `space` scale (so `gap={4}` → 16px); a raw number is passed
// through unchanged. Uses logical flex (RTL-safe). See shared theme `space`.

import { space } from "../../styles/theme.js";

function resolveGap(gap) {
  if (typeof gap === "number" && space[gap] !== undefined) return space[gap];
  return gap;
}

export function Stack({
  direction = "column",
  gap = 4,
  align,
  justify,
  wrap = false,
  as: Tag = "div",
  style,
  children,
  ...rest
}) {
  return (
    <Tag
      style={{
        display: "flex",
        flexDirection: direction,
        gap: resolveGap(gap),
        alignItems: align,
        justifyContent: justify,
        flexWrap: wrap ? "wrap" : undefined,
        ...style,
      }}
      {...rest}
    >
      {children}
    </Tag>
  );
}

// Horizontal Stack with sensible defaults (row, vertically centered).
export function Inline({ align = "center", ...props }) {
  return <Stack {...props} direction="row" align={align} />;
}
