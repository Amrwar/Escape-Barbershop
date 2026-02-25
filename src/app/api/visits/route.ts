import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/auth";
import { visitSchema } from "@/lib/validations";

export async function GET(req: NextRequest) {
  try {
    const session = await requireAuth();
    const { searchParams } = req.nextUrl;
    const barberId = searchParams.get("barberId");
    const from = searchParams.get("from");
    const to = searchParams.get("to");

    // Cashiers only see their own visits
    const effectiveBarberId =
      session.user.role === "CASHIER" ? session.user.barberId : barberId;

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
    await requireAuth();
    const body = await req.json();
    const data = visitSchema.parse(body);

    // Compute total from items
    const subtotal = data.items.reduce(
      (sum, item) => sum + item.priceAtTime * item.quantity,
      0
    );
    const discountAmount = (subtotal * (data.discount ?? 0)) / 100;
    const total = subtotal - discountAmount;

    // Derive cash/card amounts
    let cashAmount: number;
    let cardAmount: number;
    if (data.paymentMethod === "CASH") {
      cashAmount = total;
      cardAmount = 0;
    } else if (data.paymentMethod === "CARD") {
      cashAmount = 0;
      cardAmount = total;
    } else {
      // MIXED — use provided values or default split
      cashAmount = data.cashAmount ?? 0;
      cardAmount = data.cardAmount ?? total - cashAmount;
    }

    // Link to open cash drawer session for CASH or MIXED visits
    let sessionId: string | null = null;
    try {
      if (data.paymentMethod === "CASH" || data.paymentMethod === "MIXED") {
        const openSession = await prisma.cashDrawerSession.findFirst({
          where: { status: "OPEN" },
          select: { id: true },
        });
        if (openSession) sessionId = openSession.id;
      }
    } catch {
      // Cash drawer unavailable — visit is still saved without session link
    }

    const visit = await prisma.visit.create({
      data: {
        customerId: data.customerId,
        barberId: data.barberId,
        visitAt: data.visitAt ? new Date(data.visitAt) : new Date(),
        paymentMethod: data.paymentMethod,
        discount: data.discount ?? 0,
        total,
        cashAmount,
        cardAmount,
        notes: data.notes || null,
        ...(sessionId ? { sessionId } : {}),
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
    return NextResponse.json(visit, { status: 201 });
  } catch (err: unknown) {
    if (err instanceof Error && err.message.includes("Unauthorized")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    console.error(err);
    return NextResponse.json({ error: "Invalid data" }, { status: 400 });
  }
}
