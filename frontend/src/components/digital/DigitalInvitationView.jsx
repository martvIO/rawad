// Presentational layer for the digital invitation — the luxury editorial
// microsite a guest opens from a WhatsApp link. The same component renders:
//   - the public guest page (mode="public", onSubmitRsvp wired)
//   - the groom live preview inside the editor (mode="preview")
//   - the admin Preview modal (mode="preview")
//
// All theming flows from the `design` prop (snapshot or live doc) via the
// shared digitalThemes tokens, so theme/font switching keeps working. The
// component owns no token / auth state — that lives in the route wrapper.
import { useEffect,useMemo,useRef } from "react";
import { getDigitalTheme, getDigitalFont } from "../../styles/digitalThemes.js";
import { DEFAULT_EYEBROW, DEFAULT_MEAL_OPTIONS, DEFAULT_BLESSING, DEFAULT_WELCOME } from "../../data/digitalInviteDefaults.js";
import { localize, localizeItems, localizeList } from "../../utils/localize.js";
import { ensureDigitalFonts } from "../../utils/digitalFonts.js";
import { LangToggle, SorekButton } from "./inviteShared.jsx";
import { Hero } from "./sections/InviteHero.jsx";
import { StorySection } from "./sections/InviteStory.jsx";
import { GallerySection } from "./sections/InviteGallery.jsx";
import { DetailsSection } from "./sections/InviteDetails.jsx";
import { VenueSection } from "./sections/InviteVenue.jsx";
import { CountdownSection } from "./sections/InviteCountdown.jsx";
import { RSVPSection } from "./sections/InviteRsvp.jsx";
import { GiftSection } from "./sections/InviteGift.jsx";
import { GuestbookSection } from "./sections/InviteGuestbook.jsx";
import { InviteFooter, FloatingDock } from "./sections/InviteFooterDock.jsx";
import { InviteNavMenu } from "./sections/InviteNavMenu.jsx";
import { CelestialAmbience } from "./sections/CelestialAmbience.jsx";
import { ViewStyles } from "./sections/InviteStyles.jsx";
import { WalletButton } from "./WalletButton.jsx";

