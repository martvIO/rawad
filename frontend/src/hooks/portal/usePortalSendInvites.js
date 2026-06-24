// Send-tab domain — WhatsApp link helpers, per-guest invite links (manual +
// digital), and the digital-guest subscription for the admin's currently
// selected groom. Extracted from usePortalState; behaviour branches on the
// admin settings passed in from usePortalAdminSettings.
import { useEffect, useState } from "react";
import { buildWaLink, toIntlPhone } from "../../utils/phone.js";
import { logErr } from "../../utils/logger.js";
import { localizeApiError } from "../../utils/apiError.js";
import { INVITE_BASE_URL, TIMING } from "../../config/index.js";
import { createGuestInvite, notifyDigitalGuest } from "../../services/invites.js";
import {
  subscribeDigitalGuests, createDigitalGuestInvite,
} from "../../services/digitalInvitation.js";

export function usePortalSendInvites({
  isAdmin, users, adminUsers, guests,
  adminMessageBody, adminFormLink, adminMode,
  adminDigitalBaseUrl, adminDigitalMessage,
  t, lang, showToast,
}) {
  const [adminSelectedGroom, setAdminSelectedGroom] = useState(null);

  // Digital guests for the admin's currently-selected groom. Subscribed only
  // while an admin is viewing that groom — empties otherwise.
  const [digitalGuestsForSelectedGroom, setDigitalGuestsForSelectedGroom] = useState([]);

  // Admin Send tab — digital guests for the currently-selected groom. Only
  // subscribed while admin is viewing a specific groom; we resolve the uid
  // from the username via the users list.
  useEffect(() => {
    if (!isAdmin || !adminSelectedGroom) { setDigitalGuestsForSelectedGroom([]); return; }
    const groom = users.find(u => u.username === adminSelectedGroom);
    const groomUid = groom?.uid || groom?.id;
    if (!groomUid) { setDigitalGuestsForSelectedGroom([]); return; }
    return subscribeDigitalGuests(groomUid, setDigitalGuestsForSelectedGroom);
  }, [isAdmin, adminSelectedGroom, users]);

  // ── WhatsApp link helpers ───────────────────────────────────────────────────
  const waLinkFor = (phone) =>
    buildWaLink(phone, (adminMessageBody || "").trim(), (adminFormLink || "").trim()) || "";
  const sendWaToOne = (phone) => {
    const url = waLinkFor(phone);
    if (!url) { showToast(t("send_failed")); return; }
    window.open(url, "_blank", "noopener");
  };
  const sendWaToAll = (groomUsername) => {
    if (!adminFormLink.trim()) { showToast(t("admin_form_link")); return; }
    const groomUid = adminUsers.find(u => u.username === groomUsername)?.uid;
    const groomGuests = guests.filter(g => g.groomUid === groomUid);
    if (groomGuests.length === 0) return;
    showToast(t("admin_bulk_warn"));
    groomGuests.forEach((g, i) => {
      const url = waLinkFor(g.phone);
      if (url) setTimeout(() => window.open(url, "_blank", "noopener"), i * TIMING.WA_STAGGER_MS);
    });
  };

  // Handle the server's auto-send result for a freshly-minted invite.
  //   ok                → success toast (the message went out from the business
  //                       number — no tab opened, which is the whole point).
  //   not_configured    → WhatsApp isn't wired to Meta yet → preserve the old
  //                       behaviour and open a wa.me tab so nothing breaks during
  //                       rollout. Once credentials are set this branch never runs.
  //   other error       → failure toast (bad number, Meta send error, …).
  // Returns { ok } so the bulk "send to all" loop can summarise.
  const handleWaSend = (send, { phone, message, url, silent }) => {
    if (send?.ok) {
      if (!silent) showToast(t("wa_sent_ok"));
      return { ok: true };
    }
    if (!send || send.error === "not_configured") {
      const waUrl = buildWaLink(phone, message, url);
      if (waUrl) window.open(waUrl, "_blank", "noopener");
      return { ok: true, fallback: true };
    }
    if (!silent) showToast(t("wa_send_failed"));
    return { ok: false, error: send.error };
  };

  const handleSendError = (e, where, silent) => {
    logErr(where, e);
    const apiError = e?.body?.error || "";
    if (apiError === "design_not_approved" || /design_not_approved/.test(e?.message || "")) {
      if (!silent) showToast(lang === "he" ? "העיצוב טרם אושר" : "لم يتم اعتماد تصميم الدعوة بعد");
      return { ok: false, error: "design_not_approved" };
    }
    if (!silent) showToast(localizeApiError(e, t, t("send_failed")));
    return { ok: false, error: apiError || "error" };
  };

  // Per-guest invite link — now auto-sends server-side over the WhatsApp Cloud
  // API instead of opening a wa.me tab. Behaviour branches on adminMode:
  //   - manual:   mints /invite/{token}, sends with adminMessageBody
  //   - digital:  mints a digital token, sends with adminDigitalMessage
  // `opts.silent` suppresses per-send toasts (used by the bulk loop, which shows
  // one aggregate toast instead). Returns { ok } for the caller to tally.
  const sendInviteLink = async (guest, opts = {}) => {
    if (!guest?.groomUid || !guest?.id) { if (!opts.silent) showToast(t("send_failed")); return { ok: false }; }
    if (!toIntlPhone(guest.phone)) { if (!opts.silent) showToast(t("send_invalid_phone")); return { ok: false }; }
    try {
      if (adminMode === "digital") {
        const message = (adminDigitalMessage || "").trim();
        const { token, send } = await createDigitalGuestInvite({
          groomUid: guest.groomUid,
          guestId:  guest.id,
          deliver: "whatsapp",
          messageBody: message,
        });
        if (!token) { if (!opts.silent) showToast(t("send_failed")); return { ok: false }; }
        const base = (adminDigitalBaseUrl || "").trim().replace(/\/+$/, "")
                  || `${window.location.origin}/d`;
        const groomUsername = guest.groomUsername || "";
        const url  = groomUsername ? `${base}/${groomUsername}/${token}` : `${base}/${token}`;
        return handleWaSend(send, { phone: guest.phone, message, url, silent: opts.silent });
      }

      // Manual mode — physical-invite flow.
      const message = (adminMessageBody || "").trim();
      const { token, send } = await createGuestInvite({
        groomUid: guest.groomUid,
        guestId:  guest.id,
        deliver: "whatsapp",
        messageBody: message,
      });
      if (!token) { if (!opts.silent) showToast(t("send_failed")); return { ok: false }; }
      const baseUrl = (INVITE_BASE_URL || "").replace(/\/+$/, "")
                   || window.location.origin;
      const url = `${baseUrl}/invite/${token}`;
      return handleWaSend(send, { phone: guest.phone, message, url, silent: opts.silent });
    } catch (e) {
      return handleSendError(e, "sendInviteLink", opts.silent);
    }
  };

  // Per-guest DIGITAL invite link. Mirrors sendInviteLink but uses the
  // digital token Cloud Function and routes through /invite/digital/{token}.
  // Only the admin's Send tab calls this — grooms can no longer self-send.
  //
  // `customMessage` is the admin's per-groom Send-tab message (already
  // personalised with the guest name); it wins over the saved digital-settings
  // message so an empty box never sends a blank invite. `opts.noDesign` is the
  // "بدون تصميم" option — send the message ONLY, with no invitation link.
  const sendDigitalInviteLink = async (guest, groomUid, customMessage, opts = {}) => {
    if (!groomUid || !guest?.id) { if (!opts.silent) showToast(t("send_failed")); return { ok: false }; }
    if (!toIntlPhone(guest.phone)) { if (!opts.silent) showToast(t("send_invalid_phone")); return { ok: false }; }
    const message = (customMessage || "").trim() || (adminDigitalMessage || "").trim();
    try {
      // "بدون تصميم" — send the message with NO link (free-form text, server-side).
      if (opts.noDesign) {
        const { send } = await notifyDigitalGuest({ groomUid, guestId: guest.id, message });
        return handleWaSend(send, { phone: guest.phone, message, url: "", silent: opts.silent });
      }
      const { token, send } = await createDigitalGuestInvite({
        groomUid,
        guestId: guest.id,
        deliver: "whatsapp",
        messageBody: message,
      });
      if (!token) { if (!opts.silent) showToast(t("send_failed")); return { ok: false }; }
      const baseUrl = (INVITE_BASE_URL || "").replace(/\/+$/, "")
                   || window.location.origin;
      const url = `${baseUrl}/d/${adminSelectedGroom}/${token}`;
      return handleWaSend(send, { phone: guest.phone, message, url, silent: opts.silent });
    } catch (e) {
      // The server returns { error: "design_not_approved" } when the groom
      // hasn't gotten an admin to approve their design yet.
      return handleSendError(e, "sendDigitalInviteLink", opts.silent);
    }
  };

  return {
    adminSelectedGroom, setAdminSelectedGroom,
    digitalGuestsForSelectedGroom,
    sendWaToOne, sendWaToAll,
    sendInviteLink, sendDigitalInviteLink,
  };
}
