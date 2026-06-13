// Admin settings (RTDB-backed, subscribed) — message body, form link, mode,
// digital base URL + message. Extracted from usePortalState; the setters write
// through to /settings and surface failures via the shared toast.
import { useEffect, useState } from "react";
import { subscribeSettings, saveSettings } from "../../services/adminSettings.js";
import { localizeApiError } from "../../utils/apiError.js";

// Contact-channel keys managed by the admin Communication settings section.
// String values + a matching boolean *Enabled toggle each.
const CONTACT_KEYS = [
  "contactWhatsapp", "contactPhone", "contactEmail",
  "socialFacebook", "socialInstagram", "socialTiktok",
  "contactWhatsappEnabled", "contactPhoneEnabled", "contactEmailEnabled",
  "socialFacebookEnabled", "socialInstagramEnabled", "socialTiktokEnabled",
];

export function usePortalAdminSettings({ authed, showToast, t }) {
  const [adminMessageBody,    setAdminMessageBodyState]    = useState("");
  const [adminFormLink,       setAdminFormLinkState]       = useState("");
  const [adminMode,           setAdminModeState]           = useState("manual"); // "manual" | "digital"
  const [adminDigitalBaseUrl, setAdminDigitalBaseUrlState] = useState("");
  const [adminDigitalMessage, setAdminDigitalMessageState] = useState("");
  // Communication channels (phone / WhatsApp / email / socials + enable flags).
  const [contact, setContactState] = useState({});
  useEffect(() => {
    if (!authed) return;
    return subscribeSettings((s) => {
      setAdminMessageBodyState   (s.messageBody    ?? "");
      setAdminFormLinkState      (s.formLink       ?? "");
      setAdminModeState          (s.mode           === "digital" ? "digital" : "manual");
      setAdminDigitalBaseUrlState(s.digitalBaseUrl ?? "");
      setAdminDigitalMessageState(s.digitalMessage ?? "");
      const next = {};
      for (const k of CONTACT_KEYS) if (s[k] !== undefined) next[k] = s[k];
      setContactState(next);
    });
  }, [authed]);
  // Optimistic per-field setter for any contact channel (string or boolean).
  const setContactField = (key, value) => {
    setContactState((prev) => ({ ...prev, [key]: value }));
    saveSettings({ [key]: value }).catch((e) => showToast(localizeApiError(e, t)));
  };
  const setAdminMessageBody = (v) => {
    setAdminMessageBodyState(v);
    saveSettings({ messageBody: v }).catch((e) => showToast(localizeApiError(e, t)));
  };
  const setAdminFormLink = (v) => {
    setAdminFormLinkState(v);
    saveSettings({ formLink: v }).catch((e) => showToast(localizeApiError(e, t)));
  };
  const setAdminMode = (v) => {
    const mode = v === "digital" ? "digital" : "manual";
    setAdminModeState(mode);
    saveSettings({ mode }).catch((e) => showToast(localizeApiError(e, t)));
  };
  const setAdminDigitalBaseUrl = (v) => {
    setAdminDigitalBaseUrlState(v);
    saveSettings({ digitalBaseUrl: v }).catch((e) => showToast(localizeApiError(e, t)));
  };
  const setAdminDigitalMessage = (v) => {
    setAdminDigitalMessageState(v);
    saveSettings({ digitalMessage: v }).catch((e) => showToast(localizeApiError(e, t)));
  };

  return {
    adminMessageBody, setAdminMessageBody,
    adminFormLink, setAdminFormLink,
    adminMode, setAdminMode,
    adminDigitalBaseUrl, setAdminDigitalBaseUrl,
    adminDigitalMessage, setAdminDigitalMessage,
    contact, setContactField,
  };
}
