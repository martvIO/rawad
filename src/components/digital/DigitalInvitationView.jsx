// Presentational layer for the digital invitation — the luxury editorial
// microsite a guest opens from a WhatsApp link. The same component renders:
//   - the public guest page (mode="public", onSubmitRsvp wired)
//   - the groom live preview inside the editor (mode="preview")
//   - the admin Preview modal (mode="preview")
//
// All theming flows from the `design` prop (snapshot or live doc) via the
// shared digitalThemes tokens, so theme/font switching keeps working. The
// component owns no token / auth state — that lives in the route wrapper.
import { useEffect, useMemo, useRef, useState } from "react";
import { getDigitalTheme, getDigitalFont } from "../../styles/digitalThemes.js";
import {
  DEFAULT_EYEBROW,
  DEFAULT_MEAL_OPTIONS,
} from "../../data/digitalInviteDefaults.js";
import { localize, localizeItems, localizeList } from "../../utils/localize.js";
import { ensureDigitalFonts } from "../../utils/digitalFonts.js";
import { Num } from "../Num.jsx";
import { BrandLogo } from "../BrandLogo.jsx";

const ON_GOLD = "#2a0f00"; // dark ink for text sitting on the gold gradient

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
  alreadyAnswered = false,
  rsvpDone = false,
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

      {showEnvelopeNow && <EnvelopeIntro guestName={guestName} font={font} lang={lang} />}
      <Ambience theme={theme} fixed={isPublic} />

      <Hero
        guestName={guestName}
        groomName={groomName}
        brideName={brideName}
        monogram={monogram}
        eyebrow={eyebrow}
        dateText={dateText}
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
      {showCountdown && <CountdownSection weddingDate={weddingDate} theme={theme} font={font} lang={lang} />}

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

      {showGift && <GiftSection giftNote={giftNote} giftIban={giftIban} theme={theme} font={font} lang={lang} />}
      {showGuestbook && <GuestbookSection wishes={wishes} approvedWishes={approvedWishes} onSubmitWish={onSubmitWish} theme={theme} font={font} lang={lang} disabled={!isPublic} />}

      <InviteFooter theme={theme} font={font} lang={lang} />
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

// ── Shared section header ────────────────────────────────────────────────────
function SectionHead({ eyebrow, title, sub, theme, font }) {
  return (
    <div className="dawa-inv-reveal" style={{ textAlign: "center", marginBottom: 56 }}>
      <div className="dawa-inv-secflourish">
        <FloralFlourish theme={theme} width={156} />
      </div>
      <div className="dawa-inv-eyebrow" style={{ color: theme.accent, fontFamily: font.family }}>
        {eyebrow}
      </div>
      <h2
        className="dawa-inv-title dawa-inv-grad"
        style={{
          fontFamily: font.family,
          background: `linear-gradient(135deg,${theme.gradientStops.join(",")})`,
          WebkitBackgroundClip: "text",
          WebkitTextFillColor: "transparent",
        }}
      >
        {title}
      </h2>
      <div className="dawa-inv-secrule" aria-hidden="true">
        <span style={{ background: `linear-gradient(90deg, transparent, ${theme.accent})` }} />
        <span className="dawa-inv-secrule-dot" style={{ background: theme.accent, boxShadow: `0 0 10px ${theme.sparkleGlow}` }} />
        <span style={{ background: `linear-gradient(90deg, ${theme.accent}, transparent)` }} />
      </div>
      {sub && (
        <p className="dawa-inv-sub" style={{ color: theme.textSoft, fontFamily: font.family }}>
          {sub}
        </p>
      )}
    </div>
  );
}

// ── Hero ──────────────────────────────────────────────────────────────────────
// Elegant symmetric floral flourish — a central blossom flanked by two leafy
// vines, themed to the design's accent. Used as a hero crown + footer ornament.
function FloralFlourish({ theme, width = 230, className = "" }) {
  const a = theme.accent;
  const m = theme.accentMuted;
  const petals = [0, 60, 120, 180, 240, 300];
  return (
    <svg className={`dawa-inv-flourish ${className}`.trim()} width={width} height={Math.round(width * 0.2)}
         viewBox="0 0 280 56" fill="none" aria-hidden="true">
      <g stroke={a} strokeWidth="1.4" strokeLinecap="round" fill="none" opacity="0.9">
        <path d="M140 28 C 112 30 88 18 54 24" />
        <path d="M140 28 C 168 30 192 18 226 24" />
      </g>
      <g fill={m} stroke={a} strokeWidth="0.7">
        <path d="M112 26 q -11 -10 -24 -7 q 9 11 24 7 Z" />
        <path d="M98 31 q -11 9 -24 6 q 9 -11 24 -6 Z" />
        <path d="M168 26 q 11 -10 24 -7 q -9 11 -24 7 Z" />
        <path d="M182 31 q 11 9 24 6 q -9 -11 -24 -6 Z" />
      </g>
      <g fill={a}>
        <circle cx="54" cy="24" r="3.4" />
        <circle cx="226" cy="24" r="3.4" />
      </g>
      <g transform="translate(140 28)">
        {petals.map((d) => (
          <ellipse key={d} rx="3.6" ry="9.5" fill={m} stroke={a} strokeWidth="0.9" transform={`rotate(${d})`} />
        ))}
        <circle r="4.6" fill={a} />
        <circle r="2" fill={theme.bg} opacity="0.5" />
      </g>
    </svg>
  );
}

function Hero({ guestName, groomName, brideName, monogram, eyebrow, dateText, venueLine, heroMedia = [], theme, font, lang }) {
  return (
    <section className="dawa-inv-hero">
      <div
        aria-hidden="true"
        className="dawa-inv-hero-glow"
        style={{
          background: `radial-gradient(ellipse 80% 60% at 50% 30%, ${theme.accentMuted} 0%, transparent 60%), radial-gradient(ellipse 60% 40% at 50% 80%, ${theme.accentMuted} 0%, transparent 65%)`,
        }}
      />
      <div className="dawa-inv-hero-frame" aria-hidden="true" style={{ borderColor: theme.accent }}>
        <span className="dawa-inv-corner dawa-inv-corner-tl" style={{ borderColor: theme.accent }} />
        <span className="dawa-inv-corner dawa-inv-corner-tr" style={{ borderColor: theme.accent }} />
        <span className="dawa-inv-corner dawa-inv-corner-bl" style={{ borderColor: theme.accent }} />
        <span className="dawa-inv-corner dawa-inv-corner-br" style={{ borderColor: theme.accent }} />
      </div>
      <div className="dawa-inv-hero-logo">
        <BrandLogo size={96} />
      </div>
      <div className="dawa-inv-hero-flourish">
        <FloralFlourish theme={theme} width={200} />
      </div>
      <div className="dawa-inv-hero-eyebrow" style={{ color: theme.accent, fontFamily: font.family }}>
        <span style={{ width: 40, height: 1, background: `linear-gradient(90deg, transparent, ${theme.accent})` }} />
        {eyebrow}
        <span style={{ width: 40, height: 1, background: `linear-gradient(90deg, ${theme.accent}, transparent)` }} />
      </div>

      <div className="dawa-inv-monogram">
        <svg viewBox="0 0 200 200" aria-hidden="true">
          <defs>
            <linearGradient id={`dawa-mono-${theme.key}`} x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stopColor={theme.monoStops[0]} />
              <stop offset="50%" stopColor={theme.monoStops[1]} />
              <stop offset="100%" stopColor={theme.monoStops[2]} />
            </linearGradient>
          </defs>
          {/* Royal crest: a crown above the initials + symmetric laurel
              sprigs + a bottom flourish. Open (no enclosing ring) so it reads
              luxurious and draws the eye. All strokes/fills use the theme's
              mono gradient so it adapts to every palette. */}
          <g className="dawa-inv-crown">
            <path
              d="M68 52 L68 35 L83.5 47 L100 28 L116.5 47 L132 35 L132 52 Z"
              fill="none"
              stroke={`url(#dawa-mono-${theme.key})`}
              strokeWidth="2"
              strokeLinejoin="round"
            />
            <path d="M66 54 H134" stroke={`url(#dawa-mono-${theme.key})`} strokeWidth="1.4" strokeLinecap="round" />
            <circle cx="68" cy="32" r="2.6" fill={theme.accent} />
            <circle className="dawa-inv-crown-gem" cx="100" cy="24.5" r="3.4" fill={theme.accent} />
            <circle cx="132" cy="32" r="2.6" fill={theme.accent} />
            <circle cx="100" cy="46" r="2.2" fill={theme.accent} />
          </g>

          {/* side laurel sprigs — left, then mirrored to the right */}
          {[false, true].map((mirror) => (
            <g key={mirror ? "sprig-r" : "sprig-l"} transform={mirror ? "translate(200,0) scale(-1,1)" : undefined}>
              <path d="M27 124 C 22 106, 28 91, 43 82" fill="none" stroke={`url(#dawa-mono-${theme.key})`} strokeWidth="1.3" strokeLinecap="round" opacity="0.85" />
              <ellipse cx="26" cy="118" rx="2.6" ry="7" fill={`url(#dawa-mono-${theme.key})`} transform="rotate(30 26 118)" />
              <ellipse cx="24" cy="105" rx="2.6" ry="7.5" fill={`url(#dawa-mono-${theme.key})`} transform="rotate(8 24 105)" />
              <ellipse cx="28" cy="92" rx="2.5" ry="7" fill={`url(#dawa-mono-${theme.key})`} transform="rotate(-16 28 92)" />
              <ellipse cx="37" cy="83" rx="2.3" ry="6.2" fill={`url(#dawa-mono-${theme.key})`} transform="rotate(-34 37 83)" />
            </g>
          ))}

          {/* bottom flourish */}
          <g fill={`url(#dawa-mono-${theme.key})`}>
            <path d="M100 150 q6 11 0 22 q-6 -11 0 -22 Z" />
            <ellipse cx="86" cy="160" rx="2.4" ry="6.5" transform="rotate(44 86 160)" />
            <ellipse cx="114" cy="160" rx="2.4" ry="6.5" transform="rotate(-44 114 160)" />
            <circle cx="100" cy="176" r="1.7" />
          </g>
        </svg>
        <span
          className="dawa-inv-monogram-letters dawa-inv-grad"
          style={{
            fontFamily: font.family,
            background: `linear-gradient(135deg,${theme.monoStops.join(",")})`,
            WebkitBackgroundClip: "text",
            WebkitTextFillColor: "transparent",
          }}
        >
          {monogram}
        </span>
      </div>

      {groomName && (
        <h1
          className="dawa-inv-couple dawa-inv-grad"
          style={{
            fontFamily: font.family,
            background: `linear-gradient(135deg,${theme.gradientStops.join(",")})`,
            WebkitBackgroundClip: "text",
            WebkitTextFillColor: "transparent",
          }}
        >
          {groomName}
        </h1>
      )}
      {groomName && brideName && (
        <span className="dawa-inv-amp" style={{ color: theme.accent, fontFamily: font.family }}>
          {lang === "he" ? "ו" : "و"}
        </span>
      )}
      {brideName && (
        <h1
          className="dawa-inv-couple dawa-inv-grad"
          style={{
            fontFamily: font.family,
            background: `linear-gradient(135deg,${theme.gradientStops.join(",")})`,
            WebkitBackgroundClip: "text",
            WebkitTextFillColor: "transparent",
          }}
        >
          {brideName}
        </h1>
      )}

      {(dateText || venueLine) && (
        <div
          className="dawa-inv-dateline"
          style={{ background: theme.chipBg, border: `1px solid ${theme.chipBorder}`, color: theme.text, fontFamily: font.family }}
        >
          {dateText && <strong style={{ color: theme.accent, fontWeight: 700 }}><Num dir="auto">{dateText}</Num></strong>}
          {dateText && venueLine && <span className="dawa-inv-dot" style={{ background: theme.accent }} />}
          {venueLine && <span>{venueLine}</span>}
        </div>
      )}

      <div className="dawa-inv-greet" style={{ color: theme.textSoft, fontFamily: font.family }}>
        {lang === "he" ? "מתכבדים להזמינכם," : "يتشرفون بدعوتكم،"}
        <strong
          className="dawa-inv-grad"
          style={{
            background: `linear-gradient(135deg,${theme.gradientStops.join(",")})`,
            WebkitBackgroundClip: "text",
            WebkitTextFillColor: "transparent",
          }}
        >
          {guestName || "—"}
        </strong>
      </div>

      {heroMedia.length > 0 && (
        <div className="dawa-inv-hero-media">
          {heroMedia.map((m, i) => (
            <div
              key={m.storagePath || i}
              className="dawa-inv-hero-media-item"
              style={{ borderColor: theme.accentLine, boxShadow: `0 18px 40px -18px ${theme.accentMuted}` }}
            >
              {m.kind === "video" ? (
                <video src={m.url} autoPlay muted loop playsInline />
              ) : (
                <img src={m.url} alt="" loading="lazy" />
              )}
            </div>
          ))}
        </div>
      )}

      <div className="dawa-inv-cue" style={{ color: theme.accent, fontFamily: font.family }}>
        <span>{lang === "he" ? "גלול לסיפור" : "اسحب للقصة"}</span>
        <span className="dawa-inv-cue-line" style={{ background: `linear-gradient(180deg, ${theme.accent}, transparent)` }} />
      </div>
    </section>
  );
}

