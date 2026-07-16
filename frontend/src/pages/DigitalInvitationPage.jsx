// Public digital invitation route. Loads the token, picks the design source
// (preferring the embedded designSnapshot when present), and delegates
// rendering to <DigitalInvitationView/>. RSVP submission lives here so the
// view stays presentational.
import { useCallback, useEffect, useState, useRef, lazy, Suspense } from "react";
import { useParams, Routes, Route, useSearchParams, useNavigate } from "react-router-dom";
import { subscribeInviteToken, submitDigitalWish, getApprovedWishes } from "../services/invites.js";
import { getDigitalInvitationPublic, submitDigitalGuestInvite, pingDigitalInviteOpened, getDemoDesignPublic } from "../services/digitalInvitation.js";
import { logErr } from "../utils/logger.js";
import { TemplateRenderer } from "../components/digital/templates/TemplateRenderer.jsx";
import { EventUnavailableNotice } from "../components/EventUnavailableNotice.jsx";
import { C } from "../styles/theme.js";
import { Icon } from "../components/icons/Icon.jsx";
import { SAMPLE_STORY, SAMPLE_DETAILS, SAMPLE_HOTELS, SAMPLE_WISHES, DEFAULT_MEAL_OPTIONS } from "../data/digitalInviteDefaults.js";
import { applyDemoOverrides } from "../utils/demoOverrides.js";
import { createInviteMetrics } from "../utils/inviteMetrics.js";
import { DEFAULT_TEMPLATE_ID } from "@dawa/core/data/digitalTemplates.js";

const DEMO_MEDIA = [
  { url: "https://images.unsplash.com/photo-1519741497674-611481863552?w=1200&q=80", kind: "image", storagePath: "demo/1" },
  { url: "https://images.unsplash.com/photo-1465495976277-4387d4b0e4a6?w=1200&q=80", kind: "image", storagePath: "demo/2" },
  { url: "https://images.unsplash.com/photo-1511795409834-ef04bbd61622?w=1200&q=80", kind: "image", storagePath: "demo/3" },
  { url: "https://images.unsplash.com/photo-1606800052052-a08af7148866?w=1200&q=80", kind: "image", storagePath: "demo/4" },
  { url: "https://images.unsplash.com/photo-1525258946800-98cfd641d0de?w=1200&q=80", kind: "image", storagePath: "demo/5" },
];

const DEMO_CAPTIONS = {
  "demo/1": { ar: "اليوم الذي قلنا فيه نعم", he: "היום שבו אמרנו כן" },
  "demo/2": { ar: "أمسية الكرمل", he: "ערב בכרמל" },
  "demo/3": { ar: "خاتم الخطوبة", he: "טבעת האירוסין" },
  "demo/4": { ar: "تحت الإضاءة الذهبية", he: "תחת האור הזהוב" },
  "demo/5": { ar: "صباح كل يوم", he: "כל בוקר מחדש" },
};

// Zip the Arabic + Hebrew sample arrays into per-leaf { ar, he } objects so the
// demo invitation showcases the live language toggle. Non-listed keys (icon)
// carry over from the Arabic item.
function mergeLang(arAr, heAr, keys) {
  return (arAr || []).map((a, i) => {
    const h = (heAr || [])[i] || {};
    const out = { ...a };
    for (const k of keys) out[k] = { ar: a[k] || "", he: h[k] || "" };
    return out;
  });
}

