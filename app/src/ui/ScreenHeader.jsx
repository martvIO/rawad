// Per-screen header: title + language toggle + overflow (kebab) menu with
// Help / Terms / Logout. Used by all groom screens (the Tabs header is hidden).
import { useState } from "react";
import { View, Text, Pressable, Modal, StyleSheet } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { usePortal } from "../portal/PortalContext.jsx";
import { C, space, radius, type } from "./theme.js";

export function LangToggle() {
  const { lang, setLang } = usePortal();
  return (
    <View style={styles.langWrap}>
      {["ar", "he"].map((l) => (
        <Pressable
          key={l}
          onPress={() => setLang(l)}
          style={[styles.langBtn, lang === l && styles.langBtnOn]}
        >
          <Text style={[styles.langText, lang === l && styles.langTextOn]}>
            {l === "ar" ? "ع" : "עב"}
          </Text>
        </Pressable>
      ))}
    </View>
  );
}

function MenuItem({ label, onPress, danger }) {
  return (
    <Pressable onPress={onPress} style={styles.menuItem}>
      <Text style={[styles.menuText, danger && styles.menuDanger]}>{label}</Text>
    </Pressable>
  );
}

export function HeaderMenu() {
  const { t, logout } = usePortal();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const go = (fn) => {
    setOpen(false);
    fn();
  };
  return (
    <>
      <Pressable onPress={() => setOpen(true)} hitSlop={8} style={styles.kebab}>
        <Text style={styles.kebabText}>⋮</Text>
      </Pressable>
      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <Pressable style={styles.menuBackdrop} onPress={() => setOpen(false)}>
          <View style={styles.menu}>
            <MenuItem label={t("help_title") || "المساعدة"} onPress={() => go(() => router.push("/help"))} />
            <MenuItem label={t("terms_title") || "الشروط والخصوصية"} onPress={() => go(() => router.push("/terms"))} />
            <MenuItem label={t("logout") || "تسجيل الخروج"} danger onPress={() => go(logout)} />
          </View>
        </Pressable>
      </Modal>
    </>
  );
}

export function ScreenHeader({ title, back }) {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  return (
    <View style={[styles.header, { paddingTop: insets.top + space[2] }]}>
      <View style={styles.side}>
        {back ? (
          <Pressable onPress={() => router.back()} hitSlop={8}>
            <Text style={styles.back}>‹</Text>
          </Pressable>
        ) : (
          <LangToggle />
        )}
      </View>
      <Text style={styles.title} numberOfLines={1}>
        {title}
      </Text>
      <View style={[styles.side, styles.sideEnd]}>
        {back ? <LangToggle /> : <HeaderMenu />}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: space[4],
    paddingBottom: space[3],
    backgroundColor: C.bg,
    borderBottomColor: "rgba(201,168,76,0.15)",
    borderBottomWidth: 1,
    gap: space[2],
  },
  side: { minWidth: 64, justifyContent: "center" },
  sideEnd: { alignItems: "flex-end" },
  title: { flex: 1, color: C.gold, fontSize: type.xl, fontWeight: "800", textAlign: "center" },
  back: { color: C.goldLight, fontSize: 30, fontWeight: "800", lineHeight: 30 },
  langWrap: {
    flexDirection: "row",
    borderRadius: radius.md,
    overflow: "hidden",
    borderColor: "rgba(201,168,76,0.3)",
    borderWidth: 1,
  },
  langBtn: { paddingHorizontal: space[3], paddingVertical: space[1] },
  langBtnOn: { backgroundColor: "rgba(201,168,76,0.18)" },
  langText: { color: C.dim, fontSize: type.sm, fontWeight: "800" },
  langTextOn: { color: C.gold },
  kebab: { paddingHorizontal: space[2] },
  kebabText: { color: C.goldLight, fontSize: type["2xl"], fontWeight: "900" },
  menuBackdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.35)" },
  menu: {
    position: "absolute",
    top: 64,
    insetInlineStart: space[4],
    minWidth: 200,
    backgroundColor: "#12110c",
    borderColor: "rgba(201,168,76,0.3)",
    borderWidth: 1,
    borderRadius: radius.lg,
    paddingVertical: space[1],
  },
  menuItem: { paddingHorizontal: space[4], paddingVertical: space[3] },
  menuText: { color: C.goldLight, fontSize: type.lg, fontWeight: "700", textAlign: "right" },
  menuDanger: { color: C.red },
});
