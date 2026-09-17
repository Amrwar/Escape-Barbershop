import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/auth";
import { visitSchema } from "@/lib/validations";
import { paymentMethodName, resolvePaymentAmounts, tipPaidInCash } from "@/lib/payments";
import { recordAudit } from "@/lib/audit";
import { getBalances } from "@/lib/stock";
import { round2 } from "@/lib/finance";
import { priceLines, problemsWith, productsTotal, type PricedLine } from "@/lib/retail";

/** A refusal the cashier should read, rather than a bare "invalid data". */
class VisitError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
  }
}

export async function GET(req: NextRequest) {
  try {
    const session = await requireAuth();
    const { searchParams } = req.nextUrl;
    const barberId = searchParams.get("barberId");
    const from = searchParams.get("from");
    const to = searchParams.get("to");

    const effectiveBarberId = barberId;

    const visits = await prisma.visit.findMany({
      where: {
        ...(effectiveBarberId && { barberId: effectiveBarberId }),
        ...(from || to
          ? {
              visitAt: {
                ...(from && { gte: new Date(from) }),
                ...(to && { lte: new Date(to) }),
              },
            }
          : {}),
      },
      orderBy: { visitAt: "desc" },
      include: {
        customer: true,
        barber: true,
        items: { include: { service: true } },
      },
    });
    return NextResponse.json(visits);
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const authSession = await requireAuth();
    const body = await req.json();
    const data = visitSchema.parse(body);

    // Compute total from items
    const servicesSubtotal = data.items.reduce(
      (sum, item) => sum + item.priceAtTime * item.quantity,
      0
    );

    // Anything sold over the counter. Checked before a penny is taken: the till
    // must not sell what the shelf does not hold, or a stock figure becomes a
    // number nobody believes.
    const productLines = data.products ?? [];
    let pricedProducts: PricedLine[] = [];

    if (productLines.length > 0) {
      const products = await prisma.product.findMany({
        where: { id: { in: productLines.map((line) => line.productId) } },
        select: { id: true, name: true, isActive: true, salePrice: true, costPrice: true },
      });
      const balances = await getBalances(products.map((p) => p.id));
      const onTheShelf = Object.fromEntries(
        products.map((p) => [p.id, balances.get(p.id)?.branch ?? 0])
      );

      const problems = problemsWith(productLines, products, onTheShelf);
      if (problems.length > 0) {
        return NextResponse.json({ error: "product_problem", problems }, { status: 409 });
      }

      pricedProducts = priceLines(productLines, products);
    }

    // The discount is a percentage of the services; a product is sold at the
    // price the cashier typed, so taking a further percentage off it would
    // double-count the kindness.
    const discountAmount = (servicesSubtotal * (data.discount ?? 0)) / 100;
    const total = round2(servicesSubtotal - discountAmount + productsTotal(productLines));

    const tip = data.tip ?? 0;

    // The tip is stored separately, never inside the payment amounts.
    const amounts = resolvePaymentAmounts(data.paymentMethod, total, data);
    if (!amounts) {
      return NextResponse.json({ error: "The payment split must add up to the total" }, { status: 400 });
    }

    // Link to open cash drawer session and assign sequential receipt number
    const visit = await prisma.$transaction(async (tx) => {
      // Settling a booked appointment: it becomes this visit, once and once only.
      if (data.appointmentId) {
        const appointment = await tx.appointment.findUnique({
          where: { id: data.appointmentId },
          select: { id: true, visitId: true, status: true },
        });
        if (!appointment) throw new VisitError("That appointment no longer exists", 404);
        if (appointment.visitId) throw new VisitError("This appointment has already been rung up", 409);
        if (appointment.status === "CANCELLED") throw new VisitError("That appointment was cancelled", 409);
      }

      // Find open session
      const openSession = await tx.cashDrawerSession.findFirst({
        where: { status: "OPEN" },
        select: { id: true },
      });
      const sessionId = openSession?.id ?? null;

      // Next sequence number within the session. Deliberately max+1 rather than
      // count+1: counting reuses the number of a deleted visit, which hides the
      // gap and hands two visits the same receipt number.
      let sessionSequence: number | null = null;
      if (sessionId) {
        const highest = await tx.visit.aggregate({
          where: { sessionId },
          _max: { sessionSequence: true },
        });
        sessionSequence = (highest._max.sessionSequence ?? 0) + 1;
      }

      const newVisit = await tx.visit.create({
        data: {
          customerId: data.customerId,
          barberId: data.barberId,
          visitAt: data.visitAt ? new Date(data.visitAt) : new Date(),
          paymentMethod: data.paymentMethod,
          discount: data.discount ?? 0,
          total,
          ...amounts,
          tip,
          notes: data.notes || null,
          createdByUserId: authSession.user.id,
          ...(sessionId ? { sessionId, sessionSequence } : {}),
          items: {
            create: data.items.map((item) => ({
              serviceId: item.serviceId,
              quantity: item.quantity,
              priceAtTime: item.priceAtTime,
            })),
          },
          products: {
            create: pricedProducts.map((line) => ({
              productId: line.productId,
              name: line.name,
              quantity: line.quantity,
              unitPrice: line.unitPrice,
              unitCost: line.unitCost,
              total: line.total,
            })),
          },
        },
        include: {
          customer: true,
          barber: true,
          items: { include: { service: true } },
          products: true,
        },
      });

      // Stock leaves the branch shelf with the customer, in the same
      // transaction as the money — the two can never disagree.
      if (pricedProducts.length > 0) {
        await tx.stockMovement.createMany({
          data: pricedProducts.map((line) => ({
            productId: line.productId,
            date: newVisit.visitAt,
            location: "BRANCH" as const,
            type: "SALE" as const,
            quantity: -line.quantity,
            unitCost: line.unitCost,
            refId: newVisit.id,
            notes: `Sold on visit ${newVisit.id}`,
          })),
        });
      }

      // A tip paid by card or InstaPay: the barber is paid it in cash from the drawer
      if (!tipPaidInCash({ paymentMethod: data.paymentMethod, cashAmount: amounts.cashAmount }) && tip > 0 && sessionId) {
        await tx.cashMovement.create({
          data: {
            sessionId,
            type: "OUT",
            amount: tip,
            reason: `${paymentMethodName(data.paymentMethod)} tip — ${newVisit.barber?.name ?? ""}`,
            createdByUserId: authSession.user.id,
            visitId: newVisit.id,
          },
        });
      }

      // The appointment is now settled: it points at the visit, and the money
      // side lives on the visit alone. There is nothing to reconcile between them.
      if (data.appointmentId) {
        await tx.appointment.update({
          where: { id: data.appointmentId },
          data: { status: "COMPLETED", visitId: newVisit.id },
        });
      }

      return newVisit;
    });

    if (data.appointmentId) {
      await recordAudit(authSession, {
        action: "UPDATE",
        entity: "APPOINTMENT",
        entityId: data.appointmentId,
        amount: visit.total,
        summary: `Rang up ${visit.customer.name}'s appointment — ${visit.total.toFixed(2)} ${visit.paymentMethod}`,
        details: { visitId: visit.id },
      });
    }

    return NextResponse.json(visit, { status: 201 });
  } catch (err: unknown) {
    if (err instanceof VisitError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    if (err instanceof Error && err.message.includes("Unauthorized")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    console.error(err);
    return NextResponse.json({ error: "Invalid data" }, { status: 400 });
  }
}
