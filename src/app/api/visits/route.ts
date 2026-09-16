import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/auth";
import { visitSchema } from "@/lib/validations";
import { paymentMethodName, resolvePaymentAmounts, tipPaidInCash } from "@/lib/payments";
import { recordAudit } from "@/lib/audit";

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
    const subtotal = data.items.reduce(
      (sum, item) => sum + item.priceAtTime * item.quantity,
      0
    );
    const discountAmount = (subtotal * (data.discount ?? 0)) / 100;
    const total = subtotal - discountAmount;

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
        },
        include: {
          customer: true,
          barber: true,
          items: { include: { service: true } },
        },
      });

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
