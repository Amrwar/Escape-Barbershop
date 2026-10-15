import { useEffect } from "react";
import { StyleSheet, View } from "react-native";
import { useTranslation, type TranslationKey } from "@/lib/i18n";
import { useTheme } from "@/lib/theme";
import { useApi } from "@/lib/use-api";
import { T } from "./kit";

/**
 * "Is it worth walking down now?" — as a strip under the next appointment.
 *
 * The one thing it must never do is sound more certain than it is. When the
 * shop is running its queue it says what is happening, in teal, the colour of
 * now. When it is not, it says what usually happens at this hour, on paper,
 * and calls it a guide. With too little history it does not appear at all.
 */

interface Busy {
  live: { inChair: number; waiting: number; waitMinutes: number } | null;
  typical: { level: "quiet" | "steady" | "busy"; perHour: number; relative: number; fromWeeks: number } | null;
  quieterAt: number[];
}

export function BusyCard() {
  const { colors } = useTheme();
  const { t, lang } = useTranslation();
  const { data: busy, reload } = useApi<Busy>("/api/customer/busy");

  // A live queue moves; a forecast does not. Once a minute is cheap and keeps
  // the live number from going stale while the app sits open.
  useEffect(() => {
    const timer = setInterval(reload, 60_000);
    return () => clearInterval(timer);
  }, [reload]);

  if (!busy || (!busy.live && !busy.typical)) return null;

  // Live beats the forecast whenever the shop is running its queue.
  if (busy.live) {
    const { waiting, waitMinutes } = busy.live;
    return (
      <View style={[styles.strip, { backgroundColor: colors.teal }]}>
        <View style={[styles.pulse, { backgroundColor: colors.amber }]} />
        <T style={{ flex: 1, color: colors.onTeal, fontSize: 13 }}>
          <T style={{ color: colors.onTeal, fontWeight: "600" }}>{t("app.liveNow")}: </T>
          {waiting === 0 ? t("busy.nobodyWaiting") : t("busy.peopleWaiting", { n: waiting })} ·{" "}
          {waitMinutes === 0 ? t("busy.walkIn") : t("busy.aboutMinutes", { n: waitMinutes })}
        </T>
      </View>
    );
  }

  const typical = busy.typical!;
  const tone = { quiet: colors.teal, steady: colors.amber, busy: colors.accent }[typical.level];
  // The hours come as the shop's own clock hours, so they are named as such.
  const hour = (h: number) =>
    new Intl.DateTimeFormat(lang === "ar" ? "ar-EG-u-nu-latn" : "en-GB", { hour: "numeric", hour12: true, timeZone: "UTC" }).format(
      new Date(Date.UTC(2026, 0, 1, h))
    );

  return (
    <View style={[styles.strip, { backgroundColor: colors.surface, borderColor: colors.line, borderWidth: StyleSheet.hairlineWidth }]}>
      <View style={[styles.pulse, { backgroundColor: tone }]} />
      <View style={{ flex: 1, gap: 2 }}>
        <T style={{ color: colors.ink, fontSize: 13 }}>
          <T style={{ fontWeight: "600" }}>{t(`busy.${typical.level}` as TranslationKey)}</T> {t("busy.atThisHour")}
          {busy.quieterAt.length > 0
            ? ` · ${t("busy.quieterAround", { time: busy.quieterAt.slice(0, 2).map(hour).join(" / ") })}`
            : ""}
        </T>
        {/* Said plainly, so nobody reads a forecast as a live queue. */}
        <T style={{ color: colors.soft, fontSize: 11 }}>{t("busy.basedOn", { n: typical.fromWeeks })}</T>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  strip: { flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: 14, paddingVertical: 12 },
  pulse: { width: 8, height: 8, borderRadius: 4 },
});
