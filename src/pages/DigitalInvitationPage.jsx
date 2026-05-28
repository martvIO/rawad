// Public digital invitation route. Loads the token, picks the design source
// (preferring the embedded designSnapshot when present), and delegates
// rendering to <DigitalInvitationView/>. RSVP submission lives here so the
// view stays presentational.
import { useEffect, useState, lazy, Suspense } from "react";
import { useParams, Routes, Route, useSearchParams } from "react-router-dom";
import { subscribeInviteToken } from "../services/invites.js";
import { getDigitalInvitationPublic, submitDigitalGuestInvite } from "../services/digitalInvitation.js";
import { logErr } from "../utils/logger.js";
import { DigitalInvitationView } from "../components/digital/DigitalInvitationView.jsx";
import { C } from "../styles/theme.js";

const DEMO_MEDIA = [
  { url: "https://images.unsplash.com/photo-1519741497674-611481863552?w=1200&q=80", kind: "image", storagePath: "demo/1" },
  { url: "https://images.unsplash.com/photo-1465495976277-4387d4b0e4a6?w=1200&q=80", kind: "image", storagePath: "demo/2" },
  { url: "https://images.unsplash.com/photo-1511795409834-ef04bbd61622?w=1200&q=80", kind: "image", storagePath: "demo/3" },
];

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

function DigitalLandingMain({ lang }) {
  const { token } = useParams();
  const [search] = useSearchParams();
  const isDemo = search.get("demo") === "1";
  const demoName = search.get("name");
  const demoDate = search.get("date");

  const [tokenRec, setTokenRec] = useState(
    isDemo
      ? {
          guestName: demoName ? decodeURIComponent(demoName) : "أحمد محمد",
          groomUid: "demo",
          expiresAt: Date.now() + 30 * 86400000,
        }
      : undefined,
  );
  const [doc, setDoc] = useState(
    isDemo
      ? {
          media: DEMO_MEDIA,
          weddingDate: demoDate ? new Date(demoDate).getTime() : Date.now() + 30 * 86400000,
          brideName: "ليلى",
          groomDisplayName: "كريم",
          themeColor: "gold",
          fontFamily: "amiri",
        }
      : null,
  );
  const [done, setDone] = useState(false);

  useEffect(() => {
    if (isDemo) return;
    if (!token) {
      setTokenRec(null);
      return;
    }
    return subscribeInviteToken(token, setTokenRec);
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
    if (!groomUid) return;
    let active = true;
    getDigitalInvitationPublic(groomUid).then((d) => {
      if (active) setDoc(d);
    });
    return () => {
      active = false;
    };
  }, [tokenRec, isDemo]);

  const handleSubmitRsvp = async ({ rsvp, note }) => {
    if (isDemo) {
      await new Promise((r) => setTimeout(r, 400));
      setDone(true);
      return;
    }
    try {
      await submitDigitalGuestInvite({ token, rsvp, note });
      setDone(true);
    } catch (err) {
      logErr("submitDigitalGuestInvite", err);
      throw new Error(err?.message || (lang === "he" ? "שגיאה" : "خطأ"));
    }
  };

  if (tokenRec === undefined) return <LoadingScreen lang={lang} />;
  if (tokenRec === null) {
    return (
      <CenteredMessage>
        <div style={{ fontSize: 56, marginBottom: 12 }}>⚠️</div>
        <h1 style={{ fontFamily: "'Amiri',serif", color: C.red, fontSize: 24 }}>
          {lang === "he" ? "הזמנה לא חוקית" : "دعوة غير صالحة"}
        </h1>
      </CenteredMessage>
    );
  }
  if (tokenRec.expiresAt && Date.now() > tokenRec.expiresAt) {
    return (
      <CenteredMessage>
        <div style={{ fontSize: 56, marginBottom: 12 }}>⏰</div>
        <h1 style={{ fontFamily: "'Amiri',serif", color: C.red, fontSize: 24 }}>
          {lang === "he" ? "ההזמנה פגה" : "انتهت صلاحية الدعوة"}
        </h1>
      </CenteredMessage>
    );
  }

  return (
    <DigitalInvitationView
      design={doc}
      guestName={tokenRec.guestName || ""}
      lang={lang}
      mode="public"
      onSubmitRsvp={handleSubmitRsvp}
      showEnvelope={true}
      alreadyAnswered={!!tokenRec.usedAt && !done}
      rsvpDone={done}
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
