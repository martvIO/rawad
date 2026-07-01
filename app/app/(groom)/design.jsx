// Digital invitation — Design editor (native full-parity port of the web
// DigitalDesignEditor). Switch between / create / duplicate / delete designs,
// then edit the selected one: theme + font, bilingual scalar text, wedding date,
// section toggles, the five content arrays, gallery + hero media, and the 3D
// envelope + custom-background overrides. Autosaves through @dawa/core; the live
// preview opens in a WebView (device GPU) via the "👁" button (design-preview).
import { useState, useEffect, useCallback } from "react";
import {
  View,
  Text,
  TextInput,
  Pressable,
  ScrollView,
  Switch,
  Image,
  Alert,
  StyleSheet,
} from "react-native";
import { useRouter } from "expo-router";
import * as ImagePicker from "expo-image-picker";
import { ScreenHeader } from "../../src/ui/ScreenHeader.jsx";
import { usePortal } from "../../src/portal/PortalContext.jsx";
import { useGroomDigital } from "../../src/portal/useGroomDigital.jsx";
import { useDesignEditor } from "../../src/portal/useDesignEditor.js";
import { useToast } from "../../src/ui/Toast.jsx";
import { Chip, DatePickerField, IconButton } from "../../src/ui/primitives.jsx";
import { createDesign, deleteDesign, submitDesignById, cancelDesignById } from "@dawa/core/services/digitalInvitation.js";
import {
  SCALAR_KEYS,
  PLAIN_SCALARS,
  ARRAY_KEYS,
  ARRAY_ROW_FIELDS,
  TOGGLE_KEYS,
  DESIGN_STATUS_META,
  isLocalizedScalar,
} from "@dawa/core/data/digitalDesignSchema.js";
import { DIGITAL_THEMES, DIGITAL_FONTS } from "@dawa/core/styles/digitalThemes.js";
import { localizeApiError } from "@dawa/core/utils/apiError.js";
import { C, space, radius, type } from "../../src/ui/theme.js";

const L = (o, he) => (he ? o.he : o.ar);

// Bilingual labels for the scalar fields (keyed by design-schema key).
const SCALAR_LABELS = {
  title: { ar: "اسم التصميم (داخلي)", he: "שם העיצוב (פנימי)" },
  brideName: { ar: "اسم العروس", he: "שם הכלה" },
  groomDisplayName: { ar: "اسم العريس", he: "שם החתן" },
  eyebrow: { ar: "سطر تمهيدي", he: "שורת פתיח" },
  blessing: { ar: "بركة", he: "ברכה" },
  welcome: { ar: "ترحيب", he: "ברוכים הבאים" },
  monogram: { ar: "الأحرف الأولى", he: "מונוגרמה" },
  venue: { ar: "القاعة", he: "אולם" },
  venueCity: { ar: "المدينة", he: "עיר" },
  venueAddress: { ar: "العنوان", he: "כתובת" },
  accessNote: { ar: "ملاحظة الوصول", he: "הערת הגעה" },
  dressCode: { ar: "قواعد اللباس", he: "קוד לבוש" },
  giftNote: { ar: "ملاحظة الهدية", he: "הערת מתנה" },
  giftIban: { ar: "IBAN للهدية", he: "IBAN למתנה" },
  musicUrl: { ar: "رابط الموسيقى", he: "קישור מוזיקה" },
};

const TOGGLE_LABELS = {
  storyEnabled: { ar: "قسم القصة", he: "חלק הסיפור" },
  galleryEnabled: { ar: "معرض الصور", he: "גלריה" },
  detailsEnabled: { ar: "التفاصيل", he: "פרטים" },
  venueEnabled: { ar: "القاعة", he: "אולם" },
  countdownEnabled: { ar: "العد التنازلي", he: "ספירה לאחור" },
  guestbookEnabled: { ar: "سجل التهاني", he: "ספר ברכות" },
  giftEnabled: { ar: "الهدية", he: "מתנה" },
  musicEnabled: { ar: "الموسيقى", he: "מוזיקה" },
  footerDockEnabled: { ar: "شريط التنقل", he: "סרגל ניווט" },
  envelopeEnabled: { ar: "الظرف ثلاثي الأبعاد", he: "מעטפה תלת-ממד" },
  heroMediaEnabled: { ar: "صورة الغلاف", he: "תמונת נושא" },
  rsvpCompanionsEnabled: { ar: "عدد المرافقين", he: "מספר מלווים" },
  rsvpMealEnabled: { ar: "اختيار الوجبة", he: "בחירת מנה" },
  rsvpSongEnabled: { ar: "طلب أغنية", he: "בקשת שיר" },
  immersive3d: { ar: "وضع ثلاثي الأبعاد غامر", he: "מצב תלת-ממד סוחף" },
};

