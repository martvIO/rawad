// Digital invitation — Add guest (native port of the web DigitalAddGuest).
// Single add + bulk paste/import. Validation: name 2+ words, +972 & exactly 9
// national digits, duplicate-phone blocked (canonical intl compare). Bulk: paste
// "Name, Phone" lines (parseGuestLines) or import a .vcf/.csv via the built-in
// expo-file-system picker → contactsTextToLines. Reached as a push screen from
// the Guests header "➕" button; navigates back on success.
import { useState, useMemo } from "react";
import {
  View,
  Text,
  TextInput,
  Pressable,
  ScrollView,
  StyleSheet,
} from "react-native";
import { useRouter } from "expo-router";
import { File } from "expo-file-system";
import { ScreenHeader } from "../../src/ui/ScreenHeader.jsx";
import { usePortal } from "../../src/portal/PortalContext.jsx";
import { useGroomDigital } from "../../src/portal/useGroomDigital.jsx";
import { useToast } from "../../src/ui/Toast.jsx";
import { Chip } from "../../src/ui/primitives.jsx";
import { parseGuestLines, toLocalIL } from "@dawa/core/utils/bulkGuests.js";
import { contactsTextToLines } from "@dawa/core/utils/contactsImport.js";
import { toIntlPhone } from "@dawa/core/utils/phone.js";
import { localizeApiError } from "@dawa/core/utils/apiError.js";
import { C, space, radius, type } from "../../src/ui/theme.js";

