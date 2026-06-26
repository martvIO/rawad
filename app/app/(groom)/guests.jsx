// Guests — digital RSVP list: search/filter, tap-to-cycle status, bottom-sheet
// inline edit (name / phone / ranks / design), delete (confirm), CSV export.
// Native port of the web DigitalGuests; data + mutations via useGroomDigital.
import { useState } from "react";
import {
  View,
  Text,
  TextInput,
  Pressable,
  FlatList,
  Alert,
  StyleSheet,
} from "react-native";
import * as FileSystem from "expo-file-system";
import * as Sharing from "expo-sharing";
import { ScreenHeader } from "../../src/ui/ScreenHeader.jsx";
import { usePortal } from "../../src/portal/PortalContext.jsx";
import { useGroomDigital, guestStatus } from "../../src/portal/useGroomDigital.jsx";
import { useToast } from "../../src/ui/Toast.jsx";
import { useListFilter } from "@dawa/core/utils/searchFilter.js";
import { toCsv } from "@dawa/core/utils/csv.js";
import {
  SearchBar,
  FilterChips,
  StatusBadge,
  Chip,
  BottomSheet,
  IconButton,
} from "../../src/ui/primitives.jsx";
import { C, space, radius, type } from "../../src/ui/theme.js";

const GUEST_FIELDS = ["name", (g) => g.ranks, (g) => g.rank];
const GUEST_PHONE = ["phone"];
const statusOf = (g) => g.status;

function getGuestRanks(g) {
  if (Array.isArray(g?.ranks)) return g.ranks;
  if (g?.rank) return [g.rank];
  return [];
}
function designTitle(d, lang) {
  const tt = d?.title;
  const v = tt && typeof tt === "object" ? tt[lang === "he" ? "he" : "ar"] || tt.ar || tt.he : tt;
  return (v || "").trim() || (lang === "he" ? "עיצוב" : "تصميم");
}

