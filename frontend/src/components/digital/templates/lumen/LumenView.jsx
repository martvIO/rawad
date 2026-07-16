// Lumen — top-level view. Same prop contract as DigitalInvitationView (so
// TemplateRenderer forwards to it unchanged) and the same design-doc fields (no
// new schema). Deliberately the plainest tree in the catalogue: no ambient layer,
// no ornament beyond the seal, no lazy scene. The restraint IS the design — a 3D
// world here would contradict the whole point of it.
import { useEffect, useMemo, useRef, useState } from "react";
import { getDigitalFont } from "../../../../styles/digitalThemes.js";
import { localize, localizeItems, localizeList } from "../../../../utils/localize.js";
import { ensureDigitalFonts } from "../../../../utils/digitalFonts.js";
import { DEFAULT_EYEBROW, DEFAULT_BLESSING, DEFAULT_MEAL_OPTIONS } from "../../../../data/digitalInviteDefaults.js";
import { LangToggle } from "../../inviteShared.jsx";
import { useIntroPhase } from "../introContract.js";
import { lmTokens } from "./tokens.js";
import { LmStyles } from "./Styles.jsx";
import { Intro } from "./Intro.jsx";
import {
  Hero, StartsIn, StorySection, ScheduleSection, VenueSection,
  DressCodeSection, RsvpSection, GiftSection, GuestbookSection, FooterCredit,
} from "./sections.jsx";

const WEDDING_TZ = "Asia/Jerusalem";
function formatWeddingDateTime(epoch, lang) {
  const d = new Date(epoch);
  if (Number.isNaN(d.getTime())) return "";
  const locale = lang === "he" ? "he-IL" : "ar-EG";
  const date = d.toLocaleDateString(locale, { day: "numeric", month: "long", year: "numeric", numberingSystem: "latn", timeZone: WEDDING_TZ });
  if (d.getUTCHours() === 0 && d.getUTCMinutes() === 0) return date;
  const time = d.toLocaleTimeString(locale, { hour: "2-digit", minute: "2-digit", hour12: false, numberingSystem: "latn", timeZone: WEDDING_TZ });
  return date + " · " + time;
}

function prefersReducedMotion() {
  try {
    return globalThis.matchMedia?.("(prefers-reduced-motion: reduce)").matches === true;
  } catch {
    return false;
  }
}

export function LumenView({
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
  const t = useMemo(() => lmTokens(design?.themeColor), [design?.themeColor]);
  const font = getDigitalFont(design?.fontFamily);
  const rootRef = useRef(null);
  const [reduced] = useState(prefersReducedMotion);

  useEffect(() => { ensureDigitalFonts(); }, []);

  const intro = useIntroPhase({ active: showEnvelope, token, openMs: 2000, onEvent: onIntroEvent });
  const opened = intro.phase !== "sealed";

  // Nothing lazy to wait for, so the page is ready at mount. Report it or every
  // lumen visit would miss its load metric.
  const readyRef = useRef(false);
  useEffect(() => {
    if (readyRef.current) return;
    readyRef.current = true;
    try { onIntroEvent?.("ready"); } catch { /* never break the invitation */ }
  }, [onIntroEvent]);

  const groomName = localize(design?.groomDisplayName, lang);
  const brideName = localize(design?.brideName, lang);
  const namesLine = [groomName, brideName].map((s) => s.trim()).filter(Boolean).join(" & ")
    || (lang === "he" ? "החתן והכלה" : "العروسان");
  const eyebrow = localize(design?.eyebrow, lang).trim() || (lang === "he" ? DEFAULT_EYEBROW.he : DEFAULT_EYEBROW.ar);
  // The blessing leads the hero, as the source does.
  const blessing = localize(design?.blessing, lang).trim() || (lang === "he" ? DEFAULT_BLESSING.he : DEFAULT_BLESSING.ar);
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

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return undefined;
    const els = Array.from(root.querySelectorAll(".lm-scroll"));
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

  const sp = { t, lang };

  return (
    <div
      ref={rootRef}
      className={"tpl-lm" + (opened ? " is-opened" : "")}
      lang={lang}
      dir="rtl"
      style={{ fontFamily: font.family }}
    >
      <LmStyles t={t} />

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

      <div className="lm-content">
        {setLang && <LangToggle lang={lang} setLang={setLang} theme={t.theme} font={font} />}

        <Hero {...sp} guestName={guestName} namesLine={namesLine} eyebrow={eyebrow} blessing={blessing} dateText={dateText} venueLine={venueLine} />
        {showCountdown && <StartsIn {...sp} weddingDate={weddingDate} />}
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
