import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { resetDatabase, startTestDatabase, testPrisma } from "./db";
import { at, customerSession, dayAhead, getRequest, jsonRequest, seedCustomerLogin, seedShop, staffSession, type Shop } from "./fixtures";
import { GET as getKey, POST as subscribe, DELETE as unsubscribe } from "@/app/api/push/subscribe/route";
import { GET as runReminders } from "@/app/api/cron/reminders/route";
import { POST as bookAsCustomer } from "@/app/api/customer/appointments/route";
import { POST as bookAsStaff } from "@/app/api/appointments/route";

/**
 * Notifications: who may subscribe a phone, whose phone it belongs to, and who
 * gets reminded. The push service itself is stubbed — what matters here is that
 * the right people are picked and nobody is told twice.
 */

vi.mock("@/lib/prisma", async () => ({ prisma: (await import("./db")).testPrisma() }));

let session: unknown = null;
vi.mock("next-auth", () => ({ getServerSession: async () => session }));

// Stand in for the browsers' push services, and remember what was sent.
const sent: { endpoint: string; payload: string }[] = [];
let nextFailure: { statusCode: number } | null = null;
vi.mock("web-push", () => ({
  default: {
    generateVAPIDKeys: () => ({ publicKey: "test-public-key", privateKey: "test-private-key" }),
    setVapidDetails: () => undefined,
    sendNotification: async (subscription: { endpoint: string }, payload: string) => {
      if (nextFailure) {
        const failure = nextFailure;
        nextFailure = null;
        throw failure;
      }
      sent.push({ endpoint: subscription.endpoint, payload });
      return { statusCode: 201 };
    },
  },
}));

let shop: Shop;
let login: { id: string; customerId: string };

beforeAll(() => startTestDatabase());

beforeEach(async () => {
  await resetDatabase();
  sent.length = 0;
  nextFailure = null;
  shop = await seedShop();
  login = await seedCustomerLogin(shop.customer.id);
  session = customerSession(login.id, login.customerId);
});

const device = (endpoint: string) => ({ endpoint, keys: { p256dh: "key", auth: "auth" } });
/** Booking sends its notification without waiting; give it a moment to land. */
const settle = () => new Promise((resolve) => setTimeout(resolve, 80));
const subscribeDevice = (endpoint: string) => subscribe(jsonRequest("/api/push/subscribe", device(endpoint)));

describe("turning notifications on", () => {
  it("hands out the shop's public key, making one the first time", async () => {
    const res = await getKey();
    expect(res.status).toBe(200);
    expect((await res.json()).publicKey).toBe("test-public-key");
    // Kept, so every phone is given the same key.
    expect(await testPrisma().setting.count({ where: { key: { startsWith: "push_" } } })).toBe(2);
  });

  it("ties the phone to the customer who is signed in", async () => {
    expect((await subscribeDevice("https://push.example/one")).status).toBe(201);
    const row = await testPrisma().pushSubscription.findFirst();
    expect(row?.customerId).toBe(login.customerId);
    expect(row?.userId).toBeNull();
  });

  it("ties a member of staff's phone to their login instead", async () => {
    session = staffSession(shop.owner.id);
    await subscribeDevice("https://push.example/staff");
    const row = await testPrisma().pushSubscription.findFirst();
    expect(row?.userId).toBe(shop.owner.id);
    expect(row?.customerId).toBeNull();
  });

  it("keeps one row per phone, however often it re-subscribes", async () => {
    await subscribeDevice("https://push.example/one");
    await subscribeDevice("https://push.example/one");
    await subscribeDevice("https://push.example/two");
    expect(await testPrisma().pushSubscription.count()).toBe(2);
  });

  it("is refused to anyone not signed in", async () => {
    session = null;
    expect((await subscribeDevice("https://push.example/nobody")).status).toBe(401);
    expect(await testPrisma().pushSubscription.count()).toBe(0);
  });

  it("removes only your own phone when you turn it off", async () => {
    await subscribeDevice("https://push.example/mine");
    session = staffSession(shop.owner.id);
    await subscribeDevice("https://push.example/theirs");

    // The owner tries to remove the customer's device.
    await unsubscribe(getRequest("/api/push/subscribe?endpoint=https%3A%2F%2Fpush.example%2Fmine"));
    expect(await testPrisma().pushSubscription.count({ where: { endpoint: "https://push.example/mine" } })).toBe(1);

    await unsubscribe(getRequest("/api/push/subscribe?endpoint=https%3A%2F%2Fpush.example%2Ftheirs"));
    expect(await testPrisma().pushSubscription.count({ where: { endpoint: "https://push.example/theirs" } })).toBe(0);
  });
});

