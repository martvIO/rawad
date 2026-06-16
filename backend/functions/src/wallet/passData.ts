// Shared loader for the wallet-pass endpoints (Apple .pkpass + Google save link
// + the monogram logo.png). Resolves a guest token → design + guest name +
// saved RSVP, enforcing the per-groom `canUseBoardingPass` flag and token
// validity. Mirrors the token/guest reads in invites.ts.
//
// Design source: the token's immutable `designSnapshot` (embedded when the
// invite was sent — the normal case for every digital invite). We deliberately
// do NOT fall back to the live approved design here: that read path runs a lazy
// migration TRANSACTION (ensureMigrated) which must never be triggered by an
// unauthenticated public request. A token without a snapshot degrades to a
// minimal pass (guest name + generic title) instead.
import { getDatabase } from "firebase-admin/database";
import { getFirestore } from "firebase-admin/firestore";
import { TOKEN_HEX_RE } from "../constants/tokens";
import { getThemeHex, ThemeHex } from "./themeHex";

type Lang = "ar" | "he";
type Localized = string | { ar?: string; he?: string } | null | undefined;

export interface PassContext {
  token: string;
  lang: Lang;
  design: Record<string, unknown>;
  guestName: string;
  statusKey: "attending" | "absent" | "pending";
  statusText: string;
  companions: number;
  headcount: number;
  weddingDate: number | null;
  theme: ThemeHex;
}

export type PassResult =
  | { ok: true; ctx: PassContext }
  | { ok: false; status: number; error: string };

interface TokenRec {
  groomUid?: string;
  guestId?: string;
  guestType?: string;
  guestName?: string;
  expiresAt?: number;
  designSnapshot?: Record<string, unknown>;
}

export function normaliseLang(raw: unknown): Lang {
  return raw === "he" ? "he" : "ar";
}

export function localize(v: Localized, lang: Lang): string {
  if (v == null) return "";
  if (typeof v === "string") return v;
  return (v[lang] || v.ar || v.he || "").toString();
}

const STATUS_TEXT: Record<PassContext["statusKey"], Record<Lang, string>> = {
  attending: { ar: "مؤكّد", he: "אישר" },
  absent: { ar: "معتذر", he: "לא מגיע" },
  pending: { ar: "لم يؤكّد بعد", he: "טרם אישר" },
};

/**
 * Resolve a guest token to everything a wallet pass needs, or an error code.
 * Order of checks mirrors the digital-submit handler: format → exists → type →
 * expiry → per-groom flag → design → saved RSVP.
 */
export async function loadPassContext(token: string, langRaw: unknown): Promise<PassResult> {
  const lang = normaliseLang(langRaw);
  if (!TOKEN_HEX_RE.test(token)) {
    return { ok: false, status: 400, error: "invalid_token_format" };
  }

  const db = getDatabase();
  const tokenSnap = await db.ref(`inviteTokens/${token}`).get();
  if (!tokenSnap.exists()) {
    return { ok: false, status: 404, error: "token_not_found" };
  }
  const tk = tokenSnap.val() as TokenRec;
  if (tk.guestType !== "digital") {
    return { ok: false, status: 409, error: "wrong_invite_type" };
  }
  if (typeof tk.expiresAt === "number" && Date.now() > tk.expiresAt) {
    return { ok: false, status: 410, error: "token_expired" };
  }
  if (!tk.groomUid) {
    return { ok: false, status: 404, error: "token_not_found" };
  }

  // Enforce the per-groom flag server-side (read live, default OFF).
  const flagSnap = await db.ref(`users/${tk.groomUid}/canUseBoardingPass`).get();
  if (flagSnap.val() !== true) {
    return { ok: false, status: 403, error: "boarding_pass_disabled" };
  }

  const design = (tk.designSnapshot && typeof tk.designSnapshot === "object")
    ? tk.designSnapshot
    : {};

  // Saved RSVP (status + companions) from the Firestore guest doc.
  let statusKey: PassContext["statusKey"] = "pending";
  let companions = 0;
  if (tk.guestId) {
    try {
      const guestSnap = await getFirestore()
        .doc(`digitalInvitations/${tk.groomUid}/guests/${tk.guestId}`)
        .get();
      const g = guestSnap.exists ? (guestSnap.data() as Record<string, unknown>) : null;
      const status = (g?.status ?? "").toString();
      if (status === "attending") {
        statusKey = "attending";
        const c = Number(g?.companions);
        companions = Number.isFinite(c) && c > 0 ? c : 0;
      } else if (status === "absent") {
        statusKey = "absent";
      }
    } catch {
      // Missing guest doc → treat as pending; pass is still mintable.
    }
  }

  const weddingDate = typeof design.weddingDate === "number" ? design.weddingDate : null;

  return {
    ok: true,
    ctx: {
      token,
      lang,
      design,
      guestName: (tk.guestName ?? "").toString(),
      statusKey,
      statusText: STATUS_TEXT[statusKey][lang],
      companions,
      headcount: 1 + companions,
      weddingDate,
      theme: getThemeHex(design.themeColor as string | undefined),
    },
  };
}
