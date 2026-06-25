// RTL test for the groom portal router — verifies the physical beta gate:
// while FEATURES.physical is OFF, grooms whose saved mode is "handwritten" are
// bounced to type-select, and direct /handwritten/* URLs are redirected too.
// The three child portals are mocked to simple markers so we only test routing.
import React from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter, Routes, Route } from "react-router-dom";

const { features } = vi.hoisted(() => ({ features: { physical: false } }));
vi.mock("../../config/index.js", () => ({ FEATURES: features }));

// NOTE: vi.mock is hoisted above the ESM imports, so the factories can't close
// over a module-scope helper (it'd be in the TDZ). Inline React.createElement.
const mk = (label) => React.createElement("div", { "data-testid": "marker" }, label);
vi.mock("../../pages/portal/groom/GroomTypeSelect.jsx", () => ({ GroomTypeSelect: () => mk("TYPE_SELECT") }));
vi.mock("../../pages/portal/groom/GroomHandwrittenShell.jsx", () => ({ GroomHandwrittenShell: () => mk("HANDWRITTEN") }));
vi.mock("../../pages/portal/groom/digital/DigitalPortal.jsx", () => ({ DigitalPortal: () => mk("DIGITAL") }));

import { GroomPortalView } from "../../pages/portal/groom/GroomPortalView.jsx";
import { STORAGE_KEYS } from "../../constants/storageKeys.js";

const renderAt = (entry) =>
  render(
    React.createElement(
      MemoryRouter,
      { initialEntries: [entry] },
      React.createElement(
        Routes,
        null,
        React.createElement(Route, { path: "/portal/groom/*", element: React.createElement(GroomPortalView) }),
      ),
    ),
  );

beforeEach(() => {
  features.physical = false;
  localStorage.clear();
});
afterEach(() => localStorage.clear());

describe("<GroomPortalView> physical beta gate", () => {
  it("bounces a saved-handwritten groom to type-select while the flag is OFF", async () => {
    localStorage.setItem(STORAGE_KEYS.GROOM_TYPE, "handwritten");
    renderAt("/portal/groom");
    expect(await screen.findByTestId("marker")).toHaveTextContent("TYPE_SELECT");
  });

  it("routes a saved-handwritten groom to the handwritten shell when the flag is ON", async () => {
    features.physical = true;
    localStorage.setItem(STORAGE_KEYS.GROOM_TYPE, "handwritten");
    renderAt("/portal/groom");
    expect(await screen.findByTestId("marker")).toHaveTextContent("HANDWRITTEN");
  });

  it("redirects a direct /handwritten/* URL to type-select while the flag is OFF", async () => {
    renderAt("/portal/groom/handwritten/dashboard");
    expect(await screen.findByTestId("marker")).toHaveTextContent("TYPE_SELECT");
  });

  it("serves the handwritten shell on a direct URL when the flag is ON", async () => {
    features.physical = true;
    renderAt("/portal/groom/handwritten/dashboard");
    expect(await screen.findByTestId("marker")).toHaveTextContent("HANDWRITTEN");
  });

  it("always routes a saved-digital groom to the digital portal", async () => {
    localStorage.setItem(STORAGE_KEYS.GROOM_TYPE, "digital");
    renderAt("/portal/groom");
    expect(await screen.findByTestId("marker")).toHaveTextContent("DIGITAL");
  });
});