describe("when a booking is made", () => {
  beforeEach(async () => {
    await subscribeDevice("https://push.example/phone");
    sent.length = 0;
  });

  it("tells the customer's phone", async () => {
    const res = await bookAsCustomer(
      jsonRequest("/api/customer/appointments", {
        startAt: at(dayAhead(2), 12 * 60).toISOString(),
        serviceIds: [shop.services.haircut],
      })
    );
    expect(res.status).toBe(201);
    await settle();
    expect(sent).toHaveLength(1);
    const message = JSON.parse(sent[0].payload);
    expect(message.title).toBe("Booking confirmed");
    expect(message.url).toBe("/app/appointments");
  });

  it("tells them even when the shop booked it for them", async () => {
    session = staffSession(shop.owner.id);
    await bookAsStaff(
      jsonRequest("/api/appointments", {
        customerId: shop.customer.id,
        barberId: shop.barbers.abdullah,
        startAt: at(dayAhead(2), 13 * 60).toISOString(),
        serviceIds: [shop.services.haircut],
        source: "PHONE",
      })
    );
    await settle();
    expect(sent).toHaveLength(1);
    expect(JSON.parse(sent[0].payload).body).toContain("Abdullah");
  });

  it("still books when the notification cannot be delivered", async () => {
    nextFailure = { statusCode: 500 };
    const res = await bookAsCustomer(
      jsonRequest("/api/customer/appointments", {
        startAt: at(dayAhead(2), 14 * 60).toISOString(),
        serviceIds: [shop.services.haircut],
      })
    );
    expect(res.status).toBe(201);
    expect(await testPrisma().appointment.count()).toBe(1);
  });

  it("throws away a phone the push service says is gone", async () => {
    nextFailure = { statusCode: 410 };
    await bookAsCustomer(
      jsonRequest("/api/customer/appointments", {
        startAt: at(dayAhead(2), 15 * 60).toISOString(),
        serviceIds: [shop.services.haircut],
      })
    );
    await settle();
    expect(await testPrisma().pushSubscription.count()).toBe(0);
  });
});

