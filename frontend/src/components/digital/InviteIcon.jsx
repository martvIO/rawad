// One bespoke icon set for the digital invitation.
//
// Emoji used to stand in for iconography across the nav rail, venue rows, dock,
// countdown, guestbook and wallet. Emoji render as a different picture on every
// platform (and in colour), so they clashed with the hand-drawn SVG the rest of
// the invitation is built from — the single most visible "assembled, not
// authored" tell on the page.
//
// Every glyph here shares ONE 24x24 grid and ONE 1.6 stroke, and inherits
// `currentColor`, so an icon simply takes the live theme accent from whatever
// element it sits in — no per-theme wiring, no colour drift.
const GLYPHS = {
  top: <path d="M12 19.5V5 M5.5 11.5L12 5l6.5 6.5" />,
  story: <path d="M12 6.6C10.4 5.1 7.9 4.6 4 5.1v13c3.9-.5 6.4 0 8 1.5 1.6-1.5 4.1-2 8-1.5v-13c-3.9-.5-6.4 0-8 1.5z M12 6.6v13" />,
  gallery: (
    <>
      <rect x="3.2" y="5.2" width="17.6" height="13.6" rx="2" />
      <circle cx="8.8" cy="10.2" r="1.6" />
      <path d="M20.8 15.4l-4.8-4.6-8 8" />
    </>
  ),
  details: <path d="M9 6.5h11.5 M9 12h11.5 M9 17.5h11.5 M4 6.5h.01 M4 12h.01 M4 17.5h.01" />,
  venue: (
    <>
      <path d="M12 21s6.8-5.4 6.8-10.6a6.8 6.8 0 1 0-13.6 0C5.2 15.6 12 21 12 21z" />
      <circle cx="12" cy="10.2" r="2.5" />
    </>
  ),
  countdown: (
    <>
      <circle cx="12" cy="12.4" r="8.2" />
      <path d="M12 7.6v4.8l3 2" />
    </>
  ),
  rsvp: (
    <>
      <circle cx="12" cy="12" r="8.4" />
      <path d="M8.3 12.3l2.5 2.4 4.9-5" />
    </>
  ),
  gift: (
    <>
      <rect x="3.4" y="8.4" width="17.2" height="3.5" rx="1" />
      <path d="M4.8 11.9v8.3h14.4v-8.3 M12 8.4v11.8" />
      <path d="M12 8.4C10.6 8.4 8.2 8 8.2 6.1c0-1.3 1.1-1.9 1.9-1.9 1.6 0 1.9 2.6 1.9 4.2ZM12 8.4c1.4 0 3.8-.4 3.8-2.3 0-1.3-1.1-1.9-1.9-1.9-1.6 0-1.9 2.6-1.9 4.2Z" />
    </>
  ),
  guestbook: (
    <>
      <rect x="3.2" y="5.6" width="17.6" height="12.8" rx="2" />
      <path d="M3.8 6.9L12 12.9l8.2-6" />
    </>
  ),
  car: (
    <>
      <path d="M4.2 16.4v-3.9l1.9-5.1h11.8l1.9 5.1v3.9z M4.2 16.4h15.6" />
      <path d="M7 19.8v-3.4 M17 19.8v-3.4 M6.2 12.6h11.6" />
    </>
  ),
  bed: <path d="M3.2 18.4v-6.2h17.6v6.2 M3.2 18.4h17.6 M3.2 12.2V6.6 M7 12.2V9.6h4.6v2.6" />,
  share: <path d="M12 15.2V3.4 M8.2 7.2L12 3.4l3.8 3.8 M5.2 13v6.6a1.4 1.4 0 0 0 1.4 1.4h10.8a1.4 1.4 0 0 0 1.4-1.4V13" />,
  calendar: (
    <>
      <rect x="3.4" y="5.2" width="17.2" height="15.4" rx="2" />
      <path d="M3.4 10.1h17.2 M8 3.4v3.4 M16 3.4v3.4" />
    </>
  ),
  music: (
    <>
      <path d="M9.2 17.6V5.9l9.6-1.9v11.7" />
      <circle cx="6.7" cy="17.6" r="2.5" />
      <circle cx="16.3" cy="15.7" r="2.5" />
    </>
  ),
  celebrate: <path d="M12 3.2l1.8 5.1 5.1 1.8-5.1 1.8L12 17l-1.8-5.1L5.1 10.1l5.1-1.8z M18.6 16.2l.6 1.8 1.8.6-1.8.6-.6 1.8-.6-1.8-1.8-.6 1.8-.6z" />,
  star: <path d="M12 3.8l2.5 5 5.5.8-4 3.9.9 5.5-4.9-2.6-4.9 2.6.9-5.5-4-3.9 5.5-.8z" />,
  ticket: <path d="M4 8.6V7a1.2 1.2 0 0 1 1.2-1.2h13.6A1.2 1.2 0 0 1 20 7v1.6a2.6 2.6 0 0 0 0 5.2V17a1.2 1.2 0 0 1-1.2 1.2H5.2A1.2 1.2 0 0 1 4 17v-3.2a2.6 2.6 0 0 0 0-5.2z M14.2 5.8v12.4" />,
  camera: (
    <>
      <rect x="3.2" y="7" width="17.6" height="13" rx="2" />
      <circle cx="12" cy="13.5" r="3.6" />
      <path d="M8.6 7l1.5-2.6h3.8L15.4 7" />
    </>
  ),
};

export function Icon({ name, size = 18, style }) {
  const glyph = GLYPHS[name];
  if (!glyph) return null;
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      style={{ display: "block", ...style }}
    >
      {glyph}
    </svg>
  );
}
