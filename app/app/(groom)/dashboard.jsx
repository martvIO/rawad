// Dashboard — media gallery (image picker + upload), wedding date, guest ranks,
// attendance stats, and guest messages. Native port of the web DigitalDashboard;
// all data + optimistic mutations come from useGroomDigital.
import { useState } from "react";
import {
  View,
  Text,
  TextInput,
  Pressable,
  ScrollView,
  ActivityIndicator,
  StyleSheet,
} from "react-native";
import * as ImagePicker from "expo-image-picker";
import { ScreenHeader } from "../../src/ui/ScreenHeader.jsx";
import { usePortal } from "../../src/portal/PortalContext.jsx";
import { useGroomDigital, guestStatus } from "../../src/portal/useGroomDigital.jsx";
import { useToast } from "../../src/ui/Toast.jsx";
import { useListFilter } from "@dawa/core/utils/searchFilter.js";
import {
  MediaTile,
  DatePickerField,
  Chip,
  StatTile,
  ProgressBar,
  SearchBar,
  FilterChips,
  SectionLabel,
} from "../../src/ui/primitives.jsx";
import { C, space, radius, type } from "../../src/ui/theme.js";

const tt = (lang, ar, he) => (lang === "he" ? he : ar);
const MAX_MEDIA_BYTES = 50 * 1024 * 1024;
const MSG_FIELDS = ["name", (g) => g.note];
const msgStatusOf = (g) => g.status;

