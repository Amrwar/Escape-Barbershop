import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { resetDatabase, startTestDatabase, testPrisma } from "./db";
import { at, customerSession, dayAhead, getRequest, jsonRequest, seedCustomerLogin, seedShop, staffSession, type Shop } from "./fixtures";
import { GET as depositSettings, PATCH as saveDepositSettings } from "@/app/api/settings/deposits/route";
import { GET as listDeposits } from "@/app/api/deposits/route";
import { PATCH as handleDeposit } from "@/app/api/deposits/[id]/route";
import { POST as bookAsCustomer } from "@/app/api/customer/appointments/route";
import { POST as createVisit } from "@/app/api/visits/route";
import { PATCH as editCustomer } from "@/app/api/customers/[id]/route";

/**
 * Deposits on the expensive work.
 *
 * The money has to be right, and "right" here means one particular thing: a
 * deposit is never revenue when it arrives. It becomes part of the visit when
 * the customer comes, or a kept deposit when they do not — never both, and
 * never twice.
 */

vi.mock("@/lib/prisma", async () => ({ prisma: (await import("./db")).testPrisma() }));

let session: unknown = null;
vi.mock("next-auth", () => ({ getServerSession: async () => session }));

vi.mock("web-push", () => ({
  default: {
    generateVAPIDKeys: () => ({ publicKey: "k", privateKey: "k" }),
    setVapidDetails: () => undefined,
    sendNotification: async () => ({ statusCode: 201 }),
  },
}));

let shop: Shop;
let login: { id: string; customerId: string };

beforeAll(() => startTestDatabase());

beforeEach(async () => {
  await resetDatabase();
  shop = await seedShop();
  login = await seedCustomerLogin(shop.customer.id);
  session = staffSession(shop.owner.id);
});

/** The shop's policy, and somewhere for the money to go. */
const turnOn = (patch: Record<string, unknown> = {}) =>
  saveDepositSettings(
    jsonRequest(
      "/api/settings/deposits",
      { enabled: true, threshold: 1000, percent: 25, holdHours: 24, instapay: "01099998888", ...patch },
      "PATCH"
    )
  );

/** The protein treatment costs 2000 — over any sensible threshold. */
const bookExpensive = async () => {
  session = customerSession(login.id, login.customerId);
  // Priced high, and bookable online for this test.
  await testPrisma().service.update({ where: { id: shop.services.protein }, data: { bookableOnline: true } });
  const res = await bookAsCustomer(
    jsonRequest("/api/customer/appointments", {
      startAt: at(dayAhead(2), 12 * 60).toISOString(),
      serviceIds: [shop.services.protein],
    })
  );
  session = staffSession(shop.owner.id);
  return res;
};

const confirmReceived = (id: string) =>
  handleDeposit(jsonRequest(`/api/deposits/${id}`, { action: "received" }, "PATCH"), { params: { id } });

describe("the policy", () => {
  it("is off until the shop turns it on", async () => {
    expect((await (await depositSettings()).json()).enabled).toBe(false);
  });

  it("refuses to be turned on with nowhere to send the money", async () => {
    const res = await saveDepositSettings(jsonRequest("/x", { enabled: true, instapay: "" }, "PATCH"));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toContain("InstaPay");
  });

  it("refuses a share that is not a share", async () => {
    expect((await turnOn({ percent: 0 })).status).toBe(400);
    expect((await turnOn({ percent: 120 })).status).toBe(400);
  });

  it("is not the cashier's to set, though they may read it", async () => {
    session = staffSession(shop.cashier.id, "CASHIER");
    expect((await depositSettings()).status).toBe(200);
    expect((await turnOn()).status).toBe(401);
  });
});

