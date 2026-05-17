// Bottom-sheet style modal shown when a guest pin is tapped on the
// driver / groom map. Surfaces nav-app deep links and (driver only) a
// mark-delivered form that mirrors the list view's optional photo + note.
import { useState } from "react";
import { telLink } from "../utils/phone.js";
import {
  wazeLinkCoords, googleMapsLinkCoords, appleMapsLinkCoords,
} from "../utils/geo.js";
import { C } from "../styles/theme.js";

const STATUS_BADGE = {
  pending:   { color: C.blue,    bg: "rgba(75,159,212,.15)",  label: "tab_dashboard" },
  enroute:   { color: "#f0c84c", bg: "rgba(240,200,76,.15)",  label: "stat_enroute" },
  delivered: { color: "#4cc97a", bg: "rgba(76,201,122,.15)",  label: "driver_delivered_badge" },
};

export function GuestMapModal({ guest, t, onClose, onMarkDelivered }) {
  const [photoData, setPhotoData] = useState(null);
  const [photoTaken, setPhotoTaken] = useState(false);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [showDeliver, setShowDeliver] = useState(false);

  if (!guest) return null;

  const badge = STATUS_BADGE[guest.status] || STATUS_BADGE.pending;
  const canDeliver = typeof onMarkDelivered === "function" && guest.status !== "delivered";
  const open = (url) => window.open(url, "_blank", "noopener");

  const submit = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const ok = await onMarkDelivered(guest.id, { photoData, photoTaken, deliveryNote: note });
      if (ok !== false) onClose();
    } finally {
      setBusy(false);
    }
  };

  return (
    <div onClick={onClose} style={{
      position: "fixed", inset: 0, background: "rgba(0,0,0,.78)",
      display: "flex", alignItems: "flex-end", justifyContent: "center",
      zIndex: 1000, animation: "fadeIn .2s ease",
    }}>
      <div onClick={e => e.stopPropagation()} style={{
        maxWidth: 480, width: "100%",
        background: "#0c0c11", border: "1px solid rgba(201,168,76,.3)",
        borderTopLeftRadius: 18, borderTopRightRadius: 18, padding: 22,
        maxHeight: "92vh", overflowY: "auto",
        animation: "slideUp .25s ease",
      }}>
        {/* Header */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 14, gap: 10 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
              <span style={{
                fontSize: 10, padding: "3px 9px", borderRadius: 20,
                background: badge.bg, color: badge.color, fontWeight: 700,
              }}>{t(badge.label)}</span>
              {guest.inviteType === "vip" && (
                <span style={{
                  fontSize: 10, padding: "3px 9px", borderRadius: 20,
                  background: "rgba(201,168,76,.18)", color: C.gold, fontWeight: 700,
                }}>♛ VIP</span>
              )}
            </div>
            <div style={{ fontWeight: 900, color: C.goldLight, fontSize: 18, marginBottom: 2 }}>{guest.name}</div>
            <div style={{ fontSize: 12, color: C.dim, direction: "ltr", textAlign: "right" }}>📞 {guest.phone}</div>
            {guest.area && (
              <div style={{ fontSize: 12, color: C.dim, marginTop: 2 }}>📍 {guest.area}</div>
            )}
          </div>
          <button onClick={onClose} style={{
            background: "none", border: "none", color: C.dim, fontSize: 24,
            cursor: "pointer", padding: 0, lineHeight: 1,
          }}>×</button>
        </div>

        {/* Navigation app picker */}
        <div style={{ fontSize: 11, color: C.dim, fontWeight: 700, marginBottom: 8 }}>
          {t("map_open_in")}
        </div>
        <div style={{ display: "flex", gap: 6, marginBottom: 14 }}>
          <button onClick={() => open(wazeLinkCoords(guest.lat, guest.lng))} style={navBtnStyle("#00b4dc")}>
            🗺 Waze
          </button>
          <button onClick={() => open(googleMapsLinkCoords(guest.lat, guest.lng))} style={navBtnStyle("#4cc97a")}>
            🗺 Google
          </button>
          <button onClick={() => open(appleMapsLinkCoords(guest.lat, guest.lng))} style={navBtnStyle("#c9a84c")}>
            🗺 Apple
          </button>
        </div>

        {/* Call button */}
        <a href={telLink(guest.phone)} style={{
          display: "block", textDecoration: "none",
          padding: "11px 0", borderRadius: 10, textAlign: "center",
          background: "rgba(76,201,122,.12)", border: "1px solid rgba(76,201,122,.35)",
          color: "#4cc97a", fontSize: 13, fontWeight: 800, marginBottom: 14,
        }}>📞 {t("driver_call")}</a>

        {/* Mark delivered (driver only) */}
        {canDeliver && !showDeliver && (
          <button onClick={() => setShowDeliver(true)} style={{
            width: "100%", padding: 12, borderRadius: 10, border: "none",
            background: "linear-gradient(135deg,#4cc97a,#2da85a)",
            color: "#000", fontWeight: 900, fontSize: 14, fontFamily: "inherit",
            cursor: "pointer",
          }}>{t("driver_deliver_btn")}</button>
        )}

        {canDeliver && showDeliver && (
          <div style={{
            padding: 14, background: "rgba(76,201,122,.04)",
            border: "1px solid rgba(76,201,122,.18)", borderRadius: 12,
          }}>
            <div style={{ fontSize: 12, color: "#4cc97a", fontWeight: 700, marginBottom: 12 }}>
              {t("driver_complete_form")}
            </div>

            <div style={{ marginBottom: 6, fontSize: 12, color: C.dim }}>
              {t("driver_photo_label")} <span style={{ color: "#5a5040", fontWeight: 400 }}>{t("driver_photo_optional")}</span>
            </div>
            <label style={{
              display: "block",
              border: `2px dashed ${photoTaken ? "rgba(76,201,122,.5)" : "rgba(76,201,122,.25)"}`,
              borderRadius: 10, padding: "14px 0", textAlign: "center",
              marginBottom: 12, cursor: "pointer",
              background: photoTaken ? "rgba(76,201,122,.08)" : "rgba(76,201,122,.02)",
            }}>
              <input type="file" accept="image/*" capture="environment"
                     style={{ display: "none" }}
                     onChange={e => {
                       const file = e.target.files?.[0];
                       if (!file) { setPhotoTaken(false); setPhotoData(null); return; }
                       const reader = new FileReader();
                       reader.onloadend = () => {
                         setPhotoTaken(true);
                         setPhotoData(typeof reader.result === "string" ? reader.result : null);
                       };
                       reader.readAsDataURL(file);
                     }}/>
              {photoTaken && photoData ? (
                <>
                  <img src={photoData} alt="proof"
                       style={{ maxWidth: 110, maxHeight: 110, borderRadius: 8, objectFit: "cover", marginBottom: 6 }}/>
                  <div style={{ fontSize: 12, color: "#4cc97a", fontWeight: 700 }}>{t("driver_photo_done")}</div>
                </>
              ) : (
                <>
                  <div style={{ fontSize: 28, marginBottom: 4 }}>📷</div>
                  <div style={{ fontSize: 12, color: "#5a7a5a" }}>{t("driver_photo_hint")}</div>
                </>
              )}
            </label>

            <div style={{ marginBottom: 6, fontSize: 12, color: C.dim }}>{t("driver_note_label")}</div>
            <input className="input-field" type="text"
                   placeholder={t("driver_note_placeholder")}
                   value={note} onChange={e => setNote(e.target.value)}
                   style={{ marginBottom: 12, fontSize: 13 }}/>

            <div style={{ display: "flex", gap: 8 }}>
              <button onClick={() => setShowDeliver(false)} disabled={busy} style={{
                flex: 1, padding: "10px 0", borderRadius: 10, cursor: "pointer",
                background: "rgba(255,255,255,.03)", border: "1px solid rgba(255,255,255,.1)",
                color: C.dim, fontSize: 13, fontWeight: 700, fontFamily: "inherit",
              }}>{t("driver_cancel")}</button>
              <button onClick={submit} disabled={busy} style={{
                flex: 2, padding: 12, borderRadius: 10, border: "none",
                background: "linear-gradient(135deg,#4cc97a,#2da85a)",
                color: "#000", fontWeight: 900, fontSize: 14, fontFamily: "inherit",
                cursor: busy ? "wait" : "pointer",
              }}>{t("driver_confirm")}</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

const navBtnStyle = (accent) => ({
  flex: 1, padding: "10px 0", borderRadius: 10, cursor: "pointer",
  background: `${accent}20`, border: `1px solid ${accent}55`,
  color: accent, fontSize: 12, fontWeight: 800, fontFamily: "inherit",
});
