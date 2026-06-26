// Help & Support — self-contained bilingual FAQ + contact card. Pushed screen
// (reached from the header kebab). Content ported verbatim from the web HelpPage
// (it was already written for the mobile app).
import { useEffect, useState } from "react";
import { ScrollView, View, Text, Pressable, Linking, StyleSheet } from "react-native";
import { usePortal } from "../../src/portal/PortalContext.jsx";
import { ScreenHeader } from "../../src/ui/ScreenHeader.jsx";
import { fetchPublicSettings } from "@dawa/core/services/publicSettings.js";
import {
  resolveContact,
  buildWhatsAppUrl,
  telUrl,
  mailtoUrl,
} from "@dawa/core/utils/contact.js";
import { C, space, radius, type } from "../../src/ui/theme.js";

const CONTENT = {
  ar: {
    title: "المساعدة والدعم",
    intro:
      "كل ما تحتاجه لإدارة دعوة عرسك من هاتفك. إن لم تجد إجابتك هنا، تواصل معنا مباشرةً.",
    faqHeading: "الأسئلة الشائعة",
    faqs: [
      { q: "كيف أضيف المدعوين؟", a: 'من قائمة "المدعوون" اضغط "إضافة". يمكنك إدخال كل ضيف يدويًا، أو استيراد قائمة كاملة من ملف جهات الاتصال (CSV/VCF) دفعة واحدة.' },
      { q: "كيف أرسل الدعوات؟", a: "بعد إضافة المدعوين، يولّد التطبيق رابط دعوة خاصًا لكل ضيف. أرسله عبر واتساب بضغطة واحدة، وسيصل الضيف إلى صفحة دعوته الرقمية." },
      { q: "كيف أتابع تأكيدات الحضور؟", a: "تظهر ردود المدعوين (سيحضر / لن يحضر / بانتظار الرد) وعدد المرافقين مباشرةً في لوحة التحكم وقائمة المدعوين فور تأكيدهم." },
      { q: "ما هي ميزة المصوّر؟", a: 'بعد العرس، ارفع صور وفيديوهات الحفل من قسم "المصوّر"، وسيصل المدعوين رابط لمشاهدة وتحميل صورهم.' },
      { q: "كيف أعدّل تصميم الدعوة؟", a: 'من "تصميم الدعوة" يمكنك تغيير الألوان والنصوص والخلفية ومعاينة الدعوة قبل إرسالها.' },
      { q: "نسيت كلمة المرور.", a: 'من شاشة الدخول اضغط "نسيت كلمة المرور" لإعادة تعيينها عبر رمز يصلك على هاتفك.' },
    ],
    contactHeading: "تواصل معنا",
    contactIntro: "فريق الدعم جاهز لمساعدتك.",
    waMsg: "مرحباً، أحتاج مساعدة في تطبيق دعوة",
    callLabel: "اتصال",
  },
  he: {
    title: "עזרה ותמיכה",
    intro:
      "כל מה שצריך כדי לנהל את הזמנת החתונה מהטלפון. אם לא מצאת תשובה כאן, צרו איתנו קשר.",
    faqHeading: "שאלות נפוצות",
    faqs: [
      { q: "איך מוסיפים מוזמנים?", a: 'ברשימת "מוזמנים" לחצו "הוספה". אפשר להזין כל אורח ידנית, או לייבא רשימה שלמה מקובץ אנשי קשר (CSV/VCF) בבת אחת.' },
      { q: "איך שולחים הזמנות?", a: "לאחר הוספת המוזמנים, האפליקציה יוצרת קישור הזמנה אישי לכל אורח. שלחו אותו בוואטסאפ בלחיצה אחת, והאורח יגיע לעמוד ההזמנה הדיגיטלי שלו." },
      { q: "איך עוקבים אחר אישורי הגעה?", a: "תשובות המוזמנים (מגיע / לא מגיע / ממתין) ומספר המלווים מופיעים מיד בלוח הבקרה וברשימת המוזמנים." },
      { q: "מהי תכונת הצלם?", a: 'אחרי החתונה, העלו תמונות וסרטונים מהאירוע במסך "צלם", והמוזמנים יקבלו קישור לצפייה והורדה של התמונות שלהם.' },
      { q: "איך עורכים את עיצוב ההזמנה?", a: 'ב"עיצוב ההזמנה" אפשר לשנות צבעים, טקסטים ורקע ולצפות בתצוגה מקדימה לפני השליחה.' },
      { q: "שכחתי סיסמה.", a: 'במסך הכניסה לחצו "שכחתי סיסמה" כדי לאפס אותה באמצעות קוד שיישלח לטלפון שלכם.' },
    ],
    contactHeading: "צרו קשר",
    contactIntro: "צוות התמיכה כאן בשבילכם.",
    waMsg: "שלום, אני צריך עזרה באפליקציית דעוה",
    callLabel: "התקשרות",
  },
};

