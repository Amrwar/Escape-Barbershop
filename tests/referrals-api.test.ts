import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { resetDatabase, startTestDatabase, testPrisma } from "./db";
import { customerSession, getRequest, jsonRequest, seedCustomerLogin, seedShop, staffSession, type Shop } from "./fixtures";
import { GET as myReferral } from "@/app/api/customer/referral/route";
import { GET as standing, POST as giveReward } from "@/app/api/referrals/[customerId]/route";
import { POST as register } from "@/app/api/customer/register/route";
import { PATCH as saveRewards } from "@/app/api/settings/rewards/route";
import { GET as birthdayList } from "@/app/api/birthdays/route";
import { GET as runNightly } from "@/app/api/cron/reminders/route";

/**
 * Telling a friend, and birthdays. The rules are tested on their own; what
 * matters here is that a referral is only earned by a friend who actually came
 * in, that a reward is given once, and that a greeting goes out once a year.
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

beforeAll(() => startTestDatabase());

beforeEach(async () => {
  await resetDatabase();
  sent.length = 0;
  shop = await seedShop();
  login = await seedCustomerLogin(shop.customer.id);
  session = staffSession(shop.owner.id);
});

const turnOn = (patch: Record<string, unknown>) => saveRewards(jsonRequest("/api/settings/rewards", patch, "PATCH"));

/** The referrer's own code, as the app would fetch it. */
async function codeOf(customerId: string, userId: string) {
  session = customerSession(userId, customerId);
  const body = await (await myReferral()).json();
  session = staffSession(shop.owner.id);
  return body.code as string;
}

async function signUpWithCode(name: string, phone: string, code: string) {
  session = null;
  const res = await register(jsonRequest("/api/customer/register", { name, phone, password: "friend-password", referralCode: code }));
  session = staffSession(shop.owner.id);
  return res;
}

const paidVisit = (customerId: string) =>
  testPrisma().visit.create({
    data: { customerId, barberId: shop.barbers.abdullah, total: 150, paymentMethod: "CASH", cashAmount: 150 },
  });

describe("the code", () => {
  it("is given out the first time the customer asks, and stays the same", async () => {
    await turnOn({ referral: { enabled: true, rewardText: "A free beard trim" } });
    const first = await codeOf(shop.customer.id, login.id);
    const second = await codeOf(shop.customer.id, login.id);
    expect(first).toHaveLength(6);
    expect(second).toBe(first);
  });

  it("is not handed out at all while referrals are off", async () => {
    session = customerSession(login.id, login.customerId);
    const body = await (await myReferral()).json();
    expect(body.enabled).toBe(false);
    expect(body.code).toBeUndefined();
  });
});

describe("bringing a friend in", () => {
  beforeEach(async () => {
    await turnOn({ referral: { enabled: true, rewardText: "A free beard trim" } });
  });

  it("remembers who sent them", async () => {
    const code = await codeOf(shop.customer.id, login.id);
    expect((await signUpWithCode("New Friend", "01055556666", code)).status).toBe(201);

    const referral = await testPrisma().referral.findFirstOrThrow({ include: { referred: true } });
    expect(referral.referrerId).toBe(shop.customer.id);
    expect(referral.referred.name).toBe("New Friend");
  });

  it("forgives how the code was written down", async () => {
    const code = await codeOf(shop.customer.id, login.id);
    const messy = ` ${code.toLowerCase().slice(0, 3)}-${code.toLowerCase().slice(3)} `;
    await signUpWithCode("Careless Typer", "01055557777", messy);
    expect(await testPrisma().referral.count()).toBe(1);
  });

  it("lets somebody sign up with a code nobody has", async () => {
    // The account matters more than the referral.
    expect((await signUpWithCode("No Friend", "01055558888", "ZZZZZZ")).status).toBe(201);
    expect(await testPrisma().referral.count()).toBe(0);
  });

  it("owes nothing until the friend has paid for a haircut", async () => {
    const code = await codeOf(shop.customer.id, login.id);
    await signUpWithCode("New Friend", "01055556666", code);

    const before = await (await standing(getRequest("/x"), { params: { customerId: shop.customer.id } })).json();
    expect(before.standing).toMatchObject({ invited: 1, earned: 0, waiting: 0 });
    expect(before.text).toBeNull();

    const friend = await testPrisma().customer.findFirstOrThrow({ where: { name: "New Friend" } });
    await paidVisit(friend.id);

    const after = await (await standing(getRequest("/x"), { params: { customerId: shop.customer.id } })).json();
    expect(after.standing).toMatchObject({ invited: 1, earned: 1, waiting: 1 });
    expect(after.text).toContain("A free beard trim");
  });
});

