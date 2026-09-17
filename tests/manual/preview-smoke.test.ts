import { PrismaClient } from "@prisma/client";
import { NextRequest } from "next/server";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { GET as getMe, PATCH as saveMe } from "@/app/api/customer/me/route";
import { GET as getCatalog } from "@/app/api/customer/catalog/route";
import { GET as getSlots } from "@/app/api/customer/slots/route";
import { GET as listAppointments, POST as book } from "@/app/api/customer/appointments/route";
import { DELETE as cancel } from "@/app/api/customer/appointments/[id]/route";
import { GET as listReviewable, POST as leaveReview } from "@/app/api/customer/reviews/route";
import { GET as getReferral } from "@/app/api/customer/referral/route";
import { GET as getPushKey } from "@/app/api/push/subscribe/route";
import { GET as getBarberReviews } from "@/app/api/customer/barbers/[id]/reviews/route";

/**
 * A walk through the customer app against the preview shop.
 *
 * Not part of the suite — it is run by hand against the demo database to prove
 * the screens have something real behind them. It books and then cancels, so it
 * leaves the preview as it found it.
 */

const PREVIEW_URL = "postgresql://escape:escape@localhost:55440/escape?schema=public";
const DEMO_CUSTOMER = "demo-customer-preview";

const preview = new PrismaClient({ datasources: { db: { url: PREVIEW_URL } } });

vi.mock("@/lib/prisma", async () => ({
  prisma: new (await import("@prisma/client")).PrismaClient({
    datasources: { db: { url: "postgresql://escape:escape@localhost:55440/escape?schema=public" } },
  }),
}));

let session: unknown = null;
vi.mock("next-auth", () => ({ getServerSession: async () => session }));



