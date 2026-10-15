import { Pressable, StyleSheet, Text, View } from "react-native";
import { formatPhone } from "../../../../src/lib/customers";
import { useAuth } from "@/lib/auth";
import { useTranslation, type Language } from "@/lib/i18n";
import { RADIUS, useTheme, type ThemeChoice } from "@/lib/theme";
import { useApi } from "@/lib/use-api";
import type { Me } from "@/lib/types";
import { Avatar, Button, Card, Screen, ScreenTitle, SectionTitle, Skeleton } from "@/components/kit";

/**
 * Who they are to the shop, and how the app looks to them. Editing their
 * details comes with the next pass; for now the web app's profile does that.
 */
export default function ProfileScreen() {
  const { colors } = useTheme();
  const { t, lang, setLang } = useTranslation();
  const { choice, setChoice } = useTheme();
  const { signOut } = useAuth();
  const { data: me, refreshing, refresh } = useApi<Me>("/api/customer/me");

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
