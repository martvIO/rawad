// Arabic is a cursive script — positive letter-spacing inserts space *inside*
// words and severs the joins between letters, so a tracked label must drop its
// tracking whenever the string it renders contains Arabic. Hebrew/Latin are
// not cursive and keep the flourish.
const AR_RE = /[؀-ۿݐ-ݿࢠ-ࣿﭐ-﷿ﹰ-﻿]/;

export const hasArabic = (s) => AR_RE.test(String(s ?? ""));

// Tracking to apply to a label: the designed value for Latin/Hebrew, 0 for Arabic.
export const track = (s, px) => (hasArabic(s) ? 0 : px);
