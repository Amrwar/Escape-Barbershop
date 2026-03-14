import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, requireOwner } from "@/lib/auth";
import { visitSchema } from "@/lib/validations";

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

    const subtotal = data.items.reduce(
      (sum, item) => sum + item.priceAtTime * item.quantity,
      0
    );
    const discountAmount = (subtotal * (data.discount ?? 0)) / 100;
    const total = subtotal - discountAmount;

    const tip = data.tip ?? 0;

    let cashAmount: number;
    let cardAmount: number;
    if (data.paymentMethod === "CASH") {
      cashAmount = total;
      cardAmount = 0;
    } else if (data.paymentMethod === "CARD") {
      cashAmount = 0;
      cardAmount = total;
    } else {
      cashAmount = data.cashAmount ?? 0;
      cardAmount = data.cardAmount ?? total - cashAmount;
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
          cashAmount,
          cardAmount,
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

      // Re-create card tip movement if applicable
      if (data.paymentMethod === "CARD" && tip > 0 && updated.sessionId) {
        await tx.cashMovement.create({
          data: {
            sessionId: updated.sessionId,
            type: "OUT",
            amount: tip,
            reason: `Card tip — ${updated.barber.name}`,
            createdByUserId: authSession.user.id,
            visitId: updated.id,
          },
        });
      }

      return updated;
    });

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
    await requireOwner();

    // Fetch visit first so we can clean up tip movements (including old ones without visitId)
    const visit = await prisma.visit.findUnique({
      where: { id: params.id },
      include: { barber: { select: { name: true } } },
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
                  reason: `Card tip — ${visit.barber.name}`,
                }]
              : []),
          ],
        },
      });
    }

    await prisma.visit.delete({ where: { id: params.id } });
    return NextResponse.json({ success: true });
  } catch (err: unknown) {
    if (err instanceof Error && err.message.includes("Unauthorized")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    return NextResponse.json({ error: "Error" }, { status: 400 });
  }
}
