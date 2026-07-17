// Render smoke for Royal Gold + a real unit test of its wall/band stripe.
// Preview mode passes no showEnvelope, so no sealed intro mounts.
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { RoyalGoldView, assignStripe } from "../../../../components/digital/templates/royal-gold/RoyalGoldView.jsx";

const design = {
  templateId: "royal-gold",
  themeColor: "royalGold",
  fontFamily: "amiri",
  groomDisplayName: { ar: "فيكتور", he: "ויקטור" },
  brideName: { ar: "بولا", he: "פאולה" },
  weddingDate: Date.UTC(2027, 8, 4, 18, 0),
  venue: { ar: "قصر الورد", he: "ארמון הוורד" },
  venueCity: { ar: "الناصرة", he: "נצרת" },
};

const renderView = (over = {}, props = {}) =>
  render(<RoyalGoldView design={{ ...design, ...over }} guestName="أحمد محمد" lang="ar" mode="preview" {...props} />);

describe("RoyalGoldView (smoke)", () => {
  it("renders the couple, the guest and the venue from the design doc", () => {
    renderView();
    expect(screen.getByText("فيكتور & بولا")).toBeTruthy();
    expect(screen.getByText("أحمد محمد")).toBeTruthy();
    expect(screen.getByText("قصر الورد")).toBeTruthy();
  });

  it("wires RSVP through the shared hook", () => {
    renderView();
    expect(screen.getByTestId("rg-rsvp-submit")).toBeTruthy();
  });

  it("renders in Hebrew when lang=he", () => {
    render(<RoyalGoldView design={design} guestName="דני" lang="he" mode="preview" />);
    expect(screen.getByText("ארמון הוורד")).toBeTruthy();
  });

  it("mounts no sealed intro in preview, and seals on the public page", () => {
    renderView();
    expect(screen.queryByTestId("intro-sealed")).toBeNull();
    render(<RoyalGoldView design={design} guestName="أحمد" lang="ar" mode="public" showEnvelope token="tok-rg-1" />);
    expect(screen.getByTestId("intro-sealed")).toBeTruthy();
  });

  it("reports 'ready' for the load metric (nothing lazy to wait for)", () => {
    const onIntroEvent = vi.fn();
    render(<RoyalGoldView design={design} guestName="أحمد" lang="ar" mode="preview" onIntroEvent={onIntroEvent} />);
    expect(onIntroEvent).toHaveBeenCalledWith("ready");
  });

  it("survives an unknown themeColor rather than painting undefined colours", () => {
    expect(() => renderView({ themeColor: "not-a-palette" })).not.toThrow();
  });

  it("uses Western digits in the countdown even in Arabic", () => {
    const { container } = renderView();
    expect(container.querySelector("#rg-countdown bdi[dir='ltr']")).toBeTruthy();
  });

  it("renders the multi-day schedule when events exist, hides it otherwise", () => {
    const { container, unmount } = renderView();
    expect(container.querySelector("#rg-events")).toBeNull();
    unmount();
    renderView({ events: [{ title: { ar: "الحنّة" }, time: { ar: "19:00" } }] });
    expect(screen.getByText("الحنّة")).toBeTruthy();
  });
});

