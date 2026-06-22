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
  // Hourglass — pending / waiting.
  hourglass: (
    <>
      <path d="M6 3h12M6 21h12" />
      <path d="M7 3v3l5 6 5-6V3" />
      <path d="M7 21v-3l5-6 5 6v3" />
    </>
  ),
  // Car — en route / delivery in progress.
  car: (
    <>
      <path d="M5 11l1.6-4.5A2 2 0 0 1 8.5 5h7a2 2 0 0 1 1.9 1.5L19 11" />
      <rect x="3" y="11" width="18" height="6" rx="2" />
      <circle cx="7.5" cy="17.5" r="1.5" />
      <circle cx="16.5" cy="17.5" r="1.5" />
    </>
  ),
  // Bell with a slash — no answer / silenced.
  bellOff: (
    <>
      <path d="M6 10a6 6 0 0 1 9.5-4.8" />
      <path d="M18 11v4l2 2H8" />
      <path d="M10 20a2.5 2.5 0 0 0 4 0" />
      <path d="M4 4l16 16" />
    </>
  ),
  // Circle with a slash — refused / blocked.
  ban: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M5.6 5.6l12.8 12.8" />
    </>
  ),
  // Magnifier — search.
  search: (
    <>
      <circle cx="11" cy="11" r="6" />
      <path d="m20 20-3.6-3.6" />
    </>
  ),
  // Camera — photos.
  camera: (
    <>
      <path d="M4 8h3l1.5-2h7L17 8h3a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1z" />
      <circle cx="12" cy="13" r="3.2" />
    </>
  ),
  // Signal arcs — live location / broadcast.
  broadcast: (
    <>
      <circle cx="12" cy="14.5" r="1.6" />
      <path d="M8.6 11.1a5 5 0 0 1 6.8 0" />
      <path d="M6 8.4a8.5 8.5 0 0 1 12 0" />
    </>
  ),
  // Circular arrow — refresh / updating.
  refresh: (
    <>
      <path d="M21 12a9 9 0 1 1-2.6-6.3" />
      <path d="M21 4v5h-5" />
    </>
  ),
  // Lines — list / clipboard.
  list: (
    <>
      <path d="M8 6h12M8 12h12M8 18h12" />
      <path d="M4 6h.02M4 12h.02M4 18h.02" />
    </>
  ),
  // Two figures — people / team.
  users: (
    <>
      <circle cx="9" cy="8" r="3.2" />
      <path d="M3.5 19a5.5 5.5 0 0 1 11 0" />
      <path d="M16 5.2a3.2 3.2 0 0 1 0 5.6" />
      <path d="M17.5 19a5.5 5.5 0 0 0-3-4.9" />
    </>
  ),
  // Credit card — payment.
  card: (
    <>
      <rect x="3" y="5" width="18" height="14" rx="2.5" />
      <path d="M3 9.5h18" />
      <path d="M7 14.5h4" />
    </>
  ),
  // Palette — design.
  palette: (
    <>
      <path d="M12 3a9 9 0 1 0 0 18 2 2 0 0 0 1.6-3.2 2 2 0 0 1 1.6-3.2H18a3 3 0 0 0 3-3c0-4.4-4-8.6-9-8.6z" />
      <circle cx="8" cy="11" r="1" />
      <circle cx="12" cy="8" r="1" />
      <circle cx="16" cy="11" r="1" />
    </>
  ),
  // Calendar — date.
  calendar: (
    <>
      <rect x="3.5" y="5" width="17" height="15" rx="2" />
      <path d="M3.5 9.5h17" />
      <path d="M8 3v3M16 3v3" />
    </>
  ),
  // Paper plane — send.
  send: (
    <>
      <path d="M21 4 3 11l6 2.5L11 20l3.5-6L21 4z" />
      <path d="M9 13.5 21 4" />
    </>
  ),
  // Floppy disk — save.
  save: (
    <>
      <path d="M5 4h11l3 3v13H5z" />
      <path d="M8 4v5h7V4" />
      <rect x="8.5" y="13" width="7" height="5" />
    </>
  ),
  // Lightbulb — tip.
  bulb: (
    <>
      <path d="M12 3a6 6 0 0 0-4 10.5c.6.6 1 1.3 1 2.1h6c0-.8.4-1.5 1-2.1A6 6 0 0 0 12 3z" />
      <path d="M9.5 18.5h5M10.5 21h3" />
    </>
  ),
  // Up-right arrow — share / open externally.
  share: (
    <>
      <path d="M7 17 17 7" />
      <path d="M8 7h9v9" />
    </>
  ),
  // Music note.
  music: (
    <>
      <path d="M9 18V6l10-2v10" />
      <circle cx="6.5" cy="18" r="2.5" />
      <circle cx="16.5" cy="16" r="2.5" />
    </>
  ),
  // Dash — neutral / not-sent.
  minus: <path d="M6 12h12" />,
  // Cross — absent / rejected / negative outcome.
  x: <path d="m6 6 12 12M18 6 6 18" />,
  // Eye — awaiting review.
  eye: (
    <>
      <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z" />
      <circle cx="12" cy="12" r="3" />
    </>
  ),
  // Pencil — draft / edit.
  pencil: (
    <>
      <path d="M4 20h4L18 10l-4-4L4 16z" />
      <path d="m13.5 6.5 4 4" />
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
