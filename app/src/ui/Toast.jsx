// Top-of-screen transient toast — replaces the web app's showToast(). Mounted
// once in (groom)/_layout; the data context and screens call useToast().show().
import {
  createContext,
  useContext,
  useState,
  useCallback,
  useRef,
} from "react";
import { Animated, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { TIMING } from "@dawa/core/config/index.js";
import { C, radius, space, type } from "./theme.js";

const ToastContext = createContext(null);

// Safe no-op default so a stray useToast() outside the provider never throws.
export const useToast = () => useContext(ToastContext) ?? { show: () => {} };

export function ToastProvider({ children }) {
  const insets = useSafeAreaInsets();
  const [msg, setMsg] = useState("");
  const opacity = useRef(new Animated.Value(0)).current;
  const timer = useRef(null);

  const show = useCallback(
    (text) => {
      if (!text) return;
      setMsg(String(text));
      if (timer.current) clearTimeout(timer.current);
      Animated.timing(opacity, {
        toValue: 1,
        duration: 180,
        useNativeDriver: true,
      }).start();
      timer.current = setTimeout(() => {
        Animated.timing(opacity, {
          toValue: 0,
          duration: 220,
          useNativeDriver: true,
        }).start(() => setMsg(""));
      }, TIMING.TOAST_MS);
    },
    [opacity],
  );

  return (
    <ToastContext.Provider value={{ show }}>
      {children}
      {msg ? (
        <Animated.View
          pointerEvents="none"
          style={[styles.wrap, { top: insets.top + space[2], opacity }]}
        >
          <View style={styles.toast}>
            <Text style={styles.text}>{msg}</Text>
          </View>
        </Animated.View>
      ) : null}
    </ToastContext.Provider>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: "absolute",
    left: space[4],
    right: space[4],
    alignItems: "center",
    zIndex: 999,
  },
  toast: {
    backgroundColor: "rgba(20,18,12,0.96)",
    borderColor: "rgba(201,168,76,0.45)",
    borderWidth: 1,
    borderRadius: radius.pill,
    paddingHorizontal: space[5],
    paddingVertical: space[3],
    maxWidth: 480,
  },
  text: {
    color: C.goldLight,
    fontSize: type.md,
    fontWeight: "700",
    textAlign: "center",
  },
});
