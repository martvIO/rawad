// Card — thin wrapper over the existing GlobalStyle `.card` / `.card-hover` /
// `.gold-card` classes. It renders the exact same classNames those call-sites
// already use, so migrating a hand-rolled `<div className="card">` to <Card>
// produces byte-identical CSS output (zero visual diff). See
// frontend/src/styles/GlobalStyle.jsx for the class definitions.

const VARIANT_CLASS = {
  plain: "card",
  hover: "card card-hover",
  gold: "gold-card",
};

export function Card({
  variant = "plain",
  as: Tag = "div",
  className = "",
  style,
  children,
  ...rest
}) {
  const base = VARIANT_CLASS[variant] || VARIANT_CLASS.plain;
  const cls = className ? `${base} ${className}` : base;
  return (
    <Tag className={cls} style={style} {...rest}>
      {children}
    </Tag>
  );
}
