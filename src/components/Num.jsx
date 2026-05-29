// Bidi-isolation wrapper for numeric content sitting inside right-to-left
// (Arabic / Hebrew) text. Western digits are left-to-right; when they appear
// in an RTL run — phone numbers, dates, counts, prices, addresses, times —
// the browser's bidi algorithm can place them in the wrong spot or break
// alignment. Wrapping the numeric token in <bdi dir="ltr"> isolates it so the
// digits keep their own direction and sit correctly without disturbing the
// surrounding RTL flow.
//
// Usage: <Num>{phone}</Num>, <Num>+{companions}</Num>, <Num dir="auto">{date}</Num>
//
// Use dir="ltr" (default) for pure-number / number-led tokens (phones, IBANs,
// counts, times like "4 min"). Use dir="auto" for mixed strings that lead with
// a word (e.g. a localized date "29 May 2026") so direction follows the text.
export function Num({ children, dir = "ltr", style, className }) {
  return (
    <bdi
      dir={dir}
      className={className}
      style={{ unicodeBidi: "isolate", ...style }}
    >
      {children}
    </bdi>
  );
}