function LinkButton({ label, onPress }) {
  return (
    <Pressable style={styles.link} onPress={onPress}>
      <Text style={styles.linkText}>{label}</Text>
    </Pressable>
  );
}

export default function Help() {
  const { lang } = usePortal();
  const c = CONTENT[lang] || CONTENT.ar;

  const [contact, setContact] = useState(() => resolveContact(null));
  useEffect(() => {
    let alive = true;
    fetchPublicSettings()
      .then((s) => alive && setContact(resolveContact(s)))
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);

  const waUrl = buildWhatsAppUrl(contact.whatsapp, c.waMsg);
  const callUrl = telUrl(contact.phone);
  const mUrl = mailtoUrl(contact.email);
  const open = (url) => url && Linking.openURL(url).catch(() => {});

  return (
    <View style={styles.screen}>
      <ScreenHeader title={c.title} back />
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.intro}>{c.intro}</Text>
        <Text style={styles.h2}>{c.faqHeading}</Text>
        {c.faqs.map((f, i) => (
          <View key={i} style={styles.faq}>
            <Text style={styles.q}>{f.q}</Text>
            <Text style={styles.a}>{f.a}</Text>
          </View>
        ))}
        {waUrl || callUrl || mUrl ? (
          <View style={styles.contactCard}>
            <Text style={styles.contactHeading}>{c.contactHeading}</Text>
            <Text style={styles.contactIntro}>{c.contactIntro}</Text>
            <View style={styles.links}>
              {waUrl ? <LinkButton label="💬 WhatsApp" onPress={() => open(waUrl)} /> : null}
              {callUrl ? <LinkButton label={`📞 ${c.callLabel}`} onPress={() => open(callUrl)} /> : null}
              {mUrl ? <LinkButton label={`✉ ${contact.email}`} onPress={() => open(mUrl)} /> : null}
            </View>
          </View>
        ) : null}
        <Text style={styles.footer}>
          © {new Date().getFullYear()} {lang === "he" ? "דעוה" : "دعوة"}
        </Text>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: C.bg },
  content: { padding: space[5], paddingBottom: space[12] },
  intro: {
    color: "#d8c9a6",
    fontSize: type.lg,
    lineHeight: 26,
    marginBottom: space[6],
    paddingStart: space[4],
    borderStartColor: "rgba(201,168,76,0.35)",
    borderStartWidth: 2,
    textAlign: "right",
  },
  h2: {
    color: C.goldLight,
    fontSize: type["3xl"],
    fontWeight: "900",
    marginBottom: space[4],
    paddingBottom: space[3],
    borderBottomColor: "rgba(201,168,76,0.22)",
    borderBottomWidth: 1,
    textAlign: "right",
  },
  faq: {
    padding: space[5],
    marginBottom: space[3],
    borderRadius: radius["2xl"],
    backgroundColor: "rgba(201,168,76,0.03)",
    borderColor: "rgba(201,168,76,0.18)",
    borderWidth: 1,
  },
  q: { color: C.goldLight, fontSize: type["2xl"], fontWeight: "800", marginBottom: space[2], textAlign: "right" },
  a: { color: "#d8c9a6", fontSize: type.md, lineHeight: 26, textAlign: "right" },
  contactCard: {
    marginTop: space[6],
    padding: space[5],
    borderRadius: radius["2xl"],
    backgroundColor: "rgba(201,168,76,0.05)",
    borderColor: "rgba(201,168,76,0.22)",
    borderWidth: 1,
    alignItems: "center",
    gap: space[2],
  },
  contactHeading: { color: C.goldLight, fontSize: type["2xl"], fontWeight: "800" },
  contactIntro: { color: "#d8c9a6", fontSize: type.base, marginBottom: space[2] },
  links: { flexDirection: "row", flexWrap: "wrap", gap: space[3], justifyContent: "center" },
  link: {
    paddingHorizontal: space[5],
    paddingVertical: space[3],
    borderRadius: radius.pill,
    borderColor: "rgba(201,168,76,0.35)",
    borderWidth: 1,
    backgroundColor: "rgba(201,168,76,0.08)",
  },
  linkText: { color: C.goldLight, fontSize: type.md, fontWeight: "700" },
  footer: {
    marginTop: space[10],
    paddingTop: space[5],
    borderTopColor: "rgba(201,168,76,0.14)",
    borderTopWidth: 1,
    color: C.dim,
    fontSize: type.sm,
    textAlign: "center",
  },
});