export function DigitalInvitationView({
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
  demo = false,
  alreadyAnswered = false,
  rsvpDone = false,
  boardingPassEnabled = false,
  token = "",
}) {
  const theme = getDigitalTheme(design?.themeColor);
  const font = getDigitalFont(design?.fontFamily);
  const isPublic = mode === "public";
  const rootRef = useRef(null);

  // Load the extended Arabic+Hebrew wedding fonts only when an invitation
  // actually renders (lazy — other pages don't pay for them).
  useEffect(() => { ensureDigitalFonts(); }, []);

  // ── Field extraction with sensible fallbacks ────────────────────────────
  // Every groom-authored text field may be a plain string (legacy / single-
  // language) or a localized { ar, he } object — `localize` resolves the right
  // language with a fallback to the other, so toggling never blanks a field.
  const groomName = localize(design?.groomDisplayName, lang);
  const brideName = localize(design?.brideName, lang);
  const eyebrow = localize(design?.eyebrow, lang).trim() || (lang === "he" ? DEFAULT_EYEBROW.he : DEFAULT_EYEBROW.ar);
  const venue = localize(design?.venue, lang);
  const venueCity = localize(design?.venueCity, lang);
  const venueAddress = localize(design?.venueAddress, lang);
  const accessNote = localize(design?.accessNote, lang);
  const weddingDate = design?.weddingDate || null;
  const musicUrl = design?.musicUrl || "";
  const giftIban = design?.giftIban || ""; // IBAN is latin-only; never localized
  const giftNote = localize(design?.giftNote, lang);

  const monogram = useMemo(() => {
    const explicit = localize(design?.monogram, lang).trim();
    if (explicit) return explicit;
    const g = groomName.trim().charAt(0);
    const b = brideName.trim().charAt(0);
    return [g, b].filter(Boolean).join("&") || "د";
  }, [design?.monogram, lang, groomName, brideName]);

  const captions = design?.mediaCaptions && typeof design.mediaCaptions === "object" ? design.mediaCaptions : {};
  const media = useMemo(() => {
    const arr = Array.isArray(design?.media) ? design.media : [];
    return arr.map((m) => ({ ...m, cap: localize(captions[m.storagePath], lang) || localize(m.cap, lang) || "" }));
  }, [design?.media, captions, lang]);

  // Featured media shown directly under the hero greeting — a separate set
  // from the gallery (media[]), so it never duplicates the album below.
  const heroMedia = useMemo(
    () => (Array.isArray(design?.heroMedia) ? design.heroMedia : []),
    [design?.heroMedia],
  );

  const storyItems = localizeItems(design?.storyTimeline, ["when", "title", "body"], lang);
  const detailItems = localizeItems(design?.details, ["meta", "title", "body"], lang);
  const hotels = localizeItems(design?.hotels, ["name", "walk"], lang);
  const wishes = localizeItems(design?.wishes, ["who", "what"], lang);
  const mealOptions = Array.isArray(design?.mealOptions) && design.mealOptions.length
    ? localizeList(design.mealOptions, lang)
    : (lang === "he" ? DEFAULT_MEAL_OPTIONS.he : DEFAULT_MEAL_OPTIONS.ar);

  // Section flags default to ON; arrays still auto-hide when empty so guests
  // never see a placeholder the groom didn't fill.
  const on = (v) => v !== false;
  const showStory = on(design?.storyEnabled) && storyItems.length > 0;
  const showGallery = on(design?.galleryEnabled) && media.length > 0;
  const showDetails = on(design?.detailsEnabled) && detailItems.length > 0;
  const showVenue = on(design?.venueEnabled) && (venue || venueAddress || hotels.length > 0);
  const showCountdown = on(design?.countdownEnabled) && !!weddingDate;
  const showGuestbook = on(design?.guestbookEnabled);
  const showGift = on(design?.giftEnabled) && (!!giftIban || !!giftNote);
  const showDock = on(design?.footerDockEnabled);
  const showMusic = on(design?.musicEnabled) && !!musicUrl;
  const showHeroMedia = on(design?.heroMediaEnabled) && heroMedia.length > 0;
  const showEnvelopeNow = isPublic && showEnvelope && on(design?.envelopeEnabled);

  const rsvpOpts = {
    companions: on(design?.rsvpCompanionsEnabled),
    meal: on(design?.rsvpMealEnabled),
    song: on(design?.rsvpSongEnabled),
  };

  const dateText = weddingDate
    ? new Date(weddingDate).toLocaleDateString(lang === "he" ? "he-IL" : "ar-EG", {
        day: "numeric",
        month: "long",
        year: "numeric",
        numberingSystem: "latn",
      })
    : "";
  const venueLine = [venue, venueCity].filter(Boolean).join(" · ");

  // ── Envelope-card content ────────────────────────────────────────────────
  // The cinematic 3D card shows the couple's names in BOTH scripts (the
  // universal element), with the blessing + welcome + date in the guest's
  // current language. Names join groom-first with the "و" / "ו" connective,
  // matching the hero.
  const namesAr = [localize(design?.groomDisplayName, "ar"), localize(design?.brideName, "ar")]
    .map((s) => s.trim()).filter(Boolean).join(" و ");
  const namesHe = [localize(design?.groomDisplayName, "he"), localize(design?.brideName, "he")]
    .map((s) => s.trim()).filter(Boolean).join(" ו");
  const blessing = localize(design?.blessing, lang).trim() || (lang === "he" ? DEFAULT_BLESSING.he : DEFAULT_BLESSING.ar);
  const welcome = localize(design?.welcome, lang).trim() || (lang === "he" ? DEFAULT_WELCOME.he : DEFAULT_WELCOME.ar);

  // Section list for the floating nav menu — built in render order from the same
  // show* flags, so it always matches exactly the sections that are on screen.
  const navItems = useMemo(() => {
    const L = (ar, he) => (lang === "he" ? he : ar);
    return [
      { id: "inv-top", label: L("الأعلى", "למעלה"), show: true },
      { id: "inv-story", label: L("القصة", "הסיפור"), show: showStory },
      { id: "inv-gallery", label: L("الصور", "התמונות"), show: showGallery },
      { id: "inv-details", label: L("التفاصيل", "הפרטים"), show: showDetails },
      { id: "inv-venue", label: L("المكان", "המקום"), show: showVenue },
      { id: "inv-countdown", label: L("العدّ التنازلي", "ספירה לאחור"), show: showCountdown },
      { id: "rsvp", label: L("تأكيد الحضور", "אישור הגעה"), show: true },
      { id: "inv-gift", label: L("هدية", "מתנה"), show: showGift },
      { id: "inv-guestbook", label: L("التهاني", "ברכות"), show: showGuestbook },
    ].filter((it) => it.show);
  }, [lang, showStory, showGallery, showDetails, showVenue, showCountdown, showGift, showGuestbook]);

  // Scroll-reveal: animate `.dawa-inv-reveal` blocks in as they enter view on
  // the public page. In preview (or without IntersectionObserver) reveal them
  // all immediately so nothing is ever stuck hidden behind the editor.
  useEffect(() => {
    const root = rootRef.current;
    if (!root) return undefined;
    const els = Array.from(root.querySelectorAll(".dawa-inv-reveal"));
    if (!isPublic || typeof IntersectionObserver === "undefined") {
      els.forEach((el) => el.classList.add("is-in"));
      return undefined;
    }
    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => {
          if (e.isIntersecting) {
            e.target.classList.add("is-in");
            io.unobserve(e.target);
          }
        });
      },
      { threshold: 0.08, rootMargin: "0px 0px -40px 0px" },
    );
    els.forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, [isPublic, design]);

  return (
    <div
      ref={rootRef}
      className="dawa-inv"
      style={{
        minHeight: "100vh",
        background: theme.bg,
        color: theme.text,
        position: "relative",
        overflowX: "hidden",
        fontFamily: font.family,
      }}
    >
      <ViewStyles theme={theme} font={font} fixed={isPublic} />

      {isPublic && typeof setLang === "function" && (
        <LangToggle lang={lang} setLang={setLang} theme={theme} font={font} />
      )}

      {(mode === "preview" || (isPublic && typeof onOpenSorek === "function")) && (
        <SorekButton lang={lang} isPublic={isPublic} onClick={onOpenSorek} theme={theme} font={font} />
      )}

      <CelestialAmbience
        theme={theme}
        font={font}
        lang={lang}
        mode={mode}
        fixed={isPublic}
        immersive3d={on(design?.immersive3d)}
        showEnvelope={showEnvelopeNow}
        demo={demo}
        guestName={guestName}
        monogram={monogram}
        namesAr={namesAr}
        namesHe={namesHe}
        eyebrow={eyebrow}
        blessing={blessing}
        welcome={welcome}
        dateText={dateText}
      />

      <Hero
        guestName={guestName}
        groomName={groomName}
        brideName={brideName}
        monogram={monogram}
        eyebrow={eyebrow}
        dateText={/* under countdown by default; hero shows it only as a fallback when the countdown is hidden */ showCountdown ? "" : dateText}
        venueLine={venueLine}
        heroMedia={showHeroMedia ? heroMedia : []}
        theme={theme}
        font={font}
        lang={lang}
      />

      {showStory && <StorySection items={storyItems} theme={theme} font={font} lang={lang} />}
      {showGallery && <GallerySection items={media} theme={theme} font={font} lang={lang} />}
      {showDetails && <DetailsSection items={detailItems} theme={theme} font={font} lang={lang} />}
      {showVenue && (
        <VenueSection
          venue={venue}
          venueCity={venueCity}
          venueAddress={venueAddress}
          accessNote={accessNote}
          hotels={hotels}
          theme={theme}
          font={font}
          lang={lang}
        />
      )}
      {showCountdown && <CountdownSection weddingDate={weddingDate} dateText={dateText} theme={theme} font={font} lang={lang} />}

      <RSVPSection
        theme={theme}
        font={font}
        lang={lang}
        opts={rsvpOpts}
        mealOptions={mealOptions}
        guestPhone={guestPhone}
        onSubmitRsvp={onSubmitRsvp}
        disabled={!isPublic}
        alreadyAnswered={alreadyAnswered}
        rsvpDone={rsvpDone}
      />

      {/* Add-to-Wallet — only on the real guest page, when the admin enabled the
          per-groom flag and we have a token to mint the pass from. */}
      {isPublic && boardingPassEnabled && token && (
        <WalletButton token={token} lang={lang} theme={theme} font={font} />
      )}

      {showGift && <GiftSection giftNote={giftNote} giftIban={giftIban} theme={theme} font={font} lang={lang} />}
      {showGuestbook && <GuestbookSection wishes={wishes} approvedWishes={approvedWishes} onSubmitWish={onSubmitWish} theme={theme} font={font} lang={lang} disabled={!isPublic} />}

      <InviteFooter theme={theme} font={font} lang={lang} />

      {/* Growth loop — subtle "made with Dawa" credit on the PUBLIC invitation
          only (every wedding reaches 100-600 in-market guests). Links back to
          the marketing site with a referral param. Hidden in the editor preview. */}
      {isPublic && (
        <div style={{ textAlign: "center", padding: "16px 16px 96px" }}>
          <a href="/?ref=invite" target="_blank" rel="noopener noreferrer"
             style={{ color: theme.accent, textDecoration: "none", opacity: 0.7, fontSize: 12, fontWeight: 700 }}>
            {lang === "he" ? "נוצר עם דעוה — צרו את ההזמנה שלכם ←" : "صُنعت بواسطة دعوة — اصنع دعوتك ←"}
          </a>
        </div>
      )}

      {showDock && (
        <FloatingDock
          theme={theme}
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

      <InviteNavMenu items={navItems} theme={theme} font={font} lang={lang} fixed={isPublic} />

      {mode === "preview" && (
        <div
          style={{
            position: "absolute",
            top: 14,
            // Opposite corner from the صورك button (inline-start) so they don't overlap.
            insetInlineEnd: 14,
            padding: "6px 12px",
            borderRadius: 999,
            background: theme.chipBg,
            border: `1px solid ${theme.chipBorder}`,
            color: theme.accent,
            fontSize: 11,
            fontWeight: 800,
            letterSpacing: 2,
            textTransform: "uppercase",
            zIndex: 60,
            fontFamily: font.family,
          }}
        >
          {lang === "he" ? "תצוגה מקדימה" : "معاينة"}
        </div>
      )}
    </div>
  );
}