describe("booking work that needs one", () => {
  it("holds the chair rather than giving it, and says what to send where", async () => {
    await turnOn();
    const res = await bookExpensive();
    expect(res.status).toBe(201);

    const body = await res.json();
    expect(body.deposit).toMatchObject({ amount: 500, instapay: "01099998888" }); // 25% of 2000
    expect(body.deposit.reference).toMatch(/^ESC-/);

    const booking = await testPrisma().appointment.findFirstOrThrow();
    expect(booking.status).toBe("PENDING");
    expect(booking.depositStatus).toBe("EXPECTED");
    expect(booking.holdUntil).toBeTruthy();
  });

  it("asks nothing on an ordinary haircut", async () => {
    await turnOn();
    session = customerSession(login.id, login.customerId);
    const res = await bookAsCustomer(
      jsonRequest("/api/customer/appointments", {
        startAt: at(dayAhead(2), 13 * 60).toISOString(),
        serviceIds: [shop.services.haircut],
      })
    );

    expect((await res.json()).deposit).toBeUndefined();
    expect((await testPrisma().appointment.findFirstOrThrow()).status).toBe("CONFIRMED");
  });

  it("asks nothing at all while the policy is off", async () => {
    const res = await bookExpensive();
    expect((await res.json()).deposit).toBeUndefined();
    expect((await testPrisma().appointment.findFirstOrThrow()).depositAmount).toBe(0);
  });
});

describe("when the money arrives", () => {
  it("confirms the booking and stops holding the chair", async () => {
    await turnOn();
    const booking = await (await bookExpensive()).json();

    expect((await confirmReceived(booking.id)).status).toBe(200);

    const after = await testPrisma().appointment.findUniqueOrThrow({ where: { id: booking.id } });
    expect(after.depositStatus).toBe("RECEIVED");
    expect(after.status).toBe("CONFIRMED");
    expect(after.holdUntil).toBeNull();
    expect(after.depositPaidAt).toBeTruthy();
  });

  it("is written down, with the reference the customer used", async () => {
    await turnOn();
    const booking = await (await bookExpensive()).json();
    await confirmReceived(booking.id);

    const entry = await testPrisma().auditLog.findFirstOrThrow({ where: { summary: { contains: "Deposit received" } } });
    expect(entry.amount).toBe(500);
    expect(entry.summary).toContain("ESC-");
  });

  it("cannot be confirmed twice", async () => {
    await turnOn();
    const booking = await (await bookExpensive()).json();
    await confirmReceived(booking.id);
    expect((await confirmReceived(booking.id)).status).toBe(409);
  });

  it("is not counted as takings while it sits there", async () => {
    await turnOn();
    const booking = await (await bookExpensive()).json();
    await confirmReceived(booking.id);

    // Money in hand, but nothing sold: the visits are what revenue is.
    expect(await testPrisma().visit.count()).toBe(0);

    const { summary } = await (await listDeposits(getRequest("/api/deposits"))).json();
    expect(summary.held).toBe(500);
    expect(summary.used).toBe(0);
  });
});

