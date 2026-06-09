// Self-serve digital invitation design editor. The groom edits every aspect of
// the luxury invitation — text, dates, photos, story timeline, details, venue,
// guestbook, RSVP options — sees a live preview, then submits for admin
// approval. Section toggles let the groom hide any part of the design.
import { useEffect, useMemo, useRef, useState } from "react";
import { usePortal } from "../../../../context/PortalContext.jsx";
import {
  subscribeDesigns,
  createDesign,
  deleteDesign,
  subscribeDesign,
  patchDesignById,
  submitDesignById,
  cancelDesignById,
  addDesignMedia,
  removeDesignMedia,
} from "../../../../services/digitalInvitation.js";
import { logErr } from "../../../../utils/logger.js";
import { ensureDigitalFonts } from "../../../../utils/digitalFonts.js";
import { C } from "../../../../styles/theme.js";
import { DIGITAL_THEMES, DIGITAL_FONTS, DIGITAL_THEME_KEYS, DIGITAL_FONT_KEYS } from "../../../../styles/digitalThemes.js";
import { DigitalInvitationView } from "../../../../components/digital/DigitalInvitationView.jsx";
import {
  DEFAULT_EYEBROW,
  DEFAULT_MEAL_OPTIONS,
  SAMPLE_STORY,
  SAMPLE_DETAILS,
  SAMPLE_HOTELS,
  SAMPLE_WISHES,
} from "../../../../data/digitalInviteDefaults.js";
import { hasContent } from "../../../../utils/localize.js";

const tt = (lang, ar, he) => (lang === "he" ? he : ar);

// ── Bilingual field helpers ───────────────────────────────────────────────
// A localized text field is stored as { ar, he }. The editor edits one language
// at a time (editLang); a legacy plain string is treated as the Arabic value so
// existing single-language designs keep working.
function leaf(value, editLang) {
  if (value == null) return "";
  if (typeof value === "string") return editLang === "ar" ? value : "";
  if (typeof value === "object") return value[editLang] || "";
  return String(value);
}
function setLeaf(value, editLang, next) {
  const base =
    value && typeof value === "object" && !Array.isArray(value)
      ? { ...value }
      : typeof value === "string" && value
        ? { ar: value }
        : {};
  base[editLang] = next;
  return base;
}
// Zip Arabic + Hebrew sample arrays into per-leaf { ar, he } items (fill-sample).
function mergeLang(arAr, heAr, keys) {
  return (arAr || []).map((a, i) => {
    const h = (heAr || [])[i] || {};
    const out = { ...a };
    for (const k of keys) out[k] = { ar: a[k] || "", he: h[k] || "" };
    return out;
  });
}

// Every scalar/array field the groom edits lives in one buffered object so the
// preview is a simple merge and autosave can target a single key at a time.
const SCALAR_KEYS = [
  "title",
  "brideName", "groomDisplayName", "eyebrow", "monogram",
  "venue", "venueCity", "venueAddress", "accessNote", "dressCode",
  "giftNote", "giftIban", "musicUrl",
];
const ARRAY_KEYS = ["storyTimeline", "details", "hotels", "wishes", "mealOptions"];
const TOGGLE_KEYS = [
  "storyEnabled", "galleryEnabled", "detailsEnabled", "venueEnabled",
  "countdownEnabled", "guestbookEnabled", "giftEnabled", "musicEnabled",
  "footerDockEnabled", "envelopeEnabled", "heroMediaEnabled",
  "rsvpCompanionsEnabled", "rsvpMealEnabled", "rsvpSongEnabled",
];

const DESIGN_STATUS_META = {
  draft:            { ar: "مسوّدة", he: "טיוטה", color: "#c9a84c" },
  pending_approval: { ar: "بانتظار الموافقة", he: "ממתין לאישור", color: "#4b9fd4" },
  approved:         { ar: "معتمد", he: "מאושר", color: "#4cc97a" },
  rejected:         { ar: "مرفوض", he: "נדחה", color: "#d4533a" },
};

function pillBtn(enabled) {
  return {
    background: "rgba(201,168,76,.08)", border: "1px solid rgba(201,168,76,.3)", color: C.gold,
    padding: "6px 12px", borderRadius: 9, fontSize: 11, fontWeight: 800,
    cursor: enabled ? "pointer" : "not-allowed", opacity: enabled ? 1 : 0.5, fontFamily: "inherit",
  };
}

// Top-level Design tab: lets the groom switch between / create / duplicate /
// delete designs, then edits the selected one via <DesignEditorBody/>.
export function DigitalDesignEditor() {
  const { lang, currentUid, showToast } = usePortal();
  const [designs, setDesigns] = useState(null); // null = loading
  const [selectedId, setSelectedId] = useState(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!currentUid) return undefined;
    return subscribeDesigns(currentUid, (list) => {
      const arr = Array.isArray(list) ? list : [];
      setDesigns(arr);
      setSelectedId((cur) => {
        if (cur && arr.some((d) => d.id === cur)) return cur;
        let saved = null;
        try { saved = localStorage.getItem(`dawa_sel_design_${currentUid}`); } catch { /* ignore */ }
        if (saved && arr.some((d) => d.id === saved)) return saved;
        const def = arr.find((d) => d.isDefault) || arr[0];
        return def ? def.id : null;
      });
    });
  }, [currentUid]);

  const select = (id) => {
    setSelectedId(id);
    try { localStorage.setItem(`dawa_sel_design_${currentUid}`, id); } catch { /* ignore */ }
  };

  const onCreate = async (copyFromId) => {
    setBusy(true);
    try {
      const res = await createDesign(currentUid, copyFromId ? { copyFromId } : {});
      if (res?.id) select(res.id);
      showToast(tt(lang, "✓ تم إنشاء التصميم", "✓ העיצוב נוצר"));
    } catch (err) {
      logErr("createDesign", err);
      const code = err?.body?.error;
      showToast(code === "too_many_designs"
        ? tt(lang, "بلغت الحد الأقصى للتصاميم", "הגעת למספר העיצובים המרבי")
        : (err?.message || tt(lang, "فشل الإنشاء", "היצירה נכשלה")));
    } finally { setBusy(false); }
  };

  const onDelete = async (id) => {
    if (!window.confirm(tt(lang, "حذف هذا التصميم؟ لا يمكن التراجع.", "למחוק את העיצוב הזה? אי אפשר לבטל."))) return;
    setBusy(true);
    try {
      const res = await deleteDesign(currentUid, id);
      if (id === selectedId && res?.defaultDesignId) select(res.defaultDesignId);
      showToast(tt(lang, "✓ تم حذف التصميم", "✓ העיצוב נמחק"));
    } catch (err) {
      logErr("deleteDesign", err);
      const code = err?.body?.error;
      showToast(code === "last_design"
        ? tt(lang, "لا يمكن حذف التصميم الوحيد", "אי אפשר למחוק את העיצוב היחיד")
        : (err?.message || tt(lang, "فشل الحذف", "המחיקה נכשלה")));
    } finally { setBusy(false); }
  };

  if (designs === null) {
    return (
      <div style={{ textAlign: "center", padding: 40, color: C.dim }}>
        <span className="spinner" /> {tt(lang, "جاري التحميل...", "טוען...")}
      </div>
    );
  }

  return (
    <div style={{ animation: "fadeUp .3s ease" }}>
      <DesignSwitcher
        designs={designs} selectedId={selectedId} lang={lang} busy={busy}
        onSelect={select} onCreate={onCreate} onDelete={onDelete}
      />
      {selectedId && <DesignEditorBody key={selectedId} groomUid={currentUid} designId={selectedId} />}
    </div>
  );
}

