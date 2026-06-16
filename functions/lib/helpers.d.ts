import { CallableRequest } from "firebase-functions/v2/https";
export interface DawaClaims {
    role?: "admin" | "driver" | "groom";
    username?: string;
    assignedGrooms?: Record<string, true>;
}
export declare function getClaims(req: CallableRequest): DawaClaims;
export declare function assertAdmin(req: CallableRequest): string;
export declare function isUsername(v: unknown): v is string;
export declare function isE164(v: unknown): v is string;
export declare function isRole(v: unknown): v is "groom" | "driver" | "admin";
export declare function isFiniteInRange(v: unknown, min: number, max: number): v is number;
export declare function normalisePhoneForMatching(raw: string): string;
export declare function isStrongPassword(v: unknown): v is string;
export declare function normalisePhone(raw: string): string | null;
export declare function phoneIndexKey(e164: string): string;
export declare function syntheticEmail(username: string): string;
