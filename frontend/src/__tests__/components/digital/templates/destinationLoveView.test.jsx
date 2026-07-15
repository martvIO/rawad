// Render smoke for the Destination Love bespoke template. In jsdom there is no
// WebGL (tier 0) and preview mode passes no showEnvelope, so only the 2D floor
// renders and no sealed intro mounts — this exercises the real content path:
// field extraction from the design doc, the boarding-pass sections, and that
// the RSVP wires the shared useRsvpForm (submit control present). Guards that a
// future refactor can't silently break the template's data contract.
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { DestinationLoveView } from "../../../../components/digital/templates/destination-love/DestinationLoveView.jsx";

const design = {
  templateId: "destination-love",
  themeColor: "voyage",
  fontFamily: "aref",
  groomDisplayName: { ar: "كريم", he: "כרים" },
  brideName: { ar: "ليلى", he: "ליلה" },
  weddingDate: Date.UTC(2026, 8, 20, 15, 0),
  venue: { ar: "قاعة الأندلس", he: "אולם אנדלוס" },
  venueCity: { ar: "حيفا", he: "חיפה" },
  storyTimeline: [{ when: "18:00", title: { ar: "الاستقبال", he: "קבלת פנים" }, body: { ar: "", he: "" } }],
};

describe("DestinationLoveView (smoke)", () => {
  it("renders the guest name, couple names, and the RSVP (shared useRsvpForm)", () => {
    render(
      <DestinationLoveView
        design={design}
        guestName="محمد"
        lang="ar"
        mode="preview"
      />,
    );
    // Guest greeting + couple names appear (extracted via localize).
    expect(screen.getAllByText("محمد").length).toBeGreaterThan(0);
    expect(screen.getAllByText(/كريم/).length).toBeGreaterThan(0);
    // RSVP is present and wired to the shared submit control.
    expect(screen.getByTestId("dl-rsvp-submit")).toBeInTheDocument();
    // No sealed intro in preview mode (showEnvelope not passed).
    expect(screen.queryByTestId("intro-sealed")).toBeNull();
  });

  it("renders in Hebrew when lang=he", () => {
    render(<DestinationLoveView design={design} guestName="דנה" lang="he" mode="preview" />);
    expect(screen.getAllByText(/כרים/).length).toBeGreaterThan(0);
  });
});
