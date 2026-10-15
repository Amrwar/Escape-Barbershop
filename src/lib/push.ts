import webpush from "web-push";
import { prisma } from "./prisma";
import type { PushMessage } from "./reminders";
import { sendAppPush } from "./app-push";

/**
 * Sending a notification to a phone.
 *
 * Push needs a key pair (VAPID) that identifies this shop to Apple's, Google's
 * and Mozilla's push services. The keys are read from the environment when they
 * are set there, and otherwise generated once and kept in the settings table —
 * so the shop gets working notifications without anyone having to paste a key
 * into a hosting dashboard. Set PUSH_PUBLIC_KEY / PUSH_PRIVATE_KEY to override.
 *
 * Nothing here ever throws at the caller: a booking must not fail because a
 * notification could not be delivered.
 */

const PUBLIC_KEY = "push_public_key";
const PRIVATE_KEY = "push_private_key";

export interface VapidKeys {
  publicKey: string;
  privateKey: string;
}

let cached: VapidKeys | null = null;

export async function getVapidKeys(): Promise<VapidKeys | null> {
  if (cached) return cached;

  if (process.env.PUSH_PUBLIC_KEY && process.env.PUSH_PRIVATE_KEY) {
    cached = { publicKey: process.env.PUSH_PUBLIC_KEY, privateKey: process.env.PUSH_PRIVATE_KEY };
    return cached;
  }

  try {
    const rows = await prisma.setting.findMany({ where: { key: { in: [PUBLIC_KEY, PRIVATE_KEY] } } });
    const publicKey = rows.find((r) => r.key === PUBLIC_KEY)?.value;
    const privateKey = rows.find((r) => r.key === PRIVATE_KEY)?.value;
    if (publicKey && privateKey) {
      cached = { publicKey, privateKey };
      return cached;
    }

    const generated = webpush.generateVAPIDKeys();
    await prisma.$transaction([
      prisma.setting.upsert({ where: { key: PUBLIC_KEY }, update: { value: generated.publicKey }, create: { key: PUBLIC_KEY, value: generated.publicKey } }),
      prisma.setting.upsert({ where: { key: PRIVATE_KEY }, update: { value: generated.privateKey }, create: { key: PRIVATE_KEY, value: generated.privateKey } }),
    ]);
    cached = generated;
    return cached;
  } catch (err) {
    console.error("[push] could not read or make the keys", err);
    return null;
  }
}

/** Who is being written to: a customer's phones, or a member of staff's. */
export type PushAudience = { customerId: string } | { userId: string };

/**
 * Every device that should hear it: browsers by web push, and — for a
 * customer — phones with the app, by Expo's push service. Returns how many
 * devices took it, across both.
 */
export async function sendPush(audience: PushAudience, message: PushMessage): Promise<number> {
  const [toBrowsers, toApps] = await Promise.all([
    sendWebPush(audience, message),
    "customerId" in audience ? sendAppPush(audience.customerId, message) : Promise.resolve(0),
  ]);
  return toBrowsers + toApps;
}

async function sendWebPush(audience: PushAudience, message: PushMessage): Promise<number> {
  const keys = await getVapidKeys();
  if (!keys) return 0;

  const subscriptions = await prisma.pushSubscription.findMany({ where: audience });
  if (subscriptions.length === 0) return 0;

  webpush.setVapidDetails(
    process.env.PUSH_CONTACT ?? "mailto:hello@escapebarbershop.example",
    keys.publicKey,
    keys.privateKey
  );

  const payload = JSON.stringify(message);
  let delivered = 0;

  await Promise.all(
    subscriptions.map(async (sub) => {
      try {
        await webpush.sendNotification(
          { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
          payload
        );
        delivered += 1;
        // updateMany, not update: the row may have been removed while this was
        // in flight, and that is not worth an error.
        await prisma.pushSubscription.updateMany({ where: { id: sub.id }, data: { lastSentAt: new Date() } });
      } catch (err: unknown) {
        const status = (err as { statusCode?: number })?.statusCode;
        // 404/410 mean the browser threw this subscription away: so do we,
        // rather than retrying it every day for ever.
        if (status === 404 || status === 410) {
          await prisma.pushSubscription.delete({ where: { id: sub.id } }).catch(() => undefined);
        } else {
          console.error("[push] delivery failed", status, err);
        }
      }
    })
  );

  return delivered;
}

/**
 * The same message to a group of customers, one at a time.
 *
 * Sequential on purpose: a shop announcement is not urgent, and firing a
 * hundred requests at Apple and Google at once is how a sender gets throttled.
 * Returns how many devices actually took it.
 */
export async function sendPushToCustomers(customerIds: string[], message: PushMessage): Promise<number> {
  let delivered = 0;
  for (const customerId of customerIds) {
    delivered += await sendPush({ customerId }, message);
  }
  return delivered;
}

/** Fire and forget: a notification must never take a booking down with it. */
export function sendPushQuietly(audience: PushAudience, message: PushMessage): void {
  sendPush(audience, message).catch((err) => console.error("[push]", err));
}
