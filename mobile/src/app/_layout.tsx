import { View } from "react-native";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { AuthProvider, useAuth } from "@/lib/auth";
import { LanguageProvider, useTranslation } from "@/lib/i18n";
import { ShopProvider } from "@/lib/shop";
import { ThemeProvider, useTheme } from "@/lib/theme";

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <ThemeProvider>
        <ShopProvider>
          <LanguageProvider>
            <AuthProvider>
              <Navigator />
            </AuthProvider>
          </LanguageProvider>
        </ShopProvider>
      </ThemeProvider>
    </SafeAreaProvider>
  );
}

/**
 * Two doors, as on the web: the tabs are for a signed-in customer, the sign-in
 * screen for everybody else. The price list is open to both — "what does a
 * beard trim cost" should never need an account.
 */
function Navigator() {
  const { status } = useAuth();
  const { colors, scheme } = useTheme();
  const { rtl, t } = useTranslation();

  // Arabic lays the whole app out right to left without a restart.
  const root = { flex: 1, backgroundColor: colors.bg, direction: rtl ? "rtl" : "ltr" } as const;

  // Reading the stored login takes a moment; a blank shop-coloured screen is
  // better than a sign-in form flashing at somebody who is already signed in.
  if (status === "loading") return <View style={root} />;

  const signedIn = status === "signedIn";
  return (
    <View style={root}>
      <StatusBar style={scheme === "dark" ? "light" : "dark"} />
      <Stack
        screenOptions={{
          headerStyle: { backgroundColor: colors.bg },
          headerTintColor: colors.accent,
          headerTitleStyle: { color: colors.ink },
          headerShadowVisible: false,
          contentStyle: { backgroundColor: colors.bg },
        }}
      >
        <Stack.Protected guard={signedIn}>
          <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        </Stack.Protected>
        <Stack.Protected guard={!signedIn}>
          <Stack.Screen name="login" options={{ headerShown: false }} />
        </Stack.Protected>
        <Stack.Screen name="prices" options={{ title: t("prices.title") }} />
        <Stack.Protected guard={signedIn}>
          <Stack.Screen name="history" options={{ title: t("history.title") }} />
        </Stack.Protected>
      </Stack>
    </View>
  );
}
