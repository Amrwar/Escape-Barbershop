import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { resetDatabase, startTestDatabase, testPrisma } from "./db";
import { customerSession, getRequest, jsonRequest, seedCustomerLogin, seedShop, staffSession, type Shop } from "./fixtures";
import { GET as listProducts, POST as addProduct } from "@/app/api/products/route";
import { POST as addPurchase } from "@/app/api/purchases/route";
import { POST as addTransfer } from "@/app/api/stock/transfers/route";
import { POST as addCount } from "@/app/api/stock/counts/route";
import { GET as balances } from "@/app/api/stock/balances/route";
import { POST as recordUsage } from "@/app/api/inventory/usage/route";

/**
 * The warehouse: what was bought, what moved to the branch, what was used, and
 * what should therefore be on the shelf.
 *
 * Stock is money in another form, so the rules worth testing are the ones that
 * keep the two honest: a purchase raises the balance, a transfer moves it
 * without creating any, nothing can be issued that is not there, and a count
 * says what was actually found rather than quietly rewriting history.
 */

vi.mock("@/lib/prisma", async () => ({ prisma: (await import("./db")).testPrisma() }));

let session: unknown = null;
vi.mock("next-auth", () => ({ getServerSession: async () => session }));

let shop: Shop;
let productId: string;

beforeAll(() => startTestDatabase());

beforeEach(async () => {
  await resetDatabase();
  shop = await seedShop();
  session = staffSession(shop.owner.id);

  const product = await testPrisma().product.create({
    data: { name: "Beard oil", unit: "bottle", costPrice: 60 },
  });
  productId = product.id;
});

const today = () => new Date().toISOString();

const buy = (quantity: number, unitCost = 60, paymentType: "CASH" | "CARD" | "CREDIT" = "CASH") =>
  addPurchase(
    jsonRequest("/api/purchases", {
      date: today(),
      paymentType,
      items: [{ productId, quantity, unitCost }],
    })
  );

const transfer = (quantity: number, fromLocation = "MAIN", toLocation = "BRANCH") =>
  addTransfer(
    jsonRequest("/api/stock/transfers", {
      date: today(),
      fromLocation,
      toLocation,
      items: [{ productId, quantity }],
    })
  );

/** What the balances screen says for our one product. */
async function balanceOf() {
  const rows = await (await balances(getRequest("/api/stock/balances"))).json();
  const list = Array.isArray(rows) ? rows : rows.rows ?? rows.products ?? [];
  return list.find((r: { id?: string; productId?: string }) => (r.id ?? r.productId) === productId);
}

describe("the product list", () => {
  it("is the owner's to add to, and everyone's to read", async () => {
    session = staffSession(shop.cashier.id, "CASHIER");
    expect((await listProducts(getRequest("/api/products"))).status).toBe(200);
    expect((await addProduct(jsonRequest("/api/products", { name: "Wax", unit: "tin" }))).status).toBe(401);
  });

  it("refuses a product with no name", async () => {
    expect((await addProduct(jsonRequest("/api/products", { name: "  " }))).status).toBe(400);
  });

  it("refuses a second product with the same name", async () => {
    expect((await addProduct(jsonRequest("/api/products", { name: "Beard oil" }))).status).toBe(409);
  });
});

describe("buying stock", () => {
  it("puts what was bought on the main shelf", async () => {
    expect((await buy(12)).status).toBe(201);

    const row = await balanceOf();
    expect(row.main).toBe(12);
    expect(row.branch ?? 0).toBe(0);
  });

  it("pays for it out of the day's money when it was paid for on the spot", async () => {
    await buy(10, 60, "CASH");
    const expense = await testPrisma().expense.findFirst();
    expect(expense?.amount).toBe(600);
  });

  it("owes the supplier instead when it was taken on credit", async () => {
    await buy(10, 60, "CREDIT");
    expect(await testPrisma().expense.count()).toBe(0);
  });

  it("is not the cashier's to record", async () => {
    session = staffSession(shop.cashier.id, "CASHIER");
    expect((await buy(10)).status).toBe(401);
  });
});

describe("moving stock to the branch", () => {
  it("moves it without creating any", async () => {
    await buy(20);
    expect((await transfer(8)).status).toBe(201);

    const row = await balanceOf();
    expect(row.main).toBe(12);
    expect(row.branch).toBe(8);
    // Nothing appeared or vanished in the move.
    expect(row.main + row.branch).toBe(20);
  });

  it("refuses to issue more than the shelf holds", async () => {
    await buy(5);
    const res = await transfer(9);
    expect(res.status).toBe(409);
    expect((await res.json()).error).toBe("insufficient_stock");

    const row = await balanceOf();
    expect(row.main).toBe(5);
  });

  it("refuses a move from a place to itself", async () => {
    await buy(5);
    expect((await transfer(1, "MAIN", "MAIN")).status).toBe(400);
  });

  it("can send stock back from the branch", async () => {
    await buy(10);
    await transfer(6);
    expect((await transfer(2, "BRANCH", "MAIN")).status).toBe(201);

    const row = await balanceOf();
    expect(row.main).toBe(6);
    expect(row.branch).toBe(4);
  });
});

describe("using stock on the floor", () => {
  it("takes what was used off the branch shelf", async () => {
    await buy(10);
    await transfer(10);

    const res = await recordUsage(
      jsonRequest("/api/inventory/usage", { productId, quantity: 3, date: today(), location: "BRANCH" })
    );
    expect(res.status).toBe(201);

    const row = await balanceOf();
    expect(row.branch).toBe(7);
  });
});

describe("counting what is actually there", () => {
  it("records the count, and what it differed from", async () => {
    await buy(10);
    await transfer(10);

    const res = await addCount(
      jsonRequest("/api/stock/counts", {
        date: today(),
        location: "BRANCH",
        items: [{ productId, countedQty: 8 }],
      })
    );
    expect(res.status).toBe(201);

    // Two bottles are missing, and the shelf now says what was found.
    const row = await balanceOf();
    expect(row.branch).toBe(8);
  });

  it("is the owner's job", async () => {
    session = staffSession(shop.cashier.id, "CASHIER");
    const res = await addCount(
      jsonRequest("/api/stock/counts", { date: today(), location: "BRANCH", items: [{ productId, countedQty: 1 }] })
    );
    expect(res.status).toBe(401);
  });
});

describe("the warehouse and customers", () => {
  it("is closed to them entirely", async () => {
    const login = await seedCustomerLogin(shop.customer.id);
    session = customerSession(login.id, login.customerId);

    expect((await listProducts(getRequest("/api/products"))).status).toBe(401);
    expect((await balances(getRequest("/api/stock/balances"))).status).toBe(401);
    expect((await transfer(1)).status).toBe(401);
  });
});
