import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { resetDatabase, startTestDatabase, testPrisma } from "./db";
import { at, dayAhead, getRequest, seedShop, type Shop } from "./fixtures";
import { GET as runDigest } from "@/app/api/cron/digest/route";

/**
 * The owner's nightly line. It must count the same money the day journal counts,
 * reach owners and nobody else, and stay quiet on a day the shop was shut.
 */

vi.mock("@/lib/prisma", async () => ({ prisma: (await import("./db")).testPrisma() }));
vi.mock("next-auth", () => ({ getServerSession: async () => null }));

const sent: { endpoint: string; payload: string }[] = [];
vi.mock("web-push", () => ({
  default: {
    generateVAPIDKeys: () => ({ publicKey: "test-public-key", privateKey: "test-private-key" }),
    setVapidDetails: () => undefined,
    sendNotification: async (subscription: { endpoint: string }, payload: string) => {
      sent.push({ endpoint: subscription.endpoint, payload });
      return { statusCode: 201 };
    },
  },
}));

let shop: Shop;

beforeAll(() => startTestDatabase());

beforeEach(async () => {
  await resetDatabase();
  sent.length = 0;
  shop = await seedShop();
});

/** A phone belonging to somebody on the staff. */
async function phoneFor(userId: string, label: string) {
  await testPrisma().pushSubscription.create({
    data: { endpoint: `https://push.example/${label}`, p256dh: "key", auth: "auth", userId },
  });
}

/** Money taken today, the way the till would have taken it. */
async function tookToday(total: number, paymentMethod: "CASH" | "CARD" | "INSTAPAY" = "CASH") {
  const amounts =
    paymentMethod === "CASH"
      ? { cashAmount: total }
      : paymentMethod === "CARD"
        ? { cardAmount: total }
        : { instapayAmount: total };

  return testPrisma().visit.create({
    data: { customerId: shop.customer.id, barberId: shop.barbers.abdullah, total, paymentMethod, ...amounts },
  });
}

const run = () => runDigest(getRequest("/api/cron/digest"));

describe("the owner's nightly line", () => {
  it("counts the day's takings, split by how they were paid", async () => {
    await phoneFor(shop.owner.id, "owner");
    await tookToday(300, "CASH");
    await tookToday(200, "CARD");
    await tookToday(150, "INSTAPAY");

    const body = await (await run()).json();
    expect(body.day).toMatchObject({ visits: 3, takings: 650, cash: 300, card: 200, instapay: 150 });
    expect(body.notificationsSent).toBe(1);

    const message = JSON.parse(sent[0].payload);
    expect(message.title).toBe("Today at Escape");
    expect(message.body).toContain("650 EGP from 3 visits");
    expect(message.body).toContain("300 cash · 200 card · 150 InstaPay");
  });

  it("counts what the no-shows cost", async () => {
    await phoneFor(shop.owner.id, "owner");
    await tookToday(300);
    await testPrisma().appointment.create({
      data: {
        customerId: shop.customer.id,
        barberId: shop.barbers.abdullah,
        startAt: at(dayAhead(0), 12 * 60),
        endAt: at(dayAhead(0), 12 * 60 + 30),
        durationMinutes: 30,
        totalPrice: 250,
        status: "NO_SHOW",
      },
    });

    const body = await (await run()).json();
    expect(body.day).toMatchObject({ noShows: 1, noShowValue: 250 });
    expect(JSON.parse(sent[0].payload).body).toContain("1 no-show (250 EGP)");
  });

  it("looks ahead to tomorrow, and only at what is still standing", async () => {
    await phoneFor(shop.owner.id, "owner");
    await tookToday(300);

    for (const [minutes, status] of [[12 * 60, "CONFIRMED"], [13 * 60, "PENDING"], [14 * 60, "CANCELLED"]] as const) {
      await testPrisma().appointment.create({
        data: {
          customerId: shop.customer.id,
          barberId: shop.barbers.abdullah,
          startAt: at(dayAhead(1), minutes),
          endAt: at(dayAhead(1), minutes + 30),
          durationMinutes: 30,
          totalPrice: 150,
          status,
        },
      });
    }

    const body = await (await run()).json();
    expect(body.day.tomorrow).toBe(2);
    expect(JSON.parse(sent[0].payload).body).toContain("Tomorrow: 2 booked");
  });

  it("leaves yesterday's takings out of today's line", async () => {
    await phoneFor(shop.owner.id, "owner");
    await tookToday(300);
    await testPrisma().visit.create({
      data: {
        customerId: shop.customer.id,
        barberId: shop.barbers.abdullah,
        total: 9999,
        paymentMethod: "CASH",
        cashAmount: 9999,
        visitAt: at(dayAhead(-1), 15 * 60),
      },
    });

    expect((await (await run()).json()).day.takings).toBe(300);
  });

  it("says nothing at all on a day the shop was shut", async () => {
    await phoneFor(shop.owner.id, "owner");
    const body = await (await run()).json();
    expect(body.sent).toBe(0);
    expect(sent).toHaveLength(0);
  });

  it("is the owner's line, not the cashier's", async () => {
    await phoneFor(shop.owner.id, "owner");
    await phoneFor(shop.cashier.id, "cashier");
    await tookToday(300);

    await run();
    expect(sent).toHaveLength(1);
    expect(sent[0].endpoint).toContain("owner");
  });

  it("is closed to anyone without the scheduler's secret", async () => {
    process.env.CRON_SECRET = "let-me-in";
    try {
      expect((await run()).status).toBe(401);
      const authorised = new Request("http://localhost/api/cron/digest", {
        headers: { authorization: "Bearer let-me-in" },
      });
      expect((await runDigest(authorised as never)).status).toBe(200);
    } finally {
      delete process.env.CRON_SECRET;
    }
  });
});
