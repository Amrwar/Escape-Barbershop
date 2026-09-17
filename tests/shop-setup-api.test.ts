import bcrypt from "bcryptjs";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { resetDatabase, startTestDatabase, testPrisma } from "./db";
import { customerSession, getRequest, jsonRequest, seedCustomerLogin, seedShop, staffSession, type Shop } from "./fixtures";
import { GET as listServices, POST as addService } from "@/app/api/services/route";
import { PATCH as editService, DELETE as removeService } from "@/app/api/services/[id]/route";
import { GET as listCustomers, POST as addCustomer } from "@/app/api/customers/route";
import { GET as getCustomer, PATCH as editCustomer } from "@/app/api/customers/[id]/route";
import { POST as checkDiscountPin, PATCH as setDiscountPin } from "@/app/api/settings/discount-pin/route";
import { POST as checkEditPin, PATCH as setEditPin } from "@/app/api/settings/edit-pin/route";
import { GET as myAccount, PATCH as saveAccount } from "@/app/api/account/route";

/**
 * The shop's own setup: the price list, the customer book, the PINs that stand
 * in front of a discount or an edit, and a staff member's own account.
 *
 * Prices and durations decide what the app quotes and how many slots a day
 * holds, so who may change them matters as much as the change itself.
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
});

describe("the price list", () => {
  it("lets the owner add a service, with its price and how long it takes", async () => {
    const res = await addService(
      jsonRequest("/api/services", { name: "Hot towel shave", defaultPrice: 220, durationMinutes: 25 })
    );
    expect(res.status).toBe(201);

    const service = await testPrisma().service.findFirstOrThrow({ where: { name: "Hot towel shave" } });
    expect(service.defaultPrice).toBe(220);
    expect(service.durationMinutes).toBe(25);
  });

  it("refuses a service with no name", async () => {
    expect((await addService(jsonRequest("/api/services", { name: "", defaultPrice: 100 }))).status).toBe(400);
  });

  it("is read by anyone on the staff, and changed by the owner alone", async () => {
    session = staffSession(shop.cashier.id, "CASHIER");
    expect((await listServices()).status).toBe(200);
    expect((await addService(jsonRequest("/api/services", { name: "Sneaky", defaultPrice: 1 }))).status).toBe(401);
  });

  it("changes a price without touching what was already charged", async () => {
    await testPrisma().visit.create({
      data: {
        customerId: shop.customer.id,
        barberId: shop.barbers.abdullah,
        total: 150,
        paymentMethod: "CASH",
        cashAmount: 150,
        items: { create: [{ serviceId: shop.services.haircut, quantity: 1, priceAtTime: 150 }] },
      },
    });

    await editService(jsonRequest(`/api/services/${shop.services.haircut}`, { defaultPrice: 300 }, "PATCH"), {
      params: { id: shop.services.haircut },
    });

    expect((await testPrisma().service.findUniqueOrThrow({ where: { id: shop.services.haircut } })).defaultPrice).toBe(300);
    // The old visit still says what was actually taken.
    expect((await testPrisma().visitItem.findFirstOrThrow()).priceAtTime).toBe(150);
  });

  it("keeps a service that has been sold, rather than losing the history with it", async () => {
    await testPrisma().visit.create({
      data: {
        customerId: shop.customer.id,
        total: 150,
        paymentMethod: "CASH",
        cashAmount: 150,
        items: { create: [{ serviceId: shop.services.haircut, quantity: 1, priceAtTime: 150 }] },
      },
    });

    await removeService(getRequest(`/api/services/${shop.services.haircut}`), { params: { id: shop.services.haircut } });

    // Either refused outright or retired quietly — never deleted from under the
    // visits that point at it.
    const service = await testPrisma().service.findUnique({ where: { id: shop.services.haircut } });
    expect(service).not.toBeNull();
  });
});

describe("the customer book", () => {
  it("adds somebody with a name and a number", async () => {
    const res = await addCustomer(jsonRequest("/api/customers", { name: "Tarek Fouad", phone: "01288889999" }));
    expect(res.status).toBe(201);
    expect((await res.json()).name).toBe("Tarek Fouad");
  });

  it("calls a nameless one a walk-in rather than refusing the sale", async () => {
    const res = await addCustomer(jsonRequest("/api/customers", { name: "" }));
    expect(res.status).toBe(201);
    expect((await res.json()).name).toBe("Walk-in");
  });

  it("finds somebody by name or by number", async () => {
    await addCustomer(jsonRequest("/api/customers", { name: "Tarek Fouad", phone: "01288889999" }));

    const byName = await (await listCustomers(getRequest("/api/customers?search=Tarek"))).json();
    const byPhone = await (await listCustomers(getRequest("/api/customers?search=8888"))).json();
    expect(byName.length).toBeGreaterThan(0);
    expect(byPhone.length).toBeGreaterThan(0);
  });

  it("keeps the customer book away from customers", async () => {
    const login = await seedCustomerLogin(shop.customer.id);
    session = customerSession(login.id, login.customerId);

    expect((await listCustomers(getRequest("/api/customers?search=a"))).status).toBe(401);
    expect((await getCustomer(getRequest(`/api/customers/${shop.customer.id}`), { params: { id: shop.customer.id } })).status).toBe(401);
  });

  it("takes a birthday from the shop's side too", async () => {
    await editCustomer(jsonRequest(`/api/customers/${shop.customer.id}`, { birthday: "1990-04-11" }, "PATCH"), {
      params: { id: shop.customer.id },
    });

    const saved = await testPrisma().customer.findUniqueOrThrow({ where: { id: shop.customer.id } });
    expect(saved.birthday?.toISOString().slice(0, 10)).toBe("1990-04-11");
  });
});

describe("the PINs in front of a discount and an edit", () => {
  it("says no to any PIN while none has been set", async () => {
    expect((await (await checkDiscountPin(jsonRequest("/api/settings/discount-pin", { pin: "1234" }))).json()).valid).toBe(false);
  });

  it("accepts the PIN the owner set, and nothing else", async () => {
    await setDiscountPin(jsonRequest("/api/settings/discount-pin", { pin: "4821" }, "PATCH"));

    expect((await (await checkDiscountPin(jsonRequest("/x", { pin: "4821" }))).json()).valid).toBe(true);
    expect((await (await checkDiscountPin(jsonRequest("/x", { pin: "0000" }))).json()).valid).toBe(false);
  });

  it("refuses a PIN too short to be worth having", async () => {
    expect((await setDiscountPin(jsonRequest("/x", { pin: "12" }, "PATCH"))).status).toBe(400);
  });

  it("needs the current PIN before it will change one", async () => {
    await setDiscountPin(jsonRequest("/x", { pin: "4821" }, "PATCH"));

    expect((await setDiscountPin(jsonRequest("/x", { pin: "9999" }, "PATCH"))).status).toBe(403);
    expect((await setDiscountPin(jsonRequest("/x", { pin: "9999", currentPin: "4821" }, "PATCH"))).status).toBe(200);
    expect((await (await checkDiscountPin(jsonRequest("/x", { pin: "9999" }))).json()).valid).toBe(true);
  });

  it("is the owner's to set, not the cashier's", async () => {
    session = staffSession(shop.cashier.id, "CASHIER");
    expect((await setDiscountPin(jsonRequest("/x", { pin: "4821" }, "PATCH"))).status).toBe(401);
    expect((await setEditPin(jsonRequest("/x", { pin: "4821" }, "PATCH"))).status).toBe(401);
  });

  it("keeps the edit PIN and the discount PIN apart", async () => {
    await setDiscountPin(jsonRequest("/x", { pin: "1111" }, "PATCH"));
    await setEditPin(jsonRequest("/x", { pin: "2222" }, "PATCH"));

    expect((await (await checkEditPin(jsonRequest("/x", { pin: "2222" }))).json()).valid).toBe(true);
    expect((await (await checkEditPin(jsonRequest("/x", { pin: "1111" }))).json()).valid).toBe(false);
  });
});

describe("a staff member's own account", () => {
  it("reads back who they are", async () => {
    const me = await (await myAccount()).json();
    expect(me.email).toBe(shop.owner.email);
  });

  it("changes their password only with the current one", async () => {
    const wrong = await saveAccount(
      jsonRequest("/api/account", { currentPassword: "not-it", newPassword: "a-new-one" }, "PATCH")
    );
    expect(wrong.status).toBe(403); // refused, not malformed

    const right = await saveAccount(
      jsonRequest("/api/account", { currentPassword: "test-password", newPassword: "a-new-one" }, "PATCH")
    );
    expect(right.status).toBe(200);

    const user = await testPrisma().user.findUniqueOrThrow({ where: { id: shop.owner.id } });
    expect(await bcrypt.compare("a-new-one", user.password)).toBe(true);
  });

  it("belongs to the person signed in, and to nobody who is not", async () => {
    session = null;
    expect((await myAccount()).status).toBe(401);
  });
});
