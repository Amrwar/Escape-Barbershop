import { StyleSheet, View } from "react-native";
import Svg, { Circle } from "react-native-svg";
import { useTranslation } from "@/lib/i18n";
import { useTheme } from "@/lib/theme";
import type { Loyalty } from "@/lib/types";
import { Lattice, Star } from "./ornament";
import { T } from "./kit";

/**
 * The card of stamps. It has to answer one question from across a room — how
 * many more? — so every visit is an eight-point star, filled in rust once
 * earned and drawn in outline while still to come, with the count beside it.
 *
 * On the profile it is the indigo panel: the lattice behind, a ring that fills
 * with the visits, the count in the middle. A waiting reward is said first, and
 * the ring is full.
 */
export function LoyaltyCard({ loyalty, arch }: { loyalty: Loyalty; arch?: boolean }) {
  const { colors } = useTheme();
  const { t, lang } = useTranslation();
  const reward = (lang === "ar" && loyalty.rewardTextAr) || loyalty.rewardText;
  const ready = loyalty.available > 0;
  // A full card reads as full, rather than as an empty one starting again.
  const filled = ready ? loyalty.visitsRequired : loyalty.stamps;
  const line = ready ? t("app.rewardReadyHint", { reward }) : t("app.loyaltyHint", { count: loyalty.toNext, reward });
  const count = `${filled}/${loyalty.visitsRequired}`;

  if (arch) {
    const size = 150;
    const stroke = 8;
    const r = (size - stroke) / 2;
    const around = 2 * Math.PI * r;
    return (
      <View style={[styles.panel, { backgroundColor: colors.navy }]}>
        <Lattice color={colors.amber} opacity={0.12} size={40} />
        <View style={{ width: size, height: size, alignItems: "center", justifyContent: "center" }}>
          <Svg width={size} height={size} style={StyleSheet.absoluteFill} aria-hidden>
            <Circle cx={size / 2} cy={size / 2} r={r} stroke={colors.navyLine} strokeWidth={stroke} fill="none" />
            <Circle
              cx={size / 2}
              cy={size / 2}
              r={r}
              stroke={colors.amber}
              strokeWidth={stroke}
              fill="none"
              strokeDasharray={`${(around * filled) / loyalty.visitsRequired} ${around}`}
              transform={`rotate(-90 ${size / 2} ${size / 2})`}
            />
          </Svg>
          <T display style={{ color: colors.onNavy, fontSize: 36, fontWeight: "700", writingDirection: "ltr" }}>
            {count}
          </T>
          <T style={{ color: colors.onNavySoft, fontSize: 11 }}>{ready ? t("app.rewardReady") : t("app.loyaltyTitle")}</T>
        </View>
        <T style={{ color: colors.onNavy, fontSize: 14, textAlign: "center", marginTop: 14 }}>{line}</T>
      </View>
    );
  }

  return (
    <View style={[styles.card, { backgroundColor: colors.surface, borderColor: ready ? colors.accent : colors.line }]}>
      <View style={styles.head}>
        <T style={{ color: ready ? colors.accent : colors.soft, fontSize: 11, fontWeight: "600" }}>
          {ready ? t("app.rewardReady") : t("app.loyaltyTitle")}
        </T>
        <T display style={{ color: colors.ink, fontSize: 22, fontWeight: "700", writingDirection: "ltr" }}>
          {count}
        </T>
      </View>
      <View style={styles.stars}>
        {Array.from({ length: loyalty.visitsRequired }, (_, i) => (
          <View key={i} accessibilityLabel={i < filled ? t("app.stampEarned") : t("app.stampEmpty")}>
            <Star filled={i < filled} color={colors.stamp} outline={colors.faint} />
          </View>
        ))}
      </View>
      <T style={{ color: colors.soft, fontSize: 12, marginTop: 8 }}>{line}</T>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderWidth: 1, padding: 16 },
  head: { flexDirection: "row", alignItems: "baseline", justifyContent: "space-between" },
  stars: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 10 },
  panel: { alignItems: "center", paddingVertical: 24, paddingHorizontal: 18, overflow: "hidden" },
});
