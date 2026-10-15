import { Platform } from "react-native";
import * as Notifications from "expo-notifications";
import * as SecureStore from "expo-secure-store";
import Constants from "expo-constants";
import { api } from "./api";

/**
 * Notifications on the phone: the same messages the shop already sends — a
 * note when they book, a reminder the day before, a chair opening up — through
 * Expo's push service to this install.
 *
 * Asked for only when the customer turns them on, never on first launch. Two
 * honest "no"s are told apart: they said no (blocked), or this build cannot
 * receive them at all (unavailable) — the browser preview, Expo Go on Android,
 * or an app not yet linked to the shop's EAS project.
 */

const KEY = "push-token";

export type PushState = "on" | "off" | "blocked" | "unavailable";

/** A notification that arrives while the app is open still shows as a banner. */
export function configureNotifications() {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldPlaySound: true,
      shouldSetBadge: false,
      shouldShowBanner: true,
      shouldShowList: true,
    }),
  });
}

export async function pushState(): Promise<PushState> {
  if (Platform.OS === "web") return "unavailable";
  const stored = await SecureStore.getItemAsync(KEY).catch(() => null);
  if (stored) return "on";
  const { status } = await Notifications.getPermissionsAsync();
  return status === "denied" ? "blocked" : "off";
}

export async function turnPushOn(): Promise<PushState> {
  if (Platform.OS === "web") return "unavailable";
  const projectId = Constants.expoConfig?.extra?.eas?.projectId ?? Constants.easConfig?.projectId;
  if (!projectId) return "unavailable";

  // Android 13 shows no permission prompt until a channel exists.
  if (Platform.OS === "android") {
    await Notifications.setNotificationChannelAsync("appointments", {
      name: "Appointments",
      importance: Notifications.AndroidImportance.HIGH,
    });
  }

  let { status } = await Notifications.getPermissionsAsync();
  if (status !== "granted") status = (await Notifications.requestPermissionsAsync()).status;
  if (status !== "granted") return "blocked";

  try {
    const { data: token } = await Notifications.getExpoPushTokenAsync({ projectId });
    await api("/api/mobile/push", { method: "POST", body: { token, platform: Platform.OS } });
    await SecureStore.setItemAsync(KEY, token).catch(() => undefined);
    return "on";
  } catch {
    // Expo Go on Android, or no network to Expo: nothing to register.
    return "unavailable";
  }
}

/** This phone stops hearing about this customer. Called on sign-out too. */
export async function turnPushOff(): Promise<void> {
  const token = await SecureStore.getItemAsync(KEY).catch(() => null);
  if (!token) return;
  await api(`/api/mobile/push?token=${encodeURIComponent(token)}`, { method: "DELETE" }).catch(() => undefined);
  await SecureStore.deleteItemAsync(KEY).catch(() => undefined);
}

/**
 * Where a tapped notification should open. The server writes web addresses
 * (it sends the same message to browsers); this maps them onto the app's tabs.
 */
export function routeFor(url: unknown): "/" | "/appointments" | "/book" | "/history" | "/profile" {
  const path = typeof url === "string" ? url : "";
  if (path.startsWith("/app/appointments")) return "/appointments";
  if (path.startsWith("/app/book")) return "/book";
  if (path.startsWith("/app/history")) return "/history";
  if (path.startsWith("/app/profile")) return "/profile";
  return "/";
}

/** After the server has refused the login: forget the token here, tell no one. */
export async function forgetPushLocally(): Promise<void> {
  await SecureStore.deleteItemAsync(KEY).catch(() => undefined);
}