// ── Story timeline ─────────────────────────────────────────────────────────────
function StorySection({ items, theme, font, lang }) {
  return (
    <section className="dawa-inv-section">
      <SectionHead
        eyebrow={lang === "he" ? "הסיפור שלנו" : "قصتنا"}
        title={lang === "he" ? "המסע שלנו עד היום" : "رحلتنا حتى اليوم"}
        sub={lang === "he" ? "מהמפגש הראשון ועד הרגע שבו נחלוק איתכם את שמחתנו." : "من لحظة التعارف الأولى إلى اللحظة التي نشارككم فيها فرحنا."}
        theme={theme}
        font={font}
      />
      <div className="dawa-inv-timeline" style={{ "--line": theme.accentLine }}>
        {items.map((s, i) => (
          <div key={i} className={`dawa-inv-story dawa-inv-reveal ${i % 2 === 0 ? "is-right" : "is-left"}`}>
            <span className="dawa-inv-story-node" style={{ background: theme.accent, boxShadow: `0 0 0 4px ${theme.bg}, 0 0 0 5px ${theme.accentLine}` }} />
            {s.icon && <div className="dawa-inv-story-icon" style={{ color: theme.accent }}>{s.icon}</div>}
            {s.when && <div className="dawa-inv-story-when" style={{ color: theme.accent, fontFamily: font.family }}>{s.when}</div>}
            {s.title && <h3 className="dawa-inv-story-title" style={{ color: theme.text, fontFamily: font.family }}>{s.title}</h3>}
            {s.body && <p className="dawa-inv-story-body" style={{ color: theme.textSoft }}>{s.body}</p>}
          </div>
        ))}
      </div>
    </section>
  );
}

// ── Gallery + lightbox ──────────────────────────────────────────────────────────
function GallerySection({ items, theme, font, lang }) {
  const [open, setOpen] = useState(null);
  useEffect(() => {
    const esc = (e) => e.key === "Escape" && setOpen(null);
    window.addEventListener("keydown", esc);
    return () => window.removeEventListener("keydown", esc);
  }, []);
  return (
    <section className="dawa-inv-section">
      <SectionHead
        eyebrow={lang === "he" ? "גלריה" : "معرض الصور"}
        title={lang === "he" ? "רגעים ששמרנו" : "لحظات نحتفظ بها"}
        sub={lang === "he" ? "לחצו על תמונה כדי לצפות בה בגודל מלא." : "اضغط على أي صورة لمشاهدتها بحجمها الكامل."}
        theme={theme}
        font={font}
      />
      <div className="dawa-inv-gallery dawa-inv-reveal">
        {items.map((m, i) => (
          <div key={m.storagePath || i} className="dawa-inv-gallery-item" onClick={() => setOpen(m)}>
            {m.kind === "video" ? (
              <video src={m.url} muted loop playsInline />
            ) : (
              <img src={m.url} alt={m.cap || ""} loading="lazy" />
            )}
            {m.cap && (
              <div className="dawa-inv-gallery-cap" style={{ fontFamily: font.family }}>
                {m.cap}
              </div>
            )}
          </div>
        ))}
      </div>
      <div className={`dawa-inv-lightbox${open ? " is-open" : ""}`} onClick={() => setOpen(null)}>
        <button className="dawa-inv-lightbox-close" style={{ color: theme.accent, borderColor: theme.accentLine }} aria-label="close" onClick={() => setOpen(null)}>
          ✕
        </button>
        {open && (open.kind === "video"
          ? <video src={open.url} controls autoPlay style={{ maxWidth: "90%", maxHeight: "86vh", borderRadius: 12 }} />
          : <img src={open.url} alt={open.cap || ""} />)}
      </div>
    </section>
  );
}

// ── Wedding details ─────────────────────────────────────────────────────────────
function DetailsSection({ items, theme, font, lang }) {
  return (
    <section className="dawa-inv-section">
      <SectionHead
        eyebrow={lang === "he" ? "פרטי היום" : "تفاصيل اليوم"}
        title={lang === "he" ? "כל מה שצריך לדעת" : "كل ما تحتاجون معرفته"}
        sub={lang === "he" ? "מידע קצר כדי לתכנן את הזמן ולבלות יחד ערב שלם." : "معلومات سريعة لتنظيم وقتكم، ولنقضي معاً ليلة كاملة."}
        theme={theme}
        font={font}
      />
      <div className="dawa-inv-details">
        {items.map((c, i) => (
          <div key={i} className="dawa-inv-detail dawa-inv-reveal">
            {c.icon && <div className="dawa-inv-detail-icon" style={{ color: theme.accent }}>{c.icon}</div>}
            {c.meta && <div className="dawa-inv-detail-meta" style={{ color: theme.accent }}>{c.meta}</div>}
            {c.title && <h3 className="dawa-inv-detail-title" style={{ color: theme.text, fontFamily: font.family }}>{c.title}</h3>}
            {c.body && <p className="dawa-inv-detail-body" style={{ color: theme.textSoft }}>{c.body}</p>}
          </div>
        ))}
      </div>
    </section>
  );
}

// ── Venue + faux map + hotels ────────────────────────────────────────────────────
function VenueSection({ venue, venueCity, venueAddress, accessNote, hotels, theme, font, lang }) {
  const mapsHref = `https://maps.google.com/?q=${encodeURIComponent([venue, venueAddress, venueCity].filter(Boolean).join(" "))}`;
  return (
    <section className="dawa-inv-section">
      <SectionHead
        eyebrow={lang === "he" ? "המקום" : "المكان"}
        title={lang === "he" ? "היכן נחגוג" : "حيث سنحتفل"}
        sub={[venue, venueAddress].filter(Boolean).join(" — ")}
        theme={theme}
        font={font}
      />
      <div className="dawa-inv-venue">
        <div className="dawa-inv-venue-map dawa-inv-reveal" style={{ borderColor: theme.accentLine }} aria-hidden="true">
          <svg viewBox="0 0 600 400" width="100%" height="100%" preserveAspectRatio="xMidYMid slice">
            <defs>
              <linearGradient id={`dawa-route-${theme.key}`} x1="0" y1="0" x2="1" y2="1">
                <stop offset="0%" stopColor={theme.monoStops[0]} />
                <stop offset="100%" stopColor={theme.accent} />
              </linearGradient>
              <pattern id={`dawa-vgrid-${theme.key}`} width="42" height="42" patternUnits="userSpaceOnUse">
                <path d="M42 0 H0 V42" fill="none" stroke={theme.accentMuted} strokeWidth="1" />
              </pattern>
            </defs>
            <rect width="600" height="400" fill={`url(#dawa-vgrid-${theme.key})`} />
            <path d="M 0 280 Q 130 220 260 240 T 600 220" stroke={theme.accentLine} strokeWidth="2" fill="none" />
            <path d="M 80 0 Q 100 140 130 220 T 200 400" stroke={theme.accentMuted} strokeWidth="2" fill="none" />
            <path d="M 400 0 Q 440 120 460 240 T 540 400" stroke={theme.accentMuted} strokeWidth="2" fill="none" />
            <path
              d="M 90 360 Q 200 320 280 280 T 440 180"
              stroke={`url(#dawa-route-${theme.key})`}
              strokeWidth="3"
              fill="none"
              strokeDasharray="8 6"
              className="dawa-inv-route"
            />
            <g transform="translate(90 360)">
              <circle r="10" fill={theme.bg} stroke={theme.accent} strokeWidth="2" />
              <circle r="3" fill={theme.accent} />
            </g>
            <g transform="translate(440 180)">
              <circle r="22" fill={theme.accentMuted}>
                <animate attributeName="r" values="18;30;18" dur="2.4s" repeatCount="indefinite" />
                <animate attributeName="opacity" values=".6;0;.6" dur="2.4s" repeatCount="indefinite" />
              </circle>
              <circle r="12" fill={`url(#dawa-route-${theme.key})`} stroke={theme.monoStops[0]} strokeWidth="2" />
              <text y="5" textAnchor="middle" fontWeight="900" fontSize="14" fill={ON_GOLD}>♛</text>
            </g>
          </svg>
        </div>
        <div className="dawa-inv-venue-info">
          {venueAddress && (
            <VenueRow icon="📍" label={lang === "he" ? "כתובת" : "العنوان"} theme={theme} font={font}>
              {venueAddress}
            </VenueRow>
          )}
          {accessNote && (
            <VenueRow icon="🚗" label={lang === "he" ? "הגעה" : "الوصول"} theme={theme} font={font}>
              {accessNote}
            </VenueRow>
          )}
          {hotels.length > 0 && (
            <VenueRow icon="🛏" label={lang === "he" ? "מלונות בקרבת מקום" : "فنادق قريبة"} theme={theme} font={font}>
              {hotels.map((h, i) => (
                <div key={i} style={{ display: "flex", justifyContent: "space-between", padding: "4px 0", fontSize: 14 }}>
                  <span>{h.name}</span>
                  {h.walk && <small style={{ color: theme.accent }}><Num dir="auto">{h.walk}</Num></small>}
                </div>
              ))}
            </VenueRow>
          )}
          <a className="dawa-inv-venue-row" href={mapsHref} target="_blank" rel="noreferrer" style={{ borderColor: theme.accentLine, textDecoration: "none" }}>
            <span className="dawa-inv-venue-ic" style={{ color: theme.accent }}>🗺</span>
            <div style={{ flex: 1 }}>
              <div className="dawa-inv-venue-label" style={{ color: theme.accent }}>{lang === "he" ? "ניווט" : "التوجيه"}</div>
              <div style={{ color: theme.accent, fontSize: 15, fontFamily: font.family }}>
                {lang === "he" ? "פתח ב‑Google Maps ←" : "افتح في خرائط جوجل ←"}
              </div>
            </div>
          </a>
        </div>
      </div>
    </section>
  );
}

