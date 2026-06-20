// Scheduled RSVP reminders (audit Phase 4b).
//
// A daily Cloud Scheduler job nudges digital-invite guests who haven't answered
// when their wedding is LEAD_DAYS away. Sends via the WhatsApp Cloud API
// (Phase 4a) — a complete no-op until WhatsApp is configured, so deploying this
// is safe before credentials exist. Each guest is reminded at most once
// (reminderSentAt is stamped only on a successful send).
//
// Data model: digitalInvitations/{uid}.defaultDesignId → designs/{id}.weddingDate;
// guests live in digitalInvitations/{uid}/guests with status pending|attending|absent.
import { onSchedule } from "firebase-functions/v2/scheduler";
import { getFirestore } from "firebase-admin/firestore";
import { isWhatsAppConfigured, sendWhatsAppText } from "./whatsapp";
import { DAY_MS } from "./constants/time";

/** Days before the wedding to send the reminder. */
export const REMINDER_LEAD_DAYS = 7;

// ─── Pure helpers (unit-tested) ─────────────────────────────────────────────────

export function daysUntil(weddingMs: number, nowMs: number): number {
  return Math.floor((weddingMs - nowMs) / DAY_MS);
}

/** A wedding is due for a reminder when it is exactly `leadDays` away (the daily
 *  run catches that day once). Guards against missing/invalid dates. */
export function dueForReminder(
  weddingMs: number | null | undefined,
  nowMs: number,
  leadDays: number,
): boolean {
  if (typeof weddingMs !== "number" || !Number.isFinite(weddingMs)) return false;
  return daysUntil(weddingMs, nowMs) === leadDays;
}

/** A guest needs a reminder if they're still pending, have a phone, and haven't
 *  already been reminded. */
export function guestNeedsReminder(g: {
  status?: string;
  phone?: unknown;
  reminderSentAt?: unknown;
}): boolean {
  return (
    g?.status === "pending" &&
    typeof g?.phone === "string" &&
    g.phone.trim().length > 0 &&
    !g?.reminderSentAt
  );
}

/** Build the reminder body in the guest's language (Arabic by default), with an
 *  optional first-name personalization. The guest's `locale` is stamped when
 *  they open the digital invite (see /invites/digital/opened); absent that, we
 *  fall back to Arabic — the prior behaviour. */
export function reminderText(locale: unknown, name?: unknown): string {
  const lang = locale === "he" ? "he" : "ar";
  const first = typeof name === "string" ? name.trim().split(/\s+/)[0] : "";
  if (lang === "he") {
    const hi = first ? `${first}, ` : "";
    return `${hi}תזכורת ידידותית 💛 נשמח לאשר את הגעתכם לאירוע שמתקרב — אנא אשרו את ההשתתפות. תודה!`;
  }
  const hi = first ? `${first}، ` : "";
  return `${hi}تذكير ودّي 💛 يسعدنا أن نؤكّد حضوركم لمناسبتنا التي تقترب — نرجو تأكيد الحضور. شكراً لكم.`;
}

// ─── Scheduled function ─────────────────────────────────────────────────────────

export const sendRsvpReminders = onSchedule(
  { schedule: "0 9 * * *", timeZone: "Asia/Jerusalem", region: "us-central1" },
  async () => {
    if (!isWhatsAppConfigured()) {
      console.log("[reminders] WhatsApp not configured — skipping run");
      return;
    }
    const db = getFirestore();
    const now = Date.now();
    let sent = 0;
    let considered = 0;

    const invitations = await db.collection("digitalInvitations").get();
    for (const inv of invitations.docs) {
      const parent = inv.data() as { defaultDesignId?: string };
      const designId = parent.defaultDesignId;
      if (!designId) continue;

      const designSnap = await inv.ref.collection("designs").doc(designId).get();
      const weddingMs = (designSnap.data() as { weddingDate?: number } | undefined)?.weddingDate;
      if (!dueForReminder(weddingMs, now, REMINDER_LEAD_DAYS)) continue;

      const guests = await inv.ref.collection("guests").where("status", "==", "pending").get();
      for (const g of guests.docs) {
        const gd = g.data() as { phone?: string; reminderSentAt?: unknown; name?: string; locale?: string };
        if (!guestNeedsReminder(gd)) continue;
        considered++;
        const text = reminderText(gd.locale, gd.name);
        const r = await sendWhatsAppText(gd.phone as string, text);
        if (r.ok) {
          await g.ref.update({ reminderSentAt: now });
          sent++;
        } else {
          console.warn(`[reminders] send failed for guest ${g.id}: ${r.error}`);
        }
      }
    }
    console.log(`[reminders] run complete — considered ${considered}, sent ${sent}`);
  },
);