function DesignSwitcher({ designs, selectedId, lang, busy, onSelect, onCreate, onDelete }) {
  const canAdd = designs.length < 8;
  const editLang = lang === "he" ? "he" : "ar";
  return (
    <div className="gold-card" style={{ padding: 14, marginBottom: 16 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10, gap: 8, flexWrap: "wrap" }}>
        <div style={{ fontSize: 13, color: C.goldLight, fontWeight: 800, letterSpacing: 1 }}>
          {tt(lang, "تصاميمك", "העיצובים שלך")} <span style={{ color: C.dim, fontWeight: 600 }}>({designs.length})</span>
        </div>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          <button data-testid="design-new" disabled={!canAdd || busy} onClick={() => onCreate(null)} style={pillBtn(canAdd && !busy)}>
            ➕ {tt(lang, "تصميم جديد", "עיצוב חדש")}
          </button>
          {selectedId && (
            <button data-testid="design-duplicate" disabled={!canAdd || busy} onClick={() => onCreate(selectedId)} style={pillBtn(canAdd && !busy)}>
              ⧉ {tt(lang, "نسخ المحدد", "שכפל")}
            </button>
          )}
        </div>
      </div>
      <div style={{ display: "flex", gap: 8, overflowX: "auto", paddingBottom: 4 }}>
        {designs.map((d) => {
          const active = d.id === selectedId;
          const meta = DESIGN_STATUS_META[d.designStatus] || DESIGN_STATUS_META.draft;
          const title = leaf(d.title, editLang) || tt(lang, "بدون اسم", "ללא שם");
          return (
            <div
              key={d.id}
              data-testid="design-chip"
              onClick={() => onSelect(d.id)}
              style={{
                flex: "0 0 auto", minWidth: 132, maxWidth: 180, cursor: "pointer", padding: "10px 12px",
                borderRadius: 12, position: "relative",
                border: `2px solid ${active ? C.gold : "rgba(255,255,255,.08)"}`,
                background: active ? "rgba(201,168,76,.10)" : "rgba(255,255,255,.02)",
              }}
            >
              <div style={{ fontSize: 12, fontWeight: 800, color: active ? C.gold : C.goldLight, marginBottom: 6, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", paddingInlineEnd: 16 }}>
                {title}
              </div>
              <span style={{ fontSize: 10, fontWeight: 700, color: meta.color, background: `${meta.color}22`, padding: "2px 7px", borderRadius: 8 }}>
                {tt(lang, meta.ar, meta.he)}
              </span>
              {designs.length > 1 && (
                <button
                  onClick={(e) => { e.stopPropagation(); onDelete(d.id); }}
                  aria-label="delete"
                  style={{ position: "absolute", top: 4, insetInlineEnd: 4, width: 20, height: 20, borderRadius: 10, background: "rgba(0,0,0,.5)", border: "1px solid rgba(212,80,58,.4)", color: "#fff", fontSize: 11, cursor: "pointer", lineHeight: 1, padding: 0 }}
                >
                  ✕
                </button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// The editor body, bound to ONE design (groomUid + designId). Wrapped by the
// DigitalDesignManager below, which lets the groom switch between designs.
function DesignEditorBody({ groomUid, designId }) {
  const { lang, showToast } = usePortal();
  const currentUid = groomUid;
  const langKey = lang === "he" ? "he" : "ar";
  // Which language the text inputs edit. Each localized field stores both.
  const [editLang, setEditLang] = useState(langKey);
  const [doc, setDoc] = useState(null);
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(0);
  const [heroBusy, setHeroBusy] = useState(false);
  const [heroProgress, setHeroProgress] = useState(0);
  // An APPROVED design is read-only until the groom presses "تعديل التصميم".
  // Reset per design so a fresh/approved design always starts locked.
  const [editUnlocked, setEditUnlocked] = useState(false);
  const fileInputRef = useRef(null);
  const heroFileInputRef = useRef(null);

  // Buffered field values (scalars + arrays + toggles + mediaCaptions + the
  // wedding-date input string). Autosave fires on blur/change, not per keystroke.
  const [f, setF] = useState({});
  const dirty = useRef(new Set());

  // Load the extended Arabic+Hebrew wedding fonts so the font-picker previews
  // (and the live preview) render in the real faces.
  useEffect(() => { ensureDigitalFonts(); }, []);

  // Re-subscribe (and reset the buffer) whenever the selected design changes.
  useEffect(() => {
    if (!currentUid || !designId) return undefined;
    setLoaded(false);
    setDoc(null);
    setF({});
    setEditUnlocked(false);
    dirty.current = new Set();
    return subscribeDesign(currentUid, designId, (d) => {
      setDoc(d);
      setLoaded(true);
      const next = d || {};
      setF((prev) => {
        const merged = { ...prev };
        const apply = (k, v) => { if (!dirty.current.has(k)) merged[k] = v; };
        SCALAR_KEYS.forEach((k) => apply(k, next[k] || ""));
        apply("weddingDate", epochToInput(next.weddingDate));
        ARRAY_KEYS.forEach((k) => apply(k, Array.isArray(next[k]) ? next[k] : []));
        TOGGLE_KEYS.forEach((k) => apply(k, next[k] !== false));
        apply("mediaCaptions", next.mediaCaptions && typeof next.mediaCaptions === "object" ? next.mediaCaptions : {});
        apply("themeColor", next.themeColor || "gold");
        apply("fontFamily", next.fontFamily || "amiri");
        return merged;
      });
    });
  }, [currentUid, designId]);

  const status = doc?.designStatus || "draft";
  // Read from the buffered `f` first so theme/font picks update the preview
  // instantly (optimistic), before the background save round-trips.
  const themeColor = f.themeColor || doc?.themeColor || "gold";
  const fontFamily = f.fontFamily || doc?.fontFamily || "amiri";
  const media = Array.isArray(doc?.media) ? doc.media : [];
  const heroMedia = Array.isArray(doc?.heroMedia) ? doc.heroMedia : [];

  // Draft & rejected are directly editable; pending is read-only (awaiting admin).
  // Approved is LOCKED until the groom deliberately presses "تعديل التصميم"
  // (editUnlocked) — then the first field edit demotes it to draft (server-side).
  const editable = status === "draft" || status === "rejected" || (status === "approved" && editUnlocked);

  // The live design that drives the preview: saved doc + buffered overrides.
  const previewDesign = useMemo(
    () => ({
      ...doc,
      ...f,
      weddingDate: inputToEpoch(f.weddingDate),
      themeColor,
      fontFamily,
      media,
      heroMedia,
    }),
    [doc, f, themeColor, fontFamily, media, heroMedia],
  );

  // ── Persistence ────────────────────────────────────────────────────────────
  const confirmApproved = () =>
    window.confirm(tt(
      lang,
      "تعديل التصميم سيتطلب إعادة الموافقة. الدعوات المُرسلة سابقاً ستحتفظ بنسختها. متابعة؟",
      "עריכת העיצוב תדרוש אישור מחדש. הזמנות שכבר נשלחו ישמרו על הגרסה הקודמת. להמשיך?",
    ));

  // Unlock editing of an approved design after an explicit confirmation. The
  // first saved edit then demotes it to draft (server-side) for re-approval.
  const onEditApproved = () => {
    if (confirmApproved()) setEditUnlocked(true);
  };

  const persist = async (patch) => {
    if (!editable) return false;
    try {
      await patchDesignById(currentUid, designId,patch);
      return true;
    } catch (err) {
      logErr("patchDesignFields", err);
      showToast(err?.message || tt(lang, "فشل الحفظ", "השמירה נכשלה"));
      return false;
    }
  };

  // Restore a buffered key from the saved doc (used when an approved-edit is
  // cancelled at the confirm dialog).
  const revert = (key) => {
    const cur = doc || {};
    setF((prev) => {
      if (key === "weddingDate") return { ...prev, weddingDate: epochToInput(cur.weddingDate) };
      if (ARRAY_KEYS.includes(key)) return { ...prev, [key]: Array.isArray(cur[key]) ? cur[key] : [] };
      if (TOGGLE_KEYS.includes(key)) return { ...prev, [key]: cur[key] !== false };
      if (key === "mediaCaptions") return { ...prev, mediaCaptions: cur.mediaCaptions || {} };
      if (key === "themeColor") return { ...prev, themeColor: cur.themeColor || "gold" };
      if (key === "fontFamily") return { ...prev, fontFamily: cur.fontFamily || "amiri" };
      return { ...prev, [key]: cur[key] || "" };
    });
    dirty.current.delete(key);
  };

  const setField = (key, value) => {
    dirty.current.add(key);
    setF((prev) => ({ ...prev, [key]: value }));
  };

  // Commit a scalar/array/captions field by key on blur.
  const flush = async (key, value) => {
    if (!dirty.current.has(key)) return;
    const ok = await persist({ [key]: value });
    if (ok) dirty.current.delete(key);
    else revert(key);
  };

  const toggle = async (key, checked) => {
    setF((prev) => ({ ...prev, [key]: checked }));
    const ok = await persist({ [key]: checked });
    if (!ok) revert(key);
  };

  const setArray = (key, arr) => setField(key, arr);
  const commitArray = async (key, arr) => {
    const ok = await persist({ [key]: arr });
    if (ok) dirty.current.delete(key);
    else revert(key);
  };

  // Optimistic: update the buffered field so the preview re-themes instantly,
  // then persist in the background (no await → no lag). flush() reverts + toasts
  // on failure, and the dirty flag keeps the next poll from clobbering the pick.
  const onPickTheme = (key) => {
    if (!editable || themeColor === key) return;
    setField("themeColor", key);
    flush("themeColor", key);
  };
  const onPickFont = (key) => {
    if (!editable || fontFamily === key) return;
    setField("fontFamily", key);
    flush("fontFamily", key);
  };

  // One-click: start from the full sample design for any sections still empty.
  const fillSample = async () => {
    const patch = {};
    // Fill BOTH languages so the guest's toggle has content either way.
    if (!(f.storyTimeline || []).length) patch.storyTimeline = mergeLang(SAMPLE_STORY.ar, SAMPLE_STORY.he, ["when", "title", "body"]);
    if (!(f.details || []).length) patch.details = mergeLang(SAMPLE_DETAILS.ar, SAMPLE_DETAILS.he, ["meta", "title", "body"]);
    if (!(f.hotels || []).length) patch.hotels = mergeLang(SAMPLE_HOTELS.ar, SAMPLE_HOTELS.he, ["name", "walk"]);
    if (!(f.wishes || []).length) patch.wishes = mergeLang(SAMPLE_WISHES.ar, SAMPLE_WISHES.he, ["who", "what"]);
    if (!(f.mealOptions || []).length) patch.mealOptions = DEFAULT_MEAL_OPTIONS.ar.map((a, i) => ({ ar: a, he: DEFAULT_MEAL_OPTIONS.he[i] || a }));
    if (!hasContent(f.eyebrow)) patch.eyebrow = { ar: DEFAULT_EYEBROW.ar, he: DEFAULT_EYEBROW.he };
    if (!hasContent(f.dressCode)) patch.dressCode = { ar: "كاجوال أنيق · ألوان فاتحة", he: "אלגנט קז'ואל · צבעים בהירים" };
    if (!hasContent(f.accessNote)) patch.accessNote = { ar: "15–20 دقيقة من وسط المدينة · خدمة فاليه", he: "15–20 דקות ממרכز העיר · שירות ולט" };
    if (Object.keys(patch).length === 0) {
      showToast(tt(lang, "كل الأقسام معبّأة بالفعل", "כל החלקים כבר מלאים"));
      return;
    }
    setBusy(true);
    const ok = await persist(patch);
    if (ok) {
      Object.keys(patch).forEach((k) => dirty.current.delete(k));
      setF((prev) => ({ ...prev, ...patch }));
      showToast(tt(lang, "✓ تم تعبئة المحتوى النموذجي", "✓ תוכן לדוגמה נטען"));
    }
    setBusy(false);
  };

  const onUpload = async (file) => {
    if (!file || !editable) return;
    setBusy(true);
    setProgress(0);
    try {
      const item = await addDesignMedia(currentUid, designId, file, { onProgress: setProgress });
      // Optimistic insert — show the new image instantly instead of waiting
      // up to a full poll cycle for subscribeDesign to echo it back.
      if (item && item.storagePath) {
        setDoc((prev) => {
          const existing = Array.isArray(prev?.media) ? prev.media : [];
          if (existing.some((m) => m?.storagePath === item.storagePath)) return prev;
          return { ...(prev || {}), media: [...existing, item] };
        });
      }
      showToast(tt(lang, "✓ تم رفع الصورة", "✓ התמונה הועלתה"));
    } catch (err) {
      logErr("addInvitationMedia", err);
      showToast(err?.message || tt(lang, "فشل الرفع", "ההעלאה נכשלה"));
    } finally {
      setBusy(false);
      setProgress(0);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const onRemoveMedia = async (item) => {
    if (!editable) return;
    if (!window.confirm(tt(lang, "حذف هذه الصورة؟", "למחוק את התמונה הזו?"))) return;
    try {
      await removeDesignMedia(currentUid, designId, item);
      showToast(tt(lang, "✓ تم الحذف", "✓ נמחק"));
    } catch (err) {
      logErr("removeInvitationMedia", err);
      showToast(err?.message || tt(lang, "فشل الحذف", "המחיקה נכשלה"));
    }
  };

  // Featured media shown under the greeting — separate from the gallery, so
  // these uploads target the dedicated heroMedia[] array.
  const onUploadHero = async (file) => {
    if (!file || !editable) return;
    setHeroBusy(true);
    setHeroProgress(0);
    try {
      const item = await addDesignMedia(currentUid, designId, file, { target: "hero", onProgress: setHeroProgress });
      if (item && item.storagePath) {
        setDoc((prev) => {
          const existing = Array.isArray(prev?.heroMedia) ? prev.heroMedia : [];
          if (existing.some((m) => m?.storagePath === item.storagePath)) return prev;
          return { ...(prev || {}), heroMedia: [...existing, item] };
        });
      }
      showToast(tt(lang, "✓ تم رفع الوسائط", "✓ המדיה הועלתה"));
    } catch (err) {
      logErr("addInvitationMedia.hero", err);
      showToast(err?.message || tt(lang, "فشل الرفع", "ההעלאה נכשלה"));
    } finally {
      setHeroBusy(false);
      setHeroProgress(0);
      if (heroFileInputRef.current) heroFileInputRef.current.value = "";
    }
  };

  const onRemoveHero = async (item) => {
    if (!editable) return;
    if (!window.confirm(tt(lang, "حذف هذه الوسائط؟", "למחוק את המדיה הזו?"))) return;
    try {
      await removeDesignMedia(currentUid, designId, item, { target: "hero" });
      showToast(tt(lang, "✓ تم الحذف", "✓ נמחק"));
    } catch (err) {
      logErr("removeInvitationMedia.hero", err);
      showToast(err?.message || tt(lang, "فشل الحذف", "המחיקה נכשלה"));
    }
  };

  const setCaption = (storagePath, value) => {
    setField("mediaCaptions", { ...(f.mediaCaptions || {}), [storagePath]: value });
  };

  const onSubmit = async () => {
    if (!hasContent(f.brideName) || !hasContent(f.groomDisplayName)) {
      showToast(tt(lang, "اسما العروسين مطلوبان", "שמות הזוג נדרשים"));
      return;
    }
    setBusy(true);
    try {
      await submitDesignById(currentUid, designId);
      showToast(tt(lang, "✓ تم الإرسال للموافقة", "✓ נשלח לאישור"));
    } catch (err) {
      logErr("submitDesignForApproval", err);
      showToast(err?.message || tt(lang, "فشل الإرسال", "השליחה נכשלה"));
    } finally {
      setBusy(false);
    }
  };

  const onCancelSubmission = async () => {
    setBusy(true);
    try {
      await cancelDesignById(currentUid, designId);
      showToast(tt(lang, "↶ تم الإلغاء، يمكنك التعديل", "↶ בוטל, ניתן לערוך"));
    } catch (err) {
      logErr("cancelDesignSubmission", err);
      showToast(err?.message || tt(lang, "فشل الإلغاء", "הביטול נכשל"));
    } finally {
      setBusy(false);
    }
  };

  if (!loaded) {
    return (
      <div style={{ textAlign: "center", padding: 40, color: C.dim }}>
        <span className="spinner" /> {tt(lang, "جاري التحميل...", "טוען...")}
      </div>
    );
  }

  const v = (key) => f[key] ?? "";
  const arr = (key) => f[key] || [];
  const tog = (key) => f[key] !== false;
  // Localized text input — binds to the editLang leaf of a { ar, he } field.
  const textProps = (key, max) => ({
    className: "input-field",
    value: leaf(f[key], editLang),
    disabled: !editable,
    maxLength: max,
    onChange: (e) => setField(key, setLeaf(f[key], editLang, e.target.value)),
    onBlur: () => flush(key, f[key]),
  });
  // Latin/single-value text input (IBAN, music URL) — never localized.
  const latinProps = (key, max) => ({
    className: "input-field",
    value: typeof f[key] === "string" ? f[key] : "",
    disabled: !editable,
    maxLength: max,
    onChange: (e) => setField(key, e.target.value),
    onBlur: () => flush(key, typeof f[key] === "string" ? f[key].trim() : f[key]),
  });

  return (
    <div style={{ animation: "fadeUp .3s ease" }}>
      {/* ── Title ──────────────────────────────────────────────────────────── */}
      <div style={{ marginBottom: 14 }}>
        <div style={{ fontSize: 19, fontWeight: 900, color: C.gold, fontFamily: "'Amiri',serif", marginBottom: 4 }}>
          🎨 {tt(lang, "تصميم الدعوة", "עיצוב ההזמנה")}
        </div>
        <div style={{ fontSize: 12, color: C.dim, lineHeight: 1.7 }}>
          {tt(
            lang,
            "صمّم دعوتك بالكامل — النصوص، التواريخ، الصور، قصتكم، تفاصيل اليوم — ثم أرسلها للأدمن للاعتماد. كل قسم يظهر افتراضياً؛ أزِل العلامة لإخفائه.",
            "עצב את ההזמנה במלואה — טקסטים, תאריכים, תמונות, הסיפור שלכם — ושלח לאישור. כל חלק מוצג כברירת מחדל; הסר סימון כדי להסתיר.",
          )}
        </div>
      </div>

      {/* Design name — a groom-facing label to tell designs apart. */}
      <div style={{ marginBottom: 14 }}>
        <div style={{ fontSize: 12, color: C.goldDim, marginBottom: 5 }}>
          {tt(lang, "اسم هذا التصميم (لك فقط)", "שם העיצוב (לשימושך)")}
        </div>
        <input
          data-testid="design-title"
          type="text"
          className="input-field"
          value={leaf(f.title, editLang)}
          disabled={!editable}
          maxLength={60}
          placeholder={tt(lang, "مثال: تصميم العائلة", "למשל: עיצוב למשפחה")}
          onChange={(e) => setField("title", setLeaf(f.title, editLang, e.target.value))}
          onBlur={() => flush("title", f.title)}
        />
      </div>

      <StatusBanner status={status} doc={doc} lang={lang} onCancel={onCancelSubmission} busy={busy}
        editUnlocked={editUnlocked} onEditApproved={onEditApproved} />

      <button
        data-testid="design-fill-sample"
        onClick={fillSample}
        disabled={!editable || busy}
        style={{
          width: "100%", padding: "10px 0", borderRadius: 10, marginBottom: 16,
          background: "rgba(201,168,76,.08)", border: "1px dashed rgba(201,168,76,.4)",
          color: C.gold, fontSize: 12, fontWeight: 800, cursor: editable && !busy ? "pointer" : "not-allowed",
          fontFamily: "inherit",
        }}
      >
        ✨ {tt(lang, "تعبئة الأقسام الفارغة بمحتوى نموذجي", "מלא חלקים ריקים בתוכן לדוגמה")}
      </button>

      {/* Bilingual content tab — each text field below is saved per language, and
          the guest can toggle between them on the invitation. Fill both. */}
      <div style={{ marginBottom: 16 }}>
        <div style={{ fontSize: 11, color: C.dim, marginBottom: 6, fontWeight: 700 }}>
          {tt(lang, "لغة محتوى الدعوة — يُفضّل تعبئة النصّين (يبدّل الضيف بينهما)", "שפת תוכן ההזמנה — מלא את שני הטקסטים (האורח מחליף ביניהם)")}
        </div>
        <div style={{ display: "inline-flex", borderRadius: 10, overflow: "hidden", border: "1px solid rgba(201,168,76,.3)" }}>
          {[
            { code: "ar", label: "العربية" },
            { code: "he", label: "עברית" },
          ].map(({ code, label }) => (
            <button
              key={code}
              type="button"
              data-testid={`design-editlang-${code}`}
              onClick={() => setEditLang(code)}
              style={{
                padding: "8px 18px", fontSize: 12, fontWeight: 800, cursor: "pointer",
                fontFamily: "inherit", border: "none",
                background: editLang === code ? C.gold : "transparent",
                color: editLang === code ? "#1a1206" : C.goldLight,
              }}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "minmax(280px, 1fr)", gap: 16 }}>
        {/* Names */}
        <Section title={tt(lang, "أسماء العروسين", "שמות הזוג")}>
          <FormField label={tt(lang, "اسم العريس *", "שם החתן *")}>
            <input data-testid="design-groom-name" type="text" {...textProps("groomDisplayName", 120)} />
          </FormField>
          <FormField label={tt(lang, "اسم العروس *", "שם הכלה *")}>
            <input data-testid="design-bride-name" type="text" {...textProps("brideName", 120)} />
          </FormField>
          <FormField label={tt(lang, "الحرفان في الشعار (مثل: ك&ل) — اتركه فارغاً للاشتقاق التلقائي", "מונוגרמה (למשל: כ&ל) — ריק = אוטומטי")}>
            <input data-testid="design-monogram" type="text" {...textProps("monogram", 12)} />
          </FormField>
          <FormField label={tt(lang, "نص علوي صغير في البداية", "כיתוב עליון קצר")}>
            <input data-testid="design-eyebrow" type="text" placeholder={DEFAULT_EYEBROW[editLang]} {...textProps("eyebrow", 60)} />
          </FormField>
        </Section>

        {/* Featured media under the greeting */}
        <Section
          title={tt(lang, "صور تحت الترحيب (وسائط مميزة)", "מדיה מתחת לברכה")}
          toggle={{ enabled: tog("heroMediaEnabled"), onChange: (c) => toggle("heroMediaEnabled", c), disabled: !editable, testid: "design-toggle-hero-media" }}
        >
          <div style={{ fontSize: 11, color: C.dim, marginBottom: 12, lineHeight: 1.6 }}>
            {tt(
              lang,
              "صور أو فيديو أو GIF تظهر مباشرة تحت جملة الترحيب في الدعوة — منفصلة عن ألبوم الصور.",
              "תמונות, וידאו או GIF שמוצגים מיד מתחת לברכה בהזמנה — בנפרד מאלבום התמונות.",
            )}
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(120px, 1fr))", gap: 10, marginBottom: 12 }}>
            {heroMedia.map((m, i) => (
              <div key={m.storagePath || i} style={{ border: "1px solid rgba(201,168,76,.2)", borderRadius: 10, overflow: "hidden", background: "rgba(255,255,255,.02)" }}>
                <div style={{ position: "relative", aspectRatio: "1" }}>
                  {m.kind === "video" ? (
                    <video src={m.url} muted playsInline style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                  ) : (
                    <img src={m.url} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                  )}
                  {editable && (
                    <button
                      onClick={() => onRemoveHero(m)}
                      aria-label="delete"
                      style={{ position: "absolute", top: 4, insetInlineEnd: 4, width: 24, height: 24, borderRadius: 12, background: "rgba(0,0,0,.6)", border: "1px solid rgba(212,80,58,.4)", color: "#fff", fontSize: 12, cursor: "pointer" }}
                    >
                      ✕
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
          {editable && (
            <label style={{ display: "block", padding: "12px 16px", borderRadius: 10, textAlign: "center", border: `2px dashed ${heroBusy ? "rgba(201,168,76,.65)" : "rgba(201,168,76,.32)"}`, background: heroBusy ? "rgba(201,168,76,.06)" : "rgba(201,168,76,.02)", cursor: heroBusy ? "not-allowed" : "pointer" }}>
              <input ref={heroFileInputRef} type="file" accept="image/*,video/*" style={{ display: "none" }} disabled={heroBusy} data-testid="design-hero-upload-input" onChange={(e) => onUploadHero(e.target.files?.[0])} />
              <div style={{ color: C.gold, fontSize: 12, fontWeight: 800 }}>
                {heroBusy ? `⏳ ${Math.round(heroProgress * 100)}%` : tt(lang, "📁 إضافة صورة / فيديو / GIF", "📁 הוסף תמונה / וידאו / GIF")}
              </div>
            </label>
          )}
        </Section>

        {/* Wedding date */}
        <Section title={tt(lang, "تاريخ الزفاف", "תאריך החתונה")}>
          <FormField label={tt(lang, "اختر التاريخ", "בחר תאריך")}>
            <input
              data-testid="design-wedding-date"
              className="input-field"
              type="date"
              value={v("weddingDate")}
              disabled={!editable}
              onChange={(e) => setField("weddingDate", e.target.value)}
              onBlur={() => flush("weddingDate", inputToEpoch(f.weddingDate))}
              style={{ direction: "ltr" }}
            />
          </FormField>
        </Section>

        {/* Story timeline */}
        <Section
          title={tt(lang, "قصتنا (الخط الزمني)", "הסיפור שלנו (ציר זמן)")}
          toggle={{ enabled: tog("storyEnabled"), onChange: (c) => toggle("storyEnabled", c), disabled: !editable, testid: "design-toggle-story" }}
        >
          <ArrayEditor
            testid="design-story"
            editLang={editLang}
            items={arr("storyTimeline")}
            disabled={!editable || !tog("storyEnabled")}
            onChange={(next) => setArray("storyTimeline", next)}
            onCommit={(next) => commitArray("storyTimeline", next)}
            max={8}
            addLabel={tt(lang, "➕ إضافة محطة", "➕ הוסף שלב")}
            removeLabel={tt(lang, "حذف", "מחק")}
            schema={[
              { key: "icon", placeholder: "✦", width: 56, maxLength: 8 },
              { key: "when", placeholder: tt(lang, "متى (صيف 2023)", "מתי"), maxLength: 40, localized: true },
              { key: "title", placeholder: tt(lang, "العنوان", "כותרת"), maxLength: 60, localized: true },
              { key: "body", placeholder: tt(lang, "الوصف", "תיאור"), maxLength: 400, textarea: true, localized: true },
            ]}
          />
        </Section>

        {/* Gallery / photos */}
        <Section
          title={tt(lang, "ألبوم الصور", "אלבום תמונות")}
          toggle={{ enabled: tog("galleryEnabled"), onChange: (c) => toggle("galleryEnabled", c), disabled: !editable, testid: "design-toggle-gallery" }}
        >
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(120px, 1fr))", gap: 10, marginBottom: 12 }}>
            {media.map((m, i) => (
              <div key={m.storagePath || i} style={{ border: "1px solid rgba(201,168,76,.2)", borderRadius: 10, overflow: "hidden", background: "rgba(255,255,255,.02)" }}>
                <div style={{ position: "relative", aspectRatio: "1" }}>
                  {m.kind === "video" ? (
                    <video src={m.url} muted playsInline style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                  ) : (
                    <img src={m.url} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                  )}
                  {editable && (
                    <button
                      onClick={() => onRemoveMedia(m)}
                      aria-label="delete"
                      style={{ position: "absolute", top: 4, insetInlineEnd: 4, width: 24, height: 24, borderRadius: 12, background: "rgba(0,0,0,.6)", border: "1px solid rgba(212,80,58,.4)", color: "#fff", fontSize: 12, cursor: "pointer" }}
                    >
                      ✕
                    </button>
                  )}
                </div>
                <input
                  className="input-field"
                  type="text"
                  value={(f.mediaCaptions || {})[m.storagePath] || ""}
                  disabled={!editable}
                  maxLength={120}
                  placeholder={tt(lang, "تعليق الصورة", "כיתוב")}
                  onChange={(e) => setCaption(m.storagePath, e.target.value)}
                  onBlur={() => flush("mediaCaptions", f.mediaCaptions || {})}
                  style={{ borderRadius: 0, border: "none", borderTop: "1px solid rgba(201,168,76,.15)", fontSize: 11, padding: "6px 8px" }}
                />
              </div>
            ))}
          </div>
          {editable && (
            <label style={{ display: "block", padding: "12px 16px", borderRadius: 10, textAlign: "center", border: `2px dashed ${busy ? "rgba(201,168,76,.65)" : "rgba(201,168,76,.32)"}`, background: busy ? "rgba(201,168,76,.06)" : "rgba(201,168,76,.02)", cursor: busy ? "not-allowed" : "pointer" }}>
              <input ref={fileInputRef} type="file" accept="image/*,video/*" style={{ display: "none" }} disabled={busy} data-testid="design-upload-input" onChange={(e) => onUpload(e.target.files?.[0])} />
              <div style={{ color: C.gold, fontSize: 12, fontWeight: 800 }}>
                {busy ? `⏳ ${Math.round(progress * 100)}%` : tt(lang, "📁 إضافة صورة أو فيديو", "📁 הוסף תמונה או סרטון")}
              </div>
            </label>
          )}
        </Section>

        {/* Details cards */}
        <Section
          title={tt(lang, "تفاصيل اليوم", "פרטי היום")}
          toggle={{ enabled: tog("detailsEnabled"), onChange: (c) => toggle("detailsEnabled", c), disabled: !editable, testid: "design-toggle-details" }}
        >
          <ArrayEditor
            testid="design-details"
            editLang={editLang}
            items={arr("details")}
            disabled={!editable || !tog("detailsEnabled")}
            onChange={(next) => setArray("details", next)}
            onCommit={(next) => commitArray("details", next)}
            max={8}
            addLabel={tt(lang, "➕ إضافة بطاقة", "➕ הוסף כרטיס")}
            removeLabel={tt(lang, "حذف", "מחק")}
            schema={[
              { key: "icon", placeholder: "♛", width: 56, maxLength: 8 },
              { key: "meta", placeholder: tt(lang, "تصنيف (حفل العقد)", "תווית"), maxLength: 40, localized: true },
              { key: "title", placeholder: tt(lang, "العنوان (7:00 مساءً)", "כותרת"), maxLength: 80, localized: true },
              { key: "body", placeholder: tt(lang, "الوصف", "תיאור"), maxLength: 300, textarea: true, localized: true },
            ]}
          />
        </Section>

        {/* Venue */}
        <Section
          title={tt(lang, "مكان الحفل", "מקום האירוע")}
          toggle={{ enabled: tog("venueEnabled"), onChange: (c) => toggle("venueEnabled", c), disabled: !editable, testid: "design-toggle-venue" }}
        >
          <FormField label={tt(lang, "اسم القاعة / المكان", "שם האולם")}>
            <input data-testid="design-venue" type="text" {...textProps("venue", 120)} />
          </FormField>
          <FormField label={tt(lang, "المدينة", "עיר")}>
            <input data-testid="design-venue-city" type="text" {...textProps("venueCity", 80)} />
          </FormField>
          <FormField label={tt(lang, "العنوان الكامل", "כתובת מלאה")}>
            <input data-testid="design-venue-address" type="text" {...textProps("venueAddress", 200)} />
          </FormField>
          <FormField label={tt(lang, "ملاحظة الوصول (مواقف / فاليه…)", "הערת הגעה (חניה / ולט…)")}>
            <input data-testid="design-access-note" type="text" {...textProps("accessNote", 200)} />
          </FormField>
          <FormField label={tt(lang, "فنادق قريبة", "מלונות בקרבת מקום")}>
            <ArrayEditor
              testid="design-hotels"
              editLang={editLang}
              items={arr("hotels")}
              disabled={!editable || !tog("venueEnabled")}
              onChange={(next) => setArray("hotels", next)}
              onCommit={(next) => commitArray("hotels", next)}
              max={6}
              addLabel={tt(lang, "➕ إضافة فندق", "➕ הוסף מלון")}
              removeLabel={tt(lang, "حذف", "מחק")}
              schema={[
                { key: "name", placeholder: tt(lang, "اسم الفندق", "שם המלון"), maxLength: 80, localized: true },
                { key: "walk", placeholder: tt(lang, "مسافة المشي", "מרחק הליכה"), width: 120, maxLength: 40, localized: true },
              ]}
            />
          </FormField>
        </Section>

        {/* Countdown */}
        <Section
          title={tt(lang, "العد التنازلي", "ספירה לאחור")}
          toggle={{ enabled: tog("countdownEnabled"), onChange: (c) => toggle("countdownEnabled", c), disabled: !editable, testid: "design-toggle-countdown" }}
        >
          <div style={{ fontSize: 11, color: C.dim, lineHeight: 1.6 }}>
            {tt(lang, "يعتمد على تاريخ الزفاف بالأعلى.", "מבוסס על תאריך החתונה שלמעלה.")}
          </div>
        </Section>

        {/* RSVP options */}
        <Section title={tt(lang, "خيارات تأكيد الحضور", "אפשרויות אישור הגעה")}>
          <ToggleRow label={tt(lang, "عدّاد عدد الحضور (شاملاً المدعو)", "מונה מספר אורחים (כולל המוזמן)")} checked={tog("rsvpCompanionsEnabled")} disabled={!editable} testid="design-toggle-companions" onChange={(c) => toggle("rsvpCompanionsEnabled", c)} />
          <ToggleRow label={tt(lang, "تفضيل الطعام", "העדפת מנה")} checked={tog("rsvpMealEnabled")} disabled={!editable} testid="design-toggle-meal" onChange={(c) => toggle("rsvpMealEnabled", c)} />
          <ToggleRow label={tt(lang, "طلب أغنية", "בקשת שיר")} checked={tog("rsvpSongEnabled")} disabled={!editable} testid="design-toggle-song" onChange={(c) => toggle("rsvpSongEnabled", c)} />
          {tog("rsvpMealEnabled") && (
            <FormField label={tt(lang, "خيارات الطعام (افصل بفاصلة)", "אפשרויות מנה (הפרד בפסיק)")}>
              <input
                data-testid="design-meal-options"
                className="input-field"
                type="text"
                disabled={!editable}
                value={(f.mealOptions || []).map((o) => leaf(o, editLang)).join("، ")}
                placeholder={DEFAULT_MEAL_OPTIONS[editLang].join("، ")}
                onChange={(e) => {
                  const parts = e.target.value.split(/[،,]/).map((s) => s.trim()).filter(Boolean);
                  const prev = f.mealOptions || [];
                  setField("mealOptions", parts.map((p, i) => setLeaf(prev[i], editLang, p)));
                }}
                onBlur={() => flush("mealOptions", (f.mealOptions || []))}
              />
            </FormField>
          )}
        </Section>

        {/* Guestbook */}
        <Section
          title={tt(lang, "دفتر التهاني", "ספר ברכות")}
          toggle={{ enabled: tog("guestbookEnabled"), onChange: (c) => toggle("guestbookEnabled", c), disabled: !editable, testid: "design-toggle-guestbook" }}
        >
          <div style={{ fontSize: 11, color: C.dim, marginBottom: 10, lineHeight: 1.6 }}>
            {tt(lang, "تهانٍ معروضة للضيوف. الضيوف يمكنهم أيضاً كتابة تهنئة على صفحة الدعوة.", "ברכות שיוצגו לאורחים. גם האורחים יוכלו לכתוב ברכה בעמוד ההזמנה.")}
          </div>
          <ArrayEditor
            testid="design-wishes"
            editLang={editLang}
            items={arr("wishes")}
            disabled={!editable || !tog("guestbookEnabled")}
            onChange={(next) => setArray("wishes", next)}
            onCommit={(next) => commitArray("wishes", next)}
            max={30}
            addLabel={tt(lang, "➕ إضافة تهنئة", "➕ הוסף ברכה")}
            removeLabel={tt(lang, "حذف", "מחק")}
            schema={[
              { key: "who", placeholder: tt(lang, "الاسم", "שם"), maxLength: 60, localized: true },
              { key: "what", placeholder: tt(lang, "التهنئة", "הברכה"), maxLength: 300, textarea: true, localized: true },
            ]}
          />
        </Section>

        {/* Gift */}
        <Section
          title={tt(lang, "هدية", "מתנה")}
          toggle={{ enabled: tog("giftEnabled"), onChange: (c) => toggle("giftEnabled", c), disabled: !editable, testid: "design-toggle-gift" }}
        >
          <FormField label={tt(lang, "رسالة الهدية", "הודעת מתנה")}>
            <textarea data-testid="design-gift-note" rows={2} {...textProps("giftNote", 300)} placeholder={tt(lang, "حضوركم أجمل هدية…", "נוכחותכם היא המתנה…")} style={{ resize: "vertical", minHeight: 50 }} />
          </FormField>
          <FormField label={tt(lang, "IBAN / رقم الحساب (اختياري)", "IBAN / מספר חשבון")}>
            <input data-testid="design-gift-iban" type="text" {...latinProps("giftIban", 60)} placeholder="IL00 0000 0000 0000" style={{ direction: "ltr" }} />
          </FormField>
        </Section>

        {/* Dress code */}
        <Section title={tt(lang, "كود اللباس", "קוד לבוש")}>
          <FormField label={tt(lang, "وصف اللباس (يظهر ضمن التفاصيل)", "תיאור הלבוש")}>
            <input data-testid="design-dress-code" type="text" {...textProps("dressCode", 120)} />
          </FormField>
        </Section>

        {/* Music */}
        <Section
          title={tt(lang, "موسيقى الخلفية", "מוזיקת רקע")}
          toggle={{ enabled: tog("musicEnabled"), onChange: (c) => toggle("musicEnabled", c), disabled: !editable, testid: "design-toggle-music" }}
        >
          <FormField label={tt(lang, "رابط ملف صوتي (mp3)", "קישור לקובץ אודיו (mp3)")}>
            <input data-testid="design-music-url" type="text" {...latinProps("musicUrl", 600)} placeholder="https://…/song.mp3" style={{ direction: "ltr" }} />
          </FormField>
        </Section>

        {/* Other section toggles */}
        <Section title={tt(lang, "إظهار / إخفاء الأقسام", "הצג / הסתר חלקים")}>
          <div style={{ fontSize: 11, color: C.dim, marginBottom: 12, lineHeight: 1.6 }}>
            {tt(lang, "كل الأقسام تظهر افتراضياً. أزل العلامة لإخفاء قسم.", "כל החלקים מוצגים כברירת מחדל. הסר סימון כדי להסתיר.")}
          </div>
          <ToggleRow label={tt(lang, "غلاف الفتح (المظروف)", "מעטפת פתיחה")} checked={tog("envelopeEnabled")} disabled={!editable} testid="design-toggle-envelope" onChange={(c) => toggle("envelopeEnabled", c)} />
          <ToggleRow label={tt(lang, "شريط الأدوات العائم (مشاركة / تقويم)", "סרגל צף (שיתוף / יומן)")} checked={tog("footerDockEnabled")} disabled={!editable} testid="design-toggle-footer" onChange={(c) => toggle("footerDockEnabled", c)} />
        </Section>

        {/* Theme */}
        <Section title={tt(lang, "لون التصميم", "צבע העיצוב")}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(110px, 1fr))", gap: 10 }}>
            {DIGITAL_THEME_KEYS.map((k) => {
              const t = DIGITAL_THEMES[k];
              const active = themeColor === k;
              return (
                <button key={k} data-testid={`design-theme-${k}`} onClick={() => onPickTheme(k)} disabled={!editable}
                  style={{ padding: "12px 10px", borderRadius: 12, border: `2px solid ${active ? C.gold : "rgba(255,255,255,.08)"}`, background: active ? "rgba(201,168,76,.10)" : "rgba(255,255,255,.02)", cursor: editable ? "pointer" : "not-allowed", opacity: editable ? 1 : 0.55, fontFamily: "inherit", textAlign: "center" }}>
                  <div style={{ width: 36, height: 36, borderRadius: "50%", margin: "0 auto 6px", background: t.swatch, border: `2px solid ${t.bg}`, boxShadow: `0 0 0 1px ${t.accentLine}` }} />
                  <div style={{ fontSize: 11, fontWeight: 800, color: active ? C.gold : C.goldLight }}>{tt(lang, t.label_ar, t.label_he)}</div>
                </button>
              );
            })}
          </div>
        </Section>

        {/* Font */}
        <Section title={tt(lang, "نوع الخط", "סוג גופן")}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))", gap: 10 }}>
            {DIGITAL_FONT_KEYS.map((k) => {
              const fnt = DIGITAL_FONTS[k];
              const active = fontFamily === k;
              return (
                <button key={k} data-testid={`design-font-${k}`} onClick={() => onPickFont(k)} disabled={!editable}
                  style={{ padding: "14px 10px", borderRadius: 12, border: `2px solid ${active ? C.gold : "rgba(255,255,255,.08)"}`, background: active ? "rgba(201,168,76,.10)" : "rgba(255,255,255,.02)", cursor: editable ? "pointer" : "not-allowed", opacity: editable ? 1 : 0.55, fontFamily: fnt.family, textAlign: "center" }}>
                  <div style={{ fontSize: 28, fontWeight: 900, color: active ? C.gold : C.goldLight, lineHeight: 1.2 }}>{tt(lang, "كلمات", "מילים")}</div>
                  <div style={{ fontSize: 10, fontFamily: "inherit", color: C.dim, marginTop: 4 }}>{tt(lang, fnt.label_ar, fnt.label_he)}</div>
                </button>
              );
            })}
          </div>
        </Section>

        {/* Submit */}
        {(status === "draft" || status === "rejected") && (
          <button data-testid="design-submit-btn" className="gold-btn" onClick={onSubmit} disabled={busy} style={{ width: "100%", padding: "14px 0", fontSize: 14, marginTop: 4 }}>
            {busy ? "..." : status === "rejected" ? tt(lang, "📨 إعادة الإرسال للاعتماد", "📨 שלח שוב לאישור") : tt(lang, "📨 إرسال للاعتماد", "📨 שלח לאישור")}
          </button>
        )}

        {/* Live preview */}
        <div style={{ marginTop: 12 }}>
          <div style={{ fontSize: 12, color: C.goldDim, marginBottom: 8, fontWeight: 800, letterSpacing: 2, textTransform: "uppercase" }}>
            {tt(lang, "معاينة مباشرة", "תצוגה מקדימה חיה")}
          </div>
          <div data-testid="design-preview" style={{ borderRadius: 16, overflow: "hidden", border: "1px solid rgba(201,168,76,.22)", maxHeight: 640, overflowY: "auto" }}>
            <DigitalInvitationView design={previewDesign} guestName={tt(editLang, "اسم الضيف", "שם האורח")} lang={editLang} mode="preview" />
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Generic array editor (story / details / hotels / wishes) ──────────────────
function ArrayEditor({ items, schema, onChange, onCommit, addLabel, removeLabel, max, disabled, testid, editLang }) {
  const update = (idx, key, val) => onChange(items.map((it, i) => (i === idx ? { ...it, [key]: val } : it)));
  const remove = (idx) => onCommit(items.filter((_, i) => i !== idx));
  const add = () => {
    const blank = {};
    schema.forEach((s) => { blank[s.key] = ""; });
    onChange([...items, blank]);
  };
  return (
    <div>
      {items.map((it, idx) => (
        <div key={idx} data-testid={`${testid}-row`} style={{ border: "1px solid rgba(255,255,255,.08)", borderRadius: 12, padding: 12, marginBottom: 10, background: "rgba(255,255,255,.02)" }}>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 8 }}>
            {schema.filter((s) => !s.textarea).map((s) => (
              <input
                key={s.key}
                className="input-field"
                type="text"
                value={s.localized ? leaf(it[s.key], editLang) : (it[s.key] || "")}
                disabled={disabled}
                maxLength={s.maxLength}
                placeholder={s.placeholder}
                onChange={(e) => update(idx, s.key, s.localized ? setLeaf(it[s.key], editLang, e.target.value) : e.target.value)}
                onBlur={() => onCommit(items)}
                style={s.width ? { width: s.width, textAlign: "center", flex: "0 0 auto" } : { flex: 1, minWidth: 120 }}
              />
            ))}
          </div>
          {schema.filter((s) => s.textarea).map((s) => (
            <textarea
              key={s.key}
              className="input-field"
              rows={2}
              value={s.localized ? leaf(it[s.key], editLang) : (it[s.key] || "")}
              disabled={disabled}
              maxLength={s.maxLength}
              placeholder={s.placeholder}
              onChange={(e) => update(idx, s.key, s.localized ? setLeaf(it[s.key], editLang, e.target.value) : e.target.value)}
              onBlur={() => onCommit(items)}
              style={{ resize: "vertical", minHeight: 44, marginBottom: 8 }}
            />
          ))}
          <button
            data-testid={`${testid}-remove`}
            onClick={() => remove(idx)}
            disabled={disabled}
            style={{ background: "rgba(212,80,58,.1)", border: "1px solid rgba(212,80,58,.3)", color: "#d4533a", borderRadius: 8, padding: "6px 12px", fontSize: 11, fontWeight: 700, cursor: disabled ? "not-allowed" : "pointer", fontFamily: "inherit" }}
          >
            {removeLabel}
          </button>
        </div>
      ))}
      {items.length < max && (
        <button
          data-testid={`${testid}-add`}
          onClick={add}
          disabled={disabled}
          style={{ width: "100%", padding: "10px 0", borderRadius: 10, background: "rgba(201,168,76,.08)", border: "1px dashed rgba(201,168,76,.35)", color: C.gold, fontSize: 12, fontWeight: 800, cursor: disabled ? "not-allowed" : "pointer", fontFamily: "inherit" }}
        >
          {addLabel}
        </button>
      )}
    </div>
  );
}

function StatusBanner({ status, doc, lang, onCancel, busy, editUnlocked, onEditApproved }) {
  if (status === "pending_approval") {
    return (
      <div data-testid="design-status-banner" data-design-status="pending_approval" style={{ padding: "14px 16px", borderRadius: 12, marginBottom: 18, background: "rgba(75,159,212,.08)", border: "1px solid rgba(75,159,212,.32)", display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
        <div style={{ fontSize: 28 }}>⏳</div>
        <div style={{ flex: 1, minWidth: 200 }}>
          <div style={{ fontSize: 14, fontWeight: 900, color: C.blue, marginBottom: 4 }}>{tt(lang, "بانتظار موافقة الأدمن", "ממתין לאישור מנהל")}</div>
          <div style={{ fontSize: 11, color: C.dim }}>{tt(lang, "لا يمكن التعديل حتى نتلقى رد المراجعة.", "לא ניתן לערוך עד שהמנהל יחזיר תשובה.")}</div>
        </div>
        <button onClick={onCancel} disabled={busy} data-testid="design-cancel-btn" style={{ padding: "8px 14px", borderRadius: 10, background: "rgba(255,255,255,.04)", border: "1px solid rgba(255,255,255,.12)", color: C.goldLight, cursor: busy ? "not-allowed" : "pointer", fontSize: 12, fontWeight: 700, fontFamily: "inherit" }}>
          {tt(lang, "إلغاء وتحرير", "בטל וערוך")}
        </button>
      </div>
    );
  }
  if (status === "approved") {
    return (
      <div data-testid="design-status-banner" data-design-status="approved" style={{ padding: "14px 16px", borderRadius: 12, marginBottom: 18, background: editUnlocked ? "rgba(201,168,76,.08)" : "rgba(76,201,122,.08)", border: `1px solid ${editUnlocked ? "rgba(201,168,76,.4)" : "rgba(76,201,122,.35)"}`, display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
        <div style={{ fontSize: 28 }}>{editUnlocked ? "✎" : "✓"}</div>
        <div style={{ flex: 1, minWidth: 200 }}>
          {editUnlocked ? (
            <>
              <div style={{ fontSize: 14, fontWeight: 900, color: C.gold, marginBottom: 4 }}>{tt(lang, "وضع التعديل مفعّل", "מצב עריכה פעיל")}</div>
              <div style={{ fontSize: 11, color: C.dim }}>{tt(lang, "أي تغيير سيعيد التصميم لمسوّدة ويتطلب إعادة اعتماد. الدعوات المُرسلة سابقاً تبقى كما هي.", "כל שינוי יחזיר את העיצוב לטיוטה ויידרש אישור מחדש. הזמנות שכבר נשלחו לא ישתנו.")}</div>
            </>
          ) : (
            <>
              <div style={{ fontSize: 14, fontWeight: 900, color: "#4cc97a", marginBottom: 4 }}>{tt(lang, "تم اعتماد التصميم", "העיצוב אושר")}</div>
              <div style={{ fontSize: 11, color: C.dim }}>{tt(lang, "يمكنك إرسال الدعوات الآن. لتعديله اضغط «تعديل التصميم» — سيعود لمسوّدة ويتطلب اعتماداً جديداً.", "ניתן לשלוח הזמנות. לעריכה לחץ «ערוך עיצוב» — יחזור לטיוטה ויידרש אישור מחדש.")}</div>
            </>
          )}
        </div>
        {!editUnlocked && (
          <button onClick={onEditApproved} data-testid="design-edit-approved-btn" style={{ padding: "8px 14px", borderRadius: 10, background: "rgba(201,168,76,.12)", border: "1px solid rgba(201,168,76,.35)", color: C.gold, cursor: "pointer", fontSize: 12, fontWeight: 800, fontFamily: "inherit", whiteSpace: "nowrap" }}>
            ✎ {tt(lang, "تعديل التصميم", "ערוך עיצוב")}
          </button>
        )}
      </div>
    );
  }
  if (status === "rejected") {
    return (
      <div data-testid="design-status-banner" data-design-status="rejected" style={{ padding: "14px 16px", borderRadius: 12, marginBottom: 18, background: "rgba(212,80,58,.08)", border: "1px solid rgba(212,80,58,.35)" }}>
        <div style={{ display: "flex", gap: 12, alignItems: "center", marginBottom: 8 }}>
          <div style={{ fontSize: 28 }}>⚠</div>
          <div style={{ fontSize: 14, fontWeight: 900, color: "#d4533a" }}>{tt(lang, "تم رفض التصميم", "העיצוב נדחה")}</div>
        </div>
        {doc?.designRejectionNote && (
          <div data-testid="design-rejection-note" style={{ fontSize: 13, color: C.goldLight, padding: "10px 12px", borderRadius: 8, background: "rgba(0,0,0,.25)", whiteSpace: "pre-wrap", lineHeight: 1.7 }}>
            {doc.designRejectionNote}
          </div>
        )}
      </div>
    );
  }
  return (
    <div data-testid="design-status-banner" data-design-status="draft" style={{ padding: "14px 16px", borderRadius: 12, marginBottom: 18, background: "rgba(201,168,76,.06)", border: "1px solid rgba(201,168,76,.22)", display: "flex", gap: 12, alignItems: "center" }}>
      <div style={{ fontSize: 28 }}>✎</div>
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: 14, fontWeight: 900, color: C.gold, marginBottom: 4 }}>{tt(lang, "مسوّدة", "טיוטה")}</div>
        <div style={{ fontSize: 11, color: C.dim }}>{tt(lang, "أكمل التعديلات ثم اضغط إرسال للاعتماد.", "השלם את העריכה ולחץ שלח לאישור.")}</div>
      </div>
    </div>
  );
}

function Section({ title, children, toggle }) {
  const dimmed = toggle && !toggle.enabled;
  return (
    <div className="gold-card" style={{ padding: 18, opacity: dimmed ? 0.6 : 1 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12, gap: 10 }}>
        <div style={{ fontSize: 13, color: C.goldLight, fontWeight: 800, letterSpacing: 1 }}>{title}</div>
        {toggle && (
          <label data-testid={toggle.testid} style={{ display: "inline-flex", alignItems: "center", gap: 6, cursor: toggle.disabled ? "not-allowed" : "pointer", fontSize: 11, color: C.dim, fontWeight: 700 }}>
            <input type="checkbox" checked={toggle.enabled} disabled={toggle.disabled} onChange={(e) => toggle.onChange(e.target.checked)} style={{ width: 16, height: 16, accentColor: C.gold, cursor: toggle.disabled ? "not-allowed" : "pointer" }} />
            {toggle.enabled ? "ON" : "OFF"}
          </label>
        )}
      </div>
      {children}
    </div>
  );
}

function ToggleRow({ label, checked, disabled, onChange, testid }) {
  return (
    <label data-testid={testid} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 12px", borderRadius: 10, marginBottom: 8, background: "rgba(255,255,255,.02)", border: "1px solid rgba(255,255,255,.06)", cursor: disabled ? "not-allowed" : "pointer" }}>
      <span style={{ fontSize: 13, color: C.goldLight, fontWeight: 700 }}>{label}</span>
      <input type="checkbox" checked={checked} disabled={disabled} onChange={(e) => onChange(e.target.checked)} style={{ width: 18, height: 18, accentColor: C.gold, cursor: disabled ? "not-allowed" : "pointer" }} />
    </label>
  );
}

function FormField({ label, children }) {
  return (
    <div style={{ marginBottom: 12 }}>
      <div style={{ fontSize: 12, color: C.goldDim, marginBottom: 5 }}>{label}</div>
      {children}
    </div>
  );
}

function epochToInput(epoch) {
  if (!epoch || !Number.isFinite(epoch)) return "";
  const d = new Date(epoch);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function inputToEpoch(value) {
  if (!value) return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return d.getTime();
}
