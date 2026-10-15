import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { useColorScheme } from "react-native";
import * as SecureStore from "expo-secure-store";

/**
 * Mashrabiya: the app as a Cairene doorway, designed right to left first and
 * mirrored for English. A plaster-cream ground, indigo for the woodwork — the
 * header band, the tab bar, the card of stamps — teal for what is chosen or
 * next, rust on the one action that books, and lantern amber for the details.
 *
 * Boxes are square, with fine borders; the one curve is the arch, and it is
 * kept for things that are windows onto something: the next appointment's day,
 * a barber, a free time. Dark mode turns the ground indigo and moves the action
 * to amber, because rust on indigo cannot be read.
 */

const light = {
  bg: "#f3ead8",
  surface: "#ffffff",
  raised: "#ffffff",
  ink: "#14213d",
  mid: "#3a4560",
  soft: "#6e5a3e",
  faint: "#7a6a4f",
  line: "#e1d3b6",
  lineStrong: "#cdbf9f",
  // The one action that books something.
  accent: "#a8541f",
  accentInk: "#ffffff",
  accentSoft: "rgba(168, 84, 31, 0.09)",
  good: "#13695f",
  goodSoft: "rgba(30, 127, 125, 0.10)",
  goodLine: "rgba(30, 127, 125, 0.28)",
  warn: "#8a5a00",
  warnSoft: "rgba(240, 179, 106, 0.22)",
  warnLine: "rgba(240, 179, 106, 0.6)",
  bad: "#b42318",
  badSoft: "rgba(180, 35, 24, 0.08)",
  badLine: "rgba(180, 35, 24, 0.24)",

  // The doorway
  /** The woodwork: header band, tab bar, the card of stamps. */
  navy: "#14213d",
  onNavy: "#f3ead8",
  onNavySoft: "#d9ccb2",
  navyLine: "#2a3a5e",
  /** Chosen, or next. */
  teal: "#1e7f7d",
  onTeal: "#ffffff",
  /** Lantern light: the lattice, the place you are on the tab bar. */
  amber: "#f0b36a",
  onAmber: "#14213d",
  /** An earned star. */
  stamp: "#a8541f",
};

export type Palette = typeof light;

const dark: Palette = {
  bg: "#14213d",
  surface: "#1b2a4b",
  raised: "#22335a",
  ink: "#f3ead8",
  mid: "#d9ccb2",
  soft: "#b9a98c",
  faint: "#a3967d",
  line: "#2a3a5e",
  lineStrong: "#3a4a6d",
  accent: "#f0b36a",
  accentInk: "#14213d",
  accentSoft: "rgba(240, 179, 106, 0.14)",
  good: "#7fd1c7",
  goodSoft: "rgba(30, 127, 125, 0.25)",
  goodLine: "rgba(127, 209, 199, 0.35)",
  warn: "#f0b36a",
  warnSoft: "rgba(240, 179, 106, 0.14)",
  warnLine: "rgba(240, 179, 106, 0.4)",
  bad: "#fca5a5",
  badSoft: "rgba(248, 113, 113, 0.12)",
  badLine: "rgba(248, 113, 113, 0.3)",

  navy: "#0d162b",
  onNavy: "#f3ead8",
  onNavySoft: "#d9ccb2",
  navyLine: "#22335a",
  teal: "#1e7f7d",
  onTeal: "#ffffff",
  amber: "#f0b36a",
  onAmber: "#14213d",
  stamp: "#f0b36a",
};

/** Buttons and fields: nearly square, softened just enough to read as something to press. */
export const RADIUS = 8;
/** Cards: square, with a fine border. The curve belongs to the arch alone. */
export const CARD_RADIUS = 0;

/** An arch: a round top on a near-square foot. */
export const arch = (width: number) => ({
  borderTopLeftRadius: width / 2,
  borderTopRightRadius: width / 2,
  borderBottomLeftRadius: 4,
  borderBottomRightRadius: 4,
});

/**
 * The type, per weight — a custom font is one family per weight, and Android
 * ignores fontWeight on one. Body text is IBM Plex Sans Arabic, whose Latin
 * letters carry English too. Headings and big numbers are `display`: Reem Kufi
 * in Arabic, Marcellus in English.
 */
export const FONT_FILES = {
  "body-400": require("@expo-google-fonts/ibm-plex-sans-arabic/400Regular/IBMPlexSansArabic_400Regular.ttf"),
  "body-500": require("@expo-google-fonts/ibm-plex-sans-arabic/500Medium/IBMPlexSansArabic_500Medium.ttf"),
  "body-600": require("@expo-google-fonts/ibm-plex-sans-arabic/600SemiBold/IBMPlexSansArabic_600SemiBold.ttf"),
  "body-700": require("@expo-google-fonts/ibm-plex-sans-arabic/700Bold/IBMPlexSansArabic_700Bold.ttf"),
  "kufi-500": require("@expo-google-fonts/reem-kufi/500Medium/ReemKufi_500Medium.ttf"),
  "kufi-700": require("@expo-google-fonts/reem-kufi/700Bold/ReemKufi_700Bold.ttf"),
  "marcellus-400": require("@expo-google-fonts/marcellus/400Regular/Marcellus_400Regular.ttf"),
};

export function fontFamily(weight: unknown, lang: "en" | "ar", display?: boolean): keyof typeof FONT_FILES {
  const w = Number(weight === "bold" ? 700 : weight === "normal" || weight == null ? 400 : weight);
  if (display) return lang === "ar" ? (w >= 600 ? "kufi-700" : "kufi-500") : "marcellus-400";
  const step = w >= 700 ? 700 : w >= 600 ? 600 : w >= 500 ? 500 : 400;
  return `body-${step}` as keyof typeof FONT_FILES;
}

export type ThemeChoice = "system" | "dark" | "light";

interface ThemeValue {
  colors: Palette;
  scheme: "dark" | "light";
  choice: ThemeChoice;
  setChoice: (choice: ThemeChoice) => void;
}

const ThemeContext = createContext<ThemeValue | null>(null);
const KEY = "theme";

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const system = useColorScheme();
  const [choice, setChoiceState] = useState<ThemeChoice>("system");

  useEffect(() => {
    SecureStore.getItemAsync(KEY)
      .then((v) => {
        if (v === "dark" || v === "light" || v === "system") setChoiceState(v);
      })
      .catch(() => undefined);
  }, []);

  const setChoice = useCallback((next: ThemeChoice) => {
    setChoiceState(next);
    SecureStore.setItemAsync(KEY, next).catch(() => undefined);
  }, []);

  // Plaster is the look; a phone set to dark gets the indigo night version.
  const scheme = choice === "system" ? (system === "dark" ? "dark" : "light") : choice;
  const value = useMemo(
    () => ({ colors: scheme === "dark" ? dark : light, scheme, choice, setChoice }),
    [scheme, choice, setChoice]
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme must be inside ThemeProvider");
  return ctx;
}
