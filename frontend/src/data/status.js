import { C } from "../styles/theme.js";
// Delivery-status presentation map: label, colours and icon for each guest status.
// `icon` is the legacy emoji (still used by the Leaflet map marker, which can't
// render a React component); `iconName` is the SVG Icon glyph used everywhere in JSX.
export const STATUS = {
  pending:   { label:"لم يبدأ",    color:C.dim, bg:"rgba(122,106,74,.15)",  icon:"⌛", iconName:"hourglass" },
  enroute:   { label:"في الطريق",  color:C.blue, bg:"rgba(75,159,212,.15)",  icon:"🚗", iconName:"car" },
  delivered: { label:"تم التسليم", color:"#4cc97a", bg:"rgba(76,201,122,.15)",  icon:"✓", iconName:"check" },
  // Non-delivery outcomes a driver can record instead of faking a delivery, so
  // the groom can tell a real delivery from an attempt that couldn't complete.
  no_answer:     { label:"لا يوجد رد",   color:"#d4a14b", bg:"rgba(212,161,75,.15)", icon:"🔕", iconName:"bellOff" },
  wrong_address: { label:"عنوان خاطئ",   color:C.red,     bg:"rgba(212,80,58,.15)",  icon:"📍", iconName:"pin" },
  refused:       { label:"رفض الاستلام", color:C.red,     bg:"rgba(212,80,58,.15)",  icon:"✋", iconName:"ban" },
};

// Statuses a driver can set as a "couldn't deliver" outcome (drives the
// driver-side outcome buttons; kept here so the set has one source of truth).
export const DRIVER_OUTCOME_STATUSES = ["no_answer", "wrong_address", "refused"];

// Reply lifecycle for the per-guest invite link:
//   notSent   — admin hasn't sent the WhatsApp invite yet (no inviteLinkSentAt)
//   pending   — invite sent, no confirmation back yet
//   confirmed — guest replied via the invite or public confirmation form
// Label text comes from i18n via t("reply_" + key); only colour/bg/icon are
// presentation-only and live here.
export const REPLY_STATUS = {
  notSent:   { color: C.dim,     bg: "rgba(122,106,74,.12)", icon: "·",  iconName: "minus" },
  pending:   { color: "#d4a14b", bg: "rgba(212,161,75,.15)", icon: "⌛", iconName: "hourglass" },
  confirmed: { color: "#4cc97a", bg: "rgba(76,201,122,.15)", icon: "✓", iconName: "check" },
};

// Derive the reply state from a guest record (no extra DB fields needed).
export function replyStateOf(guest) {
  if (guest?.confirmedAt) return "confirmed";
  if (guest?.inviteLinkSentAt) return "pending";
  return "notSent";
}
