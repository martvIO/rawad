// Inline-SVG icon set — no runtime icon-library dependency, single source of
// truth for the brand glyphs. All icons are 24×24, stroke-based, and inherit
// `currentColor`, so they take the gold/accent of whatever wraps them and stay
// crisp at any size (unlike multicolor emoji, which clash with the dark-gold
// theme and render differently per OS).
//
// Semantic note: `mail` = handwritten / printed invite, `mobile` = digital
// WhatsApp invite. Keep that pairing wherever the two invite types are shown.

const PATHS = {
  // Envelope — handwritten / printed invitation.
  mail: (
    <>
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <path d="m3 7 9 6 9-6" />
    </>
  ),
  // Phone — digital / WhatsApp invitation.
  mobile: (
    <>
      <rect x="7" y="3" width="10" height="18" rx="2.2" />
      <path d="M10.5 18h3" />
    </>
  ),
  // Clock — time saved.
  clock: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7.5V12l3 2" />
    </>
  ),
  // Gem — premium tier.
  gem: (
    <>
      <path d="M12 21 3 9l3-5h12l3 5z" />
      <path d="M3 9h18" />
      <path d="M9 4 7 9l5 12" />
      <path d="m15 4 2 5-5 12" />
    </>
  ),
  // Checkmark.
  check: <path d="m4.5 12.5 5 5 10-11" />,
  // Hamburger menu.
  menu: <path d="M4 7h16M4 12h16M4 17h16" />,
  // Close.
  close: <path d="m6 6 12 12M18 6 6 18" />,
  // Map pin — location / address.
  pin: (
    <>
      <path d="M12 21s7-6.3 7-11a7 7 0 1 0-14 0c0 4.7 7 11 7 11Z" />
      <circle cx="12" cy="10" r="2.5" />
    </>
  ),
  // Warning triangle.
  warning: (
    <>
      <path d="M12 3.5 21 19H3z" />
      <path d="M12 9.5v4" />
      <path d="M12 16.3v.2" />
    </>
  ),
  // Info circle.
  info: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 11v5" />
      <path d="M12 8v.2" />
    </>
  ),
};

export function Icon({ name, size = 24, strokeWidth = 1.6, style, title, ...rest }) {
  const body = PATHS[name];
  if (!body) return null;
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      role={title ? "img" : undefined}
      aria-hidden={title ? undefined : "true"}
      aria-label={title}
      focusable="false"
      style={{ display: "block", ...style }}
      {...rest}
    >
      {title ? <title>{title}</title> : null}
      {body}
    </svg>
  );
}