// The built-in demo design — shown until/unless an admin publishes a demo
// design (see AdminDemoTab). Kept as the empty-state fallback so the demo is
// never blank. No query-param reads here; overrides are layered separately.
function buildDemoFallbackDoc() {
  return {
    media: DEMO_MEDIA,
    mediaCaptions: DEMO_CAPTIONS,
    weddingDate: Date.now() + 47 * 86400000,
    brideName: { ar: "ليلى", he: "לילה" },
    groomDisplayName: { ar: "كريم", he: "כרים" },
    monogram: "ك&ل",
    venue: { ar: "قاعة الأفراح الملكية", he: "אולמי המלכות" },
    venueCity: { ar: "حيفا", he: "חיפה" },
    venueAddress: { ar: "شارع النبي 86، حيفا", he: "רחוב הנביאים 86, חיפה" },
    accessNote: { ar: "15–20 دقيقة من وسط المدينة · خدمة فاليه", he: "15–20 דקות ממרכז העיר · שירות ולט" },
    dressCode: { ar: "كاجوال أنيق · ألوان فاتحة", he: "אלגנט קז'ואל · צבעים בהירים" },
    themeColor: "ivorygold",
    fontFamily: "amiri",
    storyTimeline: mergeLang(SAMPLE_STORY.ar, SAMPLE_STORY.he, ["when", "title", "body"]),
    details: mergeLang(SAMPLE_DETAILS.ar, SAMPLE_DETAILS.he, ["meta", "title", "body"]),
    hotels: mergeLang(SAMPLE_HOTELS.ar, SAMPLE_HOTELS.he, ["name", "walk"]),
    wishes: mergeLang(SAMPLE_WISHES.ar, SAMPLE_WISHES.he, ["who", "what"]),
    mealOptions: DEFAULT_MEAL_OPTIONS.ar.map((a, i) => ({ ar: a, he: DEFAULT_MEAL_OPTIONS.he[i] || a })),
  };
}

// The digitalInvitePreview function inlines the guest+design record as an inert
// <script type="application/json" id="__DAWA_INVITE__"> block (same shape as GET
// /invites/token) so the invitation renders on first paint, skipping the token
// round-trip + loading spinner. A data block (not executable JS) passes the strict
// CSP. Guard on the token so a stale value from a prior SPA page is never reused.
function readEmbeddedInvite(token) {
  if (typeof document === "undefined") return null;
  try {
    const el = document.getElementById("__DAWA_INVITE__");
    if (!el) return null;
    const pre = JSON.parse(decodeURIComponent(el.textContent || ""));
    return pre && pre.token === token && pre.rec ? pre.rec : null;
  } catch {
    return null;
  }
}

const DigitalYourPhotos = lazy(() =>
  import("./DigitalYourPhotos.jsx").then((m) => ({ default: m.DigitalYourPhotos })),
);

export function DigitalInvitationPage({ t, lang, setLang }) {
  return (
    <Routes>
      <Route index element={<DigitalLandingMain t={t} lang={lang} setLang={setLang} />} />
      <Route
        path="photos"
        element={
          <Suspense fallback={<LoadingScreen lang={lang} />}>
            <DigitalYourPhotos lang={lang} setLang={setLang} />
          </Suspense>
        }
      />
    </Routes>
  );
}

