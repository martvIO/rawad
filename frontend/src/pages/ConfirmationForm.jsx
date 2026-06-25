// Public guest confirmation form, opened via /confirm/<groomUsername>.
// Submission goes through the `submitConfirmation` Cloud Function, which
// validates the input and rate-limits per IP. Guests can optionally attach
// their GPS location so drivers and grooms see them on the map view; the
// city/street/house fields remain available as the manual fallback.
import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { BrandLogo } from "../components/BrandLogo.jsx";
import { LangSwitcher } from "../components/LangSwitcher.jsx";
import { CityField } from "../components/CityField.jsx";
import { PhoneInput } from "../components/PhoneInput.jsx";
import { CompanionsStepper } from "../components/CompanionsStepper.jsx";
import { submitConfirmation } from "../services/confirmations.js";
import { getPublicEventState } from "../services/lifecycle.js";
import { getCurrentFix } from "../utils/geo.js";
import { logErr } from "../utils/logger.js";
import { localizeApiError } from "../utils/apiError.js";
import { ConsentNotice } from "../components/ConsentNotice.jsx";
import { EventUnavailableNotice } from "../components/EventUnavailableNotice.jsx";
import { Icon } from "../components/icons/Icon.jsx";
import { C } from "../styles/theme.js";

export function ConfirmationForm({ t, lang, setLang }) {
  const { groomUsername } = useParams();
  // Wedding availability: undefined = loading, otherwise { available, state, pausedNewDate }.
  // On any error we fail-open (treat as available) so a status hiccup never blocks RSVP.
  const [eventState, setEventState] = useState(undefined);
  useEffect(() => {
    let active = true;
    getPublicEventState((groomUsername || "").toLowerCase())
      .then((r) => { if (active) setEventState(r || { available: true, state: "active" }); })
      .catch(() => { if (active) setEventState({ available: true, state: "active" }); });
    return () => { active = false; };
  }, [groomUsername]);
  const [name, setName]     = useState("");
  const [phone, setPhone]   = useState("");
  const [city, setCity]     = useState("");
  const [street, setStreet] = useState("");
  const [house, setHouse]   = useState("");
  const [partySize, setPartySize] = useState(1); // total headcount including the invited guest
  const [coords, setCoords] = useState(null);   // { lat, lng, accuracy }
  const [locating, setLocating] = useState(false);
  const [locError, setLocError] = useState("");
  const [done, setDone]     = useState(false);
  const [error, setError]   = useState("");
  const [busy, setBusy]     = useState(false);

  const shareLocation = async () => {
    setLocError(""); setLocating(true);
    try {
      const fix = await getCurrentFix(t);
      setCoords(fix);
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
        groomUsername:   (groomUsername || "").toLowerCase(),
        submittedName:   name.trim(),
        submittedPhone:  phone.trim().replace(/\s+/g, ""),
        submittedCity:   city.trim(),
        submittedStreet: street.trim(),
        submittedHouse:  house.trim(),
        companions: Math.max(0, partySize - 1),
      };
      if (coords) {
        payload.lat = coords.lat;
        payload.lng = coords.lng;
        if (typeof coords.accuracy === "number") payload.locationAccuracy = coords.accuracy;
      }
      await submitConfirmation(payload);
      setDone(true);
    } catch (err) {
      logErr("submitConfirmation", err);
      setError(localizeApiError(err, t, t("conf_form_invalid")));
    } finally {
      setBusy(false);
    }
  };

  // While availability is loading, show a minimal placeholder so the form
  // doesn't flash before a possible cancelled/postponed notice replaces it.
  if (eventState === undefined) {
    return (
      <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
        <div style={{ color: C.dim, fontSize: 14 }}>…</div>
      </div>
    );
  }
  if (eventState && eventState.available === false) {
    return <EventUnavailableNotice state={eventState.state} t={t} lang={lang} pausedNewDate={eventState.pausedNewDate} />;
  }

  if (done) {
    return (
      <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
        <div role="status" aria-live="polite" style={{ maxWidth: 460, width: "100%", textAlign: "center" }}>
          <div style={{ fontSize: 64, marginBottom: 16 }} aria-hidden>🎉</div>
          <h1 data-testid="conf-thanks-title" style={{ fontFamily: "'Amiri','Frank Ruhl Libre',serif", color: "#4cc97a", fontSize: 28, marginBottom: 12 }}>
            {t("conf_form_thanks_title")}
          </h1>
          <p style={{ color: "rgba(245,230,184,.8)", fontSize: 14, lineHeight: 1.9 }}>
            {t("conf_form_thanks_body")}
          </p>
        </div>
      </div>
    );
  }

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
          <h1 style={{ fontFamily: "'Amiri','Frank Ruhl Libre',serif", color: C.gold, fontSize: 26, marginBottom: 10 }}>
            {t("conf_form_welcome_title")}
          </h1>
          <p style={{ color: "rgba(245,230,184,.78)", fontSize: 13, lineHeight: 1.9, maxWidth: 400, margin: "0 auto" }}>
            {t("conf_form_welcome_body")}
          </p>
        </div>

        <div className="gold-card">
          <label htmlFor="conf-name" style={{ display: "block", marginBottom: 6, fontSize: 12, color: C.goldDim }}>{t("conf_form_full_name")} *</label>
          <input id="conf-name" data-testid="field-conf-name" className="input-field" type="text" placeholder={t("example_name")}
                 autoComplete="name"
                 value={name} onChange={e => setName(e.target.value)}
                 style={{ marginBottom: 14 }}/>

          <label htmlFor="conf-phone" style={{ display: "block", marginBottom: 6, fontSize: 12, color: C.goldDim }}>{t("conf_form_phone")} *</label>
          <div style={{ marginBottom: 14 }}>
            <PhoneInput value={phone} onChange={setPhone} t={t} lang={lang} inputId="conf-phone" />
          </div>

          {/* Share-location block. Optional — guests who decline still submit
              normally and drivers fall back to the typed address. */}
          {coords ? (
            <div style={{
              marginBottom: 14, padding: "10px 12px", borderRadius: 10,
              background: "rgba(76,201,122,.08)", border: "1px solid rgba(76,201,122,.3)",
              display: "flex", alignItems: "center", gap: 10,
            }}>
              <div style={{ display: "flex", color: "#4cc97a" }}><Icon name="pin" size={18} /></div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 12, fontWeight: 800, color: "#4cc97a" }}>
                  {t("conf_form_location_attached")}
                </div>
                <div style={{ fontSize: 10, color: C.dim, direction: "ltr", textAlign: "left" }}>
                  ±{coords.accuracy} {t("geo_meters")}
                </div>
              </div>
              <button onClick={() => setCoords(null)} style={{
                background: "none", border: "1px solid rgba(212,80,58,.3)",
                color: C.red, padding: "5px 10px", borderRadius: 6,
                fontSize: 11, fontWeight: 700, cursor: "pointer", fontFamily: "inherit",
              }}>{t("conf_form_remove_location")}</button>
            </div>
          ) : (
            <button onClick={shareLocation} disabled={locating} style={{
              width: "100%", marginBottom: 14, padding: "10px 0", borderRadius: 10,
              background: "rgba(75,159,212,.08)", border: "1px solid rgba(75,159,212,.32)",
              color: C.blue, fontSize: 13, fontWeight: 800, fontFamily: "inherit",
              cursor: locating ? "wait" : "pointer",
            }}>
              {locating ? t("geo_requesting") : t("conf_form_share_location")}
            </button>
          )}
          {locError && (
            <div style={{ fontSize: 11, color: C.red, marginBottom: 12, lineHeight: 1.6, display: "flex", alignItems: "center", gap: 6 }}><Icon name="warning" size={13} /> {locError}</div>
          )}

          <label htmlFor="conf-city" style={{ display: "block", marginBottom: 6, fontSize: 12, color: C.goldDim }}>{t("conf_form_city")} *</label>
          <div style={{ marginBottom: 14 }}>
            <CityField value={city} onChange={setCity} lang={lang} t={t} inputId="conf-city"/>
          </div>

          <label htmlFor="conf-street" style={{ display: "block", marginBottom: 6, fontSize: 12, color: C.goldDim }}>{t("conf_form_street")}</label>
          <input id="conf-street" data-testid="field-conf-street" className="input-field" type="text"
                 autoComplete="address-line1"
                 value={street} onChange={e => setStreet(e.target.value)}
                 style={{ marginBottom: 14 }}/>

          <label htmlFor="conf-house" style={{ display: "block", marginBottom: 6, fontSize: 12, color: C.goldDim }}>{t("conf_form_house_number")}</label>
          <input id="conf-house" data-testid="field-conf-house" className="input-field" type="text" placeholder="86"
                 value={house} onChange={e => setHouse(e.target.value)}
                 style={{ marginBottom: 14, direction: "ltr", textAlign: "right" }}/>

          <div id="conf-companions-label" style={{ marginBottom: 6, fontSize: 12, color: C.goldDim }}>{t("conf_form_companions")}</div>
          <div role="group" aria-labelledby="conf-companions-label">
            <CompanionsStepper value={partySize} onChange={setPartySize} />
          </div>

          {error && (
            <div data-testid="alert-conf-error" role="alert" aria-live="assertive" style={{ color: C.red, fontSize: 12, marginBottom: 12, textAlign: "center" }}>{error}</div>
          )}

          <button data-testid="btn-conf-submit" className="gold-btn" style={{ width: "100%" }} onClick={submit}
                  disabled={busy || !name.trim() || !phone.trim() || !city.trim()}>
            {t("conf_form_submit")}
          </button>
          <ConsentNotice lang={lang} />
        </div>
      </div>
    </div>
  );
}
