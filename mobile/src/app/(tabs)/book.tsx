import { useMemo, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { Image } from "expo-image";
import { router } from "expo-router";
import Ionicons from "@expo/vector-icons/Ionicons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { api, ApiError } from "@/lib/api";
import { useTranslation, type TranslationKey } from "@/lib/i18n";
import { RADIUS, useTheme } from "@/lib/theme";
import { useApi } from "@/lib/use-api";
import { shopDateOf, useShop } from "@/lib/shop";
import type { Catalog, Service } from "@/lib/types";
import { Avatar, Button, Card, EmptyState, Field, Notice, Pill, ScreenTitle, Skeleton } from "@/components/kit";

/**
 * Booking, in the order a customer thinks: what am I having, with whom, when.
 * Every time offered comes from the server, so nothing already taken is shown,
 * and the one action that moves things along sits under the thumb throughout.
 * The phone's version of the web app's /app/book.
 */

const STEPS = ["service", "barber", "time", "confirm"] as const;
type Step = (typeof STEPS)[number];

/** The shop's calendar date `days` from now, as YYYY-MM-DD. */
const shopDate = (days: number, tz: string) => shopDateOf(Date.now() + days * 86_400_000, tz);

/** Times read more easily in parts of the day than as one long list. */
function groupByPartOfDay(slots: string[], tz: string) {
  const groups: { key: TranslationKey; slots: string[] }[] = [
    { key: "app.morning", slots: [] },
    { key: "app.afternoon", slots: [] },
    { key: "app.evening", slots: [] },
  ];
  for (const iso of slots) {
    const hour = Number(new Intl.DateTimeFormat("en-GB", { timeZone: tz, hour: "2-digit", hour12: false }).format(new Date(iso)));
    groups[hour < 12 ? 0 : hour < 17 ? 1 : 2].slots.push(iso);
  }
  return groups.filter((g) => g.slots.length > 0);
}

export default function BookScreen() {
  const { colors } = useTheme();
  const { t, lang, fmtCurrency, fmtTime } = useTranslation();
  const insets = useSafeAreaInsets();
  const { data: catalog, error: catalogError, reload: reloadCatalog } = useApi<Catalog>("/api/customer/catalog");

  const { timeZone: tz } = useShop();
  const [step, setStep] = useState<Step>("service");
  const [serviceIds, setServiceIds] = useState<string[]>([]);
  const [barberId, setBarberId] = useState<string | null>(null);
  const [day, setDay] = useState(() => shopDate(0, tz));
  const [time, setTime] = useState<string | null>(null);
  const [notes, setNotes] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  const name = (s: Service) => (lang === "ar" && s.arabicName ? s.arabicName : s.name);
  const chosen = useMemo(() => (catalog?.services ?? []).filter((s) => serviceIds.includes(s.id)), [catalog, serviceIds]);
  const totalPrice = chosen.reduce((sum, s) => sum + s.defaultPrice, 0);
  const totalMinutes = chosen.reduce((sum, s) => sum + s.durationMinutes, 0);
  const barber = catalog?.barbers.find((b) => b.id === barberId) ?? null;

  // A barber who does not do everything chosen is not offered at all.
  const availableBarbers = useMemo(
    () =>
      (catalog?.barbers ?? []).filter(
        (b) => b.serviceIds.length === 0 || serviceIds.every((id) => b.serviceIds.includes(id))
      ),
    [catalog, serviceIds]
  );

  const slotsPath =
    step === "time" && serviceIds.length > 0
      ? `/api/customer/slots?${new URLSearchParams({
          date: day,
          serviceIds: serviceIds.join(","),
          ...(barberId ? { barberId } : {}),
        })}`
      : null;
  const { data: slotData, error: slotsError, reload: reloadSlots } = useApi<{ anyBarber: string[] }>(slotsPath);
  const slots = slotsPath ? (slotData?.anyBarber ?? null) : null;

  const toggleService = (id: string) => {
    setServiceIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
    setTime(null);
  };

  const go = (next: Step) => {
    setError("");
    setStep(next);
  };

  const reset = () => {
    setStep("service");
    setServiceIds([]);
    setBarberId(null);
    setTime(null);
    setNotes("");
    setError("");
  };

  const book = async () => {
    if (!time) return;
    setSaving(true);
    setError("");
    try {
      await api("/api/customer/appointments", {
        method: "POST",
        body: { barberId, startAt: time, serviceIds, notes: notes.trim() || undefined },
      });
      reset();
      router.navigate({ pathname: "/appointments", params: { booked: "1" } });
    } catch (err) {
      // Most likely the time went while they were deciding: back to the times,
      // with the server's own words for why.
      setError(err instanceof ApiError ? err.message : t("appointments.networkError"));
      setTime(null);
      setStep("time");
      reloadSlots();
    } finally {
      setSaving(false);
    }
  };

  const top = insets.top + 12;

  if (!catalog) {
    return (
      <View style={[styles.fill, { backgroundColor: colors.bg, padding: 20, paddingTop: top, gap: 12 }]}>
        {catalogError ? (
          <EmptyState
            icon="cloud-offline-outline"
            title={t("appointments.networkError")}
            action={<Button tone="secondary" label={t("action.retry")} onPress={reloadCatalog} />}
          />
        ) : (
          [0, 1, 2, 3].map((i) => <Skeleton key={i} height={72} />)
        )}
      </View>
    );
  }

  if (!catalog.booking.onlineBookingEnabled) {
    return (
      <View style={[styles.fill, { backgroundColor: colors.bg, padding: 20, paddingTop: top }]}>
        <EmptyState icon="receipt-outline" title={t("app.bookingClosed")} hint={t("app.bookingClosedHint")} />
      </View>
    );
  }

  const stepIndex = STEPS.indexOf(step);
  const canGoOn = step === "service" ? chosen.length > 0 : step === "time" ? !!time : true;
  const days = Array.from({ length: Math.min(catalog.booking.maxDaysAhead, 14) }, (_, i) => shopDate(i, tz));

  return (
    <View style={[styles.fill, { backgroundColor: colors.bg }]}>
      {/* How far along, and what it is costing so far */}
      <View style={{ paddingHorizontal: 20, paddingTop: top, paddingBottom: 12, gap: 10 }}>
        <View style={{ flexDirection: "row", gap: 6 }}>
          {STEPS.map((s, i) => (
            <View key={s} style={[styles.progress, { backgroundColor: i <= stepIndex ? colors.accent : colors.raised }]} />
          ))}
        </View>
        {chosen.length > 0 && (
          <View style={styles.between}>
            <Text numberOfLines={1} style={{ flex: 1, color: colors.mid, fontSize: 13 }}>
              {chosen.map(name).join(" + ")}
              <Text style={{ color: colors.faint }}>
                {" · "}
                {totalMinutes} {t("appointments.minutesShort")}
              </Text>
            </Text>
            <Text style={{ color: colors.accent, fontSize: 13, fontWeight: "600", fontVariant: ["tabular-nums"] }}>
              {fmtCurrency(totalPrice)}
            </Text>
          </View>
        )}
      </View>

      <ScrollView
        style={styles.fill}
        contentContainerStyle={{ padding: 20, paddingTop: 8, paddingBottom: 32, gap: 16 }}
        keyboardShouldPersistTaps="handled"
      >
        {step === "service" && (
          <>
            <ScreenTitle title={t("app.stepService")} hint={t("app.stepServiceHint")} />
            <View style={{ gap: 8 }}>
              {catalog.services.map((s) => {
                const on = serviceIds.includes(s.id);
                return (
                  <Choice key={s.id} on={on} onPress={() => toggleService(s.id)}>
                    <View style={{ flex: 1 }}>
                      <Text numberOfLines={1} style={{ color: colors.ink, fontSize: 15, fontWeight: "500" }}>
                        {name(s)}
                      </Text>
                      <Text style={{ color: colors.soft, fontSize: 12, marginTop: 4 }}>
                        {s.durationMinutes} {t("appointments.minutesShort")}
                      </Text>
                    </View>
                    <Text style={{ color: colors.ink, fontSize: 14, fontWeight: "600", fontVariant: ["tabular-nums"] }}>
                      {fmtCurrency(s.defaultPrice)}
                    </Text>
                    <View
                      style={[
                        styles.check,
                        on ? { backgroundColor: colors.accent, borderColor: colors.accent } : { borderColor: colors.lineStrong },
                      ]}
                    >
                      {on ? <Ionicons name="checkmark" size={14} color={colors.accentInk} /> : null}
                    </View>
                  </Choice>
                );
              })}
            </View>
          </>
        )}

        {step === "barber" && (
          <>
            <ScreenTitle title={t("app.stepBarber")} hint={t("app.stepBarberHint")} />
            <View style={{ gap: 8 }}>
              <Choice on={barberId === null} onPress={() => setBarberId(null)}>
                <View style={[styles.anyIcon, { backgroundColor: colors.accentSoft }]}>
                  <Ionicons name="people-outline" size={20} color={colors.accent} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={{ color: colors.ink, fontSize: 15, fontWeight: "500" }}>{t("appointments.anyBarber")}</Text>
                  <Text style={{ color: colors.soft, fontSize: 12, marginTop: 2 }}>{t("app.anyBarberHint")}</Text>
                </View>
                {barberId === null ? <Pill tone="brass" label="✓" /> : null}
              </Choice>

              {availableBarbers.map((b) => (
                <Choice key={b.id} on={barberId === b.id} onPress={() => setBarberId(b.id)}>
                  <Avatar name={b.name} photo={b.photo} />
                  <View style={{ flex: 1 }}>
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                      <Text style={{ color: colors.ink, fontSize: 15, fontWeight: "500" }}>{b.name}</Text>
                      {b.rating.average !== null ? (
                        <Text style={{ color: colors.accent, fontSize: 12 }}>★ {b.rating.average.toFixed(1)}</Text>
                      ) : null}
                    </View>
                    {b.bio ? (
                      <Text numberOfLines={1} style={{ color: colors.soft, fontSize: 12, marginTop: 2 }}>
                        {b.bio}
                      </Text>
                    ) : null}
                    {/* Their own work, which is what a customer actually chooses on. */}
                    {b.work.length > 0 ? (
                      <View style={{ flexDirection: "row", gap: 6, marginTop: 8 }}>
                        {b.work.map((image, i) => (
                          <Image
                            key={i}
                            source={{ uri: image }}
                            alt=""
                            contentFit="cover"
                            style={{ width: 48, height: 48, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.line }}
                          />
                        ))}
                      </View>
                    ) : null}
                  </View>
                  {barberId === b.id ? <Pill tone="brass" label="✓" /> : null}
                </Choice>
              ))}
            </View>
          </>
        )}

        {step === "time" && (
          <>
            <ScreenTitle title={t("app.stepTime")} hint={t("app.stepTimeHint")} />

            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginHorizontal: -20 }} contentContainerStyle={{ gap: 8, paddingHorizontal: 20 }}>
              {days.map((d, i) => {
                const on = d === day;
                const noon = new Date(`${d}T12:00:00Z`);
                return (
                  <Pressable
                    key={d}
                    onPress={() => {
                      setDay(d);
                      setTime(null);
                    }}
                    style={[styles.dayChip, chipLook(on, colors)]}
                  >
                    <Text style={{ color: on ? colors.accent : colors.soft, fontSize: 10, letterSpacing: 1 }}>
                      {(i === 0
                        ? t("app.today")
                        : new Intl.DateTimeFormat(lang === "ar" ? "ar-EG" : "en-GB", { weekday: "short", timeZone: "UTC" }).format(noon)
                      ).toUpperCase()}
                    </Text>
                    <Text style={{ color: colors.ink, fontSize: 20, fontWeight: "700", fontVariant: ["tabular-nums"] }}>
                      {noon.getUTCDate()}
                    </Text>
                  </Pressable>
                );
              })}
            </ScrollView>

            {slots === null ? (
              slotsError ? (
                <EmptyState
                  icon="cloud-offline-outline"
                  title={slotsError}
                  action={<Button tone="secondary" label={t("action.retry")} onPress={reloadSlots} />}
                />
              ) : (
                <View style={styles.slotGrid}>
                  {Array.from({ length: 9 }, (_, i) => (
                    <View key={i} style={styles.slotCell}>
                      <Skeleton height={44} />
                    </View>
                  ))}
                </View>
              )
            ) : slots.length === 0 ? (
              <View style={{ gap: 16 }}>
                <EmptyState icon="calendar-outline" title={t("app.noTimesThatDay")} hint={t("app.noTimesThatDayHint")} />
                <JoinWaitlist key={`${day}|${serviceIds.join(",")}|${barberId}`} dateISO={day} serviceIds={serviceIds} barberId={barberId} />
              </View>
            ) : (
              <View style={{ gap: 20 }}>
                {groupByPartOfDay(slots, tz).map((group) => (
                  <View key={group.key} style={{ gap: 8 }}>
                    <Text style={[styles.groupTitle, { color: colors.faint }]}>{t(group.key).toUpperCase()}</Text>
                    <View style={styles.slotGrid}>
                      {group.slots.map((iso) => (
                        <View key={iso} style={styles.slotCell}>
                          <Pressable onPress={() => setTime(iso)} style={[styles.slot, chipLook(time === iso, colors)]}>
                            <Text style={{ color: colors.ink, fontSize: 14, fontWeight: "500", fontVariant: ["tabular-nums"] }}>
                              {fmtTime(iso)}
                            </Text>
                          </Pressable>
                        </View>
                      ))}
                    </View>
                  </View>
                ))}
              </View>
            )}
          </>
        )}

        {step === "confirm" && time && (
          <>
            <ScreenTitle title={t("app.stepConfirm")} hint={t("app.stepConfirmHint")} />

            <Card raised style={{ overflow: "hidden" }}>
              <View style={{ padding: 20, backgroundColor: colors.surface, borderBottomColor: colors.line, borderBottomWidth: StyleSheet.hairlineWidth }}>
                <Text style={{ color: colors.ink, fontSize: 32, fontWeight: "300", fontVariant: ["tabular-nums"] }}>
                  {fmtTime(time)}
                </Text>
                <Text style={{ color: colors.soft, fontSize: 14, marginTop: 6 }}>
                  {new Intl.DateTimeFormat(lang === "ar" ? "ar-EG" : "en-GB", {
                    weekday: "long",
                    day: "numeric",
                    month: "long",
                    timeZone: tz,
                  }).format(new Date(time))}
                </Text>
              </View>

              <View style={{ padding: 20, gap: 12 }}>
                {chosen.map((s) => (
                  <View key={s.id} style={styles.between}>
                    <Text style={{ color: colors.mid, fontSize: 14 }}>{name(s)}</Text>
                    <Text style={{ color: colors.ink, fontSize: 14, fontVariant: ["tabular-nums"] }}>{fmtCurrency(s.defaultPrice)}</Text>
                  </View>
                ))}
                <View style={[styles.between, styles.rule, { borderTopColor: colors.line }]}>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
                    <Avatar name={barber?.name ?? "?"} photo={barber?.photo} size={32} />
                    <Text style={{ color: colors.mid, fontSize: 14 }}>{barber?.name ?? t("appointments.anyBarber")}</Text>
                  </View>
                  <Pill label={`${totalMinutes} ${t("appointments.minutesShort")}`} />
                </View>
                <View style={[styles.between, styles.rule, { borderTopColor: colors.line }]}>
                  <Text style={{ color: colors.ink, fontSize: 15, fontWeight: "600" }}>{t("field.total")}</Text>
                  <Text style={{ color: colors.accent, fontSize: 20, fontWeight: "700", fontVariant: ["tabular-nums"] }}>
                    {fmtCurrency(totalPrice)}
                  </Text>
                </View>
              </View>
            </Card>

            <Field
              label={t("app.notesOptional")}
              value={notes}
              onChangeText={setNotes}
              placeholder={t("app.notesPlaceholder")}
              maxLength={500}
            />

            <Text style={{ color: colors.faint, fontSize: 12, textAlign: "center" }}>
              {t("app.cancelPolicy", { minutes: catalog.booking.cancelWindowMinutes })}
            </Text>
          </>
        )}

        {error ? <Notice text={error} /> : null}
      </ScrollView>

      {/* The one action that moves things along, under the thumb throughout. */}
      <View style={[styles.actionBar, { borderTopColor: colors.line, backgroundColor: colors.bg }]}>
        {stepIndex > 0 ? <Button tone="secondary" label={t("app.back")} onPress={() => go(STEPS[stepIndex - 1])} /> : null}
        {step === "confirm" ? (
          <Button label={t("app.confirmBooking")} onPress={book} busy={saving} style={{ flex: 1 }} />
        ) : (
          <Button
            label={
              step === "service" && chosen.length > 0
                ? `${t("action.next")} · ${fmtCurrency(totalPrice)}`
                : t("action.next")
            }
            onPress={() => go(STEPS[stepIndex + 1])}
            disabled={!canGoOn}
            style={{ flex: 1 }}
          />
        )}
      </View>
    </View>
  );
}

