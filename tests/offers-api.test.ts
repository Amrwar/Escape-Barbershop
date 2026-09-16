import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { resetDatabase, startTestDatabase, testPrisma } from "./db";
import { customerSession, getRequest, jsonRequest, seedShop, staffSession, type Shop } from "./fixtures";
import { GET as listOffers, POST as createOffer } from "@/app/api/offers/route";
import { PATCH as updateOffer, DELETE as removeOffer } from "@/app/api/offers/[id]/route";
import { GET as getCatalog } from "@/app/api/customer/catalog/route";

/**
 * Offers. The shop writes them; customers see only the ones running today; and
 * nothing here ever touches a price — the till remains the record of what was
 * actually charged.
 */

vi.mock("@/lib/prisma", async () => ({ prisma: (await import("./db")).testPrisma() }));

let session: unknown = null;
vi.mock("next-auth", () => ({ getServerSession: async () => session }));

let shop: Shop;
const day = 86_400_000;

beforeAll(() => startTestDatabase());

beforeEach(async () => {
  await resetDatabase();
  shop = await seedShop();
  session = staffSession(shop.owner.id);
});

const add = (body: Record<string, unknown>) => createOffer(jsonRequest("/api/offers", body));
const customerOffers = async () => (await (await getCatalog()).json()).offers;

describe("writing an offer", () => {
  it("saves it with both prices and shows it to customers", async () => {
    const res = await add({ title: "Haircut + beard", titleAr: "قص شعر ولحية", price: 400, wasPrice: 450 });
    expect(res.status).toBe(201);

    const offers = await customerOffers();
    expect(offers).toHaveLength(1);
    expect(offers[0].title).toBe("Haircut + beard");
    expect(offers[0].price).toBe(400);
    expect(offers[0].wasPrice).toBe(450);
  });

  it("refuses one with no name", async () => {
    expect((await add({ title: "" })).status).toBe(400);
  });

  it("is written by the owner alone", async () => {
    session = staffSession(shop.cashier.id, "CASHIER");
    expect((await add({ title: "Cashier's offer" })).status).toBe(401);
    session = customerSession("c1", shop.customer.id);
    expect((await add({ title: "Customer's offer" })).status).toBe(401);
    expect(await testPrisma().offer.count()).toBe(0);
  });
});

describe("when a customer sees one", () => {
  it("not before it starts, and not after it ends", async () => {
    await add({ title: "Next week", startsAt: new Date(Date.now() + day).toISOString() });
    await add({ title: "Last week", endsAt: new Date(Date.now() - day).toISOString() });
    await add({ title: "Running now", startsAt: new Date(Date.now() - day).toISOString(), endsAt: new Date(Date.now() + day).toISOString() });

    const offers = await customerOffers();
    expect(offers.map((o: { title: string }) => o.title)).toEqual(["Running now"]);
  });

  it("not once the shop switches it off", async () => {
    const created = await (await add({ title: "Ramadan offer" })).json();
    expect(await customerOffers()).toHaveLength(1);

    await updateOffer(jsonRequest(`/api/offers/${created.id}`, { isActive: false }, "PATCH"), { params: { id: created.id } });
    expect(await customerOffers()).toHaveLength(0);
  });

  it("without signing in, since it is what hangs on the wall", async () => {
    await add({ title: "Open to all" });
    session = null;
    const res = await getCatalog();
    expect(res.status).toBe(200);
    expect((await res.json()).offers).toHaveLength(1);
  });
});

describe("the shop's own list", () => {
  it("shows everything, running or not", async () => {
    await add({ title: "Running" });
    const off = await (await add({ title: "Switched off" })).json();
    await updateOffer(jsonRequest(`/api/offers/${off.id}`, { isActive: false }, "PATCH"), { params: { id: off.id } });

    const all = await (await listOffers(getRequest("/api/offers"))).json();
    expect(all).toHaveLength(2);
  });

  it("lets the owner change and remove one, and records both", async () => {
    const created = await (await add({ title: "Typo offre", price: 300 })).json();

    const updated = await updateOffer(jsonRequest(`/api/offers/${created.id}`, { title: "Proper offer", price: 350 }, "PATCH"), {
      params: { id: created.id },
    });
    expect((await updated.json()).title).toBe("Proper offer");

    const removed = await removeOffer(getRequest(`/api/offers/${created.id}`), { params: { id: created.id } });
    expect(removed.status).toBe(200);
    expect(await testPrisma().offer.count()).toBe(0);

    const trail = await testPrisma().auditLog.findMany({ where: { entity: "OFFER" }, orderBy: { at: "asc" } });
    expect(trail.map((l) => l.action)).toEqual(["CREATE", "UPDATE", "DELETE"]);
  });

  it("refuses to change an offer that is not there", async () => {
    const res = await updateOffer(jsonRequest("/api/offers/nope", { title: "Ghost" }, "PATCH"), { params: { id: "nope" } });
    expect(res.status).toBe(404);
  });
});

describe("an offer changes no money", () => {
  it("leaves service prices exactly as they were", async () => {
    const before = await testPrisma().service.findUnique({ where: { id: shop.services.haircut } });
    await add({ title: "Half price haircuts", price: 75, wasPrice: 150 });
    const after = await testPrisma().service.findUnique({ where: { id: shop.services.haircut } });
    expect(after?.defaultPrice).toBe(before?.defaultPrice);
  });
});
