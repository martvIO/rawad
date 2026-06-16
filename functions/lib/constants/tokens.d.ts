import { TOKEN_TTL_MS } from "./time";
/** Number of random bytes used per token. */
export declare const TOKEN_BYTES = 16;
/** Regex matching the hex encoding of a TOKEN_BYTES-byte token. */
export declare const TOKEN_HEX_RE: RegExp;
/** Re-exported for ergonomic imports from a single namespace. */
export { TOKEN_TTL_MS };
