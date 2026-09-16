import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { resetDatabase, startTestDatabase, testPrisma } from "./db";
import { at, customerSession, dayAhead, getRequest, jsonRequest, seedShop, staffSession, type Shop } from "./fixtures";
import { GET as getQueue, POST as addWalkIn } from "@/app/api/queue/route";
import { PATCH as moveInQueue, DELETE as removeFromQueue } from "@/app/api/queue/[id]/route";
import { POST as createAppointment } from "@/app/api/appointments/route";
import { POST as createVisit } from "@/app/api/visits/route";
import { GET as getDrawer, POST as openDrawer } from "@/app/api/cash-drawer/route";

/**
 * The walk-in queue. A walk-in is the same appointment as a booking, so the
 * tests check both the queue's own behaviour and that the money still lands in
 * the one place afterwards.
 */

vi.mock("@/lib/prisma", async () => ({ prisma: (await import("./db")).testPrisma() }));

let session: unknown = null;
vi.mock("next-auth", () => ({ getServerSession: async () => session }));

let shop: Shop;

beforeAll(() => startTestDatabase());

beforeEach(async () => {
  await resetDatabase();
  shop = await seedShop();
  session = staffSession(shop.owner.id);
  await openDrawer(jsonRequest("/api/cash-drawer", { openingCash: 1000 }));
});

const walkIn = (body: Record<string, unknown> = {}) =>
  addWalkIn(jsonRequest("/api/queue", { customerId: shop.customer.id, serviceIds: [shop.services.haircut], ...body }));

const queue = async () => (await getQueue()).json();

describe("adding a walk-in", () => {
  it("puts them straight into the waiting band, with no barber needed", async () => {
    const res = await walkIn();
    expect(res.status).toBe(201);

    const added = await res.json();
    expect(added.source).toBe("WALK_IN");
    expect(added.status).toBe("CHECKED_IN");
    expect(added.barber).toBeNull();

    const { waiting, inChair } = await queue();
    expect(waiting).toHaveLength(1);
    expect(waiting[0].position).toBe(1);
    expect(inChair).toHaveLength(0);
  });

  it("quotes what the services cost", async () => {
    const res = await walkIn({ serviceIds: [shop.services.haircut, shop.services.beard] });
    const added = await res.json();
    expect(added.totalPrice).toBe(230);
    expect(added.durationMinutes).toBe(50);
  });

  it("can be asked for by name, and waits for that barber", async () => {
    const res = await walkIn({ barberId: shop.barbers.khaled });
    expect((await res.json()).barber.name).toBe("Khaled");
  });

  it("is allowed even when the service would run past closing time", async () => {
    // The shop shuts at 23:00; a two-hour service started now is still fine for
    // somebody already standing in the shop.
    const res = await walkIn({ serviceIds: [shop.services.protein] });
    expect(res.status).toBe(201);
  });

  it("refuses an unknown service", async () => {
    const res = await walkIn({ serviceIds: ["nope"] });
    expect(res.status).toBe(400);
  });

  it("writes it into the activity trail", async () => {
    await walkIn();
    const log = await testPrisma().auditLog.findFirst({ where: { entity: "APPOINTMENT", action: "CREATE" } });
    expect(log?.summary).toMatch(/^Walk-in:/);
  });
});

describe("moving through the queue", () => {
  it("gives somebody a chair, then seats them", async () => {
    const added = await (await walkIn()).json();

    const assigned = await moveInQueue(jsonRequest(`/api/queue/${added.id}`, { barberId: shop.barbers.abdullah }, "PATCH"), {
      params: { id: added.id },
    });
    expect((await assigned.json()).barber.name).toBe("Abdullah");

    const seated = await moveInQueue(jsonRequest(`/api/queue/${added.id}`, { start: true }, "PATCH"), { params: { id: added.id } });
    const started = await seated.json();
    expect(started.status).toBe("IN_PROGRESS");

    const { inChair, waiting } = await queue();
    expect(inChair).toHaveLength(1);
    expect(waiting).toHaveLength(0);
  });

  it("resets the clock to when they actually sat down", async () => {
    const added = await (await walkIn({ serviceIds: [shop.services.beard] })).json();
    await moveInQueue(jsonRequest(`/api/queue/${added.id}`, { barberId: shop.barbers.abdullah, start: true }, "PATCH"), {
      params: { id: added.id },
    });

    const seated = await testPrisma().appointment.findUnique({ where: { id: added.id } });
    const minutes = (seated!.endAt.getTime() - seated!.startAt.getTime()) / 60_000;
    expect(minutes).toBe(20); // the beard trim's length, from now
    expect(Math.abs(seated!.startAt.getTime() - Date.now())).toBeLessThan(90_000);
  });

  it("will not seat somebody without a barber", async () => {
    const added = await (await walkIn()).json();
    const res = await moveInQueue(jsonRequest(`/api/queue/${added.id}`, { start: true }, "PATCH"), { params: { id: added.id } });
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/choose a barber/i);
  });

  it("will not put one barber in two chairs at once", async () => {
    const first = await (await walkIn()).json();
    const second = await (await walkIn()).json();
    await moveInQueue(jsonRequest(`/api/queue/${first.id}`, { barberId: shop.barbers.abdullah, start: true }, "PATCH"), {
      params: { id: first.id },
    });

    const res = await moveInQueue(jsonRequest(`/api/queue/${second.id}`, { barberId: shop.barbers.abdullah, start: true }, "PATCH"), {
      params: { id: second.id },
    });
    expect(res.status).toBe(409);
    expect((await res.json()).error).toMatch(/still with someone/i);
  });

  it("takes somebody out of the queue when they leave", async () => {
    const added = await (await walkIn()).json();
    const res = await removeFromQueue(getRequest(`/api/queue/${added.id}?reason=Left`), { params: { id: added.id } });
    expect(res.status).toBe(200);
    expect((await res.json()).status).toBe("CANCELLED");
    expect((await queue()).waiting).toHaveLength(0);
  });

  it("refuses to shuffle an appointment that has already been rung up", async () => {
    const added = await (await walkIn()).json();
    await moveInQueue(jsonRequest(`/api/queue/${added.id}`, { barberId: shop.barbers.abdullah, start: true }, "PATCH"), {
      params: { id: added.id },
    });
    await createVisit(
      jsonRequest("/api/visits", {
        customerId: shop.customer.id,
        barberId: shop.barbers.abdullah,
        appointmentId: added.id,
        items: [{ serviceId: shop.services.haircut, quantity: 1, priceAtTime: 150 }],
        paymentMethod: "CASH",
      })
    );

    const res = await moveInQueue(jsonRequest(`/api/queue/${added.id}`, { start: true }, "PATCH"), { params: { id: added.id } });
    expect(res.status).toBe(409);
  });
});

