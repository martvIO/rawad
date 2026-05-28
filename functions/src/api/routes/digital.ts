// Digital-invitation endpoints (Firestore + Storage).
//
// Consolidates four legacy frontend service files (digitalInvitation.js,
// designRequests.js, plus parts of liveLocations/proofs) and one onCall
// function (resetPassword stays in auth.ts) into a single Express router.
//
// Resource layout:
//   Firestore: digitalInvitations/{groomUid}                                — media doc
//              digitalInvitations/{groomUid}/guests/{guestId}                — RSVP list
//              digitalInvitations/{groomUid}/photographerFiles/{fileId}      — photo metadata
//              digitalInvitations/{groomUid}/designRequests/{reqId}          — design workflow
//   Storage:   digitalMedia/{groomUid}/                                       — invite backgrounds
//              photographerFiles/{groomUid}/                                   — wedding photos
//              designMockups/{groomUid}/{reqId}/                              — admin mockups
//
// Authorization (mirror of firestore.rules + storage.rules):
//   - parent doc reads (`/public`): unauthenticated (true)
//   - all other reads/writes: admin OR owning groom
//   - photographerFiles: also public-read when photographerPublished == true
//
// What this file does NOT do:
//   - It does not transcode media or generate thumbnails.
//   - It does not stream design-request status changes; the client polls.
//   - It does not migrate `digitalInvitePreview` (a separate /d/** rewrite
//     with its own caching — kept as a standalone onRequest in index.ts).

import { Router, Request, Response } from "express";
import {
  getFirestore,
  CollectionReference,
  DocumentReference,
  Firestore,
} from "firebase-admin/firestore";
import { getStorage, getDownloadURL } from "firebase-admin/storage";
import busboy from "busboy";
import {
  AuthRequest,
  requireAuth,
  requireAdmin,
} from "../middleware/auth";
import { MAX_BYTES, MAX_LEN } from "../../constants/limits";

// ─── Constants ────────────────────────────────────────────────────────────────

const COLL_ROOT = "digitalInvitations";
const COLL_GUESTS = "guests";
const COLL_PHOTOG = "photographerFiles";

const STORAGE_MEDIA_PREFIX = "digitalMedia";
const STORAGE_PHOTOG_PREFIX = "photographerFiles";

const MAX_GUEST_NAME_LEN = MAX_LEN.NAME;
const MAX_GUEST_PHONE_LEN = MAX_LEN.PHONE;
const MAX_GUEST_RANK_LEN = MAX_LEN.GUEST_RANK;
const MAX_GUEST_NOTE_LEN = MAX_LEN.NOTE;
const MAX_BRIDE_NAME_LEN = MAX_LEN.NAME;
const MAX_VENUE_LEN = 120;
const MAX_VENUE_ADDR_LEN = 200;
const MAX_CUSTOM_MSG_LEN = 500;
const MAX_REJECT_NOTE_LEN = 500;
const MAX_STORY_LEN = 1000;
const MAX_EVENT_TITLE_LEN = 60;
const MAX_EVENT_TIME_LEN = 40;
const MAX_EVENT_VENUE_LEN = 120;
const MAX_EVENT_ADDR_LEN = 200;
const MAX_MAP_URL_LEN = 600;
const MAX_GIFT_IBAN_LEN = 60;
const MAX_GIFT_NOTE_LEN = 300;
const MAX_MUSIC_URL_LEN = 600;
const MAX_EVENT_ICON_LEN = 8;
const MAX_EVENTS = 6;
const MAX_RANK_ITEMS = 32;
// New luxury-design fields.
const MAX_EYEBROW_LEN = 60;
const MAX_MONOGRAM_LEN = 12;
const MAX_VENUE_CITY_LEN = 80;
const MAX_ACCESS_NOTE_LEN = 200;
const MAX_DRESS_CODE_LEN = 120;
const MAX_STORY_WHEN_LEN = 40;
const MAX_STORY_TITLE_LEN = 60;
const MAX_STORY_BODY_LEN = 400;
const MAX_STORY_ITEMS = 8;
const MAX_DETAIL_META_LEN = 40;
const MAX_DETAIL_TITLE_LEN = 80;
const MAX_DETAIL_BODY_LEN = 300;
const MAX_DETAIL_ITEMS = 8;
const MAX_HOTEL_NAME_LEN = 80;
const MAX_HOTEL_WALK_LEN = 40;
const MAX_HOTEL_ITEMS = 6;
const MAX_WISH_WHO_LEN = 60;
const MAX_WISH_WHAT_LEN = 300;
const MAX_WISH_ITEMS = 30;
const MAX_MEAL_OPTION_LEN = 40;
const MAX_MEAL_OPTIONS = 8;
const MAX_CAPTION_LEN = 120;
const MAX_CAPTION_ENTRIES = 60;
const MAX_GUEST_STATUSES = new Set(["pending", "attending", "absent"]);

const THEME_COLORS = new Set(["gold", "rose", "blue", "emerald", "white"]);
const FONT_FAMILIES = new Set(["amiri", "noto", "cairo"]);

// Fields whose change demotes an approved design back to draft. Operational
// flags (photographerPublished, guestRanks) are intentionally NOT design fields.
const DESIGN_FIELDS = new Set([
  "brideName",
  "groomDisplayName",
  "weddingDate",
  "venue",
  "venueAddress",
  "customMessage",
  "themeColor",
  "fontFamily",
  "story",
  "events",
  "giftIban",
  "giftNote",
  "musicUrl",
  "storyEnabled",
  "eventsEnabled",
  "countdownEnabled",
  "galleryEnabled",
  "giftEnabled",
  "musicEnabled",
  "footerDockEnabled",
  // New luxury-design fields.
  "eyebrow",
  "monogram",
  "venueCity",
  "accessNote",
  "dressCode",
  "storyTimeline",
  "details",
  "hotels",
  "wishes",
  "mealOptions",
  "mediaCaptions",
  "detailsEnabled",
  "venueEnabled",
  "guestbookEnabled",
  "envelopeEnabled",
  "rsvpCompanionsEnabled",
  "rsvpMealEnabled",
  "rsvpSongEnabled",
]);

const MAX_INVITE_MEDIA_BYTES = MAX_BYTES.INVITE_MEDIA;
const MAX_PHOTOG_BYTES = MAX_BYTES.PHOTOGRAPHER;

const ALLOWED_MEDIA_PREFIX = ["image/", "video/"];

const SAFE_NAME_RE = /[^\w.\-]/g;

export const digitalRouter = Router();

// ═══════════════════════════════════════════════════════════════════════════════
// GUESTS  —  digitalInvitations/{uid}/guests/{guestId}
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * List a groom's digital guests, sorted by createdAt ASC (legacy order).
 * Authorized for admin or owning groom — mirrors `firestore.rules`.
 */
