// The guest-experience sections of the admin analytics page: the digital funnel,
// load performance, per-template comparison, per-wedding engagement, and (kept
// visually separate) prospect/demo traffic.
//
// Split out of AdminAnalytics.jsx purely for file size — these render the same
// pre-computed payload from GET /admin/analytics and reuse its primitives, so
// nothing here computes a metric. recharts is LTR-only, so every chart sits in a
// `dir="ltr"` wrapper while the RTL chrome stays Arabic/Hebrew.
//
// Honesty notes carried through from the aggregator (do not "fix" these into
// friendlier numbers):
//   • A timing percentile is a bucket UPPER EDGE ("p90 ≤ 4s"), and is null when
//     it lands in the open-ended tail — rendered "—", never invented.
//   • Only a real guest TAP counts toward tap-delay; auto-opens are reported
//     separately, because an auto-open is the ritual failing, not succeeding.
//   • Demo/gallery traffic is prospect traffic and is NEVER mixed into the guest
//     funnel or a template's guest-facing timings.
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  LineChart, Line, Cell,
} from "recharts";
import { C } from "../../../styles/theme.js";
import { Num } from "../../../components/Num.jsx";

const tt = (lang, ar, he) => (lang === "he" ? he : ar);

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

/** A millisecond duration, or an em-dash when we genuinely don't know. */
function fmtMs(ms) {
  if (ms === null || ms === undefined || !Number.isFinite(ms)) return "—";
  if (ms < 1000) return `${Math.round(ms)} ms`;
  return `${(Math.round(ms / 100) / 10).toLocaleString("en")} s`;
}

/** A send→open lag, which runs in hours/days rather than milliseconds. */
function fmtLag(ms, lang) {
  if (ms === null || ms === undefined || !Number.isFinite(ms)) return "—";
  const mins = ms / 60000;
  if (mins < 60) return `${Math.round(mins)} ${tt(lang, "دقيقة", "דקות")}`;
  const hours = mins / 60;
  if (hours < 48) return `${Math.round(hours)} ${tt(lang, "ساعة", "שעות")}`;
  return `${(Math.round((hours / 24) * 10) / 10).toLocaleString("en")} ${tt(lang, "يوم", "ימים")}`;
}

