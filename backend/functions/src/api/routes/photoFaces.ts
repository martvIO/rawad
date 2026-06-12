// Guest face-enrollment + photo-matching endpoints (PUBLIC, token-based).
//
//   GET    /digital/photos/matches?token=…   read enrollment state + matches
//   POST   /digital/photos/enroll            store guest descriptor (consent!)
//   DELETE /digital/photos/enroll            erase the guest's face data
//
// Mounted at /digital/photos BEFORE the digital router so its ":uid" params
// can never capture the literal "photos" segment.
//
// Identity model: the invite token in the body/query is the credential —
// same pattern as POST /invites/digital/submit. The server resolves
// groomUid from the token record; it is never exposed to the client.
//
// Privacy model: the descriptor is BIOMETRIC data.
//   - It is only ever written together with a consentAt timestamp; the
//     client shows an explicit consent screen before extraction.
//   - The selfie itself never reaches the server — only the 128-number
//     descriptor computed in the guest's browser.
//   - The row carries expireAt = the token's expiry; a Firestore TTL policy
//     on guestFaces.expireAt garbage-collects it, and every endpoint here
//     independently refuses expired tokens (TTL deletion can lag ~24h).
//   - DELETE /enroll gives the guest immediate erasure.

import { Router, Request, Response } from "express";
import { getDatabase } from "firebase-admin/database";
import { getFirestore, Timestamp } from "firebase-admin/firestore";
import { tokenRateLimit } from "../middleware/rateLimit";
import { HOUR_MS } from "../../constants/time";
import { RATE } from "../../constants/rateLimits";
import { TOKEN_HEX_RE } from "../../constants/tokens";
import {
  MODEL_VERSION,
  MATCH_THRESHOLD,
  validateDescriptor,
  roundDescriptor,
  computeMatches,
  hashToken,
  PhotoFacesRow,
  PhotoFileRow,
  FaceMatch,
} from "../../faceIndex/match";

// Keyed by TOKEN (guests share the venue's NAT IP) with a per-IP backstop.
const enrollLimiter = tokenRateLimit(
  "photoEnroll",
  RATE.PHOTO_ENROLL_PER_TOKEN.limit,
  HOUR_MS,
  RATE.PHOTO_ENROLL_IP_BACKSTOP.limit,
);
const matchesLimiter = tokenRateLimit(
  "photoMatches",
  RATE.PHOTO_MATCHES_PER_TOKEN.limit,
  HOUR_MS,
  RATE.PHOTO_MATCHES_IP_BACKSTOP.limit,
);

export const photoFacesRouter = Router();

// ─── GET /digital/photos/matches?token=… ─────────────────────────────────────

/**
 * Enrollment state + current matches for a guest token. Status-shaped 200
 * (`published` / `enrolled` booleans) so the page poller needs no error
 * branching; hard errors only for the token itself (400/404/410).
 */
photoFacesRouter.get(
  "/matches",
  matchesLimiter,
  async (req: Request, res: Response) => {
    const token = (req.query?.token ?? "").toString();
    const tk = await loadValidToken(token, res);
    if (!tk) return;

    try {
      const published = await isPhotographerPublished(tk.groomUid);
      if (!published) {
        res.json({ published: false, enrolled: false, expiresAt: tk.expiresAt, matches: [] });
        return;
      }

      const enrollSnap = await guestFaceDoc(tk.groomUid, token).get();
      const enrollment = enrollSnap.exists ? enrollSnap.data() : null;
      const descriptor = enrollment?.descriptor;
      if (!validateDescriptor(descriptor) || enrollment?.modelVersion !== MODEL_VERSION) {
        res.json({ published: true, enrolled: false, expiresAt: tk.expiresAt, matches: [] });
        return;
      }

      const matches = await matchesForGroom(tk.groomUid, descriptor);
      res.json({
        published: true,
        enrolled: true,
        expiresAt: tk.expiresAt,
        matches,
      });
    } catch (err) {
      res.status(500).json({ error: "read_failed", detail: errorMessage(err) });
    }
  },
);

// ─── POST /digital/photos/enroll ─────────────────────────────────────────────

/**
 * Store the guest's face descriptor (the client shows the consent screen
 * BEFORE extracting it — `consentAt` records that moment server-side) and
 * return the first match results in the same round trip.
 * Body: `{ token, descriptor: number[128] }`.
 */