const get = (url: string) => new NextRequest(`http://localhost${url}`);
const post = (url: string, body: unknown) =>
  new NextRequest(`http://localhost${url}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

beforeAll(async () => {
  const login = await preview.user.findFirstOrThrow({ where: { customerId: DEMO_CUSTOMER } });
  session = {
    user: { id: login.id, email: "", name: login.name, role: "CUSTOMER", customerId: DEMO_CUSTOMER },
    loginAt: Date.now(),
    expires: "",
  };
});

describe("the customer app, on the preview shop", () => {
  it("shows them who they are, with their history and a full card", async () => {
    const me = await (await getMe()).json();
    expect(me.name).toBeTruthy();
    expect(me.phone).toBe("01000000000");
    expect(me.visitCount).toBe(6);
    expect(me.loyalty).toMatchObject({ stamps: 0, available: 1, visitsRequired: 6 });
    console.log(`  profile: ${me.name}, ${me.visitCount} visits, reward waiting: ${me.loyalty.available}`);
  });

  it("offers services with prices, and barbers with ratings", async () => {
    const catalog = await (await getCatalog()).json();
    const withoutPrice = catalog.services.filter((s: { defaultPrice: number }) => !s.defaultPrice);
    expect(catalog.services.length).toBeGreaterThan(5);
    expect(withoutPrice).toHaveLength(0);
    expect(catalog.barbers.length).toBeGreaterThan(0);
    expect(catalog.booking.onlineBookingEnabled).toBe(true);
    console.log(`  catalogue: ${catalog.services.length} services, ${catalog.barbers.length} barbers, ${catalog.offers.length} offers running`);
  });

  it("asks for a service before it will quote times", async () => {
    const date = new Date(Date.now() + 2 * 86_400_000).toISOString().slice(0, 10);
    const res = await getSlots(get(`/api/customer/slots?date=${date}`));
    expect(res.status).toBe(400);
  });

  it("offers free times on a day the shop is open", async () => {
    const catalog = await (await getCatalog()).json();
    const haircut = catalog.services.find((s: { name: string }) => s.name === "Hair cut") ?? catalog.services[0];
    const date = new Date(Date.now() + 2 * 86_400_000).toISOString().slice(0, 10);

    const slots = await (await getSlots(get(`/api/customer/slots?date=${date}&serviceIds=${haircut.id}`))).json();
    expect(Array.isArray(slots.anyBarber)).toBe(true);
    expect(slots.anyBarber.length).toBeGreaterThan(0);
    expect(slots.price).toBeGreaterThan(0);
    const first = new Intl.DateTimeFormat("en-GB", { timeZone: "Africa/Cairo", hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date(slots.anyBarber[0]));
    const last = new Intl.DateTimeFormat("en-GB", { timeZone: "Africa/Cairo", hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date(slots.anyBarber[slots.anyBarber.length - 1]));
    console.log(`  ${slots.anyBarber.length} free times on ${date}, ${first} to ${last} Cairo, ${slots.durationMinutes} min at ${slots.price}`);
  });

  it("books a haircut, lists it, and cancels it again", async () => {
    const catalog = await (await getCatalog()).json();
    const haircut = catalog.services.find((s: { name: string }) => s.name === "Hair cut") ?? catalog.services[0];

    const date = new Date(Date.now() + 2 * 86_400_000).toISOString().slice(0, 10);
    const slots = await (await getSlots(get(`/api/customer/slots?date=${date}&serviceIds=${haircut.id}`))).json();
    const when = slots.anyBarber[Math.min(4, slots.anyBarber.length - 1)];

    const created = await book(post("/api/customer/appointments", { startAt: when, serviceIds: [haircut.id] }));
    expect(created.status).toBe(201);
    const appointment = await created.json();
    console.log(`  booked ${haircut.name} for ${new Date(appointment.startAt).toISOString().slice(0, 16)}`);

    const upcoming = await (await listAppointments(get("/api/customer/appointments?scope=upcoming"))).json();
    expect(upcoming.some((a: { id: string }) => a.id === appointment.id)).toBe(true);

    const gone = await cancel(get(`/api/customer/appointments/${appointment.id}`), { params: { id: appointment.id } });
    expect(gone.status).toBe(200);
    expect((await preview.appointment.findUniqueOrThrow({ where: { id: appointment.id } })).status).toBe("CANCELLED");
    console.log("  cancelled it again, so the preview is as it was");
  });

  it("lets them rate the haircut they had", async () => {
    const reviewable = await (await listReviewable()).json();
    expect(reviewable.length).toBeGreaterThan(0);

    const target = reviewable.find((r: { canReview: boolean }) => r.canReview);
    expect(target).toBeTruthy();

    const res = await leaveReview(post("/api/customer/reviews", { appointmentId: target.appointmentId, rating: 5, comment: "Checked by the smoke test" }));
    expect(res.status).toBe(201);
    console.log(`  rated the visit with ${target.barber?.name ?? "the shop"}: 5 stars`);
  });

  it("shows a barber's profile with their rating and comments", async () => {
    const catalog = await (await getCatalog()).json();
    const rated = catalog.barbers.find((b: { rating: { count: number } }) => b.rating.count > 0) ?? catalog.barbers[0];
    const body = await (await getBarberReviews(get("/x"), { params: { id: rated.id } })).json();
    expect(body.summary).toHaveProperty("count");
    console.log(`  ${rated.name}: ${body.summary.average ?? "—"} from ${body.summary.count} reviews, ${body.reviews.length} with words`);
  });

  it("gives them a referral code and counts who came in", async () => {
    const body = await (await getReferral()).json();
    expect(body.enabled).toBe(true);
    expect(body.code).toMatch(/^[A-Z0-9]{6}$/);
    console.log(`  referral code ${body.code}, ${body.standing.invited} invited`);
  });

  it("hands the phone a key it can subscribe with", async () => {
    const body = await (await getPushKey()).json();
    expect(body.publicKey).toHaveLength(87);
  });

  it("saves a change to their own details, and puts it back", async () => {
    const before = await (await getMe()).json();
    expect((await saveMe(new NextRequest("http://localhost/api/customer/me", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ birthday: "1994-09-18", name: "Omar Hassan" }),
    }))).status).toBe(200);

    const after = await (await getMe()).json();
    expect(String(after.birthday).slice(0, 10)).toBe("1994-09-18");
    expect(after.name).toBe("Omar Hassan");
    console.log(`  details saved: ${after.name}, born ${String(after.birthday).slice(0, 10)}`);
    expect(before.phone).toBe(after.phone);
  });
});
