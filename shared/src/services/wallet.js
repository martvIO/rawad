// Wallet-pass links — Apple Wallet (.pkpass) + Google Wallet "Save" link.
//
// These are PLAIN NAVIGATIONS, not fetch() calls: the browser opens the URL
// directly (Safari renders the .pkpass install sheet; Android follows the 302
// to pay.google.com). So there is no Authorization header / CORS concern — the
// guest token in the path is the only credential, exactly like the invitation
// page itself. We just build the URLs; the WalletButton renders them as <a href>.
import { buildApiUrl } from "../utils/apiClient.js";

/** Apple Wallet .pkpass endpoint for a guest token. */
export function applePassUrl(token, lang = "ar") {
  return buildApiUrl(`/invites/pass/${token}/apple?lang=${encodeURIComponent(lang)}`);
}

/** Google Wallet "Save" redirect endpoint for a guest token. */
export function googlePassUrl(token, lang = "ar") {
  return buildApiUrl(`/invites/pass/${token}/google?lang=${encodeURIComponent(lang)}`);
}
