// Terms & Conditions + Privacy — sections from the shared i18n registry. Pushed
// screen (reached from the header kebab).
import { useEffect, useState } from "react";
import { ScrollView, View, Text, Pressable, Linking, StyleSheet } from "react-native";
import { usePortal } from "../../src/portal/PortalContext.jsx";
import { ScreenHeader } from "../../src/ui/ScreenHeader.jsx";
import { fetchPublicSettings } from "@dawa/core/services/publicSettings.js";
import { resolveContact, buildWhatsAppUrl, mailtoUrl } from "@dawa/core/utils/contact.js";
import { C, space, radius, type } from "../../src/ui/theme.js";

function SectionCard({ title, body }) {
  return (
    <View style={styles.card}>
      <Text style={styles.cardTitle}>{title}</Text>
      <Text style={styles.cardBody}>{body}</Text>
    </View>
  );
}

export default function Terms() {
  const { t, lang } = usePortal();
  const sections = Array.isArray(t("terms_sections")) ? t("terms_sections") : [];
  const privacy = Array.isArray(t("terms_privacy_sections")) ? t("terms_privacy_sections") : [];

  const [contact, setContact] = useState(() => resolveContact(null));
  useEffect(() => {
    let alive = true;
    fetchPublicSettings()
      .then((s) => alive && setContact(resolveContact(s)))
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);

  const waUrl = buildWhatsAppUrl(
    contact.whatsapp,
    lang === "he" ? "שלום, יש לי שאלה לגבי דעוה" : "مرحباً، لديّ استفسار بخصوص دعوة",
  );
  const mUrl = mailtoUrl(contact.email);
  const open = (url) => url && Linking.openURL(url).catch(() => {});

  return (
    <View style={styles.screen}>
      <ScreenHeader title={t("terms_title") || "الشروط والخصوصية"} back />
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.intro}>{t("terms_intro")}</Text>
        {sections.map((s, i) => (
          <SectionCard key={i} title={s.title} body={s.body} />
        ))}
        {privacy.length > 0 ? (
          <>
            <Text style={styles.subhead}>{t("terms_privacy_title")}</Text>
            {t("terms_privacy_intro") ? (
              <Text style={styles.intro}>{t("terms_privacy_intro")}</Text>
            ) : null}
            {privacy.map((s, i) => (
              <SectionCard key={i} title={s.title} body={s.body} />
            ))}
          </>
        ) : null}
        {waUrl || mUrl ? (
          <View style={styles.contactCard}>
            <Text style={styles.contactHeading}>{t("terms_contact_heading")}</Text>
            <View style={styles.links}>
              {waUrl ? (
                <Pressable style={styles.link} onPress={() => open(waUrl)}>
                  <Text style={styles.linkText}>💬 WhatsApp</Text>
                </Pressable>
              ) : null}
              {mUrl ? (
                <Pressable style={styles.link} onPress={() => open(mUrl)}>
                  <Text style={styles.linkText}>✉ {contact.email}</Text>
                </Pressable>
              ) : null}
            </View>
          </View>
        ) : null}
        <Text style={styles.footer}>
          © {new Date().getFullYear()} {lang === "he" ? "דעוה" : "دعوة"}
        </Text>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: C.bg },
  content: { padding: space[5], paddingBottom: space[12] },
  intro: {
    color: "#d8c9a6",
    fontSize: type.lg,
    lineHeight: 26,
    marginBottom: space[5],
    paddingStart: space[4],
    borderStartColor: "rgba(201,168,76,0.35)",
    borderStartWidth: 2,
    textAlign: "right",
  },
  subhead: {
    color: C.goldLight,
    fontSize: type["3xl"],
    fontWeight: "900",
    marginTop: space[8],
    marginBottom: space[4],
    paddingBottom: space[3],
    borderBottomColor: "rgba(201,168,76,0.22)",
    borderBottomWidth: 1,
    textAlign: "right",
  },
  card: {
    padding: space[5],
    marginBottom: space[4],
    borderRadius: radius["2xl"],
    backgroundColor: "rgba(201,168,76,0.03)",
    borderColor: "rgba(201,168,76,0.18)",
    borderWidth: 1,
  },
  cardTitle: {
    color: C.goldLight,
    fontSize: type["2xl"],
    fontWeight: "800",
    marginBottom: space[3],
    textAlign: "right",
  },
  cardBody: { color: "#d8c9a6", fontSize: type.md, lineHeight: 27, textAlign: "right" },
  contactCard: {
    marginTop: space[6],
    padding: space[5],
    borderRadius: radius["2xl"],
    backgroundColor: "rgba(201,168,76,0.05)",
    borderColor: "rgba(201,168,76,0.22)",
    borderWidth: 1,
    alignItems: "center",
    gap: space[3],
  },
  contactHeading: { color: C.goldLight, fontSize: type["2xl"], fontWeight: "800" },
  links: { flexDirection: "row", flexWrap: "wrap", gap: space[3], justifyContent: "center" },
  link: {
    paddingHorizontal: space[5],
    paddingVertical: space[3],
    borderRadius: radius.pill,
    borderColor: "rgba(201,168,76,0.35)",
    borderWidth: 1,
    backgroundColor: "rgba(201,168,76,0.08)",
  },
  linkText: { color: C.goldLight, fontSize: type.md, fontWeight: "700" },
  footer: {
    marginTop: space[10],
    paddingTop: space[5],
    borderTopColor: "rgba(201,168,76,0.14)",
    borderTopWidth: 1,
    color: C.dim,
    fontSize: type.sm,
    textAlign: "center",
  },
});