function Section({ icon, title, note, children }) {
  return (
    <div style={{ marginBottom: 26 }}>
      <div style={{ fontSize: 15, fontWeight: 900, color: C.gold, fontFamily: "'Amiri','Frank Ruhl Libre','Amiri Fallback',serif", marginBottom: note ? 4 : 10 }}>
        {icon} {title}
      </div>
      {note && <div style={{ fontSize: 11, color: C.dim, marginBottom: 10, lineHeight: 1.6 }}>{note}</div>}
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

function Kpi({ label, value, color, suffix, raw }) {
  return (
    <div className="card" style={{ padding: "14px 10px", textAlign: "center" }}>
      <div style={{ fontSize: 20, fontWeight: 900, color: color || C.goldLight, lineHeight: 1.1 }}>
        {raw ? <span dir="ltr">{value}</span> : <Num>{value}</Num>}
        {suffix ? <span style={{ fontSize: 13, fontWeight: 700 }}> {suffix}</span> : null}
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

/** A compact RTL table. Numeric cells are isolated so digits read correctly. */
function Table({ head, rows, empty, lang }) {
  if (!rows.length) return <EmptyChart lang={lang} />;
  return (
    <div style={{ overflowX: "auto" }}>
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11.5 }}>
        <thead>
          <tr>
            {head.map((h) => (
              <th key={h} style={{ textAlign: "start", padding: "6px 8px", color: C.goldDim, fontWeight: 800, borderBottom: "1px solid rgba(255,255,255,.08)", whiteSpace: "nowrap" }}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((cells, i) => (
            <tr key={i}>
              {cells.map((c, j) => (
                <td key={j} style={{ padding: "6px 8px", color: j === 0 ? C.goldLight : C.dim, borderBottom: "1px solid rgba(255,255,255,.04)", whiteSpace: "nowrap" }}>{c}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      {empty}
    </div>
  );
}

// ─── The digital RSVP funnel ────────────────────────────────────────────────────

export function DigitalFunnel({ data, lang }) {
  if (!data) return null;
  const f = data.funnel || {};
  const bars = [
    { name: tt(lang, "أُرسلت", "נשלחו"), value: f.sent || 0, color: PAL.blue },
    { name: tt(lang, "فُتحت", "נפתחו"), value: f.opened || 0, color: PAL.amber },
    { name: tt(lang, "أجابوا", "ענו"), value: f.submitted || 0, color: PAL.green },
  ];
  const hasData = (f.sent || 0) > 0;
  return (
    <Section
      icon="🔻"
      title={tt(lang, "قمع الدعوات الرقمية", "משפך ההזמנות הדיגיטליות")}
      note={tt(
        lang,
        "من الإرسال إلى الفتح إلى تعبئة نموذج «هل ستحضر؟». أي إجابة (حاضر أو غير حاضر) تُحتسب تعبئة مكتملة.",
        "משליחה, לפתיחה, ועד מילוי טופס «מגיעים?». כל תשובה (מגיע או לא) נחשבת מילוי מלא.",
      )}
    >
      <KpiGrid cols={4}>
        <Kpi label={tt(lang, "نسبة الفتح", "אחוז פתיחה")} value={enNum(data.openRatePct)} suffix="%" color={PAL.amber} />
        <Kpi label={tt(lang, "نسبة التعبئة", "אחוז מילוי")} value={enNum(data.completionRatePct)} suffix="%" color={PAL.green} />
        <Kpi label={tt(lang, "فتحوا ولم يجيبوا", "פתחו ולא ענו")} value={enNum(f.openedNoAnswer)} color={PAL.amber} />
        <Kpi label={tt(lang, "لم يفتحوا أبداً", "לא פתחו כלל")} value={enNum(f.neverOpened)} color={PAL.red} />
      </KpiGrid>
      <ChartCard title={tt(lang, "المراحل", "השלבים")}>
        {hasData ? (
          <div dir="ltr">
            <ResponsiveContainer width="100%" height={190}>
              <BarChart data={bars} layout="vertical" margin={{ left: 40, right: 16 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,.06)" />
                <XAxis type="number" tick={AXIS_TICK} allowDecimals={false} />
                <YAxis type="category" dataKey="name" tick={AXIS_TICK} width={70} />
                <Tooltip contentStyle={TOOLTIP_STYLE} cursor={{ fill: "rgba(255,255,255,.03)" }} />
                <Bar dataKey="value" radius={[0, 4, 4, 0]}>
                  {bars.map((b) => <Cell key={b.name} fill={b.color} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        ) : <EmptyChart lang={lang} />}
      </ChartCard>
      <KpiGrid cols={3}>
        <Kpi label={tt(lang, "حاضر", "מגיע")} value={enNum(f.attending)} color={PAL.green} />
        <Kpi label={tt(lang, "غير حاضر", "לא מגיע")} value={enNum(f.absent)} color={PAL.red} />
        <Kpi
          label={tt(lang, "وسيط زمن الفتح بعد الإرسال", "חציון זמן עד פתיחה")}
          value={fmtLag(data.sendToOpenLagMs?.p50, lang)} raw color={PAL.blue}
        />
      </KpiGrid>
    </Section>
  );
}

// ─── Load performance ───────────────────────────────────────────────────────────

export function LoadPerformance({ data, lang }) {
  // Aggregated across templates for the headline; the per-template table below
  // is where a slow template actually gets identified.
  const rows = data?.rows || [];
  if (!rows.length) return null;
  const totalLoads = rows.reduce((s, r) => s + (r.loads || 0), 0);
  // Pick the worst (highest) p90 across templates — the headline should reflect
  // the worst experience being shipped, not a flattering average.
  const worst = (key) => rows.reduce((m, r) => (r[key] != null && (m == null || r[key] > m) ? r[key] : m), null);
  const taps = rows.reduce((s, r) => s + (r.tapKinds?.tap || 0), 0);
  const autos = rows.reduce((s, r) => s + (r.tapKinds?.auto || 0), 0);
  const autoPct = taps + autos > 0 ? Math.round((autos / (taps + autos)) * 100) : null;

  return (
    <Section
      icon="⚡"
      title={tt(lang, "أداء التحميل", "ביצועי טעינה")}
      note={tt(
        lang,
        "زمن ظهور المكتوب المغلق، وزمن الجهوزية الكاملة (مع المؤثرات ثلاثية الأبعاد). القيم تقريبية إلى أعلى حدّ للشريحة، و«—» تعني لا توجد عيّنة كافية.",
        "הזמן עד שהמעטפה האטומה נראית, והזמן עד מוכנות מלאה (כולל האפקטים התלת-ממדיים). הערכים הם גבול עליון של הפלח, ו-«—» = אין מדגם מספיק.",
      )}
    >
      <KpiGrid cols={4}>
        <Kpi label={tt(lang, "تحميلات مقاسة", "טעינות שנמדדו")} value={enNum(totalLoads)} color={PAL.blue} />
        <Kpi label={tt(lang, "ظهور المكتوب (p90)", "הופעת המעטפה (p90)")} value={fmtMs(worst("sealedP90"))} raw color={PAL.amber} />
        <Kpi label={tt(lang, "جاهز كلياً (p90)", "מוכן לגמרי (p90)")} value={fmtMs(worst("readyP90"))} raw color={PAL.amber} />
        <Kpi label={tt(lang, "LCP (p75)", "LCP (p75)")} value={fmtMs(worst("lcpP75"))} raw color={PAL.purple} />
      </KpiGrid>
      <KpiGrid cols={3}>
        <Kpi label={tt(lang, "INP (p75)", "INP (p75)")} value={fmtMs(worst("inpP75"))} raw color={PAL.purple} />
        <Kpi label={tt(lang, "وسيط زمن الضغط للفتح", "חציון זמן עד לחיצה")} value={fmtMs(worst("tapDelayP50"))} raw color={PAL.gold} />
        {/* An auto-open means the guest never tapped — the ritual didn't land. */}
        <Kpi
          label={tt(lang, "فُتحت تلقائياً (بدون ضغط)", "נפתחו אוטומטית (ללא לחיצה)")}
          value={autoPct === null ? "—" : `${enNum(autoPct)}%`} raw
          color={autoPct !== null && autoPct > 50 ? PAL.red : PAL.dim}
        />
      </KpiGrid>
    </Section>
  );
}

// ─── Per-template comparison ────────────────────────────────────────────────────

export function TemplateMetrics({ data, lang }) {
  const rows = data?.rows || [];
  const chartRows = rows.filter((r) => r.sent > 0);
  return (
    <Section
      icon="🎨"
      title={tt(lang, "أداء القوالب", "ביצועי התבניות")}
      note={tt(
        lang,
        "مقارنة بين القوالب: نسبة الفتح والتعبئة (من دعوات حقيقية)، وسرعة التحميل. زيارات العرض التجريبي غير محتسبة هنا.",
        "השוואה בין תבניות: אחוזי פתיחה ומילוי (מהזמנות אמיתיות) ומהירות טעינה. צפיות הדגמה אינן נכללות כאן.",
      )}
    >
      <ChartCard title={tt(lang, "نسبة الفتح مقابل التعبئة", "אחוז פתיחה מול מילוי")}>
        {chartRows.length ? (
          <div dir="ltr">
            <ResponsiveContainer width="100%" height={210}>
              <BarChart data={chartRows} margin={{ left: 0, right: 16 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,.06)" />
                <XAxis dataKey="templateId" tick={AXIS_TICK} />
                <YAxis tick={AXIS_TICK} unit="%" domain={[0, 100]} />
                <Tooltip contentStyle={TOOLTIP_STYLE} cursor={{ fill: "rgba(255,255,255,.03)" }} />
                <Bar dataKey="openRatePct" name={tt(lang, "فتح", "פתיחה")} fill={PAL.amber} radius={[4, 4, 0, 0]} />
                <Bar dataKey="completionRatePct" name={tt(lang, "تعبئة", "מילוי")} fill={PAL.green} radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        ) : <EmptyChart lang={lang} />}
      </ChartCard>
      <ChartCard title={tt(lang, "التفاصيل", "פירוט")}>
        <Table
          lang={lang}
          head={[
            tt(lang, "القالب", "תבנית"),
            tt(lang, "أُرسلت", "נשלחו"),
            tt(lang, "فتح %", "פתיחה %"),
            tt(lang, "تعبئة %", "מילוי %"),
            tt(lang, "تحميلات", "טעינות"),
            tt(lang, "مكتوب p50", "מעטפה p50"),
            tt(lang, "جاهز p90", "מוכן p90"),
            tt(lang, "تلقائي %", "אוטומטי %"),
          ]}
          rows={rows.map((r) => [
            r.templateId,
            <Num key="s">{enNum(r.sent)}</Num>,
            <Num key="o">{enNum(r.openRatePct)}</Num>,
            <Num key="c">{enNum(r.completionRatePct)}</Num>,
            <Num key="l">{enNum(r.loads)}</Num>,
            <span key="sp" dir="ltr">{fmtMs(r.sealedP50)}</span>,
            <span key="rp" dir="ltr">{fmtMs(r.readyP90)}</span>,
            <span key="ap" dir="ltr">{r.autoOpenPct === null ? "—" : `${r.autoOpenPct}%`}</span>,
          ])}
        />
      </ChartCard>
    </Section>
  );
}

// ─── Per-wedding engagement ─────────────────────────────────────────────────────

export function WeddingEngagement({ data, lang }) {
  const rows = data?.rows || [];
  return (
    <Section
      icon="💍"
      title={tt(lang, "تفاعل الأعراس", "מעורבות החתונות")}
      note={tt(lang, "لكل عرس: هل تصل الدعوات وتُفتح ويُردّ عليها؟", "לכל חתונה: האם ההזמנות מגיעות, נפתחות ונענות?")}
    >
      <ChartCard>
        <Table
          lang={lang}
          head={[
            tt(lang, "العريس", "החתן"),
            tt(lang, "أُرسلت", "נשלחו"),
            tt(lang, "فُتحت", "נפתחו"),
            tt(lang, "أجابوا", "ענו"),
            tt(lang, "فتح %", "פתיחה %"),
            tt(lang, "تعبئة %", "מילוי %"),
            tt(lang, "وسيط الفتح", "חציון פתיחה"),
          ]}
          rows={rows.map((r) => [
            r.groomUsername,
            <Num key="s">{enNum(r.sent)}</Num>,
            <Num key="o">{enNum(r.opened)}</Num>,
            <Num key="c">{enNum(r.submitted)}</Num>,
            <Num key="op">{enNum(r.openRatePct)}</Num>,
            <Num key="cp">{enNum(r.completionRatePct)}</Num>,
            <span key="lg" dir="ltr">{fmtLag(r.medianLagMs, lang)}</span>,
          ])}
          empty={
            data?.truncated > 0 ? (
              <div style={{ fontSize: 10.5, color: C.dim, padding: "8px 4px" }}>
                {tt(lang, `+${data.truncated} أخرى غير معروضة`, `+${data.truncated} נוספות שאינן מוצגות`)}
              </div>
            ) : null
          }
        />
      </ChartCard>
    </Section>
  );
}

// ─── Prospect / demo traffic (deliberately separate) ────────────────────────────

export function DemoEngagement({ data, lang }) {
  if (!data) return null;
  const series = (data.series || []).map((b) => ({
    t: new Date(b.t).toLocaleDateString(lang === "he" ? "he-IL" : "ar", { day: "numeric", month: "short", numberingSystem: "latn" }),
    count: b.count,
  }));
  const hasData = (data.totalLoads || 0) > 0;
  return (
    <Section
      icon="👀"
      title={tt(lang, "تصفّح العملاء المحتملين", "עיון של לקוחות פוטנציאליים")}
      note={tt(
        lang,
        "زيارات معرض القوالب والعروض التجريبية — ليست دعوات حقيقية، ولا تدخل في أرقام الأعراس أعلاه.",
        "צפיות בגלריית התבניות ובהדגמות — אינן הזמנות אמיתיות ואינן נכללות במספרי החתונות שלמעלה.",
      )}
    >
      <KpiGrid cols={3}>
        <Kpi label={tt(lang, "إجمالي الزيارات", "סה״כ צפיות")} value={enNum(data.totalLoads)} color={PAL.purple} />
        <Kpi label={tt(lang, "عرض تجريبي", "הדגמה")} value={enNum(data.bySurface?.demo)} color={PAL.blue} />
        <Kpi label={tt(lang, "معرض القوالب", "גלריית התבניות")} value={enNum(data.bySurface?.gallery)} color={PAL.gold} />
      </KpiGrid>
      <ChartCard title={tt(lang, "الزيارات عبر الزمن", "צפיות לאורך זמן")}>
        {hasData ? (
          <div dir="ltr">
            <ResponsiveContainer width="100%" height={180}>
              <LineChart data={series}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,.06)" />
                <XAxis dataKey="t" tick={AXIS_TICK} minTickGap={24} />
                <YAxis tick={AXIS_TICK} allowDecimals={false} />
                <Tooltip contentStyle={TOOLTIP_STYLE} />
                <Line type="monotone" dataKey="count" stroke={PAL.purple} strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        ) : <EmptyChart lang={lang} />}
      </ChartCard>
      <ChartCard title={tt(lang, "القوالب الأكثر تجربةً", "התבניות שנוסו הכי הרבה")}>
        {data.byTemplate?.length ? (
          <div dir="ltr">
            <ResponsiveContainer width="100%" height={170}>
              <BarChart data={data.byTemplate}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,.06)" />
                <XAxis dataKey="templateId" tick={AXIS_TICK} />
                <YAxis tick={AXIS_TICK} allowDecimals={false} />
                <Tooltip contentStyle={TOOLTIP_STYLE} cursor={{ fill: "rgba(255,255,255,.03)" }} />
                <Bar dataKey="loads" fill={PAL.purple} radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        ) : <EmptyChart lang={lang} />}
      </ChartCard>
    </Section>
  );
}
