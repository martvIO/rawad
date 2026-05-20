// Unit tests for geo helpers — coordinate parsing, embed URLs, navigation
// deep links, the GPS-fix promise wrapper, and city extraction.
import { describe, it, expect, afterEach } from "vitest";
import {
  extractCoords,
  isTelegramLink,
  toEmbedUrl,
  wazeLink,
  wazeLinkCoords,
  googleMapsLinkCoords,
  appleMapsLinkCoords,
  getCurrentFix,
  extractCity,
} from "../../utils/geo.js";

describe("extractCoords", () => {
  it("parses the @lat,lng Google Maps form", () => {
    expect(extractCoords("https://maps.google.com/@32.0853,34.7818,15z")).toEqual([32.0853, 34.7818]);
  });

  it("parses the encoded !3d!4d place form", () => {
    expect(extractCoords("https://www.google.com/maps/data=!3d32.0853!4d34.7818")).toEqual([32.0853, 34.7818]);
  });

  it("parses the ?q=lat,lng query form", () => {
    expect(extractCoords("https://maps.google.com/?q=32.0853,34.7818")).toEqual([32.0853, 34.7818]);
  });

  it("parses the ?ll=lat,lng query form", () => {
    expect(extractCoords("https://example.com/?ll=32.0853,34.7818")).toEqual([32.0853, 34.7818]);
  });

  it("parses the ?center=lat,lng query form", () => {
    expect(extractCoords("https://example.com/?center=32.0853,34.7818")).toEqual([32.0853, 34.7818]);
  });

  it("parses a bare lat,lng string", () => {
    expect(extractCoords("32.0853,34.7818")).toEqual([32.0853, 34.7818]);
  });

  it("tolerates a space after the comma", () => {
    expect(extractCoords("32.0853, 34.7818")).toEqual([32.0853, 34.7818]);
  });

  it("parses negative (southern/western) coordinates", () => {
    expect(extractCoords("-33.8688,151.2093")).toEqual([-33.8688, 151.2093]);
  });

  it("parses lat,lng embedded in surrounding text (last-resort pattern)", () => {
    expect(extractCoords("meet me at 31.5,34.8 tonight")).toEqual([31.5, 34.8]);
  });

  it("rejects an out-of-range latitude", () => {
    expect(extractCoords("95.0,34.8")).toBeNull();
  });

  it("rejects an out-of-range longitude", () => {
    expect(extractCoords("32.0853,234.5")).toBeNull();
  });

  it("returns null for null input", () => {
    expect(extractCoords(null)).toBeNull();
  });

  it("returns null for an empty string", () => {
    expect(extractCoords("")).toBeNull();
  });

  it("returns null when no coordinates are present", () => {
    expect(extractCoords("just some address text")).toBeNull();
  });

  it("returns null for integers without a decimal point", () => {
    expect(extractCoords("meet at 1920,1080")).toBeNull();
  });
});

describe("isTelegramLink", () => {
  it("detects a t.me URL", () => {
    expect(isTelegramLink("https://t.me/somechannel")).toBe(true);
  });

  it("returns false for a non-Telegram URL", () => {
    expect(isTelegramLink("https://example.com")).toBe(false);
  });

  it("returns false for null", () => {
    expect(isTelegramLink(null)).toBe(false);
  });
});

describe("toEmbedUrl", () => {
  it("returns empty string for empty input", () => {
    expect(toEmbedUrl("")).toBe("");
  });

  it("returns empty string for null", () => {
    expect(toEmbedUrl(null)).toBe("");
  });

  it("passes through a Telegram channel-preview link unchanged", () => {
    const url = "https://t.me/s/mychannel";
    expect(toEmbedUrl(url)).toBe(url);
  });

  it("appends ?embed=1 to a Telegram message link", () => {
    expect(toEmbedUrl("https://t.me/mychannel/55")).toBe("https://t.me/mychannel/55?embed=1");
  });

  it("appends &embed=1 to a Telegram link that already has a query string", () => {
    expect(toEmbedUrl("https://t.me/c/1/2?x=1")).toBe("https://t.me/c/1/2?x=1&embed=1");
  });

  it("converts a coordinate string into an OpenStreetMap embed", () => {
    const out = toEmbedUrl("32.0853,34.7818");
    expect(out).toContain("openstreetmap.org/export/embed.html");
    expect(out).toContain("marker=32.0853%2C34.7818");
  });

  it("passes through an already-embeddable Google Maps URL", () => {
    const url = "https://www.google.com/maps/embed?pb=abc";
    expect(toEmbedUrl(url)).toBe(url);
  });

  it("appends output=embed to a plain Google Maps URL", () => {
    expect(toEmbedUrl("https://www.google.com/maps/place/Haifa")).toBe(
      "https://www.google.com/maps/place/Haifa?output=embed",
    );
  });

  it("returns an unrecognized URL unchanged", () => {
    expect(toEmbedUrl("https://example.com/foo")).toBe("https://example.com/foo");
  });
});

