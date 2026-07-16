// Dolce Vita — top-level view. Renders the SAME prop contract as
// DigitalInvitationView (so TemplateRenderer forwards to it unchanged) and from
// the SAME design-doc fields (no new schema). It owns the wax-sealed letter intro
// (via the shared useIntroPhase contract), the scratch-to-reveal date, and the
// stationery section stack.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { getDigitalFont } from "../../../../styles/digitalThemes.js";
import { localize, localizeItems, localizeList } from "../../../../utils/localize.js";
import { ensureDigitalFonts } from "../../../../utils/digitalFonts.js";
import { supportsGradientText } from "../../../../utils/gradientText.js";
import { DEFAULT_EYEBROW, DEFAULT_MEAL_OPTIONS } from "../../../../data/digitalInviteDefaults.js";
import { LangToggle } from "../../inviteShared.jsx";
import { useIntroPhase } from "../introContract.js";
import { dvTokens } from "./tokens.js";
import { DvStyles } from "./Styles.jsx";
import { Intro } from "./Intro.jsx";
import {
  Hero, ScratchDateSection, CountdownSection, StorySection, ScheduleSection,
  VenueSection, DressCodeSection, RsvpSection, GiftSection, GuestbookSection, FooterCredit,
} from "./sections.jsx";

const WEDDING_TZ = "Asia/Jerusalem";
function formatWeddingDateTime(epoch, lang) {
  const d = new Date(epoch);
  if (Number.isNaN(d.getTime())) return "";
  const locale = lang === "he" ? "he-IL" : "ar-EG";
  const date = d.toLocaleDateString(locale, { day: "numeric", month: "long", year: "numeric", numberingSystem: "latn", timeZone: WEDDING_TZ });
  if (d.getUTCHours() === 0 && d.getUTCMinutes() === 0) return date;
  const time = d.toLocaleTimeString(locale, { hour: "2-digit", minute: "2-digit", hour12: false, numberingSystem: "latn", timeZone: WEDDING_TZ });
  return `${date} · ${time}`;
}

function prefersReducedMotion() {
  try {
    return globalThis.matchMedia?.("(prefers-reduced-motion: reduce)").matches === true;
  } catch {
    return false;
  }
}

