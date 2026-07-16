// Render smoke for Gilded Orchard. Preview mode passes no showEnvelope, so no
// sealed intro mounts — this exercises the content path: field extraction, the
// strung lights / fountain ornaments, and that RSVP wires the shared hook.
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { GildedOrchardView } from "../../../../components/digital/templates/gilded-orchard/GildedOrchardView.jsx";

const design = {
  templateId: "gilded-orchard",
  themeColor: "gildedOrchard",
  fontFamily: "markazi",
  groomDisplayName: { ar: "كريم", he: "כרים" },
  brideName: { ar: "ليلى", he: "לילה" },
  weddingDate: Date.UTC(2027, 4, 12, 17, 0),
  venue: { ar: "قاعة الأندلس", he: "אולם אנדלוס" },
  venueCity: { ar: "حيفا", he: "חיפה" },
};

const renderView = (over = {}, props = {}) =>
  render(<GildedOrchardView design={{ ...design, ...over }} guestName="أحمد محمد" lang="ar" mode="preview" {...props} />);

describe("GildedOrchardView (smoke)", () => {
  it("renders the couple, the guest and the venue from the design doc", () => {
    renderView();
    expect(screen.getByText("كريم & ليلى")).toBeTruthy();
    expect(screen.getByText("أحمد محمد")).toBeTruthy();
    expect(screen.getByText("قاعة الأندلس")).toBeTruthy();
  });

  it("wires RSVP through the shared hook", () => {
    renderView();
    expect(screen.getByTestId("go-rsvp-submit")).toBeTruthy();
  });

  it("renders in Hebrew when lang=he", () => {
    render(<GildedOrchardView design={design} guestName="דני" lang="he" mode="preview" />);
    expect(screen.getByText("מגיעים?")).toBeTruthy();
  });

  it("mounts no sealed intro in preview, and seals on the public page", () => {
    renderView();
    expect(screen.queryByTestId("intro-sealed")).toBeNull();
    render(<GildedOrchardView design={design} guestName="أحمد" lang="ar" mode="public" showEnvelope token="tok-go-1" />);
    expect(screen.getByTestId("intro-sealed")).toBeTruthy();
  });
});

describe("GildedOrchardView — the orchard identity", () => {
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



  it("hangs the strung lights and lights the fountain (its signature)", () => {
    const { container } = renderView();
    // Both ornaments are code-drawn SVG and must actually be in the tree.
    expect(container.querySelectorAll("svg circle").length).toBeGreaterThan(4); // bulbs
    expect(container.querySelector("svg ellipse")).toBeTruthy(); // fountain tiers/pool
  });

  it("climbs vines up the page edges on the real page only", () => {
    const { container: preview } = renderView();
    expect(preview.querySelector(".go-vine-l")).toBeNull();
    const { container: pub } = render(
      <GildedOrchardView design={design} guestName="أحمد" lang="ar" mode="public" token="tok-go-9" />,
    );
    expect(pub.querySelector(".go-vine-l")).toBeTruthy();
    expect(pub.querySelector(".go-vine-r")).toBeTruthy();
  });

  it("renders the lamplight layer", () => {
    const { container } = renderView();
    expect(container.querySelector(".go-night")).toBeTruthy();
  });
});

describe("GildedOrchardView — sections", () => {
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
    render(<GildedOrchardView design={design} guestName="أحمد" lang="ar" mode="preview" onIntroEvent={onIntroEvent} />);
    expect(onIntroEvent).toHaveBeenCalledWith("ready");
  });

  it("survives an unknown themeColor rather than painting undefined colours", () => {
    expect(() => renderView({ themeColor: "not-a-palette" })).not.toThrow();
  });
});
