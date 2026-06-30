// Help & Support page (groom mobile app).
//
// Self-contained bilingual content (AR/HE) keyed by `lang` so it does NOT depend
// on the shared i18n registry (keeps the i18n parity test green and lets the
// mobile app ship help content without a translation-file churn). Visual
// language matches TermsPage. The contact card reuses the shared, admin-managed
// contact channels (GET /settings/public, with config fallbacks).
import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { C } from "../styles/theme.js";
import { BrandLogo } from "../components/BrandLogo.jsx";
import { fetchPublicSettings } from "../services/publicSettings.js";
import { resolveContact, buildWhatsAppUrl, telUrl, mailtoUrl } from "../utils/contact.js";

const CONTENT = {
  ar: {
    back: "رجوع",
    title: "المساعدة والدعم",
    intro: "كل ما تحتاجه لإدارة دعوة عرسك من هاتفك. إن لم تجد إجابتك هنا، تواصل معنا مباشرةً.",
    faqHeading: "الأسئلة الشائعة",
    faqs: [
      { q: "كيف أضيف المدعوين؟", a: "من قائمة \"المدعوون\" اضغط \"إضافة\". يمكنك إدخال كل ضيف يدويًا، أو استيراد قائمة كاملة من ملف جهات الاتصال (CSV/VCF) دفعة واحدة." },
      { q: "كيف أرسل الدعوات؟", a: "بعد إضافة المدعوين، يولّد التطبيق رابط دعوة خاصًا لكل ضيف. أرسله عبر واتساب بضغطة واحدة، وسيصل الضيف إلى صفحة دعوته الرقمية." },
      { q: "كيف أتابع تأكيدات الحضور؟", a: "تظهر ردود المدعوين (سيحضر / لن يحضر / بانتظار الرد) وعدد المرافقين مباشرةً في لوحة التحكم وقائمة المدعوين فور تأكيدهم." },
      { q: "ما هي ميزة المصوّر؟", a: "بعد العرس، ارفع صور وفيديوهات الحفل من قسم \"المصوّر\"، وسيصل المدعوين رابط لمشاهدة وتحميل صورهم." },
      { q: "كيف أعدّل تصميم الدعوة؟", a: "من \"تصميم الدعوة\" يمكنك تغيير الألوان والنصوص والخلفية ومعاينة الدعوة قبل إرسالها." },
      { q: "نسيت كلمة المرور.", a: "من شاشة الدخول اضغط \"نسيت كلمة المرور\" لإعادة تعيينها عبر رمز يصلك على هاتفك." },
    ],
    contactHeading: "تواصل معنا",
    contactIntro: "فريق الدعم جاهز لمساعدتك.",
    waMsg: "مرحباً، أحتاج مساعدة في تطبيق دعوة",
    callLabel: "اتصال",
  },
  he: {
    back: "חזרה",
    title: "עזרה ותמיכה",
    intro: "כל מה שצריך כדי לנהל את הזמנת החתונה מהטלפון. אם לא מצאת תשובה כאן, צרו איתנו קשר.",
    faqHeading: "שאלות נפוצות",
    faqs: [
      { q: "איך מוסיפים מוזמנים?", a: "ברשימת \"מוזמנים\" לחצו \"הוספה\". אפשר להזין כל אורח ידנית, או לייבא רשימה שלמה מקובץ אנשי קשר (CSV/VCF) בבת אחת." },
      { q: "איך שולחים הזמנות?", a: "לאחר הוספת המוזמנים, האפליקציה יוצרת קישור הזמנה אישי לכל אורח. שלחו אותו בוואטסאפ בלחיצה אחת, והאורח יגיע לעמוד ההזמנה הדיגיטלי שלו." },
      { q: "איך עוקבים אחר אישורי הגעה?", a: "תשובות המוזמנים (מגיע / לא מגיע / ממתין) ומספר המלווים מופיעים מיד בלוח הבקרה וברשימת המוזמנים." },
      { q: "מהי תכונת הצלם?", a: "אחרי החתונה, העלו תמונות וסרטונים מהאירוע במסך \"צלם\", והמוזמנים יקבלו קישור לצפייה והורדה של התמונות שלהם." },
      { q: "איך עורכים את עיצוב ההזמנה?", a: "ב\"עיצוב ההזמנה\" אפשר לשנות צבעים, טקסטים ורקע ולצפות בתצוגה מקדימה לפני השליחה." },
      { q: "שכחתי סיסמה.", a: "במסך הכניסה לחצו \"שכחתי סיסמה\" כדי לאפס אותה באמצעות קוד שיישלח לטלפון שלכם." },
    ],
    contactHeading: "צרו קשר",
    contactIntro: "צוות התמיכה כאן בשבילכם.",
    waMsg: "שלום, אני צריך עזרה באפליקציית דעוה",
    callLabel: "התקשרות",
  },
};