const ARRAY_LABELS = {
  storyTimeline: { ar: "القصة", he: "סיפור" },
  details: { ar: "التفاصيل", he: "פרטים" },
  hotels: { ar: "الفنادق", he: "מלונות" },
  wishes: { ar: "التهاني", he: "ברכות" },
  mealOptions: { ar: "خيارات الوجبة", he: "אפשרויות מנה" },
};
const ROW_FIELD_LABELS = {
  when: { ar: "متى", he: "מתי" },
  title: { ar: "عنوان", he: "כותרת" },
  body: { ar: "نص", he: "טקסט" },
  meta: { ar: "تصنيف", he: "תווית" },
  name: { ar: "الاسم", he: "שם" },
  walk: { ar: "المسافة", he: "מרחק" },
  who: { ar: "من", he: "מי" },
  what: { ar: "الرسالة", he: "הודעה" },
};

const ENV_COLORS = ["paper", "wax", "foil", "cardPaper", "cardInk"];
const ENV_COLOR_LABELS = {
  paper: { ar: "الورق", he: "נייר" },
  wax: { ar: "الشمع", he: "שעווה" },
  foil: { ar: "الرقاقة", he: "רדיד" },
  cardPaper: { ar: "ورق البطاقة", he: "נייר כרטיס" },
  cardInk: { ar: "حبر البطاقة", he: "דיו כרטיס" },
};

// ── Small controls ───────────────────────────────────────────────────────────
function HexField({ label, value, placeholder, onCommit }) {
  const [v, setV] = useState(value || "");
  useEffect(() => setV(value || ""), [value]);
  const swatch = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(v) ? v : placeholder;
  return (
    <View style={styles.hexRow}>
      <View style={[styles.swatch, { backgroundColor: swatch || "#333" }]} />
      <View style={styles.hexMain}>
        <Text style={styles.subLabel}>{label}</Text>
        <TextInput
          style={styles.hexInput}
          value={v}
          onChangeText={setV}
          onBlur={() => onCommit(v.trim())}
          placeholder={placeholder || "#RRGGBB"}
          placeholderTextColor={C.dim}
          autoCapitalize="none"
          autoCorrect={false}
        />
      </View>
    </View>
  );
}

function Stepper({ label, value, min, max, step, onChange }) {
  const dec = () => onChange(Math.max(min, Number((value - step).toFixed(2))));
  const inc = () => onChange(Math.min(max, Number((value + step).toFixed(2))));
  return (
    <View style={styles.stepRow}>
      <Text style={styles.subLabel}>{label}</Text>
      <View style={styles.stepCtrls}>
        <Pressable style={styles.stepBtn} onPress={dec}><Text style={styles.stepBtnText}>−</Text></Pressable>
        <Text style={styles.stepVal}>{value}</Text>
        <Pressable style={styles.stepBtn} onPress={inc}><Text style={styles.stepBtnText}>＋</Text></Pressable>
      </View>
    </View>
  );
}

function Section({ title, children, right }) {
  return (
    <View style={styles.section}>
      <View style={styles.sectionHead}>
        <Text style={styles.sectionTitle}>{title}</Text>
        {right}
      </View>
      {children}
    </View>
  );
}

