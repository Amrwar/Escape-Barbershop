import { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { router } from "expo-router";
import { api, ApiError } from "@/lib/api";
import { useTranslation } from "@/lib/i18n";
import { RADIUS, useTheme } from "@/lib/theme";
import type { Usual } from "@/lib/types";
import { Avatar, Card } from "./kit";

/**
 * "The usual" — their own habit, offered back to them.
 *
 * A regular books the same barber, the same cut, at the same sort of hour. This
 * shows the free times nearest that hour and books on one tap. One tap and not
 * none: a booking holds a chair, so it is always the customer who makes it.
 */
export function UsualCard({ usual }: { usual: Usual }) {
  const { colors } = useTheme();
  const { t, lang, fmtCurrency, fmtDate, fmtTime } = useTranslation();
  const [booking, setBooking] = useState<string | null>(null);
  const [error, setError] = useState("");

  if (usual.times.length === 0) return null;

  const serviceNames = usual.services.map((s) => (lang === "ar" && s.arabicName ? s.arabicName : s.name)).join(" + ");

  const book = async (startAt: string) => {
    setBooking(startAt);
    setError("");
    try {
      await api("/api/customer/appointments", {
        method: "POST",
        body: { startAt, barberId: usual.barber?.id ?? null, serviceIds: usual.services.map((s) => s.id) },
      });
      router.navigate({ pathname: "/appointments", params: { booked: "1" } });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t("app.usualFailed"));
    } finally {
      setBooking(null);
    }
  };

  return (
    <Card style={{ padding: 20 }}>
      <View style={styles.row}>
        <Avatar name={usual.barber?.name ?? "?"} photo={usual.barber?.photo} size={40} />
        <View style={{ flex: 1 }}>
          <Text numberOfLines={1} style={{ color: colors.ink, fontSize: 14, fontWeight: "500" }}>
            {serviceNames}
          </Text>
          <Text numberOfLines={1} style={{ color: colors.soft, fontSize: 12 }}>
            {usual.barber ? usual.barber.name : t("appointments.anyBarber")} · {usual.durationMinutes}{" "}
            {t("appointments.minutesShort")}
          </Text>
        </View>
        <Text style={{ color: colors.accent, fontSize: 18, fontVariant: ["tabular-nums"] }}>{fmtCurrency(usual.price)}</Text>
      </View>

      <View style={[styles.times, { borderTopColor: colors.line }]}>
        {usual.times.map((time) => (
          <Pressable
            key={time}
            onPress={() => book(time)}
            disabled={booking !== null}
            style={({ pressed }) => [
              styles.time,
              { borderColor: colors.line, backgroundColor: colors.bg, opacity: booking && booking !== time ? 0.5 : pressed ? 0.8 : 1 },
            ]}
          >
            <Text style={{ color: colors.ink, fontSize: 16, fontVariant: ["tabular-nums"] }}>{fmtTime(time)}</Text>
            <Text style={{ color: colors.faint, fontSize: 10, letterSpacing: 1, marginTop: 2 }}>
              {booking === time ? "…" : fmtDate(time).toUpperCase()}
            </Text>
          </Pressable>
        ))}
      </View>

      {error ? <Text style={{ color: colors.bad, fontSize: 12, textAlign: "center", marginTop: 12 }}>{error}</Text> : null}
    </Card>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", gap: 12 },
  times: { flexDirection: "row", gap: 8, marginTop: 16, paddingTop: 16, borderTopWidth: StyleSheet.hairlineWidth },
  time: { flex: 1, alignItems: "center", paddingVertical: 10, borderWidth: 1, borderRadius: RADIUS },
});
