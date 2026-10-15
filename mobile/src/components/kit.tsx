import { ActivityIndicator, Pressable, RefreshControl, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import type { StyleProp, TextInputProps, TextProps, ViewStyle } from "react-native";
import { Image } from "expo-image";
import Ionicons from "@expo/vector-icons/Ionicons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTranslation } from "@/lib/i18n";
import { CARD_RADIUS, RADIUS, fontFamily, useTheme } from "@/lib/theme";

/**
 * The pieces every screen is built from — the phone's version of the web app's
 * customer kit (src/components/customer/kit.tsx). Small on purpose, so the app
 * looks like one thing rather than screens that happen to share a colour.
 */

export type IconName = keyof typeof Ionicons.glyphMap;

/**
 * Text, in the app's type: IBM Plex Sans Arabic for reading, and with
 * `display` the headings and big numbers — Reem Kufi in Arabic, Marcellus in
 * English. The weight in the style chooses the font file, which is the only way
 * a custom font gets its weights on Android.
 */
export function T({ display, style, ...rest }: TextProps & { display?: boolean }) {
  const { colors } = useTheme();
  const { lang } = useTranslation();
  const flat = StyleSheet.flatten(style) ?? {};
  return (
    <Text
      {...rest}
      // Text starts on the reading side: a name or a number in an Arabic
      // screen lines up with the Arabic around it instead of drifting left.
      style={[
        { color: colors.ink, textAlign: lang === "ar" ? "right" : "left" },
        style,
        { fontFamily: fontFamily(flat.fontWeight, lang, display), fontWeight: "normal" },
      ]}
    />
  );
}

/** A scrolling screen with pull-to-refresh, padded clear of the notch. */
export function Screen({
  children,
  refreshing,
  onRefresh,
  padTop = true,
}: {
  children: React.ReactNode;
  refreshing?: boolean;
  onRefresh?: () => void;
  padTop?: boolean;
}) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: colors.bg }}
      contentContainerStyle={{ padding: 20, paddingTop: padTop ? insets.top + 16 : 16, paddingBottom: 40, gap: 28 }}
      refreshControl={
        onRefresh ? (
          <RefreshControl refreshing={!!refreshing} onRefresh={onRefresh} tintColor={colors.accent} colors={[colors.accent]} />
        ) : undefined
      }
    >
      {children}
    </ScrollView>
  );
}

export function ScreenTitle({ title, hint }: { title: string; hint?: string }) {
  const { colors } = useTheme();
  return (
    <View>
      <T display style={[styles.screenTitle, { color: colors.ink }]}>{title}</T>
      {hint ? <T style={[styles.body, { color: colors.soft, marginTop: 4 }]}>{hint}</T> : null}
    </View>
  );
}

export function SectionTitle({ children, action }: { children: string; action?: React.ReactNode }) {
  const { colors } = useTheme();
  return (
    <View style={styles.sectionRow}>
      <T style={[styles.sectionTitle, { color: colors.soft }]}>{children.toUpperCase()}</T>
      {action}
    </View>
  );
}

/** A small brass link beside a section title. */
export function SectionLink({ label, onPress }: { label: string; onPress: () => void }) {
  const { colors } = useTheme();
  return (
    <Pressable onPress={onPress} hitSlop={10}>
      <T style={{ color: colors.accent, fontSize: 12, fontWeight: "500" }}>{label}</T>
    </Pressable>
  );
}

export function Card({
  children,
  raised,
  style,
  onPress,
}: {
  children: React.ReactNode;
  raised?: boolean;
  style?: StyleProp<ViewStyle>;
  onPress?: () => void;
}) {
  const { colors } = useTheme();
  const box: ViewStyle = {
    backgroundColor: raised ? colors.raised : colors.surface,
    borderColor: raised ? colors.lineStrong : colors.line,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: CARD_RADIUS,
  };
  if (!onPress) return <View style={[box, style]}>{children}</View>;
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [box, style, pressed && { opacity: 0.75 }]}>
      {children}
    </Pressable>
  );
}

type ButtonTone = "primary" | "secondary" | "ghost" | "danger";

export function Button({
  label,
  onPress,
  tone = "primary",
  busy,
  disabled,
  style,
}: {
  label: string;
  onPress: () => void;
  tone?: ButtonTone;
  busy?: boolean;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  const { colors } = useTheme();
  const look: Record<ButtonTone, { bg: string; fg: string; border: string }> = {
    primary: { bg: colors.accent, fg: colors.accentInk, border: colors.accent },
    secondary: { bg: "transparent", fg: colors.ink, border: colors.lineStrong },
    ghost: { bg: "transparent", fg: colors.mid, border: "transparent" },
    danger: { bg: "transparent", fg: colors.bad, border: "transparent" },
  };
  const { bg, fg, border } = look[tone];
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      disabled={disabled || busy}
      style={({ pressed }) => [
        styles.button,
        { backgroundColor: bg, borderColor: border, opacity: disabled ? 0.5 : pressed ? 0.8 : 1 },
        style,
      ]}
    >
      {busy ? <ActivityIndicator color={fg} /> : <T style={[styles.buttonText, { color: fg }]}>{label}</T>}
    </Pressable>
  );
}


export type PillTone = "muted" | "brass" | "good" | "warn" | "bad";

