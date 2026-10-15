import { StyleSheet, Text, View } from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import { useTranslation } from "@/lib/i18n";
import { useTheme } from "@/lib/theme";
import type { Loyalty } from "@/lib/types";
import { Card } from "./kit";

/**
 * The punch card. It has to answer one question from across a room: how many
 * more? So an earned stamp — a filled brass disc carrying scissors — looks
 * nothing like an empty one, a hollow dashed ring on a sunken strip. When a
 * reward is waiting the card says so first and loudest.
 */
export function LoyaltyCard({ loyalty }: { loyalty: Loyalty }) {
  const { colors } = useTheme();
  const { t, lang } = useTranslation();
  const reward = (lang === "ar" && loyalty.rewardTextAr) || loyalty.rewardText;
  const ready = loyalty.available > 0;
  // A full card reads as full, rather than as an empty one starting again.
  const filled = ready ? loyalty.visitsRequired : loyalty.stamps;

  return (
    <Card raised style={[{ overflow: "hidden" }, ready && { borderColor: colors.accent }]}>
      <View style={styles.head}>
        <View style={{ flex: 1 }}>
          <Text style={{ color: ready ? colors.accent : colors.ink, fontSize: 14, fontWeight: "600" }}>
            {ready ? t("app.rewardReady") : t("app.loyaltyTitle")}
          </Text>
          <Text style={{ color: colors.mid, fontSize: 14, lineHeight: 20, marginTop: 4 }}>
            {ready ? t("app.rewardReadyHint", { reward }) : t("app.loyaltyHint", { count: loyalty.toNext, reward })}
          </Text>
        </View>
        <Text style={{ color: colors.ink, fontSize: 30, fontWeight: "300", fontVariant: ["tabular-nums"] }}>
          {filled}
          <Text style={{ color: colors.soft }}>/{loyalty.visitsRequired}</Text>
        </Text>
      </View>

      <View style={[styles.strip, { backgroundColor: colors.bg, borderTopColor: colors.line }]}>
        {Array.from({ length: loyalty.visitsRequired }, (_, i) => {
          const earned = i < filled;
          return (
            <View
              key={i}
              accessibilityLabel={earned ? t("app.stampEarned") : t("app.stampEmpty")}
              style={[
                styles.stamp,
                earned
                  ? { backgroundColor: colors.accent, borderColor: colors.accent }
                  : { backgroundColor: colors.surface, borderColor: colors.faint, borderStyle: "dashed" },
              ]}
            >
              {earned ? (
                <Ionicons name="cut" size={14} color={colors.accentInk} />
              ) : (
                <Text style={{ color: colors.soft, fontSize: 11, fontVariant: ["tabular-nums"] }}>{i + 1}</Text>
              )}
            </View>
          );
        })}
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  head: { flexDirection: "row", alignItems: "flex-start", gap: 16, padding: 20, paddingBottom: 16 },
  strip: { flexDirection: "row", flexWrap: "wrap", gap: 10, paddingHorizontal: 20, paddingVertical: 16, borderTopWidth: StyleSheet.hairlineWidth },
  stamp: { width: 32, height: 32, borderRadius: 16, borderWidth: 2, alignItems: "center", justifyContent: "center" },
});
