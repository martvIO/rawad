// i18n coverage guard for the Expo groom app (app/).
//
// makeT(lang) resolves a key as STRINGS[lang][key] || STRINGS.ar[key] || key —
// so a MISSING key returns the raw key string (e.g. "login_username"), which is
// truthy, defeating the screens' `t("key") || "arabic fallback"` pattern and
// rendering the English-looking key on screen. This test scans every t("…")
// usage under app/app + app/src and asserts the key exists in BOTH ar and he,
// so a screen can never again ship an untranslated key. (Regression guard for
// the 23 missing keys found 2026-07-01.)
import { describe, it, expect } from "vitest";
import { readdirSync, statSync, existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { ar } from "../../i18n/ar.js";
import { he } from "../../i18n/he.js";

const APP_ROOTS = ["../../../../app/app", "../../../../app/src"].map((p) =>
  fileURLToPath(new URL(p, import.meta.url)),
);

function walk(dir, acc = []) {
  for (const name of readdirSync(dir)) {
    if (name === "node_modules" || name.startsWith(".")) continue;
    const p = `${dir}/${name}`;
    if (statSync(p).isDirectory()) walk(p, acc);
    else if (/\.(jsx?|tsx?)$/.test(name)) acc.push(p);
  }
  return acc;
}

// Collect every literal-key t("…") / t('…') / t(`…`) call in the app source.
function collectUsedKeys() {
  const used = new Map(); // key -> Set(relative files)
  const re = /\bt\(\s*["'`]([a-zA-Z0-9_]+)["'`]\s*\)/g;
  for (const root of APP_ROOTS) {
    if (!existsSync(root)) continue;
    for (const file of walk(root)) {
      const src = readFileSync(file, "utf8");
      let m;
      while ((m = re.exec(src))) {
        if (!used.has(m[1])) used.set(m[1], new Set());
        used.get(m[1]).add(file);
      }
    }
  }
  return used;
}

describe("i18n app key coverage", () => {
  const appPresent = APP_ROOTS.some((r) => existsSync(r));

  it.skipIf(!appPresent)("every t() key in the Expo app exists in ar.js and he.js", () => {
    const used = collectUsedKeys();
    expect(used.size, "no t() keys were scanned — check APP_ROOTS").toBeGreaterThan(0);

    const missing = [];
    for (const [key, files] of used) {
      const where = [...files].map((f) => f.split("/app/").pop()).join(", ");
      if (ar[key] === undefined) missing.push(`ar: ${key}  <- ${where}`);
      else if (he[key] === undefined) missing.push(`he: ${key}  <- ${where}`);
    }
    expect(missing, "app screens use t() keys absent from the registry").toEqual([]);
  });
});
