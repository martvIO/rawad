// Button — wrapper over the GlobalStyle `.gold-btn` / `.ghost-btn` / `.danger-btn`
// classes. With no `loading`, the output is identical to the existing inline
// buttons (zero visual diff); `loading` prepends the shared `.spinner` and
// disables the control. Supports rendering as an <a> for anchor CTAs (the
// `.ghost-btn` class already styles anchors, e.g. the landing "how it works" link).
// See frontend/src/styles/GlobalStyle.jsx.

const VARIANT_CLASS = {
  gold: "gold-btn",
  ghost: "ghost-btn",
  danger: "danger-btn",
};

export function Button({
  variant = "gold",
  as: Tag = "button",
  loading = false,
  disabled = false,
  fullWidth = false,
  type = "button",
  className = "",
  style,
  children,
  ...rest
}) {
  const base = VARIANT_CLASS[variant] || VARIANT_CLASS.gold;
  const cls = className ? `${base} ${className}` : base;
  const mergedStyle = fullWidth ? { width: "100%", ...style } : style;
  const isDisabled = disabled || loading;
  // <button> gets the native disabled/type; anchors get aria-disabled instead.
  const tagProps =
    Tag === "button"
      ? { type, disabled: isDisabled }
      : { "aria-disabled": isDisabled || undefined };
  return (
    <Tag className={cls} style={mergedStyle} {...tagProps} {...rest}>
      {loading && (
        <span className="spinner" style={{ marginInlineEnd: 8 }} aria-hidden="true" />
      )}
      {children}
    </Tag>
  );
}