/** A small label: a status, a length, a count. */
export function Pill({ label, tone = "muted" }: { label: string; tone?: PillTone }) {
  const { colors } = useTheme();
  const tones: Record<PillTone, { bg: string; fg: string; ring: string }> = {
    muted: { bg: colors.surface, fg: colors.mid, ring: colors.line },
    brass: { bg: colors.accentSoft, fg: colors.accent, ring: colors.accent },
    good: { bg: colors.goodSoft, fg: colors.good, ring: colors.goodLine },
    warn: { bg: colors.warnSoft, fg: colors.warn, ring: colors.warnLine },
    bad: { bg: colors.badSoft, fg: colors.bad, ring: colors.badLine },
  };
  const t = tones[tone];
  return (
    <View style={[styles.pill, { backgroundColor: t.bg, borderColor: t.ring }]}>
      <T style={{ color: t.fg, fontSize: 11, fontWeight: "500" }}>{label}</T>
    </View>
  );
}

/** Initials until there is a photo; the slot is the same size either way. */
export function Avatar({ name, photo, size = 44 }: { name: string; photo?: string | null; size?: number }) {
  const { colors } = useTheme();
  const initial = name?.trim()?.[0]?.toUpperCase() ?? "?";
  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        overflow: "hidden",
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: colors.raised,
        borderColor: colors.line,
        borderWidth: StyleSheet.hairlineWidth,
      }}
    >
      {photo ? (
        <Image source={{ uri: photo }} style={{ width: size, height: size }} contentFit="cover" alt={name} />
      ) : (
        <T style={{ color: colors.mid, fontWeight: "600", fontSize: size * 0.4 }}>{initial}</T>
      )}
    </View>
  );
}

export function EmptyState({
  icon = "cut-outline",
  title,
  hint,
  action,
}: {
  icon?: IconName;
  title: string;
  hint?: string;
  action?: React.ReactNode;
}) {
  const { colors } = useTheme();
  return (
    <Card style={{ padding: 32, alignItems: "center" }}>
      <View style={[styles.emptyIcon, { backgroundColor: colors.bg }]}>
        <Ionicons name={icon} size={24} color={colors.soft} />
      </View>
      <T style={{ color: colors.ink, fontWeight: "500", fontSize: 15, textAlign: "center" }}>{title}</T>
      {hint ? <T style={[styles.body, { color: colors.soft, marginTop: 4, textAlign: "center" }]}>{hint}</T> : null}
      {action ? <View style={{ marginTop: 20, alignSelf: "stretch" }}>{action}</View> : null}
    </Card>
  );
}

export function Skeleton({ height = 96 }: { height?: number }) {
  const { colors } = useTheme();
  return <View style={{ height, borderRadius: CARD_RADIUS, backgroundColor: colors.surface, opacity: 0.7 }} />;
}

/** A line of news in a box: something went wrong, or something to know. */
export function Notice({ text, tone = "bad" }: { text: string; tone?: "bad" | "warn" | "good" | "brass" }) {
  const { colors } = useTheme();
  const look = {
    bad: [colors.badSoft, colors.badLine, colors.bad],
    warn: [colors.warnSoft, colors.warnLine, colors.warn],
    good: [colors.goodSoft, colors.goodLine, colors.good],
    brass: [colors.accentSoft, colors.accent, colors.accent],
  }[tone];
  return (
    <View style={[styles.notice, { backgroundColor: look[0], borderColor: look[1] }]}>
      <T style={{ color: look[2], fontSize: 14 }}>{text}</T>
    </View>
  );
}

export function Field({ label, ...input }: { label?: string } & TextInputProps) {
  const { colors } = useTheme();
  const { lang } = useTranslation();
  return (
    <View style={{ gap: 6 }}>
      {label ? <T style={[styles.label, { color: colors.ink }]}>{label}</T> : null}
      <TextInput
        placeholderTextColor={colors.faint}
        {...input}
        style={[
          styles.input,
          { color: colors.ink, backgroundColor: colors.surface, borderColor: colors.lineStrong, fontFamily: fontFamily(400, lang) },
          input.style,
        ]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screenTitle: { fontSize: 26, fontWeight: "700" },
  body: { fontSize: 14, lineHeight: 20 },
  sectionRow: { flexDirection: "row", alignItems: "baseline", justifyContent: "space-between", marginBottom: 12 },
  sectionTitle: { fontSize: 10, fontWeight: "600", letterSpacing: 2 },
  button: {
    minHeight: 48,
    paddingHorizontal: 18,
    borderRadius: RADIUS,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  buttonText: { fontSize: 15, fontWeight: "600" },
  pill: {
    alignSelf: "flex-start",
    paddingHorizontal: 10,
    paddingVertical: 2,
    borderRadius: 999,
    borderWidth: StyleSheet.hairlineWidth,
  },
  emptyIcon: { width: 48, height: 48, borderRadius: 24, alignItems: "center", justifyContent: "center", marginBottom: 16 },
  notice: { borderWidth: 1, borderRadius: RADIUS, paddingHorizontal: 16, paddingVertical: 12 },
  label: { fontSize: 13, fontWeight: "600" },
  input: { borderWidth: 1, borderRadius: RADIUS, paddingHorizontal: 14, paddingVertical: 12, fontSize: 16 },
});