describe("when the customer comes", () => {
  async function readyToRingUp() {
    await turnOn();
    const booking = await (await bookExpensive()).json();
    await confirmReceived(booking.id);
    return booking;
  }

  it("asks only for the rest, and the takings are still the full price", async () => {
    const booking = await readyToRingUp();

    const res = await createVisit(
      jsonRequest("/api/visits", {
        customerId: shop.customer.id,
        barberId: shop.barbers.abdullah,
        visitAt: new Date().toISOString(),
        paymentMethod: "CASH",
        discount: 0,
        tip: 0,
        items: [{ serviceId: shop.services.protein, quantity: 1, priceAtTime: 2000 }],
        appointmentId: booking.id,
      })
    );
    expect(res.status).toBe(201);

    const visit = await res.json();
    // The full price is the revenue; the customer handed over 1500 today.
    expect(visit.total).toBe(2000);
    expect(visit.cashAmount).toBe(1500);
    expect(visit.instapayAmount).toBe(500);
    // Paid two ways, because it genuinely was.
    expect(visit.paymentMethod).toBe("MIXED");
  });

  it("marks the deposit as used, so it is never counted as held again", async () => {
    const booking = await readyToRingUp();
    await createVisit(
      jsonRequest("/api/visits", {
        customerId: shop.customer.id,
        barberId: shop.barbers.abdullah,
        visitAt: new Date().toISOString(),
        paymentMethod: "CASH",
        discount: 0,
        tip: 0,
        items: [{ serviceId: shop.services.protein, quantity: 1, priceAtTime: 2000 }],
        appointmentId: booking.id,
      })
    );

    expect((await testPrisma().appointment.findUniqueOrThrow({ where: { id: booking.id } })).depositStatus).toBe("USED");

    const { summary } = await (await listDeposits(getRequest("/api/deposits"))).json();
    expect(summary.held).toBe(0);
    expect(summary.used).toBe(500);
  });

  it("counts the money once, not twice", async () => {
    const booking = await readyToRingUp();
    await createVisit(
      jsonRequest("/api/visits", {
        customerId: shop.customer.id,
        barberId: shop.barbers.abdullah,
        visitAt: new Date().toISOString(),
        paymentMethod: "CASH",
        discount: 0,
        tip: 0,
        items: [{ serviceId: shop.services.protein, quantity: 1, priceAtTime: 2000 }],
        appointmentId: booking.id,
      })
    );

    const takings = await testPrisma().visit.aggregate({ _sum: { total: true, cashAmount: true, instapayAmount: true } });
    expect(takings._sum.total).toBe(2000);
    // What was actually collected, across both moments, adds to the same.
    expect((takings._sum.cashAmount ?? 0) + (takings._sum.instapayAmount ?? 0)).toBe(2000);
  });

  it("takes nothing off when the deposit never arrived", async () => {
    await turnOn();
    const booking = await (await bookExpensive()).json();

    const visit = await (
      await createVisit(
        jsonRequest("/api/visits", {
          customerId: shop.customer.id,
          barberId: shop.barbers.abdullah,
          visitAt: new Date().toISOString(),
          paymentMethod: "CASH",
          discount: 0,
          tip: 0,
          items: [{ serviceId: shop.services.protein, quantity: 1, priceAtTime: 2000 }],
          appointmentId: booking.id,
        })
      )
    ).json();

    expect(visit.cashAmount).toBe(2000);
    expect(visit.paymentMethod).toBe("CASH");
  });
});

describe("when the customer never comes", () => {
  async function held() {
    await turnOn();
    const booking = await (await bookExpensive()).json();
    await confirmReceived(booking.id);
    return booking;
  }

  it("lets the owner keep it, on its own line rather than in the takings", async () => {
    const booking = await held();

    const res = await handleDeposit(jsonRequest("/x", { action: "forfeited" }, "PATCH"), { params: { id: booking.id } });
    expect(res.status).toBe(200);

    const { summary } = await (await listDeposits(getRequest("/api/deposits"))).json();
    expect(summary.forfeited).toBe(500);
    expect(summary.held).toBe(0);
    // Kept money is income, but it is not a haircut, so it is not a visit.
    expect(await testPrisma().visit.count()).toBe(0);
  });

  it("lets the owner give it back instead", async () => {
    const booking = await held();
    await handleDeposit(jsonRequest("/x", { action: "refunded" }, "PATCH"), { params: { id: booking.id } });

    const { summary } = await (await listDeposits(getRequest("/api/deposits"))).json();
    expect(summary.refunded).toBe(500);
    expect(summary.held).toBe(0);
  });

  it("is not the cashier's money to keep or give away", async () => {
    const booking = await held();
    session = staffSession(shop.cashier.id, "CASHIER");

    expect((await handleDeposit(jsonRequest("/x", { action: "forfeited" }, "PATCH"), { params: { id: booking.id } })).status).toBe(401);
    expect((await handleDeposit(jsonRequest("/x", { action: "refunded" }, "PATCH"), { params: { id: booking.id } })).status).toBe(401);
    expect((await testPrisma().appointment.findUniqueOrThrow({ where: { id: booking.id } })).depositStatus).toBe("RECEIVED");
  });

  it("cannot keep money that never arrived", async () => {
    await turnOn();
    const booking = await (await bookExpensive()).json();
    expect((await handleDeposit(jsonRequest("/x", { action: "forfeited" }, "PATCH"), { params: { id: booking.id } })).status).toBe(409);
  });
});

