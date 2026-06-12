import { C } from "../styles/theme.js";
// Delivery-status presentation map: label, colours and icon for each guest status.
export const STATUS = {
  pending:   { label:"لم يبدأ",    color:C.dim, bg:"rgba(122,106,74,.15)",  icon:"⌛" },
  enroute:   { label:"في الطريق",  color:C.blue, bg:"rgba(75,159,212,.15)",  icon:"🚗" },
  delivered: { label:"تم التسليم", color:"#4cc97a", bg:"rgba(76,201,122,.15)",  icon:"✓" },
};

// Reply lifecycle for the per-guest invite link:
//   notSent   — admin hasn't sent the WhatsApp invite yet (no inviteLinkSentAt)
//   pending   — invite sent, no confirmation back yet
//   confirmed — guest replied via the invite or public confirmation form
// Label text comes from i18n via t("reply_" + key); only colour/bg/icon are
// presentation-only and live here.
export const REPLY_STATUS = {
  notSent:   { color: C.dim,     bg: "rgba(122,106,74,.12)", icon: "·"  },
  pending:   { color: "#d4a14b", bg: "rgba(212,161,75,.15)", icon: "⌛" },
  confirmed: { color: "#4cc97a", bg: "rgba(76,201,122,.15)", icon: "✓" },
};

// Derive the reply state from a guest record (no extra DB fields needed).
export function replyStateOf(guest) {
  if (guest?.confirmedAt) return "confirmed";
  if (guest?.inviteLinkSentAt) return "pending";
  return "notSent";
}
