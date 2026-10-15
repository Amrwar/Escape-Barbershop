import { prisma } from "./prisma";
import type { PushMessage } from "./reminders";

/**
 * Notifications to the phone app, through Expo's push service.
 *
 * The app registers an Expo push token for each install; Expo passes the
 * message on to Apple or Google. It needs no key of ours — EXPO_ACCESS_TOKEN is
 * used when set, for a project that has turned on Expo's push security — and,
 * like the browser path in ./push, it never throws at the caller: a booking
 * must not fail because a notification could not be delivered.
 */

const ENDPOINT = "https://exp.host/--/api/v2/push/send";
/** Expo takes at most a hundred messages a request. */
const BATCH = 100;

interface Ticket {
  status: "ok" | "error";
  details?: { error?: string };
}

/** Whether a string is shaped like a token Expo issued, so nothing else is stored or sent. */
export function isExpoPushToken(token: unknown): token is string {
  return typeof token === "string" && /^Expo(nent)?PushToken\[[^\]]+\]$/.test(token);
}

export async function sendAppPush(customerId: string, message: PushMessage): Promise<number> {
  try {
    const devices = await prisma.appPushToken.findMany({ where: { customerId }, select: { id: true, token: true } });
    let delivered = 0;

    for (let i = 0; i < devices.length; i += BATCH) {
      const batch = devices.slice(i, i + BATCH);
      const res = await fetch(ENDPOINT, {
        method: "POST",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
          ...(process.env.EXPO_ACCESS_TOKEN ? { Authorization: `Bearer ${process.env.EXPO_ACCESS_TOKEN}` } : {}),
        },
        body: JSON.stringify(
          batch.map((d) => ({
            to: d.token,
            title: message.title,
            body: message.body,
            sound: "default",
            // Where the app should open when it is tapped.
            data: { url: message.url },
          }))
        ),
      });
      if (!res.ok) {
        console.error("[app-push] Expo refused the batch", res.status);
        continue;
      }

      const tickets = ((await res.json()) as { data?: Ticket[] }).data ?? [];
      await Promise.all(
        tickets.map(async (ticket, n) => {
          const device = batch[n];
          if (!device) return;
          if (ticket.status === "ok") {
            delivered += 1;
            await prisma.appPushToken.updateMany({ where: { id: device.id }, data: { lastSentAt: new Date() } });
          } else if (ticket.details?.error === "DeviceNotRegistered") {
            // The app was removed or its permission withdrawn: forget the
            // token rather than writing to it every day for ever.
            await prisma.appPushToken.deleteMany({ where: { id: device.id } });
          } else {
            console.error("[app-push] delivery failed", ticket.details?.error);
          }
        })
      );
    }
    return delivered;
  } catch (err) {
    console.error("[app-push]", err);
    return 0;
  }
}
