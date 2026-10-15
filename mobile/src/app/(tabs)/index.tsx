import { Pressable, ScrollView, StyleSheet, View } from "react-native";
import { Image } from "expo-image";
import { router } from "expo-router";
import Ionicons from "@expo/vector-icons/Ionicons";
import { useAuth } from "@/lib/auth";
import { useTranslation, type TranslationKey } from "@/lib/i18n";
import { RADIUS, arch, useTheme } from "@/lib/theme";
import { useApi } from "@/lib/use-api";
import { AppointmentCard, type CustomerAppointment } from "@/components/AppointmentCard";
import { T, Button, Card, EmptyState, Screen, SectionLink, SectionTitle, Skeleton, type IconName } from "@/components/kit";
import type { Catalog, Me, Reviewable, Usual } from "@/lib/types";
import { ReviewPrompt } from "@/components/ReviewPrompt";
import { BusyCard } from "@/components/BusyCard";
import { LoyaltyCard } from "@/components/LoyaltyCard";
import { UsualCard } from "@/components/UsualCard";
import { HeaderBand } from "@/components/ornament";

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
  const usual = useApi<{ usual: Usual | null }>("/api/customer/usual");
  const me = useApi<Me>("/api/customer/me");
  const reviews = useApi<Reviewable[]>("/api/customer/reviews");

  const refresh = () => {
    void upcoming.refresh();
    void catalog.refresh();
    void usual.refresh();
    void me.refresh();
  };

  const list = upcoming.data ?? null;
  const next = list?.[0];
  const firstName = user?.name?.trim().split(" ")[0];
  const barbers = catalog.data?.barbers.slice(0, 6) ?? [];
  const offers = catalog.data?.offers.slice(0, 2) ?? [];
  const habit = usual.data?.usual?.times.length ? usual.data.usual : null;
  const loyalty = me.data?.loyalty ?? null;
  // The last cut they have not said anything about — asked once, here.
  const toRate = reviews.data?.find((r) => r.canReview && !r.review) ?? null;

  return (
    <Screen padTop={false} refreshing={upcoming.refreshing} onRefresh={refresh}>
      <HeaderBand title={firstName ? `${t(greetingKey())}, ${firstName}` : t(greetingKey())} hint={t("app.greetingHint")} />

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
            <AppointmentCard
              appointment={next}
              highlight
              actions={
                <>
                  <Button tone="secondary" label={t("app.manage")} onPress={() => router.push("/appointments")} style={{ flex: 1 }} />
                  <Button label={t("app.bookAnother")} onPress={() => router.push("/book")} style={{ flex: 1 }} />
                </>
              }
            />
          </>
        ) : (
          <EmptyState
            icon="cut-outline"
            title={t("app.nothingBooked")}
            hint={t("app.nothingBookedHint")}
            action={<Button label={t("app.bookNow")} onPress={() => router.push("/book")} />}
          />
        )}
      </View>

      {habit && (
        <View>
          <SectionTitle>{t("app.usualTitle")}</SectionTitle>
          <UsualCard usual={habit} />
        </View>
      )}

      {/* Under the usual on purpose: first what they came for, then whether now
          is the moment to act on it. It hides itself when it has nothing honest to say. */}
      <BusyCard />

      {/* Only when there is something to collect; the card itself lives on the profile. */}
      {loyalty && loyalty.available > 0 && (
        <View>
          <SectionTitle>{t("app.loyaltyTitle")}</SectionTitle>
          <LoyaltyCard loyalty={loyalty} />
        </View>
      )}

      {toRate && (
        <View>
          <SectionTitle>{t("app.rate")}</SectionTitle>
          {/* Keyed by the cut, so answering one never carries its stars to the next. */}
          <ReviewPrompt key={toRate.appointmentId ?? toRate.visitId} item={toRate} />
        </View>
      )}

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
                <T numberOfLines={1} style={{ flex: 1, color: colors.ink, fontWeight: "500" }}>
                  {lang === "ar" && o.titleAr ? o.titleAr : o.title}
                </T>
                {o.price !== null && (
                  <T style={{ color: colors.accent, fontWeight: "600", fontVariant: ["tabular-nums"] }}>
                    {fmtCurrency(o.price)}
                    {o.wasPrice !== null ? (
                      <T style={{ color: colors.faint, fontSize: 12, textDecorationLine: "line-through" }}>
                        {"  "}
                        {fmtCurrency(o.wasPrice)}
                      </T>
                    ) : null}
                  </T>
                )}
              </Card>
            ))}
          </View>
        </View>
      )}

      {barbers.length > 0 && (
        <View>
          <SectionTitle>{t("app.ourBarbers")}</SectionTitle>
          {/* Each barber in an arched window, filled with their own work where
              there is any: a customer picks a barber by the cuts long before
              the name. Until then, the window holds their initial. */}
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 10 }} style={{ marginHorizontal: -20 }}>
            <View style={{ width: 10 }} />
            {barbers.map((b) => {
              const face = b.work?.[0] ?? b.photo;
              return (
                <Pressable key={b.id} accessibilityRole="button" accessibilityLabel={b.name} onPress={() => router.push("/book")} style={{ width: 84 }}>
                  <View style={[styles.alcove, arch(84), { backgroundColor: colors.line }]}>
                    {face ? (
                      <Image source={{ uri: face }} alt="" style={StyleSheet.absoluteFill} contentFit="cover" />
                    ) : (
                      <T display style={{ color: colors.mid, fontSize: 26, fontWeight: "700" }}>
                        {b.name.trim()[0]?.toUpperCase()}
                      </T>
                    )}
                  </View>
                  <T numberOfLines={1} style={{ color: colors.ink, fontSize: 12, textAlign: "center", marginTop: 6 }}>
                    {b.name}
                  </T>
                  {b.rating.average !== null ? (
                    <T style={{ color: colors.accent, fontSize: 11, textAlign: "center" }}>★ {b.rating.average.toFixed(1)}</T>
                  ) : null}
                </Pressable>
              );
            })}
            <View style={{ width: 10 }} />
          </ScrollView>
        </View>
      )}

      <View style={styles.grid}>
        <QuickLink
          icon="add-circle-outline"
          label={t("app.bookAppointment")}
          hint={t("app.bookAppointmentHint")}
          onPress={() => router.push("/book")}
        />
        <QuickLink icon="receipt-outline" label={t("prices.title")} hint={t("prices.hint")} onPress={() => router.push("/prices")} />
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
      <T style={{ color: colors.ink, fontSize: 14, fontWeight: "600" }}>{label}</T>
      <T style={{ color: colors.soft, fontSize: 11, marginTop: 2 }}>{hint}</T>
    </Card>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", gap: 6 },
  grid: { flexDirection: "row", gap: 8 },
  alcove: { height: 104, alignItems: "center", justifyContent: "center", overflow: "hidden" },
  quickIcon: { width: 36, height: 36, borderRadius: RADIUS, alignItems: "center", justifyContent: "center", marginBottom: 8 },
});
