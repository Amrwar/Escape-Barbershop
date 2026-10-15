import { useEffect, useState } from "react";
import { Linking, Share, StyleSheet, View } from "react-native";
import * as Clipboard from "expo-clipboard";
import { API_URL } from "@/lib/api";
import { useTranslation } from "@/lib/i18n";
import { RADIUS, useTheme } from "@/lib/theme";
import { T, Button, Card } from "./kit";

/**
 * "Tell a friend": their code, big enough to read out, and the two ways this
 * shop's customers actually send things — WhatsApp, and whatever the phone's
 * share sheet offers. The count underneath is the honest one: friends who
 * actually came in, not friends who tapped a link.
 */

export interface Referral {
  code: string | null;
  rewardText: string;
  rewardTextAr: string | null;
  standing: { invited: number; earned: number; waiting: number; rewarded: number };
}

export function ReferralCard({ referral }: { referral: Referral }) {
  const { colors } = useTheme();
  const { t, lang } = useTranslation();
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(false), 2500);
    return () => clearTimeout(timer);
  }, [copied]);

  if (!referral.code) return null;
  const code = referral.code;
  const reward = (lang === "ar" && referral.rewardTextAr) || referral.rewardText;

  /**
   * A link to the shop's own sign-up with the code already in it, so the friend
   * never retypes six characters off a message. It is the website, not the
   * app, because the friend does not have the app yet.
   */
  const invite = () =>
    `${t("app.referralShare", { code, reward })}\n${API_URL}/app/login?join=1&ref=${encodeURIComponent(code)}`;

  const share = () => {
    Share.share({ message: invite() }).catch(() => {
      // No share sheet: the clipboard will do.
      Clipboard.setStringAsync(invite())
        .then(() => setCopied(true))
        .catch(() => undefined);
    });
  };

  const whatsapp = async () => {
    const text = encodeURIComponent(invite());
    const opened = await Linking.openURL(`whatsapp://send?text=${text}`).then(
      () => true,
      () => false
    );
    if (!opened) await Linking.openURL(`https://wa.me/?text=${text}`).catch(() => undefined);
  };

  return (
    <Card style={{ padding: 20, gap: 12 }}>
      {/* The section above already says "Tell a friend"; the card starts with why. */}
      <T style={{ color: colors.mid, fontSize: 14 }}>{t("app.referralHint", { reward })}</T>

      <View style={[styles.code, { borderColor: colors.accent, backgroundColor: colors.accentSoft }]}>
        <T selectable style={{ color: colors.accent, fontSize: 24, fontWeight: "700", letterSpacing: 7 }}>
          {code}
        </T>
      </View>

      <View style={{ flexDirection: "row", gap: 8 }}>
        <Button label={t("app.referralWhatsApp")} onPress={whatsapp} style={{ flex: 1 }} />
        <Button
          tone="secondary"
          label={copied ? t("app.referralCopied") : t("app.referralShareButton")}
          onPress={share}
          style={{ flex: 1 }}
        />
      </View>

      {referral.standing.invited > 0 ? (
        <T style={{ color: colors.soft, fontSize: 12, textAlign: "center" }}>
          {t("app.referralCount", { invited: referral.standing.invited, earned: referral.standing.earned })}
        </T>
      ) : null}
      {referral.standing.waiting > 0 ? (
        <T style={{ color: colors.accent, fontSize: 12, textAlign: "center" }}>{t("app.referralWaiting")}</T>
      ) : null}
    </Card>
  );
}

const styles = StyleSheet.create({
  code: { alignItems: "center", paddingVertical: 16, borderWidth: 1, borderStyle: "dashed", borderRadius: RADIUS },
});
