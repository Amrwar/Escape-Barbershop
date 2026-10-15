import { useState } from "react";
import { StyleSheet, View } from "react-native";
import { api } from "@/lib/api";
import { useTranslation } from "@/lib/i18n";
import { useTheme } from "@/lib/theme";
import type { Reviewable } from "@/lib/types";
import { T, Avatar, Button, Card, Field } from "./kit";
import { StarPicker, Stars } from "./Stars";

/**
 * "How was it?" — asked once, about one visit, and easy to ignore. The stars
 * are the whole question; the box for words appears only once they have
 * picked, so it stays a single tap for anyone with nothing to add.
 */
export function ReviewPrompt({ item }: { item: Reviewable }) {
  const { colors } = useTheme();
  const { t, fmtDate } = useTranslation();
  const [rating, setRating] = useState(item.review?.rating ?? 0);
  const [comment, setComment] = useState(item.review?.comment ?? "");
  const [editing, setEditing] = useState(!item.review);
  const [saved, setSaved] = useState(!!item.review);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const save = async () => {
    if (!rating) return;
    setSaving(true);
    setError("");
    try {
      // A booking or a walk-in's visit — whichever this cut was.
      await api("/api/customer/reviews", {
        method: "POST",
        body: item.appointmentId
          ? { appointmentId: item.appointmentId, rating, comment }
          : { visitId: item.visitId, rating, comment },
      });
      setEditing(false);
      setSaved(true);
    } catch {
      setError(t("app.rateFailed"));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card style={{ padding: 20 }}>
      <View style={styles.row}>
        <Avatar name={item.barber?.name ?? "?"} photo={item.barber?.photo} size={40} />
        <View style={{ flex: 1 }}>
          <T numberOfLines={1} style={{ color: colors.ink, fontSize: 14, fontWeight: "500" }}>
            {item.barber ? t("app.rateWith", { name: item.barber.name }) : t("app.rate")}
          </T>
          <T numberOfLines={1} style={{ color: colors.soft, fontSize: 12 }}>
            {fmtDate(item.startAt)} · {item.services.join(" + ")}
          </T>
        </View>
      </View>

      <View style={[styles.body, { borderTopColor: colors.line }]}>
        {!editing && saved ? (
          <View style={[styles.row, { justifyContent: "space-between" }]}>
            <View style={{ flex: 1, gap: 6 }}>
              <Stars rating={rating} size={18} />
              {comment ? <T style={{ color: colors.mid, fontSize: 14 }}>{comment}</T> : null}
              <T style={{ color: colors.good, fontSize: 12 }}>{t("app.rateThanks")}</T>
            </View>
            {item.canReview ? <Button tone="ghost" label={t("app.rateChange")} onPress={() => setEditing(true)} /> : null}
          </View>
        ) : (
          <View style={{ gap: 16 }}>
            <View style={{ alignItems: "center" }}>
              <StarPicker value={rating} onChange={setRating} disabled={saving} />
            </View>
            {rating > 0 ? (
              <>
                <Field
                  placeholder={t("app.rateComment")}
                  value={comment}
                  onChangeText={setComment}
                  maxLength={500}
                  multiline
                  style={{ minHeight: 76, textAlignVertical: "top" }}
                />
                <Button label={t("app.rateSend")} onPress={save} busy={saving} />
              </>
            ) : null}
            {error ? <T style={{ color: colors.bad, fontSize: 12, textAlign: "center" }}>{error}</T> : null}
          </View>
        )}
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", gap: 12 },
  body: { marginTop: 16, paddingTop: 16, borderTopWidth: StyleSheet.hairlineWidth },
});
