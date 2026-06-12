// Admin settings (RTDB-backed, subscribed) — message body, form link, mode,
// digital base URL + message. Extracted from usePortalState; the setters write
// through to /settings and surface failures via the shared toast.
import { useEffect, useState } from "react";
import { subscribeSettings, saveSettings } from "../../services/adminSettings.js";

export function usePortalAdminSettings({ authed, showToast }) {
  const [adminMessageBody,    setAdminMessageBodyState]    = useState("");
  const [adminFormLink,       setAdminFormLinkState]       = useState("");
  const [adminMode,           setAdminModeState]           = useState("manual"); // "manual" | "digital"
  const [adminDigitalBaseUrl, setAdminDigitalBaseUrlState] = useState("");
  const [adminDigitalMessage, setAdminDigitalMessageState] = useState("");
  useEffect(() => {
    if (!authed) return;
    return subscribeSettings((s) => {
      setAdminMessageBodyState   (s.messageBody    ?? "");
      setAdminFormLinkState      (s.formLink       ?? "");
      setAdminModeState          (s.mode           === "digital" ? "digital" : "manual");
      setAdminDigitalBaseUrlState(s.digitalBaseUrl ?? "");
      setAdminDigitalMessageState(s.digitalMessage ?? "");
    });
  }, [authed]);
  const setAdminMessageBody = (v) => {
    setAdminMessageBodyState(v);
    saveSettings({ messageBody: v }).catch((e) => showToast(e?.message || ""));
  };
  const setAdminFormLink = (v) => {
    setAdminFormLinkState(v);
    saveSettings({ formLink: v }).catch((e) => showToast(e?.message || ""));
  };
  const setAdminMode = (v) => {
    const mode = v === "digital" ? "digital" : "manual";
    setAdminModeState(mode);
    saveSettings({ mode }).catch((e) => showToast(e?.message || ""));
  };
  const setAdminDigitalBaseUrl = (v) => {
    setAdminDigitalBaseUrlState(v);
    saveSettings({ digitalBaseUrl: v }).catch((e) => showToast(e?.message || ""));
  };
  const setAdminDigitalMessage = (v) => {
    setAdminDigitalMessageState(v);
    saveSettings({ digitalMessage: v }).catch((e) => showToast(e?.message || ""));
  };

  return {
    adminMessageBody, setAdminMessageBody,
    adminFormLink, setAdminFormLink,
    adminMode, setAdminMode,
    adminDigitalBaseUrl, setAdminDigitalBaseUrl,
    adminDigitalMessage, setAdminDigitalMessage,
  };
}
