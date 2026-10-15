import { ScrollView, StyleSheet, Text, View } from "react-native";
import { Image } from "expo-image";
import { router } from "expo-router";
import Ionicons from "@expo/vector-icons/Ionicons";
import { useAuth } from "@/lib/auth";
import { useTranslation, type TranslationKey } from "@/lib/i18n";
import { RADIUS, useTheme } from "@/lib/theme";
import { useApi } from "@/lib/use-api";
import { AppointmentCard, type CustomerAppointment } from "@/components/AppointmentCard";
import { Avatar, Card, EmptyState, Screen, ScreenTitle, SectionLink, SectionTitle, Skeleton, type IconName } from "@/components/kit";
import type { Catalog } from "@/lib/types";

/**
 * Home answers one question — "when is my next haircut?" — and everything else
 * is a step down in weight.
 */

function greetingKey(): TranslationKey {
  const hour = new Date().getHours();
  if (hour < 12) return "app.goodMorning";
  if (hour < 17) return "app.goodAfternoon";
  return "app.goodEvening";
}

export default function HomeScreen() {
  const { colors } = useTheme();
  const { t, lang, fmtCurrency } = useTranslation();
  const { user } = useAuth();
  const upcoming = useApi<CustomerAppointment[]>("/api/customer/appointments?scope=upcoming");
  const catalog = useApi<Catalog>("/api/customer/catalog");

  const refresh = () => {
    void upcoming.refresh();
    void catalog.refresh();
  };

  const list = upcoming.data ?? null;
  const next = list?.[0];
  const firstName = user?.name?.trim().split(" ")[0];
  const barbers = catalog.data?.barbers.slice(0, 6) ?? [];
  const offers = catalog.data?.offers.slice(0, 2) ?? [];

  return (
    <Screen refreshing={upcoming.refreshing} onRefresh={refresh}>
      <ScreenTitle title={firstName ? `${t(greetingKey())}, ${firstName}` : t(greetingKey())} hint={t("app.greetingHint")} />

      <View>
        {list === null ? (
          upcoming.error ? (
            <EmptyState icon="cloud-offline-outline" title={t("appointments.networkError")} />
          ) : (
            <Skeleton height={176} />
          )
        ) : next ? (
          <>
            <SectionTitle action={<SectionLink label={t("app.seeAll")} onPress={() => router.push("/appointments")} />}>
              {t("app.nextAppointment")}
            </SectionTitle>
            <AppointmentCard appointment={next} highlight />
          </>
        ) : (
          <EmptyState icon="cut-outline" title={t("app.nothingBooked")} hint={t("app.bookingComing")} />
        )}
      </View>

      {list && list.length > 1 && (
        <View>
          <SectionTitle>{t("app.alsoBooked")}</SectionTitle>
          <View style={{ gap: 8 }}>
            {list.slice(1).map((a) => (
              <AppointmentCard key={a.id} appointment={a} />
            ))}
          </View>
        </View>
      )}

      {offers.length > 0 && (
        <View>
          <SectionTitle>{t("app.offers")}</SectionTitle>
          <View style={{ gap: 8 }}>
            {offers.map((o) => (
              <Card key={o.id} style={[styles.row, { padding: 16, justifyContent: "space-between" }]}>
                <Text numberOfLines={1} style={{ flex: 1, color: colors.ink, fontWeight: "500" }}>
                  {lang === "ar" && o.titleAr ? o.titleAr : o.title}
                </Text>
                {o.price !== null && (
                  <Text style={{ color: colors.accent, fontWeight: "600", fontVariant: ["tabular-nums"] }}>
                    {fmtCurrency(o.price)}
                    {o.wasPrice !== null ? (
                      <Text style={{ color: colors.faint, fontSize: 12, textDecorationLine: "line-through" }}>
                        {"  "}
                        {fmtCurrency(o.wasPrice)}
                      </Text>
                    ) : null}
                  </Text>
                )}
              </Card>
            ))}
          </View>
        </View>
      )}

      {barbers.length > 0 && (
        <View>
          <SectionTitle>{t("app.ourBarbers")}</SectionTitle>
          {/* Led by the barber's own work where there is any: a customer picks
              a barber by the cuts long before the name. */}
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 12 }} style={{ marginHorizontal: -20 }}>
            <View style={{ width: 8 }} />
            {barbers.map((b) => (
              <Card key={b.id} style={{ width: 152, overflow: "hidden" }}>
                {b.work?.[0] ? (
                  <Image source={{ uri: b.work[0] }} alt="" style={{ width: 152, height: 114 }} contentFit="cover" />
                ) : (
                  <View style={[styles.monogram, { backgroundColor: colors.accentSoft }]}>
                    <Avatar name={b.name} photo={b.photo} size={48} />
                  </View>
                )}
                <View style={{ padding: 12, gap: 4 }}>
                  <Text numberOfLines={1} style={{ color: colors.ink, fontSize: 14, fontWeight: "500" }}>
                    {b.name}
                  </Text>
                  {b.rating.average !== null && (
                    <View style={styles.row}>
                      <Ionicons name="star" size={12} color={colors.accent} />
                      <Text style={{ color: colors.mid, fontSize: 12, fontVariant: ["tabular-nums"] }}>
                        {b.rating.average.toFixed(1)} · {b.rating.count}
                      </Text>
                    </View>
                  )}
                </View>
              </Card>
            ))}
            <View style={{ width: 8 }} />
          </ScrollView>
        </View>
      )}

      <View style={styles.grid}>
        <QuickLink icon="receipt-outline" label={t("prices.title")} hint={t("prices.hint")} onPress={() => router.push("/prices")} />
        <QuickLink
          icon="calendar-outline"
          label={t("app.myAppointments")}
          hint={t("app.historyHint")}
          onPress={() => router.push("/appointments")}
        />
      </View>
    </Screen>
  );
}

function QuickLink({ icon, label, hint, onPress }: { icon: IconName; label: string; hint: string; onPress: () => void }) {
  const { colors } = useTheme();
  return (
    <Card onPress={onPress} style={{ flex: 1, padding: 16 }}>
      <View style={[styles.quickIcon, { backgroundColor: colors.accentSoft }]}>
        <Ionicons name={icon} size={20} color={colors.accent} />
      </View>
      <Text style={{ color: colors.ink, fontSize: 14, fontWeight: "600" }}>{label}</Text>
      <Text style={{ color: colors.soft, fontSize: 11, marginTop: 2 }}>{hint}</Text>
    </Card>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", gap: 6 },
  grid: { flexDirection: "row", gap: 8 },
  monogram: { height: 88, alignItems: "center", justifyContent: "center" },
  quickIcon: { width: 36, height: 36, borderRadius: RADIUS, alignItems: "center", justifyContent: "center", marginBottom: 8 },
});
