import { AuthRequest } from "../../middleware/auth";
import { mediaDoc } from "./firestore";

// ─── Authorization helpers ────────────────────────────────────────────────────

/**
 * Most endpoints: admin OR owning groom (the uid in the path).
 * Mirrors `firestore.rules` `digitalInvitations/{groomUid}` clauses.
 */
function canActOnUid(req: AuthRequest, uid: string): boolean {
  const claims = req.caller!.claims;
  if (claims.role === "admin") return true;
  if (req.caller!.uid === uid) return true;
  return false;
}

/**
 * Photographer-files read: admin / owning groom, OR anyone when the parent
 * doc has photographerPublished === true (face-matching guest page). The
 * caller is allowed to be unauthenticated, so we don't run `requireAuth`
 * before this — we authenticate inline so the public path stays open.
 */
async function authenticatePhotographerRead(
  req: AuthRequest
): Promise<{ ok: true } | { ok: false; status: number; error: string }> {
  const docSnap = await mediaDoc(req.params.uid).get();
  const published =
    docSnap.exists && docSnap.data()?.photographerPublished === true;
  if (published) return { ok: true };

  // Not published — fall back to authenticated admin / owning groom.
  const authHeader = req.headers.authorization ?? "";
  if (!authHeader && !req.query?.token) {
    return { ok: false, status: 401, error: "unauthenticated" };
  }
  try {
    // Reuse requireAuth's verification by importing it would create a cycle;
    // verify inline using the same Admin SDK call.
    const { getAuth } = await import("firebase-admin/auth");
    const token =
      authHeader.startsWith("Bearer ")
        ? authHeader.slice("Bearer ".length).trim()
        : (req.query?.token as string);
    const decoded = await getAuth().verifyIdToken(token, true);
    req.caller = {
      uid: decoded.uid,
      claims: decoded as unknown as AuthRequest["caller"] extends { claims: infer C } ? C : never,
    };
    if (!canActOnUid(req, req.params.uid)) {
      return { ok: false, status: 403, error: "forbidden" };
    }
    return { ok: true };
  } catch {
    return { ok: false, status: 401, error: "invalid_token" };
  }
}

export { canActOnUid, authenticatePhotographerRead };
