// Geo/location helpers — coordinate parsing, map-embed URLs, and navigation links.

// Extract [lat, lng] from any Google Maps URL or a raw "lat,lng" string.
// Returns null when no valid coordinates are found.
export const extractCoords = (raw) => {
  if (!raw) return null;
  const url = raw.trim();
  const patterns = [
    /@(-?\d+\.\d+),(-?\d+\.\d+)/,                  // @lat,lng (most common)
    /!3d(-?\d+\.\d+)!4d(-?\d+\.\d+)/,              // encoded place URL
    /[?&]q=(-?\d+\.\d+),\s*(-?\d+\.\d+)/,          // ?q=lat,lng
    /[?&]ll=(-?\d+\.\d+),\s*(-?\d+\.\d+)/,         // ?ll=lat,lng
    /[?&]center=(-?\d+\.\d+),\s*(-?\d+\.\d+)/,     // ?center=lat,lng
    /^(-?\d{1,3}\.\d+),\s*(-?\d{1,3}\.\d+)$/,      // bare "lat,lng" input
    /(-?\d{1,3}\.\d+),\s*(-?\d{1,3}\.\d+)/,        // any "lat,lng" inside URL (last resort)
  ];
  for (const p of patterns) {
    const m = url.match(p);
    if (m) {
      const lat = parseFloat(m[1]);
      const lng = parseFloat(m[2]);
      if (Math.abs(lat) <= 90 && Math.abs(lng) <= 180) return [lat, lng];
    }
  }
  return null;
};

// Treat any t.me URL as embeddable (covers /channel/123 and /s/channel etc.)
export const isTelegramLink = (raw) => /t\.me/.test((raw || "").trim());

// Convert a location URL (Telegram / Google Maps / raw coordinates) into an
// embed-friendly URL suitable for an <iframe>.
export const toEmbedUrl = (url) => {
  if (!url) return "";

  // إذا كان الرابط من تليجرام
  if (url.includes("t.me")) {
    // لو الرابط للمعاينة السريعة للقناة كاملة، بنخليه زي ما هو
    if (url.includes("t.me/s/")) {
      return url;
    }
    // لو الرابط لرسالة الموقع الحي المحددة، بنضيف التعديل هاد عشان يفك الحظر
    return url.includes("?") ? `${url}&embed=1` : `${url}?embed=1`;
  }

  // Coordinate-based / Google Maps legacy support
  const coords = extractCoords(url);
  if (coords) {
    const [lat, lng] = coords;
    const delta = 0.005;
    const bbox = `${lng - delta}%2C${lat - delta}%2C${lng + delta}%2C${lat + delta}`;
    return `https://www.openstreetmap.org/export/embed.html?bbox=${bbox}&layer=mapnik&marker=${lat}%2C${lng}`;
  }
  if (url.includes("/maps/embed") || url.includes("output=embed")) return url;
  if (/google\.[a-z.]+\/maps/.test(url)) {
    return url + (url.includes("?") ? "&" : "?") + "output=embed";
  }
  return url;
};

// Build a Waze navigation link for a free-text area/address.
export const wazeLink = (area) => `https://waze.com/ul?q=${encodeURIComponent(area)}&navigate=yes`;

// Extract the city/town from an area string (text before the first "-" or comma).
// Falls back to a localised "no address" label when the area is empty.
export const extractCity = (area, lang) => {
  if (!area) return lang === "he" ? "ללא כתובת" : "بدون عنوان";
  return area.split(/[-،,]/)[0].trim();
};
