type Localized = string | {
    ar?: string;
    he?: string;
} | undefined | null;
interface DesignLike {
    brideName?: Localized;
    groomDisplayName?: Localized;
    venue?: Localized;
    venueCity?: Localized;
    weddingDate?: number | null;
    themeColor?: string;
    media?: Array<{
        url?: string;
        kind?: string;
    }>;
    backgroundUrl?: string;
}
/**
 * Render the OG card to a JPEG buffer. Exported so the layout can be rendered
 * and inspected locally without deploying.
 *
 * @param design     the invite's design snapshot (couple/date/venue/photo)
 * @param guestName  the per-link guest name, drawn over the card so the
 *                   WhatsApp preview is personalised to whoever received it.
 */
export declare function renderOgImage(design: DesignLike | null, guestName?: string): Promise<Buffer>;
export declare const digitalOgImage: import("firebase-functions/v2/https").HttpsFunction;
export {};
