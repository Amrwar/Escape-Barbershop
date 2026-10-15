import { StyleSheet, View } from "react-native";
import { useTranslation } from "@/lib/i18n";
import { useTheme } from "@/lib/theme";
import { useApi } from "@/lib/use-api";
import type { Catalog, Service } from "@/lib/types";
import { T, Button, Card, EmptyState, Screen, Skeleton } from "@/components/kit";

/**
 * The price list, open to anybody. "What does a beard trim cost" is the most
 * ordinary question a customer has, and it should never need an account.
 */
export default function PricesScreen() {
  const { colors } = useTheme();
  const { t, lang, fmtCurrency } = useTranslation();
  const { data, error, refreshing, refresh, reload } = useApi<Catalog>("/api/customer/catalog");
  const services = data?.services ?? null;
  const name = (s: Service) => (lang === "ar" && s.arabicName ? s.arabicName : s.name);

  return (
    <Screen padTop={false} refreshing={refreshing} onRefresh={refresh}>
      <T style={{ color: colors.soft, fontSize: 14 }}>{t("prices.hint")}</T>

      {services === null ? (
        error ? (
          <EmptyState
            icon="cloud-offline-outline"
            title={t("appointments.networkError")}
            action={<Button tone="secondary" label={t("action.retry")} onPress={reload} />}
          />
        ) : (
          <View style={{ gap: 8 }}>
            {[0, 1, 2, 3, 4].map((i) => (
              <Skeleton key={i} height={56} />
            ))}
          </View>
        )
      ) : services.length === 0 ? (
        <EmptyState icon="cut-outline" title={t("prices.none")} hint={t("prices.noneHint")} />
      ) : (
        <View style={{ gap: 16 }}>
          <Card>
            {services.map((s, i) => (
              <View
                key={s.id}
                style={[
                  styles.row,
                  i > 0 && { borderTopColor: colors.line, borderTopWidth: StyleSheet.hairlineWidth },
                ]}
              >
                <View style={{ flex: 1 }}>
                  <T numberOfLines={1} style={{ color: colors.ink, fontSize: 14, fontWeight: "500" }}>
                    {name(s)}
                  </T>
                  <T style={{ color: colors.soft, fontSize: 12 }}>
                    {s.durationMinutes} {t("appointments.minutesShort")}
                  </T>
                </View>
                <T style={{ color: colors.accent, fontSize: 18, fontVariant: ["tabular-nums"] }}>
                  {fmtCurrency(s.defaultPrice)}
                </T>
              </View>
            ))}
          </Card>
          {/* The price list is a guide; the till charges what the shop decides. */}
          <T style={{ color: colors.faint, fontSize: 12, textAlign: "center" }}>{t("prices.guide")}</T>
        </View>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "baseline", gap: 16, padding: 16 },
});
