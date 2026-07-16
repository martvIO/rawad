// Destination Love — top-level view. Renders the SAME prop contract as
// DigitalInvitationView (so TemplateRenderer forwards to it unchanged) and from
// the SAME design-doc fields (no new schema). It owns the sealed-tap intro
// (useIntroPhase), the entrance/scroll reveal, the ambient effects, and reuses
// the shared LangToggle / FloatingDock / WalletButton / behaviour hooks.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { getDigitalFont } from "../../../../styles/digitalThemes.js";
import { localize, localizeItems, localizeList } from "../../../../utils/localize.js";
import { ensureDigitalFontFamily } from "../../../../utils/digitalFonts.js";
import { supportsGradientText } from "../../../../utils/gradientText.js";
import { DEFAULT_EYEBROW, DEFAULT_MEAL_OPTIONS } from "../../../../data/digitalInviteDefaults.js";
import { LangToggle } from "../../inviteShared.jsx";
import { Icon } from "../../InviteIcon.jsx";
import { FloatingDock } from "../../sections/InviteFooterDock.jsx";
import { WalletButton } from "../../WalletButton.jsx";
import { useIntroPhase } from "../introContract.js";
import { dlTokens } from "./tokens.js";
import { DlStyles } from "./Styles.jsx";
import { Intro } from "./Intro.jsx";
import { SceneHost } from "./effects/SceneHost.jsx";
import {
  Hero, BoardingPass, CountdownSection, TimelineSection, VenueSection,
  RsvpSection, GiftSection, GuestbookSection, FooterCredit,
} from "./sections.jsx";

const WEDDING_TZ = "Asia/Jerusalem";
function formatWeddingDateTime(epoch, lang) {
  const d = new Date(epoch);
  if (Number.isNaN(d.getTime())) return { date: "", time: "" };
  const locale = lang === "he" ? "he-IL" : "ar-EG";
  const date = d.toLocaleDateString(locale, { day: "numeric", month: "long", year: "numeric", numberingSystem: "latn", timeZone: WEDDING_TZ });
  const hasTime = !(d.getUTCHours() === 0 && d.getUTCMinutes() === 0);
  const time = hasTime ? d.toLocaleTimeString(locale, { hour: "2-digit", minute: "2-digit", hour12: false, numberingSystem: "latn", timeZone: WEDDING_TZ }) : "";
  return { date, time };
}

