// RTL test for the groom type-select screen — verifies the physical/handwritten
// track is gated behind FEATURES.physical and shows a BETA badge when active.
// usePortal, useNavigate, and the config FEATURES flag are mocked so we drive state.
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";

// Mutable flag ref so each test can flip the build-time gate before rendering.
const { features } = vi.hoisted(() => ({ features: { physical: false } }));
vi.mock("../../config/index.js", () => ({ FEATURES: features }));

const { portal } = vi.hoisted(() => ({ portal: { current: {} } }));
vi.mock("../../context/PortalContext.jsx", () => ({
  usePortal: () => portal.current,
}));
vi.mock("react-router-dom", () => ({ useNavigate: () => vi.fn() }));

import { GroomTypeSelect } from "../../pages/portal/groom/GroomTypeSelect.jsx";

beforeEach(() => {
  portal.current = { lang: "ar", onBack: vi.fn() };
  features.physical = false;
});

describe("<GroomTypeSelect>", () => {
  it("hides the handwritten option when the physical feature is OFF", () => {
    features.physical = false;
    render(<GroomTypeSelect />);
    expect(screen.queryByTestId("btn-type-handwritten")).toBeNull();
    // Digital always remains available.
    expect(screen.getByTestId("btn-type-digital")).toBeInTheDocument();
  });

  it("shows the handwritten option with a BETA badge when the physical feature is ON", () => {
    features.physical = true;
    render(<GroomTypeSelect />);
    const handwritten = screen.getByTestId("btn-type-handwritten");
    expect(handwritten).toBeInTheDocument();
    expect(handwritten).toHaveTextContent("تجريبي"); // Arabic "beta"
  });

  it("renders the Hebrew BETA badge when lang is he", () => {
    features.physical = true;
    portal.current = { lang: "he", onBack: vi.fn() };
    render(<GroomTypeSelect />);
    expect(screen.getByTestId("btn-type-handwritten")).toHaveTextContent("בטא");
  });
});
