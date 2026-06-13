// Send-tab domain — WhatsApp link helpers, per-guest invite links (manual +
// digital), and the digital-guest subscription for the admin's currently
// selected groom. Extracted from usePortalState; behaviour branches on the
// admin settings passed in from usePortalAdminSettings.
import { useEffect, useState } from "react";
import { buildWaLink, toIntlPhone } from "../../utils/phone.js";
import { logErr } from "../../utils/logger.js";
import { localizeApiError } from "../../utils/apiError.js";
import { INVITE_BASE_URL, TIMING } from "../../config/index.js";
import { createGuestInvite } from "../../services/invites.js";
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

  // Per-guest invite link. Behaviour branches on adminMode:
  //   - manual:   mints the existing /invite/{token} link + adminMessageBody
  //   - digital:  mints a token via createDigitalGuestInvite + uses the
  //               adminDigitalBaseUrl + adminDigitalMessage, with the guest's
  //               groomUsername + token appended so the public landing page
  //               can personalise the displayed guest name.
  const sendInviteLink = async (guest) => {
    if (!guest?.groomUid || !guest?.id) { showToast(t("send_failed")); return; }
    if (!toIntlPhone(guest.phone)) { showToast(t("send_invalid_phone")); return; }
    try {
      if (adminMode === "digital") {
        const { token } = await createDigitalGuestInvite({
          groomUid: guest.groomUid,
          guestId:  guest.id,
        });
        if (!token) { showToast(t("send_failed")); return; }
        const base = (adminDigitalBaseUrl || "").trim().replace(/\/+$/, "")
                  || `${window.location.origin}/d`;
        const groomUsername = guest.groomUsername || "";
        const url  = groomUsername ? `${base}/${groomUsername}/${token}` : `${base}/${token}`;
        const waUrl = buildWaLink(guest.phone, (adminDigitalMessage || "").trim(), url);
        if (waUrl) window.open(waUrl, "_blank", "noopener");
        return;
      }

      // Manual mode — existing physical-invite flow.
      const { token } = await createGuestInvite({
        groomUid: guest.groomUid,
        guestId:  guest.id,
      });
      if (!token) { showToast(t("send_failed")); return; }
      const baseUrl = (INVITE_BASE_URL || "").replace(/\/+$/, "")
                   || window.location.origin;
      const url = `${baseUrl}/invite/${token}`;
      const waUrl = buildWaLink(guest.phone, (adminMessageBody || "").trim(), url);
      if (waUrl) window.open(waUrl, "_blank", "noopener");
    } catch (e) {
      logErr("sendInviteLink", e);
      const apiError = e?.body?.error || "";
      if (apiError === "design_not_approved" || /design_not_approved/.test(e?.message || "")) {
        showToast(lang === "he"
          ? "העיצוב טרם אושר"
          : "لم يتم اعتماد تصميم الدعوة بعد");
        return;
      }
      showToast(localizeApiError(e, t, t("send_failed")));
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
    if (!groomUid || !guest?.id) { showToast(t("send_failed")); return; }
    if (!toIntlPhone(guest.phone)) { showToast(t("send_invalid_phone")); return; }
    const message = (customMessage || "").trim() || (adminDigitalMessage || "").trim();
    try {
      // "بدون تصميم" — open WhatsApp with the message and NO link.
      if (opts.noDesign) {
        const waUrl = buildWaLink(guest.phone, message, "");
        if (waUrl) window.open(waUrl, "_blank", "noopener");
        return;
      }
      const { token } = await createDigitalGuestInvite({
        groomUid,
        guestId: guest.id,
      });
      if (!token) { showToast(t("send_failed")); return; }
      const baseUrl = (INVITE_BASE_URL || "").replace(/\/+$/, "")
                   || window.location.origin;
      const url = `${baseUrl}/d/${adminSelectedGroom}/${token}`;
      const waUrl = buildWaLink(guest.phone, message, url);
      if (waUrl) window.open(waUrl, "_blank", "noopener");
    } catch (e) {
      logErr("sendDigitalInviteLink", e);
      // The server returns { error: "design_not_approved" } when the groom
      // hasn't gotten an admin to approve their design yet. ApiError carries
      // the parsed body and stamps the message as `api_design_not_approved`.
      const apiError = e?.body?.error || "";
      if (apiError === "design_not_approved" || /design_not_approved/.test(e?.message || "")) {
        showToast(lang === "he"
          ? "העיצוב טרם אושר"
          : "لم يتم اعتماد تصميم الدعوة بعد");
        return;
      }
      showToast(localizeApiError(e, t, t("send_failed")));
    }
  };

  return {
    adminSelectedGroom, setAdminSelectedGroom,
    digitalGuestsForSelectedGroom,
    sendWaToOne, sendWaToAll,
    sendInviteLink, sendDigitalInviteLink,
  };
}