function VenueRow({ icon, label, children, theme, font }) {
  return (
    <div className="dawa-inv-venue-row dawa-inv-reveal" style={{ borderColor: theme.accentLine }}>
      <span className="dawa-inv-venue-ic" style={{ color: theme.accent }}>{icon}</span>
      <div style={{ flex: 1 }}>
        <div className="dawa-inv-venue-label" style={{ color: theme.accent }}>{label}</div>
        <div className="dawa-inv-venue-val" style={{ color: theme.text, fontFamily: font.family }}>{children}</div>
      </div>
    </div>
  );
}

// ── Countdown ────────────────────────────────────────────────────────────────────
function useCountdown(target) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);
  const diff = Math.max(0, target - now);
  return {
    d: Math.floor(diff / 86400000),
    h: Math.floor((diff % 86400000) / 3600000),
    m: Math.floor((diff % 3600000) / 60000),
    s: Math.floor((diff % 60000) / 1000),
    reached: target - now <= 0,
  };
}

function CountdownCell({ value, label, theme, font }) {
  const [last, setLast] = useState(value);
  const [flip, setFlip] = useState(false);
  useEffect(() => {
    if (value !== last) {
      setFlip(true);
      const id = setTimeout(() => { setFlip(false); setLast(value); }, 500);
      return () => clearTimeout(id);
    }
  }, [value, last]);
  return (
    <div className="dawa-inv-cd-cell" style={{ "--line": theme.accentLine }}>
      <div
        className={`dawa-inv-cd-num dawa-inv-grad${flip ? " is-flip" : ""}`}
        style={{
          fontFamily: font.family,
          background: `linear-gradient(135deg,${theme.gradientStops.join(",")})`,
          WebkitBackgroundClip: "text",
          WebkitTextFillColor: "transparent",
        }}
      >
        {String(value).padStart(2, "0")}
      </div>
      <div className="dawa-inv-cd-lbl" style={{ color: theme.accent, fontFamily: font.family }}>{label}</div>
    </div>
  );
}

function CountdownSection({ weddingDate, theme, font, lang }) {
  const { d, h, m, s, reached } = useCountdown(weddingDate);
  return (
    <section className="dawa-inv-section">
      <SectionHead
        eyebrow={lang === "he" ? "ספירה לאחור" : "العدّ التنازلي"}
        title={lang === "he" ? "נשאר עד החתונה" : "باقي على يوم الفرح"}
        theme={theme}
        font={font}
      />
      {reached ? (
        <div style={{ textAlign: "center", padding: "20px 0" }}>
          <div style={{ fontSize: 56, marginBottom: 12 }}>🎊</div>
          <div style={{ color: theme.text, fontSize: 28, fontWeight: 900, fontFamily: font.family }}>
            {lang === "he" ? "היום החתונה!" : "اليوم الفرح!"}
          </div>
        </div>
      ) : (
        <div className="dawa-inv-countdown dawa-inv-reveal" style={{ borderColor: theme.accentLine, direction: "ltr" }}>
          <CountdownCell value={d} label={lang === "he" ? "ימים" : "يوم"} theme={theme} font={font} />
          <CountdownCell value={h} label={lang === "he" ? "שעות" : "ساعة"} theme={theme} font={font} />
          <CountdownCell value={m} label={lang === "he" ? "דקות" : "دقيقة"} theme={theme} font={font} />
          <CountdownCell value={s} label={lang === "he" ? "שניות" : "ثانية"} theme={theme} font={font} />
        </div>
      )}
    </section>
  );
}

// ── RSVP ────────────────────────────────────────────────────────────────────────
function confettiBurst(palette) {
  const root = document.createElement("div");
  root.className = "dawa-inv-confetti";
  document.body.appendChild(root);
  for (let i = 0; i < 80; i++) {
    const sp = document.createElement("span");
    const angle = Math.random() * Math.PI * 2;
    const dist = 220 + Math.random() * 280;
    sp.style.background = palette[i % palette.length];
    sp.style.setProperty("--x", `${Math.cos(angle) * dist}px`);
    sp.style.setProperty("--y", `${Math.sin(angle) * dist - 100}px`);
    sp.style.setProperty("--r", `${Math.random() * 720 - 360}deg`);
    sp.style.animationDelay = Math.random() * 0.2 + "s";
    root.appendChild(sp);
  }
  setTimeout(() => root.remove(), 1800);
}

// Lightweight client gate for the guest's phone. The backend re-validates and
// normalises strictly — this just blocks an obviously-bad submit. Accepts
// E.164 (+8–15 digits) or a local digits-only number (8–15 digits).
function isValidGuestPhone(raw) {
  const cleaned = (raw || "").replace(/[\s\-()]/g, "");
  if (!cleaned) return false;
  if (cleaned.startsWith("+")) return /^\+\d{8,15}$/.test(cleaned);
  return /^\d{8,15}$/.test(cleaned);
}

