import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, requireOwner, requireOwnerOrCashier } from "@/lib/auth";
import { visitSchema } from "@/lib/validations";
import { recordAudit, describeVisit } from "@/lib/audit";
import { paymentMethodName, resolvePaymentAmounts, tipPaidInCash } from "@/lib/payments";

export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    await requireAuth();
    const visit = await prisma.visit.findUnique({
      where: { id: params.id },
      include: {
        customer: true,
        barber: true,
        items: { include: { service: true } },
      },
    });
    if (!visit) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    return NextResponse.json(visit);
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const authSession = await requireOwner();
    const body = await req.json();
    const data = visitSchema.parse(body);

    // Snapshot the visit before it is rewritten, for the activity trail.
    const before = await prisma.visit.findUnique({
      where: { id: params.id },
      include: {
        customer: { select: { name: true } },
        barber: { select: { name: true } },
        items: { include: { service: { select: { name: true } } } },
      },
    });

    const subtotal = data.items.reduce(
      (sum, item) => sum + item.priceAtTime * item.quantity,
      0
    );
    const discountAmount = (subtotal * (data.discount ?? 0)) / 100;
    const total = subtotal - discountAmount;

    const tip = data.tip ?? 0;

    const amounts = resolvePaymentAmounts(data.paymentMethod, total, data);
    if (!amounts) {
      return NextResponse.json({ error: "The payment split must add up to the total" }, { status: 400 });
    }

    const visit = await prisma.$transaction(async (tx) => {
      // Delete existing items and recreate
      await tx.visitItem.deleteMany({ where: { visitId: params.id } });

      // Remove any previously auto-created tip movement for this visit
      await tx.cashMovement.deleteMany({ where: { visitId: params.id } });

      const updated = await tx.visit.update({
        where: { id: params.id },
        data: {
          customerId: data.customerId,
          barberId: data.barberId,
          visitAt: data.visitAt ? new Date(data.visitAt) : undefined,
          paymentMethod: data.paymentMethod,
          discount: data.discount ?? 0,
          total,
          ...amounts,
          tip,
          notes: data.notes || null,
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

      // Re-create the drawer payout for a tip that did not come in as cash
      if (!tipPaidInCash({ paymentMethod: data.paymentMethod, cashAmount: amounts.cashAmount }) && tip > 0 && updated.sessionId) {
        await tx.cashMovement.create({
          data: {
            sessionId: updated.sessionId,
            type: "OUT",
            amount: tip,
            reason: `${paymentMethodName(data.paymentMethod)} tip — ${updated.barber?.name ?? ""}`,
            createdByUserId: authSession.user.id,
            visitId: updated.id,
          },
        });
      }

      return updated;
    });

    if (before) {
      await recordAudit(authSession, {
        action: "UPDATE",
        entity: "VISIT",
        entityId: visit.id,
        amount: visit.total,
        summary: `${describeVisit(before)} -> ${total.toFixed(2)} ${data.paymentMethod}`,
        details: { before: describeVisit(before), beforeTotal: before.total, afterTotal: total },
      });
    }

    return NextResponse.json(visit);
  } catch (err: unknown) {
    if (err instanceof Error && err.message.includes("Unauthorized")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    console.error(err);
    return NextResponse.json({ error: "Invalid data" }, { status: 400 });
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const authSession = await requireOwnerOrCashier();

    // Fetch visit first so we can clean up tip movements (including old ones
    // without visitId) and keep a readable record of what was removed.
    const visit = await prisma.visit.findUnique({
      where: { id: params.id },
      include: {
        barber: { select: { name: true } },
        customer: { select: { name: true } },
        items: { include: { service: { select: { name: true } } } },
        products: true,
      },
    });

    if (visit) {
      await prisma.cashMovement.deleteMany({
        where: {
          OR: [
            { visitId: params.id },
            // Backwards-compat: old movements before visitId was added
            ...(visit.sessionId && visit.tip > 0
              ? [{
                  sessionId: visit.sessionId,
                  visitId: null,
                  amount: visit.tip,
                  reason: `Card tip — ${visit.barber?.name ?? ""}`,
                }]
              : []),
          ],
        },
      });
    }

    // Anything sold on it goes back on the shelf. The movements are removed
    // rather than reversed with a second entry: the visit is being taken off the
    // books entirely, and the activity log below is what remembers it happened.
    if (visit && visit.products.length > 0) {
      await prisma.stockMovement.deleteMany({ where: { refId: params.id, type: "SALE" } });
    }

    await prisma.visit.delete({ where: { id: params.id } });

    if (visit) {
      await recordAudit(authSession, {
        action: "DELETE",
        entity: "VISIT",
        entityId: visit.id,
        amount: visit.total,
        summary: describeVisit(visit),
        details: {
          visitAt: visit.visitAt,
          sessionId: visit.sessionId,
          sessionSequence: visit.sessionSequence,
          paymentMethod: visit.paymentMethod,
          total: visit.total,
          tip: visit.tip,
          discount: visit.discount,
          items: visit.items.map((i) => ({
            service: i.service?.name,
            quantity: i.quantity,
            price: i.priceAtTime,
          })),
          products: visit.products.map((p) => ({
            product: p.name,
            quantity: p.quantity,
            price: p.unitPrice,
          })),
        },
      });
    }

    return NextResponse.json({ success: true });
  } catch (err: unknown) {
    if (err instanceof Error && err.message.includes("Unauthorized")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    return NextResponse.json({ error: "Error" }, { status: 400 });
  }
}
