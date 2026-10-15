import { StyleSheet, Text, View } from "react-native";
import { appointmentStatusKey } from "../../../src/lib/appointments";
import { useTranslation, type TranslationKey } from "@/lib/i18n";
import { useTheme } from "@/lib/theme";
import { Avatar, Card, Pill, type PillTone } from "./kit";

export interface CustomerAppointment {
  id: string;
  startAt: string;
  endAt: string;
  status: string;
  durationMinutes: number;
  totalPrice: number;
  barber: { id: string; name: string; photo: string | null } | null;
  notes?: string | null;
  depositAmount?: number;
  depositStatus?: string | null;
  depositRef?: string | null;
  services: { id: string; serviceId: string; serviceName: string; price: number; durationMinutes: number }[];
}

const TONES: Record<string, PillTone> = {
  CONFIRMED: "brass",
  PENDING: "warn",
  CHECKED_IN: "warn",
  IN_PROGRESS: "warn",
  COMPLETED: "good",
  COMPLETED_UNPAID: "bad",
  CANCELLED: "muted",
  NO_SHOW: "bad",
};

/** How far off it is, in words: "today", "tomorrow", "in 3 days". */
function whenText(startAt: string, t: ReturnType<typeof useTranslation>["t"]): string {
  const start = new Date(startAt);
  const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const days = Math.round((startOfDay(start) - startOfDay(new Date())) / 86_400_000);
  if (days < 0) return t("app.past");
  if (days === 0) return t("app.today");
  if (days === 1) return t("app.tomorrow");
  return t("app.inDays", { days });
}

/**
 * One appointment. The next one gets the full treatment — big time, how soon it
 * is — and the rest are quieter, so a list still reads as a list.
 */
export function AppointmentCard({
  appointment,
  highlight,
  actions,
}: {
  appointment: CustomerAppointment;
  highlight?: boolean;
  actions?: React.ReactNode;
}) {
  const { colors } = useTheme();
  const { t, fmtCurrency, fmtDate, fmtTime } = useTranslation();
  const services = appointment.services.map((s) => s.serviceName).join(" + ");
  const barberName = appointment.barber?.name ?? t("appointments.anyBarber");
  const faded = appointment.status === "CANCELLED" || appointment.status === "NO_SHOW";
  const minutes = `${appointment.durationMinutes} ${t("appointments.minutesShort")}`;

  if (highlight) {
    return (
      <Card raised style={{ padding: 20, borderTopColor: colors.accent, borderTopWidth: 1 }}>
        <View style={styles.row}>
          <View style={{ flex: 1 }}>
            <Pill tone="brass" label={whenText(appointment.startAt, t)} />
            <Text style={[styles.bigTime, { color: colors.ink }]}>{fmtTime(appointment.startAt)}</Text>
            <Text style={{ color: colors.soft, fontSize: 14, marginTop: 6 }}>{fmtDate(appointment.startAt)}</Text>
          </View>
          <View style={{ alignItems: "flex-end" }}>
            <Text style={[styles.money, { color: colors.ink, fontSize: 18 }]}>{fmtCurrency(appointment.totalPrice)}</Text>
            <Text style={{ color: colors.soft, fontSize: 12, marginTop: 2 }}>{minutes}</Text>
          </View>
        </View>

        <View style={[styles.row, styles.divider, { borderTopColor: colors.line, marginTop: 20, paddingTop: 16 }]}>
          <Avatar name={appointment.barber?.name ?? "?"} photo={appointment.barber?.photo} size={40} />
          <View style={{ flex: 1 }}>
            <Text numberOfLines={1} style={{ color: colors.ink, fontWeight: "500", fontSize: 15 }}>
              {services}
            </Text>
            <Text style={{ color: colors.soft, fontSize: 12 }}>{barberName}</Text>
          </View>
        </View>

        {actions ? <View style={[styles.actions, { marginTop: 16 }]}>{actions}</View> : null}
      </Card>
    );
  }

  return (
    <Card style={{ padding: 16, opacity: faded ? 0.6 : 1 }}>
      <View style={styles.row}>
        <View style={{ width: 64, alignItems: "center" }}>
          <Text style={[styles.money, { color: colors.ink, fontSize: 17, fontWeight: "700" }]}>
            {fmtTime(appointment.startAt)}
          </Text>
          <Text style={{ color: colors.soft, fontSize: 11, marginTop: 4, textAlign: "center" }}>
            {fmtDate(appointment.startAt)}
          </Text>
        </View>
        <View style={{ width: StyleSheet.hairlineWidth, height: 40, backgroundColor: colors.line }} />
        <View style={{ flex: 1 }}>
          <Text numberOfLines={1} style={{ color: colors.ink, fontWeight: "500", fontSize: 15 }}>
            {services}
          </Text>
          <Text numberOfLines={1} style={{ color: colors.soft, fontSize: 12, marginTop: 2 }}>
            {barberName} · {minutes}
          </Text>
        </View>
        <View style={{ alignItems: "flex-end", gap: 4 }}>
          <Text style={[styles.money, { color: colors.ink, fontSize: 14 }]}>{fmtCurrency(appointment.totalPrice)}</Text>
          <Pill
            tone={TONES[appointment.status] ?? "muted"}
            label={t(appointmentStatusKey(appointment.status) as TranslationKey)}
          />
        </View>
      </View>
      {appointment.notes ? (
        <Text style={[styles.note, { backgroundColor: colors.accentSoft, color: colors.accent }]}>{appointment.notes}</Text>
      ) : null}
      {actions ? (
        <View style={[styles.actions, styles.divider, { borderTopColor: colors.line, marginTop: 12, paddingTop: 12 }]}>
          {actions}
        </View>
      ) : null}
    </Card>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", gap: 12 },
  divider: { borderTopWidth: StyleSheet.hairlineWidth },
  actions: { flexDirection: "row", gap: 8 },
  bigTime: { fontSize: 40, lineHeight: 44, marginTop: 12, fontVariant: ["tabular-nums"], fontWeight: "300" },
  money: { fontWeight: "600", fontVariant: ["tabular-nums"] },
  note: { marginTop: 12, paddingHorizontal: 16, paddingVertical: 10, fontSize: 14, borderRadius: 3, overflow: "hidden" },
});
