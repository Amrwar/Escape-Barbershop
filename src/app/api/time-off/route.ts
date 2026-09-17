import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/auth";

/** Time off across the shop: what has been asked for, and what stands. */
export async function GET(req: NextRequest) {
  try {
    await requireAuth();
    const status = req.nextUrl.searchParams.get("status");

    const rows = await prisma.barberTimeOff.findMany({
      where: {
        ...(status ? { status: status as never } : {}),
        endAt: { gte: new Date(Date.now() - 30 * 86_400_000) },
      },
      orderBy: [{ status: "asc" }, { startAt: "asc" }],
      take: 200,
      select: {
        id: true,
        startAt: true,
        endAt: true,
        reason: true,
        status: true,
        decidedAt: true,
        barber: { select: { id: true, name: true } },
      },
    });

    return NextResponse.json(rows);
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
}
