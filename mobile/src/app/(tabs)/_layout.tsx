import { StyleSheet, type ColorValue } from "react-native";
import { Tabs } from "expo-router";
import Ionicons from "@expo/vector-icons/Ionicons";
import { useTranslation } from "@/lib/i18n";
import { fontFamily, useTheme } from "@/lib/theme";
import type { IconName } from "@/components/kit";

/**
 * The four places a signed-in customer moves between, as on the web — on a
 * navy bar, like the board, with the place you are in amber.
 */
export default function TabsLayout() {
  const { colors } = useTheme();
  const { t, lang } = useTranslation();

  const icon = (name: IconName) =>
    function TabIcon({ color }: { color: ColorValue }) {
      return <Ionicons name={name} size={22} color={color} />;
    };

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.amber,
        tabBarInactiveTintColor: colors.onNavySoft,
        tabBarStyle: { backgroundColor: colors.navy, borderTopColor: colors.navyLine, borderTopWidth: StyleSheet.hairlineWidth },
        tabBarLabelStyle: { fontSize: 11, fontFamily: fontFamily(500, lang) },
        sceneStyle: { backgroundColor: colors.bg },
      }}
    >
      <Tabs.Screen name="index" options={{ title: t("app.navHome"), tabBarIcon: icon("cut-outline") }} />
      <Tabs.Screen name="book" options={{ title: t("app.navBook"), tabBarIcon: icon("add-circle-outline") }} />
      <Tabs.Screen name="appointments" options={{ title: t("app.navAppointments"), tabBarIcon: icon("calendar-outline") }} />
      <Tabs.Screen name="profile" options={{ title: t("app.navProfile"), tabBarIcon: icon("person-outline") }} />
    </Tabs>
  );
}
