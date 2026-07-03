// Send-tab domain — WhatsApp link helpers, per-guest invite links (manual +
// digital), the manual-send fallback payloads (failed sends surface the exact
// message for the admin to copy / open in WhatsApp), and the digital-guest
// subscription for the admin's currently selected groom. Extracted from
// usePortalState; behaviour branches on the admin settings passed in from
// usePortalAdminSettings.
import { useEffect, useState } from "react";
import { buildWaLink, toIntlPhone } from "../../utils/phone.js";
import { logErr } from "../../utils/logger.js";
import { localizeApiError } from "../../utils/apiError.js";
import { INVITE_BASE_URL, INVITE_TOKEN_TTL_MS, TIMING } from "../../config/index.js";
import {
  createGuestInvite, notifyDigitalGuest, markInviteManualSent,
} from "../../services/invites.js";
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
  //   other error       → manual-send fallback (bad number, Meta send error, …).
  // Failures carry `needsFallback: { phone, message, url }` so the caller can
  // surface the fallback modal; those branches deliberately show NO toast — the
  // modal is the feedback. Returns { ok } so the bulk loop can summarise.
  const handleWaSend = (send, { phone, message, url, silent }) => {
    if (send?.ok) {
      if (!silent) showToast(t("wa_sent_ok"));
      return { ok: true };
    }
    if (!send || send.error === "not_configured") {
      const waUrl = buildWaLink(phone, message, url);
      // Popup blockers make window.open return null; a missing waUrl means the
      // phone couldn't be parsed. Both used to fail silently → fallback modal.
      const opened = waUrl ? window.open(waUrl, "_blank", "noopener") : null;
      if (opened) return { ok: true, fallback: true };
      return {
        ok: false,
        error: waUrl ? "popup_blocked" : "invalid_phone",
        needsFallback: { phone, message, url },
      };
    }
    return { ok: false, error: send.error, needsFallback: { phone, message, url } };
  };

  // Promote handleWaSend's `needsFallback` into the full payload the fallback
  // modal consumes (`res.fallback`). No-op for successes and for early-exit
  // failures (no token / prechecks), which keep their toasts instead.
  const withFallback = (res, { guest, type, groomUid }) => {
    if (!res?.needsFallback) return res;
    const { needsFallback, ...rest } = res;
    return {
      ...rest,
      fallback: {
        guestId: guest.id, name: guest.name, phone: needsFallback.phone,
        message: needsFallback.message, url: needsFallback.url,
        error: res.error, type, groomUid,
      },
    };
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

  // ── Invite URL builders (shared by the senders + prepareResendFallback) ────
  // Physical: /invite/{token} on the invite domain.
  const buildPhysicalInviteUrl = (token) => {
    const baseUrl = (INVITE_BASE_URL || "").replace(/\/+$/, "")
                 || window.location.origin;
    return `${baseUrl}/invite/${token}`;
  };
  // Digital via sendInviteLink's adminMode branch — honours the admin-configured
  // digital base URL and tolerates a guest without a groomUsername.
  const buildAdminDigitalInviteUrl = (groomUsername, token) => {
    const base = (adminDigitalBaseUrl || "").trim().replace(/\/+$/, "")
              || `${window.location.origin}/d`;
    return groomUsername ? `${base}/${groomUsername}/${token}` : `${base}/${token}`;
  };
  // Digital via sendDigitalInviteLink — /d/{groomUsername}/{token} on the invite domain.
  const buildDigitalInviteUrl = (groomUsername, token) => {
    const baseUrl = (INVITE_BASE_URL || "").replace(/\/+$/, "")
                 || window.location.origin;
    return `${baseUrl}/d/${groomUsername}/${token}`;
  };

  // Per-guest invite link — now auto-sends server-side over the WhatsApp Cloud
  // API instead of opening a wa.me tab. Behaviour branches on adminMode:
  //   - manual:   mints /invite/{token}, sends with adminMessageBody
  //   - digital:  mints a digital token, sends with adminDigitalMessage
  // `opts.silent` suppresses per-send toasts (used by the bulk loop, which shows
  // one aggregate toast instead). Returns { ok } for the caller to tally, plus
  // `fallback` (the manual-send modal payload) when the WhatsApp leg failed.
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
        const url = buildAdminDigitalInviteUrl(guest.groomUsername || "", token);
        const res = handleWaSend(send, { phone: guest.phone, message, url, silent: opts.silent });
        return withFallback(res, { guest, type: "digital", groomUid: guest.groomUid });
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
      const url = buildPhysicalInviteUrl(token);
      const res = handleWaSend(send, { phone: guest.phone, message, url, silent: opts.silent });
      return withFallback(res, { guest, type: "physical", groomUid: guest.groomUid });
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
        const res = handleWaSend(send, { phone: guest.phone, message, url: "", silent: opts.silent });
        return withFallback(res, { guest, type: "digital", groomUid });
      }
      const { token, send } = await createDigitalGuestInvite({
        groomUid,
        guestId: guest.id,
        deliver: "whatsapp",
        messageBody: message,
      });
      if (!token) { if (!opts.silent) showToast(t("send_failed")); return { ok: false }; }
      const url = buildDigitalInviteUrl(adminSelectedGroom, token);
      const res = handleWaSend(send, { phone: guest.phone, message, url, silent: opts.silent });
      return withFallback(res, { guest, type: "digital", groomUid });
    } catch (e) {
      // The server returns { error: "design_not_approved" } when the groom
      // hasn't gotten an admin to approve their design yet.
      return handleSendError(e, "sendDigitalInviteLink", opts.silent);
    }
  };

  // Rebuild the manual-send payload for a guest whose last send FAILED (the
  // clickable ⚠ pill) — no message is sent here. Reuses the guest's existing
  // token while it's still fresh; otherwise re-mints via the create endpoint
  // WITHOUT `deliver` (mint only). The message comes from the CURRENT admin
  // state, exactly like the row's send button would build it.
  //   opts: { digital, groomUid, customMessage, noDesign }
  // Returns the same shape the senders attach as `res.fallback`, or null when
  // the re-mint failed (handleSendError already toasted).
  const prepareResendFallback = async (guest, opts = {}) => {
    const groomUid = opts.groomUid || guest?.groomUid;
    if (!guest?.id || !groomUid) { showToast(t("send_failed")); return null; }
    // Keyed off the row's SECTION, not adminMode: an RTDB (physical) guest only
    // ever carries a physical token and a Firestore digital guest only a digital
    // one, so section = store = token type. (In digital adminMode a physical
    // row's send button would just 404 on the digital mint — nothing to mirror.)
    const digital = !!opts.digital;
    const message = digital
      ? ((opts.customMessage || "").trim() || (adminDigitalMessage || "").trim())
      : (adminMessageBody || "").trim();
    const payload = {
      guestId: guest.id, name: guest.name, phone: guest.phone,
      message, type: digital ? "digital" : "physical", groomUid,
      error: guest.inviteWaError || "send_failed",
    };
    // "بدون تصميم" sends carry no link — nothing to mint.
    if (digital && opts.noDesign) return { ...payload, url: "" };
    try {
      // A token is reusable while unexpired (90d TTL, stamped at send time).
      const fresh = guest.inviteLinkToken && guest.inviteLinkSentAt
        && guest.inviteLinkSentAt + INVITE_TOKEN_TTL_MS > Date.now();
      let token = fresh ? guest.inviteLinkToken : null;
      if (!token) {
        const minted = digital
          ? await createDigitalGuestInvite({ groomUid, guestId: guest.id })
          : await createGuestInvite({ groomUid, guestId: guest.id });
        token = minted?.token;
      }
      if (!token) { showToast(t("send_failed")); return null; }
      // Digital-section tokens are only ever minted via sendDigitalInviteLink
      // (or the re-mint above), so they always use its /d/ URL shape.
      const url = digital
        ? buildDigitalInviteUrl(adminSelectedGroom, token)
        : buildPhysicalInviteUrl(token);
      return { ...payload, url };
    } catch (e) {
      handleSendError(e, "prepareResendFallback");
      return null;
    }
  };

  // Stamp `inviteWaStatus: "manual"` once the admin actually opened WhatsApp
  // from the fallback modal. Fire-and-forget — the guest pollers refresh the pill.
  const markManualSent = (fallback) => {
    if (!fallback?.groomUid || !fallback?.guestId) return;
    markInviteManualSent({
      type: fallback.type, groomUid: fallback.groomUid, guestId: fallback.guestId,
    }).catch((e) => logErr("markInviteManualSent", e));
  };

  return {
    adminSelectedGroom, setAdminSelectedGroom,
    digitalGuestsForSelectedGroom,
    sendWaToOne, sendWaToAll,
    sendInviteLink, sendDigitalInviteLink,
    prepareResendFallback, markManualSent,
  };
}
