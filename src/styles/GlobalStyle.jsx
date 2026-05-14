// Global stylesheet — injected once at the app root. Fonts, resets, shared utility classes.

export const GlobalStyle = () => (
  <style>{`
    @import url('https://fonts.googleapis.com/css2?family=Cairo:wght@300;400;600;700;900&family=Amiri:wght@400;700&display=swap');
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    html { scroll-behavior: smooth; }
    body { background: #07070a; color: #f5e6b8; font-family: 'Cairo', 'Amiri', sans-serif; direction: rtl; }
    ::-webkit-scrollbar { width: 4px; }
    ::-webkit-scrollbar-thumb { background: #c9a84c44; border-radius: 4px; }
    button, input, select, textarea { font-family: inherit; direction: inherit; }
    a { text-decoration: none; color: inherit; }
    @keyframes fadeUp { from{opacity:0;transform:translateY(20px)} to{opacity:1;transform:none} }
    @keyframes fadeIn { from{opacity:0} to{opacity:1} }
    @keyframes slideUp { from{opacity:0;transform:translateY(36px)} to{opacity:1;transform:none} }
    @keyframes sealPop { from{transform:scale(0) rotate(-30deg);opacity:0} to{transform:scale(1) rotate(0);opacity:1} }
    @keyframes flicker { 0%,100%{opacity:1} 45%{opacity:.85} 50%{opacity:.7} 55%{opacity:.9} }
    @keyframes glowPulse { 0%,100%{box-shadow:0 0 18px rgba(201,168,76,.25)} 50%{box-shadow:0 0 28px rgba(201,168,76,.5)} }
    .fade-up { animation: fadeUp .55s ease both; }
    .fade-up-2 { animation: fadeUp .55s .1s ease both; }
    .fade-up-3 { animation: fadeUp .55s .2s ease both; }
    .fade-up-4 { animation: fadeUp .55s .32s ease both; }
    .gold-btn {
      background: linear-gradient(135deg,#c9a84c,#f0c84c);
      color: #000; border: none; border-radius: 14px;
      padding: 13px 28px; font-size: 15px; font-weight: 900;
      cursor: pointer; transition: all .2s; font-family: inherit;
    }
    .gold-btn:hover { transform: translateY(-2px); box-shadow: 0 8px 28px rgba(201,168,76,.5); }
    .gold-btn:disabled { opacity: .5; cursor: not-allowed; transform: none; box-shadow: none; }
    .ghost-btn {
      background: transparent; border: 1.5px solid rgba(201,168,76,.35);
      color: #c9a84c; border-radius: 14px; padding: 12px 28px;
      font-size: 15px; font-weight: 700; cursor: pointer; transition: all .2s; font-family: inherit;
    }
    .ghost-btn:hover { background: rgba(201,168,76,.08); }
    .input-field {
      background: rgba(255,255,255,.04); border: 1px solid rgba(255,255,255,.1);
      border-radius: 12px; padding: 12px 16px; color: #f5e6b8;
      font-size: 14px; width: 100%; outline: none; transition: border .2s; font-family: inherit;
    }
    .input-field:focus { border-color: rgba(201,168,76,.5); }
    .card {
      background: rgba(255,255,255,.03); border: 1px solid rgba(255,255,255,.07);
      border-radius: 18px; padding: 20px;
    }
    .gold-card {
      background: linear-gradient(135deg,rgba(201,168,76,.1),rgba(201,168,76,.03));
      border: 1px solid rgba(201,168,76,.22); border-radius: 18px; padding: 20px;
    }
    .nav-tab {
      padding: 7px 15px; border-radius: 10px; font-size: 13px; font-weight: 700;
      cursor: pointer; border: none; background: transparent; transition: all .2s; font-family: inherit;
    }
    .nav-tab.active { background: rgba(201,168,76,.15); color: #c9a84c; }
    .nav-tab:not(.active) { color: #7a6a4a; }
    .nav-tab:not(.active):hover { color: #a08050; }
    .section-label {
      font-size: 11px; color: #7a6a4a; font-weight: 700;
      letter-spacing: 2px; text-transform: uppercase; margin-bottom: 10px;
    }
    .divider { height: 1px; background: rgba(201,168,76,.1); margin: 28px 0; }
    .status-badge {
      padding: 3px 10px; border-radius: 20px; font-size: 11px;
      font-weight: 700; display: inline-flex; align-items: center; gap: 4px;
    }
  `}</style>
);
