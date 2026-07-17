// Royal Gold — top-level view. Same prop contract as DigitalInvitationView (so
// TemplateRenderer forwards to it unchanged) and the same design-doc fields (no
// new schema).
//
// Its identity is the WALL: a near-black wine ground with cream bands torn out
// of it, and the couple's photos hung on it in gold frames. Besides classic,
// this is the only template that renders `media` — here as hung frames rather
// than a grid.
import { useEffect, useMemo, useRef, useState } from "react";
import { getDigitalFont } from "../../../../styles/digitalThemes.js";
import { localize, localizeItems, localizeList } from "../../../../utils/localize.js";
import { ensureDigitalFonts } from "../../../../utils/digitalFonts.js";
import { DEFAULT_EYEBROW, DEFAULT_BLESSING, DEFAULT_MEAL_OPTIONS } from "../../../../data/digitalInviteDefaults.js";
import { LangToggle } from "../../inviteShared.jsx";
import { useIntroPhase } from "../introContract.js";
import { rgTokens } from "./tokens.js";
import { RgStyles } from "./Styles.jsx";
import { Intro } from "./Intro.jsx";
import {
  Hero, StartsIn, GallerySection, StorySection, ScheduleSection, VenueSection,
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

/** Assign the wall/band stripe across the sections that ACTUALLY render.
    Gallery and schedule are pinned to the wall — the gold frames and the rose
    only read against the wine — and a pinned wall resets the alternation. The
    rest flip, which is what guarantees two cream bands can never end up
    adjacent when the groom switches a section off. */
export function assignStripe(blocks) {
  const out = {};
  let last = false;
  for (const b of blocks) {
    if (b.pin === "wall") {
      out[b.key] = false;
      last = false;
    } else {
      last = !last;
      out[b.key] = last;
    }
  }
  return out;
}

export function RoyalGoldView({
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
  const t = useMemo(() => rgTokens(design?.themeColor), [design?.themeColor]);
  const font = getDigitalFont(design?.fontFamily);
  const rootRef = useRef(null);
  const [reduced] = useState(prefersReducedMotion);

  useEffect(() => { ensureDigitalFonts(); }, []);

  const intro = useIntroPhase({ active: showEnvelope, token, openMs: 2200, onEvent: onIntroEvent });
  const opened = intro.phase !== "sealed";

  // Nothing lazy to wait for, so the page is ready at mount. Report it or every
  // royal-gold visit would miss its load metric.
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
  const blessing = localize(design?.blessing, lang).trim() || (lang === "he" ? DEFAULT_BLESSING.he : DEFAULT_BLESSING.ar);
  const venue = localize(design?.venue, lang);
  const venueCity = localize(design?.venueCity, lang);
  const venueAddress = localize(design?.venueAddress, lang);
  const accessNote = localize(design?.accessNote, lang);
  const dressCode = localize(design?.dressCode, lang);
  const giftIban = design?.giftIban || "";
  const giftNote = localize(design?.giftNote, lang);
  const weddingDate = design?.weddingDate || null;

  const captions = design?.mediaCaptions && typeof design.mediaCaptions === "object" ? design.mediaCaptions : {};
  const media = useMemo(() => {
    const arr = Array.isArray(design?.media) ? design.media : [];
    return arr.map((m) => ({ ...m, cap: localize(captions[m.storagePath], lang) || localize(m.cap, lang) || "" }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [design?.media, captions, lang]);

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
  const showGallery = on(design?.galleryEnabled) && media.length > 0;
  const showEvents = on(design?.eventsEnabled) && eventItems.length > 0;
  const showVenue = on(design?.venueEnabled) && (venue || venueAddress || hotels.length > 0);
  const showCountdown = on(design?.countdownEnabled) && !!weddingDate;
  const showGift = on(design?.giftEnabled) && (!!giftIban || !!giftNote);
  const showDress = !!dressCode;
  // Fold the emptiness check in here rather than leaving it to the section:
  // the stripe below is computed from this list, so it has to match what
  // actually renders or the wall/band rhythm slips.
  const showGuestbook = on(design?.guestbookEnabled)
    && ((approvedWishes?.length || 0) + wishes.length) > 0;

  const rsvpOpts = {
    companions: on(design?.rsvpCompanionsEnabled),
    meal: on(design?.rsvpMealEnabled),
    song: on(design?.rsvpSongEnabled),
  };

  const stripe = useMemo(() => {
    const blocks = [];
    if (showCountdown) blocks.push({ key: "countdown", pin: "wall" });
    if (showGallery) blocks.push({ key: "gallery", pin: "wall" });
    if (showStory) blocks.push({ key: "story" });
    if (showEvents) blocks.push({ key: "events", pin: "wall" });
    if (showVenue) blocks.push({ key: "venue" });
    if (showDress) blocks.push({ key: "dress" });
    blocks.push({ key: "rsvp" });
    if (showGift) blocks.push({ key: "gift" });
    if (showGuestbook) blocks.push({ key: "guestbook" });
    return assignStripe(blocks);
  }, [showCountdown, showGallery, showStory, showEvents, showVenue, showDress, showGift, showGuestbook]);

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return undefined;
    const els = Array.from(root.querySelectorAll(".rg-scroll"));
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
      className={"tpl-rg" + (opened ? " is-opened" : "")}
      lang={lang}
      dir="rtl"
      style={{ fontFamily: font.family }}
    >
      <RgStyles t={t} />

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

      <div className="rg-content">
        {setLang && <LangToggle lang={lang} setLang={setLang} theme={t.theme} font={font} />}

        <Hero {...sp} guestName={guestName} namesLine={namesLine} eyebrow={eyebrow} blessing={blessing} dateText={dateText} venueLine={venueLine} />
        {showCountdown && <StartsIn {...sp} weddingDate={weddingDate} onBand={stripe.countdown} />}
        {showGallery && <GallerySection {...sp} items={media} onBand={stripe.gallery} />}
        {showStory && <StorySection {...sp} items={storyItems} onBand={stripe.story} />}
        {showEvents && <ScheduleSection {...sp} items={eventItems} onBand={stripe.events} />}
        {showVenue && <VenueSection {...sp} venue={venue} venueCity={venueCity} venueAddress={venueAddress} accessNote={accessNote} hotels={hotels} onBand={stripe.venue} />}
        {showDress && <DressCodeSection {...sp} dressCode={dressCode} onBand={stripe.dress} />}
        <RsvpSection
          {...sp}
          opts={rsvpOpts}
          mealOptions={mealOptions}
          guestPhone={guestPhone}
          onSubmitRsvp={onSubmitRsvp}
          disabled={!isPublic}
          alreadyAnswered={alreadyAnswered}
          rsvpDone={rsvpDone}
          onBand={stripe.rsvp}
        />
        {showGift && <GiftSection {...sp} giftNote={giftNote} giftIban={giftIban} onBand={stripe.gift} />}
        {showGuestbook && <GuestbookSection {...sp} wishes={wishes} approvedWishes={approvedWishes} onBand={stripe.guestbook} />}
        <FooterCredit t={t} lang={lang} isPublic={isPublic} />
      </div>
    </div>
  );
}
