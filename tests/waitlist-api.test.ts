import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { resetDatabase, startTestDatabase, testPrisma } from "./db";
import { at, customerSession, dayAhead, getRequest, jsonRequest, seedCustomerLogin, seedShop, staffSession, type Shop } from "./fixtures";
import { GET as myList, POST as joinList, DELETE as leaveList } from "@/app/api/customer/waitlist/route";
import { POST as claimOffer } from "@/app/api/customer/waitlist/[id]/claim/route";
import { POST as bookAsStaff } from "@/app/api/appointments/route";
import { PATCH as changeAppointment } from "@/app/api/appointments/[id]/route";
import { DELETE as customerCancels } from "@/app/api/customer/appointments/[id]/route";

/**
 * The waiting list, end to end: a customer joins a full day, somebody cancels,
 * and the chair is offered to whoever has waited longest.
 *
 * The rules that matter are about fairness — longest wait first, one offer at a
 * time — and about never handing the same chair to two people.
 */

vi.mock("@/lib/prisma", async () => ({ prisma: (await import("./db")).testPrisma() }));

let session: unknown = null;
vi.mock("next-auth", () => ({ getServerSession: async () => session }));

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
let login: { id: string; customerId: string };
const DAY = () => dayAhead(2);

beforeAll(() => startTestDatabase());

beforeEach(async () => {
  await resetDatabase();
  sent.length = 0;
  shop = await seedShop();
  login = await seedCustomerLogin(shop.customer.id);
  session = customerSession(login.id, login.customerId);
});

const join = (body: Record<string, unknown> = {}) =>
  joinList(
    jsonRequest("/api/customer/waitlist", {
      dateISO: DAY(),
      serviceIds: [shop.services.haircut],
      ...body,
    })
  );

/** A booking the shop made, which can then be cancelled to free a chair. */
async function shopBooks(minutes: number, barberId = shop.barbers.abdullah, customerId = shop.customer.id) {
  session = staffSession(shop.owner.id);
  const res = await bookAsStaff(
    jsonRequest("/api/appointments", {
      customerId,
      barberId,
      startAt: at(DAY(), minutes).toISOString(),
      serviceIds: [shop.services.haircut],
      source: "PHONE",
    })
  );
  const appointment = await res.json();
  session = customerSession(login.id, login.customerId);
  return appointment;
}

const shopCancels = async (id: string) => {
  session = staffSession(shop.owner.id);
  const res = await changeAppointment(jsonRequest(`/api/appointments/${id}`, { status: "CANCELLED" }, "PATCH"), {
    params: { id },
  });
  session = customerSession(login.id, login.customerId);
  return res;
};

/** The offer's notification is sent without waiting; give it a moment to land. */
const settle = () => new Promise((resolve) => setTimeout(resolve, 80));

/** A second customer, with their own login. */
async function anotherCustomer(name: string, phone: string) {
  const customer = await testPrisma().customer.create({ data: { name, phone } });
  const their = await seedCustomerLogin(customer.id, phone);
  return { customerId: customer.id, userId: their.id };
}

describe("joining the list", () => {
  it("puts them on it for a day, with what they want done", async () => {
    const res = await join();
    expect(res.status).toBe(201);

    const entry = await testPrisma().waitlistEntry.findFirstOrThrow({ include: { services: true } });
    expect(entry.dateISO).toBe(DAY());
    expect(entry.status).toBe("WAITING");
    expect(entry.services).toHaveLength(1);
  });

  it("refuses a day that has already gone", async () => {
    expect((await join({ dateISO: dayAhead(-3) })).status).toBe(400);
  });

  it("refuses to put them on twice for the same day", async () => {
    await join();
    expect((await join()).status).toBe(409);
    expect(await testPrisma().waitlistEntry.count()).toBe(1);
  });

  it("holds them to three days at a time", async () => {
    for (const days of [1, 2, 3]) {
      expect((await join({ dateISO: dayAhead(days) })).status).toBe(201);
    }
    expect((await join({ dateISO: dayAhead(4) })).status).toBe(409);
  });

  it("refuses something the shop does not let customers book", async () => {
    expect((await join({ serviceIds: [shop.services.protein] })).status).toBe(400);
  });

  it("lets them come off again", async () => {
    await join();
    const { id } = await testPrisma().waitlistEntry.findFirstOrThrow();

    expect((await leaveList(getRequest(`/api/customer/waitlist?id=${id}`))).status).toBe(200);
    expect((await testPrisma().waitlistEntry.findFirstOrThrow()).status).toBe("CLOSED");
  });

  it("is nobody else's list to join", async () => {
    session = null;
    expect((await join()).status).toBe(401);
  });
});

