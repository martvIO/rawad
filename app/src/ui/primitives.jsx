// Phase 2 RN component library — the visual primitives every groom screen uses.
// Faithful to the web's dark/gold RTL look, built with native interactions.
import { useState } from "react";
import {
  View,
  Text,
  TextInput,
  Pressable,
  Image,
  Modal,
  ScrollView,
  ActivityIndicator,
  StyleSheet,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import DateTimePicker from "@react-native-community/datetimepicker";
import { C, space, radius, type } from "./theme.js";

// RSVP status palette (the web uses these inline literals).
export const STATUS = {
  pending: { color: "#f0c84c", glow: "rgba(240,200,76,0.14)", icon: "⏳" },
  attending: { color: "#4cc97a", glow: "rgba(76,201,122,0.14)", icon: "✓" },
  absent: { color: "#d4533a", glow: "rgba(212,83,58,0.14)", icon: "✕" },
  locked: { color: C.dim, glow: "rgba(138,122,88,0.12)", icon: "🔒" },
};

// Format an epoch-ms date as D/M/YYYY (Western digits — locale-agnostic, safe
// under any Hermes ICU build).
export function fmtDate(ms) {
  if (!ms) return "";
  const d = new Date(ms);
  return `${d.getDate()}/${d.getMonth() + 1}/${d.getFullYear()}`;
}

export function SectionLabel({ children }) {
  return <Text style={styles.sectionLabel}>{children}</Text>;
}

export function IconButton({ glyph, onPress, color = C.gold, size = 34, testID }) {
  return (
    <Pressable
      testID={testID}
      onPress={onPress}
      hitSlop={8}
      style={[styles.iconBtn, { width: size, height: size, borderRadius: size / 2 }]}
    >
      <Text style={[styles.iconGlyph, { color }]}>{glyph}</Text>
    </Pressable>
  );
}

export function ListRow({ children, style }) {
  return <View style={[styles.row, style]}>{children}</View>;
}

export function StatusBadge({ status, onPress, locked }) {
  const cfg = locked ? STATUS.locked : STATUS[status] || STATUS.pending;
  const Wrap = onPress && !locked ? Pressable : View;
  return (
    <Wrap
      onPress={onPress && !locked ? onPress : undefined}
      style={[styles.badge, { backgroundColor: cfg.glow, borderColor: cfg.color }]}
    >
      <Text style={[styles.badgeText, { color: cfg.color }]}>{cfg.icon}</Text>
    </Wrap>
  );
}

export function Chip({ label, selected, onPress, onRemove }) {
  return (
    <Pressable
      onPress={onPress}
      style={[styles.chip, selected ? styles.chipOn : styles.chipOff]}
    >
      <Text style={[styles.chipText, selected && styles.chipTextOn]}>{label}</Text>
      {onRemove ? (
        <Pressable onPress={onRemove} hitSlop={6} style={styles.chipX}>
          <Text style={[styles.chipText, selected && styles.chipTextOn]}>✕</Text>
        </Pressable>
      ) : null}
    </Pressable>
  );
}

export function SearchBar({ value, onChangeText, placeholder, count }) {
  return (
    <View style={styles.search}>
      <Text style={styles.searchIcon}>🔍</Text>
      <TextInput
        style={styles.searchInput}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={C.dim}
        autoCorrect={false}
      />
      {count ? <Text style={styles.searchCount}>{count}</Text> : null}
      {value ? (
        <Pressable onPress={() => onChangeText("")} hitSlop={8}>
          <Text style={styles.searchClear}>✕</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

export function FilterChips({ options, value, onChange }) {
  // options: [{ key, label, count }]
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.filterRow}
    >
      {options.map((o) => (
        <Pressable
          key={o.key}
          onPress={() => onChange(o.key)}
          style={[styles.filterChip, value === o.key && styles.filterChipOn]}
        >
          <Text style={[styles.filterText, value === o.key && styles.filterTextOn]}>
            {o.label}
            {o.count != null ? ` ${o.count}` : ""}
          </Text>
        </Pressable>
      ))}
    </ScrollView>
  );
}

export function StatTile({ value, label, color = C.gold }) {
  return (
    <View style={styles.statTile}>
      <Text style={[styles.statValue, { color }]}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

export function ProgressBar({ value, color = C.gold }) {
  const pct = Math.round(Math.min(1, Math.max(0, value || 0)) * 100);
  return (
    <View style={styles.progressTrack}>
      <View style={[styles.progressFill, { width: `${pct}%`, backgroundColor: color }]} />
    </View>
  );
}

export function MediaTile({ item, onRemove, size = 100 }) {
  const isVideo = item.kind === "video";
  return (
    <View style={[styles.tile, { width: size, height: size }]}>
      {isVideo ? (
        <View style={[styles.tileImg, styles.tileVideo]}>
          <Text style={styles.tilePlay}>▶</Text>
        </View>
      ) : (
        <Image source={{ uri: item.url }} style={styles.tileImg} resizeMode="cover" />
      )}
      {item.kind === "gif" ? (
        <View style={styles.tileBadge}>
          <Text style={styles.tileBadgeText}>GIF</Text>
        </View>
      ) : null}
      {item.pending ? (
        <View style={styles.tileOverlay}>
          <ActivityIndicator color={C.gold} />
        </View>
      ) : onRemove ? (
        <Pressable style={styles.tileRemove} onPress={onRemove} hitSlop={6}>
          <Text style={styles.tileRemoveText}>✕</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

export function BottomSheet({ visible, onClose, title, children }) {
  const insets = useSafeAreaInsets();
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.sheetBackdrop} onPress={onClose} />
      <View style={[styles.sheet, { paddingBottom: insets.bottom + space[4] }]}>
        <View style={styles.sheetHandle} />
        {title ? <Text style={styles.sheetTitle}>{title}</Text> : null}
        {children}
      </View>
    </Modal>
  );
}

// Native date picker field. `value` is epoch ms (or null); emits epoch ms.
// v1 is date-only (mode="date") — full date+time can be layered later.
export function DatePickerField({ label, value, onChange, placeholder }) {
  const [show, setShow] = useState(false);
  return (
    <View style={styles.fieldWrap}>
      {label ? <Text style={styles.label}>{label}</Text> : null}
      <View style={styles.dateRow}>
        <Pressable style={styles.dateInput} onPress={() => setShow(true)}>
          <Text style={[styles.dateText, !value && styles.datePlaceholder]}>
            {value ? fmtDate(value) : placeholder || "—"}
          </Text>
        </Pressable>
        {value ? (
          <IconButton glyph="✕" color={C.dim} onPress={() => onChange(null)} />
        ) : null}
      </View>
      {show ? (
        <DateTimePicker
          value={value ? new Date(value) : new Date()}
          mode="date"
          onChange={(event, selected) => {
            setShow(false);
            if (event.type === "set" && selected) onChange(selected.getTime());
          }}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  sectionLabel: {
    color: C.dim,
    fontSize: type.sm,
    fontWeight: "800",
    textAlign: "right",
    marginBottom: space[2],
  },
  iconBtn: {
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.04)",
    borderColor: "rgba(201,168,76,0.25)",
    borderWidth: 1,
  },
  iconGlyph: { fontSize: type.lg, fontWeight: "800" },
  row: {
    backgroundColor: "rgba(255,255,255,0.03)",
    borderColor: "rgba(201,168,76,0.18)",
    borderWidth: 1,
    borderRadius: radius.xl,
    padding: space[4],
    marginBottom: space[3],
  },
  badge: {
    minWidth: 34,
    height: 30,
    paddingHorizontal: space[2],
    borderRadius: radius.pill,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  badgeText: { fontSize: type.md, fontWeight: "800" },
  chip: {
    flexDirection: "row",
    alignItems: "center",
    gap: space[1],
    paddingHorizontal: space[3],
    paddingVertical: space[2],
    borderRadius: radius.pill,
    borderWidth: 1,
    marginEnd: space[2],
    marginBottom: space[2],
  },
  chipOn: { backgroundColor: "rgba(201,168,76,0.18)", borderColor: C.gold },
  chipOff: { backgroundColor: "rgba(255,255,255,0.03)", borderColor: "rgba(201,168,76,0.25)" },
  chipText: { color: C.dim, fontSize: type.sm, fontWeight: "700" },
  chipTextOn: { color: C.gold },
  chipX: { paddingStart: space[1] },
  search: {
    flexDirection: "row",
    alignItems: "center",
    gap: space[2],
    backgroundColor: "rgba(255,255,255,0.04)",
    borderColor: "rgba(201,168,76,0.25)",
    borderWidth: 1,
    borderRadius: radius.md,
    paddingHorizontal: space[3],
  },
  searchIcon: { fontSize: type.md },
  searchInput: { flex: 1, color: C.goldLight, fontSize: type.lg, paddingVertical: space[3], textAlign: "right" },
  searchCount: { color: C.dim, fontSize: type.sm, fontWeight: "700" },
  searchClear: { color: C.dim, fontSize: type.md, paddingHorizontal: space[1] },
  filterRow: { gap: space[2], paddingVertical: space[1] },
  filterChip: {
    paddingHorizontal: space[3],
    paddingVertical: space[2],
    borderRadius: radius.pill,
    borderWidth: 1,
    backgroundColor: "rgba(255,255,255,0.03)",
    borderColor: "rgba(201,168,76,0.25)",
  },
  filterChipOn: { backgroundColor: "rgba(201,168,76,0.18)", borderColor: C.gold },
  filterText: { color: C.dim, fontSize: type.sm, fontWeight: "700" },
  filterTextOn: { color: C.gold },
  statTile: {
    flex: 1,
    minWidth: "44%",
    backgroundColor: "rgba(255,255,255,0.03)",
    borderColor: "rgba(201,168,76,0.18)",
    borderWidth: 1,
    borderRadius: radius.xl,
    padding: space[4],
    alignItems: "center",
    gap: space[1],
  },
  statValue: { fontSize: type["4xl"], fontWeight: "900" },
  statLabel: { color: C.dim, fontSize: type.sm, fontWeight: "700", textAlign: "center" },
  progressTrack: {
    height: 10,
    borderRadius: radius.pill,
    backgroundColor: "rgba(255,255,255,0.06)",
    overflow: "hidden",
  },
  progressFill: { height: "100%", borderRadius: radius.pill },
  tile: {
    borderRadius: radius.lg,
    overflow: "hidden",
    backgroundColor: "rgba(255,255,255,0.04)",
    borderColor: "rgba(201,168,76,0.2)",
    borderWidth: 1,
  },
  tileImg: { width: "100%", height: "100%" },
  tileVideo: { alignItems: "center", justifyContent: "center", backgroundColor: "#15130d" },
  tilePlay: { color: C.goldLight, fontSize: type["3xl"] },
  tileBadge: {
    position: "absolute",
    bottom: 4,
    insetInlineStart: 4,
    backgroundColor: "rgba(0,0,0,0.6)",
    borderRadius: radius.sm,
    paddingHorizontal: 5,
    paddingVertical: 1,
  },
  tileBadgeText: { color: C.goldLight, fontSize: type.xs, fontWeight: "800" },
  tileOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(7,7,10,0.55)",
  },
  tileRemove: {
    position: "absolute",
    top: 4,
    insetInlineEnd: 4,
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(212,83,58,0.92)",
  },
  tileRemoveText: { color: "#fff", fontSize: type.sm, fontWeight: "800" },
  sheetBackdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.55)" },
  sheet: {
    backgroundColor: "#12110c",
    borderTopLeftRadius: radius["2xl"],
    borderTopRightRadius: radius["2xl"],
    borderColor: "rgba(201,168,76,0.25)",
    borderWidth: 1,
    paddingHorizontal: space[5],
    paddingTop: space[3],
    gap: space[3],
  },
  sheetHandle: {
    alignSelf: "center",
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: "rgba(201,168,76,0.4)",
    marginBottom: space[2],
  },
  sheetTitle: { color: C.gold, fontSize: type.xl, fontWeight: "800", textAlign: "right" },
  fieldWrap: { gap: space[1] },
  label: { color: C.dim, fontSize: type.sm, fontWeight: "700", textAlign: "right" },
  dateRow: { flexDirection: "row", alignItems: "center", gap: space[2] },
  dateInput: {
    flex: 1,
    backgroundColor: "rgba(255,255,255,0.04)",
    borderColor: "rgba(201,168,76,0.3)",
    borderWidth: 1,
    borderRadius: radius.md,
    paddingHorizontal: space[4],
    paddingVertical: space[3],
  },
  dateText: { color: C.goldLight, fontSize: type.lg, textAlign: "right" },
  datePlaceholder: { color: C.dim },
});
