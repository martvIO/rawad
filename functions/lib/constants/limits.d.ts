/** Maximum string lengths for user-supplied / admin-supplied free-form fields. */
export declare const MAX_LEN: Readonly<{
    /** Display name, guest name, submitted name, bride name. */
    NAME: 120;
    /** E.164 phone with formatting characters. */
    PHONE: 30;
    /** City name. */
    CITY: 80;
    /** Street name. */
    STREET: 120;
    /** House number / building identifier. */
    HOUSE: 20;
    /** Area string, delivery note (free text up to a couple of sentences). */
    AREA: 240;
    /** Guest note for the digital invitation flow. */
    NOTE: 500;
    /** Storage path strings. */
    PATH: 240;
    /** Username (matches the regex in helpers.ts). */
    USERNAME: 60;
    /** Username for the groom embedded in invite payloads. */
    GROOM_USERNAME: 60;
    /** Free-form rank label on digital guests. */
    GUEST_RANK: 60;
}>;
/** Maximum file sizes (bytes) accepted by the upload routes. */
export declare const MAX_BYTES: Readonly<{
    PROOF: number;
    INVITE_MEDIA: number;
    PHOTOGRAPHER: number;
    MOCKUP: number;
}>;
