// Server-side formatting constants. Mirrors src/config/index.js → ADDRESS_JOINER
// so the area string the server writes to /guestsByGroom/{uid}/area matches
// the joiner the client uses elsewhere.

/** Arabic comma + space — used between city / street / house parts. */
export const ADDRESS_JOINER = "، ";
