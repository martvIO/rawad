// Render smoke for Lumen — the quiet template. Preview mode passes no
// showEnvelope, so no sealed intro mounts. Guards the data contract and, just as
// importantly, its RESTRAINT: this template must stay effect-free.
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { LumenView } from "../../../../components/digital/templates/lumen/LumenView.jsx";

const design = {
  templateId: "lumen",
  themeColor: "lumen",
  fontFamily: "noto",
  groomDisplayName: { ar: "كريم", he: "כרים" },
  brideName: { ar: "ليلى", he: "לילה" },
  weddingDate: Date.UTC(2027, 4, 12, 17, 0),
  venue: { ar: "قاعة الأندلس", he: "אולם אנדלוס" },
  venueCity: { ar: "حيفا", he: "חיפה" },
};

const renderView = (over = {}, props = {}) =>
  render(<LumenView design={{ ...design, ...over }} guestName="أحمد محمد" lang="ar" mode="preview" {...props} />);

describe("LumenView (smoke)", () => {
  it("renders the couple, the guest and the venue from the design doc", () => {
    renderView();
    expect(screen.getByText("كريم & ليلى")).toBeTruthy();
    expect(screen.getByText("أحمد محمد")).toBeTruthy();
    expect(screen.getByText("قاعة الأندلس")).toBeTruthy();
  });

  it("wires RSVP through the shared hook", () => {
    renderView();
    expect(screen.getByTestId("lm-rsvp-submit")).toBeTruthy();
  });

  it("renders in Hebrew when lang=he", () => {
    render(<LumenView design={design} guestName="דני" lang="he" mode="preview" />);
    expect(screen.getByText("אולם אנדלוס")).toBeTruthy();
  });

  it("mounts no sealed intro in preview, and seals on the public page", () => {
    renderView();
    expect(screen.queryByTestId("intro-sealed")).toBeNull();
    render(<LumenView design={design} guestName="أحمد" lang="ar" mode="public" showEnvelope token="tok-lm-1" />);
    expect(screen.getByTestId("intro-sealed")).toBeTruthy();
  });
});

describe("LumenView — the restraint IS the design", () => {
  // This template's identity is absence. If a future change adds an ambient
  // layer or a lazy scene here, it has misunderstood the template.
  it("renders NO ambient/effects layer of any kind", () => {
    const { container } = render(
      <LumenView design={design} guestName="أحمد" lang="ar" mode="public" token="tok-lm-2" />,
    );
    expect(container.querySelector("canvas")).toBeNull();
    expect(container.querySelector(".sg-petals, .go-night, .go-vine-l, .bo-haze, .dv-sky")).toBeNull();
  });

  it("shows the WHEN?/WHERE? pair the source leads with", () => {
    renderView();
    expect(screen.getByText("متى؟")).toBeTruthy();
    expect(screen.getByText("أين؟")).toBeTruthy();
  });

  it("uses Western digits in the countdown even in Arabic", () => {
    const { container } = renderView();
    expect(container.querySelector("#lm-countdown")).toBeTruthy();
    expect(container.querySelector("#lm-countdown bdi[dir='ltr']")).toBeTruthy();
  });

  it("renders the multi-day schedule when events exist, hides it otherwise", () => {
    expect(screen.queryByText("جدول الاحتفال")).toBeNull();
    renderView({ events: [{ title: { ar: "الحنّة" }, time: { ar: "19:00" } }] });
    expect(screen.getByText("الحنّة")).toBeTruthy();
  });

  it("reports 'ready' for the load metric (nothing lazy to wait for)", () => {
    const onIntroEvent = vi.fn();
    render(<LumenView design={design} guestName="أحمد" lang="ar" mode="preview" onIntroEvent={onIntroEvent} />);
    expect(onIntroEvent).toHaveBeenCalledWith("ready");
  });

  it("survives an unknown themeColor rather than painting undefined colours", () => {
    expect(() => renderView({ themeColor: "not-a-palette" })).not.toThrow();
  });
});