/** A selectable row: brass edge when chosen, hairline when not. */
function Choice({ on, onPress, children }: { on: boolean; onPress: () => void; children: React.ReactNode }) {
  const { colors } = useTheme();
  return (
    <Pressable
      accessibilityRole="checkbox"
      accessibilityState={{ checked: on }}
      onPress={onPress}
      style={({ pressed }) => [styles.choice, chipLook(on, colors), pressed && { opacity: 0.8 }]}
    >
      {children}
    </Pressable>
  );
}

function chipLook(on: boolean, colors: ReturnType<typeof useTheme>["colors"]) {
  return on
    ? { borderColor: colors.accent, backgroundColor: colors.accentSoft }
    : { borderColor: colors.line, backgroundColor: colors.surface };
}

/**
 * A day with nothing free. Instead of a dead end, a place in the queue: the
 * shop offers the chair to whoever is waiting the moment one opens.
 */
function JoinWaitlist({ dateISO, serviceIds, barberId }: { dateISO: string; serviceIds: string[]; barberId: string | null }) {
  const { colors } = useTheme();
  const { t } = useTranslation();
  const [state, setState] = useState<"idle" | "joining" | "joined">("idle");
  const [error, setError] = useState("");

  const join = async () => {
    setState("joining");
    setError("");
    try {
      await api("/api/customer/waitlist", { method: "POST", body: { dateISO, serviceIds, barberId } });
      setState("joined");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t("appointments.networkError"));
      setState("idle");
    }
  };

  if (state === "joined") {
    return (
      <Card style={{ padding: 20, alignItems: "center" }}>
        <Text style={{ color: colors.accent, fontSize: 14, fontWeight: "500" }}>{t("app.waitlistJoined")}</Text>
        <Text style={{ color: colors.mid, fontSize: 14, marginTop: 4, textAlign: "center" }}>{t("app.waitlistJoinedHint")}</Text>
      </Card>
    );
  }

  return (
    <Card style={{ padding: 20, gap: 12 }}>
      <Text style={{ color: colors.mid, fontSize: 14, textAlign: "center" }}>{t("app.waitlistFullDay")}</Text>
      <Button tone="secondary" label={t("app.waitlistJoin")} onPress={join} busy={state === "joining"} />
      {error ? <Text style={{ color: colors.bad, fontSize: 12, textAlign: "center" }}>{error}</Text> : null}
    </Card>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  between: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12 },
  rule: { borderTopWidth: StyleSheet.hairlineWidth, paddingTop: 12 },
  progress: { flex: 1, height: 4, borderRadius: 2 },
  choice: { flexDirection: "row", alignItems: "center", gap: 14, padding: 16, borderWidth: 1, borderRadius: RADIUS },
  check: { width: 24, height: 24, borderRadius: 12, borderWidth: 2, alignItems: "center", justifyContent: "center" },
  anyIcon: { width: 44, height: 44, borderRadius: 22, alignItems: "center", justifyContent: "center" },
  dayChip: { width: 68, paddingVertical: 10, alignItems: "center", borderWidth: 1, borderRadius: RADIUS },
  groupTitle: { fontSize: 11, fontWeight: "600", letterSpacing: 2 },
  slotGrid: { flexDirection: "row", flexWrap: "wrap", marginHorizontal: -4 },
  slotCell: { width: "33.333%", padding: 4 },
  slot: { height: 44, alignItems: "center", justifyContent: "center", borderWidth: 1, borderRadius: RADIUS },
  actionBar: { flexDirection: "row", gap: 12, paddingHorizontal: 20, paddingVertical: 12, borderTopWidth: StyleSheet.hairlineWidth },
});
