import { StyleSheet, type ColorValue } from "react-native";
import { Tabs } from "expo-router";
import Ionicons from "@expo/vector-icons/Ionicons";
import { useTranslation } from "@/lib/i18n";
import { useTheme } from "@/lib/theme";
import type { IconName } from "@/components/kit";

/** The four places a signed-in customer moves between, as on the web. */
export default function TabsLayout() {
  const { colors } = useTheme();
  const { t } = useTranslation();

  const icon = (name: IconName) =>
    function TabIcon({ color }: { color: ColorValue }) {
      return <Ionicons name={name} size={22} color={color} />;
    };

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.accent,
        tabBarInactiveTintColor: colors.soft,
        tabBarStyle: { backgroundColor: colors.bg, borderTopColor: colors.line, borderTopWidth: StyleSheet.hairlineWidth },
        tabBarLabelStyle: { fontSize: 11, fontWeight: "500" },
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
