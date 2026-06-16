"use strict";
// Invite-token format constants. The 16-byte random + hex-encoded length of 32
// chars is intentionally short enough to fit in a WhatsApp URL but wide enough
// (128 bits of entropy) to be unguessable.
Object.defineProperty(exports, "__esModule", { value: true });
exports.TOKEN_TTL_MS = exports.TOKEN_HEX_RE = exports.TOKEN_BYTES = void 0;
const time_1 = require("./time");
Object.defineProperty(exports, "TOKEN_TTL_MS", { enumerable: true, get: function () { return time_1.TOKEN_TTL_MS; } });
/** Number of random bytes used per token. */
exports.TOKEN_BYTES = 16;
/** Regex matching the hex encoding of a TOKEN_BYTES-byte token. */
exports.TOKEN_HEX_RE = /^[a-f0-9]{32}$/;
//# sourceMappingURL=tokens.js.map