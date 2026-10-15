import { Pressable, View } from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import { useTheme } from "@/lib/theme";

/** A rating, read only: brass stars earned, hollow ones not. */
export function Stars({ rating, size = 12 }: { rating: number; size?: number }) {
  const { colors } = useTheme();
  return (
    <View accessibilityLabel={`${rating} / 5`} style={{ flexDirection: "row", gap: 2 }}>
      {[1, 2, 3, 4, 5].map((n) => (
        <Ionicons key={n} name={n <= rating ? "star" : "star-outline"} size={size} color={colors.accent} />
      ))}
    </View>
  );
}

/** Five stars to tap. Big enough for a thumb; the whole question in one row. */
export function StarPicker({ value, onChange, disabled }: { value: number; onChange: (n: number) => void; disabled?: boolean }) {
  const { colors } = useTheme();
  return (
    <View style={{ flexDirection: "row", gap: 8 }}>
      {[1, 2, 3, 4, 5].map((n) => (
        <Pressable
          key={n}
          accessibilityRole="button"
          accessibilityLabel={`${n} / 5`}
          accessibilityState={{ selected: n === value }}
          disabled={disabled}
          onPress={() => onChange(n)}
          hitSlop={6}
        >
          <Ionicons name={n <= value ? "star" : "star-outline"} size={34} color={n <= value ? colors.accent : colors.faint} />
        </Pressable>
      ))}
    </View>
  );
}