digitalRouter.get(
  "/:uid/guests",
  requireAuth,
  async (req: AuthRequest, res: Response) => {
    if (!canActOnUid(req, req.params.uid)) {
      res.status(403).json({ error: "forbidden" });
      return;
    }
    try {
      const snap = await guestsCol(req.params.uid)
        .orderBy("createdAt", "asc")
        .get();
      res.json(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    } catch (err) {
      res.status(500).json({ error: "read_failed", detail: safeDetail(err) });
    }
  }
);

/**
 * Add a guest. Body: `{ name, phone, ranks? }` where `ranks` is an array
 * of zero-or-more rank strings (each must already exist in the parent
 * doc's `guestRanks`; the server does not enforce that — it accepts any
 * string ≤ MAX_GUEST_RANK_LEN and dedupes). Legacy single `rank: string`
 * is still accepted and folded into `[rank]`. Always seeds status="pending"
 * and createdAt=now. Returns `{ id, ...record }` so the client can render
 * the row immediately without a round-trip.
 */
digitalRouter.post(
  "/:uid/guests",
  requireAuth,
  async (req: AuthRequest, res: Response) => {
    if (!canActOnUid(req, req.params.uid)) {
      res.status(403).json({ error: "forbidden" });
      return;
    }
    const sanitized = sanitizeDigitalGuestCreate(req.body);
    if (!sanitized.ok) {
      res.status(400).json({ error: sanitized.error, field: sanitized.field });
      return;
    }
    try {
      const docRef = await guestsCol(req.params.uid).add({
        ...sanitized.value,
        status: "pending",
        createdAt: Date.now(),
      });
      const snap = await docRef.get();
      res.json({ id: docRef.id, ...snap.data() });
    } catch (err) {
      res.status(500).json({ error: "write_failed", detail: safeDetail(err) });
    }
  }
);

/**
 * Patch a guest. Allowed fields: name, phone, ranks, status, note. Unknown
 * keys are dropped. Status is restricted to the same 3 values the UI cycles.
 * `ranks` always replaces (pass `[]` to clear). Legacy `rank: string` is
 * also accepted and folded into `ranks: [rank]`.
 */
digitalRouter.patch(
  "/:uid/guests/:id",
  requireAuth,
  async (req: AuthRequest, res: Response) => {
    if (!canActOnUid(req, req.params.uid)) {
      res.status(403).json({ error: "forbidden" });
      return;
    }
    const sanitized = sanitizeDigitalGuestPatch(req.body);
    if (!sanitized.ok) {
      res.status(400).json({ error: sanitized.error, field: sanitized.field });
      return;
    }
    if (Object.keys(sanitized.value).length === 0) {
      res.status(400).json({ error: "empty_patch" });
      return;
    }
    try {
      await guestsCol(req.params.uid)
        .doc(req.params.id)
        .update(sanitized.value as Record<string, unknown>);
      res.json({ ok: true });
    } catch (err) {
      res.status(500).json({ error: "write_failed", detail: safeDetail(err) });
    }
  }
);

digitalRouter.delete(
  "/:uid/guests/:id",
  requireAuth,
  async (req: AuthRequest, res: Response) => {
    if (!canActOnUid(req, req.params.uid)) {
      res.status(403).json({ error: "forbidden" });
      return;
    }
    try {
      await guestsCol(req.params.uid).doc(req.params.id).delete();
      res.json({ ok: true });
    } catch (err) {
      res.status(500).json({ error: "delete_failed", detail: safeDetail(err) });
    }
  }
);

// ═══════════════════════════════════════════════════════════════════════════════
// MEDIA DOC + media[]  —  digitalInvitations/{uid}
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Read the parent invitation doc. Returns the projected shape (auto-
 * migrates legacy `backgroundUrl` into a synthetic media[0] entry so the
 * frontend can read media[] uniformly).
 */
digitalRouter.get(
  "/:uid/media",
  requireAuth,
  async (req: AuthRequest, res: Response) => {
    if (!canActOnUid(req, req.params.uid)) {
      res.status(403).json({ error: "forbidden" });
      return;
    }
    try {
      const snap = await mediaDoc(req.params.uid).get();
      res.json(snap.exists ? projectMediaDoc(snap.data()) : null);
    } catch (err) {
      res.status(500).json({ error: "read_failed", detail: safeDetail(err) });
    }
  }
);

/**
 * Patch invitation doc settings (weddingDate, photographerPublished,
 * guestRanks, brideName, groomDisplayName). Unknown keys are dropped.
 * Setting `weddingDate: null` clears it (legacy code allowed this).
 */
digitalRouter.patch(
  "/:uid/media/settings",
  requireAuth,
  async (req: AuthRequest, res: Response) => {
    if (!canActOnUid(req, req.params.uid)) {
      res.status(403).json({ error: "forbidden" });
      return;
    }
    const sanitized = sanitizeMediaSettings(req.body);
    if (!sanitized.ok) {
      res.status(400).json({ error: sanitized.error, field: sanitized.field });
      return;
    }
    if (Object.keys(sanitized.value).length === 0) {
      res.status(400).json({ error: "empty_patch" });
      return;
    }
    try {
      const patch: Record<string, unknown> = { ...sanitized.value };
      const touchesDesign = Object.keys(sanitized.value).some((k) =>
        DESIGN_FIELDS.has(k)
      );
      if (touchesDesign) {
        // Edits to a design field while approved demote it back to draft —
        // already-sent invite tokens are unaffected because they carry a
        // designSnapshot embedded at mint time.
        const snap = await mediaDoc(req.params.uid).get();
        if (snap.exists && snap.data()?.designStatus === "approved") {
          patch.designStatus = "draft";
          patch.designApprovedAt = null;
        }
      }
      await mediaDoc(req.params.uid).set(patch, { merge: true });
      res.json({ ok: true });
    } catch (err) {
      res.status(500).json({ error: "write_failed", detail: safeDetail(err) });
    }
  }
);

/**
 * Upload a new background media item. Multipart `file` field, max 50 MB,
 * `image/*` or `video/*`. Storage path: `digitalMedia/{uid}/m_{ts}.{ext}`.
 * Appends to the media[] array via a read-modify-write so concurrent
 * uploads don't clobber.
 */
digitalRouter.post(
  "/:uid/media/upload",
  requireAuth,
  async (req: AuthRequest, res: Response) => {
    if (!canActOnUid(req, req.params.uid)) {
      res.status(403).json({ error: "forbidden" });
      return;
    }
    let parsed: ParsedMultipart;
    try {
      parsed = await parseMultipart(req, MAX_INVITE_MEDIA_BYTES);
    } catch (err) {
      res.status(400).json({ error: "invalid_multipart", detail: safeDetail(err) });
      return;
    }
    if (!parsed.file) {
      res.status(400).json({ error: "missing_file" });
      return;
    }
    if (parsed.file.truncated) {
      res.status(413).json({ error: "file_too_large", maxBytes: MAX_INVITE_MEDIA_BYTES });
      return;
    }
    if (!hasAllowedPrefix(parsed.file.contentType, ALLOWED_MEDIA_PREFIX)) {
      res.status(415).json({ error: "unsupported_content_type" });
      return;
    }

    try {
      const uid = req.params.uid;
      const ext = pickExtensionFromFilename(parsed.file.filename, "bin");
      const path = `${STORAGE_MEDIA_PREFIX}/${uid}/m_${Date.now()}.${ext}`;
      const url = await uploadAndGetUrl(
        path,
        parsed.file.buffer,
        parsed.file.contentType
      );

      const item = {
        url,
        kind: kindOf(parsed.file.contentType),
        storagePath: path,
        order: Date.now(),
      };

      // BUG-O003 fix — atomic append via transaction.
      // The previous code read media[], appended, and wrote back in three
      // separate steps. Parallel uploads (Promise.allSettled on N files)
      // all read the same `existing`, then each wrote `[existing, file_i]`,
      // so later writes clobbered earlier ones and only the last upload
      // survived. A transaction serializes the read-modify-write per doc
      // so concurrent uploads each see the prior commits and append safely.
      const docRef = mediaDoc(uid);
      await fs().runTransaction(async (tx) => {
        const docSnap = await tx.get(docRef);
        const data = docSnap.exists ? docSnap.data() : null;
        const existing = (data?.media ?? []) as unknown[];
        const migrated = migrateLegacyBackground(data, existing);
        const update: Record<string, unknown> = { media: [...migrated, item] };
        if (data?.designStatus === "approved") {
          update.designStatus = "draft";
          update.designApprovedAt = null;
        }
        tx.set(docRef, update, { merge: true });
      });
      res.json(item);
    } catch (err) {
      res.status(500).json({ error: "upload_failed", detail: safeDetail(err) });
    }
  }
);

/**
 * Delete one media item. Body: `{ storagePath }`. Removes the entry from
 * media[] (read-modify-write) and best-effort deletes the Storage object.
 */
digitalRouter.post(
  "/:uid/media/delete-item",
  requireAuth,
  async (req: AuthRequest, res: Response) => {
    if (!canActOnUid(req, req.params.uid)) {
      res.status(403).json({ error: "forbidden" });
      return;
    }
    const storagePath = (req.body?.storagePath ?? "").toString();
    if (!storagePath.startsWith(`${STORAGE_MEDIA_PREFIX}/${req.params.uid}/`)) {
      res.status(400).json({ error: "invalid_storage_path" });
      return;
    }
    try {
      // BUG-O003 fix — same read-modify-write race as the upload path.
      // A delete coming in mid-upload could read media[] before the upload's
      // commit, then write back the pre-upload array — silently restoring a
      // file that was just deleted, or vice versa. Transaction makes both
      // operations linearizable against each other.
      const docRef = mediaDoc(req.params.uid);
      await fs().runTransaction(async (tx) => {
        const snap = await tx.get(docRef);
        if (!snap.exists) return;
        const data = snap.data();
        const existing = (data?.media ?? []) as { storagePath?: string }[];
        const filtered = existing.filter((m) => m.storagePath !== storagePath);
        const update: Record<string, unknown> = { media: filtered };
        if (data?.designStatus === "approved") {
          update.designStatus = "draft";
          update.designApprovedAt = null;
        }
        tx.set(docRef, update, { merge: true });
      });
      await deleteStorageObjectSilently(storagePath);
      res.json({ ok: true });
    } catch (err) {
      res.status(500).json({ error: "delete_failed", detail: safeDetail(err) });
    }
  }
);

/**
 * Clear the entire invitation doc + every file under digitalMedia/{uid}.
 * Used by the "remove background" admin/groom action.
 */
digitalRouter.delete(
  "/:uid/media",
  requireAuth,
  async (req: AuthRequest, res: Response) => {
    if (!canActOnUid(req, req.params.uid)) {
      res.status(403).json({ error: "forbidden" });
      return;
    }
    try {
      await mediaDoc(req.params.uid).delete().catch(() => undefined);
      await deleteStorageFolder(`${STORAGE_MEDIA_PREFIX}/${req.params.uid}/`);
      res.json({ ok: true });
    } catch (err) {
      res.status(500).json({ error: "delete_failed", detail: safeDetail(err) });
    }
  }
);

// ═══════════════════════════════════════════════════════════════════════════════
// PHOTOGRAPHER FILES  —  digitalInvitations/{uid}/photographerFiles
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * List photographer files (Firestore docs) sorted by uploadedAt DESC.
 * Authorized for admin / groom; also for the public when
 * `photographerPublished === true` on the parent doc.
 */
digitalRouter.get(
  "/:uid/photographer",
  async (req: AuthRequest, res: Response) => {
    const authed = await authenticatePhotographerRead(req);
    if (!authed.ok) {
      res.status(authed.status).json({ error: authed.error });
      return;
    }
    try {
      const snap = await photographerCol(req.params.uid)
        .orderBy("uploadedAt", "desc")
        .get();
      res.json(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    } catch (err) {
      res.status(500).json({ error: "read_failed", detail: safeDetail(err) });
    }
  }
);

/**
 * Upload a photographer file. Multipart `file`, max 200 MB, any content
 * type (the legacy code allowed `application/octet-stream`). Stores under
 * `photographerFiles/{uid}/{ts}_{safeName}` and writes a metadata doc.
 */
digitalRouter.post(
  "/:uid/photographer/upload",
  requireAuth,
  async (req: AuthRequest, res: Response) => {
    if (!canActOnUid(req, req.params.uid)) {
      res.status(403).json({ error: "forbidden" });
      return;
    }
    let parsed: ParsedMultipart;
    try {
      parsed = await parseMultipart(req, MAX_PHOTOG_BYTES);
    } catch (err) {
      res.status(400).json({ error: "invalid_multipart", detail: safeDetail(err) });
      return;
    }
    if (!parsed.file) {
      res.status(400).json({ error: "missing_file" });
      return;
    }
    if (parsed.file.truncated) {
      res.status(413).json({ error: "file_too_large", maxBytes: MAX_PHOTOG_BYTES });
      return;
    }

    try {
      const uid = req.params.uid;
      const safeName = parsed.file.filename.replace(SAFE_NAME_RE, "_");
      const path = `${STORAGE_PHOTOG_PREFIX}/${uid}/${Date.now()}_${safeName}`;
      const url = await uploadAndGetUrl(
        path,
        parsed.file.buffer,
        parsed.file.contentType
      );
      const docRef = await photographerCol(uid).add({
        name: parsed.file.filename,
        url,
        type: parsed.file.contentType,
        storagePath: path,
        uploadedAt: Date.now(),
      });
      res.json({ id: docRef.id, url, storagePath: path });
    } catch (err) {
      res.status(500).json({ error: "upload_failed", detail: safeDetail(err) });
    }
  }
);

/**
 * Rename a photographer file. Body: `{ name }`. Trimmed name must not be
 * empty. Only updates the Firestore doc; Storage object is untouched.
 */
digitalRouter.patch(
  "/:uid/photographer/:fileId",
  requireAuth,
  async (req: AuthRequest, res: Response) => {
    if (!canActOnUid(req, req.params.uid)) {
      res.status(403).json({ error: "forbidden" });
      return;
    }
    const name = (req.body?.name ?? "").toString().trim();
    if (!name || name.length > MAX_GUEST_NAME_LEN) {
      res.status(400).json({ error: "invalid_name" });
      return;
    }
    try {
      await photographerCol(req.params.uid)
        .doc(req.params.fileId)
        .update({ name });
      res.json({ ok: true });
    } catch (err) {
      res.status(500).json({ error: "write_failed", detail: safeDetail(err) });
    }
  }
);

/**
 * Delete a photographer file. Reads the doc first to capture storagePath,
 * deletes both layers. Tolerates orphans (missing doc or missing object).
 */
digitalRouter.delete(
  "/:uid/photographer/:fileId",
  requireAuth,
  async (req: AuthRequest, res: Response) => {
    if (!canActOnUid(req, req.params.uid)) {
      res.status(403).json({ error: "forbidden" });
      return;
    }
    try {
      const docRef = photographerCol(req.params.uid).doc(req.params.fileId);
      const snap = await docRef.get();
      const storagePath = snap.exists ? snap.data()?.storagePath : null;
      await docRef.delete().catch(() => undefined);
      if (storagePath) await deleteStorageObjectSilently(storagePath);
      res.json({ ok: true });
    } catch (err) {
      res.status(500).json({ error: "delete_failed", detail: safeDetail(err) });
    }
  }
);

// ═══════════════════════════════════════════════════════════════════════════════
// DESIGN APPROVAL STATE MACHINE  —  fields on digitalInvitations/{uid}
// ═══════════════════════════════════════════════════════════════════════════════
//
// designStatus transitions:
//   draft | rejected      → POST /design/submit  → pending_approval
//   pending_approval      → POST /design/cancel  → draft  (groom)
//   pending_approval      → POST /design/approve → approved (admin)
//   pending_approval      → POST /design/reject  → rejected (admin)
//   approved              → any design-field edit → draft (handled in PATCH
//                                                  /media/settings + media
//                                                  upload + delete-item)
//
// Already-distributed invite tokens carry a designSnapshot embedded at mint
// time, so demoting back to draft never alters the invitation that a guest
// already opened.

/**
 * Admin-only: list every groom's invitation doc with their current design
 * status + the fields the admin needs to render the review grid. Mounted
 * BEFORE /:uid/* so the literal path isn't captured as a groomUid.
 */
digitalRouter.get(
  "/design-list",
  requireAuth,
  requireAdmin,
  async (_req: AuthRequest, res: Response) => {
    try {
      const snap = await getFirestore().collection(COLL_ROOT).get();
      const rows = snap.docs.map((d) => {
        const data = d.data() || {};
        return {
          groomUid: d.id,
          brideName: data.brideName ?? "",
          groomDisplayName: data.groomDisplayName ?? "",
          weddingDate: data.weddingDate ?? null,
          venue: data.venue ?? "",
          venueAddress: data.venueAddress ?? "",
          customMessage: data.customMessage ?? "",
          themeColor: data.themeColor ?? "gold",
          fontFamily: data.fontFamily ?? "amiri",
          story: data.story ?? "",
          events: Array.isArray(data.events) ? data.events : [],
          giftIban: data.giftIban ?? "",
          giftNote: data.giftNote ?? "",
          musicUrl: data.musicUrl ?? "",
          storyEnabled: data.storyEnabled ?? true,
          eventsEnabled: data.eventsEnabled ?? true,
          countdownEnabled: data.countdownEnabled ?? true,
          galleryEnabled: data.galleryEnabled ?? true,
          giftEnabled: data.giftEnabled ?? true,
          musicEnabled: data.musicEnabled ?? true,
          footerDockEnabled: data.footerDockEnabled ?? true,
          eyebrow: data.eyebrow ?? "",
          monogram: data.monogram ?? "",
          venueCity: data.venueCity ?? "",
          accessNote: data.accessNote ?? "",
          dressCode: data.dressCode ?? "",
          storyTimeline: Array.isArray(data.storyTimeline) ? data.storyTimeline : [],
          details: Array.isArray(data.details) ? data.details : [],
          hotels: Array.isArray(data.hotels) ? data.hotels : [],
          wishes: Array.isArray(data.wishes) ? data.wishes : [],
          mealOptions: Array.isArray(data.mealOptions) ? data.mealOptions : [],
          mediaCaptions: data.mediaCaptions ?? {},
          detailsEnabled: data.detailsEnabled ?? true,
          venueEnabled: data.venueEnabled ?? true,
          guestbookEnabled: data.guestbookEnabled ?? true,
          envelopeEnabled: data.envelopeEnabled ?? true,
          rsvpCompanionsEnabled: data.rsvpCompanionsEnabled ?? true,
          rsvpMealEnabled: data.rsvpMealEnabled ?? true,
          rsvpSongEnabled: data.rsvpSongEnabled ?? true,
          media: Array.isArray(data.media) ? data.media : [],
          designStatus: data.designStatus ?? "draft",
          designSubmittedAt: data.designSubmittedAt ?? null,
          designApprovedAt: data.designApprovedAt ?? null,
          designRejectedAt: data.designRejectedAt ?? null,
          designRejectionNote: data.designRejectionNote ?? null,
          designVersion: data.designVersion ?? 1,
        };
      });
      res.json(rows);
    } catch (err) {
      res.status(500).json({ error: "read_failed", detail: safeDetail(err) });
    }
  }
);

/**
 * Groom submits design for admin approval. Allowed only from draft|rejected.
 * Increments designVersion, clears any rejection note, stamps designSubmittedAt.
 */
digitalRouter.post(
  "/:uid/design/submit",
  requireAuth,
  async (req: AuthRequest, res: Response) => {
    if (!canActOnUid(req, req.params.uid)) {
      res.status(403).json({ error: "forbidden" });
      return;
    }
    try {
      const docRef = mediaDoc(req.params.uid);
      const result = await fs().runTransaction(async (tx) => {
        const snap = await tx.get(docRef);
        const data = snap.exists ? snap.data() : null;
        const status = (data?.designStatus ?? "draft") as string;
        if (status !== "draft" && status !== "rejected") {
          return { ok: false as const, error: "invalid_state", status };
        }
        const version = Number(data?.designVersion ?? 0) + 1;
        const now = Date.now();
        tx.set(
          docRef,
          {
            designStatus: "pending_approval",
            designSubmittedAt: now,
            designRejectionNote: null,
            designVersion: version,
          },
          { merge: true }
        );
        return { ok: true as const, version, submittedAt: now };
      });
      if (!result.ok) {
        res.status(409).json({ error: result.error, currentStatus: result.status });
        return;
      }
      res.json({ ok: true, designVersion: result.version, designSubmittedAt: result.submittedAt });
    } catch (err) {
      res.status(500).json({ error: "write_failed", detail: safeDetail(err) });
    }
  }
);

/**
 * Groom cancels a pending submission, dropping back to draft so they can
 * keep editing without admin intervention.
 */
digitalRouter.post(
  "/:uid/design/cancel",
  requireAuth,
  async (req: AuthRequest, res: Response) => {
    if (!canActOnUid(req, req.params.uid)) {
      res.status(403).json({ error: "forbidden" });
      return;
    }
    try {
      const docRef = mediaDoc(req.params.uid);
      const result = await fs().runTransaction(async (tx) => {
        const snap = await tx.get(docRef);
        const data = snap.exists ? snap.data() : null;
        const status = (data?.designStatus ?? "draft") as string;
        if (status !== "pending_approval") {
          return { ok: false as const, error: "invalid_state", status };
        }
        tx.set(docRef, { designStatus: "draft" }, { merge: true });
        return { ok: true as const };
      });
      if (!result.ok) {
        res.status(409).json({ error: result.error, currentStatus: result.status });
        return;
      }
      res.json({ ok: true });
    } catch (err) {
      res.status(500).json({ error: "write_failed", detail: safeDetail(err) });
    }
  }
);

/**
 * Admin approves a pending design. Stamps designApprovedAt and clears the
 * rejection note (in case the groom resubmitted after a prior rejection).
 */
digitalRouter.post(
  "/:uid/design/approve",
  requireAuth,
  requireAdmin,
  async (req: AuthRequest, res: Response) => {
    try {
      const docRef = mediaDoc(req.params.uid);
      const result = await fs().runTransaction(async (tx) => {
        const snap = await tx.get(docRef);
        const data = snap.exists ? snap.data() : null;
        const status = (data?.designStatus ?? "draft") as string;
        if (status !== "pending_approval") {
          return { ok: false as const, error: "invalid_state", status };
        }
        const now = Date.now();
        tx.set(
          docRef,
          {
            designStatus: "approved",
            designApprovedAt: now,
            designRejectionNote: null,
          },
          { merge: true }
        );
        return { ok: true as const, approvedAt: now };
      });
      if (!result.ok) {
        res.status(409).json({ error: result.error, currentStatus: result.status });
        return;
      }
      res.json({ ok: true, designApprovedAt: result.approvedAt });
    } catch (err) {
      res.status(500).json({ error: "write_failed", detail: safeDetail(err) });
    }
  }
);

/**
 * Admin rejects a pending design with an explanatory note the groom will
 * see in their Design tab. Body: `{ note: string }`.
 */
digitalRouter.post(
  "/:uid/design/reject",
  requireAuth,
  requireAdmin,
  async (req: AuthRequest, res: Response) => {
    const note = (req.body?.note ?? "").toString().trim();
    if (!note) {
      res.status(400).json({ error: "missing_note", field: "note" });
      return;
    }
    if (note.length > MAX_REJECT_NOTE_LEN) {
      res.status(400).json({ error: "note_too_long", field: "note" });
      return;
    }
    try {
      const docRef = mediaDoc(req.params.uid);
      const result = await fs().runTransaction(async (tx) => {
        const snap = await tx.get(docRef);
        const data = snap.exists ? snap.data() : null;
        const status = (data?.designStatus ?? "draft") as string;
        if (status !== "pending_approval") {
          return { ok: false as const, error: "invalid_state", status };
        }
        const now = Date.now();
        tx.set(
          docRef,
          {
            designStatus: "rejected",
            designRejectedAt: now,
            designRejectionNote: note,
          },
          { merge: true }
        );
        return { ok: true as const, rejectedAt: now };
      });
      if (!result.ok) {
        res.status(409).json({ error: result.error, currentStatus: result.status });
        return;
      }
      res.json({ ok: true, designRejectedAt: result.rejectedAt });
    } catch (err) {
      res.status(500).json({ error: "write_failed", detail: safeDetail(err) });
    }
  }
);

// ═══════════════════════════════════════════════════════════════════════════════
// PUBLIC INVITATION READ  —  /digital/:uid/public
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Unauthenticated read of the projected media doc. Used by the guest-facing
 * `/d/{groomUsername}/{token}` page to render the invitation without
 * sign-in. Returns `null` (HTTP 200) when the doc doesn't exist so the
 * client can decide how to render that case.
 */
digitalRouter.get("/:uid/public", async (req: Request, res: Response) => {
  try {
    const snap = await mediaDoc(req.params.uid).get();
    res.json(snap.exists ? projectMediaDoc(snap.data()) : null);
  } catch (err) {
    res.status(500).json({ error: "read_failed", detail: safeDetail(err) });
  }
});

// ─── Firestore + Storage helpers ──────────────────────────────────────────────

function fs(): Firestore {
  return getFirestore();
}

function mediaDoc(uid: string): DocumentReference {
  return fs().doc(`${COLL_ROOT}/${uid}`);
}

function guestsCol(uid: string): CollectionReference {
  return fs().collection(`${COLL_ROOT}/${uid}/${COLL_GUESTS}`);
}

function photographerCol(uid: string): CollectionReference {
  return fs().collection(`${COLL_ROOT}/${uid}/${COLL_PHOTOG}`);
}

/**
 * Save a buffer to Storage and return a Firebase download URL. The URL
 * uses a Firebase download token embedded in the link, which stays valid
 * until the token is rotated/revoked — strictly better than the prior
 * 30-day signed URL that expired even while still referenced in
 * Firestore.
 *
 * `getDownloadURL` (firebase-admin/storage ≥ v11.4) does NOT require the
 * `Service Account Token Creator` IAM role that `bucket.file().getSignedUrl()`
 * needs, so it works out of the box on a default Firebase Functions deploy.
 *
 * BUG-002 fix — `resumable: true` lets the GCS client chunk the upload
 * and retry individual chunks on transient errors instead of restarting
 * the entire file on any failure. For the larger uploads we support
 * (photographer files up to 200 MB), this is the difference between a
 * failed flaky network costing the whole upload vs. just a few seconds.
 * For small files there's a tiny extra round trip to start the session,
 * but it's well under a second and worth the reliability win.
 */
async function uploadAndGetUrl(
  path: string,
  buffer: Buffer,
  contentType: string
): Promise<string> {
  const file = getStorage().bucket().file(path);
  await file.save(buffer, { contentType, resumable: true });
  return getDownloadURL(file);
}

/**
 * Best-effort delete of a Storage object. Logs but never throws — the
 * Firestore record (or media[] entry) has already been pruned, and a
 * dangling Storage object is recoverable via a sweep.
 */
async function deleteStorageObjectSilently(path: string): Promise<void> {
  try {
    await getStorage().bucket().file(path).delete();
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn("[digital] storage delete failed", path, err);
  }
}

/**
 * Best-effort delete of every object under a prefix. Used by full-media
 * removal — the Firestore doc deletion is the source of truth.
 */
async function deleteStorageFolder(prefix: string): Promise<void> {
  try {
    const [files] = await getStorage().bucket().getFiles({ prefix });
    await Promise.all(
      files.map((f) =>
        f.delete().catch((err) => {
          // eslint-disable-next-line no-console
          console.warn("[digital] folder delete failed", f.name, err);
        })
      )
    );
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn("[digital] folder list failed", prefix, err);
  }
}

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

// ─── Sanitizers ───────────────────────────────────────────────────────────────

type Sanitized<T> =
  | { ok: true; value: T }
  | { ok: false; error: string; field?: string };

interface DigitalGuestCreate {
  name: string;
  phone: string;
  ranks?: string[];
}

/**
 * Coerce a `ranks` payload — accepts either `ranks: string[]` (new shape)
 * or legacy `rank: string` (a single-rank picker, kept so old clients in
 * the field continue to work). Returns a deduped, trimmed array capped at
 * MAX_RANK_ITEMS, or null if the input is malformed.
 */
function coerceRanks(data: Record<string, unknown>):
  | { ok: true; value: string[] | undefined }
  | { ok: false; error: string; field: string } {
  let raw: unknown;
  if (data.ranks !== undefined) raw = data.ranks;
  else if (data.rank !== undefined) raw = [data.rank];
  else return { ok: true, value: undefined };

  if (raw === null) return { ok: true, value: [] };
  if (!Array.isArray(raw)) {
    return { ok: false, error: "invalid_ranks", field: "ranks" };
  }
  const cleaned: string[] = [];
  for (const r of raw) {
    if (typeof r !== "string") continue;
    const v = r.trim();
    if (!v) continue;
    if (v.length > MAX_GUEST_RANK_LEN) {
      return { ok: false, error: "rank_too_long", field: "ranks" };
    }
    if (!cleaned.includes(v)) cleaned.push(v);
    if (cleaned.length >= MAX_RANK_ITEMS) break;
  }
  return { ok: true, value: cleaned };
}

function sanitizeDigitalGuestCreate(
  body: unknown
): Sanitized<DigitalGuestCreate> {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return { ok: false, error: "invalid_body" };
  }
  const data = body as Record<string, unknown>;
  const name = (data.name ?? "").toString().trim();
  const phone = (data.phone ?? "").toString().trim();
  if (!name || name.length > MAX_GUEST_NAME_LEN) {
    return { ok: false, error: "invalid_name", field: "name" };
  }
  if (!phone || phone.length > MAX_GUEST_PHONE_LEN) {
    return { ok: false, error: "invalid_phone", field: "phone" };
  }
  const ranksResult = coerceRanks(data);
  if (!ranksResult.ok) return ranksResult;

  const out: DigitalGuestCreate = { name, phone };
  if (ranksResult.value && ranksResult.value.length > 0) {
    out.ranks = ranksResult.value;
  }
  return { ok: true, value: out };
}

interface DigitalGuestPatch {
  name?: string;
  phone?: string;
  ranks?: string[];
  status?: string;
  note?: string;
}

function sanitizeDigitalGuestPatch(
  body: unknown
): Sanitized<DigitalGuestPatch> {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return { ok: false, error: "invalid_body" };
  }
  const data = body as Record<string, unknown>;
  const out: DigitalGuestPatch = {};

  if (data.name !== undefined) {
    const v = (data.name ?? "").toString().trim();
    if (!v || v.length > MAX_GUEST_NAME_LEN) {
      return { ok: false, error: "invalid_name", field: "name" };
    }
    out.name = v;
  }
  if (data.phone !== undefined) {
    const v = (data.phone ?? "").toString().trim();
    if (!v || v.length > MAX_GUEST_PHONE_LEN) {
      return { ok: false, error: "invalid_phone", field: "phone" };
    }
    out.phone = v;
  }
  if (data.ranks !== undefined || data.rank !== undefined) {
    const ranksResult = coerceRanks(data);
    if (!ranksResult.ok) return ranksResult;
    // PATCH semantics: `ranks` always replaces (empty array clears).
    out.ranks = ranksResult.value ?? [];
  }
  if (data.status !== undefined) {
    const v = (data.status ?? "").toString();
    if (!MAX_GUEST_STATUSES.has(v)) {
      return { ok: false, error: "invalid_status", field: "status" };
    }
    out.status = v;
  }
  if (data.note !== undefined) {
    const v = (data.note ?? "").toString();
    if (v.length > MAX_GUEST_NOTE_LEN) {
      return { ok: false, error: "note_too_long", field: "note" };
    }
    out.note = v;
  }
  return { ok: true, value: out };
}

