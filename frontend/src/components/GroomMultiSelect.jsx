// مكوّن قابل للإعادة الاستخدام — يعرض قائمة من العرسان مع:
//   • خانة بحث فورية بالاسم
//   • اختيار متعدد (Multi-select) — نقر على أي بطاقة يُفعّلها / يُلغيها
//   • زرّ «تحديد الكل» + «إلغاء الكل» للراحة
//
// المدخلات (props):
//   grooms      — مصفوفة { uid, username, displayName? }
//   selected    — مصفوفة uid المختارة حالياً
//   onChange    — fn(uid[]) — يُستدعى عند كل تغيير
//   label       — نصّ عنوان القسم
//   placeholder — placeholder خانة البحث
//   emptyText   — نصّ يظهر إذا كانت القائمة فارغة
//   t, lang     — مترجم + اتجاه
import { useState, useMemo } from "react";
import { C } from "../styles/theme.js";
import { Num } from "./Num.jsx";

export function GroomMultiSelect({
  grooms = [],
  selected = [],
  onChange,
  label,
  placeholder,
  emptyText,
  t,
  lang,
}) {
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return grooms;
    return grooms.filter(g =>
      (g.username    || "").toLowerCase().includes(q) ||
      (g.displayName || "").toLowerCase().includes(q),
    );
  }, [grooms, query]);

  const toggle = (uid) => {
    onChange(
      selected.includes(uid)
        ? selected.filter(id => id !== uid)
        : [...selected, uid],
    );
  };

  const selectAll   = () => onChange(filtered.map(g => g.uid));
  const clearAll    = () => onChange([]);
  const isRtl       = lang !== "he";  // عربي → RTL

  return (
    <div>
      {/* عنوان القسم + عداد المختارين */}
      {label && (
        <div style={{
          fontSize: 13, color: C.goldDim, fontWeight: 700, marginBottom: 10,
          display: "flex", justifyContent: "space-between", alignItems: "center",
        }}>
          <span>{label}</span>
          {selected.length > 0 && (
            <span style={{
              fontSize: 11, padding: "2px 10px", borderRadius: 20,
              background: "rgba(201,168,76,.2)", color: C.gold, fontWeight: 800,
            }}>
              <Num>{selected.length.toLocaleString("en")}</Num> ✓
            </span>
          )}
        </div>
      )}

      {/* خانة البحث */}
      <div style={{ position: "relative", marginBottom: 10 }}>
        <input
          className="input-field"
          type="text"
          placeholder={placeholder ?? (lang === "he" ? "חיפוש חתן…" : "البحث عن عريس…")}
          value={query}
          onChange={e => setQuery(e.target.value)}
          style={{
            paddingInlineStart: 36, direction: isRtl ? "rtl" : "ltr",
            marginBottom: 0,
          }}
        />
        <span style={{
          position: "absolute", insetInlineStart: 12, top: "50%",
          transform: "translateY(-50%)", fontSize: 14, pointerEvents: "none",
          color: C.dim,
        }}>🔍</span>
        {query && (
          <button onClick={() => setQuery("")} style={{
            position: "absolute", insetInlineEnd: 10, top: "50%",
            transform: "translateY(-50%)",
            background: "none", border: "none", color: C.dim, cursor: "pointer", fontSize: 16,
          }}>×</button>
        )}
      </div>

      {/* أزرار تحديد الكل / إلغاء الكل */}
      {grooms.length > 0 && (
        <div style={{ display: "flex", gap: 8, marginBottom: 10 }}>
          <button onClick={selectAll} style={{
            flex: 1, padding: "6px 0", borderRadius: 8, cursor: "pointer",
            background: "rgba(201,168,76,.08)", border: "1px solid rgba(201,168,76,.25)",
            color: C.gold, fontSize: 11, fontWeight: 700, fontFamily: "inherit",
          }}>
            {lang === "he" ? "✓ בחר הכל" : "✓ تحديد الكل"}
          </button>
          <button onClick={clearAll} disabled={selected.length === 0} style={{
            flex: 1, padding: "6px 0", borderRadius: 8, cursor: selected.length ? "pointer" : "not-allowed",
            background: selected.length ? "rgba(212,80,58,.08)" : "rgba(255,255,255,.03)",
            border: `1px solid ${selected.length ? "rgba(212,80,58,.3)" : "rgba(255,255,255,.07)"}`,
            color: selected.length ? C.red : C.dim, fontSize: 11, fontWeight: 700, fontFamily: "inherit",
          }}>
            {lang === "he" ? "✕ נקה הכל" : "✕ إلغاء الكل"}
          </button>
        </div>
      )}

      {/* القائمة */}
      {grooms.length === 0 ? (
        <div className="card" style={{ textAlign: "center", padding: 24, color: C.dim }}>
          {emptyText ?? (lang === "he" ? "אין חתנים" : "لا يوجد عرسان")}
        </div>
      ) : filtered.length === 0 ? (
        <div style={{ textAlign: "center", padding: 20, color: C.dim, fontSize: 13 }}>
          {lang === "he" ? "לא נמצאו תוצאות" : "لا توجد نتائج لـ «" + query + "»"}
        </div>
      ) : (
        <div style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))",
          gap: 8,
          maxHeight: 320, overflowY: "auto",
          paddingInlineEnd: 2,   // هامش للـ scrollbar
        }}>
          {filtered.map(g => {
            const uid   = g.uid ?? g.id;
            const isSel = selected.includes(uid);
            return (
              <button
                key={uid}
                onClick={() => toggle(uid)}
                style={{
                  padding: "12px 10px", borderRadius: 12, cursor: "pointer",
                  background: isSel ? "rgba(201,168,76,.18)" : "rgba(255,255,255,.03)",
                  border: `1.5px solid ${isSel ? C.gold : "rgba(255,255,255,.08)"}`,
                  color: isSel ? C.gold : C.goldDim,
                  fontWeight: 800, fontSize: 13, fontFamily: "inherit",
                  textAlign: "center",
                  display: "flex", flexDirection: "column", alignItems: "center", gap: 6,
                  transition: "all .18s",
                }}
              >
                <span style={{ fontSize: 22 }}>{isSel ? "✓" : "♥"}</span>
                <span style={{ direction: "ltr" }}>@{g.username}</span>
                {g.displayName && (
                  <span style={{ fontSize: 10, color: isSel ? C.goldDim : "#5a5040", fontWeight: 400 }}>
                    {g.displayName}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
