// Invite-token format constants. The 16-byte random + hex-encoded length of 32
// chars is intentionally short enough to fit in a WhatsApp URL but wide enough
// (128 bits of entropy) to be unguessable.

import { TOKEN_TTL_MS } from "./time";

/** Number of random bytes used per token. */
export const TOKEN_BYTES = 16;

/** Regex matching the hex encoding of a TOKEN_BYTES-byte token. */
export const TOKEN_HEX_RE = /^[a-f0-9]{32}$/;

/** Re-exported for ergonomic imports from a single namespace. */
export { TOKEN_TTL_MS };
