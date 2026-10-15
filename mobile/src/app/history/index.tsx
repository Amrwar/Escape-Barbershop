import { useEffect, useState } from "react";
import { StyleSheet, View } from "react-native";
import { router } from "expo-router";
import { api } from "@/lib/api";
import { useTranslation } from "@/lib/i18n";
import { useTheme } from "@/lib/theme";
import type { Visit } from "@/lib/types";
import { T, Avatar, Button, Card, EmptyState, Screen, Skeleton } from "@/components/kit";
import { Stars } from "@/components/Stars";

/**
 * Every haircut the shop has a record of, which for a regular here is years of
 * them. Newest first, a page at a time — some of these customers have been
 * coming since long before any of this existed.
 */
export default function HistoryScreen() {
  const { colors } = useTheme();
  const { t, lang, fmtCurrency, fmtDate } = useTranslation();
  const [visits, setVisits] = useState<Visit[] | null>(null);
  const [nextBefore, setNextBefore] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);

  // A history only grows at the counter, so it is loaded once, not on every look.
  useEffect(() => {
    api<{ visits: Visit[]; nextBefore: string | null }>("/api/customer/visits")
      .then((d) => {
        setVisits(d.visits);
        setNextBefore(d.nextBefore);
      })
      .catch(() => setFailed(true));
  }, []);

  const more = async () => {
    if (!nextBefore) return;
    setLoadingMore(true);
    try {
      const d = await api<{ visits: Visit[]; nextBefore: string | null }>(
        `/api/customer/visits?before=${encodeURIComponent(nextBefore)}`
      );
      setVisits((current) => [...(current ?? []), ...d.visits]);
      setNextBefore(d.nextBefore);
    } catch {
      // The button stays, so another tap tries again.
    } finally {
      setLoadingMore(false);
    }
  };

  const serviceName = (s: Visit["services"][number]) => (lang === "ar" && s.arabicName ? s.arabicName : s.name) ?? "—";

  return (
    <Screen padTop={false}>
      <T style={{ color: colors.soft, fontSize: 14 }}>{t("history.hint")}</T>

      {visits === null ? (
        failed ? (
          <EmptyState icon="cloud-offline-outline" title={t("appointments.networkError")} />
        ) : (
          <View style={{ gap: 8 }}>
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} height={112} />
            ))}
          </View>
        )
      ) : visits.length === 0 ? (
        <EmptyState icon="cut-outline" title={t("history.none")} hint={t("history.noneHint")} />
      ) : (
        <View style={{ gap: 8 }}>
          {visits.map((visit) => (
            <Card
              key={visit.id}
              onPress={() => router.push({ pathname: "/history/[id]", params: { id: visit.id } })}
              style={[styles.row, { padding: 16 }]}
            >
              <View style={{ flex: 1 }}>
                <T style={{ color: colors.ink, fontSize: 17 }}>{fmtDate(visit.visitAt)}</T>
                <T style={{ color: colors.mid, fontSize: 14, marginTop: 8 }}>
                  {visit.services.map((s) => `${serviceName(s)}${s.quantity > 1 ? ` ×${s.quantity}` : ""}`).join(" + ")}
                </T>
                {visit.products.length > 0 ? (
                  <T style={{ color: colors.soft, fontSize: 12, marginTop: 4 }}>
                    {visit.products.map((p) => `${p.name}${p.quantity > 1 ? ` ×${p.quantity}` : ""}`).join(", ")}
                  </T>
                ) : null}
                {visit.rating !== null ? (
                  <View style={{ marginTop: 8 }}>
                    <Stars rating={visit.rating} />
                  </View>
                ) : null}
              </View>
              <View style={{ alignItems: "flex-end", gap: 8 }}>
                <T style={{ color: colors.accent, fontSize: 17, fontVariant: ["tabular-nums"] }}>{fmtCurrency(visit.total)}</T>
                {visit.barber ? (
                  <View style={[styles.row, { gap: 8, alignItems: "center" }]}>
                    <T style={{ color: colors.soft, fontSize: 12 }}>{visit.barber.name}</T>
                    <Avatar name={visit.barber.name} photo={visit.barber.photo} size={24} />
                  </View>
                ) : null}
              </View>
            </Card>
          ))}
          {nextBefore ? <Button tone="secondary" label={t("history.more")} onPress={more} busy={loadingMore} /> : null}
        </View>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "flex-start", gap: 12 },
});
