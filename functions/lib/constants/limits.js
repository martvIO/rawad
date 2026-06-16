"use strict";
// Field-length caps and file-size limits shared by callables and Express routes.
//
// These mirror the limits encoded in `storage.rules` (file sizes) and the
// validate-string-length checks scattered across confirmations.ts, invite.ts,
// digitalInvite.ts, and the api/routes/* files. When tightening or loosening
// a limit, also update storage.rules to keep the two layers in sync.
Object.defineProperty(exports, "__esModule", { value: true });
exports.MAX_BYTES = exports.MAX_LEN = void 0;
/** Maximum string lengths for user-supplied / admin-supplied free-form fields. */
exports.MAX_LEN = Object.freeze({
    /** Display name, guest name, submitted name, bride name. */
    NAME: 120,
    /** E.164 phone with formatting characters. */
    PHONE: 30,
    /** City name. */
    CITY: 80,
    /** Street name. */
    STREET: 120,
    /** House number / building identifier. */
    HOUSE: 20,
    /** Area string, delivery note (free text up to a couple of sentences). */
    AREA: 240,
    /** Guest note for the digital invitation flow. */
    NOTE: 500,
    /** Storage path strings. */
    PATH: 240,
    /** Username (matches the regex in helpers.ts). */
    USERNAME: 60,
    /** Username for the groom embedded in invite payloads. */
    GROOM_USERNAME: 60,
    /** Free-form rank label on digital guests. */
    GUEST_RANK: 60,
});
/** Maximum file sizes (bytes) accepted by the upload routes. */
exports.MAX_BYTES = Object.freeze({
    PROOF: 6 * 1024 * 1024, //   6 MB — delivery-proof photo
    INVITE_MEDIA: 50 * 1024 * 1024, //  50 MB — digital-invite background
    PHOTOGRAPHER: 200 * 1024 * 1024, // 200 MB — photographer files
    MOCKUP: 50 * 1024 * 1024, //  50 MB — design-request mockup
});
//# sourceMappingURL=limits.js.map