function RSVPSection({ theme, font, lang, opts, mealOptions, guestPhone, onSubmitRsvp, disabled, alreadyAnswered, rsvpDone }) {
  const [status, setStatus] = useState(null); // "attending" | "absent"
  // Total headcount INCLUDING the invited guest (min 1). The backend still
  // stores `companions` = partySize - 1 (people besides the guest), so all
  // existing "expected attendees" totals and validation stay correct.
  const [partySize, setPartySize] = useState(1);
  const [phone, setPhone] = useState(guestPhone || "");
  const [meal, setMeal] = useState("");
  const [song, setSong] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);
  const [hearts, setHearts] = useState([]);

  // Pre-fill the phone from the invite token, but let the guest correct it.
  useEffect(() => { setPhone(guestPhone || ""); }, [guestPhone]);

  const submit = async () => {
    if (!status) {
      setError(lang === "he" ? "אנא בחרו תשובה" : "يرجى اختيار إجابة");
      return;
    }
    const phoneClean = (phone || "").trim();
    if (!isValidGuestPhone(phoneClean)) {
      setError(lang === "he" ? "אנא הזינו מספר טלפון תקין" : "يرجى إدخال رقم هاتف صحيح");
      return;
    }
    setError("");
    if (disabled) return;
    setBusy(true);
    try {
      await onSubmitRsvp?.({
        rsvp: status,
        note: note.trim(),
        submittedPhone: phoneClean,
        companions: status === "attending" && opts.companions ? Math.max(0, partySize - 1) : null,
        mealPreference: status === "attending" && opts.meal ? meal : "",
        songRequest: status === "attending" && opts.song ? song.trim() : "",
      });
      setDone(true);
      if (status === "attending") {
        confettiBurst([
          theme.gradientStops[0], theme.gradientStops[1], theme.gradientStops[2],
          theme.accent, theme.monoStops[0], theme.monoStops[1],
        ]);
        const newH = Array.from({ length: 8 }, (_, i) => ({
          id: Date.now() + i,
          left: 40 + Math.random() * 20,
          hx: (Math.random() - 0.5) * 200,
          delay: i * 0.15,
        }));
        setHearts(newH);
        setTimeout(() => setHearts([]), 3500);
      }
    } catch (e) {
      setError(e?.message || (lang === "he" ? "שגיאה" : "خطأ"));
    } finally {
      setBusy(false);
    }
  };

  const showDone = done || rsvpDone;
  const successText = status === "absent"
    ? (lang === "he" ? "תודה שהודעת. נתראה בהזדמנות אחרת." : "نشكر إعلامكم، ونلتقي في مناسبة أخرى قريبة.")
    : (lang === "he"
      ? `שמחים לארח אתכם${opts.companions && partySize > 1 ? ` (${partySize} אורחים)` : ""}. תזכורת תישלח שבוע לפני.`
      : `سعداء بحضوركم${opts.companions && partySize > 1 ? ` (${partySize} أشخاص)` : ""}. سيصلكم تذكير قبل الموعد بأسبوع.`);

  return (
    <section className="dawa-inv-section" id="rsvp">
      <SectionHead
        eyebrow={lang === "he" ? "אישור הגעה" : "تأكيد الحضور"}
        title={lang === "he" ? "האם תכבדו אותנו?" : "هل ستشرّفوننا؟"}
        sub={lang === "he" ? "התשובה שלכם עוזרת לנו להכין כל פרט לערב מושלם." : "ردّكم يساعدنا في تجهيز كل التفاصيل لتكون الليلة كما تستحقّون."}
        theme={theme}
        font={font}
      />
      <div className="dawa-inv-rsvp dawa-inv-reveal" style={{ position: "relative" }}>
        {alreadyAnswered && !showDone ? (
          <div className="dawa-inv-rsvp-success">
            <div className="dawa-inv-seal" style={{ background: `radial-gradient(circle at 30% 30%, ${theme.gradientStops[1]} 0%, ${theme.accent} 65%)`, color: ON_GOLD }}>✓</div>
            <h3 className="dawa-inv-grad" style={{ fontFamily: font.family, background: `linear-gradient(135deg,${theme.gradientStops.join(",")})`, WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>
              {lang === "he" ? "כבר אישרת" : "تم تأكيد ردك"}
            </h3>
          </div>
        ) : showDone ? (
          <div className="dawa-inv-rsvp-success">
            <div className="dawa-inv-seal" style={{ background: `radial-gradient(circle at 30% 30%, ${theme.gradientStops[1]} 0%, ${theme.accent} 65%)`, color: ON_GOLD }}>✓</div>
            <h3 className="dawa-inv-grad" style={{ fontFamily: font.family, background: `linear-gradient(135deg,${theme.gradientStops.join(",")})`, WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>
              {status === "absent" ? (lang === "he" ? "תודה שהודעת" : "نشكر إعلامكم") : (lang === "he" ? "תודה רבה! נתראה" : "شكراً لكم! ننتظركم")}
            </h3>
            <p style={{ color: theme.textSoft, fontFamily: font.family }}>{successText}</p>
          </div>
        ) : (
          <>
            <div className="dawa-inv-field">
              <label style={{ color: theme.accent, fontFamily: font.family }}>{lang === "he" ? "האם תגיעו?" : "هل ستحضرون؟"}</label>
              <div className="dawa-inv-toggle" style={{ borderColor: theme.accentLine }}>
                <ToggleBtn theme={theme} font={font} active={status === "attending"} onClick={() => setStatus("attending")} label={lang === "he" ? "✓ אגיע" : "✓ سأحضر"} />
                <ToggleBtn theme={theme} font={font} active={status === "absent"} onClick={() => setStatus("absent")} label={lang === "he" ? "לצערי לא" : "للأسف لا"} />
              </div>
            </div>

            {status && (
              <div className="dawa-inv-field">
                <label style={{ color: theme.accent, fontFamily: font.family }}>{lang === "he" ? "מספר הטלפון שלך" : "رقم هاتفك"}</label>
                <input
                  className="dawa-inv-input"
                  style={{ color: theme.text, borderColor: theme.accentLine, fontFamily: font.family, direction: "ltr", textAlign: "start" }}
                  value={phone}
                  onChange={(e) => setPhone(e.target.value.slice(0, 30))}
                  placeholder="+972 5X-XXX-XXXX"
                  inputMode="tel"
                  dir="ltr"
                />
              </div>
            )}

            {status === "attending" && opts.companions && (
              <div className="dawa-inv-field">
                <label style={{ color: theme.accent, fontFamily: font.family }}>{lang === "he" ? "כמה אתם?" : "كم شخصاً انتم ؟"}</label>
                <div className="dawa-inv-stepper">
                  <button style={{ borderColor: theme.accentLine, color: theme.accent }} onClick={() => setPartySize((c) => Math.max(1, c - 1))} aria-label="-">−</button>
                  <span style={{ color: theme.text, fontFamily: font.family }}><Num>{partySize}</Num></span>
                  <button style={{ borderColor: theme.accentLine, color: theme.accent }} onClick={() => setPartySize((c) => Math.min(21, c + 1))} aria-label="+">+</button>
                </div>
              </div>
            )}

            {status === "attending" && opts.meal && mealOptions.length > 0 && (
              <div className="dawa-inv-field">
                <label style={{ color: theme.accent, fontFamily: font.family }}>{lang === "he" ? "העדפת מנה" : "تفضيل الطعام"}</label>
                <div className="dawa-inv-chips">
                  {mealOptions.map((opt) => (
                    <button
                      key={opt}
                      className={`dawa-inv-chip${meal === opt ? " is-on" : ""}`}
                      style={meal === opt
                        ? { color: ON_GOLD, background: `linear-gradient(135deg,${theme.gradientStops.join(",")})`, borderColor: "transparent" }
                        : { color: theme.textSoft, borderColor: theme.accentLine }}
                      onClick={() => setMeal(opt)}
                    >
                      {opt}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {status === "attending" && opts.song && (
              <div className="dawa-inv-field">
                <label style={{ color: theme.accent, fontFamily: font.family }}>{lang === "he" ? "שיר שתרצו שינוגן" : "أغنية تحبون أن تُعزَف"}</label>
                <input
                  className="dawa-inv-input"
                  style={{ color: theme.text, borderColor: theme.accentLine, fontFamily: font.family }}
                  value={song}
                  onChange={(e) => setSong(e.target.value.slice(0, 120))}
                  placeholder={lang === "he" ? "שם השיר והאמן..." : "اسم الأغنية والمطرب..."}
                  dir="auto"
                />
              </div>
            )}

            <div className="dawa-inv-field">
              <label style={{ color: theme.accent, fontFamily: font.family }}>{lang === "he" ? "ברכה לזוג" : "رسالة للعروسين"}</label>
              <textarea
                className="dawa-inv-input dawa-inv-textarea"
                style={{ color: theme.text, borderColor: theme.accentLine, fontFamily: font.family }}
                rows={3}
                value={note}
                onChange={(e) => setNote(e.target.value.slice(0, 500))}
                placeholder={lang === "he" ? "מזל טוב מראש..." : "مبروك مقدماً..."}
              />
            </div>

            {error && <div style={{ color: theme.rsvpAbsent, fontSize: 13, marginBottom: 12, textAlign: "center" }}>{error}</div>}

            <button
              className="dawa-inv-submit"
              style={{ color: ON_GOLD, background: `linear-gradient(135deg,${theme.gradientStops.join(",")})`, fontFamily: font.family, opacity: disabled ? 0.6 : 1 }}
              onClick={submit}
              disabled={busy || !status || disabled}
            >
              {busy ? (lang === "he" ? "שולח..." : "جاري الإرسال...") : `${lang === "he" ? "שלח את תשובתי" : "إرسال ردّي"} ←`}
            </button>
          </>
        )}

        <div className="dawa-inv-hearts">
          {hearts.map((h) => (
            <span key={h.id} style={{ left: h.left + "%", animationDelay: h.delay + "s", color: theme.accent, "--hx": h.hx + "px" }}>♥</span>
          ))}
        </div>
      </div>
    </section>
  );
}

// Guest-facing Arabic/Hebrew switch on the public invitation. Toggling drives
// the app `lang`, which re-renders both the built-in UI strings and every
// localized groom-authored field.
function LangToggle({ lang, setLang, theme, font }) {
  return (
    <div
      style={{
        position: "fixed",
        top: 14,
        insetInlineEnd: 14,
        zIndex: 120,
        display: "inline-flex",
        borderRadius: 999,
        overflow: "hidden",
        border: `1px solid ${theme.chipBorder}`,
        background: theme.chipBg,
        backdropFilter: "blur(20px)",
      }}
    >
      {[
        { code: "ar", label: "عربي" },
        { code: "he", label: "עברית" },
      ].map(({ code, label }) => (
        <button
          key={code}
          type="button"
          onClick={() => setLang(code)}
          aria-pressed={lang === code}
          style={{
            appearance: "none",
            border: "none",
            cursor: "pointer",
            padding: "7px 14px",
            fontSize: 12,
            fontWeight: 800,
            letterSpacing: 0.5,
            fontFamily: font.family,
            background: lang === code ? theme.accent : "transparent",
            color: lang === code ? ON_GOLD : theme.accent,
          }}
        >
          {label}
        </button>
      ))}
    </div>
  );
}

// Guest-facing "صورك" button in the top menu of the public invitation. Sits in
// the opposite top corner from the language toggle so together they read as a
// top bar. Navigation is owned by the route wrapper (passed as onClick).
function SorekButton({ lang, isPublic = true, onClick, theme, font }) {
  return (
    <button
      onClick={onClick}
      aria-label={lang === "he" ? "התמונות שלך" : "صورك"}
      style={{
        // Fixed on the real invite (floats as the guest scrolls); absolute in
        // the editor/admin preview so it sits inside the preview box, not the page.
        position: isPublic ? "fixed" : "absolute",
        top: 14,
        insetInlineStart: 14,
        zIndex: 120,
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        borderRadius: 999,
        padding: "7px 14px",
        cursor: "pointer",
        border: `1px solid ${theme.chipBorder}`,
        background: theme.chipBg,
        backdropFilter: "blur(20px)",
        color: theme.accent,
        fontSize: 12,
        fontWeight: 800,
        letterSpacing: 0.5,
        fontFamily: font.family,
      }}
    >
      <span aria-hidden="true">📸</span>
      {lang === "he" ? "התמונות שלך" : "صورك"}
    </button>
  );
}

function ToggleBtn({ theme, font, active, onClick, label }) {
  return (
    <button
      onClick={onClick}
      className="dawa-inv-toggle-btn"
      style={active
        ? { color: ON_GOLD, background: `linear-gradient(135deg,${theme.gradientStops.join(",")})`, borderColor: "transparent", fontFamily: font.family }
        : { color: theme.textSoft, borderColor: theme.accentLine, fontFamily: font.family }}
    >
      {label}
    </button>
  );
}

// ── Gift ──────────────────────────────────────────────────────────────────────
function GiftSection({ giftNote, giftIban, theme, font, lang }) {
  return (
    <section className="dawa-inv-section">
      <SectionHead
        eyebrow={lang === "he" ? "מתנה" : "هدية"}
        title={lang === "he" ? "נוכחותכם היא המתנה" : "حضوركم أجمل هدية"}
        theme={theme}
        font={font}
      />
      <div className="dawa-inv-rsvp" style={{ textAlign: "center" }}>
        {giftNote && <p style={{ color: theme.textSoft, fontSize: 15, lineHeight: 1.9, fontFamily: font.family, marginBottom: giftIban ? 18 : 0 }}>{giftNote}</p>}
        {giftIban && (
          <div style={{ color: theme.text, fontSize: 15, fontFamily: font.family, direction: "ltr", padding: "12px 0", borderTop: `1px solid ${theme.accentLine}` }}>
            <span style={{ color: theme.accent, fontSize: 11, letterSpacing: 2, textTransform: "uppercase", display: "block", marginBottom: 6 }}>IBAN</span>
            {giftIban}
          </div>
        )}
      </div>
    </section>
  );
}

// ── Guestbook ───────────────────────────────────────────────────────────────────
function GuestbookSection({ wishes, approvedWishes = [], onSubmitWish, theme, font, lang, disabled }) {
  const [who, setWho] = useState("");
  const [what, setWhat] = useState("");
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [err, setErr] = useState("");
  const [page, setPage] = useState(0);

  // Approved guest wishes (live) + the groom's authored wishes — all shown.
  const all = useMemo(() => {
    const guest = (approvedWishes || []).map((w) => ({ who: w.who, what: w.what }));
    return [...guest, ...(wishes || [])].filter((w) => w && (w.what || "").toString().trim());
  }, [approvedWishes, wishes]);

  // Carousel — 3 wishes at a time, auto-rotating every 5s.
  const PER = 3;
  const pageCount = Math.max(1, Math.ceil(all.length / PER));
  useEffect(() => { if (page >= pageCount) setPage(0); }, [pageCount, page]);
  useEffect(() => {
    if (pageCount <= 1) return undefined;
    const id = setInterval(() => setPage((p) => (p + 1) % pageCount), 5000);
    return () => clearInterval(id);
  }, [pageCount]);
  const shown = all.slice(page * PER, page * PER + PER);

  const submit = async () => {
    if (!who.trim() || !what.trim() || sending) return;
    setErr(""); setSending(true);
    try {
      await onSubmitWish?.({ who: who.trim(), what: what.trim() });
      setSent(true); setWho(""); setWhat("");
    } catch {
      setErr(lang === "he" ? "השליחה נכשלה — נסו שוב" : "تعذّر الإرسال — حاول مرة أخرى");
    } finally { setSending(false); }
  };

  return (
    <section className="dawa-inv-section">
      <SectionHead
        eyebrow={lang === "he" ? "ספר ברכות" : "دفتر التهاني"}
        title={lang === "he" ? "שתפו אותנו במילה" : "شاركونا كلمة"}
        sub={lang === "he" ? "הברכה שלכם תוצג לאחר אישור הזוג." : "رسالتك ستظهر بعد موافقة العروسين."}
        theme={theme}
        font={font}
      />
      <div className="dawa-inv-rsvp dawa-inv-reveal" style={{ marginBottom: 22 }}>
        {sent ? (
          <div style={{ textAlign: "center", padding: "18px 12px", color: theme.accent, fontFamily: font.family, fontWeight: 800, lineHeight: 1.8 }}>
            🌟 {lang === "he" ? "תודה! הברכה נשלחה וממתינה לאישור הזוג." : "شكراً! وصلت رسالتك وهي بانتظار موافقة العروسين."}
          </div>
        ) : (
          <>
            <div className="dawa-inv-field">
              <label style={{ color: theme.accent, fontFamily: font.family }}>{lang === "he" ? "השם שלך" : "اسمك"}</label>
              <input className="dawa-inv-input" style={{ color: theme.text, borderColor: theme.accentLine, fontFamily: font.family }} value={who} onChange={(e) => setWho(e.target.value.slice(0, 60))} placeholder={lang === "he" ? "למשל: מוחמד ע." : "مثل: محمد ع."} disabled={disabled} />
            </div>
            <div className="dawa-inv-field">
              <label style={{ color: theme.accent, fontFamily: font.family }}>{lang === "he" ? "הברכה שלך" : "رسالتك"}</label>
              <textarea className="dawa-inv-input dawa-inv-textarea" style={{ color: theme.text, borderColor: theme.accentLine, fontFamily: font.family }} rows={2} value={what} onChange={(e) => setWhat(e.target.value.slice(0, 300))} placeholder={lang === "he" ? "מילה מהלב..." : "كلمة من القلب..."} disabled={disabled} />
            </div>
            {err && <div style={{ color: theme.rsvpAbsent || "#d4533a", fontSize: 12, marginBottom: 8, fontFamily: font.family }}>{err}</div>}
            <button
              className="dawa-inv-submit"
              style={{ color: ON_GOLD, background: `linear-gradient(135deg,${theme.gradientStops.join(",")})`, fontFamily: font.family, opacity: (disabled || sending) ? 0.6 : 1 }}
              onClick={submit}
              disabled={disabled || sending || !who.trim() || !what.trim()}
            >
              {sending ? "…" : (lang === "he" ? "שלח ברכה" : "أرسل رسالتي")}
            </button>
          </>
        )}
      </div>
      {all.length > 0 && (
        <>
          <div className="dawa-inv-wishes" key={page} style={{ animation: "dawa-inv-rise .6s ease both" }}>
            {shown.map((w, i) => (
              <div key={i} className="dawa-inv-wish" style={{ borderColor: theme.accentLine }}>
                <div className="dawa-inv-wish-who" style={{ color: theme.accent, fontFamily: font.family }}>— {w.who}</div>
                <div className="dawa-inv-wish-what" style={{ color: theme.text, fontFamily: font.family }}>{w.what}</div>
              </div>
            ))}
          </div>
          {pageCount > 1 && (
            <div style={{ display: "flex", justifyContent: "center", gap: 7, marginTop: 18 }}>
              {Array.from({ length: pageCount }).map((_, i) => (
                <span key={i} onClick={() => setPage(i)} aria-hidden="true" style={{
                  width: 7, height: 7, borderRadius: "50%", cursor: "pointer",
                  background: i === page ? theme.accent : theme.accentLine, transition: "background .3s",
                }} />
              ))}
            </div>
          )}
        </>
      )}
    </section>
  );
}

// ── Footer ──────────────────────────────────────────────────────────────────────
function InviteFooter({ theme, font, lang }) {
  return (
    <footer className="dawa-inv-foot">
      <div className="dawa-inv-foot-flourish">
        <FloralFlourish theme={theme} width={210} />
      </div>
      <div
        className="dawa-inv-foot-mark dawa-inv-grad"
        style={{ fontFamily: font.family, background: `linear-gradient(135deg,${theme.gradientStops.join(",")})`, WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}
      >
        {lang === "he" ? "דעוה" : "دعوة"}
      </div>
      <div className="dawa-inv-foot-tag" style={{ color: theme.accent, fontFamily: font.family }}>
        {lang === "he" ? "— הזמנה דיגיטלית · נעשה באהבה —" : "— بطاقة دعوة رقمية · صُنعت بحبّ —"}
      </div>
    </footer>
  );
}

// ── Floating action dock ──────────────────────────────────────────────────────
function FloatingDock({ theme, lang, fixed, weddingDate, groomName, brideName, venue, venueAddress, showMusic, musicUrl }) {
  const audioRef = useRef(null);
  const [playing, setPlaying] = useState(false);

  const share = async () => {
    const url = window.location.href;
    if (navigator.share) {
      try { await navigator.share({ title: lang === "he" ? "הזמנה לחתונה" : "دعوة زفاف", url }); } catch { /* dismissed */ }
    } else if (navigator.clipboard) {
      try { await navigator.clipboard.writeText(url); } catch { /* ignored */ }
    }
  };
  const addToCalendar = () => {
    if (!weddingDate) return;
    const dt = new Date(weddingDate);
    const fmt = (d) => d.toISOString().replace(/[-:]/g, "").split(".")[0] + "Z";
    const summary = [groomName, brideName].filter(Boolean).join(" & ") || "Wedding";
    const ics = [
      "BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Dawa//Invitation//AR", "BEGIN:VEVENT",
      `UID:dawa-${weddingDate}@dawa.app`,
      `DTSTAMP:${fmt(new Date())}`,
      `DTSTART:${fmt(dt)}`,
      `DTEND:${fmt(new Date(dt.getTime() + 5 * 3600 * 1000))}`,
      `SUMMARY:${summary}`,
      `LOCATION:${[venue, venueAddress].filter(Boolean).join(", ")}`,
      "END:VEVENT", "END:VCALENDAR",
    ].join("\n");
    const blob = new Blob([ics], { type: "text/calendar" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "dawa-invitation.ics";
    document.body.appendChild(a); a.click(); a.remove();
  };
  const toggleMusic = () => {
    const el = audioRef.current;
    if (!el) return;
    if (playing) { el.pause(); setPlaying(false); }
    else { el.play().then(() => setPlaying(true)).catch(() => {}); }
  };

  const btnStyle = { borderColor: theme.accentLine, color: theme.accent };
  return (
    <div className="dawa-inv-dock" style={{ position: fixed ? "fixed" : "absolute" }}>
      {showMusic && (
        <>
          <button className={`dawa-inv-dock-btn${playing ? " is-on" : ""}`} style={playing ? { background: `linear-gradient(135deg,${theme.gradientStops.join(",")})`, color: ON_GOLD, borderColor: "transparent" } : btnStyle} onClick={toggleMusic} aria-label="music">
            {playing ? "♫" : "♪"}
            {playing && <span className="dawa-inv-dock-pulse" style={{ borderColor: theme.accent }} />}
          </button>
          <audio ref={audioRef} src={musicUrl} loop preload="none" />
        </>
      )}
      <button className="dawa-inv-dock-btn" style={btnStyle} onClick={share} aria-label="share">⤴</button>
      {weddingDate && <button className="dawa-inv-dock-btn" style={btnStyle} onClick={addToCalendar} aria-label="calendar">📅</button>}
    </div>
  );
}

// ── Envelope intro ────────────────────────────────────────────────────────────
function EnvelopeIntro({ guestName, font, lang }) {
  const [opened, setOpened] = useState(() => {
    try { return localStorage.getItem("dawa-invite-opened") === "1"; } catch { return false; }
  });
  const [opening, setOpening] = useState(false);
  const onOpen = () => {
    if (opening) return;
    setOpening(true);
    try { localStorage.setItem("dawa-invite-opened", "1"); } catch { /* ignore */ }
    setTimeout(() => setOpened(true), 1100);
  };
  if (opened) return null;
  return (
    <div className={`dawa-inv-env-overlay${opening ? " is-opening" : ""}`} role="dialog" aria-label="invitation">
      <div className="dawa-inv-env" role="button" tabIndex={0} onClick={onOpen} onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && onOpen()}>
        <div className="dawa-inv-wax" aria-hidden="true">د</div>
      </div>
      <div className="dawa-inv-env-hint">— {lang === "he" ? "לחץ לפתיחת ההזמנה" : "اضغط لفتح الدعوة"} —</div>
      {guestName && <div className="dawa-inv-env-name dawa-inv-grad" style={{ fontFamily: font.family }}>{guestName}</div>}
    </div>
  );
}

// ── Ambient petals + sparkles ───────────────────────────────────────────────────
function Ambience({ theme, fixed }) {
  const petals = useMemo(() => Array.from({ length: 18 }, () => ({
    left: Math.random() * 100,
    dur: 15 + Math.random() * 14,
    delay: Math.random() * 18,
    size: 11 + Math.random() * 9,
  })), []);
  const sparkles = useMemo(() => Array.from({ length: 34 }, () => ({
    top: Math.random() * 100,
    left: Math.random() * 100,
    dur: 2.4 + Math.random() * 3.2,
    delay: Math.random() * 5,
    size: 1.5 + Math.random() * 2.4,
  })), []);
  const pos = fixed ? "fixed" : "absolute";
  const blob = `radial-gradient(circle, ${theme.accent} 0%, transparent 68%)`;
  return (
    <>
      {/* Living aurora — slow-drifting soft gold light gives the whole page depth */}
      <div className="dawa-inv-aurora" style={{ position: pos }} aria-hidden="true">
        <span className="dawa-inv-aurora-blob a1" style={{ background: blob }} />
        <span className="dawa-inv-aurora-blob a2" style={{ background: blob }} />
        <span className="dawa-inv-aurora-blob a3" style={{ background: blob }} />
      </div>
      <div className="dawa-inv-petals" style={{ position: pos }} aria-hidden="true">
        {petals.map((p, i) => (
          <span key={i} className="dawa-inv-petal" style={{ left: `${p.left}%`, width: p.size, height: p.size, animationDuration: `${p.dur}s`, animationDelay: `${p.delay}s`, background: theme.petal }} />
        ))}
      </div>
      <div className="dawa-inv-sparkles" style={{ position: pos }} aria-hidden="true">
        {sparkles.map((s, i) => (
          <span key={i} className="dawa-inv-sparkle" style={{ top: `${s.top}%`, left: `${s.left}%`, width: s.size, height: s.size, animationDuration: `${s.dur}s`, animationDelay: `${s.delay}s`, background: theme.sparkle, boxShadow: `0 0 ${(4 + s.size * 2.5).toFixed(0)}px ${theme.sparkleGlow}` }} />
        ))}
      </div>
    </>
  );
}

// ── Scoped styles (all under .dawa-inv so other surfaces are untouched) ─────────
function ViewStyles({ theme, fixed }) {
  return (
    <style>{`
    .dawa-inv ::selection { background: ${theme.accentMuted}; }

    /* Faint damask lattice — a barely-there ornamental texture over the whole
     * invitation. Tinted with the live accent so it adapts to every palette; kept
     * at ~4% so it reads as luxury paper grain, never noise. Robust everywhere
     * (a tiled background image — no clip/mask tricks that mis-render in-app). */
    .dawa-inv::before {
      content: "";
      position: ${fixed ? "fixed" : "absolute"};
      inset: 0;
      z-index: 0;
      pointer-events: none;
      opacity: .045;
      background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='72' height='72' viewBox='0 0 72 72'%3E%3Cg fill='none' stroke='${encodeURIComponent(theme.accent)}' stroke-width='1.1'%3E%3Cpath d='M36 10 L50 36 L36 62 L22 36 Z'/%3E%3Ccircle cx='36' cy='36' r='3.4'/%3E%3Cpath d='M36 0 L36 8 M36 64 L36 72 M0 36 L8 36 M64 36 L72 36'/%3E%3C/g%3E%3C/svg%3E");
      background-size: 72px 72px;
    }

    .dawa-inv .dawa-inv-reveal { opacity: 0; transform: translateY(40px); transition: opacity .9s cubic-bezier(.2,.7,.2,1), transform .9s cubic-bezier(.2,.7,.2,1); }
    .dawa-inv .dawa-inv-reveal.is-in { opacity: 1; transform: none; }

    /* Headings / names: SOLID high-contrast color, not background-clip:text.
     * The clip trick (gradient bg + transparent fill) renders as an unreadable
     * solid BLOCK on several mobile / in-app browsers (Samsung Internet, older
     * Android WebView, some iOS in-app views) that report support but mis-render
     * it — and those are exactly where guests open the WhatsApp invite link.
     * theme.text equals the gradient's brightest stop on every dark theme, so
     * this is visually near-identical yet always readable. !important overrides
     * the per-element inline gradient styles (background + transparent fill). */
    .dawa-inv .dawa-inv-grad {
      background: none !important;
      -webkit-text-fill-color: ${theme.text} !important;
      color: ${theme.text} !important;
    }

    /* Section shell */
    .dawa-inv .dawa-inv-section { position: relative; padding: 96px 24px; max-width: 1080px; margin: 0 auto; z-index: 6; }
    .dawa-inv .dawa-inv-eyebrow { font-size: 11.5px; letter-spacing: 4px; text-transform: uppercase; font-style: italic; display: inline-flex; align-items: center; gap: 14px; margin-bottom: 16px; }
    .dawa-inv .dawa-inv-title { font-weight: 900; font-size: clamp(30px,5vw,48px); line-height: 1.35; margin-bottom: 16px; padding-block: 6px; }
    .dawa-inv .dawa-inv-sub { font-style: italic; font-size: 14px; max-width: 540px; margin: 0 auto; line-height: 1.85; }
    .dawa-inv .dawa-inv-secflourish { margin-bottom: 14px; opacity: .9; }
    .dawa-inv .dawa-inv-secrule { display: flex; align-items: center; justify-content: center; gap: 9px; width: 132px; margin: 4px auto 16px; }
    .dawa-inv .dawa-inv-secrule > span { height: 1px; flex: 1; }
    .dawa-inv .dawa-inv-secrule .dawa-inv-secrule-dot { flex: 0 0 auto; width: 5px; height: 5px; transform: rotate(45deg); }

    /* Hero */
    .dawa-inv .dawa-inv-hero { position: relative; min-height: 100vh; display: flex; flex-direction: column; align-items: center; justify-content: center; text-align: center; padding: 60px 24px; overflow: hidden; z-index: 6; }
    .dawa-inv .dawa-inv-hero-glow { position: absolute; inset: 0; pointer-events: none; }
    /* Gold filigree frame inset on the hero — thin border + heavier corner
     * brackets for an engraved-invitation feel. Perimeter only, never over text. */
    .dawa-inv .dawa-inv-hero-frame { position: absolute; inset: 16px; border: 1px solid; border-radius: 16px; pointer-events: none; opacity: .4; animation: dawa-inv-frame 1.6s .3s ease both; }
    .dawa-inv .dawa-inv-corner { position: absolute; width: 28px; height: 28px; border-style: solid; border-width: 0; opacity: .9; }
    .dawa-inv .dawa-inv-corner-tl { top: -1px; inset-inline-start: -1px; border-top-width: 2px; border-inline-start-width: 2px; border-start-start-radius: 16px; }
    .dawa-inv .dawa-inv-corner-tr { top: -1px; inset-inline-end: -1px; border-top-width: 2px; border-inline-end-width: 2px; border-start-end-radius: 16px; }
    .dawa-inv .dawa-inv-corner-bl { bottom: -1px; inset-inline-start: -1px; border-bottom-width: 2px; border-inline-start-width: 2px; border-end-start-radius: 16px; }
    .dawa-inv .dawa-inv-corner-br { bottom: -1px; inset-inline-end: -1px; border-bottom-width: 2px; border-inline-end-width: 2px; border-end-end-radius: 16px; }
    @keyframes dawa-inv-frame { from { opacity: 0; transform: scale(1.03); } to { opacity: .4; transform: none; } }
    .dawa-inv .dawa-inv-hero-eyebrow { position: relative; font-size: 13px; letter-spacing: 4px; text-transform: uppercase; font-style: italic; margin-bottom: 24px; display: inline-flex; align-items: center; gap: 14px; animation: dawa-inv-rise .9s ease both; }
    .dawa-inv .dawa-inv-monogram { width: 170px; height: 170px; margin: 0 auto 28px; position: relative; display: flex; align-items: center; justify-content: center; animation: dawa-inv-rise 1.1s .15s cubic-bezier(.17,.67,.35,1.4) both; }
    .dawa-inv .dawa-inv-monogram svg { width: 100%; height: 100%; position: absolute; inset: 0; }
    .dawa-inv .dawa-inv-crown { animation: dawa-inv-rise 1s .35s cubic-bezier(.2,.7,.2,1) both; }
    .dawa-inv .dawa-inv-crown-gem { animation: dawa-inv-twinkle 2.6s ease-in-out infinite; }
    @keyframes dawa-inv-twinkle { 0%,100% { opacity: 1; } 50% { opacity: .5; } }
    .dawa-inv .dawa-inv-monogram-letters { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; font-weight: 900; font-size: 56px; line-height: 1.4; padding-block: 8px; }
    .dawa-inv .dawa-inv-couple { font-weight: 900; font-size: clamp(48px,9vw,96px); line-height: 1.25; margin: 8px 0; padding-block: 8px; text-shadow: 0 0 80px ${theme.accentMuted}; animation: dawa-inv-rise 1.1s .3s cubic-bezier(.2,.7,.2,1) both; }
    .dawa-inv .dawa-inv-amp { display: block; font-style: italic; font-size: clamp(28px,6vw,52px); margin: 6px 0; opacity: .8; padding-block: 4px; animation: dawa-inv-rise 1.1s .4s ease both; }
    .dawa-inv .dawa-inv-dateline { display: inline-flex; align-items: center; gap: 16px; margin-top: 28px; padding: 12px 28px; border-radius: 999px; backdrop-filter: blur(20px); font-size: 16px; letter-spacing: .5px; animation: dawa-inv-rise 1.1s .5s ease both; flex-wrap: wrap; justify-content: center; box-shadow: 0 12px 36px -14px ${theme.accentMuted}, inset 0 0 0 1px ${theme.accentLine}; }
    .dawa-inv .dawa-inv-dot { width: 4px; height: 4px; border-radius: 50%; }
    .dawa-inv .dawa-inv-greet { margin-top: 26px; font-style: italic; font-size: clamp(19px,3.4vw,28px); letter-spacing: 1px; line-height: 1.5; animation: dawa-inv-rise 1.1s .6s ease both; }
    .dawa-inv .dawa-inv-greet strong { display: block; margin-top: 12px; font-style: normal; font-weight: 900; font-size: clamp(34px,7.5vw,52px); line-height: 1.2; letter-spacing: .5px; padding-block: 4px; text-shadow: 0 0 60px ${theme.accentMuted}; }
    .dawa-inv .dawa-inv-hero-media { margin-top: 30px; width: 100%; max-width: 440px; display: grid; gap: 14px; animation: dawa-inv-rise 1.1s .7s ease both; }
    .dawa-inv .dawa-inv-hero-media-item { border: 1px solid; border-radius: 16px; overflow: hidden; background: ${theme.cardBg}; }
    .dawa-inv .dawa-inv-hero-media-item img, .dawa-inv .dawa-inv-hero-media-item video { width: 100%; display: block; max-height: 56vh; object-fit: cover; }
    .dawa-inv .dawa-inv-cue { position: absolute; bottom: 28px; left: 50%; transform: translateX(-50%); display: flex; flex-direction: column; align-items: center; gap: 10px; font-size: 11px; font-style: italic; letter-spacing: 3px; text-transform: uppercase; opacity: .7; animation: dawa-inv-cue 2.4s ease-in-out infinite; }
    .dawa-inv .dawa-inv-cue-line { width: 1px; height: 34px; }

    /* Story timeline */
    .dawa-inv .dawa-inv-timeline { position: relative; padding: 20px 0; }
    .dawa-inv .dawa-inv-timeline::before { content: ""; position: absolute; left: 50%; top: 0; bottom: 0; width: 1px; background: linear-gradient(180deg, transparent, var(--line) 15%, var(--line) 85%, transparent); }
    .dawa-inv .dawa-inv-story { position: relative; width: calc(50% - 56px); padding: 8px 4px; margin-bottom: 52px; }
    .dawa-inv .dawa-inv-story.is-left { margin-inline-start: auto; padding-inline-start: 32px; }
    .dawa-inv .dawa-inv-story.is-right { margin-inline-end: auto; padding-inline-end: 32px; }
    .dawa-inv .dawa-inv-story-node { position: absolute; top: 14px; width: 9px; height: 9px; border-radius: 50%; }
    .dawa-inv .dawa-inv-story.is-left .dawa-inv-story-node { left: -60px; }
    .dawa-inv .dawa-inv-story.is-right .dawa-inv-story-node { right: -60px; }
    .dawa-inv .dawa-inv-story-icon { font-size: 22px; margin-bottom: 12px; opacity: .9; }
    .dawa-inv .dawa-inv-story-when { font-style: italic; font-size: 10.5px; letter-spacing: 3px; text-transform: uppercase; margin-bottom: 10px; opacity: .85; }
    .dawa-inv .dawa-inv-story-title { font-weight: 700; font-size: 25px; margin-bottom: 12px; line-height: 1.45; padding-block: 3px; }
    .dawa-inv .dawa-inv-story-body { font-size: 14px; line-height: 1.95; max-width: 40ch; }
    @media (max-width: 700px) {
      .dawa-inv .dawa-inv-timeline::before { left: 12px; }
      .dawa-inv .dawa-inv-story { width: calc(100% - 36px); margin-inline-start: 36px !important; margin-inline-end: 0 !important; padding-inline-start: 0 !important; padding-inline-end: 0 !important; }
      .dawa-inv .dawa-inv-story-node { left: -29px !important; right: auto !important; }
    }

    /* Gallery */
    .dawa-inv .dawa-inv-gallery { columns: 3 240px; column-gap: 18px; }
    .dawa-inv .dawa-inv-gallery-item { position: relative; break-inside: avoid; margin-bottom: 18px; border-radius: 12px; overflow: hidden; cursor: pointer; transition: transform .55s cubic-bezier(.2,.95,.25,1.1); }
    .dawa-inv .dawa-inv-gallery-item:hover { transform: translateY(-4px); }
    .dawa-inv .dawa-inv-gallery-item img, .dawa-inv .dawa-inv-gallery-item video { width: 100%; display: block; border-radius: 12px; transition: transform 1s cubic-bezier(.2,.7,.2,1); }
    .dawa-inv .dawa-inv-gallery-item:hover img { transform: scale(1.04); }
    .dawa-inv .dawa-inv-gallery-cap { position: absolute; bottom: 0; left: 0; right: 0; padding: 14px; font-style: italic; font-size: 12.5px; color: #fbf6e8; background: linear-gradient(180deg, transparent, rgba(7,7,10,.82)); opacity: 0; transform: translateY(6px); transition: opacity .35s, transform .45s; }
    .dawa-inv .dawa-inv-gallery-item:hover .dawa-inv-gallery-cap { opacity: 1; transform: none; }
    .dawa-inv .dawa-inv-lightbox { position: fixed; inset: 0; z-index: 999; background: rgba(7,7,10,.92); backdrop-filter: blur(20px); display: flex; align-items: center; justify-content: center; padding: 32px; opacity: 0; pointer-events: none; transition: opacity .5s; }
    .dawa-inv .dawa-inv-lightbox.is-open { opacity: 1; pointer-events: all; }
    .dawa-inv .dawa-inv-lightbox img { max-width: 90%; max-height: 86vh; border-radius: 12px; }
    .dawa-inv .dawa-inv-lightbox-close { position: absolute; top: 20px; inset-inline-end: 20px; width: 44px; height: 44px; border-radius: 50%; background: transparent; border: 1px solid; font-size: 20px; cursor: pointer; transition: transform .3s; }
    .dawa-inv .dawa-inv-lightbox-close:hover { transform: rotate(90deg); }

    /* Details */
    .dawa-inv .dawa-inv-details { display: grid; gap: 56px 40px; grid-template-columns: repeat(auto-fit, minmax(230px, 1fr)); }
    .dawa-inv .dawa-inv-detail { transition: transform .5s cubic-bezier(.2,.95,.25,1.1); }
    .dawa-inv .dawa-inv-detail:hover { transform: translateY(-3px); }
    .dawa-inv .dawa-inv-detail-icon { font-size: 28px; margin-bottom: 16px; opacity: .9; }
    .dawa-inv .dawa-inv-detail-meta { font-size: 10.5px; letter-spacing: 2.8px; text-transform: uppercase; margin-bottom: 12px; font-weight: 700; opacity: .85; }
    .dawa-inv .dawa-inv-detail-title { font-weight: 700; font-size: 22px; margin-bottom: 12px; line-height: 1.45; padding-block: 3px; }
    .dawa-inv .dawa-inv-detail-body { font-size: 14px; line-height: 1.95; max-width: 36ch; }

    /* Venue */
    .dawa-inv .dawa-inv-venue { display: grid; grid-template-columns: 1.2fr 1fr; gap: 32px; align-items: stretch; }
    .dawa-inv .dawa-inv-venue-map { position: relative; border: 1px solid; border-radius: 14px; overflow: hidden; min-height: 360px; background: ${theme.cardBg}; }
    .dawa-inv .dawa-inv-route { stroke-dashoffset: 200; animation: dawa-inv-route 4s linear infinite; }
    .dawa-inv .dawa-inv-venue-info { display: flex; flex-direction: column; }
    .dawa-inv .dawa-inv-venue-row { display: flex; align-items: flex-start; gap: 18px; padding: 20px 0; border-bottom: 1px solid; transition: transform .35s; }
    .dawa-inv .dawa-inv-venue-row:hover { transform: translateX(-3px); }
    .dawa-inv .dawa-inv-venue-ic { width: 30px; flex-shrink: 0; display: flex; align-items: center; justify-content: center; font-size: 22px; opacity: .9; }
    .dawa-inv .dawa-inv-venue-label { font-size: 10px; letter-spacing: 2.8px; text-transform: uppercase; font-weight: 700; margin-bottom: 6px; opacity: .85; }
    .dawa-inv .dawa-inv-venue-val { font-size: 16px; line-height: 1.55; }
    @media (max-width: 760px) { .dawa-inv .dawa-inv-venue { grid-template-columns: 1fr; } }

    /* Countdown */
    .dawa-inv .dawa-inv-countdown { display: grid; grid-template-columns: repeat(4,1fr); max-width: 760px; margin: 0 auto; border-block: 1px solid; padding: 26px 0; }
    .dawa-inv .dawa-inv-cd-cell { position: relative; padding: 8px 12px; text-align: center; }
    .dawa-inv .dawa-inv-cd-cell + .dawa-inv-cd-cell { border-inline-start: 1px solid var(--line); }
    .dawa-inv .dawa-inv-cd-num { font-weight: 900; font-size: clamp(40px,8vw,72px); line-height: 1.35; font-variant-numeric: tabular-nums; margin-bottom: 10px; display: inline-block; padding-block: 6px; }
    .dawa-inv .dawa-inv-cd-num.is-flip { animation: dawa-inv-flip .65s cubic-bezier(.2,.95,.25,1.1); }
    .dawa-inv .dawa-inv-cd-lbl { font-style: italic; font-size: 11px; letter-spacing: 3px; text-transform: uppercase; opacity: .9; }

    /* RSVP + guestbook cards */
    .dawa-inv .dawa-inv-rsvp { max-width: 580px; margin: 0 auto; }
    .dawa-inv .dawa-inv-field { margin-bottom: 22px; }
    .dawa-inv .dawa-inv-field label { display: block; font-style: italic; font-size: 11px; letter-spacing: 2.8px; text-transform: uppercase; margin-bottom: 12px; opacity: .9; }
    .dawa-inv .dawa-inv-toggle { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; border-bottom: 1px solid; padding-bottom: 16px; }
    .dawa-inv .dawa-inv-toggle-btn { border: 1px solid; background: transparent; cursor: pointer; padding: 12px 14px; border-radius: 999px; font-weight: 700; font-size: 14px; transition: all .35s cubic-bezier(.2,.95,.25,1.1); }
    .dawa-inv .dawa-inv-input { width: 100%; padding: 12px 0; background: transparent; border: none; border-bottom: 1px solid; border-radius: 0; font-size: 15px; outline: none; transition: border-color .25s; }
    .dawa-inv .dawa-inv-input::placeholder { opacity: .4; }
    .dawa-inv .dawa-inv-textarea { resize: none; line-height: 1.6; min-height: 70px; }
    .dawa-inv .dawa-inv-chips { display: flex; gap: 8px; flex-wrap: wrap; }
    .dawa-inv .dawa-inv-chip { padding: 8px 16px; border-radius: 999px; background: transparent; border: 1px solid; font-size: 12.5px; font-weight: 600; cursor: pointer; transition: all .3s cubic-bezier(.2,.95,.25,1.1); font-family: inherit; }
    .dawa-inv .dawa-inv-chip:hover { transform: translateY(-1px); }
    .dawa-inv .dawa-inv-stepper { display: inline-flex; align-items: center; gap: 18px; }
    .dawa-inv .dawa-inv-stepper button { width: 36px; height: 36px; border-radius: 50%; border: 1px solid; background: transparent; font-size: 18px; font-weight: 700; cursor: pointer; transition: all .25s cubic-bezier(.2,.95,.25,1.1); }
    .dawa-inv .dawa-inv-stepper button:hover { transform: scale(1.08); }
    .dawa-inv .dawa-inv-stepper span { font-weight: 800; font-size: 22px; min-width: 28px; text-align: center; }
    .dawa-inv .dawa-inv-submit { width: 100%; margin-top: 14px; padding: 16px 28px; border: none; border-radius: 999px; font-size: 14px; font-weight: 800; cursor: pointer; letter-spacing: .5px; box-shadow: inset 0 1px 0 rgba(255,255,255,.45), 0 14px 32px -10px ${theme.accentMuted}; transition: transform .25s cubic-bezier(.2,.95,.25,1.1), box-shadow .35s; }
    .dawa-inv .dawa-inv-submit:hover:not(:disabled) { transform: translateY(-2px); }
    .dawa-inv .dawa-inv-submit:disabled { opacity: .5; cursor: not-allowed; }
    .dawa-inv .dawa-inv-rsvp-success { text-align: center; padding: 20px 0; animation: dawa-inv-rise .8s cubic-bezier(.2,.95,.25,1.1) both; }
    .dawa-inv .dawa-inv-seal { width: 86px; height: 86px; margin: 0 auto 20px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 36px; font-weight: 900; box-shadow: inset 0 2px 4px rgba(255,255,255,.4), 0 14px 36px ${theme.accentMuted}; animation: dawa-inv-seal 1s cubic-bezier(.2,.95,.25,1.1) both; }
    .dawa-inv .dawa-inv-rsvp-success h3 { font-weight: 700; font-size: 28px; margin-bottom: 12px; line-height: 1.4; padding-block: 4px; }
    .dawa-inv .dawa-inv-rsvp-success p { font-size: 14px; line-height: 1.9; }

    /* Guestbook list */
    .dawa-inv .dawa-inv-wishes { display: grid; max-width: 640px; margin: 0 auto; }
    .dawa-inv .dawa-inv-wish { padding: 26px 0; border-bottom: 1px solid; transition: transform .35s; }
    .dawa-inv .dawa-inv-wish:first-child { padding-top: 0; }
    .dawa-inv .dawa-inv-wish:last-child { border-bottom: none; }
    .dawa-inv .dawa-inv-wish:hover { transform: translateX(-2px); }
    .dawa-inv .dawa-inv-wish-who { font-style: italic; font-size: 11px; letter-spacing: 2.8px; text-transform: uppercase; margin-bottom: 10px; opacity: .85; }
    .dawa-inv .dawa-inv-wish-what { font-size: 16px; line-height: 1.8; }

    /* Footer */
    .dawa-inv .dawa-inv-foot { padding: 64px 24px 96px; text-align: center; position: relative; z-index: 6; }
    .dawa-inv .dawa-inv-foot-flourish { margin-bottom: 16px; opacity: .92; }
    .dawa-inv .dawa-inv-foot-mark { font-weight: 900; font-size: 38px; margin-bottom: 12px; padding-block: 6px; }
    .dawa-inv .dawa-inv-foot-tag { font-size: 11px; letter-spacing: 3px; text-transform: uppercase; font-style: italic; opacity: .85; }

    /* Brand logo crown + floral flourish */
    .dawa-inv .dawa-inv-hero-logo { margin-bottom: 10px; animation: dawa-inv-rise .8s ease both, dawa-inv-float 6s ease-in-out 1.4s infinite; }
    .dawa-inv .dawa-inv-flourish { display: block; }
    .dawa-inv .dawa-inv-hero-flourish { position: relative; margin-bottom: 16px; animation: dawa-inv-rise .9s .1s ease both; opacity: .92; }
    @keyframes dawa-inv-float { 0%,100% { transform: translateY(0); } 50% { transform: translateY(-6px); } }

    /* Floating dock */
    .dawa-inv .dawa-inv-dock { bottom: 22px; inset-inline-end: 22px; display: flex; flex-direction: column; gap: 8px; z-index: 100; }
    .dawa-inv .dawa-inv-dock-btn { width: 46px; height: 46px; border-radius: 50%; background: rgba(7,7,10,.5); border: 1px solid; font-size: 18px; cursor: pointer; backdrop-filter: blur(20px); display: flex; align-items: center; justify-content: center; position: relative; transition: all .35s cubic-bezier(.2,.95,.25,1.1); }
    .dawa-inv .dawa-inv-dock-btn:hover { transform: scale(1.06); }
    .dawa-inv .dawa-inv-dock-pulse { position: absolute; inset: -2px; border-radius: 50%; border: 1px solid; animation: dawa-inv-dockpulse 1.8s ease-out infinite; }

    /* Envelope */
    .dawa-inv .dawa-inv-env-overlay { position: fixed; inset: 0; z-index: 1000; background: radial-gradient(ellipse 80% 60% at 50% 35%, ${theme.accentMuted}, transparent 60%), ${theme.bg}; display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 32px; transition: opacity 1.2s, transform 1.4s cubic-bezier(.2,.95,.25,1.1); }
    .dawa-inv .dawa-inv-env-overlay.is-opening { opacity: 0; transform: scale(1.05); pointer-events: none; }
    .dawa-inv .dawa-inv-env { position: relative; width: 320px; max-width: 80vw; aspect-ratio: 1.5/1; border-radius: 14px; cursor: pointer; background: ${theme.cardBg}; border: 1px solid ${theme.accentLine}; box-shadow: 0 30px 80px -20px rgba(0,0,0,.7), 0 0 60px ${theme.accentMuted}; transition: transform .6s cubic-bezier(.2,.95,.25,1.1); }
    .dawa-inv .dawa-inv-env:hover { transform: translateY(-6px) scale(1.02); }
    .dawa-inv .dawa-inv-wax { position: absolute; top: 50%; left: 50%; transform: translate(-50%,-50%); width: 86px; height: 86px; border-radius: 50%; background: radial-gradient(circle at 30% 30%, ${theme.gradientStops[1]} 0%, ${theme.accent} 60%); display: flex; align-items: center; justify-content: center; color: ${ON_GOLD}; font-weight: 900; font-size: 36px; box-shadow: 0 8px 26px ${theme.accentMuted}, 0 0 32px ${theme.accentMuted}; animation: dawa-inv-wax 3s ease-in-out infinite; }
    .dawa-inv .dawa-inv-env-overlay.is-opening .dawa-inv-wax { animation: dawa-inv-crack 1s cubic-bezier(.2,.95,.25,1.1) forwards; }
    .dawa-inv .dawa-inv-env-hint { margin-top: 34px; color: ${theme.accent}; font-size: 13px; letter-spacing: 3px; text-transform: uppercase; font-style: italic; animation: dawa-inv-cue 2.6s ease-in-out infinite; }
    .dawa-inv .dawa-inv-env-name { margin-top: 22px; font-weight: 900; font-size: clamp(28px,5vw,44px); color: ${theme.text}; }

    /* Petals + sparkles */
    .dawa-inv .dawa-inv-petals { inset: 0; pointer-events: none; z-index: 5; overflow: hidden; }
    .dawa-inv .dawa-inv-petal { position: absolute; top: -40px; border-radius: 60% 40% 60% 40% / 70% 60% 40% 30%; opacity: .55; filter: blur(.4px); animation: dawa-inv-petal linear infinite; }
    .dawa-inv .dawa-inv-sparkles { inset: 0; pointer-events: none; z-index: 4; }
    .dawa-inv .dawa-inv-sparkle { position: absolute; width: 2px; height: 2px; border-radius: 50%; animation: dawa-inv-sparkle ease-in-out infinite; }

    /* Confetti + hearts (appended to body for confetti, in-card for hearts) */
    .dawa-inv-confetti { position: fixed; inset: 0; pointer-events: none; z-index: 1001; overflow: hidden; }
    .dawa-inv-confetti span { position: absolute; top: 50%; left: 50%; width: 8px; height: 12px; border-radius: 2px; animation: dawa-inv-conf 1.6s cubic-bezier(.2,.7,.2,1) forwards; }
    .dawa-inv .dawa-inv-hearts { position: absolute; inset: 0; pointer-events: none; overflow: hidden; }
    .dawa-inv .dawa-inv-hearts span { position: absolute; bottom: 0; font-size: 18px; animation: dawa-inv-heart 3s ease-out forwards; opacity: 0; }

    /* ════════════ LUXE LAYER — depth, glow & gold sheen ════════════ */
    /* Living aurora: slow-drifting soft gold light behind everything. */
    .dawa-inv .dawa-inv-aurora { inset: 0; pointer-events: none; z-index: 0; overflow: hidden; }
    .dawa-inv .dawa-inv-aurora-blob { position: absolute; width: 78vw; height: 78vw; max-width: 760px; max-height: 760px; border-radius: 50%; filter: blur(72px); opacity: .18; will-change: transform; }
    .dawa-inv .dawa-inv-aurora-blob.a1 { top: -14%; inset-inline-start: -14%; animation: dawa-inv-drift1 24s ease-in-out infinite; }
    .dawa-inv .dawa-inv-aurora-blob.a2 { bottom: -18%; inset-inline-end: -14%; animation: dawa-inv-drift2 30s ease-in-out infinite; }
    .dawa-inv .dawa-inv-aurora-blob.a3 { top: 36%; inset-inline-start: 26%; opacity: .12; animation: dawa-inv-drift3 34s ease-in-out infinite; }

    /* Couple names + greeting: a richer, layered gold halo. */
    .dawa-inv .dawa-inv-couple { text-shadow: 0 0 1px ${theme.accentLine}, 0 0 26px ${theme.accentMuted}, 0 0 72px ${theme.accentMuted}, 0 2px 3px rgba(0,0,0,.22); letter-spacing: .5px; }
    .dawa-inv .dawa-inv-greet strong { text-shadow: 0 0 24px ${theme.accentMuted}, 0 0 60px ${theme.accentMuted}; }

    /* Section diamond dot gleams. */
    .dawa-inv .dawa-inv-secrule .dawa-inv-secrule-dot { animation: dawa-inv-gleam 3.2s ease-in-out infinite; }

    /* Detail items → refined glass cards with a soft gold glow. */
    .dawa-inv .dawa-inv-detail {
      padding: 20px 18px; border-radius: 16px;
      background: ${theme.cardBg}; border: 1px solid ${theme.cardBorder};
      box-shadow: 0 14px 38px -20px ${theme.accentMuted}, inset 0 1px 0 rgba(255,255,255,.05);
      backdrop-filter: blur(6px); -webkit-backdrop-filter: blur(6px);
    }
    .dawa-inv .dawa-inv-detail:hover { border-color: ${theme.accentLine}; box-shadow: 0 18px 48px -16px ${theme.accentMuted}, inset 0 1px 0 rgba(255,255,255,.08); }

    /* Deeper, glowier framing on the showpiece surfaces. */
    .dawa-inv .dawa-inv-venue-map { box-shadow: 0 20px 56px -24px ${theme.accentMuted}; }
    .dawa-inv .dawa-inv-countdown { box-shadow: 0 0 52px -22px ${theme.accentMuted}; }
    .dawa-inv .dawa-inv-dateline { box-shadow: 0 14px 40px -16px ${theme.accentMuted}, inset 0 0 0 1px ${theme.accentLine}; }
    .dawa-inv .dawa-inv-hero-frame { box-shadow: 0 0 60px -10px ${theme.accentMuted}, inset 0 0 90px -44px ${theme.accentMuted}; }

    @keyframes dawa-inv-drift1 { 0%,100% { transform: translate(0,0) scale(1); } 50% { transform: translate(7vw,5vh) scale(1.2); } }
    @keyframes dawa-inv-drift2 { 0%,100% { transform: translate(0,0) scale(1.15); } 50% { transform: translate(-6vw,-4vh) scale(1); } }
    @keyframes dawa-inv-drift3 { 0%,100% { transform: translate(0,0) scale(1); } 50% { transform: translate(4vw,-6vh) scale(1.15); } }
    @keyframes dawa-inv-gleam { 0%,100% { opacity: 1; transform: rotate(45deg) scale(1); } 50% { opacity: .6; transform: rotate(45deg) scale(1.35); } }

    @keyframes dawa-inv-rise { from { opacity: 0; transform: translateY(20px); } to { opacity: 1; transform: none; } }
    @keyframes dawa-inv-draw { to { stroke-dashoffset: 0; } }
    @keyframes dawa-inv-cue { 0%,100% { opacity: .55; transform: translate(-50%,0); } 50% { opacity: 1; transform: translate(-50%,6px); } }
    @keyframes dawa-inv-route { to { stroke-dashoffset: 0; } }
    @keyframes dawa-inv-flip { 0% { transform: translateY(0); } 50% { transform: translateY(-14px); opacity: .4; filter: blur(2px); } 100% { transform: translateY(0); } }
    @keyframes dawa-inv-seal { 0% { transform: scale(0) rotate(-90deg); } 60% { transform: scale(1.15) rotate(8deg); } 100% { transform: scale(1) rotate(0); } }
    @keyframes dawa-inv-wax { 0%,100% { transform: translate(-50%,-50%) scale(1); } 50% { transform: translate(-50%,-50%) scale(1.05); } }
    @keyframes dawa-inv-crack { 0% { transform: translate(-50%,-50%) scale(1) rotate(0); } 30% { transform: translate(-50%,-50%) scale(1.25) rotate(-12deg); } 100% { transform: translate(-50%,-50%) scale(0) rotate(180deg); opacity: 0; } }
    @keyframes dawa-inv-dockpulse { 0% { opacity: .9; transform: scale(.95); } 100% { opacity: 0; transform: scale(1.4); } }
    @keyframes dawa-inv-petal { 0% { transform: translateY(0) rotate(0) translateX(0); opacity: 0; } 5% { opacity: .5; } 50% { transform: translateY(45vh) rotate(180deg) translateX(40px); } 95% { opacity: .5; } 100% { transform: translateY(105vh) rotate(420deg) translateX(-30px); opacity: 0; } }
    @keyframes dawa-inv-sparkle { 0%,100% { opacity: 0; transform: scale(.5); } 50% { opacity: 1; transform: scale(1.6); } }
    @keyframes dawa-inv-conf { to { transform: translate(var(--x), var(--y)) rotate(var(--r)); opacity: 0; } }
    @keyframes dawa-inv-heart { 0% { transform: translate(0,0) scale(.4); opacity: 0; } 20% { opacity: .9; } 100% { transform: translate(var(--hx,0), -360px) scale(1.2); opacity: 0; } }

    @media (prefers-reduced-motion: reduce) {
      .dawa-inv *, .dawa-inv *::before, .dawa-inv *::after { animation: none !important; transition-duration: .01ms !important; }
      .dawa-inv .dawa-inv-reveal { opacity: 1; transform: none; }
    }
    `}</style>
  );
}
