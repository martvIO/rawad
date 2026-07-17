// Admin Analytics — the cross-platform operator command center. Answers, at a
// glance: is the business healthy (revenue/conversion), are operations running
// (delivery/drivers/RSVP), and where must the admin intervene today (triage).
//
// All numbers are pre-computed by GET /admin/analytics (services/analytics.js);
// this component only renders. recharts is LTR-only, so every chart sits in a
// `dir="ltr"` wrapper while the surrounding RTL chrome stays Arabic/Hebrew.
//
// HONESTY: no delivery time-series (deliveredAt is a HH:MM string), no
// fabricated "failed" payments — see the backend aggregator's header for why.
// Invite OPENS are first-party tracked (the /invites/digital/opened ping stamps
// viewedAt), so the open rate here is real, not modeled.
import { useEffect, useState, useMemo } from "react";
import { Link } from "react-router-dom";
import {
  ResponsiveContainer, PieChart, Pie, Cell,
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  LineChart, Line,
} from "recharts";
import { usePortal } from "../../../context/PortalContext.jsx";
import {
  DigitalFunnel, LoadPerformance, TemplateMetrics, WeddingEngagement, DemoEngagement,
} from "./AdminEngagementSections.jsx";
import { C } from "../../../styles/theme.js";
import { Icon } from "../../../components/icons/Icon.jsx";
import { Num } from "../../../components/Num.jsx";
import { ProgressBar } from "../../../components/ProgressBar.jsx";
import { SkeletonList } from "../../../components/Skeleton.jsx";
import { getAnalytics } from "../../../services/analytics.js";
import { localizeApiError } from "../../../utils/apiError.js";

const tt = (lang, ar, he) => (lang === "he" ? he : ar);

// Chart palette — theme tokens plus the green/purple used elsewhere in admin.
const PAL = {
  gold: C.gold, goldLight: C.goldLight, blue: C.blue, dim: C.dim,
  green: "#4cc97a", red: "#d4533a", purple: "#c084fc", amber: "#f0c84c",
};
const TOOLTIP_STYLE = {
  background: "#0c0c11", border: "1px solid rgba(255,255,255,.12)",
  borderRadius: 8, fontSize: 12, color: C.goldLight,
};
const AXIS_TICK = { fill: C.dim, fontSize: 10 };

const enNum = (n) => (Number(n) || 0).toLocaleString("en");

function fmtDuration(ms, lang) {
  if (ms === null || ms === undefined || !Number.isFinite(ms)) return "—";
  const hours = ms / (60 * 60 * 1000);
  if (hours < 1) return tt(lang, "أقل من ساعة", "פחות משעה");
  if (hours < 48) return `${Math.round(hours)} ${tt(lang, "ساعة", "שעות")}`;
  const days = hours / 24;
  return `${(Math.round(days * 10) / 10).toLocaleString("en")} ${tt(lang, "يوم", "ימים")}`;
}

// ─── Small presentational pieces ────────────────────────────────────────────────

function Section({ icon, title, children }) {
  return (
    <div style={{ marginBottom: 26 }}>
      <div style={{ fontSize: 15, fontWeight: 900, color: C.gold, fontFamily: "'Amiri','Frank Ruhl Libre','Amiri Fallback',serif", marginBottom: 10 }}>
        {icon} {title}
      </div>
      {children}
    </div>
  );
}

function KpiGrid({ cols = 4, children }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: `repeat(${cols},1fr)`, gap: 10, marginBottom: 12 }}>
      {children}
    </div>
  );
}

function Kpi({ label, value, color, suffix }) {
  return (
    <div className="card" style={{ padding: "14px 10px", textAlign: "center" }}>
      <div style={{ fontSize: 22, fontWeight: 900, color: color || C.goldLight, lineHeight: 1.1 }}>
        <Num>{value}</Num>{suffix ? <span style={{ fontSize: 13, fontWeight: 700 }}> {suffix}</span> : null}
      </div>
      <div style={{ fontSize: 11, color: C.dim, marginTop: 6 }}>{label}</div>
    </div>
  );
}

