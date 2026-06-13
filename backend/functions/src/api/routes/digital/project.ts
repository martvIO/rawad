import { PUBLIC_DESIGN_FIELDS } from "./constants";

// ─── Media-doc projection (legacy compatibility) ──────────────────────────────

/**
 * Project the parent invitation doc into the shape the frontend expects.
 * The legacy single-background fields (backgroundUrl / backgroundType /
 * storagePath) are folded into a synthetic media[0] entry so the UI can
 * read media[] uniformly without a separate migration pass.
 */
function projectMediaDoc(data: FirebaseFirestore.DocumentData | undefined):
  | Record<string, unknown>
  | null {
  if (!data) return null;
  if (Array.isArray(data.media) && data.media.length > 0) return data;
  if (data.backgroundUrl) {
    return {
      ...data,
      media: [
        {
          url: data.backgroundUrl,
          kind: legacyBackgroundKind(data.backgroundType),
          storagePath: data.storagePath || "",
          order: 0,
        },
      ],
    };
  }
  return data;
}

/**
 * Project a design doc down to the guest-facing fields for the UNAUTHENTICATED
 * public read. Folds any legacy single-background into media[] first (via
 * projectMediaDoc), then keeps only the PUBLIC_DESIGN_FIELDS allowlist so no
 * design-workflow metadata (e.g. designRejectionNote) or other internal field
 * is ever served to a tokenless caller.
 */
function projectPublicDoc(
  data: FirebaseFirestore.DocumentData | undefined
): Record<string, unknown> | null {
  const full = projectMediaDoc(data) as Record<string, unknown> | null;
  if (!full) return null;
  const out: Record<string, unknown> = {};
  for (const key of Object.keys(full)) {
    if (PUBLIC_DESIGN_FIELDS.has(key)) out[key] = full[key];
  }
  return out;
}

/**
 * Promote a legacy single-background doc to a media[]-shaped doc when the
 * first multi-upload arrives. Returns the migrated array (or the existing
 * one when nothing to migrate).
 */
function migrateLegacyBackground(
  data: FirebaseFirestore.DocumentData | null | undefined,
  existing: unknown[]
): unknown[] {
  if (existing.length > 0) return existing;
  if (!data) return existing;
  const url = data.backgroundUrl;
  if (!url) return existing;
  return [
    {
      url,
      kind: legacyBackgroundKind(data.backgroundType),
      storagePath: data.storagePath || "",
      order: 0,
    },
  ];
}

function legacyBackgroundKind(type: unknown): "video" | "gif" | "image" {
  if (type === "video") return "video";
  if (type === "gif") return "gif";
  return "image";
}

function errorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (typeof err === "string") return err;
  return "unknown";
}

// In production we never echo raw error messages back to the client — Firebase
// Admin errors can include Firestore document paths, GCS bucket names, and
// internal function identifiers. Dev/emulator builds keep the detail so
// engineers can debug failed uploads without trawling Cloud Logging.
function safeDetail(err: unknown): string | undefined {
  // Suppressed by default so prod never echoes raw error text. Opt in locally
  // with DAWA_DEBUG_ERRORS=1 (e.g. functions/.env.local) to debug.
  if (process.env.DAWA_DEBUG_ERRORS !== "1") return undefined;
  return errorMessage(err);
}

export { projectMediaDoc, projectPublicDoc, migrateLegacyBackground, legacyBackgroundKind, errorMessage, safeDetail };
