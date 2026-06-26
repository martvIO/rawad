// Manage — wedding lifecycle: postpone / pause-resume / cancel (with grace-period
// undo). Native port of the web GroomManage; reuses @dawa/core lifecycle services.
import { useState } from "react";
import { View, Text, TextInput, Pressable, ScrollView, StyleSheet } from "react-native";
import { ScreenHeader } from "../../src/ui/ScreenHeader.jsx";
import { usePortal } from "../../src/portal/PortalContext.jsx";
import { useGroomLifecycle } from "../../src/portal/useGroomLifecycle.js";
import {
  requestCancellation,
  undoCancellation,
  pauseWedding,
  resumeWedding,
} from "@dawa/core/services/lifecycle.js";
import { localizeApiError } from "@dawa/core/utils/apiError.js";
import { DatePickerField, fmtDate } from "../../src/ui/primitives.jsx";
import { C, space, radius, type } from "../../src/ui/theme.js";

const STATE_COLOR = {
  active: "#4cc97a",
  cancel_pending: C.red,
  cancelled: C.red,
  paused: "#f0c84c",
};

const BTN = {
  gold: { bg: C.gold, border: C.gold, fg: C.bg },
  amber: { bg: "rgba(255,180,80,0.08)", border: "rgba(255,180,80,0.32)", fg: "#f0c84c" },
  red: { bg: C.red, border: C.red, fg: "#fff" },
  redOutline: { bg: "rgba(212,80,58,0.08)", border: "rgba(212,80,58,0.35)", fg: C.red },
  ghost: { bg: "rgba(255,255,255,0.05)", border: "rgba(255,255,255,0.15)", fg: C.dim },
};

function Btn({ label, onPress, disabled, variant = "gold", flex }) {
  const v = BTN[variant] || BTN.gold;
  return (
    <Pressable
      onPress={disabled ? undefined : onPress}
      style={[
        styles.btn,
        { backgroundColor: v.bg, borderColor: v.border },
        flex && { flex: 1 },
        disabled && { opacity: 0.5 },
      ]}
    >
      <Text style={[styles.btnText, { color: v.fg }]}>{label}</Text>
    </Pressable>
  );
}

