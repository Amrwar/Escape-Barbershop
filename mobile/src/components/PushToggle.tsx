import { useEffect, useState } from "react";
import { ActivityIndicator, Switch, View } from "react-native";
import { useTranslation } from "@/lib/i18n";
import { pushState, turnPushOff, turnPushOn, type PushState } from "@/lib/push";
import { useTheme } from "@/lib/theme";
import { T, Card } from "./kit";

/**
 * "Remind me about my appointments": one switch, and an honest line beneath it
 * when the answer is no — they turned it off in the phone's settings, or this
 * build of the app cannot receive notifications at all.
 */
export function PushToggle() {
  const { colors } = useTheme();
  const { t } = useTranslation();
  const [state, setState] = useState<PushState | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    pushState()
      .then(setState)
      .catch(() => setState("unavailable"));
  }, []);

  const flip = async (on: boolean) => {
    setBusy(true);
    try {
      if (on) setState(await turnPushOn());
      else {
        await turnPushOff();
        setState("off");
      }
    } finally {
      setBusy(false);
    }
  };

  const note = state === "blocked" ? t("app.pushBlocked") : state === "unavailable" ? t("app.pushUnavailable") : t("app.remindHint");

  return (
    <Card style={{ padding: 16, flexDirection: "row", alignItems: "center", gap: 12 }}>
      <View style={{ flex: 1, gap: 2 }}>
        <T style={{ fontSize: 14, fontWeight: "600" }}>{t("app.remindMe")}</T>
        <T style={{ color: state === "blocked" || state === "unavailable" ? colors.warn : colors.soft, fontSize: 12 }}>{note}</T>
      </View>
      {state === null || busy ? (
        <ActivityIndicator color={colors.accent} />
      ) : (
        <Switch
          accessibilityLabel={t("app.remindMe")}
          value={state === "on"}
          onValueChange={flip}
          disabled={state === "unavailable"}
          trackColor={{ true: colors.teal, false: colors.lineStrong }}
          thumbColor={colors.surface}
        />
      )}
    </Card>
  );
}