describe("somebody who keeps not turning up", () => {
  /** Two appointments they were marked down for and never came to. */
  async function missed(count: number, daysAgo = 10) {
    for (let i = 0; i < count; i++) {
      const start = new Date(Date.now() - (daysAgo + i) * 86_400_000);
      await testPrisma().appointment.create({
        data: {
          customerId: shop.customer.id,
          barberId: shop.barbers.abdullah,
          startAt: start,
          endAt: new Date(start.getTime() + 1_800_000),
          durationMinutes: 30,
          totalPrice: 300,
          status: "NO_SHOW",
        },
      });
    }
  }

  /** Deposits on, with the no-show rule switched on beside them. */
  const withNoShowRule = (patch: Record<string, unknown> = {}) =>
    saveDepositSettings(
      jsonRequest(
        "/api/settings/deposits",
        {
          instapay: "01099998888",
          noShow: { enabled: true, allowed: 2, windowDays: 90, ...patch },
        },
        "PATCH"
      )
    );

  /** An ordinary haircut, far below any price threshold. */
  const bookOrdinary = async () => {
    session = customerSession(login.id, login.customerId);
    const res = await bookAsCustomer(
      jsonRequest("/api/customer/appointments", {
        startAt: at(dayAhead(2), 14 * 60).toISOString(),
        serviceIds: [shop.services.haircut],
      })
    );
    session = staffSession(shop.owner.id);
    return res;
  };

  it("asks a repeat no-show for a deposit, even on a cheap haircut", async () => {
    await withNoShowRule();
    await missed(2);

    const body = await (await bookOrdinary()).json();
    expect(body.deposit).toBeTruthy();
    expect(body.deposit.amount).toBeGreaterThan(0);
    // Held rather than confirmed, like any other booking waiting on money.
    expect((await testPrisma().appointment.findFirstOrThrow({ where: { status: "PENDING" } })).depositStatus).toBe("EXPECTED");
  });

  it("asks nothing of somebody who has missed once", async () => {
    await withNoShowRule();
    await missed(1);
    expect((await (await bookOrdinary()).json()).deposit).toBeUndefined();
  });

  it("never refuses the booking — they are still a customer", async () => {
    await withNoShowRule();
    await missed(5);
    expect((await bookOrdinary()).status).toBe(201);
  });

  it("forgets misses that have aged out of the window", async () => {
    await withNoShowRule({ windowDays: 30 });
    await missed(2, 200);
    expect((await (await bookOrdinary()).json()).deposit).toBeUndefined();
  });

  it("lets the shop wipe the slate from the customer's own page", async () => {
    await withNoShowRule();
    await missed(2);

    await editCustomer(jsonRequest(`/api/customers/${shop.customer.id}`, { forgiveNoShows: true }, "PATCH"), {
      params: { id: shop.customer.id },
    });

    expect((await (await bookOrdinary()).json()).deposit).toBeUndefined();
  });

  it("asks nothing at all while the rule is switched off", async () => {
    await saveDepositSettings(jsonRequest("/x", { instapay: "01099998888" }, "PATCH"));
    await missed(5);
    expect((await (await bookOrdinary()).json()).deposit).toBeUndefined();
  });

  it("refuses a rule that would ask everybody, or nobody ever", async () => {
    expect((await withNoShowRule({ allowed: 0 })).status).toBe(400);
    expect((await withNoShowRule({ windowDays: 2 })).status).toBe(400);
  });
});

describe("a chair held too long", () => {
  it("goes back to everybody else once the deposit is overdue", async () => {
    await turnOn();
    const booking = await (await bookExpensive()).json();

    await testPrisma().appointment.update({
      where: { id: booking.id },
      data: { holdUntil: new Date(Date.now() - 60_000) },
    });

    // Reading the list is when the shop notices.
    await listDeposits(getRequest("/api/deposits"));

    const after = await testPrisma().appointment.findUniqueOrThrow({ where: { id: booking.id } });
    expect(after.status).toBe("CANCELLED");
    expect(after.cancelReason).toContain("deposit");
  });

  it("never lets go of a chair that was paid for", async () => {
    await turnOn();
    const booking = await (await bookExpensive()).json();
    await confirmReceived(booking.id);

    await testPrisma().appointment.update({
      where: { id: booking.id },
      data: { holdUntil: new Date(Date.now() - 86_400_000) },
    });
    await listDeposits(getRequest("/api/deposits"));

    expect((await testPrisma().appointment.findUniqueOrThrow({ where: { id: booking.id } })).status).toBe("CONFIRMED");
  });
});