function FaqCard({ q, a }) {
  return (
    <section style={{
      padding: "22px 24px",
      marginBottom: 14,
      borderRadius: 16,
      background: "linear-gradient(180deg, rgba(201,168,76,.04), rgba(201,168,76,.01))",
      border: "1px solid rgba(201,168,76,.18)",
    }}>
      <h3 style={{
        fontFamily: "'Amiri','Frank Ruhl Libre',serif", fontWeight: 800,
        fontSize: 18, color: "#fff3c0",
        marginTop: 0, marginBottom: 10, lineHeight: 1.4,
      }}>{q}</h3>
      <p style={{
        color: "#d8c9a6", fontSize: 14.5, lineHeight: 1.9, margin: 0,
        whiteSpace: "pre-line",
      }}>{a}</p>
    </section>
  );
}

export function HelpPage({ lang = "ar" }) {
  const navigate = useNavigate();
  const c = CONTENT[lang] || CONTENT.ar;

  const [contact, setContact] = useState(() => resolveContact(null));
  useEffect(() => {
    let alive = true;
    fetchPublicSettings().then((s) => { if (alive) setContact(resolveContact(s)); }).catch(() => {});
    return () => { alive = false; };
  }, []);

  const waUrl = buildWhatsAppUrl(contact.whatsapp, c.waMsg);
  const callUrl = telUrl(contact.phone);
  const mUrl = mailtoUrl(contact.email);

  const onBack = () => {
    if (window.history.length > 1) navigate(-1);
    else navigate("/portal");
  };

  const linkStyle = {
    display: "inline-flex", alignItems: "center", gap: 8,
    padding: "11px 20px", borderRadius: 999, textDecoration: "none",
    border: "1px solid rgba(201,168,76,.35)", color: "#fff3c0",
    fontSize: 14, fontWeight: 700, background: "rgba(201,168,76,.08)",
  };

  return (
    <div style={{
      background: C.bg, color: "#fff3c0",
      minHeight: "100vh",
      paddingBlock: "max(40px, env(safe-area-inset-top)) 80px",
      paddingInline: 20,
    }}>
      <div style={{ maxWidth: 720, margin: "0 auto" }}>
        <button
          onClick={onBack}
          style={{
            background: "transparent", border: "1px solid rgba(201,168,76,.30)",
            color: "#c9a84c", fontFamily: "inherit",
            padding: "10px 18px", borderRadius: 999, fontSize: 13, fontWeight: 700,
            cursor: "pointer", marginBottom: 28,
          }}
        >{c.back}</button>

        <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 22 }}>
          <BrandLogo size={48} />
          <h1 style={{
            fontFamily: "'Amiri','Frank Ruhl Libre',serif", fontWeight: 900,
            fontSize: "clamp(26px, 4.2vw, 40px)", lineHeight: 1.2,
            background: "linear-gradient(135deg,#fff3c0,#f0c84c,#c9a84c)",
            WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent",
            margin: 0, paddingBlock: 4,
          }}>{c.title}</h1>
        </div>

        <p style={{
          color: "#d8c9a6", fontSize: 15, lineHeight: 1.9,
          marginBottom: 34, paddingInlineStart: 16,
          borderInlineStart: "2px solid rgba(201,168,76,.35)",
        }}>{c.intro}</p>

        <h2 style={{
          fontFamily: "'Amiri','Frank Ruhl Libre',serif", fontWeight: 900,
          fontSize: "clamp(20px, 3vw, 26px)", color: "#fff3c0",
          marginTop: 0, marginBottom: 18, paddingBottom: 12,
          borderBottom: "1px solid rgba(201,168,76,.22)",
        }}>{c.faqHeading}</h2>

        <div>
          {c.faqs.map((f, i) => <FaqCard key={i} q={f.q} a={f.a} />)}
        </div>

        {(waUrl || callUrl || mUrl) && (
          <div style={{
            marginTop: 36, padding: "24px 26px", borderRadius: 16,
            background: "linear-gradient(180deg, rgba(201,168,76,.06), rgba(201,168,76,.02))",
            border: "1px solid rgba(201,168,76,.22)", textAlign: "center",
          }}>
            <div style={{
              fontFamily: "'Amiri','Frank Ruhl Libre',serif", fontWeight: 800, fontSize: 18,
              color: "#fff3c0", marginBottom: 6,
            }}>{c.contactHeading}</div>
            <div style={{ color: "#d8c9a6", fontSize: 13.5, marginBottom: 16 }}>{c.contactIntro}</div>
            <div style={{ display: "flex", gap: 12, justifyContent: "center", flexWrap: "wrap" }}>
              {waUrl && (
                <a href={waUrl} target="_blank" rel="noopener noreferrer" style={linkStyle}>💬 WhatsApp</a>
              )}
              {callUrl && (
                <a href={callUrl} style={linkStyle}>📞 {c.callLabel}</a>
              )}
              {mUrl && (
                <a href={mUrl} style={linkStyle}>✉ {contact.email}</a>
              )}
            </div>
          </div>
        )}

        <div style={{
          marginTop: 44, paddingTop: 22,
          borderTop: "1px solid rgba(201,168,76,.14)",
          color: "#7a6a4a", fontSize: 12, textAlign: "center",
        }}>
          © {new Date().getFullYear()} {lang === "he" ? "דעוה" : "دعوة"}
        </div>
      </div>
    </div>
  );
}