function ChartCard({ title, children }) {
  return (
    <div className="card" style={{ padding: 16, marginBottom: 12 }}>
      {title && <div style={{ fontSize: 12, fontWeight: 800, color: C.goldDim, marginBottom: 8 }}>{title}</div>}
      {children}
    </div>
  );
}

function EmptyChart({ lang }) {
  return (
    <div style={{ textAlign: "center", padding: "28px 0", color: C.dim, fontSize: 12 }}>
      {tt(lang, "لا توجد بيانات بعد", "אין נתונים עדיין")}
    </div>
  );
}

function legendFmt(value) {
  return <span style={{ color: C.goldLight, fontSize: 11 }}>{value}</span>;
}

function Donut({ data, lang, height = 200 }) {
  const total = data.reduce((s, d) => s + (d.value || 0), 0);
  if (total === 0) return <EmptyChart lang={lang} />;
  return (
    <div dir="ltr" style={{ width: "100%", height }}>
      <ResponsiveContainer>
        <PieChart>
          <Pie data={data} dataKey="value" nameKey="name" innerRadius={48} outerRadius={78} paddingAngle={2} stroke="none">
            {data.map((d, i) => <Cell key={i} fill={d.color} />)}
          </Pie>
          <Tooltip contentStyle={TOOLTIP_STYLE} />
          <Legend formatter={legendFmt} />
        </PieChart>
      </ResponsiveContainer>
    </div>
  );
}

// ─── Page ────────────────────────────────────────────────────────────────────────

