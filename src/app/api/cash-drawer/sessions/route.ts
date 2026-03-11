import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/auth";

export async function GET() {
  try {
    await requireAuth();

    const sessions = await prisma.cashDrawerSession.findMany({
      orderBy: { openedAt: "desc" },
      select: {
        id: true,
        openedAt: true,
        closedAt: true,
        status: true,
        openingCash: true,
        closingCashCounted: true,
        openedBy: { select: { name: true } },
        _count: { select: { visits: true } },
      },
    });

    return NextResponse.json(sessions);
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
}
