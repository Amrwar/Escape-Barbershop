import bcrypt from "bcryptjs";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { resetDatabase, startTestDatabase, testPrisma } from "./db";
import { getRequest, jsonRequest, seedShop, staffSession, type Shop } from "./fixtures";
import { GET as listReports, POST as fileReport, PATCH as markSeen } from "@/app/api/reports/cuts/route";

/**
 * Reports from the floor: what happened during a cut, written by whoever was
 * standing there.
 *
 * The two things that matter are who may write one — a barber only about their
 * own chair — and who may read the shop's, which is the owner alone: a
 * complaint about one barber is not another barber's business.
 */

vi.mock("@/lib/prisma", async () => ({ prisma: (await import("./db")).testPrisma() }));

let session: unknown = null;
vi.mock("next-auth", () => ({ getServerSession: async () => session }));

let shop: Shop;
let abdullah: { id: string; barberId: string };
let khaled: { id: string; barberId: string };

const barberSession = (userId: string, barberId: string, name = "Abdullah") => ({
  user: { id: userId, email: "", name, role: "BARBER", barberId },
  loginAt: Date.now(),
  expires: "",
});

beforeAll(() => startTestDatabase());

beforeEach(async () => {
  await resetDatabase();
  shop = await seedShop();

  const password = await bcrypt.hash("x", 4);
  const [a, k] = await Promise.all([
    testPrisma().user.create({
      data: { name: "Abdullah", email: "abdullah@escape.test", password, role: "BARBER", barberId: shop.barbers.abdullah },
    }),
    testPrisma().user.create({
      data: { name: "Khaled", email: "khaled@escape.test", password, role: "BARBER", barberId: shop.barbers.khaled },
    }),
  ]);
  abdullah = { id: a.id, barberId: shop.barbers.abdullah };
  khaled = { id: k.id, barberId: shop.barbers.khaled };

  session = barberSession(abdullah.id, abdullah.barberId);
});

/** A cut that has already happened, with a barber attached. */
async function cut(barberId: string = shop.barbers.abdullah) {
  const start = new Date(Date.now() - 2 * 3_600_000);
  return testPrisma().appointment.create({
    data: {
      customerId: shop.customer.id,
      barberId,
      startAt: start,
      endAt: new Date(start.getTime() + 30 * 60_000),
      durationMinutes: 30,
      totalPrice: 150,
      status: "COMPLETED",
      services: {
        create: [{ serviceId: shop.services.haircut, serviceName: "Hair cut", price: 150, durationMinutes: 30 }],
      },
    },
  });
}

const file = (appointmentId: string, body: string, kind = "NOTE") =>
  fileReport(jsonRequest("/api/reports/cuts", { appointmentId, kind, body }));

/** A walk-in, rung up at the till — which is how nearly every cut arrives. */
async function walkIn(barberId: string = shop.barbers.abdullah) {
  return testPrisma().visit.create({
    data: {
      customerId: shop.customer.id,
      barberId,
      total: 150,
      items: { create: [{ serviceId: shop.services.haircut, priceAtTime: 150, quantity: 1 }] },
    },
  });
}

const fileOnVisit = (visitId: string, body: string, kind = "NOTE") =>
  fileReport(jsonRequest("/api/reports/cuts", { visitId, kind, body }));

describe("filing a report", () => {
  it("records what happened, who wrote it and which cut", async () => {
    const appointment = await cut();
    const res = await file(appointment.id, "Clippers cut out halfway", "EQUIPMENT");
    expect(res.status).toBe(201);

    const [report] = await testPrisma().cutReport.findMany();
    expect(report.body).toBe("Clippers cut out halfway");
    expect(report.kind).toBe("EQUIPMENT");
    expect(report.authorId).toBe(abdullah.id);
    expect(report.authorName).toBe("Abdullah");
    expect(report.appointmentId).toBe(appointment.id);
    expect(report.seenAt).toBeNull();
  });

  it("refuses a barber reporting on somebody else's chair", async () => {
    const someoneElses = await cut(shop.barbers.khaled);
    const res = await file(someoneElses.id, "I did not like how he did that");

    expect(res.status).toBe(403);
    expect(await testPrisma().cutReport.count()).toBe(0);
  });

  it("lets the shop report on any cut, because whoever was at the till saw it too", async () => {
    session = staffSession(shop.cashier.id, "CASHIER");
    const appointment = await cut(shop.barbers.khaled);

    expect((await file(appointment.id, "Customer left unhappy", "COMPLAINT")).status).toBe(201);
  });

  it("wants something written", async () => {
    const appointment = await cut();
    expect((await file(appointment.id, "   ")).status).toBe(400);
    expect(await testPrisma().cutReport.count()).toBe(0);
  });

  it("falls back to a plain note when the kind is not one of ours", async () => {
    const appointment = await cut();
    expect((await file(appointment.id, "Ran long", "SOMETHING_ELSE")).status).toBe(201);

    const [report] = await testPrisma().cutReport.findMany();
    expect(report.kind).toBe("NOTE");
  });

  it("will not report on a cut that does not exist", async () => {
    expect((await file("no-such-appointment", "Anything")).status).toBe(404);
  });

  it("turns nobody away who is not signed in", async () => {
    session = null;
    const appointment = await cut();
    expect((await file(appointment.id, "Anything")).status).toBe(401);
  });
});

/**
 * Nearly every cut this shop does walks in and is rung up as a visit, never
 * booked. A report that only works on appointments would never be written.
 */
