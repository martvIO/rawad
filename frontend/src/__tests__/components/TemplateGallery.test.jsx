import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { TemplateGalleryPage } from "../../pages/TemplateGalleryPage.jsx";
import { TemplateCard } from "../../components/TemplateCard.jsx";
import { makeT } from "../../i18n/index.js";
import { DIGITAL_TEMPLATE_KEYS } from "@dawa/core/data/digitalTemplates.js";

// The gallery reports its own visit; capture what it sends.
const created = [];
vi.mock("../../utils/inviteMetrics.js", () => ({
  createInviteMetrics: (opts) => {
    const rec = { opts, events: [], disposed: false };
    created.push(rec);
    return {
      handleIntroEvent: (e) => rec.events.push(e),
      dispose: () => { rec.disposed = true; },
    };
  },
}));

const t = makeT("ar");

const renderGallery = (lang = "ar") =>
  render(
    <MemoryRouter>
      <TemplateGalleryPage t={makeT(lang)} lang={lang} setLang={() => {}} />
    </MemoryRouter>,
  );

describe("TemplateGalleryPage", () => {
  it("renders exactly one card per registered template", () => {
    renderGallery();
    for (const id of DIGITAL_TEMPLATE_KEYS) {
      expect(screen.getByTestId(`template-card-${id}`)).toBeTruthy();
    }
    // No stray cards beyond the registry.
    expect(screen.getAllByTestId(/^template-card-/)).toHaveLength(DIGITAL_TEMPLATE_KEYS.length);
  });

  // Regression: the "gallery" surface had backend support, an allowlist branch
  // and its own admin KPI — but nothing ever sent it, so the admin read a
  // measured-looking 0 forever (a fabricated metric).
  it("reports its own visit under the gallery surface", () => {
    created.length = 0;
    const { unmount } = renderGallery();
    expect(created).toHaveLength(1);
    expect(created[0].opts).toMatchObject({ surface: "gallery", templateId: "all" });
    // No sealed intro here — the page is ready as soon as it mounts.
    expect(created[0].events).toContain("ready");
    // A non-guest surface must not carry a token.
    expect(created[0].opts.token).toBeUndefined();
    unmount();
    expect(created[0].disposed).toBe(true);
  });

  it("shows the localized template label (AR vs HE)", () => {
    const { unmount } = renderGallery("ar");
    expect(screen.getByText("رحلة الحب")).toBeTruthy();
    unmount();
    renderGallery("he");
    expect(screen.getByText("מסע האהבה")).toBeTruthy();
  });
});

describe("TemplateCard", () => {
  let openSpy;
  beforeEach(() => {
    openSpy = vi.spyOn(window, "open").mockImplementation(() => null);
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("opens the per-template demo link with ?demo=1&template=<id>", async () => {
    render(<TemplateCard id="destination-love" t={t} lang="ar" thumb={null} />);
    await userEvent.click(screen.getByTestId("template-try-destination-love"));
    expect(openSpy).toHaveBeenCalledWith(
      "/d/demo/demo?demo=1&template=destination-love",
      "_blank",
      "noopener",
    );
  });

  it("omits ?template for classic (the default template's canonical short URL)", async () => {
    render(<TemplateCard id="classic" t={t} lang="ar" thumb={null} />);
    await userEvent.click(screen.getByTestId("template-try-classic"));
    expect(openSpy).toHaveBeenCalledWith("/d/demo/demo?demo=1", "_blank", "noopener");
  });

  it("renders a themed placeholder (not a broken image) when no thumbnail exists", () => {
    const { container } = render(<TemplateCard id="classic" t={t} lang="ar" thumb={null} />);
    expect(container.querySelector("img")).toBeNull();
    // The name appears exactly once (title row) — the ornament placeholder is
    // text-free, so it must not duplicate the label.
    expect(screen.getAllByText("الكلاسيكي")).toHaveLength(1);
  });

  it("renders the cover image when a thumbnail is supplied", () => {
    const { container } = render(<TemplateCard id="destination-love" t={t} lang="ar" thumb="/cover.jpg" />);
    const img = container.querySelector("img");
    expect(img).toBeTruthy();
    expect(img.getAttribute("src")).toBe("/cover.jpg");
  });

  it("copies the absolute share link and confirms, then reverts", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText } });
    render(<TemplateCard id="destination-love" t={t} lang="ar" thumb={null} />);
    await userEvent.click(screen.getByTestId("template-copy-destination-love"));
    expect(writeText).toHaveBeenCalledWith(expect.stringContaining("?demo=1&template=destination-love"));
    expect(await screen.findByText(t("templates_copied"))).toBeTruthy();
  });

  it("hides the copy button in compact (landing strip) mode", () => {
    render(<TemplateCard id="destination-love" t={t} lang="ar" thumb={null} compact />);
    expect(screen.queryByTestId("template-copy-destination-love")).toBeNull();
    expect(screen.getByTestId("template-try-destination-love")).toBeTruthy();
  });

  it("returns null for an unknown template id rather than throwing", () => {
    const { container } = render(<TemplateCard id="nope" t={t} lang="ar" thumb={null} />);
    expect(container.firstChild).toBeNull();
  });
});
