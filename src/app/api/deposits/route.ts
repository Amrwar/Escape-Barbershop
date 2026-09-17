import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/auth";
import { summarise } from "@/lib/deposits";
import { releaseLapsedHolds } from "@/lib/deposits-server";

/**
 * The deposits the shop is waiting on, and the money it is holding.
 *
 * "Held" is the figure to reconcile against the bank: money that has arrived
 * for work that has not happened. It is deliberately not in the takings, and
 * this is the screen that says so.
 */
export async function GET(req: NextRequest) {
  try {
    await requireAuth();
    // Reading the list is as good a moment as any to let go of chairs whose
    // deposit never came.
    await releaseLapsedHolds();

    const status = req.nextUrl.searchParams.get("status");
    const bookings = await prisma.appointment.findMany({
      where: {
        depositAmount: { gt: 0 },
        ...(status ? { depositStatus: status as never } : {}),
      },
      orderBy: { startAt: "asc" },
      take: 200,
      select: {
        id: true,
        startAt: true,
        status: true,
        totalPrice: true,
        depositAmount: true,
        depositStatus: true,
        depositRef: true,
        depositPaidAt: true,
        holdUntil: true,
        customer: { select: { id: true, name: true, phone: true } },
        barber: { select: { name: true } },
        services: { select: { serviceName: true } },
      },
    });

    return NextResponse.json({
      deposits: bookings.map((b) => ({
        ...b,
        services: b.services.map((s) => s.serviceName),
      })),
      summary: summarise(
        bookings.map((b) => ({ amount: b.depositAmount, status: (b.depositStatus ?? "EXPECTED") as never }))
      ),
    });
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
}
