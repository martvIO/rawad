"use strict";
// Per-action rate-limit policy. Each entry pairs a numeric per-hour cap
// with the window length (always `HOUR_MS` today, but kept explicit so a
// future per-action window change doesn't ripple through every call site).
//
// Consumers pass these to `allow(key, limit, windowMs)` from rateLimit.ts.
Object.defineProperty(exports, "__esModule", { value: true });
exports.RATE = void 0;
const time_1 = require("./time");
const perHour = (limit) => Object.freeze({ limit, windowMs: time_1.HOUR_MS });
exports.RATE = Object.freeze({
    /** Guest confirmation form — anonymous public endpoint. */
    CONFIRM_PER_IP: perHour(5),
    /** Phone-OTP password reset (per phone number). */
    RESET_PER_PHONE: perHour(5),
    /** Admin actions against the user CRUD endpoints. */
    CREATE_USER_PER_ADMIN: perHour(30),
    DELETE_USER_PER_ADMIN: perHour(30),
    SET_PASSWORD_PER_ADMIN: perHour(30),
    ATTACH_LOC_PER_ADMIN: perHour(30),
    UPDATE_USER_PER_ADMIN: perHour(60),
    /** Invite-mint per caller (groom/admin). */
    CREATE_INVITE_PER_USER: perHour(60),
    /** Guest invite submission — anonymous public endpoint. */
    SUBMIT_INVITE_PER_IP: perHour(5),
    /** Digital-invite mint per caller (groom/admin). */
    CREATE_DIGITAL_INVITE_PER_USER: perHour(60),
    /** Digital-invite submission — anonymous public endpoint. */
    SUBMIT_DIGITAL_INVITE_PER_IP: perHour(10),
});
//# sourceMappingURL=rateLimits.js.map