describe("giving the referral reward", () => {
  let friendId: string;

  beforeEach(async () => {
    await turnOn({ referral: { enabled: true, rewardText: "A free beard trim" } });
    const code = await codeOf(shop.customer.id, login.id);
    await signUpWithCode("New Friend", "01055556666", code);
    const friend = await testPrisma().customer.findFirstOrThrow({ where: { name: "New Friend" } });
    friendId = friend.id;
    await paidVisit(friendId);
  });

  it("records it against the referral, and stops owing", async () => {
    const res = await giveReward(jsonRequest("/x", {}), { params: { customerId: shop.customer.id } });
    expect(res.status).toBe(201);
    expect((await res.json()).standing.waiting).toBe(0);

    const referral = await testPrisma().referral.findFirstOrThrow();
    expect(referral.rewardGivenAt).toBeTruthy();
    expect(referral.rewardGivenById).toBe(shop.owner.id);
  });

  it("refuses the same referral twice", async () => {
    await giveReward(jsonRequest("/x", {}), { params: { customerId: shop.customer.id } });
    const second = await giveReward(jsonRequest("/x", {}), { params: { customerId: shop.customer.id } });
    expect(second.status).toBe(409);
  });

  it("moves no money", async () => {
    const before = await testPrisma().visit.aggregate({ _sum: { total: true } });
    await giveReward(jsonRequest("/x", {}), { params: { customerId: shop.customer.id } });
    const after = await testPrisma().visit.aggregate({ _sum: { total: true } });
    expect(after._sum.total).toBe(before._sum.total);
  });

  it("is not a customer's to give themselves", async () => {
    session = customerSession(login.id, login.customerId);
    expect((await giveReward(jsonRequest("/x", {}), { params: { customerId: shop.customer.id } })).status).toBe(401);
    expect((await testPrisma().referral.findFirstOrThrow()).rewardGivenAt).toBeNull();
  });

  it("refuses while referrals are switched off", async () => {
    await turnOn({ referral: { enabled: false } });
    expect((await giveReward(jsonRequest("/x", {}), { params: { customerId: shop.customer.id } })).status).toBe(409);
  });
});

describe("birthdays", () => {
  const onDay = (monthDay: string) => new Date(`1991-${monthDay}T12:00:00Z`);

  async function withBirthday(name: string, birthday: Date, withPhone = true) {
    const customer = await testPrisma().customer.create({ data: { name, birthday } });
    if (withPhone) {
      await testPrisma().pushSubscription.create({
        data: { endpoint: `https://push.example/${name}`, p256dh: "key", auth: "auth", customerId: customer.id },
      });
    }
    return customer;
  }

  /** Today and tomorrow, as the shop's calendar has them. */
  const todayMonthDay = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Cairo", month: "2-digit", day: "2-digit" })
    .format(new Date())
    .replace("/", "-");

  it("lists the ones coming up, soonest first", async () => {
    await withBirthday("Today Person", onDay(todayMonthDay()));
    const body = await (await birthdayList(getRequest("/api/birthdays?days=30"))).json();
    expect(body.birthdays[0]).toMatchObject({ name: "Today Person", daysAway: 0 });
  });

  it("wishes them once, and not again the same year", async () => {
    await turnOn({ birthday: { enabled: true, messageText: "A free beard trim this week" } });
    const person = await withBirthday("Today Person", onDay(todayMonthDay()));

    const first = await (await runNightly(getRequest("/api/cron/reminders"))).json();
    expect(first.greeted).toBe(1);
    expect(JSON.parse(sent[0].payload).title).toContain("Happy birthday");
    expect(JSON.parse(sent[0].payload).body).toBe("A free beard trim this week");
    expect((await testPrisma().customer.findUniqueOrThrow({ where: { id: person.id } })).birthdayGreetedAt).toBeTruthy();

    sent.length = 0;
    const second = await (await runNightly(getRequest("/api/cron/reminders"))).json();
    expect(second.greeted).toBe(0);
    expect(sent).toHaveLength(0);
  });

  it("says nothing on anybody else's day", async () => {
    await turnOn({ birthday: { enabled: true } });
    const notToday = new Date(Date.now() + 5 * 86_400_000);
    await withBirthday("Later Person", new Date(`1991-${String(notToday.getUTCMonth() + 1).padStart(2, "0")}-${String(notToday.getUTCDate()).padStart(2, "0")}T12:00:00Z`));

    expect((await (await runNightly(getRequest("/api/cron/reminders"))).json()).greeted).toBe(0);
  });

  it("greets nobody at all while birthdays are switched off", async () => {
    await withBirthday("Today Person", onDay(todayMonthDay()));
    expect((await (await runNightly(getRequest("/api/cron/reminders"))).json()).greeted).toBe(0);
  });

  it("marks a customer with no phone as greeted, so they are not retried nightly", async () => {
    await turnOn({ birthday: { enabled: true } });
    const person = await withBirthday("No Phone", onDay(todayMonthDay()), false);

    const body = await (await runNightly(getRequest("/api/cron/reminders"))).json();
    expect(body.greeted).toBe(1);
    expect((await testPrisma().customer.findUniqueOrThrow({ where: { id: person.id } })).birthdayGreetedAt).toBeTruthy();
  });
});
