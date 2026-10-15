import { Pressable, StyleSheet } from "react-native";
import { T } from "./kit";
import { useTranslation } from "@/lib/i18n";
import { RADIUS, useTheme } from "@/lib/theme";

/** One tap between English and Arabic, labelled in the language it switches to. */
export function LanguageSwitch() {
  const { colors } = useTheme();
  const { lang, setLang } = useTranslation();
  return (
    <Pressable
      accessibilityRole="button"
      onPress={() => setLang(lang === "ar" ? "en" : "ar")}
      hitSlop={8}
      style={[styles.box, { borderColor: colors.lineStrong }]}
    >
      <T style={{ color: colors.mid, fontSize: 13, fontWeight: "600" }}>{lang === "ar" ? "English" : "العربية"}</T>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  box: { borderWidth: 1, borderRadius: RADIUS, paddingHorizontal: 12, paddingVertical: 6 },
});
