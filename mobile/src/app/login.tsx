import { useState } from "react";
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { Image } from "expo-image";
import { router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { isValidPhone } from "../../../src/lib/customers";
import { ApiError, api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { useTranslation } from "@/lib/i18n";
import { RADIUS, useTheme } from "@/lib/theme";
import { Button, Card, Field, Notice } from "@/components/kit";
import { LanguageSwitch } from "@/components/LanguageSwitch";

/**
 * The way in. The phone number is the username, because everyone knows theirs
 * and nobody remembers which email they used at a barbershop. Signing up with
 * the number the shop already has attaches their history.
 */
export default function LoginScreen() {
  const { colors } = useTheme();
  const { t } = useTranslation();
  const { signIn } = useAuth();
  const insets = useSafeAreaInsets();

  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [referralCode, setReferralCode] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const submit = async () => {
    setError("");
    if (!isValidPhone(phone)) return setError(t("app.badPhone"));
    if (mode === "signup" && !name.trim()) return setError(t("field.name"));

    setLoading(true);
    try {
      if (mode === "signup") {
        await api("/api/customer/register", {
          method: "POST",
          body: { name: name.trim(), phone, password, referralCode: referralCode.trim() || undefined },
        });
      }
      await signIn(phone, password);
      // The guard in the root layout swaps this screen for the tabs.
    } catch (err) {
      if (err instanceof ApiError) {
        // The server's sign-in refusal is worded for the shop; the app has its own.
        setError(err.status === 401 ? t("app.wrongLogin") : err.message);
      } else {
        setError(t("appointments.networkError"));
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: colors.bg }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <ScrollView
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ flexGrow: 1, justifyContent: "center", padding: 20, paddingTop: insets.top + 56 }}
      >
        <View style={[styles.corner, { top: insets.top + 12 }]}>
          <LanguageSwitch />
        </View>

        <View style={{ alignItems: "center", marginBottom: 32 }}>
          <Image
            source={require("../../assets/logo.jpg")}
            style={[styles.logo, { borderColor: colors.line }]}
            alt="Escape Barbershop"
          />
          <Text style={[styles.brand, { color: colors.ink }]}>ESCAPE</Text>
          <Text style={{ color: colors.accent, fontSize: 14, marginTop: 6 }}>{t("app.loginSubtitle")}</Text>
        </View>

        <Card raised style={{ padding: 24, gap: 16 }}>
          <View style={[styles.segment, { borderColor: colors.line, backgroundColor: colors.surface }]}>
            {(["signin", "signup"] as const).map((m) => (
              <Pressable
                key={m}
                onPress={() => {
                  setMode(m);
                  setError("");
                }}
                style={[styles.segmentItem, mode === m && { backgroundColor: colors.accentSoft }]}
              >
                <Text style={[styles.segmentText, { color: mode === m ? colors.accent : colors.soft }]}>
                  {t(m === "signin" ? "app.signIn" : "app.createAccount").toUpperCase()}
                </Text>
              </Pressable>
            ))}
          </View>

          {mode === "signup" && (
            <Field label={t("field.name")} value={name} onChangeText={setName} autoComplete="name" textContentType="name" />
          )}
          <Field
            label={t("field.phone")}
            value={phone}
            onChangeText={setPhone}
            placeholder="01X XXXX XXXX"
            keyboardType="phone-pad"
            autoComplete="tel"
            textContentType="telephoneNumber"
          />
          <Field
            label={t("auth.password")}
            value={password}
            onChangeText={setPassword}
            placeholder="••••••••"
            secureTextEntry
            autoComplete={mode === "signup" ? "new-password" : "current-password"}
            textContentType={mode === "signup" ? "newPassword" : "password"}
          />
          {mode === "signup" && (
            <Field
              label={t("app.referralCodeField")}
              value={referralCode}
              onChangeText={(v) => setReferralCode(v.toUpperCase().slice(0, 12))}
              autoCapitalize="characters"
              maxLength={12}
            />
          )}

          {error ? <Notice text={error} /> : null}

          <Button
            label={t(mode === "signin" ? "app.signIn" : "app.createAccount")}
            onPress={submit}
            busy={loading}
          />
        </Card>

        <Text style={{ color: colors.faint, fontSize: 12, textAlign: "center", marginTop: 24 }}>{t("app.loginHint")}</Text>

        {/* A visitor's one useful thing before they have an account. */}
        <Pressable onPress={() => router.push("/prices")} hitSlop={10} style={{ alignSelf: "center", marginTop: 16 }}>
          <Text style={{ color: colors.accent, fontSize: 14, fontWeight: "500" }}>{t("prices.title")}</Text>
        </Pressable>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  corner: { position: "absolute", end: 20, zIndex: 1 },
  logo: { width: 96, height: 96, borderRadius: 4, borderWidth: StyleSheet.hairlineWidth },
  brand: { marginTop: 20, fontSize: 24, fontWeight: "700", letterSpacing: 7 },
  segment: { flexDirection: "row", gap: 4, padding: 4, borderWidth: 1, borderRadius: RADIUS },
  segmentItem: { flex: 1, paddingVertical: 9, borderRadius: 2, alignItems: "center" },
  segmentText: { fontSize: 12, fontWeight: "700", letterSpacing: 1.6 },
});
