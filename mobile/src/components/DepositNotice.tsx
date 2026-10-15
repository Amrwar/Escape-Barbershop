import { useEffect, useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import * as Clipboard from "expo-clipboard";
import { api } from "@/lib/api";
import { useTranslation } from "@/lib/i18n";
import { RADIUS, useTheme } from "@/lib/theme";
import { T, Card } from "./kit";

/**
 * What to send, where, and what to write on it.
 *
 * A customer asked for a deposit needs three things at a glance: the amount,
 * the number, and the reference — each one tap to copy, because retyping an
 * InstaPay number from memory is how transfers go astray. The address comes
 * from its own route, which answers only a customer who actually owes one.
 */
export function DepositNotice({ amount, reference }: { amount: number; reference: string | null }) {
  const { colors } = useTheme();
  const { t, fmtCurrency } = useTranslation();
  const [instapay, setInstapay] = useState<string | null>(null);
  const [copied, setCopied] = useState<"number" | "ref" | null>(null);

  useEffect(() => {
    api<{ instapay: string | null }>("/api/customer/deposit-address")
      .then((d) => setInstapay(d.instapay))
      .catch(() => setInstapay(null));
  }, []);

  useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(null), 2000);
    return () => clearTimeout(timer);
  }, [copied]);

  const copy = (what: "number" | "ref", value: string) => {
    Clipboard.setStringAsync(value)
      .then(() => setCopied(what))
      // Clipboard refused: the value is on screen to read anyway.
      .catch(() => undefined);
  };

  return (
    <Card raised style={{ padding: 20, gap: 8 }}>
      <T style={[styles.kicker, { color: colors.accent }]}>
        {t("app.depositNeeded", { amount: fmtCurrency(amount) }).toUpperCase()}
      </T>

      {instapay ? (
        <Pressable
          onPress={() => copy("number", instapay)}
          style={[styles.box, { borderColor: colors.line, backgroundColor: colors.surface, marginTop: 8 }]}
        >
          <T style={[styles.label, { color: colors.faint }]}>{t("app.depositTo").toUpperCase()}</T>
          <T style={{ color: colors.ink, fontSize: 20, marginTop: 4, fontVariant: ["tabular-nums"] }}>{instapay}</T>
          {copied === "number" ? <T style={{ color: colors.accent, fontSize: 11, marginTop: 4 }}>{t("app.referralCopied")}</T> : null}
        </Pressable>
      ) : null}

      {reference ? (
        <Pressable
          onPress={() => copy("ref", reference)}
          style={[styles.box, { borderColor: colors.accent, borderStyle: "dashed", backgroundColor: colors.accentSoft }]}
        >
          <T style={[styles.label, { color: colors.faint }]}>{t("app.depositRef").toUpperCase()}</T>
          <T style={{ color: colors.accent, fontSize: 18, fontWeight: "700", letterSpacing: 3, marginTop: 4 }}>{reference}</T>
          {copied === "ref" ? <T style={{ color: colors.accent, fontSize: 11, marginTop: 4 }}>{t("app.referralCopied")}</T> : null}
        </Pressable>
      ) : null}

      <View style={{ marginTop: 4 }}>
        <T style={{ color: colors.mid, fontSize: 14, lineHeight: 20 }}>{t("app.depositHold")}</T>
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  kicker: { fontSize: 10, fontWeight: "700", letterSpacing: 2.4 },
  label: { fontSize: 10, letterSpacing: 1.8 },
  box: { borderWidth: 1, borderRadius: RADIUS, paddingHorizontal: 16, paddingVertical: 12 },
});