export default function Manage() {
  const { t } = usePortal();
  const { status, data, loading, reload } = useGroomLifecycle();
  const [reason, setReason] = useState("");
  const [confirming, setConfirming] = useState(false);
  const [newDate, setNewDate] = useState(null); // epoch ms
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const run = async (fn) => {
    setBusy(true);
    setErr("");
    try {
      await fn();
      reload();
      setConfirming(false);
      setReason("");
      setNewDate(null);
    } catch (e) {
      setErr(localizeApiError(e, t, t("lc_action_failed")));
    } finally {
      setBusy(false);
    }
  };

  const stateLabel =
    {
      active: t("lc_state_active"),
      cancel_pending: t("lc_state_cancel_pending"),
      cancelled: t("lc_state_cancelled"),
      paused: t("lc_state_paused"),
    }[status] || status || "";
  const color = STATE_COLOR[status] || C.dim;
  const graceStr =
    typeof data?.cancelGraceEndsAt === "number" ? fmtDate(data.cancelGraceEndsAt) : null;

  return (
    <View style={styles.screen}>
      <ScreenHeader title={t("tab_manage") || "إدارة"} />
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.h1}>{t("lc_title")}</Text>
        <Text style={styles.subtitle}>{t("lc_subtitle")}</Text>

        <View style={styles.statusRow}>
          <Text style={styles.statusLabel}>{t("lc_current_status")}</Text>
          <View style={[styles.statusChip, { borderColor: color + "55", backgroundColor: color + "14" }]}>
            <Text style={[styles.statusChipText, { color }]}>{loading ? "…" : stateLabel}</Text>
          </View>
        </View>

        {err ? <Text style={styles.err}>{err}</Text> : null}

        {status === "cancel_pending" ? (
          <View style={[styles.card, styles.cardRed]}>
            <Text style={styles.bannerRed}>{t("lc_pending_banner")}</Text>
            {graceStr ? (
              <Text style={styles.muted}>
                {t("lc_grace_until")}: {graceStr}
              </Text>
            ) : null}
            <Btn label={t("lc_undo_btn")} onPress={() => run(() => undoCancellation())} disabled={busy} />
          </View>
        ) : null}

        {status === "cancelled" ? (
          <View style={[styles.card, styles.cardRed]}>
            <Text style={styles.bannerRed}>{t("lc_cancelled_banner")}</Text>
          </View>
        ) : null}

        {status === "paused" ? (
          <View style={[styles.card, styles.cardAmber]}>
            <Text style={styles.bannerAmber}>{t("lc_paused_banner")}</Text>
            <Btn label={t("lc_resume_btn")} onPress={() => run(() => resumeWedding())} disabled={busy} />
          </View>
        ) : null}

        {status === "active" || status === "paused" ? (
          <>
            {status === "active" ? (
              <View style={styles.card}>
                <Text style={styles.cardTitleGold}>{t("lc_postpone_title")}</Text>
                <Text style={styles.muted}>{t("lc_postpone_desc")}</Text>
                <DatePickerField label={t("lc_new_date")} value={newDate} onChange={setNewDate} />
                <Btn
                  label={t("lc_pause_btn")}
                  onPress={() => run(() => pauseWedding(newDate || null))}
                  disabled={busy}
                  variant="amber"
                />
              </View>
            ) : null}

            <View style={[styles.card, styles.cardRed]}>
              <Text style={styles.cardTitleRed}>{t("lc_cancel_title")}</Text>
              <Text style={styles.muted}>{t("lc_cancel_desc")}</Text>
              <Text style={styles.fieldLabel}>{t("lc_cancel_reason")}</Text>
              <TextInput
                style={styles.textarea}
                value={reason}
                onChangeText={(v) => setReason(v.slice(0, 500))}
                multiline
                placeholderTextColor={C.dim}
              />
              {!confirming ? (
                <Btn label={t("lc_cancel_btn")} onPress={() => setConfirming(true)} disabled={busy} variant="redOutline" />
              ) : (
                <View>
                  <Text style={styles.confirmText}>{t("lc_cancel_confirm")}</Text>
                  <View style={styles.confirmRow}>
                    <Btn
                      label={t("lc_yes_cancel")}
                      onPress={() => run(() => requestCancellation(reason))}
                      disabled={busy}
                      variant="red"
                      flex
                    />
                    <Btn label={t("lc_no_keep")} onPress={() => setConfirming(false)} disabled={busy} variant="ghost" flex />
                  </View>
                </View>
              )}
            </View>
          </>
        ) : null}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: C.bg },
  content: { padding: space[5], paddingBottom: space[12], gap: space[1] },
  h1: { color: C.gold, fontSize: type["3xl"], fontWeight: "900", textAlign: "right" },
  subtitle: { color: C.dim, fontSize: type.base, lineHeight: 22, marginBottom: space[4], textAlign: "right" },
  statusRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: "rgba(255,255,255,0.03)",
    borderColor: "rgba(201,168,76,0.2)",
    borderWidth: 1,
    borderRadius: radius.xl,
    paddingHorizontal: space[4],
    paddingVertical: space[3],
    marginBottom: space[3],
  },
  statusLabel: { color: C.goldDim, fontSize: type.base },
  statusChip: { paddingHorizontal: space[3], paddingVertical: space[1], borderRadius: radius.pill, borderWidth: 1 },
  statusChipText: { fontSize: type.sm, fontWeight: "800" },
  err: { color: C.red, fontSize: type.sm, textAlign: "center", marginBottom: space[2] },
  card: {
    backgroundColor: "rgba(255,255,255,0.03)",
    borderColor: "rgba(201,168,76,0.2)",
    borderWidth: 1,
    borderRadius: radius.xl,
    padding: space[4],
    marginBottom: space[3],
    gap: space[3],
  },
  cardRed: { borderColor: "rgba(212,80,58,0.3)" },
  cardAmber: { borderColor: "rgba(255,180,80,0.3)" },
  bannerRed: { color: C.red, fontSize: type.base, fontWeight: "700", lineHeight: 22, textAlign: "right" },
  bannerAmber: { color: "#f0c84c", fontSize: type.base, fontWeight: "700", lineHeight: 22, textAlign: "right" },
  cardTitleGold: { color: C.gold, fontSize: type.lg, fontWeight: "800", textAlign: "right" },
  cardTitleRed: { color: C.red, fontSize: type.lg, fontWeight: "800", textAlign: "right" },
  muted: { color: C.dim, fontSize: type.sm, lineHeight: 20, textAlign: "right" },
  fieldLabel: { color: C.goldDim, fontSize: type.sm, textAlign: "right" },
  textarea: {
    backgroundColor: "rgba(255,255,255,0.04)",
    borderColor: "rgba(201,168,76,0.3)",
    borderWidth: 1,
    borderRadius: radius.md,
    padding: space[3],
    color: C.goldLight,
    fontSize: type.md,
    minHeight: 64,
    textAlign: "right",
    textAlignVertical: "top",
  },
  confirmText: { color: C.red, fontSize: type.base, fontWeight: "700", textAlign: "center", marginBottom: space[2] },
  confirmRow: { flexDirection: "row", gap: space[2] },
  btn: {
    paddingVertical: space[3],
    borderRadius: radius.md,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  btnText: { fontSize: type.md, fontWeight: "800" },
});
