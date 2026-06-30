import {
  getFirestore,
  CollectionReference,
  DocumentReference,
  Firestore,
} from "firebase-admin/firestore";
import { AuthRequest } from "../../middleware/auth";
import { COLL_ROOT,COLL_GUESTS,COLL_PHOTOG,COLL_DESIGNS,SCHEMA_VERSION,PARENT_ONLY_KEYS,DEMO_UID,DEMO_DESIGN_ID,DEMO_CONFIG_DOC } from "./constants";
import { projectMediaDoc } from "./project";

// ─── Firestore + Storage helpers ──────────────────────────────────────────────

function fs(): Firestore {
  return getFirestore();
}

// The PARENT invitation doc. Post-v2 it holds operational fields only
// (photographerPublished, guestRanks) + migration pointers (schemaVersion,
// defaultDesignId). `mediaDoc` is kept as an alias for the few callers that
// still read the parent directly (photographer auth).
function parentDoc(uid: string): DocumentReference {
  return fs().doc(`${COLL_ROOT}/${uid}`);
}
function mediaDoc(uid: string): DocumentReference {
  return parentDoc(uid);
}

function designsCol(uid: string): CollectionReference {
  return fs().collection(`${COLL_ROOT}/${uid}/${COLL_DESIGNS}`);
}
function designDoc(uid: string, designId: string): DocumentReference {
  return designsCol(uid).doc(designId);
}

// The admin-editable demo design (a normal design doc under the reserved demo
// uid) and the published snapshot the public demo page reads.
function demoDesignDoc(): DocumentReference {
  return designDoc(DEMO_UID, DEMO_DESIGN_ID);
}
function demoConfigDoc(): DocumentReference {
  return fs().doc(DEMO_CONFIG_DOC);
}


/**
 * Lazily migrate a groom from v1 (single design on the parent doc) to v2
 * (designs subcollection). Idempotent and NON-destructive: copies the legacy
 * parent design into `designs/{autoId}`, stamps the parent with
 * `schemaVersion`+`defaultDesignId`, and leaves the old parent fields in place
 * (new reads ignore them). Returns the groom's defaultDesignId. Already-minted
 * invite tokens (immutable RTDB snapshots) are untouched.
 */
async function ensureMigrated(uid: string): Promise<string> {
  const pRef = parentDoc(uid);
  return fs().runTransaction(async (tx) => {
    const snap = await tx.get(pRef);
    const data = snap.exists ? (snap.data() as Record<string, unknown>) : null;

    if (
      data &&
      data.schemaVersion === SCHEMA_VERSION &&
      typeof data.defaultDesignId === "string" &&
      data.defaultDesignId
    ) {
      return data.defaultDesignId as string;
    }

    const designRef = designsCol(uid).doc();
    const defaultDesignId = designRef.id;

    // projectMediaDoc folds a legacy single `backgroundUrl` into media[0].
    const legacy = data ? (projectMediaDoc(data) as Record<string, unknown>) : {};
    const designPayload: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(legacy || {})) {
      if (!PARENT_ONLY_KEYS.has(k)) designPayload[k] = v;
    }
    if (!designPayload.title) designPayload.title = { ar: "التصميم الأساسي", he: "עיצוב ראשי" };
    designPayload.order = 0;
    if (designPayload.createdAt == null) designPayload.createdAt = Date.now();
    if (designPayload.designStatus == null) designPayload.designStatus = "draft";
    if (designPayload.designVersion == null) designPayload.designVersion = 1;

    tx.set(designRef, designPayload);
    tx.set(pRef, { schemaVersion: SCHEMA_VERSION, defaultDesignId, designCount: 1 }, { merge: true });
    return defaultDesignId;
  });
}

/** Resolve (migrating if needed) the groom's default design id. */
async function resolveDefaultDesignId(uid: string): Promise<string> {
  return ensureMigrated(uid);
}

/**
 * Resolve which design a request targets: the explicit `:designId` path param
 * (new per-design routes) or the groom's default design (legacy routes, which
 * also triggers the lazy migration).
 */
async function resolveDesignId(req: AuthRequest): Promise<string> {
  if (req.params.designId) return req.params.designId;
  return resolveDefaultDesignId(req.params.uid);
}

function guestsCol(uid: string): CollectionReference {
  return fs().collection(`${COLL_ROOT}/${uid}/${COLL_GUESTS}`);
}

function wishesCol(uid: string): CollectionReference {
  return fs().collection(`${COLL_ROOT}/${uid}/wishes`);
}

function photographerCol(uid: string): CollectionReference {
  return fs().collection(`${COLL_ROOT}/${uid}/${COLL_PHOTOG}`);
}

export { fs, parentDoc, mediaDoc, designsCol, designDoc, demoDesignDoc, demoConfigDoc, ensureMigrated, resolveDefaultDesignId, resolveDesignId, guestsCol, wishesCol, photographerCol };