export default function AddGuest() {
  const { lang, t } = usePortal();
  const he = lang === "he";
  const { ranks: availableRanks, guests, addGuest } = useGroomDigital();
  const toast = useToast();
  const router = useRouter();

  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [selectedRanks, setSelectedRanks] = useState([]);
  const [saving, setSaving] = useState(false);

  const [bulkOpen, setBulkOpen] = useState(false);
  const [bulkText, setBulkText] = useState("");
  const [bulkBusy, setBulkBusy] = useState(false);
  const [bulkProgress, setBulkProgress] = useState({ done: 0, total: 0 });
  const [importBusy, setImportBusy] = useState(false);

  const nameWords = name.trim().split(/\s+/).filter(Boolean);
  const phoneDigits = phone.replace(/\D/g, "").slice(0, 9); // 9 national digits after +972
  const nameOk = nameWords.length >= 2;
  const phoneOk = phoneDigits.length === 9;
  const newIntl = phoneOk ? toIntlPhone("0" + phoneDigits) : "";
  const isDuplicate = phoneOk && guests.some((g) => toIntlPhone(g.phone) === newIntl);
  const canSubmit = nameOk && phoneOk && !isDuplicate && !saving;

  const nameErr = name.trim() && !nameOk ? (he ? "שם חייב להכיל לפחות 2 מילים" : "يجب أن يحتوي الاسم على كلمتين على الأقل") : null;
  const phoneErr = phone && !phoneOk
    ? (he ? "9 ספרות בדיוק" : "9 أرقام بالضبط")
    : isDuplicate
      ? (he ? "המספר כבר קיים ברשימה" : "هذا الرقم مضاف مسبقاً لهذا العريس")
      : null;

  const toggleRank = (r) => setSelectedRanks((p) => (p.includes(r) ? p.filter((x) => x !== r) : [...p, r]));

  const cleanRanks = () => selectedRanks.filter((r) => availableRanks.includes(r));

  const submit = async () => {
    if (!nameOk) { toast.show(nameErr || (he ? "שם לא תקין" : "الاسم غير صحيح")); return; }
    if (!phoneOk) { toast.show(he ? "9 ספרות בדיוק" : "9 أرقام بالضبط"); return; }
    if (isDuplicate) { toast.show(he ? "המספר כבר קיים ברשימה" : "هذا الرقم مضاف مسبقاً لهذا العريس"); return; }
    if (saving) return;
    setSaving(true);
    try {
      await addGuest({ name: name.trim(), phone: "0" + phoneDigits, ranks: cleanRanks() });
      toast.show(he ? "✓ המוזמן נוסף" : "✓ تم إضافة المدعو");
      router.back();
    } catch (err) {
      const code = err?.body?.error || "";
      if (code === "duplicate_phone") toast.show(he ? "המספר כבר קיים ברשימה" : "هذا الرقم مضاف مسبقاً لهذا العريس");
      else toast.show("✗ " + localizeApiError(err, t));
    } finally {
      setSaving(false);
    }
  };

  const importFile = async () => {
    if (importBusy) return;
    setImportBusy(true);
    try {
      const picked = await File.pickFileAsync({
        mimeTypes: ["text/vcard", "text/x-vcard", "text/csv", "text/comma-separated-values", "text/plain", "*/*"],
      });
      if (picked?.canceled || !picked?.result) return;
      const f = picked.result;
      const text = await f.text();
      const lines = contactsTextToLines(text, f.name || f.uri || "");
      if (!lines.trim()) {
        toast.show(he ? "לא נמצאו אנשי קשר בקובץ" : "لم يتم العثور على جهات اتصال في الملف");
      } else {
        setBulkText((prev) => (prev.trim() ? prev.trim() + "\n" + lines : lines));
        setBulkOpen(true);
      }
    } catch {
      toast.show(he ? "קריאת הקובץ נכשלה" : "تعذّر قراءة الملف");
    } finally {
      setImportBusy(false);
    }
  };

  const bulkParsed = useMemo(() => {
    const existingLocals = new Set(guests.map((g) => toLocalIL(g.phone)).filter(Boolean));
    return parseGuestLines(bulkText, existingLocals);
  }, [bulkText, guests]);

  const runBulkAdd = async () => {
    const valids = bulkParsed.rows.filter((r) => r.valid);
    if (!valids.length) { toast.show(he ? "אין שורות תקינות להוספה" : "لا توجد صفوف صالحة للإضافة"); return; }
    const ranks = cleanRanks();
    setBulkBusy(true);
    let added = 0;
    let failed = 0;
    for (const r of valids) {
      try {
        await addGuest({ name: r.name, phone: r.phone, ranks });
        added++;
      } catch {
        failed++;
      }
      setBulkProgress({ done: added + failed, total: valids.length });
    }
    setBulkBusy(false);
    toast.show(
      he
        ? `✓ נוספו ${added}${failed ? ` · ${failed} נכשלו` : ""}`
        : `✓ تمت إضافة ${added}${failed ? ` · فشل ${failed}` : ""}`,
    );
    if (added > 0) router.back();
  };

  const stats = bulkParsed.stats;

  return (
    <View style={styles.screen}>
      <ScreenHeader title={he ? "הוסף מוזמן" : "إضافة مدعو"} />
      <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
        {/* ── Bulk import ─────────────────────────────────────────── */}
        <View style={styles.card}>
          <Pressable style={styles.bulkHead} onPress={() => setBulkOpen((o) => !o)}>
            <Text style={styles.bulkHeadText}>
              📋 {he ? "הוספה מרובה (הדבקת רשימה)" : "إضافة جماعية (لصق قائمة)"}
            </Text>
            <Text style={styles.chevron}>{bulkOpen ? "▲" : "▼"}</Text>
          </Pressable>
          {bulkOpen ? (
            <View style={styles.bulkBody}>
              <Pressable
                style={[styles.ghostBtn, importBusy && styles.dim]}
                onPress={importFile}
                disabled={importBusy}
              >
                <Text style={styles.ghostBtnText}>
                  {importBusy
                    ? (he ? "קורא קובץ…" : "جاري قراءة الملف…")
                    : (he ? "📇 ייבוא מאנשי קשר (‎.vcf / ‎.csv)" : "📇 استيراد من جهات الاتصال (‎.vcf / ‎.csv)")}
                </Text>
              </Pressable>
              <Text style={styles.helpText}>
                {he
                  ? "או הדביקו שורה לכל מוזמן: שם מלא, טלפון"
                  : "أو الصق سطراً لكل مدعو بالصيغة: الاسم الكامل، رقم الهاتف"}
              </Text>
              <TextInput
                style={[styles.input, styles.textarea]}
                value={bulkText}
                onChangeText={setBulkText}
                multiline
                numberOfLines={6}
                placeholder={he ? "מוחמד אחמד, 0524264094" : "محمد أحمد، 0524264094"}
                placeholderTextColor={C.dim}
                textAlignVertical="top"
              />
              {bulkText.trim() ? (
                <View style={styles.statsRow}>
                  <Text style={styles.statOk}>✓ {stats.valid} {he ? "תקינים" : "صالح"}</Text>
                  {stats.invalid > 0 ? <Text style={styles.statBad}>⚠ {stats.invalid} {he ? "שגויים" : "خطأ"}</Text> : null}
                  {stats.duplicate > 0 ? <Text style={styles.statDup}>⧉ {stats.duplicate} {he ? "כפולים" : "مكرر"}</Text> : null}
                </View>
              ) : null}
              <Pressable
                style={[styles.goldBtn, (bulkBusy || stats.valid === 0) && styles.dim]}
                onPress={bulkBusy || stats.valid === 0 ? undefined : runBulkAdd}
              >
                <Text style={styles.goldBtnText}>
                  {bulkBusy
                    ? `${bulkProgress.done} / ${bulkProgress.total}…`
                    : (he ? `הוסף ${stats.valid} מוזמנים` : `إضافة ${stats.valid} مدعو`)}
                </Text>
              </Pressable>
              <Text style={styles.helpTextSm}>
                {he
                  ? "💡 רמות שנבחרו למטה יחולו על כל המוזמנים שיתווספו."
                  : "💡 الرتب المحددة بالأسفل ستُطبَّق على كل المدعوين المُضافين."}
              </Text>
            </View>
          ) : null}
        </View>

        {/* ── Single add ──────────────────────────────────────────── */}
        <View style={styles.card}>
          <Text style={styles.fieldLabel}>{he ? "שם מלא (2 מילים לפחות) *" : "الاسم الكامل (كلمتان على الأقل) *"}</Text>
          <TextInput
            style={styles.input}
            value={name}
            onChangeText={setName}
            placeholder={he ? "מוחמד אחמד" : "محمد أحمد"}
            placeholderTextColor={C.dim}
          />
          {nameErr ? <Text style={styles.err}>⚠ {nameErr}</Text> : null}

          <Text style={[styles.fieldLabel, styles.mt]}>{he ? "מספר טלפון (+972 — 9 ספרות) *" : "رقم الهاتف (+972 — 9 أرقام) *"}</Text>
          <View style={styles.phoneRow}>
            <View style={styles.prefix}>
              <Text style={styles.prefixText}>+972</Text>
            </View>
            <TextInput
              style={[styles.input, styles.phoneInput]}
              value={phone}
              onChangeText={(v) => setPhone(v.replace(/\D/g, "").slice(0, 9))}
              keyboardType="phone-pad"
              placeholder="521234567"
              placeholderTextColor={C.dim}
              maxLength={9}
            />
          </View>
          {phoneErr ? <Text style={styles.err}>⚠ {phoneErr}</Text> : null}
          <Text style={[styles.counter, { color: phoneOk && !isDuplicate ? "#4cc97a" : phoneDigits.length ? C.dim : "transparent" }]}>
            {phoneDigits.length} / 9
          </Text>

          <View style={styles.rankHead}>
            <Text style={styles.fieldLabel}>{he ? "רמות המוזמן (אפשר כמה)" : "رتب المدعو (يمكن اختيار عدة)"}</Text>
            {selectedRanks.length > 0 ? (
              <Text style={styles.rankCount}>{selectedRanks.length} {he ? "נבחרו" : "محددة"}</Text>
            ) : null}
          </View>
          {availableRanks.length === 0 ? (
            <Text style={styles.noRanks}>{he ? "אין רמות — הוסף ברשימה הראשית" : "لا توجد رتب — أضفها في الرئيسية"}</Text>
          ) : (
            <View style={styles.chipWrap}>
              {availableRanks.map((r) => (
                <Chip key={r} label={r} selected={selectedRanks.includes(r)} onPress={() => toggleRank(r)} />
              ))}
            </View>
          )}

          <Pressable style={[styles.goldBtn, styles.mtLg, !canSubmit && styles.dim]} onPress={canSubmit ? submit : undefined}>
            <Text style={styles.goldBtnText}>
              {saving ? (he ? "מוסיף..." : "جاري الإضافة...") : `➕ ${he ? "הוסף מוזמן" : "إضافة المدعو"}`}
            </Text>
          </Pressable>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: C.bg },
  body: { padding: space[4], paddingBottom: space[12], gap: space[3] },
  card: {
    backgroundColor: "#0f0f15",
    borderColor: "rgba(201,168,76,0.18)",
    borderWidth: 1,
    borderRadius: radius.xl,
    padding: space[4],
  },
  bulkHead: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  bulkHeadText: { color: C.goldLight, fontSize: type.md, fontWeight: "800" },
  chevron: { color: C.dim, fontSize: type.md },
  bulkBody: { marginTop: space[3], gap: space[2] },
  helpText: { color: C.dim, fontSize: type.sm, lineHeight: 20, textAlign: "right" },
  helpTextSm: { color: C.dim, fontSize: type.xs, lineHeight: 18, textAlign: "right" },
  fieldLabel: { color: C.goldDim, fontSize: type.sm, fontWeight: "700", textAlign: "right" },
  mt: { marginTop: space[3] },
  mtLg: { marginTop: space[4] },
  input: {
    backgroundColor: "rgba(255,255,255,0.04)",
    borderColor: "rgba(201,168,76,0.3)",
    borderWidth: 1,
    borderRadius: radius.md,
    paddingHorizontal: space[3],
    paddingVertical: space[3],
    color: C.goldLight,
    fontSize: type.lg,
    textAlign: "right",
    marginTop: space[1],
  },
  textarea: { minHeight: 120, textAlign: "right" },
  phoneRow: { flexDirection: "row", alignItems: "stretch", direction: "ltr", marginTop: space[1] },
  prefix: {
    justifyContent: "center",
    paddingHorizontal: space[3],
    backgroundColor: "rgba(255,255,255,0.06)",
    borderColor: "rgba(255,255,255,0.10)",
    borderWidth: 1,
    borderRightWidth: 0,
    borderTopLeftRadius: radius.md,
    borderBottomLeftRadius: radius.md,
  },
  prefixText: { color: C.goldLight, fontWeight: "800", fontSize: type.lg },
  phoneInput: { flex: 1, minWidth: 0, textAlign: "left", writingDirection: "ltr", borderTopLeftRadius: 0, borderBottomLeftRadius: 0, marginTop: 0 },
  counter: { fontSize: type.xs, textAlign: "left", marginTop: space[1], writingDirection: "ltr" },
  err: { color: C.red, fontSize: type.xs, marginTop: space[1], textAlign: "right" },
  rankHead: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginTop: space[3] },
  rankCount: { color: C.gold, fontSize: type.xs, fontWeight: "700" },
  noRanks: {
    marginTop: space[2],
    padding: space[3],
    borderRadius: radius.md,
    borderColor: "rgba(255,255,255,0.12)",
    borderWidth: 1,
    borderStyle: "dashed",
    color: C.dim,
    fontSize: type.sm,
    textAlign: "center",
  },
  chipWrap: { flexDirection: "row", flexWrap: "wrap", marginTop: space[2] },
  statsRow: { flexDirection: "row", flexWrap: "wrap", gap: space[3] },
  statOk: { color: "#4cc97a", fontSize: type.sm, fontWeight: "700" },
  statBad: { color: C.red, fontSize: type.sm },
  statDup: { color: "#d4a14b", fontSize: type.sm },
  ghostBtn: {
    paddingVertical: space[3],
    paddingHorizontal: space[3],
    borderRadius: radius.md,
    borderColor: "rgba(201,168,76,0.4)",
    borderWidth: 1,
    backgroundColor: "rgba(201,168,76,0.10)",
    alignItems: "center",
  },
  ghostBtnText: { color: C.goldLight, fontSize: type.sm, fontWeight: "800" },
  goldBtn: { paddingVertical: space[3], borderRadius: radius.md, backgroundColor: C.gold, alignItems: "center" },
  goldBtnText: { color: C.bg, fontSize: type.md, fontWeight: "800" },
  dim: { opacity: 0.45 },
});