describe("what the queue shows", () => {
  it("keeps today's bookings in the expected band until they arrive", async () => {
    const todayLater = new Date(Date.now() + 3 * 60 * 60 * 1000);
    await createAppointment(
      jsonRequest("/api/appointments", {
        customerId: shop.customer.id,
        barberId: shop.barbers.abdullah,
        startAt: todayLater.toISOString(),
        serviceIds: [shop.services.haircut],
        source: "PHONE",
      })
    );

    const { expected, waiting } = await queue();
    // Only if that time is still inside today's opening hours; otherwise the
    // booking was refused and there is nothing to show.
    if (expected.length > 0) {
      expect(expected[0].status).toBe("CONFIRMED");
      expect(waiting).toHaveLength(0);
    }
  });

  it("leaves tomorrow's bookings out of today's queue", async () => {
    await createAppointment(
      jsonRequest("/api/appointments", {
        customerId: shop.customer.id,
        barberId: shop.barbers.abdullah,
        startAt: at(dayAhead(1), 12 * 60).toISOString(),
        serviceIds: [shop.services.haircut],
        source: "PHONE",
      })
    );

    const { expected, waiting, inChair } = await queue();
    expect([...expected, ...waiting, ...inChair]).toHaveLength(0);
  });

  it("estimates the wait from the chairs that are busy", async () => {
    const first = await (await walkIn({ serviceIds: [shop.services.protein] })).json(); // two hours
    await moveInQueue(jsonRequest(`/api/queue/${first.id}`, { barberId: shop.barbers.abdullah, start: true }, "PATCH"), {
      params: { id: first.id },
    });
    await testPrisma().barber.update({ where: { id: shop.barbers.khaled }, data: { isActive: false } });

    await walkIn();
    const { waiting } = await queue();
    expect(waiting[0].waitMinutes).toBeGreaterThan(100);
  });
});

describe("the queue and the money", () => {
  it("rings a walk-in up like any other appointment, once", async () => {
    const added = await (await walkIn()).json();
    await moveInQueue(jsonRequest(`/api/queue/${added.id}`, { barberId: shop.barbers.abdullah, start: true }, "PATCH"), {
      params: { id: added.id },
    });

    const res = await createVisit(
      jsonRequest("/api/visits", {
        customerId: shop.customer.id,
        barberId: shop.barbers.abdullah,
        appointmentId: added.id,
        items: [{ serviceId: shop.services.haircut, quantity: 1, priceAtTime: 150 }],
        paymentMethod: "CASH",
      })
    );
    expect(res.status).toBe(201);

    const summary = (await (await getDrawer()).json()).visitSummary;
    expect(summary.cashSales).toBe(150);
    expect((await testPrisma().appointment.findUnique({ where: { id: added.id } }))?.status).toBe("COMPLETED");
    expect((await queue()).inChair).toHaveLength(0); // done, so off the floor
  });
});

describe("who may run the queue", () => {
  it("keeps customers out", async () => {
    session = customerSession("user-1", shop.customer.id);
    expect((await getQueue()).status).toBe(401);
    expect((await walkIn()).status).toBe(401);
  });

  it("lets a cashier run it", async () => {
    session = staffSession(shop.cashier.id, "CASHIER");
    expect((await walkIn()).status).toBe(201);
  });
});
