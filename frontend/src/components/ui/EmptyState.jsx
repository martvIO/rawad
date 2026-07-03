// EmptyState — one consistent empty-state block to replace the bare `.card`
// "no results" / "nothing here yet" divs scattered across the portals. Renders
// a centered card with a gold Icon, title, body and optional action. All copy
// is caller-supplied (i18n `t(key)`). Colors/spacing come from theme tokens.

import { C, space, type } from "../../styles/theme.js";
import { Icon } from "../icons/Icon.jsx";

export function EmptyState({ icon, title, body, action, style }) {
  return (
    <div
      className="card"
      style={{
        textAlign: "center",
        padding: space[8],
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: space[3],
        ...style,
      }}
    >
      {icon && (
        <span style={{ color: C.gold, opacity: 0.85, display: "flex" }}>
          <Icon name={icon} size={32} />
        </span>
      )}
      {title && (
        <div style={{ fontSize: type["2xl"], fontWeight: type.weight.bold, color: C.goldLight }}>
          {title}
        </div>
      )}
      {body && (
        <div style={{ fontSize: type.md, color: C.dim, maxWidth: 360, lineHeight: 1.6 }}>
          {body}
        </div>
      )}
      {action && <div style={{ marginTop: space[2] }}>{action}</div>}
    </div>
  );
}
