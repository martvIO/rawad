// Confirmation-match status values produced by src/utils/matchUtils.js
// and consumed by the admin confirmations tab.
//
//   GREEN   — phone + name + address all matched a guest record.
//   RED     — phone matched but name and/or address differ.
//   UNKNOWN — phone did not match any guest in the groom's list.

export const MATCH_STATUS = Object.freeze({
  GREEN: "green",
  RED: "red",
  UNKNOWN: "unknown",
});
