export declare const RATE: Readonly<{
    /** Guest confirmation form — anonymous public endpoint. */
    CONFIRM_PER_IP: Readonly<{
        limit: number;
        windowMs: number;
    }>;
    /** Phone-OTP password reset (per phone number). */
    RESET_PER_PHONE: Readonly<{
        limit: number;
        windowMs: number;
    }>;
    /** Admin actions against the user CRUD endpoints. */
    CREATE_USER_PER_ADMIN: Readonly<{
        limit: number;
        windowMs: number;
    }>;
    DELETE_USER_PER_ADMIN: Readonly<{
        limit: number;
        windowMs: number;
    }>;
    SET_PASSWORD_PER_ADMIN: Readonly<{
        limit: number;
        windowMs: number;
    }>;
    ATTACH_LOC_PER_ADMIN: Readonly<{
        limit: number;
        windowMs: number;
    }>;
    UPDATE_USER_PER_ADMIN: Readonly<{
        limit: number;
        windowMs: number;
    }>;
    /** Invite-mint per caller (groom/admin). */
    CREATE_INVITE_PER_USER: Readonly<{
        limit: number;
        windowMs: number;
    }>;
    /** Guest invite submission — anonymous public endpoint. */
    SUBMIT_INVITE_PER_IP: Readonly<{
        limit: number;
        windowMs: number;
    }>;
    /** Digital-invite mint per caller (groom/admin). */
    CREATE_DIGITAL_INVITE_PER_USER: Readonly<{
        limit: number;
        windowMs: number;
    }>;
    /** Digital-invite submission — anonymous public endpoint. */
    SUBMIT_DIGITAL_INVITE_PER_IP: Readonly<{
        limit: number;
        windowMs: number;
    }>;
}>;
