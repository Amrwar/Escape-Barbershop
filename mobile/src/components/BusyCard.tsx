import { useEffect } from "react";
import { StyleSheet, Text, View } from "react-native";
import { useTranslation, type TranslationKey } from "@/lib/i18n";
import { useTheme } from "@/lib/theme";
import { useApi } from "@/lib/use-api";
import { Card } from "./kit";

/**
 * "Is it worth walking down now?"
 *
 * The one thing this card must never do is sound more certain than it is. When
 * the shop is running its queue, it says what is actually happening. When it is
 * not, it says what usually happens at this hour and calls it that. When there
 * is not enough history to say either, it does not appear at all.
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

  const kicker = (key: TranslationKey) => <Text style={[styles.kicker, { color: colors.faint }]}>{t(key).toUpperCase()}</Text>;

  // Live beats the forecast whenever the shop is running its queue.
  if (busy.live) {
    const { waiting, waitMinutes } = busy.live;
    return (
      <Card style={{ padding: 20 }}>
        {kicker("busy.nowTitle")}
        <Text style={[styles.big, { color: colors.ink }]}>
          {waitMinutes === 0 ? t("busy.walkIn") : t("busy.aboutMinutes", { n: waitMinutes })}
        </Text>
        <Text style={{ color: colors.soft, fontSize: 14, marginTop: 8 }}>
          {waiting === 0 ? t("busy.nobodyWaiting") : t("busy.peopleWaiting", { n: waiting })}
        </Text>
      </Card>
    );
  }

  const typical = busy.typical!;
  const tone = {
    quiet: [colors.goodSoft, colors.good],
    steady: [colors.warnSoft, colors.warn],
    busy: [colors.badSoft, colors.bad],
  }[typical.level];
  // The hours come as the shop's own clock hours, so they are named as such.
  const hour = (h: number) =>
    new Intl.DateTimeFormat(lang === "ar" ? "ar-EG" : "en-GB", { hour: "numeric", hour12: true, timeZone: "UTC" }).format(
      new Date(Date.UTC(2026, 0, 1, h))
    );

  return (
    <Card style={{ padding: 20 }}>
      {kicker("busy.usuallyTitle")}
      <View style={{ flexDirection: "row", alignItems: "center", gap: 12, marginTop: 8 }}>
        <View style={[styles.level, { backgroundColor: tone[0] }]}>
          <Text style={{ color: tone[1], fontSize: 14, fontWeight: "600" }}>{t(`busy.${typical.level}` as TranslationKey)}</Text>
        </View>
        <Text style={{ color: colors.soft, fontSize: 14 }}>{t("busy.atThisHour")}</Text>
      </View>

      {busy.quieterAt.length > 0 ? (
        <Text style={{ color: colors.mid, fontSize: 14, marginTop: 12 }}>
          {t("busy.quieterAround", { time: busy.quieterAt.slice(0, 2).map(hour).join(" / ") })}
        </Text>
      ) : null}

      {/* Said plainly, so nobody reads a forecast as a live queue. */}
      <Text style={{ color: colors.faint, fontSize: 12, marginTop: 12 }}>{t("busy.basedOn", { n: typical.fromWeeks })}</Text>
    </Card>
  );
}

const styles = StyleSheet.create({
  kicker: { fontSize: 10, fontWeight: "700", letterSpacing: 1.8 },
  big: { fontSize: 30, fontWeight: "300", marginTop: 8 },
  level: { borderRadius: 999, paddingHorizontal: 12, paddingVertical: 4 },
});
