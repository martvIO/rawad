// Guest-facing "Add to Wallet" block on the public digital invitation.
//
// Renders a real native-wallet link: Apple Wallet (.pkpass) on iPhone, Google
// Wallet on Android, both on desktop/unknown. Each is a plain <a href> that the
// browser opens directly — Safari shows the .pkpass install sheet, Android
// follows the 302 to pay.google.com. No fetch / no auth header: the guest token
// in the URL is the only credential (same trust model as the invitation itself).
//
// Styled with the groom's chosen palette + font, matching the invitation's other
// guest-facing chips. Mounted
// only when the admin enabled the per-groom `canUseBoardingPass` flag (gated by
// the parent). If the backend platform isn't configured yet, tapping returns a
// 503 and nothing is added — the button simply no-ops gracefully.
import { applePassUrl, googlePassUrl } from "../../services/wallet.js";
import { ON_GOLD } from "./inviteShared.jsx";
import { Icon } from "./InviteIcon.jsx";

function detectPlatform() {
  if (typeof navigator === "undefined") return "other";
  const ua = navigator.userAgent || "";
  if (/iphone|ipad|ipod/i.test(ua)) return "ios";
  if (/android/i.test(ua)) return "android";
  return "other";
}

export function WalletButton({ token, lang, theme, font }) {
  if (!token) return null;
  const platform = detectPlatform();
  const showApple = platform === "ios" || platform === "other";
  const showGoogle = platform === "android" || platform === "other";
  const he = lang === "he";

  const base = {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    width: "100%",
    maxWidth: 320,
    padding: "13px 22px",
    borderRadius: 999,
    textDecoration: "none",
    cursor: "pointer",
    fontFamily: font.family,
    fontSize: 15,
    fontWeight: 800,
    letterSpacing: he ? 0.3 : 0,
    border: `1px solid ${theme.accent}`,
  };
  const primary = { ...base, background: theme.accent, color: ON_GOLD, boxShadow: `0 8px 24px ${theme.accentMuted}` };
  const ghost = { ...base, background: "transparent", color: theme.accent };

  // When both render (desktop), Apple is primary and Google is the ghost variant;
  // on a phone only one shows, and it takes the primary style.
  const appleStyle = primary;
  const googleStyle = showApple ? ghost : primary;

  return (
    <div
      className="dawa-inv-reveal"
      style={{
        textAlign: "center",
        margin: "30px auto 4px",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 12,
      }}
    >
      <div style={{ color: theme.textSoft, fontFamily: font.family, fontSize: 14, fontWeight: 700 }}>
        {he ? "שמרו את ההזמנה בארנק הטלפון" : "احفظ دعوتك في محفظة هاتفك"}
      </div>
      {showApple && (
        <a href={applePassUrl(token, lang)} style={appleStyle}>
          <Icon name="ticket" size={16} />
          {he ? "הוסף ל‑Apple Wallet" : "أضف إلى Apple Wallet"}
        </a>
      )}
      {showGoogle && (
        <a href={googlePassUrl(token, lang)} style={googleStyle}>
          <Icon name="ticket" size={16} />
          {he ? "שמור ב‑Google Wallet" : "احفظ في Google Wallet"}
        </a>
      )}
    </div>
  );
}
