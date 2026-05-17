// Public guest confirmation form, opened via /confirm/<groomUsername>.
// Submission goes through the `submitConfirmation` Cloud Function, which
// validates the input and rate-limits per IP. Guests can optionally attach
// their GPS location so drivers and grooms see them on the map view; the
// city/street/house fields remain available as the manual fallback.
import { useState } from "react";
import { useParams } from "react-router-dom";
import { BrandLogo } from "../components/BrandLogo.jsx";
import { LangSwitcher } from "../components/LangSwitcher.jsx";
import { CityField } from "../components/CityField.jsx";
import { PhoneInput } from "../components/PhoneInput.jsx";
import { submitConfirmation } from "../services/confirmations.js";
import { getCurrentFix } from "../utils/geo.js";
import { logErr } from "../utils/logger.js";
import { C } from "../styles/theme.js";

export function ConfirmationForm({ t, lang, setLang }) {
  const { groomUsername } = useParams();
  const [name, setName]     = useState("");
  const [phone, setPhone]   = useState("");
  const [city, setCity]     = useState("");
  const [street, setStreet] = useState("");
  const [house, setHouse]   = useState("");
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
      setError(err?.message || t("conf_form_invalid"));
    } finally {
      setBusy(false);
    }
  };

  if (done) {
    return (
      <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
        <div style={{ maxWidth: 460, width: "100%", textAlign: "center" }}>
          <div style={{ fontSize: 64, marginBottom: 16 }}>🎉</div>
          <h1 style={{ fontFamily: "'Amiri',serif", color: "#4cc97a", fontSize: 28, marginBottom: 12 }}>
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
          <h1 style={{ fontFamily: "'Amiri',serif", color: C.gold, fontSize: 26, marginBottom: 10 }}>
            {t("conf_form_welcome_title")}
          </h1>
          <p style={{ color: "rgba(245,230,184,.78)", fontSize: 13, lineHeight: 1.9, maxWidth: 400, margin: "0 auto" }}>
            {t("conf_form_welcome_body")}
          </p>
        </div>

        <div className="gold-card">
          <div style={{ marginBottom: 6, fontSize: 12, color: C.goldDim }}>{t("conf_form_full_name")} *</div>
          <input className="input-field" type="text" placeholder={t("example_name")}
                 value={name} onChange={e => setName(e.target.value)}
                 style={{ marginBottom: 14 }}/>

          <div style={{ marginBottom: 6, fontSize: 12, color: C.goldDim }}>{t("conf_form_phone")} *</div>
          <div style={{ marginBottom: 14 }}>
            <PhoneInput value={phone} onChange={setPhone} t={t} lang={lang} />
          </div>

          {/* Share-location block. Optional — guests who decline still submit
              normally and drivers fall back to the typed address. */}
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
            <div style={{ fontSize: 11, color: C.red, marginBottom: 12, lineHeight: 1.6 }}>⚠ {locError}</div>
          )}

          <div style={{ marginBottom: 6, fontSize: 12, color: C.goldDim }}>{t("conf_form_city")} *</div>
          <div style={{ marginBottom: 14 }}>
            <CityField value={city} onChange={setCity} lang={lang} t={t}/>
          </div>

          <div style={{ marginBottom: 6, fontSize: 12, color: C.goldDim }}>{t("conf_form_street")}</div>
          <input className="input-field" type="text"
                 value={street} onChange={e => setStreet(e.target.value)}
                 style={{ marginBottom: 14 }}/>

          <div style={{ marginBottom: 6, fontSize: 12, color: C.goldDim }}>{t("conf_form_house_number")}</div>
          <input className="input-field" type="text" placeholder="86"
                 value={house} onChange={e => setHouse(e.target.value)}
                 style={{ marginBottom: 14, direction: "ltr", textAlign: "right" }}/>

          {error && (
            <div style={{ color: C.red, fontSize: 12, marginBottom: 12, textAlign: "center" }}>{error}</div>
          )}

          <button className="gold-btn" style={{ width: "100%" }} onClick={submit}
                  disabled={busy || !name.trim() || !phone.trim() || !city.trim()}>
            {t("conf_form_submit")}
          </button>
        </div>
      </div>
    </div>
  );
}
