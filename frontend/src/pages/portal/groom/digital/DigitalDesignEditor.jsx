// Self-serve digital invitation design editor. The groom edits every aspect of
// the luxury invitation — text, dates, photos, story timeline, details, venue,
// guestbook, RSVP options — sees a live preview, then submits for admin
// approval. Section toggles let the groom hide any part of the design.
import { lazy, Suspense, createContext, useContext, useEffect, useMemo, useRef, useState } from "react";
import { usePortal } from "../../../../context/PortalContext.jsx";
import { localizeApiError } from "../../../../utils/apiError.js";
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
  subscribeDigitalWishes,
  setWishStatus,
  deleteWish,
} from "../../../../services/digitalInvitation.js";
import { logErr } from "../../../../utils/logger.js";
import { ensureDigitalFonts } from "../../../../utils/digitalFonts.js";
import { C } from "../../../../styles/theme.js";
import { DIGITAL_THEMES, DIGITAL_FONTS, DIGITAL_THEME_KEYS, DIGITAL_FONT_KEYS, getDigitalTheme, getDigitalFont } from "../../../../styles/digitalThemes.js";
import { resolveEnvelopePalette } from "../../../../utils/themeToEnvelopePalette.js";
import { resolveBackground } from "../../../../utils/themeToBackground.js";
import { TemplateRenderer } from "../../../../components/digital/templates/TemplateRenderer.jsx";
import { useTemplateAssets } from "../../../../hooks/useTemplateAssets.js";
import { demoPreviewUrl } from "../../../../utils/templateDemo.js";
import { Ambience } from "../../../../components/digital/sections/InviteAmbience.jsx";
import { ViewStyles } from "../../../../components/digital/sections/InviteStyles.jsx";

// Lazy WebGL host for the dedicated sealed-envelope preview (pulls `three` only
// when the design editor's envelope section mounts).
const CelestialCanvas = lazy(() => import("../../../../components/digital/celestial/CelestialCanvas.jsx"));

import {
  TEMPLATES,
  DIGITAL_TEMPLATE_KEYS,
  DEFAULT_TEMPLATE_ID,
  ENVELOPE_STYLES,
  getTemplateThemeKeys,
} from "@dawa/core/data/digitalTemplates.js";
import {
  DEFAULT_EYEBROW,
  DEFAULT_BLESSING,
  DEFAULT_WELCOME,
  DEFAULT_MEAL_OPTIONS,
  SAMPLE_STORY,
  SAMPLE_DETAILS,
  SAMPLE_HOTELS,
  SAMPLE_WISHES,
} from "../../../../data/digitalInviteDefaults.js";
import { hasContent } from "../../../../utils/localize.js";
import {
  SCALAR_KEYS,
  ARRAY_KEYS,
  TOGGLE_KEYS,
  DESIGN_STATUS_META,
} from "@dawa/core/data/digitalDesignSchema.js";
import {
  WIZARD_STEP_IDS,
  WIZARD_STEPS,
  stepTitle,
  stepSubtitle,
} from "@dawa/core/data/digitalDesignSteps.js";
import { ProgressBar } from "../../../../components/ProgressBar.jsx";
import { OnboardingChecklist } from "../../../../components/OnboardingChecklist.jsx";

const tt = (lang, ar, he) => (lang === "he" ? he : ar);

// Which content steps show the shared "content" chrome (edit-language toggle +
// fill-sample). Style/advanced/review don't edit localized text, so they hide it.
const CONTENT_STEP_IDS = ["essentials", "venue", "story", "rsvp"];

// The active wizard step + view, shared with every <Section> so a section can
// hide itself when the wizard isn't on its step (view "full" shows them all).
const WizardCtx = createContext({ view: "full", activeStep: null });

// Renders its children only when the wizard is on this step — or always, when the
// groom has switched to the full-editor ("all sections at once") escape hatch.
// Because the buffered field state lives in the parent, unmounting a step's
// sections never loses edits, and autosave already fired on blur.
function StepGroup({ id, activeStep, view, children }) {
  if (view === "full") return children;
  return id === activeStep ? children : null;
}

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

