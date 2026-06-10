// Per-guest invite form, opened from a WhatsApp link of the shape
// /invite/:token. Differs from /confirm/:groomUsername in three ways:
//   1. Pre-fills the guest's name + phone from the token record.
//   2. Adds a draggable Leaflet map picker beside the GPS button.
//   3. Adds a free-text "note for the driver" field, persisted to the guest's
//      deliveryNote.
//
// On submit the data is written straight onto /guestsByGroom/{groomUid}/{guestId}
// (no admin "attach" step), and the token is marked used so re-opening the
// same link shows the "already used" screen.
import { useEffect, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import { BrandLogo } from "../components/BrandLogo.jsx";
import { LangSwitcher } from "../components/LangSwitcher.jsx";
import { CityField } from "../components/CityField.jsx";
import { PhoneInput } from "../components/PhoneInput.jsx";
import { MapPickerInline } from "../components/MapPickerInline.jsx";
import { CompanionsStepper } from "../components/CompanionsStepper.jsx";
import { subscribeInviteToken, submitGuestInvite } from "../services/invites.js";
import { getCurrentFix } from "../utils/geo.js";
import { logErr } from "../utils/logger.js";
import { C } from "../styles/theme.js";

export function InviteForm({ t, lang, setLang }) {
  const { token } = useParams();
  const [tokenRec, setTokenRec] = useState(undefined); // undefined=loading, null=missing
  const [name,   setName]   = useState("");
  const [phone,  setPhone]  = useState("");
  const [city,   setCity]   = useState("");
  const [street, setStreet] = useState("");
  const [house,  setHouse]  = useState("");
  const [note,   setNote]   = useState("");
  const [partySize, setPartySize] = useState(1); // total headcount including the invited guest
  const [coords, setCoords] = useState(null); // { lat, lng, accuracy?, source }
  const [showMap, setShowMap] = useState(false);
  const [locating, setLocating] = useState(false);
  const [locError, setLocError] = useState("");
  const [done, setDone] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  // Pre-fill name + phone from the token ONCE. subscribeInviteToken polls, so it
  // re-fires repeatedly; the previous `if (!name)` check used a stale closure
  // (name was always "" from the first render) and re-set the fields on every
  // poll — wiping whatever the guest typed, so they could never change their
  // name/phone. The ref guard pre-fills a single time and then leaves the
  // fields fully editable.
  const prefilled = useRef(false);
  useEffect(() => {
    if (!token) { setTokenRec(null); return; }
    const unsub = subscribeInviteToken(token, (rec) => {
      setTokenRec(rec);
      if (rec && !prefilled.current) {
        setName(rec.guestName || "");
        setPhone(rec.guestPhone || "");
        prefilled.current = true;
      }
    });
    return () => unsub();
  }, [token]);

  const shareLocation = async () => {
    setLocError(""); setLocating(true);
    try {
      const fix = await getCurrentFix(t);
      setCoords({ ...fix, source: "gps" });
    } catch (err) {
      setLocError(err?.message || t("geo_denied"));
    } finally {
      setLocating(false);
    }
  };

  const submit = async () => {
    if (!name.trim() || !phone.trim() || !city.trim()) {
      setError(t("conf_form_invalid"));
      return;
    }
    setError("");
    setBusy(true);
    try {
      const payload = {
        token,
        submittedName:   name.trim(),
        submittedPhone:  phone.trim().replace(/\s+/g, ""),
        submittedCity:   city.trim(),
        submittedStreet: street.trim(),
        submittedHouse:  house.trim(),
        deliveryNote:    note.trim(),
        companions: Math.max(0, partySize - 1),
      };
      if (coords) {
        payload.lat = coords.lat;
        payload.lng = coords.lng;
        payload.locationSource = coords.source || "manual";
        if (typeof coords.accuracy === "number") payload.locationAccuracy = coords.accuracy;
      }
      await submitGuestInvite(payload);
      setDone(true);
    } catch (err) {
      logErr("submitGuestInvite", err);
      const code = err?.code || "";
      if (code.includes("deadline-exceeded")) setError(t("invite_expired"));
      else if (code.includes("not-found"))    setError(t("invite_invalid"));
      else setError(err?.message || t("conf_form_invalid"));
    } finally {
      setBusy(false);
    }
  };

  // ── Loading / error states ────────────────────────────────────────────────
  if (tokenRec === undefined) {
    return (
      <CenteredMessage>
        <div style={{ color: C.dim, fontSize: 14 }}>...</div>
      </CenteredMessage>
    );
  }
  if (tokenRec === null) {
    return (
      <CenteredMessage>
        <div style={{ fontSize: 56, marginBottom: 12 }}>⚠️</div>
        <h1 data-testid="conf-invalid-title" style={{ fontFamily: "'Amiri',serif", color: C.red, fontSize: 24, marginBottom: 8 }}>
          {t("invite_invalid")}
        </h1>
      </CenteredMessage>
    );
  }
  if (tokenRec.expiresAt && Date.now() > tokenRec.expiresAt) {
    return (
      <CenteredMessage>
        <div style={{ fontSize: 56, marginBottom: 12 }}>⏰</div>
        <h1 data-testid="conf-expired-title" style={{ fontFamily: "'Amiri',serif", color: C.red, fontSize: 24, marginBottom: 8 }}>
          {t("invite_expired")}
        </h1>
      </CenteredMessage>
    );
  }
  if (tokenRec.usedAt && !done) {
    return (
      <CenteredMessage>
        <div style={{ fontSize: 56, marginBottom: 12 }}>✅</div>
        <h1 data-testid="conf-used-title" style={{ fontFamily: "'Amiri',serif", color: "#4cc97a", fontSize: 24, marginBottom: 8 }}>
          {t("invite_used")}
        </h1>
      </CenteredMessage>
    );
  }
  if (done) {
    return (
      <CenteredMessage>
        <div style={{ fontSize: 64, marginBottom: 16 }}>🎉</div>
        <h1 data-testid="conf-thanks-title" style={{ fontFamily: "'Amiri',serif", color: "#4cc97a", fontSize: 28, marginBottom: 12 }}>
          {t("invite_done_title")}
        </h1>
        <p style={{ color: "rgba(245,230,184,.8)", fontSize: 14, lineHeight: 1.9 }}>
          {t("invite_done_body")}
        </p>
      </CenteredMessage>
    );
  }

  // ── Form ──────────────────────────────────────────────────────────────────
  return (
    <div style={{ minHeight: "100vh", padding: "24px 16px" }}>
      <div style={{ maxWidth: 480, margin: "0 auto" }}>
        <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 12 }}>
          <LangSwitcher lang={lang} setLang={setLang}/>
        </div>

        <div style={{ textAlign: "center", marginBottom: 24 }}>
          <div style={{ display: "flex", justifyContent: "center", marginBottom: 14 }}>
            <BrandLogo size={68} />
          </div>
          <h1 style={{ fontFamily: "'Amiri',serif", color: C.gold, fontSize: 26, marginBottom: 10 }}>
            {t("invite_title")}
          </h1>
          <p style={{ color: "rgba(245,230,184,.78)", fontSize: 13, lineHeight: 1.9, maxWidth: 400, margin: "0 auto" }}>
            {t("conf_form_welcome_body")}
          </p>
        </div>

        <div className="gold-card">
          <div style={{ marginBottom: 6, fontSize: 12, color: C.goldDim }}>{t("conf_form_full_name")} *</div>
          <input data-testid="field-conf-name" className="input-field" type="text" placeholder={t("example_name")}
                 value={name} onChange={e => setName(e.target.value)}
                 style={{ marginBottom: 14 }}/>

          <div style={{ marginBottom: 6, fontSize: 12, color: C.goldDim }}>{t("conf_form_phone")} *</div>
          <div style={{ marginBottom: 14 }}>
            <PhoneInput value={phone} onChange={setPhone} t={t} lang={lang} />
          </div>

          {/* Location section: GPS button + map picker. Both feed the same
              `coords` slot, so picking one replaces the other. */}
          {coords ? (
            <div style={{
              marginBottom: 14, padding: "10px 12px", borderRadius: 10,
              background: "rgba(76,201,122,.08)", border: "1px solid rgba(76,201,122,.3)",
              display: "flex", alignItems: "center", gap: 10,
            }}>
              <div style={{ fontSize: 18 }}>📍</div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 12, fontWeight: 800, color: "#4cc97a" }}>
                  {t("conf_form_location_attached")}
                </div>
                {typeof coords.accuracy === "number" && (
                  <div style={{ fontSize: 10, color: C.dim, direction: "ltr", textAlign: "left" }}>
                    ±{coords.accuracy} {t("geo_meters")}
                  </div>
                )}
              </div>
              <button onClick={() => { setCoords(null); setShowMap(false); }} style={{
                background: "none", border: "1px solid rgba(212,80,58,.3)",
                color: C.red, padding: "5px 10px", borderRadius: 6,
                fontSize: 11, fontWeight: 700, cursor: "pointer", fontFamily: "inherit",
              }}>{t("conf_form_remove_location")}</button>
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 14 }}>
              <button onClick={shareLocation} disabled={locating} style={locBtnStyle(locating)}>
                {locating ? t("geo_requesting") : t("conf_form_share_location")}
              </button>
              <button onClick={() => setShowMap(s => !s)} style={mapBtnStyle(showMap)}>
                {showMap ? "✕ " + t("invite_pick_map") : "🗺 " + t("invite_pick_map")}
              </button>
            </div>
          )}
          {showMap && !coords && (
            <div style={{ marginBottom: 14 }}>
              <div style={{ fontSize: 11, color: C.dim, marginBottom: 8, lineHeight: 1.6 }}>
                {t("invite_map_hint")}
              </div>
              <MapPickerInline
                value={null}
                onPick={(p) => setCoords({ lat: p.lat, lng: p.lng, source: "manual" })}
                t={t}
              />
            </div>
          )}
          {locError && (
            <div style={{ fontSize: 11, color: C.red, marginBottom: 12, lineHeight: 1.6 }}>⚠ {locError}</div>
          )}

          <div style={{ marginBottom: 6, fontSize: 12, color: C.goldDim }}>{t("conf_form_city")} *</div>
          <div style={{ marginBottom: 14 }}>
            <CityField value={city} onChange={setCity} lang={lang} t={t}/>
          </div>

          <div style={{ marginBottom: 6, fontSize: 12, color: C.goldDim }}>{t("conf_form_street")}</div>
          <input data-testid="field-conf-street" className="input-field" type="text"
                 value={street} onChange={e => setStreet(e.target.value)}
                 style={{ marginBottom: 14 }}/>

          <div style={{ marginBottom: 6, fontSize: 12, color: C.goldDim }}>{t("conf_form_house_number")}</div>
          <input data-testid="field-conf-house" className="input-field" type="text" placeholder="86"
                 value={house} onChange={e => setHouse(e.target.value)}
                 style={{ marginBottom: 14, direction: "ltr", textAlign: "right" }}/>

          <div style={{ marginBottom: 6, fontSize: 12, color: C.goldDim }}>{t("invite_delivery_note")}</div>
          <textarea data-testid="field-conf-note" className="input-field" rows={3}
                 value={note} onChange={e => setNote(e.target.value.slice(0, 240))}
                 style={{ marginBottom: 14, resize: "vertical", minHeight: 64, fontFamily: "inherit" }}/>

          <div style={{ marginBottom: 6, fontSize: 12, color: C.goldDim }}>{t("conf_form_companions")}</div>
          <CompanionsStepper value={partySize} onChange={setPartySize} />

          {error && (
            <div data-testid="alert-conf-error" style={{ color: C.red, fontSize: 12, marginBottom: 12, textAlign: "center" }}>{error}</div>
          )}

          <button data-testid="btn-conf-submit" className="gold-btn" style={{ width: "100%" }} onClick={submit}
                  disabled={busy || !name.trim() || !phone.trim() || !city.trim()}>
            {busy ? "…" : t("invite_submit")}
          </button>
        </div>
      </div>
    </div>
  );
}

function CenteredMessage({ children }) {
  return (
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
      <div style={{ maxWidth: 460, width: "100%", textAlign: "center" }}>{children}</div>
    </div>
  );
}

const locBtnStyle = (locating) => ({
  width: "100%", padding: "10px 0", borderRadius: 10,
  background: "rgba(75,159,212,.08)", border: "1px solid rgba(75,159,212,.32)",
  color: C.blue, fontSize: 13, fontWeight: 800, fontFamily: "inherit",
  cursor: locating ? "wait" : "pointer",
});

const mapBtnStyle = (open) => ({
  width: "100%", padding: "10px 0", borderRadius: 10,
  background: open ? "rgba(201,168,76,.16)" : "rgba(201,168,76,.08)",
  border: "1px solid rgba(201,168,76,.32)",
  color: C.gold, fontSize: 13, fontWeight: 800, fontFamily: "inherit",
  cursor: "pointer",
});
