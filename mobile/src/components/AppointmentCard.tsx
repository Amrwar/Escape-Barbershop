import { StyleSheet, View } from "react-native";
import { appointmentStatusKey } from "../../../src/lib/appointments";
import { useTranslation, type TranslationKey } from "@/lib/i18n";
import { shopDateOf, useShop } from "@/lib/shop";
import { arch, useTheme } from "@/lib/theme";
import { T, Avatar, Card, Pill, type PillTone } from "./kit";

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

/** How far off it is, in words: "today", "tomorrow", "in 3 days" — by the shop's calendar. */
function whenText(startAt: string, timeZone: string, t: ReturnType<typeof useTranslation>["t"]): string {
  const day = (moment: Date | number) => Date.parse(`${shopDateOf(moment, timeZone)}T00:00:00Z`);
  const days = Math.round((day(new Date(startAt)) - day(Date.now())) / 86_400_000);
  if (days < 0) return t("app.past");
  if (days === 0) return t("app.today");
  if (days === 1) return t("app.tomorrow");
  return t("app.inDays", { days });
}

/**
 * One appointment. The next one gets an arched window holding its day, the time
 * set large, and who and what beneath; the rest are quieter, so a list still
 * reads as a list.
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
  const { t, lang, fmtCurrency, fmtDate, fmtTime } = useTranslation();
  const { timeZone } = useShop();
  const services = appointment.services.map((s) => s.serviceName).join(" + ");
  const barberName = appointment.barber?.name ?? t("appointments.anyBarber");
  const faded = appointment.status === "CANCELLED" || appointment.status === "NO_SHOW";
  const minutes = `${appointment.durationMinutes} ${t("appointments.minutesShort")}`;

  if (highlight) {
    const start = new Date(appointment.startAt);
    const weekday = new Intl.DateTimeFormat(lang === "ar" ? "ar-EG-u-nu-latn" : "en-GB", { weekday: "long", timeZone }).format(start);
    const dayOfMonth = new Intl.DateTimeFormat("en-GB", { day: "numeric", timeZone }).format(start);
    return (
      <Card raised style={{ padding: 16, gap: 16 }}>
        <View style={styles.row}>
          {/* The day, in an arched window: teal, the colour of what is next. */}
          <View style={[styles.window, arch(64), { backgroundColor: colors.teal }]}>
            <T style={{ color: colors.onTeal, fontSize: 11 }}>{weekday}</T>
            <T display style={{ color: colors.onTeal, fontSize: 26, fontWeight: "700", lineHeight: 30 }}>
              {dayOfMonth}
            </T>
          </View>
          <View style={{ flex: 1, gap: 2 }}>
            {/* The section above already says "next"; the card says how soon. */}
            <Pill tone="brass" label={whenText(appointment.startAt, timeZone, t)} />
            <T display style={{ color: colors.ink, fontSize: 28, fontWeight: "700" }}>
              {fmtTime(appointment.startAt)}
            </T>
            <T numberOfLines={2} style={{ color: colors.soft, fontSize: 12 }}>
              {services} · {barberName} · {fmtCurrency(appointment.totalPrice)}
            </T>
          </View>
          <Avatar name={appointment.barber?.name ?? "?"} photo={appointment.barber?.photo} size={36} />
        </View>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
          <Pill tone={TONES[appointment.status] ?? "muted"} label={t(appointmentStatusKey(appointment.status) as TranslationKey)} />
          <T style={{ color: colors.faint, fontSize: 12 }}>{minutes}</T>
        </View>
        {actions ? <View style={styles.actions}>{actions}</View> : null}
      </Card>
    );
  }

  return (
    <Card style={{ padding: 16, opacity: faded ? 0.6 : 1 }}>
      <View style={styles.row}>
        <View style={{ width: 64, alignItems: "center" }}>
          <T display style={{ color: colors.ink, fontSize: 16, fontWeight: "600" }}>
            {fmtTime(appointment.startAt)}
          </T>
          <T style={{ color: colors.soft, fontSize: 11, marginTop: 4, textAlign: "center" }}>
            {fmtDate(appointment.startAt)}
          </T>
        </View>
        <View style={{ width: StyleSheet.hairlineWidth, height: 40, backgroundColor: colors.line }} />
        <View style={{ flex: 1 }}>
          <T numberOfLines={1} style={{ color: colors.ink, fontWeight: "500", fontSize: 15 }}>
            {services}
          </T>
          <T numberOfLines={1} style={{ color: colors.soft, fontSize: 12, marginTop: 2 }}>
            {barberName} · {minutes}
          </T>
        </View>
        <View style={{ alignItems: "flex-end", gap: 4 }}>
          <T style={[styles.money, { color: colors.ink, fontSize: 14 }]}>{fmtCurrency(appointment.totalPrice)}</T>
          <Pill
            tone={TONES[appointment.status] ?? "muted"}
            label={t(appointmentStatusKey(appointment.status) as TranslationKey)}
          />
        </View>
      </View>
      {appointment.notes ? (
        <T style={[styles.note, { backgroundColor: colors.accentSoft, color: colors.accent }]}>{appointment.notes}</T>
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
  window: { width: 64, height: 84, alignItems: "center", justifyContent: "flex-end", paddingBottom: 10 },
  divider: { borderTopWidth: StyleSheet.hairlineWidth },
  actions: { flexDirection: "row", gap: 8 },
  money: { fontWeight: "600", fontVariant: ["tabular-nums"] },
  note: { marginTop: 12, paddingHorizontal: 16, paddingVertical: 10, fontSize: 14, borderRadius: 10, overflow: "hidden" },
});
