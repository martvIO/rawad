// Small set of themed RN primitives shared by the auth + groom screens. Mirrors
// the web app's dark gold-card aesthetic using the @dawa/core tokens. RTL is
// handled globally via I18nManager (see app/_layout.jsx); text aligns right.
import {
  View,
  Text,
  TextInput,
  Pressable,
  ActivityIndicator,
  ScrollView,
  StyleSheet,
} from "react-native";
import { C, space, radius, type } from "./theme.js";

export function Screen({ children }) {
  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={styles.screenContent}
      keyboardShouldPersistTaps="handled"
    >
      {children}
    </ScrollView>
  );
}

export function Card({ children }) {
  return <View style={styles.card}>{children}</View>;
}

export function Heading({ children }) {
  return <Text style={styles.heading}>{children}</Text>;
}

export function Caption({ children }) {
  return <Text style={styles.caption}>{children}</Text>;
}

export function Field({
  label,
  value,
  onChangeText,
  placeholder,
  secureTextEntry,
  autoCapitalize = "none",
  keyboardType = "default",
  testID,
}) {
  return (
    <View style={styles.fieldWrap}>
      {label ? <Text style={styles.label}>{label}</Text> : null}
      <TextInput
        testID={testID}
        style={styles.input}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={C.dim}
        secureTextEntry={secureTextEntry}
        autoCapitalize={autoCapitalize}
        keyboardType={keyboardType}
        autoCorrect={false}
      />
    </View>
  );
}

export function PrimaryButton({ title, onPress, disabled, busy, testID }) {
  const off = disabled || busy;
  return (
    <Pressable
      testID={testID}
      onPress={off ? undefined : onPress}
      style={[styles.btn, off && styles.btnOff]}
    >
      {busy ? (
        <ActivityIndicator color={C.bg} />
      ) : (
        <Text style={styles.btnText}>{title}</Text>
      )}
    </Pressable>
  );
}

export function TextLink({ title, onPress, testID }) {
  return (
    <Pressable onPress={onPress} testID={testID} hitSlop={8}>
      <Text style={styles.link}>{title}</Text>
    </Pressable>
  );
}

export function ErrorBanner({ message, testID }) {
  if (!message) return null;
  return (
    <View style={styles.errorBox} testID={testID}>
      <Text style={styles.errorText}>{message}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: C.bg },
  screenContent: {
    flexGrow: 1,
    justifyContent: "center",
    padding: space[6],
  },
  card: {
    width: "100%",
    maxWidth: 420,
    alignSelf: "center",
    backgroundColor: "rgba(255,255,255,0.03)",
    borderColor: "rgba(201,168,76,0.25)",
    borderWidth: 1,
    borderRadius: radius["2xl"],
    padding: space[6],
    gap: space[4],
  },
  heading: {
    color: C.gold,
    fontSize: type["3xl"],
    fontWeight: "800",
    textAlign: "center",
  },
  caption: { color: C.dim, fontSize: type.base, textAlign: "center" },
  fieldWrap: { gap: space[1] },
  label: { color: C.dim, fontSize: type.sm, fontWeight: "700", textAlign: "right" },
  input: {
    backgroundColor: "rgba(255,255,255,0.04)",
    borderColor: "rgba(201,168,76,0.3)",
    borderWidth: 1,
    borderRadius: radius.md,
    paddingHorizontal: space[4],
    paddingVertical: space[3],
    color: C.goldLight,
    fontSize: type.xl,
    textAlign: "right",
  },
  btn: {
    backgroundColor: C.gold,
    borderRadius: radius.md,
    paddingVertical: space[4],
    alignItems: "center",
    justifyContent: "center",
  },
  btnOff: { opacity: 0.45 },
  btnText: { color: C.bg, fontSize: type.xl, fontWeight: "800" },
  link: { color: C.blue, fontSize: type.md, textAlign: "center" },
  errorBox: {
    backgroundColor: C.redGlow,
    borderColor: C.red,
    borderWidth: 1,
    borderRadius: radius.md,
    padding: space[3],
  },
  errorText: { color: C.red, fontSize: type.md, textAlign: "right" },
});