describe("RoyalGoldView — photos hang in gold frames", () => {
  // Besides classic, this is the only template that renders `media`. If the
  // gallery stops rendering, that field silently vanishes from the design.
  const media = [
    { storagePath: "a", url: "https://example.test/a.jpg", kind: "image" },
    { storagePath: "b", url: "https://example.test/b.jpg", kind: "image" },
  ];

  it("renders one framed photo per media item", () => {
    const { container } = renderView({ media });
    const imgs = container.querySelectorAll("#rg-gallery img");
    expect(imgs.length).toBe(2);
    expect(imgs[0].getAttribute("src")).toBe("https://example.test/a.jpg");
  });

  it("hides the gallery when there is no media, and when the groom switches it off", () => {
    const { container, unmount } = renderView({ media: [] });
    expect(container.querySelector("#rg-gallery")).toBeNull();
    unmount();
    const { container: c2 } = renderView({ media, galleryEnabled: false });
    expect(c2.querySelector("#rg-gallery")).toBeNull();
  });

  it("renders a caption from mediaCaptions, keyed by storagePath", () => {
    renderView({ media, mediaCaptions: { a: { ar: "أول لقاء" } } });
    expect(screen.getByText("أول لقاء")).toBeTruthy();
  });

  it("hangs a video item as a <video>, not a broken <img>", () => {
    const { container } = renderView({ media: [{ storagePath: "v", url: "https://example.test/v.mp4", kind: "video" }] });
    expect(container.querySelector("#rg-gallery video")).toBeTruthy();
    expect(container.querySelector("#rg-gallery img")).toBeNull();
  });

  it("tilts the frames deterministically — the same photo hangs the same way twice", () => {
    const tilt = (c) => [...c.querySelectorAll("#rg-gallery figure")].map((f) => f.style.transform);
    const { container: c1, unmount } = renderView({ media });
    const first = tilt(c1);
    unmount();
    const { container: c2 } = renderView({ media });
    expect(tilt(c2)).toEqual(first);
    expect(first[0]).not.toBe(first[1]); // ...but not all identical
  });
});

describe("assignStripe — two cream bands must never touch", () => {
  // The stripe is the template's signature. The trap is that it's computed from
  // the sections that ACTUALLY render, so switching one off must not leave two
  // torn bands adjacent with a jagged sliver of wall between them.
  const noAdjacentBands = (order, stripe) => {
    for (let i = 1; i < order.length; i++) {
      if (stripe[order[i]] && stripe[order[i - 1]]) return false;
    }
    return true;
  };

  const ALL = [
    { key: "countdown", pin: "wall" },
    { key: "gallery", pin: "wall" },
    { key: "story" },
    { key: "events", pin: "wall" },
    { key: "venue" },
    { key: "dress" },
    { key: "rsvp" },
    { key: "gift" },
    { key: "guestbook" },
  ];

  it("pins gallery and schedule to the wall — the frames and rose need the wine", () => {
    const s = assignStripe(ALL);
    expect(s.gallery).toBe(false);
    expect(s.events).toBe(false);
    expect(s.countdown).toBe(false);
  });

  it("alternates the flexible sections", () => {
    const s = assignStripe(ALL);
    expect(s.story).toBe(true);
    expect(s.venue).toBe(true);
    expect(s.dress).toBe(false);
    expect(s.rsvp).toBe(true);
    expect(noAdjacentBands(ALL.map((b) => b.key), s)).toBe(true);
  });

  it("never produces two adjacent bands for ANY combination of switched-off sections", () => {
    // The flexible blocks are the ones that can vanish; walk every subset.
    const optional = ["countdown", "gallery", "story", "events", "venue", "dress", "gift", "guestbook"];
    let checked = 0;
    for (let mask = 0; mask < (1 << optional.length); mask++) {
      const dropped = new Set(optional.filter((_, i) => mask & (1 << i)));
      const blocks = ALL.filter((b) => !dropped.has(b.key));
      const stripe = assignStripe(blocks);
      expect(noAdjacentBands(blocks.map((b) => b.key), stripe)).toBe(true);
      checked++;
    }
    expect(checked).toBe(256); // all 2^8 subsets, not a sampled few
  });

  it("resets the alternation after a pinned wall, so a band always follows it", () => {
    // dress(band) -> events(wall) -> venue must come back as a band, not stay flipped.
    const s = assignStripe([{ key: "dress" }, { key: "events", pin: "wall" }, { key: "venue" }]);
    expect(s.dress).toBe(true);
    expect(s.events).toBe(false);
    expect(s.venue).toBe(true);
  });
});
