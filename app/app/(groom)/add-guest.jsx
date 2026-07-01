// Digital invitation — Add guest (native port of the web DigitalAddGuest).
// Single add + bulk paste/contacts. Validation: name 2+ words, +972 & exactly 9
// national digits, duplicate-phone blocked (canonical intl compare). Bulk: paste
// "Name, Phone" lines (parseGuestLines) OR pick from the phone's contacts
// (expo-contacts, permission-gated multi-select). Reached as a push screen from
// the Guests header "➕" button; navigates back on success.
import { useState, useMemo } from "react";
import {
  View,
  Text,
  TextInput,
  Pressable,
  ScrollView,
  FlatList,
  Modal,
  StyleSheet,
} from "react-native";
import { useRouter } from "expo-router";
import * as Contacts from "expo-contacts";
import { ScreenHeader } from "../../src/ui/ScreenHeader.jsx";
import { usePortal } from "../../src/portal/PortalContext.jsx";
import { useGroomDigital } from "../../src/portal/useGroomDigital.jsx";
import { useToast } from "../../src/ui/Toast.jsx";
import { Chip } from "../../src/ui/primitives.jsx";
import { parseGuestLines, toLocalIL } from "@dawa/core/utils/bulkGuests.js";
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

  // Contacts multi-select (replaces the file import).
  const [contactsBusy, setContactsBusy] = useState(false);
  const [contactsOpen, setContactsOpen] = useState(false);
  const [contactList, setContactList] = useState([]); // [{ id, name, phone }]
  const [contactSel, setContactSel] = useState(() => new Set());
  const [contactQuery, setContactQuery] = useState("");

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

  // Ask for Contacts permission, load the device contacts that have a phone,
  // and open the multi-select modal.
  const openContacts = async () => {
    if (contactsBusy) return;
    setContactsBusy(true);
    try {
      const perm = await Contacts.requestPermissionsAsync();
      if (!perm.granted) {
        toast.show(he ? "אין הרשאה לאנשי קשר" : "لا يوجد إذن للوصول إلى جهات الاتصال");
        return;
      }
      const { data } = await Contacts.getContactsAsync({
        fields: [Contacts.Fields.Name, Contacts.Fields.PhoneNumbers],
      });
      const rows = [];
      for (const c of data || []) {
        const num = c.phoneNumbers?.find((p) => p?.number)?.number;
        const name = (c.name || "").trim();
        if (!num || !name) continue;
        rows.push({ id: c.id || `${name}-${num}`, name, phone: num });
      }
      if (!rows.length) {
        toast.show(he ? "לא נמצאו אנשי קשר עם טלפון" : "لا توجد جهات اتصال بأرقام هاتف");
        return;
      }
      // Sort by name for a scannable list.
      rows.sort((a, b) => a.name.localeCompare(b.name));
      setContactList(rows);
      setContactSel(new Set());
      setContactQuery("");
      setContactsOpen(true);
    } catch {
      toast.show(he ? "טעינת אנשי קשר נכשלה" : "تعذّر تحميل جهات الاتصال");
    } finally {
      setContactsBusy(false);
    }
  };

  const toggleContact = (id) =>
    setContactSel((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  // Append the checked contacts as "Name, Phone" lines into the bulk textarea,
  // then reuse the existing parse-preview + runBulkAdd pipeline.
  const addSelectedContacts = () => {
    const lines = contactList
      .filter((c) => contactSel.has(c.id))
      .map((c) => `${c.name.replace(/[,\t]/g, " ").trim()}, ${c.phone.trim()}`)
      .join("\n");
    if (!lines) {
      setContactsOpen(false);
      return;
    }
    setBulkText((prev) => (prev.trim() ? prev.trim() + "\n" + lines : lines));
    setBulkOpen(true);
    setContactsOpen(false);
  };

  const filteredContacts = useMemo(() => {
    const q = contactQuery.trim().toLowerCase();
    if (!q) return contactList;
    return contactList.filter((c) => c.name.toLowerCase().includes(q) || c.phone.includes(q));
  }, [contactList, contactQuery]);

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
                style={[styles.ghostBtn, contactsBusy && styles.dim]}
                onPress={openContacts}
                disabled={contactsBusy}
              >
                <Text style={styles.ghostBtnText}>
                  {contactsBusy
                    ? (he ? "טוען אנשי קשר…" : "جاري تحميل جهات الاتصال…")
                    : (he ? "📇 בחירה מאנשי קשר" : "📇 اختيار من جهات الاتصال")}
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

      {/* ── Contacts multi-select modal ─────────────────────────── */}
      <Modal visible={contactsOpen} animationType="slide" onRequestClose={() => setContactsOpen(false)}>
        <View style={styles.modalScreen}>
          <View style={styles.modalBar}>
            <Pressable onPress={() => setContactsOpen(false)} hitSlop={10}>
              <Text style={styles.modalCancel}>{he ? "ביטול" : "إلغاء"}</Text>
            </Pressable>
            <Text style={styles.modalTitle}>{he ? "בחר אנשי קשר" : "اختر جهات الاتصال"}</Text>
            <Pressable onPress={addSelectedContacts} hitSlop={10} disabled={contactSel.size === 0}>
              <Text style={[styles.modalAdd, contactSel.size === 0 && styles.dim]}>
                {he ? `הוסף (${contactSel.size})` : `إضافة (${contactSel.size})`}
              </Text>
            </Pressable>
          </View>
          <TextInput
            style={styles.modalSearch}
            value={contactQuery}
            onChangeText={setContactQuery}
            placeholder={he ? "חיפוש" : "بحث"}
            placeholderTextColor={C.dim}
          />
          <FlatList
            data={filteredContacts}
            keyExtractor={(c) => c.id}
            keyboardShouldPersistTaps="handled"
            renderItem={({ item }) => {
              const on = contactSel.has(item.id);
              return (
                <Pressable style={styles.contactRow} onPress={() => toggleContact(item.id)}>
                  <View style={[styles.checkbox, on && styles.checkboxOn]}>
                    {on ? <Text style={styles.checkmark}>✓</Text> : null}
                  </View>
                  <View style={styles.contactMain}>
                    <Text style={styles.contactName} numberOfLines={1}>{item.name}</Text>
                    <Text style={styles.contactPhone} numberOfLines={1}>{item.phone}</Text>
                  </View>
                </Pressable>
              );
            }}
            ListEmptyComponent={<Text style={styles.contactEmpty}>{he ? "אין תוצאות" : "لا نتائج"}</Text>}
            contentContainerStyle={styles.contactList}
          />
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: C.bg },
  modalScreen: { flex: 1, backgroundColor: C.bg },
  modalBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: space[4],
    paddingVertical: space[3],
    borderBottomColor: "rgba(201,168,76,0.2)",
    borderBottomWidth: 1,
    backgroundColor: "#0d0c08",
  },
  modalCancel: { color: C.dim, fontSize: type.md, fontWeight: "700" },
  modalTitle: { color: C.goldLight, fontSize: type.md, fontWeight: "800" },
  modalAdd: { color: C.gold, fontSize: type.md, fontWeight: "800" },
  modalSearch: {
    margin: space[4],
    backgroundColor: "rgba(255,255,255,0.04)",
    borderColor: "rgba(201,168,76,0.3)",
    borderWidth: 1,
    borderRadius: radius.md,
    paddingHorizontal: space[3],
    paddingVertical: space[3],
    color: C.goldLight,
    fontSize: type.md,
    textAlign: "right",
  },
  contactList: { paddingHorizontal: space[4], paddingBottom: space[12] },
  contactRow: { flexDirection: "row", alignItems: "center", gap: space[3], paddingVertical: space[3], borderBottomColor: "rgba(255,255,255,0.05)", borderBottomWidth: 1 },
  checkbox: { width: 24, height: 24, borderRadius: 6, borderColor: "rgba(201,168,76,0.5)", borderWidth: 1.5, alignItems: "center", justifyContent: "center" },
  checkboxOn: { backgroundColor: C.gold, borderColor: C.gold },
  checkmark: { color: C.bg, fontSize: type.sm, fontWeight: "900" },
  contactMain: { flex: 1, minWidth: 0 },
  contactName: { color: C.goldLight, fontSize: type.md, fontWeight: "700", textAlign: "right" },
  contactPhone: { color: C.dim, fontSize: type.sm, writingDirection: "ltr", textAlign: "right" },
  contactEmpty: { color: C.dim, textAlign: "center", padding: space[8] },
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