interface EventItem {
  icon: string;
  title: string;
  time: string;
  venue: string;
  address: string;
  mapUrl: string;
}

interface StoryItem {
  when: string;
  icon: string;
  title: string;
  body: string;
}

interface DetailItem {
  icon: string;
  meta: string;
  title: string;
  body: string;
}

interface HotelItem {
  name: string;
  walk: string;
}

interface WishItem {
  who: string;
  what: string;
}

interface MediaSettings {
  weddingDate?: number | null;
  photographerPublished?: boolean;
  guestRanks?: string[];
  brideName?: string;
  groomDisplayName?: string;
  venue?: string;
  venueAddress?: string;
  customMessage?: string;
  themeColor?: string;
  fontFamily?: string;
  story?: string;
  events?: EventItem[];
  giftIban?: string;
  giftNote?: string;
  musicUrl?: string;
  storyEnabled?: boolean;
  eventsEnabled?: boolean;
  countdownEnabled?: boolean;
  galleryEnabled?: boolean;
  giftEnabled?: boolean;
  musicEnabled?: boolean;
  footerDockEnabled?: boolean;
  // New luxury-design fields.
  eyebrow?: string;
  monogram?: string;
  venueCity?: string;
  accessNote?: string;
  dressCode?: string;
  storyTimeline?: StoryItem[];
  details?: DetailItem[];
  hotels?: HotelItem[];
  wishes?: WishItem[];
  mealOptions?: string[];
  mediaCaptions?: Record<string, string>;
  detailsEnabled?: boolean;
  venueEnabled?: boolean;
  guestbookEnabled?: boolean;
  envelopeEnabled?: boolean;
  rsvpCompanionsEnabled?: boolean;
  rsvpMealEnabled?: boolean;
  rsvpSongEnabled?: boolean;
}

