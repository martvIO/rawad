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

import { Router } from "express";
import { registerGuestsRoutes } from "./guests.routes";
import { registerWishesRoutes } from "./wishes.routes";
import { registerMediaRoutes } from "./media.routes";
import { registerDesignsRoutes } from "./designs.routes";
import { registerPhotographerRoutes } from "./photographer.routes";
import { registerWorkflowRoutes } from "./workflow.routes";
import { registerPublicRoutes } from "./public.routes";
import { registerPhotoShareRoutes } from "./photoShare.routes";

export const digitalRouter = Router();

// Registration order mirrors the original single-file section order.
registerGuestsRoutes(digitalRouter);
registerWishesRoutes(digitalRouter);
registerMediaRoutes(digitalRouter);
registerDesignsRoutes(digitalRouter);
registerPhotographerRoutes(digitalRouter);
registerWorkflowRoutes(digitalRouter);
registerPublicRoutes(digitalRouter);
registerPhotoShareRoutes(digitalRouter);
