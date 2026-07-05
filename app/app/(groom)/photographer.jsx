// Digital invitation — Photographer gallery (native port of DigitalPhotographer).
// Upload wedding photos/videos (library or camera), rename, delete, search +
// filter by type, and PUBLISH the gallery. The first publish requires the
// groom's biometric face-indexing acknowledgment (the server 409s ack_required
// without it) — gated behind a consent modal here. Gated on canUsePhotographer.
import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import {
  View,
  Text,
  TextInput,
  Pressable,
  FlatList,
  Image,
  Alert,
  StyleSheet,
} from "react-native";
import * as ImagePicker from "expo-image-picker";
import { File } from "expo-file-system";
import { ScreenHeader } from "../../src/ui/ScreenHeader.jsx";
import { usePortal } from "../../src/portal/PortalContext.jsx";
import { useGroomDigital } from "../../src/portal/useGroomDigital.jsx";
import { useToast } from "../../src/ui/Toast.jsx";
import { SearchBar, FilterChips, BottomSheet } from "../../src/ui/primitives.jsx";
import {
  subscribePhotographerFiles,
  uploadPhotographerFile,
  renamePhotographerFile,
  removePhotographerFile,
  setPhotographerPublished,
} from "@dawa/core/services/digitalInvitation.js";
import { runUploadQueue } from "@dawa/core/utils/uploadQueue.js";
import { useListFilter } from "@dawa/core/utils/searchFilter.js";
import { localizeApiError } from "@dawa/core/utils/apiError.js";
import { C, space, radius, type } from "../../src/ui/theme.js";

// Mirror of MAX_PHOTOG_BYTES on the server (functions/src/constants/limits.ts).
// 2 GB ceiling — direct-to-Storage uploads have no function-memory limit.
const MAX_PHOTOG_BYTES = 2 * 1024 * 1024 * 1024;

function fileKind(f) {
  if (f?.kind) return f.kind;
  const t = String(f?.type || "");
  if (t.startsWith("video")) return "video";
  if (t.includes("gif")) return "gif";
  if (t.startsWith("image")) return "image";
  const url = String(f?.url || f?.name || "").toLowerCase();
  if (/\.(mp4|mov|webm|m4v)$/.test(url)) return "video";
  return "image";
}

