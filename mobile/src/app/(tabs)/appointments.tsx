import { useEffect, useState } from "react";
import { Alert, Pressable, StyleSheet, Text, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import Ionicons from "@expo/vector-icons/Ionicons";
import { api, ApiError } from "@/lib/api";
import { useTranslation } from "@/lib/i18n";
import { RADIUS, useTheme } from "@/lib/theme";
import { useApi } from "@/lib/use-api";
import { AppointmentCard, type CustomerAppointment } from "@/components/AppointmentCard";
import { DepositNotice } from "@/components/DepositNotice";
import { Button, EmptyState, Notice, Screen, ScreenTitle, Skeleton } from "@/components/kit";

/** Everything the customer has booked: what is coming, and what has been. */
export default function AppointmentsScreen() {
  const { colors } = useTheme();
  const { t } = useTranslation();
  const [tab, setTab] = useState<"upcoming" | "past">("upcoming");
  const { data: items, error: loadError, refreshing, refresh, reload } = useApi<CustomerAppointment[]>(
    `/api/customer/appointments?scope=${tab}`
  );
  const [error, setError] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);

  // Arriving straight from a booking: say so, briefly, then let it go.
  const { booked } = useLocalSearchParams<{ booked?: string }>();
  useEffect(() => {
    if (!booked) return;
    const timer = setTimeout(() => router.setParams({ booked: undefined }), 7000);
    return () => clearTimeout(timer);
  }, [booked]);

  const cancel = (a: CustomerAppointment) =>
    Alert.alert(t("app.cancelConfirm"), undefined, [
      { text: t("app.keepBooking"), style: "cancel" },
      {
        text: t("action.cancel"),
        style: "destructive",
        onPress: async () => {
          setBusyId(a.id);
          setError("");
          try {
            await api(`/api/customer/appointments/${a.id}`, { method: "DELETE" });
          } catch (err) {
            setError(err instanceof ApiError ? err.message : t("appointments.networkError"));
          } finally {
            setBusyId(null);
            void reload();
          }
        },
      },
    ]);

  return (
    <Screen refreshing={refreshing} onRefresh={refresh}>
      <ScreenTitle title={t("app.myAppointments")} />

      {booked ? (
        <View style={[styles.booked, { borderColor: colors.accent, backgroundColor: colors.accentSoft }]}>
          <View style={[styles.tick, { backgroundColor: colors.accent }]}>
            <Ionicons name="checkmark" size={16} color={colors.accentInk} />
          </View>
          <Text style={{ flex: 1, color: colors.accent, fontSize: 14 }}>{t("app.bookedConfirmation")}</Text>
        </View>
      ) : null}

      <View style={{ gap: 20 }}>
        <View style={[styles.segment, { borderColor: colors.line, backgroundColor: colors.surface }]}>
          {(["upcoming", "past"] as const).map((key) => (
            <Pressable
              key={key}
              onPress={() => setTab(key)}
              style={[styles.segmentItem, tab === key && { backgroundColor: colors.raised }]}
            >
              <Text style={{ color: tab === key ? colors.ink : colors.soft, fontSize: 14, fontWeight: "500" }}>
                {t(key === "upcoming" ? "app.upcoming" : "app.past")}
              </Text>
            </Pressable>
          ))}
        </View>

        {error ? <Notice text={error} /> : null}

        {items === null ? (
          loadError ? (
            <EmptyState
              icon="cloud-offline-outline"
              title={t("appointments.networkError")}
              action={<Button tone="secondary" label={t("action.retry")} onPress={reload} />}
            />
          ) : (
            <View style={{ gap: 8 }}>
              {[0, 1, 2].map((i) => (
                <Skeleton key={i} />
              ))}
            </View>
          )
        ) : items.length === 0 ? (
          <EmptyState
            icon={tab === "upcoming" ? "calendar-outline" : "list-outline"}
            title={t(tab === "upcoming" ? "app.nothingBooked" : "app.noHistory")}
            hint={tab === "upcoming" ? t("app.nothingBookedHint") : undefined}
            action={tab === "upcoming" ? <Button label={t("app.bookNow")} onPress={() => router.push("/book")} /> : undefined}
          />
        ) : (
          <View style={{ gap: 8 }}>
            {items.map((a, i) => (
              <View key={a.id} style={{ gap: 8 }}>
                {/* Money still owed to hold the chair, shown above the chair it holds. */}
                {a.depositStatus === "EXPECTED" && (a.depositAmount ?? 0) > 0 && (
                  <DepositNotice amount={a.depositAmount!} reference={a.depositRef ?? null} />
                )}
                <AppointmentCard
                  appointment={a}
                  highlight={tab === "upcoming" && i === 0}
                  actions={
                    tab === "upcoming" ? (
                      <Button
                        tone="danger"
                        label={t("action.cancel")}
                        busy={busyId === a.id}
                        onPress={() => cancel(a)}
                        style={{ flex: 1 }}
                      />
                    ) : (
                      <Button tone="ghost" label={t("app.bookAgain")} onPress={() => router.push("/book")} style={{ flex: 1 }} />
                    )
                  }
                />
              </View>
            ))}
          </View>
        )}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  segment: { flexDirection: "row", gap: 4, padding: 4, borderWidth: 1, borderRadius: RADIUS },
  segmentItem: { flex: 1, paddingVertical: 9, borderRadius: RADIUS, alignItems: "center" },
  booked: { flexDirection: "row", alignItems: "center", gap: 12, borderWidth: 1, borderRadius: 4, paddingHorizontal: 16, paddingVertical: 12 },
  tick: { width: 32, height: 32, borderRadius: 16, alignItems: "center", justifyContent: "center" },
});