describe("navigation deep links", () => {
  it("builds a Waze link from a free-text area", () => {
    expect(wazeLink("Tel Aviv")).toBe("https://waze.com/ul?q=Tel%20Aviv&navigate=yes");
  });

  it("builds a coordinate-based Waze link", () => {
    expect(wazeLinkCoords(32.1, 34.8)).toBe("https://waze.com/ul?ll=32.1,34.8&navigate=yes");
  });

  it("builds a Google Maps directions link", () => {
    expect(googleMapsLinkCoords(32.1, 34.8)).toBe(
      "https://www.google.com/maps/dir/?api=1&destination=32.1,34.8",
    );
  });

  it("builds an Apple Maps link", () => {
    expect(appleMapsLinkCoords(32.1, 34.8)).toBe("https://maps.apple.com/?daddr=32.1,34.8");
  });
});

describe("getCurrentFix", () => {
  afterEach(() => {
    if ("geolocation" in navigator) delete navigator.geolocation;
  });

  const setGeolocation = (impl) => {
    Object.defineProperty(navigator, "geolocation", {
      configurable: true,
      value: { getCurrentPosition: impl },
    });
  };

  it("rejects when geolocation is unavailable", async () => {
    await expect(getCurrentFix()).rejects.toThrow("Geolocation not supported.");
  });

  it("rejects with a localized message when geolocation is unavailable", async () => {
    await expect(getCurrentFix((k) => k)).rejects.toThrow("geo_not_supported");
  });

  it("resolves with coordinates and a rounded accuracy on success", async () => {
    setGeolocation((success) =>
      success({ coords: { latitude: 32.1, longitude: 34.8, accuracy: 12.7 } }),
    );
    await expect(getCurrentFix()).resolves.toEqual({ lat: 32.1, lng: 34.8, accuracy: 13 });
  });

  it("rejects with a permission-denied message for error code 1", async () => {
    setGeolocation((_s, error) => error({ code: 1, message: "denied" }));
    await expect(getCurrentFix()).rejects.toThrow("Location permission denied.");
  });

  it("rejects with a localized permission message when a translator is supplied", async () => {
    setGeolocation((_s, error) => error({ code: 1 }));
    await expect(getCurrentFix((k) => k)).rejects.toThrow("geo_denied");
  });

  it("rejects with the underlying message for non-permission errors", async () => {
    setGeolocation((_s, error) => error({ code: 2, message: "timeout expired" }));
    await expect(getCurrentFix()).rejects.toThrow("timeout expired");
  });
});

describe("extractCity", () => {
  it("takes the part before a dash", () => {
    expect(extractCity("Haifa - Main Street", "ar")).toBe("Haifa");
  });

  it("takes the part before a comma", () => {
    expect(extractCity("Haifa, Main Street", "ar")).toBe("Haifa");
  });

  it("takes the part before an Arabic comma", () => {
    expect(extractCity("حيفا،شارع", "ar")).toBe("حيفا");
  });

  it("returns the whole string when there is no delimiter", () => {
    expect(extractCity("Haifa", "ar")).toBe("Haifa");
  });

  it("returns the Arabic no-address label for empty input", () => {
    expect(extractCity("", "ar")).toBe("بدون عنوان");
  });

  it("returns the Hebrew no-address label for empty input", () => {
    expect(extractCity("", "he")).toBe("ללא כתובת");
  });

  it("returns the no-address label for null input", () => {
    expect(extractCity(null, "ar")).toBe("بدون عنوان");
  });
});
