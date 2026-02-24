import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireOwner } from "@/lib/auth";
import { closeDrawerSchema } from "@/lib/validations";

export async function POST(req: NextRequest) {
  try {
    const authSession = await requireOwner();
    const body = await req.json();
    const data = closeDrawerSchema.parse(body);

    const openSession = await prisma.cashDrawerSession.findFirst({
      where: { status: "OPEN" },
    });
    if (!openSession) {
      return NextResponse.json(
        { error: "No open cash session found" },
        { status: 404 }
      );
    }

    const closed = await prisma.cashDrawerSession.update({
      where: { id: openSession.id },
      data: {
        status: "CLOSED",
        closedAt: new Date(),
        closedByUserId: authSession.user.id,
        closingCashCounted: data.closingCashCounted,
        notes: data.notes || openSession.notes || null,
      },
    });

    return NextResponse.json(closed);
  } catch (err: unknown) {
    if (err instanceof Error && err.message.includes("Unauthorized")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    console.error(err);
    return NextResponse.json({ error: "Invalid data" }, { status: 400 });
  }
}
