// User role constants. Use these in place of bare "admin" / "driver" / "groom"
// string literals so a typo can't silently disable a role check.
//
// The values themselves are intentionally lowercase to match the JWT custom
// claim `auth.token.role` minted by the Cloud Functions layer.

export const ROLES = Object.freeze({
  ADMIN: "admin",
  DRIVER: "driver",
  GROOM: "groom",
});