export default function Guests() {
  const { t, lang } = usePortal();
  const { guests, ranks: availableRanks, designs, editGuest, deleteGuest, cycleGuestStatus, canSeeAttendance } =
    useGroomDigital();
  const toast = useToast();

  const [editing, setEditing] = useState(null); // the guest being edited
  const [eName, setEName] = useState("");
  const [ePhone, setEPhone] = useState("");
  const [eRanks, setERanks] = useState([]);
  const [eDesign, setEDesign] = useState("");
  const [saving, setSaving] = useState(false);

  const statuses = [
    { key: "pending", label: t("chip_pending") },
    { key: "attending", label: t("chip_attending") },
    { key: "absent", label: t("chip_absent") },
  ];
  const { query, setQuery, activeStatus, setActiveStatus, filtered, chips } = useListFilter(guests, {
    fields: GUEST_FIELDS,
    phoneFields: GUEST_PHONE,
    lang,
    statusOf,
    statuses,
    allLabel: t("filter_all"),
  });

  const openEdit = (g) => {
    setEditing(g);
    setEName(g.name || "");
    setEPhone(g.phone || "");
    setERanks(getGuestRanks(g));
    setEDesign(g.designId || "");
  };
  const toggleRank = (r) => setERanks((p) => (p.includes(r) ? p.filter((x) => x !== r) : [...p, r]));

  const saveEdit = async () => {
    const name = eName.trim();
    const digits = ePhone.replace(/\D/g, "");
    if (name.split(/\s+/).filter(Boolean).length < 2) {
      toast.show(lang === "he" ? "שם חייב להכיל לפחות 2 מילים" : "الاسم يجب كلمتين على الأقل");
      return;
    }
    if (digits.length !== 10) {
      toast.show(lang === "he" ? "10 ספרות בדיוק" : "رقم الهاتف 10 أرقام بالضبط");
      return;
    }
    const cleanedRanks = eRanks.filter((r) => availableRanks.includes(r));
    setSaving(true);
    try {
      await editGuest(editing.id, { name, phone: digits, ranks: cleanedRanks, designId: eDesign });
      setEditing(null);
    } catch {
      toast.show("✗ " + (t("err_save") || "خطأ"));
    } finally {
      setSaving(false);
    }
  };

  const confirmDelete = (g) =>
    Alert.alert(
      lang === "he" ? "מחיקת מוזמן" : "حذف المدعو",
      g.name,
      [
        { text: lang === "he" ? "ביטול" : "إلغاء", style: "cancel" },
        { text: lang === "he" ? "מחק" : "حذف", style: "destructive", onPress: () => deleteGuest(g.id) },
      ],
      { cancelable: true },
    );

  const exportCsv = async () => {
    try {
      const label = (s) =>
        s === "attending"
          ? lang === "he"
            ? "מגיע"
            : "سيحضر"
          : s === "absent"
            ? lang === "he"
              ? "לא מגיע"
              : "لن يحضر"
            : lang === "he"
              ? "ממתין"
              : "بانتظار";
      const headers = lang === "he" ? ["שם", "טלפון", "סטטוס", "דירוגים"] : ["الاسم", "الهاتف", "الحالة", "الرتب"];
      const rows = guests.map((g) => [
        g.name || "",
        g.phone || "",
        label(guestStatus(g)),
        Array.isArray(g.ranks) ? g.ranks.join(" | ") : "",
      ]);
      const csv = "﻿" + toCsv(headers, rows); // BOM so Excel renders Arabic
      const uri = FileSystem.cacheDirectory + "dawa-guests.csv";
      await FileSystem.writeAsStringAsync(uri, csv, { encoding: FileSystem.EncodingType.UTF8 });
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(uri, {
          mimeType: "text/csv",
          UTI: "public.comma-separated-values-text",
        });
      }
    } catch {
      toast.show("✗ CSV");
    }
  };

  const renderRow = ({ item: g }) => {
    const st = guestStatus(g);
    const gr = getGuestRanks(g);
    const assigned =
      designs.length > 1 ? designs.find((d) => d.id === g.designId) || designs.find((d) => d.isDefault) : null;
    return (
      <View style={styles.row}>
        <View style={styles.rowMain}>
          <Text style={styles.name}>{g.name}</Text>
          <Text style={styles.phone}>{g.phone}</Text>
          {gr.length > 0 ? (
            <View style={styles.rankWrap}>
              {gr.map((r) => (
                <View key={r} style={styles.rankPill}>
                  <Text style={styles.rankText}>{r}</Text>
                </View>
              ))}
            </View>
          ) : null}
          {canSeeAttendance && st === "attending" && g.companions != null ? (
            <Text style={styles.companions}>
              👥 {Number(g.companions) + 1} {lang === "he" ? "אנשים" : "أشخاص"}
            </Text>
          ) : null}
          {assigned ? <Text style={styles.designLine}>🎨 {designTitle(assigned, lang)}</Text> : null}
          {g.inviteLinkSentAt ? (
            <Text style={styles.sent}>✓ {lang === "he" ? "נשלח" : "تم الإرسال"}</Text>
          ) : null}
        </View>
        <View style={styles.rowSide}>
          <StatusBadge status={st} locked={!canSeeAttendance} onPress={() => cycleGuestStatus(g)} />
          <View style={styles.actions}>
            <IconButton glyph="✎" onPress={() => openEdit(g)} size={32} />
            <IconButton glyph="🗑" color={C.red} onPress={() => confirmDelete(g)} size={32} />
          </View>
        </View>
      </View>
    );
  };

  const header = (
    <View>
      <View style={styles.headRow}>
        <Text style={styles.count}>
          {(lang === "he" ? "רשימת מוזמנים" : "قائمة المدعوين")} ({guests.length})
        </Text>
        <View style={styles.headBtns}>
          {guests.length > 0 ? (
            <Pressable style={styles.ghostBtn} onPress={exportCsv}>
              <Text style={styles.ghostBtnText}>⬇ CSV</Text>
            </Pressable>
          ) : null}
          <Pressable style={styles.goldBtn} onPress={() => toast.show(t("coming_soon") || "قريبًا")}>
            <Text style={styles.goldBtnText}>➕ {lang === "he" ? "הוסף" : "إضافة"}</Text>
          </Pressable>
        </View>
      </View>
      <Text style={styles.hint}>
        {lang === "he"
          ? "💡 לחץ על הסטטוס לשינוי"
          : "💡 انقر على الحالة لتغييرها"}
      </Text>
      {guests.length > 0 ? (
        <>
          <SearchBar
            value={query}
            onChangeText={setQuery}
            placeholder={t("search_guests_placeholder")}
            count={`${filtered.length}/${guests.length}`}
          />
          {chips.length > 0 ? (
            <View style={styles.filterWrap}>
              <FilterChips options={chips} value={activeStatus} onChange={setActiveStatus} />
            </View>
          ) : null}
        </>
      ) : null}
    </View>
  );

  return (
    <View style={styles.screen}>
      <ScreenHeader title={t("tab_guests") || "المدعوون"} />
      <FlatList
        data={filtered}
        keyExtractor={(g) => g.id}
        renderItem={renderRow}
        ListHeaderComponent={header}
        contentContainerStyle={styles.list}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Text style={styles.emptyText}>
              {guests.length === 0
                ? lang === "he"
                  ? "אין מוזמנים עדיין"
                  : "لا يوجد مدعوون بعد"
                : t("search_no_results") || (lang === "he" ? "אין תוצאות" : "لا نتائج")}
            </Text>
          </View>
        }
      />

      <BottomSheet
        visible={!!editing}
        onClose={() => setEditing(null)}
        title={lang === "he" ? "עריכת מוזמן" : "تعديل المدعو"}
      >
        <View style={styles.field}>
          <Text style={styles.fieldLabel}>{lang === "he" ? "שם מלא (2 מילים+)" : "الاسم الكامل (كلمتان+)"}</Text>
          <TextInput style={styles.input} value={eName} onChangeText={setEName} placeholderTextColor={C.dim} />
        </View>
        <View style={styles.field}>
          <Text style={styles.fieldLabel}>{lang === "he" ? "טלפון (10)" : "هاتف (10)"}</Text>
          <TextInput
            style={[styles.input, styles.ltr]}
            value={ePhone}
            onChangeText={setEPhone}
            keyboardType="phone-pad"
            placeholderTextColor={C.dim}
          />
        </View>
        {availableRanks.length > 0 ? (
          <View style={styles.field}>
            <Text style={styles.fieldLabel}>{lang === "he" ? "רמות" : "الرتب"}</Text>
            <View style={styles.chipWrap}>
              {availableRanks.map((r) => (
                <Chip key={r} label={r} selected={eRanks.includes(r)} onPress={() => toggleRank(r)} />
              ))}
            </View>
          </View>
        ) : null}
        {designs.length > 1 ? (
          <View style={styles.field}>
            <Text style={styles.fieldLabel}>{lang === "he" ? "עיצוב למוזמן זה" : "تصميم هذا المدعو"}</Text>
            <View style={styles.chipWrap}>
              {designs.map((d) => {
                const approved = d.designStatus === "approved";
                const on = eDesign ? eDesign === d.id : d.isDefault;
                return (
                  <Chip
                    key={d.id}
                    label={designTitle(d, lang) + (approved ? "" : " ⏳")}
                    selected={on}
                    onPress={approved ? () => setEDesign(d.id) : undefined}
                  />
                );
              })}
            </View>
          </View>
        ) : null}
        <View style={styles.sheetBtns}>
          <Pressable style={[styles.goldBtn, styles.sheetBtn, saving && { opacity: 0.5 }]} onPress={saving ? undefined : saveEdit}>
            <Text style={styles.goldBtnText}>💾 {lang === "he" ? "שמור" : "حفظ"}</Text>
          </Pressable>
          <Pressable style={[styles.ghostBtn, styles.sheetBtn]} onPress={() => setEditing(null)}>
            <Text style={styles.ghostBtnText}>{lang === "he" ? "ביטול" : "إلغاء"}</Text>
          </Pressable>
        </View>
      </BottomSheet>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: C.bg },
  list: { padding: space[4], paddingBottom: space[12] },
  headRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: space[2] },
  count: { color: C.goldLight, fontSize: type.lg, fontWeight: "800" },
  headBtns: { flexDirection: "row", gap: space[2] },
  ghostBtn: {
    paddingHorizontal: space[3],
    paddingVertical: space[2],
    borderRadius: radius.md,
    borderColor: "rgba(201,168,76,0.3)",
    borderWidth: 1,
  },
  ghostBtnText: { color: C.dim, fontSize: type.sm, fontWeight: "700" },
  goldBtn: { paddingHorizontal: space[4], paddingVertical: space[2], borderRadius: radius.md, backgroundColor: C.gold },
  goldBtnText: { color: C.bg, fontSize: type.sm, fontWeight: "800" },
  hint: { color: "#5a5040", fontSize: type.sm, fontStyle: "italic", marginVertical: space[2], textAlign: "right" },
  filterWrap: { marginTop: space[2] },
  empty: { padding: space[8], alignItems: "center" },
  emptyText: { color: C.dim, fontSize: type.md },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: space[3],
    backgroundColor: "#0f0f15",
    borderColor: "rgba(255,255,255,0.07)",
    borderWidth: 1,
    borderRadius: radius.xl,
    padding: space[4],
    marginTop: space[3],
  },
  rowMain: { flex: 1, minWidth: 0 },
  name: { color: C.goldLight, fontSize: type.md, fontWeight: "800", textAlign: "right" },
  phone: { color: "#5a5040", fontSize: type.sm, writingDirection: "ltr", textAlign: "right" },
  rankWrap: { flexDirection: "row", flexWrap: "wrap", gap: space[1], marginTop: space[1] },
  rankPill: {
    paddingHorizontal: space[2],
    paddingVertical: 2,
    borderRadius: radius.pill,
    backgroundColor: "rgba(201,168,76,0.12)",
    borderColor: "rgba(201,168,76,0.3)",
    borderWidth: 1,
  },
  rankText: { color: C.gold, fontSize: type.xs, fontWeight: "700" },
  companions: { marginTop: space[1], color: C.gold, fontSize: type.sm, fontWeight: "800", textAlign: "right" },
  designLine: { marginTop: space[1], color: C.gold, fontSize: type.xs, fontWeight: "700", textAlign: "right" },
  sent: { marginTop: space[1], color: "#4cc97a", fontSize: type.xs, fontWeight: "800", textAlign: "right" },
  rowSide: { alignItems: "flex-end", gap: space[2] },
  actions: { flexDirection: "row", gap: space[2] },
  field: { gap: space[1] },
  fieldLabel: { color: C.goldDim, fontSize: type.sm, fontWeight: "700", textAlign: "right" },
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
  },
  ltr: { writingDirection: "ltr", textAlign: "left" },
  chipWrap: { flexDirection: "row", flexWrap: "wrap" },
  sheetBtns: { flexDirection: "row", gap: space[2], marginTop: space[2] },
  sheetBtn: { flex: 1, alignItems: "center", paddingVertical: space[3] },
});
