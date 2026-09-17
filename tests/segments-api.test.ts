import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { resetDatabase, startTestDatabase, testPrisma } from "./db";
import { customerSession, getRequest, jsonRequest, seedCustomerLogin, seedShop, staffSession, type Shop } from "./fixtures";
import { GET as counts } from "@/app/api/segments/route";
import { GET as members } from "@/app/api/segments/[key]/route";
import { POST as notify } from "@/app/api/segments/[key]/notify/route";

/**
 * Customer groups, and the one dangerous thing you can do with one: write to
 * everybody in it. The guardrails on that are the point of this file.
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

beforeAll(() => startTestDatabase());

beforeEach(async () => {
  await resetDatabase();
  sent.length = 0;
  shop = await seedShop();
  session = staffSession(shop.owner.id);
});

const daysAgo = (days: number) => new Date(Date.now() - days * 86_400_000);

async function visit(customerId: string, days: number, total = 150) {
  return testPrisma().visit.create({
    data: { customerId, barberId: shop.barbers.abdullah, visitAt: daysAgo(days), total, paymentMethod: "CASH", cashAmount: total },
  });
}

async function customerWithApp(name: string) {
  const customer = await testPrisma().customer.create({ data: { name, phone: null } });
  await testPrisma().pushSubscription.create({
    data: { endpoint: `https://push.example/${name}`, p256dh: "key", auth: "auth", customerId: customer.id },
  });
  return customer;
}

const list = (key: string) => members(getRequest(`/api/segments/${key}`), { params: { key } });
const write = (key: string, body: Record<string, unknown>) =>
  notify(jsonRequest(`/api/segments/${key}/notify`, body), { params: { key } });

describe("reading the groups", () => {
  it("counts each one from the visits", async () => {
    await visit(shop.customer.id, 300);
    await visit(shop.customer.id, 250);

    const body = await (await counts()).json();
    expect(body.counts.lapsed).toBe(1);
    expect(body.counts.regulars).toBe(0);
  });

  it("lists who is in one, most recently seen first", async () => {
    const quiet = await testPrisma().customer.create({ data: { name: "Quiet One", phone: "01000000002" } });
    await visit(quiet.id, 200);
    await visit(quiet.id, 90);
    await visit(shop.customer.id, 120);
    await visit(shop.customer.id, 70);

    const body = await (await list("slipping")).json();
    expect(body.total).toBe(2);
    expect(body.members[0].name).toBe("Ahmed Mohamed"); // seen 70 days ago
    expect(body.members[0]).toMatchObject({ visits: 2, spend: 300 });
  });

  it("says who can be written to and who must be rung", async () => {
    const reachable = await customerWithApp("Has App");
    await visit(reachable.id, 300);
    await visit(reachable.id, 250);
    await visit(shop.customer.id, 300);
    await visit(shop.customer.id, 250);

    const body = await (await list("lapsed")).json();
    expect(body.total).toBe(2);
    expect(body.reachable).toBe(1);
    expect(body.members.find((m: { name: string }) => m.name === "Has App").hasApp).toBe(true);
  });

  it("has no such thing as a made-up group", async () => {
    expect((await list("everybody")).status).toBe(404);
  });

  it("is the owner's screen alone", async () => {
    session = staffSession(shop.cashier.id, "CASHIER");
    expect((await counts()).status).toBe(401);
    expect((await list("lapsed")).status).toBe(401);
  });
});

describe("writing to a group", () => {
  beforeEach(async () => {
    const reachable = await customerWithApp("Has App");
    await visit(reachable.id, 300);
    await visit(reachable.id, 250);
  });

  it("reaches only the people in the group who turned notifications on", async () => {
    // A regular with the app, who is not in the lapsed group.
    const regular = await customerWithApp("Regular");
    await visit(regular.id, 20);
    await visit(regular.id, 5);

    const res = await write("lapsed", { title: "We miss you", body: "Come in this week" });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.recipients).toBe(1);
    expect(sent).toHaveLength(1);
    expect(sent[0].endpoint).toBe("https://push.example/Has App");
    expect(JSON.parse(sent[0].payload).title).toBe("We miss you");
  });

  it("refuses an empty message", async () => {
    expect((await write("lapsed", { title: "", body: "" })).status).toBe(400);
    expect(sent).toHaveLength(0);
  });

  it("will not write to the same group twice in a day", async () => {
    expect((await write("lapsed", { title: "First", body: "Hello" })).status).toBe(200);
    const second = await write("lapsed", { title: "Again", body: "Hello again" });
    expect(second.status).toBe(429);
    expect(sent).toHaveLength(1);
  });

  it("still allows a different group on the same day", async () => {
    await write("lapsed", { title: "First", body: "Hello" });
    expect((await write("newcomers", { title: "Welcome", body: "Good to meet you" })).status).toBe(200);
  });

  it("writes every send down, with the words that were sent", async () => {
    await write("lapsed", { title: "We miss you", body: "Come in this week" });
    const entry = await testPrisma().auditLog.findFirstOrThrow({ where: { entityId: "segment:lapsed" } });
    expect(entry.summary).toContain("We miss you");
    expect(entry.details).toContain("Come in this week");
  });

  it("is not the cashier's to send", async () => {
    session = staffSession(shop.cashier.id, "CASHIER");
    expect((await write("lapsed", { title: "Hello", body: "Hello" })).status).toBe(401);
    expect(sent).toHaveLength(0);
  });

  it("is certainly not a customer's to send", async () => {
    const login = await seedCustomerLogin(shop.customer.id);
    session = customerSession(login.id, login.customerId);
    expect((await write("lapsed", { title: "Hello", body: "Hello" })).status).toBe(401);
    expect(sent).toHaveLength(0);
  });
});