export function AdminAnalytics() {
  const { lang, showToast } = usePortal();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [windowKey, setWindowKey] = useState("30d");

  const reload = async (win = windowKey) => {
    setLoading(true);
    try {
      const payload = await getAnalytics(win);
      setData(payload && typeof payload === "object" ? payload : null);
    } catch (e) {
      showToast(localizeApiError(e, lang, tt(lang, "تعذّر تحميل التحليلات", "טעינת האנליטיקה נכשלה")));
      setData(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { reload("30d"); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, []);

  const onWindow = (win) => { setWindowKey(win); reload(win); };

  return (
    <div style={{ animation: "fadeUp .3s ease" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 16, gap: 10 }}>
        <div>
          <div style={{ fontSize: 19, fontWeight: 900, color: C.gold, fontFamily: "'Amiri','Frank Ruhl Libre','Amiri Fallback',serif", marginBottom: 4 }}>
            📊 {tt(lang, "لوحة التحليلات", "לוח אנליטיקה")}
          </div>
          <div style={{ fontSize: 12, color: C.dim }}>
            {tt(lang, "نظرة شاملة على المنصّة: الأعمال، العمليات، والمهام العاجلة.", "מבט-על על הפלטפורמה: עסקים, תפעול, ומשימות דחופות.")}
          </div>
        </div>
        <button className="ghost-btn" style={{ padding: "6px 14px", fontSize: 12, flexShrink: 0 }} onClick={() => reload()} disabled={loading}>
          {loading ? "…" : tt(lang, "تحديث", "רענן")}
        </button>
      </div>

      {loading && !data && <SkeletonList count={4} />}

      {!loading && !data && (
        <div className="card" style={{ textAlign: "center", padding: 28, color: C.dim }}>
          {tt(lang, "لا توجد بيانات لعرضها", "אין נתונים להצגה")}
        </div>
      )}

      {data && (
        <>
          <Composition data={data.composition} lang={lang} />
          <Revenue data={data.revenue} lang={lang} />
          <Operations data={data.operations} lang={lang} />
          <Rsvp data={data.rsvp} lang={lang} />
          {/* Guest-experience: the funnel + how the invitation actually performs
              on a guest's phone. Prospect/demo traffic is reported separately at
              the bottom so it can never be read as a couple's numbers. */}
          <DigitalFunnel data={data.digitalEngagement} lang={lang} />
          <LoadPerformance data={data.templateMetrics} lang={lang} />
          <TemplateMetrics data={data.templateMetrics} lang={lang} />
          <WeddingEngagement data={data.weddingEngagement} lang={lang} />
          <Designs data={data.designs} lang={lang} />
          <Triage data={data.triage} lang={lang} />
          <Trends data={data.trends} lang={lang} windowKey={windowKey} onWindow={onWindow} />
          <DemoEngagement data={data.demoEngagement} lang={lang} />

          <div style={{ textAlign: "center", fontSize: 10, color: C.dim, marginTop: 8 }}>
            {tt(lang, "آخر تحديث", "עודכן")}: <Num dir="auto">{fmtClock(data.generatedAt, lang)}</Num>
          </div>
        </>
      )}
    </div>
  );
}

function fmtClock(ts, lang) {
  if (!ts) return "—";
  try {
    return new Date(ts).toLocaleString(lang === "he" ? "he-IL" : "ar-EG", {
      day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit", numberingSystem: "latn",
    });
  } catch { return "—"; }
}

// ─── Section 1: Composition ───────────────────────────────────────────────────────

function Composition({ data, lang }) {
  if (!data) return null;
  return (
    <Section icon="👥" title={tt(lang, "تركيبة المنصّة", "הרכב הפלטפורמה")}>
      <KpiGrid cols={4}>
        <Kpi label={tt(lang, "إجمالي المستخدمين", "סה״כ משתמשים")} value={enNum(data.totalUsers)} color={C.goldLight} />
        <Kpi label={tt(lang, "العرسان", "חתנים")} value={enNum(data.grooms)} color={PAL.gold} />
        <Kpi label={tt(lang, "السائقون", "נהגים")} value={enNum(data.drivers)} color={PAL.blue} />
        <Kpi label={tt(lang, "المدراء", "מנהלים")} value={enNum(data.admins)} color={PAL.red} />
      </KpiGrid>
    </Section>
  );
}

// ─── Section 2: Revenue ─────────────────────────────────────────────────────────

function Revenue({ data, lang }) {
  if (!data) return null;
  const planMix = [
    { name: tt(lang, "بريميوم", "פרימיום"), value: data.planMix?.premium || 0, color: PAL.gold },
    { name: "VIP", value: data.planMix?.vip || 0, color: PAL.purple },
  ];
  const funnel = (data.funnel || []).map((f) => ({
    name: f.stage === "none" ? tt(lang, "بلا رابط", "ללא קישור")
      : f.stage === "pending" ? tt(lang, "بانتظار الدفع", "ממתין לתשלום")
      : tt(lang, "مدفوع", "שולם"),
    count: f.count,
    color: f.stage === "paid" ? PAL.green : f.stage === "pending" ? PAL.amber : PAL.dim,
  }));
  return (
    <Section icon="💰" title={tt(lang, "الأعمال والإيرادات", "עסקים והכנסות")}>
      <KpiGrid cols={4}>
        <Kpi label={tt(lang, "إجمالي الإيرادات", "סה״כ הכנסות")} value={enNum(data.totalRevenueIls)} suffix="₪" color={PAL.green} />
        <Kpi label={tt(lang, "متوسط الإيراد/عريس", "ARPU")} value={enNum(data.arpuIls)} suffix="₪" color={C.goldLight} />
        <Kpi label={tt(lang, "متوسط زمن الدفع", "זמן ממוצע לתשלום")} value={fmtDuration(data.avgTimeToPayMs, lang)} color={PAL.blue} />
        <Kpi label={tt(lang, "مدفوع / بانتظار", "שולם / ממתין")} value={`${enNum(data.paidCount)} / ${enNum(data.pendingCount)}`} color={PAL.amber} />
      </KpiGrid>
      <ChartCard title={tt(lang, "مسار التحويل (عرسان)", "משפך המרה (חתנים)")}>
        <div dir="ltr" style={{ width: "100%", height: 160 }}>
          <ResponsiveContainer>
            <BarChart data={funnel} layout="vertical" margin={{ left: 10, right: 16, top: 4, bottom: 4 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,.06)" horizontal={false} />
              <XAxis type="number" tick={AXIS_TICK} stroke={C.dim} allowDecimals={false} />
              <YAxis type="category" dataKey="name" tick={AXIS_TICK} stroke={C.dim} width={90} />
              <Tooltip contentStyle={TOOLTIP_STYLE} cursor={{ fill: "rgba(255,255,255,.04)" }} />
              <Bar dataKey="count" radius={[0, 6, 6, 0]}>
                {funnel.map((f, i) => <Cell key={i} fill={f.color} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </ChartCard>
      <ChartCard title={tt(lang, "توزيع الباقات (المدفوعة)", "תמהיל חבילות (ששולמו)")}>
        <Donut data={planMix} lang={lang} />
      </ChartCard>
    </Section>
  );
}

// ─── Section 3: Operations ────────────────────────────────────────────────────────

const OUTCOME_META = {
  pending: { ar: "لم يبدأ", he: "טרם החל", color: PAL.dim },
  enroute: { ar: "في الطريق", he: "בדרך", color: PAL.blue },
  delivered: { ar: "تم التسليم", he: "נמסר", color: PAL.green },
  no_answer: { ar: "لا يوجد رد", he: "אין מענה", color: PAL.amber },
  wrong_address: { ar: "عنوان خاطئ", he: "כתובת שגויה", color: PAL.purple },
  refused: { ar: "رفض", he: "סירב", color: PAL.red },
};

function Operations({ data, lang }) {
  if (!data) return null;
  const ob = data.outcomeBreakdown || {};
  const outcomeData = Object.keys(OUTCOME_META)
    .map((k) => ({ name: tt(lang, OUTCOME_META[k].ar, OUTCOME_META[k].he), value: ob[k] || 0, color: OUTCOME_META[k].color }))
    .filter((d) => d.value > 0);
  const leaders = data.driverLeaderboard || [];
  return (
    <Section icon="🚚" title={tt(lang, "العمليات والتسليم", "תפעול ומסירה")}>
      <ChartCard>
        <ProgressBar
          label={tt(lang, "نسبة التسليم", "אחוז מסירה")}
          value={data.delivered} total={data.totalGuests}
          sublabel={`${tt(lang, "تم تسليم", "נמסרו")} ${enNum(data.delivered)} / ${enNum(data.totalGuests)} · ${enNum(data.deliveryPct)}%`}
          color={PAL.green}
        />
        <ProgressBar
          label={tt(lang, "نسبة صور الإثبات (من المُسلّم)", "אחוז תמונות הוכחה (מהנמסר)")}
          value={data.proofPhotoRatePct} total={100}
          sublabel={`${enNum(data.proofPhotoRatePct)}%`}
          color={PAL.blue}
        />
      </ChartCard>
      <ChartCard title={tt(lang, "حالات التسليم", "סטטוסי מסירה")}>
        <Donut data={outcomeData} lang={lang} />
      </ChartCard>
      <ChartCard title={tt(lang, "أداء السائقين (الأكثر تسليماً)", "ביצועי נהגים (הכי הרבה מסירות)")}>
        {leaders.length === 0 ? <EmptyChart lang={lang} /> : (
          <div dir="ltr" style={{ width: "100%", height: Math.max(120, leaders.length * 34) }}>
            <ResponsiveContainer>
              <BarChart data={leaders} layout="vertical" margin={{ left: 10, right: 16, top: 4, bottom: 4 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,.06)" horizontal={false} />
                <XAxis type="number" tick={AXIS_TICK} stroke={C.dim} allowDecimals={false} />
                <YAxis type="category" dataKey="name" tick={AXIS_TICK} stroke={C.dim} width={90} />
                <Tooltip contentStyle={TOOLTIP_STYLE} cursor={{ fill: "rgba(255,255,255,.04)" }} />
                <Bar dataKey="count" fill={PAL.gold} radius={[0, 6, 6, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </ChartCard>
    </Section>
  );
}

// ─── Section 4: RSVP ──────────────────────────────────────────────────────────────

function Rsvp({ data, lang }) {
  if (!data) return null;
  const digital = [
    { name: tt(lang, "حاضر", "מגיע"), value: data.digital?.attending || 0, color: PAL.green },
    { name: tt(lang, "غير حاضر", "לא מגיע"), value: data.digital?.absent || 0, color: PAL.red },
    { name: tt(lang, "لم يرد", "טרם ענה"), value: data.digital?.pending || 0, color: PAL.dim },
  ];
  return (
    <Section icon="✉️" title={tt(lang, "التأكيدات والحضور", "אישורים ונוכחות")}>
      <KpiGrid cols={4}>
        <Kpi label={tt(lang, "روابط مُرسَلة", "קישורים שנשלחו")} value={enNum(data.invitesSent)} color={PAL.blue} />
        <Kpi label={tt(lang, "أكّدوا", "אישרו")} value={enNum(data.confirmedGuests)} color={PAL.green} />
        <Kpi label={tt(lang, "نسبة الرد", "אחוז מענה")} value={enNum(data.rsvpRatePct)} suffix="%" color={C.goldLight} />
        <Kpi label={tt(lang, "الحضور المتوقّع", "צפי נוכחים")} value={enNum(data.expectedHeadcount)} color={PAL.gold} />
      </KpiGrid>
      {/* First-party open KPIs — computed server-side from the viewedAt ping. */}
      <KpiGrid cols={2}>
        <Kpi label={tt(lang, "فتحوا الدعوة الرقمية", "פתחו את ההזמנה הדיגיטלית")} value={enNum(data.digitalOpened)} color={PAL.blue} />
        <Kpi label={tt(lang, "نسبة الفتح الرقمي", "אחוז פתיחה דיגיטלי")} value={enNum(data.digitalOpenRatePct)} suffix="%" color={C.goldLight} />
      </KpiGrid>
      <ChartCard>
        <ProgressBar
          label={tt(lang, "نسبة الرد على الدعوات", "אחוז המענה להזמנות")}
          value={data.confirmedGuests} total={data.invitesSent}
          sublabel={`${enNum(data.confirmedGuests)} / ${enNum(data.invitesSent)}`}
          color={PAL.green}
        />
      </ChartCard>
      <ChartCard title={tt(lang, "الردود الرقمية", "מענה דיגיטלי")}>
        <Donut data={digital} lang={lang} />
      </ChartCard>
    </Section>
  );
}

// ─── Section 5: Designs ─────────────────────────────────────────────────────────

const DESIGN_STATUS_META = {
  draft: { ar: "مسوّدة", he: "טיוטה", color: PAL.gold },
  pending_approval: { ar: "بانتظار الموافقة", he: "ממתין לאישור", color: PAL.purple },
  approved: { ar: "معتمد", he: "אושר", color: PAL.green },
  rejected: { ar: "مرفوض", he: "נדחה", color: PAL.red },
};

function Designs({ data, lang }) {
  if (!data) return null;
  const bs = data.byStatus || {};
  const statusData = Object.keys(DESIGN_STATUS_META)
    .map((k) => ({ name: tt(lang, DESIGN_STATUS_META[k].ar, DESIGN_STATUS_META[k].he), value: bs[k] || 0, color: DESIGN_STATUS_META[k].color }))
    .filter((d) => d.value > 0);
  return (
    <Section icon="🎨" title={tt(lang, "مسار التصاميم", "צנרת העיצובים")}>
      <KpiGrid cols={4}>
        <Kpi label={tt(lang, "إجمالي التصاميم", "סה״כ עיצובים")} value={enNum(data.totalDesigns)} color={C.goldLight} />
        <Kpi label={tt(lang, "عرسان لديهم تصميم", "חתנים עם עיצוב")} value={enNum(data.groomsWithDesigns)} color={PAL.gold} />
        <Kpi label={tt(lang, "اعتمادات", "אישורים")} value={enNum(data.approvals)} color={PAL.green} />
        <Kpi label={tt(lang, "رفوضات", "דחיות")} value={enNum(data.rejections)} color={PAL.red} />
      </KpiGrid>
      <ChartCard title={tt(lang, "حالات التصاميم", "סטטוסי עיצוב")}>
        <Donut data={statusData} lang={lang} />
      </ChartCard>
      <div style={{ fontSize: 11, color: C.dim, textAlign: "center" }}>
        {tt(lang, "متوسط زمن الاعتماد", "זמן ממוצע לאישור")}: <Num dir="auto">{fmtDuration(data.avgPendingToApprovedMs, lang)}</Num>
      </div>
    </Section>
  );
}

// ─── Section 6: Triage ──────────────────────────────────────────────────────────

const TRIAGE_META = {
  design_pending: { iconName: "palette", ar: "تصميم بانتظار الموافقة", he: "עיצוב ממתין לאישור", to: "/portal/admin/designs", color: PAL.purple },
  payment_pending: { iconName: "card", ar: "دفعة معلّقة", he: "תשלום ממתין", to: "/portal/admin/users", color: PAL.amber },
  no_driver: { iconName: "car", ar: "بلا سائق", he: "ללא נהג", to: "/portal/admin/users", color: PAL.blue },
  low_delivery: { iconName: "warning", ar: "تسليم منخفض", he: "מסירה נמוכה", to: "/portal/admin/confirmations", color: PAL.red },
  wedding_soon: { iconName: "clock", ar: "عرس قريب", he: "חתונה קרובה", to: "/portal/admin/confirmations", color: PAL.green },
};

function triageDetail(item, lang) {
  switch (item.type) {
    case "payment_pending": return item.detail ? `${enNum(item.detail)} ₪` : "";
    case "no_driver": return `${enNum(item.detail)} ${tt(lang, "مدعو", "מוזמנים")}`;
    case "low_delivery": return `${enNum(item.detail)}% ${tt(lang, "مُسلّم", "נמסר")}`;
    case "wedding_soon": return `${tt(lang, "خلال", "בעוד")} ${enNum(item.detail)} ${tt(lang, "يوم", "ימים")}`;
    default: return "";
  }
}

function Triage({ data, lang }) {
  if (!data) return null;
  const items = data.items || [];
  return (
    <Section icon="🔔" title={`${tt(lang, "مهام تحتاج انتباهك", "משימות שדורשות תשומת לב")}${data.total ? ` (${enNum(data.total)})` : ""}`}>
      {items.length === 0 ? (
        <div className="card" style={{ textAlign: "center", padding: 22, color: PAL.green, fontSize: 13 }}>
          ✓ {tt(lang, "لا توجد مهام عاجلة — كل شيء على ما يرام", "אין משימות דחופות — הכול תקין")}
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {items.map((item, i) => {
            const meta = TRIAGE_META[item.type] || {};
            const detail = triageDetail(item, lang);
            return (
              <Link
                key={`${item.type}:${item.groomUid}:${i}`}
                to={meta.to || "/portal/admin/users"}
                className="card"
                style={{ padding: "11px 14px", display: "flex", alignItems: "center", gap: 10, textDecoration: "none" }}
              >
                <span style={{ display: "flex", flexShrink: 0, color: meta.color }}><Icon name={meta.iconName} size={18} /></span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 800, color: meta.color || C.goldLight }}>
                    {tt(lang, meta.ar, meta.he)}
                  </div>
                  <div style={{ fontSize: 11, color: C.dim, marginTop: 2, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                    @{item.groomUsername}{detail ? <> · <Num dir="auto">{detail}</Num></> : null}
                  </div>
                </div>
                <span style={{ color: C.dim, fontSize: 16, flexShrink: 0 }}>‹</span>
              </Link>
            );
          })}
        </div>
      )}
    </Section>
  );
}

// ─── Section 7: Trends ──────────────────────────────────────────────────────────

const WINDOW_OPTS = [
  { key: "30d", ar: "٣٠ يوم", he: "30 ימים" },
  { key: "90d", ar: "٩٠ يوم", he: "90 ימים" },
  { key: "all", ar: "الكل", he: "הכול" },
];

function Trends({ data, lang, windowKey, onWindow }) {
  const merged = useMemo(() => {
    if (!data) return [];
    const sig = data.signups || [];
    return sig.map((b, i) => ({
      t: b.t,
      signups: b.count,
      payments: data.payments?.[i]?.count ?? 0,
      confirmations: data.confirmations?.[i]?.count ?? 0,
      invites: data.invitesCreated?.[i]?.count ?? 0,
    }));
  }, [data]);

  const tickFmt = (t) => {
    try {
      return new Date(t).toLocaleDateString(lang === "he" ? "he-IL" : "ar-EG", { day: "2-digit", month: "2-digit", numberingSystem: "latn" });
    } catch { return ""; }
  };
  const hasData = merged.some((p) => p.signups || p.payments || p.confirmations || p.invites);

  return (
    <Section icon="📈" title={tt(lang, "الاتجاهات عبر الزمن", "מגמות לאורך זמן")}>
      <div style={{ display: "flex", gap: 6, marginBottom: 10 }}>
        {WINDOW_OPTS.map((w) => {
          const active = windowKey === w.key;
          return (
            <button
              key={w.key}
              onClick={() => onWindow(w.key)}
              style={{
                padding: "6px 14px", borderRadius: 10, fontFamily: "inherit", fontSize: 12, fontWeight: 800, cursor: "pointer",
                border: `1px solid ${active ? "rgba(201,168,76,.4)" : "rgba(255,255,255,.08)"}`,
                background: active ? "rgba(201,168,76,.18)" : "rgba(255,255,255,.04)",
                color: active ? C.gold : C.dim,
              }}
            >
              {tt(lang, w.ar, w.he)}
            </button>
          );
        })}
      </div>
      <ChartCard>
        {!hasData ? <EmptyChart lang={lang} /> : (
          <div dir="ltr" style={{ width: "100%", height: 240 }}>
            <ResponsiveContainer>
              <LineChart data={merged} margin={{ left: -10, right: 12, top: 8, bottom: 4 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,.06)" />
                <XAxis dataKey="t" tickFormatter={tickFmt} tick={AXIS_TICK} stroke={C.dim} minTickGap={24} />
                <YAxis tick={AXIS_TICK} stroke={C.dim} allowDecimals={false} width={34} />
                <Tooltip contentStyle={TOOLTIP_STYLE} labelFormatter={tickFmt} cursor={{ stroke: "rgba(255,255,255,.12)" }} />
                <Legend formatter={legendFmt} />
                <Line type="monotone" dataKey="signups" name={tt(lang, "تسجيلات", "הרשמות")} stroke={PAL.blue} dot={false} strokeWidth={2} />
                <Line type="monotone" dataKey="payments" name={tt(lang, "مدفوعات", "תשלומים")} stroke={PAL.green} dot={false} strokeWidth={2} />
                <Line type="monotone" dataKey="confirmations" name={tt(lang, "تأكيدات", "אישורים")} stroke={PAL.gold} dot={false} strokeWidth={2} />
                <Line type="monotone" dataKey="invites" name={tt(lang, "روابط", "קישורים")} stroke={PAL.purple} dot={false} strokeWidth={2} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}
      </ChartCard>
    </Section>
  );
}
