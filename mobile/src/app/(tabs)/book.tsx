import { useMemo, useState } from "react";
import { Pressable, ScrollView, StyleSheet, View } from "react-native";
import { Image } from "expo-image";
import { router } from "expo-router";
import Ionicons from "@expo/vector-icons/Ionicons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { api, ApiError } from "@/lib/api";
import { useTranslation, type TranslationKey } from "@/lib/i18n";
import { arch, useTheme } from "@/lib/theme";
import { useApi } from "@/lib/use-api";
import { shopDateOf, useShop } from "@/lib/shop";
import type { Catalog, Service } from "@/lib/types";
import { T, Avatar, Button, Card, EmptyState, Field, Notice, Pill, ScreenTitle, Skeleton } from "@/components/kit";

/**
 * Booking, in the order a customer thinks: what am I having, with whom, when.
 * Barbers stand in arched alcoves and every free time is a lit arched window,
 * so the choosing looks like the shop rather than a form. Every time offered
 * comes from the server, so nothing already taken is shown, and the one action
 * that moves things along sits under the thumb throughout.
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
  const weekdayLong = (iso: string) =>
    new Intl.DateTimeFormat(lang === "ar" ? "ar-EG-u-nu-latn" : "en-GB", { weekday: "long", timeZone: tz }).format(new Date(iso));

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
  const bookLabel = time
    ? t("app.bookAt", { day: weekdayLong(time), time: fmtTime(time), barber: barber?.name ?? t("appointments.anyBarber") })
    : t("app.confirmBooking");

  return (
    <View style={[styles.fill, { backgroundColor: colors.bg }]}>
      {/* How far along, and what it is costing so far */}
      <View style={{ paddingHorizontal: 20, paddingTop: top, paddingBottom: 12, gap: 10 }}>
        <View style={{ flexDirection: "row", gap: 6 }}>
          {STEPS.map((s, i) => (
            <View key={s} style={[styles.progress, { backgroundColor: i <= stepIndex ? colors.accent : colors.line }]} />
          ))}
        </View>
        {chosen.length > 0 && (
          <View style={styles.between}>
            <T numberOfLines={1} style={{ flex: 1, color: colors.mid, fontSize: 13 }}>
              {chosen.map(name).join(" + ")}
              {barber ? ` · ${barber.name}` : ""}
              <T style={{ color: colors.faint }}>
                {" · "}
                {totalMinutes} {t("appointments.minutesShort")}
              </T>
            </T>
            <T style={{ color: colors.accent, fontSize: 13, fontWeight: "600", fontVariant: ["tabular-nums"] }}>
              {fmtCurrency(totalPrice)}
            </T>
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
                      <T numberOfLines={1} style={{ color: colors.ink, fontSize: 15, fontWeight: "500" }}>
                        {name(s)}
                      </T>
                      <T style={{ color: colors.soft, fontSize: 12, marginTop: 4 }}>
                        {s.durationMinutes} {t("appointments.minutesShort")}
                      </T>
                    </View>
                    <T style={{ color: colors.ink, fontSize: 14, fontWeight: "600", fontVariant: ["tabular-nums"] }}>
                      {fmtCurrency(s.defaultPrice)}
                    </T>
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
            {/* Each barber in an arched alcove; the one chosen is lit teal. */}
            <View style={styles.alcoves}>
              <Alcove on={barberId === null} onPress={() => setBarberId(null)} label={t("appointments.anyBarber")}>
                <Ionicons name="people-outline" size={26} color={barberId === null ? colors.onTeal : colors.soft} />
              </Alcove>
              {availableBarbers.map((b) => {
                const face = b.work[0] ?? b.photo;
                const on = barberId === b.id;
                return (
                  <Alcove
                    key={b.id}
                    on={on}
                    onPress={() => setBarberId(b.id)}
                    label={b.name}
                    sub={b.rating.average !== null ? `★ ${b.rating.average.toFixed(1)}` : undefined}
                  >
                    {face ? (
                      <Image source={{ uri: face }} alt="" contentFit="cover" style={StyleSheet.absoluteFill} />
                    ) : (
                      <T display style={{ color: on ? colors.onTeal : colors.mid, fontSize: 28, fontWeight: "700" }}>
                        {b.name.trim()[0]?.toUpperCase()}
                      </T>
                    )}
                  </Alcove>
                );
              })}
            </View>
            {barber ? <TheirWork barber={barber} /> : null}
          </>
        )}

        {step === "time" && (
          <>
            <ScreenTitle title={t("app.stepTime")} hint={t("app.stepTimeHint")} />

            {/* The days as tabs, the chosen one underlined in rust. */}
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginHorizontal: -20 }} contentContainerStyle={{ paddingHorizontal: 20 }}>
              {days.map((d, i) => {
                const on = d === day;
                const noon = new Date(`${d}T12:00:00Z`);
                const weekday =
                  i === 0
                    ? t("app.today")
                    : new Intl.DateTimeFormat(lang === "ar" ? "ar-EG-u-nu-latn" : "en-GB", { weekday: "short", timeZone: "UTC" }).format(noon);
                return (
                  <Pressable
                    key={d}
                    accessibilityRole="tab"
                    accessibilityState={{ selected: on }}
                    onPress={() => {
                      setDay(d);
                      setTime(null);
                    }}
                    style={[styles.dayTab, { borderBottomColor: on ? colors.accent : "transparent" }]}
                  >
                    <T style={{ color: on ? colors.ink : colors.soft, fontSize: 12, fontWeight: on ? "600" : "400" }}>
                      {weekday} {noon.getUTCDate()}
                    </T>
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
                <View style={styles.windows}>
                  {Array.from({ length: 8 }, (_, i) => (
                    <View key={i} style={styles.windowCell}>
                      <View style={[styles.window, arch(70), { backgroundColor: colors.surface, opacity: 0.6 }]} />
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
              <View style={{ gap: 18 }}>
                {groupByPartOfDay(slots, tz).map((group) => (
                  <View key={group.key} style={{ gap: 8 }}>
                    <T style={{ color: colors.soft, fontSize: 11, fontWeight: "600" }}>{t(group.key)}</T>
                    <View style={styles.windows}>
                      {group.slots.map((iso) => {
                        const on = time === iso;
                        return (
                          <View key={iso} style={styles.windowCell}>
                            <Pressable
                              accessibilityRole="button"
                              accessibilityState={{ selected: on }}
                              onPress={() => setTime(iso)}
                              style={[
                                styles.window,
                                arch(70),
                                on
                                  ? { backgroundColor: colors.teal, borderColor: colors.teal }
                                  : { backgroundColor: colors.surface, borderColor: colors.line },
                              ]}
                            >
                              <T style={{ color: on ? colors.onTeal : colors.ink, fontSize: 13, fontWeight: on ? "600" : "400", fontVariant: ["tabular-nums"] }}>
                                {fmtTime(iso)}
                              </T>
                            </Pressable>
                          </View>
                        );
                      })}
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
              <View style={[styles.confirmHead, { backgroundColor: colors.surface, borderBottomColor: colors.line }]}>
                <View style={[styles.dayWindow, arch(64), { backgroundColor: colors.teal }]}>
                  <T style={{ color: colors.onTeal, fontSize: 11 }}>{weekdayLong(time)}</T>
                  <T display style={{ color: colors.onTeal, fontSize: 26, fontWeight: "700", lineHeight: 30 }}>
                    {new Intl.DateTimeFormat("en-GB", { day: "numeric", timeZone: tz }).format(new Date(time))}
                  </T>
                </View>
                <View style={{ flex: 1 }}>
                  <T display style={{ color: colors.ink, fontSize: 30, fontWeight: "700" }}>
                    {fmtTime(time)}
                  </T>
                  <T style={{ color: colors.soft, fontSize: 13 }}>
                    {new Intl.DateTimeFormat(lang === "ar" ? "ar-EG-u-nu-latn" : "en-GB", { day: "numeric", month: "long", timeZone: tz }).format(new Date(time))}
                  </T>
                </View>
              </View>

              <View style={{ padding: 20, gap: 12 }}>
                {chosen.map((s) => (
                  <View key={s.id} style={styles.between}>
                    <T style={{ color: colors.mid, fontSize: 14 }}>{name(s)}</T>
                    <T style={{ color: colors.ink, fontSize: 14, fontVariant: ["tabular-nums"] }}>{fmtCurrency(s.defaultPrice)}</T>
                  </View>
                ))}
                <View style={[styles.between, styles.rule, { borderTopColor: colors.line }]}>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
                    <Avatar name={barber?.name ?? "?"} photo={barber?.photo} size={32} />
                    <T style={{ color: colors.mid, fontSize: 14 }}>{barber?.name ?? t("appointments.anyBarber")}</T>
                  </View>
                  <Pill label={`${totalMinutes} ${t("appointments.minutesShort")}`} />
                </View>
                <View style={[styles.between, styles.rule, { borderTopColor: colors.line }]}>
                  <T style={{ color: colors.ink, fontSize: 15, fontWeight: "600" }}>{t("field.total")}</T>
                  <T display style={{ color: colors.accent, fontSize: 22, fontWeight: "700" }}>
                    {fmtCurrency(totalPrice)}
                  </T>
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

            <T style={{ color: colors.faint, fontSize: 12, textAlign: "center" }}>
              {t("app.cancelPolicy", { minutes: catalog.booking.cancelWindowMinutes })}
            </T>
          </>
        )}

        {error ? <Notice text={error} /> : null}
      </ScrollView>

      {/* The one action that moves things along, under the thumb throughout. */}
      <View style={[styles.actionBar, { borderTopColor: colors.line, backgroundColor: colors.bg }]}>
        {stepIndex > 0 ? <Button tone="secondary" label={t("app.back")} onPress={() => go(STEPS[stepIndex - 1])} /> : null}
        {step === "confirm" ? (
          <Button label={bookLabel} onPress={book} busy={saving} style={{ flex: 1 }} />
        ) : (
          <Button
            label={
              step === "service" && chosen.length > 0
                ? `${t("action.next")} · ${fmtCurrency(totalPrice)}`
                : step === "time" && time
                  ? `${t("action.next")} · ${fmtTime(time)}`
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

/** A selectable row: an indigo edge when chosen, a hairline when not — the text stays on plaster. */
function Choice({ on, onPress, children }: { on: boolean; onPress: () => void; children: React.ReactNode }) {
  const { colors } = useTheme();
  return (
    <Pressable
      accessibilityRole="checkbox"
      accessibilityState={{ checked: on }}
      onPress={onPress}
      style={({ pressed }) => [
        styles.choice,
        { backgroundColor: colors.surface, borderColor: on ? colors.ink : colors.line, borderWidth: on ? 2 : 1 },
        pressed && { opacity: 0.8 },
      ]}
    >
      {children}
    </Pressable>
  );
}

/** A barber in an arched alcove, name beneath; lit teal when chosen. */
function Alcove({
  on,
  onPress,
  label,
  sub,
  children,
}: {
  on: boolean;
  onPress: () => void;
  label: string;
  sub?: string;
  children: React.ReactNode;
}) {
  const { colors } = useTheme();
  return (
    <Pressable accessibilityRole="radio" accessibilityState={{ selected: on }} accessibilityLabel={label} onPress={onPress} style={styles.alcoveCell}>
      <View
        style={[
          styles.alcove,
          arch(96),
          on ? { backgroundColor: colors.teal, borderColor: colors.teal } : { backgroundColor: colors.line, borderColor: colors.line },
        ]}
      >
        {children}
      </View>
      <T numberOfLines={1} style={{ color: colors.ink, fontSize: 12, fontWeight: on ? "600" : "400", marginTop: 6, textAlign: "center" }}>
        {label}
      </T>
      {sub ? <T style={{ color: colors.accent, fontSize: 11, textAlign: "center" }}>{sub}</T> : null}
    </Pressable>
  );
}

/** The chosen barber's own cuts — or, until they have uploaded any, their initial and rating. */
function TheirWork({ barber }: { barber: Catalog["barbers"][number] }) {
  const { colors } = useTheme();
  const { t } = useTranslation();
  return (
    <Card style={{ padding: 14, flexDirection: "row", alignItems: "center", gap: 12 }}>
      <Avatar name={barber.name} photo={barber.photo} size={36} />
      <View style={{ flex: 1, gap: 6 }}>
        <T style={{ fontSize: 14, fontWeight: "600" }}>{barber.name}</T>
        {barber.bio ? <T numberOfLines={2} style={{ color: colors.soft, fontSize: 12 }}>{barber.bio}</T> : null}
        {barber.work.length > 0 ? (
          <View style={{ flexDirection: "row", gap: 6 }}>
            {barber.work.map((image, i) => (
              <Image key={i} source={{ uri: image }} alt="" contentFit="cover" style={[styles.cut, arch(44), { borderColor: colors.line }]} />
            ))}
          </View>
        ) : (
          <T style={{ color: colors.soft, fontSize: 12 }}>{t("app.barberNoPhotos")}</T>
        )}
      </View>
    </Card>
  );
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
        <T style={{ color: colors.accent, fontSize: 14, fontWeight: "500" }}>{t("app.waitlistJoined")}</T>
        <T style={{ color: colors.mid, fontSize: 14, marginTop: 4, textAlign: "center" }}>{t("app.waitlistJoinedHint")}</T>
      </Card>
    );
  }

  return (
    <Card style={{ padding: 20, gap: 12 }}>
      <T style={{ color: colors.mid, fontSize: 14, textAlign: "center" }}>{t("app.waitlistFullDay")}</T>
      <Button tone="secondary" label={t("app.waitlistJoin")} onPress={join} busy={state === "joining"} />
      {error ? <T style={{ color: colors.bad, fontSize: 12, textAlign: "center" }}>{error}</T> : null}
    </Card>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  between: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12 },
  rule: { borderTopWidth: StyleSheet.hairlineWidth, paddingTop: 12 },
  progress: { flex: 1, height: 3 },
  choice: { flexDirection: "row", alignItems: "center", gap: 14, padding: 16 },
  check: { width: 24, height: 24, borderRadius: 12, borderWidth: 2, alignItems: "center", justifyContent: "center" },
  alcoves: { flexDirection: "row", flexWrap: "wrap", marginHorizontal: -4 },
  alcoveCell: { width: "33.333%", padding: 4, marginBottom: 6 },
  alcove: { height: 110, borderWidth: 1, alignItems: "center", justifyContent: "center", overflow: "hidden" },
  dayTab: { paddingHorizontal: 12, paddingVertical: 10, borderBottomWidth: 2 },
  windows: { flexDirection: "row", flexWrap: "wrap", marginHorizontal: -4 },
  windowCell: { width: "25%", padding: 4 },
  window: { height: 78, borderWidth: 1, alignItems: "center", justifyContent: "flex-end", paddingBottom: 10 },
  confirmHead: { flexDirection: "row", alignItems: "center", gap: 16, padding: 20, borderBottomWidth: StyleSheet.hairlineWidth },
  dayWindow: { width: 64, height: 84, alignItems: "center", justifyContent: "flex-end", paddingBottom: 10 },
  cut: { width: 44, height: 56, borderWidth: StyleSheet.hairlineWidth },
  actionBar: { flexDirection: "row", gap: 12, paddingHorizontal: 20, paddingVertical: 12, borderTopWidth: StyleSheet.hairlineWidth },
});
