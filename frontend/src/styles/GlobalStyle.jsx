// Global stylesheet — injected once at the app root. Fonts, resets, shared
// utility classes. Most polish lives here so component files don't need to
// touch their inline styles to inherit the design pass.

export const GlobalStyle = () => (
  <style>{`
    /* Fonts are loaded via <link> in index.html <head> (preconnect + stylesheet)
       so they start downloading before this JS-injected stylesheet parses. */

    /* ── Reset + base ──────────────────────────────────────────────────── */
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    html { scroll-behavior: smooth; }
    body {
      background: #07070a; color: #f5e6b8;
      font-family: 'Cairo', 'Heebo', 'Amiri', sans-serif; direction: rtl;
      -webkit-font-smoothing: antialiased;
      -moz-osx-font-smoothing: grayscale;
      text-rendering: optimizeLegibility;
    }
    ::-webkit-scrollbar { width: 6px; height: 6px; }
    ::-webkit-scrollbar-track { background: transparent; }
    ::-webkit-scrollbar-thumb {
      background: rgba(201,168,76,.22); border-radius: 6px;
    }
    ::-webkit-scrollbar-thumb:hover { background: rgba(201,168,76,.42); }
    button, input, select, textarea { font-family: inherit; direction: inherit; }
    /* Strip default outlines but keep a visible focus ring for keyboard users. */
    button:focus, input:focus, select:focus, textarea:focus, a:focus { outline: none; }
    button:focus-visible, a:focus-visible {
      outline: 2px solid rgba(201,168,76,.65);
      outline-offset: 2px;
      border-radius: 10px;
    }
    a { text-decoration: none; color: inherit; }
    ul { list-style: none; }

    /* Better text selection contrast on the dark theme. */
    ::selection { background: rgba(201,168,76,.30); color: #fff; }

    /* ── Animations ────────────────────────────────────────────────────── */
    @keyframes fadeUp   { from { opacity: 0; transform: translateY(20px); } to { opacity: 1; transform: none; } }
    @keyframes fadeIn   { from { opacity: 0; } to { opacity: 1; } }
    @keyframes slideUp  { from { opacity: 0; transform: translateY(36px); } to { opacity: 1; transform: none; } }
    @keyframes slideDown{ from { opacity: 0; transform: translateY(-12px); } to { opacity: 1; transform: none; } }
    @keyframes sealPop  { from { transform: scale(0) rotate(-30deg); opacity: 0; } to { transform: scale(1) rotate(0); opacity: 1; } }
    @keyframes flicker  { 0%,100% { opacity: 1; } 45% { opacity: .85; } 50% { opacity: .7; } 55% { opacity: .9; } }
    @keyframes glowPulse{ 0%,100% { box-shadow: 0 0 18px rgba(201,168,76,.25); } 50% { box-shadow: 0 0 28px rgba(201,168,76,.5); } }
    @keyframes shake    { 0%,100% { transform: translateX(0); } 25% { transform: translateX(-4px); } 75% { transform: translateX(4px); } }
    @keyframes spin     { to { transform: rotate(360deg); } }

    .fade-up   { animation: fadeUp .55s ease both; }
    .fade-up-2 { animation: fadeUp .55s .10s ease both; }
    .fade-up-3 { animation: fadeUp .55s .20s ease both; }
    .fade-up-4 { animation: fadeUp .55s .32s ease both; }

    /* Respect prefers-reduced-motion — strip non-essential animations. */
    @media (prefers-reduced-motion: reduce) {
      *, *::before, *::after {
        animation-duration: .01ms !important;
        animation-iteration-count: 1 !important;
        transition-duration: .01ms !important;
        scroll-behavior: auto !important;
      }
    }

    /* ── Buttons ───────────────────────────────────────────────────────── */
    .gold-btn {
      background: linear-gradient(135deg, #c9a84c 0%, #f0c84c 50%, #c9a84c 100%);
      background-size: 200% 100%;
      color: #000; border: none; border-radius: 14px;
      padding: 13px 28px; font-size: 15px; font-weight: 900;
      cursor: pointer; font-family: inherit;
      transition: transform .18s ease, box-shadow .18s ease, background-position .35s ease, opacity .2s;
      will-change: transform;
      box-shadow: 0 2px 10px rgba(201,168,76,.18);
    }
    .gold-btn:hover {
      transform: translateY(-2px);
      box-shadow: 0 10px 30px rgba(201,168,76,.45);
      background-position: 100% 0;
    }
    .gold-btn:active { transform: translateY(0); box-shadow: 0 4px 14px rgba(201,168,76,.32); }
    .gold-btn:disabled {
      opacity: .42; cursor: not-allowed; transform: none;
      box-shadow: none; background: linear-gradient(135deg, #5a4a20, #6a5828);
      color: rgba(0,0,0,.55);
    }

    .ghost-btn {
      background: transparent; border: 1.5px solid rgba(201,168,76,.35);
      color: #c9a84c; border-radius: 14px; padding: 12px 28px;
      font-size: 15px; font-weight: 700; cursor: pointer; font-family: inherit;
      transition: background .18s ease, border-color .18s ease, transform .18s ease, opacity .2s;
    }
    .ghost-btn:hover {
      background: rgba(201,168,76,.10);
      border-color: rgba(201,168,76,.6);
    }
    .ghost-btn:active { transform: translateY(1px); }
    .ghost-btn:disabled { opacity: .42; cursor: not-allowed; transform: none; }

    /* Destructive action button — for delete / sign-out confirmations. */
    .danger-btn {
      background: linear-gradient(135deg, #d47a4b, #b03020);
      color: #fff; border: none; border-radius: 14px;
      padding: 12px 24px; font-size: 14px; font-weight: 800;
      cursor: pointer; font-family: inherit;
      transition: transform .18s ease, box-shadow .18s ease, opacity .2s;
      box-shadow: 0 2px 10px rgba(212,80,58,.20);
    }
    .danger-btn:hover { transform: translateY(-1px); box-shadow: 0 8px 22px rgba(212,80,58,.35); }
    .danger-btn:active { transform: translateY(0); }
    .danger-btn:disabled { opacity: .42; cursor: not-allowed; transform: none; }

    /* ── Inputs ────────────────────────────────────────────────────────── */
    .input-field {
      background: rgba(255,255,255,.04);
      border: 1px solid rgba(255,255,255,.10);
      border-radius: 12px; padding: 12px 16px; color: #f5e6b8;
      font-size: 14px; width: 100%; outline: none; font-family: inherit;
      transition: border-color .2s, box-shadow .2s, background .2s;
    }
    .input-field::placeholder { color: rgba(245,230,184,.34); }
    .input-field:hover:not(:disabled):not(:focus) {
      border-color: rgba(201,168,76,.25);
    }
    .input-field:focus {
      border-color: rgba(201,168,76,.65);
      box-shadow: 0 0 0 3px rgba(201,168,76,.18);
      background: rgba(255,255,255,.06);
    }
    .input-field:disabled {
      opacity: .55; cursor: not-allowed; background: rgba(255,255,255,.02);
    }
    .input-field.error {
      border-color: rgba(212,122,75,.7);
      box-shadow: 0 0 0 3px rgba(212,122,75,.15);
    }
    .input-field.success {
      border-color: rgba(76,201,122,.55);
      box-shadow: 0 0 0 3px rgba(76,201,122,.14);
    }

    /* Small helpers for label / hint / error text used near inputs. */
    .field-label {
      display: block; margin-bottom: 6px;
      font-size: 12px; color: #a09070; font-weight: 600;
    }
    .field-hint { font-size: 11px; color: #8a7a58; margin-top: 4px; }
    .field-error {
      font-size: 12px; color: #d47a4b; margin-top: 6px;
      animation: shake .25s ease both;
    }

    /* ── Cards ─────────────────────────────────────────────────────────── */
    .card {
      background: rgba(255,255,255,.03);
      border: 1px solid rgba(255,255,255,.07);
      border-radius: 18px; padding: 20px;
      transition: border-color .25s, background .25s, transform .25s, box-shadow .25s;
    }
    .card-hover { cursor: pointer; }
    .card-hover:hover {
      border-color: rgba(201,168,76,.25);
      background: rgba(255,255,255,.05);
      transform: translateY(-2px);
      box-shadow: 0 10px 30px rgba(0,0,0,.35);
    }
    .gold-card {
      background: linear-gradient(135deg, rgba(201,168,76,.10), rgba(201,168,76,.03));
      border: 1px solid rgba(201,168,76,.22);
      border-radius: 18px; padding: 20px;
      transition: border-color .25s, box-shadow .25s;
    }
    .gold-card:hover { border-color: rgba(201,168,76,.40); }

    /* ── Nav tabs (works for both <button> and <a>/NavLink) ────────────── */
    .nav-tab {
      padding: 7px 15px; border-radius: 10px; font-size: 13px; font-weight: 700;
      cursor: pointer; border: none; background: transparent; font-family: inherit;
      color: #8a7a58; text-decoration: none; display: inline-block;
      transition: background .2s, color .2s;
    }
    .nav-tab.active { background: rgba(201,168,76,.15); color: #c9a84c; }
    .nav-tab:not(.active):hover { color: #a08050; background: rgba(255,255,255,.03); }

    /* ── Utility labels & dividers ─────────────────────────────────────── */
    .section-label {
      font-size: 11px; color: #8a7a58; font-weight: 700;
      letter-spacing: 2px; text-transform: uppercase; margin-bottom: 10px;
    }
    .divider { height: 1px; background: rgba(201,168,76,.1); margin: 28px 0; }
    .status-badge {
      padding: 3px 10px; border-radius: 20px; font-size: 11px;
      font-weight: 700; display: inline-flex; align-items: center; gap: 4px;
    }

    /* ── Modal scaffolding ─────────────────────────────────────────────── */
    .modal-backdrop {
      position: fixed; inset: 0; background: rgba(0,0,0,.78);
      backdrop-filter: blur(4px); -webkit-backdrop-filter: blur(4px);
      display: flex; align-items: center; justify-content: center;
      z-index: 1500; padding: 20px; animation: fadeIn .25s ease;
    }
    .modal-shell {
      max-width: 460px; width: 100%; max-height: 90vh; overflow-y: auto;
      background: #0c0c11; border: 1px solid rgba(201,168,76,.30);
      border-radius: 18px; padding: 24px;
      animation: slideUp .3s ease;
      box-shadow: 0 18px 60px rgba(0,0,0,.5);
    }

    /* ── Phone input (country chip + national number) ─────────────────── */
    .phone-input-shell {
      display: flex; align-items: stretch; width: 100%;
      background: rgba(255,255,255,.04);
      border: 1px solid rgba(255,255,255,.10);
      border-radius: 12px; overflow: hidden;
      transition: border-color .2s, box-shadow .2s, background .2s;
    }
    .phone-input-shell:hover:not(.is-disabled) { border-color: rgba(201,168,76,.25); }
    .phone-input-shell:focus-within {
      border-color: rgba(201,168,76,.65);
      box-shadow: 0 0 0 3px rgba(201,168,76,.18);
      background: rgba(255,255,255,.06);
    }
    .phone-input-shell.is-valid { border-color: rgba(76,201,122,.45); }
    .phone-input-shell.is-valid:focus-within { box-shadow: 0 0 0 3px rgba(76,201,122,.16); }
    .phone-input-shell.has-error {
      border-color: rgba(212,122,75,.7);
      box-shadow: 0 0 0 3px rgba(212,122,75,.15);
    }
    .phone-input-shell.is-disabled { opacity: .6; }
    .phone-input-chip {
      display: flex; align-items: center; gap: 6px;
      padding: 0 12px; flex-shrink: 0;
      background: rgba(255,255,255,.025);
      border: none; border-inline-end: 1px solid rgba(255,255,255,.08);
      color: #c9a84c; cursor: pointer; font-family: inherit;
      font-size: 13px; transition: background .2s, color .2s;
    }
    .phone-input-chip:hover:not(:disabled) { background: rgba(201,168,76,.10); color: #f0c84c; }
    .phone-input-chip:disabled { cursor: not-allowed; }
    .phone-input-native {
      flex: 1; min-width: 0;
      background: transparent; border: none; outline: none;
      color: #f5e6b8; font-size: 15px; font-weight: 600;
      padding: 12px 14px; font-family: inherit;
      direction: ltr; text-align: left;
      letter-spacing: .5px; font-variant-numeric: tabular-nums;
    }
    .phone-input-native::placeholder { color: rgba(245,230,184,.30); font-weight: 400; }
    .phone-input-status {
      display: flex; align-items: center; padding: 0 12px;
      color: #4cc97a; font-size: 16px; font-weight: 900;
      animation: fadeIn .2s ease;
    }
    .phone-input-picker {
      position: absolute; top: calc(100% + 6px);
      inset-inline-start: 0; inset-inline-end: 0;
      z-index: 60;
      background: #0c0c11; border: 1px solid rgba(201,168,76,.30);
      border-radius: 12px; padding: 6px;
      box-shadow: 0 18px 50px rgba(0,0,0,.55);
      animation: slideDown .18s ease both;
      max-height: 280px; overflow-y: auto;
    }
    .phone-input-picker-row {
      display: flex; align-items: center; gap: 10px;
      width: 100%; padding: 10px 12px;
      background: transparent; border: none; border-radius: 8px;
      cursor: pointer; font-family: inherit; font-size: 13px; font-weight: 700;
      color: #a09070; transition: background .15s, color .15s;
    }
    .phone-input-picker-row:hover { background: rgba(255,255,255,.04); color: #f5e6b8; }
    .phone-input-picker-row.active {
      background: rgba(201,168,76,.12); color: #c9a84c;
    }

    /* ── Skeleton shimmer (loading placeholders) ───────────────────────── */
    @keyframes shimmer {
      0%   { background-position: -240px 0; }
      100% { background-position: 240px 0; }
    }
    .skeleton {
      background: linear-gradient(
        90deg,
        rgba(201,168,76,.05) 0%,
        rgba(201,168,76,.12) 50%,
        rgba(201,168,76,.05) 100%
      );
      background-size: 480px 100%;
      animation: shimmer 1.4s ease-in-out infinite;
    }

    /* ── Inline loading spinner (use beside text in buttons / toasts) ──── */
    .spinner {
      display: inline-block; width: 14px; height: 14px;
      border: 2px solid rgba(245,230,184,.18);
      border-top-color: rgba(245,230,184,.85);
      border-radius: 50%; animation: spin .7s linear infinite;
      vertical-align: -2px;
    }

    /* ── Groom portal header (brand · tabs · controls) ─────────────────── */
    .dawa-phead {
      max-width: 900px; margin: 0 auto; min-height: 54px;
      display: flex; align-items: center; justify-content: space-between; gap: 8px;
    }
    .dawa-phead-brand { display: flex; align-items: center; gap: 8px; flex-shrink: 0; }
    .dawa-phead-tabs  { display: flex; align-items: center; flex-wrap: wrap; justify-content: center; gap: 4px; }
    .dawa-phead-ctrl  { display: flex; align-items: center; gap: 6px; flex-shrink: 0; }

    /* ── Mobile breakpoint ─────────────────────────────────────────────── */
    @media (max-width: 620px) {
      /* Header becomes two tidy rows: [brand … controls] over a centered tab row. */
      .dawa-phead { flex-wrap: wrap; min-height: 0; padding: 9px 0; gap: 8px; }
      .dawa-phead-brand { order: 1; }
      .dawa-phead-ctrl  { order: 2; margin-inline-start: auto; }
      .dawa-phead-tabs  {
        order: 3; width: 100%; justify-content: center; gap: 6px;
        padding-top: 8px; border-top: 1px solid rgba(201,168,76,.08);
      }
      .dawa-phead-tabs .nav-tab { font-size: 12px !important; padding: 6px 9px !important; }
    }
  `}</style>
);
