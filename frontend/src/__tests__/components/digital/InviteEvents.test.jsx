import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { EventsSection } from "../../../components/digital/sections/InviteEvents.jsx";
import { getDigitalTheme, getDigitalFont } from "../../../styles/digitalThemes.js";

const theme = getDigitalTheme("gold");
const font = getDigitalFont("amiri");

const item = (over = {}) => ({
  icon: "🎉",
  title: "حفلة الحنّة",
  time: "19:00",
  venue: "بيت العائلة",
  address: "شارع النبي 86، حيفا",
  mapUrl: "",
  ...over,
});

const renderSection = (items, lang = "ar") =>
  render(<EventsSection items={items} theme={theme} font={font} lang={lang} />);

describe("EventsSection (classic multi-day schedule)", () => {
  it("renders a row per event, in order", () => {
    const { container } = renderSection([item({ title: "الحنّة" }), item({ title: "الزفاف" })]);
    expect(container.querySelectorAll(".dawa-inv-event")).toHaveLength(2);
    const titles = [...container.querySelectorAll(".dawa-inv-event-title")].map((e) => e.textContent);
    expect(titles).toEqual(["الحنّة", "الزفاف"]);
  });

  it("shows the time, venue and address", () => {
    renderSection([item()]);
    expect(screen.getByText("19:00")).toBeTruthy();
    expect(screen.getByText("بيت العائلة")).toBeTruthy();
    expect(screen.getByText("شارع النبي 86، حيفا")).toBeTruthy();
  });

  it("prefers the couple's own map link when they gave one", () => {
    renderSection([item({ mapUrl: "https://maps.app.goo.gl/abc" })]);
    expect(screen.getByRole("link").getAttribute("href")).toBe("https://maps.app.goo.gl/abc");
  });

  it("falls back to a maps search built from venue + address", () => {
    renderSection([item({ mapUrl: "" })]);
    const href = screen.getByRole("link").getAttribute("href");
    expect(href).toContain("https://maps.google.com/?q=");
    expect(href).toContain(encodeURIComponent("بيت العائلة"));
  });

  it("renders NO map link when there is nothing to point at", () => {
    renderSection([item({ mapUrl: "", venue: "", address: "" })]);
    expect(screen.queryByRole("link")).toBeNull();
  });

  it("omits any cell the couple left empty rather than printing a gap", () => {
    const { container } = renderSection([{ title: "الزفاف" }]);
    expect(container.querySelector(".dawa-inv-event-time")).toBeNull();
    expect(container.querySelector(".dawa-inv-event-venue")).toBeNull();
    expect(container.querySelector(".dawa-inv-event-icon")).toBeNull();
    expect(container.querySelector(".dawa-inv-event-title")).toBeTruthy();
  });

  it("draws a connector between rows but not after the last", () => {
    const { container } = renderSection([item(), item(), item()]);
    expect(container.querySelectorAll(".dawa-inv-event-line")).toHaveLength(2);
  });

  it("localizes its own chrome to Hebrew", () => {
    renderSection([item()], "he");
    expect(screen.getByRole("link").textContent).toContain("פתח במפה");
  });

  it("opens map links safely in a new tab", () => {
    renderSection([item({ mapUrl: "https://maps.app.goo.gl/abc" })]);
    const a = screen.getByRole("link");
    expect(a.getAttribute("target")).toBe("_blank");
    expect(a.getAttribute("rel")).toContain("noreferrer");
  });
});
