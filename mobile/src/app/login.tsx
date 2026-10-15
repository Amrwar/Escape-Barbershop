import { useState } from "react";
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, View } from "react-native";
import { router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { isValidPhone } from "../../../src/lib/customers";
import { ApiError, api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { useTranslation } from "@/lib/i18n";
import { useTheme } from "@/lib/theme";
import { T, Button, Field, Notice } from "@/components/kit";
import { LanguageSwitch } from "@/components/LanguageSwitch";
import { Lattice } from "@/components/ornament";

/**
 * The way in, as a door ("Bab"): a tall latticed arch with the shop's name in
 * it, and the form beneath. Signing up shortens the arch to make room for the
 * extra fields; a wrong password leaves the door shut and says so.
 *
 * The phone number is the username, because everyone knows theirs and nobody
 * remembers which email they used at a barbershop. Signing up with the number
 * the shop already has attaches their history. There is no "forgot password":
 * the shop resets it at the counter, and the small print says so.
 */
export default function LoginScreen() {
  const { colors } = useTheme();
  const { t, lang } = useTranslation();
  const { signIn } = useAuth();
  const insets = useSafeAreaInsets();

  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [referralCode, setReferralCode] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const signup = mode === "signup";

  const submit = async () => {
    setError("");
    if (!isValidPhone(phone)) return setError(t("app.badPhone"));
    if (signup && !name.trim()) return setError(t("field.name"));

    setLoading(true);
    try {
      if (signup) {
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

  const switchMode = () => {
    setMode(signup ? "signin" : "signup");
    setError("");
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: colors.bg }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <ScrollView
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ flexGrow: 1, paddingHorizontal: 24, paddingTop: insets.top + 12, paddingBottom: 32 }}
      >
        <View style={{ alignItems: "flex-end" }}>
          <LanguageSwitch />
        </View>

        {/* The door. Its centre seam is the line between the two leaves. */}
        <View style={[styles.door, { backgroundColor: colors.navy, height: signup ? 200 : 300 }]}>
          <Lattice color={colors.amber} opacity={0.22} size={34} />
          <View style={[styles.seam, { backgroundColor: colors.amber }]} />
          <View style={[styles.plate, { backgroundColor: colors.navy }]}>
            <T display style={{ color: colors.onNavy, fontSize: lang === "ar" ? 34 : 30, fontWeight: "700", letterSpacing: lang === "ar" ? 0 : 4 }}>
              {lang === "ar" ? "إسكيب" : "ESCAPE"}
            </T>
            <T style={{ color: colors.amber, fontSize: 14, marginTop: 2 }}>{t("app.loginSubtitle")}</T>
          </View>
        </View>

        <View style={{ gap: 14, marginTop: 22 }}>
          {signup ? (
            <T display style={{ color: colors.ink, fontSize: 26, fontWeight: "700" }}>
              {t("app.createTitle")}
            </T>
          ) : null}

          {signup && (
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
            // A phone number reads left to right in Arabic too.
            style={{ writingDirection: "ltr", textAlign: lang === "ar" ? "right" : "left" }}
          />
          <Field
            label={t("auth.password")}
            value={password}
            onChangeText={setPassword}
            secureTextEntry
            autoComplete={signup ? "new-password" : "current-password"}
            textContentType={signup ? "newPassword" : "password"}
          />
          {signup && (
            <Field
              label={t("app.referralCodeField")}
              value={referralCode}
              onChangeText={(v) => setReferralCode(v.toUpperCase().slice(0, 12))}
              autoCapitalize="characters"
              maxLength={12}
              style={{ borderStyle: "dashed", borderColor: colors.accent, letterSpacing: 4 }}
            />
          )}

          {error ? <Notice text={error} /> : null}

          <Button label={t("app.openDoor")} onPress={submit} busy={loading} />

          <View style={styles.links}>
            <Pressable accessibilityRole="button" onPress={switchMode} hitSlop={8} style={styles.link}>
              <T style={{ color: colors.accent, fontSize: 14, fontWeight: "600" }}>
                {signup ? t("app.haveAccount") : t("app.noAccount")}
              </T>
            </Pressable>
            {/* A visitor's one useful thing before they have an account. */}
            <Pressable accessibilityRole="link" onPress={() => router.push("/prices")} hitSlop={8} style={styles.link}>
              <T style={{ color: colors.accent, fontSize: 14 }}>{t("prices.title")}</T>
            </Pressable>
          </View>

          <T style={{ color: colors.soft, fontSize: 12, lineHeight: 19, textAlign: "center" }}>
            {signup ? t("app.signUpSmall") : t("app.signInSmall")}
          </T>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  door: {
    marginTop: 12,
    overflow: "hidden",
    alignItems: "center",
    justifyContent: "flex-end",
    paddingBottom: 26,
    borderTopLeftRadius: 999,
    borderTopRightRadius: 999,
    borderBottomLeftRadius: 10,
    borderBottomRightRadius: 10,
  },
  seam: { position: "absolute", top: 0, bottom: 0, width: 2, opacity: 0.5, alignSelf: "center" },
  plate: {
    alignItems: "center",
    paddingHorizontal: 22,
    paddingVertical: 12,
    borderTopLeftRadius: 999,
    borderTopRightRadius: 999,
    borderBottomLeftRadius: 8,
    borderBottomRightRadius: 8,
  },
  links: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  link: { minHeight: 44, justifyContent: "center" },
});
