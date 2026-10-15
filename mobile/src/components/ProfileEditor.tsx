import { useEffect, useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import * as ImagePicker from "expo-image-picker";
import { ImageManipulator, SaveFormat } from "expo-image-manipulator";
import { ApiError, api } from "@/lib/api";
import { useTranslation } from "@/lib/i18n";
import { RADIUS, useTheme } from "@/lib/theme";
import type { Me } from "@/lib/types";
import { T, Avatar, Button, Card, Field, Notice } from "./kit";

/**
 * Everything on their record that is theirs to change: their picture, their
 * name, the number they sign in with, the birthday the shop wishes them on,
 * and their password. It saves when they ask it to rather than on every
 * keystroke, so a half-typed number is never sent anywhere.
 */

/** The same size the web app sends: big enough for a face, small enough to send. */
const PHOTO_SIDE = 512;

/** "1994-09-18" split for three small boxes, so nobody types a date format. */
function splitBirthday(iso: string | null) {
  const [y = "", m = "", d = ""] = (iso ?? "").slice(0, 10).split("-");
  return { d, m, y };
}

export function ProfileEditor({ me, onSaved }: { me: Me; onSaved: () => void }) {
  const { colors } = useTheme();
  const { t, lang } = useTranslation();
  const [name, setName] = useState(me.name);
  const [phone, setPhone] = useState(me.phone ?? "");
  const [birth, setBirth] = useState(() => splitBirthday(me.birthday));
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [busy, setBusy] = useState<"details" | "password" | "photo" | null>(null);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    if (!message) return;
    const timer = setTimeout(() => setMessage(""), 3000);
    return () => clearTimeout(timer);
  }, [message]);

  const save = async (what: "details" | "password" | "photo", body: Record<string, string | null>) => {
    setBusy(what);
    setError("");
    setMessage("");
    try {
      await api("/api/customer/me", { method: "PATCH", body });
      setMessage(t("booking.saved"));
      if (what === "password") {
        setCurrentPassword("");
        setNewPassword("");
      }
      onSaved();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t("appointments.networkError"));
    } finally {
      setBusy(null);
    }
  };

  // Empty boxes forget the birthday; otherwise all three, zero-padded.
  const birthday =
    !birth.d && !birth.m && !birth.y ? "" : `${birth.y.padStart(4, "0")}-${birth.m.padStart(2, "0")}-${birth.d.padStart(2, "0")}`;
  const savedBirthday = (me.birthday ?? "").slice(0, 10);
  const changed = name.trim() !== me.name || phone.trim() !== (me.phone ?? "") || birthday !== savedBirthday;

  const choosePhoto = async () => {
    const picked = await ImagePicker.launchImageLibraryAsync({ mediaTypes: "images", allowsEditing: true, aspect: [1, 1], quality: 1 });
    if (picked.canceled || !picked.assets[0]) return;
    setBusy("photo");
    try {
      const rendered = await ImageManipulator.manipulate(picked.assets[0].uri)
        .resize({ width: PHOTO_SIDE, height: PHOTO_SIDE })
        .renderAsync();
      const saved = await rendered.saveAsync({ base64: true, compress: 0.82, format: SaveFormat.JPEG });
      if (!saved.base64) throw new Error("no image data");
      await save("photo", { photo: `data:image/jpeg;base64,${saved.base64}` });
    } catch {
      setError(t("app.photoFailed"));
      setBusy(null);
    }
  };

  const digits = (v: string, max: number) => v.replace(/\D/g, "").slice(0, max);

  return (
    <View style={{ gap: 16 }}>
      {message ? <Notice tone="good" text={message} /> : null}
      {error ? <Notice text={error} /> : null}

      <Card style={{ padding: 16, gap: 14 }}>
        {/* Their picture, which the barber sees when they arrive. */}
        <View style={styles.row}>
          <Avatar name={me.name} photo={me.photo} size={64} />
          <View style={{ flex: 1, gap: 6 }}>
            <View style={{ flexDirection: "row", gap: 8, flexWrap: "wrap" }}>
              <Button
                tone="secondary"
                label={me.photo ? t("app.photoChange") : t("app.photoAdd")}
                onPress={choosePhoto}
                busy={busy === "photo"}
              />
              {me.photo ? <Button tone="danger" label={t("app.photoRemove")} onPress={() => save("photo", { photo: "" })} /> : null}
            </View>
            <T style={{ color: colors.soft, fontSize: 11 }}>{t("app.photoHint")}</T>
          </View>
        </View>
      </Card>

      <Card style={{ padding: 16, gap: 14 }}>
        <T style={{ fontSize: 15, fontWeight: "600" }}>{t("app.yourDetails")}</T>
        <Field label={t("field.name")} value={name} onChangeText={setName} autoComplete="name" />
        <View style={{ gap: 4 }}>
          <Field
            label={t("field.phone")}
            value={phone}
            onChangeText={setPhone}
            keyboardType="phone-pad"
            autoComplete="tel"
            style={{ writingDirection: "ltr", textAlign: lang === "ar" ? "right" : "left" }}
          />
          <T style={{ color: colors.faint, fontSize: 11 }}>{t("app.phoneIsLogin")}</T>
        </View>
        <View style={{ gap: 6 }}>
          <T style={{ fontSize: 13, fontWeight: "600" }}>{t("birthdays.field")}</T>
          {/* Day, month, year: always written that way round, as it is spoken. */}
          <View style={[styles.row, { direction: "ltr" }]}>
            {(
              [
                ["d", "DD", 2],
                ["m", "MM", 2],
                ["y", "YYYY", 4],
              ] as const
            ).map(([key, placeholder, max]) => (
              <Field
                key={key}
                value={birth[key]}
                onChangeText={(v) => setBirth((b) => ({ ...b, [key]: digits(v, max) }))}
                placeholder={placeholder}
                keyboardType="number-pad"
                maxLength={max}
                accessibilityLabel={`${t("birthdays.field")} ${placeholder}`}
                style={{ width: max === 4 ? 92 : 64, textAlign: "center" }}
              />
            ))}
            {birthday ? (
              <Pressable onPress={() => setBirth({ d: "", m: "", y: "" })} hitSlop={10} accessibilityRole="button">
                <T style={{ color: colors.accent, fontSize: 13 }}>✕</T>
              </Pressable>
            ) : null}
          </View>
          <T style={{ color: colors.faint, fontSize: 11 }}>{t("app.birthdayHint")}</T>
        </View>
        <Button
          label={t("action.save")}
          onPress={() => save("details", { name: name.trim(), phone: phone.trim(), birthday })}
          disabled={!changed || name.trim().length < 2}
          busy={busy === "details"}
        />
      </Card>

      <Card style={{ padding: 16, gap: 14 }}>
        <T style={{ fontSize: 15, fontWeight: "600" }}>{t("app.changePassword")}</T>
        <Field
          label={t("app.currentPassword")}
          value={currentPassword}
          onChangeText={setCurrentPassword}
          secureTextEntry
          autoComplete="current-password"
          textContentType="password"
        />
        <Field
          label={t("app.newPassword")}
          value={newPassword}
          onChangeText={setNewPassword}
          secureTextEntry
          autoComplete="new-password"
          textContentType="newPassword"
        />
        <Button
          tone="secondary"
          label={t("app.changePassword")}
          onPress={() => save("password", { currentPassword, newPassword })}
          disabled={!currentPassword || newPassword.length < 6}
          busy={busy === "password"}
          style={{ borderRadius: RADIUS }}
        />
      </Card>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", gap: 12 },
});
