import { useEffect, useRef } from "react";
import { Platform, View, type ViewStyle } from "react-native";
import { Stack, router } from "expo-router";
import * as Notifications from "expo-notifications";
import { StatusBar } from "expo-status-bar";
import { useFonts } from "expo-font";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { AuthProvider, useAuth } from "@/lib/auth";
import { LanguageProvider, useTranslation } from "@/lib/i18n";
import { ShopProvider } from "@/lib/shop";
import { configureNotifications, routeFor } from "@/lib/push";
import { FONT_FILES, fontFamily, ThemeProvider, useTheme } from "@/lib/theme";

// A notification that arrives with the app open still shows, as on a closed one.
if (Platform.OS !== "web") configureNotifications();

export default function RootLayout() {
  // The type is part of the look; a frame in the system font would flash first.
  const [fontsLoaded, fontError] = useFonts(FONT_FILES);
  if (!fontsLoaded && !fontError) return null;

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
  const { colors } = useTheme();
  const { rtl } = useTranslation();

  // Arabic lays the whole app out right to left without a restart.
  const root = { flex: 1, backgroundColor: colors.bg, direction: rtl ? "rtl" : "ltr" } as const;

  // Reading the stored login takes a moment; a blank shop-coloured screen is
  // better than a sign-in form flashing at somebody who is already signed in.
  if (status === "loading") return <View style={root} />;

  const signedIn = status === "signedIn";
  return (
    <>
      <Screens signedIn={signedIn} root={root} />
      {/* After the screens, so a tap never routes before there is anywhere to go. */}
      {Platform.OS === "web" ? null : <OpenFromNotification signedIn={signedIn} />}
    </>
  );
}

/**
 * A tapped notification opens where it was about — their bookings, a free
 * chair — once they are signed in. Each tap is acted on once.
 */
function OpenFromNotification({ signedIn }: { signedIn: boolean }) {
  const response = Notifications.useLastNotificationResponse();
  const handled = useRef<string | null>(null);
  useEffect(() => {
    if (!signedIn || !response) return;
    const id = response.notification.request.identifier;
    if (handled.current === id) return;
    handled.current = id;
    router.push(routeFor(response.notification.request.content.data?.url));
  }, [response, signedIn]);
  return null;
}

function Screens({ signedIn, root }: { signedIn: boolean; root: ViewStyle }) {
  const { colors, scheme } = useTheme();
  const { t, lang } = useTranslation();
  return (
    <View style={root}>
      <StatusBar style={scheme === "dark" ? "light" : "dark"} />
      <Stack
        screenOptions={{
          headerStyle: { backgroundColor: colors.bg },
          headerTintColor: colors.accent,
          headerTitleStyle: { color: colors.ink, fontFamily: fontFamily(600, lang) },
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
          <Stack.Screen name="history/index" options={{ title: t("history.title") }} />
          <Stack.Screen name="history/[id]" options={{ title: t("history.receipt") }} />
        </Stack.Protected>
      </Stack>
    </View>
  );
}