export function DestinationLoveView({
  design,
  guestName,
  guestPhone = "",
  lang = "ar",
  setLang,
  mode = "preview",
  onSubmitRsvp,
  approvedWishes = [],
  onSubmitWish,
  onOpenSorek,
  showEnvelope = false,
  alreadyAnswered = false,
  rsvpDone = false,
  boardingPassEnabled = false,
  token = "",
  onIntroEvent = null,
}) {
  const isPublic = mode === "public";
  const t = useMemo(() => dlTokens(design?.themeColor), [design?.themeColor]);
  const font = getDigitalFont(design?.fontFamily);
  const rootRef = useRef(null);
  // Gate the gold gradient section titles on engines that render background-clip:text
  // correctly — legacy in-app WebViews paint clipped text as a solid block, so they
  // fall back to the solid --dl-title-solid color (see Styles.jsx / parts.jsx .dl-grad).
  const [clipTextOk] = useState(supportsGradientText);

  useEffect(() => { ensureDigitalFontFamily(font.family); }, [font.family]);

  // Sealed-tap intro (active only on the public page; previews reveal at once).
  // onEvent feeds the shared intro contract's sealed/open signals to the page's
  // metrics recorder — wired once here, so every bespoke template reports alike.
  const intro = useIntroPhase({ active: showEnvelope, token, openMs: 2400, onEvent: onIntroEvent });
  // "ready" = the ambient scene finished loading (or was skipped) — the second
  // half of the load metric. Stable identity so SceneHost's effect can't loop.
  const onSceneReady = useCallback(() => {
    try { onIntroEvent?.("ready"); } catch { /* never break the invitation */ }
  }, [onIntroEvent]);
  const opened = intro.phase !== "sealed"; // content rises as the intro fades

  // ── Field extraction (identical semantics to DigitalInvitationView) ──────
  const groomName = localize(design?.groomDisplayName, lang);
  const brideName = localize(design?.brideName, lang);
  const namesLine = [groomName, brideName].map((s) => s.trim()).filter(Boolean).join(" & ") || (lang === "he" ? "החתן והכלה" : "العروسان");
  const eyebrow = localize(design?.eyebrow, lang).trim() || (lang === "he" ? DEFAULT_EYEBROW.he : DEFAULT_EYEBROW.ar);
  const venue = localize(design?.venue, lang);
  const venueCity = localize(design?.venueCity, lang);
  const venueAddress = localize(design?.venueAddress, lang);
  const accessNote = localize(design?.accessNote, lang);
  const giftIban = design?.giftIban || "";
  const giftNote = localize(design?.giftNote, lang);
  const musicUrl = design?.musicUrl || "";
  const weddingDate = design?.weddingDate || null;

  const monogram = useMemo(() => {
    const explicit = localize(design?.monogram, lang).trim();
    if (explicit) return explicit;
    const g = groomName.trim().charAt(0);
    const b = brideName.trim().charAt(0);
    return [g, b].filter(Boolean).join(" & ") || "✈";
  }, [design?.monogram, lang, groomName, brideName]);

  const storyItems = localizeItems(design?.storyTimeline, ["when", "title", "body"], lang);
  const hotels = localizeItems(design?.hotels, ["name", "walk"], lang);
  const wishes = localizeItems(design?.wishes, ["who", "what"], lang);
  const mealOptions = Array.isArray(design?.mealOptions) && design.mealOptions.length
    ? localizeList(design.mealOptions, lang)
    : (lang === "he" ? DEFAULT_MEAL_OPTIONS.he : DEFAULT_MEAL_OPTIONS.ar);

  const { date: dateText, time: timeText } = weddingDate ? formatWeddingDateTime(weddingDate, lang) : { date: "", time: "" };
  const venueLine = [venue, venueCity].filter(Boolean).join(" · ");
  const flightCode = useMemo(() => {
    const gi = (groomName.trim()[0] || "").toUpperCase();
    const bi = (brideName.trim()[0] || "").toUpperCase();
    const d = weddingDate ? new Date(weddingDate) : null;
    const dd = d ? String(d.getUTCDate()).padStart(2, "0") : "";
    const mm = d ? String(d.getUTCMonth() + 1).padStart(2, "0") : "";
    return `${gi}${bi || gi || "DL"} ${dd}${dd ? "·" : ""}${mm}`.trim();
  }, [groomName, brideName, weddingDate]);

  // Section flags (default ON; arrays auto-hide when empty).
  const on = (v) => v !== false;
  const showStory = on(design?.storyEnabled) && storyItems.length > 0;
  const showVenue = on(design?.venueEnabled) && (venue || venueAddress || hotels.length > 0);
  const showCountdown = on(design?.countdownEnabled) && !!weddingDate;
  const showGuestbook = on(design?.guestbookEnabled);
  const showGift = on(design?.giftEnabled) && (!!giftIban || !!giftNote);
  const showDock = on(design?.footerDockEnabled);
  const showMusic = on(design?.musicEnabled) && !!musicUrl;
  const rsvpOpts = {
    companions: on(design?.rsvpCompanionsEnabled),
    meal: on(design?.rsvpMealEnabled),
    song: on(design?.rsvpSongEnabled),
  };

  // Scroll-reveal for below-the-fold sections (immediate in preview).
  useEffect(() => {
    const root = rootRef.current;
    if (!root) return undefined;
    const els = Array.from(root.querySelectorAll(".dl-scroll"));
    if (!isPublic || !opened || typeof IntersectionObserver === "undefined") {
      if (!isPublic || opened) els.forEach((el) => el.classList.add("is-in"));
      return undefined;
    }
    const io = new IntersectionObserver(
      (entries) => entries.forEach((e) => { if (e.isIntersecting) { e.target.classList.add("is-in"); io.unobserve(e.target); } }),
      { threshold: 0.08, rootMargin: "0px 0px -40px 0px" },
    );
    els.forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, [isPublic, opened, design, lang]);

  const sectionProps = { t, lang, fontFamily: design?.fontFamily };

  return (
    <div
      ref={rootRef}
      className={"tpl-dl" + (clipTextOk ? " tpl-dl-clip-ok" : "") + (opened ? " is-opened" : "")}
      lang={lang}
      dir="rtl"
      style={{
        position: "relative",
        minHeight: "100vh",
        overflowX: "hidden",
        background: t.theme.bg,
        color: t.theme.text,
        fontFamily: font.family,
        "--dl-accent": t.theme.accent,
        "--dl-accent-line": t.theme.accentLine,
        "--dl-dash": t.dash,
        "--dl-card-border": t.theme.cardBorder,
        "--dl-title-solid": t.theme.text,
      }}
    >
      <DlStyles />

      {/* Ambient sky (2D floor + optional lazy three.js parallax). Rendered via a
          nested import to keep the three chunk out of this base module. */}
      <AmbientLayer t={t} fixed={isPublic} onReady={onSceneReady} />

      {isPublic && typeof setLang === "function" && (
        <LangToggle lang={lang} setLang={setLang} theme={t.theme} font={font} />
      )}

      {/* Content (held under the intro until it clears). */}
      <div style={{ position: "relative", zIndex: 3 }}>
        <Hero {...sectionProps} guestName={guestName} namesLine={namesLine} monogram={monogram} eyebrow={eyebrow} dateText={[dateText, timeText].filter(Boolean).join(" · ")} venueLine={venueLine} />

        <BoardingPass {...sectionProps} namesLine={namesLine} dateText={dateText} timeText={timeText} destination={venueCity || venue} code={flightCode} />

        {showCountdown && <CountdownSection {...sectionProps} weddingDate={weddingDate} />}
        {showStory && <TimelineSection {...sectionProps} items={storyItems} />}
        {showVenue && <VenueSection {...sectionProps} venue={venue} venueCity={venueCity} venueAddress={venueAddress} accessNote={accessNote} hotels={hotels} />}

        <RsvpSection {...sectionProps} opts={rsvpOpts} mealOptions={mealOptions} guestPhone={guestPhone} onSubmitRsvp={onSubmitRsvp} disabled={!isPublic} alreadyAnswered={alreadyAnswered} rsvpDone={rsvpDone} />

        {isPublic && boardingPassEnabled && token && (
          <div style={{ textAlign: "center", padding: "0 20px 8px" }}>
            <WalletButton token={token} lang={lang} theme={t.theme} font={font} />
          </div>
        )}

        {showGift && <GiftSection {...sectionProps} giftNote={giftNote} giftIban={giftIban} />}
        {showGuestbook && <GuestbookSection {...sectionProps} wishes={wishes} approvedWishes={approvedWishes} onSubmitWish={onSubmitWish} disabled={!isPublic} />}

        <FooterCredit t={t} lang={lang} isPublic={isPublic} />
      </div>

      {showDock && (
        <FloatingDock
          theme={t.theme}
          lang={lang}
          fixed={isPublic}
          weddingDate={weddingDate}
          groomName={groomName}
          brideName={brideName}
          venue={venue}
          venueAddress={venueAddress}
          showMusic={showMusic}
          musicUrl={musicUrl}
        />
      )}

      {/* صورك (your photos) — face-matching entry, public only when available. */}
      {isPublic && typeof onOpenSorek === "function" && (
        <button
          type="button"
          onClick={onOpenSorek}
          className="dl-float"
          style={{ position: "fixed", bottom: 20, insetInlineStart: 16, zIndex: 90, padding: "10px 16px", borderRadius: 999, border: `1px solid ${t.theme.chipBorder}`, background: t.theme.chipBg, backdropFilter: "blur(16px)", color: t.theme.accent, fontWeight: 800, fontSize: 13, fontFamily: "inherit", cursor: "pointer" }}
        >
          <Icon name="camera" size={16} /> {lang === "he" ? "התמונות שלך" : "صورك"}
        </button>
      )}

      {/* Preview badge (editor / admin). */}
      {mode === "preview" && (
        <div style={{ position: "absolute", top: 14, insetInlineEnd: 14, zIndex: 60, padding: "6px 12px", borderRadius: 999, background: t.theme.chipBg, border: `1px solid ${t.theme.chipBorder}`, color: t.theme.accent, fontSize: 11, fontWeight: 800, letterSpacing: lang === "he" ? 2 : 0, textTransform: "uppercase" }}>
          {lang === "he" ? "תצוגה" : "معاينة"}
        </div>
      )}

      {/* Sealed-tap intro overlay (public only, until it clears). */}
      {showEnvelope && intro.phase !== "done" && (
        <Intro phase={intro.phase} cueEscalated={intro.cueEscalated} open={intro.open} skip={intro.skip} guestName={guestName} lang={lang} t={t} fontFamily={design?.fontFamily} />
      )}
    </div>
  );
}

// The ambient effects wrapper. SceneHost renders the 2D floor always and layers
// the lazy three.js parallax on top on capable devices (only when `fixed`, i.e.
// the real guest page — the editor preview stays on the light 2D floor).
function AmbientLayer({ t, fixed, onReady }) {
  return (
    <div style={{ position: fixed ? "fixed" : "absolute", inset: 0, zIndex: 0 }} aria-hidden="true">
      <SceneHost t={t} fixed={fixed} onReady={onReady} />
    </div>
  );
}

export default DestinationLoveView;