function DigitalLandingMain({ t, lang, setLang }) {
  const { token } = useParams();
  const navigate = useNavigate();
  const [search] = useSearchParams();
  const isDemo = search.get("demo") === "1";
  const demoName = search.get("name");

  const [tokenRec, setTokenRec] = useState(() => {
    if (isDemo) {
      return {
        guestName: demoName ? decodeURIComponent(demoName) : "أحمد محمد",
        groomUid: "demo",
        expiresAt: Date.now() + 30 * 86400000,
      };
    }
    // Server-embedded record → render immediately, no loading spinner. The poller
    // below still refreshes it (and adds boardingPassEnabled/eventStatus).
    return readEmbeddedInvite(token) ?? undefined;
  });
  // Demo: start with NO design and hold a brief loader until the real demo
  // design (the admin-published one, else the built-in fallback) is fetched —
  // then the envelope builds ONCE with the final design. This removes the old
  // fallback→admin swap that re-baked the sealed مكتوب a second after opening
  // (the guest used to see a different envelope for ~1s). For a real invite,
  // seed from the embedded designSnapshot so the invitation + envelope render
  // fully themed on first paint (no default-theme flash, no re-bake).
  const [doc, setDoc] = useState(() => {
    if (isDemo) return null;
    return readEmbeddedInvite(token)?.designSnapshot ?? null;
  });
  const [done, setDone] = useState(false);
  const [approvedWishes, setApprovedWishes] = useState([]);
  const pingedRef = useRef(false);
  // In demo mode every route share the placeholder token "demo", so the intro
  // contract's per-token "already seen → skip" fast path would suppress the
  // sealed reveal for a prospect browsing several template demos. Give each demo
  // MOUNT a unique synthetic token so the ritual always replays. (Per-template
  // demos open in new tabs, so a fresh mount per link is guaranteed.)
  const demoTokenRef = useRef(null);
  if (isDemo && !demoTokenRef.current) {
    demoTokenRef.current = `demo-${Math.random().toString(16).slice(2, 10)}`;
  }

  // Demo: fetch the design ONCE (admin-published if it exists, else the built-in
  // fallback), then set it so the envelope builds a single time — no swap, no
  // re-bake flash. Query overrides layer on top.
  useEffect(() => {
    if (!isDemo) return undefined;
    let active = true;
    getDemoDesignPublic()
      .then((snap) => { if (active) setDoc(applyDemoOverrides(snap || buildDemoFallbackDoc(), search)); })
      .catch(() => { if (active) setDoc(applyDemoOverrides(buildDemoFallbackDoc(), search)); });
    return () => { active = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isDemo]);

  useEffect(() => {
    if (isDemo) return;
    if (!token) {
      setTokenRec(null);
      return;
    }
    return subscribeInviteToken(token, setTokenRec);
  }, [token, isDemo]);

  // First-party "opened" ping — once per load, when a valid token resolves.
  // Stamps viewedAt (open-rate KPI) + the language opened in (localized reminder).
  useEffect(() => {
    if (isDemo || !token || pingedRef.current) return;
    if (tokenRec && tokenRec.groomUid) {
      pingedRef.current = true;
      pingDigitalInviteOpened(token, lang);
    }
  }, [token, isDemo, tokenRec, lang]);

  // Guest-experience timing recorder. Created once the design resolves (so the
  // templateId is final and the event is attributed to the template the guest
  // actually saw). Real guests report under surface "guest"; prospects browsing
  // a template demo report under "demo" — the backend keeps those buckets apart
  // so demo traffic can never inflate the real-guest funnel.
  const metricsRef = useRef(null);
  const introEventRef = useRef(() => {});
  useEffect(() => {
    if (!doc) return undefined;
    const m = createInviteMetrics({
      token: isDemo ? demoTokenRef.current : token,
      surface: isDemo ? "demo" : "guest",
      templateId: doc.templateId || DEFAULT_TEMPLATE_ID,
      lang,
    });
    metricsRef.current = m;
    introEventRef.current = m.handleIntroEvent;
    return () => {
      m.dispose();
      metricsRef.current = null;
      introEventRef.current = () => {};
    };
    // Only re-create for a genuinely different visit (never on a lang toggle —
    // that would restart the clock mid-visit and double-count the load).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [!!doc, doc?.templateId, isDemo, token]);

  // Stable identity: the templates receive one callback that never changes, so
  // wiring metrics can't churn their memoized handlers or re-run their effects.
  const onIntroEvent = useCallback((event, opts) => {
    introEventRef.current?.(event, opts);
  }, []);

  // The groom's APPROVED guestbook wishes (live — shows the same approved
  // messages on every guest's invitation, whatever design they received).
  useEffect(() => {
    if (isDemo || !token) return;
    let active = true;
    getApprovedWishes(token)
      .then((r) => { if (active) setApprovedWishes(Array.isArray(r?.wishes) ? r.wishes : []); })
      .catch(() => {});
    return () => { active = false; };
  }, [token, isDemo]);

  // Prefer the token's embedded designSnapshot so already-distributed links
  // keep showing the design they were sent with, even after the groom edits.
  useEffect(() => {
    if (isDemo) return;
    if (!tokenRec) return;
    if (tokenRec.designSnapshot) {
      setDoc(tokenRec.designSnapshot);
      return;
    }
    const groomUid = tokenRec.groomUid;
    // Last resort → an empty design ({}) renders the default-themed invitation.
    // This guarantees `doc` always resolves so the loader gate can never hang.
    if (!groomUid) { setDoc({}); return; }
    let active = true;
    getDigitalInvitationPublic(groomUid)
      .then((d) => { if (active) setDoc(d || {}); })
      .catch(() => { if (active) setDoc({}); });
    return () => {
      active = false;
    };
  }, [tokenRec, isDemo]);

  const handleSubmitRsvp = async ({ rsvp, note, submittedPhone, companions, mealPreference, songRequest }) => {
    if (isDemo) {
      await new Promise((r) => setTimeout(r, 400));
      setDone(true);
      return;
    }
    try {
      await submitDigitalGuestInvite({ token, rsvp, note, submittedPhone, companions, mealPreference, songRequest });
      setDone(true);
    } catch (err) {
      logErr("submitDigitalGuestInvite", err);
      throw new Error(err?.message || (lang === "he" ? "שגיאה" : "خطأ"));
    }
  };

  const handleSubmitWish = async ({ who, what }) => {
    if (isDemo) { await new Promise((r) => setTimeout(r, 300)); return; }
    await submitDigitalWish({ token, who, what });
  };

  if (tokenRec === undefined) return <LoadingScreen lang={lang} />;
  if (tokenRec === null) {
    return (
      <CenteredMessage>
        <div style={{ display: "flex", justifyContent: "center", marginBottom: 12, color: C.red }}><Icon name="warning" size={52} /></div>
        <h1 style={{ fontFamily: "'Amiri','Frank Ruhl Libre',serif", color: C.red, fontSize: 24 }}>
          {lang === "he" ? "הזמנה לא חוקית" : "دعوة غير صالحة"}
        </h1>
      </CenteredMessage>
    );
  }
  // Wedding cancelled / postponed → neutral notice instead of the invitation.
  if (!isDemo && tokenRec.eventStatus && tokenRec.eventStatus !== "active" && !done) {
    return <EventUnavailableNotice state={tokenRec.eventStatus} t={t} lang={lang} />;
  }
  if (tokenRec.expiresAt && Date.now() > tokenRec.expiresAt) {
    return (
      <CenteredMessage>
        <div style={{ display: "flex", justifyContent: "center", marginBottom: 12, color: C.red }}><Icon name="clock" size={52} /></div>
        <h1 style={{ fontFamily: "'Amiri','Frank Ruhl Libre',serif", color: C.red, fontSize: 24 }}>
          {lang === "he" ? "ההזמנה פגה" : "انتهت صلاحية الدعوة"}
        </h1>
      </CenteredMessage>
    );
  }
  // Hold a brief loader until the design is resolved, so the 3D envelope is built
  // ONCE with the final design — never with a provisional one that re-bakes a
  // beat later (the "different مكتوب for a second" flash).
  if (!doc) return <LoadingScreen lang={lang} />;

  return (
    <TemplateRenderer
      design={doc}
      guestName={tokenRec.guestName || ""}
      guestPhone={tokenRec.guestPhone || ""}
      lang={lang}
      setLang={setLang}
      mode="public"
      onSubmitRsvp={handleSubmitRsvp}
      approvedWishes={approvedWishes}
      onSubmitWish={handleSubmitWish}
      onOpenSorek={() => navigate("photos")}
      showEnvelope={true}
      alreadyAnswered={!!tokenRec.usedAt && !done}
      rsvpDone={done}
      boardingPassEnabled={!!tokenRec.boardingPassEnabled}
      token={isDemo ? demoTokenRef.current : token}
      onIntroEvent={onIntroEvent}
    />
  );
}

function CenteredMessage({ children }) {
  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 24,
        background: "#07070a",
      }}
    >
      <div style={{ maxWidth: 460, width: "100%", textAlign: "center", color: "#fff3c0" }}>
        {children}
      </div>
    </div>
  );
}

function LoadingScreen({ lang }) {
  return (
    <CenteredMessage>
      <div style={{ display: "inline-flex", alignItems: "center", gap: 10, color: "#d4a07a", fontSize: 14 }}>
        <span className="spinner" />
        {lang === "he" ? "טוען…" : "جاري التحميل…"}
      </div>
    </CenteredMessage>
  );
}
