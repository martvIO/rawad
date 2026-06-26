// Translation registry + accessor factory.
// makeT(lang) returns a t(key) function; unknown keys fall back to Arabic, then the raw key.
import { ar } from "./ar.js";
import { he } from "./he.js";

const STRINGS = { ar, he };

export const makeT = (lang) => (key) =>
  (STRINGS[lang] && STRINGS[lang][key]) || STRINGS.ar[key] || key;