function sanitizeMediaSettings(body: unknown): Sanitized<MediaSettings> {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return { ok: false, error: "invalid_body" };
  }
  const data = body as Record<string, unknown>;
  const out: MediaSettings = {};

  if (data.weddingDate !== undefined) {
    if (data.weddingDate === null) {
      out.weddingDate = null;
    } else if (
      typeof data.weddingDate === "number" &&
      Number.isFinite(data.weddingDate)
    ) {
      out.weddingDate = data.weddingDate;
    } else {
      return { ok: false, error: "invalid_wedding_date", field: "weddingDate" };
    }
  }
  if (data.photographerPublished !== undefined) {
    if (typeof data.photographerPublished !== "boolean") {
      return {
        ok: false,
        error: "invalid_published_flag",
        field: "photographerPublished",
      };
    }
    out.photographerPublished = data.photographerPublished;
  }
  if (data.guestRanks !== undefined) {
    if (!Array.isArray(data.guestRanks)) {
      return { ok: false, error: "invalid_guest_ranks", field: "guestRanks" };
    }
    const cleaned: string[] = [];
    for (const r of data.guestRanks) {
      if (typeof r !== "string") continue;
      const v = r.trim();
      if (!v) continue;
      if (v.length > MAX_GUEST_RANK_LEN) {
        return { ok: false, error: "rank_too_long", field: "guestRanks" };
      }
      if (!cleaned.includes(v)) cleaned.push(v);
      if (cleaned.length >= MAX_RANK_ITEMS) break;
    }
    out.guestRanks = cleaned;
  }
  if (data.brideName !== undefined) {
    const v = (data.brideName ?? "").toString().trim();
    if (v.length > MAX_BRIDE_NAME_LEN) {
      return { ok: false, error: "bride_name_too_long", field: "brideName" };
    }
    out.brideName = v;
  }
  if (data.groomDisplayName !== undefined) {
    const v = (data.groomDisplayName ?? "").toString().trim();
    if (v.length > MAX_BRIDE_NAME_LEN) {
      return { ok: false, error: "groom_name_too_long", field: "groomDisplayName" };
    }
    out.groomDisplayName = v;
  }
  if (data.venue !== undefined) {
    const v = (data.venue ?? "").toString().trim();
    if (v.length > MAX_VENUE_LEN) {
      return { ok: false, error: "venue_too_long", field: "venue" };
    }
    out.venue = v;
  }
  if (data.venueAddress !== undefined) {
    const v = (data.venueAddress ?? "").toString().trim();
    if (v.length > MAX_VENUE_ADDR_LEN) {
      return { ok: false, error: "venue_address_too_long", field: "venueAddress" };
    }
    out.venueAddress = v;
  }
  if (data.customMessage !== undefined) {
    const v = (data.customMessage ?? "").toString();
    if (v.length > MAX_CUSTOM_MSG_LEN) {
      return { ok: false, error: "custom_message_too_long", field: "customMessage" };
    }
    out.customMessage = v;
  }
  if (data.themeColor !== undefined) {
    const v = (data.themeColor ?? "").toString();
    if (!THEME_COLORS.has(v)) {
      return { ok: false, error: "invalid_theme_color", field: "themeColor" };
    }
    out.themeColor = v;
  }
  if (data.fontFamily !== undefined) {
    const v = (data.fontFamily ?? "").toString();
    if (!FONT_FAMILIES.has(v)) {
      return { ok: false, error: "invalid_font_family", field: "fontFamily" };
    }
    out.fontFamily = v;
  }
  if (data.story !== undefined) {
    const v = (data.story ?? "").toString();
    if (v.length > MAX_STORY_LEN) {
      return { ok: false, error: "story_too_long", field: "story" };
    }
    out.story = v;
  }
  if (data.events !== undefined) {
    if (!Array.isArray(data.events)) {
      return { ok: false, error: "invalid_events", field: "events" };
    }
    const cleaned: EventItem[] = [];
    for (const raw of data.events) {
      if (!raw || typeof raw !== "object" || Array.isArray(raw)) continue;
      const e = raw as Record<string, unknown>;
      const item: EventItem = {
        icon: clampField(e.icon, MAX_EVENT_ICON_LEN),
        title: clampField(e.title, MAX_EVENT_TITLE_LEN),
        time: clampField(e.time, MAX_EVENT_TIME_LEN),
        venue: clampField(e.venue, MAX_EVENT_VENUE_LEN),
        address: clampField(e.address, MAX_EVENT_ADDR_LEN),
        mapUrl: clampField(e.mapUrl, MAX_MAP_URL_LEN),
      };
      // Drop entirely-empty rows so the editor's blank template doesn't persist.
      if (item.title || item.time || item.venue || item.address) {
        cleaned.push(item);
      }
      if (cleaned.length >= MAX_EVENTS) break;
    }
    out.events = cleaned;
  }
  if (data.giftIban !== undefined) {
    const v = (data.giftIban ?? "").toString().trim();
    if (v.length > MAX_GIFT_IBAN_LEN) {
      return { ok: false, error: "gift_iban_too_long", field: "giftIban" };
    }
    out.giftIban = v;
  }
  if (data.giftNote !== undefined) {
    const v = (data.giftNote ?? "").toString();
    if (v.length > MAX_GIFT_NOTE_LEN) {
      return { ok: false, error: "gift_note_too_long", field: "giftNote" };
    }
    out.giftNote = v;
  }
  if (data.musicUrl !== undefined) {
    const v = (data.musicUrl ?? "").toString().trim();
    if (v.length > MAX_MUSIC_URL_LEN) {
      return { ok: false, error: "music_url_too_long", field: "musicUrl" };
    }
    if (v.length > 0 && !/^https?:\/\//.test(v)) {
      return { ok: false, error: "music_url_invalid", field: "musicUrl" };
    }
    out.musicUrl = v;
  }
  // ── New luxury-design scalar fields ──────────────────────────────────────
  const scalarFields: [keyof MediaSettings, number, string][] = [
    ["eyebrow", MAX_EYEBROW_LEN, "eyebrow_too_long"],
    ["monogram", MAX_MONOGRAM_LEN, "monogram_too_long"],
    ["venueCity", MAX_VENUE_CITY_LEN, "venue_city_too_long"],
    ["accessNote", MAX_ACCESS_NOTE_LEN, "access_note_too_long"],
    ["dressCode", MAX_DRESS_CODE_LEN, "dress_code_too_long"],
  ];
  for (const [key, max, err] of scalarFields) {
    if (data[key] !== undefined) {
      const v = (data[key] ?? "").toString().trim();
      if (v.length > max) return { ok: false, error: err, field: key as string };
      (out as Record<string, string>)[key as string] = v;
    }
  }

  // ── Story timeline ───────────────────────────────────────────────────────
  if (data.storyTimeline !== undefined) {
    if (!Array.isArray(data.storyTimeline)) {
      return { ok: false, error: "invalid_story_timeline", field: "storyTimeline" };
    }
    const cleaned: StoryItem[] = [];
    for (const raw of data.storyTimeline) {
      if (!raw || typeof raw !== "object" || Array.isArray(raw)) continue;
      const e = raw as Record<string, unknown>;
      const item: StoryItem = {
        when: clampField(e.when, MAX_STORY_WHEN_LEN),
        icon: clampField(e.icon, MAX_EVENT_ICON_LEN),
        title: clampField(e.title, MAX_STORY_TITLE_LEN),
        body: clampField(e.body, MAX_STORY_BODY_LEN),
      };
      if (item.when || item.title || item.body) cleaned.push(item);
      if (cleaned.length >= MAX_STORY_ITEMS) break;
    }
    out.storyTimeline = cleaned;
  }

  // ── Detail cards ─────────────────────────────────────────────────────────
  if (data.details !== undefined) {
    if (!Array.isArray(data.details)) {
      return { ok: false, error: "invalid_details", field: "details" };
    }
    const cleaned: DetailItem[] = [];
    for (const raw of data.details) {
      if (!raw || typeof raw !== "object" || Array.isArray(raw)) continue;
      const e = raw as Record<string, unknown>;
      const item: DetailItem = {
        icon: clampField(e.icon, MAX_EVENT_ICON_LEN),
        meta: clampField(e.meta, MAX_DETAIL_META_LEN),
        title: clampField(e.title, MAX_DETAIL_TITLE_LEN),
        body: clampField(e.body, MAX_DETAIL_BODY_LEN),
      };
      if (item.meta || item.title || item.body) cleaned.push(item);
      if (cleaned.length >= MAX_DETAIL_ITEMS) break;
    }
    out.details = cleaned;
  }

  // ── Nearby hotels ────────────────────────────────────────────────────────
  if (data.hotels !== undefined) {
    if (!Array.isArray(data.hotels)) {
      return { ok: false, error: "invalid_hotels", field: "hotels" };
    }
    const cleaned: HotelItem[] = [];
    for (const raw of data.hotels) {
      if (!raw || typeof raw !== "object" || Array.isArray(raw)) continue;
      const e = raw as Record<string, unknown>;
      const item: HotelItem = {
        name: clampField(e.name, MAX_HOTEL_NAME_LEN),
        walk: clampField(e.walk, MAX_HOTEL_WALK_LEN),
      };
      if (item.name) cleaned.push(item);
      if (cleaned.length >= MAX_HOTEL_ITEMS) break;
    }
    out.hotels = cleaned;
  }

  // ── Guestbook wishes (groom-curated) ─────────────────────────────────────
  if (data.wishes !== undefined) {
    if (!Array.isArray(data.wishes)) {
      return { ok: false, error: "invalid_wishes", field: "wishes" };
    }
    const cleaned: WishItem[] = [];
    for (const raw of data.wishes) {
      if (!raw || typeof raw !== "object" || Array.isArray(raw)) continue;
      const e = raw as Record<string, unknown>;
      const item: WishItem = {
        who: clampField(e.who, MAX_WISH_WHO_LEN),
        what: clampField(e.what, MAX_WISH_WHAT_LEN),
      };
      if (item.what) cleaned.push(item);
      if (cleaned.length >= MAX_WISH_ITEMS) break;
    }
    out.wishes = cleaned;
  }

  // ── RSVP meal options ────────────────────────────────────────────────────
  if (data.mealOptions !== undefined) {
    if (!Array.isArray(data.mealOptions)) {
      return { ok: false, error: "invalid_meal_options", field: "mealOptions" };
    }
    const cleaned: string[] = [];
    for (const r of data.mealOptions) {
      if (typeof r !== "string") continue;
      const v = r.trim().slice(0, MAX_MEAL_OPTION_LEN);
      if (!v || cleaned.includes(v)) continue;
      cleaned.push(v);
      if (cleaned.length >= MAX_MEAL_OPTIONS) break;
    }
    out.mealOptions = cleaned;
  }

  // ── Per-photo captions keyed by storagePath ──────────────────────────────
  if (data.mediaCaptions !== undefined) {
    if (
      !data.mediaCaptions ||
      typeof data.mediaCaptions !== "object" ||
      Array.isArray(data.mediaCaptions)
    ) {
      return { ok: false, error: "invalid_media_captions", field: "mediaCaptions" };
    }
    const cleaned: Record<string, string> = {};
    let count = 0;
    for (const [k, val] of Object.entries(data.mediaCaptions as Record<string, unknown>)) {
      if (count >= MAX_CAPTION_ENTRIES) break;
      const cap = (typeof val === "string" ? val : "").trim().slice(0, MAX_CAPTION_LEN);
      if (cap) {
        cleaned[k.slice(0, 200)] = cap;
        count++;
      }
    }
    out.mediaCaptions = cleaned;
  }

  const boolKeys: (keyof MediaSettings)[] = [
    "storyEnabled",
    "eventsEnabled",
    "countdownEnabled",
    "galleryEnabled",
    "giftEnabled",
    "musicEnabled",
    "footerDockEnabled",
    "detailsEnabled",
    "venueEnabled",
    "guestbookEnabled",
    "envelopeEnabled",
    "rsvpCompanionsEnabled",
    "rsvpMealEnabled",
    "rsvpSongEnabled",
  ];
  for (const key of boolKeys) {
    if (data[key] !== undefined) {
      if (typeof data[key] !== "boolean") {
        return { ok: false, error: "invalid_toggle", field: key as string };
      }
      (out as Record<string, unknown>)[key] = data[key];
    }
  }
  return { ok: true, value: out };
}