export function DolceVitaView({
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
  const t = useMemo(() => dvTokens(design?.themeColor), [design?.themeColor]);
  const font = getDigitalFont(design?.fontFamily);
  const rootRef = useRef(null);
  const [clipTextOk] = useState(supportsGradientText);
  const [reduced] = useState(prefersReducedMotion);

  useEffect(() => { ensureDigitalFonts(); }, []);

  // Sealed-tap intro — behaviour from the shared contract; onEvent feeds the
  // page's metrics recorder (sealed / tap / skip / failsafe / seen).
  const intro = useIntroPhase({ active: showEnvelope, token, openMs: 1800, onEvent: onIntroEvent });
  const opened = intro.phase !== "sealed";

  // This template has no lazy 3D scene, so it is "ready" as soon as it mounts —
  // report it or the load metric for every dolce-vita visit would be missing.
  const readyRef = useRef(false);
  useEffect(() => {
    if (readyRef.current) return;
    readyRef.current = true;
    try { onIntroEvent?.("ready"); } catch { /* never break the invitation */ }
  }, [onIntroEvent]);

  // ── Field extraction (identical semantics to DigitalInvitationView) ──────
  const groomName = localize(design?.groomDisplayName, lang);
  const brideName = localize(design?.brideName, lang);
  const namesLine = [groomName, brideName].map((s) => s.trim()).filter(Boolean).join(" & ")
    || (lang === "he" ? "החתן והכלה" : "العروسان");
  const eyebrow = localize(design?.eyebrow, lang).trim() || (lang === "he" ? DEFAULT_EYEBROW.he : DEFAULT_EYEBROW.ar);
  const blessing = localize(design?.blessing, lang);
  const venue = localize(design?.venue, lang);
  const venueCity = localize(design?.venueCity, lang);
  const venueAddress = localize(design?.venueAddress, lang);
  const accessNote = localize(design?.accessNote, lang);
  const dressCode = localize(design?.dressCode, lang);
  const giftIban = design?.giftIban || "";
  const giftNote = localize(design?.giftNote, lang);
  const weddingDate = design?.weddingDate || null;

  const storyItems = localizeItems(design?.storyTimeline, ["when", "title", "body"], lang);
  const hotels = localizeItems(design?.hotels, ["name", "walk"], lang);
  const wishes = localizeItems(design?.wishes, ["who", "what"], lang);
  // events: only the four localized cells; icon + mapUrl are plain strings.
  const eventItems = localizeItems(design?.events, ["title", "time", "venue", "address"], lang);
  const mealOptions = Array.isArray(design?.mealOptions) && design.mealOptions.length
    ? localizeList(design.mealOptions, lang)
    : (lang === "he" ? DEFAULT_MEAL_OPTIONS.he : DEFAULT_MEAL_OPTIONS.ar);

  const dateText = weddingDate ? formatWeddingDateTime(weddingDate, lang) : "";
  const venueLine = [venue, venueCity].filter(Boolean).join(" · ");

  // Section flags (default ON; arrays auto-hide when empty).
  const on = (v) => v !== false;
  const showStory = on(design?.storyEnabled) && storyItems.length > 0;
  const showEvents = on(design?.eventsEnabled) && eventItems.length > 0;
  const showVenue = on(design?.venueEnabled) && (venue || venueAddress || hotels.length > 0);
  const showCountdown = on(design?.countdownEnabled) && !!weddingDate;
  const showGuestbook = on(design?.guestbookEnabled);
  const showGift = on(design?.giftEnabled) && (!!giftIban || !!giftNote);
  const showDress = !!dressCode;
  const rsvpOpts = {
    companions: on(design?.rsvpCompanionsEnabled),
    meal: on(design?.rsvpMealEnabled),
    song: on(design?.rsvpSongEnabled),
  };

  // Scroll-reveal (immediate in preview / reduced motion).
  useEffect(() => {
    const root = rootRef.current;
    if (!root) return undefined;
    const els = Array.from(root.querySelectorAll(".dv-scroll"));
    if (!isPublic || !opened || reduced || typeof IntersectionObserver === "undefined") {
      if (!isPublic || opened || reduced) els.forEach((el) => el.classList.add("is-in"));
      return undefined;
    }
    const io = new IntersectionObserver(
      (entries) => entries.forEach((e) => { if (e.isIntersecting) { e.target.classList.add("is-in"); io.unobserve(e.target); } }),
      { threshold: 0.08, rootMargin: "0px 0px -40px 0px" },
    );
    els.forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, [isPublic, opened, reduced, design, lang]);

  const sp = { t, lang, clipTextOk };

  return (
    <div
      ref={rootRef}
      className={`tpl-dv${opened ? " is-opened" : ""}`}
      lang={lang}
      dir="rtl"
      style={{ fontFamily: font.family }}
    >
      <DvStyles t={t} />
      <div className="dv-sky" aria-hidden="true" />

      {showEnvelope && !intro.revealed && (
        <Intro
          t={t}
          lang={lang}
          guestName={guestName}
          phase={intro.phase}
          cueEscalated={intro.cueEscalated}
          onOpen={intro.open}
          onSkip={intro.skip}
        />
      )}

      <div className="dv-content">
        {setLang && <LangToggle lang={lang} setLang={setLang} theme={t.theme} font={font} />}

        <Hero {...sp} guestName={guestName} namesLine={namesLine} eyebrow={eyebrow} venueLine={venueLine} blessing={blessing} />
        {weddingDate && <ScratchDateSection {...sp} weddingDate={weddingDate} reducedMotion={reduced} />}
        {showCountdown && <CountdownSection {...sp} weddingDate={weddingDate} dateText={dateText} />}
        {showStory && <StorySection {...sp} items={storyItems} />}
        {showEvents && <ScheduleSection {...sp} items={eventItems} />}
        {showVenue && <VenueSection {...sp} venue={venue} venueCity={venueCity} venueAddress={venueAddress} accessNote={accessNote} hotels={hotels} />}
        {showDress && <DressCodeSection {...sp} dressCode={dressCode} />}
        <RsvpSection
          {...sp}
          opts={rsvpOpts}
          mealOptions={mealOptions}
          guestPhone={guestPhone}
          onSubmitRsvp={onSubmitRsvp}
          disabled={!isPublic}
          alreadyAnswered={alreadyAnswered}
          rsvpDone={rsvpDone}
        />
        {showGift && <GiftSection {...sp} giftNote={giftNote} giftIban={giftIban} />}
        {showGuestbook && <GuestbookSection {...sp} wishes={wishes} approvedWishes={approvedWishes} />}
        <FooterCredit t={t} lang={lang} isPublic={isPublic} />
      </div>
    </div>
  );
}
