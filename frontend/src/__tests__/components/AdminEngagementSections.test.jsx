import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import {
  DigitalFunnel, LoadPerformance, TemplateMetrics, WeddingEngagement, DemoEngagement,
} from "../../pages/portal/admin/AdminEngagementSections.jsx";

// recharts needs a real layout box; jsdom reports 0×0 and the ResponsiveContainer
// then renders nothing. Stub it to a fixed size so the charts mount.
vi.mock("recharts", async (importActual) => {
  const actual = await importActual();
  return {
    ...actual,
    ResponsiveContainer: ({ children }) => <div style={{ width: 400, height: 200 }}>{children}</div>,
  };
});

describe("DigitalFunnel", () => {
  const data = {
    funnel: { sent: 4, opened: 3, submitted: 2, attending: 1, absent: 1, openedNoAnswer: 1, neverOpened: 1 },
    openRatePct: 75, completionRatePct: 50, answerRateOfOpenedPct: 67,
    sendToOpenLagMs: { p50: 7200000, p90: null, n: 2 },
    tapDelayMs: { p50: 3000, p90: null, n: 1 },
    guestRows: [], guestRowsTruncated: 0,
  };

  it("surfaces the two drop-off buckets the owner asked for", () => {
    render(<DigitalFunnel data={data} lang="ar" />);
    expect(screen.getByText("فتحوا ولم يجيبوا")).toBeTruthy();
    expect(screen.getByText("لم يفتحوا أبداً")).toBeTruthy();
  });

  it("renders the rates", () => {
    render(<DigitalFunnel data={data} lang="ar" />);
    expect(screen.getByText("نسبة الفتح")).toBeTruthy();
    expect(screen.getByText("نسبة التعبئة")).toBeTruthy();
  });

  it("localizes to Hebrew", () => {
    render(<DigitalFunnel data={data} lang="he" />);
    expect(screen.getByText(/משפך ההזמנות הדיגיטליות/)).toBeTruthy();
  });

  it("renders nothing rather than crashing with no data", () => {
    const { container } = render(<DigitalFunnel data={null} lang="ar" />);
    expect(container.firstChild).toBeNull();
  });

  it("shows an empty state instead of a chart when nothing has been sent", () => {
    render(<DigitalFunnel data={{ ...data, funnel: { ...data.funnel, sent: 0 } }} lang="ar" />);
    expect(screen.getByText("لا توجد بيانات بعد")).toBeTruthy();
  });
});

describe("LoadPerformance", () => {
  const rows = [
    { templateId: "classic", loads: 10, sealedP90: 1800, readyP90: 4000, lcpP75: 2200, inpP75: 120, tapDelayP50: 2500, tapKinds: { tap: 3, auto: 7 } },
    { templateId: "destination-love", loads: 5, sealedP90: 900, readyP90: null, lcpP75: null, inpP75: null, tapDelayP50: null, tapKinds: { tap: 5 } },
  ];

  it("headlines the WORST p90 across templates, not a flattering average", () => {
    render(<LoadPerformance data={{ rows }} lang="ar" />);
    // classic's 4000ms readyP90 is the worst → shown as 4 s.
    expect(screen.getByText("4 s")).toBeTruthy();
    expect(screen.getByText("1.8 s")).toBeTruthy(); // worst sealedP90
  });

  it("renders an em-dash for a percentile with no sample, never a fake zero", () => {
    render(<LoadPerformance data={{ rows: [{ templateId: "x", loads: 0, sealedP90: null, readyP90: null, lcpP75: null, inpP75: null, tapDelayP50: null, tapKinds: {} }] }} lang="ar" />);
    expect(screen.getAllByText("—").length).toBeGreaterThan(0);
  });

  it("reports the auto-open share — the ritual failing, not succeeding", () => {
    render(<LoadPerformance data={{ rows }} lang="ar" />);
    expect(screen.getByText("فُتحت تلقائياً (بدون ضغط)")).toBeTruthy();
    // Across BOTH templates: 8 taps + 7 autos = 15 opens → 47% auto-opened.
    expect(screen.getByText("47%")).toBeTruthy();
  });

  it("renders nothing when no template has been measured", () => {
    const { container } = render(<LoadPerformance data={{ rows: [] }} lang="ar" />);
    expect(container.firstChild).toBeNull();
  });
});

describe("TemplateMetrics", () => {
  const data = {
    rows: [
      { templateId: "classic", sent: 10, opened: 8, submitted: 5, openRatePct: 80, completionRatePct: 50, loads: 8, sealedP50: 700, readyP90: 3000, autoOpenPct: 60 },
      { templateId: "destination-love", sent: 4, opened: 4, submitted: 3, openRatePct: 100, completionRatePct: 75, loads: 4, sealedP50: 500, readyP90: null, autoOpenPct: null },
    ],
  };

  it("lists every measured template with its funnel", () => {
    render(<TemplateMetrics data={data} lang="ar" />);
    expect(screen.getAllByText("classic").length).toBeGreaterThan(0);
    expect(screen.getAllByText("destination-love").length).toBeGreaterThan(0);
  });

  it("states that demo views are excluded (so the number is not misread)", () => {
    render(<TemplateMetrics data={data} lang="ar" />);
    expect(screen.getByText(/زيارات العرض التجريبي غير محتسبة/)).toBeTruthy();
  });

  it("shows an empty state with no templates", () => {
    render(<TemplateMetrics data={{ rows: [] }} lang="ar" />);
    expect(screen.getAllByText("لا توجد بيانات بعد").length).toBeGreaterThan(0);
  });
});

describe("WeddingEngagement", () => {
  it("lists per-groom rows by username", () => {
    render(<WeddingEngagement data={{ rows: [{ groomUid: "g1", groomUsername: "sally", sent: 10, opened: 7, submitted: 4, openRatePct: 70, completionRatePct: 40, medianLagMs: 3600000 }], truncated: 0 }} lang="ar" />);
    expect(screen.getByText("sally")).toBeTruthy();
  });

  it("discloses truncation rather than silently dropping weddings", () => {
    render(<WeddingEngagement data={{ rows: [{ groomUid: "g1", groomUsername: "sally", sent: 1, opened: 1, submitted: 1, openRatePct: 100, completionRatePct: 100, medianLagMs: null }], truncated: 30 }} lang="ar" />);
    expect(screen.getByText(/\+30/)).toBeTruthy();
  });
});

describe("DemoEngagement", () => {
  const data = {
    totalLoads: 5,
    bySurface: { demo: 3, gallery: 2 },
    byTemplate: [{ templateId: "destination-love", loads: 3 }],
    sealedP50: 600,
    series: [{ t: Date.UTC(2026, 6, 16), count: 5 }],
  };

  it("labels prospect traffic as excluded from the wedding numbers", () => {
    render(<DemoEngagement data={data} lang="ar" />);
    expect(screen.getByText(/ليست دعوات حقيقية/)).toBeTruthy();
  });

  it("splits demo vs gallery", () => {
    render(<DemoEngagement data={data} lang="ar" />);
    expect(screen.getByText("عرض تجريبي")).toBeTruthy();
    expect(screen.getByText("معرض القوالب")).toBeTruthy();
  });

  it("renders nothing rather than crashing with no data", () => {
    const { container } = render(<DemoEngagement data={null} lang="ar" />);
    expect(container.firstChild).toBeNull();
  });

  it("shows an empty state with zero prospect traffic", () => {
    render(<DemoEngagement data={{ ...data, totalLoads: 0, byTemplate: [], series: [] }} lang="ar" />);
    expect(screen.getAllByText("لا توجد بيانات بعد").length).toBeGreaterThan(0);
  });
});