photoFacesRouter.post(
  "/enroll",
  enrollLimiter,
  async (req: Request, res: Response) => {
    const token = (req.body?.token ?? "").toString();
    const tk = await loadValidToken(token, res);
    if (!tk) return;

    const descriptor = req.body?.descriptor;
    if (!validateDescriptor(descriptor)) {
      res.status(400).json({ error: "invalid_descriptor" });
      return;
    }

    try {
      const published = await isPhotographerPublished(tk.groomUid);
      if (!published) {
        res.status(409).json({ error: "not_published" });
        return;
      }

      const now = Date.now();
      await guestFaceDoc(tk.groomUid, token).set({
        descriptor: roundDescriptor(descriptor),
        guestId: tk.guestId ?? null,
        guestName: tk.guestName ?? null,
        consentAt: now,
        createdAt: now,
        // Firestore TTL policy on guestFaces.expireAt garbage-collects the
        // biometric row when the invite token itself expires.
        expireAt: Timestamp.fromMillis(tk.expiresAt),
        modelVersion: MODEL_VERSION,
      });

      const matches = await matchesForGroom(tk.groomUid, descriptor);
      res.json({ ok: true, expiresAt: tk.expiresAt, matches });
    } catch (err) {
      res.status(500).json({ error: "write_failed", detail: errorMessage(err) });
    }
  },
);

// ─── DELETE /digital/photos/enroll ───────────────────────────────────────────

/**
 * Erase the guest's stored face descriptor. Idempotent. Body: `{ token }`.
 */
photoFacesRouter.delete(
  "/enroll",
  enrollLimiter,
  async (req: Request, res: Response) => {
    const token = (req.body?.token ?? "").toString();
    const tk = await loadValidToken(token, res);
    if (!tk) return;

    try {
      await guestFaceDoc(tk.groomUid, token).delete();
      res.json({ ok: true });
    } catch (err) {
      res.status(500).json({ error: "delete_failed", detail: errorMessage(err) });
    }
  },
);

// ─── Helpers ──────────────────────────────────────────────────────────────────

interface DigitalTokenRecord {
  groomUid: string;
  guestId?: string;
  guestName?: string;
  guestType?: string;
  expiresAt: number;
}

/**
 * Validate + load a digital invite token, writing the error response on
 * failure (same status codes as /invites/digital/submit). Returns null
 * when a response has already been sent.
 */
async function loadValidToken(
  token: string,
  res: Response,
): Promise<DigitalTokenRecord | null> {
  if (!TOKEN_HEX_RE.test(token)) {
    res.status(400).json({ error: "invalid_token_format" });
    return null;
  }
  try {
    const snap = await getDatabase().ref(`inviteTokens/${token}`).get();
    if (!snap.exists()) {
      res.status(404).json({ error: "token_not_found" });
      return null;
    }
    const tk = snap.val() as DigitalTokenRecord;
    if (tk.guestType !== "digital" || !tk.groomUid) {
      res.status(409).json({ error: "wrong_invite_type" });
      return null;
    }
    if (Date.now() > tk.expiresAt) {
      res.status(410).json({ error: "token_expired" });
      return null;
    }
    return tk;
  } catch (err) {
    res.status(500).json({ error: "read_failed", detail: errorMessage(err) });
    return null;
  }
}

function isPhotographerPublished(groomUid: string): Promise<boolean> {
  return getFirestore()
    .doc(`digitalInvitations/${groomUid}`)
    .get()
    .then((snap) => snap.exists && snap.data()?.photographerPublished === true);
}

function guestFaceDoc(groomUid: string, token: string) {
  return getFirestore().doc(
    `digitalInvitations/${groomUid}/guestFaces/${hashToken(token)}`,
  );
}

/**
 * Compare a guest descriptor against every indexed photo of the groom and
 * join display fields (name/url) from the photographerFiles metadata.
 */
async function matchesForGroom(
  groomUid: string,
  guestDescriptor: number[],
): Promise<FaceMatch[]> {
  const fs = getFirestore();
  const [facesSnap, filesSnap] = await Promise.all([
    fs.collection(`digitalInvitations/${groomUid}/photoFaces`).get(),
    fs.collection(`digitalInvitations/${groomUid}/photographerFiles`).get(),
  ]);
  const faceRows: PhotoFacesRow[] = facesSnap.docs.map((d) => {
    const data = d.data();
    return {
      fileId: d.id,
      faces: Array.isArray(data.faces) ? data.faces : [],
      modelVersion: String(data.modelVersion ?? ""),
      status: String(data.status ?? ""),
    };
  });
  const fileRows: PhotoFileRow[] = filesSnap.docs.map((d) => {
    const data = d.data();
    return {
      fileId: d.id,
      name: String(data.name ?? ""),
      url: String(data.url ?? ""),
      type: String(data.type ?? ""),
    };
  });
  return computeMatches(guestDescriptor, faceRows, fileRows, MATCH_THRESHOLD);
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
