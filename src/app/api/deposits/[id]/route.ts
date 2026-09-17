import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, requireOwner } from "@/lib/auth";
import { recordAudit } from "@/lib/audit";

/**
 * What the shop does with a deposit: confirm it arrived, give it back, or keep
 * it when nobody turned up.
 *
 * Confirming is the cashier's job — they are the one watching the InstaPay
 * account while the customer is on the phone. Giving money back and keeping
 * money are the owner's, because both are decisions about somebody else's
 * money rather than bookkeeping. Every one of them is written down.
 */
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const body = await req.json().catch(() => ({}));
    const action = String(body?.action ?? "");

    // Confirming money arrived is till work; deciding to keep or return it is
    // not.
    const authSession = action === "received" ? await requireAuth() : await requireOwner();

    const booking = await prisma.appointment.findUnique({
      where: { id: params.id },
      select: {
        id: true,
        depositAmount: true,
        depositStatus: true,
        depositRef: true,
        status: true,
        customer: { select: { name: true } },
      },
    });
    if (!booking || booking.depositAmount <= 0) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    if (action === "received") {
      if (booking.depositStatus !== "EXPECTED") {
        return NextResponse.json({ error: "That deposit is not waiting to be paid" }, { status: 409 });
      }

      const updated = await prisma.appointment.update({
        where: { id: booking.id },
        data: {
          depositStatus: "RECEIVED",
          depositPaidAt: new Date(),
          depositTakenById: authSession.user.id,
          // The money is in: the chair is theirs, and no longer merely held.
          status: booking.status === "PENDING" ? "CONFIRMED" : booking.status,
          holdUntil: null,
        },
        select: { id: true, depositStatus: true, status: true },
      });

      await recordAudit(authSession, {
        action: "UPDATE",
        entity: "APPOINTMENT",
        entityId: booking.id,
        amount: booking.depositAmount,
        summary: `Deposit received from ${booking.customer.name} (${booking.depositRef ?? "—"})`,
      });

      return NextResponse.json(updated);
    }

    if (action === "refunded" || action === "forfeited") {
      if (booking.depositStatus !== "RECEIVED") {
        return NextResponse.json({ error: "There is no money held against that booking" }, { status: 409 });
      }

      const updated = await prisma.appointment.update({
        where: { id: booking.id },
        data: { depositStatus: action === "refunded" ? "REFUNDED" : "FORFEITED" },
        select: { id: true, depositStatus: true },
      });

      await recordAudit(authSession, {
        action: "UPDATE",
        entity: "APPOINTMENT",
        entityId: booking.id,
        amount: booking.depositAmount,
        summary:
          action === "refunded"
            ? `Deposit returned to ${booking.customer.name}`
            : `Deposit kept after ${booking.customer.name} did not come`,
      });

      return NextResponse.json(updated);
    }

    return NextResponse.json({ error: "Nothing to do" }, { status: 400 });
  } catch (err: unknown) {
    if (err instanceof Error && err.message.includes("Unauthorized")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    console.error("[deposits]", err);
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  }
}
