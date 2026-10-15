import { useEffect, useState } from "react";
import { Linking, Share, StyleSheet, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { api } from "@/lib/api";
import { useTranslation } from "@/lib/i18n";
import { useTheme } from "@/lib/theme";
import type { Receipt } from "@/lib/types";
import { T, Button, Card, EmptyState, Screen, Skeleton } from "@/components/kit";
import { Stars } from "@/components/Stars";

/**
 * One haircut, as a receipt they can keep.
 *
 * The shop could always print or send one from the till; the customer could
 * never get it back afterwards. Same visit, their side of it — no tip, no
 * discount the shop chose to give — and shareable, which for these customers
 * means WhatsApp.
 */
export default function ReceiptScreen() {
  const { colors } = useTheme();
  const { t, lang, fmtCurrency, fmtDateTime } = useTranslation();
  const { id } = useLocalSearchParams<{ id: string }>();
  const [receipt, setReceipt] = useState<Receipt | null>(null);
  const [missing, setMissing] = useState(false);

  useEffect(() => {
    api<Receipt>(`/api/customer/visits/${encodeURIComponent(id)}`)
      .then(setReceipt)
      .catch(() => setMissing(true));
  }, [id]);

  const name = (s: Receipt["services"][number]) => (lang === "ar" && s.arabicName ? s.arabicName : s.name) ?? "—";

  const asText = (r: Receipt) =>
    [
      r.shop.name,
      `${t("history.receiptNo")} ${r.receiptNo}`,
      fmtDateTime(r.visitAt),
      r.barber ? `${t("field.barber")}: ${r.barber.name}` : null,
      "",
      ...r.services.map((s) => `${name(s)}${s.quantity > 1 ? ` ×${s.quantity}` : ""}  ${fmtCurrency(s.price * s.quantity)}`),
      ...r.products.map((p) => `${p.name}${p.quantity > 1 ? ` ×${p.quantity}` : ""}  ${fmtCurrency(p.total)}`),
      "",
      `${t("field.total")}: ${fmtCurrency(r.total)}`,
      r.shop.phone,
    ]
      .filter((line) => line !== null)
      .join("\n");

  // The phone's own share sheet: WhatsApp, Messages, notes, wherever they like.
  const share = () => {
    if (receipt) Share.share({ message: asText(receipt) }).catch(() => undefined);
  };

  // Straight to WhatsApp where it is installed; the web link where it is not.
  const whatsapp = async () => {
    if (!receipt) return;
    const text = encodeURIComponent(asText(receipt));
    const app = `whatsapp://send?text=${text}`;
    const opened = await Linking.openURL(app).then(
      () => true,
      () => false
    );
    if (!opened) await Linking.openURL(`https://wa.me/?text=${text}`).catch(() => undefined);
  };

  if (missing) {
    return (
      <Screen padTop={false}>
        <EmptyState
          icon="cut-outline"
          title={t("history.gone")}
          hint={t("history.goneHint")}
          action={<Button tone="secondary" label={t("history.title")} onPress={() => router.back()} />}
        />
      </Screen>
    );
  }

  if (!receipt) {
    return (
      <Screen padTop={false}>
        <Skeleton height={40} />
        <Skeleton height={260} />
      </Screen>
    );
  }

  const subtotal =
    receipt.services.reduce((sum, s) => sum + s.price * s.quantity, 0) + receipt.products.reduce((sum, p) => sum + p.total, 0);
  const line = (key: string, label: string, quantity: number, amount: number) => (
    <View key={key} style={[styles.line, { borderTopColor: colors.line }]}>
      <T style={{ flex: 1, color: colors.mid, fontSize: 14 }}>
        {label}
        {quantity > 1 ? <T style={{ color: colors.soft }}> ×{quantity}</T> : null}
      </T>
      <T style={{ color: colors.ink, fontSize: 14, fontVariant: ["tabular-nums"] }}>{fmtCurrency(amount)}</T>
    </View>
  );

  return (
    <Screen padTop={false}>
      <T style={{ color: colors.soft, fontSize: 14 }}>
        {t("history.receiptNo")} {receipt.receiptNo}
      </T>

      <Card raised style={{ padding: 20 }}>
        <View style={styles.head}>
          <T style={{ color: colors.ink, fontSize: 14, fontWeight: "700", letterSpacing: 3.4 }}>
            {receipt.shop.name.toUpperCase()}
          </T>
          <T style={{ color: colors.soft, fontSize: 12, marginTop: 4 }}>{fmtDateTime(receipt.visitAt)}</T>
          {receipt.barber ? <T style={{ color: colors.accent, fontSize: 12, marginTop: 4 }}>{receipt.barber.name}</T> : null}
        </View>

        <View>
          {receipt.services.map((s, i) => line(`s${i}`, name(s), s.quantity, s.price * s.quantity))}
          {receipt.products.map((p, i) => line(`p${i}`, p.name, p.quantity, p.total))}
        </View>

        <View style={[styles.totals, { borderTopColor: colors.line }]}>
          {/* Shown only when it differs, so nobody hunts for a discount that is
              the shop's business rather than a line on their copy. */}
          {Math.round(subtotal) !== Math.round(receipt.total) ? (
            <View style={styles.between}>
              <T style={{ color: colors.soft, fontSize: 12 }}>{t("field.subtotal")}</T>
              <T style={{ color: colors.soft, fontSize: 12, fontVariant: ["tabular-nums"] }}>{fmtCurrency(subtotal)}</T>
            </View>
          ) : null}
          <View style={styles.between}>
            <T style={{ color: colors.faint, fontSize: 10, fontWeight: "700", letterSpacing: 1.8 }}>
              {t("field.total").toUpperCase()}
            </T>
            <T style={{ color: colors.accent, fontSize: 24, fontVariant: ["tabular-nums"] }}>{fmtCurrency(receipt.total)}</T>
          </View>
        </View>

        {receipt.rating !== null ? (
          <View style={[styles.rated, { borderTopColor: colors.line }]}>
            <T style={{ color: colors.soft, fontSize: 12 }}>{t("history.youRated")}</T>
            <Stars rating={receipt.rating} />
          </View>
        ) : null}

        {receipt.shop.phone ? (
          <T style={{ color: colors.faint, fontSize: 12, textAlign: "center", marginTop: 16, writingDirection: "ltr" }}>
            {receipt.shop.phone}
          </T>
        ) : null}
      </Card>

      <View style={{ flexDirection: "row", gap: 8 }}>
        <Button label={t("history.sendWhatsApp")} onPress={whatsapp} style={{ flex: 1 }} />
        <Button tone="secondary" label={t("history.share")} onPress={share} style={{ flex: 1 }} />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  head: { alignItems: "center", paddingBottom: 16 },
  line: { flexDirection: "row", alignItems: "baseline", gap: 16, paddingVertical: 12, borderTopWidth: StyleSheet.hairlineWidth },
  totals: { gap: 8, paddingTop: 16, borderTopWidth: StyleSheet.hairlineWidth },
  between: { flexDirection: "row", alignItems: "baseline", justifyContent: "space-between", gap: 16 },
  rated: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, marginTop: 16, paddingTop: 16, borderTopWidth: StyleSheet.hairlineWidth },
});