// ── Screen ───────────────────────────────────────────────────────────────────
export default function Design() {
  const { lang, t } = usePortal();
  const he = lang === "he";
  const { uid, designs } = useGroomDigital();
  const toast = useToast();
  const router = useRouter();

  const [selectedId, setSelectedId] = useState(null);
  const [editLang, setEditLang] = useState(he ? "he" : "ar");
  const [busy, setBusy] = useState(false);
  const [uploadBusy, setUploadBusy] = useState(false);

  useEffect(() => {
    if (selectedId && designs.some((d) => d.id === selectedId)) return;
    const def = designs.find((d) => d.isDefault) || designs[0];
    setSelectedId(def ? def.id : null);
  }, [designs, selectedId]);

  const onError = useCallback((e) => toast.show("✗ " + localizeApiError(e, t, he ? "השמירה נכשלה" : "فشل الحفظ")), [toast, t, he]);
  const ed = useDesignEditor(uid, selectedId, { onError });
  const status = ed.status;
  const editable = status === "draft" || status === "rejected";

  const create = async (copyFromId) => {
    setBusy(true);
    try {
      const res = await createDesign(uid, copyFromId ? { copyFromId } : {});
      if (res?.id) setSelectedId(res.id);
      toast.show(he ? "✓ העיצוב נוצר" : "✓ تم إنشاء التصميم");
    } catch (e) { onError(e); } finally { setBusy(false); }
  };
  const remove = (id) =>
    Alert.alert(
      he ? "מחיקת עיצוב" : "حذف التصميم",
      he ? "לא ניתן לבטל." : "لا يمكن التراجع.",
      [
        { text: he ? "ביטול" : "إلغاء", style: "cancel" },
        {
          text: he ? "מחק" : "حذف",
          style: "destructive",
          onPress: async () => {
            try {
              const res = await deleteDesign(uid, id);
              if (id === selectedId) setSelectedId(res?.defaultDesignId || null);
              toast.show(he ? "✓ נמחק" : "✓ تم الحذف");
            } catch (e) { onError(e); }
          },
        },
      ],
    );

  const submit = async () => {
    try { await submitDesignById(uid, selectedId); toast.show(he ? "✓ נשלח לאישור" : "✓ أُرسل للموافقة"); }
    catch (e) { onError(e); }
  };
  const cancelSubmit = async () => {
    try { await cancelDesignById(uid, selectedId); toast.show(he ? "בוטל" : "أُلغي"); }
    catch (e) { onError(e); }
  };

  const pickAndUpload = async (target) => {
    if (uploadBusy) return;
    const res = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images", "videos"],
      allowsMultipleSelection: target === "gallery",
      quality: 0.9,
      selectionLimit: target === "gallery" ? 0 : 1,
    });
    if (res.canceled) return;
    setUploadBusy(true);
    try {
      for (const a of res.assets || []) {
        const isVideo = a.type === "video";
        await ed.addMedia(
          { uri: a.uri, name: a.fileName || `media.${isVideo ? "mp4" : "jpg"}`, type: a.mimeType || (isVideo ? "video/mp4" : "image/jpeg") },
          target,
        );
      }
      toast.show(he ? "✓ הועלה" : "✓ تم الرفع");
    } catch (e) { onError(e); } finally { setUploadBusy(false); }
  };

  const captureAndUpload = async (target) => {
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) { toast.show(he ? "אין הרשאת מצלמה" : "لا يوجد إذن للكاميرا"); return; }
    const res = await ImagePicker.launchCameraAsync({ mediaTypes: ["images"], quality: 0.9 });
    if (res.canceled) return;
    setUploadBusy(true);
    try {
      const a = res.assets[0];
      await ed.addMedia({ uri: a.uri, name: a.fileName || "photo.jpg", type: a.mimeType || "image/jpeg" }, target);
      toast.show(he ? "✓ הועלה" : "✓ تم الرفع");
    } catch (e) { onError(e); } finally { setUploadBusy(false); }
  };

  // No designs yet.
  if (!designs.length) {
    return (
      <View style={styles.screen}>
        <ScreenHeader title={he ? "עיצוב" : "التصميم"} />
        <View style={styles.empty}>
          <Text style={styles.emptyText}>{he ? "אין עיצובים עדיין" : "لا توجد تصاميم بعد"}</Text>
          <Pressable style={[styles.goldBtn, styles.mt]} onPress={() => create()} disabled={busy}>
            <Text style={styles.goldBtnText}>➕ {he ? "צור עיצוב" : "إنشاء تصميم"}</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  const meta = DESIGN_STATUS_META[status] || DESIGN_STATUS_META.draft;

  return (
    <View style={styles.screen}>
      <ScreenHeader title={he ? "עיצוב" : "التصميم"} />
      <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
        {/* ── Switcher + status ─────────────────────────────────── */}
        <View style={styles.card}>
          <View style={styles.switcherRow}>
            {designs.map((d) => {
              const dm = DESIGN_STATUS_META[d.designStatus || "draft"] || meta;
              const label = (d.title && typeof d.title === "object" ? d.title[editLang] || d.title.ar : d.title) || (he ? "עיצוב" : "تصميم");
              return <Chip key={d.id} label={`${label}`} selected={d.id === selectedId} onPress={() => setSelectedId(d.id)} />;
            })}
          </View>
          <View style={styles.switcherBtns}>
            <Pressable style={styles.ghostBtn} onPress={() => create()} disabled={busy || designs.length >= 8}>
              <Text style={styles.ghostBtnText}>➕ {he ? "חדש" : "جديد"}</Text>
            </Pressable>
            <Pressable style={styles.ghostBtn} onPress={() => create(selectedId)} disabled={busy || designs.length >= 8}>
              <Text style={styles.ghostBtnText}>⧉ {he ? "שכפל" : "نسخ"}</Text>
            </Pressable>
            {designs.length > 1 ? (
              <Pressable style={styles.ghostBtn} onPress={() => remove(selectedId)}>
                <Text style={[styles.ghostBtnText, { color: C.red }]}>🗑 {he ? "מחק" : "حذف"}</Text>
              </Pressable>
            ) : null}
          </View>
          <View style={styles.statusRow}>
            <Text style={[styles.statusChip, { color: meta.color, borderColor: meta.color }]}>{L(meta, he)}</Text>
            <View style={styles.statusActions}>
              <Pressable style={styles.previewBtn} onPress={() => router.push({ pathname: "/design-preview", params: { id: selectedId, lang } })}>
                <Text style={styles.previewBtnText}>👁 {he ? "תצוגה" : "معاينة"}</Text>
              </Pressable>
              {status === "pending_approval" ? (
                <Pressable style={styles.ghostBtn} onPress={cancelSubmit}><Text style={styles.ghostBtnText}>{he ? "בטל שליחה" : "إلغاء الإرسال"}</Text></Pressable>
              ) : (
                <Pressable style={styles.goldBtnSm} onPress={submit}><Text style={styles.goldBtnText}>{he ? "שלח לאישור" : "إرسال للموافقة"}</Text></Pressable>
              )}
            </View>
          </View>
          {!editable ? (
            <Text style={styles.lockNote}>
              {status === "pending_approval"
                ? (he ? "ממתין לאישור מנהל — לקריאה בלבד." : "بانتظار موافقة الأدمن — للقراءة فقط.")
                : (he ? "מאושר — לעריכה, צור עותק חדש." : "معتمد — للتعديل، أنشئ نسخة جديدة.")}
            </Text>
          ) : null}
        </View>

        {/* Edit-language toggle */}
        <View style={styles.langToggle}>
          <Pressable style={[styles.langBtn, editLang === "ar" && styles.langBtnOn]} onPress={() => setEditLang("ar")}>
            <Text style={[styles.langBtnText, editLang === "ar" && styles.langBtnTextOn]}>العربية</Text>
          </Pressable>
          <Pressable style={[styles.langBtn, editLang === "he" && styles.langBtnOn]} onPress={() => setEditLang("he")}>
            <Text style={[styles.langBtnText, editLang === "he" && styles.langBtnTextOn]}>עברית</Text>
          </Pressable>
        </View>

        <View pointerEvents={editable ? "auto" : "none"} style={!editable && styles.dim}>
          {/* ── Theme ──────────────────────────────────────────── */}
          <Section title={he ? "ערכת צבעים" : "لوحة الألوان"}>
            <View style={styles.wrap}>
              {Object.values(DIGITAL_THEMES).map((th) => (
                <Pressable key={th.key} onPress={() => ed.pick("themeColor", th.key)} style={[styles.themeChip, ed.themeColor === th.key && styles.themeChipOn]}>
                  <View style={[styles.themeSwatch, { backgroundColor: th.swatch }]} />
                  <Text style={styles.themeLabel}>{L({ ar: th.label_ar, he: th.label_he }, he)}</Text>
                </Pressable>
              ))}
            </View>
          </Section>

          {/* ── Font ───────────────────────────────────────────── */}
          <Section title={he ? "גופן" : "الخط"}>
            <View style={styles.wrap}>
              {Object.values(DIGITAL_FONTS).map((fn) => (
                <Chip key={fn.key} label={L({ ar: fn.label_ar, he: fn.label_he }, he)} selected={ed.fontFamily === fn.key} onPress={() => ed.pick("fontFamily", fn.key)} />
              ))}
            </View>
          </Section>

          {/* ── Text fields ────────────────────────────────────── */}
          <Section title={he ? "טקסטים" : "النصوص"}>
            {SCALAR_KEYS.map((key) => {
              const localized = isLocalizedScalar(key);
              const value = localized ? ed.getLoc(key, editLang) : (typeof ed.f[key] === "string" ? ed.f[key] : "");
              return (
                <ScalarInput
                  key={key}
                  label={L(SCALAR_LABELS[key], he)}
                  value={value}
                  plain={PLAIN_SCALARS.has(key)}
                  onCommit={(text) => {
                    if (localized) { ed.setLoc(key, editLang, text); ed.flush(key, { ...(ed.f[key] && typeof ed.f[key] === "object" ? ed.f[key] : {}), [editLang]: text }); }
                    else { ed.setField(key, text); ed.flush(key, text); }
                  }}
                />
              );
            })}
            <DatePickerField
              label={he ? "תאריך החתונה" : "تاريخ الزفاف"}
              value={ed.f.weddingDate || null}
              onChange={(ms) => { ed.setField("weddingDate", ms); ed.flush("weddingDate", ms); }}
              placeholder={he ? "בחר תאריך" : "اختر التاريخ"}
            />
          </Section>

          {/* ── Section toggles ────────────────────────────────── */}
          <Section title={he ? "חלקים" : "الأقسام"}>
            {TOGGLE_KEYS.map((key) => (
              <View key={key} style={styles.toggleRow}>
                <Text style={styles.toggleLabel}>{L(TOGGLE_LABELS[key], he)}</Text>
                <Switch
                  value={ed.f[key] !== false}
                  onValueChange={(v) => ed.toggle(key, v)}
                  trackColor={{ true: C.gold, false: "#333" }}
                  thumbColor="#fff"
                />
              </View>
            ))}
          </Section>

          {/* ── Content arrays ─────────────────────────────────── */}
          {ARRAY_KEYS.map((key) => (
            <ArrayEditor
              key={key}
              he={he}
              editLang={editLang}
              title={L(ARRAY_LABELS[key], he)}
              rows={Array.isArray(ed.f[key]) ? ed.f[key] : []}
              fields={ARRAY_ROW_FIELDS[key]}
              onChange={(arr) => ed.commitArray(key, arr)}
            />
          ))}

          {/* ── Media ──────────────────────────────────────────── */}
          <MediaSection he={he} title={he ? "גלריה" : "المعرض"} items={ed.media} busy={uploadBusy}
            onPick={() => pickAndUpload("gallery")} onCapture={() => captureAndUpload("gallery")} onRemove={(m) => ed.removeMedia(m, "gallery")} />
          <MediaSection he={he} title={he ? "תמונת נושא" : "صورة الغلاف"} items={ed.heroMedia} busy={uploadBusy}
            onPick={() => pickAndUpload("hero")} onCapture={() => captureAndUpload("hero")} onRemove={(m) => ed.removeMedia(m, "hero")} />

          {/* ── 3D envelope overrides ──────────────────────────── */}
          <Section title={he ? "מעטפה תלת-ממד" : "الظرف ثلاثي الأبعاد"}>
            {ENV_COLORS.map((sk) => (
              <HexField key={sk} label={L(ENV_COLOR_LABELS[sk], he)} value={ed.envelope[sk] || ""} onCommit={(v) => ed.setNested("envelope", sk, v)} />
            ))}
            <Stepper label={he ? "צפיפות כוכבים" : "كثافة النجوم"} value={ed.envelope.starDensity ?? 2} min={1} max={4} step={1} onChange={(v) => ed.setNested("envelope", "starDensity", v)} />
            <Stepper label={he ? "עוצמת כוכבים" : "شدة النجوم"} value={ed.envelope.starIntensity ?? 0.5} min={0} max={1} step={0.25} onChange={(v) => ed.setNested("envelope", "starIntensity", v)} />
          </Section>

          {/* ── Custom background ──────────────────────────────── */}
          <Section title={he ? "רקע מותאם" : "خلفية مخصّصة"}>
            <View style={styles.toggleRow}>
              <Text style={styles.toggleLabel}>{he ? "השתמש ברקע שלי" : "استخدم خلفيتي"}</Text>
              <Switch value={ed.background.enabled === true} onValueChange={(v) => ed.setNested("background", "enabled", v || null)} trackColor={{ true: C.gold, false: "#333" }} thumbColor="#fff" />
            </View>
            {ed.background.enabled ? (
              <>
                <HexField label={he ? "צבע רקע" : "لون الخلفية"} value={ed.background.color || ""} onCommit={(v) => ed.setNested("background", "color", v)} />
                <View style={styles.toggleRow}>
                  <Text style={styles.toggleLabel}>{he ? "מעבר צבע" : "تدرّج"}</Text>
                  <Switch value={ed.background.gradient === true} onValueChange={(v) => ed.setNested("background", "gradient", v || null)} trackColor={{ true: C.gold, false: "#333" }} thumbColor="#fff" />
                </View>
                {ed.background.gradient ? (
                  <>
                    <HexField label={he ? "מ־" : "من"} value={ed.background.gradientFrom || ""} onCommit={(v) => ed.setNested("background", "gradientFrom", v)} />
                    <HexField label={he ? "אל" : "إلى"} value={ed.background.gradientTo || ""} onCommit={(v) => ed.setNested("background", "gradientTo", v)} />
                  </>
                ) : null}
                <Stepper label={he ? "עיגולים" : "الدوائر"} value={ed.background.circleCount ?? 0} min={0} max={6} step={1} onChange={(v) => ed.setNested("background", "circleCount", v)} />
                <HexField label={he ? "צבע עיגולים" : "لون الدوائر"} value={ed.background.circleColor || ""} onCommit={(v) => ed.setNested("background", "circleColor", v)} />
                <View style={styles.toggleRow}>
                  <Text style={styles.toggleLabel}>{he ? "עלי כותרת" : "بتلات"}</Text>
                  <Switch value={ed.background.petals === true} onValueChange={(v) => ed.setNested("background", "petals", v || null)} trackColor={{ true: C.gold, false: "#333" }} thumbColor="#fff" />
                </View>
                <View style={styles.toggleRow}>
                  <Text style={styles.toggleLabel}>{he ? "נצנוצים" : "لمعان"}</Text>
                  <Switch value={ed.background.sparkles === true} onValueChange={(v) => ed.setNested("background", "sparkles", v || null)} trackColor={{ true: C.gold, false: "#333" }} thumbColor="#fff" />
                </View>
                <View style={styles.bgImgRow}>
                  {ed.background.image?.url ? (
                    <>
                      <Image source={{ uri: ed.background.image.url }} style={styles.bgThumb} />
                      <Pressable style={styles.ghostBtn} onPress={() => ed.removeMedia(ed.background.image, "background")}><Text style={[styles.ghostBtnText, { color: C.red }]}>🗑 {he ? "הסר" : "حذف"}</Text></Pressable>
                    </>
                  ) : (
                    <Pressable style={[styles.ghostBtn, uploadBusy && styles.dim]} onPress={() => pickAndUpload("background")}><Text style={styles.ghostBtnText}>🖼 {he ? "העלה רקע" : "رفع خلفية"}</Text></Pressable>
                  )}
                </View>
              </>
            ) : null}
          </Section>
        </View>
      </ScrollView>
    </View>
  );
}

// A scalar text input that commits on blur (mirrors the web autosave-on-blur).
function ScalarInput({ label, value, plain, onCommit }) {
  const [v, setV] = useState(value || "");
  useEffect(() => setV(value || ""), [value]);
  return (
    <View style={styles.field}>
      <Text style={styles.subLabel}>{label}</Text>
      <TextInput
        style={[styles.input, plain && styles.ltr]}
        value={v}
        onChangeText={setV}
        onBlur={() => onCommit(v)}
        placeholderTextColor={C.dim}
        autoCapitalize="none"
      />
    </View>
  );
}

// Generic array editor — add / edit (per-language) / remove rows. mealOptions has
// no sub-fields: each row is a bare localized string held under the "" field.
function ArrayEditor({ he, editLang, title, rows, fields, onChange }) {
  const isBare = !fields.length;
  const addRow = () => onChange([...rows, isBare ? { ar: "", he: "" } : {}]);
  const removeRow = (i) => onChange(rows.filter((_, idx) => idx !== i));
  const setCell = (i, field, text) => {
    const next = rows.map((r, idx) => {
      if (idx !== i) return r;
      if (isBare) return { ...(r && typeof r === "object" ? r : {}), [editLang]: text };
      const cur = r[field] && typeof r[field] === "object" ? r[field] : {};
      return { ...r, [field]: { ...cur, [editLang]: text } };
    });
    onChange(next);
  };
  return (
    <Section title={title} right={<Pressable onPress={addRow}><Text style={styles.addRow}>➕</Text></Pressable>}>
      {rows.length === 0 ? <Text style={styles.subLabel}>{he ? "— ריק —" : "— فارغ —"}</Text> : null}
      {rows.map((row, i) => (
        <View key={i} style={styles.arrRow}>
          {isBare ? (
            <ArrCell value={row?.[editLang] || ""} onCommit={(txt) => setCell(i, "", txt)} placeholder={he ? "אפשרות" : "خيار"} />
          ) : (
            fields.map((fld) => (
              <ArrCell
                key={fld}
                label={L(ROW_FIELD_LABELS[fld], he)}
                value={(row[fld] && typeof row[fld] === "object" ? row[fld][editLang] : row[fld]) || ""}
                onCommit={(txt) => setCell(i, fld, txt)}
              />
            ))
          )}
          <Pressable onPress={() => removeRow(i)} hitSlop={8}><Text style={styles.delRow}>🗑</Text></Pressable>
        </View>
      ))}
    </Section>
  );
}

function ArrCell({ label, value, placeholder, onCommit }) {
  const [v, setV] = useState(value || "");
  useEffect(() => setV(value || ""), [value]);
  return (
    <View style={styles.arrCell}>
      {label ? <Text style={styles.subLabel}>{label}</Text> : null}
      <TextInput style={styles.input} value={v} onChangeText={setV} onBlur={() => onCommit(v)} placeholder={placeholder} placeholderTextColor={C.dim} />
    </View>
  );
}

function MediaSection({ he, title, items, busy, onPick, onCapture, onRemove }) {
  return (
    <Section
      title={title}
      right={
        <View style={styles.mediaBtns}>
          <Pressable onPress={busy ? undefined : onPick} style={[styles.tinyBtn, busy && styles.dim]}><Text style={styles.tinyBtnText}>🖼</Text></Pressable>
          <Pressable onPress={busy ? undefined : onCapture} style={[styles.tinyBtn, busy && styles.dim]}><Text style={styles.tinyBtnText}>📷</Text></Pressable>
        </View>
      }
    >
      <View style={styles.mediaWrap}>
        {items.length === 0 ? <Text style={styles.subLabel}>{he ? "— אין —" : "— لا شيء —"}</Text> : null}
        {items.map((m) => (
          <View key={m.storagePath || m.url} style={styles.mediaTile}>
            {String(m.kind || "").startsWith("video") || /\.(mp4|mov)$/i.test(m.url || "") ? (
              <View style={[styles.mediaThumb, styles.videoThumb]}><Text style={styles.videoGlyph}>🎬</Text></View>
            ) : (
              <Image source={{ uri: m.url }} style={styles.mediaThumb} />
            )}
            <IconButton glyph="✕" color={C.red} size={26} onPress={() => onRemove(m)} />
          </View>
        ))}
      </View>
    </Section>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: C.bg },
  body: { padding: space[4], paddingBottom: space[16], gap: space[3] },
  empty: { padding: space[8], alignItems: "center" },
  emptyText: { color: C.dim, fontSize: type.md },
  mt: { marginTop: space[4] },
  dim: { opacity: 0.5 },
  card: { backgroundColor: "#0f0f15", borderColor: "rgba(201,168,76,0.18)", borderWidth: 1, borderRadius: radius.xl, padding: space[4], gap: space[2] },
  switcherRow: { flexDirection: "row", flexWrap: "wrap" },
  switcherBtns: { flexDirection: "row", gap: space[2], flexWrap: "wrap" },
  statusRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: space[2], gap: space[2] },
  statusChip: { borderWidth: 1, borderRadius: radius.pill, paddingHorizontal: space[3], paddingVertical: 2, fontSize: type.xs, fontWeight: "800" },
  statusActions: { flexDirection: "row", gap: space[2], alignItems: "center" },
  previewBtn: { borderColor: C.gold, borderWidth: 1, borderRadius: radius.md, paddingHorizontal: space[3], paddingVertical: space[2] },
  previewBtnText: { color: C.gold, fontSize: type.sm, fontWeight: "800" },
  lockNote: { color: C.dim, fontSize: type.xs, textAlign: "right", marginTop: space[1] },
  langToggle: { flexDirection: "row", gap: space[2] },
  langBtn: { flex: 1, paddingVertical: space[2], borderRadius: radius.md, borderColor: "rgba(201,168,76,0.3)", borderWidth: 1, alignItems: "center" },
  langBtnOn: { backgroundColor: "rgba(201,168,76,0.18)", borderColor: C.gold },
  langBtnText: { color: C.dim, fontWeight: "800", fontSize: type.sm },
  langBtnTextOn: { color: C.gold },
  section: { backgroundColor: "#0f0f15", borderColor: "rgba(255,255,255,0.07)", borderWidth: 1, borderRadius: radius.xl, padding: space[4], gap: space[2] },
  sectionHead: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  sectionTitle: { color: C.goldLight, fontSize: type.md, fontWeight: "800", textAlign: "right" },
  wrap: { flexDirection: "row", flexWrap: "wrap", gap: space[1] },
  themeChip: { flexDirection: "row", alignItems: "center", gap: space[1], paddingHorizontal: space[2], paddingVertical: space[1], borderRadius: radius.pill, borderColor: "rgba(255,255,255,0.12)", borderWidth: 1, margin: 2 },
  themeChipOn: { borderColor: C.gold, backgroundColor: "rgba(201,168,76,0.15)" },
  themeSwatch: { width: 16, height: 16, borderRadius: 8 },
  themeLabel: { color: C.goldDim, fontSize: type.xs },
  field: { gap: space[1] },
  subLabel: { color: C.goldDim, fontSize: type.xs, fontWeight: "700", textAlign: "right" },
  input: { backgroundColor: "rgba(255,255,255,0.04)", borderColor: "rgba(201,168,76,0.3)", borderWidth: 1, borderRadius: radius.md, paddingHorizontal: space[3], paddingVertical: space[2], color: C.goldLight, fontSize: type.md, textAlign: "right" },
  ltr: { textAlign: "left", writingDirection: "ltr" },
  toggleRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingVertical: space[1] },
  toggleLabel: { color: C.goldLight, fontSize: type.sm, textAlign: "right", flex: 1 },
  addRow: { color: C.gold, fontSize: type.lg },
  arrRow: { flexDirection: "row", alignItems: "flex-end", gap: space[2], borderTopColor: "rgba(255,255,255,0.06)", borderTopWidth: 1, paddingTop: space[2] },
  arrCell: { flex: 1, gap: space[1] },
  delRow: { color: C.red, fontSize: type.md, paddingBottom: space[2] },
  mediaBtns: { flexDirection: "row", gap: space[2] },
  tinyBtn: { paddingHorizontal: space[2], paddingVertical: space[1], borderRadius: radius.md, borderColor: "rgba(201,168,76,0.3)", borderWidth: 1 },
  tinyBtnText: { fontSize: type.md },
  mediaWrap: { flexDirection: "row", flexWrap: "wrap", gap: space[2] },
  mediaTile: { position: "relative" },
  mediaThumb: { width: 72, height: 72, borderRadius: radius.md, backgroundColor: "#1a1a22" },
  videoThumb: { alignItems: "center", justifyContent: "center" },
  videoGlyph: { fontSize: 26 },
  bgImgRow: { flexDirection: "row", alignItems: "center", gap: space[2], marginTop: space[1] },
  bgThumb: { width: 56, height: 56, borderRadius: radius.md },
  hexRow: { flexDirection: "row", alignItems: "center", gap: space[2] },
  swatch: { width: 28, height: 28, borderRadius: radius.md, borderColor: "rgba(255,255,255,0.2)", borderWidth: 1 },
  hexMain: { flex: 1, gap: space[1] },
  hexInput: { backgroundColor: "rgba(255,255,255,0.04)", borderColor: "rgba(201,168,76,0.3)", borderWidth: 1, borderRadius: radius.md, paddingHorizontal: space[3], paddingVertical: space[2], color: C.goldLight, fontSize: type.sm, textAlign: "left", writingDirection: "ltr" },
  stepRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingVertical: space[1] },
  stepCtrls: { flexDirection: "row", alignItems: "center", gap: space[3] },
  stepBtn: { width: 32, height: 32, borderRadius: radius.md, backgroundColor: "rgba(201,168,76,0.15)", alignItems: "center", justifyContent: "center" },
  stepBtnText: { color: C.gold, fontSize: type.lg, fontWeight: "800" },
  stepVal: { color: C.goldLight, fontSize: type.md, fontWeight: "800", minWidth: 34, textAlign: "center" },
  goldBtn: { paddingVertical: space[3], paddingHorizontal: space[4], borderRadius: radius.md, backgroundColor: C.gold, alignItems: "center" },
  goldBtnSm: { paddingVertical: space[2], paddingHorizontal: space[3], borderRadius: radius.md, backgroundColor: C.gold },
  goldBtnText: { color: C.bg, fontSize: type.sm, fontWeight: "800" },
  ghostBtn: { paddingVertical: space[2], paddingHorizontal: space[3], borderRadius: radius.md, borderColor: "rgba(201,168,76,0.4)", borderWidth: 1 },
  ghostBtnText: { color: C.goldLight, fontSize: type.sm, fontWeight: "800" },
});