export default function Photographer() {
  const { t, lang, user } = usePortal();
  const he = lang === "he";
  const { uid, doc } = useGroomDigital();
  const toast = useToast();
  const canUse = user?.canUsePhotographer !== false;

  const [files, setFiles] = useState(null); // null = loading
  const [published, setPublished] = useState(doc?.photographerPublished === true);
  const [busy, setBusy] = useState(false);
  const [pending, setPending] = useState([]); // optimistic upload tiles
  const [consentOpen, setConsentOpen] = useState(false);
  const [renaming, setRenaming] = useState(null); // file being renamed
  const [renameText, setRenameText] = useState("");

  const pendingRef = useRef(new Map()); // tempId -> file (in-flight)
  const abortRef = useRef(null);

  // Keep the published mirror in sync with the shared media poll.
  useEffect(() => {
    if (doc?.photographerPublished != null) setPublished(doc.photographerPublished === true);
  }, [doc?.photographerPublished]);

  const fail = useCallback(
    (e, fb) => toast.show("✗ " + localizeApiError(e, t, fb)),
    [toast, t],
  );

  // Merge in-flight uploads into a freshly-polled list (poll-race bridge).
  const mergePending = useCallback((list) => {
    const arr = Array.isArray(list) ? [...list] : [];
    const have = new Set(arr.map((f) => f.id));
    for (const [tid, f] of pendingRef.current) {
      if (f.id && have.has(f.id)) pendingRef.current.delete(tid);
      else if (!arr.some((x) => x.storagePath && x.storagePath === f.storagePath)) arr.unshift(f);
    }
    return arr;
  }, []);

  useEffect(() => {
    if (!uid || !canUse) return undefined;
    const unsub = subscribePhotographerFiles(uid, (list) => setFiles(mergePending(list)), () => {});
    return () => {
      try { unsub && unsub(); } catch { /* noop */ }
    };
  }, [uid, canUse, mergePending]);

  useEffect(
    () => () => {
      try { abortRef.current?.abort(); } catch { /* noop */ }
    },
    [],
  );

  const doUpload = useCallback(
    async (assets) => {
      const picked = [];
      const rejected = [];
      for (const a of assets) {
        // Real byte size — create-upload requires it (finite > 0 ≤ 2GB); the
        // picker omits fileSize on some platforms, so stat the file directly.
        let size = Number(a.fileSize) || 0;
        if (!size) {
          try { size = new File(a.uri).size || 0; } catch { size = 0; }
        }
        if (size > MAX_PHOTOG_BYTES) { rejected.push(a.fileName || ""); continue; }
        const isVideo = a.type === "video";
        picked.push({
          uri: a.uri,
          name: a.fileName || `photo.${isVideo ? "mp4" : "jpg"}`,
          type: a.mimeType || (isVideo ? "video/mp4" : "image/jpeg"),
          size,
        });
      }
      if (rejected.length) toast.show(he ? "קבצים גדולים מדי (2GB)" : "ملفات كبيرة جداً (2GB)");
      if (!picked.length) return;

      const stamp = Date.now();
      const previews = picked.map((f, i) => ({ id: null, tempId: `__p_${stamp}_${i}`, url: f.uri, name: f.name, type: f.type, pending: true }));
      setPending(previews);
      setBusy(true);
      const ctrl = new AbortController();
      abortRef.current = ctrl;

      // Bounded-concurrency queue + per-file retry (see @dawa/core
      // utils/uploadQueue.js) — same behavior as the web photographer page.
      const results = await runUploadQueue(
        picked,
        (f) => uploadPhotographerFile(uid, f, { signal: ctrl.signal }),
        { signal: ctrl.signal },
      );
      const added = [];
      results.forEach((r, i) => {
        if (r.status === "fulfilled" && r.value) {
          const rec = { ...r.value, tempId: previews[i].tempId };
          pendingRef.current.set(previews[i].tempId, rec);
          added.push(rec);
        }
      });
      setFiles((cur) => {
        const base = Array.isArray(cur) ? cur : [];
        const have = new Set(base.map((f) => f.id).filter(Boolean));
        return [...added.filter((f) => !f.id || !have.has(f.id)), ...base];
      });
      setPending([]);
      setBusy(false);
      abortRef.current = null;
      const failed = results.filter((r) => r.status === "rejected").length;
      if (failed && failed === picked.length) fail(results.find((r) => r.status === "rejected")?.reason, t("err_upload"));
      else if (failed) toast.show(t("upload_partial") || "بعض الملفات لم تُرفع");
    },
    [uid, he, toast, fail, t],
  );

  const pickLibrary = async () => {
    const res = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images", "videos"],
      allowsMultipleSelection: true,
      quality: 0.9,
      selectionLimit: 0,
    });
    if (!res.canceled) doUpload(res.assets || []);
  };

  const pickCamera = async () => {
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) {
      toast.show(he ? "אין הרשאת מצלמה" : "لا يوجد إذن للكاميرا");
      return;
    }
    const res = await ImagePicker.launchCameraAsync({ mediaTypes: ["images"], quality: 0.9 });
    if (!res.canceled) doUpload(res.assets || []);
  };

  const confirmDelete = (f) =>
    Alert.alert(
      he ? "מחיקת קובץ" : "حذف الملف",
      f.name || "",
      [
        { text: he ? "ביטול" : "إلغاء", style: "cancel" },
        {
          text: he ? "מחק" : "حذف",
          style: "destructive",
          onPress: async () => {
            try {
              await removePhotographerFile(uid, f.id);
              pendingRef.current.delete(f.tempId);
              setFiles((cur) => (cur || []).filter((x) => x.id !== f.id));
            } catch (e) { fail(e); }
          },
        },
      ],
      { cancelable: true },
    );

  const openRename = (f) => { setRenaming(f); setRenameText(f.name || ""); };
  const saveRename = async () => {
    const name = renameText.trim();
    if (!name || !renaming) { setRenaming(null); return; }
    try {
      await renamePhotographerFile(uid, renaming.id, name);
      setFiles((cur) => (cur || []).map((x) => (x.id === renaming.id ? { ...x, name } : x)));
    } catch (e) { fail(e); }
    setRenaming(null);
  };

  const togglePublish = async () => {
    if (published) {
      try {
        await setPhotographerPublished(uid, false);
        setPublished(false);
        toast.show(he ? "הגלריה הוסתרה" : "تم إخفاء المعرض");
      } catch (e) { fail(e); }
      return;
    }
    // Turning ON → require the biometric-indexing acknowledgment.
    setConsentOpen(true);
  };

  const confirmPublish = async () => {
    setConsentOpen(false);
    try {
      await setPhotographerPublished(uid, true, true);
      setPublished(true);
      toast.show(he ? "✓ הגלריה פורסמה" : "✓ تم نشر المعرض");
    } catch (e) { fail(e); }
  };

  const statuses = [
    { key: "image", label: he ? "תמונות" : "صور" },
    { key: "video", label: he ? "וידאו" : "فيديو" },
  ];
  const all = files || [];
  const { query, setQuery, activeStatus, setActiveStatus, filtered, chips } = useListFilter(all, {
    fields: ["name"],
    lang,
    statusOf: (f) => fileKind(f),
    statuses,
    allLabel: t("filter_all"),
  });

  const data = useMemo(() => [...pending, ...filtered], [pending, filtered]);

  if (!canUse) {
    return (
      <View style={styles.screen}>
        <ScreenHeader title={he ? "צלם" : "المصور"} />
        <View style={styles.empty}>
          <Text style={styles.emptyText}>
            {he ? "תכונת הצלם אינה מופעלת בחשבון זה." : "ميزة المصوّر غير مفعّلة في هذا الحساب."}
          </Text>
        </View>
      </View>
    );
  }

  const renderTile = ({ item: f }) => {
    const kind = fileKind(f);
    return (
      <View style={styles.tile}>
        {kind === "image" || kind === "gif" ? (
          <Image source={{ uri: f.url }} style={styles.thumb} resizeMode="cover" />
        ) : (
          <View style={[styles.thumb, styles.videoThumb]}>
            <Text style={styles.videoGlyph}>🎬</Text>
          </View>
        )}
        {f.pending ? (
          <View style={styles.pendingOverlay}>
            <Text style={styles.pendingText}>⏳</Text>
          </View>
        ) : null}
        <Text numberOfLines={1} style={styles.tileName}>{f.name}</Text>
        {!f.pending ? (
          <View style={styles.tileActions}>
            <Pressable onPress={() => openRename(f)} hitSlop={8}><Text style={styles.tileAction}>✎</Text></Pressable>
            <Pressable onPress={() => confirmDelete(f)} hitSlop={8}><Text style={[styles.tileAction, { color: C.red }]}>🗑</Text></Pressable>
          </View>
        ) : null}
      </View>
    );
  };

  const header = (
    <View>
      <View style={styles.publishCard}>
        <View style={styles.publishInfo}>
          <Text style={styles.publishTitle}>
            {published ? (he ? "✅ הגלריה מפורסמת" : "✅ المعرض منشور") : (he ? "הגלריה מוסתרת" : "المعرض مخفي")}
          </Text>
          <Text style={styles.publishHint}>
            {he
              ? "כשמפורסם, המוזמנים יכולים לחפש את התמונות שלהם לפי פנים."
              : "عند النشر، يمكن للمدعوين البحث عن صورهم بالتعرّف على الوجه."}
          </Text>
        </View>
        <Pressable style={[styles.pubBtn, published ? styles.pubBtnOff : styles.pubBtnOn]} onPress={togglePublish}>
          <Text style={[styles.pubBtnText, published && { color: C.goldLight }]}>
            {published ? (he ? "הסתר" : "إخفاء") : (he ? "פרסם" : "نشر")}
          </Text>
        </Pressable>
      </View>

      <View style={styles.uploadRow}>
        <Pressable style={[styles.goldBtn, busy && styles.dim]} onPress={busy ? undefined : pickLibrary}>
          <Text style={styles.goldBtnText}>{busy ? (he ? "מעלה…" : "جاري الرفع…") : `🖼 ${he ? "מהגלריה" : "من المعرض"}`}</Text>
        </Pressable>
        <Pressable style={[styles.ghostBtn, busy && styles.dim]} onPress={busy ? undefined : pickCamera}>
          <Text style={styles.ghostBtnText}>📷 {he ? "מצלמה" : "كاميرا"}</Text>
        </Pressable>
      </View>

      {all.length > 0 ? (
        <>
          <SearchBar value={query} onChangeText={setQuery} placeholder={he ? "חיפוש קבצים" : "بحث في الملفات"} count={`${filtered.length}/${all.length}`} />
          {chips.length > 0 ? <View style={styles.filterWrap}><FilterChips options={chips} value={activeStatus} onChange={setActiveStatus} /></View> : null}
        </>
      ) : null}
    </View>
  );

  return (
    <View style={styles.screen}>
      <ScreenHeader title={he ? "צלם" : "المصور"} />
      <FlatList
        data={data}
        keyExtractor={(f, i) => f.id || f.tempId || String(i)}
        renderItem={renderTile}
        numColumns={2}
        columnWrapperStyle={styles.col}
        ListHeaderComponent={header}
        contentContainerStyle={styles.list}
        ListEmptyComponent={
          files === null ? (
            <Text style={styles.emptyText}>{he ? "טוען…" : "جاري التحميل…"}</Text>
          ) : (
            <View style={styles.empty}>
              <Text style={styles.emptyText}>{he ? "אין קבצים עדיין — העלה תמונות" : "لا ملفات بعد — ارفع صوراً"}</Text>
            </View>
          )
        }
      />

      <BottomSheet visible={!!renaming} onClose={() => setRenaming(null)} title={he ? "שנה שם קובץ" : "إعادة تسمية الملف"}>
        <TextInput style={styles.input} value={renameText} onChangeText={setRenameText} placeholderTextColor={C.dim} />
        <View style={styles.sheetBtns}>
          <Pressable style={[styles.goldBtn, styles.flex1]} onPress={saveRename}><Text style={styles.goldBtnText}>💾 {he ? "שמור" : "حفظ"}</Text></Pressable>
          <Pressable style={[styles.ghostBtn, styles.flex1]} onPress={() => setRenaming(null)}><Text style={styles.ghostBtnText}>{he ? "ביטול" : "إلغاء"}</Text></Pressable>
        </View>
      </BottomSheet>

      <BottomSheet visible={consentOpen} onClose={() => setConsentOpen(false)} title={he ? "אישור פרסום" : "تأكيد النشر"}>
        <Text style={styles.consentBody}>
          {he
            ? "בפרסום הגלריה, פנים בתמונות ינותחו כדי לאפשר למוזמנים למצוא את התמונות שלהם. אני מאשר שהמוזמנים קיבלו הודעה על כך."
            : "بنشر المعرض، سيتم تحليل الوجوه في الصور لتمكين المدعوين من إيجاد صورهم. أؤكد أنه تم إعلام المدعوين بذلك."}
        </Text>
        <View style={styles.sheetBtns}>
          <Pressable style={[styles.goldBtn, styles.flex1]} onPress={confirmPublish}><Text style={styles.goldBtnText}>✓ {he ? "אני מאשר ומפרסם" : "أوافق وأنشر"}</Text></Pressable>
          <Pressable style={[styles.ghostBtn, styles.flex1]} onPress={() => setConsentOpen(false)}><Text style={styles.ghostBtnText}>{he ? "ביטול" : "إلغاء"}</Text></Pressable>
        </View>
      </BottomSheet>
    </View>
  );
}

