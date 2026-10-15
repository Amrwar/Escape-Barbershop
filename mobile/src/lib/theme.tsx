import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { useColorScheme } from "react-native";
import * as SecureStore from "expo-secure-store";

/**
 * Brass & Ink, the same tokens as the web app's customer screens
 * (src/app/globals.css): square corners, hairline rules, brass on the one
 * action that matters, everything else ink at four strengths. Dark is the
 * shop's own look; light is for reading it in daylight.
 */

const dark = {
  bg: "#0b0a09",
  surface: "#131110",
  raised: "#191614",
  ink: "#f4efe6",
  mid: "#c9c1b5",
  soft: "#948b80",
  faint: "#71685e",
  line: "#2a2520",
  lineStrong: "#3a332b",
  accent: "#cfa243",
  accentInk: "#14100a",
  accentSoft: "rgba(207, 162, 67, 0.13)",
  good: "#6ee7b7",
  goodSoft: "rgba(52, 211, 153, 0.12)",
  goodLine: "rgba(52, 211, 153, 0.28)",
  warn: "#fcd34d",
  warnSoft: "rgba(251, 191, 36, 0.12)",
  warnLine: "rgba(251, 191, 36, 0.28)",
  bad: "#fca5a5",
  badSoft: "rgba(248, 113, 113, 0.12)",
  badLine: "rgba(248, 113, 113, 0.3)",
};

export type Palette = typeof dark;

const light: Palette = {
  bg: "#f6f2ea",
  surface: "#ffffff",
  raised: "#ffffff",
  ink: "#16130f",
  mid: "#3f3930",
  soft: "#6c6358",
  faint: "#948a7c",
  line: "#e1d8c7",
  lineStrong: "#d3c7b0",
  accent: "#8a6a18",
  accentInk: "#fffbf0",
  accentSoft: "rgba(138, 106, 24, 0.1)",
  good: "#047857",
  goodSoft: "rgba(4, 120, 87, 0.09)",
  goodLine: "rgba(4, 120, 87, 0.22)",
  warn: "#92620a",
  warnSoft: "rgba(146, 98, 10, 0.09)",
  warnLine: "rgba(146, 98, 10, 0.22)",
  bad: "#b91c1c",
  badSoft: "rgba(185, 28, 28, 0.08)",
  badLine: "rgba(185, 28, 28, 0.22)",
};

/** Corners are square in this design; this is the most a box is ever rounded. */
export const RADIUS = 3;

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

  // The shop's look is dark, so dark is what an undecided phone gets.
  const scheme = choice === "system" ? (system === "light" ? "light" : "dark") : choice;
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