/** Trim a possibly-non-string field to a max length. */
function clampField(v: unknown, max: number): string {
  return (typeof v === "string" ? v.trim() : "").slice(0, max);
}


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

function kindOf(contentType: string): "video" | "gif" | "image" {
  if (contentType.startsWith("video")) return "video";
  if (contentType === "image/gif") return "gif";
  return "image";
}

// ─── Multipart parsing ────────────────────────────────────────────────────────

interface ParsedMultipart {
  fields: Record<string, string>;
  file: {
    buffer: Buffer;
    contentType: string;
    filename: string;
    truncated: boolean;
  } | null;
}

/**
 * Parse a multipart upload buffered in memory, capped at `maxBytes`.
 * Promise resolves once busboy emits `finish` AND any file stream's `end`
 * has fired (busboy emits `finish` only after all parts are complete).
 *
 * Firebase Functions v2 onRequest consumes the request body up front and
 * exposes the raw bytes as `req.rawBody`. Piping `req` directly would
 * feed busboy zero bytes and produce an "Unexpected end of form" error
 * (surfaced to the client as `invalid_multipart`). When rawBody is
 * present we hand it to busboy via `bb.end(rawBody)`; otherwise (tests,
 * local dev) we fall back to piping the request stream.
 */
function parseMultipart(
  req: Request,
  maxBytes: number
): Promise<ParsedMultipart> {
  return new Promise((resolve, reject) => {
    const bb = busboy({
      headers: req.headers,
      limits: { files: 1, fileSize: maxBytes, fields: 16 },
    });
    const result: ParsedMultipart = { fields: {}, file: null };

    bb.on("field", (name, val) => {
      result.fields[name] = val.slice(0, 1024);
    });

    bb.on("file", (_name, stream, info) => {
      const chunks: Buffer[] = [];
      let truncated = false;
      stream.on("data", (chunk: Buffer) => chunks.push(chunk));
      stream.on("limit", () => {
        truncated = true;
      });
      stream.on("end", () => {
        result.file = {
          buffer: Buffer.concat(chunks),
          contentType: info.mimeType || "application/octet-stream",
          filename: info.filename ?? "upload.bin",
          truncated,
        };
      });
      stream.on("error", reject);
    });

    bb.on("error", reject);
    bb.on("finish", () => resolve(result));

    const rawBody = (req as Request & { rawBody?: Buffer }).rawBody;
    if (rawBody) {
      bb.end(rawBody);
    } else {
      req.pipe(bb);
    }
  });
}

function hasAllowedPrefix(contentType: string, prefixes: string[]): boolean {
  return prefixes.some((p) => contentType.startsWith(p));
}

function pickExtensionFromFilename(filename: string, fallback: string): string {
  const dot = filename.lastIndexOf(".");
  if (dot < 0) return fallback;
  const ext = filename.slice(dot + 1).toLowerCase();
  if (/^[a-z0-9]+$/.test(ext) && ext.length <= 8) return ext;
  return fallback;
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
  if (process.env.NODE_ENV === "production") return undefined;
  return errorMessage(err);
}