describe("when a chair comes free", () => {
  it("offers it to the customer waiting, and tells their phone", async () => {
    await testPrisma().pushSubscription.create({
      data: { endpoint: "https://push.example/waiting", p256dh: "k", auth: "a", customerId: shop.customer.id },
    });

    const other = await anotherCustomer("Someone Else", "01230001111");
    const booking = await shopBooks(15 * 60, shop.barbers.abdullah, other.customerId);
    await join();
    sent.length = 0;

    await shopCancels(booking.id);

    const entry = await testPrisma().waitlistEntry.findFirstOrThrow();
    expect(entry.status).toBe("OFFERED");
    expect(entry.offeredStartAt?.toISOString()).toBe(at(DAY(), 15 * 60).toISOString());

    await settle();
    expect(JSON.parse(sent[0].payload).title).toBe("A time has opened");
  });

  it("offers it to whoever has waited longest", async () => {
    const other = await anotherCustomer("Second In Line", "01230002222");
    const booking = await shopBooks(15 * 60, shop.barbers.abdullah, (await anotherCustomer("Booked", "01230003333")).customerId);

    // Our customer joins first; the other one joins a moment later.
    await join();
    session = customerSession(other.userId, other.customerId);
    await join();
    session = customerSession(login.id, login.customerId);

    await shopCancels(booking.id);

    const offered = await testPrisma().waitlistEntry.findFirstOrThrow({ where: { status: "OFFERED" } });
    expect(offered.customerId).toBe(shop.customer.id);
    // And only one offer went out.
    expect(await testPrisma().waitlistEntry.count({ where: { status: "OFFERED" } })).toBe(1);
  });

  it("skips somebody who asked for a different barber", async () => {
    const booking = await shopBooks(15 * 60, shop.barbers.abdullah, (await anotherCustomer("Booked", "01230004444")).customerId);
    await join({ barberId: shop.barbers.khaled });

    await shopCancels(booking.id);
    expect(await testPrisma().waitlistEntry.count({ where: { status: "OFFERED" } })).toBe(0);
  });

  it("says nothing to anybody waiting on a different day", async () => {
    const booking = await shopBooks(15 * 60, shop.barbers.abdullah, (await anotherCustomer("Booked", "01230005555")).customerId);
    await join({ dateISO: dayAhead(5) });

    await shopCancels(booking.id);
    expect(await testPrisma().waitlistEntry.count({ where: { status: "OFFERED" } })).toBe(0);
  });

  it("works when the customer cancels their own booking too", async () => {
    const other = await anotherCustomer("Waiting", "01230006666");
    const booking = await shopBooks(16 * 60, shop.barbers.abdullah, shop.customer.id);

    session = customerSession(other.userId, other.customerId);
    await join();

    session = customerSession(login.id, login.customerId);
    await customerCancels(getRequest(`/api/customer/appointments/${booking.id}`), { params: { id: booking.id } });

    const entry = await testPrisma().waitlistEntry.findFirstOrThrow();
    expect(entry.status).toBe("OFFERED");
    expect(entry.customerId).toBe(other.customerId);
  });
});

describe("taking the offer", () => {
  async function offerTo(wants: { barberId?: string } = {}) {
    const booking = await shopBooks(15 * 60, shop.barbers.abdullah, (await anotherCustomer("Booked", "01230007777")).customerId);
    await join(wants);
    await shopCancels(booking.id);
    return testPrisma().waitlistEntry.findFirstOrThrow();
  }

  it("turns the offer into a real booking, and closes the entry", async () => {
    const entry = await offerTo();

    const res = await claimOffer(jsonRequest(`/api/customer/waitlist/${entry.id}/claim`, {}), { params: { id: entry.id } });
    expect(res.status).toBe(201);

    const booked = await res.json();
    expect(new Date(booked.startAt).toISOString()).toBe(at(DAY(), 15 * 60).toISOString());

    const after = await testPrisma().waitlistEntry.findUniqueOrThrow({ where: { id: entry.id } });
    expect(after.status).toBe("TAKEN");
    expect(after.appointmentId).toBe(booked.id);
  });

  it("refuses once the offer has lapsed", async () => {
    const entry = await offerTo();
    await testPrisma().waitlistEntry.update({
      where: { id: entry.id },
      data: { offerExpiresAt: new Date(Date.now() - 60_000) },
    });

    const res = await claimOffer(jsonRequest("/x", {}), { params: { id: entry.id } });
    expect(res.status).toBe(409);
    expect(await testPrisma().appointment.count({ where: { status: "CONFIRMED" } })).toBe(0);
  });

  it("refuses if somebody else took that barber's slot first", async () => {
    // They asked for Abdullah by name, so Khaled's free chair is no substitute.
    const entry = await offerTo({ barberId: shop.barbers.abdullah });
    await shopBooks(15 * 60, shop.barbers.abdullah, (await anotherCustomer("Quicker", "01230008888")).customerId);

    const res = await claimOffer(jsonRequest("/x", {}), { params: { id: entry.id } });
    expect(res.status).toBe(409);
  });

  it("takes another barber's chair when they asked for anybody", async () => {
    const entry = await offerTo();
    // Abdullah's slot goes again, but Khaled is free at that time.
    await shopBooks(15 * 60, shop.barbers.abdullah, (await anotherCustomer("Quicker", "01230008888")).customerId);

    const res = await claimOffer(jsonRequest("/x", {}), { params: { id: entry.id } });
    expect(res.status).toBe(201);
    expect((await res.json()).barber.id).toBe(shop.barbers.khaled);
  });

  it("is not another customer's offer to take", async () => {
    const entry = await offerTo();
    const other = await anotherCustomer("Opportunist", "01230009999");
    session = customerSession(other.userId, other.customerId);

    expect((await claimOffer(jsonRequest("/x", {}), { params: { id: entry.id } })).status).toBe(404);
  });
});

describe("what the customer sees", () => {
  it("lists where they are waiting, and any offer standing", async () => {
    const booking = await shopBooks(15 * 60, shop.barbers.abdullah, (await anotherCustomer("Booked", "01230001234")).customerId);
    await join();
    await shopCancels(booking.id);

    const list = await (await myList()).json();
    expect(list).toHaveLength(1);
    expect(list[0].dateISO).toBe(DAY());
    expect(list[0].offer).not.toBeNull();
  });

  it("closes off a day that has been and gone", async () => {
    await testPrisma().waitlistEntry.create({
      data: { customerId: shop.customer.id, dateISO: dayAhead(-2), services: { create: [{ serviceId: shop.services.haircut }] } },
    });

    expect(await (await myList()).json()).toHaveLength(0);
    expect((await testPrisma().waitlistEntry.findFirstOrThrow()).status).toBe("CLOSED");
  });
});
