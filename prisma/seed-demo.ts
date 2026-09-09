/**
 * Demo data: six weeks of a plausible barbershop, so a fresh install opens on a
 * populated app instead of empty tables.
 *
 * Two safety rules, because this file points at whatever DATABASE_URL is set:
 *   - it refuses to run against a database that already holds visits, unless
 *     DEMO_FORCE=1 says otherwise;
 *   - everything it writes is derived from a fixed seed, so re-running produces
 *     the same shop rather than piling more data on top.
 */
import { PrismaClient, CommissionType } from "@prisma/client";
import type { Barber, Customer, Product, Supplier } from "@prisma/client";

const prisma = new PrismaClient();

// ----------------------------------------------------------------- randomness
// A tiny deterministic generator: the same demo shop every time.
let state = 20260908;
function rnd(): number {
  state = (state * 1103515245 + 12345) & 0x7fffffff;
  return state / 0x7fffffff;
}
const pick = <T>(xs: T[]): T => xs[Math.floor(rnd() * xs.length)];
const between = (lo: number, hi: number) => lo + Math.floor(rnd() * (hi - lo + 1));
const chance = (p: number) => rnd() < p;
const r2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

const BARBERS = [
  { name: "Abdullah", phone: "01000000001", base: 6000, commission: 12 },
  { name: "Khaled", phone: "01000000002", base: 5500, commission: 10 },
  { name: "Mohamed", phone: "01000000003", base: 5000, commission: 10 },
  { name: "Ali", phone: "01000000004", base: 4500, commission: 8 },
];

const CUSTOMERS = [
  "Ahmed Samir", "Omar Fathy", "Youssef Nabil", "Karim Adel", "Hassan Tarek",
  "Mostafa Lotfy", "Amr Zaki", "Tamer Fouad", "Sherif Magdy", "Bassem Aziz",
  "Walid Ismail", "Hany Roshdy", "Sameh Galal", "Ramy Nader", "Fady Wagih",
];

const PRODUCTS = [
  { name: "Shampoo 1L", unit: "bottle", cost: 180 },
  { name: "Hair wax", unit: "jar", cost: 120 },
  { name: "Beard oil", unit: "bottle", cost: 95 },
  { name: "Razor blades", unit: "box", cost: 60 },
  { name: "Towels", unit: "pcs", cost: 45 },
  { name: "Hair dye base", unit: "tube", cost: 210 },
];

const SUPPLIERS = [
  { name: "Cairo Salon Supplies", phone: "0227000001" },
  { name: "Nile Beauty Wholesale", phone: "0227000002" },
];

const EXPENSE_REASONS = [
  "Rent", "Electricity", "Water", "Cleaning supplies", "Coffee for customers",
  "Internet", "Equipment repair", "Waste collection",
];

