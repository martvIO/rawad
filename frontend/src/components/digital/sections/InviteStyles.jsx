import { ON_GOLD } from "../inviteShared.jsx";

// ── Scoped styles (all under .dawa-inv so other surfaces are untouched) ─────────
function ViewStyles({ theme, fixed }) {
  return (
    <style>{`
    .dawa-inv ::selection { background: ${theme.accentMuted}; }

    /* Faint damask lattice — a barely-there ornamental texture over the whole
     * invitation. Tinted with the live accent so it adapts to every palette; kept
     * at ~4% so it reads as luxury paper grain, never noise. Robust everywhere
     * (a tiled background image — no clip/mask tricks that mis-render in-app). */
    .dawa-inv::before {
      content: "";
      position: ${fixed ? "fixed" : "absolute"};
      inset: 0;
      z-index: 0;
      pointer-events: none;
      opacity: .045;
      background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='72' height='72' viewBox='0 0 72 72'%3E%3Cg fill='none' stroke='${encodeURIComponent(theme.accent)}' stroke-width='1.1'%3E%3Cpath d='M36 10 L50 36 L36 62 L22 36 Z'/%3E%3Ccircle cx='36' cy='36' r='3.4'/%3E%3Cpath d='M36 0 L36 8 M36 64 L36 72 M0 36 L8 36 M64 36 L72 36'/%3E%3C/g%3E%3C/svg%3E");
      background-size: 72px 72px;
    }

    .dawa-inv .dawa-inv-reveal { opacity: 0; transform: translateY(40px); transition: opacity .9s cubic-bezier(.2,.7,.2,1), transform .9s cubic-bezier(.2,.7,.2,1); }
    .dawa-inv .dawa-inv-reveal.is-in { opacity: 1; transform: none; }

    /* Headings / names: SOLID high-contrast color, not background-clip:text.
     * The clip trick (gradient bg + transparent fill) renders as an unreadable
     * solid BLOCK on several mobile / in-app browsers (Samsung Internet, older
     * Android WebView, some iOS in-app views) that report support but mis-render
     * it — and those are exactly where guests open the WhatsApp invite link.
     * theme.text equals the gradient's brightest stop on every dark theme, so
     * this is visually near-identical yet always readable. !important overrides
     * the per-element inline gradient styles (background + transparent fill). */
    .dawa-inv .dawa-inv-grad {
      background: none !important;
      -webkit-text-fill-color: ${theme.text} !important;
      color: ${theme.text} !important;
    }

    /* Section shell */
    .dawa-inv .dawa-inv-section { position: relative; padding: 96px 24px; max-width: 1080px; margin: 0 auto; z-index: 6; }
    .dawa-inv .dawa-inv-eyebrow { font-size: 11.5px; letter-spacing: 4px; text-transform: uppercase; font-style: italic; display: inline-flex; align-items: center; gap: 14px; margin-bottom: 16px; }
    .dawa-inv .dawa-inv-title { font-weight: 900; font-size: clamp(30px,5vw,48px); line-height: 1.35; margin-bottom: 16px; padding-block: 6px; }
    .dawa-inv .dawa-inv-sub { font-style: italic; font-size: 14px; max-width: 540px; margin: 0 auto; line-height: 1.85; }
    .dawa-inv .dawa-inv-secflourish { margin-bottom: 14px; opacity: .9; }
    .dawa-inv .dawa-inv-secrule { display: flex; align-items: center; justify-content: center; gap: 9px; width: 132px; margin: 4px auto 16px; }
    .dawa-inv .dawa-inv-secrule > span { height: 1px; flex: 1; }
    .dawa-inv .dawa-inv-secrule .dawa-inv-secrule-dot { flex: 0 0 auto; width: 5px; height: 5px; transform: rotate(45deg); }

    /* Hero */
    .dawa-inv .dawa-inv-hero { position: relative; min-height: 100vh; display: flex; flex-direction: column; align-items: center; justify-content: center; text-align: center; padding: 60px 24px; overflow: hidden; z-index: 6; }
    .dawa-inv .dawa-inv-hero-glow { position: absolute; inset: 0; pointer-events: none; }
    /* Gold filigree frame inset on the hero — thin border + heavier corner
     * brackets for an engraved-invitation feel. Perimeter only, never over text. */
    .dawa-inv .dawa-inv-hero-frame { position: absolute; inset: 16px; border: 1px solid; border-radius: 16px; pointer-events: none; opacity: .4; animation: dawa-inv-frame 1.6s .3s ease both; }
    .dawa-inv .dawa-inv-corner { position: absolute; width: 28px; height: 28px; border-style: solid; border-width: 0; opacity: .9; }
    .dawa-inv .dawa-inv-corner-tl { top: -1px; inset-inline-start: -1px; border-top-width: 2px; border-inline-start-width: 2px; border-start-start-radius: 16px; }
    .dawa-inv .dawa-inv-corner-tr { top: -1px; inset-inline-end: -1px; border-top-width: 2px; border-inline-end-width: 2px; border-start-end-radius: 16px; }
    .dawa-inv .dawa-inv-corner-bl { bottom: -1px; inset-inline-start: -1px; border-bottom-width: 2px; border-inline-start-width: 2px; border-end-start-radius: 16px; }
    .dawa-inv .dawa-inv-corner-br { bottom: -1px; inset-inline-end: -1px; border-bottom-width: 2px; border-inline-end-width: 2px; border-end-end-radius: 16px; }
    @keyframes dawa-inv-frame { from { opacity: 0; transform: scale(1.03); } to { opacity: .4; transform: none; } }
    .dawa-inv .dawa-inv-hero-eyebrow { position: relative; font-size: 13px; letter-spacing: 4px; text-transform: uppercase; font-style: italic; margin-bottom: 24px; display: inline-flex; align-items: center; gap: 14px; animation: dawa-inv-rise .9s ease both; }
    .dawa-inv .dawa-inv-monogram { width: 170px; height: 170px; margin: 0 auto 28px; position: relative; display: flex; align-items: center; justify-content: center; animation: dawa-inv-rise 1.1s .15s cubic-bezier(.17,.67,.35,1.4) both; }
    .dawa-inv .dawa-inv-monogram svg { width: 100%; height: 100%; position: absolute; inset: 0; }
    .dawa-inv .dawa-inv-crown { animation: dawa-inv-rise 1s .35s cubic-bezier(.2,.7,.2,1) both; }
    .dawa-inv .dawa-inv-crown-gem { animation: dawa-inv-twinkle 2.6s ease-in-out infinite; }
    @keyframes dawa-inv-twinkle { 0%,100% { opacity: 1; } 50% { opacity: .5; } }
    .dawa-inv .dawa-inv-monogram-letters { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; font-weight: 900; font-size: 56px; line-height: 1.4; padding-block: 8px; }
    .dawa-inv .dawa-inv-couple { font-weight: 900; font-size: clamp(48px,9vw,96px); line-height: 1.25; margin: 8px 0; padding-block: 8px; text-shadow: 0 0 80px ${theme.accentMuted}; animation: dawa-inv-rise 1.1s .3s cubic-bezier(.2,.7,.2,1) both; }
    .dawa-inv .dawa-inv-amp { display: block; font-style: italic; font-size: clamp(28px,6vw,52px); margin: 6px 0; opacity: .8; padding-block: 4px; animation: dawa-inv-rise 1.1s .4s ease both; }
    .dawa-inv .dawa-inv-dateline { display: inline-flex; align-items: center; gap: 16px; margin-top: 28px; padding: 12px 28px; border-radius: 999px; backdrop-filter: blur(20px); font-size: 16px; letter-spacing: .5px; animation: dawa-inv-rise 1.1s .5s ease both; flex-wrap: wrap; justify-content: center; box-shadow: 0 12px 36px -14px ${theme.accentMuted}, inset 0 0 0 1px ${theme.accentLine}; }
    .dawa-inv .dawa-inv-dot { width: 4px; height: 4px; border-radius: 50%; }
    .dawa-inv .dawa-inv-greet { margin-top: 26px; font-style: italic; font-size: clamp(19px,3.4vw,28px); letter-spacing: 1px; line-height: 1.5; animation: dawa-inv-rise 1.1s .6s ease both; }
    .dawa-inv .dawa-inv-greet strong { display: block; margin-top: 12px; font-style: normal; font-weight: 900; font-size: clamp(34px,7.5vw,52px); line-height: 1.2; letter-spacing: .5px; padding-block: 4px; text-shadow: 0 0 60px ${theme.accentMuted}; }
    .dawa-inv .dawa-inv-hero-media { margin-top: 30px; width: 100%; max-width: 440px; display: grid; gap: 14px; animation: dawa-inv-rise 1.1s .7s ease both; }
    .dawa-inv .dawa-inv-hero-media-item { border: 1px solid; border-radius: 16px; overflow: hidden; background: ${theme.cardBg}; }
    .dawa-inv .dawa-inv-hero-media-item img, .dawa-inv .dawa-inv-hero-media-item video { width: 100%; display: block; max-height: 56vh; object-fit: cover; }
    .dawa-inv .dawa-inv-cue { position: absolute; bottom: 28px; left: 50%; transform: translateX(-50%); display: flex; flex-direction: column; align-items: center; gap: 10px; font-size: 11px; font-style: italic; letter-spacing: 3px; text-transform: uppercase; opacity: .7; animation: dawa-inv-cue 2.4s ease-in-out infinite; }
    .dawa-inv .dawa-inv-cue-line { width: 1px; height: 34px; }

    /* Story timeline */
    .dawa-inv .dawa-inv-timeline { position: relative; padding: 20px 0; }
    .dawa-inv .dawa-inv-timeline::before { content: ""; position: absolute; left: 50%; top: 0; bottom: 0; width: 1px; background: linear-gradient(180deg, transparent, var(--line) 15%, var(--line) 85%, transparent); }
    .dawa-inv .dawa-inv-story { position: relative; width: calc(50% - 56px); padding: 8px 4px; margin-bottom: 52px; }
    .dawa-inv .dawa-inv-story.is-left { margin-inline-start: auto; padding-inline-start: 32px; }
    .dawa-inv .dawa-inv-story.is-right { margin-inline-end: auto; padding-inline-end: 32px; }
    .dawa-inv .dawa-inv-story-node { position: absolute; top: 14px; width: 9px; height: 9px; border-radius: 50%; }
    .dawa-inv .dawa-inv-story.is-left .dawa-inv-story-node { left: -60px; }
    .dawa-inv .dawa-inv-story.is-right .dawa-inv-story-node { right: -60px; }
    .dawa-inv .dawa-inv-story-icon { font-size: 22px; margin-bottom: 12px; opacity: .9; }
    .dawa-inv .dawa-inv-story-when { font-style: italic; font-size: 10.5px; letter-spacing: 3px; text-transform: uppercase; margin-bottom: 10px; opacity: .85; }
    .dawa-inv .dawa-inv-story-title { font-weight: 700; font-size: 25px; margin-bottom: 12px; line-height: 1.45; padding-block: 3px; }
    .dawa-inv .dawa-inv-story-body { font-size: 14px; line-height: 1.95; max-width: 40ch; }
    @media (max-width: 700px) {
      .dawa-inv .dawa-inv-timeline::before { left: 12px; }
      .dawa-inv .dawa-inv-story { width: calc(100% - 36px); margin-inline-start: 36px !important; margin-inline-end: 0 !important; padding-inline-start: 0 !important; padding-inline-end: 0 !important; }
      .dawa-inv .dawa-inv-story-node { left: -29px !important; right: auto !important; }
    }

    /* Gallery */
    .dawa-inv .dawa-inv-gallery { columns: 3 240px; column-gap: 18px; }
    .dawa-inv .dawa-inv-gallery-item { position: relative; break-inside: avoid; margin-bottom: 18px; border-radius: 12px; overflow: hidden; cursor: pointer; transition: transform .55s cubic-bezier(.2,.95,.25,1.1); }
    .dawa-inv .dawa-inv-gallery-item:hover { transform: translateY(-4px); }
    .dawa-inv .dawa-inv-gallery-item img, .dawa-inv .dawa-inv-gallery-item video { width: 100%; display: block; border-radius: 12px; transition: transform 1s cubic-bezier(.2,.7,.2,1); }
    .dawa-inv .dawa-inv-gallery-item:hover img { transform: scale(1.04); }
    .dawa-inv .dawa-inv-gallery-cap { position: absolute; bottom: 0; left: 0; right: 0; padding: 14px; font-style: italic; font-size: 12.5px; color: #fbf6e8; background: linear-gradient(180deg, transparent, rgba(7,7,10,.82)); opacity: 0; transform: translateY(6px); transition: opacity .35s, transform .45s; }
    .dawa-inv .dawa-inv-gallery-item:hover .dawa-inv-gallery-cap { opacity: 1; transform: none; }
    .dawa-inv .dawa-inv-lightbox { position: fixed; inset: 0; z-index: 999; background: rgba(7,7,10,.92); backdrop-filter: blur(20px); display: flex; align-items: center; justify-content: center; padding: 32px; opacity: 0; pointer-events: none; transition: opacity .5s; }
    .dawa-inv .dawa-inv-lightbox.is-open { opacity: 1; pointer-events: all; }
    .dawa-inv .dawa-inv-lightbox img { max-width: 90%; max-height: 86vh; border-radius: 12px; }
    .dawa-inv .dawa-inv-lightbox-close { position: absolute; top: 20px; inset-inline-end: 20px; width: 44px; height: 44px; border-radius: 50%; background: transparent; border: 1px solid; font-size: 20px; cursor: pointer; transition: transform .3s; }
    .dawa-inv .dawa-inv-lightbox-close:hover { transform: rotate(90deg); }

    /* Details */
    .dawa-inv .dawa-inv-details { display: grid; gap: 56px 40px; grid-template-columns: repeat(auto-fit, minmax(230px, 1fr)); }
    .dawa-inv .dawa-inv-detail { transition: transform .5s cubic-bezier(.2,.95,.25,1.1); }
    .dawa-inv .dawa-inv-detail:hover { transform: translateY(-3px); }
    .dawa-inv .dawa-inv-detail-icon { font-size: 28px; margin-bottom: 16px; opacity: .9; }
    .dawa-inv .dawa-inv-detail-meta { font-size: 10.5px; letter-spacing: 2.8px; text-transform: uppercase; margin-bottom: 12px; font-weight: 700; opacity: .85; }
    .dawa-inv .dawa-inv-detail-title { font-weight: 700; font-size: 22px; margin-bottom: 12px; line-height: 1.45; padding-block: 3px; }
    .dawa-inv .dawa-inv-detail-body { font-size: 14px; line-height: 1.95; max-width: 36ch; }

    /* Venue */
    .dawa-inv .dawa-inv-venue { display: grid; grid-template-columns: 1.2fr 1fr; gap: 32px; align-items: stretch; }
    .dawa-inv .dawa-inv-venue-map { position: relative; border: 1px solid; border-radius: 14px; overflow: hidden; min-height: 360px; background: ${theme.cardBg}; }
    .dawa-inv .dawa-inv-route { stroke-dashoffset: 200; animation: dawa-inv-route 4s linear infinite; }
    .dawa-inv .dawa-inv-venue-info { display: flex; flex-direction: column; }
    .dawa-inv .dawa-inv-venue-row { display: flex; align-items: flex-start; gap: 18px; padding: 20px 0; border-bottom: 1px solid; transition: transform .35s; }
    .dawa-inv .dawa-inv-venue-row:hover { transform: translateX(-3px); }
    .dawa-inv .dawa-inv-venue-ic { width: 30px; flex-shrink: 0; display: flex; align-items: center; justify-content: center; font-size: 22px; opacity: .9; }
    .dawa-inv .dawa-inv-venue-label { font-size: 10px; letter-spacing: 2.8px; text-transform: uppercase; font-weight: 700; margin-bottom: 6px; opacity: .85; }
    .dawa-inv .dawa-inv-venue-val { font-size: 16px; line-height: 1.55; }
    @media (max-width: 760px) { .dawa-inv .dawa-inv-venue { grid-template-columns: 1fr; } }

    /* Countdown */
    .dawa-inv .dawa-inv-countdown { display: grid; grid-template-columns: repeat(4,1fr); max-width: 760px; margin: 0 auto; border-block: 1px solid; padding: 26px 0; }
    .dawa-inv .dawa-inv-cd-cell { position: relative; padding: 8px 12px; text-align: center; }
    .dawa-inv .dawa-inv-cd-cell + .dawa-inv-cd-cell { border-inline-start: 1px solid var(--line); }
    .dawa-inv .dawa-inv-cd-num { font-weight: 900; font-size: clamp(40px,8vw,72px); line-height: 1.35; font-variant-numeric: tabular-nums; margin-bottom: 10px; display: inline-block; padding-block: 6px; }
    .dawa-inv .dawa-inv-cd-num.is-flip { animation: dawa-inv-flip .65s cubic-bezier(.2,.95,.25,1.1); }
    .dawa-inv .dawa-inv-cd-lbl { font-style: italic; font-size: 11px; letter-spacing: 3px; text-transform: uppercase; opacity: .9; }

    /* RSVP + guestbook cards */
    .dawa-inv .dawa-inv-rsvp { max-width: 580px; margin: 0 auto; }
    .dawa-inv .dawa-inv-field { margin-bottom: 22px; }
    .dawa-inv .dawa-inv-field label { display: block; font-style: italic; font-size: 11px; letter-spacing: 2.8px; text-transform: uppercase; margin-bottom: 12px; opacity: .9; }
    .dawa-inv .dawa-inv-toggle { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; border-bottom: 1px solid; padding-bottom: 16px; }
    .dawa-inv .dawa-inv-toggle-btn { border: 1px solid; background: transparent; cursor: pointer; padding: 12px 14px; border-radius: 999px; font-weight: 700; font-size: 14px; transition: all .35s cubic-bezier(.2,.95,.25,1.1); }
    .dawa-inv .dawa-inv-input { width: 100%; padding: 12px 0; background: transparent; border: none; border-bottom: 1px solid; border-radius: 0; font-size: 16px; outline: none; transition: border-color .25s; }
    .dawa-inv .dawa-inv-input::placeholder { opacity: .4; }
    .dawa-inv .dawa-inv-textarea { resize: none; line-height: 1.6; min-height: 70px; }
    .dawa-inv .dawa-inv-chips { display: flex; gap: 8px; flex-wrap: wrap; }
    .dawa-inv .dawa-inv-chip { padding: 8px 16px; border-radius: 999px; background: transparent; border: 1px solid; font-size: 12.5px; font-weight: 600; cursor: pointer; transition: all .3s cubic-bezier(.2,.95,.25,1.1); font-family: inherit; }
    .dawa-inv .dawa-inv-chip:hover { transform: translateY(-1px); }
    .dawa-inv .dawa-inv-stepper { display: inline-flex; align-items: center; gap: 18px; }
    .dawa-inv .dawa-inv-stepper button { width: 36px; height: 36px; border-radius: 50%; border: 1px solid; background: transparent; font-size: 18px; font-weight: 700; cursor: pointer; transition: all .25s cubic-bezier(.2,.95,.25,1.1); }
    .dawa-inv .dawa-inv-stepper button:hover { transform: scale(1.08); }
    .dawa-inv .dawa-inv-stepper span { font-weight: 800; font-size: 22px; min-width: 28px; text-align: center; }
    .dawa-inv .dawa-inv-submit { width: 100%; margin-top: 14px; padding: 16px 28px; border: none; border-radius: 999px; font-size: 14px; font-weight: 800; cursor: pointer; letter-spacing: .5px; box-shadow: inset 0 1px 0 rgba(255,255,255,.45), 0 14px 32px -10px ${theme.accentMuted}; transition: transform .25s cubic-bezier(.2,.95,.25,1.1), box-shadow .35s; }
    .dawa-inv .dawa-inv-submit:hover:not(:disabled) { transform: translateY(-2px); }
    .dawa-inv .dawa-inv-submit:disabled { opacity: .5; cursor: not-allowed; }
    .dawa-inv .dawa-inv-rsvp-success { text-align: center; padding: 20px 0; animation: dawa-inv-rise .8s cubic-bezier(.2,.95,.25,1.1) both; }
    .dawa-inv .dawa-inv-seal { width: 86px; height: 86px; margin: 0 auto 20px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 36px; font-weight: 900; box-shadow: inset 0 2px 4px rgba(255,255,255,.4), 0 14px 36px ${theme.accentMuted}; animation: dawa-inv-seal 1s cubic-bezier(.2,.95,.25,1.1) both; }
    .dawa-inv .dawa-inv-rsvp-success h3 { font-weight: 700; font-size: 28px; margin-bottom: 12px; line-height: 1.4; padding-block: 4px; }
    .dawa-inv .dawa-inv-rsvp-success p { font-size: 14px; line-height: 1.9; }

    /* Guestbook list */
    .dawa-inv .dawa-inv-wishes { display: grid; max-width: 640px; margin: 0 auto; }
    .dawa-inv .dawa-inv-wish { padding: 26px 0; border-bottom: 1px solid; transition: transform .35s; }
    .dawa-inv .dawa-inv-wish:first-child { padding-top: 0; }
    .dawa-inv .dawa-inv-wish:last-child { border-bottom: none; }
    .dawa-inv .dawa-inv-wish:hover { transform: translateX(-2px); }
    .dawa-inv .dawa-inv-wish-who { font-style: italic; font-size: 11px; letter-spacing: 2.8px; text-transform: uppercase; margin-bottom: 10px; opacity: .85; }
    .dawa-inv .dawa-inv-wish-what { font-size: 16px; line-height: 1.8; }

    /* Footer */
    .dawa-inv .dawa-inv-foot { padding: 64px 24px 96px; text-align: center; position: relative; z-index: 6; }
    .dawa-inv .dawa-inv-foot-flourish { margin-bottom: 16px; opacity: .92; }
    .dawa-inv .dawa-inv-foot-mark { font-weight: 900; font-size: 38px; margin-bottom: 12px; padding-block: 6px; }
    .dawa-inv .dawa-inv-foot-tag { font-size: 11px; letter-spacing: 3px; text-transform: uppercase; font-style: italic; opacity: .85; }

    /* Brand logo crown + floral flourish */
    .dawa-inv .dawa-inv-hero-logo { margin-bottom: 10px; animation: dawa-inv-rise .8s ease both, dawa-inv-float 6s ease-in-out 1.4s infinite; }
    .dawa-inv .dawa-inv-flourish { display: block; }
    .dawa-inv .dawa-inv-hero-flourish { position: relative; margin-bottom: 16px; animation: dawa-inv-rise .9s .1s ease both; opacity: .92; }
    @keyframes dawa-inv-float { 0%,100% { transform: translateY(0); } 50% { transform: translateY(-6px); } }

    /* Floating dock */
    .dawa-inv .dawa-inv-dock { bottom: 22px; inset-inline-end: 22px; display: flex; flex-direction: column; gap: 8px; z-index: 100; }
    .dawa-inv .dawa-inv-dock-btn { width: 46px; height: 46px; border-radius: 50%; background: rgba(7,7,10,.5); border: 1px solid; font-size: 18px; cursor: pointer; backdrop-filter: blur(20px); display: flex; align-items: center; justify-content: center; position: relative; transition: all .35s cubic-bezier(.2,.95,.25,1.1); }
    .dawa-inv .dawa-inv-dock-btn:hover { transform: scale(1.06); }
    .dawa-inv .dawa-inv-dock-pulse { position: absolute; inset: -2px; border-radius: 50%; border: 1px solid; animation: dawa-inv-dockpulse 1.8s ease-out infinite; }

    /* Envelope */
    .dawa-inv .dawa-inv-env-overlay { position: fixed; inset: 0; z-index: 1000; background: radial-gradient(ellipse 80% 60% at 50% 35%, ${theme.accentMuted}, transparent 60%), ${theme.bg}; display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 32px; transition: opacity 1.2s, transform 1.4s cubic-bezier(.2,.95,.25,1.1); }
    .dawa-inv .dawa-inv-env-overlay.is-opening { opacity: 0; transform: scale(1.05); pointer-events: none; }
    .dawa-inv .dawa-inv-env { position: relative; width: 320px; max-width: 80vw; aspect-ratio: 1.5/1; border-radius: 14px; cursor: pointer; background: ${theme.cardBg}; border: 1px solid ${theme.accentLine}; box-shadow: 0 30px 80px -20px rgba(0,0,0,.7), 0 0 60px ${theme.accentMuted}; transition: transform .6s cubic-bezier(.2,.95,.25,1.1); }
    .dawa-inv .dawa-inv-env:hover { transform: translateY(-6px) scale(1.02); }
    .dawa-inv .dawa-inv-wax { position: absolute; top: 50%; left: 50%; transform: translate(-50%,-50%); width: 86px; height: 86px; border-radius: 50%; background: radial-gradient(circle at 30% 30%, ${theme.gradientStops[1]} 0%, ${theme.accent} 60%); display: flex; align-items: center; justify-content: center; color: ${ON_GOLD}; font-weight: 900; font-size: 36px; box-shadow: 0 8px 26px ${theme.accentMuted}, 0 0 32px ${theme.accentMuted}; animation: dawa-inv-wax 3s ease-in-out infinite; }
    .dawa-inv .dawa-inv-env-overlay.is-opening .dawa-inv-wax { animation: dawa-inv-crack 1s cubic-bezier(.2,.95,.25,1.1) forwards; }
    .dawa-inv .dawa-inv-env-hint { margin-top: 34px; color: ${theme.accent}; font-size: 13px; letter-spacing: 3px; text-transform: uppercase; font-style: italic; animation: dawa-inv-cue 2.6s ease-in-out infinite; }
    .dawa-inv .dawa-inv-env-name { margin-top: 22px; font-weight: 900; font-size: clamp(28px,5vw,44px); color: ${theme.text}; }

    /* Petals + sparkles */
    .dawa-inv .dawa-inv-petals { inset: 0; pointer-events: none; z-index: 5; overflow: hidden; }
    .dawa-inv .dawa-inv-petal { position: absolute; top: -40px; border-radius: 60% 40% 60% 40% / 70% 60% 40% 30%; opacity: .55; filter: blur(.4px); animation: dawa-inv-petal linear infinite; }
    .dawa-inv .dawa-inv-sparkles { inset: 0; pointer-events: none; z-index: 4; }
    .dawa-inv .dawa-inv-sparkle { position: absolute; width: 2px; height: 2px; border-radius: 50%; animation: dawa-inv-sparkle ease-in-out infinite; }

    /* Confetti + hearts (appended to body for confetti, in-card for hearts) */
    .dawa-inv-confetti { position: fixed; inset: 0; pointer-events: none; z-index: 1001; overflow: hidden; }
    .dawa-inv-confetti span { position: absolute; top: 50%; left: 50%; width: 8px; height: 12px; border-radius: 2px; animation: dawa-inv-conf 1.6s cubic-bezier(.2,.7,.2,1) forwards; }
    .dawa-inv .dawa-inv-hearts { position: absolute; inset: 0; pointer-events: none; overflow: hidden; }
    .dawa-inv .dawa-inv-hearts span { position: absolute; bottom: 0; font-size: 18px; animation: dawa-inv-heart 3s ease-out forwards; opacity: 0; }

    /* ════════════ LUXE LAYER — depth, glow & gold sheen ════════════ */
    /* Living aurora: slow-drifting soft gold light behind everything. */
    .dawa-inv .dawa-inv-aurora { inset: 0; pointer-events: none; z-index: 0; overflow: hidden; }
    .dawa-inv .dawa-inv-aurora-blob { position: absolute; width: 78vw; height: 78vw; max-width: 760px; max-height: 760px; border-radius: 50%; filter: blur(72px); opacity: .18; will-change: transform; }
    .dawa-inv .dawa-inv-aurora-blob.a1 { top: -14%; inset-inline-start: -14%; animation: dawa-inv-drift1 24s ease-in-out infinite; }
    .dawa-inv .dawa-inv-aurora-blob.a2 { bottom: -18%; inset-inline-end: -14%; animation: dawa-inv-drift2 30s ease-in-out infinite; }
    .dawa-inv .dawa-inv-aurora-blob.a3 { top: 36%; inset-inline-start: 26%; opacity: .12; animation: dawa-inv-drift3 34s ease-in-out infinite; }

    /* Couple names + greeting: a richer, layered gold halo. */
    .dawa-inv .dawa-inv-couple { text-shadow: 0 0 1px ${theme.accentLine}, 0 0 26px ${theme.accentMuted}, 0 0 72px ${theme.accentMuted}, 0 2px 3px rgba(0,0,0,.22); letter-spacing: .5px; }
    .dawa-inv .dawa-inv-greet strong { text-shadow: 0 0 24px ${theme.accentMuted}, 0 0 60px ${theme.accentMuted}; }

    /* Section diamond dot gleams. */
    .dawa-inv .dawa-inv-secrule .dawa-inv-secrule-dot { animation: dawa-inv-gleam 3.2s ease-in-out infinite; }

    /* Detail items → refined glass cards with a soft gold glow. */
    .dawa-inv .dawa-inv-detail {
      padding: 20px 18px; border-radius: 16px;
      background: ${theme.cardBg}; border: 1px solid ${theme.cardBorder};
      box-shadow: 0 14px 38px -20px ${theme.accentMuted}, inset 0 1px 0 rgba(255,255,255,.05);
      backdrop-filter: blur(6px); -webkit-backdrop-filter: blur(6px);
    }
    .dawa-inv .dawa-inv-detail:hover { border-color: ${theme.accentLine}; box-shadow: 0 18px 48px -16px ${theme.accentMuted}, inset 0 1px 0 rgba(255,255,255,.08); }

    /* Deeper, glowier framing on the showpiece surfaces. */
    .dawa-inv .dawa-inv-venue-map { box-shadow: 0 20px 56px -24px ${theme.accentMuted}; }
    .dawa-inv .dawa-inv-countdown { box-shadow: 0 0 52px -22px ${theme.accentMuted}; }
    .dawa-inv .dawa-inv-dateline { box-shadow: 0 14px 40px -16px ${theme.accentMuted}, inset 0 0 0 1px ${theme.accentLine}; }
    .dawa-inv .dawa-inv-hero-frame { box-shadow: 0 0 60px -10px ${theme.accentMuted}, inset 0 0 90px -44px ${theme.accentMuted}; }

    @keyframes dawa-inv-drift1 { 0%,100% { transform: translate(0,0) scale(1); } 50% { transform: translate(7vw,5vh) scale(1.2); } }
    @keyframes dawa-inv-drift2 { 0%,100% { transform: translate(0,0) scale(1.15); } 50% { transform: translate(-6vw,-4vh) scale(1); } }
    @keyframes dawa-inv-drift3 { 0%,100% { transform: translate(0,0) scale(1); } 50% { transform: translate(4vw,-6vh) scale(1.15); } }
    @keyframes dawa-inv-gleam { 0%,100% { opacity: 1; transform: rotate(45deg) scale(1); } 50% { opacity: .6; transform: rotate(45deg) scale(1.35); } }

    @keyframes dawa-inv-rise { from { opacity: 0; transform: translateY(20px); } to { opacity: 1; transform: none; } }
    @keyframes dawa-inv-draw { to { stroke-dashoffset: 0; } }
    @keyframes dawa-inv-cue { 0%,100% { opacity: .55; transform: translate(-50%,0); } 50% { opacity: 1; transform: translate(-50%,6px); } }
    @keyframes dawa-inv-route { to { stroke-dashoffset: 0; } }
    @keyframes dawa-inv-flip { 0% { transform: translateY(0); } 50% { transform: translateY(-14px); opacity: .4; filter: blur(2px); } 100% { transform: translateY(0); } }
    @keyframes dawa-inv-seal { 0% { transform: scale(0) rotate(-90deg); } 60% { transform: scale(1.15) rotate(8deg); } 100% { transform: scale(1) rotate(0); } }
    @keyframes dawa-inv-wax { 0%,100% { transform: translate(-50%,-50%) scale(1); } 50% { transform: translate(-50%,-50%) scale(1.05); } }
    @keyframes dawa-inv-crack { 0% { transform: translate(-50%,-50%) scale(1) rotate(0); } 30% { transform: translate(-50%,-50%) scale(1.25) rotate(-12deg); } 100% { transform: translate(-50%,-50%) scale(0) rotate(180deg); opacity: 0; } }
    @keyframes dawa-inv-dockpulse { 0% { opacity: .9; transform: scale(.95); } 100% { opacity: 0; transform: scale(1.4); } }
    @keyframes dawa-inv-petal { 0% { transform: translateY(0) rotate(0) translateX(0); opacity: 0; } 5% { opacity: .5; } 50% { transform: translateY(45vh) rotate(180deg) translateX(40px); } 95% { opacity: .5; } 100% { transform: translateY(105vh) rotate(420deg) translateX(-30px); opacity: 0; } }
    @keyframes dawa-inv-sparkle { 0%,100% { opacity: 0; transform: scale(.5); } 50% { opacity: 1; transform: scale(1.6); } }
    @keyframes dawa-inv-conf { to { transform: translate(var(--x), var(--y)) rotate(var(--r)); opacity: 0; } }
    @keyframes dawa-inv-heart { 0% { transform: translate(0,0) scale(.4); opacity: 0; } 20% { opacity: .9; } 100% { transform: translate(var(--hx,0), -360px) scale(1.2); opacity: 0; } }

    @media (prefers-reduced-motion: reduce) {
      .dawa-inv *, .dawa-inv *::before, .dawa-inv *::after { animation: none !important; transition-duration: .01ms !important; }
      .dawa-inv .dawa-inv-reveal { opacity: 1; transform: none; }
    }
    `}</style>
  );
}

export { ViewStyles };
