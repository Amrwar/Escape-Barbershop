import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireOwner } from "@/lib/auth";
import { cashMovementSchema } from "@/lib/validations";

export async function POST(req: NextRequest) {
  try {
    const authSession = await requireOwner();
    const body = await req.json();
    const data = cashMovementSchema.parse(body);

    const openSession = await prisma.cashDrawerSession.findFirst({
      where: { status: "OPEN" },
    });
    if (!openSession) {
      return NextResponse.json(
        { error: "No open cash session found" },
        { status: 404 }
      );
    }

    const movement = await prisma.cashMovement.create({
      data: {
        sessionId: openSession.id,
        type: data.type,
        amount: data.amount,
        reason: data.reason,
        createdByUserId: authSession.user.id,
      },
      include: {
        createdBy: { select: { name: true } },
      },
    });

    return NextResponse.json(movement, { status: 201 });
  } catch (err: unknown) {
    if (err instanceof Error && err.message.includes("Unauthorized")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    console.error(err);
    return NextResponse.json({ error: "Invalid data" }, { status: 400 });
  }
}