// SCALAR_KEYS / ARRAY_KEYS / TOGGLE_KEYS / DESIGN_STATUS_META are imported from
// the shared schema (@dawa/core/data/digitalDesignSchema.js) so the web + native
// editors can't drift. Every scalar/array field the groom edits lives in one
// buffered object so the preview is a simple merge and autosave targets a single
// key at a time.

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
        : localizeApiError(err, lang, tt(lang, "فشل الإنشاء", "היצירה נכשלה")));
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
        : localizeApiError(err, lang, tt(lang, "فشل الحذف", "המחיקה נכשלה")));
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
export function DesignEditorBody({ groomUid, designId, adminDemoMode = false, onPublish, publishing = false }) {
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
  const [bgBusy, setBgBusy] = useState(false);
  const [bgProgress, setBgProgress] = useState(0);
  // An APPROVED design is read-only until the groom presses "تعديل التصميم".
  // Reset per design so a fresh/approved design always starts locked.
  const [editUnlocked, setEditUnlocked] = useState(false);
  // Guided wizard: "wizard" shows one step-card at a time (default for grooms);
  // "full" is the escape hatch that shows every section at once (today's layout,
  // and the default in admin demo mode). Persisted so a groom's choice sticks.
  const [view, setView] = useState(() => {
    if (adminDemoMode) return "full";
    try { return localStorage.getItem("dawa_design_view") === "full" ? "full" : "wizard"; } catch { return "wizard"; }
  });
  const [stepIdx, setStepIdx] = useState(0);
  const activeStep = WIZARD_STEP_IDS[stepIdx] || "essentials";
  const setDesignView = (next) => {
    setView(next);
    try { localStorage.setItem("dawa_design_view", next); } catch { /* ignore */ }
  };
  const gotoStep = (idx) => {
    const clamped = Math.max(0, Math.min(WIZARD_STEP_IDS.length - 1, idx));
    setStepIdx(clamped);
    try { window.scrollTo({ top: 0, behavior: "smooth" }); } catch { /* ignore */ }
  };
  const fileInputRef = useRef(null);
  const heroFileInputRef = useRef(null);
  const bgFileInputRef = useRef(null);

  // Buffered field values (scalars + arrays + toggles + mediaCaptions + the
  // wedding-date input string). Autosave fires on blur/change, not per keystroke.
  const [f, setF] = useState({});
  const dirty = useRef(new Set());

  // Load the extended Arabic+Hebrew wedding fonts so the font-picker previews
  // (and the live preview) render in the real faces.
  useEffect(() => { ensureDigitalFonts(); }, []);

  // Guestbook wishes submitted by guests — the groom moderates them here.
  const [wishes, setWishes] = useState([]);
  useEffect(() => {
    if (!currentUid) return undefined;
    return subscribeDigitalWishes(currentUid, (list) => setWishes(Array.isArray(list) ? list : []));
  }, [currentUid]);
  const approveWish = async (id) => {
    setWishes((p) => p.map((w) => (w.id === id ? { ...w, status: "approved" } : w)));
    try { await setWishStatus(currentUid, id, "approved"); } catch { showToast(tt(lang, "فشل الحفظ", "השמירה נכשלה")); }
  };
  const unpublishWish = async (id) => {
    setWishes((p) => p.map((w) => (w.id === id ? { ...w, status: "pending" } : w)));
    try { await setWishStatus(currentUid, id, "pending"); } catch { showToast(tt(lang, "فشل الحفظ", "השמירה נכשלה")); }
  };
  const rejectWish = async (id) => {
    setWishes((p) => p.filter((w) => w.id !== id));
    try { await deleteWish(currentUid, id); } catch { showToast(tt(lang, "فشل الحذف", "המחיקה נכשלה")); }
  };

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
        apply("envelope", next.envelope && typeof next.envelope === "object" ? next.envelope : {});
        apply("background", next.background && typeof next.background === "object" ? next.background : {});
        apply("starfield", next.starfield && typeof next.starfield === "object" ? next.starfield : {});
        apply("themeColor", next.themeColor || "gold");
        apply("fontFamily", next.fontFamily || "amiri");
        apply("templateId", next.templateId || DEFAULT_TEMPLATE_ID);
        return merged;
      });
    });
  }, [currentUid, designId]);

  const status = doc?.designStatus || "draft";
  // Read from the buffered `f` first so theme/font picks update the preview
  // instantly (optimistic), before the background save round-trips.
  const themeColor = f.themeColor || doc?.themeColor || "gold";
  const fontFamily = f.fontFamily || doc?.fontFamily || "amiri";
  const templateId = f.templateId || doc?.templateId || DEFAULT_TEMPLATE_ID;
  // Picker covers: the admin-uploaded art when present, else the bundled asset.
  const { resolveThumb } = useTemplateAssets();
  // A BESPOKE template owns its whole visual (its own opening intro + ambient
  // effects), so the classic-only controls — the 3D envelope, the background
  // starfield, and the custom 2D background — are hidden for it (they configure
  // subsystems a bespoke tree never mounts, so leaving them visible would be
  // dead controls). Its theme picker is also narrowed to the template's curated
  // palette list. `classic` has neither flag → everything shows as before.
  const isBespokeTpl = !!TEMPLATES[templateId]?.bespoke;
  // Curated palette keys for the active template, or the full global list when
  // the template opts out (classic). If the design's current themeColor somehow
  // isn't in the curated list (legacy state, or set before curation), append it
  // so the active chip stays visible and selectable.
  const themeKeysForPicker = useMemo(() => {
    const curated = getTemplateThemeKeys(templateId);
    if (!curated) return DIGITAL_THEME_KEYS;
    return curated.includes(themeColor) ? curated : [...curated, themeColor];
  }, [templateId, themeColor]);
  // 3D-envelope overrides (one buffered nested object, like mediaCaptions) and the
  // theme-derived defaults shown in the swatches when an override is unset.
  const envOverrides = f.envelope && typeof f.envelope === "object" ? f.envelope : {};
  const envDefaults = useMemo(() => resolveEnvelopePalette(getDigitalTheme(themeColor)), [themeColor]);
  // Custom-background overrides + the theme-derived defaults shown when unset.
  const bgOverrides = f.background && typeof f.background === "object" ? f.background : {};
  const bgDefaults = useMemo(() => resolveBackground(getDigitalTheme(themeColor), {}), [themeColor]);
  const media = Array.isArray(doc?.media) ? doc.media : [];
  const heroMedia = Array.isArray(doc?.heroMedia) ? doc.heroMedia : [];

  // Draft & rejected are directly editable; pending is read-only (awaiting admin).
  // Approved is LOCKED until the groom deliberately presses "تعديل التصميم"
  // (editUnlocked) — then the first field edit demotes it to draft (server-side).
  // Demo mode (admin): always editable — the demo design is a perpetual draft;
  // it goes live only via the explicit "Publish to demo" button, never approval.
  const editable = adminDemoMode || status === "draft" || status === "rejected" || (status === "approved" && editUnlocked);

  // The live design that drives the preview: saved doc + buffered overrides.
  const previewDesign = useMemo(
    () => ({
      ...doc,
      ...f,
      weddingDate: inputToEpoch(f.weddingDate),
      themeColor,
      fontFamily,
      templateId,
      media,
      heroMedia,
    }),
    [doc, f, themeColor, fontFamily, templateId, media, heroMedia],
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
      showToast(localizeApiError(err, lang, tt(lang, "فشل الحفظ", "השמירה נכשלה")));
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
      if (key === "envelope") return { ...prev, envelope: cur.envelope || {} };
      if (key === "background") return { ...prev, background: cur.background || {} };
      if (key === "starfield") return { ...prev, starfield: cur.starfield || {} };
      if (key === "themeColor") return { ...prev, themeColor: cur.themeColor || "gold" };
      if (key === "fontFamily") return { ...prev, fontFamily: cur.fontFamily || "amiri" };
      if (key === "templateId") return { ...prev, templateId: cur.templateId || DEFAULT_TEMPLATE_ID };
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

  // Switching template resets PRESENTATION defaults (theme/font/envelope style/
  // envelope on-off) to the new template's recommended pairing — it never
  // touches guest-facing content (names/date/venue/story/details/etc.), which
  // both templates keep rendering from the same design doc. A confirm dialog
  // is shown because even though content survives, the visual result changes
  // completely and the groom may have spent real effort tuning the old
  // template's theme/font/envelope colors.
  const onPickTemplate = (id) => {
    if (!editable || templateId === id) return;
    const tpl = TEMPLATES[id] || TEMPLATES[DEFAULT_TEMPLATE_ID];
    const label = tt(lang, tpl.label_ar, tpl.label_he);
    const confirmed = window.confirm(tt(
      lang,
      `سيؤدي التبديل إلى قالب "${label}" إلى إعادة ضبط اللون والخط وشكل المظروف على القيم الافتراضية لهذا القالب. نصوصكم وصوركم وإعدادات تأكيد الحضور ستبقى كما هي. متابعة؟`,
      `מעבר לתבנית "${label}" יאפס את הצבע, הגופן וסגנון המעטפה לברירת המחדל של התבנית. הטקסטים, התמונות והגדרות אישור ההגעה יישארו כפי שהם. להמשיך?`,
    ));
    if (!confirmed) return;
    const patch = {
      templateId: id,
      themeColor: tpl.defaults.themeColor,
      fontFamily: tpl.defaults.fontFamily,
      envelopeEnabled: tpl.defaults.envelopeEnabled,
      envelope: { ...envOverrides, style: tpl.defaults.envelopeStyle },
    };
    const keys = Object.keys(patch);
    keys.forEach((k) => dirty.current.add(k));
    setF((prev) => ({ ...prev, ...patch }));
    persist(patch).then((ok) => {
      if (ok) keys.forEach((k) => dirty.current.delete(k));
      else keys.forEach((k) => revert(k));
    });
  };

  // ── Envelope (3D) overrides ──────────────────────────────────────────────
  // The whole envelope config lives in one buffered nested object. A sub-key set
  // to null/"" is removed → that property falls back to the theme/baseline default.
  const nextEnv = (subKey, value) => {
    const n = { ...envOverrides };
    if (value == null || value === "") delete n[subKey];
    else n[subKey] = value;
    return n;
  };
  // Immediate persist (colours, preset chips, reset, stars toggle) — optimistic
  // like onPickTheme: update the buffer (preview re-renders) then save in the bg.
  const setEnvField = (subKey, value) => {
    if (!editable) return;
    const n = nextEnv(subKey, value);
    setField("envelope", n);
    flush("envelope", n);
  };
  const resetEnvField = (subKey) => setEnvField(subKey, null);
  // Sliders: buffer live while dragging (preview updates), persist once on commit
  // (pointer-up / keyboard) so we don't PATCH on every pixel.
  const bufferEnvField = (subKey, value) => {
    if (!editable) return;
    setField("envelope", nextEnv(subKey, value));
  };
  const commitEnvField = (subKey, value) => {
    if (!editable) return;
    const n = nextEnv(subKey, value);
    setField("envelope", n);
    flush("envelope", n);
  };

  // ── Background-starfield overrides (one buffered nested object, like `envelope`) —
  // colour / size / clarity of the celestial particle field. A subkey set to
  // null/"" is removed → falls back to the theme default.
  const starOverrides = f.starfield && typeof f.starfield === "object" ? f.starfield : {};
  const nextStar = (subKey, value) => {
    const n = { ...starOverrides };
    if (value == null || value === "") delete n[subKey];
    else n[subKey] = value;
    return n;
  };
  const setStarField = (subKey, value) => {
    if (!editable) return;
    const n = nextStar(subKey, value);
    setField("starfield", n);
    flush("starfield", n);
  };
  const bufferStarField = (subKey, value) => {
    if (!editable) return;
    setField("starfield", nextStar(subKey, value));
  };
  const commitStarField = (subKey, value) => {
    if (!editable) return;
    const n = nextStar(subKey, value);
    setField("starfield", n);
    flush("starfield", n);
  };

  // ── Custom background overrides ───────────────────────────────────────────
  // One buffered nested object (like `envelope`). All keys carry explicit values
  // (no key-deletion resets) so the server's set({merge:true}) deep-merge can't
  // resurrect a stale value, and the server-owned `image` (set by the upload
  // route) is preserved across patches (sanitizeBackground strips it from input).
  const nextBg = (subKey, value) => {
    const n = { ...bgOverrides };
    if (value == null || value === "") delete n[subKey];
    else n[subKey] = value;
    return n;
  };
  const setBgField = (subKey, value) => {
    if (!editable) return;
    const n = nextBg(subKey, value);
    setField("background", n);
    flush("background", n);
  };
  const bufferBgField = (subKey, value) => {
    if (!editable) return;
    setField("background", nextBg(subKey, value));
  };
  const commitBgField = (subKey, value) => {
    if (!editable) return;
    const n = nextBg(subKey, value);
    setField("background", n);
    flush("background", n);
  };

  // Background image lives at background.image and is owned by the upload/remove
  // routes (target=background). Mirror onUploadHero, but write the single image
  // object (not an array) into both the doc snapshot and the buffer so the
  // preview reflects it immediately.
  const onUploadBg = async (file) => {
    if (!file || !editable) return;
    setBgBusy(true);
    setBgProgress(0);
    try {
      const item = await addDesignMedia(currentUid, designId, file, { target: "background", onProgress: setBgProgress });
      if (item && item.storagePath) {
        const mergeImg = (obj) => ({ ...(obj || {}), background: { ...((obj || {}).background || {}), image: item } });
        setDoc((prev) => mergeImg(prev));
        setF((prev) => mergeImg(prev));
      }
      showToast(tt(lang, "✓ تم رفع الخلفية", "✓ הרקע הועלה"));
    } catch (err) {
      logErr("addDesignMedia.background", err);
      showToast(localizeApiError(err, lang, tt(lang, "فشل الرفع", "ההעלאה נכשלה")));
    } finally {
      setBgBusy(false);
      setBgProgress(0);
      if (bgFileInputRef.current) bgFileInputRef.current.value = "";
    }
  };
  const onRemoveBg = async () => {
    if (!editable) return;
    const img = bgOverrides.image;
    if (!img?.storagePath) return;
    if (!window.confirm(tt(lang, "حذف صورة الخلفية؟", "למחוק את תמונת הרקע?"))) return;
    try {
      await removeDesignMedia(currentUid, designId, img, { target: "background" });
      const clearImg = (obj) => ({ ...(obj || {}), background: { ...((obj || {}).background || {}), image: null } });
      setDoc((prev) => clearImg(prev));
      setF((prev) => clearImg(prev));
      showToast(tt(lang, "✓ تم الحذف", "✓ נמחק"));
    } catch (err) {
      logErr("removeDesignMedia.background", err);
      showToast(localizeApiError(err, lang, tt(lang, "فشل الحذف", "המחיקה נכשלה")));
    }
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
      showToast(localizeApiError(err, lang, tt(lang, "فشل الرفع", "ההעלאה נכשלה")));
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
      showToast(localizeApiError(err, lang, tt(lang, "فشل الحذف", "המחיקה נכשלה")));
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
      showToast(localizeApiError(err, lang, tt(lang, "فشل الرفع", "ההעלאה נכשלה")));
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
      showToast(localizeApiError(err, lang, tt(lang, "فشل الحذف", "המחיקה נכשלה")));
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
      showToast(localizeApiError(err, lang, tt(lang, "فشل الإرسال", "השליחה נכשלה")));
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
      showToast(localizeApiError(err, lang, tt(lang, "فشل الإلغاء", "הביטول נכשל")));
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

  // Wizard chrome visibility: the edit-language toggle + fill-sample belong to the
  // content steps only (essentials/venue/story/rsvp); the full editor shows them.
  const wizard = view === "wizard" && !adminDemoMode;
  const showContentChrome = !wizard || CONTENT_STEP_IDS.includes(activeStep);
  // Completeness signals surfaced on the Review step.
  const doneNames = hasContent(f.brideName) && hasContent(f.groomDisplayName);
  const doneDate = !!inputToEpoch(f.weddingDate);
  const donePhoto = heroMedia.length > 0 || media.length > 0;

  return (
    <div style={{ animation: "fadeUp .3s ease" }}>
      {/* ── Title ──────────────────────────────────────────────────────────── */}
      <div style={{ marginBottom: 14 }}>
        <div style={{ fontSize: 19, fontWeight: 900, color: C.gold, fontFamily: "'Amiri','Frank Ruhl Libre',serif", marginBottom: 4 }}>
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

      {!adminDemoMode && (
        <StatusBanner status={status} doc={doc} lang={lang} onCancel={onCancelSubmission} busy={busy}
          editUnlocked={editUnlocked} onEditApproved={onEditApproved} />
      )}

      {/* Guestbook wish moderation — guest "شاركونا" messages; approve to publish to all. */}
      {wishes.length > 0 && (() => {
        const pending  = wishes.filter((w) => (w.status || "pending") === "pending");
        const approved = wishes.filter((w) => w.status === "approved");
        return (
          <div className="gold-card" style={{ marginBottom: 16 }}>
            <div style={{ fontSize: 13, fontWeight: 800, color: C.gold, marginBottom: 4 }}>
              💌 {tt(lang, "تهاني المدعوين", "ברכות המוזמנים")}
              {pending.length > 0 && (
                <span style={{ marginInlineStart: 8, fontSize: 11, color: C.red }}>
                  {tt(lang, "بانتظار موافقتك", "ממתינות לאישורך")} ({pending.length})
                </span>
              )}
            </div>
            <div style={{ fontSize: 10, color: C.dim, marginBottom: 10, lineHeight: 1.6 }}>
              {tt(lang, "وافِق لتظهر للجميع داخل الدعوة · يمكنك إلغاء النشر لاحقاً إذا غيّرت رأيك", "אשר כדי שתוצג לכולם בהזמנה · אפשר לבטל פרסום בהמשך")}
            </div>
            {pending.map((w) => (
              <div key={w.id} style={{ padding: "10px 12px", borderRadius: 10, marginBottom: 8, background: "rgba(255,255,255,.03)", border: "1px solid rgba(201,168,76,.18)" }}>
                <div style={{ fontSize: 12, fontWeight: 800, color: C.goldLight }}>{w.who}</div>
                <div style={{ fontSize: 12, color: C.dim, lineHeight: 1.7, marginBottom: 8, whiteSpace: "pre-wrap" }}>{w.what}</div>
                <div style={{ display: "flex", gap: 8 }}>
                  <button onClick={() => approveWish(w.id)} style={{ flex: 1, padding: 8, borderRadius: 8, border: "none", background: "linear-gradient(135deg,#4cc97a,#2da85a)", color: "#000", fontWeight: 800, fontSize: 12, cursor: "pointer", fontFamily: "inherit" }}>✓ {tt(lang, "موافقة ونشر", "אשר ופרסם")}</button>
                  <button onClick={() => rejectWish(w.id)} style={{ padding: "8px 14px", borderRadius: 8, background: "rgba(212,80,58,.1)", border: "1px solid rgba(212,80,58,.35)", color: C.red, fontWeight: 800, fontSize: 12, cursor: "pointer", fontFamily: "inherit" }}>✕ {tt(lang, "رفض", "דחה")}</button>
                </div>
              </div>
            ))}
            {approved.length > 0 && (
              <>
                <div style={{ fontSize: 11, color: "#4cc97a", fontWeight: 700, margin: "12px 0 8px" }}>✓ {tt(lang, "منشورة للجميع", "מפורסמות לכולם")} ({approved.length})</div>
                {approved.map((w) => (
                  <div key={w.id} style={{ padding: "8px 12px", borderRadius: 10, marginBottom: 6, background: "rgba(76,201,122,.05)", border: "1px solid rgba(76,201,122,.25)", display: "flex", alignItems: "center", gap: 8 }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 12, fontWeight: 800, color: C.goldLight }}>{w.who}</div>
                      <div style={{ fontSize: 11, color: C.dim, lineHeight: 1.6, whiteSpace: "pre-wrap" }}>{w.what}</div>
                    </div>
                    <button onClick={() => unpublishWish(w.id)} style={{ padding: "6px 10px", borderRadius: 8, background: "rgba(255,255,255,.04)", border: "1px solid rgba(255,255,255,.12)", color: C.goldDim, fontWeight: 700, fontSize: 11, cursor: "pointer", fontFamily: "inherit", whiteSpace: "nowrap" }}>{tt(lang, "إلغاء النشر", "בטל פרסום")}</button>
                  </div>
                ))}
              </>
            )}
          </div>
        );
      })()}

      {showContentChrome && (
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
      )}

      {/* Bilingual content tab — each text field below is saved per language, and
          the guest can toggle between them on the invitation. Fill both. */}
      {showContentChrome && (
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
      )}

      {/* ── Guided-wizard chrome: progress + step title + full-editor escape ──── */}
      {!adminDemoMode && (
        <div style={{ marginBottom: 16 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
            <div style={{ fontSize: 12, color: C.goldDim, fontWeight: 800 }}>
              {wizard
                ? tt(lang, `الخطوة ${stepIdx + 1} من ${WIZARD_STEP_IDS.length}`, `שלב ${stepIdx + 1} מתוך ${WIZARD_STEP_IDS.length}`)
                : tt(lang, "المحرر الكامل — كل الأقسام", "עורך מלא — כל החלקים")}
            </div>
            <button
              type="button"
              data-testid="design-view-toggle"
              onClick={() => setDesignView(wizard ? "full" : "wizard")}
              style={{ ...pillBtn(true), fontSize: 11 }}
            >
              {wizard ? tt(lang, "🎛 المحرر الكامل", "🎛 עורך מלא") : tt(lang, "✨ الوضع الموجّه", "✨ מצב מודרך")}
            </button>
          </div>
          {wizard && (
            <div style={{ marginTop: 10 }}>
              <ProgressBar value={stepIdx + 1} total={WIZARD_STEP_IDS.length} color={C.gold} />
              <div style={{ marginTop: 6 }}>
                <div style={{ fontSize: 18, fontWeight: 900, color: C.gold, fontFamily: "'Amiri','Frank Ruhl Libre',serif" }}>
                  {WIZARD_STEPS[stepIdx]?.icon} {stepTitle(activeStep, lang)}
                </div>
                <div style={{ fontSize: 12, color: C.dim, marginTop: 2 }}>{stepSubtitle(activeStep, lang)}</div>
              </div>
            </div>
          )}
        </div>
      )}

      <WizardCtx.Provider value={{ view, activeStep }}>
      <div style={{ display: "grid", gridTemplateColumns: "minmax(280px, 1fr)", gap: 16 }}>
        {/* Names */}
        <Section step="essentials" title={tt(lang, "أسماء العروسين", "שמות הזוג")}>
          <FormField label={tt(lang, "اسم العريس *", "שם החתן *")}>
            <input data-testid="design-groom-name" type="text" {...textProps("groomDisplayName", 120)} placeholder={tt(editLang, "مثال: أحمد", "למשל: אחמד")} />
          </FormField>
          <FormField label={tt(lang, "اسم العروس *", "שם הכלה *")}>
            <input data-testid="design-bride-name" type="text" {...textProps("brideName", 120)} placeholder={tt(editLang, "مثال: سارة", "למשל: שרה")} />
          </FormField>
          <FormField label={tt(lang, "الحرفان في الشعار (مثل: ك&ل) — اتركه فارغاً للاشتقاق التلقائي", "מונוגרמה (למשל: כ&ל) — ריק = אוטומטי")}>
            <input data-testid="design-monogram" type="text" {...textProps("monogram", 12)} />
          </FormField>
          <FormField label={tt(lang, "نص علوي صغير في البداية", "כיתוב עליון קצר")}>
            <input data-testid="design-eyebrow" type="text" placeholder={DEFAULT_EYEBROW[editLang]} {...textProps("eyebrow", 60)} />
          </FormField>
          <FormField label={tt(lang, "بركة فوق الأسماء (على الظرف)", "ברכה מעל השמות (על המעטפה)")}>
            <input data-testid="design-blessing" type="text" placeholder={DEFAULT_BLESSING[editLang]} {...textProps("blessing", 80)} />
          </FormField>
          <FormField label={tt(lang, "جملة ترحيب تحت الأسماء (على الظرف)", "משפט ברכה מתחת לשמות (על המעטפה)")}>
            <input data-testid="design-welcome" type="text" placeholder={DEFAULT_WELCOME[editLang]} {...textProps("welcome", 120)} />
          </FormField>
        </Section>

        {/* WhatsApp share-link description (og:description) — NOT shown on the
            invitation page itself, only in the WhatsApp link preview. */}
        <Section step="rsvp" title={tt(lang, "وصف الرابط على واتساب", "תיאור הקישור בוואטסאפ")}>
          <div style={{ fontSize: 11, color: C.dim, marginBottom: 12, lineHeight: 1.6 }}>
            {tt(
              lang,
              "الجملة التي تظهر تحت العنوان عند إرسال رابط الدعوة على واتساب. اتركها فارغة لاستخدام النص التلقائي (أسماء العروسين). تاريخ الزفاف يُضاف تلقائياً في النهاية.",
              "המשפט שמופיע מתחת לכותרת כששולחים את קישור ההזמנה בוואטסאפ. השאירו ריק לטקסט אוטומטי (שמות הזוג). תאריך החתונה יתווסף אוטומטית בסוף.",
            )}
          </div>
          <FormField label={tt(lang, "نص الوصف", "טקסט התיאור")}>
            <textarea
              data-testid="design-share-message"
              rows={2}
              {...textProps("shareMessage", 300)}
              placeholder={tt(lang, "يتشرّفون بدعوتكم لحضور حفل زفافهم", "מתכבדים להזמינכם לחתונתם")}
              style={{ resize: "vertical", minHeight: 50 }}
            />
          </FormField>
        </Section>

        {/* Featured media under the greeting */}
        <Section
          step="essentials"
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

        {/* Wedding date + time */}
        <Section step="essentials" title={tt(lang, "تاريخ الزفاف ووقته", "תאריך ושעת החתונה")}>
          <FormField label={tt(lang, "اختر اليوم والساعة", "בחר יום ושעה")}>
            <input
              data-testid="design-wedding-date"
              className="input-field"
              type="datetime-local"
              value={v("weddingDate")}
              disabled={!editable}
              onChange={(e) => setField("weddingDate", e.target.value)}
              onBlur={() => flush("weddingDate", inputToEpoch(f.weddingDate))}
              style={{ direction: "ltr" }}
            />
          </FormField>
          <div style={{ fontSize: 11, color: C.dim, marginTop: 8, lineHeight: 1.6 }}>
            {tt(
              lang,
              "الساعة تظهر جنب التاريخ في الدعوة، والعدّ التنازلي يحسب حتى الساعة المحدّدة.",
              "השעה מוצגת ליד התאריך בהזמנה, והספירה לאחור מחשבת עד השעה שנבחרה.",
            )}
          </div>
        </Section>

        {/* Story timeline */}
        <Section
          step="story"
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
          step="story"
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
          step="venue"
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
          step="venue"
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
          step="venue"
          title={tt(lang, "العد التنازلي", "ספירה לאחור")}
          toggle={{ enabled: tog("countdownEnabled"), onChange: (c) => toggle("countdownEnabled", c), disabled: !editable, testid: "design-toggle-countdown" }}
        >
          <div style={{ fontSize: 11, color: C.dim, lineHeight: 1.6 }}>
            {tt(lang, "يعتمد على تاريخ الزفاف بالأعلى.", "מבוסס על תאריך החתונה שלמעלה.")}
          </div>
        </Section>

        {/* RSVP options */}
        <Section step="rsvp" title={tt(lang, "خيارات تأكيد الحضور", "אפשרויות אישור הגעה")}>
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
          step="rsvp"
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
          step="rsvp"
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
        <Section step="venue" title={tt(lang, "كود اللباس", "קוד לבוש")}>
          <FormField label={tt(lang, "وصف اللباس (يظهر ضمن التفاصيل)", "תיאור הלבוש")}>
            <input data-testid="design-dress-code" type="text" {...textProps("dressCode", 120)} />
          </FormField>
        </Section>

        {/* Music */}
        <Section
          step="rsvp"
          title={tt(lang, "موسيقى الخلفية", "מוזיקת רקע")}
          toggle={{ enabled: tog("musicEnabled"), onChange: (c) => toggle("musicEnabled", c), disabled: !editable, testid: "design-toggle-music" }}
        >
          <FormField label={tt(lang, "رابط ملف صوتي (mp3)", "קישור לקובץ אודיו (mp3)")}>
            <input data-testid="design-music-url" type="text" {...latinProps("musicUrl", 600)} placeholder="https://…/song.mp3" style={{ direction: "ltr" }} />
          </FormField>
        </Section>

        {/* Other section toggles */}
        <Section step="advanced" title={tt(lang, "إظهار / إخفاء الأقسام", "הצג / הסתר חלקים")}>
          <div style={{ fontSize: 11, color: C.dim, marginBottom: 12, lineHeight: 1.6 }}>
            {tt(lang, "كل الأقسام تظهر افتراضياً. أزل العلامة لإخفاء قسم.", "כל החלקים מוצגים כברירת מחדל. הסר סימון כדי להסתיר.")}
          </div>
          {/* Envelope + immersive-3D world are classic-only (a bespoke template
              brings its own opening intro + ambience), so they're hidden when a
              bespoke template is active. The floating dock stays — every
              template respects footerDockEnabled. */}
          {!isBespokeTpl && (
            <>
              <ToggleRow label={tt(lang, "غلاف الفتح (المظروف)", "מעטפת פתיחה")} checked={tog("envelopeEnabled")} disabled={!editable} testid="design-toggle-envelope" onChange={(c) => toggle("envelopeEnabled", c)} />
              <ToggleRow label={tt(lang, "عالم ثلاثي الأبعاد غامر (خلفية متحركة)", "עולם תלת-ממדי סוחף (רקע מונפש)")} checked={tog("immersive3d")} disabled={!editable} testid="design-toggle-immersive3d" onChange={(c) => toggle("immersive3d", c)} />
            </>
          )}
          <ToggleRow label={tt(lang, "شريط الأدوات العائم (مشاركة / تقويم)", "סרגל צף (שיתוף / יומן)")} checked={tog("footerDockEnabled")} disabled={!editable} testid="design-toggle-footer" onChange={(c) => toggle("footerDockEnabled", c)} />
        </Section>

        {/* The 3D envelope, background starfield, and custom 2D background all
            configure the classic CelestialAmbience subsystem — a bespoke
            template never mounts it, so these three sections are hidden when a
            bespoke template is active (they'd be dead controls otherwise). */}
        {!isBespokeTpl && (
        <>
        {/* Envelope (3D) customization */}
        <Section step="advanced" title={tt(lang, "المظروف ثلاثي الأبعاد", "מעטפה תלת-ממדית")}>
          <div style={{ fontSize: 11, color: C.dim, marginBottom: 12, lineHeight: 1.6 }}>
            {tt(lang, "خصّص ألوان المظروف والنجوم. اترك أي لون فارغاً لاستخدام لون القالب.", "התאם את צבעי המעטפה והכוכבים. השאר צבע ריק כדי להשתמש בצבע הערכה.")}
          </div>

          {/* Opening-envelope STYLE picker. One style today ("المكتوب العادي"); the
              placeholder card hints that more are coming. The choice persists as
              envelope.style so future styles slot in with no other rewiring. */}
          <div style={{ marginBottom: 16 }}>
            <div style={{ marginBottom: 8, fontSize: 12, color: C.goldDim, fontWeight: 700 }}>
              {tt(lang, "شكل فتح المكتوب", "סגנון פתיחת המעטפה")}
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(120px, 1fr))", gap: 10 }}>
              {ENVELOPE_STYLES.map((s) => {
                const active = (envOverrides.style || "classic") === s.key;
                return (
                  <button key={s.key} data-testid={`design-env-style-${s.key}`} onClick={() => setEnvField("style", s.key)} disabled={!editable}
                    style={{ padding: "14px 10px", borderRadius: 12, border: `2px solid ${active ? C.gold : "rgba(255,255,255,.08)"}`, background: active ? "rgba(201,168,76,.10)" : "rgba(255,255,255,.02)", cursor: editable ? "pointer" : "not-allowed", opacity: editable ? 1 : 0.55, fontFamily: "inherit", textAlign: "center" }}>
                    <div style={{ fontSize: 26, marginBottom: 6 }} aria-hidden>{s.icon}</div>
                    <div style={{ fontSize: 12, fontWeight: 800, color: active ? C.gold : C.goldLight }}>{tt(lang, s.label_ar, s.label_he)}</div>
                  </button>
                );
              })}
              <div aria-hidden style={{ padding: "14px 10px", borderRadius: 12, border: "2px dashed rgba(255,255,255,.10)", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", textAlign: "center", opacity: 0.6 }}>
                <div style={{ fontSize: 22, marginBottom: 6 }}>✨</div>
                <div style={{ fontSize: 11, color: C.dim }}>{tt(lang, "أشكال أخرى قريباً", "סגנונות נוספים בקרוב")}</div>
              </div>
            </div>
          </div>

          <EnvColorRow testid="design-env-paper" label={tt(lang, "لون الورق", "צבע הנייר")} value={envOverrides.paper} defaultHex={envDefaults.paper} presets={["#2a211a", "#1a1f2e", "#f9f6f0", "#2a1a1a"]} disabled={!editable} onPick={(hex) => setEnvField("paper", hex)} onReset={() => resetEnvField("paper")} />
          <EnvColorRow testid="design-env-wax" label={tt(lang, "لون الختم (الدائرة)", "צבע החותם (העיגול)")} value={envOverrides.wax} defaultHex={envDefaults.wax} presets={["#f4ece0", "#b3232a", "#1f3b2e", "#caa14e"]} disabled={!editable} onPick={(hex) => setEnvField("wax", hex)} onReset={() => resetEnvField("wax")} />
          <EnvColorRow testid="design-env-foil" label={tt(lang, "لون النجوم والذهب", "צבע הכוכבים והזהב")} value={envOverrides.foil} defaultHex={envDefaults.foil} presets={["#caa14e", "#c0c0c0", "#e8b4b8", "#d4af37"]} disabled={!editable} onPick={(hex) => setEnvField("foil", hex)} onReset={() => resetEnvField("foil")} />
          <EnvColorRow testid="design-env-card" label={tt(lang, "لون البطاقة الداخلية", "צבע הכרטיס הפנימי")} value={envOverrides.cardPaper} defaultHex={envDefaults.cardPaper} presets={["#f9f6f0", "#f4ece0", "#f7f0e6", "#efe6d8"]} disabled={!editable} onPick={(hex) => setEnvField("cardPaper", hex)} onReset={() => resetEnvField("cardPaper")} />
          <EnvColorRow testid="design-env-ink" label={tt(lang, "لون الحبر", "צבע הדיו")} value={envOverrides.cardInk} defaultHex={envDefaults.cardInk} presets={["#3a2412", "#1a1a1a", "#2a1a3a", "#1f3b2e"]} disabled={!editable} onPick={(hex) => setEnvField("cardInk", hex)} onReset={() => resetEnvField("cardInk")} />

          <div style={{ marginTop: 12 }}>
            <ToggleRow label={tt(lang, "نجوم على كامل المظروف", "כוכבים על כל המעטפה")} checked={envOverrides.stars !== false} disabled={!editable} testid="design-env-stars" onChange={(c) => setEnvField("stars", c)} />
            <ToggleRow label={tt(lang, "نجمة على الختم", "כוכב על החותם")} checked={envOverrides.sealStar === true} disabled={!editable} testid="design-env-seal-star" onChange={(c) => setEnvField("sealStar", c)} />
          </div>
          <RangeRow testid="design-env-density" label={tt(lang, "كثافة النجوم", "צפיפות הכוכבים")} min={1} max={4} step={1} value={envOverrides.starDensity ?? 2} disabled={!editable || envOverrides.stars === false} onInput={(v) => bufferEnvField("starDensity", v)} onCommit={(v) => commitEnvField("starDensity", v)} />
          <RangeRow testid="design-env-intensity" label={tt(lang, "وضوح النجوم", "עוצמת הכוכבים")} min={0} max={1} step={0.05} value={envOverrides.starIntensity ?? 0.22} disabled={!editable || envOverrides.stars === false} onInput={(v) => bufferEnvField("starIntensity", v)} onCommit={(v) => commitEnvField("starIntensity", v)} />

          <EnvelopePreview
            themeColor={themeColor}
            overrides={envOverrides}
            lang={lang}
            content={{
              namesAr: [leaf(f.groomDisplayName, "ar"), leaf(f.brideName, "ar")].map((s) => s.trim()).filter(Boolean).join(" و "),
              namesHe: [leaf(f.groomDisplayName, "he"), leaf(f.brideName, "he")].map((s) => s.trim()).filter(Boolean).join(" ו"),
              blessing: leaf(f.blessing, editLang),
              welcome: leaf(f.welcome, editLang),
              eyebrow: leaf(f.eyebrow, editLang),
            }}
          />
        </Section>

        {/* Background starfield (celestial particles behind the 3D envelope) */}
        <Section step="advanced" title={tt(lang, "نجوم الخلفية (الفضاء ثلاثي الأبعاد)", "כוכבי הרקע (החלל התלת-ממדי)")}>
          <div style={{ fontSize: 11, color: C.dim, marginBottom: 12, lineHeight: 1.6 }}>
            {tt(lang,
              "تحكّم بالنجوم الصغيرة المتلألئة في خلفية المشهد ثلاثي الأبعاد حوالين المكتوب: لونها، حجمها، ووضوحها. اتركها كما هي لتتبع لون التصميم.",
              "שליטה בכוכבים הקטנים המנצנצים ברקע התלת-ממדי סביב המעטפה: הצבע, הגודל והבהירות. השאר כברירת מחדל כדי לעקוב אחר צבע העיצוב.")}
          </div>
          <EnvColorRow testid="design-star-color" label={tt(lang, "لون النجوم", "צבע הכוכבים")} value={starOverrides.color} defaultHex="#ffffff" presets={["#ffffff", "#ffe9b0", "#bcd4ff", "#e8b4b8"]} disabled={!editable} onPick={(hex) => setStarField("color", hex)} onReset={() => setStarField("color", null)} />
          <RangeRow testid="design-star-size" label={tt(lang, "حجم النجوم", "גודל הכוכבים")} min={0.4} max={2.5} step={0.1} value={starOverrides.size ?? 1} disabled={!editable} onInput={(v) => bufferStarField("size", v)} onCommit={(v) => commitStarField("size", v)} />
          <RangeRow testid="design-star-opacity" label={tt(lang, "وضوح النجوم", "בהירות הכוכבים")} min={0} max={2} step={0.1} value={starOverrides.opacity ?? 1} disabled={!editable} onInput={(v) => bufferStarField("opacity", v)} onCommit={(v) => commitStarField("opacity", v)} />
          <RangeRow testid="design-star-speed" label={tt(lang, "سرعة دخول النجوم", "מהירות כניסת הכוכבים")} min={0.4} max={2} step={0.1} value={starOverrides.speed ?? 1} disabled={!editable} onInput={(v) => bufferStarField("speed", v)} onCommit={(v) => commitStarField("speed", v)} />

          {/* Live example of the background stars — reacts instantly to the colour/
              size/clarity controls above so the groom/admin sees the result before
              publishing (mirrors the envelope preview, but with NO envelope so the
              starfield fills the frame and is clearly visible). */}
          <StarfieldPreview themeColor={themeColor} starfield={starOverrides} lang={lang} />
        </Section>

        {/* Custom background */}
        <Section step="advanced" title={tt(lang, "الخلفية المخصّصة", "רקע מותאם אישית")}>
          <div style={{ fontSize: 11, color: C.dim, marginBottom: 12, lineHeight: 1.6 }}>
            {tt(lang,
              "صمّم خلفية الدعوة: لون أو تدرّج أو صورة، مع دوائر زخرفية على الأطراف. فعّل \"استخدم خلفيتي\" ليراها كل المدعوين (يحلّ محل العالم ثلاثي الأبعاد؛ يبقى غلاف الفتح ثم يختفي تدريجياً).",
              "עצב את רקע ההזמנה: צבע, מעבר צבע או תמונה, עם עיגולים דקורטיביים בקצוות. הפעל \"השתמש ברקע שלי\" כדי שכל המוזמנים יראו אותו (מחליף את העולם התלת-ממדי; מעטפת הפתיחה עדיין מתנגנת ואז נמוגה).")}
          </div>

          <ToggleRow label={tt(lang, "استخدم خلفيتي (لكل المدعوين)", "השתמש ברקע שלי (לכל המוזמנים)")} checked={bgOverrides.enabled === true} disabled={!editable} testid="design-bg-enabled" onChange={(c) => setBgField("enabled", c)} />

          {/* Fill */}
          <div style={{ fontSize: 12, color: C.goldDim, margin: "14px 0 4px" }}>{tt(lang, "اللون", "צבע")}</div>
          <EnvColorRow testid="design-bg-color" label={tt(lang, "لون الخلفية", "צבע הרקע")} value={bgOverrides.color} defaultHex={bgDefaults.color} presets={["#07070a", "#0b1020", "#1a0f1f", "#f7f3ec"]} disabled={!editable} onPick={(hex) => setBgField("color", hex)} onReset={() => setBgField("color", bgDefaults.color)} />
          <ToggleRow label={tt(lang, "تدرّج لوني", "מעבר צבע")} checked={bgOverrides.gradient === true} disabled={!editable} testid="design-bg-gradient" onChange={(c) => setBgField("gradient", c)} />
          {bgOverrides.gradient === true && (
            <>
              <EnvColorRow testid="design-bg-grad-from" label={tt(lang, "من (أعلى)", "מ (למעלה)")} value={bgOverrides.gradientFrom} defaultHex={bgDefaults.gradientFrom} presets={["#07070a", "#0b1020", "#1a0f1f", "#2a1a3a"]} disabled={!editable} onPick={(hex) => setBgField("gradientFrom", hex)} onReset={() => setBgField("gradientFrom", bgDefaults.gradientFrom)} />
              <EnvColorRow testid="design-bg-grad-to" label={tt(lang, "إلى (أسفل)", "אל (למטה)")} value={bgOverrides.gradientTo} defaultHex={bgDefaults.gradientTo} presets={["#000000", "#07070a", "#1a1030", "#2a1a3a"]} disabled={!editable} onPick={(hex) => setBgField("gradientTo", hex)} onReset={() => setBgField("gradientTo", bgDefaults.gradientTo)} />
            </>
          )}

          {/* Image */}
          <div style={{ fontSize: 12, color: C.goldDim, margin: "14px 0 6px" }}>{tt(lang, "صورة الخلفية (اختياري)", "תמונת רקע (אופציונלי)")}</div>
          {bgOverrides.image?.url ? (
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
              <div style={{ width: 64, height: 44, borderRadius: 8, backgroundImage: `url("${bgOverrides.image.url}")`, backgroundSize: "cover", backgroundPosition: "center", border: "1px solid rgba(255,255,255,.14)" }} />
              <button type="button" data-testid="design-bg-remove" onClick={onRemoveBg} disabled={!editable} style={{ ...pillBtn(false), fontSize: 12 }}>{tt(lang, "حذف الصورة", "מחק תמונה")}</button>
            </div>
          ) : (
            <label style={{ display: "block", padding: "12px 16px", borderRadius: 10, textAlign: "center", border: `2px dashed ${bgBusy ? "rgba(201,168,76,.65)" : "rgba(201,168,76,.32)"}`, background: bgBusy ? "rgba(201,168,76,.06)" : "rgba(201,168,76,.02)", cursor: bgBusy || !editable ? "not-allowed" : "pointer" }}>
              <input ref={bgFileInputRef} type="file" accept="image/*" style={{ display: "none" }} disabled={bgBusy || !editable} data-testid="design-bg-upload-input" onChange={(e) => onUploadBg(e.target.files?.[0])} />
              <span style={{ fontSize: 13, color: C.goldLight, fontWeight: 700 }}>{bgBusy ? `⏳ ${Math.round(bgProgress * 100)}%` : tt(lang, "📁 رفع صورة", "📁 העלאת תמונה")}</span>
            </label>
          )}
          {bgOverrides.image?.url && (
            <RangeRow testid="design-bg-overlay" label={tt(lang, "تعتيم فوق الصورة", "כהות מעל התמונה")} min={0} max={1} step={0.05} value={bgOverrides.imageOverlay ?? bgDefaults.imageOverlay} disabled={!editable} onInput={(v) => bufferBgField("imageOverlay", v)} onCommit={(v) => commitBgField("imageOverlay", v)} />
          )}

          {/* Circles */}
          <div style={{ fontSize: 12, color: C.goldDim, margin: "14px 0 4px" }}>{tt(lang, "الدوائر الزخرفية (على الأطراف)", "עיגולים דקורטיביים (בקצוות)")}</div>
          <RangeRow testid="design-bg-circle-count" label={tt(lang, "العدد", "כמות")} min={0} max={6} step={1} value={bgOverrides.circleCount ?? bgDefaults.circles.count} disabled={!editable} onInput={(v) => bufferBgField("circleCount", v)} onCommit={(v) => commitBgField("circleCount", v)} />
          <EnvColorRow testid="design-bg-circle-color" label={tt(lang, "لون الدوائر", "צבע העיגולים")} value={bgOverrides.circleColor} defaultHex={bgDefaults.circles.color} presets={["#d4a07a", "#caa14e", "#9ecbff", "#e8b4b8"]} disabled={!editable} onPick={(hex) => setBgField("circleColor", hex)} onReset={() => setBgField("circleColor", bgDefaults.circles.color)} />
          <RangeRow testid="design-bg-circle-size" label={tt(lang, "الحجم", "גודל")} min={0} max={1} step={0.05} value={bgOverrides.circleSize ?? bgDefaults.circles.size} disabled={!editable} onInput={(v) => bufferBgField("circleSize", v)} onCommit={(v) => commitBgField("circleSize", v)} />
          <RangeRow testid="design-bg-circle-opacity" label={tt(lang, "الشفافية", "שקיפות")} min={0} max={1} step={0.05} value={bgOverrides.circleOpacity ?? bgDefaults.circles.opacity} disabled={!editable} onInput={(v) => bufferBgField("circleOpacity", v)} onCommit={(v) => commitBgField("circleOpacity", v)} />
          <RangeRow testid="design-bg-circle-softness" label={tt(lang, "النعومة (التمويه)", "ריכוך (טשטוש)")} min={0} max={1} step={0.05} value={bgOverrides.circleSoftness ?? bgDefaults.circles.softness} disabled={!editable} onInput={(v) => bufferBgField("circleSoftness", v)} onCommit={(v) => commitBgField("circleSoftness", v)} />
          <ToggleRow label={tt(lang, "حركة انسياب", "תנועת ריחוף")} checked={bgOverrides.circleMotion !== false} disabled={!editable} testid="design-bg-circle-motion" onChange={(c) => setBgField("circleMotion", c)} />

          {/* Petals + sparkles */}
          <div style={{ marginTop: 12 }}>
            <ToggleRow label={tt(lang, "بتلات متساقطة", "עלי כותרת נושרים")} checked={bgOverrides.petals !== false} disabled={!editable} testid="design-bg-petals" onChange={(c) => setBgField("petals", c)} />
            <ToggleRow label={tt(lang, "ومضات لامعة", "ניצוצות נוצצים")} checked={bgOverrides.sparkles !== false} disabled={!editable} testid="design-bg-sparkles" onChange={(c) => setBgField("sparkles", c)} />
          </div>

          <BackgroundPreview themeColor={themeColor} fontFamily={fontFamily} overrides={bgOverrides} lang={lang} />
        </Section>
        </>
        )}

        {/* Template — the highest-level appearance choice, so it renders before
            theme/font. Picking a template pre-selects its recommended theme/
            font/envelope style (onPickTemplate), but never locks them — the
            pickers below stay fully interactive regardless of active template. */}
        <Section step="style" title={tt(lang, "اختر قالب الدعوة", "בחר תבנית להזמנה")}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))", gap: 10 }}>
            {DIGITAL_TEMPLATE_KEYS.map((id) => {
              const tpl = TEMPLATES[id];
              const active = templateId === id;
              const thumb = resolveThumb(id);
              const pick = () => { if (editable) onPickTemplate(id); };
              // The card is a role="button" DIV (not a <button>) so it can host a
              // nested "live preview" <button> — nested buttons are invalid HTML.
              // Preview opens the per-template demo and is available even when the
              // design isn't editable (previewing is not an edit).
              return (
                <div key={id} data-testid={`design-template-${id}`} role="button" tabIndex={editable ? 0 : -1}
                  aria-pressed={active} aria-disabled={!editable} onClick={pick}
                  onKeyDown={(e) => { if (editable && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); pick(); } }}
                  style={{ position: "relative", padding: thumb ? 0 : "14px 10px", overflow: "hidden", borderRadius: 12, border: `2px solid ${active ? C.gold : "rgba(255,255,255,.08)"}`, background: active ? "rgba(201,168,76,.10)" : "rgba(255,255,255,.02)", cursor: editable ? "pointer" : "not-allowed", opacity: editable ? 1 : 0.55, fontFamily: "inherit", textAlign: "center" }}>
                  {thumb && (
                    <div style={{ width: "100%", aspectRatio: "3 / 4", overflow: "hidden", background: "#111" }}>
                      <img src={thumb} alt="" style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
                    </div>
                  )}
                  <div style={{ fontSize: 12, fontWeight: 800, color: active ? C.gold : C.goldLight, padding: thumb ? "8px 6px" : 0 }}>{tt(lang, tpl.label_ar, tpl.label_he)}</div>
                  <button type="button" data-testid={`design-template-preview-${id}`}
                    onClick={(e) => { e.stopPropagation(); window.open(demoPreviewUrl(id), "_blank", "noopener"); }}
                    style={{ display: "block", width: "100%", padding: "6px 8px", border: "none", borderTop: "1px solid rgba(255,255,255,.06)", background: "transparent", color: C.dim, fontSize: 11, fontWeight: 700, fontFamily: "inherit", cursor: "pointer" }}>
                    {tt(lang, "معاينة حيّة ↗", "תצוגה חיה ↗")}
                  </button>
                </div>
              );
            })}
          </div>
        </Section>

        {/* Theme */}
        <Section step="style" title={tt(lang, "لون التصميم", "צבע העיצוב")}>
          {isBespokeTpl && (
            <div style={{ fontSize: 11, color: C.dim, marginBottom: 12, lineHeight: 1.6 }}>
              {tt(lang,
                "ألوان منسّقة خصيصًا لهذا التصميم — كل خيار مصمَّم ومجرَّب ليبقى المظهر متناسقًا.",
                "צבעים שנבחרו במיוחד לתבנית זו — כל אפשרות עוצבה ונבדקה כדי לשמור על מראה מלוטש.")}
            </div>
          )}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(110px, 1fr))", gap: 10 }}>
            {themeKeysForPicker.map((k) => {
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
        <Section step="style" title={tt(lang, "نوع الخط", "סוג גופן")}>
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

        <StepGroup id="review" activeStep={activeStep} view={view}>
        {!adminDemoMode && (
          <OnboardingChecklist
            title={tt(lang, "جاهزية الدعوة", "מוכנות ההזמנה")}
            steps={[
              { label: tt(lang, "أسماء العروسين", "שמות החתן והכלה"), done: doneNames },
              { label: tt(lang, "تاريخ ووقت الزفاف", "תאריך ושעת החתונה"), done: doneDate },
              { label: tt(lang, "صورة واحدة على الأقل", "לפחות תמונה אחת"), done: donePhoto },
            ]}
            note={doneNames
              ? tt(lang, "دعوتك جاهزة — أرسلها للاعتماد.", "ההזמנה מוכנה — שלחו לאישור.")
              : tt(lang, "أضِف اسمَي العروسين لتتمكّن من الإرسال.", "הוסיפו את שמות החתן והכלה כדי לשלוח.")}
          />
        )}
        {/* Submit (groom) / Publish (admin demo) */}
        {adminDemoMode ? (
          <button data-testid="demo-publish-btn" className="gold-btn" onClick={onPublish} disabled={publishing} style={{ width: "100%", padding: "14px 0", fontSize: 14, marginTop: 4 }}>
            {publishing ? "..." : tt(lang, "🖼 نشر إلى صفحة العرض", "🖼 פרסם לדף ההדגמה")}
          </button>
        ) : (status === "draft" || status === "rejected") && (
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
            <TemplateRenderer design={previewDesign} guestName={tt(editLang, "اسم الضيف", "שם האורח")} lang={editLang} mode="preview" />
          </div>
        </div>
        </StepGroup>
      </div>
      </WizardCtx.Provider>

      {wizard && (
        <div style={{ display: "flex", gap: 10, marginTop: 18 }}>
          <button
            type="button"
            data-testid="design-wizard-back"
            onClick={() => gotoStep(stepIdx - 1)}
            disabled={stepIdx === 0}
            style={{ ...pillBtn(stepIdx !== 0), flex: "0 0 auto", padding: "12px 18px", fontSize: 13 }}
          >
            ← {tt(lang, "السابق", "הקודם")}
          </button>
          {stepIdx < WIZARD_STEP_IDS.length - 1 ? (
            <button
              type="button"
              data-testid="design-wizard-next"
              onClick={() => gotoStep(stepIdx + 1)}
              className="gold-btn"
              style={{ flex: 1, padding: "12px 0", fontSize: 14 }}
            >
              {activeStep === "advanced"
                ? tt(lang, "التالي: المراجعة →", "הבא: סקירה →")
                : tt(lang, "التالي →", "הבא →")}
            </button>
          ) : (
            <div style={{ flex: 1 }} />
          )}
        </div>
      )}
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

function Section({ title, children, toggle, step }) {
  const { view, activeStep } = useContext(WizardCtx);
  // In wizard mode a section only renders on its own step; "full" shows them all.
  if (step && view === "wizard" && step !== activeStep) return null;
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

// One envelope colour control: preset chips + a freeform native picker + a reset
// link (active only when an override is set). The swatch reflects the override or
// the live theme default when unset.
function EnvColorRow({ testid, label, value, defaultHex, presets, onPick, onReset, disabled }) {
  const shown = value || defaultHex || "#000000";
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, padding: "8px 2px", borderBottom: "1px solid rgba(255,255,255,.05)" }}>
      <span style={{ fontSize: 13, color: C.goldLight, fontWeight: 700 }}>{label}</span>
      <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
        {(presets || []).map((p, i) => (
          <button
            key={p} type="button" data-testid={`${testid}-chip-${i}`} disabled={disabled} title={p}
            onClick={() => onPick(p)}
            style={{ width: 20, height: 20, borderRadius: "50%", background: p, border: `2px solid ${value === p ? C.gold : "rgba(255,255,255,.18)"}`, cursor: disabled ? "not-allowed" : "pointer", padding: 0 }}
          />
        ))}
        <input
          type="color" data-testid={testid} value={shown} disabled={disabled}
          onChange={(e) => onPick(e.target.value)}
          style={{ width: 30, height: 26, padding: 0, border: "none", background: "none", cursor: disabled ? "not-allowed" : "pointer" }}
        />
        <button
          type="button" data-testid={`${testid}-reset`} disabled={disabled || !value} onClick={onReset} title="reset"
          style={{ fontSize: 13, lineHeight: 1, color: value ? C.gold : "rgba(255,255,255,.18)", background: "none", border: "none", cursor: disabled || !value ? "default" : "pointer", fontFamily: "inherit", padding: 2 }}
        >↺</button>
      </div>
    </div>
  );
}

// A labelled range slider styled like the toggles. `onInput` fires live while
// dragging (buffer → preview updates); `onCommit` fires once on release (persist).
function RangeRow({ testid, label, min, max, step, value, onInput, onCommit, disabled }) {
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, padding: "10px 2px", opacity: disabled ? 0.5 : 1 }}>
      <span style={{ fontSize: 13, color: C.goldLight, fontWeight: 700, whiteSpace: "nowrap" }}>{label}</span>
      <input
        type="range" data-testid={testid} min={min} max={max} step={step} value={value} disabled={disabled}
        onChange={(e) => onInput(Number(e.target.value))}
        onPointerUp={(e) => onCommit(Number(e.currentTarget.value))}
        onKeyUp={(e) => onCommit(Number(e.currentTarget.value))}
        style={{ flex: 1, maxWidth: 200, accentColor: C.gold, cursor: disabled ? "not-allowed" : "pointer" }}
      />
    </div>
  );
}

// Dedicated sealed-envelope 3D preview. Mounts CelestialCanvas directly (bypassing
// CelestialAmbience), so none of the public-page one-time-reveal / scroll-lock /
// localStorage logic applies. CelestialCanvas captures the envelope at mount, so
// we remount (clean dispose + fresh canvas) a beat after edits settle.
function EnvelopePreview({ themeColor, overrides, content, lang }) {
  const theme = useMemo(() => getDigitalTheme(themeColor), [themeColor]);
  const colors = useMemo(() => resolveEnvelopePalette(theme, overrides), [theme, overrides]);
  const colorsKey = useMemo(() => JSON.stringify(colors), [colors]);
  const worldRef = useRef(null);
  const [remount, setRemount] = useState(0);

  // Debounced rebuild: bump the remount key ~250ms after the colours/options stop
  // changing, so dragging a picker doesn't thrash the WebGL context.
  useEffect(() => {
    const id = setTimeout(() => setRemount((n) => n + 1), 250);
    return () => clearTimeout(id);
  }, [colorsKey]);

  const play = () => worldRef.current?.openEnvelope({ onComplete: () => setRemount((n) => n + 1) });

  return (
    <div data-testid="design-env-preview" style={{ position: "relative", height: 300, borderRadius: 14, overflow: "hidden", border: "1px solid rgba(201,168,76,.22)", background: theme.bg, marginTop: 14 }}>
      <Suspense fallback={null}>
        <CelestialCanvas
          key={remount}
          theme={theme}
          mode="preview"
          fixed={false}
          tier={2}
          envelope={{ colors, content }}
          onReady={(w) => { worldRef.current = w; }}
          elevated={false}
        />
      </Suspense>
      <button type="button" data-testid="design-env-play" onClick={play} style={{ position: "absolute", bottom: 10, left: "50%", transform: "translateX(-50%)", zIndex: 2, ...pillBtn(true) }}>
        {tt(lang, "▶ تشغيل الفتح", "▶ הפעלת פתיחה")}
      </button>
    </div>
  );
}

// Dedicated background-STARFIELD preview. Mounts CelestialCanvas with NO envelope
// so the celestial particle field fills the frame and the groom/admin sees the star
// colour / size / clarity react live while dragging the controls — an "example
// before publishing". CelestialCanvas re-skins on a starfield change (uniform-only,
// no rebuild), so the field updates instantly without remounting the WebGL context.
function StarfieldPreview({ themeColor, starfield, lang }) {
  const theme = useMemo(() => getDigitalTheme(themeColor), [themeColor]);
  return (
    <div
      data-testid="design-star-preview"
      style={{ position: "relative", height: 220, borderRadius: 14, overflow: "hidden", border: "1px solid rgba(201,168,76,.22)", background: theme.bg, marginTop: 14 }}
    >
      <Suspense fallback={null}>
        <CelestialCanvas
          theme={theme}
          mode="preview"
          fixed={false}
          tier={2}
          starfield={starfield}
          elevated={false}
          demoScroll
        />
      </Suspense>
      <div style={{ position: "absolute", bottom: 8, insetInlineStart: 0, insetInlineEnd: 0, textAlign: "center", zIndex: 2, pointerEvents: "none", fontSize: 10, letterSpacing: 2, textTransform: "uppercase", color: "rgba(255,255,255,.7)", textShadow: "0 1px 4px rgba(0,0,0,.6)" }}>
        {tt(lang, "مثال على دخول النجوم", "דוגמת כניסת הכוכבים")}
      </div>
    </div>
  );
}

// Live 2D preview of the custom background — renders the same <Ambience> the
// public page uses (no WebGL), so the groom sees fill / circles / image instantly.
// Wrapped in a `.dawa-inv` box with its own ViewStyles so the scoped aurora /
// petal / sparkle CSS + drift keyframes apply even outside the full preview.
function BackgroundPreview({ themeColor, fontFamily, overrides, lang }) {
  const theme = useMemo(() => getDigitalTheme(themeColor), [themeColor]);
  const font = useMemo(() => getDigitalFont(fontFamily), [fontFamily]);
  const bg = useMemo(() => resolveBackground(theme, overrides), [theme, overrides]);
  return (
    <div
      className="dawa-inv"
      data-testid="design-bg-preview"
      style={{ position: "relative", height: 280, borderRadius: 14, overflow: "hidden", border: "1px solid rgba(201,168,76,.22)", marginTop: 14, background: theme.bg, color: theme.text }}
    >
      <ViewStyles theme={theme} font={font} fixed={false} />
      <Ambience theme={theme} fixed={false} background={bg} />
      <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", textAlign: "center", zIndex: 6, pointerEvents: "none", padding: 16 }}>
        <div style={{ fontSize: 11, letterSpacing: 3, textTransform: "uppercase", opacity: 0.75 }}>{tt(lang, "معاينة الخلفية", "תצוגת רקע")}</div>
        <div style={{ fontSize: 26, fontWeight: 900, marginTop: 6, fontFamily: font.family }}>{tt(lang, "دعوة", "הזמנה")}</div>
      </div>
    </div>
  );
}

function epochToInput(epoch) {
  if (!epoch || !Number.isFinite(epoch)) return "";
  const d = new Date(epoch);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n) => String(n).padStart(2, "0");
  // datetime-local shape "YYYY-MM-DDTHH:MM" in the browser's local time (the groom
  // is in the venue's timezone). inputToEpoch round-trips it back via new Date().
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function inputToEpoch(value) {
  if (!value) return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return d.getTime();
}