export default function Dashboard() {
  const { lang } = usePortal();
  const {
    guests,
    media,
    uploadState,
    addMedia,
    removeMedia,
    weddingDate,
    setDate,
    ranks,
    addRank,
    removeRank,
    stats,
    canSeeAttendance,
  } = useGroomDigital();
  const toast = useToast();
  const [newRank, setNewRank] = useState("");

  const pickMedia = async () => {
    const res = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images", "videos"],
      allowsMultipleSelection: true,
      quality: 0.9,
      selectionLimit: 0,
    });
    if (res.canceled) return;
    const files = [];
    const rejected = [];
    for (const a of res.assets || []) {
      if (a.fileSize && a.fileSize > MAX_MEDIA_BYTES) {
        rejected.push(a.fileName || "");
        continue;
      }
      const isVideo = a.type === "video";
      const isGif = (a.mimeType || "").includes("gif") || (a.fileName || "").toLowerCase().endsWith(".gif");
      const kind = isVideo ? "video" : isGif ? "gif" : "image";
      files.push({
        uri: a.uri,
        name: a.fileName || `upload.${isVideo ? "mp4" : "jpg"}`,
        type: a.mimeType || (isVideo ? "video/mp4" : "image/jpeg"),
        kind,
      });
    }
    if (rejected.length) {
      toast.show(tt(lang, "ملفات كبيرة جداً (50MB)", "קבצים גדולים מדי (50MB)"));
    }
    if (files.length) addMedia(files);
  };

  const onAddRank = () => {
    const v = newRank.trim();
    if (!v) return;
    if (ranks.includes(v)) {
      toast.show(tt(lang, "موجود مسبقاً", "כבר קיים"));
      setNewRank("");
      return;
    }
    addRank(v);
    setNewRank("");
  };

  const galleryItems = [...media, ...uploadState.pending];

  // Guest-messages list (only guests who left a note).
  const messageGuests = guests.filter((g) => g.note && g.note.trim());
  const msgStatuses = [
    { key: "attending", label: tt(lang, "سيحضر", "מגיע") },
    { key: "absent", label: tt(lang, "اعتذر", "התנצל") },
    { key: "pending", label: tt(lang, "لم يرد", "טרם ענה") },
  ];
  const {
    query: msgQuery,
    setQuery: setMsgQuery,
    activeStatus: msgStatus,
    setActiveStatus: setMsgStatus,
    filtered: filteredMessages,
    chips: msgChips,
  } = useListFilter(messageGuests, {
    fields: MSG_FIELDS,
    phoneFields: [],
    lang,
    statusOf: msgStatusOf,
    statuses: msgStatuses,
    allLabel: tt(lang, "الكل", "הכל"),
  });

  const statCards = [
    { label: tt(lang, "الإجمالي", "סה״כ"), val: stats.total, color: C.goldLight },
    { label: tt(lang, "حضور", "נוכחים"), val: stats.attending, color: "#4cc97a" },
    { label: tt(lang, "غياب", "נעדרים"), val: stats.absent, color: C.red },
    { label: tt(lang, "لم يرد", "טרם ענו"), val: stats.pending, color: C.gold },
  ];

  return (
    <View style={styles.screen}>
      <ScreenHeader title={tt(lang, "الرئيسية", "ראשי")} />
      <ScrollView contentContainerStyle={styles.content}>
        {/* Media gallery */}
        <SectionLabel>
          🎬 {tt(lang, "وسائط الدعوة", "מדיית ההזמנה")} ({media.length})
        </SectionLabel>
        <Text style={styles.hint}>
          {tt(lang, "ارفع صور / فيديو / GIF — تظهر للضيوف على صفحة الدعوة", "העלה תמונות / סרטונים / GIF — יוצגו לאורחים")}
        </Text>
        <View style={styles.gallery}>
          {galleryItems.map((m, i) => (
            <MediaTile
              key={m.storagePath || i}
              item={m}
              onRemove={m.pending ? null : () => removeMedia(m)}
            />
          ))}
          <Pressable style={styles.addTile} onPress={uploadState.busy ? undefined : pickMedia}>
            {uploadState.busy ? (
              <>
                <ActivityIndicator color={C.blue} />
                <Text style={styles.addText}>
                  {uploadState.progress > 0 ? `${Math.round(uploadState.progress * 100)}%` : "…"}
                </Text>
              </>
            ) : (
              <>
                <Text style={styles.addPlus}>➕</Text>
                <Text style={styles.addText}>{tt(lang, "أضف", "הוסף")}</Text>
              </>
            )}
          </Pressable>
        </View>

        {/* Wedding date */}
        <View style={styles.card}>
          <SectionLabel>📅 {tt(lang, "تاريخ الزفاف", "תאריך החתונה")}</SectionLabel>
          <Text style={styles.hint}>{tt(lang, "يُستخدم للعد التنازلي في صفحة الدعوة", "ישמש לעד-לאחור בעמוד ההזמנה")}</Text>
          <DatePickerField mode="datetime" value={weddingDate} onChange={setDate} placeholder={tt(lang, "اختر تاريخاً", "בחר תאריך")} />
        </View>

        {/* Guest ranks */}
        <View style={styles.card}>
          <SectionLabel>🏷 {tt(lang, "رتب المدعوين", "רמות מוזמנים")}</SectionLabel>
          <Text style={styles.hint}>
            {tt(lang, "أضف رتباً مخصصة لتختار منها عند إضافة مدعو", "הוסף רמות מותאמות אישית לבחירה בעת הוספת מוזמן")}
          </Text>
          <View style={styles.rankAdd}>
            <TextInput
              style={styles.rankInput}
              value={newRank}
              onChangeText={setNewRank}
              onSubmitEditing={onAddRank}
              placeholder={tt(lang, "اسم الرتبة", "שם הרמה")}
              placeholderTextColor={C.dim}
            />
            <Pressable
              style={[styles.goldBtn, !newRank.trim() && { opacity: 0.5 }]}
              onPress={newRank.trim() ? onAddRank : undefined}
            >
              <Text style={styles.goldBtnText}>➕ {tt(lang, "إضافة", "הוסף")}</Text>
            </Pressable>
          </View>
          {ranks.length === 0 ? (
            <Text style={styles.emptyRanks}>{tt(lang, "لا توجد رتب بعد", "אין רמות עדיין")}</Text>
          ) : (
            <View style={styles.chipWrap}>
              {ranks.map((r) => (
                <Chip key={r} label={r} selected onRemove={() => removeRank(r)} />
              ))}
            </View>
          )}
        </View>

        {/* Stats */}
        {canSeeAttendance ? (
          <>
            <View style={styles.statGrid}>
              {statCards.map((s) => (
                <StatTile key={s.label} value={s.val} label={s.label} color={s.color} />
              ))}
            </View>
            {stats.expected > 0 ? (
              <View style={styles.card}>
                <Text style={styles.expectedVal}>👥 {stats.expected}</Text>
                <Text style={styles.hint}>{tt(lang, "العدد المتوقع للحضور (مع المرافقين)", "צפי נוכחים (כולל מלווים)")}</Text>
              </View>
            ) : null}
            {stats.total > 0 ? (
              <View style={styles.card}>
                <View style={styles.pctRow}>
                  <Text style={styles.pctLabel}>{tt(lang, "نسبة الحضور", "אחוז נוכחות")}</Text>
                  <Text style={styles.pctVal}>{stats.pct}%</Text>
                </View>
                <ProgressBar value={stats.pct / 100} color="#4cc97a" />
              </View>
            ) : null}
          </>
        ) : (
          <View style={styles.card}>
            <Text style={styles.locked}>
              🔒 {tt(lang, "عرض الحضور غير مُفعّل لحسابك — تواصل مع الإدارة.", "תצוגת הנוכחות אינה מופעלת — פנה לניהול.")}
            </Text>
          </View>
        )}

        {/* Guest messages */}
        {messageGuests.length > 0 ? (
          <View style={styles.card}>
            <SectionLabel>💌 {tt(lang, "رسائل المعزومين للعروسين", "ברכות המוזמנים לזוג")}</SectionLabel>
            <SearchBar
              value={msgQuery}
              onChangeText={setMsgQuery}
              placeholder={tt(lang, "ابحث في الرسائل…", "חיפוש בברכות…")}
              count={`${filteredMessages.length}/${messageGuests.length}`}
            />
            {msgChips.length > 0 ? (
              <View style={styles.filterWrap}>
                <FilterChips options={msgChips} value={msgStatus} onChange={setMsgStatus} />
              </View>
            ) : null}
            <View style={styles.messages}>
              {filteredMessages.map((g) => (
                <View key={g.id} style={styles.msg}>
                  <Text style={styles.msgName}>
                    {g.name}
                    {guestStatus(g) === "attending" ? `  ✓ ${tt(lang, "سيحضر", "מגיע")}` : ""}
                    {guestStatus(g) === "absent" ? `  ✗ ${tt(lang, "اعتذر", "התנצל")}` : ""}
                  </Text>
                  <Text style={styles.msgNote}>{g.note}</Text>
                </View>
              ))}
            </View>
            <Text style={styles.msgFooter}>{tt(lang, "تظهر لك فقط — لا تظهر للمدعوين", "מוצג רק לך — לא למוזמנים")}</Text>
          </View>
        ) : null}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: C.bg },
  content: { padding: space[4], paddingBottom: space[12], gap: space[2] },
  hint: { color: C.dim, fontSize: type.sm, lineHeight: 20, marginBottom: space[3], textAlign: "right" },
  gallery: { flexDirection: "row", flexWrap: "wrap", gap: space[2], marginBottom: space[3] },
  addTile: {
    width: 100,
    height: 100,
    borderRadius: radius.lg,
    borderWidth: 2,
    borderStyle: "dashed",
    borderColor: "rgba(75,159,212,0.4)",
    backgroundColor: "rgba(75,159,212,0.04)",
    alignItems: "center",
    justifyContent: "center",
    gap: space[1],
  },
  addPlus: { fontSize: type["4xl"], color: C.blue },
  addText: { fontSize: type.xs, color: C.blue, fontWeight: "800" },
  card: {
    backgroundColor: "rgba(255,255,255,0.03)",
    borderColor: "rgba(201,168,76,0.2)",
    borderWidth: 1,
    borderRadius: radius.xl,
    padding: space[4],
    marginBottom: space[3],
  },
  rankAdd: { flexDirection: "row", gap: space[2], marginBottom: space[3] },
  rankInput: {
    flex: 1,
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
  goldBtn: {
    paddingHorizontal: space[4],
    justifyContent: "center",
    borderRadius: radius.md,
    backgroundColor: C.gold,
  },
  goldBtnText: { color: C.bg, fontSize: type.sm, fontWeight: "800" },
  emptyRanks: { color: C.dim, fontSize: type.sm, fontStyle: "italic", textAlign: "center", paddingVertical: space[2] },
  chipWrap: { flexDirection: "row", flexWrap: "wrap" },
  statGrid: { flexDirection: "row", flexWrap: "wrap", gap: space[3], marginBottom: space[3] },
  expectedVal: { color: C.gold, fontSize: type["4xl"], fontWeight: "900", textAlign: "right" },
  pctRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: space[2] },
  pctLabel: { color: C.goldDim, fontSize: type.base, fontWeight: "700" },
  pctVal: { color: "#4cc97a", fontSize: type["2xl"], fontWeight: "900" },
  locked: { color: C.dim, fontSize: type.md, lineHeight: 24, textAlign: "center" },
  filterWrap: { marginTop: space[2] },
  messages: { gap: space[2], marginTop: space[2] },
  msg: {
    padding: space[3],
    borderRadius: radius.md,
    backgroundColor: "rgba(255,255,255,0.03)",
    borderColor: "rgba(201,168,76,0.18)",
    borderWidth: 1,
  },
  msgName: { color: C.goldLight, fontSize: type.sm, fontWeight: "800", marginBottom: space[1], textAlign: "right" },
  msgNote: { color: C.dim, fontSize: type.md, lineHeight: 22, textAlign: "right" },
  msgFooter: { color: C.dim, fontSize: type.xs, marginTop: space[2], textAlign: "right" },
});