describe("the reminder run", () => {
  /** An appointment a set number of hours from now, whatever the time of day. */
  const appointmentIn = async (hours: number) =>
    testPrisma().appointment.create({
      data: {
        customerId: shop.customer.id,
        barberId: shop.barbers.abdullah,
        startAt: new Date(Date.now() + hours * 3_600_000),
        endAt: new Date(Date.now() + (hours + 0.5) * 3_600_000),
        durationMinutes: 30,
        totalPrice: 150,
        status: "CONFIRMED",
        services: { create: [{ serviceId: shop.services.haircut, serviceName: "Hair cut", price: 150, durationMinutes: 30 }] },
      },
    });

  it("reminds about tomorrow, once, and stamps it", async () => {
    await subscribeDevice("https://push.example/phone");
    const appointment = await appointmentIn(12);
    sent.length = 0;

    const first = await (await runReminders(getRequest("/api/cron/reminders"))).json();
    expect(first.reminded).toBe(1);
    expect(JSON.parse(sent[0].payload).title).toContain("appointment");

    const stamped = await testPrisma().appointment.findUnique({ where: { id: appointment.id } });
    expect(stamped?.reminderSentAt).toBeTruthy();

    sent.length = 0;
    const second = await (await runReminders(getRequest("/api/cron/reminders"))).json();
    expect(second.reminded).toBe(0);
    expect(sent).toHaveLength(0);
  });

  it("says nothing about a booking further off than the window", async () => {
    await subscribeDevice("https://push.example/phone");
    await appointmentIn(40);
    sent.length = 0;

    expect((await (await runReminders(getRequest("/api/cron/reminders"))).json()).reminded).toBe(0);
  });

  it("says nothing about one that was called off", async () => {
    await subscribeDevice("https://push.example/phone");
    const appointment = await appointmentIn(12);
    await testPrisma().appointment.update({ where: { id: appointment.id }, data: { status: "CANCELLED" } });
    sent.length = 0;

    expect((await (await runReminders(getRequest("/api/cron/reminders"))).json()).reminded).toBe(0);
  });

  it("marks a customer with no phone as reminded, so they are not retried nightly", async () => {
    const appointment = await appointmentIn(12);
    const result = await (await runReminders(getRequest("/api/cron/reminders"))).json();
    expect(result.reminded).toBe(1);
    expect(result.notificationsSent).toBe(0);
    expect((await testPrisma().appointment.findUnique({ where: { id: appointment.id } }))?.reminderSentAt).toBeTruthy();
  });

  it("asks yesterday's customer what they thought, once", async () => {
    await subscribeDevice("https://push.example/phone");
    const end = new Date(Date.now() - 20 * 3_600_000);
    const appointment = await testPrisma().appointment.create({
      data: {
        customerId: shop.customer.id,
        barberId: shop.barbers.abdullah,
        startAt: new Date(end.getTime() - 30 * 60_000),
        endAt: end,
        durationMinutes: 30,
        totalPrice: 150,
        status: "COMPLETED",
        services: { create: [{ serviceId: shop.services.haircut, serviceName: "Hair cut", price: 150, durationMinutes: 30 }] },
      },
    });
    sent.length = 0;

    const first = await (await runReminders(getRequest("/api/cron/reminders"))).json();
    expect(first.asked).toBe(1);
    expect(JSON.parse(sent[0].payload).title).toBe("How was your visit?");
    expect((await testPrisma().appointment.findUnique({ where: { id: appointment.id } }))?.reviewAskedAt).toBeTruthy();

    sent.length = 0;
    expect((await (await runReminders(getRequest("/api/cron/reminders"))).json()).asked).toBe(0);
    expect(sent).toHaveLength(0);
  });

  it("does not ask about a visit they have already reviewed", async () => {
    await subscribeDevice("https://push.example/phone");
    const end = new Date(Date.now() - 20 * 3_600_000);
    const appointment = await testPrisma().appointment.create({
      data: {
        customerId: shop.customer.id,
        barberId: shop.barbers.abdullah,
        startAt: new Date(end.getTime() - 30 * 60_000),
        endAt: end,
        durationMinutes: 30,
        totalPrice: 150,
        status: "COMPLETED",
      },
    });
    await testPrisma().review.create({
      data: { appointmentId: appointment.id, customerId: shop.customer.id, barberId: shop.barbers.abdullah, rating: 5 },
    });
    sent.length = 0;

    expect((await (await runReminders(getRequest("/api/cron/reminders"))).json()).asked).toBe(0);
    expect(sent).toHaveLength(0);
  });

  it("tells a regular who is late by their own rhythm, once", async () => {
    await subscribeDevice("https://push.example/phone");
    await testPrisma().setting.upsert({
      where: { key: "booking_rebooking_enabled" },
      update: { value: "1" },
      create: { key: "booking_rebooking_enabled", value: "1" },
    });

    // Every 28 days, and now 40 days out.
    for (const daysAgo of [96, 68, 40]) {
      await testPrisma().visit.create({
        data: {
          customerId: shop.customer.id,
          barberId: shop.barbers.abdullah,
          total: 150,
          paymentMethod: "CASH",
          cashAmount: 150,
          visitAt: new Date(Date.now() - daysAgo * 86_400_000),
        },
      });
    }
    sent.length = 0;

    const first = await (await runReminders(getRequest("/api/cron/reminders"))).json();
    expect(first.nudged).toBe(1);
    const message = JSON.parse(sent[0].payload);
    expect(message.title).toBe("It has been a while");
    expect(message.body).toContain("Abdullah");

    // Stamped, so tomorrow night says nothing.
    sent.length = 0;
    expect((await (await runReminders(getRequest("/api/cron/reminders"))).json()).nudged).toBe(0);
    expect(sent).toHaveLength(0);
  });

  it("says nothing to a regular who already has an appointment booked", async () => {
    await subscribeDevice("https://push.example/phone");
    await testPrisma().setting.upsert({
      where: { key: "booking_rebooking_enabled" },
      update: { value: "1" },
      create: { key: "booking_rebooking_enabled", value: "1" },
    });

    for (const daysAgo of [96, 68, 40]) {
      await testPrisma().visit.create({
        data: {
          customerId: shop.customer.id,
          barberId: shop.barbers.abdullah,
          total: 150,
          paymentMethod: "CASH",
          cashAmount: 150,
          visitAt: new Date(Date.now() - daysAgo * 86_400_000),
        },
      });
    }
    await testPrisma().appointment.create({
      data: {
        customerId: shop.customer.id,
        barberId: shop.barbers.abdullah,
        startAt: new Date(Date.now() + 3 * 86_400_000),
        endAt: new Date(Date.now() + 3 * 86_400_000 + 1_800_000),
        durationMinutes: 30,
        totalPrice: 150,
        status: "CONFIRMED",
        reminderSentAt: new Date(),
      },
    });
    sent.length = 0;

    expect((await (await runReminders(getRequest("/api/cron/reminders"))).json()).nudged).toBe(0);
    expect(sent).toHaveLength(0);
  });

  it("nudges nobody while the shop has not asked for it", async () => {
    await subscribeDevice("https://push.example/phone");
    for (const daysAgo of [96, 68, 40]) {
      await testPrisma().visit.create({
        data: {
          customerId: shop.customer.id,
          barberId: shop.barbers.abdullah,
          total: 150,
          paymentMethod: "CASH",
          cashAmount: 150,
          visitAt: new Date(Date.now() - daysAgo * 86_400_000),
        },
      });
    }
    sent.length = 0;

    expect((await (await runReminders(getRequest("/api/cron/reminders"))).json()).nudged).toBe(0);
    expect(sent).toHaveLength(0);
  });

  it("is closed to anyone without the scheduler's secret", async () => {
    process.env.CRON_SECRET = "let-me-in";
    try {
      expect((await runReminders(getRequest("/api/cron/reminders"))).status).toBe(401);

      const authorised = new Request("http://localhost/api/cron/reminders", { headers: { authorization: "Bearer let-me-in" } });
      const res = await runReminders(authorised as never);
      expect(res.status).toBe(200);
    } finally {
      delete process.env.CRON_SECRET;
    }
  });
});
