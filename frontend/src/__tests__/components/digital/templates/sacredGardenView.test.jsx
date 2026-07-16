// Render smoke for The Sacred Garden. Preview mode passes no showEnvelope, so no
// sealed intro mounts — this exercises the content path: field extraction, the
// torn-paper bands, the botanical ornaments, and that RSVP wires the shared hook.
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { SacredGardenView } from "../../../../components/digital/templates/sacred-garden/SacredGardenView.jsx";

const design = {
  templateId: "sacred-garden",
  themeColor: "sacredGarden",
  fontFamily: "reem",
  groomDisplayName: { ar: "كريم", he: "כרים" },
  brideName: { ar: "ليلى", he: "לילה" },
  weddingDate: Date.UTC(2027, 4, 12, 17, 0),
  venue: { ar: "قاعة الأندلس", he: "אולם אנדלוס" },
  venueCity: { ar: "حيفا", he: "חיפה" },
};

const renderView = (over = {}, props = {}) =>
  render(<SacredGardenView design={{ ...design, ...over }} guestName="أحمد محمد" lang="ar" mode="preview" {...props} />);

describe("SacredGardenView (smoke)", () => {
  it("renders the couple, the guest and the venue from the design doc", () => {
    renderView();
    expect(screen.getByText("كريم & ليلى")).toBeTruthy();
    expect(screen.getByText("أحمد محمد")).toBeTruthy();
    expect(screen.getByText("قاعة الأندلس")).toBeTruthy();
  });

  it("wires RSVP through the shared hook", () => {
    renderView();
    expect(screen.getByTestId("sg-rsvp-submit")).toBeTruthy();
  });

  it("renders in Hebrew when lang=he", () => {
    render(<SacredGardenView design={design} guestName="דני" lang="he" mode="preview" />);
    expect(screen.getByText("מגיעים?")).toBeTruthy();
  });

  it("mounts no sealed intro in preview, and seals on the public page", () => {
    renderView();
    expect(screen.queryByTestId("intro-sealed")).toBeNull();
    render(<SacredGardenView design={design} guestName="أحمد" lang="ar" mode="public" showEnvelope token="tok-sg-1" />);
    expect(screen.getByTestId("intro-sealed")).toBeTruthy();
  });
});

describe("SacredGardenView — the garden identity", () => {
  // The source opens on the Bismillah; our equivalent slot is the existing
  // `blessing` field, which leads the hero rather than being buried.
  it("leads the hero with the blessing, defaulting when the couple left it blank", () => {
    renderView();
    expect(screen.getByText("على بركة الله")).toBeTruthy();
  });

  it("uses the couple's own blessing when they wrote one", () => {
    renderView({ blessing: { ar: "بسم الله الرحمن الرحيم" } });
    expect(screen.getByText("بسم الله الرحمن الرحيم")).toBeTruthy();
    expect(screen.queryByText("على بركة الله")).toBeNull();
  });

  it("stamps the wax seal with the couple's monogram", () => {
    render(<SacredGardenView design={{ ...design, monogram: "ك&ل" }} guestName="أحمد" lang="ar" mode="public" showEnvelope token="tok-sg-2" />);
    expect(screen.getByText("ك&ل")).toBeTruthy();
  });

  it("derives a monogram from the names when none is set", () => {
    render(<SacredGardenView design={design} guestName="أحمد" lang="ar" mode="public" showEnvelope token="tok-sg-3" />);
    expect(screen.getByText("ك&ل")).toBeTruthy();
  });

  it("drifts petals only on the public page (never in the editor preview)", () => {
    const { container: preview } = renderView();
    expect(preview.querySelector(".sg-petals")).toBeNull();
    const { container: pub } = render(
      <SacredGardenView design={design} guestName="أحمد" lang="ar" mode="public" token="tok-sg-4" />,
    );
    expect(pub.querySelector(".sg-petals")).toBeTruthy();
  });
});

describe("SacredGardenView — sections", () => {
  it("renders the multi-day schedule when events exist, hides it otherwise", () => {
    expect(screen.queryByText("أيام فرحنا")).toBeNull();
    renderView({ events: [{ icon: "🌿", title: { ar: "الحنّة" }, time: { ar: "19:00" } }] });
    expect(screen.getByText("أيام فرحنا")).toBeTruthy();
    expect(screen.getByText("الحنّة")).toBeTruthy();
  });

  it("keeps the schedule hidden when switched off", () => {
    renderView({ eventsEnabled: false, events: [{ title: { ar: "الحنّة" } }] });
    expect(screen.queryByText("أيام فرحنا")).toBeNull();
  });

  it("renders the dress code only when set", () => {
    renderView();
    expect(screen.queryByText("بماذا نتأنّق؟")).toBeNull();
    renderView({ dressCode: { ar: "أناقة كلاسيكية" } });
    expect(screen.getByText("أناقة كلاسيكية")).toBeTruthy();
  });

  it("reports 'ready' for the load metric (no lazy 3D scene to wait for)", () => {
    const onIntroEvent = vi.fn();
    render(<SacredGardenView design={design} guestName="أحمد" lang="ar" mode="preview" onIntroEvent={onIntroEvent} />);
    expect(onIntroEvent).toHaveBeenCalledWith("ready");
  });

  it("survives an unknown themeColor rather than painting undefined colours", () => {
    expect(() => renderView({ themeColor: "not-a-palette" })).not.toThrow();
  });
});