async function main() {
  const existingVisits = await prisma.visit.count();
  if (existingVisits > 0 && process.env.DEMO_FORCE !== "1") {
    console.log(
      `Refusing to seed demo data: this database already holds ${existingVisits} visits.\n` +
        "Set DEMO_FORCE=1 if you really mean to add demo data to it."
    );
    return;
  }

  const owner = await prisma.user.findFirst({ where: { role: "OWNER" } });
  if (!owner) {
    console.log("Run the main seed first (npm run db:seed) — no owner account exists yet.");
    return;
  }
  const cashier = await prisma.user.findFirst({ where: { role: "CASHIER" } });

  const services = await prisma.service.findMany({ where: { isActive: true } });
  if (services.length === 0) {
    console.log("Run the main seed first (npm run db:seed) — no services exist yet.");
    return;
  }

  console.log("Seeding demo data...");

  // ------------------------------------------------------------------ people
  const barbers: Barber[] = [];
  for (const b of BARBERS) {
    const existing = await prisma.barber.findFirst({ where: { name: b.name } });
    const barber =
      existing ??
      (await prisma.barber.create({ data: { name: b.name, phone: b.phone, isActive: true } }));
    await prisma.barberSalarySettings.upsert({
      where: { barberId: barber.id },
      update: {},
      create: {
        barberId: barber.id,
        baseSalary: b.base,
        commissionType: CommissionType.PERCENT,
        commissionValue: b.commission,
      },
    });
    barbers.push(barber);
  }

  const customers: Customer[] = [];
  for (const name of CUSTOMERS) {
    const existing = await prisma.customer.findFirst({ where: { name } });
    customers.push(
      existing ??
        (await prisma.customer.create({
          data: { name, phone: `010${between(10000000, 99999999)}` },
        }))
    );
  }
  const walkIn =
    (await prisma.customer.findFirst({ where: { name: "Walk-in" } })) ??
    (await prisma.customer.create({ data: { name: "Walk-in" } }));

  // --------------------------------------------------------------- warehouse
  const products: Product[] = [];
  for (const p of PRODUCTS) {
    const existing = await prisma.product.findFirst({ where: { name: p.name } });
    products.push(
      existing ??
        (await prisma.product.create({
          data: { name: p.name, unit: p.unit, costPrice: p.cost },
        }))
    );
  }

  const suppliers: Supplier[] = [];
  for (const s of SUPPLIERS) {
    const existing = await prisma.supplier.findFirst({ where: { name: s.name } });
    suppliers.push(
      existing ?? (await prisma.supplier.create({ data: { name: s.name, phone: s.phone } }))
    );
  }

  // A cash purchase, a visa purchase and a credit one, so the supplier account
  // and all three payment paths have something in them.
  const DAYS = 42;
  // Clamped to the past: the container clock may be hours ahead of whoever
  // seeded the data, and a session opened in the future would take no visits.
  const now = new Date();
  const dayStart = (daysAgo: number, hour: number, minute = 0) => {
    const d = new Date();
    d.setDate(d.getDate() - daysAgo);
    d.setHours(hour, minute, 0, 0);
    const latest = new Date(now.getTime() - 90 * 60 * 1000);
    return d > latest ? latest : d;
  };

  const purchasePlans: { daysAgo: number; type: "CASH" | "CARD" | "CREDIT"; supplier: number }[] = [
    { daysAgo: 40, type: "CASH", supplier: 0 },
    { daysAgo: 26, type: "CARD", supplier: 1 },
    { daysAgo: 12, type: "CREDIT", supplier: 0 },
    { daysAgo: 4, type: "CREDIT", supplier: 1 },
  ];

  for (const plan of purchasePlans) {
    const date = dayStart(plan.daysAgo, 11);
    const lines = products.slice(0, between(2, 4)).map((p) => {
      const quantity = between(3, 12);
      const unitCost = p.costPrice;
      return { productId: p.id, quantity, unitCost, total: r2(quantity * unitCost) };
    });
    const total = r2(lines.reduce((s, l) => s + l.total, 0));
    const supplier = suppliers[plan.supplier];

    let expenseId: string | null = null;
    if (plan.type !== "CREDIT") {
      const expense = await prisma.expense.create({
        data: {
          date,
          amount: total,
          reason: `Purchase - ${supplier.name}`,
          paymentMethod: plan.type === "CARD" ? "CARD" : "CASH",
          category: "PURCHASE",
        },
      });
      expenseId = expense.id;
    }

    const invoice = await prisma.purchaseInvoice.create({
      data: {
        number: `INV-${1000 + plan.daysAgo}`,
        supplierId: supplier.id,
        date,
        paymentType: plan.type,
        total,
        expenseId,
        items: { create: lines },
      },
      include: { items: true },
    });

    await prisma.stockMovement.createMany({
      data: invoice.items.map((i) => ({
        productId: i.productId,
        date,
        location: "MAIN" as const,
        type: "PURCHASE" as const,
        quantity: i.quantity,
        unitCost: i.unitCost,
        refId: invoice.id,
      })),
    });
  }

  // part payment against one credit invoice, so a balance is still outstanding
  const creditSupplier = suppliers[0];
  const payDate = dayStart(6, 13);
  const payExpense = await prisma.expense.create({
    data: {
      date: payDate,
      amount: 1500,
      reason: `Supplier payment - ${creditSupplier.name}`,
      paymentMethod: "CASH",
      category: "SUPPLIER_PAYMENT",
    },
  });
  await prisma.supplierPayment.create({
    data: {
      supplierId: creditSupplier.id,
      date: payDate,
      amount: 1500,
      paymentMethod: "CASH",
      expenseId: payExpense.id,
    },
  });

  // stock issued from the main store to the branch, twice
  for (const daysAgo of [30, 10]) {
    const date = dayStart(daysAgo, 10);
    const lines = products.slice(0, 3).map((p) => ({ productId: p.id, quantity: between(1, 4) }));
    const transfer = await prisma.stockTransfer.create({
      data: {
        number: `ISS-${100 + daysAgo}`,
        date,
        fromLocation: "MAIN",
        toLocation: "BRANCH",
        items: { create: lines },
      },
      include: { items: true },
    });
    await prisma.stockMovement.createMany({
      data: transfer.items.flatMap((i) => [
        { productId: i.productId, date, location: "MAIN" as const, type: "TRANSFER_OUT" as const, quantity: -i.quantity, refId: transfer.id },
        { productId: i.productId, date, location: "BRANCH" as const, type: "TRANSFER_IN" as const, quantity: i.quantity, refId: transfer.id },
      ]),
    });
  }

  // consumption on the floor
  for (const daysAgo of [28, 21, 14, 7, 3]) {
    const date = dayStart(daysAgo, 18);
    const product = pick(products);
    const usage = await prisma.productUsage.create({
      data: { productId: product.id, quantity: 1, location: "BRANCH", date, notes: "Daily use" },
    });
    await prisma.stockMovement.create({
      data: { productId: product.id, date, location: "BRANCH", type: "USAGE", quantity: -1, refId: usage.id },
    });
  }

  // ------------------------------------------------------ days of real trading
  let visitCount = 0;
  let discountCount = 0;

  for (let daysAgo = DAYS; daysAgo >= 0; daysAgo--) {
    const opened = dayStart(daysAgo, 11, between(0, 25));
    const isToday = daysAgo === 0;
    // one closed session per past day, and today's left open
    const openingCash = between(0, 3) * 100;

    const session = await prisma.cashDrawerSession.create({
      data: {
        openedAt: opened,
        openingCash,
        openedByUserId: chance(0.5) && cashier ? cashier.id : owner.id,
        status: isToday ? "OPEN" : "CLOSED",
      },
    });

    const visitsToday = daysAgo % 7 === 5 ? between(14, 22) : between(6, 15);
    let cashTaken = 0;

    // the shop trades from opening until closing, or until now on the open day
    const closes = isToday
      ? now.getTime()
      : Math.min(opened.getTime() + 11 * 60 * 60 * 1000, now.getTime());
    const span = Math.max(closes - opened.getTime(), 60 * 60 * 1000);

    for (let n = 1; n <= visitsToday; n++) {
      const at = new Date(opened.getTime() + Math.floor((span * n) / (visitsToday + 1)));
      if (at > now) break;

      const chosen: typeof services = [];
      const lineCount = chance(0.35) ? 2 : chance(0.15) ? 3 : 1;
      for (let i = 0; i < lineCount; i++) {
        const s = pick(services);
        if (!chosen.find((c) => c.id === s.id)) chosen.push(s);
      }
      const items = chosen.map((s) => ({
        serviceId: s.id,
        quantity: 1,
        priceAtTime: s.defaultPrice > 0 ? s.defaultPrice : between(2, 12) * 50,
      }));
      const subtotal = r2(items.reduce((sum, i) => sum + i.priceAtTime * i.quantity, 0));

      // most visits pay in full; a few carry a discount, one in a while a free one
      const discount = chance(0.08) ? (chance(0.2) ? 100 : pick([10, 15, 20, 25, 50])) : 0;
      if (discount > 0) discountCount++;
      const total = r2(subtotal - (subtotal * discount) / 100);

      const method = chance(0.55) ? "CARD" : chance(0.85) ? "CASH" : "MIXED";
      const tip = method === "CASH" && chance(0.2) ? between(1, 4) * 25 : 0;
      let cashAmount = 0;
      let cardAmount = 0;
      if (method === "CASH") cashAmount = total;
      else if (method === "CARD") cardAmount = total;
      else {
        cashAmount = r2(Math.floor(total / 2));
        cardAmount = r2(total - cashAmount);
      }
      cashTaken += cashAmount + tip;

      await prisma.visit.create({
        data: {
          customerId: chance(0.45) ? walkIn.id : pick(customers).id,
          barberId: pick(barbers).id,
          visitAt: at,
          paymentMethod: method as "CASH" | "CARD" | "MIXED",
          discount,
          total,
          cashAmount,
          cardAmount,
          tip,
          notes: discount === 100 ? "On the house" : discount > 0 ? "Regular customer" : null,
          sessionId: session.id,
          sessionSequence: n,
          createdByUserId: chance(0.5) && cashier ? cashier.id : owner.id,
          items: { create: items },
        },
      });
      visitCount++;
    }

    // a petty cash movement now and then
    if (chance(0.25)) {
      await prisma.cashMovement.create({
        data: {
          sessionId: session.id,
          type: chance(0.5) ? "IN" : "OUT",
          amount: between(1, 6) * 50,
          reason: chance(0.5) ? "Change float" : "Petty cash",
          createdByUserId: owner.id,
          createdAt: new Date(Math.min(opened.getTime() + 3 * 60 * 60 * 1000, now.getTime())),
        },
      });
    }

    // an expense on roughly half the days, cash or visa
    if (chance(0.5)) {
      await prisma.expense.create({
        data: {
          date: new Date(Math.min(opened.getTime() + 4 * 60 * 60 * 1000, now.getTime())),
          amount: between(1, 12) * 50,
          reason: pick(EXPENSE_REASONS),
          paymentMethod: chance(0.75) ? "CASH" : "CARD",
        },
      });
    }

    if (!isToday) {
      // counted cash usually matches; occasionally it is out by a little
      const counted = chance(0.85)
        ? r2(openingCash + cashTaken)
        : r2(openingCash + cashTaken + pick([-50, -20, 20, 50]));
      await prisma.cashDrawerSession.update({
        where: { id: session.id },
        data: {
          status: "CLOSED",
          closedAt: new Date(Math.min(opened.getTime() + 11 * 60 * 60 * 1000, now.getTime())),
          closedByUserId: owner.id,
          closingCashCounted: counted,
        },
      });
    }
  }

  // ------------------------------------------------------------------ payroll
  for (const barber of barbers.slice(0, 3)) {
    if (chance(0.7)) {
      await prisma.advance.create({
        data: {
          barberId: barber.id,
          date: dayStart(between(5, 25), 15),
          amount: between(2, 10) * 100,
          paymentMethod: chance(0.8) ? "CASH" : "CARD",
          notes: "Advance on salary",
        },
      });
    }
    if (chance(0.5)) {
      await prisma.penalty.create({
        data: {
          barberId: barber.id,
          date: dayStart(between(5, 25), 15),
          amount: between(1, 3) * 100,
          reason: pick(["Late arrival", "Missed appointment", "Uniform"]),
        },
      });
    }
    if (chance(0.6)) {
      await prisma.attendance.create({
        data: { barberId: barber.id, date: new Date(dayStart(between(5, 25), 0).toDateString()) },
      }).catch(() => undefined);
    }
  }

  // ---------------------------------------------------------------- stocktake
  const balances = await prisma.stockMovement.groupBy({
    by: ["productId"],
    where: { location: "BRANCH" },
    _sum: { quantity: true },
  });
  if (balances.length > 0) {
    const date = dayStart(2, 20);
    const items = balances.map((b) => {
      const systemQty = b._sum.quantity ?? 0;
      const product = products.find((p) => p.id === b.productId);
      // one product short, the rest matching
      const countedQty = chance(0.25) ? Math.max(0, systemQty - 1) : systemQty;
      return { productId: b.productId, systemQty, countedQty, unitCost: product?.costPrice ?? 0 };
    });
    const count = await prisma.stockCount.create({
      data: { date, location: "BRANCH", notes: "Monthly count", items: { create: items } },
      include: { items: true },
    });
    const adjustments = count.items
      .filter((i) => i.countedQty !== i.systemQty)
      .map((i) => ({
        productId: i.productId,
        date,
        location: "BRANCH" as const,
        type: "ADJUSTMENT" as const,
        quantity: r2(i.countedQty - i.systemQty),
        unitCost: i.unitCost,
        refId: count.id,
      }));
    if (adjustments.length > 0) await prisma.stockMovement.createMany({ data: adjustments });
  }

  // a visa rate, so the commission columns are not all zero
  await prisma.setting.upsert({
    where: { key: "visa_commission_percent" },
    update: { value: "2.5" },
    create: { key: "visa_commission_percent", value: "2.5" },
  });

  const [sessions, expenses, invoices] = await Promise.all([
    prisma.cashDrawerSession.count(),
    prisma.expense.count(),
    prisma.purchaseInvoice.count(),
  ]);

  console.log(
    `Demo data ready: ${visitCount} visits (${discountCount} discounted) across ${sessions} drawer ` +
      `sessions, ${expenses} expenses, ${invoices} purchase invoices, ${products.length} products, ` +
      `${barbers.length} barbers, ${customers.length} customers. Visa commission set to 2.5%.`
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
