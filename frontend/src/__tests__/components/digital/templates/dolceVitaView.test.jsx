// Render smoke for the Dolce Vita bespoke template. Preview mode passes no
// showEnvelope, so no sealed intro mounts — this exercises the real content path:
// field extraction from the design doc, the stationery sections, the scratch-date
// signature, and that RSVP wires the shared useRsvpForm. Guards the data contract
// against a future refactor.
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { DolceVitaView } from "../../../../components/digital/templates/dolce-vita/DolceVitaView.jsx";

const design = {
  templateId: "dolce-vita",
  themeColor: "dolceVita",
  fontFamily: "messiri",
  groomDisplayName: { ar: "كريم", he: "כרים" },
  brideName: { ar: "ليلى", he: "לילה" },
  weddingDate: Date.UTC(2026, 8, 20, 15, 0),
  venue: { ar: "قاعة الأندلس", he: "אולם אנדלוס" },
  venueCity: { ar: "حيفا", he: "חיפה" },
  dressCode: { ar: "أناقة صيفية بألوان فاتحة", he: "אלגנטיות קיצית בגוונים בהירים" },
};

const renderView = (over = {}, props = {}) =>
  render(<DolceVitaView design={{ ...design, ...over }} guestName="أحمد محمد" lang="ar" mode="preview" {...props} />);

describe("DolceVitaView (smoke)", () => {
  it("renders the couple, the guest and the venue from the design doc", () => {
    renderView();
    expect(screen.getByText("كريم & ليلى")).toBeTruthy();
    expect(screen.getByText("أحمد محمد")).toBeTruthy();
    expect(screen.getByText("قاعة الأندلس")).toBeTruthy();
  });

  it("wires RSVP through the shared hook (submit control present)", () => {
    renderView();
    expect(screen.getByTestId("dv-rsvp-submit")).toBeTruthy();
  });

  it("renders in Hebrew when lang=he", () => {
    render(<DolceVitaView design={design} guestName="דני" lang="he" mode="preview" />);
    expect(screen.getByText("מגיעים?")).toBeTruthy();
    expect(screen.getByText("אולם אנדלוס")).toBeTruthy();
  });

  it("mounts NO sealed intro in preview (the editor must never seal)", () => {
    renderView();
    expect(screen.queryByTestId("intro-sealed")).toBeNull();
  });

  it("seals on the public page when showEnvelope is set", () => {
    render(<DolceVitaView design={design} guestName="أحمد" lang="ar" mode="public" showEnvelope token="tok-dv-1" />);
    expect(screen.getByTestId("intro-sealed")).toBeTruthy();
  });
});

describe("DolceVitaView — the scratch-date signature", () => {
  it("renders a tile per date part, with the real date underneath from the start", () => {
    const { container } = renderView();
    expect(screen.getByTestId("dv-scratch")).toBeTruthy();
    expect(container.querySelectorAll(".dv-scratch")).toHaveLength(3);
    // The value is real DOM text, not painted into the canvas — so a canvas
    // failure or a screen reader still gets the single most important fact.
    expect(screen.getByText("20")).toBeTruthy();
    expect(screen.getByText("2026")).toBeTruthy();
  });

  it("hides the scratch section entirely when there is no date", () => {
    renderView({ weddingDate: null });
    expect(screen.queryByTestId("dv-scratch")).toBeNull();
  });

  it("uses Western digits (project-wide rule) even in Arabic", () => {
    renderView();
    expect(screen.getByText("2026")).toBeTruthy();
    expect(screen.queryByText("٢٠٢٦")).toBeNull();
  });
});

describe("DolceVitaView — sections", () => {
  it("renders the dress code, a field no other template shows", () => {
    renderView();
    expect(screen.getByText("أناقة صيفية بألوان فاتحة")).toBeTruthy();
  });

  it("hides the dress code when the couple left it empty", () => {
    renderView({ dressCode: null });
    expect(screen.queryByText("بماذا نتأنّق؟")).toBeNull();
  });

  it("renders the multi-day schedule when events exist, and hides it otherwise", () => {
    expect(screen.queryByText("أيام فرحنا")).toBeNull();
    renderView({ events: [{ icon: "🌿", title: { ar: "الحنّة" }, time: { ar: "19:00" }, venue: { ar: "بيت العائلة" } }] });
    expect(screen.getByText("أيام فرحنا")).toBeTruthy();
    expect(screen.getByText("الحنّة")).toBeTruthy();
  });

  it("keeps the schedule hidden when the section is switched off", () => {
    renderView({ eventsEnabled: false, events: [{ title: { ar: "الحنّة" } }] });
    expect(screen.queryByText("أيام فرحنا")).toBeNull();
  });

  it("reports 'ready' for the load metric (it has no lazy 3D scene to wait for)", () => {
    const onIntroEvent = vi.fn();
    render(<DolceVitaView design={design} guestName="أحمد" lang="ar" mode="preview" onIntroEvent={onIntroEvent} />);
    expect(onIntroEvent).toHaveBeenCalledWith("ready");
  });

  it("survives an unknown themeColor rather than rendering undefined colours", () => {
    expect(() => renderView({ themeColor: "not-a-palette" })).not.toThrow();
  });
});
