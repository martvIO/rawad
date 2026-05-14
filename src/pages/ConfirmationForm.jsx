// Public guest confirmation form, opened via ?form=<groomUsername>.
// Submissions are appended to the shared dawa_confirmations store.
import { useState } from "react";
import { BrandLogo } from "../components/BrandLogo.jsx";
import { LangSwitcher } from "../components/LangSwitcher.jsx";
import { CityField } from "../components/CityField.jsx";
import { load, save } from "../utils/storage.js";

export function ConfirmationForm({ groomUsername, t, lang, setLang }) {
  const [name, setName]     = useState("");
  const [phone, setPhone]   = useState("");
  const [city, setCity]     = useState("");
  const [street, setStreet] = useState("");
  const [house, setHouse]   = useState("");
  const [done, setDone]     = useState(false);
  const [error, setError]   = useState("");

  const submit = () => {
    if (!name.trim() || !phone.trim() || !city.trim()) {
      setError(t("conf_form_invalid"));
      return;
    }
    setError("");
    // Append this submission to the shared confirmations store.
    const existing = load("dawa_confirmations", []);
    const entry = {
      id: Date.now(),
      groomUsername: groomUsername || "",
      submittedName:   name.trim(),
      submittedPhone:  phone.trim().replace(/\s+/g, ""),
      submittedCity:   city.trim(),
      submittedStreet: street.trim(),
      submittedHouse:  house.trim(),
      confirmedAt:     new Date().toISOString(),
    };
    save("dawa_confirmations", [...existing, entry]);
    setDone(true);
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
          <h1 style={{ fontFamily: "'Amiri',serif", color: "#c9a84c", fontSize: 26, marginBottom: 10 }}>
            {t("conf_form_welcome_title")}
          </h1>
          <p style={{ color: "rgba(245,230,184,.78)", fontSize: 13, lineHeight: 1.9, maxWidth: 400, margin: "0 auto" }}>
            {t("conf_form_welcome_body")}
          </p>
        </div>

        <div className="gold-card">
          <div style={{ marginBottom: 6, fontSize: 12, color: "#a09070" }}>{t("conf_form_full_name")} *</div>
          <input className="input-field" type="text" placeholder={t("example_name")}
                 value={name} onChange={e => setName(e.target.value)}
                 style={{ marginBottom: 14 }}/>

          <div style={{ marginBottom: 6, fontSize: 12, color: "#a09070" }}>{t("conf_form_phone")} *</div>
          <input className="input-field" type="tel" inputMode="numeric" maxLength={15}
                 placeholder={t("example_phone")}
                 value={phone}
                 onChange={e => setPhone(e.target.value.replace(/[^\d]/g, ""))}
                 style={{ marginBottom: 14, direction: "ltr", textAlign: "right" }}/>

          <div style={{ marginBottom: 6, fontSize: 12, color: "#a09070" }}>{t("conf_form_city")} *</div>
          <div style={{ marginBottom: 14 }}>
            <CityField value={city} onChange={setCity} lang={lang} t={t}/>
          </div>

          <div style={{ marginBottom: 6, fontSize: 12, color: "#a09070" }}>{t("conf_form_street")}</div>
          <input className="input-field" type="text"
                 value={street} onChange={e => setStreet(e.target.value)}
                 style={{ marginBottom: 14 }}/>

          <div style={{ marginBottom: 6, fontSize: 12, color: "#a09070" }}>{t("conf_form_house_number")}</div>
          <input className="input-field" type="text" placeholder="86"
                 value={house} onChange={e => setHouse(e.target.value)}
                 style={{ marginBottom: 14, direction: "ltr", textAlign: "right" }}/>

          {error && (
            <div style={{ color: "#d47a4b", fontSize: 12, marginBottom: 12, textAlign: "center" }}>{error}</div>
          )}

          <button className="gold-btn" style={{ width: "100%" }} onClick={submit}
                  disabled={!name.trim() || !phone.trim() || !city.trim()}>
            {t("conf_form_submit")}
          </button>
        </div>
      </div>
    </div>
  );
}
