import { StyleSheet, View } from "react-native";
import Svg, { Defs, G, Pattern, Rect } from "react-native-svg";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTheme } from "@/lib/theme";
import { T } from "./kit";

/**
 * The Cairene pieces: the lattice, the eight-point star, and the indigo band
 * they sit on. Two squares, one turned against the other, make the star; the
 * same star repeated is the lattice of a mashrabiya screen.
 */

/** The star lattice as a quiet repeat behind whatever it covers. */
export function Lattice({ color, opacity = 0.18, size = 32 }: { color: string; opacity?: number; size?: number }) {
  const q = size / 4;
  return (
    <Svg width="100%" height="100%" style={StyleSheet.absoluteFill} pointerEvents="none" aria-hidden opacity={opacity}>
      <Defs>
        <Pattern id={`lattice-${size}`} width={size} height={size} patternUnits="userSpaceOnUse">
          <Rect x={q} y={q} width={size / 2} height={size / 2} fill="none" stroke={color} strokeWidth={1.2} />
          <Rect
            x={q}
            y={q}
            width={size / 2}
            height={size / 2}
            fill="none"
            stroke={color}
            strokeWidth={1.2}
            transform={`rotate(45 ${size / 2} ${size / 2})`}
          />
        </Pattern>
      </Defs>
      <Rect width="100%" height="100%" fill={`url(#lattice-${size})`} />
    </Svg>
  );
}

/** One eight-point star: filled when earned, drawn in outline when still to come. */
export function Star({ filled, color, outline, size = 22 }: { filled: boolean; color: string; outline: string; size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" aria-hidden>
      <G fill={filled ? color : "none"} stroke={filled ? "none" : outline} strokeWidth={1.2}>
        <Rect x={5} y={5} width={14} height={14} />
        <Rect x={5} y={5} width={14} height={14} transform="rotate(45 12 12)" />
      </G>
    </Svg>
  );
}

/**
 * The indigo band across the top of a screen, lattice behind a Kufic heading.
 * It runs up under the notch, so the woodwork reaches the edge of the phone.
 */
export function HeaderBand({ title, hint }: { title: string; hint?: string }) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  return (
    <View style={[styles.band, { backgroundColor: colors.navy, paddingTop: insets.top + 18 }]}>
      <Lattice color={colors.amber} />
      <T display style={{ color: colors.onNavy, fontSize: 26, fontWeight: "700" }}>
        {title}
      </T>
      {hint ? <T style={{ color: colors.onNavySoft, fontSize: 13, marginTop: 2 }}>{hint}</T> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  band: { marginHorizontal: -20, marginTop: -16, paddingHorizontal: 20, paddingBottom: 22, overflow: "hidden" },
});
