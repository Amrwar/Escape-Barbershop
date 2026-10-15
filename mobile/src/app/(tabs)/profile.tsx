import { Pressable, StyleSheet, Text, View } from "react-native";
import { router } from "expo-router";
import Ionicons from "@expo/vector-icons/Ionicons";
import { formatPhone } from "../../../../src/lib/customers";
import { useAuth } from "@/lib/auth";
import { useTranslation, type Language } from "@/lib/i18n";
import { RADIUS, useTheme, type ThemeChoice } from "@/lib/theme";
import { useApi } from "@/lib/use-api";
import type { Me } from "@/lib/types";
import { Avatar, Button, Card, Screen, ScreenTitle, SectionTitle, Skeleton } from "@/components/kit";
import { LoyaltyCard } from "@/components/LoyaltyCard";
import { ReferralCard, type Referral } from "@/components/ReferralCard";

/**
 * Who they are to the shop, their card and their history, and how the app
 * looks to them. Editing their details is still done on the web for now.
 */
export default function ProfileScreen() {
  const { colors } = useTheme();
  const { t, lang, setLang, rtl } = useTranslation();
  // A chevron points the way the screen opens, which flips in Arabic.
  const rtlFlip = rtl ? { transform: [{ scaleX: -1 }] } : undefined;
  const { choice, setChoice } = useTheme();
  const { signOut } = useAuth();
  const { data: me, refreshing, refresh } = useApi<Me>("/api/customer/me");
  // Only while the shop runs referrals; the code is made the first time it is asked for.
  const { data: referral } = useApi<({ enabled: true } & Referral) | { enabled: false }>("/api/customer/referral");

  return (
    <Screen refreshing={refreshing} onRefresh={refresh}>
      <ScreenTitle title={t("app.navProfile")} />

      {me === null ? (
        <Skeleton height={140} />
      ) : (
        <Card raised style={{ padding: 20, gap: 20 }}>
          <View style={styles.row}>
            <Avatar name={me.name} photo={me.photo} size={56} />
            <View style={{ flex: 1 }}>
              <Text style={{ color: colors.ink, fontSize: 18, fontWeight: "600" }}>{me.name}</Text>
              <Text style={{ color: colors.soft, fontSize: 14, marginTop: 2, fontVariant: ["tabular-nums"] }}>
                {formatPhone(me.phone)}
              </Text>
            </View>
          </View>
          <View style={[styles.row, { borderTopColor: colors.line, borderTopWidth: StyleSheet.hairlineWidth, paddingTop: 16 }]}>
            <Stat value={me.visitCount} label={t("app.visitsSoFar")} />
            <Stat value={me.upcomingCount} label={t("app.upcomingCount")} />
          </View>
        </Card>
      )}

      <Card onPress={() => router.push("/history")} style={[styles.row, { padding: 16 }]}>
        <Ionicons name="time-outline" size={20} color={colors.accent} />
        <View style={{ flex: 1 }}>
          <Text style={{ color: colors.ink, fontSize: 14, fontWeight: "500" }}>{t("history.title")}</Text>
          <Text style={{ color: colors.soft, fontSize: 12 }}>{t("history.hint")}</Text>
        </View>
        <Ionicons name="chevron-forward" size={18} color={colors.faint} style={rtlFlip} />
      </Card>

      {me?.loyalty ? (
        <View>
          <SectionTitle>{t("app.loyaltyTitle")}</SectionTitle>
          <LoyaltyCard loyalty={me.loyalty} />
        </View>
      ) : null}

      {referral?.enabled ? (
        <View>
          <SectionTitle>{t("app.referralTitle")}</SectionTitle>
          <ReferralCard referral={referral} />
        </View>
      ) : null}

      <View>
        <SectionTitle>{t("app.language")}</SectionTitle>
        <Choice<Language>
          value={lang}
          onChange={setLang}
          options={[
            { value: "en", label: "English" },
            { value: "ar", label: "العربية" },
          ]}
        />
      </View>

      <View>
        <SectionTitle>{t("app.theme")}</SectionTitle>
        <Choice<ThemeChoice>
          value={choice}
          onChange={setChoice}
          options={[
            { value: "system", label: t("app.themeSystem") },
            { value: "dark", label: t("app.themeDark") },
            { value: "light", label: t("app.themeLight") },
          ]}
        />
      </View>

      <Button tone="secondary" label={t("auth.signOut")} onPress={() => void signOut()} />
    </Screen>
  );
}

function Stat({ value, label }: { value: number; label: string }) {
  const { colors } = useTheme();
  return (
    <View style={{ flex: 1 }}>
      <Text style={{ color: colors.ink, fontSize: 24, fontWeight: "300", fontVariant: ["tabular-nums"] }}>{value}</Text>
      <Text style={{ color: colors.faint, fontSize: 10, letterSpacing: 1.6, marginTop: 2 }}>{label.toUpperCase()}</Text>
    </View>
  );
}

/** A row of mutually exclusive options, the chosen one in brass. */
function Choice<T extends string>({
  value,
  onChange,
  options,
}: {
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: string }[];
}) {
  const { colors } = useTheme();
  return (
    <View style={[styles.segment, { borderColor: colors.line, backgroundColor: colors.surface }]}>
      {options.map((o) => {
        const active = o.value === value;
        return (
          <Pressable
            key={o.value}
            accessibilityRole="radio"
            accessibilityState={{ selected: active }}
            onPress={() => onChange(o.value)}
            style={[styles.segmentItem, active && { backgroundColor: colors.accentSoft }]}
          >
            <Text style={{ color: active ? colors.accent : colors.soft, fontSize: 13, fontWeight: "600" }}>{o.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", gap: 14 },
  segment: { flexDirection: "row", gap: 4, padding: 4, borderWidth: 1, borderRadius: RADIUS },
  segmentItem: { flex: 1, paddingVertical: 10, borderRadius: RADIUS, alignItems: "center" },
});