const TILE = "48%";
const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: C.bg },
  list: { padding: space[4], paddingBottom: space[12] },
  col: { justifyContent: "space-between" },
  empty: { padding: space[8], alignItems: "center" },
  emptyText: { color: C.dim, fontSize: type.md, textAlign: "center" },
  publishCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: space[3],
    backgroundColor: "#0f0f15",
    borderColor: "rgba(201,168,76,0.18)",
    borderWidth: 1,
    borderRadius: radius.xl,
    padding: space[4],
    marginBottom: space[3],
  },
  publishInfo: { flex: 1 },
  publishTitle: { color: C.goldLight, fontSize: type.md, fontWeight: "800", textAlign: "right" },
  publishHint: { color: C.dim, fontSize: type.xs, lineHeight: 18, textAlign: "right", marginTop: space[1] },
  pubBtn: { paddingHorizontal: space[4], paddingVertical: space[2], borderRadius: radius.md },
  pubBtnOn: { backgroundColor: C.gold },
  pubBtnOff: { borderColor: "rgba(201,168,76,0.4)", borderWidth: 1 },
  pubBtnText: { color: C.bg, fontWeight: "800", fontSize: type.sm },
  uploadRow: { flexDirection: "row", gap: space[2], marginBottom: space[3] },
  filterWrap: { marginTop: space[2] },
  tile: {
    width: TILE,
    backgroundColor: "#0f0f15",
    borderColor: "rgba(255,255,255,0.07)",
    borderWidth: 1,
    borderRadius: radius.lg,
    padding: space[2],
    marginBottom: space[3],
  },
  thumb: { width: "100%", aspectRatio: 1, borderRadius: radius.md, backgroundColor: "#1a1a22" },
  videoThumb: { alignItems: "center", justifyContent: "center" },
  videoGlyph: { fontSize: 34 },
  pendingOverlay: { ...StyleSheet.absoluteFillObject, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(0,0,0,0.4)" },
  pendingText: { fontSize: 28 },
  tileName: { color: C.goldLight, fontSize: type.xs, marginTop: space[1], textAlign: "right" },
  tileActions: { flexDirection: "row", justifyContent: "flex-end", gap: space[3], marginTop: space[1] },
  tileAction: { color: C.gold, fontSize: type.md },
  goldBtn: { flex: 1, paddingVertical: space[3], borderRadius: radius.md, backgroundColor: C.gold, alignItems: "center" },
  goldBtnText: { color: C.bg, fontSize: type.sm, fontWeight: "800" },
  ghostBtn: { flex: 1, paddingVertical: space[3], borderRadius: radius.md, borderColor: "rgba(201,168,76,0.4)", borderWidth: 1, alignItems: "center" },
  ghostBtnText: { color: C.goldLight, fontSize: type.sm, fontWeight: "800" },
  dim: { opacity: 0.45 },
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
  sheetBtns: { flexDirection: "row", gap: space[2], marginTop: space[3] },
  flex1: { flex: 1 },
  consentBody: { color: C.goldDim, fontSize: type.sm, lineHeight: 22, textAlign: "right" },
});