describe("reporting on a walk-in", () => {
  it("hangs off the visit instead of an appointment", async () => {
    const visit = await walkIn();
    expect((await fileOnVisit(visit.id, "Ran forty minutes over")).status).toBe(201);

    const [report] = await testPrisma().cutReport.findMany();
    expect(report.visitId).toBe(visit.id);
    expect(report.appointmentId).toBeNull();
  });

  it("holds a barber to their own chair here too", async () => {
    const someoneElses = await walkIn(shop.barbers.khaled);
    expect((await fileOnVisit(someoneElses.id, "Not my work")).status).toBe(403);
    expect(await testPrisma().cutReport.count()).toBe(0);
  });

  it("lets the cashier report the visit they rang up", async () => {
    session = staffSession(shop.cashier.id, "CASHIER");
    const visit = await walkIn(shop.barbers.khaled);
    expect((await fileOnVisit(visit.id, "Customer disputed the price", "COMPLAINT")).status).toBe(201);
  });

  it("will not report on a visit that does not exist", async () => {
    expect((await fileOnVisit("no-such-visit", "Anything")).status).toBe(404);
  });

  it("wants exactly one cut named, not none and not both", async () => {
    const appointment = await cut();
    const visit = await walkIn();

    expect((await fileReport(jsonRequest("/api/reports/cuts", { body: "Which one?" }))).status).toBe(400);
    expect(
      (await fileReport(jsonRequest("/api/reports/cuts", { appointmentId: appointment.id, visitId: visit.id, body: "Both?" })))
        .status
    ).toBe(400);
    expect(await testPrisma().cutReport.count()).toBe(0);
  });

  it("reaches the owner's screen beside the booked ones", async () => {
    const visit = await walkIn();
    const appointment = await cut();
    await fileOnVisit(visit.id, "Clippers gave out", "EQUIPMENT");
    await file(appointment.id, "Ran long");

    session = staffSession(shop.owner.id);
    const reports = await (await listReports(getRequest("/api/reports/cuts"))).json();

    expect(reports).toHaveLength(2);
    const walked = reports.find((r: { visit: unknown }) => r.visit);
    expect(walked.visit.customer.name).toBe("Ahmed Mohamed");
    expect(walked.visit.barber.name).toBe("Abdullah");
    expect(walked.appointment).toBeNull();
  });
});

describe("reading them", () => {
  beforeEach(async () => {
    const mine = await cut();
    const theirs = await cut(shop.barbers.khaled);

    session = barberSession(abdullah.id, abdullah.barberId);
    await file(mine.id, "Ran forty minutes over");

    session = barberSession(khaled.id, khaled.barberId, "Khaled");
    await file(theirs.id, "Customer wanted a refund", "COMPLAINT");
  });

  it("shows the owner the whole shop's", async () => {
    session = staffSession(shop.owner.id);
    const reports = await (await listReports(getRequest("/api/reports/cuts"))).json();

    expect(reports).toHaveLength(2);
    expect(reports[0].appointment.customer.name).toBe("Ahmed Mohamed");
  });

  it("shows a barber only the ones they wrote", async () => {
    session = barberSession(abdullah.id, abdullah.barberId);
    const reports = await (await listReports(getRequest("/api/reports/cuts?mine=1"))).json();

    expect(reports).toHaveLength(1);
    expect(reports[0].body).toBe("Ran forty minutes over");
  });

  it("does not let a barber read the shop's", async () => {
    session = barberSession(abdullah.id, abdullah.barberId);
    expect((await listReports(getRequest("/api/reports/cuts"))).status).toBe(401);
  });

  it("narrows to the unread ones when asked", async () => {
    session = staffSession(shop.owner.id);
    const all = await (await listReports(getRequest("/api/reports/cuts"))).json();
    await markSeen(jsonRequest(`/api/reports/cuts?id=${all[0].id}`, undefined, "PATCH"));

    const left = await (await listReports(getRequest("/api/reports/cuts?unseen=1"))).json();
    expect(left).toHaveLength(1);
    expect(left[0].id).toBe(all[1].id);
  });
});

describe("marking one read", () => {
  it("is the owner's, and sticks", async () => {
    const appointment = await cut();
    await file(appointment.id, "Ran long");

    session = staffSession(shop.owner.id);
    const [report] = await testPrisma().cutReport.findMany();

    expect((await markSeen(jsonRequest(`/api/reports/cuts?id=${report.id}`, undefined, "PATCH"))).status).toBe(200);
    expect((await testPrisma().cutReport.findUnique({ where: { id: report.id } }))!.seenAt).not.toBeNull();
  });

  it("says so the second time, so two people clearing the list do not argue", async () => {
    const appointment = await cut();
    await file(appointment.id, "Ran long");

    session = staffSession(shop.owner.id);
    const [report] = await testPrisma().cutReport.findMany();
    const patch = () => markSeen(jsonRequest(`/api/reports/cuts?id=${report.id}`, undefined, "PATCH"));

    expect((await patch()).status).toBe(200);
    expect((await patch()).status).toBe(404);
  });

  it("is not the cashier's", async () => {
    const appointment = await cut();
    await file(appointment.id, "Ran long");
    const [report] = await testPrisma().cutReport.findMany();

    session = staffSession(shop.cashier.id, "CASHIER");
    expect((await markSeen(jsonRequest(`/api/reports/cuts?id=${report.id}`, undefined, "PATCH"))).status).toBe(401);
    expect((await testPrisma().cutReport.findUnique({ where: { id: report.id } }))!.seenAt).toBeNull();
  });

  it("wants to know which one", async () => {
    session = staffSession(shop.owner.id);
    expect((await markSeen(jsonRequest("/api/reports/cuts", undefined, "PATCH"))).status).toBe(400);
  });
});
